import { describe,it,expect } from "vitest";
import { readComposerDraft,writeComposerDraft } from "./composer-draft";
import { proposeRewrite,applyRewrite,undoRewrite } from "./composer-rewrite-review";
function fixture(){const map=new Map<string,string>();const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)},removeItem:(k:string)=>{map.delete(k)}};writeComposerDraft('t',' original $50\n',storage);return {storage,review:proposeRewrite({owner:'u',threadKey:'t',revision:3,original:' original $50\n',proposal:'review proposal'}),context:{owner:'u',threadKey:'t',revision:3,sending:false,attachments:false}}}
describe('isolated native rewrite adapter',()=>{
 it('proposal changes no stored draft',()=>{const f=fixture();expect(readComposerDraft('t',f.storage)).toBe(f.review.original)});
 it('uses stock draft storage and exact undo',()=>{const f=fixture();applyRewrite(f.review,f.context,f.storage);expect(undoRewrite(f.review,{...f.context,revision:4},f.storage)).toBe(' original $50\n')});
 it('rejects wrong owner',()=>{const f=fixture();expect(()=>applyRewrite(f.review,{...f.context,owner:'other'},f.storage)).toThrow()});
 it('rejects wrong thread',()=>{const f=fixture();expect(()=>applyRewrite(f.review,{...f.context,threadKey:'other'},f.storage)).toThrow()});
 it('rejects stale revision',()=>{const f=fixture();expect(()=>applyRewrite(f.review,{...f.context,revision:4},f.storage)).toThrow()});
 it('keeps later edits on apply',()=>{const f=fixture();writeComposerDraft('t','later',f.storage);expect(()=>applyRewrite(f.review,f.context,f.storage)).toThrow();expect(readComposerDraft('t',f.storage)).toBe('later')});
 it('keeps later edits on undo',()=>{const f=fixture();applyRewrite(f.review,f.context,f.storage);writeComposerDraft('t','later',f.storage);expect(()=>undoRewrite(f.review,{...f.context,revision:4},f.storage)).toThrow();expect(readComposerDraft('t',f.storage)).toBe('later')});
 it('refuses active sends and attachments',()=>{for(const blocked of [{sending:true},{attachments:true}]){const f=fixture();expect(()=>applyRewrite(f.review,{...f.context,...blocked},f.storage)).toThrow()}});
 it('does not silently discard mention recipients',()=>{const f=fixture();writeComposerDraft('t','@Bob',f.storage,[{start:0,end:4,mention:{kind:'bot',id:'bob',name:'Bob'}}]);const r=proposeRewrite({...f.review,original:'@Bob'});expect(()=>applyRewrite(r,f.context,f.storage)).toThrow();expect(readComposerDraft('t',f.storage)).toBe('@Bob')});
 it('reports storage failure',()=>{const f=fixture();expect(()=>applyRewrite(f.review,f.context,{...f.storage,setItem:()=>{throw new Error('blocked')}})).toThrow()});
});
