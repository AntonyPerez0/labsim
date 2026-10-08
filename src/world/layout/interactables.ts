/**
 * Interactable catalogue — World §9.1–§9.2. One entry per concrete interactable id with its prompt
 * label, verbs (key, label, input mode, required tool, sim call), inspect callouts and reach.
 * World builders register `engine.registerInteractable({ id, label, verbs … })` using these
 * strings; missions/lessons reference the same ids. Dynamic labels (e.g. "Open" vs "Close") are
 * written "Open / Close": the binder shows the half that applies.
 *
 * Keys (D9): E primary (also left-click), R secondary, G tertiary, hold-E long press, LMB-drag.
 * The world never binds F or Q. Inspect (hold RMB) is engine-global and shows `callouts`.
 */
import { HISTORY_FRAMES, WALL_BINS, WALL_DRAWER_LABELS, outletId, wallDrawerId } from './ids';
import { E, G, R, REACH, ia, fuseVerbs, stripEntries, MULTIMETER, TEST_CARDS, type InteractableSpec } from './interactionSpec';
import { adbCatalogue, rackCatalogue, tetheredCatalogue, touchRigCatalogue } from './interactablesRigs';
import { LIBRARY_ITEMS } from './props';
import { AC_STRIPS, POWER_WALL_PARTS } from './power';
import { BUILD_TABLE_ITEMS, CALLUS_BOXES } from './shelves';
import type { Builder, Zone } from './types';

export type { InteractableSpec, VerbInput, VerbKey, VerbSpec } from './interactionSpec';
export { REACH } from './interactionSpec';

/* ───────────────────────────── Entrance & desks ───────────────────────────── */

function entranceAndDesks(): InteractableSpec[] {
  const seat = (id: string) =>
    ia(id, 'Your workstation', [E('Sit at workstation', { effect: "engine.focus(SEATED_POSE); ui.overlay = { kind: 'computer' }; sound chair-roll" })], ['WS · 10.42.50.17'], 'desks', 'lab', {
      focus: 'seated',
    });
  return [
    ia('door.badge-reader', 'Badge reader', [E('Badge in', { effect: 'badge-beep ok; door unlocks and opens to 90° in 1.2 s' })], [], 'corridor', 'lab'),
    ia('door.lab', 'Lab door', [E('Open / Close', { effect: 'auto-closes after 8 s when the doorway is clear' })], [], 'entrance', 'lab'),
    ia('door.exit-button', 'Exit', [E('Push to exit', { effect: 'opens the door' })], [], 'entrance', 'lab'),
    ia('wall.light-switch', 'Lights', [E('Toggle lights')], [], 'entrance', 'lab', { modes: ['freeplay'] }),
    ia('wall.safety-card', 'Lab Safety Card', [E('Take card', { effect: 'Field Manual entry (M01)' })], [
      'LAB SAFETY CARD',
      '1. Never touch a robot while a test is running.',
      '2. If you move an arm by hand, Park All before you walk away.',
      '3. LabSim terminals and Collis probes go on the AC power strips — never the DC rails.',
    ], 'west-wall', 'lab'),
    seat('desk.player.chair'),
    seat('desk.player.computer'),
    seat('desk.player.monitor-l'),
    seat('desk.player.monitor-r'),
    seat('desk.player.keyboard'),
    ia('desk.player.phone', 'Desk phone', [E('Play voicemail', { effect: 'mentor message if queued' })], [], 'desks', 'lab'),
    ia('desk.player.mug', 'Coffee mug', [E('Drink', { when: 'Mug is empty' })], [], 'desks', 'lab'),
    ia('desk.player.card-reader', 'USB card reader', [E('Swipe test card', { requiresTool: TEST_CARDS, effect: 'workstation Card Reader utility receives the track data (INC55)' })], [], 'desks', 'lab'),
    ia('desk.player.sticky-notes', 'Sticky notes', [], ['ADB → :5444 (NOT 5555!)', 'orca.lab.local:8080 · jenkins.lab.local:8080', 'theme=avocado · kernelType=CPA'], 'desks', 'lab'),
    ia('tool.ruler', 'Steel ruler', [E('Pick up', { effect: 'carried; E on any device screen = Measure (snaps to the screen top-left (0,0))' })], ['150 mm steel rule'], 'desks', 'lab'),
    ia('desk.coworker-1.device', "Coworker's Flex", [
      E('Look at screen', { effect: 'uprightFocusPose' }),
      R('Tap screen', { sim: "sim.device.touch(deviceId, 'primary', x, y, 'player')" }),
    ], ['Desk device — ADB on 5555'], 'desks', 'lab', { focus: 'upright' }),
    ia('desk.coworker-2.device', "Coworker's Mini", [
      E('Look at screen', { effect: 'uprightFocusPose' }),
      R('Tap screen', { sim: "sim.device.touch(deviceId, 'primary', x, y, 'player')" }),
    ], ['Desk device — ADB on 5555'], 'desks', 'lab', { focus: 'upright' }),
  ];
}

