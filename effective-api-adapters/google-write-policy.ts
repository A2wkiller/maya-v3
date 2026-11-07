/** Test-only policy: no credentials, network, or execution. */
import {createHash} from 'node:crypto';
export const GOOGLE_WRITES = ['gmail_send','gmail_draft','gmail_trash','gmail_labels','calendar_create','calendar_update','calendar_delete','drive_create','drive_update','drive_trash','drive_share'] as const;
export type GoogleWrite = typeof GOOGLE_WRITES[number];
const schemas:Record<GoogleWrite,string[]>={
 gmail_send:['to','cc','bcc','subject','body','threadId'],gmail_draft:['to','cc','bcc','subject','body','threadId'],gmail_trash:['messageId'],gmail_labels:['messageId','addLabelIds','removeLabelIds'],
 calendar_create:['calendarId','event','sendUpdates'],calendar_update:['calendarId','eventId','event','sendUpdates','etag'],calendar_delete:['calendarId','eventId','sendUpdates','etag'],
 drive_create:['name','mimeType','content','parentId'],drive_update:['fileId','name','mimeType','content','etag'],drive_trash:['fileId','etag'],drive_share:['fileId','email','role','notify','etag']};
function record(v:unknown):v is Record<string,any>{return !!v&&typeof v==='object'&&!Array.isArray(v)}
function text(v:unknown,max=4000){return typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b-\u001f]/.test(v)}
function email(v:unknown){return typeof v==='string'&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v)}
function id(v:unknown){return text(v,200)&&!!v&&!/[\r\n]/.test(v as string)}
function list(v:unknown,check:(x:unknown)=>boolean){return Array.isArray(v)&&v.length<=20&&v.every(check)}
function required(args:Record<string,any>,keys:string[]){if(keys.some(k=>args[k]===undefined))throw Error('Missing required argument')}
function exact(v:Record<string,any>,keys:string[]){if(Object.keys(v).some(k=>!keys.includes(k)))throw Error('Unknown argument')}
function event(v:unknown){
 if(!record(v))throw Error('Event required');exact(v,['summary','description','location','start','end','attendees']);required(v,['summary','start','end']);
 if(!text(v.summary,200)||!v.summary||['description','location'].some(k=>v[k]!==undefined&&!text(v[k])))throw Error('Invalid event text');
 for(const key of ['start','end']){if(!record(v[key]))throw Error('Event time required');exact(v[key],['dateTime','timeZone']);required(v[key],['dateTime','timeZone']);if(!text(v[key].dateTime,50)||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(v[key].dateTime)||!Number.isFinite(Date.parse(v[key].dateTime)))throw Error('Offset time required');try{new Intl.DateTimeFormat('en',{timeZone:v[key].timeZone}).format()}catch{throw Error('Timezone required')}}
 if(Date.parse(v.end.dateTime)<=Date.parse(v.start.dateTime))throw Error('Invalid event interval');
 if(v.attendees!==undefined&&!list(v.attendees,email))throw Error('Invalid attendees');
}
export function canonical(v:any):string{if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(record(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v)}
export function normalizeGoogleArgs(tool:string,value:unknown){
 if(!record(value))throw Error('Write arguments required');
 const args={...value};
 if(tool==='gmail_send'||tool==='gmail_draft'){
  if(Array.isArray(args.cc)&&args.cc.length===0)delete args.cc;
  if(Array.isArray(args.bcc)&&args.bcc.length===0)delete args.bcc;
  if(args.threadId===null)delete args.threadId;
 }
 return args;
}
export function googleWritePlan(tool:string,args:unknown,account:string){
 args=normalizeGoogleArgs(tool,args);
 if(!(GOOGLE_WRITES as readonly string[]).includes(tool)||!record(args)||!email(account))throw Error('Write not supported');
 const op=tool as GoogleWrite;exact(args,schemas[op]);
 if(op==='gmail_send'||op==='gmail_draft'){
  required(args,['to','subject','body']);if(!list(args.to,email)||!args.to.length||['cc','bcc'].some(k=>args[k]!==undefined&&!list(args[k],email))||!text(args.subject,200)||/[\r\n]/.test(args.subject)||!text(args.body,12000)||args.threadId!==undefined&&!id(args.threadId))throw Error('Invalid email');
 } else if(op==='gmail_trash'||op==='gmail_labels'){
  required(args,['messageId']);if(!id(args.messageId))throw Error('Invalid message ID');if(op==='gmail_labels'){required(args,['addLabelIds','removeLabelIds']);if(!list(args.addLabelIds,id)||!list(args.removeLabelIds,id))throw Error('Invalid labels')}
 } else if(op.startsWith('calendar_')){
  required(args,['calendarId','sendUpdates']);if(!id(args.calendarId)||!['all','none','externalOnly'].includes(args.sendUpdates))throw Error('Explicit calendar/notifications required');if(op!=='calendar_create'){required(args,['eventId','etag']);if(!id(args.eventId)||!id(args.etag))throw Error('Target revision required')}
  if(op!=='calendar_delete')event(args.event);
 } else {
  if(op==='drive_create'){required(args,['name','mimeType','content','parentId']);if(!id(args.parentId))throw Error('Parent required')}
  else {required(args,['fileId','etag']);if(!id(args.fileId)||!id(args.etag))throw Error('File/revision required')}
  if(op==='drive_create'||op==='drive_update'){
   if(args.name!==undefined&&(!text(args.name,200)||!args.name))throw Error('Invalid name');if(args.content!==undefined&&!text(args.content,12000))throw Error('Text files only');if(args.mimeType!==undefined&&!['text/plain','text/markdown','application/json'].includes(args.mimeType))throw Error('Supported text MIME required');if(op==='drive_update'&&args.name===undefined&&args.content===undefined)throw Error('No change');
  }
  if(op==='drive_share'){required(args,['email','role','notify']);if(!email(args.email)||!['reader','commenter','writer'].includes(args.role)||typeof args.notify!=='boolean')throw Error('Named person sharing only')}
 }
 const request=JSON.parse(canonical({account,tool:op,args}));
 const hash=createHash('sha256').update(canonical(request)).digest('hex');
 const preview=`Account: ${account}\nAction: ${op}\n${JSON.stringify(request.args,null,2)}\nOnly this exact change. Allow once or Deny.`;
 // Refuse rather than silently truncate an email/body/change at Telegram's limit.
 if(preview.length>3500)throw Error('Preview too long; split or use full review surface');
 return {request,hash,preview,requiresApproval:true,alwaysAllow:false};
}
export function verifyGoogleReplay(saved:ReturnType<typeof googleWritePlan>,tool:string,args:unknown,account:string){const live=googleWritePlan(tool,args,account);if(live.hash!==saved.hash||canonical(live.request)!==canonical(saved.request))throw Error('Request changed; new approval required');return live.request}
