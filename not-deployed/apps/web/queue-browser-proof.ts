import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../api/src/app.ts';
import {asSystem} from '../../packages/db/src/row-security.ts';
import {ComposioConnector,FakeComposioClient} from '../../packages/adapters/src/index.ts';
import {sessionCookieHeader} from '../../packages/testkit/src/index.ts';
const url=process.env.DATABASE_URL;
if(url!=='postgresql://postgres@127.0.0.1:5432/queue_fixture')throw new Error('Fresh fictional database only');
const dir=await mkdtemp(path.join(tmpdir(),'queue-session-proof-'));const origin='http://127.0.0.1:5173';
let stop:(()=>Promise<void>)|undefined;let server:ReturnType<typeof createServer>|undefined;let browser:Awaited<ReturnType<typeof chromium.connectOverCDP>>|undefined;
try{
 const h=await createApp({databaseUrl:url,realtimeDatabaseUrl:url,authUrl:origin,webOrigin:origin,dataDir:dir,sandboxProvider:'fake',agentRuntime:'fake',wakeupDriver:'memory',signupsEnabled:'true',composio:new ComposioConnector({client:new FakeComposioClient()}),encryptionKey:'fictional-queue-session-key'});stop=h.stop;const db=asSystem(h.prisma,'fictional session proof');assert.equal(await db.user.count(),0);
 async function request(cookie:string,procedure:string,input:unknown={},space?:string){return h.app.request(`/rpc/${procedure}`,{method:'POST',headers:{'content-type':'application/json',origin,cookie,...space?{'x-rakazo-space-id':space}:{}},body:JSON.stringify({json:input})});}
 const cookies:string[]=[];const owners:Array<{userId:string;spaceId:string}>=[];
 for(const tag of ['a','b']){
  const response=await h.app.request('/api/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({email:`queue-${tag}@fictional.invalid`,password:'fictional-test-password-1212',name:`Fixture ${tag}`})});assert.ok(response.status<400,`signup ${tag}: ${response.status}`);const cookie=sessionCookieHeader(response);assert.ok(cookie);cookies.push(cookie);
  const me=await request(cookie,'me');assert.equal(me.status,200);const body=await me.json();assert.ok(body.json.userId&&body.json.spaceId);owners.push(body.json);
 }
 for(let i=0;i<2;i++){
  const owner=owners[i]!;const common={spaceId:owner.spaceId,userId:owner.userId,botId:`fixture-session-bot-${i}`,threadId:`fixture-session-thread-${i}`};
  await db.bot.create({data:{id:common.botId,spaceId:owner.spaceId,userId:owner.userId,name:'Fixture',color:'blue'}});await db.thread.create({data:{id:common.threadId,spaceId:owner.spaceId,userId:owner.userId,botId:common.botId}});
  await db.messagingIdentity.create({data:{id:`session-id-${i}`,provider:'telegram',address:`fixture-session-${i}`,userId:owner.userId,spaceId:owner.spaceId,botId:common.botId,verifiedAt:new Date()}});
  const message=await db.message.create({data:{id:`session-message-${i}`,threadId:common.threadId,role:'user',seq:1,clientNonce:`messaging:telegram:session-${i}`,blocks:[{kind:'text',text:'PRIVATE fictional source'}],createdAt:new Date(Date.now()-1000)}});
  const task=await db.task.create({data:{id:`session-task-${i}`,...common,prompt:'PRIVATE fictional prompt',status:'completed'}});await db.run.create({data:{id:`session-run-${i}`,...common,taskId:task.id,trigger:'messaging',status:'completed',sourceMessageId:message.id}});
 }
 for(let i=0;i<2;i++){
  const usage=await request(cookies[i]!,'queueReadOnly/usage',{provider:'telegram',days:7});assert.equal(usage.status,200);const value=await usage.json();assert.deepEqual(Object.values(value.json.days),[1]);assert.ok(!JSON.stringify(value).includes('PRIVATE'));
  const status=await request(cookies[i]!,'queueReadOnly/status');assert.equal(status.status,200);const value2=await status.json();assert.deepEqual(value2.json.runs.map((x:{id:string})=>x.id),[`session-run-${i}`]);assert.ok(!JSON.stringify(value2).includes('PRIVATE'));
 }
 assert.equal((await request('','queueReadOnly/status')).status,401);
 assert.equal((await request(cookies[0]!,'queueReadOnly/usage',{provider:'telegram',days:7,userId:owners[1]!.userId})).status,400);
 const cross=await request(cookies[0]!,'queueReadOnly/status',{},owners[1]!.spaceId);assert.ok([401,403,404].includes(cross.status),`cross-space status ${cross.status}`);

 const staticRoot='/candidate/queue-browser-dist';let usageRequests=0;const external:string[]=[];
 server=createServer(async(req,res)=>{try{
  const addr=new URL(req.url!,origin);
  if(addr.pathname.startsWith('/rpc/')||addr.pathname.startsWith('/api/')){
   if(addr.pathname==='/rpc/queueReadOnly/usage')usageRequests++;
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   const response=await h.app.fetch(new Request(origin+req.url,{method:req.method,headers:req.headers as Record<string,string>,...(req.method!=='GET'&&req.method!=='HEAD'?{body:Buffer.concat(chunks)}:{})}));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=path.resolve(staticRoot,'.'+decodeURIComponent(addr.pathname));if(!file.startsWith(staticRoot+'/')){res.writeHead(403);res.end();return;}
  const data=await readFile(file);res.setHeader('content-type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(data);
 }catch(error){res.writeHead(500);res.end('Fixture failure');}});
 await new Promise<void>(resolve=>server!.listen(5173,'127.0.0.1',resolve));
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){external.push(u.origin);return route.abort();}return route.continue();});
 const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER_ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('BROWSER_CONSOLE',m.text());});
 for(let i=0;i<2;i++){
  await context.clearCookies();await context.addCookies(cookies[i]!.split('; ').map(x=>{const at=x.indexOf('=');return {name:x.slice(0,at),value:x.slice(at+1),url:origin};}));
  const before=usageRequests;await page.goto(origin+'/queue-browser.html?fixtureOwner='+owners[i]!.userId);
  await page.getByText('Telegram activity',{exact:true}).waitFor({timeout:10000}).catch(async e=>{await page.screenshot({path:'/candidate/browser-failed.png'});console.log('FAILED_BODY',await page.locator('body').innerText());throw e;});assert.equal(usageRequests,before,'collapsed does not query');
  await page.getByText('Telegram activity',{exact:true}).click();await page.getByText('1 incoming messages',{exact:true}).waitFor();
  assert.equal(usageRequests,before+1);assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE'));
  if(i===0){await page.screenshot({path:'/candidate/browser-phone.png',fullPage:true});await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'/candidate/browser-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});}
 }
 await context.clearCookies();await page.reload();await page.getByText('Telegram activity',{exact:true}).click();await page.getByText('Activity unavailable. No count can be confirmed.',{exact:true}).waitFor();
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);await context.close();
 console.log('PASS real Chromium component-to-HTTP-session-to-fictional-Postgres round trip; two owners one inbound each; collapsed no fetch; unsigned session error not zero; raw content absent; external requests0; page errors0. Loopback-only listener and browser, no model call. Screenshots saved. DB uses fixture owner login; earlier SELECT-only-RLS proof remains separate.');

}finally{await browser?.close();if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));await stop?.();await rm(dir,{recursive:true,force:true});}
