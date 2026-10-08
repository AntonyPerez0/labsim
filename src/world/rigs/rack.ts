/**
 * Touch-robot racks A and B (World §2.1–§2.3, §2.8 rack top) and the generic 4-post shelving unit
 * used by the Callus shelf, the ADB shelf and the tethered bench (§2.12–§2.14).
 *
 * Rack-local frame (mm): origin = footprint centre on the floor, +X right (facing the front), +Y up,
 * +Z toward the aisle. Front rail plane z +450, rear −450.
 */
import { BAYS, RACK_FRAME, RACK_TOP_PLATE_Y, RACK_DISTRIBUTION, AC_STRIPS, TOUCH_RIGS, uBottomMm, type RackDef } from '../layout';
import type { RigKit } from './kit/context';
import { boxG, planeUvG } from './kit/geom';
import type { LedHandle } from './kit/instances';
import { B, buildAcStrip, buildPi, type PiHandles, type StripHandles, type V3 } from './parts';
import { Frame } from './kit/frame';

export interface RackHandles {
  rack: RackDef;
  frame: Frame;
  dist: { led5v: LedHandle; led24v: LedHandle };
  strip: StripHandles;
  /** Rack B only: the shared camera Pi. */
  cameraPi: PiHandles | null;
}

/** Folded-steel post 45 × 45 with a slight return: two boxes forming an L + a closing face. */
function post(b: B, x: number, z: number, y0: number, y1: number): void {
  const h = y1 - y0;
  b.box(b.m.blackSteel, 45, h, 45, [x, y0 + h / 2, z], 1.5);
}

/** Levelling foot: hex nut + rubber pad under a post. */
function foot(b: B, x: number, z: number): void {
  b.cyl(b.m.steelSatin, 14, 30, [x, 22, z], [0, 0, 0], 6);
  b.cyl(b.m.rubber, 42, 8, [x, 4, z], [0, 0, 0], 16);
}

/**
 * Perforated shelf plate (slots along Z), top surface at `yTop` (mm), centred at x/z, w × d mm,
 * with front/rear flanges hanging `flange` mm.
 */
export function shelfPlate(b: B, x: number, z: number, yTop: number, w: number, d: number, flange = 40, rounded = false): void {
  const mat = rounded ? b.m.perforatedRounded : b.m.perforatedSteel;
  if (rounded) b.add(boxG(w, 2, d), mat, { p: [x, yTop - 1, z] });
  else b.kit.addShelf(boxG(w, 2, d), mat, b.mat({ p: [x, yTop - 1, z] }));
  if (flange > 0) {
    for (const s of [1, -1]) b.box(b.m.blackSteel, w, flange, 2, [x, yTop - flange / 2, z + s * (d / 2 - 1)]);
    for (const s of [1, -1]) b.box(b.m.blackSteel, 2, flange * 0.6, d - 4, [x + s * (w / 2 - 1), yTop - flange * 0.3, z]);
  }
}

