import { Cause, Deferred, Effect, Queue, Schema, Stream } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export class AcpTransportError extends Schema.TaggedError<AcpTransportError>()(
  "AcpTransportError",
  {
    message: Schema.String,
  },
) {}

export interface AcpConnection {
  readonly send: (method: string, params: unknown) => Effect.Effect<unknown, AcpTransportError>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const jsonRpcMethodNotFound = -32601;
const stderrLineLimit = 40;

const readNumericId = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

export const makeAcpConnection = Effect.fn("makeAcpConnection")(function* (options: {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly onNotification: (method: string, params: unknown) => Effect.Effect<void>;
  readonly onRequest: (method: string, params: unknown) => Effect.Effect<unknown | undefined>;
}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner
    .spawn(
      ChildProcess.make(options.command, options.args, {
        cwd: options.cwd,
        extendEnv: true,
        detached: false,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      }),
    )
    .pipe(
      Effect.mapError(
        (cause: PlatformError) =>
          new AcpTransportError({
            message: formatSpawnFailure(options.command, cause),
          }),
      ),
    );

  const pending = new Map<number, Deferred.Deferred<unknown, AcpTransportError>>();
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
      const error = new AcpTransportError({ message: withStderr(message) });
      const waiters = [...pending.values()];
      pending.clear();
      for (const deferred of waiters) {
        yield* Deferred.fail(deferred, error);
      }
    });

  const respond = (id: unknown, result: unknown) =>
    writeLine({
      jsonrpc: "2.0",
      id,
      result,
    });

  const respondError = (id: unknown, code: number, message: string) =>
    writeLine({
      jsonrpc: "2.0",
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

      const id = readNumericId(message.id);
      if (!hasId || id === undefined) {
        return;
      }

      const deferred = pending.get(id);
      if (deferred === undefined) {
        return;
      }
      pending.delete(id);
      if (isRecord(message.error)) {
        const errorMessage =
          typeof message.error.message === "string"
            ? message.error.message
            : JSON.stringify(message.error);
        yield* Deferred.fail(deferred, new AcpTransportError({ message: errorMessage }));
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
      onFailure: () => failAllPending("Cursor ACP stdout closed."),
      onSuccess: () => failAllPending("Cursor ACP stdout closed."),
    }),
    Effect.forkScoped,
  );
  yield* handle.exitCode.pipe(
    Effect.flatMap((code) => failAllPending(`Cursor ACP exited (code ${String(Number(code))}).`)),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : failAllPending("Cursor ACP exited."),
    ),
    Effect.forkScoped,
  );

  const send = (method: string, params: unknown) =>
    Effect.gen(function* () {
      const id = nextId;
      nextId += 1;
      const deferred = yield* Deferred.make<unknown, AcpTransportError>();
      pending.set(id, deferred);
      yield* writeLine({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });
      return yield* Deferred.await(deferred);
    });

  return { send } satisfies AcpConnection;
});

function formatSpawnFailure(command: string, cause: PlatformError): string {
  const notFound = cause.reason._tag === "NotFound" || /ENOENT|not found/i.test(cause.message);
  if (notFound) {
    return `Could not spawn ${command}. Install Cursor CLI (\`cursor-agent\`) and run \`agent login\`.`;
  }
  return `Could not spawn ${command}: ${cause.message}`;
}
