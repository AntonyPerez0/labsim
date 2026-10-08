/**
 * Device "firmware" button layouts — what the screens draw and what touches hit (ARCHITECTURE
 * "layout truth"). Every rect is in millimetres from the screen's top-left (0,0), x → right,
 * y → down (the gantry / xy_touch frame).
 *
 * Source of truth, in priority order:
 *   1. a firmware layout provider from the sim (`registerFirmwareLayoutProvider`, or auto-detected
 *      from `src/sim/devices/layouts.ts` / `src/sim/seed/layouts/index.ts` when the sim lands) —
 *      the rects the sim hit-tests against;
 *   2. the exact World §4.3 (class P) / §4.4 (class L8) tables below, with P-s and L14 derived by
 *      the §4.2 scale factors (receipt pills keep 5.0 mm height, the QR shift stays 3.0 mm).
 * Screens draw their buttons from whichever list is effective, so drawn = hit.
 */
import { LAYOUT_CLASS_SIZE_MM, LAYOUT_DERIVATION, type LayoutClass } from '../api';
import { screenOf } from '@/sim/seed/deviceTypes';
import type { DeviceTypeCode } from '@/sim/types';

export type BtnKind =
  | 'primary'
  | 'secondary'
  | 'text'
  | 'tile'
  | 'app'
  | 'pin'
  | 'pad-key'
  | 'fn-cancel'
  | 'fn-clear'
  | 'fn-ok'
  | 'pill'
  | 'row'
  | 'nav'
  | 'field'
  | 'area'
  | 'unlock'
  | 'table'
  | 'dialog-ok'
  | 'outline'
  | 'lang'
  | 'cash'
  | 'tip'
  | 'list-row'
  /** Receipt QR block (sim element kind `qr`); not a touch target. */
  | 'qr'
  /** A tappable screen title (e.g. Register's header): the header text is the visual. */
  | 'header';

export interface Btn {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly kind: BtnKind;
}

/** What a layout is asked for. */
export interface LayoutQuery {
  readonly type: DeviceTypeCode;
  readonly display: 'primary' | 'secondary';
  readonly cls: LayoutClass;
  readonly screen: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
  readonly receiptOptions: 4 | 5;
  /** Installed launcher apps (Dining only if installed). */
  readonly apps: readonly string[];
  /** Launcher scroll rows (P) / page (L). */
  readonly scroll: number;
  /** Order numbers for app-orders / app-transactions rows. */
  readonly listRows?: readonly string[];
}

/** A sim-supplied button: rect in mm (top-left + size) or centre + size. */
export interface ProviderButton {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when (x, y) is the centre rather than the top-left. */
  centred?: boolean;
  /** Sim element kind (`button` | `pad` | `qr`). */
  kind?: string;
}

export type FirmwareLayoutProvider = (q: LayoutQuery) => readonly ProviderButton[] | null | undefined;

let provider: FirmwareLayoutProvider | null = null;

/** The sim (or the integrator) registers its firmware tables here; null restores World §4. */
export function registerFirmwareLayoutProvider(p: FirmwareLayoutProvider | null): void {
  provider = p;
}

export function hasFirmwareLayoutProvider(): boolean {
  return provider !== null;
}

/* ───────────────────────────── auto-detection of the sim's layouts module ───────────────────────────── */

const SIM_LAYOUT_MODULES = import.meta.glob(['/src/sim/devices/layouts.ts', '/src/sim/seed/layouts/index.ts'], { eager: true }) as Record<string, Record<string, unknown>>;

(function autoDetect(): void {
  for (const mod of Object.values(SIM_LAYOUT_MODULES)) {
    for (const name of ['firmwareButtons', 'firmwareLayoutButtons', 'layoutButtons', 'getFirmwareButtons', 'buttonsFor']) {
      const fn = mod[name];
      if (typeof fn === 'function') {
        provider = (q) => {
          try {
            const out = (fn as (...a: unknown[]) => unknown)(q.type, q.screen, q.display, q.params, q.receiptOptions);
            return Array.isArray(out) ? (out as ProviderButton[]) : null;
          } catch {
            return null;
          }
        };
        return;
      }
    }
  }
})();

