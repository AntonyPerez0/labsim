/**
 * Black PLA device cradles (World §2.4): every device lies face-up with its screen level at bay
 * y 100 and its chip-slot edge at z −160. Handheld cradles are angled trays (flared side walls with
 * 30° chamfers, a wedge under the printer end, front lip with a card cut-out, two side clamps with
 * 2 × M2.5 bolts each); terminal cradles are flat trays / wedge docks with corner clamps. Screwed to
 * the shelf with 4 × M5 button heads. Bay-local mm.
 */
import type { CradleId } from '../layout';
import { boxG, sideProfileG } from './kit/geom';
import type { B } from './parts';

/** Device footprint in bay mm: x0..x1 (left/right), z0..z1 (rear/front), bottom y, top y (= 100). */
export interface Footprint {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  bottom: number;
  /** Optional printer bulge: z range and its (lower) bottom. */
  bulge?: { z0: number; z1: number; bottom: number };
}

function screwsAround(b: B, f: { x0: number; x1: number; z0: number; z1: number }, y: number): void {
  for (const x of [f.x0 + 8, f.x1 - 8]) for (const z of [f.z0 + 8, f.z1 - 8]) b.screw([x, y, z], [0, 0, 0]);
}

/** Angled handheld cradle (Flex family, Compact). */
function handheld(b: B, id: CradleId, f: Footprint): void {
  const m = b.m;
  const pla = m.blackPla;
  const L = f.z1 - f.z0 + 10;
  const zc = (f.z0 + f.z1) / 2;
  const W = f.x1 - f.x0;
  const xc = (f.x0 + f.x1) / 2;
  // foot plate (screwed to the shelf)
  const foot = { x0: xc - W / 2 - 26, x1: xc + W / 2 + 26, z0: f.z0 - 10, z1: f.z1 + 6 };
  b.span(pla, [foot.x0, 0, foot.z0], [foot.x1, 5, foot.z1], 2);
  screwsAround(b, foot, 5);
  // bed plate under the body (on two transverse ribs) + wedge under the printer end (levels the screen)
  const bodyZ0 = f.bulge ? f.bulge.z1 : f.z0;
  b.span(pla, [f.x0 + 3, f.bottom - 5, bodyZ0], [f.x1 - 3, f.bottom, f.z1 - 4], 1.5);
  for (const z of [bodyZ0 + 14, f.z1 - 34]) b.span(pla, [f.x0 - 1, 5, z - 4], [f.x1 + 1, f.bottom - 5, z + 4], 1);
  if (f.bulge) b.span(pla, [xc - W / 2 + 10, 5, f.bulge.z0 + 2], [xc + W / 2 - 10, f.bulge.bottom, f.bulge.z1], 3);
  // trapezoid side plates (IMG-G "angled cradle": long top edge under the device, slanted ends
  // down to a shorter foot); the white device sides stay visible above them (VID)
  const wallTop = Math.min(97, f.bottom + 8);
  const prof: [number, number][] = [
    [f.z1 - 34, 5],
    [bodyZ0 + 20, 5],
    [f.z0 - 6, wallTop],
    [f.z1 + 6, wallTop],
  ];
  for (const s of [-1, 1]) {
    const inner = s < 0 ? f.x0 - 1 : f.x1 + 1;
    b.add(sideProfileG(prof, 6), pla, { p: [inner + s * 3, 0, 0] });
    // gusset to the foot plate
    b.span(pla, [inner + s * 6, 5, zc - 30], [inner + s * 22, 14, zc + 30], 1.5);
    // side clamp with 2 × M2.5 bolts
    b.span(pla, [inner + s * 0.5, wallTop - 4, zc - 15], [inner - s * 6, wallTop + 6, zc + 15], 1.5);
    for (const dz of [-8, 8]) b.screw([inner - s * 2.5, wallTop + 6, zc + dz], [0, 0, 0], false, 0.5);
  }
  void L;
  // front lip below the chip slot with the 60 × 14 card cut-out (two cheeks)
  for (const s of [-1, 1]) b.span(pla, [xc + s * 30, 5, f.z1 + 1], [xc + s * (W / 2 + 8), f.bottom - 2, f.z1 + 7], 1.5);
  b.span(pla, [xc - 30, 5, f.z1 + 1], [xc + 30, f.bottom - 16, f.z1 + 7], 1.5);
  void id;
}

/** Flat tray / wedge dock for terminals (Station heads, Duo, Mini). */
function tray(b: B, f: Footprint, wall = 8, clampH = 12): void {
  const pla = b.m.blackPla;
  const x0 = f.x0 - wall;
  const x1 = f.x1 + wall;
  const z0 = f.z0 - wall;
  const z1 = f.z1 + wall;
  b.span(pla, [x0, 0, z0], [x1, 6, z1], 2);
  screwsAround(b, { x0, x1, z0, z1 }, 6);
  // support block under the device
  b.span(pla, [f.x0 + 12, 6, f.z0 + 12], [f.x1 - 12, f.bottom, f.z1 - 12], 3);
  // rim walls up to just below the face
  const top = Math.min(96, f.bottom + clampH);
  b.span(pla, [x0, 6, z0], [x1, top, f.z0], 1.5);
  b.span(pla, [x0, 6, f.z1], [x1, top - 6, z1], 1.5);
  b.span(pla, [x0, 6, z0], [f.x0, top, z1], 1.5);
  b.span(pla, [f.x1, 6, z0], [x1, top, z1], 1.5);
  // corner clamps (L blocks over the bezel corners) with M2.5 bolts
  for (const [cx, cz] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]] as const) {
    const sx = cx === f.x0 ? 1 : -1;
    const sz = cz === f.z0 ? 1 : -1;
    b.span(pla, [cx - sx * wall, top, cz - sz * wall], [cx + sx * 10, 101.5, cz + sz * 10], 1.5);
    b.screw([cx + sx * 1, 101.5, cz + sz * 1], [0, 0, 0], false, 0.5);
  }
}

/** Mini wedge dock: sloped bed under the Mini, open back for the printer door. */
function miniDock(b: B, f: Footprint): void {
  const pla = b.m.blackPla;
  const xc = (f.x0 + f.x1) / 2;
  b.span(pla, [xc - 111, 0, f.z0 - 6], [xc + 111, 6, f.z1 + 4], 2);
  screwsAround(b, { x0: xc - 111, x1: xc + 111, z0: f.z0 - 6, z1: f.z1 + 4 }, 6);
  for (const s of [-1, 1]) {
    const x = s < 0 ? f.x0 - 4 : f.x1 + 4;
    const prof: [number, number][] = [
      [f.z1 + 4, 6],
      [f.z0 + 20, 6],
      [f.z0 + 20, 96],
      [f.z1 + 4, 70],
    ];
    b.add(sideProfileG(prof, 8), pla, { p: [x, 0, 0] });
  }
  b.span(pla, [f.x0 + 10, 6, f.z0 + 30], [f.x1 - 10, f.bottom, f.z1 - 10], 3);
}

export function buildCradle(b: B, id: CradleId, prints: Footprint[]): void {
  switch (id) {
    case 'flex-cradle-gen3':
    case 'flex-cradle-pocket':
    case 'flex-cradle-gen1':
    case 'flex-cradle-gen2':
    case 'compact-cradle':
      handheld(b, id, prints[0]!);
      break;
    case 'mini-dock':
      miniDock(b, prints[0]!);
      break;
    case 'station-tray':
      tray(b, prints[0]!, 10, 14);
      break;
    case 'station-duo-tray':
      for (const f of prints) tray(b, f, 8, 14);
      break;
  }
  void boxG;
}
