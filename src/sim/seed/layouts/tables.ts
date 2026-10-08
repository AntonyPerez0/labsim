/**
 * Firmware layouts — button centre (x, y) and size w × h in mm from the screen's top-left (Sim §2.10.2).
 * THIS is the truth that screens draw and that touches are hit-tested against (ARCHITECTURE rule 6).
 * Orca's Screen Locations are seeded from these tables (factory = no drift, Sim §2.10.1).
 *
 * Element kinds: `button` (tappable; has an Orca Screen Location), `label` (text only; rects given in the
 * doc as top-left x/y/w/h are converted to centres here), `pad` (signature pad), `qr` (receipt QR block).
 * Label ids starting with `@` are live texts resolved at runtime from the order (`@regSubtotal`, …).
 * Label rects not given by the doc are [illus.] placements (marked `/* illus *\/`).
 */
import type { LayoutId } from '../deviceTypes';

export type ElementKind = 'button' | 'label' | 'pad' | 'qr';

export interface LayoutEl {
  id: string;
  kind: ElementKind;
  /** Centre, mm. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutDef {
  id: LayoutId;
  wMm: number;
  hMm: number;
  /** Keyed by Orca screen name; `HOME_P1` = launcher page 1. */
  screens: Record<string, LayoutEl[]>;
}

/* ── helpers ── */
const B = (id: string, x: number, y: number, w: number, h: number): LayoutEl => ({ id, kind: 'button', x, y, w, h });
/** Label from a top-left rect (doc form). */
const L = (id: string, x: number, y: number, w: number, h: number): LayoutEl => ({ id, kind: 'label', x: x + w / 2, y: y + h / 2, w, h });
const PAD = (x: number, y: number, w: number, h: number): LayoutEl => ({ id: 'pad', kind: 'pad', x, y, w, h });
const QR = (x: number, y: number, w: number, h: number): LayoutEl => ({ id: 'qr', kind: 'qr', x, y, w, h });

function grid(names: (string | null)[], xs: number[], ys: number[], w: number, h: number): LayoutEl[] {
  const out: LayoutEl[] = [];
  let i = 0;
  for (const y of ys)
    for (const x of xs) {
      const n = names[i++];
      if (n) out.push(B(n, x, y, w, h));
    }
  return out;
}

const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Enter'];
function pin(xs: number[], ys: number[], w: number, h: number, cancel: LayoutEl): LayoutEl[] {
  return [...grid(PIN_KEYS, xs, ys, w, h), cancel];
}

function rows(names: string[], x: number, ys: number[], w: number, h: number): LayoutEl[] {
  return names.map((n, i) => B(n, x, ys[i]!, w, h));
}
const R4 = ['Print', 'Email', 'Text', 'No Receipt'];
const R5 = ['Print', 'Email', 'Text', 'No Receipt', 'Scan for receipt'];

/** Launcher apps on page 0 in Flex/Compact (2 columns) order. */
const FLEX_APPS = ['Orders', 'Transactions', 'Register', 'Setup', 'Sale', 'Authorizations', 'Customers', 'Inventory', 'Settings', 'App Market'];
/** Landscape (5 × 2) order. */
const LAND_APPS = ['Register', 'Orders', 'Transactions', 'Setup', 'Sale', 'Authorizations', 'Customers', 'Inventory', 'Settings', 'App Market'];
/** Page 1 of every launcher (Sim §3.8.2). */
const PAGE1 = ['Reporting', 'Employees', 'Cash Log', 'Help'];

/** Footer labels of Register (live totals) at three stacked rects. */
function regFooter(x: number, y: number, w: number, h: number, gap: number): LayoutEl[] {
  return [L('@regSubtotal', x, y, w, h), L('@regTax', x, y + gap, w, h), L('@regTotal', x, y + 2 * gap, w, h)];
}
/** Review Order totals. */
function reviewTotals(x: number, y: number, w: number, h: number, gap: number): LayoutEl[] {
  return [L('@revSubtotal', x, y, w, h), L('@revTax', x, y + gap, w, h), L('@revTotal', x, y + 2 * gap, w, h)];
}

