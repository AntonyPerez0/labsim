/**
 * WebGL renderer creation, image-based lighting and the shadow-caster policy.
 *
 * Lighting model: three.js physically based lights (r155+), sRGB output, filmic tone mapping in the
 * post-fx chain (or on the renderer when post-fx is unavailable) and a PMREM of a procedural lab
 * room (`labEnvironment.ts`) for reflections/ambient. Recommended light setup for world builders (what the sandbox uses —
 * bright, slightly cool-white LED office light over warm off-white walls):
 *   - Ceiling troffers (one per ~2 × 2.5 m): emissive panels (`emissive` #f5f8ff,
 *     `emissiveIntensity` ≈ 1.9 — they bloom softly) plus SpotLights pointing straight down,
 *     colour #f3f6ff, intensity ≈ 14 (decay 2, distance 0), angle ≈ 1.15, penumbra ≈ 0.9.
 *     Mark the important ones `castShadow = true` (the quality preset decides how many really do;
 *     set `light.userData.shadowPriority` to rank them).
 *   - One HemisphereLight (sky #eef2ff, ground #8a8780, ≈ 0.2) as a little extra bounce light.
 */
import {
  AgXToneMapping,
  HalfFloatType,
  UnsignedByteType,
  type TextureDataType,
  ACESFilmicToneMapping,
  Color,
  NoToneMapping,
  PCFShadowMap,
  PMREMGenerator,
  SRGBColorSpace,
  WebGLRenderer,
  type Light,
  type LightShadow,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
  type Texture,
  type ToneMapping,
} from 'three';
import type { QualitySettings } from './quality';
import { getShadowMaterials } from './boxProjection';
import { createLabEnvironmentScene, disposeEnvironmentScene } from './labEnvironment';

/** Tone mapping operator used everywhere (post-fx ToneMappingEffect, capture, fallback). */
export const TONE_MAPPING: 'agx' | 'aces' = 'aces';
export const TONE_MAPPING_EXPOSURE = 1.12;
/**
 * Scene IBL strength. In a white-walled lab a large share of the light is bounce light, so the
 * lab-room PMREM (`labEnvironment.ts`) acts as the soft, top-down fill (and gives black powder coat its satin
 * sheen); the spot lights do the key and the shadows; n8ao darkens contacts and corners.
 */
export const ENVIRONMENT_INTENSITY = 0.85;

export function threeToneMapping(): ToneMapping {
  return TONE_MAPPING === 'agx' ? AgXToneMapping : ACESFilmicToneMapping;
}

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    // Post-fx (AO needs a resolved depth buffer) uses SMAA instead of MSAA.
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping; // tone mapping lives in the post-fx chain
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap; // r186 PCF = soft Vogel-disk filter scaled by shadow.radius
  renderer.info.autoReset = false; // engine resets once per frame so stats include every pass
  renderer.setClearColor(new Color('#d9d9d6'), 1);
  return renderer;
}

/** Frame-buffer type for HDR intermediate targets (falls back to 8-bit when unsupported). */
export function hdrBufferType(renderer: WebGLRenderer): TextureDataType {
  return supportsHalfFloatTargets(renderer) ? HalfFloatType : UnsignedByteType;
}

/** Can we render into half-float targets (needed for HDR bloom thresholds)? */
export function supportsHalfFloatTargets(renderer: WebGLRenderer): boolean {
  const ext = renderer.extensions;
  return ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
}

/** Build the PMREM environment from the procedural lab room and apply it to the scene. */
export function setupEnvironment(renderer: WebGLRenderer, scene: Scene): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const room = createLabEnvironmentScene();
  const env = pmrem.fromScene(room, 0.02);
  scene.environment = env.texture;
  scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  disposeEnvironmentScene(room);
  pmrem.dispose();
  return env.texture;
}

type ShadowLight = Light & { shadow?: LightShadow };

