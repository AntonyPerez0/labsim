/**
 * Device Type metrics as Orca's enum shows them (Sim §2.2). Local copy for the UI until the sim exports
 * `DEVICE_TYPES` (src/sim/seed/deviceTypes.ts); used by Orca (info line, screen outline) and the dashboard
 * mini-map.
 */
import type { DeviceTypeCode, TestingProfile } from '@/sim/types';

export interface UiDeviceType {
  code: DeviceTypeCode;
  displayName: string;
  family: 'Station' | 'Mini' | 'Flex' | 'Compact';
  profile: TestingProfile;
  orientation: 'portrait' | 'landscape';
  wMm: number;
  hMm: number;
  wPx: number;
  hPx: number;
  secondary: { wMm: number; hMm: number; wPx: number; hPx: number } | null;
  printer: boolean;
  upcoming: boolean;
  dualScreenSingleAdb: boolean;
}

const t = (
  code: DeviceTypeCode,
  displayName: string,
  family: UiDeviceType['family'],
  profile: TestingProfile,
  orientation: UiDeviceType['orientation'],
  wMm: number,
  hMm: number,
  wPx: number,
  hPx: number,
  printer: boolean,
  extra: Partial<UiDeviceType> = {},
): UiDeviceType => ({ code, displayName, family, profile, orientation, wMm, hMm, wPx, hPx, printer, secondary: null, upcoming: false, dualScreenSingleAdb: false, ...extra });

const DUO_CFD = { wMm: 172.3, hMm: 107.7, wPx: 1280, hPx: 800 };

export const UI_DEVICE_TYPES: Record<DeviceTypeCode, UiDeviceType> = {
  STATION_2018: t('STATION_2018', 'Station (2018)', 'Station', 'STATION_2018', 'landscape', 309.9, 174.3, 1366, 768, true),
  STATION_2: t('STATION_2', 'Station 2', 'Station', 'STATION_2', 'landscape', 309.9, 174.3, 1920, 1080, true),
  STATION_DUO: t('STATION_DUO', 'Station Duo', 'Station', 'STATION_DUO', 'landscape', 309.9, 174.3, 1920, 1080, true, { secondary: DUO_CFD, dualScreenSingleAdb: true }),
  STATION_DUO_2: t('STATION_DUO_2', 'Station Duo 2', 'Station', 'STATION_DUO', 'landscape', 309.9, 174.3, 1920, 1080, false, { secondary: DUO_CFD, dualScreenSingleAdb: true }),
  STATION_DUO_3: t('STATION_DUO_3', 'Station Duo 3', 'Station', 'STATION_DUO', 'landscape', 309.9, 174.3, 1920, 1080, false, { secondary: DUO_CFD, dualScreenSingleAdb: true, upcoming: true }),
  MINI_2: t('MINI_2', 'Mini (2nd gen)', 'Mini', 'MINI_GEN2', 'landscape', 154.2, 90.4, 1024, 600, true),
  MINI_3: t('MINI_3', 'Mini (3rd gen)', 'Mini', 'MINI_GEN3', 'landscape', 172.3, 107.7, 1280, 800, true),
  MINI_4: t('MINI_4', 'Mini 4', 'Mini', 'MINI_GEN3', 'landscape', 172.3, 107.7, 1280, 800, true, { upcoming: true }),
  FLEX_1: t('FLEX_1', 'Flex (1st gen)', 'Flex', 'FLEX_GEN1', 'portrait', 62.3, 110.7, 720, 1280, true),
  FLEX_2: t('FLEX_2', 'Flex (2nd gen)', 'Flex', 'FLEX_GEN2', 'portrait', 68.0, 121.0, 720, 1280, true),
  FLEX_3: t('FLEX_3', 'Flex 3', 'Flex', 'FLEX_GEN3', 'portrait', 76.0, 135.0, 720, 1280, true),
  FLEX_4: t('FLEX_4', 'Flex 4', 'Flex', 'FLEX_GEN3', 'portrait', 76.0, 135.0, 720, 1280, true),
  FLEX_POCKET: t('FLEX_POCKET', 'Flex Pocket', 'Flex', 'FLEX_GEN3', 'portrait', 76.0, 135.0, 720, 1280, false),
  COMPACT: t('COMPACT', 'LabSim Compact', 'Compact', 'COMPACT', 'portrait', 62.3, 110.7, 720, 1280, false),
};

/** `Flex · FLEX_GEN2 · portrait 68.0 × 121.0 mm · 720 × 1280 px · printer` (Apps §2.6). */
export function deviceTypeInfoLine(code: DeviceTypeCode | string): string {
  const d = UI_DEVICE_TYPES[code as DeviceTypeCode];
  if (!d) return '';
  const parts = [d.family, d.profile, `${d.orientation} ${d.wMm.toFixed(1)} × ${d.hMm.toFixed(1)} mm`, `${d.wPx} × ${d.hPx} px`, d.printer ? 'printer' : 'no printer'];
  if (d.secondary) parts.push(`CFD ${d.secondary.wMm.toFixed(1)} × ${d.secondary.hMm.toFixed(1)} mm`);
  if (d.upcoming) parts.push('upcoming');
  return parts.join(' · ');
}

/** Screen size in mm of a display of a device type. */
export function screenMm(code: DeviceTypeCode | string, display: 'primary' | 'secondary' = 'primary'): { w: number; h: number } {
  const d = UI_DEVICE_TYPES[code as DeviceTypeCode];
  if (!d) return { w: 76, h: 135 };
  if (display === 'secondary' && d.secondary) return { w: d.secondary.wMm, h: d.secondary.hMm };
  return { w: d.wMm, h: d.hMm };
}
