import { floatToInt16, resampleToWakeRate, wakeSampleRate } from "./features.ts";

export type WakeCapture = {
  readonly start: () => Promise<void>;
  readonly destroy: () => void;
};

export const createWakeCapture = async (
  stream: MediaStream,
  onPcm: (pcm: Int16Array) => void,
): Promise<WakeCapture> => {
  const context = new AudioContext({ sampleRate: wakeSampleRate });
  const source = context.createMediaStreamSource(stream);
  const mute = context.createGain();
  mute.gain.value = 0;

  const ingest = (samples: Float32Array): void => {
    onPcm(floatToInt16(resampleToWakeRate(samples, context.sampleRate)));
  };

  let node: AudioNode;
  try {
    await context.audioWorklet.addModule(new URL("./capture.worklet.js", import.meta.url));
    const worklet = new AudioWorkletNode(context, "bernise-wake-capture");
    worklet.port.addEventListener("message", (event: MessageEvent<Float32Array>) => {
      ingest(event.data);
    });
    worklet.port.start();
    node = worklet;
  } catch {
    const processor = context.createScriptProcessor(1024, 1, 1);
    processor.addEventListener("audioprocess", (event) => {
      ingest(event.inputBuffer.getChannelData(0));
    });
    node = processor;
  }

  source.connect(node);
  node.connect(mute);
  mute.connect(context.destination);

  return {
    start: async () => {
      if (context.state === "suspended") {
        await context.resume();
      }
    },
    destroy: () => {
      source.disconnect();
      node.disconnect();
      mute.disconnect();
      void context.close();
    },
  };
};
