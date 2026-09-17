import { useEffect, useLayoutEffect, useRef } from "react";
import {
  isMascotActionEnabled,
  mascotActions,
  type MascotActionId,
  type MascotPlayState,
} from "./actions.ts";

export function MascotMenu({
  x,
  y,
  play,
  onPick,
  onClose,
}: {
  readonly x: number;
  readonly y: number;
  readonly play: MascotPlayState;
  readonly onPick: (id: MascotActionId) => void;
  readonly onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu === null) {
      return;
    }
    const pad = 8;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    menu.style.left = `${Math.max(pad, Math.min(x, window.innerWidth - width - pad))}px`;
    menu.style.top = `${Math.max(pad, Math.min(y, window.innerHeight - height - pad))}px`;
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu !== null && menu.contains(event.target as Node)) {
        return;
      }
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="mascot-menu"
      role="menu"
      aria-label="Bernise actions"
      style={{ left: x, top: y }}
    >
      {mascotActions.map((item) => {
        const enabled = isMascotActionEnabled(play, item.id);
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={!enabled}
            onClick={() => {
              if (enabled) {
                onPick(item.id);
              }
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
