/** Test-only transport. Caller supplies an executor-owned, already-approved plan.
 * Not exported as a model tool and never accepts a model-supplied approval flag. */
import {googleWritePlan,verifyGoogleReplay} from './google-write-policy.js';
export function googleRequest(plan:ReturnType<typeof googleWritePlan>){
 const {tool,args}=verifyGoogleReplay(plan,plan.request.tool,plan.request.args,plan.request.account);
 const enc=encodeURIComponent;let method='POST',path='',body:any,headers:Record<string,string>={};
 const emailRaw=()=>{
  const lines=[`To: ${args.to.join(', ')}`,...(args.cc?.length?[`Cc: ${args.cc.join(', ')}`]:[]),...(args.bcc?.length?[`Bcc: ${args.bcc.join(', ')}`]:[]),`Subject: =?UTF-8?B?${Buffer.from(args.subject).toString('base64')}?=`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+Buffer.from(args.body).toString('base64')];
  return {raw:Buffer.from(lines.join('\r\n')).toString('base64url'),...(args.threadId?{threadId:args.threadId}:{})};
 };
 if(tool==='gmail_send'){path='/gmail/v1/users/me/messages/send';body=emailRaw()}
 else if(tool==='gmail_draft'){path='/gmail/v1/users/me/drafts';body={message:emailRaw()}}
 else if(tool==='gmail_trash'){path=`/gmail/v1/users/me/messages/${enc(args.messageId)}/trash`;body={}}
 else if(tool==='gmail_labels'){path=`/gmail/v1/users/me/messages/${enc(args.messageId)}/modify`;body={addLabelIds:args.addLabelIds,removeLabelIds:args.removeLabelIds}}
 else if(tool.startsWith('calendar_')){
  path=`/calendar/v3/calendars/${enc(args.calendarId)}/events`;
  if(tool!=='calendar_create'){path+='/'+enc(args.eventId);headers['If-Match']=args.etag;method=tool==='calendar_delete'?'DELETE':'PATCH'}
  path+='?sendUpdates='+enc(args.sendUpdates);
  if(args.event)body={...args.event,...(args.event.attendees?{attendees:args.event.attendees.map((email:string)=>({email}))}:{})};
 } else if(tool==='drive_share'){
  path=`/drive/v3/files/${enc(args.fileId)}/permissions?sendNotificationEmail=${args.notify}`;body={type:'user',emailAddress:args.email,role:args.role};headers['If-Match']=args.etag;
 } else if(tool==='drive_trash'){
  method='PATCH';path=`/drive/v3/files/${enc(args.fileId)}`;headers['If-Match']=args.etag;body={trashed:true};
 } else if(tool==='drive_create'){
  // One multipart create, not a metadata create followed by an uncertain content write.
  path='/upload/drive/v3/files?uploadType=multipart';
  const boundary='maya_'+plan.hash.slice(0,24);if(args.content.includes(boundary))throw Error('Boundary collision');
  headers['Content-Type']='multipart/related; boundary='+boundary;
  body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name:args.name,mimeType:args.mimeType,parents:[args.parentId]})}\r\n--${boundary}\r\nContent-Type: ${args.mimeType}; charset=UTF-8\r\n\r\n${args.content}\r\n--${boundary}--`;
 } else if(tool==='drive_update'){
  method='PATCH';headers['If-Match']=args.etag;
  if(args.content!==undefined){if(args.name!==undefined)throw Error('Split rename and content updates into separate approvals');path=`/upload/drive/v3/files/${enc(args.fileId)}?uploadType=media`;headers['Content-Type']=args.mimeType??'text/plain';body=args.content}
  else {path=`/drive/v3/files/${enc(args.fileId)}`;body={name:args.name}}
 } else throw Error('Unsupported write');
 return {method,url:'https://www.googleapis.com'+path,headers,body};
}
export async function executeGoogleWrite(plan:ReturnType<typeof googleWritePlan>,transport:(req:ReturnType<typeof googleRequest>)=>Promise<{status:number;result:unknown}>){
 const req=googleRequest(plan);
 try {const result=await transport(req);if(result.status===412)return {status:'changed',requiresNewApproval:true};if(result.status>=200&&result.status<300)return {status:'completed',result:result.result};return {status:'failed',http:result.status,retry:false}}
 catch{return {status:'uncertain',retry:false,reason:'Response missing. Verify outcome before any new action.'}}
}
