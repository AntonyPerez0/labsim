/**
 * East wall (World §1.4 "East wall", §3.2, §9.2): the device library — white melamine shelving on
 * black brackets with one of every LabSim device (powered off, one merged mesh until an item is
 * picked up), the four family trays for the M02 sort, lip cards and the header sign — plus the
 * coffee counter (mini fridge, drip/pod machine, carafe) and the power / park posters.
 */
import { MeshStandardMaterial } from 'three';
import { bus } from '@/core/bus';
import { emit, store } from '@/core/store';
import type { DeviceTypeCode } from '@/sim/types';
import { LIBRARY_ITEMS, LIBRARY_TRAYS, getProp, type LibraryItemDef } from '../layout';
import { MergedSet, StaticBatch, xf } from './kit/batch';
import { boxGeo, cylGeo, latheGeo, rboxGeo } from './kit/shapes';
import { addPrint, addTape, type LabCtx } from './kit/context';
import { drawLabMark, FONT, fitText } from './kit/draw';
import { pickVerbs, showCallouts, toast } from './kit/runtime';
import { carry, placeCarried } from './kit/inventory';
import { hintGroup_, mugState, screwAt } from './kit/shared';
import { displayDevice } from './props/devices';
import { drawPosterPark, drawPosterPower } from './props/posters';

const FACE_X = 6.999;
const ROT = -Math.PI / 2; // local +Z → world −X (into the room)

