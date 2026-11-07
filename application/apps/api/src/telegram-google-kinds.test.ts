import {describe,it,expect,vi} from 'vitest';
const GOOGLE_WRITES = ['gmail_send','gmail_draft','gmail_trash','gmail_labels','calendar_create','calendar_update','calendar_delete','drive_create','drive_update','drive_trash','drive_share'] as const;
import {handleTelegramApproval,requestHash} from './telegram-approval.js';
function fixture(kind:string){
 const askId='fixture-resource-id';const request={fictional:true,tool:kind};
 const identity={id:'mi',provider:'telegram',address:'42',dmThreadId:'telegram:42',botId:'b',userId:'u',spaceId:'s'};
 const message={id:askId,threadId:'t',runId:'r',blocks:[{kind:'ask',status:'pending',approvalEffectId:'e'}]};
 const run={id:'r',botId:'b',userId:'u',spaceId:'s',threadId:'t',trigger:'messaging',status:'waiting_input'};
 const effect={id:'e',kind,status:'intended',request};
 const card={identityId:'mi',status:'sent',createdAt:new Date(),providerHandle:'42:123',body:`[maya-approval:${askId}:${requestHash(request)}]\n[ttl:60]\nSynthetic review only`};
 const answerRunInput=vi.fn(async(input:any)=>{run.status='queued';return true});const enqueue=vi.fn();
 const deps={prisma:{messagingIdentity:{findUnique:async()=>identity},message:{findUnique:async()=>message},run:{findUnique:async()=>run},externalEffect:{findFirst:async()=>effect},messagingOutbound:{findMany:async()=>[card]}},events:{answerRunInput},jobs:{enqueue}} as any;
 const input={provider:'telegram',threadId:'telegram:42',messageId:'42:123',from:'42',action:'allow',askId};
 return {identity,message,run,effect,card,deps,input,answerRunInput,enqueue};
}
describe('supported Google callback choices only',()=>{
 for(const op of GOOGLE_WRITES)for(const action of ['allow','deny'])it(op+' '+action+' consumes only bound decision, not a write',async()=>{const f=fixture('mcp__maya-google-write__'+op);f.input.action=action;expect(await handleTelegramApproval(f.deps,f.input)).toContain(action==='allow'?'Allowed once':'Denied');expect(f.answerRunInput).toHaveBeenCalledOnce();expect(f.answerRunInput.mock.calls[0]![0]).toMatchObject({answer:action,runId:'r',messageId:f.input.askId,answeredByUserId:'u'});expect(f.enqueue).toHaveBeenCalledOnce();expect(await handleTelegramApproval(f.deps,f.input)).toContain('Nothing was approved');expect(f.answerRunInput).toHaveBeenCalledOnce()});
 for(const kind of ['mcp__maya-google-write__gmail_send_extra','mcp__maya-google-write__delete_all','mcp__other__gmail_send','shell','mcp__maya-google-write__'])it('refuses unsupported '+kind,async()=>{const f=fixture(kind);expect(await handleTelegramApproval(f.deps,f.input)).toContain('Nothing was approved');expect(f.answerRunInput).not.toHaveBeenCalled();expect(f.enqueue).not.toHaveBeenCalled()});
 for(const mutation of ['group','bot','space','thread','trigger','cancelled','denied','hash','expiry','future','unsent','identity','multipleasks','nonce'])it('refuses '+mutation,async()=>{const f=fixture('mcp__maya-google-write__gmail_send');
 if(mutation==='group')f.input.threadId='telegram:group';if(mutation==='bot')f.run.botId='other';if(mutation==='space')f.run.spaceId='other';if(mutation==='thread')f.message.threadId='other';if(mutation==='trigger')f.run.trigger='webhook';if(mutation==='cancelled')f.run.status='cancelled';if(mutation==='denied')f.effect.status='denied';if(mutation==='hash')f.effect.request={fictional:false,tool:'changed'};if(mutation==='expiry')f.card.createdAt=new Date(Date.now()-3600010);if(mutation==='future')f.card.createdAt=new Date(Date.now()+60000);if(mutation==='unsent')f.card.status='pending';if(mutation==='identity')f.card.identityId='other';if(mutation==='multipleasks')f.message.blocks.push({kind:'ask',status:'pending',approvalEffectId:'other'});if(mutation==='nonce')f.input.action='always';
 expect(await handleTelegramApproval(f.deps,f.input)).toContain('Nothing was approved');expect(f.answerRunInput).not.toHaveBeenCalled();expect(f.enqueue).not.toHaveBeenCalled();});
 it('does not resume when native decision transaction declines',async()=>{const f=fixture('mcp__maya-google-write__gmail_send');f.answerRunInput.mockImplementation(async()=>false);expect(await handleTelegramApproval(f.deps,f.input)).toContain('Nothing was approved');expect(f.enqueue).not.toHaveBeenCalled();});
});
