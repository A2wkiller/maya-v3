import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {googleWritePlan,canonical,normalizeGoogleArgs} from './google-write-policy.js';
import {googleRequest} from './google-write-transport.js';
import {approvalRoutesMatch} from './approval-effect.js';
import {googleApprovedRequest} from './google-approved-request.js';
const PREFIX='mcp__maya-google-write__';
export async function executePrivateGoogle(ctx:any,call:any,send:typeof fetch=fetch){
 if(!call.name.startsWith(PREFIX))throw Error('Unsupported Google tool');
 const effect=call.applied?.effect;
 // An executor-owned claim is required; a model argument saying approved never counts.
 if(!effect||effect.status!=='approved'||!call.claimedEffect||call.bypassApproval)throw Error('Owner-approved effect claim required');
 let result:unknown;
 try {
 if(['fixture-resource-id','fixture-resource-id','fixture-resource-id','fixture-resource-id'].includes(effect.id))throw Error('Pre-repair request cannot be replayed');
 const plan=googleWritePlan(call.name.slice(PREFIX.length),call.args,'owner@example.invalid');
 const saved=effect.request;
 const bound=googleApprovedRequest(saved,call.name.slice(PREFIX.length));
 if(!approvalRoutesMatch(bound.route,call.connectorCall?.route)||bound.route.toolName!==call.name.slice(PREFIX.length)||canonical(normalizeGoogleArgs(call.name.slice(PREFIX.length),bound.args))!==canonical(normalizeGoogleArgs(call.name.slice(PREFIX.length),call.args)))throw Error('Approved request changed');
 let key:string|undefined;
 try{key=readFileSync('/tmp/maya-google-write-key','utf8').trim()}catch{key=undefined}
 if(!key||key.length<40)throw Error('Private Google bridge unavailable');
 const envelope={effectId:effect.id,planHash:plan.hash,request:googleRequest(plan),expires:Math.floor(Date.now()/1000)+30};
 const raw=JSON.stringify(envelope);const signature=createHmac('sha256',key).update(raw).digest('hex');
 try{
  const r=await send('http://172.18.0.1:18797/execute',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Maya-Signature':signature},body:raw,signal:AbortSignal.timeout(45000)});
  if(!r.ok)result={status:'failed',retry:false,http:r.status};else result=await r.json();
 }catch{result={status:'uncertain',retry:false,reason:'Response missing. Verify the saved effect before any new action.'};}
 } catch {result={status:"failed",sent:false,retry:false,reason:"Saved Google request could not be validated before transport. Nothing sent. New review required."};}
 return call.finish(result);
}
