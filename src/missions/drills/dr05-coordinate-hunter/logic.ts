/**
 * DR05 Coordinate Hunter (GP §2.4.3, Cur M15/M16): a 1280×800 screenshot inside a GIMP-style frame (rulers,
 * Tool Options with live Position and Size). Prompt: "Box `TOTAL $10.83`". Edge error e = mean |px error| of
 * the 4 edges: e ≤ 1 → 150; ≤ 3 → 100; ≤ 6 → 50; else 0 (the overlay shows the target).
 * - Mode A: draw the box.
 * - Mode B (after the first Gold): also convert the button's centre to Screen Location mm with the Device
 *   Type's px/mm (±0.5 mm). Only device screenshots (screencaps) — never the webcam snapshot.
 * - Mode C: also type the Pigeon block `{"x":…, "y":…, "w":…, "h":…, "expected":"…"}` (Cur M15/M16 keys).
 *
 * Screens: the R2-D2 CFD webcam snapshot (Cur M16 target `TOTAL $10.83` at 412, 288, 236 × 44 — S10) and Mini 3
 * screencaps built from the sim's MINI_GEN3 firmware tables (mm → px with MINI_3's px/mm, Sim §2.2), so the
 * mm answers match the lab's Screen Locations. Facts: F030, F212, F153, F142, F155.
 * Scoring (custom): edge points × streak multiplier (an item counts as correct at e ≤ 3); modes B/C add +100
 * (× multiplier) when the conversion / block is right. 90 s round (boxing to the pixel needs the zoom loupe).
 */
import type { RootState } from '@/core/state';
import { DEVICE_TYPES } from '@/sim/seed/deviceTypes';
import { LAYOUTS, type LayoutEl } from '@/sim/seed/layouts/tables';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { edgeError, edgeErrorPoints, streakMultiplier } from '../common/scoring';
import { pick, recentKeys, type RngState } from '../common/rng';
import { teach } from '../common/teach';

export const SHOT_W = 1280;
export const SHOT_H = 800;

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShotEl extends PxRect {
  id: string;
  kind: 'button' | 'field' | 'text' | 'qr' | 'bar';
  text: string;
  /** Can be asked for. */
  target: boolean;
  /** Visual accent for buttons. */
  tone?: 'primary' | 'plain' | 'danger';
  /** Text size in px. */
  size?: number;
  align?: 'left' | 'center' | 'right';
}

export type ShotId = 'duo-cfd-cart' | 'mini3-receipt5' | 'mini3-register' | 'mini3-payment' | 'mini3-tender' | 'mini3-tip';

export interface Shot {
  id: ShotId;
  file: string;
  /** Where the screenshot came from. */
  source: 'webcam' | 'screencap';
  deviceType: 'STATION_DUO' | 'MINI_3';
  title: string;
  els: ShotEl[];
}

/** MINI_3 px/mm (Sim §2.2: screencap px = round(mm × pxPerMm)). */
export const PX_PER_MM = DEVICE_TYPES.MINI_3.pxPerMm ?? { x: 1280 / 172.3, y: 800 / 107.7 };

function fromLayout(e: LayoutEl, tone: ShotEl['tone'] = 'plain'): ShotEl {
  const x = Math.round((e.x - e.w / 2) * PX_PER_MM.x);
  const y = Math.round((e.y - e.h / 2) * PX_PER_MM.y);
  const w = Math.round(e.w * PX_PER_MM.x);
  const h = Math.round(e.h * PX_PER_MM.y);
  return { id: e.id, kind: e.kind === 'qr' ? 'qr' : 'button', text: e.kind === 'qr' ? '' : e.id, x, y, w, h, target: e.kind === 'button', tone, size: Math.min(34, Math.round(h * 0.42)) };
}

const M3 = LAYOUTS.MINI_GEN3.screens;
const bar = (title: string): ShotEl => ({ id: 'bar', kind: 'bar', text: title, x: 0, y: 0, w: SHOT_W, h: 84, target: false });

