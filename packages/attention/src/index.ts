export type SessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "ready"
  | "interrupted"
  | "stopped"
  | "error";

export type ThreadShell = {
  readonly id: string;
  readonly title: string;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly settledOverride: "settled" | "active" | null;
  readonly settledAt: string | null;
  readonly sessionStatus: SessionStatus | null;
};

export type ShellSnapshot = {
  readonly threads: ReadonlyArray<ThreadShell>;
};

export type SpeakEvent =
  | {
      readonly kind: "needsYou";
      readonly threadId: string;
      readonly title: string;
      readonly reason: "approval" | "input";
    }
  | {
      readonly kind: "settled";
      readonly threadId: string;
      readonly title: string;
    }
  | {
      readonly kind: "settledMany";
      readonly count: number;
    };

export type AttentionState = {
  readonly hydrated: boolean;
  readonly byId: Readonly<Record<string, ThreadShell>>;
};

export const emptyAttention = (): AttentionState => ({
  hydrated: false,
  byId: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const asBoolean = (value: unknown): boolean => value === true;

const sessionStatus = (value: unknown): SessionStatus | null => {
  if (
    value === "idle" ||
    value === "starting" ||
    value === "running" ||
    value === "ready" ||
    value === "interrupted" ||
    value === "stopped" ||
    value === "error"
  ) {
    return value;
  }
  return null;
};

const settledOverride = (value: unknown): "settled" | "active" | null => {
  if (value === "settled" || value === "active") {
    return value;
  }
  return null;
};

const parseThread = (value: unknown): ThreadShell | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = asString(value.id) ?? asString(value.threadId);
  if (id === undefined) {
    return undefined;
  }
  const session = isRecord(value.session) ? value.session : undefined;
  return {
    id,
    title: asString(value.title) ?? "untitled thread",
    hasPendingApprovals: asBoolean(value.hasPendingApprovals),
    hasPendingUserInput: asBoolean(value.hasPendingUserInput),
    settledOverride: settledOverride(value.settledOverride),
    settledAt: asString(value.settledAt) ?? null,
    sessionStatus: sessionStatus(session?.status) ?? sessionStatus(value.sessionStatus),
  };
};

const threadList = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (Array.isArray(value.threads)) {
    return value.threads;
  }
  if (isRecord(value.snapshot) && Array.isArray(value.snapshot.threads)) {
    return value.snapshot.threads;
  }
  return undefined;
};

export const parseShell = (value: unknown): ShellSnapshot => {
  const list = threadList(value);
  if (!Array.isArray(list)) {
    return { threads: [] };
  }
  const threads: Array<ThreadShell> = [];
  for (const item of list) {
    const thread = parseThread(item);
    if (thread !== undefined) {
      threads.push(thread);
    }
  }
  return { threads };
};

export const needsYou = (thread: ThreadShell): boolean =>
  thread.hasPendingApprovals || thread.hasPendingUserInput;

export const isBusy = (thread: ThreadShell): boolean =>
  thread.sessionStatus === "starting" || thread.sessionStatus === "running";

export const attentionSignature = (thread: ThreadShell): string =>
  [
    thread.hasPendingApprovals ? "1" : "0",
    thread.hasPendingUserInput ? "1" : "0",
    thread.sessionStatus ?? "",
    thread.settledOverride ?? "",
    thread.settledAt ?? "",
  ].join("|");

const indexThreads = (snapshot: ShellSnapshot): Record<string, ThreadShell> => {
  const byId: Record<string, ThreadShell> = {};
  for (const thread of snapshot.threads) {
    byId[thread.id] = thread;
  }
  return byId;
};

const needsYouEvent = (thread: ThreadShell): SpeakEvent => ({
  kind: "needsYou",
  threadId: thread.id,
  title: thread.title,
  reason: thread.hasPendingApprovals ? "approval" : "input",
});

const settledEvent = (thread: ThreadShell): SpeakEvent => ({
  kind: "settled",
  threadId: thread.id,
  title: thread.title,
});

const becameSettled = (previous: ThreadShell | undefined, next: ThreadShell): boolean => {
  if (needsYou(next) || isBusy(next)) {
    return false;
  }
  if (previous === undefined) {
    return false;
  }
  if (isBusy(previous)) {
    return true;
  }
  if (previous.settledOverride !== "settled" && next.settledOverride === "settled") {
    return true;
  }
  if (previous.settledAt === null && next.settledAt !== null) {
    return true;
  }
  return false;
};

const becameNeedsYou = (previous: ThreadShell | undefined, next: ThreadShell): boolean => {
  if (!needsYou(next)) {
    return false;
  }
  if (previous === undefined) {
    return true;
  }
  return !needsYou(previous);
};

export const diffShell = (
  state: AttentionState,
  snapshot: ShellSnapshot,
): { readonly state: AttentionState; readonly events: ReadonlyArray<SpeakEvent> } => {
  const byId = indexThreads(snapshot);
  if (!state.hydrated) {
    return { state: { hydrated: true, byId }, events: [] };
  }

  const needsYouEvents: Array<SpeakEvent> = [];
  const settledEvents: Array<SpeakEvent> = [];

  for (const thread of snapshot.threads) {
    const previous = state.byId[thread.id];
    const prevSig = previous === undefined ? undefined : attentionSignature(previous);
    const nextSig = attentionSignature(thread);
    if (prevSig === nextSig) {
      continue;
    }
    if (becameNeedsYou(previous, thread)) {
      needsYouEvents.push(needsYouEvent(thread));
      continue;
    }
    if (becameSettled(previous, thread)) {
      settledEvents.push(settledEvent(thread));
    }
  }

  const events: Array<SpeakEvent> = [...needsYouEvents];
  if (settledEvents.length >= 2) {
    events.push({ kind: "settledMany", count: settledEvents.length });
  } else {
    events.push(...settledEvents);
  }

  return { state: { hydrated: true, byId }, events };
};
