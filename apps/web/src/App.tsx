import { useState, type FormEvent } from "react";
import { BerniseMascot } from "./BerniseMascot.tsx";
import { deriveBerniseMood } from "./mascot/mood.ts";

type ChatMessage =
  | { readonly id: string; readonly from: "bernise" }
  | { readonly id: string; readonly from: "user"; readonly text: string };

const opening: ChatMessage = {
  id: "opening",
  from: "bernise",
};

export function App() {
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([opening]);
  const [draft, setDraft] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);

  const lastMessage = messages[messages.length - 1] ?? opening;
  const userLines = messages.filter((message) => message.from === "user");
  const mood = deriveBerniseMood({
    composerFocused,
    lastFrom: lastMessage.from,
  });
  const canSpeak = draft.trim().length > 0;

  const onSpeak = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) {
      return;
    }
    setMessages((current) => [...current, { id: crypto.randomUUID(), from: "user", text }]);
    setDraft("");
  };

  return (
    <main className="shell">
      <section className="stage">
        <BerniseMascot mood={mood} speakKey={opening.id} />
      </section>

      <section className="thread" aria-live="polite">
        {userLines.map((message) => (
          <article key={message.id} className="user-bubble">
            <p>{message.text}</p>
          </article>
        ))}
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
        />
        <button type="submit" disabled={!canSpeak}>
          Speak
        </button>
      </form>
    </main>
  );
}
