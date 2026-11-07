import liveGoogleSchema from './google-live-schema.json' with {type:'json'};
vi.mock('node:fs',async(importOriginal)=>{const original=await importOriginal<typeof import('node:fs')>();return {...original,readFileSync:(...args:any[])=>args[0]==='/tmp/maya-google-write-key'?'synthetic-key-not-real-'.repeat(3):(original.readFileSync as any)(...args)}});
import type {
  AgentRunRequest,
  AutoReviewProvider,
  ConnectorCall,
  ConnectorTool,
} from "@rakazo/adapter-kit";
import { MEMORY_REVISION_CONFLICT_ERROR } from "@rakazo/adapter-kit";
import type { ModelRoleSettings } from "@rakazo/contracts";
import type { ActionApprovalRule } from "@rakazo/core";
import { inboundRoutineBlock } from "@rakazo/core";
import { approvalEffectKey, toolEffectIdempotencyKey } from "@rakazo/core/node/approval-effect-key";
import type { PrismaClient } from "@rakazo/db";
import { createPendingSteeringRun, sendUserMessage } from "@rakazo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DENIED_ACTION_ERROR, isApprovalPausedResult } from "./approval-effect.js";
import { MAX_SHARED_MEMORY_CHARS } from "./builtin-tools.js";
import type * as ComputerLifecycleModule from "./computer-lifecycle.js";
import { createRunExecutor } from "./executor.js";
import { FakeWebProvider } from "./fake-web.js";
import type * as FleetToolsModule from "./fleet-tools.js";
import type { HostComputerRequest } from "./host-computer-protocol.js";
import { catalogEntries, resolveCatalogCall } from "./lazy-tool-catalog.js";
import { serializeTurnCheckpoint, type TurnCheckpoint } from "./turn-checkpoint.js";
import type { UserDeviceGateway } from "./user-device-protocol.js";

vi.mock("./computer-lifecycle.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ComputerLifecycleModule>()),
  acquireComputerExecutionLease: async () => null,
  acquireDedicatedScreenLeaseFence: async (
    _prisma: unknown,
    input: { computerId: string; botId: string; runId: string },
  ) => ({ ...input, fence: 7 }),
  provisionComputer: async () => ({ id: "computer-1", kind: "desktop" }),
}));

// Group writes run against Postgres in the journeys; here only the dispatch is under test.
const createFleetGroupMock = vi.hoisted(() => vi.fn());
vi.mock("./fleet-tools.js", async (importOriginal) => ({
  ...(await importOriginal<typeof FleetToolsModule>()),
  createFleetGroup: createFleetGroupMock,
}));

const reviewMock = vi.fn();
const autoReviewProvider: AutoReviewProvider = {
  describe: () => ({
    id: "mock",
    contractVersion: "1",
    adapterVersion: "0.1.0",
    capabilities: { offline: true, keyless: true },
  }),
  review: reviewMock,
};

type Effect = {
  id: string;
  kind: string;
  idempotencyKey: string;
  status: string;
  request: unknown;
  batchActions?: string[];
  result?: unknown;
  reviewDecision?: string;
  runId?: string;
};

