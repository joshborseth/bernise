import {
  BerniseRpcs,
  defaultThreadTitle,
  PersistenceError,
  ProviderError,
  SessionId,
  ThreadId,
  ThreadSnapshot,
  titleFromPrompt,
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

const threadA = ThreadId.make("thread-a");
const threadB = ThreadId.make("thread-b");
const sessionId = SessionId.make("sess-1");

describe("titleFromPrompt", () => {
  it("collapses whitespace and truncates long prompts", () => {
    expect(titleFromPrompt("  hello   there  ")).toBe("hello there");
    expect(titleFromPrompt("")).toBe(defaultThreadTitle);
    expect(titleFromPrompt("x".repeat(50)).length).toBe(40);
    expect(titleFromPrompt("x".repeat(50)).endsWith("…")).toBe(true);
  });
});

describe("ThreadPersistence", () => {
  it.effect("returns an empty snapshot for an unknown thread", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadPersistence;
      expect(yield* threads.getThread(threadA)).toEqual(
        new ThreadSnapshot({ threadId: threadA, messages: [] }),
      );
      expect(yield* threads.listThreads).toEqual([]);
    }).pipe(Effect.provide(persistenceMemory)),
  );

  it.effect("creates a thread on first append and isolates later threads", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadPersistence;
      yield* threads.appendUser(threadA, "grill the auth model");
      yield* threads.appendAssistant(threadA, "ok");
      yield* threads.appendUser(threadB, "separate thread");
      const listed = yield* threads.listThreads;
      expect(listed.map((thread) => ({ id: thread.id, title: thread.title }))).toEqual([
        { id: threadB, title: "separate thread" },
        { id: threadA, title: "grill the auth model" },
      ]);
      expect((yield* threads.getThread(threadA)).messages.map((message) => message.text)).toEqual([
        "grill the auth model",
        "ok",
      ]);
      expect((yield* threads.getThread(threadB)).messages.map((message) => message.text)).toEqual([
        "separate thread",
      ]);
    }).pipe(Effect.provide(persistenceMemory)),
  );

  it.effect("keeps later turns on the same thread", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadPersistence;
      yield* threads.appendUser(threadA, "first");
      yield* threads.appendAssistant(threadA, "ok");
      yield* threads.appendUser(threadA, "second");
      const snapshot = yield* threads.getThread(threadA);
      expect(snapshot.messages).toHaveLength(3);
      expect(snapshot.messages[2]?.text).toBe("second");
    }).pipe(Effect.provide(persistenceMemory)),
  );

  it.effect("renames, stores a resume cursor, and deletes a thread", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadPersistence;
      yield* threads.appendUser(threadA, "hello");
      yield* threads.setResumeCursor(threadA, "codex-1");
      expect(yield* threads.getResumeCursor(threadA)).toBe("codex-1");
      const renamed = yield* threads.renameThread(threadA, "Auth grill");
      expect(renamed.title).toBe("Auth grill");
      yield* threads.deleteThread(threadA);
      expect(yield* threads.listThreads).toEqual([]);
      expect(yield* threads.getResumeCursor(threadA)).toBeUndefined();
      expect(yield* threads.renameThread(threadA, "gone").pipe(Effect.flip)).toEqual(
        new PersistenceError({ message: `Unknown thread ${threadA}` }),
      );
    }).pipe(Effect.provide(persistenceMemory)),
  );

  it.effect("backfills New thread titles from the first user message", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadPersistence;
      yield* threads.createThread(threadA, defaultThreadTitle);
      yield* threads.appendUser(threadA, "name this after me");
      const listed = yield* threads.listThreads;
      expect(listed[0]?.title).toBe("name this after me");
    }).pipe(Effect.provide(persistenceMemory)),
  );
});

const rpcLayer = RpcHandlersLive.pipe(
  Layer.provide(
    Layer.succeed(
      Provider,
      Provider.of({
        startSession: () => Effect.succeed(sessionId),
        sendTurn: () => Effect.succeed(new TurnResult({ stopReason: "end_turn" })),
        subscribeEvents: () => Stream.never,
        consumeAssistantText: () => Effect.succeed("hi there"),
        listModels: Effect.fail(new ProviderError({ message: "stub" })),
      }),
    ),
  ),
  Layer.provide(persistenceMemory),
  Layer.provide(serverSettingsMemory()),
  Layer.provide(providerHealthMemory(pendingSnapshots())),
);

describe("SendTurn transcript persistence", () => {
  it.effect("persists the user prompt and assistant text on the session thread", () =>
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(BerniseRpcs);
      yield* client.StartSession({ threadId: threadA });
      expect(yield* client.GetThread({ threadId: threadA })).toEqual(
        new ThreadSnapshot({ threadId: threadA, messages: [] }),
      );
      yield* client.SendTurn({
        sessionId,
        prompt: "hello",
      });
      const snapshot = yield* client.GetThread({ threadId: threadA });
      expect(snapshot.threadId).toBe(threadA);
      expect(
        snapshot.messages.map((message) => ({ role: message.role, text: message.text })),
      ).toEqual([
        { role: "user", text: "hello" },
        { role: "assistant", text: "hi there" },
      ]);
      const listed = yield* client.ListThreads();
      expect(listed.threads).toHaveLength(1);
      expect(listed.threads[0]?.id).toBe(threadA);
      expect(listed.threads[0]?.title).toBe("hello");
    }).pipe(Effect.provide(rpcLayer)),
  );
});
