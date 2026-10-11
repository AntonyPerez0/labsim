/**
 * Orca `DeviceType` enum metrics (Sim §2.2): "device dimensions, layout metrics, and internal string
 * definitions" (Ref §3). Static code, not state. Screen sizes/resolutions are [illus.]; family, profile
 * sharing, printers, dual-screen ADB blindness, upcoming models and markets follow the reference/canon.
 */
import type { DeviceFamily, DeviceTypeCode, DeviceTypeInfo, TestingProfile } from '../types';

/** Firmware layout tables (Sim §2.10.2). Stands share one table; the Duet CFD uses MICRO_GEN3. */
export type LayoutId = 'FLUX_GEN3' | 'FLUX_GEN2' | 'FLUX_GEN1' | 'COMPASS' | 'MICRO_GEN3' | 'MICRO_GEN2' | 'STAND';

type Scr = DeviceTypeInfo['screen'];

const STAND_SCREEN = (wPx: number, hPx: number): Scr => ({ wMm: 309.9, hMm: 174.3, wPx, hPx, diagonalIn: 14.0 });
const DUET_CFD: Scr = { wMm: 172.3, hMm: 107.7, wPx: 1280, hPx: 800, diagonalIn: 8.0 };
const MICRO3: Scr = { wMm: 172.3, hMm: 107.7, wPx: 1280, hPx: 800, diagonalIn: 8.0 };
const MICRO2: Scr = { wMm: 154.2, hMm: 90.4, wPx: 1024, hPx: 600, diagonalIn: 7.0 };
const FLUX1: Scr = { wMm: 62.3, hMm: 110.7, wPx: 720, hPx: 1280, diagonalIn: 5.0 };
const FLUX2: Scr = { wMm: 68.0, hMm: 121.0, wPx: 720, hPx: 1280, diagonalIn: 5.5 };
const FLUX3: Scr = { wMm: 76.0, hMm: 135.0, wPx: 720, hPx: 1280, diagonalIn: 6.1 };

const PX = {
  ST18: { x: 4.408, y: 4.406 },
  ST2: { x: 6.196, y: 6.196 },
  MICRO3: { x: 7.429, y: 7.428 },
  MICRO2: { x: 6.641, y: 6.637 },
  FLUX1: { x: 11.557, y: 11.563 },
  FLUX2: { x: 10.588, y: 10.579 },
  FLUX3: { x: 9.474, y: 9.481 },
};

function t(
  code: DeviceTypeCode,
  displayName: string,
  family: DeviceFamily,
  testingProfile: TestingProfile,
  bodyMm: DeviceTypeInfo['bodyMm'],
  screen: Scr,
  pxPerMm: { x: number; y: number },
  extra: Partial<DeviceTypeInfo> & { modelString: string; serialPrefix: string },
): DeviceTypeInfo {
  return {
    code,
    displayName,
    family,
    testingProfile,
    bodyMm,
    screen,
    hasPrinter: true,
    hasCardReader: true,
    launcherScroll: family === 'Flux' || family === 'Compass' ? 'vertical' : 'horizontal',
    dualScreenSingleAdb: false,
    upcoming: false,
    market: 'US',
    notes: '',
    pxPerMm,
    layout: testingProfile,
    ...extra,
  };
}

const ST_BODY = { w: 330, h: 255, d: 230 };
const DUET_BODY = { w: 330, h: 255, d: 300 };
const MICRO3_BODY = { w: 220, h: 165, d: 160 };
const FLUX3_BODY = { w: 88, h: 210, d: 62 };

