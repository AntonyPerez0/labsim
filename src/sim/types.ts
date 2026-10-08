/**
 * LabState — the complete, serialisable simulation state of the lab.
 *
 * This file is the central CONTRACT between the simulation (src/sim), the 3D world (src/world),
 * the workstation apps (src/computer), the HUD/UI (src/ui) and the mission runtime (src/missions).
 * Field names and semantics follow docs/reference/REMOVED-internal-reference.md and
 * docs/design/40-simulation.md ("Sim"; section numbers below refer to it). Add fields rather than
 * renaming; keep everything JSON-serialisable (no Maps/Sets/classes/functions/Dates).
 *
 * Conventions (Sim §0):
 *  - Two clocks (Sim §0.3): `time.nowMs` = GAME clock (ms since game-midnight of 2026-10-05; scaled
 *    by `timeScale`; used for timestamps, health checks, schedules). `time.physMs` = PHYSICAL clock
 *    (unscaled play time; used for everything that "takes time": boots, motion, builds, prints).
 *    Every `…Ms` field below states which clock it uses ("game" / "phys") when it is a point in time.
 *  - Robot/screen coordinates are millimetres from the device screen's top-left (0,0), X right, Y down.
 *  - Image coordinates (OCR / GIMP / screencaps) are integer pixels.
 *  - Money is integer cents; rates in basis points (8.25 % = 825).
 *  - Ids are stable strings unless the field mirrors a MySQL auto-increment id (`number`).
 *  - "Owner" notes say which half of the sim writes the field: sim-core or sim-devops
 *    (split documented at the top of src/sim/impl/index.ts). Every other module only reads.
 *
 * Static per-type data (`DeviceTypeInfo`) is CODE, not state: the constants table
 * `DEVICE_TYPES: Record<DeviceTypeCode, DeviceTypeInfo>` lives in `src/sim/seed/deviceTypes.ts`
 * (Sim §2.2) and firmware layouts in `src/sim/seed/layouts/` (Sim §2.10.2).
 */
import type { RngState } from '@/core/rng';

/* ────────────────────────────── Contract constants ────────────────────────────── */

/** Current `LabState.version` (Sim §6.4). Bump on breaking change and add a migration. */
export const LAB_STATE_VERSION = 2;
/** Game calendar day 0 (a Monday). `time.nowMs = 0` is midnight at the start of this day. */
export const EPOCH_DATE = '2026-10-05';
/** Default seed for `reset()` and `createInitialLabState()` (Sim §2.1). */
export const DEFAULT_SEED = 20261005;
/** Orca's synchronized health-check period, game ms (canon: 5 game minutes). */
export const HEALTH_CHECK_INTERVAL_MS = 300_000;
/** Maximum physical ms per simulation sub-step (Sim §6.2). */
export const SIM_SUBSTEP_MS = 50;
/** Allowed `time.timeScale` values (Sim §6.3). */
export const TIME_SCALES = [1, 2, 5, 10, 30] as const;
/** All independent RNG streams (Sim §6.1). */
export const RNG_STREAMS = ['core', 'faults', 'jenkins', 'devices', 'ollama', 'npc'] as const;

/* ────────────────────────────── Static enums ────────────────────────────── */

/** Orca DeviceType enum. ALL CAPS — which is why Jenkins env vars carrying it must be all caps. */
export type DeviceTypeCode =
  | 'STATION_2018'
  | 'STATION_2'
  | 'STATION_DUO'
  | 'STATION_DUO_2'
  | 'STATION_DUO_3'
  | 'MINI_2'
  | 'MINI_3'
  | 'MINI_4'
  | 'FLEX_1'
  | 'FLEX_2'
  | 'FLEX_3'
  | 'FLEX_4'
  | 'FLEX_POCKET'
  | 'COMPACT';

/** Every DeviceType constant in Orca's enum order (exact, case-sensitive — `DeviceType.valueOf`). */
export const DEVICE_TYPE_CODES: readonly DeviceTypeCode[] = [
  'STATION_2018',
  'STATION_2',
  'STATION_DUO',
  'STATION_DUO_2',
  'STATION_DUO_3',
  'MINI_2',
  'MINI_3',
  'MINI_4',
  'FLEX_1',
  'FLEX_2',
  'FLEX_3',
  'FLEX_4',
  'FLEX_POCKET',
  'COMPACT',
];

/** Family value used by `deviceType` in uia-remote config.properties (governs scroll/layout logic). */
export type DeviceFamily = 'Station' | 'Mini' | 'Flex' | 'Compact';

/** Shared testing profiles (Flex 3/4/Pocket share FLEX_GEN3). Also the firmware layout id (Sim §2.10.2). */
export type TestingProfile =
  | 'STATION_2018'
  | 'STATION_2'
  | 'STATION_DUO'
  | 'MINI_GEN2'
  | 'MINI_GEN3'
  | 'FLEX_GEN1'
  | 'FLEX_GEN2'
  | 'FLEX_GEN3'
  | 'COMPACT';

/**
 * Static metrics of one Device Type (Orca's enum carries "device dimensions, layout metrics and
 * internal string definitions", Ref §3). Values: Sim §2.2. Constants table: `DEVICE_TYPES` in
 * `src/sim/seed/deviceTypes.ts` (sim-core). Not part of LabState.
 */
export interface DeviceTypeInfo {
  code: DeviceTypeCode;
  displayName: string; // "Flex 3"
  family: DeviceFamily;
  testingProfile: TestingProfile;
  /** Physical body size in mm (w × h × d) — for 3D modelling. */
  bodyMm: { w: number; h: number; d: number };
  /** Primary (merchant-facing) display. */
  screen: { wMm: number; hMm: number; wPx: number; hPx: number; diagonalIn: number };
  /** Secondary customer-facing display driven by the same terminal (Station Duo family). */
  secondaryScreen?: { wMm: number; hMm: number; wPx: number; hPx: number; diagonalIn: number };
  hasPrinter: boolean;
  hasCardReader: boolean;
  /** Launcher scroll direction used by HomeScreen.open(appName). Flex = vertical; Mini/Station = horizontal. */
  launcherScroll: 'vertical' | 'horizontal';
  /** True when only the MFD is exposed to ADB and the CFD is ADB-blind (legacy UIA < 2.3). */
  dualScreenSingleAdb: boolean;
  /** Upcoming hardware not yet in the lab (Duo 3, Mini 4). */
  upcoming: boolean;
  market: 'US' | 'CA' | 'US/CA';
  notes: string;
  /** NEW — device px per screen mm (x / y) of the primary display (Sim §2.2); screencap px = round(mm × pxPerMm). */
  pxPerMm?: { x: number; y: number };
  /** NEW — px per mm of the secondary (CFD) display, Duo family only. */
  secondaryPxPerMm?: { x: number; y: number };
  /** NEW — firmware layout id used for hit tests and Orca seeds (= testingProfile; Duo CFD uses MINI_GEN3). */
  layout?: TestingProfile;
  /** NEW — device types this one hot-swaps for (MINI_3 → ['STATION_DUO_2'], Ref §1). Informational. */
  hotSwapFor?: DeviceTypeCode[];
  /** NEW — `adb shell getprop ro.product.model` value (Sim §3.8.5), e.g. "Flex 3". */
  modelString?: string;
  /** NEW — serial model code used in `SIM-<code>-0000nn` (Sim §2.4), e.g. "F3", "S2", "CP". */
  serialPrefix?: string;
}

/* ────────────────────────────── Time, RNG, config, bookkeeping ────────────────────────────── */

/** Independent seeded RNG streams (Sim §6.1). */
export type RngStream = (typeof RNG_STREAMS)[number];

/** `LabState.time` (Sim §0.3, §1.1). Written only by `sim.tick` / jumps / `setTimeScale` (sim-core). */
export interface TimeState {
  /** GAME clock: ms since game-midnight of `epochDate`. 08:00 = 28_800_000. Negative = previous day. */
  nowMs: number;
  /** NEW — PHYSICAL clock: unscaled play time in ms (advances by dtGame / timeScale). */
  physMs: number;
  /** Game ms per physical ms: one of TIME_SCALES (1, 2, 5, 10, 30). */
  timeScale: number;
  /** Hour of day the session started (8 Shift/cert, 9 Academy/Free Play). */
  startHour: number;
  /** NEW — calendar date of `nowMs = 0`: "2026-10-05" (a Monday). */
  epochDate: string;
  /** Lock-screen / tablet date label, e.g. "MON, OCT 5". */
  dateLabel: string;
  /** NEW — health checks fire when the game clock crosses nowMs ≡ healthAnchorMs (mod 300 000). Always 0. */
  healthAnchorMs: number;
}

/** NEW — mode-level switches set by presets / missions, never by content (Sim §1.1, §6.5). */
export interface SimConfig {
  mode: 'academy' | 'arcade' | 'freeplay' | 'cert' | 'test';
  /** What a wrong plug does (Sim §3.13.3): academy = spark only; arcade = fry + branch fuse; full = + brown-outs. */
  damageModel: 'academy' | 'arcade' | 'full';
  /** Background pipelines PL1–PL8 are driven by missions; the sim only exposes the flag. */
  pipelinesEnabled: boolean;
  /** Scripted NPC reviewers act on PRs (Sim §3.22.2). */
  npcAutoMerge: boolean;
  /** Orca's tutorial "Force health check" button allowed (Sim §6.3). */
  forceHealthCheckAllowed: boolean;
  /** Max `LabState.log` entries kept by housekeeping (500). */
  logCap: number;
}

