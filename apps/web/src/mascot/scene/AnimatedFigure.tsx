import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Euler, MathUtils, Vector3 } from "three";
import type { Group, Object3D } from "three";
import { playChomp, playHiss, playScratch } from "../audio/reactionSounds.ts";
import { purrBurst } from "../audio/purr.ts";
import { escalateDamp } from "../animation/easing.ts";
import {
  biteOpenness,
  biteWidth,
  fangSinkY,
  fangSinkZ,
  hissDone,
  hissMotion,
  hissOpenness,
  hissPupilX,
  hissPupilY,
  hissWidth,
  purrIrisScale,
  purrOpenness,
  squintOpenness,
  squintWidth,
  strikeAfter,
  strikeChomp,
  strikeDone,
  strikeMotion,
} from "../animation/overpetMotion.ts";
import {
  litterBodyDrop,
  litterBodyScaleX,
  litterBodyScaleY,
  litterBodyScaleZ,
  litterHeadPitch,
  litterHeadRoll,
  litterHeadY,
  litterHeadZ,
  litterHindBack,
  litterHindDown,
  litterHindOut,
  litterIdle,
  litterMotion,
  litterPawDown,
  litterPawForward,
  litterPawIn,
  litterPitch,
  litterPush,
  litterReducedMotion,
  litterRootDrop,
  litterScratchEvery,
  litterSquintOpen,
  litterSquintWidth,
  litterTailOffset,
  litterTailRaise,
  litterYaw,
  poseLitterProps,
  setFrontPaw,
  setPlantedHindPaw,
} from "../animation/litterMotion.ts";
import {
  sleepBodyDrop,
  sleepBodyScaleX,
  sleepBodyScaleY,
  sleepBodyScaleZ,
  sleepDrop,
  sleepHeadPitch,
  sleepHeadRoll,
  sleepHeadX,
  sleepHeadY,
  sleepHeadYaw,
  sleepHeadZ,
  sleepPawForward,
  sleepPawIn,
  sleepPitch,
  sleepPush,
  sleepRoll,
  sleepTailX,
  sleepTailY,
  sleepTailZ,
  sleepYaw,
} from "../animation/sleepPose.ts";
import { bernise } from "../model/sceneGraph.ts";
import type { BerniseMood } from "../mood.ts";
import { LitterBox } from "./LitterBox.tsx";
import { Part } from "./Part.tsx";
import { useCatMaterials } from "./materials.ts";
import { usePartRefs } from "./partRefs.ts";
import type { PointerGoal } from "./pointerGoal.ts";

type PetRegion = "head" | "body";

function petRegionFrom(event: ThreeEvent<PointerEvent>): PetRegion {
  let obj: Object3D | null = event.object;
  while (obj !== null) {
    const region = obj.userData.petRegion;
    if (region === "head" || region === "body") {
      return region;
    }
    obj = obj.parent;
  }
  return "body";
}

