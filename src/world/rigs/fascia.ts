/**
 * Touch-rig front fascia (World §2.9, IMG-T): ears and bars with M5 button heads, the black POWER
 * panel (raised `POWER` / `MAIN` / `MOTOR` lettering, chrome LED bezels with green lenses, two
 * chrome toggle switches, green LabSim logo), the tablet frame with clamps and mount stem, the
 * 8" status tablet (black glass, live canvas screen) and the side label panel (`SETI`, USB ports).
 * Bay-local mm (front face at z +3).
 */
import { Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from 'three';
import { FASCIA_MM, type TouchRigDef } from '../layout';
import { logoRect } from '../devices/common';
import { MM, DEG } from './kit/geom';
import type { LedHandle } from './kit/instances';
import type { B, V3 } from './parts';

export interface FasciaHandles {
  ledMain: LedHandle;
  ledMotor: LedHandle;
  /** Toggle bat pivots (rotation.x = 72° ON / 108° OFF). */
  batMain: Object3D;
  batMotor: Object3D;
  /** Tablet live screen plane (hidden while off). */
  tabletScreen: Mesh;
}

export const TOGGLE_ON_X = (90 - 18) * DEG;
export const TOGGLE_OFF_X = (90 + 18) * DEG;

export function buildFascia(b: B, rig: TouchRigDef, screenParent: Object3D): FasciaHandles {
  const m = b.m;
  const F = FASCIA_MM;
  const z3 = F.frontZ;
  // ears (3 mm plates on the rails) + 2 screws each
  for (const s of [-1, 1]) {
    b.span(m.blackPla, [s * F.ears.x[0], F.ears.y[0], 0], [s * F.ears.x[1], F.ears.y[1], z3]);
    for (const y of [30, 190]) b.screw([s * 233, y, z3]);
  }
  // top & bottom bars (450 × 30 × 20 deep) with 4 screws each
  for (const bar of [F.topBar, F.bottomBar]) {
    b.span(m.blackPla, [-225, bar.y[0], z3 - bar.depth], [225, bar.y[1], z3], 1.2);
    for (const x of bar.screwsX) b.screw([x, (bar.y[0] + bar.y[1]) / 2, z3]);
  }
  // POWER panel: box with a 3 mm rim around a recessed face
  const P = F.powerPanel;
  const [px0, px1] = P.x;
  const [py0, py1] = P.y;
  b.span(m.blackPla, [px0, py0, z3 - P.depth], [px1, py1, z3 - P.recess], 1.5);
  b.span(m.blackPla, [px0, py0, z3 - P.recess], [px0 + 4, py1, z3], 0.8);
  b.span(m.blackPla, [px1 - 4, py0, z3 - P.recess], [px1, py1, z3], 0.8);
  b.span(m.blackPla, [px0, py1 - 4, z3 - P.recess], [px1, py1, z3], 0.8);
  b.span(m.blackPla, [px0, py0, z3 - P.recess], [px1, py0 + 4, z3], 0.8);
  const fz = z3 - P.recess + 0.15;
  b.text(P.title.text, P.title.color, 52, 15, { p: [P.title.at[0], P.title.at[1], fz] }, { shadow: 'rgba(0,0,0,0.9)' });
  b.text(P.labelMain.text, P.title.color, 22, 8.5, { p: [P.labelMain.at[0], P.labelMain.at[1], fz] }, { shadow: 'rgba(0,0,0,0.9)' });
  b.text(P.labelMotor.text, P.title.color, 28, 8.5, { p: [P.labelMotor.at[0], P.labelMotor.at[1], fz] }, { shadow: 'rgba(0,0,0,0.9)' });
  b.decal(logoRect(b.kit, 'wordmark', '#2fd468'), 62, 18.6, { p: [P.logo.at[0], P.logo.at[1], fz + 1.0] });
  // LED bezels: chrome ring + green domed lens
  const leds: LedHandle[] = [];
  for (const at of [P.ledMain, P.ledMotor]) {
    b.cyl(m.steelChrome, P.led.ringMm, 2.4, [at[0], at[1], fz + 1.1], [Math.PI / 2, 0, 0], 20);
    b.cyl(m.minixBlack, P.led.lensMm + 1, 2.6, [at[0], at[1], fz + 1.3], [Math.PI / 2, 0, 0], 20);
    leds.push(b.kit.leds.add(null, b.mat({ p: [at[0], at[1], fz + 2.5], s: [P.led.lensMm, P.led.lensMm, P.led.domeMm * 1.4] }), '#2bff6a', 7, '#06240f'));
  }
  // toggle switches: knurled chrome nut + threaded bushing; bats are instanced (kit.toggleBats)
  const bats: Object3D[] = [];
  for (const at of [P.switchMain, P.switchMotor]) {
    b.cyl(m.steelChrome, P.toggle.nutMm[0], P.toggle.nutMm[1], [at[0], at[1], fz + 1.5], [Math.PI / 2, 0, 0], 12);
    b.cyl(m.steelSatin, 7, 4, [at[0], at[1], fz + 4.5], [Math.PI / 2, 0, 0], 12);
    const pivot = new Object3D();
    pivot.name = 'toggle-pivot';
    b.mat({ p: [at[0], at[1], fz + 6.5] }).decompose(pivot.position, pivot.quaternion, pivot.scale);
    const holder = new Object3D();
    holder.add(pivot);
    b.kit.root.add(holder);
    pivot.rotation.set(TOGGLE_ON_X, 0, 0);
    b.kit.toggleBats.add(pivot);
    bats.push(pivot);
  }

  // tablet frame (230 × 146 × 14, window 212 × 130) + clamps + mount stem (IMG-T)
  const T = F.tabletFrame;
  const [cx, cy] = T.centre;
  const [ow, oh, od] = T.outer;
  const [ww, wh] = T.window;
  const fz0 = 6 - od;
  const fz1 = 6;
  b.span(m.blackPla, [cx - ow / 2, cy - oh / 2, fz0], [cx - ww / 2, cy + oh / 2, fz1], 1.5);
  b.span(m.blackPla, [cx + ww / 2, cy - oh / 2, fz0], [cx + ow / 2, cy + oh / 2, fz1], 1.5);
  b.span(m.blackPla, [cx - ww / 2, cy + wh / 2, fz0], [cx + ww / 2, cy + oh / 2, fz1], 1.5);
  b.span(m.blackPla, [cx - ww / 2, cy - oh / 2, fz0], [cx + ww / 2, cy - wh / 2, fz1], 1.5);
  b.span(m.blackPla, [cx - 30, 175, fz1 - 18], [cx + 30, 189, fz1 + 2], 2);
  b.span(m.blackPla, [cx - 30, 31, fz1 - 18], [cx + 30, 45, fz1 + 2], 2);
  b.span(m.blackPla, [cx - 20, -25, fz1 - 22], [cx + 20, 35, fz1 - 2], 2);
  for (const sx of [-1, 1]) {
    b.screw([cx + sx * 20, 182, fz1 + 2], [Math.PI / 2, 0, 0], false, 0.6);
    b.screw([cx + sx * 20, 38, fz1 + 2], [Math.PI / 2, 0, 0], false, 0.6);
    b.screw([cx + sx * 10, 0, fz1 - 2], [Math.PI / 2, 0, 0], false, 0.6);
  }
  // status tablet: 210 × 128 × 9 black-glass slab; the active area is the live screen
  const TB = F.tablet;
  const gz = TB.glassZ;
  b.box(m.bezelBlack, TB.body[0], TB.body[1], TB.body[2], [TB.centre[0], TB.centre[1], gz - TB.body[2] / 2], 6);
  b.box(m.minixBlack, TB.body[0] - 2, TB.body[1] - 2, 3, [TB.centre[0], TB.centre[1], gz - TB.body[2] + 1], 5);
  b.cyl(m.screenGlass, TB.cameraDotMm, 0.3, [TB.centre[0], TB.centre[1] + TB.body[1] / 2 - TB.bezel.tb / 2, gz + 0.05], [Math.PI / 2, 0, 0], 12, true);
  const [aw, ah] = TB.activeMm;
  b.add(new PlaneGeometry(aw * MM, ah * MM), m.screenGlass, { p: [TB.centre[0], TB.centre[1], gz + 0.05] });
  const screen = new Mesh(new PlaneGeometry(aw * MM, ah * MM), new MeshBasicMaterial({ color: '#000000' }));
  b.mat({ p: [TB.centre[0], TB.centre[1], gz + 0.12] }).decompose(screen.position, screen.quaternion, screen.scale);
  screen.matrixAutoUpdate = false;
  screen.updateMatrix();
  screenParent.add(screen);
  screen.name = `tablet:${rig.id}`;
  screen.visible = false;
  b.add(new PlaneGeometry((aw + 2) * MM, (ah + 2) * MM), m.screenGlassOverlay, { p: [TB.centre[0], TB.centre[1], gz + 0.3] }, true);
  // micro-USB cable from the tablet's left side looping to the POWER box (IMG-T)
  b.tube(m.cable('cableBlack'), [[-105, 120, gz - 3], [-118, 121, gz + 2], [-132, 112, gz + 10], [-142, 92, gz + 12], [-141, 70, gz + 4], [-140, 60, z3 - 10]], 3.5, 6);
  b.box(m.minixBlack, 12, 7, 6, [-109, 120, gz - 3], 1);

  // side label panel (85 × 130 × 43): vertical letters + two vertical USB-A ports
  const S = F.sidePanel;
  b.span(m.blackPla, [S.x[0], S.y[0], z3 - S.depth], [S.x[1], S.y[1], z3], 1.5);
  if (rig.sidePanelText) {
    const n = rig.sidePanelText.length;
    const h = n * (S.letters.capMm / 0.72) * 0.86;
    b.text(rig.sidePanelText, S.letters.color, 34, Math.min(124, h), { p: [S.letters.x, 108, z3 + 0.15] }, { vertical: true, family: '"Arial Black", Arial, sans-serif', weight: 900, shadow: 'rgba(0,0,0,0.75)' });
  }
  S.usbPorts.forEach((pt, i) => {
    b.box(m.steelSatin, 7, 15, 1.5, [pt[0], pt[1], z3 + 0.5], 0.5);
    b.box(m.darkPort, 5.6, 13.4, 1, [pt[0], pt[1], z3 + 0.9], 0, undefined, true);
    b.box(m.usbBlue, 1.6, 11, 1, [pt[0] - 1, pt[1], z3 + 1.0], 0, undefined, true);
    b.text(S.usbLabels[i]!, '#bfc2c6', 26, 5, { p: [pt[0] + 10, pt[1] - 6, z3 + 0.15], r: [0, 0, Math.PI / 2] }, { shadow: 'rgba(0,0,0,0.6)' });
  });
  return { ledMain: leds[0]!, ledMotor: leds[1]!, batMain: bats[0]!, batMotor: bats[1]!, tabletScreen: screen };
}

/** Bay-local hit proxies of the fascia parts (centre, size mm). */
export const FASCIA_HITS: Readonly<Record<string, { p: V3; s: V3 }>> = {
  tablet: { p: [0, 110, 0], s: [214, 132, 16] },
  'power-panel': { p: [-182.5, 150, -12], s: [85, 50, 34] },
  'switch-main': { p: [-203, 92, 8], s: [26, 34, 22] },
  'switch-motor': { p: [-162, 92, 8], s: [26, 34, 22] },
  'side-panel': { p: [182.5, 110, -15], s: [85, 130, 38] },
};
