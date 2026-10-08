/**
 * Display fallbacks for Arcade catalogues (GP §2.3.2, §2.4.2) — used only when the mission runtime
 * does not answer yet (`missions.drills()` / `missions.shifts()` return nothing). The runtime's
 * definitions win whenever they exist.
 */
import type { Medal } from '@/core/state';
import { DRILLS } from '@/missions/drills';

export interface DrillCatalogEntry {
  id: string;
  name: string;
  alias?: string;
  format: string;
  tags: string[];
  unlockedBy: string[];
  durationS: number | null;
  itemCount: number | null;
  medals: Record<Medal, number>;
}

const d = (id: string, name: string, format: string, unlockedBy: string[], b: number, s: number, g: number, durationS: number | null, itemCount: number | null, tags: string[], alias?: string): DrillCatalogEntry => ({
  id,
  name,
  alias,
  format,
  tags,
  unlockedBy,
  durationS,
  itemCount,
  medals: { bronze: b, silver: s, gold: g },
});

/** GP §2.4.2 drill catalogue (static fallback; the authored `DrillDef`s override it below). */
const DRILL_FALLBACK: DrillCatalogEntry[] = [
  d('DR01', 'Status Triage', 'Scenario card → press 1–5 (Available, Unavailable, Offline, Connection Failed, Reserved)', ['M06'], 800, 1500, 2200, 60, null, ['orca.status', 'orca.healthcheck']),
  d('DR02', 'config.properties Speed-Build', 'Build a full file for a rig card; 3 files, 120 s', ['M14'], 900, 1600, 2300, 120, 3, ['uia.config', 'adb.port', 'orca.tethered']),
  d('DR03', 'Port Patrol', 'Lines scroll by: flag Lab-safe or Collision risk; 60 s', ['M12'], 900, 1600, 2400, 60, null, ['adb.port', 'adb.usage']),
  d('DR04', 'Power Path', 'Wiring board: sources → loads; 3 boards, 120 s', ['M03'], 900, 1500, 2100, 120, 3, ['power.rails', 'power.fuses', 'power.18v']),
  d('DR05', 'Coordinate Hunter', 'GIMP-style screenshot: draw the box; scored by edge error', ['M16'], 700, 1300, 1900, 60, null, ['pigeon.gimp', 'orca.screens', 'orca.screencompare']),
  d('DR06', 'JSON Medic', 'Pigeon payload: click the error, pick the fix; 5 payloads, 90 s', ['M15'], 700, 1300, 2000, 90, 5, ['pigeon.json', 'pigeon.nolint'], 'Comma Hunt'),
  d('DR07', 'Receipt Map', 'Choose RECEIPT_OPTIONS_4 / _5, then tap the asked button; 60 s', ['M09'], 900, 1600, 2300, 60, null, ['receipt.maps', 'receipt.qr', 'orca.screens']),
  d('DR08', 'POM Builder', 'Build a page object, or fix a broken one; 3 classes, 120 s', ['M13'], 800, 1400, 2000, 120, 3, ['uia.pom', 'uia.sync', 'uia.packages', 'uia.scroll'], 'POM Doctor'),
  d('DR09', 'Pipeline Order', 'Order the cards: Tax test, architecture, power chain, OCR, dip card, Laz OOBE; 90 s', ['M06', 'M14'], 700, 1300, 1900, 90, 4, ['uia.taxtest', 'arch.flow', 'power.rails']),
  d('DR10', 'Speed Quiz', 'Rapid multiple choice from the curriculum quiz bank; 90 s', ['M01'], 1000, 2000, 3000, 90, null, []),
  d('DR11', 'Caps Lock', 'Accept or reject a Jenkins DEVICE_TYPE / enum value; 45 s', ['M07'], 900, 1600, 2300, 45, null, ['orca.devicetype', 'jenkins.envvars']),
  d('DR12', 'Entity Atlas', '"Where does X live?" → Orca entity + field; 60 s', ['M07'], 800, 1500, 2200, 60, null, ['orca.entities']),
  d('DR13', 'Meter Reader', 'Multimeter reading at a probe point → fault; 60 s', ['M03'], 700, 1300, 1900, 60, null, ['power.rails', 'power.fuses', 'hw.pi']),
  d('DR14', 'Who You Gonna Call', 'Problem → the right person, or handle it yourself; 45 s', ['M01'], 600, 1100, 1600, 45, null, ['people.roles', 'orca.status.connfailed']),
  d('DR15', 'Where Does It Go?', 'Files rain down → drop into the right uia-remote package; 60 s', ['M13'], 800, 1400, 2000, 60, null, ['uia.layout', 'uia.packages']),
  d('DR16', 'Park It!', 'Rigs go yellow: the right tablet action on each; 90 s', ['M04'], 600, 1100, 1700, 90, null, ['hw.motion', 'hw.lockout', 'hw.tablet']),
  d('DR17', 'Lab Lore', 'Rapid recall of numbers, teams, history, stack and hardware; 60 s', ['M01'], 800, 1500, 2200, 60, null, ['arch', 'people.roles']),
  d('DR18', 'Log Detective', 'Evidence snippet → the true root cause of four; 90 s', ['M15'], 700, 1300, 1900, 90, null, ['jenkins', 'orca.notes']),
  d('DR19', 'ADB Speedrun', 'Live terminal: connect on 5444, dump, find bounds, tap; targets back-to-back, 120 s', ['M12'], 600, 1100, 1600, 120, null, ['adb.usage', 'adb.port']),
];