/** NEW — monotonically increasing id counters (Sim §1.1, §1.15). Owner: whichever half creates the id. */
export interface SeqCounters {
  event: number;
  note: number;
  build: number;
  laz: number;
  ollama: number;
  chat: number;
  fault: number;
  run: number;
  commit: number;
  timer: number;
  /** Orca request ids (xy_touch / card actions). */
  request: number;
  /** Next PR number per repo. */
  pr: Record<RepoId, number>;
}

/**
 * NEW — the only way to "do X later" inside src/sim (Sim §3.1.2, §6.2). Handled by the system owning
 * the `kind` prefix (devops: jenkins. runner. local. git. npc. ollama.; everything else core).
 */
export interface SimTimer {
  /** "t<seq.timer>". */
  id: string;
  /** Which clock `atMs` is on. */
  clock: 'game' | 'phys';
  /** Due time on `clock` (ms). */
  atMs: number;
  /** e.g. "host.serviceReady", "npc.review" (Sim §3.1.2). */
  kind: string;
  payload: Record<string, string | number | boolean | null>;
}

export interface LabFlags {
  /** "Scan for receipt" QR feature: receipt screen gets a 5th option and buttons shift down 3.0 mm (Sim §3.10). Setting it is a lab-wide firmware rollout. */
  receiptQrFeature: boolean;
  /** UI Automator version used by uia-remote. 2.3 adds native dual-screen element tracking (displayId locators). */
  uiaVersion: '2.2' | '2.3';
  /** Gen 2 software PIN bypass (Core OS team) available. Always false in presets (Ref §6: in progress). */
  softwarePinBypass: boolean;
  /** Tutorial helper: show firmware button rects + Orca points on device screens. */
  showTouchTargets: boolean;
  /** NEW — Cur M16 tutorial "CFD layout v2" toggle: R2-D2 CFD gets v2 copy + 10 px label shift. */
  cfdLayoutV2Toggle: boolean;
}

export interface SimLogEntry {
  /** Game ms. */
  atMs: number;
  /** System that wrote it: "faults", "power", "orca", "jenkins", … */
  source: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  text: string;
}

/* ────────────────────────────── Orca (MySQL) ────────────────────────────── */

export type RobotStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'OFFLINE' | 'CONNECTION_FAILED' | 'RESERVED';

/** touch = physical XY gantry robot; tethered = MFD/CFD test bed; adb = ADB-only bot; standalone = PayCore-style dedicated rig. */
export type RigKind = 'touch' | 'tethered' | 'adb' | 'standalone';

/** Backend environment a rig's devices point at; checkout filter (Sim §3.4). `OrcaRobot.environment` holds one of these. */
export type RobotEnvironment = 'DEV1' | 'DEV2' | 'STG' | 'QA' | 'INT';

export interface RobotNote {
  id: number;
  /** Game ms (the request time for HEALTH notes). */
  atMs: number;
  author: string; // "orca-health-check" | "orca" | person key ("alex", "player")
  /** For health-check notes: the exact endpoint attempted. */
  endpoint?: string;
  /** The full display line, exact format Sim §3.3.4 (e.g. "2026-10-05 08:15:00 GET … → connect timed out after 10000 ms"). */
  text: string;
  resolved: boolean;
  /** NEW — note category (Sim §1.3.2). */
  kind: 'HEALTH' | 'STATUS' | 'CONFIG' | 'MANUAL';
  /** NEW — identical consecutive failures collapse into one line "(×N, last HH:MM:SS)"; 1 = single. */
  repeat: number;
  /** NEW — game ms of the latest repeat (= atMs when repeat == 1). */
  lastAtMs: number;
}

/** NEW — one status transition (cap 100 per robot). */
export interface RobotStatusHistoryEntry {
  /** Game ms. */
  atMs: number;
  from: RobotStatus;
  to: RobotStatus;
  /** Actor: person key, "orca-health-check" or "orca". */
  by: string;
  reason?: string;
}

/** NEW — result of the last health-check ping (Sim §3.3). */
export interface RobotHealthResult {
  /** Game ms of the request. */
  atMs: number;
  /** Exact URL attempted, e.g. "http://10.42.10.11:8000/health". */
  endpoint: string;
  /** HTTP status, or null for timeout / refused. */
  http: number | null;
  /** Error text written to Notes after "→ " (null on 200). */
  error: string | null;
  latencyMs: number;
}

/** The checkout record of a robot (a Jenkins build, a local run or a manual Orca checkout). */
export interface RobotCheckout {
  buildId: string;
  jobId: string;
  /** Checked out by exact Name (named job). */
  byName: boolean;
  /** Game ms. */
  startedMs: number;
  /** NEW — status at checkout; drives the named-job auto-reset (Sim §3.4.5). */
  statusAtCheckout: RobotStatus;
  /** NEW — who holds it. */
  kind: 'jenkins' | 'local';
}

export interface OrcaRobot {
  id: number;
  /** System identifier, lowercase-kebab, e.g. "wall-e". Exact value is what a Jenkins job must pass for UNAVAILABLE rigs. */
  name: string;
  /** Display string pushed to the physical status tablet, e.g. "WALL-E". */
  humanReadableName: string;
  status: RobotStatus;
  rigKind: RigKind;
  /** Environment label: one of RobotEnvironment ("DEV1", "DEV2", "STG", "QA", "INT"). */
  environment: string;
  /** FK → OrcaDevice ("Robot Device"). Decoupled so hardware swaps keep legacy config for rollback. */
  deviceId: number | null;
  /** USB tethered configuration. If `mfdDeviceId` is populated the pipeline treats the rig as tethered. */
  mfdDeviceId: number | null;
  cfdDeviceId: number | null;
  /** "http://10.42.10.11:8000/adb" — Orca derives the Pi (health endpoint) from its host. */
  adbServiceUrl: string;
  /** "http://<host>:8081/stream.mjpg" (dedicated or shared ×4), "" if none. */
  cameraStreamUrl: string;
  dipUrl: string | null;
  tapUrl: string | null;
  swipeUrl: string | null;
  /** Legacy mm offsets (deprecated since the lab was calibrated to a true 0,0). 0.0 at factory. */
  offsetXMm: number;
  offsetYMm: number;
  /** Linked RobotCapability rows (flags); derived keys come from device/rig (Sim §2.7.1). */
  capabilityIds: number[];
  /** Merchant this rig's device(s) SHOULD hold (Laz enforces it; the device says what it DOES hold). */
  merchantConfigId: number | null;
  /** Who reserved it (RESERVED only) — person key, e.g. "riley", "player". */
  reservedBy: string | null;
  /** Current checkout (a Jenkins build or a local run), if any. */
  checkout: RobotCheckout | null;
  /** Game ms of the last ping that updated this robot. */
  lastHealthCheckMs: number | null;
  lastHealthCheckOk: boolean | null;
  notes: RobotNote[];
  /** True if this rig is physically modelled in the 3D lab (12 of 42). */
  physical: boolean;
  /** Where it lives, e.g. "Rack A · U33–U36". */
  location: string;
  /** Free text shown on the tablet "Robot" tab. */
  description: string;
  /** NEW — status before the health check set CONNECTION_FAILED; restored on the first 200 (Sim §3.2.1). */
  preFailureStatus: 'AVAILABLE' | 'UNAVAILABLE' | null;
  /** NEW — game ms of the last status change. */
  statusChangedMs: number;
  /** NEW — status transitions, oldest first, cap 100. */
  statusHistory: RobotStatusHistoryEntry[];
  /** NEW — game ms the reservation started (RESERVED only). */
  reservedAtMs: number | null;
  /** NEW — game ms of the last release; LRU ordering for unnamed checkouts (Sim §3.4.2). */
  lastReleasedMs: number | null;
  /** NEW — last health-check ping result (not updated for RESERVED/OFFLINE robots). */
  lastHealth: RobotHealthResult | null;
}

export interface OrcaDevice {
  id: number;
  /** NEW — unique row name "<robot>-<model>", e.g. "johnny-5-flex1" (GP DSL compares names). */
  name: string;
  deviceType: DeviceTypeCode;
  serial: string;
  /** Network IP of the terminal (ADB over TCP on port 5444). */
  ip: string;
  /** Free-text label, e.g. "Flex 1 (JOHNNY-5) — keep for rollback". */
  label: string;
  /** Runtime device id in `LabState.devices`, bound by exact serial on save (Sim §1.15). */
  simDeviceId: string | null;
  retired: boolean;
}

/** Capability lookup style. 'BOTH' = Contact Canada scripts use both (NEW value). */
export type CapabilityLookup = 'DYNAMIC_JSON' | 'NON_DYNAMIC' | 'BOTH';

export interface RobotCapability {
  id: number;
  /** e.g. "DIP", "TAP", "SWIPE", "GO_SDK", "INTERAC", "PHONE", "OCR_CAMERA", "lab_dining", "CARD_MATRIX". */
  name: string;
  description: string;
  /** Which request style typically asks for it (informational; matching is identical). */
  lookup: CapabilityLookup;
  /** Example request fragment shown in the UI, e.g. '{"goSdk": true}'. */
  json: string | null;
  /** NEW — JSON key contributed to the capability document, e.g. "goSdk". */
  key: string;
  /** NEW — value contributed when linked (true). */
  value: boolean | string;
}

