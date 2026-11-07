#!/usr/bin/env python3
"""Offline hygiene check. Pattern checks do not prove absence of private data."""
from pathlib import Path
import re, sys
R = Path(__file__).resolve().parents[1]
issues=[]
for p in R.rglob("*"):
    if ".git" in p.parts or not p.is_file(): continue
    name=str(p.relative_to(R))
    if p.name.startswith(".env") and p.name != ".env.example": issues.append((name,"runtime env"))
    if p.suffix.lower() in (".pem",".key",".p12",".db",".sqlite",".log"): issues.append((name,"runtime/secret file"))
    if any(x in p.parts for x in ("node_modules","__pycache__","backups")): issues.append((name,"excluded directory"))
    try: text=p.read_text()
    except UnicodeDecodeError: continue
    if re.search(r"owner@[a-z]+\.com|https://[A-Za-z0-9-]+\.trycloudflare\.com",text): issues.append((name,"non-example deployment data"))
for rel in ("README.md","SETUP.md","THIRD_PARTY_NOTICES.md",".env.example","application/LICENSE","vendor/HERMES-LICENSE"):
    if not (R/rel).is_file(): issues.append((rel,"required file missing"))
for path,reason in issues: print(path,reason)
print(f"Public-copy hygiene: {len(issues)} issue(s). This is not a security audit.")
sys.exit(bool(issues))
