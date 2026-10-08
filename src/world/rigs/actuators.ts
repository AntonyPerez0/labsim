/**
 * Card / phone actuators of a touch rig (World §2.7, IMG-G): the printed dip tower (also the cable
 * tower, zip-tie slots, blue micro servo), the dip arm with its sector gear embossed `63`, hub
 * clamp bolts and the white Collis probe card on a grey ribbon; the NFC tap paddle (copper coil
 * inlay) on its vertical pivot; the phone sled on an MGN9 rail with the power-button pusher.
 * Bay-local mm.
 */
import { Object3D, PlaneGeometry } from 'three';
import { DIP_ARM_MM, PHONE_SLED_MM, TAP_PADDLE_MM, type TouchDeviceConfig } from '../layout';
import type { RigKit } from './kit/context';
import { MM, boxG, cylG, extrudeG, planeUvG, rboxG, shapeMm } from './kit/geom';
import type { Moving } from './kit/moving';
import { atlasRect } from '../devices/common';
import { paintRaisedText } from './kit/atlas';
import type { B, V3 } from './parts';

export interface ActuatorHandles {
  dip: Moving;
  pivotY: number;
  tap: Moving;
  /** Tap paddle yaw for In (towards the NFC landmark) and Out (+X). */
  tapInYaw: number;
  sled: Moving;
  finger: Object3D;
  sledForwardZ: number;
  sledBackZ: number;
  /** Device thickness used for the pusher height. */
  pusherY: number;
}

