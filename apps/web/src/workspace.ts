import { WorkspaceInfo, type WorkspaceEntryKind } from "@bernise/contracts";
import { Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { BerniseRpc } from "./rpc.ts";

export const emptyWorkspace = new WorkspaceInfo({ path: "", name: "" });

export const workspaceRootPath = "";

export const workspaceAtom = Atom.make(emptyWorkspace).pipe(Atom.keepAlive);

export const workspaceDirectoryEpochAtom = Atom.family((_path: string) =>
  Atom.make(0).pipe(Atom.keepAlive),
);

export const workspaceDirectoryAtom = Atom.family((path: string) =>
  BerniseRpc.runtime
    .atom((get) =>
      Effect.gen(function* () {
        get(workspaceDirectoryEpochAtom(path));
        const client = yield* BerniseRpc;
        return yield* client("ListWorkspaceDirectory", { path });
      }),
    )
    .pipe(Atom.keepAlive),
);

export type OpenWorkspaceFiles = {
  readonly paths: ReadonlyArray<string>;
  readonly active: string | undefined;
};

export const emptyOpenWorkspaceFiles: OpenWorkspaceFiles = {
  paths: [],
  active: undefined,
};

export const openWorkspaceFile = (open: OpenWorkspaceFiles, path: string): OpenWorkspaceFiles => {
  if (open.paths.includes(path)) {
    return { paths: open.paths, active: path };
  }
  return { paths: [...open.paths, path], active: path };
};

export const closeWorkspaceFile = (open: OpenWorkspaceFiles, path: string): OpenWorkspaceFiles => {
  const index = open.paths.indexOf(path);
  if (index === -1) {
    return open;
  }
  const paths = open.paths.filter((candidate) => candidate !== path);
  if (open.active !== path) {
    return { paths, active: open.active };
  }
  return { paths, active: paths[index] ?? paths[index - 1] };
};

export const workspaceFileBasename = (path: string): string => {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
};

export const workspaceFileTabLabel = (path: string, openPaths: ReadonlyArray<string>): string => {
  const basename = workspaceFileBasename(path);
  const clash = openPaths.some(
    (other) => other !== path && workspaceFileBasename(other) === basename,
  );
  if (!clash) {
    return basename;
  }
  const slash = path.lastIndexOf("/");
  if (slash === -1) {
    return basename;
  }
  const parent = path.slice(0, slash);
  const parentSlash = parent.lastIndexOf("/");
  const parentName = parentSlash === -1 ? parent : parent.slice(parentSlash + 1);
  return `${parentName}/${basename}`;
};

export const openWorkspaceFilesAtom = Atom.make<OpenWorkspaceFiles>(emptyOpenWorkspaceFiles).pipe(
  Atom.keepAlive,
);

export const activeWorkspaceEntryAtom = Atom.make((get) => get(openWorkspaceFilesAtom).active);

export const workspaceFileEpochAtom = Atom.family((_path: string) =>
  Atom.make(0).pipe(Atom.keepAlive),
);

export const workspaceFileAtom = Atom.family((path: string) =>
  BerniseRpc.runtime
    .atom((get) =>
      Effect.gen(function* () {
        get(workspaceFileEpochAtom(path));
        const client = yield* BerniseRpc;
        return yield* client("ReadFile", { path });
      }),
    )
    .pipe(Atom.keepAlive),
);

export const writeWorkspaceFileAtom = BerniseRpc.mutation("WriteFile");

export const isOpenWorkspaceFilePath = (path: string | undefined): path is string =>
  path !== undefined && path.length > 0;

export const expandedWorkspaceDirectoriesAtom = Atom.make<ReadonlySet<string>>(
  new Set<string>(),
).pipe(Atom.keepAlive);

export const isWorkspaceDirectoryExpanded = (
  expanded: ReadonlySet<string>,
  path: string,
): boolean => expanded.has(path);

export const toggleWorkspaceDirectoryExpanded = (
  expanded: ReadonlySet<string>,
  path: string,
): ReadonlySet<string> => {
  const next = new Set(expanded);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  return next;
};

export const isSelectableWorkspaceEntry = (kind: WorkspaceEntryKind): boolean =>
  kind !== "directory";

export const formatWorkspacePath = (path: string, home: string): string => {
  if (home.length === 0) {
    return path;
  }
  if (path === home) {
    return "~";
  }
  const prefix = home.endsWith("/") ? home : `${home}/`;
  if (path.startsWith(prefix)) {
    return `~/${path.slice(prefix.length)}`;
  }
  return path;
};

export const homePrefixFromPath = (path: string): string => {
  const match = /^(\/Users\/[^/]+|\/home\/[^/]+)/.exec(path);
  return match?.[1] ?? "";
};

export const displayWorkspacePath = (path: string): string =>
  formatWorkspacePath(path, homePrefixFromPath(path));
