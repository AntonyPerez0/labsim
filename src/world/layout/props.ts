/**
 * Zone and prop placement — World §1.4 (+ §3.2 device library, §1.1 column/mat).
 * Every row: id, kind, zone, base-centre position (m), rotY (deg), W × D × H (m) when specified.
 * Child props standing on benches/desks list world positions with y = the surface height.
 */
import type { Builder, Mount, PropKind, PropPlacement, PropSpec, Vec3, WallSide, Zone } from './types';

interface Opts {
  size?: Vec3;
  cyl?: { d: number; h: number };
  mount?: Mount;
  wall?: WallSide;
  builder?: Builder;
  collider?: boolean | 'chair';
  spec?: PropSpec;
  adjusted?: boolean;
  note?: string;
}

function p(id: string, kind: PropKind, zone: Zone, pos: Vec3, rotY: number, desc: string, o: Opts = {}): PropPlacement {
  const mount: Mount = o.mount ?? (pos[1] === 0 ? 'floor' : 'surface');
  return {
    id,
    kind,
    zone,
    pos,
    rotY,
    desc,
    mount,
    builder: o.builder ?? 'lab',
    ...(o.size ? { size: o.size } : {}),
    ...(o.cyl ? { cyl: o.cyl } : {}),
    ...(o.wall ? { wall: o.wall } : {}),
    ...(o.collider !== undefined ? { collider: o.collider } : mount === 'floor' ? { collider: true } : {}),
    ...(o.spec ? { spec: o.spec } : {}),
    ...(o.adjusted ? { adjusted: true } : {}),
    ...(o.note ? { note: o.note } : {}),
  };
}

const DESK: Vec3 = [1.6, 0.75, 0.74];
const DESK_SPEC: PropSpec = { top: '#c9c7c1 grey laminate', frame: 'black steel', modestyPanel: true, topY: 0.74 };
const POSTER_P: Vec3 = [0.61, 0.004, 0.91];

/* ───────────────────────────── Entrance & corridor ───────────────────────────── */

const ENTRANCE: PropPlacement[] = [
  p('door.lab', 'door', 'entrance', [5.9, 0, 5.0], 180, 'Steel frame #8d9196, leaf #c9ccd0, lever handle, closer arm, vision panel (glassClear)', {
    size: [0.915, 0.045, 2.1],
    mount: 'floor',
    collider: false,
    spec: { hingeX: 6.36, openingMinX: 5.44, openingMaxX: 6.36, maxOpenDeg: 95 },
    note: 'Dynamic leaf collider (closed blocks, ≥ 60° passable) — see DOOR in room.ts.',
  }),
  p('door.badge-reader', 'reader', 'corridor', [5.28, 1.15, 5.17], 0, 'Black reader 50 × 18 × 90 mm, LED ring red → green, corridor side', {
    size: [0.05, 0.018, 0.09],
    mount: 'wall',
    wall: 'south',
  }),
  p('door.exit-button', 'button', 'entrance', [5.28, 1.15, 4.99], 180, 'Green "PUSH TO EXIT" plate 70 × 115 mm, inside', {
    size: [0.07, 0.01, 0.115],
    mount: 'wall',
    wall: 'south',
  }),
  p('corridor.sign', 'sign', 'corridor', [6.62, 1.55, 5.17], 0, 'Room plate `AUTOMATION LAB · 3.14†` / `AUTHORIZED PERSONNEL ONLY`', {
    size: [0.3, 0.01, 0.2],
    mount: 'wall',
    wall: 'south',
    spec: { line1: 'AUTOMATION LAB · 3.14', line2: 'AUTHORIZED PERSONNEL ONLY' },
  }),
  p('corridor.extinguisher', 'extinguisher', 'corridor', [4.1, 0.55, 5.2], 0, 'Red 2.3 kg extinguisher on bracket', {
    cyl: { d: 0.12, h: 0.45 },
    mount: 'wall',
    wall: 'south',
  }),
  p('wall.light-switch', 'switch', 'entrance', [5.1, 1.2, 4.99], 180, 'Double white rocker (Free Play only)', {
    size: [0.07, 0.01, 0.115],
    mount: 'wall',
    wall: 'south',
    adjusted: true,
    note: 'Doc x 5.28 overlaps door.exit-button (same x, 50 mm higher); moved 0.18 m west.',
  }),
  p('wall.first-aid', 'first-aid', 'entrance', [6.98, 1.4, 4.35], -90, 'White box, green cross', {
    size: [0.3, 0.1, 0.25],
    mount: 'wall',
    wall: 'east',
  }),
  p('wall.extinguisher', 'extinguisher', 'entrance', [6.92, 0.55, 4.7], -90, 'Red extinguisher', {
    cyl: { d: 0.12, h: 0.45 },
    mount: 'wall',
    wall: 'east',
  }),
  p('wall.clock', 'clock', 'entrance', [1.1, 2.35, 4.985], 180, 'Analog Ø 0.30, white face, black hands, red seconds; shows lab.time', {
    cyl: { d: 0.3, h: 0.04 },
    mount: 'wall',
    wall: 'south',
  }),
];

