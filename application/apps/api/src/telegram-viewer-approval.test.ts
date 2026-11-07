import {describe,it,expect,vi} from 'vitest';
import {validApprovalBinding,handleTelegramApproval,requestHash} from './telegram-approval.js';
const good={action:'allow',from:'42',owner:'42',chat:'telegram:42',thread:'telegram:42',handle:'42:123',sentHandle:'42:123',runStatus:'waiting_input',effectStatus:'intended',age:0,hash:'same',savedHash:'same'};
describe('Telegram approval binding',()=>{
 it('accepts only once and deny choices with exact binding',()=>{expect(validApprovalBinding(good)).toBe(true);expect(validApprovalBinding({...good,action:'deny'})).toBe(true)});
 for(const [k,v] of Object.entries({action:'always',from:'attacker',chat:'telegram:group',handle:'42:124',runStatus:'cancelled',effectStatus:'applied',age:3600000,hash:'changed'}))it('rejects wrong '+k,()=>expect(validApprovalBinding({...good,[k]:v})).toBe(false));
 it('rejects pre-creation clock value',()=>expect(validApprovalBinding({...good,age:-1})).toBe(false));
 it('hash changes when exact request changes',()=>expect(requestHash({x:1})).not.toBe(requestHash({x:2})));
 for(const action of ['allow','deny']) it('answers bound action through native transaction, then replay fails',async()=>{
  const askId='fixture-resource-id';const req={tool:'fixture-only',args:{}};let status='waiting_input';let answered=0;const enqueue=vi.fn();
  const p={messagingIdentity:{findUnique:async()=>({id:'mi',provider:'telegram',address:'42',dmThreadId:'telegram:42',botId:'test',userId:'owner',spaceId:'space'})},message:{findUnique:async()=>({id:askId,threadId:'th',runId:'run',createdAt:new Date(),blocks:[{kind:'ask',status:'pending',approvalEffectId:'eff'}]})},run:{findUnique:async()=>({id:'run',botId:'test',userId:'owner',spaceId:'space',threadId:'th',trigger:'messaging',status})},externalEffect:{findFirst:async()=>({id:'eff',status:'intended',request:req,kind:'mcp__maya-user-view-test__view_user_link'})},messagingOutbound:{findMany:async()=>[{identityId:'mi',status:'sent',createdAt:new Date(),providerHandle:'42:123',body:`[maya-approval:${askId}:${requestHash(req)}]\nFictional approval expire60minutes`}]}};
  const deps={prisma:p,events:{answerRunInput:async(input:any)=>{expect(input.answer).toBe(action);answered++;status='queued';return true}},jobs:{enqueue}} as any;
  const input={provider:'telegram',threadId:'telegram:42',messageId:'42:123',from:'42',action,askId};
  expect(await handleTelegramApproval(deps,input)).toContain(action==='allow'?'Allowed once':'Denied');expect(answered).toBe(1);
  expect(await handleTelegramApproval(deps,input)).toContain('Nothing was approved');expect(answered).toBe(1);expect(enqueue).toHaveBeenCalledTimes(1);
 });
});

