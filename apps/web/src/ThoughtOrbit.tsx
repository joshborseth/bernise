import { defaultThreadTitle, ThreadId } from "@bernise/contracts";
import { useAtom, useAtomValue } from "@effect/atom-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
} from "react";
import { activeThreadIdAtom, threadsAtom } from "./chat.ts";
import { cn } from "~/lib/utils";
import {
  deleteThreadAtom,
  isDraftThreadAtom,
  newThreadAtom,
  pickOrbitItems,
  renameThreadAtom,
  switchThreadAtom,
} from "./threads.ts";

const orbitSlots: ReadonlyArray<{ readonly x: number; readonly y: number; readonly tilt: number }> =
  [
    { x: 6, y: -10, tilt: -9 },
    { x: -16, y: 22, tilt: -14 },
    { x: -10, y: 64, tilt: -4 },
    { x: 90, y: 16, tilt: 11 },
    { x: 94, y: 58, tilt: 7 },
  ];

const plusSlot = { x: 72, y: -14, tilt: 8 };
const overflowSlot = { x: 104, y: 36, tilt: 4 };

type MenuState =
  | {
      readonly kind: "context";
      readonly threadId: ThreadId;
      readonly x: number;
      readonly y: number;
      readonly canDelete: boolean;
    }
  | {
      readonly kind: "overflow";
      readonly x: number;
      readonly y: number;
    };

export function ThoughtOrbit() {
  const threads = useAtomValue(threadsAtom);
  const activeId = useAtomValue(activeThreadIdAtom);
  const isDraft = useAtomValue(isDraftThreadAtom);
  const [, switchThread] = useAtom(switchThreadAtom);
  const [, newThread] = useAtom(newThreadAtom);
  const [, renameThread] = useAtom(renameThreadAtom);
  const [, deleteThread] = useAtom(deleteThreadAtom);
  const [menu, setMenu] = useState<MenuState | undefined>(undefined);
  const [renamingId, setRenamingId] = useState<ThreadId | undefined>(undefined);
  const [renameDraft, setRenameDraft] = useState("");
  const { items, overflow } = pickOrbitItems(threads, activeId);
  const overflowThreads = threads.filter(
    (thread) => !items.some((item) => item.kind === "thread" && item.thread.id === thread.id),
  );

  useEffect(() => {
    if (menu === undefined) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(undefined);
        setRenamingId(undefined);
      }
    };
    const onPointer = () => {
      setMenu(undefined);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [menu]);

  const openContext = (event: MouseEvent, threadId: ThreadId, canDelete: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      kind: "context",
      threadId,
      x: event.clientX,
      y: event.clientY,
      canDelete,
    });
  };

  const submitRename = (threadId: ThreadId, title: string) => {
    const next = title.trim();
    if (next.length > 0) {
      renameThread({ threadId, title: next });
    }
    setRenamingId(undefined);
  };

  return (
    <div className="thought-orbit" aria-label="Threads">
      {items.map((item, index) => {
        const slot = orbitSlots[index] ?? orbitSlots[orbitSlots.length - 1];
        if (slot === undefined) {
          return null;
        }
        if (item.kind === "draft") {
          const active = activeId === item.threadId;
          return (
            <ThoughtCloud
              key={item.threadId}
              slot={slot}
              active={active}
              draft
              label="new thought"
              title="New thought"
              onSelect={() => {
                switchThread(item.threadId);
              }}
              onMenu={(event) => {
                openContext(event, item.threadId, false);
              }}
            />
          );
        }
        const renaming = renamingId === item.thread.id;
        return (
          <ThoughtCloud
            key={item.thread.id}
            slot={slot}
            active={activeId === item.thread.id}
            draft={false}
            label={item.thread.title}
            title={item.thread.title}
            renaming={renaming}
            renameValue={renameDraft}
            onRenameChange={setRenameDraft}
            onRenameSubmit={() => {
              submitRename(item.thread.id, renameDraft);
            }}
            onSelect={() => {
              switchThread(item.thread.id);
            }}
            onMenu={(event) => {
              openContext(event, item.thread.id, true);
            }}
          />
        );
      })}
      <button
        type="button"
        className={cn("thought-cloud thought-cloud-plus", isDraft && "thought-cloud-active")}
        style={slotStyle(plusSlot)}
        aria-label="New thought"
        onClick={() => {
          newThread();
        }}
      >
        <span aria-hidden="true">+</span>
      </button>
      {overflow > 0 ? (
        <button
          type="button"
          className="thought-cloud thought-cloud-more"
          style={slotStyle(overflowSlot)}
          aria-label={`${String(overflow)} more threads`}
          onClick={(event) => {
            event.stopPropagation();
            setMenu({ kind: "overflow", x: event.clientX, y: event.clientY });
          }}
        >
          …
        </button>
      ) : null}
      {menu?.kind === "context" ? (
        <ThoughtMenu
          x={menu.x}
          y={menu.y}
          items={[
            {
              label: "Rename",
              disabled: !menu.canDelete,
              onSelect: () => {
                const shell = threads.find((thread) => thread.id === menu.threadId);
                setRenameDraft(shell?.title ?? defaultThreadTitle);
                setRenamingId(menu.threadId);
                setMenu(undefined);
              },
            },
            {
              label: "Delete",
              disabled: !menu.canDelete,
              danger: true,
              onSelect: () => {
                deleteThread(menu.threadId);
                setMenu(undefined);
              },
            },
          ]}
        />
      ) : null}
      {menu?.kind === "overflow" ? (
        <ThoughtMenu
          x={menu.x}
          y={menu.y}
          items={overflowThreads.map((thread) => ({
            id: thread.id,
            label: thread.title,
            onSelect: () => {
              switchThread(thread.id);
              setMenu(undefined);
            },
            onMenu: (event: MouseEvent) => {
              openContext(event, thread.id, true);
            },
          }))}
        />
      ) : null}
    </div>
  );
}

