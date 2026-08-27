import { ContactShadows } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Euler, MathUtils, MeshPhysicalMaterial, MeshStandardMaterial, Vector3 } from "three";
import type { Group, Material } from "three";
import { massGeometry, whiskerGeometry } from "./berniseGeometry.ts";
import { bernise, palette, type Node, type PartId, type Surface } from "./berniseModel.ts";
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
const sleepDrop = -0.42;
const sleepPitch = 1.05;
const sleepYaw = 0.12;
const sleepRoll = 0.28;
const sleepPush = 0.18;

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
  sleeping,
  reducedMotion,
  onPurringChange,
  onBitingChange,
}: {
  readonly mood: Exclude<BerniseMood, "speaking">;
  readonly speakKey: string;
  readonly pointer: { readonly current: PointerGoal };
  readonly purring: boolean;
  readonly biting: boolean;
  readonly sleeping: boolean;
  readonly reducedMotion: boolean;
  readonly onPurringChange: (purring: boolean) => void;
  readonly onBitingChange: (biting: boolean) => void;
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
        biting={biting}
        sleeping={sleeping}
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
  sleeping,
  reducedMotion,
  onPurringChange,
  onBitingChange,
}: {
  readonly mood: Exclude<BerniseMood, "speaking">;
  readonly speakKey: string;
  readonly pointer: { readonly current: PointerGoal };
  readonly purring: boolean;
  readonly biting: boolean;
  readonly sleeping: boolean;
  readonly reducedMotion: boolean;
  readonly onPurringChange: (purring: boolean) => void;
  readonly onBitingChange: (biting: boolean) => void;
}) {
  const gl = useThree((state) => state.gl);
  const materials = useCatMaterials();
  const refs = usePartRefs();
  const rest = useRef<{
    tail: Euler;
    leftPaw: Vector3;
    rightPaw: Vector3;
    fangs: Vector3;
  } | null>(null);
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
    const rightPaw = refs.rightPaw.current;
    const mouth = refs.mouth.current;
    const fangs = refs.fangs.current;
    if (
      root === null ||
      body === null ||
      head === null ||
      tail === null ||
      leftPaw === null ||
      rightPaw === null ||
      mouth === null ||
      fangs === null
    ) {
      return;
    }
    if (rest.current === null) {
      rest.current = {
        tail: tail.rotation.clone(),
        leftPaw: leftPaw.position.clone(),
        rightPaw: rightPaw.position.clone(),
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
    const asleep = sleeping && !happyPurr && !striking;
    const listening = mood === "listening";
    const thinking = mood === "thinking";
    const speaking = mood === "idle" && t < speech.current.until && !striking && !asleep;
    const restOpenness = 0.9;

    const poseEyes = (openness: number, width: number, innerScale: number, instant: boolean) => {
      for (const id of ["leftEye", "rightEye"] as const) {
        const eye = refs[id].current;
        if (eye !== null) {
          if (instant) {
            eye.scale.y = openness;
            eye.scale.x = width;
          } else {
            eye.scale.y = MathUtils.damp(eye.scale.y, openness, happyPurr || asleep ? 14 : 22, dt);
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
      if (asleep) {
        root.position.set(0, sleepDrop, sleepPush);
        root.rotation.set(sleepPitch, sleepYaw, sleepRoll);
        body.scale.set(1.06, 0.88, 1.04);
        head.position.set(0.08, -0.06, 0.14);
        head.rotation.set(0.12, 0.16, 0.38);
        mouth.scale.set(1.15, 0.72, 1);
        fangs.scale.setScalar(0);
        fangs.position.copy(restPose.fangs);
        leftPaw.position.set(
          restPose.leftPaw.x + 0.1,
          restPose.leftPaw.y + 0.05,
          restPose.leftPaw.z + 0.1,
        );
        rightPaw.position.set(
          restPose.rightPaw.x - 0.1,
          restPose.rightPaw.y + 0.05,
          restPose.rightPaw.z + 0.1,
        );
        leftPaw.rotation.set(-0.18, 0, 0.08);
        rightPaw.rotation.set(-0.18, 0, -0.08);
        refs.leftEar.current?.rotation.set(0.22, 0, 0.08);
        refs.rightEar.current?.rotation.set(0.22, 0, -0.08);
        poseEyes(squintOpenness, squintWidth, 0, true);
        return;
      }
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
      leftPaw.position.copy(restPose.leftPaw);
      rightPaw.position.copy(restPose.rightPaw);
      leftPaw.rotation.set(0, 0, 0);
      rightPaw.rotation.set(0, 0, 0);
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
            : asleep
              ? 0.72
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
      (asleep ? sleepDrop : 0) +
        Math.sin(t * (asleep ? 0.55 : 1.05)) * (asleep ? 0.01 : 0.02) +
        (speaking && !happyPurr ? Math.abs(Math.sin(t * 9)) * 0.026 : 0),
      asleep ? 3.2 : 6,
      dt,
    );

    const lookX = MathUtils.clamp(pointer.current.x, -1, 1);
    const lookY = MathUtils.clamp(pointer.current.y, -1, 1);
    const lookScale = asleep ? 0.06 : happyPurr ? 0.45 : 1;
    const settle = asleep ? 3.2 : 5;

    root.position.y = rumble.current.y + shake + strike.lunge * 0.04 + strike.shake * 0.012;
    root.position.x = shake * 0.35 + lookX * strike.lunge * 0.1 + strike.shake * 0.02;
    root.position.z = MathUtils.damp(
      root.position.z,
      (striking ? -0.05 : asleep ? sleepPush : happyPurr ? 0.04 : listening ? 0.12 : 0) +
        strike.lunge * 0.26,
      strikingDamp(strikeElapsed),
      dt,
    );
    root.rotation.x = MathUtils.damp(
      root.rotation.x,
      (striking ? 0.08 : asleep ? sleepPitch : happyPurr ? 0.03 : listening ? 0.07 : 0.015) +
        strike.lunge * 0.18,
      striking ? 18 : settle,
      dt,
    );
    root.rotation.y = MathUtils.damp(root.rotation.y, asleep ? sleepYaw : 0, settle, dt);
    root.rotation.z = MathUtils.damp(root.rotation.z, asleep ? sleepRoll : 0, settle, dt);

    body.scale.y =
      (asleep ? 0.88 : 1) +
      breath * (asleep ? 0.012 : thinking && !happyPurr && !striking ? 0.018 : 0.028);
    body.scale.x = (asleep ? 1.06 : 1) - breath * (asleep ? 0.006 : 0.012);
    body.scale.z = (asleep ? 1.04 : 1) - breath * (asleep ? 0.004 : 0.008);

    head.position.x = MathUtils.damp(
      head.position.x,
      asleep ? 0.08 : lookX * strike.lunge * 0.08,
      asleep ? settle : 18,
      dt,
    );
    head.position.y = MathUtils.damp(
      head.position.y,
      asleep ? -0.06 : -lookY * strike.lunge * 0.05,
      asleep ? settle : 18,
      dt,
    );
    head.position.z = MathUtils.damp(
      head.position.z,
      asleep ? 0.14 : strike.lunge * 0.2,
      asleep ? settle : 18,
      dt,
    );
    head.rotation.y = MathUtils.damp(
      head.rotation.y,
      lookX * 0.34 * lookScale +
        (happyPurr
          ? 0
          : asleep
            ? 0.16
            : striking
              ? lookX * 0.08
              : thinking
                ? 0.16
                : listening
                  ? -0.03
                  : 0) +
        strike.shake * 0.12,
      striking ? 18 : asleep ? settle : 5.2,
      dt,
    );
    head.rotation.x = MathUtils.damp(
      head.rotation.x,
      -lookY * 0.2 * lookScale +
        (striking
          ? 0.1
          : asleep
            ? 0.12
            : happyPurr
              ? 0.05
              : listening
                ? 0.04
                : thinking
                  ? -0.05
                  : -0.01) +
        strike.lunge * 0.22,
      striking ? 18 : asleep ? settle : 5.2,
      dt,
    );
    head.rotation.z = MathUtils.damp(
      head.rotation.z,
      (striking
        ? -0.05
        : asleep
          ? 0.38
          : happyPurr
            ? 0.06
            : thinking
              ? -0.08
              : listening
                ? 0.035
                : 0) +
        strike.shake * 0.16,
      striking ? 18 : asleep ? settle : 5.2,
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

    const dilate = striking
      ? 1.22
      : happyPurr || asleep
        ? 0.88
        : listening
          ? 1.1
          : thinking
            ? 0.95
            : 1;
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

    if (!happyPurr && !striking && !asleep && t > blink.current.nextAt) {
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
    } else if (asleep) {
      openness = squintOpenness;
      width = squintWidth;
      innerScale = 0;
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
    const perk = striking
      ? -0.42
      : asleep
        ? 0.22
        : happyPurr
          ? 0.1
          : listening
            ? -0.14
            : thinking
              ? 0.05
              : 0;
    const flatten = striking ? 0.2 : asleep ? 0.08 : 0;
    const flick =
      happyPurr || asleep ? 0 : Math.sin(t * (striking ? 18 : 32)) * twitch.current.amount * 0.12;
    refs.leftEar.current?.rotation.set(perk, 0, flatten + flick);
    refs.rightEar.current?.rotation.set(perk, 0, -flatten - flick * 0.6);

    mouth.scale.y = MathUtils.damp(
      mouth.scale.y,
      strike.mouth > 0
        ? 1 + strike.mouth * 4.4
        : happyPurr || asleep
          ? 0.72
          : speaking
            ? 1.6 + Math.abs(Math.sin(t * 11.5)) * 2.4
            : 1,
      strike.mouth > 0 ? 28 : 12,
      dt,
    );
    mouth.scale.x = MathUtils.damp(
      mouth.scale.x,
      strike.mouth > 0 ? 1 + strike.mouth * 0.7 : happyPurr || asleep ? 1.15 : speaking ? 1.25 : 1,
      12,
      dt,
    );
    fangs.scale.setScalar(strike.fangs);
    fangs.position.y = restPose.fangs.y - fangSinkY * strike.fangs;
    fangs.position.z = restPose.fangs.z + fangSinkZ * strike.fangs;

    const tailSpeed = striking ? 6.4 : asleep ? 0.55 : happyPurr ? 0.9 : 1.7;
    const tailSwing = striking ? 1.45 : asleep ? 0.28 : happyPurr ? 0.45 : 1;
    tail.rotation.x =
      restPose.tail.x +
      Math.sin(t * tailSpeed) * 0.08 * tailSwing +
      (listening && !happyPurr && !striking ? -0.1 : 0) +
      (asleep ? 0.12 : 0);
    tail.rotation.y =
      restPose.tail.y +
      Math.sin(t * (striking ? 5.2 : asleep ? 0.48 : happyPurr ? 0.7 : 1.15)) * 0.12 * tailSwing +
      (asleep ? 0.18 : 0);
    tail.rotation.z =
      restPose.tail.z +
      Math.sin(t * (striking ? 7.1 : asleep ? 0.62 : happyPurr ? 1.05 : 2.1)) * 0.14 * tailSwing +
      (asleep ? 0.32 : 0);

    leftPaw.position.x = MathUtils.damp(
      leftPaw.position.x,
      restPose.leftPaw.x + (asleep ? 0.1 : 0),
      6,
      dt,
    );
    leftPaw.position.y = MathUtils.damp(
      leftPaw.position.y,
      restPose.leftPaw.y +
        (striking
          ? 0.08
          : asleep
            ? 0.05
            : !happyPurr && thinking
              ? 0.1 + Math.abs(Math.sin(t * 3.4)) * 0.08
              : 0),
      6,
      dt,
    );
    leftPaw.position.z = MathUtils.damp(
      leftPaw.position.z,
      restPose.leftPaw.z + (asleep ? 0.1 : 0),
      6,
      dt,
    );
    leftPaw.rotation.x = MathUtils.damp(
      leftPaw.rotation.x,
      striking ? -0.22 : asleep ? -0.18 : !happyPurr && thinking ? -0.3 : 0,
      6,
      dt,
    );
    leftPaw.rotation.z = MathUtils.damp(leftPaw.rotation.z, asleep ? 0.08 : 0, 6, dt);

    rightPaw.position.x = MathUtils.damp(
      rightPaw.position.x,
      restPose.rightPaw.x + (asleep ? -0.1 : 0),
      6,
      dt,
    );
    rightPaw.position.y = MathUtils.damp(
      rightPaw.position.y,
      restPose.rightPaw.y + (asleep ? 0.05 : 0),
      6,
      dt,
    );
    rightPaw.position.z = MathUtils.damp(
      rightPaw.position.z,
      restPose.rightPaw.z + (asleep ? 0.1 : 0),
      6,
      dt,
    );
    rightPaw.rotation.x = MathUtils.damp(rightPaw.rotation.x, asleep ? -0.18 : 0, 6, dt);
    rightPaw.rotation.z = MathUtils.damp(rightPaw.rotation.z, asleep ? -0.08 : 0, 6, dt);
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
  const fangs = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const leftPaw = useRef<Group>(null);
  const rightPaw = useRef<Group>(null);
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
      rightPaw,
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