/** A robot's capability document: derived keys ∪ linked rows (Sim §1.3.4, §2.7). Canonical key order in the UI. */
export type CapabilityDocument = Record<string, string | boolean>;

export type MerchantRegion = 'US-EAST' | 'CA-CENTRAL';

export interface MerchantConfig {
  id: number;
  /** Unique, e.g. "GO-SDK-US-01". */
  name: string;
  merchantId: string; // MID
  environment: string; // "dev1", "dev2", "stg", "qa", "int"
  country: 'US' | 'CA';
  currency: 'USD' | 'CAD';
  /** Display form of the tax rate (8.25). `taxRateBp` is authoritative. */
  taxRatePct: number;
  tipsEnabled: boolean;
  /** Merchant config that bypasses PIN security (required for ADB-only bots). */
  pinBypass: boolean;
  cashDiscountEnabled: boolean;
  /** Owning team: "Automation" | "PayCore" | "SDK" | "Westers". */
  owner: string;
  /** Go SDK credentials (added by Tate) — hidden in the list table, visible only on Edit. */
  appId: string | null;
  appSecret: string | null;
  apiKey: string | null;
  /** Ubi platform route ("us-east" | "ca-central") — Edit dialog only. */
  ubiRoute: string | null;
  notes: string;
  /** NEW — printed on receipts ("LabSim Automation Lab — US 01"). */
  displayName: string;
  /** NEW — receipt header address line. */
  address: string;
  /** NEW — shown in the list table. */
  region: MerchantRegion;
  /** NEW — authoritative tax rate in basis points (825 = 8.25 %). */
  taxRateBp: number;
  /** NEW — tip buttons offered, e.g. [15, 18, 20, 22]. */
  tipPercents: number[];
  /** NEW — non-cash adjustment for cash-discount programs, basis points (400 = 4.00 %). */
  cardAdjustBp: number;
  /** NEW — merchant opted into "Scan for receipt" (Sim §3.10). */
  qrReceiptsEnabled: boolean;
  /** NEW — swipe signature required at/above this total (cents); null = never. */
  signatureThresholdCents: number | null;
  /** NEW — accepted card brands. */
  acceptedBrands: CardBrand[];
  /** NEW — extra launcher apps provisioned, e.g. ["LabSim Dining"]. */
  apps: string[];
}

export interface OrcaScreen {
  id: number;
  /** Orca screen name used by xy_touch, ALL CAPS snake: "RECEIPT_OPTIONS_5", "TENDER_CASH_DISCOUNT", "CFD_CART". */
  name: string;
  /** Derived from deviceType; informational. */
  testingProfile: TestingProfile;
  description: string;
  /** Number of receipt options for receipt screens (4 or 5), else null. */
  optionCount: number | null;
  /** NEW — rows are per Device Type (uniqueness `(deviceType, name)`). Authoritative key. */
  deviceType: DeviceTypeCode;
  /** NEW — 'secondary' only for STATION_DUO* "CFD_*" screens. */
  display: 'primary' | 'secondary';
}

export interface ScreenLocation {
  id: number;
  screenId: number;
  /** Exact, case-sensitive button string passed to xy_touch, e.g. "Print", "No Receipt", "Scan for receipt", "1". */
  button: string;
  /** Tap point (button centre) in mm from the screen's top-left. One decimal. */
  xMm: number;
  yMm: number;
}

export type CardBrand = 'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER' | 'INTERAC';
export type CardEntry = 'SWIPE' | 'DIP' | 'TAP';

export interface CardProfile {
  id: number;
  name: string; // "VISA_STD_DIP"
  brand: CardBrand;
  entry: CardEntry;
  /** SWIPE profiles: raw Track 1 + Track 2 text stored directly in MySQL. */
  trackData: string | null;
  /** DIP/TAP profiles: path to the card definition inside the Gort repo, e.g. "cards/emv/visa_std_dip.json". */
  gortPath: string | null;
  country: 'US' | 'CA';
  /** CVM is PIN (e.g. Interac in Canada). */
  requiresPin: boolean;
  owner: string; // "Automation" (single Visa) or "PayCore" (matrix)
  /** NEW — test PIN entered on the PIN pad ("1234"), null if none. */
  pin: string | null;
  /** NEW — full test PAN; UIs show it masked "•••• 1111". */
  pan: string;
  /** NEW — "YYMM", e.g. "3012". */
  expiry: string;
}

export interface ScreenCompareImage {
  id: number;
  name: string;
  /** Robot whose Camera Stream URL is captured. */
  robotId: number;
  /** CFD screen the check runs on, e.g. "CFD_CART". */
  screenName: string;
  /** Bounding box on the webcam frame (1280 × 720), pixels. */
  bbox: { x: number; y: number; w: number; h: number };
  /** Exact, case-sensitive expected text. */
  expectedText: string;
  /** Deprecated in favour of UI Automator 2.3 dual-screen support. */
  deprecated: boolean;
  /** NEW — test ids that reference it, e.g. ["uia-remote:DuoCfdSuite"]. */
  usedBy: string[];
}

/** NEW — one health-check run in Orca → Administration → Health log (Sim §3.3.4). Last 50 kept. */
export interface HealthLogRun {
  run: number;
  /** Game ms. */
  atMs: number;
  pinged: number;
  skipped: number;
  failed: number;
  recovered: number;
  /** Exact lines (header first), Sim §3.3.4. */
  lines: string[];
}

/** Health-check thread bookkeeping (Sim §1.3.1, §3.3). */
export interface OrcaHealthCheckState {
  /** 300 000 game ms. */
  intervalMs: number;
  /** Game ms of the last run (scheduled or forced). */
  lastRunMs: number;
  /** Game ms of the next aligned multiple of intervalMs. */
  nextRunMs: number;
  /** Always false outside the tick that runs it. */
  running: boolean;
  /** NEW — "run #N". */
  runCount: number;
  /** NEW — last 50 runs. */
  log: HealthLogRun[];
  /** NEW — per-ping timeout (10 000 ms). */
  timeoutMs: number;
}

/** Orca application state on orca-vm (Sim §3.14.5). */
export interface OrcaAppState {
  /** Spring Boot process running. */
  up: boolean;
  version: string;
  /** Sha of orchestrator main at deploy. */
  deployedCommit: string;
  /** NEW — JDBC pool connected to MySQL (false ⇒ every entity call 500). */
  dbConnected: boolean;
  /** NEW — phys ms when the pool reconnects after MySQL came back (15 s), else null. */
  reconnectAtPhysMs: number | null;
}

export interface OrcaAuditEntry {
  /** Game ms. */
  atMs: number;
  who: string;
  action: string;
  entity: string;
  entityId: number | string;
  /** NEW — changed fields: name → [before, after]. */
  diff?: Record<string, [unknown, unknown]>;
}

/** NEW — gort → Orca screen-location sync waiting to run (Sim §3.22.3). */
export interface PendingGortSync {
  /** Phys ms when Orca upserts the rows. */
  atPhysMs: number;
  repo: 'gort';
  paths: string[];
  commit: string;
}

export interface OrcaDb {
  robots: Record<number, OrcaRobot>;
  devices: Record<number, OrcaDevice>;
  capabilities: Record<number, RobotCapability>;
  merchants: Record<number, MerchantConfig>;
  screens: Record<number, OrcaScreen>;
  screenLocations: Record<number, ScreenLocation>;
  cardProfiles: Record<number, CardProfile>;
  screenCompareImages: Record<number, ScreenCompareImage>;
  /** Next auto-increment id per table. */
  seq: Record<
    | 'robots'
    | 'devices'
    | 'capabilities'
    | 'merchants'
    | 'screens'
    | 'screenLocations'
    | 'cardProfiles'
    | 'screenCompareImages'
    | 'notes',
    number
  >;
  /** Health-check thread bookkeeping. */
  healthCheck: OrcaHealthCheckState;
  /** Orca VM application state. */
  app: OrcaAppState;
  /** Audit trail shown in Administration → Audits. */
  audit: OrcaAuditEntry[];
  /** NEW — pending gort syncs (sim-devops pushes, sim-core processes). */
  pendingSyncs: PendingGortSync[];
}

/* ────────────────────────────── Physical rigs ────────────────────────────── */

export type BannerColor = 'green' | 'yellow' | 'red' | 'grey';
export type ActuatorState = 'retracted' | 'extending' | 'extended' | 'retracting';

export interface RigMotionCommand {
  kind:
    | 'moveTo'
    | 'park'
    | 'parkXY'
    | 'parkX'
    | 'parkY'
    | 'tap'
    | 'solenoidDown'
    | 'solenoidUp'
    | 'solenoidLower'
    | 'solenoidRaise'
    | 'dipIn'
    | 'dipOut'
    | 'tapIn'
    | 'tapOut'
    | 'phoneForward'
    | 'phoneBack'
    | 'pushPower'
    | 'stroke'
    | 'wait';
  xMm?: number;
  yMm?: number;
  /** NEW — `stroke` end point (solenoid down, move, up = a signature line). */
  toXMm?: number;
  toYMm?: number;
  /** For `wait`. */
  ms?: number;
  /** Correlates a command with an xy_touch request / card action / runner step. */
  ref?: string;
  /** NEW — who queued it ('controller' = the robot controller's own start-up homing). */
  source: 'tablet' | 'orca' | 'player' | 'controller';
}

