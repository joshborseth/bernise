export type ListenPhase = "idle" | "addressed";

export type ListenGateState = {
  readonly phase: ListenPhase;
  readonly lockUntil: number;
};

export type ListenGateInput = {
  readonly now: number;
  readonly busy: boolean;
  readonly speechActive?: boolean;
  readonly transcript?: string;
};

export type ListenGateOutput = {
  readonly state: ListenGateState;
  readonly prompt: string | undefined;
};

export const listenLockMs = 8_000;

export const idleListenGate: ListenGateState = {
  phase: "idle",
  lockUntil: 0,
};

const wakePattern = /^hey[,.]?\s+(?:bernise|bernice|bernie)(?:['’]s)?(?:\s*[,.!?]+)?(?:\s+|$)/i;

export const applyListenGate = (
  state: ListenGateState,
  input: ListenGateInput,
): ListenGateOutput => {
  const held = holdLock(state, input);
  const transcript = input.transcript?.trim();
  if (transcript === undefined || transcript.length === 0) {
    return { state: expireLock(held, input), prompt: undefined };
  }
  if (input.busy) {
    return { state: held, prompt: undefined };
  }
  const current = expireLock(held, input);
  const wake = stripWake(transcript);
  if (current.phase === "idle") {
    if (!wake.matched) {
      return { state: current, prompt: undefined };
    }
    return openLock(input.now, nonempty(wake.remainder));
  }
  const prompt = wake.matched ? wake.remainder : transcript;
  return openLock(input.now, nonempty(prompt));
};

const holdLock = (state: ListenGateState, input: ListenGateInput): ListenGateState => {
  if (state.phase !== "addressed") {
    return state;
  }
  if (!input.busy && input.speechActive !== true) {
    return state;
  }
  return {
    phase: "addressed",
    lockUntil: Math.max(state.lockUntil, input.now + listenLockMs),
  };
};

const expireLock = (state: ListenGateState, input: ListenGateInput): ListenGateState => {
  if (state.phase !== "addressed" || input.busy || input.now < state.lockUntil) {
    return state;
  }
  return idleListenGate;
};

const openLock = (now: number, prompt: string | undefined): ListenGateOutput => ({
  state: { phase: "addressed", lockUntil: now + listenLockMs },
  prompt,
});

const nonempty = (value: string): string | undefined => (value.length > 0 ? value : undefined);

const stripWake = (
  transcript: string,
): { readonly matched: boolean; readonly remainder: string } => {
  const match = wakePattern.exec(transcript);
  if (match === null || match.index !== 0) {
    return { matched: false, remainder: transcript };
  }
  return { matched: true, remainder: transcript.slice(match[0].length).trim() };
};
