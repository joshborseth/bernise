import { BufferAttribute, BufferGeometry, MeshBasicMaterial } from "three";
import { MarchingCubes } from "three-stdlib";

/**
 * Cylindrical pelt UVs. The 0/1 seam sits on the back (-Z) so the face
 * stays clean for fur maps.
 */
export function cylindricalUv(
  x: number,
  y: number,
  z: number,
  centerX: number,
  centerZ: number,
  minY: number,
  height: number,
): readonly [number, number] {
  const u = 0.5 + Math.atan2(x - centerX, z - centerZ) / (Math.PI * 2);
  const v = height === 0 ? 0.5 : (y - minY) / height;
  return [u, v];
}

/**
 * A single blob in a metaball field. Overlapping blobs fuse into one smooth
 * surface, which is what separates "fur" from "a pile of spheres".
 */
export type Metaball = {
  readonly position: readonly [number, number, number];
  readonly radius: number;
  /** Falloff sharpness. Lower values blend further into neighbours. */
  readonly blend?: number;
};

export type BakeOptions = {
  /** Voxels per axis. Higher is smoother and slower to bake. */
  readonly resolution?: number;
  /** Half-extent of the cubic field, in model units. */
  readonly half?: number;
  readonly center?: readonly [number, number, number];
  /** Pushes the finished surface out along its normals, for skin-like layers. */
  readonly inflate?: number;
};

/** MarchingCubes hardcodes this threshold in `init`. */
const isolation = 80;
const defaultBlend = 70;

/**
 * Evaluates a metaball field once and copies the result into a static
 * geometry, so the surface costs nothing per frame.
 */
export function bakeMetaballs(
  balls: ReadonlyArray<Metaball>,
  options: BakeOptions = {},
): BufferGeometry {
  const resolution = options.resolution ?? 56;
  const half = options.half ?? 1;
  const [centerX, centerY, centerZ] = options.center ?? [0, 0, 0];

  const material = new MeshBasicMaterial();
  const field = new MarchingCubes(resolution, material, false, false, 80000);
  field.reset();

  for (const ball of balls) {
    const blend = ball.blend ?? defaultBlend;
    // An isolated ball's surface sits where strength / r^2 - blend = isolation.
    const normalized = ball.radius / (2 * half);
    const strength = (isolation + blend) * normalized * normalized;
    field.addBall(
      0.5 + (ball.position[0] - centerX) / (2 * half),
      0.5 + (ball.position[1] - centerY) / (2 * half),
      0.5 + (ball.position[2] - centerZ) / (2 * half),
      strength,
      blend,
    );
  }

  field.update();

  const vertexCount = field.count;
  const positions = field.positionArray.slice(0, vertexCount * 3);
  const normals = field.normalArray.slice(0, vertexCount * 3);

  const inflate = options.inflate ?? 0;
  if (inflate !== 0) {
    const offset = inflate / half;
    for (let i = 0; i < positions.length; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      positions[i] += (normals[i] / length) * offset;
      positions[i + 1] += (normals[i + 1] / length) * offset;
      positions[i + 2] += (normals[i + 2] / length) * offset;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.scale(half, half, half);
  geometry.translate(centerX, centerY, centerZ);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  assignCylindricalUvs(geometry);

  material.dispose();
  field.geometry.dispose();

  return geometry;
}

function assignCylindricalUvs(geometry: BufferGeometry): void {
  const positions = geometry.getAttribute("position");
  const box = geometry.boundingBox;
  if (positions === undefined || box === null) {
    return;
  }
  const height = box.max.y - box.min.y;
  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;
  const uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const [u, v] = cylindricalUv(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i),
      centerX,
      centerZ,
      box.min.y,
      height,
    );
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
}
