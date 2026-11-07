import assert from 'node:assert/strict';
import {createDb} from '../packages/db/src/client.ts';
import {asSystem} from '../packages/db/src/row-security.ts';
import {linkedDmUsage} from '../apps/web/src/lib/linked-dm-usage.ts';
import {queueRunView} from '../apps/web/src/lib/queue-run-view.ts';
const url=process.env.DATABASE_URL;
if(url!=='postgresql://postgres@127.0.0.1:5432/queue_fixture')throw new Error('Fresh isolated fixture database only');
const handles=createDb(url,{encryptContent:false,applicationName:'queue-isolated-proof'});const db=asSystem(handles.prisma,'isolated fictional queue fixture');
const now=new Date('2026-11-07T08:00:00Z'),from=new Date('2026-11-01');
try{
 assert.equal(await db.user.count(),0,'refuse existing database');
 await db.user.create({data:{id:'fictional-a',name:'Fixture A',email:'a@fixture.invalid'}});
 await db.user.create({data:{id:'fictional-b',name:'Fixture B',email:'b@fixture.invalid'}});
 await db.organization.create({data:{id:'org-fixture',name:'Fixture',slug:'queue-fixture',createdAt:now}});
 await db.space.create({data:{id:'space-a',organizationId:'org-fixture',name:'Fixture A'}});
 await db.space.create({data:{id:'space-b',organizationId:'org-fixture',name:'Fixture B'}});
 for(const suffix of ['a','b']){await db.bot.create({data:{id:`bot-${suffix}`,spaceId:`space-${suffix}`,userId:`fictional-${suffix}`,name:'Fixture',color:'blue'}});await db.thread.create({data:{id:`thread-${suffix}`,spaceId:`space-${suffix}`,userId:`fictional-${suffix}`,botId:`bot-${suffix}`}});await db.messagingIdentity.create({data:{id:`identity-${suffix}`,provider:'telegram',address:`fixture-${suffix}`,userId:`fictional-${suffix}`,spaceId:`space-${suffix}`,botId:`bot-${suffix}`,verifiedAt:now}});}
 const fixtures=[['one','messaging:telegram:1','messaging','a'],['two','messaging:telegram:2','messaging','a'],['web','assistant-test','user','a'],['peer','messaging-peer:fixture','messaging','a'],['cron','messaging:telegram:cron','routine','a'],['foreign','messaging:telegram:foreign','messaging','b']];
 let seq=0;
 for(const [id,nonce,trigger,suffix] of fixtures){const common={spaceId:`space-${suffix}`,userId:`fictional-${suffix}`,botId:`bot-${suffix}`,threadId:`thread-${suffix}`};await db.message.create({data:{id:`message-${id}`,threadId:common.threadId,role:'user',blocks:[{kind:'text',text:'fictional-private-body'}],seq:seq++,clientNonce:nonce,createdAt:new Date('2026-11-06T20:00:00Z')}});await db.task.create({data:{id:`task-${id}`,...common,prompt:'fictional-private-prompt',status:'completed'}});await db.run.create({data:{id:`run-${id}`,...common,taskId:`task-${id}`,trigger,status:'completed',sourceMessageId:`message-${id}`,updatedAt:now}});}
 const scope={spaceId:'space-a',userId:'fictional-a',provider:'telegram',from,now};
 const usage=await linkedDmUsage(db,scope);assert.deepEqual(usage.days,{'2026-11-07':2});assert.equal(usage.humanAuthorshipProven,false);assert.equal(usage.coversWebChats,false);assert.ok(!JSON.stringify(usage).includes('fictional-private'));
 const other=await linkedDmUsage(db,{...scope,spaceId:'space-b',userId:'fictional-b'});assert.deepEqual(other.days,{'2026-11-07':1});
 await assert.rejects(()=>linkedDmUsage(db,{...scope,userId:'fictional-b'}));
 const runs=await queueRunView(db,{spaceId:'space-a',userId:'fictional-a',now});assert.equal(runs.length,5);assert.ok(runs.every(r=>r.capabilityState==='not_verified'&&r.cost===null&&r.liveChangeAllowed===false));assert.ok(!JSON.stringify(runs).includes('fictional-private'));assert.ok(!JSON.stringify(runs).includes('run-foreign'));
 console.log('PASS actual Prisma linked-DM counting: two inbound, web/peer/routine/foreign excluded; timezone receipt-day correct; wrong owner rejected; run projection scoped; no body/prompt leaked; capability/cost not invented.');
}finally{await handles.prisma.$disconnect();await handles.pool.end();}
