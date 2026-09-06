import { describe, expect, it } from "@effect/vitest";
import { litterDropLandElapsed, litterDropLanded, litterMotion } from "./litterMotion.ts";

describe("litterDropLandElapsed", () => {
  it("lands the first pellet after the squat, 0.52s into the drop phase", () => {
    const elapsed = litterDropLandElapsed(0, 10);
    expect(elapsed).toBeCloseTo(3.02, 10);
    expect(litterDropLanded(litterMotion(elapsed).dropT, 0, 10)).toBe(true);
    expect(litterDropLanded(litterMotion(elapsed - 0.01).dropT, 0, 10)).toBe(false);
  });

  it("lands the last of ten pellets before covering starts", () => {
    const elapsed = litterDropLandElapsed(9, 10);
    expect(elapsed).toBeCloseTo(4.892, 10);
    expect(litterDropLanded(litterMotion(elapsed).dropT, 9, 10)).toBe(true);
    expect(litterDropLanded(litterMotion(elapsed - 0.01).dropT, 9, 10)).toBe(false);
    expect(elapsed).toBeLessThan(5.1);
  });

  it("lands a single pellet at the same elapsed time as the first of many", () => {
    expect(litterDropLandElapsed(0, 1)).toBeCloseTo(3.02, 10);
    expect(litterDropLanded(litterMotion(3.02).dropT, 0, 1)).toBe(true);
  });
});
