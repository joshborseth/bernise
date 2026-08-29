import type { Group, Vector3 } from "three";
import { clamp01, easeOutCubic } from "./easing.ts";

export const litterWakeEnd = 0.4;
export const litterTurnEnd = 1.1;
export const litterSquatEnd = 2.5;
export const litterDropEnd = 5.1;
export const litterCoverEnd = 9.6;
export const litterDoneAt = 11.5;
export const litterReducedDoneAt = 1.8;
export const litterScratchEvery = 0.35;
export const litterYaw = -1.48;
export const litterRootDrop = -0.08;
export const litterPitch = 0.16;
export const litterPush = 0.06;
export const litterBodyDrop = 0.04;
export const litterBodyScaleX = 1.02;
export const litterBodyScaleY = 0.96;
export const litterBodyScaleZ = 1;
export const litterHeadY = -0.12;
export const litterHeadZ = 0.08;
export const litterHeadPitch = 0.08;
export const litterHeadRoll = 0.02;
export const litterPawIn = 0.04;
export const litterPawDown = -0.16;
export const litterPawForward = 0.08;
export const litterHindOut = 0.08;
export const litterHindDown = -0.16;
export const litterHindBack = -0.02;
export const litterTailLiftX = 0.62;
export const litterTailLiftY = 0.38;
export const litterTailLiftZ = 0.22;
export const litterTailCoverX = 0.08;
export const litterTailCoverY = 0.2;
export const litterTailCoverZ = 0.06;
export const litterSquintOpen = 0.28;
export const litterSquintWidth = 1.1;
export const litterBoxX = 0.08;
export const litterBoxZ = 0;
export const litterBoxRestY = -1.16;
export const litterBoxHiddenY = -2.3;
export const litterDropStagger = 0.1;
export const litterDropFall = 0.2;
export const litterDrops: ReadonlyArray<{
  readonly start: readonly [number, number, number];
  readonly land: readonly [number, number, number];
  readonly radius: number;
  readonly color: string;
}> = [
  { start: [0.58, 0.52, 0.26], land: [0.72, 0.19, 0.32], radius: 0.068, color: "#241510" },
  { start: [0.62, 0.54, 0.18], land: [0.88, 0.18, 0.12], radius: 0.06, color: "#1a100c" },
  { start: [0.52, 0.5, 0.34], land: [0.56, 0.19, 0.48], radius: 0.072, color: "#2e1a14" },
  { start: [0.66, 0.53, 0.22], land: [0.94, 0.17, 0.28], radius: 0.055, color: "#3a221a" },
  { start: [0.5, 0.51, 0.14], land: [0.4, 0.19, 0.02], radius: 0.064, color: "#1f120e" },
  { start: [0.6, 0.55, 0.38], land: [0.78, 0.18, 0.52], radius: 0.07, color: "#4a2c22" },
];
export const litterKickOrigins: ReadonlyArray<readonly [number, number, number]> = [
  [0.42, 0.12, 0.22],
  [0.5, 0.1, 0.08],
  [0.38, 0.11, 0.34],
  [0.46, 0.09, -0.02],
  [0.54, 0.13, 0.16],
  [0.4, 0.1, 0.28],
];

export type LitterMotion = {
  readonly turn: number;
  readonly box: number;
  readonly squat: number;
  readonly wiggle: number;
  readonly dropT: number;
  readonly bury: number;
  readonly scratch: number;
  readonly kick: number;
  readonly shake: number;
  readonly tailLift: number;
  readonly coverStarted: boolean;
  readonly done: boolean;
};

export const litterIdle: LitterMotion = {
  turn: 0,
  box: 0,
  squat: 0,
  wiggle: 0,
  dropT: 0,
  bury: 0,
  scratch: 0,
  kick: 0,
  shake: 0,
  tailLift: 0,
  coverStarted: false,
  done: false,
};

export function litterTailOffset(
  squat: number,
  tailLift: number,
): readonly [number, number, number] {
  const lift = squat * tailLift;
  const cover = squat * (1 - tailLift);
  return [
    lift * litterTailLiftX + cover * litterTailCoverX,
    lift * litterTailLiftY + cover * litterTailCoverY,
    lift * litterTailLiftZ + cover * litterTailCoverZ,
  ];
}

export function setFrontPaw(
  paw: Group,
  rest: Vector3,
  side: -1 | 1,
  squat: number,
  rake: number,
  scratch: number,
): void {
  paw.position.set(
    rest.x + side * squat * litterPawIn + rake * 0.08,
    rest.y + squat * litterPawDown + scratch * 0.03 + Math.max(0, rake) * 0.05,
    rest.z + squat * litterPawForward + rake * 0.16,
  );
  paw.rotation.set(
    squat * -0.28 + scratch * -0.22 + rake * -0.28,
    0,
    side * (squat * 0.05 + rake * 0.12),
  );
}

export function setPlantedHindPaw(paw: Group, rest: Vector3, side: -1 | 1, squat: number): void {
  paw.position.set(
    rest.x + side * squat * litterHindOut,
    rest.y + squat * litterHindDown,
    rest.z + squat * litterHindBack,
  );
  paw.rotation.set(squat * -0.18, Math.PI, side * squat * 0.08);
  paw.scale.setScalar(squat);
}

