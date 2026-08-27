import { BufferAttribute, BufferGeometry } from "three";
import type { BufferGeometry as Geometry } from "three";

const quantize = 1e5;

function vertexKey(x: number, y: number, z: number): string {
  return `${Math.round(x * quantize)}:${Math.round(y * quantize)}:${Math.round(z * quantize)}`;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Shells-and-fins silhouette cards: one quad per unique mesh edge, with a
 * `hairHeight` attribute (0 at the root, 1 at the tip) so the vertex shader
 * can extrude along the comb-rotated normal. WebGL has no geometry shaders,
 * so the cards are built on the CPU the same way piellardj/fur-threejs does.
 */
export function buildFinGeometry(source: Geometry): BufferGeometry {
  const positions = source.getAttribute("position");
  const normals = source.getAttribute("normal");
  const uvs = source.getAttribute("uv");
  if (positions === undefined) {
    throw new Error("fin geometry needs positions");
  }
  if (normals === undefined) {
    throw new Error("fin geometry needs normals");
  }
  if (uvs === undefined) {
    throw new Error("fin geometry needs uvs");
  }

  const index = source.getIndex();
  const vertexCount = positions.count;
  const triCount = index === null ? Math.floor(vertexCount / 3) : Math.floor(index.count / 3);
  const edges = new Map<string, readonly [number, number]>();

  const corner = (triangle: number, which: number): number => {
    const slot = triangle * 3 + which;
    return index === null ? slot : index.getX(slot);
  };

  for (let triangle = 0; triangle < triCount; triangle++) {
    const i0 = corner(triangle, 0);
    const i1 = corner(triangle, 1);
    const i2 = corner(triangle, 2);
    consider(i0, i1);
    consider(i1, i2);
    consider(i2, i0);
  }

  function consider(a: number, b: number): void {
    const ka = vertexKey(positions.getX(a), positions.getY(a), positions.getZ(a));
    const kb = vertexKey(positions.getX(b), positions.getY(b), positions.getZ(b));
    const dx = positions.getX(a) - positions.getX(b);
    const dy = positions.getY(a) - positions.getY(b);
    const dz = positions.getZ(a) - positions.getZ(b);
    if (dx * dx + dy * dy + dz * dz < 1e-8) {
      return;
    }
    const key = edgeKey(ka, kb);
    if (!edges.has(key)) {
      edges.set(key, [a, b]);
    }
  }

  const edgeCount = edges.size;
  const finPositions = new Float32Array(edgeCount * 4 * 3);
  const finNormals = new Float32Array(edgeCount * 4 * 3);
  const finUvs = new Float32Array(edgeCount * 4 * 2);
  const hairHeight = new Float32Array(edgeCount * 4);
  const finIndex = new Uint32Array(edgeCount * 6);

  let edge = 0;
  for (const [a, b] of edges.values()) {
    const base = edge * 4;
    writeVertex(base, a, 0);
    writeVertex(base + 1, b, 0);
    writeVertex(base + 2, a, 1);
    writeVertex(base + 3, b, 1);
    const indexBase = edge * 6;
    finIndex[indexBase] = base;
    finIndex[indexBase + 1] = base + 1;
    finIndex[indexBase + 2] = base + 2;
    finIndex[indexBase + 3] = base + 1;
    finIndex[indexBase + 4] = base + 3;
    finIndex[indexBase + 5] = base + 2;
    edge += 1;
  }

  function writeVertex(slot: number, sourceIndex: number, height: number): void {
    finPositions[slot * 3] = positions.getX(sourceIndex);
    finPositions[slot * 3 + 1] = positions.getY(sourceIndex);
    finPositions[slot * 3 + 2] = positions.getZ(sourceIndex);
    finNormals[slot * 3] = normals.getX(sourceIndex);
    finNormals[slot * 3 + 1] = normals.getY(sourceIndex);
    finNormals[slot * 3 + 2] = normals.getZ(sourceIndex);
    finUvs[slot * 2] = uvs.getX(sourceIndex);
    finUvs[slot * 2 + 1] = uvs.getY(sourceIndex);
    hairHeight[slot] = height;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(finPositions, 3));
  geometry.setAttribute("normal", new BufferAttribute(finNormals, 3));
  geometry.setAttribute("uv", new BufferAttribute(finUvs, 2));
  geometry.setAttribute("hairHeight", new BufferAttribute(hairHeight, 1));
  geometry.setIndex(new BufferAttribute(finIndex, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const finCache = new WeakMap<Geometry, BufferGeometry>();

export function finGeometry(source: Geometry): BufferGeometry {
  const cached = finCache.get(source);
  if (cached !== undefined) {
    return cached;
  }
  const fins = buildFinGeometry(source);
  finCache.set(source, fins);
  return fins;
}