/* ───────────── FLEX_GEN3 (FLEX_3, FLEX_4, FLEX_POCKET · portrait 76.0 × 135.0) ───────────── */
const FLEX_GEN3: LayoutDef = {
  id: 'FLEX_GEN3',
  wMm: 76.0,
  hMm: 135.0,
  screens: {
    HOME: grid(FLEX_APPS, [20.3, 55.7], [30.0, 53.6, 77.2, 100.8, 124.4], 20.3, 20.3),
    HOME_P1: grid(PAGE1, [20.3, 55.7], [30.0, 53.6], 20.3, 20.3),
    REGISTER_HOME: [
      B('Register', 13.0, 10.0, 22, 8),
      B('Tax Item 5', 20.3, 30.0, 32, 16),
      B('Non-Tax Item 1', 55.7, 30.0, 32, 16),
      B('Coffee', 20.3, 50.0, 32, 16),
      B('Catering Deposit', 55.7, 50.0, 32, 16),
      B('Clear', 20.0, 124.0, 32, 12),
      B('Review Order', 56.0, 124.0, 36, 12),
      ...regFooter(6.0, 90.0, 64.0, 6.0, 7.0) /* illus */,
    ],
    REVIEW_ORDER: [B('Back', 20.0, 124.0, 32, 12), B('Pay', 56.0, 124.0, 36, 12), ...reviewTotals(6.0, 90.0, 64.0, 6.0, 7.0) /* illus */],
    PAYMENT: [
      B('Charge', 38.0, 60.0, 68, 14),
      B('Cash', 38.0, 78.0, 68, 14),
      B('Other', 38.0, 96.0, 68, 14),
      B('Cancel', 38.0, 124.0, 68, 10),
      L('@amount', 18.0, 30.0, 40.0, 10.0) /* illus */,
    ],
    TENDER_CASH_DISCOUNT: [B('Cash', 22.0, 58.5, 26, 16), B('Card', 62.0, 58.5, 26, 16)],
    PAYMENT_PROMPT: [B('Cancel', 38.0, 124.0, 40, 10), L('Tap, insert or swipe', 6.0, 52.0, 64.0, 8.0), L('@amount', 18.0, 36.0, 40.0, 10.0)],
    PIN_ENTRY: pin([19.0, 38.0, 57.0], [62.0, 76.0, 90.0, 104.0], 17, 12, B('Cancel', 38.0, 122.0, 40, 9)),
    TIP: [
      B('15%', 20.3, 62.0, 32, 14),
      B('18%', 55.7, 62.0, 32, 14),
      B('20%', 20.3, 80.0, 32, 14),
      B('22%', 55.7, 80.0, 32, 14),
      B('No Tip', 20.3, 98.0, 32, 12),
      B('Custom', 55.7, 98.0, 32, 12),
    ],
    SIGNATURE: [PAD(38.0, 70.0, 68, 60), B('Clear', 20.0, 124.0, 32, 10), B('Done', 56.0, 124.0, 32, 10)],
    APPROVED: [L('Payment Successful', 21.96, 54.0, 32.09, 4.22)],
    RECEIPT_OPTIONS_4: rows(R4, 34.0, [71.0, 83.0, 95.0, 107.0], 60, 6),
    RECEIPT_OPTIONS_5: [QR(34.0, 61.0, 20, 20), ...rows(R5, 34.0, [74.0, 86.0, 98.0, 110.0, 122.0], 60, 6)],
    THANK_YOU: [L('Thank you', 18.0, 60.0, 40.0, 8.0) /* illus */],
  },
};