export const DEVICE_TYPES: Record<DeviceTypeCode, DeviceTypeInfo> = {
  STAND_2018: t('STAND_2018', 'Stand (2018)', 'Stand', 'STAND_2018', ST_BODY, STAND_SCREEN(1366, 768), PX.ST18, {
    modelString: 'Stand 2018',
    serialPrefix: 'S18',
    notes: 'Countertop POS with built-in printer.',
  }),
  STAND_2: t('STAND_2', 'Stand 2', 'Stand', 'STAND_2', ST_BODY, STAND_SCREEN(1920, 1080), PX.ST2, {
    modelString: 'Stand 2',
    serialPrefix: 'S2',
    notes: 'Countertop POS; MFD on Stand 2 → Micro tethers.',
  }),
  STAND_DUET: t('STAND_DUET', 'Stand Duet', 'Stand', 'STAND_DUET', DUET_BODY, STAND_SCREEN(1920, 1080), PX.ST2, {
    modelString: 'Stand Duet',
    serialPrefix: 'SD',
    secondaryScreen: DUET_CFD,
    secondaryPxPerMm: PX.MICRO3,
    dualScreenSingleAdb: true,
    notes: 'One terminal, two displays: only the MFD is exposed to ADB (legacy UIA blind to the CFD).',
  }),
  STAND_DUET_2: t('STAND_DUET_2', 'Stand Duet 2', 'Stand', 'STAND_DUET', DUET_BODY, STAND_SCREEN(1920, 1080), PX.ST2, {
    modelString: 'Stand Duet 2',
    serialPrefix: 'SD2',
    secondaryScreen: DUET_CFD,
    secondaryPxPerMm: PX.MICRO3,
    dualScreenSingleAdb: true,
    hasPrinter: false,
    notes: 'Printerless Duet; Micro 3 is its hot-swap equivalent.',
  }),
  STAND_DUET_3: t('STAND_DUET_3', 'Stand Duet 3', 'Stand', 'STAND_DUET', DUET_BODY, STAND_SCREEN(1920, 1080), PX.ST2, {
    modelString: 'Stand Duet 3',
    serialPrefix: 'SD3',
    secondaryScreen: DUET_CFD,
    secondaryPxPerMm: PX.MICRO3,
    dualScreenSingleAdb: true,
    hasPrinter: false,
    upcoming: true,
    notes: 'Upcoming — not yet in the lab.',
  }),
  MICRO_2: t('MICRO_2', 'Micro (2nd gen)', 'Micro', 'MICRO_GEN2', { w: 205, h: 150, d: 150 }, MICRO2, PX.MICRO2, {
    modelString: 'Micro 2',
    serialPrefix: 'M2',
  }),
  MICRO_3: t('MICRO_3', 'Micro (3rd gen)', 'Micro', 'MICRO_GEN3', MICRO3_BODY, MICRO3, PX.MICRO3, {
    modelString: 'Micro 3',
    serialPrefix: 'M3',
    hotSwapFor: ['STAND_DUET_2'],
    notes: 'Hot-swap equivalent for the printerless Stand Duet 2.',
  }),
  MICRO_4: t('MICRO_4', 'Micro 4', 'Micro', 'MICRO_GEN3', MICRO3_BODY, MICRO3, PX.MICRO3, {
    modelString: 'Micro 4',
    serialPrefix: 'M4',
    upcoming: true,
    notes: 'Upcoming — not yet in the lab.',
  }),
  FLUX_1: t('FLUX_1', 'Flux (1st gen)', 'Flux', 'FLUX_GEN1', { w: 85, h: 190, d: 60 }, FLUX1, PX.FLUX1, {
    modelString: 'Flux',
    serialPrefix: 'F1',
  }),
  FLUX_2: t('FLUX_2', 'Flux (2nd gen)', 'Flux', 'FLUX_GEN2', { w: 85, h: 200, d: 60 }, FLUX2, PX.FLUX2, {
    modelString: 'Flux 2',
    serialPrefix: 'F2',
  }),
  FLUX_3: t('FLUX_3', 'Flux 3', 'Flux', 'FLUX_GEN3', FLUX3_BODY, FLUX3, PX.FLUX3, {
    modelString: 'Flux 3',
    serialPrefix: 'F3',
    notes: 'Shares the FLUX_GEN3 testing profile with Flux 4 and Flux Pocket.',
  }),
  FLUX_4: t('FLUX_4', 'Flux 4', 'Flux', 'FLUX_GEN3', FLUX3_BODY, FLUX3, PX.FLUX3, {
    modelString: 'Flux 4',
    serialPrefix: 'F4',
    notes: 'Shares the FLUX_GEN3 testing profile with Flux 3 and Flux Pocket.',
  }),
  FLUX_POCKET: t('FLUX_POCKET', 'Flux Pocket', 'Flux', 'FLUX_GEN3', { w: 82, h: 168, d: 18 }, FLUX3, PX.FLUX3, {
    modelString: 'Flux Pocket',
    serialPrefix: 'FP',
    hasPrinter: false,
    notes: 'FLUX_GEN3 profile without the printer block.',
  }),
  COMPASS: t('COMPASS', 'LabSim Compass', 'Compass', 'COMPASS', { w: 180, h: 140, d: 120 }, FLUX1, PX.FLUX1, {
    modelString: 'Compass',
    serialPrefix: 'CP',
    hasPrinter: false,
    market: 'CA',
    notes: 'Canadian-market terminal used on Westers test beds.',
  }),
};

/** Firmware layout of a device type's primary display (Sim §2.10.2). */
export function primaryLayoutId(type: DeviceTypeCode): LayoutId {
  switch (type) {
    case 'STAND_2018':
    case 'STAND_2':
    case 'STAND_DUET':
    case 'STAND_DUET_2':
    case 'STAND_DUET_3':
      return 'STAND';
    case 'MICRO_2':
      return 'MICRO_GEN2';
    case 'MICRO_3':
    case 'MICRO_4':
      return 'MICRO_GEN3';
    case 'FLUX_1':
      return 'FLUX_GEN1';
    case 'FLUX_2':
      return 'FLUX_GEN2';
    case 'COMPASS':
      return 'COMPASS';
    default:
      return 'FLUX_GEN3';
  }
}

/** Layout of a display ('secondary' = the Duet CFD, MICRO_GEN3 values). */
export function layoutIdFor(type: DeviceTypeCode, display: 'primary' | 'secondary'): LayoutId {
  return display === 'secondary' ? 'MICRO_GEN3' : primaryLayoutId(type);
}

/** Screen geometry of a display. */
export function screenOf(type: DeviceTypeCode, display: 'primary' | 'secondary'): { wMm: number; hMm: number; wPx: number; hPx: number; px: { x: number; y: number } } {
  const info = DEVICE_TYPES[type];
  if (display === 'secondary' && info.secondaryScreen) {
    return { ...info.secondaryScreen, px: info.secondaryPxPerMm ?? PX.MICRO3 };
  }
  return { ...info.screen, px: info.pxPerMm ?? { x: info.screen.wPx / info.screen.wMm, y: info.screen.hPx / info.screen.hMm } };
}

export const isDuetType = (type: DeviceTypeCode): boolean => DEVICE_TYPES[type].dualScreenSingleAdb;
export const isHandheld = (type: DeviceTypeCode): boolean => type.startsWith('FLUX');
