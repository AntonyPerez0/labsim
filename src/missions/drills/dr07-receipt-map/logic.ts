/**
 * DR07 Receipt Map (GP §2.4.3, Cur M09): a receipt-options render for a random Device Type.
 * Step 1 — map it: `RECEIPT_OPTIONS_4` or `RECEIPT_OPTIONS_5` (the 5th option "Scan for receipt" appears when
 * the QR feature is on, and every button sits 3.0 mm lower — S10). Step 2 — the robot is blind: with only
 * Orca's Screen Locations (mm from the top-left (0,0)), tap where the asked button sits. Tapping where it
 * sits on the *other* map = wrong, and the Teach Card shows both overlays.
 *
 * Layout truth = the sim's firmware tables (`src/sim/seed/layouts`, Sim §2.10.2), so the drill and the lab
 * agree; FLEX_4 values are the Cur §0.6 reference set (Print 71.0 → 74.0 mm).
 * Facts: F141, F142, F213, F214, F215, F216 (Ref §3.2, §5).
 */
import type { RootState } from '@/core/state';
import type { DeviceTypeCode } from '@/sim/types';
import { DEVICE_TYPES, primaryLayoutId } from '@/sim/seed/deviceTypes';
import { LAYOUTS, type LayoutEl } from '@/sim/seed/layouts/tables';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { chance, pick, recentKeys, weightedPick, type RngState } from '../common/rng';
import { teach } from '../common/teach';

export type ReceiptMap = 4 | 5;

export interface ReceiptButton {
  name: string;
  /** Centre + size, mm from the screen's top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ReceiptData {
  deviceType: DeviceTypeCode;
  layoutId: string;
  wMm: number;
  hMm: number;
  /** The map that matches the render. */
  map: ReceiptMap;
  /** Both maps (Orca keeps separate 4- and 5-option maps per device profile). */
  maps: Record<ReceiptMap, ReceiptButton[]>;
  /** QR block of the 5-option screen (mm, centre). */
  qr: { x: number; y: number; w: number; h: number } | null;
  /** The button step 2 asks for. */
  ask: string;
}

/** Device Types with a printer (a receipt-options screen with Print) — printerless Pocket/Compact/Duo 2/3 skipped. */
export const RECEIPT_TYPES: DeviceTypeCode[] = (Object.keys(DEVICE_TYPES) as DeviceTypeCode[]).filter((c) => DEVICE_TYPES[c].hasPrinter && !DEVICE_TYPES[c].upcoming);

const toBtn = (e: LayoutEl): ReceiptButton => ({ name: e.id, x: e.x, y: e.y, w: e.w, h: e.h });

export function receiptMaps(type: DeviceTypeCode): { maps: Record<ReceiptMap, ReceiptButton[]>; qr: ReceiptData['qr']; wMm: number; hMm: number; layoutId: string } {
  const lid = primaryLayoutId(type);
  const L = LAYOUTS[lid];
  const four = (L.screens.RECEIPT_OPTIONS_4 ?? []).filter((e) => e.kind === 'button').map(toBtn);
  const fiveAll = L.screens.RECEIPT_OPTIONS_5 ?? [];
  const five = fiveAll.filter((e) => e.kind === 'button').map(toBtn);
  const q = fiveAll.find((e) => e.kind === 'qr');
  return { maps: { 4: four, 5: five }, qr: q ? { x: q.x, y: q.y, w: q.w, h: q.h } : null, wMm: L.wMm, hMm: L.hMm, layoutId: lid };
}

/** Vertical tolerance of a tap (mm): a tap must land within ±1.5 mm of the row centre — 3.0 mm off is the gap. */
export const TAP_TOL_Y = 1.5;

export type TapResult = 'hit' | 'other-map' | 'wrong-button' | 'miss';