/** NEW — parts `rig.reseat` can re-seat ('solenoid' ≡ 'solenoidConnector'). */
export type RigPart = 'solenoid' | 'solenoidConnector' | 'smartstripe' | 'webcam' | 'limitSwitchX' | 'limitSwitchY';

export interface RigState {
  /** Same as OrcaRobot.name, e.g. "wall-e". */
  id: string;
  orcaRobotId: number;
  kind: RigKind;
  /** Has a physical XY gantry with solenoid probe (touch + standalone). */
  hasGantry: boolean;
  gantry: {
    /** Carriage position in screen mm (0,0 = limit switches). */
    xMm: number;
    yMm: number;
    targetXMm: number;
    targetYMm: number;
    /** Travel limits (mm) — screen w/h + 10. */
    maxXMm: number;
    maxYMm: number;
    /** Move speed 120 mm/s. */
    speedMmS: number;
    moving: boolean;
    /** Homed against both limit switches since power-up / lock break / steppers re-enable. */
    homed: boolean;
    /** True while the carriage sits on the switch. */
    limitXHit: boolean;
    limitYHit: boolean;
    /** NEW — travel beyond the top/left screen edge: −10. */
    minXMm: number;
    minYMm: number;
    /** NEW — homing speed 60 mm/s. */
    homingSpeedMmS: number;
  };
  steppersEnabled: boolean;
  solenoid: {
    down: boolean;
    /** Kept for compatibility; always 0. */
    heightAdjustMm: number;
    /** Phys ms of the last tap. */
    lastTapMs: number | null;
    taps: number;
    /** NEW — Down/Up = fast (60 ms stroke); Lower/Raise = slow (400 ms). */
    mode: 'fast' | 'slow';
  };
  dipArm: ActuatorState;
  tapArm: ActuatorState;
  phonePusher: ActuatorState;
  magneticLock: { engaged: boolean; /** Game ms. */ brokenAtMs: number | null };
  banner: BannerColor;
  /** Global dashboard lockout while a test is active (TEST IN PROGRESS overlay). */
  dashboardLocked: boolean;
  /** Front POWER panel toggles. MAIN powers the controller side (Pi, tablet charger, webcam); MOTOR the 24 V drivers. */
  mainSwitch: boolean;
  motorSwitch: boolean;
  /** FIFO executed by the rigs system. */
  queue: RigMotionCommand[];
  /** Host ids. */
  piHostId: string | null;
  callusHostId: string | null;
  /** Collis probe (touch) or SmartStripe probe (tethered) id. */
  collisId: string | null;
  /** Runtime device ids sitting on this rig (1 for standalone, 2 for tethered MFD+CFD). */
  deviceIds: string[];
  webcam: {
    connected: boolean;
    /** Mirrors |aimOffsetDeg| ≤ 1.5° on both axes. */
    aimedOk: boolean;
    /** NEW — camera view id (Sim §2.11.1), e.g. "cam-wall-e", "cam-rackb". */
    cameraId: string | null;
    /** NEW — aim error in degrees (Sim §1.15). */
    aimOffsetDeg: { yaw: number; pitch: number };
  };
  /** Status tablet. */
  tablet: {
    tab: 'robot' | 'robot-control' | 'motion-control';
    /** Exact header status text, e.g. "Status: OK" (Sim §3.7.5). Same as `bannerText`. */
    statusText: string;
    brainbox: string; // "Brainbox v6"
    /** NEW — HRN currently displayed (updates ≤ 2 s after an Orca save while reachable). */
    hrnShown: string;
    /** NEW — tablet can reach its controller (USB link to the Pi). */
    reachable: boolean;
  };
  /** Physical placement in the 3D lab (prop id of the shelf), null if not physical. */
  shelfPropId: string | null;
  /** NEW — off-screen rig (not modelled in 3D; simplified hardware, no power graph). */
  offscreen: boolean;
  /** NEW — which display the gantry covers (R2-D2 family: 'secondary' = CFD); null for tethered/ADB. */
  probeDisplay: 'primary' | 'secondary' | null;
  /** NEW — false ⇒ homing that axis fails (fault rig.limitSwitchBroken). */
  limitSwitchOk: { x: boolean; y: boolean };
  /** NEW — solenoid connector on the carriage (INC15). */
  solenoidConnector: 'SEATED' | 'LOOSE';
  /** NEW — mirrors `dipArmToothOffset === 0` (INC16). */
  dipArmAligned: boolean;
  /** NEW — sector-gear tooth offset of the dip arm; 0 = aligned (Sim §1.15). */
  dipArmToothOffset: number;
  /** NEW — Push Power Button pulse (phys ms), null when idle. */
  phonePowerPress: { atMs: number } | null;
  /** NEW — phone on the carriage, e.g. "iPhone (Go SDK mobile runner)" on ASTRO. */
  phone: { mounted: string | null };
  /** NEW — hand-drag distance since the lock last engaged (≥ 20 mm ⇒ lock breaks). */
  pushAccumMm: number;
  /** NEW — enclosure door; the carriage can be dragged only when open. */
  door: 'closed' | 'open';
  /** NEW — exact header text (= tablet.statusText), Sim §3.7.5. */
  bannerText: string;
  /** NEW — "HOMING FAILED (X limit not found)", "GANTRY INCOMPLETE (rebuild in progress)", or null. */
  motionFault: string | null;
  /** NEW — what holds the dashboard lock. */
  lockedBy: { kind: 'jenkins' | 'local'; ref: string } | null;
  /** NEW — command in progress and when it ends (phys ms). */
  current: RigMotionCommand | null;
  currentEndsPhysMs: number | null;
  /** NEW — where the 25-pin motor PCB's USB is plugged: 'PI' or a host id ("nuc-03", INC19). */
  motionHost: 'PI' | string;
  /** NEW — 3D-printed cradle state; CRACKED tilts the device (INC59). */
  cradle: 'OK' | 'CRACKED' | 'NEW';
  /** NEW — 0, or 2.0 when cracked. */
  cradleTiltDeg: number;
  /** NEW — 'rebuild' while Jared rebuilds the gantry (forces motionFault, INC07). */
  assembly: 'complete' | 'rebuild';
}

/* ────────────────────────────── LabSim devices ────────────────────────────── */

/** Runtime screens (lowercase-kebab). Orca screen names ↔ runtime screens: Sim §2.10.1. */
export type ScreenName =
  | 'off'
  | 'boot'
  | 'lock'
  | 'home'
  | 'register'
  | 'review-order'
  | 'customer-idle'
  | 'customer-cart'
  | 'tender-select'
  | 'cash-discount-tender'
  | 'payment-prompt'
  | 'pin-entry'
  | 'tip'
  | 'tip-custom'
  | 'signature'
  | 'processing'
  | 'approved'
  | 'declined'
  | 'receipt-options'
  | 'receipt-sent'
  | 'receipt-done'
  | 'printing'
  | 'thank-you'
  | 'waiting-for-merchant'
  | 'waiting-for-customer'
  | 'oobe-welcome'
  | 'oobe-network'
  | 'oobe-merchant'
  | 'oobe-employee'
  | 'oobe-payments'
  | 'oobe-complete'
  | 'deprovisioning'
  | 'app-orders'
  | 'app-transactions'
  | 'app-setup'
  | 'app-dining'
  | 'app-sale'
  | 'app-authorizations'
  | 'app-customers'
  | 'app-inventory'
  | 'app-settings'
  | 'app-market'
  | 'error';

export interface DisplayState {
  screen: ScreenName;
  /** Screen-specific parameters (e.g. { item: "Tax Item 5" }). */
  params: Record<string, string | number | boolean>;
  /** Number of receipt options currently rendered (4 or 5) when on receipt-options. */
  receiptOptions?: 4 | 5;
  /** Incremented whenever the rendered content changes — renderers redraw textures when it changes. */
  rev: number;
  /** Screen brightness 0..1 (0 when off). */
  brightness: number;
  /** NEW — phys ms when a transient screen moves on (approved, printing…); null = hold. */
  autoAdvanceAtMs: number | null;
  /** NEW — phys ms when the current screen finished rendering (render race, Sim §3.19.5); null = not yet known. */
  renderDoneMs: number | null;
  /** NEW — phys ms when the current (re-)render started: a screen change, or the Register order pane
   *  redrawing when its first line is added (Review Order appears). A page object without a working
   *  `waitForScreen()` clicks 700 ms after this (Sim §3.19.5). Absent = unknown (treated as long ago). */
  renderStartMs?: number;
  /** NEW — toast overlay, `untilMs` in phys ms. */
  toast: { text: string; untilMs: number } | null;
  /** NEW — signature strokes drawn on the current signature screen. */
  strokes: number;
  /** NEW — digits entered on the PIN pad (masked dots). */
  pinDigits: number;
}

export interface OrderLine {
  name: string;
  priceCents: number;
  qty: number;
  taxable: boolean;
}

