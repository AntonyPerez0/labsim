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
  type Camera,
  type Object3D,
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
import { InteractionSystem } from './interaction';
import { CameraFocus } from './focus';
import { ViewCapture } from './capture';
import { PostFx } from './postfx';
import { createRenderer, setupEnvironment, ShadowPolicy, threeToneMapping } from './renderer';
import { getQuality, resolvePixelRatio, type QualitySettings } from './quality';
import type { Prompt } from './prompt';

const LOOK_RADIANS_PER_PIXEL = 0.0022;
/** Player physics sub-step (s) and the longest frame simulated in real time. */
const PLAYER_STEP = 1 / 45;
const MAX_PLAYER_DT = 0.25;
const POSE_SYNC_SECONDS = 0.1;
const SHADOW_SCAN_SECONDS = 1;
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
  private postfx: PostFx | null = null;
  private shadowPolicy: ShadowPolicy | null = null;
  private input: InputManager | null = null;
  private readonly interaction: InteractionSystem;
  private readonly focusCtl = new CameraFocus();
  private readonly capturer = new ViewCapture();
  private readonly frameCallbacks = new Set<(dt: number, t: number) => void>();
  private failedCallbacks = new WeakSet<(dt: number, t: number) => void>();

  private quality: QualitySettings = getQuality('high');
  private resolutionScale = 1;
  private qualityApplied = false;
  private baseFov = 70;
  private controlsEnabled = true;
  private elapsed = 0;
  private fps = 60;
  private poseTimer = 0;
  /** Starts "due" so the first frame applies the shadow policy before anything is rendered. */
  private shadowTimer = SHADOW_SCAN_SECONDS;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private initPromise: Promise<void> | null = null;
  private lastErrorAt = 0;

  // scratch (no per-frame allocations)
  private readonly intent: MoveIntent = { forward: 0, right: 0, fast: false, jump: false, toggleCrouch: false };
  private readonly mouse = { dx: 0, dy: 0 };
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly headPose = { position: this.headPos, quaternion: this.headQuat, fov: 70 };
  private readonly tmpDir = new Vector3();
  private readonly listenerPos: Vec3 = [0, 0, 0];
  private readonly listenerFwd: Vec3 = [0, 0, -1];
  private readonly nextPress = () => this.input?.nextPress() ?? null;
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
    this.materials.setEnvironment(setupEnvironment(renderer, this.scene));
    this.shadowPolicy = new ShadowPolicy(renderer, this.scene);
    try {
      this.postfx = new PostFx(renderer, this.scene, this.camera);
    } catch (err) {
      console.warn('[engine] post-processing unavailable, rendering directly', err);
      this.postfx = null;
      renderer.toneMapping = threeToneMapping();
    }

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
        this.exitPointerLock();
      }
      if (s.progress.settings !== prev.progress.settings) {
        const a = s.progress.settings;
        const b = prev.progress.settings;
        if (a.masterVolume !== b.masterVolume || a.sfxVolume !== b.sfxVolume || a.ambienceVolume !== b.ambienceVolume) this.applyVolumes();
      }
    });

    // Resize tracking.
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(canvas);
    this.resize(true);
  }

  private applyVolumes(): void {
    const s = store.getState().progress.settings;
    this.audio.setVolumes({ master: s.masterVolume, sfx: s.sfxVolume, ambience: s.ambienceVolume, ui: s.sfxVolume });
  }

  private resize(force = false): void {
    const canvas = this.canvas;
    const renderer = this._renderer;
    if (!canvas || !renderer) return;
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    const dpr = resolvePixelRatio(this.quality, window.devicePixelRatio || 1, this.resolutionScale);
    if (!force && w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    renderer.setPixelRatio(dpr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.postfx) this.postfx.setSize(w, h);
    else renderer.setSize(w, h, false);
  }

  // --- per frame ---------------------------------------------------------------------------------

  frame(dtSeconds: number): void {
    const renderer = this._renderer;
    if (!renderer || !this.input) return;
    const realDt = Math.min(1, Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0));
    const dt = Math.min(0.1, realDt); // physics/tween step (stable after hitches)
    this.elapsed += dt;
    if (realDt > 0) this.fps = this.fps * 0.92 + Math.min(240, 1 / realDt) * 0.08;

    try {
      const s = store.getState();
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

      // Move.
      const it = this.intent;
      if (controls) {
        it.forward = input.axis('KeyS', 'KeyW', 'ArrowDown', 'ArrowUp');
        it.right = input.axis('KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight');
        it.fast = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
        it.jump = input.consumeJump();
        it.toggleCrouch = input.consumeCrouch();
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
      }
    } catch (err) {
      const now = performance.now();
      if (now - this.lastErrorAt > 2000) {
        this.lastErrorAt = now;
        console.error('[engine] frame update failed', err);
      }
    }

    renderer.info.reset();
    if (this.postfx) this.postfx.render(dt);
    else renderer.render(this.scene, this.camera);
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
    const changed =
      cur.position[0] !== x ||
      cur.position[1] !== y ||
      cur.position[2] !== z ||
      cur.yaw !== yaw ||
      cur.pitch !== pitch ||
      cur.locationId !== loc.current ||
      cur.lookingAt !== lookingAt ||
      cur.crouched !== pl.crouched;
    if (changed) {
      mutate((s) => {
        s.session.player = { position: [x, y, z], yaw, pitch, locationId: loc.current, lookingAt, crouched: pl.crouched };
      });
    }
    if (loc.entered) emit('player.enteredLocation', { locationId: loc.entered });
  }

  stats(): { fps: number; drawCalls: number; triangles: number; textures: number; geometries: number } {
    const info = this._renderer?.info;
    return {
      fps: Math.round(this.fps * 10) / 10,
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
    this.shadowPolicy?.setQuality(preset);
    this.postfx?.configure(preset);
    this.textures.setAnisotropy(preset.anisotropy);
    this.audio.setHrtf(preset.hrtf);
    this.resize(true);
    this.interaction.refreshHighlight();
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
    if (!enabled) this.input?.clear();
  }

  requestPointerLock(): void {
    this.audio.unlock();
    this.input?.requestLock();
  }

  exitPointerLock(): void {
    this.input?.exitLock();
  }

  captureView(camera: Camera, target: CanvasRenderingContext2D, width: number, height: number): void {
    const renderer = this._renderer;
    if (!renderer) return;
    try {
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
