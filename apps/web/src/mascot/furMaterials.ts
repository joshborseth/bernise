import {
  Color,
  ColorManagement,
  DoubleSide,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from "three";
import type { Texture } from "three";
import type { Surface } from "./berniseModel.ts";

export type FurCoatProfile = {
  readonly shells: number;
  readonly maxHeight: number;
  readonly density: number;
  readonly smoothness: number;
  readonly maxAo: number;
  readonly combX: number;
  readonly combY: number;
};

/**
 * Short cat pile, not the demo chair. Heights are world units. Comb is a
 * small X rotation so the coat lays back instead of standing radial.
 */
export const furCoats = {
  down: {
    shells: 22,
    maxHeight: 0.036,
    density: 3.4,
    smoothness: 0.9,
    maxAo: 0.58,
    combX: -0.2,
    combY: 0,
  },
  plush: {
    shells: 20,
    maxHeight: 0.03,
    density: 3.8,
    smoothness: 0.78,
    maxAo: 0.52,
    combX: -0.28,
    combY: 0,
  },
  guard: {
    shells: 18,
    maxHeight: 0.024,
    density: 4.4,
    smoothness: 0.68,
    maxAo: 0.48,
    combX: -0.38,
    combY: 0,
  },
  velvet: {
    shells: 12,
    maxHeight: 0.01,
    density: 5.6,
    smoothness: 1.15,
    maxAo: 0.64,
    combX: -0.1,
    combY: 0,
  },
} as const satisfies Record<string, FurCoatProfile>;

export type FurCoatKind = keyof typeof furCoats;

const furSurfaceSet: ReadonlySet<Surface> = new Set([
  "snow",
  "snowShade",
  "silver",
  "tabby",
  "tabbyDark",
  "innerEar",
]);

export function isFurSurface(surface: Surface): boolean {
  return furSurfaceSet.has(surface);
}

export function coatFor(surface: Surface): FurCoatProfile {
  if (surface === "silver") {
    return furCoats.plush;
  }
  if (surface === "tabby" || surface === "tabbyDark") {
    return furCoats.guard;
  }
  if (surface === "innerEar") {
    return furCoats.velvet;
  }
  return furCoats.down;
}

export function combMatrix(coat: FurCoatProfile, target = new Matrix4()): Matrix4 {
  return target.makeRotationFromEuler(new Euler(coat.combX, coat.combY, 0, "XYZ"));
}

function linearColor(hex: string): Color {
  const color = new Color(hex);
  if (ColorManagement.enabled) {
    color.convertSRGBToLinear();
  }
  return color;
}

const shellVertex = /* glsl */ `
#include <fog_pars_vertex>

uniform float uMaxHeight;
uniform mat4 uCombMatrix;

varying vec2 vUv;
varying float vHairT;
varying vec3 vViewNormal;

void main() {
  vUv = uv;
  float layer = 1.0;
  #ifdef USE_INSTANCING
    layer = instanceMatrix[3][0];
  #endif
  vHairT = layer;
  vec3 combObject = normalize((uCombMatrix * vec4(normal, 0.0)).xyz);
  vec3 worldNormal = normalize(mat3(modelMatrix) * combObject);
  vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz + layer * uMaxHeight * worldNormal;
  vec4 mvPosition = viewMatrix * vec4(worldPosition, 1.0);
  vViewNormal = (viewMatrix * vec4(worldNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const finVertex = /* glsl */ `
#include <fog_pars_vertex>

attribute float hairHeight;

uniform float uMaxHeight;
uniform mat4 uCombMatrix;

varying vec2 vUv;
varying float vHairT;
varying vec3 vViewNormal;

void main() {
  vUv = uv;
  vHairT = hairHeight;
  vec3 combObject = normalize((uCombMatrix * vec4(normal, 0.0)).xyz);
  vec3 worldNormal = normalize(mat3(modelMatrix) * combObject);
  vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz
    + 0.8 * hairHeight * uMaxHeight * worldNormal;
  vec4 mvPosition = viewMatrix * vec4(worldPosition, 1.0);
  vViewNormal = (viewMatrix * vec4(worldNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const furFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform sampler2D uNoise;
uniform float uDensity;
uniform vec3 uColor;
uniform float uSmoothness;
uniform float uMaxAo;

varying vec2 vUv;
varying float vHairT;
varying vec3 vViewNormal;

void main() {
  vec4 noise = texture2D(uNoise, uDensity * vUv);
  float hairLen = max(0.01, noise.r);
  float t = vHairT / hairLen;
  if (t >= 1.0) discard;

  vec3 viewN = normalize(vViewNormal);
  float key = max(dot(viewN, normalize(vec3(0.22, 0.64, 0.74))), 0.0);
  float fill = max(dot(viewN, normalize(vec3(-0.55, 0.18, 0.42))), 0.0);
  float rim = max(dot(viewN, normalize(vec3(0.08, 0.82, -0.55))), 0.0);
  float light = 0.42 + 0.46 * key + 0.16 * fill + 0.12 * rim;

  float ao = uMaxAo + (1.0 - uMaxAo) * 0.9 * (t * t);
  vec3 color = uColor * noise.g * ao * light;
  float alpha = pow(max(0.0, 1.0 - t), uSmoothness);
  gl_FragColor = vec4(color, alpha);
  #include <fog_fragment>
}
`;

function furUniforms(color: string, noise: Texture, coat: FurCoatProfile) {
  return UniformsUtils.merge([
    UniformsLib.fog,
    {
      uMaxHeight: { value: coat.maxHeight },
      uCombMatrix: { value: combMatrix(coat) },
      uNoise: { value: noise },
      uDensity: { value: coat.density },
      uColor: { value: linearColor(color) },
      uSmoothness: { value: coat.smoothness },
      uMaxAo: { value: coat.maxAo },
    },
  ]);
}

export type FurLayerMaterials = {
  readonly support: MeshStandardMaterial;
  readonly shells: ShaderMaterial;
  readonly fins: ShaderMaterial;
};

export function createFurMaterials(
  color: string,
  noise: Texture,
  coat: FurCoatProfile,
): FurLayerMaterials {
  const uniforms = furUniforms(color, noise, coat);
  const support = new MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    emissive: color,
    emissiveIntensity: 0.06,
  });
  const shells = new ShaderMaterial({
    uniforms,
    vertexShader: shellVertex,
    fragmentShader: furFragment,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const fins = new ShaderMaterial({
    uniforms,
    vertexShader: finVertex,
    fragmentShader: furFragment,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  return { support, shells, fins };
}
