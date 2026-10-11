/**
 * Device Type metrics as Orka's enum shows them (Sim §2.2). Local copy for the UI until the sim exports
 * `DEVICE_TYPES` (src/sim/seed/deviceTypes.ts); used by Orka (info line, screen outline) and the dashboard
 * mini-map.
 */
import type { DeviceTypeCode, TestingProfile } from '@/sim/types';

export interface UiDeviceType {
  code: DeviceTypeCode;
  displayName: string;
  family: 'Stand' | 'Micro' | 'Flux' | 'Compass';
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

const DUET_CFD = { wMm: 172.3, hMm: 107.7, wPx: 1280, hPx: 800 };

export const UI_DEVICE_TYPES: Record<DeviceTypeCode, UiDeviceType> = {
  STAND_2018: t('STAND_2018', 'Stand (2018)', 'Stand', 'STAND_2018', 'landscape', 309.9, 174.3, 1366, 768, true),
  STAND_2: t('STAND_2', 'Stand 2', 'Stand', 'STAND_2', 'landscape', 309.9, 174.3, 1920, 1080, true),
  STAND_DUET: t('STAND_DUET', 'Stand Duet', 'Stand', 'STAND_DUET', 'landscape', 309.9, 174.3, 1920, 1080, true, { secondary: DUET_CFD, dualScreenSingleAdb: true }),
  STAND_DUET_2: t('STAND_DUET_2', 'Stand Duet 2', 'Stand', 'STAND_DUET', 'landscape', 309.9, 174.3, 1920, 1080, false, { secondary: DUET_CFD, dualScreenSingleAdb: true }),
  STAND_DUET_3: t('STAND_DUET_3', 'Stand Duet 3', 'Stand', 'STAND_DUET', 'landscape', 309.9, 174.3, 1920, 1080, false, { secondary: DUET_CFD, dualScreenSingleAdb: true, upcoming: true }),
  MICRO_2: t('MICRO_2', 'Micro (2nd gen)', 'Micro', 'MICRO_GEN2', 'landscape', 154.2, 90.4, 1024, 600, true),
  MICRO_3: t('MICRO_3', 'Micro (3rd gen)', 'Micro', 'MICRO_GEN3', 'landscape', 172.3, 107.7, 1280, 800, true),
  MICRO_4: t('MICRO_4', 'Micro 4', 'Micro', 'MICRO_GEN3', 'landscape', 172.3, 107.7, 1280, 800, true, { upcoming: true }),
  FLUX_1: t('FLUX_1', 'Flux (1st gen)', 'Flux', 'FLUX_GEN1', 'portrait', 62.3, 110.7, 720, 1280, true),
  FLUX_2: t('FLUX_2', 'Flux (2nd gen)', 'Flux', 'FLUX_GEN2', 'portrait', 68.0, 121.0, 720, 1280, true),
  FLUX_3: t('FLUX_3', 'Flux 3', 'Flux', 'FLUX_GEN3', 'portrait', 76.0, 135.0, 720, 1280, true),
  FLUX_4: t('FLUX_4', 'Flux 4', 'Flux', 'FLUX_GEN3', 'portrait', 76.0, 135.0, 720, 1280, true),
  FLUX_POCKET: t('FLUX_POCKET', 'Flux Pocket', 'Flux', 'FLUX_GEN3', 'portrait', 76.0, 135.0, 720, 1280, false),
  COMPASS: t('COMPASS', 'LabSim Compass', 'Compass', 'COMPASS', 'portrait', 62.3, 110.7, 720, 1280, false),
};

/** `Flux · FLUX_GEN2 · portrait 68.0 × 121.0 mm · 720 × 1280 px · printer` (Apps §2.6). */
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
