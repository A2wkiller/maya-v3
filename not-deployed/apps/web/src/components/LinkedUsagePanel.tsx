import { Trans,useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useQueryUserId,useSpaceQueries } from "../lib/query";
/** Sandbox source binding. No polling, refresh loop, content retrieval or write controls. */
export function LinkedUsagePanel(){
 const user=useQueryUserId();return user?<SignedInUsage key={user}/>:null;
}
function SignedInUsage(){
 const {t}=useLingui();const queries=useSpaceQueries();const [open,setOpen]=useState(false);
 const usage=useQuery(queries.queueReadOnly.usage.queryOptions({input:{provider:"telegram",days:28},enabled:open,refetchInterval:false,refetchOnMount:false,retry:false,staleTime:0}));
 // Never keep a prior owner's/space's result as placeholder data.
 const data=usage.error?undefined:usage.data;
 return <details className="mx-2.5 my-2 rounded-lg border border-border p-3 text-[13px]" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className="min-h-11 cursor-pointer py-3 font-medium"><Trans id="Telegram activity">Telegram activity</Trans></summary>
  {open?<div className="space-y-3">
   <p className="text-muted-foreground"><Trans id="Linked personal incoming messages, last 28 days. Receipt dates in India time. Not web chats, groups or proof of human authorship.">Linked personal incoming messages, last 28 days. Receipt dates in India time. Not web chats, groups or proof of human authorship.</Trans></p>
   {usage.isPending?<p role="status"><Trans id="Checking activity...">Checking activity...</Trans></p>:usage.error?<p role="alert"><Trans id="Activity unavailable. No count can be confirmed.">Activity unavailable. No count can be confirmed.</Trans></p>:data?<>
    <p className="font-medium">{Object.values(data.days).reduce((sum,n)=>sum+n,0)} <Trans id="incoming messages">incoming messages</Trans></p>
    {Object.keys(data.days).length?<ul className="grid grid-cols-1 gap-2" aria-label="Daily incoming messages">{Object.entries(data.days).map(([day,count])=><li key={day} className="flex justify-between gap-3 rounded border border-border px-2 py-1"><time dateTime={day}>{day}</time><span>{count}</span></li>)}</ul>:<p><Trans id="No matching incoming messages in this window.">No matching incoming messages in this window.</Trans></p>}
    <p className="break-words text-muted-foreground"><Trans id="Checked">Checked</Trans>: <time dateTime={data.checkedAt}>{data.checkedAt}</time></p>
   </>:null}
   <p className="text-muted-foreground"><Trans id="Tokens and cost: unknown. Read only. Opens on request, no automatic polling.">Tokens and cost: unknown. Read only. Opens on request, no automatic polling.</Trans></p>
  </div>:null}
 </details>;
}
