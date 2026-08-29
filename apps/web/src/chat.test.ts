import {
  CodexModel,
  CodexSettings,
  defaultVoiceSettings,
  HarnessSettings,
  ModelCatalog,
  ProviderError,
  ProviderTurnDelta,
  SessionId,
  SessionStarted,
  TurnResult,
} from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Layer, Schema, Stream } from "effect";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import {
  appendError,
  appendUser,
  applyProviderEvent,
  chatAtom,
  formatError,
  initialChat,
  lastFromAtom,
  noReplyMessage,
  opening,
  resetSession,
  speakAtom,
  speakKeyAtom,
  stopReasonFromTurn,
  visibleMessagesAtom,
} from "./chat.ts";
import { BerniseRpc } from "./rpc.ts";
import type { ChatState } from "./chat.ts";
import {
  catalogDefaultModelId,
  composerModelOptions,
  composerModelView,
  emptyModelCatalog,
  settingsAtom,
} from "./settings.ts";

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
      expect.objectContaining({ from: "error", text: "agent down" }),
    ]);
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
      expect.objectContaining({ from: "error", text: "no agent" }),
    ]);
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
            voice: defaultVoiceSettings,
          }),
        ),
      ],
    });
    registry.mount(chatAtom);
    registry.mount(speakAtom);
    registry.set(speakAtom, "hello");
    await waitWhileWaiting(registry);

    expect(calls.filter((call) => call.tag === "StartSession")).toEqual([
      expect.objectContaining({ payload: { model: "gpt-5.4-mini" } }),
    ]);
    expect(calls.filter((call) => call.tag === "SendTurn")).toEqual([
      expect.objectContaining({
        payload: { sessionId, prompt: "hello", model: "gpt-5.4-mini" },
      }),
    ]);
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
