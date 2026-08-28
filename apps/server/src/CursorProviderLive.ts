import { ProviderError, ProviderEvent, ProviderTurnDelta, SessionId } from "@bernise/contracts";
import { NodeServices } from "@effect/platform-node";
import {
  Config,
  Effect,
  Exit,
  Layer,
  Option,
  PubSub,
  Scope,
  Stream,
  SynchronizedRef,
} from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { AcpTransportError, makeAcpConnection } from "./acp/JsonRpcStdio.ts";
import { Provider } from "./Provider.ts";

const cursorBinConfig = Config.string("BERNISE_CURSOR_BIN").pipe(
  Config.withDefault("cursor-agent"),
);
const workspaceConfig = Config.string("BERNISE_WORKSPACE").pipe(Config.option);

interface SessionState {
  readonly acpSessionId: string;
  readonly send: (method: string, params: unknown) => Effect.Effect<unknown, AcpTransportError>;
  readonly events: PubSub.PubSub<ProviderEvent>;
  readonly scope: Scope.Closeable;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const pickPermissionOptionId = (params: unknown): string => {
  const options = isRecord(params) && Array.isArray(params.options) ? params.options : [];
  const typed = options.filter(isRecord);
  const allowOnce = typed.find(
    (option) =>
      option.kind === "allow_once" ||
      option.optionId === "allow-once" ||
      option.kind === "allow_always",
  );
  const selected = allowOnce ?? typed[0];
  return typeof selected?.optionId === "string" ? selected.optionId : "allow-once";
};

const autoApproveRequest = (method: string, params: unknown): unknown => {
  if (method === "session/request_permission") {
    return {
      outcome: {
        outcome: "selected",
        optionId: pickPermissionOptionId(params),
      },
    };
  }
  if (method === "cursor/create_plan") {
    return { accepted: true };
  }
  if (method === "cursor/ask_question") {
    return { answers: [] };
  }
  return {};
};

const extractAssistantText = (params: unknown): string | undefined => {
  if (!isRecord(params) || !isRecord(params.update)) {
    return undefined;
  }
  if (params.update.sessionUpdate !== "agent_message_chunk") {
    return undefined;
  }
  const content = params.update.content;
  if (typeof content === "string" && content.length > 0) {
    return content;
  }
  if (isRecord(content) && typeof content.text === "string" && content.text.length > 0) {
    return content.text;
  }
  return undefined;
};

const readSessionId = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (isRecord(value) && typeof value.sessionId === "string" && value.sessionId.length > 0) {
    return value.sessionId;
  }
  return undefined;
};

const toProviderError = (error: unknown, fallback: string): ProviderError => {
  if (error instanceof ProviderError) {
    return error;
  }
  if (error instanceof AcpTransportError) {
    const loginHint = /auth|login|unauthorized|unauthenticated/i.test(error.message)
      ? ` ${error.message.endsWith(".") ? "" : "."} Run \`agent login\` on the machine running the Bernise server.`
      : "";
    return new ProviderError({ message: `${error.message}${loginHint}`.trim() });
  }
  if (error instanceof Error && error.message.length > 0) {
    return new ProviderError({ message: error.message });
  }
  return new ProviderError({ message: fallback });
};

export const CursorProviderLive = Layer.effect(
  Provider,
  Effect.gen(function* () {
    const parentScope = yield* Scope.Scope;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const cursorBin = yield* cursorBinConfig;
    const configuredWorkspace = yield* workspaceConfig;
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

    const startSession = Effect.fn("Provider.startSession")(function* (workspace: string) {
      const cwd = workspace.trim().length > 0 ? workspace.trim() : defaultWorkspace();
      const sessionScope = yield* Scope.fork(parentScope);
      const events = yield* PubSub.unbounded<ProviderEvent>();
      yield* Scope.addFinalizer(sessionScope, PubSub.shutdown(events));

      const connection = yield* makeAcpConnection({
        command: cursorBin,
        args: ["acp"],
        cwd,
        onNotification: (method, params) => {
          if (method !== "session/update") {
            return Effect.void;
          }
          const text = extractAssistantText(params);
          if (text === undefined) {
            return Effect.void;
          }
          return PubSub.publish(events, new ProviderTurnDelta({ text })).pipe(Effect.asVoid);
        },
        onRequest: (method, params) => Effect.succeed(autoApproveRequest(method, params)),
      }).pipe(
        Effect.provideService(Scope.Scope, sessionScope),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.mapError((error) => toProviderError(error, `Failed to start Cursor ACP in ${cwd}`)),
        Effect.tapError(() => Scope.close(sessionScope, Exit.void)),
      );

      yield* connection
        .send("initialize", {
          protocolVersion: 1,
          clientCapabilities: {},
          clientInfo: { name: "bernise", version: "0.0.0" },
        })
        .pipe(Effect.mapError((error) => toProviderError(error, "Cursor ACP initialize failed")));

      yield* connection.send("authenticate", { methodId: "cursor_login" }).pipe(
        Effect.matchEffect({
          onSuccess: () => Effect.void,
          onFailure: (error) =>
            /already|authenticated/i.test(error.message)
              ? Effect.void
              : Effect.fail(toProviderError(error, "Cursor ACP authenticate failed")),
        }),
      );

      const created = yield* connection
        .send("session/new", { cwd, mcpServers: [] })
        .pipe(Effect.mapError((error) => toProviderError(error, "Cursor ACP session/new failed")));
      const acpSessionId = readSessionId(created);
      if (acpSessionId === undefined) {
        yield* Scope.close(sessionScope, Exit.void);
        return yield* new ProviderError({
          message: "Cursor ACP session/new did not return a sessionId",
        });
      }

      const sessionId = SessionId.make(crypto.randomUUID());
      yield* SynchronizedRef.update(sessions, (map) => {
        const next = new Map(map);
        next.set(sessionId, {
          acpSessionId,
          send: connection.send,
          events,
          scope: sessionScope,
        });
        return next;
      });
      return sessionId;
    });

    const sendTurn = Effect.fn("Provider.sendTurn")(function* (
      sessionId: SessionId,
      prompt: string,
    ) {
      const session = yield* getSession(sessionId);
      yield* session
        .send("session/prompt", {
          sessionId: session.acpSessionId,
          prompt: [{ type: "text", text: prompt }],
        })
        .pipe(
          Effect.mapError((error) => toProviderError(error, "Cursor ACP session/prompt failed")),
        );
    });

    const subscribeEvents = (sessionId: SessionId) =>
      Stream.unwrap(
        getSession(sessionId).pipe(Effect.map((session) => Stream.fromPubSub(session.events))),
      );

    return Provider.of({
      startSession,
      sendTurn,
      subscribeEvents,
    });
  }),
).pipe(Layer.provide(NodeServices.layer));