export function AnimatedFigure({
  mood,
  speakKey,
  pointer,
  purring,
  biting,
  hissing,
  sleeping,
  usingLitter,
  reducedMotion,
  onPurringChange,
  onBitingChange,
  onHissingChange,
  onLitterDone,
}: {
  readonly mood: Exclude<BerniseMood, "speaking">;
  readonly speakKey: string;
  readonly pointer: { readonly current: PointerGoal };
  readonly purring: boolean;
  readonly biting: boolean;
  readonly hissing: boolean;
  readonly sleeping: boolean;
  readonly usingLitter: boolean;
  readonly reducedMotion: boolean;
  readonly onPurringChange: (purring: boolean) => void;
  readonly onBitingChange: (biting: boolean) => void;
  readonly onHissingChange: (hissing: boolean) => void;
  readonly onLitterDone: () => void;
}) {
  const gl = useThree((state) => state.gl);
  const materials = useCatMaterials();
  const refs = usePartRefs();
  const rest = useRef<{
    tail: Euler;
    tailPos: Vector3;
    leftPaw: Vector3;
    rightPaw: Vector3;
    leftHindPaw: Vector3;
    rightHindPaw: Vector3;
    fangs: Vector3;
  } | null>(null);
  const blink = useRef({ nextAt: 2.4, closeUntil: 0 });
  const twitch = useRef({ nextAt: 2.6, amount: 0 });
  const speech = useRef({ key: "", until: 0 });
  const rumble = useRef({ amp: 0, y: 0 });
  const petRegion = useRef<PetRegion>("body");
  const hoverCount = useRef(0);
  const overpet = useRef({
    heldSince: -1,
    strikeAt: -1,
    signaled: false,
    chomped: false,
    hissed: false,
    region: "body" as PetRegion,
  });
  const litterClock = useRef({ startedAt: -1, lastScratchAt: -1, done: false });
  const boxRef = useRef<Group>(null);
  const dropsRef = useRef<Group>(null);
  const kicksRef = useRef<Group>(null);
  const coversRef = useRef<Group>(null);

  const setStageCursor = (holding: boolean, over: boolean) => {
    gl.domElement.style.cursor = holding ? "grabbing" : over ? "grab" : "";
  };

  useEffect(() => {
    setStageCursor(purring || biting || hissing, hoverCount.current > 0);
  }, [purring, biting, hissing]);

  useEffect(() => {
    return () => {
      gl.domElement.style.cursor = "";
    };
  }, [gl]);

  const onPetOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    hoverCount.current += 1;
    setStageCursor(purring || biting || hissing, true);
  };

  const onPetOut = () => {
    hoverCount.current = Math.max(0, hoverCount.current - 1);
    setStageCursor(purring || biting || hissing, hoverCount.current > 0);
  };

  const onPetDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (biting || hissing) {
      return;
    }
    petRegion.current = petRegionFrom(event);
    gl.domElement.setPointerCapture(event.pointerId);
    setStageCursor(true, true);
    onPurringChange(true);
  };

  const onPetUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (gl.domElement.hasPointerCapture(event.pointerId)) {
      gl.domElement.releasePointerCapture(event.pointerId);
    }
    setStageCursor(false, hoverCount.current > 0);
    onPurringChange(false);
    onBitingChange(false);
    onHissingChange(false);
  };

  useFrame(({ clock }, delta) => {
    const root = refs.root.current;
    const body = refs.body.current;
    const head = refs.head.current;
    const tail = refs.tail.current;
    const leftPaw = refs.leftPaw.current;
    const rightPaw = refs.rightPaw.current;
    const leftHindPaw = refs.leftHindPaw.current;
    const rightHindPaw = refs.rightHindPaw.current;
    const mouth = refs.mouth.current;
    const fangs = refs.fangs.current;
    if (
      root === null ||
      body === null ||
      head === null ||
      tail === null ||
      leftPaw === null ||
      rightPaw === null ||
      leftHindPaw === null ||
      rightHindPaw === null ||
      mouth === null ||
      fangs === null
    ) {
      return;
    }
    if (rest.current === null) {
      rest.current = {
        tail: tail.rotation.clone(),
        tailPos: tail.position.clone(),
        leftPaw: leftPaw.position.clone(),
        rightPaw: rightPaw.position.clone(),
        leftHindPaw: leftHindPaw.position.clone(),
        rightHindPaw: rightHindPaw.position.clone(),
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

    if (!purring && !biting && !hissing) {
      const escalateElapsed = overpet.current.strikeAt < 0 ? -1 : t - overpet.current.strikeAt;
      const strikingNow =
        overpet.current.region === "head" && escalateElapsed >= 0 && escalateElapsed < strikeDone;
      const hissingNow =
        overpet.current.region === "body" && escalateElapsed >= 0 && escalateElapsed < hissDone;
      if (!strikingNow && !hissingNow) {
        overpet.current.heldSince = -1;
        overpet.current.strikeAt = -1;
        overpet.current.signaled = false;
        overpet.current.chomped = false;
        overpet.current.hissed = false;
        overpet.current.region = "body";
      }
    } else if (purring && overpet.current.heldSince < 0) {
      overpet.current.heldSince = t;
      overpet.current.region = petRegion.current;
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
      if (overpet.current.region === "head") {
        onBitingChange(true);
      } else {
        onHissingChange(true);
      }
    }
    if (
      overpet.current.region === "head" &&
      overpet.current.strikeAt >= 0 &&
      t - overpet.current.strikeAt >= strikeChomp &&
      !overpet.current.chomped
    ) {
      overpet.current.chomped = true;
      if (!reducedMotion) {
        playChomp();
      }
    }
    if (
      overpet.current.region === "body" &&
      overpet.current.strikeAt >= 0 &&
      !overpet.current.hissed
    ) {
      overpet.current.hissed = true;
      if (!reducedMotion) {
        playHiss();
      }
    }

    const escalateElapsed = overpet.current.strikeAt < 0 ? -1 : t - overpet.current.strikeAt;
    const striking = escalateElapsed >= 0 && overpet.current.region === "head";
    const recoiling = escalateElapsed >= 0 && overpet.current.region === "body";
    const strike = striking ? strikeMotion(escalateElapsed) : strikeMotion(-1);
    const hiss = recoiling ? hissMotion(escalateElapsed) : hissMotion(-1);
    const fangAmount = Math.max(strike.fangs, hiss.fangs);
    const happyPurr = purring && !striking && !recoiling;
    const inLitter = usingLitter && !happyPurr && !striking && !recoiling;
    const asleep = sleeping && !happyPurr && !striking && !recoiling && !inLitter;
    const listening = mood === "listening";
    const thinking = mood === "thinking";
    const speaking =
      mood === "idle" &&
      t < speech.current.until &&
      !striking &&
      !recoiling &&
      !asleep &&
      !inLitter;
    const restOpenness = 0.9;
    const escalate = striking || recoiling;
    if (inLitter) {
      if (litterClock.current.startedAt < 0) {
        litterClock.current.startedAt = t;
        litterClock.current.lastScratchAt = -1;
        litterClock.current.done = false;
      }
    } else {
      litterClock.current.startedAt = -1;
      litterClock.current.lastScratchAt = -1;
      litterClock.current.done = false;
    }
    const litterElapsed =
      litterClock.current.startedAt < 0 ? -1 : t - litterClock.current.startedAt;
    const litter = inLitter
      ? reducedMotion
        ? litterReducedMotion(litterElapsed)
        : litterMotion(litterElapsed)
      : litterIdle;
    if (litter.scratch > 0.5 && !reducedMotion) {
      if (
        litterClock.current.lastScratchAt < 0 ||
        t - litterClock.current.lastScratchAt >= litterScratchEvery
      ) {
        litterClock.current.lastScratchAt = t;
        playScratch();
      }
    }
    if (inLitter && litter.done && !litterClock.current.done) {
      litterClock.current.done = true;
      onLitterDone();
    }
    poseLitterProps(
      boxRef.current,
      dropsRef.current,
      kicksRef.current,
      coversRef.current,
      litter,
      t,
    );
    const squat = litter.squat;
    const leftRake = inLitter ? Math.sin(t * 22) * litter.scratch : 0;
    const rightRake = inLitter ? Math.sin(t * 22 + Math.PI) * litter.scratch : 0;
    const tailOffset = litterTailOffset(squat, litter.tailLift);

    const poseEyes = (openness: number, width: number, innerScale: number, instant: boolean) => {
      for (const id of ["leftEye", "rightEye"] as const) {
        const eye = refs[id].current;
        if (eye !== null) {
          if (instant) {
            eye.scale.y = openness;
            eye.scale.x = width;
          } else {
            eye.scale.y = MathUtils.damp(
              eye.scale.y,
              openness,
              happyPurr || asleep || inLitter ? 14 : 22,
              dt,
            );
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
        body.position.set(0, sleepBodyDrop, 0);
        body.scale.set(sleepBodyScaleX, sleepBodyScaleY, sleepBodyScaleZ);
        head.position.set(sleepHeadX, sleepHeadY, sleepHeadZ);
        head.rotation.set(sleepHeadPitch, sleepHeadYaw, sleepHeadRoll);
        mouth.scale.set(1.15, 0.72, 1);
        fangs.scale.setScalar(0);
        fangs.position.copy(restPose.fangs);
        leftPaw.position.set(
          restPose.leftPaw.x + sleepPawIn,
          restPose.leftPaw.y,
          restPose.leftPaw.z + sleepPawForward,
        );
        rightPaw.position.set(
          restPose.rightPaw.x - sleepPawIn,
          restPose.rightPaw.y,
          restPose.rightPaw.z + sleepPawForward,
        );
        leftPaw.rotation.set(-0.18, 0, 0.08);
        rightPaw.rotation.set(-0.18, 0, -0.08);
        leftHindPaw.position.copy(restPose.leftHindPaw);
        rightHindPaw.position.copy(restPose.rightHindPaw);
        leftHindPaw.rotation.set(0, Math.PI, 0);
        rightHindPaw.rotation.set(0, Math.PI, 0);
        leftHindPaw.scale.setScalar(0);
        rightHindPaw.scale.setScalar(0);
        refs.leftEar.current?.rotation.set(0.22, 0, 0.08);
        refs.rightEar.current?.rotation.set(0.22, 0, -0.08);
        refs.whiskers.current?.rotation.set(0, 0, 0);
        tail.scale.setScalar(1);
        tail.position.copy(restPose.tailPos);
        tail.rotation.set(
          restPose.tail.x + sleepTailX,
          restPose.tail.y + sleepTailY,
          restPose.tail.z + sleepTailZ,
        );
        poseEyes(squintOpenness, squintWidth, 0, true);
        for (const id of ["leftPupil", "rightPupil"] as const) {
          refs[id].current?.scale.set(1, 1, 1);
        }
        return;
      }
      if (inLitter) {
        root.position.set(0, squat * litterRootDrop, squat * litterPush);
        root.rotation.set(squat * litterPitch, litter.turn * litterYaw, squat * litterHeadRoll);
        body.position.set(0, squat * litterBodyDrop, 0);
        body.scale.set(
          1 + (litterBodyScaleX - 1) * squat,
          1 + (litterBodyScaleY - 1) * squat,
          1 + (litterBodyScaleZ - 1) * squat,
        );
        head.position.set(0, squat * litterHeadY, squat * litterHeadZ);
        head.rotation.set(squat * litterHeadPitch, 0, squat * litterHeadRoll);
        mouth.scale.set(1.12, 0.78, 1);
        fangs.scale.setScalar(0);
        fangs.position.copy(restPose.fangs);
        setFrontPaw(leftPaw, restPose.leftPaw, -1, squat, 0, 0);
        setFrontPaw(rightPaw, restPose.rightPaw, 1, squat, 0, 0);
        setPlantedHindPaw(leftHindPaw, restPose.leftHindPaw, -1, squat);
        setPlantedHindPaw(rightHindPaw, restPose.rightHindPaw, 1, squat);
        refs.leftEar.current?.rotation.set(0.14, 0, 0.06);
        refs.rightEar.current?.rotation.set(0.14, 0, -0.06);
        refs.whiskers.current?.rotation.set(0, 0, 0);
        tail.scale.setScalar(1);
        tail.position.set(
          restPose.tailPos.x,
          restPose.tailPos.y + squat * litter.tailLift * litterTailRaise,
          restPose.tailPos.z,
        );
        tail.rotation.set(
          restPose.tail.x + tailOffset[0],
          restPose.tail.y + tailOffset[1],
          restPose.tail.z + tailOffset[2],
        );
        poseEyes(litterSquintOpen, litterSquintWidth, 0.45, true);
        for (const id of ["leftPupil", "rightPupil"] as const) {
          refs[id].current?.scale.set(0.92, 0.92, 1);
        }
        return;
      }
      root.position.set(0, recoiling ? 0.05 : 0, recoiling ? -0.22 : 0);
      root.rotation.set(recoiling ? -0.06 : 0.02, 0, 0);
      body.position.set(0, 0, 0);
      body.scale.set(1, 1, 1);
      head.position.set(0, 0, recoiling ? -0.08 : 0);
      head.rotation.set(
        recoiling ? 0.16 : striking ? 0.08 : happyPurr ? 0.04 : -0.02,
        0,
        striking ? -0.04 : happyPurr ? 0.05 : 0,
      );
      mouth.scale.set(recoiling ? 1.85 : 1, recoiling ? 5.4 : striking ? 1.53 : 1, 1);
      fangs.scale.setScalar(fangAmount);
      fangs.position.set(
        restPose.fangs.x,
        restPose.fangs.y - fangSinkY * fangAmount,
        restPose.fangs.z + fangSinkZ * fangAmount,
      );
      leftPaw.position.set(
        restPose.leftPaw.x + (recoiling ? -0.08 : 0),
        restPose.leftPaw.y,
        restPose.leftPaw.z + (recoiling ? -0.06 : 0),
      );
      rightPaw.position.set(
        restPose.rightPaw.x + (recoiling ? 0.08 : 0),
        restPose.rightPaw.y,
        restPose.rightPaw.z + (recoiling ? -0.06 : 0),
      );
      leftPaw.rotation.set(recoiling ? -0.28 : 0, 0, recoiling ? 0.12 : 0);
      rightPaw.rotation.set(recoiling ? -0.28 : 0, 0, recoiling ? -0.12 : 0);
      leftHindPaw.position.copy(restPose.leftHindPaw);
      rightHindPaw.position.copy(restPose.rightHindPaw);
      leftHindPaw.rotation.set(0, Math.PI, 0);
      rightHindPaw.rotation.set(0, Math.PI, 0);
      leftHindPaw.scale.setScalar(0);
      rightHindPaw.scale.setScalar(0);
      refs.leftEar.current?.rotation.set(
        recoiling ? -0.55 : striking ? -0.42 : 0,
        0,
        recoiling ? 0.35 : striking ? 0.2 : 0,
      );
      refs.rightEar.current?.rotation.set(
        recoiling ? -0.55 : striking ? -0.42 : 0,
        0,
        recoiling ? -0.35 : striking ? -0.2 : 0,
      );
      refs.whiskers.current?.rotation.set(recoiling ? -0.22 : 0, 0, 0);
      tail.scale.setScalar(recoiling ? 1.18 : 1);
      tail.position.copy(restPose.tailPos);
      poseEyes(
        recoiling
          ? hissOpenness
          : striking
            ? biteOpenness
            : happyPurr
              ? squintOpenness
              : restOpenness,
        recoiling ? hissWidth : striking ? biteWidth : happyPurr ? squintWidth : 1,
        happyPurr ? 0 : 1,
        true,
      );
      for (const id of ["leftPupil", "rightPupil"] as const) {
        const pupil = refs[id].current;
        if (pupil !== null) {
          if (recoiling) {
            pupil.scale.set(hissPupilX, hissPupilY, 1);
          } else if (striking) {
            pupil.scale.set(1.22, 1.22, 1);
          } else {
            pupil.scale.set(1, 1, 1);
          }
        }
      }
      return;
    }

    const breathSpeed =
      thinking && !happyPurr && !escalate
        ? 1.35
        : escalate
          ? recoiling
            ? 3.1
            : 2.4
          : happyPurr
            ? 1.5
            : asleep
              ? 0.72
              : inLitter
                ? 0.9
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
      (asleep ? sleepDrop : squat * litterRootDrop) +
        Math.sin(t * (asleep ? 0.55 : inLitter ? 0.8 : 1.05)) *
          (asleep ? 0.01 : inLitter ? 0.008 : 0.02) +
        litter.wiggle * 0.008 +
        (speaking && !happyPurr ? Math.abs(Math.sin(t * 9)) * 0.026 : 0),
      asleep || inLitter ? 3.2 : 6,
      dt,
    );

    const lookX = MathUtils.clamp(pointer.current.x, -1, 1);
    const lookY = MathUtils.clamp(pointer.current.y, -1, 1);
    const lookScale = asleep ? 0.06 : inLitter ? 0 : happyPurr ? 0.45 : recoiling ? 0.35 : 1;
    const settle = asleep ? 3.2 : inLitter ? 14 : 5;
    const snap = escalate ? 18 : settle;

    root.position.y =
      rumble.current.y +
      shake +
      strike.lunge * 0.04 +
      strike.shake * 0.012 +
      hiss.recoil * 0.05 +
      hiss.tremor * 0.008 +
      litter.shake * Math.sin(t * 28) * 0.018;
    root.position.x =
      shake * 0.35 +
      lookX * strike.lunge * 0.1 +
      strike.shake * 0.02 +
      hiss.tremor * 0.012 +
      litter.wiggle * 0.01 +
      litter.shake * Math.sin(t * 22) * 0.03;
    root.position.z = MathUtils.damp(
      root.position.z,
      (striking
        ? -0.05
        : asleep
          ? sleepPush
          : inLitter
            ? squat * litterPush
            : happyPurr
              ? 0.04
              : listening
                ? 0.12
                : 0) +
        strike.lunge * 0.26 -
        hiss.recoil * 0.22,
      escalateDamp(escalateElapsed),
      dt,
    );
    root.rotation.x = MathUtils.damp(
      root.rotation.x,
      (striking
        ? 0.08
        : asleep
          ? sleepPitch
          : inLitter
            ? squat * litterPitch
            : happyPurr
              ? 0.03
              : listening
                ? 0.07
                : 0.015) +
        strike.lunge * 0.18 -
        hiss.recoil * 0.06,
      snap,
      dt,
    );
    root.rotation.y = MathUtils.damp(
      root.rotation.y,
      asleep ? sleepYaw : litter.turn * litterYaw,
      settle,
      dt,
    );
    root.rotation.z = MathUtils.damp(
      root.rotation.z,
      asleep
        ? sleepRoll
        : squat * 0.03 + litter.wiggle * 0.012 + litter.shake * Math.sin(t * 22) * 0.04,
      settle,
      dt,
    );

    body.position.y = MathUtils.damp(
      body.position.y,
      asleep ? sleepBodyDrop : squat * litterBodyDrop,
      asleep || inLitter ? settle : 5,
      dt,
    );
    body.scale.y =
      (asleep ? sleepBodyScaleY : 1 + (litterBodyScaleY - 1) * squat) +
      breath * (asleep || inLitter ? 0.012 : thinking && !happyPurr && !escalate ? 0.018 : 0.028);
    body.scale.x =
      (asleep ? sleepBodyScaleX : 1 + (litterBodyScaleX - 1) * squat) -
      breath * (asleep || inLitter ? 0.006 : 0.012);
    body.scale.z =
      (asleep ? sleepBodyScaleZ : 1 + (litterBodyScaleZ - 1) * squat) -
      breath * (asleep || inLitter ? 0.004 : 0.008);

    head.position.x = MathUtils.damp(
      head.position.x,
      asleep ? sleepHeadX : lookX * strike.lunge * 0.08,
      asleep || inLitter ? settle : 18,
      dt,
    );
    head.position.y = MathUtils.damp(
      head.position.y,
      asleep
        ? sleepHeadY
        : inLitter
          ? squat * litterHeadY
          : -lookY * strike.lunge * 0.05 + hiss.recoil * 0.02,
      asleep || inLitter ? settle : 18,
      dt,
    );
    head.position.z = MathUtils.damp(
      head.position.z,
      asleep
        ? sleepHeadZ
        : inLitter
          ? squat * litterHeadZ
          : strike.lunge * 0.2 - hiss.recoil * 0.08,
      asleep || inLitter ? settle : 18,
      dt,
    );
    head.rotation.y = MathUtils.damp(
      head.rotation.y,
      lookX * 0.34 * lookScale +
        (happyPurr
          ? 0
          : asleep
            ? sleepHeadYaw
            : inLitter
              ? 0
              : striking
                ? lookX * 0.08
                : thinking
                  ? 0.16
                  : listening
                    ? -0.03
                    : 0) +
        strike.shake * 0.12,
      escalate ? 18 : asleep || inLitter ? settle : 5.2,
      dt,
    );
    head.rotation.x = MathUtils.damp(
      head.rotation.x,
      -lookY * 0.2 * lookScale +
        (striking
          ? 0.1
          : recoiling
            ? 0.16
            : asleep
              ? sleepHeadPitch
              : inLitter
                ? squat * litterHeadPitch
                : happyPurr
                  ? 0.05
                  : listening
                    ? 0.04
                    : thinking
                      ? -0.05
                      : -0.01) +
        strike.lunge * 0.22 +
        hiss.tremor * 0.03,
      escalate ? 18 : asleep || inLitter ? settle : 5.2,
      dt,
    );
    head.rotation.z = MathUtils.damp(
      head.rotation.z,
      (striking
        ? -0.05
        : asleep
          ? sleepHeadRoll
          : inLitter
            ? squat * litterHeadRoll
            : happyPurr
              ? 0.06
              : thinking
                ? -0.08
                : listening
                  ? 0.035
                  : 0) +
        strike.shake * 0.16 +
        hiss.tremor * 0.04,
      escalate ? 18 : asleep || inLitter ? settle : 5.2,
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
        : inLitter
          ? 0.92
          : listening
            ? 1.1
            : thinking
              ? 0.95
              : 1;
    for (const id of ["leftPupil", "rightPupil"] as const) {
      const pupil = refs[id].current;
      if (pupil !== null) {
        if (recoiling) {
          pupil.scale.x = MathUtils.damp(pupil.scale.x, hissPupilX, 18, dt);
          pupil.scale.y = MathUtils.damp(pupil.scale.y, hissPupilY, 18, dt);
        } else if (striking) {
          pupil.scale.x = dilate;
          pupil.scale.y = dilate;
        } else {
          pupil.scale.x = MathUtils.damp(pupil.scale.x, dilate, 8, dt);
          pupil.scale.y = MathUtils.damp(pupil.scale.y, dilate, 8, dt);
        }
      }
    }

    if (!happyPurr && !escalate && !asleep && !inLitter && t > blink.current.nextAt) {
      blink.current.closeUntil = t + 0.14;
      blink.current.nextAt = t + 3.6 + Math.random() * 4.4;
    }
    let openness = restOpenness;
    let width = 1;
    let innerScale = 1;
    if (recoiling) {
      openness = hissOpenness;
      width = hissWidth;
    } else if (striking) {
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
    } else if (inLitter && squat > 0.2) {
      openness = litterSquintOpen;
      width = litterSquintWidth;
      innerScale = 0.45;
    } else if (t < blink.current.closeUntil) {
      const progress = 1 - (blink.current.closeUntil - t) / 0.14;
      const closed = progress < 0.45 ? progress / 0.45 : 1 - (progress - 0.45) / 0.55;
      openness = restOpenness - closed * (restOpenness - 0.08);
    }
    poseEyes(openness, width, innerScale, escalate);

    if (t > twitch.current.nextAt) {
      twitch.current.amount = 1;
      twitch.current.nextAt = t + 2.6 + Math.random() * 4.6;
    }
    twitch.current.amount = MathUtils.damp(twitch.current.amount, 0, 7, dt);
    const perk = recoiling
      ? -0.55
      : striking
        ? -0.42
        : asleep
          ? 0.22
          : inLitter
            ? 0.14
            : happyPurr
              ? 0.1
              : listening
                ? -0.14
                : thinking
                  ? 0.05
                  : 0;
    const flatten = recoiling ? 0.35 : striking ? 0.2 : asleep ? 0.08 : inLitter ? 0.06 : 0;
    const flick =
      happyPurr || asleep || recoiling || inLitter
        ? 0
        : Math.sin(t * (striking ? 18 : 32)) * twitch.current.amount * 0.12;
    refs.leftEar.current?.rotation.set(perk, 0, flatten + flick);
    refs.rightEar.current?.rotation.set(perk, 0, -flatten - flick * 0.6);

    const whiskers = refs.whiskers.current;
    if (whiskers !== null) {
      whiskers.rotation.x = MathUtils.damp(whiskers.rotation.x, hiss.recoil * -0.22, 18, dt);
    }

    const mouthOpen = hiss.mouth > 0 || strike.mouth > 0;
    mouth.scale.y = MathUtils.damp(
      mouth.scale.y,
      hiss.mouth > 0
        ? 1 + hiss.mouth * 4.8
        : strike.mouth > 0
          ? 1 + strike.mouth * 4.4
          : happyPurr || asleep || inLitter
            ? 0.72
            : speaking
              ? 1.6 + Math.abs(Math.sin(t * 11.5)) * 2.4
              : 1,
      mouthOpen ? 28 : 12,
      dt,
    );
    mouth.scale.x = MathUtils.damp(
      mouth.scale.x,
      hiss.mouth > 0
        ? 1 + hiss.mouth * 0.85
        : strike.mouth > 0
          ? 1 + strike.mouth * 0.7
          : happyPurr || asleep || inLitter
            ? 1.15
            : speaking
              ? 1.25
              : 1,
      12,
      dt,
    );
    fangs.scale.setScalar(fangAmount);
    fangs.position.y = restPose.fangs.y - fangSinkY * fangAmount;
    fangs.position.z = restPose.fangs.z + fangSinkZ * fangAmount;

    const tailSpeed = recoiling
      ? 9.2
      : striking
        ? 6.4
        : asleep
          ? 0.55
          : inLitter
            ? 0.4
            : happyPurr
              ? 0.9
              : 1.7;
    const tailSwing = recoiling
      ? 1.7
      : striking
        ? 1.45
        : asleep
          ? 0.28
          : inLitter
            ? 0.18
            : happyPurr
              ? 0.45
              : 1;
    tail.scale.setScalar(MathUtils.damp(tail.scale.x, recoiling ? 1.18 : 1, 8, dt));
    tail.rotation.x =
      restPose.tail.x +
      Math.sin(t * tailSpeed) * 0.08 * tailSwing +
      (listening && !happyPurr && !escalate ? -0.1 : 0) +
      (asleep ? sleepTailX : tailOffset[0]);
    tail.rotation.y =
      restPose.tail.y +
      Math.sin(
        t *
          (recoiling
            ? 8.4
            : striking
              ? 5.2
              : asleep
                ? 0.48
                : inLitter
                  ? 0.42
                  : happyPurr
                    ? 0.7
                    : 1.15),
      ) *
        0.12 *
        tailSwing +
      (asleep ? sleepTailY : tailOffset[1]);
    tail.rotation.z =
      restPose.tail.z +
      Math.sin(
        t *
          (recoiling
            ? 10.6
            : striking
              ? 7.1
              : asleep
                ? 0.62
                : inLitter
                  ? 0.5
                  : happyPurr
                    ? 1.05
                    : 2.1),
      ) *
        0.14 *
        tailSwing +
      (asleep ? sleepTailZ : tailOffset[2]);
    const tailRaise = squat * litter.tailLift * litterTailRaise;
    tail.position.x = MathUtils.damp(tail.position.x, restPose.tailPos.x, 8, dt);
    tail.position.y = MathUtils.damp(tail.position.y, restPose.tailPos.y + tailRaise, 8, dt);
    tail.position.z = MathUtils.damp(tail.position.z, restPose.tailPos.z, 8, dt);

    leftPaw.position.x = MathUtils.damp(
      leftPaw.position.x,
      restPose.leftPaw.x +
        (recoiling ? -0.08 : asleep ? sleepPawIn : squat * litterPawIn + leftRake * 0.08),
      6,
      dt,
    );
    leftPaw.position.y = MathUtils.damp(
      leftPaw.position.y,
      restPose.leftPaw.y +
        (striking
          ? 0.08
          : recoiling
            ? 0.02
            : squat * litterPawDown + litter.scratch * 0.03 + Math.max(0, leftRake) * 0.05),
      6,
      dt,
    );
    leftPaw.position.z = MathUtils.damp(
      leftPaw.position.z,
      restPose.leftPaw.z +
        (recoiling ? -0.06 : asleep ? sleepPawForward : squat * litterPawForward + leftRake * 0.16),
      6,
      dt,
    );
    leftPaw.rotation.x = MathUtils.damp(
      leftPaw.rotation.x,
      recoiling
        ? -0.28
        : striking
          ? -0.22
          : asleep
            ? -0.18
            : squat * -0.28 + litter.scratch * -0.22 + leftRake * -0.28,
      6,
      dt,
    );
    leftPaw.rotation.z = MathUtils.damp(
      leftPaw.rotation.z,
      recoiling ? 0.12 : asleep ? 0.08 : squat * 0.05 + leftRake * 0.12,
      6,
      dt,
    );

    rightPaw.position.x = MathUtils.damp(
      rightPaw.position.x,
      restPose.rightPaw.x +
        (recoiling ? 0.08 : asleep ? -sleepPawIn : -squat * litterPawIn + rightRake * 0.08),
      6,
      dt,
    );
    rightPaw.position.y = MathUtils.damp(
      rightPaw.position.y,
      restPose.rightPaw.y +
        (recoiling
          ? 0.02
          : squat * litterPawDown + litter.scratch * 0.03 + Math.max(0, rightRake) * 0.05),
      6,
      dt,
    );
    rightPaw.position.z = MathUtils.damp(
      rightPaw.position.z,
      restPose.rightPaw.z +
        (recoiling
          ? -0.06
          : asleep
            ? sleepPawForward
            : squat * litterPawForward + rightRake * 0.16),
      6,
      dt,
    );
    rightPaw.rotation.x = MathUtils.damp(
      rightPaw.rotation.x,
      recoiling
        ? -0.28
        : asleep
          ? -0.18
          : squat * -0.28 + litter.scratch * -0.22 + rightRake * -0.28,
      6,
      dt,
    );
    rightPaw.rotation.z = MathUtils.damp(
      rightPaw.rotation.z,
      recoiling ? -0.12 : asleep ? -0.08 : squat * -0.05 + rightRake * -0.12,
      6,
      dt,
    );

    leftHindPaw.position.x = MathUtils.damp(
      leftHindPaw.position.x,
      restPose.leftHindPaw.x - squat * litterHindOut,
      8,
      dt,
    );
    leftHindPaw.position.y = MathUtils.damp(
      leftHindPaw.position.y,
      restPose.leftHindPaw.y + squat * litterHindDown,
      8,
      dt,
    );
    leftHindPaw.position.z = MathUtils.damp(
      leftHindPaw.position.z,
      restPose.leftHindPaw.z + squat * litterHindBack,
      8,
      dt,
    );
    leftHindPaw.rotation.x = MathUtils.damp(leftHindPaw.rotation.x, squat * -0.18, 8, dt);
    leftHindPaw.rotation.y = Math.PI;
    leftHindPaw.rotation.z = MathUtils.damp(leftHindPaw.rotation.z, squat * -0.08, 8, dt);

    rightHindPaw.position.x = MathUtils.damp(
      rightHindPaw.position.x,
      restPose.rightHindPaw.x + squat * litterHindOut,
      8,
      dt,
    );
    rightHindPaw.position.y = MathUtils.damp(
      rightHindPaw.position.y,
      restPose.rightHindPaw.y + squat * litterHindDown,
      8,
      dt,
    );
    rightHindPaw.position.z = MathUtils.damp(
      rightHindPaw.position.z,
      restPose.rightHindPaw.z + squat * litterHindBack,
      8,
      dt,
    );
    rightHindPaw.rotation.x = MathUtils.damp(rightHindPaw.rotation.x, squat * -0.18, 8, dt);
    rightHindPaw.rotation.y = Math.PI;
    rightHindPaw.rotation.z = MathUtils.damp(rightHindPaw.rotation.z, squat * 0.08, 8, dt);
    leftHindPaw.scale.setScalar(MathUtils.damp(leftHindPaw.scale.x, squat, 8, dt));
    rightHindPaw.scale.setScalar(MathUtils.damp(rightHindPaw.scale.x, squat, 8, dt));
  });

  return (
    <group
      onPointerOver={onPetOver}
      onPointerOut={onPetOut}
      onPointerDown={onPetDown}
      onPointerUp={onPetUp}
      onPointerCancel={onPetUp}
    >
      <Part node={bernise} materials={materials} refs={refs} />
      <LitterBox boxRef={boxRef} dropsRef={dropsRef} kicksRef={kicksRef} coversRef={coversRef} />
    </group>
  );
}

