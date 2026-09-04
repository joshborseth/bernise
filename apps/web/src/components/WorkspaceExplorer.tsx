import { type WorkspaceEntry, type WorkspaceInfo } from "@bernise/contracts";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { FileIcon, FileSymlinkIcon, FolderIcon } from "lucide-react";
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
  isSelectableWorkspaceEntry,
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

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Workspace">
      <SidebarHeader className="gap-1 px-2 pt-3 pb-2">
        <p className="font-display m-0 px-1 text-[0.95rem] leading-none font-semibold tracking-[-0.02em] italic">
          Workspace
        </p>
        <WorkspacePlaque workspace={workspace} />
      </SidebarHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspaceListing
          listing={listing}
          activePath={activePath}
          onRetry={() => {
            setEpoch(epoch + 1);
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

function WorkspaceListing({
  listing,
  activePath,
  onRetry,
  onSelect,
}: {
  readonly listing: AsyncResult.AsyncResult<
    { readonly entries: ReadonlyArray<WorkspaceEntry> },
    unknown
  >;
  readonly activePath: string | undefined;
  readonly onRetry: () => void;
  readonly onSelect: (entry: WorkspaceEntry) => void;
}) {
  if (AsyncResult.isFailure(listing) && !Cause.hasInterruptsOnly(listing.cause)) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="grid gap-2 px-2 py-4" role="alert">
            <p className="m-0 text-center text-xs text-destructive">
              {formatError(Cause.squash(listing.cause))}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="justify-self-center"
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (!AsyncResult.isSuccess(listing)) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <p className="px-2 py-8 text-center text-xs text-muted-foreground" aria-live="polite">
            Loading workspace…
          </p>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (listing.value.entries.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">No files</p>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-px" role="tree" aria-label="Workspace files">
          {listing.value.entries.map((entry) => {
            const selected = activePath === entry.path;
            const selectable = isSelectableWorkspaceEntry(entry.kind);
            return (
              <SidebarMenuItem key={entry.path} role="none">
                <SidebarMenuButton
                  isActive={selected}
                  tooltip={entry.name}
                  title={entry.name}
                  role="treeitem"
                  aria-label={entry.name}
                  aria-selected={selectable ? selected : undefined}
                  className={cn(
                    "h-8",
                    selected &&
                      "shadow-[inset_3px_0_0_var(--peach-deep)] data-active:bg-[color-mix(in_srgb,var(--peach)_62%,white)]",
                  )}
                  onClick={() => {
                    onSelect(entry);
                  }}
                >
                  <WorkspaceEntryIcon kind={entry.kind} />
                  <span>{entry.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function WorkspaceEntryIcon({ kind }: { readonly kind: WorkspaceEntry["kind"] }) {
  if (kind === "directory") {
    return <FolderIcon aria-hidden />;
  }
  if (kind === "symlink") {
    return <FileSymlinkIcon aria-hidden />;
  }
  return <FileIcon aria-hidden />;
}
