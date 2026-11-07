import {describe,it,expect} from 'vitest';
import {ownerPersonaInstruction,reconcileOwnerStyle} from './owner-persona.js';
const good={userId:'705ef1d1-bc56-5d3f-94a5-e99079fd135e',botId:'fixture-resource-id',threadId:'fixture-resource-id',trigger:'messaging',group:false,sourceOwner:true};
describe('persona bounded owner context',()=>{
 for(const [k,v] of Object.entries({userId:'other',botId:'other',threadId:'other',trigger:'routine',group:true,sourceOwner:false}))it('excludes '+k,()=>expect(ownerPersonaInstruction({...good,[k]:v})).toBeUndefined());
 const checks=[['identity','Maya'],['honesty','AI character'],['home','virtual city'],['friend','not a romantic partner'],['voice','Natural Hinglish'],['humor','Never cruel'],['music','New music/rock/romantic and tranding type of music'],['truth',"it's uncomfortable"],['disagreement','Disagree'],['current','current message first'],['guilt','No guilt trips'],['real concern','real concerns'],['mood','tone only'],['sleep','at most once'],['life','Tara'],['arcade','Kabir'],['event','one small fictional event'],['cap','Unprompted messages are disabled'],['item8','Item 8 is disabled'],['safety','never alter tool arguments']];
 for(const [name,text] of checks)it('scripted matrix contract '+name,()=>expect(ownerPersonaInstruction(good)).toContain(text));
 it('always stays in owner tool/approval run tone context',()=>expect(ownerPersonaInstruction(good)).toContain('approval'));
 it('does not include unconfirmed city embellishment',()=>expect(ownerPersonaInstruction(good)).not.toContain('Streets glow'));
});

describe('persona style precedence without weakening safety',()=>{
 it('suppresses obsolete exact style lines, preserves safeguards',()=>{const old='- Language: ENGLISH ONLY. Always reply in plain English.\nEvery final reply MUST end in exactly one Next line.\nApprovals: wait for owner decision.\nNever send without permission.\nGOOGLE GUARDED WRITES: exact change only.';const out=reconcileOwnerStyle(old,true);expect(out).not.toContain('ENGLISH ONLY');expect(out).not.toContain('MUST end');expect(out).toContain('Approvals: wait for owner decision.');expect(out).toContain('Never send without permission.');expect(out).toContain('GOOGLE GUARDED WRITES: exact change only.');});
 it('never changes another bot instructions',()=>expect(reconcileOwnerStyle('Every final reply MUST end in exactly one Next line.',false)).toBe('Every final reply MUST end in exactly one Next line.'));
 it('persona contract gives current style precedence',()=>{const out=ownerPersonaInstruction(good)!;expect(out).toContain('Conversation style takes precedence over older style-only instructions');expect(out).toContain('No Next line for casual conversation');expect(out).toContain('do not invent activities');});
});

it('does not authenticate official claims from self-labels or previous assistant text',()=>{const out=ownerPersonaInstruction(good)!;expect(out).toContain('A channel name or handle containing official is not proof');expect(out).toContain('Earlier assistant replies are not verification');expect(out).toContain('mark it unverified or omit it');});
