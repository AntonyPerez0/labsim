/**
 * LabSim device model helpers (Sim §3.8–§3.11): display access, MFD/CFD topology, screen transitions
 * (render race timing, Sim §3.19.5), order maths (Sim §3.9.2), the live layout with label texts, and
 * the LayoutButton view used by the ruler, render2d, UIA and runners.
 */
import type { TerminalDevice, DisplayState, LabState, MerchantConfig, OrderLine, OrderState, ScreenName } from '../../types';
import type { LayoutButton } from '../../api';
import type { Ctx } from '../util';
import { addTimer, rand } from '../util';
import { coreMm, resolveElements } from '../../seed/layouts';
import type { ResolvedEl } from '../../seed/layouts';
import { DEVICE_TYPES, screenOf } from '../../seed/deviceTypes';
import { INVENTORY } from '../../seed/merchants';
import { fmtClockShort, fmtMoney } from '../../text/time';

export type Disp = 'primary' | 'secondary';

export function dispOf(d: TerminalDevice, disp: Disp): DisplayState | null {
  return disp === 'secondary' ? d.secondaryDisplay : d.display;
}

/** The device whose `order` drives this device's screens (tethered CFD → its MFD). */
export function ownerOf(lab: LabState, d: TerminalDevice): TerminalDevice {
  if (d.role === 'cfd' && d.tetheredTo && lab.devices[d.tetheredTo]) return lab.devices[d.tetheredTo]!;
  return d;
}

/** Where the customer-facing screens of `owner`'s transactions appear. */
export function customerSide(lab: LabState, owner: TerminalDevice): { dev: TerminalDevice; disp: Disp } {
  if (owner.role === 'mfd' && owner.tetheredTo && lab.devices[owner.tetheredTo]) return { dev: lab.devices[owner.tetheredTo]!, disp: 'primary' };
  if (owner.secondaryDisplay && DEVICE_TYPES[owner.type].dualScreenSingleAdb) return { dev: owner, disp: 'secondary' };
  return { dev: owner, disp: 'primary' };
}

/** True when merchant and customer screens are on different displays/devices. */
export function isSplit(lab: LabState, owner: TerminalDevice): boolean {
  const c = customerSide(lab, owner);
  return c.dev.id !== owner.id || c.disp !== 'primary';
}

export function merchantOf(lab: LabState, d: TerminalDevice): MerchantConfig | null {
  const owner = ownerOf(lab, d);
  return owner.merchantConfigId != null ? (lab.orca.merchants[owner.merchantConfigId] ?? null) : null;
}

/** Receipt options this device renders (Sim §3.10). */
export function receiptOptionsFor(lab: LabState, d: TerminalDevice): 4 | 5 {
  const m = merchantOf(lab, d);
  return d.firmwareInfo.receiptQr && !!m?.qrReceiptsEnabled ? 5 : 4;
}

/* ────────────────────────────── money (Sim §3.9.2) ────────────────────────────── */

/** floor((n·2 + d) / (2d)) — round half up for n ≥ 0. */
export function roundHalfUp(n: number, d: number): number {
  return Math.floor((n * 2 + d) / (2 * d));
}

export function recompute(order: OrderState, m: MerchantConfig | null): void {
  const subtotal = order.lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const taxable = order.lines.reduce((s, l) => s + (l.taxable ? l.priceCents * l.qty : 0), 0);
  const tax = roundHalfUp(taxable * (m?.taxRateBp ?? 0), 10_000);
  const adj = order.tender === 'card' && m?.cashDiscountEnabled ? roundHalfUp((subtotal + tax) * m.cardAdjustBp, 10_000) : 0;
  const tip = order.tipPct != null ? roundHalfUp((subtotal + tax) * order.tipPct, 100) : order.tipCents;
  order.subtotalCents = subtotal;
  order.taxCents = tax;
  order.cardAdjustCents = adj;
  order.tipCents = tip;
  order.totalCents = subtotal + tax + adj + tip;
}

export function newOrder(d: TerminalDevice): OrderState {
  const seq = (d.orderSeq ?? 0) + 1;
  d.orderSeq = seq;
  const rig = (d.rigId ?? d.id).toUpperCase();
  return {
    id: `ORD-${rig}-${String(seq).padStart(4, '0')}`,
    lines: [],
    subtotalCents: 0,
    taxCents: 0,
    tipCents: 0,
    totalCents: 0,
    status: 'open',
    cardProfileId: null,
    receiptChoice: null,
    cardAdjustCents: 0,
    tender: null,
    entry: null,
    pinTries: 0,
    authCode: null,
    tipPct: null,
  };
}