export function buildEastWall(ctx: LabCtx): void {
  const { mats, engine } = ctx;
  const b = new StaticBatch('east-wall');
  const melamine = ctx.engine.materials.get('lab.melamine', () => new MeshStandardMaterial({ color: '#f1f0ec', roughness: 0.45 }));

  /* ── library shelving (local: +X along the wall toward −Z… we model in world terms) ── */
  const lib = getProp('shelf.device-library');
  const z0 = -0.9;
  const z1 = 1.5;
  const L = z1 - z0;
  const zc = (z0 + z1) / 2;
  // base cabinet, top 0.90, depth 0.45
  b.box(0.45, 0.88, L, melamine, FACE_X - 0.225, 0.44, zc);
  b.box(0.47, 0.025, L + 0.02, melamine, FACE_X - 0.235, 0.8875, zc);
  b.box(0.004, 0.86, L - 0.02, mats.offWhitePlastic, FACE_X - 0.452, 0.45, zc, 0, 'none');
  for (let i = 0; i < 4; i++) {
    const z = z0 + (i + 0.5) * (L / 4);
    b.box(0.003, 0.8, 0.003, mats.midGreyPlastic, FACE_X - 0.452, 0.45, z0 + i * (L / 4), 0, 'none');
    b.add(rboxGeo(0.012, 0.012, 0.12, 0.004, 1), mats.steelChrome, xf(FACE_X - 0.462, 0.78, z), 'none');
  }
  b.box(0.42, 0.06, L, mats.satinBlack, FACE_X - 0.24, 0.03, zc); // plinth
  // wall standards + brackets + shelves S1 (top 1.25, D 0.30) and S2 (top 1.62, D 0.35)
  for (const z of [z0 + 0.08, zc - 0.4, zc + 0.4, z1 - 0.08]) {
    b.box(0.012, 1.1, 0.025, mats.satinBlack, FACE_X - 0.006, 1.5, z);
    for (const [y, d] of [[1.25, 0.3], [1.62, 0.35]] as const) b.box(d - 0.03, 0.03, 0.012, mats.satinBlack, FACE_X - (d - 0.03) / 2, y - 0.035, z);
    for (const y of [1.05, 1.95]) screwAt(ctx, b, FACE_X - 0.0125, y, z, [-1, 0, 0], 'screwBlack');
  }
  for (const [y, d] of [[1.25, 0.3], [1.62, 0.35]] as const) b.box(d, 0.019, L, melamine, FACE_X - d / 2, y - 0.0095, zc);
  // header sign
  addPrint(ctx.prints, b, 1.6, 0.14, 1600, 140, (g, w, h) => {
    g.fillStyle = '#1f2328';
    g.fillRect(0, 0, w, h);
    drawLabMark(g, h * 0.6, h / 2, h * 0.6, '#43b02a');
    g.save();
    g.translate(h * 1.1, 0);
    fitText(g, 'DEVICE LIBRARY — ONE OF EVERY LABSIM WE TEST', w - h * 1.2, h, { color: '#ffffff', font: FONT.UI_SANS, weight: 800, marginY: 0.2, align: 'left', marginX: 0.01 });
    g.restore();
  }, xf(FACE_X - 0.015, 2.13, zc, 0, ROT, 0)); // above the standards (top 2.05) and proud of them

  /* ── family trays + lip labels ── */
  for (const t of LIBRARY_TRAYS) {
    const [tl, td, th] = t.size;
    b.at(t.pos[0], t.pos[1], t.pos[2], ROT, () => {
      b.box(tl, 0.006, td, mats.blackPla, 0, 0.003, 0);
      for (const s of [-1, 1]) {
        b.box(tl, th, 0.006, mats.blackPla, 0, th / 2, s * (td / 2 - 0.003));
        b.box(0.006, th, td, mats.blackPla, s * (tl / 2 - 0.003), th / 2, 0);
      }
      addTape(ctx, b, t.label, 10, xf(0, th / 2, td / 2 + 0.0005));
    });
  }

  /* ── 14 library items (merged, split out on pick-up) + lip cards ── */
  const shelfSet = new MergedSet('library.items');
  const traySet = new MergedSet('library.onTrays');
  const traySlots = new Map<string, number>();
  const trayPos = (it: LibraryItemDef): [number, number, number] => {
    const tray = LIBRARY_TRAYS.find((t) => t.family === it.tray)!;
    const k = traySlots.get(it.tray) ?? 0;
    traySlots.set(it.tray, k + 1);
    return [tray.pos[0], tray.pos[1] + 0.006, tray.pos[2] - 0.2 + (k % 5) * 0.1];
  };
  for (const it of LIBRARY_ITEMS) {
    const type = it.deviceType as DeviceTypeCode;
    const opts = it.sealedBox ? { sealedLabel: it.lipCard } : {};
    shelfSet.add(it.id, (ib) => ib.at(it.pos[0], it.pos[1], it.pos[2], ROT, () => displayDevice(ctx, ib, type, opts)));
    const tp = trayPos(it);
    traySet.add(it.id, (ib) => ib.within(xf(tp[0], tp[1], tp[2], 0, ROT, 0), () => ib.within(xf(0, 0, 0, 0, 0, 0), () => displayDevice(ctx, ib, type, opts))));
    // lip card on the shelf edge
    const shelfDepth = it.pos[1] > 1.5 ? 0.35 : it.pos[1] > 1.1 ? 0.3 : 0.45;
    addPrint(ctx.labels, b, 0.1, 0.022, 300, 66, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      fitText(g, it.lipCard, w, h, { color: '#1b1b1b', font: FONT.LABEL, weight: 700, marginX: 0.05, marginY: 0.15 });
    }, xf(FACE_X - shelfDepth - 0.0005, it.pos[1] - 0.012, it.pos[2], 0, ROT, 0));
  }
  shelfSet.build(ctx.root);
  traySet.build(ctx.root);
  for (const it of LIBRARY_ITEMS) traySet.setVisible(it.id, false);
  const onTray = new Set<string>();
  const carriedRef = () => store.getState().session.items.carried?.ref ?? null;
  // A new activity or a restarted step/module puts every device back on the shelf: otherwise devices
  // left on the trays (no pick-up verb) soft-lock the M02 sort on replay / Restart step.
  const resetLibrary = () => {
    for (const it of LIBRARY_ITEMS) traySet.setVisible(it.id, false);
    onTray.clear();
  };
  bus.on('mission.started', resetLibrary);
  bus.on('mission.restarted', resetLibrary);
  // Devices sorted before the sort step began (trays are usable at any time) still count: report the
  // tray contents whenever a step starts (only correct placements ever stay on a tray).
  bus.on('mission.stepStarted', () => {
    if (onTray.size) emit('app.action', { app: 'world', action: 'library.trays', data: { onTray: [...onTray] } });
  });

  /* ── coffee counter ── */
  const cc = getProp('counter.coffee');
  const [cw, cd, ch] = cc.size!;
  b.at(cc.pos[0], 0, cc.pos[2], ROT, () => {
    b.add(rboxGeo(cw, 0.03, cd, 0.004, 1), mats.laminateGrey, xf(0, ch - 0.015, 0));
    b.box(cw, ch - 0.03, cd - 0.02, melamine, 0, (ch - 0.03) / 2, -0.01);
    // mini fridge in the right bay
    b.add(rboxGeo(0.45, 0.6, 0.48, 0.01, 2), mats.whiteEnamel, xf(0.2, 0.32, 0.03));
    b.box(0.02, 0.18, 0.02, mats.chrome, 0.0, 0.45, 0.28, 0, 'none');
    b.box(0.38, 0.84, 0.018, melamine, -0.24, 0.43, cd / 2 - 0.01);
    b.add(rboxGeo(0.012, 0.012, 0.1, 0.004, 1), mats.steelChrome, xf(-0.08, 0.8, cd / 2 + 0.005, 0, Math.PI / 2, 0), 'none');
    // cups, sugar jar
    for (let i = 0; i < 3; i++) b.add(latheGeo([[0.001, 0], [0.035, 0], [0.04, 0.09], [0.036, 0.09], [0.031, 0.006], [0.001, 0.006]], 18), mats.whiteEnamel, xf(-0.3 + i * 0.002, ch + i * 0.09, -0.15), 'none');
    b.add(cylGeo(0.045, 0.045, 0.12, 18), mats.glassClear, xf(0.25, ch + 0.06, -0.1), 'none');
  });
  const cm = getProp('coffee.machine');
  const [mw, md, mh] = cm.size!;
  b.at(cm.pos[0], cm.pos[1], cm.pos[2], ROT, () => {
    b.add(rboxGeo(mw, 0.05, md, 0.01, 2), mats.satinBlack, xf(0, 0.025, 0));
    b.add(rboxGeo(mw, mh - 0.05, 0.14, 0.012, 2), mats.satinBlack, xf(0, 0.05 + (mh - 0.05) / 2, -md / 2 + 0.07));
    b.add(rboxGeo(mw, 0.07, md, 0.01, 2), mats.satinBlack, xf(0, mh - 0.035, 0));
    b.add(latheGeo([[0.001, 0], [0.06, 0], [0.07, 0.07], [0.055, 0.15], [0.04, 0.16], [0.001, 0.16]], 22), mats.glassDark, xf(0, 0.05, 0.04), 'none'); // carafe
    b.add(cylGeo(0.062, 0.062, 0.012, 22), mats.satinBlack, xf(0, 0.2, 0.04), 'none');
    ctx.leds.add({ pos: [cm.pos[0] - md / 2 - 0.001, cm.pos[1] + mh - 0.035, cm.pos[2] + 0.07], normal: [-1, 0, 0], color: '#2f6bff', size: 0.004 });
  });
  const cmProxy = ctx.ia.proxy(ctx.root, md, mh, mw, xf(cm.pos[0], cm.pos[1] + mh / 2, cm.pos[2]), 'coffee');

  /* ── posters (Strict: hidden) ── */
  const hb = new StaticBatch('east-hints');
  for (const [id, draw] of [['poster.power', drawPosterPower], ['poster.park', drawPosterPark]] as const) {
    const p = getProp(id);
    hb.at(FACE_X, p.pos[1], p.pos[2], ROT, () => {
      addPrint(ctx.prints, hb, 0.61, 0.91, 488, 728, draw, xf(0, 0, 0.0035));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) hb.add(cylGeo(0.006, 0.006, 0.002, 10), mats.chrome, xf(sx * 0.29, sy * 0.44, 0.0045, Math.PI / 2, 0, 0), 'none');
    });
    ctx.ia.register(id, ctx.ia.proxy(ctx.root, 0.02, 0.91, 0.61, xf(FACE_X - 0.01, p.pos[1], p.pos[2]), id), () => []);
  }
  ctx.statics.flushInto(hb, hintGroup_(ctx));
  ctx.statics.add(b);

  /* ── interactions: library ── */
  for (const it of LIBRARY_ITEMS) {
    const h = it.pos[1] > 1.5 ? 0.36 : 0.24;
    const proxy = ctx.ia.proxy(ctx.root, 0.3, h, it.model.startsWith('flex') ? 0.12 : 0.3, xf(it.pos[0], it.pos[1] + h / 2, it.pos[2]), it.id);
    ctx.ia.register(it.id, proxy, () => {
      const carriedMe = carriedRef() === it.id;
      return pickVerbs([
        carriedMe
          ? {
              key: 'E',
              label: 'Put back',
              run: () => {
                if (placeCarried(it.id, false)) shelfSet.setVisible(it.id, true);
              },
            }
          : {
              key: 'E',
              label: 'Pick up',
              blocked: () => (onTray.has(it.id) ? 'It is on its family tray' : !shelfSet.isVisible(it.id) ? 'You are carrying it' : null),
              run: () => {
                if (carry('device', it.item.replace(/ (on stand|upright in a printed stand|on its base)$/, ''), it.id, it.id)) {
                  shelfSet.setVisible(it.id, false);
                  engine.audio.play('plug-in', { position: it.pos, volume: 0.2, rate: 0.6 });
                }
              },
            },
        {
          key: 'G',
          label: 'Compare',
          run: () => {
            const lines = compareLines(it);
            showCallouts(it.id, lines);
            emit('app.action', { app: 'world', action: 'library.compare', data: { item: it.id } });
          },
        },
      ]);
    });
  }
  const traysProxy = ctx.ia.proxy(ctx.root, 0.36, 0.08, 2.32, xf(6.8, 0.94, 0.3), 'library.trays');
  ctx.ia.register('library.trays', traysProxy, () => {
    const ref = carriedRef();
    const it = LIBRARY_ITEMS.find((x) => x.id === ref);
    return pickVerbs([
      {
        key: 'E',
        label: it ? `Place ${it.model.toUpperCase()} on tray` : 'Place on tray',
        blocked: () => (it ? null : 'Carry a library device first'),
        run: () => {
          if (!it) return;
          const z = engine.camera.position.z;
          const tray = LIBRARY_TRAYS.reduce((a, t) => (Math.abs(t.pos[2] - z) < Math.abs(a.pos[2] - z) ? t : a));
          const ok = tray.family === it.tray;
          if (!ok) {
            // A device on the wrong tray could never be picked up again (tray items have no verbs), which
            // soft-locked the M02 sort: keep carrying it and say where it belongs instead.
            emit('app.action', { app: 'world', action: 'library.placedOnTray', data: { item: it.id, tray: tray.family, correct: false } });
            toast('warning', 'Family trays', `${it.lipCard} goes on the ${it.tray.toUpperCase()} tray.`);
            return;
          }
          if (!placeCarried(tray.id, true)) return;
          traySet.setVisible(it.id, true);
          onTray.add(it.id);
          emit('app.action', { app: 'world', action: 'library.placedOnTray', data: { item: it.id, tray: tray.family, correct: ok, onTray: [...onTray] } });
        },
      },
    ]);
  });

  /* ── coffee machine ── */
  let brewing = -1;
  let now = 0;
  ctx.ia.register('coffee.machine', cmProxy, () =>
    pickVerbs([
      {
        key: 'E',
        label: brewing > 0 ? 'Brewing…' : 'Make coffee',
        blocked: () => (brewing > 0 ? 'Brewing…' : null),
        run: () => {
          brewing = now;
          engine.audio.play('printer', { position: [cm.pos[0], cm.pos[1] + 0.2, cm.pos[2]], volume: 0.4, rate: 0.35 });
        },
      },
    ]),
  );
  ctx.hooks.push((_dt, t) => {
    now = t;
    if (brewing > 0 && t - brewing > 6) {
      brewing = -1;
      mugState.fill = 1;
      toast('success', 'Coffee', 'Your mug is full again.');
    }
    // keep the merged library in sync with what the player carries (Q drops it back on the shelf)
    for (const it of LIBRARY_ITEMS) {
      const carried = carriedRef() === it.id;
      const shouldShow = !carried && !onTray.has(it.id);
      if (shelfSet.isVisible(it.id) !== shouldShow) shelfSet.setVisible(it.id, shouldShow);
    }
  });
  void boxGeo;
  void lib;
}

function compareLines(it: LibraryItemDef): string[] {
  switch (it.model) {
    case 'flex-pocket':
      return ['Flex Pocket — no printer block (flat top end)', 'Same FLEX_GEN3 testing profile as Flex 3 / Flex 4', 'hasPrinter = false'];
    case 'flex-4':
    case 'flex-3':
      return [`${it.lipCard} — printer block at the top end`, 'FLEX_GEN3 profile (Flex 3 / Flex 4 / Pocket)', 'Compare with the Flex Pocket: no printer'];
    case 'station-duo-2':
      return ['Station Duo 2 — no printer in the base', 'MINI_3 is the hot-swap equivalent'];
    case 'compact':
      return ['Compact — Canadian-market terminal', 'Used on Westers test beds', 'PIN-capable (Interac)'];
    default:
      return [it.lipCard, `Orca DeviceType ${it.deviceType}`];
  }
}
