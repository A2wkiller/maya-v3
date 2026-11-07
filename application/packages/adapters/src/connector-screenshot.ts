import {assertUsableScreenshot} from "./capture-evidence.js";
import {validateImageAttachment} from './attachment-validation.js';
/** Import image bytes in code. The model sees a path and pixels, never a base64 string to retype. */
export async function importConnectorScreenshot(result:unknown,save:(path:string,bytes:Uint8Array)=>Promise<void>,key:string):Promise<unknown>{
 if(!result || typeof result!=='object' || !Array.isArray((result as any).content))return result;
 if(!(result as any).content.some((i:any)=>i?.type==='image'))return result;
 let index=0;const content=[];
 for(const item of (result as any).content){
  if(item?.type!=='image'){content.push(item);continue;}
  if(typeof item.data!=='string' || item.data.length>24000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data))throw new Error('Invalid screenshot image data');
  const bytes=new Uint8Array(Buffer.from(item.data,'base64'));await validateImageAttachment(bytes,item.mimeType);await assertUsableScreenshot(bytes);
  const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as Record<string,string>)[item.mimeType];if(!ext)throw new Error('Unsupported screenshot format');
  const path=`screenshots/${key.replace(/[^a-zA-Z0-9_-]/g,'_').slice(-80)}-${index++}.${ext}`;
  await save(path,bytes);content.push({type:'text',text:`Screenshot saved to ${path}. Inspect this image before attaching. A loading or wrong page is not the requested result. Use attach_file with this exact path only if it shows the requested page. Do not reconstruct image bytes in shell.`});content.push(item);
 }
 return {kind:'agent_tool_result',content,details:{source:'connector-screenshot',untrusted:true}};
}
