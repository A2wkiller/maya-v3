"""Offline server candidate. Deliberate operator start only, no model-facing endpoint."""
import argparse,http.server,json,pathlib,threading,time,urllib.request,urllib.error,urllib.parse,os,tempfile
from write_bridge_core import Bridge,Refused
class Google:
 def __init__(self,root):self.root=pathlib.Path(root);self.lock=threading.Lock()
 def token(self):
  with self.lock:
   p=self.root/'candidate-token.json';d=json.loads(p.read_text())
   if d.get('account')!='owner@example.invalid':raise Refused('Account mismatch')
   # Refresh on each execution, before contacting the write endpoint. No automatic write retry.
   data=urllib.parse.urlencode({'grant_type':'refresh_token','refresh_token':d['refresh_token'],'client_id':(self.root/'client-id').read_text().strip(),'client_secret':(self.root/'client-secret').read_text().strip()}).encode()
   with urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token',data=data),timeout=12) as r:tok=json.loads(r.read(100000))
   if not tok.get('access_token') or tok.get('token_type','').lower()!='bearer':raise Refused('Token unavailable')
   return tok['access_token']
 def execute(self,req):
  # Token never returned to the caller or logs.
  headers={**req['headers'],'Authorization':'Bearer '+self.token()}
  body=req.get('body')
  if isinstance(body,(dict,list)):
   body=json.dumps(body).encode();headers.setdefault('Content-Type','application/json; charset=utf-8')
  elif isinstance(body,str):body=body.encode()
  elif body is not None:raise Refused('Invalid body')
  request=urllib.request.Request(req['url'],method=req['method'],data=body,headers=headers)
  class NoRedirect(urllib.request.HTTPRedirectHandler):
   def redirect_request(self,*args):return None
  try:
   with urllib.request.build_opener(NoRedirect()).open(request,timeout=20) as r:
    raw=r.read(100001)
    if len(raw)>100000:raise Refused('Response too large')
    return r.status,json.loads(raw) if raw else {}
  except urllib.error.HTTPError as e:return e.code,{} # no private body forwarded
class Handler(http.server.BaseHTTPRequestHandler):
 server_version='MayaPrivateGoogle';sys_version=''
 def log_message(self,*args):pass
 def reply(self,status,value):
  data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if self.path!='/execute' or self.headers.get('Origin'):return self.reply(404,{'error':'Not found'})
  try:
   size=int(self.headers.get('Content-Length','0'))
   if not 0<size<=80000 or self.headers.get('Transfer-Encoding'):raise Refused('Body refused')
   raw=self.rfile.read(size)
   if len(raw)!=size:raise Refused('Body refused')
   result=self.server.bridge.execute(raw,self.headers.get('X-Maya-Signature',''))
   return self.reply(200,result)
  except Refused:return self.reply(403,{'error':'Request refused'})
  except Exception:return self.reply(503,{'status':'uncertain','retry':False})
 def do_GET(self):self.reply(405,{'error':'Method not allowed'})
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--key-file',required=True);a=p.parse_args()
 key=pathlib.Path(a.key_file).read_bytes().strip()
 if len(key)<40:raise RuntimeError('Invalid private key')
 google=Google(a.root);bridge=Bridge(pathlib.Path(a.root)/'effects',key,google.execute)
 s=http.server.ThreadingHTTPServer(('172.18.0.1',18797),Handler);s.bridge=bridge;s.serve_forever()