/* ───────────── FLEX_GEN2 (FLEX_2 · portrait 68.0 × 121.0) ───────────── */
const FLEX_GEN2: LayoutDef = {
  id: 'FLEX_GEN2',
  wMm: 68.0,
  hMm: 121.0,
  screens: {
    HOME: grid(FLEX_APPS, [18.0, 50.0], [24.0, 45.0, 66.0, 87.0, 108.0], 18, 18),
    HOME_P1: grid(PAGE1, [18.0, 50.0], [24.0, 45.0], 18, 18),
    REGISTER_HOME: [
      B('Register', 14.0, 8.0, 22, 7),
      B('Tax Item 5', 18.0, 26.0, 30, 15),
      B('Non-Tax Item 1', 50.0, 26.0, 30, 15),
      B('Coffee', 18.0, 44.0, 30, 15),
      B('Catering Deposit', 50.0, 44.0, 30, 15),
      B('Clear', 18.0, 112.0, 28, 10),
      B('Review Order', 50.0, 112.0, 32, 10),
      ...regFooter(5.0, 80.0, 58.0, 5.5, 6.5) /* illus */,
    ],
    REVIEW_ORDER: [B('Back', 18.0, 112.0, 28, 10), B('Pay', 50.0, 112.0, 32, 10), ...reviewTotals(5.0, 80.0, 58.0, 5.5, 6.5) /* illus */],
    PAYMENT: [
      B('Charge', 34.0, 54.0, 60, 12),
      B('Cash', 34.0, 70.0, 60, 12),
      B('Other', 34.0, 86.0, 60, 12),
      B('Cancel', 34.0, 110.0, 40, 8),
      L('@amount', 14.0, 30.0, 40.0, 9.0) /* illus */,
    ],
    TENDER_CASH_DISCOUNT: [B('Cash', 18.0, 54.0, 28, 15), B('Card', 50.0, 54.0, 28, 15)],
    PAYMENT_PROMPT: [B('Cancel', 34.0, 112.0, 36, 8), L('Tap, insert or swipe', 4.0, 46.0, 60.0, 7.0), L('@amount', 14.0, 32.0, 40.0, 9.0) /* illus */],
    PIN_ENTRY: pin([17.0, 34.0, 51.0], [54.0, 67.0, 80.0, 93.0], 15, 11, B('Cancel', 34.0, 110.0, 36, 8)),
    TIP: [
      B('15%', 18.0, 54.0, 28, 13),
      B('18%', 50.0, 54.0, 28, 13),
      B('20%', 18.0, 70.0, 28, 13),
      B('22%', 50.0, 70.0, 28, 13),
      B('No Tip', 18.0, 86.0, 28, 11),
      B('Custom', 50.0, 86.0, 28, 11),
    ],
    SIGNATURE: [PAD(34.0, 58.0, 62, 54), B('Clear', 18.0, 112.0, 28, 8), B('Done', 50.0, 112.0, 28, 8)],
    APPROVED: [L('Payment Successful', 18.0, 48.0, 32.0, 4.0) /* illus */],
    RECEIPT_OPTIONS_4: rows(R4, 34.0, [70.0, 80.0, 90.0, 100.0], 56, 6),
    RECEIPT_OPTIONS_5: [QR(34.0, 60.0, 18, 20), ...rows(R5, 34.0, [73.0, 83.0, 93.0, 103.0, 113.0], 56, 6)],
    THANK_YOU: [L('Thank you', 14.0, 54.0, 40.0, 8.0) /* illus */],
  },
};

