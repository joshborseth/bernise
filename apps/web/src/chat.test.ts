import {
  CodexModel,
  CodexSettings,
  HarnessSettings,
  MessageId,
  ModelCatalog,
  ProviderError,
  ProviderTurnDelta,
  SessionId,
  SessionStarted,
  ThreadId,
  ThreadList,
  ThreadMessage,
  ThreadShell,
  ThreadSnapshot,
  TurnResult,
} from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Layer, Schema, Stream } from "effect";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import {
  activeThreadIdAtom,
  appendError,
  appendUser,
  applyProviderEvent,
  chatAtom,
  formatError,
  hydrateFromThread,
  initialChat,
  holdingReplyAtom,
  lastFromAtom,
  noReplyMessage,
  opening,
  resetSession,
  speakAtom,
  speakKeyAtom,
  stopReasonFromTurn,
  threadsAtom,
  visibleMessagesAtom,
} from "./chat.ts";
import {
  bootThreadsAtom,
  compactRelativeTime,
  filterThreadItems,
  listThreadItems,
  composerFocusNonceAtom,
  newThreadAtom,
  switchThreadAtom,
} from "./threads.ts";
import { BerniseRpc } from "./rpc.ts";
import type { ChatState } from "./chat.ts";
import {
  catalogDefaultModelId,
  composerModelOptions,
  composerModelView,
  emptyModelCatalog,
  settingsAtom,
} from "./settings.ts";
import { codexOfflineSpoken, voiceCueAtom, voiceRevealAtom } from "./voice/state.ts";

const sessionId = SessionId.make("sess-1");

const isSettled = (value: AsyncResult.AsyncResult<unknown, unknown>): boolean =>
  !AsyncResult.isWaiting(value) && value._tag !== "Initial";

const waitForChat = async (
  registry: AtomRegistry.AtomRegistry,
  predicate: (chat: ChatState) => boolean,
) => {
  if (predicate(registry.get(chatAtom))) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cancel();
      reject(new Error("chatAtom did not match"));
    }, 2000);
    const cancel = registry.subscribe(chatAtom, (value) => {
      if (predicate(value)) {
        clearTimeout(timeout);
        cancel();
        resolve();
      }
    });
    if (predicate(registry.get(chatAtom))) {
      clearTimeout(timeout);
      cancel();
      resolve();
    }
  });
};

const waitWhileWaiting = async (registry: AtomRegistry.AtomRegistry) => {
  if (isSettled(registry.get(speakAtom))) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cancel();
      reject(new Error("speakAtom did not settle"));
    }, 2000);
    const cancel = registry.subscribe(speakAtom, (value) => {
      if (isSettled(value)) {
        clearTimeout(timeout);
        cancel();
        resolve();
      }
    });
    if (isSettled(registry.get(speakAtom))) {
      clearTimeout(timeout);
      cancel();
      resolve();
    }
  });
};

