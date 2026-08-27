import { ContactShadows } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import {
  Euler,
  MathUtils,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector2,
  Vector3,
} from "three";
import type { Group, Material, Texture } from "three";
import { massGeometry, whiskerGeometry } from "./berniseGeometry.ts";
import { bernise, palette, type Node, type PartId, type Surface } from "./berniseModel.ts";
import { createFurTextures, type FurKind, type FurTextures } from "./furMaps.ts";
import type { BerniseMood } from "./mood.ts";
import { playChomp, purrBurst } from "./purr.ts";

export type PointerGoal = { x: number; y: number };

const squintOpenness = 0.06;
const squintWidth = 1.18;
const purrOpenness = 0.2;
const purrIrisScale = 0.35;
const biteOpenness = 1.18;
const biteWidth = 1.08;
const strikeAfter = 4;
const strikeOpen = 0.12;
const strikeChomp = 0.18;
const strikeDone = 0.3;
const fangSinkY = 0.018;
const fangSinkZ = 0.04;

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function easeOutBack(value: number): number {
  const overshoot = 1.70158;
  const curved = overshoot + 1;
  return 1 + curved * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
}

function strikeMotion(elapsed: number): {
  lunge: number;
  mouth: number;
  fangs: number;
  shake: number;
} {
  if (elapsed < 0) {
    return { lunge: 0, mouth: 0, fangs: 0, shake: 0 };
  }
  if (elapsed < strikeOpen) {
    const open = elapsed / strikeOpen;
    const mouth = easeOutCubic(open);
    return { lunge: easeOutBack(open), mouth, fangs: mouth, shake: 0 };
  }
  if (elapsed < strikeChomp) {
    const close = (elapsed - strikeOpen) / (strikeChomp - strikeOpen);
    const mouth = 1 - close;
    return { lunge: 1, mouth, fangs: 1, shake: 0 };
  }
  const snap = elapsed < strikeChomp + 0.12 ? 1 - (elapsed - strikeChomp) / 0.12 : 0;
  return {
    lunge: 1,
    mouth: 0.12,
    fangs: 1,
    shake: Math.sin((elapsed - strikeChomp) * 80) * snap + Math.sin(elapsed * 14) * 0.04,
  };
}

function strikingDamp(strikeElapsed: number): number {
  return strikeElapsed >= 0 ? 18 : 5;
}

export function BerniseCat({
  mood,
  speakKey,
  pointer,
  purring,
  biting,
  reducedMotion,
  onPurringChange,
  onBitingChange,
}: {
  readonly mood: Exclude<BerniseMood, "speaking">;
  readonly speakKey: string;
  readonly pointer: { readonly current: PointerGoal };
  readonly purring: boolean;
  readonly biting: boolean;
  readonly reducedMotion: boolean;
  readonly onPurringChange: (purring: boolean) => void;
  readonly onBitingChange: (biting: boolean) => void;
}) {
  return (
    <>
      <FitCamera />
      <fog attach="fog" args={["#f6efe4", 5.2, 8.6]} />
      <hemisphereLight args={["#fffaf3", "#e6d7c8", 0.85]} />
      <ambientLight intensity={0.5} color="#fff6ea" />
      <directionalLight position={[2.4, 3.4, 4.2]} intensity={1.22} color="#fff7ee" />
      <directionalLight position={[-2.6, 1.2, 3.0]} intensity={0.45} color="#dcecf7" />
      <directionalLight position={[0, 0.6, 5.4]} intensity={0.6} color="#ffffff" />
      <directionalLight position={[0.4, 3.2, -3.4]} intensity={0.85} color="#ffe6cf" />
      <BerniseFigure
        mood={mood}
        speakKey={speakKey}
        pointer={pointer}
        purring={purring}
        biting={biting}
        reducedMotion={reducedMotion}
        onPurringChange={onPurringChange}
        onBitingChange={onBitingChange}
      />
      <ContactShadows
        position={[0, -1.2, 0]}
        opacity={0.16}
        scale={6.4}
        blur={3.2}
        far={2.2}
        resolution={256}
        frames={reducedMotion ? 1 : Number.POSITIVE_INFINITY}
        color="#6a5346"
      />
    </>
  );
}

