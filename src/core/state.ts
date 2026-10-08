/**
 * Root game state shape (non-simulation parts). The simulation state `LabState` lives in
 * `@/sim/types` and is owned by the sim module.
 *
 *   RootState = { lab, session, ui, progress }
 *
 * - `lab`      — the simulated lab (serialisable; reset per mission/shift; snapshot-able).
 * - `session`  — the current play session: mode, lesson/shift/drill/cert state, tickets, inventory
 *                (`./sessionState.ts` + Arcade parts in `./arcadeState.ts`, re-exported here). Not persisted (GP §7.4).
 * - `ui`       — what is on screen: overlays, prompts, toasts, Teach Cards, banners.
 * - `progress` — persisted player progress (`./progressState.ts`, re-exported here): XP, rank,
 *                mastery, Leitner, achievements, stats, leaderboards, settings.
 *
 * Always import these types from `@/core/state`.
 */
import type { LabState } from '@/sim/types';
import type { ProgressState, Realism } from './progressState';
import type { MarkerTarget, SessionState, TeachCard } from './sessionState';

export type * from './progressState';
export type * from './sessionState';
export type * from './arcadeState';

/* ═════════════════════════════ Settings (GP §6.3, §7.3) ═════════════════════════════ */

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export type ColourBlindMode = 'off' | 'deuter' | 'prot' | 'trit';

/** Rebindable actions (GP §6.3). Values in `DEFAULT_BINDINGS` are `KeyboardEvent.code`s or `Mouse0`/`Mouse2`/`Wheel`. */
export type ControlAction =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'walkFast'
  | 'crouch'
  | 'interact'
  | 'inspect'
  | 'useTool'
  | 'toolMode'
  | 'hotbar1'
  | 'hotbar2'
  | 'hotbar3'
  | 'hotbar4'
  | 'hotbar5'
  | 'holster'
  | 'notebook'
  | 'flashlight'
  | 'tickets'
  | 'hint'
  | 'pause'
  | 'fastForward'
  | 'controlsOverlay'
  | 'sandboxPanel'
  | 'debug';

export const DEFAULT_BINDINGS: Readonly<Record<ControlAction, string>> = {
  moveForward: 'KeyW',
  moveBack: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  walkFast: 'ShiftLeft',
  crouch: 'KeyC',
  interact: 'KeyE',
  inspect: 'Mouse2',
  useTool: 'Mouse0',
  toolMode: 'KeyR',
  hotbar1: 'Digit1',
  hotbar2: 'Digit2',
  hotbar3: 'Digit3',
  hotbar4: 'Digit4',
  hotbar5: 'Digit5',
  holster: 'KeyQ',
  notebook: 'Tab',
  flashlight: 'KeyF',
  tickets: 'KeyT',
  hint: 'KeyH',
  pause: 'Escape',
  fastForward: 'BracketRight',
  controlsOverlay: 'F1',
  sandboxPanel: 'F10',
  debug: 'Backquote',
};

