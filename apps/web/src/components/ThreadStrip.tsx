import { ThreadId } from "@bernise/contracts";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { ArchiveIcon, SquarePenIcon, XIcon } from "lucide-react";
import { useMemo } from "react";
import { activeThreadIdAtom, threadsAtom } from "../chat.ts";
import {
  archiveThreadAtom,
  archivedThreadsAtom,
  listThreadItems,
  newThreadAtom,
  restoreThreadAtom,
  switchThreadAtom,
  threadItemId,
  threadItemTitle,
  type ThreadListItem,
} from "../threads.ts";
import { formatHotkeyCaption, archiveThreadHotkey, newThreadHotkey } from "../hotkeys.ts";
import { Button } from "~/components/ui/button";
import { Kbd } from "~/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export function ThreadStrip() {
  const threads = useAtomValue(threadsAtom);
  const activeId = useAtomValue(activeThreadIdAtom);
  const archived = useAtomValue(archivedThreadsAtom);
  const [, newThread] = useAtom(newThreadAtom);
  const items = useMemo(() => listThreadItems(threads, activeId), [activeId, threads]);

  return (
    <div
      className="thread-strip flex min-h-0 shrink-0 items-center gap-1 px-2 py-1.5"
      aria-label="Threads"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`New thread (${formatHotkeyCaption(newThreadHotkey)})`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                newThread();
              }}
            />
          }
        >
          <SquarePenIcon />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          New thread
          <Kbd>{formatHotkeyCaption(newThreadHotkey)}</Kbd>
        </TooltipContent>
      </Tooltip>
      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:thin]"
        role="tablist"
        aria-label="Open threads"
      >
        {items.map((item, index) => (
          <ThreadChip
            key={threadItemId(item)}
            item={item}
            activeId={activeId}
            jumpIndex={index < 9 ? index + 1 : undefined}
          />
        ))}
      </div>
      {archived.length > 0 ? <ArchivedMenu /> : null}
    </div>
  );
}

function ThreadChip({
  item,
  activeId,
  jumpIndex,
}: {
  readonly item: ThreadListItem;
  readonly activeId: ThreadId | undefined;
  readonly jumpIndex: number | undefined;
}) {
  const threadId = threadItemId(item);
  const title = threadItemTitle(item);
  const active = activeId === threadId;
  const draft = item.kind === "draft";
  const [, switchThread] = useAtom(switchThreadAtom);
  const [, archiveThread] = useAtom(archiveThreadAtom);
  const jumpKeys =
    jumpIndex === undefined ? undefined : formatHotkeyCaption(`Mod+${String(jumpIndex)}`);
  const archiveKeys = formatHotkeyCaption(archiveThreadHotkey);

  return (
    <div
      role="tab"
      aria-selected={active}
      className={cn(
        "flex max-w-44 shrink-0 items-center rounded-full border text-xs transition-colors",
        active
          ? "border-[color-mix(in_srgb,var(--peach-deep)_55%,var(--line))] bg-[color-mix(in_srgb,var(--peach)_22%,var(--bg-elev))] font-medium text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--peach)_30%,transparent)]"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        draft && "italic",
        active && draft && "not-italic",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 truncate px-2.5 py-1 text-left"
        aria-label={jumpKeys === undefined ? title : `${title}, switch with ${jumpKeys}`}
        onClick={() => {
          switchThread(threadId);
        }}
      >
        {jumpIndex !== undefined ? <Kbd className="shrink-0">{jumpIndex}</Kbd> : null}
        <span className="min-w-0 truncate">{title}</span>
      </button>
      {item.kind === "thread" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={cn(
                  "mr-1 rounded-full p-0.5 hover:bg-background/70",
                  active
                    ? "text-foreground/75 hover:text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={active ? `Archive ${title} (${archiveKeys})` : `Archive ${title}`}
                onClick={() => {
                  archiveThread(threadId);
                }}
              />
            }
          >
            <XIcon className="size-3" />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Archive thread
            {active ? <Kbd>{archiveKeys}</Kbd> : null}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function ArchivedMenu() {
  const archived = useAtomValue(archivedThreadsAtom);
  const [, restoreThread] = useAtom(restoreThreadAtom);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            aria-label="Archived threads"
          />
        }
      >
        <ArchiveIcon />
        Archived
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="min-w-44">
        {archived.map((thread) => (
          <DropdownMenuItem
            key={thread.id}
            onClick={() => {
              restoreThread(thread.id);
            }}
          >
            <span className="min-w-0 truncate">{thread.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