function FitCamera() {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.position.set(0, 0.02, 5.6);
    camera.lookAt(0, -0.05, 0);
  }, [camera]);
  return null;
}

type PartRefs = Record<PartId, RefObject<Group | null>>;

const origin = [0, 0, 0] as const;

function BerniseFigure({
  mood,
  speakKey,
  pointer,
  purring,
  biting,
  reducedMotion,
  onPurringChange,
  onBitingChange,
}: {
  readonly mood: Exclude<BerniseMood, "speaking">;
  readonly speakKey: string;
  readonly pointer: { readonly current: PointerGoal };
  readonly purring: boolean;
  readonly biting: boolean;
  readonly reducedMotion: boolean;
  readonly onPurringChange: (purring: boolean) => void;
  readonly onBitingChange: (biting: boolean) => void;
}) {
  const gl = useThree((state) => state.gl);
  const materials = useCatMaterials();
  const refs = usePartRefs();
  const rest = useRef<{ tail: Euler; leftPaw: Vector3; fangs: Vector3 } | null>(null);
  const blink = useRef({ nextAt: 2.4, closeUntil: 0 });
  const twitch = useRef({ nextAt: 2.6, amount: 0 });
  const speech = useRef({ key: "", until: 0 });
  const rumble = useRef({ amp: 0, y: 0 });
  const overpet = useRef({ heldSince: -1, strikeAt: -1, signaled: false, chomped: false });

  const onPetDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (biting) {
      return;
    }
    gl.domElement.setPointerCapture(event.pointerId);
    onPurringChange(true);
  };

  const onPetUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (gl.domElement.hasPointerCapture(event.pointerId)) {
      gl.domElement.releasePointerCapture(event.pointerId);
    }
    onPurringChange(false);
    onBitingChange(false);
  };

  useFrame(({ clock }, delta) => {
    const root = refs.root.current;
    const body = refs.body.current;
    const head = refs.head.current;
    const tail = refs.tail.current;
    const leftPaw = refs.leftPaw.current;
    const mouth = refs.mouth.current;
    const fangs = refs.fangs.current;
    if (
      root === null ||
      body === null ||
      head === null ||
      tail === null ||
      leftPaw === null ||
      mouth === null ||
      fangs === null
    ) {
      return;
    }
    if (rest.current === null) {
      rest.current = {
        tail: tail.rotation.clone(),
        leftPaw: leftPaw.position.clone(),
        fangs: fangs.position.clone(),
      };
    }
    const restPose = rest.current;

    const dt = Math.min(delta, 0.05);
    const t = clock.elapsedTime;
    head.rotation.order = "YXZ";
    if (speakKey !== speech.current.key) {
      speech.current.key = speakKey;
      speech.current.until = t + 2.4;
    }

    if (!purring && !biting) {
      const strikingNow =
        overpet.current.strikeAt >= 0 && t - overpet.current.strikeAt < strikeDone;
      if (!strikingNow) {
        overpet.current.heldSince = -1;
        overpet.current.strikeAt = -1;
        overpet.current.signaled = false;
        overpet.current.chomped = false;
      }
    } else if (purring && overpet.current.heldSince < 0) {
      overpet.current.heldSince = t;
    }
    if (
      purring &&
      overpet.current.heldSince >= 0 &&
      t - overpet.current.heldSince >= strikeAfter &&
      !overpet.current.signaled
    ) {
      overpet.current.signaled = true;
      overpet.current.strikeAt = t;
      onPurringChange(false);
      onBitingChange(true);
    }
    if (
      overpet.current.strikeAt >= 0 &&
      t - overpet.current.strikeAt >= strikeChomp &&
      !overpet.current.chomped
    ) {
      overpet.current.chomped = true;
      if (!reducedMotion) {
        playChomp();
      }
    }

    const strikeElapsed = overpet.current.strikeAt < 0 ? -1 : t - overpet.current.strikeAt;
    const strike = strikeMotion(strikeElapsed);
    const striking = strikeElapsed >= 0;
    const happyPurr = purring && !striking;
    const listening = mood === "listening";
    const thinking = mood === "thinking";
    const speaking = mood === "idle" && t < speech.current.until && !striking;
    const restOpenness = 0.9;

    const poseEyes = (openness: number, width: number, innerScale: number, instant: boolean) => {
      for (const id of ["leftEye", "rightEye"] as const) {
        const eye = refs[id].current;
        if (eye !== null) {
          if (instant) {
            eye.scale.y = openness;
            eye.scale.x = width;
          } else {
            eye.scale.y = MathUtils.damp(eye.scale.y, openness, happyPurr ? 14 : 22, dt);
            eye.scale.x = MathUtils.damp(eye.scale.x, width, 14, dt);
          }
        }
      }
      for (const id of ["leftWhite", "rightWhite", "leftIris", "rightIris"] as const) {
        const inner = refs[id].current;
        if (inner !== null) {
          if (instant) {
            inner.scale.setScalar(innerScale);
          } else {
            inner.scale.x = MathUtils.damp(inner.scale.x, innerScale, 12, dt);
            inner.scale.y = MathUtils.damp(inner.scale.y, innerScale, 12, dt);
            inner.scale.z = MathUtils.damp(inner.scale.z, innerScale, 12, dt);
          }
        }
      }
    };

    if (reducedMotion) {
      root.position.set(0, 0, 0);
      root.rotation.set(0.02, 0, 0);
      body.scale.set(1, 1, 1);
      head.position.set(0, 0, 0);
      head.rotation.set(
        striking ? 0.08 : happyPurr ? 0.04 : -0.02,
        0,
        striking ? -0.04 : happyPurr ? 0.05 : 0,
      );
      mouth.scale.set(1, striking ? 1.53 : 1, 1);
      fangs.scale.setScalar(striking ? 1 : 0);
      fangs.position.set(
        restPose.fangs.x,
        restPose.fangs.y - (striking ? fangSinkY : 0),
        restPose.fangs.z + (striking ? fangSinkZ : 0),
      );
      refs.leftEar.current?.rotation.set(striking ? -0.42 : 0, 0, striking ? 0.2 : 0);
      refs.rightEar.current?.rotation.set(striking ? -0.42 : 0, 0, striking ? -0.2 : 0);
      poseEyes(
        striking ? biteOpenness : happyPurr ? squintOpenness : restOpenness,
        striking ? biteWidth : happyPurr ? squintWidth : 1,
        happyPurr ? 0 : 1,
        true,
      );
      return;
    }

    const breathSpeed =
      thinking && !happyPurr && !striking
        ? 1.35
        : striking
          ? 2.4
          : happyPurr
            ? 1.5
            : listening
              ? 2.15
              : speaking
                ? 2.6
                : 1.7;
    const breath = (Math.sin(t * breathSpeed) + 1) / 2;
    const burst = purrBurst();
    rumble.current.amp = MathUtils.damp(
      rumble.current.amp,
      happyPurr ? 0.007 * burst.amp : 0,
      12,
      dt,
    );
    const shake = Math.sin(t * Math.PI * 2 * burst.hz) * rumble.current.amp;
    rumble.current.y = MathUtils.damp(
      rumble.current.y,
      Math.sin(t * 1.05) * 0.02 + (speaking && !happyPurr ? Math.abs(Math.sin(t * 9)) * 0.026 : 0),
      6,
      dt,
    );

    const lookX = MathUtils.clamp(pointer.current.x, -1, 1);
    const lookY = MathUtils.clamp(pointer.current.y, -1, 1);
    const lookScale = happyPurr ? 0.45 : 1;

    root.position.y = rumble.current.y + shake + strike.lunge * 0.04 + strike.shake * 0.012;
    root.position.x = shake * 0.35 + lookX * strike.lunge * 0.1 + strike.shake * 0.02;
    root.position.z = MathUtils.damp(
      root.position.z,
      (striking ? -0.05 : happyPurr ? 0.04 : listening ? 0.12 : 0) + strike.lunge * 0.26,
      strikingDamp(strikeElapsed),
      dt,
    );
    root.rotation.x = MathUtils.damp(
      root.rotation.x,
      (striking ? 0.08 : happyPurr ? 0.03 : listening ? 0.07 : 0.015) + strike.lunge * 0.18,
      striking ? 18 : 5,
      dt,
    );

    body.scale.y = 1 + breath * (thinking && !happyPurr && !striking ? 0.018 : 0.028);
    body.scale.x = 1 - breath * 0.012;
    body.scale.z = 1 - breath * 0.008;

    head.position.x = MathUtils.damp(head.position.x, lookX * strike.lunge * 0.08, 18, dt);
    head.position.y = MathUtils.damp(head.position.y, -lookY * strike.lunge * 0.05, 18, dt);
    head.position.z = MathUtils.damp(head.position.z, strike.lunge * 0.2, 18, dt);
    head.rotation.y = MathUtils.damp(
      head.rotation.y,
      lookX * 0.34 * lookScale +
        (happyPurr ? 0 : striking ? lookX * 0.08 : thinking ? 0.16 : listening ? -0.03 : 0) +
        strike.shake * 0.12,
      striking ? 18 : 5.2,
      dt,
    );
    head.rotation.x = MathUtils.damp(
      head.rotation.x,
      -lookY * 0.2 * lookScale +
        (striking ? 0.1 : happyPurr ? 0.05 : listening ? 0.04 : thinking ? -0.05 : -0.01) +
        strike.lunge * 0.22,
      striking ? 18 : 5.2,
      dt,
    );
    head.rotation.z = MathUtils.damp(
      head.rotation.z,
      (striking ? -0.05 : happyPurr ? 0.06 : thinking ? -0.08 : listening ? 0.035 : 0) +
        strike.shake * 0.16,
      striking ? 18 : 5.2,
      dt,
    );

    const irisX = lookX * 0.018 * lookScale;
    const irisY = lookY * 0.012 * lookScale;
    for (const id of ["leftIris", "rightIris"] as const) {
      const iris = refs[id].current;
      if (iris !== null) {
        iris.position.x = MathUtils.damp(iris.position.x, irisX, 8, dt);
        iris.position.y = MathUtils.damp(iris.position.y, irisY, 8, dt);
      }
    }

    const dilate = striking ? 1.22 : happyPurr ? 0.88 : listening ? 1.1 : thinking ? 0.95 : 1;
    for (const id of ["leftPupil", "rightPupil"] as const) {
      const pupil = refs[id].current;
      if (pupil !== null) {
        if (striking) {
          pupil.scale.x = dilate;
          pupil.scale.y = dilate;
        } else {
          pupil.scale.x = MathUtils.damp(pupil.scale.x, dilate, 8, dt);
          pupil.scale.y = MathUtils.damp(pupil.scale.y, dilate, 8, dt);
        }
      }
    }

    if (!happyPurr && !striking && t > blink.current.nextAt) {
      blink.current.closeUntil = t + 0.14;
      blink.current.nextAt = t + 3.6 + Math.random() * 4.4;
    }
    let openness = restOpenness;
    let width = 1;
    let innerScale = 1;
    if (striking) {
      openness = biteOpenness;
      width = biteWidth;
    } else if (happyPurr) {
      openness = squintOpenness + burst.amp * (purrOpenness - squintOpenness);
      width = squintWidth;
      innerScale = burst.amp * purrIrisScale;
    } else if (t < blink.current.closeUntil) {
      const progress = 1 - (blink.current.closeUntil - t) / 0.14;
      const closed = progress < 0.45 ? progress / 0.45 : 1 - (progress - 0.45) / 0.55;
      openness = restOpenness - closed * (restOpenness - 0.08);
    }
    poseEyes(openness, width, innerScale, striking);

    if (t > twitch.current.nextAt) {
      twitch.current.amount = 1;
      twitch.current.nextAt = t + 2.6 + Math.random() * 4.6;
    }
    twitch.current.amount = MathUtils.damp(twitch.current.amount, 0, 7, dt);
    const perk = striking ? -0.42 : happyPurr ? 0.1 : listening ? -0.14 : thinking ? 0.05 : 0;
    const flatten = striking ? 0.2 : 0;
    const flick = happyPurr ? 0 : Math.sin(t * (striking ? 18 : 32)) * twitch.current.amount * 0.12;
    refs.leftEar.current?.rotation.set(perk, 0, flatten + flick);
    refs.rightEar.current?.rotation.set(perk, 0, -flatten - flick * 0.6);

    mouth.scale.y = MathUtils.damp(
      mouth.scale.y,
      strike.mouth > 0
        ? 1 + strike.mouth * 4.4
        : happyPurr
          ? 0.72
          : speaking
            ? 1.6 + Math.abs(Math.sin(t * 11.5)) * 2.4
            : 1,
      strike.mouth > 0 ? 28 : 12,
      dt,
    );
    mouth.scale.x = MathUtils.damp(
      mouth.scale.x,
      strike.mouth > 0 ? 1 + strike.mouth * 0.7 : happyPurr ? 1.15 : speaking ? 1.25 : 1,
      12,
      dt,
    );
    fangs.scale.setScalar(strike.fangs);
    fangs.position.y = restPose.fangs.y - fangSinkY * strike.fangs;
    fangs.position.z = restPose.fangs.z + fangSinkZ * strike.fangs;

    const tailSpeed = striking ? 6.4 : happyPurr ? 0.9 : 1.7;
    const tailSwing = striking ? 1.45 : happyPurr ? 0.45 : 1;
    tail.rotation.x =
      restPose.tail.x +
      Math.sin(t * tailSpeed) * 0.08 * tailSwing +
      (listening && !happyPurr && !striking ? -0.1 : 0);
    tail.rotation.y =
      restPose.tail.y + Math.sin(t * (striking ? 5.2 : happyPurr ? 0.7 : 1.15)) * 0.12 * tailSwing;
    tail.rotation.z =
      restPose.tail.z + Math.sin(t * (striking ? 7.1 : happyPurr ? 1.05 : 2.1)) * 0.14 * tailSwing;

    leftPaw.position.y = MathUtils.damp(
      leftPaw.position.y,
      restPose.leftPaw.y +
        (striking ? 0.08 : !happyPurr && thinking ? 0.1 + Math.abs(Math.sin(t * 3.4)) * 0.08 : 0),
      6,
      dt,
    );
    leftPaw.rotation.x = MathUtils.damp(
      leftPaw.rotation.x,
      striking ? -0.22 : !happyPurr && thinking ? -0.3 : 0,
      6,
      dt,
    );
  });

  return (
    <group onPointerDown={onPetDown} onPointerUp={onPetUp} onPointerCancel={onPetUp}>
      <Part node={bernise} materials={materials} refs={refs} />
    </group>
  );
}

