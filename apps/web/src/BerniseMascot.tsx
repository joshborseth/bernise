import { Canvas } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BerniseCat, type PointerGoal } from "./mascot/BerniseCat.tsx";
import type { BerniseMood } from "./mascot/mood.ts";
import { startPurr } from "./mascot/purr.ts";

const idleUntilSleepMs = 14_000;

export function BerniseMascot({
  mood,
  speakKey,
}: {
  readonly mood: Exclude<BerniseMood, "speaking">;
  readonly speakKey: string;
}) {
  const pointer = useRef<PointerGoal>({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [purring, setPurring] = useState(false);
  const [biting, setBiting] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const awake = mood !== "idle" || purring || biting;
  if (awake && sleeping) {
    setSleeping(false);
  }

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }
    const sync = () => {
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(stage);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const stage = stageRef.current;
      const rect = stage?.getBoundingClientRect();
      const cx = rect === undefined ? window.innerWidth / 2 : rect.left + rect.width / 2;
      const cy = rect === undefined ? window.innerHeight / 2 : rect.top + rect.height * 0.38;
      pointer.current.x = Math.max(
        -1,
        Math.min(1, (event.clientX - cx) / (window.innerWidth * 0.42)),
      );
      pointer.current.y = Math.max(
        -1,
        Math.min(1, -(event.clientY - cy) / (window.innerHeight * 0.42)),
      );
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  useEffect(() => {
    const stop = () => {
      setPurring(false);
      setBiting(false);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  useEffect(() => {
    if (awake || sleeping) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSleeping(true);
    }, idleUntilSleepMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [awake, sleeping]);

  useEffect(() => {
    if (!purring) {
      return;
    }
    return startPurr();
  }, [purring]);

  const className = biting
    ? `mascot mascot-${mood} mascot-biting`
    : purring
      ? `mascot mascot-${mood} mascot-purring`
      : sleeping
        ? `mascot mascot-${mood} mascot-sleeping`
        : `mascot mascot-${mood}`;

  return (
    <div
      className={className}
      role="img"
      aria-label={
        biting
          ? "Bernise has had enough"
          : purring
            ? "Bernise is purring"
            : sleeping
              ? "Bernise is sleeping"
              : "Bernise. Hold to pet."
      }
      aria-pressed={purring}
    >
      <div className="mascot-halo" aria-hidden="true" />
      {sleeping ? (
        <div className="mascot-zzz" aria-hidden="true">
          <span>z</span>
          <span>z</span>
          <span>Z</span>
          <span>Z</span>
        </div>
      ) : null}
      <div ref={stageRef} className="mascot-stage">
        {stageSize.width > 0 && stageSize.height > 0 ? (
          <Canvas
            flat
            dpr={[1, 2]}
            gl={{
              alpha: true,
              antialias: true,
              preserveDrawingBuffer: true,
              powerPreference: "high-performance",
            }}
            camera={{ position: [0, 0.22, 5.6], fov: 30 }}
            resize={{ debounce: 0, scroll: false }}
            style={{
              width: stageSize.width,
              height: stageSize.height,
              pointerEvents: "auto",
              background: "transparent",
            }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0);
            }}
          >
            <BerniseCat
              mood={mood}
              speakKey={speakKey}
              pointer={pointer}
              purring={purring}
              biting={biting}
              sleeping={sleeping}
              reducedMotion={reducedMotion}
              onPurringChange={setPurring}
              onBitingChange={setBiting}
            />
          </Canvas>
        ) : null}
      </div>
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      setReduced(media.matches);
    };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  return reduced;
}