/* ───────────────────────────── helpers ───────────────────────────── */

const b = (id: string, x: number, y: number, w: number, h: number, kind: BtnKind): Btn => ({ id, x, y, w, h, kind });
const bc = (id: string, cx: number, cy: number, w: number, h: number, kind: BtnKind): Btn => b(id, cx - w / 2, cy - h / 2, w, h, kind);

/** Launcher order (World §4.3 home): `Setup` lands on row 6 so it needs a scroll on P. */
export const LAUNCHER_ORDER = [
  'Register',
  'Orders',
  'Transactions',
  'Sale',
  'Authorizations',
  'Customers',
  'Items',
  'Reports',
  'Employees',
  'Inventory',
  'Rewards',
  'Gift Cards',
  'Help',
  'App Market',
  'Settings',
  'Setup',
  'Dining',
] as const;

export function launcherApps(apps: readonly string[]): string[] {
  const installedDining = apps.some((a) => /dining/i.test(a));
  return LAUNCHER_ORDER.filter((a) => a !== 'Dining' || installedDining);
}

export const MERCHANT_SCREENS: ReadonlySet<string> = new Set([
  'home',
  'register',
  'review-order',
  'tender-select',
  'cash-discount-tender',
  'app-orders',
  'app-transactions',
  'app-setup',
  'app-dining',
]);

/* ───────────────────────────── Class P (68.0 × 136.0) — World §4.3 ───────────────────────────── */

const P_PRIMARY = (id: string) => b(id, 4, 113, 60, 14, 'primary');

function pinGridP(kind: BtnKind, zeroMiddle: boolean): Btn[] {
  const out: Btn[] = [];
  const cols = [5, 25, 45];
  const rows = [36, 53, 70];
  let n = 1;
  for (const y of rows) for (const x of cols) out.push(b(String(n++), x, y, 18, 14, kind));
  out.push(b('0', zeroMiddle ? 25 : 45, 87, 18, 14, kind));
  return out;
}

