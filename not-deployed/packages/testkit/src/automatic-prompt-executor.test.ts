import type { AgentRunModel } from "@rakazo/adapter-kit";
import { APPROVED_ACTION_NOT_RUN_ERROR, isConversationalRun } from "@rakazo/core";
import { describe, expect, it, vi } from "vitest";
import type * as ComputerLifecycle from "../../adapters/src/computer-lifecycle.js";
import { createRunExecutor } from "../../adapters/src/executor.js";
import { PiAgentRuntime } from "../../adapters/src/pi-runtime.js";
import { startModelEmulator } from "./model-emulator.js";

vi.mock("../../adapters/src/computer-lifecycle.js", async (original) => ({
  ...(await original<typeof ComputerLifecycle>()),
  acquireComputerExecutionLease: async () => null,
  acquireDedicatedScreenLeaseFence: async () => null,
  holdComputerExecutionLeaseForTakeover: async () => true,
  provisionComputer: async () => ({
    id: "fixture-computer",
    botId: "fixture-bot",
    kind: "fake",
    providerRef: "fixture-computer",
  }),
}));

function fixture(
  model: AgentRunModel,
  encryptedCheckpoint = false,
  toolName = "fixture_write",
  requireApproval = true,
  /** A confirmed image reply linked to this run, with its real steering row binding. */
  reply?: { steeringRunId: string | null; messageRunId?: string },
  supportsImages = false,
) {
  const run = {
    id: "fixture-run",
    botId: "fixture-owner-bot",
    threadId: "fixture-thread",
    taskId: "fixture-task",
    spaceId: "fixture-space",
    userId: "705ef1d1-bc56-5d3f-94a5-e99079fd135e",
    status: "queued",
    trigger: "user",
    routineId: null,
    leaseFence: 0,
    checkpoint: null,
    sourceMessageId: "owner-source" as string | null,
  };
  const task = { id: run.taskId, prompt: "Draft for Sam: Rs 500 on 2026-11-09. Do not send." };
 const originalMessage={id:"owner-source",threadId:run.threadId,runId:run.id,role:"user",seq:1,createdAt:new Date(),blocks:[{kind:"text",text:task.prompt}]};
  const replyBlocks = [
    {
      kind: "image",
      artifactId: "fixture-image",
      name: "reply.png",
      mimeType: "image/png",
      size: 4,
      imageHandling: "confirm",
    },
  ];
  // Like a send during active work, the message is linked to the run for display either way.
  const replyMessage = {
    id: "resumed-reply",
    threadId: run.threadId,
    runId: reply?.messageRunId ?? run.id,
    role: "user",
    seq: 2,
    createdAt: new Date(),
    blocks: replyBlocks,
  };
  const steering: Array<{ id: string; messageId: string; runId: string | null }> = reply
    ? [{ id: "reply-steering", messageId: replyMessage.id, runId: reply.steeringRunId }]
    : [];
  const effects: Record<string, unknown>[] = [];
  const empty = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    count: async () => 0,
    updateMany: async () => ({ count: 0 }),
  };
  const prisma = new Proxy(
    {
      $contentEncryption: () =>
        encryptedCheckpoint
          ? {
              ring: {
                encryptWrites: true,
                byId: async () => ({
                  id: "fixture-key",
                  spaceId: "fixture-space",
                  version: 1,
                  key: new Uint8Array(32).fill(7),
                }),
              },
            }
          : undefined,
      spaceSettingOverride: { findUnique: async () => null },
      userActionApprovalRule: {
        findMany: async () => [
          {
            effect: requireApproval ? "require_approval" : "allow",
            matchKind: "tool",
            matchValue: toolName,
          },
        ],
      },
      artifact: {
        ...empty,
        findMany: async () => [{ id: "fixture-image", storageKey: "fixture-image-key" }],
      },
      message: {
        ...empty,
        findMany: async ({ where }: { where?: { OR?: Record<string, unknown>[] } } = {}) =>
          (reply ? [replyMessage] : [originalMessage]).filter(
            (message) =>
              !where?.OR ||
              where.OR.some((match) =>
                "id" in match
                  ? message.id === match.id
                  : "runId" in match
                    ? message.runId === match.runId
                    : steering.some(
                        (row) =>
                          row.messageId === message.id &&
                          row.runId ===
                            (match as { steeringMessages: { some: { runId: string } } })
                              .steeringMessages.some.runId,
                      ),
              ),
          ),
        create: async ({ data }: { data: object }) => ({ id: "fixture-message", ...data }),
      },
      event: { ...empty, create: async ({ data }: { data: object }) => ({ seq: 1, ...data }) },
      usageRecord: { createMany: async () => ({ count: 1 }) },
      run: {
        findUnique: async () => ({ ...run }),
        findUniqueOrThrow: async () => ({ ...run }),
        findFirst: async () => null,
        updateMany: async ({ data }: { data: object }) => {
          Object.assign(run, data);
          return { count: 1 };
        },
      },
      task: { findUniqueOrThrow: async () => task, updateMany: async () => ({ count: 1 }) },
      bot: {
        ...empty,
        update: async () => ({}),
        findUniqueOrThrow: async () => ({
          id: run.botId,
          userId:run.userId,
          spaceId:run.spaceId,
          name: "Fixture",
          title: "Fixture",
          description: "Fixture",
          modelProvider: model.provider,
          modelId: model.id,
          computerId: "fixture-computer",
          computerSwitching: false,
          memoryScope: null,
          computer: {
            id: "fixture-computer",
            scope: "dedicated",
            kind: "fake",
            homeKey: "fixture-home",
          },
        }),
      },
      attempt: {
        ...empty,
        create: async () => ({ id: "fixture-attempt" }),
        update: async () => ({}),
        updateMany: async () => ({ count: 1 }),
        count: async () => 2,
      },
      thread: {
        update: async () => ({ nextEventSeq: 1, nextMessageSeq: 1 }),
        findUniqueOrThrow: async () => ({
          id: run.threadId,
          botId:run.botId,
          externalConversationId:null,
          groupId: null,
          nextMessageSeq: 1,
          historyCompactionSummary: null,
          historyCompactedUpToSeq: null,
        }),
      },
      deploymentSettings: {
        findUnique: async () => ({
          defaultModelProvider: model.provider,
          defaultModelId: model.id,
        }),
      },
      userModelCredential: {
        ...empty,
        findMany: async () => [
          {
            id: "fixture-credential",
            provider: model.provider,
            defaultModel: model.id,
            secretId: "fixture-key",
          },
        ],
      },
      secret: {
        ...empty,
        findFirst: async () => ({ id: "fixture-key", ciphertext: "fixture-ciphertext" }),
      },
      $queryRaw: async () => [],
      $transaction: async (action: (tx: unknown) => Promise<unknown>) => action(prisma),
      externalEffect: {
        ...empty,
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          effects.filter((effect) =>
            Object.entries(where).every(
              ([key, value]) => typeof value === "object" || effect[key] === value,
            ),
          ),
        findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
          effects.find((effect) => effect.idempotencyKey === where.idempotencyKey) ?? null,
        create: async ({ data }: { data: object }) => {
          const effect = { id: `fixture-effect-${effects.length}`, ...data };
          effects.push(effect);
          return effect;
        },
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
          const matching = effects.filter((effect) =>
            Object.entries(where).every(
              ([key, value]) => typeof value === "object" || effect[key] === value,
            ),
          );
          for (const effect of matching) Object.assign(effect, data);
          return { count: matching.length };
        },
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { idempotencyKey: string };
          create: object;
          update: object;
        }) => {
          const previous = effects.find((effect) => effect.idempotencyKey === where.idempotencyKey);
          if (previous) {
            Object.assign(previous, update);
            return previous;
          }
          const effect = { id: `fixture-effect-${effects.length}`, ...create };
          effects.push(effect);
          return effect;
        },
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          for (let i = effects.length - 1; i >= 0; i--)
            if (
              Object.entries(where).every(
                ([key, value]) => typeof value === "object" || effects[i]![key] === value,
              )
            )
              effects.splice(i, 1);
          return { count: 1 };
        },
      },
    },
    {
      get(target, key) {
        return key in target ? target[key as keyof typeof target] : empty;
      },
    },
  );
  const finalizeRun = vi.fn(async (input) => {
    run.status = input.outcome;
    await prisma.externalEffect.deleteMany({
      where: { runId: run.id, kind: "runtime_checkpoint" },
    });
    return { continuationRunId: null };
  });
  const pauseRunForInput = vi.fn(async () => {
    run.status = "waiting_input";
    return { continuationRunId: null };
  });
  const pauseRunForTakeover = vi.fn(async () => {
    run.status = "waiting_takeover";
    return { continuationRunId: null };
  });
  const writes = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
  const reads = vi.fn(async (_computer: unknown, _path: string) =>
    new TextEncoder().encode("unique-executor-evidence"),
  );
  const executor = createRunExecutor({
    prisma,
    artifacts: { get: async () => new Uint8Array([137, 80, 78, 71]) },
    runtime: new PiAgentRuntime(),
    mcpAllowPrivateEndpoint: true,
    deploymentModelKey: "fixture-key",
    secretStore: {
      load: async () =>
        JSON.stringify({
          kind: "openai_compatible",
          apiKey: "local",
          baseUrl: model.baseUrl,
          allowPrivateEndpoint: true,
          contextWindow: 160000,
          maxTokens: 1024,
          visionModelIds: supportsImages ? [model.id] : [],
        }),
    },
    connector: {
      discoverTools: async () => [
        {
          name: toolName,
          description: "Write the fixture",
          inputSchema: {
            type: "object",
            properties: { content: { type: "string" } },
            required: ["content"],
          },
        },
      ],
      async *execute(call: { args: Record<string, unknown> }) {
        writes(call.args);
        yield { type: "result", data: { ok: true, result: "fixture-approved-result" } };
      },
    },
    sandbox: {
      describe: () => ({ id: "fake", capabilities: { graphical: true } }),
      readFile: reads,
      writeFile: writes,
      async *exportWorkspace() {},
      releaseScreen: async () => undefined,
    },
    home: { commit: async () => "fixture-revision" },
    memory: { read: async () => ({ documents: [] }) },
    memoryProviders: { resolve: async () => null },
    events: {
      notify: vi.fn(async () => undefined),
      append: vi.fn(async () => undefined),
      // Production claim rule: routine turns take only rows bound to them; pending rows wait.
      claimSteering: async (input: { runId: string; seenIds: string[] }) =>
        steering
          .filter(
            (row) =>
              !input.seenIds.includes(row.id) &&
              (row.runId === input.runId ||
                (row.runId === null && isConversationalRun(run.trigger))),
          )
          .map((row) => {
            row.runId = input.runId;
            return {
              id: row.id,
              messageId: row.messageId,
              text: "Read this image",
              blocks: replyBlocks,
            };
          }),
      finalizeRun,
      pauseRunForInput,
      pauseRunForTakeover,
    },
    jobs: { enqueue: vi.fn(async () => undefined) },
    notifications: { send: vi.fn(async () => undefined) },
    secrets: [],
  } as unknown as Parameters<typeof createRunExecutor>[0]);
  return {
    executor,
    prisma,
    run,
    task,
    effects,
    finalizeRun,
    pauseRunForInput,
    pauseRunForTakeover,
    writes,
    reads,
  };
}

describe("actual executor same-call prompt preparation, fictional data",()=>{
 it.each(["user","messaging","routine"])("preserves raw message and uses one local emulator call for %s",async(trigger)=>{
 let observed=0;
 const model=await startModelEmulator({steps:[{expect(request){
  observed++;
  const all=JSON.stringify(request.messages);
  expect(all).toContain("Draft for Sam: Rs 500 on 2026-11-09. Do not send.");
  if(trigger==="routine")expect(all).not.toContain("Automatically clarify the current user's task internally");
  else expect(all).toContain("Automatically clarify the current user's task internally");
  expect(all).not.toContain("Review a rewrite");
 },response:{type:"text",text:"Fictional draft prepared. Nothing sent."}}]});
 try{
  const state=fixture(model.model,false,"fixture_write",true);
  state.run.trigger=trigger;
  await state.executor.continueRun(state.run.id,"fixture-worker");
  model.assertComplete();expect(observed).toBe(1);expect(model.requests).toHaveLength(1);
  expect(state.run.status).toBe("completed");expect(state.writes).not.toHaveBeenCalled();
  expect(state.task.prompt).toBe("Draft for Sam: Rs 500 on 2026-11-09. Do not send.");
 }finally{await model.close();}
 });
});
