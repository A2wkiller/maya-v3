import {createHash} from 'node:crypto';
import type {PrismaClient,ThreadEvents} from '@rakazo/db';
import {runContinueJob} from '@rakazo/adapter-kit';
export const requestHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);
export function validApprovalBinding(x:{action:string;from:string;chat:string;owner:string;thread:string;handle:string;sentHandle:string;runStatus:string;effectStatus:string;age:number;hash:string;savedHash:string}) {
 return ['allow','deny'].includes(x.action)&&x.from===x.owner&&x.chat===x.thread&&x.handle===x.sentHandle&&x.runStatus==='waiting_input'&&x.effectStatus==='intended'&&x.age>=0&&x.age<3600000&&x.hash===x.savedHash;
}
export async function handleTelegramApproval(deps:{prisma:PrismaClient;events:Pick<ThreadEvents,'answerRunInput'>;jobs:{enqueue:(job:any)=>Promise<unknown>}}, input:{provider:string;threadId:string;messageId:string;from:string;action:string;askId:string}):Promise<string>{
 const refused='This approval is expired, already answered, or not yours. Nothing was approved. Open the pending request in Maya.';
 if(input.provider!=='telegram'||!/^c[a-z0-9]{20,40}$/.test(input.askId)||!['allow','deny'].includes(input.action))return refused;
 const identity=await deps.prisma.messagingIdentity.findUnique({where:{provider_address:{provider:input.provider,address:input.from}}});if(!identity)return refused;
 const message=await deps.prisma.message.findUnique({where:{id:input.askId}});if(!message?.runId)return refused;
 const run=await deps.prisma.run.findUnique({where:{id:message.runId}});if(!run||run.botId!==identity.botId||run.userId!==identity.userId||run.spaceId!==identity.spaceId||run.threadId!==message.threadId||run.trigger!=='messaging')return refused;
 const blocks=message.blocks as any[];const asks=Array.isArray(blocks)?blocks.filter(b=>b.kind==='ask'&&b.status==='pending'&&b.approvalEffectId):[];if(asks.length!==1)return refused;const ask=asks[0];
 const effect=await deps.prisma.externalEffect.findFirst({where:{id:ask.approvalEffectId,runId:run.id,spaceId:run.spaceId}});if(!effect || !["mcp__maya-health__capability_status","mcp__maya-health__server_status","mcp__maya-obscura__browser_console_messages","mcp__maya-user-view-test__view_user_link","mcp__maya-google-write__gmail_send","mcp__maya-google-write__gmail_draft","mcp__maya-google-write__gmail_trash","mcp__maya-google-write__gmail_labels","mcp__maya-google-write__calendar_create","mcp__maya-google-write__calendar_update","mcp__maya-google-write__calendar_delete","mcp__maya-google-write__drive_create","mcp__maya-google-write__drive_update","mcp__maya-google-write__drive_trash","mcp__maya-google-write__drive_share"].includes(effect.kind))return refused;
 const outs=await deps.prisma.messagingOutbound.findMany({where:{sourceMessageId:message.id,identityId:identity.id,status:"sent"},orderBy:{createdAt:"desc"},take:100}); const out=outs.find(o=>o.body.startsWith(`[maya-approval:${message.id}:`));if(!out||out.identityId!==identity.id||out.status!=='sent')return refused;
 const header=/^\[maya-approval:([a-z0-9]+):([a-f0-9]{16})\]\n/.exec(out.body);if(!header||header[1]!==message.id)return refused;
 if(!validApprovalBinding({action:input.action,from:input.from,owner:identity.address,chat:input.threadId,thread:identity.dmThreadId??'',handle:input.messageId,sentHandle:out.providerHandle??'',runStatus:run.status,effectStatus:effect.status,age:Date.now()-out.createdAt.getTime()+(out.body.includes("[ttl:60]")||out.body.includes("expire60minutes")?0:3000000),hash:requestHash(effect.request),savedHash:header[2]!}))return refused;
 const answered=await deps.events.answerRunInput({spaceId:run.spaceId,threadId:run.threadId,runId:run.id,messageId:message.id,answeredByUserId:identity.userId,answer:input.action,clientNonce:`tg-button:${message.id}:${input.action}`});if(!answered)return refused;
 await deps.jobs.enqueue(runContinueJob(run.id));return input.action==='allow'?'Allowed once for '+effect.kind+'.':'Denied '+effect.kind+'.';
}
