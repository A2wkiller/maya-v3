#!/usr/bin/env python3
"""maya-router: OpenAI-compatible fallback router. Non-private turns fall through providers on
429/5xx/timeout. A turn is private only when the latest user message contains the word "private":
then only NVIDIA (Cloud ultra) is used, with retries. Keys are read from ~/prov/*.key. No content is logged."""
import sys
sys.path.insert(0,'/home/maya/maya-ops')
from private_local import serve_private
import http.server, http.client, json, os, re, ssl, sys, time, threading, urllib.parse
P = os.path.expanduser("~/prov/")
def key(n):
    try: return open(P + n).read().strip()
    except Exception: return ""
CF = open(P + "cf.account").read().strip() if os.path.exists(P + "cf.account") else ""
CHAIN = [  # name, base, model, keyfile
  ("nvidia",     "https://integrate.api.nvidia.com/v1", "nvidia/nemotron-3-ultra-550b-a55b", "nvidia.key"),
  ("openrouter", "https://openrouter.ai/api/v1", "nvidia/nemotron-3-ultra-550b-a55b:free", "openrouter.key"),
  ("gemini",     "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-3-flash-preview", "gemini.key"),
  ("cloudflare", "https://api.cloudflare.com/client/v4/accounts/%s/ai/v1" % CF, "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "cloudflare.key"),
  ("groq",       "https://api.groq.com/openai/v1", "openai/gpt-oss-120b", "groq.key"),
]
LIGHT = ("nvidia-fast", "https://integrate.api.nvidia.com/v1", "nvidia/nemotron-3.5-lightning-30b-a3b", "nvidia.key")
ULTRA, ORR, GEM, CFL, GRQ = CHAIN[0], CHAIN[1], CHAIN[2], CHAIN[3], CHAIN[4]
CHAIN_HEAVY = [ULTRA, GEM, ORR, LIGHT, GRQ, CFL]
CHAIN_SIMPLE = [LIGHT, GEM, GRQ, CFL, ORR, ULTRA]
HEAVY_KW = re.compile(r"build|code|research|analy[sz]|plan|design|write|draft|compare|audit|debug|fix|report|email|mail|deep|step by step|create|implement|summar|spreadsheet|document|calendar|briefing|routine|schedule|install|deploy|server|think hard|presentation|essay|translate|course|form", re.I)
def last_user_text(body):
    for m in reversed(body.get("messages", [])):
        if m.get("role") == "user":
            c = m.get("content")
            if isinstance(c, list):
                if any(isinstance(x, dict) and x.get("type") != "text" for x in c): return None
                c = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
            return c or ""
    return ""
AFFIRM = re.compile(r"^\W*(yes|yep|yeah|ok|okay|sure|do it|go ahead|go on|continue|proceed|1|2|3|a|b|c|approve|approved|please do)\W*$", re.I)
def is_simple(body):
    t = last_user_text(body)
    if t is None: return False
    t = t.rsplit("Current user message:\n",1)[-1]
    t = t.split("Current date and time for the user")[0].strip()
    paras = [x for x in re.split(r"\n\s*\n", t) if x.strip()]
    last = paras[-1].strip() if paras else ""
    msgs = body.get("messages", [])
    li = max([i for i, m in enumerate(msgs) if m.get("role") == "user"] or [0])
    if any(m.get("role") == "tool" or m.get("tool_calls") for m in msgs[li:]): return False
    if AFFIRM.match(last) or last.lower().startswith("assistant:"): return False
    if "Assistant:" in t and (len(last) <= 60 or re.search(r"\b(no|nope|stop|cancel|leave it|never ?mind|that|this|it|them|those|same|again|before|earlier|above)\b", last, re.I)): return False  # follow-up that depends on history
    return 0 < len(last) <= 200 and not HEAVY_KW.search(last)
def sanitize(name, body):
    b = json.loads(json.dumps(body))
    for k_ in ("options", "think", "keep_alive"): b.pop(k_, None)  # Ollama-only fields (Hermes sends them)
    for m in b.get("messages", []):
        if name in ("groq", "cloudflare", "openrouter"):
            m.pop("reasoning_content", None); m.pop("reasoning", None)
        if name in ("groq", "cloudflare") and isinstance(m.get("content"), list) and all(isinstance(x, dict) and x.get("type") == "text" for x in m["content"]):
            m["content"] = "\n".join(x.get("text", "") for x in m["content"])
        if name in ("cloudflare", "groq") and m.get("content") is None and m.get("role") == "assistant":
            m["content"] = ""
        if name == "gemini" and m.get("role") == "assistant":
            for tc in m.get("tool_calls") or []:
                tc["extra_content"] = {"google": {"thought_signature": "skip_thought_signature_validator"}}
    return b
FIRST_BYTE = 60
cool = {}   # provider -> until ts
lock = threading.Lock()
LOG = os.path.expanduser("~/maya-ops/router.log")
def log(s):
    with open(LOG, "a") as f: f.write(time.strftime("%F %T ") + s + "\n")
PRIV = re.compile(r"\bprivate\b", re.I)
def is_private(body):
    for m in reversed(body.get("messages", [])):
        if m.get("role") == "user":
            c = m.get("content")
            if isinstance(c, list): c = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
            return bool(PRIV.search(c or ""))
    return False
def is_local(body):
    t=last_user_text(body)
    if t is None:return False
    # Model runtime may flatten the current conversation in one user payload.
    # Use only its final paragraph; history mentioning local cannot opt this turn in.
    t=t.split("Current date and time for the user")[0].strip()
    paragraphs=[x.strip() for x in re.split(r"\n\s*\n",t) if x.strip()]
    current=paragraphs[-1] if paragraphs else ""
    return bool(re.search(r"\blocal\b",current,re.I)) and not re.search(r"\b(?:not|don't|do not|no)\s+(?:use\s+)?local\b",current,re.I)

def try_provider(p, body):
    name, base, model, kf = p
    if name in os.environ.get('FORCE_FAIL','').split(','): raise RuntimeError('forced')
    u = urllib.parse.urlparse(base)
    b = sanitize(name, body); b["model"] = model
    data = json.dumps(b).encode()
    c = http.client.HTTPSConnection(u.netloc, timeout=FIRST_BYTE, context=ssl.create_default_context())
    c.request("POST", u.path + "/chat/completions", data, {"Authorization": "Bearer " + key(kf),
              "Content-Type": "application/json", "User-Agent": "maya-router/1"})
    return c, c.getresponse()
class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def send_json(self, code, obj):
        d = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(d))); self.end_headers(); self.wfile.write(d)
    def do_GET(self):
        if self.path.rstrip("/").endswith("/models"):
            self.send_json(200, {"object": "list", "data": [{"id": "maya-auto", "object": "model", "owned_by": "maya"}]})
        else: self.send_json(200, {"ok": True})
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        try: body = json.loads(self.rfile.read(n))
        except Exception: return self.send_json(400, {"error": {"message": "bad json"}})
        # Explicit local wins over private. Never route this branch to cloud.
        route = self.headers.get("X-Maya-Route", "")
        if route not in ("", "local", "private", "fast"):
            return self.send_json(400, {"error":{"message":"invalid route marker"}})
        if route == "local":return serve_private(self,body)
        if not route and is_local(body):
            return self.send_json(400, {"error":{"message":"Local routing needs the current-request marker; no cloud request was made"}})
        priv = route == "private" if route else is_private(body)
        simple = (not priv) and is_simple(body)
        has_images=any(isinstance(m.get('content'),list) and any(isinstance(c,dict) and c.get('type')=='image_url' for c in m['content']) for m in body.get('messages',[]))
        if has_images and priv:return self.send_json(400, {'error':{'message':'Current private route is text-only. Frames were not sent to another provider.'}})
        chain = [GEM] if has_images else ([ULTRA] if priv else (CHAIN_SIMPLE if simple else CHAIN_HEAVY))
        _t = last_user_text(body)
        if os.path.exists("/home/maya/maya-ops/dumpuser"): open("/home/maya/maya-ops/lastuser.txt", "w").write(_t or "")
        log("tier %s ulen=%s nmsg=%d roles=%s" % ("private" if priv else "simple" if simple else "heavy", None if _t is None else len(_t), len(body.get("messages", [])), "".join(m.get("role","?")[0] for m in body.get("messages", [])[-6:])))
        retries = [0, 3, 8, 15] if priv else [0]
        def retries_for(pp): return retries if (priv or pp[0] != "nvidia") and priv else ([0] if pp[0] != "nvidia" else [0, 3, 3])
        last = None
        for p in chain:
            if not priv and cool.get(p[0], 0) > time.time() and p is not chain[-1]:
                log("skip %s (cooldown)" % p[0]); continue
            for wait in retries_for(p):
                time.sleep(wait)
                t0 = time.time()
                try:
                    c, r = try_provider(p, body)
                except Exception as e:
                    log("%s error %s priv=%s" % (p[0], type(e).__name__, priv)); last = (502, b'{"error":{"message":"upstream unreachable"}}'); continue
                if r.status == 200:
                    log("%s 200 %.1fs priv=%s" % (p[0], time.time() - t0, priv))
                    self.send_response(200)
                    for h in ("Content-Type", "Cache-Control"):
                        if r.getheader(h): self.send_header(h, r.getheader(h))
                    self.send_header("X-Maya-Route", p[0]); self.send_header("Connection", "close"); self.end_headers()
                    if p[0] == "cloudflare":
                        # Cloudflare sends pure-number chunks as JSON ints (content: 15); clients drop them. Make them strings.
                        try:
                            ct = r.getheader("Content-Type") or ""
                            if "event-stream" in ct:
                                while True:
                                    ln = r.readline()
                                    if not ln: break
                                    t = ln.decode("utf8", "ignore")
                                    if t.startswith("data:") and "[DONE]" not in t:
                                        try:
                                            o = json.loads(t[5:])
                                            for ch_ in o.get("choices", []):
                                                dl = ch_.get("delta") or {}
                                                if "content" in dl and dl["content"] is not None and not isinstance(dl["content"], str): dl["content"] = str(dl["content"])
                                                for tc in dl.get("tool_calls") or []:
                                                    fn_ = tc.get("function") or {}
                                                    if "arguments" in fn_ and not isinstance(fn_["arguments"], str): fn_["arguments"] = json.dumps(fn_["arguments"])
                                            t = "data: " + json.dumps(o) + "\n"
                                        except Exception: pass
                                    self.wfile.write(t.encode()); self.wfile.flush()
                            else:
                                raw = r.read()
                                try:
                                    o = json.loads(raw)
                                    for ch_ in o.get("choices", []):
                                        m_ = ch_.get("message") or {}
                                        if m_.get("content") is not None and not isinstance(m_["content"], str): m_["content"] = str(m_["content"])
                                    raw = json.dumps(o).encode()
                                except Exception: pass
                                self.wfile.write(raw)
                        except Exception: pass
                        self.close_connection = True
                        return
                    try:
                        try: c.sock.settimeout(240)
                        except Exception: pass
                        _tail = b""; _n = 0
                        while True:
                            ch = r.read1(8192) if hasattr(r, "read1") else r.read(8192)
                            if not ch: break
                            _n += len(ch); _tail = (_tail + ch)[-600:]
                            self.wfile.write(ch); self.wfile.flush()
                        if b"finish_reason\":\"" not in _tail and b"[DONE]" not in _tail: log("%s stream ended w/o finish bytes=%d %.0fs" % (p[0], _n, time.time() - t0))
                    except Exception as e: log("%s stream error %s bytes=%d %.0fs" % (p[0], type(e).__name__, _n if "_n" in dir() else -1, time.time() - t0))
                    self.close_connection = True
                    return
                eb = r.read()[:2000]; last = (r.status, eb)
                log("%s %s %.1fs priv=%s size=%dk" % (p[0], r.status, time.time() - t0, priv, len(json.dumps(body)) // 1000))
                if r.status in (400, 413, 422): log("  err: " + re.sub(r"\s+", " ", eb.decode("utf8", "ignore"))[:220])
                c.close()
                if r.status == 429:
                    with lock: cool[p[0]] = time.time() + (6 if p[0] == "nvidia" else 45)
                if r.status not in (429, 408, 500, 502, 503, 504): break
                if r.status == 429 and not priv and p[0] != "nvidia": break
        code, eb = last or (503, b'{"error":{"message":"no route"}}')
        d = eb if eb else b'{"error":{"message":"all routes failed"}}'
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(d))); self.send_header("Connection", "close"); self.end_headers(); self.wfile.write(d)
        self.close_connection = True
http.server.ThreadingHTTPServer((sys.argv[1] if len(sys.argv) > 1 else "172.18.0.1", int(os.environ.get("PORT","8792"))), H).serve_forever()
