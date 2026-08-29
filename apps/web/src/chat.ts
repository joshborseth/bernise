import { ProviderError, type ProviderEvent, type SessionId } from "@bernise/contracts";
import { Cause, Effect, Fiber, Schema, Stream } from "effect";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import { BerniseRpc } from "./rpc.ts";
import { settingsAtom } from "./settings.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type ChatMessage =
  | { readonly id: string; readonly from: "bernise" }
  | { readonly id: string; readonly from: "user"; readonly text: string }
  | { readonly id: string; readonly from: "assistant"; readonly text: string }
  | { readonly id: string; readonly from: "error"; readonly text: string };

export type ChatState = {
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly sessionId: SessionId | undefined;
  readonly assistantId: string | undefined;
};

export const opening: ChatMessage = {
  id: "opening",
  from: "bernise",
};

export const initialChat: ChatState = {
  messages: [opening],
  sessionId: undefined,
  assistantId: undefined,
};

export const formatError = (error: unknown): string => {
  if (error instanceof ProviderError) {
    return error.message;
  }
  if (Schema.isSchemaError(error)) {
    const detail = error.message.replace(/\s+/g, " ").trim();
    return `Could not decode the server reply (${detail}). Restart Bernise so the UI and server share the same schema.`;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  if (isRecord(error) && typeof error.message === "string" && error.message.length > 0) {
    const tag = typeof error._tag === "string" ? `${error._tag}: ` : "";
    return `${tag}${error.message}`;
  }
  return String(error);
};

export const stopReasonFromTurn = (result: { readonly stopReason: string } | null): string =>
  result?.stopReason ?? "end_turn";

export const appendUser = (state: ChatState, text: string, id: string): ChatState => ({
  ...state,
  assistantId: undefined,
  messages: [...state.messages, { id, from: "user", text }],
});

export const applyProviderEvent = (
  state: ChatState,
  event: ProviderEvent,
  id: string,
): ChatState => {
  if (event._tag !== "ProviderTurnDelta" || event.text.length === 0) {
    return state;
  }
  if (state.assistantId === undefined) {
    return {
      ...state,
      assistantId: id,
      messages: [...state.messages, { id, from: "assistant", text: event.text }],
    };
  }
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.id === state.assistantId && message.from === "assistant"
        ? { ...message, text: `${message.text}${event.text}` }
        : message,
    ),
  };
};

export const appendError = (state: ChatState, text: string, id: string): ChatState => ({
  ...state,
  messages: [...state.messages, { id, from: "error", text }],
});

export const resetSession = (state: ChatState): ChatState => ({
  ...state,
  sessionId: undefined,
  assistantId: undefined,
});

export const noReplyMessage = (stopReason: string): string =>
  `No reply from Codex (stopReason: ${stopReason}).`;

export const chatAtom = Atom.make(initialChat).pipe(Atom.keepAlive);

export const visibleMessagesAtom = Atom.make((get) =>
  get(chatAtom).messages.filter((message) => message.from !== "bernise"),
);

export const lastFromAtom = Atom.make((get) => {
  const messages = get(chatAtom).messages;
  const last = messages[messages.length - 1] ?? opening;
  return last.from === "user" ? ("user" as const) : ("bernise" as const);
});

export const speakKeyAtom = Atom.make((get) => {
  const lastAssistant = get(chatAtom).messages.reduce<ChatMessage | undefined>(
    (found, message) => (message.from === "assistant" ? message : found),
    undefined,
  );
  return lastAssistant?.id ?? opening.id;
});

export const sessionIdAtom = Atom.make((get) => get(chatAtom).sessionId);

export const sessionEpochAtom = Atom.make(0).pipe(Atom.keepAlive);

const sessionByEpochAtom = Atom.family((_epoch: number) =>
  BerniseRpc.runtime.atom((get) =>
    Effect.gen(function* () {
      const client = yield* BerniseRpc;
      const started = yield* client("StartSession", {
        ...optionalModelPayload(get.once(settingsAtom).codex.model),
      });
      const fiber = yield* Effect.forkChild(
        Stream.runForEach(client("SubscribeEvents", { sessionId: started.sessionId }), (event) =>
          Effect.sync(() => {
            get.set(chatAtom, applyProviderEvent(get.once(chatAtom), event, crypto.randomUUID()));
          }),
        ),
        { startImmediately: true },
      );
      get.set(chatAtom, { ...get.once(chatAtom), sessionId: started.sessionId });
      yield* Fiber.join(fiber);
    }).pipe(
      Effect.catchCause((cause) => {
        if (!Cause.hasInterruptsOnly(cause)) {
          const chat = get.once(chatAtom);
          if (chat.sessionId !== undefined) {
            get.set(
              chatAtom,
              appendError(chat, formatError(Cause.squash(cause)), crypto.randomUUID()),
            );
          }
        }
        return Effect.failCause(cause);
      }),
    ),
  ),
);

export const sessionAtom = Atom.make((get) => {
  const epoch = get(sessionEpochAtom);
  return get(sessionByEpochAtom(epoch));
}).pipe(Atom.keepAlive);

const readChat = (get: { readonly registry: AtomRegistry.AtomRegistry }): ChatState =>
  get.registry.get(chatAtom);

const optionalModelPayload = (model: string): { readonly model?: string } => {
  const trimmed = model.trim();
  return trimmed.length > 0 ? { model: trimmed } : {};
};

export const speakAtom = BerniseRpc.runtime.fn((prompt: string, get) =>
  Effect.gen(function* () {
    const text = prompt.trim();
    if (text.length === 0) {
      return;
    }
    get.set(chatAtom, appendUser(readChat(get), text, crypto.randomUUID()));
    get.mount(sessionAtom);
    const sessionId = yield* Effect.callback<SessionId, unknown>((resume) => {
      let settled = false;
      let cancelId = () => {};
      let cancelSession = () => {};
      const finish = (effect: Effect.Effect<SessionId, unknown>) => {
        if (settled) {
          return;
        }
        settled = true;
        cancelId();
        cancelSession();
        resume(effect);
      };
      cancelSession = get.registry.subscribe(
        sessionAtom,
        (result) => {
          if (AsyncResult.isFailure(result)) {
            finish(Effect.failCause(result.cause));
          }
        },
        { immediate: true },
      );
      cancelId = get.registry.subscribe(
        sessionIdAtom,
        (id) => {
          if (id !== undefined) {
            finish(Effect.succeed(id));
          }
        },
        { immediate: true },
      );
      return Effect.sync(() => {
        if (!settled) {
          cancelId();
          cancelSession();
        }
      });
    });
    const client = yield* BerniseRpc;
    const result = yield* client("SendTurn", {
      sessionId,
      prompt: text,
      ...optionalModelPayload(get.registry.get(settingsAtom).codex.model),
    });
    const chat = readChat(get);
    if (chat.assistantId === undefined) {
      get.set(
        chatAtom,
        appendError(chat, noReplyMessage(stopReasonFromTurn(result)), crypto.randomUUID()),
      );
    }
  }).pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.void;
      }
      return Effect.sync(() => {
        get.set(
          chatAtom,
          appendError(readChat(get), formatError(Cause.squash(cause)), crypto.randomUUID()),
        );
      });
    }),
  ),
);
