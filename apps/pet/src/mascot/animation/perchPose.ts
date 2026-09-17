export type Perch = "none" | "left" | "right" | "top" | "bottom";

export type PerchPose = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
  readonly headPitch: number;
  readonly headYaw: number;
  readonly headRoll: number;
  readonly lookX: number;
  readonly lookY: number;
};

export type FaceLook = {
  readonly x: number;
  readonly y: number;
};

export const idlePerchPose: PerchPose = {
  x: 0,
  y: 0,
  z: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  lookX: 0,
  lookY: 0,
};

/** Lie on the left bezel so the head peeks toward +X (into the screen). */
const left: PerchPose = {
  x: 0.38,
  y: -0.06,
  z: 0.14,
  pitch: 0.06,
  yaw: 0.1,
  roll: -1.52,
  headPitch: -0.14,
  headYaw: 0.1,
  headRoll: 0.08,
  lookX: 0.7,
  lookY: -0.08,
};

const bottom: PerchPose = {
  x: 0,
  y: -0.08,
  z: 0.12,
  pitch: -0.3,
  yaw: 0.04,
  roll: 0.05,
  headPitch: -0.24,
  headYaw: 0,
  headRoll: 0.04,
  lookX: 0,
  lookY: 0.58,
};

/** Hang from the top bezel, inverted, so the head peeks down at the work. */
const top: PerchPose = {
  x: 0.02,
  y: 0.04,
  z: 0.12,
  pitch: 0.04,
  yaw: 0.04,
  roll: Math.PI,
  headPitch: -0.22,
  headYaw: 0,
  headRoll: 0.06,
  lookX: 0,
  lookY: -0.7,
};

export function parsePerch(value: unknown): Perch {
  switch (value) {
    case "left":
    case "right":
    case "top":
    case "bottom":
      return value;
    default:
      return "none";
  }
}

function mirrorX(pose: PerchPose): PerchPose {
  return {
    x: -pose.x,
    y: pose.y,
    z: pose.z,
    pitch: pose.pitch,
    yaw: -pose.yaw,
    roll: -pose.roll,
    headPitch: pose.headPitch,
    headYaw: -pose.headYaw,
    headRoll: -pose.headRoll,
    lookX: -pose.lookX,
    lookY: pose.lookY,
  };
}

export function perchPose(perch: Perch): PerchPose {
  switch (perch) {
    case "left":
      return left;
    case "right":
      return mirrorX(left);
    case "top":
      return top;
    case "bottom":
      return bottom;
    default:
      return idlePerchPose;
  }
}

/**
 * Map a screen-space look into the cat's face space after the perch roll.
 * +x is the cat's left/right; +y is toward the crown.
 */
export function perchFaceLook(perch: Perch, lookX: number, lookY: number): FaceLook {
  switch (perch) {
    case "left":
      return { x: -lookY, y: lookX };
    case "right":
      return { x: lookY, y: -lookX };
    case "top":
      return { x: -lookX, y: -lookY };
    default:
      return { x: lookX, y: lookY };
  }
}
