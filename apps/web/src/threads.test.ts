import { ThreadId, ThreadShell } from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import {
  activeThreadStorageKey,
  activeThreadStorageKeyFor,
  closeActiveThread,
  listThreadItems,
  threadIdAtHotkeyIndex,
} from "./threads.ts";

describe("activeThreadStorageKeyFor", () => {
  it("keeps active thread selection separate for each workspace", () => {
    expect(activeThreadStorageKeyFor("/project/a")).toBe(`${activeThreadStorageKey}:/project/a`);
    expect(activeThreadStorageKeyFor("/project/b")).not.toBe(
      activeThreadStorageKeyFor("/project/a"),
    );
  });
});

describe("threadIdAtHotkeyIndex", () => {
  const shell = (id: string, updatedAt: string) =>
    new ThreadShell({
      id: ThreadId.make(id),
      title: id,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt,
    });

  it("maps Mod+1 to the first on-screen item, including a draft", () => {
    const draftId = ThreadId.make("draft");
    const items = listThreadItems([shell("older", "2026-01-01T00:00:00.000Z")], draftId);
    expect(threadIdAtHotkeyIndex(items, 1)).toBe(draftId);
    expect(threadIdAtHotkeyIndex(items, 2)).toBe("older");
  });

  it("maps Mod+9 to the ninth item and ignores out-of-range digits", () => {
    const threads = Array.from({ length: 10 }, (_, index) =>
      shell(`t${String(index)}`, `2026-01-01T00:00:${String(10 - index).padStart(2, "0")}.000Z`),
    );
    const items = listThreadItems(threads, threads[0]?.id);
    expect(threadIdAtHotkeyIndex(items, 9)).toBe("t8");
    expect(threadIdAtHotkeyIndex(items, 10)).toBeUndefined();
    expect(threadIdAtHotkeyIndex(items, 0)).toBeUndefined();
  });
});

describe("closeActiveThread", () => {
  const shell = (id: string, updatedAt: string) =>
    new ThreadShell({
      id: ThreadId.make(id),
      title: id,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt,
    });

  it("archives a persisted active thread", () => {
    const active = shell("active", "2026-01-01T00:00:02.000Z");
    const other = shell("other", "2026-01-01T00:00:01.000Z");
    const items = listThreadItems([active, other], active.id);
    expect(closeActiveThread(items, active.id)).toEqual({
      kind: "archive",
      threadId: active.id,
    });
  });

  it("discards a draft by switching to the next listed thread", () => {
    const draftId = ThreadId.make("draft");
    const remaining = shell("kept", "2026-01-01T00:00:00.000Z");
    const items = listThreadItems([remaining], draftId);
    expect(closeActiveThread(items, draftId)).toEqual({
      kind: "discard",
      nextId: remaining.id,
    });
  });

  it("discards a lone draft with no next thread", () => {
    const draftId = ThreadId.make("draft");
    const items = listThreadItems([], draftId);
    expect(closeActiveThread(items, draftId)).toEqual({
      kind: "discard",
      nextId: undefined,
    });
  });
});
