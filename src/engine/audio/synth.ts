/**
 * WebAudio synthesis building blocks: cached noise buffers, envelopes, noise bursts, tones and
 * bell partials. Everything schedules at an absolute context time `t` and stops itself.
 */

export interface Synth {
  ctx: BaseAudioContext;
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

export type NoiseKind = 'white' | 'pink' | 'brown';

/** Create the shared noise buffers (2 s, looped where needed). */
export function createSynth(ctx: BaseAudioContext): Synth {
  const len = Math.floor(ctx.sampleRate * 2);
  const white = ctx.createBuffer(1, len, ctx.sampleRate);
  const pink = ctx.createBuffer(1, len, ctx.sampleRate);
  const brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  const b = brown.getChannelData(0);
  // Paul Kellet's refined pink filter; leaky integrator for brown.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let last = 0;
  let seed = 22222;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < len; i++) {
    const x = rand() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last * 3.5;
  }
  // Remove the click at the loop seam of the integrated noises by cross-fading the ends.
  for (const buf of [pink, brown]) {
    const d = buf.getChannelData(0);
    const fade = Math.floor(ctx.sampleRate * 0.02);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i]! * k + d[len - fade + i]! * (1 - k);
    }
  }
  return { ctx, white, pink, brown };
}

export function noiseSource(s: Synth, kind: NoiseKind, loop = false): AudioBufferSourceNode {
  const src = s.ctx.createBufferSource();
  src.buffer = kind === 'white' ? s.white : kind === 'pink' ? s.pink : s.brown;
  src.loop = loop;
  if (!loop) src.loopStart = 0;
  return src;
}

export function filter(s: Synth, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
  const f = s.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

export function gainNode(s: Synth, value = 1): GainNode {
  const g = s.ctx.createGain();
  g.gain.value = value;
  return g;
}

/** Percussive envelope: silent → peak in `attack` → ~silent after `decay` (exponential). */
export function percEnv(param: AudioParam, t: number, attack: number, peak: number, decay: number): void {
  const p = Math.max(1e-4, peak);
  param.cancelScheduledValues(t);
  param.setValueAtTime(1e-4, t);
  param.exponentialRampToValueAtTime(p, t + Math.max(0.001, attack));
  param.exponentialRampToValueAtTime(1e-4, t + Math.max(0.001, attack) + Math.max(0.005, decay));
}

/** Attack-sustain-release envelope over `dur` seconds. */
export function asrEnv(param: AudioParam, t: number, attack: number, level: number, dur: number, release: number): void {
  const l = Math.max(1e-4, level);
  param.cancelScheduledValues(t);
  param.setValueAtTime(1e-4, t);
  param.exponentialRampToValueAtTime(l, t + attack);
  param.setValueAtTime(l, t + Math.max(attack, dur - release));
  param.exponentialRampToValueAtTime(1e-4, t + dur);
}

export interface BurstOpts {
  kind?: NoiseKind;
  type?: BiquadFilterType;
  freq?: number;
  q?: number;
  /** Optional filter sweep end frequency. */
  freqEnd?: number;
  gain: number;
  attack?: number;
  decay: number;
}

/** Filtered noise burst. Returns end time. */
export function burst(s: Synth, out: AudioNode, t: number, o: BurstOpts): number {
  const src = noiseSource(s, o.kind ?? 'white');
  const f = filter(s, o.type ?? 'bandpass', o.freq ?? 2000, o.q ?? 1);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + (o.attack ?? 0.001) + o.decay);
  const g = gainNode(s, 0);
  percEnv(g.gain, t, o.attack ?? 0.001, o.gain, o.decay);
  src.connect(f).connect(g).connect(out);
  const end = t + (o.attack ?? 0.001) + o.decay + 0.02;
  // random start offset so repeated bursts don't sound identical
  src.start(t, Math.random() * 1.5);
  src.stop(end);
  return end;
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  /** Time for the frequency glide (defaults to the whole note). */
  glide?: number;
  gain: number;
  attack?: number;
  decay: number;
  detune?: number;
  /** Optional lowpass on the oscillator. */
  lowpass?: number;
}

export function tone(s: Synth, out: AudioNode, t: number, o: ToneOpts): number {
  const osc = s.ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + (o.glide ?? (o.attack ?? 0.002) + o.decay));
  if (o.detune) osc.detune.value = o.detune;
  const g = gainNode(s, 0);
  percEnv(g.gain, t, o.attack ?? 0.002, o.gain, o.decay);
  if (o.lowpass) osc.connect(filter(s, 'lowpass', o.lowpass)).connect(g);
  else osc.connect(g);
  g.connect(out);
  const end = t + (o.attack ?? 0.002) + o.decay + 0.02;
  osc.start(t);
  osc.stop(end);
  return end;
}

/** Struck-bell note from inharmonic partials. */
export function bell(s: Synth, out: AudioNode, t: number, freq: number, gain: number, decay: number): number {
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2.0, 0.42, 0.7],
    [3.01, 0.22, 0.5],
    [4.17, 0.1, 0.35],
    [5.43, 0.05, 0.25],
  ];
  let end = t;
  for (const [mul, g, d] of partials) end = Math.max(end, tone(s, out, t, { freq: freq * mul, gain: gain * g, attack: 0.003, decay: decay * d }));
  return end;
}

/** A few random micro-clicks (crackle). */
export function crackle(s: Synth, out: AudioNode, t: number, count: number, span: number, gain: number): number {
  let end = t;
  for (let i = 0; i < count; i++) {
    const at = t + Math.random() ** 1.6 * span;
    end = Math.max(end, burst(s, out, at, { type: 'highpass', freq: 2500 + Math.random() * 3000, gain: gain * (0.3 + Math.random() * 0.7), decay: 0.002 + Math.random() * 0.006 }));
  }
  return end;
}
