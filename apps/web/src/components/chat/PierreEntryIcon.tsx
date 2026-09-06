import { FileIcon, FolderIcon } from "lucide-react";
import { memo, useInsertionEffect, useMemo } from "react";
import { ensurePierreIconSprite, resolvePierreIconForEntry } from "../../pierre-icons.ts";
import { cn } from "~/lib/utils";

export const PierreEntryIcon = memo(function PierreEntryIcon(props: {
  pathValue: string;
  kind: "file" | "directory";
  className?: string;
}) {
  useInsertionEffect(ensurePierreIconSprite, []);
  const icon = useMemo(
    () => resolvePierreIconForEntry(props.pathValue, props.kind),
    [props.kind, props.pathValue],
  );

  if (!icon) {
    return props.kind === "directory" ? (
      <FolderIcon className={cn("size-4 text-muted-foreground", props.className)} />
    ) : (
      <FileIcon className={cn("size-4 text-muted-foreground", props.className)} />
    );
  }

  return (
    <svg className={cn("size-3.5 shrink-0", props.className)} aria-hidden>
      <use href={`#${icon.name}`} />
    </svg>
  );
});
