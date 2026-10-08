/**
 * ADB shelf `shelf.adb` — DATA & TARS (World §2.13): black perforated 2-tier shelf, DATA (Mini 3 on
 * its standard stand) and TARS (Flex 4 in an upright printed dock, 70°), front-lip tapes (`DATA`,
 * `TARS`, yellow `ADB ONLY — NO PIN`), the shelf Pi, a 5-port switch, STRIP-D, two AC bricks and
 * the webcam on the rear-right post. Shelf-local mm.
 */
import { BoxGeometry, Object3D, type Matrix4 } from 'three';
import { ADB_RIGS, AC_STRIPS, SHELF_ADB, rigDevice } from '../layout';
import { MeshBatch } from './kit/batch';
import type { LabState } from '@/sim/types';
import { buildDevice, type DeviceHandle } from '../devices';
import type { RigKit } from './kit/context';
import { DEG, placeMatrix } from './kit/geom';
import type { LedHandle } from './kit/instances';
import { buildShelfUnit } from './rack';
import { B, buildAcBrick, buildAcStrip, buildPi, buildWebcam, type PiHandles, type StripHandles, type V3, type WebcamHandles } from './parts';
import type { ScreenManager } from './screens';

export interface AdbDevice {
  rigId: string;
  worldId: string;
  handle: DeviceHandle;
  /** World matrix of the device-local frame. */
  frame: Matrix4;
}

export interface AdbHandles {
  b: B;
  devices: AdbDevice[];
  pi: PiHandles;
  webcam: WebcamHandles;
  strip: StripHandles;
  switchLeds: LedHandle[];
  addScreens(s: ScreenManager): void;
}

