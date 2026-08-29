import {
  BerniseRpcs,
  ProviderError,
  SessionId,
  ThreadSnapshot,
  TurnResult,
} from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Stream } from "effect";
import { RpcTest } from "effect/unstable/rpc";
import { persistenceMemory } from "../src/persistence/Sqlite.ts";
import { ThreadPersistence } from "../src/persistence/ThreadPersistence.ts";
import { Provider } from "../src/Provider.ts";
import { providerHealthMemory } from "../src/ProviderHealth.ts";
import { RpcHandlersLive } from "../src/RpcLive.ts";
import { serverSettingsMemory } from "../src/ServerSettings.ts";
import { pendingSnapshots } from "./testLayers.ts";

describe("ThreadPersistence", () => {
  it.effect("returns an empty snapshot before any turns", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadPersistence;
      expect(yield* threads.getThread).toEqual(
        new ThreadSnapshot({ threadId: null, messages: [] }),
      );
    }).pipe(Effect.provide(persistenceMemory)),
  );

  it.effect("appends user and assistant messages onto one implicit thread", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadPersistence;
      yield* threads.appendUser("hello");
      yield* threads.appendAssistant("hi there");
      const snapshot = yield* threads.getThread;
      expect(snapshot.threadId).not.toBeNull();
      expect(
        snapshot.messages.map((message) => ({ role: message.role, text: message.text })),
      ).toEqual([
        { role: "user", text: "hello" },
        { role: "assistant", text: "hi there" },
      ]);
    }).pipe(Effect.provide(persistenceMemory)),
  );

  it.effect("keeps later turns on the same thread", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadPersistence;
      yield* threads.appendUser("first");
      const first = yield* threads.getThread;
      yield* threads.appendAssistant("ok");
      yield* threads.appendUser("second");
      const snapshot = yield* threads.getThread;
      expect(snapshot.threadId).toBe(first.threadId);
      expect(snapshot.messages).toHaveLength(3);
      expect(snapshot.messages[2]?.text).toBe("second");
    }).pipe(Effect.provide(persistenceMemory)),
  );
});

describe("SendTurn transcript persistence", () => {
  it.effect("persists the user prompt and assistant text for GetThread", () =>
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(BerniseRpcs);
      expect(yield* client.GetThread()).toEqual(
        new ThreadSnapshot({ threadId: null, messages: [] }),
      );
      yield* client.SendTurn({
        sessionId: SessionId.make("sess-1"),
        prompt: "hello",
      });
      const snapshot = yield* client.GetThread();
      expect(snapshot.threadId).not.toBeNull();
      expect(
        snapshot.messages.map((message) => ({ role: message.role, text: message.text })),
      ).toEqual([
        { role: "user", text: "hello" },
        { role: "assistant", text: "hi there" },
      ]);
    }).pipe(
      Effect.provide(RpcHandlersLive),
      Effect.provide(
        Layer.succeed(
          Provider,
          Provider.of({
            startSession: () => Effect.fail(new ProviderError({ message: "stub" })),
            sendTurn: () => Effect.succeed(new TurnResult({ stopReason: "end_turn" })),
            subscribeEvents: () => Stream.never,
            consumeAssistantText: () => Effect.succeed("hi there"),
            listModels: Effect.fail(new ProviderError({ message: "stub" })),
          }),
        ),
      ),
      Effect.provide(persistenceMemory),
      Effect.provide(serverSettingsMemory()),
      Effect.provide(providerHealthMemory(pendingSnapshots())),
    ),
  );
});
