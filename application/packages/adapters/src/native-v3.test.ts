import {describe,it,expect,vi,afterEach} from 'vitest';
import {createTelegramAdapter} from '@chat-adapter/telegram';
import {ChatSdkMessagingSurface} from './chat-sdk-surface.js';
afterEach(()=>vi.unstubAllGlobals());
it('real encoded callback traverses native Telegram adapter and edits decision card',async()=>{
 const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url:any,options:any)=>{const method=String(url).split('/').pop();const body=JSON.parse(options?.body??'{}');calls.push({method,body});if(method==='getMe')return Response.json({ok:true,result:{id:1,is_bot:true,first_name:'Fixture',username:'fixture_bot'}});if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:'https://fixture.invalid/webhook'}});return Response.json({ok:true,result:{message_id:123,date:1,chat:{id:42,type:'private'},text:body.text??''}})}));
 const adapter=createTelegramAdapter({botToken:'fixture',secretToken:'fixture-secret',mode:'webhook'});const surface=new ChatSdkMessagingSurface([{provider:'telegram',adapter,capabilities:{direct:true,groups:false,receipt:null,files:true}}]);const sink=vi.fn(async()=>'Allowed once for health.');surface.onApprovalAction(sink);
 await surface.sendToThread({threadId:'telegram:42',body:'[maya-approval:fixture-resource-id:0123456789abcdef]\n[ttl:60]\nMaya wants to run: health check (read-only).\nWhy: you asked her to check systems.'},{operationId:'fixture',spaceId:'fixture',userId:'fixture'} as any);
 const sent=calls.find(c=>c.method==='sendMessage');expect(sent.body.text).not.toContain('ttl:');const callback=sent.body.reply_markup.inline_keyboard[0][0].callback_data;
 const response=surface.handleWebhook('telegram',new Request('https://fixture.invalid/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'fixture-secret'},body:JSON.stringify({update_id:99,callback_query:{id:'fixture-callback',from:{id:42,is_bot:false,first_name:'Owner'},message:{message_id:123,date:1,chat:{id:42,type:'private'}},data:callback}})}));await response;
 expect(sink).toHaveBeenCalledTimes(1);expect(calls.some(c=>c.method==='answerCallbackQuery')).toBe(true);const edit=calls.find(c=>c.method==='editMessageText');expect(edit).toBeTruthy();expect(edit.body.reply_markup.inline_keyboard).toEqual([]);expect(edit.body.text).toContain('Allowed');
});
