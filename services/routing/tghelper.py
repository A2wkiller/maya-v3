#!/usr/bin/env python3
"""Maya Telegram helper: typing while she works, voice reply when he sent a voice note.
Reads Rakazo DB (read-only) and calls Telegram send APIs. Never logs message content or token."""
import subprocess, json, time, os, re, urllib.request, uuid, sys
TOK = open("/home/maya/prov/telegram").read().strip()
CHAT = "OWNER_TELEGRAM_CHAT_ID"
THREAD = "fixture-resource-id"
API = "https://api.telegram.org/bot" + TOK
LOG = "/home/maya/maya-ops/tghelper.log"
MAXVOICE = 700
VOICE_REPLY = False
def log(m):
    open(LOG, "a").write(time.strftime("%F %T ") + m + "\n")
def q(sql):
    r = subprocess.run(["docker","exec","rakazo-postgres-1","psql","-U","rakazo","-d","rakazo","-At","-F","|","-c",sql],capture_output=True,text=True,timeout=20)
    return [l.split("|") for l in r.stdout.strip().splitlines() if l]
def tg(method, data=None):
    req = urllib.request.Request(API + "/" + method, data=json.dumps(data or {}).encode(), headers={"Content-Type":"application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=15))
    except Exception as e:
        log("tg %s err %s" % (method, type(e).__name__)); return {}
def send_voice(text):
    t = re.sub(r"[`*_#>\[\]]|\(https?://[^)]*\)", "", text)
    t = re.sub(r"\s+", " ", t).strip()
    if not t or len(t) > MAXVOICE: log("voice skipped len=%d" % len(t)); return
    rq = urllib.request.Request("http://172.18.0.1:8787/tts", data=json.dumps({"text":t}).encode(), headers={"Content-Type":"application/json"})
    audio = urllib.request.urlopen(rq, timeout=15).read()
    src = "/tmp/tgh_in"; dst = "/tmp/tgh_out.ogg"
    open(src,"wb").write(audio)
    subprocess.run(["ffmpeg","-y","-loglevel","error","-i",src,"-c:a","libopus","-b:a","32k","-ar","48000","-ac","1",dst],check=True,timeout=60)
    b = uuid.uuid4().hex
    body = (("--%s\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n%s\r\n" % (b, CHAT)).encode()
      + ("--%s\r\nContent-Disposition: form-data; name=\"voice\"; filename=\"maya.ogg\"\r\nContent-Type: audio/ogg\r\n\r\n" % b).encode()
      + open(dst,"rb").read() + ("\r\n--%s--\r\n" % b).encode())
    req = urllib.request.Request(API + "/sendVoice", data=body, headers={"Content-Type":"multipart/form-data; boundary="+b})
    try: urllib.request.urlopen(req, timeout=30); log("voice sent")
    except Exception as e: log("sendVoice err %s" % type(e).__name__)

REACT = True
DONE = ["\u2705", "\U0001F44C"]
FRONT = [0]
def react(mid, emoji):
    d = {"chat_id": CHAT, "message_id": int(mid), "reaction": ([{"type":"emoji","emoji":emoji}] if emoji else [])}
    return tg("setMessageReaction", d).get("ok", False)
def find_latest():
    h = None; i = max(FRONT[0], 0) + 1; miss = 0
    while i < FRONT[0] + 60 and miss < 12:
        if react(i, None): h = i; miss = 0
        else: miss += 1
        i += 1
    if h: FRONT[0] = h
    return h
def init_front():
    r = q("select \"providerHandle\" from messaging_outbound where \"identityId\"='fixture-resource-id' order by \"createdAt\" desc limit 1")
    if r:
        try: FRONT[0] = int(r[0][0].split(":")[1])
        except Exception: pass
    find_latest()

import random
LASTDONE = [None]
ACKS = ["On it. I will finish this and tell you.", "Got it, starting now. I will come back with the result.", "Ok, working on this. Will message you when it is done.", "Starting this now. I will tell you as soon as it is finished.", "On my way with this one. Result coming soon."]
NUDGES = ["Still working on it, almost there.", "Still on this, it is a bigger one. I will tell you when it is done.", "Not forgotten, still working on it."]
ACKI = [0]
def say(text):
    tg("sendMessage", {"chat_id": CHAT, "text": text})
def user_text():
    """Plain text of the newest user message via Rakazo RPC (content is encrypted in the DB). Used only for picking an emoji, never logged."""
    try:
        r = subprocess.run(["curl","-s","-m","8","-b","/home/maya/maya-reboot-prep/rk_cookies.txt","-X","POST","http://127.0.0.1:3100/rpc/threads/get","-H","Content-Type: application/json","-d",json.dumps({"json":{"botId":"fixture-resource-id"}})],capture_output=True,text=True).stdout
        d = json.loads(r)["json"]; ms = d.get("messages", d)
        for m in reversed(ms):
            if m["role"] == "user":
                return " ".join((b.get("text") or "") for b in m["blocks"] if b.get("kind") == "text").lower()
    except Exception:
        pass
    return ""
W = lambda t, ws: any(w in t for w in ws)
def start_emoji(isfile, t):
    # only emoji Telegram allows bots to use as reactions
    if isfile: return "\u270D"            # file / voice note
    if W(t, ["remind", "alarm", "tomorrow", "schedule", "at 8", "every day"]): return "\U0001FAE1"  # reminder
    if W(t, ["error", "broken", "failed", "not working", "doesn't work", "wrong", "problem", "issue", "bug"]): return "\U0001F622"  # bad news
    if W(t, ["thank", "great", "awesome", "perfect", "works", "love", "nice", "good job", "amazing"]): return "\U0001F525"  # good news
    if "?" in t or W(t, ["what ", "how ", "why ", "which ", "can you", "could you"]): return "\U0001F914"  # question
    if W(t, ["screenshot", "reel", "image", "photo", "video", "instagram", ".png", ".jpg"]): return "\U0001F929"
    return "\U0001F440"
DONES = ["\U0001F44C", "\U0001F3C6", "\u26A1", "\U0001F4AF", "\U0001F389", "\U0001F91D"]
def done_emoji():
    c = [e for e in DONES if e != LASTDONE[0]]; e = random.choice(c); LASTDONE[0] = e; return e

import urllib.parse
def rpc(path, d):
    r = subprocess.run(["curl","-s","-m","20","-b","/home/maya/maya-reboot-prep/rk_cookies.txt","-X","POST","http://127.0.0.1:3100/rpc/"+path,"-H","Content-Type: application/json","-d",json.dumps({"json":d})],capture_output=True,text=True).stdout
    try: return json.loads(r)["json"]
    except Exception: return None
TGBOT = "fixture-resource-id"
HANDLED_F = "/home/maya/maya-ops/voice_done.json"
def handled():
    try: return set(json.load(open(HANDLED_F)))
    except Exception: return set()
def mark(uid):
    h = handled(); h.add(uid); json.dump(sorted(h), open(HANDLED_F, "w"))
LAST_UID = [None]
def fetch_voice_text(mid, skip_done=False):
    """Forward his voice message to the same chat to learn its file_id, delete the copy, download from Telegram, transcribe via the local Groq route."""
    f = tg("forwardMessage", {"chat_id": CHAT, "from_chat_id": CHAT, "message_id": int(mid)})
    res = f.get("result") or {}
    if res.get("message_id"): tg("deleteMessage", {"chat_id": CHAT, "message_id": res["message_id"]})
    media = res.get("voice") or res.get("audio") or res.get("video_note")
    if not media: log("voice: no media in forward"); return None
    if skip_done and media.get("file_unique_id") in handled(): log("voice: already handled"); return None
    LAST_UID[0] = media.get("file_unique_id")
    gf = tg("getFile", {"file_id": media["file_id"]}).get("result") or {}
    if not gf.get("file_path"): log("voice: getFile failed"); return None
    audio = urllib.request.urlopen("https://api.telegram.org/file/bot" + TOK + "/" + gf["file_path"], timeout=15).read()
    b = uuid.uuid4().hex
    body = (("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"voice.ogg\"\r\nContent-Type: audio/ogg\r\n\r\n" % b).encode() + audio + ("\r\n--%s--\r\n" % b).encode())
    rq = urllib.request.Request("http://172.18.0.1:8787/v1/audio/transcriptions", data=body, headers={"Content-Type": "multipart/form-data; boundary=" + b})
    return json.load(urllib.request.urlopen(rq, timeout=60)).get("text", "").strip() or None
def answer_via_transcript(mid, text=None):
    text = text or fetch_voice_text(mid)
    if not text: log("voice transcript failed"); return False
    rpc("threads/stop", {"botId": TGBOT}); time.sleep(1)
    rpc("threads/send", {"botId": TGBOT, "text": "(Voice note from the user, transcribed: " + text + ")"})
    log("voice transcript posted")
    t0 = time.time(); seen_active = False; warned = False
    while time.time() - t0 < 420:
        tg("sendChatAction", {"chat_id": CHAT, "action": "typing"}); time.sleep(4)
        d = rpc("threads/get", {"botId": TGBOT})
        if not d: continue
        ms = d["messages"]; active = bool(d.get("activeRuns"))
        seen_active = seen_active or active
        mine = None
        for i in range(len(ms) - 1, -1, -1):
            if ms[i]["role"] == "user" and "Voice note from the user, transcribed" in " ".join(b.get("text","") for b in ms[i]["blocks"]): mine = i; break
        if mine is None: continue
        t = "\n".join(b.get("text", "") for m in ms[mine+1:] if m["role"] == "bot" for b in m["blocks"] if b["kind"] == "text")
        if t and not active:
            say(t); log("voice answered via transcript")
            if LAST_UID[0]: mark(LAST_UID[0])
            return True
        if not active and time.time() - t0 > 20 and not t:
            say("I heard your voice note: \"" + text[:200] + "\". The answer did not finish (model limit). Tell me to retry or type it.")
            log("voice run ended without reply"); 
            if LAST_UID[0]: mark(LAST_UID[0])
            return True
        if time.time() - t0 > 150 and not warned:
            warned = True; say("Heard you: \"" + text[:120] + "\". Still working, it is a bigger task.")
    if LAST_UID[0]: mark(LAST_UID[0])
    say("I heard your voice note but the job took too long and stopped. Tell me to retry."); log("voice timeout after transcript")
    return True

import difflib
DEDUP_SEEN = set(); DEDUP_BODIES = []
def qj(inner):
    r = subprocess.run(["docker","exec","rakazo-postgres-1","psql","-U","rakazo","-d","rakazo","-At","-c","select coalesce(json_agg(t),'[]') from (" + inner + ") t"],capture_output=True,text=True,timeout=20)
    try: return json.loads(r.stdout.strip())
    except Exception: return []
OUTQ = "select id, \"providerHandle\" as h, left(body,2000) as b from messaging_outbound where \"identityId\"='fixture-resource-id' and status='sent' and \"createdAt\">now()-interval '%s' order by \"createdAt\""
def dedupe_init():
    for r in qj(OUTQ % "90 minutes"):
        DEDUP_SEEN.add(r["id"]); DEDUP_BODIES.append(r["b"])
def dedupe_tick():
    """Delete a Maya reply that is near-identical to one sent in the last 90 min (one reply per message, no repeats)."""
    for r in qj(OUTQ % "10 minutes"):
        if r["id"] in DEDUP_SEEN: continue
        DEDUP_SEEN.add(r["id"]); body = r["b"]
        dup = len(body) >= 40 and any(difflib.SequenceMatcher(None, body, x).ratio() >= 0.8 for x in DEDUP_BODIES[-15:])
        DEDUP_BODIES.append(body)
        if dup and r["h"] and ":" in r["h"]:
            ok = tg("deleteMessage", {"chat_id": CHAT, "message_id": int(r["h"].split(":")[1])}).get("ok")
            log("duplicate reply removed=%s" % ok)
def latest_user():
    r = q("""select id,"createdAt",position('"kind": "file"' in blocks::text)>0 from messages where "threadId"='%s' and role='user' order by "createdAt" desc limit 1""" % THREAD)
    return r[0] if r else None
if "--mark-from" in sys.argv:
    n = int(sys.argv[sys.argv.index("--mark-from") + 1]); init_front()
    for i in range(n, FRONT[0] + 1):
        if react(i, None):
            try:
                if fetch_voice_text(i): mark(LAST_UID[0]); print("marked", i)
            except Exception as e: print("err", i)
    sys.exit()
if "--voice-from" in sys.argv:
    n = int(sys.argv[sys.argv.index("--voice-from") + 1]); init_front(); txt = None
    for i in range(n, FRONT[0] + 1):
        if not react(i, None): continue
        try: txt = fetch_voice_text(i, skip_done=True)
        except Exception as e: txt = None
        if txt: print("found at", i); break
    print(answer_via_transcript(0, txt) if txt else "no voice found"); sys.exit()
if "--voice-now" in sys.argv:
    init_front(); txt = None
    for i in range(FRONT[0], FRONT[0] - 8, -1):
        try: txt = fetch_voice_text(i)
        except Exception as e: log("voice-now %d err %s" % (i, type(e).__name__)); txt = None
        if txt: print("found at", i); break
    print(answer_via_transcript(0, txt) if txt else "no voice found"); sys.exit()
if "--selftest" in sys.argv:
    init_front(); print("latest id", FRONT[0])
    print("react", react(FRONT[0], "\U0001F440")); time.sleep(4); print("clear", react(FRONT[0], None)); sys.exit()
init_front(); dedupe_init()
last = latest_user(); seen = last[0] if last else None
log("start")
while True:
    try:
        dedupe_tick()
        u = latest_user()
        if u and u[0] != seen:
            seen = u[0]; ts = u[1]; isfile = (u[2] == "t"); isimg_or_file = isfile; start = time.time()
            log("inbound file=%s" % isfile)
            reply = None
            _ut0 = user_text()
            if "(unavailable)" in _ut0: rpc("threads/stop", {"botId": TGBOT}); log("stopped run on unavailable audio")
            mid = find_latest() if REACT else None
            _ut = _ut0
            if mid: react(mid, start_emoji(isimg_or_file, _ut))
            if "(unavailable)" in _ut:
                try:
                    ok = answer_via_transcript(mid, fetch_voice_text(mid, skip_done=True)) if mid else False
                except Exception as e:
                    log("voice fix err %s" % type(e).__name__); ok = False
                if not ok:
                    say("I could not download your voice note (Telegram timed out). Please send it again or type it."); log("voice unavailable notice sent")
                continue
            acked = nudged = False
            while time.time() - start < 360:
                el = time.time() - start
                dedupe_tick()
                if el > 15 and not acked:
                    acked = True
                    states = q("select status from runs where \"botId\"='fixture-resource-id' order by \"createdAt\" desc limit 1")
                    state = states[0][0] if states else "unknown"
                    if state == "waiting_input": say("Waiting for your approval or answer. Open Maya in the app and check the pending question. I have not restarted the job.")
                    elif state in ("running", "queued", "leased"): say("Your request is still in progress. This is a status notice, not a completion.")
                    else: log("ack skipped state=" + state)
                    log("state-aware ack checked")
                if False and el > 150 and not nudged:
                    nudged = True; say(NUDGES[ACKI[0] % len(NUDGES)]); log("nudge sent")
                tg("sendChatAction", {"chat_id":CHAT,"action":"typing"})
                time.sleep(4)
                r = q("select body,\"createdAt\" from messaging_outbound where status='sent' and \"identityId\"='fixture-resource-id' and \"createdAt\" > '%s' order by \"createdAt\" desc limit 1" % ts)
                if r: reply = r[0][0]; break
            if mid and reply:
                if not react(mid, done_emoji()): log("done react failed")
            if reply and isfile and VOICE_REPLY: send_voice(reply)
        time.sleep(1.5)
    except Exception as e:
        log("loop err %s" % type(e).__name__); time.sleep(5)