/* ───────────── FLEX_GEN1 (FLEX_1 · portrait 62.3 × 110.7) ───────────── */
const FLEX_GEN1: LayoutDef = {
  id: 'FLEX_GEN1',
  wMm: 62.3,
  hMm: 110.7,
  screens: {
    HOME: grid(FLEX_APPS, [16.6, 45.7], [22.0, 42.0, 62.0, 82.0, 102.0], 16, 16),
    HOME_P1: grid(PAGE1, [16.6, 45.7], [22.0, 42.0], 16, 16),
    REGISTER_HOME: [
      B('Register', 13.0, 8.0, 22, 7),
      B('Tax Item 5', 16.6, 24.0, 28, 14),
      B('Non-Tax Item 1', 45.7, 24.0, 28, 14),
      B('Coffee', 16.6, 41.0, 28, 14),
      B('Catering Deposit', 45.7, 41.0, 28, 14),
      B('Clear', 16.0, 102.0, 26, 9),
      B('Review Order', 45.0, 102.0, 30, 9),
      ...regFooter(4.0, 72.0, 54.0, 5.0, 6.0) /* illus */,
    ],
    REVIEW_ORDER: [B('Back', 16.0, 102.0, 26, 9), B('Pay', 45.0, 102.0, 30, 9), ...reviewTotals(4.0, 72.0, 54.0, 5.0, 6.0) /* illus */],
    PAYMENT: [
      B('Charge', 31.2, 48.0, 54, 11),
      B('Cash', 31.2, 63.0, 54, 11),
      B('Other', 31.2, 78.0, 54, 11),
      B('Cancel', 31.2, 100.0, 40, 8),
      L('@amount', 11.2, 26.0, 40.0, 9.0) /* illus */,
    ],
    TENDER_CASH_DISCOUNT: [B('Cash', 16.6, 48.0, 26, 15), B('Card', 45.7, 48.0, 26, 15)],
    PAYMENT_PROMPT: [B('Cancel', 31.2, 102.0, 36, 8), L('Tap, insert or swipe', 3.0, 42.0, 56.0, 7.0), L('@amount', 11.2, 28.0, 40.0, 9.0) /* illus */],
    PIN_ENTRY: pin([15.6, 31.2, 46.8], [48.0, 61.0, 74.0, 87.0], 14, 11, B('Cancel', 31.2, 102.0, 34, 7)),
    TIP: [
      B('15%', 16.6, 48.0, 26, 12),
      B('18%', 45.7, 48.0, 26, 12),
      B('20%', 16.6, 63.0, 26, 12),
      B('22%', 45.7, 63.0, 26, 12),
      B('No Tip', 16.6, 78.0, 26, 11),
      B('Custom', 45.7, 78.0, 26, 11),
    ],
    SIGNATURE: [PAD(31.2, 52.0, 56, 46), B('Clear', 16.0, 102.0, 26, 8), B('Done', 46.0, 102.0, 26, 8)],
    APPROVED: [L('Payment Successful', 15.2, 44.0, 32.0, 4.0) /* illus */],
    RECEIPT_OPTIONS_4: rows(R4, 31.2, [66.5, 75.5, 84.5, 93.5], 52, 7),
    RECEIPT_OPTIONS_5: [QR(31.2, 57.0, 16, 18), ...rows(R5, 31.2, [69.5, 78.5, 87.5, 96.5, 105.5], 52, 7)],
    THANK_YOU: [L('Thank you', 11.2, 50.0, 40.0, 8.0) /* illus */],
  },
};

/* ───────────── COMPACT (portrait 62.3 × 110.7) ───────────── */
const COMPACT: LayoutDef = {
  id: 'COMPACT',
  wMm: 62.3,
  hMm: 110.7,
  screens: {
    HOME: grid(['Orders', 'Transactions', 'Register', 'Setup', 'Sale', 'Customers', 'Settings', 'Authorizations'], [16.6, 45.7], [24.0, 44.0, 64.0, 84.0], 18, 18),
    HOME_P1: grid(PAGE1, [16.6, 45.7], [24.0, 44.0], 18, 18),
    REGISTER_HOME: [
      B('Register', 13.0, 8.0, 22, 7),
      B('Tax Item 5', 16.6, 24.0, 28, 14),
      B('Non-Tax Item 1', 45.7, 24.0, 28, 14),
      B('Coffee', 16.6, 41.0, 28, 14),
      B('Catering Deposit', 45.7, 41.0, 28, 14),
      B('Clear', 16.0, 102.0, 26, 10),
      B('Review Order', 45.0, 102.0, 30, 10),
      ...regFooter(4.0, 72.0, 54.0, 5.0, 6.0) /* illus */,
    ],
    REVIEW_ORDER: [B('Back', 16.0, 102.0, 26, 10), B('Pay', 45.0, 102.0, 30, 10), ...reviewTotals(4.0, 72.0, 54.0, 5.0, 6.0) /* illus */],
    PAYMENT: [
      B('Charge', 31.2, 50.0, 54, 12),
      B('Cash', 31.2, 66.0, 54, 12),
      B('Other', 31.2, 82.0, 54, 12),
      B('Cancel', 31.2, 102.0, 40, 8),
      L('@amount', 11.2, 28.0, 40.0, 9.0) /* illus */,
    ],
    TENDER_CASH_DISCOUNT: [B('Cash', 16.6, 50.0, 26, 16), B('Card', 45.7, 50.0, 26, 16)],
    PAYMENT_PROMPT: [B('Cancel', 31.2, 102.0, 36, 8), L('Tap, insert or swipe', 3.0, 44.0, 56.0, 7.0), L('@amount', 11.2, 30.0, 40.0, 9.0) /* illus */],
    PIN_ENTRY: pin([15.6, 31.2, 46.8], [50.0, 63.0, 76.0, 89.0], 14, 11, B('Cancel', 31.2, 103.0, 34, 7)),
    TIP: [
      B('15%', 16.6, 50.0, 26, 13),
      B('18%', 45.7, 50.0, 26, 13),
      B('20%', 16.6, 66.0, 26, 13),
      B('22%', 45.7, 66.0, 26, 13),
      B('No Tip', 16.6, 82.0, 26, 11),
      B('Custom', 45.7, 82.0, 26, 11),
    ],
    SIGNATURE: [PAD(31.2, 55.0, 56, 50), B('Clear', 16.0, 102.0, 26, 8), B('Done', 46.0, 102.0, 26, 8)],
    APPROVED: [L('Payment Successful', 15.2, 46.0, 32.0, 4.0) /* illus */],
    RECEIPT_OPTIONS_4: rows(R4, 31.2, [60.0, 70.0, 80.0, 90.0], 52, 6),
    RECEIPT_OPTIONS_5: [QR(31.2, 51.0, 16, 16), ...rows(R5, 31.2, [63.0, 73.0, 83.0, 93.0, 103.0], 52, 6)],
    THANK_YOU: [L('Thank you', 11.2, 50.0, 40.0, 8.0) /* illus */],
  },
};

