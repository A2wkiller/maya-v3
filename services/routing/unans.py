#!/usr/bin/env python3
"""Lists his messages older than 15 min that have no later bot message (Telegram Maya + website Maya). Prints text for follow-up."""
import json, subprocess, datetime
BOTS = {"telegram": "fixture-resource-id", "website": "000000000000000000000001"}
now = datetime.datetime.now(datetime.timezone.utc)
out = []
for name, bid in BOTS.items():
    r = subprocess.run(["curl","-s","-m","20","-b","/home/maya/maya-reboot-prep/rk_cookies.txt","-X","POST","http://127.0.0.1:3100/rpc/threads/get","-H","Content-Type: application/json","-d",json.dumps({"json":{"botId":bid}})],capture_output=True,text=True).stdout
    try: ms = json.loads(r)["json"]["messages"]
    except Exception: print(name, "read failed"); continue
    pend = []
    for m in ms:
        if m["role"] == "user": pend.append(m)
        elif m["role"] == "bot" and any(b["kind"] in ("text","ask") for b in m["blocks"]): pend = []
    for m in pend:
        t = datetime.datetime.fromisoformat(m["createdAt"].replace("Z", "+00:00"))
        age = (now - t).total_seconds() / 60
        txt = " ".join(b.get("text") or ("[%s]" % b["kind"]) for b in m["blocks"])
        out.append((name, round(age), txt[:300]))
for o in out: print("UNANSWERED %s %dmin: %s" % o)
print("none" if not out else "")