export function litterMotion(elapsed: number): LitterMotion {
  if (elapsed < 0) {
    return litterIdle;
  }
  if (elapsed >= litterDoneAt) {
    return { ...litterIdle, done: true };
  }
  if (elapsed < litterWakeEnd) {
    return litterIdle;
  }
  if (elapsed < litterTurnEnd) {
    const ramp = easeOutCubic((elapsed - litterWakeEnd) / (litterTurnEnd - litterWakeEnd));
    return {
      ...litterIdle,
      turn: ramp,
      box: ramp,
    };
  }
  if (elapsed < litterSquatEnd) {
    const squatT = (elapsed - litterTurnEnd) / 0.45;
    const squat = easeOutCubic(clamp01(squatT));
    return {
      ...litterIdle,
      turn: 1,
      box: 1,
      squat,
      tailLift: squat,
      wiggle: squatT > 1 ? Math.sin(elapsed * 7.4) * 0.45 + Math.sin(elapsed * 13) * 0.15 : 0,
    };
  }
  if (elapsed < litterDropEnd) {
    const dropT = (elapsed - litterSquatEnd) / (litterDropEnd - litterSquatEnd);
    return {
      ...litterIdle,
      turn: 1,
      box: 1,
      squat: 1,
      tailLift: 1,
      wiggle: Math.sin(elapsed * 6.2) * 0.35 + Math.sin(elapsed * 11) * 0.12,
      dropT,
    };
  }
  if (elapsed < litterCoverEnd) {
    const coverT = (elapsed - litterDropEnd) / (litterCoverEnd - litterDropEnd);
    return {
      ...litterIdle,
      turn: 1,
      box: 1,
      squat: 1,
      dropT: 1,
      bury: easeOutCubic(clamp01((coverT - 0.05) / 0.7)),
      scratch: 1,
      kick: Math.min(1, coverT * 2),
      tailLift: 1 - easeOutCubic(clamp01(coverT / 0.35)),
      coverStarted: true,
    };
  }
  const outT = (elapsed - litterCoverEnd) / (litterDoneAt - litterCoverEnd);
  return {
    ...litterIdle,
    turn: 1 - easeOutCubic(clamp01(outT / 0.5)),
    squat: 1 - easeOutCubic(clamp01(outT / 0.45)),
    box: 1 - easeOutCubic(clamp01((outT - 0.2) / 0.8)),
    shake: outT < 0.55 ? 1 - outT / 0.55 : 0,
    scratch: Math.max(0, 1 - outT * 4),
    dropT: 1,
    bury: 1,
    coverStarted: outT < 0.15,
  };
}

export function litterReducedMotion(elapsed: number): LitterMotion {
  if (elapsed < 0) {
    return litterIdle;
  }
  if (elapsed >= litterReducedDoneAt) {
    return { ...litterIdle, done: true };
  }
  return {
    ...litterIdle,
    turn: 1,
    box: 1,
    squat: 1,
    dropT: 1,
    tailLift: 1,
    bury: 1,
  };
}

export function poseLitterProps(
  box: Group | null,
  drops: Group | null,
  kicks: Group | null,
  covers: Group | null,
  motion: LitterMotion,
  time: number,
): void {
  if (box !== null) {
    box.position.set(
      litterBoxX,
      litterBoxHiddenY + (litterBoxRestY - litterBoxHiddenY) * motion.box,
      litterBoxZ,
    );
    box.scale.setScalar(1);
    box.visible = motion.box > 0.001;
  }
  if (drops !== null) {
    for (let i = 0; i < drops.children.length; i++) {
      const spec = litterDrops[i];
      const child = drops.children[i];
      if (spec === undefined || child === undefined) {
        continue;
      }
      const fall = easeOutCubic(clamp01((motion.dropT - i * litterDropStagger) / litterDropFall));
      const appear = clamp01(fall / 0.18);
      const size = appear * (1 - motion.bury);
      child.frustumCulled = false;
      child.visible = appear > 0.02 && motion.bury < 0.92;
      child.position.set(
        spec.start[0] + (spec.land[0] - spec.start[0]) * fall,
        spec.start[1] + (spec.land[1] - spec.start[1]) * fall - motion.bury * 0.14,
        spec.start[2] + (spec.land[2] - spec.start[2]) * fall,
      );
      child.scale.set(size, 1.1 * size, size);
    }
  }
  if (covers !== null) {
    for (let i = 0; i < covers.children.length; i++) {
      const spec = litterDrops[i];
      const child = covers.children[i];
      if (spec === undefined || child === undefined) {
        continue;
      }
      const mound = easeOutCubic(motion.bury);
      child.visible = mound > 0.02;
      child.position.set(
        spec.land[0],
        spec.land[1] * (1 - mound * 0.35) + 0.06 * mound,
        spec.land[2],
      );
      child.scale.set(1.7 * mound, 0.95 * mound, 1.55 * mound);
    }
  }
  if (kicks !== null) {
    for (let i = 0; i < kicks.children.length; i++) {
      const origin = litterKickOrigins[i];
      const dest = litterDrops[i % litterDrops.length];
      const child = kicks.children[i];
      if (origin === undefined || dest === undefined || child === undefined) {
        continue;
      }
      const travel = easeOutCubic(motion.kick);
      const hop =
        motion.scratch * Math.abs(Math.sin(time * 14 + i * 1.7)) * 0.18 * (1 - travel * 0.55);
      child.visible = motion.kick > 0.02 && motion.bury < 0.98;
      child.position.set(
        origin[0] + (dest.land[0] - origin[0]) * travel,
        origin[1] + (dest.land[1] - origin[1]) * travel + hop,
        origin[2] + (dest.land[2] - origin[2]) * travel,
      );
      const grain = motion.kick * (1 - motion.bury * 0.85);
      child.scale.set(grain, grain * 0.55, grain);
    }
  }
}