/* ───────────── MINI_GEN3 (MINI_3, MINI_4 · landscape 172.3 × 107.7; also the Duo CFD) ───────────── */
const CART_V1 = [L('@cartSubtotal', 28.38, 14.0, 59.79, 8.0), L('@cartTax', 28.38, 23.0, 59.79, 8.0), L('@cartTotal', 28.38, 32.43, 59.79, 11.15)];
const MINI_GEN3: LayoutDef = {
  id: 'MINI_GEN3',
  wMm: 172.3,
  hMm: 107.7,
  screens: {
    HOME: grid(LAND_APPS, [22.0, 54.0, 86.0, 118.0, 150.0], [38.0, 72.0], 24, 24),
    HOME_P1: grid(PAGE1, [22.0, 54.0, 86.0, 118.0, 150.0], [38.0, 72.0], 24, 24),
    REGISTER_HOME: [
      B('Register', 14.0, 8.0, 22, 8),
      B('Tax Item 5', 22.0, 30.0, 34, 18),
      B('Non-Tax Item 1', 60.0, 30.0, 34, 18),
      B('Coffee', 22.0, 52.0, 34, 18),
      B('Catering Deposit', 60.0, 52.0, 34, 18),
      B('Clear', 100.0, 96.0, 20, 16),
      B('Review Order', 140.0, 96.0, 56, 16),
      ...regFooter(100.0, 22.0, 66.0, 7.0, 9.0) /* illus */,
    ],
    REVIEW_ORDER: [B('Back', 100.0, 96.0, 20, 16), B('Pay', 140.0, 96.0, 56, 16), ...reviewTotals(100.0, 22.0, 66.0, 7.0, 9.0) /* illus */],
    PAYMENT: [
      B('Cash', 31.0, 53.0, 50, 12),
      B('Other', 31.0, 71.0, 50, 12),
      B('Charge', 31.0, 89.0, 50, 12),
      B('Cancel', 150.0, 96.0, 36, 12),
      L('@amount', 66.0, 20.0, 60.0, 12.0) /* illus */,
    ],
    TENDER_CASH_DISCOUNT: [B('Cash', 56.0, 58.0, 60, 20), B('Card', 116.0, 58.0, 60, 20)],
    PAYMENT_PROMPT: [B('Cancel', 86.0, 98.0, 40, 10), L('Tap, insert or swipe', 46.0, 44.0, 80.0, 9.0), L('@amount', 56.0, 26.0, 60.0, 12.0) /* illus */],
    PIN_ENTRY: pin([66.0, 86.0, 106.0], [34.0, 50.0, 66.0, 82.0], 18, 14, B('Cancel', 150.0, 98.0, 30, 10)),
    TIP: [
      B('15%', 40.0, 50.0, 28, 18),
      B('18%', 72.0, 50.0, 28, 18),
      B('20%', 104.0, 50.0, 28, 18),
      B('22%', 136.0, 50.0, 28, 18),
      B('No Tip', 56.0, 80.0, 40, 12),
      B('Custom', 120.0, 80.0, 40, 12),
    ],
    SIGNATURE: [PAD(86.0, 48.0, 150, 60), B('Clear', 40.0, 96.0, 40, 10), B('Done', 132.0, 96.0, 40, 10)],
    APPROVED: [L('Payment Successful', 56.0, 48.0, 60.0, 9.0) /* illus */],
    RECEIPT_OPTIONS_4: rows(R4, 86.0, [40.0, 52.0, 64.0, 76.0], 80, 6),
    RECEIPT_OPTIONS_5: [QR(86.0, 31.0, 18, 18), ...rows(R5, 86.0, [43.0, 55.0, 67.0, 79.0, 91.0], 80, 6)],
    CUSTOMER_CART: CART_V1,
    CFD_RECEIPT_DONE: [L('Your receipt is on its way', 36.0, 40.0, 100.0, 10.0) /* illus */, B('Done', 86.0, 90.0, 50, 12)],
    CFD_THANK_YOU: [L('Thank you', 54.22, 44.59, 63.85, 12.16)],
    THANK_YOU: [L('Thank you', 54.22, 44.59, 63.85, 12.16)],
  },
};

