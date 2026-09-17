import { audioContext } from "./context.ts";

/** A short sibilant burst for the over-pet hiss. */
export function playHiss(): void {
  const ctx = audioContext();
  void ctx.resume();
  const now = ctx.currentTime;
  const dur = 0.52;
  const length = Math.ceil(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.random() * 2 - 1;
  }

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
  master.gain.setValueAtTime(0.08, now + 0.28);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(ctx.destination);

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 900;

  const sibilant = ctx.createBiquadFilter();
  sibilant.type = "bandpass";
  sibilant.frequency.value = 2800;
  sibilant.Q.value = 1.1;

  const air = ctx.createBiquadFilter();
  air.type = "bandpass";
  air.frequency.value = 4200;
  air.Q.value = 0.8;

  const airGain = ctx.createGain();
  airGain.gain.value = 0.45;

  noise.connect(highpass);
  highpass.connect(sibilant);
  highpass.connect(air);
  sibilant.connect(master);
  air.connect(airGain);
  airGain.connect(master);

  noise.start(now);
  noise.stop(now + dur);

  window.setTimeout(
    () => {
      noise.disconnect();
      highpass.disconnect();
      sibilant.disconnect();
      air.disconnect();
      airGain.disconnect();
      master.disconnect();
    },
    dur * 1000 + 24,
  );
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

/** Quiet sand-scratch for the litter cover phase. */
export function playScratch(): void {
  const ctx = audioContext();
  void ctx.resume();
  const now = ctx.currentTime;
  const dur = 0.38;
  const length = Math.ceil(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < samples.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.08 * white) / 1.08;
    samples[i] = last * 3.4;
  }

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.11, now + 0.03);
  master.gain.setValueAtTime(0.11, now + 0.16);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(ctx.destination);

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 280;

  const grit = ctx.createBiquadFilter();
  grit.type = "bandpass";
  grit.frequency.value = 720;
  grit.Q.value = 0.7;

  noise.connect(highpass);
  highpass.connect(grit);
  grit.connect(master);

  noise.start(now);
  noise.stop(now + dur);

  window.setTimeout(
    () => {
      noise.disconnect();
      highpass.disconnect();
      grit.disconnect();
      master.disconnect();
    },
    dur * 1000 + 24,
  );
}

export type PlinkHit = {
  readonly delay: number;
  readonly index: number;
  readonly count: number;
  readonly radius: number;
};

const plinkDur = 0.06;
let gritBuffer: AudioBuffer | undefined;
let gritSampleRate = 0;

function plinkGrit(ctx: AudioContext): AudioBuffer {
  if (gritBuffer !== undefined && gritSampleRate === ctx.sampleRate) {
    return gritBuffer;
  }
  const length = Math.ceil(ctx.sampleRate * plinkDur);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.random() * 2 - 1;
  }
  gritBuffer = buffer;
  gritSampleRate = ctx.sampleRate;
  return buffer;
}

type ArmedPlink = {
  readonly nodes: ReadonlyArray<AudioNode>;
  readonly timer: ReturnType<typeof setTimeout>;
};

function armPlink(ctx: AudioContext, when: number, hit: PlinkHit): ArmedPlink {
  const size = Math.max(0, Math.min(1, (hit.radius - 0.055) / 0.017));
  const steps = Math.max(1, hit.count - 1);
  const hz = 880 * 2 ** (hit.index / steps);
  const peak = 0.08 + size * 0.04;

  const master = ctx.createGain();
  master.gain.setValueAtTime(peak, when);
  master.gain.exponentialRampToValueAtTime(0.0001, when + plinkDur);
  master.connect(ctx.destination);

  const tap = ctx.createOscillator();
  tap.type = "triangle";
  tap.frequency.setValueAtTime(hz, when);
  tap.frequency.exponentialRampToValueAtTime(hz * 0.55, when + plinkDur);
  tap.connect(master);

  const grit = ctx.createBufferSource();
  grit.buffer = plinkGrit(ctx);
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 1800;
  const gritGain = ctx.createGain();
  gritGain.gain.setValueAtTime(0.35, when);
  gritGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.028);
  grit.connect(highpass);
  highpass.connect(gritGain);
  gritGain.connect(master);

  tap.start(when);
  grit.start(when);
  tap.stop(when + plinkDur);
  grit.stop(when + plinkDur);

  const nodes: Array<AudioNode> = [tap, grit, highpass, gritGain, master];
  const waitMs = Math.max(0, (when - ctx.currentTime + plinkDur) * 1000) + 24;
  const timer = globalThis.setTimeout(() => {
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
  }, waitMs);
  return { nodes, timer };
}

/** Arm every pellet tap on the audio clock so a hitch cannot fire them as a chord. */
export function schedulePlinks(hits: ReadonlyArray<PlinkHit>): () => void {
  const ctx = audioContext();
  void ctx.resume();
  const origin = ctx.currentTime;
  const armed = hits.map((hit) => armPlink(ctx, origin + hit.delay, hit));
  let stopped = false;

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    for (const plink of armed) {
      globalThis.clearTimeout(plink.timer);
      for (const node of plink.nodes) {
        try {
          node.disconnect();
        } catch {
          // already finished
        }
      }
    }
  };
}
