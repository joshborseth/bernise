import { ContactShadows, Stats } from "@react-three/drei";
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
  reducedMotion,
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
  readonly reducedMotion: boolean;
  readonly onPurringChange: (purring: boolean) => void;
  readonly onBitingChange: (biting: boolean) => void;
  readonly onHissingChange: (hissing: boolean) => void;
  readonly onLitterDone: () => void;
}) {
  return (
    <>
      {import.meta.env.DEV ? <Stats /> : null}
      <FitCamera />
      <hemisphereLight args={["#fffaf3", "#e6d7c8", 0.85]} />
      <ambientLight intensity={0.5} color="#fff6ea" />
      <directionalLight position={[2.4, 3.4, 4.2]} intensity={1.15} color="#fff7ee" />
      <directionalLight position={[-2.6, 1.2, 3.0]} intensity={0.45} color="#dcecf7" />
      <directionalLight position={[0, 0.6, 5.4]} intensity={0.6} color="#ffffff" />
      <directionalLight position={[0.4, 3.2, -3.4]} intensity={0.85} color="#ffe6cf" />
      <AnimatedFigure
        mood={mood}
        speakKey={speakKey}
        pointer={pointer}
        purring={purring}
        biting={biting}
        hissing={hissing}
        sleeping={sleeping}
        usingLitter={usingLitter}
        reducedMotion={reducedMotion}
        onPurringChange={onPurringChange}
        onBitingChange={onBitingChange}
        onHissingChange={onHissingChange}
        onLitterDone={onLitterDone}
      />
      <ContactShadows
        position={[0, -1.2, 0]}
        opacity={sleeping || usingLitter ? 0.26 : 0.16}
        scale={8.2}
        blur={sleeping || usingLitter ? 1.6 : 3.2}
        far={2.2}
        resolution={256}
        frames={reducedMotion ? 1 : Number.POSITIVE_INFINITY}
        color="#6a5346"
      />
    </>
  );
}
