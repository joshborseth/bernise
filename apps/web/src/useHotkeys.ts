import { useEffect, useRef } from "react";
import {
  isEditableTarget,
  matchHotkey,
  shouldShowThreadJumpHints,
  shortcutEventFromKeyboard,
  type HotkeyMatch,
} from "./hotkeys.ts";

export function useAppHotkeys(handlers: {
  readonly onNewThread: () => void;
  readonly onSearchThreads: () => void;
  readonly onOpenPersona: () => void;
  readonly onShowShortcuts: () => void;
  readonly onJumpThread: (index: number) => void;
  readonly onJumpHintsChange: (show: boolean) => void;
}): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const platform = navigator.platform;
    const dispatch = (match: HotkeyMatch) => {
      const current = handlersRef.current;
      switch (match.id) {
        case "newThread":
          current.onNewThread();
          return;
        case "searchThreads":
          current.onSearchThreads();
          return;
        case "openPersona":
          current.onOpenPersona();
          return;
        case "showShortcuts":
          current.onShowShortcuts();
          return;
        case "jumpThread":
          current.onJumpThread(match.index);
      }
    };

    const syncHints = (event: KeyboardEvent) => {
      handlersRef.current.onJumpHintsChange(
        shouldShowThreadJumpHints(shortcutEventFromKeyboard(event), platform),
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      syncHints(event);
      const match = matchHotkey(shortcutEventFromKeyboard(event), platform, {
        typing: isEditableTarget(event.target),
      });
      if (match === undefined) {
        return;
      }
      event.preventDefault();
      dispatch(match);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      syncHints(event);
    };
    const hideHints = () => {
      handlersRef.current.onJumpHintsChange(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", hideHints);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", hideHints);
    };
  }, []);
}