/* ───────────────────────────── Workstations (south wall) ───────────────────────────── */

const DESKS: PropPlacement[] = [
  p('desk.player', 'desk', 'desks', [1.1, 0, 4.625], 180, 'Your desk', { size: DESK, spec: DESK_SPEC }),
  p('desk.player.monitor-l', 'monitor', 'desks', [0.8, 0.74, 4.8], 168, '24" 16:9 monitor (desktop mirror §3.6)', {
    size: [0.545, 0.02, 0.325],
    spec: { activeW: 0.531, activeH: 0.299, standBaseW: 0.22, standBaseD: 0.18, screenCentreY: 1.08, mirrorCanvasPx: [512, 288] },
  }),
  p('desk.player.monitor-r', 'monitor', 'desks', [1.4, 0.74, 4.8], 192, '24" 16:9 monitor (desktop mirror §3.6)', {
    size: [0.545, 0.02, 0.325],
    spec: { activeW: 0.531, activeH: 0.299, standBaseW: 0.22, standBaseD: 0.18, screenCentreY: 1.08, mirrorCanvasPx: [512, 288] },
  }),
  p('desk.player.computer', 'computer', 'desks', [1.72, 0, 4.7], 180, 'PC tower, black, blue power LED, sticker `WS · 10.42.50.17`', {
    size: [0.2, 0.42, 0.45],
    collider: false,
    spec: { sticker: 'WS · 10.42.50.17' },
    note: 'Stands under the desk top; inside the desk collider.',
  }),
  p('desk.player.keyboard', 'keyboard', 'desks', [1.1, 0.74, 4.47], 180, 'Full-size keyboard (keycap atlas)', { size: [0.44, 0.135, 0.025] }),
  p('desk.player.mouse', 'mouse', 'desks', [1.45, 0.74, 4.47], 180, 'Mouse on a 0.25 × 0.21 pad', {
    size: [0.065, 0.115, 0.038],
    spec: { padW: 0.25, padD: 0.21 },
  }),
  p('desk.player.phone', 'phone', 'desks', [0.48, 0.74, 4.62], 160, 'Desk IP phone (wedge), handset, 2.8" screen `x4117†  09:00`, red message LED', {
    size: [0.21, 0.2, 0.09],
    spec: { screenText: 'x4117  09:00', canvasPx: [128, 96] },
  }),
  p('desk.player.mug', 'mug', 'desks', [1.76, 0.74, 4.5], 0, 'White ceramic mug, green four-leaf logo, coffee fill 0–1', { cyl: { d: 0.085, h: 0.095 } }),
  p('desk.player.sticky-notes', 'sticky-notes', 'desks', [0.95, 0.741, 4.4], 180, '3 yellow notes 76 × 76 mm — 2 on the left monitor\'s lower bezel, 1 on the desk', {
    size: [0.076, 0.076, 0.001],
    spec: {
      texts: ['ADB → :5444 (NOT 5555!)', 'orca.lab.local:8080 · jenkins.lab.local:8080', 'theme=avocado · kernelType=CPA'],
      onMonitor: 'desk.player.monitor-l',
    },
  }),
  p('desk.player.card-reader', 'card-reader', 'desks', [0.62, 0.74, 4.44], 180, 'USB magstripe reader (INC55 utility)', { size: [0.1, 0.04, 0.035] }),
  p('desk.player.chair', 'chair', 'desks', [1.1, 0, 4.02], 0, 'Black mesh office chair, seat 0.47, 5-star base', {
    size: [0.62, 0.62, 1.05],
    collider: 'chair',
    spec: { seatY: 0.47 },
  }),
  p('tool.ruler', 'tool', 'desks', [0.72, 0.745, 4.38], 90, '150 mm steel rule (spawn; M09 moves it to anchor.ruler.rack-a)', { size: [0.15, 0.018, 0.0008] }),
  p('desk.morgan', 'desk', 'desks', [-0.9, 0, 4.625], 180, 'Laptop (open) + one 24" monitor + generic boxy toy robot + small plant', { size: DESK, spec: DESK_SPEC }),
  p('desk.morgan.chair', 'chair', 'desks', [-0.9, 0, 4.02], 0, 'Chair', { size: [0.62, 0.62, 1.05], collider: 'chair' }),
  p('desk.coworker-1', 'desk', 'desks', [-6.1, 0, 4.625], 180, 'Two monitors, headphones', { size: DESK, spec: DESK_SPEC }),
  p('desk.coworker-1.device', 'device', 'desks', [-6.45, 0.74, 4.55], 160, 'Flex on a white charging dock, screen on (Register) — ADB 5555 desk device', {
    size: [0.11, 0.09, 0.05],
    spec: { deviceType: 'FLEX_3', dock: 'white 110 × 90 × 50 pogo-pin cradle' },
  }),
  p('desk.coworker-2', 'desk', 'desks', [-4.3, 0, 4.625], 180, 'One monitor, mug', { size: DESK, spec: DESK_SPEC }),
  p('desk.coworker-2.device', 'device', 'desks', [-3.95, 0.74, 4.62], 200, '8" Mini on the desk (INC27)', { spec: { deviceType: 'MINI_3' } }),
  p('desk.coworker-1.chair', 'chair', 'desks', [-6.1, 0, 4.02], 0, 'Chair', { size: [0.62, 0.62, 1.05], collider: 'chair' }),
  p('desk.coworker-2.chair', 'chair', 'desks', [-4.3, 0, 4.02], 0, 'Chair', { size: [0.62, 0.62, 1.05], collider: 'chair' }),
  p('bin.trash', 'bin', 'desks', [2.2, 0, 4.78], 0, 'Grey bin', { cyl: { d: 0.3, h: 0.4 } }),
  p('bin.recycle', 'bin', 'desks', [2.5, 0, 4.78], 0, 'Blue bin', { cyl: { d: 0.3, h: 0.4 } }),
  p('poster.lab', 'poster', 'south-wall', [-2.6, 1.6, 4.99], 180, 'Landscape poster `KEEP THE RIGS GREEN` (§6.4)', {
    size: [0.91, 0.004, 0.61],
    mount: 'wall',
    wall: 'south',
  }),
];

