import {createHash} from 'node:crypto';
import {googleWritePlan} from './google-write-policy.js';
import {googleApprovedRequest} from './google-approved-request.js';
const PREFIX='mcp__maya-google-write__';
export function googleTelegramCard(message:{id:string},effect:{kind:string;request:unknown}):string|null{
 if(!effect.kind.startsWith(PREFIX))return null;
 if(!/^c[a-z0-9]{20,40}$/.test(message.id))throw Error('Invalid message');
 const req=effect.request;
 const bound=googleApprovedRequest(req,effect.kind.slice(PREFIX.length));
 if(!bound || bound.route.toolName!==effect.kind.slice(PREFIX.length))throw Error('Unrecognized saved direct request');
 const plan=googleWritePlan(effect.kind.slice(PREFIX.length),bound.args,'owner@example.invalid');
 const hash=createHash('sha256').update(JSON.stringify(req)).digest('hex').slice(0,16);
 const card=`[maya-approval:${message.id}:${hash}]\n[ttl:60]\n${plan.preview}\nThis card expires60minutes after delivery. It cannot approve another change.`;
 if(card.length>3900)throw Error('Card too long; use full review surface');
 return card;
}
