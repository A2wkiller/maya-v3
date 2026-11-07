import React, { useState } from "react";
import { applyRewrite, undoRewrite, type RewriteReview } from "../lib/composer-rewrite-review";
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Context = { owner: string; threadKey: string; revision: number; sending: boolean; attachments: boolean };
/** Unregistered isolated review panel. Proposal generation and Send are absent. */
export function RewriteReviewPanel({ review, context, storage, onApplied, onUndo, onDismiss }: { review: RewriteReview; context: Context; storage: StoragePort; onApplied: (text: string) => void; onUndo: (text: string) => void; onDismiss: () => void }) {
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");
  function apply() {
    try { const text = applyRewrite(review, context, storage); setApplied(true); setError(""); onApplied(text); }
    catch (error) { setError(error instanceof Error ? error.message : "Draft could not be changed"); }
  }
  function undo() {
    try { const text = undoRewrite(review, context, storage); setApplied(false); setError(""); onUndo(text); }
    catch (error) { setError(error instanceof Error ? error.message : "Keep current draft"); }
  }
  return <section aria-label="Review rewrite" className="rewrite-review rounded-xl border border-border bg-background p-4 text-foreground">
    <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Review rewrite</h2><span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">ISOLATED PREVIEW</span></header>
    <p className="my-3 text-sm text-muted-foreground">Only changes your draft. Nothing is sent.</p>
    <div className="rewrite-columns grid grid-cols-1 gap-3 sm:grid-cols-2"><div><h3 className="mb-2 text-sm font-medium">Original</h3><pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{review.original}</pre></div><div><h3 className="mb-2 text-sm font-medium">Proposed draft</h3><pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{review.proposal}</pre></div></div>
    <p className="my-3 text-sm text-muted-foreground">Check names, dates, accounts and promises before applying.</p>
    {error ? <p role="alert">{error}</p> : null}
    {applied ? <p role="status">Applied to draft. Review it before sending.</p> : null}
    <footer className="mt-3 flex flex-wrap gap-2">{applied ? <button className="rounded-lg border border-border px-3 py-2 text-sm" type="button" onClick={undo}>Undo rewrite</button> : <button className="rounded-lg border border-border px-3 py-2 text-sm" type="button" disabled={context.sending || context.attachments} onClick={apply}>Apply to draft</button>}<button className="rounded-lg border border-border px-3 py-2 text-sm" type="button" onClick={onDismiss}>Keep current draft</button></footer>
  </section>;
}
