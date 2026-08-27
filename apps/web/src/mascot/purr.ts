const fadeSeconds = 0.08;
const lookaheadSeconds = 2;
const scheduleEveryMs = 180;

let shared: AudioContext | undefined;

function audioContext(): AudioContext {
  shared ??= new AudioContext();
  return shared;
}

function mix(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function brownNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < samples.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    samples[i] = last * 4.2;
  }
  return buffer;
}

type BurstKind = "in" | "out";

type Burst = {
  readonly start: number;
  readonly duration: number;
  readonly attack: number;
  readonly release: number;
  readonly peak: number;
  readonly hz: number;
};

type Session = {
  readonly startedAt: number;
  readonly audioOffset: number;
  readonly baseHz: number;
  nextKind: BurstKind;
  readonly period: number;
  cursor: number;
  bursts: Array<Burst>;
};

let active: Session | null = null;

function nextBurst(session: Session): Burst {
  const kind = session.nextKind;
  session.nextKind = kind === "in" ? "out" : "in";

  const duration = session.period * (kind === "in" ? mix(0.94, 1) : mix(1, 1.06));
  const attack = mix(0.045, 0.055);
  const release = mix(0.045, 0.055);
  const peak = kind === "in" ? mix(0.78, 0.88) : mix(0.92, 1);

  const hz = session.baseHz + (kind === "in" ? mix(0.4, 1.5) : mix(-1.5, -0.4)) + mix(-0.3, 0.3);

  const burst: Burst = {
    start: session.cursor,
    duration,
    attack,
    release,
    peak,
    hz,
  };

  const gap = kind === "in" ? mix(0.04, 0.07) : mix(0.08, 0.12);
  session.cursor += duration + gap;
  session.bursts.push(burst);
  return burst;
}

function envelopeAt(burst: Burst, t: number): number {
  const local = t - burst.start;
  if (local <= 0 || local >= burst.duration) {
    return 0;
  }
  if (local < burst.attack) {
    return burst.peak * (local / burst.attack);
  }
  const releaseAt = burst.duration - burst.release;
  if (local > releaseAt) {
    return burst.peak * (1 - (local - releaseAt) / burst.release);
  }
  return burst.peak;
}

function prune(session: Session, now: number): void {
  const keep = session.bursts.findIndex((burst) => burst.start + burst.duration > now - 0.25);
  if (keep === -1) {
    session.bursts.length = 0;
  } else if (keep > 0) {
    session.bursts.splice(0, keep);
  }
}

/** Visual rumble reads this each frame. Amp is 0 in the gaps between bursts. */
export function purrBurst(): { amp: number; hz: number } {
  const session = active;
  if (session === null) {
    return { amp: 0, hz: 26 };
  }
  const t = (performance.now() - session.startedAt) / 1000;
  let amp = 0;
  let hz = session.baseHz;
  for (const burst of session.bursts) {
    if (t >= burst.start) {
      hz = burst.hz;
    }
    const next = envelopeAt(burst, t);
    if (next > amp) {
      amp = next;
    }
  }
  return { amp, hz };
}

/** A short snap for the over-pet chomp. */
export function playChomp(): void {
  const ctx = audioContext();
  void ctx.resume();
  const now = ctx.currentTime;
  const dur = 0.08;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.2, now);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(210, now);
  osc.frequency.exponentialRampToValueAtTime(62, now + dur);
  osc.connect(master);

  const click = ctx.createOscillator();
  click.type = "square";
  click.frequency.value = 90;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.08, now);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
  click.connect(clickGain);
  clickGain.connect(master);

  osc.start(now);
  click.start(now);
  osc.stop(now + dur);
  click.stop(now + dur);

  window.setTimeout(
    () => {
      osc.disconnect();
      click.disconnect();
      clickGain.disconnect();
      master.disconnect();
    },
    dur * 1000 + 24,
  );
}

/** Starts a bursting cat purr. The returned function fades it out and tears the graph down. */
export function startPurr(): () => void {
  const ctx = audioContext();
  void ctx.resume();

  const laziness = mix(0, 1);
  const session: Session = {
    startedAt: performance.now(),
    audioOffset: ctx.currentTime,
    baseHz: mix(23.5, 27.5),
    nextKind: Math.random() < 0.5 ? "in" : "out",
    period: mix(0.72, 0.88) + laziness * 0.18,
    cursor: 0,
    bursts: [],
  };
  active = session;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.34, ctx.currentTime + fadeSeconds);
  master.connect(ctx.destination);

  const burstGain = ctx.createGain();
  burstGain.gain.value = 0;
  burstGain.connect(master);

  const noise = ctx.createBufferSource();
  noise.buffer = brownNoiseBuffer(ctx);
  noise.loop = true;

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 38;

  const chest = ctx.createBiquadFilter();
  chest.type = "bandpass";
  chest.frequency.value = 125;
  chest.Q.value = 2.6;

  const rasp = ctx.createBiquadFilter();
  rasp.type = "bandpass";
  rasp.frequency.value = 380;
  rasp.Q.value = 1.4;

  const raspGain = ctx.createGain();
  raspGain.gain.value = 0.35;

  const pulse = ctx.createGain();
  pulse.gain.value = 0.52;
  const fold = ctx.createOscillator();
  fold.type = "sine";
  fold.frequency.value = session.baseHz;
  const foldDepth = ctx.createGain();
  foldDepth.gain.value = 0.42;
  fold.connect(foldDepth);
  foldDepth.connect(pulse.gain);

  const rumble = ctx.createOscillator();
  rumble.type = "triangle";
  rumble.frequency.value = session.baseHz;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.1;

  noise.connect(highpass);
  highpass.connect(chest);
  highpass.connect(rasp);
  rasp.connect(raspGain);
  chest.connect(pulse);
  raspGain.connect(pulse);
  pulse.connect(burstGain);
  rumble.connect(rumbleGain);
  rumbleGain.connect(burstGain);

  noise.start();
  fold.start();
  rumble.start();

  let stopped = false;

  const scheduleBurst = (burst: Burst) => {
    const t0 = session.audioOffset + burst.start;
    const peakAt = t0 + burst.attack;
    const releaseAt = t0 + burst.duration - burst.release;
    const end = t0 + burst.duration;
    burstGain.gain.setValueAtTime(0, t0);
    burstGain.gain.linearRampToValueAtTime(burst.peak, peakAt);
    burstGain.gain.setValueAtTime(burst.peak, releaseAt);
    burstGain.gain.linearRampToValueAtTime(0, end);
    fold.frequency.setValueAtTime(burst.hz, t0);
    rumble.frequency.setValueAtTime(burst.hz, t0);
  };

  const fill = () => {
    if (stopped) {
      return;
    }
    const now = (performance.now() - session.startedAt) / 1000;
    prune(session, now);
    while (session.cursor < now + lookaheadSeconds) {
      scheduleBurst(nextBurst(session));
    }
  };

  fill();
  const tick = window.setInterval(fill, scheduleEveryMs);

  const sources = [noise, fold, rumble];
  const nodes: Array<AudioNode> = [
    master,
    burstGain,
    highpass,
    chest,
    rasp,
    raspGain,
    pulse,
    foldDepth,
    rumbleGain,
  ];

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    window.clearInterval(tick);
    if (active === session) {
      active = null;
    }
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    window.setTimeout(
      () => {
        for (const source of sources) {
          source.stop();
          source.disconnect();
        }
        for (const node of nodes) {
          node.disconnect();
        }
      },
      fadeSeconds * 1000 + 24,
    );
  };
}
