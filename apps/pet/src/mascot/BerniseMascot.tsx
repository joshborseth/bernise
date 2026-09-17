import { Canvas } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { subscribePetAction, subscribePointer, type PetAction } from "../host.ts";
import { startPurr } from "./audio/purr.ts";
import type { Perch } from "./animation/perchPose.ts";
import type { BerniseMood } from "./mood.ts";
import { mascotCameraFov, mascotCameraPosition } from "./scene/camera.ts";
import { BerniseScene } from "./scene/BerniseScene.tsx";
import { pointerGoalFromClient, type PointerGoal } from "./scene/pointerGoal.ts";

const idleUntilSleepMs = 14_000;

export function BerniseMascot({
  mood,
  speakKey,
  perch = "none",
  showFps = false,
  fpsParentRef,
}: {
  readonly mood: BerniseMood;
  readonly speakKey: string;
  readonly perch?: Perch;
  readonly showFps?: boolean;
  readonly fpsParentRef?: RefObject<HTMLElement>;
}) {
  const pointer = useRef<PointerGoal>({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageReady, setStageReady] = useState(false);
  const [purring, setPurring] = useState(false);
  const [biting, setBiting] = useState(false);
  const [hissing, setHissing] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [usingLitter, setUsingLitter] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const awake = mood !== "idle" || purring || biting || hissing;
  if (awake && sleeping) {
    setSleeping(false);
  }
  if ((purring || biting || hissing) && usingLitter) {
    setUsingLitter(false);
  }

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }
    const markReady = () => {
      if (stage.clientWidth > 0 && stage.clientHeight > 0) {
        setStageReady(true);
        return true;
      }
      return false;
    };
    if (markReady()) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (markReady()) {
        observer.disconnect();
      }
    });
    observer.observe(stage);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return subscribePetAction((action: PetAction) => {
      if (action === "litter") {
        setSleeping(false);
        setUsingLitter(true);
        return;
      }
      if (action === "sleep") {
        setUsingLitter(false);
        setSleeping(true);
        return;
      }
      setUsingLitter(false);
      setSleeping(false);
    });
  }, []);

  useEffect(() => {
    let hostPointerActive = false;
    const applyClient = (
      clientX: number,
      clientY: number,
      viewWidth: number,
      viewHeight: number,
    ) => {
      const rect = stageRef.current?.getBoundingClientRect();
      pointer.current = pointerGoalFromClient(
        { clientX, clientY },
        rect === undefined
          ? undefined
          : { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        { width: viewWidth, height: viewHeight },
      );
    };
    const stopPointer = subscribePointer((next) => {
      hostPointerActive = true;
      applyClient(next.clientX, next.clientY, next.viewWidth, next.viewHeight);
    });
    const onMove = (event: PointerEvent) => {
      if (hostPointerActive) {
        return;
      }
      applyClient(event.clientX, event.clientY, window.innerWidth, window.innerHeight);
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      stopPointer();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  useEffect(() => {
    const stop = () => {
      setPurring(false);
      setBiting(false);
      setHissing(false);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  useEffect(() => {
    if (awake || sleeping || usingLitter) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSleeping(true);
    }, idleUntilSleepMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [awake, sleeping, usingLitter]);

  useEffect(() => {
    if (!purring) {
      return;
    }
    return startPurr();
  }, [purring]);

  const className = biting
    ? `mascot mascot-${mood} mascot-biting`
    : hissing
      ? `mascot mascot-${mood} mascot-hissing`
      : purring
        ? `mascot mascot-${mood} mascot-purring`
        : usingLitter
          ? `mascot mascot-${mood} mascot-litter`
          : sleeping
            ? `mascot mascot-${mood} mascot-sleeping`
            : `mascot mascot-${mood}`;
  const perched = perch !== "none";

  return (
    <div
      className={perched ? `${className} mascot-perch mascot-perch-${perch}` : className}
      role="img"
      aria-label={
        biting
          ? "Bernise has had enough"
          : hissing
            ? "Bernise is hissing"
            : purring
              ? "Bernise is purring"
              : usingLitter
                ? "Bernise is using the litter box"
                : sleeping
                  ? "Bernise is sleeping"
                  : "Bernise. Hold to pet."
      }
      aria-pressed={purring}
    >
      {sleeping ? (
        <div className="mascot-zzz" aria-hidden="true">
          <span>z</span>
          <span>z</span>
          <span>Z</span>
          <span>Z</span>
        </div>
      ) : null}
      <div ref={stageRef} className="mascot-stage">
        {stageReady ? (
          <Canvas
            flat
            dpr={[1, 2]}
            gl={{
              alpha: true,
              antialias: true,
              powerPreference: "high-performance",
              stencil: false,
            }}
            camera={{ position: [...mascotCameraPosition], fov: mascotCameraFov }}
            resize={{ debounce: 50, scroll: false }}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              pointerEvents: "auto",
              background: "transparent",
            }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0);
            }}
          >
            <BerniseScene
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
              showFps={showFps}
              {...(fpsParentRef === undefined ? {} : { fpsParentRef })}
              onPurringChange={setPurring}
              onBitingChange={setBiting}
              onHissingChange={setHissing}
              onLitterDone={() => {
                setUsingLitter(false);
              }}
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
