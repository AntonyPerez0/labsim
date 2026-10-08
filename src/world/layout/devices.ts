/**
 * Device catalogue — World §3.1 (`DeviceTypeInfo.bodyMm` / screen values, bezel margins, power key,
 * NFC landmark). Shared by the rig builders (devices in cradles/docks), the device library and the
 * coworker desks. Millimetres. † values are LabSim's (the reference is silent).
 */
import type { DeviceTypeCode } from '@/sim/types';
import type { Vec2, Vec3 } from './types';

export interface ScreenSpec {
  readonly diagIn: number;
  readonly px: Vec2;
  /** Active area W × H mm (portrait for handhelds). */
  readonly mm: Vec2;
}

export interface BezelMargins {
  readonly top: number;
  readonly bottom: number;
  readonly sides: number;
}

export interface DeviceModelDef {
  readonly type: DeviceTypeCode;
  readonly displayName: string;
  /** Body W × H × D (H = upright height / handheld length; D = thickness or depth). */
  readonly bodyMm: Vec3;
  /** Separate base (Station family) W × H × D. */
  readonly baseMm?: Vec3;
  /** Station Duo CFD head W × H × D. */
  readonly cfdHeadMm?: Vec3;
  /** Handheld printer bulge: thickness over the top `printerLenMm`. */
  readonly printerBulge?: { readonly thicknessMm: number; readonly lenMm: number };
  /** Wedge bodies (Mini / Compact): front-edge thickness. */
  readonly wedgeFrontMm?: number;
  readonly screen: ScreenSpec | null;
  readonly secondary?: ScreenSpec;
  readonly margins: BezelMargins | null;
  readonly cfdMargins?: BezelMargins;
  readonly hasPrinter: boolean;
  /** Power key on the right edge, this far from the top end. */
  readonly powerKeyFromTopMm: number | null;
  /** NFC landmark rule in screen mm: (W/2, H + dy) — dy negative = on screen. */
  readonly nfcDy: number | null;
  readonly bezelColor: 'white' | 'black-glass';
  readonly logo: 'wordmark' | 'leaf' | 'none';
  readonly sealedBox: boolean;
  readonly features: string;
}

const L8: ScreenSpec = { diagIn: 8.0, px: [1280, 800], mm: [172.3, 107.7] };
const L14: ScreenSpec = { diagIn: 14.0, px: [1920, 1080], mm: [309.9, 174.3] };
const P6: ScreenSpec = { diagIn: 6.0, px: [720, 1440], mm: [68.0, 136.0] };
const P5: ScreenSpec = { diagIn: 5.0, px: [720, 1280], mm: [62.3, 110.7] };

const STATION_HEAD: BezelMargins = { top: 22, bottom: 35.7, sides: 20.05 };
const DUO_CFD: BezelMargins = { top: 14, bottom: 28.3, sides: 21.35 };
const MINI2: BezelMargins = { top: 22, bottom: 30.3, sides: 18.85 };
const MINI3: BezelMargins = { top: 22, bottom: 28.3, sides: 17.85 };