/* ───────────── MINI_GEN2 (MINI_2 · landscape 154.2 × 90.4) ───────────── */
const MINI_GEN2: LayoutDef = {
  id: 'MINI_GEN2',
  wMm: 154.2,
  hMm: 90.4,
  screens: {
    HOME: grid(LAND_APPS, [20.0, 48.5, 77.0, 105.5, 134.0], [32.0, 61.0], 22, 22),
    HOME_P1: grid(PAGE1, [20.0, 48.5, 77.0, 105.5, 134.0], [32.0, 61.0], 22, 22),
    REGISTER_HOME: [
      B('Register', 12.5, 7.0, 20, 7),
      B('Tax Item 5', 20.0, 25.0, 30, 15),
      B('Non-Tax Item 1', 54.0, 25.0, 30, 15),
      B('Coffee', 20.0, 44.0, 30, 15),
      B('Catering Deposit', 54.0, 44.0, 30, 15),
      B('Clear', 89.5, 81.0, 18, 13),
      B('Review Order', 125.0, 81.0, 50, 13),
      ...regFooter(90.0, 18.0, 58.0, 6.0, 8.0) /* illus */,
    ],
    REVIEW_ORDER: [B('Back', 89.5, 81.0, 18, 13), B('Pay', 125.0, 81.0, 50, 13), ...reviewTotals(90.0, 18.0, 58.0, 6.0, 8.0) /* illus */],
    PAYMENT: [
      B('Cash', 28.0, 44.5, 44, 10),
      B('Other', 28.0, 59.5, 44, 10),
      B('Charge', 28.0, 74.5, 44, 10),
      B('Cancel', 134.0, 81.0, 32, 10),
      L('@amount', 57.0, 16.0, 54.0, 10.0) /* illus */,
    ],
    TENDER_CASH_DISCOUNT: [B('Cash', 50.0, 48.5, 54, 17), B('Card', 104.0, 48.5, 54, 17)],
    PAYMENT_PROMPT: [B('Cancel', 77.0, 82.0, 36, 9), L('Tap, insert or swipe', 41.0, 38.0, 72.0, 8.0), L('@amount', 50.0, 22.0, 54.0, 10.0) /* illus */],
    PIN_ENTRY: pin([59.0, 77.0, 95.0], [28.5, 42.0, 55.5, 69.0], 16, 12, B('Cancel', 134.0, 82.0, 28, 9)),
    TIP: [
      B('15%', 36.0, 42.0, 25, 15),
      B('18%', 64.5, 42.0, 25, 15),
      B('20%', 93.0, 42.0, 25, 15),
      B('22%', 121.5, 42.0, 25, 15),
      B('No Tip', 50.0, 67.0, 36, 10),
      B('Custom', 107.0, 67.0, 36, 10),
    ],
    SIGNATURE: [PAD(77.0, 40.0, 134, 50), B('Clear', 36.0, 81.0, 36, 9), B('Done', 118.0, 81.0, 36, 9)],
    APPROVED: [L('Payment Successful', 47.0, 40.0, 60.0, 8.0) /* illus */],
    RECEIPT_OPTIONS_4: rows(R4, 77.0, [33.0, 43.0, 53.0, 63.0], 70, 6),
    RECEIPT_OPTIONS_5: [QR(77.0, 26.0, 14, 14), ...rows(R5, 77.0, [36.0, 46.0, 56.0, 66.0, 76.0], 70, 6)],
    CUSTOMER_CART: [L('@cartSubtotal', 25.0, 25.0, 54.0, 7.0), L('@cartTax', 25.0, 33.0, 54.0, 7.0), L('@cartTotal', 25.0, 42.0, 54.0, 10.0)],
    THANK_YOU: [L('Thank you', 47.0, 38.0, 60.0, 10.0) /* illus */],
  },
};

