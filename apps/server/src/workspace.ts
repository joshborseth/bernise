import { WorkspaceInfo } from "@bernise/contracts";
import { Config, Option } from "effect";
import { realpathSync } from "node:fs";
import { basename, resolve } from "node:path";

export const workspaceConfig = Config.string("BERNISE_WORKSPACE").pipe(Config.option);

const canonicalPath = (path: string): string => {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
};

export const resolveWorkspacePath = (configured: Option.Option<string>): string => {
  const fromConfig = Option.getOrElse(configured, () => "").trim();
  if (fromConfig.length > 0) {
    return canonicalPath(fromConfig);
  }
  return canonicalPath(process.cwd());
};

export const workspaceInfoFromPath = (path: string): WorkspaceInfo => {
  const name = basename(path);
  return new WorkspaceInfo({
    path,
    name: name.length > 0 ? name : path,
  });
};
