export function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

export function easeOutBack(value: number): number {
  const overshoot = 1.70158;
  const curved = overshoot + 1;
  return 1 + curved * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function escalateDamp(elapsed: number): number {
  return elapsed >= 0 ? 18 : 5;
}