/* ───────────────────────────── Rack row (centre north) ───────────────────────────── */

const RACK_ROW: PropPlacement[] = [
  p('rack.a', 'rack', 'rack-row', [-2.6, 0, -2.1], 0, '42U open 4-post rack, touch robots WALL-E, EVE, R2-D2, BUMBLEBEE (doors on the west face)', {
    size: [0.6, 1.0, 2.0],
    builder: 'rigs',
  }),
  p('shelf.callus', 'shelf', 'rack-row', [-2.0, 0, -2.1], 0, '4-post perforated shelf aligned with the bays (§2.14)', { size: [0.6, 1.0, 1.95], builder: 'rigs' }),
  p('rack.b', 'rack', 'rack-row', [-1.4, 0, -2.1], 0, '42U open 4-post rack, touch robots JOHNNY-5, SETI, BAYMAX, ROSIE (doors on the east face)', {
    size: [0.6, 1.0, 2.0],
    builder: 'rigs',
  }),
  p('shelf.adb', 'shelf', 'rack-row', [0.85, 0, -1.9], 0, '2-tier black perforated shelf (§2.13) — DATA, TARS', { size: [1.0, 0.6, 1.05], builder: 'rigs' }),
  p('rack.t', 'rack', 'rack-row', [2.4, 0, -2.05], 0, 'Tethered bench rack (IMG-R, §2.12) — MEGATRON / OPTIMUS', { size: [0.6, 0.9, 1.8], builder: 'rigs' }),
  p('room.column', 'column', 'rack-row', [1.7, 0, -2.05], 0, 'White drywall column (left edge of IMG-R)', { size: [0.5, 0.5, 3.0] }),
  p('cart.tools', 'cart', 'rack-row', [-0.2, 0, -0.7], 20, 'Black 3-tier utility cart: open laptop (terminal decor), label tape, zip-tie bag, cable coil', {
    size: [0.75, 0.45, 0.95],
  }),
  p('anchor.ruler.rack-a', 'anchor', 'rack-row', [-2.0, 0.995, -1.63], 0, 'Ruler spot used by M09 setup (front lip of Callus level 3)', {
    mount: 'surface',
    collider: false,
  }),
  p('decor.mat.rack-row', 'mat', 'rack-row', [-2.0, 0, -1.0], 0, 'Grey anti-fatigue mat 1.60 × 1.20 (6 mm decal) in front of the rack row', {
    size: [1.6, 1.2, 0.006],
    collider: false,
    adjusted: true,
    note: 'Doc: "under the rack row" with no coordinates; placed in front of Rack A / Callus / Rack B.',
  }),
];

