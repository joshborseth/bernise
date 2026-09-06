import { formatForDisplay } from "@tanstack/hotkeys";

export const newThreadHotkey = "Mod+T";
export const archiveThreadHotkey = "Mod+W";
export const shortcutsHotkey = "Mod+/";

export type LabeledHotkey = {
  readonly label: string;
  readonly keys: string;
};

export type HotkeyRegistrationInput = {
  readonly hotkey: string;
  readonly label: string | undefined;
};

const threadSwitchDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

type ThreadSwitchDigit = (typeof threadSwitchDigits)[number];

export const threadSwitchHotkeys: ReadonlyArray<{
  readonly hotkey: `Mod+${ThreadSwitchDigit}`;
  readonly label: string;
  readonly digit: ThreadSwitchDigit;
}> = threadSwitchDigits.map((digit) => ({
  hotkey: `Mod+${digit}`,
  label: `Switch to thread ${String(digit)}`,
  digit,
}));

export const threadHotkeyCatalog: ReadonlyArray<HotkeyRegistrationInput> = [
  { hotkey: newThreadHotkey, label: "New thread" },
  { hotkey: archiveThreadHotkey, label: "Archive thread" },
  ...threadSwitchHotkeys.map(({ hotkey, label }) => ({ hotkey, label })),
  { hotkey: shortcutsHotkey, label: "Keyboard shortcuts" },
];

export const listedAppHotkeys = (
  platform?: "mac" | "windows" | "linux",
): ReadonlyArray<LabeledHotkey> => labeledHotkeyRows(threadHotkeyCatalog, platform);

const switchThreadName = /^Switch to thread (\d+)$/;
const switchThreadHotkey = /^Mod\+(\d)$/;

export const formatHotkeyCaption = (
  hotkey: string,
  platform?: "mac" | "windows" | "linux",
): string => {
  const formatted = formatForDisplay(hotkey, platform === undefined ? undefined : { platform });
  return formatted.replaceAll(" ", "");
};

const switchThreadKeys = (
  digits: ReadonlyArray<string>,
  platform?: "mac" | "windows" | "linux",
): string => {
  const first = formatHotkeyCaption(`Mod+${digits[0] ?? "1"}`, platform);
  if (digits.length <= 1) {
    return first;
  }
  return `${first}–${digits[digits.length - 1] ?? ""}`;
};

export const labeledHotkeyRows = (
  registrations: ReadonlyArray<HotkeyRegistrationInput>,
  platform?: "mac" | "windows" | "linux",
): ReadonlyArray<LabeledHotkey> => {
  const rows: Array<LabeledHotkey> = [];
  const seenLabels = new Set<string>();
  let switchDigits: Array<string> = [];

  const flushSwitch = () => {
    if (switchDigits.length === 0) {
      return;
    }
    rows.push({
      label: "Switch to thread",
      keys: switchThreadKeys(switchDigits, platform),
    });
    seenLabels.add("Switch to thread");
    switchDigits = [];
  };

  for (const registration of registrations) {
    const label = registration.label?.trim() ?? "";
    const nameMatch = label.match(switchThreadName);
    const hotkeyMatch = registration.hotkey.match(switchThreadHotkey);
    if (nameMatch !== null && hotkeyMatch !== null && nameMatch[1] === hotkeyMatch[1]) {
      switchDigits.push(hotkeyMatch[1] ?? "");
      continue;
    }
    flushSwitch();
    if (label.length === 0 || seenLabels.has(label)) {
      continue;
    }
    seenLabels.add(label);
    rows.push({
      label,
      keys: formatHotkeyCaption(registration.hotkey, platform),
    });
  }
  flushSwitch();

  if (!seenLabels.has("Speak")) {
    rows.push({ label: "Speak", keys: "Enter" });
  }
  return rows;
};
