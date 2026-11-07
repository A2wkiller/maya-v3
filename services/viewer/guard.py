import re
import socket,ipaddress,urllib.parse,subprocess,json,sqlite3,time,pathlib,threading,http.server,socketserver,os
ROOT=pathlib.Path(__file__).parent
class Denied(ValueError):pass
def validate(url,resolver=socket.getaddrinfo):
 try:u=urllib.parse.urlsplit(url);port=u.port
 except ValueError:raise Denied('invalid URL')
 if u.scheme!='https' or not u.hostname or u.username or u.password or port not in(None,443):raise Denied('public HTTPS only')
 if len(url)>2500 or any(ord(c)<33 for c in url):raise Denied('invalid URL')
 host=u.hostname.encode('idna').decode();ips={r[4][0] for r in resolver(host,443,type=socket.SOCK_STREAM)}
 if not ips or not all(ipaddress.ip_address(i).is_global and not ipaddress.ip_address(i).is_multicast for i in ips):raise Denied('private/internal address blocked')
 ip=next((i for i in ips if ':' not in i),next(iter(ips)));return host,ip

def fetch(url,transport=None,allowed_host=None,before_request=None):
 limit=6291456 if urllib.parse.urlsplit(url).hostname=="static.cdninstagram.com" and urllib.parse.urlsplit(url).path.startswith("/rsrc.php/") and urllib.parse.urlsplit(url).path.endswith(".js") else 2097152
 hops=[]
 for _ in range(7):
  host,ip=validate(url)
  if allowed_host and host!=allowed_host:raise Denied('cross-domain redirect not crawled')
  if before_request:before_request(host)
  if transport:status,headers,body=transport(url,host,ip)
  else:
   resolve=host+':443:'+('['+ip+']' if ':' in ip else ip)
   p=subprocess.run(['curl','--noproxy','*','--silent','--show-error','--max-time','12','--max-filesize',str(limit),'--proto','=https','--resolve',resolve,'-A','MayaUserView/0.1','-D','-','--',url],capture_output=True,timeout=14)
   if p.returncode:raise Denied('page fetch failed')
   raw=p.stdout
   while True:
    head,body=raw.split(b'\r\n\r\n',1);lines=head.decode('latin1').splitlines();status=int(lines[0].split()[1])
    if status in(100,200) and (status==100 or 'Connection established' in lines[0]):raw=body;continue
    break
   headers={k.lower():v.strip() for k,v in (line.split(':',1) for line in lines[1:] if ':' in line)}
  hops.append({'url':url,'status':status})
  if status in(301,302,303,307,308):url=urllib.parse.urljoin(url,headers.get('location',''));continue
  if status in(401,403,429):raise Denied('HTTP '+str(status)+' access denied or rate limited')
  if status>=400:raise Denied('HTTP '+str(status))
  ct=headers.get('content-type','application/octet-stream').lower()
  if not any(x in ct for x in('text/','javascript','json','image/','font/','application/font','application/x-font','application/woff')):raise Denied('download type blocked')
  if len(body)>limit:raise Denied('response too large')
  return {'url':url,'status':status,'headers':{'content-type':ct},'body':body,'hops':hops}
 raise Denied('redirect limit')

def instagram_public_query(url,data,seed_html):
 if url!='https://www.instagram.com/api/graphql' or len(data)>30000:raise Denied('public query route blocked')
 q=urllib.parse.parse_qs(data)
 if q.get('fb_api_req_friendly_name')!=['PolarisLoggedOutDesktopWWWPostRootContentQuery'] or q.get('doc_id')!=['28958671743799597']:raise Denied('query not allowed')
 v=json.loads(q.get('variables',['{}'])[0]);mid=str(v.get('media_id',''))
 if set(v)!={'media_id'} or not mid.isdigit() or not re.search(r'instagram://media\?id='+re.escape(mid)+r'(?:["&]|&amp;)',seed_html):raise Denied('query is not for owner pasted reel')
 token=q.get('lsd',[''])[0]
 if not re.fullmatch(r'[A-Za-z0-9_-]{1,200}',token):raise Denied('invalid public query token')
 data=urllib.parse.urlencode({'doc_id':'28958671743799597','variables':json.dumps({'media_id':mid}),'fb_api_req_friendly_name':'PolarisLoggedOutDesktopWWWPostRootContentQuery','server_timestamps':'true','lsd':token,'av':'0','__user':'0','__a':'1'})
 host,ip=validate(url);p=subprocess.run(['curl','--noproxy','*','--silent','--show-error','--max-time','12','--max-filesize','2097152','--proto','=https','--resolve',host+':443:'+ip,'-A','MayaUserView/0.1','-H','Content-Type: application/x-www-form-urlencoded','-H','X-FB-Friendly-Name: PolarisLoggedOutDesktopWWWPostRootContentQuery','-H','X-FB-LSD: '+q.get('lsd',[''])[0],'-D','-','--data-binary','@-','--',url],input=data.encode(),capture_output=True,timeout=14)
 if p.returncode:raise Denied('public reel query failed')
 head,body=p.stdout.split(b'\r\n\r\n',1);status=int(head.splitlines()[0].split()[1])
 if status!=200:raise Denied('query HTTP'+str(status))
 return {'url':url,'status':200,'headers':{'content-type':'application/json'},'body':body,'hops':[]}

