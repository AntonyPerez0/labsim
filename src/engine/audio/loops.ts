/**
 * Continuous loop voices (fans, hums, stepper whine, printer feed). Sounds without a continuous
 * recipe are looped by re-triggering their one-shot at `RETRIGGER_PERIOD` (see `catalog.ts`).
 */
import type { SoundId } from '../types';
import { filter, gainNode, noiseSource, type Synth } from './synth';

export interface LoopVoice {
  /** Pitch/speed multiplier (stepper: step rate; 0 silences rate-driven voices). */
  setRate(rate: number, t: number): void;
  /** Stop all sources at time t (after the caller's fade). */
  stop(t: number): void;
}

type LoopRecipe = (s: Synth, out: AudioNode, t: number, rate: number) => LoopVoice;

function stopAll(nodes: AudioScheduledSourceNode[], t: number): void {
  for (const n of nodes) {
    try {
      n.stop(t);
    } catch {
      /* already stopped */
    }
  }
}

function noiseLayer(s: Synth, out: AudioNode, t: number, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, freq: number, gain: number, q = 0.707) {
  const src = noiseSource(s, kind, true);
  const f = filter(s, type, freq, q);
  const g = gainNode(s, gain);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.8);
  return { src, f, g };
}

/** Stepper whine: detuned square + saw → resonant band-pass; pitch follows step rate. */
const stepper: LoopRecipe = (s, out, t, rate) => {
  const base = 320;
  const level = gainNode(s, rate > 0.01 ? 1 : 0);
  const bp = filter(s, 'bandpass', base * 2.5 * Math.max(0.05, rate), 3.5);
  const g = gainNode(s, 0.08);
  bp.connect(g).connect(level).connect(out);
  const oscs: OscillatorNode[] = [];
  for (const [type, det] of [['square', -8], ['sawtooth', 9]] as const) {
    const o = s.ctx.createOscillator();
    o.type = type;
    o.detune.value = det;
    o.frequency.value = base * Math.max(0.05, rate);
    o.connect(bp);
    o.start(t);
    oscs.push(o);
  }
  // faint high harmonic "sing"
  const sing = s.ctx.createOscillator();
  sing.frequency.value = base * 4 * Math.max(0.05, rate);
  const sg = gainNode(s, 0.006);
  sing.connect(sg).connect(level);
  sing.start(t);
  oscs.push(sing);
  return {
    setRate(r, at) {
      const f = base * Math.max(0.05, r);
      oscs[0]!.frequency.setTargetAtTime(f, at, 0.03);
      oscs[1]!.frequency.setTargetAtTime(f, at, 0.03);
      sing.frequency.setTargetAtTime(f * 4, at, 0.03);
      bp.frequency.setTargetAtTime(f * 2.5, at, 0.03);
      level.gain.setTargetAtTime(r > 0.01 ? 1 : 0, at, 0.02);
    },
    stop: (at) => stopAll(oscs, at),
  };
};

/** Servo hold/move whine. */
const servo: LoopRecipe = (s, out, t, rate) => {
  const o = s.ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 300 * rate;
  const lfo = s.ctx.createOscillator();
  lfo.frequency.value = 31;
  const lg = gainNode(s, 6);
  lfo.connect(lg).connect(o.frequency);
  const g = gainNode(s, 0.045);
  o.connect(filter(s, 'lowpass', 1400, 2.5)).connect(g).connect(out);
  o.start(t);
  lfo.start(t);
  return {
    setRate(r, at) {
      o.frequency.setTargetAtTime(300 * Math.max(0.1, r), at, 0.05);
      g.gain.setTargetAtTime(r > 0.01 ? 0.045 : 0, at, 0.03);
    },
    stop: (at) => stopAll([o, lfo], at),
  };
};

/** Equipment fan: broadband air noise + blade-pass tone, slow wobble. */
const fan: LoopRecipe = (s, out, t, rate) => {
  const air = noiseLayer(s, out, t, 'brown', 'lowpass', 700 * rate, 0.13);
  const blade = noiseLayer(s, out, t, 'white', 'bandpass', 170 * rate, 0.05, 6);
  const lfo = s.ctx.createOscillator();
  lfo.frequency.value = 0.27;
  const depth = gainNode(s, 0.015);
  lfo.connect(depth).connect(air.g.gain);
  lfo.start(t);
  return {
    setRate(r, at) {
      air.f.frequency.setTargetAtTime(700 * Math.max(0.1, r), at, 0.3);
      blade.f.frequency.setTargetAtTime(170 * Math.max(0.1, r), at, 0.3);
    },
    stop: (at) => stopAll([air.src, blade.src, lfo], at),
  };
};

