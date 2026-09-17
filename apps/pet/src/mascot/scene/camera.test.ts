import { describe, expect, it } from "vite-plus/test";
import { cameraForPet } from "./camera.ts";

describe("cameraForPet perch framing", () => {
  it("aims at the visible head on each bezel", () => {
    const left = cameraForPet({ usingLitter: false, perch: "left" });
    const right = cameraForPet({ usingLitter: false, perch: "right" });
    const top = cameraForPet({ usingLitter: false, perch: "top" });
    const bottom = cameraForPet({ usingLitter: false, perch: "bottom" });
    expect(left.position[0]).toBeGreaterThan(left.lookAt[0]);
    expect(right.position[0]).toBeLessThan(right.lookAt[0]);
    expect(right.position[0]).toBeCloseTo(-left.position[0]);
    expect(top.lookAt[1]).toBeGreaterThan(top.position[1]);
    expect(bottom.lookAt[1]).toBeLessThan(bottom.position[1]);
  });
});