export const DEVICE_MODELS: Readonly<Record<DeviceTypeCode, DeviceModelDef>> = {
  STATION_2018: {
    type: 'STATION_2018', displayName: 'Station 2018', bodyMm: [350, 232, 30], baseMm: [330, 105, 230], screen: L14, margins: STATION_HEAD,
    hasPrinter: true, powerKeyFromTopMm: 40, nfcDy: 18, bezelColor: 'black-glass', logo: 'leaf', sealedBox: false,
    features: 'Black-glass front, white back shell, silver hinge arm on a swivel stand (overall 350 × 360 × 250); base with paper door and green leaf; card-reader module on the head bottom edge†',
  },
  STATION_2: {
    type: 'STATION_2', displayName: 'Station 2', bodyMm: [210, 160, 28], baseMm: [240, 95, 200], screen: L8, margins: MINI2,
    hasPrinter: true, powerKeyFromTopMm: 40, nfcDy: 12, bezelColor: 'white', logo: 'wordmark', sealedBox: false,
    features: 'White bezel, `lab` wordmark bottom-left, bottom chip slot with green arrow light-pipe, top-edge swipe slot (D6, illustrative look)',
  },
  STATION_DUO: {
    type: 'STATION_DUO', displayName: 'Station Duo', bodyMm: [350, 232, 30], baseMm: [330, 105, 230], cfdHeadMm: [215, 150, 30], screen: L14, secondary: L8,
    margins: STATION_HEAD, cfdMargins: DUO_CFD, hasPrinter: true, powerKeyFromTopMm: 40, nfcDy: 12, bezelColor: 'black-glass', logo: 'leaf', sealedBox: false,
    features: 'Two screens back-to-back on one stand; the CFD has the card reader (chip slot bottom edge, swipe top edge). NFC landmark on the CFD.',
  },
  STATION_DUO_2: {
    type: 'STATION_DUO_2', displayName: 'Station Duo 2', bodyMm: [350, 232, 30], baseMm: [330, 70, 230], cfdHeadMm: [215, 150, 30], screen: L14, secondary: L8,
    margins: STATION_HEAD, cfdMargins: DUO_CFD, hasPrinter: false, powerKeyFromTopMm: 40, nfcDy: 12, bezelColor: 'black-glass', logo: 'leaf', sealedBox: false,
    features: 'As Duo with a shorter base without paper door — `STATION DUO 2 (NO PRINTER)`',
  },
  STATION_DUO_3: {
    type: 'STATION_DUO_3', displayName: 'Station Duo 3 (upcoming)', bodyMm: [420, 300, 260], screen: null, margins: null,
    hasPrinter: false, powerKeyFromTopMm: null, nfcDy: null, bezelColor: 'white', logo: 'none', sealedBox: true,
    features: 'Library only: white sealed box with green band, label `STATION DUO 3 — UPCOMING`',
  },
  MINI_2: {
    type: 'MINI_2', displayName: 'Mini (2nd gen)', bodyMm: [210, 125, 170], wedgeFrontMm: 35, screen: L8, margins: MINI2,
    hasPrinter: true, powerKeyFromTopMm: 20, nfcDy: 12, bezelColor: 'white', logo: 'wordmark', sealedBox: false,
    features: 'Face 210 × 160; white bezel, `lab` wordmark, chip slot + green arrows, top-edge swipe slot, separate connectivity hub; printer at the rear',
  },
  MINI_3: {
    type: 'MINI_3', displayName: 'Mini (3rd gen)', bodyMm: [208, 120, 165], wedgeFrontMm: 35, screen: L8, margins: MINI3,
    hasPrinter: true, powerKeyFromTopMm: 20, nfcDy: 12, bezelColor: 'white', logo: 'leaf', sealedBox: false,
    features: 'Face 208 × 158; slimmer bezel, four-leaf glyph only (IMG-R OPTIMUS)',
  },
  MINI_4: {
    type: 'MINI_4', displayName: 'Mini 4 (upcoming)', bodyMm: [260, 220, 200], screen: null, margins: null,
    hasPrinter: false, powerKeyFromTopMm: null, nfcDy: null, bezelColor: 'white', logo: 'none', sealedBox: true,
    features: 'Library only: sealed box `MINI 4 — UPCOMING`',
  },
  FLEX_1: {
    type: 'FLEX_1', displayName: 'Flex (1st gen)', bodyMm: [84, 205, 26], printerBulge: { thicknessMm: 52, lenMm: 70 }, screen: P5,
    margins: { top: 30, bottom: 64.3, sides: 10.85 }, hasPrinter: true, powerKeyFromTopMm: 30, nfcDy: -25, bezelColor: 'white', logo: 'wordmark', sealedBox: false,
    features: 'White front, dark-grey back, thick bezel',
  },
  FLEX_2: {
    type: 'FLEX_2', displayName: 'Flex 2', bodyMm: [82, 218, 24], printerBulge: { thicknessMm: 50, lenMm: 70 }, screen: P6,
    margins: { top: 30, bottom: 52, sides: 7 }, hasPrinter: true, powerKeyFromTopMm: 40, nfcDy: -25, bezelColor: 'white', logo: 'wordmark', sealedBox: false,
    features: 'White, grey back band',
  },
  FLEX_3: {
    type: 'FLEX_3', displayName: 'Flex 3', bodyMm: [82, 215, 22], printerBulge: { thicknessMm: 48, lenMm: 70 }, screen: P6,
    margins: { top: 32, bottom: 47, sides: 7 }, hasPrinter: true, powerKeyFromTopMm: 40, nfcDy: -25, bezelColor: 'white', logo: 'wordmark', sealedBox: false,
    features: 'White, flat back; label tape `FLEX 3` and a serial sticker on the bottom bezel (VID)',
  },
  FLEX_4: {
    type: 'FLEX_4', displayName: 'Flex 4', bodyMm: [82, 218, 22], printerBulge: { thicknessMm: 48, lenMm: 70 }, screen: P6,
    margins: { top: 32, bottom: 50, sides: 7 }, hasPrinter: true, powerKeyFromTopMm: 40, nfcDy: -25, bezelColor: 'white', logo: 'wordmark', sealedBox: false,
    features: 'As Flex 3 + front-camera dot and a grey textured grip band on the back',
  },
  FLEX_POCKET: {
    type: 'FLEX_POCKET', displayName: 'Flex Pocket', bodyMm: [82, 172, 20], screen: P6,
    margins: { top: 12, bottom: 24, sides: 7 }, hasPrinter: false, powerKeyFromTopMm: 30, nfcDy: -25, bezelColor: 'white', logo: 'wordmark', sealedBox: false,
    features: 'Flex 3 body with the printer block removed (flat top end); shares the FLEX_GEN3 profile',
  },
  COMPACT: {
    type: 'COMPACT', displayName: 'LabSim Compact (CA)', bodyMm: [90, 185, 58], wedgeFrontMm: 30, screen: P5,
    margins: { top: 34, bottom: 40.3, sides: 13.85 }, hasPrinter: true, powerKeyFromTopMm: 40, nfcDy: -25, bezelColor: 'white', logo: 'wordmark', sealedBox: false,
    features: 'White with dark-grey base, small `CA` country sticker†; countertop wedge; PIN-capable display (Interac)',
  },
};