/** GPU server blade: louder, higher-pitched fan wall with faint tonal whines. */
const gpuFans: LoopRecipe = (s, out, t, rate) => {
  const hiss = noiseLayer(s, out, t, 'white', 'bandpass', 950 * rate, 0.06, 0.6);
  const body = noiseLayer(s, out, t, 'brown', 'lowpass', 420 * rate, 0.11);
  const whines: OscillatorNode[] = [];
  for (const f of [2110, 2340, 2615]) {
    const o = s.ctx.createOscillator();
    o.frequency.value = f * rate;
    o.detune.value = Math.random() * 10 - 5;
    const g = gainNode(s, 0.0035);
    o.connect(g).connect(out);
    o.start(t);
    whines.push(o);
  }
  return {
    setRate(r, at) {
      const k = Math.max(0.1, r);
      hiss.f.frequency.setTargetAtTime(950 * k, at, 0.5);
      body.f.frequency.setTargetAtTime(420 * k, at, 0.5);
      whines.forEach((o, i) => o.frequency.setTargetAtTime([2110, 2340, 2615][i]! * k, at, 0.5));
    },
    stop: (at) => stopAll([hiss.src, body.src, ...whines], at),
  };
};

/** Fluorescent / LED driver hum: 120 Hz + harmonics + a faint buzz. Very quiet. */
const fluorescent: LoopRecipe = (s, out, t) => {
  const nodes: OscillatorNode[] = [];
  for (const [f, g] of [[120, 0.008], [240, 0.005], [360, 0.003], [480, 0.0015]] as const) {
    const o = s.ctx.createOscillator();
    o.frequency.value = f;
    const gg = gainNode(s, g);
    o.connect(gg).connect(out);
    o.start(t);
    nodes.push(o);
  }
  const buzz = s.ctx.createOscillator();
  buzz.type = 'square';
  buzz.frequency.value = 120;
  const bg = gainNode(s, 0.0025);
  buzz.connect(filter(s, 'lowpass', 700)).connect(bg).connect(out);
  buzz.start(t);
  nodes.push(buzz);
  return { setRate() {}, stop: (at) => stopAll(nodes, at) };
};

/** Room tone: HVAC rumble + faint air + mains hum. */
const roomTone: LoopRecipe = (s, out, t) => {
  const rumble = noiseLayer(s, out, t, 'brown', 'lowpass', 240, 0.09);
  const air = noiseLayer(s, out, t, 'pink', 'lowpass', 1300, 0.012);
  const hum = s.ctx.createOscillator();
  hum.frequency.value = 60;
  const hg = gainNode(s, 0.004);
  hum.connect(hg).connect(out);
  hum.start(t);
  return { setRate() {}, stop: (at) => stopAll([rumble.src, air.src, hum], at) };
};

/** Thermal printer feeding continuously. */
const printer: LoopRecipe = (s, out, t, rate) => {
  const src = noiseSource(s, 'white', true);
  const bp = filter(s, 'bandpass', 2300, 1.2);
  const gate = gainNode(s, 0.5);
  const lfo = s.ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 42 * rate;
  const depth = gainNode(s, 0.5);
  lfo.connect(depth).connect(gate.gain);
  const g = gainNode(s, 0.08);
  src.connect(bp).connect(gate).connect(g).connect(out);
  const whine = s.ctx.createOscillator();
  whine.type = 'sawtooth';
  whine.frequency.value = 880 * rate;
  const wg = gainNode(s, 0.01);
  whine.connect(filter(s, 'lowpass', 1400)).connect(wg).connect(out);
  src.start(t, Math.random());
  lfo.start(t);
  whine.start(t);
  return {
    setRate(r, at) {
      lfo.frequency.setTargetAtTime(42 * Math.max(0.1, r), at, 0.05);
      whine.frequency.setTargetAtTime(880 * Math.max(0.1, r), at, 0.05);
    },
    stop: (at) => stopAll([src, lfo, whine], at),
  };
};

export const LOOP_RECIPES: Partial<Record<SoundId, LoopRecipe>> = {
  stepper,
  servo,
  fan,
  'gpu-fans': gpuFans,
  fluorescent,
  'room-tone': roomTone,
  printer,
};
