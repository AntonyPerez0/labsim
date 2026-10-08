/**
 * Board minigames (Cur §0 props, World §9 "drag-and-drop boards"): the data and grading for the
 * overlays the world opens on `wall.whiteboard` (M06 architecture diagram), `wall.roadmap` (M17
 * roadmap sort), `wall.history.match` (M18 team match) and `jared.bolt-bins` (M04 bolt sort).
 *
 * On a fully correct board the UI emits
 *   `app.action { app: 'world', action: 'minigame.completed', data: { id, correct, total, mistakes } }`
 * which the Academy steps M04.14 / M06.03 / M17.10 / M18.06 wait for (`minigameDone`).
 *
 * Every answer here follows docs/reference/REMOVED-internal-reference.md (§2 diagram, §1 roadmap
 * items, §4 team history, §1 "200+ nuts and bolts (2.5mm and 5mm diameters)").
 */

export type MinigameId = 'bolt-sort' | 'roadmap-sort' | 'history-match' | 'architecture-diagram';

export interface SortItem {
  id: string;
  label: string;
  /** Secondary line (size, detail). */
  sub?: string;
  /** Correct bin id. */
  answer: string;
  /** Shown after a wrong placement: why the right bin is right. */
  why: string;
  /** Bolt diameter (bolt-sort art only). */
  diameterMm?: number;
  lengthMm?: number;
}

export interface SortBin {
  id: string;
  label: string;
  sub?: string;
  /** Max items (1 for a match board). */
  capacity?: number;
}

export interface SortBoardDef {
  kind: 'sort';
  id: Exclude<MinigameId, 'architecture-diagram'>;
  title: string;
  intro: string;
  bins: readonly SortBin[];
  items: readonly SortItem[];
  factIds: readonly string[];
}

/* ───────────────────────────── M04 · bolt bins ───────────────────────────── */

const bolt = (id: string, d: 2.5 | 5, len: number, head: string): SortItem => ({
  id,
  label: `M${d} × ${len}`,
  sub: head,
  answer: d === 2.5 ? 'd2.5' : 'd5',
  why: `M${d} means a ${d} mm thread diameter. Touch robots use 2.5 mm and 5 mm bolts (200+ per robot).`,
  diameterMm: d,
  lengthMm: len,
});

export const BOLT_SORT: SortBoardDef = {
  kind: 'sort',
  id: 'bolt-sort',
  title: 'Bolt bins',
  intro: 'Every touch robot uses 200+ nuts and bolts in two diameters. Drop each bolt into the 2.5 mm or the 5 mm bin. The M number is the thread diameter in millimetres.',
  bins: [
    { id: 'd2.5', label: '2.5 mm', sub: 'M2.5' },
    { id: 'd5', label: '5 mm', sub: 'M5' },
  ],
  items: [
    bolt('b1', 5, 12, 'socket cap'),
    bolt('b2', 2.5, 6, 'socket cap'),
    bolt('b3', 2.5, 10, 'button head'),
    bolt('b4', 5, 20, 'socket cap'),
    bolt('b5', 2.5, 8, 'socket cap'),
    bolt('b6', 5, 8, 'button head'),
    bolt('b7', 2.5, 12, 'socket cap'),
    bolt('b8', 5, 16, 'socket cap'),
    bolt('b9', 2.5, 16, 'button head'),
    bolt('b10', 5, 10, 'button head'),
  ],
  factIds: ['F093'],
};

/* ───────────────────────────── M17 · roadmap board ───────────────────────────── */

export const ROADMAP_SORT: SortBoardDef = {
  kind: 'sort',
  id: 'roadmap-sort',
  title: 'Roadmap board',
  intro: 'Sort each card into the column that describes where it stands today.',
  bins: [
    { id: 'today', label: 'TODAY' },
    { id: 'progress', label: 'IN PROGRESS' },
    { id: 'planned', label: 'PLANNED' },
    { id: 'retired', label: 'RETIRED / PHASING OUT' },
  ],
  items: [
    { id: 'orca-vm', label: 'Orca on an on-prem lab VM', answer: 'today', why: 'Orca runs today on a local, on-premise laboratory virtual machine.' },
    { id: 'orca-gcp', label: 'Orca containerised in Docker on GCP', answer: 'planned', why: 'Docker and Google Cloud Platform are the planned migration targets. It has not happened yet.' },
    { id: 'pi-control', label: 'Hardware control on Linux Raspberry Pis', answer: 'today', why: 'Hardware control already moved to the Raspberry Pis. That is how the lab runs today.' },
    { id: 'nuc-control', label: 'Hardware control on Windows Intel NUCs', answer: 'retired', why: 'corporate security monitoring filled the NUC disks, so hardware control was moved off the NUCs onto Pis.' },
    { id: 'ollama-poc', label: 'Ollama vision PoC on webcam streams', answer: 'progress', why: 'Ollama currently runs proof-of-concept Vision LLM checks of receipt layouts and tip math.' },
    { id: 'pin-bypass', label: 'Gen 2 Software PIN Bypass (with Core OS Team)', answer: 'progress', why: 'The team is partnering with the Core OS Team to build it. It is in progress, not shipped.' },
    { id: 'duo-ocr', label: 'Station Duo Screen Compare / OCR', answer: 'retired', why: 'OCR is brittle and is being phased out, because UI Automator 2.3 tracks elements on both screens natively.' },
    { id: 'github', label: 'Repos on GitHub (Gort, uia-remote, pigeon)', answer: 'today', why: 'GitHub hosts the team repositories today.' },
  ],
  factIds: ['F023', 'F022', 'F031', 'F032', 'F222', 'F156'],
};

