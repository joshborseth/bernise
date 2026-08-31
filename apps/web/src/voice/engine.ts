import { audioContext } from "../mascot/audio/context.ts";
import { splitForTts, ttsChunkLimit } from "./speakable.ts";
import type { VoiceReveal } from "./state.ts";
import {
  concatBytes,
  pcmS16leToF32,
  trimLeadingSilence,
  tryParseWavHeader,
  type WavFormat,
} from "./wav.ts";

export const textLeadMs = 100;
const scheduleLeadS = 0.03;

type PendingClip = {
  readonly text: string;
  readonly reveal: VoiceReveal | undefined;
};

type VoiceListeners = {
  readonly onBusy?: (busy: boolean) => void;
  readonly onPlaybackStart?: (reveal: VoiceReveal) => void;
};

let listeners: VoiceListeners = {};
let generation = 0;
let pending: Array<PendingClip> = [];
let currentSources: Array<AudioBufferSourceNode> = [];
let inflight: AbortController | undefined;
let busy = false;
let runner: Promise<void> | undefined;
let playing = 0;
let playAt = 0;
let clipsScheduled = 0;
let output: GainNode | undefined;
let kickQueued = false;
const leadTimers = new Set<ReturnType<typeof setTimeout>>();

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

const syncBusy = (): void => {
  setBusy(playing > 0);
};

const maybeIdle = (): void => {
  if (pending.length === 0 && playing === 0 && runner === undefined) {
    inflight = undefined;
  }
  syncBusy();
};

const clearLeadTimers = (): void => {
  for (const timer of leadTimers) {
    clearTimeout(timer);
  }
  leadTimers.clear();
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
  clipsScheduled = 0;
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
  kickQueued = false;
  clearLeadTimers();
  stopCurrent();
  setBusy(false);
};

export const revealVoiceNow = (reveal: VoiceReveal): void => {
  listeners.onPlaybackStart?.(reveal);
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

const armReveal = (reveal: VoiceReveal | undefined, startAt: number, gen: number): void => {
  if (reveal === undefined || reveal.until <= 0) {
    return;
  }
  const delayMs = Math.max(0, (startAt - audioContext().currentTime) * 1000) + textLeadMs;
  const timer = setTimeout(() => {
    leadTimers.delete(timer);
    if (gen !== generation) {
      return;
    }
    listeners.onPlaybackStart?.(reveal);
  }, delayMs);
  leadTimers.add(timer);
};

const schedulePcm = (
  pcm: Float32Array,
  format: WavFormat,
  gen: number,
  reveal: VoiceReveal | undefined,
): boolean => {
  if (gen !== generation || pcm.length === 0) {
    return false;
  }
  const ctx = audioContext();
  const buffer = ctx.createBuffer(1, pcm.length, format.sampleRate);
  buffer.getChannelData(0).set(pcm);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ensureOutput());
  const now = ctx.currentTime;
  if (playAt < now + scheduleLeadS) {
    playAt = now + scheduleLeadS;
  }
  const startAt = playAt;
  currentSources.push(source);
  playing += 1;
  syncBusy();
  source.addEventListener(
    "ended",
    () => {
      playing = Math.max(0, playing - 1);
      currentSources = currentSources.filter((item) => item !== source);
      maybeIdle();
    },
    { once: true },
  );
  source.start(startAt);
  playAt += buffer.duration;
  armReveal(reveal, startAt, gen);
  return true;
};

const collectWav = async (
  response: Response,
  gen: number,
  signal: AbortSignal,
): Promise<Uint8Array | undefined> => {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return new Uint8Array(await response.arrayBuffer());
  }

  let pendingBytes = new Uint8Array(0);
  try {
    for (;;) {
      if (signal.aborted || gen !== generation) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      const { done, value } = await reader.read();
      if (value !== undefined && value.byteLength > 0) {
        pendingBytes = concatBytes(pendingBytes, Uint8Array.from(value));
      }
      if (done) {
        return pendingBytes;
      }
    }
  } catch (error: unknown) {
    if (signal.aborted || gen !== generation) {
      return undefined;
    }
    throw error;
  }
};

const playBuffered = async (
  response: Response,
  gen: number,
  signal: AbortSignal,
  reveal: VoiceReveal | undefined,
): Promise<boolean> => {
  const ctx = audioContext();
  await ctx.resume();
  const bytes = await collectWav(response, gen, signal);
  if (bytes === undefined || gen !== generation) {
    return false;
  }
  const format = tryParseWavHeader(bytes);
  if (format === undefined) {
    console.warn("Bernise voice clip failed", new Error("invalid WAV header"));
    return false;
  }
  if (format.bitsPerSample !== 16 || format.channels !== 1) {
    return false;
  }
  const raw = pcmS16leToF32(bytes.subarray(format.dataOffset));
  const pcm = clipsScheduled > 0 ? trimLeadingSilence(raw, format.sampleRate) : raw;
  const scheduled = schedulePcm(pcm, format, gen, reveal);
  if (scheduled) {
    clipsScheduled += 1;
  }
  return scheduled;
};

const takeBatch = (): PendingClip | undefined => {
  if (pending.length === 0) {
    return undefined;
  }
  const parts: Array<string> = [];
  let length = 0;
  let reveal: VoiceReveal | undefined;
  while (pending.length > 0) {
    const next = pending[0];
    if (next === undefined) {
      break;
    }
    const extra = parts.length === 0 ? next.text.length : next.text.length + 1;
    if (parts.length > 0 && length + extra > ttsChunkLimit) {
      break;
    }
    pending.shift();
    parts.push(next.text);
    if (reveal === undefined && next.reveal !== undefined) {
      reveal = next.reveal;
    }
    length += extra;
  }
  if (parts.length === 0) {
    return undefined;
  }
  return { text: parts.join(" "), reveal };
};

const failOpen = (reveal: VoiceReveal | undefined): void => {
  if (reveal !== undefined) {
    revealVoiceNow(reveal);
  }
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
      try {
        const response = await fetchSpeak(batch.text, inflight.signal);
        if (gen !== generation) {
          continue;
        }
        const started = await playBuffered(response, gen, inflight.signal, batch.reveal);
        if (!started && gen === generation) {
          failOpen(batch.reveal);
        }
      } catch (error: unknown) {
        if (gen !== generation || inflight.signal.aborted) {
          continue;
        }
        failOpen(batch.reveal);
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

const scheduleKick = (): void => {
  if (kickQueued) {
    return;
  }
  kickQueued = true;
  queueMicrotask(() => {
    kickQueued = false;
    kick();
  });
};

export type EnqueueVoiceOptions = {
  readonly reveal?: VoiceReveal;
};

export const enqueueVoice = (text: string, options?: EnqueueVoiceOptions): void => {
  const pieces = splitForTts(text);
  if (pieces.length === 0) {
    if (options?.reveal !== undefined) {
      revealVoiceNow(options.reveal);
    }
    return;
  }
  for (const [index, piece] of pieces.entries()) {
    pending.push({
      text: piece,
      reveal: index === 0 ? options?.reveal : undefined,
    });
  }
  scheduleKick();
};