/** The printed-handheld printer-block length is not in the doc; 70 mm is LabSim's value (Flex 1 states 70). */
export const PRINTER_BULGE_NOTE = 'Flex 2/3/4 printer bulge length assumed 70 mm like the Flex 1.';

/** NFC landmark in screen mm for a model (handhelds/Compact (W/2, H − 25); Minis/Station 2/Duo CFD (W/2, H + 12); Station 2018/Duo MFD (W/2, H + 18)). */
export function nfcLandmarkMm(type: DeviceTypeCode): Vec2 | null {
  const m = DEVICE_MODELS[type];
  if (!m.screen || m.nfcDy === null) return null;
  const s = m.secondary ?? m.screen;
  return [s.mm[0] / 2, s.mm[1] + m.nfcDy];
}

/** Tape label on devices in rigs (§6.3). */
export const DEVICE_TAPES: Readonly<Partial<Record<DeviceTypeCode, string>>> = {
  FLEX_1: 'FLEX 1',
  FLEX_2: 'FLEX 2',
  FLEX_3: 'FLEX 3',
  FLEX_4: 'FLEX 4',
  FLEX_POCKET: 'FLEX POCKET',
  COMPACT: 'COMPACT',
  MINI_2: 'MINI 2',
  MINI_3: 'MINI 3',
  STATION_2018: 'STATION 2018',
  STATION_2: 'STATION 2',
  STATION_DUO: 'STATION DUO',
  STATION_DUO_2: 'STATION DUO 2',
};

/** Device AC brick 110 × 60 × 32: white for Flex/Mini, black for Station; embossed `18V⎓†`. */
export function deviceBrickColor(type: DeviceTypeCode): 'white' | 'black' {
  return type.startsWith('STATION') ? 'black' : 'white';
}
