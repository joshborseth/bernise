import {
  DataTexture,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import type { Texture } from "three";

/** Texels in the shared hair-length atlas. */
export const hairNoiseSize = 256;

/**
 * Deterministic 0..1 hash. Integer lattice coords wrap through `size` so the
 * atlas tiles under RepeatWrapping.
 */
export function hash2(ix: number, iy: number, size: number, salt: number): number {
  const x = ((ix % size) + size) % size;
  const y = ((iy % size) + size) % size;
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 1597334677);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export type HairSample = {
  readonly length: number;
  readonly tint: number;
};

/**
 * One hair per texel. Most texels stay short so outer shells punch into
 * strands instead of drawing a solid offset surface. Tint stays a narrow
 * band so palette color is preserved.
 */
export function sampleHairNoise(u: number, v: number, size: number = hairNoiseSize): HairSample {
  const ix = Math.floor(u * size);
  const iy = Math.floor(v * size);
  const speckle = hash2(ix, iy, size, 1);
  const length = speckle < 0.32 ? 0.38 + 0.62 * hash2(ix, iy, size, 3) : 0.04 + 0.14 * speckle;
  const tint = 0.78 + 0.22 * hash2(ix, iy, size, 2);
  return { length, tint };
}

export function bakeHairNoise(size: number = hairNoiseSize): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { length, tint } = sampleHairNoise(x / size, y / size, size);
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(length * 255);
      pixels[i + 1] = Math.round(tint * 255);
      pixels[i + 2] = 0;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

/** Shared RG noise: R = hair length, G = per-hair tint. */
export function createHairNoiseTexture(size: number = hairNoiseSize): Texture {
  const texture = new DataTexture(bakeHairNoise(size), size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
