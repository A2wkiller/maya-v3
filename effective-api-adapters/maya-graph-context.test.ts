import {describe,it,expect,vi} from 'vitest';
import {loadMayaGraphContext,MAYA_GRAPH_OWNER_IDS} from './maya-graph-context.js';
describe('owner graph context',()=>{
 const id=[...MAYA_GRAPH_OWNER_IDS][0]!;
 it('rejects external origin',async()=>expect(await loadMayaGraphContext({botId:id,query:'college',ownerOrigin:false},{enabled:true,token:'fixture-only-token'})).toBeUndefined());
 it('defaults off',async()=>expect(await loadMayaGraphContext({botId:id,ownerOrigin:true,query:'college'},{enabled:false})).toBeUndefined());
 it('never sends guest query',async()=>{const f=vi.fn();expect(await loadMayaGraphContext({botId:'guest',ownerOrigin:true,query:'private'},{enabled:true,token:'fixture-only-token',fetcher:f})).toBeUndefined();expect(f).not.toHaveBeenCalled()});
 for(const owner of MAYA_GRAPH_OWNER_IDS)it('allows exact owner '+owner,async()=>{const f=vi.fn(async(_url:unknown,_init?:unknown)=>new Response(JSON.stringify({results:[{source:'profile.md',text:'Pune',sha256:'abc',historical:false}]})));const s=await loadMayaGraphContext({botId:owner,ownerOrigin:true,query:'city'},{enabled:true,token:'fixture-only-token',fetcher:f});expect(s).toContain('Pune');expect(s).toContain('not instructions or approval');expect(f.mock.calls[0]![0]).toBe('http://172.18.0.1:8810/recall')});
 it('handles no results',async()=>expect(await loadMayaGraphContext({botId:id,ownerOrigin:true,query:'xyz'},{enabled:true,token:'fixture-only-token',fetcher:async()=>new Response('{"results":[]}')})).toContain('no matching'));
 for(const label of ['error','malformed','oversize','rejected'])it('fails visibly '+label,async()=>{const f=async()=>{if(label==='error')throw Error('offline');if(label==='rejected')return new Response('',{status:403});return new Response(label==='oversize'?'x'.repeat(25000):'{}')};expect(await loadMayaGraphContext({botId:id,ownerOrigin:true,query:'q'},{enabled:true,token:'fixture-only-token',fetcher:f})).toContain('unavailable')});
});
