export const wakeSampleRate = 16_000;
export const wakeFrameSamples = 1_280;
export const melWindowFrames = 76;
export const melStepFrames = 8;
export const embeddingDim = 96;
export const defaultKeywordFrames = 16;

export const transformMel = (value: number): number => value / 10 + 2;

export const melWindows = (
  frames: ReadonlyArray<ReadonlyArray<number>>,
  window: number = melWindowFrames,
  step: number = melStepFrames,
): ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>> => {
  const windows: Array<ReadonlyArray<ReadonlyArray<number>>> = [];
  for (let start = 0; start + window <= frames.length; start += step) {
    windows.push(frames.slice(start, start + window));
  }
  return windows;
};

export const keywordWindow = (
  embeddings: ReadonlyArray<ReadonlyArray<number>>,
  frames: number,
): Float32Array => {
  const start = Math.max(0, embeddings.length - frames);
  const window = embeddings.slice(start);
  const out = new Float32Array(frames * embeddingDim);
  const offset = frames - window.length;
  for (let i = 0; i < window.length; i += 1) {
    const row = window[i];
    if (row === undefined) {
      continue;
    }
    out.set(row.slice(0, embeddingDim), (offset + i) * embeddingDim);
  }
  return out;
};

export const chunkWakePcm = (
  remainder: ReadonlyArray<number>,
  incoming: ReadonlyArray<number>,
  frameSize: number = wakeFrameSamples,
): {
  readonly frames: ReadonlyArray<ReadonlyArray<number>>;
  readonly remainder: ReadonlyArray<number>;
} => {
  const samples = remainder.length === 0 ? incoming : [...remainder, ...incoming];
  const frames: Array<ReadonlyArray<number>> = [];
  let offset = 0;
  while (offset + frameSize <= samples.length) {
    frames.push(samples.slice(offset, offset + frameSize));
    offset += frameSize;
  }
  return { frames, remainder: samples.slice(offset) };
};

export const resampleToWakeRate = (input: Float32Array, inputRate: number): Float32Array => {
  if (inputRate === wakeSampleRate) {
    return input;
  }
  const outLen = Math.floor((input.length * wakeSampleRate) / inputRate);
  const out = new Float32Array(outLen);
  if (outLen === 0 || input.length === 0) {
    return out;
  }
  const ratio = inputRate / wakeSampleRate;
  const last = input.length - 1;
  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio;
    const i0 = Math.min(Math.floor(src), last);
    const i1 = Math.min(i0 + 1, last);
    const frac = src - i0;
    const a = input[i0] ?? 0;
    const b = input[i1] ?? 0;
    out[i] = a * (1 - frac) + b * frac;
  }
  return out;
};

export const floatToInt16 = (input: Float32Array): Int16Array => {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = input[i] ?? 0;
    out[i] = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
  }
  return out;
};

export const transformMelFrames = (
  values: ArrayLike<number>,
  bins: number = 32,
): ReadonlyArray<ReadonlyArray<number>> => {
  const frames: Array<ReadonlyArray<number>> = [];
  for (let offset = 0; offset + bins <= values.length; offset += bins) {
    const row: number[] = [];
    for (let bin = 0; bin < bins; bin += 1) {
      row.push(transformMel(values[offset + bin] ?? 0));
    }
    frames.push(row);
  }
  return frames;
};
