import {
  ProviderError,
  type ProviderKind,
  type SessionId,
  type TurnResult,
} from "@bernise/contracts";
import { Effect, Layer, Stream, SynchronizedRef } from "effect";
import { CodexProvider, CursorProvider, Provider } from "./Provider.ts";
import { ServerSettings } from "./ServerSettings.ts";

export const ProviderRouterLive = Layer.effect(
  Provider,
  Effect.gen(function* () {
    const cursor = yield* CursorProvider;
    const codex = yield* CodexProvider;
    const serverSettings = yield* ServerSettings;
    const sessions = yield* SynchronizedRef.make(new Map<SessionId, ProviderKind>());

    const driverFor = (kind: ProviderKind) => (kind === "codex" ? codex : cursor);

    const getKind = (sessionId: SessionId) =>
      SynchronizedRef.get(sessions).pipe(
        Effect.flatMap((map) => {
          const kind = map.get(sessionId);
          return kind === undefined
            ? Effect.fail(new ProviderError({ message: `Unknown session ${sessionId}` }))
            : Effect.succeed(kind);
        }),
      );

    const startSession = Effect.fn("ProviderRouter.startSession")(function* (workspace: string) {
      const settings = yield* serverSettings.get;
      const kind = settings.activeProvider;
      const sessionId = yield* driverFor(kind).startSession(workspace);
      yield* SynchronizedRef.update(sessions, (map) => {
        const next = new Map(map);
        next.set(sessionId, kind);
        return next;
      });
      return sessionId;
    });

    const sendTurn = Effect.fn("ProviderRouter.sendTurn")(function* (
      sessionId: SessionId,
      prompt: string,
    ): Effect.fn.Return<TurnResult, ProviderError> {
      const kind = yield* getKind(sessionId);
      return yield* driverFor(kind).sendTurn(sessionId, prompt);
    });

    const subscribeEvents = (sessionId: SessionId) =>
      Stream.unwrap(
        getKind(sessionId).pipe(Effect.map((kind) => driverFor(kind).subscribeEvents(sessionId))),
      );

    return Provider.of({
      startSession,
      sendTurn,
      subscribeEvents,
    });
  }),
);
