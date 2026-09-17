import { diffShell, emptyAttention, parseShell, type SpeakEvent } from "@bernise/attention";
import { classifyPrompt, parseThreadDetail, summarizeThread } from "@bernise/summary";
import { playMascotAction } from "./mascot/actions.ts";
import { hitTestBody } from "./mascot/hitTest.ts";
import type { BerniseMood } from "./mascot/mood.ts";
import { parsePerch, type Perch } from "./mascot/animation/perchPose.ts";

export type HostState = {
  readonly connected: boolean;
  readonly muted: boolean;
  readonly mood: BerniseMood;
  readonly speakKey: string;
  readonly perch: Perch;
};

export type HostStatePatch = Partial<HostState>;

const defaultState = (): HostState => ({
  connected: false,
  muted: false,
  mood: "idle",
  speakKey: "",
  perch: "none",
});

let hostState: HostState = defaultState();
let attention = emptyAttention();
const listeners = new Set<(state: HostState) => void>();

export const getHostState = (): HostState => hostState;

export const subscribeHost = (listener: (state: HostState) => void): (() => void) => {
  listeners.add(listener);
  listener(hostState);
  return () => {
    listeners.delete(listener);
  };
};

const emit = (): void => {
  for (const listener of listeners) {
    listener(hostState);
  }
};

export const setHostState = (patch: HostStatePatch): void => {
  hostState = {
    ...hostState,
    ...patch,
    perch: patch.perch === undefined ? hostState.perch : parsePerch(patch.perch),
  };
  emit();
};

export const resetAttention = (): void => {
  attention = emptyAttention();
};

export const pushShellJson = (json: string): string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return "[]";
  }
  const snapshot = parseShell(parsed);
  const next = diffShell(attention, snapshot);
  attention = next.state;
  return JSON.stringify(next.events);
};

const decodeBase64 = (base64: string): string => {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
};

export const pushShellBase64 = (base64: string): string => {
  try {
    return pushShellJson(decodeBase64(base64));
  } catch {
    return "[]";
  }
};

export const summarizeJson = (json: string): string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return "I could not read that thread.";
  }
  const detail = parseThreadDetail(parsed);
  if (detail === undefined) {
    return "I could not read that thread.";
  }
  return summarizeThread(detail);
};

export const summarizeBase64 = (base64: string): string => {
  try {
    return summarizeJson(decodeBase64(base64));
  } catch {
    return "I could not read that thread.";
  }
};

export type PetAction = "litter" | "sleep" | "wake";

const petActionListeners = new Set<(action: PetAction) => void>();

export const subscribePetAction = (listener: (action: PetAction) => void): (() => void) => {
  petActionListeners.add(listener);
  return () => {
    petActionListeners.delete(listener);
  };
};

export const requestAction = (action: string): void => {
  if (action !== "litter" && action !== "sleep" && action !== "wake") {
    return;
  }
  for (const listener of petActionListeners) {
    listener(action);
  }
  playMascotAction(action);
};

export const nativeAvailable = (): boolean => window.webkit?.messageHandlers?.bernise !== undefined;

export const postNative = (message: unknown): void => {
  window.webkit?.messageHandlers?.bernise?.postMessage(message);
};

export const onAddressedPrompt = (text: string): void => {
  postNative({ type: "transcript", text, intent: classifyPrompt(text) });
};

export const playAction = (value: unknown): void => {
  playMascotAction(value);
};

export type HostPointer = {
  readonly clientX: number;
  readonly clientY: number;
  readonly viewWidth: number;
  readonly viewHeight: number;
};

let hostPointer: HostPointer | undefined;
const pointerListeners = new Set<(pointer: HostPointer) => void>();

const positiveSize = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;

const viewportFallback = (): number => {
  const width = globalThis.innerWidth;
  return typeof width === "number" && Number.isFinite(width) && width > 0 ? width : 1;
};

export const setPointer = (input: {
  readonly clientX: number;
  readonly clientY: number;
  readonly viewWidth?: number;
  readonly viewHeight?: number;
}): void => {
  if (!Number.isFinite(input.clientX) || !Number.isFinite(input.clientY)) {
    return;
  }
  const height = globalThis.innerHeight;
  const next: HostPointer = {
    clientX: input.clientX,
    clientY: input.clientY,
    viewWidth: positiveSize(input.viewWidth, viewportFallback()),
    viewHeight: positiveSize(
      input.viewHeight,
      typeof height === "number" && Number.isFinite(height) && height > 0
        ? height
        : viewportFallback(),
    ),
  };
  hostPointer = next;
  for (const listener of pointerListeners) {
    listener(next);
  }
};

export const subscribePointer = (listener: (pointer: HostPointer) => void): (() => void) => {
  pointerListeners.add(listener);
  if (hostPointer !== undefined) {
    listener(hostPointer);
  }
  return () => {
    pointerListeners.delete(listener);
  };
};

export const installHost = (): void => {
  window.__bernise = {
    setHostState,
    playAction,
    setPointer,
    pushShellJson,
    pushShellBase64,
    summarizeJson,
    summarizeBase64,
    resetAttention,
    hitTest: hitTestBody,
    requestAction,
  };
  postNative({ type: "ready" });
};

export type { SpeakEvent };
