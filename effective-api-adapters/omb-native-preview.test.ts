import {describe,it,expect} from "vitest";
import {buildApprovalAskBlock as nativeBuild} from "./approval-ask.js";
import {approvalEffectKey} from "../../core/src/approval-effect-key.js";
const buildApprovalAskBlock=(id:string,name:string,args:Record<string,unknown>,secrets:string[])=>nativeBuild(id,name,args,secrets,{fictionalScope:{bot:"fixture-resource-id",session:"fictional-binding-v1"}});
const args={command:"printf 'fictional only'",cwd:"/fixture/work",provider:"mock-local",bot:"fixture-resource-id",session:"fictional-binding-v1",audience:"test"};
describe("fictional exact command native card candidate",()=>{
 it("renders every original field without truncation",()=>{const b=buildApprovalAskBlock("fixture-effect","fictional_exact_command",args,[]);expect(b.kind).toBe("ask");if(b.kind!=="ask")throw Error();expect(JSON.parse(b.detail!)).toEqual(args);expect(b.approvalEffectId).toBe("fixture-effect");expect(b.actions?.map(x=>x.id)).toEqual(["allow","deny"]);});
 it("preserves exact whitespace and metacharacters",()=>{const a={...args,command:" echo a; echo b\n",cwd:"/fixture/with spaces/"};const b=buildApprovalAskBlock("f","fictional_exact_command",a,[]);if(b.kind!=="ask")throw Error();expect(JSON.parse(b.detail!).command).toBe(a.command);expect(JSON.parse(b.detail!).cwd).toBe(a.cwd);});
 it.each(["command","cwd","provider","bot","session","audience"])("binds native persisted effect key to %s",k=>{expect(approvalEffectKey("fixture-run","fictional_exact_command",args)).not.toBe(approvalEffectKey("fixture-run","fictional_exact_command",{...args,[k]:args[k as keyof typeof args]+"x"}));});
 it("binds run and tool",()=>{const k=approvalEffectKey("run","fictional_exact_command",args);expect(k).not.toBe(approvalEffectKey("other","fictional_exact_command",args));expect(k).not.toBe(approvalEffectKey("run","other",args));});
 it("refuses hidden/truncated details",()=>{expect(()=>buildApprovalAskBlock("f","fictional_exact_command",{...args,command:"x".repeat(3501)},[])).toThrow();expect(()=>buildApprovalAskBlock("f","fictional_exact_command",args,["fictional only"])).toThrow();});
 it.each([{...args,provider:""},{...args,provider:"bad provider"},{...args,cwd:"/../etc"},{...args,bot:"owner"},{...args,audience:"owner"},{...args,session:"other"},{...args,extra:"hidden"},{...args,cwd:"relative"},{...args,command:5}])("refuses malformed or owner scope",a=>{expect(()=>buildApprovalAskBlock("f","fictional_exact_command",a,[])).toThrow();});
});
