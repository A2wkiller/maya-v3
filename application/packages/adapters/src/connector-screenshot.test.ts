import sharp from "sharp";
import {it,expect,vi} from 'vitest';
import {importConnectorScreenshot} from './connector-screenshot.js';
let data='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==';
const rich=Buffer.alloc(100*60*3);for(let i=0;i<rich.length;i++)rich[i]=(i*37+(i%17)*11)%256;data=(await sharp(rich,{raw:{width:100,height:60,channels:3}}).png().toBuffer()).toString('base64');
it('imports exact valid bytes without text/base64 transcription',async()=>{const save=vi.fn();const out:any=await importConnectorScreenshot({content:[{type:'image',mimeType:'image/png',data}]},save,'call-1');expect(save).toHaveBeenCalledWith('screenshots/call-1-0.png',new Uint8Array(Buffer.from(data,'base64')));expect(out.content[0].text).toContain('attach_file');expect(out.content[0].text).not.toContain(data);expect(out.content[1].data).toBe(data);});
it('rejects corrupt image instead of fabricating a file',async()=>{const save=vi.fn();await expect(importConnectorScreenshot({content:[{type:'image',mimeType:'image/png',data:'aGVsbG8='}]},save,'bad')).rejects.toThrow(/corrupt/);expect(save).not.toHaveBeenCalled();});

it('connector handler saves bytes to the bot workspace before returning image/path',async()=>{
 const {connectorTool}=await import('./run-tools-integrations.js');const writeFile=vi.fn();const markDirty=vi.fn();const finish=vi.fn(async(x)=>x);
 const ctx:any={deps:{connector:{execute:async function*(){yield{type:'result',data:{content:[{type:'image',mimeType:'image/png',data}]}};}},sandbox:{writeFile},events:{append:vi.fn()}},run:{id:'run',spaceId:'space'},bot:{id:'bot'},thread:{id:'thread'},context:{},computer:{mode:'team',get:async()=>({id:'computer'}),checkpoint:{markDirty}},state:{toolResults:new Map()},trust:{searchResultUrls:new Set()}};
 const result:any=await connectorTool(ctx,{name:'mcp__test__browser_take_screenshot',args:{},effectKey:'shot-1',connectorCall:{},finish} as any);
 expect(writeFile).toHaveBeenCalledWith({id:'computer'},{path:'bots/bot/screenshots/shot-1-0.png',content:new Uint8Array(Buffer.from(data,'base64'))},{});expect(result.content[0].text).toContain('screenshots/shot-1-0.png');expect(markDirty).toHaveBeenCalledOnce();
});
