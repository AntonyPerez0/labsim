/**
 * The LabSim transaction state machine (Sim §3.9): button presses per screen, card events, PIN, tips,
 * signatures, receipts (§3.9.7, §3.10), tethered pairs (§3.9.4) and the Station Duo (§3.9.5),
 * auto-advance timing, and hardware keys / text input.
 */
import type { CardEntry, CardProfile, TerminalDevice, LabState, ReceiptDoc } from '../../types';
import type { Ctx } from '../util';
import { addTimer, rand } from '../util';
import { DEVICE_TYPES } from '../../seed/deviceTypes';
import { DECLINE, receiptText, TOAST } from '../../text/devices';
import { RECEIPT_ADDRESS } from '../../seed/merchants';
import { gortFileText } from '../../seed';
import { addItem, customerSide, dispOf, drawRenderMs, isSplit, logcat, merchantOf, newOrder, ownerOf, recompute, setScreen, toast } from './model';
import type { Disp } from './model';
import { enqueueRig } from '../rigs';

const APP_SCREENS: Record<string, { screen: 'app-orders' | 'app-transactions' | 'app-setup' | 'app-sale' | 'app-authorizations' | 'app-customers' | 'app-inventory' | 'app-settings' | 'app-market' | 'app-dining'; title: string }> = {
  Orders: { screen: 'app-orders', title: 'Orders' },
  Transactions: { screen: 'app-transactions', title: 'Transactions' },
  Setup: { screen: 'app-setup', title: 'Setup' },
  Sale: { screen: 'app-sale', title: 'Sale' },
  Authorizations: { screen: 'app-authorizations', title: 'Authorizations' },
  Customers: { screen: 'app-customers', title: 'Customers' },
  Inventory: { screen: 'app-inventory', title: 'Inventory' },
  Settings: { screen: 'app-settings', title: 'Settings' },
  'App Market': { screen: 'app-market', title: 'App Market' },
  'LabSim Dining': { screen: 'app-dining', title: 'LabSim Dining' },
  Reporting: { screen: 'app-orders', title: 'Reporting' },
  Employees: { screen: 'app-settings', title: 'Employees' },
  'Cash Log': { screen: 'app-transactions', title: 'Cash Log' },
  Help: { screen: 'app-settings', title: 'Help' },
};

const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

/** Return the merchant-side display to Register and the customer side to idle (after cancel/home). */
function customerIdle(lab: LabState, ctx: Ctx, owner: TerminalDevice): void {
  const c = customerSide(lab, owner);
  if (c.dev.id === owner.id && c.disp === 'primary') return;
  if (c.dev.power !== 'on') return;
  const link = owner.role === 'mfd' ? owner.payDisplayLink : 'UP';
  setScreen(lab, ctx, c.dev, c.disp, link === 'DOWN' ? 'waiting-for-merchant' : 'customer-idle');
}

/* ────────────────────────────── presses ────────────────────────────── */

