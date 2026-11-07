import {it,expect,vi} from 'vitest';
vi.mock('node:fs',()=>({readFileSync:()=> 'synthetic-private-key-not-real-'.repeat(3)}));
import {googleApprovedRequest} from './google-approved-request.js';
import {googleTelegramCard} from './google-telegram-card.js';
import {executePrivateGoogle} from './google-private-execute.js';
const route={connectorId:'mcp',resourceId:'fixture-resource-id',toolName:'gmail_send',resourceRevision:2};
const args={to:['synthetic@example.invalid'],subject:'Recorded catalog shape',body:'No real send. Full review $50\nsecond line'};
function request(){return ['__rakazoCatalogTool','connectors_execute_tool',{id:'gmail_send',arguments:structuredClone(args)},structuredClone(route)] as any[];}
it('actual persisted catalog shape renders exact card',()=>{const c=googleTelegramCard({id:'fixture-resource-id'},{kind:'mcp__maya-google-write__gmail_send',request:request()})!;expect(c).toContain('synthetic@example.invalid');expect(c).toContain('Full review $50');expect(c).toContain('Allow once or Deny')});
it('bound catalog approved claim sends only one mock transport',async()=>{const send=vi.fn(async()=>new Response(JSON.stringify({status:'completed'})));const result=await executePrivateGoogle({}, {name:'mcp__maya-google-write__gmail_send',args,connectorCall:{route},claimedEffect:true,bypassApproval:false,applied:{effect:{id:'synthetic-effect',status:'approved',request:request()}},finish:async(x:any)=>x},send as any);expect(result).toMatchObject({status:'completed'});expect(send).toHaveBeenCalledOnce()});
for(const mutate of [(r:any[])=>r.pop(),(r:any[])=>r[3].resourceRevision=undefined,(r:any[])=>r[3].toolName='gmail_draft',(r:any[])=>r[2].id='other',(r:any[])=>r[2].approved=true,(r:any[])=>r[1]='other_execute_tool'])it('malformed catalog refused '+mutate.toString(),()=>{const r=request();mutate(r);expect(()=>googleApprovedRequest(r,'gmail_send')).toThrow()});
for(const field of ['resourceId','resourceRevision','connectorId','toolName'])it('changed live route refused '+field,async()=>{const send=vi.fn();await expect(executePrivateGoogle({}, {name:'mcp__maya-google-write__gmail_send',args,connectorCall:{route:{...route,[field]:'changed'}},claimedEffect:true,bypassApproval:false,applied:{effect:{id:'synthetic-effect',status:'approved',request:request()}},finish:async(x:any)=>x},send as any)).resolves.toMatchObject({status:'failed',sent:false,retry:false});expect(send).not.toHaveBeenCalled()});
it('changed inner args refused without transport',async()=>{const send=vi.fn();await expect(executePrivateGoogle({}, {name:'mcp__maya-google-write__gmail_send',args:{...args,to:['other@example.invalid']},connectorCall:{route},claimedEffect:true,bypassApproval:false,applied:{effect:{id:'synthetic-effect',status:'approved',request:request()}},finish:async(x:any)=>x},send as any)).resolves.toMatchObject({status:'failed',sent:false,retry:false});expect(send).not.toHaveBeenCalled()});

for(const tool of ['gmail_send','gmail_draft','gmail_trash','gmail_labels','calendar_create','calendar_update','calendar_delete','drive_create','drive_update','drive_trash','drive_share']){
 const full=`mcp__maya-google-write__${tool}`;
 const ids=[tool,full,`${route.resourceId}:${encodeURIComponent(tool)}`];
 for(const separator of [':','/','__','.'])for(const rest of [tool,full,encodeURIComponent(tool)])ids.push(`maya-google-write${separator}${rest}`,` MAYA-GOOGLE-WRITE${separator}${rest} `);
 for(const id of new Set(ids))it('runtime catalog spelling '+tool+' '+id,()=>{const r=request();r[2].id=id;r[3].toolName=tool;expect(googleApprovedRequest(r,tool).route.toolName).toBe(tool)});
}