describe("chat reducers", () => {
  it("appends a user message and clears the stream cursor", () => {
    const withAssistant = applyProviderEvent(
      initialChat,
      new ProviderTurnDelta({ text: "hi" }),
      "a1",
    );
    const next = appendUser(withAssistant, "hello", "u1");
    expect(next.assistantId).toBeUndefined();
    expect(next.messages).toEqual([
      opening,
      { id: "a1", from: "assistant", text: "hi" },
      { id: "u1", from: "user", text: "hello" },
    ]);
  });

  it("creates then extends an assistant bubble from deltas", () => {
    const created = applyProviderEvent(initialChat, new ProviderTurnDelta({ text: "Hel" }), "a1");
    const extended = applyProviderEvent(created, new ProviderTurnDelta({ text: "lo" }), "ignored");
    expect(extended.assistantId).toBe("a1");
    expect(extended.messages).toEqual([opening, { id: "a1", from: "assistant", text: "Hello" }]);
  });

  it("ignores empty deltas", () => {
    expect(applyProviderEvent(initialChat, new ProviderTurnDelta({ text: "" }), "a1")).toEqual(
      initialChat,
    );
  });

  it("appends an error bubble", () => {
    const next = appendError(initialChat, "nope", "e1");
    expect(next.messages).toEqual([opening, { id: "e1", from: "error", text: "nope" }]);
  });

  it("resets the session without dropping messages", () => {
    const spoken = applyProviderEvent(initialChat, new ProviderTurnDelta({ text: "hi" }), "a1");
    const next = resetSession(spoken);
    expect(next.sessionId).toBeUndefined();
    expect(next.assistantId).toBeUndefined();
    expect(next.messages).toEqual(spoken.messages);
  });

  it("formats tagged records without falling back to object Object", () => {
    expect(formatError({ _tag: "RpcClientError", message: "socket closed" })).toBe(
      "RpcClientError: socket closed",
    );
  });

  it("formats schema decode errors with a restart hint", () => {
    try {
      Schema.decodeUnknownSync(TurnResult)(null);
    } catch (error) {
      expect(formatError(error)).toMatch(/Could not decode the server reply/i);
      expect(formatError(error)).toMatch(/Restart Bernise/i);
    }
  });

  it("reads stopReason from a turn or falls back after a void reply", () => {
    expect(stopReasonFromTurn(new TurnResult({ stopReason: "max_tokens" }))).toBe("max_tokens");
    expect(stopReasonFromTurn(null)).toBe("end_turn");
  });

  it("names Codex in the empty-reply copy", () => {
    expect(noReplyMessage("end_turn")).toBe("No reply from Codex (stopReason: end_turn).");
    expect(noReplyMessage("completed")).toBe("No reply from Codex (stopReason: completed).");
  });

  it("hydrates the opening line plus persisted user and assistant bubbles", () => {
    const next = hydrateFromThread([
      new ThreadMessage({
        id: MessageId.make("m1"),
        role: "user",
        text: "hello",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      new ThreadMessage({
        id: MessageId.make("m2"),
        role: "assistant",
        text: "yo",
        createdAt: "2026-01-01T00:00:01.000Z",
      }),
    ]);
    expect(next.sessionId).toBeUndefined();
    expect(next.assistantId).toBeUndefined();
    expect(next.messages).toEqual([
      opening,
      { id: "m1", from: "user", text: "hello" },
      { id: "m2", from: "assistant", text: "yo" },
    ]);
  });
});

describe("chat atoms", () => {
  it("derives visible messages, lastFrom, and speakKey", () => {
    const registry = AtomRegistry.make();
    registry.set(
      chatAtom,
      appendUser(
        applyProviderEvent(initialChat, new ProviderTurnDelta({ text: "yo" }), "a1"),
        "hey",
        "u1",
      ),
    );
    expect(registry.get(visibleMessagesAtom)).toEqual([
      { id: "a1", from: "assistant", text: "yo" },
      { id: "u1", from: "user", text: "hey" },
    ]);
    expect(registry.get(lastFromAtom)).toBe("user");
    expect(registry.get(speakKeyAtom)).toBe("a1");
  });

  it("hides the live assistant until voice reveal, then clips to until", () => {
    const registry = AtomRegistry.make();
    registry.set(
      chatAtom,
      applyProviderEvent(initialChat, new ProviderTurnDelta({ text: "hello world" }), "a1"),
    );
    expect(registry.get(visibleMessagesAtom)).toEqual([]);
    expect(registry.get(holdingReplyAtom)).toBe(true);

    registry.set(voiceRevealAtom, { id: "a1", until: 5 });
    expect(registry.get(visibleMessagesAtom)).toEqual([
      { id: "a1", from: "assistant", text: "hello" },
    ]);
    expect(registry.get(holdingReplyAtom)).toBe(false);

    registry.set(voiceRevealAtom, { id: "a1", until: 11 });
    expect(registry.get(visibleMessagesAtom)).toEqual([
      { id: "a1", from: "assistant", text: "hello world" },
    ]);
  });

  it("shows a finished assistant in full once assistantId is cleared", () => {
    const registry = AtomRegistry.make();
    registry.set(
      chatAtom,
      appendUser(
        applyProviderEvent(initialChat, new ProviderTurnDelta({ text: "yo" }), "a1"),
        "hey",
        "u1",
      ),
    );
    expect(registry.get(holdingReplyAtom)).toBe(false);
    expect(registry.get(visibleMessagesAtom)).toEqual([
      { id: "a1", from: "assistant", text: "yo" },
      { id: "u1", from: "user", text: "hey" },
    ]);
  });

  it("speaks through a fake RPC layer and folds stream deltas", async () => {
    const fakeClient = ((tag: string) => {
      switch (tag) {
        case "StartSession":
          return Effect.succeed(new SessionStarted({ sessionId }));
        case "SendTurn":
          return Effect.succeed(new TurnResult({ stopReason: "end_turn" }));
        case "SubscribeEvents":
          return Stream.make(
            new ProviderTurnDelta({ text: "Hello" }),
            new ProviderTurnDelta({ text: "!" }),
          );
        case "ListThreads":
          return Effect.succeed(new ThreadList({ threads: [] }));
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, fakeClient)),
      ],
    });
    registry.mount(chatAtom);
    registry.mount(speakAtom);
    registry.set(speakAtom, "hello");
    await waitWhileWaiting(registry);

    const chat = registry.get(chatAtom);
    expect(chat.sessionId).toBe(sessionId);
    expect(chat.messages.filter((message) => message.from === "user")).toEqual([
      expect.objectContaining({ from: "user", text: "hello" }),
    ]);
    expect(chat.messages.filter((message) => message.from === "assistant")).toEqual([
      expect.objectContaining({ from: "assistant", text: "Hello!" }),
    ]);
    expect(AsyncResult.isWaiting(registry.get(speakAtom))).toBe(false);
  });

  it("appends an error bubble when SendTurn fails", async () => {
    const fakeClient = ((tag: string) => {
      switch (tag) {
        case "StartSession":
          return Effect.succeed(new SessionStarted({ sessionId }));
        case "SendTurn":
          return Effect.fail(new ProviderError({ message: "agent down" }));
        case "SubscribeEvents":
          return Stream.never;
        case "ListThreads":
          return Effect.succeed(new ThreadList({ threads: [] }));
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, fakeClient)),
      ],
    });
    registry.mount(chatAtom);
    registry.mount(speakAtom);
    registry.set(speakAtom, "hello");
    await waitWhileWaiting(registry);

    expect(
      registry.get(chatAtom).messages.filter((message) => message.from === "assistant"),
    ).toEqual([]);
    expect(registry.get(chatAtom).messages.filter((message) => message.from === "error")).toEqual([
      expect.objectContaining({ from: "error", text: "agent down" }),
    ]);
    expect(registry.get(voiceCueAtom)).toEqual(
      expect.objectContaining({ text: codexOfflineSpoken }),
    );
  });

  it("appends an error bubble when StartSession fails", async () => {
    const fakeClient = ((tag: string) => {
      switch (tag) {
        case "StartSession":
          return Effect.fail(new ProviderError({ message: "no agent" }));
        case "SendTurn":
          return Effect.succeed(new TurnResult({ stopReason: "end_turn" }));
        case "SubscribeEvents":
          return Stream.never;
        case "ListThreads":
          return Effect.succeed(new ThreadList({ threads: [] }));
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, fakeClient)),
      ],
    });
    registry.mount(chatAtom);
    registry.mount(speakAtom);
    registry.set(speakAtom, "hello");
    await waitWhileWaiting(registry);

    expect(
      registry.get(chatAtom).messages.filter((message) => message.from === "assistant"),
    ).toEqual([]);
    expect(registry.get(chatAtom).messages.filter((message) => message.from === "error")).toEqual([
      expect.objectContaining({ from: "error", text: "no agent" }),
    ]);
    expect(registry.get(voiceCueAtom)).toEqual(
      expect.objectContaining({ text: codexOfflineSpoken }),
    );
  });

  it("appends an error bubble when SendTurn succeeds with no stream text", async () => {
    const fakeClient = ((tag: string) => {
      switch (tag) {
        case "StartSession":
          return Effect.succeed(new SessionStarted({ sessionId }));
        case "SendTurn":
          return Effect.succeed(new TurnResult({ stopReason: "end_turn" }));
        case "SubscribeEvents":
          return Stream.never;
        case "ListThreads":
          return Effect.succeed(new ThreadList({ threads: [] }));
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, fakeClient)),
      ],
    });
    registry.mount(chatAtom);
    registry.mount(speakAtom);
    registry.set(speakAtom, "hello");
    await waitWhileWaiting(registry);

    expect(registry.get(chatAtom).messages.filter((message) => message.from === "error")).toEqual([
      expect.objectContaining({
        from: "error",
        text: "No reply from Codex (stopReason: end_turn).",
      }),
    ]);
  });

  it("appends an error bubble when SubscribeEvents fails after the session starts", async () => {
    const fakeClient = ((tag: string) => {
      switch (tag) {
        case "StartSession":
          return Effect.succeed(new SessionStarted({ sessionId }));
        case "SendTurn":
          return Effect.never;
        case "SubscribeEvents":
          return Stream.fromEffect(
            Effect.fail(new ProviderError({ message: "subscribe died" })).pipe(
              Effect.delay("10 millis"),
            ),
          );
        case "ListThreads":
          return Effect.succeed(new ThreadList({ threads: [] }));
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, fakeClient)),
      ],
    });
    registry.mount(chatAtom);
    registry.mount(speakAtom);
    registry.set(speakAtom, "hello");
    await waitForChat(registry, (chat) =>
      chat.messages.some(
        (message) => message.from === "error" && message.text.includes("subscribe died"),
      ),
    );
    expect(registry.get(voiceCueAtom)).toEqual(
      expect.objectContaining({ text: codexOfflineSpoken }),
    );
  });

  it("passes the selected model on StartSession and SendTurn", async () => {
    const calls: Array<{ readonly tag: string; readonly payload: unknown }> = [];
    const fakeClient = ((tag: string, payload: unknown) => {
      calls.push({ tag, payload });
      switch (tag) {
        case "StartSession":
          return Effect.succeed(new SessionStarted({ sessionId }));
        case "SendTurn":
          return Effect.succeed(new TurnResult({ stopReason: "end_turn" }));
        case "SubscribeEvents":
          return Stream.make(new ProviderTurnDelta({ text: "ok" }));
        case "ListThreads":
          return Effect.succeed(new ThreadList({ threads: [] }));
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, fakeClient)),
        Atom.initialValue(
          settingsAtom,
          new HarnessSettings({
            codex: new CodexSettings({
              enabled: true,
              binaryPath: "",
              homePath: "",
              model: "gpt-5.4-mini",
            }),
            persona: "",
          }),
        ),
      ],
    });
    registry.mount(chatAtom);
    registry.mount(speakAtom);
    registry.set(speakAtom, "hello");
    await waitWhileWaiting(registry);

    expect(calls.filter((call) => call.tag === "StartSession")).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ model: "gpt-5.4-mini", threadId: expect.any(String) }),
      }),
    ]);
    expect(calls.filter((call) => call.tag === "SendTurn")).toEqual([
      expect.objectContaining({
        payload: { sessionId, prompt: "hello", model: "gpt-5.4-mini" },
      }),
    ]);
  });

  it("hydrates chatAtom from ListThreads and GetThread on boot", async () => {
    const threadId = ThreadId.make("thread-1");
    const fakeClient = ((tag: string) => {
      switch (tag) {
        case "ListThreads":
          return Effect.succeed(
            new ThreadList({
              threads: [
                new ThreadShell({
                  id: threadId,
                  title: "hello",
                  createdAt: "2026-01-01T00:00:00.000Z",
                  updatedAt: "2026-01-01T00:00:01.000Z",
                }),
              ],
            }),
          );
        case "GetThread":
          return Effect.succeed(
            new ThreadSnapshot({
              threadId,
              messages: [
                new ThreadMessage({
                  id: MessageId.make("m1"),
                  role: "user",
                  text: "hello",
                  createdAt: "2026-01-01T00:00:00.000Z",
                }),
                new ThreadMessage({
                  id: MessageId.make("m2"),
                  role: "assistant",
                  text: "yo",
                  createdAt: "2026-01-01T00:00:01.000Z",
                }),
              ],
            }),
          );
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, fakeClient)),
      ],
    });
    registry.mount(chatAtom);
    registry.mount(bootThreadsAtom);
    await waitForChat(
      registry,
      (chat) =>
        chat.messages.some((message) => message.from === "user" && message.text === "hello") &&
        chat.messages.some((message) => message.from === "assistant" && message.text === "yo"),
    );
    expect(registry.get(activeThreadIdAtom)).toBe(threadId);
    expect(registry.get(threadsAtom)).toHaveLength(1);
  });

  it("starts a draft thread without hydrating messages", async () => {
    const fakeClient = (() => Effect.die("unused")) as never;
    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, fakeClient)),
      ],
    });
    registry.mount(chatAtom);
    registry.mount(newThreadAtom);
    registry.set(newThreadAtom, undefined);
    expect(registry.get(chatAtom).messages).toEqual([opening]);
    expect(registry.get(activeThreadIdAtom)).toBeDefined();
    expect(registry.get(threadsAtom)).toEqual([]);
    expect(registry.get(composerFocusNonceAtom)).toBe(1);
  });

  it("switches to a persisted thread and hydrates its transcript", async () => {
    const threadId = ThreadId.make("thread-2");
    const fakeClient = ((tag: string, payload: unknown) => {
      switch (tag) {
        case "GetThread":
          expect(payload).toEqual({ threadId });
          return Effect.succeed(
            new ThreadSnapshot({
              threadId,
              messages: [
                new ThreadMessage({
                  id: MessageId.make("m1"),
                  role: "user",
                  text: "later",
                  createdAt: "2026-01-01T00:00:00.000Z",
                }),
              ],
            }),
          );
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, fakeClient)),
        Atom.initialValue(threadsAtom, [
          new ThreadShell({
            id: threadId,
            title: "later",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
        ]),
      ],
    });
    registry.mount(chatAtom);
    registry.mount(switchThreadAtom);
    registry.set(switchThreadAtom, threadId);
    await waitForChat(registry, (chat) =>
      chat.messages.some((message) => message.from === "user" && message.text === "later"),
    );
    expect(registry.get(activeThreadIdAtom)).toBe(threadId);
  });
});

