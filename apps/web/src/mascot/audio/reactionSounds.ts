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

/** Dry pellet tap that climbs about an octave across the drop sequence. */
export function playPlink(index: number, count: number, radius: number): void {
  const ctx = audioContext();
  void ctx.resume();
  const now = ctx.currentTime;
  const dur = 0.06;
  const size = Math.max(0, Math.min(1, (radius - 0.055) / 0.017));
  const steps = Math.max(1, count - 1);
  const hz = 880 * 2 ** (index / steps);
  const peak = 0.08 + size * 0.04;

  const master = ctx.createGain();
  master.gain.setValueAtTime(peak, now);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(ctx.destination);

  const tap = ctx.createOscillator();
  tap.type = "triangle";
  tap.frequency.setValueAtTime(hz, now);
  tap.frequency.exponentialRampToValueAtTime(hz * 0.55, now + dur);
  tap.connect(master);

  const length = Math.ceil(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.random() * 2 - 1;
  }
  const grit = ctx.createBufferSource();
  grit.buffer = buffer;
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 1800;
  const gritGain = ctx.createGain();
  gritGain.gain.setValueAtTime(0.35, now);
  gritGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
  grit.connect(highpass);
  highpass.connect(gritGain);
  gritGain.connect(master);

  tap.start(now);
  grit.start(now);
  tap.stop(now + dur);
  grit.stop(now + dur);

  window.setTimeout(
    () => {
      tap.disconnect();
      grit.disconnect();
      highpass.disconnect();
      gritGain.disconnect();
      master.disconnect();
    },
    dur * 1000 + 24,
  );
}
