/**
 * Class P screens (68.0 × 136.0 mm; P-s draws the same with scaled positions) — World §4.3.
 * Everything here is decoration in base-P mm; buttons are drawn afterwards from the firmware layout.
 */
import { C } from '../shared/theme';
import * as G from '../shared/glyphs';
import { drawMark } from '../shared/labLogo';
import { drawQr } from '../shared/qr';
import type { ScreenCtx } from './context';
import { bootScreen, dim, dots, errorTitle, fillBg, genericScreen, humanise, idleScreen, lineText, lockBackground, lockClock, merchantChrome, progressBar, progressOf, resultDisc, spinnerAt } from './common';

const W = 68;

function header(sc: ScreenCtx, title: string, h = 9): void {
  sc.m.fillRect(0, 4, W, h, C.green);
  sc.m.text(title, 4, 4 + h * 0.69, 3.0, { weight: 700, color: '#ffffff', maxW: 52 });
}

function totalsRight(sc: ScreenCtx, label: string, value: string, y: number, size: number, bold: boolean, xL = 4, xR = 64, color = C.ink): void {
  sc.m.text(label, xL, y, size, { weight: bold ? 700 : 400, color });
  sc.m.text(value, xR, y, size, { weight: bold ? 700 : 400, color, align: 'right' });
}

