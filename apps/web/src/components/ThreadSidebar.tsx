import { ThreadId } from "@bernise/contracts";
import { useAtom, useAtomValue } from "@effect/atom-react";
import {
  EllipsisIcon,
  PencilIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { activeThreadIdAtom, threadsAtom } from "../chat.ts";
import {
  compactRelativeTime,
  deleteThreadAtom,
  filterThreadItems,
  listThreadItems,
  newThreadAtom,
  renameThreadAtom,
  switchThreadAtom,
  threadItemId,
  threadItemTitle,
  threadRenameAtom,
  type ThreadListItem,
} from "../threads.ts";
import { WorkspaceExplorer } from "./WorkspaceExplorer.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "~/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export function ThreadSidebar({
  onOpenPersona,
  footerExtra,
}: {
  readonly onOpenPersona: () => void;
  readonly footerExtra?: ReactNode;
}) {
  const [, newThread] = useAtom(newThreadAtom);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const startThread = () => {
    setQuery("");
    newThread();
  };

  return (
    <aside
      className="threads-pane flex h-full min-h-0 min-w-0 flex-col text-sidebar-foreground"
      aria-label="Workspace and threads"
    >
      <WorkspaceExplorer />
      <SidebarSeparator />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Threads">
        <SidebarHeader className="gap-3 px-2 pt-3 pb-2">
          <p className="font-display m-0 px-1 text-[0.95rem] leading-none font-semibold tracking-[-0.02em] italic">
            Threads
          </p>
          <div className="flex items-center gap-1">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <SidebarInput
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
                className="h-8 bg-background/70 pr-7 pl-7"
              />
              {query.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
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
          </div>
        </SidebarHeader>

        <SidebarContent>
          <ThreadsList query={query} />
        </SidebarContent>
      </div>

      <SidebarFooter className="border-t border-sidebar-border/80">
        <div className="flex items-end gap-2">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onOpenPersona} tooltip="Bernise Persona">
                <SettingsIcon />
                <span>Bernise Persona</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {footerExtra}
        </div>
      </SidebarFooter>
    </aside>
  );
}

function ThreadsList({ query }: { readonly query: string }) {
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
      <SidebarGroup>
        <SidebarGroupContent>
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            {query.trim().length > 0 ? "No matching threads" : "No threads yet"}
          </p>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-px">
          {items.map((item) => (
            <ThreadRow key={threadItemId(item)} item={item} activeId={activeId} now={now} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

const minuteTickMs = 60_000;

function ThreadRow({
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
  const time = item.kind === "thread" ? compactRelativeTime(item.thread.updatedAt, now) : undefined;

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

  return (
    <SidebarMenuItem>
      {renaming ? (
        <form
          className="px-0.5 py-0.5"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            submitRename();
          }}
        >
          <SidebarInput
            ref={inputRef}
            value={rename?.draft ?? ""}
            aria-label="Rename thread"
            className="h-8 bg-background"
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
      ) : (
        <SidebarMenuButton
          isActive={active}
          tooltip={title}
          className={cn(
            "h-8",
            draft && "text-muted-foreground italic data-active:text-sidebar-accent-foreground",
          )}
          aria-current={active ? "true" : undefined}
          title={title}
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
          <span>{title}</span>
        </SidebarMenuButton>
      )}
      {item.kind === "thread" && !renaming && time !== undefined && time.length > 0 ? (
        <SidebarMenuBadge
          className={cn(
            "font-normal text-muted-foreground tabular-nums",
            "group-hover/menu-item:hidden group-focus-within/menu-item:hidden",
            menuOpen && "hidden",
          )}
        >
          {time}
        </SidebarMenuBadge>
      ) : null}
      {item.kind === "thread" && !renaming ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={<SidebarMenuAction showOnHover aria-label={`Thread actions for ${title}`} />}
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
    </SidebarMenuItem>
  );
}