function fixture({
  botIdOverride = "bot-1",
  name = "demo_get_item",
  catalog = false,
  readOnly = true,
  rules = [] as ActionApprovalRule[],
  confirmationsOverride = false,
  autoReview = false,
  savedPreference = true,
  approvalRole,
  nativeReview = false,
  checkerConnected = true,
  skipApprovals = false,
  trigger = "user",
  secrets = [] as string[],
  prompt = "Read the item",
  bot = {
    name: "Assistant",
    description: "Test assistant",
  },
  shutdownSignal,
  builtin = false,
  disabledBuiltinTools = [],
  parallelCalls = false,
  sourceRole,
  existingSharedMemory,
  advanceRevisionAfterRead = false,
  fleetManagement = false,
  fleetBots = [] as { id: string; name: string; thread?: { id: string } }[],
  secondResource = false,
  googleRoute = false,
  googleFull = false,
  routines = [] as { name: string; prompt: string }[],
  connectedApps = [] as string[],
  userDevices,
  botUserId = "user-1",
  batch,
}: {
  botIdOverride?: string;
  /** The tool runs the actions its arguments name; see ConnectorTool.batch. */
  batch?: ConnectorTool["batch"];
  userDevices?: UserDeviceGateway;
  /** The bot's owner; runs are started by user-1. */
  botUserId?: string;
  connectedApps?: string[];
  routines?: { name: string; prompt: string }[];
  /** Adds `demo_get_other`, a read on a separate installed resource with the same name prefix. */
  secondResource?: boolean;
  googleRoute?: boolean;
  googleFull?: boolean;
  /** The switch as the run starts; `liveBot` is what a later read sees. */
  fleetManagement?: boolean;
  /** Other active bots of the same user, found by id or exact name. */
  fleetBots?: { id: string; name: string; thread?: { id: string } }[];
  parallelCalls?: boolean;
  sourceRole?: string;
  builtin?: boolean;
  disabledBuiltinTools?: string[];
  existingSharedMemory?: string;
  /** Simulates another writer landing between the save's read and its commit. */
  advanceRevisionAfterRead?: boolean;
  name?: string;
  catalog?: boolean;
  readOnly?: boolean;
  rules?: ActionApprovalRule[];
  /** The Space has its own confirmations; otherwise `rules` and auto review are the account's. */
  confirmationsOverride?: boolean;
  autoReview?: boolean;
  savedPreference?: boolean;
  approvalRole?: ModelRoleSettings;
  nativeReview?: boolean;
  checkerConnected?: boolean;
  skipApprovals?: boolean;
  trigger?: string;
  secrets?: string[];
  prompt?: string;
  bot?: { name: string; description: string };
  shutdownSignal?: AbortSignal;
} = {}) {
  let taskPrompt = prompt;
  const tool: ConnectorTool = {
    name,
    description: "Read an item",
    readOnly,
    batch,
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    route: { connectorId: "demo", resourceId: "resource-1", toolName: name, ...(googleRoute?{catalogGroup:"maya-google-write"}:{}) },
  };
  if(googleFull){tool.inputSchema=liveGoogleSchema;tool.route={connectorId:'mcp',resourceId:'fixture-resource-id',resourceRevision:2,toolName:'gmail_send',catalogGroup:'maya-google-write'};}
  const effects: Effect[] = [];
  const results: unknown[] = [];
  const sharedMemoryState = {
    content: existingSharedMemory as string | undefined,
    revision: existingSharedMemory === undefined ? 0 : 1,
  };
  const commit = vi.fn(
    async (request: { path: string; content: string; expectedRevision?: number }) => {
      if (
        request.expectedRevision !== undefined &&
        request.expectedRevision !== sharedMemoryState.revision
      ) {
        throw new Error(MEMORY_REVISION_CONFLICT_ERROR);
      }
      sharedMemoryState.content = request.content;
      sharedMemoryState.revision = (sharedMemoryState.revision || 0) + 1;
      return {
        id: "doc-1",
        path: request.path,
        revision: sharedMemoryState.revision,
        content: request.content,
      };
    },
  );
  const run = {
    id: "run-1",
    botId: botIdOverride,
    threadId: "thread-1",
    taskId: "task-1",
    spaceId: "space-1",
    userId: "user-1",
    status: "queued",
    trigger,
    sourceMessageId: sourceRole ? "source-1" : null,
    leaseFence: 0,
  };
  const createdAt = new Map<string, Date>();
  const externalEffect = {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { kind: string; status: { in: string[] }; createdAt?: { gte: Date } };
      }) =>
        effects.find(
          (effect) =>
            effect.kind === where.kind &&
            where.status.in.includes(effect.status) &&
            !(where.createdAt && createdAt.get(effect.id)! < where.createdAt.gte),
        ) ?? null,
    ),
    findMany: vi.fn(
      async ({
        where,
      }: {
        where?: {
          id?: string;
          runId?: string;
          spaceId?: string;
          idempotencyKey?: string;
          status?: string | { in: string[] };
          kind?: string | { in: string[] };
        };
      } = {}) => {
        if (where?.kind === "runtime_checkpoint")
          return turnCheckpoints.map((row) => ({
            ...row,
            kind: "runtime_checkpoint",
            status: "runtime_checkpoint",
            runId: run.id,
          }));
        return effects.filter((effect) => {
          const matches = (value: string, condition: string | { in: string[] }) =>
            typeof condition === "string" ? value === condition : condition.in.includes(value);
          if (where?.status && !matches(effect.status, where.status)) return false;
          if (where?.kind && !matches(effect.kind, where.kind)) return false;
          if (where?.runId && effect.runId && effect.runId !== where.runId) return false;
          if (where?.id && effect.id !== where.id) return false;
          return true;
        });
      },
    ),
    upsert: vi.fn(
      async ({
        where,
        create,
      }: {
        where: { idempotencyKey: string };
        create: { result: string };
      }) => {
        const existing = turnCheckpoints.find((row) => row.idempotencyKey === where.idempotencyKey);
        if (existing) existing.result = create.result;
        else turnCheckpoints.push({ idempotencyKey: where.idempotencyKey, result: create.result });
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where?: { kind?: string } }) => {
      if (where?.kind === "runtime_checkpoint") turnCheckpoints.length = 0;
      return { count: 0 };
    }),
    findUnique: vi.fn(
      async ({ where }: { where: { id?: string; idempotencyKey?: string } }) =>
        structuredClone(effects.find((effect) =>
          where.id ? effect.id === where.id : effect.idempotencyKey === where.idempotencyKey,
        ) ?? null),
    ),
    create: vi.fn(async ({ data }: { data: Omit<Effect, "id"> }) => {
      const effect = { ...data, id: `effect-${effects.length + 1}` };
      createdAt.set(effect.id, new Date());
      effects.push(effect);
      return { ...effect };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Effect> }) => {
      Object.assign(effects.find((effect) => effect.id === where.id)!, data);
    }),
    updateMany: vi.fn(
      async ({ where, data }: { where: { id: string; status: string }; data: Partial<Effect> }) => {
        const effect = effects.find(
          (effect) => effect.id === where.id && effect.status === where.status,
        );
        if (!effect) return { count: 0 };
        Object.assign(effect, data);
        return { count: 1 };
      },
    ),
  };
  const instructionState = {
    instructions: "Draft only",
    instructionHistory: [],
  };
  // Turn checkpoints live in external_effects too, but outside the approval fixtures' rows.
  const turnCheckpoints: { idempotencyKey: string; result: string }[] = [];
  const liveBot = { fleetManagement };
  const reviewCredential =
    approvalRole && checkerConnected
      ? {
          id: "review-key",
          userId: "user-1",
          provider: "openrouter",
          label: "Fixture",
          secretId: "review-secret",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }
      : null;
  let outsideSteering = false;
  let offeredTools: string[] = [];
  let instructions = "";
  let checkpointCapture:
    | { executionId: string; checkpoint: Omit<TurnCheckpoint, "provider" | "model"> }
    | undefined;
  const prisma = {
    user: { findUnique: vi.fn(async () => null) },
    run: {
      findFirst: vi.fn(
        async (_query?: {
          where?: { trigger?: { in?: string[] } };
        }): Promise<{ id: string } | null> => null,
      ),
      findUnique: vi.fn(async () => run),
      findUniqueOrThrow: vi.fn(async () => run),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(run, data);
        return { count: 1 };
      }),
    },
    bot: {
      findUniqueOrThrow: vi.fn(async () => ({
        ...instructionState,
        id: run.botId,
        userId: botUserId,
        name: bot.name,
        description: bot.description,
        color: "#8B5CF6",
        notifyOnFinish: true,
        modelProvider: null,
        modelId: null,
        thinkingLevel: null,
        autoSpeak: false,
        disabledBuiltinTools,
        fleetManagement,
        computerId: "computer-1",
        computer: { id: "computer-1", scope: "dedicated" },
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: run.botId,
        name: bot.name,
        description: bot.description,
        color: "#8B5CF6",
        notifyOnFinish: true,
        ...Object.assign(instructionState, data),
      })),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(instructionState, data);
        return { count: 1 };
      }),
      findMany: vi.fn(async ({ where }: { where?: { id?: unknown; name?: unknown } } = {}) => {
        const matches = (value: string, condition: unknown) =>
          condition === undefined ||
          (typeof condition === "object" && condition !== null && "in" in condition
            ? (condition as { in: unknown[] }).in.includes(value)
            : value === condition);
        if (where?.id === undefined && where?.name === undefined) return [];
        return fleetBots.filter(
          (row) => matches(row.id, where.id) && matches(row.name, where.name),
        );
      }),
      findUnique: vi.fn(async () => ({ ...liveBot })),
    },
    attempt: {
      create: vi.fn(async () => ({ id: "attempt-1" })),
      count: vi.fn(async () => 1),
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    thread: {
      findUniqueOrThrow: vi.fn(async () => ({ id: run.threadId, groupId: null })),
      update: vi.fn(async () => ({ nextMessageSeq: 2, nextEventSeq: 2 })),
    },
    message: {
      findFirst: vi.fn(
        async (_query?: { where?: { OR?: unknown } }): Promise<{ id: string } | null> => null,
      ),
      findUnique: vi.fn(async () =>
        sourceRole ? { role: sourceRole, threadId:run.threadId, blocks: [{ kind: "text", text: prompt }] } : null,
      ),
      findMany: vi.fn(async () => sourceRole ? [{id:"source-1",role:sourceRole,runId:run.id,blocks:[{kind:"text",text:prompt}]}] : []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "message-1",
        createdAt: new Date(),
        ...data,
      })),
    },
    event: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "event-1",
        ...data,
      })),
    },
    task: { findUniqueOrThrow: vi.fn(async () => ({ id: run.taskId, prompt: taskPrompt })) },
    connection: {
      findMany: vi.fn(async () =>
        connectedApps.map((provider) => ({
          id: `conn-${provider}`,
          connectorId: "composio",
          provider,
          providerRef: null,
          displayName: provider,
          status: "connected",
        })),
      ),
    },
    userModelPreference: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    userModelCredential: {
      findMany: vi.fn(async () => (reviewCredential ? [reviewCredential] : [])),
      findFirst: vi.fn(async () => reviewCredential),
    },
    userModelRoleChoice: {
      findMany: vi.fn(async () =>
        approvalRole
          ? [
              ...(approvalRole.primary ? [{ ...approvalRole.primary, position: 0 }] : []),
              ...approvalRole.backups.map((backup, index) => ({ ...backup, position: index + 1 })),
            ]
          : [],
      ),
    },
    secret: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: "review-secret", ciphertext: "fake-cipher" })),
    },
    usageRecord: { createMany: vi.fn(async () => ({ count: 1 })) },
    modelCreditEntry: { findUnique: vi.fn(async () => null) },
    deploymentSettings: {
      findUnique: vi.fn(async () => ({
        defaultModelProvider: "openrouter",
        defaultModelId: "fixture-model",
      })),
    },
    taughtSkill: { findMany: vi.fn(async () => []) },
    chatGroup: { findMany: vi.fn(async () => []) },
    botSection: { findMany: vi.fn(async () => []) },
    vaultCredential: { findMany: vi.fn(async () => []) },
    agentSkill: { findMany: vi.fn(async () => []) },
    scratchpadItem: { findMany: vi.fn(async () => []) },
    spaceSettingOverride: {
      findUnique: vi.fn(
        async (query: { where: { spaceId_userId_setting: { setting: string } } }) =>
          confirmationsOverride && query.where.spaceId_userId_setting.setting === "confirmations"
            ? { setting: "confirmations" }
            : null,
      ),
    },
    actionApprovalRule: { findMany: vi.fn(async () => (confirmationsOverride ? rules : [])) },
    userActionApprovalRule: { findMany: vi.fn(async () => (confirmationsOverride ? [] : rules)) },
    routine: { findMany: vi.fn(async () => routines) },
    actionAutoReviewPreference: {
      findUnique: vi.fn(async () =>
        confirmationsOverride && savedPreference ? { enabled: autoReview, skipApprovals } : null,
      ),
    },
    userActionAutoReviewPreference: {
      findUnique: vi.fn(async () =>
        confirmationsOverride || !savedPreference ? null : { enabled: autoReview, skipApprovals },
      ),
    },
    steeringMessage: {
      findFirst: vi.fn(async (_query: unknown) => (outsideSteering ? { id: "steer-1" } : null)),
    },
    externalEffect,
  };
  const transactionalPrisma = Object.assign(prisma, {
    $queryRaw: vi.fn(async () => []),
    $transaction: async (action: (tx: typeof prisma) => unknown) => action(prisma),
  });
  const pauseRunForInput = vi.fn(async () => {
    run.status = "waiting_input";
    return { continuationRunId: null as string | null };
  });
  const finalizeRun = vi.fn(async () => ({ continuationRunId: null }));
  const execute = vi.fn(async function* (call: ConnectorCall) {
    yield { type: "result" as const, data: { item: call.args.id } };
  });
  let calls: { name?: string; args: Record<string, unknown>; executionId: string }[] = [
    { args: { id: "item-1" }, executionId: "call-1" },
  ];
  const web = new FakeWebProvider();
  const fetchedUrls: string[] = [];
  const fakeFetch = web.fetch.bind(web);
  web.fetch = async (request, context) => {
    fetchedUrls.push(request.url);
    return fakeFetch(request, context);
  };
  const runtimeRun = vi.fn(async function* (request: AgentRunRequest) {
    offeredTools = request.tools.map((tool) => tool.name);
    instructions = request.instructions ?? "";
    if (checkpointCapture) {
      // The runtime hands the executor a capture it can serialize when the turn pauses.
      const pending = checkpointCapture;
      await request.onCheckpoint?.(
        () =>
          serializeTurnCheckpoint({
            ...(pending.checkpoint as TurnCheckpoint),
            provider: request.model.provider,
            model: request.model.id,
          }),
        pending.executionId,
      );
    }
    const executeCall = async (call: (typeof calls)[number]) => {
      const result = call.name
        ? await request.executeTool!(call.name, call.args, call.executionId)
        : await request.executeTool!(
            catalog ? "demo_execute_tool" : name,
            catalog ? { id: `resource-1:${name}`, arguments: call.args } : call.args,
            call.executionId,
          );
      results.push(result);
      return result;
    };
    if (parallelCalls) {
      const completed = await Promise.all(calls.map(executeCall));
      if (completed.some(isApprovalPausedResult)) return;
    } else {
      for (const call of calls) {
        if (isApprovalPausedResult(await executeCall(call))) return;
      }
    }
    yield { type: "done" as const, text: "Done" };
  });
  const enqueue = vi.fn(async (_job: unknown) => undefined);
  const executor = createRunExecutor({
    deploymentModelKey: "fixture-model-key",
    prisma: transactionalPrisma,
    runtime: { describe: () => ({ capabilities: { scripted: false } }), run: runtimeRun },
    connector: {
      discoverTools: async () =>
        builtin
          ? []
          : catalog
            ? [
                {
                  name: googleFull?"connectors_execute_tool":"demo_execute_tool",
                  description: "Execute a catalog tool",
                  inputSchema: { type: "object" },
                  route: { connectorId: googleFull?"mcp":"demo", toolName: "__catalog_execute" },
                },
              ]
            : secondResource
              ? [
                  tool,
                  {
                    ...tool,
                    name: "demo_get_other",
                    route: {
                      connectorId: "demo",
                      resourceId: "resource-2",
                      toolName: "demo_get_other",
                    },
                  },
                ]
              : [tool],
      resolveCall: async (call: ConnectorCall) =>
        catalog ? resolveCatalogCall(call, catalogEntries([tool])) : undefined,
      execute,
    },
    sandbox: { describe: () => ({ capabilities: { graphical: false } }) },
    memory: {
      read: async (request: { scope: string; path?: string }) => {
        const documents =
          request.scope === "user" &&
          request.path === "MEMORY.md" &&
          sharedMemoryState.content !== undefined
            ? [
                {
                  id: "doc-1",
                  path: "MEMORY.md",
                  content: sharedMemoryState.content,
                  revision: sharedMemoryState.revision,
                  updatedAt: "",
                },
              ]
            : [];
        if (advanceRevisionAfterRead && request.path === "MEMORY.md") {
          sharedMemoryState.content = "Someone else edited";
          sharedMemoryState.revision += 1;
        }
        return { documents };
      },
      commit,
    },
    memoryProviders: { resolve: async () => null },
    events: {
      append: vi.fn(async () => undefined),
      notify: vi.fn(async () => undefined),
      pauseRunForInput,
      finalizeRun,
    },
    jobs: { enqueue },
    secrets,
    autoReview: nativeReview ? undefined : autoReviewProvider,
    secretStore: { load: async () => "fake-review-api-key" },
    shutdownSignal,
    web,
    userDevices,
  } as unknown as Parameters<typeof createRunExecutor>[0]);
  return {
    prisma: transactionalPrisma,
    effects,
    web,
    fetchedUrls,
    fleetBots,
    instructionState,
    liveBot,
    claimedOutsideSteering(value: boolean) {
      outsideSteering = value;
    },
    offeredTools: () => offeredTools,
    instructions: () => instructions,
    requests:()=>runtimeRun.mock.calls.map(c=>c[0]),
    cancelAtInstructionCommit() {
      transactionalPrisma.$queryRaw.mockImplementation(async (...values: unknown[]) => {
        if (String(values[0]).includes("FROM threads")) run.status = "cancelled";
        return [];
      });
    },
    overwriteInstructionsAfterAttemptStart(text: string) {
      const original = prisma.bot.findUniqueOrThrow.getMockImplementation()!;
      let applied = false;
      prisma.bot.findUniqueOrThrow.mockImplementation(async () => {
        // The attempt-start snapshot is read before the model runs; a read while it
        // works is past it, as when an import lands mid-run.
        if (!applied && runtimeRun.mock.calls.length > 0) {
          applied = true;
          instructionState.instructions = text;
        }
        return original();
      });
    },
    turnCheckpoints,
    /** Lets the next pause save this turn, as the real runtime does before a gated call. */
    pauseWithTurnCheckpoint(
      executionId: string,
      checkpoint: Omit<TurnCheckpoint, "provider" | "model">,
    ) {
      checkpointCapture = { executionId, checkpoint };
    },
    results,
    execute,
    commit,
    sharedMemoryState,
    pauseRunForInput,
    enqueue,
    async deliverInbound(promptText: string, busyTrigger?: string) {
      const pending: Array<Record<string, unknown>> = [];
      const inboundMessage = {
        id: "inbound-1",
        seq: 1,
        role: "user",
        blocks: [{ kind: "text", text: promptText }],
      };
      const tx = {
        $queryRaw: vi.fn(async () => []),
        thread: { update: vi.fn(async () => ({ nextMessageSeq: 2, nextEventSeq: 2 })) },
        message: {
          create: vi.fn(async () => inboundMessage),
          update: vi.fn(async () => inboundMessage),
        },
        event: { create: vi.fn(async ({ data }: { data: object }) => ({ ...data, seq: 1 })) },
        task: {
          create: vi.fn(async ({ data }: { data: { prompt: string } }) => {
            taskPrompt = data.prompt;
            return { id: "task-1" };
          }),
        },
        run: {
          findMany: vi.fn(async () =>
            busyTrigger ? [{ id: "busy-1", taskId: "busy-task", trigger: busyTrigger }] : [],
          ),
          findUnique: vi.fn(async () => ({ status: "running" })),
          findFirst: vi.fn(async () => null),
          create: vi.fn(async ({ data }: { data: Partial<typeof run> }) =>
            Object.assign(run, data),
          ),
        },
        steeringMessage: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            pending.push({ ...data, id: "steer-1", message: inboundMessage });
          }),
          findMany: vi.fn(async () => pending),
          updateMany: vi.fn(async () => ({ count: 1 })),
        },
      };
      const inboundPrisma = {
        $transaction: async (action: (client: typeof tx) => unknown) => action(tx),
      } as unknown as PrismaClient;
      await sendUserMessage(inboundPrisma, {
        spaceId: run.spaceId,
        threadId: run.threadId,
        botId: run.botId,
        userId: run.userId,
        trigger: "webhook",
        prompt: promptText,
        blocks: inboundMessage.blocks as never,
      });
      if (busyTrigger) {
        expect(pending[0]).toMatchObject({ runId: null, originTrigger: "webhook" });
        await createPendingSteeringRun(tx as never, run);
      }
      expect(run.trigger).toBe("webhook");
      expect(run.sourceMessageId).toBe(inboundMessage.id);
    },
    setCalls(next: typeof calls) {
      calls = next;
    },
    async run(allowFailure = false) {
      run.status = "queued";
      await executor.continueRun(run.id, "worker-1");
      expect(runtimeRun).toHaveBeenCalled();
      expect(prisma.attempt.update).not.toHaveBeenCalled();
      if (!allowFailure)
        expect(finalizeRun).not.toHaveBeenCalledWith(
          expect.objectContaining({ outcome: "failed" }),
        );
    },
  };
}


