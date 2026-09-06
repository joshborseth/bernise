export const syntaxThemeName = "poimandres";

const CODE_FENCE_LANGUAGE_REGEX = /(?:^|\s)language-([^\s]+)/;
const FENCE_TITLE_ATTR_REGEX = /(?:^|\s)(?:title|file(?:name)?)=(?:"([^"]+)"|'([^']+)'|(\S+))/i;
const FENCE_FILENAME_TOKEN_REGEX = /^[\w@][\w@./-]*\.[A-Za-z0-9]+$/;

export const extractFenceLanguage = (className: string | undefined): string => {
  const match = className?.match(CODE_FENCE_LANGUAGE_REGEX);
  const raw = match?.[1] ?? "text";
  return raw === "gitignore" ? "ini" : raw;
};

export const extractFenceTitle = (meta: string | undefined): string | null => {
  if (!meta) {
    return null;
  }
  const attrMatch = FENCE_TITLE_ATTR_REGEX.exec(meta);
  const attrTitle = attrMatch?.[1] ?? attrMatch?.[2] ?? attrMatch?.[3];
  if (attrTitle) {
    return attrTitle;
  }
  return meta.split(/\s+/).find((candidate) => FENCE_FILENAME_TOKEN_REGEX.test(candidate)) ?? null;
};

export const extractCodeMeta = (node: unknown): string | undefined => {
  if (node === null || typeof node !== "object") {
    return undefined;
  }
  const data = "data" in node ? node.data : undefined;
  if (
    data !== null &&
    typeof data === "object" &&
    "meta" in data &&
    typeof data.meta === "string"
  ) {
    return data.meta;
  }
  return undefined;
};

const LANGUAGE_EXTENSION_ALIASES: Record<string, string> = {
  bash: "sh",
  csharp: "cs",
  dockerfile: "dockerfile",
  javascript: "js",
  jsx: "jsx",
  markdown: "md",
  mdx: "mdx",
  plaintext: "txt",
  python: "py",
  ruby: "rb",
  rust: "rs",
  shell: "sh",
  shellscript: "sh",
  swift: "swift",
  typescript: "ts",
  tsx: "tsx",
  yaml: "yml",
};

export const syntheticFileNameForLanguage = (language: string): string => {
  const normalized = language.toLowerCase();
  return `file.${LANGUAGE_EXTENSION_ALIASES[normalized] ?? normalized}`;
};

export const isMermaidLanguage = (language: string): boolean =>
  language.toLowerCase() === "mermaid";