function pLayout(q: LayoutQuery): Btn[] {
  const s = q.screen;
  const p = q.params;
  switch (s) {
    case 'lock':
      if (p.pad) return [...pinGridP('pad-key', true), b('⌫', 45, 87, 18, 14, 'pad-key')];
      return [b('unlock', 24, 110, 20, 14, 'unlock')];
    case 'home': {
      const apps = launcherApps(q.apps);
      const out: Btn[] = [];
      const xs = [6, 27, 48];
      apps.forEach((app, i) => {
        const row = Math.floor(i / 3) - q.scroll;
        const y0 = 18 + 22 * row;
        if (y0 < 18 || y0 >= 114) return; // clipped by the scroll window (y 14 … 130)
        const x0 = xs[i % 3]!;
        out.push(b(app, x0 - 2, y0 - 2, 18, 22, 'app'));
      });
      return out;
    }
    case 'register':
      return [
        b('Tax Item 5', 4, 21, 29, 13, 'tile'),
        b('Coffee', 35, 21, 29, 13, 'tile'),
        b('Bagel', 4, 36, 29, 13, 'tile'),
        b('No-Tax Item', 35, 36, 29, 13, 'tile'),
        b('Gift Card', 4, 51, 29, 13, 'tile'),
        b('Custom Amount', 35, 51, 29, 13, 'tile'),
        P_PRIMARY('Review Order'),
      ];
    case 'review-order':
      return [b('Add discount', 4, 70, 30, 6, 'text'), P_PRIMARY('Pay')];
    case 'tender-select':
      return [b('Card', 4, 44, 60, 10, 'row'), b('Cash', 4, 56, 60, 10, 'row'), b('Other tender', 4, 68, 60, 10, 'row'), P_PRIMARY('Charge')];
    case 'cash-discount-tender':
      return [b('Cash', 4, 48, 36, 21, 'cash'), b('Card', 43, 48, 23, 21, 'secondary')];
    case 'payment-prompt':
      return [b('Cancel', 20, 124, 28, 9, 'text')];
    case 'pin-entry':
      return [...pinGridP('pin', false), b('Cancel', 5, 104, 18, 14, 'fn-cancel'), b('Clear', 25, 104, 18, 14, 'fn-clear'), b('OK', 45, 104, 18, 14, 'fn-ok')];
    case 'tip':
      return [
        b('15%', 4, 26, 29, 20, 'tip'),
        b('18%', 35, 26, 29, 20, 'tip'),
        b('20%', 4, 49, 29, 20, 'tip'),
        b('Custom', 35, 49, 29, 20, 'tip'),
        b('No Tip', 4, 75, 60, 12, 'secondary'),
      ];
    case 'signature':
      return [b('signature.area', 4, 12, 60, 86, 'area'), b('Clear', 4, 104, 29, 14, 'secondary'), b('Done', 35, 104, 29, 14, 'primary')];
    case 'declined':
      return [b('Try again', 4, 113, 60, 14, 'outline')];
    case 'receipt-options': {
      if (p.qr) return [P_PRIMARY('Done')];
      const dy = q.receiptOptions === 5 ? 3 : 0;
      const out = [
        b('Print', 8, 68.5 + dy, 52, 5, 'pill'),
        b('Email', 8, 80.5 + dy, 52, 5, 'pill'),
        b('Text', 8, 92.5 + dy, 52, 5, 'pill'),
        b('No Receipt', 8, 104.5 + dy, 52, 5, 'pill'),
      ];
      if (q.receiptOptions === 5) out.push(b('Scan for receipt', 8, 119.5, 52, 5, 'pill'));
      return out;
    }
    case 'oobe-welcome':
      return [b('Language', 19, 90, 30, 7, 'lang'), P_PRIMARY('Get started')];
    case 'oobe-network':
      return [b('Ethernet', 4, 18, 60, 10, 'row'), b('LAB-AUTOMATION', 4, 29, 60, 10, 'row'), b('GUEST', 4, 40, 60, 10, 'row'), P_PRIMARY('Next')];
    case 'oobe-merchant':
      return [b('Merchant ID', 4, 22, 60, 9, 'field'), b('Activation code', 4, 36, 60, 9, 'field'), P_PRIMARY('Activate')];
    case 'oobe-employee': {
      const out: Btn[] = [];
      const cx = [14, 34, 54];
      const cy = [37, 54, 71];
      let n = 1;
      for (const y of cy) for (const x of cx) out.push(bc(String(n++), x, y, 18, 14, 'pin'));
      out.push(bc('0', 34, 88, 18, 14, 'pin'), bc('⌫', 54, 88, 18, 14, 'pin'), P_PRIMARY('Continue'));
      return out;
    }
    case 'oobe-complete':
      return [P_PRIMARY('Done')];
    case 'app-orders':
    case 'app-transactions':
      return (q.listRows ?? []).slice(0, 11).map((id, k) => b(id, 0, 13 + 10 * k, 68, 10, 'list-row'));
    case 'app-setup':
      return ['Merchant', 'Network', 'Devices', 'About'].map((id, k) => b(id, 0, 13 + 10 * k, 68, 10, 'list-row'));
    case 'app-dining': {
      const out: Btn[] = [];
      let n = 1;
      for (const cy of [26, 48, 70]) for (const cx of [14, 34, 54]) out.push(bc(`T${n++}`, cx, cy, 18, 18, 'table'));
      return out;
    }
    case 'error':
      return [b('OK', 44, 74, 14, 7, 'dialog-ok')];
    default:
      return [];
  }
}

function pNav(): Btn[] {
  return [b('nav.back', 9, 130, 16, 6, 'nav'), b('nav.home', 26, 130, 16, 6, 'nav'), b('nav.recents', 43, 130, 16, 6, 'nav')];
}

/* ───────────────────────────── Class L8 (172.3 × 107.7) — World §4.4 ───────────────────────────── */

const L8_PRIMARY = (id: string) => b(id, 114, 87, 54, 12, 'primary');
const L8_OOBE_PRIMARY = (id: string) => b(id, 112, 88, 56, 12, 'primary');

