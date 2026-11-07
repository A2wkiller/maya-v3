import sharp from 'sharp';
import {createHash} from 'node:crypto';
export const CAPTURE_BINDING='maya:native-capture-binding';
export const CAPTURE_ACCEPTED='maya:accepted-native-capture';
export const CAPTURE_FAILED='maya:capture-failed';
export function bytesHash(bytes:Uint8Array):string{return createHash('sha256').update(bytes).digest('hex');}
/** Conservative rejection, not an image-understanding claim. Small/sparse images fail closed. */
export async function assertUsableScreenshot(bytes:Uint8Array):Promise<void>{
 const {data,info}=await sharp(bytes,{failOn:'warning',limitInputPixels:16777216}).removeAlpha().resize({width:256,height:256,fit:'inside',withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true});
 const counts=new Map<string,number>();let nearWhite=0,n=0;
 for(let i=0;i<data.length;i+=info.channels){const r=data[i]!,g=data[i+1]??r,b=data[i+2]??r;const key=`${r>>4},${g>>4},${b>>4}`;counts.set(key,(counts.get(key)??0)+1);if(r>245&&g>245&&b>245)nearWhite++;n++;}
 const dominant=Math.max(0,...counts.values())/n;
 if(!n || nearWhite/n>0.985 || dominant>0.995 || counts.size<5)throw new Error('Screenshot rejected: blank, loading or too little visible content. No completed screenshot is available.');
}
export function captureMatches(binding:any,result:any):boolean{return Boolean(binding&&result?.ok===true&&binding.targetId===result.targetId&&binding.url===result.url&&binding.epoch===result.epoch&&typeof result.image==='string');}
/** No open-ended visual narrative or affiliation self-labels are published for a browser capture workflow. */
export function screenshotCompletion(captured:boolean):string{return captured?'Screenshot attached from the current native browser page. Channel affiliation has not been independently verified.':'I could not produce a verified screenshot of the requested page. No completed screenshot is attached.';}
export function neutralCaptureName():string{return 'Browser page screenshot';}

export function verifiedCaptureAttached(effects:Array<{kind:string;status:string;request?:unknown;result?:unknown}>):boolean{
 return effects.some(e=>/screenshot/i.test(e.kind)&&e.status==='completed'&&(e.result as any)?.source==='native-bound-screenshot'&&effects.some(a=>a.kind==='attach_file'&&a.status==='completed'&&(a.result as any)?.ok===true&&(a.request as any)?.path===(e.result as any)?.path));
}
export function acceptedAttachment(accepted:any,binding:any,path:string,hash:string):boolean{return Boolean(accepted&&binding&&accepted.path===path&&accepted.hash===hash&&accepted.targetId===binding.targetId&&accepted.url===binding.url&&accepted.epoch===binding.epoch);}
