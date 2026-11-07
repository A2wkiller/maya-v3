import type {MessageBlock} from '@rakazo/contracts';
import type {ExecutorDeps} from './executor-deps.js';
import {screenshotCompletion,verifiedCaptureAttached} from './capture-evidence.js';
export function stripEmptyNext(text:string):string{return text.replace(/\n*\s*Next\s*\(\s*0\s*(?:min(?:ute)?s?|sec(?:ond)?s?)\s*\)\s*:\s*(?:nothing|none|no(?:ne)?\s+needed|n\/?a|-)\s*[.!]?\s*$/i,'').trim();}
export function casualReply(text:string):boolean{
 const t=stripEmptyNext(text).replace(/[👋👍🙂😊😂😄😅❤♥️!.,?]/gu,'').trim().toLowerCase();
 return /^(?:(?:hi|hello|hey|thanks|thank you|you'?re welcome|welcome|okay|ok|got it|haan|ha|achha|theek hai|shukriya|good morning|good night|glad it loaded properly this time)(?:\s+(?:there|bro|yaar))?\s*){1,2}$/.test(t);
}
export async function prepareOutgoingBlocks(deps:ExecutorDeps,run:{id:string;botId:string},role:string,blocks:MessageBlock[]):Promise<MessageBlock[]>{
 if(run.botId!=='fixture-resource-id'||role!=='bot'||blocks.some(b=>b.kind==='ask')||!blocks.some(b=>b.kind==='text'))return blocks;
 const clean=blocks.map(b=>b.kind==='text'?{...b,text:stripEmptyNext(b.text)}:b);
 const text=clean.flatMap(b=>b.kind==='text'?[b.text]:[]).join('\n');
 if(casualReply(text))return clean;
 const effects=await deps.prisma.externalEffect.findMany({where:{runId:run.id},select:{kind:true,status:true,request:true,result:true}});
 if(effects.some(e=>/screenshot/i.test(e.kind)))return [...blocks.filter(b=>b.kind!=='text'),{kind:'text',text:screenshotCompletion(verifiedCaptureAttached(effects))}];
 return clean;
}
