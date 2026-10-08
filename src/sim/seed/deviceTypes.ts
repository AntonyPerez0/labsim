/**
 * Orca `DeviceType` enum metrics (Sim §2.2): "device dimensions, layout metrics, and internal string
 * definitions" (Ref §3). Static code, not state. Screen sizes/resolutions are [illus.]; family, profile
 * sharing, printers, dual-screen ADB blindness, upcoming models and markets follow the reference/canon.
 */
import type { DeviceFamily, DeviceTypeCode, DeviceTypeInfo, TestingProfile } from '../types';

/** Firmware layout tables (Sim §2.10.2). Stations share one table; the Duo CFD uses MINI_GEN3. */
export type LayoutId = 'FLEX_GEN3' | 'FLEX_GEN2' | 'FLEX_GEN1' | 'COMPACT' | 'MINI_GEN3' | 'MINI_GEN2' | 'STATION';

type Scr = DeviceTypeInfo['screen'];

const STATION_SCREEN = (wPx: number, hPx: number): Scr => ({ wMm: 309.9, hMm: 174.3, wPx, hPx, diagonalIn: 14.0 });
const DUO_CFD: Scr = { wMm: 172.3, hMm: 107.7, wPx: 1280, hPx: 800, diagonalIn: 8.0 };
const MINI3: Scr = { wMm: 172.3, hMm: 107.7, wPx: 1280, hPx: 800, diagonalIn: 8.0 };
const MINI2: Scr = { wMm: 154.2, hMm: 90.4, wPx: 1024, hPx: 600, diagonalIn: 7.0 };
const FLEX1: Scr = { wMm: 62.3, hMm: 110.7, wPx: 720, hPx: 1280, diagonalIn: 5.0 };
const FLEX2: Scr = { wMm: 68.0, hMm: 121.0, wPx: 720, hPx: 1280, diagonalIn: 5.5 };
const FLEX3: Scr = { wMm: 76.0, hMm: 135.0, wPx: 720, hPx: 1280, diagonalIn: 6.1 };