/* ───────────────────────────── Power wall (north wall) ───────────────────────────── */

const POWER: PropPlacement[] = [
  p('wall.power', 'board', 'power-wall', [-0.7, 1.6, -4.9755], 0, 'Plywood backboard painted #c9cbc7, 25 mm black edge trim, y 0.95–2.25', {
    size: [3.0, 0.019, 1.3],
    mount: 'wall',
    wall: 'north',
    adjusted: true,
    note: 'Doc z −4.985 puts the board face at −4.9755, but §1.5 mounts parts on the face z −4.966; centre moved to −4.9755 (board on 9.5 mm battens).',
    spec: { faceZ: -4.966, paint: '#c9cbc7', trimMm: 25 },
  }),
  p('bench.power', 'bench', 'power-wall', [-0.7, 0, -4.7], 0, 'ESD laminate #9aa3a8 top, black frame, under-shelf at 0.20', {
    size: [3.0, 0.6, 0.9],
    spec: { topY: 0.9, underShelfY: 0.2 },
  }),
  p('tool.multimeter', 'tool', 'power-wall', [-1.6, 0.9, -4.55], 0, 'Hand-held DMM in yellow holster, probes coiled (pickup → hotbar 2)', { size: [0.09, 0.18, 0.05] }),
  p('power.fuse-tray', 'parts', 'power-wall', [-1.25, 0.9, -4.55], 0, 'Clear-lid compartment box: 6 × 5 A tan, 6 × 7.5 A brown, 6 × 10 A red, 6 × 15 A blue', {
    size: [0.2, 0.12, 0.03],
  }),
  p('power.bench.flex4-psu', 'psu', 'power-wall', [-0.3, 0.9, -4.6], 15, 'New Flex 4 power brick (white, 18 V AC brick, 1.8 m cord)', { size: [0.11, 0.06, 0.032] }),
  p('power.bench.collis-spare', 'device', 'power-wall', [0.2, 0.9, -4.6], 0, 'Spare Collis probe (grey, UL label) + its AC brick', { size: [0.15, 0.11, 0.045] }),
  p('power.bench.desk-fan', 'fan', 'power-wall', [0.55, 0.2, -4.7], 0, 'Desk fan (stored; INC17 moves it onto a strip)', { size: [0.25, 0.15, 0.32] }),
];

/* ───────────────────────────── Server shelf & print corner (north-west) ───────────────────────────── */

