/**
 * Firmware layout resolution (Sim §2.10): runtime screen (+ display params) → the elements drawn on
 * that display. Pure — everything that changes what is drawn lives in `DisplayState.params`
 * (`page`, `dining`, `tips`, `printer`, `pad`, `qrEnlarged`) and `receiptOptions`, so render2d and the
 * hit test always agree ("drawn = hit", ARCHITECTURE rule 6).
 *
 * `firmwareButtons(type, screen, display, params, receiptOptions)` is auto-detected by
 * `src/render2d/deviceScreens/layouts.ts` (provider contract: centre-based rects in mm).
 */
import type { DeviceTypeCode, ScreenName } from '../../types';
import { layoutIdFor, screenOf } from '../deviceTypes';
import { LAYOUTS, coreMm } from './tables';
import type { LayoutEl } from './tables';

export { LAYOUTS, coreMm, GENERIC_ORCA_SCREENS, CFD_ORCA_SCREENS, ORCA_SCREEN_DESCRIPTIONS } from './tables';
export type { LayoutEl, LayoutDef, ElementKind } from './tables';

type Params = Readonly<Record<string, string | number | boolean>>;

/** A resolved element with visibility/enabled flags (Sim §3.5.4 disabled/hidden buttons). */
export interface ResolvedEl extends LayoutEl {
  enabled: boolean;
}

/** Layout table key for a runtime screen (null = no firmware table; generic labels only). */
export function layoutKey(screen: ScreenName, display: 'primary' | 'secondary', receiptOptions: 4 | 5 | undefined, params: Params): string | null {
  switch (screen) {
    case 'home':
      return params.page === 1 ? 'HOME_P1' : 'HOME';
    case 'register':
      return 'REGISTER_HOME';
    case 'review-order':
      return 'REVIEW_ORDER';
    case 'tender-select':
      return 'PAYMENT';
    case 'cash-discount-tender':
      return 'TENDER_CASH_DISCOUNT';
    case 'payment-prompt':
      return 'PAYMENT_PROMPT';
    case 'pin-entry':
    case 'tip-custom':
      return 'PIN_ENTRY';
    case 'lock':
      return params.pad ? 'PIN_ENTRY' : null;
    case 'tip':
      return 'TIP';
    case 'signature':
      return 'SIGNATURE';
    case 'approved':
      return 'APPROVED';
    case 'receipt-options':
      return receiptOptions === 5 ? 'RECEIPT_OPTIONS_5' : 'RECEIPT_OPTIONS_4';
    case 'customer-cart':
      return 'CUSTOMER_CART';
    case 'receipt-done':
      return 'CFD_RECEIPT_DONE';
    case 'thank-you':
      return display === 'secondary' ? 'CFD_THANK_YOU' : 'THANK_YOU';
    default:
      return null;
  }
}

/**
 * Orca screen name for what a display shows (Sim §2.10.1), e.g. `RECEIPT_OPTIONS_5`, `CFD_CART`.
 * null for non-automated screens.
 */
export function orcaScreenName(screen: ScreenName, display: 'primary' | 'secondary', receiptOptions: 4 | 5 | undefined): string | null {
  const key = layoutKey(screen, display, receiptOptions, {});
  if (!key || key === 'HOME_P1' || key === 'THANK_YOU') return key === 'HOME_P1' ? 'HOME' : null;
  if (display === 'secondary') {
    if (key === 'CUSTOMER_CART') return 'CFD_CART';
    return key.startsWith('CFD_') ? key : `CFD_${key}`;
  }
  return key;
}