export function drawPortrait(sc: ScreenCtx): void {
  const m = sc.m;
  const s = sc.display.screen as string;
  const o = sc.order;
  switch (s) {
    case 'boot':
      bootScreen(sc, 34, 58, 18, 76, 6, 92);
      return;
    case 'customer-idle':
      idleScreen(sc, 10);
      return;
    case 'lock': {
      lockBackground(sc);
      lockClock(sc, 30, 50, 18, 5.5, 34, 56);
      if (sc.params.pad) {
        const filled = Number(sc.params.digits ?? sc.params.entered ?? 0) || 0;
        dots(sc, 34, 30, 4, filled, 1.2, 5, '#ffffff', '#8a97ad');
      } else m.text('Swipe up or tap to unlock', 34, 126, 2.0, { color: '#8a97ad', align: 'center' });
      return;
    }
    case 'home': {
      fillBg(sc, C.bgMerchant);
      m.fillRect(0, 4, W, 10, C.green);
      m.text(sc.merchantName, 4, 10.6, 2.6, { weight: 700, color: '#ffffff', maxW: 54 });
      drawMark(sc.ctx, m.X(63), m.Y(9), m.S(4), '#ffffff');
      // scroll hint (more apps below the fold)
      m.fillRect(66.2, 16 + (Number(sc.params.scroll ?? 0) > 0 ? 40 : 0), 0.8, 60, 'rgba(0,0,0,0.15)');
      merchantChrome(sc, 4, 130, 6);
      return;
    }
    case 'register': {
      fillBg(sc, C.bgMerchant);
      header(sc, 'Register');
      G.search(sc.ctx, m.X(62), m.Y(8.5), m.S(4), '#ffffff');
      m.fillRect(0, 13, W, 6, '#ffffff');
      const chips: [string, number, number][] = [
        ['All', 3, 9],
        ['Taxable', 14, 14],
        ['Non-tax', 30, 14],
      ];
      chips.forEach(([label, x, w], i) => {
        m.rrect(x, 14, w, 4, 2, i === 0 ? C.greenSoft : '#ffffff', i === 0 ? C.green : C.line, 0.25);
        m.text(label, x + w / 2, 16.8, 2.0, { color: i === 0 ? C.greenDark : C.ink, align: 'center' });
      });
      m.fillRect(0, 66, W, 45, C.bgPanel);
      m.text('Current order', 4, 70.5, 2.4, { weight: 700 });
      o.lines.slice(0, 4).forEach((l, i) => totalsRight(sc, lineText(l), sc.fmt(l.priceCents * l.qty), 76 + i * 5, 2.2, false));
      m.line(4, 96, 64, 96, C.line, 0.25);
      totalsRight(sc, 'Subtotal', sc.fmt(o.subtotal), 100, 2.2, false);
      totalsRight(sc, 'Tax', sc.fmt(o.tax), 104.5, 2.2, false);
      totalsRight(sc, 'Total', sc.fmt(o.total), 109, 2.6, true);
      merchantChrome(sc, 4, 130, 6);
      return;
    }
    case 'review-order': {
      fillBg(sc, '#ffffff');
      header(sc, 'Review order');
      o.lines.slice(0, 7).forEach((l, i) => {
        const y = 20 + i * 6;
        m.text(l.name, 4, y, 2.4, { weight: 500, maxW: 36 });
        m.text(`× ${l.qty}`, 44, y, 2.2, { color: C.inkMuted, align: 'right' });
        m.text(sc.fmt(l.priceCents * l.qty), 64, y, 2.4, { align: 'right' });
      });
      m.line(4, 86, 64, 86, C.line, 0.25);
      totalsRight(sc, 'Subtotal', sc.fmt(o.subtotal), 92, 2.4, false);
      totalsRight(sc, 'Tax', sc.fmt(o.tax), 97, 2.4, false);
      totalsRight(sc, 'Total', sc.fmt(o.total), 103, 3.0, true);
      merchantChrome(sc, 4, 130, 6);
      return;
    }
    case 'tender-select':
      fillBg(sc, '#ffffff');
      header(sc, 'Payment');
      m.text(sc.fmt(o.total), W / 2, 30, 7, { weight: 700, align: 'center' });
      m.text('Select tender', 4, 40, 2.2, { color: C.inkMuted });
      merchantChrome(sc, 4, 130, 6);
      return;
    case 'cash-discount-tender': {
      fillBg(sc, '#ffffff');
      header(sc, 'Payment');
      const cash = Math.round(o.total * 0.9695);
      m.text(sc.fmt(o.total), W / 2, 22, 6, { weight: 700, align: 'center' });
      m.text('Pay with cash and save', W / 2, 31, 2.8, { weight: 700, align: 'center' });
      m.text(`Cash price  ${sc.fmt(cash)}`, 6, 37, 2.2, { color: C.ink });
      m.text(`Card price  ${sc.fmt(o.total)}`, 6, 42, 2.2, { color: C.inkMuted });
      merchantChrome(sc, 4, 130, 6);
      return;
    }
    case 'payment-prompt': {
      fillBg(sc, C.bgCustomer);
      m.text(sc.fmt(o.total + o.tip), W / 2, 30, 9, { weight: 700, color: C.navy, align: 'center' });
      m.text('Tap, insert, or swipe card', W / 2, 38, 3.0, { color: C.ink, align: 'center', maxW: 64 });
      const pulse = 0.75 + 0.25 * Math.sin(((sc.timeMs % 1000) / 1000) * Math.PI * 2);
      sc.ctx.save();
      sc.ctx.globalAlpha = pulse;
      G.contactless(sc.ctx, m.X(13), m.Y(58), m.S(15), C.navy);
      G.insertCard(sc.ctx, m.X(34), m.Y(58), m.S(15), C.navy);
      G.swipeCard(sc.ctx, m.X(55), m.Y(58), m.S(15), C.navy);
      sc.ctx.restore();
      for (const [label, x] of [
        ['Tap', 13],
        ['Insert', 34],
        ['Swipe', 55],
      ] as const)
        m.text(label, x, 70, 2.2, { color: C.navy, align: 'center' });
      m.circle(34, 111, 7, 'rgba(255,255,255,0.55)', C.navy, 0.35);
      G.contactless(sc.ctx, m.X(35.5), m.Y(111), m.S(9), C.navy);
      m.text('Tap here', 34, 121, 2.0, { color: C.navy, align: 'center' });
      return;
    }
    case 'pin-entry': {
      fillBg(sc, C.bgCustomer);
      m.text(sc.fmt(o.total + o.tip), W / 2, 14, 5.5, { weight: 700, color: C.navy, align: 'center' });
      m.text('ENTER PIN', W / 2, 21, 2.6, { color: C.navy, align: 'center', weight: 500 });
      m.rrect(14, 25, 40, 8, 1.5, '#ffffff');
      const n = Math.min(6, Number(sc.params.digits ?? sc.params.pinLength ?? 0) || 0);
      for (let i = 0; i < n; i++) m.text('•', 34 - ((n - 1) * 4.5) / 2 + i * 4.5, 30.8, 4, { color: C.navy, align: 'center' });
      G.shield(sc.ctx, m.X(21.5), m.Y(131.2), m.S(2.4), 'rgba(31,43,74,0.7)');
      m.text('Secure Touch', 35, 132, 2.0, { color: C.navy, alpha: 0.7, align: 'center' });
      return;
    }
    case 'tip':
      fillBg(sc, '#ffffff');
      m.fillRect(0, 0, W, 14, C.bgCustomer);
      m.text('Add a tip?', W / 2, 9, 3.4, { color: C.navy, align: 'center', weight: 600 });
      m.text(`Subtotal ${sc.fmt(o.subtotal)}`, W / 2, 20, 2.2, { color: C.ink, align: 'center' });
      return;
    case 'signature':
      fillBg(sc, C.bgCustomer);
      m.text('Please sign below', W / 2, 8, 2.8, { color: C.navy, align: 'center', weight: 500 });
      return;
    case 'processing':
      fillBg(sc, C.bgCustomer);
      spinnerAt(sc, 34, 58, 14, C.navy, 'rgba(31,43,74,0.18)');
      m.text('Processing…', W / 2, 80, 3, { color: C.navy, align: 'center', weight: 500 });
      if (sc.device.cardPresent) m.text('Do not remove card', W / 2, 86, 2.2, { color: C.navy, align: 'center' });
      return;
    case 'approved':
      fillBg(sc, C.approved);
      resultDisc(sc, 34, 50, 30, 'check', C.approved);
      m.text('Approved', W / 2, 80, 6, { weight: 700, color: '#ffffff', align: 'center' });
      m.text(sc.fmt(o.total + o.tip), W / 2, 88, 3.6, { color: '#ffffff', align: 'center' });
      m.text(`Auth #${String(sc.params.auth ?? 'A1B2C3')}`, W / 2, 94, 2.0, { color: '#ffffff', alpha: 0.8, align: 'center' });
      return;
    case 'declined':
      fillBg(sc, C.declined);
      resultDisc(sc, 34, 50, 30, 'cross', C.declined);
      m.text('Declined', W / 2, 80, 6, { weight: 700, color: '#ffffff', align: 'center' });
      m.text(String(sc.params.reason ?? 'Card read error'), W / 2, 87, 2.2, { color: '#ffffff', align: 'center', maxW: 62 });
      return;
    case 'receipt-options': {
      fillBg(sc, '#f6f8fb');
      m.fillRect(0, 0, W, 14, C.bgCustomer);
      m.text('Thank you!', W / 2, 9.5, 3.4, { color: C.navy, align: 'center', weight: 600 });
      if (sc.params.qr) {
        const seed = String(sc.params.qrSeed ?? o.id);
        drawQr(sc.ctx, m.X(12), m.Y(30), Math.min(m.X(44), m.Y(44)), seed);
        m.text('Scan to get your receipt', W / 2, 84, 2.8, { color: C.navy, align: 'center', maxW: 64 });
        return;
      }
      // fit the text block between the header and the QR / first option (sim layouts differ per type)
      const t = sc.t;
      const TW = sc.TW;
      const qr = sc.btns.find((b) => b.kind === 'qr');
      const firstRow = sc.btns.filter((b) => b.kind === 'pill').reduce((mn, b) => Math.min(mn, b.y), sc.TH);
      const bandTop = m.Y(14) / t.k;
      const bandBot = (qr ? qr.y : firstRow) - 1.5;
      t.text(`${sc.fmt(o.total + o.tip)} paid`, TW / 2, bandTop + 6, 2.6, { color: C.ink, align: 'center' });
      const glyphH = Math.min(18, bandBot - bandTop - 20);
      if (glyphH > 6) G.receiptGlyph(sc.ctx, t.X(TW / 2), t.Y(bandTop + 9 + glyphH / 2), t.S(glyphH * 0.78), t.S(glyphH), '#8b93a1');
      t.text('How would you like your', TW / 2, bandBot - 4.4, 2.8, { weight: 700, color: C.navy, align: 'center' });
      t.text('receipt?', TW / 2, bandBot - 0.6, 2.8, { weight: 700, color: C.navy, align: 'center' });
      const five = sc.btns.some((b) => b.id === 'Scan for receipt');
      if (five && !qr) t.text('▣ Receipts now available by QR', TW / 2, bandBot + 3.4, 1.8, { color: C.green, align: 'center' });
      return;
    }
    case 'printing': {
      fillBg(sc, '#ffffff');
      G.printer(sc.ctx, m.X(34), m.Y(50), m.S(16), C.navy);
      m.text('Printing receipt…', W / 2, 70, 3, { color: C.ink, align: 'center' });
      progressBar(sc, 14, 76, 40, 2, progressOf(sc, 1200), C.green, '#e4e7eb');
      return;
    }
    case 'customer-cart': {
      fillBg(sc, '#ffffff');
      m.fillRect(0, 0, W, 10, C.bgCustomer);
      m.text('Your order', W / 2, 6.8, 2.8, { color: C.navy, align: 'center', weight: 600 });
      o.lines.slice(0, 12).forEach((l, i) => {
        const y = 18 + i * 6;
        m.text(lineText(l), 4, y, 2.4, { maxW: 44 });
        m.text(sc.fmt(l.priceCents * l.qty), 64, y, 2.4, { align: 'right' });
      });
      m.fillRect(4, 96, 60, 30, C.bgPanel);
      const v2 = (sc.device as { cfdLayout?: string }).cfdLayout === 'v2';
      totalsRight(sc, 'Subtotal', sc.fmt(o.subtotal), 104, 2.4, false, 7, 61);
      totalsRight(sc, 'Tax', sc.fmt(o.tax), 111, 2.4, false, 7, 61);
      totalsRight(sc, v2 ? 'Total' : 'TOTAL', sc.fmt(o.total), 120, 3.4, true, 7, 61);
      return;
    }
    case 'oobe-welcome':
      fillBg(sc, '#ffffff');
      drawMark(sc.ctx, m.X(34), m.Y(40), m.S(24), C.green);
      m.text('Welcome to LabSim', W / 2, 70, 4.6, { weight: 700, align: 'center' });
      m.text("Let's set up this device", W / 2, 77, 2.4, { color: C.inkMuted, align: 'center' });
      return;
    case 'oobe-network':
    case 'oobe-merchant':
    case 'oobe-employee': {
      fillBg(sc, '#ffffff');
      const title = s === 'oobe-network' ? 'Connect to a network' : s === 'oobe-merchant' ? 'Activate this device' : 'Create your passcode';
      m.text(title, W / 2, 12, 3.2, { weight: 700, align: 'center' });
      if (s === 'oobe-employee') dots(sc, 34, 21, 4, Number(sc.params.digits ?? 0) || 0, 1.2, 5, C.ink, C.inkMuted);
      return;
    }
    case 'oobe-complete':
      fillBg(sc, '#ffffff');
      resultDisc(sc, 34, 50, 30, 'check', '#ffffff', C.green);
      m.text("You're all set", W / 2, 80, 4.6, { weight: 700, align: 'center' });
      m.text(`Merchant: ${sc.merchantName}`, W / 2, 87, 2.2, { color: C.inkMuted, align: 'center', maxW: 62 });
      return;
    case 'deprovisioning':
      fillBg(sc, '#0b1220');
      drawMark(sc.ctx, m.X(34), m.Y(50), m.S(16), '#ffffff');
      m.text('Resetting device…', W / 2, 72, 3, { color: '#ffffff', align: 'center' });
      progressBar(sc, 8, 78, 52, 2.5, progressOf(sc, 6000), C.green, '#1f2a3d');
      m.text('Laz Automation', W / 2, 128, 1.8, { color: '#7b8794', align: 'center' });
      return;
    case 'app-orders':
    case 'app-transactions':
    case 'app-setup':
    case 'app-dining': {
      fillBg(sc, s === 'app-dining' ? '#f7f3ee' : '#ffffff');
      header(sc, s === 'app-dining' ? 'LabSim Dining' : humanise(s));
      merchantChrome(sc, 4, 130, 6);
      return;
    }
    case 'error': {
      // previous screen dimmed 60 %: the launcher behind the dialog
      fillBg(sc, C.bgMerchant);
      m.fillRect(0, 4, W, 10, C.green);
      merchantChrome(sc, 4, 130, 6);
      dim(sc, 0.6);
      m.rrect(6, 48, 56, 34, 2, '#ffffff');
      const [l1, l2] = errorTitle(sc);
      m.text(l1, 10, 57, 2.6, { color: C.ink, maxW: 48 });
      m.text(l2, 10, 61, 2.6, { color: C.ink, maxW: 48 });
      return;
    }
    default:
      genericScreen(sc, humanise(s), null, C.bgCustomer, C.navy);
  }
}
