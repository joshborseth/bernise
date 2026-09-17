import { MicVAD } from "@ricky0123/vad-web";
import { createWakeListener, type WakeListener } from "./wake/engine.ts";

const vadAssetPath = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/";
const onnxWasmPath = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

const micConstraints: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  autoGainControl: true,
  noiseSuppression: true,
};

export type ListenSession = {
  readonly start: () => Promise<void>;
  readonly pause: () => Promise<void>;
  readonly destroy: () => void;
};

export type ListenSessionListeners = {
  readonly onSpeechStart: () => void;
  readonly onSpeechEnd: (audio: Float32Array) => void;
  readonly onWake: () => void;
};

export const requestMicrophone = (): Promise<MediaStream> =>
  navigator.mediaDevices.getUserMedia({ audio: micConstraints });

export const stopMicrophone = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) {
    track.stop();
  }
};

export const createListenSession = async (
  listeners: ListenSessionListeners,
  stream: MediaStream,
): Promise<ListenSession> => {
  let wake: WakeListener | undefined;
  try {
    wake = await createWakeListener(stream, listeners.onWake);
  } catch (cause) {
    console.warn("Bernise wake listener failed to start", cause);
  }
  const vad = await MicVAD.new({
    startOnLoad: false,
    baseAssetPath: vadAssetPath,
    onnxWASMBasePath: onnxWasmPath,
    getStream: async () => stream,
    pauseStream: async () => {},
    resumeStream: async () => stream,
    onSpeechStart: () => {
      listeners.onSpeechStart();
    },
    onSpeechEnd: (audio) => {
      listeners.onSpeechEnd(audio);
    },
  });
  return {
    start: async () => {
      await wake?.start();
      await vad.start();
    },
    pause: () => vad.pause(),
    destroy: () => {
      wake?.destroy();
      try {
        vad.destroy();
      } catch {
        // destroy throws if start never ran
      }
      stopMicrophone(stream);
    },
  };
};

export const isMicPermissionError = (cause: unknown): boolean => {
  if (!(cause instanceof Error)) {
    return false;
  }
  return (
    cause.name === "NotAllowedError" ||
    cause.name === "NotFoundError" ||
    cause.name === "SecurityError"
  );
};