export interface OrderState {
  /** "ORD-<RIG>-<4-digit sequence per device>". */
  id: string;
  lines: OrderLine[];
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  status:
    | 'open'
    | 'review'
    | 'awaiting-tender'
    | 'awaiting-card'
    | 'awaiting-pin'
    | 'awaiting-tip'
    | 'awaiting-signature'
    | 'processing'
    | 'paid'
    | 'declined';
  cardProfileId: number | null;
  /** 'Print' | 'Email' | 'Text' | 'No Receipt' | 'Scan for receipt' | null. */
  receiptChoice: string | null;
  /** NEW — cash-discount non-cash adjustment when paying by card. */
  cardAdjustCents: number;
  /** NEW */
  tender: 'card' | 'cash' | null;
  /** NEW */
  entry: CardEntry | null;
  /** NEW */
  pinTries: number;
  /** NEW — "SIM042" (devices stream). */
  authCode: string | null;
  /** NEW — tip percentage chosen (for the receipt "Tip (18%)" line), null for none/custom. */
  tipPct: number | null;
}

export type DevicePower = 'off' | 'booting' | 'on' | 'fried';

export interface PowerHookup {
  /** Where the device/load is plugged: an AC power strip socket, a DC rail/terminal, USB on a host, or nothing. */
  kind: 'ac-strip' | 'dc-rail' | 'usb' | 'none';
  /** ac-strip id / dc rail or terminal id / host id (usb). */
  targetId: string | null;
  socket?: number;
}

/** NEW — structured receipt (Sim §1.15, §3.9.7). */
export interface ReceiptDoc {
  merchantName: string;
  address: string;
  /** Game ms when printed. */
  printedAtMs: number;
  orderId: string;
  lines: { name: string; qty: number; priceCents: number }[];
  subtotalCents: number;
  taxCents: number;
  taxRateBp: number;
  cardAdjustCents: number;
  cardAdjustBp: number;
  tipCents: number;
  tipPct: number | null;
  totalCents: number;
  currency: 'USD' | 'CAD';
  brand: CardBrand | null;
  panLast4: string | null;
  entry: CardEntry | null;
  authCode: string | null;
  approved: boolean;
  /** Printed from the 5-option flow (QR block). */
  qr: boolean;
}

export interface TerminalDevice {
  /** Runtime id, e.g. "dev-wall-e-flex3", spares "dev-spare-flex2". */
  id: string;
  type: DeviceTypeCode;
  serial: string;
  ip: string;
  /** Lab standard ADB port (5444) — kept for compatibility; `adbTcpPort` is what adbd listens on now. */
  adbPort: number;
  /** USB debugging on (true for every lab device). */
  adbEnabled: boolean;
  power: DevicePower;
  /** 0..1 over 30 s physical. */
  bootProgress: number;
  supply: PowerHookup;
  /** Rig this device sits on (RigState.id) or a desk/storage id ("desk-riley", "husky-drawer-2"). */
  rigId: string | null;
  role: 'standalone' | 'mfd' | 'cfd' | 'duo';
  /** For tethered setups: the paired device id and the link app. */
  tetheredTo: string | null;
  link: 'usb' | 'network' | null;
  payDisplayApp: 'USB_PAY_DISPLAY' | 'SECURE_NETWORK_PAY_DISPLAY' | null;
  /** Merchant currently provisioned (MerchantConfig.id) or null when de-provisioned. */
  merchantConfigId: number | null;
  provisioned: boolean;
  /** Device UI theme; lab devices 'avocado'. */
  theme: 'avocado' | 'legacy';
  /** Core Payments Application ('CPA'); 'SPA' only for legacy fixtures. */
  kernel: 'CPA' | 'SPA';
  passcode: string;
  /** Primary (MFD) display. */
  display: DisplayState;
  /** Secondary CFD display for Station Duo family. */
  secondaryDisplay: DisplayState | null;
  order: OrderState | null;
  /** Installed apps shown on the launcher. */
  apps: string[];
  /** Firmware version string — mirrors `firmwareInfo.version` (authoritative). */
  firmware: string;
  /** Collis probe card currently presented (dip inserted / tap held), for rendering. */
  cardPresent: CardEntry | null;
  /** Last printed receipt as 32-column text — mirrors `lastReceiptDoc` (authoritative). */
  lastReceipt: string | null;
  /** NEW — Orca Device row name bound by serial ("wall-e-flex3"); '' for an unregistered spare. */
  orcaDeviceName: string;
  /** NEW — derived view of power/dead (Sim §0.4), recomputed each tick. */
  state: 'OK' | 'BOOTING' | 'DEAD' | 'FRIED';
  /** NEW — port adbd listens on over TCP: 5444 lab, 5555 coworker devices, null after an OOBE wipe. */
  adbTcpPort: number | null;
  /** NEW — phys ms when the current boot started. */
  bootStartedPhysMs: number | null;
  /** NEW — hardware failure: never finishes boot (INC44). */
  dead: boolean;
  /** NEW — tethered MFD↔CFD link (Sim §3.8.6). */
  payDisplayLink: 'UP' | 'DOWN' | null;
  /** NEW — connectivity hub Ethernet seated. */
  hubEthernet: boolean;
  /** NEW — hub-to-hub USB seated (USB Pay Display). */
  hubUsbToPeer: boolean;
  /** NEW — lock screen shown. */
  locked: boolean;
  /** NEW — authoritative firmware (Sim §1.15). */
  firmwareInfo: { version: string; receiptQr: boolean };
  /** NEW — current launcher page and app order. */
  launcher: { page: number; apps: string[] };
  /** NEW — Duo CFD copy/layout version (INC37A, M16 toggle). */
  cfdLayout: 'v1' | 'v2';
  /** NEW — extra vertical shift of CFD labels in webcam px (INC36). */
  labelShiftPx: number;
  /** NEW — printer hardware. `lastPayloadMs` = phys ms of the last printed payload. */
  printer: { present: boolean; paper: boolean; lastPayloadMs: number | null };
  /** NEW — authoritative structured receipt. */
  lastReceiptDoc: ReceiptDoc | null;
  /** NEW — PIN pad active: injected (ADB) input ignored. */
  secureTouch: boolean;
  /** NEW — last 200 lines for `adb logcat -d`. */
  logcat: string[];
  /** NEW — handhelds only (FLEX_*, FLEX_POCKET); null otherwise. */
  battery: { pct: number; charging: boolean } | null;
  /** NEW (sim-core, optional) — phys ms of the last input (touch/key/text/stroke); drives the 10-minute idle lock (Sim §3.8.1). */
  lastInputPhysMs?: number;
  /** NEW (sim-core, optional) — per-device order sequence (`ORD-<RIG>-<4 digits>`, Sim §3.9.7). */
  orderSeq?: number;
  /** NEW (sim-core, optional) — device storage written by adb (`/sdcard/window_dump.xml`): path → contents. */
  sdcard?: Record<string, string>;
}

/* ────────────────────────────── Hosts & network ────────────────────────────── */

export type HostKind = 'pi' | 'nuc' | 'minix' | 'vm' | 'blade' | 'workstation' | 'coworker-device' | 'switch';
/** Derived from `os` ('crashed' = os HUNG), kept for compatibility. */
export type HostPower = 'off' | 'booting' | 'on' | 'crashed';
/** NEW — authoritative OS run state (Sim §1.6). */
export type HostOs = 'RUNNING' | 'HUNG' | 'BOOTING' | 'OFF';
/** NEW — Ethernet cable state. */
export type EthState = 'LINKED' | 'UNPLUGGED' | 'DAMAGED';

export interface ServiceState {
  /** robot-controller | adb-service | camera-stream | cardprog | sshd | callus | corporate-agent | motion | orca | mysql | jenkins | ollama. */
  name: string;
  running: boolean;
  port: number | null;
  /** Reason shown in systemctl/journal when not running ("exit-code"), null when stopped cleanly. */
  failure: string | null;
  /** Starts on boot. */
  enabled: boolean;
  /** NEW — phys ms when it became reachable, null when down. */
  startedPhysMs: number | null;
  /** NEW — delay after OS boot completes / after `start` until reachable (Sim §2.5.2). */
  startDelayMs: number;
  /**
   * NEW (sim-core, optional) — configuration the running process loaded at its last start
   * (robot-controller: the parsed `controller.yaml` keys `robot`/`robots`, `callus`, `motion`, `camera`).
   * The controller re-reads its file only on (re)start (Sim §2.5.3), so this — not `Host.files` — is what
   * `/health` evaluates. null/absent when not running.
   */
  loadedConfig?: Record<string, string> | null;
}

/** NEW — Windows Task Scheduler task (Sim §3.14.6). */
export interface SchedTask {
  name: 'GortCardSync';
  dailyAt: '10:00';
  /** Game ms of the last run start. */
  lastRunMs: number | null;
  lastResult: 0 | 1 | null;
  running: boolean;
  /** Phys ms when the running sync finishes. */
  runEndsPhysMs: number | null;
}

