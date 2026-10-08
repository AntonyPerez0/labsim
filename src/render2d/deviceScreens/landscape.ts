/**
 * Class L8 screens (172.3 × 107.7 mm; L14 draws the same with scaled positions) — World §4.4.
 * Decoration only, in base-L8 mm; the firmware buttons are drawn afterwards.
 */
import { C } from '../shared/theme';
import * as G from '../shared/glyphs';
import { drawMark } from '../shared/labLogo';
import { drawQr } from '../shared/qr';
import { launcherApps } from './layouts';
import type { ScreenCtx } from './context';
import { bootScreen, dim, dots, errorTitle, fillBg, genericScreen, humanise, idleScreen, lineText, lockBackground, lockClock, merchantChrome, progressBar, progressOf, resultDisc, spinnerAt } from './common';

const W = 172.3;
const H = 107.7;

function header(sc: ScreenCtx, title: string, h = 8): void {
  sc.m.fillRect(0, 3.5, W, h, C.green);
  sc.m.text(title, 5, 3.5 + h * 0.7, 3.6, { weight: 700, color: '#ffffff', maxW: 120 });
}

function row(sc: ScreenCtx, label: string, value: string, xL: number, xR: number, y: number, size: number, bold = false, color = C.ink): void {
  sc.m.text(label, xL, y, size, { weight: bold ? 700 : 400, color });
  sc.m.text(value, xR, y, size, { weight: bold ? 700 : 400, color, align: 'right' });
}

const chrome = (sc: ScreenCtx) => merchantChrome(sc, 3.5, 101.7, 6);

