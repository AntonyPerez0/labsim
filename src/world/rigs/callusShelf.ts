/**
 * Callus shelf (World §2.14, D11): black 4-post shelf between the racks with levels at the bay
 * heights, the eight grey Collis probes (rear IDC ribbon straight into their bay), the Windows boxes
 * (MINIX-01/02, NUC-03 with the sticky note, spare slot), the 12 V distribution block, the 7" KVM
 * console monitor and the two Collis AC strips. Shelf-local mm (origin = footprint centre).
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Group } from 'three';
import { AC_STRIPS, CALLUS_BOXES, CALLUS_FIXTURES, CALLUS_LEVELS, CALLUS_ORIGIN, COLLIS_PROBES, TOUCH_RIGS, bayOriginWorld, bayPartPositions, rackDef } from '../layout';
import type { RigKit } from './kit/context';
import { DEG, MM } from './kit/geom';
import type { LedHandle } from './kit/instances';
import type { Moving } from './kit/moving';
import { buildShelfUnit } from './rack';
import { B, buildAcStrip, buildCollis, buildMinix, buildNuc, type StripHandles, type V3 } from './parts';
import { FONTS } from '@/render2d';

export interface CallusHandles {
  b: B;
  collis: Record<string, { led: LedHandle; worldId: string; simId: string; rigId: string; local: V3; rotY: number }>;
  boxes: Record<string, { led: LedHandle | null; group: Group | null }>;
  monitor: { mesh: Mesh; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: CanvasTexture; kvm: number };
  strips: Record<string, StripHandles>;
}

export function buildCallusShelf(kit: RigKit): CallusHandles {
  const levels = [CALLUS_LEVELS[1], CALLUS_LEVELS[2], CALLUS_LEVELS[3], CALLUS_LEVELS[4]].map((y) => y * 1000);
  const b = buildShelfUnit(kit, CALLUS_ORIGIN, [600, 1000, 1950], levels, { topPlate: 1878 });
  const m = kit.mats;
  const collis: CallusHandles['collis'] = {};
  for (const c of COLLIS_PROBES) {
    const local: V3 = [c.local[0] * 1000, c.local[1] * 1000, c.local[2] * 1000];
    const cb = b.sub({ p: local, r: [0, c.rotY * DEG, 0] });
    const rig = TOUCH_RIGS.find((r) => r.id === c.rigId)!;
    const h = buildCollis(cb, rig.hrn);
    collis[c.rigId] = { led: h.led, worldId: c.id, simId: c.simId, rigId: c.rigId, local, rotY: c.rotY };
    // rear ribbon: from the IDC header straight into the bay (open side) to the dip tower path
    const rack = rackDef(rig.rackId);
    const entry = bayPartPositions(rig.doorSide).collisRibbonEntry!.pos;
    const bo = bayOriginWorld(rack, rig.bay);
    const ew: V3 = [(bo[0] - CALLUS_ORIGIN[0]) * 1000 + entry[0], (bo[1] - CALLUS_ORIGIN[1]) * 1000 + entry[1], (bo[2] - CALLUS_ORIGIN[2]) * 1000 + entry[2]];
    const out = cb.point(h.ribbonOut);
    const ol: V3 = [out.x * 1000 - CALLUS_ORIGIN[0] * 1000, out.y * 1000, out.z * 1000 - CALLUS_ORIGIN[2] * 1000];
    const mid: V3 = [(ol[0] + ew[0]) / 2, Math.min(ol[1], ew[1]) + 4, (ol[2] + ew[2]) / 2];
    b.tube(m.ribbonGrey, [ol, mid, ew], 3, 4);
    // USB cable from the probe front up the post toward its Callus box (level 3)
    const usbFrom = cb.point([60, 16, 57]);
    const uf: V3 = [usbFrom.x * 1000 - CALLUS_ORIGIN[0] * 1000, usbFrom.y * 1000, usbFrom.z * 1000 - CALLUS_ORIGIN[2] * 1000];
    const sx = c.local[0] < 0 ? -1 : 1;
    b.tube(m.cable('cableBlack'), [uf, [sx * 250, uf[1] + 10, uf[2] + 30], [sx * 262, levels[2]! + 30, 440], [sx * 180, levels[2]! + 12, 360]], 3.5, 5);
    // AC brick cord down to the strips on L1
    b.tube(m.cable('cableBlack'), [[ol[0] * 0.8, ol[1] + 2, ol[2] - 20], [sx * 262, ol[1] - 20, -380], [sx * 150, levels[0]! + 30, -400]], 4, 5);
  }
  // Windows boxes (level 3 front)
  const boxes: CallusHandles['boxes'] = {};
  for (const bx of CALLUS_BOXES) {
    const p: V3 = [bx.local[0] * 1000, bx.local[1] * 1000, bx.local[2] * 1000];
    if (bx.kind === 'slot') {
      // spare slot: a Minix appears only when the sim seeds NUC-01 / MINIX-03
      const mv: Moving = kit.moving('callus-slot-4', kit.root, true);
      mv.group.visible = false;
      const g = new B(kit, b.mat({ p }), kit.statNoShadow, kit.statNoShadow);
      g.tape(bx.label, 5, { p: [0, 1, 66], r: [-Math.PI / 2, 0, 0] });
      const led = buildMinixInto(kit, mv, b, p, 'MINIX-03');
      boxes[bx.id] = { led, group: mv.group };
      continue;
    }
    const bb = b.sub({ p });
    const led = bx.kind === 'nuc' ? buildNuc(bb, bx.label) : buildMinix(bb, bx.label);
    boxes[bx.id] = { led, group: null };
    if (bx.stickyNote) {
      const rect = kit.decal.alloc(256, 256, (c, x, y, w, h) => {
        c.fillStyle = '#ffe866';
        c.fillRect(x, y, w, h);
        const g = c.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, 'rgba(255,255,255,0.15)');
        g.addColorStop(1, 'rgba(0,0,0,0.12)');
        c.fillStyle = g;
        c.fillRect(x, y, w, h);
        c.fillStyle = '#1b1b1b';
        c.font = `600 26px "Segoe Print", "Marker Felt", "Comic Sans MS", cursive`;
        c.textAlign = 'left';
        bx.stickyNote!.forEach((l, i) => c.fillText(l, x + 12, y + 60 + i * 52, w - 20));
      });
      bb.decal(rect, 76, 76, { p: [0, 51.6, 0], r: [-Math.PI / 2, 0, 8 * DEG] });
    }
    // Ethernet to the switch (yellow) and power (black)
    bb.tube(m.cable('cat6Yellow'), [[-40, 10, -60], [-40, 6, -160], [0, 0, -250]], 5, 5);
  }
  // 12 V distribution block (4 barrel outputs)
  const d12 = CALLUS_FIXTURES.dist12v.local;
  const db = b.sub({ p: [d12[0] * 1000, d12[1] * 1000, d12[2] * 1000] });
  db.box(m.blackPla, 120, 40, 50, [0, 20, 0], 3);
  for (let i = 0; i < 4; i++) db.cyl(m.darkPort, 9, 3, [-42 + i * 28, 20, 25.5], [Math.PI / 2, 0, 0], 12);
  db.tape(CALLUS_FIXTURES.dist12v.tape, 5, { p: [0, 40.3, 0], r: [-Math.PI / 2, 0, 0] });
  // KVM console monitor (7" on a kickstand, tilted back 10°)
  const mon = CALLUS_FIXTURES.monitor;
  const ml: V3 = [mon.local[0] * 1000, mon.local[1] * 1000, mon.local[2] * 1000];
  const mb = b.sub({ p: ml });
  mb.box(m.minixBlack, 100, 6, 70, [0, 3, -20], 2);
  const face = mb.sub({ p: [0, 62, 0], r: [-10 * DEG, 0, 0] });
  face.box(m.monitorBlack, mon.sizeMm[0], mon.sizeMm[1], mon.sizeMm[2], [0, 0, -7.5], 3);
  face.box(m.minixBlack, 40, 60, 6, [0, -20, -22], 2);
  const canvas = document.createElement('canvas');
  canvas.width = mon.canvasPx[0];
  canvas.height = mon.canvasPx[1];
  const ctx = canvas.getContext('2d')!;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const mat = new MeshBasicMaterial({ map: tex, toneMapped: true });
  mat.color.setScalar(1.05);
  const mesh = new Mesh(new PlaneGeometry(154 * MM, 90 * MM), mat);
  face.mat({ p: [0, 2, 0.4] }).decompose(mesh.position, mesh.quaternion, mesh.scale);
  kit.screens.add(mesh);
  // AC strips C1 / C2 lying on L1 (sockets up)
  const strips: Record<string, StripHandles> = {};
  for (const s of AC_STRIPS.filter((x) => x.host === 'shelf.callus')) {
    const sl: V3 = [(s.pos[0] - CALLUS_ORIGIN[0]) * 1000, s.pos[1] * 1000, (s.pos[2] - CALLUS_ORIGIN[2]) * 1000];
    strips[s.id] = buildAcStrip(b.sub({ p: sl }), s.sizeMm[0], s.sizeMm[1], s.sizeMm[2], s.tape, true);
  }
  return { b, collis, boxes, monitor: { mesh, canvas, ctx, tex, kvm: 0 }, strips };
}

function buildMinixInto(kit: RigKit, mv: Moving, b: B, p: V3, label: string): LedHandle {
  const sb = new B(kit, b.mat({ p }), mv.batch, mv.batch);
  // LEDs are pooled globally: the spare-slot LED is hidden by level 0 when the box is absent
  return buildMinix(sb, label);
}

/** Draw the KVM console (Windows-style, MONO 14 px white on #0c0c0c) for a host. */
export function drawCallusConsole(ctx: CanvasRenderingContext2D, title: string, lines: string[]): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1f6fd1';
  ctx.fillRect(0, 0, W, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 14px ${FONTS.UI_SANS}`;
  ctx.fillText(`${title} — Callus console`, 8, 16);
  ctx.font = `14px ${FONTS.MONO}`;
  ctx.fillStyle = '#e6e6e6';
  lines.slice(-16).forEach((l, i) => ctx.fillText(l, 8, 42 + i * 17, W - 16));
}