/** Apply a successful press of `btn` on `d`'s display (Sim §3.9.3 table). */
export function press(lab: LabState, ctx: Ctx, d: TerminalDevice, disp: Disp, btn: string): void {
  const ds = dispOf(d, disp);
  if (!ds) return;
  const owner = ownerOf(lab, d);
  const m = merchantOf(lab, d);
  const o = owner.order;
  switch (ds.screen) {
    case 'lock': {
      if (!ds.params.pad) {
        setScreen(lab, ctx, d, disp, 'lock', { params: { pad: true, typed: '' }, instant: true });
        return;
      }
      lockKey(lab, ctx, d, disp, btn);
      return;
    }
    case 'home': {
      if (btn === 'Register') {
        if (!d.apps.includes('Register')) return;
        owner.order = newOrder(owner);
        setScreen(lab, ctx, d, disp, 'register');
        return;
      }
      const app = APP_SCREENS[btn];
      if (app) setScreen(lab, ctx, d, disp, app.screen, { params: { title: app.title } });
      return;
    }
    case 'register': {
      if (!o) owner.order = newOrder(owner);
      const ord = owner.order!;
      if (btn === 'Clear') {
        ord.lines = [];
        recompute(ord, m);
        ds.rev += 1;
      } else if (btn === 'Review Order') {
        if (ord.lines.length === 0) return;
        if (ord.status === 'paid') return;
        ord.status = 'review';
        setScreen(lab, ctx, d, disp, 'review-order');
        const c = customerSide(lab, owner);
        if ((c.dev.id !== owner.id || c.disp !== 'primary') && c.dev.power === 'on' && (owner.role !== 'mfd' || owner.payDisplayLink === 'UP')) setScreen(lab, ctx, c.dev, c.disp, 'customer-cart');
      } else if (btn !== 'Register') {
        if (ord.status === 'paid') {
          owner.order = newOrder(owner);
        }
        const first = owner.order!.lines.length === 0;
        if (addItem(owner.order!, btn, m)) {
          ds.rev += 1;
          // The first line redraws the order pane (Review Order appears): a fresh render (Sim §3.19.5,
          // the INC32 race on reviewOrder()).
          if (first) {
            ds.renderStartMs = lab.time.physMs;
            ds.renderDoneMs = lab.time.physMs + drawRenderMs(lab);
          }
        }
      }
      return;
    }
    case 'review-order': {
      if (!o) return;
      if (btn === 'Back') {
        o.status = 'open';
        setScreen(lab, ctx, d, disp, 'register');
        customerIdle(lab, ctx, owner);
      } else if (btn === 'Pay') {
        o.status = 'awaiting-tender';
        setScreen(lab, ctx, d, disp, 'tender-select');
      }
      return;
    }
    case 'tender-select': {
      if (!o) return;
      if (btn === 'Charge') charge(lab, ctx, owner);
      else if (btn === 'Cash') payCash(lab, ctx, owner);
      else if (btn === 'Cancel') {
        o.status = 'review';
        setScreen(lab, ctx, d, disp, 'review-order');
      } else if (btn === 'Other') toast(lab, ctx, d, disp, 'No other tenders configured');
      return;
    }
    case 'cash-discount-tender': {
      if (!o) return;
      if (btn === 'Card') {
        o.tender = 'card';
        recompute(o, m);
        o.status = 'awaiting-card';
        setScreen(lab, ctx, d, disp, 'payment-prompt', { params: { amount: o.totalCents } });
      } else if (btn === 'Cash') payCash(lab, ctx, owner);
      return;
    }
    case 'payment-prompt': {
      if (btn === 'Cancel' && o) cancelPayment(lab, ctx, owner);
      return;
    }
    case 'pin-entry': {
      if (!o) return;
      const typed = String(ds.params.typed ?? '');
      if (DIGITS.has(btn)) {
        if (typed.length >= 12) return;
        ds.params = { ...ds.params, typed: typed + btn };
        ds.pinDigits = typed.length + 1;
        ds.rev += 1;
        ds.autoAdvanceAtMs = lab.time.physMs + 60_000;
      } else if (btn === 'Clear') {
        ds.params = { ...ds.params, typed: '' };
        ds.pinDigits = 0;
        ds.rev += 1;
      } else if (btn === 'Enter') {
        const prof = o.cardProfileId != null ? lab.orca.cardProfiles[o.cardProfileId] : undefined;
        if (prof?.pin != null && typed === prof.pin) afterPin(lab, ctx, owner);
        else {
          o.pinTries += 1;
          if (o.pinTries >= 3) decline(lab, ctx, owner, DECLINE.pinTries);
          else {
            ds.params = { ...ds.params, typed: '' };
            ds.pinDigits = 0;
            toast(lab, ctx, d, disp, TOAST.badPin);
          }
        }
      } else if (btn === 'Cancel') {
        o.status = 'awaiting-card';
        setScreen(lab, ctx, d, disp, 'payment-prompt', { params: { amount: o.totalCents } });
      }
      return;
    }
    case 'tip': {
      if (!o) return;
      const pct = /^(\d+)%$/.exec(btn);
      if (pct) {
        o.tipPct = Number(pct[1]);
        recompute(o, m);
        afterTip(lab, ctx, owner);
      } else if (btn === 'No Tip') {
        o.tipPct = null;
        o.tipCents = 0;
        recompute(o, m);
        afterTip(lab, ctx, owner);
      } else if (btn === 'Custom') setScreen(lab, ctx, d, disp, 'tip-custom', { params: { typed: '' } });
      return;
    }
    case 'tip-custom': {
      if (!o) return;
      const typed = String(ds.params.typed ?? '');
      if (DIGITS.has(btn)) {
        ds.params = { ...ds.params, typed: (typed + btn).replace(/^0+(?=\d)/, '').slice(0, 7) };
        ds.rev += 1;
      } else if (btn === 'Clear') {
        ds.params = { ...ds.params, typed: '' };
        ds.rev += 1;
      } else if (btn === 'Enter') {
        o.tipPct = null;
        o.tipCents = Number(typed || '0');
        recompute(o, m);
        afterTip(lab, ctx, owner);
      } else if (btn === 'Cancel') setScreen(lab, ctx, d, disp, 'tip');
      return;
    }
    case 'signature': {
      if (!o) return;
      if (btn === 'Clear') {
        ds.strokes = 0;
        ds.rev += 1;
      } else if (btn === 'Done') {
        if (ds.strokes > 0) processing(lab, ctx, owner);
        else toast(lab, ctx, d, disp, TOAST.sign);
      }
      return;
    }
    case 'receipt-options': {
      if (!o || ds.params.qrEnlarged) return;
      receiptChoice(lab, ctx, owner, d, disp, btn);
      return;
    }
    case 'receipt-done': {
      if (btn === 'Done') setScreen(lab, ctx, d, disp, 'thank-you', { advanceMs: 3_000, afterRender: true });
      return;
    }
    default:
      return;
  }
}