export function buildAdbShelf(kit: RigKit, lab: LabState | undefined): AdbHandles {
  const S = SHELF_ADB;
  const b = buildShelfUnit(kit, S.origin, [1000, 600, 1050], [S.tiers.lower * 1000, S.tiers.upper * 1000], { topPlate: undefined });
  const m = kit.mats;
  // bottom stretchers
  for (const sz of [-1, 1]) b.box(m.blackSteel, 1000, 30, 22, [0, 90, sz * 277.5], 1);
  const devices: AdbDevice[] = [];
  for (const rig of ADB_RIGS) {
    const base: V3 = [rig.local[0] * 1000, rig.local[1] * 1000, rig.local[2] * 1000];
    const serial = Object.values(lab?.devices ?? {}).find((d) => d?.rigId === rig.id)?.serial ?? `SIM-${rig.hrn}-01`;
    if (rig.stand.kind === 'mini-stand') {
      // Mini on its standard wedge stand: compose the shelf point with the device's rest frame
      const probe = buildDeviceProbe(kit, rig.deviceType);
      const frame = b.mat({ p: base }).multiply(probe.rest); // `rest` maps device-local → rest frame (devices/types.ts)
      const handle = buildDevice(rig.deviceType, { kit, frame, screenParent: kit.screens, arrangement: 'stand', tape: rig.tape, serial });
      devices.push({ rigId: rig.id, worldId: rig.propId, handle, frame });
    } else {
      // Flex in an upright printed dock: face 70° from horizontal, bottom edge in the dock lip
      const tilt = -rig.stand.screenTiltFromVerticalDeg * DEG;
      const botY = -(136 / 2 + 50);
      const rest = placeMatrix({ p: [0, 30, 10], r: [tilt, 0, 0] }).multiply(placeMatrix({ p: [0, -botY, 11] }));
      const frame = b.mat({ p: base }).multiply(rest);
      const handle = buildDevice(rig.deviceType, { kit, frame, screenParent: kit.screens, arrangement: 'stand', tape: 'FLEX 4', serial });
      devices.push({ rigId: rig.id, worldId: rig.propId, handle, frame });
      const dock = b.sub({ p: base });
      dock.box(m.blackPla, 100, 8, 110, [0, 4, 0], 2);
      dock.box(m.blackPla, 96, 34, 18, [0, 21, 22], 2);
      dock.add(placeholderWedge(), m.blackPla, { p: [0, 8, -20], r: [tilt, 0, 0] });
      dock.box(m.blackPla, 60, 150, 10, [0, 85, -45], 2, [tilt, 0, 0]);
    }
  }
  // front-lip tapes
  for (const l of S.labels) {
    b.tape(l.text, l.tape === 'yellow' ? 8 : 9, { p: [l.local[0] * 1000, l.local[1] * 1000 - 15, 301.5] }, l.tape === 'yellow' ? { bg: '#f2d21b' } : {});
  }
  // lower tier: Pi, 5-port switch, strip D, AC bricks
  const lower = S.tiers.lower * 1000;
  const pi = buildPi(b.sub({ p: [S.pi.local[0] * 1000, lower, S.pi.local[2] * 1000], r: [0, -Math.PI / 2, 0] }));
  const swb = b.sub({ p: [S.networkSwitch.local[0] * 1000, lower, S.networkSwitch.local[2] * 1000] });
  swb.box(m.minixBlack, 100, 26, 80, [0, 13, 0], 3);
  const switchLeds: LedHandle[] = [];
  for (let i = 0; i < 5; i++) {
    swb.box(m.darkPort, 12, 10, 1, [-36 + i * 18, 12, 40.3], 0, undefined, true);
    switchLeds.push(swb.led([-40 + i * 18, 20, 40.5], 1.6, '#2bff6a', 6));
  }
  const sd = AC_STRIPS.find((s) => s.id === 'power.strip.d')!;
  const strip = buildAcStrip(b.sub({ p: [(sd.pos[0] - S.origin[0]) * 1000, sd.pos[1] * 1000, (sd.pos[2] - S.origin[2]) * 1000] }), sd.sizeMm[0], sd.sizeMm[1], sd.sizeMm[2], sd.tape, true);
  buildAcBrick(b.sub({ p: [300, lower, 80] }), true);
  buildAcBrick(b.sub({ p: [300, lower, 180] }), true);
  // cables: Pi → switch, Pi USB → devices, bricks → devices
  b.tube(m.cable('cat6Yellow'), [[-250, lower + 12, -100], [-150, lower + 8, -60], [5, lower + 12, -100]], 5, 5);
  b.tube(m.cable('cableBlack'), [[-300, lower + 20, -60], [-380, 700, 0], [-260, 1000, -60], [-250, 1030, -20]], 3.5, 5);
  b.tube(m.cable('cableWhite'), [[300, lower + 16, 80], [420, 700, 100], [260, 1000, -40], [220, 1020, 0]], 4, 5);
  b.tube(m.cable('cableWhite'), [[300, lower + 16, 180], [440, 700, 200], [-150, 1004, -150], [-240, 1010, -60]], 4, 5);
  // webcam on the rear-right post
  const W = S.webcam;
  const webcam = buildWebcam(b, [477, 1040, -277], [W.camera[0] * 1000, W.camera[1] * 1000, W.camera[2] * 1000], [W.lookAt[0] * 1000, W.lookAt[1] * 1000, W.lookAt[2] * 1000]);
  b.tape('ADB BOTS', 14, { p: [0, 1030, 302] });
  return {
    b, devices, pi, webcam, strip, switchLeds,
    addScreens(screens) {
      for (const d of devices) {
        const scr = d.handle.screens[0]!;
        const rig = ADB_RIGS.find((r) => r.id === d.rigId)!;
        screens.addDevice({
          key: d.worldId,
          mesh: scr.mesh,
          wMm: scr.wMm,
          hMm: scr.hMm,
          type: rig.deviceType,
          which: 'primary',
          resolve: (l) => rigDevice(l, d.rigId, 'primary'),
          fallback: 'home',
        });
      }
    },
  };
}

/** Rest matrix of a device type (built once into a throwaway batch). */
function buildDeviceProbe(kit: RigKit, type: Parameters<typeof buildDevice>[0]): DeviceHandle {
  const scratch = new MeshBatch();
  return buildDevice(type, { kit, frame: placeMatrix(), batch: scratch, detail: scratch, screenParent: new Object3D(), arrangement: 'stand' });
}

function placeholderWedge(): BoxGeometry {
  return new BoxGeometry(0.09, 0.02, 0.06);
}
