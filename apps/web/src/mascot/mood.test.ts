import { describe, expect, it } from "@effect/vitest";
import { deriveBerniseMood } from "./mood.ts";

describe("deriveBerniseMood", () => {
  it("prefers speaking over thinking and listening", () => {
    expect(deriveBerniseMood({ composerFocused: true, pending: true, speaking: true })).toBe(
      "speaking",
    );
  });

  it("uses thinking while a turn is in flight", () => {
    expect(deriveBerniseMood({ composerFocused: true, pending: true, speaking: false })).toBe(
      "thinking",
    );
  });

  it("listens when the composer is focused", () => {
    expect(deriveBerniseMood({ composerFocused: true, pending: false, speaking: false })).toBe(
      "listening",
    );
  });

  it("idles otherwise", () => {
    expect(deriveBerniseMood({ composerFocused: false, pending: false })).toBe("idle");
  });
});
