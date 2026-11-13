#!/usr/bin/env python3
"""Tool-free, first-attempt local Ollama benchmark. No rubric is sent to the model."""
import argparse,datetime,hashlib,json,pathlib,time,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--start',type=int,default=1);p.add_argument('--end',type=int,default=50);a=p.parse_args()
cases=json.loads((ROOT/'cases.json').read_text()); persona=(ROOT/'test_persona.txt').read_text()
out=ROOT/'responses.jsonl'
seen={json.loads(x)['id'] for x in out.read_text().splitlines()} if out.exists() else set()
for case in cases:
 if not(a.start<=int(case['id'][1:])<=a.end) or case['id'] in seen: continue
 row={'id':case['id'],'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'model':'qwen3:4b-32k','persona_sha256':hashlib.sha256(persona.encode()).hexdigest(),'prompt_sha256':hashlib.sha256(case['prompt'].encode()).hexdigest()}
 payload={'model':row['model'],'messages':[{'role':'system','content':persona},{'role':'user','content':case['prompt']}],'stream':False,'think':False,'keep_alive':'5m','options':{'temperature':0,'seed':42,'num_ctx':4096,'num_predict':192,'num_thread':2}}
 start=time.monotonic()
 try:
  req=urllib.request.Request('http://127.0.0.1:11434/api/chat',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=75) as response: data=json.load(response)
  row.update(status='ok',text=data.get('message',{}).get('content',''),done=data.get('done'),done_reason=data.get('done_reason'),eval_count=data.get('eval_count'),prompt_eval_count=data.get('prompt_eval_count'))
 except Exception as e: row.update(status='error',text='',error=str(e))
 row['elapsed_seconds']=round(time.monotonic()-start,3)
 with out.open('a') as f: f.write(json.dumps(row)+'\n')
 print(json.dumps(row),flush=True)
