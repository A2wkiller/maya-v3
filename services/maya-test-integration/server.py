"""Fictional test Maya only, fixed tool gateway, no account access."""
import sys,json,pathlib,hashlib,threading
sys.path[:0]=[str(pathlib.Path(__file__).parent/'specialists'),str(pathlib.Path(__file__).parent/'switches')]
from policy_harness import dispatch,Denied,validate_return
from registry import Registry,Rejected
from isolated_queue import Queue
from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
ROOT=pathlib.Path(__file__).parent
r=Registry(ROOT/'flags.json','test-bot','owner');lock=threading.Lock()
mcp=FastMCP('maya-switch-specialist-fixture',host='172.18.0.1',port=8805,streamable_http_path='/mcp')
@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True,destructiveHint=False,idempotentHint=True,openWorldHint=False))
def specialist_fixture(role:str,tool:str,source_id:str='fixture:orchard')->str:
 """Fictional T17/T18 test only. Fixed orchard facts, no real account, memory or files. Role/tool checked in code. Never changes feature config."""
 with lock:
  try:
   run=r.pin('feat-a','test-bot');r.check_step(run)
   dispatch(role,tool,'owner',('fixture:orchard',),(source_id,))
   if tool not in ('read_fictional_source','search_fictional_index'):raise Denied('only fixed research fixtures here')
   result={'role':role,'task_id':'fixture-test','evidence':[{'source_id':source_id,'fact':'Fictional Vega orchard waters on Tuesday.'}],'result':'Vega orchard waters on Tuesday.','limits':['fictional fixture only'],'blockers':[]}
   if not validate_return(result,('fixture:orchard',))[0]:raise Denied('invalid handoff')
   return json.dumps({'status':'completed','synthetic':True,'result':result})
  except (Denied,Rejected):return json.dumps({'status':'blocked','synthetic':True,'reason':'Fixture unavailable or denied by test policy.'})
# Added2026-11-05: fictional-only local embedding retrieval, no owner data.
sys.path.insert(0,"/home/maya/maya-adoption-stage/embedding")
from fictional_store import fictional_memory_lookup as _fictional_lookup
@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True,destructiveHint=False,idempotentHint=True,openWorldHint=False))
def fictional_memory_lookup(query:str)->str:
 """TEST ONLY four fictional notes; no owner data, files or writes."""
 return _fictional_lookup(query)

sys.path.insert(0,"/home/maya/maya-omb-adapt")
from fixture import exact_command_fixture as _exact_fixture
@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True,destructiveHint=False,idempotentHint=True,openWorldHint=False))
def fictional_exact_command_preview()->str:
 """TEST ONLY: fixed fictional command candidate display. Never runs commands or approves anything."""
 return json.dumps(_exact_fixture())

from fixture import adaptation_fixture as _adapt_fixture
@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True,destructiveHint=False,idempotentHint=True,openWorldHint=False))
def fictional_adaptation_preview()->str:
 """Fixed fictional decision/status/template demo. Never changes real runtime policy."""
 return json.dumps(_adapt_fixture())
if __name__=='__main__':mcp.run(transport='streamable-http')
