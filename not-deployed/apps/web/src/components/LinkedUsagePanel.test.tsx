// @vitest-environment jsdom
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import type {ReactNode} from "react";
import {act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({user:"owner",space:"a",call:vi.fn()}));
vi.mock("@lingui/react/macro",()=>({useLingui:()=>({t:(p:TemplateStringsArray,...v:unknown[])=>p.reduce((s,x,i)=>s+(i?v[i-1]:"")+x,"")}),Trans:({children}:{children:ReactNode})=>children}));
vi.mock("../lib/query",()=>({useQueryUserId:()=>state.user,useSpaceQueries:()=>({queueReadOnly:{usage:{queryOptions:(options:object)=>({...options,queryKey:[state.user,state.space,"linked-usage"],queryFn:()=>state.call()})}}})}));
import {LinkedUsagePanel} from "./LinkedUsagePanel";
let root:ReturnType<typeof createRoot>|undefined;let container:HTMLDivElement|undefined;
afterEach(async()=>{if(root)await act(()=>root!.unmount());container?.remove();root=undefined;state.user="owner";state.space="a";state.call.mockReset();vi.unstubAllGlobals();});
async function mount(){vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");document.body.append(container);root=createRoot(container);const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const render=()=>root!.render(<QueryClientProvider client={client}><LinkedUsagePanel/></QueryClientProvider>);await act(render);return {render,client};}
async function open(){await act(async()=>{const d=container!.querySelector("details")!;d.open=true;d.dispatchEvent(new Event("toggle",{bubbles:true}));});}
const result=(n:number)=>({days:{"2026-11-07":n},checkedAt:"2026-11-07T09:00:00Z"});
it("does not query while collapsed",async()=>{await mount();expect(state.call).not.toHaveBeenCalled();expect(container?.textContent).not.toContain("incoming messages");});
it("does not render/query signed out",async()=>{state.user="";await mount();expect(container?.textContent).toBe("");expect(state.call).not.toHaveBeenCalled();});
it("loads on open and shows count with limits",async()=>{state.call.mockResolvedValue(result(2));await mount();await open();await vi.waitFor(()=>expect(container?.textContent).toContain("2 incoming messages"));expect(container?.textContent).toContain("Tokens and cost: unknown");expect(state.call).toHaveBeenCalledTimes(1);});
it("loading is not zero",async()=>{state.call.mockReturnValue(new Promise(()=>{}));await mount();await open();expect(container?.textContent).toContain("Checking activity");expect(container?.textContent).not.toContain("0 incoming messages");});
it("failure is not empty success and private error is hidden",async()=>{state.call.mockRejectedValue(new Error("private backend"));await mount();await open();await vi.waitFor(()=>expect(container?.textContent).toContain("Activity unavailable"));expect(container?.textContent).not.toContain("private backend");expect(container?.textContent).not.toContain("No matching");});
it("late response from old space never appears in new space",async()=>{let resolve!:(x:unknown)=>void;state.call.mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValue(result(1));const f=await mount();await open();state.space="b";await act(f.render);await act(async()=>resolve(result(88)));await vi.waitFor(()=>expect(container?.textContent).toContain("1 incoming messages"));expect(container?.textContent).not.toContain("88 incoming messages");});
it("switching user drops expanded data and re-closes",async()=>{state.call.mockResolvedValue(result(22));const f=await mount();await open();await vi.waitFor(()=>expect(container?.textContent).toContain("22 incoming messages"));state.user="other";await act(f.render);expect(container?.textContent).not.toContain("22 incoming messages");expect(container?.querySelector("details")?.open).toBe(false);});

it("exports actual bound usage panel fictional visual",async()=>{state.call.mockResolvedValue({days:{"2026-11-01":2,"2026-11-03":4,"2026-11-05":1,"2026-11-07":3},checkedAt:"2026-11-07T09:00:00Z"});await mount();await open();await vi.waitFor(()=>expect(container?.textContent).toContain("10 incoming messages"));console.log("LINKED_USAGE_VISUAL_BASE64",btoa(unescape(encodeURIComponent(container!.outerHTML))));});
