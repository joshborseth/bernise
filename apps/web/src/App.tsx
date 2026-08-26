import { BerniseRpcs, HealthStatus, type Pong } from "@bernise/contracts";
import { BrowserSocket } from "@effect/platform-browser";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import * as Context from "effect/Context";
import { RpcClient, RpcGroup, RpcSerialization } from "effect/unstable/rpc";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import { useEffect, useState, type FormEvent } from "react";
import { BerniseMascot } from "./BerniseMascot.tsx";
import { deriveBerniseMood } from "./mascot/mood.ts";

class BerniseClient extends Context.Service<
  BerniseClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof BerniseRpcs>, RpcClientError>
>()("@bernise/BerniseClient") {
  static readonly layer = Layer.effect(BerniseClient)(RpcClient.make(BerniseRpcs));
}

class HealthRequestError extends Schema.TaggedError<HealthRequestError>()("HealthRequestError", {
  cause: Schema.Unknown,
}) {}

const rpcUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/rpc`;

const ClientLive = BerniseClient.layer.pipe(
  Layer.provide(RpcClient.layerProtocolSocket()),
  Layer.provide(BrowserSocket.layerWebSocket(rpcUrl)),
  Layer.provide(RpcSerialization.layerNdjson),
);

type ProbeState =
  | { readonly status: "checking" }
  | { readonly status: "ok"; readonly health: HealthStatus; readonly pong: Pong }
  | { readonly status: "error"; readonly message: string };

type ChatMessage =
  | { readonly id: string; readonly from: "bernise"; readonly text: string }
  | { readonly id: string; readonly from: "user"; readonly text: string };

const opening: ChatMessage = {
  id: "opening",
  from: "bernise",
  text: "What are we building, and why this way?",
};

const loadStatus = Effect.gen(function* () {
  const raw = yield* Effect.tryPromise({
    try: async () => {
      const response = await fetch("/health");
      if (!response.ok) {
        throw `health ${response.status}`;
      }
      return response.json() as Promise<unknown>;
    },
    catch: (cause) => new HealthRequestError({ cause }),
  });
  const health = yield* Schema.decodeUnknownEffect(HealthStatus)(raw);
  const client = yield* BerniseClient;
  const pong = yield* client.Ping();
  return { health, pong } as const;
});

function probeLabel(state: ProbeState): string {
  if (state.status === "checking") {
    return "waiting for health + ping";
  }
  if (state.status === "ok") {
    return `${state.health.service} · ping`;
  }
  return state.message;
}

export function App() {
  const [state, setState] = useState<ProbeState>({ status: "checking" });
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([opening]);
  const [draft, setDraft] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);

  useEffect(() => {
    const runtime = ManagedRuntime.make(ClientLive);
    void runtime.runPromise(loadStatus).then(
      ({ health, pong }) => {
        setState({ status: "ok", health, pong });
      },
      (error: unknown) => {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "probe failed",
        });
      },
    );
    return () => {
      void runtime.dispose();
    };
  }, []);

  const berniseLine = messages.find((message) => message.from === "bernise") ?? opening;
  const userLines = messages.filter((message) => message.from === "user");
  const lastMessage = messages[messages.length - 1] ?? opening;
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
      <header className="mast">
        <h1>Bernise</h1>
        <p className="eyebrow">control surface</p>
        <div className="probe" aria-live="polite">
          <span className={`lamp lamp-${state.status}`} />
          <span className="probe-label">{probeLabel(state)}</span>
        </div>
      </header>

      <section className="stage">
        <BerniseMascot mood={mood} speakKey={berniseLine.id} />
        <blockquote className="speech">
          <p>{berniseLine.text}</p>
          <cite>Bernise</cite>
        </blockquote>
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
