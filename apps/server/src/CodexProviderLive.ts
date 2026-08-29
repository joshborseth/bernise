import {
  ProviderError,
  ProviderEvent,
  ProviderTurnDelta,
  SessionId,
  TurnResult,
} from "@bernise/contracts";
import { NodeServices } from "@effect/platform-node";
import {
  Cause,
  Config,
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  Queue,
  Scope,
  Stream,
  SynchronizedRef,
} from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { CodexTransportError, makeCodexConnection } from "./codex/JsonRpcStdio.ts";
import { expandHomePath } from "./pathExpand.ts";
import { Provider } from "./Provider.ts";
import { resolveCodexBin } from "./providerBins.ts";
import { ServerSettings } from "./ServerSettings.ts";

const codexBinEnv = Config.string("BERNISE_CODEX_BIN").pipe(Config.option);
const workspaceConfig = Config.string("BERNISE_WORKSPACE").pipe(Config.option);
const handshakeTimeout = "20 seconds";

interface SessionState {
  readonly threadId: string;
  readonly send: (method: string, params?: unknown) => Effect.Effect<unknown, CodexTransportError>;
  readonly events: Queue.Queue<ProviderEvent>;
  turnDone: Deferred.Deferred<{ readonly stopReason: string }, CodexTransportError>;
  readonly scope: Scope.Closeable;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const extractCodexAssistantDelta = (method: string, params: unknown): string | undefined => {
  if (method !== "item/agentMessage/delta" || !isRecord(params)) {
    return undefined;
  }
  if (typeof params.delta === "string" && params.delta.length > 0) {
    return params.delta;
  }
  if (
    isRecord(params.delta) &&
    typeof params.delta.text === "string" &&
    params.delta.text.length > 0
  ) {
    return params.delta.text;
  }
  return undefined;
};

export const readCodexThreadId = (value: unknown): string | undefined => {
  if (isRecord(value) && isRecord(value.thread) && typeof value.thread.id === "string") {
    return value.thread.id.length > 0 ? value.thread.id : undefined;
  }
  if (isRecord(value) && typeof value.threadId === "string" && value.threadId.length > 0) {
    return value.threadId;
  }
  return undefined;
};

export const readCodexStopReason = (params: unknown): string => {
  if (isRecord(params) && isRecord(params.turn) && typeof params.turn.status === "string") {
    return params.turn.status.length > 0 ? params.turn.status : "completed";
  }
  if (isRecord(params) && typeof params.status === "string" && params.status.length > 0) {
    return params.status;
  }
  return "completed";
};

export const clientRequestResult = (method: string): unknown => {
  if (/approv|permission/i.test(method)) {
    return { decision: "accept" };
  }
  return {};
};

const toProviderError = (error: unknown, fallback: string): ProviderError => {
  if (error instanceof ProviderError) {
    return error;
  }
  if (Cause.isTimeoutError(error)) {
    return new ProviderError({
      message: `${fallback} timed out. Is Codex running? Run \`codex login\` if this is an auth hang.`,
    });
  }
  if (error instanceof CodexTransportError) {
    const loginHint = /auth|login|unauthorized|unauthenticated/i.test(error.message)
      ? ` ${error.message.endsWith(".") ? "" : "."} Run \`codex login\` on the machine running the Bernise server.`
      : "";
    return new ProviderError({ message: `${error.message}${loginHint}`.trim() });
  }
  if (error instanceof Error && error.message.length > 0) {
    return new ProviderError({ message: error.message });
  }
  return new ProviderError({ message: fallback });
};

const withHandshakeTimeout = <A>(
  effect: Effect.Effect<A, CodexTransportError>,
  label: string,
): Effect.Effect<A, ProviderError> =>
  effect.pipe(
    Effect.timeout(handshakeTimeout),
    Effect.mapError((error) => toProviderError(error, label)),
  );

export const CodexProviderLive = Layer.effect(
  Provider,
  Effect.gen(function* () {
    const parentScope = yield* Scope.Scope;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const envBin = yield* codexBinEnv;
    const configuredWorkspace = yield* workspaceConfig;
    const serverSettings = yield* ServerSettings;
    const sessions = yield* SynchronizedRef.make(new Map<SessionId, SessionState>());

    const defaultWorkspace = () => Option.getOrElse(configuredWorkspace, () => process.cwd());

    const getSession = (sessionId: SessionId) =>
      SynchronizedRef.get(sessions).pipe(
        Effect.flatMap((map) => {
          const session = map.get(sessionId);
          return session === undefined
            ? Effect.fail(new ProviderError({ message: `Unknown session ${sessionId}` }))
            : Effect.succeed(session);
        }),
      );

    const startSession = Effect.fn("CodexProvider.startSession")(function* (workspace: string) {
      const cwd = workspace.trim().length > 0 ? workspace.trim() : defaultWorkspace();
      const settings = yield* serverSettings.get;
      const command = resolveCodexBin(settings.codex.binaryPath, envBin);
      const homePath = settings.codex.homePath.trim();
      const sessionScope = yield* Scope.fork(parentScope);
      const events = yield* Queue.unbounded<ProviderEvent>();
      const initialTurn = yield* Deferred.make<
        { readonly stopReason: string },
        CodexTransportError
      >();
      yield* Scope.addFinalizer(sessionScope, Queue.shutdown(events).pipe(Effect.asVoid));

      const sessionHolder: { current: SessionState | undefined } = { current: undefined };

      const connection = yield* makeCodexConnection({
        command,
        args: ["app-server"],
        cwd,
        ...(homePath.length > 0 ? { env: { CODEX_HOME: expandHomePath(homePath) } } : {}),
        onNotification: (method, params) => {
          const text = extractCodexAssistantDelta(method, params);
          if (text !== undefined) {
            return Queue.offer(events, new ProviderTurnDelta({ text })).pipe(Effect.asVoid);
          }
          if (method === "turn/completed" && sessionHolder.current !== undefined) {
            return Deferred.succeed(sessionHolder.current.turnDone, {
              stopReason: readCodexStopReason(params),
            }).pipe(Effect.asVoid);
          }
          return Effect.void;
        },
        onRequest: (method) => Effect.succeed(clientRequestResult(method)),
      }).pipe(
        Effect.provideService(Scope.Scope, sessionScope),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.mapError((error) =>
          toProviderError(error, `Failed to start Codex App Server in ${cwd}`),
        ),
        Effect.tapError(() => Scope.close(sessionScope, Exit.void)),
      );

      yield* withHandshakeTimeout(
        connection.send("initialize", {
          clientInfo: { name: "bernise", title: "Bernise", version: "0.0.0" },
          capabilities: { experimentalApi: true },
        }),
        "Codex App Server initialize",
      );
      yield* withHandshakeTimeout(connection.notify("initialized"), "Codex App Server initialized");

      const created = yield* withHandshakeTimeout(
        connection.send("thread/start", { cwd }),
        "Codex App Server thread/start",
      );
      const threadId = readCodexThreadId(created);
      if (threadId === undefined) {
        yield* Scope.close(sessionScope, Exit.void);
        return yield* new ProviderError({
          message: "Codex App Server thread/start did not return a thread id",
        });
      }

      const sessionId = SessionId.make(crypto.randomUUID());
      const session: SessionState = {
        threadId,
        send: connection.send,
        events,
        turnDone: initialTurn,
        scope: sessionScope,
      };
      sessionHolder.current = session;
      yield* SynchronizedRef.update(sessions, (map) => {
        const next = new Map(map);
        next.set(sessionId, session);
        return next;
      });
      return sessionId;
    });

    const sendTurn = Effect.fn("CodexProvider.sendTurn")(function* (
      sessionId: SessionId,
      prompt: string,
    ) {
      const session = yield* getSession(sessionId);
      const turnDone = yield* Deferred.make<{ readonly stopReason: string }, CodexTransportError>();
      session.turnDone = turnDone;
      yield* session
        .send("turn/start", {
          threadId: session.threadId,
          input: [{ type: "text", text: prompt }],
        })
        .pipe(
          Effect.mapError((error) => toProviderError(error, "Codex App Server turn/start failed")),
        );
      const finished = yield* Deferred.await(turnDone).pipe(
        Effect.mapError((error) =>
          toProviderError(error, "Codex App Server turn/completed failed"),
        ),
      );
      return new TurnResult({ stopReason: finished.stopReason });
    });

    const subscribeEvents = (sessionId: SessionId) =>
      Stream.unwrap(
        getSession(sessionId).pipe(Effect.map((session) => Stream.fromQueue(session.events))),
      );

    return Provider.of({
      startSession,
      sendTurn,
      subscribeEvents,
    });
  }),
).pipe(Layer.provide(NodeServices.layer));
