export type Chord = {
  readonly key: string;
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
};

export type ListedHotkeyId =
  | "newThread"
  | "searchThreads"
  | "openPersona"
  | "showShortcuts"
  | "jumpThread"
  | "speak"
  | "cancel";

export type ListedHotkey = {
  readonly id: ListedHotkeyId;
  readonly label: string;
  readonly chord: Chord;
};

export type ShortcutEvent = {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
  readonly isComposing: boolean;
};

export type HotkeyMatch =
  | { readonly id: "newThread" }
  | { readonly id: "searchThreads" }
  | { readonly id: "openPersona" }
  | { readonly id: "showShortcuts" }
  | { readonly id: "jumpThread"; readonly index: number };

export const listedHotkeyCatalog: ReadonlyArray<ListedHotkey> = [
  { id: "newThread", label: "New thread", chord: { key: "n", mod: true } },
  { id: "searchThreads", label: "Search threads", chord: { key: "k", mod: true } },
  { id: "jumpThread", label: "Jump to thread", chord: { key: "1–9", mod: true } },
  { id: "openPersona", label: "Bernise Persona", chord: { key: ",", mod: true } },
  { id: "speak", label: "Speak", chord: { key: "Enter" } },
  { id: "cancel", label: "Cancel or clear search", chord: { key: "Esc" } },
  { id: "showShortcuts", label: "Keyboard shortcuts", chord: { key: "/", mod: true } },
];

export const isMacPlatform = (platform: string): boolean => /Mac|iPhone|iPod|iPad/i.test(platform);

const formatKeyCaption = (key: string): string => {
  if (key === " ") {
    return "Space";
  }
  if (key === "escape") {
    return "Esc";
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key.slice(0, 1).toUpperCase() + key.slice(1);
};

export const formatChord = (chord: Chord, platform: string): string => {
  const keyLabel = formatKeyCaption(chord.key);
  if (isMacPlatform(platform)) {
    return `${chord.alt === true ? "⌥" : ""}${chord.shift === true ? "⇧" : ""}${chord.mod === true ? "⌘" : ""}${keyLabel}`;
  }
  const parts: Array<string> = [];
  if (chord.mod === true) {
    parts.push("Ctrl");
  }
  if (chord.alt === true) {
    parts.push("Alt");
  }
  if (chord.shift === true) {
    parts.push("Shift");
  }
  parts.push(keyLabel);
  return parts.join("+");
};

export const listedHotkeys = (
  platform: string,
): ReadonlyArray<{ readonly id: ListedHotkeyId; readonly label: string; readonly keys: string }> =>
  listedHotkeyCatalog.map((item) => ({
    id: item.id,
    label: item.label,
    keys: formatChord(item.chord, platform),
  }));

export const chordLabelFor = (id: ListedHotkeyId, platform: string): string => {
  const item = listedHotkeyCatalog.find((entry) => entry.id === id);
  if (item === undefined) {
    return "";
  }
  return formatChord(item.chord, platform);
};

export const threadJumpChordLabel = (index: number, platform: string): string =>
  formatChord({ key: String(index + 1), mod: true }, platform);

const hasMod = (event: ShortcutEvent, platform: string): boolean =>
  isMacPlatform(platform) ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;

export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

export const shouldShowThreadJumpHints = (event: ShortcutEvent, platform: string): boolean =>
  hasMod(event, platform) && !event.altKey && !event.shiftKey;

const normalizedKey = (key: string): string => (key === "Escape" ? "esc" : key.toLowerCase());

export const matchHotkey = (
  event: ShortcutEvent,
  platform: string,
  options?: { readonly typing?: boolean },
): HotkeyMatch | undefined => {
  if (event.repeat || event.isComposing) {
    return undefined;
  }
  const key = normalizedKey(event.key);
  const mod = hasMod(event, platform);
  const typing = options?.typing === true;

  if (mod && !event.altKey && !event.shiftKey && key >= "1" && key <= "9") {
    return { id: "jumpThread", index: Number(key) - 1 };
  }

  if (mod && !event.altKey && !event.shiftKey && key === "n") {
    return { id: "newThread" };
  }
  if (mod && !event.altKey && !event.shiftKey && key === "k") {
    return { id: "searchThreads" };
  }
  if (mod && !event.altKey && !event.shiftKey && key === ",") {
    return { id: "openPersona" };
  }
  if (mod && !event.altKey && !event.shiftKey && (key === "/" || key === "?")) {
    return { id: "showShortcuts" };
  }
  if (!mod && !event.altKey && !event.ctrlKey && !event.metaKey && key === "?" && !typing) {
    return { id: "showShortcuts" };
  }
  return undefined;
};

export const shortcutEventFromKeyboard = (event: KeyboardEvent): ShortcutEvent => ({
  key: event.key,
  metaKey: event.metaKey,
  ctrlKey: event.ctrlKey,
  shiftKey: event.shiftKey,
  altKey: event.altKey,
  repeat: event.repeat,
  isComposing: event.isComposing,
});
