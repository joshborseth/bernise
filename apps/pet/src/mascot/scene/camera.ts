import type { Perch } from "../animation/perchPose.ts";

export const mascotCameraPosition = [0, 0.02, 5.6] as const;
export const mascotCameraLookAt = [0, -0.05, 0] as const;
export const mascotCameraFov = 30;

/** Pulled back and aimed lower so the litter box, squat, and tail lift stay in frame. */
export const litterCameraPosition = [0, -0.08, 6.85] as const;
export const litterCameraLookAt = [0, -0.34, 0] as const;
export const litterCameraFov = 33;

export type CameraRig = {
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly fov: number;
};

const mascotCamera: CameraRig = {
  position: mascotCameraPosition,
  lookAt: mascotCameraLookAt,
  fov: mascotCameraFov,
};

const litterCamera: CameraRig = {
  position: litterCameraPosition,
  lookAt: litterCameraLookAt,
  fov: litterCameraFov,
};

const perchCameras: Record<Exclude<Perch, "none">, CameraRig> = {
  left: { position: [0.62, 0.02, 4.95], lookAt: [0.28, 0, 0], fov: 30 },
  right: { position: [-0.62, 0.02, 4.95], lookAt: [-0.28, 0, 0], fov: 30 },
  top: { position: [0, -0.22, 5.15], lookAt: [0, 0.26, 0], fov: 30 },
  bottom: { position: [0, 0.28, 5.2], lookAt: [0, -0.06, 0], fov: 32 },
};

export function cameraForPet(input: {
  readonly usingLitter: boolean;
  readonly perch: Perch;
}): CameraRig {
  if (input.usingLitter) {
    return litterCamera;
  }
  if (input.perch === "none") {
    return mascotCamera;
  }
  return perchCameras[input.perch];
}