const SERVER_FAB: PropPlacement[] = [
  p('shelf.server', 'shelf', 'server', [-3.7, 0, -4.7], 0, 'Black wire shelving, tier top surfaces at 0.12, 0.62, 1.10, 1.62', {
    size: [1.2, 0.6, 1.8],
    spec: { tiers: [0.12, 0.62, 1.1, 1.62] },
  }),
  p('server.blade', 'server', 'server', [-3.7, 1.1, -4.72], 0, 'Open-top 4-GPU blade chassis; GPUs 1–2 on top, 3–4 hang below the 1.10 tier (lowest y 0.93)', {
    size: [0.8, 0.45, 0.12],
    spec: { lowestY: 0.93, tag: 'GPU BLADE · 10.42.1.5 · VMs: ORCA / JENKINS / OLLAMA' },
  }),
  p('server.switch', 'network-switch', 'server', [-3.7, 1.62, -4.75], 0, '24-port 1U switch, port LEDs, patch cables to tray', { size: [0.44, 0.21, 0.044] }),
  p('server.ups', 'ups', 'server', [-3.95, 0.12, -4.75], 0, 'Small UPS, green LED', { size: [0.15, 0.4, 0.22] }),
  p('server.tower', 'computer', 'server', [-2.75, 0, -4.72], 0, 'Retired beige-grey tower; tag `RETIRED — replaced by GPU blade`', {
    size: [0.2, 0.45, 0.45],
    spec: { tag: 'RETIRED — replaced by GPU blade' },
  }),
  p('poster.network', 'poster', 'server', [-3.7, 2.3, -4.985], 0, '`LAB NETWORK` host map (§6.4)', { size: [0.61, 0.004, 0.46], mount: 'wall', wall: 'north' }),
  p('bench.fab', 'bench', 'fab', [-5.75, 0, -4.625], 0, 'Birch-laminate bench, black legs, lower shelf 0.25', {
    size: [2.4, 0.75, 0.9],
    spec: { topY: 0.9, lowerShelfY: 0.25 },
  }),
  p('fab.printer-prusa', 'printer-3d', 'fab', [-6.4, 0.9, -4.65], 0, 'Prusa MK4-style bed-slinger: black frame, orange printed parts, 3.5" LCD + knob, spool on top', {
    size: [0.5, 0.55, 0.62],
    spec: { lcdPx: [128, 64] },
  }),
  p('fab.printer-bambu', 'printer-3d', 'fab', [-5.6, 0.9, -4.68], 0, 'Bambu Lab enclosed CoreXY: dark grey shell, glass door, front screen; AMS unit on top', {
    size: [0.39, 0.41, 0.71],
    spec: { screenPx: [192, 108] },
  }),
  p('fab.laptop-cad', 'laptop', 'fab', [-4.78, 0.9, -4.55], 20, 'Laptop, lid 110°, CAD view of a cradle built from boxes/cylinders', {
    size: [0.34, 0.24, 0.02],
    spec: { lidDeg: 110, screenPx: [512, 320] },
  }),
  p('fab.filament-rack', 'filament', 'fab', [-6.2, 1.6, -4.89], 0, 'Wall rack, 2 rows × 4 spools Ø 200 × 70 mm (5 black, 1 grey, 1 white, 1 green)', {
    size: [1.3, 0.22, 0.7],
    mount: 'wall',
    wall: 'north',
  }),
  p('fab.parts-bin', 'parts', 'fab', [-5.1, 0.9, -4.75], 0, 'Clear bin of black printed fixtures incl. fab.spare-cradle (INC59)', { size: [0.3, 0.2, 0.12] }),
  p('fab.spare-cradle', 'parts', 'fab', [-5.1, 0.95, -4.75], 0, 'Printed replacement cradle in the parts bin (pickup, INC59)', { size: [0.1, 0.23, 0.04] }),
  p('fab.drybox', 'drybox', 'fab', [-6.2, 0.25, -4.7], 0, 'Filament dry box under the bench', { size: [0.4, 0.25, 0.25] }),
  p('wall.safety-card', 'card', 'west-wall', [-6.985, 1.35, -3.75], 90, 'Acrylic holder with `LAB SAFETY CARD` cards (S18)', {
    size: [0.12, 0.03, 0.17],
    mount: 'wall',
    wall: 'west',
  }),
];

/* ───────────────────────────── Jared's bench, parts wall, Husky, storage (north-east) ───────────────────────────── */