function pinGridL8(kind: BtnKind, bottom: 'pin' | 'pad'): Btn[] {
  const out: Btn[] = [];
  const x0 = [86, 111, 136];
  const y0 = [6, 25, 44];
  let n = 1;
  for (const y of y0) for (const x of x0) out.push(b(String(n++), x, y, 23, 17, kind));
  if (bottom === 'pin') out.push(b('0', 136, 63, 23, 17, kind));
  else out.push(b('0', 111, 63, 23, 17, kind), b('⌫', 136, 63, 23, 17, kind));
  return out;
}

function l8Layout(q: LayoutQuery): Btn[] {
  const s = q.screen;
  const p = q.params;
  switch (s) {
    case 'lock':
      if (p.pad) return pinGridL8('pad-key', 'pad');
      return [b('unlock', 76, 84, 20, 16, 'unlock')];
    case 'home': {
      const apps = launcherApps(q.apps);
      const page = Math.max(0, Math.min(Math.ceil(apps.length / 10) - 1, q.scroll));
      const out: Btn[] = [];
      const cols = [22, 54, 86, 118, 150];
      const rows = [32, 68];
      apps.slice(page * 10, page * 10 + 10).forEach((app, i) => {
        const cx = cols[i % 5]!;
        const cy = rows[Math.floor(i / 5)]!;
        out.push(b(app, cx - 12, cy - 11, 24, 28, 'app'));
      });
      return out;
    }
    case 'register':
      return [
        b('Tax Item 5', 4, 16, 32, 24, 'tile'),
        b('Coffee', 39, 16, 32, 24, 'tile'),
        b('Bagel', 74, 16, 32, 24, 'tile'),
        b('No-Tax Item', 4, 44, 32, 24, 'tile'),
        b('Gift Card', 39, 44, 32, 24, 'tile'),
        b('Custom Amount', 74, 44, 32, 24, 'tile'),
        L8_PRIMARY('Review Order'),
      ];
    case 'review-order':
      return [b('Add discount', 4, 84, 34, 8, 'text'), L8_PRIMARY('Pay')];
    case 'tender-select':
      return [b('Card', 8, 46, 90, 10, 'row'), b('Cash', 8, 58, 90, 10, 'row'), b('Other tender', 8, 70, 90, 10, 'row'), L8_PRIMARY('Charge')];
    case 'cash-discount-tender':
      return [b('Cash', 20, 46, 62, 34, 'cash'), b('Card', 96, 46, 56, 34, 'secondary')];
    case 'payment-prompt':
      return [b('Cancel', 8, 88, 40, 10, 'text')];
    case 'pin-entry':
      return [...pinGridL8('pin', 'pin'), b('Cancel', 86, 82, 23, 18, 'fn-cancel'), b('Clear', 111, 82, 23, 18, 'fn-clear'), b('OK', 136, 82, 23, 18, 'fn-ok')];
    case 'tip':
      return [
        b('15%', 8, 30, 36, 30, 'tip'),
        b('18%', 48, 30, 36, 30, 'tip'),
        b('20%', 88, 30, 36, 30, 'tip'),
        b('Custom', 128, 30, 36, 30, 'tip'),
        b('No Tip', 56, 72, 60, 12, 'secondary'),
      ];
    case 'signature':
      return [b('signature.area', 8, 12, 156, 70, 'area'), b('Clear', 8, 88, 76, 12, 'secondary'), b('Done', 88, 88, 76, 12, 'primary')];
    case 'declined':
      return [b('Try again', 56, 88, 60, 12, 'outline')];
    case 'receipt-options': {
      if (p.qr) return [b('Done', 96, 80, 60, 12, 'primary')];
      const ys = q.receiptOptions === 5 ? [42.5, 56.5, 70.5, 84.5, 98.5] : [39.5, 53.5, 67.5, 81.5];
      const ids = ['Print', 'Email', 'Text', 'No Receipt', 'Scan for receipt'];
      return ys.map((cy, i) => bc(ids[i]!, 86.15, cy, 100, 5, 'pill'));
    }
    case 'oobe-welcome':
      return [L8_OOBE_PRIMARY('Get started')];
    case 'oobe-network':
      return [b('Ethernet', 20, 16, 132, 10, 'row'), b('LAB-AUTOMATION', 20, 28, 132, 10, 'row'), b('GUEST', 20, 40, 132, 10, 'row'), L8_OOBE_PRIMARY('Next')];
    case 'oobe-merchant':
      return [b('Merchant ID', 30, 20, 112, 10, 'field'), b('Activation code', 30, 36, 112, 10, 'field'), L8_OOBE_PRIMARY('Activate')];
    case 'oobe-employee':
      return [...pinGridL8('pin', 'pad'), L8_OOBE_PRIMARY('Continue')];
    case 'oobe-complete':
      return [L8_OOBE_PRIMARY('Done')];
    case 'app-orders':
    case 'app-transactions':
      return (q.listRows ?? []).slice(0, 8).map((id, k) => b(id, 0, 12 + 10 * k, 172.3, 10, 'list-row'));
    case 'app-setup':
      return ['Merchant', 'Network', 'Devices', 'About'].map((id, k) => b(id, 0, 12 + 10 * k, 172.3, 10, 'list-row'));
    case 'app-dining': {
      const out: Btn[] = [];
      let n = 1;
      for (const cy of [28, 54, 80]) for (const cx of [56, 86, 116]) out.push(bc(`T${n++}`, cx, cy, 22, 22, 'table'));
      return out;
    }
    case 'error':
      return [b('OK', 104, 60, 18, 8, 'dialog-ok')];
    default:
      return [];
  }
}