/** Sector gear outline (90° sector, pitch radius 32, module 1 teeth) in the YZ plane, centred on the pivot. */
function sectorGear(): ReturnType<typeof shapeMm> {
  const pts: [number, number][] = [[0, 0]];
  const r0 = 31;
  const r1 = 33.5;
  const teeth = 16;
  const a0 = Math.PI / 2 - Math.PI / 4;
  const a1 = Math.PI / 2 + Math.PI / 4;
  for (let i = 0; i <= teeth * 2; i++) {
    const a = a0 + ((a1 - a0) * i) / (teeth * 2);
    const r = i % 2 === 0 ? r0 : r1;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return shapeMm(pts);
}

export function buildActuators(kit: RigKit, b: B, bayRoot: Object3D, cfg: TouchDeviceConfig, deviceThicknessMm: number): ActuatorHandles {
  const m = kit.mats;
  const D = DIP_ARM_MM;
  // ── dip tower (40 × 40 × 240) with zip-tie slots on its −X face + blue servo window ──
  const tx = (D.tower.x[0] + D.tower.x[1]) / 2;
  const tz = (D.tower.z[0] + D.tower.z[1]) / 2;
  b.box(m.blackPla, 40, D.tower.height, 40, [tx, D.tower.height / 2, tz], 2);
  b.box(m.blackPla, 70, 6, 70, [tx, 3, tz], 2);
  for (let y = 30; y < D.tower.height; y += 40) {
    b.box(m.darkPort, 1, 4, 22, [D.tower.x[0] - 0.3, y, tz], 0, undefined, true);
    b.box(m.whiteNylon, 3, 3.6, 44, [D.tower.x[0] - 3, y, tz], 0.8, undefined, true);
  }
  b.box(m.servoBlue, 12, 29, 23, [D.tower.x[1] - 4, 150, tz], 1.2);
  b.cyl(m.steelSatin, 5, 14, [6, D.pivotAboveSlot + cfg.slotMm[1], D.pivotZ], [0, 0, Math.PI / 2], 10);
  // wiring loom up the tower (red/blue/green/white, zip-tied) — routed by the rig builder
  const pivotY = cfg.slotMm[1] + D.pivotAboveSlot;

  // ── dip arm (rotates about X at the pivot) ──
  const dip = kit.moving('dip-arm', bayRoot);
  dip.group.position.set(0, pivotY * MM, D.pivotZ * MM);
  // sector gear on the shaft at x 6, teeth facing up/back toward the servo pinion
  dip.add(extrudeG(sectorGear(), 8, 2), m.blackPla, { p: [6 - 4, 0, 0], r: [0, Math.PI / 2, 0] });
  const label = atlasRect(kit.decal, 'gear63', 96, 64, paintRaisedText(D.gearLabel, '#f2f2f2', { shadow: 'rgba(0,0,0,0.4)' }));
  dip.add(planeUvG(12, 8, [label.u0, label.v0, label.u1, label.v1]), kit.decal.material, { p: [10.2, 21, 6], r: [0, Math.PI / 2, 0] });
  dip.add(boxG(0.6, 6, 0.8), m.paperWhite, { p: [10.2, 30.5, 0] });
  dip.add(cylG(14, 10, 16), m.blackPla, { p: [5, 0, 0], r: [0, 0, Math.PI / 2] });
  for (const z of [-4, 4]) dip.add(cylG(4.4, 2, 8), m.blackOxide, { p: [10.5, -4, z], r: [0, 0, Math.PI / 2] });
  // arm plate: 8 thick, 100 long, 26 → 18 wide, pointing −Z
  dip.add(extrudeG(shapeMm([[0, -13], [0, 13], [-100, 9], [-100, -9]]), 8, 1), m.blackPla, { p: [4, 0, 0], r: [0, -Math.PI / 2, 0] });
  for (const z of [-30, -60, -90]) dip.add(cylG(4.6, 1.6, 8), m.blackOxide, { p: [4.6, 0, z], r: [0, 0, Math.PI / 2] });
  // white card insert 54 × 85 × 0.6 (sticks out 60 beyond the arm tip, tip at 140)
  const card = atlasRect(kit.decal, 'collis-card', 160, 256, (c, x, y, w, h) => {
    c.fillStyle = '#f4f4f2';
    c.fillRect(x, y, w, h);
    c.fillStyle = '#9a9ea3';
    c.font = `600 ${w * 0.11}px Arial, sans-serif`;
    c.textAlign = 'center';
    c.fillText('COLLIS PROBE', x + w / 2, y + h * 0.42);
    c.fillText('CARD', x + w / 2, y + h * 0.5);
    c.fillStyle = '#b9bcc0';
    c.fillRect(x + w * 0.2, y + h * 0.06, w * 0.6, h * 0.16);
  });
  const cardMat = kit.mats.cardWhite;
  dip.add(boxG(54, 0.6, 85), cardMat, { p: [0, -4.6, -97.5] });
  dip.add(planeUvG(52, 83, [card.u0, card.v0, card.u1, card.v1]), kit.decal.material, { p: [0, -4.25, -97.5], r: [-Math.PI / 2, 0, 0] });
  dip.add(boxG(25, 0.8, 70), m.ribbonGrey, { p: [0, 4.5, -40] });

  // ── tap paddle (vertical pivot at the tower's +X side) ──
  const P = TAP_PADDLE_MM;
  const tap = kit.moving('tap-paddle', bayRoot);
  tap.group.position.set(P.pivot[0] * MM, P.pivot[1] * MM, P.pivot[2] * MM);
  const nfcX = cfg.homeMm[0] + cfg.probeOriginMm[0] + cfg.nfcMm[0];
  const nfcZ = cfg.homeMm[1] + cfg.probeOriginMm[1] + cfg.nfcMm[1];
  const dx = nfcX - P.pivot[0];
  const dz = nfcZ - P.pivot[2];
  const L = Math.hypot(dx, dz);
  const tapInYaw = Math.atan2(-dz, dx);
  const drop = P.pivot[1] - P.carryY;
  tap.add(cylG(12, 16, 14), m.blackPla, { p: [0, 0, 0] });
  tap.add(boxG(L, 8, 12), m.blackPla, { p: [L / 2, 4, 0] });
  tap.add(boxG(10, drop, 10), m.blackPla, { p: [L, 4 - drop / 2, 0] });
  tap.add(rboxG(P.paddle[0], P.paddle[2], P.paddle[1], 3, 1), m.blackPla, { p: [L, -drop + P.paddle[2] / 2 - 2, 0] });
  const coilMat = kit.mats.copperCoil;
  tap.add(new PlaneGeometry(52 * MM, 34 * MM), coilMat, { p: [L, -drop + P.paddle[2] - 1.9, 0], r: [-Math.PI / 2, 0, 0] });
  tap.group.rotation.y = 0;

  // ── phone sled on an MGN9 rail; power pusher pointing −X ──
  const S = PHONE_SLED_MM;
  const railX = cfg.sledRailXMm;
  b.box(m.steelSatin, 9, 6.5, S.railZ[1] - S.railZ[0], [railX, 3.25, (S.railZ[0] + S.railZ[1]) / 2]);
  for (let z = S.railZ[0] + 20; z < S.railZ[1]; z += 60) b.screw([railX, 6.5, z], [0, 0, 0], false, 0.45);
  const sled = kit.moving('phone-sled', bayRoot);
  sled.group.position.set(railX * MM, 0, S.backZ * MM);
  const [sw, sd, sh] = S.sled;
  sled.add(rboxG(sw, sh, sd, 2, 1), m.blackPla, { p: [0, 6.5 + sh / 2, 0] });
  sled.add(boxG(20, 6, 12), m.steelSatin, { p: [0, 8, 0] });
  // small phone tray on top
  sled.add(rboxG(28, 4, 60, 1.5, 1), m.blackPla, { p: [0, 6.5 + sh + 2, 0] });
  const pusherY = 100 - deviceThicknessMm / 2;
  const postH = Math.max(8, pusherY - (6.5 + sh));
  sled.add(boxG(10, postH + 6, 14), m.blackPla, { p: [-sw / 2 + 5, 6.5 + sh + postH / 2 - 3, 0] });
  sled.add(boxG(20, 11, 10), m.steelChrome, { p: [-sw / 2 - 2, pusherY, 0] });
  const finger = new Object3D();
  finger.name = 'pusher-finger';
  sled.group.add(finger);
  kit.fingers.add(finger, { p: [-sw / 2 - 16, pusherY, 0] });
  return { dip, pivotY, tap, tapInYaw, sled, finger, sledForwardZ: cfg.powerKeyZMm, sledBackZ: S.backZ, pusherY };
}

/** Dip arm angle (deg from horizontal, + = up) for an actuator state, with In/Out from §2.7. */
export const DIP_IN_DEG = DIP_ARM_MM.inDeg;
export const DIP_OUT_DEG = DIP_ARM_MM.outDeg;
export type { V3 };
