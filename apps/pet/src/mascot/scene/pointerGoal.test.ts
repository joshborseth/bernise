import { describe, expect, it } from "vite-plus/test";
import { pointerGoalFromClient } from "./pointerGoal.ts";

const stage = { left: 0, top: 0, width: 360, height: 420 };

describe("pointerGoalFromClient", () => {
  it("looks ahead when the pointer is over the face", () => {
    const goal = pointerGoalFromClient({ clientX: 180, clientY: 420 * 0.38 }, stage, {
      width: 360,
      height: 420,
    });
    expect(goal.x).toBeCloseTo(0);
    expect(goal.y).toBeCloseTo(0);
  });

  it("looks right and up as the pointer moves away", () => {
    const goal = pointerGoalFromClient({ clientX: 280, clientY: 40 }, stage, {
      width: 360,
      height: 420,
    });
    expect(goal.x).toBeGreaterThan(0.5);
    expect(goal.y).toBeGreaterThan(0.5);
  });

  it("keeps tracking after the pointer leaves the overlay", () => {
    const overlay = pointerGoalFromClient({ clientX: 400, clientY: 160 }, stage, {
      width: 360,
      height: 420,
    });
    const screen = pointerGoalFromClient({ clientX: 700, clientY: 160 }, stage, {
      width: 1512,
      height: 982,
    });
    expect(overlay.x).toBe(1);
    expect(screen.x).toBeGreaterThan(0.5);
    expect(screen.x).toBeLessThan(1);
  });
});