const JARED: PropPlacement[] = [
  p('bench.jared', 'bench', 'jared', [2.7, 0, -4.625], 0, 'Butcher-block top, grey-blue ESD mat (#5f7686, 1.20 × 0.60) on the left, 2 under-bench drawers', {
    size: [3.0, 0.75, 0.9],
    spec: { topY: 0.9, matW: 1.2, matD: 0.6 },
  }),
  p('jared.solder', 'instrument', 'jared', [1.7, 0.9, -4.55], 0, 'Soldering station (red/black, 7-seg `350`), iron in coil stand, brass sponge', { size: [0.16, 0.13, 0.1] }),
  p('jared.magnifier-lamp', 'lamp', 'jared', [1.4, 0.9, -4.85], 0, 'Articulated lamp, ring LED (warm white emissive)', { spec: { reach: 0.6 } }),
  p('jared.half-pcb', 'pcb', 'jared', [1.55, 0.9, -4.45], 0, 'Motor PCB in a third-hand tool, half soldered', { size: [0.1, 0.07, 0.002] }),
  p('jared.scope', 'instrument', 'jared', [2.3, 0.9, -4.75], 0, 'Bench oscilloscope, 7" screen with an animated square/sine trace', {
    size: [0.32, 0.13, 0.16],
    spec: { screenPx: [256, 160] },
  }),
  p('jared.bench-psu', 'instrument', 'jared', [2.75, 0.9, -4.78], 0, 'Bench PSU, readout `24.0V 0.35A`', { size: [0.13, 0.24, 0.16] }),
  p('jared.bench-dmm', 'instrument', 'jared', [3.05, 0.9, -4.78], 0, 'Bench DMM (not a pickup)', { size: [0.22, 0.26, 0.09] }),
  p('jared.bolt-bins', 'parts', 'jared', [3.3, 0.9, -4.48], 0, 'Two bins `2.5 mm` / `5 mm` + magnetic tray with 10 mixed bolts (M04 sorter)', { size: [0.3, 0.1, 0.05] }),
  p('jared.label-maker', 'tool', 'jared', [3.65, 0.9, -4.5], 30, 'Label maker (Build Day)', { size: [0.07, 0.2, 0.05] }),
  p('jared.wire-spools', 'parts', 'jared', [3.95, 0.9, -4.85], 0, 'Dispenser rod, 4 spools red/blue/green/white', { size: [0.3, 0.08, 0.12] }),
  p('wall.bins', 'board', 'jared', [3.55, 1.5, -4.93], 0, 'Dark-grey louvred panel x 2.90–4.20, y 1.05–1.95, 4 rows × 5 stack bins: rows 1–2 red, rows 3–4 blue (IMG-R)', {
    size: [1.3, 0.015, 0.9],
    mount: 'wall',
    wall: 'north',
  }),
  p('wall.drawers', 'board', 'jared', [4.8, 1.4, -4.92], 0, 'Two 64-drawer organisers side by side (x 4.30–5.30, y 1.20–1.60) on wall brackets above the Husky chest', {
    size: [1.0, 0.16, 0.4],
    mount: 'wall',
    wall: 'north',
    spec: { units: 2, unitW: 0.5, drawersPerUnit: 64 },
  }),
  p('jared.bench-light', 'light-bar', 'jared', [2.7, 1.02, -4.95], 0, 'Warm-white LED bar along the bench back edge', { size: [2.8, 0.02, 0.01], mount: 'wall', wall: 'north' }),
  p('chest.husky', 'tool-chest', 'jared', [4.8, 0, -4.75], 0, 'Rolling tool cabinet, black body, chrome pulls, `HUSKY` badge top front, round emblem bottom door, 4 casters; drawers 1 (top) … 5', {
    size: [0.69, 0.46, 1.0],
    spec: { drawers: 5, drawer2: 'SPARE FLEX 2', drawer3: 'SPARE MINI 3' },
  }),
  p('cabinet.storage', 'cabinet', 'jared', [6.42, 0, -4.75], 0, 'Grey steel cabinet: lower doors locked (keypad), open upper shelves at 1.05/1.45 with LabSim boxes', {
    size: [1.05, 0.45, 1.95],
    spec: { shelves: [1.05, 1.45], sticker: 'SPARES — SIGN OUT WITH JARED' },
  }),
  p('cabinet.storage.legacy-shelf', 'shelf', 'jared', [6.42, 1.05, -4.75], 0, 'Upper open shelf that holds the legacy Flex 1 after INC42', {
    size: [1.0, 0.42, 0.02],
    mount: 'surface',
    collider: false,
  }),
];

/* ───────────────────────────── West wall ───────────────────────────── */

const WEST: PropPlacement[] = [
  p('wall.whiteboard', 'whiteboard', 'west-wall', [-6.985, 1.5, -2.4], 90, '2.20 × 1.20 whiteboard (aluminium frame), z −3.50…−1.30, y 0.90–2.10, marker tray', {
    size: [2.2, 0.02, 1.2],
    mount: 'wall',
    wall: 'west',
    spec: { canvasPx: [2048, 1117] },
  }),
  p('wall.roadmap', 'cork-board', 'west-wall', [-6.985, 1.55, -0.5], 90, 'Cork board, headers TODAY / IN PROGRESS / PLANNED / RETIRED / PHASING OUT, 8 index cards', {
    size: [1.2, 0.015, 0.9],
    mount: 'wall',
    wall: 'west',
  }),
  p('poster.esd', 'poster', 'west-wall', [-6.99, 1.55, 0.9], 90, 'ESD poster (§6.4)', { size: POSTER_P, mount: 'wall', wall: 'west' }),
  p('poster.pool', 'poster', 'west-wall', [-6.99, 1.55, 1.8], 90, '`THE POOL · 42 RIGS` poster (§6.4)', { size: POSTER_P, mount: 'wall', wall: 'west' }),
  p('poster.5444', 'poster', 'west-wall', [-6.99, 1.55, 2.7], 90, 'Port 5444 poster (§6.4; hidden in Strict)', { size: POSTER_P, mount: 'wall', wall: 'west' }),
  p('wall.extrusion-10ft', 'extrusion', 'west-wall', [-6.96, 0.45, 1.72], 90, 'Full 10 ft (3.048 m) 2020 aluminium stick on two wall hooks, z 0.20…3.25, tape `10 FT`', {
    size: [3.048, 0.02, 0.02],
    mount: 'wall',
    wall: 'west',
  }),
  p('table.build', 'table', 'west-wall', [-4.4, 0, 0.6], 0, 'Grey steel workbench with a half-built rig (§2.15)', { size: [1.8, 0.9, 0.9], builder: 'rigs', spec: { topY: 0.9 } }),
];

/* ───────────────────────────── East wall ───────────────────────────── */