/* ───────────────────────────── M18 · team history match ───────────────────────────── */

export const HISTORY_MATCH: SortBoardDef = {
  kind: 'sort',
  id: 'history-match',
  title: 'Match the teams',
  intro: 'Put each card under the team it describes. One card per plaque.',
  bins: [
    { id: 'semi', label: 'Semi Team', capacity: 1 },
    { id: 'sedi', label: 'Sedi (QA) Team', capacity: 1 },
    { id: 'ipx', label: 'IPX Team', sub: 'Integrated Payment Experience', capacity: 1 },
    { id: 'paycore', label: 'PayCore Team', capacity: 1 },
    { id: 'coreos', label: 'Core OS Team', capacity: 1 },
  ],
  items: [
    { id: 'sdk', label: 'POS SDKs and the remote pay display apps', sub: 'USB Pay Display · Secure Network Pay Display', answer: 'semi', why: 'The Semi Team built the third-party POS SDKs and the pay display apps.' },
    { id: 'lester', label: 'QA with the Lester framework', answer: 'sedi', why: 'The Sedi (QA) Team tested the Semi apps with Lester, the ancestor of Pigeon.' },
    { id: 'native', label: 'Native apps: Register, Orders, Authorizations, Sale, Transactions, Setup', answer: 'ipx', why: 'uia-remote now tests these native apps with the IPX Team.' },
    { id: 'dining', label: 'LabSim Dining and the full card matrix', sub: 'Visa · Discover · AmEx', answer: 'paycore', why: 'PayCore adopted uia-remote for LabSim Dining and runs exhaustive card-matrix validations.' },
    { id: 'pin', label: 'Gen 2 Software PIN Bypass partner', answer: 'coreos', why: 'The team is partnering with Core OS on the software PIN bypass.' },
  ],
  factIds: ['F157', 'F158', 'F161', 'F162', 'F226', 'F222'],
};

/* ───────────────────────────── M06 · architecture diagram ───────────────────────────── */

export interface DiagramSlot {
  id: string;
  /** Correct card id. */
  answer: string;
  /** Grid placement (columns 0–3, rows 0–3). */
  col: number;
  row: number;
}

export interface DiagramCard {
  id: string;
  label: string;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  /** Correct label id, or null for a fixed unlabelled link (MySQL, probe → card reader). */
  answer: string | null;
}

export interface DiagramLabel {
  id: string;
  text: string;
  why: string;
}

export interface DiagramBoardDef {
  kind: 'diagram';
  id: 'architecture-diagram';
  title: string;
  intro: string;
  cards: readonly DiagramCard[];
  slots: readonly DiagramSlot[];
  edges: readonly DiagramEdge[];
  labels: readonly DiagramLabel[];
  factIds: readonly string[];
}

export const ARCHITECTURE_DIAGRAM: DiagramBoardDef = {
  kind: 'diagram',
  id: 'architecture-diagram',
  title: 'Architecture whiteboard',
  intro: 'Rebuild the lab diagram. Put the 8 cards into the boxes, then name the 6 arrows.',
  cards: [
    { id: 'jenkins', label: 'Jenkins (Executor)' },
    { id: 'runner', label: 'Test runner (uia-remote / Pigeon)' },
    { id: 'orca', label: 'Orca (Controller)' },
    { id: 'mysql', label: 'MySQL' },
    { id: 'pi', label: 'Raspberry Pi Robot Controller' },
    { id: 'lab', label: 'LabSim device (MFD / CFD)' },
    { id: 'callus', label: 'Windows/Minix box (Callus)' },
    { id: 'collis', label: 'Collis probe' },
  ],
  slots: [
    { id: 's-jenkins', answer: 'jenkins', col: 0, row: 0 },
    { id: 's-runner', answer: 'runner', col: 2, row: 0 },
    { id: 's-orca', answer: 'orca', col: 1, row: 1 },
    { id: 's-mysql', answer: 'mysql', col: 3, row: 1 },
    { id: 's-pi', answer: 'pi', col: 1, row: 2 },
    { id: 's-lab', answer: 'lab', col: 1, row: 3 },
    { id: 's-callus', answer: 'callus', col: 3, row: 2 },
    { id: 's-collis', answer: 'collis', col: 3, row: 3 },
  ],
  edges: [
    { id: 'e-trigger', from: 's-jenkins', to: 's-runner', answer: 'l-trigger' },
    { id: 'e-checkout', from: 's-jenkins', to: 's-orca', answer: 'l-checkout' },
    { id: 'e-rest', from: 's-runner', to: 's-orca', answer: 'l-rest' },
    { id: 'e-mysql', from: 's-orca', to: 's-mysql', answer: null },
    { id: 'e-ping', from: 's-orca', to: 's-pi', answer: 'l-ping' },
    { id: 'e-adb', from: 's-pi', to: 's-lab', answer: 'l-adb' },
    { id: 'e-ribbon', from: 's-callus', to: 's-collis', answer: 'l-ribbon' },
    { id: 'e-reader', from: 's-collis', to: 's-lab', answer: null },
  ],
  labels: [
    { id: 'l-trigger', text: 'triggers pipeline + injects env vars', why: 'Jenkins (the Executor) triggers the pipeline and injects the runtime environment variables into the test runner.' },
    { id: 'l-checkout', text: 'checkout robot', why: 'Jenkins checks out a robot from Orca (the Controller) before the run.' },
    { id: 'l-rest', text: 'REST: xy_touch, card swipe/dip/tap', why: 'The test runner calls Orca over REST for taps (xy_touch) and card actions.' },
    { id: 'l-ping', text: '5-minute health-check ping', why: 'Every 5 minutes Orca pings the Robot Controller on every Pi.' },
    { id: 'l-adb', text: 'ADB service (port 5444)', why: 'The Pi routes ADB to the LabSim device on port 5444, not the default 5555.' },
    { id: 'l-ribbon', text: 'ribbon cable', why: 'The Windows/Minix box running Callus drives the Collis probe over a ribbon cable.' },
  ],
  factIds: [],
};