function Part({
  node,
  materials,
  refs,
}: {
  readonly node: Node;
  readonly materials: Record<Surface, Material>;
  readonly refs: PartRefs;
}) {
  if (node.kind === "group") {
    return (
      <group
        ref={node.id === undefined ? null : refs[node.id]}
        position={node.position ?? origin}
        rotation={node.rotation ?? origin}
        scale={node.scale ?? 1}
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
      <sphereGeometry args={[node.radius, 64, 48]} />
    </mesh>
  );
}

function usePartRefs(): PartRefs {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftEar = useRef<Group>(null);
  const rightEar = useRef<Group>(null);
  const leftEye = useRef<Group>(null);
  const rightEye = useRef<Group>(null);
  const leftWhite = useRef<Group>(null);
  const rightWhite = useRef<Group>(null);
  const leftIris = useRef<Group>(null);
  const rightIris = useRef<Group>(null);
  const leftPupil = useRef<Group>(null);
  const rightPupil = useRef<Group>(null);
  const mouth = useRef<Group>(null);
  const fangs = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const leftPaw = useRef<Group>(null);
  return useMemo(
    () => ({
      root,
      body,
      head,
      leftEar,
      rightEar,
      leftEye,
      rightEye,
      leftWhite,
      rightWhite,
      leftIris,
      rightIris,
      leftPupil,
      rightPupil,
      mouth,
      fangs,
      tail,
      leftPaw,
    }),
    [],
  );
}

function useCatMaterials(): Record<Surface, Material> {
  const gl = useThree((state) => state.gl);
  const { materials, textures } = useMemo(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy();
    const coats: Record<FurKind, FurTextures> = {
      down: createFurTextures("down", anisotropy),
      plush: createFurTextures("plush", anisotropy),
      guard: createFurTextures("guard", anisotropy),
      velvet: createFurTextures("velvet", anisotropy),
    };
    const textures: Texture[] = [];
    for (const coat of Object.values(coats)) {
      textures.push(coat.normalMap, coat.displacementMap, coat.roughnessMap);
    }

    const fur = (
      surface: Surface,
      coat: FurTextures,
      options: {
        readonly displacementScale: number;
        readonly normalScale: number;
        readonly sheen: number;
        readonly sheenRoughness: number;
        readonly emissiveIntensity?: number;
      },
    ) => {
      const material = new MeshPhysicalMaterial({
        color: palette[surface],
        roughness: 1,
        metalness: 0,
        roughnessMap: coat.roughnessMap,
        normalMap: coat.normalMap,
        displacementMap: coat.displacementMap,
        displacementScale: options.displacementScale,
        displacementBias: 0,
        sheen: options.sheen,
        sheenColor: "#fff6ea",
        sheenRoughness: options.sheenRoughness,
        emissive: palette[surface],
        emissiveIntensity: options.emissiveIntensity ?? 0.02,
      });
      material.normalScale = new Vector2(options.normalScale, options.normalScale);
      return material;
    };

    const skin = (surface: Surface, roughness = 0.92, emissiveIntensity = 0.06) =>
      new MeshStandardMaterial({
        color: palette[surface],
        roughness,
        metalness: 0,
        emissive: palette[surface],
        emissiveIntensity,
      });
    const glass = (surface: Surface, roughness: number, clearcoat: number) =>
      new MeshPhysicalMaterial({
        color: palette[surface],
        roughness,
        metalness: 0,
        clearcoat,
        clearcoatRoughness: 0.2,
      });

    return {
      textures,
      materials: {
        snow: fur("snow", coats.down, {
          displacementScale: 0.0012,
          normalScale: 0.72,
          sheen: 0.62,
          sheenRoughness: 0.82,
        }),
        snowShade: fur("snowShade", coats.down, {
          displacementScale: 0.001,
          normalScale: 0.64,
          sheen: 0.55,
          sheenRoughness: 0.8,
        }),
        silver: fur("silver", coats.plush, {
          displacementScale: 0.0011,
          normalScale: 0.78,
          sheen: 0.52,
          sheenRoughness: 0.74,
        }),
        tabby: fur("tabby", coats.guard, {
          displacementScale: 0.0009,
          normalScale: 0.85,
          sheen: 0.4,
          sheenRoughness: 0.62,
        }),
        tabbyDark: fur("tabbyDark", coats.guard, {
          displacementScale: 0.0008,
          normalScale: 0.8,
          sheen: 0.36,
          sheenRoughness: 0.58,
        }),
        innerEar: fur("innerEar", coats.velvet, {
          displacementScale: 0.0004,
          normalScale: 0.48,
          sheen: 0.7,
          sheenRoughness: 0.9,
          emissiveIntensity: 0.012,
        }),
        nose: glass("nose", 0.35, 0.5),
        liner: skin("liner", 0.6),
        mouth: skin("mouth", 0.6),
        eyeWhite: skin("eyeWhite", 0.35),
        irisRim: glass("irisRim", 0.22, 0.6),
        iris: new MeshPhysicalMaterial({
          color: palette.iris,
          roughness: 0.18,
          metalness: 0,
          clearcoat: 0.7,
          clearcoatRoughness: 0.18,
          emissive: "#2f8ecb",
          emissiveIntensity: 0.16,
        }),
        irisGlow: new MeshStandardMaterial({
          color: palette.irisGlow,
          roughness: 0.3,
          emissive: palette.irisGlow,
          emissiveIntensity: 0.3,
        }),
        pupil: glass("pupil", 0.15, 0.8),
        shine: new MeshStandardMaterial({
          color: palette.shine,
          roughness: 0.05,
          emissive: palette.shine,
          emissiveIntensity: 0.8,
        }),
        fang: new MeshStandardMaterial({
          color: palette.fang,
          roughness: 0.32,
          metalness: 0,
          emissive: "#fff6ea",
          emissiveIntensity: 0.08,
        }),
        whisker: new MeshStandardMaterial({
          color: palette.whisker,
          roughness: 0.45,
          emissive: "#fffaf2",
          emissiveIntensity: 0.12,
        }),
      } satisfies Record<Surface, Material>,
    };
  }, [gl]);

  useEffect(() => {
    return () => {
      for (const material of Object.values(materials)) {
        material.dispose();
      }
      for (const texture of textures) {
        texture.dispose();
      }
    };
  }, [materials, textures]);

  return materials;
}
