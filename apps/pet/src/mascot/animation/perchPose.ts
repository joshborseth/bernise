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

/** Lie on the left bezel with the head in the on-screen peek. */
const left: PerchPose = {
  x: 0.46,
  y: -0.32,
  z: 0.1,
  pitch: 0.16,
  yaw: 0.72,
  roll: -1.18,
  headPitch: 0.28,
  headYaw: -0.52,
  headRoll: 0.32,
  lookX: 0.78,
  lookY: -0.1,
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

export function perchPose(perch: Perch): PerchPose {
  switch (perch) {
    case "left":
      return left;
    case "right":
      return {
        x: -left.x,
        y: left.y,
        z: left.z,
        pitch: left.pitch,
        yaw: -left.yaw,
        roll: -left.roll,
        headPitch: left.headPitch,
        headYaw: -left.headYaw,
        headRoll: -left.headRoll,
        lookX: -left.lookX,
        lookY: left.lookY,
      };
    case "top":
      return {
        x: 0,
        y: -0.38,
        z: 0.14,
        pitch: 0.42,
        yaw: 0,
        roll: 0,
        headPitch: 0.48,
        headYaw: 0,
        headRoll: 0,
        lookX: 0,
        lookY: -0.82,
      };
    case "bottom":
      return {
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
    default:
      return idlePerchPose;
  }
}
