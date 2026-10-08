# LabSim — Simulation Model (pure logic, no rendering)

> **Doc:** `docs/design/40-simulation.md` · **Depends on:** `00-canon.md` (wins every conflict),
> `docs/reference/REMOVED-internal-reference.md` (domain truth, cited **Ref §n**),
> `docs/design/10-curriculum.md` (cited **Cur §n / Mnn / Snn**), `docs/design/20-gameplay.md`
> (cited **GP §n / INCnn / SRnn / GWnn**).
> **Contract files:** `src/sim/types.ts` (state), `src/sim/events.ts` (events), `src/sim/api.ts` (`SimApi`).
> They already point at this document. Where this doc adds a field, an event or a method, the
> implementer adds it to the contract file (add, never rename — §0.4 lists every delta).
> **This doc owns:** the serialisable lab state, seed data (the 42-rig pool, devices, hosts, power,
> merchants, cards, screens, repos, Jenkins), every behaviour/state machine and its exact rules and
> strings, the fault-injection catalogue, the domain event list, determinism, time and save/load.
> **It does not own:** 3D, 2D rendering, app UIs (they read this state), lesson scripts, scoring,
> incidents' scoring/tickets (GP), quiz content (Cur).

The simulation is what makes LabSim "just like real life". Its job is simple to state: **every
observable symptom in the game must be produced by state, and every state must be produced by a
cause a real engineer could find and fix.** There is no "incident flag" that makes a build red;
a build is red because a fuse is open, a Pi is hung, a coordinate is 3 mm off, a JSON file is
missing a comma. Faults (§4) only *mutate state into a broken condition*; the systems in §3 do the
rest, exactly as the real lab would.

---

## 0. Conventions

### 0.1 Markers and citations

| Marker | Meaning |
|---|---|
| **[illus.]** | Invented because the reference is silent (an IP, a REST path, a log line, a dimension, a timing). Never contradicts the reference. Same rule as Cur's **†** and GP's [illus.]: the Field Manual shows the "Illustrative (sim only)" badge. Values already fixed by Cur §0.3–§0.6 or GP §3.1–§3.2 are reused verbatim and not re-marked. |
| **[sim]** | A deliberate simplification of real physics/software for determinism or play. Each one is listed in Appendix B ("How the sim differs") so the Field Manual can disclose it. |
| `MUST` / `SHOULD` | Normative for the implementer. |
| `NEW` | A field/type/event/method that is not yet in the contract files; add it. |

### 0.2 Units, ids and naming

| Thing | Rule |
|---|---|
| Screen / robot coordinates | **millimetres** from the device screen's top-left (0,0) as calibrated by the limit switches (canon). X right, Y down. One decimal place in Orca (`22.0`). |
| Screenshot / webcam coordinates | **pixels** (integers) of the ADB screencap (device px) or webcam frame (1280×720). |
| Money | integer **cents** (`totalCents`), currency per merchant (`USD`/`CAD`). Rates in **basis points** (8.25 % = `825`). |
| Durations | integer ms. `…Ms` suffix. Which clock a duration runs on is stated (§0.3). |
| Orca table ids | numbers (MySQL auto-increment), stable in seed. |
| Runtime ids | kebab strings: rigs `wall-e`, devices `dev-wall-e` (sim) / `wall-e-flex3` (Orca device row *name*), hosts `pi-wall-e`, `minix-01`, `orca-vm`, faults `pi.hung`. |
| Robot names | system Name lowercase-kebab (`johnny-5`), Human Readable Name caps (`JOHNNY-5`) — canon. |
| Orca screen names | ALL CAPS snake (`RECEIPT_OPTIONS_5`, `TENDER_CASH_DISCOUNT`) — Cur S10. Runtime display screens (what a device is showing) are lowercase-kebab (`receipt-options`) — mapping in §2.10.1. |
| Enum strings | exactly as canon (`FLEX_3`, `CONNECTION_FAILED`). Orca's UI shows statuses title-cased (`Connection Failed`). |
| Timestamps in text | `YYYY-MM-DD HH:MM:SS` local game time (`2026-10-05 08:15:00`), from `time.nowMs` (§0.3). |

### 0.3 The two clocks

The sim keeps **two clocks**, both inside `LabState.time` and both advanced only by `sim.tick()`:

| Clock | Field | Advances by | Used for |
|---|---|---|---|
| **Game clock** | `time.nowMs` — ms since game-midnight of `time.epochDate` (`2026-10-05`, a Monday). 08:00 = `28_800_000`. Negative values = the previous day. | `dtGameMs` (the loop passes `SIM_STEP_MS × timeScale`) | Orca's 5-minute health check (fires when `nowMs % 300_000 == 0` is crossed), wall-clock schedules (`GortCardSync` 10:00 daily, nightly jobs 02:00), every timestamp (Notes, consoles, audit, chat), reservation ages, the Shift clock. |
| **Physical clock** | `time.physMs` — unscaled play time | `dtGameMs / timeScale` (i.e. real elapsed ms while unpaused) | Everything that "takes time to happen" in the room or on a computer: Pi boot 40 s, Windows boot 50 s, LabSim boot 30 s, gantry motion, solenoid strokes, fuse heating, Jenkins stages and runner timeouts, Laz OOBE, Ollama inference, Gort sync 20 s, MySQL start 5 s + Orca reconnect 15 s, VM restart 45 s, 3D print 90 s, NPC delays. |

This is GP SR17 made precise: "physical durations are real seconds in every mode", while the Shift's
5× clock makes Orca's health check fire every 60 real s. `skipToNextHealthCheck()` and lesson
fast-forward jumps advance **only** the game clock (a Pi that is still booting is still booting when
the forced check runs — that is the lesson). Tests that call `sim.tick()` with `timeScale = 1`
advance both clocks equally.

### 0.4 Deltas to the contract files (implementer checklist)

`src/sim/types.ts` is the authority for names that already exist. This doc *adds*:

| Type | Add | Why |
|---|---|---|
| `LabState.time` | `physMs: number`, `epochDate: string` (`"2026-10-05"`), `healthAnchorMs: number` | §0.3 |
| `LabState` | `rngStreams: Record<RngStream, RngState>`, `config: SimConfig`, `network: NetworkState`, `windowsBoxes?` (no — hosts cover it), `local: LocalRunState`, `ubi: UbiState`, `printer3d: Printer3dState`, `timers: SimTimer[]`, `seq: { event: number; note: number; build: number; laz: number; ollama: number; chat: number; fault: number; run: number }` | §1.1 |
| `OrcaRobot` | `preFailureStatus: 'AVAILABLE'\|'UNAVAILABLE'\|null`, `statusChangedMs`, `reservedAtMs`, `lastReleasedMs`, `lastHealth: {atMs, http: number\|null, error: string\|null, latencyMs}\|null`, `statusHistory: {atMs, from, to, by}[]`, `probeDisplay: 'primary'\|'secondary'\|null` (moved to rig) — see §1.3.2 | health/restore rule, LRU, DSL |
| `OrcaRobot.checkout` | `statusAtCheckout: RobotStatus`, `kind: 'jenkins'\|'local'` | named-job auto-reset (§3.4.5) |
| `OrcaDevice` | `name: string` (unique, e.g. `johnny-5-flex2`) | GP DSL compares device *names* |
| `OrcaScreen` | `deviceType: DeviceTypeCode` (keyed by Device Type; `testingProfile` becomes derived/informational), `display: 'primary'\|'secondary'` | INC20/INC21 per-type rows (§2.10) |
| `MerchantConfig` | `region: 'US-EAST'\|'CA-CENTRAL'`, `qrReceiptsEnabled`, `signatureThresholdCents`, `acceptedBrands: CardBrand[]`, `apps: string[]`, `displayName`, `address` | §1.3.5 |
| `CardProfile` | `pin: string\|null`, `pan: string` (masked in UI), `expiry: 'YYMM'` | §1.3.7 |
| `ScreenCompareImage` | `usedBy: string[]` (test ids that reference it) | INC38 "another suite still references it" |
| `RigState` | `door: 'closed'\|'open'`, `solenoidConnector: 'SEATED'\|'LOOSE'`, `dipArmAligned: boolean`, `cradle: 'OK'\|'CRACKED'\|'NEW'`, `cradleTiltDeg: number`, `motionHost: 'PI'\|string`, `probeDisplay`, `pushAccumMm`, `motionFault: string\|null`, `lockedBy: {kind, ref}\|null`, `limitSwitchOk: {x: boolean; y: boolean}`, `phone: {mounted: string\|null}` | GP DSL, §3.7 |
| `TerminalDevice` | `state: 'OK'\|'BOOTING'\|'DEAD'\|'FRIED'` (derived view of `power`), `adbTcpPort: number\|null` (replaces the meaning of `adbEnabled`), `firmwareInfo: {version, receiptQr: boolean}` (the existing `firmware: string` stays = version), `launcher: {page: number}`, `printer: {paper: boolean; lastPayloadMs: number\|null}`, `cfdLayout: 'v1'\|'v2'`, `labelShiftPx: number`, `payDisplayLink: 'UP'\|'DOWN'\|null`, `display.autoAdvanceAtMs`, `display.renderDoneMs`, `secureTouch: boolean` | §3.8–3.12 |
| `Host` | `os: 'RUNNING'\|'HUNG'\|'BOOTING'\|'OFF'`, `eth: 'LINKED'\|'UNPLUGGED'\|'DAMAGED'`, `files: Record<path,string>`, `journal: Record<service,string[]>`, `schedTasks`, `underVoltage: boolean`, `bootStartedPhysMs` | §1.6 |
| `CollisProbe` | `kind: 'collis'\|'smartstripe'`, `state: 'OK'\|'FRIED'`, `armed: {profileId, entry, deviceId}\|null` | §1.7 |
| `Fuse` | `labelA: number` (holder label), `stress: number`, `removed: boolean` | §3.13 |
| `JenkinsJob` | `views: string[]`, `script: string`, `savedParams: Record<string,string>`, `exists: boolean` | §1.11 |
| `JenkinsBuild` | `envMasked: Record<string,string>`, `local?: false`, `runner: RunnerState` | §1.11 |
| events | see §5 (rows marked `NEW`) | |
| `SimApi` | `rig.dragCarriage`, `rig.reseat(part)`, `rig.replaceCradle`, `rig.alignDipArm`, `device.signStroke`, `power.removeFuse/insertFuse`, `host.pressPowerButton`, `host.writeFile`, `jenkins.saveJob/moveJob/configureScript`, `orca.matchPreview`, `orca.forceHealthCheck` (= `runHealthCheckNow` behind the tutorial gate, §6.3), `printer3d.start`, `sim.config` | §3 |
| more | late additions made while writing §4–§6 (fault bookkeeping, `assembly`, tooth offset, webcam aim, battery, `firmwareInfo`, `lastReceiptDoc`, spares, serial binding, `merchantPolicy`, timers, new API methods and events) | §1.15, §4, §5, §6 |

The temporary stub `src/sim/initialState.ts` uses `dateLabel: 'WED, NOV 5'` (the date on the
tethered-rack photo). The seeded lab uses **`MON, OCT 5`** (2026-10-05) because every Notes/console
string in Cur and GP is dated `2026-10-05`.

### 0.5 Source layout (`src/sim/`)

| Path | Contents |
|---|---|
| `seed/` | `deviceTypes.ts`, `robots.ts`, `devices.ts`, `hosts.ts`, `power.ts`, `capabilities.ts`, `merchants.ts`, `cards.ts`, `layouts/*.ts` (firmware truth, §2.10), `screens.ts` (Orca rows derived from layouts + seed overrides), `compare.ts`, `cameras.ts`, `repos/*.ts` (file contents), `jenkins.ts`, `presets.ts` (factory / academy / arcade / freeplay) |
| `systems/` | one file per system in tick order (§3.1): `clock.ts`, `power.ts`, `hosts.ts`, `network.ts`, `rigs.ts`, `devices.ts`, `collis.ts`, `orcaHealth.ts`, `orca.ts` (status, checkout, xy_touch, cards, REST), `jenkins.ts`, `runners/uiaRemote.ts`, `runners/pigeon.ts`, `runners/goSdk.ts`, `laz.ts`, `ubi.ts`, `ocr.ts`, `ollama.ts`, `git.ts`, `npc.ts` (scripted reviewers/merges, chat replies requested by missions), `faults.ts`, `timers.ts` |
| `text/` | every exact string the sim emits (Notes formats, console lines, terminal outputs owned by the sim) — one place so tests can snapshot them |
| `codefacts.ts` | static predicates over repo files (§3.19.6) |
| `terminal/` | the shell interpreter (owned by the apps doc for command coverage; uses the read helpers in this doc) |

---

## 1. State model

All state is plain JSON (no `Map`, `Set`, class, `Date`, function). Interfaces below are
documentation; field names match `src/sim/types.ts` where the field already exists.

### 1.1 Root

```ts
interface LabState {
  version: 2;                         // bump on breaking change; migrations in §6.4
  time: TimeState;
  rng: RngState;                      // legacy single stream (kept; = rngStreams.core)
  rngStreams: Record<RngStream, RngState>;            // NEW §6.1
  config: SimConfig;                                  // NEW
  flags: LabFlags;
  orca: OrcaDb;
  rigs: Record<string, RigState>;     // key = robot Name, only rigs with physical/simulated hardware (all 42; off-screen rigs have `offscreen: true`)
  devices: Record<string, TerminalDevice>;              // key = runtime id "dev-<orca device name>"
  hosts: Record<string, Host>;                        // Pis, Windows boxes, VMs, blade, workstation, coworker devices, switch
  network: NetworkState;                              // NEW §1.9
  workstation: WorkstationState;
  power: PowerState;
  collis: Record<string, CollisProbe>;                // Collis probes and SmartStripe probes
  callus: CallusState;
  repos: Record<RepoId, GitRepo>;
  jenkins: JenkinsState;
  local: LocalRunState;                               // NEW §1.12 (IntelliJ runs)
  laz: { runs: Record<string, LazRun> };
  ubi: UbiState;                                      // NEW §1.13
  ollama: OllamaState;
  printer3d: Printer3dState;                          // NEW (Prusa / Bambu Lab jobs, INC59)
  chat: { messages: ChatMessage[]; unread: Record<string, number> };
  faults: ActiveFault[];
  timers: SimTimer[];                                 // NEW §3.1.2 scheduled callbacks
  log: SimLogEntry[];
  seq: SeqCounters;                                   // NEW
}

interface TimeState {
  nowMs: number;          // game clock (§0.3)
  physMs: number;         // physical clock (§0.3)                       NEW
  timeScale: number;      // game ms per physical ms; 1, 2, 5, 10, 30
  startHour: number;      // 8 (Shift) / 9 (Academy, Free Play)
  epochDate: string;      // "2026-10-05"                                 NEW
  dateLabel: string;      // "MON, OCT 5" — lock screens / tablets
  healthAnchorMs: number; // 0; health checks fire at nowMs ≡ anchor (mod 300 000)  NEW
}

type RngStream = 'core' | 'faults' | 'jenkins' | 'devices' | 'ollama' | 'npc';

interface SimConfig {                                  // NEW — set by the mode, never by content
  mode: 'academy' | 'arcade' | 'freeplay' | 'cert' | 'test';
  damageModel: 'academy' | 'arcade' | 'full';         // §3.13.6
  pipelinesEnabled: boolean;                          // background PL1–PL8 traffic (missions drive it; sim exposes the flag)
  npcAutoMerge: boolean;                              // Jared/Morgan scripted PR reviews (§3.22)
  forceHealthCheckAllowed: boolean;                   // Orca tutorial button (Academy, Free Play)
  logCap: number;                                     // 500
}

interface SeqCounters { note: number; build: number; laz: number; ollama: number; chat: number;
  fault: number; run: number; commit: number; pr: Record<RepoId, number>; }

interface SimTimer { id: string; clock: 'game' | 'phys'; atMs: number; kind: string;
  payload: Record<string, string | number | boolean | null>; }

interface SimLogEntry { atMs: number; source: string; level: 'debug'|'info'|'warn'|'error'; text: string; }
```

### 1.2 Flags

```ts
interface LabFlags {
  receiptQrFeature: boolean;     // firmware rollout of "Scan for receipt" has reached the lab (sets every device's firmware.receiptQr)
  uiaVersion: '2.2' | '2.3';     // uia-remote's UI Automator version; '2.3' (Ref §1) enables displayId locators (§3.11)
  softwarePinBypass: boolean;    // Gen 2 Software PIN Bypass shipped? Always false in all presets (Ref §6: in progress)
  showTouchTargets: boolean;     // tutorial overlay: draw firmware button rects + Orca points on device screens
  cfdLayoutV2Toggle: boolean;    // NEW — Cur M16's tutorial "CFD layout v2" switch (R2-D2 only)
}
```

### 1.3 Orca (MySQL `orca` schema, JHipster entities)

Ref §3 names **7 core schemas**. The sim stores them as tables (`Record<id, row>`) plus Orca's
runtime bookkeeping. Mapping:

| Ref schema | Tables here |
|---|---|
| Robot Entity | `robots` (+ `notes` embedded per robot) |
| Robot Creation & Configuration | `robots` config fields + `devices` (Robot Device) + `DeviceType` enum metrics (code, §2.2) |
| Robot Capabilities | `capabilities` (+ link `robots[].capabilityIds`) |
| Merchant Config | `merchants` |
| Screens & Screen Locations | `screens`, `screenLocations` |
| Card Profile | `cardProfiles` |
| Screen Compare Image | `screenCompareImages` |

#### 1.3.1 `OrcaDb`

```ts
interface OrcaDb {
  robots: Record<number, OrcaRobot>;
  devices: Record<number, OrcaDevice>;
  capabilities: Record<number, RobotCapability>;
  merchants: Record<number, MerchantConfig>;
  screens: Record<number, OrcaScreen>;
  screenLocations: Record<number, ScreenLocation>;
  cardProfiles: Record<number, CardProfile>;
  screenCompareImages: Record<number, ScreenCompareImage>;
  seq: Record<'robots'|'devices'|'capabilities'|'merchants'|'screens'|'screenLocations'|'cardProfiles'|'screenCompareImages'|'notes', number>;
  healthCheck: {
    intervalMs: 300_000;                 // 5 game minutes (canon)
    lastRunMs: number;                   // game ms of the last run (scheduled or forced)
    nextRunMs: number;                   // next aligned multiple of 300 000
    running: boolean;                    // always false outside the tick that runs it (§3.3)
    runCount: number;                    // NEW — "run #N" in the health log
    log: HealthLogRun[];                 // NEW — last 50 runs (Orca → Administration → Health log)
    timeoutMs: 10_000;                   // NEW — per-ping timeout [illus.]
  };
  app: {
    up: boolean;                         // Spring Boot process running on orca-vm
    dbConnected: boolean;                // NEW — JDBC pool connected to MySQL (false ⇒ every entity call 500)
    reconnectAtPhysMs: number | null;    // NEW — MySQL came back; pool reconnects 15 s later (SR17)
    version: '3.14.2';
    deployedCommit: string;              // sha of orchestrator main at deploy
  };
  audit: { atMs: number; who: string; action: string; entity: string; entityId: number | string; diff?: Record<string, [unknown, unknown]> }[];
  pendingSyncs: { atPhysMs: number; repo: 'gort'; paths: string[]; commit: string }[];   // NEW — gort → Screen Locations (§3.22.3)
}

interface HealthLogRun {
  run: number; atMs: number; pinged: number; skipped: number; failed: number; recovered: number;
  lines: string[];                       // exact lines, §3.3.4
}
```

#### 1.3.2 `OrcaRobot`

```ts
type RobotStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'OFFLINE' | 'CONNECTION_FAILED' | 'RESERVED';
type RigKind = 'touch' | 'tethered' | 'adb' | 'standalone';   // standalone = dedicated PayCore-style touch rig

interface OrcaRobot {
  id: number;
  name: string;                    // system identifier, lowercase-kebab, unique, case-sensitive ("rosie")
  humanReadableName: string;       // pushed to the status tablet ("ROSIE")
  status: RobotStatus;
  preFailureStatus: 'AVAILABLE' | 'UNAVAILABLE' | null;   // NEW — set when the health check flips to CONNECTION_FAILED
  statusChangedMs: number;                                 // NEW
  statusHistory: { atMs: number; from: RobotStatus; to: RobotStatus; by: string; reason?: string }[]; // NEW, cap 100
  rigKind: RigKind;
  environment: 'DEV1' | 'DEV2' | 'STG' | 'QA' | 'INT';    // backend env the rig's devices point at; checkout filter (§3.4)
  deviceId: number | null;         // "Robot Device" (FK OrcaDevice) — decoupled for upgrades/rollbacks
  mfdDeviceId: number | null;      // USB Tethered Device Configuration; populated ⇒ pipeline treats rig as tethered
  cfdDeviceId: number | null;
  adbServiceUrl: string;           // "http://10.42.10.11:8000/adb"
  cameraStreamUrl: string;         // "http://10.42.10.11:8081/stream.mjpg" or shared quad URL, "" if none
  dipUrl: string | null;           // "http://10.42.10.11:8000/dip"  ("" or null = not mapped)
  tapUrl: string | null;
  swipeUrl: string | null;
  offsetXMm: number;               // legacy, deprecated; 0.0 everywhere in factory state
  offsetYMm: number;
  capabilityIds: number[];         // linked RobotCapability rows (flags); derived keys come from device/rig (§2.7)
  merchantConfigId: number | null; // the merchant this rig's device(s) SHOULD hold; Laz enforces it
  reservedBy: string | null;       // RESERVED only — "riley", "player" …
  reservedAtMs: number | null;     // NEW
  checkout: null | { buildId: string; jobId: string; byName: boolean; startedMs: number;
                     statusAtCheckout: RobotStatus; kind: 'jenkins' | 'local' };   // NEW fields
  lastReleasedMs: number | null;   // NEW — LRU candidate ordering (§3.4.3)
  lastHealthCheckMs: number | null;
  lastHealthCheckOk: boolean | null;
  lastHealth: { atMs: number; endpoint: string; http: number | null; error: string | null; latencyMs: number } | null; // NEW
  notes: RobotNote[];              // newest first in UI; cap 50 (oldest dropped)
  physical: boolean;               // modelled in the 3D lab (12 of 42)
  location: string;                // "Rack A / Shelf 2 (U33–U36)"
  description: string;             // tablet "Robot" tab text
}

interface RobotNote {
  id: number;
  atMs: number;
  author: string;           // "orca-health-check" | "orca" | person key ("alex", "player")
  kind: 'HEALTH' | 'STATUS' | 'CONFIG' | 'MANUAL';   // NEW
  endpoint?: string;        // HEALTH: exact URL attempted
  text: string;             // the full display line (format §3.3.3)
  repeat: number;           // NEW — identical consecutive failures collapse into "(×N)"
  resolved: boolean;
}
```

#### 1.3.3 `OrcaDevice` and the `DeviceType` enum

```ts
type DeviceTypeCode = 'STATION_2018'|'STATION_2'|'STATION_DUO'|'STATION_DUO_2'|'STATION_DUO_3'
  |'MINI_2'|'MINI_3'|'MINI_4'|'FLEX_1'|'FLEX_2'|'FLEX_3'|'FLEX_4'|'FLEX_POCKET'|'COMPACT';

interface OrcaDevice {
  id: number;
  name: string;             // NEW unique row name, "<robot>-<model>" e.g. "johnny-5-flex1"
  deviceType: DeviceTypeCode;
  serial: string;           // "SIM-F1-000015"
  ip: string;               // terminal IP; ADB over TCP on 5444
  label: string;            // free text, e.g. "Flex 1 (JOHNNY-5) — keep for rollback"
  simDeviceId: string | null;   // runtime TerminalDevice id if the hardware exists in the sim
  retired: boolean;
}
```

The enum is **code, not a table** (JHipster `enumeration`): `DeviceTypeInfo` (types.ts) holds
"device dimensions, layout metrics, and internal string definitions" (Ref §3). Values in §2.2.
`DeviceType.valueOf(s)` is **exact and case-sensitive**; any other string throws
`java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.<s>`.

#### 1.3.4 `RobotCapability`

```ts
interface RobotCapability {
  id: number;
  name: string;            // "PHYSICAL_TOUCH"
  key: string;             // NEW — JSON key used in capability documents ("physicalTouch")
  value: boolean | string; // NEW — value contributed when linked (true)
  description: string;
  lookup: 'DYNAMIC_JSON' | 'NON_DYNAMIC' | 'BOTH';   // which request style typically asks for it (informational; matching is identical)
  json: string | null;     // example request fragment shown in the UI, e.g. '{"goSdk": true}'
}
```

A robot's **capability document** (what Orca's "Robot Capabilities" view and Match preview show) =
derived keys (§2.7.1) ∪ `{ [cap.key]: cap.value }` for each linked row.

#### 1.3.5 `MerchantConfig`

```ts
interface MerchantConfig {
  id: number;
  name: string;                 // "GO-SDK-US-01" — unique
  displayName: string;          // NEW — printed on receipts ("LabSim Automation Lab — US 01")
  address: string;              // NEW — receipt header line
  merchantId: string;           // MID, "SIMMID0000101"
  environment: 'dev1' | 'dev2' | 'stg' | 'qa' | 'int';
  region: 'US-EAST' | 'CA-CENTRAL';                 // NEW — shown in the list table
  country: 'US' | 'CA';
  currency: 'USD' | 'CAD';
  taxRateBp: number;            // NEW name for taxRatePct×100 (keep taxRatePct for UI: 8.25)
  tipsEnabled: boolean;
  tipPercents: number[];        // NEW — [15, 18, 20, 22]
  pinBypass: boolean;           // merchant config that bypasses PIN security (only kind ADB bots may use)
  cashDiscountEnabled: boolean;
  cardAdjustBp: number;         // NEW — non-cash adjustment for cash-discount programs (400 = 4.00 %) [illus.]
  qrReceiptsEnabled: boolean;   // NEW — merchant opted into "Scan for receipt" (§3.10)
  signatureThresholdCents: number;   // NEW — swipe signature required at/above (US 2500; CA 0 = never)
  acceptedBrands: CardBrand[];  // NEW
  apps: string[];               // NEW — extra launcher apps provisioned ("LabSim Dining")
  owner: 'Automation' | 'PayCore' | 'SDK' | 'Westers';
  appId: string | null;         // Go SDK credentials (Tate) — NOT in the list table; Edit only
  appSecret: string | null;
  apiKey: string | null;
  ubiRoute: string | null;      // "us-east" | "ca-central" — Edit only [illus. field]
  notes: string;
}
```

Merchant Config list table columns (display limit, Ref §3 "click Edit"): **Name · Region · PIN
Bypass · Country · Owner · …** (truncated). Every other field is only visible in the **Edit** dialog.

#### 1.3.6 `OrcaScreen` and `ScreenLocation`

```ts
interface OrcaScreen {
  id: number;
  name: string;                 // "RECEIPT_OPTIONS_5"
  deviceType: DeviceTypeCode;   // NEW — rows are per Device Type (INC20/INC21; GP DSL)
  testingProfile: TestingProfile;   // derived from deviceType; informational
  display: 'primary' | 'secondary'; // NEW — 'secondary' only for STATION_DUO* "CFD_*" screens
  description: string;
  optionCount: 4 | 5 | null;    // receipt screens
}
interface ScreenLocation {
  id: number;
  screenId: number;
  button: string;               // exact string passed to xy_touch: "Print", "No Receipt", "Scan for receipt", "1"
  xMm: number;                  // tap point (button centre) in mm from the screen's top-left
  yMm: number;
}
```

Uniqueness: `(deviceType, name)` for screens; `(screenId, button)` for locations (case-sensitive
button strings). Orca never stores button *sizes* — only the point. Sizes live in device firmware
(`src/sim/seed/layouts`, §2.10), which is the truth that hits are tested against.

#### 1.3.7 `CardProfile`

```ts
type CardBrand = 'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER' | 'INTERAC';
type CardEntry = 'SWIPE' | 'DIP' | 'TAP';
interface CardProfile {
  id: number;
  name: string;                 // "VISA_STD_DIP"
  brand: CardBrand;
  entry: CardEntry;
  trackData: string | null;     // SWIPE only: raw Track 1 + Track 2 text, stored directly in MySQL
  gortPath: string | null;      // DIP/TAP only: path inside Gort, e.g. "cards/emv/visa_std_dip.json"
  country: 'US' | 'CA';
  requiresPin: boolean;         // CVM is PIN (Interac)
  pin: string | null;           // NEW — test PIN entered on the PIN pad ("1234") [illus.]
  pan: string;                  // NEW — shown masked "•••• 1111"
  expiry: string;               // NEW — "3012" (YYMM)
  owner: 'Automation' | 'PayCore';
}
```

#### 1.3.8 `ScreenCompareImage`

```ts
interface ScreenCompareImage {
  id: number;
  name: string;                 // "CFD_TOTAL"
  robotId: number;              // whose Camera Stream URL is captured
  screenName: string;           // CFD screen the check runs on, "CFD_CART"
  bbox: { x: number; y: number; w: number; h: number };   // webcam px
  expectedText: string;         // exact, case-sensitive
  deprecated: boolean;          // being phased out for UIA 2.3 (Ref §3)
  usedBy: string[];             // NEW — test ids, e.g. ["uia-remote:DuoCfdSuite"]
}
```

### 1.4 Physical rigs

One `RigState` per robot in the pool (all 42). Off-screen rigs (`offscreen: true`) run the same
systems with simplified hardware (no power graph, no world props).

```ts
type BannerColor = 'green' | 'yellow' | 'red' | 'grey';
type ActuatorState = 'retracted' | 'extending' | 'extended' | 'retracting';

interface RigState {
  id: string;                     // = robot name
  orcaRobotId: number;
  kind: RigKind;
  offscreen: boolean;             // NEW
  hasGantry: boolean;             // touch + standalone rigs
  probeDisplay: 'primary' | 'secondary' | null;  // NEW — which display the gantry covers (R2-D2: 'secondary' = CFD)
  gantry: {
    xMm: number; yMm: number;               // carriage position in screen mm (0,0 = limit switches)
    targetXMm: number; targetYMm: number;
    minXMm: -10; minYMm: -10;               // travel beyond the screen edges [illus.]
    maxXMm: number; maxYMm: number;         // screen w/h + 10
    speedMmS: 120;                          // [illus.]
    homingSpeedMmS: 60;                     // [illus.]
    moving: boolean;
    homed: boolean;                         // homed against both limit switches since power-up / lock break / steppers re-enable
    limitXHit: boolean; limitYHit: boolean; // true while the carriage sits on the switch
  };
  limitSwitchOk: { x: boolean; y: boolean };    // NEW — false ⇒ homing fails (fault rig.limitSwitchBroken)
  steppersEnabled: boolean;
  solenoid: {
    down: boolean;
    mode: 'fast' | 'slow';                      // Down/Up = fast (60 ms stroke); Lower/Raise = slow (400 ms) — Cur M04
    lastTapMs: number | null;                   // physMs
    taps: number;
    heightAdjustMm: number;                     // kept for compatibility; always 0
  };
  solenoidConnector: 'SEATED' | 'LOOSE';        // NEW (INC15)
  dipArm: ActuatorState;
  dipArmAligned: boolean;                       // NEW (INC16) — false ⇒ ribbon card strikes the bezel
  tapArm: ActuatorState;                        // tap paddle
  phonePusher: ActuatorState;                   // Phone Forward/Back carriage (S17)
  phonePowerPress: { atMs: number } | null;     // Push Power Button pulse
  phone: { mounted: string | null };            // e.g. "iPhone (Go SDK mobile runner)" on ASTRO; null elsewhere
  magneticLock: { engaged: boolean; brokenAtMs: number | null };
  pushAccumMm: number;                          // NEW — hand-drag distance since last lock engage (≥ 20 ⇒ break)
  door: 'closed' | 'open';                      // NEW — carriage can be dragged only with the door open
  banner: BannerColor;
  bannerText: string;                           // NEW — exact header text (§3.7.5)
  motionFault: string | null;                   // NEW — "HOMING FAILED (X limit not found)"
  dashboardLocked: boolean;                     // TEST IN PROGRESS overlay
  lockedBy: { kind: 'jenkins' | 'local'; ref: string } | null;   // NEW
  mainSwitch: boolean;                          // POWER panel MAIN (controller side: Pi lead, tablet charging, webcam)
  motorSwitch: boolean;                         // POWER panel MOTOR (stepper + solenoid drivers, 24 V)
  queue: RigMotionCommand[];                    // FIFO, executed by the rigs system
  current: RigMotionCommand | null;             // NEW — command in progress
  currentEndsPhysMs: number | null;             // NEW
  motionHost: 'PI' | string;                    // NEW — where the 25-pin motor PCB's USB is plugged: 'PI' or a host id ("nuc-03", INC19)
  cradle: 'OK' | 'CRACKED' | 'NEW';             // NEW
  cradleTiltDeg: number;                        // NEW — 0, or 2.0 when cracked (INC59)
  piHostId: string | null;
  callusHostId: string | null;
  collisId: string | null;                      // Collis probe (touch) or SmartStripe probe (tethered)
  deviceIds: string[];                          // runtime device ids on this rig
  webcam: { connected: boolean; aimedOk: boolean; cameraId: string | null };   // cameraId → §2.11 camera views
  tablet: { tab: 'robot' | 'robot-control' | 'motion-control'; statusText: string; brainbox: 'Brainbox v6';
            hrnShown: string; reachable: boolean };   // hrnShown/reachable NEW
  shelfPropId: string | null;
}

interface RigMotionCommand {
  kind: 'moveTo'|'park'|'parkXY'|'parkX'|'parkY'|'tap'|'solenoidDown'|'solenoidUp'|'solenoidLower'|'solenoidRaise'
      |'dipIn'|'dipOut'|'tapIn'|'tapOut'|'phoneForward'|'phoneBack'|'pushPower'|'stroke'|'wait';
  xMm?: number; yMm?: number; toXMm?: number; toYMm?: number;   // stroke = solenoid down, move, up (signature)
  ms?: number;
  ref?: string;                                 // correlates with an xy_touch / card action / runner step
  source: 'tablet' | 'orca' | 'player';         // NEW
}
```

### 1.5 LabSim devices

```ts
type DevicePower = 'off' | 'booting' | 'on' | 'fried';

interface TerminalDevice {
  id: string;                     // "dev-wall-e-flex3"
  orcaDeviceName: string;         // NEW — "wall-e-flex3"
  type: DeviceTypeCode;
  serial: string;
  ip: string;
  adbPort: 5444;                  // the lab standard (kept for compatibility)
  adbTcpPort: number | null;      // NEW — port adbd listens on over TCP now: 5444 normally; null after an OOBE wipe until restored; 5555 for coworker devices
  adbEnabled: boolean;            // USB debugging on (true for every lab device)
  power: DevicePower;
  bootProgress: number;           // 0..1 over 30 s physical
  bootStartedPhysMs: number | null;
  dead: boolean;                  // NEW — hardware failure: never finishes boot (INC44)
  supply: PowerHookup;            // where its PSU brick (or lead) is plugged
  rigId: string | null;           // rig, desk ("desk-riley"), storage ("husky-drawer-2"), device library
  role: 'standalone' | 'mfd' | 'cfd' | 'duo';
  tetheredTo: string | null;
  link: 'usb' | 'network' | null;
  payDisplayApp: 'USB_PAY_DISPLAY' | 'SECURE_NETWORK_PAY_DISPLAY' | null;
  payDisplayLink: 'UP' | 'DOWN' | null;   // NEW — tethered MFD↔CFD link (§3.8.6)
  hubEthernet: boolean;           // NEW — connectivity hub Ethernet seated (tethered rack docks)
  hubUsbToPeer: boolean;          // NEW — hub-to-hub USB cable seated (USB Pay Display)
  merchantConfigId: number | null;// merchant actually provisioned on the device now
  provisioned: boolean;
  theme: 'avocado';               // device UI theme (config.properties theme must match: avocado)
  kernel: 'CPA';                  // Core Payments Application
  passcode: string;               // "0000"
  locked: boolean;                // NEW — lock screen shown (wakes to lock after 10 min idle) [illus.]
  firmware: string;               // existing: version string, kept equal to firmwareInfo.version
  firmwareInfo: { version: string; receiptQr: boolean };   // NEW (authoritative)
  launcher: { page: number; apps: string[] };          // NEW — current launcher page; app order
  display: DisplayState;          // primary (MFD) display
  secondaryDisplay: DisplayState | null;   // Station Duo family CFD
  cfdLayout: 'v1' | 'v2';         // NEW — Duo CFD copy/layout version (INC37A, M16 toggle)
  labelShiftPx: number;           // NEW — extra vertical shift of CFD labels in webcam px (INC36)
  order: OrderState | null;
  printer: { present: boolean; paper: boolean; lastPayloadMs: number | null };   // NEW
  lastReceipt: string | null;     // existing: the 32-column text (§3.9.7), kept in sync
  lastReceiptDoc: ReceiptDoc | null; // NEW (authoritative): structured receipt
  cardPresent: CardEntry | null;  // what the probe is presenting right now (for rendering)
  secureTouch: boolean;           // NEW — PIN pad active: injected (ADB) input ignored
  apps: string[];
  logcat: string[];               // NEW — last 200 lines, for `adb logcat -d`
}

interface DisplayState {
  screen: ScreenName;             // runtime screen (lowercase-kebab, §2.10.1)
  params: Record<string, string | number | boolean>;
  receiptOptions?: 4 | 5;
  rev: number;
  brightness: number;
  autoAdvanceAtMs: number | null;   // NEW — physMs when a transient screen moves on (approved, printing…); null = hold
  renderDoneMs: number | null;      // NEW — physMs when the current screen finished rendering (waitForScreen race, §3.19.5)
  toast: { text: string; untilMs: number } | null;   // NEW — "Card read error, try again"
  strokes: number;                  // NEW — signature strokes drawn on the current signature screen
  pinDigits: number;                // NEW — digits entered on the PIN pad (masked dots)
}

interface OrderState {
  id: string;                      // "ORD-<rig>-<n>" deterministic
  lines: OrderLine[];
  subtotalCents: number; taxCents: number; tipCents: number;
  cardAdjustCents: number;         // NEW — cash-discount non-cash adjustment when paying by card
  totalCents: number;
  tender: 'card' | 'cash' | null;  // NEW
  status: 'open'|'review'|'awaiting-tender'|'awaiting-card'|'awaiting-pin'|'awaiting-tip'|'awaiting-signature'|'processing'|'paid'|'declined';
  cardProfileId: number | null;
  entry: CardEntry | null;         // NEW
  pinTries: number;                // NEW
  authCode: string | null;         // NEW — "SIM042" deterministic
  receiptChoice: 'Print' | 'Email' | 'Text' | 'No Receipt' | 'Scan for receipt' | null;
}
interface OrderLine { name: string; priceCents: number; qty: number; taxable: boolean; }
```

### 1.6 Hosts and services

```ts
type HostKind = 'pi' | 'nuc' | 'minix' | 'vm' | 'blade' | 'workstation' | 'coworker-device' | 'switch';
type HostPower = 'off' | 'booting' | 'on' | 'crashed';     // 'crashed' kept for compatibility = os HUNG

interface Host {
  id: string;                     // "pi-wall-e", "pi-tethered", "minix-01", "nuc-03", "orca-vm", "gpu-blade", "ws-17"
  kind: HostKind;
  hostname: string;               // shell prompt name: "wall-e", "MINIX-01", "orca"
  ip: string;
  aliases: string[];              // NEW — "orca.lab.local", "pi-10.42.10.11"
  os: 'RUNNING' | 'HUNG' | 'BOOTING' | 'OFF';                // NEW (authoritative); `power` is derived
  osName: string;                 // "Raspberry Pi OS (Debian 12, Linux 6.6.31-v8+ aarch64)", "Windows 10 IoT Enterprise", "Ubuntu 22.04 LTS"
  power: HostPower;
  bootProgress: number;
  bootStartedPhysMs: number | null;
  bootDurationMs: number;         // Pi 40 000 · Windows box 50 000 · VM 45 000 · blade 90 000 (all physical)
  eth: 'LINKED' | 'UNPLUGGED' | 'DAMAGED';                   // NEW (authoritative); `ethernet` derived (= LINKED|DAMAGED)
  ethernet: boolean;
  supply: PowerHookup;
  underVoltage: boolean;          // NEW — Pi saw < 4.63 V since boot (vcgencmd get_throttled ≠ 0x0)
  services: Record<string, ServiceState>;
  diskUsedPct: number;
  diskTotalGb: number;
  diskUsedGb: number;             // NEW — authoritative; pct derived
  cpuTempC: number;
  uptimeMs: number;
  files: Record<string, string>;  // NEW — the few config files the sim reads (§2.5.3)
  journal: Record<string, string[]>;   // NEW — per-service log tail (journalctl / Event Viewer), cap 50
  schedTasks: Record<string, SchedTask>;   // NEW — Windows Task Scheduler (GortCardSync)
  usb: string[];                  // NEW — USB devices attached: "webcam", "motor-pcb:bumblebee", "adb:SIM-M3-000031", "smartstripe:megatron"
  owner: string | null;
  propId: string | null;
  offscreen: boolean;             // NEW
}

interface ServiceState {
  name: string;          // robot-controller | adb-service | camera-stream | cardprog | ssh | callus | corporate-agent | motion | orca | mysql | jenkins | ollama | sshd
  running: boolean;
  port: number | null;
  failure: string | null;          // systemd "Result: exit-code" reason / Windows error
  enabled: boolean;                // starts on boot
  startedPhysMs: number | null;    // NEW
  startDelayMs: number;            // NEW — after OS boot completes (or after `start`), when it becomes reachable
}

interface SchedTask { name: 'GortCardSync'; dailyAt: '10:00'; lastRunMs: number | null; lastResult: 0 | 1 | null;
  running: boolean; runEndsPhysMs: number | null; }
```

### 1.7 Collis probes, SmartStripe probes, Callus

```ts
interface CollisProbe {
  id: string;                     // "collis-wall-e" | "smartstripe-megatron"
  kind: 'collis' | 'smartstripe'; // NEW — SmartStripe = USB mag-stripe probe on tethered beds (photo) [illus. role]
  rigId: string;
  callusHostId: string;           // Windows/Minix box running the Callus service that drives it
  ribbonConnected: boolean;       // collis: rear ribbon cable to the device's card reader; smartstripe: USB plugged
  supply: PowerHookup;            // collis: own PSU on an AC strip; smartstripe: USB (bus powered)
  powered: boolean;
  damaged: boolean;
  state: 'OK' | 'FRIED';          // NEW
  ledColor: 'green' | 'amber' | 'off';   // NEW — derived: off (no power) / amber (no ribbon link) / green
  loadedProfileId: number | null;
  armed: { profileId: number; entry: CardEntry; deviceId: string; fireOnScreen: ScreenName } | null; // NEW — pre-loaded swipe (Tax test)
  lastAction: { entry: CardEntry; atMs: number; ok: boolean; error: string | null } | null;
}

interface CallusState {
  /** Local Gort clone per Windows box (GortCardSync). Keyed by host id. */
  localCardFiles: Record<string, { syncedCommit: string; syncedAtMs: number; files: string[] }>;  // files = Gort-relative paths present locally
  log: Record<string, string[]>;  // NEW — per box, Callus service log tail (cap 50)
}
```

### 1.8 Power network

The power network is a **graph** of sources, conductors, protection and loads; the solver (§3.13)
recomputes voltages/currents every tick from switch/plug/fuse state.

```ts
interface PowerState {
  outlets: Record<string, PowerOutlet>;     // wall, 120 V AC
  strips: Record<string, AcStrip>;          // commercial AC power strips (LabSim bricks, Collis PSUs, Minix bricks)
  psus: Record<string, PowerSupplyUnit>;    // Mean Well 120 V AC → 24 V DC
  regulators: Record<string, Regulator>;    // NEW — DC step-downs (24→12, 24→5 10 A)
  rails: Record<string, DcRail>;            // rail-24v, rail-12v, rail-5v-a, rail-5v-b, rail-5v-bench
  terminals: Record<string, DcTerminal>;    // NEW — pluggable DC points (rig MAIN/MOTOR feeds, spare taps)
  fuses: Record<string, Fuse>;
  loads: Record<string, PowerLoad>;
  spareFuses: Record<'5'|'10'|'15'|'20', number>;   // blade fuses on the power-wall bench by rating (tan/red/blue/yellow)
  sparks: { atPhysMs: number; at: string; cause: string }[];   // NEW — last 10, for VFX/audio
}
interface PowerOutlet { id: string; voltage: 120; live: boolean; plugged: string | null; propId: string | null; }
interface AcStrip { id: string; label: string; outletId: string | null; switchOn: boolean; sockets: 6;
  loads: (string | null)[]; breakerTripped: boolean; propId: string | null; }      // breakerTripped NEW (> 15 A)
interface PowerSupplyUnit { id: 'MW-1'; model: 'Mean Well LRS-600-24'; label: 'MEAN WELL · INPUT 120VAC · OUTPUT 24VDC';
  outletId: string | null; outputVoltage: 24; maxAmps: 25; on: boolean; hiccupUntilPhysMs: number | null; propId: string | null; }
interface Regulator { id: string; inRail: 'rail-24v'; outRail: string; nominalV: 12 | 5; maxA: number; inputSwitch: boolean;
  label: string; propId: string | null; }                                           // NEW
interface DcRail { id: string; nominalVoltage: 24 | 12 | 5; source: string; fuseId: string | null; maxAmps: number;
  voltage: number; currentA: number; propId: string | null; }
interface DcTerminal { id: string; railId: string; label: string; via: 'fuse-bus' | 'rig-main' | 'rig-motor' | 'spare';
  rigId?: string; plugged: string | null; propId: string | null; }                  // NEW
interface Fuse { id: string; railId: string; ratingA: number; labelA: number; blown: boolean; removed: boolean;
  stress: number; propId: string | null; }                                          // labelA/removed/stress NEW
interface PowerLoad {
  id: string; label: string;
  expects: '5V' | '12V' | '24V' | 'AC-BRICK-18V' | 'AC';   // AC-BRICK-18V = LabSim device or Collis probe via its own brick
  drawA: number;                  // nominal current at its expected voltage (state-dependent, §3.13.3)
  supply: PowerHookup;
  powered: boolean; damaged: boolean;
  hostId?: string; deviceId?: string; collisId?: string; rigId?: string;   // NEW back-references
}
interface PowerHookup { kind: 'ac-strip' | 'dc-rail' | 'usb' | 'none'; targetId: string | null; socket?: number; }
```

### 1.9 Network

```ts
interface NetworkState {                      // NEW
  subnets: { cidr: string; name: string }[];  // 10.42.1.0/24 servers, 10.42.10.0/24 robot Pis, 10.42.20.0/24 Windows boxes,
                                              // 10.42.30.0/24 LabSim devices, 10.42.50.0/24 workstations, 10.42.60.0/24 office desks
  switchUp: boolean;                          // lab core switch (never fails in presets; fault net.switchDown exists)
  arp: Record<string, string>;                // ip → host/device id (derived each tick; for `ping`, `arp -a`)
}
```

**Reachability** of `ip:port` from host A (used by every REST call, ping, ssh, adb, curl):
1. Target resolves (ip, alias, or hostname) to a host or LabSim device; unknown ⇒ `No route to host`.
2. Target endpoint is *up*: host `os == 'RUNNING'` (LabSim: `power == 'on'`), `eth != 'UNPLUGGED'`
   (LabSim: always networked when on — Wi-Fi/Ethernet via hub, except the hub-Ethernet fault on a CFD
   affects only the pay-display link), `network.switchUp`. Down ⇒ **timeout** (`connect timed out`).
   A `DAMAGED` cable drops every *other* attempt deterministically (attempt counter parity) ⇒ timeout.
3. Port listening: a running service with that port, or LabSim `adbTcpPort == port` for ADB.
   Not listening ⇒ **refused** (`Connection refused`).
4. ICMP ping succeeds iff (2) holds (ports irrelevant).

Latency model: LAN 1–4 ms (`devices` rng stream), REST handler time 30 ms, timeouts exactly as configured.

### 1.10 Workstation

```ts
interface WorkstationState {
  adbServerRunning: boolean;
  adbConnections: AdbConnection[];      // ordered: the order they were connected (fallback uses [0], §3.15.3)
  sshHostId: string | null;
  cwd: string;
  shellHistory: string[];
  locallyRunningTest: { robotId: number | null; testName: string; startedMs: number } | null;
  coworkerDevicesDisturbed: number;
  configProperties: Record<string, string>;   // NEW — parsed view of uia-remote/config.properties in the local clone (source of truth = the file)
  files: Record<string, string>;              // NEW — ~/Downloads, ~/Pictures (screencaps, webcam snapshots: path → image ref "img:screencap:dev-eve:<physMs>")
}
interface AdbConnection { target: string; hostId: string | null; deviceId: string | null;
  state: 'device' | 'offline' | 'unauthorized'; coworker: boolean; }       // coworker NEW
```

### 1.11 Git, GitHub

As in `types.ts` (`GitRepo`, `GitCommit`, `PullRequest`) with these additions:

```ts
type RepoId = 'gort' | 'uia-remote' | 'pigeon' | 'orchestrator';
interface PullRequest {
  /* …existing… */
  comments: { id: number; author: string; path: string | null; line: number | null; body: string; reason?: string }[]; // NEW
  verdict: 'NONE' | 'APPROVED' | 'CHANGES_REQUESTED';                                                                 // NEW
  reviewDuePhysMs: number | null;   // NEW — scripted reviewer acts at this time (§3.22)
  headSha: string;                   // NEW
}
```

### 1.12 Jenkins, runners and local runs

```ts
interface JenkinsState {
  up: boolean;                       // jenkins service on jenkins-vm
  url: 'http://jenkins.lab.local:8080';
  jobs: Record<string, JenkinsJob>;  // key = full path "Java/uia-remote-regression-flex"
  views: Record<string, { name: string; include: string }>;   // NEW — name → regex over job paths
  builds: Record<string, JenkinsBuild>;   // key "<jobPath>#<n>"; cap 20 per job (oldest pruned)
  queue: string[];                   // build ids waiting for an executor
  executors: 8;                      // §3.18.1
  nextBuildNumber: Record<string, number>;   // NEW — per job; seeded (e.g. uia-remote-regression-flex → 4120)
}

interface JenkinsJob {
  id: string;                        // "Java/uia-remote-regression-flex"
  folder: 'Java' | 'iOS';            // legacy platform split (Ref §1). Every job lives in exactly one.
  name: string;
  views: string[];                   // NEW — derived from JenkinsState.views
  description: string;
  runner: 'uia-remote' | 'pigeon' | 'go-sdk' | 'laz' | 'vision' | 'ios';
  platform: 'android' | 'windows' | 'rest' | 'ios' | 'go';
  params: JobParam[];                // definitions
  savedParams: Record<string, string>;   // NEW — values used by "Build" (scheduled/pipeline triggers); "Build with Parameters" overrides
  script: string;                    // NEW — Jenkinsfile text (editable via Configure); the sim parses it (§3.18.2)
  capabilityLookup: 'DYNAMIC_JSON' | 'NON_DYNAMIC' | 'BOTH';
  requiredCapabilities: string[];    // derived from script (display only)
  testRef: { repo: RepoId; path: string } | null;
  schedule: string | null; scheduleEveryMs: number | null; nextScheduledMs: number | null;
  buildIds: string[];
  disabled: boolean;
  exists: boolean;                   // NEW — false after delete (kept for audit/history)
}

interface JenkinsBuild {
  id: string; jobId: string; number: number;
  params: Record<string, string>;
  env: Record<string, string>;       // injected env (ALL CAPS keys; enum values ALL CAPS)
  envMasked: Record<string, string>; // NEW — what the console prints (secrets "****")
  state: 'queued' | 'running' | 'finished';
  result: 'SUCCESS' | 'FAILURE' | 'UNSTABLE' | 'ABORTED' | null;
  queuedMs: number; startedMs: number | null; finishedMs: number | null;   // game-clock stamps
  stages: BuildStage[];
  console: string[];                 // cap 400 lines (middle elided "… N lines skipped …")
  robotId: number | null;
  failureCode: string | null;        // machine code, §3.18.6
  triggeredBy: string;
  cursor: number;                    // runner program counter
  waitUntilMs: number | null;        // physMs
  runner: RunnerState;               // NEW §3.19
}
interface BuildStage { name: string; status: 'pending'|'running'|'success'|'failed'|'skipped'; startedMs: number|null; durationMs: number|null; }

interface RunnerState {              // NEW — shared by Jenkins builds and local runs
  kind: 'uia-remote' | 'pigeon' | 'go-sdk' | 'laz' | 'vision' | 'ios';
  steps: RunnerStep[];               // compiled plan (§3.19–3.21)
  pc: number;
  vars: Record<string, string>;      // Pigeon stored outputs, env
  focus: 'MFD' | 'CFD' | 'DEVICE' | null;
  handles: { mfd: string | null; cfd: string | null };   // "ip:port" actually connected (may be a coworker device!)
  waitingFor: null | { what: string; untilPhysMs: number; timeoutLabel: string };
  passedSteps: number; totalSteps: number;
}
interface RunnerStep { id: string; label: string; role: 'MFD' | 'CFD' | 'DEVICE' | 'ORCA' | 'SETUP'; op: string;
  args: Record<string, string | number | boolean>; }

interface LocalRunState {            // NEW — IntelliJ ▶ runs on the workstation
  runs: Record<string, LocalRun>;
}
interface LocalRun { id: string; repo: 'uia-remote' | 'pigeon'; testName: string; testPath: string;
  robotName: string | null; startedMs: number; finishedMs: number | null; state: 'running' | 'finished';
  passed: boolean | null; failureCode: string | null; output: string[]; runner: RunnerState;
  overlappedJenkins: boolean; }      // a Jenkins build drove the same rig during this run (INC31)
```

### 1.13 Laz, Ubi

```ts
interface LazRun {
  id: string; deviceId: string; fromMerchantId: number | null; toMerchantId: number;
  step: 'queued'|'ubi-route'|'deprovision'|'wipe-cache'|'setup-wizard'|'assign-merchant'|'restore-adb'|'verify'|'done'|'failed';
  wizardPage: number;                // NEW 0..6
  progress: number; startedMs: number; stepEndsPhysMs: number | null;   // stepEndsPhysMs NEW
  log: string[]; error: string | null;
  buildId: string | null;            // NEW — owning Jenkins build, if any
  skipAdbRestore: boolean;           // NEW — fault laz.skipAdbRestore (INC28)
}
interface UbiState {                 // NEW
  routes: Record<string, { region: 'US-EAST' | 'CA-CENTRAL'; up: boolean }>;   // "us-east", "ca-central"
  log: string[];
}
```

### 1.14 Ollama, 3D printers, chat, faults

```ts
interface OllamaState {
  up: boolean;                       // mirror of ollama-vm service "ollama" (kept for compatibility)
  models: string[];                  // ["llava:latest"]
  requests: OllamaRequest[];         // cap 30
  receiptScenarios: Record<string, ReceiptScenario>;   // NEW — keyed by image ref, §3.21
}
interface OllamaRequest { id: string; model: string; prompt: string; image: string | null; response: string | null;
  correct: boolean | null; state: 'running' | 'done'; startedMs: number; donePhysMs: number; verdict: 'PASS'|'FAIL'|null; }
interface ReceiptScenario { imageRef: string; deviceId: string; subtotalCents: number; taxCents: number; tipPct: number;
  printedTipCents: number; misread: { field: 'tip' | 'total'; shownAs: string } | null; }

interface Printer3dState { printers: Record<'prusa' | 'bambu', { busy: boolean; job: string | null; endsPhysMs: number | null }>;
  output: string[]; }                // printed parts waiting on the tray: "cradle_flex_gen3"

interface ActiveFault { id: string; faultId: string; params: Record<string, string | number | boolean>;
  injectedMs: number; cleared: boolean; clearedMs: number | null;
  clearedBy: 'condition' | 'api' | null; undo: unknown[] }   // clearedBy/undo NEW — undo = JSON patches to revert (§4.1)
```

### 1.15 Additions made while specifying §4–§6 (NEW)

```ts
interface ActiveFault {                 // replaces the §1.14 sketch (all fields required)
  id: string; faultId: string;
  target: string;                       // value of the fault's target param, or "lab"
  params: Record<string, string | number | boolean | string[]>;
  injectedMs: number; cleared: boolean; clearedMs: number | null;
  clearedBy: 'condition' | 'api' | null;
  clearedByActor: string | null;        // who called faults.clear
  undo: FaultUndoPatch[];               // §4.1.3 #5
  holdSincePhysMs: number | null;       // §4.1.7
}
interface FaultUndoPatch { path: (string | number)[]; before: unknown; after: unknown; }

// RigState
assembly: 'complete' | 'rebuild';       // rig.rebuild (INC07); 'rebuild' ⇒ motionFault forced (§4.3.3)
dipArmToothOffset: number;              // 0 = aligned; dipArmAligned mirrors (offset == 0)
webcam.aimOffsetDeg: { yaw: number; pitch: number };   // aimedOk mirrors |yaw|,|pitch| ≤ 1.5°

// TerminalDevice
firmwareInfo: { version: string; receiptQr: boolean };  // authoritative; `firmware` mirrors version
lastReceiptDoc: ReceiptDoc | null;                      // authoritative; `lastReceipt` mirrors the text
battery: { pct: number; charging: boolean } | null;     // handhelds (FLEX_*, FLEX_POCKET), §3.8.1
state: 'OK' | 'BOOTING' | 'DEAD' | 'FRIED';             // derived view (§0.4), recomputed each tick
interface ReceiptDoc {
  merchantName: string; address: string; printedAtMs: number; orderId: string;
  lines: { name: string; qty: number; priceCents: number }[];
  subtotalCents: number; taxCents: number; taxRateBp: number;
  cardAdjustCents: number; cardAdjustBp: number; tipCents: number; tipPct: number | null; totalCents: number;
  currency: 'USD' | 'CAD'; brand: CardBrand | null; panLast4: string | null; entry: CardEntry | null;
  authCode: string | null; approved: boolean; qr: boolean;   // qr: printed from the 5-option flow
}

// JenkinsJob
merchantPolicy: 'swap' | 'assert' | 'none';   // §3.17.1; Laz and robot-less jobs: 'none'

// SeqCounters (§1.1) — also `event` (§0.4), `timer` (§6.2), `request` (Orca request ids, xy_touch / card)

// Smaller additions made in the contract files
RobotNote.lastAtMs: number;                    // game ms of the newest repeat (" (×3, last 08:25:00)")
NetworkState.attempts: Record<string, number>; // per-host connection attempts (DAMAGED parity, §1.9)
DcTerminal.energised: boolean;                 // computed each tick (§3.13.1 #6)
CollisProbe.armed.expiresPhysMs: number;       // arm timeout (§3.6 #9)
OrderState.tipPct: number | null;              // for the receipt "Tip (18%)" line
LocalRun.configPath: string;                   // config.properties used (local clone or Code With Me)
PrComment.atMs: number;                        // game ms
```

Rules introduced with these fields:

* **Supply mirror.** For a physically modelled load (Pis, NUC/Minix bricks, device PSUs, Collis PSUs)
  `power.loads[<loadId>].supply` is authoritative and `hosts[...]`/`devices[...]`/`collis[...]`
  `.supply` mirror it (load ids: `pi-<rig>`/host id for Pis and boxes, `psu-<orca device name>` for
  devices, `psu-collis-<rig>` for probes). Off-screen hosts and devices have no load; their own
  `.supply` is authoritative.
* **Spare devices.** `dev-spare-flex2` (`SIM-F2-000015`, Husky drawer 2) and `dev-spare-mini3`
  (`SIM-M3-000122`, Husky drawer 3) exist at factory, unpowered, `orcaDeviceName: ''`, `ip` assigned
  when seated on a rig (the rig position's IP, §2.4).
* **Serial binding.** `orca.saveDevice` sets the row's `simDeviceId` to the runtime device whose
  `serial` equals the row's serial (exact), else `null`, and sets that device's `orcaDeviceName` to the
  row's `name`.
* **Code With Me.** `~/CodeWithMe/<person>/uia-remote/` is a read-write mirror of a colleague's clone
  on the workstation [illus.]; local runs can use its `config.properties` (`runner.runLocal` option
  `configPath`) — INC29.
* **Webcam aim.** `rig.aimWebcam(rig, dYawDeg, dPitchDeg)` adds to `aimOffsetDeg`; frame offset
  `+6.67 px/°` yaw, `+6.25 px/°` pitch (§3.12.1 #4).

---
## 2. Seed data

All seed values are **[illus.]** unless they come from canon, Ref, Cur §0.3–§0.6 or GP §3.1. Where
GP §3.1 fixed a value (IPs, device rows, Callus boxes, fuses, strips, merchants, card profiles) it is
reused verbatim. Off-screen rigs (13–42) are new in this doc.

### 2.1 Calendar and presets

| Item | Value |
|---|---|
| `time.epochDate` | `2026-10-05` (Monday). `dateLabel` = `MON, OCT 5`. Lock screens and tablets show `h:mm AM/PM` + `MON, OCT 5`. |
| Day start | Arcade Shift: `startHour = 8` (`nowMs = 28_800_000`, GP §2.3.2). Academy and Free Play: `startHour = 9`. Cert practicals: 8. |
| First health check | next multiple of 300 000 strictly after `nowMs` (08:05 for a shift starting 08:00). |
| `GortCardSync` | daily at 10:00 on every Windows box (`schtasks` "Next Run Time"). `lastRunMs` seeded to yesterday 15:20 (`-31_200_000`, Riley's manual `schtasks /run` after adding the Interac tap card, §2.9) with result 0. |
| Nightly trigger | `Java/nightly-java-regression` at 02:00 (never reached inside a session; history seeded). |
| Riley's stale reservation (INC48 seed only) | `reservedAtMs = -22_680_000` → `2026-10-04 17:42`. |

**Presets** (`sim.reset({ preset })`):

| Preset | Content |
|---|---|
| `factory` | Everything in §2.2–§2.14 exactly. Flags: `receiptQrFeature: true`, `uiaVersion: '2.3'`, `softwarePinBypass: false`, `showTouchTargets: false`, `cfdLayoutV2Toggle: false`. This is GP §3.1's "Arcade / Free Play factory state". |
| `arcade` | `factory`, `config.mode='arcade'`, `damageModel='arcade'`, `startHour=8`, `timeScale=5`. |
| `freeplay` | `factory`, `config.mode='freeplay'`, `damageModel='full'`, `forceHealthCheckAllowed=true`, `startHour=9`. |
| `academy:<Mnn>` | `factory` + that module's Setup row (Cur §2) expressed as fault/setup ops from §4.4.2, `damageModel='academy'`, `forceHealthCheckAllowed=true`, `startHour=9`. |
| `cert` | `factory`, `timeScale=1`, `forceHealthCheckAllowed=false`, `damageModel='arcade'`. |
| `test` | `factory`, `config.mode='test'`, `pipelinesEnabled=false`, `npcAutoMerge=false`, seed `20261005`. |

Default seed: `20261005`. Arcade passes its shift seed (GP §2.3.1/§4.6).

### 2.2 Device Type enum metrics (`DeviceTypeInfo`, Orca `DeviceType`)

Screen sizes and resolutions are [illus.] (the reference gives none); Ref/canon facts are the
family, profile sharing, printers (Pocket and Duo 2 printerless), dual-screen ADB blindness, upcoming
models and the Compact's market.

| `code` | Display name | Family (`config.properties deviceType`) | Testing profile | Primary screen (orientation) mm · px · in | px/mm (x / y) | Secondary (CFD) | Printer | Launcher scroll | Dual-screen, single ADB | Upcoming | Market |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `STATION_2018` | Station (2018) | Station | `STATION_2018` | landscape 309.9 × 174.3 · 1366 × 768 · 14.0 | 4.408 / 4.406 | — | yes | horizontal | no | no | US |
| `STATION_2` | Station 2 | Station | `STATION_2` | landscape 309.9 × 174.3 · 1920 × 1080 · 14.0 | 6.196 / 6.196 | — | yes | horizontal | no | no | US |
| `STATION_DUO` | Station Duo | Station | `STATION_DUO` | landscape 309.9 × 174.3 · 1920 × 1080 · 14.0 | 6.196 / 6.196 | 172.3 × 107.7 · 1280 × 800 · 8.0 | yes | horizontal | **yes** | no | US |
| `STATION_DUO_2` | Station Duo 2 | Station | `STATION_DUO` | as Duo | as Duo | as Duo | **no** | horizontal | **yes** | no | US |
| `STATION_DUO_3` | Station Duo 3 | Station | `STATION_DUO` | as Duo | as Duo | as Duo | no | horizontal | yes | **yes** | US |
| `MINI_2` | Mini (2nd gen) | Mini | `MINI_GEN2` | landscape 154.2 × 90.4 · 1024 × 600 · 7.0 | 6.641 / 6.637 | — | yes | horizontal | no | no | US |
| `MINI_3` | Mini (3rd gen) | Mini | `MINI_GEN3` | landscape 172.3 × 107.7 · 1280 × 800 · 8.0 | 7.429 / 7.428 | — | yes | horizontal | no | no | US |
| `MINI_4` | Mini 4 | Mini | `MINI_GEN3` | as Mini 3 | as Mini 3 | — | yes | horizontal | no | **yes** | US |
| `FLEX_1` | Flex (1st gen) | Flex | `FLEX_GEN1` | portrait 62.3 × 110.7 · 720 × 1280 · 5.0 | 11.557 / 11.563 | — | yes | vertical | no | no | US |
| `FLEX_2` | Flex (2nd gen) | Flex | `FLEX_GEN2` | portrait 68.0 × 121.0 · 720 × 1280 · 5.5 | 10.588 / 10.579 | — | yes | vertical | no | no | US |
| `FLEX_3` | Flex 3 | Flex | `FLEX_GEN3` | portrait 76.0 × 135.0 · 720 × 1280 · 6.1 | 9.474 / 9.481 | — | yes | vertical | no | no | US |
| `FLEX_4` | Flex 4 | Flex | `FLEX_GEN3` | as Flex 3 | as Flex 3 | — | yes | vertical | no | no | US |
| `FLEX_POCKET` | Flex Pocket | Flex | `FLEX_GEN3` | as Flex 3 | as Flex 3 | — | **no** (printer block omitted) | vertical | no | no | US |
| `COMPACT` | LabSim Compact | Compact | `COMPACT` | portrait 62.3 × 110.7 · 720 × 1280 · 5.0 | 11.557 / 11.563 | — | no [illus.] | vertical | no | no | **CA** (Westers) |

Rules derived from the table:
* **Same testing profile ⇒ identical firmware layout** (FLEX_3/FLEX_4/FLEX_POCKET share `FLEX_GEN3`; the
  Pocket's Print receipt row is rendered but disabled, §3.9.6). Orca still stores Screens **per Device
  Type** (separate rows per type, identical values) — INC20 must fix FLEX_3 rows independently.
* Hot-swap equivalence (Ref §1): `MINI_3` is the hot-swap equivalent for the printerless `STATION_DUO_2`;
  the sim encodes it as `DeviceTypeInfo.hotSwapFor = ['STATION_DUO_2']` on `MINI_3` (informational;
  Jenkins does not auto-substitute — the engineer re-runs with `DEVICE_TYPE=MINI_3`, INC44).
* `config.properties deviceType` accepts exactly `Mini`, `Flex`, `Station`, `Compact` (the uia-remote
  runner maps `Compact` to vertical launcher logic). Anything else (`FLEX_4`, `flex`) ⇒
  `java.lang.IllegalArgumentException: unknown deviceType "FLEX_4" (expected Mini, Flex or Station)`.
* Body sizes for 3D (mm, w×h×d) [illus.]: Station 330×255×230, Duo 330×255×300, Mini 2 205×150×150,
  Mini 3/4 220×165×160, Flex 1 85×190×60, Flex 2 85×200×60, Flex 3/4 88×210×62 (printer hump),
  Pocket 82×168×18, Compact 180×140×120.

### 2.3 Robot roster (Orca `robots`, 42 rows)

Columns: **Pi** = the Robot Pi host whose REST serves this rig (`http://<pi>:8000`). URL mappings follow
one pattern: `adbServiceUrl = http://<pi>:8000/adb`; for card rigs `dipUrl/tapUrl/swipeUrl =
http://<pi>:8000/dip|tap|swipe`; tethered rigs have only `swipeUrl` (SmartStripe probe); ADB bots
have none (`null`). `Cam` = Camera Stream URL host (`http://<host>:8081/stream.mjpg`; `—` = empty
string). **D/T/S** = which of Dip/Tap/Swipe are mapped. Offsets are `0.0 / 0.0` on every row
(Jared's true-(0,0) calibration). Physical rows 1–12 = GP §3.1 verbatim.

| id | Name | HRN | Kind | Env | Location | Status | Robot Device (type, IP `10.42.30.x`) | MFD / CFD | Pi `10.42.10.x` | Cam | D/T/S | Callus | Merchant | Linked capabilities |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `wall-e` | WALL-E | touch | DEV1 | Rack A · U33–U36 | AVAILABLE | `wall-e-flex3` (FLEX_3, .11) | — | .11 | .11 | D T S | MINIX-01 | AUTO-US-NOPIN-01 | DIP, TAP, SWIPE |
| 2 | `eve` | EVE | touch | DEV1 | Rack A · U29–U32 | AVAILABLE | `eve-flex4` (FLEX_4, .12) | — | .12 | .12 | D T S | MINIX-01 | AUTO-US-NOPIN-01 | DIP, TAP, SWIPE |
| 3 | `bumblebee` | BUMBLEBEE | touch | DEV1 | Rack A · U25–U28 | AVAILABLE | `bumblebee-mini3` (MINI_3, .13) | — | .13 | .13 | D T S | MINIX-01 | AUTO-US-NOPIN-01 | DIP, TAP, SWIPE |
| 4 | `r2-d2` | R2-D2 | touch (probe on CFD) | DEV1 | Rack A · U21–U24 | AVAILABLE | `r2-d2-duo` (STATION_DUO, .14) | `r2-d2-duo` / `r2-d2-duo` (**same row ⇒ same IP**) | .14 | .14 (aimed at CFD) | D T S | MINIX-01 | AUTO-US-NOPIN-01 | DIP, TAP, SWIPE, OCR_CAMERA |
| 5 | `johnny-5` | JOHNNY-5 | touch | DEV1 | Rack B · U33–U36 | AVAILABLE | `johnny-5-flex1` (FLEX_1, .15) | — | .15 | .40 (Rack B shared) | D T S | MINIX-02 | AUTO-US-NOPIN-01 | DIP, TAP, SWIPE |
| 6 | `baymax` | BAYMAX | touch | DEV1 | Rack B · U29–U32 | AVAILABLE | `baymax-st2018` (STATION_2018, .16) | — | .16 | .40 | D T S | MINIX-02 | AUTO-US-NOPIN-01 | DIP, TAP, SWIPE |
| 7 | `seti` | SETI | touch (Westers) | DEV1 | Rack B · U25–U28 | AVAILABLE | `seti-compact` (COMPACT, .17) | — | .17 | .40 | D T S | MINIX-02 | WESTERS-CA-01 | DIP, TAP, SWIPE, INTERAC |
| 8 | `rosie` | ROSIE | standalone (PayCore) | DEV1 | Rack B · U21–U24 | **UNAVAILABLE** | `rosie-pocket` (FLEX_POCKET, .18) | — | .18 | .40 | D T S | MINIX-02 | PAYCORE-STANDALONE-01 | DIP, TAP, SWIPE, CARD_MATRIX |
| 9 | `megatron` | MEGATRON | tethered (Station 2 → Mini 2) | DEV1 | Tethered rack | AVAILABLE | `megatron-mfd` (STATION_2, .21) | `megatron-mfd` / `megatron-cfd` (MINI_2, .22) | .20 (shelf Pi, shared) | .20 | S | MINIX-02 | AUTO-US-NOPIN-01 | SWIPE |
| 10 | `optimus` | OPTIMUS | tethered (nested Mini 3s) | STG | Tethered rack | AVAILABLE | `optimus-mfd` (MINI_3, .23) | `optimus-mfd` / `optimus-cfd` (MINI_3, .24) | .20 | .20 | S | MINIX-02 | AUTO-US-NOPIN-01 | SWIPE |
| 11 | `data` | DATA | adb | DEV1 | ADB shelf | AVAILABLE | `data-mini3` (MINI_3, .31) | — | .30 (shared) | — | — | — | AUTO-US-NOPIN-01 | GO_SDK |
| 12 | `tars` | TARS | adb | DEV1 | ADB shelf | AVAILABLE | `tars-flex4` (FLEX_4, .32) | — | .30 | — | — | — | AUTO-US-NOPIN-01 | GO_SDK |
| 13 | `vision` | VISION | adb | DEV1 | Rack C (off-screen) | AVAILABLE | `vision-pocket` (FLEX_POCKET, .50) | — | .50 | .50 | — | — | AUTO-US-NOPIN-01 | GO_SDK |
| 14 | `k-9` | K-9 | adb | DEV1 | Rack C | AVAILABLE | `k-9-duo2` (STATION_DUO_2, .51) | — | .51 | — | — | — | AUTO-US-NOPIN-01 | — |
| 15 | `soundwave` | SOUNDWAVE | touch | QA | Rack C | AVAILABLE | `soundwave-flex3` (FLEX_3, .52) | — | .52 | .60 (Rack C shared) | D T S | MINIX-03 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE |
| 16 | `starscream` | STARSCREAM | touch | QA | Rack C | AVAILABLE | `starscream-flex4` (FLEX_4, .53) | — | .53 | .60 | D T S | MINIX-03 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE |
| 17 | `ratchet` | RATCHET | touch | QA | Rack C | AVAILABLE | `ratchet-mini3` (MINI_3, .54) | — | .54 | .60 | D T S | MINIX-03 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE |
| 18 | `c-3po` | C-3PO | touch (probe on CFD) | QA | Rack C | AVAILABLE | `c-3po-duo` (STATION_DUO, .55) | `c-3po-duo` / `c-3po-duo` | .55 | .60 | D T S | MINIX-03 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE, OCR_CAMERA |
| 19 | `bb-8` | BB-8 | tethered (nested Mini 3s) | DEV2 | Rack D | AVAILABLE | `bb-8-mfd` (MINI_3, .61) | `bb-8-mfd` / `bb-8-cfd` (MINI_3, .62) | .61 | .61 | S | MINIX-03 | AUTO-US-NOPIN-02 | SWIPE |
| 20 | `bender` | BENDER | standalone (PayCore · LabSim Dining) | STG | PayCore bench | **UNAVAILABLE** | `bender-st2` (STATION_2, .63) | — | .63 | .63 | D T S | MINIX-03 | PAYCORE-DINING-01 | DIP, TAP, SWIPE, lab_dining, CARD_MATRIX |
| 21 | `marvin` | MARVIN | tethered (Station 2 → Mini 3) | QA | Rack D | AVAILABLE | `marvin-mfd` (STATION_2, .64) | `marvin-mfd` / `marvin-cfd` (MINI_3, .65) | .64 | .64 | S | MINIX-03 | AUTO-US-NOPIN-02 | SWIPE |
| 22 | `robby` | ROBBY | tethered (nested Mini 3s) | DEV2 | Rack D | **OFFLINE** (note: "Assembling data profiles — Jared") | `robby-mfd` (MINI_3, .66) | `robby-mfd` / `robby-cfd` (MINI_3, .67) | .64 (shared with MARVIN) | .64 | S | MINIX-03 | AUTO-US-NOPIN-02 | SWIPE |
| 23 | `hal` | HAL | adb | QA | ADB rack 2 | AVAILABLE | `hal-st2` (STATION_2, .70) | — | .70 (shared ×3) | — | — | — | AUTO-US-NOPIN-02 | — |
| 24 | `bishop` | BISHOP | adb | QA | ADB rack 2 | AVAILABLE | `bishop-mini2` (MINI_2, .71) | — | .70 | — | — | — | AUTO-US-NOPIN-02 | — |
| 25 | `ash` | ASH | adb | QA | ADB rack 2 | AVAILABLE | `ash-flex2` (FLEX_2, .72) | — | .70 | — | — | — | AUTO-US-NOPIN-02 | — |
| 26 | `sonny` | SONNY | adb | QA | ADB rack 2 | **CONNECTION_FAILED** (pre-failure AVAILABLE; off-screen Pi .74 hung since 07:55; note "Escalated to Jared — SD card reflash pending") | `sonny-flex3` (FLEX_3, .73) | — | .74 | — | — | — | AUTO-US-NOPIN-02 | — |
| 27 | `chappie` | CHAPPIE | touch | QA | Rack E | AVAILABLE | `chappie-flex4` (FLEX_4, .75) | — | .75 | .79 (Rack E shared) | D T S | MINIX-04 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE |
| 28 | `case` | CASE | touch | QA | Rack E | AVAILABLE | `case-mini3` (MINI_3, .76) | — | .76 | .79 | D T S | MINIX-04 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE |
| 29 | `atlas` | ATLAS | touch | QA | Rack E | AVAILABLE | `atlas-st2018` (STATION_2018, .77) | — | .77 | .79 | D T S | MINIX-04 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE |
| 30 | `astro` | ASTRO | touch + phone carriage (iOS Go SDK mobile runner) | QA | Rack E | AVAILABLE | `astro-flex4` (FLEX_4, .78) | — | .78 | .79 | D T S | MINIX-04 | GO-SDK-US-01 | DIP, TAP, SWIPE, GO_SDK, PHONE |
| 31 | `iron-giant` | IRON-GIANT | touch (probe on CFD) | QA | Rack F | AVAILABLE | `iron-giant-duo2` (STATION_DUO_2, .80) | `iron-giant-duo2` / `iron-giant-duo2` | .80 | .80 | D T S | MINIX-04 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE, OCR_CAMERA |
| 32 | `voltron` | VOLTRON | tethered (Station 2 → Mini 2) | INT | Rack D | AVAILABLE | `voltron-mfd` (STATION_2, .81) | `voltron-mfd` / `voltron-cfd` (MINI_2, .82) | .81 | .81 | S | MINIX-03 | AUTO-US-NOPIN-02 | SWIPE |
| 33 | `kryten` | KRYTEN | standalone (PayCore) | STG | PayCore bench | **UNAVAILABLE** | `kryten-flex3` (FLEX_3, .83) | — | .83 | .83 | D T S | MINIX-03 | PAYCORE-STANDALONE-01 | DIP, TAP, SWIPE, CARD_MATRIX |
| 34 | `mazinger` | MAZINGER | touch | DEV2 | Rack F | AVAILABLE | `mazinger-mini2` (MINI_2, .84) | — | .84 | .84 | D T S | MINIX-04 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE |
| 35 | `jarvis` | JARVIS | adb | DEV2 | ADB rack 2 | AVAILABLE | `jarvis-mini3` (MINI_3, .85) | — | .85 (shared ×2) | — | — | — | AUTO-US-NOPIN-02 | — |
| 36 | `ultron` | ULTRON | adb | DEV2 | ADB rack 2 | AVAILABLE | `ultron-pocket` (FLEX_POCKET, .86) | — | .85 | — | — | — | AUTO-US-NOPIN-02 | — |
| 37 | `dalek` | DALEK | touch | QA | Rack F | **OFFLINE** (note: "Flex 1 parked; rebuild queued — J") | `dalek-flex1` (FLEX_1, .87) | — | .87 | .87 | D T S | MINIX-04 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE |
| 38 | `number-5` | NUMBER-5 | touch | QA | Rack F | AVAILABLE | `number-5-flex2` (FLEX_2, .88) | — | .88 | .88 | D T S | MINIX-04 | AUTO-US-NOPIN-02 | DIP, TAP, SWIPE |
| 39 | `gerty` | GERTY | touch (Westers) | QA | Westers bench | AVAILABLE | `gerty-compact` (COMPACT, .89) | — | .89 | .89 (shared ×2) | D T S | MINIX-05 | WESTERS-CA-02 | DIP, TAP, SWIPE, INTERAC |
| 40 | `mother` | MOTHER | touch (Westers) | QA | Westers bench | **RESERVED** (`morgan`, 07:40) | `mother-compact` (COMPACT, .90) | — | .90 | .89 | D T S | MINIX-05 | WESTERS-CA-01 | DIP, TAP, SWIPE, INTERAC |
| 41 | `brainiac` | BRAINIAC | adb | DEV2 | ADB rack 2 | AVAILABLE | `brainiac-duo` (STATION_DUO, .91) | — | .91 | — | — | — | AUTO-US-NOPIN-02 | — |
| 42 | `zorg` | ZORG | tethered (Mini 3 → Mini 2) | QA | Rack D | AVAILABLE | `zorg-mfd` (MINI_3, .92) | `zorg-mfd` / `zorg-cfd` (MINI_2, .93) | .92 | .92 | S | MINIX-03 | AUTO-US-NOPIN-02 | SWIPE |

Design notes (why the off-screen pool looks like this):
* **Environment isolates the lab room's pipelines.** Every rig the Arcade pipelines PL1–PL8 must use
  is `DEV1` (OPTIMUS `STG`); off-screen rigs are `QA`/`DEV2`/`INT`/`STG` so GP §2.3.5 "default eligible
  rigs" hold exactly (§3.4.2 checks the build's `BACKEND_ENV`). VISION and K-9 are `DEV1` on purpose
  (INC23, INC44).
* Shared resources: Camera URL shared by 4 rigs (Rack B `.40`, Rack C `.60`, Rack E `.79`), Pi shared by
  2–3 rigs (`.20`, `.30`, `.64`, `.70`, `.85`), Duo rigs whose MFD = CFD row (`r2-d2`, `c-3po`,
  `iron-giant`), a Duo used standalone (`k-9`, `brainiac`: MFD empty), Station 2 → Mini 2 tethers
  (`megatron`, `voltron`), nested Mini 3s (`optimus`, `bb-8`, `robby`).
* One rig in every non-Available status at factory: UNAVAILABLE (`rosie`, `bender`, `kryten`), OFFLINE
  (`robby`, `dalek`), CONNECTION_FAILED (`sonny`), RESERVED (`mother`). Tate's status filter always has
  something to show.
* Factory audit/notes seeds: `sonny` HEALTH note `2026-10-05 07:55:00 GET http://10.42.10.74:8000/health → connect timed out after 10000 ms`
  and MANUAL note `2026-10-05 08:02:11 Escalated to Jared — SD card reflash pending (tate)`;
  `robby`/`dalek` STATUS notes from the previous week.

Physical placement (`RigState`, world binding): `probeDisplay` = `'primary'` for touch/standalone rigs,
`'secondary'` for `r2-d2`, `c-3po`, `iron-giant` (their gantry sits over the CFD; the MFD is driven
by ADB), `null` for tethered and ADB rigs. `hasGantry` = touch/standalone. Tablet `hrnShown` = HRN.
`motionHost = 'PI'` everywhere. `cradle = 'OK'`, `dipArmAligned = true`, `solenoidConnector = 'SEATED'`,
`mainSwitch = motorSwitch = true`, `steppersEnabled = true`, parked & homed at (0,0), lock engaged,
banner green, door closed. ASTRO has `phone.mounted = "iPhone (Go SDK mobile runner)"`.

### 2.4 Device rows (Orca `devices`) and runtime devices

Device rows `id` 1… in roster order (MFD before CFD). Serial pattern `SIM-<model>-0000<last octet>`
(`F1 F2 F3 F4 FP M2 M3 S18 S2 SD SD2 CP`), e.g. `SIM-F3-000011`, `SIM-S2-000021`, `SIM-M3-000031`
(GP/Cur values preserved). Extra rows:

| Orca row | Type | Serial | IP | Notes |
|---|---|---|---|---|
| (none at factory) | FLEX_2 | `SIM-F2-000015` | — | Physical spare Flex 2 in the Husky chest drawer 2 (`rigId: 'husky-drawer-2'`, unpowered). INC42 / Cur M07 create the Orca row `johnny-5-flex2`. |
| `retired-flex1-legacy` | FLEX_1 | `SIM-F1-000099` | 10.42.30.99 | `retired: true` (history flavour; shows the Retired filter) |
| (none at factory) | MINI_3 | `SIM-M3-000122` | — | Physical spare Mini 3 in the Husky chest drawer 3 (`rigId: 'husky-drawer-3'`, unpowered) — the CFD upgrade for MEGATRON (Mini 2 → Mini 3) in CERT P2-2. |

Spare runtime ids (§1.15): `dev-spare-flex2` (`SIM-F2-000015`) and `dev-spare-mini3`
(`SIM-M3-000122`); `orcaDeviceName = ''` until an Orca Device row with the same serial exists.

Runtime `TerminalDevice` seeds (every row with `simDeviceId`): `power: 'on'`, `adbTcpPort: 5444`,
`provisioned: true`, `merchantConfigId` = robot's merchant, `firmwareInfo: { version: '2.26.10.1',
receiptQr: true }` (`'2.26.08.3'`/`false` when `flags.receiptQrFeature` is off). **Exception:
FLEX_1** runs end-of-life firmware `'2.19.4'` that never gets the QR feature (`receiptQr: false`
always) [illus.] — so JOHNNY-5 shows 4 receipt options while the other receipt rigs show 5 (INC22 vs
INC20). `launcher.page: 0`,
`display.screen: 'home'` (tethered CFDs and Duo CFDs: `'customer-idle'`), `printer.paper: true` where
the type has a printer, `cfdLayout: 'v1'`, `labelShiftPx: 0`, `payDisplayApp`: MEGATRON/VOLTRON
`USB_PAY_DISPLAY` (`link: 'usb'`), OPTIMUS/BB-8/ROBBY/MARVIN/ZORG `SECURE_NETWORK_PAY_DISPLAY`
(`link: 'network'`) [illus. split], `payDisplayLink: 'UP'`, `hubEthernet: true`, `hubUsbToPeer: true`.

**Coworker desk devices** (in `devices`, not in Orca; `adbTcpPort = 5555`, the ADB default):

| id | Type | IP | Owner | Desk | Screen |
|---|---|---|---|---|---|
| `dev-riley-desk-flex` | FLEX_3 | 10.42.60.4 | Riley (`npc.coworker`) | `desk-riley` | home |
| `dev-sam-desk-mini` | MINI_3 | 10.42.60.5 | Sam | `desk-sam` | home |
| `dev-alex-desk-flex` | FLEX_4 | 10.42.60.6 | Alex | `desk-alex` | lock |

Device library (`loc.device-library`): one unpowered device per model (14 incl. sealed "UPCOMING"
boxes for STATION_DUO_3 and MINI_4, which have no `TerminalDevice` — props only).

### 2.5 Hosts

#### 2.5.1 Host table

| id | Kind | Hostname (prompt) | IP | Services (port) | Disk | Notes |
|---|---|---|---|---|---|---|
| `pi-wall-e` … `pi-rosie` | pi | `wall-e` … `rosie` (`pi@wall-e:~ $`) | 10.42.10.11–.18 | `sshd` 22 · `robot-controller` 8000 · `camera-stream` 8081 (WALL-E, EVE, BUMBLEBEE, R2-D2 only — Rack B rigs use the shared camera) · `adb-service` · `cardprog` (Wine) | 29 GB, 6.1 GB used (22 %) | Raspberry Pi 4 in black case; powered from its rig's MAIN terminal |
| `pi-tethered` | pi | `tethered-pi` | 10.42.10.20 | sshd · robot-controller · camera-stream · adb-service | 29 GB / 5.4 GB | serves MEGATRON + OPTIMUS; USB: 2× SmartStripe probes |
| `pi-adb-shelf` | pi | `adb-shelf-pi` | 10.42.10.30 | sshd · robot-controller · adb-service | 29 GB / 5.2 GB | serves DATA + TARS; USB ADB to `SIM-M3-000031`, `SIM-F4-000032` |
| `pi-cam-rackb` | pi | `rackb-cam` | 10.42.10.40 | sshd · camera-stream | 29 GB / 4.9 GB | camera-only Pi (GP §3.1) |
| `pi-<offscreen>` | pi | rig name or `rackc-cam`, `racke-cam`, `adb2-pi`, … | 10.42.10.50–.92 | as their role | — | `offscreen: true`; no power graph (always powered unless a fault targets it) |
| `minix-01` | minix | `MINIX-01` (`automation@MINIX-01 C:\Users\automation>`) | 10.42.20.1 | `callus` 9000 · `corporate-agent` · OpenSSH 22 · task `GortCardSync` | 64 GB eMMC, 39.0 GB used (61 %) | front blue LED + small status screen: `Callus service · listening on :9000 · probes: WALL-E, EVE, BUMBLEBEE, R2-D2` |
| `minix-02` | minix | `MINIX-02` | 10.42.20.2 | same | 64 GB / 38.6 GB | probes: JOHNNY-5, BAYMAX, SETI, ROSIE + SmartStripe MEGATRON, OPTIMUS |
| `nuc-03` | nuc | `NUC-03` | 10.42.20.3 | `corporate-agent` · OpenSSH 22 · `callus` (disabled) · `motion` 9100 (disabled) | **237.9 GB, 237.9 GB used (100 %)** — `C:\ProgramData\SecAgent\logs` 118.4 GB | Intel NUC on the 12 V line; sticky note "DISK 100% — corporate AGENT. NO HARDWARE CONTROL ON THIS BOX. –J" |
| `minix-03` / `-04` / `-05` | minix | `MINIX-03` … | 10.42.20.4 / .5 / .6 | callus · corporate-agent | 64 GB / ~60 % | off-screen |
| `gpu-blade` | blade | `gpu-blade` | 10.42.1.5 | hypervisor | — | 4× NVIDIA GPU: slots 1–2 exposed on top, 3–4 underneath; replaced the retired tower |
| `orca-vm` | vm | `orca` (alias `orca.lab.local`) | 10.42.1.10 | `orca` 8080 · `mysql` 3306 · sshd | 100 GB / 41 % | Spring Boot (JHipster) + MySQL schema `orca` |
| `jenkins-vm` | vm | `jenkins` (alias `jenkins.lab.local`) | 10.42.1.11 | `jenkins` 8080 · sshd | 250 GB / 58 % | 8 executors |
| `ollama-vm` | vm | `ollama` | 10.42.1.12 | `ollama` 11434 · sshd | 500 GB / 33 % | model `llava:latest` |
| `ws-17` | workstation | `ws-17` (`engineer@ws-17:~$`) | 10.42.50.17 | adb server (on demand) | — | the player's PC |
| `switch-lab` | switch | — | 10.42.0.2 | — | — | never modelled in 3D |

SSH users (Cur S14, GP): Pis `pi`, Windows boxes and VMs `automation`. Passwords auto-fill in
Academy; Standard/Strict realism require `raspberry`-free key auth: the workstation already has keys
(`~/.ssh/id_ed25519`) [illus.] — `ssh` simply connects.

#### 2.5.2 Service start delays after OS boot completes (physical)

| Host kind | Service | Ready after |
|---|---|---|
| Pi (40 s boot) | network link + ICMP | t = 12 s from power-on |
| | `sshd` | 25 s |
| | `robot-controller` (port 8000) | 35 s |
| | `adb-service`, `cardprog` | 36 s |
| | `camera-stream` (8081) | 40 s (boot complete; ACT settles to irregular flicker) |
| Windows box (50 s boot) | network | 20 s |
| | OpenSSH | 40 s |
| | `callus` (9000) | 50 s (screen shows the Callus status line) |
| VM (45 s restart) | sshd 20 s · `mysql` 30 s · `orca` 45 s (then needs DB) · `jenkins` 45 s · `ollama` 40 s | |
| Service restart (`systemctl restart`, `sc start`) | down immediately, up after: robot-controller 3 s, camera-stream 2 s, cardprog 4 s, callus 5 s, mysql 5 s (+ Orca pool reconnect 15 s), ollama 10 s, jenkins 30 s | |

#### 2.5.3 Files the sim reads on hosts (`Host.files`)

| Host | Path | Content (factory) |
|---|---|---|
| every rig Pi | `/etc/robot-controller/controller.yaml` | see below |
| every rig Pi | `/opt/cardprog/wineprefix-golden/` (dir marker) and `/home/pi/.wine-cardprog/` (dir marker `ok`) | Wine prefixes (INC56) |
| Windows boxes | `C:\gort\cards\emv\*.json`, `C:\gort\cards\nfc\*.json` | mirror of `callus.localCardFiles[host].files` |
| `nuc-03` | `C:\ProgramData\SecAgent\logs\` | size only (118.4 GB) |
| `orca-vm` | `/opt/orca/application-prod.yml` | `spring.datasource.url: jdbc:mysql://localhost:3306/orca` |

```yaml
# /etc/robot-controller/controller.yaml  (pi-wall-e) [illus.]
robot: wall-e
listen: 0.0.0.0:8000
callus: http://10.42.20.1:9000      # upstream checked by /health
motion: local                        # "local" = 25-pin motor PCB on this Pi's USB; legacy form: nuc://10.42.20.3:9100
camera: /dev/video0
adb:
  port: 5444
  devices: [SIM-F3-000011]
cardprog:
  wineprefix: /home/pi/.wine-cardprog
  exe: 'C:\CardProg\CardProgrammer.exe'
```
Shared Pis list several `robot:` entries (`robots: [megatron, optimus]`). `pi-adb-shelf` has no
`callus:` key (ADB bots have no card hardware). The sim re-reads this file on `robot-controller`
(re)start; a syntax error ⇒ service fails `Result: exit-code` with journal line
`controller.yaml: mapping values are not allowed here (line N)`.

### 2.6 Power network seed

Topology (all ids exact; GP §3.1 ids preserved):

```
WALL-1 ─ MW-1 (Mean Well LRS-600-24 · 24 V · 25 A) ─ rail-24v
   rail-24v ─┬─ REG-5V-A    (24→5 V · 10 A · input switch) ─ F-RACKA-5V (10 A, label 10A) ─ rail-5v-a
             │      rail-5v-a ─ MAIN-wall-e, MAIN-eve, MAIN-bumblebee, MAIN-r2-d2   (each via that rig's MAIN toggle)
             ├─ REG-5V-B    ─ F-RACKB-5V (10 A) ─ rail-5v-b
             │      rail-5v-b ─ MAIN-johnny-5, MAIN-baymax, MAIN-seti, MAIN-rosie, T-5V-B-CAM (pi-cam-rackb)
             ├─ REG-5V-BENCH ─ F-BENCH-5V (10 A) ─ rail-5v-bench
             │      rail-5v-bench ─ T-5V-BENCH-1 (pi-tethered), T-5V-BENCH-2 (pi-adb-shelf), T-5V-SPARE (free)
             ├─ REG-12V     (24→12 V · 8 A · input switch) ─ F-NUC-12V (10 A, label 10A) ─ rail-12v
             │      rail-12v ─ T-12V-NUC (nuc-03), T-12V-SPARE (free — "the 12 V NUC line")
             ├─ MOTOR-<rig> × 8 (touch/standalone rigs; via each rig's MOTOR toggle; unfused, driver current-limited)
             ├─ T-24V-SPARE   (free rail tap on the power wall — the INC17 trap)
             └─ T-24V-CALLUS  (free 24 V barrel lead lying on the Callus shelf — the INC18 trap)
WALL-2 ─ STRIP-A · WALL-3 ─ STRIP-B · WALL-4 ─ STRIP-T · WALL-5 ─ STRIP-C · WALL-6 ─ STRIP-W
```

AC power strips (6 sockets, 15 A breaker each):

| Strip | Location | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| `STRIP-A` | Rack A | `psu-wall-e-flex3` | `psu-bumblebee-mini3` | `psu-r2-d2-duo` | `brick-minix-01` | `psu-collis-eve` | `psu-eve-flex4` |
| `STRIP-B` | Rack B | `psu-johnny-5-flex1` | `psu-baymax-st2018` | `psu-seti-compact` | `psu-rosie-pocket` | `brick-minix-02` | `psu-collis-rosie` |
| `STRIP-C` | Callus shelf | `psu-collis-wall-e` | `psu-collis-bumblebee` | `psu-collis-r2-d2` | `psu-collis-johnny-5` | `psu-collis-baymax` | `psu-collis-seti` |
| `STRIP-T` | Tethered rack + ADB shelf | `psu-megatron-mfd` | `psu-megatron-cfd` | `psu-optimus-mfd` | `psu-optimus-cfd` | `psu-data-mini3` | `psu-tars-flex4` |
| `STRIP-W` | Power-wall bench | `soldering-station` | `desk-lamp` | free | free | free | free |

(`STRIP-C` is new in this doc; GP §3.1 lists A, B, T, W. INC17's "STRIP-A outlets 1–5 … outlet 6 desk
fan" matches this numbering once `psu-eve-flex4` is unplugged and the fan takes socket 6.)

Loads (nominal draw at expected voltage; `expects`):

| Load | Expects | Draw | Notes |
|---|---|---|---|
| Rig controller side via MAIN (Pi + webcam + tablet charger) | 5 V | 0.90 + 0.25 + 0.50 = **1.65 A** | rigs without own webcam (Rack B): 1.40 A |
| `pi-tethered` (+ webcam, 2 SmartStripe) | 5 V | 1.35 A | |
| `pi-adb-shelf` | 5 V | 0.90 A | |
| `pi-cam-rackb` (+ webcam) | 5 V | 1.15 A | |
| `nuc-03` | 12 V | 3.50 A | |
| MOTOR per touch rig | 24 V | disabled 0.05 · enabled idle (holding) 0.80 · moving 1.60 · + solenoid stroke 1.20 for the stroke duration | |
| LabSim device bricks `psu-*` | AC-BRICK-18V | 0.5 A AC | the device runs only from its brick on an AC strip |
| Collis probe PSUs `psu-collis-*` | AC-BRICK-18V | 0.3 A AC | |
| Minix bricks | AC | 0.3 A AC | (a Minix lead on `T-12V-SPARE` also works; on 24 V it fries; on 5 V no power) |
| desk fan (INC17), soldering station, desk lamp | AC | 0.4 / 0.6 / 0.2 A | |

Steady currents: rail-5v-a 6.60 A, rail-5v-b 6.75 A (4 × 1.40 + 1.15), rail-5v-bench 2.25 A,
rail-12v 3.50 A — all under the 10 A fuses. Spare blade fuses on the bench (`spareFuses`): 5 A tan × 4,
10 A red × 4, 15 A blue × 2, 20 A yellow × 1. Holder labels on all four fuses read `10A`.

Multimeter probe points (`power.measure(pointId)`) and healthy readings:

| Point id | Reads |
|---|---|
| `WALL-n`, `STRIP-x` socket | `119.6 V AC` |
| `MW-1.out`, `rail-24v`, `T-24V-*` | `24.1 V DC` |
| `REG-5V-*.out` (line side of the fuse) | `5.08 V DC` (droop −0.02 V/A above 5 A) |
| `F-*.load` (load side of a fuse), `rail-5v-*`, `MAIN-<rig>` | as the regulator, or `0.00 V DC` if fuse open/removed |
| `REG-12V.out`, `rail-12v` | `12.02 V DC` |
| `F-<id>` in Ω mode (fuse removed, or its branch de-energised) | intact `0.1 Ω`, blown `OL` |
| Ω mode on any energised point | `ERR` (GW21) |

### 2.7 Robot Capabilities

#### 2.7.1 Derived keys (computed by Orca, not editable)

| Key | Value |
|---|---|
| `deviceType` | Robot Device row's `deviceType` |
| `printer` | `DeviceTypeInfo.hasPrinter` of the Robot Device type |
| `physicalTouch` | rig `hasGantry` (touch / standalone) |
| `pinEntry` | `physicalTouch` and the gantry covers the display that shows the PIN pad |
| `tethered` | `mfdDeviceId != null` |
| `duo` | Robot Device type has `dualScreenSingleAdb` |
| `adbOnly` | `rigKind == 'adb'` |
| `testingProfile` | profile of the Robot Device type |

Canonical key order in the UI JSON: `deviceType, printer, physicalTouch, dip, tap, swipe, pinEntry,
tethered, duo, adbOnly, testingProfile`, then linked flags alphabetically. WALL-E renders
`{"deviceType":"FLEX_3","printer":true,"physicalTouch":true,"dip":true,"tap":true,"swipe":true,"pinEntry":true,"tethered":false,"duo":false,"adbOnly":false,"testingProfile":"FLEX_GEN3"}`;
ROSIE begins `{"deviceType":"FLEX_POCKET","printer":false,…` (Cur M08).

#### 2.7.2 Linked capability rows (`capabilities` table)

| id | name | key | Lookup | Description | json |
|---|---|---|---|---|---|
| 1 | DIP | `dip` | BOTH | Dip arm + Collis probe present | `{"dip": true}` |
| 2 | TAP | `tap` | BOTH | Tap paddle + Collis NFC | `{"tap": true}` |
| 3 | SWIPE | `swipe` | BOTH | Collis or SmartStripe swipe | `{"swipe": true}` |
| 4 | GO_SDK | `goSdk` | DYNAMIC_JSON | Terminal SDK runner target (David) | `{"goSdk": true}` |
| 5 | INTERAC | `interac` | BOTH | Canadian Interac flows (Westers beds) | `{"interac": true}` |
| 6 | PHONE | `phone` | DYNAMIC_JSON | Phone carriage with a mounted phone (mobile runners) | `{"phone": true}` |
| 7 | OCR_CAMERA | `ocrCamera` | NON_DYNAMIC | Webcam aimed for Screen Compare (legacy Duo) | `{"ocrCamera": true}` |
| 8 | lab_dining | `lab_dining` | BOTH | LabSim Dining app provisioned (PayCore) | `{"lab_dining": true}` |
| 9 | CARD_MATRIX | `cardMatrix` | NON_DYNAMIC | PayCore back-to-back card matrix rig | `{"cardMatrix": true}` |

### 2.8 Merchant Config (`merchants`)

| id | Name | Display name | MID | Env | Region | Country/Cur | Tax | Tips | PIN bypass | Cash discount | QR receipts | Sig. threshold | Brands | Apps | Owner | App ID | App Secret | API Key | Ubi route |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `AUTO-US-NOPIN-01` | LabSim Automation Lab — US 01 | SIMMID0000101 | dev1 | US-EAST | US/USD | 8.25 % | 15/18/20/22 | **yes** | no | yes | $25.00 | V MC AX DS | — | Automation | — | — | — | `us-east` |
| 2 | `AUTO-US-NOPIN-02` | LabSim Automation Lab — US 02 | SIMMID0000102 | dev2 | US-EAST | US/USD | 8.25 % | 15/18/20/22 | **yes** | **yes** (card +4.00 %) | no | $25.00 | V MC AX DS | — | Automation | — | — | — | `us-east` |
| 3 | `GO-SDK-US-01` | Go SDK Smoke Merchant | SIMMID0000301 | dev1 | US-EAST | US/USD | 8.25 % | 15/18/20/22 | yes | no | yes | $25.00 | V MC AX DS | — | SDK | `app_sim_7f3a` | `app_secret_sim_5d21` | `key_sim_19c0e2` | `us-east` |
| 4 | `PAYCORE-STANDALONE-01` | PayCore Standalone 01 | SIMMID0000401 | stg | US-EAST | US/USD | 8.25 % | off | no | no | no | $0.00 (always sign swipes) | V MC AX DS | — | PayCore | — | — | — | `us-east` |
| 5 | `PAYCORE-DINING-01` | PayCore Dining Room | SIMMID0000501 | stg | US-EAST | US/USD | 8.25 % | 15/18/20 | no | no | yes | $25.00 | V MC AX DS | LabSim Dining | PayCore | — | — | — | `us-east` |
| 6 | `WESTERS-CA-01` | Westers Test Bed — CA 01 | SIMMID0000601 | dev1 | CA-CENTRAL | CA/CAD | 13.00 % (HST) | 15/18/20 | **no** (PIN required) | no | no | never | V MC IN | — | Westers | — | — | — | `ca-central` |
| 7 | `WESTERS-CA-02` | Westers Test Bed — CA 02 | SIMMID0000602 | qa | CA-CENTRAL | CA/CAD | 13.00 % | 15/18/20 | no | no | no | never | V MC IN | — | Westers | — | — | — | `ca-central` |

Address line on all receipts: `100 Automation Way, Lab 4` [illus.]. ADB bots (DATA, TARS, VISION, …)
only ever hold PIN-bypass merchants (Ref §6) — `orca.saveRobot` rejects linking a non-bypass merchant
to an `adb` rig with `400 Bad Request: ADB-only robots require a PIN-bypass merchant`.

### 2.9 Card Profiles (`cardProfiles`) and Gort card files

| id | Name | Brand | Entry | Track Data (SWIPE) / Gort path (DIP, TAP) | PAN | Exp | PIN | Country | Owner |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `VISA_STD_SWIPE` | VISA | SWIPE | `%B4111111111111111^SIM/VISA^30121010000000000000?;4111111111111111=3012101000000000?` | 4111111111111111 | 3012 | — | US | Automation |
| 2 | `VISA_STD_DIP` | VISA | DIP | `cards/emv/visa_std_dip.json` | 4111111111111111 | 3012 | — | US | Automation |
| 3 | `VISA_STD_TAP` | VISA | TAP | `cards/nfc/visa_std_tap.json` | 4111111111111111 | 3012 | — | US | Automation |
| 4 | `INTERAC_CA_DIP` | INTERAC | DIP | `cards/emv/interac_ca_dip.json` | 4506440000000017 | 3012 | `1234` | CA | Automation |
| 5 | `INTERAC_CA_TAP` | INTERAC | TAP | `cards/nfc/interac_ca_tap.json` | 4506440000000017 | 3012 | `1234` | CA | Automation |
| 6 | `AMEX_MATRIX_DIP` | AMEX | DIP | `cards/emv/amex_matrix_dip.json` | 378282246310005 | 3012 | — | US | PayCore |
| 7 | `DISCOVER_MATRIX_DIP` | DISCOVER | DIP | `cards/emv/discover_matrix_dip.json` | 6011111111111117 | 3012 | — | US | PayCore |
| 8 | `AMEX_MATRIX_SWIPE` | AMEX | SWIPE | `%B378282246310005^SIM/AMEX^30121010000000000000?;378282246310005=301210100000000?` | 378282246310005 | 3012 | — | US | PayCore |
| 9 | `DISCOVER_MATRIX_SWIPE` | DISCOVER | SWIPE | `%B6011111111111117^SIM/DISCOVER^30121010000000000000?;6011111111111117=3012101000000000?` | 6011111111111117 | 3012 | — | US | PayCore |

The Orca Card Profiles UI shows **Track Data** inline for SWIPE rows and **Path** for DIP/TAP rows
(the other field hidden). `orca.saveCardProfile` validation: SWIPE requires non-empty `trackData` and
`gortPath == null`; DIP/TAP require `gortPath` and `trackData == null` (`400 Bad Request: Swipe
profiles store Track Data; Dip/Tap profiles store a Gort path`).

Gort card definition files (identical structure; values differ):

```json
{
  "profile": "INTERAC_CA_DIP",
  "brand": "INTERAC",
  "interface": "CONTACT",
  "pan": "4506440000000017",
  "expiry": "3012",
  "aid": "A0000002771010",
  "appLabel": "Interac",
  "cvm": ["ONLINE_PIN", "OFFLINE_PIN"],
  "pin": "1234",
  "atr": "3B 6E 00 00 80 31 80 66 B0 84 0C 01 6E 01 83 00 90 00",
  "issuerCountry": "CA"
}
```
Visa: `aid A0000000031010`, `appLabel "VISA CREDIT"`, `cvm ["SIGNATURE","NO_CVM"]`, no `pin`. AmEx
`A00000002501`, Discover `A0000001523010`. NFC files have `"interface": "CONTACTLESS"`.

Callus local clones at factory: every Windows box holds all files under `cards/emv/` and `cards/nfc/`
at gort commit `c41d9e2` — the daily 10:00 run yesterday pulled `9f02a1b`; after adding
`INTERAC_CA_TAP` Riley ran `schtasks /run /tn GortCardSync` on every box at 15:20 (`syncedAtMs` =
yesterday 15:20:20 = `-31_180_000`, `lastRunMs` = `-31_200_000`). INC54's box missed that manual run
(§4.3.5).

### 2.10 Screens, Screen Locations and the firmware layouts

#### 2.10.1 Screen naming map

| Orca screen (per Device Type) | Runtime `display.screen` | Display | Buttons / content |
|---|---|---|---|
| `HOME` | `home` | primary | launcher icons |
| `REGISTER_HOME` | `register` | primary | items, `Register` tab, `Clear`, `Review Order` |
| `REVIEW_ORDER` | `review-order` | primary | `Back`, `Pay` |
| `PAYMENT` | `tender-select` | primary | `Charge`, `Cash`, `Other`, `Cancel` |
| `TENDER_CASH_DISCOUNT` | `cash-discount-tender` | customer-facing | `Cash`, `Card` (cash-discount tender selection prompt, Ref §3) |
| `PAYMENT_PROMPT` | `payment-prompt` | customer-facing | "Tap, insert or swipe" + amount; `Cancel` |
| `PIN_ENTRY` | `pin-entry` | customer-facing (Secure Touch) | `0`–`9`, `Clear`, `Enter`, `Cancel` |
| `TIP` | `tip` | customer-facing | `15%` `18%` `20%` `22%` `No Tip` `Custom` (merchant's percents) |
| `SIGNATURE` | `signature` | customer-facing | signature pad, `Clear`, `Done` |
| `APPROVED` | `approved` | customer-facing | label `Payment Successful`; no buttons (auto-advance 2.0 s) |
| `RECEIPT_OPTIONS_4` | `receipt-options` (`receiptOptions: 4`) | customer-facing | `Print` `Email` `Text` `No Receipt` |
| `RECEIPT_OPTIONS_5` | `receipt-options` (`receiptOptions: 5`) | customer-facing | + `Scan for receipt`; QR block above the list; every button 3.0 mm lower (Cur S10) |
| `CUSTOMER_CART` | `customer-cart` | CFD device (tethered) | labels `Subtotal $…`, `Tax $…`, `TOTAL $…`; no buttons |
| `CFD_CART`, `CFD_TENDER_CASH_DISCOUNT`, `CFD_PAYMENT_PROMPT`, `CFD_PIN_ENTRY`, `CFD_TIP`, `CFD_SIGNATURE`, `CFD_RECEIPT_OPTIONS_4`, `CFD_RECEIPT_OPTIONS_5`, `CFD_RECEIPT_DONE`, `CFD_THANK_YOU` | same runtime names as above + `receipt-done`, `thank-you` on `secondaryDisplay` | **secondary** (Station Duo family only) | as the generic screen; `CFD_RECEIPT_DONE` = "Your receipt is on its way" + `Done`; `CFD_THANK_YOU` = label `Thank you` |
| — | `off`, `boot`, `lock`, `customer-idle` ("Welcome" + merchant name), `waiting-for-merchant` (`Waiting for merchant device…`), `processing`, `declined`, `printing`, `receipt-done`, `thank-you`, `oobe-*`, `deprovisioning`, `app-*`, `error` | | non-automated screens (no Orca rows) |

"Customer-facing" = the CFD device on tethered rigs, the secondary display on a Duo, or the same
display on single-screen devices (Flex, Mini, Station, Compact).

Orca rows exist at factory for every Device Type that has a device row in the lab: `STATION_2018,
STATION_2, STATION_DUO, STATION_DUO_2, MINI_2, MINI_3, FLEX_1, FLEX_2, FLEX_3, FLEX_4, FLEX_POCKET,
COMPACT` (not the upcoming `STATION_DUO_3`, `MINI_4`). Each gets `HOME … RECEIPT_OPTIONS_5` and
`APPROVED` (no locations); MINI_2/MINI_3 also get `CUSTOMER_CART`; STATION_DUO and STATION_DUO_2 also
get the `CFD_*` rows (`display: 'secondary'`). Ids are assigned in enum order × table order. Every
Screen Location equals the firmware tap point below (factory = no drift).

#### 2.10.2 Firmware layouts (truth) — button centre (x, y) and size w × h, in mm

Hit rules are in §3.5.4. "Probe core" = the half-width of the acceptance window for physical taps,
`clamp(0.10 × min(w,h), 1.0, 2.5)` — listed where it matters for incidents.

**Layout `FLEX_GEN3`** (FLEX_3, FLEX_4, FLEX_POCKET · portrait 76.0 × 135.0)

| Screen | Button (x, y) w×h |
|---|---|
| HOME (vertical list, 2 columns, 5 rows per page; page 1 below) | `Orders` (20.3, 30.0) · `Transactions` (55.7, 30.0) · `Register` (20.3, 53.6) · `Setup` (55.7, 53.6) · `Sale` (20.3, 77.2) · `Authorizations` (55.7, 77.2) · `Customers` (20.3, 100.8) · `Inventory` (55.7, 100.8) · `Settings` (20.3, 124.4) · `App Market` / `LabSim Dining` (55.7, 124.4) — all 20.3 × 20.3 (= 192 × 192 px; `Register` bounds `[96,412][288,604]`, Cur M12) |
| REGISTER_HOME | `Register` tab (13.0, 10.0) 22×8 · `Tax Item 5` (20.3, 30.0) 32×16 · `Non-Tax Item 1` (55.7, 30.0) 32×16 · `Coffee` (20.3, 50.0) 32×16 · `Catering Deposit` (55.7, 50.0) 32×16 · `Clear` (20.0, 124.0) 32×12 · `Review Order` (56.0, 124.0) 36×12 (core 1.2) |
| REVIEW_ORDER | `Back` (20.0, 124.0) 32×12 · `Pay` (56.0, 124.0) 36×12 |
| PAYMENT | `Charge` (38.0, 60.0) 68×14 · `Cash` (38.0, 78.0) 68×14 · `Other` (38.0, 96.0) 68×14 · `Cancel` (38.0, 124.0) 68×10 |
| TENDER_CASH_DISCOUNT | `Cash` (22.0, 58.5) 26×16 · `Card` (62.0, 58.5) 26×16 (Cur §0.6 FLEX_3 values) |
| PAYMENT_PROMPT | `Cancel` (38.0, 124.0) 40×10 · label `Tap, insert or swipe` rect (6.0, 52.0, 64.0, 8.0) · amount label rect (18.0, 36.0, 40.0, 10.0) |
| PIN_ENTRY | `1` (19.0, 62.0) · `2` (38.0, 62.0) · `3` (57.0, 62.0) · `4` (19.0, 76.0) · `5` (38.0, 76.0) · `6` (57.0, 76.0) · `7` (19.0, 90.0) · `8` (38.0, 90.0) · `9` (57.0, 90.0) · `Clear` (19.0, 104.0) · `0` (38.0, 104.0) · `Enter` (57.0, 104.0) — keys 17×12 · `Cancel` (38.0, 122.0) 40×9 |
| TIP | `15%` (20.3, 62.0) · `18%` (55.7, 62.0) · `20%` (20.3, 80.0) · `22%` (55.7, 80.0) — 32×14 · `No Tip` (20.3, 98.0) 32×12 · `Custom` (55.7, 98.0) 32×12 |
| SIGNATURE | pad (38.0, 70.0) 68×60 · `Clear` (20.0, 124.0) 32×10 · `Done` (56.0, 124.0) 32×10 |
| APPROVED | label `Payment Successful` rect (21.96, 54.00, 32.09, 4.22) = screencap px **(208, 512, 304, 40)** |
| RECEIPT_OPTIONS_4 | `Print` (34.0, 71.0) · `Email` (34.0, 83.0) · `Text` (34.0, 95.0) · `No Receipt` (34.0, 107.0) — rows 60×6 (core 1.0) (Cur §0.6) |
| RECEIPT_OPTIONS_5 | QR block (34.0, 61.0) 20×20 (non-button; bottom edge at 71.0) · `Print` (34.0, 74.0) · `Email` (34.0, 86.0) · `Text` (34.0, 98.0) · `No Receipt` (34.0, 110.0) · `Scan for receipt` (34.0, 122.0) — rows 60×6 (Cur §0.6) |

**Layout `FLEX_GEN2`** (FLEX_2 · portrait 68.0 × 121.0)

| Screen | Buttons |
|---|---|
| HOME (2 columns, rows 24/45/66/87/108) | `Orders` (18.0, 24.0) · `Transactions` (50.0, 24.0) · `Register` (18.0, 45.0) · `Setup` (50.0, 45.0) · `Sale` (18.0, 66.0) · `Authorizations` (50.0, 66.0) · `Customers` (18.0, 87.0) · `Inventory` (50.0, 87.0) · `Settings` (18.0, 108.0) · `App Market` (50.0, 108.0) — 18×18 |
| REGISTER_HOME | `Register` (14.0, 8.0) 22×7 · `Tax Item 5` (18.0, 26.0) 30×15 · `Non-Tax Item 1` (50.0, 26.0) 30×15 · `Coffee` (18.0, 44.0) 30×15 · `Catering Deposit` (50.0, 44.0) 30×15 · `Clear` (18.0, 112.0) 28×10 · `Review Order` (50.0, 112.0) 32×10 |
| REVIEW_ORDER | `Back` (18.0, 112.0) 28×10 · `Pay` (50.0, 112.0) 32×10 |
| PAYMENT | `Charge` (34.0, 54.0) 60×12 · `Cash` (34.0, 70.0) 60×12 · `Other` (34.0, 86.0) 60×12 · `Cancel` (34.0, 110.0) 40×8 |
| TENDER_CASH_DISCOUNT | `Cash` (18.0, 54.0) 28×15 · `Card` (50.0, 54.0) 28×15 |
| PAYMENT_PROMPT | `Cancel` (34.0, 112.0) 36×8 · headline rect (4.0, 46.0, 60.0, 7.0) |
| PIN_ENTRY | columns x 17.0 / 34.0 / 51.0, rows y 54.0 / 67.0 / 80.0 / 93.0 (`1 2 3` / `4 5 6` / `7 8 9` / `Clear 0 Enter`) 15×11 · `Cancel` (34.0, 110.0) 36×8 |
| TIP | `15%` (18.0, 54.0) · `18%` (50.0, 54.0) · `20%` (18.0, 70.0) · `22%` (50.0, 70.0) 28×13 · `No Tip` (18.0, 86.0) · `Custom` (50.0, 86.0) 28×11 |
| SIGNATURE | pad (34.0, 58.0) 62×54 · `Clear` (18.0, 112.0) · `Done` (50.0, 112.0) 28×8 |
| RECEIPT_OPTIONS_4 | `Print` (34.0, 70.0) · `Email` (34.0, 80.0) · `Text` (34.0, 90.0) · `No Receipt` (34.0, 100.0) — 56×6 |
| RECEIPT_OPTIONS_5 | QR (34.0, 60.0) 18×20 · `Print` (34.0, 73.0) · `Email` (34.0, 83.0) · `Text` (34.0, 93.0) · `No Receipt` (34.0, 103.0) · `Scan for receipt` (34.0, 113.0) — 56×6 |

**Layout `FLEX_GEN1`** (FLEX_1 · portrait 62.3 × 110.7)

| Screen | Buttons |
|---|---|
| HOME (2 columns, rows 22/42/62/82/102) | `Orders` (16.6, 22.0) · `Transactions` (45.7, 22.0) · `Register` (16.6, 42.0) · `Setup` (45.7, 42.0) · `Sale` (16.6, 62.0) · `Authorizations` (45.7, 62.0) · `Customers` (16.6, 82.0) · `Inventory` (45.7, 82.0) · `Settings` (16.6, 102.0) · `App Market` (45.7, 102.0) — 16×16 |
| REGISTER_HOME | `Register` (13.0, 8.0) 22×7 · `Tax Item 5` (16.6, 24.0) 28×14 · `Non-Tax Item 1` (45.7, 24.0) 28×14 · `Coffee` (16.6, 41.0) 28×14 · `Catering Deposit` (45.7, 41.0) 28×14 · `Clear` (16.0, 102.0) 26×9 · `Review Order` (45.0, 102.0) 30×9 |
| REVIEW_ORDER | `Back` (16.0, 102.0) 26×9 · `Pay` (45.0, 102.0) 30×9 |
| PAYMENT | `Charge` (31.2, 48.0) 54×11 · `Cash` (31.2, 63.0) 54×11 · `Other` (31.2, 78.0) 54×11 · `Cancel` (31.2, 100.0) 40×8 |
| TENDER_CASH_DISCOUNT | `Cash` (16.6, 48.0) 26×15 · `Card` (45.7, 48.0) 26×15 |
| PAYMENT_PROMPT | `Cancel` (31.2, 102.0) 36×8 · headline rect (3.0, 42.0, 56.0, 7.0) |
| PIN_ENTRY | columns 15.6 / 31.2 / 46.8, rows 48.0 / 61.0 / 74.0 / 87.0, keys 14×11 · `Cancel` (31.2, 102.0) 34×7 |
| TIP | `15%` (16.6, 48.0) · `18%` (45.7, 48.0) · `20%` (16.6, 63.0) · `22%` (45.7, 63.0) 26×12 · `No Tip` (16.6, 78.0) · `Custom` (45.7, 78.0) 26×11 |
| SIGNATURE | pad (31.2, 52.0) 56×46 · `Clear` (16.0, 102.0) · `Done` (46.0, 102.0) 26×8 |
| RECEIPT_OPTIONS_4 | `Print` (31.2, **66.5**) · `Email` (31.2, 75.5) · `Text` (31.2, 84.5) · `No Receipt` (31.2, 93.5) — 52×7 (GP INC22 truth 66.5) |
| RECEIPT_OPTIONS_5 | QR (31.2, 57.0) 16×18 · `Print` (31.2, 69.5) · `Email` (31.2, 78.5) · `Text` (31.2, 87.5) · `No Receipt` (31.2, 96.5) · `Scan for receipt` (31.2, 105.5) — 52×7 |

**Layout `COMPACT`** (portrait 62.3 × 110.7)

| Screen | Buttons |
|---|---|
| HOME (2 columns, rows 24/44/64/84) | `Orders` (16.6, 24.0) · `Transactions` (45.7, 24.0) · `Register` (16.6, 44.0) · `Setup` (45.7, 44.0) · `Sale` (16.6, 64.0) · `Customers` (45.7, 64.0) · `Settings` (16.6, 84.0) · `Authorizations` (45.7, 84.0) — 18×18 |
| REGISTER_HOME | `Register` (13.0, 8.0) 22×7 · `Tax Item 5` (16.6, 24.0) 28×14 · `Non-Tax Item 1` (45.7, 24.0) 28×14 · `Coffee` (16.6, 41.0) 28×14 · `Catering Deposit` (45.7, 41.0) 28×14 · `Clear` (16.0, 102.0) 26×10 · `Review Order` (45.0, 102.0) 30×10 |
| REVIEW_ORDER | `Back` (16.0, 102.0) 26×10 · `Pay` (45.0, 102.0) 30×10 |
| PAYMENT | `Charge` (31.2, 50.0) 54×12 · `Cash` (31.2, 66.0) 54×12 · `Other` (31.2, 82.0) 54×12 · `Cancel` (31.2, 102.0) 40×8 |
| TENDER_CASH_DISCOUNT | `Cash` (16.6, 50.0) 26×16 · `Card` (45.7, 50.0) 26×16 |
| PAYMENT_PROMPT | `Cancel` (31.2, 102.0) 36×8 · headline rect (3.0, 44.0, 56.0, 7.0) |
| PIN_ENTRY | columns 15.6 / 31.2 / 46.8, rows 50.0 / 63.0 / 76.0 / 89.0, keys 14×11 · `Cancel` (31.2, 103.0) 34×7 |
| TIP | `15%` (16.6, 50.0) · `18%` (45.7, 50.0) · `20%` (16.6, 66.0) · `22%` (45.7, 66.0) 26×13 · `No Tip` (16.6, 82.0) · `Custom` (45.7, 82.0) 26×11 (Westers merchants offer 15/18/20 — the `22%` button is hidden) |
| SIGNATURE | pad (31.2, 55.0) 56×50 · `Clear` (16.0, 102.0) · `Done` (46.0, 102.0) 26×8 |
| RECEIPT_OPTIONS_4 | `Print` (31.2, 60.0) · `Email` (31.2, 70.0) · `Text` (31.2, 80.0) · `No Receipt` (31.2, 90.0) — 52×6 (Compact has no printer: `Print` rendered disabled) |
| RECEIPT_OPTIONS_5 | QR (31.2, 51.0) 16×16 · `Print` (31.2, 63.0) · `Email` (31.2, 73.0) · `Text` (31.2, 83.0) · `No Receipt` (31.2, 93.0) · `Scan for receipt` (31.2, 103.0) — 52×6 |

**Layout `MINI_GEN3`** (MINI_3, MINI_4 · landscape 172.3 × 107.7). Also the Station Duo CFD layout.

| Screen | Buttons |
|---|---|
| HOME (horizontal pages; 5 columns × 2 rows) | page 0: `Register` (22.0, 38.0) · `Orders` (54.0, 38.0) · `Transactions` (86.0, 38.0) · `Setup` (118.0, 38.0) · `Sale` (150.0, 38.0) · `Authorizations` (22.0, 72.0) · `Customers` (54.0, 72.0) · `Inventory` (86.0, 72.0) · `Settings` (118.0, 72.0) · `App Market` / `LabSim Dining` (150.0, 72.0) — 24×24 (core 2.4) |
| REGISTER_HOME | `Register` (14.0, 8.0) 22×8 · `Tax Item 5` (22.0, 30.0) 34×18 (core 1.8) · `Non-Tax Item 1` (60.0, 30.0) · `Coffee` (22.0, 52.0) · `Catering Deposit` (60.0, 52.0) — 34×18 · `Clear` (100.0, 96.0) 20×16 · `Review Order` (140.0, 96.0) 56×16 (core 1.6) |
| REVIEW_ORDER | `Back` (100.0, 96.0) 20×16 · `Pay` (140.0, 96.0) 56×16 (core 1.6) |
| PAYMENT | `Cash` (31.0, 53.0) 50×12 · `Other` (31.0, 71.0) 50×12 · `Charge` (31.0, 89.0) 50×12 (core **1.2**; GP INC14) · `Cancel` (150.0, 96.0) 36×12 |
| TENDER_CASH_DISCOUNT / CFD_TENDER_CASH_DISCOUNT | `Cash` (56.0, 58.0) 60×20 · `Card` (116.0, 58.0) 60×20 |
| PAYMENT_PROMPT / CFD_PAYMENT_PROMPT | `Cancel` (86.0, 98.0) 40×10 · headline rect (46.0, 44.0, 80.0, 9.0) |
| PIN_ENTRY / CFD_PIN_ENTRY | columns 66.0 / 86.0 / 106.0, rows 34.0 / 50.0 / 66.0 / 82.0, keys 18×14 · `Cancel` (150.0, 98.0) 30×10 |
| TIP / CFD_TIP | `15%` (40.0, 50.0) · `18%` (72.0, 50.0) · `20%` (104.0, 50.0) · `22%` (136.0, 50.0) 28×18 · `No Tip` (56.0, 80.0) 40×12 · `Custom` (120.0, 80.0) 40×12 |
| SIGNATURE / CFD_SIGNATURE | pad (86.0, 48.0) 150×60 · `Clear` (40.0, 96.0) 40×10 · `Done` (132.0, 96.0) 40×10 |
| RECEIPT_OPTIONS_4 / CFD_RECEIPT_OPTIONS_4 | `Print` (86.0, 40.0) · `Email` (86.0, 52.0) · `Text` (86.0, 64.0) · `No Receipt` (86.0, 76.0) — 80×6 |
| RECEIPT_OPTIONS_5 / CFD_RECEIPT_OPTIONS_5 | QR (86.0, 31.0) 18×18 (bottom edge 40.0) · `Print` (86.0, 43.0) · `Email` (86.0, 55.0) · `Text` (86.0, 67.0) · `No Receipt` (86.0, 79.0) · `Scan for receipt` (86.0, 91.0) — 80×6 |
| CFD_RECEIPT_DONE | `Done` (86.0, 90.0) 50×12 · label `Your receipt is on its way` |
| CUSTOMER_CART / CFD_CART (labels, v1) | `Subtotal $10.00` rect (28.38, 14.00, 59.79, 8.00) · `Tax $0.83` (28.38, 23.00, 59.79, 8.00) · `TOTAL $10.83` (28.38, 32.43, 59.79, 11.15). **v2 copy** (`cfdLayout: 'v2'`): total line reads `Total $10.83`, same rect (INC37-A). `labelShiftPx` moves CFD labels down in the webcam frame (10 px = 2.53 mm on R2-D2, INC36). Cur M16's tutorial toggle "CFD layout v2" sets **both** (v2 copy + 10 px). Amounts are live (`$` + cents formatted). |
| CFD_THANK_YOU | label `Thank you` rect (54.22, 44.59, 63.85, 12.16) |

**Layout `MINI_GEN2`** (MINI_2 · landscape 154.2 × 90.4)

| Screen | Buttons |
|---|---|
| HOME (5 × 2) | columns x 20.0 / 48.5 / 77.0 / 105.5 / 134.0, rows y 32.0 / 61.0, same app order as MINI_GEN3 — 22×22 |
| REGISTER_HOME | `Register` (12.5, 7.0) 20×7 · `Tax Item 5` (20.0, 25.0) · `Non-Tax Item 1` (54.0, 25.0) · `Coffee` (20.0, 44.0) · `Catering Deposit` (54.0, 44.0) — 30×15 · `Clear` (89.5, 81.0) 18×13 · `Review Order` (125.0, 81.0) 50×13 |
| REVIEW_ORDER | `Back` (89.5, 81.0) 18×13 · `Pay` (125.0, 81.0) 50×13 |
| PAYMENT | `Cash` (28.0, 44.5) · `Other` (28.0, 59.5) · `Charge` (28.0, 74.5) — 44×10 · `Cancel` (134.0, 81.0) 32×10 |
| TENDER_CASH_DISCOUNT | `Cash` (50.0, 48.5) 54×17 · `Card` (104.0, 48.5) 54×17 |
| PAYMENT_PROMPT | `Cancel` (77.0, 82.0) 36×9 · headline rect (41.0, 38.0, 72.0, 8.0) |
| PIN_ENTRY | columns 59.0 / 77.0 / 95.0, rows 28.5 / 42.0 / 55.5 / 69.0, keys 16×12 · `Cancel` (134.0, 82.0) 28×9 |
| TIP | `15%` (36.0, 42.0) · `18%` (64.5, 42.0) · `20%` (93.0, 42.0) · `22%` (121.5, 42.0) 25×15 · `No Tip` (50.0, 67.0) · `Custom` (107.0, 67.0) 36×10 |
| SIGNATURE | pad (77.0, 40.0) 134×50 · `Clear` (36.0, 81.0) · `Done` (118.0, 81.0) 36×9 |
| RECEIPT_OPTIONS_4 | `Print` (77.0, 33.0) · `Email` (77.0, 43.0) · `Text` (77.0, 53.0) · `No Receipt` (77.0, 63.0) — 70×6 |
| RECEIPT_OPTIONS_5 | QR (77.0, 26.0) 14×14 · `Print` (77.0, 36.0) · `Email` (77.0, 46.0) · `Text` (77.0, 56.0) · `No Receipt` (77.0, 66.0) · `Scan for receipt` (77.0, 76.0) — 70×6 |
| CUSTOMER_CART | `Subtotal …` (25.0, 25.0, 54.0, 7.0) · `Tax …` (25.0, 33.0, 54.0, 7.0) · `TOTAL …` (25.0, 42.0, 54.0, 10.0) |

**Layout `STATION`** (STATION_2018, STATION_2, and the **MFD** of STATION_DUO / DUO_2 / DUO_3 · landscape 309.9 × 174.3)

| Screen | Buttons |
|---|---|
| HOME (5 × 2) | `Register` (40.0, 50.0) · `Orders` (90.0, 50.0) · `Transactions` (140.0, 50.0) · `Setup` (190.0, 50.0) · `Sale` (240.0, 50.0) · `Authorizations` (40.0, 100.0) · `Customers` (90.0, 100.0) · `Inventory` (140.0, 100.0) · `Settings` (190.0, 100.0) · `App Market` / `LabSim Dining` (240.0, 100.0) — 36×36 |
| REGISTER_HOME | `Register` (22.0, 10.0) 36×10 · `Tax Item 5` (35.0, 40.0) · `Non-Tax Item 1` (90.0, 40.0) · `Coffee` (35.0, 70.0) · `Catering Deposit` (90.0, 70.0) — 50×24 · `Clear` (190.0, 158.0) 50×16 · `Review Order` (262.0, 158.0) 80×16 |
| REVIEW_ORDER | `Back` (190.0, 158.0) 50×16 · `Pay` (262.0, 158.0) 80×16 |
| PAYMENT | `Cash` (60.0, 80.0) · `Other` (60.0, 110.0) · `Charge` (60.0, 140.0) — 90×18 · `Cancel` (270.0, 160.0) 60×12 |
| TENDER_CASH_DISCOUNT | `Cash` (105.0, 90.0) 100×30 · `Card` (205.0, 90.0) 100×30 (single-display Stations only) |
| PAYMENT_PROMPT | `Cancel` (155.0, 158.0) 60×12 · headline rect (95.0, 70.0, 120.0, 14.0) |
| PIN_ENTRY | columns 125.0 / 155.0 / 185.0, rows 50.0 / 75.0 / 100.0 / 125.0, keys 26×20 · `Cancel` (270.0, 160.0) 50×12 |
| TIP | `15%` (80.0, 80.0) · `18%` (130.0, 80.0) · `20%` (180.0, 80.0) · `22%` (230.0, 80.0) 44×26 · `No Tip` (110.0, 125.0) · `Custom` (200.0, 125.0) 60×16 |
| SIGNATURE | pad (155.0, 80.0) 260×100 · `Clear` (80.0, 158.0) · `Done` (230.0, 158.0) 60×12 |
| RECEIPT_OPTIONS_4 | `Print` (155.0, 60.0) · `Email` (155.0, 80.0) · `Text` (155.0, 100.0) · `No Receipt` (155.0, 120.0) — 120×8 |
| RECEIPT_OPTIONS_5 | QR (155.0, 47.0) 22×22 · `Print` (155.0, 63.0) · `Email` (155.0, 83.0) · `Text` (155.0, 103.0) · `No Receipt` (155.0, 123.0) · `Scan for receipt` (155.0, 143.0) — 120×8 |

On a **Duo** the customer screens appear on the secondary display only (`CFD_*` rows, MINI_GEN3
values); the MFD shows `waiting-for-customer` ("Customer is paying…") meanwhile.

**Text that runners read via UIA** (all layouts): Register cart footer `Subtotal $X`, `Tax $Y`,
`Total $Z`; Review Order lines; Approved label; receipt header. Their content is computed from the
order (§3.9); positions only matter for OCR/GIMP and are defined above where needed.

**Screencap px**: a primary-display screencap is `wPx × hPx` of the type; px = round(mm × px/mm).
The Duo screencap (ADB) contains only the MFD (§3.11).

### 2.11 Cameras and Screen Compare Images

#### 2.11.1 Camera views (1280 × 720 MJPEG, 10 fps) [illus.]

Each camera maps device-screen mm to frame px with `px = ox + s·x`, `py = oy + s·y` (no perspective [sim]).

| Camera (host) | URL | Shows (display → ox, oy, s) |
|---|---|---|
| `cam-wall-e` (`pi-wall-e`) | `http://10.42.10.11:8081/stream.mjpg` | WALL-E Flex 3 primary → 397, 112, 3.5 (plus gantry, dip arm, printer slot) |
| `cam-eve` | `…10.42.10.12…` | EVE Flex 4 → 397, 112, 3.5 |
| `cam-bumblebee` | `…10.42.10.13…` | BUMBLEBEE Mini 3 → 296, 145, 4.0 |
| `cam-r2-d2` | `…10.42.10.14…` | R2-D2 **secondary (CFD)** → 300, 160, 3.947 (MFD not in view) |
| `cam-rackb` (`pi-cam-rackb`) | `http://10.42.10.40:8081/stream.mjpg` | quad: JOHNNY-5 → 239, 36, 2.6 · BAYMAX → 712, 40, 1.6 · SETI → 239, 396, 2.6 · ROSIE → 877, 400, 2.2 |
| `cam-tethered` (`pi-tethered`) | `http://10.42.10.20:8081/stream.mjpg` | MEGATRON MFD → 72, 40, 1.6 · OPTIMUS MFD → 736, 40, 2.6 · MEGATRON CFD → 97, 410, 2.9 · OPTIMUS CFD → 736, 400, 2.6 (2 × 2 as in the photo, labels `MEGATRON MFD DEV1` …) |
| off-screen cameras | as roster | placeholder frame; OCR returns `""` except `c-3po` (same mapping as R2-D2 inside Rack C's quad: 940, 420, 1.6) |

Webcam `Snapshot` (Camera app) saves `~/Pictures/<rig>_<what>.png` as an image ref
`img:webcam:<cameraId>:<physMs>`; GIMP reads text rects from the frame model (§3.12).

#### 2.11.2 Screen Compare Images (`screenCompareImages`)

| id | Name | Robot | Screen | bbox (x, y, w, h) px | Expected | Deprecated | usedBy |
|---|---|---|---|---|---|---|---|
| 1 | `CFD_TOTAL` | r2-d2 | `CFD_CART` | 412, 288, 236, 44 | `TOTAL $10.83` | no | `uia-remote:DuoCfdSuite` |
| 2 | `CFD_THANK_YOU` | r2-d2 | `CFD_THANK_YOU` | 514, 336, 252, 48 | `Thank you` | no | `uia-remote:DuoCheckoutTest` |
| 3 | `CFD_TOTAL_C3PO` | c-3po | `CFD_CART` | 985, 472, 96, 18 | `TOTAL $10.83` | **yes** | — |

Cur M16 deletes row 1 in its setup (the player recreates it); Cur §0.6 values are identical.

### 2.12 Repositories (GitHub org `labsim-lab`)

| Repo | Remote | Default branch | Top level | Factory head |
|---|---|---|---|---|
| `gort` | `git@github.com:labsim-lab/gort.git` | `main` | `cards/`, `config/`, `go-sdk/`, `suites/`, `README.md` | `c41d9e2` "Add INTERAC_CA_TAP card definition" (riley, 2026-10-04 15:12) |
| `uia-remote` | `git@github.com:labsim-lab/uia-remote.git` | `main` | `app/src/{main,test,androidTest}`, `pom.xml`, `config.properties.example`, `.gitignore` (`config.properties`) | `7a20f5b` "Migrate CFD_TOTAL to UIA 2.3 in TaxTestDuo (#398)" (morgan) |
| `pigeon` | `git@github.com:labsim-lab/pigeon.git` | `main` | `runners/{rest,android,windows,ios}/`, `tests/`, `tests/_templates/`, `lstr.json` | `e93b0c4` "LSTR: retry adb connect once" (morgan) |
| `orchestrator` | `git@github.com:labsim-lab/orchestrator.git` | `main` | JHipster app: `.jhipster/*.json`, `src/main/java/com/lab/orca/…`, `src/main/resources/config/liquibase/…`, `src/main/webapp/`, `src/main/docker/` | `3b8d17a` "MerchantConfig: add App ID / App Secret / API Key (#77)" (tate) |

Seeded history (newest first; author keys from `src/content/team.ts`):

| Repo | Commits | PRs |
|---|---|---|
| gort | `c41d9e2` Add INTERAC_CA_TAP card definition (riley) · `9f02a1b` Update MINI_3 receipt coordinates (#418, jared, 10-02) · `5be7c90` Reorganise card definitions under cards/emv/ and cards/nfc/ (jared, 09-28) · `0d3e441` Add 5-option receipt maps for all profiles (#417, jared — "QR receipt hotfix, 48 h") · `a11f2c3` go-sdk: sale_receipt capabilities (david) | #418 merged · #417 merged · #415 closed "Per-rig offsets for QR shift" (closed by Jared: "No offsets. Fix the maps.") |
| uia-remote | `7a20f5b` (#398) · `61cc0de` HomeScreen.open(): vertical on Flex, horizontal on Mini/Station (morgan) · `2f9a7b3` Add RegisterHomeScreen.waitForScreen (morgan) · `b07c1e5` Initial tethered runner (morgan) | #398 merged · #212 "[AI eval] Generated tests for ReceiptScreen" closed (re-opened by Cur M17 setup) |
| pigeon | `e93b0c4` · `4c1f0aa` Add tip_sale_print.json (alex, 10-01) · `8d2e6b9` known_good_actions template (morgan) | — |
| orchestrator | `3b8d17a` (#77) · `c9a0d12` Robot list status filter UI (#64, tate) · `77e1b3f` JHipster entity regen: ScreenCompareImage (tate) | #81 open "WIP: Dockerfile + GCP Cloud SQL profile (planned migration)" (tate, draft) |

Key files (factory content; content team may expand formatting, never semantics):

`gort/config/screen-locations/<DEVICE_TYPE>/<SCREEN>.json` — one file per Orca screen row; the
format is GP INC20's (`deviceType`, `screen`, `unit: "mm"`, `buttons: { "<button>": { "x", "y" } }`).
Orca's rows are synced from these on merge (§3.22.3).

`gort/go-sdk/tests/sale_receipt.json`:
```json
{
  "name": "Go SDK sale with printed receipt",
  "sdk": "go",
  "capabilities": { "goSdk": true, "printer": true },
  "merchant": "${MERCHANT}",
  "steps": [
    { "op": "connect",       "args": { "appId": "${APP_ID}", "appSecret": "${APP_SECRET}", "apiKey": "${API_KEY}" } },
    { "op": "sale",          "args": { "amountCents": 1000, "cardProfile": "${CARD_PROFILE}" } },
    { "op": "printReceipt",  "args": {} }
  ]
}
```

`gort/suites/contact-canada/pin_sale.json` (dynamic half of the Contact Canada lookup):
```json
{ "name": "Contact Canada Interac PIN sale",
  "capabilities": { "deviceType": "COMPACT", "physicalTouch": true },
  "card": "INTERAC_CA_DIP", "expectPin": true, "receipt": "RECEIPT_OPTIONS_4" }
```

`uia-remote/config.properties.example` (tracked) = Cur M14's validator target with
`robotName=CHANGE_ME`. `config.properties` is git-ignored and absent until the player creates it
(Cur M14 seeds the broken one).

`uia-remote` source tree (factory, all correct): `app/src/main/java/com/lab/uia/AppRegistration.java`;
`app/src/test/java/com/lab/uia/runner/MultiDeviceRunner.java` (Cur M13);
`app/src/androidTest/java/com/lab/uia/BaseTest.java`; `…/databases/DbHelper.java`;
`…/pageobjects/{HomeScreen, LockScreen, NavigationBar, RegisterHomeScreen, ReviewOrderScreen,
PaymentScreen, CfdTotalsScreen, CfdPaymentScreen, ReceiptScreen}.java`;
`…/testactions/{HomeScreenTest, ReceiptScreenTest, SaleTest, TaxTest, TaxTestDuo, RefundTest,
DuoCfdSuite, DuoCheckoutTest, PrinterlessSmokeTest, PaycoreMatrixTest, ContactCanadaPinSaleTest}.java`.
Factory `RegisterHomeScreen.java` is GP INC32's file with `waitForScreen()` implemented as
`device.wait(Until.hasObject(reviewOrderBtn), TIMEOUT_MS);` and `reviewOrder()` calling it first;
`TaxTest.java` has `@After public void tearDown() { mfd.run(homeScreen::goHome); cfd.run(homeScreen::goHome); }`;
`DuoCheckoutTest` still asserts `orca.screenCompare("CFD_THANK_YOU")` (INC38's starting point);
`DuoCfdSuite` asserts `orca.screenCompare("CFD_TOTAL")`.

`pigeon/tests/sale/swipe_sale_print.json` (factory, valid, 9 actions; `select print` is step 7 so
the canonical failure reads `step 7/9`):
```json
{
  "name": "Swipe sale with printed receipt",
  "connectionType": "USB",
  "platforms": ["REST", "ANDROID", "WINDOWS", "IOS"],
  "actions": [
    { "action": "create order",   "params": { "item": "Tax Item 5" }, "store": "orderId" },
    { "action": "review order",   "params": { "orderId": "${orderId}" } },
    { "action": "pay",            "params": { "orderId": "${orderId}" } },
    { "action": "card swipe",     "params": { "profile": "VISA_STD_SWIPE", "orderId": "${orderId}" }, "store": "paymentId" },
    { "action": "select tip",     "params": { "robot": "${ROBOT_NAME}", "screen": "TIP", "button": "No Tip" } },
    { "action": "assert approved","params": { "paymentId": "${paymentId}" } },
    { "action": "select print",   "params": { "robot": "${ROBOT_NAME}", "screen": "${RECEIPT_SCREEN}" } },
    { "action": "verify receipt", "params": { "totalCents": 1083 } },
    { "action": "assert home",    "params": {} }
  ]
}
```
`${RECEIPT_SCREEN}` is a **runner-provided variable**: before any receipt action the LSTR Android
runner counts the options on screen via ADB and sets `RECEIPT_OPTIONS_4` or `RECEIPT_OPTIONS_5`
(that is *why* Orca must keep both maps for every profile, Ref §5). On QR rigs (WALL-E, EVE,
BUMBLEBEE, BAYMAX) it resolves to `_5` — INC20/INC21; on JOHNNY-5 (FLEX_1, no QR firmware) to `_4` —
INC22. A file that hard-codes a literal screen name uses it as written (INC21's wrong move; Cur M15's
academy variant hard-codes `RECEIPT_OPTIONS_5` on BUMBLEBEE, which is correct there).

Other Pigeon files: `tests/sale/tip_sale_print.json` (GP INC25's file, valid at factory: comma
present, literal `"screen": "RECEIPT_OPTIONS_4"`; its job's saved `ROBOT_NAME=johnny-5`, a 4-option
rig, so the literal is right; INC25 seeds only the missing comma), `tests/sale/payment_success_compare.json`
(GP INC24 block with factory-correct `x 208, y 512, w 304, h 40`), `tests/tender/windows_tender.json`,
`tests/go/ios_go_smoke.json`, `tests/_templates/known_good_actions.json` (one valid example of every
action, each on its own line, comma-terminated except the last).

`orchestrator/src/main/java/com/lab/orca/domain/enumeration/DeviceType.java`:
```java
package com.labsim.orca.domain.enumeration;

/** The DeviceType enumeration. ALL CAPS — Jenkins env vars must match exactly. */
public enum DeviceType {
    STATION_2018, STATION_2, STATION_DUO, STATION_DUO_2, STATION_DUO_3,
    MINI_2, MINI_3, MINI_4,
    FLEX_1, FLEX_2, FLEX_3, FLEX_4, FLEX_POCKET,
    COMPACT
}
```

### 2.13 Jenkins (`http://jenkins.lab.local:8080`)

**Folders = the legacy platform split** (Ref §1): every job lives in `Java/` or `iOS/`. The split
predates uia-remote, so the modern pipelines also live in `Java/`; they are grouped by **views**:

| View | Include (regex over job path) |
|---|---|
| `All` | `.*` |
| `Java` | `^Java/` |
| `iOS` | `^iOS/` |
| `uia-remote` | `uia-remote-\|contact-canada\|paycore-standalone` |
| `SDK-Go` | `go-sdk` |
| `Pigeon-LSTR` | `/pigeon-` |
| `Laz` | `laz-` |
| `Vision-PoC` | `vision-poc` |

Common parameters (Cur S07): `ROBOT_NAME` (string, blank = any matching Available robot),
`DEVICE_TYPE` (**string**, not a choice — so a saved lower-case value is possible, INC39), `MERCHANT`,
`CARD_PROFILE`, plus `BACKEND_ENV` (default `DEV1`) and `BRANCH` (default `main`) [illus.].

| Job | Runner · platform | Saved params (defaults) | Capabilities (script line / dynamic source) | Test | Next # |
|---|---|---|---|---|---|
| `Java/uia-remote-regression-flex` | uia-remote · android | `ROBOT_NAME=` `DEVICE_TYPE=FLEX_3` `MERCHANT=AUTO-US-NOPIN-01` `CARD_PROFILE=VISA_STD_SWIPE` `BACKEND_ENV=DEV1` | `def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch: true]` | `HomeScreenTest`, `SaleTest` | 4120 |
| `Java/uia-remote-regression-mini` | uia-remote · android | as above, `DEVICE_TYPE=MINI_3` | same line | `HomeScreenTest`, `SaleTest` | 2210 |
| `Java/uia-remote-tethered-tax` | uia-remote · android | `ROBOT_NAME=` `MERCHANT=AUTO-US-NOPIN-01` `CARD_PROFILE=VISA_STD_SWIPE` `BACKEND_ENV=DEV1` (PL2 alternates `DEV1`/`STG`) | `def capabilities = [tethered: true, duo: false]` | `TaxTest`, `RefundTest` (in that order; INC35) | 1830 |
| `Java/uia-remote-duo-cfd` [illus.] | uia-remote · android | `BACKEND_ENV=DEV1` | `def capabilities = [deviceType: 'STATION_DUO', tethered: true]` | `DuoCfdSuite`, `DuoCheckoutTest` | 640 |
| `Java/uia-remote-printerless-smoke` [illus.] | uia-remote · android | `DEVICE_TYPE=STATION_DUO_2` | `def capabilities = [deviceType: params.DEVICE_TYPE]` | `PrinterlessSmokeTest` | 310 |
| `Java/pigeon-android-sale-swipe` | pigeon · android | `ROBOT_NAME=` `BACKEND_ENV=DEV1` | `def capabilities = [physicalTouch: true, printer: true, tethered: false]` | `pigeon:tests/sale/swipe_sale_print.json` | 5402 |
| `Java/pigeon-android-tip-sale` [illus.] | pigeon · android | `ROBOT_NAME=johnny-5` `BACKEND_ENV=DEV1` | same | `pigeon:tests/sale/tip_sale_print.json` | 880 |
| `Java/pigeon-android-payment-compare` [illus.] | pigeon · android | `ROBOT_NAME=eve` | `def capabilities = [physicalTouch: true]` | `pigeon:tests/sale/payment_success_compare.json` | 45 |
| `Java/pigeon-windows-tender` [illus.] | pigeon · windows | — (no robot) | — | `pigeon:tests/tender/windows_tender.json` | 212 |
| `Java/go-sdk-sale-smoke` | go-sdk · go | `ROBOT_NAME=` `MERCHANT=GO-SDK-US-01` `CARD_PROFILE=VISA_STD_DIP` `BACKEND_ENV=DEV1` | dynamic: `def capabilities = readJSON(file: 'go-sdk/tests/sale_receipt.json').capabilities` | `gort:go-sdk/tests/sale_receipt.json` | 1290 |
| `Java/contact-canada-pin-sale` | uia-remote · android | `ROBOT_NAME=` `MERCHANT=WESTERS-CA-01` `CARD_PROFILE=INTERAC_CA_DIP` `BACKEND_ENV=DEV1` | **both**: `def capabilities = [deviceType: 'COMPACT', physicalTouch: true]` + `def dynamicCaps = readJSON(file: 'suites/contact-canada/pin_sale.json').capabilities` | `ContactCanadaPinSaleTest` | 733 |
| `Java/laz-oobe-merchant-swap` | laz | `ROBOT_NAME` (required) `MERCHANT` (required) | named only | — | 512 |
| `Java/paycore-standalone-matrix` [illus.] | uia-remote · android | `ROBOT_NAME=rosie` `MERCHANT=PAYCORE-STANDALONE-01` `CARD_PROFILE=VISA_STD_DIP,DISCOVER_MATRIX_DIP,AMEX_MATRIX_DIP` | `def capabilities = [deviceType: 'FLEX_POCKET', physicalTouch: true]` | `PaycoreMatrixTest` | 2077 |
| `Java/vision-poc-receipt-check` [illus.] | vision | `ROBOT_NAME=wall-e` | `def capabilities = [physicalTouch: true, printer: true]` | Ollama `llava` | 96 |
| `Java/nightly-java-regression` [illus.] | trigger | — | — | builds every other `Java/*` job (02:00) | 61 |
| `iOS/pigeon-ios-go-sdk-smoke` | ios · ios | `ROBOT_NAME=astro` `BACKEND_ENV=QA` | `def capabilities = [phone: true]` | `pigeon:tests/go/ios_go_smoke.json` | 377 (last run today 06:12, SUCCESS) |
| `iOS/pigeon-ios-lstr-legacy` [illus.] | ios · ios | — | — | legacy LSTR iOS runner | 19 (last run 2026-03-02, SUCCESS) |

Every job script is a short Jenkinsfile; the sim reads only the lines matching §3.18.2. Example:

```groovy
// Java/uia-remote-regression-flex — Jenkinsfile (excerpt) [illus.]
def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch: true]

pipeline {
  agent { label 'lab-executor' }
  stages {
    stage('Checkout SCM')      { steps { git url: 'git@github.com:labsim-lab/uia-remote.git', branch: params.BRANCH } }
    stage('Checkout robot')    { steps { script { robot = orca.checkout(name: params.ROBOT_NAME, env: params.BACKEND_ENV, capabilities: capabilities) } } }
    stage('Merchant')          { steps { script { orca.ensureMerchant(robot, params.MERCHANT) } } }
    stage('Inject environment'){ steps { script { env.putAll(orca.runtimeEnv(robot, params)) } } }
    stage('Run tests')         { steps { sh './gradlew connectedAndroidTest -Psuite=RegressionFlex' } }
  }
  post { always { script { orca.release(robot) } } }
}
```

Seeded history: each job has its last 5 builds (all SUCCESS, robots per PL table) so the UI is not empty.

### 2.14 Chat, NPC and workstation seeds

* Channels: `#lab-automation`, `#orca-alerts` (health-check posts: `:red_circle: eve → Connection Failed (GET http://10.42.10.12:8000/health → connect timed out after 10000 ms)`), `#jenkins` (red builds), `dm:<npc>`.
* Workstation: adb server stopped; no connections; `~` contains `IdeaProjects/` (empty until clones),
  `Pictures/`, `Downloads/walle_receipt_0912.jpg` (INC57/M17 receipt photo, image ref
  `img:receipt:wall-e:0912`); ssh keys present; `configProperties = {}`.
* Coworker ADB knowledge: in factory the workstation ADB server knows nothing; Cur M14 and INC27
  seed `10.42.60.4:5555` as the first known device (setup op `ws.adbKnows`).
* 3D printers idle; `cradle_flex_gen3.3mf`, `cradle_mini3.3mf`, `cradle_station.3mf` on the CAD PC.

---
## 3. Behaviours and state machines

Every rule below is deterministic given (state, inputs, rng streams). Exact strings are normative:
put them in `src/sim/text/` and snapshot-test them.

### 3.1 Tick

#### 3.1.1 Order of systems inside `sim.tick(dtGameMs)`

`dtPhysMs = dtGameMs / timeScale` (0 for pure game-clock jumps). The tick is split into sub-steps of
≤ 50 ms physical (one sub-step when `dtPhysMs == 0`); game time advances proportionally. Within a
sub-step the systems run in this fixed order, all inside one `transact()`:

| # | System | Does |
|---|---|---|
| 1 | clock | advance `nowMs`, `physMs` (due `timers` are handled by the system owning their kind prefix, in that system's slot, §6.2) |
| 2 | power | solve the graph (§3.13): energised nodes, currents, fuse stress/blow, brown-outs, sparks, damage |
| 3 | hosts | OS boot/shutdown progress, service readiness, crash on power loss, corporate disk fill, scheduled tasks |
| 4 | network | refresh `arp`, link states |
| 5 | rigs | motion queue, solenoid strokes, actuators, homing, lock, banner, tablet reachability |
| 6 | devices | boot, battery, screen auto-advance, render completion, transaction timers, printer payloads, pay-display link |
| 7 | collis/callus | armed swipes, probe LEDs, Callus log |
| 8 | orca | DB reconnect, pending gort syncs, **health check when `nowMs` crosses a multiple of 300 000** |
| 9 | jenkins | schedules (game clock), queue → executors, stage machine, runners step — **devops** |
| 10 | local runs | IntelliJ runners step — **devops** |
| 11 | ollama | inference completion — **devops** |
| 12 | git / npc | scripted reviews and merges, NPC delays and replies — **devops** |
| 13 | laz / ubi | OOBE step machine (a Laz run started by a build in step 9 advances in the same sub-step) |
| 14 | printer3d | print jobs |
| 15 | faults | auto-resolve check (§4.1) |
| 16 | housekeeping | caps (log 500, chat 200, consoles 400 lines, builds 20/job, notes 50/robot, statusHistory 100) |

Steps 9–12 are one call, `tickDevops(lab, ctx, dtGameMs, dtPhysMs)` (`src/sim/devops`); the rest are
sim-core. Player/API actions (`sim.*`) run in their own `transact()` between ticks and may enqueue rig
commands, timers or runner steps; they never advance time.

#### 3.1.2 Timers

`SimTimer` is the only way to "do X later" (no `setTimeout` in `src/sim`). Kinds used:
core — `host.serviceReady`, `host.bootDone`, `host.schedTaskDone`, `host.policyRestore`, `device.bootDone`,
`device.autoAdvance`, `device.toastEnd`, `rig.cmdDone`, `callus.armExpire`, `callus.armFire`,
`orca.dbReconnect`, `orca.gortSync`, `orca.hrnPush`, `laz.step`, `printer3d.done`, `chat.deliver`;
devops — `jenkins.stage`, `jenkins.poll`, `runner.wait`, `local.wait`, `git.push`, `npc.review`,
`npc.reply`, `ollama.done`. (Fuse stress is per tick, not a timer.) Ownership by prefix and dispatch
order: §6.2.

### 3.2 Orca robot status machine

Statuses (canon; UI labels): `AVAILABLE` Available · `UNAVAILABLE` Unavailable · `OFFLINE` Offline ·
`CONNECTION_FAILED` Connection Failed · `RESERVED` Reserved.

#### 3.2.1 Transitions

| From | To | Trigger | Actor | Rule / side effects |
|---|---|---|---|---|
| any except `CONNECTION_FAILED` | `AVAILABLE` / `UNAVAILABLE` / `OFFLINE` | Orca UI Edit → Status, or `PUT /api/robots/{id}/status` | person | Allowed. Note `STATUS <From> → <To> (<who>)`. Leaving `RESERVED` clears `reservedBy/reservedAtMs`. |
| any except `CONNECTION_FAILED` | `RESERVED` | same | person | Sets `reservedBy = who`, `reservedAtMs = now`. Note `STATUS … → Reserved (<who>)`. |
| `CONNECTION_FAILED` | `AVAILABLE`/`UNAVAILABLE`/`OFFLINE`/`RESERVED` | manual | person | Allowed after the UI confirm dialog "This robot failed its last health check (<error>). Override anyway?". Clears `preFailureStatus`. If the cause persists the next ping flips it back (unless the new status is OFFLINE or RESERVED). (GW24 is GP's penalty.) |
| any | `CONNECTION_FAILED` | manual | person | **Rejected**: `400 Bad Request: Connection Failed is set by the health check only`. |
| `AVAILABLE`, `UNAVAILABLE` | `CONNECTION_FAILED` | health check ping fails (non-200 or no response) | `orca-health-check` | `preFailureStatus = from`. HEALTH note. Checkouts now blocked. `#orca-alerts` post. |
| `CONNECTION_FAILED` | `preFailureStatus ?? AVAILABLE` | **first** successful (200) ping | `orca-health-check` | Recovery note `→ 200 OK · status restored to <Status>`; `preFailureStatus = null`. Only a robot that *is* `CONNECTION_FAILED` changes on success. |
| `RESERVED` | — | any ping result | — | Never changed by the health check; no note; `lastHealth` not updated (Reserved blocks health-check overrides, Ref §3). |
| `OFFLINE` | — | — | — | Not pinged. |
| any (named-checkout of an `UNAVAILABLE` rig) | `UNAVAILABLE` | the named build finishes / aborts | `orca` | §3.4.5 auto-reset. |
| — | — | checkout / release otherwise | — | **Never** change status. A checked-out rig shows `Available · in use by Jenkins #4127`. |

`setRobotStatus` validation errors (exact): unknown status → `400 Bad Request: Invalid value for
status: '<v>'`; robot not found → `404 Not Found`. Orca DB down → `500 Internal Server Error` (§3.14.5).

#### 3.2.2 Who can check out what

| Status | General (unnamed) pipeline | Named (`ROBOT_NAME` = exact Name) | Health check | Tablet |
|---|---|---|---|---|
| AVAILABLE | yes | yes | pinged | normal |
| UNAVAILABLE | **no** (`… — skipped (name it to use it)`) | **yes**, then auto-reset to Unavailable | pinged | normal |
| OFFLINE | no | no (`409 … is Offline`) | **skipped** | normal |
| CONNECTION_FAILED | no | no (`409 … is Connection Failed`) | pinged (recovery) | per cause |
| RESERVED | no | no (`409 … is Reserved (<who>)`) | pinged, result ignored | normal |

Orca UI **Check out** button (manual, M06): same rules; toast for blocked rigs exactly
`Robot is blocked from checkouts (Connection Failed)` (or `(Reserved)`, `(Offline)`); for an
Unavailable rig `Robot is Unavailable — pass its exact Name in the job to use it`.

### 3.3 Health check (the 5-minute synchronized background thread)

#### 3.3.1 Schedule

* Fires when the game clock crosses `nowMs ≡ healthAnchorMs (mod 300 000)` — 08:05, 08:10, … (GP SR01).
  If one tick crosses several multiples (fast-forward jump), it runs **once per multiple**, in order,
  each against the state at that moment (state does not change between them inside a jump).
* `orca.runHealthCheckNow()` (tutorial **Force health check**, `config.forceHealthCheckAllowed`)
  runs the same procedure immediately; the regular schedule is unchanged.
* Preconditions: `orca-vm` running, `orca` service up, `orca.app.dbConnected`. Otherwise the run is
  skipped with log `health-check run #N aborted: JDBCConnectionException: Communications link failure`
  (DB down) or not run at all (app down). Statuses are frozen meanwhile.

#### 3.3.2 Procedure (one run)

```
runCount += 1; T = nowMs; for robot in robots ordered by id:
  if robot.status == OFFLINE:  log "<name>  SKIPPED (Offline)"; continue
  endpoint = "http://" + host(robot.adbServiceUrl) + ":8000/health"          // Orca derives the Pi from the Robot ADB Service URL
  r = ping(endpoint, robot)                                                  // §3.3.3 — evaluated against current state, instantaneous [sim]
  if robot.status == RESERVED: log "<name>  RESERVED — not overridden"; continue
  robot.lastHealthCheckMs = T; robot.lastHealthCheckOk = r.ok; robot.lastHealth = {T, endpoint, r.http, r.error, r.latencyMs}
  if r.ok:
     if robot.status == CONNECTION_FAILED: restore → preFailureStatus ?? AVAILABLE; note recovery; log "<name>  200 OK (<ms> ms) → <STATUS> (recovered)"
     else log "<name>  200 OK (<ms> ms)"
  else:
     if robot.status in (AVAILABLE, UNAVAILABLE): set CONNECTION_FAILED (preFailureStatus = old); add HEALTH note
     else /* already CONNECTION_FAILED */: same text as newest unresolved HEALTH note ? note.repeat += 1 : add HEALTH note
     log "<name>  FAIL <errorText> → CONNECTION_FAILED"
emit orca.healthCheckRan; post #orca-alerts lines for each new failure and recovery
```

An empty or malformed `adbServiceUrl` fails with error text `invalid Robot ADB Service URL ''`.
Notes are written with timestamp `T` (the request time) even though a timeout "takes" 10 s [sim].

#### 3.3.3 What `GET http://<pi>:8000/health` returns

Evaluated in order (reachability per §1.9):

| # | Condition | Result `http` | Error text written to Notes (after `→ `) |
|---|---|---|---|
| 1 | Pi unreachable: powered off, `os` `HUNG`/`OFF`, booting < 12 s, Ethernet `UNPLUGGED`, `DAMAGED` on an odd attempt, switch down | `null` | `connect timed out after 10000 ms` |
| 2 | Pi reachable, `robot-controller` not running (booting 12–35 s, crashed, stopped, config error) | `null` | `Connection refused` |
| 3 | Pi disk full (fault) | 500 | `500 Internal Server Error {"error":"robot-controller: No space left on device"}` |
| 4 | `controller.yaml` `motion: nuc://<ip>:<port>` and that host unreachable | 502 | `502 Bad Gateway {"error":"motion upstream 10.42.20.3:9100 unreachable"}` |
| 5 | motion host reachable but its motion service failing (NUC disk full) | 502 | `502 Bad Gateway {"error":"motion upstream 10.42.20.3:9100 error: No space left on device"}` |
| 6 | `motion: local` but the 25-pin motor PCB is not on this Pi's USB | 503 | `503 Service Unavailable {"error":"motion: 25-pin controller not found on /dev/ttyACM0"}` |
| 7 | `callus:` upstream host unreachable (box off / hung / unplugged) | 502 | `502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}` |
| 8 | Callus host up but service stopped | 502 | `502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 error: Connection refused"}` |
| 9 | otherwise | 200 | — (`200 OK`, body `{"status":"ok","robot":"wall-e"}`; shared Pi: `{"status":"ok","robots":["megatron","optimus"]}`) |

Not part of `/health` (GP SR03): the camera service, the webcam, MOTOR/steppers state, the lock,
Collis probes, cardprog/Wine, the LabSim device itself. (That is why INC08/INC13/INC17/INC18/INC56
leave rigs Available.) Shared Pis answer identically for every rig they serve, so their rigs fail
and recover **together, with the same timestamp** (INC01-C, INC02).

Latency: 200 → 20–60 ms (`devices` rng), refused → 2 ms, 502/500/503 → 30–80 ms, timeout → 10 000 ms.

#### 3.3.4 Exact Notes and health-log formats

Notes (Orca robot detail → Notes, newest first; `kind`):

```
2026-10-05 08:15:00 GET http://10.42.10.12:8000/health → connect timed out after 10000 ms          (HEALTH)
2026-10-05 08:15:00 GET http://10.42.10.13:8000/health → 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}
2026-10-05 08:20:00 GET http://10.42.10.12:8000/health → 200 OK · status restored to Available     (HEALTH, recovery)
2026-10-05 08:21:13 STATUS Available → Reserved (riley)                                          (STATUS)
2026-10-05 08:22:40 CONFIG urls.camera changed (alex)                                            (CONFIG)
2026-10-05 08:23:05 STATUS Available → Unavailable (orca: named job Java/paycore-standalone-matrix#2077 finished)
```
Repeated identical failures render as one line with suffix ` (×3, last 08:25:00)`. CONFIG field
names: `name`, `humanReadableName`, `deviceId`, `mfdDeviceId`, `cfdDeviceId`, `urls.adb`, `urls.camera`,
`urls.dip`, `urls.tap`, `urls.swipe`, `offsets.x`, `offsets.y`, `merchant`, `capabilities`.

Health log (Orca → Administration → Health log), one block per run:

```
2026-10-05 08:15:00  health-check run #4 — 41 pinged, 1 skipped, 1 failed, 0 recovered
wall-e  200 OK (34 ms)
eve  FAIL connect timed out after 10000 ms → CONNECTION_FAILED
…
baymax  SKIPPED (Offline)
mother  RESERVED — not overridden
sonny  FAIL connect timed out after 10000 ms → CONNECTION_FAILED
```

`#orca-alerts` posts: `:red_circle: eve → Connection Failed (GET http://10.42.10.12:8000/health → connect timed out after 10000 ms)`
and `:large_green_circle: eve recovered → Available`.

### 3.4 Checkout and release

#### 3.4.1 Request

```ts
interface CheckoutRequest {
  buildId: string; jobId: string;
  robotName?: string;                 // ROBOT_NAME param, trimmed; '' = unnamed
  deviceType?: string;                // raw DEVICE_TYPE value as typed (validated here)
  capabilities?: Record<string, string | boolean>;    // NON_DYNAMIC map parsed from the job script
  dynamicCapabilitiesJson?: string;   // DYNAMIC_JSON "capabilities" object from the test definition
  environment: string;                // BACKEND_ENV param (default "DEV1")
  kind: 'jenkins' | 'manual';
}
```

#### 3.4.2 Algorithm (`orca.checkout`)

1. Orca down → `[orca] checkout request … → connect timed out` / app up but DB down → `[orca] checkout request … → 500` (`ORCA_DOWN` / `ORCA_DB_DOWN`).
2. Console first line when a device type is involved: `[orca] checkout request deviceType=<raw>`.
3. **Enum validation**: every `deviceType` value (param or either capability source) goes through
   `DeviceType.valueOf`. Failure prints exactly
   `java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.<raw>`
   → `ENUM_CASE`. (`flex_3`, `Flex_3`, `FLEX3`, `FLEX-3`, `FLEX_GEN3`, `mini_3` all fail; INC39, DR11.)
4. **Merge requirements** `R = nonDynamic ∪ dynamic`. Same key with different values →
   `[orca] 409 Conflict: capability conflict (pipeline deviceType=MINI_3, test deviceType=COMPACT)`
   (format `capability conflict (pipeline <k>=<v1>, test <k>=<v2>)`, first conflicting key in canonical
   order) → `CAPABILITY_CONFLICT`. A key that is neither derived (§2.7.1) nor in the capability
   catalogue → `[orca] 400 Bad Request: unknown capability '<k>'` → `UNKNOWN_CAPABILITY`. Print
   `[orca] capabilities: deviceType=FLEX_3, physicalTouch=true (non-dynamic)` (sources listed:
   `non-dynamic`, `dynamic: <file>`, or `non-dynamic + dynamic: <file>`).
5. **Named** (`robotName != ''`): exact, case-sensitive match on `name` (not HRN).
   * none → `[orca] 404 Not Found: no robot named 'ROSIE'` → `ROBOT_NOT_FOUND`.
   * status RESERVED/OFFLINE/CONNECTION_FAILED → `[orca] 409 Conflict: robot eve is Reserved (riley)` /
     `… is Offline` / `… is Connection Failed` → `ROBOT_BLOCKED`.
   * checked out by another build → wait (poll 10 s): `[orca] robot rosie is in use by Jenkins #2077 — waiting`.
   * else check out **without capability or environment matching** (preflight in §3.18.3 re-checks):
     `Checked out robot rosie (named)`.
6. **Unnamed**: candidates = robots with `environment == request.environment` whose capability
   document matches every key of `R` (strict equality; missing key = `false`). Order candidates by
   `lastReleasedMs` ascending (never-used first), then `id` (least-recently-used load balancing — why
   INC23 lands on VISION).
   * no candidate → `[orca] No robot matches <summary>` → `NO_MATCH` (summary = `R` as `k=v` in
     canonical order).
   * first candidate that is `AVAILABLE` and not checked out → `[orca] checkout → wall-e (FLEX_3) OK`.
   * otherwise, if **every** candidate is `UNAVAILABLE` → `No Available robot matches FLEX_POCKET (rosie is Unavailable)`
     (label = required `deviceType` or the summary; names joined `, `, `are` for plural) → `ONLY_UNAVAILABLE`.
   * otherwise print one skip line per candidate — `[orca] candidate eve: Reserved — skipped`,
     `… Connection Failed — skipped`, `… Offline — skipped`, `… Unavailable — skipped (name it to use it)`,
     `… in use by Jenkins #4127 — skipped` — then `[orca] no Available FLEX_3 robot — build waiting in queue`
     (label = `deviceType` value, else `matching`). The build stays in stage `Checkout robot`, polls every
     10 s physical, reprints skip lines only when the set of reasons changes, and prints
     `[orca] still waiting (N s)…` every 60 s. No timeout (INC48 "waiting forever").
7. On success: `robot.checkout = { buildId, jobId, byName, startedMs: now, statusAtCheckout: status, kind }`;
   the rig's dashboard locks (§3.7.6); audit `CHECKOUT`; event `robot.checkedOut`.

#### 3.4.3 Match preview (`orca.matchPreview(capsJson, environment)`, Cur §7)

Runs step 4 + 6 without side effects and returns every robot with `matches` (bool), the first
failing key (`printer: required true, robot false`), and its status. Default environment `DEV1`.
INC23 seed: `{"goSdk": true}` lists `vision`, `tars`, `data` (all DEV1); with `"printer": true`, `vision` drops out.

#### 3.4.4 Collisions (local run + Jenkins on the same rig)

If a Jenkins build checks out a rig whose device(s) a running **local** IntelliJ run is driving
(Orca has no record of local runs unless the engineer set Reserved), both runners act on the same
device. Rule [sim]: the first action of one runner that changes the screen out from under the
other makes the other's next `waitForScreen`/assert fail: local run → `androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT=Review Order]`
and `overlappedJenkins = true`; build → `[runner] unexpected screen: register (expected review-order)` → `UI_NOT_FOUND`. (INC31.)

#### 3.4.5 Release

Always runs (success, failure, abort): `robot.checkout = null`, `lastReleasedMs = now`, dashboard unlocks.
**Named auto-reset**: if `checkout.byName && checkout.statusAtCheckout == UNAVAILABLE && status != UNAVAILABLE`
(someone changed it during the run) → status := `UNAVAILABLE` with note
`STATUS <X> → Unavailable (orca: named job <job>#<n> finished)`. Console prints the status after
release: `[orca] released rosie → Unavailable` / `[orca] released wall-e → Available` (GP §3.2).
A rig that was Available when a general job took it (INC40) is released as Available — nothing resets it.

### 3.5 `xy_touch`

#### 3.5.1 Request

`POST /api/xy_touch` body `{"robot":"wall-e","screen":"TENDER_CASH_DISCOUNT","button":"Cash"}`,
optional `"target":"MFD"|"CFD"` for tethered pairs. Caller identity (`actor`) = the build/local run
holding the checkout, or the player (curl / Orca **Test tap**).

#### 3.5.2 Algorithm

1. Orca up/DB up (else timeout/500).
2. Robot by exact Name → `404 Not Found: no robot named 'x'`.
3. **Target device & display**: tethered (MFD ≠ CFD): `target` or, if absent, `CFD` when the
   screen name starts with `CFD_` else `MFD` (runners always pass `target` on tethered rigs); Duo
   (MFD = CFD or Duo type): the Robot Device, display = the screen row's `display` (`CFD_*` →
   secondary); otherwise the Robot Device, primary.
4. **Lookup** Screen `(target device's deviceType, screen)` and its Location `(button)`; either missing →
   `[orca] 404 Not Found: no Screen Location for (STATION_2018, RECEIPT_OPTIONS_5, "Email")`.
5. **Offsets**: `x = loc.xMm + robot.offsetXMm`, `y = loc.yMm + robot.offsetYMm` (applied in both
   modes — Orca does not know they were meant for limit switches).
6. **Lock check**: robot checked out and caller is not the holder → `423 Locked: robot wall-e is in use by Jenkins #4127`.
7. **Mode**: `PHYSICAL_TAP` if the rig has a gantry and `rig.probeDisplay` is the target display;
   else `ADB_TOUCH` if the target display is ADB-visible (every primary display; never a Duo
   secondary); else `422 Unprocessable Entity: secondary display of STATION_DUO is not exposed to ADB and robot <r> has no probe on it`.
8. **PHYSICAL_TAP preconditions** (first failure wins; codes [illus.]):

| Check | Response |
|---|---|
| Pi reachable, `robot-controller` up | `502 Bad Gateway: robot controller 10.42.10.11:8000 unreachable` |
| motion host OK (`motion: local` + PCB on USB, or NUC host healthy) | `502 Bad Gateway: motion upstream 10.42.20.3:9100 error: No space left on device` |
| `motorSwitch` on and MOTOR terminal energised | `503 Service Unavailable: MOTOR_POWER_LOST` |
| `steppersEnabled` | `503 Service Unavailable: STEPPERS_DISABLED` |
| `motionFault == null` | `409 Conflict: MOTION_FAULT (<fault>)` |
| `magneticLock.engaged && homed` | `409 Conflict: LOCK_RELEASED (park required)` |
| target within travel | `400 Bad Request: target (x, y) outside travel` |

   Then enqueue `moveTo(x, y)` + `tap` (ref = request id). Orca answers **after the Pi reports the
   stroke done** (move time + 200 ms) with
   `200 {"result":"OK","mode":"PHYSICAL_TAP","x_mm":22.0,"y_mm":58.5}`. The response never says
   whether a button was hit — Orca cannot know (that is the "select print" trap).
9. **ADB_TOUCH preconditions**: Pi reachable and `adb-service` up (`502 … robot controller … unreachable`);
   device reachable from the Pi over ADB (TCP `ip:adbTcpPort == 5444`, or USB on the ADB shelf) →
   else `502 Bad Gateway: adb: device 10.42.30.31:5444 not found`. Convert mm → device px
   (`round(mm × px/mm)`), inject `input tap px py` on display 0, answer
   `200 {"result":"OK","mode":"ADB_TOUCH","x_mm":…,"y_mm":…}` after 120 ms.
10. Emit `orca.xyTouch` with `hitButton` from the device.

#### 3.5.3 Mode examples (Cur M09)

`wall-e`/`TENDER_CASH_DISCOUNT`/`Cash` → `PHYSICAL_TAP` (22.0, 58.5); same on `tars` → `ADB_TOUCH`;
`r2-d2`/`CFD_RECEIPT_DONE`/`Done` → `PHYSICAL_TAP` (CFD probe); `r2-d2`/`REVIEW_ORDER`/`Pay` →
`ADB_TOUCH` (MFD); `megatron` (`target: CFD`)/`TIP`/`No Tip` → `ADB_TOUCH` on the Mini 2.

#### 3.5.4 Hit test on the device (firmware truth)

Buttons come from the device type's layout (§2.10.2) for the screen currently shown on that display.

* **ADB / player finger / UIA click**: press iff the point is inside the button rect (edges
  inclusive). Otherwise nothing.
* **Probe (solenoid)**: contact point `p = commanded + tilt`, where a cracked cradle adds
  `dy = x · tan(cradleTiltDeg)` (pivot at the screen's left edge; 2° ⇒ 0.035 mm per mm of x). Then
  the button `b` containing `p` is pressed **only if `|p.x − b.cx| ≤ core(b)` and `|p.y − b.cy| ≤ core(b)`**
  with `core(b) = clamp(0.10 × min(b.w, b.h), 1.0, 2.5)` mm. Inside the rect but outside the core =
  `EDGE_REJECT` (no press; logcat `InputReader: touch rejected (edge contact, pressure 0.12)`); outside
  every rect = `MISS`. [sim] — real probes are a little more forgiving; the sim makes "mm-level drift
  breaks suites" deterministic. Consequences used by incidents:

| Situation | Error | Outcome |
|---|---|---|
| Measured coordinates within ±0.5 mm | ≤ 0.5 | always hits (every core ≥ 1.0) |
| BUMBLEBEE Offset Y 1.5 (INC14) | 1.5 | hits icons/items (core 1.6–2.4), **misses `PAYMENT/Charge`** (core 1.2) |
| QR shift: stale `_5` rows 3.0 mm high (INC20) | 3.0 | misses every receipt row (core 1.0) |
| FLEX_1 Print 62.5 vs 66.5 (INC22) | 4.0 | misses (lands in the gap above Print) |
| EVE cradle 2° (INC59) | 0.035·x | left-side targets hit; `Review Order` at x 56.0 (dy 1.96, core 1.2) misses |
| Flex 2 driven with FLEX_1 rows (INC42 skipped relink) | (1.4, 3.0) on Register | miss |

* Disabled buttons: printerless `Print` → press shows toast `Printer not available`; hidden buttons
  (e.g. `22%` for 3-percent merchants) behave as absent.
* `solenoidConnector == 'LOOSE'`: the plunger never fires — no contact at all (INC15).
* Strokes (solenoid down while moving, or ADB `input swipe`): on a signature pad → +1 stroke; on a
  launcher in its scroll direction with ≥ 20 mm travel → page ±1; elsewhere ignored.
* Slow strokes (`Lower`/`Raise`, 400 ms dwell) register like taps.

### 3.6 Card actions (`/api/card/{swipe|dip|tap}`)

Body `{"robot":"wall-e","profile":"VISA_STD_DIP"}`. Flow (first failure wins; console prefixes from GP §3.2):

1. Robot by Name (404); profile by exact name → `404 Not Found: no card profile 'X'`.
2. Endpoint must match `profile.entry` → `400 Bad Request: profile VISA_STD_DIP is a DIP profile; use /api/card/dip`.
3. URL mapping for the entry (`swipeUrl`/`dipUrl`/`tapUrl`) empty or null →
   `[orca] 400 Bad Request: robot johnny-5 has no Tap URL` (INC65).
4. Callus host (`rig.callusHostId`): unreachable → `[callus] 10.42.20.1:9000 unreachable`; service
   stopped → `[callus] 10.42.20.1:9000 error: Connection refused` (`502`).
5. Probe (`rig.collisId`): not powered → `[callus] probe collis-wall-e: PROBE_OFFLINE`; ribbon unseated →
   `PROBE_NO_LINK`; fried → `PROBE_FAULT` (`502`).
6. **SWIPE**: Callus pushes the raw Track Data to the probe — `[callus] swipe VISA_STD_SWIPE → probe collis-wall-e OK`.
   **DIP/TAP**: Callus maps the Gort path to its local clone, `C:\gort\` + path with `/`→`\`:
   * present in `callus.localCardFiles[box].files` → `[callus] map cards/emv/visa_std_dip.json → C:\gort\cards\emv\visa_std_dip.json · load virtual card OK · probe wall-e: DIP`
   * absent → `[callus] map cards/visa/visa_std_dip.json → C:\gort\cards\visa\visa_std_dip.json · FileNotFoundException (The system cannot find the path specified)` (`500`, INC53/INC54).
   Then the Pi's Wine card programmer conditions the probe card: `cardprog` running →
   `[pi] cardprog: program VISA_STD_DIP → OK`; else `[pi] cardprog: program VISA_STD_DIP → 503 CARDPROG_UNAVAILABLE` (INC56).
7. Mechanical presentation via the Pi URL: SWIPE → probe emulates the stripe in place (no motion,
   0.4 s); DIP → rig `dipIn` (1.2 s); TAP → rig `tapIn` (0.8 s). Tethered rigs: SWIPE only, through
   the SmartStripe probe on the CFD.
8. Response `200 {"result":"OK","entry":"DIP","probe":"collis-wall-e","callus":"10.42.20.1:9000"}` after
   the load (mechanics continue asynchronously).
9. **Arming**: if the customer-facing display is not on `payment-prompt` when the card is ready, the
   probe is **armed** (`armed`, log `[callus] swipe VISA_STD_SWIPE armed on smartstripe-megatron (fires at payment prompt)`)
   and fires 0.8 s after that display reaches `payment-prompt` (log `… fired → OK`); an arm expires after
   60 s physical (`ARM_TIMEOUT`). This is how the Tax test "loads a simulated swipe card" at MFD_O1
   (Ref §4) and presents it at Step 4.
10. The device then receives a **card event** `{entry, profileId, trackData | cardFile}`:
    * dip arm misaligned → the ribbon strikes the bezel: device logcat `CHIP_READ_ERROR`, toast
      `Card read error, try again`, console `[device] CHIP_READ_ERROR` (INC16).
    * card events at any screen other than `payment-prompt` are ignored (`Card not expected`).
    * after `approved`/`declined` Orca auto-sends `dipOut`/`tapOut`.

Card read validation on the device (§3.9.3): Track 1 must match
`^%B(\d{12,19})\^([^^]{2,26})\^(\d{4})(\d{3})[^?]*\?` and Track 2 `;(\d{12,19})=(\d{4})(\d{3})[^?]*\?`,
both present, same PAN, PAN Luhn-valid, expiry ≥ `2610` → else `SWIPE_ERROR: invalid track data`
(INC55). Dip/tap files must parse as JSON with `pan`, `expiry`, `aid` → else `CHIP_READ_ERROR`.

### 3.7 Touch-robot rigs: motion, solenoid, actuators, lock, banner, tablet

#### 3.7.1 Commands (status tablet → Motion Control; `sim.rig.command`)

| Tablet group / button | `RigCommandName` | Effect | Duration (physical) | Needs |
|---|---|---|---|---|
| Steppers · Enable | `steppers.enable` | `steppersEnabled = true`; position unknown ⇒ `homed = false` (banner turns yellow if MOTOR powered) | 0.2 s | MOTOR power for holding |
| Steppers · Disable | `steppers.disable` | `steppersEnabled = false`, `homed = false`, magnetic lock de-energised (`engaged = false`) | 0.2 s | — |
| Park · Park All | `park.all` | raise solenoid, retract dip/tap/phone if extended (0.6 s), home X and Y to the limit switches at 60 mm/s, back-off 0.3 s, `(0,0)`, `homed = true`, **lock engaged**, `motionFault = null` ⇒ green | (0.6 if anything is extended) + max(x,y)/60 + 0.3 s | steppers enabled, MOTOR power, switches OK |
| Park · XY | `park.xy` | homes both axes to (0,0) and sets `homed = true` but does **not** re-engage the lock or clear errors ⇒ stays yellow (Cur S13) | `max(x,y)/60 + 0.3` s | same |
| Park · X / Y | `park.x` / `park.y` | homes one axis only; `homed` unchanged | `x/60 + 0.3` s | same |
| Dip · In / Out | `dip.in` / `dip.out` | rotate the dip arm (sector gear "63") to insert / withdraw the white ribbon card | 1.2 s | steppers enabled, MOTOR |
| Tap · In / Out | `tap.in` / `tap.out` | tap paddle over / away from the NFC area | 0.8 s | same |
| Phone · Forward / Back | `phone.forward` / `phone.back` | phone carriage (S17) | 1.5 s | same |
| Phone · Push Power Button | `phone.pushPower` | pusher pulse; toggles a mounted phone's screen | 0.5 s | MOTOR |
| Solenoid · Down / Up | `solenoid.down` / `solenoid.up` | fast plunger stroke (a tap if a Down is followed by Up) | 60 ms each | MOTOR (independent of steppers), connector seated |
| Solenoid · Lower / Raise | `solenoid.lower` / `solenoid.raise` | slow variant (soft press / long-press) | 400 ms each | same |
| (Orca) | `move.to`, `tap.at` | xy_touch internals | `max(\|dx\|,\|dy\|)/120` s + 200 ms tap cycle (60 down, 80 dwell, 60 up) | all xy_touch preconditions |

Rejections: dashboard locked → command ignored, overlay flashes, `rig.command {ok:false, error:'LOCKED'}`;
Pi/controller unreachable → tablet grey, buttons disabled; steppers disabled → motion buttons toast
`Steppers disabled` (no motion); MOTOR off → commands accepted by the Pi but nothing moves and the
tablet shows nothing (GP INC13-B: "motion buttons do nothing").

Homing with a broken limit switch (fault): the axis drives to −10 mm, stalls 4 s, `motionFault =
"HOMING FAILED (X limit not found)"`, banner **red**.

#### 3.7.2 Manual push (`rig.dragCarriage` / `pushHead`)

Possible only with the enclosure door open. Drag distance accumulates in `pushAccumMm` while the lock
is engaged; below **20 mm** the magnet pulls the carriage back (no state change); at ≥ 20 mm the
magnetic lock breaks: `engaged = false`, `homed = false`, `brokenAtMs`, carriage stays where dragged,
banner yellow, `rig.lockBroken`. With steppers disabled or MOTOR off the carriage moves freely and the
lock is already de-energised (banner stays green until power/steppers return — then yellow).

#### 3.7.3 Gantry geometry

Position is in screen mm with (0,0) at the limit switches = the probe's screen top-left (Jared's true
zero; `offsetX/Y = 0`). Travel `[-10, w+10] × [-10, h+10]` of the covered display. Speeds 120 mm/s
(moves), 60 mm/s (homing) [illus.]; both axes move simultaneously (time = max of the two).

#### 3.7.4 Magnetic lock

`engaged` only becomes true through **Park All**. It becomes false on a ≥ 20 mm manual move,
Steppers Disable, MOTOR power loss, or Pi reboot (controller restarts with lock released).

#### 3.7.5 Banner and header text (evaluated every tick)

| Priority | Condition | Banner | Header `statusText` |
|---|---|---|---|
| 1 | tablet cannot reach its controller (Pi off/hung/booting, `robot-controller` down, MAIN off) — the tablet↔Pi link is USB (GP SR04), so network-only faults do **not** grey it | grey | `Status: CONTROLLER UNREACHABLE` |
| 2 | `motionFault` | red | `Status: MOTION FAULT — <fault>` |
| 3 | MOTOR energised and steppers enabled and (`!magneticLock.engaged` or `!homed`) | yellow | `Status: LOCK RELEASED — PARK REQUIRED` |
| 4 | otherwise | green | `Status: OK` |

Header layout (photo): HRN left (`WALL-E`), LabSim logo centre, `Status: OK` / `Brainbox v6` right;
tabs `Robot`, `Robot Control`, `Motion Control`. `hrnShown` updates when Orca pushes a new HRN to a
reachable controller (≤ 2 s physical after save); an unreachable tablet keeps the old name.

#### 3.7.6 Dashboard lockout

`dashboardLocked = robot.checkout != null || (a running local run's handles include one of the rig's devices)`.
While locked the tablet shows the overlay `TEST IN PROGRESS — CONTROLS LOCKED` over Motion Control
and ignores every button (Ref §6 "locks out external users when tests are active"). The physical
POWER toggles, the door and the carriage are not locked (they are physical — GW07 is GP's penalty);
toggling MAIN/MOTOR mid-test produces the real consequences (Pi reboot / `MOTOR_POWER_LOST` on the
build's next tap).

#### 3.7.7 POWER panel

`MAIN` energises the rig's `MAIN-<rig>` 5 V terminal (Pi lead, tablet charger, webcam); `MOTOR`
energises `MOTOR-<rig>` (24 V stepper + solenoid drivers). Each has a green LED lit when its terminal
is energised. MAIN off ⇒ Pi loses power (OFF), webcam dark, tablet on battery shows grey. MOTOR off ⇒
steppers lose holding (lock de-energised, `homed = false`), solenoid dead; banner stays green while
off (rule 3), turns yellow when MOTOR returns.

### 3.8 LabSim devices: power, OS, ADB, tethering

#### 3.8.1 Power and boot

* Powered iff its PSU brick is plugged into an energised AC strip socket (`supply.kind == 'ac-strip'`)
  and the device is neither `dead` nor `fried`. Handhelds (FLEX_*, FLEX_POCKET) have a battery
  (`battery.pct`, NEW): unplugged they run on battery (−0.5 %/min physical, +2 %/min charging); at 0 %
  they power off. Factory 100 %; a device "back from repair" (INC17) starts at 0 %.
* `off → booting` when power appears; boot takes **30 s** physical (lab logo, progress) then
  `on` at `lock` (lab devices keep the passcode screen after boot) — CFD devices and Duo CFDs show
  `customer-idle`. Power loss → `off` immediately (no battery). `dead` devices show nothing and never
  join the network. `fried` = dark forever (`state: 'FRIED'`).
* Idle lock: after 10 min physical with no input the primary display goes to `lock` (clock + date
  `MON, OCT 5`, as in the tethered-rack photo). Runners and LSTR unlock with ADB: `KEYCODE_WAKEUP`,
  swipe up, passcode `0000`, `KEYCODE_ENTER`.

#### 3.8.2 Launcher

`launcher.page` (0 or 1). FLEX/COMPACT pages scroll vertically, MINI/STATION horizontally. Apps on
page 0 per layout; page 1 holds `Reporting`, `Employees`, `Cash Log`, `Help`. A swipe in the wrong
direction does nothing.

#### 3.8.3 ADB over TCP

`adbTcpPort` is 5444 on every lab device (the lab standard); coworker desk devices listen on 5555
(the ADB default). A Laz OOBE wipe sets it to `null` (adbd back to USB-only, SR12) until restored
(`adb tcpip 5444` over the rig Pi's USB, or Laz's `restore-adb` step). `adb tcpip <p>` sets it to `p`
after 1 s (`restarting in TCP mode port: 5444`).

#### 3.8.4 Secure Touch

While `pin-entry` is shown, `secureTouch = true`: ADB-injected events are dropped (logcat
`SecureTouch: injected input rejected`) and UIA cannot see the keys; only physical touches (probe
or player) register (Ref §6: ADB bots cannot enter PINs).

#### 3.8.5 Model strings

`adb shell getprop ro.product.model`: `Station 2018`, `Station 2`, `Station Duo`, `Station Duo 2`,
`Mini 2`, `Mini 3`, `Flex`, `Flex 2`, `Flex 3`, `Flex 4`, `Flex Pocket`, `Compact` [illus.].
`ro.serialno` = serial.

#### 3.8.6 Tethered pay-display link (USB Pay Display / Secure Network Pay Display)

`payDisplayLink = 'UP'` iff both devices are `on`, the pay-display app is running on both, and:
USB Pay Display → both hubs' `hubUsbToPeer` seated; Secure Network Pay Display → both hubs'
`hubEthernet` seated (and both reachable). When DOWN: the CFD shows `waiting-for-merchant`
(`Waiting for merchant device…`); the MFD's Charge shows `Connecting to customer display…` and times
out after 30 s back to `review-order`. Recovers within 2 s of the cable being re-seated (INC47). The
Duo's two displays are one device — no link to break.

---
### 3.9 LabSim transaction state machine

#### 3.9.1 Inventory (every merchant, seeded) [illus.]

| Item | Price | Taxable |
|---|---|---|
| `Tax Item 5` | $10.00 | yes |
| `Non-Tax Item 1` | $5.00 | no |
| `Coffee` | $3.50 | yes |
| `Catering Deposit` | $42.00 | no |

#### 3.9.2 Money maths (integer cents, round half up)

```
roundHalfUp(n, d) = floor((n * 2 + d) / (2 * d))           // n ≥ 0; integer division
subtotal    = Σ priceCents × qty
taxable     = Σ priceCents × qty over taxable lines
tax         = roundHalfUp(taxable × taxRateBp, 10_000)      // ORDER-level rounding [illus.]
cardAdjust  = tender == card && merchant.cashDiscountEnabled ? roundHalfUp((subtotal + tax) × cardAdjustBp, 10_000) : 0
tip         = roundHalfUp((subtotal + tax) × tipPct, 100)   // tip base = pre-tip amount = subtotal + tax
total       = subtotal + tax + cardAdjust + tip
```

| Case | Subtotal | Tax | Adj. | Tip | Total |
|---|---|---|---|---|---|
| Tax Item 5 @ 8.25 % (Cur S11) | 1000 | 1000×825=825 000 → **83** | 0 | 0 | **1083** ($10.83) |
| Tax Item 5 @ 13 % HST (WESTERS) | 1000 | **130** | 0 | 0 | 1130 (CAD) |
| 2 × Tax Item 5 | 2000 | 1 650 000 → **165** (order-level; per-line would be 166) | 0 | 0 | 2165 |
| Coffee | 350 | 288 750 → 29 | 0 | 0 | 379 |
| Tax Item 5, cash-discount merchant, paid by card | 1000 | 83 | 1083×400 = 433 200 → **43** | 0 | 1126 |
| Catering Deposit, 18 % tip (Cur S15, INC57) | 4200 | 0 | 0 | 4200×18 = 75 600 → **756** | **4956** |
| Tax Item 5, 18 % tip | 1000 | 83 | 0 | 1083×18 = 19 494 → 195 | 1278 |

`roundHalfUp` matters: banker's rounding would give a $0.82 tax on Tax Item 5 and fail the CFD_O1 assertion.

#### 3.9.3 Screens and transitions (single-display device; customer-facing steps on the same display)

| From (`display.screen`) | Input | Guard | To | Effects |
|---|---|---|---|---|
| `lock` | unlock (ADB swipe + passcode, or player) | passcode `0000` | `home` | |
| `home` | press `Register` | app installed | `register` | order = new `OrderState` (empty) |
| `home` | press other app | | `app-orders` / `app-transactions` / `app-setup` / `app-dining` … | read-only screens [sim] |
| `register` | press item | | `register` | +1 qty; totals recomputed; footer `Subtotal / Tax / Total` updates |
| `register` | `Clear` | | `register` | lines cleared |
| `register` | `Review Order` | ≥ 1 line | `review-order` | `status: 'review'`; tethered CFD → `customer-cart` |
| `review-order` | `Back` | | `register` | |
| `review-order` | `Pay` | | `tender-select` | `awaiting-tender` |
| `tender-select` | `Charge` | `cashDiscountEnabled` | `cash-discount-tender` (customer-facing) | |
| `tender-select` | `Charge` | otherwise | `payment-prompt` (customer-facing) | `awaiting-card`; armed probes fire 0.8 s later |
| `tender-select` | `Cash` | | `approved` | `tender: 'cash'` (no card) |
| `tender-select` | `Cancel` | | `review-order` | |
| `cash-discount-tender` | `Card` | | `payment-prompt` | `tender: 'card'`, `cardAdjustCents` computed; prompt shows the card total |
| `cash-discount-tender` | `Cash` | | `approved` | cash price |
| `payment-prompt` | card event OK | brand ∈ `acceptedBrands`, expiry ≥ 2610 | `pin-entry` if PIN required, else `tip` if `tipsEnabled`, else signature check | `entry`, `cardProfileId` stored |
| `payment-prompt` | card event invalid | | `payment-prompt` | toast `Card read error, try again` 3 s; logcat `SWIPE_ERROR: invalid track data` / `CHIP_READ_ERROR` |
| `payment-prompt` | brand not accepted / expired | | `declined` 3 s → `payment-prompt` | `Card not supported` / `Expired card` |
| `payment-prompt` | `Cancel` | | `review-order` (single) / MFD `review-order` + CFD `customer-cart` (tethered) | |
| `pin-entry` | digit key | | `pin-entry` | `pinDigits += 1` (dots), max 12 |
| `pin-entry` | `Clear` | | | `pinDigits = 0` |
| `pin-entry` | `Enter` | digits == profile `pin` | `tip` / next | |
| `pin-entry` | `Enter` | wrong | `pin-entry` | toast `Incorrect PIN`; `pinTries += 1`; at 3 → `declined` (`PIN tries exceeded`) → `payment-prompt` |
| `pin-entry` | 60 s without input | | `declined` (`Timed out`) | |
| `tip` | `15%`…`22%` | | next | `tipCents` per §3.9.2 |
| `tip` | `No Tip` | | next | 0 |
| `tip` | `Custom` | | `tip-custom` (keypad as PIN layout, not secure) → `Enter` | cents typed |
| next = signature check | | `entry == SWIPE && signatureThresholdCents != null && total ≥ threshold` | `signature` | else `processing` |
| `signature` | `Done` | ≥ 1 stroke | `processing` | |
| `signature` | `Done` | no stroke | `signature` | toast `Please sign` |
| `processing` | 1.5 s | | `approved` | `authCode = "SIM" + 3 digits` (`devices` rng) |
| `approved` | 2.0 s | | `receipt-options` (4 or 5, §3.10) | `status: 'paid'`; dip/tap actuators auto-retract |
| `receipt-options` | `Print` | printer present & paper | `printing` 3.0 s → `thank-you` | printer payload at +2.5 s (`device.receiptPrinted`), `lastReceipt` |
| `receipt-options` | `Print` | printerless (Pocket, Duo 2, Compact) | stays | toast `Printer not available` |
| `receipt-options` | `Print` | no paper (fault) | stays | toast `Printer out of paper` |
| `receipt-options` | `Email` / `Text` | | `receipt-sent` 1.5 s → `thank-you` | |
| `receipt-options` | `No Receipt` | | `thank-you` | |
| `receipt-options` | `Scan for receipt` | 5-option layout only | QR enlarged 3 s → `thank-you` | |
| `thank-you` | 2.0 s | | `register` (empty order) | `device.transactionCompleted` |

PIN required iff `!merchant.pinBypass && (entry == DIP && (profile.requiresPin || merchant.country == 'CA') || entry == TAP && profile.requiresPin && total ≥ 10000)`
(Interac contactless needs no PIN under $100 CAD [illus.]). US PIN-bypass merchants never prompt.

#### 3.9.4 Tethered pair (MFD + CFD devices)

MFD shows `home → register → review-order → tender-select`. The CFD (pay-display app) mirrors the
order: `customer-idle` (Welcome, merchant name) → on `Review Order` → `customer-cart` with labels
`Subtotal $10.00`, `Tax $0.83`, `TOTAL $10.83` (**this is what CFD_O1 asserts**). On MFD `Charge`, the
MFD shows `waiting-for-customer` (`Customer is paying…`) and every customer-facing step
(`cash-discount-tender` … `thank-you`) runs on the CFD; afterwards CFD → `customer-idle`, MFD →
`register` with toast `Payment complete`. Requires `payDisplayLink == 'UP'` (§3.8.6).

#### 3.9.5 Station Duo (one terminal, two displays)

As tethered, but both displays belong to one `TerminalDevice`: primary = MFD screens, secondary
(`secondaryDisplay`) = CFD screens (`CFD_*` Orca rows): `customer-idle` → `customer-cart` (CFD_CART) →
… → `receipt-options` (CFD_RECEIPT_OPTIONS_4/5) → `receipt-done` (`Your receipt is on its way` +
`Done`, CFD_RECEIPT_DONE; required press) → `thank-you` (`Thank you`, CFD_THANK_YOU, 3 s) →
`customer-idle`. INC64's seed parks the CFD on `receipt-done`.

#### 3.9.6 Printerless devices

FLEX_POCKET, STATION_DUO_2, COMPACT: identical layouts, `Print` row rendered greyed. Go SDK
`printReceipt` on them returns `PRINTER_NOT_AVAILABLE` (INC23); Pigeon `select print` times out
waiting for a payload that never comes.

#### 3.9.7 Receipt document (`lastReceipt`, printed payload, Ollama input)

```
LabSim Automation Lab — US 01
100 Automation Way, Lab 4
MON, OCT 5 2026            09:14 AM
Order ORD-WALL-E-0007
--------------------------------
Tax Item 5                  $10.00
--------------------------------
Subtotal                    $10.00
Tax (8.25%)                  $0.83
Tip                          $0.00
Total                       $10.83
VISA •••• 1111          SWIPE
Auth SIM042           APPROVED
          Thank you!
```
Lines are 32 characters wide. The tip line shows the percentage when chosen (`Tip (18%)`). Cash
discount adds `Non-cash adj. (4.00%)`. Order ids: `ORD-<RIG>-<4-digit sequence per device>`.

### 3.10 The "Scan for receipt" QR feature (conditional 5th option)

* `receiptOptions(device) = device.firmwareInfo.receiptQr && merchant(device).qrReceiptsEnabled ? 5 : 4`.
* Firmware truth: `RECEIPT_OPTIONS_5` = `RECEIPT_OPTIONS_4` with every button **3.0 mm lower** + a QR
  block above the list + a 5th row `Scan for receipt` (Cur S10, Ref §5). Values per layout in §2.10.2.
* `sim.setFlag('receiptQrFeature', v)` = a lab-wide firmware rollout: every non-FLEX_1 device's
  `firmwareInfo.receiptQr = v` (version strings switch); devices on `receipt-options` re-render
  (`display.rev++`). **Orca rows do not change** — keeping both maps right is the engineers' job.
* The fault `orca.screenLocationShift` (INC20) reproduces the historical regression: the `_5` rows of
  given types are 3.0 mm too high (they were measured on a pre-release build).
* Tests pick the map: uia-remote's `ReceiptScreen` counts options via UIA and asks Orca for
  `RECEIPT_OPTIONS_4` or `_5`; Pigeon uses `${RECEIPT_SCREEN}` (runner-detected) or a literal.

### 3.11 Station Duo and the dual-screen ADB problem

| Operation | Result on a Duo (`10.42.30.14:5444`) |
|---|---|
| `adb devices` | one entry `10.42.30.14:5444	device` (one terminal) |
| `adb -s … shell uiautomator dump` → `pull` | hierarchy of the **MFD only** (`grep -c "TOTAL" window_dump.xml` → `0`; `Review Order` present) |
| `adb -s … exec-out screencap -p` | MFD image only (1920 × 1080) |
| `adb -s … shell input tap x y` | injected on display 0 = **MFD** (INC64 wrong move taps the MFD) |
| UI Automator 2.2 page object for a CFD element | `UiObjectNotFoundException` (blind) |
| UI Automator **2.3** locator with `displayId(cfdDisplayId)` (`flags.uiaVersion == '2.3'`) | finds/clicks CFD elements (Ref §1) — not the Secure Touch PIN pad |
| Orca `xy_touch` on `CFD_*` for `r2-d2` | `PHYSICAL_TAP` (the gantry sits over the CFD) |
| Orca Screen Compare (`CFD_TOTAL`) | webcam → crop → Tesseract → boolean (§3.12) |

`cfdDisplayId = 1` [illus.]. `config.properties` for a Duo: `merchantFacingDeviceIp ==
customerFacingDeviceIp` (both `10.42.30.14`), `runType=tethered`, `deviceType=Station` — the runner
opens two handles to the same ip:port; the CFD handle can act only through UIA 2.3 display ids, OCR
or physical taps. Any other CFD IP ⇒ `[runner] CFD handle 10.42.30.19:5444 → No route to host` (INC30).

### 3.12 OCR Screen Compare (Tesseract model)

#### 3.12.1 Pipeline (`orca.compare(id)`, Orca **Test**, runner `orca.screenCompare(name)`)

1. Row by id/name (`404 Not Found: no screen compare image 'X'`).
2. Orca → the row's robot's Pi `POST /ocr {"camera":"<robot.cameraStreamUrl>","bbox":{…},"expected":"…"}`
   (Pi unreachable → `502`).
3. The Pi captures a frame from **the URL in Orca** (not "its own" camera — INC09): host reachable,
   `camera-stream` running, webcam USB connected; else
   `[ocr] capture webcam → GET http://10.42.10.40:8081/stream.mjpg → Connection refused` (or
   `→ connect timed out after 10000 ms`) and `match=false`.
4. Frame model: for each display in that camera's view (§2.11.1), the labels of its **current**
   screen mapped to px (`ox + s·x`, `oy + s·y`), plus `device.labelShiftPx` on CFD labels and the
   misaim offset (fault `rig.webcamMisaimed`, +40 px x / +25 px y).
5. Crop to `bbox`, run Tesseract (rules below), strip leading/trailing whitespace from the result.
6. `match = (text === expectedText)` — exact, case-sensitive, internal whitespace exact, no
   normalisation (a trailing space in Expected is a typo that fails).
7. Console/Pi log, exact (Cur M16): `[ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAL $10.83" → match=true`.

#### 3.12.2 Deterministic Tesseract rules [sim]

For every label rect `L` intersecting the crop `C`:
* `fx = overlapW / L.w`, `fy = overlapH / L.h`; ignore `L` if `fx · fy < 0.10`.
* Characters are spaced evenly across `L.w`; keep those whose centre x lies inside `C`; trim spaces.
* Vertical clipping `c = 1 − fy`: if `c ≥ 0.60` → the label reads `""`; else if `c ≥ 0.15` apply the
  glyph-confusion map for the clipped side — **bottom clipped**: `L→I`, `E→F`, `8→B`, `Q→O`, `J→I`;
  **top clipped**: `T→I`, `E→L`, `8→o`, `7→/` (other glyphs unchanged).
* Multiple labels: sorted by top then left, joined with `\n`. No label → `""`.
* Confidence: 91 clean, 58 if any confusion applied, 0 for empty.

Worked results (R2-D2, `cam-r2-d2`, bbox 412,288,236,44):

| CFD state | Text read | match vs `TOTAL $10.83` |
|---|---|---|
| layout v1, no shift | `TOTAL $10.83` | true |
| label shifted 10 px down (INC36): fy = 34/44, c = 0.227, bottom clipped | `TOTAI $10.B3` | false |
| v2 copy only (INC37-A), box unchanged | `Total $10.83` | false (capitalisation) — true once Expected = `Total $10.83` |
| Cur M16 toggle: v2 copy + 10 px, box unchanged | `Total $10.B3` | false (lower-case `l` has no confusion mapping) |
| INC36 fixed: box re-measured to y 298 (v1 copy) | `TOTAL $10.83` | true |
| bbox = whole screen (wrong move) | `Subtotal $10.00\nTax $0.83\nTOTAL $10.83` | false |
| camera URL points at WALL-E (INC09; WALL-E on `payment-prompt`) | `Tap, insert or swipe` | false |

### 3.13 Power

#### 3.13.1 Solver (every sub-step)

1. Wall outlets live (fault `power.outletDead` can kill one).
2. A strip is energised iff plugged into a live outlet, `switchOn`, breaker not tripped; AC current
   = Σ loads; > 15 A → breaker trips (manual reset button).
3. `MW-1` outputs 24.1 V iff its outlet is live, `on`, and not in hiccup. If its load exceeds 25 A,
   or a short appears on `rail-24v`, it enters **hiccup** for 2 s (output 0 V), then retries.
4. Regulators output iff `rail-24v ≥ 20 V` and `inputSwitch`. 5 V regs:
   `V = 5.08 − 0.02 × max(0, I − 5)`; above `maxA` (10 A) they fold back to **4.40 V**. 12 V reg: 12.02 V,
   fold back to 10.5 V above 8 A.
5. Fuses between regulator and rail: removed or blown ⇒ rail 0 V. **Stress model**: each sub-step,
   `I > ratingA ⇒ stress += dt_s × ((I / ratingA)² − 1)`, else `stress = max(0, stress − 0.5 × dt_s)`;
   blow when `stress ≥ 5.0` or instantly when `I ≥ 3 × ratingA` (short). A 5 A fuse in Rack B's 10 A holder
   (6.75 A) blows in ≈ 6.1 s; Rack A (6.6 A) ≈ 6.7 s — "within 20 s" (GP SR10). A 15 A fuse never blows
   at these loads (flagged: `ratingA != labelA`).
6. Terminals: `MAIN-<rig>` energised iff its rail ≥ 4.75 V and `mainSwitch`; `MOTOR-<rig>` iff 24 V and `motorSwitch`.
7. Loads get the voltage of what they are plugged into; mismatches per §3.13.3; currents for the next
   sub-step from load states (Pi booting 1.0 A, running 0.9 A, off 0; motor per §2.6).
8. Pi under-voltage: supply < 4.63 V for ≥ 100 ms ⇒ `underVoltage = true` and the Pi reboots (OS →
   `BOOTING`); while the sag persists it reboot-loops (resets 5 s into each boot). PWR LED blinks while
   below 4.63 V. `dmesg` shows `hwmon hwmon1: Undervoltage detected!`; `vcgencmd get_throttled` →
   `throttled=0x50005` during, `throttled=0x50000` after (history bits) [illus. but real tool output].

#### 3.13.2 Fuse handling

* `power.removeFuse(id)`: allowed any time; live branch (regulator input on) ⇒ spark event (GW03), rail drops to 0.
* `power.insertFuse(id, ratingA)` takes a spare of that rating (−1 from `spareFuses`); live ⇒ spark.
  `blown = false`, `stress = 0`. Colour by rating: 5 tan, 10 red, 15 blue, 20 yellow.
* `power.replaceFuse(id)` = remove + insert a fuse of `labelA` (UI convenience).
* Ω measurement only meaningful with the fuse removed or branch de-energised (`0.1 Ω` / `OL`); on a
  live circuit the meter shows `ERR` (GW21).

#### 3.13.3 What happens when something is plugged into the wrong place

The world offers these plug targets: AC strip sockets, `T-24V-SPARE`, `T-24V-CALLUS`, `T-12V-SPARE`,
`T-5V-SPARE`, and each rig's Pi lead socket (`MAIN-<rig>`). Rows = the load's lead.

| Lead (expects) | AC strip | 5 V terminal | 12 V terminal | 24 V terminal |
|---|---|---|---|---|
| LabSim device brick / device lead (AC-BRICK-18V) | ✅ powers the device | ❌ **device FRIED** | ❌ FRIED | ❌ FRIED |
| Collis probe PSU (AC-BRICK-18V) | ✅ | ❌ **probe FRIED** | ❌ FRIED | ❌ FRIED |
| Raspberry Pi (USB-C, 5 V) | n/a ("doesn't fit") | ✅ | ❌ Pi FRIED | ❌ Pi FRIED |
| Intel NUC (12 V) | n/a | no power (amber blink) | ✅ | ❌ NUC FRIED |
| Minix (12 V brick or lead) | ✅ (brick) | no power | ✅ | ❌ FRIED |
| Desk fan / soldering station / lamp (AC) | ✅ | n/a | n/a | n/a |

Damage consequences by `config.damageModel`:

| Model (mode) | Fried rows above |
|---|---|
| `academy` | spark + smoke VFX/audio only; nothing changes state; the connection is refused (lead pops out). Mentor line fires (GP/Cur). |
| `arcade` | load `damaged = true` (device `power: 'fried'`, probe `state: 'FRIED'`); the momentary short **blows the branch fuse** on a 5 V/12 V terminal; on a 24 V terminal MW-1 hiccups 2 s but regulator hold-up keeps the Pis up [sim]. `power.loadDamaged` + `device.fried`. |
| `full` | as `arcade`, and a 24 V short really drops every regulator for 2 s → **every Pi on every 5 V branch brown-outs and reboots** (40 s), NUC-03 loses power. |

The 18 V reason (Ref §6): LabSim devices draw an irregular 18 V and, like the Collis probes, bypass
the custom DC rails entirely and use commercial AC power strips.

### 3.14 Hosts

#### 3.14.1 Raspberry Pi life cycle

| State (`os`) | Enter | LEDs (PWR red / ACT green / Ethernet) | Network | Services |
|---|---|---|---|---|
| `OFF` | no power (MAIN off, fuse, lead unplugged, regulator off) | off / off / off | none | none |
| `BOOTING` | power ≥ 4.75 V | solid / rapid boot flicker / link from 12 s | ICMP from 12 s | per §2.5.2 |
| `RUNNING` | 40 s after power | solid / irregular 2–12 Hz / green link + amber speed | yes | as enabled |
| `HUNG` | fault `pi.hung` | solid / **solid on (no flicker)** / lit | **none** (timeouts) | none respond |

* Any power interruption ≥ one sub-step resets the Pi (HUNG is cleared only this way) [sim].
* `sudo reboot` → services stop, 5 s shutdown, then `BOOTING`.
* Service crash (`pi.serviceDown`): `running = false`, `failure = 'exit-code'`; `systemctl status`:

```
● robot-controller.service - LabSim Robot Controller (REST :8000)
     Loaded: loaded (/etc/systemd/system/robot-controller.service; enabled; vendor preset: enabled)
     Active: failed (Result: exit-code) since Mon 2026-10-05 08:11:42 EDT; 3min 18s ago
    Process: 812 ExecStart=/usr/bin/python3 -m robot_controller --config /etc/robot-controller/controller.yaml (code=exited, status=1/FAILURE)
   Main PID: 812 (code=exited, status=1/FAILURE)
```
Healthy: `Active: active (running) since Mon 2026-10-05 07:02:13 EDT; 1h 9min ago` + `Main PID: 812 (python3)`.
`camera-stream` failed journal (`journalctl -u camera-stream -n 3`):
`camera-stream[640]: Cannot open '/dev/video0': No such file or directory` (INC08-B).
`cardprog` failed journal: `cardprog[903]: wine: could not load kernel32.dll, status c0000135` (INC56).
Healthy `ps aux | grep -i wine` contains `pi   903  2.1  3.4 ... wine C:\CardProg\CardProgrammer.exe`.

#### 3.14.2 Windows / Minix boxes (Callus)

* Front power button: off → boot 50 s (§2.5.2); on → short press = shutdown (20 s); hold 4 s = hard off.
* Fault `callus.down` with `mode: 'box-off'` models "a Windows update shut it down" (`os: 'OFF'`, LED dark, screen dark; §4.3.1).
* `sc query Callus` (ssh `automation@10.42.20.1`):

```
SERVICE_NAME: Callus
        TYPE               : 10  WIN32_OWN_PROCESS
        STATE              : 4  RUNNING
```
Stopped: `STATE              : 1  STOPPED`. `sc start Callus` → `STATE : 2  START_PENDING` then RUNNING after 5 s.
* Status screen text (GP §3.2): `Callus service · listening on :9000 · probes: WALL-E, EVE, BUMBLEBEE, R2-D2`;
  stopped → `Callus service · STOPPED`.
* `GET http://10.42.20.1:9000/status` (GP INC18 format):
  `{"callus":"UP","probes":[{"id":"collis-wall-e","state":"READY"},{"id":"collis-eve","state":"READY"},…]}`;
  probe states `READY` / `OFFLINE` (no power) / `NO_LINK` (ribbon) / `FAULT` (fried).

#### 3.14.3 corporate agent and the NUC disk (Ref §1)

* `corporate-agent` runs on every Windows box and **cannot** be stopped by the sim's normal tools:
  stopping/uninstalling it or deleting `C:\ProgramData\SecAgent\logs` is recorded as
  `host.securityTamper` (GW11) and the agent is restored by policy 30 s later (logs reappear) [illus.].
* NUC-03: the agent writes **0.011 GB per physical second** while free space > 0 (2 GB ≈ 180 s).
  Factory: 237.9 / 237.9 GB (100 %). Minix boxes have log rotation and stay at ~61 %.
* `host.cleanDisk(nuc-03)` (= deleting `C:\Windows\Temp`) frees **2.0 GB**; it is full again in ~180 s.
* While a box has 0 GB free, any service on it that writes (Callus, the legacy `motion` service on
  :9100) answers `500 {"error":"No space left on device"}`; rebooting doesn't help (services come back
  and fail again ~60 s after power-on).
* `Get-PSDrive C` (PowerShell over ssh): `Name Used (GB) Free (GB) Provider Root` / `C 237.9 0.0 FileSystem C:\`.
* This is *why* hardware control moved to Linux Pis; the fix for INC19 is to move motion back
  (`motion: local` + USB PCB on the Pi), never to touch the agent.

#### 3.14.4 VMs and the GPU blade

* `gpu-blade` power-cycle: all VMs down; blade boot 90 s, then VMs 45 s (GW13).
* VM restart: 45 s; services per §2.5.2. Running Jenkins builds at a `jenkins-vm` restart finish
  `FAILURE` with `Jenkins is restarting — build interrupted` (`JENKINS_RESTART`).
* `ollama-vm` `ollama` stopped (INC10): port 11434 refused; `systemctl status ollama` → `inactive (dead)`.

#### 3.14.5 Orca application and MySQL

| State | UI | REST | `/management/health` | Health check | Checkouts |
|---|---|---|---|---|---|
| up, DB connected | normal | normal | `200 {"status":"UP"}` | runs | normal |
| `mysql` stopped (INC60) | error page `500 Internal Server Error — Could not open JPA EntityManager for transaction; nested exception is org.hibernate.exception.JDBCConnectionException: Unable to acquire JDBC Connection` with detail `Communications link failure` | `500` | `503 {"status":"DOWN","components":{"db":{"status":"DOWN"}}}` | aborted | `[orca] checkout request … → 500` |
| `mysql` started | — | — | — | — | DB back after 5 s; pool reconnects **15 s** later (`orca.app.reconnectAtPhysMs`) |
| `orca` service down / VM down | connection refused / timeout | same | same | none | `[orca] checkout request … → Connection refused` |

All Orca state lives in MySQL: restarting the app loses nothing.

#### 3.14.6 Scheduled task `GortCardSync` (Windows Task Scheduler)

* Daily 10:00 (game clock), or `schtasks /run /tn GortCardSync` → `SUCCESS: Attempted to run the scheduled task "GortCardSync".`
* Runs 20 s physical if the box is RUNNING and networked; result: `callus.localCardFiles[box]` = every
  file under `cards/` on gort `main` at that moment (additions **and** deletions), `syncedCommit`,
  Callus log `GortCardSync: pulled c41d9e2 (7 files)`. A box that is off at 10:00 misses the run
  (no catch-up) — INC54.
* `schtasks /query /tn GortCardSync`:

```
Folder: \
TaskName                                 Next Run Time          Status
======================================== ====================== ===============
GortCardSync                             10/06/2026 10:00:00    Ready
```
(`Running` while it runs; Next Run Time = next 10:00 after `nowMs`.)
* `dir C:\gort\cards\emv` lists the local files (`10/04/2026  10:00 AM    412 visa_std_dip.json`).

### 3.15 Network, ADB and the workstation

#### 3.15.1 `adb` semantics (engine for the terminal app)

| Command | Behaviour / exact output |
|---|---|
| any `adb` with server down | starts it: `* daemon not running; starting now at tcp:5037` / `* daemon started successfully` |
| `adb connect <ip>` | port defaults to **5555** |
| `adb connect <ip>:<port>` | reachable + `adbTcpPort == port` → `connected to 10.42.30.32:5444` (append to `adbConnections`); already → `already connected to …`; device up but not listening on that port → `failed to connect to '10.42.30.32:5555': Connection refused`; device off/dead/unknown → `failed to connect to '10.42.30.12:5444': No route to host`; host hung → `failed to connect to '<t>': Connection timed out` |
| `adb devices` | `List of devices attached` then `<target>\tdevice` per connection in order |
| `adb disconnect <t>` | `disconnected <t>` |
| `adb kill-server` | clears connections (they are **not** remembered — a later run re-connects per config) |
| `adb -s <t> shell uiautomator dump` | `UI hierchary dumped to: /sdcard/window_dump.xml` (the tool's own spelling) — XML of the primary display: one `<node>` per visible button/label with `text`, `resource-id`, `class`, `clickable`, `bounds="[l,t][r,b]"` (device px) |
| `adb -s <t> pull /sdcard/window_dump.xml` | `/sdcard/window_dump.xml: 1 file pulled. 0.4 MB/s (7351 bytes in 0.017s)` → workstation file |
| `adb -s <t> shell input tap x y` | px → mm on display 0 → `device.touch(source 'adb')`; no output |
| `adb -s <t> shell input swipe x1 y1 x2 y2 [ms]` | stroke (signature / launcher scroll) |
| `adb -s <t> shell input keyevent KEYCODE_HOME` | primary display → `home` (or `customer-idle` for CFD-mode devices) |
| `adb -s <t> shell input text 0000` / `KEYCODE_ENTER` | lock-screen passcode / custom tip |
| `adb -s <t> exec-out screencap -p > x.png` | image ref `img:screencap:<deviceId>:<physMs>` (frozen labels) |
| `adb -s <t> shell getprop ro.product.model` | §3.8.5 |
| `adb -s <t> logcat -d` | `device.logcat` |
| `adb -s <serial> tcpip <port>` (on a Pi, USB device) | `restarting in TCP mode port: 5444` (1 s) |

Any command that **drives** a coworker desk device (`input`, `am start`, runner actions) increments
`workstation.coworkerDevicesDisturbed`, emits `adb.coworkerDriven`, and the device visibly reacts.

#### 3.15.2 Port rules (Ref §4)

Lab devices listen only on 5444; coworker desk devices (`10.42.60.*`) only on 5555. Therefore 5444
can never reach a coworker device, and 5555 can never reach a lab device.

#### 3.15.3 The 5555 collision (Cur S19, GP SR11)

uia-remote's `DeviceHandle.connect(ip, port)` runs `adb connect ip:port`; if that fails **and** the
workstation ADB server already has ≥ 1 connected device, it falls back to `adbConnections[0]` and logs
```
connect 10.42.30.21:5555 … refused
falling back to first known device: 10.42.60.4:5555
```
then continues driving that device (the coworker's Flex opens Register and adds Tax Item 5). With no
known devices: `DeviceConnectionException: cannot connect to 10.42.30.21:5555 (Connection refused)`.

---
### 3.16 Collis probes, SmartStripe probes, Callus

| Probe state | LED | Callus `/status` state | Card action error |
|---|---|---|---|
| no power (PSU unplugged / strip off) | off | `OFFLINE` | `PROBE_OFFLINE` |
| powered, ribbon unseated | amber | `NO_LINK` | `PROBE_NO_LINK` |
| fried (DC lead) | off (scorch decal) | `FAULT` | `PROBE_FAULT` |
| powered + ribbon seated | green | `READY` | — |

* `collis.reseatRibbon(id)`: toggles seated; doing it with the probe powered is allowed (no penalty in
  the sim; GP awards PB07 for powering off first).
* A Callus box drives only the probes listed in its config (§2.5.1). If the box is down every probe it
  serves is unusable **and** the Pis of those rigs answer `/health` 502 (§3.3.3 rows 7–8).
* SmartStripe probes (tethered rack) are USB devices on the shelf Pi, driven by MINIX-02's Callus over
  the network [illus.]; they swipe only, into the **CFD**'s reader. Unplugged → `PROBE_OFFLINE`.
* Callus log line formats are the ones in §3.6; the Minix status screen shows the last 3.

### 3.17 Laz Automation (zero-touch OOBE) and Ubi routing

#### 3.17.1 When Laz runs

* `Java/laz-oobe-merchant-swap` (requires `ROBOT_NAME` and `MERCHANT`; blank ⇒
  `ERROR: ROBOT_NAME is required for Laz merchant swaps` FAILURE). Named checkout rules apply (works on
  Unavailable rigs by Name).
* The `Merchant` stage of every pipeline whose job has `merchantPolicy: 'swap'` (all uia-remote, Pigeon
  and Go SDK jobs) when the checked-out device(s) hold a different merchant than `MERCHANT`
  (tethered: MFD then CFD). Jobs with `merchantPolicy: 'assert'` (`Java/paycore-standalone-matrix`)
  never swap: mismatch ⇒ `[paycore] merchant mismatch: expected PAYCORE-STANDALONE-01, got AUTO-US-NOPIN-01`
  FAILURE `MERCHANT_MISMATCH` (GP PL8/INC40). This is precisely why Unavailable protects PayCore rigs.
* Same merchant ⇒ `laz: merchant already active (AUTO-US-NOPIN-01) — skipped`.

#### 3.17.2 Step machine (physical durations; console lines exact, Cur M08)

| Step | Duration | Device effect | Console |
|---|---|---|---|
| `ubi-route` | 2 s | — | `ubi: routing merchant switch → WESTERS-CA-02` then OK, or `ubi: ERROR route us-east cannot resolve merchant WESTERS-CA-02` ⇒ run `failed` (Laz never de-provisions, INC50). Unknown merchant ⇒ `ubi: ERROR merchant NAME not found`. |
| `deprovision` | 8 s | `display: deprovisioning`, `provisioned = false`, `merchantConfigId = null` | `laz: de-provision` |
| `wipe-cache` | 6 s | order cleared, launcher page 0, apps reset, **`adbTcpPort = null`** (OOBE resets ADB over TCP, SR12) | `laz: wipe caches` |
| `setup-wizard` | 6 × 5 s | pages `oobe-welcome` (1/6 Language), `oobe-network` (2/6 Network: lab-ethernet), `oobe-merchant` (3/6 Merchant sign-in `<MID>`), `oobe-employee` (4/6 Employee passcode), `oobe-payments` (5/6 Payments), `oobe-complete` (6/6) | `laz: setup wizard 1/6` … `laz: setup wizard 6/6` |
| `assign-merchant` | 3 s | `merchantConfigId = M`, `provisioned = true`, merchant `apps` installed, display `home` | `laz: merchant active` |
| `restore-adb` | 2 s | via the rig Pi's USB ADB: `adbTcpPort = 5444` | `laz: adb tcpip 5444 via adb-shelf-pi → OK`. Fault `laz.skipAdbRestore`: step silently skipped (no line) ⇒ INC28. Pi unreachable ⇒ `laz: WARN could not restore ADB over TCP (adb-shelf-pi unreachable)` and continue. |
| `verify` | 2 s | — | `laz: verify OK (SIM-M3-000031 on AUTO-US-NOPIN-02)` |

Total ≈ 53 s. Device off/unreachable from its Pi at start ⇒ `laz: ERROR device SIM-M3-000031 not reachable` (`LAZ_FAILED`).
Laz does **not** change Orca's `robot.merchantConfigId` (Orca says what the rig *should* hold; the
device says what it *does* hold).

#### 3.17.3 Ubi

Routes: `us-east` → region `US-EAST`, `ca-central` → `CA-CENTRAL`. A merchant resolves iff
`ubi.routes[merchant.ubiRoute].up && region == merchant.region`. The `ubiRoute` field is visible only in
the Merchant Config **Edit** dialog. Fault `ubi.routeDown` sets `up = false` (`ubi: ERROR route ca-central unavailable (503)`).

### 3.18 Jenkins engine

#### 3.18.1 Scheduler

* `jenkins.build(jobId, params)` merges `params` over `savedParams` (Build with Parameters) — plain
  **Build** uses `savedParams`. Build number = `nextBuildNumber[job]++`. Queued (`jenkins.buildQueued`).
* **8 executors** [illus.] (the stub's 4 is too few for PL1–PL8 + player builds); FIFO queue. A build
  waiting for a robot keeps its executor (it is inside the pipeline).
* `jenkins-vm`/`jenkins` down: UI unreachable, queue frozen, running builds die at restart (§3.14.4).
* Scheduled triggers use the game clock (`Java/nightly-java-regression` 02:00 → builds every
  `Java/*` job; `iOS/*` jobs are not triggered — INC26).
* `jenkins.moveJob(jobId, toFolder)` keeps history and build numbers; job id changes. `saveJob` edits
  `script`, `savedParams`, `description`, `disabled`.

#### 3.18.2 Reading the pipeline script

The sim parses only these line shapes (anything else is display text):

```
def capabilities = [k: v, …]                        // NON_DYNAMIC; v = 'str' | "str" | true | false | number | params.NAME
def dynamicCaps  = readJSON(file: '<repo path>').capabilities     // DYNAMIC_JSON from the test definition (same repo as testRef, or gort)
def capabilities = readJSON(file: '<repo path>').capabilities     // DYNAMIC only (go-sdk)
```
`params.NAME` resolves to the build's parameter value **as typed** (so `DEVICE_TYPE=flex_3` reaches
Orca's enum check). A syntax error in the map line ⇒ `org.codehaus.groovy.control.MultipleCompilationErrorsException: startup failed: WorkflowScript: <line>: unexpected token` FAILURE (`SCRIPT`).

#### 3.18.3 Stages (physical durations; nominal passing run ≈ 60 s, GP SR15)

| # | Stage | Duration | Does | Failure → code |
|---|---|---|---|---|
| 1 | `Checkout SCM` | 4 s | clone `testRef.repo` at `BRANCH` (main head now) | unknown branch: `ERROR: Couldn't find any revision to build. Verify the repository and branch configuration for this job.` → `SCM` |
| 2 | `Resolve capabilities` | 1 s | §3.18.2; dynamic JSON parsed from the checked-out file | dynamic file invalid JSON: `readJSON: Unexpected token } in JSON at line 4 column 3` → `JSON_PARSE` |
| 3 | `Checkout robot` | 1 s + queue | §3.4.2 (jobs with no robot skip) | `ENUM_CASE`, `CAPABILITY_CONFLICT`, `UNKNOWN_CAPABILITY`, `NO_MATCH`, `ONLY_UNAVAILABLE`, `ROBOT_NOT_FOUND`, `ROBOT_BLOCKED`, `ORCA_DOWN`, `ORCA_DB_DOWN` |
| 4 | `Verify robot` | 1 s | preflight `R` against the checked-out robot's document, keys in order `physicalTouch, deviceType, printer, duo, …` (`tethered` is **not** re-checked: a named run takes its RUN_TYPE from the MFD relation and the test guards itself, §3.19.2 — INC45 [sim]) | jobs with `pinEntry` tests: `PIN entry requires physical touch` → `PIN_NEEDS_PHYSICAL`; otherwise `capability mismatch: deviceType COMPACT required` → `CAPABILITY_MISMATCH` (Cur M09, INC52) |
| 5 | `Merchant` | 0 / ~53 s | §3.17.1 | `LAZ_FAILED`, `UBI_ROUTE`, `MERCHANT_MISMATCH` |
| 6 | `Inject environment` | 1 s | §3.18.4 | — |
| 7 | `Run tests` | runner | §3.19–§3.21 (`> Task :app:connectedDebugAndroidTest` banner for uia-remote, 10 s Gradle start-up) | runner codes (§3.18.6) |
| 8 | `Release robot` | 1 s, **always** (`post { always }`) | §3.4.5 | — |
| 9 | `Publish results` | 2 s | `Tests: 2, Failures: 0, Errors: 0, Skipped: 0` | — |
| — | final line | | `Finished: SUCCESS` · `Finished: FAILURE` · `Finished: UNSTABLE` · `Finished: ABORTED` | |

Runner timeouts are honest: a run that waits out the 60 s printer-payload timeout lasts ≈ 95 s.
`jenkins.abort` ⇒ current stage `failed`, release runs, `Finished: ABORTED`.

#### 3.18.4 Environment injection (ALL CAPS keys; enum values straight from Orca)

| Key | Value |
|---|---|
| `BUILD_TAG` | `jenkins-Java-uia-remote-regression-flex-4127` |
| `RUN_TYPE` | `tethered` if the robot's MFD is populated, else `standalone` |
| `DEVICE_TYPE` | the Robot Device's enum (`FLEX_3`) — never the raw param |
| `DEVICE_FAMILY` | `Flex` / `Mini` / `Station` / `Compact` (→ uia-remote `deviceType`) |
| `ROBOT_NAME` | robot Name |
| `MFD_IP`, `CFD_IP` | MFD/CFD device IPs (Duo: both the same); standalone: device IP / empty |
| `SERIAL` | primary device serial |
| `PORT_NUMBER` | `5444` |
| `THEME` | `avocado` |
| `KERNEL_TYPE` | `CPA` |
| `UNLOCK_PASSCODE` | `0000` (masked) |
| `BACKEND_ENV` | robot environment |
| `MERCHANT`, `CARD_PROFILE` | params |
| `APP_ID`, `APP_SECRET`, `API_KEY` | from Merchant Config(`MERCHANT`) (Tate's fields); `''` when null |
| `ORCA_URL` | `http://orca.lab.local:8080` |

Console block (Cur M11 one-per-line for the core keys; GP INC51 one line for credentials):
```
[env] RUN_TYPE=standalone
[env] DEVICE_TYPE=FLEX_3
[env] ROBOT_NAME=wall-e
[env] PORT_NUMBER=5444
[env] THEME=avocado
[env] KERNEL_TYPE=CPA
[env] APP_ID=app_sim_7f3a APP_SECRET=**** API_KEY=****
```
Masking: non-empty `APP_SECRET`, `API_KEY`, `UNLOCK_PASSCODE` print as `****`; empty prints empty
(`API_KEY=` — INC51's tell). The credential line is printed only when `MERCHANT` has any of the three.

#### 3.18.5 Console prefixes and stage lines

`[Pipeline] stage (Checkout robot)` before each stage; `[orca]`, `[runner]`, `[MFD_O1]`…, `LSTR`,
`[callus]`, `[pi]`, `[ocr]`, `[vision]`, `[device]`, `[go-sdk]`, `[paycore]`, `ubi:`, `laz:`, `[env]`.
Robot status in Orca while running: `Available · in use by Jenkins #4127`.

#### 3.18.6 Failure codes (`JenkinsBuild.failureCode`, for missions)

`SCM`, `SCRIPT`, `JSON_PARSE`, `ENUM_CASE`, `CAPABILITY_CONFLICT`, `UNKNOWN_CAPABILITY`, `NO_MATCH`,
`ONLY_UNAVAILABLE`, `ROBOT_NOT_FOUND`, `ROBOT_BLOCKED`, `CAPABILITY_MISMATCH`, `PIN_NEEDS_PHYSICAL`,
`ORCA_DOWN`, `ORCA_DB_DOWN`, `LAZ_FAILED`, `UBI_ROUTE`, `MERCHANT_MISMATCH`, `CONFIG_INVALID`,
`ADB_CONNECT`, `DEVICE_UNREACHABLE`, `TETHER_REQUIRED`, `PAY_DISPLAY_LINK`, `UI_NOT_FOUND`,
`WAIT_TIMEOUT`, `ASSERTION`, `XY_TOUCH_ERROR`, `CARD_ERROR`, `PRINTER_TIMEOUT` (the "select print" case),
`PRINTER_NOT_AVAILABLE`, `OCR_MISMATCH`, `OCR_CAPTURE`, `EVIDENCE_CAPTURE`, `MISSING_CREDENTIAL`,
`OLLAMA_DOWN`, `VISION_FAIL` (UNSTABLE), `LSTR_UNKNOWN_ACTION`, `LSTR_PLATFORM`, `JENKINS_RESTART`, `ABORTED`.

### 3.19 uia-remote runner

#### 3.19.1 Configuration

CI: from the injected env (§3.18.4). Local (IntelliJ ▶): parsed from the local clone's
`config.properties` (the file is the source of truth; `workstation.configProperties` mirrors it).
Validation, in order, exact messages:

| Check | Message (`java.lang.IllegalStateException: …`) |
|---|---|
| file missing (local) | `config.properties not found — copy config.properties.example` |
| key missing | `config.properties missing key 'customerFacingDeviceIp'` (only required when `runType=tethered`) |
| `theme` ≠ `avocado` | `Unsupported theme "classic" — only "avocado" is supported` |
| `kernelType` ≠ `CPA` | `Unsupported kernelType "SPA" — use "CPA"` |
| `deviceType` ∉ `Mini`/`Flex`/`Station`/`Compact` | `java.lang.IllegalArgumentException: unknown deviceType "FLEX_4" (expected Mini, Flex or Station)` |
| `runType` ∉ `tethered`/`standalone` | `Unsupported runType "duo"` |
| `portNumber` not an integer | `Invalid portNumber "five"` |

`portNumber=5555` is **valid** (that is the danger, §3.15.3). The 11-key validator target is Cur M14's.

#### 3.19.2 Run header and handles

```
[runner] uia-remote 4.2.0 · UI Automator 2.3 · runType=tethered · deviceType=Station
[runner] MFD handle 10.42.30.21:5444 connected
[runner] CFD handle 10.42.30.22:5444 connected
[setup] wake + unlock (passcode ****) … OK
[setup] HomeScreen.waitForScreen() … OK  (MFD, CFD)
```
Standalone runs print `DEVICE handle …`. The handle lines (and the two `Tethered rig detected` / `MFD relation empty` lines below) are printed by the shared runner harness, which the uia-remote and Go SDK runners both use (prefix `[runner]`). A tethered test with `runType=standalone` (or an empty
MFD in Orca ⇒ `RUN_TYPE=standalone`) prints `[runner] MFD relation empty → standalone` and the
TaxTest guard fails `AssertionError: TaxTest requires a tethered rig (MFD/CFD)` (`TETHER_REQUIRED`,
INC45). A standalone rig with MFD populated (INC46) prints `[runner] Tethered rig detected (MFD populated) → MFD <ip>:5444, CFD <ip>:5444`
and drives whatever devices those rows point at.

**Setup safe state** (Ref §4 "every test starts explicitly from HomeScreen"): after unlock, each test
asserts `HomeScreen.isScreenPresent()`; if false ⇒
`AssertionError: HomeScreen.isScreenPresent() == false — current screen: RegisterOrderScreen` (page-object
name of the current screen, table §3.19.7) — INC35. uia-remote does **not** press Home for you.

#### 3.19.3 Click routing

A page-object action targets a screen + element. If the rig has a gantry and its probe covers that
display ⇒ the runner calls Orca `xy_touch(robot, <OrcaScreen>, <button>)` (console
`[orca] xy_touch wall-e REGISTER_HOME/Review Order → PHYSICAL_TAP (56.0, 124.0)` — with ` (offsets +0.0/+1.5)` appended whenever the robot's offsets are non-zero (INC14) — or the error, e.g.
`[orca] xy_touch wall-e REGISTER_HOME/Register → 409 Conflict: LOCK_RELEASED (park required)`); then
waits for the expected next screen. Otherwise (tethered, ADB bots, Duo MFD) ⇒ UI Automator click =
find element in the hierarchy → inject a tap at its centre (rect hit test). Secure Touch PIN pads
can only be pressed through `xy_touch` on a physical rig; elsewhere: `PIN entry requires physical touch`.

#### 3.19.4 Test plans (CI and local share them)

`SaleTest` (PL1/PL4; standalone): 1 `HomeScreen.open("Register")` → 2 `addTaxItem5()` → 3 `reviewOrder()`
→ 4 `ReviewOrderScreen.pay()` → 5 `PaymentScreen.charge()` → Orca `/api/card/<entry of CARD_PROFILE>` (swipe, dip or tap) →
6 `TipScreen.noTip()` → 7 wait Approved → `ReceiptScreen.noReceipt()` (map `RECEIPT_OPTIONS_4/5` by
option count) → 8 wait Thank you → teardown `KEYCODE_HOME`. Log `SaleTest PASSED (8/8 steps)`.
`HomeScreenTest`: open each of Register, Orders, Setup and return home (4 steps).

**`TaxTest` (tethered; Ref §4; exact sequence)**

| Step | Focus | Actions | Log lines |
|---|---|---|---|
| setup | both | unlock; assert HomeScreen on MFD and CFD | `[setup] …` |
| **MFD_O1** | MFD | `open("Register")` · `addTaxItem5()` · `reviewOrder()` · Orca `POST /api/card/swipe {"robot":"megatron","profile":"VISA_STD_SWIPE"}` (armed on the SmartStripe) | `[MFD_O1] open Register` · `[MFD_O1] add "Tax Item 5"` · `[MFD_O1] Review Order` · `[MFD_O1] orca → callus: load swipe card VISA_STD_SWIPE … OK` |
| **CFD_O1** | CFD | `CfdTotalsScreen.waitForScreen()` · assert Subtotal `$10.00`, Tax `$0.83`, Total `$10.83` (UIA read of `customer-cart`) | `[CFD_O1] subtotal $10.00 ✓` · `[CFD_O1] tax $0.83 ✓` · `[CFD_O1] total $10.83 ✓` |
| **MFD_O2** | MFD | `ReviewOrderScreen.pay()` · `PaymentScreen.charge()` | `[MFD_O2] Pay` · `[MFD_O2] Charge` |
| **Step 4** | CFD | `CfdPaymentScreen.finalisePayment()`: wait `payment-prompt` → armed swipe fires → `No Tip` → wait Approved → `No Receipt` → wait Thank you | `[CFD] payment prompt` · `[callus] swipe VISA_STD_SWIPE fired → OK` · `[CFD] approved (SIM…)` · `[CFD] receipt: No Receipt` |
| teardown | both | `@After tearDown()`: `mfd.run(homeScreen::goHome); cfd.run(homeScreen::goHome);` | `[teardown] MFD → HomeScreen · CFD → HomeScreen` |
| result | | | `TaxTest PASSED (4/4 steps)` (local ≈ 25 s physical) |

Assertion failure format: `AssertionError: [CFD_O1] tax expected $0.83 but was $0.82`.
Pay-display link down ⇒ `[CFD_O1] waitForScreen timed out (CustomerOrderScreen)` (`WAIT_TIMEOUT`, INC47).

`TaxTestDuo` (R2-D2, both IPs `10.42.30.14`): as TaxTest; CFD steps use UIA 2.3 display-1 locators
(after Cur M16) — with `flags.uiaVersion == '2.2'` they fail `UiObjectNotFoundException`.
`DuoCfdSuite` (PL7): MFD steps via UIA; after Review Order `orca.screenCompare("CFD_TOTAL")` must be
true (`[ocr] …` line, else `AssertionError: screenCompare CFD_TOTAL returned false` → `OCR_MISMATCH`);
customer steps by `xy_touch` on `CFD_TIP`/`No Tip`, `CFD_RECEIPT_OPTIONS_5`/`No Receipt`,
`CFD_RECEIPT_DONE`/`Done`. `DuoCheckoutTest`: same, final check `orca.screenCompare("CFD_THANK_YOU")` —
or, once migrated (INC38), `cfdThankYou.waitForScreen(); assertTrue(cfdThankYou.isScreenPresent());`.
`PrinterlessSmokeTest`: SaleTest with `No Receipt`. `ContactCanadaPinSaleTest` (PL5, SETI): sale →
Orca `/api/card/dip INTERAC_CA_DIP` → PIN pad via `xy_touch PIN_ENTRY` `1`,`2`,`3`,`4`,`Enter` (4 visible
solenoid taps + Enter) → No Tip → Approved → `RECEIPT_OPTIONS_4`/`No Receipt` → **evidence capture**
`[vision] GET <cameraStreamUrl> → 200 (frame saved)` — camera unreachable ⇒
`[vision] GET http://10.42.10.40:8081/stream.mjpg → Connection refused` → `Finished: FAILURE`
(`EVIDENCE_CAPTURE`, INC08). `PaycoreMatrixTest` (PL8): merchant assert (§3.17.1), then one dip sale
per profile in `CARD_PROFILE` (comma list) back-to-back: `[paycore] VISA_STD_DIP → APPROVED (SIM…)`, etc.
`RefundTest`: starts with the HomeScreen assertion (INC35's victim).

#### 3.19.5 Render race and `waitForScreen()` (INC32, Cur M13)

Every screen transition sets `display.renderDoneMs = now + renderMs`, `renderMs` drawn from the
`devices` stream: 90 % `U(200, 1200)` ms, 10 % `U(5000, 8000)` ms (GC stall). A page object's first
interaction with a screen happens:
* after `waitForScreen()` when implemented as `device.wait(Until.hasObject(<Zone 1 locator>), TIMEOUT_MS)`
  (`TIMEOUT_MS = 10000`) ⇒ always after render ⇒ never flaky;
* at `+700 ms` when `waitForScreen()` is empty or not called before the click ⇒ fails when
  `renderMs > 700` (p ≈ 0.55, "1 in 2"): `androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT=Review Order]`
  (GP's `UiObjectNotFoundException: "Review Order" not found (screen still rendering)` is the console summary);
* at `+n ms` with `Thread.sleep(n)` ⇒ fails when `renderMs > n` (n = 5000 ⇒ p = 0.10).
A physical probe tap before render completes hits nothing (buttons not drawn yet).

#### 3.19.6 Code facts (static predicates the runner and NPC reviewers evaluate)

Evaluated on the commit the run uses (CI: `main`/`BRANCH` head; local: the working tree). Regex-level [sim].

| Id | Predicate | Effect |
|---|---|---|
| CF01 | `waitForScreen()` body calls `device.wait(Until.hasObject(X), …)` with `X` a `BySelector` field declared in the class | no render race for that screen |
| CF02 | `waitForScreen()` body is `Thread.sleep(n)` | race at n ms |
| CF03 | `waitForScreen()` empty / missing, or not called before the first `click()` (in the action method or the test) | race at 700 ms |
| CF04 | `isScreenPresent()` declared with a `return` | required by the setup assertion classes (HomeScreen) and by NPC review |
| CF05 | `HomeScreen.open()`: the branch whose condition mentions `FLEX` calls `scrollVerticallyTo`, the other `scrollHorizontallyTo` | `correct`; swapped ⇒ wrong direction on every device; single direction ⇒ wrong on one family |
| CF06 | test class has `@After` calling `goHome` on every handle it used | teardown present (INC35) |
| CF07 | `orca.screenCompare("NAME")` occurrences | which compare rows a test uses (`usedBy`) |
| CF08 | locator uses `displayId(` | CFD element via UIA 2.3 |
| CF09 | file path/package: page objects under `androidTest/java/com/lab/uia/pageobjects/` with matching `package` | wrong package ⇒ `error: cannot find symbol` compile failure in tests that import it |
| CF10 | any changed path under `app/src/main/` | Morgan's review comment |
| CF11 | committed `config.properties` with `portNumber=5555` | review comment |
| CF12 | Java syntax sanity: balanced braces, `;` at statement ends | else `> Task :app:compileDebugAndroidTestJavaWithJavac FAILED` + `error: ';' expected` |

`open(appName)` with the wrong direction (INC33): the runner scrolls 5 times, logging
`[HomeScreen] open("Register"): scrolling horizontally (Mini/Station)…` each time; the app is found only
if it is on the current launcher page, else `AssertionError: App 'Register' not found on HomeScreen`.

#### 3.19.7 Runtime screen → page-object names (for messages)

`home` HomeScreen · `lock` LockScreen · `register` RegisterHomeScreen (RegisterOrderScreen when the
order has lines or is a paid tethered order) · `review-order` ReviewOrderScreen · `tender-select`
PaymentScreen · `payment-prompt` PaymentPromptScreen · `customer-cart` CustomerOrderScreen (CfdTotalsScreen
for the Duo) · `tip` TipScreen · `receipt-options` ReceiptScreen · `thank-you` ThankYouScreen ·
`waiting-for-merchant` WaitingForMerchantScreen.

### 3.20 Pigeon LSTR runner (legacy)

#### 3.20.1 Parse (no linter, unhelpful errors)

The runner parses the test file with a strict JSON parser that reports the **first unexpected token**
— which, for a missing comma, is the token *after* the missing comma (the lesson: look at the end of
the previous line). Exact messages (prefixed `LSTR ParseError: `; line/column 1-based, tabs = 1 column):

| Situation | Message |
|---|---|
| unexpected punctuation (`{`, `}`, `[`, `]`, `:`, `,`) or stray character | `Unexpected token { in JSON at line 9 column 5` |
| a string where `,`/`}` was expected (missing comma between fields) | `Unexpected string in JSON at line 23 column 7` |
| a number where not allowed | `Unexpected number in JSON at line L column C` |
| trailing comma before `}` / `]` | `Unexpected token } in JSON at line L column C` (position of the brace) |
| single-quoted string | `Unexpected token ' in JSON at line L column C` |
| unquoted key | `Unexpected token n in JSON at line L column C` (first letter of the key) |
| truncated file / missing final `}` | `Unexpected end of JSON input` |

Build: `LSTR ParseError: …` then `Finished: FAILURE` (`JSON_PARSE`); stages after parse are skipped.

#### 3.20.2 Schema and platforms

Required top-level keys: `name` (string), `connectionType` (`USB` | `NETWORK` | `REST`), `platforms`
(1–5 of `REST`, `ANDROID`, `WINDOWS`, `IOS`, `GO`), `actions` (array of `{action, params?, store?}`).
Missing ⇒ `LSTR SchemaError: missing "actions"`. The job's platform must be listed ⇒ else
`LSTR platform ANDROID not in test platforms [REST, IOS]` (`LSTR_PLATFORM`). Variables `${x}` resolve
from stored outputs, then env (`ROBOT_NAME`, `MERCHANT`, …), then runner variables (`RECEIPT_SCREEN`);
unresolved ⇒ `LSTR unresolved variable ${x}`.

#### 3.20.3 Android runner actions ("card swipe" is abstracted into robot actions, Ref §5)

All UI actions go through **Orca `xy_touch`** (ADB_TOUCH on ADB bots, PHYSICAL_TAP on touch rigs), and
waits poll the device via ADB every 500 ms. Each step logs `LSTR step i/N "<action>" …` and then
` OK (3.4 s)` or its failure lines; the build's last lines name the failing step: `FAILED at "<action>"`.

| Action | Does | Wait / timeout | Failure text |
|---|---|---|---|
| `create order` {item} | unlock; `HOME`/`Register`; `REGISTER_HOME`/`<item>`; stores order id | screen 10 s | `LSTR step 1/9 "create order" … expected screen register, still home after 10 s` |
| `review order` | `REGISTER_HOME`/`Review Order` | 10 s | |
| `pay` | `REVIEW_ORDER`/`Pay`; `PAYMENT`/`Charge` (cash-discount merchants: then `TENDER_CASH_DISCOUNT`/`Card`) | 10 s | |
| `card swipe` / `card dip` / `card tap` {profile} | Orca `/api/card/*` (REST platform: an SDK payment request instead) | next customer screen 30 s | `[device] SWIPE_ERROR: invalid track data` etc. |
| `select tip` {screen, button} / `add tip` {percent} | `TIP`/`No Tip` or `TIP`/`18%` | 10 s | |
| `assert approved` | wait `approved` (or later) | 30 s | |
| `select print` {robot, screen} | `xy_touch(robot, screen, "Print")`, then wait for a **printer payload** from the device | **60 s** | `LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s` then `FAILED at "select print"` (`PRINTER_TIMEOUT`) |
| `select email` / `select text` / `select no receipt` / `select scan` | `xy_touch(screen, …)`; wait `thank-you` | 10 s | `… expected screen thank-you …` |
| `verify receipt` {totalCents} | compares `lastReceiptDoc.totalCents` | — | `AssertionError: receipt total $10.84 != $10.83` |
| `screenCompare` {x,y,w,h,expected[,source]} | `source` `screencap` (default: ADB screencap of the primary display, px) or `webcam` (robot camera) → Tesseract (§3.12.2) → exact match | — | `w == 0 or h == 0` ⇒ `LSTR screenCompare: empty region (0x0)`; mismatch ⇒ `LSTR screenCompare: read "TOTAI $10.B3" expected "TOTAL $10.83"` |
| `assert screen` {screen} / `assert home` | current screen check | 10 s | |
| `tap` {screen, button} | generic `xy_touch` | — | Orca error text |
| `wait` {ms} | | | |
| unknown | | | `LSTR UnknownAction: "<name>"` |

**Why "select print" misleads (Ref §5):** Orca answers `200 OK` for the tap whether or not the plunger
hit Print; the device stays on `receipt-options`; the runner's *last* action was "select print", so the
log blames printing when the cause is a stale coordinate (INC20, INC22) — or, on a printerless device,
the missing printer.

Other runners: REST — every action becomes an HTTP request against the sandbox backend
(`POST https://apisandbox.dev1.labsim.example/v1/payments` [illus.]) and passes unless the JSON is
broken or credentials are empty; WINDOWS (`pigeon-windows-tender`) and IOS — scripted pass (rarely
touched, Ref §5) unless the JSON is broken.

### 3.21 Go SDK runner and Ollama vision checks

#### 3.21.1 Go SDK (`Java/go-sdk-sale-smoke`, ADB bots)

Steps from `go-sdk/tests/sale_receipt.json`: `connect` requires non-empty `APP_ID`, `APP_SECRET`,
`API_KEY` ⇒ else `panic: Terminal SDK: missing credential API_KEY (env var empty)` (first missing in
that order; `MISSING_CREDENTIAL`, INC51). `sale` drives the device through the SDK (no physical card:
SDK test-card injection [illus.]; PIN-bypass merchants only) — `[go-sdk] Sale 1000 → APPROVED (SIM481)`.
`printReceipt` ⇒ payload if the device has a printer and paper, else `[go-sdk] PrintReceipt → PRINTER_NOT_AVAILABLE`
(`PRINTER_NOT_AVAILABLE`, INC23).

#### 3.21.2 Ollama (`10.42.1.12:11434`, model `llava:latest`)

* Request lifecycle: `ollama.ask(model, prompt, image)` → `running` → done after **6 s** physical (+2 s
  model load on the first request after a restart). Service down ⇒ the app shows
  `Model server unreachable`; curl/Jenkins `curl: (7) Failed to connect to 10.42.1.12 port 11434: Connection refused`.
* Response generation (deterministic): if `image` refers to a receipt (`img:receipt:*` with a
  `ReceiptScenario`, or the latest printed receipt), compute **observed** values = printed values with
  the scenario's `misread` applied; expected tip = `roundHalfUp((subtotal + tax) × pct, 100)`.
  * observed consistent ⇒ `PASS — layout complete (merchant header, items, subtotal, tax, tip, total); tip of 18% on $42.00 is $7.56 and the total $49.56 is correct.`
  * observed tip wrong ⇒ `FAIL — tip of 18% on $42.00 should be $7.56; the receipt shows $7.65.` (Cur S15)
  * observed total wrong ⇒ `FAIL — total should be $49.56; the receipt shows $49.65.`
  * no image ⇒ `I need an image of the receipt to check it.`
  * `correct` = verdict agrees with the *printed* receipt's real maths (false-positive detection, INC57).
* Seeds: `img:receipt:wall-e:0912` (Cur M17): subtotal 4200, tax 0, 18 %, printed tip **765** (a real
  bug), no misread. INC57 variant A: printed 756, misread tip shown as `$7.65`; variant B: printed 765
  or 776, no misread.
* `Java/vision-poc-receipt-check`: named WALL-E sale with Print → webcam snapshot of the printed
  receipt → Ollama → `[vision] llava verdict: PASS` ⇒ SUCCESS; `FAIL …` ⇒ **UNSTABLE** (a PoC, not a
  release gate); Ollama unreachable ⇒ FAILURE (`OLLAMA_DOWN`, INC10).
* REST: `GET /api/tags` → `{"models":[{"name":"llava:latest","model":"llava:latest","size":4733363377,"details":{"family":"llama","parameter_size":"7B","quantization_level":"Q4_0"}}]}`;
  `POST /api/generate {"model","prompt","images":[…]}` → `{"model":"llava:latest","response":"…","done":true}`.

### 3.22 Git, GitHub and scripted reviewers

#### 3.22.1 Git

* `clone` → local working copy `~/IdeaProjects/<repo>` at `main` head (`git.cloned`).
* `checkout -b <branch>`, edits (`writeFile`), `add`, `commit` (sha = 40 hex from FNV-1a over
  `repo|parent|message|seq`, repeated; short sha = first 7), `push` (creates/updates the remote branch),
  `pull`.
* Branch protection [illus.]: `gort` and `orchestrator` `main` reject direct pushes:
  `! [remote rejected] main -> main (protected branch hook declined)`; `uia-remote` and `pigeon` accept
  them (team practice is still a PR for uia-remote — GP PB/INC38).
* `git log -1 --stat`, `git diff HEAD~1` are computed from stored commit changes (apps doc renders them).

#### 3.22.2 Pull requests and NPC reviewers (`config.npcAutoMerge`)

Opening a PR auto-requests the owner: `gort` → Jared, `uia-remote`/`pigeon` → Morgan, `orchestrator` → Tate.
The NPC acts **20 s physical** after the PR opens (SR16, Cur M09) and again 20 s after each new push:

| Reviewer | Approves and merges when | Otherwise (comment + Request changes) |
|---|---|---|
| Jared (gort) | every changed `config/screen-locations/<TYPE>/<SCREEN>.json` parses and each button is within **±0.5 mm** of firmware truth (§2.10) for that type/screen; other paths: always | first offender: `Print on MINI_3 is still 3.0 mm high` (format `<button> on <TYPE> is still <d> mm high\|low\|left\|right`) / `RECEIPT_OPTIONS_5.json doesn't parse: <LSTR-style message>` |
| Morgan (uia-remote, pigeon) | CF09/CF10/CF11/CF12 clean, page objects have CF01 + CF04; pigeon JSON parses | `QA never modifies main` · `Missing mandatory isScreenPresent()` · `portNumber must be 5444` · `Page objects belong in pageobjects` · parse error text |
| Tate (orchestrator) | never merges in-game | `Thanks — I'll take it from here.` |

Player reviews (`approvePullRequest`, `requestChanges`, line comments with `reason` ids
`main-edit`, `missing-isScreenPresent`, `missing-waitForScreen`, `port-5555`, `extends-BaseTest`) are
recorded on the PR (`comments`, `verdict`) for missions (INC34). An approved PR from the player on
someone else's change is merged by its owner NPC.

#### 3.22.3 Gort → Orca screen-location sync

10 s physical after a merge to `gort/main` that touches `config/screen-locations/<TYPE>/<SCREEN>.json`,
Orca upserts Screen `(TYPE, SCREEN)` and replaces its locations with the file's buttons
(`orca.screenLocationsSynced`, audit `SYNC gort@<sha> config/screen-locations/FLEX_3/RECEIPT_OPTIONS_5.json`).
Direct Orca edits are **not** written back to Gort (drift is possible and visible in a diff view).
Card files under `cards/` reach Windows boxes only through `GortCardSync` (§3.14.6).

### 3.23 REST surfaces (what `curl`, the apps and the runners call)

**Orca** `http://orca.lab.local:8080` (JHipster; errors use the JHipster problem JSON
`{"title":"Bad Request","status":400,"detail":"<text>","path":"/api/…","message":"error.validation"}`;
the "detail" is the exact text given in this doc):

| Method · path | Body / query | Success |
|---|---|---|
| `GET /management/health` | — | `{"status":"UP"}` |
| `GET /api/robots` | `?status.equals=CONNECTION_FAILED`, `?status.in=…`, `?name.contains=…`, `?environment.equals=DEV1` (Tate's filter UI) | array |
| `GET /api/robots/{id}` · `PUT /api/robots/{id}` · `POST /api/robots` · `DELETE /api/robots/{id}` | entity | entity |
| `PUT /api/robots/{id}/status` | `{"status":"RESERVED"}` | entity |
| `GET /api/robots/{name}/capabilities` | — | capability document |
| `POST /api/robots/checkout` · `POST /api/robots/{name}/release` | §3.4 | `{"robot":"wall-e","deviceType":"FLEX_3","runType":"standalone","env":{…}}` |
| `POST /api/match-preview` | `{"capabilities":{…},"environment":"DEV1"}` | `[{"robot":"vision","matches":true,"status":"AVAILABLE"},…]` |
| `POST /api/xy_touch` | `{"robot","screen","button"[,"target"]}` | `{"result":"OK","mode":"PHYSICAL_TAP","x_mm":22.0,"y_mm":58.5}` |
| `POST /api/card/{swipe\|dip\|tap}` | `{"robot","profile"}` | `{"result":"OK","entry":"DIP","probe":"collis-wall-e","callus":"10.42.20.1:9000"}` |
| `POST /api/screen-compare/{name}/test` | — | `{"text":"TOTAL $10.83","expected":"TOTAL $10.83","match":true}` |
| `POST /api/health-check/run` | — | `202` (tutorial; `403 Force health check is disabled in this environment` when not allowed) |
| `GET/POST/PUT/DELETE /api/{devices,robot-capabilities,merchant-configs,screens,screen-locations,card-profiles,screen-compare-images}` | JHipster CRUD; `?deviceType.equals=FLEX_3`, `?screenId.equals=…` | |

**Robot Pi** `http://<pi>:8000` [illus.]: `GET /health` (§3.3.3) · `GET /status`
(`{"robot":"wall-e","banner":"green","homed":true,"lock":true,"steppers":true,"x_mm":0.0,"y_mm":0.0}`) ·
`POST /adb {"serial","cmd"}` · `POST /touch {"x_mm","y_mm"}` · `POST /motion {"cmd":"park.all"}` ·
`POST /dip|/tap|/swipe {"action":"in|out"}` · `POST /cardprog {"profile"}` · `POST /ocr` ·
camera `http://<cam-host>:8081/stream.mjpg` and `/snapshot.jpg`.

**Callus** `http://<box>:9000`: `GET /status` · `POST /load {"probe","path"}` · `POST /swipe {"probe","track"}` · `POST /arm`.

**Ollama** §3.21.2. **Jenkins** `GET /job/Java/job/<name>/lastBuild/api/json` →
`{"number":4127,"result":"SUCCESS","building":false,"duration":60213}`;
`POST /job/Java/job/<name>/buildWithParameters?DEVICE_TYPE=FLEX_3` → `201` [illus.].

### 3.24 Small systems

* **3D printers** (`printer3d.start('prusa'|'bambu', file)`): 90 s physical, then the part
  (`cradle_flex_gen3`, …) appears on the tray. `rig.replaceCradle(rigId)` requires the part, the
  device lifted, 4 × 2.5 mm bolts (screwdriver): `cradle = 'NEW'`, `cradleTiltDeg = 0`, `homed = false`.
* **Rig repairs**: `rig.reseat('solenoidConnector')` (door open), `rig.alignDipArm(rigId)` (only with
  steppers disabled or MOTOR off — otherwise `The arm is held by its stepper`), `host.setEthernet`,
  `rig.moveMotorUsb(rigId, 'PI' | hostId)` (INC19) — the controller only uses a local PCB after
  `controller.yaml` says `motion: local` and `robot-controller` restarts.
* **Device hardware swap** (`device.swapHardware`): removes the old device to storage (keeps its
  runtime record, unpowered), places the new one on the rig's cradle/hub; Orca rows are untouched —
  the engineer creates the new Device row and re-links Robot Device (INC42/43).
* **Chat**: `chat.post` appends; NPC replies are scheduled by missions through `chat.schedule`
  (`chat.deliver` timer; `delayMs: '@npc'` = 10–20 s physical from the `npc` stream, GP SR18). The
  devops NPC reviewers use `npc.reply` timers for their own LabChat lines.

---

## 4. Fault injection

### 4.1 Model and API semantics

A **fault** is a named, parameterised *state mutation* that puts some part of the lab into a broken
condition a real engineer could find and fix (or, for a few, a condition the incident asks them to work
around). Rules every fault implementation MUST follow:

1. **Mutate causes, never symptoms.** A fault writes only the causal fields listed in its *Mutation*
   column (an `os`, a `blown` flag, a coordinate, a file, a saved parameter). It never writes Notes,
   console lines, LEDs, banners, toasts, chat or statuses that a §3 system derives; those appear on the
   following ticks because §3 runs. The only "history" a fault may write is the record a real edit would
   leave through the same code path (a CONFIG/STATUS Note and audit row for an Orca edit, a commit for a
   repo edit, a job-config audit for a Jenkins edit) — see *Edit-style faults* below.
2. **Clear on a condition, not a flag.** Every fault has a pure predicate *Clears when* over `LabState`
   ("the broken condition no longer holds"). The faults system (tick step 15) auto-clears the fault when
   the predicate has been true for `holdMs` physical ms (default 0). Faults marked **API only** describe a
   fact the incident does not ask the player to change (a dead Duo 2 awaiting RMA, a full NUC disk); their
   predicate is constant `false` and missions clear them through `faults.clear` when the incident ends.
3. **Compose.** Injecting several faults equals applying their mutations in order; predicates are
   evaluated independently. Two faults may touch the same component (compound incidents, GP §2.3.3); each
   still clears on its own predicate.
4. **No time, no foreign randomness.** `inject` never advances a clock and draws random numbers only from
   `rngStreams.faults` (for `'@random'` parameters).
5. **Never forge evidence after the fact.** Injection is not backdated: a fault injected at 08:13 makes the
   08:15 health check fail. Missions that need the post-failure world wait for the system that produces it
   (`orca.healthCheckRan` with the robot in `failedRobotIds`, `jenkins.buildFinished`, …). Presets apply
   their faults during `reset`, before tick 0, so the first health check of the session reveals them
   (Academy's **Force health check** makes that immediate).

#### 4.1.1 Life cycle

```
faults.inject(spec) ──▶ ACTIVE ──(predicate true for holdMs physical)──▶ CLEARED {clearedBy:'condition'}
                          │
                          └──(faults.clear(id, actor))──────────────────▶ CLEARED {clearedBy:'api'} + revert
```

`ActiveFault` (§1.14, extended in §1.15): `{ id, faultId, target, params, injectedMs, cleared,
clearedMs, clearedBy, undo, holdSincePhysMs }`. Cleared faults stay in `faults[]` (history for the
debrief and the Free Play injector) until housekeeping trims the array to the newest 100 entries,
oldest **cleared** ones first.

#### 4.1.2 `faults.catalogue(): FaultInfo[]`

Static: the same array (sorted by `id`) on every call, built from the core catalogue (§4.3.1–§4.3.7)
plus the devops catalogue (§4.3.8–§4.3.10, `DEVOPS_FAULTS` in `src/sim/devops`; `rig.testRunning` is devops-owned because it is a Jenkins build). `FaultInfo` =
`{ id, title, description, category, owner, params: FaultParamInfo[], tags, clears, symptoms, usedBy,
injectable, holdMs, apiOnly }` (contract in `api.ts`). `FaultParamInfo` = `{ name, description, example,
kind, values?, default?, required, target }`; exactly one parameter per fault has `target: true` (the
component the fault breaks; faults without a target use the literal target `"lab"`).

#### 4.1.3 `faults.inject(spec): Result<{ instanceId }>`

In one `transact()`:

1. Look up `spec.faultId` → else `unknown fault 'x'`.
2. Resolve parameters: fill `default`s; a value `'@random'` on a parameter with `values` (or a target
   kind) draws uniformly from `rngStreams.faults` over the listed values (target kinds: the candidates
   named in the parameter description, in id order). Validate: required present, type/kind, enum
   membership, target exists → else `fault <id>: invalid param <name>='<value>' (<reason>)` where
   `<reason>` is `missing`, `not a number`, `not one of a, b, c` or `no such <kind>`.
3. Duplicate guard: an ACTIVE fault with the same `faultId` and `target` exists →
   `fault <id> already active on <target> (#<instanceId>)`.
4. Precondition: the target must be in the healthy state this fault breaks → else
   `fault <id>: nothing to break (<reason>)` (e.g. `fuse.blown` on a blown fuse: `F-RACKB-5V is already
   blown`). Documented exceptions: `nuc.diskFull` on `nuc-03` (already full at factory — no-op),
   `receipt.qrRollout` on devices that already have the feature (no-op).
5. Validate-then-apply: every check above is done before the first write, so a rejected inject changes
   nothing. Apply the mutation; record every written leaf as an undo patch
   `{ path: (string|number)[], before, after }` (`path` from the `LabState` root, e.g.
   `["hosts","pi-wall-e","os"]`; a deleted record has `after: null`, a created one `before: null`).
6. `instanceId = "f" + (++seq.fault)`; push the `ActiveFault` (`injectedMs = nowMs`, `cleared = false`).
7. Log `{ source: 'faults', level: 'info', text: 'inject f12 pi.hung target=pi-wall-e' }`; emit
   `fault.injected`. Never posts chat, never touches Notes except as rule 1 allows.

#### 4.1.4 `faults.injectAll(items): Result<{ instanceIds }>` (NEW)

Applies an ordered list of `FaultSpec | SetupOp` (a *scenario*, §4.5) in one `transact()`. Every item
is validated against the state as it will be after the previous items (validation runs on a scratch
copy); the first error aborts the whole list with `scenario item <n> (<id>): <error>` and nothing is
applied. `instanceIds` lists the fault instance ids in order (setup ops produce none).

#### 4.1.5 `faults.clear(instanceId, by): Result`

Unknown → `no fault '<id>'`; already cleared → `fault <id> already cleared`. Otherwise **revert**:
if the definition has a custom revert (listed in its row), run it; else walk `undo` in reverse and
write `before` at each `path` **only if the current value still deep-equals `after`** — a value the
player or physics changed since injection is left alone (an API clear never stomps player work).
Reverts obey rule 5: they restore *causes* and let systems recover (e.g. `pi.hung` reverts by
power-cycling the Pi: `os = 'BOOTING'`, `bootStartedPhysMs = physMs` — never straight to `RUNNING`).
Then `cleared = true`, `clearedMs = nowMs`, `clearedBy = 'api'`; log; emit
`fault.cleared { by: <actor> }`.

#### 4.1.6 `faults.isResolved(instanceId): boolean`

Pure. Cleared → `true`; unknown → `false`; else the definition's predicate on the current state
(ignores `holdMs`). Missions use it for "is the cause gone?"; ticket success still uses the GP DSL
(e.g. INC03 also requires ROSIE to stay Unavailable — not part of `fuse.blown`'s predicate).

#### 4.1.7 Auto-clear (tick step 15)

For each ACTIVE fault in array order: `r = predicate(lab, fault)`. If `r`: `holdSincePhysMs ??= physMs`;
when `physMs − holdSincePhysMs ≥ holdMs` → `cleared = true`, `clearedBy = 'condition'`,
`clearedMs = nowMs`, emit `fault.cleared { by: 'condition' }`. If `!r`: `holdSincePhysMs = null`.
A fault whose component is re-broken by the player (an under-rated fuse that blows again) therefore never
clears early.

#### 4.1.8 Edit-style faults

Faults on Orca data (§4.3.7), merchants, card profiles, repos and Jenkins jobs are applied **as an edit
by an NPC through the same code path a player edit uses**, so the world records them exactly as reality
would: Orca writes the CONFIG/STATUS Note and audit row (`by` param, default per row; `atMs` param,
default `nowMs`, may be negative = yesterday — history, not symptoms); repo faults are a commit on the
default branch by `by` with the row's commit message (so `git log -1 --stat`, `git diff HEAD~1` and
GitHub history show them, GP INC23/INC25); Jenkins faults are a job-configuration change recorded in
the job's config history (`savedParams`/`script`). A player's local clone made before the fault is
simply behind (`git pull` brings the fault in).

#### 4.1.9 How missions compose faults

* An incident (GP §3), Academy setup (Cur §2), certification practical (Cur §5.3) or drill item is a
  **scenario**: an ordered list of `FaultSpec | SetupOp` with role placeholders (`'$R'` = the bound rig,
  `'$PI'` = its Pi host id, `'$DEV'` = its Robot Device runtime id, `'$BOX'` = its Callus host) that
  missions substitute before calling `faults.injectAll`. Appendix A lists every scenario.
* Variants are separate scenarios; compound incidents concatenate two scenarios on one rig (INC03-C =
  INC03 + INC04 on JOHNNY-5).
* Arcade: the director injects at spawn time and opens the ticket when the scenario's *reveal* event
  happens (`healthCheck` → next `orca.healthCheckRan` that fails the rig; `pipeline` → next
  `jenkins.buildFinished` with a non-SUCCESS result on that rig; `immediate` → at once). Free Play's
  Fault Injector calls `faults.inject` for any `injectable` entry and shows `isResolved` live.
* Academy: the preset (§6.5) applies the module's scenario during `reset`; replays re-apply it.

### 4.2 Catalogue conventions

* **Id** — `<domain>.<camelCase>`, stable forever (content and saves reference it).
* **Params** — `name` (default); `R` = required. Target parameter first. Target kinds: `host`, `rig`,
  `robot` (Orca Name), `device` (runtime id), `fuse`, `outlet`, `regulator`, `probe`, `merchant`
  (Merchant Config name), `cardProfile` (name), `deviceType`, `job` (full path), `repoPath`.
* **Mutation** — exact writes. `≔` assigns. For loads: physically modelled loads are written in
  `power.loads[<id>].supply` and mirrored to `hosts[<id>].supply` / `devices[<id>].supply`; off-screen
  hosts have no load and their `hosts[<id>].supply` is authoritative (§1.15 mirror rule).
* **Symptoms** — what §3 then produces, with the producing section; listed for content authors and the
  Field Manual. Not written by the fault.
* **Clears when** — the predicate (with `hold`), or **API only**.
* **Tags** — GP §4.8.1 fine tags (for the Free Play injector and the debrief "Review these").
* **Used by** — GP incidents (`INCnn`, variant letters), Cur modules (`Mnn` / step), certification
  tasks (`P1-1` …), drills (`DRnn`); `FP` = Free Play injector only.

### 4.3 Catalogue

#### 4.3.1 Hosts and services (core)

| Id — title | Params | Mutation | Symptoms (§) | Clears when | Tags | Used by |
|---|---|---|---|---|---|---|
| `pi.hung` — Pi board hung | `host` R (any `pi-*`) | `hosts[host].os ≔ 'HUNG'`, `power ≔ 'crashed'`. Services untouched (nothing answers while hung). Custom revert: power-cycle (`os ≔ 'BOOTING'`, `bootStartedPhysMs ≔ physMs`, `bootProgress ≔ 0`). | PWR solid, **ACT solid on**, Ethernet lit (§3.14.1); ping/ssh time out (§1.9); Notes `→ connect timed out after 10000 ms` for **every** rig the Pi serves, same timestamp (§3.3.3 #1); tablet grey `Status: CONTROLLER UNREACHABLE` (§3.7.5); its camera stream unavailable (§2.11) | `os == 'RUNNING'` (only a power interruption ≥ one sub-step ends a hang, §3.14.1) | `hw.pi` `orca.status.connfailed` `orca.healthcheck` | INC01, INC01-C (`pi-adb-shelf`), INC05 (then cleared by API), INC06, FP |
| `pi.off` — Pi power lead unplugged | `host` R | Pi load `supply ≔ { kind: 'none', targetId: null }` (the lead lies beside its socket). Revert: restore the supply. | power solver de-energises it: `os = 'OFF'`, all LEDs dark (§3.14.1); Notes timeout (§3.3.3 #1); tablet grey (MAIN still on, tablet on battery); camera dark | `os == 'RUNNING'` | `hw.pi` `orca.status.connfailed` | Cur M06 step 7 is the *player's* action (no fault); P2-1 (`'@random'` over the 12 physical rig Pis); INC06 (alt cause); INC07 (via `rig.rebuild`) |
| `pi.serviceDown` — Pi service crashed | `host` R; `service` (`robot-controller`; `robot-controller`, `camera-stream`, `adb-service`, `cardprog`) | `services[service].running ≔ false`, `failure ≔ 'exit-code'`, `startedPhysMs ≔ null`; append the service's crash lines (§4.3.11) to `journal[service]`. | robot-controller: Notes `→ Connection refused` (§3.3.3 #2), tablet grey, ACT normal, ssh works, `systemctl status` → `Active: failed (Result: exit-code)` (§3.14.1). camera-stream: Camera app `Stream unavailable — <url>`; OCR / evidence capture `→ Connection refused` (§3.12.1, §3.19.4); rigs stay Available. adb-service: xy_touch ADB_TOUCH `502 Bad Gateway: robot controller <ip>:8000 unreachable` (§3.5.2 #9). cardprog: `[pi] cardprog: program <P> → 503 CARDPROG_UNAVAILABLE` (§3.6 #6) | `services[service].running` | `hw.pi` `tools.terminal` `orca.status.connfailed` | INC01-B, FP |
| `camera.sharedHostDown` — shared camera service down | `host` (`pi-cam-rackb`; any camera-serving Pi) | as `pi.serviceDown { host, service: 'camera-stream' }` | the 4 rigs on that URL (JOHNNY-5, BAYMAX, SETI, ROSIE) show `Stream unavailable — http://10.42.10.40:8081/stream.mjpg`; PL5 evidence capture `[vision] GET http://10.42.10.40:8081/stream.mjpg → Connection refused` → `Finished: FAILURE` (§3.19.4); the rigs stay Available (§3.3.3) | `services['camera-stream'].running` | `orca.urls` `vision.camera` `hw.pi` | INC08 |
| `camera.usbUnplugged` — webcam USB lead pulled | `host` R (`pi-cam-rackb` or a rig Pi with its own webcam) | `hosts[host].usb` −`"webcam"`; if `host` is a rig Pi also `rigs[r].webcam.connected ≔ false`; `services['camera-stream']`: `running ≔ false`, `failure ≔ 'exit-code'`; journal (§4.3.11) | as `camera.sharedHostDown`, plus `journalctl -u camera-stream -n 3` → `camera-stream[640]: Cannot open '/dev/video0': No such file or directory`; restarting the service fails again until the USB is back | `"webcam" ∈ usb && services['camera-stream'].running` | `vision.camera` `hw.pi` | INC08-B, FP |
| `pi.diskFull` — Pi SD card full | `host` R | `diskUsedGb ≔ diskTotalGb`; `files['/var/log/robot-controller/debug.log'] ≔ '<size:22.9G>'` (a runaway debug log). Deleting that file (`rm`, `truncate -s 0`) frees 22.9 GB. | `/health` → `500 Internal Server Error {"error":"robot-controller: No space left on device"}` (§3.3.3 #3); `df -h /` → `29G  29G  0  100% /` | `diskUsedGb ≤ diskTotalGb − 0.5` | `hw.pi` `tools.terminal` | FP (GP INC19 distractor B) |
| `pi.wineBroken` — Wine prefix broken | `host` R (rig Pi with `cardprog`) | `files['/home/pi/.wine-cardprog/'] ≔ 'corrupt'`; `services.cardprog`: `running ≔ false`, `failure ≔ 'exit-code'`; journal (§4.3.11). While the marker is `corrupt`, every `cardprog` start fails 4 s later with the same lines. `cp -a /opt/cardprog/wineprefix-golden /home/pi/.wine-cardprog` (after `rm -rf`) sets the marker `ok`. | `[pi] cardprog: program VISA_STD_DIP → 503 CARDPROG_UNAVAILABLE` (§3.6); `ps aux \| grep -i wine` has no `CardProgrammer.exe` line; `systemctl status cardprog` failed; `journalctl -u cardprog -n 3` → `cardprog[903]: wine: could not load kernel32.dll, status c0000135` | marker `ok` && `services.cardprog.running` | `cards.wine` `hw.pi` `tools.terminal` | INC56 |
| `eth.unplugged` — Ethernet cable unplugged | `host` R (any host with a jack) | `eth ≔ 'UNPLUGGED'`, `ethernet ≔ false` | timeouts (§1.9 #2) → Notes `connect timed out after 10000 ms`; jack LEDs off; **tablet stays green** (USB link, §3.7.5 #1); ping 100 % loss; camera unavailable from the workstation | `eth == 'LINKED'` | `orca.status.connfailed` `hw.pi` `orca.notes` | INC04, INC03-C, FP |
| `eth.damaged` — damaged Ethernet cable | `host` R | `eth ≔ 'DAMAGED'` (`ethernet` stays true) | every other connection attempt times out (attempt-counter parity, §1.9) → Notes alternate failure / recovery across health checks; link LED flickers | `eth == 'LINKED'` (spare cable fitted: `host.replaceEthernet`) | `orca.status.connfailed` `hw.pi` | INC04-B |
| `callus.down` — Callus box offline / Callus stopped | `host` R (`minix-01`; any Windows box running Callus); `mode` (`box-off`; `box-off`, `service-stopped`) | `box-off` (a Windows update shut it down): `os ≔ 'OFF'`, `power ≔ 'off'`, every service `running ≔ false`; front LED and status screen dark. `service-stopped`: `services.callus.running ≔ false`, `failure ≔ null` (stopped, not crashed). Revert `box-off`: press the power button (boot 50 s). | `box-off`: every Pi whose `controller.yaml` `callus:` names this box answers `502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}` (§3.3.3 #7) — all its rigs Connection Failed at the same timestamp; card actions `[callus] 10.42.20.1:9000 unreachable` (§3.6 #4); ping 100 % loss; Pis, tablets and cameras healthy. `service-stopped`: `/health` row #8 `… error: Connection refused`; `sc query Callus` → `STATE : 1  STOPPED`; status screen `Callus service · STOPPED`; curl `:9000` refused (§3.14.2) | `os == 'RUNNING' && services.callus.running` | `orca.status.connfailed` `cards.callus` `hw.nuc` `orca.notes` | INC02 (A `minix-01` box-off; B `minix-02`; C service-stopped), M18 step 8 (box-off `minix-01`), FP |
| `nuc.diskFull` — Windows box disk full (corporate agent) | `host` (`nuc-03`; any Windows box) | `diskUsedGb ≔ diskTotalGb`; `files['C:\\ProgramData\\SecAgent\\agent.cfg'] ≔ 'log.rotation=off'` (the agent keeps writing at 0.011 GB/s, §3.14.3). No-op on `nuc-03` at factory (already full). | any writing service on the box answers `500 {"error":"No space left on device"}` (§3.14.3): a Pi whose motion runs there → `/health` 502 row #5; a Callus box → `/health` `502 Bad Gateway {"error":"callus upstream <ip>:9000 error: No space left on device"}`; `Get-PSDrive C` → `C  237.9  0.0` | **API only** (the agent refills the disk; deleting its logs is GW11) | `hw.nuc` | INC19 (pre-existing), FP on a Minix |
| `vm.serviceDown` — VM service stopped | `host` R (`orca-vm`, `jenkins-vm`, `ollama-vm`); `service` R (`mysql`, `orca`, `jenkins`, `ollama`) | `services[service].running ≔ false`, `failure ≔ null`; journal `<ts> <hostname> systemd[1]: Stopped <unit description>.` (§4.3.11). `mysql` also ⇒ `orca.app.dbConnected ≔ false` on the next orca step (§3.14.5). | `systemctl status <service>` → `Active: inactive (dead) since …`; port refused (`curl: (7) Failed to connect to <ip> port <p>: Connection refused`); see the named presets below | `services[service].running` (and for `mysql`: `orca.app.dbConnected`) | `arch.infra` `tools.terminal` | FP |
| `orca.mysqlDown` — Orca's MySQL down | — | as `vm.serviceDown { host: 'orca-vm', service: 'mysql' }` | Orca error page `500 Internal Server Error — Could not open JPA EntityManager…`; every checkout `[orca] checkout request … → 500`; health check aborted (`… JDBCConnectionException: Communications link failure`); `/management/health` 503 (§3.14.5) | `services.mysql.running && orca.app.dbConnected` (reconnect 15 s after MySQL is back) | `arch.stack` `arch.infra` `tools.terminal` `arch.flow` | INC60 |
| `orca.appDown` — Orca application stopped | — | as `vm.serviceDown { host: 'orca-vm', service: 'orca' }` | UI connection refused; checkouts `→ Connection refused`; no health checks (§3.14.5) | `services.orca.running` | `arch.stack` `arch.infra` | FP |
| `jenkins.down` — Jenkins stopped | — | as `vm.serviceDown { host: 'jenkins-vm', service: 'jenkins' }` | Jenkins app unreachable; queue frozen; running builds die `Jenkins is restarting — build interrupted` when it comes back (§3.14.4) | `services.jenkins.running` | `arch.infra` | FP |
| `ollama.down` — Ollama stopped | — | as `vm.serviceDown { host: 'ollama-vm', service: 'ollama' }`; `ollama.up` mirrors it | Ollama app `Model server unreachable`; `curl: (7) Failed to connect to 10.42.1.12 port 11434: Connection refused`; `Java/vision-poc-receipt-check` FAILURE `OLLAMA_DOWN` (§3.21.2); `systemctl status ollama` → `inactive (dead)` | `services.ollama.running` | `vision.ollama` `arch.infra` `tools.terminal` | INC10 |
| `net.switchDown` — lab core switch down | — (target `lab`) | `network.switchUp ≔ false` | every network request times out (§1.9); all rigs Connection Failed at the next check; tablets green (USB); the workstation reaches nothing | **API only** (the switch is IT's, never modelled in 3D) | `arch.infra` | FP |

#### 4.3.2 Power (core)

| Id — title | Params | Mutation | Symptoms (§) | Clears when | Tags | Used by |
|---|---|---|---|---|---|---|
| `fuse.blown` — inline fuse blown | `fuse` R (`F-RACKA-5V`, `F-RACKB-5V`, `F-BENCH-5V`, `F-NUC-12V`) | `blown ≔ true`, `stress ≔ 5.0` | its rail reads 0 V (§3.13.1 #5): every load on the branch unpowered — Rack B: Pis `.15–.18` and camera Pi `.40` completely dark (no PWR); all their rigs `connect timed out` with the same timestamp (§3.3.3 #1); tablets grey; Rack B camera unavailable; multimeter `MW-1.out` 24.1 V DC · `REG-5V-B.out` 5.08 V DC · `F-RACKB-5V.load` 0.00 V DC · fuse removed, Ω `OL` (§2.6); ROSIE returns to Unavailable on recovery (§3.2.1) | `!blown && !removed`, **hold 20 000 ms** (an under-rated replacement blows again within 20 s and does not count, GP SR10) | `power.fuses` `power.rails` `hw.pi` `orca.status.connfailed` | INC03 (A `F-RACKB-5V`, B `F-RACKA-5V`), M03, P1-2 (`'@random'` over the three 5 V fuses), FP |
| `fuse.underRated` — under-rated fuse fitted | `fuse` R; `ratingA` (5; 5, 10, 15, 20) | `ratingA ≔ ratingA` (`labelA` unchanged), `stress ≔ 0`. Over-rated values are accepted (flagged by GP GW04, never blow). | under-rated: blows in ≈ 6 s under the rack's load (§3.13.1 #5), then as `fuse.blown` | `ratingA == labelA && !blown && !removed`, hold 20 000 ms | `power.fuses` | FP, DR13 |
| `power.regulatorOff` — regulator input switched off | `regulator` R (`REG-5V-A`, `REG-5V-B`, `REG-5V-BENCH`, `REG-12V`) | `inputSwitch ≔ false` | as `fuse.blown` for the branch, but `REG-*.out` reads 0.00 V and the fuse Ω reads `0.1 Ω` (de-energised, §3.13.2) | `inputSwitch` | `power.rails` | FP, DR13 |
| `power.outletDead` — wall outlet dead | `outlet` R (`WALL-1` … `WALL-6`) | `outlets[outlet].live ≔ false` | everything downstream unpowered (§3.13.1 #1–#2): `WALL-1` = MW-1 ⇒ every DC rail 0 V (all Pis, NUC-03, every MOTOR) | `outlets[outlet].live \|\| outlets[outlet].plugged == null` (the load was moved to a live outlet) | `power.rails` | FP |

#### 4.3.3 Touch-robot rigs (core)

| Id — title | Params | Mutation | Symptoms (§) | Clears when | Tags | Used by |
|---|---|---|---|---|---|---|
| `rig.lockReleased` — carriage pushed by hand | `rig` R (touch/standalone rig); `dxMm` (25.0); `dyMm` (8.0) | as `rig.dragCarriage(rig, dxMm, dyMm)` with the door opened for the move and closed after: `gantry.xMm/yMm += d` (clamped to travel), `magneticLock ≔ { engaged: false, brokenAtMs: nowMs }`, `homed ≔ false`, `pushAccumMm ≔ 0` | banner **yellow** `Status: LOCK RELEASED — PARK REQUIRED` (§3.7.5 #3); every PHYSICAL_TAP `409 Conflict: LOCK_RELEASED (park required)` (§3.5.2 #8) → runner `[orca] xy_touch wall-e REGISTER_HOME/Register → 409 Conflict: LOCK_RELEASED (park required)`; camera shows the carriage off to one side | `magneticLock.engaged && homed && motionFault == null` (only **Park All**, §3.7.4) | `hw.motion` `hw.tablet` | INC11, M18 step 9 (`seti`), P1-1 (`'@random'` touch rig), DR16 |
| `rig.steppersDisabled` — steppers disabled | `rig` R | `steppersEnabled ≔ false`, `homed ≔ false`, `magneticLock.engaged ≔ false` | `503 Service Unavailable: STEPPERS_DISABLED` (§3.5.2 #8); banner green while disabled (§3.7.5 #3 needs steppers enabled); tablet Steppers group shows **Disable** active; motion buttons toast `Steppers disabled` | `steppersEnabled && homed && magneticLock.engaged` | `hw.motion` `hw.tablet` `hw.rigbom` | INC13-A |
| `rig.motorOff` — MOTOR switch off | `rig` R | `motorSwitch ≔ false` (the solver de-energises `MOTOR-<rig>`; rigs step then releases the lock and clears `homed`, §3.7.7) | `503 Service Unavailable: MOTOR_POWER_LOST`; MOTOR LED off, MAIN on; motion buttons do nothing; banner green until MOTOR returns, then yellow | `motorSwitch && homed && magneticLock.engaged` | `hw.motion` `hw.tablet` `hw.rigbom` | INC13-B |
| `rig.mainOff` — MAIN switch off | `rig` R | `mainSwitch ≔ false` | Pi OFF (dark), webcam dark, tablet grey on battery; timeouts at the next check | `mainSwitch && hosts[piHostId].os == 'RUNNING'` | `hw.pi` `hw.tablet` | FP |
| `rig.solenoidLoose` — solenoid connector loose | `rig` R | `solenoidConnector ≔ 'LOOSE'` | gantry moves, plunger never drops (§3.5.4) — Orca still answers `200 {"result":"OK","mode":"PHYSICAL_TAP",…}`, then the runner times out waiting for the next screen (`[runner] waitForScreen timed out: PaymentScreen`); tablet Solenoid Down makes no clack; connector visibly hanging | `solenoidConnector == 'SEATED'` | `hw.rigbom` `hw.tablet` `orca.xytouch` `arch.flow` | INC15 |
| `rig.dipArmMisaligned` — dip arm one tooth off | `rig` R; `teeth` (1; −3…3, ≠ 0) | `dipArmToothOffset ≔ teeth`, `dipArmAligned ≔ false` | Callus loads fine, then `[device] CHIP_READ_ERROR`, toast `Card read error, try again` (§3.6 #10); camera: the white ribbon card strikes the bezel; tablet Dip → In shows the same miss; arm index mark one tooth off the "63" mark | `dipArmToothOffset == 0` | `hw.collis` `hw.rigbom` `hw.tablet` `cards.diptap` | INC16 |
| `rig.cradleCracked` — cracked 3D-printed cradle | `rig` R; `tiltDeg` (2.0) | `cradle ≔ 'CRACKED'`, `cradleTiltDeg ≔ tiltDeg` | probe contact `dy = x · tan(tilt)` (§3.5.4): left targets hit, right-side targets land progressively low (EVE `Review Order` at x 56 misses) | `cradle != 'CRACKED'` (`rig.replaceCradle`, §3.24) | `hw.print3d` `hw.rigbom` `hw.motion` | INC59 |
| `rig.limitSwitchBroken` — limit switch lead unseated | `rig` R; `axis` (`x`; `x`, `y`) | `limitSwitchOk[axis] ≔ false` | Park All / Park XY drive that axis to −10 mm, stall 4 s, `motionFault = "HOMING FAILED (X limit not found)"`, banner **red** `Status: MOTION FAULT — HOMING FAILED (X limit not found)` (§3.7.1, §3.7.5 #2) | `limitSwitchOk[axis]` (`rig.reseat(rig, 'limitSwitchX'/'limitSwitchY')`) | `hw.motion` `hw.rigbom` | FP (GP INC14 distractor C) |
| `rig.webcamMisaimed` — webcam knocked off aim | `rig` R (rig with its own webcam); `yawDeg` (6.0); `pitchDeg` (4.0) | `webcam.aimOffsetDeg ≔ { yaw, pitch }`, `aimedOk ≔ false` | the frame model shifts labels by `+6.67 px/°` yaw and `+6.25 px/°` pitch (6°/4° = +40/+25 px, §3.12.1 #4) → Screen Compare crops clip | `aimedOk` (both offsets within ±1.5°, `rig.aimWebcam`) | `vision.camera` `orca.screencompare` | FP |
| `rig.motionOnNuc` — motion control moved to a Windows box | `rig` R (`bumblebee`); `host` (`nuc-03`) | `motionHost ≔ host`; the rig Pi's `usb` −`motor-pcb:<rig>`, `hosts[host].usb` +`motor-pcb:<rig>`; the Pi's `/etc/robot-controller/controller.yaml` line `motion: local` ≔ `motion: nuc://10.42.20.3:9100` and robot-controller restarted with it; `hosts[host].services.motion`: `enabled ≔ true`, `running ≔ true` (port 9100) | with NUC-03 full (§3.14.3): `/health` → `502 Bad Gateway {"error":"motion upstream 10.42.20.3:9100 error: No space left on device"}` (§3.3.3 #5) → Connection Failed; xy_touch `502 Bad Gateway: motion upstream 10.42.20.3:9100 error: No space left on device` (§3.5.2 #8); a USB cable labelled `BUMBLEBEE MOTION` runs from the NUC to the motor PCB | `motionHost == 'PI'` && `controller.yaml` says `motion: local` && robot-controller (re)started after that file's last write | `hw.nuc` `hw.pi` `orca.status.connfailed` `orca.status.offline` | INC19 |
| `rig.rebuild` — rig under rebuild (Jared) | `rig` R (default `baymax`) | `assembly ≔ 'rebuild'`, `door ≔ 'open'`; Pi lead unplugged (as `pi.off`); Robot Device `adbTcpPort ≔ null` (reflashed on the bench); while `assembly == 'rebuild'` the rigs step keeps `motionFault = 'GANTRY INCOMPLETE (rebuild in progress)'` (Park All cannot clear it) | if the rig is not Offline: next check `connect timed out` → Connection Failed; a build that grabbed it before that check: `adb: failed to connect to '10.42.30.16:5444': Connection refused`; finishing the Pi wiring boots the Pi but taps get `409 Conflict: MOTION_FAULT (GANTRY INCOMPLETE (rebuild in progress))`; tablet red after boot | **API only** (Jared finishes the rebuild; revert restores `assembly`, door, lead, ADB) | `orca.status.offline` `hw.rigbom` | INC07, INC05-B |

#### 4.3.4 LabSim devices and tethering (core)

| Id — title | Params | Mutation | Symptoms (§) | Clears when | Tags | Used by |
|---|---|---|---|---|---|---|
| `device.unpowered` — device brick unplugged | `device` R; `battery` (0) | its PSU load `supply ≔ none` (the brick lies on the rig shelf); `power ≔ 'off'`; handhelds `battery.pct ≔ battery` | device dark; Orca stays Available (`/health` does not cover the device, §3.3.3); builds `adb: failed to connect to '10.42.30.12:5444': No route to host` (§3.15.1) | `power == 'on'` | `power.18v` `power.rails` `hw.devices` | INC17 (with `power.plug` desk fan, Appendix A), P1-2 (spare device) |
| `device.dead` — hardware failure | `device` R | `dead ≔ true`, `power ≔ 'off'` (never finishes boot, never joins the network) | `adb … No route to host`; the rig stays Available (its Pi is fine) | **API only**, or when no rig's `deviceIds` contains it (swapped out / RMA'd) | `hw.devices` | INC44 (`dev-k-9-duo2`) |
| `device.adbTcpReset` — ADB-over-TCP not re-enabled | `device` R | `adbTcpPort ≔ null` | `adb connect 10.42.30.31:5444` / runner → `failed to connect to '10.42.30.31:5444': Connection refused` (§3.15.1) — refused, not timeout; Orca Available; USB ADB from the Pi still lists the serial | `adbTcpPort == 5444` | `adb.port` `adb.usage` `laz.oobe` `hw.pi` | INC28 |
| `device.printerNoPaper` — printer out of paper | `device` R (type with a printer) | `printer.paper ≔ false` | `Print` → toast `Printer out of paper`, no payload → `select print` timeout (§3.9.3) | `printer.paper` (`device.loadPaper`) | `hw.devices` | FP |
| `laz.skipAdbRestore` — Laz forgets to restore ADB-over-TCP | `device` R (`dev-data-mini3`) | while ACTIVE, the next Laz run on the device gets `skipAdbRestore ≔ true` and skips `restore-adb` silently (no console line, §3.17.2) | after that run `adbTcpPort = null`: as `device.adbTcpReset`; the previous build's console still ends `laz: merchant active` | `adbTcpPort == 5444` and a Laz run on the device has finished since injection | `laz.oobe` `adb.port` `adb.usage` | INC28 (real-run variant) |
| `receipt.qrRollout` — "Scan for receipt" firmware reaches devices | `devices` (list of runtime ids) **or** `deviceTypes` (list); `on` (true) | `firmwareInfo.receiptQr ≔ on`, `firmwareInfo.version`/`firmware ≔ '2.26.10.1'` (`'2.26.08.3'` when off) on every matching non-FLEX_1 device; devices on `receipt-options` re-render (`display.rev++`). Orca rows unchanged (§3.10). No-op on devices already in that state. | receipt screens show 5 options (merchant with QR receipts) with every button 3.0 mm lower (§3.10); a missing / stale `_5` map then 404s or misses | **API only** (firmware does not roll back) | `receipt.qr` `receipt.maps` | M09 (EVE only, after `flag.set receiptQrFeature=false`), P2-3, GP "Firmware rollout" event |
| `tether.linkDown` — pay-display link cable unseated | `robot` R (tethered rig, default `optimus`); `cable` (`auto`; `auto`, `usb`, `ethernet`) | `usb`: MFD device `hubUsbToPeer ≔ false`; `ethernet`: CFD device `hubEthernet ≔ false`; `auto` = `usb` for `USB_PAY_DISPLAY` rigs, `ethernet` for `SECURE_NETWORK_PAY_DISPLAY` rigs | `payDisplayLink = 'DOWN'` (§3.8.6): CFD `Waiting for merchant device…`; MFD Charge `Connecting to customer display…` then back to review-order after 30 s; TaxTest `[CFD_O1] waitForScreen timed out (CustomerOrderScreen)` → `WAIT_TIMEOUT` | `payDisplayLink == 'UP'` | `semi.paydisplay` `orca.tethered` `uia.taxtest` | INC47 (A `megatron`/usb, B `optimus`/ethernet) |

#### 4.3.5 Collis / SmartStripe probes and Callus files (core)

| Id — title | Params | Mutation | Symptoms (§) | Clears when | Tags | Used by |
|---|---|---|---|---|---|---|
| `collis.unpowered` — probe unpowered | `probe` R (`collis-wall-e`) | Collis: its PSU load `supply ≔ none`. SmartStripe: `hosts[<shelf pi>].usb` −`smartstripe:<rig>`. | LED off; Callus `/status` `{"id":"collis-wall-e","state":"OFFLINE"}`; card actions `[callus] probe collis-wall-e: PROBE_OFFLINE` (§3.16) | `powered && ribbonConnected && state == 'OK'` | `hw.collis` `power.18v` `cards.callus` | INC18-A |
| `collis.ribbonUnseated` — rear ribbon unseated | `probe` R | `ribbonConnected ≔ false` | LED amber; `/status` `NO_LINK`; `PROBE_NO_LINK` (§3.16) | same as above | `hw.collis` `cards.callus` | INC18-B |
| `callus.syncStale` — box missed GortCardSync | `host` R (`minix-02`); `commit` (`9f02a1b`) | `callus.localCardFiles[host] ≔ { syncedCommit: commit, syncedAtMs: -50_380_000, files: <every cards/** path of gort at commit> }`; `hosts[host].schedTasks.GortCardSync.lastRunMs ≔ -50_400_000` (yesterday 10:00 — it was off for Riley's 15:20 manual run, §2.9); `hosts[host].files` mirror updated | dip/tap of a newer card: `[callus] map cards/nfc/interac_ca_tap.json → C:\gort\cards\nfc\interac_ca_tap.json · FileNotFoundException (The system cannot find the path specified)` (§3.6 #6); `schtasks /query /tn GortCardSync` → next run `10/06/2026 10:00:00` (or today 10:00 if before it) `Ready`; `dir C:\gort\cards\nfc` lacks the file | `localCardFiles[host].files ⊇ every cards/** file on gort main` | `cards.callus` `cards.diptap` `tools.terminal` | INC54 |

#### 4.3.6 Merchants, cards, Ubi (core; edit-style)

| Id — title | Params | Mutation | Symptoms (§) | Clears when | Tags | Used by |
|---|---|---|---|---|---|---|
| `merchant.credentialBlank` — Go SDK credential blank | `merchant` (`GO-SDK-US-01`); `field` (`apiKey`; `appId`, `appSecret`, `apiKey`); `by` (`tate`) | Merchant Config edit: `<field> ≔ null` | env `[env] APP_ID=app_sim_7f3a APP_SECRET=**** API_KEY=` (§3.18.4) then `panic: Terminal SDK: missing credential API_KEY (env var empty)` → `MISSING_CREDENTIAL` (§3.21.1); Edit dialog shows the field blank (table shows no App columns) | `<field>` equals its factory value (§2.8) | `go.sdk` `orca.merchant` `jenkins.envvars` | INC51 (A apiKey; variants appSecret, appId), M08 |
| `merchant.ubiRouteWrong` — wrong Ubi route | `merchant` (`WESTERS-CA-02`); `route` (`us-east`); `by` (`alex`) | `ubiRoute ≔ route` | Laz `ubi: routing merchant switch → WESTERS-CA-02` · `ubi: ERROR route us-east cannot resolve merchant WESTERS-CA-02` → FAILURE, Laz never de-provisions (§3.17.2) | `ubiRoute` equals factory | `laz.oobe` `ubi.routing` `orca.merchant` | INC50 |
| `merchant.overwritten` — specialised rig's merchant overwritten | `robot` R (`rosie`); `merchant` (`AUTO-US-NOPIN-01`) | the robot's device(s) end in the state a completed Laz swap leaves (§3.17.2): `merchantConfigId ≔ merchant`, `provisioned ≔ true`, the new merchant's apps replace the old merchant's (§2.8 `apps`), launcher page 0, display `home`; `adbTcpPort` restored to 5444 (Laz restores it). Orca's `robot.merchantConfigId` unchanged. | PL8 `[paycore] merchant mismatch: expected PAYCORE-STANDALONE-01, got AUTO-US-NOPIN-01` → `MERCHANT_MISMATCH` (§3.17.1); camera shows the generic Register app | device merchant == `robot.merchantConfigId` | `orca.status.unavailable` `laz.oobe` `orca.merchant` | INC40 (with `orca.statusOverride`) |
| `ubi.routeDown` — Ubi route outage | `route` R (`ca-central`) | `ubi.routes[route].up ≔ false` | `ubi: ERROR route ca-central unavailable (503)` (§3.17.3) | **API only** (platform outage) | `ubi.routing` | FP |
| `card.gortPathWrong` — card profile points at an old path | `profile` (`VISA_STD_DIP`); `path` (`cards/visa/visa_std_dip.json`); `by` (`riley`) | Card Profile edit: `gortPath ≔ path` | `[callus] map cards/visa/visa_std_dip.json → C:\gort\cards\visa\visa_std_dip.json · FileNotFoundException (The system cannot find the path specified)` (§3.6 #6) | `gortPath` names a file present on gort `main` whose `"profile"` equals the profile's name | `cards.diptap` `cards.callus` `tools.github` `arch.repos` | INC53 |
| `card.trackDataCorrupt` — swipe Track Data corrupted | `profile` (`VISA_STD_SWIPE`); `trackData` (`%B4111111111111111^SIM/VISA^301210`); `by` (`riley`) | Card Profile edit: `trackData ≔ trackData` | Callus swipe OK, then `[device] SWIPE_ERROR: invalid track data` (§3.6 validation); probe LED green | `trackData` passes the §3.6 validation with the profile's `pan` | `cards.swipe` `cards.philosophy` | INC55 |

#### 4.3.7 Orca data (core; edit-style)

| Id — title | Params | Mutation | Symptoms (§) | Clears when | Tags | Used by |
|---|---|---|---|---|---|---|
| `orca.offsets` — legacy offsets left on a robot | `robot` R (`bumblebee`); `xMm` (0.0); `yMm` (1.5); `by` (`bulk-import`) | robot edit: `offsetXMm/offsetYMm ≔` (CONFIG notes `offsets.x`/`offsets.y`) | every PHYSICAL_TAP lands at location + offsets (§3.5.2 #5): with Y 1.5 MINI_3 icons still hit, `PAYMENT/Charge` (core 1.2) misses; console `[orca] xy_touch bumblebee PAYMENT/Charge → PHYSICAL_TAP (31.0, 90.5) (offsets +0.0/+1.5)` (the runner appends the offsets whenever they are non-zero, §3.19.3) | `offsetXMm == 0 && offsetYMm == 0` | `orca.offsets` `orca.screens` `hw.motion` | INC14, M07 |
| `orca.hrnTypo` — Human Readable Name typo | `robot` R (`johnny-5`); `hrn` (`JONNY-5`); `by` (`alex`) | robot edit: `humanReadableName ≔ hrn` | tablet header `JONNY-5` (≤ 2 s after save when reachable, §3.7.5) | `humanReadableName` equals the factory HRN | `orca.names` `hw.tablet` | INC63, M07, P2-2 |
| `orca.urlWrong` — URL mapping wrong / blank | `robot` R; `field` (`tap`; `adb`, `camera`, `dip`, `tap`, `swipe`); `value` (`''`); `by` (`alex`) | robot edit: the URL field `≔ value` (CONFIG note `urls.<field> changed (<by>)`) | `tap ''`: `[orca] 400 Bad Request: robot johnny-5 has no Tap URL` (§3.6 #3); `camera` = another rig's URL: OCR reads that rig's screen (§3.12.2 last row), Camera app shows the wrong rig; `adb` wrong host: health check pings the wrong Pi (§3.3.2) | field equals factory value | `orca.urls` `cards.diptap` `vision.camera` | INC65 (`johnny-5` tap ''), INC09 (`r2-d2` camera `http://10.42.10.11:8081/stream.mjpg`), M07 |
| `orca.tetherCleared` — MFD/CFD relations cleared | `robot` R (`optimus`); `by` (`alex`) | robot edit: `mfdDeviceId ≔ null`, `cfdDeviceId ≔ null` | `[env] RUN_TYPE=standalone`, `[runner] MFD relation empty → standalone`, `AssertionError: TaxTest requires a tethered rig (MFD/CFD)` → `TETHER_REQUIRED` (§3.19.2); capability `tethered:false` so PL2 can no longer match it | both equal factory | `orca.tethered` `uia.multidevice` | INC45, M07 |
| `orca.tetherCloned` — relations copied from another rig | `robot` R (`tars`); `from` (`optimus`); `by` (`alex`) | robot edit: `mfdDeviceId/cfdDeviceId ≔ from`'s | `[runner] Tethered rig detected (MFD populated) → MFD 10.42.30.23:5444, CFD 10.42.30.24:5444` (§3.19.2); the other rig's devices move during the job (cross-talk) | both equal factory (null for standalone rigs) | `orca.tethered` | INC46 |
| `orca.screenLocationShift` — stale coordinates for a screen | `deviceTypes` R (list, default `FLEX_3,MINI_3,STATION_2018`); `screen` (`RECEIPT_OPTIONS_5`); `dxMm` (0.0); `dyMm` (−3.0); `by` (`bulk-import`) | every ScreenLocation of `(type, screen)` += `(dx, dy)` (audit `UPDATE screenLocation (bulk-import)`) | PHYSICAL_TAPs miss every row (error 3.0 > core 1.0, §3.5.4); Pigeon `LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s` → `FAILED at "select print"` (§3.20.3); camera: plunger ~3 mm above Print | every location of those rows within ±0.5 mm of firmware truth (§2.10.2) | `receipt.qr` `receipt.maps` `orca.screens` `jenkins.logs` | INC20, P3-2 (`'@random'` type) |
| `orca.screenLocationTypo` — one wrong coordinate | `deviceType` (`FLEX_1`); `screen` (`RECEIPT_OPTIONS_4`); `button` (`Print`); `xMm` (unchanged); `yMm` (62.5); `by` (`bulk-import`) | that location's `xMm/yMm ≔` (audit row shows `bulk-import`, `atMs` default yesterday 16:10 = −28_200_000) | probe lands in the gap above Print → `select print` timeout (§3.20.3), printer fine | within ±0.5 mm of truth | `jenkins.logs` `pigeon.lstr` `orca.screens` | INC22 |
| `orca.missingReceiptMap` — receipt map missing | `deviceType` R (`STATION_2018`); `screen` (`RECEIPT_OPTIONS_5`); `by` (`bulk-import`) | delete the `OrcaScreen (type, screen)` row and its locations (audit `DELETE`) | `[orca] 404 Not Found: no Screen Location for (STATION_2018, RECEIPT_OPTIONS_5, "Email")` (§3.5.2 #4) → `FAILED at "select email"`; Orca Screens lists only `_4` for the type | a row `(type, screen)` exists and every firmware button of that screen has a location within ±0.5 mm | `receipt.maps` `orca.screens` `orca.devicetype` | INC21, M09 (`FLEX_4`), P2-3 |
| `orca.statusOverride` — someone changed a status | `robot` R; `status` R; `by` (`alex`) | `setRobotStatus(robot, status, by)` (STATUS note `STATUS <From> → <To> (alex)`) | depends on the rig: a PayCore rig set Available is taken by general pipelines (§3.4.2) and swapped by Laz (§3.17.1); a rig under rebuild set Available goes Connection Failed at the next check | status equals the `before` recorded in `undo` | `orca.status` `orca.status.unavailable` `orca.status.offline` | INC07 (`baymax` AVAILABLE after a setup OFFLINE), INC40 (`rosie` AVAILABLE) |
| `orca.staleReservation` — forgotten reservation | `robot` R (`eve`); `by` (`riley`); `atMs` (−22_680_000 = 2026-10-04 17:42) | status ≔ RESERVED via the status code path at `atMs` (`reservedBy`, `reservedAtMs`, STATUS note) | `[orca] candidate eve: Reserved — skipped` · `[orca] no Available FLEX_4 robot — build waiting in queue` (§3.4.2 #6); health log `eve  RESERVED — not overridden` | `status != 'RESERVED'` | `orca.status.reserved` `jenkins.checkout` | INC48 |
| `ocr.labelShift` — CFD label moved by an app update | `device` R (`dev-r2-d2-duo`); `px` (10) | `labelShiftPx ≔ px` | `[ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAI $10.B3" → match=false` (§3.12.2); Orca Test panel shows the crop clipping the glyph bottoms | every Screen Compare row of the device's robot reads `match=true` on the canonical cart frame (Tax Item 5 → `CFD_CART`, `TOTAL $10.83`; pure evaluation of §3.12 on that hypothetical frame) | `orca.screencompare` `vision.tesseract` `pigeon.gimp` | INC36, P3-3 |
| `ocr.capitalisation` — CFD copy changed case | `device` R (`dev-r2-d2-duo`) | `cfdLayout ≔ 'v2'` | `… tesseract → "Total $10.83" → match=false` | same as `ocr.labelShift` | `orca.screencompare` `vision.tesseract` | INC37-A |
| `ocr.typo` — expected text typo | `compare` R (`CFD_TOTAL`); `expected` (`TOTAL $10.38`); `by` (`alex`) | Screen Compare edit: `expectedText ≔ expected` (row history shows the edit) | `… tesseract → "TOTAL $10.83" → match=false` | same as `ocr.labelShift` | `orca.screencompare` `vision.tesseract` | INC37-B |

#### 4.3.8 Repositories (devops; commit-style)

Each row is applied as a commit on the repo's default branch by `by` with `message` (§4.1.8); the
commit's `changes` hold the new file text. Predicates read the file on `main` (remote), so a fix must be
pushed / merged (a local edit alone does not clear the fault).

| Id — title | Params | Mutation | Symptoms (§) | Clears when | Tags | Used by |
|---|---|---|---|---|---|---|
| `gort.capabilityDropped` — test definition lost a capability | `path` (`go-sdk/tests/sale_receipt.json`); `key` (`printer`); `by` (`alex`); `message` (`go-sdk: tidy sale_receipt capabilities`) | commit removing `"<key>": true` from the file's `"capabilities"` object (JSON stays valid) | the dynamic lookup `{"goSdk": true}` matches `vision`, `tars`, `data`; LRU picks never-used VISION (§3.4.2 #6) → `[orca] checkout → vision (FLEX_POCKET) OK` … `[go-sdk] PrintReceipt → PRINTER_NOT_AVAILABLE` → `Finished: FAILURE` (§3.21.1); Match preview lists `vision` (§3.4.3); GitHub diff shows the removed line | the file on `main` parses and `capabilities[key] === true` | `orca.capabilities` `hw.devices` `go.sdk` | INC23, M08 |
| `pigeon.missingComma` — missing comma in a Pigeon test | `path` R (`tests/sale/tip_sale_print.json`); `line` (8); `by` (`alex`); `message` (`Add tip step`) | commit deleting the last `,` on line `line` (precondition: that line ends with `,`) | `LSTR ParseError: Unexpected token { in JSON at line 9 column 5` → `Finished: FAILURE` `JSON_PARSE` (§3.20.1); the IDE shows no inspection for the Pigeon project; `git log -1 --stat` names the commit | the file on `main` parses (strict JSON) and its `actions[].action` list equals the list before the fault | `pigeon.json` `pigeon.nolint` `tools.github` `pigeon.abstraction` `arch.repos` | INC25, M15 (`line` 22 of fixture `m15-expanded` → `Unexpected string in JSON at line 23 column 7`) |
| `pigeon.missingBracket` — missing closing brace | `path` R; `line` R; `by` (`alex`); `message` (`Tidy actions`) | commit deleting the last `}` on line `line` | the §3.20.1 message for the token after the gap (fixture-specific; e.g. `swipe_sale_print.json` line 9 → `Unexpected token { in JSON at line 10 column 5`) | as `pigeon.missingComma` | `pigeon.json` `pigeon.nolint` | P3-2, FP |
| `pigeon.screenCompareEmpty` — screen-compare region undefined | `path` (`tests/sale/payment_success_compare.json`); `by` (`morgan`); `message` (`Scaffold payment success compare`) | commit setting the `screenCompare` action's `x`, `y`, `w`, `h` to `0` | `LSTR screenCompare: empty region (0x0)` → FAILURE (§3.20.3) | each of `x`, `y`, `w`, `h` within ±3 px of the APPROVED label on the target device's screencap (FLEX_GEN3: 208, 512, 304, 40, §2.10.2) | `pigeon.gimp` `pigeon.json` `adb.usage` | INC24 |
| `uia.waitForScreenStub` — empty `waitForScreen()` | `class` (`RegisterHomeScreen`); `by` (`alex`); `message` (`RegisterHomeScreen cleanup`) | commit replacing the class with GP INC32's file (body `// TODO`; `reviewOrder()` clicks without waiting) | render race at +700 ms (§3.19.5, CF03): ≈ 55 % of runs fail `androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT=Review Order]` at `com.labsim.uia.pageobjects.RegisterHomeScreen.reviewOrder(RegisterHomeScreen.java:21)` | CF01 holds for the class and CF03 does not (§3.19.6) | `uia.sync` `uia.pom` `tools.intellij` | INC32 |
| `uia.scrollSwapped` — `open()` scrolls the wrong way | `mode` (`swapped`; `swapped`, `horizontal-only`); `by` (`alex`); `message` (`HomeScreen: simplify open()`) | commit editing `HomeScreen.open()`: `swapped` exchanges the two branch bodies; `horizontal-only` calls `scrollHorizontallyTo` in both | on Flex/Compact rigs `[HomeScreen] open("Register"): scrolling horizontally (Mini/Station)…` ×5 → `AssertionError: App 'Register' not found on HomeScreen` (§3.19.6); `swapped` also fails Mini/Station (vertical) | CF05 = correct | `uia.scroll` `uia.pom` | M13, P3-4 |
| `uia.missingScreenMethods` — page object without mandatory methods | `class` (`ReceiptScreen`); `methods` (`both`; `both`, `waitForScreen`, `isScreenPresent`); `by` (`alex`) | commit removing the method(s) and their calls (the class still compiles) | CF03 race on that screen (flaky `UiObjectNotFoundException`); Morgan's review comment `Missing mandatory isScreenPresent()` on any PR touching it | CF01 and CF04 hold for the class | `uia.sync` `uia.pom` | M13 step 9, P3-4 |
| `uia.teardownMissing` — test without teardown | `test` (`TaxTest`); `by` (`alex`); `message` (`TaxTest: remove unused hook`) | commit deleting the `@After` method (the header comment still promises one) | after a TaxTest the MFD stays on `register` with the paid order; the next test on that rig fails `AssertionError: HomeScreen.isScreenPresent() == false — current screen: RegisterOrderScreen` (§3.19.2) | CF06 holds for the test | `uia.taxtest` `uia.sync` `adb.usage` | INC35 |

#### 4.3.9 Workstation configuration (devops)

Targets the player's local clone (`~/IdeaProjects/uia-remote/config.properties`) unless `path` names
another local file (INC29's Code With Me session, `~/CodeWithMe/alex/uia-remote/config.properties`
[illus.]). Precondition: the file exists (`repo.clone` + `config.write` first).

| Id — title | Params | Mutation | Symptoms (§) | Clears when | Tags | Used by |
|---|---|---|---|---|---|---|
| `config.port5555` — ADB default port in config | `path` (local clone) | `portNumber=5555`; workstation ADB server running and `adbConnections` gains `10.42.60.4:5555` (`coworker: true`) if absent | local run: `connect 10.42.30.13:5555 … refused` · `falling back to first known device: 10.42.60.4:5555` · `[runner] open Register` and Riley's desk Flex opens Register and adds Tax Item 5 (§3.15.3); `adb devices` → `10.42.60.4:5555	device`; `adb.coworkerDriven` events | `portNumber == '5444'` and no `workstation.adbConnections` entry ends with `:5555` | `adb.port` `uia.config` `adb.usage` | INC27 (with `runner.startLocal`), P3-1 |
| `config.value` — one wrong config value | `key` R; `value` R; `path` (local clone) | `<key>=<value>` | per §3.19.1–§3.19.2: e.g. `customerFacingDeviceIp=10.42.30.19` on R2-D2 → `[runner] CFD handle 10.42.30.19:5444 → No route to host`; `deviceType=Mini` on TARS → horizontal scroll, `App 'Register' not found` | the key equals the validator target for the file's `robotName` (§4.4.4 `target`) | `uia.config` `orca.tethered` `uia.scroll` | INC30 (`customerFacingDeviceIp` `10.42.30.19`), INC33 (`deviceType` `Mini`) |
| `config.themeKernel` — stale wiki values | `path` (`~/CodeWithMe/alex/uia-remote/config.properties`) | `theme=classic`, `kernelType=SPA` | `java.lang.IllegalStateException: Unsupported theme "classic" — only "avocado" is supported`, then after fixing it `Unsupported kernelType "SPA" — use "CPA"` (§3.19.1) | `theme == 'avocado' && kernelType == 'CPA'` | `uia.config` | INC29 |

#### 4.3.10 Jenkins (devops; job-config style)

| Id — title | Params | Mutation | Symptoms (§) | Clears when | Tags | Used by |
|---|---|---|---|---|---|---|
| `jenkins.envCase` — enum value not ALL CAPS | `job` (`Java/uia-remote-regression-flex`); `param` (`DEVICE_TYPE`); `value` (`flex_3`); `by` (`riley`) | `savedParams[param] ≔ value` | `[orca] checkout request deviceType=flex_3` · `java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.flex_3` · `Finished: FAILURE` (`ENUM_CASE`, §3.4.2 #3); Orca shows WALL-E/EVE Available | `savedParams[param]` is exactly one of the 14 `DeviceType` constants | `jenkins.envvars` `orca.devicetype` | INC39 (`flex_3`; variants `Flex_3`, `flex_4`, `FLEX3`; PL4 `mini_3`), M11, M18 step 10 (`Java/uia-remote-regression-mini`, `mini_3`) |
| `jenkins.jobMoved` — job filed in the wrong folder | `job` (`Java/pigeon-windows-tender`); `toFolder` (`iOS`); `by` (`alex`) | `jenkins.moveJob(job, toFolder)` (history and numbers kept, id changes) | `Java` view lacks it; the nightly trigger skips it (§3.18.1); search finds `iOS/pigeon-windows-tender` | `jobs['Java/<name>'].exists` and no existing `iOS/<name>` | `jenkins.folders` `pigeon.lstr` `go.sdk` | INC26 |
| `jenkins.capsConflict` — pipeline capability contradicts the test | `job` (`Java/contact-canada-pin-sale`); `key` (`deviceType`); `value` (`MINI_3`); `by` (`alex`) | edit the script's `def capabilities = [...]` entry `key` to `'<value>'` | `[orca] 409 Conflict: capability conflict (pipeline deviceType=MINI_3, test deviceType=COMPACT)` → `CAPABILITY_CONFLICT` (§3.4.2 #4) | the script map merged with the job's dynamic file has no conflicting key | `orca.capabilities` `hw.devices` `jenkins.envvars` | INC49 |
| `jenkins.namedRobot` — job pinned to the wrong robot | `job` (`Java/contact-canada-pin-sale`); `robot` (`tars`); `by` (`alex`) | `savedParams.ROBOT_NAME ≔ robot` | `Checked out robot tars (named)` · `PIN entry requires physical touch` → `PIN_NEEDS_PHYSICAL` (§3.18.3 #4); a touch rig of another type → `capability mismatch: deviceType COMPACT required` | saved `ROBOT_NAME` is `''` or names a robot whose capability document satisfies the job's merged requirements (no `Verify robot` failure) | `bots.pin` `bots.types` `orca.capabilities` | INC52, P2-4 |
| `rig.testRunning` — a test holds the rig | `rig` R (`wall-e`); `job` (`Java/uia-remote-regression-flex`); `number` (job's next); `durationMs` (`null` = until cleared); `by` (`jenkins`) | queue a real named build (`ROBOT_NAME=<rig>`, `nextBuildNumber[job] ≔ number` if given) whose Run-tests stage loops the job's test plan until `durationMs` (physical) has elapsed or the fault is cleared; then Release robot → `Finished: SUCCESS`. Custom revert: request stop (the loop ends after its current step). | tablet overlay `TEST IN PROGRESS — CONTROLS LOCKED` (§3.7.6); Orca `Available · in use by Jenkins #4127`; camera shows normal taps | the build is finished | `hw.lockout` `hw.tablet` | M01 (`number` 4120), INC12 (`number` 4127, `durationMs` ≥ 30 000), DR16 |

#### 4.3.11 Exact service log lines written by faults

Timestamps are the injection time, journal short format `Oct 05 08:11:42`; `<h>` = `hostname`; PIDs
are fixed per service [illus.]: robot-controller 812, camera-stream 640, adb-service 701, cardprog 903.
Every crash also appends the two systemd lines
`Oct 05 08:11:42 <h> systemd[1]: <svc>.service: Main process exited, code=exited, status=1/FAILURE` and
`Oct 05 08:11:42 <h> systemd[1]: <svc>.service: Failed with result 'exit-code'.`

| Fault | Service | Cause line (before the systemd lines) |
|---|---|---|
| `pi.serviceDown` | `robot-controller` | `Oct 05 08:11:42 <h> python3[812]: robot_controller: fatal: watchdog timeout in motion loop` |
| `pi.serviceDown` | `camera-stream` | `Oct 05 08:11:42 <h> camera-stream[640]: VIDIOC_DQBUF: No such device` |
| `pi.serviceDown` | `adb-service` | `Oct 05 08:11:42 <h> adb-service[701]: adb server version (41) doesn't match this client (39); killing...` |
| `pi.serviceDown` | `cardprog` | `Oct 05 08:11:42 <h> cardprog[903]: CardProgrammer.exe: unhandled exception c0000005 (access violation)` |
| `camera.usbUnplugged` | `camera-stream` | `Oct 05 08:11:42 <h> camera-stream[640]: Cannot open '/dev/video0': No such file or directory` |
| `pi.wineBroken` | `cardprog` | `Oct 05 08:11:42 <h> cardprog[903]: wine: could not load kernel32.dll, status c0000135` |
| `vm.serviceDown` | `mysql` / `orca` / `jenkins` / `ollama` | single line `Oct 05 08:40:02 <h> systemd[1]: Stopped MySQL Community Server.` / `Stopped Orca (Spring Boot).` / `Stopped Jenkins Continuous Integration Server.` / `Stopped Ollama Service.` (no systemd failure lines — a stop is not a crash; `systemctl status` → `Active: inactive (dead) since Mon 2026-10-05 08:40:02 EDT; 1min 3s ago`) |

### 4.4 Setup operations, presets' scenarios and fixtures

A **setup op** (`SetupOp = { op, params }`) prepares a world state that is not itself a fault (a
reservation, a staged screen, a cloned repo, a historical build). Setup ops have no clear predicate and
no `ActiveFault` record; they go through the same code paths as the corresponding API calls (and so
write the same Notes/audit/commits), are allowed in `faults.injectAll` scenarios and presets, and emit
`setup.applied`. `faults.setupCatalogue()` lists them (`SetupOpInfo = { op, description, params, owner,
presetOnly }`).

#### 4.4.1 Setup-op catalogue

| Op | Params | Effect | Owner |
|---|---|---|---|
| `flag.set` | `flag` R, `value` R | `sim.setFlag(flag, value)` including its rollout effects (§3.10; `cfdLayoutV2Toggle` sets R2-D2's `cfdLayout`/`labelShiftPx`, §2.10.2) | core |
| `config.patch` | `key` R, `value` R | `sim.setConfig({ [key]: value })` | core |
| `orca.setStatus` | `robot` R, `status` R, `by` (`jared`), `atMs` (now) | the §3.2.1 manual transition at `atMs` (STATUS note, reservation fields). `CONNECTION_FAILED` is rejected (use a fault + a health check). | core |
| `orca.createDevice` | `name` R, `deviceType` R, `serial` R, `ip` R, `label` (`''`), `by` (`jared`) | `orca.saveDevice` (binds `simDeviceId` by serial, §1.15) | core |
| `orca.linkDevice` | `robot` R, `field` (`deviceId`; `deviceId`, `mfdDeviceId`, `cfdDeviceId`), `device` R (row name or `''`), `by` | `orca.saveRobot` with that relation (CONFIG note) | core |
| `orca.deleteEntity` | `entity` R, `name` R (`CFD_TOTAL`; screens as `TYPE/SCREEN`), `by` | `orca.deleteEntity` (audit DELETE) | core |
| `orca.syncFromGort` | — | upsert every `config/screen-locations/**` file on gort `main` into Orca now (§3.22.3 without the 10 s delay) | core |
| `device.stage` | `device` R, `stage` R (`home`, `register-order`, `review-order`, `payment-prompt`, `approved`, `receipt-options`, `receipt-done`, `thank-you`), `items` (`Tax Item 5`) | drives the device through §3.9 with the normal inputs (unlock, Register, items, Review Order, Pay, Charge, …) with render and auto-advance timers completed instantly [sim]; tethered pairs and Duo CFDs follow (§3.9.4–§3.9.5). `receipt-done` exists only on a Duo CFD; `approved` is held (no 2 s auto-advance) until the next input [sim] so a screencap can be taken (INC24). | core |
| `device.swap` | `rig` R, `deviceId` R (a stored device), `storeAt` (`storage-shelf`) | `device.swapHardware` path: old device → storage (`rigId ≔ storeAt`, unplugged), new device seated, hub connected, PSU on the rig's strip socket, boots 30 s; Orca untouched | core |
| `device.provision` | `device` R, `merchant` R, `resetAdb` (false) | the end state of a completed Laz swap (§3.17.2) without running it; `resetAdb` leaves `adbTcpPort = null` | core |
| `power.plug` | `load` R, `kind` R, `target` R, `socket` | `power.plug` (may plug non-lab loads, e.g. the desk fan) | core |
| `power.addLoad` | `id` R, `label` R, `expects` R, `drawA` (0.5), `deviceId` | create an unplugged free-standing load (a spare brick / PSU on the bench) | core |
| `ws.adbKnows` | `target` R (`10.42.60.4:5555`) | workstation ADB server running; append `{ target, state: 'device', coworker }` to `adbConnections` if the target is reachable on that port (§2.14) | core |
| `chat.post` | `channel` R, `author` R, `text` R, `delayMs` (0) | `chat.post` / `chat.schedule` | core |
| `ollama.seedReceipt` | `imageRef` R, `deviceId` R, `subtotalCents` R, `taxCents` (0), `tipPct` R, `printedTipCents` R, `misreadField`, `misreadAs` | add a `ReceiptScenario` (§1.14, §3.21.2) and a workstation file `~/Downloads/<name>.jpg` pointing at it | devops |
| `repo.clone` | `repo` R | `git.clone(repo)` at `main` head | devops |
| `repo.commitFixture` | `repo` R, `path` R, `fixture` R, `by` R, `message` R, `branch` (`main`) | commit fixture text (§4.4.4) at `path` | devops |
| `repo.deleteFile` | `repo` R, `path` R, `by` R, `message` R | commit deleting `path` | devops |
| `github.seedPr` | `repo` R, `number` R, `fixture` R, `author` R, `title` R, `state` (`open`) | branch `<author>/<slug>` with the fixture's file changes committed on top of `main`; PR record (reviewer per §3.22.2; `reviewDuePhysMs` 20 s after the session starts when `npcAutoMerge`) | devops |
| `github.reopenPr` | `repo` R, `number` R | a closed PR → `open` (branch restored at its head) | devops |
| `github.unmergePr` | `repo` R, `number` R | **preset only.** Rewrites history so the PR's merge commit is not on `main`: `main` files revert to the merge's parent for the paths it touched, later commits are re-parented, the PR is `open` with its branch at its original head; Orca rows synced from those paths are re-synced from the rewritten `main` | devops |
| `config.write` | `fixture` R (`m14-broken`, `broken`, `target`), `robot` (`megatron`), `path` (local clone) | write `config.properties` (git-ignored, so not a commit) | devops |
| `jenkins.setParam` | `job` R, `param` R, `value` R, `by` (`morgan`) | `savedParams[param] ≔ value` (config history) | devops |
| `jenkins.startBuild` | `job` R, `params` ({}), `by` (`jenkins`), `number` | `jenkins.build` (a real build) | devops |
| `jenkins.seedBuild` | `job` R, `params` R, `result` R, `failureCode`, `robot`, `atMs` R, `by` R | **preset only.** A finished historical build whose console is produced by the same stage/console formatter for that outcome (never free text) | devops |
| `runner.startLocal` | `repo` (`uia-remote`), `test` R, `configPath` | `runner.runLocal` (a real IntelliJ run) | devops |

#### 4.4.2 Academy module scenarios (`reset({ preset: 'academy:<Mnn>' })`)

All presets start from `factory` with `config.mode = 'academy'`, `damageModel = 'academy'`,
`forceHealthCheckAllowed = true`, `startHour = 9`, `timeScale = 1` (§6.5). "At reset" items are applied
in order before tick 0; "During the lesson" items are injected by the lesson runner at the given step.

| Module | At reset (in order) | During the lesson | Notes |
|---|---|---|---|
| M01 | `rig.testRunning { rig: 'wall-e', job: 'Java/uia-remote-regression-flex', number: 4120 }` | the runner clears it after step 7 | step 6 shows the lockout overlay |
| M02 | — | — | the device library is props; the sealed Duo 3 / Mini 4 boxes have no `TerminalDevice` |
| M03 | `fuse.blown { fuse: 'F-RACKB-5V' }`; `power.addLoad { id: 'psu-flex4-new', label: 'New Flex 4 power brick', expects: 'AC-BRICK-18V', drawA: 0.5 }`; `power.addLoad { id: 'psu-collis-spare', label: 'Spare Collis probe PSU', expects: 'AC-BRICK-18V', drawA: 0.3 }` | — | wrong socket in Academy = spark + mentor line only (§3.13.3) |
| M04 | — | — | WALL-E idle, door closed = factory |
| M05 | — | — | |
| M06 | — | step 10: the runner re-plugs EVE's Pi as Jared (`power.plug { load: 'pi-eve', kind: 'dc-rail', target: 'MAIN-eve' }`) | step 7's unplug is the player's own action |
| M07 | `orca.hrnTypo { robot: 'johnny-5' }`; `device.swap { rig: 'johnny-5', deviceId: 'dev-spare-flex2' }`; `orca.urlWrong { robot: 'johnny-5', field: 'tap', value: '' }`; `orca.tetherCleared { robot: 'optimus' }`; `orca.offsets { robot: 'bumblebee', yMm: 1.5 }` | — | until relinked, JOHNNY-5's builds drive a Flex 2 with FLEX_1 rows (misses, §3.5.4) |
| M08 | `merchant.credentialBlank { merchant: 'GO-SDK-US-01', field: 'apiKey' }`; `gort.capabilityDropped { path: 'go-sdk/tests/sale_receipt.json', key: 'printer' }` | — | Cur's "rosie" in step 5 is VISION in this roster (Appendix A) |
| M09 | `flag.set { flag: 'receiptQrFeature', value: false }`; `receipt.qrRollout { devices: ['dev-eve-flex4'] }`; `orca.missingReceiptMap { deviceType: 'FLEX_4' }`; `repo.deleteFile { repo: 'gort', path: 'config/screen-locations/FLEX_4/RECEIPT_OPTIONS_5.json', by: 'jared', message: 'Remove unverified FLEX_4 5-option map' }` | step 9: `jenkins.startBuild { job: 'Java/pigeon-android-tip-sale', params: { ROBOT_NAME: 'eve' } }` (literal `RECEIPT_OPTIONS_4` → Print at 71.0 on a screen whose Print is at 74.0 → miss, recorded for the camera clip) | step 12's PR adds the file back; the merge syncs Orca |
| M10 | — | — | lesson runs before 10:00, so `schtasks` shows `10/05/2026 10:00:00  Ready` |
| M11 | `jenkins.envCase { job: 'Java/uia-remote-regression-flex', value: 'flex_3' }` | — | |
| M12 | — | — | TARS on `home` = factory |
| M13 | `uia.scrollSwapped { mode: 'swapped' }`; `uia.missingScreenMethods { class: 'ReceiptScreen' }` | — | the player clones in step 3 and gets both bugs |
| M14 | `repo.clone { repo: 'uia-remote' }`; `config.write { fixture: 'm14-broken' }`; `ws.adbKnows { target: '10.42.60.4:5555' }` | — | MEGATRON Available = factory |
| M15 | `github.unmergePr { repo: 'gort', number: 418 }`; `repo.commitFixture { repo: 'pigeon', path: 'tests/sale/swipe_sale_print.json', fixture: 'm15-expanded', by: 'alex', message: 'Expand swipe sale actions' }`; `pigeon.missingComma { path: 'tests/sale/swipe_sale_print.json', line: 22 }`; `jenkins.setParam { job: 'Java/pigeon-android-sale-swipe', param: 'ROBOT_NAME', value: 'bumblebee' }` | — | step 5 `LSTR ParseError: Unexpected string in JSON at line 23 column 7`; step 8 `step 7/9 "select print" … TIMEOUT after 60 s` (MINI_3 `_5` rows 3.0 mm high from the un-merged #418); step 11 merge → sync → PASS |
| M16 | `github.unmergePr { repo: 'uia-remote', number: 398 }`; `orca.deleteEntity { entity: 'screenCompareImage', name: 'CFD_TOTAL' }`; `device.stage { device: 'dev-r2-d2-duo', stage: 'review-order' }`; `repo.clone { repo: 'uia-remote' }`; `config.write { fixture: 'target', robot: 'megatron' }`; `repo.commitFixture { repo: 'pigeon', path: 'tests/sale/swipe_sale_print.json', fixture: 'm16-with-compare', by: 'morgan', message: 'Add CFD total screen compare' }` | step 8: the player's toggle = `flag.set cfdLayoutV2Toggle true` | R2-D2 MFD on Review Order, CFD on `customer-cart` (`TOTAL $10.83`) |
| M17 | `github.reopenPr { repo: 'uia-remote', number: 212 }` | — | `img:receipt:wall-e:0912` is factory |
| M18 | — | step 8: `callus.down { host: 'minix-01', mode: 'box-off' }`; step 9: `rig.lockReleased { rig: 'seti' }`; step 10: `jenkins.envCase { job: 'Java/uia-remote-regression-mini', value: 'mini_3' }` then `jenkins.startBuild` of that job | capstone 1: all four Rack A rigs fail with `502 … callus upstream 10.42.20.1:9000 unreachable`; the lesson points at BUMBLEBEE |

#### 4.4.3 Certification practicals (Cur §5.3) and drills (GP §2.4)

`$T` / `$R` are drawn by the mission from the listed candidates with its own seeded RNG before the
scenario is injected (so several items agree on the same choice).

| Task | Scenario | Candidates |
|---|---|---|
| P1-1 | `rig.lockReleased { rig: '$R' }` | the 8 touch/standalone physical rigs |
| P1-2 | `fuse.blown { fuse: '@random' }` (over `F-RACKA-5V`, `F-RACKB-5V`, `F-BENCH-5V`); the two M03 `power.addLoad` items | — |
| P1-3 | — | |
| P2-1 | `pi.off { host: '$PI' }` | the 12 physical rig Pis |
| P2-2 | `device.swap { rig: '$R', deviceId: <spare> }`; `orca.hrnTypo { robot: '$R', hrn: <one-letter typo> }` | `johnny-5` + `dev-spare-flex2` (Flex 1 → Flex 2, relink `deviceId`), `megatron` + `dev-spare-mini3` (CFD Mini 2 → Mini 3, relink `cfdDeviceId`) |
| P2-3 | `flag.set { receiptQrFeature: false }`; `receipt.qrRollout { deviceTypes: ['$T'] }`; `orca.missingReceiptMap { deviceType: '$T' }`; `repo.deleteFile { repo: 'gort', path: 'config/screen-locations/$T/RECEIPT_OPTIONS_5.json', … }` | `FLEX_3`, `FLEX_4`, `MINI_3`, `STATION_2018` |
| P2-4 | `jenkins.namedRobot { robot: '$R' }` | `tars`, `data` |
| P3-1 | `repo.clone`; `config.write { fixture: 'broken', robot: '$R' }`; `ws.adbKnows { target: '10.42.60.4:5555' }` | `megatron`, `optimus` |
| P3-2 | `pigeon.missingBracket { path: 'tests/sale/swipe_sale_print.json', line: 9 }`; `orca.screenLocationShift { deviceTypes: ['$T'] }`; `github.seedPr { repo: 'gort', number: 419, fixture: 'receipt5-fix:$T', author: 'jared', title: 'Fix 5-option receipt coordinates for $T' }`; `jenkins.setParam { job: 'Java/pigeon-android-sale-swipe', param: 'ROBOT_NAME', value: <a rig of $T> }` | `FLEX_3` (wall-e), `MINI_3` (bumblebee), `STATION_2018` (baymax) |
| P3-3 | `github.unmergePr { repo: 'uia-remote', number: 398 }`; `ocr.labelShift { device: 'dev-r2-d2-duo', px: 10 }`; `repo.clone`; `config.write { fixture: 'target', robot: 'megatron' }` | — |
| P3-4 | `uia.missingScreenMethods { class: 'ReceiptScreen' }`; `uia.scrollSwapped { mode: 'swapped' }` | — |
| P4 / P5 | incident scenarios from Appendix A drawn per Cur §5.3 (`cert` preset, §6.5) | |
| DR16 | per item: `rig.lockReleased { rig }`; one in three also `rig.testRunning { rig, durationMs: 20000 }` (the right action is to wait, then Park All) | the 8 touch/standalone rigs |
| DR19 | — (the sim answers the live terminal) | ADB-visible devices |

#### 4.4.4 Fixtures

Fixture texts live in `src/sim/seed/fixtures/` (devops). Exact content:

**`m14-broken`** — Cur M14's "as found" file verbatim (`runType=standalone` … `robotName=megatron`).

**`target` (generator, robot `r`)** — the Cur M14 validator target computed for `r`, keys in Cur M14
order: `runType` = `tethered` if `r`'s MFD is populated or its type is a Duo, else `standalone`;
`merchantFacingDeviceIp` = MFD (or Robot Device) IP; `customerFacingDeviceIp` = CFD IP (Duo: the same
IP; standalone: empty); `serial` = MFD (or Robot Device) serial; `deviceType` = family of the MFD/Robot
Device type; `theme=avocado`; `kernelType=CPA`; `portNumber=5444`; `unlockPasscode=0000`;
`backendEnv` = robot environment; `robotName` = Name. MEGATRON's output is identical to Cur M14's
target; R2-D2's has both IPs `10.42.30.14`, `deviceType=Station`, `runType=tethered`.

**`broken` (generator, robot `r`)** — `target(r)` with `runType=standalone`, `customerFacingDeviceIp=`,
`deviceType` replaced by the next family in `Station → Mini → Flex → Compact → Station` order,
`theme=classic`, `kernelType=SPA`, `portNumber=5555`.

**`m15-expanded`** (`pigeon/tests/sale/swipe_sale_print.json`; line numbers matter — the
`pigeon.missingComma { line: 22 }` gap makes the parser stop at line 23 column 7):

```json
{
  "name": "Swipe sale with printed receipt",
  "connectionType": "USB",
  "platforms": ["REST", "ANDROID", "WINDOWS", "IOS"],
  "actions": [
    { "action": "create order", "params": {
      "item": "Tax Item 5"
    }, "store": "orderId" },
    { "action": "review order", "params": {
      "orderId": "${orderId}"
    } },
    { "action": "pay", "params": {
      "orderId": "${orderId}"
    } },
    { "action": "card swipe", "params": {
      "profile": "VISA_STD_SWIPE",
      "orderId": "${orderId}"
    }, "store": "paymentId" },
    { "action": "select tip", "params": { "robot": "${ROBOT_NAME}", "screen": "TIP", "button": "No Tip" } },
    { "action": "assert approved", "params": { "paymentId": "${paymentId}" } },
    { "action": "select print", "params": {
      "robot": "${ROBOT_NAME}",
      "screen": "RECEIPT_OPTIONS_5"
    } },
    { "action": "verify receipt", "params": { "totalCents": 1083 } },
    { "action": "assert home", "params": {} }
  ]
}
```
(28 lines; `select print` is action 7 of 9, so the timeout reads `step 7/9`; the literal
`RECEIPT_OPTIONS_5` is correct on BUMBLEBEE, §2.12.)

**`m16-with-compare`** — the factory `swipe_sale_print.json` (§2.12) with a 10th action appended before
`]`: `{ "action": "screenCompare", "params": { "x": 0, "y": 0, "w": 0, "h": 0, "expected": "TOTAL $10.83", "source": "webcam" } }`
(the comma after `assert home` included).

**`gort-418`** — `config/screen-locations/MINI_3/RECEIPT_OPTIONS_5.json` with the MINI_GEN3 firmware
values of §2.10.2 (`Print` 86.0/43.0, `Email` 86.0/55.0, `Text` 86.0/67.0, `No Receipt` 86.0/79.0,
`Scan for receipt` 86.0/91.0), GP INC20 format.

**`receipt5-fix:<TYPE>`** — the same file for `<TYPE>` with that type's firmware values.

**`uia-212-ai-receipt`** (PR #212, author `claude-eval` [illus.], title `[AI eval] Generated tests for
ReceiptScreen`) — adds `app/src/androidTest/java/com/lab/uia/pageobjects/ReceiptOptionsScreen.java`:

```java
package com.labsim.uia.pageobjects;

public class ReceiptOptionsScreen extends BaseTest {
    // ===== Zone 1: Element Locators =====
    private final BySelector noReceipt = By.text("No Receipt");
    private final BySelector print = By.text("Print");

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(noReceipt), TIMEOUT_MS);
    }
    public void selectNoReceipt() {
        waitForScreen();
        device.findObject(noReceipt).click();
    }
}
```

**`uia-431-lockscreen`** (PR #431, author `alex`, title `Add LockScreen page object`) — three changes:
(1) `app/src/main/java/com/lab/uia/AppRegistration.java` +2 lines
`    // LockScreen registration` / `    registry.add("LockScreen");`; (2)
`app/src/androidTest/java/com/lab/uia/pageobjects/LockScreen.java` (extends `BaseTest`; Zone 1
`private final BySelector clock = By.res("com.labsim.launcher:id/lock_clock");`; Zone 2
`waitForScreen()` with `device.wait(Until.hasObject(clock), TIMEOUT_MS);`; **no** `isScreenPresent()`);
(3) a committed `config.properties` = `target(megatron)` with `portNumber=5555`.

### 4.5 Scenario format (content contract)

```ts
type ScenarioItem = FaultSpec | SetupOp;          // FaultSpec has `faultId`, SetupOp has `op`
interface Scenario {
  id: string;                                     // "INC03", "INC03-C", "M07", "P2-2"
  items: ScenarioItem[];                          // applied in order by faults.injectAll
  reveal: 'healthCheck' | 'pipeline' | 'immediate' | 'none';   // when Arcade opens the ticket (§4.1.9)
  rig?: string;                                   // default bound rig for '$R'
}
```
Placeholders substituted by missions before `injectAll`: `$R` rig/robot Name, `$PI` its Pi host id,
`$DEV` its Robot Device runtime id, `$BOX` its Callus host id, `$PROBE` its probe id, `$T` a Device Type.
`'@random'` is resolved by the sim (`faults` stream). Scenarios are data in `src/content` /
`src/missions`; the sim only executes them.

---

## 5. Domain events

Events are declared in `src/sim/events.ts` (declaration-merged into `EventMap`), queued with
`ctx.emit` inside the transaction that caused them and delivered on `bus` after it commits, in emission
order (`src/core/store.ts`). Payloads are plain JSON. Status: **existing** = already in `events.ts`;
**EXTENDED** = existing, new *optional* fields added (marked `+`); **NEW** = add it. Within one
sub-step, events follow the system order of §3.1.1; API calls emit in the order their effects happen.
High-frequency changes (gantry position, voltages, console lines) are **not** events — views re-read
state.

### 5.1 Lifecycle, time, configuration

| Event | Payload | Emitted by / when | Status |
|---|---|---|---|
| `sim.reset` | `{ preset: string; seed: number }` | `reset()` after the new lab commits | NEW |
| `sim.restored` | `{ version: number; migratedFrom: number \| null }` | `restore()` / `load()` | NEW |
| `time.scaleChanged` | `{ from: number; to: number }` | `setTimeScale` | NEW |
| `time.jumped` | `{ fromMs: number; toMs: number; reason: 'skipToNextHealthCheck' \| 'fastForward' }` | game-clock jumps (§6.3) | NEW |
| `config.changed` | `{ keys: string[] }` | `setConfig` | NEW |
| `flags.changed` | `{ flag: string; value: string \| boolean }` | `setFlag` | existing |
| `setup.applied` | `{ op: string; params: Record<string, unknown> }` | each setup op (§4.4) | NEW |
| `fault.injected` | `{ instanceId; faultId; params }` `+ target?: string` | `faults.inject` / `injectAll` | EXTENDED |
| `fault.cleared` | `{ instanceId; faultId; by }` (`by` = `'condition'` or the actor) | auto-clear (tick 15) / `faults.clear` | existing |

### 5.2 Orca

| Event | Payload | Emitted by / when | Status |
|---|---|---|---|
| `orca.healthCheckRan` | `{ atMs; checked; failedRobotIds; recoveredRobotIds }` `+ run?: number; pinged?: number; skipped?: number; newlyFailedRobotIds?: number[]; forced?: boolean` | end of each run (§3.3.2); `checked` = pinged | EXTENDED |
| `orca.healthCheckAborted` | `{ run: number; atMs: number; reason: 'db-down' }` | a scheduled/forced run while the DB is down (§3.3.1) | NEW |
| `robot.statusChanged` | `{ robotId; name; from; to; actor; reason? }` | every status change (manual, health check, named auto-reset) | existing |
| `robot.noteAdded` | `{ robotId; noteId; endpoint?; text }` `+ kind?: 'HEALTH' \| 'STATUS' \| 'CONFIG' \| 'MANUAL'` | a new Note row | EXTENDED |
| `robot.noteRepeated` | `{ robotId: number; noteId: number; repeat: number; atMs: number }` | identical consecutive failure collapsed (§3.3.2) | NEW |
| `robot.checkedOut` | `{ robotId; name; buildId; byName }` `+ jobId?: string; kind?: 'jenkins' \| 'local' \| 'manual'` | §3.4.2 #7 | EXTENDED |
| `robot.released` | `{ robotId; name; buildId; statusAfter }` | §3.4.5 | existing |
| `robot.checkoutWaiting` | `{ buildId: string; jobId: string; label: string; reasons: string[] }` | a build enters/changes its waiting reasons (§3.4.2 #6) | NEW |
| `orca.checkoutRejected` | `{ buildId; jobId; reason; robotName? }` `+ code?: FailureCode` | any checkout failure | EXTENDED |
| `orca.entitySaved` | `{ entity; id; action; fields; actor }` `+ diff?: Record<string, [unknown, unknown]>` | every entity create/update/delete (incl. edit-style faults) | EXTENDED |
| `orca.xyTouch` | `{ robotName; screen; button; xMm; yMm; mode; ok; hitButton; error? }` `+ requestId?: string; orcaMode?: 'PHYSICAL_TAP' \| 'ADB_TOUCH'; status?: number; actor?: string; target?: 'MFD' \| 'CFD'` | ADB_TOUCH at injection; PHYSICAL_TAP when the stroke completes; errors at once (`ok:false`) | EXTENDED |
| `orca.cardAction` | `{ robotName: string; entry: CardEntry; profile: string; ok: boolean; armed: boolean; error?: string; actor: string }` | `/api/card/*` result (§3.6) | NEW |
| `orca.screenLocationsSynced` | `{ deviceType: DeviceTypeCode; screen: string; path: string; commit: string; buttons: number }` | gort → Orca sync (§3.22.3) | NEW |
| `orca.dbStateChanged` | `{ connected: boolean }` | `orca.app.dbConnected` flips (§3.14.5) | NEW |
| `orca.rest` | `{ method; path; status; actor }` | every REST call answered | existing |

### 5.3 Rigs

| Event | Payload | Emitted by / when | Status |
|---|---|---|---|
| `rig.command` | `{ rigId; command; actor; ok; error? }` | every tablet/API motion command (`error: 'LOCKED'` while locked) | existing |
| `rig.moveCompleted` | `{ rigId; xMm; yMm }` | a `moveTo` finishes | existing |
| `rig.parkStarted` | `{ rigId; axes }` — `axes` widened to `'all' \| 'xy' \| 'x' \| 'y'` | Park command starts | EXTENDED |
| `rig.parkCompleted` | `{ rigId }` `+ axes?: 'all' \| 'xy' \| 'x' \| 'y'; homed?: boolean; lockEngaged?: boolean` | Park command ends | EXTENDED |
| `rig.homingFailed` | `{ rigId: string; axis: 'x' \| 'y'; fault: string }` | broken limit switch (§3.7.1) | NEW |
| `rig.lockBroken` | `{ rigId; by }` | lock released by drag / steppers / MOTOR / Pi reboot | existing |
| `rig.lockEngaged` | `{ rigId: string }` | Park All completes | NEW |
| `rig.bannerChanged` | `{ rigId; from; to }` `+ text?: string` | §3.7.5 re-evaluation changes colour | EXTENDED |
| `rig.solenoidTap` | `{ rigId; xMm; yMm }` `+ ref?: string; deviceId?: string \| null; result?: 'HIT' \| 'EDGE_REJECT' \| 'MISS' \| 'NO_CONTACT' \| 'NOT_RENDERED'; hitButton?: string \| null` | each plunger stroke (also when the connector is loose: `NO_CONTACT`) | EXTENDED |
| `rig.actuator` | `{ rigId; actuator; state }` | dip/tap/phone state change | existing |
| `rig.switch` | `{ rigId; which; on }` | MAIN/MOTOR toggled | existing |
| `rig.lockout` | `{ rigId; locked }` | `dashboardLocked` changes | existing |
| `rig.carriageDragged` | `{ rigId: string; dxMm: number; dyMm: number; accumMm: number; actor: string }` | `rig.dragCarriage` / `pushHead` (GW06) | NEW |
| `rig.doorChanged` | `{ rigId: string; open: boolean }` | `rig.setDoor` | NEW |
| `rig.reseated` | `{ rigId: string; part: RigPart; seated: boolean }` | `rig.reseat` | NEW |
| `rig.cradleReplaced` | `{ rigId: string }` | `rig.replaceCradle` | NEW |
| `rig.dipArmAdjusted` | `{ rigId: string; toothOffset: number }` | `rig.alignDipArm` | NEW |
| `rig.motorUsbMoved` | `{ rigId: string; host: string }` | `rig.moveMotorUsb` | NEW |
| `rig.webcamAimed` | `{ rigId: string; aimedOk: boolean }` | `rig.aimWebcam` | NEW |
| `rig.tabletNameChanged` | `{ rigId: string; hrn: string }` | `tablet.hrnShown` updated (§3.7.5) | NEW |

### 5.4 LabSim devices

| Event | Payload | Emitted by / when | Status |
|---|---|---|---|
| `device.touched` | `{ deviceId; display; xMm; yMm; source; hitButton; screen }` `+ result?: 'HIT' \| 'EDGE_REJECT' \| 'MISS' \| 'DISABLED' \| 'SECURE_REJECTED' \| 'NOT_RENDERED'` | every touch reaching a display | EXTENDED |
| `device.stroke` | `{ deviceId: string; display: 'primary' \| 'secondary'; source: 'adb' \| 'probe' \| 'player'; effect: 'signature' \| 'scroll' \| 'ignored' }` | swipes / probe strokes (§3.5.4) | NEW |
| `device.screenChanged` | `{ deviceId; display; from; to }` | every screen transition | existing |
| `device.toast` | `{ deviceId: string; display: 'primary' \| 'secondary'; text: string }` | a toast appears (`Card read error, try again`, `Printer not available`, …) | NEW |
| `device.powerChanged` | `{ deviceId; from; to }` | power state change | existing |
| `device.fried` | `{ deviceId; cause }` | §3.13.3 damage | existing |
| `device.cardPresented` | `{ deviceId; entry; profileId; ok; error? }` | card event reaches the device (§3.6 #10) | existing |
| `device.receiptPrinted` | `{ deviceId: string; orderId: string; totalCents: number; text: string }` | printer payload (§3.9.3, +2.5 s) | NEW |
| `device.transactionCompleted` | `{ deviceId; orderId; totalCents; approved; receiptChoice }` `+ authCode?: string; entry?: CardEntry \| null` | `thank-you` reached / declined end | EXTENDED |
| `device.provisioned` | `{ deviceId; merchantConfigId }` | Laz assign-merchant / de-provision | existing |
| `device.adbTcpChanged` | `{ deviceId: string; port: number \| null }` | OOBE wipe, `adb tcpip`, Laz restore | NEW |
| `device.payDisplayLink` | `{ mfdDeviceId: string; cfdDeviceId: string; link: 'UP' \| 'DOWN' }` | §3.8.6 link change | NEW |
| `device.swapped` | `{ rigId: string; removedDeviceId: string; installedDeviceId: string }` | `device.swapHardware` | NEW |

### 5.5 Power

| Event | Payload | Emitted by / when | Status |
|---|---|---|---|
| `power.fuseBlown` | `{ fuseId; railId; currentA }` | §3.13.1 #5 | existing |
| `power.fuseReplaced` | `{ fuseId }` | `power.replaceFuse` | existing |
| `power.fuseRemoved` | `{ fuseId: string; live: boolean }` | `power.removeFuse` (GW03 when `live`) | NEW |
| `power.fuseInserted` | `{ fuseId: string; ratingA: number; labelA: number; live: boolean }` | `power.insertFuse` (GW04 when `ratingA ≠ labelA`) | NEW |
| `power.plugged` / `power.unplugged` | `{ loadId; hookup }` / `{ loadId }` | plug changes | existing |
| `power.loadDamaged` | `{ loadId; cause }` | §3.13.3 | existing |
| `power.railChanged` | `{ railId; voltage }` | a rail crosses 0 V ↔ nominal (not every droop) | existing |
| `power.stripToggled` | `{ stripId; on }` | strip switch | existing |
| `power.regulatorToggled` | `{ regulatorId: string; on: boolean }` | regulator input switch | NEW |
| `power.spark` | `{ at: string; cause: string; live: boolean }` | live fuse handling, DC mis-plug (VFX/audio) | NEW |
| `power.breakerTripped` | `{ stripId: string; currentA: number }` | strip > 15 A | NEW |
| `power.psuHiccup` | `{ psuId: string; untilPhysMs: number }` | MW-1 overload / short | NEW |
| `power.underVoltage` | `{ hostId: string; volts: number }` | Pi below 4.63 V ≥ 100 ms (§3.13.1 #8) | NEW |
| `power.measured` | `{ pointId: string; mode: 'V' \| 'OHM'; display: string; live: boolean }` | `power.measure` (GW21 when `mode == 'OHM' && live`) | NEW |

### 5.6 Hosts, network, workstation

| Event | Payload | Emitted by / when | Status |
|---|---|---|---|
| `host.powerChanged` | `{ hostId; from; to }` | derived `power` changes | existing |
| `host.osChanged` | `{ hostId: string; from: HostOs; to: HostOs }` | authoritative `os` changes | NEW |
| `host.crashed` | `{ hostId; reason }` | a host enters `HUNG` | existing |
| `host.serviceChanged` | `{ hostId; service; running }` `+ failure?: string \| null` | service up/down | EXTENDED |
| `host.ethernetChanged` | `{ hostId; connected }` `+ eth?: 'LINKED' \| 'UNPLUGGED' \| 'DAMAGED'` | `eth` changes | EXTENDED |
| `host.usbChanged` | `{ hostId: string; usbId: string; attached: boolean }` | USB attach/detach | NEW |
| `host.diskCleaned` | `{ hostId; beforePct; afterPct }` | `host.cleanDisk` / file deletions freeing space | existing |
| `host.fileWritten` | `{ hostId: string; path: string; actor: string }` | `host.writeFile` / terminal edits | NEW |
| `host.securityTamper` | `{ hostId: string; action: string; actor: string }` | corporate agent stopped/uninstalled/logs deleted (§3.14.3, GW11) | NEW |
| `host.schedTaskRan` | `{ hostId: string; task: 'GortCardSync'; result: 0 \| 1; commit: string \| null; manual: boolean }` | a GortCardSync run ends | NEW |
| `adb.connected` / `adb.disconnected` / `adb.command` | existing payloads | workstation ADB | existing |
| `adb.coworkerDriven` | `{ target: string; deviceId: string; command: string; by: 'terminal' \| 'runner' }` | anything drives a `10.42.60.*` device (§3.15.1, GW08/INC27) | NEW |
| `terminal.command`, `ssh.connected`, `ssh.disconnected` | existing payloads | terminal | existing |
| `camera.snapshot` | `{ cameraId: string; path: string; imageRef: string }` | Camera app **Snapshot** | NEW |

### 5.7 Git, GitHub, Jenkins, runners

| Event | Payload | Emitted by / when | Status |
|---|---|---|---|
| `git.cloned`, `git.fileEdited`, `git.committed`, `git.pushed`, `git.pulled`, `git.branchChanged` | existing payloads | §3.22.1 | existing |
| `git.pushRejected` | `{ repo: string; branch: string; reason: string }` | protected `main` (§3.22.1) | NEW |
| `github.prCreated`, `github.prMerged` | existing payloads | §3.22.2 | existing |
| `github.prUpdated` | `{ repo: string; number: number; headSha: string }` | push to an open PR's branch | NEW |
| `github.prReviewed` | `{ repo: string; number: number; by: string; verdict: 'APPROVED' \| 'CHANGES_REQUESTED' \| 'COMMENTED' }` | player or NPC review | NEW |
| `github.prCommented` | `{ repo: string; number: number; by: string; commentId: number; path: string \| null; line: number \| null; reason?: string }` | line/general comment | NEW |
| `github.prClosed` | `{ repo: string; number: number; by: string }` | close without merge | NEW |
| `jenkins.buildQueued`, `jenkins.buildStarted`, `jenkins.stageChanged`, `jenkins.buildFinished` | existing payloads | §3.18 | existing |
| `jenkins.jobSaved` | `{ jobId: string; fields: string[]; actor: string }` | Configure / `saveJob` / config-style faults | NEW |
| `jenkins.jobMoved` | `{ fromJobId: string; toJobId: string; actor: string }` | `moveJob` | NEW |
| `jenkins.jobCreated` / `jenkins.jobDeleted` | `{ jobId: string; actor: string }` | `createJob` / `deleteJob` | NEW |
| `runner.step` | `{ runId; step; deviceRole; ok; detail? }` `+ index?: number; total?: number; buildId?: string \| null` | each runner step result | EXTENDED |
| `test.localRunStarted` | existing | `runner.runLocal` | existing |
| `test.localRunFinished` | `{ runId; testName; passed; failureCode }` `+ robotName?: string \| null; overlappedJenkins?: boolean` | local run ends | EXTENDED |

### 5.8 Cards, Laz/Ubi, vision, AI, chat, printers

| Event | Payload | Emitted by / when | Status |
|---|---|---|---|
| `callus.cardLoaded` | `{ collisId; profileId; ok; error? }` | Callus load step (§3.6 #6) | existing |
| `collis.action` | `{ collisId; entry; ok; error? }` | probe presents a card | existing |
| `collis.stateChanged` | `{ collisId: string; led: 'green' \| 'amber' \| 'off'; state: 'READY' \| 'OFFLINE' \| 'NO_LINK' \| 'FAULT' }` | probe state/LED change | NEW |
| `callus.armed` / `callus.armFired` / `callus.armExpired` | `{ collisId: string; profile: string; deviceId: string }` (`armFired` `+ ok: boolean`) | §3.6 #9 | NEW |
| `callus.syncCompleted` | `{ hostId; commit }` `+ files?: number; manual?: boolean` | GortCardSync success | EXTENDED |
| `laz.runStarted`, `laz.stepChanged`, `laz.runFinished` | existing payloads | §3.17 | existing |
| `ubi.routed` | `{ runId: string; merchant: string; route: string \| null; ok: boolean; error?: string }` | Laz `ubi-route` step | NEW |
| `ocr.ran` | `{ compareId; text; expected; match }` `+ source?: 'orca' \| 'runner' \| 'pigeon' \| 'gimp'; robotName?: string; line?: string` | every Tesseract run | EXTENDED |
| `ollama.requested` | `{ requestId: string; model: string; image: string \| null }` | `ollama.ask` / Jenkins vision job | NEW |
| `ollama.responded` | `{ requestId; correct }` `+ verdict?: 'PASS' \| 'FAIL' \| null` | inference done | EXTENDED |
| `printer3d.started` | `{ printer: 'prusa' \| 'bambu'; file: string; endsPhysMs: number }` | `printer3d.start` | NEW |
| `printer3d.done` | `{ printer: 'prusa' \| 'bambu'; part: string }` | print finished (part on the tray) | NEW |
| `chat.message` | `{ id; channel; author; text; ticketId? }` | every chat post (incl. `#orca-alerts`, `#jenkins`) | existing |

---

## 6. Determinism, time, save/load and presets

### 6.1 RNG streams

`RngStream = 'core' | 'faults' | 'jenkins' | 'devices' | 'ollama' | 'npc'`. Each stream is an
independent mulberry32 state (`@/core/rng`), so draws in one domain never shift another (a player's extra
`curl` never changes which fault `'@random'` picks).

| Stream | Seed | Draws (exhaustive list; one `nextFloat` per value, in the order written) |
|---|---|---|
| `core` | `lab.rng` = `createRngState(seed)` — the state `TxContext.random()` draws from. `rngStreams.core` is a **mirror** copied from `lab.rng` at the end of every tick and API transaction (so snapshots read uniformly); never draw from the mirror. | nothing in v2 rules; reserved (missions calling `ctx.random()` inside a sim transaction use it) |
| `faults` | `createRngState(hashString(seed + ':faults'))` | `'@random'` fault parameters (§4.1.3), in parameter order |
| `jenkins` | `… ':jenkins'` | queue pickup jitter `U(0, 400)` ms per build when it gets an executor [sim] (simultaneous triggers do not all start in one tick) |
| `devices` | `… ':devices'` | per screen transition `renderMs` (§3.19.5: one draw for the 90/10 branch, one for the value); per network request LAN latency `1 + floor(4·u)` ms (§1.9); health-check latencies (§3.3.3); `authCode` digits (`SIM` + `floor(1000·u)` zero-padded, §3.9.3) |
| `ollama` | `… ':ollama'` | `'@random'` values in `ollama.seedReceipt` (subtotal, %, misread digit) |
| `npc` | `… ':npc'` | NPC reply delay `10 000 + floor(10 001·u)` ms (§3.24) when `chat.schedule` gets `delayMs: '@npc'` |

Seeds: `seed` from `reset({ seed })` (default `20261005`; Arcade passes the shift seed, the Daily
Challenge the date hash, GP §4.6). `hashString` is the FNV-1a in `@/core/rng`.

Draw discipline (MUST): iterate entities in a defined order (numeric id for Orca rows, sorted keys for
records, array order otherwise) whenever a loop draws, so the sequence is independent of object
insertion history.

### 6.2 Fixed-step tick

`src/core/loop.ts` calls `sim.tick(SIM_STEP_MS × timeScale)` at 20 Hz (`SIM_STEP_MS = 50`), at most 8
steps per frame, never while a pausing overlay is open. `sim.tick(dtGameMs)`:

```
if !(dtGameMs > 0) return                     // 0, negative, NaN: no-op
transact((root, ctx) => {
  lab = root.lab
  dtPhys = dtGameMs / lab.time.timeScale      // physical ms (§0.3)
  n = max(1, ceil(dtPhys / 50))               // sub-steps of ≤ 50 physical ms
  repeat n times: substep(lab, ctx, dtGameMs / n, dtPhys / n)
  lab.rngStreams.core = copy(lab.rng)
})

substep(lab, ctx, dg, dp):
  prevNow = lab.time.nowMs
  1  clock      nowMs += dg; physMs += dp
  2  power  3 hosts  4 network  5 rigs  6 devices  7 collis/callus
  8  orca       incl. one health-check run per multiple of 300 000 in (prevNow, nowMs] (anchor §0.3)
  9–12          tickDevops(lab, ctx, dg, dp): jenkins, local runs, ollama, git/npc
  13 laz/ubi  14 printer3d  15 faults  16 housekeeping
```

At the loop's step a sub-step is exactly one 50 ms physical step at every time scale (×30 means 1 500
game ms per sub-step). Tests may call `tick()` with any `dtGameMs`; large values are split into ≤ 50 ms
physical sub-steps, so a test tick of 60 000 ms at scale 1 runs 1 200 sub-steps and behaves exactly like
real time.

**Timers** (`lab.timers`, §3.1.2) are owned by kind prefix and handled inside the owning system's slot,
due ones in `(atMs, insertion index)` order: game timers when `atMs ≤ nowMs`, physical timers when
`atMs ≤ physMs`. Devops prefixes: `jenkins.`, `runner.`, `local.`, `git.`, `npc.`, `ollama.`; every other
prefix (`host.`, `device.`, `rig.`, `callus.`, `orca.`, `laz.`, `printer3d.`, `power.`, `chat.`) is core;
`chat.` timers are delivered in the housekeeping slot (step 16). `takeDueTimers(lab, prefixes)` in
`src/sim/devops` is the shared helper.
Timer ids are `"t" + (++seq.timer)`.

**Crossings** use `prevNow = nowMs − dg`: a system that fires on a game-clock boundary (health check,
`GortCardSync` 10:00, nightly 02:00, idle lock) fires once per boundary crossed in `(prevNow, nowMs]`,
in time order, all against the state of this sub-step.

**API transactions** (`sim.*` actions) run between ticks, never advance either clock, and may add
timers, rig commands or runner steps that the next tick executes.

### 6.3 Time scaling and jumps

* `setTimeScale(s)`: allowed `1, 2, 5, 10, 30`; any other value snaps to the nearest allowed one (ties
  down) with a `warn` log. Mode defaults: Academy 1 (×30 while the lesson's fast-forward is held), Arcade
  shift 5, Free Play `settings.freeplayTimeScale` (1–10, ×30 hold), certification 1, tests 1. Physical
  durations stay real seconds at every scale (GP SR17).
* `fastForward(gameMs)` (NEW): advances **only the game clock** by `gameMs` (`0 < gameMs ≤ 86 400 000`)
  as one sub-step with `dp = 0`: every crossed health check / schedule runs in order, physical
  processes (boots, prints, builds, Laz) do not progress. Emits `time.jumped`.
* `skipToNextHealthCheck()` = `fastForward(orca.healthCheck.nextRunMs − nowMs)` (lands exactly on the
  boundary, so the check runs at `nextRunMs`).
* `orca.forceHealthCheck(actor)` (Orca's tutorial button): runs §3.3.2 now if
  `config.forceHealthCheckAllowed`, else `403 Force health check is disabled in this environment`.
  `orca.runHealthCheckNow()` is the unconditional variant for missions and tests. Neither moves
  `nextRunMs`.
* Pausing is the loop's job (`isSimPaused`); the sim has no paused state.

### 6.4 Snapshot, restore, save/load, migrations

* `snapshot(): LabState` — a deep, mutable copy of the committed `lab` (`structuredClone`), never the
  frozen store object. JSON-safe by construction (§1).
* `restore(state)` — validates and migrates exactly like `load`, then replaces `lab` in one transaction
  and emits `sim.restored`. Invalid input: logs an `error` entry and leaves the lab unchanged (the method
  is `void`; use `load` to get the reason).
* `load(json: unknown): Result<{ migratedFrom: number | null }>` (NEW) — accepts a JSON string or a parsed
  object. Errors (exact): `not a LabSim save`, `save is from a newer LabSim (v3) — update the game`,
  `save is corrupted: missing <key>`. Then migrations, then `restore`.
* Persistence: Free Play saves `sim.snapshot()` under `labsim.freeplay.v1` (`src/core/persistence.ts`)
  when leaving Free Play and every 60 real s; resuming calls `sim.load`. Housekeeping caps (§3.1.1 #16)
  bound the size (factory lab ≈ 1.5 MB JSON [estimate]; localStorage ≈ 5 MB).
* **Determinism contract:** `restore(snapshot())` followed by the same sequence of `tick`/API calls
  yields identical states and identical event sequences. Therefore no mutable module-level state in
  `src/sim` (memo caches keyed by object identity are allowed only if they never change results), no
  `Date.now()`, `performance.now()`, `Math.random()`, `setTimeout`.
* **Versions:** `LAB_STATE_VERSION = 2`. Migrations are pure functions `MIGRATIONS[v](state) → state(v+1)`
  applied in sequence. Bump the version whenever a field's meaning changes or a required field is added
  that cannot be defaulted.
* **v1 → v2:** v1 is the pre-release stub (empty lab). The migration re-seeds the factory lab
  (`createInitialLabState(v1.rng.seed)`) and keeps only `time.nowMs`, `time.timeScale`, `time.startHour`
  and `flags` (adding `cfdLayoutV2Toggle: false`); every other v1 field was empty and is dropped.
  `dateLabel` becomes `MON, OCT 5`.

### 6.5 Presets

`reset({ preset = 'factory', seed = 20261005, startHour?, timeScale? })`. Preset grammar:
`factory | arcade | freeplay | cert | test | academy:M01 … academy:M18`. `sim.presets()` (NEW) lists them.
Unknown preset: `error` log, `factory` used (reset never throws).

Order of application (all before tick 0, in one transaction):
1. `lab = createInitialLabState(seed)` — the §2 factory lab (core seed + `seedDevops`), `startHour 9`.
2. Preset configuration (table below); `startHour` sets `nowMs = startHour × 3 600 000`,
   `physMs = 0`, `healthCheck.lastRunMs = nowMs`, `nextRunMs = nowMs + 300 000`; run #1 is the factory
   check at `nowMs` (computed over the factory state **before** step 4, so seeded faults are revealed by
   run #2, the first check inside the session).
3. Flags (factory: `receiptQrFeature true`, `uiaVersion '2.3'`, `softwarePinBypass false`,
   `showTouchTargets false`, `cfdLayoutV2Toggle false`).
4. The preset's scenario (`academy:*` = §4.4.2 "At reset"), with `injectAll` semantics; a failing item
   logs an `error` and the rest of the scenario is skipped.
5. Commit; emit `sim.reset`.

| Preset | `mode` | `damageModel` | `pipelinesEnabled` | `npcAutoMerge` | `forceHealthCheckAllowed` | `startHour` | `timeScale` |
|---|---|---|---|---|---|---|---|
| `factory` | `freeplay` | `full` | false | true | true | 9 | 1 |
| `academy:Mnn` | `academy` | `academy` | false | true | true | 9 | 1 |
| `arcade` | `arcade` | `arcade` | true | true | false | 8 | 5 |
| `freeplay` | `freeplay` | `full` | false | true | true | 9 | 1 (missions apply the setting) |
| `cert` | `cert` | `arcade` | true for P4/P5 shifts, false for single tasks (missions toggle via `setConfig`) | true | false | 8 | 1 |
| `test` | `test` | `full` | false | false | true | 9 | 1 |

`logCap` is 500 in every preset. How missions use them: Academy lesson start → `reset({ preset:
'academy:M07' })`, during-lesson items via `faults.injectAll`; Arcade shift → `reset({ preset: 'arcade',
seed })`, then the director injects scenarios (Appendix A) and runs pipelines PL1–PL8 through
`jenkins.build`; Free Play → `load(saved)` or `reset({ preset: 'freeplay' })` and the Fault Injector;
certification → `reset({ preset: 'cert', seed })` + the practical's scenario (§4.4.3); unit tests →
`reset({ preset: 'test' })`.

### 6.6 Implementer checklist (determinism)

1. Every random value comes from the stream §6.1 assigns; one draw per value.
2. All durations are integer ms where stored (`Math.round` once when computing an end time); coordinates
   keep one decimal (`Math.round(x × 10) / 10`) when written to Orca rows.
3. No floating accumulation for clocks: `nowMs`/`physMs` are sums of the loop's step sizes (50 × scale is
   an integer for every allowed scale).
4. Iteration order defined (ids / sorted keys / arrays).
5. Events emitted in causal order; no event for a state that did not change.
6. Text from `src/sim/text/` formatters only (snapshot-tested), timestamps from `nowMs` (§0.2).

---

## Appendix A — Cross-reference tables

### A.1 GP incidents → scenarios → systems

Scenario items use §4 ids (faults) and §4.4.1 ops (setup); `$R` defaults are GP's default rigs mapped
to this roster. **Reveal** per §4.5. "Systems" = the sections that produce the evidence and evaluate the
fix. *Deviation* notes record where GP's illustrative text cannot be produced literally by the rules
and what the sim shows instead (content should use the sim's string).

| Incident | Scenario (in order) | Reveal | Systems / sections |
|---|---|---|---|
| INC01 | `pi.hung { host: '$PI' }` (`pi-wall-e`) | healthCheck | §3.14.1 LEDs · §1.9 reachability · §3.3.3 #1 · §3.7.5 grey tablet · §3.2.1 · §3.4.2 skip lines |
| INC01-B | `pi.serviceDown { host: '$PI', service: 'robot-controller' }` | healthCheck | §3.3.3 #2 · §3.14.1 systemctl |
| INC01-C | `pi.hung { host: 'pi-adb-shelf' }` | healthCheck | §3.3.3 shared Pi (DATA + TARS, same timestamp) |
| INC02 | `callus.down { host: 'minix-01', mode: 'box-off' }` (B `minix-02`; C `mode: 'service-stopped'`) | healthCheck | §3.3.3 #7/#8 · §3.14.2 · §3.16 · §3.2.1 (ROSIE back to Unavailable in B) |
| INC03 | `fuse.blown { fuse: 'F-RACKB-5V' }` (B `F-RACKA-5V`; C + `eth.unplugged { host: 'pi-johnny-5' }`) | healthCheck | §3.13.1–§3.13.2 · §2.6 meter points · §3.14.1 · §3.2.1 restore rule |
| INC04 | `eth.unplugged { host: '$PI' }` (`pi-bumblebee`; B `eth.damaged`) | healthCheck | §1.9 #2 · §3.7.5 #1 (tablet green) · §3.3.3 #1 |
| INC05 | `pi.hung { host: 'pi-wall-e' }`; after the check flips WALL-E, the director clears it (revert = power cycle) and opens the ticket once the Pi is RUNNING with 20–50 s to the next check | none (director-timed) | §3.3.1 schedule · §3.2.1 recovery · §6.3 |
| INC05-B | `orca.setStatus { robot: 'baymax', status: 'OFFLINE', by: 'jared' }`; `pi.off { host: 'pi-baymax' }` | immediate | §3.3.2 `baymax  SKIPPED (Offline)` |
| INC06 | `orca.setStatus { robot: 'eve', status: 'RESERVED', by: 'riley' }`; `pi.hung` or `pi.off { host: 'pi-eve' }` (director's choice) | immediate | §3.2.1 Reserved rule · §3.3.2 `RESERVED — not overridden` |
| INC07 | `orca.setStatus { robot: 'baymax', status: 'OFFLINE', by: 'jared', atMs: -1_800_000 }`; `rig.rebuild { rig: 'baymax' }`; `orca.statusOverride { robot: 'baymax', status: 'AVAILABLE', by: 'alex' }` | pipeline (PL3) or healthCheck | §3.4.2 · §3.3.3 #1 · §3.7.1 motion fault · §3.15.1 |
| INC08 | `camera.sharedHostDown { host: 'pi-cam-rackb' }` (B `camera.usbUnplugged`) | pipeline (PL5) | §3.19.4 evidence capture · §2.11.1 · §3.14.1 journal |
| INC09 | `orca.urlWrong { robot: 'r2-d2', field: 'camera', value: 'http://10.42.10.11:8081/stream.mjpg' }` | pipeline (PL7) | §3.12.1 #3 (Orca's URL) · §3.12.2 · §2.11.1 |
| INC10 | `ollama.down` | pipeline (`Java/vision-poc-receipt-check`) | §3.21.2 · §3.14.4 |
| INC11 | `rig.lockReleased { rig: 'wall-e' }` | pipeline (PL1/PL3) | §3.7.2 · §3.7.4 · §3.7.5 · §3.5.2 #8 |
| INC12 | `rig.testRunning { rig: 'wall-e', number: 4127, durationMs: 60000 }` (B + `rig.lockReleased { rig: 'wall-e' }` — the build then fails at its next tap; the right move is still to wait, then Park All) | immediate | §3.7.6 lockout · §3.18 |
| INC13 | A `rig.steppersDisabled { rig: 'bumblebee' }`; B `rig.motorOff { rig: 'bumblebee' }` | pipeline (PL4) | §3.7.1 · §3.7.7 · §3.5.2 #8 |
| INC14 | `orca.offsets { robot: 'bumblebee', yMm: 1.5 }` | pipeline (PL4) | §3.5.2 #5 · §3.5.4 (Charge core 1.2) |
| INC15 | `rig.solenoidLoose { rig: 'eve' }` | pipeline (PL1) | §3.5.4 no contact · §3.19.3 |
| INC16 | `rig.dipArmMisaligned { rig: 'seti' }` | pipeline (PL5) | §3.6 #10 · §3.7.1 Dip |
| INC17 | `device.unpowered { device: 'dev-eve-flex4' }`; `power.plug { load: 'desk-fan', kind: 'ac-strip', target: 'STRIP-A', socket: 6 }` | pipeline (PL1 FLEX_4) | §3.8.1 · §3.13.3 · §3.15.1 |
| INC18 | A `collis.unpowered { probe: 'collis-wall-e' }`; B `collis.ribbonUnseated { probe: 'collis-wall-e' }` | pipeline (PL3) | §3.16 · §3.6 #5 · §3.14.2 `/status` |
| INC19 | `rig.motionOnNuc { rig: 'bumblebee', host: 'nuc-03' }` (NUC-03 full at factory) | healthCheck | §3.3.3 #5 · §3.14.3 · §2.5.3 `controller.yaml` · §3.24 `rig.moveMotorUsb` |
| INC20 | `orca.screenLocationShift { deviceTypes: ['FLEX_3','MINI_3','STATION_2018'] }` | pipeline (PL3) | §3.10 · §3.5.4 · §3.20.3 · §3.22.2–§3.22.3 |
| INC21 | `orca.missingReceiptMap { deviceType: 'STATION_2018' }` | pipeline (PL3 on baymax) | §3.5.2 #4 · §3.10. *Deviation:* PL3's test reaches `select print` first, so the sim prints `no Screen Location for (STATION_2018, RECEIPT_OPTIONS_5, "Print")` and `FAILED at "select print"`; GP's `"Email"` / `select email` appear only for an email-receipt test |
| INC22 | `orca.screenLocationTypo { deviceType: 'FLEX_1', button: 'Print', yMm: 62.5 }` | pipeline (PL3 on johnny-5) | §3.5.4 · §3.20.3 |
| INC23 | `gort.capabilityDropped { key: 'printer' }` | pipeline (PL6) | §3.4.2 #6 (LRU → VISION) · §3.4.3 · §3.21.1 |
| INC24 | `pigeon.screenCompareEmpty`; `device.stage { device: 'dev-eve-flex4', stage: 'approved' }` | immediate | §3.20.3 screenCompare · §2.10.2 APPROVED rect · §3.15.1 screencap. *Deviation:* GP's `388, 512` example is superseded by the factory truth `208, 512, 304, 40` |
| INC25 | `pigeon.missingComma { path: 'tests/sale/tip_sale_print.json', line: 8 }` | pipeline (`Java/pigeon-android-tip-sale`) | §3.20.1 · §3.22.1 history |
| INC26 | `jenkins.jobMoved { job: 'Java/pigeon-windows-tender', toFolder: 'iOS' }` | immediate | §3.18.1 views/nightly |
| INC27 | `repo.clone { repo: 'uia-remote' }`; `config.write { fixture: 'target', robot: 'bumblebee' }`; `config.port5555`; `runner.startLocal { test: 'SaleTest' }` | immediate | §3.15.3 · §3.19.1–§3.19.2 · §3.15.1 coworker events |
| INC28 | `device.provision { device: 'dev-data-mini3', merchant: 'AUTO-US-NOPIN-02' }`; `device.adbTcpReset { device: 'dev-data-mini3' }`; `jenkins.seedBuild { job: 'Java/laz-oobe-merchant-swap', params: { ROBOT_NAME: 'data', MERCHANT: 'AUTO-US-NOPIN-02' }, result: 'SUCCESS', robot: 'data', atMs: <now − 120 000>, by: 'riley' }` (real-run variant: `laz.skipAdbRestore` + `jenkins.startBuild` of that swap) | pipeline (PL6) | §3.8.3 · §3.15.1 · §3.17.2 |
| INC29 | `config.write { path: '~/CodeWithMe/alex/uia-remote/config.properties', fixture: 'target', robot: 'data' }`; `config.themeKernel` | immediate | §3.19.1 |
| INC30 | `orca.setStatus { robot: 'r2-d2', status: 'RESERVED', by: 'player' }`; `repo.clone`; `config.write { fixture: 'target', robot: 'r2-d2' }`; `config.value { key: 'customerFacingDeviceIp', value: '10.42.30.19' }` | immediate | §3.11 · §3.19.2 |
| INC31 | `repo.clone`; `config.write { fixture: 'target', robot: 'megatron' }` (PL2 active) | immediate | §3.4.4 collision · §3.19.4 TaxTest · §3.2.1 Reserved |
| INC32 | `uia.waitForScreenStub { class: 'RegisterHomeScreen' }` | pipeline (PL2) | §3.19.5 · §3.19.6 CF01/CF03 · §6.1 `devices` stream |
| INC33 | `orca.setStatus { robot: 'tars', status: 'RESERVED', by: 'alex' }`; `repo.clone`; `config.write { fixture: 'target', robot: 'tars' }`; `config.value { key: 'deviceType', value: 'Mini' }` | immediate | §3.19.6 CF05 · §3.8.2 launcher |
| INC34 | `github.seedPr { repo: 'uia-remote', number: 431, fixture: 'uia-431-lockscreen', author: 'alex', title: 'Add LockScreen page object' }` | immediate | §3.22.2 reviews/reasons |
| INC35 | `uia.teardownMissing { test: 'TaxTest' }`; `device.stage { device: 'dev-megatron-mfd', stage: 'register-order' }` | pipeline (PL2: `TaxTest`, `RefundTest`) | §3.19.2 setup safe state · §3.19.7 |
| INC36 | `ocr.labelShift { device: 'dev-r2-d2-duo', px: 10 }` | pipeline (PL7) | §3.12.2 worked results |
| INC37 | A `ocr.capitalisation { device: 'dev-r2-d2-duo' }`; B `ocr.typo { compare: 'CFD_TOTAL' }` | pipeline (PL7) | §3.12.1 #6 exact match |
| INC38 | — (factory: `DuoCheckoutTest` still uses `CFD_THANK_YOU`) | immediate (planned work) | §3.19.4 · §3.19.6 CF07/CF08 · §3.22.2 · §2.11.2 `usedBy` |
| INC39 | `jenkins.envCase { job: 'Java/uia-remote-regression-flex', value: 'flex_3' }` (variants `Flex_3`, `flex_4`, `FLEX3`; PL4 `mini_3`) | pipeline (PL1) | §3.4.2 #3 · §3.18.2 `params.NAME` as typed |
| INC40 | `orca.statusOverride { robot: 'rosie', status: 'AVAILABLE', by: 'alex' }`; `merchant.overwritten { robot: 'rosie' }`; `jenkins.seedBuild { job: 'Java/uia-remote-regression-flex', params: { DEVICE_TYPE: 'FLEX_POCKET' }, result: 'SUCCESS', robot: 'rosie', by: 'riley', atMs: <now − 300 000> }` (real-run variant: status override + Riley's real build) | pipeline (PL8) | §3.17.1 merchant policy · §3.4.5 · §3.2.2 |
| INC41 | `jenkins.startBuild { job: 'Java/paycore-standalone-matrix', params: { ROBOT_NAME: '' }, by: 'sam' }` (B `ROBOT_NAME: 'ROSIE'`) | pipeline | §3.4.2 #5–#6 (`ONLY_UNAVAILABLE` / `ROBOT_NOT_FOUND`) · §3.4.5 auto-reset |
| INC42 | — (factory spare `dev-spare-flex2` in Husky drawer 2) | immediate (planned work) | §3.24 swap · §1.15 serial binding · §1.3.3 |
| INC43 | INC42's end state: `device.swap { rig: 'johnny-5', deviceId: 'dev-spare-flex2' }`; `orca.createDevice { name: 'johnny-5-flex2', deviceType: 'FLEX_2', serial: 'SIM-F2-000015', ip: '10.42.30.15' }`; `orca.linkDevice { robot: 'johnny-5', device: 'johnny-5-flex2' }` | immediate | as INC42 |
| INC44 | `device.dead { device: 'dev-k-9-duo2' }` | pipeline (`Java/uia-remote-printerless-smoke`) | §3.8.1 · §2.2 hot-swap · §3.4.2 #3 |
| INC45 | `orca.tetherCleared { robot: 'optimus' }`; `jenkins.startBuild { job: 'Java/uia-remote-tethered-tax', params: { ROBOT_NAME: 'optimus', BACKEND_ENV: 'STG' } }` | pipeline | §3.19.2 guard · §3.18.3 #4 (`tethered` not re-checked) · unnamed STG runs show `NO_MATCH` meanwhile |
| INC46 | `orca.tetherCloned { robot: 'tars', from: 'optimus' }` | pipeline (PL6) | §3.19.2 handle lines (shared runner harness, prefix `[runner]`) · §3.21.1 |
| INC47 | A `tether.linkDown { robot: 'megatron', cable: 'usb' }`; B `tether.linkDown { robot: 'optimus', cable: 'ethernet' }` | pipeline (PL2) | §3.8.6 · §3.19.4. *Deviation:* GP's default rig OPTIMUS runs Secure Network Pay Display in this roster, so variant A (USB) binds MEGATRON |
| INC48 | `orca.staleReservation { robot: 'eve', by: 'riley' }` | pipeline (PL1 FLEX_4) | §3.4.2 #6 waiting · §3.2.1 |
| INC49 | `jenkins.capsConflict { job: 'Java/contact-canada-pin-sale', value: 'MINI_3' }` | pipeline (PL5) | §3.4.2 #4 · §3.18.2 |
| INC50 | `merchant.ubiRouteWrong { merchant: 'WESTERS-CA-02', route: 'us-east' }`; `jenkins.startBuild { job: 'Java/laz-oobe-merchant-swap', params: { ROBOT_NAME: 'seti', MERCHANT: 'WESTERS-CA-02' } }` | pipeline | §3.17.2–§3.17.3 |
| INC51 | `merchant.credentialBlank { merchant: 'GO-SDK-US-01', field: 'apiKey' }` | pipeline (PL6) | §3.18.4 masking · §3.21.1 |
| INC52 | `jenkins.namedRobot { job: 'Java/contact-canada-pin-sale', robot: 'tars' }` | pipeline (PL5) | §3.18.3 #4 · §3.8.4 Secure Touch |
| INC53 | `card.gortPathWrong { profile: 'VISA_STD_DIP' }`; `jenkins.startBuild { job: 'Java/uia-remote-regression-flex', params: { ROBOT_NAME: 'wall-e', CARD_PROFILE: 'VISA_STD_DIP' } }` | pipeline | §3.6 #6 · §3.14.6 |
| INC54 | `callus.syncStale { host: 'minix-02' }`; `jenkins.startBuild { job: 'Java/contact-canada-pin-sale', params: { CARD_PROFILE: 'INTERAC_CA_TAP' } }` | pipeline | §3.6 #6 · §3.14.6 schtasks · §2.9 |
| INC55 | `card.trackDataCorrupt { profile: 'VISA_STD_SWIPE' }` | pipeline (PL3) | §3.6 track validation |
| INC56 | `pi.wineBroken { host: 'pi-johnny-5' }`; `jenkins.startBuild { job: 'Java/uia-remote-regression-flex', params: { ROBOT_NAME: 'johnny-5', DEVICE_TYPE: 'FLEX_1', CARD_PROFILE: 'VISA_STD_DIP' } }` | pipeline | §3.6 #6 cardprog · §3.14.1 |
| INC57 | A `ollama.seedReceipt { imageRef: 'img:receipt:wall-e:0912', subtotalCents: 4200, tipPct: 18, printedTipCents: 756, misreadField: 'tip', misreadAs: '$7.65' }`; B the same with `printedTipCents: 765` and no misread; `jenkins.seedBuild { job: 'Java/vision-poc-receipt-check', result: 'UNSTABLE', … }` | immediate | §3.21.2 · §3.9.2 maths |
| INC58, INC61, INC62 | — (judgement; no sim state) | immediate | — |
| INC59 | `rig.cradleCracked { rig: 'eve' }` | pipeline (PL1 FLEX_4) | §3.5.4 tilt · §3.24 printers/cradle |
| INC60 | `orca.mysqlDown` | pipeline (any) | §3.14.5 · §3.4.2 #1 |
| INC63 | `orca.hrnTypo { robot: 'johnny-5' }` | immediate | §3.7.5 `hrnShown` |
| INC64 | `device.stage { device: 'dev-r2-d2-duo', stage: 'receipt-done' }` | immediate | §3.11 · §3.5.3 · §3.9.5 |
| INC65 | `orca.urlWrong { robot: 'johnny-5', field: 'tap', value: '' }`; `jenkins.startBuild { job: 'Java/uia-remote-regression-flex', params: { ROBOT_NAME: 'johnny-5', DEVICE_TYPE: 'FLEX_1', CARD_PROFILE: 'VISA_STD_TAP' } }` | pipeline | §3.6 #3 |

### A.2 Curriculum modules → sim affordances

| Module | Setup (§4.4.2) | API / state the lesson's interactions and success conditions use | Sections |
|---|---|---|---|
| M01 | `rig.testRunning` (#4120) | `rig.command(park.all)` → `LOCKED`; `rigs.wall-e.dashboardLocked`, `tablet.hrnShown`, `banner` | §3.7.5–§3.7.6 · §3.18 |
| M02 | — | (props only; tethered labels from `rigs`/`devices`) | §2.2 · §2.3 |
| M03 | `fuse.blown`, two spare loads | `power.measure` (V / Ω), `power.toggleRegulator`, `power.removeFuse` / `insertFuse` / `replaceFuse`, `power.plug` (AC vs DC → `power.spark`, academy no damage) | §2.6 · §3.13 |
| M04 | — | `rig.command` (every tablet group), `rig.setDoor`, `rig.dragCarriage` (≥ 20 mm), `gantry`, `magneticLock`, `banner` | §3.7 |
| M05 | — | `terminal.exec` (`ssh`, `uname -a`, `systemctl status robot-controller`, `df -h /`, `ps aux \| grep -i wine`, `curl -i …/health`) | §2.5 · §3.14.1 · §3.3.3 |
| M06 | — | `orca.setRobotStatus`, `orca.forceHealthCheck`, `power.unplug('pi-eve')`, `orca.checkout({ kind: 'manual' })` toast, `jenkins.build` (Reserved wait; named ROSIE + auto-reset), health log | §3.2–§3.4 · §3.3.4 |
| M07 | HRN, swap, Tap URL, tether, offsets | `orca.saveRobot`, `orca.saveDevice` (serial binding), `orca.xyTouch` (**Test tap**), tablet header | §1.3 · §3.5 · §3.7.5 |
| M08 | API Key blank, printer capability dropped | capability document + `orca.matchPreview`, `git.writeFile/commit/push` (gort JSON), `orca.saveMerchant` (Edit), `jenkins.build` (go-sdk, Laz) and the DATA wizard pages. *Deviation:* Cur step 5's "no longer lists `rosie`" is `vision` here (the GO_SDK Flex Pocket; ROSIE is a PayCore rig without `goSdk`) | §2.7 · §3.4.3 · §3.17 · §3.18.4 |
| M09 | QR rollout on EVE, no FLEX_4 `_5` map | `orca.rest('POST /api/xy_touch')` via curl (PHYSICAL_TAP vs ADB_TOUCH), `device.layout` (ruler reading = firmware centre), Orca Screens CRUD, `github` PR + Jared merge + sync, `jenkins.build` contact-canada (`PIN entry requires physical touch` / `capability mismatch: deviceType COMPACT required`) | §2.10 · §3.5 · §3.10 · §3.22 |
| M10 | — | Card Profiles read, gort file browse, `terminal.exec` (`schtasks /query`, `dir`), `orca.rest('POST /api/card/dip')`, Callus log | §2.9 · §3.6 · §3.14.6 |
| M11 | `jenkins.envCase` | `jenkins.build` / Build with Parameters, env block, `Available · in use by Jenkins #4127` | §3.18 · §3.4 |
| M12 | — | `terminal.exec` (`adb connect/devices/-s … shell uiautomator dump/pull/input tap`, `grep -o`) | §3.15 |
| M13 | scroll swapped, ReceiptScreen methods missing | `git.clone`, `git.writeFile`, `runner.runLocal` (`HomeScreenTest`, `ReceiptScreenTest` ×3), code facts | §3.19.5–§3.19.6 |
| M14 | clone + broken config + coworker known | `git.writeFile` (config.properties), `runner.runLocal('TaxTest')`, `adb.coworkerDriven`, `orca.setRobotStatus` (Reserved/Available) | §3.15.3 · §3.19 |
| M15 | #418 un-merged, expanded Pigeon file, comma | `jenkins.build`, git edit/push, camera playback of the build, `git.approvePullRequest` → NPC merge → sync | §3.20 · §3.22 |
| M16 | #398 un-merged, CFD_TOTAL deleted, R2-D2 staged | `terminal.exec` adb on the Duo, `camera.snapshot`, `ocr.frame` (GIMP), Screen Compare CRUD + **Test**, `setFlag('cfdLayoutV2Toggle')`, `runner.runLocal('TaxTestDuo')` | §3.11 · §3.12 · §2.11 |
| M17 | PR #212 re-opened | `ollama.ask` (llava, receipt image), `git.requestChanges` with reason `missing-isScreenPresent` | §3.21.2 · §3.22.2 |
| M18 | capstone faults at steps 8–10 | Notes, escalation (missions), `rig.command(park.all)`, `jenkins.build` | as INC02 / INC11 / INC39 |
| CERT | §4.4.3 | as the incidents/modules they mirror | — |

---

## Appendix B — How the sim differs from the real lab

The Field Manual shows this list (chapter "How the sim differs") and badges every [illus.] string it
displays as **Illustrative (sim only)**.

### B.1 Simplifications [sim]

| # | Where | Simplification |
|---|---|---|
| B1 | §0.3 | Two clocks; health checks follow the (possibly accelerated) game clock while physical processes run in real seconds. |
| B2 | §3.3.2 | A health-check ping is evaluated instantly against the current state; a timeout is written at the request time although it "takes" 10 s. All robots are pinged in one instant. |
| B3 | §3.3.1 | A fast-forward that crosses several 5-minute marks runs one check per mark against the same state. |
| B4 | §1.9 | Networking is a reachability rule (host up, cable, switch, listening port) with fixed latencies; no packet loss except the deterministic every-other-attempt rule for a damaged cable. |
| B5 | §3.5.4 | Probe taps hit only inside a small "core" around the button centre (`clamp(0.1·min(w,h), 1.0, 2.5)` mm); real probes are a little more forgiving. Makes mm-level drift deterministic. |
| B6 | §3.5.2 | Orca's xy_touch response is computed when the request is accepted; it is delivered after the motion time. A fault arising mid-move does not change the already-computed 200. |
| B7 | §3.7 | Gantry motion is linear at fixed speeds (120 mm/s, homing 60 mm/s) with both axes simultaneous; no acceleration, no missed steps. |
| B8 | §3.13 | Power is a solved DC/AC graph with ideal sources, linear regulator droop and an I²t-style fuse stress model; brown-outs below 4.63 V reboot Pis after 100 ms. |
| B9 | §3.13.3 | Arcade damage: a 24 V short makes MW-1 hiccup but regulator hold-up keeps the Pis up (only the `full` model drops them). Academy damage never changes state. |
| B10 | §3.14.1 | A hung Pi is cleared only by a power interruption ≥ one 50 ms sub-step; `sudo reboot` is not possible (ssh is dead). |
| B11 | §2.5.2 | Boot and service start-up times are fixed (Pi 40 s, Windows 50 s, VM 45 s, LabSim 30 s). |
| B12 | §3.9 | The LabSim UI is a state machine of the screens automation uses; other apps are read-only screens; transaction timings are fixed; auth codes are `SIM` + 3 digits; card processing never talks to a real backend. |
| B13 | §3.9.2 | Tax is rounded once per order, half up. |
| B14 | §3.12.2 | Tesseract is a deterministic rule set (character clipping by box overlap, a small confusion table for clipped glyphs, fixed confidences). |
| B15 | §2.11.1 | Cameras map screen mm to frame px linearly (no perspective, lens distortion, glare or exposure). |
| B16 | §3.19.5 | Screen render time is drawn from a two-mode distribution; a page object's first interaction happens at a fixed +700 ms when `waitForScreen()` is missing. |
| B17 | §3.19.6 | Source code is evaluated by regex-level "code facts", not compiled; only the listed facts change behaviour. |
| B18 | §3.4.4 | When a local run and a Jenkins build drive the same device, the first screen change by one makes the other's next wait fail. |
| B19 | §3.17 | Laz OOBE steps have fixed durations (≈ 53 s); Ubi resolves a merchant by a route/region table. |
| B20 | §3.14.6 | GortCardSync mirrors `cards/**` from gort `main` exactly (additions and deletions) in 20 s. |
| B21 | §3.14.3 | The corporate agent writes 0.011 GB/s on NUC-03 and is restored by policy 30 s after tampering. |
| B22 | §3.21.2 | Ollama answers with templated sentences computed from the receipt's numbers; a "misread" is a seeded scenario, not model behaviour. |
| B23 | §3.22.2 | Reviewers are scripted: Jared checks coordinates to ±0.5 mm, Morgan checks the listed code facts, Tate never merges; each acts 20 s after a PR opens or updates. |
| B24 | §3.18 | Jenkins stages have fixed durations; executors are 8; no agents, no workspace cleanup, no plugin behaviour beyond what is described. |
| B25 | §3.15 | `adb` is the subset of commands in §3.15.1; one ADB server on the workstation; adbd on a device listens on exactly one TCP port. |
| B26 | §4.4.1 | `device.stage` drives a device to a screen instantly, and the `approved` stage is held until the next input (a real terminal advances after 2 s). |
| B27 | §6.1 | Randomness (render times, latencies, auth codes, NPC delays) comes from seeded streams, so the same seed and inputs replay identically. |
| B28 | §3.18.3 #4 | A named run does not re-check `tethered` before the tests; the test's own guard reports it. |

### B.2 Inventions [illus.] (the reference is silent)

| Group | Invented details (all consistent with canon and the reference) |
|---|---|
| Network | Every IP and hostname (canon), ports other than ADB 5444/5555, the lab switch, latencies. |
| REST | Pi endpoints (`/health`, `/status`, `/adb`, `/dip`, `/tap`, `/swipe`, `/touch`, `/motion`, `/cardprog`, `/ocr`), Callus endpoints, Orca paths beyond JHipster conventions (`/api/xy_touch`, `/api/card/*`, `/api/match-preview`, `/api/health-check/run`, `/api/screen-compare/{name}/test`), every status code and JSON body. |
| Strings | Notes formats, health-log lines, every console line and prefix, systemd/journal lines and PIDs, error messages (`LOCK_RELEASED`, `STEPPERS_DISABLED`, `MOTOR_POWER_LOST`, …), tablet header texts beyond the photo, toasts. |
| Hardware | Screen sizes/resolutions/px-per-mm of every model, layouts and button coordinates, the 3.0 mm QR shift, cradle tilt, travel limits, speeds, solenoid stroke times, fuse ratings and labels, regulator ratings and topology ids, load currents, SmartStripe probe role, battery behaviour. |
| Orca data | 42-rig roster beyond the reference's examples, environments, device rows and serials, merchants and their fields (`region`, `cardAdjustBp`, `qrReceiptsEnabled`, signature thresholds, `ubiRoute`), capability keys, Screen Compare rows, card PANs (standard test numbers), Interac test PIN `1234`, Track Data. |
| Software | Job names, parameters, Jenkinsfile lines, stage names and durations, runner versions (`uia-remote 4.2.0`), page-object class names, test names, code facts, fixtures, commit shas and history, PR numbers, Pigeon schema details, LSTR error texts, Go SDK messages, Laz/Ubi console lines, Ollama prompts/answers, Wine paths, `controller.yaml`, the Code With Me folder. |
| People & time | NPC names beyond canon (Riley, Sam, Alex), review delays, reply timings, the calendar (2026-10-05), shift start times, firmware version strings. |

---

## Appendix C — Reconciliation with `30-world.md`

`30-world.md` (written in parallel) makes world-side decisions that differ from this document. **State,
ids and behaviour are owned here** (this doc's header); the world binds its prop ids to sim ids through
`PROP_ALIASES` / a binder table and renders what the sim says. Differences the binders must map:

| Topic | `30-world.md` | This doc (authoritative for state) | Resolution |
|---|---|---|---|
| Power ids | `power.psu.mw-1` (also `meanwell-1` in an example), `power.reg.5v-a/-b/-c`, `power.reg.12v`, fuses `F-5V-A/B/C`, `F-12V`, per-bay `F-<RIG>-5V`, taps `power.tap.24v/12v/5v`, outlets `W1…W14`, strips `power.strip.a/b/c1/c2/t/d/w` | `MW-1`, `REG-5V-A`, `REG-5V-B`, `REG-5V-BENCH`, `REG-12V`, `F-RACKA-5V`, `F-RACKB-5V`, `F-BENCH-5V`, `F-NUC-12V`, terminals `T-24V-SPARE`, `T-24V-CALLUS`, `T-12V-SPARE`, `T-5V-SPARE`, `MAIN-<rig>`, outlets `WALL-1…6`, strips `STRIP-A/B/C/T/W` | world props carry a `simId`; per-bay fuses are decorative (not in the power graph) until the sim adds them; `power.tap.*` map to `T-24V-SPARE` / `T-12V-SPARE` / `T-5V-SPARE` |
| Screen geometry | layout classes P (68.0 × 136.0), P-s, L8, L14 with derived centres | §2.2 per-type sizes (FLEX_3 76.0 × 135.0 …) and §2.10.2 per-layout button tables | the sim's `src/sim/seed/layouts` is the only truth for hit tests and Orca seeds; render2d draws from it (ARCHITECTURE rule 6). The world's §4 tables are art guidance only. |
| Orca screen buttons | e.g. `REGISTER_HOME` `Coffee`, `Bagel`, `No-Tax Item`, `Gift Card`; `PIN_ENTRY` `OK` | §2.10.1–§2.10.2 (`Tax Item 5`, `Non-Tax Item 1`, `Coffee`, `Catering Deposit`; PIN `Enter`) | sim wins (exact strings used by xy_touch, runners and GP evidence) |
| Tablet texts | `OK`, `NOT HOMED — PARK REQUIRED`, `Controller unreachable`, `FAULT — <reason>` | `Status: OK`, `Status: LOCK RELEASED — PARK REQUIRED` (all yellow causes, Cur S13), `Status: CONTROLLER UNREACHABLE`, `Status: MOTION FAULT — <fault>` | sim wins (Cur/GP exact strings); the lockout overlay's second line `<job> #<n>` is fine (render from `robot.checkout`) |
| API names | `rig.setDipAlignment(id, teeth)`, `rig.moveMotionCable(id, 'pi')`, `rig.reseat(id, 'solenoid' \| 'smartstripe')`, `rig.aimWebcam`, `device.reseatHub`, `host.powerCycle('blade')` | `rig.alignDipArm(id, deltaTeeth)`, `rig.moveMotorUsb(id, 'PI' \| hostId)`, `rig.reseat(id, part)` (accepts `'solenoid'` = `'solenoidConnector'`, `'smartstripe'`), `rig.aimWebcam(id, dYawDeg, dPitchDeg)`, `device.reseatHub(id, port)`, host id `gpu-blade` | `api.ts` names are authoritative |
| Receipt | `123 LAB WAY · TEST CITY`, `AUTH A1B2C3`, `VISA **** 1111` | §3.9.7 (`100 Automation Way, Lab 4`, `Auth SIM042`, `VISA •••• 1111`) | sim's `lastReceipt` text is printed verbatim |
| Cameras | per-bay webcams, Rack B mosaic of four webcams, bench mosaic | §2.11.1 camera views (one capture per camera host) | the frame model is the sim's; the world may show four webcams on Rack B wired to `pi-cam-rackb` |
| Off-roster boxes | `NUC-01`, `EVE MOTION` cable (legacy-nuc-motion role) | INC19 binds BUMBLEBEE → `nuc-03` (`BUMBLEBEE MOTION`) | sim roster wins; the world shows the cable on the rig named by `rig.motionHost` |

