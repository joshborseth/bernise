import { useEffect, useLayoutEffect, useMemo, type RefObject } from "react";
import { MeshStandardMaterial } from "three";
import type { Group } from "three";
import {
  litterBoxHiddenY,
  litterBoxX,
  litterBoxZ,
  litterDrops,
  litterIdle,
  litterKickOrigins,
  poseLitterProps,
} from "../animation/litterMotion.ts";

export function LitterBox({
  boxRef,
  dropsRef,
  kicksRef,
  coversRef,
}: {
  readonly boxRef: RefObject<Group | null>;
  readonly dropsRef: RefObject<Group | null>;
  readonly kicksRef: RefObject<Group | null>;
  readonly coversRef: RefObject<Group | null>;
}) {
  const materials = useMemo(
    () => ({
      rim: new MeshStandardMaterial({ color: "#e8c4a8", roughness: 0.84, metalness: 0 }),
      well: new MeshStandardMaterial({ color: "#fff6ea", roughness: 0.9, metalness: 0 }),
      litter: new MeshStandardMaterial({ color: "#d4c4a8", roughness: 0.96, metalness: 0 }),
      drops: litterDrops.map(
        (spec) => new MeshStandardMaterial({ color: spec.color, roughness: 0.88, metalness: 0 }),
      ),
    }),
    [],
  );
  useEffect(() => {
    return () => {
      materials.rim.dispose();
      materials.well.dispose();
      materials.litter.dispose();
      for (const material of materials.drops) {
        material.dispose();
      }
    };
  }, [materials]);
  useLayoutEffect(() => {
    poseLitterProps(
      boxRef.current,
      dropsRef.current,
      kicksRef.current,
      coversRef.current,
      litterIdle,
      0,
    );
  }, [boxRef, dropsRef, kicksRef, coversRef]);

  return (
    <group>
      <group ref={boxRef} position={[litterBoxX, litterBoxHiddenY, litterBoxZ]}>
        <mesh position={[0, 0.02, 0]} material={materials.well}>
          <boxGeometry args={[2.5, 0.05, 1.8]} />
        </mesh>
        <mesh position={[0, 0.14, -0.9]} material={materials.rim}>
          <boxGeometry args={[2.66, 0.24, 0.14]} />
        </mesh>
        <mesh position={[0, 0.14, 0.9]} material={materials.rim}>
          <boxGeometry args={[2.66, 0.24, 0.14]} />
        </mesh>
        <mesh position={[-1.25, 0.14, 0]} material={materials.rim}>
          <boxGeometry args={[0.14, 0.24, 1.66]} />
        </mesh>
        <mesh position={[1.25, 0.14, 0]} material={materials.rim}>
          <boxGeometry args={[0.14, 0.24, 1.66]} />
        </mesh>
        <mesh position={[0, 0.07, 0]} material={materials.litter} scale={[2.2, 0.44, 1.65]}>
          <sphereGeometry args={[0.42, 16, 12]} />
        </mesh>
        <group ref={kicksRef}>
          {litterKickOrigins.map((origin) => (
            <mesh
              key={`${String(origin[0])}:${String(origin[1])}:${String(origin[2])}`}
              position={origin}
              scale={[1, 0.55, 1]}
              material={materials.litter}
            >
              <sphereGeometry args={[0.042, 10, 8]} />
            </mesh>
          ))}
        </group>
        <group ref={coversRef}>
          {litterDrops.map((spec, index) => (
            <mesh
              key={`cover-${String(index)}`}
              position={spec.land}
              visible={false}
              material={materials.litter}
            >
              <sphereGeometry args={[1, 12, 10]} />
            </mesh>
          ))}
        </group>
        <group ref={dropsRef}>
          {litterDrops.map((spec, index) => (
            <mesh
              key={`drop-${String(index)}`}
              position={spec.start}
              frustumCulled={false}
              material={materials.drops[index]}
            >
              <sphereGeometry args={[1, 14, 12]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
