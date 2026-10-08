/**
 * Per-draw context for a device display: the two millimetre drawing contexts (base layout class
 * space for decoration, target space for the firmware buttons), the effective buttons and the
 * order / merchant data the screen shows.
 */
import { LAYOUT_CLASS_SIZE_MM, LAYOUT_DERIVATION, currencyPrefix, layoutClassFor, type DisplayRenderOptions, type LayoutClass } from '../api';
import type { TerminalDevice, DisplayState, LabState, MerchantConfig, OrderState } from '@/sim/types';
import { screenOf } from '@/sim/seed/deviceTypes';
import { MmCtx, money } from '../shared/theme';
import { effectiveButtons, type Btn, type LayoutQuery } from './layouts';

export interface OrderView {
  id: string;
  lines: { name: string; qty: number; priceCents: number; taxable: boolean }[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
}

export interface ScreenCtx {
  ctx: CanvasRenderingContext2D;
  /** Base layout class drawing context (P for P-s, L8 for L14). */
  m: MmCtx;
  /** Target-class mm context (identity positions, same font scale). */
  t: MmCtx;
  cls: LayoutClass;
  base: 'P' | 'L8';
  /** Base-class size (mm). */
  W: number;
  H: number;
  /** Physical/target size (mm) of the canvas. */
  TW: number;
  TH: number;
  lab: LabState;
  device: TerminalDevice;
  display: DisplayState;
  params: Readonly<Record<string, string | number | boolean>>;
  btns: Btn[];
  order: OrderView;
  prefix: string;
  merchant: MerchantConfig | null;
  merchantName: string;
  timeMs: number;
  opts: DisplayRenderOptions;
  fmt(cents: number): string;
}

const DEFAULT_ORDER: OrderView = {
  id: 'ORD-1001',
  lines: [{ name: 'Tax Item 5', qty: 1, priceCents: 1000, taxable: true }],
  subtotal: 1000,
  tax: 83,
  tip: 0,
  total: 1083,
};

export function orderView(o: OrderState | null | undefined): OrderView {
  if (!o) return DEFAULT_ORDER;
  return {
    id: o.id,
    lines: (o.lines ?? []).map((l) => ({ name: l.name, qty: l.qty, priceCents: l.priceCents, taxable: l.taxable })),
    subtotal: o.subtotalCents ?? 0,
    tax: o.taxCents ?? 0,
    tip: o.tipCents ?? 0,
    total: o.totalCents ?? 0,
  };
}

export function merchantOf(lab: LabState, device: TerminalDevice): MerchantConfig | null {
  const id = device.merchantConfigId;
  if (id === null || id === undefined) return null;
  return lab.orca?.merchants?.[id] ?? null;
}

/**
 * Size (mm) of a display: the SIM's screen size for the device type (Sim §2.2 — the firmware layouts
 * are defined in it, Sim Appendix C), falling back to the layout class's World §4 size.
 */
export function displaySizeMm(device: TerminalDevice, display: 'primary' | 'secondary'): { w: number; h: number; cls: LayoutClass } | null {
  const cls = layoutClassFor(device.type, display);
  if (!cls) return null;
  const s = LAYOUT_CLASS_SIZE_MM[cls];
  try {
    const sim = screenOf(device.type, display);
    if (sim && sim.wMm > 0 && sim.hMm > 0) return { w: sim.wMm, h: sim.hMm, cls };
  } catch {
    /* unknown type: class size */
  }
  return { w: s.w, h: s.h, cls };
}

export function buildScreenCtx(ctx: CanvasRenderingContext2D, lab: LabState, device: TerminalDevice, which: 'primary' | 'secondary', opts: DisplayRenderOptions): ScreenCtx | null {
  const ds = displaySizeMm(device, which);
  if (!ds) return null;
  const display = (which === 'secondary' ? device.secondaryDisplay : device.display) ?? device.display;
  const cls = ds.cls;
  const base: 'P' | 'L8' = cls === 'P' || cls === 'P-s' ? 'P' : 'L8';
  // decoration is authored in the base class (P 68 × 136 / L8 172.3 × 107.7) and stretched to the
  // display's real size (World §4.2 derivation generalised: P-s and L14 reproduce LAYOUT_DERIVATION)
  const baseSz = LAYOUT_CLASS_SIZE_MM[base];
  const sx = ds.w / baseSz.w;
  const sy = ds.h / baseSz.h;
  const d = { sx, sy, font: Math.min(sx, sy) };
  void LAYOUT_DERIVATION;
  // px/mm from the canvas itself (callers may size it from another table); a differing vertical
  // scale is applied as a transform so nothing is clipped
  const k = ctx.canvas.width / ds.w;
  const ky = ctx.canvas.height / ds.h;
  if (Math.abs(ky / k - 1) > 0.004) ctx.setTransform(1, 0, 0, ky / k, 0, 0);
  if (Math.abs(k - opts.pxPerMm) > 1e-6) opts = { ...opts, pxPerMm: k };
  const m = new MmCtx(ctx, k, d.sx, d.sy, d.font);
  const t = m.identity();
  const merchant = merchantOf(lab, device);
  const prefix = currencyPrefix(merchant?.country ?? null);
  const params = display?.params ?? {};
  const devAny = device as TerminalDevice & { launcher?: { page?: number } };
  const scroll = Number(params.page ?? params.scroll ?? devAny.launcher?.page ?? 0) || 0;
  const order = orderView(device.order);
  const listRows = ['#1001', '#1002', '#1003', '#1004', '#1005', '#1006'];
  const q: LayoutQuery = {
    type: device.type,
    display: which,
    cls,
    screen: display?.screen ?? 'off',
    params,
    receiptOptions: display?.receiptOptions === 5 ? 5 : display?.receiptOptions === 4 ? 4 : lab.flags?.receiptQrFeature ? 5 : 4,
    apps: device.apps ?? [],
    scroll,
    listRows,
  };
  const btns = effectiveButtons(q);
  const baseSize = LAYOUT_CLASS_SIZE_MM[base];
  return {
    ctx,
    m,
    t,
    cls,
    base,
    W: baseSize.w,
    H: baseSize.h,
    TW: ds.w,
    TH: ds.h,
    lab,
    device,
    display,
    params,
    btns,
    order,
    prefix,
    merchant,
    merchantName: (merchant as (MerchantConfig & { displayName?: string }) | null)?.displayName ?? merchant?.name ?? 'Lab Test Merchant',
    timeMs: opts.timeMs ?? 0,
    opts,
    fmt: (c: number) => money(c, prefix),
  };
}

export function findBtn(sc: ScreenCtx, id: string): Btn | undefined {
  return sc.btns.find((x) => x.id === id);
}
