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
 * body, guard the tabby points, velvet the inner ear. Frequencies stay
 * integer so RepeatWrapping stays seamless.
 */
export type FurKind = "down" | "plush" | "guard" | "velvet";

export type FurProfile = {
  readonly kind: FurKind;
  readonly size: number;
  readonly freqU: number;
  readonly freqV: number;
  readonly octaves: number;
  readonly warp: number;
  readonly normalStrength: number;
  readonly roughnessLow: number;
  readonly roughnessHigh: number;
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
    freqU: 18,
    freqV: 16,
    octaves: 5,
    warp: 0.12,
    normalStrength: 3.4,
    roughnessLow: 0.82,
    roughnessHigh: 0.97,
  },
  plush: {
    kind: "plush",
    size: 512,
    freqU: 14,
    freqV: 12,
    octaves: 5,
    warp: 0.14,
    normalStrength: 3.8,
    roughnessLow: 0.76,
    roughnessHigh: 0.94,
  },
  guard: {
    kind: "guard",
    size: 512,
    freqU: 12,
    freqV: 10,
    octaves: 4,
    warp: 0.16,
    normalStrength: 4.2,
    roughnessLow: 0.7,
    roughnessHigh: 0.9,
  },
  velvet: {
    kind: "velvet",
    size: 512,
    freqU: 22,
    freqV: 20,
    octaves: 5,
    warp: 0.08,
    normalStrength: 2.4,
    roughnessLow: 0.8,
    roughnessHigh: 0.94,
  },
};

function wrapInt(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash2(ix: number, iy: number, periodX: number, periodY: number): number {
  const x = wrapInt(ix, periodX);
  const y = wrapInt(iy, periodY);
  const n = Math.sin(x * 127.1 + y * 311.7 + 19.19) * 43758.5453;
  return n - Math.floor(n);
}

/** Tileable value noise. `freqU` and `freqV` must be integers. */
export function tileNoise(u: number, v: number, freqU: number, freqV: number): number {
  const x = (((u % 1) + 1) % 1) * freqU;
  const y = (((v % 1) + 1) % 1) * freqV;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const n00 = hash2(x0, y0, freqU, freqV);
  const n10 = hash2(x0 + 1, y0, freqU, freqV);
  const n01 = hash2(x0, y0 + 1, freqU, freqV);
  const n11 = hash2(x0 + 1, y0 + 1, freqU, freqV);
  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
}

export function tileFbm(
  u: number,
  v: number,
  freqU: number,
  freqV: number,
  octaves: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let fu = freqU;
  let fv = freqV;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileNoise(u, v, fu, fv);
    norm += amp;
    fu *= 2;
    fv *= 2;
    amp *= 0.5;
  }
  return norm === 0 ? 0 : sum / norm;
}

/**
 * Soft pile height in 0..1. Fractal noise, not sine strands — cylindrical
 * UVs turn periodic ridges into carved grooves on a round cat.
 */
export function sampleFurHeight(u: number, v: number, profile: FurProfile): number {
  const wu = u + profile.warp * (tileFbm(u, v, 4, 4, 3) - 0.5);
  const wv = v + profile.warp * (tileFbm(u + 0.37, v + 0.11, 4, 3, 3) - 0.5);
  return tileFbm(wu, wv, profile.freqU, profile.freqV, profile.octaves);
}

/** Low-frequency tufts the coarse metaball meshes can actually hold. */
export function sampleFurDisplacement(u: number, v: number, profile: FurProfile): number {
  const amount = profile.kind === "velvet" ? 0.35 : profile.kind === "down" ? 0.7 : 0.55;
  const tuft = tileFbm(u, v, 3, 2, 3);
  return 0.5 + (tuft - 0.5) * amount;
}

export function sampleFurRoughness(u: number, v: number, profile: FurProfile): number {
  const height = sampleFurHeight(u, v, profile);
  const span = profile.roughnessHigh - profile.roughnessLow;
  return Math.min(1, Math.max(0, profile.roughnessHigh - span * height));
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
    normalMap: dataMap(maps.normal, maps.size, anisotropy, 1, 1),
    roughnessMap: dataMap(maps.roughness, maps.size, anisotropy, 1, 1),
    displacementMap: dataMap(maps.displacement, maps.size, anisotropy, 1, 1),
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