/** Grade a step-2 tap at (x, y) mm against the chosen map. */
export function gradeTap(data: ReceiptData, x: number, y: number): { result: TapResult; on: string | null } {
  const inBtn = (b: ReceiptButton) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= Math.min(TAP_TOL_Y, b.h / 2);
  const right = data.maps[data.map];
  const other = data.maps[data.map === 4 ? 5 : 4];
  const target = right.find((b) => b.name === data.ask);
  if (target && inBtn(target)) return { result: 'hit', on: target.name };
  const otherSame = other.find((b) => b.name === data.ask);
  if (otherSame && inBtn(otherSame)) return { result: 'other-map', on: otherSame.name };
  const wrong = right.find(inBtn);
  if (wrong) return { result: 'wrong-button', on: wrong.name };
  return { result: 'miss', on: null };
}

const FACTS = ['F213', 'F215', 'F216', 'F142'];

export function receiptItem(type: DeviceTypeCode, map: ReceiptMap, ask: string): DrillItem<ReceiptData> {
  const m = receiptMaps(type);
  const b4 = m.maps[4].find((b) => b.name === ask);
  const b5 = m.maps[5].find((b) => b.name === ask);
  const shift = b4 && b5 ? Math.round((b5.y - b4.y) * 10) / 10 : 3;
  const right = map === 4 ? b4 : b5;
  const where = right ? `(${right.x.toFixed(1)}, ${right.y.toFixed(1)}) mm` : '';
  const why =
    map === 5
      ? `The "Scan for receipt" QR feature adds a conditional 5th option and pushes the buttons ${shift.toFixed(1)} mm lower, so Orca keeps a separate RECEIPT_OPTIONS_5 map${b4 ? ` (${ask} ${b4.y.toFixed(1)} → ${b5?.y.toFixed(1)} mm)` : ''}.`
      : 'No QR block and four options: the original RECEIPT_OPTIONS_4 map. Orca keeps 4- and 5-option maps side by side for every device profile.';
  return {
    id: `DR07:${type}:${map}:${ask}`,
    tags: ['receipt.maps', 'receipt.qr', 'orca.screens'],
    factIds: map === 5 ? [...FACTS, 'F214'] : FACTS,
    teach: teach(`RECEIPT_OPTIONS_${map}: ${ask} at ${where}`, why, { ref: 'Ref §5, §3.2', factIds: map === 5 ? [...FACTS, 'F214'] : FACTS, doInstead: 'Count the options (QR = 5-option map), then tap the row from that map.', illustrative: true, tag: 'receipt.maps' }),
    data: { deviceType: type, layoutId: m.layoutId, wMm: m.wMm, hMm: m.hMm, map, maps: m.maps, qr: m.qr, ask },
  };
}

export function generateReceipt(rng: RngState, state: RootState | null, index: number): DrillItem<ReceiptData> {
  const recent = recentKeys(state, 3);
  for (let tries = 0; tries < 6; tries++) {
    // FLEX_4 (the Cur §0.6 reference set) twice as often; later items favour the 5-option trap.
    const type = weightedPick(rng, RECEIPT_TYPES, (t) => (t === 'FLEX_4' ? 3 : 1));
    const map: ReceiptMap = chance(rng, index < 2 ? 0.5 : 0.6) ? 5 : 4;
    const names = receiptMaps(type).maps[map].map((b) => b.name);
    const ask = pick(rng, names.length ? names : ['Print']);
    const it = receiptItem(type, map, ask);
    if (!recent.includes(it.id) || tries === 5) return it;
  }
  return receiptItem('FLEX_4', 5, 'Print');
}

export const DR07: DrillDef<ReceiptData> = {
  id: 'DR07',
  name: 'Receipt Map',
  format: 'Receipt render: choose RECEIPT_OPTIONS_4/_5, then tap the asked button',
  tags: ['receipt.maps', 'receipt.qr', 'orca.screens'],
  unlockedBy: ['M09'],
  durationS: 60,
  itemCount: null,
  medals: { bronze: 900, silver: 1600, gold: 2300 },
  scoring: 'standard',
  generate: (rng, state, index) => generateReceipt(rng, state, index),
  component: lazyDrill(() => import('./View'), '#4aa8ff'),
};
