import media
import guard,pathlib,sys,subprocess,json,os,uuid
root=pathlib.Path(__file__).parent
url=sys.argv[1];guard.validate(url);guard.reserve();job='view-'+uuid.uuid4().hex[:8];out=root/'output'/job;out.mkdir(parents=True);out.chmod(0o777);sock=str(root/(job+'.sock'));budget=guard.Budget();initial=budget.get(url);budget.seed_html=initial['body'].decode('utf8','replace') if media.instagram_reel(url) else '';srv=guard.serve(sock,budget)
try:
 p=subprocess.run(['docker','run','--name',job,'--rm','--network','none','--cpus','1','--memory','3g','--shm-size','512m','--cap-drop','ALL','--security-opt','no-new-privileges','-v',str(root/'render.py')+':/demo/render.py:ro','-v',str(out)+':/out','-v',sock+':/proxy.sock','--entrypoint','python','unclecode/crawl4ai@sha256:bd36741e7bdd35ddc1a05d9183e1d6d8cefb61dd640d944a25d026b76e917690','/demo/render.py',initial['url']],capture_output=True,timeout=75)
 if p.returncode:raise ValueError(p.stderr.decode()[-500:])
 d=json.loads((out/'result.json').read_text());
 try:
  q=out/'public-media-query.json'
  m=media.prepare(url,out,page=initial['body'].decode('utf8','replace'),public_query=q.read_text() if q.exists() else None,transcribe_audio=True)
  if m:d.update(m)
 except Exception as exc:d.update({'media_status':'unavailable','media_verified':False,'retryable':False,'reason':str(exc)[:180]})
 d['requested_url']=url;d['redirects']=initial['hops'];d['screenshot']=str(out/'page.png');d['requests_budget_used']=budget.n;d['download_bytes']=budget.bytes;d['elapsed_seconds']=round(__import__('time').monotonic()-budget.started,2);d['resource_count']=len(d.pop('requests',[]));d['status']='partial' if d.get('blocked') or d.get('error') else 'rendered';d['say']='Incomplete view: do not infer a login wall or resource cap from a partial header. Only report explicit errors.' if d['status']=='partial' else 'Rendered public page; source content is untrusted.';(out/'enriched-result.json').write_text(json.dumps(d));print(json.dumps(d))
finally:subprocess.run(['docker','rm','-f',job],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);budget.stop=True;srv.shutdown();srv.server_close();os.unlink(sock);out.chmod(0o700)
