import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";

export function FitCamera() {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.position.set(0, 0.02, 5.6);
    camera.lookAt(0, -0.05, 0);
  }, [camera]);
  return null;
}
