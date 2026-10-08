/**
 * Image materializer (Apps §1.6, §6.5): turns image refs into pixels.
 *  - `img:webcam:<cameraId>:<physMs|live>` → the camera's frame now (live capture if a feed exists, else synthetic)
 *  - `img:screencap:<deviceId>:<physMs>`   → render2d device display at native px; new screencap files are
 *    rendered immediately so the picture shows the screen at capture time
 *  - `img:receipt:<rig>:<id>`               → thermal receipt on a desk, photographed (1024×1365, 2° tilt)
 */
import { store, getState } from '@/core/store';
import { peekImage, putImage, registerImageMaterializer, type ImageEntry } from '@/computer/apps';
import { render2d } from '@/render2d';
import { sim } from '@/sim';
import type { LabState } from '@/sim/types';
import { screenOf } from '@/sim/seed/deviceTypes';
import { displayElements, layoutFaithful } from './layoutFaithful';
import { frameDataUrl, urlOfCamera, FRAME_W, FRAME_H } from './frames';

function canvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? { c, ctx } : null;
}

export function materializeWebcam(lab: LabState, ref: string): ImageEntry | null {
  const m = /^img:webcam:([^:]+):/.exec(ref);
  if (!m) return null;
  const url = urlOfCamera(m[1]!);
  if (!url) return null;
  // Lesson images follow the sim frame model (exact OCR/GIMP boxes), never the 3D webcam render.
  const dataUrl = frameDataUrl(lab, url, m[1]!, { live: false });
  return dataUrl ? { ref, dataUrl, width: FRAME_W, height: FRAME_H, kind: 'webcam' } : null;
}

export function materializeScreencap(lab: LabState, ref: string): ImageEntry | null {
  const m = /^img:screencap:(.+):(\d+|live)$/.exec(ref);
  if (!m) return null;
  const dev = lab.devices[m[1]!];
  if (!dev) return null;
  let size: { wPx: number; hPx: number; wMm: number; hMm: number; px: { x: number; y: number } };
  try {
    size = screenOf(dev.type, 'primary');
  } catch {
    return null;
  }
  const cv = canvas(size.wPx, size.hPx);
  if (!cv) return null;
  let out = cv.c;
  try {
    render2d.drawDeviceDisplay(cv.ctx, lab, dev, 'primary', { pxPerMm: size.wPx / size.wMm, timeMs: lab.time.physMs });
    // Labels on the layout rectangles the sim's frame model measures (Apps §6.5).
    out = layoutFaithful(cv.c, displayElements(lab, dev, 'primary', size.px.x, size.px.y));
  } catch (err) {
    cv.ctx.fillStyle = '#000';
    cv.ctx.fillRect(0, 0, size.wPx, size.hPx);
    console.warn('[camera] screencap render failed', err);
  }
  return { ref, dataUrl: out.toDataURL('image/png'), width: size.wPx, height: size.hPx, kind: 'screencap' };
}

function receiptText(lab: LabState, ref: string): string | null {
  try {
    const f = sim.ocr.frame(ref);
    if (f.ok && f.value.labels.length) return f.value.labels.map((l) => l.text).join('\n');
  } catch {
    /* sim not ready */
  }
  const m = /^img:receipt:([^:]+)/.exec(ref);
  const dev = m ? Object.values(lab.devices).find((d) => d.rigId === m[1] && d.lastReceipt) : undefined;
  return dev?.lastReceipt ?? null;
}

export function materializeReceipt(lab: LabState, ref: string): ImageEntry | null {
  const text = receiptText(lab, ref);
  if (text == null) return null;
  const W = 1024;
  const H = 1365;
  const rw = 384;
  let rh = 600;
  try {
    rh = Math.max(200, render2d.receiptHeightPx(text, rw));
  } catch {
    rh = 40 + text.split('\n').length * 22;
  }
  const paper = canvas(rw, rh);
  const out = canvas(W, H);
  if (!paper || !out) return null;
  try {
    render2d.drawReceipt(paper.ctx, text, { widthPx: rw });
  } catch {
    paper.ctx.fillStyle = '#fbfaf5';
    paper.ctx.fillRect(0, 0, rw, rh);
    paper.ctx.fillStyle = '#111';
    paper.ctx.font = '16px "DejaVu Sans Mono", monospace';
    text.split('\n').forEach((l, i) => paper.ctx.fillText(l, 12, 28 + i * 22));
  }
  const ctx = out.ctx;
  // dark desk with a soft light pool
  const g = ctx.createRadialGradient(W * 0.48, H * 0.42, 80, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, '#4a4440');
  g.addColorStop(1, '#1c1a19');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < H; y += 7) ctx.fillRect(0, y, W, 2);
  const scale = Math.min((W * 0.7) / rw, (H * 0.86) / rh);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((2 * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 24 / scale;
  ctx.shadowOffsetX = 6 / scale;
  ctx.shadowOffsetY = 10 / scale;
  ctx.fillStyle = '#fbfaf5';
  ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
  ctx.shadowColor = 'transparent';
  ctx.drawImage(paper.c, -rw / 2, -rh / 2);
  ctx.restore();
  return { ref, dataUrl: out.c.toDataURL('image/jpeg', 0.88), width: W, height: H, kind: 'receipt' };
}

export async function materialize(ref: string): Promise<ImageEntry | null> {
  const lab = getState().lab;
  try {
    if (ref.startsWith('img:webcam:')) return materializeWebcam(lab, ref);
    if (ref.startsWith('img:screencap:')) return materializeScreencap(lab, ref);
    if (ref.startsWith('img:receipt:')) return materializeReceipt(lab, ref);
  } catch (err) {
    console.warn('[camera] materialize failed', ref, err);
  }
  return null;
}

let stopFn: (() => void) | null = null;

/** Registers the materializer and renders new screencap refs immediately. Idempotent; returns a disposer. */
export function startMaterializer(): () => void {
  if (stopFn) return stopFn;
  registerImageMaterializer(materialize);
  let lastFiles = getState().lab.workstation?.files;
  const unsub = store.subscribe((s) => {
    const files = s.lab.workstation?.files;
    if (files === lastFiles || !files) return;
    const prev = lastFiles ?? {};
    lastFiles = files;
    for (const [path, v] of Object.entries(files)) {
      if (prev[path] === v || typeof v !== 'string' || !v.startsWith('img:screencap:') || peekImage(v)) continue;
      const img = materializeScreencap(s.lab, v);
      if (img) putImage(img);
    }
  });
  stopFn = () => {
    unsub();
    registerImageMaterializer(null);
    stopFn = null;
  };
  return stopFn;
}
