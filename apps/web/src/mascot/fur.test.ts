import { BufferAttribute, BufferGeometry } from "three";
import { describe, expect, it } from "vite-plus/test";
import { buildFinGeometry } from "./fins.ts";
import { bakeHairNoise, hash2, hairNoiseSize, sampleHairNoise } from "./hairNoise.ts";
import { cylindricalUv } from "./metaballs.ts";

function triangle(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  );
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
  return geometry;
}

describe("sampleHairNoise", () => {
  it("tiles when UV wraps", () => {
    const a = sampleHairNoise(0.1, 0.4);
    const b = sampleHairNoise(1.1, 0.4);
    const c = sampleHairNoise(0.1, 1.4);
    expect(a.length).toBeCloseTo(b.length, 10);
    expect(a.tint).toBeCloseTo(c.tint, 10);
  });

  it("stays in 0..1", () => {
    for (let i = 0; i < 48; i++) {
      const sample = sampleHairNoise(i / 48, ((i * 7) % 48) / 48);
      expect(sample.length).toBeGreaterThan(0);
      expect(sample.length).toBeLessThanOrEqual(1);
      expect(sample.tint).toBeGreaterThan(0.7);
      expect(sample.tint).toBeLessThanOrEqual(1);
    }
  });

  it("keeps most texels short so outer shells stay strandy", () => {
    let short = 0;
    for (let i = 0; i < 200; i++) {
      if (sampleHairNoise(i / 200, ((i * 11) % 200) / 200).length < 0.3) {
        short += 1;
      }
    }
    expect(short).toBeGreaterThan(100);
  });
});

describe("hash2", () => {
  it("wraps the lattice so the atlas is tileable", () => {
    expect(hash2(0, 4, 16, 1)).toBe(hash2(16, 4, 16, 1));
    expect(hash2(3, 0, 16, 2)).toBe(hash2(3, 16, 16, 2));
  });
});

describe("bakeHairNoise", () => {
  it("writes an RGBA atlas with opaque alpha", () => {
    const pixels = bakeHairNoise(32);
    expect(pixels.length).toBe(32 * 32 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i + 3]).toBe(255);
    }
  });

  it("keeps the default atlas power-of-two", () => {
    expect(hairNoiseSize & (hairNoiseSize - 1)).toBe(0);
  });
});

describe("buildFinGeometry", () => {
  it("emits one extruded quad per unique edge", () => {
    const fins = buildFinGeometry(triangle());
    expect(fins.getAttribute("position")?.count).toBe(12);
    expect(fins.getIndex()?.count).toBe(18);
    const height = fins.getAttribute("hairHeight");
    expect(height).toBeDefined();
    let roots = 0;
    let tips = 0;
    if (height !== undefined) {
      for (let i = 0; i < height.count; i++) {
        if (height.getX(i) === 0) {
          roots += 1;
        } else {
          tips += 1;
        }
      }
    }
    expect(roots).toBe(6);
    expect(tips).toBe(6);
  });

  it("welds duplicated triangle edges on a non-indexed quad", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
        3,
      ),
    );
    geometry.setAttribute(
      "normal",
      new BufferAttribute(
        new Float32Array(18).map((_, i) => (i % 3 === 2 ? 1 : 0)),
        3,
      ),
    );
    geometry.setAttribute(
      "uv",
      new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]), 2),
    );
    const fins = buildFinGeometry(geometry);
    // 5 unique edges on a triangulated quad (4 boundary + 1 diagonal).
    expect(fins.getAttribute("position")?.count).toBe(20);
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