function lockKey(lab: LabState, ctx: Ctx, d: TerminalDevice, disp: Disp, key: string): void {
  const ds = dispOf(d, disp)!;
  const typed = String(ds.params.typed ?? '');
  if (DIGITS.has(key)) {
    const next = typed + key;
    ds.params = { ...ds.params, pad: true, typed: next };
    ds.rev += 1;
    if (next.length >= d.passcode.length) checkPasscode(lab, ctx, d, disp);
  } else if (key === 'Clear') {
    ds.params = { ...ds.params, typed: '' };
    ds.rev += 1;
  } else if (key === 'Enter') checkPasscode(lab, ctx, d, disp);
}

function checkPasscode(lab: LabState, ctx: Ctx, d: TerminalDevice, disp: Disp): void {
  const ds = dispOf(d, disp)!;
  if (String(ds.params.typed ?? '') === d.passcode) {
    d.locked = false;
    setScreen(lab, ctx, d, disp, d.role === 'cfd' ? 'customer-idle' : 'home');
  } else {
    ds.params = { ...ds.params, typed: '' };
    toast(lab, ctx, d, disp, TOAST.wrongPasscode);
  }
}

function charge(lab: LabState, ctx: Ctx, owner: TerminalDevice): void {
  const o = owner.order!;
  const m = merchantOf(lab, owner);
  const c = customerSide(lab, owner);
  if (owner.role === 'mfd' && owner.payDisplayLink !== 'UP') {
    setScreen(lab, ctx, owner, 'primary', 'waiting-for-customer', { params: { connecting: true }, advanceMs: 30_000 });
    return;
  }
  if (isSplit(lab, owner)) setScreen(lab, ctx, owner, 'primary', 'waiting-for-customer');
  if (m?.cashDiscountEnabled) {
    setScreen(lab, ctx, c.dev, c.disp, 'cash-discount-tender');
    return;
  }
  o.tender = 'card';
  recompute(o, m);
  o.status = 'awaiting-card';
  setScreen(lab, ctx, c.dev, c.disp, 'payment-prompt', { params: { amount: o.totalCents } });
}

