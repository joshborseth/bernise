import type { BakeOptions, Metaball } from "./metaballs.ts";

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
  | "rightPaw";

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

/**
 * Model space: +y up, +z toward the viewer. Bernise stands roughly
 * -1.2..1.2 tall so the whole figure fits the mascot camera.
 */

const crown: ReadonlyArray<Metaball> = [
  { position: [0, 0.42, -0.02], radius: 0.28 },
  { position: [-0.2, 0.45, -0.04], radius: 0.36 },
  { position: [0.2, 0.45, -0.04], radius: 0.36 },
  { position: [0, 0.5, -0.1], radius: 0.27 },
  { position: [-0.14, 0.42, -0.22], radius: 0.3 },
  { position: [0.14, 0.42, -0.22], radius: 0.3 },
  { position: [-0.36, 0.58, -0.08], radius: 0.2 },
  { position: [0.36, 0.58, -0.08], radius: 0.2 },
  // Widow's peak, so the mask dips between the eyes instead of ending flat.
  { position: [0, 0.33, 0.2], radius: 0.11 },
];

const faceFur: ReadonlyArray<Metaball> = [
  { position: [-0.3, 0.22, 0.17], radius: 0.27 },
  { position: [0.3, 0.22, 0.17], radius: 0.27 },
  { position: [-0.48, 0.36, -0.06], radius: 0.14 },
  { position: [0.48, 0.36, -0.06], radius: 0.14 },
  { position: [-0.5, 0.16, -0.04], radius: 0.16 },
  { position: [0.5, 0.16, -0.04], radius: 0.16 },
  { position: [-0.41, -0.02, -0.02], radius: 0.15 },
  { position: [0.41, -0.02, -0.02], radius: 0.15 },
  { position: [0, 0.04, 0.28], radius: 0.19 },
  { position: [-0.1, 0.19, 0.36], radius: 0.18 },
  { position: [0.1, 0.19, 0.36], radius: 0.18 },
];

const headBake: BakeOptions = { center: [0, 0.36, 0], half: 0.88, resolution: 64 };

const headMass: Mass = { balls: [...crown, ...faceFur], bake: headBake };

/**
 * The tabby mask is the crown inflated just enough to sit on the pale head as
 * a thin skin, so the white muzzle, chin and cheek fur still push through it.
 */
const capMass: Mass = {
  balls: crown,
  bake: { ...headBake, resolution: 56, inflate: 0.035 },
};

const ruffMass: Mass = {
  balls: [
    { position: [0, -0.1, 0.16], radius: 0.24 },
    { position: [-0.24, -0.16, 0.08], radius: 0.23 },
    { position: [0.24, -0.16, 0.08], radius: 0.23 },
    { position: [-0.44, -0.26, 0], radius: 0.17 },
    { position: [0.44, -0.26, 0], radius: 0.17 },
    { position: [0, -0.34, 0.2], radius: 0.26 },
    { position: [-0.22, -0.36, 0.12], radius: 0.21 },
    { position: [0.22, -0.36, 0.12], radius: 0.21 },
    { position: [-0.12, -0.54, 0.16], radius: 0.16 },
    { position: [0.12, -0.54, 0.16], radius: 0.16 },
    { position: [-0.36, -0.5, 0.06], radius: 0.15 },
    { position: [0.36, -0.5, 0.06], radius: 0.15 },
  ],
  bake: { center: [0, -0.28, 0.06], half: 0.8, resolution: 60 },
};

const bodyMass: Mass = {
  balls: [
    { position: [0, -0.5, -0.02], radius: 0.36 },
    { position: [0, -0.72, 0.02], radius: 0.31 },
    { position: [0, -0.88, 0.04], radius: 0.26 },
    { position: [0, -0.45, -0.24], radius: 0.28 },
    { position: [-0.3, -0.68, -0.04], radius: 0.24 },
    { position: [0.3, -0.68, -0.04], radius: 0.24 },
    { position: [-0.32, -0.38, 0], radius: 0.22 },
    { position: [0.32, -0.38, 0], radius: 0.22 },
    { position: [-0.4, -0.55, -0.06], radius: 0.15 },
    { position: [0.4, -0.55, -0.06], radius: 0.15 },
    { position: [-0.34, -0.85, 0], radius: 0.14 },
    { position: [0.34, -0.85, 0], radius: 0.14 },
  ],
  bake: { center: [0, -0.62, -0.02], half: 0.82, resolution: 60 },
};

/** Baked around its own pivot so the whole tail sways as one rigid piece. */
const tailMass: Mass = {
  balls: [
    { position: [0, 0, 0], radius: 0.19 },
    { position: [0.1, 0.2, -0.04], radius: 0.18 },
    { position: [0.18, 0.4, -0.08], radius: 0.17 },
    { position: [0.2, 0.58, -0.12], radius: 0.15 },
    { position: [0.15, 0.74, -0.15], radius: 0.13 },
    { position: [0.34, 0.32, -0.06], radius: 0.11 },
    { position: [0.36, 0.55, -0.1], radius: 0.1 },
    { position: [-0.02, 0.46, -0.05], radius: 0.11 },
  ],
  bake: { center: [0.15, 0.36, -0.08], half: 0.7, resolution: 48 },
};

