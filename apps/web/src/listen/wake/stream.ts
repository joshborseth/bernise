import {
  chunkWakePcm,
  defaultKeywordFrames,
  keywordWindow,
  melStepFrames,
  melWindowFrames,
  wakeFrameSamples,
  wakeSampleRate,
} from "./features.ts";

export type WakeStreamCompute = {
  readonly melspectrogram: (
    pcm: Int16Array,
  ) => ReadonlyArray<ReadonlyArray<number>> | Promise<ReadonlyArray<ReadonlyArray<number>>>;
  readonly embedding: (
    window: ReadonlyArray<ReadonlyArray<number>>,
  ) => ReadonlyArray<number> | Promise<ReadonlyArray<number>>;
};

export type WakeStream = {
  readonly push: (pcm: Int16Array) => Promise<number>;
  readonly features: (frames?: number) => Float32Array;
  readonly embeddingCount: () => number;
};

const rawMaxSamples = wakeSampleRate * 10;
const melOverlapSamples = 160 * 3;
const melMaxFrames = 10 * 97;
const embeddingMaxFrames = 120;

export const createWakeStream = (compute: WakeStreamCompute): WakeStream => {
  let remainder: ReadonlyArray<number> = [];
  let raw: number[] = [];
  const mels: Array<ReadonlyArray<number>> = Array.from({ length: melWindowFrames }, () =>
    Array.from({ length: 32 }, () => 1),
  );
  const embeddings: Array<ReadonlyArray<number>> = [];

  const push = async (pcm: Int16Array): Promise<number> => {
    const chunked = chunkWakePcm(remainder, Array.from(pcm));
    remainder = chunked.remainder;
    if (chunked.frames.length === 0) {
      return 0;
    }
    let processed = 0;
    for (const frame of chunked.frames) {
      raw.push(...frame);
      processed += frame.length;
    }
    if (raw.length > rawMaxSamples) {
      raw = raw.slice(-rawMaxSamples);
    }
    const pcmForMel = raw.slice(-(processed + melOverlapSamples));
    mels.push(...(await compute.melspectrogram(Int16Array.from(pcmForMel))));
    if (mels.length > melMaxFrames) {
      mels.splice(0, mels.length - melMaxFrames);
    }
    const chunks = processed / wakeFrameSamples;
    for (let i = chunks - 1; i >= 0; i -= 1) {
      const ndx = i === 0 ? mels.length : mels.length - melStepFrames * i;
      const window = mels.slice(ndx - melWindowFrames, ndx);
      if (window.length === melWindowFrames) {
        embeddings.push(await compute.embedding(window));
      }
    }
    if (embeddings.length > embeddingMaxFrames) {
      embeddings.splice(0, embeddings.length - embeddingMaxFrames);
    }
    return processed;
  };

  return {
    push,
    features: (frames = defaultKeywordFrames) => keywordWindow(embeddings, frames),
    embeddingCount: () => embeddings.length,
  };
};
