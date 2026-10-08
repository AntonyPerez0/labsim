/**
 * Draws the firmware buttons (World §4.1 button styles) in the display's own mm frame, so what is
 * drawn is exactly what the sim hit-tests.
 */
import { APP_ICON_COLORS, BUTTON_RADIUS_MM, FONTS } from '../api';
import { C, shade } from '../shared/theme';
import * as G from '../shared/glyphs';
import { drawQr } from '../shared/qr';
import type { Btn } from './layouts';
import type { ScreenCtx } from './context';

/** Tip amounts for a percentage button on the current order subtotal. */
function tipCents(sc: ScreenCtx, id: string): number | null {
  const m = /^(\d+)%$/.exec(id);
  if (!m) return null;
  return Math.round((sc.order.subtotal * Number(m[1])) / 100);
}

const ITEM_PRICES: Readonly<Record<string, number>> = {
  'Tax Item 5': 1000,
  Coffee: 250,
  Bagel: 325,
  'No-Tax Item': 500,
  'Non-Tax Item 1': 500,
  'Gift Card': 2500,
  'Catering Deposit': 5000,
};

export function drawButtons(sc: ScreenCtx): void {
  for (const btn of sc.btns) drawButton(sc, btn);
}

export function drawButton(sc: ScreenCtx, btn: Btn): void {
  const t = sc.t;
  const c = sc.ctx;
  const fs = t.fs;
  /** Font size in target mm for a base size (fonts scale with the class). */
  const F = (base: number) => base; // MmCtx.text already applies fs
  const land = sc.base === 'L8';
  const r = BUTTON_RADIUS_MM[sc.cls] / fs;
  const cx = btn.x + btn.w / 2;
  const cy = btn.y + btn.h / 2;
  const mid = (size: number) => cy + (size * 0.72 * fs) / 2 / 1; // baseline for vertically centred text (target mm)
  const midT = (size: number) => cy + (size * fs * 0.36);
  void mid;
  switch (btn.kind) {
    case 'primary': {
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, C.green);
      const label = btn.id === 'Charge' ? `Charge ${sc.fmt(sc.order.total)}` : btn.id;
      const size = land ? 3.6 : 3.2;
      t.text(label, cx, midT(F(size)), size, { weight: 700, color: '#ffffff', align: 'center', maxW: btn.w - 2 });
      break;
    }
    case 'secondary': {
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, '#ffffff', C.line, 0.3);
      const size = btn.id === 'Card' && sc.display.screen === 'cash-discount-tender' ? (land ? 4.2 : 3.0) : land ? 3.4 : 3.0;
      t.text(btn.id, cx, midT(size), size, { weight: 600, color: C.ink, align: 'center', maxW: btn.w - 2 });
      break;
    }
    case 'cash': {
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, C.green);
      const big = land ? 5 : 3.4;
      const small = land ? 2.8 : 2.0;
      const save = Math.max(0, Math.round(sc.order.total * 0.0305));
      t.text('Cash', cx, cy - small * fs * 0.2, big, { weight: 700, color: '#fff', align: 'center' });
      t.text(`Save ${sc.fmt(save)}`, cx, cy + big * fs * 0.62, small, { color: '#e9ffef', align: 'center' });
      break;
    }
    case 'header':
      // the screen's header bar already draws the title; the sim's tappable title is invisible
      break;
    case 'text': {
      const pay = sc.display.screen === 'payment-prompt';
      const size = pay ? (land ? 3.4 : 2.6) : land ? 3.0 : 2.2;
      t.text(btn.id, cx, midT(size), size, { weight: 600, color: pay ? C.navy : C.green, align: 'center' });
      break;
    }
    case 'outline': {
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, null, '#ffffff', 0.5);
      const size = land ? 3.6 : 3.0;
      t.text(btn.id, cx, midT(size), size, { weight: 700, color: '#ffffff', align: 'center' });
      break;
    }
    case 'tile': {
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, '#ffffff', C.line, 0.3);
      const nonTax = /no-?n?-?tax/i.test(btn.id);
      t.fillRect(btn.x, btn.y + 0.4, 1.5, btn.h - 0.8, nonTax ? '#9aa1aa' : C.green);
      const nameSize = land ? 3.0 : 2.4;
      const priceSize = land ? 2.8 : 2.2;
      t.text(btn.id, btn.x + 2.5, btn.y + (land ? 8 : 5), nameSize, { weight: 700, color: C.ink, maxW: btn.w - 3.5 });
      const price = ITEM_PRICES[btn.id];
      t.text(btn.id === 'Custom Amount' ? '+ $' : price !== undefined ? sc.fmt(price) : '', btn.x + 2.5, btn.y + btn.h - (land ? 5 : 2.5), priceSize, { color: C.inkMuted });
      break;
    }
    case 'app': {
      const color = APP_ICON_COLORS[btn.id] ?? '#64748b';
      if (land) {
        const icx = btn.x + 12;
        const icy = btn.y + 11;
        t.rrect(icx - 9, icy - 9, 18, 18, 3.6 / fs, color);
        G.appGlyph(c, btn.id, t.X(icx), t.Y(icy), t.S(13));
        t.text(btn.id, icx, icy + 13, 2.6, { color: C.ink, align: 'center', maxW: 30 });
      } else {
        const x0 = btn.x + 2;
        const y0 = btn.y + 2;
        t.rrect(x0, y0, 14, 14, 3 / fs, color);
        G.appGlyph(c, btn.id, t.X(x0 + 7), t.Y(y0 + 7), t.S(10));
        t.text(btn.id, x0 + 7, y0 + 18, 2.0, { color: C.ink, align: 'center', maxW: 21 });
      }
      break;
    }
    case 'pin':
    case 'pad-key': {
      const fill = btn.kind === 'pad-key' ? '#1b2333' : C.navy;
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, fill);
      if (btn.id === '⌫') G.backspace(c, t.X(cx), t.Y(cy), t.S(land ? 8 : 6), '#ffffff');
      else {
        const size = land ? 6.5 : 5;
        t.text(btn.id, cx, midT(size), size, { weight: 500, color: '#ffffff', align: 'center' });
      }
      break;
    }
    case 'fn-cancel':
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, C.cancel);
      G.cross(c, t.X(cx), t.Y(cy), t.S(land ? 9 : 6), '#ffffff', 0.14);
      break;
    case 'fn-clear':
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, C.clear);
      G.backspace(c, t.X(cx), t.Y(cy), t.S(land ? 9 : 6.5), C.navy);
      break;
    case 'fn-ok':
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, C.ok);
      G.check(c, t.X(cx), t.Y(cy), t.S(land ? 9 : 6.5), '#ffffff', 0.14);
      break;
    case 'pill': {
      t.rrect(btn.x, btn.y, btn.w, btn.h, btn.h / 2 / fs, '#ffffff', C.line, 0.3);
      const size = land ? 2.6 : 2.6;
      const gs = t.S(3.6);
      const gx = t.X(btn.x + btn.w / 2) - t.S(9);
      const gy = t.Y(cy);
      const ink = btn.id === 'Print' && !(sc.device.type !== 'FLEX_POCKET' && sc.device.type !== 'COMPACT') ? '#a0a6ae' : C.navy;
      switch (btn.id) {
        case 'Print':
          G.printer(c, gx, gy, gs, ink);
          break;
        case 'Email':
          G.envelope(c, gx, gy, gs, ink);
          break;
        case 'Text':
          G.chatBubble(c, gx, gy, gs, ink);
          break;
        case 'Scan for receipt':
          drawQr(c, gx - gs / 2, gy - gs / 2, gs, 'pill', ink, '#ffffff', 21);
          break;
        default:
          break;
      }
      t.text(btn.id, cx - 5, midT(size), size, { weight: 500, color: ink, maxW: btn.w - 14 });
      break;
    }
    case 'row': {
      const selected = (sc.display.screen === 'tender-select' && btn.id === (String(sc.params.tender ?? 'Card'))) || (sc.display.screen === 'oobe-network' && btn.id === 'Ethernet');
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, selected ? C.greenSoft : '#ffffff', selected ? C.green : C.line, selected ? 0.5 : 0.3);
      const size = land ? 3.2 : 2.6;
      t.circle(btn.x + 4, cy, 1.4, selected ? C.green : null, selected ? null : C.inkMuted, 0.3);
      if (selected) t.circle(btn.x + 4, cy, 0.6, '#ffffff');
      let label = btn.id;
      if (btn.id === 'Ethernet') label = 'Ethernet — Connected ✓';
      if (btn.id === 'LAB-AUTOMATION') label = 'Wi-Fi: LAB-AUTOMATION';
      if (btn.id === 'GUEST') label = 'Wi-Fi: GUEST';
      t.text(label, btn.x + 7.5, midT(size), size, { weight: 500, color: C.ink, maxW: btn.w - 9 });
      break;
    }
    case 'field': {
      const size = land ? 3.2 : 2.4;
      t.text(btn.id, btn.x, btn.y - 0.8, land ? 2.4 : 1.8, { color: C.inkMuted });
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, '#ffffff', C.line, 0.3);
      const val = btn.id === 'Merchant ID' ? String(sc.merchant?.merchantId ?? 'RCTST0000008099') : '•••• ••••';
      t.text(val, btn.x + 2, midT(size), size, { color: C.ink, family: FONTS.UI_SANS, maxW: btn.w - 4 });
      break;
    }
    case 'lang':
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, '#ffffff', C.line, 0.3);
      t.text('English (US) ▾', cx, midT(2.2), 2.2, { color: C.ink, align: 'center', maxW: btn.w - 2 });
      break;
    case 'tip': {
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, '#ffffff', C.navy, 0.4);
      const big = land ? 5.5 : 4;
      const small = land ? 3 : 2.2;
      if (btn.id === 'Custom') {
        // pencil + label side by side so both fit any button height (sim rects are 12–16 mm tall)
        const ic = Math.min(land ? 6 : 4.5, btn.h * 0.5);
        const label = land ? 3.4 : 2.6;
        const gap = 1.2;
        const tw = label * fs * 3.3;
        const x0 = cx - (ic + gap + tw) / 2;
        G.pencil(c, t.X(x0 + ic / 2), t.Y(cy), t.S(ic), C.navy);
        t.text('Custom', x0 + ic + gap, midT(label), label, { weight: 700, color: C.navy });
        void small;
      } else {
        t.text(btn.id, cx, cy + big * fs * 0.1, big, { weight: 700, color: C.navy, align: 'center' });
        const tc = tipCents(sc, btn.id);
        if (tc !== null) t.text(sc.fmt(tc), cx, cy + big * fs * 0.1 + (land ? 6 : 4.5), small, { color: C.navy, align: 'center' });
      }
      break;
    }
    case 'area': {
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, '#ffffff', C.line, 0.3);
      const ruleY = btn.y + btn.h * 0.84;
      t.line(btn.x + 4, ruleY, btn.x + btn.w - 4, ruleY, '#9aa1aa', 0.3);
      t.text('✕', btn.x + 4, ruleY - 1, 3, { color: '#9aa1aa' });
      drawStrokes(sc, btn);
      break;
    }
    case 'qr': {
      const q = Math.min(t.X(btn.w), t.Y(btn.h));
      c.fillStyle = '#ffffff';
      c.fillRect(t.X(cx) - q / 2 - t.S(0.8), t.Y(cy) - q / 2 - t.S(0.8), q + t.S(1.6), q + t.S(1.6));
      drawQr(c, t.X(cx) - q / 2, t.Y(cy) - q / 2, q, String(sc.params.qrSeed ?? sc.order.id));
      break;
    }
    case 'unlock':
      G.padlock(c, t.X(cx), t.Y(cy), t.S(land ? 9 : 6), '#c8d6ee');
      break;
    case 'table': {
      const busy = /[357]$/.test(btn.id);
      t.rrect(btn.x, btn.y, btn.w, btn.h, 2 / fs, busy ? '#fde7c8' : '#ffffff', busy ? '#b45309' : C.line, 0.4);
      t.text(btn.id, cx, midT(4), 4, { weight: 700, color: busy ? '#b45309' : C.ink, align: 'center' });
      break;
    }
    case 'dialog-ok':
      t.text('OK', cx, midT(3), 3, { weight: 700, color: C.green, align: 'center' });
      break;
    case 'list-row': {
      t.fillRect(btn.x, btn.y, btn.w, btn.h, '#ffffff');
      t.line(btn.x, btn.y + btn.h, btn.x + btn.w, btn.y + btn.h, C.line, 0.25);
      const size = land ? 3.2 : 2.4;
      const isOrder = /^#\d+/.test(btn.id);
      t.text(btn.id, btn.x + 4, midT(size), size, { weight: 600, color: C.ink });
      if (isOrder) {
        const n = Number(btn.id.slice(1)) || 1001;
        t.text(sc.fmt(1083 + ((n * 37) % 900)), btn.x + btn.w * 0.55, midT(size), size, { color: C.ink, align: 'right' });
        t.text(n % 4 === 3 ? 'Open' : 'Paid', btn.x + btn.w - 4, midT(size), size, { color: n % 4 === 3 ? '#b45309' : C.green, align: 'right' });
      } else {
        t.text('›', btn.x + btn.w - 4, midT(size), size + 1, { color: C.inkMuted, align: 'right' });
      }
      break;
    }
    case 'nav': {
      const kind = btn.id === 'nav.back' ? 'back' : btn.id === 'nav.home' ? 'home' : 'recents';
      G.navGlyph(c, kind, t.X(cx), t.Y(cy), t.S(land ? 4 : 3.4), '#e8e8e8');
      break;
    }
    default:
      t.rrect(btn.x, btn.y, btn.w, btn.h, r, shade(C.bgPanel, -0.05), C.line);
      t.text(btn.id, cx, midT(2.4), 2.4, { color: C.ink, align: 'center', maxW: btn.w - 1 });
  }
}

