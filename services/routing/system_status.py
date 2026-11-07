#!/usr/bin/env python3
"""Fixed read-only host/config status. No arguments, env, keys or config dumps."""
import ast,datetime,json,os,pathlib,platform,shutil,subprocess,time
HOME=pathlib.Path('/home/maya')
def cmd(args):
 try:return subprocess.run(args,capture_output=True,text=True,timeout=4).stdout.strip()
 except Exception:return 'unavailable'
def cpu():
 vals=list(map(int,pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
 return sum(vals),vals[3]+vals[4]
def snapshot():
 a=cpu();time.sleep(.3);b=cpu();dt=b[0]-a[0]
 mem={line.split(':')[0]:int(line.split()[1])*1024 for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if ':' in line and len(line.split())>=2}
 disk=shutil.disk_usage('/')
 names=('maya-router','maya-tg-helper','maya-imgguard','cloudflared','ollama')
 out={'as_of_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),'host_scope':'Maya Linux VM only; not laptop','architecture':platform.machine(),'logical_cpus':os.cpu_count(),'cpu_busy_percent':round(100*(dt-(b[1]-a[1]))/dt,1) if dt else None,'load_1_5_15':os.getloadavg(),'ram_total_bytes':mem['MemTotal'],'ram_available_bytes':mem['MemAvailable'],'swap_total_bytes':mem['SwapTotal'],'disk_root_total_bytes':disk.total,'disk_root_used_bytes':disk.used,'disk_root_free_bytes':disk.free,'uptime_seconds':int(float(pathlib.Path('/proc/uptime').read_text().split()[0])),'services':{n:cmd(['systemctl','is-active',n]) for n in names}}
 # Parse only the fixed literal provider table; never execute router or read keys.
 tree=ast.parse((HOME/'maya-ops/router.py').read_text());models={}
 for node in tree.body:
  if not isinstance(node,ast.Assign):continue
  targets=[x.id for x in node.targets if isinstance(x,ast.Name)]
  if 'LIGHT' in targets:
   v=ast.literal_eval(node.value);models[v[0]]=v[2]
  if 'CHAIN' in targets:
   for row in node.value.elts:
    if isinstance(row,ast.Tuple):models[ast.literal_eval(row.elts[0])]=ast.literal_eval(row.elts[2])
 out['configured_router_models']=models
 routes=[]
 for line in (HOME/'maya-ops/router.log').read_text()[-18000:].splitlines():
  parts=line.split()
  if len(parts)>=5 and parts[2] in models and parts[3]=='200':routes.append({'server_log_time_utc':' '.join(parts[:2]),'provider':parts[2]})
 out['recent_successful_routes']=routes[-5:]
 out['route_policy']='simple: NVIDIA Lightning first; heavy: NVIDIA Ultra first; fallbacks configured, not guaranteed used; private-keyword router path: NVIDIA Ultra only, not local'
 cfg=json.loads((HOME/'hermes-mcp/model.json').read_text());out['hermes_models']={k:{x:v.get(x) for x in ('provider','model')} for k,v in cfg.items() if k in ('default','private')}
 out['gpu_check']=cmd(['nvidia-smi','--query-gpu=name,memory.total','--format=csv,noheader']) if shutil.which('nvidia-smi') else 'nvidia-smi unavailable; no local NVIDIA GPU verified'
 return out
if __name__=='__main__':print(json.dumps(snapshot(),indent=2))
