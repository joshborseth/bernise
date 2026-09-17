import { ContactShadows, Stats } from "@react-three/drei";
import type { RefObject } from "react";
import type { Perch } from "../animation/perchPose.ts";
import type { BerniseMood } from "../mood.ts";
import { AnimatedFigure } from "./AnimatedFigure.tsx";
import { FitCamera } from "./FitCamera.tsx";
import type { PointerGoal } from "./pointerGoal.ts";

export function BerniseScene({
  mood,
  speakKey,
  pointer,
  purring,
  biting,
  hissing,
  sleeping,
  usingLitter,
  perch,
  reducedMotion,
  showFps,
  fpsParentRef,
  onPurringChange,
  onBitingChange,
  onHissingChange,
  onLitterDone,
}: {
  readonly mood: BerniseMood;
  readonly speakKey: string;
  readonly pointer: { readonly current: PointerGoal };
  readonly purring: boolean;
  readonly biting: boolean;
  readonly hissing: boolean;
  readonly sleeping: boolean;
  readonly usingLitter: boolean;
  readonly perch: Perch;
  readonly reducedMotion: boolean;
  readonly showFps: boolean;
  readonly fpsParentRef?: RefObject<HTMLElement>;
  readonly onPurringChange: (purring: boolean) => void;
  readonly onBitingChange: (biting: boolean) => void;
  readonly onHissingChange: (hissing: boolean) => void;
  readonly onLitterDone: () => void;
}) {
  return (
    <>
      {import.meta.env.DEV && showFps && fpsParentRef ? (
        <Stats parent={fpsParentRef as RefObject<HTMLElement>} className="dev-fps-stats" />
      ) : null}
      <FitCamera usingLitter={usingLitter} perch={perch} />
      <hemisphereLight args={["#eef1f6", "#506477", 0.72]} />
      <ambientLight intensity={0.42} color="#e8eaef" />
      <directionalLight position={[2.4, 3.4, 4.2]} intensity={1.05} color="#f2f4f8" />
      <directionalLight position={[-2.6, 1.2, 3.0]} intensity={0.22} color="#91b4d5" />
      <directionalLight position={[0, 0.6, 5.4]} intensity={0.5} color="#ffffff" />
      <directionalLight position={[0.4, 3.2, -3.4]} intensity={0.48} color="#a6accd" />
      <AnimatedFigure
        mood={mood}
        speakKey={speakKey}
        pointer={pointer}
        purring={purring}
        biting={biting}
        hissing={hissing}
        sleeping={sleeping}
        usingLitter={usingLitter}
        perch={perch}
        reducedMotion={reducedMotion}
        onPurringChange={onPurringChange}
        onBitingChange={onBitingChange}
        onHissingChange={onHissingChange}
        onLitterDone={onLitterDone}
      />
      {perch === "none" ? (
        <ContactShadows
          position={[0, -1.2, 0]}
          opacity={sleeping || usingLitter ? 0.26 : 0.16}
          scale={8.2}
          blur={sleeping || usingLitter ? 1.6 : 3.2}
          far={2.2}
          resolution={256}
          frames={reducedMotion ? 1 : Number.POSITIVE_INFINITY}
          color="#1b1e28"
        />
      ) : null}
    </>
  );
}
