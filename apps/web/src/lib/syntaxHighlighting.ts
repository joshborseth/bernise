import {
  getSharedHighlighter,
  type DiffsHighlighter,
  type SupportedLanguages,
} from "@pierre/diffs";
import { LRUCache } from "./lruCache.ts";
import { syntaxThemeName } from "./fenceMeta.ts";

export const MAX_SYNTAX_HIGHLIGHTER_CACHE_ENTRIES = 64;

const highlighterPromiseCache = new Map<string, Promise<DiffsHighlighter>>();
const highlightedCodeCache = new LRUCache<string>(200, 8 * 1024 * 1024);
const highlightPromiseCache = new Map<string, Promise<string>>();

const highlighterCacheKey = (language: string, themeName: string): string =>
  `${language}:${themeName}`;

const rememberHighlighter = (
  cacheKey: string,
  promise: Promise<DiffsHighlighter>,
): Promise<DiffsHighlighter> => {
  if (highlighterPromiseCache.has(cacheKey)) {
    highlighterPromiseCache.delete(cacheKey);
  }
  highlighterPromiseCache.set(cacheKey, promise);
  while (highlighterPromiseCache.size > MAX_SYNTAX_HIGHLIGHTER_CACHE_ENTRIES) {
    const oldestKey = highlighterPromiseCache.keys().next().value;
    if (oldestKey === undefined || oldestKey === cacheKey) {
      break;
    }
    highlighterPromiseCache.delete(oldestKey);
  }
  return promise;
};

export const getSyntaxHighlighterPromise = (
  language: string,
  themeName: string = syntaxThemeName,
): Promise<DiffsHighlighter> => {
  const cacheKey = highlighterCacheKey(language, themeName);
  const cached = highlighterPromiseCache.get(cacheKey);
  if (cached) {
    return rememberHighlighter(cacheKey, cached);
  }
  const promise = getSharedHighlighter({
    themes: [themeName],
    langs: [language as SupportedLanguages],
    preferredHighlighter: "shiki-js",
  }).catch((error: unknown) => {
    if (language === "text") {
      highlighterPromiseCache.delete(cacheKey);
      throw error;
    }
    return getSyntaxHighlighterPromise("text", themeName);
  });
  return rememberHighlighter(cacheKey, promise);
};

export const highlightedCodeCacheKey = (
  language: string,
  themeName: string,
  code: string,
): string => `${themeName}:${language}:${code.length}:${code}`;

export const peekHighlightedHtml = (cacheKey: string): string | null =>
  highlightedCodeCache.get(cacheKey);

export const rememberHighlightedHtml = (cacheKey: string, html: string, code: string): void => {
  highlightedCodeCache.set(cacheKey, html, html.length * 2 + code.length);
};

export const highlightCodeToHtml = (
  code: string,
  language: string,
  themeName: string = syntaxThemeName,
): Promise<string> => {
  const cacheKey = highlightedCodeCacheKey(language, themeName, code);
  const existing = highlightPromiseCache.get(cacheKey);
  if (existing) {
    return existing;
  }
  const cached = peekHighlightedHtml(cacheKey);
  if (cached !== null) {
    const resolved = Promise.resolve(cached);
    highlightPromiseCache.set(cacheKey, resolved);
    return resolved;
  }
  const promise = getSyntaxHighlighterPromise(language, themeName).then((highlighter) => {
    let html: string;
    try {
      html = highlighter.codeToHtml(code, { lang: language, theme: themeName });
    } catch {
      html = highlighter.codeToHtml(code, { lang: "text", theme: themeName });
    }
    rememberHighlightedHtml(cacheKey, html, code);
    return html;
  });
  highlightPromiseCache.set(cacheKey, promise);
  return promise;
};

export const __resetSyntaxHighlighterCacheForTests = (): void => {
  highlighterPromiseCache.clear();
  highlightPromiseCache.clear();
  highlightedCodeCache.clear();
};
