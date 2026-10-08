/**
 * `captureView`: render the scene from a virtual camera into a 2D canvas (camera streams, webcam
 * screenshots for GIMP/OCR). No post-fx; the same tone mapping operator and exposure as the main
 * view are applied in a tiny full-screen pass (which also flips Y), then the pixels are read back.
 *
 * The renderer's render target, viewport, scissor, clear colour, autoClear and shadow auto-update
 * are saved and restored, so the main frame is unaffected.
 */
import {
  Color,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from 'three';
import { TONE_MAPPING, hdrBufferType } from './renderer';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
#include <tonemapping_pars_fragment>
uniform sampler2D tSource;
varying vec2 vUv;
void main() {
  // flip Y so row 0 of the read-back buffer is the top of the image
  vec3 c = texture2D(tSource, vec2(vUv.x, 1.0 - vUv.y)).rgb;
  c = TONEMAP(c);
  gl_FragColor = vec4(sRGBTransferOETF(vec4(c, 1.0)).rgb, 1.0);
}`;

interface Targets {
  key: string;
  hdr: WebGLRenderTarget;
  ldr: WebGLRenderTarget;
  buffer: Uint8Array<ArrayBuffer>;
  image: ImageData | null;
}

/** Sizes kept alive at once (e.g. a 320×240 camera stream and a 640×480 screenshot). */
const MAX_CACHED_SIZES = 3;

export class ViewCapture {
  /** Most recently used first. */
  private targets: Targets[] = [];
  private readonly quadScene = new Scene();
  private readonly quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: ShaderMaterial;
  private readonly savedViewport = new Vector4();
  private readonly savedScissor = new Vector4();
  private readonly savedClear = new Color();

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { tSource: { value: null } },
      defines: { TONEMAP: TONE_MAPPING === 'agx' ? 'AgXToneMapping' : 'ACESFilmicToneMapping' },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: false,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  /** Render targets for a size, cached (LRU) so alternating callers don't reallocate per call. */
  private ensureTargets(renderer: WebGLRenderer, w: number, h: number): Targets {
    const key = `${w}x${h}`;
    const i = this.targets.findIndex((t) => t.key === key);
    if (i >= 0) {
      const t = this.targets[i]!;
      if (i > 0) {
        this.targets.splice(i, 1);
        this.targets.unshift(t);
      }
      return t;
    }
    const t: Targets = {
      key,
      hdr: new WebGLRenderTarget(w, h, { type: hdrBufferType(renderer), depthBuffer: true }),
      ldr: new WebGLRenderTarget(w, h, { type: UnsignedByteType, depthBuffer: false }),
      buffer: new Uint8Array(w * h * 4),
      image: null,
    };
    this.targets.unshift(t);
    while (this.targets.length > MAX_CACHED_SIZES) {
      const old = this.targets.pop()!;
      old.hdr.dispose();
      old.ldr.dispose();
    }
    return t;
  }

  capture(renderer: WebGLRenderer, scene: Scene, camera: Camera, ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const tg = this.ensureTargets(renderer, w, h);
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    const prevScissorTest = renderer.getScissorTest();
    const prevClearAlpha = renderer.getClearAlpha();
    renderer.getViewport(this.savedViewport);
    renderer.getScissor(this.savedScissor);
    renderer.getClearColor(this.savedClear);
    try {
      renderer.autoClear = true;
      renderer.shadowMap.autoUpdate = false; // reuse this frame's shadow maps
      renderer.setScissorTest(false);
      renderer.setRenderTarget(tg.hdr);
      renderer.render(scene, camera);
      this.material.uniforms.tSource!.value = tg.hdr.texture;
      renderer.setRenderTarget(tg.ldr);
      renderer.render(this.quadScene, this.quadCam);
      renderer.readRenderTargetPixels(tg.ldr, 0, 0, w, h, tg.buffer);
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.autoClear = prevAutoClear;
      renderer.shadowMap.autoUpdate = prevShadowAuto;
      renderer.setScissorTest(prevScissorTest);
      renderer.setViewport(this.savedViewport);
      renderer.setScissor(this.savedScissor);
      renderer.setClearColor(this.savedClear, prevClearAlpha);
    }
    this.material.uniforms.tSource!.value = null;
    if (!tg.image) tg.image = ctx.createImageData(w, h);
    tg.image.data.set(tg.buffer);
    ctx.putImageData(tg.image, 0, 0);
  }

  dispose(): void {
    for (const t of this.targets) {
      t.hdr.dispose();
      t.ldr.dispose();
    }
    this.targets = [];
    this.material.dispose();
  }
}
