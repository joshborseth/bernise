import { useAtom } from "@effect/atom-react";
import { XIcon } from "lucide-react";
import {
  closeWorkspaceFile,
  openWorkspaceFile,
  openWorkspaceFilesAtom,
  workspaceFileTabLabel,
} from "../workspace.ts";
import { cn } from "~/lib/utils";

export function FileTabStrip() {
  const [openFiles, setOpenFiles] = useAtom(openWorkspaceFilesAtom);

  return (
    <div className="file-strip flex min-w-0 items-center gap-1 px-2 py-1.5" aria-label="Open files">
      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:thin]"
        role="tablist"
        aria-label="Open files"
      >
        {openFiles.paths.map((path) => {
          const label = workspaceFileTabLabel(path, openFiles.paths);
          const active = openFiles.active === path;
          return (
            <div
              key={path}
              role="tab"
              aria-selected={active}
              className={cn(
                "flex max-w-52 shrink-0 items-center rounded-full border text-xs transition-colors",
                active
                  ? "border-[color-mix(in_srgb,var(--peach-deep)_55%,var(--line))] bg-[color-mix(in_srgb,var(--peach)_22%,var(--bg-elev))] font-medium text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--peach)_30%,transparent)]"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onMouseDown={(event) => {
                if (event.button !== 1) {
                  return;
                }
                event.preventDefault();
                setOpenFiles(closeWorkspaceFile(openFiles, path));
              }}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-2.5 py-1 text-left"
                title={path}
                onClick={() => {
                  setOpenFiles(openWorkspaceFile(openFiles, path));
                }}
              >
                {label}
              </button>
              <button
                type="button"
                className={cn(
                  "mr-1 rounded-full p-0.5 hover:bg-background/70",
                  active
                    ? "text-foreground/75 hover:text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={`Close ${label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenFiles(closeWorkspaceFile(openFiles, path));
                }}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
