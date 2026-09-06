import { describe, expect, it } from "@effect/vitest";
import { formatHotkeyCaption, labeledHotkeyRows } from "./hotkeys.ts";

describe("formatHotkeyCaption", () => {
  it("formats Mod+T as ⌘T on Mac", () => {
    expect(formatHotkeyCaption("Mod+T", "mac")).toBe("⌘T");
  });

  it("formats Mod+T as Ctrl+T on Windows", () => {
    expect(formatHotkeyCaption("Mod+T", "windows")).toBe("Ctrl+T");
  });
});

describe("labeledHotkeyRows", () => {
  it("gives every hotkey a human-readable label and a key caption", () => {
    const listed = labeledHotkeyRows(
      [
        { hotkey: "Mod+T", label: "New thread" },
        { hotkey: "Mod+W", label: "Archive thread" },
        { hotkey: "Mod+1", label: "Switch to thread 1" },
        { hotkey: "Mod+9", label: "Switch to thread 9" },
        { hotkey: "Mod+/", label: "Keyboard shortcuts" },
      ],
      "mac",
    );
    expect(listed.length).toBeGreaterThan(0);
    for (const item of listed) {
      expect(item.label).toMatch(/\S/);
      expect(item.keys).toMatch(/\S/);
    }
  });

  it("collapses numbered thread switches and keeps the other names", () => {
    const listed = labeledHotkeyRows(
      [
        { hotkey: "Mod+T", label: "New thread" },
        { hotkey: "Mod+W", label: "Archive thread" },
        { hotkey: "Mod+1", label: "Switch to thread 1" },
        { hotkey: "Mod+2", label: "Switch to thread 2" },
        { hotkey: "Mod+3", label: "Switch to thread 3" },
        { hotkey: "Mod+/", label: "Keyboard shortcuts" },
      ],
      "mac",
    );
    expect(listed).toEqual([
      { label: "New thread", keys: "⌘T" },
      { label: "Archive thread", keys: "⌘W" },
      { label: "Switch to thread", keys: "⌘1–3" },
      { label: "Keyboard shortcuts", keys: "⌘/" },
      { label: "Speak", keys: "Enter" },
    ]);
  });

  it("dedupes the shortcuts overlay when both ? and Mod+/ are registered", () => {
    const listed = labeledHotkeyRows(
      [
        { hotkey: "Mod+/", label: "Keyboard shortcuts" },
        { hotkey: "?", label: "Keyboard shortcuts" },
      ],
      "windows",
    );
    expect(listed.filter((item) => item.label === "Keyboard shortcuts")).toEqual([
      { label: "Keyboard shortcuts", keys: "Ctrl+/" },
    ]);
  });
});
