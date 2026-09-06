import { describe, expect, it } from "@effect/vitest";
import { LRUCache } from "./lruCache.ts";

describe("LRUCache", () => {
  it("evicts the oldest entry when the entry cap is reached", () => {
    const cache = new LRUCache<string>(2, 10_000);
    cache.set("a", "one", 3);
    cache.set("b", "two", 3);
    cache.set("c", "three", 5);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("two");
    expect(cache.get("c")).toBe("three");
  });
});
