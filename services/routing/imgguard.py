# Maya image guard: flags image artifacts that are not real image files (fake base64/text saved as .png).
import json, subprocess, time, base64, urllib.request, sys
TG_BOT = "fixture-resource-id"; TEST = "fixture-resource-id"; WEB = "000000000000000000000001"
LOG = "/home/maya/maya-ops/imgguard.log"
def log(m): open(LOG, "a").write(time.strftime("%F %T ") + m + "\n")
def qj(sql):
    r = subprocess.run(["docker","exec","rakazo-postgres-1","psql","-U","rakazo","-d","rakazo","-At","-c","select coalesce(json_agg(t),'[]') from (" + sql + ") t"], capture_output=True, text=True, timeout=20)
    try: return json.loads(r.stdout.strip())
    except Exception: return []
def rpc(p, d):
    r = subprocess.run(["curl","-s","-m","20","-b","/tmp/rk_cookies.txt","-X","POST","http://127.0.0.1:3100/rpc/"+p,"-H","Content-Type: application/json","-d",json.dumps({"json":d})], capture_output=True, text=True).stdout
    try: return json.loads(r)["json"]
    except Exception: return None
MAGIC = (b"\x89PNG", b"\xff\xd8\xff", b"GIF8", b"RIFF")
OTHER = {"application/pdf": (b"%PDF",), "application/zip": (b"PK",), "audio/ogg": (b"OggS",), "audio/mpeg": (b"ID3", b"\xff\xfb"), "audio/wav": (b"RIFF",)}
def real_image(bot, aid, mime="image/"):
    a = rpc("artifacts/get", {"artifactId": aid, "botId": bot})
    if not a: return None
    raw = base64.b64decode(a["contentBase64"])
    if mime in OTHER: return any(raw.startswith(m) for m in OTHER[mime])
    if raw.startswith(b"\x89PNG"): return raw.rstrip(b"\x00").endswith(b"IEND\xaeB`\x82")
    if raw.startswith(b"\xff\xd8\xff"): return raw.rstrip(b"\x00").endswith(b"\xff\xd9")
    return raw[:4].startswith(MAGIC) or any(raw.startswith(m) for m in MAGIC)
def tg_say(text):
    tok = open("/home/maya/prov/telegram").read().strip().split("=")[-1].strip()
    req = urllib.request.Request("https://api.telegram.org/bot%s/sendMessage" % tok, data=json.dumps({"chat_id": OWNER_TELEGRAM_CHAT_ID, "text": text}).encode(), headers={"Content-Type": "application/json"})
    try: urllib.request.urlopen(req, timeout=15)
    except Exception as e: log("tg send err %s" % type(e).__name__)
seen = set()
def tick(since):
    for r in qj("select id, \"botId\" b, \"mimeType\" m from artifacts where (\"mimeType\" in ('application/pdf','application/zip','audio/ogg','audio/mpeg','audio/wav') or \"mimeType\" like 'image/%%') and \"createdAt\" > now() - interval '%s'" % since):
        if r["id"] in seen or not r["b"]: continue
        seen.add(r["id"]); ok = real_image(r["b"], r["id"], r["m"])
        if ok is False:
            log("FAKE image artifact %s bot=%s" % (r["id"], r["b"]))
            if r["b"] == TG_BOT and "--dry" not in sys.argv:
                tg_say("Correction: the file I just sent is not a real one (it is a broken file). Ignore it. I could not make a real one. Instinct can take it for you.")
        elif ok: log("ok image %s" % r["id"])
if "--once" in sys.argv: tick(sys.argv[sys.argv.index("--once") + 1]); sys.exit()
tick("2 minutes")
while True:
    try: tick("3 minutes")
    except Exception as e: log("err %s" % type(e).__name__)
    time.sleep(5)
