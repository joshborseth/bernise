import type { Material } from "three";
import { massGeometry, whiskerGeometry } from "../geometry/bakedGeometry.ts";
import type { Node, Surface } from "../model/types.ts";
import type { PartRefs } from "./partRefs.ts";

const origin = [0, 0, 0] as const;

export function Part({
  node,
  materials,
  refs,
}: {
  readonly node: Node;
  readonly materials: Record<Surface, Material>;
  readonly refs: PartRefs;
}) {
  if (node.kind === "group") {
    const petRegion = node.id === "head" || node.id === "body" ? node.id : undefined;
    return (
      <group
        ref={node.id === undefined ? null : refs[node.id]}
        position={node.position ?? origin}
        rotation={node.rotation ?? origin}
        scale={node.scale ?? 1}
        {...(petRegion === undefined ? {} : { userData: { petRegion } })}
      >
        {node.children.map((child, index) => (
          <Part key={index} node={child} materials={materials} refs={refs} />
        ))}
      </group>
    );
  }

  if (node.kind === "mass") {
    return <mesh geometry={massGeometry(node.mass)} material={materials[node.surface]} />;
  }

  if (node.kind === "whisker") {
    return (
      <mesh
        geometry={whiskerGeometry(node.length, node.droop, node.lift)}
        material={materials.whisker}
        position={node.position}
        rotation={node.rotation}
      />
    );
  }

  if (node.kind === "cone") {
    return (
      <mesh
        material={materials[node.surface]}
        position={node.position ?? origin}
        rotation={node.rotation ?? origin}
        scale={node.scale ?? 1}
      >
        <coneGeometry args={[node.radius, node.height, 28]} />
      </mesh>
    );
  }

  return (
    <mesh
      material={materials[node.surface]}
      position={node.position ?? origin}
      rotation={node.rotation ?? origin}
      scale={node.scale ?? 1}
    >
      <sphereGeometry args={[node.radius, 32, 24]} />
    </mesh>
  );
}

