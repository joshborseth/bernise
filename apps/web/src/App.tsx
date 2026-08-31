import { type ProviderSnapshot } from "@bernise/contracts";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useState, type FormEvent } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { BerniseMascot, deriveBerniseMood } from "./mascot/index.ts";
import {
  bootThreadAtom,
  formatError,
  speakAtom,
  speakKeyAtom,
  visibleMessagesAtom,
} from "./chat.ts";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
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
import { speakingAtom } from "./voice/state.ts";
import { useBerniseVoice } from "./voice/useVoice.ts";

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

const shellClass =
  "relative z-1 mx-auto flex min-h-dvh max-w-[52rem] flex-col px-[1.35rem] pt-7 pb-[1.15rem]";

const stationHandleClass =
  "w-2.5 border-x border-[color-mix(in_srgb,var(--ink)_10%,var(--line))] bg-[color-mix(in_srgb,var(--peach)_38%,var(--bg-wash))] hover:bg-[color-mix(in_srgb,var(--peach)_62%,var(--bg-wash))] focus-visible:ring-[color-mix(in_srgb,var(--peach-deep)_70%,var(--ring))]";

const threadPaneClass =
  "flex min-h-0 flex-col px-[1.35rem] pt-7 pb-[1.15rem] lg:h-full lg:bg-[color-mix(in_srgb,var(--bg-elev)_88%,transparent)] lg:shadow-[-20px_0_36px_color-mix(in_srgb,var(--ink)_7%,transparent)]";

function useMinWidth(px: number): boolean {
  const query = `(min-width: ${String(px)}px)`;
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => {
      setMatches(media.matches);
    };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [query]);

  return matches;
}

