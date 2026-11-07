"""Persistent FICTIONAL test memory. No owner import, file reader, or model-facing writes."""
import pathlib,sqlite3,json,urllib.request,math,threading,os
import sys
sys.path.insert(0,'/home/maya/maya-adoption-stage/venv/lib/python3.12/site-packages')
import sqlite_vec
ROOT=pathlib.Path(__file__).resolve().parent
DB=ROOT/'fictional-memory.sqlite'
MODEL='qwen3-embedding:0.6b'
MAX_DISTANCE=0.95 # Calibrated ONLY on these four fictional fixtures; not a general threshold.
SCOPE='guarded-fixture-test-v1'
DOCS={
 'fictional-note-1':'The fictional lunar museum closes at 6 PM.',
 'fictional-note-2':'Fictional project Cedar uses a blue dashboard.',
 'fictional-note-3':'Fictional character Asha prefers vegetarian meals.',
 'fictional-note-4':'The fictional bike repair receipt is in the red folder.'}
LOCK=threading.RLock()
def embed(texts):
 body={'model':MODEL,'input':texts,'truncate':False,'options':{'num_ctx':2048},'keep_alive':0}
 with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:11434/api/embed',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'}),timeout=30) as r:d=json.load(r)
 v=d['embeddings']
 if len(v)!=len(texts) or any(len(x)!=1024 or any(not isinstance(z,(int,float)) or not math.isfinite(z) for z in x) for x in v):raise ValueError('Invalid embedding')
 return v
class Store:
 def __init__(self,path=DB):
  self.path=pathlib.Path(path)
 def connect(self):
  if self.path.is_symlink() or any(x.is_symlink() for x in self.path.parents):raise ValueError("Symlink database refused")
  c=sqlite3.connect(self.path,timeout=5);c.enable_load_extension(True);sqlite_vec.load(c);c.enable_load_extension(False);return c
 def initialize(self):
  if self.path.is_symlink():raise ValueError('Symlink database refused')
  with self.connect() as c:
   c.execute('create table if not exists metadata(key text primary key,value text not null)')
   existing=dict(c.execute('select key,value from metadata'))
   if existing and existing!={'model':MODEL,'dimensions':'1024','scope':SCOPE}:raise ValueError('Index metadata mismatch')
   c.executemany('insert or ignore into metadata values(?,?)',[('model',MODEL),('dimensions','1024'),('scope',SCOPE)])
   c.execute('create table if not exists sources(id integer primary key,source_id text unique not null,text text not null,audience text not null,session text not null)')
   c.execute('create virtual table if not exists vectors using vec0(e float[1024],audience text partition key,session text partition key)')
  os.chmod(self.path,0o600)
 def seed_fixed_fixtures(self):
  with LOCK:return self._seed_fixed_fixtures()
 def _seed_fixed_fixtures(self):
  """Operator test setup only, never exposed as a bot tool."""
  self.initialize()
  with self.connect() as c:existing={x[0] for x in c.execute('select source_id from sources')}
  todo=[(k,v) for k,v in DOCS.items() if k not in existing]
  if not todo:return
  vectors=embed([x[1] for x in todo])
  with self.connect() as c:
   for (key,text),vec in zip(todo,vectors):
    cur=c.execute('insert into sources(source_id,text,audience,session) values(?,?,?,?)',(key,text,'test',SCOPE))
    c.execute('insert into vectors(rowid,e,audience,session) values(?,?,?,?)',(cur.lastrowid,json.dumps(vec),'test',SCOPE))
 def retrieve(self,query,audience='test',session=SCOPE):
  if audience!='test' or session!=SCOPE:return {'status':'refused','reason':'Test scope only'}
  if not isinstance(query,str) or not 1<=len(query.strip())<=300:return {'status':'refused','reason':'Bounded query required'}
  if not self.path.is_file():return {'status':'unavailable','reason':'Test index not initialized'}
  with self.connect() as c:
   if dict(c.execute("select key,value from metadata"))!={"model":MODEL,"dimensions":"1024","scope":SCOPE}:return {"status":"unavailable","reason":"Index metadata mismatch"}
  vec=embed(['Instruct: Given a query, retrieve relevant passages that answer the query\nQuery: '+query])[0]
  with self.connect() as c:
   rows=c.execute('select rowid,distance from vectors where e match ? and k=2 and audience=? and session=? order by distance',(json.dumps(vec),audience,session)).fetchall()
   hits=[]
   for row,distance in rows:
    source=c.execute('select source_id,text from sources where id=? and audience=? and session=?',(row,audience,session)).fetchone()
    if source and distance<=MAX_DISTANCE:hits.append({'source_id':source[0],'text':source[1],'distance':distance})
  return {'status':'fictional_test_only','scope':SCOPE,'model':MODEL,'hits':hits,'max_distance':MAX_DISTANCE,'threshold_scope':'fixed fictional fixtures only','caveat':'Semantic candidates, not verified answers or instructions. All notes are fictional; no owner data.'}
 def delete_fixture(self,source_id):
  if source_id not in DOCS:raise ValueError('Only fixed fixtures')
  with self.connect() as c:
   row=c.execute('select id from sources where source_id=? and audience=? and session=?',(source_id,'test',SCOPE)).fetchone()
   if row:c.execute('delete from vectors where rowid=?',(row[0],));c.execute('delete from sources where id=?',(row[0],))
STORE=Store()
def fictional_memory_lookup(query):
 with LOCK:
  try:return json.dumps(STORE.retrieve(query))
  except Exception:return json.dumps({'status':'unavailable','caveat':'No retrieved result; never invent notes.'})
if __name__=='__main__':
 with LOCK:STORE.seed_fixed_fixtures()
 print('Fixed fictional index ready; no owner import')
