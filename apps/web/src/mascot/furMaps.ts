import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import type { Texture } from "three";

/**
 * Coat profiles for Bernise. Down is the pale undercoat, plush the silver
 * body, guard the tabby points, velvet the inner ear.
 */
export type FurKind = "down" | "plush" | "guard" | "velvet";

export type FurProfile = {
  readonly kind: FurKind;
  readonly size: number;
  readonly strands: number;
  readonly flowWaves: number;
  readonly sharpness: number;
  readonly clump: number;
  readonly fuzz: number;
  readonly normalStrength: number;
  readonly roughnessLow: number;
  readonly roughnessHigh: number;
  readonly repeatU: number;
  readonly repeatV: number;
};

export type FurTextures = {
  readonly normalMap: Texture;
  readonly displacementMap: Texture;
  readonly roughnessMap: Texture;
};

export const furProfiles: Record<FurKind, FurProfile> = {
  down: {
    kind: "down",
    size: 512,
    strands: 56,
    flowWaves: 3,
    sharpness: 1.35,
    clump: 1,
    fuzz: 1.1,
    normalStrength: 6.4,
    roughnessLow: 0.78,
    roughnessHigh: 0.97,
    repeatU: 3.2,
    repeatV: 4.4,
  },
  plush: {
    kind: "plush",
    size: 512,
    strands: 44,
    flowWaves: 4,
    sharpness: 1.55,
    clump: 1.15,
    fuzz: 0.9,
    normalStrength: 7.2,
    roughnessLow: 0.68,
    roughnessHigh: 0.93,
    repeatU: 2.8,
    repeatV: 3.8,
  },
  guard: {
    kind: "guard",
    size: 512,
    strands: 36,
    flowWaves: 5,
    sharpness: 1.85,
    clump: 1.35,
    fuzz: 0.7,
    normalStrength: 8.6,
    roughnessLow: 0.52,
    roughnessHigh: 0.86,
    repeatU: 2.4,
    repeatV: 3.2,
  },
  velvet: {
    kind: "velvet",
    size: 512,
    strands: 72,
    flowWaves: 2,
    sharpness: 1.15,
    clump: 0.55,
    fuzz: 1.4,
    normalStrength: 4.2,
    roughnessLow: 0.7,
    roughnessHigh: 0.9,
    repeatU: 4.5,
    repeatV: 5.5,
  },
};

const twoPi = Math.PI * 2;

/**
 * Tileable cat-fur height in 0..1. U runs across the pelt, V along the
 * lie of the hair. Integer frequencies keep RepeatWrapping seamless.
 */
export function sampleFurHeight(u: number, v: number, profile: FurProfile): number {
  const warp =
    profile.clump * 0.038 * Math.sin(v * twoPi * profile.flowWaves) +
    profile.clump * 0.022 * Math.sin(v * twoPi * (profile.flowWaves * 2 + 1) + u * twoPi * 2) +
    profile.fuzz * 0.014 * Math.sin(u * twoPi * 3 + v * twoPi * 5);

  const strandU = u + warp;
  const primary = 0.5 + 0.5 * Math.sin(strandU * twoPi * profile.strands);
  const secondary = 0.5 + 0.5 * Math.sin(strandU * twoPi * profile.strands * 2 + 0.65);
  const fine = 0.5 + 0.5 * Math.sin(strandU * twoPi * profile.strands * 4 + v * twoPi * 2);

  const ridge = (primary * 0.6 + secondary * 0.27 + fine * 0.13) ** profile.sharpness;

  const pile =
    0.7 +
    0.3 *
      (0.5 + 0.5 * Math.sin(v * twoPi * 4 + u * twoPi * 2)) *
      (0.5 + 0.5 * Math.sin(u * twoPi * 3 - v * twoPi));

  const clumps =
    0.76 + 0.24 * (0.5 + 0.5 * Math.sin(u * twoPi * 2 + v * twoPi * profile.flowWaves));

  const guard =
    profile.kind === "guard"
      ? 0.12 * (0.5 + 0.5 * Math.sin(u * twoPi * 7 + v * twoPi * 3)) ** 6
      : 0;

  return Math.min(1, ridge * pile * clumps + guard);
}

export function sampleFurRoughness(u: number, v: number, profile: FurProfile): number {
  const height = sampleFurHeight(u, v, profile);
  const span = profile.roughnessHigh - profile.roughnessLow;
  const variation = 0.04 * Math.sin(u * twoPi * 5 - v * twoPi * 3);
  return Math.min(1, Math.max(0, profile.roughnessHigh - span * height + variation));
}

export type FurMapBuffers = {
  readonly size: number;
  readonly displacement: Uint8Array;
  readonly normal: Uint8Array;
  readonly roughness: Uint8Array;
};

export function bakeFurMaps(profile: FurProfile): FurMapBuffers {
  const size = profile.size;
  const heights = new Float32Array(size * size);
  const displacement = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const height = sampleFurHeight(u, v, profile);
      const rough = sampleFurRoughness(u, v, profile);
      heights[y * size + x] = height;

      const di = (y * size + x) * 4;
      const d = Math.round(height * 255);
      displacement[di] = d;
      displacement[di + 1] = d;
      displacement[di + 2] = d;
      displacement[di + 3] = 255;

      const r = Math.round(rough * 255);
      roughness[di] = r;
      roughness[di + 1] = r;
      roughness[di + 2] = r;
      roughness[di + 3] = 255;
    }
  }

  return {
    size,
    displacement,
    normal: heightToNormal(heights, size, profile.normalStrength),
    roughness,
  };
}

export function createFurTextures(kind: FurKind, anisotropy: number): FurTextures {
  const profile = furProfiles[kind];
  const maps = bakeFurMaps(profile);
  return {
    normalMap: dataMap(maps.normal, maps.size, anisotropy, profile),
    displacementMap: dataMap(maps.displacement, maps.size, anisotropy, profile),
    roughnessMap: dataMap(maps.roughness, maps.size, anisotropy, profile),
  };
}

function dataMap(
  pixels: Uint8Array,
  size: number,
  anisotropy: number,
  profile: FurProfile,
): DataTexture {
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(1, anisotropy);
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.repeat.set(profile.repeatU, profile.repeatV);
  texture.needsUpdate = true;
  return texture;
}

function heightToNormal(heights: Float32Array, size: number, strength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const up = ((y + size - 1) % size) * size;
    const down = ((y + 1) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const left = heights[row + ((x + size - 1) % size)] ?? 0;
      const right = heights[row + ((x + 1) % size)] ?? 0;
      const above = heights[up + x] ?? 0;
      const below = heights[down + x] ?? 0;
      let nx = -(right - left) * strength;
      let ny = -(below - above) * strength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const i = (row + x) * 4;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}
