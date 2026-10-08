/**
 * SimApi — the ONLY way the world, the workstation apps, the HUD and the mission runtime change
 * the simulation. Reads go straight to the store (`store.getState().lab` / `useGame(s => s.lab…)`);
 * a few pure read helpers here (layouts, capability documents, frame models) compute derived views.
 *
 * Every mutating method runs inside `transact()`, validates input like the real system would, mutates
 * `LabState`, emits the domain events in `./events.ts`, and returns a plain result object.
 * Methods never throw for user mistakes — they return `{ ok: false, error }` with the exact message
 * the real tool would show (Orca validation text, git error, Jenkins error, …; Sim §3).
 *
 * Contract source: docs/design/40-simulation.md ("Sim"). Implementation: `./impl/` (sim-core) and
 * `./devops/` (sim-devops); the split is documented at the top of `./impl/index.ts`.
 * Existing members were never renamed; where Sim names a method differently, both exist and the doc
 * comment says which is authoritative.
 */
import type {
  CapabilityDocument,
  CardEntry,
  CardProfile,
  TerminalDevice,
  DeviceTypeCode,
  FailureCode,
  FaultParamValue,
  GitRepo,
  JenkinsBuild,
  JenkinsJob,
  JobParam,
  LabState,
  MerchantConfig,
  OrcaDevice,
  OrcaRobot,
  OrcaScreen,
  PowerHookup,
  RepoId,
  RigPart,
  RigState,
  RobotCapability,
  RobotStatus,
  ScreenCompareImage,
  ScreenLocation,
  SimConfig,
} from './types';
import type { RigCommandName } from './events';

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/** Who performed an action — shown in Orca audits/notes and used by missions. People use team keys ("riley"). */
export type Actor = 'player' | 'jenkins' | 'orca-health-check' | 'system' | 'mentor' | string;

export interface RestResponse {
  status: number;
  /** Response body as text (JSON compact, exactly as Sim §3.23 writes it). */
  body: string;
  headers?: Record<string, string>;
  /** Simulated latency in ms (physical; for curl -v / timeouts). Async Orca calls answer after the motion time. */
  latencyMs: number;
}

export interface TerminalLine {
  text: string;
  /** Styling hint for the terminal UI. */
  kind?: 'out' | 'err' | 'prompt' | 'info' | 'success' | 'muted';
}

export interface TerminalResult {
  lines: TerminalLine[];
  exitCode: number;
  /** The terminal UI should clear its scrollback (e.g. `clear`). */
  clear?: boolean;
  /** Prompt to show for the next line, e.g. "engineer@ws-17:~/IdeaProjects/uia-remote$ " or "pi@wall-e:~ $ ". */
  prompt: string;
  /** If set, the command keeps producing output over time; poll `terminal.poll(jobId)`. */
  streamingJobId?: string;
}

/** Options of `orca.xyTouch` (NEW). */
export interface XyTouchOptions {
  /** Tethered pairs: which device ("MFD"/"CFD"); default by screen name prefix CFD_ (Sim §3.5.2 #3). */
  target?: 'MFD' | 'CFD';
}

export interface XyTouchResult {
  robotName: string;
  screen: string;
  button: string;
  /** Final coordinate after applying legacy offsets (mm, one decimal). */
  xMm: number;
  yMm: number;
  /** Legacy short mode. `orcaMode` is authoritative. */
  mode: 'adb' | 'probe';
  /**
   * The button hit on the device's firmware layout, if already known (ADB_TOUCH: known at injection;
   * PHYSICAL_TAP: null here — the `orca.xyTouch` event carries it when the stroke completes).
   * Orca's REST response never says whether a button was hit (Sim §3.5.2 #8).
   */
  hitButton: string | null;
  /** NEW — "req-<seq.request>"; correlates with the `orca.xyTouch` event and rig commands (`ref`). */
  requestId: string;
  /** NEW — 'PHYSICAL_TAP' | 'ADB_TOUCH' (authoritative). */
  orcaMode: 'PHYSICAL_TAP' | 'ADB_TOUCH';
  /** NEW — 200. */
  status: number;
  /** NEW — exact JSON body, e.g. {"result":"OK","mode":"PHYSICAL_TAP","x_mm":22.0,"y_mm":58.5}. */
  body: string;
  /** NEW — physical ms until Orca answers (move time + 200 ms for PHYSICAL_TAP; 120 ms for ADB_TOUCH). */
  respondsAfterMs: number;
  /** NEW — device display actually targeted. */
  deviceId: string;
  display: 'primary' | 'secondary';
}

