import {ownerPastedUrls} from "./maya-owner-link.js";
export const HEALTH_RESOURCE="fixture-resource-id", SEARCH_RESOURCE="fixture-resource-id";
export const SEARCH_TOOL="mcp__maya-search-test__public_web_search";
export function shortPublicQuery(query:unknown,text:string):boolean {
 if(typeof query!=="string" || query.length<2 || query.length>240 || /https?:|[\x00-\x1f]|\S+@\S+|\b\d{5,}\b|\b(password|passcode|secret|token|key|private|confidential|my|our|customer|client|patient|salary|account|inbox)\b/i.test(query))return false;
 const words=query.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];const owner=new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]);
 return words.length>0&&words.every(w=>owner.has(w));
}
function publicUrl(u:unknown):u is string {if(typeof u!=="string")return false;try{const x=new URL(u);return x.protocol==="https:"&&!x.username&&!x.password&&(!x.port||x.port==="443")&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(x.hostname)&&x.hostname.includes(".")&&!/\.(local|internal|localhost)$/.test(x.hostname);}catch{return false;}}
export function approvedPublicRead(x:{botId:string;ownerStarted:boolean;group:boolean;trigger:string;name:string;resourceId?:string;args:Record<string,unknown>;text:string;results:Set<string>}):boolean {
 if(!["fixture-owner-bot","fixture-resource-id"].includes(x.botId)||!x.ownerStarted||x.group||!["user","messaging"].includes(x.trigger))return false;
 if(x.resourceId===HEALTH_RESOURCE && ["mcp__maya-health__capability_status","mcp__maya-health__server_status"].includes(x.name))return Object.keys(x.args).length===0;
 if(x.name==="web_search"||x.name===SEARCH_TOOL&&x.resourceId===SEARCH_RESOURCE)return Object.keys(x.args).every(k=>["query","maxResults","provider","news"].includes(k))&&shortPublicQuery(x.args.query,x.text)&&(x.args.provider===undefined||x.args.provider==="selfhost");
 const reader=x.name==="web_fetch"||(x.resourceId===SEARCH_RESOURCE&&x.name==="mcp__maya-search-test__read_public_result");
 return reader&&Object.keys(x.args).every(k=>["url","maxChars","offset"].includes(k))&&publicUrl(x.args.url)&&(ownerPastedUrls(x.text).includes(x.args.url)||x.results.has(x.args.url));
}
export function publicResultUrls(result:unknown):string[]{
 const found:string[]=[];
 function visit(x:any){if(!x||typeof x!=="object")return;if(Array.isArray(x.results))for(const v of x.results)if(publicUrl(v?.url))found.push(v.url);if(Array.isArray(x.content))for(const v of x.content)if(v.type==="text")try{visit(JSON.parse(v.text));}catch{}}
 visit(result);return found;
}