/** NPC interactables: label `<Name> — <role>` is resolved from src/content/team.ts at runtime. */
export const NPC_INTERACTABLE_LABEL = '<Name> — <role>';

/* ───────────────────────────── Power wall ───────────────────────────── */

function powerWall(): InteractableSpec[] {
  const out: InteractableSpec[] = [];
  const wall = REACH.wallBoard;
  for (const p of POWER_WALL_PARTS) {
    switch (p.kind) {
      case 'psu':
        out.push(ia(p.id, 'Mean Well LRS-600-24', [
          E('Unplug / Plug AC cord', { sim: "sim.power.togglePsu('MW-1', on)" }),
          E('Measure 24 V out', { requiresTool: MULTIMETER, sim: "sim.power.measure('MW-1.out')" }),
        ], ['MEAN WELL · INPUT 120VAC · OUTPUT 24VDC'], 'power-wall', 'lab', { reach: wall }));
        break;
      case 'bus':
        out.push(ia(p.id, '24 V DC rail', [E('Measure', { requiresTool: MULTIMETER, sim: "sim.power.measure('rail-24v')" })], ['Central 24V DC rail'], 'power-wall', 'lab', { reach: wall }));
        break;
      case 'regulator':
        out.push(ia(p.id, 'Step-down regulator', [E('Measure output', { requiresTool: MULTIMETER, sim: `sim.power.measure('${p.sim!.ids[0]}.out')` })], [p.labels.join(' · ')], 'power-wall', 'lab', { reach: wall }));
        break;
      case 'fuse': {
        const name = p.labels[0]!.split(' ')[0]!;
        out.push(ia(p.id, `Inline fuse ${name}`, fuseVerbs(p.sim!.ids[0]!), [p.labels[0]!], 'power-wall', 'lab', { reach: wall }));
        break;
      }
      case 'tap':
        out.push(ia(p.id, `DC tap lead ${p.labels[0]}`, [
          E('Plug <carried plug> here', { when: 'Carrying a plug', sim: `sim.power.plug(loadId, { kind: 'dc-rail', targetId: '${p.sim!.ids[0]}' })`, effect: '18 V trap: spark + fry if a LabSim/Collis PSU' }),
        ], ['DC rail tap — Pis/NUCs only'], 'power-wall', 'lab', { reach: wall }));
        break;
      case 'tag':
        out.push(ia(p.id, p.labels[0]!, [], [p.labels[0]!], 'power-wall', 'lab', { reach: wall }));
        break;
      default:
        break;
    }
  }
  for (let n = 1; n <= 14; n++) {
    out.push(ia(outletId(n), `Wall outlet W${n} · 120 V`, [
      E('Unplug / Plug', { sim: 'sim.power.unplug(loadId) / sim.power.plug(loadId, hookup)' }),
      E('Measure V~', { requiresTool: MULTIMETER, sim: `sim.power.measure('WALL-${n}')` }),
    ], ['120V AC'], n <= 4 ? 'power-wall' : 'room', 'lab', { reach: n <= 4 ? wall : REACH.default }));
  }
  out.push(
    ia('power.trace', 'Power trace', [E('Start trace', { effect: 'hotspot mode: W1 → MW-1 → 24V rail → REG-12V → REG-5V → fuses → NUC SHELF → PI SHELVES (M03)' })], [], 'power-wall', 'lab', { reach: wall }),
    ia('tool.multimeter', 'Multimeter', [E('Pick up', { effect: 'hotbar 2' })], [], 'power-wall', 'lab'),
    ia('power.fuse-tray', 'Spare fuses', [E('Take fuse', { effect: 'hotbar 3; R cycles 5 / 7.5 / 10 / 15 A' })], ['5 A tan · 7.5 A brown · 10 A red · 15 A blue'], 'power-wall', 'lab'),
    ia('power.bench.flex4-psu', 'Flex 4 power brick', [E('Pick up', { effect: 'carry; plug via any socket target' })], [], 'power-wall', 'lab'),
    ia('power.bench.collis-spare', 'Spare Collis probe', [E('Pick up', { effect: 'carry; plug via any socket target' })], [], 'power-wall', 'lab'),
    ia('power.bench.desk-fan', 'Desk fan', [E('Pick up', { effect: 'carry; plug via any socket target' })], [], 'power-wall', 'lab'),
  );
  return out;
}

