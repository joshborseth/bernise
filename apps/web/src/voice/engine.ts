import { getAudioContext, setPurrDucked, setSpeechLevel } from "../mascot/purr.ts";
import type { VoiceStatus } from "./state.ts";

const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
const speakSpeed = 1.05;

type KokoroModule = typeof import("kokoro-js");
type KokoroTTS = InstanceType<KokoroModule["KokoroTTS"]>;
type TextSplitterStream = InstanceType<KokoroModule["TextSplitterStream"]>;

type KokoroClip = {
  readonly audio: Float32Array | ArrayLike<number>;
  readonly sampling_rate: number;
};

type VoiceListeners = {
  readonly onSpeaking?: (speaking: boolean) => void;
  readonly onStatus?: (status: VoiceStatus) => void;
};

let listeners: VoiceListeners = {};
let tts: KokoroTTS | undefined;
let loadPromise: Promise<KokoroTTS> | undefined;
let splitter: TextSplitterStream | undefined;
let ensuring: Promise<TextSplitterStream> | undefined;
let generation = 0;
let currentVoice = "af_heart";
let analyser: AnalyserNode | undefined;
let levelRaf = 0;
const sources = new Set<AudioBufferSourceNode>();
let nextStart = 0;
let speaking = false;

export const setVoiceListeners = (next: VoiceListeners): void => {
  listeners = next;
};

const setStatus = (status: VoiceStatus): void => {
  listeners.onStatus?.(status);
};

const setSpeaking = (next: boolean): void => {
  if (speaking === next) {
    return;
  }
  speaking = next;
  setPurrDucked(next);
  listeners.onSpeaking?.(next);
  if (!next) {
    setSpeechLevel(0);
  }
};

const pickDevice = async (): Promise<{
  readonly device: "webgpu" | "wasm";
  readonly dtype: "fp32" | "q8";
}> => {
  try {
    const gpu = navigator.gpu;
    if (gpu !== undefined) {
      const adapter = await gpu.requestAdapter();
      if (adapter !== null) {
        return { device: "webgpu", dtype: "fp32" };
      }
    }
  } catch {
    // WASM fallback
  }
  return { device: "wasm", dtype: "q8" };
};

const loadTts = async (): Promise<KokoroTTS> => {
  if (tts !== undefined) {
    return tts;
  }
  if (loadPromise !== undefined) {
    return loadPromise;
  }
  setStatus("loading");
  loadPromise = (async () => {
    const kokoro = await import("kokoro-js");
    const device = await pickDevice();
    const loaded = await kokoro.KokoroTTS.from_pretrained(modelId, device);
    tts = loaded;
    setStatus("ready");
    return loaded;
  })().catch((error: unknown) => {
    loadPromise = undefined;
    setStatus("error");
    throw error;
  });
  return loadPromise;
};

export const warmupVoice = async (): Promise<void> => {
  await getAudioContext().resume();
  await loadTts();
};

const speechGraph = (): { readonly ctx: AudioContext; readonly analyser: AnalyserNode } => {
  const ctx = getAudioContext();
  if (analyser === undefined) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.connect(ctx.destination);
  }
  return { ctx, analyser };
};

const stopLevelWatch = (): void => {
  if (levelRaf !== 0) {
    cancelAnimationFrame(levelRaf);
    levelRaf = 0;
  }
  setSpeechLevel(0);
};

const watchLevel = (node: AnalyserNode): void => {
  const data = new Uint8Array(node.fftSize);
  const tick = () => {
    node.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    setSpeechLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.2));
    levelRaf = requestAnimationFrame(tick);
  };
  stopLevelWatch();
  levelRaf = requestAnimationFrame(tick);
};

const stopPlayback = (): void => {
  stopLevelWatch();
  for (const source of sources) {
    try {
      source.stop();
    } catch {
      // already stopped
    }
    source.disconnect();
  }
  sources.clear();
  nextStart = 0;
  setSpeaking(false);
};

const samplesFrom = (
  raw: KokoroClip,
): { readonly samples: Float32Array; readonly rate: number } => {
  const rate = raw.sampling_rate;
  const audio = raw.audio;
  if (audio instanceof Float32Array) {
    return { samples: audio, rate };
  }
  return { samples: Float32Array.from(audio), rate };
};

const enqueue = (raw: KokoroClip): void => {
  const { ctx, analyser: node } = speechGraph();
  const { samples, rate } = samplesFrom(raw);
  if (samples.length === 0) {
    return;
  }
  const buffer = ctx.createBuffer(1, samples.length, rate);
  buffer.copyToChannel(Float32Array.from(samples), 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(node);
  const startAt = Math.max(ctx.currentTime, nextStart);
  source.start(startAt);
  nextStart = startAt + buffer.duration;
  sources.add(source);
  setSpeaking(true);
  watchLevel(node);
  source.addEventListener("ended", () => {
    sources.delete(source);
    source.disconnect();
    if (sources.size === 0) {
      stopLevelWatch();
      setSpeaking(false);
    }
  });
};

const closeSplitter = (): void => {
  if (splitter === undefined) {
    return;
  }
  try {
    splitter.close();
  } catch {
    // already closed
  }
  splitter = undefined;
};

const readStream = async (
  token: number,
  stream: AsyncGenerator<{ readonly audio: KokoroClip }>,
): Promise<void> => {
  try {
    for await (const chunk of stream) {
      if (token !== generation) {
        continue;
      }
      enqueue(chunk.audio);
    }
  } catch {
    if (token === generation) {
      setStatus("error");
    }
  }
};

const ensureStream = async (voiceId: string): Promise<TextSplitterStream> => {
  if (splitter !== undefined && currentVoice === voiceId) {
    return splitter;
  }
  if (ensuring !== undefined) {
    const pending = await ensuring;
    if (splitter !== undefined && currentVoice === voiceId) {
      return pending;
    }
  }
  const work = (async () => {
    const model = await loadTts();
    closeSplitter();
    generation += 1;
    currentVoice = voiceId;
    const kokoro = await import("kokoro-js");
    const next = new kokoro.TextSplitterStream();
    splitter = next;
    const token = generation;
    const stream = model.stream(next, {
      voice: voiceId as "af_heart",
      speed: speakSpeed,
    });
    void readStream(token, stream);
    return next;
  })();
  ensuring = work;
  try {
    return await work;
  } finally {
    if (ensuring === work) {
      ensuring = undefined;
    }
  }
};

export const pushVoice = async (text: string, voiceId: string): Promise<void> => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return;
  }
  await getAudioContext().resume();
  const stream = await ensureStream(voiceId);
  stream.push(trimmed);
};

export const flushVoice = (): void => {
  splitter?.flush();
};

export const cancelVoice = (): void => {
  generation += 1;
  closeSplitter();
  stopPlayback();
};
