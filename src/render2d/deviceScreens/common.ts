/**
 * Screen pieces shared by the portrait (P) and landscape (L8) drawers: chrome, lock screen, boot
 * splash, screensaver, spinner/result discs, dimming and the generic fallback.
 */
import { FONTS } from '../api';
import { C, clockLabel, dateLabel, hash32, mulberry } from '../shared/theme';
import * as G from '../shared/glyphs';
import { drawMark } from '../shared/labLogo';
import type { ScreenCtx } from './context';

export function fillBg(sc: ScreenCtx, color: string): void {
  sc.ctx.fillStyle = color;
  sc.ctx.fillRect(0, 0, sc.ctx.canvas.width, sc.ctx.canvas.height);
}

/** Merchant status bar + Android nav bar (World §4.3/§4.4 chrome). Heights in base mm. */
export function merchantChrome(sc: ScreenCtx, statusH: number, navY: number, navH: number): void {
  const m = sc.m;
  m.fillRect(0, 0, sc.W, statusH, C.greenDark);
  const clk = clockLabel(sc.lab);
  m.text(clk.hm, 2, statusH * 0.78, statusH * 0.55, { color: '#ffffff', weight: 500 });
  G.statusIcons(sc.ctx, m.X(sc.W - 1.5), m.Y(statusH / 2), m.S(statusH * 0.6), '#ffffff');
  m.fillRect(0, navY, sc.W, navH, '#111111');
}

export function lockBackground(sc: ScreenCtx): void {
  sc.m.vgrad(0, 0, sc.W, sc.H, [
    [0, C.lockBg],
    [1, C.lockBg2],
  ]);
}

/** Lock-screen clock: digits UI_THIN centred at cx, `PM` 1 mm right of them, date below. */
export function lockClock(sc: ScreenCtx, cx: number, baseline: number, digitsMm: number, ampmMm: number, dateCx: number, dateBaseline: number): void {
  const m = sc.m;
  const clk = clockLabel(sc.lab);
  const w = m.text(clk.hm, cx, baseline, digitsMm, { weight: FONTS.UI_THIN_WEIGHT, family: FONTS.UI_THIN, color: C.lockClock, align: 'center' });
  m.text(clk.ampm, cx + w / 2 + 1.0, baseline, ampmMm, { color: C.lockClock, weight: 400 });
  m.text(dateLabel(sc.lab), dateCx, dateBaseline, 2.4, { color: C.lockClock, align: 'center' });
}

/** PIN-dot row (passcode pads, PIN field). */
export function dots(sc: ScreenCtx, cx: number, cy: number, count: number, filled: number, r: number, pitch: number, fill: string, empty: string | null): void {
  const x0 = cx - ((count - 1) * pitch) / 2;
  for (let i = 0; i < count; i++) {
    if (i < filled) sc.m.circle(x0 + i * pitch, cy, r, fill);
    else if (empty) sc.m.circle(x0 + i * pitch, cy, r, null, empty, 0.3);
  }
}

/** Boot: black, white leaf, `lab` wordmark, three dots animating at 3 Hz. */
export function bootScreen(sc: ScreenCtx, leafCx: number, leafCy: number, leafMm: number, wordBaseline: number, wordMm: number, dotsY: number): void {
  fillBg(sc, '#000000');
  const m = sc.m;
  drawMark(sc.ctx, m.X(leafCx), m.Y(leafCy), m.S(leafMm), '#ffffff');
  m.text('lab', leafCx, wordBaseline, wordMm, { color: '#ffffff', weight: 600, align: 'center' });
  const phase = Math.floor((sc.timeMs / 1000) * 3) % 3;
  for (let i = 0; i < 3; i++) m.circle(leafCx - 4 + i * 4, dotsY, 0.8, i === phase ? '#ffffff' : '#4a4a4a');
}

