import { describe, expect, it } from "@effect/vitest";
import {
  formatChord,
  listedHotkeys,
  matchHotkey,
  shouldShowThreadJumpHints,
  type ShortcutEvent,
} from "./hotkeys.ts";

const macEvent = (
  overrides: Partial<ShortcutEvent> & Pick<ShortcutEvent, "key">,
): ShortcutEvent => ({
  key: overrides.key,
  metaKey: overrides.metaKey ?? false,
  ctrlKey: overrides.ctrlKey ?? false,
  shiftKey: overrides.shiftKey ?? false,
  altKey: overrides.altKey ?? false,
  repeat: overrides.repeat ?? false,
  isComposing: overrides.isComposing ?? false,
});

describe("listedHotkeys", () => {
  it("gives every hotkey a human-readable label and a key caption", () => {
    const listed = listedHotkeys("MacIntel");
    expect(listed.length).toBeGreaterThan(0);
    for (const item of listed) {
      expect(item.label).toMatch(/\S/);
      expect(item.keys).toMatch(/\S/);
    }
  });

  it("labels jump, new thread, search, persona, speak, and shortcuts", () => {
    const byId = Object.fromEntries(listedHotkeys("MacIntel").map((item) => [item.id, item]));
    expect(byId.newThread?.label).toBe("New thread");
    expect(byId.searchThreads?.label).toBe("Search threads");
    expect(byId.openPersona?.label).toBe("Bernise Persona");
    expect(byId.showShortcuts?.label).toBe("Keyboard shortcuts");
    expect(byId.jumpThread?.label).toBe("Jump to thread");
    expect(byId.speak?.label).toBe("Speak");
    expect(byId.cancel?.label).toBe("Cancel or clear search");
  });
});

describe("formatChord", () => {
  it("formats a Mac new-thread shortcut as ⌘N", () => {
    expect(formatChord({ key: "n", mod: true }, "MacIntel")).toBe("⌘N");
  });

  it("formats a Windows new-thread shortcut as Ctrl+N", () => {
    expect(formatChord({ key: "n", mod: true }, "Win32")).toBe("Ctrl+N");
  });

  it("formats thread jump range as ⌘1–9 on Mac", () => {
    expect(formatChord({ key: "1–9", mod: true }, "MacIntel")).toBe("⌘1–9");
  });

  it("formats Enter without a modifier", () => {
    expect(formatChord({ key: "Enter" }, "MacIntel")).toBe("Enter");
  });
});

describe("matchHotkey", () => {
  it("matches Cmd+N to new thread on Mac", () => {
    expect(matchHotkey(macEvent({ key: "n", metaKey: true }), "MacIntel")).toEqual({
      id: "newThread",
    });
  });

  it("matches Ctrl+N to new thread on Windows", () => {
    expect(matchHotkey(macEvent({ key: "N", ctrlKey: true }), "Win32")).toEqual({
      id: "newThread",
    });
  });

  it("matches Cmd+3 to jump thread index 2", () => {
    expect(matchHotkey(macEvent({ key: "3", metaKey: true }), "MacIntel")).toEqual({
      id: "jumpThread",
      index: 2,
    });
  });

  it("does not match n without a modifier", () => {
    expect(matchHotkey(macEvent({ key: "n" }), "MacIntel")).toBeUndefined();
  });

  it("matches ? to show shortcuts when not typing", () => {
    expect(matchHotkey(macEvent({ key: "?" }), "MacIntel", { typing: false })).toEqual({
      id: "showShortcuts",
    });
  });

  it("does not match ? while typing", () => {
    expect(matchHotkey(macEvent({ key: "?" }), "MacIntel", { typing: true })).toBeUndefined();
  });

  it("matches Cmd+/ to show shortcuts while typing", () => {
    expect(
      matchHotkey(macEvent({ key: "/", metaKey: true }), "MacIntel", { typing: true }),
    ).toEqual({
      id: "showShortcuts",
    });
  });

  it("ignores repeating and composing events", () => {
    expect(
      matchHotkey(macEvent({ key: "n", metaKey: true, repeat: true }), "MacIntel"),
    ).toBeUndefined();
    expect(
      matchHotkey(macEvent({ key: "n", metaKey: true, isComposing: true }), "MacIntel"),
    ).toBeUndefined();
  });
});

describe("shouldShowThreadJumpHints", () => {
  it("shows hints while the jump modifier is held alone", () => {
    expect(shouldShowThreadJumpHints(macEvent({ key: "Meta", metaKey: true }), "MacIntel")).toBe(
      true,
    );
    expect(shouldShowThreadJumpHints(macEvent({ key: "Control", ctrlKey: true }), "Win32")).toBe(
      true,
    );
  });

  it("hides hints when extra modifiers are held", () => {
    expect(
      shouldShowThreadJumpHints(
        macEvent({ key: "Meta", metaKey: true, shiftKey: true }),
        "MacIntel",
      ),
    ).toBe(false);
  });
});
