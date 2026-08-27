import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { InstancedMesh, Matrix4, SphereGeometry } from "three";
import type { BufferGeometry, Texture } from "three";
import { finGeometry } from "./fins.ts";
import { createFurMaterials, type FurCoatProfile } from "./furMaterials.ts";

const identityLayer = new Matrix4();

function skipRaycast(): void {}

export function FurCoat({
  geometry,
  color,
  coat,
  noise,
}: {
  readonly geometry: BufferGeometry;
  readonly color: string;
  readonly coat: FurCoatProfile;
  readonly noise: Texture;
}) {
  const shellsRef = useRef<InstancedMesh>(null);
  const fins = useMemo(() => finGeometry(geometry), [geometry]);
  const materials = useMemo(() => createFurMaterials(color, noise, coat), [color, noise, coat]);

  useLayoutEffect(() => {
    const mesh = shellsRef.current;
    if (mesh === null) {
      return;
    }
    for (let i = 0; i < coat.shells; i++) {
      const layer = (i + 1) / coat.shells;
      identityLayer.makeTranslation(layer, 0, 0);
      mesh.setMatrixAt(i, identityLayer);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [coat.shells]);

  useEffect(() => {
    return () => {
      materials.support.dispose();
      materials.shells.dispose();
      materials.fins.dispose();
    };
  }, [materials]);

  return (
    <group>
      <mesh geometry={geometry} material={materials.support} />
      <instancedMesh
        ref={shellsRef}
        args={[geometry, materials.shells, coat.shells]}
        frustumCulled={false}
        raycast={skipRaycast}
      />
      <mesh geometry={fins} material={materials.fins} frustumCulled={false} raycast={skipRaycast} />
    </group>
  );
}

const sphereCache = new Map<number, SphereGeometry>();

export function furSphereGeometry(radius: number): SphereGeometry {
  const cached = sphereCache.get(radius);
  if (cached !== undefined) {
    return cached;
  }
  const geometry = new SphereGeometry(radius, 32, 24);
  sphereCache.set(radius, geometry);
  return geometry;
}

export function FurredSphere({
  radius,
  color,
  coat,
  noise,
  position,
  rotation,
  scale,
}: {
  readonly radius: number;
  readonly color: string;
  readonly coat: FurCoatProfile;
  readonly noise: Texture;
  readonly position?: readonly [number, number, number] | undefined;
  readonly rotation?: readonly [number, number, number] | undefined;
  readonly scale?: readonly [number, number, number] | number | undefined;
}) {
  const geometry = furSphereGeometry(radius);
  return (
    <group position={position ?? [0, 0, 0]} rotation={rotation ?? [0, 0, 0]} scale={scale ?? 1}>
      <FurCoat geometry={geometry} color={color} coat={coat} noise={noise} />
    </group>
  );
}