export interface CheckoutRequest {
  buildId: string;
  jobId: string;
  /** ROBOT_NAME param (trimmed); '' or absent = unnamed. Exact, case-sensitive Name required for UNAVAILABLE rigs. */
  robotName?: string;
  /** Raw DEVICE_TYPE value as typed (validated by `DeviceType.valueOf`, Sim §3.4.2 #3). Widened from DeviceTypeCode. */
  deviceType?: DeviceTypeCode | string;
  /**
   * NON_DYNAMIC capability map parsed from the job script (authoritative form: Record), or the legacy
   * list of RobotCapability names (each treated as `{ <key>: true }`).
   */
  capabilities?: string[] | Record<string, string | boolean>;
  /** DYNAMIC_JSON "capabilities" object text from the test definition. */
  dynamicCapabilitiesJson?: string;
  /** Legacy hint; ignored by v2 matching (tethered is a derived capability key). */
  tethered?: boolean;
  /** NEW — BACKEND_ENV (default "DEV1"). */
  environment?: string;
  /** NEW — Jenkins build or Orca UI "Check out" button (default 'jenkins'). Manual errors are the UI toast texts. */
  kind?: 'jenkins' | 'manual';
  /** NEW — file name of the dynamic source, for the `[orca] capabilities: … (dynamic: <file>)` line. */
  dynamicSource?: string;
}

/** NEW — detailed checkout result (used by Jenkins through CoreServices; Sim §3.4.2). */
export type CheckoutOutcome =
  | { kind: 'ok'; robotId: number; robotName: string; byName: boolean; lines: string[] }
  | { kind: 'wait'; label: string; reasons: string[]; lines: string[] }
  | { kind: 'fail'; code: FailureCode; lines: string[] };

/** NEW — one row of Orca's Match preview (Sim §3.4.3). */
export interface MatchPreviewRow {
  robotId: number;
  robot: string;
  status: RobotStatus;
  environment: string;
  matches: boolean;
  /** First failing key, e.g. "printer: required true, robot false"; null when matching. */
  firstMismatch: string | null;
}

/** NEW — result of a card action (`/api/card/*`, Sim §3.6). On failure the Result error is the console lines joined by "\n", last line failing. */
export interface CardActionResult {
  entry: CardEntry;
  profile: string;
  probe: string;
  /** "10.42.20.1:9000" */
  callus: string;
  /** Console lines produced (`[callus] …`, `[pi] cardprog …`). */
  lines: string[];
  /** Armed for the payment prompt instead of firing (Sim §3.6 #9). */
  armed: boolean;
  /** Physical ms until Orca answers (after the load). */
  respondsAfterMs: number;
  /** Exact JSON body. */
  body: string;
}

/** NEW — multimeter reading (extends the legacy `{ volts, kind, label }`). */
export interface MultimeterReading {
  /** Volts (0 in Ω mode). */
  volts: number;
  kind: 'DC' | 'AC' | 'OHM';
  label: string;
  /** NEW — LCD text exactly: "24.1 V DC", "5.08 V DC", "0.00 V DC", "119.6 V AC", "0.1 Ω", "OL", "ERR". */
  display: string;
  /** NEW */
  mode: 'V' | 'OHM';
  /** NEW — Ω value; null for OL/ERR or V mode. */
  ohms: number | null;
  /** NEW — the point is energised (Ω on a live point = ERR, GW21). */
  live: boolean;
}

/** NEW — a firmware button / label of a device's current screen (Sim §2.10.2). Pure read. */
export interface LayoutButton {
  /** Button string ("Print") or label text ("TOTAL $10.83"). */
  id: string;
  kind: 'button' | 'label' | 'pad' | 'qr';
  /** Centre and size in screen mm. */
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  /** clamp(0.1·min(w,h), 1.0, 2.5) — the probe acceptance half-width (Sim §3.5.4). */
  coreMm: number;
  enabled: boolean;
  visible: boolean;
}

