import { Raycaster, Vector2, type Camera, type Object3D } from "three";

export type ClientRectLike = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
};

const raycaster = new Raycaster();
const ndc = new Vector2();

let camera: Camera | null = null;
let body: Object3D | null = null;
let canvas: HTMLCanvasElement | null = null;

export const bindHitTarget = (
  nextCamera: Camera,
  nextBody: Object3D,
  nextCanvas: HTMLCanvasElement,
): (() => void) => {
  camera = nextCamera;
  body = nextBody;
  canvas = nextCanvas;
  return () => {
    if (camera === nextCamera) {
      camera = null;
    }
    if (body === nextBody) {
      body = null;
    }
    if (canvas === nextCanvas) {
      canvas = null;
    }
  };
};

export const clientToNdc = (
  clientX: number,
  clientY: number,
  rect: ClientRectLike,
): { readonly x: number; readonly y: number } | undefined => {
  if (rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return undefined;
  }
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  };
};

export const hitTestBody = (clientX: number, clientY: number): boolean => {
  if (camera === null || body === null || canvas === null) {
    return false;
  }
  const point = clientToNdc(clientX, clientY, canvas.getBoundingClientRect());
  if (point === undefined) {
    return false;
  }
  camera.updateMatrixWorld();
  body.updateWorldMatrix(true, true);
  ndc.set(point.x, point.y);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(body, true).length > 0;
};
