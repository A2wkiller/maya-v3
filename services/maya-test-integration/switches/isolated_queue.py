"""Fictional-only process queue adapter, not wired to Maya. No networking."""
import json,sqlite3,sys
from registry import Registry,Rejected,guest_error
class Queue:
 def __init__(self,db,registry):
  self.db=sqlite3.connect(db);self.r=registry
  self.db.executescript('CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,feature TEXT,bot TEXT,guest INTEGER,tool TEXT,state TEXT,result TEXT);CREATE TABLE IF NOT EXISTS mock_effects(job TEXT UNIQUE,value TEXT);')
 def add(self,id,feature='feat-a',bot='owner',guest=False,tool='mock_read'):
  self.db.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?,?)',(id,feature,bot,int(guest),tool,'queued',None));self.db.commit()
 def run(self,id,crash_after_claim=False,recover=False):
  row=self.db.execute('SELECT * FROM jobs WHERE id=?',(id,)).fetchone()
  if not row:return None
  _,feature,bot,guest,tool,state,result=row
  if state!='queued':
   if state=='executing' and recover:self.db.execute('UPDATE jobs SET state=?,result=? WHERE id=?',('uncertain','No automatic replay',id));self.db.commit()
   return self.db.execute('SELECT state FROM jobs WHERE id=?',(id,)).fetchone()[0]
  try:
   pin=self.r.pin(feature,bot,bool(guest))
   if tool not in {'mock_read','mock_write'}:raise Rejected('unknown tool')
   self.r.check_step(pin)
  except Rejected:
   message=guest_error() if guest else 'Feature unavailable; configuration or access review required.'
   self.db.execute('UPDATE jobs SET state=?,result=? WHERE id=?',('blocked',message,id));self.db.commit();return 'blocked'
  claimed=self.db.execute('UPDATE jobs SET state=? WHERE id=? AND state=?',('executing',id,'queued')).rowcount;self.db.commit()
  if claimed!=1:return self.db.execute('SELECT state FROM jobs WHERE id=?',(id,)).fetchone()[0]
  if crash_after_claim:return 'executing'
  # Check immediately before the mock effect. No external service is reachable here.
  try:self.r.check_step(pin)
  except Rejected:
   self.db.execute('UPDATE jobs SET state=?,result=? WHERE id=?',('blocked','Feature unavailable',id));self.db.commit();return 'blocked'
  with self.db:
   self.db.execute('INSERT INTO mock_effects VALUES(?,?)',(id,'fictional only'))
   self.db.execute('UPDATE jobs SET state=?,result=? WHERE id=?',('completed',json.dumps({'mock':True,'tool':tool}),id))
  return 'completed'
if __name__=='__main__':
 db,config,id=sys.argv[1:4]
 q=Queue(db,Registry(config,'test-bot','owner'));print(q.run(id,crash_after_claim='--crash' in sys.argv,recover='--recover' in sys.argv))
