import { useAtom, useAtomValue } from "@effect/atom-react";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useMemo } from "react";
import { activeThreadIdAtom, threadsAtom } from "../chat.ts";
import {
  archiveThreadAtom,
  closeActiveThread,
  listThreadItems,
  newThreadAtom,
  switchThreadAtom,
  threadIdAtHotkeyIndex,
} from "../threads.ts";

const threadDigitHotkeys = [
  "Mod+1",
  "Mod+2",
  "Mod+3",
  "Mod+4",
  "Mod+5",
  "Mod+6",
  "Mod+7",
  "Mod+8",
  "Mod+9",
] as const;

export function useThreadHotkeys(): void {
  const threads = useAtomValue(threadsAtom);
  const activeId = useAtomValue(activeThreadIdAtom);
  const [, newThread] = useAtom(newThreadAtom);
  const [, switchThread] = useAtom(switchThreadAtom);
  const [, archiveThread] = useAtom(archiveThreadAtom);
  const items = useMemo(() => listThreadItems(threads, activeId), [activeId, threads]);

  useHotkeys([
    {
      hotkey: "Mod+T",
      callback: () => {
        newThread();
      },
      options: { meta: { name: "New thread" } },
    },
    {
      hotkey: "Mod+W",
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
    ...threadDigitHotkeys.map((hotkey, index) => ({
      hotkey,
      callback: () => {
        const threadId = threadIdAtHotkeyIndex(items, index + 1);
        if (threadId !== undefined) {
          switchThread(threadId);
        }
      },
      options: { meta: { name: `Switch to thread ${String(index + 1)}` } },
    })),
  ]);
}
