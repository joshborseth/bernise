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

export const activeWorkspaceEntryAtom = Atom.make<string | undefined>(undefined).pipe(
  Atom.keepAlive,
);

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
