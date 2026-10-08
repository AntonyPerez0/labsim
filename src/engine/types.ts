/**
 * Engine contract — the services the world builders, HUD and computer UI use.
 * Implemented in `src/engine/engine.ts` (owned by the engine team) and exposed as the singleton
 * `engine` from `@/engine`.
 */
import type { Camera, Object3D, PerspectiveCamera, Scene, Texture, WebGLRenderer, Material } from 'three';
import type { QualityPreset, ToolId } from '@/core/state';

export type Vec3 = [number, number, number];

export interface InteractVerb {
  /** Key that triggers it: E (primary), F (secondary), R, G, Q. Left-click also triggers E. */
  key: 'E' | 'F' | 'R' | 'G' | 'Q';
  label: string;
  disabled?: boolean;
  /** Tool that must be active for this verb to be enabled (e.g. 'spare-fuse-5v', 'multimeter'). */
  requiresTool?: ToolId;
  run(): void;
}

export interface Interactable {
  /** Stable prop id, e.g. "rig.wall-e.tablet", "power.fuse.5v", "desk.player.computer". */
  id: string;
  /**
   * Raycast target (meshes inside are tested recursively). Hidden objects (`visible = false`) are
   * ignored; for an invisible, enlarged hit area add a mesh whose *material* has `visible = false`.
   */
  object: Object3D;
  /** Short name shown above the prompt, e.g. "Status tablet — WALL-E". */
  label(): string;
  /** Verbs available right now (re-evaluated each frame while targeted). */
  verbs(): InteractVerb[];
  /** Max interaction distance in metres (default 2.2). */
  reach?: number;
  /** Draw an outline/emissive highlight when targeted (default true). */
  highlight?: boolean;
}

export interface LocationAnchor {
  /** Stable location id used by lessons, e.g. "loc.workstation", "loc.rack-a", "loc.power-wall". */
  id: string;
  label: string;
  center: Vec3;
  /** Horizontal radius in metres. */
  radius: number;
}

/** Axis-aligned box collider in world space (metres). */
export interface ColliderBox {
  min: Vec3;
  max: Vec3;
}

/** A camera pose used for zoomed views (sitting at the computer, using a tablet, inspecting a part). */
export interface CameraPose {
  position: Vec3;
  lookAt: Vec3;
  fov?: number;
}

export type SoundId =
  | 'stepper'
  | 'solenoid'
  | 'servo'
  | 'relay'
  | 'fan'
  | 'gpu-fans'
  | 'fluorescent'
  | 'device-beep'
  | 'device-approved'
  | 'device-error'
  | 'printer'
  | 'keyboard'
  | 'mouse-click'
  | 'footstep'
  | 'door'
  | 'room-tone'
  | 'ui-click'
  | 'ui-hover'
  | 'ui-success'
  | 'ui-fail'
  | 'ui-xp'
  | 'ui-achievement'
  | 'ui-ticket'
  | 'ui-type'
  | 'fuse-pop'
  | 'spark'
  | 'plug-in'
  | 'unplug'
  | 'switch-toggle'
  | 'card-insert'
  | 'nfc-tap';

export interface PlayOptions {
  /** World position for 3D-positioned sounds; omit for UI/2D sounds. */
  position?: Vec3;
  volume?: number;
  /** Playback-rate / pitch multiplier. */
  rate?: number;
  bus?: 'sfx' | 'ambience' | 'ui';
}

export interface LoopHandle {
  setVolume(v: number): void;
  setRate(r: number): void;
  setPosition(p: Vec3): void;
  stop(): void;
}

export interface AudioEngine {
  /** Must be called from a user gesture before audio plays (browser autoplay policy). */
  unlock(): void;
  play(id: SoundId, opts?: PlayOptions): void;
  loop(id: SoundId, opts?: PlayOptions): LoopHandle;
  setListener(position: Vec3, forward: Vec3): void;
  setVolumes(v: { master: number; sfx: number; ambience: number; ui: number }): void;
}

/**
 * Procedural texture library (canvas-generated; cached by key and shared — `clone()` before changing
 * `repeat`/`offset`). Tiling textures carry `texture.userData.tileSize = [widthM, heightM]`, the
 * physical size of one tile. Palette materials that use them are box-projected in object space, so
 * they tile at real-world scale on any `BoxGeometry(w, h, d)` without UV work (bake sizes into the
 * geometry rather than scaling meshes).
 */
