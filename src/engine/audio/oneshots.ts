/**
 * One-shot synthesis recipes for every `SoundId`. Each recipe schedules nodes at time `t` into
 * `out` and returns the time the sound has fully decayed (for node cleanup).
 * `rate` scales pitch / speed; `vol` is a linear gain (already includes the catalogue level).
 */
import type { SoundId } from '../types';
import { bell, burst, crackle, filter, gainNode, noiseSource, percEnv, tone, type Synth } from './synth';

export interface ShotParams {
  rate: number;
  vol: number;
  /** Optional recipe variant (e.g. footstep surface "plate"). */
  variant?: string;
}

export type ShotRecipe = (s: Synth, out: AudioNode, t: number, p: ShotParams) => number;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Short stepper move: detuned square + saw through a resonant band-pass, accelerating & braking. */
const stepper: ShotRecipe = (s, out, t, { rate, vol }) => {
  const f = 320 * rate;
  const dur = 0.55 / Math.sqrt(rate);
  const bp = filter(s, 'bandpass', f * 2.5, 3.5);
  const g = gainNode(s, 0);
  g.gain.setValueAtTime(1e-4, t);
  g.gain.exponentialRampToValueAtTime(0.09 * vol, t + 0.04);
  g.gain.setValueAtTime(0.09 * vol, t + dur - 0.07);
  g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  bp.connect(g).connect(out);
  for (const [type, det] of [['square', -8], ['sawtooth', 9]] as const) {
    const o = s.ctx.createOscillator();
    o.type = type;
    o.detune.value = det;
    o.frequency.setValueAtTime(f * 0.45, t);
    o.frequency.linearRampToValueAtTime(f, t + dur * 0.3);
    o.frequency.setValueAtTime(f, t + dur * 0.7);
    o.frequency.linearRampToValueAtTime(f * 0.45, t + dur);
    o.connect(bp);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  return t + dur + 0.05;
};

/** Push-pull solenoid: sharp click + low thunk + short body noise. */
const solenoid: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'highpass', freq: 3200, gain: 0.45 * vol, decay: 0.004 });
  tone(s, out, t + 0.002, { freq: 150 * rate, freqEnd: 55 * rate, gain: 0.55 * vol, decay: 0.09 });
  burst(s, out, t + 0.001, { kind: 'pink', type: 'lowpass', freq: 900 * rate, gain: 0.3 * vol, decay: 0.045 });
  return burst(s, out, t + 0.003, { type: 'bandpass', freq: 1800 * rate, q: 6, gain: 0.12 * vol, decay: 0.03 });
};

/** Hobby servo: filtered saw sweep with gear-whine vibrato. */
const servo: ShotRecipe = (s, out, t, { rate, vol }) => {
  const dur = 0.32;
  const o = s.ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(240 * rate, t);
  o.frequency.exponentialRampToValueAtTime(380 * rate, t + dur * 0.6);
  o.frequency.exponentialRampToValueAtTime(300 * rate, t + dur);
  const lfo = s.ctx.createOscillator();
  lfo.frequency.value = 32;
  const lfoGain = gainNode(s, 7 * rate);
  lfo.connect(lfoGain).connect(o.frequency);
  const lp = filter(s, 'lowpass', 1500, 2.5);
  const g = gainNode(s, 0);
  g.gain.setValueAtTime(1e-4, t);
  g.gain.exponentialRampToValueAtTime(0.06 * vol, t + 0.02);
  g.gain.setValueAtTime(0.06 * vol, t + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
  burst(s, out, t, { type: 'bandpass', freq: 3000, q: 0.8, gain: 0.015 * vol, attack: 0.02, decay: dur });
  return t + dur + 0.05;
};

/** Relay: tiny contact click with a bounce. */
const relay: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'bandpass', freq: 3600 * rate, q: 1.6, gain: 0.35 * vol, decay: 0.003 });
  tone(s, out, t, { freq: 420 * rate, gain: 0.08 * vol, decay: 0.012 });
  return burst(s, out, t + 0.006, { type: 'bandpass', freq: 4200 * rate, q: 2, gain: 0.14 * vol, decay: 0.003 });
};

/** Device beep (LabSim terminal): clean sine blip. */
const deviceBeep: ShotRecipe = (s, out, t, { rate, vol }) =>
  tone(s, out, t, { freq: 2093 * rate, gain: 0.16 * vol, attack: 0.003, decay: 0.09 });