function payCash(lab: LabState, ctx: Ctx, owner: TerminalDevice): void {
  const o = owner.order!;
  o.tender = 'cash';
  recompute(o, merchantOf(lab, owner));
  o.status = 'paid';
  o.authCode = null;
  const c = customerSide(lab, owner);
  if (isSplit(lab, owner)) setScreen(lab, ctx, owner, 'primary', 'waiting-for-customer');
  setScreen(lab, ctx, c.dev, c.disp, 'approved', { advanceMs: 2_000, afterRender: true });
}

function cancelPayment(lab: LabState, ctx: Ctx, owner: TerminalDevice): void {
  const o = owner.order!;
  o.status = 'review';
  o.tender = null;
  recompute(o, merchantOf(lab, owner));
  const c = customerSide(lab, owner);
  setScreen(lab, ctx, owner, 'primary', 'review-order');
  if (isSplit(lab, owner)) setScreen(lab, ctx, c.dev, c.disp, 'customer-cart');
  retractCard(lab, owner);
}

function decline(lab: LabState, ctx: Ctx, owner: TerminalDevice, reason: string): void {
  const o = owner.order!;
  const c = customerSide(lab, owner);
  o.status = 'declined';
  setScreen(lab, ctx, c.dev, c.disp, 'declined', { params: { reason }, advanceMs: 3_000 });
  retractCard(lab, owner);
  ctx.emit('device.transactionCompleted', { deviceId: owner.id, orderId: o.id, totalCents: o.totalCents, approved: false, receiptChoice: null, entry: o.entry });
}

function afterPin(lab: LabState, ctx: Ctx, owner: TerminalDevice): void {
  const m = merchantOf(lab, owner);
  if (m?.tipsEnabled) {
    owner.order!.status = 'awaiting-tip';
    const c = customerSide(lab, owner);
    setScreen(lab, ctx, c.dev, c.disp, 'tip');
    return;
  }
  afterTip(lab, ctx, owner);
}

function afterTip(lab: LabState, ctx: Ctx, owner: TerminalDevice): void {
  const o = owner.order!;
  const m = merchantOf(lab, owner);
  const c = customerSide(lab, owner);
  if (o.entry === 'SWIPE' && m?.signatureThresholdCents != null && o.totalCents >= m.signatureThresholdCents) {
    o.status = 'awaiting-signature';
    setScreen(lab, ctx, c.dev, c.disp, 'signature');
    return;
  }
  processing(lab, ctx, owner);
}

function processing(lab: LabState, ctx: Ctx, owner: TerminalDevice): void {
  const c = customerSide(lab, owner);
  owner.order!.status = 'processing';
  setScreen(lab, ctx, c.dev, c.disp, 'processing', { advanceMs: 1_500 });
}

/** processing → approved (authCode from the devices stream), dip/tap auto-retract. */
function approve(lab: LabState, ctx: Ctx, owner: TerminalDevice, hold = false): void {
  const o = owner.order!;
  const c = customerSide(lab, owner);
  if (o.tender !== 'cash') o.authCode = `SIM${String(Math.floor(1000 * rand(lab, 'devices'))).padStart(3, '0')}`;
  o.status = 'paid';
  setScreen(lab, ctx, c.dev, c.disp, 'approved', { advanceMs: hold ? null : 2_000, afterRender: true });
  retractCard(lab, owner);
}

