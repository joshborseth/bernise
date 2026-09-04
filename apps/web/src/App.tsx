import { type WorkspaceInfo } from "@bernise/contracts";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { BerniseMascot, deriveBerniseMood } from "./mascot/index.ts";
import { PersonaConfig } from "./components/PersonaConfig.tsx";
import { ThreadSidebar } from "./components/ThreadSidebar.tsx";
import {
  formatError,
  holdingReplyAtom,
  speakAtom,
  speakKeyAtom,
  visibleMessagesAtom,
} from "./chat.ts";
import { activeThreadTitleAtom, bootThreadsAtom, composerFocusNonceAtom } from "./threads.ts";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";
import {
  bootSettingsAtom,
  composerModelView,
  modelsResultAtom,
  settingsAtom,
  updateSettingsAtom,
} from "./settings.ts";
import { speakingAtom } from "./voice/state.ts";
import { useBerniseVoice } from "./voice/useVoice.ts";
import { displayWorkspacePath, workspaceAtom } from "./workspace.ts";

const devFpsStorageKey = "bernise.devFps";

const readDevFps = (): boolean => {
  if (!import.meta.env.DEV) {
    return false;
  }
  try {
    return globalThis.localStorage?.getItem(devFpsStorageKey) !== "0";
  } catch {
    return true;
  }
};

const writeDevFps = (on: boolean): void => {
  try {
    globalThis.localStorage?.setItem(devFpsStorageKey, on ? "1" : "0");
  } catch {
    // Quota or private mode — preference still lives in memory.
  }
};

const threadPaneClass = "thread-pane flex h-full min-h-0 flex-col px-4 pt-7 pb-[1.15rem]";

export function App() {
  useAtomValue(bootSettingsAtom);
  useAtomValue(bootThreadsAtom);
  useAtomValue(modelsResultAtom);
  useAtomValue(updateSettingsAtom);

  return (
    <SidebarProvider className="relative z-1 h-dvh min-h-0 overflow-hidden">
      <ChatWorkspace />
    </SidebarProvider>
  );
}

function ChatWorkspace() {
  const [personaOpen, setPersonaOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const visibleMessages = useAtomValue(visibleMessagesAtom);
  const speakKey = useAtomValue(speakKeyAtom);
  const threadTitle = useAtomValue(activeThreadTitleAtom);
  const workspace = useAtomValue(workspaceAtom);
  const [speakResult, speak] = useAtom(speakAtom);
  const voicing = useAtomValue(speakingAtom);
  const holdingReply = useAtomValue(holdingReplyAtom);
  useBerniseVoice();
  const settings = useAtomValue(settingsAtom);
  const modelsResult = useAtomValue(modelsResultAtom);
  const modelView = composerModelView(modelsResult, settings.codex.model);
  const [, updateSettings] = useAtom(updateSettingsAtom);
  const pending = AsyncResult.isWaiting(speakResult);
  const waitingOnVoice = pending || holdingReply;
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
    pending: waitingOnVoice,
    voicing,
  });
  const canSpeak = draft.trim().length > 0 && !pending;
  const [showFps, setShowFps] = useState(readDevFps);
  const fpsParentRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const composerFocusNonce = useAtomValue(composerFocusNonceAtom);

  useEffect(() => {
    if (composerFocusNonce === 0) {
      return;
    }
    composerRef.current?.focus();
  }, [composerFocusNonce]);

  const onSpeak = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0 || pending) {
      return;
    }
    setDraft("");
    speak(text);
  };

  const fpsButton = import.meta.env.DEV ? (
    <Button
      type="button"
      variant={showFps ? "default" : "outline"}
      size="lg"
      className="rounded-full"
      aria-pressed={showFps}
      aria-label={showFps ? "Hide FPS counter" : "Show FPS counter"}
      onClick={() => {
        const next = !showFps;
        setShowFps(next);
        writeDevFps(next);
      }}
    >
      FPS
    </Button>
  ) : null;

  const mascot = (
    <aside className="mascot-slot relative flex h-full min-h-0 flex-col items-center justify-end overflow-hidden pb-12">
      {import.meta.env.DEV ? (
        <div ref={fpsParentRef} className="dev-fps-counter" aria-hidden={!showFps} />
      ) : null}
      <BerniseMascot
        mood={mood}
        speakKey={speakKey}
        showFps={showFps}
        fpsParentRef={fpsParentRef as RefObject<HTMLElement>}
      />
    </aside>
  );

  const thread = (
    <section className={threadPaneClass}>
      <header className="mb-1.5 flex flex-none items-start gap-4">
        <div className="min-w-0">
          <p className="m-0 text-[0.72rem] tracking-[0.16em] text-muted-foreground uppercase">
            {threadTitle}
          </p>
          <StationPlaque workspace={workspace} />
        </div>
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
        {waitingOnVoice ? (
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
            ref={composerRef}
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

  const station = (
    <div className="relative h-full min-h-0">
      <ResizablePanelGroup
        id="bernise-station"
        orientation="horizontal"
        className="h-full"
        disableCursor
        disabled
        resizeTargetMinimumSize={{ coarse: 0, fine: 0 }}
      >
        <ResizablePanel
          id="bernise"
          defaultSize="42%"
          minSize="12rem"
          className="h-full min-h-0 overflow-hidden"
        >
          {mascot}
        </ResizablePanel>
        <ResizablePanel
          id="thread"
          defaultSize="58%"
          minSize="58%"
          maxSize="58%"
          className="h-full min-h-0 min-w-0 overflow-hidden"
        >
          {thread}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );

  const shell = (
    <ResizablePanelGroup
      id="bernise-shell"
      orientation="horizontal"
      className="h-full"
      disableCursor
      disabled
      resizeTargetMinimumSize={{ coarse: 0, fine: 0 }}
    >
      <ResizablePanel
        id="threads"
        defaultSize="24%"
        minSize="24%"
        maxSize="24%"
        className="h-full min-h-0 min-w-0 overflow-hidden"
      >
        <ThreadSidebar
          onOpenPersona={() => setPersonaOpen(true)}
          footerExtra={fpsButton}
        />
      </ResizablePanel>
      <ResizablePanel
        id="station"
        defaultSize="76%"
        minSize="64%"
        className="h-full min-h-0 min-w-0"
      >
        {station}
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden bg-transparent">
      {shell}
      <PersonaConfig open={personaOpen} onOpenChange={setPersonaOpen} />
    </SidebarInset>
  );
}

function StationPlaque({ workspace }: { readonly workspace: WorkspaceInfo }) {
  if (workspace.path.length === 0) {
    return null;
  }
  const displayPath = displayWorkspacePath(workspace.path);
  return (
    <p
      className="m-0 mt-0.5 flex min-w-0 items-baseline gap-1.5 text-[0.72rem] leading-[1.35]"
      title={workspace.path}
    >
      <span className="shrink-0 tracking-[0.02em]">
        <span className="text-muted-foreground">in </span>
        <span className="text-[color-mix(in_srgb,var(--peach-deep)_82%,var(--ink))]">
          {workspace.name}
        </span>
      </span>
      <span className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap text-muted-foreground [direction:rtl]">
        <bdi>{displayPath}</bdi>
      </span>
    </p>
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
