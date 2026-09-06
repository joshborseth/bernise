import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

export function TabStrip({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="tab-strip"
      className={cn(
        "flex h-(--tab-strip-height) max-h-(--tab-strip-height) min-h-0 min-w-0 items-stretch overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

export function TabStripTrack({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="tablist"
      data-slot="tab-strip-track"
      className={cn(
        "flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden",
        className,
      )}
      {...props}
    />
  );
}

export function TabStripTab({
  selected = false,
  className,
  ...props
}: ComponentProps<"button"> & { readonly selected?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-slot="tab-strip-tab"
      data-active={selected ? "true" : undefined}
      className={cn(
        "relative flex h-full max-w-52 min-w-16 shrink-0 items-center gap-1 border-r border-border/80 px-3 text-left text-xs/relaxed text-muted-foreground outline-none select-none hover:bg-[color-mix(in_srgb,var(--peach)_28%,transparent)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30",
        selected &&
          "bg-card text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
        className,
      )}
      {...props}
    />
  );
}

export function TabStripActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="tab-strip-actions"
      className={cn(
        "flex flex-none items-center gap-1 border-l border-border/80 px-1.5",
        className,
      )}
      {...props}
    />
  );
}