/** Orca auto-sends dipOut / tapOut after approved/declined (Sim §3.6 #10). */
function retractCard(lab: LabState, owner: TerminalDevice): void {
  const c = customerSide(lab, owner);
  const rig = c.dev.rigId ? lab.rigs[c.dev.rigId] : undefined;
  if (!rig) return;
  if (rig.dipArm === 'extended' || rig.dipArm === 'extending') enqueueRig(lab, rig.id, { kind: 'dipOut', source: 'orca' });
  if (rig.tapArm === 'extended' || rig.tapArm === 'extending') enqueueRig(lab, rig.id, { kind: 'tapOut', source: 'orca' });
}

function receiptChoice(lab: LabState, ctx: Ctx, owner: TerminalDevice, d: TerminalDevice, disp: Disp, btn: string): void {
  const o = owner.order!;
  const ds = dispOf(d, disp)!;
  const five = ds.receiptOptions === 5;
  switch (btn) {
    case 'Print': {
      if (!DEVICE_TYPES[d.type].hasPrinter || !d.printer.present) {
        toast(lab, ctx, d, disp, TOAST.noPrinter);
        return;
      }
      if (!d.printer.paper) {
        toast(lab, ctx, d, disp, TOAST.noPaper);
        return;
      }
      o.receiptChoice = 'Print';
      setScreen(lab, ctx, d, disp, 'printing', { advanceMs: 3_000 });
      addTimer(lab, 'device.printPayload', 'phys', 2_500, { device: d.id, owner: owner.id, qr: five });
      return;
    }
    case 'Email':
    case 'Text':
      o.receiptChoice = btn;
      setScreen(lab, ctx, d, disp, 'receipt-sent', { advanceMs: 1_500 });
      return;
    case 'No Receipt':
      o.receiptChoice = 'No Receipt';
      afterReceipt(lab, ctx, owner, d, disp);
      return;
    case 'Scan for receipt':
      if (!five) return;
      o.receiptChoice = 'Scan for receipt';
      setScreen(lab, ctx, d, disp, 'receipt-options', { params: { qrEnlarged: true }, advanceMs: 3_000 });
      return;
  }
}

/** After the receipt step: Duo CFD → receipt-done (Done required); otherwise thank-you. */
function afterReceipt(lab: LabState, ctx: Ctx, owner: TerminalDevice, d: TerminalDevice, disp: Disp): void {
  if (disp === 'secondary') setScreen(lab, ctx, d, disp, 'receipt-done');
  else thankYou(lab, ctx, owner, d, disp);
}

function thankYou(lab: LabState, ctx: Ctx, owner: TerminalDevice, d: TerminalDevice, disp: Disp): void {
  const o = owner.order!;
  setScreen(lab, ctx, d, disp, 'thank-you', { advanceMs: disp === 'secondary' ? 3_000 : 2_000, afterRender: true });
  ctx.emit('device.transactionCompleted', { deviceId: owner.id, orderId: o.id, totalCents: o.totalCents, approved: true, receiptChoice: o.receiptChoice, authCode: o.authCode ?? undefined, entry: o.entry });
}

/** Thank-you over: customer side idle, merchant side back to Register. */
function finish(lab: LabState, ctx: Ctx, d: TerminalDevice, disp: Disp): void {
  const owner = ownerOf(lab, d);
  if (isSplit(lab, owner)) {
    setScreen(lab, ctx, d, disp, 'customer-idle');
    setScreen(lab, ctx, owner, 'primary', 'register');
    toast(lab, ctx, owner, 'primary', TOAST.paymentComplete);
  } else {
    owner.order = newOrder(owner);
    setScreen(lab, ctx, d, disp, 'register');
  }
}

