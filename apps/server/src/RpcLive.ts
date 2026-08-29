import { BerniseRpcs, HarnessSettingsPatch, Pong, SessionStarted } from "@bernise/contracts";
import { Config, Effect, Option } from "effect";
import { Provider } from "./Provider.ts";
import { ProviderHealth } from "./ProviderHealth.ts";
import { ServerSettings } from "./ServerSettings.ts";

const workspaceConfig = Config.string("BERNISE_WORKSPACE").pipe(Config.option);

export const RpcHandlersLive = BerniseRpcs.toLayer(
  Effect.gen(function* () {
    const provider = yield* Provider;
    const serverSettings = yield* ServerSettings;
    const providerHealth = yield* ProviderHealth;
    const configuredWorkspace = yield* workspaceConfig;

    return {
      Ping: () => Effect.succeed(new Pong({ pong: true })),
      StartSession: (payload) =>
        Effect.gen(function* () {
          const workspace =
            payload.workspace?.trim() || Option.getOrElse(configuredWorkspace, () => process.cwd());
          const sessionId = yield* provider.startSession(workspace, payload.model);
          return new SessionStarted({ sessionId });
        }),
      SendTurn: (payload) => provider.sendTurn(payload.sessionId, payload.prompt, payload.model),
      SubscribeEvents: (payload) => provider.subscribeEvents(payload.sessionId),
      GetSettings: () => serverSettings.get,
      UpdateSettings: (payload) => serverSettings.update(new HarnessSettingsPatch(payload)),
      GetProviderSnapshots: () => providerHealth.snapshots,
      RefreshProviders: () => providerHealth.refresh,
      ListModels: () => provider.listModels,
    };
  }),
);

export const PingLive = BerniseRpcs.toLayerHandler("Ping", () =>
  Effect.succeed(new Pong({ pong: true })),
);
