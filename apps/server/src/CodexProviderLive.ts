import {
  CodexModel,
  ModelCatalog,
  ProviderError,
  ProviderEvent,
  ProviderTurnDelta,
  SessionId,
  type ThreadId,
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
import { berniseDeveloperInstructions } from "./persona.ts";
import { ThreadPersistence } from "./persistence/ThreadPersistence.ts";
import { Provider } from "./Provider.ts";
import { resolveCodexBin } from "./providerBins.ts";
import { ServerSettings } from "./ServerSettings.ts";

const codexBinEnv = Config.string("BERNISE_CODEX_BIN").pipe(Config.option);
const workspaceConfig = Config.string("BERNISE_WORKSPACE").pipe(Config.option);
const handshakeTimeout = "20 seconds";
const catalogTimeout = "10 seconds";
const catalogKillAfter = "2 seconds";
const catalogPageLimit = 50;
const catalogMaxPages = 10;

interface SessionState {
  readonly berniseThreadId: ThreadId;
  readonly codexThreadId: string;
  readonly send: (method: string, params?: unknown) => Effect.Effect<unknown, CodexTransportError>;
  readonly events: Queue.Queue<ProviderEvent>;
  turnDone: Deferred.Deferred<{ readonly stopReason: string }, CodexTransportError>;
  assistantText: string;
  readonly scope: Scope.Closeable;
}

const recoverableResumeSnippets = [
  "not found",
  "missing thread",
  "no such thread",
  "unknown thread",
  "does not exist",
];

export const isRecoverableThreadResumeError = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (!message.includes("thread")) {
    return false;
  }
  return recoverableResumeSnippets.some((snippet) => message.includes(snippet));
};

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

export const readCodexModel = (value: unknown): CodexModel | undefined => {
  if (!isRecord(value) || value.hidden === true) {
    return undefined;
  }
  const id =
    typeof value.id === "string" && value.id.length > 0
      ? value.id
      : typeof value.model === "string" && value.model.length > 0
        ? value.model
        : undefined;
  if (id === undefined) {
    return undefined;
  }
  const displayName =
    typeof value.displayName === "string" && value.displayName.length > 0 ? value.displayName : id;
  return new CodexModel({
    id,
    displayName,
    isDefault: value.isDefault === true,
  });
};

export const readCodexModelPage = (
  value: unknown,
): {
  readonly models: ReadonlyArray<CodexModel>;
  readonly nextCursor: string | undefined;
} => {
  if (!isRecord(value)) {
    return { models: [], nextCursor: undefined };
  }
  const rows = Array.isArray(value.data)
    ? value.data
    : Array.isArray(value.models)
      ? value.models
      : Array.isArray(value.items)
        ? value.items
        : undefined;
  if (rows === undefined) {
    return { models: [], nextCursor: undefined };
  }
  const models: Array<CodexModel> = [];
  for (const entry of rows) {
    const model = readCodexModel(entry);
    if (model !== undefined) {
      models.push(model);
    }
  }
  const nextCursor =
    typeof value.nextCursor === "string" && value.nextCursor.length > 0
      ? value.nextCursor
      : undefined;
  return { models, nextCursor };
};

export const codexThreadStartParams = (cwd: string) => ({
  cwd,
  developerInstructions: berniseDeveloperInstructions,
});

