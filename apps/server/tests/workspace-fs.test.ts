import { WorkspaceDirectoryListing, WorkspaceEntry, WorkspaceFsError } from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceFs, WorkspaceFsLive } from "../src/WorkspaceFs.ts";
import { testConfig } from "./testLayers.ts";

const makeWorkspace = (): { readonly root: string; readonly outside: string } => {
  const root = mkdtempSync(join(tmpdir(), "bernise-ws-"));
  const outside = mkdtempSync(join(tmpdir(), "bernise-outside-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "README.md"), "readme");
  writeFileSync(join(root, ".env"), "secret=1");
  writeFileSync(join(root, "Zebra.txt"), "z");
  writeFileSync(join(root, "apple.txt"), "a");
  writeFileSync(join(root, "src", "index.ts"), "export {}");
  writeFileSync(join(outside, "secret.txt"), "nope");
  symlinkSync(join(root, "README.md"), join(root, "readme-link"));
  symlinkSync(outside, join(root, "escape"));
  return { root, outside };
};

const provideWorkspace =
  (root: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provide(WorkspaceFsLive),
      Effect.provide(testConfig({ BERNISE_WORKSPACE: root })),
    );

describe("WorkspaceFs", () => {
  it.effect("rejects parent traversal", () => {
    const { root } = makeWorkspace();
    return Effect.gen(function* () {
      const fs = yield* WorkspaceFs;
      expect(yield* fs.listDirectory("..").pipe(Effect.flip)).toEqual(
        new WorkspaceFsError({ message: "Workspace paths must stay inside the workspace." }),
      );
      expect(yield* fs.listDirectory("src/../..").pipe(Effect.flip)).toEqual(
        new WorkspaceFsError({ message: "Workspace paths must stay inside the workspace." }),
      );
    }).pipe(provideWorkspace(root));
  });

  it.effect("rejects absolute paths", () => {
    const { root } = makeWorkspace();
    return Effect.gen(function* () {
      const fs = yield* WorkspaceFs;
      expect(yield* fs.listDirectory("/etc").pipe(Effect.flip)).toEqual(
        new WorkspaceFsError({
          message: "Workspace paths must be relative to the workspace root.",
        }),
      );
      expect(yield* fs.listDirectory(root).pipe(Effect.flip)).toEqual(
        new WorkspaceFsError({
          message: "Workspace paths must be relative to the workspace root.",
        }),
      );
    }).pipe(provideWorkspace(root));
  });

  it.effect("rejects a canonical escape through a symbolic link", () => {
    const { root } = makeWorkspace();
    return Effect.gen(function* () {
      const fs = yield* WorkspaceFs;
      expect(yield* fs.listDirectory("escape").pipe(Effect.flip)).toEqual(
        new WorkspaceFsError({ message: "Workspace paths must stay inside the workspace." }),
      );
    }).pipe(provideWorkspace(root));
  });

  it.effect("rejects a missing path", () => {
    const { root } = makeWorkspace();
    return Effect.gen(function* () {
      const fs = yield* WorkspaceFs;
      expect(yield* fs.listDirectory("missing").pipe(Effect.flip)).toEqual(
        new WorkspaceFsError({ message: "Directory not found." }),
      );
    }).pipe(provideWorkspace(root));
  });

  it.effect("rejects a non-directory path", () => {
    const { root } = makeWorkspace();
    return Effect.gen(function* () {
      const fs = yield* WorkspaceFs;
      expect(yield* fs.listDirectory("README.md").pipe(Effect.flip)).toEqual(
        new WorkspaceFsError({ message: "Not a directory." }),
      );
    }).pipe(provideWorkspace(root));
  });

  it.effect("lists the root with relative paths, filters, and deterministic order", () => {
    const { root } = makeWorkspace();
    return Effect.gen(function* () {
      const fs = yield* WorkspaceFs;
      const listing = yield* fs.listDirectory("");
      expect(listing).toEqual(
        new WorkspaceDirectoryListing({
          path: "",
          entries: [
            new WorkspaceEntry({ path: "src", name: "src", kind: "directory" }),
            new WorkspaceEntry({ path: ".env", name: ".env", kind: "file" }),
            new WorkspaceEntry({ path: "apple.txt", name: "apple.txt", kind: "file" }),
            new WorkspaceEntry({ path: "escape", name: "escape", kind: "symlink" }),
            new WorkspaceEntry({ path: "readme-link", name: "readme-link", kind: "symlink" }),
            new WorkspaceEntry({ path: "README.md", name: "README.md", kind: "file" }),
            new WorkspaceEntry({ path: "Zebra.txt", name: "Zebra.txt", kind: "file" }),
          ],
        }),
      );
    }).pipe(provideWorkspace(root));
  });
});