export interface Settings {
  quality: QualityPreset;
  /** Render resolution multiplier on top of devicePixelRatio clamp (0.5–1.5). */
  resolutionScale: number;
  /** Field of view in degrees (60–90, default 75 — GP §6.3). */
  fov: number;
  mouseSensitivity: number;
  invertY: boolean;
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  /** UI bus volume (GP §7.3 `audio.ui`). */
  uiVolume: number;
  /** Dialogue voice-blip volume (GP §7.3 `audio.voice`). */
  voiceVolume: number;
  voiceBlips: boolean;
  showFps: boolean;
  /** Show extra hints/arrows in Academy. */
  guidance: 'full' | 'light' | 'off';
  /** Sim time scale used in Free Play (1 = real time; 1/2/5/10). */
  freeplayTimeScale: number;
  /** Free Play sandbox: penalties on/off (off by default; Teach Cards still fire). */
  freeplayPenalties: boolean;
  /** Free Play sandbox: background pipelines PL1–PL8. */
  freeplayPipelines: boolean;
  /** Free Play sandbox: random faults off / every 3 min / every 90 s. */
  freeplayRandomFaults: 'off' | '3min' | '90s';
  reducedMotion: boolean;
  subtitles: boolean;
  subtitleSize: 'small' | 'medium' | 'large';
  /** Banners and LEDs gain text/shape glyphs (GP §6.1). */
  colourBlind: ColourBlindMode;
  /** Robot quip overlay on tablets (forced off in Strict realism). */
  quipsEnabled: boolean;
  /** Crouch: toggle (false) or hold (true). */
  holdToCrouch: boolean;
  /** Overrides of `DEFAULT_BINDINGS`. */
  bindings: Partial<Record<ControlAction, string>>;
  /** Graphics overrides on top of the quality preset (null = preset default). */
  shadows: boolean | null;
  ao: boolean | null;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  resolutionScale: 1,
  fov: 75,
  mouseSensitivity: 1,
  invertY: false,
  masterVolume: 0.8,
  sfxVolume: 0.9,
  ambienceVolume: 0.6,
  uiVolume: 0.8,
  voiceVolume: 0.8,
  voiceBlips: true,
  showFps: false,
  guidance: 'full',
  freeplayTimeScale: 1,
  freeplayPenalties: false,
  freeplayPipelines: true,
  freeplayRandomFaults: 'off',
  reducedMotion: false,
  subtitles: true,
  subtitleSize: 'medium',
  colourBlind: 'off',
  quipsEnabled: true,
  holdToCrouch: false,
  bindings: {},
  shadows: null,
  ao: null,
};

/* ═════════════════════════════ Tools & parts (GP §6.4) ═════════════════════════════ */

/**
 * Hand-held tools (`session.activeTool`, world `InteractVerb.requiresTool`).
 *
 * Canonical ids per hotbar slot (see `HOTBAR_SLOTS`):
 *  - `spare-fuse-5v` is "the spare blade fuse" (slot 3) for EVERY fuse holder — the selected rating
 *    lives in `session.toolModes.fuseRating`. `spare-fuse-12v` is a deprecated alias the runtime
 *    never selects; world verbs should require `spare-fuse-5v`.
 *  - Slot 5 toggles between `test-card-visa` and `test-card-interac` with `R` (`toolModes.card` mirrors it).
 *  - `ruler` is the steel ruler while carried (it also appears in `items.carried`).
 */
export type ToolId =
  | 'hand'
  | 'screwdriver'
  | 'multimeter'
  | 'spare-fuse-5v'
  /** @deprecated alias of `spare-fuse-5v`; never selected by the runtime. */
  | 'spare-fuse-12v'
  | 'ethernet-cable'
  | 'usb-cable'
  | 'test-card-visa'
  | 'test-card-interac'
  | 'flashlight'
  | 'ruler';

export type HotbarSlot = 1 | 2 | 3 | 4 | 5;

/** GP §6.3/§6.4 hotbar: slot → tool and the Academy module that unlocks it. */
export const HOTBAR_SLOTS: readonly { slot: HotbarSlot; tool: ToolId; label: string; unlockedBy: string }[] = [
  { slot: 1, tool: 'screwdriver', label: 'Screwdriver', unlockedBy: 'M04' },
  { slot: 2, tool: 'multimeter', label: 'Multimeter', unlockedBy: 'M03' },
  { slot: 3, tool: 'spare-fuse-5v', label: 'Spare blade fuse', unlockedBy: 'M03' },
  { slot: 4, tool: 'ethernet-cable', label: 'Ethernet cable', unlockedBy: 'M06' },
  { slot: 5, tool: 'test-card-visa', label: 'Test card', unlockedBy: 'M10' },
];

export type MultimeterMode = 'V_DC' | 'V_AC' | 'OHM' | 'CONTINUITY';
/** Blade fuse ratings in the spare tray: 5 A tan, 7.5 A brown, 10 A red, 15 A blue. */
export type FuseRating = 5 | 7.5 | 10 | 15;
export const FUSE_RATINGS: readonly FuseRating[] = [5, 7.5, 10, 15];
export type TestCardKind = 'VISA' | 'INTERAC';
export type ScrewdriverBit = '2.5mm' | '5mm';

