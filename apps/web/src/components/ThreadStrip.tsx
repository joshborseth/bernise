import { ThreadId } from "@bernise/contracts";
import { useAtom, useAtomValue } from "@effect/atom-react";
import {
  EllipsisIcon,
  PencilIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { activeThreadIdAtom, threadsAtom } from "../chat.ts";
import {
  deleteThreadAtom,
  filterThreadItems,
  listThreadItems,
  newThreadAtom,
  renameThreadAtom,
  switchThreadAtom,
  threadItemId,
  threadItemTitle,
  threadRenameAtom,
  threadTabTooltip,
  type ThreadListItem,
} from "../threads.ts";
import { TabStrip, TabStripActions, TabStripTab, TabStripTrack } from "./TabStrip.tsx";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export function ThreadStrip() {
  const [, newThread] = useAtom(newThreadAtom);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const startThread = () => {
    setQuery("");
    newThread();
  };

  return (
    <TabStrip className="bg-transparent" aria-label="Threads">
      <ThreadTabs query={query} />
      <TabStripActions>
        <div className="relative w-36 min-w-0">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setQuery("");
                searchRef.current?.blur();
              }
            }}
            placeholder="Search threads…"
            aria-label="Search threads"
            autoComplete="off"
            className="h-6 bg-background/70 pr-6 pl-7"
          />
          {query.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <XIcon />
            </Button>
          ) : null}
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="New thread"
                className="text-muted-foreground hover:text-foreground"
                onClick={startThread}
              />
            }
          >
            <SquarePenIcon />
          </TooltipTrigger>
          <TooltipContent side="bottom">New thread</TooltipContent>
        </Tooltip>
      </TabStripActions>
    </TabStrip>
  );
}

function ThreadTabs({ query }: { readonly query: string }) {
  const threads = useAtomValue(threadsAtom);
  const activeId = useAtomValue(activeThreadIdAtom);
  const items = useMemo(() => {
    const listed = listThreadItems(threads, activeId);
    return filterThreadItems(listed, query);
  }, [activeId, query, threads]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, minuteTickMs);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  if (items.length === 0) {
    return (
      <TabStripTrack aria-label="Thread tabs">
        <p className="m-0 flex items-center px-3 text-xs text-muted-foreground">
          {query.trim().length > 0 ? "No matching threads" : "No threads yet"}
        </p>
      </TabStripTrack>
    );
  }

  return (
    <TabStripTrack aria-label="Thread tabs">
      {items.map((item) => (
        <ThreadTab key={threadItemId(item)} item={item} activeId={activeId} now={now} />
      ))}
    </TabStripTrack>
  );
}

const minuteTickMs = 60_000;

function ThreadTab({
  item,
  activeId,
  now,
}: {
  readonly item: ThreadListItem;
  readonly activeId: ThreadId | undefined;
  readonly now: number;
}) {
  const threadId = threadItemId(item);
  const title = threadItemTitle(item);
  const active = activeId === threadId;
  const draft = item.kind === "draft";
  const [, switchThread] = useAtom(switchThreadAtom);
  const [, renameThread] = useAtom(renameThreadAtom);
  const [, deleteThread] = useAtom(deleteThreadAtom);
  const [rename, setRename] = useAtom(threadRenameAtom);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const renaming = rename?.threadId === threadId;
  const tooltip = threadTabTooltip(item, now);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  const submitRename = () => {
    if (rename === undefined || rename.threadId !== threadId) {
      return;
    }
    const next = rename.draft.trim();
    if (next.length > 0 && item.kind === "thread") {
      renameThread({ threadId, title: next });
    }
    setRename(undefined);
  };

  const cancelRename = () => {
    setRename(undefined);
  };

  const startRename = () => {
    if (item.kind !== "thread") {
      return;
    }
    setRename({ threadId, draft: item.thread.title });
    setMenuOpen(false);
  };

  if (renaming) {
    return (
      <form
        className="flex h-full min-w-40 max-w-52 shrink-0 items-center px-1"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          submitRename();
        }}
      >
        <Input
          ref={inputRef}
          value={rename?.draft ?? ""}
          aria-label="Rename thread"
          className="h-6 bg-background"
          onChange={(event) => {
            setRename({ threadId, draft: event.target.value });
          }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelRename();
            }
          }}
          onBlur={() => {
            submitRename();
          }}
        />
      </form>
    );
  }

  return (
    <div className="group/tab relative flex h-full min-w-0 shrink-0 items-stretch">
      <TabStripTab
        selected={active}
        title={tooltip}
        aria-label={title}
        className={cn(draft && "italic", item.kind === "thread" && "pr-7")}
        onClick={() => {
          switchThread(threadId);
        }}
        onDoubleClick={() => {
          startRename();
        }}
        onContextMenu={(event) => {
          if (item.kind !== "thread") {
            return;
          }
          event.preventDefault();
          setMenuOpen(true);
        }}
      >
        <span className="truncate">{title}</span>
      </TabStripTab>
      {item.kind === "thread" ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1 z-1 -translate-y-1/2 text-muted-foreground opacity-0 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100 aria-expanded:opacity-100"
                aria-label={`Thread actions for ${title}`}
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" className="min-w-36">
            <DropdownMenuItem
              onClick={() => {
                startRename();
              }}
            >
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                deleteThread(threadId);
                setMenuOpen(false);
              }}
            >
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