describe("composerModelView", () => {
  const catalog = new ModelCatalog({
    models: [
      new CodexModel({ id: "gpt-5.4-mini", displayName: "GPT-5.4 Mini", isDefault: true }),
      new CodexModel({ id: "gpt-5.4", displayName: "GPT-5.4", isDefault: false }),
    ],
  });

  it("lists catalog labels and keeps a stale selection", () => {
    expect(composerModelOptions(emptyModelCatalog, "")).toEqual([]);
    expect(composerModelOptions(catalog, "stale-model")).toEqual([
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "stale-model", label: "stale-model" },
    ]);
    expect(catalogDefaultModelId(catalog)).toBe("gpt-5.4-mini");
  });

  it("selects the catalog default when nothing is persisted", () => {
    expect(composerModelView(AsyncResult.success(catalog), "")).toEqual({
      kind: "select",
      options: [
        { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
        { id: "gpt-5.4", label: "GPT-5.4" },
      ],
      value: "gpt-5.4-mini",
    });
  });

  it("keeps the persisted model while the catalog is loading", () => {
    expect(composerModelView(AsyncResult.initial(true), "gpt-5.4")).toEqual({
      kind: "select",
      options: [{ id: "gpt-5.4", label: "gpt-5.4" }],
      value: "gpt-5.4",
    });
    expect(composerModelView(AsyncResult.initial(true), "")).toEqual({ kind: "pending" });
  });

  it("surfaces ListModels failures", () => {
    const view = composerModelView(
      AsyncResult.failure(
        Cause.fail(new ProviderError({ message: "Codex is not authenticated." })),
      ),
      "",
    );
    expect(view).toEqual({
      kind: "error",
      error: new ProviderError({ message: "Codex is not authenticated." }),
    });
  });

  it("errors when Codex returns no models", () => {
    expect(composerModelView(AsyncResult.success(emptyModelCatalog), "")).toEqual({
      kind: "error",
      error: new Error("Codex did not return any models."),
    });
  });
});