export const SHOTS: Record<ShotId, Shot> = {
  'duo-cfd-cart': {
    id: 'duo-cfd-cart',
    file: 'r2d2_cfd.png',
    source: 'webcam',
    deviceType: 'STATION_DUO',
    title: 'R2-D2 CFD (webcam snapshot)',
    els: [
      { id: 'bar', kind: 'bar', text: 'Your order', x: 0, y: 0, w: SHOT_W, h: 84, target: false },
      { id: 'line1', kind: 'text', text: 'Tax Item 5', x: 96, y: 118, w: 260, h: 36, target: false, size: 26, align: 'left' },
      { id: 'line1p', kind: 'text', text: '$10.00', x: 700, y: 118, w: 160, h: 36, target: false, size: 26, align: 'right' },
      { id: 'subtotal', kind: 'field', text: 'Subtotal $10.00', x: 412, y: 176, w: 236, h: 40, target: true, size: 24 },
      { id: 'tax', kind: 'field', text: 'Tax $0.83', x: 412, y: 232, w: 236, h: 40, target: true, size: 24 },
      { id: 'total', kind: 'field', text: 'TOTAL $10.83', x: 412, y: 288, w: 236, h: 44, target: true, size: 28 },
      { id: 'hint', kind: 'text', text: 'Please follow the prompts on the merchant display', x: 300, y: 640, w: 680, h: 36, target: false, size: 24, align: 'center' },
    ],
  },
  'mini3-receipt5': { id: 'mini3-receipt5', file: 'bumblebee_receipt.png', source: 'screencap', deviceType: 'MINI_3', title: 'BUMBLEBEE · RECEIPT_OPTIONS_5', els: [bar('Receipt'), ...(M3.RECEIPT_OPTIONS_5 ?? []).map((e) => fromLayout(e))] },
  'mini3-register': {
    id: 'mini3-register',
    file: 'bumblebee_register.png',
    source: 'screencap',
    deviceType: 'MINI_3',
    title: 'BUMBLEBEE · REGISTER_HOME',
    els: (M3.REGISTER_HOME ?? []).filter((e) => e.kind === 'button').map((e) => fromLayout(e, e.id === 'Review Order' ? 'primary' : e.id === 'Register' ? 'plain' : 'plain')),
  },
  'mini3-payment': { id: 'mini3-payment', file: 'bumblebee_payment.png', source: 'screencap', deviceType: 'MINI_3', title: 'BUMBLEBEE · PAYMENT', els: [bar('Payment'), ...(M3.PAYMENT ?? []).filter((e) => e.kind === 'button').map((e) => fromLayout(e, e.id === 'Charge' ? 'primary' : e.id === 'Cancel' ? 'danger' : 'plain'))] },
  'mini3-tender': { id: 'mini3-tender', file: 'bumblebee_tender.png', source: 'screencap', deviceType: 'MINI_3', title: 'BUMBLEBEE · TENDER_CASH_DISCOUNT', els: [bar('Cash discount'), ...(M3.TENDER_CASH_DISCOUNT ?? []).map((e) => fromLayout(e, 'primary'))] },
  'mini3-tip': { id: 'mini3-tip', file: 'bumblebee_tip.png', source: 'screencap', deviceType: 'MINI_3', title: 'BUMBLEBEE · TIP', els: [bar('Add a tip'), ...(M3.TIP ?? []).map((e) => fromLayout(e, 'plain'))] },
};

export interface HuntData {
  shot: ShotId;
  targetId: string;
  /** The text to box / the Pigeon `expected` value. */
  expected: string;
  rect: PxRect;
  /** Screen Location centre in mm (mode B), null for webcam snapshots. */
  mm: { x: number; y: number } | null;
}

export type HuntMode = 'A' | 'B' | 'C';

export function huntItem(shot: Shot, el: ShotEl): DrillItem<HuntData> {
  const mm = shot.source === 'screencap' ? { x: Math.round(((el.x + el.w / 2) / PX_PER_MM.x) * 10) / 10, y: Math.round(((el.y + el.h / 2) / PX_PER_MM.y) * 10) / 10 } : null;
  const facts = ['F030', 'F212', 'F153'];
  return {
    id: `DR05:${shot.id}:${el.id}`,
    tags: ['pigeon.gimp', 'orca.screencompare', 'orca.screens'],
    factIds: facts,
    teach: teach(`Target: Position ${el.x}, ${el.y} · Size ${el.w} × ${el.h}`, 'GIMP: Rectangle Select hugging the element\'s edges, then read Position and Size in Tool Options — those numbers go into the Screen Compare row or the Pigeon block. A box a few pixels off is how OCR checks get brittle.', {
      ref: 'Ref §1.3, §5',
      factIds: facts,
      illustrative: true,
      tag: 'pigeon.gimp',
      doInstead: 'Zoom in (hold the loupe over each edge) and nudge with the arrow keys.',
    }),
    data: { shot: shot.id, targetId: el.id, expected: el.text, rect: { x: el.x, y: el.y, w: el.w, h: el.h }, mm },
  };
}