/** NEW — frame model of a webcam frame or screencap (Sim §3.12.1 #4). Pure read; GIMP and render2d draw from it. */
export interface FrameModel {
  imageRef: string;
  source: 'webcam' | 'screencap' | 'receipt';
  widthPx: number;
  heightPx: number;
  /** Text rectangles in px (after camera mapping, label shift and misaim). */
  labels: { text: string; x: number; y: number; w: number; h: number; deviceId: string | null; display: 'primary' | 'secondary' | null }[];
  /** Phys ms the frame was captured (frozen images) or null for a live frame. */
  capturedPhysMs: number | null;
}

/** NEW — Camera app stream probe. */
export type CameraProbeResult =
  | { ok: true; cameraId: string; url: string; frameRef: string }
  | { ok: false; url: string; error: string /* "Stream unavailable — <url>" */ };

export interface FaultSpec {
  faultId: string;
  /** Values may be '@random' for enumerated params (Sim §4.1.3). Lists for e.g. `deviceTypes`. */
  params?: Record<string, FaultParamValue>;
}

/** NEW — a setup operation (Sim §4.4). */
export interface SetupOp {
  op: string;
  params?: Record<string, FaultParamValue | Record<string, string>>;
}

/** NEW — an item of a scenario (Sim §4.5): FaultSpec has `faultId`, SetupOp has `op`. */
export type ScenarioItem = FaultSpec | SetupOp;

/** NEW — describes one fault/setup parameter. */
export interface FaultParamInfo {
  name: string;
  description: string;
  example: string;
  kind:
    | 'host'
    | 'rig'
    | 'robot'
    | 'device'
    | 'fuse'
    | 'outlet'
    | 'regulator'
    | 'probe'
    | 'merchant'
    | 'cardProfile'
    | 'deviceType'
    | 'job'
    | 'repoPath'
    | 'compare'
    | 'string'
    | 'number'
    | 'boolean'
    | 'list';
  values?: string[];
  default?: FaultParamValue;
  required: boolean;
  /** Exactly one param per fault is the target (duplicate guard), or none (target "lab"). */
  target: boolean;
}

export interface FaultInfo {
  id: string;
  title: string;
  description: string;
  /** Parameter names and descriptions (Sim §4.3). */
  params: FaultParamInfo[];
  /** Topic tags (GP §4.8.1) for spaced repetition / the debrief. */
  tags: string[];
  /** NEW */
  category: 'hosts' | 'power' | 'rigs' | 'devices' | 'cards' | 'merchants' | 'orca' | 'repos' | 'workstation' | 'jenkins';
  /** NEW — which half implements it. */
  owner: 'core' | 'devops';
  /** NEW — human-readable clear predicate ("os == 'RUNNING'", "API only"). */
  clears: string;
  /** NEW — symptoms produced by §3 systems (Field Manual / injector). */
  symptoms: string[];
  /** NEW — GP incidents, Cur modules, cert tasks, drills ("INC01", "M07", "P1-1", "DR16", "FP"). */
  usedBy: string[];
  /** NEW — listed in the Free Play Fault Injector. */
  injectable: boolean;
  /** NEW — physical ms the predicate must hold before auto-clear. */
  holdMs: number;
  /** NEW — predicate is constant false (cleared only through faults.clear). */
  apiOnly: boolean;
}

/** NEW */
export interface SetupOpInfo {
  op: string;
  description: string;
  params: FaultParamInfo[];
  owner: 'core' | 'devops';
  /** Allowed only in presets (`reset`) and scenarios (`faults.injectAll`), not via `faults.applySetup` (history rewrites, seeded builds). */
  presetOnly: boolean;
}

/** NEW — `reset()` options (Sim §6.5). */
export interface ResetOptions {
  seed?: number;
  /** factory | arcade | freeplay | cert | test | academy:M01 … academy:M18 (default factory). */
  preset?: string;
  /** Overrides the preset's start hour. */
  startHour?: number;
  /** Overrides the preset's time scale. */
  timeScale?: number;
}

/** NEW — `jenkins.saveJob` patch (Configure page). */
export interface JenkinsJobPatch {
  script?: string;
  savedParams?: Record<string, string>;
  description?: string;
  disabled?: boolean;
  params?: JobParam[];
}

