import { describe, expect, it } from "vite-plus/test";
import { pointerGoal, setPointerGoal } from "./pointerGoal.ts";

describe("setPointerGoal", () => {
  it("clamps look targets to the unit square", () => {
    setPointerGoal(4, -3);
    expect(pointerGoal.x).toBe(1);
    expect(pointerGoal.y).toBe(-1);
    setPointerGoal(0.25, -0.5);
    expect(pointerGoal.x).toBeCloseTo(0.25);
    expect(pointerGoal.y).toBeCloseTo(-0.5);
  });
});