/** Screensaver (customer-idle): black with a faint leaf drifting 2 mm/s (IMG-R dark CFDs). */
export function idleScreen(sc: ScreenCtx, leafMm: number): void {
  fillBg(sc, '#000000');
  const r = mulberry(hash32(sc.device.id));
  const sp = 2; // mm/s
  const tx = (sc.timeMs / 1000) * sp + r() * 100;
  const ty = (sc.timeMs / 1000) * sp * 0.7 + r() * 100;
  const span = (v: number, len: number) => {
    const p = ((v % (2 * len)) + 2 * len) % (2 * len);
    return p < len ? p : 2 * len - p;
  };
  const x = leafMm / 2 + span(tx, sc.W - leafMm);
  const y = leafMm / 2 + span(ty, sc.H - leafMm);
  sc.ctx.save();
  sc.ctx.globalAlpha = 0.08;
  drawMark(sc.ctx, sc.m.X(x), sc.m.Y(y), sc.m.S(leafMm), '#ffffff');
  sc.ctx.restore();
}

/** Spinner ring (1 rev/s). */
export function spinnerAt(sc: ScreenCtx, cx: number, cy: number, dMm: number, color: string, track: string): void {
  const a = ((sc.timeMs / 1000) % 1) * Math.PI * 2;
  G.spinner(sc.ctx, sc.m.X(cx), sc.m.Y(cy), sc.m.S(dMm / 2), a, color, track);
}

/** White disc with a ✓ or ✕ (approved / declined / oobe-complete). */
export function resultDisc(sc: ScreenCtx, cx: number, cy: number, dMm: number, kind: 'check' | 'cross', ink: string, disc = '#ffffff'): void {
  sc.m.circle(cx, cy, dMm / 2, disc);
  const s = sc.m.S(dMm * 0.7);
  if (kind === 'check') G.check(sc.ctx, sc.m.X(cx), sc.m.Y(cy), s, ink, 0.13);
  else G.cross(sc.ctx, sc.m.X(cx), sc.m.Y(cy), s, ink, 0.13);
}

/** Dim the whole canvas (error dialogs dim the previous screen by 60 %). */
export function dim(sc: ScreenCtx, alpha: number): void {
  sc.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  sc.ctx.fillRect(0, 0, sc.ctx.canvas.width, sc.ctx.canvas.height);
}

/** Progress 0..1 from params (`progress` 0..1 or 0..100) or a looping animation. */
export function progressOf(sc: ScreenCtx, periodMs = 4000): number {
  const p = sc.params.progress;
  if (typeof p === 'number') return p > 1 ? Math.min(1, p / 100) : Math.max(0, p);
  const devAny = sc.device as { bootProgress?: number };
  if (sc.display.screen === 'boot' && typeof devAny.bootProgress === 'number') return devAny.bootProgress;
  return (sc.timeMs % periodMs) / periodMs;
}

export function progressBar(sc: ScreenCtx, x: number, y: number, w: number, h: number, p: number, fill: string, track: string): void {
  sc.m.rrect(x, y, w, h, h / 2, track);
  if (p > 0) sc.m.rrect(x, y, Math.max(h, w * Math.min(1, p)), h, h / 2, fill);
}

/** Generic centred message for screens without a dedicated drawer (receipt-done, thank-you, …). */
export function genericScreen(sc: ScreenCtx, title: string, sub: string | null, bg: string, ink: string): void {
  fillBg(sc, bg);
  sc.m.text(title, sc.W / 2, sc.H * 0.47, sc.base === 'P' ? 4 : 6, { weight: 700, color: ink, align: 'center', maxW: sc.W - 6 });
  if (sub) sc.m.text(sub, sc.W / 2, sc.H * 0.47 + (sc.base === 'P' ? 6 : 8), sc.base === 'P' ? 2.4 : 3.2, { color: ink, align: 'center', maxW: sc.W - 6 });
}

/** Title-case a screen id for the fallback (`waiting-for-merchant` → `Waiting for merchant`). */
export function humanise(id: string): string {
  const s = id.replace(/^app-/, '').replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Error dialog title: `Unfortunately, <App> has stopped.` */
export function errorTitle(sc: ScreenCtx): [string, string] {
  const app = String(sc.params.app ?? 'Register');
  return [`Unfortunately, ${app}`, 'has stopped.'];
}

/** The order lines a screen lists (qty × name, price). */
export function lineText(l: { name: string; qty: number }): string {
  return `${l.qty} × ${l.name}`;
}
