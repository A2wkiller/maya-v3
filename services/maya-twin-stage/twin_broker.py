"""Private Unix-only text broker. No credentials in dispatcher/model mounts."""
import sys;sys.path.insert(0,'/home/maya/maya-search-lab')
import json,os,pathlib,socketserver,time,urllib.request
from twin_policy import Twin,Denied,local_capability_reply
ROOT=pathlib.Path('/home/maya/maya-twin-stage')
class Transport:
 def __call__(self,request):
  body=dict(request,model='maya-auto',max_tokens=2200,chat_template_kwargs={'enable_thinking':False})
  req=urllib.request.Request('http://172.18.0.1:8792/v1/chat/completions',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST')
  try:
   with urllib.request.urlopen(req,timeout=110) as r:
    raw=r.read(100001)
    if len(raw)>100000:raise Denied('provider oversized')
    data=json.loads(raw)
    # Metadata only, no guest text or provider errors.
    (ROOT/'last-route.json').write_text(json.dumps({'route':r.headers.get('X-Maya-Route'),'at':time.time(),'finish':data.get('choices',[{}])[0].get('finish_reason')}))
    message=data['choices'][0]['message']
    if message.get('tool_calls'):raise Denied('tool calls refused')
    content=message.get('content')
    if not isinstance(content,str) or not content.strip():raise Denied('empty model answer')
    if data['choices'][0].get('finish_reason')=='length':content+='\n[Answer hit the evaluation length limit.]'
    return content
  except Exception:raise Denied('provider unavailable') from None
class H(socketserver.StreamRequestHandler):
 def handle(self):
  self.connection.settimeout(115)
  try:
   raw=self.rfile.readline(4097)
   if len(raw)>4096 or not raw.endswith(b'\n'):raise Denied('invalid request')
   data=json.loads(raw)
   if not isinstance(data,dict) or set(data)!={'text','label','sender'}:raise Denied('invalid request')
   if not isinstance(data['sender'],int) or isinstance(data['sender'],bool):raise Denied('invalid sender')
   allowed=json.loads((ROOT/'allowed-sessions.json').read_text())
   if not isinstance(allowed,dict) or len(allowed)>5:raise Denied('tester cap')
   label=data['label'];spec=allowed.get(label)
   if not isinstance(spec,dict) or spec.get('expires_at',0)<=time.time() or not spec.get('consent') or spec['sender']!=data['sender'] or (ROOT/'REVOKED').exists() or (ROOT/(label+'.REVOKED')).exists():raise Denied('inactive session')
   if not self.server.twin.db.execute('SELECT 1 FROM sessions WHERE label=?',(label,)).fetchone():self.server.twin.register(label,data['sender'],spec['expires_at'],True)
   usertext=data['text']
   if isinstance(usertext,str) and usertext.lower().startswith('/search '):
    old_transport=self.server.twin.transport
    self.server.twin.transport=lambda request:'search reserved'
    try:self.server.twin.reply(label,data['sender'],usertext)
    finally:self.server.twin.transport=old_transport
    if self.server.searches.get(label,0)>=5:raise Denied('search cap')
    self.server.searches[label]=self.server.searches.get(label,0)+1
    from owner_mcp import selfhost
    query=usertext[8:].strip()
    result=selfhost(query)
    rows=result.get('results',[])[:3]
    text='Public source excerpts (untrusted discovery, not verified facts):\n\n'+'\n\n'.join(r['title']+'\n'+r['url']+'\n'+r['excerpt'][:500] for r in rows) if rows else 'Live public lookup unavailable. I will not invent current facts.'
   elif isinstance(usertext,str) and __import__('re').search(r'\b(today|latest|current|news|breaking)\b',usertext,__import__('re').I):
    old_transport=self.server.twin.transport
    self.server.twin.transport=lambda request:'help reserved'
    try:self.server.twin.reply(label,data['sender'],usertext)
    finally:self.server.twin.transport=old_transport
    text='For current public facts, send /search plus a short topic. Do not include personal/private information. Results are source excerpts, not verified advice.'
   elif isinstance(usertext,str) and local_capability_reply(usertext):
    old_transport=self.server.twin.transport
    self.server.twin.transport=lambda request:local_capability_reply(usertext)
    try:text=self.server.twin.reply(label,data['sender'],usertext)
    finally:self.server.twin.transport=old_transport
   else:text=self.server.twin.reply(label,data['sender'],usertext)
   out={'text':text}
  except Exception:out={'text':'The evaluation model is unavailable or this session ended. No action was taken.'}
  try:self.wfile.write(json.dumps(out).encode()+b'\n')
  except OSError:pass
if __name__=='__main__':
 os.umask(0o077);(ROOT/'bridge').mkdir(mode=0o700,exist_ok=True);endpoint=ROOT/'bridge/model.sock'
 if endpoint.exists():endpoint.unlink()
 with socketserver.UnixStreamServer(str(endpoint),H) as server:
  os.chmod(endpoint,0o600);server.searches={};server.twin=Twin(str(ROOT/'sessions.sqlite'),Transport() if (ROOT/'PROVIDER_ENABLED').exists() else None);server.serve_forever()
