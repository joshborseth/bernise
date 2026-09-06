import { ThreadId, ThreadShell, defaultThreadTitle } from "@bernise/contracts";
import { Cause, Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";
import {
  activeThreadIdAtom,
  appendError,
  chatAtom,
  formatError,
  hydrateFromThread,
  initialChat,
  newThreadId,
  sessionEpochAtom,
  threadsAtom,
} from "./chat.ts";
import { BerniseRpc } from "./rpc.ts";
import { voiceRevealAtom } from "./voice/state.ts";
import { workspaceAtom } from "./workspace.ts";

export const activeThreadStorageKey = "bernise.activeThreadId";

export const activeThreadStorageKeyFor = (workspacePath: string): string =>
  workspacePath.length === 0
    ? activeThreadStorageKey
    : `${activeThreadStorageKey}:${workspacePath}`;

export const readStoredThreadId = (workspacePath = ""): ThreadId | undefined => {
  try {
    const value = globalThis.localStorage?.getItem(activeThreadStorageKeyFor(workspacePath));
    return value !== undefined && value !== null && value.length > 0
      ? ThreadId.make(value)
      : undefined;
  } catch {
    return undefined;
  }
};

export const writeStoredThreadId = (threadId: ThreadId | undefined, workspacePath = ""): void => {
  const key = activeThreadStorageKeyFor(workspacePath);
  try {
    if (threadId === undefined) {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    globalThis.localStorage?.setItem(key, threadId);
  } catch {
    // Quota or private mode — selection still lives in memory.
  }
};

export type ThreadListItem =
  | { readonly kind: "thread"; readonly thread: ThreadShell }
  | { readonly kind: "draft"; readonly threadId: ThreadId };

export const threadItemId = (item: ThreadListItem): ThreadId =>
  item.kind === "draft" ? item.threadId : item.thread.id;

export const threadItemTitle = (item: ThreadListItem): string =>
  item.kind === "draft" ? "new thread" : item.thread.title;

export const listThreadItems = (
  threads: ReadonlyArray<ThreadShell>,
  activeId: ThreadId | undefined,
): ReadonlyArray<ThreadListItem> => {
  const sorted = threads
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const isDraft = activeId !== undefined && !threads.some((thread) => thread.id === activeId);
  const items: Array<ThreadListItem> = [];
  if (isDraft && activeId !== undefined) {
    items.push({ kind: "draft", threadId: activeId });
  }
  for (const thread of sorted) {
    items.push({ kind: "thread", thread });
  }
  return items;
};

export const threadIdAtHotkeyIndex = (
  items: ReadonlyArray<ThreadListItem>,
  digit: number,
): ThreadId | undefined => {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
    return undefined;
  }
  const item = items[digit - 1];
  return item === undefined ? undefined : threadItemId(item);
};

export type CloseActiveThread =
  | { readonly kind: "archive"; readonly threadId: ThreadId }
  | { readonly kind: "discard"; readonly nextId: ThreadId | undefined };

export const closeActiveThread = (
  items: ReadonlyArray<ThreadListItem>,
  activeId: ThreadId | undefined,
): CloseActiveThread | undefined => {
  if (activeId === undefined) {
    return undefined;
  }
  const active = items.find((item) => threadItemId(item) === activeId);
  if (active === undefined) {
    return undefined;
  }
  if (active.kind === "draft") {
    const next = items.find((item) => item.kind === "thread");
    return { kind: "discard", nextId: next === undefined ? undefined : next.thread.id };
  }
  return { kind: "archive", threadId: activeId };
};

/** Incremented when the composer should receive focus (e.g. New thread). */
export const composerFocusNonceAtom = Atom.make(0);

export const archivedThreadsAtom = Atom.make<ReadonlyArray<ThreadShell>>([]);

export const activeThreadTitleAtom = Atom.make((get) => {
  const activeId = get(activeThreadIdAtom);
  const listed = get(threadsAtom).find((thread) => thread.id === activeId);
  if (listed !== undefined) {
    return listed.title;
  }
  if (activeId !== undefined) {
    return defaultThreadTitle;
  }
  return "station";
});

export const isDraftThreadAtom = Atom.make((get) => {
  const activeId = get(activeThreadIdAtom);
  if (activeId === undefined) {
    return true;
  }
  return !get(threadsAtom).some((thread) => thread.id === activeId);
});

export const bootThreadsAtom = BerniseRpc.runtime
  .atom((get) =>
    Effect.gen(function* () {
      const client = yield* BerniseRpc;
      const workspace = yield* client("GetWorkspace", undefined);
      get.set(workspaceAtom, workspace);
      const listed = yield* client("ListThreads", undefined);
      get.set(threadsAtom, listed.threads);
      const archived = yield* client("ListArchivedThreads", undefined);
      get.set(archivedThreadsAtom, archived.threads);
      const stored = readStoredThreadId(workspace.path);
      const chosen =
        stored !== undefined && listed.threads.some((thread) => thread.id === stored)
          ? stored
          : listed.threads[0]?.id;
      if (chosen === undefined) {
        get.set(activeThreadIdAtom, newThreadId());
        get.set(chatAtom, initialChat);
        writeStoredThreadId(undefined, workspace.path);
        return;
      }
      get.set(activeThreadIdAtom, chosen);
      writeStoredThreadId(chosen, workspace.path);
      const snapshot = yield* client("GetThread", { threadId: chosen });
      const chat = get.once(chatAtom);
      const alreadySpoken = chat.messages.some(
        (message) => message.from === "user" || message.from === "assistant",
      );
      if (alreadySpoken) {
        return;
      }
      get.set(chatAtom, hydrateFromThread(snapshot.messages));
    }).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.void;
        }
        return Effect.sync(() => {
          const chat = get.once(chatAtom);
          const alreadySpoken = chat.messages.some(
            (message) => message.from === "user" || message.from === "assistant",
          );
          if (alreadySpoken) {
            return;
          }
          get.set(
            chatAtom,
            appendError(chat, formatError(Cause.squash(cause)), crypto.randomUUID()),
          );
        });
      }),
    ),
  )
  .pipe(Atom.keepAlive);

