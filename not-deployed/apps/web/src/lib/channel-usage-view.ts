/** Isolated metadata-only intake for a verified channel owner. Not registered. */
type Query = {where:{externalConversation:{spaceId:string;userId:string;provider:string};senderId:string;senderIsBot:false;kind:"direct";createdAt:{gte:Date;lte:Date}};select:{id:true;providerEventId:true;externalConversationId:true;createdAt:true};orderBy:{createdAt:"asc"};take:number};
type MessageMetadata={id:string;providerEventId:string;externalConversationId:string;createdAt:Date};
type Reader={externalMessage:{findMany:(q:Query)=>Promise<MessageMetadata[]>}};
export async function channelUsageView(db:Reader,scope:{spaceId:string;userId:string;provider:string;ownerSenderId:string;bindingVerified:boolean;from:Date;now:Date}){
 if(!scope.spaceId||!scope.userId||!scope.provider||!scope.ownerSenderId||scope.bindingVerified!==true||!Number.isFinite(scope.from.getTime())||!Number.isFinite(scope.now.getTime())||scope.from>scope.now)throw new Error('Verified owner-channel binding and date window required');
 const rows=await db.externalMessage.findMany({where:{externalConversation:{spaceId:scope.spaceId,userId:scope.userId,provider:scope.provider},senderId:scope.ownerSenderId,senderIsBot:false,kind:'direct',createdAt:{gte:scope.from,lte:scope.now}},select:{id:true,providerEventId:true,externalConversationId:true,createdAt:true},orderBy:{createdAt:'asc'},take:10001});
 if(rows.length>10000)throw new Error('Window too large; narrow it rather than show incomplete counts');
 const seen=new Set<string>();const daily=new Map<string,number>();const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});
 for(const row of rows){if(!row.id||!row.providerEventId||!row.externalConversationId||!Number.isFinite(row.createdAt.getTime())||row.createdAt<scope.from||row.createdAt>scope.now)continue;const key=JSON.stringify([row.externalConversationId,row.providerEventId]);if(seen.has(key))continue;seen.add(key);const parts=formatter.formatToParts(row.createdAt);const date=['year','month','day'].map(k=>parts.find(p=>p.type===k)?.value).join('-');daily.set(date,(daily.get(date)??0)+1);}
 return {days:Object.fromEntries([...daily].sort()),scope:'verified_owner_direct_channel_only',timezone:'Asia/Kolkata',timeBasis:'server_received_at',coversWebChats:false,cost:null,tokens:null,checkedAt:scope.now.toISOString()};
}
