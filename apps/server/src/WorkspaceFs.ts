import {
  WorkspaceDirectoryListing,
  WorkspaceEntry,
  WorkspaceFsError,
  type WorkspaceEntryKind,
} from "@bernise/contracts";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Layer, Option, Path } from "effect";
import * as Context from "effect/Context";
import { resolveWorkspacePath, workspaceConfig } from "./workspace.ts";

const omittedNames = new Set([".git", "node_modules"]);
const invalidPathMessage = "Workspace paths must be relative to the workspace root.";
const escapedPathMessage = "Workspace paths must stay inside the workspace.";
const missingDirectoryMessage = "Directory not found.";
const notDirectoryMessage = "Not a directory.";

export type WorkspaceFsApi = {
  readonly listDirectory: (
    relativePath: string,
  ) => Effect.Effect<WorkspaceDirectoryListing, WorkspaceFsError>;
};

export class WorkspaceFs extends Context.Service<WorkspaceFs, WorkspaceFsApi>()(
  "@bernise/WorkspaceFs",
) {}

const kindRank = (kind: WorkspaceEntryKind): number => (kind === "directory" ? 0 : 1);

const compareWorkspaceEntries = (left: WorkspaceEntry, right: WorkspaceEntry): number => {
  const byKind = kindRank(left.kind) - kindRank(right.kind);
  if (byKind !== 0) {
    return byKind;
  }
  const byInsensitive = left.name.localeCompare(right.name, "en", { sensitivity: "accent" });
  if (byInsensitive !== 0) {
    return byInsensitive;
  }
  return left.name.localeCompare(right.name, "en");
};

const isContained = (root: string, candidate: string, sep: string): boolean => {
  const normalizedRoot = root.endsWith(sep) ? root.slice(0, -1) : root;
  if (candidate === normalizedRoot) {
    return true;
  }
  return candidate.startsWith(`${normalizedRoot}${sep}`);
};

const fail = (message: string): Effect.Effect<never, WorkspaceFsError> =>
  Effect.fail(new WorkspaceFsError({ message }));

const toWorkspaceFsError = (error: {
  readonly reason?: { readonly _tag?: string };
}): WorkspaceFsError => {
  if (error.reason?._tag === "NotFound") {
    return new WorkspaceFsError({ message: missingDirectoryMessage });
  }
  return new WorkspaceFsError({
    message: `Could not list the directory.`,
  });
};

const relativeSegments = (
  requested: string,
  path: Path.Path,
): Effect.Effect<ReadonlyArray<string>, WorkspaceFsError> => {
  if (requested.includes("\0")) {
    return fail(invalidPathMessage);
  }
  const trimmed = requested.trim();
  if (path.isAbsolute(trimmed) || trimmed.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return fail(invalidPathMessage);
  }
  const normalized = path.normalize(trimmed.length === 0 ? "." : trimmed).replaceAll("\\", "/");
  if (normalized === "." || normalized === "") {
    return Effect.succeed([]);
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    return fail(escapedPathMessage);
  }
  const segments = normalized.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.includes("..")) {
    return fail(escapedPathMessage);
  }
  return Effect.succeed(segments);
};

const classifyEntry = (
  fs: FileSystem.FileSystem,
  absPath: string,
): Effect.Effect<WorkspaceEntryKind, WorkspaceFsError> =>
  fs.readLink(absPath).pipe(
    Effect.option,
    Effect.flatMap((link) => {
      if (Option.isSome(link)) {
        return Effect.succeed("symlink" as const);
      }
      return fs.stat(absPath).pipe(
        Effect.map((info) =>
          info.type === "Directory" ? ("directory" as const) : ("file" as const),
        ),
        Effect.mapError(toWorkspaceFsError),
      );
    }),
  );

const realPathOrFail = (
  fs: FileSystem.FileSystem,
  absPath: string,
): Effect.Effect<string, WorkspaceFsError> =>
  fs.realPath(absPath).pipe(Effect.mapError(toWorkspaceFsError));

const listWorkspaceDirectory = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  workspaceRoot: string,
  requested: string,
): Effect.Effect<WorkspaceDirectoryListing, WorkspaceFsError> =>
  Effect.gen(function* () {
    const segments = yield* relativeSegments(requested, path);
    const canonicalRoot = yield* realPathOrFail(fs, workspaceRoot);
    const joined = segments.length === 0 ? canonicalRoot : path.join(canonicalRoot, ...segments);
    const listedPath = segments.join("/");

    const link = yield* fs.readLink(joined).pipe(Effect.option);
    if (Option.isSome(link)) {
      const target = path.resolve(path.dirname(joined), link.value);
      const canonicalTarget = yield* realPathOrFail(fs, target).pipe(
        Effect.catchTag("WorkspaceFsError", (error) =>
          error.message === missingDirectoryMessage
            ? fail(notDirectoryMessage)
            : Effect.fail(error),
        ),
      );
      if (!isContained(canonicalRoot, canonicalTarget, path.sep)) {
        return yield* fail(escapedPathMessage);
      }
      return yield* fail(notDirectoryMessage);
    }

    const canonical = yield* realPathOrFail(fs, joined);
    if (!isContained(canonicalRoot, canonical, path.sep)) {
      return yield* fail(escapedPathMessage);
    }
    const info = yield* fs.stat(canonical).pipe(Effect.mapError(toWorkspaceFsError));
    if (info.type !== "Directory") {
      return yield* fail(notDirectoryMessage);
    }

    const names = yield* fs.readDirectory(canonical).pipe(Effect.mapError(toWorkspaceFsError));
    const entries: Array<WorkspaceEntry> = [];
    for (const name of names) {
      if (omittedNames.has(name)) {
        continue;
      }
      const childPath = listedPath.length === 0 ? name : `${listedPath}/${name}`;
      const kind = yield* classifyEntry(fs, path.join(canonical, name));
      entries.push(
        new WorkspaceEntry({
          path: childPath,
          name,
          kind,
        }),
      );
    }
    entries.sort(compareWorkspaceEntries);
    return new WorkspaceDirectoryListing({
      path: listedPath,
      entries,
    });
  });

export const WorkspaceFsLive = Layer.effect(
  WorkspaceFs,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const configured = yield* workspaceConfig;
    return WorkspaceFs.of({
      listDirectory: (relativePath) =>
        listWorkspaceDirectory(fs, path, resolveWorkspacePath(configured), relativePath),
    });
  }),
).pipe(Layer.provide(NodeServices.layer));
