export type MarkdownFileLink = {
  readonly relativePath: string;
  readonly basename: string;
  readonly line?: number;
};

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const EXTERNAL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const POSITION_SUFFIX_PATTERN = /:(\d+)(?::(\d+))?$/;
const RELATIVE_FILE_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?::\d+){0,2}$/;
const RELATIVE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+\.[A-Za-z0-9_-]+(?::\d+){0,2}$/;
const BARE_NAME_WITH_LINE_PATTERN = /^[A-Za-z0-9._-]+(?::\d+){1,2}$/;
const SKIP_BARE_LINE_LABELS = new Set([
  "error",
  "todo",
  "exit",
  "port",
  "http",
  "https",
  "note",
  "warning",
]);

const basenameOf = (path: string): string => {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
};

const normalizeSeparators = (value: string): string => value.replaceAll("\\", "/");

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const stripPosition = (
  value: string,
): { readonly path: string; readonly line?: number; readonly column?: number } => {
  const match = POSITION_SUFFIX_PATTERN.exec(value);
  if (!match || match.index === undefined) {
    return { path: value };
  }
  const path = value.slice(0, match.index);
  const line = Number.parseInt(match[1] ?? "", 10);
  const column = match[2] === undefined ? undefined : Number.parseInt(match[2], 10);
  return {
    path,
    ...(Number.isFinite(line) ? { line } : {}),
    ...(column !== undefined && Number.isFinite(column) ? { column } : {}),
  };
};

const looksLikeFilePath = (path: string): boolean => {
  if (path.includes("..") || path.includes("*") || path.includes(" ")) {
    return false;
  }
  if (path.startsWith("./") || path.startsWith("~/")) {
    return basenameOf(stripPosition(path).path).includes(".");
  }
  if (!(RELATIVE_FILE_PATH_PATTERN.test(path) || RELATIVE_FILE_NAME_PATTERN.test(path))) {
    return false;
  }
  return basenameOf(stripPosition(path).path).includes(".");
};

const workspaceRelativeFromAbsolute = (path: string, workspaceRoot: string): string | null => {
  const normalizedPath = trimTrailingSlash(normalizeSeparators(path));
  const normalizedRoot = trimTrailingSlash(normalizeSeparators(workspaceRoot));
  if (normalizedPath === normalizedRoot) {
    return null;
  }
  const prefix = `${normalizedRoot}/`;
  if (!normalizedPath.startsWith(prefix)) {
    return null;
  }
  return normalizedPath.slice(prefix.length);
};

const parseFileUrl = (href: string): string | null => {
  try {
    const parsed = new URL(href);
    if (parsed.protocol.toLowerCase() !== "file:") {
      return null;
    }
    return decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
};

export const resolveWorkspaceFileLink = (
  raw: string | undefined,
  workspaceRoot: string,
): MarkdownFileLink | null => {
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const unwrapped =
    trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;
  const withoutHash = unwrapped.split("#")[0]?.split("?")[0] ?? unwrapped;
  const fileUrlPath = parseFileUrl(withoutHash);
  const candidate = normalizeSeparators(fileUrlPath ?? withoutHash);
  if (candidate.startsWith("http:") || candidate.startsWith("https:")) {
    return null;
  }
  if (EXTERNAL_SCHEME_PATTERN.test(candidate) && fileUrlPath === null) {
    return null;
  }
  if (WINDOWS_DRIVE_PATH_PATTERN.test(candidate)) {
    return null;
  }

  const positioned = stripPosition(candidate);
  const path = positioned.path.replace(/^\.\//, "");
  if (path.startsWith("/")) {
    const relative = workspaceRelativeFromAbsolute(path, workspaceRoot);
    if (relative === null || relative.includes("..")) {
      return null;
    }
    return {
      relativePath: relative,
      basename: basenameOf(relative),
      ...(positioned.line === undefined ? {} : { line: positioned.line }),
    };
  }

  const bare = BARE_NAME_WITH_LINE_PATTERN.test(candidate) ? stripPosition(candidate) : positioned;
  const relativePath = (bare.path.startsWith("./") ? bare.path.slice(2) : bare.path).replace(
    /^~\//,
    "",
  );
  if (relativePath.includes("..") || relativePath.startsWith("/")) {
    return null;
  }
  const label = basenameOf(relativePath).toLowerCase();
  if (
    BARE_NAME_WITH_LINE_PATTERN.test(candidate) &&
    SKIP_BARE_LINE_LABELS.has(label) &&
    !relativePath.includes("/") &&
    !relativePath.includes(".")
  ) {
    return null;
  }
  if (!looksLikeFilePath(candidate) && !BARE_NAME_WITH_LINE_PATTERN.test(candidate)) {
    return null;
  }
  if (!relativePath.includes("/") && !relativePath.includes(".") && bare.line === undefined) {
    return null;
  }
  return {
    relativePath,
    basename: basenameOf(relativePath),
    ...(bare.line === undefined ? {} : { line: bare.line }),
  };
};
