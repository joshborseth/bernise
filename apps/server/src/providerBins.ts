import { Option } from "effect";

export const resolveCodexBin = (binaryPath: string, envBin: Option.Option<string>): string => {
  if (Option.isSome(envBin) && envBin.value.trim().length > 0) {
    return envBin.value.trim();
  }
  const fromSettings = binaryPath.trim();
  return fromSettings.length > 0 ? fromSettings : "codex";
};
