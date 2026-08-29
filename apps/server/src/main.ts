import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { HttpLive, hostConfig, portConfig } from "./HttpLive.ts";
import { installLoginShellPathIntoProcess } from "./shellPath.ts";

const listen = Effect.gen(function* () {
  const host = yield* hostConfig;
  const port = yield* portConfig;
  yield* Effect.logInfo(`bernise server listening on http://${host}:${port}`);
  return yield* Effect.never;
}).pipe(Effect.provide(HttpLive));

const program = Effect.gen(function* () {
  yield* Effect.sync(() => {
    installLoginShellPathIntoProcess();
  });
  return yield* listen;
});

NodeRuntime.runMain(program);
