import {it,expect} from "vitest";
import {buildApprovalAskBlock} from "./approval-ask.js";
const args={command:"echo fixture",cwd:"/fixture",provider:"mock",bot:"fixture-bot",session:"fixture-thread",audience:"test"};
const opts={fictionalScope:{bot:"fixture-bot",session:"fixture-thread"}};
it("requires runtime-supplied scope",()=>{expect(()=>buildApprovalAskBlock("f","fictional_exact_command",args,[])).toThrow();});
it("accepts exact runtime bot/thread",()=>{const b=buildApprovalAskBlock("f","fictional_exact_command",args,[],opts);if(b.kind!=="ask")throw Error();expect(JSON.parse(b.detail!)).toEqual(args);});
it.each(["bot","session","audience"])("blocks changed %s",k=>{expect(()=>buildApprovalAskBlock("f","fictional_exact_command",{...args,[k]:"other"},[],opts)).toThrow();});

// bounded hostile-input regression, card building only, no execution/approval
it("round-trips unicode and ordinary whitespace without executing",()=>{
 const a={...args,command:"printf \"नमस्ते\"\n\t$(fictional)\r",cwd:"/fixture/with spaces"};
 const b=buildApprovalAskBlock("f","fictional_exact_command",a,[],opts);
 if(b.kind!=="ask")throw Error();expect(JSON.parse(b.detail!)).toEqual(a);
});
it("rejects JSON escaped expansion over the display budget",()=>{
 expect(()=>buildApprovalAskBlock("f","fictional_exact_command",{...args,command:"\t".repeat(1700)+"x"},[],opts)).toThrow();
});
it.each([null,{}, {bot:"fixture-bot"}, {session:"fixture-thread"}])("rejects incomplete runtime binding %j",scope=>{
 expect(()=>buildApprovalAskBlock("f","fictional_exact_command",args,[],{fictionalScope:scope as any})).toThrow();
});

it.each(["\u0000","\u0007","\u001b","\u007f","\ud800"])("rejects unsafe command control %j",c=>{
 expect(()=>buildApprovalAskBlock("f","fictional_exact_command",{...args,command:"echo "+c},[],opts)).toThrow();
});
it.each(["\n","\t","\u0000","\u007f","\ud800"])("rejects unsafe cwd %j",c=>{
 expect(()=>buildApprovalAskBlock("f","fictional_exact_command",{...args,cwd:"/fixture/"+c},[],opts)).toThrow();
});
