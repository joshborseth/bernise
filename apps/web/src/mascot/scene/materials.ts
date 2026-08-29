import { useEffect, useMemo } from "react";
import { MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import type { Material } from "three";
import { palette, type Surface } from "../model/types.ts";

export function useCatMaterials(): Record<Surface, Material> {
  const materials = useMemo(() => {
    const fur = (surface: Surface, roughness = 0.92, emissiveIntensity = 0.06) =>
      new MeshStandardMaterial({
        color: palette[surface],
        roughness,
        metalness: 0,
        emissive: palette[surface],
        emissiveIntensity,
      });
    const glass = (surface: Surface, roughness: number, clearcoat: number) =>
      new MeshPhysicalMaterial({
        color: palette[surface],
        roughness,
        metalness: 0,
        clearcoat,
        clearcoatRoughness: 0.2,
      });
    return {
      snow: fur("snow"),
      snowShade: fur("snowShade"),
      silver: fur("silver"),
      tabby: fur("tabby"),
      tabbyDark: fur("tabbyDark"),
      innerEar: fur("innerEar", 0.7),
      nose: glass("nose", 0.35, 0.5),
      liner: fur("liner", 0.6),
      mouth: fur("mouth", 0.6),
      eyeWhite: fur("eyeWhite", 0.35),
      irisRim: glass("irisRim", 0.22, 0.6),
      iris: new MeshPhysicalMaterial({
        color: palette.iris,
        roughness: 0.18,
        metalness: 0,
        clearcoat: 0.7,
        clearcoatRoughness: 0.18,
        emissive: "#2f8ecb",
        emissiveIntensity: 0.16,
      }),
      irisGlow: new MeshStandardMaterial({
        color: palette.irisGlow,
        roughness: 0.3,
        emissive: palette.irisGlow,
        emissiveIntensity: 0.3,
      }),
      pupil: glass("pupil", 0.15, 0.8),
      shine: new MeshStandardMaterial({
        color: palette.shine,
        roughness: 0.05,
        emissive: palette.shine,
        emissiveIntensity: 0.8,
      }),
      fang: new MeshStandardMaterial({
        color: palette.fang,
        roughness: 0.32,
        metalness: 0,
        emissive: "#fff6ea",
        emissiveIntensity: 0.08,
      }),
      whisker: new MeshStandardMaterial({
        color: palette.whisker,
        roughness: 0.45,
        emissive: "#fffaf2",
        emissiveIntensity: 0.12,
      }),
    } satisfies Record<Surface, Material>;
  }, []);

  useEffect(() => {
    return () => {
      for (const material of Object.values(materials)) {
        material.dispose();
      }
    };
  }, [materials]);

  return materials;
}
