/** Isolated review-only adapter. No model request, send, or live component registration. */
import { readComposerDraft, readComposerDraftBindings, writeComposerDraft } from "./composer-draft";
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type RewriteReview = Readonly<{ owner: string; threadKey: string; revision: number; original: string; proposal: string }>;
export function proposeRewrite(input: RewriteReview): RewriteReview {
  if (!input.owner || !input.threadKey || !Number.isSafeInteger(input.revision) || input.revision < 0 || !input.original.trim() || !input.proposal.trim() || input.proposal.length > 20000) throw new Error("Invalid rewrite review");
  return Object.freeze({ ...input });
}
export function applyRewrite(review: RewriteReview, context: { owner: string; threadKey: string; revision: number; sending: boolean; attachments: boolean }, storage: StoragePort): string {
  if (review.owner !== context.owner || review.threadKey !== context.threadKey || review.revision !== context.revision) throw new Error("Review is stale or belongs to another draft");
  if (context.sending || context.attachments) throw new Error("Review text-only drafts while idle");
  if (readComposerDraft(context.threadKey, storage) !== review.original) throw new Error("Draft changed; review again");
  if (readComposerDraftBindings(context.threadKey, storage).length) throw new Error("Mentions need separate review; keep original");
  writeComposerDraft(context.threadKey, review.proposal, storage);
  if (readComposerDraft(context.threadKey, storage) !== review.proposal) throw new Error("Draft was not saved");
  return review.proposal;
}
export function undoRewrite(review: RewriteReview, context: { owner: string; threadKey: string; revision: number }, storage: StoragePort): string {
  if (review.owner !== context.owner || review.threadKey !== context.threadKey || review.revision + 1 !== context.revision || readComposerDraft(context.threadKey, storage) !== review.proposal) throw new Error("Later edits or another draft; keep current text");
  writeComposerDraft(context.threadKey, review.original, storage);
  if (readComposerDraft(context.threadKey, storage) !== review.original) throw new Error("Original was not saved");
  return review.original;
}
