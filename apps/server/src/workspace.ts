import { WorkspaceInfo } from "@bernise/contracts";
import { Config, Option } from "effect";
import { basename } from "node:path";

export const workspaceConfig = Config.string("BERNISE_WORKSPACE").pipe(Config.option);

export const resolveWorkspacePath = (
  configured: Option.Option<string>,
  override?: string,
): string => {
  const fromOverride = override?.trim() ?? "";
  if (fromOverride.length > 0) {
    return fromOverride;
  }
  const fromConfig = Option.getOrElse(configured, () => "").trim();
  if (fromConfig.length > 0) {
    return fromConfig;
  }
  return process.cwd();
};

export const workspaceInfoFromPath = (path: string): WorkspaceInfo => {
  const name = basename(path);
  return new WorkspaceInfo({
    path,
    name: name.length > 0 ? name : path,
  });
};