export type BoardDef = SortBoardDef | DiagramBoardDef;

export const BOARDS: Record<MinigameId, BoardDef> = {
  'bolt-sort': BOLT_SORT,
  'roadmap-sort': ROADMAP_SORT,
  'history-match': HISTORY_MATCH,
  'architecture-diagram': ARCHITECTURE_DIAGRAM,
};

/** World interactable / prop id → board (the world opens `inspect` on these, or emits `minigame.open`). */
const PROP_TO_BOARD: Record<string, MinigameId> = {
  'wall.whiteboard': 'architecture-diagram',
  'prop.whiteboard': 'architecture-diagram',
  'wall.roadmap': 'roadmap-sort',
  'prop.roadmap-board': 'roadmap-sort',
  'wall.history.match': 'history-match',
  'prop.history.match': 'history-match',
  'jared.bolt-bins': 'bolt-sort',
  'prop.bolt-bins': 'bolt-sort',
};

export function boardForProp(propId: string): BoardDef | null {
  const id = PROP_TO_BOARD[propId];
  return id ? BOARDS[id] : null;
}

export function boardById(id: string): BoardDef | null {
  return (BOARDS as Record<string, BoardDef>)[id] ?? null;
}

/** The interactable that hosts a board (for the inspect overlay when a board is opened by id). */
export function propForBoard(id: MinigameId): string {
  return { 'architecture-diagram': 'wall.whiteboard', 'roadmap-sort': 'wall.roadmap', 'history-match': 'wall.history.match', 'bolt-sort': 'jared.bolt-bins' }[id];
}

/* ───────────────────────────── grading ───────────────────────────── */

export interface Grade {
  correct: number;
  total: number;
  /** Ids (items / slots / edges) placed wrongly. */
  wrong: string[];
  /** Ids still empty. */
  missing: string[];
}

/** `placement`: item id → bin id. */
export function gradeSort(def: SortBoardDef, placement: Readonly<Record<string, string | undefined>>): Grade {
  const wrong: string[] = [];
  const missing: string[] = [];
  let correct = 0;
  for (const it of def.items) {
    const at = placement[it.id];
    if (!at) missing.push(it.id);
    else if (at === it.answer) correct++;
    else wrong.push(it.id);
  }
  return { correct, total: def.items.length, wrong, missing };
}

/** `cards`: slot id → card id; `labels`: edge id → label id. */
export function gradeDiagram(def: DiagramBoardDef, cards: Readonly<Record<string, string | undefined>>, labels: Readonly<Record<string, string | undefined>>): Grade {
  const wrong: string[] = [];
  const missing: string[] = [];
  let correct = 0;
  for (const s of def.slots) {
    const at = cards[s.id];
    if (!at) missing.push(s.id);
    else if (at === s.answer) correct++;
    else wrong.push(s.id);
  }
  for (const e of def.edges) {
    if (e.answer === null) continue;
    const at = labels[e.id];
    if (!at) missing.push(e.id);
    else if (at === e.answer) correct++;
    else wrong.push(e.id);
  }
  return { correct, total: def.slots.length + def.edges.filter((e) => e.answer !== null).length, wrong, missing };
}

/** Bins that are full (match boards: one card per plaque). */
export function binFull(def: SortBoardDef, binId: string, placement: Readonly<Record<string, string | undefined>>, exceptItem?: string): boolean {
  const bin = def.bins.find((b) => b.id === binId);
  if (!bin?.capacity) return false;
  const n = Object.entries(placement).filter(([item, b]) => b === binId && item !== exceptItem).length;
  return n >= bin.capacity;
}
