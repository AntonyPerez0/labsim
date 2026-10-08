/**
 * Post-processing chain (pmndrs/postprocessing v6 + n8ao):
 *
 *   RenderPass (HDR, half-float) → N8AOPostPass (AO, medium+) →
 *   EffectPass[ Bloom (ADD, HDR luminance threshold → only LEDs/screens glow),
 *               ToneMapping (ACES/AgX, the ONLY tone-map in the pipeline),
 *               Outline (high/ultra, on the tone-mapped image), Vignette ] →
 *   EffectPass[ SMAA ] → screen (sRGB encode)
 *
 * `renderer.toneMapping` stays `NoToneMapping` while this chain is active, so nothing is
 * tone-mapped twice.
 */
import { Color, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three';
import {
  BlendFunction,
  BloomEffect,
  EdgeDetectionMode,
  EffectComposer,
  EffectPass,
  KernelSize,
  OutlineEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { QualitySettings, SmaaQuality } from './quality';
import { TONE_MAPPING, hdrBufferType } from './renderer';

const SMAA_PRESETS: Record<SmaaQuality, SMAAPreset> = {
  low: SMAAPreset.LOW,
  medium: SMAAPreset.MEDIUM,
  high: SMAAPreset.HIGH,
  ultra: SMAAPreset.ULTRA,
};

export class PostFx {
  readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private ao: N8AOPostPass | null = null;
  private aoAdded = false;
  private mainPass: EffectPass | null = null;
  private smaaPass: EffectPass | null = null;
  private outline: OutlineEffect | null = null;
  private width = 1;
  private height = 1;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: hdrBufferType(renderer),
      multisampling: 0,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
  }

  get hasOutline(): boolean {
    return this.outline !== null;
  }

  /** (Re)build the effect passes for a quality preset. */
  configure(q: QualitySettings): void {
    // Remove previous passes (keep the RenderPass and the AO instance).
    if (this.mainPass) {
      this.composer.removePass(this.mainPass);
      this.mainPass.dispose();
      this.mainPass = null;
    }
    if (this.smaaPass) {
      this.composer.removePass(this.smaaPass);
      this.smaaPass.dispose();
      this.smaaPass = null;
    }
    this.outline = null;
    if (this.ao && this.aoAdded) {
      this.composer.removePass(this.ao);
      this.aoAdded = false;
    }
    if (this.ao && !q.ao) {
      // Presets without AO are for weak GPUs: free its full-screen render targets.
      disposeAo(this.ao);
      this.ao = null;
    }

    // --- Ambient occlusion ---
    if (q.ao) {
      if (!this.ao) {
        this.ao = new N8AOPostPass(this.scene, this.camera, this.width, this.height);
        // We have very few transparent objects; skip n8ao's extra transparency passes.
        this.ao.configuration.transparencyAware = false;
        this.ao.configuration.gammaCorrection = false; // not the last pass; output stays linear HDR
        this.ao.configuration.color = new Color(0x000000);
        this.ao.configuration.screenSpaceRadius = false;
      }
      const c = this.ao.configuration;
      this.ao.setQualityMode(q.ao.quality);
      c.halfRes = q.ao.halfRes;
      c.aoRadius = q.ao.radius;
      c.distanceFalloff = q.ao.distanceFalloff;
      c.intensity = q.ao.intensity;
      this.composer.addPass(this.ao);
      this.aoAdded = true;
    }

    // --- Bloom → tone mapping → outline → vignette ---
    const effects: Effect[] = [];
    if (q.bloom) {
      effects.push(
        new BloomEffect({
          blendFunction: BlendFunction.ADD,
          mipmapBlur: true,
          luminanceThreshold: q.bloom.threshold,
          luminanceSmoothing: q.bloom.smoothing,
          intensity: q.bloom.intensity,
          radius: q.bloom.radius,
          levels: q.bloom.levels,
        }),
      );
    }
    effects.push(new ToneMappingEffect({ mode: TONE_MAPPING === 'agx' ? ToneMappingMode.AGX : ToneMappingMode.ACES_FILMIC }));
    if (q.outline) {
      this.outline = new OutlineEffect(this.scene, this.camera, {
        blendFunction: BlendFunction.SCREEN,
        edgeStrength: 3,
        pulseSpeed: 0,
        visibleEdgeColor: 0xc8ffd8,
        hiddenEdgeColor: 0x1c2a20,
        xRay: false,
        blur: true,
        kernelSize: KernelSize.VERY_SMALL,
        resolutionScale: 0.75,
        multisampling: 0,
      });
      effects.push(this.outline);
    }
    if (q.vignette) effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.38 }));
    this.mainPass = new EffectPass(this.camera, ...effects);
    this.composer.addPass(this.mainPass);

    // --- SMAA on the tone-mapped image ---
    this.smaaPass = new EffectPass(
      this.camera,
      new SMAAEffect({ preset: SMAA_PRESETS[q.smaa], edgeDetectionMode: EdgeDetectionMode.COLOR }),
    );
    this.composer.addPass(this.smaaPass);
    this.composer.setSize(this.width, this.height, false);
  }

  /** CSS-pixel size; the renderer's pixel ratio must already be set. */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.composer.setSize(this.width, this.height, false);
  }

  /** Outline the given meshes (high/ultra). Pass null/empty to clear. */
  setOutline(objects: readonly Object3D[] | null): void {
    if (!this.outline) return;
    const sel = this.outline.selection;
    if (!objects || objects.length === 0) {
      if (sel.size) sel.clear();
      return;
    }
    sel.set(objects);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    if (this.ao) disposeAo(this.ao);
    this.ao = null;
    this.composer.dispose();
  }
}

/**
 * `Pass.dispose()` disposes every texture/target the pass holds a reference to — n8ao keeps the
 * composer's shared depth texture in `depthTexture`, so detach that first or the composer's depth
 * buffer (used by other passes) would be destroyed with it.
 */
function disposeAo(ao: N8AOPostPass): void {
  (ao as unknown as { depthTexture: unknown }).depthTexture = null;
  ao.dispose();
}
