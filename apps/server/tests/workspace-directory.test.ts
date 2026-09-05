import {
  BerniseRpcs,
  ProviderError,
  WorkspaceDirectoryListing,
  WorkspaceEntry,
  WorkspaceFsError,
  WorkspaceInfo,
} from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Stream } from "effect";
import { RpcTest } from "effect/unstable/rpc";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { threadPersistenceMemory } from "../src/persistence/ThreadPersistence.ts";
import { Provider } from "../src/Provider.ts";
import { providerHealthMemory } from "../src/ProviderHealth.ts";
import { RpcHandlersLive } from "../src/RpcLive.ts";
import { serverSettingsMemory } from "../src/ServerSettings.ts";
import { pendingSnapshots, testConfig } from "./testLayers.ts";

const sessionIdStub = Layer.succeed(
  Provider,
  Provider.of({
    startSession: () => Effect.fail(new ProviderError({ message: "stub" })),
    sendTurn: () => Effect.fail(new ProviderError({ message: "stub" })),
    subscribeEvents: () => Stream.fail(new ProviderError({ message: "stub" })),
    consumeAssistantText: () => Effect.succeed(""),
    listModels: Effect.fail(new ProviderError({ message: "stub" })),
  }),
);

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "bernise-rpc-ws-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "src", "lib"));
  mkdirSync(join(root, "src", ".git"));
  mkdirSync(join(root, "src", "node_modules"));
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "README.md"), "readme");
  writeFileSync(join(root, ".env"), "secret=1");
  writeFileSync(join(root, "Apple.ts"), "");
  writeFileSync(join(root, "zebra.ts"), "");
  writeFileSync(join(root, "src", "index.ts"), "export {}");
  writeFileSync(join(root, "src", ".env.local"), "nested=1");
  writeFileSync(join(root, "src", "lib", "util.ts"), "export {}");
  writeFileSync(join(root, "src", "node_modules", "pkg.js"), "");
  symlinkSync(join(root, "README.md"), join(root, "readme-link"));
  symlinkSync(join(root, "src", "index.ts"), join(root, "src", "index-link"));
  return root;
};

const rpcLayer = (workspace: string) =>
  RpcHandlersLive.pipe(
    Layer.provide(sessionIdStub),
    Layer.provide(threadPersistenceMemory),
    Layer.provide(serverSettingsMemory()),
    Layer.provide(providerHealthMemory(pendingSnapshots())),
    Layer.provide(testConfig({ BERNISE_WORKSPACE: workspace })),
  );

describe("ListWorkspaceDirectory", () => {
  it.effect("lists the workspace root with relative paths, filters, and order", () => {
    const root = makeRoot();
    return Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(BerniseRpcs);
      expect(yield* client.GetWorkspace()).toEqual(
        new WorkspaceInfo({ path: root, name: basename(root) }),
      );
      expect(yield* client.ListWorkspaceDirectory({ path: "" })).toEqual(
        new WorkspaceDirectoryListing({
          path: "",
          entries: [
            new WorkspaceEntry({ path: "src", name: "src", kind: "directory" }),
            new WorkspaceEntry({ path: ".env", name: ".env", kind: "file" }),
            new WorkspaceEntry({ path: "Apple.ts", name: "Apple.ts", kind: "file" }),
            new WorkspaceEntry({ path: "readme-link", name: "readme-link", kind: "symlink" }),
            new WorkspaceEntry({ path: "README.md", name: "README.md", kind: "file" }),
            new WorkspaceEntry({ path: "zebra.ts", name: "zebra.ts", kind: "file" }),
          ],
        }),
      );
    }).pipe(Effect.provide(rpcLayer(root)));
  });

  it.effect("lists a nested directory with relative paths, filters, and order", () => {
    const root = makeRoot();
    return Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(BerniseRpcs);
      expect(yield* client.ListWorkspaceDirectory({ path: "src" })).toEqual(
        new WorkspaceDirectoryListing({
          path: "src",
          entries: [
            new WorkspaceEntry({ path: "src/lib", name: "lib", kind: "directory" }),
            new WorkspaceEntry({ path: "src/.env.local", name: ".env.local", kind: "file" }),
            new WorkspaceEntry({ path: "src/index-link", name: "index-link", kind: "symlink" }),
            new WorkspaceEntry({ path: "src/index.ts", name: "index.ts", kind: "file" }),
          ],
        }),
      );
      expect(yield* client.ListWorkspaceDirectory({ path: "src/lib" })).toEqual(
        new WorkspaceDirectoryListing({
          path: "src/lib",
          entries: [new WorkspaceEntry({ path: "src/lib/util.ts", name: "util.ts", kind: "file" })],
        }),
      );
    }).pipe(Effect.provide(rpcLayer(root)));
  });

  it.effect("returns a tagged failure for an invalid listing path", () => {
    const root = makeRoot();
    return Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(BerniseRpcs);
      expect(yield* client.ListWorkspaceDirectory({ path: ".." }).pipe(Effect.flip)).toEqual(
        new WorkspaceFsError({ message: "Workspace paths must stay inside the workspace." }),
      );
      expect(yield* client.ListWorkspaceDirectory({ path: "/etc" }).pipe(Effect.flip)).toEqual(
        new WorkspaceFsError({
          message: "Workspace paths must be relative to the workspace root.",
        }),
      );
      expect(yield* client.ListWorkspaceDirectory({ path: "missing" }).pipe(Effect.flip)).toEqual(
        new WorkspaceFsError({ message: "Directory not found." }),
      );
    }).pipe(Effect.provide(rpcLayer(root)));
  });
});
