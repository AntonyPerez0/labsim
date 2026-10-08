/**
 * Firmware tap points (button centres, mm from the screen's top-left) per layout family — Sim §2.10.2.
 * This is the data behind `gort/config/screen-locations/<DEVICE_TYPE>/<SCREEN>.json` (factory = no
 * drift) and the ground truth Jared's scripted review compares against (±0.5 mm, Sim §3.22.2).
 * Kept in sim-devops so the repo seed does not depend on sim-core's layout module.
 */
import type { DeviceTypeCode } from '../../types';

export type ButtonMap = Record<string, { x: number; y: number }>;
type Family = 'FLEX_GEN3' | 'FLEX_GEN2' | 'FLEX_GEN1' | 'COMPACT' | 'MINI_GEN3' | 'MINI_GEN2' | 'STATION';

const APPS = ['Orders', 'Transactions', 'Register', 'Setup', 'Sale', 'Authorizations', 'Customers', 'Inventory', 'Settings', 'App Market'];
const MINI_APPS = ['Register', 'Orders', 'Transactions', 'Setup', 'Sale', 'Authorizations', 'Customers', 'Inventory', 'Settings', 'App Market'];

function grid(names: string[], xs: number[], ys: number[]): ButtonMap {
  const out: ButtonMap = {};
  let i = 0;
  for (const y of ys) for (const x of xs) {
    const n = names[i++];
    if (n) out[n] = { x, y };
  }
  return out;
}
function pins(xs: number[], ys: number[], cancel: [number, number]): ButtonMap {
  const out = grid(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Enter'], xs, ys);
  out['Cancel'] = { x: cancel[0], y: cancel[1] };
  return out;
}
const b = (pairs: [string, number, number][]): ButtonMap => Object.fromEntries(pairs.map(([n, x, y]) => [n, { x, y }]));
function receipt(x: number, ys: number[], five: boolean): ButtonMap {
  const names = five ? ['Print', 'Email', 'Text', 'No Receipt', 'Scan for receipt'] : ['Print', 'Email', 'Text', 'No Receipt'];
  return Object.fromEntries(names.map((n, i) => [n, { x, y: ys[i]! }]));
}

const FAMILY_SCREENS: Record<Family, Record<string, ButtonMap>> = {
  FLEX_GEN3: {
    HOME: grid(APPS, [20.3, 55.7], [30.0, 53.6, 77.2, 100.8, 124.4]),
    REGISTER_HOME: b([['Register', 13.0, 10.0], ['Tax Item 5', 20.3, 30.0], ['Non-Tax Item 1', 55.7, 30.0], ['Coffee', 20.3, 50.0], ['Catering Deposit', 55.7, 50.0], ['Clear', 20.0, 124.0], ['Review Order', 56.0, 124.0]]),
    REVIEW_ORDER: b([['Back', 20.0, 124.0], ['Pay', 56.0, 124.0]]),
    PAYMENT: b([['Charge', 38.0, 60.0], ['Cash', 38.0, 78.0], ['Other', 38.0, 96.0], ['Cancel', 38.0, 124.0]]),
    TENDER_CASH_DISCOUNT: b([['Cash', 22.0, 58.5], ['Card', 62.0, 58.5]]),
    PAYMENT_PROMPT: b([['Cancel', 38.0, 124.0]]),
    PIN_ENTRY: pins([19.0, 38.0, 57.0], [62.0, 76.0, 90.0, 104.0], [38.0, 122.0]),
    TIP: b([['15%', 20.3, 62.0], ['18%', 55.7, 62.0], ['20%', 20.3, 80.0], ['22%', 55.7, 80.0], ['No Tip', 20.3, 98.0], ['Custom', 55.7, 98.0]]),
    SIGNATURE: b([['Clear', 20.0, 124.0], ['Done', 56.0, 124.0]]),
    APPROVED: {},
    RECEIPT_OPTIONS_4: receipt(34.0, [71.0, 83.0, 95.0, 107.0], false),
    RECEIPT_OPTIONS_5: receipt(34.0, [74.0, 86.0, 98.0, 110.0, 122.0], true),
  },
  FLEX_GEN2: {
    HOME: grid(APPS, [18.0, 50.0], [24.0, 45.0, 66.0, 87.0, 108.0]),
    REGISTER_HOME: b([['Register', 14.0, 8.0], ['Tax Item 5', 18.0, 26.0], ['Non-Tax Item 1', 50.0, 26.0], ['Coffee', 18.0, 44.0], ['Catering Deposit', 50.0, 44.0], ['Clear', 18.0, 112.0], ['Review Order', 50.0, 112.0]]),
    REVIEW_ORDER: b([['Back', 18.0, 112.0], ['Pay', 50.0, 112.0]]),
    PAYMENT: b([['Charge', 34.0, 54.0], ['Cash', 34.0, 70.0], ['Other', 34.0, 86.0], ['Cancel', 34.0, 110.0]]),
    TENDER_CASH_DISCOUNT: b([['Cash', 18.0, 54.0], ['Card', 50.0, 54.0]]),
    PAYMENT_PROMPT: b([['Cancel', 34.0, 112.0]]),
    PIN_ENTRY: pins([17.0, 34.0, 51.0], [54.0, 67.0, 80.0, 93.0], [34.0, 110.0]),
    TIP: b([['15%', 18.0, 54.0], ['18%', 50.0, 54.0], ['20%', 18.0, 70.0], ['22%', 50.0, 70.0], ['No Tip', 18.0, 86.0], ['Custom', 50.0, 86.0]]),
    SIGNATURE: b([['Clear', 18.0, 112.0], ['Done', 50.0, 112.0]]),
    APPROVED: {},
    RECEIPT_OPTIONS_4: receipt(34.0, [70.0, 80.0, 90.0, 100.0], false),
    RECEIPT_OPTIONS_5: receipt(34.0, [73.0, 83.0, 93.0, 103.0, 113.0], true),
  },
  FLEX_GEN1: {
    HOME: grid(APPS, [16.6, 45.7], [22.0, 42.0, 62.0, 82.0, 102.0]),
    REGISTER_HOME: b([['Register', 13.0, 8.0], ['Tax Item 5', 16.6, 24.0], ['Non-Tax Item 1', 45.7, 24.0], ['Coffee', 16.6, 41.0], ['Catering Deposit', 45.7, 41.0], ['Clear', 16.0, 102.0], ['Review Order', 45.0, 102.0]]),
    REVIEW_ORDER: b([['Back', 16.0, 102.0], ['Pay', 45.0, 102.0]]),
    PAYMENT: b([['Charge', 31.2, 48.0], ['Cash', 31.2, 63.0], ['Other', 31.2, 78.0], ['Cancel', 31.2, 100.0]]),
    TENDER_CASH_DISCOUNT: b([['Cash', 16.6, 48.0], ['Card', 45.7, 48.0]]),
    PAYMENT_PROMPT: b([['Cancel', 31.2, 102.0]]),
    PIN_ENTRY: pins([15.6, 31.2, 46.8], [48.0, 61.0, 74.0, 87.0], [31.2, 102.0]),
    TIP: b([['15%', 16.6, 48.0], ['18%', 45.7, 48.0], ['20%', 16.6, 63.0], ['22%', 45.7, 63.0], ['No Tip', 16.6, 78.0], ['Custom', 45.7, 78.0]]),
    SIGNATURE: b([['Clear', 16.0, 102.0], ['Done', 46.0, 102.0]]),
    APPROVED: {},
    RECEIPT_OPTIONS_4: receipt(31.2, [66.5, 75.5, 84.5, 93.5], false),
    RECEIPT_OPTIONS_5: receipt(31.2, [69.5, 78.5, 87.5, 96.5, 105.5], true),
  },
  COMPACT: {
    HOME: grid(['Orders', 'Transactions', 'Register', 'Setup', 'Sale', 'Customers', 'Settings', 'Authorizations'], [16.6, 45.7], [24.0, 44.0, 64.0, 84.0]),
    REGISTER_HOME: b([['Register', 13.0, 8.0], ['Tax Item 5', 16.6, 24.0], ['Non-Tax Item 1', 45.7, 24.0], ['Coffee', 16.6, 41.0], ['Catering Deposit', 45.7, 41.0], ['Clear', 16.0, 102.0], ['Review Order', 45.0, 102.0]]),
    REVIEW_ORDER: b([['Back', 16.0, 102.0], ['Pay', 45.0, 102.0]]),
    PAYMENT: b([['Charge', 31.2, 50.0], ['Cash', 31.2, 66.0], ['Other', 31.2, 82.0], ['Cancel', 31.2, 102.0]]),
    TENDER_CASH_DISCOUNT: b([['Cash', 16.6, 50.0], ['Card', 45.7, 50.0]]),
    PAYMENT_PROMPT: b([['Cancel', 31.2, 102.0]]),
    PIN_ENTRY: pins([15.6, 31.2, 46.8], [50.0, 63.0, 76.0, 89.0], [31.2, 103.0]),
    TIP: b([['15%', 16.6, 50.0], ['18%', 45.7, 50.0], ['20%', 16.6, 66.0], ['22%', 45.7, 66.0], ['No Tip', 16.6, 82.0], ['Custom', 45.7, 82.0]]),
    SIGNATURE: b([['Clear', 16.0, 102.0], ['Done', 46.0, 102.0]]),
    APPROVED: {},
    RECEIPT_OPTIONS_4: receipt(31.2, [60.0, 70.0, 80.0, 90.0], false),
    RECEIPT_OPTIONS_5: receipt(31.2, [63.0, 73.0, 83.0, 93.0, 103.0], true),
  },
  MINI_GEN3: {
    HOME: grid(MINI_APPS, [22.0, 54.0, 86.0, 118.0, 150.0], [38.0, 72.0]),
    REGISTER_HOME: b([['Register', 14.0, 8.0], ['Tax Item 5', 22.0, 30.0], ['Non-Tax Item 1', 60.0, 30.0], ['Coffee', 22.0, 52.0], ['Catering Deposit', 60.0, 52.0], ['Clear', 100.0, 96.0], ['Review Order', 140.0, 96.0]]),
    REVIEW_ORDER: b([['Back', 100.0, 96.0], ['Pay', 140.0, 96.0]]),
    PAYMENT: b([['Cash', 31.0, 53.0], ['Other', 31.0, 71.0], ['Charge', 31.0, 89.0], ['Cancel', 150.0, 96.0]]),
    TENDER_CASH_DISCOUNT: b([['Cash', 56.0, 58.0], ['Card', 116.0, 58.0]]),
    PAYMENT_PROMPT: b([['Cancel', 86.0, 98.0]]),
    PIN_ENTRY: pins([66.0, 86.0, 106.0], [34.0, 50.0, 66.0, 82.0], [150.0, 98.0]),
    TIP: b([['15%', 40.0, 50.0], ['18%', 72.0, 50.0], ['20%', 104.0, 50.0], ['22%', 136.0, 50.0], ['No Tip', 56.0, 80.0], ['Custom', 120.0, 80.0]]),
    SIGNATURE: b([['Clear', 40.0, 96.0], ['Done', 132.0, 96.0]]),
    APPROVED: {},
    RECEIPT_OPTIONS_4: receipt(86.0, [40.0, 52.0, 64.0, 76.0], false),
    RECEIPT_OPTIONS_5: receipt(86.0, [43.0, 55.0, 67.0, 79.0, 91.0], true),
    CUSTOMER_CART: {},
  },
  MINI_GEN2: {
    HOME: grid(MINI_APPS, [20.0, 48.5, 77.0, 105.5, 134.0], [32.0, 61.0]),
    REGISTER_HOME: b([['Register', 12.5, 7.0], ['Tax Item 5', 20.0, 25.0], ['Non-Tax Item 1', 54.0, 25.0], ['Coffee', 20.0, 44.0], ['Catering Deposit', 54.0, 44.0], ['Clear', 89.5, 81.0], ['Review Order', 125.0, 81.0]]),
    REVIEW_ORDER: b([['Back', 89.5, 81.0], ['Pay', 125.0, 81.0]]),
    PAYMENT: b([['Cash', 28.0, 44.5], ['Other', 28.0, 59.5], ['Charge', 28.0, 74.5], ['Cancel', 134.0, 81.0]]),
    TENDER_CASH_DISCOUNT: b([['Cash', 50.0, 48.5], ['Card', 104.0, 48.5]]),
    PAYMENT_PROMPT: b([['Cancel', 77.0, 82.0]]),
    PIN_ENTRY: pins([59.0, 77.0, 95.0], [28.5, 42.0, 55.5, 69.0], [134.0, 82.0]),
    TIP: b([['15%', 36.0, 42.0], ['18%', 64.5, 42.0], ['20%', 93.0, 42.0], ['22%', 121.5, 42.0], ['No Tip', 50.0, 67.0], ['Custom', 107.0, 67.0]]),
    SIGNATURE: b([['Clear', 36.0, 81.0], ['Done', 118.0, 81.0]]),
    APPROVED: {},
    RECEIPT_OPTIONS_4: receipt(77.0, [33.0, 43.0, 53.0, 63.0], false),
    RECEIPT_OPTIONS_5: receipt(77.0, [36.0, 46.0, 56.0, 66.0, 76.0], true),
    CUSTOMER_CART: {},
  },
  STATION: {
    HOME: grid(MINI_APPS, [40.0, 90.0, 140.0, 190.0, 240.0], [50.0, 100.0]),
    REGISTER_HOME: b([['Register', 22.0, 10.0], ['Tax Item 5', 35.0, 40.0], ['Non-Tax Item 1', 90.0, 40.0], ['Coffee', 35.0, 70.0], ['Catering Deposit', 90.0, 70.0], ['Clear', 190.0, 158.0], ['Review Order', 262.0, 158.0]]),
    REVIEW_ORDER: b([['Back', 190.0, 158.0], ['Pay', 262.0, 158.0]]),
    PAYMENT: b([['Cash', 60.0, 80.0], ['Other', 60.0, 110.0], ['Charge', 60.0, 140.0], ['Cancel', 270.0, 160.0]]),
    TENDER_CASH_DISCOUNT: b([['Cash', 105.0, 90.0], ['Card', 205.0, 90.0]]),
    PAYMENT_PROMPT: b([['Cancel', 155.0, 158.0]]),
    PIN_ENTRY: pins([125.0, 155.0, 185.0], [50.0, 75.0, 100.0, 125.0], [270.0, 160.0]),
    TIP: b([['15%', 80.0, 80.0], ['18%', 130.0, 80.0], ['20%', 180.0, 80.0], ['22%', 230.0, 80.0], ['No Tip', 110.0, 125.0], ['Custom', 200.0, 125.0]]),
    SIGNATURE: b([['Clear', 80.0, 158.0], ['Done', 230.0, 158.0]]),
    APPROVED: {},
    RECEIPT_OPTIONS_4: receipt(155.0, [60.0, 80.0, 100.0, 120.0], false),
    RECEIPT_OPTIONS_5: receipt(155.0, [63.0, 83.0, 103.0, 123.0, 143.0], true),
  },
};

/** Duo CFD rows (secondary display, MINI_GEN3 values). */
const CFD_SCREENS: Record<string, ButtonMap> = {
  CFD_CART: {},
  CFD_TENDER_CASH_DISCOUNT: FAMILY_SCREENS.MINI_GEN3.TENDER_CASH_DISCOUNT!,
  CFD_PAYMENT_PROMPT: FAMILY_SCREENS.MINI_GEN3.PAYMENT_PROMPT!,
  CFD_PIN_ENTRY: FAMILY_SCREENS.MINI_GEN3.PIN_ENTRY!,
  CFD_TIP: FAMILY_SCREENS.MINI_GEN3.TIP!,
  CFD_SIGNATURE: FAMILY_SCREENS.MINI_GEN3.SIGNATURE!,
  CFD_RECEIPT_OPTIONS_4: FAMILY_SCREENS.MINI_GEN3.RECEIPT_OPTIONS_4!,
  CFD_RECEIPT_OPTIONS_5: FAMILY_SCREENS.MINI_GEN3.RECEIPT_OPTIONS_5!,
  CFD_RECEIPT_DONE: b([['Done', 86.0, 90.0]]),
  CFD_THANK_YOU: {},
};

export const TYPE_FAMILY: Partial<Record<DeviceTypeCode, Family>> = {
  FLEX_3: 'FLEX_GEN3',
  FLEX_4: 'FLEX_GEN3',
  FLEX_POCKET: 'FLEX_GEN3',
  FLEX_2: 'FLEX_GEN2',
  FLEX_1: 'FLEX_GEN1',
  COMPACT: 'COMPACT',
  MINI_3: 'MINI_GEN3',
  MINI_2: 'MINI_GEN2',
  STATION_2018: 'STATION',
  STATION_2: 'STATION',
  STATION_DUO: 'STATION',
  STATION_DUO_2: 'STATION',
};

/** Device types with Orca screen rows at factory (Sim §2.10.1), enum order. */
export const SCREEN_TYPES: DeviceTypeCode[] = ['STATION_2018', 'STATION_2', 'STATION_DUO', 'STATION_DUO_2', 'MINI_2', 'MINI_3', 'FLEX_1', 'FLEX_2', 'FLEX_3', 'FLEX_4', 'FLEX_POCKET', 'COMPACT'];

/** Every screen (name → buttons) a device type has at factory. */
export function screensForType(type: DeviceTypeCode): Record<string, ButtonMap> {
  const fam = TYPE_FAMILY[type];
  if (!fam) return {};
  const base = { ...FAMILY_SCREENS[fam] };
  if (type === 'STATION_DUO' || type === 'STATION_DUO_2') Object.assign(base, CFD_SCREENS);
  return base;
}

/** Firmware truth for (type, screen), or null when the screen does not exist for the type. */
export function truthFor(type: string, screen: string): ButtonMap | null {
  const all = screensForType(type as DeviceTypeCode);
  return all[screen] ?? null;
}

/** File text in GP INC20's format. */
export function screenLocationFile(type: string, screen: string, buttons: ButtonMap): string {
  const names = Object.keys(buttons);
  const width = Math.max(0, ...names.map((n) => n.length + 3));
  const rows = names.map((n, i) => {
    const key = `"${n}":`.padEnd(width + 1, ' ');
    return `    ${key} { "x": ${buttons[n]!.x.toFixed(1)}, "y": ${buttons[n]!.y.toFixed(1)} }${i < names.length - 1 ? ',' : ''}`;
  });
  return [
    '{',
    `  "deviceType": "${type}",`,
    `  "screen": "${screen}",`,
    '  "unit": "mm",',
    names.length ? '  "buttons": {' : '  "buttons": {}',
    ...(names.length ? [...rows, '  }'] : []),
    '}',
    '',
  ].join('\n');
}

export const screenLocationPath = (type: string, screen: string): string => `config/screen-locations/${type}/${screen}.json`;

/** Same map shifted by dy (mm) — used for the pre-#418 stale MINI_3 values and fixtures. */
export function shifted(buttons: ButtonMap, dy: number): ButtonMap {
  return Object.fromEntries(Object.entries(buttons).map(([k, v]) => [k, { x: v.x, y: Math.round((v.y + dy) * 10) / 10 }]));
}