/** Payment approved: two-note rising bell chime. */
const deviceApproved: ShotRecipe = (s, out, t, { rate, vol }) => {
  bell(s, out, t, 1046.5 * rate, 0.11 * vol, 0.55);
  return bell(s, out, t + 0.14, 1568 * rate, 0.11 * vol, 0.9);
};

/** Device error: two low buzzy pulses. */
const deviceError: ShotRecipe = (s, out, t, { rate, vol }) => {
  tone(s, out, t, { type: 'square', freq: 330 * rate, gain: 0.06 * vol, attack: 0.004, decay: 0.12, lowpass: 1800 });
  return tone(s, out, t + 0.18, { type: 'square', freq: 330 * rate, gain: 0.06 * vol, attack: 0.004, decay: 0.16, lowpass: 1800 });
};

/** Thermal receipt printer: stepped paper feed pulses + motor whine. */
const printer: ShotRecipe = (s, out, t, { rate, vol }) => {
  const dur = 1.4;
  const src = noiseSource(s, 'white', true);
  const bp = filter(s, 'bandpass', 2300, 1.2);
  const gate = gainNode(s, 0);
  const lfo = s.ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 42 * rate;
  const lfoDepth = gainNode(s, 0.5);
  lfo.connect(lfoDepth).connect(gate.gain);
  gate.gain.value = 0.5;
  const env = gainNode(s, 0);
  env.gain.setValueAtTime(1e-4, t);
  env.gain.exponentialRampToValueAtTime(0.09 * vol, t + 0.05);
  env.gain.setValueAtTime(0.09 * vol, t + dur - 0.1);
  env.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  src.connect(bp).connect(gate).connect(env).connect(out);
  const whine = s.ctx.createOscillator();
  whine.type = 'sawtooth';
  whine.frequency.value = 880 * rate;
  const wg = gainNode(s, 0.12);
  whine.connect(filter(s, 'lowpass', 1400)).connect(wg).connect(env);
  for (const n of [src, lfo, whine]) {
    n.start(t);
    n.stop(t + dur + 0.02);
  }
  return t + dur + 0.05;
};

/** Mechanical keyboard key: clicky high burst + low thock. */
const keyboard: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'bandpass', freq: rnd(2600, 4000) * rate, q: 1.5, gain: 0.22 * vol, decay: 0.012 });
  return tone(s, out, t + 0.004, { freq: rnd(160, 220) * rate, gain: 0.1 * vol, decay: 0.028 });
};

const uiType: ShotRecipe = (s, out, t, { rate, vol }) =>
  burst(s, out, t, { type: 'bandpass', freq: rnd(2800, 3600) * rate, q: 1.8, gain: 0.08 * vol, decay: 0.008 });

/** Mouse click: press + release micro clicks. */
const mouseClick: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'highpass', freq: 4200 * rate, gain: 0.3 * vol, decay: 0.003 });
  return burst(s, out, t + 0.055, { type: 'highpass', freq: 4600 * rate, gain: 0.14 * vol, decay: 0.003 });
};

/** Footstep on vinyl (soft heel thud + scuff) or on a metal plate (adds a short ring). */
const footstep: ShotRecipe = (s, out, t, { rate, vol, variant }) => {
  const r = rate * rnd(0.92, 1.08);
  tone(s, out, t, { freq: 85 * r, freqEnd: 60 * r, gain: 0.22 * vol, decay: 0.05 });
  burst(s, out, t, { kind: 'pink', type: 'lowpass', freq: 750 * r, gain: 0.2 * vol, decay: 0.07 });
  let end = burst(s, out, t + 0.02, { type: 'bandpass', freq: 2200 * r, q: 0.9, gain: 0.035 * vol, attack: 0.01, decay: 0.05 });
  if (variant === 'plate') end = burst(s, out, t, { type: 'bandpass', freq: 1700 * r, q: 9, gain: 0.08 * vol, decay: 0.16 });
  return end;
};

