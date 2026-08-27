import { ContactShadows } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Euler, MathUtils, MeshPhysicalMaterial, MeshStandardMaterial, Vector3 } from "three";
import type { Group, Material } from "three";
import { massGeometry, whiskerGeometry } from "./berniseGeometry.ts";
import { bernise, palette, type Node, type PartId, type Surface } from "./berniseModel.ts";
import type { BerniseMood } from "./mood.ts";
import { purrBurst } from "./purr.ts";

export type PointerGoal = { x: number; y: number };

const squintOpenness = 0.06;
const squintWidth = 1.18;

export function BerniseCat({
  mood,
  speakKey,
  pointer,
  purring,
  reducedMotion,
  onPurringChange,
}: {
  readonly mood: Exclude<BerniseMood, "speaking">;
  readonly speakKey: string;
  readonly pointer: { readonly current: PointerGoal };
  readonly purring: boolean;
  readonly reducedMotion: boolean;
  readonly onPurringChange: (purring: boolean) => void;
}) {
  return (
    <>
      <FitCamera />
      <hemisphereLight args={["#fffaf3", "#e6d7c8", 0.85]} />
      <ambientLight intensity={0.5} color="#fff6ea" />
      <directionalLight position={[2.4, 3.4, 4.2]} intensity={1.15} color="#fff7ee" />
      <directionalLight position={[-2.6, 1.2, 3.0]} intensity={0.45} color="#dcecf7" />
      <directionalLight position={[0, 0.6, 5.4]} intensity={0.6} color="#ffffff" />
      <directionalLight position={[0.4, 3.2, -3.4]} intensity={0.85} color="#ffe6cf" />
      <BerniseFigure
        mood={mood}
        speakKey={speakKey}
        pointer={pointer}
        purring={purring}
        reducedMotion={reducedMotion}
        onPurringChange={onPurringChange}
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
    camera.position.set(0, 0.02, 6.6);
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
  reducedMotion,
  onPurringChange,
}: {
  readonly mood: Exclude<BerniseMood, "speaking">;
  readonly speakKey: string;
  readonly pointer: { readonly current: PointerGoal };
  readonly purring: boolean;
  readonly reducedMotion: boolean;
  readonly onPurringChange: (purring: boolean) => void;
}) {
  const gl = useThree((state) => state.gl);
  const materials = useCatMaterials();
  const refs = usePartRefs();
  const rest = useRef<{ tail: Euler; leftPaw: Vector3 } | null>(null);
  const blink = useRef({ nextAt: 2.4, closeUntil: 0 });
  const twitch = useRef({ nextAt: 2.6, amount: 0 });
  const speech = useRef({ key: "", until: 0 });
  const rumble = useRef({ amp: 0, y: 0 });

  const onPetDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    gl.domElement.setPointerCapture(event.pointerId);
    onPurringChange(true);
  };

  const onPetUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (gl.domElement.hasPointerCapture(event.pointerId)) {
      gl.domElement.releasePointerCapture(event.pointerId);
    }
    onPurringChange(false);
  };

  useFrame(({ clock }, delta) => {
    const root = refs.root.current;
    const body = refs.body.current;
    const head = refs.head.current;
    const tail = refs.tail.current;
    const leftPaw = refs.leftPaw.current;
    const mouth = refs.mouth.current;
    if (
      root === null ||
      body === null ||
      head === null ||
      tail === null ||
      leftPaw === null ||
      mouth === null
    ) {
      return;
    }
    if (rest.current === null) {
      rest.current = { tail: tail.rotation.clone(), leftPaw: leftPaw.position.clone() };
    }
    const restPose = rest.current;

    const dt = Math.min(delta, 0.05);
    const t = clock.elapsedTime;
    head.rotation.order = "YXZ";
    if (speakKey !== speech.current.key) {
      speech.current.key = speakKey;
      speech.current.until = t + 2.4;
    }
    const listening = mood === "listening";
    const thinking = mood === "thinking";
    const speaking = mood === "idle" && t < speech.current.until;
    const restOpenness = 0.9;

    const poseEyes = (openness: number, width: number, innerScale: number, instant: boolean) => {
      for (const id of ["leftEye", "rightEye"] as const) {
        const eye = refs[id].current;
        if (eye !== null) {
          if (instant) {
            eye.scale.y = openness;
            eye.scale.x = width;
          } else {
            eye.scale.y = MathUtils.damp(eye.scale.y, openness, purring ? 14 : 22, dt);
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
      head.rotation.set(purring ? 0.04 : -0.02, 0, purring ? 0.05 : 0);
      mouth.scale.set(1, 1, 1);
      poseEyes(
        purring ? squintOpenness : restOpenness,
        purring ? squintWidth : 1,
        purring ? 0 : 1,
        true,
      );
      return;
    }

    const breathSpeed =
      thinking && !purring ? 1.35 : purring ? 1.5 : listening ? 2.15 : speaking ? 2.6 : 1.7;
    const breath = (Math.sin(t * breathSpeed) + 1) / 2;
    const burst = purrBurst();
    rumble.current.amp = MathUtils.damp(
      rumble.current.amp,
      purring ? 0.007 * burst.amp : 0,
      12,
      dt,
    );
    const shake = Math.sin(t * Math.PI * 2 * burst.hz) * rumble.current.amp;
    rumble.current.y = MathUtils.damp(
      rumble.current.y,
      Math.sin(t * 1.05) * 0.02 + (speaking && !purring ? Math.abs(Math.sin(t * 9)) * 0.026 : 0),
      6,
      dt,
    );
    root.position.y = rumble.current.y + shake;
    root.position.x = shake * 0.35;
    root.position.z = MathUtils.damp(root.position.z, purring ? 0.04 : listening ? 0.12 : 0, 5, dt);
    root.rotation.x = MathUtils.damp(
      root.rotation.x,
      purring ? 0.03 : listening ? 0.07 : 0.015,
      5,
      dt,
    );

    body.scale.y = 1 + breath * (thinking && !purring ? 0.018 : 0.028);
    body.scale.x = 1 - breath * 0.012;
    body.scale.z = 1 - breath * 0.008;

    const lookX = MathUtils.clamp(pointer.current.x, -1, 1);
    const lookY = MathUtils.clamp(pointer.current.y, -1, 1);
    const lookScale = purring ? 0.45 : 1;
    head.rotation.y = MathUtils.damp(
      head.rotation.y,
      lookX * 0.34 * lookScale + (purring ? 0 : thinking ? 0.16 : listening ? -0.03 : 0),
      5.2,
      dt,
    );
    head.rotation.x = MathUtils.damp(
      head.rotation.x,
      -lookY * 0.2 * lookScale + (purring ? 0.05 : listening ? 0.04 : thinking ? -0.05 : -0.01),
      5.2,
      dt,
    );
    head.rotation.z = MathUtils.damp(
      head.rotation.z,
      purring ? 0.06 : thinking ? -0.08 : listening ? 0.035 : 0,
      5.2,
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

    const dilate = purring ? 0.88 : listening ? 1.1 : thinking ? 0.95 : 1;
    for (const id of ["leftPupil", "rightPupil"] as const) {
      const pupil = refs[id].current;
      if (pupil !== null) {
        pupil.scale.x = MathUtils.damp(pupil.scale.x, dilate, 6, dt);
        pupil.scale.y = MathUtils.damp(pupil.scale.y, dilate, 6, dt);
      }
    }

    if (!purring && t > blink.current.nextAt) {
      blink.current.closeUntil = t + 0.14;
      blink.current.nextAt = t + 3.6 + Math.random() * 4.4;
    }
    let openness = restOpenness;
    if (purring) {
      openness = squintOpenness;
    } else if (t < blink.current.closeUntil) {
      const progress = 1 - (blink.current.closeUntil - t) / 0.14;
      const closed = progress < 0.45 ? progress / 0.45 : 1 - (progress - 0.45) / 0.55;
      openness = restOpenness - closed * (restOpenness - 0.08);
    }
    poseEyes(openness, purring ? squintWidth : 1, purring ? 0 : 1, false);

    if (t > twitch.current.nextAt) {
      twitch.current.amount = 1;
      twitch.current.nextAt = t + 2.6 + Math.random() * 4.6;
    }
    twitch.current.amount = MathUtils.damp(twitch.current.amount, 0, 7, dt);
    const perk = purring ? 0.1 : listening ? -0.14 : thinking ? 0.05 : 0;
    const flick = purring ? 0 : Math.sin(t * 32) * twitch.current.amount * 0.12;
    refs.leftEar.current?.rotation.set(perk, 0, flick);
    refs.rightEar.current?.rotation.set(perk, 0, -flick * 0.6);

    mouth.scale.y = MathUtils.damp(
      mouth.scale.y,
      purring ? 0.72 : speaking ? 1.6 + Math.abs(Math.sin(t * 11.5)) * 2.4 : 1,
      12,
      dt,
    );
    mouth.scale.x = MathUtils.damp(mouth.scale.x, purring ? 1.15 : speaking ? 1.25 : 1, 12, dt);

    const tailSwing = purring ? 0.45 : 1;
    tail.rotation.x =
      restPose.tail.x +
      Math.sin(t * (purring ? 0.9 : 1.7)) * 0.08 * tailSwing +
      (listening && !purring ? -0.1 : 0);
    tail.rotation.y = restPose.tail.y + Math.sin(t * (purring ? 0.7 : 1.15)) * 0.12 * tailSwing;
    tail.rotation.z = restPose.tail.z + Math.sin(t * (purring ? 1.05 : 2.1)) * 0.14 * tailSwing;

    leftPaw.position.y = MathUtils.damp(
      leftPaw.position.y,
      restPose.leftPaw.y + (!purring && thinking ? 0.1 + Math.abs(Math.sin(t * 3.4)) * 0.08 : 0),
      6,
      dt,
    );
    leftPaw.rotation.x = MathUtils.damp(leftPaw.rotation.x, !purring && thinking ? -0.3 : 0, 6, dt);
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
      <sphereGeometry args={[node.radius, 32, 24]} />
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
      tail,
      leftPaw,
    }),
    [],
  );
}

function useCatMaterials(): Record<Surface, Material> {
  const materials = useMemo(() => {
    const fur = (surface: Surface, roughness = 0.92, emissiveIntensity = 0.06) =>
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
      snow: fur("snow"),
      snowShade: fur("snowShade"),
      silver: fur("silver"),
      tabby: fur("tabby"),
      tabbyDark: fur("tabbyDark"),
      innerEar: fur("innerEar", 0.7),
      nose: glass("nose", 0.35, 0.5),
      liner: fur("liner", 0.6),
      mouth: fur("mouth", 0.6),
      eyeWhite: fur("eyeWhite", 0.35),
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
      whisker: new MeshStandardMaterial({
        color: palette.whisker,
        roughness: 0.45,
        emissive: "#fffaf2",
        emissiveIntensity: 0.12,
      }),
    } satisfies Record<Surface, Material>;
  }, []);

  useEffect(() => {
    return () => {
      for (const material of Object.values(materials)) {
        material.dispose();
      }
    };
  }, [materials]);

  return materials;
}