export interface Host {
  id: string; // "pi-wall-e", "minix-01", "nuc-03", "orca-vm", "gpu-blade", "ws-17"
  kind: HostKind;
  /** Shell prompt name: "wall-e", "MINIX-01", "orca". */
  hostname: string;
  ip: string;
  /** Authoritative OS run state (narrowed from `string`; the OS product name is `osName`). */
  os: HostOs;
  power: HostPower;
  bootProgress: number;
  /** Ethernet cable seated — derived: `eth !== 'UNPLUGGED'`. */
  ethernet: boolean;
  supply: PowerHookup;
  services: Record<string, ServiceState>;
  /** Derived from diskUsedGb / diskTotalGb. */
  diskUsedPct: number;
  diskTotalGb: number;
  cpuTempC: number;
  uptimeMs: number;
  /** For coworker devices: owner name; for Pis: robot id. */
  owner: string | null;
  /** Physical prop id in the 3D world, if modelled. */
  propId: string | null;
  /** NEW — product name, e.g. "Raspberry Pi OS (Debian 12, Linux 6.6.31-v8+ aarch64)", "Windows 10 IoT Enterprise". */
  osName: string;
  /** NEW — "orca.lab.local", … */
  aliases: string[];
  /** NEW — authoritative cable state. */
  eth: EthState;
  /** NEW — Pi saw < 4.63 V since boot (`vcgencmd get_throttled` ≠ 0x0). */
  underVoltage: boolean;
  /** NEW — phys ms when the current boot started. */
  bootStartedPhysMs: number | null;
  /** NEW — Pi 40 000 · Windows 50 000 · VM 45 000 · blade 90 000 (phys ms). */
  bootDurationMs: number;
  /** NEW — authoritative disk use. */
  diskUsedGb: number;
  /** NEW — the few files the sim reads (Sim §2.5.3). Size-only entries hold "<size:22.9G>"; dirs end with "/". */
  files: Record<string, string>;
  /** NEW — per-service log tail (journalctl / Event Viewer), cap 50 lines each. */
  journal: Record<string, string[]>;
  /** NEW — Windows scheduled tasks. */
  schedTasks: Record<string, SchedTask>;
  /** NEW — USB devices attached: "webcam", "motor-pcb:bumblebee", "adb:SIM-M3-000031", "smartstripe:megatron". */
  usb: string[];
  /** NEW — off-screen host (no power graph). */
  offscreen: boolean;
  /** NEW (sim-core, optional) — power present at the host's input during the last sub-step (edge detection: boxes auto-boot only when power returns). */
  hasPower?: boolean;
}

/** NEW — lab network (Sim §1.9). */
export interface NetworkState {
  subnets: { cidr: string; name: string }[];
  /** Lab core switch. */
  switchUp: boolean;
  /** ip → host/device id, derived each tick (for `ping`, `arp -a`). */
  arp: Record<string, string>;
  /** Connection attempt counter per host id (DAMAGED cables drop every other attempt). */
  attempts: Record<string, number>;
}

export interface AdbConnection {
  /** "10.42.30.11:5444" */
  target: string;
  hostId: string | null;
  deviceId: string | null;
  state: 'device' | 'offline' | 'unauthorized';
  /** NEW — a coworker desk device (10.42.60.*). */
  coworker: boolean;
}

export interface WorkstationState {
  /** adb server on the engineer workstation. */
  adbServerRunning: boolean;
  /** In connection order (the 5555 fallback uses [0], Sim §3.15.3). */
  adbConnections: AdbConnection[];
  /** Active ssh session host id for the terminal, if any. */
  sshHostId: string | null;
  cwd: string;
  shellHistory: string[];
  /** Local IntelliJ run in progress (robotId null when the config names no Orca robot). */
  locallyRunningTest: { robotId: number | null; testName: string; startedMs: number } | null;
  /** Coworker devices accidentally controlled (port 5555 incident) — count for missions. */
  coworkerDevicesDisturbed: number;
  /** NEW — parsed view of the local clone's uia-remote/config.properties (the file is the source of truth). */
  configProperties: Record<string, string>;
  /** NEW — ~/Downloads, ~/Pictures, ~/CodeWithMe: path → content or image ref ("img:screencap:dev-eve:<physMs>"). */
  files: Record<string, string>;
}

/* ────────────────────────────── Power ────────────────────────────── */

export interface PowerOutlet {
  id: string; // "WALL-1"
  voltage: 120;
  live: boolean;
  /** What is plugged in: strip id, PSU id, load id, or null. */
  plugged: string | null;
  propId: string | null;
}

export interface AcStrip {
  id: string; // "STRIP-A"
  label: string;
  outletId: string | null;
  switchOn: boolean;
  /** 6. */
  sockets: number;
  /** Load ids by socket index (0-based; socket n = index n−1). */
  loads: (string | null)[];
  propId: string | null;
  /** NEW — 15 A breaker tripped (manual reset, `power.resetBreaker`). */
  breakerTripped: boolean;
}

export interface PowerSupplyUnit {
  id: string; // "MW-1"
  model: string; // "Mean Well LRS-600-24"
  outletId: string | null;
  outputVoltage: 24;
  maxAmps: number;
  on: boolean;
  propId: string | null;
  /** NEW — "MEAN WELL · INPUT 120VAC · OUTPUT 24VDC". */
  label: string;
  /** NEW — phys ms until the overload hiccup ends (output 0 V), null if none. */
  hiccupUntilPhysMs: number | null;
}

/** NEW — DC step-down regulator (Sim §1.8). */
export interface Regulator {
  id: string; // "REG-5V-A"
  inRail: 'rail-24v';
  outRail: string;
  nominalV: 12 | 5;
  maxA: number;
  inputSwitch: boolean;
  label: string;
  propId: string | null;
}

export interface DcRail {
  id: string; // "rail-24v", "rail-12v", "rail-5v-a", "rail-5v-b", "rail-5v-bench"
  nominalVoltage: 24 | 12 | 5;
  /** Upstream: PSU id (24V) or regulator id. */
  source: string;
  /** Inline fuse protecting this rail (12V/5V branches), if any. */
  fuseId: string | null;
  maxAmps: number;
  /** Computed each tick. */
  voltage: number;
  currentA: number;
  propId: string | null;
}

/** NEW — pluggable DC point (rig MAIN/MOTOR feeds, spare taps). */
export interface DcTerminal {
  id: string; // "MAIN-wall-e", "MOTOR-wall-e", "T-24V-SPARE"
  railId: string;
  label: string;
  via: 'fuse-bus' | 'rig-main' | 'rig-motor' | 'spare';
  rigId?: string;
  /** Load id plugged in, or null. */
  plugged: string | null;
  propId: string | null;
  /** Computed each tick. */
  energised: boolean;
}

export interface Fuse {
  id: string; // "F-RACKB-5V"
  railId: string;
  /** Rating of the blade fuse currently fitted. */
  ratingA: number;
  blown: boolean;
  propId: string | null;
  /** NEW — holder label rating in A ("10A" → 10). Always written by sim-core in v2 state; optional only so fixtures built before v2 still compile (read as `labelA ?? ratingA`). */
  labelA?: number;
  /** NEW — holder empty (read as `removed ?? false`). */
  removed?: boolean;
  /** NEW — I²t-style stress accumulator; blows at ≥ 5.0 (Sim §3.13.1). Read as `stress ?? 0`. */
  stress?: number;
}

/** A powered load (Pi, NUC, stepper driver, tablet, LabSim device brick, Collis probe…). */
export interface PowerLoad {
  id: string;
  label: string;
  /** What the load expects. AC-BRICK-18V = LabSim device or Collis probe via its own brick. */
  expects: '5V' | '12V' | '24V' | 'AC-BRICK-18V' | 'AC';
  /** Nominal current at its expected voltage (state-dependent, Sim §3.13.3). */
  drawA: number;
  /** Authoritative hookup for modelled loads (Sim §1.15 mirror rule). */
  supply: PowerHookup;
  powered: boolean;
  damaged: boolean;
  /** NEW — back-references. */
  hostId?: string;
  deviceId?: string;
  collisId?: string;
  rigId?: string;
  /** NEW (sim-core, optional) — supply voltage seen in the last solve (V; 120 for AC). */
  volts?: number;
  /** NEW (sim-core, optional) — phys ms since the supply has been below 4.63 V (Pi under-voltage, Sim §3.13.1 #8). */
  lowSincePhysMs?: number | null;
}

/** NEW — a spark (VFX/audio), last 10 kept. */
export interface PowerSpark {
  atPhysMs: number;
  /** Point id where it happened. */
  at: string;
  cause: string;
}

export interface PowerState {
  outlets: Record<string, PowerOutlet>;
  strips: Record<string, AcStrip>;
  psus: Record<string, PowerSupplyUnit>;
  rails: Record<string, DcRail>;
  fuses: Record<string, Fuse>;
  loads: Record<string, PowerLoad>;
  /** Spare blade fuses on the bench by rating ("5" | "10" | "15" | "20"). */
  spareFuses: Record<string, number>;
  /** NEW — DC step-down regulators. */
  regulators: Record<string, Regulator>;
  /** NEW — pluggable DC points. */
  terminals: Record<string, DcTerminal>;
  /** NEW — last 10 sparks. */
  sparks: PowerSpark[];
}

/* ────────────────────────────── Collis probes / Callus ────────────────────────────── */

export interface CollisProbe {
  id: string; // "collis-wall-e" | "smartstripe-megatron"
  rigId: string;
  /** Callus host (Windows NUC / Minix) driving this probe. */
  callusHostId: string;
  /** Collis: rear ribbon to the card reader. SmartStripe: USB plugged into the shelf Pi. */
  ribbonConnected: boolean;
  supply: PowerHookup;
  powered: boolean;
  damaged: boolean;
  /** Card currently loaded by Callus (CardProfile.id). */
  loadedProfileId: number | null;
  /** Last action presented to the device (atMs = game ms). */
  lastAction: { entry: CardEntry; atMs: number; ok: boolean; error: string | null } | null;
  /** NEW — Collis probe or SmartStripe USB probe. */
  kind: 'collis' | 'smartstripe';
  /** NEW */
  state: 'OK' | 'FRIED';
  /** NEW — derived: off (no power) / amber (no ribbon link) / green. */
  ledColor: 'green' | 'amber' | 'off';
  /** NEW — pre-loaded swipe waiting for the payment prompt (Sim §3.6 #9); `expiresPhysMs` = arm timeout. */
  armed: { profileId: number; entry: CardEntry; deviceId: string; fireOnScreen: ScreenName; expiresPhysMs: number } | null;
}