function strips(): InteractableSpec[] {
  const out: InteractableSpec[] = [];
  for (const s of AC_STRIPS) {
    const builder: Builder = s.id === 'power.strip.w' ? 'lab' : 'rigs';
    const zone: Zone = s.id === 'power.strip.w' ? 'power-wall' : 'rack-row';
    const label = s.id === 'power.strip.w' ? 'AC strip (bench)' : s.id === 'power.strip.t' || s.id === 'power.strip.d' ? 'AC strip' : `AC strip ${s.name}`;
    const callout = s.id === 'power.strip.w' ? 'AC STRIP — LABSIM / COLLIS ONLY' : 'Commercial AC strip — LabSim devices & Collis probes';
    out.push(...stripEntries(s.id, label, callout, zone, builder, s.sim.ids[0]!));
  }
  return out;
}

/* ───────────────────────────── Callus shelf ───────────────────────────── */

function callus(): InteractableSpec[] {
  const out: InteractableSpec[] = [];
  for (const b of CALLUS_BOXES) {
    const callouts = b.stickyNote ? [b.stickyNote.join(' ')] : ['Windows box running Callus'];
    out.push(ia(b.id, b.label, [
      E('Power button', { input: 'press', sim: `sim.host.powerCycle('${b.sim.ids[0]}') / power on`, effect: 'hold 4 s = force off' }),
      R('Re-seat Ethernet', { sim: `sim.host.setEthernet('${b.sim.ids[0]}', true)` }),
    ], callouts, 'rack-row', 'rigs'));
  }
  out.push(ia('callus.monitor', 'Callus console', [E('Switch KVM', { effect: 'box 1 → 4' })], [], 'rack-row', 'rigs'));
  return out;
}

/* ───────────────────────────── Server, fabrication, benches, walls, library ───────────────────────────── */