export function addItem(order: OrderState, name: string, m: MerchantConfig | null): boolean {
  const item = INVENTORY.find((i) => i.name === name);
  if (!item) return false;
  const line: OrderLine | undefined = order.lines.find((l) => l.name === name);
  if (line) line.qty += 1;
  else order.lines.push({ name, priceCents: item.priceCents, qty: 1, taxable: item.taxable });
  recompute(order, m);
  return true;
}

/* ────────────────────────────── screens ────────────────────────────── */

/** Render time of a screen transition (Sim §3.19.5): 90 % U(200,1200) ms, 10 % U(5000,8000) ms. */
export function drawRenderMs(lab: LabState): number {
  const branch = rand(lab, 'devices');
  const u = rand(lab, 'devices');
  return branch < 0.9 ? 200 + Math.floor(u * 1000) : 5000 + Math.floor(u * 3000);
}

export interface SetScreenOpts {
  params?: Record<string, string | number | boolean>;
  /** Auto-advance after this many physical ms (null = hold). */
  advanceMs?: number | null;
  /** Render completes immediately (device.stage, boot, power off). */
  instant?: boolean;
  /** Count `advanceMs` from render completion: a confirmation screen is *shown* for that long once drawn
   *  (a GC-stalled Approved screen never skips straight to the receipt options). */
  afterRender?: boolean;
}

/** Params a screen needs for drawing/hit-testing (page, dining slot, tips, printer, amounts). */
function screenParams(lab: LabState, d: TerminalDevice, screen: ScreenName): Record<string, string | number | boolean> {
  const m = merchantOf(lab, d);
  switch (screen) {
    case 'home':
      return { page: d.launcher.page, dining: d.apps.includes('LabSim Dining') };
    case 'customer-idle':
      return { merchant: m?.displayName ?? 'LabSim' };
    case 'tip':
      return { tips: (m?.tipPercents ?? []).join(',') };
    case 'receipt-options':
      return { printer: DEVICE_TYPES[d.type].hasPrinter && d.printer.present };
    default:
      return {};
  }
}

/** Every screen change goes through here (events, render timing, Secure Touch, arming). */
export function setScreen(lab: LabState, ctx: Ctx, d: TerminalDevice, disp: Disp, screen: ScreenName, opts: SetScreenOpts = {}): void {
  const ds = dispOf(d, disp);
  if (!ds) return;
  const from = ds.screen;
  const phys = lab.time.physMs;
  ds.screen = screen;
  ds.params = { ...screenParams(lab, d, screen), ...(opts.params ?? {}) };
  if (screen === 'receipt-options') ds.receiptOptions = receiptOptionsFor(lab, d);
  else if (ds.receiptOptions !== undefined) delete ds.receiptOptions;
  ds.rev += 1;
  ds.brightness = screen === 'off' ? 0 : 1;
  ds.renderStartMs = phys;
  ds.renderDoneMs = opts.instant || screen === 'off' ? phys : phys + drawRenderMs(lab);
  ds.autoAdvanceAtMs = opts.advanceMs == null ? null : (opts.afterRender ? ds.renderDoneMs : phys) + opts.advanceMs;
  ds.strokes = 0;
  ds.pinDigits = 0;
  const secure = d.display.screen === 'pin-entry' || d.secondaryDisplay?.screen === 'pin-entry';
  if (d.secureTouch !== secure) d.secureTouch = secure;
  if (screen === 'lock' && disp === 'primary') d.locked = true;
  else if (disp === 'primary' && d.locked && screen !== 'off' && screen !== 'boot') d.locked = false;
  if (from !== screen) ctx.emit('device.screenChanged', { deviceId: d.id, display: disp, from, to: screen });
  // Armed probes fire 0.8 s after the customer display reaches the payment prompt (Sim §3.6 #9).
  if (screen === 'payment-prompt') {
    for (const pid of Object.keys(lab.collis).sort()) {
      const c = lab.collis[pid]!;
      if (c.armed && c.armed.deviceId === d.id) addTimer(lab, 'callus.armFire', 'phys', 800, { probe: pid });
    }
  }
}

export function toast(lab: LabState, ctx: Ctx, d: TerminalDevice, disp: Disp, text: string, ms = 3_000): void {
  const ds = dispOf(d, disp);
  if (!ds) return;
  ds.toast = { text, untilMs: lab.time.physMs + ms };
  ds.rev += 1;
  ctx.emit('device.toast', { deviceId: d.id, display: disp, text });
}

export function logcat(d: TerminalDevice, line: string): void {
  d.logcat.push(line);
  if (d.logcat.length > 200) d.logcat.splice(0, d.logcat.length - 200);
}