/** NEW — `git.comment` input. */
export interface PrCommentInput {
  path: string | null;
  line: number | null;
  body: string;
  /** Review reason id (Sim §3.22.2). */
  reason?: string;
}

export interface SimApi {
  /* ── lifecycle ── */
  /** Advance simulated time by `dtGameMs` of GAME time (Sim §6.2); physical time = dtGameMs / timeScale. */
  tick(dtGameMs: number): void;
  /** Replace the whole lab with a fresh seeded lab and apply a preset (Sim §6.5). Never throws. */
  reset(options?: ResetOptions): void;
  /** Deep, mutable copy of the committed lab (Sim §6.4). */
  snapshot(): LabState;
  /** Validate + migrate + replace the lab (invalid input: logged, lab unchanged). See `load` for a Result. */
  restore(state: LabState): void;
  /** Allowed 1, 2, 5, 10, 30 (others snap to the nearest, Sim §6.3). */
  setTimeScale(scale: number): void;
  /** Game-clock jump to exactly the next Orca health check (it runs). Physical processes do not advance. */
  skipToNextHealthCheck(): void;
  /** Set a lab flag, including its rollout effects (Sim §3.10, §2.10.2). */
  setFlag<K extends keyof LabState['flags']>(flag: K, value: LabState['flags'][K]): void;
  /** NEW — game-clock-only jump (0 < gameMs ≤ 86 400 000), Sim §6.3. */
  fastForward(gameMs: number): void;
  /** NEW — patch SimConfig ("sim.config", Sim §1.1). */
  setConfig(patch: Partial<SimConfig>): void;
  /** NEW — load a saved lab (JSON string or object): validate, migrate, restore (Sim §6.4). */
  load(json: unknown): Result<{ migratedFrom: number | null }>;
  /** NEW — valid preset names (Sim §6.5). */
  presets(): string[];

  /* ── Orca (Orchestrator) ── */
  orca: {
    /** Create/update with JHipster-like validation; CONFIG notes per changed field (Sim §3.3.4). */
    saveRobot(robot: Partial<OrcaRobot> & { id?: number }, actor: Actor): Result<number>;
    /** Manual status change (Sim §3.2.1); CONNECTION_FAILED is rejected. */
    setRobotStatus(robotId: number, status: RobotStatus, actor: Actor, reason?: string): Result;
    reserveRobot(robotId: number, who: string): Result;
    resolveNote(robotId: number, noteId: number, actor: Actor): Result;
    /** NEW (apps D1) — Orca robot detail → Notes → Add note: a MANUAL note `<ts> <text> (<who>)` (Sim §2.3 sonny seed format). */
    addNote?(robotId: number, text: string, actor: Actor): Result<number>;
    /** Binds `simDeviceId` by exact serial (Sim §1.15). */
    saveDevice(device: Partial<OrcaDevice> & { id?: number }, actor: Actor): Result<number>;
    saveCapability(cap: Partial<RobotCapability> & { id?: number }, actor: Actor): Result<number>;
    saveMerchant(m: Partial<MerchantConfig> & { id?: number }, actor: Actor): Result<number>;
    saveScreen(s: Partial<OrcaScreen> & { id?: number }, actor: Actor): Result<number>;
    saveScreenLocation(l: Partial<ScreenLocation> & { id?: number }, actor: Actor): Result<number>;
    saveCardProfile(c: Partial<CardProfile> & { id?: number }, actor: Actor): Result<number>;
    saveScreenCompareImage(c: Partial<ScreenCompareImage> & { id?: number }, actor: Actor): Result<number>;
    deleteEntity(entity: 'robot' | 'device' | 'capability' | 'merchant' | 'screen' | 'screenLocation' | 'cardProfile' | 'screenCompareImage', id: number, actor: Actor): Result;
    /** Run the 5-minute health-check procedure immediately (missions/tests; no gate). */
    runHealthCheckNow(): void;
    /** NEW — Orca's tutorial "Force health check" button: gated by `config.forceHealthCheckAllowed` (`403 Force health check is disabled in this environment`). Authoritative name for the UI. */
    forceHealthCheck(actor: Actor): Result;
    /** Checkout (Sim §3.4.2). `kind: 'manual'` = the Orca UI button; errors are the toast texts. A waiting result is an error "waiting: <label>". */
    checkout(req: CheckoutRequest): Result<{ robotId: number }>;
    /** Release + named auto-reset (Sim §3.4.5). */
    release(robotId: number, buildId: string): Result;
    /** NEW — Match preview: capability JSON object text + environment (default "DEV1"). Pure. */
    matchPreview(capsJson: string, environment?: string): Result<MatchPreviewRow[]>;
    /** NEW — the robot's capability document in canonical key order (Sim §2.7). Pure. */
    capabilityDocument(robotId: number): CapabilityDocument | null;
    /** POST /api/xy_touch — look up mm coordinates and fire an ADB touch or a physical probe tap (Sim §3.5). Errors are the exact HTTP-style texts. */
    xyTouch(robotName: string, screen: string, button: string, actor: Actor, opts?: XyTouchOptions): Result<XyTouchResult>;
    /** Card actions via Callus → probe (Sim §3.6). Profile by id or exact name (widened). Error = console lines joined by "\n". */
    card(robotName: string, entry: CardEntry, cardProfileId: number | string, actor: Actor): Result<CardActionResult | undefined>;
    /** Simulated REST surface of Orca, the Pis, Callus, Ollama and Jenkins (Sim §3.23) — used by curl and Swagger. */
    rest(method: string, path: string, body: string | null, actor: Actor): RestResponse;
  };

