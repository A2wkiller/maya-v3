import {execFileSync} from "node:child_process";
import {writeFileSync} from "node:fs";
import {resolveSupervisorToken} from "@rakazo/core";
import {it,expect} from "vitest";
import {supervisorApp} from "./index.js";
it.skipIf(process.env.CAPTURE_ISOLATED_GRAPHICAL !== "1")("real owned screen bootstrap and bound capture in disposable no-account container",async()=>{
 const name="maya-capture-isolated-"+Date.now();
 const docker=(...args:string[])=>execFileSync("docker",args,{timeout:90000,encoding:"utf8"});
 try{
  docker("run","-d","--name",name,"--network","none","--memory","1536m","--shm-size","256m","--label","rakazo.managed=true","--label","rakazo.botId=isolated-capture","--label","rakazo.spaceId=isolated-capture","maya/computer:capture-evidence-20261107");
  const html='<!doctype html><html><head><style>body{background:#17324d;color:white;font:28px sans-serif;padding:45px}.panel{background:#e9a93a;color:#111;padding:40px;border-radius:20px}</style></head><body><h1>Owned graphical capture</h1><div class="panel">Real supervisor screen setup<br>Real production helper and agent-browser<br>No account or user home mounted</div></body></html>';
  docker("exec",name,"mkdir","-p","/tmp/capture-fixture");
  docker("exec",name,"python3","-c","from pathlib import Path;Path('/tmp/capture-fixture/index.html').write_text("+JSON.stringify(html)+")");
  docker("exec","-d",name,"python3","-m","http.server","8765","--bind","127.0.0.1","--directory","/tmp/capture-fixture");
  const request=async(body:any)=>{
   const r=await supervisorApp.request(`/computers/${name}/browser`,{method:"POST",headers:{authorization:`Bearer ${resolveSupervisorToken(process.env)}`,"content-type":"application/json","x-rakazo-bot-id":"isolated-capture","x-rakazo-space-id":"isolated-capture","x-rakazo-screen-id":"isolated-screen","x-rakazo-screen-lease-id":"run:1"},body:JSON.stringify(body)});
   const out=await r.json() as {ok:boolean;targetId:string;epoch:number;url:string;image:string};expect(out).toMatchObject({ok:true});return out;
  };
  const n=await request({command:"navigate",url:"http://127.0.0.1:8765/"});
  expect(n.targetId).toBeTruthy();expect(n.epoch).toBeGreaterThan(0);
  const c=await request({command:"capture",targetId:n.targetId,expectedUrl:n.url,epoch:n.epoch});
  expect(c.targetId).toBe(n.targetId);expect(c.epoch).toBe(n.epoch);
  const bytes=Buffer.from(c.image,"base64");expect(bytes.length).toBeGreaterThan(10000);writeFileSync("/tmp/capture-graphical-route.png",bytes);
 }finally{docker("rm","-f",name);}
},120000);