export interface CallusState {
  /** Local Gort clone per Windows box (GortCardSync). Keyed by host id. syncedAtMs = game ms. */
  localCardFiles: Record<string, { syncedCommit: string; syncedAtMs: number; files: string[] }>;
  /** NEW — per box, Callus service log tail (cap 50). */
  log: Record<string, string[]>;
}

/* ────────────────────────────── Git / GitHub ────────────────────────────── */

export type RepoId = 'gort' | 'uia-remote' | 'pigeon' | 'orchestrator';

export interface GitCommit {
  /** 40 hex (FNV-1a based, Sim §3.22.1); UIs show the first 7. */
  sha: string;
  message: string;
  author: string;
  /** Game ms. */
  atMs: number;
  /** Files changed: path → new contents (null = deleted). */
  changes: Record<string, string | null>;
  parent: string | null;
}

/** NEW — PR comment (line comment when path/line set). */
export interface PrComment {
  id: number;
  author: string;
  path: string | null;
  line: number | null;
  body: string;
  /** Review reason id: main-edit | missing-isScreenPresent | missing-waitForScreen | port-5555 | extends-BaseTest. */
  reason?: string;
  /** Game ms. */
  atMs: number;
}

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  body: string;
  sourceBranch: string;
  targetBranch: string;
  state: 'open' | 'merged' | 'closed';
  /** Changed files with before/after for the diff view. */
  files: { path: string; before: string | null; after: string | null }[];
  reviewers: string[];
  approvals: string[];
  checks: 'pending' | 'success' | 'failure';
  /** Game ms. */
  createdMs: number;
  mergedMs: number | null;
  /** Who pressed Merge (`player` or an NPC key); absent on older snapshots → the PR author. */
  mergedBy?: string | null;
  /** NEW */
  comments: PrComment[];
  /** NEW */
  verdict: 'NONE' | 'APPROVED' | 'CHANGES_REQUESTED';
  /** NEW — phys ms when the scripted reviewer acts (Sim §3.22.2), null if none pending. */
  reviewDuePhysMs: number | null;
  /** NEW — head commit of the source branch. */
  headSha: string;
}

export interface GitRepo {
  id: RepoId;
  name: string;
  /** "git@github.com:labsim-lab/gort.git" */
  remoteUrl: string;
  description: string;
  defaultBranch: string;
  /** Remote (GitHub) branches: name → head sha. */
  branches: Record<string, string>;
  commits: Record<string, GitCommit>;
  /** Remote file tree at the head of the default branch: path → contents. */
  files: Record<string, string>;
  pullRequests: PullRequest[];
  /** Workstation clone (IntelliJ / terminal). null = not cloned yet. */
  local: null | {
    path: string; // "~/IdeaProjects/uia-remote"
    branch: string;
    headSha: string;
    /** Working tree: path → contents (includes git-ignored files such as config.properties). */
    files: Record<string, string>;
    /** Paths modified vs HEAD. */
    dirty: string[];
    staged: string[];
    /** Local commits not yet pushed. */
    ahead: number;
    behind: number;
  };
}

/* ────────────────────────────── Jenkins & runners ────────────────────────────── */

export type BuildResult = 'SUCCESS' | 'FAILURE' | 'UNSTABLE' | 'ABORTED';