function l8Nav(): Btn[] {
  return [bc('nav.back', 70, 104.7, 14, 6, 'nav'), bc('nav.home', 86.15, 104.7, 14, 6, 'nav'), bc('nav.recents', 102.3, 104.7, 14, 6, 'nav')];
}

/* ───────────────────────────── derived classes (§4.2, §4.5) ───────────────────────────── */

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Scale a base-class button into P-s / L14: positions scale, receipt pills keep their mm size. */
function deriveBtn(btn: Btn, cls: 'P-s' | 'L14'): Btn {
  const d = LAYOUT_DERIVATION[cls];
  if (btn.kind === 'pill') {
    const cx = btn.x + btn.w / 2;
    const cy = btn.y + btn.h / 2;
    return { ...btn, x: r1(cx * d.sx - btn.w / 2), y: r1(cy * d.sy - btn.h / 2) };
  }
  return { ...btn, x: r1(btn.x * d.sx), y: r1(btn.y * d.sy), w: r1(btn.w * d.sx), h: r1(btn.h * d.sy) };
}

/**
 * Receipt pills in derived classes: 4-option centres are the scaled base centres; the 5-option
 * centres are the 4-option centres + 3.0 mm (the QR shift does not scale), `Scan for receipt` one
 * scaled pitch below `No Receipt` + 3.0 (§4.5 footnote).
 */
function derivedReceipt(q: LayoutQuery, cls: 'P-s' | 'L14'): Btn[] {
  const base = cls === 'P-s' ? pLayout({ ...q, receiptOptions: 4, cls: 'P' }) : l8Layout({ ...q, receiptOptions: 4, cls: 'L8' });
  const four = base.map((x) => deriveBtn(x, cls));
  if (q.receiptOptions !== 5) return four;
  const pitch = four[1]!.y - four[0]!.y;
  const shifted = four.map((x) => ({ ...x, y: r1(x.y + 3) }));
  const last = shifted[shifted.length - 1]!;
  shifted.push({ ...last, id: 'Scan for receipt', y: r1(last.y + pitch) });
  return shifted;
}

