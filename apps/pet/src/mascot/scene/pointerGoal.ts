export type PointerGoal = { x: number; y: number };

export type PointerClient = {
  readonly clientX: number;
  readonly clientY: number;
};

export type PointerStage = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export type PointerViewport = {
  readonly width: number;
  readonly height: number;
};

const clampUnit = (value: number): number => Math.max(-1, Math.min(1, value));

export const pointerGoalFromClient = (
  pointer: PointerClient,
  stage: PointerStage | undefined,
  viewport: PointerViewport,
): PointerGoal => {
  const spanX = Math.max(1, viewport.width * 0.42);
  const spanY = Math.max(1, viewport.height * 0.42);
  const cx = stage === undefined ? viewport.width / 2 : stage.left + stage.width / 2;
  const cy = stage === undefined ? viewport.height * 0.38 : stage.top + stage.height * 0.38;
  return {
    x: clampUnit((pointer.clientX - cx) / spanX),
    y: clampUnit(-(pointer.clientY - cy) / spanY),
  };
};
