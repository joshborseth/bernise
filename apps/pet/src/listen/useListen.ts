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
  readonly muted?: boolean;
}): ListenControls => {
  const [muted, setMuted] = useState(input.muted ?? readMuted);
  const [retry, setRetry] = useState(0);
  const [engineStatus, setEngineStatus] = useState<ListenStatus>(muted ? "off" : "starting");
  const [speechActive, setSpeechActive] = useState(false);
  const [addressed, setAddressed] = useState(false);
  const gateRef = useRef<ListenGateState>(idleListenGate);
  const busyRef = useRef(false);
  const speakRef = useRef(input.speak);
  const speechRef = useRef(false);

  useEffect(() => {
    busyRef.current = input.busy;
    speakRef.current = input.speak;
  }, [input.busy, input.speak]);

  useEffect(() => {
    if (input.muted === undefined || input.muted === muted) {
      return;
    }
    writeMuted(input.muted);
    setMuted(input.muted);
    setEngineStatus(input.muted ? "off" : "starting");
    if (input.muted) {
      speechRef.current = false;
      setSpeechActive(false);
    }
  }, [input.muted, muted]);

  const apply = useCallback((event: { readonly now?: number; readonly transcript?: string }) => {
    const now = event.now ?? Date.now();
    const output = applyListenGate(gateRef.current, {
      now,
      busy: busyRef.current,
      ...(speechRef.current ? { speechActive: true } : {}),
      ...(event.transcript !== undefined ? { transcript: event.transcript } : {}),
    });
    gateRef.current = output.state;
    setAddressed(output.state.phase === "addressed");
    if (output.prompt !== undefined) {
      speakRef.current(output.prompt);
    }
  }, []);

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      apply({ now: Date.now() });
    }, tickMs);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, [apply]);

  useEffect(() => {
    if (muted) {
      return;
    }
    void retry;
    let cancelled = false;
    let session: ListenSession | undefined;
    let stream: MediaStream | undefined;
    void (async () => {
      try {
        stream = await requestMicrophone();
        if (cancelled) {
          stopMicrophone(stream);
          return;
        }
        await warmTranscriber();
        if (cancelled) {
          stopMicrophone(stream);
          return;
        }
        session = await createListenSession(
          {
            onSpeechStart: () => {
              speechRef.current = true;
              setSpeechActive(true);
              apply({ now: Date.now() });
            },
            onSpeechEnd: (audio) => {
              speechRef.current = false;
              setSpeechActive(false);
              if (busyRef.current) {
                apply({ now: Date.now() });
                return;
              }
              void transcribeUtterance(audio)
                .then((transcript) => {
                  if (cancelled || transcript.length === 0) {
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
          },
          stream,
        );
        stream = undefined;
        if (cancelled) {
          session.destroy();
          return;
        }
        await session.start();
        if (cancelled) {
          session.destroy();
          return;
        }
        setEngineStatus("on");
      } catch (cause) {
        if (stream !== undefined) {
          stopMicrophone(stream);
        }
        if (cancelled) {
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
      cancelled = true;
      session?.destroy();
    };
  }, [muted, retry]);

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
      setSpeechActive(false);
    }
  }, [engineStatus, muted]);

  return { muted, status, speechActive, addressed, toggleMuted };
};
