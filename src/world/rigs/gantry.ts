/**
 * XY gantry of a touch rig (World §2.5–§2.6): fixed 2040 front beam with hangers, X idler, X
 * NEMA-17 + GT2 belt, X limit switch (static); the moving beam carriage (plate, 4 V-wheels, belt
 * bridge, riser + gusset, 560 mm 2020 cantilever arm, Y motor, Y idler, Y belt, Y limit switch,
 * orange coil cable) carrying the arm carriage (plate, 4 V-wheels, 2020 drop, the blue push-pull
 * solenoid with its plunger/spring/E-clip/rubber tip and the JST connector); the X and Y belt
 * clamps with the neodymium magnets of the magnetic lock (+ red "broken" dot).
 * All numbers are bay-local mm; moving groups are positioned by the binder.
 */
import { Mesh, Object3D, type BufferGeometry } from 'three';
import { GANTRY_MM, SOLENOID_MM, type TouchDeviceConfig, limitSwitchesMm } from '../layout';
import type { RigKit } from './kit/context';
import { MM, boxG, cylG, rboxG, helixPoints, sphereG, torusG, tubeG, vslotG, extrudeG, shapeMm } from './kit/geom';
import type { Moving } from './kit/moving';
import type { B, V3 } from './parts';

export interface GantryHandles {
  /** Beam carriage (x = cx). */
  beam: Moving;
  /** Arm carriage, child of the beam carriage (z = az). */
  arm: Moving;
  /** Plunger, child of the arm carriage (y = −stroke). */
  plunger: Moving;
  /** X belt clamp (x = clamp cx) and Y belt clamp (child of the beam carriage, z = clamp az). */
  xClamp: Moving;
  yClamp: Moving;
  xDot: Mesh;
  yDot: Mesh;
  /** Coil cable group inside the beam carriage (scale.z = stretch). */
  coil: Object3D;
  coilBaseLen: number;
  /** Loose solenoid connector (INC15): the plug group on the arm carriage. */
  connector: Object3D;
  /** Limit-switch anchors (static, moved when the home changes — JOHNNY-5 swap). */
  limitX: Object3D;
  limitY: Object3D;
  /** Anchors used for sound positions / hit proxies. */
  motorX: Object3D;
  motorY: Object3D;
}