/** All askable (shot, element) pairs for a mode. */
export function targetsFor(mode: HuntMode): { shot: Shot; el: ShotEl }[] {
  const out: { shot: Shot; el: ShotEl }[] = [];
  for (const shot of Object.values(SHOTS)) {
    if (mode === 'B' && shot.source !== 'screencap') continue;
    for (const el of shot.els) if (el.target && el.w >= 20 && el.h >= 20) out.push({ shot, el });
  }
  return out;
}

export function modeOf(state: RootState | null): HuntMode {
  const m = state?.session?.drill?.mode;
  return m === 'B' || m === 'C' ? m : 'A';
}

/** Mode B: mm answer within ±0.5 mm on both axes. */
export function mmOk(data: HuntData, x: number, y: number): boolean {
  if (!data.mm) return false;
  return Math.abs(x - data.mm.x) <= 0.5 && Math.abs(y - data.mm.y) <= 0.5;
}

/** Mode C: strict JSON with exactly the Pigeon keys, values = your selection, `expected` = the exact text. */
export function checkBlock(text: string, drawn: PxRect, expected: string): { ok: boolean; why: string } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return { ok: false, why: `Not valid JSON (${(e as Error).message.split('\n')[0]}) — Pigeon has no linter, so check every comma and quote.` };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, why: 'The block must be one JSON object.' };
  const o = v as Record<string, unknown>;
  for (const k of ['x', 'y', 'w', 'h', 'expected']) if (!(k in o)) return { ok: false, why: `Missing "${k}".` };
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    if (typeof o[k] !== 'number') return { ok: false, why: `"${k}" must be a number, not ${JSON.stringify(o[k])}.` };
    if (o[k] !== drawn[k]) return { ok: false, why: `"${k}" is ${String(o[k])} but your selection says ${drawn[k]} — copy Tool Options exactly.` };
  }
  if (o.expected !== expected) return { ok: false, why: `"expected" must be exactly "${expected}" — a capitalisation change or a typo breaks the OCR check.` };
  return { ok: true, why: '' };
}

export interface HuntScore {
  e: number;
  edgePts: number;
  points: number;
  correct: boolean;
}

/** Points for a drawn box (+ the mode bonus when `bonusOk`). */
export function huntPoints(drawn: PxRect, target: PxRect, streakBefore: number, mode: HuntMode, bonusOk: boolean): HuntScore {
  const e = Math.round(edgeError(drawn, target) * 100) / 100;
  const edgePts = edgeErrorPoints(e);
  const boxOk = e <= 3;
  const mult = streakMultiplier(streakBefore);
  const bonus = mode !== 'A' && bonusOk ? 100 : 0;
  const correct = boxOk && (mode === 'A' || bonusOk);
  return { e, edgePts, points: Math.round((edgePts + bonus) * (correct ? mult : 1)), correct };
}

export function generateHunt(rng: RngState, state: RootState | null, index: number): DrillItem<HuntData> {
  const mode = modeOf(state);
  const all = targetsFor(mode);
  const recent = recentKeys(state, 6);
  // The canonical Cur M16 target opens every Mode A/C round.
  if (index === 0 && mode !== 'B') return huntItem(SHOTS['duo-cfd-cart'], SHOTS['duo-cfd-cart'].els.find((e) => e.id === 'total')!);
  const fresh = all.filter((t) => !recent.includes(`DR05:${t.shot.id}:${t.el.id}`));
  const t = pick(rng, fresh.length ? fresh : all);
  return huntItem(t.shot, t.el);
}

export const DR05: DrillDef<HuntData> = {
  id: 'DR05',
  name: 'Coordinate Hunter',
  format: 'GIMP-style screenshot: draw the box; score by edge error (B: convert to mm · C: type the Pigeon block)',
  tags: ['pigeon.gimp', 'orca.screens', 'orca.screencompare'],
  unlockedBy: ['M16'],
  durationS: 90,
  itemCount: null,
  medals: { bronze: 700, silver: 1300, gold: 1900 },
  scoring: 'custom',
  modes: [
    { id: 'A', title: 'Draw the box', unlock: 'always' },
    { id: 'B', title: 'Box + convert to mm', unlock: 'first-gold' },
    { id: 'C', title: 'Box + type the Pigeon block', unlock: 'first-gold' },
  ],
  generate: (rng, state, index) => generateHunt(rng, state, index),
  component: lazyDrill(() => import('./View'), '#9b7bff'),
};
