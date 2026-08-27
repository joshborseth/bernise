import { CatmullRomCurve3, TubeGeometry, Vector3, SphereGeometry } from "three";
import type { BufferGeometry } from "three";
import type { Mass } from "./berniseModel.ts";
import { bakeMetaballs } from "./metaballs.ts";

const massCache = new WeakMap<Mass, BufferGeometry>();
const whiskerCache = new Map<string, TubeGeometry>();
const sphereCache = new Map<number, SphereGeometry>();

/** Fur masses are static, so each field is only ever evaluated once. */
export function massGeometry(mass: Mass): BufferGeometry {
  const cached = massCache.get(mass);
  if (cached !== undefined) {
    return cached;
  }
  const geometry = bakeMetaballs(mass.balls, mass.bake);
  massCache.set(mass, geometry);
  return geometry;
}

export function furSphereGeometry(radius: number): SphereGeometry {
  const cached = sphereCache.get(radius);
  if (cached !== undefined) {
    return cached;
  }
  const geometry = new SphereGeometry(radius, 32, 24);
  sphereCache.set(radius, geometry);
  return geometry;
}

export function whiskerGeometry(length: number, droop: number, lift: number): TubeGeometry {
  const key = `${length}:${droop}:${lift}`;
  const cached = whiskerCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(length * 0.34, droop * 0.5, -length * 0.05),
    new Vector3(length * 0.7, droop + lift * 0.35, -length * 0.14),
    new Vector3(length, droop * 0.8 + lift, -length * 0.26),
  ]);
  const geometry = new TubeGeometry(curve, 24, 0.007, 6, false);
  whiskerCache.set(key, geometry);
  return geometry;
}