/** A display's auto-advance time has come (Sim §3.9.3 timings). */
export function autoAdvance(lab: LabState, ctx: Ctx, d: TerminalDevice, disp: Disp): void {
  const ds = dispOf(d, disp)!;
  ds.autoAdvanceAtMs = null;
  const owner = ownerOf(lab, d);
  switch (ds.screen) {
    case 'processing':
      if (owner.order) approve(lab, ctx, owner);
      return;
    case 'approved':
      setScreen(lab, ctx, d, disp, 'receipt-options');
      return;
    case 'printing':
    case 'receipt-sent':
      afterReceipt(lab, ctx, owner, d, disp);
      return;
    case 'receipt-options':
      if (ds.params.qrEnlarged) afterReceipt(lab, ctx, owner, d, disp);
      return;
    case 'thank-you':
      finish(lab, ctx, d, disp);
      return;
    case 'declined':
      if (owner.order) owner.order.status = 'awaiting-card';
      setScreen(lab, ctx, d, disp, 'payment-prompt', { params: { amount: owner.order?.totalCents ?? 0 } });
      return;
    case 'pin-entry':
      if (owner.order) decline(lab, ctx, owner, DECLINE.timedOut);
      return;
    case 'waiting-for-customer':
      if (ds.params.connecting) setScreen(lab, ctx, d, disp, 'review-order');
      return;
    case 'waiting-for-merchant': {
      const o = owner.order;
      setScreen(lab, ctx, d, disp, o && (o.status === 'review' || o.status === 'awaiting-tender') ? 'customer-cart' : 'customer-idle');
      return;
    }
  }
}

/** Printer payload (+2.5 s after Print, Sim §3.9.3): the receipt document. */
export function printPayload(lab: LabState, ctx: Ctx, deviceId: string, ownerId: string, qr: boolean): void {
  const d = lab.devices[deviceId];
  const owner = lab.devices[ownerId];
  if (!d || !owner?.order || d.power !== 'on') return;
  const o = owner.order;
  const m = merchantOf(lab, owner);
  const prof = o.cardProfileId != null ? lab.orca.cardProfiles[o.cardProfileId] : undefined;
  const doc: ReceiptDoc = {
    merchantName: m?.displayName ?? 'LabSim',
    address: m?.address ?? RECEIPT_ADDRESS,
    printedAtMs: lab.time.nowMs,
    orderId: o.id,
    lines: o.lines.map((l) => ({ name: l.name, qty: l.qty, priceCents: l.priceCents })),
    subtotalCents: o.subtotalCents,
    taxCents: o.taxCents,
    taxRateBp: m?.taxRateBp ?? 0,
    cardAdjustCents: o.cardAdjustCents,
    cardAdjustBp: m?.cardAdjustBp ?? 0,
    tipCents: o.tipCents,
    tipPct: o.tipPct,
    totalCents: o.totalCents,
    currency: m?.currency ?? 'USD',
    brand: o.tender === 'cash' ? null : (prof?.brand ?? null),
    panLast4: o.tender === 'cash' || !prof ? null : prof.pan.slice(-4),
    entry: o.tender === 'cash' ? null : o.entry,
    authCode: o.authCode,
    approved: true,
    qr,
  };
  const text = receiptText(doc, lab.time);
  d.lastReceiptDoc = doc;
  d.lastReceipt = text;
  d.printer.lastPayloadMs = lab.time.physMs;
  ctx.emit('device.receiptPrinted', { deviceId: d.id, orderId: o.id, totalCents: o.totalCents, text });
}

/* ────────────────────────────── cards (Sim §3.6 #10, §3.9.3) ────────────────────────────── */

function luhn(pan: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = pan.length - 1; i >= 0; i--) {
    let n = Number(pan[i]);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return pan.length > 0 && sum % 10 === 0;
}

const T1 = /^%B(\d{12,19})\^([^^]{2,26})\^(\d{4})(\d{3})[^?]*\?/;
const T2 = /;(\d{12,19})=(\d{4})(\d{3})[^?]*\?/;

/** Swipe Track Data validation (Sim §3.6): both tracks, same PAN, Luhn, expiry ≥ 2610. */
export function trackDataValid(track: string | null): boolean {
  if (!track) return false;
  const a = T1.exec(track);
  const b = T2.exec(track);
  if (!a || !b) return false;
  if (a[1] !== b[1]) return false;
  if (!luhn(a[1]!)) return false;
  return Number(a[3]) >= 2610;
}

