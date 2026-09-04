import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import {
  litterCameraFov,
  litterCameraLookAt,
  litterCameraPosition,
  mascotCameraFov,
  mascotCameraLookAt,
  mascotCameraPosition,
} from "./camera.ts";

const lookTarget = new Vector3();

export function FitCamera({ usingLitter }: { readonly usingLitter: boolean }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const blend = useRef(0);

  useFrame((_, dt) => {
    blend.current = MathUtils.damp(blend.current, usingLitter ? 1 : 0, 8, dt);
    const t = blend.current;
    camera.position.set(
      MathUtils.lerp(mascotCameraPosition[0], litterCameraPosition[0], t),
      MathUtils.lerp(mascotCameraPosition[1], litterCameraPosition[1], t),
      MathUtils.lerp(mascotCameraPosition[2], litterCameraPosition[2], t),
    );
    lookTarget.set(
      MathUtils.lerp(mascotCameraLookAt[0], litterCameraLookAt[0], t),
      MathUtils.lerp(mascotCameraLookAt[1], litterCameraLookAt[1], t),
      MathUtils.lerp(mascotCameraLookAt[2], litterCameraLookAt[2], t),
    );
    camera.lookAt(lookTarget);
    camera.fov = MathUtils.lerp(mascotCameraFov, litterCameraFov, t);
    camera.updateProjectionMatrix();
  });

  return null;
}
