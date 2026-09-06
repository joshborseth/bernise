import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { BerniseMascot, deriveBerniseMood } from "./mascot/index.ts";
import { ChatMarkdown } from "./components/ChatMarkdown.tsx";
import { PersonaConfig } from "./components/PersonaConfig.tsx";
import { ProjectLauncher } from "./components/ProjectLauncher.tsx";
import { ThreadStrip } from "./components/ThreadStrip.tsx";
import { WorkspacePane } from "./components/WorkspacePane.tsx";
import { FilePreviewPanel } from "./files/FilePreviewPanel.tsx";
import {
  activeThreadIdAtom,
  formatError,
  holdingReplyAtom,
  speakAtom,
  speakKeyAtom,
  visibleMessagesAtom,
} from "./chat.ts";
import { bootThreadsAtom, composerFocusNonceAtom } from "./threads.ts";
import { useStickToBottom } from "./hooks/use-stick-to-bottom.ts";
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
import { ListenToggle } from "./listen/ListenToggle.tsx";
import { useListen } from "./listen/useListen.ts";
import { speakingAtom } from "./voice/state.ts";
import { useBerniseVoice } from "./voice/useVoice.ts";
import { useThreadHotkeys } from "./hooks/use-thread-hotkeys.ts";
import {
  desktopBridge,
  type BerniseDesktopBridge,
  type DesktopLaunchState,
  type OpenProjectResult,
  type RecentProject,
} from "./desktop.ts";
import { activeWorkspaceEntryAtom, isOpenWorkspaceFilePath, workspaceAtom } from "./workspace.ts";

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

const threadPaneClass = "thread-pane flex h-full min-h-0 flex-col px-4 pt-4 pb-[1.15rem]";

export function App() {
  const bridge = desktopBridge();
  return bridge === undefined ? <WorkspaceApp /> : <DesktopApp bridge={bridge} />;
}

type DesktopAppState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "launcher";
      readonly activeProject: RecentProject | null;
      readonly recentProjects: ReadonlyArray<RecentProject>;
      readonly error?: string;
    }
  | { readonly kind: "ready"; readonly project: RecentProject };

function DesktopApp({ bridge }: { readonly bridge: BerniseDesktopBridge }) {
  const [state, setState] = useState<DesktopAppState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void bridge.getLaunchState().then(
      (launchState) => {
        setState(
          launchState.activeProject === null
            ? { kind: "launcher", ...launchState }
            : { kind: "ready", project: launchState.activeProject },
        );
      },
      (cause: unknown) => {
        setState({
          kind: "launcher",
          activeProject: null,
          recentProjects: [],
          error: formatError(cause),
        });
      },
    );
  }, [bridge]);

  const applyOpenResult = (result: OpenProjectResult, previous: DesktopLaunchState) => {
    setBusy(false);
    if (result.status === "cancelled") {
      return;
    }
    if (result.status === "error") {
      setState({ kind: "launcher", ...previous, error: result.message });
      return;
    }
    if (previous.activeProject !== null) {
      window.location.reload();
      return;
    }
    setState({ kind: "ready", project: result.project });
  };

  const openProject = (path?: string) => {
    if (state.kind !== "launcher" || busy) {
      return;
    }
    const previous: DesktopLaunchState = {
      activeProject: state.activeProject,
      recentProjects: state.recentProjects,
    };
    setBusy(true);
    const operation = path === undefined ? bridge.browseProject() : bridge.openProject(path);
    void operation.then(
      (result) => {
        applyOpenResult(result, previous);
      },
      (cause: unknown) => {
        setBusy(false);
        setState({ kind: "launcher", ...previous, error: formatError(cause) });
      },
    );
  };

  if (state.kind === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">
        Preparing Bernise…
      </main>
    );
  }
  if (state.kind === "launcher") {
    const cancelProject = state.activeProject;
    return (
      <ProjectLauncher
        recentProjects={state.recentProjects}
        busy={busy}
        error={state.error}
        onBrowse={() => {
          openProject();
        }}
        onOpen={openProject}
        onCancel={
          cancelProject === null
            ? undefined
            : () => {
                setState({ kind: "ready", project: cancelProject });
              }
        }
      />
    );
  }
  return (
    <WorkspaceApp
      onOpenProject={() => {
        void bridge.getLaunchState().then(
          (launchState) => {
            setState({ kind: "launcher", ...launchState });
          },
          (cause: unknown) => {
            setState({
              kind: "launcher",
              activeProject: state.project,
              recentProjects: [state.project],
              error: formatError(cause),
            });
          },
        );
      }}
    />
  );
}