/** Lab door: latch click, short creak, closing thud. */
const door: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'bandpass', freq: 2100 * rate, q: 2, gain: 0.3 * vol, decay: 0.008 });
  const o = s.ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 95 * rate;
  const fm = s.ctx.createOscillator();
  fm.frequency.value = 7;
  const fmg = gainNode(s, 12);
  fm.connect(fmg).connect(o.frequency);
  const bp = filter(s, 'bandpass', 620, 8);
  const g = gainNode(s, 0);
  percEnv(g.gain, t + 0.05, 0.08, 0.05 * vol, 0.45);
  o.connect(bp).connect(g).connect(out);
  o.start(t + 0.05);
  fm.start(t + 0.05);
  o.stop(t + 0.62);
  fm.stop(t + 0.62);
  tone(s, out, t + 0.62, { freq: 70 * rate, freqEnd: 45 * rate, gain: 0.45 * vol, decay: 0.18 });
  return burst(s, out, t + 0.62, { kind: 'brown', type: 'lowpass', freq: 500, gain: 0.35 * vol, decay: 0.15 });
};

const uiClick: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'highpass', freq: 5000, gain: 0.04 * vol, decay: 0.002 });
  return tone(s, out, t, { freq: 1350 * rate, freqEnd: 1100 * rate, gain: 0.1 * vol, attack: 0.002, decay: 0.03 });
};

const uiHover: ShotRecipe = (s, out, t, { rate, vol }) =>
  tone(s, out, t, { freq: 2400 * rate, gain: 0.025 * vol, attack: 0.002, decay: 0.014 });

const uiSuccess: ShotRecipe = (s, out, t, { rate, vol }) => {
  tone(s, out, t, { type: 'triangle', freq: 784 * rate, gain: 0.12 * vol, decay: 0.09 });
  return tone(s, out, t + 0.085, { type: 'triangle', freq: 1175 * rate, gain: 0.12 * vol, decay: 0.2 });
};

const uiFail: ShotRecipe = (s, out, t, { rate, vol }) => {
  tone(s, out, t, { type: 'square', freq: 392 * rate, gain: 0.05 * vol, decay: 0.1, lowpass: 1200 });
  return tone(s, out, t + 0.11, { type: 'square', freq: 311 * rate, gain: 0.05 * vol, decay: 0.2, lowpass: 1000 });
};

const uiXp: ShotRecipe = (s, out, t, { rate, vol }) => {
  const notes = [880, 1109, 1319];
  let end = t;
  notes.forEach((n, i) => {
    end = tone(s, out, t + i * 0.05, { freq: n * rate, gain: 0.09 * vol, decay: 0.08 });
  });
  return Math.max(end, tone(s, out, t + 0.15, { freq: 2637 * rate, gain: 0.03 * vol, decay: 0.35 }));
};

const uiAchievement: ShotRecipe = (s, out, t, { rate, vol }) => {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  let end = t;
  notes.forEach((n, i) => {
    end = Math.max(end, bell(s, out, t + i * 0.09, n * rate, 0.07 * vol, i === notes.length - 1 ? 1.4 : 0.5));
  });
  for (const n of [523.25, 659.25, 783.99]) end = Math.max(end, tone(s, out, t + 0.36, { type: 'triangle', freq: n * rate, gain: 0.035 * vol, attack: 0.03, decay: 1.1 }));
  return end;
};

const uiTicket: ShotRecipe = (s, out, t, { rate, vol }) => {
  bell(s, out, t, 1318.5 * rate, 0.09 * vol, 0.5);
  return bell(s, out, t + 0.16, 987.8 * rate, 0.09 * vol, 0.8);
};

/** Blown fuse: sharp pop + thump + crackle tail. */
const fusePop: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'bandpass', freq: 1500 * rate, q: 0.8, gain: 0.6 * vol, decay: 0.012 });
  tone(s, out, t, { freq: 95 * rate, freqEnd: 50 * rate, gain: 0.4 * vol, decay: 0.07 });
  return crackle(s, out, t + 0.01, 9, 0.28, 0.2 * vol);
};

/** Electrical spark: dense crackle with a brief buzz. */
const spark: ShotRecipe = (s, out, t, { rate, vol }) => {
  tone(s, out, t, { type: 'sawtooth', freq: 120 * rate, gain: 0.025 * vol, attack: 0.01, decay: 0.3, lowpass: 2500 });
  return crackle(s, out, t, 26, 0.35, 0.18 * vol);
};

const plugIn: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'bandpass', freq: 1200 * rate, q: 1.5, gain: 0.25 * vol, decay: 0.006 });
  tone(s, out, t + 0.025, { freq: 300 * rate, gain: 0.08 * vol, decay: 0.015 });
  return burst(s, out, t + 0.025, { type: 'bandpass', freq: 2300 * rate, q: 2, gain: 0.38 * vol, decay: 0.006 });
};