function eye(side: -1 | 1): Node {
  const eyeId: PartId = side < 0 ? "leftEye" : "rightEye";
  const whiteId: PartId = side < 0 ? "leftWhite" : "rightWhite";
  const irisId: PartId = side < 0 ? "leftIris" : "rightIris";
  const pupilId: PartId = side < 0 ? "leftPupil" : "rightPupil";
  return {
    kind: "group",
    id: eyeId,
    position: [side * 0.24, 0.4, 0.38],
    rotation: [0.02, side * 0.3, side * 0.05],
    children: [
      {
        kind: "group",
        scale: 0.88,
        children: [
          { kind: "sphere", surface: "liner", radius: 0.156, scale: [1, 0.88, 0.32] },
          {
            kind: "group",
            id: whiteId,
            children: [
              {
                kind: "sphere",
                surface: "eyeWhite",
                radius: 0.144,
                scale: [1, 0.84, 0.34],
                position: [0, -0.006, 0.014],
              },
            ],
          },
          {
            kind: "group",
            id: irisId,
            position: [0, 0, 0.02],
            children: [
              {
                kind: "sphere",
                surface: "irisRim",
                radius: 0.126,
                scale: [1, 0.9, 0.3],
                position: [0, -0.008, 0.018],
              },
              {
                kind: "sphere",
                surface: "iris",
                radius: 0.11,
                scale: [1, 0.9, 0.3],
                position: [0, -0.008, 0.032],
              },
              {
                kind: "sphere",
                surface: "irisGlow",
                radius: 0.076,
                scale: [1.15, 0.8, 0.22],
                position: [0, -0.042, 0.044],
              },
              {
                kind: "group",
                id: pupilId,
                children: [
                  {
                    kind: "sphere",
                    surface: "pupil",
                    radius: 0.078,
                    scale: [1, 1.04, 0.3],
                    position: [0, -0.008, 0.05],
                  },
                ],
              },
              {
                kind: "sphere",
                surface: "shine",
                radius: 0.036,
                scale: [1, 0.95, 0.4],
                position: [side * -0.044, 0.03, 0.062],
              },
              {
                kind: "sphere",
                surface: "shine",
                radius: 0.018,
                scale: [1, 0.9, 0.4],
                position: [side * 0.046, -0.048, 0.058],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Cones showed their base disc as a hard brim across the skull, so each ear is
 * its own little blob chain: pointed at the tip, smooth where it meets the head.
 */
const earMass: Mass = {
  balls: [
    { position: [0, 0, 0], radius: 0.16 },
    { position: [0.03, 0.13, -0.005], radius: 0.13 },
    { position: [0.06, 0.24, -0.01], radius: 0.1 },
    { position: [0.085, 0.33, -0.012], radius: 0.068 },
    { position: [0.1, 0.4, -0.015], radius: 0.042 },
  ],
  bake: { center: [0.05, 0.2, -0.01], half: 0.34, resolution: 44 },
};

/** Authored leaning right; the left ear is the same group mirrored. */
const earParts: ReadonlyArray<Node> = [
  { kind: "mass", surface: "tabby", mass: earMass, outline: true },
  {
    kind: "sphere",
    surface: "innerEar",
    radius: 0.065,
    scale: [0.8, 1.9, 0.4],
    position: [0.04, 0.16, 0.11],
    rotation: [0, 0, -0.12],
  },
  {
    kind: "sphere",
    surface: "snow",
    radius: 0.032,
    scale: [0.7, 2.4, 0.7],
    position: [-0.035, 0.15, 0.12],
    rotation: [0, 0, 0.16],
  },
  {
    kind: "sphere",
    surface: "snow",
    radius: 0.03,
    scale: [0.7, 2.2, 0.7],
    position: [-0.075, 0.05, 0.11],
    rotation: [0, 0, 0.34],
  },
];

function ear(side: -1 | 1): Node {
  return {
    kind: "group",
    id: side < 0 ? "leftEar" : "rightEar",
    position: [side * 0.36, 0.56, 0.0],
    children: [
      {
        kind: "group",
        scale: side < 0 ? [-1, 1, 1] : [1, 1, 1],
        children: [{ kind: "group", rotation: [0.1, -0.16, -0.16], children: earParts }],
      },
    ],
  };
}

function paw(id?: PartId): Node {
  return {
    kind: "group",
    id,
    position: [id === "leftPaw" ? -0.22 : 0.22, -0.98, 0.34],
    children: [
      { kind: "sphere", surface: "snow", radius: 0.17, scale: [1.2, 0.72, 1.25], outline: true },
      {
        kind: "sphere",
        surface: "snow",
        radius: 0.07,
        scale: [1, 0.85, 1.1],
        position: [-0.09, -0.015, 0.14],
      },
      {
        kind: "sphere",
        surface: "snow",
        radius: 0.075,
        scale: [1, 0.85, 1.1],
        position: [0, -0.015, 0.165],
      },
      {
        kind: "sphere",
        surface: "snow",
        radius: 0.07,
        scale: [1, 0.85, 1.1],
        position: [0.09, -0.015, 0.14],
      },
    ],
  };
}

const muzzle: Node = {
  kind: "group",
  position: [0, 0.19, 0.42],
  children: [
    {
      kind: "sphere",
      surface: "nose",
      radius: 0.064,
      scale: [1.5, 1.05, 0.9],
      position: [0, 0.06, 0.12],
      outline: true,
    },
    {
      kind: "sphere",
      surface: "shine",
      radius: 0.017,
      scale: [1, 0.75, 0.5],
      position: [-0.03, 0.092, 0.168],
    },
    {
      kind: "sphere",
      surface: "liner",
      radius: 0.008,
      scale: [0.5, 3.4, 0.5],
      position: [0, 0.005, 0.15],
    },
    {
      kind: "group",
      id: "mouth",
      position: [0, -0.062, 0.115],
      children: [{ kind: "sphere", surface: "mouth", radius: 0.062, scale: [1, 0.36, 0.55] }],
    },
    {
      kind: "group",
      id: "fangs",
      position: [0, -0.03, 0.14],
      scale: 0,
      children: [
        {
          kind: "cone",
          surface: "fang",
          radius: 0.018,
          height: 0.07,
          position: [-0.036, -0.02, 0.02],
          rotation: [Math.PI, 0, 0.14],
        },
        {
          kind: "cone",
          surface: "fang",
          radius: 0.018,
          height: 0.07,
          position: [0.036, -0.02, 0.02],
          rotation: [Math.PI, 0, -0.14],
        },
      ],
    },
    {
      kind: "sphere",
      surface: "liner",
      radius: 0.05,
      scale: [1.1, 0.34, 0.3],
      position: [-0.044, -0.03, 0.13],
      rotation: [0, 0, 0.42],
    },
    {
      kind: "sphere",
      surface: "liner",
      radius: 0.05,
      scale: [1.1, 0.34, 0.3],
      position: [0.044, -0.03, 0.13],
      rotation: [0, 0, -0.42],
    },
  ],
};

/** Authored for the right side; the left side is the same group mirrored. */
const whiskerSet: ReadonlyArray<Node> = [
  {
    kind: "whisker",
    length: 0.54,
    droop: -0.03,
    lift: 0.16,
    position: [0.18, 0.24, 0.44],
    rotation: [0.05, -0.44, 0.34],
  },
  {
    kind: "whisker",
    length: 0.58,
    droop: -0.05,
    lift: 0.08,
    position: [0.18, 0.2, 0.44],
    rotation: [0, -0.4, 0.1],
  },
  {
    kind: "whisker",
    length: 0.52,
    droop: -0.06,
    lift: 0.03,
    position: [0.175, 0.16, 0.435],
    rotation: [-0.04, -0.36, -0.16],
  },
  {
    kind: "whisker",
    length: 0.42,
    droop: -0.07,
    lift: 0.0,
    position: [0.17, 0.12, 0.42],
    rotation: [-0.08, -0.32, -0.38],
  },
];

const whiskers: Node = {
  kind: "group",
  id: "whiskers",
  children: [
    { kind: "group", children: whiskerSet },
    { kind: "group", scale: [-1, 1, 1], children: whiskerSet },
  ],
};

export const bernise: Node = {
  kind: "group",
  id: "root",
  children: [
    {
      kind: "group",
      id: "body",
      children: [
        {
          kind: "group",
          id: "tail",
          position: [0.46, -0.78, -0.22],
          rotation: [0.18, 0.3, -0.3],
          children: [{ kind: "mass", surface: "silver", mass: tailMass, outline: true }],
        },
        { kind: "mass", surface: "silver", mass: bodyMass, outline: true },
        paw("leftPaw"),
        paw("rightPaw"),
        { kind: "mass", surface: "snow", mass: ruffMass, outline: true },
      ],
    },
    {
      kind: "group",
      id: "head",
      position: [0, 0, 0],
      children: [
        { kind: "mass", surface: "snowShade", mass: headMass, outline: true },
        { kind: "mass", surface: "tabby", mass: capMass },
        {
          kind: "sphere",
          surface: "tabbyDark",
          radius: 0.062,
          scale: [0.5, 2.6, 0.34],
          position: [0, 0.58, 0.31],
        },
        {
          kind: "sphere",
          surface: "tabbyDark",
          radius: 0.055,
          scale: [0.5, 2.4, 0.34],
          position: [-0.25, 0.56, 0.28],
          rotation: [0, 0, 0.2],
        },
        {
          kind: "sphere",
          surface: "tabbyDark",
          radius: 0.055,
          scale: [0.5, 2.4, 0.34],
          position: [0.25, 0.56, 0.28],
          rotation: [0, 0, -0.2],
        },
        muzzle,
        whiskers,
        ear(-1),
        ear(1),
        eye(-1),
        eye(1),
      ],
    },
  ],
};
