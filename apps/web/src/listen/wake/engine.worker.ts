import * as ort from "onnxruntime-web";
import {
  defaultKeywordFrames,
  embeddingDim,
  melWindowFrames,
  transformMelFrames,
} from "./features.ts";
import { createWakeStream } from "./stream.ts";

type WarmIn = {
  readonly type: "warm";
  readonly models: {
    readonly mel: string;
    readonly embed: string;
    readonly keyword: string;
  };
  readonly threshold: number;
  readonly cooldownMs: number;
};
type FrameIn = { readonly type: "frame"; readonly pcm: Int16Array };
type WorkerIn = WarmIn | FrameIn;

type ReadyOut = { readonly type: "ready" };
type UnavailableOut = { readonly type: "unavailable"; readonly reason: string };
type WakeOut = { readonly type: "wake"; readonly score: number };
type ErrorOut = { readonly type: "error"; readonly message: string };

const post = (data: ReadyOut | UnavailableOut | WakeOut | ErrorOut): void => {
  // Worker.postMessage has no targetOrigin; oxlint's Window signature does not apply.
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  (self as unknown as { readonly postMessage: (value: unknown) => void }).postMessage(data);
};

const asFloat32 = (data: unknown): Float32Array => {
  if (data instanceof Float32Array) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return Float32Array.from(data as unknown as ArrayLike<number>);
  }
  return new Float32Array();
};

const tensorScore = (data: Float32Array): number => Number(data[0] ?? 0);

const keywordFramesFrom = (metadata: ort.InferenceSession.ValueMetadata | undefined): number => {
  if (metadata === undefined || metadata.isTensor !== true) {
    return defaultKeywordFrames;
  }
  const frames = metadata.shape[1];
  return typeof frames === "number" && frames > 0 ? frames : defaultKeywordFrames;
};

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/";

let queue: Promise<void> = Promise.resolve();
let onFrame: ((pcm: Int16Array) => Promise<void>) | undefined;

addEventListener("message", (event: MessageEvent<WorkerIn>) => {
  const message = event.data;
  if (message.type === "warm") {
    queue = queue.then(() => warm(message));
    return;
  }
  const pcm = message.pcm;
  queue = queue.then(() => onFrame?.(pcm)).then(() => undefined);
});

const warm = async (config: WarmIn): Promise<void> => {
  try {
    const keywordResponse = await fetch(config.models.keyword);
    if (keywordResponse.status === 404) {
      post({
        type: "unavailable",
        reason: "Drop hey_bernise.onnx into apps/web/public/wake to enable wake.",
      });
      return;
    }
    if (!keywordResponse.ok) {
      throw new Error(`Wake keyword model failed to load (${String(keywordResponse.status)}).`);
    }
    const [mel, embed, keyword] = await Promise.all([
      ort.InferenceSession.create(config.models.mel),
      ort.InferenceSession.create(config.models.embed),
      ort.InferenceSession.create(await keywordResponse.arrayBuffer()),
    ]);
    const keywordInput = keyword.inputNames[0] ?? "input";
    const keywordFrames = keywordFramesFrom(keyword.inputMetadata[0]);
    const stream = createWakeStream({
      melspectrogram: async (pcm) => {
        const inputName = mel.inputNames[0] ?? "input";
        const tensor = new ort.Tensor(
          "float32",
          Float32Array.from(pcm, (sample) => sample),
          [1, pcm.length],
        );
        const result = await mel.run({ [inputName]: tensor });
        const output = result[mel.outputNames[0] ?? "output"];
        if (output === undefined) {
          return [];
        }
        return transformMelFrames(asFloat32(output.data));
      },
      embedding: async (window) => {
        const flat = new Float32Array(melWindowFrames * 32);
        for (let i = 0; i < window.length; i += 1) {
          const row = window[i];
          if (row === undefined) {
            continue;
          }
          flat.set(row.slice(0, 32), i * 32);
        }
        const inputName = embed.inputNames[0] ?? "input_1";
        const tensor = new ort.Tensor("float32", flat, [1, melWindowFrames, 32, 1]);
        const result = await embed.run({ [inputName]: tensor });
        const output = result[embed.outputNames[0] ?? "output"];
        if (output === undefined) {
          return Array.from({ length: embeddingDim }, () => 0);
        }
        return Array.from(asFloat32(output.data).slice(0, embeddingDim));
      },
    });

    let lastWake = 0;
    let scores = 0;
    onFrame = async (pcm) => {
      const processed = await stream.push(pcm);
      if (processed === 0) {
        return;
      }
      const tensor = new ort.Tensor("float32", stream.features(keywordFrames), [
        1,
        keywordFrames,
        embeddingDim,
      ]);
      const result = await keyword.run({ [keywordInput]: tensor });
      const output = result[keyword.outputNames[0] ?? "output"];
      const score = output === undefined ? 0 : tensorScore(asFloat32(output.data));
      scores += 1;
      if (scores <= 5 || score < config.threshold) {
        return;
      }
      const now = Date.now();
      if (now - lastWake < config.cooldownMs) {
        return;
      }
      lastWake = now;
      post({ type: "wake", score });
    };
    post({ type: "ready" });
  } catch (cause) {
    post({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
