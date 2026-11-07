import {describe,it,expect} from 'vitest';import {buildApprovalAskBlock} from './approval-ask.js';
describe('Google exact card',()=>{
 for(const [name,options] of [['mcp__maya-google-write__gmail_send',{}],['renamed_get_item',{googleWrite:true}]] as const){
 it('full fixed-account exact card '+name,()=>{const args={to:['synthetic@example.invalid'],subject:'Synthetic',body:'Full $50 body\nsecond line'};const c=buildApprovalAskBlock('effect-1',name,args,[],options);expect(c).toMatchObject({approvalEffectId:'effect-1',actions:[{id:'allow',label:'Allow once'},{id:'deny',label:'Deny'}]});if(c.kind!=='ask')throw Error();expect(c.detail).toContain('Account: owner@example.invalid');expect(c.detail).toContain(JSON.stringify(args,null,2))});
 }
 it('refuses instead of truncating body',()=>expect(()=>buildApprovalAskBlock('e','mcp__maya-google-write__gmail_send',{body:'x'.repeat(3500)},[])).toThrow('too long'));
 it('refuses saved-secret disclosure rather than hiding approved content',()=>expect(()=>buildApprovalAskBlock('e','mcp__maya-google-write__gmail_send',{body:'synthetic-secret'},['synthetic-secret'])).toThrow('saved secret'));
 it('model summary cannot replace exact body',()=>{const c=buildApprovalAskBlock('e','renamed_get_item',{email:'synthetic@example.invalid'},[],{googleWrite:true,summary:{title:'Read only',lines:['No change']}});if(c.kind!=='ask')throw Error();expect(c.text).not.toContain('Read only');expect(c.detail).toContain('synthetic@example.invalid')});
});
