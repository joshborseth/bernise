import { describe, expect, it } from "vite-plus/test";
import { parsePerch, perchPose } from "./perchPose.ts";

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
  it("mirrors left and right so the face still looks into the screen", () => {
    const left = perchPose("left");
    const right = perchPose("right");
    expect(right.x).toBeCloseTo(-left.x);
    expect(right.yaw).toBeCloseTo(-left.yaw);
    expect(right.roll).toBeCloseTo(-left.roll);
    expect(right.headYaw).toBeCloseTo(-left.headYaw);
    expect(right.lookX).toBeCloseTo(-left.lookX);
    expect(right.y).toBeCloseTo(left.y);
  });

  it("lies on the side with the head in the on-screen peek", () => {
    const left = perchPose("left");
    expect(left.roll).toBeLessThan(-0.8);
    expect(left.x).toBeGreaterThan(0.2);
    expect(left.y).toBeLessThan(0);
  });

  it("looks down from the top peek and up from the bottom", () => {
    const top = perchPose("top");
    const bottom = perchPose("bottom");
    expect(top.y).toBeLessThan(0);
    expect(top.headPitch).toBeGreaterThan(0.2);
    expect(top.lookY).toBeLessThan(0);
    expect(bottom.pitch).toBeLessThan(0);
    expect(bottom.lookY).toBeGreaterThan(0);
  });
});
