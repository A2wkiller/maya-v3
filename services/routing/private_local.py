"""Fixed VM-only model route. No provider choice or cloud fallback."""
import http.client,json,time,threading,socket
HOST='127.0.0.1';PORT=11434;MODEL='qwen3:4b-32k';LIMIT=180
NOTICE='Running this locally on the VM. It may take a few minutes.'
ERROR='The local model did not finish. Nothing was sent to a cloud model. Try a shorter request.'
def execute_local(body,connection=http.client.HTTPConnection):
 request=dict(body);request['model']=MODEL;request['stream']=False
 request['max_tokens']=min(int(request.get('max_tokens') or 512),512)
 c=connection(HOST,PORT,timeout=LIMIT)
 active_sockets=[]
 def interrupt():
  for sock in active_sockets:
   try:sock.shutdown(socket.SHUT_RDWR)
   except OSError:pass
  c.close()
 timer=threading.Timer(LIMIT,interrupt);timer.daemon=True;timer.start()
 try:
  if hasattr(c,'connect'):
   c.connect();active_sockets.append(c.sock)
  c.request('POST','/v1/chat/completions',json.dumps(request).encode(),{'Content-Type':'application/json'})
  r=c.getresponse()
  if r.status!=200:raise RuntimeError('local unavailable')
  data=r.read(2*1024*1024+1)
  if len(data)>2*1024*1024:raise RuntimeError('local result too large')
  result=json.loads(data)
  if not isinstance(result.get('choices'),list) or not result['choices']:raise RuntimeError('local invalid response')
  return result
 finally:timer.cancel();c.close()
def serve_private(handler,body):
 streaming=body.get('stream') is True
 def emit(data):handler.wfile.write(('data: '+json.dumps(data)+'\n\n').encode());handler.wfile.flush()
 if streaming:
  handler.send_response(200);handler.send_header('Content-Type','text/event-stream');handler.send_header('Connection','close');handler.end_headers()
  emit({'id':'private-local','object':'chat.completion.chunk','choices':[{'index':0,'delta':{'role':'assistant','content':NOTICE+'\n'},'finish_reason':None}]})
 try:result=execute_local(body)
 except Exception:
  result={'id':'private-local','object':'chat.completion','choices':[{'index':0,'message':{'role':'assistant','content':ERROR},'finish_reason':'stop'}]}
 if not streaming:return handler.send_json(200,result)
 for choice in result['choices']:
  message=choice.get('message') or {}
  delta={k:v for k,v in message.items() if k in ('content','tool_calls','role')}
  if 'tool_calls' in delta:delta['tool_calls']=[{'index':i,**tc}for i,tc in enumerate(delta['tool_calls'])]
  emit({'id':result.get('id','private-local'),'object':'chat.completion.chunk','choices':[{'index':choice.get('index',0),'delta':delta,'finish_reason':None}]})
  emit({'id':result.get('id','private-local'),'object':'chat.completion.chunk','choices':[{'index':choice.get('index',0),'delta':{},'finish_reason':choice.get('finish_reason') or 'stop'}]})
 handler.wfile.write(b'data: [DONE]\n\n');handler.wfile.flush();handler.close_connection=True
