/**
 * Tethered bench `rack.t` — MEGATRON (DEV1) & OPTIMUS (STG), exactly as IMG-R (World §2.12):
 * rounded-slot perforated shelves, the silver 2020 device panel with four white-bezel faces
 * (MEGATRON MFD = Station 2 head, MEGATRON CFD = Mini 2, OPTIMUS MFD/CFD = Mini 3) carrying three
 * label-tape pieces each, the SmartStripe probes between the rows (dongles with green LEDs, probe
 * blade / magstripe card in the CFD swipe slots), four black C-holder docks with white
 * connectivity hubs and two-line tape plates, the upright shelf Pi, the bench webcam, the
 * switch / Station 2 base / AC bricks / strip below. Rack-local mm (origin = footprint centre).
 */
import { RACK_T, TETHERED_RIGS, AC_STRIPS, rigDevice, type TetheredFaceDef } from '../layout';
import type { LabState } from '@/sim/types';
import { buildDevice, buildStationBase, type DeviceHandle } from '../devices';
import type { RigKit } from './kit/context';
import { DEG } from './kit/geom';
import type { LedHandle } from './kit/instances';
import { buildShelfUnit } from './rack';
import { B, buildAcBrick, buildAcStrip, buildHub, buildPi, buildWebcam, type PiHandles, type StripHandles, type V3, type WebcamHandles } from './parts';
import type { ScreenManager } from './screens';

export interface TetheredFace {
  def: TetheredFaceDef;
  rigId: string;
  handle: DeviceHandle;
  /** Face centre (rack-local mm). */
  centre: V3;
}

export interface TetheredHandles {
  b: B;
  faces: TetheredFace[];
  hubs: Record<string, LedHandle>;
  dongles: Record<string, LedHandle>;
  pi: PiHandles;
  webcam: WebcamHandles;
  strip: StripHandles;
  addScreens(s: ScreenManager): void;
}

/** Screen-centre offset above the face centre (bottom bezel is taller than the top one). */
function screenOffsetY(type: string): number {
  return type === 'MINI_3' ? (28.3 - 22) / 2 : (30.3 - 22) / 2;
}

