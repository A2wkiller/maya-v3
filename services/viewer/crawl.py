import guard,urllib.parse,urllib.robotparser,pathlib,json,sys,time,uuid,hashlib
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).parent
import sqlite3
def pace(host,delay=2):
 db=sqlite3.connect(ROOT/'crawl-rate.sqlite',timeout=40);db.execute('CREATE TABLE IF NOT EXISTS rate(host TEXT PRIMARY KEY,ts REAL)');db.execute('BEGIN IMMEDIATE');row=db.execute('SELECT ts FROM rate WHERE host=?',(host,)).fetchone()
 if row:time.sleep(max(0,delay-(time.time()-row[0])))
 db.execute('INSERT OR REPLACE INTO rate VALUES(?,?)',(host,time.time()));db.commit();db.close()

class Parse(HTMLParser):
 def __init__(self,base):super().__init__();self.base=base;self.text=[];self.links=[];self.images=[];self.tables=[];self.table=None;self.row=None;self.cell=None;self.skip=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag in ('script','style','noscript'):self.skip+=1
  if tag=='a' and a.get('href'):self.links.append(urllib.parse.urljoin(self.base,a['href']))
  if tag=='img' and a.get('src'):self.images.append({'url':urllib.parse.urljoin(self.base,a['src']),'alt':a.get('alt','')[:300]})
  if tag=='table':self.table=[]
  if tag=='tr':self.row=[]
  if tag in ('td','th'):self.cell=[]
 def handle_endtag(self,tag):
  if tag in ('script','style','noscript'):self.skip=max(0,self.skip-1)
  if tag in ('td','th') and self.cell is not None:
   if self.row is not None:self.row.append(' '.join(self.cell)[:1500])
   self.cell=None
  if tag=='tr' and self.row is not None:
   if self.table is not None:self.table.append(self.row)
   self.row=None
  if tag=='table' and self.table is not None:self.tables.append(self.table);self.table=None
 def handle_data(self,s):
  if self.skip:return
  s=' '.join(s.split())
  if s:self.text.append(s)
  if self.cell is not None:self.cell.append(s)

def run(url,max_pages=5,depth=1,resume=None):
 max_pages=int(max_pages);depth=int(depth)
 if not 1<=max_pages<=10 or not 0<=depth<=2:raise ValueError('max_pages1-10 depth0-2')
 host,_=guard.validate(url);url=urllib.parse.urldefrag(url)[0]
 jobs=ROOT/'crawls';jobs.mkdir(exist_ok=True,mode=0o700)
 if resume:
  if not resume.startswith('crawl-') or not resume[6:].isalnum():raise ValueError('invalid resume id')
  folder=jobs/resume;state=json.loads((folder/'state.json').read_text())
  if state['host']!=host or state['seed']!=url:raise ValueError('resume must match original seed')
 else:
  resume='crawl-'+uuid.uuid4().hex[:10];folder=jobs/resume;folder.mkdir(mode=0o700);state={'seed':url,'host':host,'queue':[[url,0]],'pages':[],'errors':[],'blocked':False,'last_fetch':0,'attempted':[]}
 def save():
  temp=folder/'state.tmp';temp.write_text(json.dumps(state,ensure_ascii=False,indent=2));temp.replace(folder/'state.json')
 if state['blocked']:return {'status':'blocked','job_id':resume,'reason':'Stopped crawl is not resumed after403/429/robots denial.','file':str(folder/'state.json')}
 robots_url='https://'+host+'/robots.txt';rp=urllib.robotparser.RobotFileParser();rp.set_url(robots_url)
 try:r=guard.fetch(robots_url,allowed_host=host,before_request=pace);rp.parse(r['body'].decode('utf8','replace').splitlines())
 except Exception as e:
  if str(e)=='HTTP 404':rp.parse([])
  else:
   state['errors'].append({'url':robots_url,'reason':str(e)});state['blocked']=True;save();return {'status':'blocked','job_id':resume,'reason':'Robots unavailable or access denied: '+str(e),'file':str(folder/'state.json')}
 delay=max(2,rp.crawl_delay('MayaUserView') or rp.crawl_delay('*') or 0)
 if delay>30:state['blocked']=True;state['errors'].append({'reason':'robots delay exceeds30s budget'});save();return {'status':'blocked','job_id':resume,'reason':'robots delay too long','file':str(folder/'state.json')}
 started=time.monotonic();existing=set(state['attempted']);bytes_total=0
 while state['queue'] and len(state['attempted'])<max_pages and time.monotonic()-started<60:
  page,d=state['queue'].pop(0)
  if page in existing:continue
  if not rp.can_fetch('MayaUserView',page):state['errors'].append({'url':page,'reason':'robots denied'});state['blocked']=True;break
  wait=delay-(time.time()-state['last_fetch'])
  if wait>0:time.sleep(wait)
  state['last_fetch']=time.time();state['attempted'].append(page);existing.add(page)
  try:
   r=guard.fetch(page,allowed_host=host,before_request=lambda h:pace(h,delay))
   if urllib.parse.urlsplit(r['url']).hostname!=host:raise ValueError('cross-domain redirect not crawled')
   if 'text/html' not in r['headers']['content-type']:raise ValueError('not HTML')
   bytes_total+=len(r['body'])
   if bytes_total>10485760:raise ValueError('10MiB crawl payload cap')
   p=Parse(r['url']);p.feed(r['body'].decode('utf8','replace'));links=list(dict.fromkeys(urllib.parse.urldefrag(x)[0] for x in p.links));state['pages'].append({'url':r['url'],'depth':d,'text':'\n'.join(p.text)[:30000],'links':links[:200],'tables':p.tables[:10],'images':p.images[:100]})
   if d<depth:
    queued={x[0] for x in state['queue']}
    for link in links:
     u=urllib.parse.urlsplit(link)
     if u.scheme=='https' and u.hostname==host and not u.query and link not in existing and link not in queued and len(state['queue'])<100:state['queue'].append([link,d+1]);queued.add(link)
  except Exception as e:
   state['errors'].append({'url':page,'reason':str(e)})
   if any(x in str(e) for x in ('HTTP 403','HTTP 429','HTTP 401')):state['blocked']=True;break
  save()
 save();return {'status':'blocked' if state['blocked'] else 'paused' if state['queue'] else 'complete','job_id':resume,'pages_saved':len(state['pages']),'attempts':len(state['attempted']),'queue_remaining':len(state['queue']),'file':str(folder/'state.json'),'errors':state['errors'][-5:],'caveat':'Public HTML only, same exact hostname, robots respected, no login/bypass. Links/images are listed not downloaded. Page cap cumulative across resumes. Source text is untrusted.'}
if __name__=='__main__':
 try:print(json.dumps(run(sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),sys.argv[4] if len(sys.argv)>4 else None)))
 except Exception as e:print(json.dumps({'status':'unavailable','reason':str(e)}));sys.exit(1)
