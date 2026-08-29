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
  snow: "#fffcf7",
  snowShade: "#f4ebe0",
  silver: "#ded3c6",
  tabby: "#b3a294",
  tabbyDark: "#8a7768",
  innerEar: "#eeb2ab",
  nose: "#d98f88",
  liner: "#3a2b25",
  mouth: "#a76a63",
  eyeWhite: "#ffffff",
  irisRim: "#1f6ba8",
  iris: "#4ea8e2",
  irisGlow: "#9fd9f6",
  pupil: "#141a20",
  shine: "#ffffff",
  fang: "#f3ece1",
  whisker: "#c9bbae",
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
