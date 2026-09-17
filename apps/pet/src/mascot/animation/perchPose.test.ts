import { describe, expect, it } from "vite-plus/test";
import { parsePerch, perchFaceLook, perchPose } from "./perchPose.ts";

describe("parsePerch", () => {
  it("keeps edge names and treats anything else as free", () => {
    expect(parsePerch("left")).toBe("left");
    expect(parsePerch("right")).toBe("right");
    expect(parsePerch("top")).toBe("top");
    expect(parsePerch("bottom")).toBe("bottom");
    expect(parsePerch("none")).toBe("none");
    expect(parsePerch("")).toBe("none");
    expect(parsePerch(undefined)).toBe("none");
  });
});

describe("perchPose", () => {
  it("lies on the side bezels with the head toward the screen", () => {
    const left = perchPose("left");
    const right = perchPose("right");
    expect(left.roll).toBeLessThan(-1.2);
    expect(left.x).toBeGreaterThan(0.2);
    expect(left.lookX).toBeGreaterThan(0.4);
    expect(right.x).toBeCloseTo(-left.x);
    expect(right.yaw).toBeCloseTo(-left.yaw);
    expect(right.roll).toBeCloseTo(-left.roll);
    expect(right.headYaw).toBeCloseTo(-left.headYaw);
    expect(right.lookX).toBeCloseTo(-left.lookX);
    expect(right.y).toBeCloseTo(left.y);
  });

  it("hangs head-down from the top and keeps the bottom peek looking up", () => {
    const top = perchPose("top");
    const bottom = perchPose("bottom");
    expect(Math.abs(top.roll)).toBeCloseTo(Math.PI, 1);
    expect(top.lookY).toBeLessThan(0);
    expect(bottom.pitch).toBeLessThan(0);
    expect(bottom.lookY).toBeGreaterThan(0);
    expect(Math.abs(bottom.roll)).toBeLessThan(0.2);
  });
});

describe("perchFaceLook", () => {
  it("keeps screen axes on the free and bottom poses", () => {
    expect(perchFaceLook("none", 0.4, -0.2)).toEqual({ x: 0.4, y: -0.2 });
    expect(perchFaceLook("bottom", 0.4, -0.2)).toEqual({ x: 0.4, y: -0.2 });
  });

  it("maps interior and down toward the crown after a side or top roll", () => {
    const left = perchFaceLook("left", 1, 0);
    const right = perchFaceLook("right", -1, 0);
    const top = perchFaceLook("top", 0, -1);
    expect(left.x).toBeCloseTo(0);
    expect(left.y).toBeCloseTo(1);
    expect(right.x).toBeCloseTo(0);
    expect(right.y).toBeCloseTo(1);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(1);
  });
});