/* ───────────── STATION (STATION_2018, STATION_2 and every Duo MFD · landscape 309.9 × 174.3) ───────────── */
const STATION: LayoutDef = {
  id: 'STATION',
  wMm: 309.9,
  hMm: 174.3,
  screens: {
    HOME: grid(LAND_APPS, [40.0, 90.0, 140.0, 190.0, 240.0], [50.0, 100.0], 36, 36),
    HOME_P1: grid(PAGE1, [40.0, 90.0, 140.0, 190.0, 240.0], [50.0, 100.0], 36, 36),
    REGISTER_HOME: [
      B('Register', 22.0, 10.0, 36, 10),
      B('Tax Item 5', 35.0, 40.0, 50, 24),
      B('Non-Tax Item 1', 90.0, 40.0, 50, 24),
      B('Coffee', 35.0, 70.0, 50, 24),
      B('Catering Deposit', 90.0, 70.0, 50, 24),
      B('Clear', 190.0, 158.0, 50, 16),
      B('Review Order', 262.0, 158.0, 80, 16),
      ...regFooter(170.0, 40.0, 120.0, 10.0, 14.0) /* illus */,
    ],
    REVIEW_ORDER: [B('Back', 190.0, 158.0, 50, 16), B('Pay', 262.0, 158.0, 80, 16), ...reviewTotals(170.0, 40.0, 120.0, 10.0, 14.0) /* illus */],
    PAYMENT: [
      B('Cash', 60.0, 80.0, 90, 18),
      B('Other', 60.0, 110.0, 90, 18),
      B('Charge', 60.0, 140.0, 90, 18),
      B('Cancel', 270.0, 160.0, 60, 12),
      L('@amount', 125.0, 30.0, 100.0, 16.0) /* illus */,
    ],
    TENDER_CASH_DISCOUNT: [B('Cash', 105.0, 90.0, 100, 30), B('Card', 205.0, 90.0, 100, 30)],
    PAYMENT_PROMPT: [B('Cancel', 155.0, 158.0, 60, 12), L('Tap, insert or swipe', 95.0, 70.0, 120.0, 14.0), L('@amount', 105.0, 40.0, 100.0, 16.0) /* illus */],
    PIN_ENTRY: pin([125.0, 155.0, 185.0], [50.0, 75.0, 100.0, 125.0], 26, 20, B('Cancel', 270.0, 160.0, 50, 12)),
    TIP: [
      B('15%', 80.0, 80.0, 44, 26),
      B('18%', 130.0, 80.0, 44, 26),
      B('20%', 180.0, 80.0, 44, 26),
      B('22%', 230.0, 80.0, 44, 26),
      B('No Tip', 110.0, 125.0, 60, 16),
      B('Custom', 200.0, 125.0, 60, 16),
    ],
    SIGNATURE: [PAD(155.0, 80.0, 260, 100), B('Clear', 80.0, 158.0, 60, 12), B('Done', 230.0, 158.0, 60, 12)],
    APPROVED: [L('Payment Successful', 105.0, 80.0, 100.0, 14.0) /* illus */],
    RECEIPT_OPTIONS_4: rows(R4, 155.0, [60.0, 80.0, 100.0, 120.0], 120, 8),
    RECEIPT_OPTIONS_5: [QR(155.0, 47.0, 22, 22), ...rows(R5, 155.0, [63.0, 83.0, 103.0, 123.0, 143.0], 120, 8)],
    THANK_YOU: [L('Thank you', 105.0, 78.0, 100.0, 16.0) /* illus */],
  },
};

