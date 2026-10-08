/**
 * One touch rig in its bay (World §2.2–§2.10): fascia, gantry, actuators, cradle + LabSim device,
 * Raspberry Pi, bay fuse, motor PCB, device AC brick, webcam, braided sleeve, wiring loom, Collis
 * ribbon, side door. Returns the handles the binder animates (`TouchRigView`).
 */
import { Group, Mesh, Object3D, type Matrix4 } from 'three';
import {
  bayOriginWorld,
  bayPartPositions,
  rackDef,
  DEVICE_MODELS,
  SIDE_DOOR,
  type TouchRigDef,
} from '../layout';
import { effectiveConfig, rigConfigFor, type RigDeviceConfig } from './rigConfig';
import { buildDevice, type DeviceHandle } from '../devices';
import type { RigKit } from './kit/context';
import { Frame } from './kit/frame';
import { MeshBatch } from './kit/batch';
import { MM, boxG, placeMatrix, tubeG } from './kit/geom';
import type { LedHandle } from './kit/instances';
import type { Moving } from './kit/moving';
import { B, buildAcBrick, buildFuseHolder, buildPi, buildWebcam, type FuseHandles, type PiHandles, type V3, type WebcamHandles } from './parts';
import { buildFascia, type FasciaHandles } from './fascia';
import { buildGantry, type GantryHandles } from './gantry';
import { buildActuators, type ActuatorHandles } from './actuators';
import { buildCradle, type Footprint } from './cradles';

export interface DeviceVariant {
  cfg: RigDeviceConfig;
  handle: DeviceHandle;
  /** Group holding this configuration's device + cradle (null = merged into the global static batch). */
  group: Group | null;
  /** Device-local frame (mm placements → world metres), as passed to `buildDevice`. */
  frame: Matrix4;
  /** Interaction hit proxies of this configuration's screens: shown only while the configuration is. */
  hitProxies?: Object3D[];
}

export interface TouchRigView {
  def: TouchRigDef;
  frame: Frame;
  bayRoot: Object3D;
  variants: DeviceVariant[];
  fascia: FasciaHandles;
  gantry: GantryHandles;
  act: ActuatorHandles;
  pi: PiHandles;
  fuse: FuseHandles;
  webcam: WebcamHandles;
  door: Moving;
  pcb: { power: LedHandle; drivers: LedHandle[] };
  /** Motor-PCB USB lead to a Windows box (visible while `rig.motionHost !== 'PI'`). */
  motionCable: Object3D;
  /** Cable variants toggled by state. */
  cables: { ethPlugged: Mesh; ethLoose: Mesh; piPwrPlugged: Mesh; piPwrLoose: Mesh };
}

/** Device-local → bay frame for a face-up device whose primary screen top-left is at the home. */
export function deviceBayPlace(cfg: RigDeviceConfig): { p: V3; r: V3 } {
  const [sw, sh] = cfg.primaryScreenMm;
  return { p: [cfg.screenTopLeftMm[0] + sw / 2, 100, cfg.screenTopLeftMm[1] + sh / 2], r: [-Math.PI / 2, 0, 0] };
}

/** Footprint(s) of a device for its cradle (bay mm). */
function footprints(cfg: RigDeviceConfig, h: DeviceHandle): Footprint[] {
  const pl = deviceBayPlace(cfg);
  const cx = pl.p[0];
  const cz = pl.p[2];
  const model = DEVICE_MODELS[cfg.type];
  if (cfg.type === 'STATION_DUO') {
    const mfd: Footprint = { x0: cx - 175, x1: cx + 175, z0: cz - 109.15, z1: cz + 122.85, bottom: 70 };
    const cfd: Footprint = { x0: cx - 107.5, x1: cx + 107.5, z0: cz + 137.85, z1: cz + 287.85, bottom: 70 };
    return [mfd, cfd];
  }
  const f: Footprint = { x0: cx + h.anchors.min[0], x1: cx + h.anchors.max[0], z0: cz - h.anchors.max[1], z1: cz - h.anchors.min[1], bottom: 100 + h.anchors.min[2] };
  if (model.printerBulge) {
    const body = model.bodyMm[2];
    const top = h.anchors.max[1];
    f.bottom = 100 - 0.5 - body;
    f.bulge = { z0: cz - top, z1: cz - (top - model.printerBulge.lenMm), bottom: 100 - 0.5 - model.printerBulge.thicknessMm };
  }
  return [f];
}