/** Tool modes cycled with `R` while the tool is held (GP §6.3). */
export interface ToolModes {
  multimeter: MultimeterMode;
  fuseRating: FuseRating;
  card: TestCardKind;
  screwdriverBit: ScrewdriverBit;
  flashlightOn: boolean;
}

/** Large items carried in both hands (hotbar disabled; `Q` sets down, `E` installs). */
export type CarriedItemId =
  | 'ruler'
  | 'flex2-spare'
  | 'flex1-legacy'
  | 'mini3-spare'
  | 'pi-spare'
  | 'cradle-new'
  | 'cradle-cracked'
  | 'flex4-psu-brick'
  | 'collis-probe-spare'
  | 'receipt'
  | 'device'
  | 'pi'
  | 'safety-card';

export interface CarriedItem {
  id: CarriedItemId;
  label: string;
  /** Sim reference: device serial / runtime id, receipt image ref, removed fuse id … */
  ref: string | null;
}

/** Physical parts inventory (GP §6.4). */
export interface PartsInventory {
  /** Spare blade fuses in the pocket by rating (keys `"5" | "7.5" | "10" | "15"`); pocket holds 3 in total. */
  fuses: Record<string, number>;
  /** 1 m spare Ethernet cables (hotbar 4; refill from the blue bin). */
  ethernetCables: number;
  usbLeads: number;
  /** Test cards in the wallet. */
  testCards: TestCardKind[];
  /** Removed (blown or good) fuse in hand, for the Ω check: `{ fuseId, rating, blown }`. */
  removedFuse: { fuseId: string; rating: number; blown: boolean } | null;
  /** Large item in both hands, or null. */
  carried: CarriedItem | null;
  /** Small parts by id: `pi-spare`, `sd-card`, `solenoid-spare`, `ribbon`, `card-insert-ribbon`, `bolt-2.5mm`, `bolt-5mm` … */
  parts: Record<string, number>;
}

export const FUSE_POCKET_CAPACITY = 3;

/* ═════════════════════════════ UI (overlays, toasts, Teach Cards) ═════════════════════════════ */

/** Main-menu screens (GP §2.1 menu order). */
export type MenuScreen =
  | 'title'
  | 'new-profile'
  | 'quick-setup'
  | 'home'
  | 'academy'
  | 'arcade'
  | 'shift-setup'
  | 'drills'
  | 'daily'
  | 'certification'
  | 'freeplay'
  | 'manual'
  | 'profile'
  | 'achievements'
  | 'leaderboards'
  | 'settings';

export type TicketPanel = 'list' | 'detail' | 'call' | 'escalate' | 'reply' | 'bug' | 'task';

export type Overlay =
  | { kind: 'none' }
  | { kind: 'main-menu'; screen?: MenuScreen }
  | { kind: 'pause' }
  /** Workstation desktop (apps open via `requestOpenApp` in `@/computer/apps`). */
  | { kind: 'computer' }
  | { kind: 'tablet'; robotId: string }
  | { kind: 'inspect'; propId: string }
  | { kind: 'quiz'; questionIds: string[]; context: 'lesson' | 'drill' | 'review' | 'cert' | 'arcade' }
  | { kind: 'briefing' }
  | { kind: 'debrief' }
  | { kind: 'manual'; articleId?: string }
  | { kind: 'settings' }
  | { kind: 'drill'; drillId: string }
  /** Ticket board (`T`). Non-pausing — the shift keeps running. */
  | { kind: 'tickets'; ticketId?: string; panel?: TicketPanel }
  /** Notebook (`Tab`). Non-pausing. */
  | { kind: 'notebook'; tab?: 'notes' | 'evidence' | 'checklist' | 'safety' }
  /** Leitner review session (Field Manual → Flashcards). */
  | { kind: 'flashcards'; deck?: string; tags?: string[] }
  /** Certification written exam / results. */
  | { kind: 'certification'; examId: string }
  /** Free Play sandbox panel (`F10`). Non-pausing. */
  | { kind: 'sandbox' }
  /** Controls overlay (`F1`). */
  | { kind: 'controls' }
  /** Rank-up ceremony (≤ 20 s, skippable). */
  | { kind: 'rank-up'; rank: string }
  /** Academy centre-modal Teach Card (in Shift they are a side panel, not an overlay). */
  | { kind: 'teach-card'; teachCardId: string };

