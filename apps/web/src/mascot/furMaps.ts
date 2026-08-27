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
    strands: 64,
    flowWaves: 2,
    sharpness: 1.85,
    clump: 1,
    fuzz: 1.05,
    normalStrength: 14,
    roughnessLow: 0.76,
    roughnessHigh: 0.97,
    repeatU: 4.0,
    repeatV: 1.5,
  },
  plush: {
    kind: "plush",
    size: 512,
    strands: 52,
    flowWaves: 2,
    sharpness: 2.05,
    clump: 1.1,
    fuzz: 0.9,
    normalStrength: 16,
    roughnessLow: 0.64,
    roughnessHigh: 0.93,
    repeatU: 3.5,
    repeatV: 1.35,
  },
  guard: {
    kind: "guard",
    size: 512,
    strands: 40,
    flowWaves: 3,
    sharpness: 2.25,
    clump: 1.25,
    fuzz: 0.7,
    normalStrength: 18,
    roughnessLow: 0.5,
    roughnessHigh: 0.86,
    repeatU: 3.0,
    repeatV: 1.25,
  },
  velvet: {
    kind: "velvet",
    size: 512,
    strands: 80,
    flowWaves: 2,
    sharpness: 1.55,
    clump: 0.45,
    fuzz: 1.3,
    normalStrength: 9,
    roughnessLow: 0.7,
    roughnessHigh: 0.9,
    repeatU: 5.0,
    repeatV: 2.0,
  },
};

const twoPi = Math.PI * 2;

/**
 * Tileable strand height in 0..1. U runs across the pelt, V along the lie
 * of the hair. Used for normals and roughness, not vertex displacement —
 * the metaball meshes are too coarse to carry this frequency.
 */
export function sampleFurHeight(u: number, v: number, profile: FurProfile): number {
  const lie =
    profile.clump * 0.05 * Math.sin(v * twoPi * profile.flowWaves) +
    profile.clump * 0.02 * Math.sin(v * twoPi * (profile.flowWaves + 1) + u * twoPi);

  const strandU = u + lie;
  const fiber = Math.abs(Math.sin(strandU * twoPi * profile.strands));
  const under = Math.abs(Math.sin(strandU * twoPi * profile.strands * 2 + 0.85));
  const fuzz = 0.5 + 0.5 * Math.sin(strandU * twoPi * profile.strands * 3 + v * twoPi);

  const shafts = fiber ** profile.sharpness;
  const pile = 0.58 * shafts + 0.28 * under ** 1.35 + 0.1 * fuzz * profile.fuzz;

  const guard =
    profile.kind === "guard" ? 0.16 * Math.abs(Math.sin(u * twoPi * 8 + v * twoPi)) ** 8 : 0;

  return Math.min(1, pile + guard);
}

/**
 * Low-frequency pile volume. One to two tufts around the body so marching
 * cubes vertices can actually represent the swell.
 */
export function sampleFurDisplacement(u: number, v: number, profile: FurProfile): number {
  const tufts = 0.5 + 0.5 * Math.sin(u * twoPi * 2 + 0.25 * Math.sin(v * twoPi));
  const swell = 0.5 + 0.5 * Math.sin(v * twoPi + u * twoPi);
  const mix = 0.6 * tufts + 0.4 * swell;
  const amount = profile.kind === "velvet" ? 0.22 : profile.kind === "down" ? 0.72 : 0.5;
  return 0.5 + (mix - 0.5) * amount;
}

export function sampleFurRoughness(u: number, v: number, profile: FurProfile): number {
  const height = sampleFurHeight(u, v, profile);
  const span = profile.roughnessHigh - profile.roughnessLow;
  const variation = 0.035 * Math.sin(u * twoPi * 5 - v * twoPi * 2);
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
      const pile = sampleFurDisplacement(u, v, profile);
      const rough = sampleFurRoughness(u, v, profile);
      heights[y * size + x] = height;

      const di = (y * size + x) * 4;
      const d = Math.round(pile * 255);
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
    normalMap: dataMap(maps.normal, maps.size, anisotropy, profile.repeatU, profile.repeatV),
    roughnessMap: dataMap(maps.roughness, maps.size, anisotropy, profile.repeatU, profile.repeatV),
    // Pile must not inherit the strand repeat or the coarse mesh rings.
    displacementMap: dataMap(maps.displacement, maps.size, anisotropy, 1, 1.05),
  };
}

function dataMap(
  pixels: Uint8Array,
  size: number,
  anisotropy: number,
  repeatU: number,
  repeatV: number,
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
  texture.repeat.set(repeatU, repeatV);
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
