/**
 * `AudioEngine` implementation: WebAudio graph with sfx / ambience / ui buses → master → limiter,
 * HRTF (high/ultra) or equal-power panning for positional sounds, a camera-following listener and
 * fully synthesised sounds (no files).
 *
 * The AudioContext is created lazily in `unlock()` (call from a user gesture). Loops requested
 * before that are kept as virtual handles and start automatically once audio is unlocked.
 * Nothing here ever throws to callers.
 */
import type { AudioEngine, LoopHandle, PlayOptions, SoundId, Vec3 } from '../types';
import { SOUND_DEFS, type Bus } from './catalog';
import { LOOP_RECIPES, type LoopVoice } from './loops';
import { ONE_SHOTS } from './oneshots';
import { createSynth, type Synth } from './synth';

const MAX_VOICES = 48;
const MAX_DISTANCE = 30;

type Volumes = { master: number; sfx: number; ambience: number; ui: number };

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

export class WebAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private synth: Synth | null = null;
  private master: GainNode | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  private volumes: Volumes = { master: 0.8, sfx: 0.9, ambience: 0.6, ui: 0.9 };
  private loops = new Set<VirtualLoop>();
  private activeVoices = 0;
  private hrtf = false;
  private listenerPos: Vec3 = [0, 1.65, 0];
  private listenerFwd: Vec3 = [0, 0, -1];
  private failed = false;

  /** True once the context exists and is running. */
  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const Ctor: typeof AudioContext | undefined =
          typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
        if (!Ctor) {
          this.failed = true;
          return;
        }
        const ctx = new Ctor({ latencyHint: 'interactive' });
        this.ctx = ctx;
        this.synth = createSynth(ctx);
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -6;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.15;
        this.master = ctx.createGain();
        this.master.connect(limiter).connect(ctx.destination);
        this.buses = { sfx: ctx.createGain(), ambience: ctx.createGain(), ui: ctx.createGain() };
        for (const b of Object.values(this.buses)) b.connect(this.master);
        this.applyVolumes(true);
        this.applyListener();
        ctx.addEventListener('statechange', () => this.onState());
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.onState(), () => {});
      this.onState();
    } catch {
      this.failed = true;
      this.ctx = null;
    }
  }

  private onState(): void {
    if (!this.running) return;
    for (const l of this.loops) l.ensureStarted();
  }

  setHrtf(on: boolean): void {
    if (this.hrtf === on) return;
    this.hrtf = on;
    for (const l of this.loops) l.setPanningModel(this.panningModel);
  }

  /** @internal */
  get panningModel(): PanningModelType {
    return this.hrtf ? 'HRTF' : 'equalpower';
  }

  play(id: SoundId, opts: PlayOptions = {}): void {
    if (!this.running || !this.synth || !this.buses) return;
    if (this.activeVoices >= MAX_VOICES) return;
    const def = SOUND_DEFS[id];
    const recipe = ONE_SHOTS[id];
    if (!def || !recipe) return;
    // Sanitise: recipes use exponential ramps (a 0 target throws) and divide by rate.
    const vol = (opts.volume ?? 1) * def.level;
    if (!(vol > 1e-4)) return;
    const rate = clampRate(opts.rate ?? 1);
    if (opts.position && !isFiniteVec(opts.position)) return;
    let voiceGain: GainNode | null = null;
    let panner: PannerNode | null = null;
    try {
      if (opts.position && this.distanceTo(opts.position) > MAX_DISTANCE) return;
      const ctx = this.ctx!;
      const t = ctx.currentTime + 0.005;
      const vg = ctx.createGain();
      voiceGain = vg;
      vg.gain.value = 1;
      const bus = this.buses[opts.bus ?? def.bus] ?? this.buses[def.bus];
      let tail: AudioNode = vg;
      if (opts.position) {
        panner = this.makePanner(def.refDistance, opts.position);
        vg.connect(panner);
        tail = panner;
      }
      tail.connect(bus);
      const end = recipe(this.synth, vg, t, { rate, vol: Math.min(4, vol), variant: (opts as { variant?: string }).variant });
      this.activeVoices++;
      const p = panner;
      const ms = Math.min(15000, Math.max(50, ((Number.isFinite(end) ? end : t + 2) - ctx.currentTime) * 1000 + 100));
      setTimeout(() => {
        this.activeVoices--;
        try {
          vg.disconnect();
          p?.disconnect();
        } catch {
          /* ignore */
        }
      }, ms);
    } catch {
      // never throw from audio; don't leave a half-built voice attached to the bus
      try {
        voiceGain?.disconnect();
        panner?.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  /** Footstep with a surface variant (engine-internal convenience). */
  playVariant(id: SoundId, variant: string, opts: PlayOptions = {}): void {
    this.play(id, { ...opts, variant } as PlayOptions);
  }

  loop(id: SoundId, opts: PlayOptions = {}): LoopHandle {
    const l = new VirtualLoop(this, id, opts);
    this.loops.add(l);
    if (this.running) l.ensureStarted();
    return l;
  }

  /** @internal */
  forget(l: VirtualLoop): void {
    this.loops.delete(l);
  }

  setListener(position: Vec3, forward: Vec3): void {
    this.listenerPos = position;
    this.listenerFwd = forward;
    this.applyListener();
  }

  setVolumes(v: Volumes): void {
    this.volumes = { master: clamp01(v.master), sfx: clamp01(v.sfx), ambience: clamp01(v.ambience), ui: clamp01(v.ui) };
    this.applyVolumes(false);
  }

  /** Drive re-triggered loops (called once per engine frame). */
  tick(): void {
    if (!this.running) return;
    const now = this.ctx!.currentTime;
    for (const l of this.loops) l.tick(now);
  }

  // --- internals -------------------------------------------------------------------------------

  /** @internal */
  get audioContext(): AudioContext | null {
    return this.ctx;
  }
  /** @internal */
  get synthesizer(): Synth | null {
    return this.synth;
  }
  /** @internal */
  bus(b: Bus): GainNode | null {
    return this.buses ? this.buses[b] : null;
  }

  /** @internal */
  makePanner(refDistance: number, p: Vec3): PannerNode {
    const ctx = this.ctx!;
    const panner = ctx.createPanner();
    panner.panningModel = this.panningModel;
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.rolloffFactor = 1.1;
    panner.maxDistance = MAX_DISTANCE;
    setPannerPosition(panner, p);
    return panner;
  }

  private distanceTo(p: Vec3): number {
    const [x, y, z] = this.listenerPos;
    return Math.hypot(p[0] - x, p[1] - y, p[2] - z);
  }

  private applyVolumes(immediate: boolean): void {
    if (!this.ctx || !this.master || !this.buses) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => {
      if (immediate) g.gain.value = v;
      else g.gain.setTargetAtTime(v, t, 0.05);
    };
    set(this.master, this.volumes.master);
    set(this.buses.sfx, this.volumes.sfx);
    set(this.buses.ambience, this.volumes.ambience);
    set(this.buses.ui, this.volumes.ui);
  }

  private applyListener(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    const [x, y, z] = this.listenerPos;
    const [fx, fy, fz] = this.listenerFwd;
    try {
      if (L.positionX) {
        L.positionX.value = x;
        L.positionY.value = y;
        L.positionZ.value = z;
        L.forwardX.value = fx;
        L.forwardY.value = fy;
        L.forwardZ.value = fz;
        L.upX.value = 0;
        L.upY.value = 1;
        L.upZ.value = 0;
      } else {
        L.setPosition(x, y, z);
        L.setOrientation(fx, fy, fz, 0, 1, 0);
      }
    } catch {
      /* ignore */
    }
  }
}

function clampRate(r: number): number {
  return Number.isFinite(r) ? Math.min(4, Math.max(0.1, r)) : 1;
}

function isFiniteVec(v: Vec3): boolean {
  return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

function setPannerPosition(p: PannerNode, v: Vec3): void {
  if (p.positionX) {
    p.positionX.value = v[0];
    p.positionY.value = v[1];
    p.positionZ.value = v[2];
  } else {
    p.setPosition(v[0], v[1], v[2]);
  }
}

/**
 * A loop handle that exists before audio is unlocked and (re)binds to real nodes when possible.
 * Continuous recipes run as a single voice; other sounds are re-triggered on a schedule.
 */
class VirtualLoop implements LoopHandle {
  private volume: number;
  private rate: number;
  private position: Vec3 | undefined;
  private stopped = false;
  private gain: GainNode | null = null;
  private panner: PannerNode | null = null;
  private voice: LoopVoice | null = null;
  private nextAt = 0;

  constructor(
    private readonly engine: WebAudioEngine,
    private readonly id: SoundId,
    private readonly opts: PlayOptions,
  ) {
    this.volume = Math.max(0, Number.isFinite(opts.volume ?? 1) ? (opts.volume ?? 1) : 1);
    this.rate = Math.max(0, Number.isFinite(opts.rate ?? 1) ? (opts.rate ?? 1) : 1);
    this.position = opts.position && isFiniteVec(opts.position) ? [opts.position[0], opts.position[1], opts.position[2]] : undefined;
  }

  ensureStarted(): void {
    if (this.stopped || this.gain) return;
    const ctx = this.engine.audioContext;
    const synth = this.engine.synthesizer;
    const def = SOUND_DEFS[this.id];
    if (!ctx || !synth || !def) return;
    try {
      const bus = this.engine.bus(this.opts.bus ?? def.bus);
      if (!bus) return;
      const t = ctx.currentTime + 0.01;
      this.gain = ctx.createGain();
      this.gain.gain.setValueAtTime(0, t);
      this.gain.gain.linearRampToValueAtTime(this.volume * def.level, t + 0.4);
      let tail: AudioNode = this.gain;
      if (this.position) {
        this.panner = this.engine.makePanner(def.refDistance, this.position);
        this.gain.connect(this.panner);
        tail = this.panner;
      }
      tail.connect(bus);
      const recipe = LOOP_RECIPES[this.id];
      if (recipe) this.voice = recipe(synth, this.gain, t, this.rate);
      else this.nextAt = t;
    } catch {
      this.gain = null;
    }
  }

  tick(now: number): void {
    if (this.stopped || !this.gain || this.voice) return;
    const def = SOUND_DEFS[this.id];
    const synth = this.engine.synthesizer;
    if (!synth || !def) return;
    // schedule slightly ahead so frame jitter doesn't cause gaps
    let guard = 0;
    while (this.nextAt < now + 0.12 && guard++ < 8) {
      const at = Math.max(this.nextAt, now);
      if (this.rate > 0.001) {
        try {
          ONE_SHOTS[this.id](synth, this.gain, at, { rate: clampRate(this.rate), vol: 1 });
        } catch {
          /* ignore */
        }
      }
      const [a, b] = def.retrigger ?? [1, 1];
      this.nextAt = at + (a + Math.random() * (b - a)) / Math.max(0.25, this.rate || 1);
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Number.isFinite(v) ? v : 0);
    const ctx = this.engine.audioContext;
    if (this.gain && ctx && !this.stopped) this.gain.gain.setTargetAtTime(this.volume * SOUND_DEFS[this.id].level, ctx.currentTime, 0.05);
  }

  setRate(r: number): void {
    this.rate = Math.max(0, Number.isFinite(r) ? r : 0);
    const ctx = this.engine.audioContext;
    if (this.voice && ctx && !this.stopped) this.voice.setRate(this.rate, ctx.currentTime);
  }

  setPosition(p: Vec3): void {
    if (!isFiniteVec(p)) return;
    // copy: callers often reuse one scratch array
    if (this.position) {
      this.position[0] = p[0];
      this.position[1] = p[1];
      this.position[2] = p[2];
    } else {
      this.position = [p[0], p[1], p[2]];
    }
    if (this.panner) {
      setPannerPosition(this.panner, this.position);
      return;
    }
    // Started without a position (2D): splice a panner in now so the loop becomes positional.
    const def = SOUND_DEFS[this.id];
    const ctx = this.engine.audioContext;
    const bus = this.engine.bus(this.opts.bus ?? def.bus);
    if (!this.gain || !ctx || !bus || this.stopped) return;
    try {
      const panner = this.engine.makePanner(def.refDistance, this.position);
      this.gain.disconnect();
      this.gain.connect(panner).connect(bus);
      this.panner = panner;
    } catch {
      /* ignore */
    }
  }

  setPanningModel(model: PanningModelType): void {
    if (this.panner && this.panner.panningModel !== model) {
      try {
        this.panner.panningModel = model;
      } catch {
        /* ignore */
      }
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.engine.forget(this);
    const ctx = this.engine.audioContext;
    if (!ctx || !this.gain) return;
    try {
      const t = ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setTargetAtTime(0, t, 0.05);
      this.voice?.stop(t + 0.3);
      const g = this.gain;
      const p = this.panner;
      setTimeout(() => {
        try {
          g.disconnect();
          p?.disconnect();
        } catch {
          /* ignore */
        }
      }, 400);
    } catch {
      /* ignore */
    }
  }
}
