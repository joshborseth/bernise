import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { useState, type FormEvent } from "react";
import { speakAtom, speakKeyAtom, visibleMessagesAtom } from "./chat.ts";
import { BerniseMascot } from "./BerniseMascot.tsx";
import { deriveBerniseMood } from "./mascot/mood.ts";

export function App() {
  const [draft, setDraft] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const visibleMessages = useAtomValue(visibleMessagesAtom);
  const speakKey = useAtomValue(speakKeyAtom);
  const [speakResult, speak] = useAtom(speakAtom);
  const pending = AsyncResult.isWaiting(speakResult);

  const mood = deriveBerniseMood({
    composerFocused,
    pending,
  });
  const canSpeak = draft.trim().length > 0 && !pending;

  const onSpeak = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0 || pending) {
      return;
    }
    setDraft("");
    speak(text);
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
        {pending ? (
          <article className="status-bubble" aria-live="polite">
            <p>Bernise is thinking…</p>
          </article>
        ) : null}
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
          {pending ? "Thinking…" : "Speak"}
        </button>
      </form>
    </main>
  );
}