/**
 * Overlays that freeze the simulation clock (and with it the shift clock, SLAs and hint timers).
 * `core/game.ts` uses this set.
 */
export const PAUSING_OVERLAY_KINDS: ReadonlySet<Overlay['kind']> = new Set<Overlay['kind']>([
  'main-menu',
  'pause',
  'settings',
  'manual',
  'quiz',
  'briefing',
  'debrief',
  'flashcards',
  'certification',
  'controls',
  'rank-up',
  'teach-card',
]);

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error' | 'xp' | 'achievement' | 'manual' | 'penalty' | 'bonus' | 'ticket' | 'rank' | 'streak';
  title: string;
  body?: string;
  /** Game-clock ms at creation (for ordering); UI removes after its own timeout. */
  createdAtMs: number;
  /** Optional icon glyph (achievements). */
  icon?: string;
}

/** Sticky HUD banner, e.g. "Jared: out to lunch", "Progress won't be saved", "Verifying… waiting for 08:20 health check". */
export interface Banner {
  id: string;
  kind: 'info' | 'warning' | 'error';
  text: string;
  /** Session real seconds after which it disappears, or null = until removed. */
  untilS: number | null;
}

/** One-time control prompt (GP §6.2: bottom-centre, 3 s, key glyph). */
export interface ControlHint {
  /** Stable id; remembered in `progress.flags['prompt:<id>']`. */
  id: string;
  keys: string[];
  text: string;
}

export interface UiState {
  overlay: Overlay;
  /** Interaction prompt for the interactable under the crosshair (engine writes this). */
  prompt: { label: string; verbs: { key: string; label: string; disabled?: boolean }[] } | null;
  toasts: Toast[];
  /** True while pointer lock is held by the 3D view. */
  pointerLocked: boolean;
  /** Loading progress 0..1 while the world is being built. */
  loading: { progress: number; label: string } | null;
  /** Developer overlay toggle (backtick key). */
  debug: boolean;
  /** Active Teach Cards (GP §5.5), newest last. Shift: side panel (collapse after 5 s); Academy: modal. */
  teachCards: TeachCard[];
  banners: Banner[];
  /** Ticket highlighted in the HUD queue / open in the ticket panel. */
  selectedTicketId: string | null;
  /** Inspect callouts currently shown (≤ 4 lines, 4 s). Written by missions (lesson callouts) or the world. */
  callouts: { propId: string; lines: string[]; untilS: number } | null;
  controlHint: ControlHint | null;
  /** HUD highlight of a world object / app element (interact hints, Walkthrough tier). */
  highlight: MarkerTarget | null;
  /** Floor waypoint / compass marker for the current objective. */
  marker: MarkerTarget | null;
}

/* ═════════════════════════════ Root ═════════════════════════════ */

export interface RootState {
  lab: LabState;
  session: SessionState;
  ui: UiState;
  progress: ProgressState;
}

/* ═════════════════════════════ Defaults ═════════════════════════════ */

/** Schema version of `ProgressState` (v2 = gameplay contract: tagMastery, shifts, certs, leaderboards …). */
export const PROGRESS_VERSION = 2;
/** Content version for daily seeds and leaderboards (GP §4.6). */
export const CONTENT_VERSION = 'v1';