/** NEW — machine failure codes (Sim §3.18.6) used by missions. `JenkinsBuild.failureCode` holds one of these. */
export const FAILURE_CODES = [
  'SCM',
  'SCRIPT',
  'JSON_PARSE',
  'ENUM_CASE',
  'CAPABILITY_CONFLICT',
  'UNKNOWN_CAPABILITY',
  'NO_MATCH',
  'ONLY_UNAVAILABLE',
  'ROBOT_NOT_FOUND',
  'ROBOT_BLOCKED',
  'CAPABILITY_MISMATCH',
  'PIN_NEEDS_PHYSICAL',
  'ORCA_DOWN',
  'ORCA_DB_DOWN',
  'LAZ_FAILED',
  'UBI_ROUTE',
  'MERCHANT_MISMATCH',
  'CONFIG_INVALID',
  'ADB_CONNECT',
  'DEVICE_UNREACHABLE',
  'TETHER_REQUIRED',
  'PAY_DISPLAY_LINK',
  'UI_NOT_FOUND',
  'WAIT_TIMEOUT',
  'ASSERTION',
  'XY_TOUCH_ERROR',
  'CARD_ERROR',
  'PRINTER_TIMEOUT',
  'PRINTER_NOT_AVAILABLE',
  'OCR_MISMATCH',
  'OCR_CAPTURE',
  'EVIDENCE_CAPTURE',
  'MISSING_CREDENTIAL',
  'OLLAMA_DOWN',
  'VISION_FAIL',
  'LSTR_UNKNOWN_ACTION',
  'LSTR_PLATFORM',
  'JENKINS_RESTART',
  'ABORTED',
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

export interface JobParam {
  name: string; // ROBOT_NAME, DEVICE_TYPE, MERCHANT, CARD_PROFILE, BACKEND_ENV, BRANCH
  type: 'string' | 'choice' | 'boolean';
  default: string;
  choices?: string[];
  description: string;
}

/** Runner implementation of a job / local run. ('gort-sync' kept for compatibility; unused in v2.) */
export type RunnerKind = 'uia-remote' | 'pigeon' | 'go-sdk' | 'laz' | 'vision' | 'ios' | 'gort-sync';

/** NEW — one compiled runner step (Sim §3.19–§3.21). */
export interface RunnerStep {
  id: string;
  label: string;
  role: 'MFD' | 'CFD' | 'DEVICE' | 'ORCA' | 'SETUP';
  op: string;
  args: Record<string, string | number | boolean>;
}

/** NEW — runner program state, shared by Jenkins builds and local runs (sim-devops). */
export interface RunnerState {
  kind: RunnerKind;
  /** Compiled plan. */
  steps: RunnerStep[];
  /** Program counter into `steps`. */
  pc: number;
  /** Pigeon stored outputs, env, runner variables (RECEIPT_SCREEN). */
  vars: Record<string, string>;
  focus: 'MFD' | 'CFD' | 'DEVICE' | null;
  /** "ip:port" actually connected (may be a coworker device!). */
  handles: { mfd: string | null; cfd: string | null };
  /** What it waits for; `untilPhysMs` = timeout (phys ms). */
  waitingFor: null | { what: string; untilPhysMs: number; timeoutLabel: string };
  passedSteps: number;
  totalSteps: number;
}

export interface JenkinsJob {
  /** Full path id, e.g. "Java/uia-remote-regression-flex". */
  id: string;
  /** Legacy platform split: "Java" | "iOS" (every job lives in exactly one). */
  folder: string;
  name: string;
  description: string;
  runner: RunnerKind;
  platform: 'java' | 'ios' | 'android' | 'windows' | 'rest' | 'go';
  /** Parameter definitions. */
  params: JobParam[];
  /** Capability lookup style (display). */
  capabilityLookup: CapabilityLookup;
  /** Derived from the script (display only). */
  requiredCapabilities: string[];
  /** Test definition: repo + path (pigeon JSON, uia-remote test class, gort go-sdk JSON). */
  testRef: { repo: RepoId; path: string } | null;
  /** Schedule label (e.g. "H 2 * * *"), game-clock driven. */
  schedule: string | null;
  scheduleEveryMs: number | null;
  /** Game ms. */
  nextScheduledMs: number | null;
  buildIds: string[];
  disabled: boolean;
  /** NEW — views listing this job (derived from JenkinsState.views). */
  views: string[];
  /** NEW — Jenkinsfile text (editable via Configure; parsed per Sim §3.18.2). */
  script: string;
  /** NEW — values used by plain "Build"; "Build with Parameters" overrides. */
  savedParams: Record<string, string>;
  /** NEW — false after delete/move (kept for history). */
  exists: boolean;
  /** NEW — Merchant stage behaviour (Sim §3.17.1). */
  merchantPolicy: 'swap' | 'assert' | 'none';
}

export interface BuildStage {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  /** Game ms. */
  startedMs: number | null;
  /** Physical duration (ms). */
  durationMs: number | null;
}

export interface JenkinsBuild {
  /** "<jobId>#<number>" */
  id: string;
  jobId: string;
  number: number;
  params: Record<string, string>;
  /** Environment variables injected into the runner (keys and enum values ALL CAPS). */
  env: Record<string, string>;
  state: 'queued' | 'running' | 'finished';
  result: BuildResult | null;
  /** Game ms. */
  queuedMs: number;
  startedMs: number | null;
  finishedMs: number | null;
  stages: BuildStage[];
  /** Cap 400 lines (middle elided "… N lines skipped …"). */
  console: string[];
  /** Robot checked out from Orca for this build. */
  robotId: number | null;
  /** One of FAILURE_CODES (Sim §3.18.6) or null. */
  failureCode: string | null;
  triggeredBy: string;
  /** Runner program counter (sim-internal; mirrors runner.pc). */
  cursor: number;
  /** Phys ms. */
  waitUntilMs: number | null;
  /** NEW — what the console prints for env (secrets "****"). */
  envMasked: Record<string, string>;
  /** NEW — runner program state. */
  runner: RunnerState;
  /** NEW — always false for Jenkins builds (local runs live in LocalRunState). */
  local?: false;
}

export interface JenkinsState {
  up: boolean;
  url: string;
  /** Key = full path "Java/uia-remote-regression-flex". */
  jobs: Record<string, JenkinsJob>;
  /** Key = "<jobPath>#<n>"; cap 20 per job. */
  builds: Record<string, JenkinsBuild>;
  /** Build ids waiting for an executor. */
  queue: string[];
  /** 8. */
  executors: number;
  /** NEW — view name → { name, include regex over job paths }. */
  views: Record<string, { name: string; include: string }>;
  /** NEW — next build number per job. */
  nextBuildNumber: Record<string, number>;
}

/** NEW — an IntelliJ ▶ run on the workstation (sim-devops). */
export interface LocalRun {
  /** "run-<seq.run>". */
  id: string;
  repo: 'uia-remote' | 'pigeon';
  testName: string;
  testPath: string;
  robotName: string | null;
  /** Game ms. */
  startedMs: number;
  finishedMs: number | null;
  state: 'running' | 'finished';
  passed: boolean | null;
  failureCode: string | null;
  output: string[];
  runner: RunnerState;
  /** A Jenkins build drove the same rig during this run (INC31). */
  overlappedJenkins: boolean;
  /** config.properties file used (local clone or a Code With Me path). */
  configPath: string;
}

/** NEW */
export interface LocalRunState {
  runs: Record<string, LocalRun>;
}

/* ────────────────────────────── Laz / Ubi / Ollama / printers / chat ────────────────────────────── */

export type LazStep =
  | 'queued'
  | 'ubi-route'
  | 'deprovision'
  | 'wipe-cache'
  | 'setup-wizard'
  | 'assign-merchant'
  | 'restore-adb'
  | 'verify'
  | 'done'
  | 'failed';

export interface LazRun {
  id: string;
  deviceId: string;
  fromMerchantId: number | null;
  toMerchantId: number;
  step: LazStep;
  progress: number;
  /** Game ms. */
  startedMs: number;
  log: string[];
  error: string | null;
  /** NEW — setup wizard page 0..6. */
  wizardPage: number;
  /** NEW — phys ms when the current step ends. */
  stepEndsPhysMs: number | null;
  /** NEW — owning Jenkins build, if any. */
  buildId: string | null;
  /** NEW — fault laz.skipAdbRestore (INC28). */
  skipAdbRestore: boolean;
}

/** NEW — Ubi routing (Sim §1.13, §3.17.3). */
export interface UbiState {
  /** "us-east", "ca-central". */
  routes: Record<string, { region: MerchantRegion; up: boolean }>;
  log: string[];
}

export interface OllamaRequest {
  id: string;
  model: string;
  prompt: string;
  /** Image reference, e.g. "img:receipt:wall-e:0912", "img:webcam:cam-wall-e:<physMs>". */
  image: string | null;
  response: string | null;
  /** Ground truth: does the verdict agree with the printed receipt's real maths? */
  correct: boolean | null;
  state: 'running' | 'done';
  /** Game ms. */
  startedMs: number;
  /** NEW — phys ms when inference completes. */
  donePhysMs: number;
  /** NEW */
  verdict: 'PASS' | 'FAIL' | null;
}

/** NEW — receipt image ground truth for Ollama (Sim §3.21.2). */
export interface ReceiptScenario {
  imageRef: string;
  deviceId: string;
  subtotalCents: number;
  taxCents: number;
  tipPct: number;
  /** Tip actually printed (may be wrong = a real bug). */
  printedTipCents: number;
  /** What the model misreads, if anything. */
  misread: { field: 'tip' | 'total'; shownAs: string } | null;
}

/** Ollama on ollama-vm (sim-devops). */
export interface OllamaState {
  /** Mirror of ollama-vm service "ollama". */
  up: boolean;
  models: string[];
  /** Cap 30. */
  requests: OllamaRequest[];
  /** NEW — keyed by image ref. */
  receiptScenarios: Record<string, ReceiptScenario>;
}

/** NEW — Prusa / Bambu Lab printers (INC59). */
export interface Printer3dState {
  printers: Record<'prusa' | 'bambu', { busy: boolean; job: string | null; endsPhysMs: number | null }>;
  /** Printed parts waiting on the tray, e.g. "cradle_flex_gen3". */
  output: string[];
}

export interface ChatMessage {
  id: string;
  channel: string; // "#lab-automation", "#orca-alerts", "#jenkins", "dm:jared"
  author: string;
  text: string;
  /** Game ms. */
  atMs: number;
  /** Optional link to a ticket/incident for Arcade. */
  ticketId?: string;
}

/* ────────────────────────────── Faults ────────────────────────────── */

/** A fault / setup-op parameter value (lists for e.g. `deviceTypes`). */
export type FaultParamValue = string | number | boolean | string[];

/** NEW — one written leaf, recorded at injection (Sim §4.1.3 #5). */
export interface FaultUndoPatch {
  /** JSON path from the LabState root, e.g. ["hosts", "pi-wall-e", "os"]. */
  path: (string | number)[];
  /** Value before (null = the record was created). */
  before: unknown;
  /** Value written (null = the record was deleted). */
  after: unknown;
}

export interface ActiveFault {
  /** Instance id "f<seq.fault>". */
  id: string;
  /** Fault type id from the catalogue (Sim §4.3). */
  faultId: string;
  params: Record<string, FaultParamValue>;
  /** Game ms. */
  injectedMs: number;
  cleared: boolean;
  /** Game ms. */
  clearedMs: number | null;
  /** NEW — target component id (value of the target param) or "lab". */
  target: string;
  /** NEW */
  clearedBy: 'condition' | 'api' | null;
  /** NEW — actor that called faults.clear. */
  clearedByActor: string | null;
  /** NEW — revert data. */
  undo: FaultUndoPatch[];
  /** NEW — phys ms since the clear predicate has held (Sim §4.1.7). */
  holdSincePhysMs: number | null;
}

/* ────────────────────────────── Captured images ────────────────────────────── */

/**
 * NEW (sim-core) — a frozen image (adb screencap, Camera-app snapshot, receipt photo): the frame model
 * captured at that instant so OCR/GIMP read what was on screen then (Sim §3.12.1 #4, §3.15.1).
 * Keyed by image ref (`img:screencap:<deviceId>:<physMs>`, `img:webcam:<cameraId>:<physMs>`); last 50 kept.
 */
export interface CapturedFrame {
  imageRef: string;
  source: 'webcam' | 'screencap' | 'receipt';
  widthPx: number;
  heightPx: number;
  labels: { text: string; x: number; y: number; w: number; h: number; deviceId: string | null; display: 'primary' | 'secondary' | null }[];
  /** Phys ms of capture. */
  capturedPhysMs: number;
  cameraId: string | null;
  deviceId: string | null;
}

/* ────────────────────────────── Root ────────────────────────────── */

export interface LabState {
  /** LAB_STATE_VERSION (2). */
  version: number;
  time: TimeState;
  /** Core RNG stream (the one TxContext.random() draws from). */
  rng: RngState;
  flags: LabFlags;
  orca: OrcaDb;
  /** Key = robot Name; all 42 rigs (off-screen ones have `offscreen: true`). */
  rigs: Record<string, RigState>;
  /** Key = runtime id "dev-<orca device name>" (spares "dev-spare-<model>"). */
  devices: Record<string, TerminalDevice>;
  /** Pis, Windows boxes, VMs, blade, workstation, coworker devices, switch. */
  hosts: Record<string, Host>;
  workstation: WorkstationState;
  power: PowerState;
  /** Collis probes and SmartStripe probes. */
  collis: Record<string, CollisProbe>;
  callus: CallusState;
  /** sim-devops. */
  repos: Record<RepoId, GitRepo>;
  /** sim-devops. */
  jenkins: JenkinsState;
  laz: { runs: Record<string, LazRun> };
  /** sim-devops. */
  ollama: OllamaState;
  chat: { messages: ChatMessage[]; unread: Record<string, number> };
  faults: ActiveFault[];
  log: SimLogEntry[];
  /** NEW — independent seeded streams (Sim §6.1); `core` mirrors `rng`. */
  rngStreams: Record<RngStream, RngState>;
  /** NEW — mode switches. */
  config: SimConfig;
  /** NEW — lab network. */
  network: NetworkState;
  /** NEW — IntelliJ runs (sim-devops). */
  local: LocalRunState;
  /** NEW — Ubi routes. */
  ubi: UbiState;
  /** NEW — 3D printers. */
  printer3d: Printer3dState;
  /** NEW — scheduled callbacks. */
  timers: SimTimer[];
  /** NEW — id counters. */
  seq: SeqCounters;
  /** NEW (sim-core, optional) — frozen frames behind image refs (screencaps, snapshots); cap 50. */
  captures?: Record<string, CapturedFrame>;
}
