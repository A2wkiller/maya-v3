import { RPCHandler } from "@orpc/server/fetch";
import { createRouterClient } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import { describe,it,expect,vi } from "vitest";
import { createRouter } from "./router.js";
import type { RouterDeps } from "./router.js";
const actor:Actor={spaceId:"fictional-space",userId:"fictional-owner",email:"owner@example.test",isDeploymentOwner:false};
function fixture(contextActor:Actor|null=actor){
 const identity=vi.fn(async()=>[{id:"identity",botId:"bot"}]);
 const thread=vi.fn(async()=>({id:"thread",spaceId:actor.spaceId,userId:actor.userId}));
 const message=vi.fn(async()=>[{id:"m1",clientNonce:"messaging:telegram:one",createdAt:new Date(Date.now()-1000)}]);
 const run=vi.fn(async()=>[{id:"r1",status:"completed",updatedAt:new Date(),modelId:null,modelProvider:null,request:"private-body",error:"private-error"}]);
 const prisma={messagingIdentity:{findMany:identity},thread:{findUnique:thread},message:{findMany:message},run:{findMany:run},deploymentSettings:{findUnique:async()=>null},userModelPreference:{findFirst:async()=>null}};
 const deps={prisma,env:{defaultProvider:"fake",defaultModel:"fake",webOrigin:"http://localhost",screenProxySecret:"fixture",sandboxProvider:"fake"},dataDir:"/tmp/queue-fixture"} as unknown as RouterDeps;
 const router=createRouter(deps);const client=createRouterClient(router,{context:{actor:contextActor}});
 return {client,identity,thread,message,run,handler:new RPCHandler(router)};
}
describe("native authenticated read-only queue routes",()=>{
 it("returns only own metadata without task bodies or action powers",async()=>{const f=fixture();const x=await f.client.queueReadOnly.status({});expect(x.runs).toHaveLength(1);expect(x.runs[0]).toMatchObject({cost:null,capabilityState:"not_verified",liveChangeAllowed:false});expect(JSON.stringify(x)).not.toContain("private");expect(f.run.mock.calls[0]?.[0]).toMatchObject({where:{spaceId:actor.spaceId,userId:actor.userId}});});
 it("returns explicitly limited linked inbound usage",async()=>{const f=fixture();const x=await f.client.queueReadOnly.usage({provider:"telegram",days:7});expect(Object.values(x.days)).toEqual([1]);expect(x).toMatchObject({coversWebChats:false,coversGroups:false,humanAuthorshipProven:false,cost:null,tokens:null});expect(f.identity.mock.calls[0]?.[0]).toMatchObject({where:{spaceId:actor.spaceId,userId:actor.userId,provider:"telegram"}});});
 for(const route of ["usage","status"] as const)it(`requires real auth before querying ${route}`,async()=>{const f=fixture(null);const action=route==="usage"?f.client.queueReadOnly.usage({provider:"telegram",days:1}):f.client.queueReadOnly.status({});await expect(action).rejects.toMatchObject({code:"UNAUTHORIZED"});expect(f.identity).not.toHaveBeenCalled();expect(f.run).not.toHaveBeenCalled();});
 for(const input of [{provider:"telegram",days:0},{provider:"telegram",days:91},{provider:"telegram",days:1.5},{provider:"telegram",days:7,userId:"foreign"},{provider:"telegram",days:7,spaceId:"foreign"},{provider:"other",days:7}])it(`rejects spoofed scope/unbounded query ${JSON.stringify(input)}`,async()=>{const f=fixture();await expect(f.client.queueReadOnly.usage(input as never)).rejects.toMatchObject({code:"BAD_REQUEST"});expect(f.identity).not.toHaveBeenCalled();});
 it("rejects status owner injection",async()=>{const f=fixture();await expect(f.client.queueReadOnly.status({userId:"foreign"} as never)).rejects.toMatchObject({code:"BAD_REQUEST"});expect(f.run).not.toHaveBeenCalled();});
 it("refuses mismatched owner instead of returning empty success",async()=>{const f=fixture();f.thread.mockResolvedValue({id:"other",spaceId:"foreign",userId:"foreign"});await expect(f.client.queueReadOnly.usage({provider:"telegram",days:7})).rejects.toMatchObject({code:"NOT_FOUND"});expect(f.message).not.toHaveBeenCalled();});
 it("does not disclose backend errors or claim no usage",async()=>{const f=fixture();f.message.mockRejectedValue(new Error("private database detail"));await expect(f.client.queueReadOnly.usage({provider:"telegram",days:7})).rejects.toMatchObject({code:"INTERNAL_SERVER_ERROR",message:"Usage could not be checked."});});
 it("does not turn failed status query into empty status",async()=>{const f=fixture();f.run.mockRejectedValue(new Error("private"));await expect(f.client.queueReadOnly.status({})).rejects.toMatchObject({code:"INTERNAL_SERVER_ERROR",message:"Run status could not be checked."});});
});

it.each([true,false])("native HTTP RPC status auth=%s",async(authorized)=>{
 const f=fixture();const {response}=await f.handler.handle(new Request("http://localhost/rpc/queueReadOnly/status",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({json:{}})}),{prefix:"/rpc",context:{actor:authorized?actor:null}});
 expect(response).toBeTruthy();expect(response!.status).toBe(authorized?200:401);const body=JSON.stringify(await response!.json());expect(body).not.toContain("private");if(!authorized)expect(f.run).not.toHaveBeenCalled();
});
it("native HTTP rejects injected owner scope",async()=>{
 const f=fixture();const {response}=await f.handler.handle(new Request("http://localhost/rpc/queueReadOnly/usage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({json:{provider:"telegram",days:7,userId:"foreign"}})}),{prefix:"/rpc",context:{actor}});
 expect(response!.status).toBe(400);expect(f.identity).not.toHaveBeenCalled();
});
