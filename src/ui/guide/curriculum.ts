/**
 * Curriculum view model (pure): every Academy module in order with its state for this player
 * (done / next / in-progress / available / locked), time, what it teaches in one line and what it
 * unlocks — for the "Start here" card, the Curriculum map and the coach.
 */
import type { ProgressState } from '@/core/state';
import { MODULES, MODULES_BY_ID } from '@/content';
import type { ModuleMeta } from '@/content';
import { isModuleComplete, nextModule } from '@/ui/data/views';
import { DRILL_CATALOG } from '@/ui/data/catalog';

export type CurriculumState = 'done' | 'next' | 'in-progress' | 'available' | 'locked';

export interface CurriculumTrack {
  title: string;
  sub: string;
  ids: string[];
}

/** The four Academy tracks (Cur §2). */
export const TRACKS: CurriculumTrack[] = [
  { title: 'Foundations', sub: 'The lab, the devices, power and the robots', ids: ['M01', 'M02', 'M03', 'M04', 'M05'] },
  { title: 'Orka & Jenkins', sub: 'Statuses, entities, merchants, screens and pipelines', ids: ['M06', 'M07', 'M08', 'M09', 'M10', 'M11'] },
  { title: 'Automation code', sub: 'ADB, uia-relay, config.properties, Parrot and OCR', ids: ['M12', 'M13', 'M14', 'M15', 'M16'] },
  { title: 'Capstone', sub: 'AI, infrastructure, teams and the capstone shift', ids: ['M17', 'M18'] },
];

/** GP §2.2.2 — what each module unlocks outside the Academy (display). */
export const MODULE_UNLOCKS: Record<string, string[]> = {
  M01: ['DR10 Speed Quiz', 'DR14', 'DR17', 'Field Manual: Lab Basics'],
  M03: ['INC03, INC17, INC18', 'DR04, DR13', 'Hotbar: multimeter, spare fuse'],
  M04: ['6 incidents', 'DR16 Park It!', '5-minute Shift', 'Free Play', 'Hotbar: screwdriver'],
  M05: ['INC19, INC56', 'Terminal'],
  M06: ['12 incidents', 'DR01, DR09', 'Weak Spot', 'Hotbar: Ethernet cable'],
  M07: ['9 incidents', 'DR11, DR12'],
  M08: ['INC23, INC28, INC49–51'],
  M09: ['INC20, INC21, INC52', 'DR07'],
  M10: ['INC53–55, INC58', 'Hotbar: test card', '10-minute Shift'],
  M11: ['INC26, INC39, INC44'],
  M12: ['DR03, DR19 ADB Speedrun'],
  M13: ['INC32–34', 'DR08 POM Builder, DR15'],
  M14: ['INC27, INC29, INC30, INC35, INC47', 'DR02, DR09 (all sets)', 'Daily Challenge'],
  M15: ['INC22, INC25', 'DR06 JSON Medic, DR18'],
  M16: ['INC24, INC36–38, INC64', 'DR05'],
  M17: ['INC10, INC57, INC61'],
  M18: ['Full Shift (20 min)', 'Certification exams'],
};

/** Modes and practice the unlock lists name (highlighted on the map). */
const MODE_WORDS = /Shift|Free Play|Weak Spot|Daily|Certification|Terminal/;

/** Workstation code practice that drills what a module teaches (always open; recommended after it). */
export const MODULE_PRACTICE: Record<string, ('parrot' | 'uia')[]> = {
  M12: ['uia'],
  M13: ['uia'],
  M14: ['uia'],
  M15: ['parrot'],
  M16: ['parrot', 'uia'],
};