const EAST: PropPlacement[] = [
  p('shelf.device-library', 'library-shelf', 'east-wall', [6.775, 0, 0.3], -90, 'White melamine shelving on black brackets: base top 0.90 (trays), S1 1.25 (D 0.30), S2 1.62 (D 0.35), header sign; z −0.90…1.50', {
    size: [2.4, 0.45, 2.0],
    spec: { baseTopY: 0.9, s1Y: 1.25, s1D: 0.3, s2Y: 1.62, s2D: 0.35, signY: 2.05, sign: 'DEVICE LIBRARY — ONE OF EVERY LABSIM WE TEST' },
  }),
  p('library.trays', 'tray', 'east-wall', [6.8, 0.9, 0.3], -90, '4 family trays on the base top (STATION, MINI, FLEX, COMPACT)', {
    size: [2.32, 0.36, 0.04],
    spec: { trayLenZ: 0.56, trayD: 0.36, trayH: 0.04 },
  }),
  p('counter.coffee', 'counter', 'east-wall', [6.7, 0, 3.35], -90, 'Laminate counter, mini fridge (decor) under', { size: [0.9, 0.6, 0.9], spec: { topY: 0.9 } }),
  p('coffee.machine', 'appliance', 'east-wall', [6.8, 0.9, 3.2], -90, 'Black drip/pod machine, blue power LED, carafe', { size: [0.25, 0.35, 0.38] }),
  p('poster.power', 'poster', 'east-wall', [6.99, 1.55, -3.2], -90, 'Power topology poster (§6.4; hidden in Strict)', { size: POSTER_P, mount: 'wall', wall: 'east' }),
  p('poster.park', 'poster', 'east-wall', [6.99, 1.55, -2.3], -90, '`ARM MOVED?` → PARK ALL poster (§6.4; hidden in Strict)', { size: POSTER_P, mount: 'wall', wall: 'east' }),
];

/* ───────────────────────────── South wall ───────────────────────────── */

const SOUTH: PropPlacement[] = [
  p('wall.history', 'board', 'south-wall', [3.75, 1.5, 4.985], 180, 'Team history wall x 2.60–4.90, title vinyl `TEAM HISTORY` at y 1.95', {
    size: [2.3, 0.02, 1.05],
    mount: 'wall',
    wall: 'south',
    spec: { titleY: 1.95, title: 'TEAM HISTORY' },
  }),
  // Frames read left→right by a viewer facing south: Semi, Sedi, IPX, PayCore.
  p('wall.history.semi', 'frame', 'south-wall', [4.55, 1.55, 4.98], 180, 'Black frame — SEMI TEAM', { size: [0.4, 0.02, 0.5], mount: 'wall', wall: 'south' }),
  p('wall.history.sedi', 'frame', 'south-wall', [4.05, 1.55, 4.98], 180, 'Black frame — SEDI (QA) TEAM', { size: [0.4, 0.02, 0.5], mount: 'wall', wall: 'south' }),
  p('wall.history.ipx', 'frame', 'south-wall', [3.55, 1.55, 4.98], 180, 'Black frame — IPX', { size: [0.4, 0.02, 0.5], mount: 'wall', wall: 'south' }),
  p('wall.history.paycore', 'frame', 'south-wall', [3.05, 1.55, 4.98], 180, 'Black frame — PAYCORE', { size: [0.4, 0.02, 0.5], mount: 'wall', wall: 'south' }),
  p('wall.history.match', 'plaque', 'south-wall', [3.75, 1.07, 4.98], 180, 'Plaque board with 5 plaques: Semi, Sedi, IPX, PayCore, Core OS (M18)', {
    size: [2.1, 0.02, 0.25],
    mount: 'wall',
    wall: 'south',
  }),
];

/* ───────────────────────────── Device library items (§3.2) ───────────────────────────── */

export interface LibraryItemDef {
  readonly id: string;
  readonly model: string;
  /** Orca DeviceType; sealed "UPCOMING" boxes carry the type they announce. */
  readonly deviceType: string;
  readonly item: string;
  readonly pos: Vec3;
  readonly lipCard: string;
  readonly sealedBox: boolean;
  /** Family tray the item belongs on (M02 sorting). */
  readonly tray: 'station' | 'mini' | 'flex' | 'compact';
}

function lib(model: string, deviceType: string, item: string, pos: Vec3, lipCard: string, tray: LibraryItemDef['tray']): LibraryItemDef {
  return { id: `library.${model}`, model, deviceType, item, pos, lipCard, sealedBox: model.startsWith('box-'), tray };
}