  /* ── Physical rigs (status tablet / hands-on) ── */
  rig: {
    /** A tablet button. Rejected with "LOCKED" while a test is active (Sim §3.7.1). */
    command(rigId: string, command: RigCommandName, actor: Actor, args?: { xMm?: number; yMm?: number }): Result;
    /** Hand-push of the carriage. Legacy name; `dragCarriage` is authoritative (same behaviour). */
    pushHead(rigId: string, dxMm: number, dyMm: number, actor: Actor): Result;
    setSwitch(rigId: string, which: 'main' | 'motor', on: boolean, actor: Actor): Result;
    /** Re-seat the webcam USB (= `reseat(rigId, 'webcam')`). */
    reseatWebcam(rigId: string, actor: Actor): Result;
    /** NEW — drag the carriage by hand (door must be open; ≥ 20 mm breaks the lock, Sim §3.7.2). */
    dragCarriage(rigId: string, dxMm: number, dyMm: number, actor: Actor): Result<{ lockBroken: boolean; accumMm: number }>;
    /** NEW — enclosure door. */
    setDoor(rigId: string, open: boolean, actor: Actor): Result;
    /** NEW — re-seat a part (toggles LOOSE↔SEATED / plugged; Sim §3.24). */
    reseat(rigId: string, part: RigPart, actor: Actor): Result<{ seated: boolean }>;
    /** NEW — fit a printed cradle from the tray (needs the part; cradle 'NEW', homed false). */
    replaceCradle(rigId: string, actor: Actor): Result;
    /** NEW — rotate the dip arm by gear teeth with the hub bolts loose (steppers disabled or MOTOR off, else "The arm is held by its stepper"). */
    alignDipArm(rigId: string, deltaTeeth: number, actor: Actor): Result<{ toothOffset: number }>;
    /** NEW — move the 25-pin motor PCB USB to the rig Pi ('PI') or a host id (INC19). */
    moveMotorUsb(rigId: string, target: 'PI' | string, actor: Actor): Result;
    /** NEW — adjust the webcam aim by degrees (Sim §1.15). */
    aimWebcam(rigId: string, dYawDeg: number, dPitchDeg: number, actor: Actor): Result<{ aimedOk: boolean }>;
    /** NEW — tablet tab (sim state, shown to everyone). */
    setTabletTab(rigId: string, tab: RigState['tablet']['tab']): Result;
  };

