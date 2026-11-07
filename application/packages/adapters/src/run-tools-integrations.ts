import {CAPTURE_BINDING,CAPTURE_ACCEPTED,CAPTURE_FAILED,captureMatches,bytesHash} from "./capture-evidence.js";
import {importConnectorScreenshot} from "./connector-screenshot.js";
import {resolveBotWorkspacePath} from "./computer-support.js";
import {SEARCH_TOOL,publicResultUrls} from "./maya-public-read.js";
import {MAYA_VIEW_TOOL} from "./maya-owner-link.js";
import {executePrivateGoogle} from "./google-private-execute.js";
import { normalizedHttpUrl } from "@rakazo/core/egress";
import { executeCloudAgentTool } from "./cloud-agent-service.js";
import { collectLogIds } from "./composio-connector.js";
import { connectApp } from "./connect-app.js";
import { addMcpServerFromTool } from "./mcp-server-tool.js";
import type { RunContext } from "./run-context.js";
import { runScopedToolExecutionId } from "./run-effects.js";
import { flushProgress, publishMidTurnNarration, showNarrationStatus } from "./run-progress.js";
import type { ToolCall, ToolHandlers } from "./run-tool-gate.js";
import { webFetchFromTool, webSearchFromTool } from "./web-tools.js";

export async function cloudAgentTool(ctx: RunContext, call: ToolCall) {
  const { deps, run, bot, context } = ctx;
  const { name, args, effectKey } = call;
  return call.finish(
    await executeCloudAgentTool(
      { ...deps, cloudAgent: ctx.providers.cloudAgent },
      { ...context, operationId: effectKey, botId: bot.id },
      run,
      name,
      args,
    ),
  );
}