/** Local (World §4) buttons for a screen, in the display's own mm frame. */
export function localButtons(q: LayoutQuery): Btn[] {
  const merchant = MERCHANT_SCREENS.has(q.screen);
  switch (q.cls) {
    case 'P':
      return [...pLayout(q), ...(merchant ? pNav() : [])];
    case 'L8':
      return [...l8Layout(q), ...(merchant ? l8Nav() : [])];
    case 'P-s': {
      if (q.screen === 'receipt-options' && !q.params.qr) return derivedReceipt(q, 'P-s');
      const base = [...pLayout({ ...q, cls: 'P' }), ...(merchant ? pNav() : [])];
      return base.map((x) => deriveBtn(x, 'P-s'));
    }
    case 'L14': {
      if (q.screen === 'receipt-options' && !q.params.qr) return derivedReceipt(q, 'L14');
      const base = [...l8Layout({ ...q, cls: 'L8' }), ...(merchant ? l8Nav() : [])];
      return base.map((x) => deriveBtn(x, 'L14'));
    }
  }
}

/* ───────────────────────────── effective layout ───────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%⌫]+/g, '');

function inferKind(screen: string, id: string, local: readonly Btn[]): BtnKind {
  if (screen === 'register' && norm(id) === 'register') return 'header';
  const hit = local.find((l) => norm(l.id) === norm(id));
  if (hit) return hit.kind;
  if (/^\d$/.test(id)) return screen === 'lock' ? 'pad-key' : 'pin';
  if (screen === 'pin-entry') {
    if (/cancel/i.test(id)) return 'fn-cancel';
    if (/clear/i.test(id)) return 'fn-clear';
    if (/ok|enter/i.test(id)) return 'fn-ok';
  }
  if (screen === 'receipt-options') return 'pill';
  if (screen === 'home') return 'app';
  if (screen === 'tip' && /%|custom/i.test(id)) return 'tip';
  if (screen === 'register' && !/review|clear/i.test(id)) return 'tile';
  if (/pay|charge|review|done|next|continue|activate|get started|^ok$/i.test(id)) return 'primary';
  if (/signature|pad/i.test(id)) return 'area';
  return 'secondary';
}

/** Buttons to draw (= the hit-test truth) for a screen. */
export function effectiveButtons(q: LayoutQuery): Btn[] {
  const local = localButtons(q);
  if (!provider) return local;
  let raw: readonly ProviderButton[] | null | undefined = null;
  try {
    raw = provider(q);
  } catch {
    raw = null;
  }
  if (!raw || raw.length === 0) return local;
  const merchant = MERCHANT_SCREENS.has(q.screen);
  const out: Btn[] = raw.map((p) => {
    const x = p.centred ? p.x - p.w / 2 : p.x;
    const y = p.centred ? p.y - p.h / 2 : p.y;
    const kind: BtnKind = p.kind === 'qr' ? 'qr' : p.kind === 'pad' ? 'area' : inferKind(q.screen, p.id, local);
    return { id: kind === 'area' && p.kind === 'pad' ? 'signature.area' : p.id, x, y, w: p.w, h: p.h, kind };
  });
  // Keep the Android nav bar (chrome) if the provider has no nav buttons of its own.
  if (merchant && !out.some((x) => x.kind === 'nav')) {
    // the local nav bar is authored in the class size; stretch it to the device's real screen
    const cls = LAYOUT_CLASS_SIZE_MM[q.cls];
    let sx = 1;
    let sy = 1;
    try {
      const real = screenOf(q.type, q.display);
      sx = real.wMm / cls.w;
      sy = real.hMm / cls.h;
    } catch {
      /* class size */
    }
    for (const n of local) if (n.kind === 'nav') out.push({ ...n, x: n.x * sx, y: n.y * sy, w: n.w * sx, h: n.h * sy });
  }
  return out;
}

/** Centre of a button (mm). */
export function btnCentre(btn: Btn): [number, number] {
  return [btn.x + btn.w / 2, btn.y + btn.h / 2];
}

/** Top-most button containing (x, y) (edges inclusive) — World §4.1 touch rule. */
export function hitButton(btns: readonly Btn[], x: number, y: number): Btn | null {
  for (let i = btns.length - 1; i >= 0; i--) {
    const t = btns[i]!;
    if ((t.kind === 'area' && t.id !== 'signature.area') || t.kind === 'qr') continue;
    if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return t;
  }
  return null;
}