  /* ── LabSim devices ── */
  device: {
    /** Touch at mm coordinates on a display (player finger, ADB, or probe), Sim §3.5.4. */
    touch(deviceId: string, display: 'primary' | 'secondary', xMm: number, yMm: number, source: 'adb' | 'probe' | 'player'): Result<{ hitButton: string | null }>;
    pressPower(deviceId: string, longPress: boolean, actor: Actor): Result;
    /** Hand-present a physical test card (player inventory). Profile by id or exact name (widened). */
    presentCard(deviceId: string, entry: CardEntry, cardProfileId: number | string, actor: Actor): Result;
    /** Physically swap the device on a rig (old one to storage; Orca untouched). `opts.deviceId` picks the stored device to install. */
    swapHardware(rigId: string, newType: DeviceTypeCode, actor: Actor, opts?: { deviceId?: string; storeAt?: string }): Result<{ deviceId: string }>;
    /** Debug/test escape hatch: set any field (validated only by type). Not for gameplay. */
    setDeviceField<K extends keyof TerminalDevice>(deviceId: string, key: K, value: TerminalDevice[K], actor: Actor): Result;
    /** NEW — a stroke (finger swipe, ADB `input swipe`, probe stroke): signature / launcher scroll (Sim §3.5.4). */
    signStroke(deviceId: string, display: 'primary' | 'secondary', points: { xMm: number; yMm: number }[], source: 'adb' | 'probe' | 'player'): Result<{ effect: 'signature' | 'scroll' | 'ignored' }>;
    /** NEW — hardware/soft keys (`KEYCODE_HOME`, `KEYCODE_WAKEUP`, `KEYCODE_ENTER`, `KEYCODE_BACK`). */
    pressKey(deviceId: string, key: 'HOME' | 'WAKEUP' | 'ENTER' | 'BACK', source: 'adb' | 'player'): Result;
    /** NEW — type text (lock-screen passcode, custom tip) — `adb shell input text`. */
    enterText(deviceId: string, text: string, source: 'adb' | 'player'): Result;
    /** NEW — reload printer paper. */
    loadPaper(deviceId: string, actor: Actor): Result;
    /** NEW — re-seat a connectivity-hub cable (toggles seated). */
    reseatHub(deviceId: string, port: 'usb' | 'ethernet' | 'power', actor: Actor): Result<{ seated: boolean }>;
    /** NEW — firmware buttons/labels of the display's current screen (Sim §2.10.2). Pure; the ruler and render2d use it. */
    layout(deviceId: string, display: 'primary' | 'secondary'): LayoutButton[];
  };

  /* ── Power ── */
  power: {
    plug(loadId: string, hookup: PowerHookup, actor: Actor): Result;
    unplug(loadId: string, actor: Actor): Result;
    /** Remove + insert a fuse of the holder's label rating (UI convenience, Sim §3.13.2). */
    replaceFuse(fuseId: string, actor: Actor): Result;
    toggleStrip(stripId: string, on: boolean, actor: Actor): Result;
    togglePsu(psuId: string, on: boolean, actor: Actor): Result;
    /** Multimeter reading at a probe point (Sim §2.6). `mode` defaults to 'V'. */
    measure(pointId: string, mode?: 'V' | 'OHM'): MultimeterReading;
    /** NEW — pull a fuse (live ⇒ spark, GW03). */
    removeFuse(fuseId: string, actor: Actor): Result;
    /** NEW — insert a spare of `ratingA` (5/10/15/20) from the bench. */
    insertFuse(fuseId: string, ratingA: number, actor: Actor): Result;
    /** NEW — regulator input switch. */
    toggleRegulator(regulatorId: string, on: boolean, actor: Actor): Result;
    /** NEW — reset a tripped strip breaker. */
    resetBreaker(stripId: string, actor: Actor): Result;
    /** NEW — move an AC strip's or PSU's plug to another (free) wall outlet — the fix for a dead outlet. */
    moveToOutlet(itemId: string, outletId: string, actor: Actor): Result;
  };