export async function connectorTool(ctx: RunContext, call: ToolCall) {
  const { deps, run, bot, thread, context } = ctx;
  const { name, args, effectKey, connectorCall } = call;
  if (connectorCall.route?.catalogGroup === "maya-google-write" && !name.startsWith("mcp__maya-google-write__")) {
    return call.finish({error:"Google write alias is not executable; use its exact direct tool and a new approval."});
  }
  if (name.startsWith("mcp__maya-google-write__")) {
    return executePrivateGoogle(ctx,call);
  }
  if(bot?.id==='fixture-resource-id' && /screenshot/i.test(name) && ctx.state.toolResults.has(CAPTURE_BINDING)) {
    ctx.state.toolResults.set('maya:capture-workflow','true');
    ctx.state.toolResults.delete(CAPTURE_ACCEPTED);
    try {
      const binding=JSON.parse(ctx.state.toolResults.get(CAPTURE_BINDING)!);
      if(!deps.sandbox.pageBrowser)throw new Error('Native capture is unavailable');
      const result:any=await deps.sandbox.pageBrowser(await ctx.computer.get('tool',name),{command:'capture',targetId:binding.targetId,expectedUrl:binding.url,epoch:binding.epoch},context);
      if(!captureMatches(binding,result))throw new Error('Capture target/session/document mismatch');
      let acceptedPath='';let hash='';
      const imported=await importConnectorScreenshot({content:[{type:'image',mimeType:'image/png',data:result.image}]},async(path,bytes)=>{
        await deps.sandbox.writeFile(await ctx.computer.get('tool',name),{path:resolveBotWorkspacePath(ctx.computer.mode,bot.id,path),content:bytes},context);
        acceptedPath=path;hash=bytesHash(bytes);ctx.computer.checkpoint.markDirty();
      },effectKey);
      ctx.state.toolResults.set(CAPTURE_ACCEPTED,JSON.stringify({...binding,path:acceptedPath,hash}));
      ctx.state.toolResults.delete(CAPTURE_FAILED);
      return call.finish({...imported as any,details:{source:"native-bound-screenshot",targetId:binding.targetId,url:binding.url,epoch:binding.epoch,path:acceptedPath,hash,untrusted:true}});
    } catch {
      ctx.state.toolResults.set(CAPTURE_FAILED,'true');
      return call.finish({error:'Native screenshot could not be verified. No screenshot was attached. Do not use another browser screenshot or describe page text as pixels.'});
    }
  }
  if(bot?.id==='fixture-resource-id' && /screenshot/i.test(name)) {
    ctx.state.toolResults.set('maya:capture-workflow','true');ctx.state.toolResults.set(CAPTURE_FAILED,'true');
    return call.finish({error:'Take a fresh native browser snapshot before capturing. Cross-browser screenshot delivery is not accepted.'});
  }
  if (deps.connector) {
    if(name===MAYA_VIEW_TOOL){
      const key=`maya-view:${String(args.url)}`;
      if(ctx.state.toolResults.has(key))return call.finish({status:"unavailable",retryable:false,reason:"This link was already attempted in this run. Do not retry."});
      ctx.state.toolResults.set(key,"attempted");
    }
    let result: unknown = { error: `unknown tool ${name}` };
    for await (const event of deps.connector.execute(
      { ...connectorCall, tool: name, args, executionId: effectKey },
      context,
    )) {
      if (event.type === "result") {
        result = event.data;
        const logIds = collectLogIds(event.data);
        for (const logId of logIds) {
          await deps.events.append({
            spaceId: run.spaceId,
            threadId: thread.id,
            botId: bot.id,
            runId: run.id,
            type: "effect.recorded",
            payload: { tool: name, logId },
          });
        }
      }
      if (event.type === "error") {
        result = { error: event.message };
        for (const logId of event.logIds ?? []) {
          await deps.events.append({
            spaceId: run.spaceId,
            threadId: thread.id,
            botId: bot.id,
            runId: run.id,
            type: "effect.recorded",
            payload: { tool: name, logId },
          });
        }
      }
    }
    if(name===SEARCH_TOOL && connectorCall.route?.resourceId==="fixture-resource-id")for(const url of publicResultUrls(result))ctx.trust.searchResultUrls.add(url);
    if(name===MAYA_VIEW_TOOL && result && typeof result==="object" && Array.isArray((result as any).content)) {
      const content=(result as any).content.filter((v:any)=>v?.type==="text" || v?.type==="image").map((v:any)=>v.type==="image"?{type:"image",data:v.data,mimeType:v.mimeType}:v);
      return call.finish({kind:"agent_tool_result",content,details:{source:"exact-public-owner-link",untrusted:true}});
    }
    if(/screenshot/i.test(name) && !((result as any)?.isError)) {
      ctx.state.toolResults.set("maya:capture-workflow","true");
      try {result=await importConnectorScreenshot(result,async(path,bytes)=>{
        await deps.sandbox.writeFile(await ctx.computer.get('tool',name),{path:resolveBotWorkspacePath(ctx.computer.mode,bot.id,path),content:bytes},context);ctx.computer.checkpoint.markDirty();
      },effectKey);}catch{return call.finish({error:'Screenshot import failed: invalid image or unreadable destination. No screenshot was attached. Do not reconstruct image bytes or claim completion.'});}
    }
    return call.finish(result);
  }
  return call.finish({ error: `unknown tool ${name}` });
}

/** Web, cloud agents, MCP servers, app connections and connector tools. */
export const integrationTools: ToolHandlers = {
  async web_search(ctx, call) {
    const { context } = ctx;
    const { args } = call;
    const found = await webSearchFromTool(ctx.providers.web, context, args);
    // A result's exact URL was chosen by the search index, not by text in this run.
    for (const hit of ("results" in found && found.results) || []) {
      const url = normalizedHttpUrl(hit.url);
      if (url) ctx.trust.searchResultUrls.add(url);
    }
    return call.finish(found);
  },
  async web_fetch(ctx, call) {
    const { context } = ctx;
    const { args } = call;
    return call.finish(await webFetchFromTool(ctx.providers.web, context, args));
  },
  async add_mcp_server(ctx, call) {
    const { deps, run, bot } = ctx;
    const { args, executionId } = call;
    return call.finish(await addMcpServerFromTool(deps, run, bot.id, args, executionId));
  },
  async connect_app(ctx, call) {
    const { deps, run, runId, context } = ctx;
    const { args, executionId, applied } = call;
    await flushProgress(ctx);
    await showNarrationStatus(ctx, await publishMidTurnNarration(ctx, true));
    return call.finish(
      await connectApp(
        deps,
        deps.connectors?.managedProviders?.() ?? [],
        context,
        run,
        args.app,
        applied?.effect.id ?? runScopedToolExecutionId(runId, executionId),
      ),
    );
  },
};