export const LAYOUTS: Record<LayoutId, LayoutDef> = { FLEX_GEN3, FLEX_GEN2, FLEX_GEN1, COMPACT, MINI_GEN3, MINI_GEN2, STATION };

/** Probe acceptance half-width (Sim §3.5.4): clamp(0.10 × min(w, h), 1.0, 2.5) mm. */
export function coreMm(el: { w: number; h: number }): number {
  return Math.min(2.5, Math.max(1.0, Math.round(0.1 * Math.min(el.w, el.h) * 1000) / 1000));
}

/**
 * Orca screens seeded per Device Type, in §2.10.1 table order (ids are assigned enum order × table order).
 * Generic rows exist for every lab type; CUSTOMER_CART for MINI_2/MINI_3; CFD_* for STATION_DUO / DUO_2.
 */
export const GENERIC_ORCA_SCREENS = [
  'HOME',
  'REGISTER_HOME',
  'REVIEW_ORDER',
  'PAYMENT',
  'TENDER_CASH_DISCOUNT',
  'PAYMENT_PROMPT',
  'PIN_ENTRY',
  'TIP',
  'SIGNATURE',
  'APPROVED',
  'RECEIPT_OPTIONS_4',
  'RECEIPT_OPTIONS_5',
] as const;

/** CFD rows on a Duo: Orca name → MINI_GEN3 table used. */
export const CFD_ORCA_SCREENS: Record<string, string> = {
  CFD_CART: 'CUSTOMER_CART',
  CFD_TENDER_CASH_DISCOUNT: 'TENDER_CASH_DISCOUNT',
  CFD_PAYMENT_PROMPT: 'PAYMENT_PROMPT',
  CFD_PIN_ENTRY: 'PIN_ENTRY',
  CFD_TIP: 'TIP',
  CFD_SIGNATURE: 'SIGNATURE',
  CFD_RECEIPT_OPTIONS_4: 'RECEIPT_OPTIONS_4',
  CFD_RECEIPT_OPTIONS_5: 'RECEIPT_OPTIONS_5',
  CFD_RECEIPT_DONE: 'CFD_RECEIPT_DONE',
  CFD_THANK_YOU: 'CFD_THANK_YOU',
};

/** Orca screen descriptions (Screens entity, Sim §2.10.1). */
export const ORCA_SCREEN_DESCRIPTIONS: Record<string, string> = {
  HOME: 'Launcher (page 0)',
  REGISTER_HOME: 'Register app: items, Clear, Review Order',
  REVIEW_ORDER: 'Review Order: Back, Pay',
  PAYMENT: 'Tender selection: Charge, Cash, Other, Cancel',
  TENDER_CASH_DISCOUNT: 'Cash-discount tender selection prompt (customer-facing)',
  PAYMENT_PROMPT: 'Tap, insert or swipe (customer-facing)',
  PIN_ENTRY: 'Secure Touch PIN pad (customer-facing)',
  TIP: 'Tip selection (customer-facing)',
  SIGNATURE: 'Signature pad (customer-facing)',
  APPROVED: 'Payment Successful (no buttons)',
  RECEIPT_OPTIONS_4: 'Receipt options — 4 options',
  RECEIPT_OPTIONS_5: 'Receipt options — 5 options (Scan for receipt QR)',
  CUSTOMER_CART: 'Tethered CFD order totals (labels only)',
  CFD_CART: 'Station Duo CFD order totals (labels only)',
  CFD_TENDER_CASH_DISCOUNT: 'Station Duo CFD cash-discount prompt',
  CFD_PAYMENT_PROMPT: 'Station Duo CFD payment prompt',
  CFD_PIN_ENTRY: 'Station Duo CFD PIN pad',
  CFD_TIP: 'Station Duo CFD tip selection',
  CFD_SIGNATURE: 'Station Duo CFD signature pad',
  CFD_RECEIPT_OPTIONS_4: 'Station Duo CFD receipt options — 4 options',
  CFD_RECEIPT_OPTIONS_5: 'Station Duo CFD receipt options — 5 options',
  CFD_RECEIPT_DONE: 'Station Duo CFD "Your receipt is on its way" + Done',
  CFD_THANK_YOU: 'Station Duo CFD Thank you',
};
