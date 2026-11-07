/** Actual personal-line storage contract from messaging-inbound.ts, isolated only. */
type Identity={id:string;botId:string};type Thread={id:string;spaceId:string;userId:string};type Message={id:string;clientNonce:string|null;createdAt:Date};
type Scope={spaceId:string;userId:string;provider:string;from:Date;now:Date};
type Reader={messagingIdentity:{findMany:(q:{where:{spaceId:string;userId:string;provider:string;verifiedAt:{not:null}};select:{id:true;botId:true};take:2})=>Promise<Identity[]>};thread:{findUnique:(q:{where:{botId:string};select:{id:true;spaceId:true;userId:true}})=>Promise<Thread|null>};message:{findMany:(q:{where:{threadId:string;role:'user';clientNonce:{startsWith:string};createdAt:{gte:Date;lte:Date};sourceRuns:{some:{trigger:'messaging';userId:string;spaceId:string;botId:string}}};select:{id:true;clientNonce:true;createdAt:true};orderBy:{createdAt:'asc'};take:10001})=>Promise<Message[]>}};
export async function linkedDmUsage(db:Reader,scope:Scope){
 if(!scope.spaceId||!scope.userId||!scope.provider||!Number.isFinite(scope.from.getTime())||!Number.isFinite(scope.now.getTime())||scope.from>scope.now)throw new Error('Verified scope and date window required');
 const identities=await db.messagingIdentity.findMany({where:{spaceId:scope.spaceId,userId:scope.userId,provider:scope.provider,verifiedAt:{not:null}},select:{id:true,botId:true},take:2});
 if(identities.length!==1)throw new Error('A single verified linked identity is required');
 const identity=identities[0]!;const thread=await db.thread.findUnique({where:{botId:identity.botId},select:{id:true,spaceId:true,userId:true}});
 if(!thread||thread.spaceId!==scope.spaceId||thread.userId!==scope.userId)throw new Error('Linked thread ownership mismatch');
 const prefix=`messaging:${scope.provider}:`;
 const rows=await db.message.findMany({where:{threadId:thread.id,role:'user',clientNonce:{startsWith:prefix},createdAt:{gte:scope.from,lte:scope.now},sourceRuns:{some:{trigger:'messaging',userId:scope.userId,spaceId:scope.spaceId,botId:identity.botId}}},select:{id:true,clientNonce:true,createdAt:true},orderBy:{createdAt:'asc'},take:10001});
 if(rows.length>10000)throw new Error('Narrow window; results exceed complete-count limit');
 const seen=new Set<string>();const days:Record<string,number>={};const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});
 for(const row of rows){if(!row.clientNonce?.startsWith(prefix)||!Number.isFinite(row.createdAt.getTime())||row.createdAt<scope.from||row.createdAt>scope.now||seen.has(row.clientNonce))continue;seen.add(row.clientNonce);const p=f.formatToParts(row.createdAt);const date=['year','month','day'].map(k=>p.find(x=>x.type===k)?.value).join('-');days[date]=(days[date]??0)+1;}
 return {days,scope:'linked_personal_channel_inbound_only',timeBasis:'server_message_created_at',timezone:'Asia/Kolkata',coversWebChats:false,coversGroups:false,humanAuthorshipProven:false,cost:null,tokens:null} as const;
}

/** Isolated, read-only projection over stock Run metadata. No endpoint is registered. */
export type RunMetadata = { id: string; status: string; updatedAt: Date; modelProvider: string | null; modelId: string | null };
export type RunReader = { run: { findMany: (args: { where: { spaceId: string; userId: string }; select: { id: true; status: true; updatedAt: true; modelProvider: true; modelId: true }; orderBy: { updatedAt: "desc" }; take: number }) => Promise<RunMetadata[]> } };
const statuses = new Set(["queued", "leased", "running", "waiting_input", "waiting_takeover", "completed", "failed", "cancelled"]);
export async function queueRunView(db: RunReader, context: { spaceId: string; userId: string; now: Date }) {
  if (!context.spaceId || !context.userId || !Number.isFinite(context.now.getTime())) throw new Error("Verified owner scope and time required");
  const rows = await db.run.findMany({ where: { spaceId: context.spaceId, userId: context.userId }, select: { id: true, status: true, updatedAt: true, modelProvider: true, modelId: true }, orderBy: { updatedAt: "desc" }, take: 100 });
  return rows.map((row) => {
    const age = context.now.getTime() - row.updatedAt.getTime();
    const verifiedTimestamp = Number.isFinite(age) && age >= 0;
    return { id: row.id, runStatus: statuses.has(row.status) ? row.status : "unknown", checkedAt: context.now.toISOString(), sourceUpdatedAt: verifiedTimestamp ? row.updatedAt.toISOString() : null, stale: !verifiedTimestamp || age > 900000, model: row.modelProvider && row.modelId ? `${row.modelProvider}/${row.modelId}` : "unknown", cost: null, capabilityState: "not_verified" as const, liveChangeAllowed: false as const };
  });
}
