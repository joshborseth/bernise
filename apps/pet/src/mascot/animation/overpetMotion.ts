import { easeOutBack, easeOutCubic } from "./easing.ts";

export const squintOpenness = 0.06;
export const squintWidth = 1.18;
export const purrOpenness = 0.2;
export const purrIrisScale = 0.35;
export const biteOpenness = 1.18;
export const biteWidth = 1.08;
export const hissOpenness = 1.12;
export const hissWidth = 1.06;
export const hissPupilX = 0.28;
export const hissPupilY = 1.15;
export const strikeAfter = 4;
export const strikeOpen = 0.12;
export const strikeChomp = 0.18;
export const strikeDone = 0.3;
export const hissAttack = 0.14;
export const hissDone = 0.4;
export const fangSinkY = 0.018;
export const fangSinkZ = 0.04;

export function strikeMotion(elapsed: number): {
  lunge: number;
  mouth: number;
  fangs: number;
  shake: number;
} {
  if (elapsed < 0) {
    return { lunge: 0, mouth: 0, fangs: 0, shake: 0 };
  }
  if (elapsed < strikeOpen) {
    const open = elapsed / strikeOpen;
    const mouth = easeOutCubic(open);
    return { lunge: easeOutBack(open), mouth, fangs: mouth, shake: 0 };
  }
  if (elapsed < strikeChomp) {
    const close = (elapsed - strikeOpen) / (strikeChomp - strikeOpen);
    const mouth = 1 - close;
    return { lunge: 1, mouth, fangs: 1, shake: 0 };
  }
  const snap = elapsed < strikeChomp + 0.12 ? 1 - (elapsed - strikeChomp) / 0.12 : 0;
  return {
    lunge: 1,
    mouth: 0.12,
    fangs: 1,
    shake: Math.sin((elapsed - strikeChomp) * 80) * snap + Math.sin(elapsed * 14) * 0.04,
  };
}

export function hissMotion(elapsed: number): {
  recoil: number;
  mouth: number;
  fangs: number;
  tremor: number;
} {
  if (elapsed < 0) {
    return { recoil: 0, mouth: 0, fangs: 0, tremor: 0 };
  }
  if (elapsed < hissAttack) {
    const open = elapsed / hissAttack;
    const mouth = easeOutCubic(open);
    return { recoil: easeOutBack(open), mouth, fangs: mouth, tremor: 0 };
  }
  return {
    recoil: 1,
    mouth: 1,
    fangs: 1,
    tremor: Math.sin(elapsed * 62) * 0.55 + Math.sin(elapsed * 28) * 0.2,
  };
}
