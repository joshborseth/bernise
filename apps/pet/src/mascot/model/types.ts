import type { BakeOptions, Metaball } from "../geometry/metaballs.ts";

export type Vec3 = readonly [number, number, number];

export type Surface =
  | "snow"
  | "snowShade"
  | "silver"
  | "tabby"
  | "tabbyDark"
  | "innerEar"
  | "nose"
  | "liner"
  | "mouth"
  | "eyeWhite"
  | "irisRim"
  | "iris"
  | "irisGlow"
  | "pupil"
  | "shine"
  | "fang"
  | "whisker";

export const palette: Record<Surface, string> = {
  snow: "#f4f5f8",
  snowShade: "#e6e4df",
  silver: "#c5c8d0",
  tabby: "#9aa0ad",
  tabbyDark: "#6b7280",
  innerEar: "#f4dcd7",
  nose: "#d7b0a8",
  liner: "#2a2d36",
  mouth: "#a87b76",
  eyeWhite: "#ffffff",
  irisRim: "#5a6e82",
  iris: "#6a9ec4",
  irisGlow: "#b7d3e8",
  pupil: "#1b1e28",
  shine: "#ffffff",
  fang: "#f0ece6",
  whisker: "#d5d0c8",
};

/** Groups the animation driver steers by name. */
export type PartId =
  | "root"
  | "body"
  | "head"
  | "leftEar"
  | "rightEar"
  | "leftEye"
  | "rightEye"
  | "leftWhite"
  | "rightWhite"
  | "leftIris"
  | "rightIris"
  | "leftPupil"
  | "rightPupil"
  | "mouth"
  | "fangs"
  | "whiskers"
  | "tail"
  | "leftPaw"
  | "rightPaw"
  | "leftHindPaw"
  | "rightHindPaw";

export type Mass = {
  readonly balls: ReadonlyArray<Metaball>;
  readonly bake: BakeOptions;
};

export type Node =
  | {
      readonly kind: "group";
      readonly id?: PartId | undefined;
      readonly position?: Vec3 | undefined;
      readonly rotation?: Vec3 | undefined;
      readonly scale?: Vec3 | number | undefined;
      readonly children: ReadonlyArray<Node>;
    }
  | {
      readonly kind: "mass";
      readonly surface: Surface;
      readonly mass: Mass;
      readonly outline?: boolean | undefined;
    }
  | {
      readonly kind: "sphere";
      readonly surface: Surface;
      readonly radius: number;
      readonly position?: Vec3 | undefined;
      readonly rotation?: Vec3 | undefined;
      readonly scale?: Vec3 | number | undefined;
      readonly outline?: boolean | undefined;
    }
  | {
      readonly kind: "cone";
      readonly surface: Surface;
      readonly radius: number;
      readonly height: number;
      readonly position?: Vec3 | undefined;
      readonly rotation?: Vec3 | undefined;
      readonly scale?: Vec3 | number | undefined;
      readonly outline?: boolean | undefined;
    }
  | {
      readonly kind: "whisker";
      readonly length: number;
      readonly droop: number;
      readonly lift: number;
      readonly position: Vec3;
      readonly rotation: Vec3;
    };