function serverFabWalls(): InteractableSpec[] {
  const out: InteractableSpec[] = [
    ia('server.blade', 'GPU server blade', [E('Power button', { input: 'hold', holdMs: 4000, sim: "sim.host.powerCycle('gpu-blade')", effect: 'GW13 trap: takes Orca, Jenkins and Ollama down' })], [
      '4× NVIDIA GPUs (2 on top, 2 underneath)',
      'Hosts the Orca, Jenkins and Ollama VMs',
    ], 'server', 'lab'),
  ];
  for (const n of [1, 2, 3, 4] as const) {
    out.push(ia(`server.blade.gpu-${n}`, `GPU ${n}`, [E('Tag', { effect: 'M17' })], [`GPU ${n}`], 'server', 'lab', n >= 3 ? { crouchOnly: true } : {}));
  }
  out.push(
    ia('server.switch', 'Network switch', [R('Re-seat uplink')], ['24-port switch'], 'server', 'lab'),
    ia('server.tower', 'Old tower', [], ['RETIRED — replaced by GPU blade'], 'server', 'lab'),
    ia('fab.printer-prusa', 'Prusa MK4', [E('Start print / Check print', { effect: 'replacement cradle: 90 s real' })], ['Prints the black PLA fixtures', 'CAD from simple geometric shapes'], 'fab', 'lab'),
    ia('fab.printer-bambu', 'Bambu Lab', [E('Start print / Check print', { effect: 'replacement cradle: 90 s real' })], ['Prints the black PLA fixtures', 'CAD from simple geometric shapes'], 'fab', 'lab'),
    ia('fab.laptop-cad', 'CAD laptop', [E('Look', { effect: 'focus' })], [], 'fab', 'lab', { focus: 'upright' }),
    ia('fab.spare-cradle', 'Printed cradle', [E('Pick up', { effect: 'carry (INC59)' })], [], 'fab', 'lab'),
    ia('jared.bolt-bins', 'Bolt bins', [E('Sort bolts', { effect: 'minigame overlay: 10 bolts → 2.5 mm / 5 mm' })], ['2.5 mm and 5 mm bolts'], 'jared', 'lab'),
    ia('jared.solder', 'Soldering station', [E('Iron on / off', { effect: 'tip glows' })], ['~300 solder points per robot'], 'jared', 'lab'),
    ia('jared.label-maker', 'Label maker', [E('Print label', { effect: 'Build Day' })], [], 'jared', 'lab'),
    ia(WALL_BINS.red.id, 'Red bin', [E('Open', { effect: `take: ${WALL_BINS.red.contents.join(', ')}` })], [WALL_BINS.red.label], 'jared', 'lab', { reach: REACH.wallBoard }),
    ia(WALL_BINS.blue.id, 'Blue bin', [E('Open', { effect: `take: ${WALL_BINS.blue.contents.join(', ')}` })], [WALL_BINS.blue.label], 'jared', 'lab', { reach: REACH.wallBoard }),
  );
  for (const label of WALL_DRAWER_LABELS) {
    out.push(ia(wallDrawerId(label), `Drawer ${label}`, [E('Open', { effect: 'take item' })], [label], 'jared', 'lab', { reach: REACH.wallBoard }));
  }
  for (const n of [1, 2, 3, 4, 5] as const) {
    const tape = n === 2 ? 'SPARE FLEX 2' : n === 3 ? 'SPARE MINI 3' : null;
    out.push(ia(`chest.husky.d${n}`, `Husky drawer ${n}`, [E('Open / Close', { effect: tape ? `sound drawer; take ${tape}` : 'sound drawer' })], tape ? [tape] : [], 'jared', 'lab'));
  }
  out.push(
    ia('cabinet.storage', 'Storage cabinet', [E('Sign out spare', { effect: '120 s (gameplay) → spare Collis probe' })], ['SPARES — SIGN OUT WITH JARED'], 'jared', 'lab'),
    ia('cabinet.storage.legacy-shelf', 'Legacy shelf', [E('Place / Take', { effect: 'legacy Flex 1 (INC42)' })], [], 'jared', 'lab'),
    ia('wall.whiteboard', 'Whiteboard', [E('Use whiteboard', { effect: 'focus + diagram builder overlay' })], [], 'west-wall', 'lab', { reach: REACH.wallBoard, focus: 'board' }),
    ia('wall.roadmap', 'Roadmap board', [E('Sort roadmap', { effect: 'overlay' })], [], 'west-wall', 'lab', { reach: REACH.wallBoard, focus: 'board' }),
  );
  for (const f of HISTORY_FRAMES) {
    out.push(ia(`wall.history.${f}`, 'Team history', [], [HISTORY_TEXT[f]], 'south-wall', 'lab', { reach: REACH.wallBoard }));
  }
  out.push(ia('wall.history.match', 'Match the teams', [E('Match teams', { effect: 'overlay (M18)' })], ['Semi · Sedi · IPX · PayCore · Core OS'], 'south-wall', 'lab', { reach: REACH.wallBoard, focus: 'board' }));
  for (const id of ['poster.lab', 'poster.network', 'poster.esd', 'poster.pool', 'poster.5444', 'poster.power', 'poster.park']) {
    out.push(ia(id, 'Poster', [], [POSTER_TITLES[id] ?? 'Poster'], id === 'poster.lab' ? 'south-wall' : 'room', 'lab', { reach: REACH.wallBoard }));
  }
  out.push(ia('wall.extrusion-10ft', '10 ft rail', [], ['10 ft aluminium rail, cut to size'], 'west-wall', 'lab'));
  out.push(ia('table.build', 'Build table', [], ['Half-built rig'], 'west-wall', 'rigs'));
  for (const it of BUILD_TABLE_ITEMS) out.push(ia(it.id, 'Build table', [], [...it.callouts], 'west-wall', 'rigs'));
  for (const it of LIBRARY_ITEMS) {
    out.push(ia(it.id, it.item.replace(/ on (stand|its base)| upright in a printed stand/g, ''), [
      E('Pick up / Put back'),
      G('Compare', { effect: 'M02 step 6: highlights the Flex 4 printer block next to the Pocket' }),
    ], [it.lipCard], 'east-wall', 'lab', { focus: 'upright' }));
  }
  out.push(
    ia('library.trays', 'Family trays', [E('Place on tray', { when: 'Carrying a library device' })], ['STATION · MINI · FLEX · COMPACT'], 'east-wall', 'lab'),
    ia('coffee.machine', 'Coffee machine', [E('Make coffee', { effect: '6 s, fills the mug' })], [], 'east-wall', 'lab'),
  );
  return out;
}