const unplug: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'bandpass', freq: 3000 * rate, freqEnd: 1000 * rate, q: 1.2, gain: 0.06 * vol, attack: 0.03, decay: 0.1 });
  return burst(s, out, t + 0.12, { type: 'lowpass', freq: 1500 * rate, gain: 0.3 * vol, decay: 0.008 });
};

const switchToggle: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'bandpass', freq: 1800 * rate, q: 8, gain: 0.45 * vol, decay: 0.006 });
  return tone(s, out, t, { freq: 2200 * rate, gain: 0.04 * vol, decay: 0.016 });
};

const cardInsert: ShotRecipe = (s, out, t, { rate, vol }) => {
  burst(s, out, t, { type: 'bandpass', freq: 2000 * rate, freqEnd: 3200 * rate, q: 2, gain: 0.06 * vol, attack: 0.1, decay: 0.16 });
  return burst(s, out, t + 0.26, { type: 'bandpass', freq: 2600 * rate, q: 2, gain: 0.22 * vol, decay: 0.005 });
};

const nfcTap: ShotRecipe = (s, out, t, { rate, vol }) =>
  tone(s, out, t, { freq: 2350 * rate, gain: 0.14 * vol, attack: 0.004, decay: 0.13 });

/** Continuous-type sounds as short one-shots (fade in/out) when played with `play()`. */
function swell(make: (s: Synth, out: AudioNode, t: number, p: ShotParams, dur: number) => void, dur: number): ShotRecipe {
  return (s, out, t, p) => {
    const g = gainNode(s, 0);
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(1, t + dur * 0.25);
    g.gain.setValueAtTime(1, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    g.connect(out);
    make(s, g, t, p, dur);
    return t + dur + 0.05;
  };
}

function noiseBed(s: Synth, out: AudioNode, t: number, dur: number, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, freq: number, gain: number, q = 0.7): void {
  const src = noiseSource(s, kind, true);
  const g = gainNode(s, gain);
  src.connect(filter(s, type, freq, q)).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + dur + 0.02);
}

const fanShot = swell((s, out, t, p, d) => {
  noiseBed(s, out, t, d, 'brown', 'lowpass', 700 * p.rate, 0.12 * p.vol);
  noiseBed(s, out, t, d, 'white', 'bandpass', 170 * p.rate, 0.05 * p.vol, 6);
}, 1.6);

const gpuFansShot = swell((s, out, t, p, d) => {
  noiseBed(s, out, t, d, 'white', 'bandpass', 900 * p.rate, 0.06 * p.vol, 0.6);
  noiseBed(s, out, t, d, 'brown', 'lowpass', 400 * p.rate, 0.1 * p.vol);
}, 2);

const fluorescentShot = swell((s, out, t, p, d) => {
  for (const [f, g] of [[120, 0.01], [240, 0.006], [360, 0.004]] as const) {
    const o = s.ctx.createOscillator();
    o.frequency.value = f;
    const gg = gainNode(s, g * p.vol);
    o.connect(gg).connect(out);
    o.start(t);
    o.stop(t + d + 0.02);
  }
}, 2);

const roomToneShot = swell((s, out, t, p, d) => {
  noiseBed(s, out, t, d, 'brown', 'lowpass', 250, 0.08 * p.vol);
}, 3);

export const ONE_SHOTS: Record<SoundId, ShotRecipe> = {
  stepper,
  solenoid,
  servo,
  relay,
  fan: fanShot,
  'gpu-fans': gpuFansShot,
  fluorescent: fluorescentShot,
  'device-beep': deviceBeep,
  'device-approved': deviceApproved,
  'device-error': deviceError,
  printer,
  keyboard,
  'mouse-click': mouseClick,
  footstep,
  door,
  'room-tone': roomToneShot,
  'ui-click': uiClick,
  'ui-hover': uiHover,
  'ui-success': uiSuccess,
  'ui-fail': uiFail,
  'ui-xp': uiXp,
  'ui-achievement': uiAchievement,
  'ui-ticket': uiTicket,
  'ui-type': uiType,
  'fuse-pop': fusePop,
  spark,
  'plug-in': plugIn,
  unplug,
  'switch-toggle': switchToggle,
  'card-insert': cardInsert,
  'nfc-tap': nfcTap,
};
