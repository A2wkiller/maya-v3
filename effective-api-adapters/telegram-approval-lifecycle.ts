import {createHash} from 'node:crypto';
import {messagingDeliverJob} from '@rakazo/adapter-kit';
export const APPROVAL_TTL=3600000;
const kinds=['mcp__maya-health__capability_status','mcp__maya-health__server_status','mcp__maya-obscura__browser_console_messages','mcp__maya-user-view-test__view_user_link'];
export const isApprovalResend=(s:string)=>/^(?:please\s+)?(?:resend|send\s+(?:it|the\s+(?:approval\s+)?card)\s+again|resend\s+(?:the\s+)?(?:approval\s+)?card)[.!\s]*$/i.test(s.trim());
export function reminderNumber(age:number){return age>=600000&&age<APPROVAL_TTL?Math.min(5,Math.floor(age/600000)):0;}
export function approvalCard(message:any,effect:any){
 const hash=createHash('sha256').update(JSON.stringify(effect.request)).digest('hex').slice(0,16);
 const viewer=effect.kind==='mcp__maya-user-view-test__view_user_link';
 const name=viewer?'view the link you sent (read-only)':effect.kind.includes('browser_console')?'read browser errors (read-only)':'health check (read-only)';
 return `[maya-approval:${message.id}:${hash}]\n[ttl:60]\nMaya wants to run: ${name}.\nWhy: ${viewer?"you asked her to view this link.":"you asked her to check systems."}${JSON.stringify(Array.isArray(effect.request)?effect.request[2]?.arguments??{}:{})==='{}'?'':'\nDetails: '+JSON.stringify(effect.request[2]?.arguments??{})}`;
}
async function pending(deps:any,identity:any,threadId:string){
 const run=await deps.prisma.run.findFirst({where:{botId:identity.botId,threadId,trigger:'messaging'},orderBy:{createdAt:'desc'}});
 if(!run||run.status!=='waiting_input'||run.userId!==identity.userId||run.spaceId!==identity.spaceId)return null;
 const messages=await deps.prisma.message.findMany({where:{runId:run.id,role:'bot'},orderBy:{createdAt:'desc'}});
 for(const message of messages){const asks=Array.isArray(message.blocks)?message.blocks.filter((b:any)=>b.kind==='ask'&&b.status==='pending'&&b.approvalEffectId):[];if(asks.length!==1)continue;
 const effect=await deps.prisma.externalEffect.findFirst({where:{id:asks[0].approvalEffectId,runId:run.id,spaceId:run.spaceId,status:'intended'}});
 if(message.threadId!==run.threadId || !message.createdAt || Date.now()-message.createdAt.getTime()<0 || Date.now()-message.createdAt.getTime()>=APPROVAL_TTL)continue;
 if(effect&&effect.status==='intended'&&kinds.includes(effect.kind))return {run,message,effect};}
 return null;
}
export async function resendTelegramApproval(deps:any,identity:any,threadId:string,handle:string){
 const x=await pending(deps,identity,threadId);
 if(x)await deps.prisma.messagingOutbound.createMany({data:[{idempotencyKey:`approval-resend:${identity.id}:${handle}`,kind:'dm',identityId:identity.id,body:approvalCard(x.message,x.effect),sourceMessageId:x.message.id}],skipDuplicates:true});
 else await deps.prisma.messagingOutbound.createMany({data:[{idempotencyKey:`approval-resend:${identity.id}:${handle}`,kind:'dm',identityId:identity.id,body:'There is no eligible pending read-only approval to resend. Nothing was approved or restarted.'}],skipDuplicates:true});
 await deps.jobs.enqueue(messagingDeliverJob(x?.run.id));
}
export async function queueApprovalReminder(deps:any,runId:string){
 const run=await deps.prisma.run.findUnique({where:{id:runId}});if(!run||run.status!=="waiting_input")return;
 const identity=await deps.prisma.messagingIdentity.findUnique({where:{botId:run.botId}});if(!identity||identity.provider!=='telegram')return;
 const x=await pending(deps,identity,run.threadId);if(!x||x.run.id!==runId)return;
 const cards=await deps.prisma.messagingOutbound.findMany({where:{sourceMessageId:x.message.id,identityId:identity.id,status:'sent'},orderBy:{createdAt:'desc'},take:100}); const card=cards.find((o:any)=>o.body.startsWith(`[maya-approval:${x.message.id}:`));
 if(!card||!(card.body.includes('[ttl:60]')||card.body.includes('expire60minutes'))||!card.providerHandle)return;
 const age=Date.now()-card.createdAt.getTime();if(age<0||age>=APPROVAL_TTL)return;
 const n=reminderNumber(age);
 if(n)await deps.prisma.messagingOutbound.createMany({data:[{idempotencyKey:`approval-reminder:${card.id}:${n}`,kind:'dm',identityId:identity.id,sourceMessageId:x.message.id,body:`[maya-reminder:${card.providerHandle}]\nPlease approve or deny the pending read-only action using the card above. Nothing has run. Reminder ${n}/5.`}],skipDuplicates:true});
 if(n<5)await deps.jobs.enqueue({...messagingDeliverJob(runId,new Date(card.createdAt.getTime()+(n+1)*600000)),replaceKey:`approval-timer:${card.id}:${n+1}`,keepExisting:true});
}
