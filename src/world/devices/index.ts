/**
 * LabSim device models (World §3): one entry point that builds any of the 14 device types into a
 * world-space batch at a device frame and returns its screen slots + anchors.
 */
import type { DeviceTypeCode } from '@/sim/types';
import { buildCompact, buildFlex } from './handheld';
import { buildMini, buildSealedBox, buildStation } from './terminal';
import type { DeviceBuildOptions, DeviceHandle } from './types';

export type * from './types';
export { DUO_CFD_TRAY_OFFSET, buildStationBase } from './terminal';

export function buildDevice(type: DeviceTypeCode, opts: DeviceBuildOptions): DeviceHandle {
  switch (type) {
    case 'FLEX_1':
    case 'FLEX_2':
    case 'FLEX_3':
    case 'FLEX_4':
    case 'FLEX_POCKET':
      return buildFlex(type, opts);
    case 'COMPACT':
      return buildCompact(opts);
    case 'MINI_2':
    case 'MINI_3':
      return buildMini(type, opts);
    case 'STATION_2':
    case 'STATION_2018':
    case 'STATION_DUO':
    case 'STATION_DUO_2':
      return buildStation(type, opts);
    case 'MINI_4':
    case 'STATION_DUO_3':
      return buildSealedBox(type, opts);
  }
}
