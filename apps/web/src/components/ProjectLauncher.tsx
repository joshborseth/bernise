import { FolderOpenIcon, HistoryIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { type RecentProject } from "../desktop.ts";
import { Button } from "~/components/ui/button";

export function ProjectLauncher({
  recentProjects,
  busy,
  error,
  onBrowse,
  onOpen,
  onCancel,
}: {
  readonly recentProjects: ReadonlyArray<RecentProject>;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onBrowse: () => void;
  readonly onOpen: (path: string) => void;
  readonly onCancel: (() => void) | undefined;
}) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-6 py-10 text-foreground">
      <section className="relative w-full max-w-3xl overflow-hidden rounded-4xl border border-border bg-card">
        <div className="grid gap-8 px-7 py-8 sm:px-10 sm:py-10">
          <header className="grid gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="m-0 text-[0.7rem] font-semibold tracking-[0.2em] text-[color-mix(in_srgb,var(--peach-deep)_88%,var(--ink))] uppercase">
                  Bernise station
                </p>
                <h1 className="font-display mt-2 mb-0 text-4xl leading-none font-semibold tracking-[-0.045em] italic sm:text-5xl">
                  Pick a project to grill.
                </h1>
              </div>
              {onCancel === undefined ? null : (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Close project launcher"
                  disabled={busy}
                  onClick={onCancel}
                >
                  <XIcon aria-hidden />
                </Button>
              )}
            </div>
            <p className="m-0 max-w-xl text-sm leading-6 text-muted-foreground">
              Each directory is its own workspace, with its own threads and Codex context.
            </p>
          </header>

          <Button
            type="button"
            size="lg"
            className="h-14 justify-start rounded-2xl px-5 text-base"
            disabled={busy}
            onClick={onBrowse}
          >
            {busy ? (
              <LoaderCircleIcon className="animate-spin" aria-hidden />
            ) : (
              <FolderOpenIcon aria-hidden />
            )}
            {busy ? "Opening workspace…" : "Browse for a project"}
          </Button>

          {error === undefined ? null : (
            <p
              className="m-0 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              <HistoryIcon className="size-3.5" aria-hidden />
              Recent projects
            </div>
            {recentProjects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
                Recent projects will appear here.
              </div>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {recentProjects.map((project, index) => (
                  <li key={project.path}>
                    <button
                      type="button"
                      className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-border bg-background/55 px-4 py-3 text-left transition-[transform,border-color,background-color] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--peach-deep)_45%,var(--line))] hover:bg-background disabled:pointer-events-none disabled:opacity-55"
                      disabled={busy}
                      onClick={() => {
                        onOpen(project.path);
                      }}
                    >
                      <span className="grid size-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--peach)_22%,var(--bg))] text-[color-mix(in_srgb,var(--peach-deep)_90%,var(--ink))]">
                        <FolderOpenIcon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{project.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {project.path}
                        </span>
                      </span>
                      <span className="font-display text-lg text-muted-foreground/55 italic">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