export function buildTethered(kit: RigKit, lab: LabState | undefined): TetheredHandles {
  const T = RACK_T;
  const sh = T.shelves;
  const b = buildShelfUnit(kit, T.origin, [600, 900, 1800], [sh.s0 * 1000, sh.s1 * 1000, sh.s2 * 1000, sh.s3 * 1000], { rounded: true, topPlate: 1800, flange: 30 });
  const m = kit.mats;
  // device panel: silver uprights + cross members + extrusion stubs with printed brackets
  const [ux0, ux1] = T.devicePanel.uprightX;
  const uz = T.devicePanel.uprightZ * 1000;
  for (const x of [ux0 * 1000, ux1 * 1000]) b.box(m.aluminium, 20, (sh.s3 - sh.s2) * 1000, 20, [x, ((sh.s2 + sh.s3) / 2) * 1000, uz]);
  for (const y of T.devicePanel.crossY) b.box(m.aluminium, (ux1 - ux0) * 1000 + 20, 20, 20, [0, y * 1000, uz]);
  for (const y of [1340, 1120]) {
    b.box(m.aluminium, 60, 20, 20, [-262, y + 30, -20]);
    b.box(m.blackPla, 14, 40, 40, [-232, y + 30, -20], 2);
  }
  // faces
  const faces: TetheredFace[] = [];
  for (const rig of TETHERED_RIGS) {
    for (const f of [rig.mfd, rig.cfd]) {
      const c: V3 = [f.local[0] * 1000, f.local[1] * 1000, 0];
      const dy = screenOffsetY(f.deviceType);
      const serial = Object.values(lab?.devices ?? {}).find((d) => d?.rigId === rig.id && (d.role === f.role))?.serial ?? `SIM-${rig.hrn.slice(0, 3)}-${f.role.toUpperCase()}`;
      const handle = buildDevice(f.deviceType, {
        kit,
        frame: b.mat({ p: [c[0], c[1] + dy, 0] }),
        screenParent: kit.screens,
        arrangement: 'head',
        logo: f.logo,
        serial,
        tape: null,
      });
      faces.push({ def: f, rigId: rig.id, handle, centre: c });
      // three label-tape pieces on the top bezel + sensor dot (IMG-R)
      const fw = f.faceM[0] * 1000;
      const fh = f.faceM[1] * 1000;
      const ty = c[1] + fh / 2 - 11;
      const fb = b.sub({ p: [c[0], ty, 0.3] });
      fb.tape(f.tapes[0], 9, { p: [-fw / 2 + 9, 0, 0] }, {}, 'left');
      fb.tape(f.tapes[1], 9, { p: [fw * 0.12, 0, 0] });
      fb.tape(f.tapes[2], 9, { p: [fw / 2 - 16, 0, 0] }, {}, 'right');
      fb.cyl(m.screenGlass, 3, 0.4, [fw / 2 - 10, 0, 0.1], [Math.PI / 2, 0, 0], 10);
      if (f.swipeSticker) b.tape(f.swipeSticker.glyph, 5, { p: [c[0] - fw / 2 + 22, c[1] + fh / 2 + 1, -6], r: [-Math.PI / 2, 0, 0] }, { fg: f.swipeSticker.color, bg: '#f2f2ee', edges: false });
      // mounting bracket behind each face to the panel
      b.box(m.blackPla, 120, 20, 40, [c[0], c[1], -60], 2);
    }
  }
  // SmartStripe probes between the rows (y 1200–1260)
  const dongles: Record<string, LedHandle> = {};
  const [sy0] = T.smartstripeY;
  for (const rig of TETHERED_RIGS) {
    const ss = rig.smartstripe;
    const dx = ss.dongleX * 1000;
    const cx = ss.clampX * 1000;
    const y = sy0 * 1000;
    b.box(m.minixBlack, 75, 12, 22, [dx, y + 26, 12], 4);
    dongles[rig.id] = b.led([dx + 20, y + 32.2, 20], 3, '#2bff6a', 7, [-Math.PI / 2, 0, 0]);
    // clamp block with M3 screw on the CFD top edge, the probe blade standing in the swipe slot
    b.box(m.blackPla, 40, 30, 25, [cx, y + 15, -6], 2);
    b.screw([cx, y + 30, -6], [0, 0, 0], false, 0.4);
    const blade = b.sub({ p: [cx - 50, y + 16, 8] });
    blade.box(m.minixBlack, 85, 40, 0.8, [0, 0, 0]);
    blade.text('SmartStripe Probe', '#f2f2f2', 46, 6, { p: [0, 2, 0.5], r: [0, 0, Math.PI] }, { shadow: 'rgba(0,0,0,0)', weight: 500, family: 'Arial, sans-serif' });
    b.tube(m.cable('cableBlack'), [[dx - 35, y + 26, 12], [dx - 50, y + 18, 18], [cx - 80, y + 10, 14], [cx - 90, y + 16, 9]], 4, 5);
    b.tube(m.cable('cableBlack'), [[dx + 37, y + 26, 12], [dx + 60, y + 40, -20], [dx + 70, 1000, -200], [0, sh.s2 * 1000 + 40, 300]], 4, 5);
    if (ss.cardX !== undefined) {
      const card = b.sub({ p: [ss.cardX * 1000, y + 22, 4] });
      card.box(m.cardWhite, 85.6, 44, 0.76, [0, 0, 0]);
      card.box(m.minixBlack, 85.6, 9, 0.3, [0, 8, 0.5]);
      b.box(m.blackPla, 30, 26, 22, [ss.cardX * 1000 - 50, y + 13, -6], 2);
    }
  }
  // docks on S2: C-holders + hubs + two-line tape plates
  const hubs: Record<string, LedHandle> = {};
  const s2 = sh.s2 * 1000;
  const dz = T.dockZ * 1000;
  const [dw, dd, dh] = T.dockSizeMm;
  for (const d of T.docks) {
    const x = d.x * 1000;
    const db = b.sub({ p: [x, s2, dz] });
    db.box(m.blackPla, dw, 6, dd, [0, 3, 0], 2);
    db.box(m.blackPla, 8, dh, dd, [-dw / 2 + 4, dh / 2, 0], 2);
    db.box(m.blackPla, dw, dh * 0.5, 8, [0, dh * 0.25, -dd / 2 + 4], 2);
    for (const y of [40, dh - 30]) db.screw([-dw / 2 + 8.5, y, 50], [0, 0, -Math.PI / 2], false, 0.5);
    hubs[d.id] = buildHub(db.sub({ p: [4, 6, 6] }));
    // base plate to the front lip with the black label plate + two-line tape
    db.box(m.blackPla, dw + 30, 6, 450 - dz, [0, 3, (450 - dz) / 2 + dd / 2 - 70], 2);
    const lp = b.sub({ p: [x, s2 + 30, 446] });
    lp.box(m.blackPla, 100, 62, 6, [0, 0, -3], 2);
    lp.tape(`${d.tape[0]}\n${d.tape[1]}`, 13, { p: [0, 0, 0.3] });
  }
  // cables from the hubs (light-blue / white Ethernet, black/white USB, DC black) + slack loops
  for (const d of T.docks) {
    const x = d.x * 1000;
    const eth = d.id.includes('megatron') ? m.cable('cableBlue') : m.cable('cableWhite');
    b.tube(eth, [[x + 6, s2 + 146, dz + 70], [x + 10, s2 + 120, dz + 120], [x * 0.6, s2 + 20, dz + 60], [x * 0.3, s2 + 12, dz - 80], [0, s2 + 40, -300]], 5, 5);
    b.tube(m.cable(d.id.includes('optimus') ? 'cableWhite' : 'cableBlack'), [[x + 6, s2 + 61, dz + 70], [x + 8, s2 + 30, dz + 110], [x + 20, s2 + 8, dz + 40], [x * 0.5, s2 + 8, dz - 120], [x * 0.2, 1100, -60]], 4, 5);
    b.tube(m.cable('cableBlack'), [[x + 6, s2 + 106, dz + 70], [x - 10, s2 + 90, dz + 110], [x - 25, s2 + 6, dz + 30], [x - 10, s2 + 6, -300], [x, sh.s1 * 1000 + 10, -320]], 4, 5);
  }
  for (const x of [-140, 20, 140]) {
    const k = b.sub({ p: [x, s2 + 18, dz + 70] });
    for (const a of [0, 90, 180, 270]) k.cyl(m.wire('red'), 10, 6, [Math.cos(a * DEG) * 6, Math.sin(a * DEG) * 6, 0], [Math.PI / 2, 0, 0], 12);
  }
  // shelf Pi standing upright between the inner docks (RJ45 at the top)
  const pl = T.pi.local;
  const pi = buildPi(b.sub({ p: [pl[0] * 1000, pl[1] * 1000, pl[2] * 1000], r: [0, -Math.PI / 2, 0] }), true);
  // bench webcam (gooseneck from S3's front lip)
  const W = T.webcam;
  const webcam = buildWebcam(b, [W.clamp[0] * 1000, W.clamp[1] * 1000, W.clamp[2] * 1000], [W.camera[0] * 1000, W.camera[1] * 1000, W.camera[2] * 1000], [W.lookAt[0] * 1000, W.lookAt[1] * 1000, W.lookAt[2] * 1000]);
  // S1: 8-port switch, Station 2 base, spare hub, cable box
  const s1 = sh.s1 * 1000;
  const sw = b.sub({ p: [-150, s1, 250] });
  sw.box(m.minixBlack, 160, 28, 100, [0, 14, 0], 3);
  for (let i = 0; i < 8; i++) {
    sw.box(m.darkPort, 12, 10, 1, [-60 + i * 17, 13, 50.3], 0, undefined, true);
    sw.led([-60 + i * 17 - 4, 21, 50.5], 1.6, '#2bff6a', 6);
  }
  buildStationBase({ kit, frame: b.mat({ p: [80, s1, -80] }), screenParent: kit.screens, arrangement: 'stand' });
  buildHub(b.sub({ p: [-200, s1, -150], r: [0, 0, -Math.PI / 2] }).sub({ p: [0, -20, 0] }));
  b.box(m.cardboard, 220, 140, 180, [150, s1 + 70, 230], 2);
  // S0: strip T (rear) + four AC bricks
  const st = AC_STRIPS.find((s) => s.id === 'power.strip.t')!;
  const strip = buildAcStrip(b.sub({ p: [(st.pos[0] - T.origin[0]) * 1000, st.pos[1] * 1000, (st.pos[2] - T.origin[2]) * 1000] }), st.sizeMm[0], st.sizeMm[1], st.sizeMm[2], st.tape, true);
  for (let i = 0; i < 4; i++) buildAcBrick(b.sub({ p: [-180 + i * 120, sh.s0 * 1000, 120], r: [0, Math.PI / 2, 0] }), i !== 0);
  // S3 top: two cardboard boxes
  b.box(m.cardboard, 300, 160, 220, [-120, 1800 + 80, -60], 2);
  b.box(m.cardboard, 220, 120, 180, [170, 1800 + 60, 40], 2);
  b.tape('TETHERED — MEGATRON / OPTIMUS', 14, { p: [0, 1786, 452] });

  return {
    b, faces, hubs, dongles, pi, webcam, strip,
    addScreens(screens) {
      for (const f of faces) {
        const scr = f.handle.screens[0]!;
        screens.addDevice({
          key: f.def.id,
          mesh: scr.mesh,
          wMm: scr.wMm,
          hMm: scr.hMm,
          type: f.def.deviceType,
          which: 'primary',
          resolve: (l) => rigDevice(l, f.rigId, f.def.role === 'mfd' ? 'primary' : 'secondary'),
          fallback: f.def.defaultLook === 'lock' ? 'lock' : 'customer-idle',
        });
      }
    },
  };
}
