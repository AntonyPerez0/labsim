/**
 * LabSim engine: owns the renderer, post-fx, first-person player, collision, interaction, camera
 * focus, audio and the procedural texture/material libraries. See `types.ts` for the contract.
 *
 * Store integration (via `mutate()` / `emit()` from `@/core/store`):
 *  - writes `ui.prompt` (only on change), `ui.pointerLocked`, `session.player` (≈10 Hz, on change)
 *  - emits `player.interacted`, `player.enteredLocation`, `player.inspected`
 *  - reads `ui.overlay` (walk/look/interact only when 'none'), `session.activeTool`,
 *    `progress.settings` (mouseSensitivity, invertY, fov, reducedMotion, volumes, quality)
 */
import {
  Box3,
  Color,
  Euler,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  NoToneMapping,
  type Camera,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { emit, mutate, store } from '@/core/store';
import type { QualityPreset } from '@/core/state';
import type { CameraPose, ColliderBox, Engine, Interactable, LocationAnchor, Vec3 } from './types';
import { WebAudioEngine } from './audio/audioEngine';
import { CanvasTextureLibrary } from './textures/library';
import { PbrMaterialLibrary } from './materials';
import { ColliderSet } from './collision';
import { LocationTracker } from './locations';
import { PlayerController, type MoveIntent, type FootSurface } from './player';
import { InputManager } from './input';
import {
  touch,
  touchClear,
  touchConsumeCrouch,
  touchConsumeJump,
  touchConsumeLook,
  touchNextPress,
  TOUCH_LOOK_RADIANS_PER_PIXEL,
  primaryTouch,
} from './touch';
import { InteractionSystem } from './interaction';
import { CameraFocus } from './focus';
import { ViewCapture } from './capture';
import type { PostFx } from './postfx';
import { createRenderer, setupEnvironment, ShadowPolicy, threeToneMapping } from './renderer';
import { CheapMaterialSwapper } from './cheapMaterials';
import { getQuality, resolvePixelRatio, type QualitySettings } from './quality';
import type { Prompt } from './prompt';

const LOOK_RADIANS_PER_PIXEL = 0.0022;
/** Player physics sub-step (s) and the longest frame simulated in real time. */
const PLAYER_STEP = 1 / 45;
const MAX_PLAYER_DT = 0.25;
const POSE_SYNC_SECONDS = 0.1;
const SHADOW_SCAN_SECONDS = 1;
/** Shadow maps refresh at most this often while something moves (markShadowsDirty). */
const POSE_COMMIT_MS = 66;
const SHADOW_MIN_INTERVAL_MS = 100;
/** …and at least this often regardless, to catch any movement nobody reported. */
const SHADOW_SAFETY_MS = 2000;
/** Dynamic resolution thresholds (mean frame time over 1 s). */
const DRS_SLOW_MS = 20; // < 50 fps → lower the render scale
const DRS_FAST_MS = 12; // > 83 fps for 3 s → raise it again
const DRS_MIN = 0.6;

/**
 * How often to draw the 3D scene under an overlay (ms; 0 = every frame). Opaque full-screen UIs
 * hide the lab entirely; dimmed/blurred menus show it but nothing there needs 100+ fps.
 */
function overlayRenderInterval(kind: string): number {
  switch (kind) {
    case 'computer':
    case 'manual':
    case 'flashcards':
    case 'drill':
    case 'certification':
      return 500;
    case 'main-menu':
    case 'pause':
    case 'settings':
    case 'quiz':
    case 'debrief':
    case 'briefing':
    case 'rank-up':
    case 'controls':
    case 'teach-card':
    case 'info':
      return 33;
    default:
      return 0; // none, tablet, inspect, tickets, notebook, sandbox: the lab is the view
  }
}
const DEFAULT_FOCUS_MS = 650;
const DEFAULT_RELEASE_MS = 450;

export class LabEngine implements Engine {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(70, 16 / 9, 0.03, 80);
  readonly audio = new WebAudioEngine();
  readonly textures = new CanvasTextureLibrary();
  readonly materials = new PbrMaterialLibrary(this.textures);

  /** First-person controller (exposed for debugging / tests). */
  readonly player = new PlayerController();
  readonly colliders = new ColliderSet();
  readonly locations = new LocationTracker();

  private _renderer: WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  /** Post-fx chain; loaded on demand (`postprocessing` + `n8ao` are a separate chunk) and null on potato. */
  private postfx: PostFx | null = null;
  private postfxLoading: Promise<void> | null = null;
  private postfxFailed = false;
  /** PMREM of the lab room (built on first use; potato never builds it). */
  private envTexture: Texture | null = null;
  private envWanted = false;
  /** Set once boot (or the first frame) asked for the real pipeline; see applyPipeline(). */
  private started = false;
  private readonly cheap = new CheapMaterialSwapper();
  private shadowPolicy: ShadowPolicy | null = null;
  private input: InputManager | null = null;
  private readonly interaction: InteractionSystem;
  private readonly focusCtl = new CameraFocus();
  private readonly capturer = new ViewCapture();
  private readonly captureAt = new WeakMap<CanvasRenderingContext2D, number>();
  private captureScratch: CanvasRenderingContext2D | null = null;
  private readonly frameCallbacks = new Set<(dt: number, t: number) => void>();
  private failedCallbacks = new WeakSet<(dt: number, t: number) => void>();

  private quality: QualitySettings = getQuality('high');
  private resolutionScale = 1;
  private qualityApplied = false;
  private baseFov = 70;
  private controlsEnabled = true;
  private elapsed = 0;
  private fps = 60;
  /** Honest frame statistics over the last full second (see stats()). */
  private winStart = 0;
  private winFrames = 0;
  private winSumMs = 0;
  private winMaxMs = 0;
  private frameMsAvg = 16.7;
  private frameMsMax = 16.7;
  /** Dynamic resolution (DRS) factor applied on top of the preset/user resolution scale. */
  private drsScale = 1;
  private drsCalmWindows = 0;
  private drsHoldUntil = 0;
  /** On-demand shadow maps: refresh requested + last refresh time (ms). */
  private shadowDirty = true;
  private lastShadowAt = 0;
  private shadowSafetyAt = 0;
  /** Last time the 3D scene was actually drawn (ms) — used to throttle behind full-screen overlays. */
  private lastRenderAt = 0;
  private renderIntervalMs = 0;
  private poseTimer = 0;
  /** Starts "due" so the first frame applies the shadow policy before anything is rendered. */
  private shadowTimer = SHADOW_SCAN_SECONDS;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private initPromise: Promise<void> | null = null;
  private lastErrorAt = 0;

  // scratch (no per-frame allocations)
  /** A mentor line was on screen last frame — Space then means "continue", never "jump". */
  private dialogueShownLastFrame = false;
  private readonly intent: MoveIntent = { forward: 0, right: 0, fast: false, jump: false, toggleCrouch: false };
  private readonly mouse = { dx: 0, dy: 0 };
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly headPose = { position: this.headPos, quaternion: this.headQuat, fov: 70 };
  private readonly tmpDir = new Vector3();
  private readonly listenerPos: Vec3 = [0, 0, 0];
  private readonly listenerFwd: Vec3 = [0, 0, -1];
  private readonly nextPress = () => this.input?.nextPress() ?? touchNextPress() ?? null;
  private readonly playerOpts = { reducedMotion: false, onFootstep: (i: number, s: FootSurface) => this.footstep(i, s) };
  private readonly footstep = (intensity: number, surface: FootSurface) => {
    this.audio.playVariant('footstep', surface, { volume: 0.3 + 0.35 * intensity, rate: 0.96 + Math.random() * 0.08 });
  };

  constructor() {
    this.camera.rotation.order = 'YXZ';
    this.scene.background = new Color('#d6d6d2');
    this.interaction = new InteractionSystem({
      writePrompt: (p: Prompt | null) =>
        mutate((s) => {
          s.ui.prompt = p;
        }),
      lookingAtChanged: () => {
        this.poseTimer = POSE_SYNC_SECONDS; // sync on the next frame
      },
      inspected: (id) => emit('player.inspected', { interactableId: id }),
      interacted: (i, verb) => {
        this.audio.play('ui-click');
        emit('player.interacted', { interactableId: i.id, verb: verb.label, tool: store.getState().session.activeTool });
      },
      denied: () => this.audio.play('ui-fail', { volume: 0.6 }),
      outline: (meshes) => {
        if (!this.postfx?.hasOutline) return false;
        this.postfx.setOutline(meshes);
        return true;
      },
    });
  }

  get renderer(): WebGLRenderer {
    if (!this._renderer) throw new Error('engine.renderer accessed before engine.init()');
    return this._renderer;
  }

  // --- lifecycle ---------------------------------------------------------------------------------

  init(canvas: HTMLCanvasElement): Promise<void> {
    if (!this.initPromise) this.initPromise = this.doInit(canvas);
    return this.initPromise;
  }

  private async doInit(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    ensureCanvasSized(canvas);
    const renderer = createRenderer(canvas);
    this._renderer = renderer;
    this.textures.setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
    this.shadowPolicy = new ShadowPolicy(renderer, this.scene);
    renderer.toneMapping = threeToneMapping(); // until (unless) the post-fx chain takes over
    // Only presets with post-fx download/parse the post-processing chunk (started by setQuality
    // below); boot awaits `pipelineReady()` before the first frame so shaders compile only once.

    this.input = new InputManager(canvas, {
      onGesture: () => {
        if (!this.audio.running) {
          this.audio.unlock();
          this.applyVolumes();
        }
        return this.audio.running;
      },
      onViewClick: () => {
        const s = store.getState();
        // Allowed while a release tween is still running (controls come back when it ends).
        if (s.ui.overlay.kind === 'none' && this.controlsEnabled && !this.focusCtl.holding) this.requestPointerLock();
      },
      allowJump: () => !this.dialogueShownLastFrame && !store.getState().session.dialogue,
      onPointerLockChange: (locked) => {
        // Lock requests resolve asynchronously: if an overlay opened (or a focus started) in the
        // meantime, the mouse must stay free for the UI.
        if (locked && (store.getState().ui.overlay.kind !== 'none' || this.focusCtl.holding)) {
          this.exitPointerLock();
          return;
        }
        if (store.getState().ui.pointerLocked !== locked) {
          mutate((s) => {
            s.ui.pointerLocked = locked;
          });
        }
      },
    });

    // Initial pose & settings from the store.
    const st = store.getState();
    const p = st.session.player;
    this.player.teleport(p.position[0], p.position[1], p.position[2], p.yaw, p.pitch);
    this.setFov(st.progress.settings.fov);
    this.qualityApplied = false;
    this.setQuality(st.progress.settings.quality, st.progress.settings.resolutionScale);
    this.applyVolumes();

    // Overlays steal input: release pointer lock and held keys when one opens.
    store.subscribe((s, prev) => {
      if (s.ui.overlay !== prev.ui.overlay && s.ui.overlay.kind !== 'none') {
        this.input?.clear();
        touchClear();
        this.exitPointerLock();
      }
      if (s.progress.settings !== prev.progress.settings) {
        const a = s.progress.settings;
        const b = prev.progress.settings;
        if (a.masterVolume !== b.masterVolume || a.sfxVolume !== b.sfxVolume || a.ambienceVolume !== b.ambienceVolume) this.applyVolumes();
      }
    });

    // Background tab: the loop stops requesting frames; silence the audio graph too.
    document.addEventListener('visibilitychange', () => this.audio.setBackground(document.visibilityState === 'hidden'));

    // Resize tracking (orientation changes and the mobile URL bar fire resize / visualViewport resize).
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(canvas);
    this.resize(true);
  }

  private applyVolumes(): void {
    const s = store.getState().progress.settings;
    this.audio.setVolumes({ master: s.masterVolume, sfx: s.sfxVolume, ambience: s.ambienceVolume, ui: s.sfxVolume });
  }

  /** Start downloading the post-fx chunk early (boot calls this before the renderer exists). */
  preload(q: QualityPreset): void {
    if (getQuality(q).postFx) void import('./postfx').catch(() => undefined);
  }

  /**
   * Compile every material's shader program before the first frame (KHR_parallel_shader_compile
   * where available), after the potato material swap, so the first seconds in the lab don't hitch.
   */
  async warmup(): Promise<void> {
    const renderer = this._renderer;
    if (!renderer) return;
    if (this.envWanted && !this.envTexture) this.applyEnvironment(true);
    this.shadowPolicy?.scan(true);
    this.cheap.scan(this.scene);
    this.cheap.sync();
    this.camera.updateMatrixWorld();
    try {
      await renderer.compileAsync(this.scene, this.camera);
      // One real (hidden) frame: program linking and texture uploads happen on first use, which
      // would otherwise be a multi-second hitch on the first visible frame on weak devices.
      if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
      if (this.postfx) this.postfx.render(0);
      else renderer.render(this.scene, this.camera);
    } catch (err) {
      console.warn('[engine] shader warm-up failed (shaders compile on first use)', err);
    }
  }

  /** Resolves when the render pipeline of the active preset is in place (post-fx chunk loaded). */
  pipelineReady(): Promise<void> {
    this.started = true;
    if (this.quality.postFx && !this.postfx) return this.loadPostFx();
    return this.postfxLoading ?? Promise.resolve();
  }

  private loadPostFx(): Promise<void> {
    if (this.postfx || this.postfxFailed) return Promise.resolve();
    if (!this.postfxLoading) {
      this.postfxLoading = import('./postfx').then(
        (mod) => {
          this.postfxLoading = null;
          const renderer = this._renderer;
          if (!renderer || this.postfx || !this.quality.postFx) return;
          try {
            this.postfx = new mod.PostFx(renderer, this.scene, this.camera);
          } catch (err) {
            console.warn('[engine] post-processing unavailable, rendering directly', err);
            this.postfxFailed = true;
            this.postfx = null;
          }
          if (this.qualityApplied) this.applyPipeline();
        },
        (err) => {
          this.postfxLoading = null;
          this.postfxFailed = true;
          console.warn('[engine] post-processing failed to load, rendering directly', err);
        },
      );
    }
    return this.postfxLoading;
  }

  /**
   * Post-fx chain on/off for the active preset. Without it the scene renders straight to the canvas
   * with renderer tone mapping (same ACES curve, so LEDs/screens keep their look minus the bloom).
   */
  private applyPipeline(): void {
    const renderer = this._renderer;
    if (!renderer) return;
    // (Not during init: boot may still lower the preset — auto-detect — before anything is drawn.)
    if (this.quality.postFx && !this.postfx && this.started) void this.loadPostFx();
    if (!this.quality.postFx && this.postfx) {
      // Free the full-screen HDR targets (phones are short on memory).
      this.postfx.dispose();
      this.postfx = null;
    }
    if (this.postfx) {
      this.postfx.configure(this.quality);
      renderer.toneMapping = NoToneMapping; // tone mapping lives in the post-fx chain
      renderer.autoClear = false;
    } else {
      renderer.toneMapping = threeToneMapping();
      renderer.autoClear = true; // EffectComposer turns it off
    }
    this.resize(true);
    this.interaction.refreshHighlight();
  }

  private applyEnvironment(on: boolean): void {
    const renderer = this._renderer;
    if (!renderer) return;
    if (on) {
      if (!this.envTexture) this.envTexture = setupEnvironment(renderer, this.scene);
      else this.scene.environment = this.envTexture;
      this.materials.setEnvironment(this.envTexture);
    } else if (this.scene.environment) {
      this.scene.environment = null;
      this.materials.setEnvironment(null);
    }
  }

  private resize(force = false): void {
    const canvas = this.canvas;
    const renderer = this._renderer;
    if (!canvas || !renderer) return;
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    const dpr = resolvePixelRatio(this.quality, window.devicePixelRatio || 1, this.resolutionScale) * this.drsScale;
    if (!force && w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    renderer.setPixelRatio(dpr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (this.postfx) this.postfx.setSize(w, h);
  }

  // --- per frame ---------------------------------------------------------------------------------

  frame(dtSeconds: number): void {
    const renderer = this._renderer;
    if (!renderer || !this.input) return;
    if (!this.started) {
      this.started = true;
      if (this.quality.postFx && !this.postfx) void this.loadPostFx();
    }
    const realDt = Math.min(1, Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0));
    const dt = Math.min(0.1, realDt); // physics/tween step (stable after hitches)
    this.elapsed += dt;
    this.trackFrameTime(realDt);

    try {
      const s = store.getState();
      this.dialogueShownLastFrame = !!s.session.dialogue;
      this.renderIntervalMs = overlayRenderInterval(s.ui.overlay.kind);
      if (this.renderIntervalMs === 0) this.updateDynamicResolution(s.progress.settings.dynamicResolution !== false);
      else this.drsWindowReady = false; // throttled behind an overlay: keep the current scale
      const settings = s.progress.settings;
      const controls = this.controlsEnabled && s.ui.overlay.kind === 'none' && !this.focusCtl.active;
      const input = this.input;
      input.active = controls;

      // Look.
      input.consumeMouse(this.mouse);
      if (controls && input.locked && (this.mouse.dx || this.mouse.dy)) {
        const k = LOOK_RADIANS_PER_PIXEL * (settings.mouseSensitivity || 1);
        this.player.look(-this.mouse.dx * k, -this.mouse.dy * k * (settings.invertY ? -1 : 1));
      }
      // Touch HUD (mobile: no pointer lock) — drag deltas, same mapping as the mouse. Consumed
      // unconditionally so deltas are dropped while an overlay owns the screen.
      touchConsumeLook(this.mouse);
      if (controls && touch.enabled && (this.mouse.dx || this.mouse.dy)) {
        const k = TOUCH_LOOK_RADIANS_PER_PIXEL * (settings.mouseSensitivity || 1);
        this.player.look(-this.mouse.dx * k, -this.mouse.dy * k * (settings.invertY ? -1 : 1));
      }

      // Move.
      const it = this.intent;
      if (controls) {
        it.forward = input.axis('KeyS', 'KeyW', 'ArrowDown', 'ArrowUp');
        it.right = input.axis('KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight');
        it.fast = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
        it.jump = input.consumeJump();
        it.toggleCrouch = input.consumeCrouch();
        // Analog touch joystick overrides the digital keys while touched; the outer ring runs.
        if (touch.enabled && (touch.jx || touch.jy)) {
          it.forward = touch.jy;
          it.right = touch.jx;
          if (touch.fast) it.fast = true;
        }
        if (touchConsumeJump()) it.jump = true;
        if (touchConsumeCrouch()) it.toggleCrouch = true;
      } else {
        it.forward = it.right = 0;
        it.fast = it.jump = it.toggleCrouch = false;
      }
      // Fixed sub-steps: walking speed and jump arcs stay correct at low frame rates (up to a
      // 0.25 s hitch), and no single step is long enough to skip through a collider.
      this.playerOpts.reducedMotion = settings.reducedMotion;
      const moveDt = Math.min(MAX_PLAYER_DT, realDt);
      const steps = Math.max(1, Math.ceil(moveDt / PLAYER_STEP));
      for (let i = 0; i < steps; i++) {
        this.player.update(moveDt / steps, it, this.colliders.boxes, this.playerOpts);
        it.jump = it.toggleCrouch = false; // edge-triggered: first sub-step only
      }

      // Head pose → camera (unless a focus tween owns it).
      const pl = this.player;
      this.headPos.set(pl.headX, pl.headY, pl.headZ);
      this.euler.set(pl.pitch, pl.yaw, pl.bobRoll, 'YXZ');
      this.headQuat.setFromEuler(this.euler);
      this.headPose.fov = this.baseFov;
      if (!this.focusCtl.update(realDt, this.camera, this.headPose)) {
        this.camera.position.copy(this.headPos);
        this.camera.quaternion.copy(this.headQuat);
        if (Math.abs(this.camera.fov - this.baseFov) > 1e-3) {
          this.camera.fov += (this.baseFov - this.camera.fov) * (1 - Math.exp(-12 * dt));
          if (Math.abs(this.camera.fov - this.baseFov) < 0.01) this.camera.fov = this.baseFov;
          this.camera.updateProjectionMatrix();
        }
      }
      this.camera.updateMatrixWorld();

      // Interaction (prompt, highlight, verbs).
      this.interaction.adoptStorePrompt(s.ui.prompt);
      this.interaction.update(realDt, this.camera, controls, s.session.activeTool, this.colliders.boxes, this.nextPress);

      // Locations + pose mirror (~10 Hz).
      this.poseTimer += dt;
      if (this.poseTimer >= POSE_SYNC_SECONDS) {
        this.poseTimer = 0;
        this.syncPose();
      }

      // Audio listener follows the camera.
      this.camera.getWorldDirection(this.tmpDir);
      this.listenerPos[0] = this.camera.position.x;
      this.listenerPos[1] = this.camera.position.y;
      this.listenerPos[2] = this.camera.position.z;
      this.listenerFwd[0] = this.tmpDir.x;
      this.listenerFwd[1] = this.tmpDir.y;
      this.listenerFwd[2] = this.tmpDir.z;
      this.audio.setListener(this.listenerPos, this.listenerFwd);
      this.audio.tick();

      // World animation callbacks.
      for (const fn of this.frameCallbacks) {
        try {
          fn(dt, this.elapsed);
        } catch (err) {
          if (!this.failedCallbacks.has(fn)) {
            this.failedCallbacks.add(fn);
            console.error('[engine] onFrame callback threw (further errors from it are silenced)', err);
          }
        }
      }

      // Shadow-caster policy (cheap scene scan once per second).
      this.shadowTimer += dt;
      if (this.shadowTimer >= SHADOW_SCAN_SECONDS) {
        this.shadowTimer = 0;
        this.shadowPolicy?.scan();
        this.cheap.scan(this.scene); // potato: Lambert copies for meshes added since the last scan
      }
    } catch (err) {
      const now = performance.now();
      if (now - this.lastErrorAt > 2000) {
        this.lastErrorAt = now;
        console.error('[engine] frame update failed', err);
      }
    }

    // Behind full-screen / dimmed overlays the scene is not worth full-rate GPU time: draw it at a
    // low rate (the browser keeps showing the last frame in between).
    const now = performance.now();
    if (this.renderIntervalMs > 0 && now - this.lastRenderAt < this.renderIntervalMs) return;
    this.lastRenderAt = now;

    // Static shadow maps: refresh on request (throttled to 10 Hz) plus a slow safety refresh.
    if (renderer.shadowMap.enabled) {
      if (now - this.shadowSafetyAt > SHADOW_SAFETY_MS) {
        this.shadowSafetyAt = now;
        this.shadowDirty = true;
      }
      if (this.shadowDirty && now - this.lastShadowAt >= SHADOW_MIN_INTERVAL_MS) {
        this.shadowDirty = false;
        this.lastShadowAt = now;
        renderer.shadowMap.needsUpdate = true;
      }
    }

    if (this.envWanted && !this.envTexture) this.applyEnvironment(true);
    this.cheap.sync();
    renderer.info.reset();
    if (this.postfx) this.postfx.render(dt);
    else renderer.render(this.scene, this.camera);
  }

  markShadowsDirty(): void {
    this.shadowDirty = true;
  }

  /** Windowed frame statistics: frames really presented per second, mean and worst interval. */
  private trackFrameTime(realDt: number): void {
    const now = performance.now();
    if (this.winStart === 0) this.winStart = now;
    if (realDt > 0) {
      const ms = realDt * 1000;
      this.winFrames++;
      this.winSumMs += ms;
      if (ms > this.winMaxMs) this.winMaxMs = ms;
    }
    if (now - this.winStart >= 1000) {
      const secs = (now - this.winStart) / 1000;
      this.fps = this.winFrames / secs;
      this.frameMsAvg = this.winFrames ? this.winSumMs / this.winFrames : 0;
      this.frameMsMax = this.winMaxMs;
      this.winStart = now;
      this.winFrames = 0;
      this.winSumMs = 0;
      this.winMaxMs = 0;
      this.drsWindowReady = true;
    }
  }

  private drsWindowReady = false;
  private lastPoseCommitAt = 0;

  /**
   * Dynamic resolution: once per second, if the mean frame took longer than ~50 fps or a single
   * frame hitched badly, lower the render scale; after 3 calm seconds, raise it back. Changes are
   * held for 2 s so shader compiles / window resizes don't cause oscillation.
   */
  private updateDynamicResolution(enabled: boolean): void {
    if (!this.drsWindowReady) return;
    this.drsWindowReady = false;
    const now = performance.now();
    if (!enabled) {
      if (this.drsScale !== 1) {
        this.drsScale = 1;
        this.resize(true);
      }
      return;
    }
    if (now < this.drsHoldUntil) return;
    const slow = this.frameMsAvg > DRS_SLOW_MS;
    const fast = this.frameMsAvg < DRS_FAST_MS && this.frameMsMax < DRS_SLOW_MS * 2;
    let next = this.drsScale;
    if (slow) {
      this.drsCalmWindows = 0;
      next = Math.max(DRS_MIN, this.drsScale * 0.85);
    } else if (fast) {
      this.drsCalmWindows++;
      if (this.drsCalmWindows >= 3) {
        this.drsCalmWindows = 0;
        next = Math.min(1, this.drsScale * 1.1);
      }
    } else {
      this.drsCalmWindows = 0;
    }
    if (Math.abs(next - this.drsScale) > 0.01) {
      this.drsScale = next;
      this.drsHoldUntil = now + 2000;
      this.resize(true);
    }
  }

  private syncPose(): void {
    const pl = this.player;
    const loc = this.locations.update(pl.x, pl.z);
    const cur = store.getState().session.player;
    const lookingAt = this.interaction.targetId;
    const x = round(pl.x, 100);
    const y = round(pl.y, 100);
    const z = round(pl.z, 100);
    const yaw = round(pl.yaw, 1000);
    const pitch = round(pl.pitch, 1000);
    // Discrete changes commit at once; the continuous pose is committed at most ~15×/s. Every
    // commit runs immer plus every store subscriber and React selector, which at 144 Hz while
    // walking/looking is a steady main-thread tax that shows up as stutter.
    const discrete = cur.locationId !== loc.current || cur.lookingAt !== lookingAt || cur.crouched !== pl.crouched;
    const moved = cur.position[0] !== x || cur.position[1] !== y || cur.position[2] !== z || cur.yaw !== yaw || cur.pitch !== pitch;
    const now = performance.now();
    if (discrete || (moved && now - this.lastPoseCommitAt >= POSE_COMMIT_MS)) {
      this.lastPoseCommitAt = now;
      mutate((s) => {
        s.session.player = { position: [x, y, z], yaw, pitch, locationId: loc.current, lookingAt, crouched: pl.crouched };
      });
    }
    if (loc.entered) emit('player.enteredLocation', { locationId: loc.entered });
  }

  stats(): ReturnType<Engine['stats']> {
    const info = this._renderer?.info;
    return {
      fps: Math.round(this.fps * 10) / 10,
      frameMsAvg: Math.round(this.frameMsAvg * 10) / 10,
      frameMsMax: Math.round(this.frameMsMax * 10) / 10,
      renderScale: Math.round(this.drsScale * 100) / 100,
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      textures: info?.memory.textures ?? 0,
      geometries: info?.memory.geometries ?? 0,
    };
  }

  // --- settings ----------------------------------------------------------------------------------

  setQuality(q: QualityPreset, resolutionScale = 1): void {
    const preset = getQuality(q);
    const scale = Number.isFinite(resolutionScale) ? resolutionScale : 1;
    if (this.qualityApplied && preset === this.quality && scale === this.resolutionScale) return;
    this.quality = preset;
    this.resolutionScale = scale;
    const renderer = this._renderer;
    if (!renderer) return; // applied in init()
    this.qualityApplied = true;
    this.drsScale = 1;
    this.drsHoldUntil = performance.now() + 3000; // let new shaders compile before judging speed
    this.shadowDirty = true;
    this.shadowPolicy?.setQuality(preset);
    // The PMREM is built lazily (warm-up / first frame), so a preset that is lowered right after
    // init (auto-detect) never pays for it.
    this.envWanted = preset.environment;
    if (!preset.environment || this.envTexture) this.applyEnvironment(preset.environment);
    // Highlight variants are clones of whatever material a mesh shows: drop them before swapping.
    this.interaction.clearHighlight();
    this.cheap.setEnabled(preset.cheapMaterials, this.scene);
    this.textures.setAnisotropy(preset.anisotropy);
    this.audio.setHrtf(preset.hrtf);
    this.applyPipeline(); // resizes and re-applies the highlight
  }

  /** Active quality settings (debug overlay). */
  get qualitySettings(): QualitySettings {
    return this.quality;
  }

  setFov(fov: number): void {
    this.baseFov = Math.min(110, Math.max(40, Number.isFinite(fov) ? fov : 70));
  }

  // --- registration ------------------------------------------------------------------------------

  registerInteractable(i: Interactable): () => void {
    return this.interaction.register(i);
  }

  registerLocation(a: LocationAnchor): () => void {
    return this.locations.add(a);
  }

  addCollider(box: ColliderBox): () => void {
    return this.colliders.add(box);
  }

  addColliderFromObject(obj: Object3D, padding = 0): () => void {
    obj.updateWorldMatrix(true, true);
    const b = new Box3().setFromObject(obj);
    if (b.isEmpty()) return () => {};
    if (padding) b.expandByScalar(padding);
    return this.colliders.add({ min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] });
  }

  onFrame(fn: (dt: number, t: number) => void): () => void {
    this.frameCallbacks.add(fn);
    return () => {
      this.frameCallbacks.delete(fn);
    };
  }

  // --- camera focus ------------------------------------------------------------------------------

  focus(pose: CameraPose, durationMs = DEFAULT_FOCUS_MS): Promise<void> {
    this.exitPointerLock();
    this.input?.clear();
    touchClear();
    return this.focusCtl.focus(this.camera, pose, durationMs);
  }

  releaseFocus(durationMs = DEFAULT_RELEASE_MS): Promise<void> {
    return this.focusCtl.release(this.camera, durationMs);
  }

  /** True from `focus()` until `releaseFocus()` is called (not during the release tween). */
  isFocused(): boolean {
    return this.focusCtl.holding;
  }

  teleportPlayer(position: Vec3, yaw: number, pitch = 0): void {
    if (![position[0], position[1], position[2], yaw, pitch].every(Number.isFinite)) {
      console.warn('[engine] teleportPlayer ignored non-finite pose', position, yaw, pitch);
      return;
    }
    this.player.teleport(position[0], position[1], position[2], yaw, pitch);
    this.poseTimer = POSE_SYNC_SECONDS;
  }

  setControlsEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
    if (!enabled) {
      this.input?.clear();
      touchClear();
    }
  }

  requestPointerLock(): void {
    this.audio.unlock();
    // Touch devices look by dragging; pointer lock there only causes lock/unlock → pause loops.
    if (primaryTouch()) return;
    this.input?.requestLock();
  }

  exitPointerLock(): void {
    this.input?.exitLock();
  }

  captureView(camera: Camera, target: CanvasRenderingContext2D, width: number, height: number): void {
    const renderer = this._renderer;
    if (!renderer) return;
    try {
      if (this.quality.reducedDetail) {
        // Potato: webcam streams are the priciest extra renders (a 1280×720 HDR pass + readback).
        // At most ~4 captures/s per target, rendered at ≤ 480 px wide and scaled up.
        const now = performance.now();
        if (now - (this.captureAt.get(target) ?? -1e9) < 250) return;
        this.captureAt.set(target, now);
        const k = Math.min(1, 480 / Math.max(1, width));
        if (k < 1) {
          const sw = Math.max(1, Math.round(width * k));
          const sh = Math.max(1, Math.round(height * k));
          const sc = (this.captureScratch ??= document.createElement('canvas').getContext('2d')!);
          if (sc.canvas.width !== sw || sc.canvas.height !== sh) {
            sc.canvas.width = sw;
            sc.canvas.height = sh;
          }
          this.capturer.capture(renderer, this.scene, camera, sc, sw, sh);
          target.imageSmoothingEnabled = true;
          target.drawImage(sc.canvas, 0, 0, sw, sh, 0, 0, width, height);
          return;
        }
      }
      this.capturer.capture(renderer, this.scene, camera, target, width, height);
    } catch (err) {
      console.error('[engine] captureView failed', err);
    }
  }
}

function round(v: number, k: number): number {
  return Math.round(v * k) / k;
}

/**
 * If nothing styles the canvas (it still has the 300×150 intrinsic size), make it fill the
 * viewport so the engine has a sensible size. The UI stylesheet normally does this.
 */
function ensureCanvasSized(canvas: HTMLCanvasElement): void {
  if (canvas.style.width || canvas.style.height) return;
  const cs = getComputedStyle(canvas);
  if (cs.width === `${canvas.width}px` && cs.height === `${canvas.height}px` && canvas.width === 300 && canvas.height === 150) {
    canvas.style.display = 'block';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
  }
}
