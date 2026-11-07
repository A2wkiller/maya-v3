// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,it,expect} from 'vitest';
import {QueueStatusPanel,type StatusRow} from './QueueStatusPanel';
let root:Root,div:HTMLDivElement;afterEach(()=>{act(()=>root?.unmount());div?.remove()});
function render(rows:StatusRow[],error?:string){globalThis.IS_REACT_ACT_ENVIRONMENT=true;div=document.createElement('div');document.body.append(div);root=createRoot(div);act(()=>root.render(<QueueStatusPanel rows={rows} error={error}/>));return div;}
const row:StatusRow={id:'fixture-1',runStatus:'completed',checkedAt:'2026-11-07T08:00:00Z',sourceUpdatedAt:null,stale:true,model:'unknown',cost:null,capabilityState:'not_verified',liveChangeAllowed:false};
it('completion does not imply feature working',()=>{const d=render([row]);expect(d.textContent).toContain('completed');expect(d.textContent).toContain('Not verified by this view')});
it('shows stale and unknown rather than a green working claim',()=>{const d=render([row]);expect(d.textContent).toContain('Stale or unverified');expect(d.textContent).toContain('Unknown')});
it('has no action controls',()=>{const d=render([row]);expect(d.querySelector('button,input,form')).toBeNull()});
it('empty state does not claim all tasks complete',()=>{const d=render([]);expect(d.textContent).toContain('No runs returned');expect(d.textContent).not.toContain('All done')});
it('error is not converted into empty or healthy',()=>{const d=render([],'backend failed');expect(d.querySelector('[role=alert]')?.textContent).toContain('Status unavailable');expect(d.textContent).not.toContain('backend failed');expect(d.textContent).not.toContain('No runs returned')});
it('escapes malicious labels as text',()=>{const d=render([{...row,id:'<img src=x onerror=alert(1)>'}]);expect(d.querySelector('img')).toBeNull();expect(d.textContent).toContain('<img')});
