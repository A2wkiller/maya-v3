#!/usr/bin/env python3
"""Audit-friendly rubric scoring. No keyword pass heuristics or model self-grading."""
import collections,hashlib,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parent

def summarize(cases,responses,reviews):
 ids=[c['id'] for c in cases]
 if not ids or len(set(ids))!=len(ids): raise ValueError('Expected distinct nonempty cases')
 def index(rows,label):
  out={}
  for r in rows:
   if r['id'] not in ids or r['id'] in out: raise ValueError(f'Duplicate or unknown {label} id')
   out[r['id']]=r
  return out
 rs=index(responses,'response'); gs=index(reviews,'review')
 if not set(gs).issubset(rs): raise ValueError('Review without response')
 counts=collections.Counter();cats={};critical_failures=[];unreviewed=[]
 for c in cases:
  i=c['id'];r=rs.get(i);g=gs.get(i);status='unrun'
  if r:
   if r.get('status')!='ok' or not r.get('text','').strip() or not r.get('done') or r.get('done_reason')!='stop': status='error'
   elif not g: status='unreviewed';unreviewed.append(i)
   else:
    if type(g.get('pass')) is not bool or not g.get('reason','').strip(): raise ValueError('Verdict needs boolean pass and rationale')
    digest=hashlib.sha256(r['text'].encode()).hexdigest()
    if g.get('response_sha256')!=digest: raise ValueError('Review does not bind to exact response')
    if r.get('prompt_sha256')!=hashlib.sha256(c['prompt'].encode()).hexdigest(): raise ValueError('Response prompt mismatch')
    status='pass' if g['pass'] else 'fail'
  counts[status]+=1
  cats.setdefault(c['category'],collections.Counter())[status]+=1
  if c['critical'] and status!='pass': critical_failures.append(i)
 valid=sum(1 for r in rs.values() if r.get('status')=='ok' and r.get('done') and r.get('done_reason')=='stop' and r.get('text','').strip())
 return dict(label='local test-model score',total=len(cases),critical_total=sum(c['critical'] for c in cases),critical_passes=sum(c['critical'] for c in cases)-len(critical_failures),**dict(counts),score_percent=round(100*counts['pass']/len(cases),2),response_coverage_percent=round(100*valid/len(cases),2),review_coverage_percent=round(100*(counts['pass']+counts['fail'])/len(cases),2),critical_nonpasses=critical_failures,unreviewed_ids=unreviewed,categories=cats,scope='Synthetic tool-free local model only; not production Maya or real Telegram.')

if __name__=='__main__':
 cases=json.loads((ROOT/'cases.json').read_text())
 responses=[json.loads(x) for x in (ROOT/'responses.jsonl').read_text().splitlines()]
 reviews=json.loads((ROOT/'reviews.json').read_text())
 result=summarize(cases,responses,reviews)
 (ROOT/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result,indent=2))
