#!/usr/bin/env python3
"""Create an UNGRADED review template. Never overwrites existing reviews."""
import hashlib,json,pathlib
r=pathlib.Path(__file__).parent
out=r/'reviews.json'
if out.exists(): raise SystemExit('reviews.json already exists. Use a fresh run directory; preserve prior evidence.')
cases={c['id']:c for c in json.loads((r/'cases.json').read_text())}
rows=[json.loads(x) for x in (r/'responses.jsonl').read_text().splitlines()]
reviews=[dict(id=x['id'],**{'pass':None},reason='',rubric=cases[x['id']]['rubric'],response_sha256=hashlib.sha256(x['text'].encode()).hexdigest(),reviewer='') for x in rows]
out.write_text(json.dumps(reviews,indent=2)+'\n')
print('Template created. Review each exact response against its rubric; set pass to true/false and supply reason. Null is not a pass.')
