// @vitest-environment jsdom
import { act } from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,it,expect,vi} from "vitest";
import {RewriteReviewPanel} from "./RewriteReviewPanel";
import {proposeRewrite} from "../lib/composer-rewrite-review";
import {readComposerDraft,writeComposerDraft} from "../lib/composer-draft";
let root:Root;let div:HTMLDivElement;
afterEach(()=>{act(()=>root?.unmount());div?.remove();localStorage.clear()});
function setup(){globalThis.IS_REACT_ACT_ENVIRONMENT=true;div=document.createElement('div');document.body.append(div);root=createRoot(div);writeComposerDraft('t','original',localStorage);const review=proposeRewrite({owner:'u',threadKey:'t',revision:1,original:'original',proposal:'proposal'});let context={owner:'u',threadKey:'t',revision:1,sending:false,attachments:false};const onApplied=vi.fn(),onUndo=vi.fn(),onDismiss=vi.fn();const render=()=>act(()=>root.render(<RewriteReviewPanel review={review} context={context} storage={localStorage} onApplied={onApplied} onUndo={onUndo} onDismiss={onDismiss}/>));render();return {render,setContext:(c:Partial<typeof context>)=>{context={...context,...c};render()},onApplied,onUndo,onDismiss};}
function click(label:string){const button=Array.from(div.querySelectorAll('button')).find(b=>b.textContent===label);expect(button).toBeTruthy();act(()=>button?.click());}
it('shows original and proposed text but does not change storage on preview',()=>{setup();expect(div.textContent).toContain('Original');expect(div.textContent).toContain('Nothing is sent');expect(readComposerDraft('t',localStorage)).toBe('original');expect(div.querySelector('form')).toBeNull();expect(div.querySelector('[type=submit]')).toBeNull()});
it('apply then undo through stock draft storage',()=>{const f=setup();click('Apply to draft');expect(readComposerDraft('t',localStorage)).toBe('proposal');expect(f.onApplied).toHaveBeenCalledWith('proposal');f.setContext({revision:2});click('Undo rewrite');expect(readComposerDraft('t',localStorage)).toBe('original');expect(f.onUndo).toHaveBeenCalledWith('original')});
it('stale edits remain untouched and error is visible',()=>{setup();writeComposerDraft('t','later',localStorage);click('Apply to draft');expect(div.querySelector('[role=alert]')?.textContent).toContain('Draft changed');expect(readComposerDraft('t',localStorage)).toBe('later')});
it('undo refuses later edits',()=>{const f=setup();click('Apply to draft');f.setContext({revision:2});writeComposerDraft('t','later',localStorage);click('Undo rewrite');expect(div.querySelector('[role=alert]')?.textContent).toContain('Later edits');expect(readComposerDraft('t',localStorage)).toBe('later')});
it('keeps current draft without writes',()=>{const f=setup();click('Keep current draft');expect(f.onDismiss).toHaveBeenCalledOnce();expect(readComposerDraft('t',localStorage)).toBe('original')});
it('blocks active sends',()=>{const f=setup();f.setContext({sending:true});expect(div.querySelector('button')?.disabled).toBe(true)});
it('blocks attachments',()=>{const f=setup();f.setContext({attachments:true});expect(div.querySelector('button')?.disabled).toBe(true)});
it('thread switch refuses apply',()=>{const f=setup();f.setContext({threadKey:'other'});click('Apply to draft');expect(div.querySelector('[role=alert]')?.textContent).toContain('another draft');expect(readComposerDraft('t',localStorage)).toBe('original')});
