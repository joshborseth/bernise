import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { Perch } from "../animation/perchPose.ts";
import { cameraForPet, mascotCameraLookAt } from "./camera.ts";

const lookTarget = new Vector3(...mascotCameraLookAt);

export function FitCamera({
  usingLitter,
  perch,
}: {
  readonly usingLitter: boolean;
  readonly perch: Perch;
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const blend = useRef<{ x: number; y: number; z: number; fov: number }>({
    x: mascotCameraLookAt[0],
    y: mascotCameraLookAt[1],
    z: mascotCameraLookAt[2],
    fov: 30,
  });

  useFrame((_, dt) => {
    const target = cameraForPet({ usingLitter, perch });
    camera.position.set(
      MathUtils.damp(camera.position.x, target.position[0], 8, dt),
      MathUtils.damp(camera.position.y, target.position[1], 8, dt),
      MathUtils.damp(camera.position.z, target.position[2], 8, dt),
    );
    blend.current.x = MathUtils.damp(blend.current.x, target.lookAt[0], 8, dt);
    blend.current.y = MathUtils.damp(blend.current.y, target.lookAt[1], 8, dt);
    blend.current.z = MathUtils.damp(blend.current.z, target.lookAt[2], 8, dt);
    blend.current.fov = MathUtils.damp(blend.current.fov, target.fov, 8, dt);
    lookTarget.set(blend.current.x, blend.current.y, blend.current.z);
    camera.lookAt(lookTarget);
    camera.fov = blend.current.fov;
    camera.updateProjectionMatrix();
  });

  return null;
}