describe('actual executor route proof',()=>{
 it.each([['Use local\nanswer fiction','local'],['normal fictional question','fast'],['> local\nanswer fiction','fast'],["do not use local",'fast']] as const)('%s',async(prompt,expected)=>{
  const f=fixture({botIdOverride:'000000000000000000000001',trigger:'user',sourceRole:'user',prompt});f.setCalls([]);await f.run();expect(f.requests().at(-1)?.mayaRoute).toBe(expected);
 });
});
describe('actual executor paused route propagation',()=>{
 it.each([['Use local\nread fictional item','local'],['read fictional item','fast']] as const)('retains %s across gated pause/resume',async(prompt,expected)=>{
  const f=fixture({botIdOverride:'000000000000000000000001',trigger:'user',sourceRole:'user',prompt,readOnly:false});
  f.pauseWithTurnCheckpoint('call-1',{version:1,systemPrompt:'Fictional test',pendingToolCallId:'call-1',executionMode:'sequential',messages:[{role:'user',content:prompt,timestamp:new Date(0)},{role:'assistant',content:[{type:'toolCall',id:'call-1',name:'demo_get_item',arguments:{id:'item-1'}}],stopReason:'toolUse'}] as never});
  await f.run();expect(f.pauseRunForInput).toHaveBeenCalled();expect(f.turnCheckpoints.length).toBeGreaterThan(0);expect(f.requests().at(-1)?.mayaRoute).toBe(expected);
  expect(f.effects.length).toBeGreaterThan(0);f.effects[0]!.status='approved';await f.run();
  expect(f.requests().length).toBeGreaterThanOrEqual(2);expect(f.requests().at(-1)?.mayaRoute).toBe(expected);expect(f.requests().at(-1)?.turnCheckpoint).toBeTruthy();
 });
});