export function createDefaultProgress(): ProgressState {
  return {
    version: PROGRESS_VERSION,
    contentVersion: CONTENT_VERSION,
    profileId: 'p_default',
    playerName: 'New Hire',
    createdAt: 0,
    realism: 'standard',
    xp: 0,
    rank: 'intern',
    pendingRank: null,
    cosmetics: { lanyard: 'grey', unlocked: ['lanyard.grey'] },
    modules: {},
    academyCheckpoint: null,
    quiz: {},
    mastery: {},
    tagMastery: {},
    leitner: {},
    flashcards: {
      reviewsTotal: 0,
      newCardsToday: 0,
      newCardsDay: 0,
      xpToday: 0,
      xpTodayDay: 0,
      lastSessionDay: 0,
      lastSessionCardIds: [],
    },
    achievements: {},
    achievementProgress: {},
    incidents: {},
    drills: {},
    bestShiftScores: {},
    bestDrillScores: {},
    shifts: { history: [], gradeCounts: { S: 0, A: 0, B: 0, C: 0, D: 0 }, bestFullShiftRatio: 0, byLength: {} },
    daily: { lastRankedDateKey: null, rankedCount: 0, history: [] },
    penalties: {},
    freeplay: { fixesTotal: 0, xpToday: 0, xpTodayDay: 0 },
    certs: {},
    fieldManual: { unlocked: [], bookmarks: [], read: [] },
    notebook: { notes: '', pinnedEvidence: [] },
    leaderboards: {},
    streak: { current: 0, best: 0, lastPlayedDay: 0, lastCountedDay: 0, lastCountedDateKey: null, freezes: 0, xpToday: 0, xpTodayDay: 0 },
    stats: {
      incidentsResolved: 0,
      robotsParked: 0,
      fusesReplaced: 0,
      pipelinesRun: 0,
      playSeconds: 0,
      ticketsTotal: 0,
      diagnosisCalls: 0,
      fastDiagnoses: 0,
      escalationsCorrect: 0,
      escalationsBounced: 0,
      inspections: 0,
      flashcardsReviewed: 0,
      drillRounds: 0,
      shiftsCompleted: 0,
      academyStepsCompleted: 0,
      hintsUsed: 0,
      freeplayFixes: 0,
    },
    flags: {},
    settings: { ...DEFAULT_SETTINGS, bindings: {} },
  };
}

export function createDefaultToolModes(): SessionState['toolModes'] {
  return { multimeter: 'V_DC', fuseRating: 10, card: 'VISA', screwdriverBit: '2.5mm', flashlightOn: false };
}

export function createDefaultItems(): PartsInventory {
  return {
    fuses: { '5': 0, '7.5': 0, '10': 0, '15': 0 },
    ethernetCables: 0,
    usbLeads: 0,
    testCards: [],
    removedFuse: null,
    carried: null,
    parts: {},
  };
}

export function createDefaultComputerGating(): SessionState['computer'] {
  return {
    unlockedApps: 'all',
    restrictions: {},
    forceHealthCheckButton: false,
    tabCompletion: true,
  };
}

export function createDefaultSession(realism: Realism = 'standard'): SessionState {
  return {
    mode: 'menu',
    activityId: null,
    runId: 0,
    clockS: 0,
    realism,
    stepIndex: 0,
    objectives: [],
    dialogue: null,
    timerSeconds: null,
    score: { points: 0, combo: 0, maxCombo: 0, incidentsResolved: 0, incidentsFailed: 0, mistakes: 0 },
    tickets: [],
    player: {
      position: [0, 0, 4],
      yaw: Math.PI,
      pitch: 0,
      locationId: null,
      lookingAt: null,
      crouched: false,
    },
    inventory: ['hand', 'flashlight'],
    activeTool: 'hand',
    toolModes: createDefaultToolModes(),
    items: createDefaultItems(),
    academy: null,
    quiz: null,
    shift: null,
    drill: null,
    freeplay: null,
    cert: null,
    weakSpot: null,
    computer: createDefaultComputerGating(),
    notebook: { evidence: [], checklist: [] },
    counters: {},
    vars: {},
    result: null,
  };
}

export function createDefaultUi(): UiState {
  return {
    overlay: { kind: 'main-menu' },
    prompt: null,
    toasts: [],
    pointerLocked: false,
    loading: { progress: 0, label: 'Booting lab…' },
    debug: false,
    teachCards: [],
    banners: [],
    selectedTicketId: null,
    callouts: null,
    controlHint: null,
    highlight: null,
    marker: null,
  };
}
