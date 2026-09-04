import { type WorkspaceEntry, type WorkspaceInfo } from "@bernise/contracts";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  ChevronRightIcon,
  FileIcon,
  FileSymlinkIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import { formatError } from "../chat.ts";
import { Button } from "~/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";
import {
  activeWorkspaceEntryAtom,
  displayWorkspacePath,
  expandedWorkspaceDirectoriesAtom,
  isSelectableWorkspaceEntry,
  isWorkspaceDirectoryExpanded,
  toggleWorkspaceDirectoryExpanded,
  workspaceAtom,
  workspaceDirectoryAtom,
  workspaceDirectoryEpochAtom,
  workspaceRootPath,
} from "../workspace.ts";

export function WorkspaceExplorer() {
  const workspace = useAtomValue(workspaceAtom);
  const listing = useAtomValue(workspaceDirectoryAtom(workspaceRootPath));
  const [epoch, setEpoch] = useAtom(workspaceDirectoryEpochAtom(workspaceRootPath));
  const [activePath, setActivePath] = useAtom(activeWorkspaceEntryAtom);
  const [expanded, setExpanded] = useAtom(expandedWorkspaceDirectoriesAtom);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Workspace">
      <SidebarHeader className="gap-1 px-2 pt-3 pb-2">
        <p className="font-display m-0 px-1 text-[0.95rem] leading-none font-semibold tracking-[-0.02em] italic">
          Workspace
        </p>
        <WorkspacePlaque workspace={workspace} />
      </SidebarHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspaceDirectoryView
          listing={listing}
          depth={0}
          expanded={expanded}
          activePath={activePath}
          isRoot
          onRetry={() => {
            setEpoch(epoch + 1);
          }}
          onToggleDirectory={(path) => {
            setExpanded(toggleWorkspaceDirectoryExpanded(expanded, path));
          }}
          onSelect={(entry) => {
            if (isSelectableWorkspaceEntry(entry.kind)) {
              setActivePath(entry.path);
            }
          }}
        />
      </div>
    </section>
  );
}

function WorkspacePlaque({ workspace }: { readonly workspace: WorkspaceInfo }) {
  if (workspace.path.length === 0) {
    return null;
  }
  const displayPath = displayWorkspacePath(workspace.path);
  return (
    <p
      className="m-0 flex min-w-0 items-baseline gap-1.5 px-1 text-[0.72rem] leading-[1.35]"
      title={workspace.path}
    >
      <span className="shrink-0 tracking-[0.02em] text-[color-mix(in_srgb,var(--peach-deep)_82%,var(--ink))]">
        {workspace.name}
      </span>
      <span className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap text-muted-foreground [direction:rtl]">
        <bdi>{displayPath}</bdi>
      </span>
    </p>
  );
}