/** The drill catalogue: authored drill definitions (`src/missions/drills`) win over the fallback rows. */
export const DRILL_CATALOG: DrillCatalogEntry[] = DRILL_FALLBACK.map((f) => {
  const def = DRILLS.find((x) => x.id === f.id);
  if (!def) return f;
  return {
    id: def.id,
    name: def.name,
    ...(def.alias ? { alias: def.alias } : {}),
    format: def.format,
    tags: [...def.tags],
    unlockedBy: [...def.unlockedBy],
    durationS: def.durationS,
    itemCount: def.itemCount,
    medals: { ...def.medals },
  };
});

export interface ShiftCatalogEntry {
  id: string;
  title: string;
  description: string;
  lengthMinutes: number;
  heatCap: number;
  unlockModule: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  boardLength: string;
}

/** GP §2.1 / §2.3.2 shift lengths. */
export const SHIFT_CATALOG: ShiftCatalogEntry[] = [
  { id: 'shift-5', title: '5-minute Shift', description: 'Five real minutes, heat capped at H3. The lab runs at 5×, so Orca’s 5-minute health check comes round every real minute.', lengthMinutes: 5, heatCap: 3, unlockModule: 'M04', difficulty: 2, boardLength: '5' },
  { id: 'shift-10', title: '10-minute Shift', description: 'Ten real minutes, heat up to H4, shift events possible.', lengthMinutes: 10, heatCap: 4, unlockModule: 'M10', difficulty: 3, boardLength: '10' },
  { id: 'shift-20', title: 'Full Shift', description: 'Twenty minutes, heat up to H5, planned work at 0:30 — the CERT-R5 eligibility shift.', lengthMinutes: 20, heatCap: 5, unlockModule: 'M18', difficulty: 5, boardLength: '20' },
];

/** Career rank shift difficulty caps (GP §2.3.3). */
export const RANK_DIFFICULTY_CAP: Record<string, number> = {
  intern: 2,
  'lab-technician': 3,
  'automation-engineer-1': 4,
  'automation-engineer-2': 5,
  'senior-automation-engineer': 5,
  'lab-lead': 5,
};

/** GP §2.3.3 heat labels. */
export const HEAT_LABELS = ['', 'Calm', 'Busy', 'Hot', 'Very hot', 'Meltdown'] as const;
