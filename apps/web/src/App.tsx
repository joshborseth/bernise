import { type ProviderSnapshot } from "@bernise/contracts";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { useState, useEffect, type FormEvent } from "react";
import { formatError, speakAtom, speakKeyAtom, visibleMessagesAtom } from "./chat.ts";
import { BerniseMascot } from "./BerniseMascot.tsx";
import { deriveBerniseMood } from "./mascot/mood.ts";
import {
  bootSettingsAtom,
  composerModelView,
  modelsResultAtom,
  refreshProvidersAtom,
  settingsAtom,
  settingsBusyAtom,
  snapshotsAtom,
  updateSettingsAtom,
} from "./settings.ts";

const statusLabel = (snapshot: ProviderSnapshot): string => {
  if (!snapshot.enabled) {
    return "off";
  }
  if (snapshot.status === "ready") {
    return "ready";
  }
  if (snapshot.status === "warning") {
    return "pending";
  }
  return "fault";
};

export function App() {
  const [view, setView] = useState<"chat" | "settings">("chat");
  useAtomValue(bootSettingsAtom);
  useAtomValue(modelsResultAtom);

  return view === "settings" ? (
    <SettingsView onBack={() => setView("chat")} />
  ) : (
    <ChatView onOpenSettings={() => setView("settings")} />
  );
}

function ChatView({ onOpenSettings }: { readonly onOpenSettings: () => void }) {
  const [draft, setDraft] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const visibleMessages = useAtomValue(visibleMessagesAtom);
  const speakKey = useAtomValue(speakKeyAtom);
  const [speakResult, speak] = useAtom(speakAtom);
  const settings = useAtomValue(settingsAtom);
  const modelsResult = useAtomValue(modelsResultAtom);
  const modelView = composerModelView(modelsResult, settings.codex.model);
  const [, updateSettings] = useAtom(updateSettingsAtom);
  const pending = AsyncResult.isWaiting(speakResult);
  const modelsWaiting = AsyncResult.isWaiting(modelsResult);

  const resolvedModel = modelView.kind === "select" ? modelView.value : undefined;

  useEffect(() => {
    if (resolvedModel === undefined || resolvedModel === settings.codex.model) {
      return;
    }
    updateSettings({ codex: { model: resolvedModel } });
  }, [resolvedModel, settings.codex.model, updateSettings]);

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
      <header className="topbar">
        <p className="topbar-kicker">station</p>
        <button type="button" className="icon-button" onClick={onOpenSettings}>
          Config
        </button>
      </header>

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
        <div className="composer-row">
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
        </div>
        <div className="composer-meta">
          {modelView.kind === "error" ? (
            <p className="composer-model-error" role="alert">
              {formatError(modelView.error)}
            </p>
          ) : modelView.kind === "select" ? (
            <label className="composer-model">
              <span className="sr-only">Model</span>
              <select
                value={modelView.value}
                disabled={pending || modelsWaiting}
                onChange={(event) => {
                  updateSettings({ codex: { model: event.target.value } });
                }}
              >
                {modelView.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </form>
    </main>
  );
}

function SettingsView({ onBack }: { readonly onBack: () => void }) {
  const settings = useAtomValue(settingsAtom);
  const snapshots = useAtomValue(snapshotsAtom);
  const busy = useAtomValue(settingsBusyAtom);
  const [refreshResult, refresh] = useAtom(refreshProvidersAtom);
  const [, updateSettings] = useAtom(updateSettingsAtom);
  const probing = busy || AsyncResult.isWaiting(refreshResult);

  return (
    <main className="shell settings-shell">
      <header className="topbar">
        <button type="button" className="text-button" onClick={onBack}>
          Back to grill
        </button>
        <h1>Provider bay</h1>
      </header>
      <p className="settings-lede">
        Bernise finds the local Codex CLI on PATH. Leave Binary path blank unless PATH is not
        enough, run <code>codex login</code>, then Check connections.
      </p>
      <ProviderCard
        snapshot={snapshots.codex}
        binaryPath={settings.codex.binaryPath}
        homePath={settings.codex.homePath}
        probing={probing}
        onBinaryPath={(binaryPath) => {
          updateSettings({ codex: { binaryPath } });
        }}
        onHomePath={(homePath) => {
          updateSettings({ codex: { homePath } });
        }}
      />
      <button
        type="button"
        className="check-button"
        disabled={probing}
        onClick={() => {
          refresh();
        }}
      >
        {probing ? "Checking…" : "Check connections"}
      </button>
    </main>
  );
}

function ProviderCard({
  snapshot,
  binaryPath,
  homePath,
  probing,
  onBinaryPath,
  onHomePath,
}: {
  readonly snapshot: ProviderSnapshot;
  readonly binaryPath: string;
  readonly homePath: string;
  readonly probing: boolean;
  readonly onBinaryPath: (value: string) => void;
  readonly onHomePath: (value: string) => void;
}) {
  return (
    <article className={`provider-card status-${snapshot.status}`}>
      <header>
        <h2>Codex</h2>
        <span className="status-pill">{statusLabel(snapshot)}</span>
      </header>
      <dl>
        <div>
          <dt>Auth</dt>
          <dd>{snapshot.auth}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{snapshot.version ?? "—"}</dd>
        </div>
        <div>
          <dt>Last checked</dt>
          <dd>
            {snapshot.checkedAt.length > 0 ? new Date(snapshot.checkedAt).toLocaleString() : "—"}
          </dd>
        </div>
      </dl>
      <label>
        Binary path
        <input
          value={binaryPath}
          placeholder="codex"
          disabled={probing}
          onChange={(event) => {
            onBinaryPath(event.target.value);
          }}
        />
        <span className="field-hint">
          Leave blank to use <code>codex</code> on PATH. Set this only when PATH cannot find the
          CLI.
        </span>
      </label>
      <label>
        CODEX_HOME path
        <input
          value={homePath}
          placeholder="~/.codex"
          disabled={probing}
          onChange={(event) => {
            onHomePath(event.target.value);
          }}
        />
      </label>
      <p className="login-hint">
        Login with <code>codex login</code> on the machine running the Bernise server.
      </p>
      <p className="probe-message">{snapshot.message}</p>
    </article>
  );
}