interface ShadowCandidate {
  light: ShadowLight;
  priority: number;
  order: number;
}

/**
 * Decides which lights render shadow maps under the active quality preset. World code expresses
 * intent with `light.castShadow = true` (+ optional `userData.shadowPriority`); the first time a
 * light is seen its intent is recorded in `userData.wantsShadow`.
 * Also assigns box-projected shadow materials to alpha-tested palette meshes (perforated shelves).
 */
export class ShadowPolicy {
  private quality: QualitySettings | null = null;
  private lastSignature = '';
  private order = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
  ) {}

  setQuality(q: QualitySettings): void {
    const prevEnabled = this.renderer.shadowMap.enabled;
    this.quality = q;
    this.renderer.shadowMap.enabled = q.shadows;
    this.lastSignature = '';
    this.scan(true);
    if (prevEnabled !== q.shadows) {
      // shadow-map on/off changes shader variants
      this.scene.traverse((o) => {
        const mat = (o as Mesh).material as Material | Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => (m.needsUpdate = true));
        else if (mat) mat.needsUpdate = true;
      });
    }
  }

  /** Re-evaluate casters (cheap; call ~once per second and after world changes). */
  scan(force = false): void {
    const q = this.quality;
    if (!q) return;
    const candidates: ShadowCandidate[] = [];
    this.scene.traverse((o) => {
      const light = o as ShadowLight;
      if (light.isLight && light.shadow) {
        if (light.userData.wantsShadow === undefined) {
          light.userData.wantsShadow = light.castShadow;
          light.userData.shadowOrder = this.order++;
        } else if (light.userData.shadowAssigned !== undefined && light.castShadow !== light.userData.shadowAssigned) {
          // world code toggled castShadow after we assigned it: that is a new request
          light.userData.wantsShadow = light.castShadow;
        }
        if (light.userData.wantsShadow) {
          candidates.push({ light, priority: Number(light.userData.shadowPriority ?? 0), order: light.userData.shadowOrder as number });
        } else {
          light.userData.shadowAssigned = false;
        }
      }
      const mesh = o as Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material)) {
        const sm = mesh.material ? getShadowMaterials(mesh.material as Material) : undefined;
        if (sm && mesh.customDepthMaterial !== sm.depth) {
          mesh.customDepthMaterial = sm.depth;
          mesh.customDistanceMaterial = sm.distance;
        }
      }
    });
    candidates.sort((a, b) => b.priority - a.priority || a.order - b.order);
    const signature = candidates.map((c) => c.light.uuid).join(',');
    if (!force && signature === this.lastSignature) return;
    this.lastSignature = signature;
    const max = q.shadows ? q.maxShadowLights : 0;
    candidates.forEach((c, i) => {
      const on = i < max;
      const light = c.light;
      if (light.castShadow !== on) light.castShadow = on;
      light.userData.shadowAssigned = on;
      if (on) {
        const s = light.shadow!;
        if (s.mapSize.x !== q.shadowMapSize) {
          s.mapSize.set(q.shadowMapSize, q.shadowMapSize);
          s.map?.dispose();
          (s as { map: unknown }).map = null;
        }
        s.radius = q.shadowRadius;
        if (s.bias === 0) s.bias = -0.0004;
        if (s.normalBias === 0) s.normalBias = 0.02;
      }
    });
  }
}

/**
 * Collect the rendered meshes under an object (for outline selection / emissive highlight).
 * Hidden subtrees and invisible hit-area meshes (`material.visible === false`) are skipped, so an
 * enlarged invisible hit box is never outlined.
 */
export function collectMeshes(root: Object3D, out: Mesh[]): Mesh[] {
  out.length = 0;
  root.traverseVisible((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as Material | Material[] | undefined;
    if (!mat) return;
    if (Array.isArray(mat) ? mat.every((x) => !x.visible) : !mat.visible) return;
    out.push(m);
  });
  return out;
}
