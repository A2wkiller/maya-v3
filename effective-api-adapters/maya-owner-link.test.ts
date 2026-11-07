import {describe,it,expect} from "vitest";
import {isOwnerPastedView,linkTaskNote,MAYA_VIEW_TOOL,MAYA_VIEW_RESOURCE} from "./maya-owner-link.js";
const x={name:MAYA_VIEW_TOOL,resourceId:MAYA_VIEW_RESOURCE,ownerStarted:true,trigger:"messaging",text:"https://example.com/reel\nSummarise it",args:{url:"https://example.com/reel"}};
describe("exact current-owner link boundary",()=>{
 it("accepts only the pinned public-view route and exact current URL",()=>expect(isOwnerPastedView(x)).toBe(true));
 for(const [n,v] of Object.entries({resourceId:"other",name:"shell",ownerStarted:false,trigger:"routine",text:"> https://example.com/reel",args:{url:"https://example.com/other"}}))it(`refuses ${n} mismatch`,()=>expect(isOwnerPastedView({...x,[n]:v})).toBe(false));
 it("refuses extra arguments",()=>expect(isOwnerPastedView({...x,args:{...x.args,cookies:"x"}})).toBe(false));
 it("ignores URLs inside code",()=>expect(isOwnerPastedView({...x,text:"```\nhttps://example.com/reel\n```"})).toBe(false));
 it("binds a short link task without substituting old context",()=>{expect(linkTaskNote(x.text)).toContain("not the content of this link");expect(linkTaskNote("Tell me about cats")).toBeUndefined();expect(linkTaskNote("https://example.com/reel\nSearch something else")).toBeUndefined();});
});

