import {
  BerniseRpcs,
  HarnessSettingsPatch,
  PersistenceError,
  Pong,
  SessionStarted,
} from "@bernise/contracts";
import { Config, Effect, Option } from "effect";
import { ThreadPersistence } from "./persistence/ThreadPersistence.ts";
import { Provider } from "./Provider.ts";
import { ProviderHealth } from "./ProviderHealth.ts";
import { ServerSettings } from "./ServerSettings.ts";

const workspaceConfig = Config.string("BERNISE_WORKSPACE").pipe(Config.option);

export const RpcHandlersLive = BerniseRpcs.toLayer(
  Effect.gen(function* () {
    const provider = yield* Provider;
    const serverSettings = yield* ServerSettings;
    const providerHealth = yield* ProviderHealth;
    const threads = yield* ThreadPersistence;
    const configuredWorkspace = yield* workspaceConfig;

    const persistQuietly = (operation: string, effect: Effect.Effect<void, PersistenceError>) =>
      effect.pipe(
        Effect.catchTag("PersistenceError", (error) =>
          Effect.logWarning(`${operation} failed: ${error.message}`).pipe(Effect.asVoid),
        ),
      );

    return {
      Ping: () => Effect.succeed(new Pong({ pong: true })),
      StartSession: (payload) =>
        Effect.gen(function* () {
          const workspace =
            payload.workspace?.trim() || Option.getOrElse(configuredWorkspace, () => process.cwd());
          const sessionId = yield* provider.startSession(workspace, payload.model);
          return new SessionStarted({ sessionId });
        }),
      SendTurn: (payload) =>
        Effect.gen(function* () {
          yield* persistQuietly("appendUser", threads.appendUser(payload.prompt));
          const result = yield* provider.sendTurn(payload.sessionId, payload.prompt, payload.model);
          const assistantText = yield* provider.consumeAssistantText(payload.sessionId);
          if (assistantText.length > 0) {
            yield* persistQuietly("appendAssistant", threads.appendAssistant(assistantText));
          }
          return result;
        }),
      SubscribeEvents: (payload) => provider.subscribeEvents(payload.sessionId),
      GetSettings: () => serverSettings.get,
      UpdateSettings: (payload) => serverSettings.update(new HarnessSettingsPatch(payload)),
      GetProviderSnapshots: () => providerHealth.snapshots,
      RefreshProviders: () => providerHealth.refresh,
      ListModels: () => provider.listModels,
      GetThread: () => threads.getThread,
    };
  }),
);

export const PingLive = BerniseRpcs.toLayerHandler("Ping", () =>
  Effect.succeed(new Pong({ pong: true })),
);
