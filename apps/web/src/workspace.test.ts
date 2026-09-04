import { WorkspaceDirectoryListing, WorkspaceEntry, WorkspaceFsError } from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import { BerniseRpc } from "./rpc.ts";
import {
  activeWorkspaceEntryAtom,
  displayWorkspacePath,
  formatWorkspacePath,
  homePrefixFromPath,
  isSelectableWorkspaceEntry,
  workspaceDirectoryAtom,
  workspaceDirectoryEpochAtom,
  workspaceRootPath,
} from "./workspace.ts";

describe("formatWorkspacePath", () => {
  it("replaces a home prefix with a tilde", () => {
    expect(formatWorkspacePath("/Users/josh/Documents/bernise", "/Users/josh")).toBe(
      "~/Documents/bernise",
    );
  });

  it("collapses the home directory itself to a tilde", () => {
    expect(formatWorkspacePath("/Users/josh", "/Users/josh")).toBe("~");
  });

  it("leaves paths outside home unchanged", () => {
    expect(formatWorkspacePath("/tmp/workspace", "/Users/josh")).toBe("/tmp/workspace");
  });
});

describe("displayWorkspacePath", () => {
  it("infers a macOS home prefix", () => {
    expect(homePrefixFromPath("/Users/josh/Documents/bernise")).toBe("/Users/josh");
    expect(displayWorkspacePath("/Users/josh/Documents/bernise")).toBe("~/Documents/bernise");
  });

  it("infers a Linux home prefix", () => {
    expect(displayWorkspacePath("/home/josh/src/bernise")).toBe("~/src/bernise");
  });

  it("leaves tmp paths absolute", () => {
    expect(displayWorkspacePath("/tmp/bernise-station")).toBe("/tmp/bernise-station");
  });
});

const rootListing = new WorkspaceDirectoryListing({
  path: "",
  entries: [
    new WorkspaceEntry({ path: "src", name: "src", kind: "directory" }),
    new WorkspaceEntry({ path: "README.md", name: "README.md", kind: "file" }),
    new WorkspaceEntry({ path: "link", name: "link", kind: "symlink" }),
  ],
});

const isSettled = (value: AsyncResult.AsyncResult<unknown, unknown>): boolean =>
  !AsyncResult.isWaiting(value) && value._tag !== "Initial";

const waitUntilSettled = async (
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>>,
) => {
  if (isSettled(registry.get(atom))) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cancel();
      reject(new Error("atom did not settle"));
    }, 2000);
    const cancel = registry.subscribe(atom, (value) => {
      if (isSettled(value)) {
        clearTimeout(timeout);
        cancel();
        resolve();
      }
    });
    if (isSettled(registry.get(atom))) {
      clearTimeout(timeout);
      cancel();
      resolve();
    }
  });
};

const registryWithClient = (client: (tag: string, payload: unknown) => unknown) =>
  AtomRegistry.make({
    initialValues: [
      Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, client as never)),
    ],
  });

describe("workspace directory atoms", () => {
  it("loads the workspace root listing", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fakeClient = ((tag: string) => {
      switch (tag) {
        case "ListWorkspaceDirectory":
          return Effect.promise(() => gate).pipe(Effect.as(rootListing));
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = registryWithClient(fakeClient);
    const listingAtom = workspaceDirectoryAtom(workspaceRootPath);
    registry.mount(listingAtom);
    expect(AsyncResult.isWaiting(registry.get(listingAtom))).toBe(true);

    release?.();
    await waitUntilSettled(registry, listingAtom);
    const result = registry.get(listingAtom);
    expect(AsyncResult.isSuccess(result)).toBe(true);
    if (AsyncResult.isSuccess(result)) {
      expect(result.value).toEqual(rootListing);
    }
  });

  it("retries a failed root listing", async () => {
    let attempts = 0;
    const fakeClient = ((tag: string) => {
      switch (tag) {
        case "ListWorkspaceDirectory":
          attempts += 1;
          return attempts === 1
            ? Effect.fail(new WorkspaceFsError({ message: "Directory not found." }))
            : Effect.succeed(rootListing);
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = registryWithClient(fakeClient);
    const listingAtom = workspaceDirectoryAtom(workspaceRootPath);
    registry.mount(listingAtom);
    await waitUntilSettled(registry, listingAtom);
    const failed = registry.get(listingAtom);
    expect(AsyncResult.isFailure(failed)).toBe(true);

    registry.set(workspaceDirectoryEpochAtom(workspaceRootPath), 1);
    await waitUntilSettled(registry, listingAtom);
    const retried = registry.get(listingAtom);
    expect(AsyncResult.isSuccess(retried)).toBe(true);
    if (AsyncResult.isSuccess(retried)) {
      expect(retried.value).toEqual(rootListing);
    }
    expect(attempts).toBe(2);
  });

  it("replaces the single active entry without listing again", async () => {
    let attempts = 0;
    const fakeClient = ((tag: string) => {
      switch (tag) {
        case "ListWorkspaceDirectory":
          attempts += 1;
          return Effect.succeed(rootListing);
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = registryWithClient(fakeClient);
    const listingAtom = workspaceDirectoryAtom(workspaceRootPath);
    registry.mount(listingAtom);
    await waitUntilSettled(registry, listingAtom);

    expect(isSelectableWorkspaceEntry("directory")).toBe(false);
    expect(isSelectableWorkspaceEntry("file")).toBe(true);
    expect(isSelectableWorkspaceEntry("symlink")).toBe(true);

    registry.set(activeWorkspaceEntryAtom, "README.md");
    registry.set(activeWorkspaceEntryAtom, "link");
    expect(registry.get(activeWorkspaceEntryAtom)).toBe("link");
    expect(attempts).toBe(1);
  });
});
