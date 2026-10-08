/**
 * Webcam frame production (Apps §8.3, §8.5): live 3D capture through the world's webcam registry when a feed
 * serves the URL, else a synthetic frame drawn from the Sim §2.11.1 camera views with render2d.
 * Pure-ish drawing helpers; no React.
 */
import { findWebcamFeed, type WebcamFeed } from '@/computer/apps';
import { engine } from '@/engine';
import { render2d, displaySizeMm } from '@/render2d';
import type { TerminalDevice, LabState } from '@/sim/types';
import { displayElements, layoutFaithful } from './layoutFaithful';
import { CAMERAS, CAMERA_BY_ID, FRAME_H, FRAME_W, PX_PER_DEG_PITCH, PX_PER_DEG_YAW, cameraForUrl, type CameraDef } from '@/sim/seed/cameras';

export { FRAME_W, FRAME_H };

/** Tag drawn per tile/view (top-left), in frame px. */
export interface FrameTag {
  text: string;
  x: number;
  y: number;
}

export interface FrameResult {
  live: boolean;
  tags: FrameTag[];
}

const scratch = new Map<string, HTMLCanvasElement>();
function canvas(key: string, w: number, h: number): HTMLCanvasElement {
  let c = scratch.get(key);
  if (!c) {
    c = document.createElement('canvas');
    scratch.set(key, c);
  }
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

export function cameraDefForUrl(url: string): CameraDef | null {
  return cameraForUrl(url);
}

export function cameraDef(id: string): CameraDef | null {
  return CAMERA_BY_ID[id] ?? null;
}

export function allCameraDefs(): readonly CameraDef[] {
  return CAMERAS;
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#1d1f22';
  ctx.fillRect(0, 0, w, h);
  // bench surface texture: faint horizontal bands
  ctx.fillStyle = '#222428';
  for (let y = 0; y < h; y += 48) ctx.fillRect(0, y, w, 1);
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Device screen (with a bezel) at frame px (x, y) and px/mm `s`; fallback outline when render2d fails. */
function drawDevice(ctx: CanvasRenderingContext2D, lab: LabState, dev: TerminalDevice, display: 'primary' | 'secondary', x: number, y: number, s: number, timeMs: number): { w: number; h: number } {
  const size = displaySizeMm(dev, display) ?? { w: 60, h: 100 };
  const w = Math.max(1, Math.round(size.w * s));
  const h = Math.max(1, Math.round(size.h * s));
  const bez = Math.max(4, Math.round(s * 3));
  ctx.fillStyle = '#0b0b0b';
  roundRect(ctx, x - bez, y - bez, w + bez * 2, h + bez * 2, bez * 1.4);
  ctx.fill();
  ctx.strokeStyle = '#3a3c40';
  ctx.lineWidth = 1;
  ctx.stroke();
  try {
    const c = canvas(`dev:${w}x${h}`, w, h);
    const cx = c.getContext('2d');
    if (!cx) throw new Error('no 2d context');
    render2d.drawDeviceDisplay(cx, lab, dev, display, { pxPerMm: s, timeMs });
    const cfd = display === 'secondary' || dev.role === 'cfd';
    const shift = cfd ? dev.labelShiftPx ?? 0 : 0;
    ctx.drawImage(layoutFaithful(c, displayElements(lab, dev, display, s, s, shift)), x, y);
  } catch {
    ctx.fillStyle = '#111';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(10, Math.round(s * 4))}px system-ui, sans-serif`;
    ctx.fillText(String(dev.display?.screen ?? dev.id), x + 8, y + 8 + s * 4);
  }
  // webcam glare
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  return { w, h };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function misaim(lab: LabState, cam: CameraDef): { dx: number; dy: number } {
  if (!cam.rigId) return { dx: 0, dy: 0 };
  const a = lab.rigs[cam.rigId]?.webcam?.aimOffsetDeg;
  return a ? { dx: a.yaw * PX_PER_DEG_YAW, dy: a.pitch * PX_PER_DEG_PITCH } : { dx: 0, dy: 0 };
}

/** Devices to show on a placeholder frame (cameras without modelled views). */
function placeholderDevices(lab: LabState, cam: CameraDef | null, url: string): { dev: TerminalDevice; tag: string }[] {
  const out: { dev: TerminalDevice; tag: string }[] = [];
  const robots = Object.values(lab.orca.robots).filter((r) => (cam?.rigId ? r.name === cam.rigId : r.cameraStreamUrl === url));
  for (const r of robots.slice(0, 4)) {
    const rig = lab.rigs[r.name];
    const devId = rig?.deviceIds?.[0];
    const dev = devId ? lab.devices[devId] : undefined;
    if (dev) out.push({ dev, tag: r.humanReadableName || r.name.toUpperCase() });
  }
  return out;
}

/**
 * Synthetic 1280×720 frame of a camera (Apps §8.5), drawn into `ctx` scaled to its canvas size.
 * Returns the tile tags in frame px.
 */
export function drawSyntheticFrame(ctx: CanvasRenderingContext2D, lab: LabState, url: string, cameraId: string | null): FrameResult {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(cw / FRAME_W, 0, 0, ch / FRAME_H, 0, 0);
  drawBackground(ctx, FRAME_W, FRAME_H);
  const cam = (cameraId ? cameraDef(cameraId) : null) ?? cameraDefForUrl(url);
  const tags: FrameTag[] = [];
  const t = lab.time.physMs;
  if (cam && cam.views.length) {
    const m = misaim(lab, cam);
    for (const v of cam.views) {
      const dev = lab.devices[v.deviceId];
      if (!dev) continue;
      drawDevice(ctx, lab, dev, v.display, Math.round(v.ox + m.dx), Math.round(v.oy + m.dy), v.s, t);
      tags.push({ text: v.tag, x: Math.max(4, v.ox + m.dx - 4), y: Math.max(4, v.oy + m.dy - 30) });
    }
  } else {
    const devs = placeholderDevices(lab, cam, url);
    const n = devs.length;
    const cols = n <= 1 ? 1 : 2;
    const rows = n <= 2 ? 1 : 2;
    devs.forEach(({ dev, tag }, i) => {
      const cellW = FRAME_W / cols;
      const cellH = FRAME_H / rows;
      const size = displaySizeMm(dev, 'primary') ?? { w: 60, h: 100 };
      const s = Math.min((cellW * 0.7) / size.w, (cellH * 0.72) / size.h);
      const x = (i % cols) * cellW + (cellW - size.w * s) / 2;
      const y = Math.floor(i / cols) * cellH + (cellH - size.h * s) / 2 + 10;
      drawDevice(ctx, lab, dev, 'primary', Math.round(x), Math.round(y), s, t);
      tags.push({ text: tag, x: (i % cols) * cellW + 12, y: Math.floor(i / cols) * cellH + 12 });
    });
  }
  ctx.restore();
  return { live: false, tags };
}

/** Live frame through the registered webcam feed (null when no feed serves the URL). */
export function drawLiveFrame(ctx: CanvasRenderingContext2D, feed: WebcamFeed): FrameResult {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const sx = cw / FRAME_W;
  const sy = ch / FRAME_H;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  const tags: FrameTag[] = [];
  for (const tile of feed.tiles) {
    const w = Math.max(1, Math.round(tile.w * sx));
    const h = Math.max(1, Math.round(tile.h * sy));
    const c = canvas(`tile:${w}x${h}`, w, h);
    const cx = c.getContext('2d');
    if (!cx) continue;
    engine.captureView(tile.camera, cx, w, h);
    ctx.drawImage(c, Math.round(tile.x * sx), Math.round(tile.y * sy));
    if (feed.tiles.length > 1 || tile.label) tags.push({ text: tile.label, x: tile.x + 8, y: tile.y + 8 });
  }
  return { live: true, tags };
}

/** Draw the frame a stream URL serves right now (live if possible). */
export function drawStreamFrame(ctx: CanvasRenderingContext2D, lab: LabState, url: string, cameraId: string | null, allowLive = true): FrameResult {
  const feed = allowLive ? findWebcamFeed(url) : null;
  if (feed && feed.tiles.length) return drawLiveFrame(ctx, feed);
  return drawSyntheticFrame(ctx, lab, url, cameraId);
}

/** Overlays (Apps §8.1): rig tags, game timestamp, REC dot. Coordinates in frame px; ctx is any size. */
export function drawOverlays(ctx: CanvasRenderingContext2D, tags: FrameTag[], stamp: string, rec: boolean, scaleTags = 1): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const sx = cw / FRAME_W;
  const sy = ch / FRAME_H;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(9, Math.round(14 * sx * scaleTags))}px "Segoe UI", system-ui, sans-serif`;
  for (const t of tags) {
    const x = t.x * sx;
    const y = t.y * sy;
    const tw = ctx.measureText(t.text).width;
    const hgt = Math.max(14, 24 * sy * scaleTags);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, tw + 12 * sx, hgt);
    ctx.fillStyle = '#fff';
    ctx.fillText(t.text, x + 6 * sx, y + hgt / 2);
  }
  ctx.font = `${Math.max(9, Math.round(13 * sx))}px "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace`;
  const sw = ctx.measureText(stamp).width;
  const pad = 8 * sx;
  const bh = Math.max(14, 24 * sy);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(cw - sw - pad * 3, ch - bh - pad, sw + pad * 2, bh);
  ctx.fillStyle = '#fff';
  ctx.fillText(stamp, cw - sw - pad * 2, ch - bh / 2 - pad);
  if (rec) {
    const r = Math.max(4, 7 * sx);
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(cw - 64 * sx, 22 * sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(9, Math.round(13 * sx))}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText('REC', cw - 52 * sx, 22 * sy);
  }
  ctx.restore();
}

/** Render a full-resolution frame to a data URL (snapshot, materializer). */
export function frameDataUrl(lab: LabState, url: string, cameraId: string | null, opts: { live?: boolean; type?: 'image/png' | 'image/jpeg'; quality?: number; width?: number; height?: number } = {}): string | null {
  try {
    const w = opts.width ?? FRAME_W;
    const h = opts.height ?? FRAME_H;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    drawStreamFrame(ctx, lab, url, cameraId, opts.live !== false);
    return c.toDataURL(opts.type ?? 'image/png', opts.quality);
  } catch (err) {
    console.warn('[camera] frame render failed', err);
    return null;
  }
}

/** Stream URL of a camera id (`http://10.42.10.<octet>:8081/stream.mjpg`). */
export function urlOfCamera(cameraId: string): string | null {
  const c = cameraDef(cameraId);
  return c ? `http://10.42.10.${c.octet}:8081/stream.mjpg` : null;
}