const HISTORY_TEXT: Record<(typeof HISTORY_FRAMES)[number], string> = {
  semi: 'SEMI TEAM: third-party POS SDKs · USB Pay Display · Secure Network Pay Display',
  sedi: "SEDI (QA) TEAM: tested Semi's apps with the Lester framework",
  ipx: 'IPX: Integrated Payment Experience — uia-remote standalone + tethered',
  paycore: 'PAYCORE: uia-remote for LabSim Dining · card matrices · standalone rigs Unavailable',
};

const POSTER_TITLES: Record<string, string> = {
  'poster.lab': 'KEEP THE RIGS GREEN',
  'poster.network': 'LAB NETWORK',
  'poster.esd': 'ATTENTION — ELECTROSTATIC SENSITIVE DEVICES',
  'poster.pool': 'THE POOL · 42 RIGS',
  'poster.5444': 'ADB over TCP in this lab: port 5444',
  'poster.power': 'LABSIM DEVICES (18V) & COLLIS PROBES: AC STRIPS ONLY',
  'poster.park': 'ARM MOVED? → PARK ALL',
};

/* ───────────────────────────── Catalogue ───────────────────────────── */

function buildCatalogue(): InteractableSpec[] {
  return [
    ...entranceAndDesks(),
    ...powerWall(),
    ...strips(),
    ...callus(),
    ...rackCatalogue(),
    ...touchRigCatalogue(),
    ...tetheredCatalogue(),
    ...adbCatalogue(),
    ...serverFabWalls(),
  ];
}

/** Every concrete interactable, in a stable order. */
export const INTERACTABLES: readonly InteractableSpec[] = buildCatalogue();

/** id → spec. (World §9.2 catalogue.) */
export const INTERACTABLE_IDS: Readonly<Record<string, InteractableSpec>> = Object.fromEntries(INTERACTABLES.map((i) => [i.id, i]));

export function interactableSpec(id: string): InteractableSpec | undefined {
  return INTERACTABLE_IDS[id];
}

/** Ids a given builder must register. */
export function interactablesFor(builder: Builder): InteractableSpec[] {
  return INTERACTABLES.filter((i) => i.builder === builder);
}

