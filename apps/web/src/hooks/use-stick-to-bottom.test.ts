import { describe, expect, it } from "@effect/vitest";
import { isNearBottom } from "./use-stick-to-bottom.ts";

describe("isNearBottom", () => {
  it("treats a scroller flush with the bottom as near", () => {
    expect(isNearBottom({ scrollTop: 100, clientHeight: 400, scrollHeight: 500 })).toBe(true);
  });

  it("treats a scroller within 48px of the bottom as near", () => {
    expect(isNearBottom({ scrollTop: 52, clientHeight: 400, scrollHeight: 500 })).toBe(true);
  });

  it("treats a scroller 49px above the bottom as not near", () => {
    expect(isNearBottom({ scrollTop: 51, clientHeight: 400, scrollHeight: 500 })).toBe(false);
  });

  it("treats content shorter than the viewport as near", () => {
    expect(isNearBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 200 })).toBe(true);
  });

  it("treats a scroller parked at the top of a long list as not near", () => {
    expect(isNearBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 1000 })).toBe(false);
  });
});