/** Static gantry parts + the moving groups. `bayRoot` = Object3D placed at the bay origin. */
export function buildGantry(kit: RigKit, b: B, bayRoot: Object3D, cfg: TouchDeviceConfig): GantryHandles {
  const m = kit.mats;
  const G = GANTRY_MM;
  // ── static: front beam, hangers, idler, X motor, belt ──
  const beamY = (G.beam.y[0] + G.beam.y[1]) / 2;
  const beamZ = (G.beam.z[0] + G.beam.z[1]) / 2;
  b.add(vslotG('2040', 440), m.aluminium, { p: [0, beamY, beamZ], r: [0, Math.PI / 2, 0] });
  for (const s of [-1, 1]) {
    b.box(m.blackPla, 8, 60, 70, [s * 224, beamY, -28], 1.5);
    b.screw([s * 228.5, beamY + 18, -12], [0, 0, -s * Math.PI / 2], false, 0.6);
    b.screw([s * 228.5, beamY - 18, -12], [0, 0, -s * Math.PI / 2], false, 0.6);
  }
  // X idler on its plate (left end)
  b.box(m.blackPla, 60, 60, 6, [G.xIdler[0], G.xIdler[1], G.xIdler[2] - 12], 2);
  b.cyl(m.aluminium, 18, 9, [G.xIdler[0], G.xIdler[1], G.xIdler[2]], [Math.PI / 2, 0, 0], 18);
  b.cyl(m.steelSatin, 5, 20, [G.xIdler[0], G.xIdler[1], G.xIdler[2] - 4], [Math.PI / 2, 0, 0], 8);
  // X motor (instanced NEMA-17) on a printed bracket, shaft +Z, pulley at z ≈ −62
  const motorX = new Object3D();
  motorX.name = 'stepper-x';
  motorX.position.set(G.xMotor[0] * MM, G.xMotor[1] * MM, (G.xIdler[2] - 34) * MM);
  motorX.rotation.x = Math.PI / 2;
  bayRoot.add(motorX);
  kit.nemaBody.add(motorX);
  kit.nemaMetal.add(motorX);
  b.box(m.blackPla, 50, 8, 50, [G.xMotor[0], G.xMotor[1] - 25, G.xIdler[2] - 34], 2);
  b.box(m.blackPla, 8, 50, 60, [G.xMotor[0] + 25, G.xMotor[1], G.xIdler[2] - 30], 2);
  // X belt: two strands between idler and pulley + the wraps
  const bx0 = G.xIdler[0];
  const bx1 = G.xMotor[0];
  const bz = G.xIdler[2];
  for (const y of [G.xIdler[1] - 6.1, G.xIdler[1] + 6.1]) b.box(m.belt, bx1 - bx0, 1.4, 6, [(bx0 + bx1) / 2, y, bz], 0, undefined, true);
  b.add(torusG(12.2 + 1.4, 1.4, 4, 10, Math.PI), m.belt, { p: [bx0, G.xIdler[1], bz], r: [0, 0, Math.PI / 2] }, true);
  b.add(torusG(12.2 + 1.4, 1.4, 4, 10, Math.PI), m.belt, { p: [bx1, G.xIdler[1], bz], r: [0, 0, -Math.PI / 2] }, true);
  // limit-switch anchors (positions updated with the home)
  const ls = limitSwitchesMm(cfg);
  const limitX = new Object3D();
  limitX.name = 'limit-x';
  limitX.position.set(ls.x[0] * MM, ls.x[1] * MM, ls.x[2] * MM);
  bayRoot.add(limitX);
  kit.limitSwitches.add(limitX, { p: [0, 5, 0] });
  // printed slide bracket under the X switch (moves with it, merged into the anchor's own mesh is
  // not possible → part of the instanced switch body)

  // ── moving: beam carriage ──
  const beam = kit.moving('beam-carriage', bayRoot);
  // carriage plate on the front face of the beam
  beam.add(boxG(70, 60, 6), m.anodisedBlack, { p: [0, beamY, -32] });
  for (const x of [-25, 25]) for (const y of [beamY + 25, beamY - 25]) {
    kit.wheels.add(beam.group, { p: [x, y, -40], r: [Math.PI / 2, 0, 0] });
    beam.add(cylG(5, 14, 8), m.steelSatin, { p: [x, y, -34], r: [Math.PI / 2, 0, 0] });
  }
  // belt bridge over the beam to the rear strand (+ steel striker plate for the magnets)
  beam.add(boxG(60, 14, 34), m.blackPla, { p: [0, 303, -46] });
  beam.add(boxG(30, 16, 6), m.blackPla, { p: [0, 290, -63] });
  beam.add(boxG(26, 12, 1.2), m.steelChrome, { p: [0, 289, -66.5] });
  // riser 2020 + printed gusset
  beam.add(vslotG('2020', 30), m.aluminium, { p: [0, (G.riser.y[0] + G.riser.y[1]) / 2, G.riser.z], r: [-Math.PI / 2, 0, 0] });
  beam.add(extrudeG(shapeMm([[0, 0], [40, 0], [0, 40]]), 6, 1), m.blackPla, { p: [-3, G.riser.y[0], G.riser.z - 10], r: [0, Math.PI / 2, 0] });
  // cantilever arm 2020 × 560
  const armY = (G.arm.y[0] + G.arm.y[1]) / 2;
  beam.add(vslotG('2020', G.arm.lengthMm), m.aluminium, { p: [0, armY, (G.arm.z[0] + G.arm.z[1]) / 2] });
  beam.add(boxG(24, 6, 24), m.blackPla, { p: [0, armY + 13, G.arm.z[0] + 12] });
  // Y motor standing on the arm front end, shaft down; bracket
  const motorY = new Object3D();
  motorY.name = 'stepper-y';
  motorY.position.set(0, (G.yMotor.y + 2) * MM, G.yMotor.z * MM);
  motorY.rotation.x = Math.PI;
  beam.group.add(motorY);
  kit.nemaBody.add(motorY);
  kit.nemaMetal.add(motorY);
  beam.add(boxG(48, 6, 60), m.blackPla, { p: [0, 372, G.yMotor.z + 6] });
  // Y idler + belt loop in the plane y 368
  beam.add(cylG(18, 9, 18), m.aluminium, { p: [0, G.yIdler.y, G.yIdler.z] });
  beam.add(boxG(10, 5, 18), m.blackPla, { p: [0, G.yIdler.y + 8, G.yIdler.z] });
  const yLen = G.yIdler.z - G.yMotor.z;
  for (const x of [-6.1, 6.1]) beam.add(boxG(1.4, 6, Math.abs(yLen)), m.belt, { p: [x, G.yIdler.y, (G.yIdler.z + G.yMotor.z) / 2] });
  // Y limit switch on its slide clamp (anchor moves with the home)
  const limitY = new Object3D();
  limitY.name = 'limit-y';
  limitY.position.set(ls.y[0] * MM - 0, ls.y[1] * MM, ls.y[2] * MM);
  limitY.rotation.set(0, -Math.PI / 2, 0);
  // stored relative to the beam carriage (x relative to cx)
  limitY.position.x = G.limitY.xFromCx * MM;
  beam.group.add(limitY);
  kit.limitSwitches.add(limitY, { p: [0, 0, 0] });
  // orange PU coil cable from the riser to the arm carriage (stretches with az)
  const coilBaseLen = 200;
  const coil = new Object3D();
  coil.name = 'coil';
  coil.position.set(-14 * MM, 378 * MM, (G.riser.z - 8) * MM);
  beam.group.add(coil);
  kit.coils.add(coil);

  // ── moving: arm carriage (child of the beam carriage) ──
  const arm = beam.child('arm-carriage');
  kit.track(arm);
  arm.add(boxG(6, 50, 60), m.anodisedBlack, { p: [13, armY, 0] });
  for (const z of [-20, 20]) for (const y of [armY + 22, armY - 22]) {
    kit.wheels.add(arm.group, { p: [0, y, z], r: [0, 0, Math.PI / 2] });
    arm.add(cylG(5, 18, 8), m.steelSatin, { p: [6, y, z], r: [0, 0, Math.PI / 2] });
  }
  arm.add(boxG(18, 30, 30), m.blackPla, { p: [22, armY - 12, 0] });
  // drop 2020 (vertical, 175 long) at x +26
  const dropX = G.drop.xFromCx;
  arm.add(vslotG('2020', G.drop.y[1] - G.drop.y[0]), m.aluminium, { p: [dropX, (G.drop.y[0] + G.drop.y[1]) / 2, 0], r: [-Math.PI / 2, 0, 0] });
  // solenoid head: printed L-bracket, chrome U-frame, blue tape coil + sticker
  const S = SOLENOID_MM;
  // the L-bracket's vertical leg and the U-frame's back plate sit BEHIND the coil (−Z) so the blue
  // taped coil reads from the front and both sides (IMG-T / VID)
  const fy = (S.frameY[0] + S.frameY[1]) / 2;
  arm.add(boxG(26, 5, 22), m.blackPla, { p: [dropX, S.dropBottomY - 2.5, -2] });
  arm.add(boxG(22, 26, 5), m.blackPla, { p: [dropX + 1, S.dropBottomY - 14, -12] });
  arm.add(boxG(16, 1.2, 15), m.steelChrome, { p: [dropX + 1, S.frameY[1], -1] });
  arm.add(boxG(16, 1.2, 15), m.steelChrome, { p: [dropX + 1, S.frameY[0], -1] });
  arm.add(boxG(16, 30, 1.2), m.steelChrome, { p: [dropX + 1, fy, -8.6] });
  // taped coil: a slightly squared cylinder (tape over the winding) + white printed sticker
  arm.add(rboxG(15, 22, 14, 4.5, 2), m.solenoidBlue, { p: [dropX + 1, fy, -0.6] });
  arm.add(boxG(7, 9, 0.3), m.paperWhite, { p: [dropX + 1, fy + 2, 6.6] });
  // wires: red/black pair from the coil up the drop to the JST on the arm carriage
  arm.add(tubeG([[dropX + 6, 140, 4], [dropX + 12, 170, 6], [dropX + 12, 260, 8], [24, 318, 10]], 1.6, 5, 4), m.wire('red'));
  arm.add(tubeG([[dropX + 6, 140, 2], [dropX + 13, 170, 3], [dropX + 13, 260, 5], [24, 318, 6]], 1.6, 5, 4), m.wire('black'));
  // JST connector socket on the carriage; the plug is its own group (loose state hangs 25 mm lower)
  arm.add(boxG(10, 6, 6), m.whiteNylon, { p: [24, 322, 8] });
  const connector = new Object3D();
  connector.name = 'solenoid-connector';
  arm.group.add(connector);
  kit.plugs.add(connector, { p: [24, 315.5, 8] });
  // plunger: rod, spring, E-clip, rubber tip (moves down by the stroke)
  const plunger = arm.child('plunger');
  kit.track(plunger);
  plunger.add(cylG(6, 44, 12), m.steelChrome, { p: [dropX + 1, S.tipRestY + 6 + 22, 0] });
  plunger.add(cylG(4, 14, 10), m.steelChrome, { p: [dropX + 1, S.frameY[1] + 6, 0] });
  plunger.add(tubeG(helixPoints(dropX + 1, 0, S.frameY[1] + 1, S.frameY[1] + 11, 3.5, 6, 10).map(([x, y, z]) => [x, y, z] as V3), 0.8, 4, 2), m.steelChrome);
  plunger.add(torusG(5, 1, 4, 12), m.steelChrome, { p: [dropX + 1, S.clipTopY - 1, 0], r: [Math.PI / 2, 0, 0] });
  plunger.add(cylG(7, 6, 14), m.rubberTip, { p: [dropX + 1, S.tipRestY + 3, 0] });

  // ── magnetic lock clamps ──
  const xClamp = kit.moving('x-clamp', bayRoot);
  kit.clampBodies.add(xClamp.group, { p: [0, 289, -74] });
  for (const x of [-7, 7]) kit.magnets.add(xClamp.group, { p: [x, 289, -68.5], r: [Math.PI / 2, 0, 0] });
  const yClamp = beam.child('y-clamp');
  kit.track(yClamp);
  kit.clampBodies.add(yClamp.group, { p: [6, 386, 0], r: [0, Math.PI / 2, 0] });
  for (const z of [-7, 7]) kit.magnets.add(yClamp.group, { p: [6, 379.5, z] });
  const dotGeo: BufferGeometry = sphereG(3, 8, 6);
  const xDot = new Mesh(dotGeo, m.lockDot);
  xDot.position.set(0, 296.5 * MM, -74 * MM);
  xDot.visible = false;
  xClamp.group.add(xDot);
  const yDot = new Mesh(dotGeo, m.lockDot);
  yDot.position.set(6 * MM, 392.5 * MM, 0);
  yDot.visible = false;
  yClamp.group.add(yDot);
  return { beam, arm, plunger, xClamp, yClamp, xDot, yDot, coil, coilBaseLen, connector, limitX, limitY, motorX, motorY };
}

/** Move both limit-switch anchors to a new home (JOHNNY-5 re-calibration). */
export function placeLimitSwitches(h: GantryHandles, cfg: TouchDeviceConfig): void {
  const ls = limitSwitchesMm(cfg);
  h.limitX.position.set(ls.x[0] * MM, ls.x[1] * MM, ls.x[2] * MM);
  h.limitY.position.z = ls.y[2] * MM;
}