class ViewLimit(Denied):
 def __init__(self,code,retry_after):
  self.code=code;self.retry_after=max(1,int(retry_after+0.999));super().__init__(code+":"+str(self.retry_after))

def reserve(max_wait=12,clock=time.time,sleep=time.sleep):
 # Local queue wait happens before the first website request, never retries it.
 started=clock()
 while True:
  db=sqlite3.connect(ROOT/'views.sqlite',timeout=5)
  try:
   db.execute('CREATE TABLE IF NOT EXISTS views(ts REAL)');db.execute('BEGIN IMMEDIATE');now=clock()
   count,last,first=db.execute('SELECT count(*),max(ts),min(ts) FROM views WHERE ts>?',(now-86400,)).fetchone()
   if count>=1000:db.rollback();raise ViewLimit('local_daily_view_limit',first+86400-now)
   delay=max(0,10-(now-last)) if last is not None else 0
   if not delay:db.execute('INSERT INTO views VALUES(?)',(now,));db.commit();return
   db.rollback()
  finally:db.close()
  if clock()-started+delay>max_wait:raise ViewLimit('local_view_cooldown',delay)
  sleep(delay)

def public_failure(reason):
 code='view_unavailable';seconds=None
 if 'local_view_cooldown' in reason:code='local_view_cooldown'
 elif 'local_daily_view_limit' in reason:code='local_daily_view_limit'
 elif 'HTTP 429' in reason or 'HTTP429' in reason:code='upstream_rate_limited'
 elif 'HTTP 403' in reason or 'HTTP403' in reason:code='upstream_access_denied'
 messages={'local_view_cooldown':"I couldn't view this reel because the viewer is busy. Please try again shortly.",'local_daily_view_limit':"I couldn't view this reel because today's viewer limit has been reached.",'upstream_rate_limited':"I couldn't view this reel because the website rate-limited this request.",'upstream_access_denied':"I couldn't view this reel because the website refused public access."}
 return {'status':'unavailable','retryable':False,'media_verified':False,'error_code':code,'say':messages.get(code,"I couldn't fully view this link, so I can't summarize it reliably.")+' No verified video or speech is available for this attempt. Keep the reply to this link only.'}

class Budget:
 def __init__(self):self.n=0;self.bytes=0;self.lock=threading.Lock();self.stop=False;self.last={};self.cache={};self.query_used=False;self.started=time.monotonic();self.deadline=self.started+30;self.slots=threading.Semaphore(4)
 def get(self,url):
  reserve=6291456 if urllib.parse.urlsplit(url).hostname=="static.cdninstagram.com" and urllib.parse.urlsplit(url).path.endswith(".js") else 2097152
  with self.slots:
   with self.lock:
    if url in self.cache:return self.cache[url]
    if self.stop or time.monotonic()>self.deadline or self.n>=250 or self.bytes+reserve>41943040:raise Denied('page budget')
    self.n+=1;self.bytes+=reserve
   try:r=fetch(url)
   except Exception as exc:
    with self.lock:
     self.bytes-=reserve
     if any(x in str(exc) for x in ('HTTP 403','HTTP 429')):self.stop=True
    raise
   with self.lock:self.bytes+=len(r['body'])-reserve;self.cache[url]=r;self.cache[r['url']]=r
   return r

def serve(path,budget):
 class Handler(http.server.BaseHTTPRequestHandler):
  def do_POST(self):
   try:
    size=int(self.headers.get('Content-Length','0'))
    if not 0<size<40000:raise Denied('request size')
    req=json.loads(self.rfile.read(size));u=req['url']
    if 'data' in req:
     with budget.lock:
      if budget.query_used or budget.stop or time.monotonic()>budget.deadline or budget.bytes+2097152>41943040:raise Denied('query budget')
      budget.query_used=True;budget.n+=1;budget.bytes+=2097152
     r=instagram_public_query(u,req['data'],budget.seed_html)
    else:r=budget.get(u)
    data=json.dumps({**r,'body':__import__('base64').b64encode(r['body']).decode()}).encode();self.send_response(200)
   except Exception as e:data=json.dumps({'error':str(e)[:100]}).encode();self.send_response(400)
   self.end_headers();self.wfile.write(data)
  def log_message(self,*args):pass
 class Server(socketserver.ThreadingMixIn,socketserver.UnixStreamServer):daemon_threads=True
 try:os.unlink(path)
 except FileNotFoundError:pass
 srv=Server(path,Handler);os.chmod(path,0o666);threading.Thread(target=srv.serve_forever,daemon=True).start();return srv
