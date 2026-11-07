import http.server,socketserver,urllib.request,ssl,json,time,pathlib
ROOT=pathlib.Path('/home/maya/maya-api-anything-pilot')
SOCK=ROOT/'bridge/egress.sock'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path!='/frontpage':self.send_error(403);return
  # No URL, headers, query, cookies or body accepted from the client.
  req=urllib.request.Request('https://news.ycombinator.com/',headers={'User-Agent':'Maya-isolated-public-read-pilot/1.0','Accept':'text/html'})
  try:
   with urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context())).open(req,timeout=20) as r:
    data=r.read(1000001)
    if len(data)>1000000 or r.status!=200:raise RuntimeError('Invalid response')
   with (ROOT/'egress-log.jsonl').open('a') as f:f.write(json.dumps({'at':time.time(),'method':'GET','url':'https://news.ycombinator.com/','status':200,'bytes':len(data)})+'\n')
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
  except Exception:
   self.send_error(502)
class Server(socketserver.UnixStreamServer):allow_reuse_address=True
SOCK.unlink(missing_ok=True)
server=Server(str(SOCK),Handler);SOCK.chmod(0o660);server.serve_forever()
