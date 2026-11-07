import {describe,it,expect,vi,afterEach} from 'vitest';
import {createTelegramAdapter} from '@chat-adapter/telegram';
import {ChatSdkMessagingSurface} from './chat-sdk-surface.js';
let calls:any[]=[];
afterEach(()=>vi.unstubAllGlobals());
describe('native Telegram approval encoding captured transport',()=>{
 it('encodes bound allow/deny callbacks under64bytes without a Telegram send',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:any,options:any)=>{
   const method=String(url).split('/').pop();let body:any={};try{body=JSON.parse(options?.body??'{}')}catch{}calls.push({method,body});
   if(method==='getMe')return Response.json({ok:true,result:{id:1,is_bot:true,first_name:'Fixture',username:'fixture_bot'}});
   if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:'https://fixture.invalid/webhook'}});
   return Response.json({ok:true,result:{message_id:123,date:1,chat:{id:42,type:'private'},text:body.text??''}});
  }));
  const adapter=createTelegramAdapter({botToken:'fixture-only-not-real',secretToken:'fixture-only',mode:'webhook'});
  const surface=new ChatSdkMessagingSurface([{provider:'telegram',adapter,capabilities:{direct:true,groups:false,receipt:null,files:true}}]);
  await surface.sendToThread({threadId:'telegram:42',body:'[maya-approval:fixture-resource-id:0123456789abcdef]\nApproval requested: mcp__maya-health__capability_status\nArguments: {}\nExpires in10minutes.'},{operationId:'test',spaceId:'fixture',userId:'fixture'} as any);
  const sent=calls.find(c=>c.method==='sendMessage');expect(sent).toBeTruthy();const buttons=sent.body.reply_markup.inline_keyboard.flat();expect(buttons.map((b:any)=>b.text)).toEqual(['Allow once','Deny']);for(const b of buttons){expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);expect(b.callback_data).toContain('fixture-resource-id')};expect(sent.body.text).not.toContain('maya-approval:');
 });
});