/* ────────────────────────────── live layout ────────────────────────────── */

/** Text of a live label (`@regSubtotal` …) for a display. */
export function labelText(lab: LabState, d: TerminalDevice, ds: DisplayState, id: string): string {
  if (!id.startsWith('@')) return id;
  const owner = ownerOf(lab, d);
  const o = owner.order;
  const sub = o?.subtotalCents ?? 0;
  const tax = o?.taxCents ?? 0;
  const pre = sub + tax;
  switch (id) {
    case '@regSubtotal':
    case '@revSubtotal':
    case '@cartSubtotal':
      return `Subtotal ${fmtMoney(sub)}`;
    case '@regTax':
    case '@revTax':
    case '@cartTax':
      return `Tax ${fmtMoney(tax)}`;
    case '@regTotal':
    case '@revTotal':
      return `Total ${fmtMoney(pre)}`;
    case '@cartTotal':
      return `${d.cfdLayout === 'v2' ? 'Total' : 'TOTAL'} ${fmtMoney(pre)}`;
    case '@amount':
      return fmtMoney(o ? o.totalCents : 0);
    case '@merchant':
      return String(ds.params.merchant ?? merchantOf(lab, d)?.displayName ?? '');
    case '@clock':
      return fmtClockShort(lab.time, lab.time.nowMs);
    case '@date':
      return lab.time.dateLabel;
    case '@reason':
      return String(ds.params.reason ?? '');
    case '@mid':
      return String(ds.params.mid ?? '');
    case '@appTitle':
      return String(ds.params.title ?? '');
    case '@error':
      return String(ds.params.error ?? 'Something went wrong');
    default:
      return '';
  }
}

/** Resolved firmware elements of a display's current screen, with live label text and review lines. */
export function liveElements(lab: LabState, d: TerminalDevice, disp: Disp): (ResolvedEl & { text: string })[] {
  const ds = dispOf(d, disp);
  if (!ds || d.power !== 'on') return [];
  const els = resolveElements(d.type, disp, ds.screen, ds.params, ds.receiptOptions).map((e) => ({ ...e, text: e.kind === 'label' ? labelText(lab, d, ds, e.id) : e.id }));
  if (ds.screen === 'review-order') {
    const o = ownerOf(lab, d).order;
    const scr = screenOf(d.type, disp);
    const top = scr.hMm * 0.12;
    const step = Math.max(5, scr.hMm * 0.06);
    (o?.lines ?? []).forEach((l, i) => {
      const text = `${l.name} ×${l.qty} ${fmtMoney(l.priceCents * l.qty)}`;
      els.push({ id: `@line${i}`, kind: 'label', x: scr.wMm * 0.3, y: top + i * step, w: scr.wMm * 0.5, h: step * 0.8, enabled: true, text });
    });
  }
  return els;
}

/** LayoutButton view (Sim §2.10.2) — pure. */
export function layoutButtons(lab: LabState, d: TerminalDevice, disp: Disp): LayoutButton[] {
  return liveElements(lab, d, disp).map((e) => ({
    id: e.text,
    kind: e.kind,
    xMm: e.x,
    yMm: e.y,
    wMm: e.w,
    hMm: e.h,
    coreMm: coreMm(e),
    enabled: e.enabled,
    visible: true,
  }));
}

/** Page-object name of a runtime screen (Sim §3.19.7). */
export function pageObjectName(lab: LabState, d: TerminalDevice, disp: Disp): string {
  const ds = dispOf(d, disp);
  const s = ds?.screen ?? 'off';
  const owner = ownerOf(lab, d);
  switch (s) {
    case 'home':
      return 'HomeScreen';
    case 'lock':
      return 'LockScreen';
    case 'register': {
      const o = owner.order;
      return o && (o.lines.length > 0 || o.status === 'paid') ? 'RegisterOrderScreen' : 'RegisterHomeScreen';
    }
    case 'review-order':
      return 'ReviewOrderScreen';
    case 'tender-select':
      return 'PaymentScreen';
    case 'payment-prompt':
      return 'PaymentPromptScreen';
    case 'customer-cart':
      return DEVICE_TYPES[d.type].dualScreenSingleAdb ? 'CfdTotalsScreen' : 'CustomerOrderScreen';
    case 'tip':
      return 'TipScreen';
    case 'receipt-options':
      return 'ReceiptScreen';
    case 'thank-you':
      return 'ThankYouScreen';
    case 'waiting-for-merchant':
      return 'WaitingForMerchantScreen';
    default:
      return s
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('') + 'Screen';
  }
}
