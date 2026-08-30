import { audioContext } from "../mascot/audio/context.ts";
import { splitForTts, ttsChunkLimit } from "./speakable.ts";
import { concatBytes, pcmS16leToF32, tryParseWavHeader, type WavFormat } from "./wav.ts";

type VoiceListeners = {
  readonly onBusy?: (busy: boolean) => void;
};

let listeners: VoiceListeners = {};
let generation = 0;
let pending: Array<string> = [];
let currentSources: Array<AudioBufferSourceNode> = [];
let inflight: AbortController | undefined;
let busy = false;
let runner: Promise<void> | undefined;
let playing = 0;
let playAt = 0;
let output: GainNode | undefined;

export const setVoiceListeners = (next: VoiceListeners): void => {
  listeners = next;
};

export const isVoiceBusy = (): boolean => busy;

const setBusy = (next: boolean): void => {
  if (busy === next) {
    return;
  }
  busy = next;
  listeners.onBusy?.(next);
};

const maybeIdle = (): void => {
  if (pending.length === 0 && playing === 0 && runner === undefined) {
    inflight = undefined;
    setBusy(false);
  }
};

const stopCurrent = (): void => {
  for (const source of currentSources) {
    try {
      source.stop();
    } catch {
      // already stopped
    }
  }
  currentSources = [];
  playing = 0;
  playAt = 0;
  if (output !== undefined) {
    try {
      output.disconnect();
    } catch {
      // already disconnected
    }
    output = undefined;
  }
};

export const cancelVoice = (): void => {
  generation += 1;
  inflight?.abort();
  inflight = undefined;
  pending = [];
  stopCurrent();
  setBusy(false);
};

const fetchSpeak = async (text: string, signal: AbortSignal): Promise<Response> => {
  const response = await fetch("/voice/speak", {
    method: "POST",
    headers: {
      accept: "audio/wav",
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail.trim() || `TTS HTTP ${String(response.status)}`);
  }
  return response;
};

const ensureOutput = (): GainNode => {
  if (output !== undefined) {
    return output;
  }
  const ctx = audioContext();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  output = gain;
  return gain;
};

const schedulePcm = (pcm: Float32Array, format: WavFormat, gen: number): void => {
  if (gen !== generation || pcm.length === 0) {
    return;
  }
  const ctx = audioContext();
  const buffer = ctx.createBuffer(1, pcm.length, format.sampleRate);
  buffer.getChannelData(0).set(pcm);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ensureOutput());
  const now = ctx.currentTime;
  if (playAt < now + 0.03) {
    playAt = now + 0.03;
  }
  currentSources.push(source);
  playing += 1;
  source.addEventListener(
    "ended",
    () => {
      playing = Math.max(0, playing - 1);
      currentSources = currentSources.filter((item) => item !== source);
      maybeIdle();
    },
    { once: true },
  );
  source.start(playAt);
  playAt += buffer.duration;
};

const chunkBytes = (format: WavFormat): number =>
  Math.max(format.channels * 2, Math.round(format.sampleRate * 0.1) * format.channels * 2);

const emitPcm = (bytes: Uint8Array, format: WavFormat, gen: number, flush: boolean): Uint8Array => {
  const frame = Math.max(1, format.channels) * 2;
  const usable = bytes.byteLength - (bytes.byteLength % frame);
  if (usable < frame) {
    return bytes;
  }
  const chunk = chunkBytes(format);
  let offset = 0;
  const limit = flush ? usable : usable - (usable % chunk);
  while (offset < limit) {
    const take = flush ? limit - offset : chunk;
    if (take < frame) {
      break;
    }
    if (!flush && take < chunk) {
      break;
    }
    const slice = bytes.subarray(offset, offset + take);
    if (format.bitsPerSample === 16 && format.channels === 1) {
      schedulePcm(pcmS16leToF32(slice), format, gen);
    }
    offset += take;
    if (flush) {
      break;
    }
  }
  return bytes.subarray(offset);
};

const playStream = async (response: Response, gen: number, signal: AbortSignal): Promise<void> => {
  const ctx = audioContext();
  await ctx.resume();
  const reader = response.body?.getReader();
  if (reader === undefined) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const format = tryParseWavHeader(bytes);
    if (format === undefined || gen !== generation) {
      return;
    }
    emitPcm(bytes.subarray(format.dataOffset), format, gen, true);
    return;
  }

  let pendingBytes = new Uint8Array(0);
  let format: WavFormat | undefined;
  try {
    for (;;) {
      if (signal.aborted || gen !== generation) {
        await reader.cancel().catch(() => undefined);
        return;
      }
      const { done, value } = await reader.read();
      if (value !== undefined && value.byteLength > 0) {
        pendingBytes = concatBytes(pendingBytes, Uint8Array.from(value));
      }
      if (format === undefined) {
        const parsed = tryParseWavHeader(pendingBytes);
        if (parsed !== undefined) {
          format = parsed;
          pendingBytes = new Uint8Array(pendingBytes.subarray(parsed.dataOffset));
        } else if (!done) {
          continue;
        } else {
          console.warn("Bernise voice clip failed", new Error("invalid WAV header"));
          return;
        }
      }
      pendingBytes = new Uint8Array(emitPcm(pendingBytes, format, gen, done));
      if (done) {
        return;
      }
    }
  } catch (error: unknown) {
    if (signal.aborted || gen !== generation) {
      return;
    }
    throw error;
  }
};

const takeBatch = (): string | undefined => {
  if (pending.length === 0) {
    return undefined;
  }
  const parts: Array<string> = [];
  let length = 0;
  while (pending.length > 0) {
    const next = pending[0];
    if (next === undefined) {
      break;
    }
    const extra = parts.length === 0 ? next.length : next.length + 1;
    if (parts.length > 0 && length + extra > ttsChunkLimit) {
      break;
    }
    pending.shift();
    parts.push(next);
    length += extra;
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(" ");
};

const runQueue = async (): Promise<void> => {
  try {
    while (true) {
      const gen = generation;
      if (inflight === undefined) {
        inflight = new AbortController();
      }
      const batch = takeBatch();
      if (batch === undefined) {
        maybeIdle();
        return;
      }
      setBusy(true);
      try {
        const response = await fetchSpeak(batch, inflight.signal);
        if (gen !== generation) {
          continue;
        }
        await playStream(response, gen, inflight.signal);
      } catch (error: unknown) {
        if (gen !== generation || inflight.signal.aborted) {
          continue;
        }
        console.warn("Bernise voice clip failed", error);
      }
    }
  } finally {
    runner = undefined;
    if (pending.length > 0) {
      runner = runQueue();
    } else {
      maybeIdle();
    }
  }
};

const kick = (): void => {
  runner ??= runQueue();
};

export const enqueueVoice = (text: string): void => {
  const pieces = splitForTts(text);
  if (pieces.length === 0) {
    return;
  }
  pending.push(...pieces);
  setBusy(true);
  kick();
};