describe("listThreadItems", () => {
  const shell = (id: string, updatedAt: string) =>
    new ThreadShell({
      id: ThreadId.make(id),
      title: id,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt,
    });

  it("orders threads newest first regardless of input order", () => {
    const older = shell("older", "2026-01-01T00:00:01.000Z");
    const newer = shell("newer", "2026-01-01T00:00:02.000Z");
    const left = listThreadItems([older, newer], newer.id);
    const right = listThreadItems([newer, older], newer.id);
    expect(left).toEqual(right);
    expect(left.map((item) => (item.kind === "thread" ? item.thread.id : item.threadId))).toEqual([
      "newer",
      "older",
    ]);
  });

  it("shows a draft when the active id is not in the list", () => {
    const draftId = ThreadId.make("draft");
    const items = listThreadItems([shell("a", "2026-01-01T00:00:00.000Z")], draftId);
    expect(items[0]).toEqual({ kind: "draft", threadId: draftId });
    expect(items.some((item) => item.kind === "thread" && item.thread.id === "a")).toBe(true);
  });

  it("lists every thread with no cap", () => {
    const threads = Array.from({ length: 17 }, (_, index) =>
      shell(
        String.fromCharCode(97 + index),
        `2026-01-01T00:00:${String(17 - index).padStart(2, "0")}.000Z`,
      ),
    );
    const newest = threads[0];
    if (newest === undefined) {
      throw new Error("expected threads");
    }
    const items = listThreadItems(threads, newest.id);
    expect(items.filter((item) => item.kind === "thread")).toHaveLength(17);
    expect(items.some((item) => item.kind === "draft")).toBe(false);
  });
});

