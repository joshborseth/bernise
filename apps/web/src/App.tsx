import { ProviderError, type ProviderEvent, type SessionId } from "@bernise/contracts";
import { Effect, Fiber, Stream } from "effect";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BerniseMascot } from "./BerniseMascot.tsx";
import { deriveBerniseMood } from "./mascot/mood.ts";
import { berniseClient } from "./rpc.ts";

type ChatMessage =
  | { readonly id: string; readonly from: "bernise" }
  | { readonly id: string; readonly from: "user"; readonly text: string }
  | { readonly id: string; readonly from: "assistant"; readonly text: string }
  | { readonly id: string; readonly from: "error"; readonly text: string };

const opening: ChatMessage = {
  id: "opening",
  from: "bernise",
};

const formatError = (error: unknown): string => {
  if (error instanceof ProviderError) {
    return error.message;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
};

export function App() {
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([opening]);
  const [draft, setDraft] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const sessionRef = useRef<SessionId | undefined>(undefined);
  const subscribeFiberRef = useRef<Fiber.Fiber<void, unknown> | undefined>(undefined);
  const assistantIdRef = useRef<string | undefined>(undefined);

  useEffect(
    () => () => {
      const fiber = subscribeFiberRef.current;
      if (fiber !== undefined) {
        Effect.runFork(Fiber.interrupt(fiber));
      }
    },
    [],
  );

  const lastMessage = messages[messages.length - 1] ?? opening;
  const visibleMessages = messages.filter((message) => message.from !== "bernise");
  const mood = deriveBerniseMood({
    composerFocused,
    lastFrom: lastMessage.from === "user" ? "user" : "bernise",
  });
  const canSpeak = draft.trim().length > 0 && !pending;
  const lastAssistant = messages.reduce<ChatMessage | undefined>(
    (found, message) => (message.from === "assistant" ? message : found),
    undefined,
  );
  const speakKey = lastAssistant?.id ?? opening.id;

  const appendDelta = (event: ProviderEvent) => {
    if (event._tag !== "ProviderTurnDelta" || event.text.length === 0) {
      return;
    }
    setMessages((current) => {
      const assistantId = assistantIdRef.current;
      if (assistantId === undefined) {
        const id = crypto.randomUUID();
        assistantIdRef.current = id;
        return [...current, { id, from: "assistant", text: event.text }];
      }
      return current.map((message) =>
        message.id === assistantId && message.from === "assistant"
          ? { ...message, text: `${message.text}${event.text}` }
          : message,
      );
    });
  };

  const onSpeak = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0 || pending) {
      return;
    }
    assistantIdRef.current = undefined;
    setMessages((current) => [...current, { id: crypto.randomUUID(), from: "user", text }]);
    setDraft("");
    setPending(true);

    void Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* berniseClient;
        if (sessionRef.current === undefined) {
          const started = yield* client.StartSession({});
          sessionRef.current = started.sessionId;
          const fiber = yield* Effect.scoped(
            client.SubscribeEvents({ sessionId: started.sessionId }).pipe(
              Stream.runForEach((event) =>
                Effect.sync(() => {
                  appendDelta(event);
                }),
              ),
            ),
          ).pipe(Effect.forkDetach);
          subscribeFiberRef.current = fiber;
          yield* Effect.sleep("50 millis");
        }
        yield* client.SendTurn({ sessionId: sessionRef.current, prompt: text });
      }),
    )
      .catch((error: unknown) => {
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), from: "error", text: formatError(error) },
        ]);
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <main className="shell">
      <section className="stage">
        <BerniseMascot mood={mood} speakKey={speakKey} />
      </section>

      <section className="thread" aria-live="polite">
        {visibleMessages.map((message) =>
          message.from === "user" ? (
            <article key={message.id} className="user-bubble">
              <p>{message.text}</p>
            </article>
          ) : message.from === "assistant" ? (
            <article key={message.id} className="assistant-bubble">
              <p>{message.text}</p>
            </article>
          ) : (
            <article key={message.id} className="error-bubble" role="alert">
              <p>{message.text}</p>
            </article>
          ),
        )}
      </section>

      <form className="composer" onSubmit={onSpeak}>
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onFocus={() => {
            setComposerFocused(true);
          }}
          onBlur={() => {
            setComposerFocused(false);
          }}
          placeholder="Speak to Bernise…"
          aria-label="Speak to Bernise"
          autoComplete="off"
          disabled={pending}
        />
        <button type="submit" disabled={!canSpeak}>
          Speak
        </button>
      </form>
    </main>
  );
}