export function drawLandscape(sc: ScreenCtx): void {
  const m = sc.m;
  const s = sc.display.screen as string;
  const o = sc.order;
  switch (s) {
    case 'boot':
      bootScreen(sc, 86, 46, 22, 66, 7, 80);
      return;
    case 'customer-idle':
      idleScreen(sc, 14);
      return;
    case 'lock':
      lockBackground(sc);
      lockClock(sc, 106, 44, 26, 7.5, 106, 49.5);
      if (sc.params.pad) dots(sc, 40, 30, 4, Number(sc.params.digits ?? 0) || 0, 1.6, 7, '#ffffff', '#8a97ad');
      else m.text('Swipe up or tap to unlock', W / 2, 99, 2.4, { color: '#8a97ad', align: 'center' });
      return;
    case 'home': {
      fillBg(sc, C.bgMerchant);
      m.fillRect(0, 3.5, W, 9, C.green);
      m.text(sc.merchantName, 5, 10, 3.4, { weight: 700, color: '#ffffff', maxW: 120 });
      drawMark(sc.ctx, m.X(165), m.Y(8), m.S(5.5), '#ffffff');
      const pages = Math.max(1, Math.ceil(launcherApps(sc.device.apps ?? []).length / 10));
      const page = Math.min(pages - 1, Math.max(0, Number(sc.params.page ?? sc.params.scroll ?? 0) || 0));
      for (let i = 0; i < pages; i++) m.circle(W / 2 - ((pages - 1) * 4) / 2 + i * 4, 96, 0.9, i === page ? C.green : '#c3c8cf');
      chrome(sc);
      return;
    }
    case 'register':
      fillBg(sc, C.bgMerchant);
      header(sc, 'Register');
      G.search(sc.ctx, m.X(102), m.Y(7.5), m.S(5), '#ffffff');
      m.fillRect(110, 11.5, 62.3, 90.2, C.bgPanel);
      m.text('Current order', 114, 18, 3.2, { weight: 700 });
      o.lines.slice(0, 7).forEach((l, i) => row(sc, lineText(l), sc.fmt(l.priceCents * l.qty), 114, 168, 25 + i * 6, 2.8));
      m.line(114, 67, 168, 67, C.line, 0.3);
      row(sc, 'Subtotal', sc.fmt(o.subtotal), 114, 168, 72, 2.8);
      row(sc, 'Tax', sc.fmt(o.tax), 114, 168, 78, 2.8);
      row(sc, 'Total', sc.fmt(o.total), 114, 168, 85, 3.4, true);
      chrome(sc);
      return;
    case 'review-order':
      fillBg(sc, '#ffffff');
      header(sc, 'Review order');
      o.lines.slice(0, 9).forEach((l, i) => {
        const y = 18 + i * 7;
        m.text(l.name, 4, y, 3.2, { weight: 500, maxW: 70 });
        m.text(`× ${l.qty}`, 86, y, 3.0, { color: C.inkMuted, align: 'right' });
        m.text(sc.fmt(l.priceCents * l.qty), 106, y, 3.2, { align: 'right' });
      });
      m.fillRect(110, 11.5, 62.3, 90.2, C.bgPanel);
      row(sc, 'Subtotal', sc.fmt(o.subtotal), 114, 168, 60, 3.0);
      row(sc, 'Tax', sc.fmt(o.tax), 114, 168, 67, 3.0);
      row(sc, 'Total', sc.fmt(o.total), 114, 168, 76, 4, true);
      chrome(sc);
      return;
    case 'tender-select':
      fillBg(sc, '#ffffff');
      header(sc, 'Payment');
      m.text(sc.fmt(o.total), 55, 34, 10, { weight: 700, align: 'center' });
      m.text('Select tender', 8, 43, 2.8, { color: C.inkMuted });
      m.fillRect(110, 11.5, 62.3, 90.2, C.bgPanel);
      row(sc, 'Subtotal', sc.fmt(o.subtotal), 114, 168, 60, 3.0);
      row(sc, 'Tax', sc.fmt(o.tax), 114, 168, 67, 3.0);
      row(sc, 'Total', sc.fmt(o.total), 114, 168, 76, 4, true);
      chrome(sc);
      return;
    case 'cash-discount-tender': {
      fillBg(sc, '#ffffff');
      header(sc, 'Payment');
      const cash = Math.round(o.total * 0.9695);
      m.text('Pay with cash and save', W / 2, 22, 4, { weight: 700, align: 'center' });
      m.text(`Cash price  ${sc.fmt(cash)}`, W / 2, 30, 3.0, { align: 'center' });
      m.text(`Card price  ${sc.fmt(o.total)}`, W / 2, 36, 3.0, { color: C.inkMuted, align: 'center' });
      chrome(sc);
      return;
    }
    case 'payment-prompt': {
      fillBg(sc, C.bgCustomer);
      m.text(sc.fmt(o.total + o.tip), 60, 40, 12, { weight: 700, color: C.navy, align: 'center' });
      m.text('Tap, insert, or swipe card', 60, 52, 4, { color: C.ink, align: 'center' });
      const pulse = 0.75 + 0.25 * Math.sin(((sc.timeMs % 1000) / 1000) * Math.PI * 2);
      sc.ctx.save();
      sc.ctx.globalAlpha = pulse;
      G.contactless(sc.ctx, m.X(130), m.Y(22), m.S(16), C.navy);
      G.insertCard(sc.ctx, m.X(130), m.Y(50), m.S(16), C.navy);
      G.swipeCard(sc.ctx, m.X(130), m.Y(78), m.S(16), C.navy);
      sc.ctx.restore();
      m.text('Tap', 141, 23.5, 3.2, { color: C.navy });
      m.text('Insert', 141, 51.5, 3.2, { color: C.navy });
      m.text('Swipe', 141, 79.5, 3.2, { color: C.navy });
      // NFC landmark sits on the bottom bezel (§3.1): arrow hint toward it
      m.text('▼ tap below the screen', W / 2, 104, 2.2, { color: C.navy, align: 'center', alpha: 0.7 });
      return;
    }
    case 'pin-entry': {
      fillBg(sc, C.bgCustomer);
      // amount + PIN field in the column left of the keypad (keypad x comes from the firmware layout)
      const padLeft = sc.btns.filter((b) => /^\d$/.test(b.id)).reduce((mn, b) => Math.min(mn, b.x), sc.TW) * (m.k / m.X(1));
      const colR = Math.min(80, padLeft - 4);
      const cx = colR / 2 + 2;
      const fw = Math.min(56, colR - 8);
      m.text(sc.fmt(o.total + o.tip), cx, 30, 7, { weight: 700, color: C.navy, align: 'center', maxW: colR - 2 });
      m.text('ENTER PIN', cx, 40, 3, { color: C.navy, align: 'center', weight: 500 });
      m.rrect(cx - fw / 2, 46, fw, 10, 2, '#ffffff');
      const n = Math.min(6, Number(sc.params.digits ?? sc.params.pinLength ?? 0) || 0);
      for (let i = 0; i < n; i++) m.text('•', cx - ((n - 1) * 6) / 2 + i * 6, 53.6, 5, { color: C.navy, align: 'center' });
      G.shield(sc.ctx, m.X(26), m.Y(99), m.S(3), 'rgba(31,43,74,0.7)');
      m.text('Secure Touch', 42, 100, 2.6, { color: C.navy, alpha: 0.7, align: 'center' });
      return;
    }
    case 'tip':
      fillBg(sc, '#ffffff');
      m.fillRect(0, 0, W, 12, C.bgCustomer);
      m.text('Add a tip?', W / 2, 8.4, 4, { color: C.navy, align: 'center', weight: 600 });
      m.text(`Subtotal ${sc.fmt(o.subtotal)}`, W / 2, 22, 3, { align: 'center' });
      return;
    case 'signature':
      fillBg(sc, C.bgCustomer);
      m.text('Please sign below', W / 2, 8, 3.4, { color: C.navy, align: 'center', weight: 500 });
      return;
    case 'processing':
      fillBg(sc, C.bgCustomer);
      spinnerAt(sc, 86, 40, 32, C.navy, 'rgba(31,43,74,0.18)');
      m.text('Processing…', W / 2, 72, 7, { color: C.navy, align: 'center', weight: 500 });
      if (sc.device.cardPresent) m.text('Do not remove card', W / 2, 82, 3.2, { color: C.navy, align: 'center' });
      return;
    case 'approved':
      fillBg(sc, C.approved);
      resultDisc(sc, 86, 40, 32, 'check', C.approved);
      m.text('Approved', W / 2, 72, 7, { weight: 700, color: '#ffffff', align: 'center' });
      m.text(sc.fmt(o.total + o.tip), W / 2, 82, 4.4, { color: '#ffffff', align: 'center' });
      m.text(`Auth #${String(sc.params.auth ?? 'A1B2C3')}`, W / 2, 89, 2.6, { color: '#ffffff', alpha: 0.8, align: 'center' });
      return;
    case 'declined':
      fillBg(sc, C.declined);
      resultDisc(sc, 86, 40, 32, 'cross', C.declined);
      m.text('Declined', W / 2, 72, 7, { weight: 700, color: '#ffffff', align: 'center' });
      m.text(String(sc.params.reason ?? 'Card read error'), W / 2, 82, 3.2, { color: '#ffffff', align: 'center' });
      return;
    case 'receipt-options': {
      fillBg(sc, '#f6f8fb');
      m.fillRect(0, 0, W, 12, C.bgCustomer);
      m.text('Thank you!', W / 2, 8.4, 4, { color: C.navy, align: 'center', weight: 600 });
      if (sc.params.qr) {
        drawQr(sc.ctx, m.X(20), m.Y(20), Math.min(m.X(50), m.Y(50)), String(sc.params.qrSeed ?? o.id));
        m.text('Scan to get your', 80, 45, 4, { color: C.navy, weight: 600 });
        m.text('receipt', 80, 51, 4, { color: C.navy, weight: 600 });
        return;
      }
      {
        const t = sc.t;
        const qr = sc.btns.find((b) => b.kind === 'qr');
        const firstRow = sc.btns.filter((b) => b.kind === 'pill').reduce((mn, b) => Math.min(mn, b.y), sc.TH);
        const headerBot = m.Y(12) / t.k;
        const y = Math.max(headerBot + 4.2, (qr ? qr.y : firstRow) - 2);
        t.text('How would you like your receipt?', sc.TW / 2, y, 3.4, { weight: 700, color: C.navy, align: 'center' });
        if (qr) t.text('▣ Receipts now available by QR', qr.x + qr.w + 3, qr.y + qr.h / 2 + 0.8, 2.2, { color: C.green });
        else if (sc.btns.some((b) => b.id === 'Scan for receipt')) t.text('▣ Receipts now available by QR', sc.TW / 2, y + 5.4, 2.2, { color: C.green, align: 'center' });
      }
      return;
    }
    case 'printing':
      fillBg(sc, '#ffffff');
      G.printer(sc.ctx, m.X(86), m.Y(38), m.S(22), C.navy);
      m.text('Printing receipt…', W / 2, 64, 4.4, { align: 'center' });
      progressBar(sc, 46, 70, 80, 2.5, progressOf(sc, 1200), C.green, '#e4e7eb');
      return;
    case 'customer-cart': {
      fillBg(sc, '#ffffff');
      m.fillRect(0, 0, W, 10, C.bgCustomer);
      m.text('Your order', W / 2, 7, 3.2, { color: C.navy, align: 'center', weight: 600 });
      o.lines.slice(0, 11).forEach((l, i) => row(sc, lineText(l), sc.fmt(l.priceCents * l.qty), 8, 100, 18 + i * 7, 3.0));
      m.fillRect(110, 16, 56, 60, C.bgPanel);
      const v2 = (sc.device as { cfdLayout?: string }).cfdLayout === 'v2';
      row(sc, 'Subtotal', sc.fmt(o.subtotal), 114, 162, 30, 3.2);
      row(sc, 'Tax', sc.fmt(o.tax), 114, 162, 40, 3.2);
      m.line(114, 45, 162, 45, C.line, 0.3);
      row(sc, v2 ? 'Total' : 'TOTAL', sc.fmt(o.total), 114, 162, 55, 4.4, true);
      return;
    }
    case 'oobe-welcome':
      fillBg(sc, '#ffffff');
      drawMark(sc.ctx, m.X(86), m.Y(34), m.S(22), C.green);
      m.text('Welcome to LabSim', W / 2, 62, 6, { weight: 700, align: 'center' });
      m.text("Let's set up this device", W / 2, 70, 3.2, { color: C.inkMuted, align: 'center' });
      m.rrect(20, 88, 40, 10, 2, '#ffffff', C.line, 0.3);
      m.text('English (US) ▾', 40, 94.6, 3, { align: 'center' });
      return;
    case 'oobe-network':
    case 'oobe-merchant':
    case 'oobe-employee': {
      fillBg(sc, '#ffffff');
      const title = s === 'oobe-network' ? 'Connect to a network' : s === 'oobe-merchant' ? 'Activate this device' : 'Create your passcode';
      m.text(title, s === 'oobe-employee' ? 40 : W / 2, 12, 4, { weight: 700, align: 'center' });
      if (s === 'oobe-employee') dots(sc, 40, 30, 4, Number(sc.params.digits ?? 0) || 0, 1.6, 7, C.ink, C.inkMuted);
      return;
    }
    case 'oobe-complete':
      fillBg(sc, '#ffffff');
      resultDisc(sc, 86, 36, 30, 'check', '#ffffff', C.green);
      m.text("You're all set", W / 2, 66, 6, { weight: 700, align: 'center' });
      m.text(`Merchant: ${sc.merchantName}`, W / 2, 74, 3, { color: C.inkMuted, align: 'center' });
      return;
    case 'deprovisioning':
      fillBg(sc, '#0b1220');
      drawMark(sc.ctx, m.X(86), m.Y(46), m.S(16), '#ffffff');
      m.text('Resetting device…', W / 2, 64, 4, { color: '#ffffff', align: 'center' });
      progressBar(sc, 36, 70, 100, 3, progressOf(sc, 6000), C.green, '#1f2a3d');
      m.text('Laz Automation', W / 2, 102, 2.4, { color: '#7b8794', align: 'center' });
      return;
    case 'app-orders':
    case 'app-transactions':
    case 'app-setup':
    case 'app-dining':
      fillBg(sc, s === 'app-dining' ? '#f7f3ee' : '#ffffff');
      header(sc, s === 'app-dining' ? 'LabSim Dining' : humanise(s));
      chrome(sc);
      return;
    case 'error': {
      fillBg(sc, C.bgMerchant);
      m.fillRect(0, 3.5, W, 9, C.green);
      chrome(sc);
      dim(sc, 0.6);
      m.rrect(46, 30, 80, 40, 2, '#ffffff');
      const [l1, l2] = errorTitle(sc);
      m.text(l1, 50, 42, 3.4, { maxW: 72 });
      m.text(l2, 50, 47, 3.4, { maxW: 72 });
      return;
    }
    case 'waiting-for-customer':
      genericScreen(sc, 'Customer is paying…', 'Waiting for the customer-facing display', '#ffffff', C.ink);
      return;
    case 'waiting-for-merchant':
      genericScreen(sc, 'Waiting for merchant device…', null, '#000000', '#c8d6ee');
      return;
    case 'receipt-done':
      genericScreen(sc, 'Your receipt is on its way', null, C.bgCustomer, C.navy);
      return;
    case 'thank-you':
      genericScreen(sc, 'Thank you', null, C.bgCustomer, C.navy);
      return;
    default:
      genericScreen(sc, humanise(s), null, C.bgCustomer, C.navy);
      void H;
  }
}
