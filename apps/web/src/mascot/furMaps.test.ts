import { describe, expect, it } from "vite-plus/test";
import { bakeFurMaps, furProfiles, sampleFurDisplacement, sampleFurHeight } from "./furMaps.ts";
import { cylindricalUv } from "./metaballs.ts";

describe("sampleFurHeight", () => {
  it("tiles across both axes so RepeatWrapping stays seamless", () => {
    const profile = furProfiles.guard;
    const samples = [
      [0.0, 0.17],
      [0.31, 0.0],
      [0.62, 0.84],
      [0.08, 0.5],
    ] as const;
    for (const [u, v] of samples) {
      expect(sampleFurHeight(u, v, profile)).toBeCloseTo(sampleFurHeight(u + 1, v, profile), 10);
      expect(sampleFurHeight(u, v, profile)).toBeCloseTo(sampleFurHeight(u, v + 1, profile), 10);
      expect(sampleFurDisplacement(u, v, profile)).toBeCloseTo(
        sampleFurDisplacement(u + 1, v, profile),
        10,
      );
      expect(sampleFurDisplacement(u, v, profile)).toBeCloseTo(
        sampleFurDisplacement(u, v + 1, profile),
        10,
      );
    }
  });

  it("stays in 0..1", () => {
    const profile = furProfiles.plush;
    for (let i = 0; i < 40; i++) {
      const height = sampleFurHeight(i / 40, ((i * 3) % 40) / 40, profile);
      expect(height).toBeGreaterThanOrEqual(0);
      expect(height).toBeLessThanOrEqual(1);
    }
  });
});

describe("bakeFurMaps", () => {
  it("writes matching RGBA buffers and an outward-facing normal map", () => {
    const maps = bakeFurMaps({ ...furProfiles.down, size: 64, strands: 12 });
    const pixels = 64 * 64 * 4;
    expect(maps.displacement.length).toBe(pixels);
    expect(maps.normal.length).toBe(pixels);
    expect(maps.roughness.length).toBe(pixels);
    expect(maps.albedo.length).toBe(pixels);

    let blueSum = 0;
    let sameAsStrand = 0;
    for (let i = 0; i < maps.normal.length; i += 4) {
      blueSum += maps.normal[i + 2] ?? 0;
      expect(maps.displacement[i + 3]).toBe(255);
      expect(maps.roughness[i + 1]).toBe(maps.roughness[i]);
      if (maps.displacement[i] === maps.roughness[i]) {
        sameAsStrand += 1;
      }
    }
    expect(blueSum / (64 * 64)).toBeGreaterThan(140);
    expect(sameAsStrand / (64 * 64)).toBeLessThan(0.5);
  });
});

describe("cylindricalUv", () => {
  it("puts the wrap seam on the back of the pelt", () => {
    const [frontU] = cylindricalUv(0, 0, 1, 0, 0, -1, 2);
    const [rightU] = cylindricalUv(1, 0, 0, 0, 0, -1, 2);
    const [backU] = cylindricalUv(0, 0, -1, 0, 0, -1, 2);
    expect(frontU).toBeCloseTo(0.5, 5);
    expect(rightU).toBeCloseTo(0.75, 5);
    expect(backU).toBeCloseTo(1, 5);
  });

  it("maps height from the bounding interval onto V", () => {
    const [, feet] = cylindricalUv(0, -1, 1, 0, 0, -1, 2);
    const [, crown] = cylindricalUv(0, 1, 1, 0, 0, -1, 2);
    expect(feet).toBeCloseTo(0, 5);
    expect(crown).toBeCloseTo(1, 5);
  });
});
