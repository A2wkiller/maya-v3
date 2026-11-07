export const MAYA_VIEW_TOOL = "mcp__maya-user-view-test__view_user_link";
export const MAYA_VIEW_RESOURCE = "fixture-resource-id";
export function ownerPastedUrls(text:string):string[] {
 const direct=text.replace(/```[\s\S]*?```/g, "").split("\n").filter(l=>!/^\s*>/.test(l)).join("\n");
 return [...direct.matchAll(/https:\/\/[^\s<>"'`]+/g)].map(m=>m[0]).filter(s=>{try{const u=new URL(s);return !u.username&&!u.password&&(!u.port||u.port==="443");}catch{return false;}});
}
export function isOwnerPastedView(x:{name:string;resourceId?:string;ownerStarted:boolean;trigger:string;text:string;args:Record<string,unknown>}):boolean {
 return x.name===MAYA_VIEW_TOOL&&x.resourceId===MAYA_VIEW_RESOURCE&&x.ownerStarted&&["user","messaging"].includes(x.trigger)&&Object.keys(x.args).length===1&&typeof x.args.url==="string"&&ownerPastedUrls(x.text).includes(x.args.url);
}
export function linkTaskNote(text:string):string|undefined {
 const urls=ownerPastedUrls(text);if(urls.length!==1)return;
 const remaining=text.replace(urls[0]!,"").trim();
 if(!/^(?:(?:please\s+)?(?:summari[sz]e|explain|view|open|watch)(?:\s+(?:it|this|the reel|this reel|the video|this video))?[.!?]?)?$/i.test(remaining))return;
 return `Current link task: ${urls[0]}. Open this exact owner-pasted URL with the public viewer, not a web search for another topic. Earlier conversation and memory are not the content of this link. Summarize only verified content returned for this exact URL. For a reel, summarize sampled frames only when media_verified:true and speech only when audio_transcribed:true; distinguish webpage resource limits from verified media. Otherwise say what is unverified. Do not invent frames, speech or transcript. Do not retry the same failed URL in this run or ask for repeat approval. Do not offer unrelated email, health or old task actions. If viewing fails, answer in one or two short sentences about this exact link only, using the returned error category; do not recap conversation history or add pending task lists.`;
}