  /* ── Hosts (Pis, NUC/Minix boxes, VMs, blade) ── */
  host: {
    /** Unplug, wait, replug (Pis) / hard power cycle (boxes, blade). */
    powerCycle(hostId: string, actor: Actor): Result;
    /** Legacy: plug/unplug the Ethernet cable (UNPLUGGED ↔ LINKED). */
    setEthernet(hostId: string, connected: boolean, actor: Actor): Result;
    restartService(hostId: string, service: string, actor: Actor): Result;
    stopService(hostId: string, service: string, actor: Actor): Result;
    /** Free space (deleting temp files: NUC-03 +2.0 GB, Sim §3.14.3). */
    cleanDisk(hostId: string, actor: Actor): Result<{ beforePct: number; afterPct: number }>;
    /** NEW — front power button (Windows: short = shutdown 20 s / boot; hold = hard off). */
    pressPowerButton(hostId: string, hold: boolean, actor: Actor): Result;
    /** NEW — write a host file (terminal editors, `cp -a`); `controller.yaml` is re-read on restart. */
    writeFile(hostId: string, path: string, contents: string, actor: Actor): Result;
    /** NEW — delete a file/dir (`rm -rf`, `del`); corporate logs ⇒ security tamper. */
    deletePath(hostId: string, path: string, actor: Actor): Result;
    /** NEW */
    startService(hostId: string, service: string, actor: Actor): Result;
    /** NEW — fit the spare Ethernet cable (DAMAGED/UNPLUGGED → LINKED). */
    replaceEthernet(hostId: string, actor: Actor): Result;
    /** NEW — attach/detach a USB device ("webcam", "motor-pcb:<rig>", "smartstripe:<rig>"). */
    plugUsb(hostId: string, usbId: string, attached: boolean, actor: Actor): Result;
    /** NEW — `schtasks /run /tn GortCardSync`. */
    runSchedTask(hostId: string, task: 'GortCardSync', actor: Actor): Result;
  };

  /* ── Collis probes ── */
  collis: {
    reseatRibbon(collisId: string, actor: Actor): Result;
  };

  /* ── Cameras (NEW) ── */
  camera: {
    /** Camera app: is the MJPEG stream at `url` up? Pure. */
    probe(url: string): CameraProbeResult;
    /** Snapshot to `~/Pictures/<file>` (image ref `img:webcam:<cameraId>:<physMs>`). */
    snapshot(url: string, fileName: string, actor: Actor): Result<{ imageRef: string; path: string }>;
  };

  /* ── Workstation terminal (bash, adb, ssh, git, curl, schtasks …) — sim-devops ── */
  terminal: {
    exec(line: string): TerminalResult;
    /** Pull new output lines for a streaming command (e.g. `journalctl -f`). */
    poll(jobId: string): { lines: TerminalLine[]; done: boolean; exitCode: number | null };
    /** Ctrl+C. */
    interrupt(jobId: string): void;
    /** Tab completion candidates for the current input. */
    complete(partial: string): string[];
    prompt(): string;
  };

  /* ── Git / GitHub — sim-devops ── */
  git: {
    clone(repo: GitRepo['id'], actor: Actor): Result;
    checkout(repo: GitRepo['id'], branch: string, create: boolean): Result;
    /** Write a file in the local working tree (IntelliJ save). */
    writeFile(repo: GitRepo['id'], path: string, contents: string): Result;
    stage(repo: GitRepo['id'], paths: string[]): Result;
    commit(repo: GitRepo['id'], message: string, actor: Actor): Result<{ sha: string }>;
    push(repo: GitRepo['id']): Result;
    pull(repo: GitRepo['id']): Result;
    createPullRequest(repo: GitRepo['id'], title: string, body: string, sourceBranch: string, actor: Actor): Result<{ number: number }>;
    approvePullRequest(repo: GitRepo['id'], prNumber: number, actor: Actor): Result;
    mergePullRequest(repo: GitRepo['id'], prNumber: number, actor: Actor): Result;
    /** NEW — Request changes (verdict CHANGES_REQUESTED) with an optional reason id. */
    requestChanges(repo: RepoId, prNumber: number, actor: Actor, reason?: string): Result;
    /** NEW — line or general comment. */
    comment(repo: RepoId, prNumber: number, comment: PrCommentInput, actor: Actor): Result<{ commentId: number }>;
    /** NEW */
    closePullRequest(repo: RepoId, prNumber: number, actor: Actor): Result;
    /** NEW — `git revert <sha>` on the local branch (creates a commit). */
    revert(repo: RepoId, sha: string, actor: Actor): Result<{ sha: string }>;
    /** NEW — delete a working-tree file. */
    deleteFile(repo: RepoId, path: string): Result;
    /** NEW — move/rename a working-tree file (IntelliJ drag). */
    moveFile(repo: RepoId, from: string, to: string): Result;
    /** NEW — discard local changes to a path. */
    discard(repo: RepoId, path: string): Result;
  };

