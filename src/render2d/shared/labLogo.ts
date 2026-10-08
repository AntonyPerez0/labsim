/**
 * LabSim lab mark (World §6.2 `labLogo`): a neutral three-bar "terminal lines" glyph and the
 * lowercase `labsim` wordmark. Drawn in canvas pixels. Distinct custom mark for this project.
 */
import { FONTS } from '../api';

/**
 * Three-bar glyph centred at (cx, cy). `size` = overall glyph width in px. Three horizontal bars
 * (full width, then 0.7×, then 0.85×) with even gaps — like terminal log lines.
 */
export function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const barH = size * 0.2;
  const gap = size * 0.14;
  const widths = [size, size * 0.7, size * 0.85];
  const totalH = barH * 3 + gap * 2;
  const left = cx - size / 2;
  let y = cy - totalH / 2;
  ctx.save();
  ctx.fillStyle = color;
  for (const w of widths) {
    ctx.fillRect(left, y, w, barH);
    y += barH + gap;
  }
  ctx.restore();
}

/** `labsim` wordmark, left edge at x, baseline y, font size px. Returns its width. */
export function drawWordmark(ctx: CanvasRenderingContext2D, x: number, baseline: number, sizePx: number, color: string, weight = 600): number {
  ctx.save();
  ctx.font = `${weight} ${sizePx}px ${FONTS.UI_SANS}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('labsim', x, baseline);
  const w = ctx.measureText('labsim').width;
  ctx.restore();
  return w;
}

/** Mark + wordmark, as on the POWER panel / tablet header: mark of height ≈ cap height × 1.25. */
export function drawLabLogo(ctx: CanvasRenderingContext2D, x: number, baseline: number, sizePx: number, color: string, weight = 600): number {
  const mark = sizePx * 0.86;
  drawMark(ctx, x + mark / 2, baseline - sizePx * 0.36, mark, color);
  const w = drawWordmark(ctx, x + mark + sizePx * 0.12, baseline, sizePx, color, weight);
  return mark + sizePx * 0.12 + w;
}
