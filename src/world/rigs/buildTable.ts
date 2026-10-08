/**
 * Build table `table.build` (World §2.15): grey steel workbench with a half-built rig and the BOM
 * props — bare bay plate + printed cradle, 2040 beam on blocks, loose NEMA-17s, a bag of V-wheels,
 * GT2 belt reel, bolt box `200+ M2.5 / M5 BOLTS`, 22 AWG spool `130 FT`, the solder-joint
 * clipboard, an unpopulated 25-pin PCB, a blue solenoid in an anti-static bag, extrusion off-cuts,
 * a hacksaw and a tape measure. Table-local mm (origin = footprint centre on the floor).
 */
import { BoxGeometry, MeshPhysicalMaterial, Object3D } from 'three';
import { BUILD_TABLE_ITEMS, BUILD_TABLE_ORIGIN } from '../layout';
import type { RigKit } from './kit/context';
import { Frame } from './kit/frame';
import { MM, vslotG } from './kit/geom';
import { B, type V3 } from './parts';

export interface BuildTableHandles {
  b: B;
  /** Item id → local centre (mm) and proxy size (mm). */
  items: Record<string, { p: V3; s: V3 }>;
}

export function buildBuildTable(kit: RigKit): BuildTableHandles {
  const b = new B(kit, Frame.world(BUILD_TABLE_ORIGIN).m);
  const m = kit.mats;
  const steel = m.std('rigs:benchGrey', '#7d8288', 0.45, 0.55);
  // workbench: top, apron, legs, lower shelf
  b.box(steel, 1800, 30, 900, [0, 885, 0], 3);
  b.box(steel, 1760, 60, 20, [0, 840, 430], 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(steel, 50, 870, 50, [sx * 860, 435, sz * 410], 2);
  b.box(steel, 1720, 20, 820, [0, 200, 0], 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(m.rubber, 50, 10, [sx * 860, 5, sz * 410]);
  const top = 900;
  const items: BuildTableHandles['items'] = {};
  const at = (id: string): V3 => {
    const it = BUILD_TABLE_ITEMS.find((x) => x.id === id)!;
    return [it.local[0] * 1000, top, it.local[2] * 1000];
  };
  // bare bay plate + printed cradle
  let p = at('table.build.bay-plate');
  b.box(m.blackPla, 60, 30, 60, [p[0] - 160, top + 15, p[2]], 2);
  b.box(m.blackPla, 60, 30, 60, [p[0] + 160, top + 15, p[2]], 2);
  kit.addShelf(boxGeo(440, 2, 520), m.perforatedSteel, b.mat({ p: [p[0], top + 31, p[2]] }));
  b.box(m.blackPla, 100, 40, 230, [p[0], top + 52, p[2]], 4);
  b.box(m.blackPla, 8, 30, 230, [p[0] - 50, top + 75, p[2]], 2);
  b.box(m.blackPla, 8, 30, 230, [p[0] + 50, top + 75, p[2]], 2);
  items['table.build.bay-plate'] = { p: [p[0], top + 40, p[2]], s: [460, 80, 540] };
  // 2040 beam on two blocks
  p = at('table.build.beam');
  b.add(vslotG('2040', 440), m.aluminium, { p: [p[0], top + 50, p[2]], r: [0, Math.PI / 2, 0] });
  for (const x of [-150, 150]) b.box(m.blackPla, 40, 30, 40, [p[0] + x, top + 15, p[2]], 2);
  items['table.build.beam'] = { p: [p[0], top + 40, p[2]], s: [450, 80, 50] };
  // two loose NEMA-17s (instanced, static anchors)
  p = at('table.build.steppers');
  for (const [dx, rz] of [[-30, 0], [35, Math.PI / 2]] as const) {
    const o = new Object3D();
    o.position.set((BUILD_TABLE_ORIGIN[0] * 1000 + p[0] + dx) * MM, (top + 21.2) * MM, (BUILD_TABLE_ORIGIN[2] * 1000 + p[2]) * MM);
    o.rotation.set(rz ? 0 : 0, rz, rz ? Math.PI / 2 : 0);
    kit.root.add(o);
    kit.nemaBody.add(o);
    kit.nemaMetal.add(o);
  }
  items['table.build.steppers'] = { p: [p[0], top + 25, p[2]], s: [130, 50, 80] };
  // bag of V-wheels: translucent bag with wheels inside
  p = at('table.build.v-wheels');
  const bag = m.get('rigs:bagClear', () => new MeshPhysicalMaterial({ color: '#e8eef2', roughness: 0.25, transparent: true, opacity: 0.35 }));
  for (let i = 0; i < 6; i++) {
    const o = new Object3D();
    o.position.set((BUILD_TABLE_ORIGIN[0] * 1000 + p[0] - 30 + (i % 3) * 28) * MM, (top + 6 + Math.floor(i / 3) * 11) * MM, (BUILD_TABLE_ORIGIN[2] * 1000 + p[2] - 12 + (i % 2) * 20) * MM);
    kit.root.add(o);
    kit.wheels.add(o);
  }
  b.box(bag, 110, 30, 80, [p[0], top + 15, p[2]], 6, undefined, true);
  items['table.build.v-wheels'] = { p: [p[0], top + 15, p[2]], s: [110, 30, 80] };
  // GT2 belt reel
  p = at('table.build.belt-reel');
  b.cyl(m.belt, 80, 8, [p[0], top + 4, p[2]], [0, 0, 0], 24);
  b.cyl(m.blackPla, 30, 10, [p[0], top + 5, p[2]], [0, 0, 0], 16);
  items['table.build.belt-reel'] = { p: [p[0], top + 5, p[2]], s: [80, 12, 80] };
  // bolt box
  p = at('table.build.bolt-box');
  b.box(m.cardboard, 140, 60, 100, [p[0], top + 30, p[2]], 2);
  b.tape('200+ M2.5 / M5 BOLTS', 7, { p: [p[0], top + 34, p[2] + 50.4] });
  items['table.build.bolt-box'] = { p: [p[0], top + 30, p[2]], s: [140, 60, 100] };
  // 22 AWG spool
  p = at('table.build.wire-spool');
  b.cyl(m.blackPla, 90, 6, [p[0], top + 3, p[2]], [0, 0, 0], 24);
  b.cyl(m.wire('red'), 70, 50, [p[0], top + 31, p[2]], [0, 0, 0], 24);
  b.cyl(m.blackPla, 90, 6, [p[0], top + 59, p[2]], [0, 0, 0], 24);
  b.tape('130 FT · 22 AWG', 6, { p: [p[0], top + 62.2, p[2]], r: [-Math.PI / 2, 0, 0] });
  items['table.build.wire-spool'] = { p: [p[0], top + 31, p[2]], s: [90, 62, 90] };
  // clipboard
  p = at('table.build.clipboard');
  b.box(m.std('rigs:masonite', '#8a6a46', 0.7), 230, 4, 320, [p[0], top + 2, p[2]], 2);
  b.box(m.paperWhite, 210, 1, 290, [p[0], top + 4.5, p[2] + 6]);
  b.box(m.steelChrome, 90, 8, 22, [p[0], top + 8, p[2] - 150], 2);
  b.text('SOLDER JOINTS ≈ 300 ✓✓✓', '#1b2a6b', 190, 26, { p: [p[0], top + 5.1, p[2] - 80], r: [-Math.PI / 2, 0, 0] }, { shadow: 'rgba(0,0,0,0)', weight: 600, family: '"Segoe Print", "Comic Sans MS", cursive' });
  items['table.build.clipboard'] = { p: [p[0], top + 5, p[2]], s: [230, 12, 320] };
  // unpopulated green 25-pin PCB
  p = at('table.build.pcb');
  b.box(m.pcbBoard, 100, 1.6, 70, [p[0], top + 0.8, p[2]]);
  items['table.build.pcb'] = { p: [p[0], top + 2, p[2]], s: [100, 6, 70] };
  // blue solenoid in an anti-static bag
  p = at('table.build.solenoid-bag');
  const antistatic = m.get('rigs:antistatic', () => new MeshPhysicalMaterial({ color: '#9ea4aa', roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.6 }));
  b.cyl(m.solenoidBlue, 13, 22, [p[0], top + 8, p[2]], [0, 0, Math.PI / 2], 16);
  b.box(m.steelChrome, 30, 13, 16, [p[0], top + 8, p[2]], 0, undefined, false);
  b.box(antistatic, 90, 16, 120, [p[0], top + 8, p[2]], 4, undefined, true);
  items['table.build.solenoid-bag'] = { p: [p[0], top + 8, p[2]], s: [90, 16, 120] };
  // extrusion off-cuts, hacksaw, tape measure
  p = at('table.build.offcuts');
  for (let i = 0; i < 4; i++) b.add(vslotG('2020', 60 + i * 35), m.aluminium, { p: [p[0] + i * 26, top + 10, p[2] + i * 6], r: [0, (i * 13) * (Math.PI / 180), 0] });
  items['table.build.offcuts'] = { p: [p[0] + 40, top + 10, p[2]], s: [140, 20, 160] };
  p = at('table.build.hacksaw');
  b.box(m.steelSatin, 300, 2, 14, [p[0], top + 2, p[2]], 0, [0, 0.2, 0]);
  b.box(m.std('rigs:sawRed', '#c0281e', 0.5), 90, 12, 30, [p[0] - 170, top + 6, p[2] + 30], 4, [0, 0.2, 0]);
  items['table.build.hacksaw'] = { p: [p[0] - 40, top + 6, p[2]], s: [380, 14, 60] };
  p = at('table.build.tape-measure');
  b.box(m.std('rigs:tmYellow', '#f2c200', 0.5), 70, 70, 35, [p[0], top + 35, p[2]], 12);
  items['table.build.tape-measure'] = { p: [p[0], top + 35, p[2]], s: [70, 70, 35] };
  items['table.build'] = { p: [0, 450, 0], s: [1800, 900, 900] };
  return { b, items };
}

function boxGeo(w: number, h: number, d: number): BoxGeometry {
  return new BoxGeometry(w * MM, h * MM, d * MM);
}