export function buildTouchRig(kit: RigKit, def: TouchRigDef, serials: Readonly<Record<string, string>>): TouchRigView {
  const rack = rackDef(def.rackId);
  const origin = bayOriginWorld(rack, def.bay);
  const frame = Frame.world(origin);
  const b = new B(kit, frame.m);
  const m = kit.mats;
  const s = def.doorSide;
  const bayRoot = new Object3D();
  bayRoot.name = `bay:${def.id}`;
  bayRoot.position.set(origin[0], origin[1], origin[2]);
  kit.root.add(bayRoot);
  bayRoot.updateMatrixWorld(true);
  const parts = bayPartPositions(s);
  const cfg0 = rigConfigFor(def);

  // ── fascia, gantry, actuators ──
  const fascia = buildFascia(b, def, kit.screens);
  const gantry = buildGantry(kit, b, bayRoot, cfg0);
  const model0 = DEVICE_MODELS[cfg0.type];
  const thickness = model0.printerBulge ? model0.bodyMm[2] : Math.min(30, model0.bodyMm[2]);
  const act = buildActuators(kit, b, bayRoot, cfg0, thickness);

  // ── device(s) + cradle(s) ──
  const variants: DeviceVariant[] = [];
  const multi = def.deviceConfigs.length > 1;
  def.deviceConfigs.forEach((rawCfg, i) => {
    const cfg = effectiveConfig(rawCfg);
    let group: Group | null = null;
    let batch = kit.stat;
    let detail = kit.statNoShadow;
    let mv: Moving | null = null;
    if (multi) {
      mv = kit.moving(`device:${def.id}:${cfg.type}`, kit.root, true);
      group = mv.group;
      batch = mv.batch;
      detail = mv.batch;
      group.visible = i === 0;
    }
    const pl = deviceBayPlace(cfg);
    const devFrame = frame.matrix(pl);
    const handle = buildDevice(cfg.type, {
      kit,
      frame: devFrame,
      batch,
      detail,
      screenParent: kit.screens,
      arrangement: cfg.type.startsWith('STATION') ? 'tray' : 'stand',
      tape: cfg.tape,
      serial: serials[cfg.type] ?? `SIM-${def.id.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${cfg.type.slice(0, 2)}01`,
      maxBodyDepthMm: cfg.type.startsWith('MINI') ? 95 : undefined,
    });
    const cb = new B(kit, frame.m, batch, detail);
    buildCradle(cb, cfg.cradle, footprints(cfg, handle));
    // white DC lead from the AC brick to the device (VID)
    const brick = parts.devicePsu!.pos;
    const devRight: V3 = [pl.p[0] + handle.anchors.max[0] * 0.6, 70, pl.p[2] + 20];
    cb.tube(m.cable('cableWhite'), [[brick[0] - s * 40, 20, brick[2]], [brick[0] - s * 60, 12, brick[2] + 120], [devRight[0] + s * 10, 30, devRight[2] + 40], devRight], 4, 6);
    variants.push({ cfg, handle, group, frame: devFrame });
    if (group) for (const scr of handle.screens) scr.mesh.userData.variant = cfg.type;
  });

  // ── Raspberry Pi (floor, door-side rear corner, ports toward the door) ──
  const piPos = parts.pi!.pos;
  const pib = b.sub({ p: piPos, r: [0, s < 0 ? Math.PI : 0, 0] });
  const pi = buildPi(pib);
  // ── bay fuse holder zip-tied to the door-side rear post ──
  const fusePos = parts.fuse!.pos;
  const fuse = buildFuseHolder(b.sub({ p: fusePos, r: [0, Math.PI / 2, 0] }), def.fuseTape, [0, 0, 0]);
  b.box(m.whiteNylon, 3, 3, 30, [fusePos[0] + s * 6, fusePos[1] + 14, fusePos[2]], 0.5, undefined, true);
  // ── device AC brick on the floor, door side ──
  buildAcBrick(b.sub({ p: parts.devicePsu!.pos, r: [0, Math.PI / 2, 0] }), !cfg0.type.startsWith('STATION'));
  // routed round the inner side and the rear of the Pi (a straight run to the post went through the case)
  b.tube(m.cable('cableBlack'), [[parts.devicePsu!.pos[0], 16, parts.devicePsu!.pos[2] - 60], [s * 90, 12, -745], [s * 90, 12, -862], [s * 215, 22, -868], [s * 232, 200, -880], [s * 232, 440, -880]], 5, 6);

  // cable variants: Pi Ethernet (yellow Cat6) and Pi USB-C power
  const jackW = pib.point(pi.jack);
  const jack: V3 = [jackW.x / MM - origin[0] / MM, jackW.y / MM - origin[1] / MM, jackW.z / MM - origin[2] / MM];
  const usbW = pib.point(pi.usbc);
  const usbc: V3 = [usbW.x / MM - origin[0] / MM, usbW.y / MM - origin[1] / MM, usbW.z / MM - origin[2] / MM];
  const mkCable = (pts: V3[], d: number, mat: ReturnType<typeof m.cable>): Mesh => {
    const mesh = new Mesh(tubeG(pts, d, 6, 5), mat);
    frame.applyTo(mesh);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    kit.root.add(mesh);
    return mesh;
  };
  const postX = s * 236;
  const ethPlugged = mkCable([[postX, 440, -882], [postX, 120, -882], [postX - s * 10, 30, -850], [jack[0] + s * 30, 14, jack[2] - 20], [jack[0] + s * 6, jack[1], jack[2]]], 6, m.cable('cat6Yellow'));
  const ethLoose = mkCable([[postX, 440, -882], [postX, 120, -882], [postX - s * 10, 40, -850], [jack[0] + s * 40, 30, jack[2] + 20], [jack[0] + s * 30, 12, jack[2] + 60]], 6, m.cable('cat6Yellow'));
  ethLoose.visible = false;
  const fuseOut: V3 = [fusePos[0], fusePos[1], fusePos[2] + 45];
  // The USB-C side faces the rear on Rack B (s > 0) and the bay interior on Rack A (the case is turned
  // 180° there); `n` = its outward Z. Both routes stay clear of the 94 × 63 case footprint.
  const n = -s;
  const pwrRoute: V3[] = s > 0
    ? [fuseOut, [s * 232, 40, -830], [s * 190, 14, usbc[2] + n * 22]]
    : [fuseOut, [s * 190, 40, -836], [s * 108, 14, -836], [s * 108, 12, usbc[2] + n * 18]];
  const piPwrPlugged = mkCable([...pwrRoute, [usbc[0], usbc[1], usbc[2] + n * 22], [usbc[0], usbc[1], usbc[2] + n * 4]], 4, m.cable('cableBlack'));
  const piPwrLoose = mkCable([...pwrRoute, [usbc[0] - s * 20, 4, usbc[2] + n * 40], [usbc[0] - s * 40, 3, usbc[2] + n * 44]], 4, m.cable('cableBlack'));
  piPwrLoose.visible = false;
  // MAIN 5 V feed: from the rear post down along the braided sleeve
  b.tube(m.wire('red'), [[postX - s * 4, 440, -876], [postX - s * 4, 90, -876], [fusePos[0] - s * 4, fusePos[1], fusePos[2] - 45]], 2.4, 5);

  // ── motor controller PCB on the back mesh (opposite the door side) ──
  const pcbP = parts.motorPcb!.pos;
  const pb = b.sub({ p: pcbP });
  pb.box(m.pcbBoard, 100, 70, 1.6, [0, 0, 0]);
  for (const x of [-45, 45]) for (const y of [-30, 30]) pb.cyl(m.brass, 5, 10, [x, y, -6], [Math.PI / 2, 0, 0], 6, true);
  pb.box(m.steelSatin, 53, 12, 8, [0, 29, 4.5], 1);
  pb.box(m.darkPort, 46, 6, 1, [0, 29, 8.8], 0.8, undefined, true);
  for (let i = 0; i < 3; i++) {
    pb.box(m.purplePcb, 15, 20, 1.6, [-30 + i * 22, -2, 4], 0);
    pb.box(m.heatsink, 9, 9, 5, [-30 + i * 22, -2, 7.5], 0.5);
  }
  for (const [x, t] of [[-35, '24V IN'], [0, 'SOL'], [30, 'SERVO']] as const) {
    pb.box(m.greenPla, 14, 8, 9, [x, -26, 5], 0.5);
    pb.text(t, '#f0f0e8', 14, 3.4, { p: [x, -32.5, 0.9] });
  }
  pb.box(m.steelSatin, 12, 11, 10, [44, 10, 5], 0.5);
  pb.text(def.hrn, '#d9d9d9', 28, 6, { p: [22, 18, 0.9] }, { family: '"Segoe Print", "Comic Sans MS", cursive', weight: 600, shadow: 'rgba(0,0,0,0)' });
  const pcbPower = pb.led([40, -18, 1], 2, '#2bff6a', 7);
  const drivers = [0, 1, 2].map((i) => pb.led([-30 + i * 22 + 6, 9, 2.2], 1.2, '#ff2614', 6));
  // grey 25-way ribbon from the DB-25 down to the loom
  pb.tube(m.ribbonGrey, [[0, 36, 8], [0, 60, 20], [s * 20, 40, 60], [s * 40, -190, 120]], 6, 4);
  // grey USB lead tagged `<HRN> MOTION` from the PCB's USB-B through the open side to the Callus
  // shelf — shown only while the sim has the motor PCB on a Windows box (rig.motionHost ≠ 'PI', INC19)
  const motionCable = kit.moving(`motion-cable:${def.id}`, kit.root, false);
  const mb = new B(kit, frame.m, motionCable.batch, motionCable.batch);
  mb.tube(m.cable('cableGrey'), [[pcbP[0] + 44, pcbP[1] + 10, pcbP[2] + 10], [pcbP[0] + 80 * -s, 60, -700], [-s * 226, 30, -620], [-s * 300, 20, -600]], 4, 6);
  mb.tape(`${def.hrn} MOTION`, 4, { p: [-s * 200, 36, -630], r: [0, -s * Math.PI / 2, 0] });
  motionCable.group.visible = false;

  // ── wiring loom: PCB → floor → dip tower → up the tower (red / blue / green / white) ──
  const colours = ['red', 'blue', 'green', 'white'] as const;
  colours.forEach((c, i) => {
    const o = (i - 1.5) * 2.4;
    b.tube(m.wire(c), [[pcbP[0] + o, pcbP[1] - 35, pcbP[2] + 6], [pcbP[0] * 0.6 + o, 10, -700], [40 + o, 8, -300], [10 + o, 8, -80], [10, 40 + o, -48 + o], [10, 120, -48 + o], [10, 235, -48 + o]], 2, 4);
  });
  // ── Collis ribbon enters through the open (Callus) side to the dip tower ──
  const ce = parts.collisRibbonEntry!.pos;
  b.add(tubeG([[ce[0] - s * 20, 30, ce[2]], [ce[0] * 0.5, 8, ce[2] + 100], [30, 8, -120], [32, 60, -70], [32, 200, -70]], 3, 4, 4), m.ribbonGrey, {}, true);
  // ── braided sleeve along the front edge of the bay floor, then up the door-side rear post ──
  b.tube(m.braidedSleeve, [[-s * 215, 12, -12], [0, 13, -12], [s * 200, 12, -14], [s * 222, 20, -120], [s * 228, 20, -600], [s * 232, 40, -870], [s * 232, 440, -878]], 24, 8, false);
  // ── webcam on its gooseneck ──
  const wc = buildWebcam(b, parts.webcamClamp!.pos, parts.webcamCamera!.pos, cfg0.cameraTargetMm);

  // ── side door (outer side), hinged on the rear post ──
  const door = kit.moving(`door:${def.id}`, bayRoot, false);
  const hinge = parts.doorHinge!.pos;
  door.group.position.set(hinge[0] * MM, 0, hinge[2] * MM);
  const L = SIDE_DOOR.lenZMm;
  const H = SIDE_DOOR.heightMm;
  door.add(boxG(12, 12, L), m.anodisedBlack, { p: [0, 6, L / 2] });
  door.add(boxG(12, 12, L), m.anodisedBlack, { p: [0, H - 6, L / 2] });
  door.add(boxG(12, H, 12), m.anodisedBlack, { p: [0, H / 2, 6] });
  door.add(boxG(12, H, 12), m.anodisedBlack, { p: [0, H / 2, L - 6] });
  door.add(boxG(1, H - 20, L - 20), m.hexMesh, { p: [0, H / 2, L / 2] });
  door.add(boxG(20, 80, 25), m.anodisedBlack, { p: [s * 14, SIDE_DOOR.handleY, L - 30] });
  for (const y of [60, H - 60]) door.add(boxG(6, 20, 10), m.anodisedBlack, { p: [-s * 4, y, L - 8] });

  void placeMatrix;
  return {
    def, frame, bayRoot, variants, fascia, gantry, act, pi, fuse, webcam: wc, door,
    pcb: { power: pcbPower, drivers },
    motionCable: motionCable.group,
    cables: { ethPlugged, ethLoose, piPwrPlugged, piPwrLoose },
  };
}
