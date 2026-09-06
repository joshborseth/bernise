import { useAtom, useAtomValue } from "@effect/atom-react";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useMemo } from "react";
import { activeThreadIdAtom, threadsAtom } from "../chat.ts";
import { archiveThreadHotkey, newThreadHotkey, threadSwitchHotkeys } from "../hotkeys.ts";
import {
  archiveThreadAtom,
  closeActiveThread,
  listThreadItems,
  newThreadAtom,
  switchThreadAtom,
  threadIdAtHotkeyIndex,
} from "../threads.ts";

export function useThreadHotkeys(): void {
  const threads = useAtomValue(threadsAtom);
  const activeId = useAtomValue(activeThreadIdAtom);
  const [, newThread] = useAtom(newThreadAtom);
  const [, switchThread] = useAtom(switchThreadAtom);
  const [, archiveThread] = useAtom(archiveThreadAtom);
  const items = useMemo(() => listThreadItems(threads, activeId), [activeId, threads]);

  useHotkeys([
    {
      hotkey: newThreadHotkey,
      callback: () => {
        newThread();
      },
      options: { meta: { name: "New thread" } },
    },
    {
      hotkey: archiveThreadHotkey,
      callback: () => {
        const action = closeActiveThread(items, activeId);
        if (action === undefined) {
          return;
        }
        if (action.kind === "archive") {
          archiveThread(action.threadId);
          return;
        }
        if (action.nextId === undefined) {
          newThread();
          return;
        }
        switchThread(action.nextId);
      },
      options: { meta: { name: "Archive thread" } },
    },
    ...threadSwitchHotkeys.map(({ hotkey, label, digit }) => ({
      hotkey,
      callback: () => {
        const threadId = threadIdAtHotkeyIndex(items, digit);
        if (threadId !== undefined) {
          switchThread(threadId);
        }
      },
      options: { meta: { name: label } },
    })),
  ]);
}
