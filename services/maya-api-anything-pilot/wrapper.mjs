import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {planCall,callPlanned,closeHost,setBundledDir} from '/pilot/dist/host.js';
const ROOT='/pilot/sites/hacker-news.json';
const expected=process.env.PILOT_SPEC_HASH;
export function checkInput(input){if(JSON.stringify(input)!=='{}')throw Error('No arguments accepted');}
export function checkPlan(plan){
 if(!plan.ok||plan.site!=='hacker-news'||plan.op!=='frontPage'||!plan.readOnly||plan.signedIn||plan.tier!==1||plan.maxTier!==1)throw Error('Only reviewed anonymous tier1 read allowed');
 if(plan.request.method!=='GET'||plan.request.url!=='https://news.ycombinator.com/')throw Error('Destination or method refused');
}
export function checkTransport(url,init){
 if(String(url)!=='https://news.ycombinator.com/'||init.method!=='GET'||init.body)throw Error('Transport destination or method refused');
 for(const name of Object.keys(init.headers??{}))if(/authorization|cookie|proxy-/i.test(name))throw Error('Credential header refused');
}
function transport(url,init){
 checkTransport(url,init);
 return new Promise((resolve,reject)=>{
 const req=http.request({socketPath:'/bridge/egress.sock',path:'/frontpage',method:'GET',timeout:20000},r=>{let chunks=[],n=0;r.on('data',c=>{n+=c.length;if(n>1000000){req.destroy(Error('Response too large'));return;}chunks.push(c)});r.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:r.statusCode,headers:{'content-type':r.headers['content-type']??'text/html'}})))});
 req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Timeout')));req.end();
 });
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)try{
 const input=JSON.parse(readFileSync(0,'utf8')||'{}');checkInput(input);
 if(createHash('sha256').update(readFileSync(ROOT)).digest('hex')!==expected)throw Error('Reviewed spec changed');
 setBundledDir('/pilot/sites');const plan=planCall('hacker-news','frontPage',{}, {maxTier:1});checkPlan(plan);
 const result=await callPlanned(plan,{maxTier:1,allowWrites:false,timeoutMs:20000,fetchImpl:transport,view:{maxChars:12000}});
 console.log(JSON.stringify(result));
}catch(e){console.log(JSON.stringify({ok:false,class:'refused',reason:e.message}));process.exitCode=1}finally{await closeHost()}