/** Dip/Tap card file validation: JSON with `pan`, `expiry`, `aid`. */
export function cardFileValid(text: string | null): boolean {
  if (!text) return false;
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    return typeof j.pan === 'string' && typeof j.expiry === 'string' && typeof j.aid === 'string';
  } catch {
    return false;
  }
}

export interface CardEventOpts {
  /** Dip arm misaligned on the presenting rig: the ribbon strikes the bezel (INC16). */
  misaligned?: boolean;
  /** Text of the card definition file Callus loaded (DIP/TAP). */
  cardFile?: string | null;
  /** Physical test card / SDK injection: skip track/file validation. */
  trusted?: boolean;
}

/** A card event reaches the customer display (Sim §3.6 #10). Returns the error code or null. */
export function cardEvent(lab: LabState, ctx: Ctx, d: TerminalDevice, disp: Disp, profile: CardProfile, entry: CardEntry, opts: CardEventOpts = {}): string | null {
  const ds = dispOf(d, disp);
  const report = (ok: boolean, error?: string) => ctx.emit('device.cardPresented', error ? { deviceId: d.id, entry, profileId: profile.id, ok, error } : { deviceId: d.id, entry, profileId: profile.id, ok });
  if (!ds || d.power !== 'on' || ds.screen !== 'payment-prompt') {
    logcat(d, 'W CardReader: Card not expected');
    report(false, 'Card not expected');
    return 'Card not expected';
  }
  const owner = ownerOf(lab, d);
  const o = owner.order;
  if (!o) return 'Card not expected';
  if (entry === 'DIP' && opts.misaligned) {
    logcat(d, 'E CardReader: CHIP_READ_ERROR');
    toast(lab, ctx, d, disp, TOAST.cardRead);
    report(false, 'CHIP_READ_ERROR');
    return 'CHIP_READ_ERROR';
  }
  if (!opts.trusted) {
    if (entry === 'SWIPE' && !trackDataValid(profile.trackData)) {
      logcat(d, 'E CardReader: SWIPE_ERROR: invalid track data');
      toast(lab, ctx, d, disp, TOAST.cardRead);
      report(false, 'SWIPE_ERROR: invalid track data');
      return 'SWIPE_ERROR: invalid track data';
    }
    if (entry !== 'SWIPE' && !cardFileValid(opts.cardFile ?? (profile.gortPath ? gortFileText(lab, profile.gortPath) : null))) {
      logcat(d, 'E CardReader: CHIP_READ_ERROR');
      toast(lab, ctx, d, disp, TOAST.cardRead);
      report(false, 'CHIP_READ_ERROR');
      return 'CHIP_READ_ERROR';
    }
  }
  const m = merchantOf(lab, owner);
  d.cardPresent = entry;
  if (m && !m.acceptedBrands.includes(profile.brand)) {
    decline(lab, ctx, owner, DECLINE.notSupported);
    report(false, DECLINE.notSupported);
    return DECLINE.notSupported;
  }
  if (Number(profile.expiry) < 2610) {
    decline(lab, ctx, owner, DECLINE.expired);
    report(false, DECLINE.expired);
    return DECLINE.expired;
  }
  o.entry = entry;
  o.cardProfileId = profile.id;
  if (o.tender == null) o.tender = 'card';
  recompute(o, m);
  logcat(d, `I CardReader: ${entry} ${profile.brand} •••• ${profile.pan.slice(-4)} read OK`);
  report(true);
  const pinRequired = !!m && !m.pinBypass && ((entry === 'DIP' && (profile.requiresPin || m.country === 'CA')) || (entry === 'TAP' && profile.requiresPin && o.totalCents >= 10_000));
  if (pinRequired && !lab.flags.softwarePinBypass) {
    o.status = 'awaiting-pin';
    setScreen(lab, ctx, d, disp, 'pin-entry', { params: { typed: '' }, advanceMs: 60_000 });
    return null;
  }
  afterPin(lab, ctx, owner);
  return null;
}

