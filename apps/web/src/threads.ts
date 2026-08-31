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

export const maxOrbitThreads = 5;

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

export type OrbitItem =
  | { readonly kind: "thread"; readonly thread: ThreadShell }
  | { readonly kind: "draft"; readonly threadId: ThreadId };

export const pickOrbitItems = (
  threads: ReadonlyArray<ThreadShell>,
  activeId: ThreadId | undefined,
): { readonly items: ReadonlyArray<OrbitItem>; readonly overflow: number } => {
  const activeShell = threads.find((thread) => thread.id === activeId);
  const rest = threads.filter((thread) => thread.id !== activeId);
  const items: Array<OrbitItem> = [];
  if (activeId !== undefined && activeShell === undefined) {
    items.push({ kind: "draft", threadId: activeId });
  } else if (activeShell !== undefined) {
    items.push({ kind: "thread", thread: activeShell });
  }
  for (const thread of rest) {
    if (items.length >= maxOrbitThreads) {
      break;
    }
    items.push({ kind: "thread", thread });
  }
  const shown = new Set(items.flatMap((item) => (item.kind === "thread" ? [item.thread.id] : [])));
  return {
    items,
    overflow: threads.filter((thread) => !shown.has(thread.id)).length,
  };
};

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
