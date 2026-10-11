/**
 * LabSim device models (World §3): one entry point that builds any of the 14 device types into a
 * world-space batch at a device frame and returns its screen slots + anchors.
 */
import type { DeviceTypeCode } from '@/sim/types';
import { buildCompass, buildFlux } from './handheld';
import { buildMicro, buildSealedBox, buildStand } from './terminal';
import type { DeviceBuildOptions, DeviceHandle } from './types';

export type * from './types';
export { DUET_CFD_TRAY_OFFSET, buildStandBase } from './terminal';

export function buildDevice(type: DeviceTypeCode, opts: DeviceBuildOptions): DeviceHandle {
  switch (type) {
    case 'FLUX_1':
    case 'FLUX_2':
    case 'FLUX_3':
    case 'FLUX_4':
    case 'FLUX_POCKET':
      return buildFlux(type, opts);
    case 'COMPASS':
      return buildCompass(opts);
    case 'MICRO_2':
    case 'MICRO_3':
      return buildMicro(type, opts);
    case 'STAND_2':
    case 'STAND_2018':
    case 'STAND_DUET':
    case 'STAND_DUET_2':
      return buildStand(type, opts);
    case 'MICRO_4':
    case 'STAND_DUET_3':
      return buildSealedBox(type, opts);
  }
}
