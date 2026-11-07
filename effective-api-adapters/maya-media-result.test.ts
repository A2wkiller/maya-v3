import {it,expect,vi} from 'vitest';
import {connectorTool} from './run-tools-integrations.js';
import {serializeToolResult} from './pi-runtime-tools.js';
it('delivers public reel frames as image blocks, not base64 JSON text',async()=>{
 const finish=vi.fn(async(x)=>x);
 const ctx:any={deps:{connector:{execute:async function*(){yield {type:'result',data:{content:[{type:'text',text:'{"media_verified":true,"transcript":"test"}'},{type:'image',data:'aGVsbG8=',mimeType:'image/jpeg'}]}};}},events:{append:async()=>{}}},run:{id:'run1'},bot:{},thread:{},context:{},state:{toolResults:new Map()}};
 const result:any=await connectorTool(ctx,{name:'mcp__maya-user-view-test__view_user_link',args:{url:'https://example.com/reel'},effectKey:'fixture',connectorCall:{},finish} as any);
 expect(result.kind).toBe('agent_tool_result');expect(result.content[1]).toMatchObject({type:'image',mimeType:'image/jpeg'});expect(ctx.state.toolResults.has('maya-view:https://example.com/reel')).toBe(true);
});