/** Signature strokes from `params.strokes`: JSON `[[x,y],…]` polylines (mm) or `x,y x,y;…`. */
function drawStrokes(sc: ScreenCtx, area: Btn): void {
  const raw = sc.params.strokes;
  if (raw === undefined || raw === null || raw === '') return;
  let lines: [number, number][][] = [];
  try {
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
      const parsed = JSON.parse(raw) as unknown;
      // either one polyline [[x,y],…] or several [[[x,y],…],…]
      if (Array.isArray(parsed) && Array.isArray(parsed[0]) && typeof parsed[0][0] === 'number') lines = [parsed as [number, number][]];
      else lines = parsed as [number, number][][];
    }
    else if (typeof raw === 'string')
      lines = raw.split(';').map((poly) =>
        poly
          .trim()
          .split(/\s+/)
          .map((p) => p.split(',').map(Number) as [number, number]),
      );
  } catch {
    return;
  }
  const t = sc.t;
  const c = sc.ctx;
  c.save();
  c.beginPath();
  c.rect(t.X(area.x), t.Y(area.y), t.X(area.w), t.Y(area.h));
  c.clip();
  c.strokeStyle = '#111111';
  c.lineWidth = Math.max(1, t.S(0.6));
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const poly of lines) {
    if (!Array.isArray(poly) || poly.length < 2) continue;
    c.beginPath();
    poly.forEach(([x, y], i) => (i === 0 ? c.moveTo(t.X(x), t.Y(y)) : c.lineTo(t.X(x), t.Y(y))));
    c.stroke();
  }
  c.restore();
}
