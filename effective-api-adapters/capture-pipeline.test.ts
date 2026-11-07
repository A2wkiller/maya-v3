import {it,expect,vi} from 'vitest';import {readFile} from 'node:fs/promises';
const recorded=vi.hoisted(()=>({blocks:[] as any[],attachments:[] as any[]}));
vi.mock('@rakazo/db',async original=>({...await original<any>(),withTransactionRetry:async(f:any)=>f(),createThreadMessageInTransaction:async(_tx:any,x:any)=>{recorded.blocks.push(x.blocks);return{id:'message'};},appendEventInTransaction:async()=>({seq:1})}));
vi.mock('./thread-artifacts.js',async original=>({...await original<any>(),attachWorkspaceFileToThread:async(_deps:any,input:any)=>{recorded.attachments.push(input);return{artifactId:'artifact',block:{kind:'image',artifactId:'artifact',mimeType:'image/png',name:input.name}};}}));
import {connectorTool} from './run-tools-integrations.js';import {fileTools} from './run-tools-files.js';import {publishMessage} from './run-messages.js';import {CAPTURE_BINDING} from './capture-evidence.js';
function context(image:Buffer){
 const binding={targetId:'target-real',epoch:12,url:'https://synthetic/'};const effects:any[]=[];const files=new Map<string,Uint8Array>();
 const deps:any={prisma:{externalEffect:{findMany:async()=>effects},$transaction:async(f:any)=>f({})},events:{append:async()=>{},notify:async()=>{}},artifacts:{},sandbox:{pageBrowser:async()=>({...binding,ok:true,image:image.toString('base64')}),writeFile:async(_c:any,x:any)=>{files.set(x.path,x.content)},readFile:async(_c:any,p:string)=>files.get(p)}};
 const ctx:any={secrets:new Set(),deps,run:{id:'run',spaceId:'space',userId:'user',botId:'fixture-resource-id',threadId:'thread',trigger:'messaging'},bot:{id:'fixture-resource-id'},thread:{id:'thread'},context:{},computer:{mode:'team',get:async()=>({}),checkpoint:{markDirty:()=>{}}},state:{toolResults:new Map([[CAPTURE_BINDING,JSON.stringify(binding)]])}};
 return{ctx,effects,files};
}
it('native capture -> exact file -> attach handler -> durable publish gate strips false visual/official narrative',async()=>{
 recorded.blocks.length=0;recorded.attachments.length=0;const {ctx,effects}=context(await readFile(new URL('./fixtures/capture/synthetic-real-chromium.png',import.meta.url)));
 const capture:any=await connectorTool(ctx,{name:'mcp__maya-obscura__browser_screenshot',connectorCall:{},effectKey:'capture',finish:async(x:any)=>x} as any);effects.push({kind:'mcp__maya-obscura__browser_screenshot',status:'completed',result:capture.details});
 const path=capture.details.path;const attached:any=await fileTools.attach_file!(ctx,{name:'attach_file',args:{path,name:'Official channel',description:'Screenshot shows latest uploads'},executionId:'attachment',finish:async(x:any)=>x} as any);
 expect(attached.ok).toBe(true);expect(recorded.attachments[0].name).toBe('Browser page screenshot');expect(recorded.attachments[0].description).not.toContain('official');effects.push({kind:'attach_file',status:'completed',request:{path},result:attached});
 await publishMessage(ctx.deps,ctx.run,'bot',[{kind:'text',text:'Done! Official channel. The screenshot shows latest uploads and 5 million subscribers.'}]);
 const final=recorded.blocks.at(-1)[0].text;expect(final).toBe('Screenshot attached from the current native browser page. Channel affiliation has not been independently verified.');
});
it('blank native capture cannot attach and final publish fails truthfully, even with model claiming Done',async()=>{
 recorded.blocks.length=0;recorded.attachments.length=0;const {ctx,effects,files}=context(await readFile(new URL('./fixtures/capture/loading-skeleton.png',import.meta.url)));
 const capture:any=await connectorTool(ctx,{name:'browser_screenshot',connectorCall:{},effectKey:'capture',finish:async(x:any)=>x} as any);expect(capture.error).toBeTruthy();effects.push({kind:'browser_screenshot',status:'completed',result:capture});
 const p='screenshots/blank.png';files.set('bots/fixture-resource-id/'+p,await readFile(new URL('./fixtures/capture/loading-skeleton.png',import.meta.url)));
 const result:any=await fileTools.attach_file!(ctx,{name:'attach_file',args:{path:p},executionId:'a',finish:async(x:any)=>x} as any);expect(result.error).toBeTruthy();expect(recorded.attachments).toHaveLength(0);
 await publishMessage(ctx.deps,ctx.run,'bot',[{kind:'text',text:'Done! Screenshot shows the official channel.'}]);expect(recorded.blocks.at(-1)[0].text).toBe('I could not produce a verified screenshot of the requested page. No completed screenshot is attached.');
});
