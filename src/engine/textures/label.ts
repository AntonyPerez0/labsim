/**
 * Printed label-maker tape (black text on white), e.g. "MEGATRON\nCFD" on the rig bays.
 * Text is auto-fitted: the largest font size whose lines fit inside the tape with margins.
 */
import type { Texture } from 'three';
import { makeCanvas, rng, hashString, toTexture } from './canvasUtil';

export interface LabelOptions {
  bg?: string;
  fg?: string;
  /** CSS font weight + family, without size (e.g. "700 'Helvetica Neue', Arial, sans-serif"). */
  font?: string;
  widthPx?: number;
  heightPx?: number;
}

export const DEFAULT_LABEL_FONT = "700 'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif";

export function makeLabel(text: string, opts: LabelOptions, anisotropy: number): Texture {
  const W = Math.max(16, Math.round(opts.widthPx ?? 512));
  const H = Math.max(8, Math.round(opts.heightPx ?? 128));
  const bg = opts.bg ?? '#f3f2ec';
  const fg = opts.fg ?? '#111111';
  const font = opts.font ?? DEFAULT_LABEL_FONT;
  const { canvas, ctx } = makeCanvas(W, H);

  // Tape body with subtle sheen + texture.
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const r = rng(hashString(text));
  const isLight = luminance(bg) > 0.5;
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < (W * H) / 60; i++) {
    ctx.fillStyle = r() > 0.5 ? (isLight ? '#000' : '#fff') : isLight ? '#fff' : '#000';
    ctx.fillRect(r() * W, r() * H, 1, 1);
  }
  ctx.globalAlpha = 1;
  const sheen = ctx.createLinearGradient(0, 0, 0, H);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  // Auto-fit text.
  const lines = text.split('\n');
  const marginX = W * 0.06;
  const marginY = H * 0.12;
  const availW = W - marginX * 2;
  const availH = H - marginY * 2;
  const lineGap = 1.08;
  let size = Math.floor(availH / (lines.length * lineGap));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (; size > 6; size -= 1) {
    ctx.font = composeFont(font, size);
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
    if (widest <= availW) break;
  }
  ctx.font = composeFont(font, size);
  ctx.fillStyle = fg;
  const total = lines.length * size * lineGap;
  const top = (H - total) / 2 + (size * lineGap) / 2;
  lines.forEach((l, i) => {
    ctx.fillText(l, W / 2, top + i * size * lineGap + size * 0.04);
  });

  const tex = toTexture(canvas, { srgb: true, repeat: false, anisotropy });
  tex.userData.aspect = W / H;
  return tex;
}

function composeFont(font: string, size: number): string {
  // "700 'Helvetica Neue', Arial" → "700 42px 'Helvetica Neue', Arial"
  const m = /^\s*(normal|bold|bolder|lighter|\d{3})\s+(.*)$/i.exec(font);
  if (m) return `${m[1]} ${size}px ${m[2]}`;
  return `${size}px ${font}`;
}

function luminance(css: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return 1;
  const n = parseInt(m[1]!, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