export const LIBRARY_ITEMS: readonly LibraryItemDef[] = [
  lib('station-2018', 'STATION_2018', 'Station 2018 on stand', [6.82, 1.62, -0.65], 'STATION 2018', 'station'),
  lib('station-2', 'STATION_2', 'Station 2 head on its base', [6.82, 1.62, -0.27], 'STATION 2', 'station'),
  lib('station-duo-1', 'STATION_DUO', 'Station Duo', [6.82, 1.62, 0.07], 'STATION DUO', 'station'),
  lib('station-duo-2', 'STATION_DUO_2', 'Station Duo 2', [6.82, 1.62, 0.47], 'STATION DUO 2 (NO PRINTER)', 'station'),
  lib('box-duo-3', 'STATION_DUO_3', 'Sealed box', [6.8, 1.62, 0.98], 'STATION DUO 3 — UPCOMING', 'station'),
  lib('mini-2', 'MINI_2', 'Mini 2 on stand', [6.85, 1.25, -0.68], 'MINI 2', 'mini'),
  lib('mini-3', 'MINI_3', 'Mini 3 on stand', [6.85, 1.25, -0.42], 'MINI 3', 'mini'),
  lib('box-mini-4', 'MINI_4', 'Sealed box', [6.85, 1.25, -0.13], 'MINI 4 — UPCOMING', 'mini'),
  lib('flex-1', 'FLEX_1', 'Flex 1 upright in a printed stand', [6.86, 1.25, 0.12], 'FLEX 1', 'flex'),
  lib('flex-2', 'FLEX_2', 'Flex 2 upright in a printed stand', [6.86, 1.25, 0.28], 'FLEX 2', 'flex'),
  lib('flex-3', 'FLEX_3', 'Flex 3 upright in a printed stand', [6.86, 1.25, 0.44], 'FLEX 3', 'flex'),
  lib('flex-4', 'FLEX_4', 'Flex 4 upright in a printed stand', [6.86, 1.25, 0.6], 'FLEX 4', 'flex'),
  lib('flex-pocket', 'FLEX_POCKET', 'Flex Pocket', [6.86, 1.25, 0.76], 'FLEX POCKET (NO PRINTER)', 'flex'),
  lib('compact', 'COMPACT', 'Compact', [6.85, 1.25, 0.98], 'COMPACT (CANADA)', 'compact'),
];

/** Library items face −X (rotY −90). */
export const LIBRARY_ITEM_ROT_Y = -90;

export interface LibraryTrayDef {
  readonly id: string;
  readonly family: LibraryItemDef['tray'];
  readonly label: string;
  /** Centre on the base top. */
  readonly pos: Vec3;
  /** Length along Z × depth along X × height (m). */
  readonly size: Vec3;
}

export const LIBRARY_TRAYS: readonly LibraryTrayDef[] = [
  { id: 'library.trays.station', family: 'station', label: 'STATION', pos: [6.8, 0.9, -0.57], size: [0.56, 0.36, 0.04] },
  { id: 'library.trays.mini', family: 'mini', label: 'MINI', pos: [6.8, 0.9, 0.01], size: [0.56, 0.36, 0.04] },
  { id: 'library.trays.flex', family: 'flex', label: 'FLEX', pos: [6.8, 0.9, 0.59], size: [0.56, 0.36, 0.04] },
  { id: 'library.trays.compact', family: 'compact', label: 'COMPACT', pos: [6.8, 0.9, 1.17], size: [0.56, 0.36, 0.04] },
];

const LIBRARY_PROPS: PropPlacement[] = LIBRARY_ITEMS.map((it) =>
  p(it.id, 'device', 'east-wall', it.pos, LIBRARY_ITEM_ROT_Y, `${it.item} — lip card \`${it.lipCard}\``, {
    spec: { deviceType: it.deviceType, lipCard: it.lipCard, sealedBox: it.sealedBox },
  }),
);

/* ───────────────────────────── Export ───────────────────────────── */

/** Every §1.4 placement row (+ library items, column, mat). */
export const PROPS: readonly PropPlacement[] = [
  ...ENTRANCE,
  ...DESKS,
  ...RACK_ROW,
  ...POWER,
  ...SERVER_FAB,
  ...JARED,
  ...WEST,
  ...EAST,
  ...SOUTH,
  ...LIBRARY_PROPS,
];

export const PROP_BY_ID: Readonly<Record<string, PropPlacement>> = Object.fromEntries(PROPS.map((r) => [r.id, r]));

export function getProp(id: string): PropPlacement {
  const r = PROP_BY_ID[id];
  if (!r) throw new Error(`Unknown prop placement: ${id}`);
  return r;
}
