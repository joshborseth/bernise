import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { HttpLive, portConfig } from "./HttpLive.ts";

const program = Effect.gen(function* () {
  const port = yield* portConfig;
  yield* Effect.logInfo(`bernise server listening on http://127.0.0.1:${port}`);
  return yield* Effect.never;
}).pipe(Effect.provide(HttpLive));

NodeRuntime.runMain(program);