describe("filterThreadItems", () => {
  const shell = (id: string, title: string) =>
    new ThreadShell({
      id: ThreadId.make(id),
      title,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

  it("returns the list unchanged when the query is blank", () => {
    const items = listThreadItems([shell("a", "Grill the cache")], ThreadId.make("a"));
    expect(filterThreadItems(items, "   ")).toEqual(items);
  });

  it("filters by title without changing order", () => {
    const items = listThreadItems(
      [shell("a", "Grill the cache"), shell("b", "Persona voice"), shell("c", "Cache bust")],
      ThreadId.make("a"),
    );
    expect(
      filterThreadItems(items, "CACHE").map((item) =>
        item.kind === "thread" ? item.thread.id : item.threadId,
      ),
    ).toEqual(["a", "c"]);
  });

  it("matches the draft label", () => {
    const draftId = ThreadId.make("draft");
    const items = listThreadItems([shell("a", "Grill")], draftId);
    const filtered = filterThreadItems(items, "new thread");
    expect(filtered).toEqual([{ kind: "draft", threadId: draftId }]);
  });
});

describe("compactRelativeTime", () => {
  const now = Date.parse("2026-09-03T22:00:00.000Z");

  it("compacts recent stamps the way the sidebar rows do", () => {
    expect(compactRelativeTime("2026-09-03T21:59:20.000Z", now)).toBe("now");
    expect(compactRelativeTime("2026-09-03T21:55:00.000Z", now)).toBe("5m");
    expect(compactRelativeTime("2026-09-03T19:00:00.000Z", now)).toBe("3h");
    expect(compactRelativeTime("2026-09-01T22:00:00.000Z", now)).toBe("2d");
    expect(compactRelativeTime("2026-08-20T22:00:00.000Z", now)).toBe("Aug 20");
  });

  it("returns empty for unparseable stamps", () => {
    expect(compactRelativeTime("nope", now)).toBe("");
  });
});