export const switchThreadAtom = BerniseRpc.runtime.fn((threadId: ThreadId, get) =>
  Effect.gen(function* () {
    const workspacePath = get.registry.get(workspaceAtom).path;
    if (get.registry.get(activeThreadIdAtom) === threadId) {
      return;
    }
    get.set(activeThreadIdAtom, threadId);
    get.set(voiceRevealAtom, undefined);
    get.set(sessionEpochAtom, get.registry.get(sessionEpochAtom) + 1);
    const listed = get.registry.get(threadsAtom).some((thread) => thread.id === threadId);
    if (!listed) {
      get.set(chatAtom, initialChat);
      writeStoredThreadId(undefined, workspacePath);
      return;
    }
    writeStoredThreadId(threadId, workspacePath);
    const client = yield* BerniseRpc;
    const snapshot = yield* client("GetThread", { threadId });
    get.set(chatAtom, hydrateFromThread(snapshot.messages));
  }).pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.void;
      }
      return Effect.sync(() => {
        get.set(
          chatAtom,
          appendError(
            get.registry.get(chatAtom),
            formatError(Cause.squash(cause)),
            crypto.randomUUID(),
          ),
        );
      });
    }),
  ),
);

export const newThreadAtom = BerniseRpc.runtime.fn((_arg: void, get) =>
  Effect.sync(() => {
    const threadId = newThreadId();
    get.set(activeThreadIdAtom, threadId);
    get.set(chatAtom, initialChat);
    get.set(voiceRevealAtom, undefined);
    get.set(sessionEpochAtom, get.registry.get(sessionEpochAtom) + 1);
    get.set(composerFocusNonceAtom, get.registry.get(composerFocusNonceAtom) + 1);
    writeStoredThreadId(undefined, get.registry.get(workspaceAtom).path);
  }),
);

const sortThreadShells = (threads: ReadonlyArray<ThreadShell>): ReadonlyArray<ThreadShell> =>
  threads.slice().sort((left, right) => {
    if (left.updatedAt === right.updatedAt) {
      return right.id.localeCompare(left.id);
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });

export const archiveThreadAtom = BerniseRpc.runtime.fn((threadId: ThreadId, get) =>
  Effect.gen(function* () {
    const workspacePath = get.registry.get(workspaceAtom).path;
    const client = yield* BerniseRpc;
    const archived = yield* client("ArchiveThread", { threadId });
    const remaining = get.registry.get(threadsAtom).filter((thread) => thread.id !== threadId);
    get.set(threadsAtom, remaining);
    get.set(archivedThreadsAtom, [
      archived,
      ...get.registry.get(archivedThreadsAtom).filter((thread) => thread.id !== threadId),
    ]);
    if (get.registry.get(activeThreadIdAtom) !== threadId) {
      return;
    }
    const next = remaining[0];
    if (next === undefined) {
      get.set(activeThreadIdAtom, newThreadId());
      get.set(chatAtom, initialChat);
      get.set(voiceRevealAtom, undefined);
      get.set(sessionEpochAtom, get.registry.get(sessionEpochAtom) + 1);
      writeStoredThreadId(undefined, workspacePath);
      return;
    }
    get.set(activeThreadIdAtom, next.id);
    get.set(voiceRevealAtom, undefined);
    get.set(sessionEpochAtom, get.registry.get(sessionEpochAtom) + 1);
    writeStoredThreadId(next.id, workspacePath);
    const snapshot = yield* client("GetThread", { threadId: next.id });
    get.set(chatAtom, hydrateFromThread(snapshot.messages));
  }).pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.void;
      }
      return Effect.sync(() => {
        get.set(
          chatAtom,
          appendError(
            get.registry.get(chatAtom),
            formatError(Cause.squash(cause)),
            crypto.randomUUID(),
          ),
        );
      });
    }),
  ),
);

export const restoreThreadAtom = BerniseRpc.runtime.fn((threadId: ThreadId, get) =>
  Effect.gen(function* () {
    const workspacePath = get.registry.get(workspaceAtom).path;
    const client = yield* BerniseRpc;
    const restored = yield* client("RestoreThread", { threadId });
    get.set(
      threadsAtom,
      sortThreadShells([
        restored,
        ...get.registry.get(threadsAtom).filter((thread) => thread.id !== restored.id),
      ]),
    );
    get.set(
      archivedThreadsAtom,
      get.registry.get(archivedThreadsAtom).filter((thread) => thread.id !== threadId),
    );
    if (get.registry.get(activeThreadIdAtom) === restored.id) {
      return;
    }
    get.set(activeThreadIdAtom, restored.id);
    get.set(voiceRevealAtom, undefined);
    get.set(sessionEpochAtom, get.registry.get(sessionEpochAtom) + 1);
    writeStoredThreadId(restored.id, workspacePath);
    const snapshot = yield* client("GetThread", { threadId: restored.id });
    get.set(chatAtom, hydrateFromThread(snapshot.messages));
  }).pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.void;
      }
      return Effect.sync(() => {
        get.set(
          chatAtom,
          appendError(
            get.registry.get(chatAtom),
            formatError(Cause.squash(cause)),
            crypto.randomUUID(),
          ),
        );
      });
    }),
  ),
);