function WorkspaceDirectoryView({
  listing,
  depth,
  expanded,
  activePath,
  isRoot,
  groupId,
  onRetry,
  onToggleDirectory,
  onSelect,
}: {
  readonly listing: AsyncResult.AsyncResult<
    { readonly entries: ReadonlyArray<WorkspaceEntry> },
    unknown
  >;
  readonly depth: number;
  readonly expanded: ReadonlySet<string>;
  readonly activePath: string | undefined;
  readonly isRoot: boolean;
  readonly groupId?: string;
  readonly onRetry: () => void;
  readonly onToggleDirectory: (path: string) => void;
  readonly onSelect: (entry: WorkspaceEntry) => void;
}) {
  const status = listingStatus(listing, isRoot, onRetry);

  if (isRoot) {
    if (status !== undefined) {
      return (
        <SidebarGroup>
          <SidebarGroupContent>{status}</SidebarGroupContent>
        </SidebarGroup>
      );
    }
    if (AsyncResult.isSuccess(listing) && listing.value.entries.length === 0) {
      return (
        <SidebarGroup>
          <SidebarGroupContent>
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">No files</p>
          </SidebarGroupContent>
        </SidebarGroup>
      );
    }
    if (!AsyncResult.isSuccess(listing)) {
      return null;
    }
    return (
      <SidebarGroup className="px-2 py-1">
        <SidebarGroupContent>
          <SidebarMenu className="gap-px" role="tree" aria-label="Workspace files">
            {listing.value.entries.map((entry) => (
              <WorkspaceTreeEntry
                key={entry.path}
                entry={entry}
                depth={depth}
                expanded={expanded}
                activePath={activePath}
                onToggleDirectory={onToggleDirectory}
                onSelect={onSelect}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (status !== undefined) {
    return (
      <ul role="group" id={groupId} className="flex w-full min-w-0 flex-col">
        <li className="px-2 py-1" style={{ paddingLeft: rowPadding(depth) }}>
          {status}
        </li>
      </ul>
    );
  }
  if (AsyncResult.isSuccess(listing) && listing.value.entries.length === 0) {
    return (
      <ul role="group" id={groupId} className="flex w-full min-w-0 flex-col">
        <li
          className="px-2 py-1 text-xs text-muted-foreground"
          style={{ paddingLeft: rowPadding(depth) }}
        >
          No files
        </li>
      </ul>
    );
  }
  if (!AsyncResult.isSuccess(listing)) {
    return null;
  }
  return (
    <ul role="group" id={groupId} className="flex w-full min-w-0 flex-col gap-px">
      {listing.value.entries.map((entry) => (
        <WorkspaceTreeEntry
          key={entry.path}
          entry={entry}
          depth={depth}
          expanded={expanded}
          activePath={activePath}
          onToggleDirectory={onToggleDirectory}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function listingStatus(
  listing: AsyncResult.AsyncResult<unknown, unknown>,
  isRoot: boolean,
  onRetry: () => void,
) {
  if (AsyncResult.isFailure(listing) && !Cause.hasInterruptsOnly(listing.cause)) {
    return (
      <div className={cn("grid gap-2", isRoot ? "px-2 py-4" : "py-1")} role="alert">
        <p className={cn("m-0 text-xs text-destructive", isRoot && "text-center")}>
          {formatError(Cause.squash(listing.cause))}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={isRoot ? "justify-self-center" : "justify-self-start"}
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!AsyncResult.isSuccess(listing)) {
    return (
      <p
        className={cn("text-xs text-muted-foreground", isRoot ? "px-2 py-8 text-center" : "py-1")}
        aria-live="polite"
      >
        {isRoot ? "Loading workspace…" : "Loading…"}
      </p>
    );
  }
  return undefined;
}

function WorkspaceTreeEntry({
  entry,
  depth,
  expanded,
  activePath,
  onToggleDirectory,
  onSelect,
}: {
  readonly entry: WorkspaceEntry;
  readonly depth: number;
  readonly expanded: ReadonlySet<string>;
  readonly activePath: string | undefined;
  readonly onToggleDirectory: (path: string) => void;
  readonly onSelect: (entry: WorkspaceEntry) => void;
}) {
  const directory = entry.kind === "directory";
  const directoryExpanded = directory && isWorkspaceDirectoryExpanded(expanded, entry.path);
  const selected = activePath === entry.path;
  const selectable = isSelectableWorkspaceEntry(entry.kind);

  return (
    <SidebarMenuItem role="none">
      <SidebarMenuButton
        isActive={selected}
        tooltip={entry.name}
        title={entry.name}
        role="treeitem"
        aria-label={entry.name}
        aria-expanded={directory ? directoryExpanded : undefined}
        aria-owns={directoryExpanded ? workspaceChildrenId(entry.path) : undefined}
        aria-selected={selectable ? selected : undefined}
        className={cn(
          "h-8",
          selected &&
            "shadow-[inset_3px_0_0_var(--peach-deep)] data-active:bg-[color-mix(in_srgb,var(--peach)_62%,white)]",
        )}
        style={{ paddingLeft: rowPadding(depth) }}
        onClick={() => {
          if (directory) {
            onToggleDirectory(entry.path);
            return;
          }
          onSelect(entry);
        }}
      >
        {directory ? (
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              directoryExpanded && "rotate-90",
            )}
          />
        ) : (
          <span className="size-4 shrink-0" aria-hidden />
        )}
        <WorkspaceEntryIcon kind={entry.kind} expanded={directoryExpanded} />
        <span>{entry.name}</span>
      </SidebarMenuButton>
      {directoryExpanded ? (
        <WorkspaceDirectoryChildren
          path={entry.path}
          depth={depth + 1}
          expanded={expanded}
          activePath={activePath}
          groupId={workspaceChildrenId(entry.path)}
          onToggleDirectory={onToggleDirectory}
          onSelect={onSelect}
        />
      ) : null}
    </SidebarMenuItem>
  );
}

function WorkspaceDirectoryChildren({
  path,
  depth,
  expanded,
  activePath,
  groupId,
  onToggleDirectory,
  onSelect,
}: {
  readonly path: string;
  readonly depth: number;
  readonly expanded: ReadonlySet<string>;
  readonly activePath: string | undefined;
  readonly groupId: string;
  readonly onToggleDirectory: (path: string) => void;
  readonly onSelect: (entry: WorkspaceEntry) => void;
}) {
  const listing = useAtomValue(workspaceDirectoryAtom(path));
  const [epoch, setEpoch] = useAtom(workspaceDirectoryEpochAtom(path));

  return (
    <WorkspaceDirectoryView
      listing={listing}
      depth={depth}
      expanded={expanded}
      activePath={activePath}
      isRoot={false}
      groupId={groupId}
      onRetry={() => {
        setEpoch(epoch + 1);
      }}
      onToggleDirectory={onToggleDirectory}
      onSelect={onSelect}
    />
  );
}

function WorkspaceEntryIcon({
  kind,
  expanded,
}: {
  readonly kind: WorkspaceEntry["kind"];
  readonly expanded: boolean;
}) {
  if (kind === "directory") {
    return expanded ? <FolderOpenIcon aria-hidden /> : <FolderIcon aria-hidden />;
  }
  if (kind === "symlink") {
    return <FileSymlinkIcon aria-hidden />;
  }
  return <FileIcon aria-hidden />;
}

const rowPadding = (depth: number): string => `${0.5 + depth * 0.75}rem`;

const workspaceChildrenId = (path: string): string =>
  `workspace-children-${path.replaceAll("/", ":")}`;
