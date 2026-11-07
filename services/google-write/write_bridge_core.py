"""Private write boundary candidate. No network, credentials or listener on import."""
import hashlib,hmac,json,pathlib,re,sqlite3,time,urllib.parse
class Refused(Exception):pass
class Bridge:
 def __init__(self,root,key,transport,clock=time.time):
  self.root=pathlib.Path(root);self.root.mkdir(mode=0o700,parents=True,exist_ok=True);self.root.chmod(0o700);self.db=self.root/'writes.sqlite';self.key=key;self.transport=transport;self.clock=clock
  with self.connect() as d:d.execute('CREATE TABLE IF NOT EXISTS writes (id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT)')
  self.db.chmod(0o600)
 def connect(self):return sqlite3.connect(self.db,timeout=5,isolation_level='IMMEDIATE')
 def execute(self,raw,signature):
  if not isinstance(raw,bytes) or len(raw)>80000 or not hmac.compare_digest(hmac.new(self.key,raw,hashlib.sha256).hexdigest(),signature):raise Refused('Unauthorized')
  try:p=json.loads(raw)
  except Exception:raise Refused('Invalid JSON')
  if not isinstance(p,dict) or set(p)!={'effectId','planHash','request','expires'}:raise Refused('Invalid envelope')
  if not isinstance(p['effectId'],str) or not re.fullmatch(r'[A-Za-z0-9_:-]{1,200}',p['effectId']) or not isinstance(p['planHash'],str) or not re.fullmatch('[0-9a-f]{64}',p['planHash']):raise Refused('Invalid effect')
  if type(p['expires']) not in (int,float) or not self.clock()<p['expires']<=self.clock()+60:raise Refused('Expired')
  r=p['request']
  if not isinstance(r,dict) or set(r)-{'method','url','headers','body'} or not {'method','url','headers'}<=set(r):raise Refused('Invalid request')
  u=urllib.parse.urlsplit(r['url'])
  if u.scheme!='https' or u.netloc!='www.googleapis.com' or u.fragment or u.username or u.password:raise Refused('Invalid host')
  if r['method'] not in ('POST','PATCH','DELETE') or not isinstance(r['headers'],dict) or set(r['headers'])-{'If-Match','Content-Type'} or any(not isinstance(v,str) or '\r' in v or '\n' in v for v in r['headers'].values()):raise Refused('Invalid method or headers')
  routes=[('POST',r'/gmail/v1/users/me/messages/send'),('POST',r'/gmail/v1/users/me/drafts'),('POST',r'/gmail/v1/users/me/messages/[A-Za-z0-9_%.-]+/(trash|modify)'),('POST',r'/calendar/v3/calendars/[^/]+/events'),('PATCH',r'/calendar/v3/calendars/[^/]+/events/[^/]+'),('DELETE',r'/calendar/v3/calendars/[^/]+/events/[^/]+'),('POST',r'/drive/v3/files/[^/]+/permissions'),('PATCH',r'/drive/v3/files/[^/]+'),('POST',r'/upload/drive/v3/files'),('PATCH',r'/upload/drive/v3/files/[^/]+')]
  if not any(r['method']==m and re.fullmatch(path,u.path) for m,path in routes):raise Refused('Unsupported endpoint')
  # All future attempts with this effect ID are blocked, including crash/timeouts.
  digest=hashlib.sha256(raw).hexdigest()
  with self.connect() as d:
   d.execute('BEGIN IMMEDIATE')
   row=d.execute('SELECT digest,result FROM writes WHERE id=?',(p['effectId'],)).fetchone()
   if row:
    if row[0]!=digest:raise Refused('Effect changed')
    return json.loads(row[1]) if row[1] else {'status':'uncertain','retry':False}
   d.execute('INSERT INTO writes(id,digest) VALUES (?,?)',(p['effectId'],digest))
  try:
   status,result=self.transport(r)
   if status==412:out={'status':'changed','requiresNewApproval':True}
   elif 200<=status<300:out={'status':'completed','result':{k:result[k] for k in ('id','threadId','htmlLink','webViewLink') if k in result}}
   else:out={'status':'failed','http':status,'retry':False}
  except Exception:out={'status':'uncertain','retry':False}
  with self.connect() as d:d.execute('UPDATE writes SET result=? WHERE id=?',(json.dumps(out),p['effectId']))
  return out
