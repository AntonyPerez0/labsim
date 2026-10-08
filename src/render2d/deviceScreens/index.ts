/**
 * `drawDeviceDisplay` — renders any LabSim display (World §4) into a canvas sized
 * `ceil(wMm × pxPerMm) × ceil(hMm × pxPerMm)`: decoration per layout class, then the firmware
 * buttons (drawn = hit), then touch feedback (ripple, contact dot) and the optional touch-target
 * overlay (`flags.showTouchTargets`).
 */
import { TOUCH_FEEDBACK, type DisplayRenderOptions } from '../api';
import type { TerminalDevice, LabState } from '@/sim/types';
import { buildScreenCtx, type ScreenCtx } from './context';
import { drawButtons } from './buttons';
import { drawPortrait } from './portrait';
import { drawLandscape } from './landscape';

export { effectiveButtons, localButtons, registerFirmwareLayoutProvider, hasFirmwareLayoutProvider, hitButton, btnCentre, type Btn, type LayoutQuery, type FirmwareLayoutProvider } from './layouts';
export { displaySizeMm } from './context';

const DARK_SCREENS = new Set(['lock', 'boot', 'customer-idle', 'deprovisioning', 'approved', 'declined', 'off', 'waiting-for-merchant']);
/** Screens whose buttons are part of the decoration (none drawn by the button pass). */
const NO_BUTTON_SCREENS = new Set(['off', 'boot', 'customer-idle', 'processing', 'approved', 'printing', 'deprovisioning', 'customer-cart']);

export function drawDeviceDisplay(ctx: CanvasRenderingContext2D, lab: LabState, device: TerminalDevice, display: 'primary' | 'secondary', opts: DisplayRenderOptions): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const sc = buildScreenCtx(ctx, lab, device, display, opts);
  const ds = sc?.display;
  if (!sc || !ds || ds.screen === 'off' || device.power === 'off' || device.power === 'fried') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }
  if (sc.base === 'P') drawPortrait(sc);
  else drawLandscape(sc);
  if (!NO_BUTTON_SCREENS.has(ds.screen)) drawButtons(sc);
  if (device.theme === 'legacy') legacyTheme(sc);
  if (opts.showTouchTargets || lab.flags?.showTouchTargets) touchTargets(sc);
  if (opts.ripple && (opts.showTapRipple ?? true)) ripple(sc, opts.ripple);
  ctx.restore();
}

/** `legacy` theme: grey header (desaturate the header band) + `LEGACY THEME` watermark. */
function legacyTheme(sc: ScreenCtx): void {
  const c = sc.ctx;
  c.save();
  c.globalCompositeOperation = 'saturation';
  c.fillStyle = '#5f6368';
  c.fillRect(0, 0, c.canvas.width, sc.m.Y(sc.base === 'P' ? 14 : 12.5));
  c.restore();
  c.save();
  c.translate(c.canvas.width / 2, c.canvas.height / 2);
  c.rotate(-Math.PI / 6);
  c.font = `700 ${sc.t.S(sc.base === 'P' ? 6 : 10)}px Roboto, Arial, sans-serif`;
  c.textAlign = 'center';
  c.fillStyle = 'rgba(95,99,104,0.22)';
  c.fillText('LEGACY THEME', 0, 0);
  c.restore();
}

function touchTargets(sc: ScreenCtx): void {
  const c = sc.ctx;
  const t = sc.t;
  const cfg = TOUCH_FEEDBACK.targets;
  c.save();
  c.strokeStyle = cfg.color;
  c.lineWidth = cfg.lineWidthPx;
  c.fillStyle = cfg.color;
  c.font = `500 ${Math.max(6, sc.opts.pxPerMm * cfg.labelMm)}px Roboto, Arial, sans-serif`;
  c.textBaseline = 'top';
  for (const b of sc.btns) {
    c.strokeRect(t.X(b.x) + 0.5, t.Y(b.y) + 0.5, t.X(b.w) - 1, t.Y(b.h) - 1);
    c.fillText(b.id, t.X(b.x) + 1.5, t.Y(b.y) + 1);
  }
  c.restore();
}

function ripple(sc: ScreenCtx, r: { xMm: number; yMm: number; ageMs: number }): void {
  const cfg = TOUCH_FEEDBACK;
  const c = sc.ctx;
  const t = sc.t;
  const dark = DARK_SCREENS.has(sc.display.screen);
  const style = dark ? cfg.ripple.dark : cfg.ripple.light;
  const px = t.X(r.xMm);
  const py = t.Y(r.yMm);
  if (r.ageMs >= 0 && r.ageMs < cfg.ripple.durationMs) {
    const k = r.ageMs / cfg.ripple.durationMs;
    c.save();
    c.globalAlpha = style.alpha * (1 - k);
    c.fillStyle = style.color;
    c.beginPath();
    c.arc(px, py, Math.max(0.5, sc.opts.pxPerMm * (cfg.ripple.fromMm + (cfg.ripple.toMm - cfg.ripple.fromMm) * k)), 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  if (r.ageMs >= 0 && r.ageMs < cfg.dot.durationMs) {
    c.save();
    c.fillStyle = cfg.dot.color;
    c.beginPath();
    c.arc(px, py, Math.max(1, (sc.opts.pxPerMm * cfg.dot.diameterMm) / 2), 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}
