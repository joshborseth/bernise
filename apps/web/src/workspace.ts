import { WorkspaceInfo } from "@bernise/contracts";
import { Atom } from "effect/unstable/reactivity";

export const emptyWorkspace = new WorkspaceInfo({ path: "", name: "" });

export const workspaceAtom = Atom.make(emptyWorkspace).pipe(Atom.keepAlive);

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