const PX = {
  ST18: { x: 4.408, y: 4.406 },
  ST2: { x: 6.196, y: 6.196 },
  MINI3: { x: 7.429, y: 7.428 },
  MINI2: { x: 6.641, y: 6.637 },
  FLEX1: { x: 11.557, y: 11.563 },
  FLEX2: { x: 10.588, y: 10.579 },
  FLEX3: { x: 9.474, y: 9.481 },
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
    launcherScroll: family === 'Flex' || family === 'Compact' ? 'vertical' : 'horizontal',
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
const DUO_BODY = { w: 330, h: 255, d: 300 };
const MINI3_BODY = { w: 220, h: 165, d: 160 };
const FLEX3_BODY = { w: 88, h: 210, d: 62 };

export const DEVICE_TYPES: Record<DeviceTypeCode, DeviceTypeInfo> = {
  STATION_2018: t('STATION_2018', 'Station (2018)', 'Station', 'STATION_2018', ST_BODY, STATION_SCREEN(1366, 768), PX.ST18, {
    modelString: 'Station 2018',
    serialPrefix: 'S18',
    notes: 'Countertop POS with built-in printer.',
  }),
  STATION_2: t('STATION_2', 'Station 2', 'Station', 'STATION_2', ST_BODY, STATION_SCREEN(1920, 1080), PX.ST2, {
    modelString: 'Station 2',
    serialPrefix: 'S2',
    notes: 'Countertop POS; MFD on Station 2 → Mini tethers.',
  }),
  STATION_DUO: t('STATION_DUO', 'Station Duo', 'Station', 'STATION_DUO', DUO_BODY, STATION_SCREEN(1920, 1080), PX.ST2, {
    modelString: 'Station Duo',
    serialPrefix: 'SD',
    secondaryScreen: DUO_CFD,
    secondaryPxPerMm: PX.MINI3,
    dualScreenSingleAdb: true,
    notes: 'One terminal, two displays: only the MFD is exposed to ADB (legacy UIA blind to the CFD).',
  }),
  STATION_DUO_2: t('STATION_DUO_2', 'Station Duo 2', 'Station', 'STATION_DUO', DUO_BODY, STATION_SCREEN(1920, 1080), PX.ST2, {
    modelString: 'Station Duo 2',
    serialPrefix: 'SD2',
    secondaryScreen: DUO_CFD,
    secondaryPxPerMm: PX.MINI3,
    dualScreenSingleAdb: true,
    hasPrinter: false,
    notes: 'Printerless Duo; Mini 3 is its hot-swap equivalent.',
  }),
  STATION_DUO_3: t('STATION_DUO_3', 'Station Duo 3', 'Station', 'STATION_DUO', DUO_BODY, STATION_SCREEN(1920, 1080), PX.ST2, {
    modelString: 'Station Duo 3',
    serialPrefix: 'SD3',
    secondaryScreen: DUO_CFD,
    secondaryPxPerMm: PX.MINI3,
    dualScreenSingleAdb: true,
    hasPrinter: false,
    upcoming: true,
    notes: 'Upcoming — not yet in the lab.',
  }),
  MINI_2: t('MINI_2', 'Mini (2nd gen)', 'Mini', 'MINI_GEN2', { w: 205, h: 150, d: 150 }, MINI2, PX.MINI2, {
    modelString: 'Mini 2',
    serialPrefix: 'M2',
  }),
  MINI_3: t('MINI_3', 'Mini (3rd gen)', 'Mini', 'MINI_GEN3', MINI3_BODY, MINI3, PX.MINI3, {
    modelString: 'Mini 3',
    serialPrefix: 'M3',
    hotSwapFor: ['STATION_DUO_2'],
    notes: 'Hot-swap equivalent for the printerless Station Duo 2.',
  }),
  MINI_4: t('MINI_4', 'Mini 4', 'Mini', 'MINI_GEN3', MINI3_BODY, MINI3, PX.MINI3, {
    modelString: 'Mini 4',
    serialPrefix: 'M4',
    upcoming: true,
    notes: 'Upcoming — not yet in the lab.',
  }),
  FLEX_1: t('FLEX_1', 'Flex (1st gen)', 'Flex', 'FLEX_GEN1', { w: 85, h: 190, d: 60 }, FLEX1, PX.FLEX1, {
    modelString: 'Flex',
    serialPrefix: 'F1',
  }),
  FLEX_2: t('FLEX_2', 'Flex (2nd gen)', 'Flex', 'FLEX_GEN2', { w: 85, h: 200, d: 60 }, FLEX2, PX.FLEX2, {
    modelString: 'Flex 2',
    serialPrefix: 'F2',
  }),
  FLEX_3: t('FLEX_3', 'Flex 3', 'Flex', 'FLEX_GEN3', FLEX3_BODY, FLEX3, PX.FLEX3, {
    modelString: 'Flex 3',
    serialPrefix: 'F3',
    notes: 'Shares the FLEX_GEN3 testing profile with Flex 4 and Flex Pocket.',
  }),
  FLEX_4: t('FLEX_4', 'Flex 4', 'Flex', 'FLEX_GEN3', FLEX3_BODY, FLEX3, PX.FLEX3, {
    modelString: 'Flex 4',
    serialPrefix: 'F4',
    notes: 'Shares the FLEX_GEN3 testing profile with Flex 3 and Flex Pocket.',
  }),
  FLEX_POCKET: t('FLEX_POCKET', 'Flex Pocket', 'Flex', 'FLEX_GEN3', { w: 82, h: 168, d: 18 }, FLEX3, PX.FLEX3, {
    modelString: 'Flex Pocket',
    serialPrefix: 'FP',
    hasPrinter: false,
    notes: 'FLEX_GEN3 profile without the printer block.',
  }),
  COMPACT: t('COMPACT', 'LabSim Compact', 'Compact', 'COMPACT', { w: 180, h: 140, d: 120 }, FLEX1, PX.FLEX1, {
    modelString: 'Compact',
    serialPrefix: 'CP',
    hasPrinter: false,
    market: 'CA',
    notes: 'Canadian-market terminal used on Westers test beds.',
  }),
};

/** Firmware layout of a device type's primary display (Sim §2.10.2). */
export function primaryLayoutId(type: DeviceTypeCode): LayoutId {
  switch (type) {
    case 'STATION_2018':
    case 'STATION_2':
    case 'STATION_DUO':
    case 'STATION_DUO_2':
    case 'STATION_DUO_3':
      return 'STATION';
    case 'MINI_2':
      return 'MINI_GEN2';
    case 'MINI_3':
    case 'MINI_4':
      return 'MINI_GEN3';
    case 'FLEX_1':
      return 'FLEX_GEN1';
    case 'FLEX_2':
      return 'FLEX_GEN2';
    case 'COMPACT':
      return 'COMPACT';
    default:
      return 'FLEX_GEN3';
  }
}

/** Layout of a display ('secondary' = the Duo CFD, MINI_GEN3 values). */
export function layoutIdFor(type: DeviceTypeCode, display: 'primary' | 'secondary'): LayoutId {
  return display === 'secondary' ? 'MINI_GEN3' : primaryLayoutId(type);
}

/** Screen geometry of a display. */
export function screenOf(type: DeviceTypeCode, display: 'primary' | 'secondary'): { wMm: number; hMm: number; wPx: number; hPx: number; px: { x: number; y: number } } {
  const info = DEVICE_TYPES[type];
  if (display === 'secondary' && info.secondaryScreen) {
    return { ...info.secondaryScreen, px: info.secondaryPxPerMm ?? PX.MINI3 };
  }
  return { ...info.screen, px: info.pxPerMm ?? { x: info.screen.wPx / info.screen.wMm, y: info.screen.hPx / info.screen.hMm } };
}

export const isDuoType = (type: DeviceTypeCode): boolean => DEVICE_TYPES[type].dualScreenSingleAdb;
export const isHandheld = (type: DeviceTypeCode): boolean => type.startsWith('FLEX');