const withOptionalModel = (
  params: Record<string, unknown>,
  model: string | undefined,
): Record<string, unknown> => {
  const trimmed = model?.trim() ?? "";
  if (trimmed.length === 0) {
    return params;
  }
  return { ...params, model: trimmed };
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
    const threads = yield* ThreadPersistence;
    const sessions = yield* SynchronizedRef.make(new Map<SessionId, SessionState>());
    const catalogCache = yield* SynchronizedRef.make<
      | {
          readonly command: string;
          readonly homePath: string;
          readonly catalog: ModelCatalog;
        }
      | undefined
    >(undefined);

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

    const closeAllSessions = Effect.fn("CodexProvider.closeAllSessions")(function* () {
      const previous = yield* SynchronizedRef.getAndSet(sessions, new Map());
      for (const session of previous.values()) {
        yield* Scope.close(session.scope, Exit.void);
      }
    });

    const persistResumeCursor = (threadId: ThreadId, codexThreadId: string) =>
      threads
        .setResumeCursor(threadId, codexThreadId)
        .pipe(
          Effect.catchTag("PersistenceError", (error) =>
            Effect.logWarning(`setResumeCursor failed: ${error.message}`).pipe(Effect.asVoid),
          ),
        );

    const openCodexThread = (
      send: SessionState["send"],
      cwd: string,
      model: string | undefined,
      resumeCodexThreadId: string | undefined,
    ) => {
      const startParams = withOptionalModel(codexThreadStartParams(cwd), model);
      if (resumeCodexThreadId === undefined) {
        return withHandshakeTimeout(
          send("thread/start", startParams),
          "Codex App Server thread/start",
        );
      }
      return withHandshakeTimeout(
        send("thread/resume", { threadId: resumeCodexThreadId, ...startParams }),
        "Codex App Server thread/resume",
      ).pipe(
        Effect.catch((error: ProviderError) =>
          isRecoverableThreadResumeError(error)
            ? Effect.logWarning("codex app-server thread resume fell back to fresh start").pipe(
                Effect.andThen(
                  withHandshakeTimeout(
                    send("thread/start", startParams),
                    "Codex App Server thread/start",
                  ),
                ),
              )
            : Effect.fail(error),
        ),
      );
    };

    const startSession = Effect.fn("CodexProvider.startSession")(function* (
      workspace: string,
      berniseThreadId: ThreadId,
      model?: string,
    ) {
      yield* closeAllSessions();
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
            const session = sessionHolder.current;
            if (session !== undefined) {
              session.assistantText += text;
            }
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

      const resumeCodexThreadId = yield* threads
        .getResumeCursor(berniseThreadId)
        .pipe(
          Effect.catchTag("PersistenceError", (error) =>
            Effect.logWarning(`getResumeCursor failed: ${error.message}`).pipe(
              Effect.as(undefined as string | undefined),
            ),
          ),
        );
      const opened = yield* openCodexThread(connection.send, cwd, model, resumeCodexThreadId).pipe(
        Effect.tapError(() => Scope.close(sessionScope, Exit.void)),
      );
      const codexThreadId = readCodexThreadId(opened);
      if (codexThreadId === undefined) {
        yield* Scope.close(sessionScope, Exit.void);
        return yield* new ProviderError({
          message: "Codex App Server thread/start did not return a thread id",
        });
      }
      yield* persistResumeCursor(berniseThreadId, codexThreadId);

      const sessionId = SessionId.make(crypto.randomUUID());
      const session: SessionState = {
        berniseThreadId,
        codexThreadId,
        send: connection.send,
        events,
        turnDone: initialTurn,
        assistantText: "",
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
      model?: string,
    ) {
      const session = yield* getSession(sessionId);
      const turnDone = yield* Deferred.make<{ readonly stopReason: string }, CodexTransportError>();
      session.turnDone = turnDone;
      session.assistantText = "";
      yield* session
        .send(
          "turn/start",
          withOptionalModel(
            {
              threadId: session.codexThreadId,
              input: [{ type: "text", text: prompt }],
            },
            model,
          ),
        )
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

    const consumeAssistantText = (sessionId: SessionId) =>
      getSession(sessionId).pipe(
        Effect.map((session) => {
          const text = session.assistantText;
          session.assistantText = "";
          return text;
        }),
      );

    const fetchCatalog = Effect.fn("CodexProvider.fetchCatalog")(function* (
      command: string,
      homePath: string,
    ) {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const connection = yield* makeCodexConnection({
            command,
            args: ["app-server"],
            cwd: process.cwd(),
            ...(homePath.length > 0 ? { env: { CODEX_HOME: expandHomePath(homePath) } } : {}),
            forceKillAfter: catalogKillAfter,
            spawnHint: `Could not spawn ${command}. Install Codex CLI (\`codex\`) and run \`codex login\`.`,
            onNotification: () => Effect.void,
            onRequest: () => Effect.succeed({}),
          }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));
          yield* connection.send("initialize", {
            clientInfo: { name: "bernise", title: "Bernise", version: "0.0.0" },
            capabilities: { experimentalApi: true },
          });
          yield* connection.notify("initialized");
          const models: Array<CodexModel> = [];
          let cursor: string | undefined;
          for (let page = 0; page < catalogMaxPages; page++) {
            const listed = yield* connection.send("model/list", {
              limit: catalogPageLimit,
              includeHidden: false,
              ...(cursor === undefined ? {} : { cursor }),
            });
            const nextPage = readCodexModelPage(listed);
            models.push(...nextPage.models);
            if (nextPage.nextCursor === undefined) {
              break;
            }
            cursor = nextPage.nextCursor;
          }
          return new ModelCatalog({ models });
        }),
      ).pipe(
        Effect.timeout(catalogTimeout),
        Effect.mapError((error) => toProviderError(error, "Codex App Server model/list failed")),
      );
    });

    const listModels = Effect.gen(function* () {
      const settings = yield* serverSettings.get;
      const command = resolveCodexBin(settings.codex.binaryPath, envBin);
      const homePath = settings.codex.homePath.trim();
      return yield* SynchronizedRef.modifyEffect(catalogCache, (cached) => {
        if (cached !== undefined && cached.command === command && cached.homePath === homePath) {
          return Effect.succeed([cached.catalog, cached] as const);
        }
        return fetchCatalog(command, homePath).pipe(
          Effect.map((catalog) => {
            if (catalog.models.length === 0) {
              return [catalog, undefined] as const;
            }
            return [catalog, { command, homePath, catalog }] as const;
          }),
        );
      });
    });

    return Provider.of({
      startSession,
      sendTurn,
      subscribeEvents,
      consumeAssistantText,
      listModels,
    });
  }),
).pipe(Layer.provide(NodeServices.layer));