export interface TextureLibrary {
  perforatedSteel(opts?: { holeMm?: number; pitchMm?: number; slots?: boolean }): { map: Texture; alphaMap: Texture; normalMap?: Texture };
  hexMesh(): { map: Texture; alphaMap: Texture };
  brushedAluminium(): { map: Texture; roughnessMap: Texture };
  plaLayers(color?: string): { map: Texture; normalMap: Texture };
  floorTiles(): { map: Texture; roughnessMap: Texture };
  ceilingTiles(): { map: Texture };
  wallPaint(): { map: Texture };
  /** Printed label tape (black text on white), e.g. "MEGATRON CFD". */
  label(text: string, opts?: { bg?: string; fg?: string; font?: string; widthPx?: number; heightPx?: number }): Texture;
  /** Arbitrary canvas → texture, updated when you call `texture.needsUpdate = true`. */
  canvas(widthPx: number, heightPx: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: Texture };
}

/**
 * Shared PBR material palette so the whole lab reads as one art direction. Never mutate a palette
 * material for one object: make a variant with `get('name', () => palette.x.clone())` (clones keep
 * the box projection). LED materials are emissive well above the bloom threshold; keep other
 * emissives (screens ≈ 1–1.4, light panels ≈ 2) moderate so only LEDs/screens glow.
 */
export interface MaterialLibrary {
  blackPla: Material;
  blackSteel: Material;
  perforatedSteel: Material;
  hexMesh: Material;
  aluminium: Material;
  labwhite: Material;
  screenGlass: Material;
  rubber: Material;
  copper: Material;
  pcbGreen: Material;
  ledGreen: Material;
  ledRed: Material;
  ledBlue: Material;
  ledAmber: Material;
  wallPaint: Material;
  floor: Material;
  ceiling: Material;
  wood: Material;
  plasticGrey: Material;
  /** Get or create a named variant (cached). */
  get(name: string, factory: () => Material): Material;
}

export interface Engine {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly audio: AudioEngine;
  readonly textures: TextureLibrary;
  readonly materials: MaterialLibrary;

  /** Attach to the page canvas, create renderer/post-fx/player/audio. Does not start a loop. */
  init(canvas: HTMLCanvasElement): Promise<void>;
  /**
   * Advance one rendered frame: player movement & collision, interaction raycast (writes
   * `ui.prompt` / `session.player`), camera focus tweens, `onFrame` callbacks, then render.
   * Called by the core game loop once per animation frame.
   */
  frame(dtSeconds: number): void;
  /** Smoothed FPS and renderer info for the debug overlay. */
  stats(): { fps: number; drawCalls: number; triangles: number; textures: number; geometries: number };
  setQuality(q: QualityPreset, resolutionScale?: number): void;
  setFov(fov: number): void;

  registerInteractable(i: Interactable): () => void;
  registerLocation(a: LocationAnchor): () => void;
  addCollider(box: ColliderBox): () => void;
  /** Convenience: add the world-space AABB of an object as a collider. */
  addColliderFromObject(obj: Object3D, padding?: number): () => void;

  /** Per-frame callback for animations (dt seconds, t = elapsed seconds). */
  onFrame(fn: (dt: number, t: number) => void): () => void;

  /**
   * Smoothly move the camera to a fixed pose and disable walking (computer/tablet/inspect).
   * The promises of `focus()`/`releaseFocus()` also resolve when a later focus/release call
   * supersedes them (they never hang): check `isFocused()` after awaiting if the outcome matters.
   */
  focus(pose: CameraPose, durationMs?: number): Promise<void>;
  /** Return the camera to the player's head and re-enable walking. */
  releaseFocus(durationMs?: number): Promise<void>;
  /** True from `focus()` until `releaseFocus()` is called; walking resumes when the release tween ends. */
  isFocused(): boolean;

  /**
   * `position` is the feet position. `yaw` follows `camera.rotation.y` (Euler YXZ): 0 looks toward
   * −Z, π/2 toward −X, π toward +Z. `pitch` > 0 looks up (clamped to ±88°).
   */
  teleportPlayer(position: Vec3, yaw: number, pitch?: number): void;
  setControlsEnabled(enabled: boolean): void;
  requestPointerLock(): void;
  exitPointerLock(): void;

  /**
   * Render the scene from a virtual camera into a 2D canvas (camera stream viewer, webcam
   * screenshots for GIMP/OCR). Cheap enough for a few fps at 320×240.
   */
  captureView(camera: Camera, target: CanvasRenderingContext2D, width: number, height: number): void;
}