/** A touch rack: frame, rails with U numbers, LED strips, bay shelves, hex back panels, top gear. */
export function buildTouchRack(kit: RigKit, rack: RackDef): RackHandles {
  const frame = Frame.world(rack.pos);
  const b = new B(kit, frame.m);
  const m = b.m;
  const { x: px, z: pz } = RACK_FRAME.postCentreMm;
  // posts, plinth, top frame, side stretchers
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    post(b, sx * px, sz * pz, 40, 2000);
    foot(b, sx * px, sz * pz);
  }
  for (const sz of [-1, 1]) {
    b.box(m.blackSteel, 600, 50, 30, [0, 75, sz * pz], 1);
    b.box(m.blackSteel, 600, 30, 30, [0, 1955, sz * pz], 1);
  }
  for (const sx of [-1, 1]) {
    b.box(m.blackSteel, 30, 50, 910, [sx * px, 75, 0], 1);
    b.box(m.blackSteel, 30, 30, 910, [sx * px, 1955, 0], 1);
    // side mid stretchers at each bay floor (shelf supports)
    for (const bay of BAYS) b.box(m.blackSteel, 16, 30, 880, [sx * 266, bay.floorY * 1000 - 18, -5], 1);
    b.box(m.blackSteel, 16, 30, 880, [sx * 266, RACK_TOP_PLATE_Y * 1000 - 18, -5], 1);
  }
  // perforated top plate
  shelfPlate(b, 0, 0, 2000, 600, 1000, 30);
  // front rails: textured flange (square holes + U numbers) + C-channel returns
  const y0 = RACK_FRAME.u1BottomMm;
  const y1 = uBottomMm(RACK_FRAME.units + 1);
  const rh = y1 - y0;
  const fz = RACK_FRAME.rail.frontZMm;
  for (const side of ['left', 'right'] as const) {
    const s = side === 'left' ? -1 : 1;
    const xc = s * 240;
    b.add(planeUvG(30, rh), m.rail(side), { p: [xc, y0 + rh / 2, fz + 1.2] });
    b.box(m.blackSteel, 30, rh, 1.6, [xc, y0 + rh / 2, fz - 0.2]);
    b.box(m.blackSteel, 2, rh, 24, [s * 225, y0 + rh / 2, fz - 12]);
    b.box(m.blackSteel, 2, rh, 24, [s * 255, y0 + rh / 2, fz - 12]);
    // rear rails (plain)
    b.box(m.blackSteel, 30, rh, 2, [xc, y0 + rh / 2, -fz]);
    b.box(m.blackSteel, 2, rh, 24, [s * 225, y0 + rh / 2, -fz + 12]);
    // green LED strip on the inner face of the front post (facing the rack centre)
    const ly0 = RACK_FRAME.ledStrip.yMm[0];
    const ly1 = RACK_FRAME.ledStrip.yMm[1];
    const len = ly1 - ly0;
    b.add(planeUvG(10, len, [0, 0, 1, len / 16.67]), m.ledStripGreen, { p: [s * 254.6, ly0 + len / 2, 472], r: [0, -s * Math.PI / 2, 0] });
    b.box(m.blackSteel, 1, len, 12, [s * 255.4, ly0 + len / 2, 472]);
  }
  // bay shelves + hex back panels + front lip labels
  for (const bay of BAYS) {
    const yf = bay.floorY * 1000;
    shelfPlate(b, 0, 0, yf, 440, 900);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.screw([sx * 236, yf - 14, sz * 451], [sz * Math.PI / 2, 0, 0]);
    b.add(boxG(450, RACK_FRAME.bayClearMm, 1), m.hexMesh, { p: [0, yf + RACK_FRAME.bayClearMm / 2, -455] });
    b.box(m.anodisedBlack, 452, 12, 12, [0, yf + RACK_FRAME.bayClearMm - 6, -458]);
    const rig = TOUCH_RIGS.find((r) => r.rackId === rack.id && r.bay === bay.bay);
    if (rig) b.tape(rig.lipLabel, 9, { p: [-205, yf - 22, fz + 1.4] }, {}, 'left');
  }
  // U41 plate (top equipment level)
  shelfPlate(b, 0, 0, RACK_TOP_PLATE_Y * 1000, 440, 900);
  // rack label on the top front
  b.tape(rack.topLabel, 14, { p: [0, 1985, 502] });

  // rack-top 5 V / 24 V distribution block (front of the U41 plate)
  const dist = RACK_DISTRIBUTION.find((d) => d.rackId === rack.id)!;
  const dz = (dist.pos[2] - rack.pos[2]) * 1000;
  const dy = RACK_TOP_PLATE_Y * 1000;
  b.box(m.blackPla, 300, 60, 70, [0, dy + 30, dz], 4);
  b.tape(dist.tape, 5, { p: [0, dy + 38, dz + 35.3] });
  const led5v = b.led([-110, dy + 20, dz + 35.4], 4, '#2bff6a', 7);
  const led24v = b.led([-95, dy + 20, dz + 35.4], 4, '#ffa516', 7);
  b.text('5V', '#d9d9d9', 9, 5, { p: [-110, dy + 10, dz + 35.4] });
  b.text('24V', '#d9d9d9', 11, 5, { p: [-95, dy + 10, dz + 35.4] });
  // leads down the rear posts (USB-C black for 5 V, red/black pairs for 24 V)
  for (const s of [-1, 1]) {
    b.tube(m.cable('cableBlack'), [[s * 120, dy + 30, dz - 35], [s * 215, dy + 10, -300], [s * 232, dy - 40, -440], [s * 232, 200, -440]], 5, 6, true);
    b.tube(m.wire('red'), [[s * 100, dy + 30, dz - 35], [s * 210, dy + 8, -320], [s * 238, dy - 40, -436], [s * 238, 200, -436]], 3, 5, true);
  }

  // rear 1U AC strip facing the rear aisle
  const stripDef = AC_STRIPS.find((s) => s.host === rack.id)!;
  const sb = b.sub({ p: [0, (stripDef.pos[1] * 1000), (stripDef.pos[2] - rack.pos[2]) * 1000], r: [0, Math.PI, 0] });
  const strip = buildAcStrip(sb, stripDef.sizeMm[0], stripDef.sizeMm[1], stripDef.sizeMm[2], stripDef.tape, false);
  // AC cord from the strip up to the tray
  b.tube(m.cable('cableBlack'), [[250, stripDef.pos[1] * 1000, -500], [260, 1990, -480], [240, 2100, -420]], 8, 6, true);

  // Rack B: shared camera Pi + 4-port USB hub in a printed tray
  let cameraPi: PiHandles | null = null;
  if (rack.letter === 'B') {
    const t = b.sub({ p: [150, dy, 300] });
    t.box(m.blackPla, 150, 6, 90, [0, 3, 0], 2);
    cameraPi = buildPi(t.sub({ p: [-20, 6, 0] }));
    t.box(m.minixBlack, 30, 18, 70, [55, 15, 0], 3);
    t.tape('RACK B CAM', 5, { p: [0, 3, 45.4] });
    for (let i = 0; i < 4; i++) {
      const x = -180 - i * 0;
      t.tube(m.cable('cableBlack'), [[60, 20, -30 + i * 15], [90, 10, -200], [x, -10, -600 + i * 10]], 3.5, 5);
    }
  }
  return { rack, frame, dist: { led5v, led24v }, strip, cameraPi };
}

/** Generic black 4-post shelving unit (Callus / ADB / tethered): posts + stretchers + levels. */
export function buildShelfUnit(
  kit: RigKit,
  originM: readonly [number, number, number],
  sizeMm: V3,
  levelsMm: readonly number[],
  opts: { postMm?: number; rounded?: boolean; topPlate?: number; flange?: number } = {},
): B {
  const b = new B(kit, Frame.world(originM).m);
  const [W, D, H] = sizeMm;
  const p = opts.postMm ?? 45;
  const hx = W / 2 - p / 2;
  const hz = D / 2 - p / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    post(b, sx * hx, sz * hz, 30, H);
    foot(b, sx * hx, sz * hz);
  }
  for (const y of levelsMm) {
    shelfPlate(b, 0, 0, y, W - 6, D - 6, opts.flange ?? 30, opts.rounded);
    for (const sz of [-1, 1]) b.box(b.m.blackSteel, W, 25, 22, [0, y - 14, sz * hz], 1);
  }
  if (opts.topPlate) shelfPlate(b, 0, 0, opts.topPlate, W, D, 25, opts.rounded);
  return b;
}
