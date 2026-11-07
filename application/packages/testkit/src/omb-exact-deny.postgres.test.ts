import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ComposioConnector, FakeComposioClient, FakeSandboxProvider } from "@rakazo/adapters";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { discardBotIntroRun } from "./discard-bot-intro.js";
import { sessionCookieHeader } from "./index.js";
import type { ModelEmulatorStep } from "./model-emulator.js";
import { startModelEmulator } from "./model-emulator.js";
import { asSystem } from "./system-db.js";

type App = { request: (input: string, init?: RequestInit) => Response | Promise<Response> };
const databaseAvailable = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
if (!databaseAvailable) throw new Error("Fictional DB proof requires VERIFY_DATABASE=1 and DATABASE_URL; never report a skipped pass");
const fixtureOrigin = "http://127.0.0.1:5173";

describe.skipIf(!databaseAvailable)("offline fictional exact-command denial", () => {
  beforeAll(() => {
    // Use the existing compatible-endpoint capability declaration so the real
    // executor exposes computer tools without mocking its model vision gate.
    vi.stubEnv("RAKAZO_OPENAI_COMPATIBLE_VISION_MODELS", "offline-fixture");
    vi.stubEnv("MCP_ALLOW_PRIVATE_ENDPOINT", "true");
  });
  afterAll(() => vi.unstubAllEnvs());

  // Deliberately deny-only: Allow is user-only and not exercised by this proof.
  // Original allow assertions remain unreachable to retain comparison with upstream fixture.
  it.each(["deny"] as const)(
    "%s preserves the exact fictional request without connector dispatch",
    async (answer) => {
      const approvedArgs={command:"printf 'fictional only'",cwd:"/fixture/work",provider:"mock-local",bot:"fixture-resource-id",session:"fictional-binding-v1",audience:"test"};
      let dispatches=0;
      const connector={describe:()=>({id:"fictional",contractVersion:"1",adapterVersion:"0.1.0",capabilities:{discover:true,oauth:false,secretsBrokered:false}}),discoverTools:async()=>[{name:"fictional_exact_command",description:"Fictional never-executed exact command preview",inputSchema:{type:"object",properties:Object.fromEntries(Object.keys(approvedArgs).map(k=>[k,{type:"string"}])),required:Object.keys(approvedArgs),additionalProperties:false},route:{connectorId:"fictional",toolName:"fictional_exact_command"}}],async *execute(){dispatches++;yield {type:"result" as const,data:{executable:false}};}};
      const resultStep=(id:string):ModelEmulatorStep["expect"] => request=>{const result=request.messages.findLast(m=>m.role==="tool");expect(result?.tool_call_id).toBe(id);expect(JSON.stringify(result)).toMatch(/denied/i);expect(dispatches).toBe(0);};
      const fixtureKey = "offline-computer-approval-key";
      const model = await startModelEmulator({
        apiKey: fixtureKey,
        steps: [
          {
            expect(request) {
              expect(request.tools).toContainEqual(
                expect.objectContaining({
                  function: expect.objectContaining({ name: "fictional_exact_command" }),
                }),
              );
            },
            response: {
              type: "tool",
              id: "pending-action",
              name: "fictional_exact_command",
              arguments: approvedArgs,
            },
          },
          {
            // Restore the original pending call before another model choice.
            expect: resultStep("pending-action"),
            response: { type: "text", text: "Finished the approval fixture." },
          },
        ],
      });
      const dataDir = await mkdtemp(path.join(tmpdir(), "rakazo-computer-approval-"));
      let stop: (() => Promise<void>) | undefined;
      try {
        const { createApp } = await import("@rakazo/api/app");
        const handles = await createApp({
          databaseUrl: process.env.DATABASE_URL!,
          realtimeDatabaseUrl: process.env.DATABASE_URL!,
          authUrl: fixtureOrigin,
          webOrigin: fixtureOrigin,
          dataDir,
          sandboxProvider: "fake",
          agentRuntime: "pi",
          wakeupDriver: "memory",
          signupsEnabled: "true",
          composio: new ComposioConnector({ client: new FakeComposioClient() }),
          connectors:[connector],
          encryptionKey: "offline-computer-fixture-encryption-key",
        });
        stop = handles.stop;
        const db = asSystem(handles.prisma);
        const signup = await handles.app.request("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: fixtureOrigin },
          body: JSON.stringify({
            email: `computer-approval-${randomUUID()}@rakazo.test`,
            password: "password12",
            name: "Computer approval fixture",
          }),
        });
        expect(signup.status).toBeLessThan(400);
        const cookie = sessionCookieHeader(signup);
        await rpc(handles.app, cookie, "models/connect", {
          provider: model.model.provider,
          modelId: model.model.id,
          baseUrl: model.baseUrl,
          apiKey: fixtureKey,
          contextWindow: 160_000,
          maxTokens: 4096,
        });
        const bot = await rpc<{ id: string }>(handles.app, cookie, "bots/create", {
          name: "Computer fixture",
          title: "",
          description: "",
          instructions: "Complete the computer task.",
          notifyOnFinish: false,
        });
        await discardBotIntroRun(handles, cookie, bot.id);
        await rpc(handles.app, cookie, "bots/update", {
          botId: bot.id,
          modelProvider: model.model.provider,
          modelId: model.model.id,
        });
        const fixtureThread=await db.thread.findFirstOrThrow({where:{botId:bot.id},orderBy:{id:"asc"}});
        Object.assign(approvedArgs,{bot:bot.id,session:fixtureThread.id});
        const storedBot = await db.bot.findUniqueOrThrow({ where: { id: bot.id } });
        await db.userActionApprovalRule.create({
          data: {
            userId: storedBot.userId,
            effect: "require_approval",
            matchKind: "tool",
            matchValue: "fictional_exact_command",
          },
        });
        const sent = await rpc<{ runId: string }>(handles.app, cookie, "threads/send", {
          botId: bot.id,
          text: "Put approved clipboard content on the computer clipboard.",
        });
        const waitForRun = async (status: string) => {
          await expect
            .poll(
              async () => {
                const run = await db.run.findUniqueOrThrow({
                  where: { id: sent.runId },
                });
                if (run.status === "failed") model.assertComplete();
                return run.status;
              },
              { timeout: 15_000, interval: 100 },
            )
            .toBe(status);
        };
        await waitForRun("waiting_input");
        expect(model.requests).toHaveLength(1);
        expect(dispatches).toBe(0);
        const effects = await db.externalEffect.findMany({
          where: { runId: sent.runId },
        });
        expect(effects).toHaveLength(2);
        expect(effects.find((effect) => effect.kind === "runtime_checkpoint")).toMatchObject({
          status: "runtime_checkpoint",
          request: {},
        });
        const actionEffect = effects.find((effect) => effect.kind === "fictional_exact_command")!;
        expect(actionEffect).toMatchObject({
          kind: "fictional_exact_command",
          status: "intended",
          request: approvedArgs,
        });
        expect(actionEffect.request).toEqual(approvedArgs);
        const card = await db.message.findFirstOrThrow({
          where: { runId: sent.runId, role: "bot" },
          orderBy: { seq: "desc" },
        });
        expect(card.blocks).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ kind: "ask", approvalEffectId: actionEffect.id }),
          ]),
        );
        const ask=(card.blocks as any[]).find(b=>b.kind==="ask");
        expect(JSON.parse(ask.detail)).toEqual(approvedArgs);
        expect(ask.actions.map((x:any)=>x.id)).toEqual(["allow","deny"]);
        await rpc(handles.app, cookie, "threads/answer", {
          botId: bot.id,
          runId: sent.runId,
          messageId: card.id,
          answer,
        });
        await waitForRun("completed");
        model.assertComplete();
        expect(dispatches).toBe(0);
        const settledEffects = await db.externalEffect.findMany({
          where: { runId: sent.runId },
        });
        expect(settledEffects).toHaveLength(1);
        expect(settledEffects[0]!.request).toEqual(approvedArgs);
        expect(settledEffects[0]).toMatchObject({
          id: actionEffect.id,
          status: answer === "allow" ? "completed" : "denied",
          request: approvedArgs,
        });
      } finally {
        try {
          await stop?.();
        } finally {
          await model.close();
          await rm(dataDir, { recursive: true, force: true });
        }
      }
    },
    45_000,
  );
});

async function rpc<T>(
  app: App,
  cookie: string,
  procedure: string,
  input: unknown = {},
): Promise<T> {
  const response = await app.request(`/rpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: fixtureOrigin },
    body: JSON.stringify({ json: input }),
  });
  const body = (await response.json()) as { json?: T; error?: { message?: string } };
  if (response.status >= 400 || body.error)
    throw new Error(`${procedure}: ${JSON.stringify(body)}`);
  return body.json as T;
}
