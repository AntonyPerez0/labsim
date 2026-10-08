/**
 * Printed receipt (World §4.7): 58 mm thermal paper, MONO 2.6 mm black on paperWhite. The receipt
 * text is the sim's `TerminalDevice.lastReceipt` (one line per row). Layout rules:
 *  - the first non-empty line (merchant name) is bold and centred; following lines up to the first
 *    blank line are centred (address, date/time);
 *  - `label    value` lines (2+ spaces) are split left / right;
 *  - `TOTAL…` lines are bold; `APPROVED` / `Thank you!` / `AUTH …` lines are centred;
 *  - `---`/`===` lines become dashed rules;
 *  - a QR block is appended when printed from the 5-option flow (`opts.qrSeed`).
 */
import { FONTS, RECEIPT, type ReceiptRenderOptions } from './api';
import { drawQr } from './shared/qr';

const MARGIN_TOP_MM = 4;
const MARGIN_BOTTOM_MM = 6;
const SIDE_MM = 3;
const LINE_K = 1.4;
const QR_MM = 26;

function pxPerMm(widthPx: number): number {
  return widthPx / RECEIPT.paperMm;
}

function lines(text: string): string[] {
  const t = (text ?? '').replace(/\r/g, '');
  return t.length ? t.split('\n') : ['(blank receipt)'];
}

export function receiptHeightPx(text: string, widthPx: number, qr = false): number {
  const k = pxPerMm(widthPx);
  const n = lines(text).length;
  const mm = MARGIN_TOP_MM + n * RECEIPT.fontMm * LINE_K + (qr ? QR_MM + 4 : 0) + MARGIN_BOTTOM_MM;
  return Math.ceil(mm * k);
}

export function drawReceipt(ctx: CanvasRenderingContext2D, text: string, opts: ReceiptRenderOptions): void {
  const W = opts.widthPx;
  const k = pxPerMm(W);
  const H = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = RECEIPT.paper;
  ctx.fillRect(0, 0, W, H);
  // faint thermal-paper grain
  ctx.fillStyle = 'rgba(0,0,0,0.025)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  const fpx = RECEIPT.fontMm * k;
  const lh = fpx * LINE_K;
  const left = SIDE_MM * k;
  const right = W - SIDE_MM * k;
  let y = MARGIN_TOP_MM * k + fpx;
  let headerZone = true;
  let first = true;
  ctx.fillStyle = RECEIPT.ink;
  ctx.textBaseline = 'alphabetic';
  for (const raw of lines(text)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      if (!first) headerZone = false;
      y += lh;
      continue;
    }
    const bold = first || /^\s*TOTAL\b/i.test(line);
    ctx.font = `${bold ? 700 : 400} ${fpx}px ${FONTS.MONO}`;
    if (/^[-=]{3,}$/.test(line.trim())) {
      ctx.save();
      ctx.strokeStyle = RECEIPT.ink;
      ctx.setLineDash([k * 1.2, k * 0.8]);
      ctx.beginPath();
      ctx.moveTo(left, y - fpx * 0.35);
      ctx.lineTo(right, y - fpx * 0.35);
      ctx.stroke();
      ctx.restore();
    } else if (/\S\s{2,}\S/.test(line) && !headerZone) {
      const parts = line.trim().split(/\s{2,}/);
      const val = parts.pop()!;
      ctx.textAlign = 'left';
      ctx.fillText(parts.join('  '), left, y, right - left - ctx.measureText(val).width - k * 2);
      ctx.textAlign = 'right';
      ctx.fillText(val, right, y);
    } else if (headerZone || /^(APPROVED|DECLINED|Thank you|AUTH\b)/i.test(line.trim())) {
      ctx.textAlign = 'center';
      ctx.fillText(line.trim(), W / 2, y, right - left);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(line, left, y, right - left);
    }
    first = false;
    y += lh;
  }
  if (opts.qrSeed) {
    const s = QR_MM * k;
    drawQr(ctx, (W - s) / 2, y, s, opts.qrSeed, RECEIPT.ink, RECEIPT.paper);
  }
  ctx.restore();
}

/** A plausible receipt for a device that has not printed yet (lab defaults, World §4.7). */
export function sampleReceiptText(merchant = 'Lab Test Merchant', dateTime = '2026-10-05 09:41', totalCents = 1083, prefix = '$', brand = 'VISA **** 1111'): string {
  const f = (c: number) => `${prefix}${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
  const sub = Math.round(totalCents / 1.083);
  return [
    merchant,
    RECEIPT.address,
    dateTime,
    '',
    `Tax Item 5  ${f(sub)}`,
    '------',
    `Subtotal  ${f(sub)}`,
    `Tax  ${f(totalCents - sub)}`,
    `Tip  ${f(0)}`,
    `TOTAL  ${f(totalCents)}`,
    '',
    brand,
    'AUTH A1B2C3',
    'APPROVED',
    '',
    'Thank you!',
  ].join('\n');
}
