import { describe, expect, it } from "@effect/vitest";
import { FileSaveCoordinator } from "./fileSaveCoordinator.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("FileSaveCoordinator", () => {
  it("debounces rapid edits into one persist of the latest contents", async () => {
    const persisted: Array<string> = [];
    const pending: Array<boolean> = [];
    const coordinator = new FileSaveCoordinator({
      debounceMs: 30,
      persist: async (contents) => {
        persisted.push(contents);
      },
      onPendingChange: (value) => {
        pending.push(value);
      },
      onConfirmed: () => undefined,
      onFailed: () => undefined,
    });

    coordinator.change("one");
    coordinator.change("two");
    coordinator.change("three");
    await wait(80);
    expect(persisted).toEqual(["three"]);
    expect(pending[0]).toBe(true);
    expect(pending.at(-1)).toBe(false);
    coordinator.dispose();
  });
});
