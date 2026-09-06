import {
  createFileTreeIconResolver,
  getBuiltInSpriteSheet,
  type FileTreeIcons,
} from "@pierre/trees";

export interface PierreIconResolution {
  name: string;
  token?: string;
}

const PIERRE_ICON_SPRITE_ID = "bernise-pierre-file-icon-sprite";

const BERNISE_FILE_ICONS = {
  set: "complete",
  colored: true,
} satisfies FileTreeIcons;

const iconResolver = createFileTreeIconResolver(BERNISE_FILE_ICONS);

export const resolvePierreIconForEntry = (
  pathValue: string,
  kind: "file" | "directory",
): PierreIconResolution | null => {
  if (kind === "directory") {
    return null;
  }
  return iconResolver.resolveIcon("file-tree-icon-file", pathValue);
};

export const ensurePierreIconSprite = (): void => {
  if (typeof document === "undefined" || document.getElementById(PIERRE_ICON_SPRITE_ID)) {
    return;
  }
  const container = document.createElement("div");
  container.id = PIERRE_ICON_SPRITE_ID;
  container.setAttribute("aria-hidden", "true");
  container.style.position = "absolute";
  container.style.width = "0";
  container.style.height = "0";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.innerHTML = getBuiltInSpriteSheet("complete");
  document.body.prepend(container);
};
