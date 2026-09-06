import { LRUCache } from "./lruCache.ts";

const mermaidSvgCache = new LRUCache<string>(80, 4 * 1024 * 1024);
const mermaidSvgPromiseCache = new Map<string, Promise<string>>();
let mermaidId = 0;
let renderChain: Promise<void> = Promise.resolve();

export const mermaidSvgCacheKey = (source: string): string => `${source.length}:${source}`;

export const getMermaidSvgPromise = (source: string): Promise<string> => {
  const cacheKey = mermaidSvgCacheKey(source);
  const cached = mermaidSvgCache.get(cacheKey);
  if (cached !== null) {
    return Promise.resolve(cached);
  }
  const existing = mermaidSvgPromiseCache.get(cacheKey);
  if (existing) {
    return existing;
  }
  const promise = enqueue(() => renderMermaidSvg(source)).then((svg) => {
    mermaidSvgCache.set(cacheKey, svg, svg.length * 2);
    mermaidSvgPromiseCache.delete(cacheKey);
    return svg;
  });
  mermaidSvgPromiseCache.set(cacheKey, promise);
  return promise.catch((error: unknown) => {
    mermaidSvgPromiseCache.delete(cacheKey);
    throw error;
  });
};

const enqueue = (work: () => Promise<string>): Promise<string> => {
  const run = renderChain.then(work, work);
  renderChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

const renderMermaidSvg = async (source: string): Promise<string> => {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "strict",
  });
  mermaidId += 1;
  const { svg } = await mermaid.render(`bernise-mermaid-${mermaidId}`, source);
  return svg;
};
