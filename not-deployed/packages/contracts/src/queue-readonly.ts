import { oc } from "@orpc/contract";
import { z } from "zod";
export const queueReadOnlyContract={
 usage:oc.input(z.object({provider:z.literal("telegram"),days:z.number().int().min(1).max(90)}).strict()).output(z.object({
  days:z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/),z.number().int().nonnegative()),scope:z.literal("linked_personal_channel_inbound_only"),timeBasis:z.literal("server_message_created_at"),timezone:z.literal("Asia/Kolkata"),coversWebChats:z.literal(false),coversGroups:z.literal(false),humanAuthorshipProven:z.literal(false),cost:z.null(),tokens:z.null(),checkedAt:z.string().datetime(),windowFrom:z.string().datetime()
 })),
 status:oc.input(z.object({}).strict()).output(z.object({checkedAt:z.string().datetime(),limitedTo:z.literal(100),runs:z.array(z.object({id:z.string(),runStatus:z.string(),checkedAt:z.string().datetime(),sourceUpdatedAt:z.string().datetime().nullable(),stale:z.boolean(),model:z.string(),cost:z.null(),capabilityState:z.literal("not_verified"),liveChangeAllowed:z.literal(false)})).max(100)}))
};
