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

export const activeThreadStorageKey = "bernise.activeThreadId";

export const readStoredThreadId = (): ThreadId | undefined => {
  try {
    const value = globalThis.localStorage?.getItem(activeThreadStorageKey);
    return value !== undefined && value !== null && value.length > 0
      ? ThreadId.make(value)
      : undefined;
  } catch {
    return undefined;
  }
};

export const writeStoredThreadId = (threadId: ThreadId | undefined): void => {
  try {
    if (threadId === undefined) {
      globalThis.localStorage?.removeItem(activeThreadStorageKey);
      return;
    }
    globalThis.localStorage?.setItem(activeThreadStorageKey, threadId);
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

export const filterThreadItems = (
  items: ReadonlyArray<ThreadListItem>,
  query: string,
): ReadonlyArray<ThreadListItem> => {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return items;
  }
  return items.filter((item) => threadItemTitle(item).toLowerCase().includes(needle));
};

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const weekMs = 7 * dayMs;

export const compactRelativeTime = (iso: string, now = Date.now()): string => {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return "";
  }
  const delta = Math.max(0, now - then);
  if (delta < minuteMs) {
    return "now";
  }
  if (delta < hourMs) {
    return `${String(Math.floor(delta / minuteMs))}m`;
  }
  if (delta < dayMs) {
    return `${String(Math.floor(delta / hourMs))}h`;
  }
  if (delta < weekMs) {
    return `${String(Math.floor(delta / dayMs))}d`;
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(then),
  );
};

export const threadRenameAtom = Atom.make<
  { readonly threadId: ThreadId; readonly draft: string } | undefined
>(undefined);

/** Incremented when the composer should receive focus (e.g. New thread). */
export const composerFocusNonceAtom = Atom.make(0);

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
      const listed = yield* client("ListThreads", undefined);
      get.set(threadsAtom, listed.threads);
      const stored = readStoredThreadId();
      const chosen =
        stored !== undefined && listed.threads.some((thread) => thread.id === stored)
          ? stored
          : listed.threads[0]?.id;
      if (chosen === undefined) {
        get.set(activeThreadIdAtom, newThreadId());
        get.set(chatAtom, initialChat);
        writeStoredThreadId(undefined);
        return;
      }
      get.set(activeThreadIdAtom, chosen);
      writeStoredThreadId(chosen);
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
    if (get.registry.get(activeThreadIdAtom) === threadId) {
      return;
    }
    get.set(activeThreadIdAtom, threadId);
    get.set(voiceRevealAtom, undefined);
    get.set(sessionEpochAtom, get.registry.get(sessionEpochAtom) + 1);
    const listed = get.registry.get(threadsAtom).some((thread) => thread.id === threadId);
    if (!listed) {
      get.set(chatAtom, initialChat);
      writeStoredThreadId(undefined);
      return;
    }
    writeStoredThreadId(threadId);
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
    writeStoredThreadId(undefined);
  }),
);

export const renameThreadAtom = BerniseRpc.runtime.fn(
  (input: { readonly threadId: ThreadId; readonly title: string }, get) =>
    Effect.gen(function* () {
      const client = yield* BerniseRpc;
      const renamed = yield* client("RenameThread", input);
      get.set(
        threadsAtom,
        get.registry
          .get(threadsAtom)
          .map((thread) => (thread.id === renamed.id ? renamed : thread))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      );
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

export const deleteThreadAtom = BerniseRpc.runtime.fn((threadId: ThreadId, get) =>
  Effect.gen(function* () {
    const client = yield* BerniseRpc;
    yield* client("DeleteThread", { threadId });
    const remaining = get.registry.get(threadsAtom).filter((thread) => thread.id !== threadId);
    get.set(threadsAtom, remaining);
    if (get.registry.get(activeThreadIdAtom) !== threadId) {
      return;
    }
    const next = remaining[0];
    if (next === undefined) {
      get.set(activeThreadIdAtom, newThreadId());
      get.set(chatAtom, initialChat);
      get.set(voiceRevealAtom, undefined);
      get.set(sessionEpochAtom, get.registry.get(sessionEpochAtom) + 1);
      writeStoredThreadId(undefined);
      return;
    }
    get.set(activeThreadIdAtom, next.id);
    get.set(voiceRevealAtom, undefined);
    get.set(sessionEpochAtom, get.registry.get(sessionEpochAtom) + 1);
    writeStoredThreadId(next.id);
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