/** "What you'll learn" in one line (condensed from each module's summary). */
export const LEARN_LINE: Record<string, string> = {
  M01: 'Find your way round the lab, read a robot’s status tablet and stay safe around running robots.',
  M02: 'Tell the Stand, Micro, Flux and Compass device families apart and decode MFD and CFD.',
  M03: 'Trace power from the wall to every Pi and NUC, and replace a blown inline fuse.',
  M04: 'Open up a touch robot — gantry, steppers, solenoid, limit switches — and park it safely.',
  M05: 'SSH into the Raspberry Pi that runs each shelf and check its health.',
  M06: 'How Orka and Jenkins work together, and what the five robot statuses mean.',
  M07: 'Fix and extend Orka’s entities: robots, devices, URLs, tethering and offsets.',
  M08: 'How Orka matches tests to robots, and where Merchant Config keeps its credentials.',
  M09: 'Screens, Screen Locations in millimetres, and when a tap is ADB or a solenoid.',
  M10: 'Card profiles end to end: swipes, dips and taps through Gorth, Kallus and Kollis.',
  M11: 'Jenkins as the Executor: views, the ALL-CAPS device type rule and injected variables.',
  M12: 'Drive a device over ADB on port 5444: connect, dump the screen and tap.',
  M13: 'Clone uia-relay into IntelliJ IDEA and fix its page objects.',
  M14: 'Set up config.properties for a tethered run and run the Tax test.',
  M15: 'Parrot’s raw JSON tests: find and fix what no linter will catch.',
  M16: 'Read the ADB-blind customer screen with OCR, GIMP and UIA 2.3.',
  M17: 'The GPU blade, the Ollama vision proof of concept and the automation roadmap.',
  M18: 'The team’s history, then a no-hints capstone shift.',
};

export function learnLine(meta: ModuleMeta): string {
  return LEARN_LINE[meta.id] ?? (meta.summary.split(/(?<=[.!?])\s/)[0] ?? meta.summary);
}

/** Upper estimate in minutes (the range's top, else `estMinutes`). */
export function moduleMinutes(meta: { estMinutes: number; estMinutesRange?: [number, number] }): number {
  return meta.estMinutesRange ? meta.estMinutesRange[1] : meta.estMinutes;
}

export interface CurriculumRow {
  meta: ModuleMeta;
  index: number;
  track: string;
  state: CurriculumState;
  minutes: number;
  stars: number;
  /** "What you'll learn" in one line. */
  learn: string;
  missing: string[];
  unlocks: string[];
  /** Unlocks that are modes or practice (Shift, Free Play, Daily, UIA Practice …). */
  unlockModes: string[];
}

function trackOf(id: string): string {
  return TRACKS.find((t) => t.ids.includes(id))?.title ?? '';
}

export function curriculumRows(p: ProgressState): CurriculumRow[] {
  const next = nextModule(p);
  return MODULES.map((meta, index) => {
    const done = isModuleComplete(p, meta.id);
    const missing = meta.prerequisites.filter((pre) => !isModuleComplete(p, pre));
    const rec = p.modules[meta.id];
    const state: CurriculumState = done ? 'done' : meta.id === next ? 'next' : missing.length ? 'locked' : rec?.status === 'in-progress' || p.academyCheckpoint?.moduleId === meta.id ? 'in-progress' : 'available';
    const unlocks = MODULE_UNLOCKS[meta.id] ?? [];
    return {
      meta,
      index,
      track: trackOf(meta.id),
      state,
      minutes: moduleMinutes(meta),
      stars: rec?.stars ?? 0,
      learn: learnLine(meta),
      missing,
      unlocks,
      unlockModes: unlocks.filter((u) => MODE_WORDS.test(u)),
    };
  });
}

export interface CurriculumTotals {
  done: number;
  total: number;
  minutesTotal: number;
  minutesLeft: number;
}

export function curriculumTotals(rows: CurriculumRow[]): CurriculumTotals {
  const done = rows.filter((r) => r.state === 'done').length;
  return {
    done,
    total: rows.length,
    minutesTotal: rows.reduce((a, r) => a + r.minutes, 0),
    minutesLeft: rows.filter((r) => r.state !== 'done').reduce((a, r) => a + r.minutes, 0),
  };
}

/** "3 h 40 min" / "45 min". */
export function hoursLabel(minutes: number): string {
  if (minutes <= 0) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export interface StartHere {
  moduleId: string;
  meta: ModuleMeta;
  resume: boolean;
  /** Player has never finished a module. */
  firstTime: boolean;
  learn: string;
  minutes: number;
}

/** The one thing a player should do next in the Academy, or null when it is complete. */
export function startHere(p: ProgressState): StartHere | null {
  const id = nextModule(p);
  const meta = id ? MODULES_BY_ID[id] : null;
  if (!id || !meta) return null;
  const firstTime = !MODULES.some((m) => isModuleComplete(p, m.id));
  return { moduleId: id, meta, resume: p.academyCheckpoint?.moduleId === id, firstTime, learn: learnLine(meta), minutes: moduleMinutes(meta) };
}

/** Drill ids that train a module (it is one of the modules that unlock them). */
export function drillsForModule(moduleId: string): string[] {
  return DRILL_CATALOG.filter((d) => d.unlockedBy.includes(moduleId)).map((d) => d.id);
}