export function App() {
  const [view, setView] = useState<"chat" | "settings">("chat");
  useAtomValue(bootSettingsAtom);
  useAtomValue(bootThreadAtom);
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
  const voicing = useAtomValue(speakingAtom);
  useBerniseVoice();
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
    voicing,
  });
  const canSpeak = draft.trim().length > 0 && !pending;
  const wide = useMinWidth(1024);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "bernise-station",
    onlySaveAfterUserInteractions: true,
    panelIds: ["bernise", "thread"],
    storage: window.localStorage,
  });

  const onSpeak = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0 || pending) {
      return;
    }
    setDraft("");
    speak(text);
  };

  const mascot = (
    <aside
      className={
        wide
          ? "mascot-slot grid h-full min-h-0 content-center justify-items-center"
          : "grid content-center justify-items-center px-[1.15rem] pt-6 pb-2"
      }
    >
      <BerniseMascot mood={mood} speakKey={speakKey} />
    </aside>
  );

  const thread = (
    <section className={cn(threadPaneClass, wide ? undefined : "min-h-0")}>
      <header className="mb-1.5 flex flex-none items-baseline justify-between gap-4">
        <p className="m-0 text-[0.72rem] tracking-[0.16em] text-muted-foreground uppercase">
          station
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={onOpenSettings}
        >
          Config
        </Button>
      </header>

      <div
        className="grid flex-1 content-start gap-[0.7rem] overflow-y-auto px-[0.15rem] py-1 pb-2 empty:hidden"
        aria-live="polite"
      >
        {visibleMessages.map((message) =>
          message.from === "user" ? (
            <article key={message.id} className={userBubbleClass}>
              <p className="m-0 text-[0.92rem] leading-[1.45]">{message.text}</p>
            </article>
          ) : message.from === "assistant" ? (
            <article key={message.id} className={assistantBubbleClass}>
              <p className="m-0 text-[0.92rem] leading-[1.45] whitespace-pre-wrap">
                {message.text}
              </p>
            </article>
          ) : (
            <article key={message.id} className={errorBubbleClass} role="alert">
              <p className="m-0 text-[0.86rem] leading-[1.45]">{message.text}</p>
            </article>
          ),
        )}
        {pending ? (
          <article className={statusBubbleClass} aria-live="polite">
            <p className="m-0 text-[0.82rem] leading-[1.45]">Bernise is thinking…</p>
          </article>
        ) : null}
      </div>

      <form
        className="sticky bottom-[0.85rem] z-2 mt-auto grid flex-none gap-[0.15rem] rounded-[1.35rem] border border-border bg-card p-[0.45rem] pb-[0.4rem] shadow-[0_10px_24px_color-mix(in_srgb,var(--ink)_6%,transparent)] has-[input:focus]:border-[color-mix(in_srgb,var(--peach-deep)_55%,var(--line))] has-[input:focus]:shadow-[0_10px_24px_color-mix(in_srgb,var(--ink)_6%,transparent),0_0_0_3px_color-mix(in_srgb,var(--peach)_45%,transparent)]"
        onSubmit={onSpeak}
      >
        <div className="grid grid-cols-[1fr_auto] gap-2.5">
          <Input
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
            className="h-auto border-0 bg-transparent px-[0.85rem] py-[0.7rem] shadow-none md:text-[0.92rem] focus-visible:border-transparent focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="lg"
            className="self-center tracking-[0.04em]"
            disabled={!canSpeak}
          >
            {pending ? "Thinking…" : "Speak"}
          </Button>
        </div>
        {modelView.kind === "error" ? (
          <p
            className="m-0 justify-self-start px-[0.55rem] py-[0.1rem] text-[0.72rem] leading-[1.4] tracking-[0.02em] text-destructive"
            role="alert"
          >
            {formatError(modelView.error)}
          </p>
        ) : modelView.kind === "select" ? (
          <div className="justify-self-start px-[0.35rem]">
            <Select
              value={modelView.value}
              disabled={pending || modelsWaiting}
              items={modelView.options.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
              onValueChange={(value) => {
                if (value === null) {
                  return;
                }
                updateSettings({ codex: { model: value } });
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label="Model"
                className="rounded-full border-0 bg-transparent text-muted-foreground shadow-none hover:bg-[color-mix(in_srgb,var(--peach)_32%,transparent)] hover:text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {modelView.options.map((option) => (
                  <SelectItem key={option.id || "codex-default"} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </form>
    </section>
  );

  if (!wide) {
    return (
      <main className="relative z-1 grid min-h-dvh grid-cols-1">
        {mascot}
        {thread}
      </main>
    );
  }

  return (
    <main className="relative z-1 h-dvh overflow-hidden">
      <ResizablePanelGroup
        id="bernise-station"
        orientation="horizontal"
        className="h-full"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <ResizablePanel
          id="bernise"
          defaultSize="42%"
          minSize="28%"
          maxSize="62%"
          className="h-full min-h-0"
        >
          {mascot}
        </ResizablePanel>
        <ResizableHandle withHandle className={stationHandleClass} />
        <ResizablePanel id="thread" defaultSize="58%" minSize="38%" className="h-full min-h-0">
          {thread}
        </ResizablePanel>
      </ResizablePanelGroup>
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
    <main className={cn(shellClass, "gap-4")}>
      <header className="mb-1.5 flex items-baseline justify-between gap-4">
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onBack}>
          Back to grill
        </Button>
        <h1 className="m-0 text-[1.05rem] font-medium tracking-[0.04em]">Provider bay</h1>
      </header>
      <p className="m-0 text-[0.88rem] leading-normal text-muted-foreground">
        Bernise finds the local Codex CLI on PATH. Leave Binary path blank unless PATH is not
        enough, run <code className="text-foreground">codex login</code>, then Check connections.
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
      <Button
        type="button"
        size="lg"
        className="justify-self-start tracking-[0.04em]"
        disabled={probing}
        onClick={() => {
          refresh();
        }}
      >
        {probing ? "Checking…" : "Check connections"}
      </Button>
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
    <Card className="rounded-[1.2rem] shadow-[0_10px_22px_color-mix(in_srgb,var(--ink)_5%,transparent)] ring-border">
      <CardHeader>
        <CardTitle className="text-[0.95rem] font-medium">Codex</CardTitle>
        <CardAction>
          <Badge variant={statusBadgeVariant(snapshot)} className={statusBadgeClass(snapshot)}>
            {statusLabel(snapshot)}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <dl className="mb-1 grid grid-cols-2 gap-x-3 gap-y-[0.45rem]">
          <div>
            <dt className="text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">
              Auth
            </dt>
            <dd className="mt-[0.15rem] ml-0 text-[0.82rem]">{snapshot.auth}</dd>
          </div>
          <div>
            <dt className="text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">
              Version
            </dt>
            <dd className="mt-[0.15rem] ml-0 text-[0.82rem]">{snapshot.version ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">
              Last checked
            </dt>
            <dd className="mt-[0.15rem] ml-0 text-[0.82rem]">
              {snapshot.checkedAt.length > 0 ? new Date(snapshot.checkedAt).toLocaleString() : "—"}
            </dd>
          </div>
        </dl>
        <div className="grid gap-1.5">
          <Label htmlFor="codex-binary-path" className="tracking-[0.04em] text-muted-foreground">
            Binary path
          </Label>
          <Input
            id="codex-binary-path"
            value={binaryPath}
            placeholder="codex"
            disabled={probing}
            onChange={(event) => {
              onBinaryPath(event.target.value);
            }}
          />
          <p className="text-[0.72rem] leading-[1.45] tracking-normal text-muted-foreground">
            Leave blank to use <code className="text-foreground">codex</code> on PATH. Set this only
            when PATH cannot find the CLI.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="codex-home-path" className="tracking-[0.04em] text-muted-foreground">
            CODEX_HOME path
          </Label>
          <Input
            id="codex-home-path"
            value={homePath}
            placeholder="~/.codex"
            disabled={probing}
            onChange={(event) => {
              onHomePath(event.target.value);
            }}
          />
        </div>
        <p className="m-0 text-[0.78rem] leading-[1.45] text-muted-foreground">
          Login with <code className="text-foreground">codex login</code> on the machine running the
          Bernise server.
        </p>
        <p className="m-0 text-[0.78rem] leading-[1.45] text-muted-foreground">
          {snapshot.message}
        </p>
      </CardContent>
    </Card>
  );
}

const bubbleMotion = "animate-bubble-in motion-reduce:animate-none";

const userBubbleClass = cn(
  bubbleMotion,
  "justify-self-end max-w-[min(28rem,86%)] rounded-[1.35rem_1.35rem_0.4rem_1.35rem] border border-[color-mix(in_srgb,var(--sky-deep)_42%,var(--line))] bg-[color-mix(in_srgb,var(--sky)_82%,white)] px-[0.95rem] py-3 shadow-[0_8px_18px_color-mix(in_srgb,var(--sky-deep)_16%,transparent)]",
);

const assistantBubbleClass = cn(
  bubbleMotion,
  "justify-self-start max-w-[min(28rem,86%)] rounded-[1.35rem_1.35rem_1.35rem_0.4rem] border border-[color-mix(in_srgb,var(--peach-deep)_42%,var(--line))] bg-[color-mix(in_srgb,var(--peach)_78%,white)] px-[0.95rem] py-3 shadow-[0_8px_18px_color-mix(in_srgb,var(--peach-deep)_16%,transparent)]",
);

const errorBubbleClass = cn(
  bubbleMotion,
  "justify-self-center max-w-[min(32rem,92%)] rounded-2xl border border-[color-mix(in_srgb,var(--rose)_55%,var(--line))] bg-[color-mix(in_srgb,var(--rose)_28%,white)] px-[0.9rem] py-[0.7rem]",
);

const statusBubbleClass = cn(
  "justify-self-center max-w-[min(32rem,92%)] rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--muted)_45%,var(--line))] bg-[color-mix(in_srgb,var(--bg-wash)_70%,white)] px-[0.85rem] py-[0.55rem] text-muted-foreground",
);

const statusBadgeVariant = (snapshot: ProviderSnapshot) => {
  if (snapshot.status === "error") {
    return "destructive" as const;
  }
  if (snapshot.status === "ready") {
    return "outline" as const;
  }
  return "secondary" as const;
};

const statusBadgeClass = (snapshot: ProviderSnapshot) => {
  if (snapshot.status === "ready") {
    return "border-transparent bg-[color-mix(in_srgb,var(--sky)_50%,white)] text-foreground uppercase tracking-[0.08em]";
  }
  return "uppercase tracking-[0.08em]";
};
