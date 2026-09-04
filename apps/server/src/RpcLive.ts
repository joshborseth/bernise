import {
  BerniseRpcs,
  HarnessSettingsPatch,
  PersistenceError,
  Pong,
  ProviderError,
  SessionId,
  SessionStarted,
  ThreadDeleted,
  ThreadId,
  ThreadList,
} from "@bernise/contracts";
import { Effect, SynchronizedRef } from "effect";
import { ThreadPersistence } from "./persistence/ThreadPersistence.ts";
import { Provider } from "./Provider.ts";
import { ProviderHealth } from "./ProviderHealth.ts";
import { ServerSettings } from "./ServerSettings.ts";
import { resolveWorkspacePath, workspaceConfig, workspaceInfoFromPath } from "./workspace.ts";

export const RpcHandlersLive = BerniseRpcs.toLayer(
  Effect.gen(function* () {
    const provider = yield* Provider;
    const serverSettings = yield* ServerSettings;
    const providerHealth = yield* ProviderHealth;
    const threads = yield* ThreadPersistence;
    const configuredWorkspace = yield* workspaceConfig;
    const sessionThreads = yield* SynchronizedRef.make(new Map<SessionId, ThreadId>());

    const persistQuietly = (operation: string, effect: Effect.Effect<void, PersistenceError>) =>
      effect.pipe(
        Effect.catchTag("PersistenceError", (error) =>
          Effect.logWarning(`${operation} failed: ${error.message}`).pipe(Effect.asVoid),
        ),
      );

    const threadForSession = (sessionId: SessionId) =>
      SynchronizedRef.get(sessionThreads).pipe(
        Effect.flatMap((map) => {
          const threadId = map.get(sessionId);
          return threadId === undefined
            ? Effect.fail(new ProviderError({ message: `Unknown session ${sessionId}` }))
            : Effect.succeed(threadId);
        }),
      );

    return {
      Ping: () => Effect.succeed(new Pong({ pong: true })),
      StartSession: (payload) =>
        Effect.gen(function* () {
          const workspace = resolveWorkspacePath(configuredWorkspace, payload.workspace);
          const sessionId = yield* provider.startSession(
            workspace,
            payload.threadId,
            payload.model,
          );
          yield* SynchronizedRef.update(sessionThreads, (map) => {
            const next = new Map(map);
            next.set(sessionId, payload.threadId);
            return next;
          });
          return new SessionStarted({ sessionId });
        }),
      SendTurn: (payload) =>
        Effect.gen(function* () {
          const threadId = yield* threadForSession(payload.sessionId);
          yield* persistQuietly("appendUser", threads.appendUser(threadId, payload.prompt));
          const result = yield* provider.sendTurn(payload.sessionId, payload.prompt, payload.model);
          const assistantText = yield* provider.consumeAssistantText(payload.sessionId);
          if (assistantText.length > 0) {
            yield* persistQuietly(
              "appendAssistant",
              threads.appendAssistant(threadId, assistantText),
            );
          }
          return result;
        }),
      SubscribeEvents: (payload) => provider.subscribeEvents(payload.sessionId),
      GetWorkspace: () =>
        Effect.succeed(workspaceInfoFromPath(resolveWorkspacePath(configuredWorkspace))),
      GetSettings: () => serverSettings.get,
      UpdateSettings: (payload) => serverSettings.update(new HarnessSettingsPatch(payload)),
      GetProviderSnapshots: () => providerHealth.snapshots,
      RefreshProviders: () => providerHealth.refresh,
      ListModels: () => provider.listModels,
      ListThreads: () =>
        threads.listThreads.pipe(Effect.map((list) => new ThreadList({ threads: list }))),
      GetThread: (payload) => threads.getThread(payload.threadId),
      RenameThread: (payload) => threads.renameThread(payload.threadId, payload.title),
      DeleteThread: (payload) =>
        threads
          .deleteThread(payload.threadId)
          .pipe(Effect.map(() => new ThreadDeleted({ threadId: payload.threadId }))),
    };
  }),
);

export const PingLive = BerniseRpcs.toLayerHandler("Ping", () =>
  Effect.succeed(new Pong({ pong: true })),
);