function WorkspaceApp({ onOpenProject }: { readonly onOpenProject?: (() => void) | undefined }) {
  useAtomValue(bootSettingsAtom);
  useAtomValue(bootThreadsAtom);
  useAtomValue(modelsResultAtom);
  useAtomValue(updateSettingsAtom);

  return (
    <SidebarProvider className="relative z-1 h-dvh min-h-0 overflow-hidden">
      <ChatWorkspace onOpenProject={onOpenProject} />
    </SidebarProvider>
  );
}

function ChatWorkspace({ onOpenProject }: { readonly onOpenProject?: (() => void) | undefined }) {
  const [personaOpen, setPersonaOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const visibleMessages = useAtomValue(visibleMessagesAtom);
  const speakKey = useAtomValue(speakKeyAtom);
  const activeThreadId = useAtomValue(activeThreadIdAtom);
  const [speakNonce, setSpeakNonce] = useState(0);
  const [speakResult, speak] = useAtom(speakAtom);
  const voicing = useAtomValue(speakingAtom);
  const holdingReply = useAtomValue(holdingReplyAtom);
  useBerniseVoice();
  useThreadHotkeys();
  const settings = useAtomValue(settingsAtom);
  const modelsResult = useAtomValue(modelsResultAtom);
  const modelView = composerModelView(modelsResult, settings.codex.model);
  const [, updateSettings] = useAtom(updateSettingsAtom);
  const pending = AsyncResult.isWaiting(speakResult);
  const waitingOnVoice = pending || holdingReply;
  const modelsWaiting = AsyncResult.isWaiting(modelsResult);
  const listen = useListen({
    busy: waitingOnVoice || voicing,
    speak,
  });

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
    speechActive: listen.speechActive,
    addressed: listen.addressed,
  });
  const canSpeak = draft.trim().length > 0 && !pending;
  const [showFps, setShowFps] = useState(readDevFps);
  const fpsParentRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const composerFocusNonce = useAtomValue(composerFocusNonceAtom);
  const workspace = useAtomValue(workspaceAtom);
  const [openFilePath, setOpenFilePath] = useAtom(activeWorkspaceEntryAtom);
  const fileOpen = isOpenWorkspaceFilePath(openFilePath);
  const lastVisible = visibleMessages.at(-1);
  useStickToBottom(transcriptRef, {
    contentKey: `${lastVisible?.id ?? ""}:${lastVisible?.text.length ?? 0}:${waitingOnVoice ? "1" : "0"}`,
    forceKey: `${activeThreadId ?? ""}:${speakNonce}`,
  });

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
    setSpeakNonce((nonce) => nonce + 1);
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
    <aside
      className={cn(
        "mascot-slot relative flex h-full min-h-0 flex-col items-center overflow-hidden",
        fileOpen ? "mascot-slot-compact justify-center pb-2" : "justify-end pb-12",
      )}
    >
      {import.meta.env.DEV ? (
        <div ref={fpsParentRef} className="dev-fps-counter" aria-hidden={!showFps} />
      ) : null}
      <BerniseMascot
        mood={mood}
        speakKey={speakKey}
        showFps={showFps}
        fpsParentRef={fpsParentRef as RefObject<HTMLElement>}
      />
      <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center">
        <ListenToggle
          status={listen.status}
          addressed={listen.addressed}
          onToggle={listen.toggleMuted}
        />
      </div>
    </aside>
  );

  const thread = (
    <section className={threadPaneClass}>
      <div
        ref={transcriptRef}
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
              <ChatMarkdown
                text={message.text}
                workspaceRoot={workspace.path}
                onOpenFile={(relativePath) => {
                  setOpenFilePath(relativePath);
                }}
              />
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
        className="sticky bottom-[0.85rem] z-2 mt-auto grid flex-none gap-[0.15rem] rounded-[1.35rem] border border-border bg-card p-[0.45rem] pb-[0.4rem] has-[input:focus]:border-[color-mix(in_srgb,var(--peach-deep)_55%,var(--line))]"
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
                className="rounded-full border-0 bg-transparent text-muted-foreground shadow-none hover:bg-[color-mix(in_srgb,var(--peach)_16%,transparent)] hover:text-foreground"
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
        key={fileOpen ? "station-file" : "station-idle"}
        id="bernise-station"
        orientation="horizontal"
        className="h-full"
        disableCursor
        disabled
        resizeTargetMinimumSize={{ coarse: 0, fine: 0 }}
      >
        <ResizablePanel
          id="bernise"
          defaultSize={fileOpen ? "12%" : "42%"}
          minSize={fileOpen ? "8rem" : "12rem"}
          maxSize={fileOpen ? "12%" : undefined}
          className="h-full min-h-0 overflow-hidden"
        >
          {mascot}
        </ResizablePanel>
        {fileOpen && openFilePath !== undefined ? (
          <ResizablePanel
            id="file"
            defaultSize="55%"
            minSize="24%"
            className="h-full min-h-0 min-w-0 overflow-hidden"
          >
            <FilePreviewPanel
              relativePath={openFilePath}
              onClose={() => {
                setOpenFilePath(undefined);
              }}
            />
          </ResizablePanel>
        ) : null}
        <ResizablePanel
          id="thread"
          defaultSize={fileOpen ? "33%" : "58%"}
          minSize={fileOpen ? "22%" : "58%"}
          maxSize={fileOpen ? "40%" : "58%"}
          className="h-full min-h-0 min-w-0 overflow-hidden"
        >
          {thread}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );

  const shell = (
    <ResizablePanelGroup
      key={fileOpen ? "shell-file" : "shell-idle"}
      id="bernise-shell"
      orientation="horizontal"
      className="h-full"
      disableCursor
      disabled
      resizeTargetMinimumSize={{ coarse: 0, fine: 0 }}
    >
      <ResizablePanel
        id="workspace"
        defaultSize={fileOpen ? "16%" : "24%"}
        minSize={fileOpen ? "16%" : "24%"}
        maxSize={fileOpen ? "16%" : "24%"}
        className="h-full min-h-0 min-w-0 overflow-hidden"
      >
        <WorkspacePane
          onOpenPersona={() => setPersonaOpen(true)}
          onOpenProject={onOpenProject}
          projectSwitchDisabled={pending}
          footerExtra={fpsButton}
        />
      </ResizablePanel>
      <ResizablePanel
        id="station"
        defaultSize={fileOpen ? "84%" : "76%"}
        minSize={fileOpen ? "70%" : "64%"}
        className="h-full min-h-0 min-w-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <ThreadStrip />
          <div className="min-h-0 flex-1">{station}</div>
        </div>
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

const bubbleMotion = "animate-bubble-in motion-reduce:animate-none";

const userBubbleClass = cn(
  bubbleMotion,
  "justify-self-end max-w-[min(28rem,86%)] rounded-[1.35rem_1.35rem_0.4rem_1.35rem] border border-[color-mix(in_srgb,var(--sky-deep)_42%,var(--line))] bg-[color-mix(in_srgb,var(--sky)_22%,var(--bg-elev))] px-[0.95rem] py-3",
);

const assistantBubbleClass = cn(
  bubbleMotion,
  "justify-self-start max-w-[min(28rem,86%)] rounded-[1.35rem_1.35rem_1.35rem_0.4rem] border border-[color-mix(in_srgb,var(--peach-deep)_42%,var(--line))] bg-[color-mix(in_srgb,var(--peach)_18%,var(--bg-elev))] px-[0.95rem] py-3",
);

const errorBubbleClass = cn(
  bubbleMotion,
  "justify-self-center max-w-[min(32rem,92%)] rounded-2xl border border-[color-mix(in_srgb,var(--rose)_55%,var(--line))] bg-[color-mix(in_srgb,var(--rose)_18%,var(--bg))] px-[0.9rem] py-[0.7rem]",
);

const statusBubbleClass = cn(
  "justify-self-center max-w-[min(32rem,92%)] rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--muted)_45%,var(--line))] bg-[color-mix(in_srgb,var(--bg-wash)_70%,var(--bg))] px-[0.85rem] py-[0.55rem] text-muted-foreground",
);
