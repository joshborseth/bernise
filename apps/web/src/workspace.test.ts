import { WorkspaceDirectoryListing, WorkspaceEntry, WorkspaceFsError } from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import { BerniseRpc } from "./rpc.ts";
import {
  activeWorkspaceEntryAtom,
  displayWorkspacePath,
  expandedWorkspaceDirectoriesAtom,
  formatWorkspacePath,
  homePrefixFromPath,
  isSelectableWorkspaceEntry,
  isWorkspaceDirectoryExpanded,
  toggleWorkspaceDirectoryExpanded,
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

const srcListing = new WorkspaceDirectoryListing({
  path: "src",
  entries: [
    new WorkspaceEntry({ path: "src/lib", name: "lib", kind: "directory" }),
    new WorkspaceEntry({ path: "src/index.ts", name: "index.ts", kind: "file" }),
  ],
});

const libListing = new WorkspaceDirectoryListing({
  path: "src/lib",
  entries: [new WorkspaceEntry({ path: "src/lib/util.ts", name: "util.ts", kind: "file" })],
});

const listingFor = (path: string): WorkspaceDirectoryListing => {
  if (path === workspaceRootPath) {
    return rootListing;
  }
  if (path === "src") {
    return srcListing;
  }
  if (path === "src/lib") {
    return libListing;
  }
  throw new Error(`unexpected path ${path}`);
};

const recordingListingClient = (requested: Array<string>) =>
  ((tag: string, payload: unknown) => {
    switch (tag) {
      case "ListWorkspaceDirectory": {
        const path = (payload as { readonly path: string }).path;
        requested.push(path);
        return Effect.succeed(listingFor(path));
      }
      default:
        return Effect.die(`unexpected ${tag}`);
    }
  }) as never;

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

describe("nested workspace directory atoms", () => {
  it("does not request nested directories until they are expanded", async () => {
    const requested: Array<string> = [];
    const registry = registryWithClient(recordingListingClient(requested));
    registry.mount(workspaceDirectoryAtom(workspaceRootPath));
    await waitUntilSettled(registry, workspaceDirectoryAtom(workspaceRootPath));

    expect(requested).toEqual([workspaceRootPath]);
    expect(
      isWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    ).toBe(false);
  });

  it("requests a nested listing only after that directory is expanded", async () => {
    const requested: Array<string> = [];
    const registry = registryWithClient(recordingListingClient(requested));
    registry.mount(workspaceDirectoryAtom(workspaceRootPath));
    await waitUntilSettled(registry, workspaceDirectoryAtom(workspaceRootPath));
    expect(requested).toEqual([workspaceRootPath]);

    registry.set(
      expandedWorkspaceDirectoriesAtom,
      toggleWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    );
    expect(
      isWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    ).toBe(true);
    expect(requested).toEqual([workspaceRootPath]);

    registry.mount(workspaceDirectoryAtom("src"));
    await waitUntilSettled(registry, workspaceDirectoryAtom("src"));
    expect(requested).toEqual([workspaceRootPath, "src"]);
  });

  it("reuses a cached nested listing after collapse and reopen", async () => {
    const requested: Array<string> = [];
    const registry = registryWithClient(recordingListingClient(requested));
    registry.mount(workspaceDirectoryAtom(workspaceRootPath));
    await waitUntilSettled(registry, workspaceDirectoryAtom(workspaceRootPath));

    registry.set(
      expandedWorkspaceDirectoriesAtom,
      toggleWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    );
    const unmountSrc = registry.mount(workspaceDirectoryAtom("src"));
    await waitUntilSettled(registry, workspaceDirectoryAtom("src"));
    expect(requested).toEqual([workspaceRootPath, "src"]);

    registry.set(
      expandedWorkspaceDirectoriesAtom,
      toggleWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    );
    unmountSrc();
    expect(
      isWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    ).toBe(false);

    registry.set(
      expandedWorkspaceDirectoriesAtom,
      toggleWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    );
    registry.mount(workspaceDirectoryAtom("src"));
    await waitUntilSettled(registry, workspaceDirectoryAtom("src"));
    expect(requested).toEqual([workspaceRootPath, "src"]);
    const cached = registry.get(workspaceDirectoryAtom("src"));
    expect(AsyncResult.isSuccess(cached)).toBe(true);
    if (AsyncResult.isSuccess(cached)) {
      expect(cached.value).toEqual(srcListing);
    }
  });

  it("retries only the failed nested directory", async () => {
    const attempts: Array<string> = [];
    const fakeClient = ((tag: string, payload: unknown) => {
      switch (tag) {
        case "ListWorkspaceDirectory": {
          const path = (payload as { readonly path: string }).path;
          attempts.push(path);
          if (path === "src" && attempts.filter((item) => item === "src").length === 1) {
            return Effect.fail(new WorkspaceFsError({ message: "Directory not found." }));
          }
          return Effect.succeed(listingFor(path));
        }
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = registryWithClient(fakeClient);
    registry.mount(workspaceDirectoryAtom(workspaceRootPath));
    await waitUntilSettled(registry, workspaceDirectoryAtom(workspaceRootPath));

    registry.set(
      expandedWorkspaceDirectoriesAtom,
      toggleWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    );
    registry.mount(workspaceDirectoryAtom("src"));
    await waitUntilSettled(registry, workspaceDirectoryAtom("src"));
    expect(AsyncResult.isFailure(registry.get(workspaceDirectoryAtom("src")))).toBe(true);

    registry.set(workspaceDirectoryEpochAtom("src"), 1);
    await waitUntilSettled(registry, workspaceDirectoryAtom("src"));
    expect(AsyncResult.isSuccess(registry.get(workspaceDirectoryAtom("src")))).toBe(true);
    expect(attempts).toEqual([workspaceRootPath, "src", "src"]);
    expect(AsyncResult.isSuccess(registry.get(workspaceDirectoryAtom(workspaceRootPath)))).toBe(
      true,
    );
  });

  it("keeps the active selection when expanding or collapsing directories", async () => {
    const requested: Array<string> = [];
    const registry = registryWithClient(recordingListingClient(requested));
    registry.mount(workspaceDirectoryAtom(workspaceRootPath));
    await waitUntilSettled(registry, workspaceDirectoryAtom(workspaceRootPath));
    registry.set(activeWorkspaceEntryAtom, "README.md");

    registry.set(
      expandedWorkspaceDirectoriesAtom,
      toggleWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    );
    const unmountSrc = registry.mount(workspaceDirectoryAtom("src"));
    await waitUntilSettled(registry, workspaceDirectoryAtom("src"));
    registry.set(activeWorkspaceEntryAtom, "src/index.ts");
    expect(registry.get(activeWorkspaceEntryAtom)).toBe("src/index.ts");

    registry.set(
      expandedWorkspaceDirectoriesAtom,
      toggleWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    );
    unmountSrc();
    expect(registry.get(activeWorkspaceEntryAtom)).toBe("src/index.ts");
    expect(requested).toEqual([workspaceRootPath, "src"]);
  });

  it("keeps descendant listings cached after collapsing an ancestor", async () => {
    const requested: Array<string> = [];
    const registry = registryWithClient(recordingListingClient(requested));
    registry.mount(workspaceDirectoryAtom(workspaceRootPath));
    await waitUntilSettled(registry, workspaceDirectoryAtom(workspaceRootPath));

    registry.set(
      expandedWorkspaceDirectoriesAtom,
      toggleWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    );
    const unmountSrc = registry.mount(workspaceDirectoryAtom("src"));
    await waitUntilSettled(registry, workspaceDirectoryAtom("src"));

    registry.set(
      expandedWorkspaceDirectoriesAtom,
      toggleWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src/lib"),
    );
    const unmountLib = registry.mount(workspaceDirectoryAtom("src/lib"));
    await waitUntilSettled(registry, workspaceDirectoryAtom("src/lib"));
    registry.set(activeWorkspaceEntryAtom, "src/lib/util.ts");
    expect(requested).toEqual([workspaceRootPath, "src", "src/lib"]);

    registry.set(
      expandedWorkspaceDirectoriesAtom,
      toggleWorkspaceDirectoryExpanded(registry.get(expandedWorkspaceDirectoriesAtom), "src"),
    );
    unmountLib();
    unmountSrc();
    expect(registry.get(activeWorkspaceEntryAtom)).toBe("src/lib/util.ts");
    expect(AsyncResult.isSuccess(registry.get(workspaceDirectoryAtom("src/lib")))).toBe(true);
    expect(requested).toEqual([workspaceRootPath, "src", "src/lib"]);
  });
});