/** device.stage helper: drive straight to approved (held) with a synthetic Visa swipe (Sim §4.4.1). */
export function stageApproved(lab: LabState, ctx: Ctx, owner: TerminalDevice, hold: boolean): void {
  const o = owner.order!;
  o.entry = 'SWIPE';
  o.cardProfileId = 1;
  o.tender = 'card';
  o.tipPct = null;
  o.tipCents = 0;
  recompute(o, merchantOf(lab, owner));
  approve(lab, ctx, owner, hold);
}

/* ────────────────────────────── keys & text ────────────────────────────── */

export function pressKey(lab: LabState, ctx: Ctx, d: TerminalDevice, key: 'HOME' | 'WAKEUP' | 'ENTER' | 'BACK', source: 'adb' | 'player'): void {
  const ds = d.display;
  if (d.power !== 'on') return;
  switch (key) {
    case 'WAKEUP':
      if (ds.brightness < 1) {
        ds.brightness = 1;
        ds.rev += 1;
      }
      return;
    case 'HOME': {
      if (ds.screen === 'lock') return;
      const owner = ownerOf(lab, d);
      if (d.role === 'cfd') {
        // The pay-display app's idle screen; while the MFD link is down it keeps waiting (Sim §3.8.6).
        const mfd = d.tetheredTo ? lab.devices[d.tetheredTo] : undefined;
        setScreen(lab, ctx, d, 'primary', mfd && mfd.payDisplayLink === 'DOWN' ? 'waiting-for-merchant' : 'customer-idle');
        return;
      }
      if (owner.order && owner.order.status !== 'paid' && owner.order.status !== 'open') retractCard(lab, owner);
      owner.order = null;
      if (d.launcher.page !== 0) d.launcher.page = 0;
      setScreen(lab, ctx, d, 'primary', 'home');
      if (d.secondaryDisplay) setScreen(lab, ctx, d, 'secondary', 'customer-idle');
      return;
    }
    case 'BACK': {
      if (ds.screen === 'review-order') press(lab, ctx, d, 'primary', 'Back');
      else if (ds.screen === 'tender-select') press(lab, ctx, d, 'primary', 'Cancel');
      else if (ds.screen.startsWith('app-') || ds.screen === 'register') {
        if (ds.screen === 'register') ownerOf(lab, d).order = null;
        setScreen(lab, ctx, d, 'primary', 'home');
      }
      return;
    }
    case 'ENTER': {
      if (ds.screen === 'lock' && ds.params.pad) checkPasscode(lab, ctx, d, 'primary');
      else if (ds.screen === 'tip-custom') press(lab, ctx, d, 'primary', 'Enter');
      else if (ds.screen === 'pin-entry') {
        if (source === 'adb') logcat(d, 'W SecureTouch: injected input rejected');
        else press(lab, ctx, d, 'primary', 'Enter');
      }
      return;
    }
  }
}

export function enterText(lab: LabState, ctx: Ctx, d: TerminalDevice, text: string, source: 'adb' | 'player'): void {
  const ds = d.display;
  if (d.power !== 'on') return;
  if (ds.screen === 'pin-entry' && source === 'adb') {
    logcat(d, 'W SecureTouch: injected input rejected');
    return;
  }
  if (ds.screen === 'lock') {
    if (!ds.params.pad) setScreen(lab, ctx, d, 'primary', 'lock', { params: { pad: true, typed: '' }, instant: true });
    for (const ch of text) if (DIGITS.has(ch)) lockKey(lab, ctx, d, 'primary', ch);
    return;
  }
  for (const ch of text) if (DIGITS.has(ch)) press(lab, ctx, d, 'primary', ch);
}