const slotStyle = (slot: { readonly x: number; readonly y: number; readonly tilt: number }) =>
  ({
    left: `${String(slot.x)}%`,
    top: `${String(slot.y)}%`,
    "--thought-tilt": `${String(slot.tilt)}deg`,
  }) as CSSProperties;

function ThoughtCloud({
  slot,
  active,
  draft,
  label,
  title,
  renaming = false,
  renameValue = "",
  onRenameChange,
  onRenameSubmit,
  onSelect,
  onMenu,
}: {
  readonly slot: { readonly x: number; readonly y: number; readonly tilt: number };
  readonly active: boolean;
  readonly draft: boolean;
  readonly label: string;
  readonly title: string;
  readonly renaming?: boolean;
  readonly renameValue?: string;
  readonly onRenameChange?: (value: string) => void;
  readonly onRenameSubmit?: () => void;
  readonly onSelect: () => void;
  readonly onMenu: (event: MouseEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  return (
    <button
      type="button"
      className={cn(
        "thought-cloud",
        active && "thought-cloud-active",
        draft && "thought-cloud-draft",
      )}
      style={slotStyle(slot)}
      aria-current={active ? "true" : undefined}
      aria-label={title}
      onClick={onSelect}
      onContextMenu={onMenu}
    >
      {renaming ? (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            event.stopPropagation();
            onRenameSubmit?.();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <input
            ref={inputRef}
            value={renameValue}
            aria-label="Rename thread"
            className="thought-cloud-rename"
            onChange={(event) => {
              onRenameChange?.(event.target.value);
            }}
            onBlur={() => {
              onRenameSubmit?.();
            }}
          />
        </form>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}

function ThoughtMenu({
  x,
  y,
  items,
}: {
  readonly x: number;
  readonly y: number;
  readonly items: ReadonlyArray<{
    readonly id?: string;
    readonly label: string;
    readonly disabled?: boolean;
    readonly danger?: boolean;
    readonly onSelect: () => void;
    readonly onMenu?: (event: MouseEvent) => void;
  }>;
}) {
  return (
    <ul
      className="thought-menu"
      style={{ left: x, top: y }}
      role="menu"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      {items.map((item) => (
        <li key={item.id ?? item.label} role="none">
          <button
            type="button"
            role="menuitem"
            className={cn("thought-menu-item", item.danger && "thought-menu-item-danger")}
            disabled={item.disabled}
            onClick={item.onSelect}
            onContextMenu={item.onMenu}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