/** Generic message labels for screens without a firmware table [illus. placement]. */
function genericLabels(screen: ScreenName, w: number, h: number, params: Params): LayoutEl[] {
  const lines: string[] = [];
  switch (screen) {
    case 'boot':
      lines.push('lab');
      break;
    case 'lock':
      lines.push('@clock', '@date');
      break;
    case 'customer-idle':
      lines.push('Welcome', '@merchant');
      break;
    case 'waiting-for-merchant':
      lines.push('Waiting for merchant device…');
      break;
    case 'waiting-for-customer':
      lines.push(params.connecting ? 'Connecting to customer display…' : 'Customer is paying…');
      break;
    case 'processing':
      lines.push('Processing…');
      break;
    case 'declined':
      lines.push('Declined', '@reason');
      break;
    case 'printing':
      lines.push('Printing receipt…');
      break;
    case 'receipt-sent':
      lines.push('Receipt sent');
      break;
    case 'deprovisioning':
      lines.push('De-provisioning…');
      break;
    case 'oobe-welcome':
      lines.push('Welcome to LabSim', 'Language');
      break;
    case 'oobe-network':
      lines.push('Network', 'lab-ethernet');
      break;
    case 'oobe-merchant':
      lines.push('Merchant sign-in', '@mid');
      break;
    case 'oobe-employee':
      lines.push('Employee passcode');
      break;
    case 'oobe-payments':
      lines.push('Payments');
      break;
    case 'oobe-complete':
      lines.push('Setup complete');
      break;
    case 'error':
      lines.push('@error');
      break;
    default:
      if (screen.startsWith('app-')) lines.push('@appTitle');
  }
  const lw = Math.round(w * 0.7 * 10) / 10;
  const lh = Math.round(h * 0.07 * 10) / 10;
  return lines.map((id, i) => ({ id, kind: 'label' as const, x: Math.round((w / 2) * 10) / 10, y: Math.round((h * 0.4 + i * lh * 1.4) * 10) / 10, w: lw, h: lh }));
}

/**
 * Elements drawn on a display for its current screen (buttons, labels with `@` placeholders, pad, QR).
 * Applies the param-driven variations: launcher page, `App Market` ↔ `LabSim Dining`, merchant tip
 * percents (hidden buttons), printerless `Print` (rendered, disabled), enlarged QR.
 */
export function resolveElements(type: DeviceTypeCode, display: 'primary' | 'secondary', screen: ScreenName, params: Params, receiptOptions: 4 | 5 | undefined): ResolvedEl[] {
  const layout = LAYOUTS[layoutIdFor(type, display)];
  const key = layoutKey(screen, display, receiptOptions, params);
  const table = key ? layout.screens[key] : undefined;
  if (!table) {
    const scr = screenOf(type, display);
    return genericLabels(screen, scr.wMm, scr.hMm, params).map((e) => ({ ...e, enabled: true }));
  }
  const tips = typeof params.tips === 'string' ? params.tips.split(',').filter(Boolean) : null;
  const out: ResolvedEl[] = [];
  for (const el of table) {
    let e: LayoutEl = el;
    if (screen === 'home' && el.id === 'App Market' && params.dining) e = { ...el, id: 'LabSim Dining' };
    if (screen === 'tip' && tips && /^\d+%$/.test(el.id) && !tips.includes(el.id.slice(0, -1))) continue; // hidden
    if (screen === 'receipt-options' && params.qrEnlarged && el.kind !== 'qr') continue;
    if (screen === 'lock' && el.id === 'Cancel') continue;
    const enabled = !(screen === 'receipt-options' && el.id === 'Print' && params.printer === false);
    out.push({ ...e, enabled });
  }
  if (screen === 'receipt-options' && params.qrEnlarged) {
    const q = out.find((e) => e.kind === 'qr');
    if (q) {
      q.w *= 3;
      q.h *= 3;
      q.y = layout.hMm / 2;
    }
  }
  return out;
}

/**
 * render2d firmware-layout provider (auto-detected by name). Centre-based rects in mm for every
 * button, the signature pad (`pad`) and the QR block (`qr`). Labels are drawn by render2d itself.
 */
export function firmwareButtons(
  type: DeviceTypeCode,
  screen: string,
  display: 'primary' | 'secondary' = 'primary',
  params: Params = {},
  receiptOptions: 4 | 5 = 4,
): { id: string; x: number; y: number; w: number; h: number; centred: true; enabled: boolean; kind: string }[] {
  return resolveElements(type, display, screen as ScreenName, params ?? {}, receiptOptions)
    .filter((e) => e.kind !== 'label')
    .map((e) => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, centred: true as const, enabled: e.enabled, kind: e.kind }));
}
