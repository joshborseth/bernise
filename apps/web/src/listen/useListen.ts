import { useCallback, useEffect, useRef, useState } from "react";
import { applyListenGate, idleListenGate, type ListenGateState } from "./gate.ts";
import {
  createListenSession,
  isMicPermissionError,
  requestMicrophone,
  stopMicrophone,
  type ListenSession,
} from "./session.ts";
import { transcribeUtterance, warmTranscriber } from "./transcribe.ts";

export type ListenStatus = "off" | "starting" | "on" | "denied";

export type ListenControls = {
  readonly muted: boolean;
  readonly status: ListenStatus;
  readonly speechActive: boolean;
  readonly addressed: boolean;
  readonly toggleMuted: () => void;
};

const listenMutedKey = "bernise.listen.muted";
const tickMs = 500;
const pendingClipMs = 2_000;

const readMuted = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(listenMutedKey) === "1";
  } catch {
    return false;
  }
};

const writeMuted = (muted: boolean): void => {
  try {
    if (muted) {
      globalThis.localStorage?.setItem(listenMutedKey, "1");
    } else {
      globalThis.localStorage?.removeItem(listenMutedKey);
    }
  } catch {
    // Quota or private mode — preference still lives in memory.
  }
};

export const useListen = (input: {
  readonly busy: boolean;
  readonly speak: (text: string) => void;
}): ListenControls => {
  const [muted, setMuted] = useState(readMuted);
  const [retry, setRetry] = useState(0);
  const [engineStatus, setEngineStatus] = useState<ListenStatus>(muted ? "off" : "starting");
  const [speechActive, setSpeechActive] = useState(false);
  const [addressed, setAddressed] = useState(false);
  const gateRef = useRef<ListenGateState>(idleListenGate);
  const busyRef = useRef(false);
  const speakRef = useRef(input.speak);
  const speechRef = useRef(false);
  const addressedRef = useRef(false);
  const pendingClipRef = useRef<{ readonly audio: Float32Array; readonly at: number } | undefined>(
    undefined,
  );
  const cancelledRef = useRef(false);

  useEffect(() => {
    busyRef.current = input.busy;
    speakRef.current = input.speak;
  }, [input.busy, input.speak]);

  const apply = useCallback(
    (event: { readonly now?: number; readonly transcript?: string; readonly wake?: boolean }) => {
      const now = event.now ?? Date.now();
      const output = applyListenGate(gateRef.current, {
        now,
        busy: busyRef.current,
        ...(speechRef.current ? { speechActive: true } : {}),
        ...(event.transcript !== undefined ? { transcript: event.transcript } : {}),
        ...(event.wake === true ? { wake: true } : {}),
      });
      gateRef.current = output.state;
      addressedRef.current = output.state.phase === "addressed";
      setAddressed(output.state.phase === "addressed");
      if (output.prompt !== undefined) {
        speakRef.current(output.prompt);
      }
    },
    [],
  );

  const transcribe = useCallback(
    (audio: Float32Array) => {
      void transcribeUtterance(audio)
        .then((transcript) => {
          if (cancelledRef.current || transcript.length === 0) {
            apply({ now: Date.now() });
            return;
          }
          apply({ now: Date.now(), transcript });
        })
        .catch((cause: unknown) => {
          console.warn("Bernise listen transcribe failed", cause);
          apply({ now: Date.now() });
        });
    },
    [apply],
  );

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      apply({ now: Date.now() });
    }, tickMs);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, [apply]);

  /* oxlint-disable react/exhaustive-effect-dependencies -- mute/retry is the session lifetime */
  useEffect(() => {
    if (muted) {
      return;
    }
    void retry;
    cancelledRef.current = false;
    let session: ListenSession | undefined;
    let stream: MediaStream | undefined;
    void (async () => {
      try {
        stream = await requestMicrophone();
        if (cancelledRef.current) {
          stopMicrophone(stream);
          return;
        }
        await warmTranscriber();
        if (cancelledRef.current) {
          stopMicrophone(stream);
          return;
        }
        session = await createListenSession(
          {
            onSpeechStart: () => {
              pendingClipRef.current = undefined;
              speechRef.current = true;
              setSpeechActive(true);
              apply({ now: Date.now() });
            },
            onSpeechEnd: (audio) => {
              speechRef.current = false;
              setSpeechActive(false);
              if (busyRef.current) {
                pendingClipRef.current = undefined;
                apply({ now: Date.now() });
                return;
              }
              if (addressedRef.current) {
                pendingClipRef.current = undefined;
                transcribe(audio);
                return;
              }
              pendingClipRef.current = { audio, at: Date.now() };
              apply({ now: Date.now() });
            },
            onWake: () => {
              apply({ now: Date.now(), wake: true });
              if (speechRef.current || busyRef.current) {
                return;
              }
              const pending = pendingClipRef.current;
              pendingClipRef.current = undefined;
              if (pending !== undefined && Date.now() - pending.at < pendingClipMs) {
                transcribe(pending.audio);
              }
            },
          },
          stream,
        );
        stream = undefined;
        if (cancelledRef.current) {
          session.destroy();
          return;
        }
        await session.start();
        if (cancelledRef.current) {
          session.destroy();
          return;
        }
        setEngineStatus("on");
      } catch (cause) {
        if (stream !== undefined) {
          stopMicrophone(stream);
        }
        if (cancelledRef.current) {
          return;
        }
        if (isMicPermissionError(cause)) {
          setEngineStatus("denied");
          return;
        }
        console.warn("Bernise listen failed to start", cause);
        setEngineStatus("denied");
      }
    })();
    return () => {
      cancelledRef.current = true;
      session?.destroy();
    };
  }, [muted, retry]);
  /* oxlint-enable react/exhaustive-effect-dependencies */

  const status: ListenStatus = muted ? "off" : engineStatus;

  const toggleMuted = useCallback(() => {
    if (engineStatus === "denied" && !muted) {
      writeMuted(false);
      setEngineStatus("starting");
      setRetry((value) => value + 1);
      return;
    }
    const next = !muted;
    writeMuted(next);
    setMuted(next);
    setEngineStatus(next ? "off" : "starting");
    if (next) {
      speechRef.current = false;
      addressedRef.current = false;
      pendingClipRef.current = undefined;
      setSpeechActive(false);
    }
  }, [engineStatus, muted]);

  return { muted, status, speechActive, addressed, toggleMuted };
};
