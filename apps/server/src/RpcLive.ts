import { BerniseRpcs, Pong, SessionStarted, TurnResult } from "@bernise/contracts";
import { Config, Effect, Option } from "effect";
import { Provider } from "./Provider.ts";

const workspaceConfig = Config.string("BERNISE_WORKSPACE").pipe(Config.option);

export const RpcHandlersLive = BerniseRpcs.toLayer(
  Effect.gen(function* () {
    const provider = yield* Provider;
    const configuredWorkspace = yield* workspaceConfig;

    return {
      Ping: () => Effect.succeed(new Pong({ pong: true })),
      StartSession: (payload) =>
        Effect.gen(function* () {
          const workspace =
            payload.workspace?.trim() || Option.getOrElse(configuredWorkspace, () => process.cwd());
          const sessionId = yield* provider.startSession(workspace);
          return new SessionStarted({ sessionId });
        }),
      SendTurn: (payload) =>
        provider
          .sendTurn(payload.sessionId, payload.prompt)
          .pipe(Effect.map((text) => new TurnResult({ text }))),
      SubscribeEvents: (payload) => provider.subscribeEvents(payload.sessionId),
    };
  }),
);

export const PingLive = BerniseRpcs.toLayerHandler("Ping", () =>
  Effect.succeed(new Pong({ pong: true })),
);
