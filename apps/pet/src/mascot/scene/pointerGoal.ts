export type PointerGoal = { x: number; y: number };

export const pointerGoal: PointerGoal = { x: 0, y: 0 };

export const setPointerGoal = (x: number, y: number): void => {
  pointerGoal.x = Math.max(-1, Math.min(1, x));
  pointerGoal.y = Math.max(-1, Math.min(1, y));
};