  /* ── Jenkins — sim-devops ── */
  jenkins: {
    /** "Build with Parameters" (params merged over savedParams) / plain "Build" (params = {}). */
    build(jobId: string, params: Record<string, string>, triggeredBy: Actor): Result<{ buildId: string }>;
    abort(buildId: string, actor: Actor): Result;
    /** Convenience for UIs: last N builds of a job (newest first). Pure. */
    recentBuilds(jobId: string, n: number): JenkinsBuild[];
    /** NEW — Configure → Save. */
    saveJob(jobId: string, patch: JenkinsJobPatch, actor: Actor): Result;
    /** NEW — pipeline script only (= saveJob({ script })). */
    configureScript(jobId: string, script: string, actor: Actor): Result;
    /** NEW — Move to another folder ("Java" / "iOS"); history kept; returns the new id. */
    moveJob(jobId: string, toFolder: string, actor: Actor): Result<{ jobId: string }>;
    /** NEW — New Item / copy from an existing job. */
    createJob(spec: { folder: string; name: string; copyFrom?: string }, actor: Actor): Result<{ jobId: string }>;
    /** NEW — delete (exists = false; history kept for audit). */
    deleteJob(jobId: string, actor: Actor): Result;
    /** NEW — job lookup helper. Pure. */
    job(jobId: string): JenkinsJob | null;
  };

  /* ── Local test runs from IntelliJ (uses a config.properties) — sim-devops ── */
  runner: {
    /** `opts.configPath` = another config.properties (Code With Me, INC29); default the local clone's. */
    runLocal(repo: 'uia-remote' | 'pigeon', testPath: string, actor: Actor, opts?: { configPath?: string }): Result<{ runId: string }>;
    stopLocal(runId: string): Result;
    /** Live console lines of a local run. Pure. */
    output(runId: string): { lines: string[]; done: boolean; passed: boolean | null };
  };

  /* ── Laz Automation (zero-touch OOBE merchant switch) — sim-core ── */
  laz: {
    start(deviceId: string, toMerchantId: number, actor: Actor): Result<{ runId: string }>;
  };

  /* ── Computer vision & AI ── */
  ocr: {
    /** Run Tesseract (Sim §3.12.2) on a crop of an image ref. Pure. */
    tesseract(imageRef: string, bbox: { x: number; y: number; w: number; h: number }): { text: string; confidence: number };
    /** Run a Screen Compare Image check (capture → crop → OCR → exact match), Orca "Test". */
    compare(compareImageId: number): Result<{ text: string; expected: string; match: boolean }>;
    /** NEW — the frame model behind an image ref (GIMP, render2d). Pure. */
    frame(imageRef: string): Result<FrameModel>;
  };
  /** sim-devops. */
  ollama: {
    ask(model: string, prompt: string, image: string | null, actor: Actor): Result<{ requestId: string }>;
  };

  /* ── 3D printers (NEW) — sim-core ── */
  printer3d: {
    start(printer: 'prusa' | 'bambu', file: string, actor: Actor): Result<{ endsPhysMs: number }>;
  };

  /* ── Team chat — sim-core ── */
  chat: {
    post(channel: string, author: string, text: string, ticketId?: string): void;
    markRead(channel: string): void;
    /** NEW — post later (NPC reply); '@npc' = 10–20 s from the npc stream (Sim §3.24). Returns the timer id. */
    schedule(channel: string, author: string, text: string, delayMs: number | '@npc', ticketId?: string): string;
  };

  /* ── Fault injection (Arcade incidents, Academy setups, Free Play injector), Sim §4 ── */
  faults: {
    catalogue(): FaultInfo[];
    inject(spec: FaultSpec): Result<{ instanceId: string }>;
    /** API clear with revert (Sim §4.1.5). `by` is recorded. */
    clear(instanceId: string, by: Actor): Result;
    /** True when the fault's underlying condition is no longer present (pure; Sim §4.1.6). */
    isResolved(instanceId: string): boolean;
    /** NEW — apply a scenario atomically (Sim §4.1.4). */
    injectAll(items: ScenarioItem[]): Result<{ instanceIds: string[] }>;
    /** NEW — apply one setup op (Sim §4.4.1). */
    applySetup(op: SetupOp): Result;
    /** NEW */
    setupCatalogue(): SetupOpInfo[];
  };
}

