/**
 * Small helpers for binding lab props to sim state each frame (World §10.5 update rates):
 * throttles, dynamic canvas screens (unlit `screenLit`-style materials), the game clock text, and
 * proxy registration shortcuts.
 */
import { CanvasTexture, Color, LinearFilter, MeshBasicMaterial, SRGBColorSpace } from 'three';
import type { LabState } from '@/sim/types';

/** Returns true at most `hz` times per second (call every frame with the frame time `t`). */
export function throttle(hz: number): (t: number) => boolean {
  let next = -1;
  return (t: number) => {
    if (t < next) return false;
    next = t + 1 / hz;
    return true;
  };
}

/** A canvas-backed self-lit screen (World §3.5/§3.6: MeshBasic, colour 1.12, tone-mapped). */
export class DynScreen {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  readonly material: MeshBasicMaterial;

  constructor(
    readonly w: number,
    readonly h: number,
    name: string,
    brightness = 1.12,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.g = this.canvas.getContext('2d')!;
    this.g.fillStyle = '#000';
    this.g.fillRect(0, 0, w, h);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 4;
    this.material = new MeshBasicMaterial({ map: this.texture, color: new Color(brightness, brightness, brightness), toneMapped: true });
    this.material.name = name;
  }

  draw(fn: (g: CanvasRenderingContext2D, w: number, h: number) => void): void {
    this.g.save();
    fn(this.g, this.w, this.h);
    this.g.restore();
    this.texture.needsUpdate = true;
  }

  setBrightness(b: number): void {
    this.material.color.setScalar(b);
  }
}

/** "HH:MM" of the game clock (24 h). */
export function clockHHMM(lab: LabState | null | undefined): string {
  const ms = lab?.time?.nowMs ?? 9 * 3600_000;
  const m = Math.floor((((ms / 60000) % 1440) + 1440) % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 12 h clock "3:45" + "PM". */
export function clock12(lab: LabState | null | undefined): { hm: string; ampm: string } {
  const ms = lab?.time?.nowMs ?? 9 * 3600_000;
  const m = Math.floor((((ms / 60000) % 1440) + 1440) % 1440);
  const h24 = Math.floor(m / 60);
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hm: `${h}:${String(m % 60).padStart(2, '0')}`, ampm: h24 < 12 ? 'AM' : 'PM' };
}

/** Game seconds since midnight (for the analog clock). */
export function gameSeconds(lab: LabState | null | undefined): number {
  const ms = lab?.time?.nowMs ?? 9 * 3600_000;
  return ((ms / 1000) % 86400 + 86400) % 86400;
}

import { Raycaster, Vector2, type Camera, type Object3D } from 'three';

const ray = new Raycaster();
const centre = new Vector2(0, 0);

/**
 * Where the crosshair hits a screen mesh, in screen millimetres from the top-left (render2d/sim
 * convention). The mesh must be a plane whose UVs span the active area (u → +x, v → up).
 * Returns the screen centre when the ray misses (e.g. while focused off-axis).
 */
export function crosshairScreenMm(camera: Camera, screen: Object3D, wMm: number, hMm: number): [number, number] {
  ray.setFromCamera(centre, camera);
  const hit = ray.intersectObject(screen, false)[0];
  if (!hit?.uv) return [wMm / 2, hMm / 2];
  return [Math.max(0, Math.min(wMm, hit.uv.x * wMm)), Math.max(0, Math.min(hMm, (1 - hit.uv.y) * hMm))];
}
