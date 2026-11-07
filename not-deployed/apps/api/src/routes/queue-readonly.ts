import { ORPCError } from "@orpc/server";
import { linkedDmUsage, queueRunView } from "@rakazo/core";
import type { RouterContext } from "./context.js";
/** Candidate registration only. Actor scope comes exclusively from stock auth/RLS. */
export function queueReadOnlyRoutes(ctx:RouterContext){
 const {deps,authed}=ctx;
 return {queueReadOnly:{
  usage:authed.queueReadOnly.usage.handler(async({context,input})=>{
   const now=new Date();const from=new Date(now.getTime()-input.days*86400000);
   try{return {...await linkedDmUsage(deps.prisma,{spaceId:context.actor.spaceId,userId:context.actor.userId,provider:input.provider,from,now}),checkedAt:now.toISOString(),windowFrom:from.toISOString()};}
   catch(error){
    if(error instanceof Error && ["A single verified linked identity is required","Linked thread ownership mismatch"].includes(error.message))throw new ORPCError("NOT_FOUND",{message:"A verified linked personal Telegram channel is unavailable."});
    if(error instanceof Error && error.message==="Narrow window; results exceed complete-count limit")throw new ORPCError("BAD_REQUEST",{message:"Choose a shorter window for a complete count."});
    throw new ORPCError("INTERNAL_SERVER_ERROR",{message:"Usage could not be checked."});
   }
  }),
  status:authed.queueReadOnly.status.handler(async({context})=>{
   const now=new Date();try{return {runs:await queueRunView(deps.prisma,{spaceId:context.actor.spaceId,userId:context.actor.userId,now}),checkedAt:now.toISOString(),limitedTo:100 as const};}
   catch{throw new ORPCError("INTERNAL_SERVER_ERROR",{message:"Run status could not be checked."});}
  })
 }};
}
