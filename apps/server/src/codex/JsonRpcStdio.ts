import { Cause, Deferred, Effect, Queue, Schema, Stream } from "effect";
import type { Duration } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export class CodexTransportError extends Schema.TaggedError<CodexTransportError>()(
  "CodexTransportError",
  {
    message: Schema.String,
  },
) {}

export interface CodexConnection {
  readonly send: (method: string, params?: unknown) => Effect.Effect<unknown, CodexTransportError>;
  readonly notify: (method: string, params?: unknown) => Effect.Effect<void, CodexTransportError>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const jsonRpcMethodNotFound = -32601;
const stderrLineLimit = 40;

const readId = (value: unknown): string | number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
};

export const makeCodexConnection = Effect.fn("makeCodexConnection")(function* (options: {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env?: Record<string, string | undefined>;
  readonly forceKillAfter?: Duration.Input;
  readonly spawnHint?: string;
  readonly onNotification: (method: string, params: unknown) => Effect.Effect<void>;
  readonly onRequest: (method: string, params: unknown) => Effect.Effect<unknown | undefined>;
}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner
    .spawn(
      ChildProcess.make(options.command, options.args, {
        cwd: options.cwd,
        env: options.env,
        extendEnv: true,
        detached: false,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        ...(options.forceKillAfter === undefined ? {} : { forceKillAfter: options.forceKillAfter }),
      }),
    )
    .pipe(
      Effect.mapError(
        (cause: PlatformError) =>
          new CodexTransportError({
            message: formatSpawnFailure(options.command, cause, options.spawnHint),
          }),
      ),
    );

  const pending = new Map<string, Deferred.Deferred<unknown, CodexTransportError>>();
  let nextId = 1;
  const writes = yield* Queue.unbounded<string>();
  const stderrLines: Array<string> = [];

  const writeLine = (value: unknown) => Queue.offer(writes, `${JSON.stringify(value)}\n`);

  const stderrTail = (): string => stderrLines.slice(-20).join("\n").trim();

  const withStderr = (message: string): string => {
    const tail = stderrTail();
    if (tail.length === 0) {
      return message;
    }
    return `${message}\n${tail}`;
  };

  const failAllPending = (message: string) =>
    Effect.gen(function* () {
      if (pending.size === 0) {
        return;
      }
      const error = new CodexTransportError({ message: withStderr(message) });
      const waiters = [...pending.values()];
      pending.clear();
      for (const deferred of waiters) {
        yield* Deferred.fail(deferred, error);
      }
    });

  const respond = (id: unknown, result: unknown) => writeLine({ id, result });

  const respondError = (id: unknown, code: number, message: string) =>
    writeLine({
      id,
      error: { code, message },
    });

  const handleMessage = (message: Record<string, unknown>) =>
    Effect.gen(function* () {
      const method = typeof message.method === "string" ? message.method : undefined;
      const hasId = Object.hasOwn(message, "id");

      if (method !== undefined && hasId) {
        const result = yield* options.onRequest(method, message.params);
        if (result === undefined) {
          yield* respondError(message.id, jsonRpcMethodNotFound, `Method not found: ${method}`);
          return;
        }
        yield* respond(message.id, result);
        return;
      }

      if (method !== undefined) {
        yield* options.onNotification(method, message.params);
        return;
      }

      const id = readId(message.id);
      if (!hasId || id === undefined) {
        return;
      }

      const deferred = pending.get(String(id));
      if (deferred === undefined) {
        return;
      }
      pending.delete(String(id));
      if (isRecord(message.error)) {
        const errorMessage =
          typeof message.error.message === "string"
            ? message.error.message
            : JSON.stringify(message.error);
        yield* Deferred.fail(deferred, new CodexTransportError({ message: errorMessage }));
        return;
      }
      yield* Deferred.succeed(deferred, message.result);
    });

  yield* Stream.fromQueue(writes).pipe(
    Stream.encodeText,
    Stream.run(handle.stdin),
    Effect.ignoreCause,
    Effect.forkScoped,
  );
  yield* handle.stderr.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runForEach((line) =>
      Effect.sync(() => {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          return;
        }
        stderrLines.push(trimmed);
        if (stderrLines.length > stderrLineLimit) {
          stderrLines.shift();
        }
      }),
    ),
    Effect.ignoreCause,
    Effect.forkScoped,
  );
  yield* handle.stdout.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runForEach((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return Effect.void;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return Effect.void;
      }
      if (!isRecord(parsed)) {
        return Effect.void;
      }
      return handleMessage(parsed).pipe(Effect.ignoreCause);
    }),
    Effect.matchCauseEffect({
      onFailure: () => failAllPending("Codex App Server stdout closed."),
      onSuccess: () => failAllPending("Codex App Server stdout closed."),
    }),
    Effect.forkScoped,
  );
  yield* handle.exitCode.pipe(
    Effect.flatMap((code) =>
      failAllPending(`Codex App Server exited (code ${String(Number(code))}).`),
    ),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : failAllPending("Codex App Server exited."),
    ),
    Effect.forkScoped,
  );

  const send = (method: string, params?: unknown) =>
    Effect.gen(function* () {
      const id = nextId;
      nextId += 1;
      const deferred = yield* Deferred.make<unknown, CodexTransportError>();
      pending.set(String(id), deferred);
      yield* writeLine({
        id,
        method,
        ...(params === undefined ? {} : { params }),
      });
      return yield* Deferred.await(deferred);
    });

  const notify = (method: string, params?: unknown) =>
    writeLine({
      method,
      ...(params === undefined ? {} : { params }),
    }).pipe(Effect.asVoid);

  return { send, notify } satisfies CodexConnection;
});

function formatSpawnFailure(command: string, cause: PlatformError, spawnHint?: string): string {
  const notFound = cause.reason._tag === "NotFound" || /ENOENT|not found/i.test(cause.message);
  if (notFound) {
    return (
      spawnHint ??
      `Could not spawn ${command}. Install Codex CLI (\`codex\`) and run \`codex login\`.`
    );
  }
  return `Could not spawn ${command}: ${cause.message}`;
}
