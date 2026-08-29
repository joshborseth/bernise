import { execFileSync } from "node:child_process";
import { userInfo } from "node:os";

const PATH_CAPTURE_START = "__BERNISE_PATH_START__";
const PATH_CAPTURE_END = "__BERNISE_PATH_END__";
const LOGIN_SHELL_TIMEOUT_MS = 5000;
const LAUNCHCTL_TIMEOUT_MS = 2000;

export type ExecFileSyncLike = (
  file: string,
  args: ReadonlyArray<string>,
  options: { encoding: "utf8"; timeout: number },
) => string;

export type InstallLoginShellPathOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly execFile?: ExecFileSyncLike;
  readonly userShell?: string | undefined;
};

const trimNonEmpty = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
};

const pathDelimiter = (platform: NodeJS.Platform): string => (platform === "win32" ? ";" : ":");

const readEnvPath = (env: NodeJS.ProcessEnv): string | undefined =>
  trimNonEmpty(env.PATH ?? env.Path ?? env.path);

const readUserLoginShell = (): string | undefined => {
  try {
    return trimNonEmpty(userInfo().shell);
  } catch {
    return undefined;
  }
};

const capturePathCommand = [
  `printf '%s\\n' '${PATH_CAPTURE_START}'`,
  "printenv PATH || true",
  `printf '%s\\n' '${PATH_CAPTURE_END}'`,
].join("; ");

export const extractPathFromShellOutput = (output: string): string | null => {
  const startIndex = output.indexOf(PATH_CAPTURE_START);
  if (startIndex === -1) {
    return null;
  }

  const valueStartIndex = startIndex + PATH_CAPTURE_START.length;
  const endIndex = output.indexOf(PATH_CAPTURE_END, valueStartIndex);
  if (endIndex === -1) {
    return null;
  }

  const pathValue = output.slice(valueStartIndex, endIndex).trim();
  return pathValue.length > 0 ? pathValue : null;
};

export const listLoginShellCandidates = (
  platform: NodeJS.Platform,
  shell: string | undefined,
  userShell = readUserLoginShell(),
): ReadonlyArray<string> => {
  const fallback =
    platform === "darwin" ? "/bin/zsh" : platform === "linux" ? "/bin/bash" : undefined;
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const candidate of [trimNonEmpty(shell), trimNonEmpty(userShell), fallback]) {
    if (candidate === undefined || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    candidates.push(candidate);
  }

  return candidates;
};

export const mergePathEntries = (
  preferredPath: string | undefined,
  inheritedPath: string | undefined,
  platform: NodeJS.Platform,
): string | undefined => {
  const delimiter = pathDelimiter(platform);
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const pathValue of [preferredPath, inheritedPath]) {
    if (pathValue === undefined) {
      continue;
    }
    for (const entry of pathValue.split(delimiter)) {
      const trimmedEntry = entry.trim();
      if (trimmedEntry.length === 0 || seen.has(trimmedEntry)) {
        continue;
      }
      seen.add(trimmedEntry);
      merged.push(trimmedEntry);
    }
  }

  return merged.length > 0 ? merged.join(delimiter) : undefined;
};

export const readPathFromLoginShell = (
  shell: string,
  execFile: ExecFileSyncLike = execFileSync,
): string | undefined => {
  try {
    const output = execFile(shell, ["-ilc", capturePathCommand], {
      encoding: "utf8",
      timeout: LOGIN_SHELL_TIMEOUT_MS,
    });
    return extractPathFromShellOutput(output) ?? undefined;
  } catch {
    return undefined;
  }
};

export const readPathFromLaunchctl = (
  execFile: ExecFileSyncLike = execFileSync,
): string | undefined => {
  try {
    return trimNonEmpty(
      execFile("/bin/launchctl", ["getenv", "PATH"], {
        encoding: "utf8",
        timeout: LAUNCHCTL_TIMEOUT_MS,
      }),
    );
  } catch {
    return undefined;
  }
};

const readPreferredLoginPath = (input: {
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly execFile: ExecFileSyncLike;
  readonly userShell: string | undefined;
}): string | undefined => {
  for (const shell of listLoginShellCandidates(input.platform, input.env.SHELL, input.userShell)) {
    const pathValue = readPathFromLoginShell(shell, input.execFile);
    if (pathValue !== undefined) {
      return pathValue;
    }
  }

  if (input.platform === "darwin") {
    return readPathFromLaunchctl(input.execFile);
  }

  return undefined;
};

export const installLoginShellPathIntoProcess = (
  options: InstallLoginShellPathOptions = {},
): string | undefined => {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const inheritedPath = readEnvPath(env);

  if (platform === "win32") {
    return inheritedPath;
  }

  const preferredPath = readPreferredLoginPath({
    env,
    platform,
    execFile: options.execFile ?? execFileSync,
    userShell: options.userShell !== undefined ? options.userShell : readUserLoginShell(),
  });
  const merged = mergePathEntries(preferredPath, inheritedPath, platform);
  if (merged !== undefined) {
    env.PATH = merged;
  }
  return merged;
};
