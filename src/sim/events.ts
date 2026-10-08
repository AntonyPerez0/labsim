/**
 * Simulation domain events (declaration-merged into the global EventMap). Catalogue: Sim §5.
 * Emitted by sim systems via `ctx.emit` and delivered on `bus` after the state commits, in emission
 * order. Missions/objectives, audio, toasts and the world listen to these; high-frequency state
 * (gantry position, voltages, console lines) is NOT an event — views re-read state.
 *
 * Status per Sim §5: fields marked "+" on existing events are additions (optional so any existing
 * emitter stays valid); events marked NEW were added with Sim §5.
 */
import type {
  ActuatorState,
  BannerColor,
  BuildResult,
  CardEntry,
  DevicePower,
  DeviceTypeCode,
  EthState,
  FailureCode,
  FaultParamValue,
  HostOs,
  HostPower,
  PowerHookup,
  RigPart,
  RobotStatus,
  ScreenName,
} from './types';

export type OrcaEntityName =
  | 'robot'
  | 'device'
  | 'capability'
  | 'merchant'
  | 'screen'
  | 'screenLocation'
  | 'cardProfile'
  | 'screenCompareImage';

export type RigCommandName =
  | 'steppers.enable'
  | 'steppers.disable'
  | 'park.all'
  | 'park.xy'
  | 'park.x'
  | 'park.y'
  | 'dip.in'
  | 'dip.out'
  | 'tap.in'
  | 'tap.out'
  | 'phone.forward'
  | 'phone.back'
  | 'phone.pushPower'
  | 'solenoid.down'
  | 'solenoid.up'
  | 'solenoid.lower'
  | 'solenoid.raise'
  | 'move.to'
  | 'tap.at';

/** Result of a probe/finger/ADB touch against the firmware layout (Sim §3.5.4). */
export type TouchResult = 'HIT' | 'EDGE_REJECT' | 'MISS' | 'DISABLED' | 'SECURE_REJECTED' | 'NOT_RENDERED';

declare module '@/core/events' {
  interface EventMap {
    /* ── Lifecycle, time, configuration (Sim §5.1) ── */
    /** NEW — after `sim.reset` commits. */
    'sim.reset': { preset: string; seed: number };
    /** NEW — after `sim.restore` / `sim.load`. */
    'sim.restored': { version: number; migratedFrom: number | null };
    /** NEW */
    'time.scaleChanged': { from: number; to: number };
    /** NEW — game-clock-only jump (Sim §6.3). */
    'time.jumped': { fromMs: number; toMs: number; reason: 'skipToNextHealthCheck' | 'fastForward' };
    /** NEW — SimConfig keys changed. */
    'config.changed': { keys: string[] };
    'flags.changed': { flag: string; value: string | boolean };
    /** NEW — a setup op was applied (Sim §4.4). */
    'setup.applied': { op: string; params: Record<string, FaultParamValue> };
    'fault.injected': { instanceId: string; faultId: string; params: Record<string, FaultParamValue>; /* + */ target?: string };
    /** `by` = 'condition' (auto-clear) or the actor that called faults.clear. */
    'fault.cleared': { instanceId: string; faultId: string; by: string };

    /* ── Orca (Sim §5.2) ── */
    'orca.healthCheckRan': {
      atMs: number;
      /** = pinged. */
      checked: number;
      failedRobotIds: number[];
      recoveredRobotIds: number[];
      /* + */ run?: number;
      /* + */ pinged?: number;
      /* + */ skipped?: number;
      /** + robots whose status flipped to CONNECTION_FAILED in this run. */
      newlyFailedRobotIds?: number[];
      /** + run triggered by Force health check / runHealthCheckNow. */
      forced?: boolean;
    };
    /** NEW — run skipped because the DB is down (Sim §3.3.1). */
    'orca.healthCheckAborted': { run: number; atMs: number; reason: 'db-down' };
    'robot.statusChanged': { robotId: number; name: string; from: RobotStatus; to: RobotStatus; actor: string; reason?: string };
    'robot.noteAdded': { robotId: number; noteId: number; endpoint?: string; text: string; /* + */ kind?: 'HEALTH' | 'STATUS' | 'CONFIG' | 'MANUAL' };
    /** NEW — an identical consecutive failure collapsed into the newest note. */
    'robot.noteRepeated': { robotId: number; noteId: number; repeat: number; atMs: number };
    'robot.checkedOut': { robotId: number; name: string; buildId: string; byName: boolean; /* + */ jobId?: string; /* + */ kind?: 'jenkins' | 'local' | 'manual' };
    'robot.released': { robotId: number; name: string; buildId: string; statusAfter: RobotStatus };
    /** NEW — a build is waiting for a robot (or its skip reasons changed), Sim §3.4.2 #6. */
    'robot.checkoutWaiting': { buildId: string; jobId: string; label: string; reasons: string[] };
    'orca.checkoutRejected': { buildId: string; jobId: string; reason: string; robotName?: string; /* + */ code?: FailureCode };
    'orca.entitySaved': {
      entity: OrcaEntityName;
      id: number;
      action: 'create' | 'update' | 'delete';
      fields: string[];
      actor: string;
      /* + */ diff?: Record<string, [unknown, unknown]>;
    };
    /** ADB_TOUCH: at injection; PHYSICAL_TAP: when the stroke completes; errors: at once with ok=false. */
    'orca.xyTouch': {
      robotName: string;
      screen: string;
      button: string;
      xMm: number;
      yMm: number;
      mode: 'adb' | 'probe';
      ok: boolean;
      hitButton: string | null;
      error?: string;
      /* + */ requestId?: string;
      /* + */ orcaMode?: 'PHYSICAL_TAP' | 'ADB_TOUCH';
      /* + */ status?: number;
      /* + */ actor?: string;
      /* + */ target?: 'MFD' | 'CFD';
    };
    /** NEW — `/api/card/*` result (Sim §3.6). */
    'orca.cardAction': { robotName: string; entry: CardEntry; profile: string; ok: boolean; armed: boolean; error?: string; actor: string };
    /** NEW — gort → Orca screen-location sync (Sim §3.22.3). */
    'orca.screenLocationsSynced': { deviceType: DeviceTypeCode; screen: string; path: string; commit: string; buttons: number };
    /** NEW — JDBC pool connected/disconnected (Sim §3.14.5). */
    'orca.dbStateChanged': { connected: boolean };
    'orca.rest': { method: string; path: string; status: number; actor: string };

    /* ── Rigs (Sim §5.3) ── */
    'rig.command': { rigId: string; command: RigCommandName; actor: string; ok: boolean; error?: string };
    'rig.moveCompleted': { rigId: string; xMm: number; yMm: number };
    'rig.parkStarted': { rigId: string; axes: 'all' | 'xy' | 'x' | 'y' };
    'rig.parkCompleted': { rigId: string; /* + */ axes?: 'all' | 'xy' | 'x' | 'y'; /* + */ homed?: boolean; /* + */ lockEngaged?: boolean };
    /** NEW — broken limit switch (Sim §3.7.1). */
    'rig.homingFailed': { rigId: string; axis: 'x' | 'y'; fault: string };
    'rig.lockBroken': { rigId: string; by: string };
    /** NEW — Park All completed and engaged the magnetic lock. */
    'rig.lockEngaged': { rigId: string };
    'rig.bannerChanged': { rigId: string; from: BannerColor; to: BannerColor; /* + */ text?: string };
    'rig.solenoidTap': {
      rigId: string;
      xMm: number;
      yMm: number;
      /* + */ ref?: string;
      /* + */ deviceId?: string | null;
      /* + */ result?: 'HIT' | 'EDGE_REJECT' | 'MISS' | 'NO_CONTACT' | 'NOT_RENDERED';
      /* + */ hitButton?: string | null;
    };
    'rig.actuator': { rigId: string; actuator: 'dip' | 'tap' | 'phone'; state: ActuatorState };
    'rig.switch': { rigId: string; which: 'main' | 'motor'; on: boolean };
    'rig.lockout': { rigId: string; locked: boolean };
    /** NEW — hand drag of the carriage (GW06). */
    'rig.carriageDragged': { rigId: string; dxMm: number; dyMm: number; accumMm: number; actor: string };
    /** NEW */
    'rig.doorChanged': { rigId: string; open: boolean };
    /** NEW */
    'rig.reseated': { rigId: string; part: RigPart; seated: boolean };
    /** NEW */
    'rig.cradleReplaced': { rigId: string };
    /** NEW */
    'rig.dipArmAdjusted': { rigId: string; toothOffset: number };
    /** NEW */
    'rig.motorUsbMoved': { rigId: string; host: string };
    /** NEW */
    'rig.webcamAimed': { rigId: string; aimedOk: boolean };
    /** NEW — the tablet header now shows this HRN. */
    'rig.tabletNameChanged': { rigId: string; hrn: string };

    /* ── LabSim devices (Sim §5.4) ── */
    'device.touched': {
      deviceId: string;
      display: 'primary' | 'secondary';
      xMm: number;
      yMm: number;
      source: 'adb' | 'probe' | 'player';
      hitButton: string | null;
      screen: ScreenName;
      /* + */ result?: TouchResult;
    };
    /** NEW — swipe / probe stroke. */
    'device.stroke': { deviceId: string; display: 'primary' | 'secondary'; source: 'adb' | 'probe' | 'player'; effect: 'signature' | 'scroll' | 'ignored' };
    'device.screenChanged': { deviceId: string; display: 'primary' | 'secondary'; from: ScreenName; to: ScreenName };
    /** NEW */
    'device.toast': { deviceId: string; display: 'primary' | 'secondary'; text: string };
    'device.powerChanged': { deviceId: string; from: DevicePower; to: DevicePower };
    'device.fried': { deviceId: string; cause: string };
    'device.cardPresented': { deviceId: string; entry: CardEntry; profileId: number | null; ok: boolean; error?: string };
    /** NEW — printer payload (+2.5 s after Print). */
    'device.receiptPrinted': { deviceId: string; orderId: string; totalCents: number; text: string };
    'device.transactionCompleted': {
      deviceId: string;
      orderId: string;
      totalCents: number;
      approved: boolean;
      receiptChoice: string | null;
      /* + */ authCode?: string;
      /* + */ entry?: CardEntry | null;
    };
    'device.provisioned': { deviceId: string; merchantConfigId: number | null };
    /** NEW */
    'device.adbTcpChanged': { deviceId: string; port: number | null };
    /** NEW */
    'device.payDisplayLink': { mfdDeviceId: string; cfdDeviceId: string; link: 'UP' | 'DOWN' };
    /** NEW */
    'device.swapped': { rigId: string; removedDeviceId: string; installedDeviceId: string };

    /* ── Power (Sim §5.5) ── */
    'power.fuseBlown': { fuseId: string; railId: string; currentA: number };
    'power.fuseReplaced': { fuseId: string };
    /** NEW — GW03 when live. */
    'power.fuseRemoved': { fuseId: string; live: boolean };
    /** NEW — GW04 when ratingA ≠ labelA. */
    'power.fuseInserted': { fuseId: string; ratingA: number; labelA: number; live: boolean };
    'power.plugged': { loadId: string; hookup: PowerHookup };
    'power.unplugged': { loadId: string };
    'power.loadDamaged': { loadId: string; cause: string };
    'power.railChanged': { railId: string; voltage: number };
    'power.stripToggled': { stripId: string; on: boolean };
    /** NEW — a strip or PSU plug moved to another wall outlet (`power.moveToOutlet`). */
    'power.replugged': { itemId: string; fromOutletId: string | null; toOutletId: string };
    /** NEW */
    'power.regulatorToggled': { regulatorId: string; on: boolean };
    /** NEW — VFX/audio. */
    'power.spark': { at: string; cause: string; live: boolean };
    /** NEW */
    'power.breakerTripped': { stripId: string; currentA: number };
    /** NEW */
    'power.psuHiccup': { psuId: string; untilPhysMs: number };
    /** NEW */
    'power.underVoltage': { hostId: string; volts: number };
    /** NEW — GW21 when mode OHM on a live point. */
    'power.measured': { pointId: string; mode: 'V' | 'OHM'; display: string; live: boolean };

    /* ── Hosts, network, workstation (Sim §5.6) ── */
    'host.powerChanged': { hostId: string; from: HostPower; to: HostPower };
    /** NEW — authoritative OS state change. */
    'host.osChanged': { hostId: string; from: HostOs; to: HostOs };
    'host.crashed': { hostId: string; reason: string };
    'host.serviceChanged': { hostId: string; service: string; running: boolean; /* + */ failure?: string | null };
    'host.ethernetChanged': { hostId: string; connected: boolean; /* + */ eth?: EthState };
    /** NEW */
    'host.usbChanged': { hostId: string; usbId: string; attached: boolean };
    'host.diskCleaned': { hostId: string; beforePct: number; afterPct: number };
    /** NEW */
    'host.fileWritten': { hostId: string; path: string; actor: string };
    /** NEW — corporate agent tampering (GW11). */
    'host.securityTamper': { hostId: string; action: string; actor: string };
    /** NEW */
    'host.schedTaskRan': { hostId: string; task: 'GortCardSync'; result: 0 | 1; commit: string | null; manual: boolean };

    'adb.connected': { target: string; deviceId: string | null; coworker: boolean };
    'adb.disconnected': { target: string };
    'adb.command': { target: string | null; command: string; ok: boolean };
    /** NEW — anything drove a 10.42.60.* coworker device (GW08 / INC27). */
    'adb.coworkerDriven': { target: string; deviceId: string; command: string; by: 'terminal' | 'runner' };
    'terminal.command': { line: string; host: string; cwd: string; exitCode: number };
    'ssh.connected': { hostId: string };
    'ssh.disconnected': { hostId: string };
    /** NEW — Camera app Snapshot. */
    'camera.snapshot': { cameraId: string; path: string; imageRef: string };

    /* ── Git / GitHub (Sim §5.7) ── */
    'git.cloned': { repo: string };
    'git.fileEdited': { repo: string; path: string };
    'git.committed': { repo: string; sha: string; message: string; files: string[] };
    'git.pushed': { repo: string; branch: string };
    'git.pulled': { repo: string; branch: string };
    'git.branchChanged': { repo: string; branch: string };
    /** NEW — protected main. */
    'git.pushRejected': { repo: string; branch: string; reason: string };
    'github.prCreated': { repo: string; number: number; title: string };
    'github.prMerged': { repo: string; number: number; title: string; by: string };
    /** NEW — push to an open PR's branch. */
    'github.prUpdated': { repo: string; number: number; headSha: string };
    /** NEW */
    'github.prReviewed': { repo: string; number: number; by: string; verdict: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' };
    /** NEW */
    'github.prCommented': { repo: string; number: number; by: string; commentId: number; path: string | null; line: number | null; reason?: string };
    /** NEW */
    'github.prClosed': { repo: string; number: number; by: string };

    /* ── Jenkins & runners (Sim §5.7) ── */
    'jenkins.buildQueued': { buildId: string; jobId: string; params: Record<string, string> };
    'jenkins.buildStarted': { buildId: string; jobId: string; robotId: number | null };
    'jenkins.stageChanged': { buildId: string; stage: string; status: string };
    'jenkins.buildFinished': { buildId: string; jobId: string; result: BuildResult; failureCode: string | null; robotId: number | null };
    /** NEW */
    'jenkins.jobSaved': { jobId: string; fields: string[]; actor: string };
    /** NEW */
    'jenkins.jobMoved': { fromJobId: string; toJobId: string; actor: string };
    /** NEW */
    'jenkins.jobCreated': { jobId: string; actor: string };
    /** NEW */
    'jenkins.jobDeleted': { jobId: string; actor: string };
    'runner.step': {
      runId: string;
      step: string;
      deviceRole: 'MFD' | 'CFD' | 'DEVICE';
      ok: boolean;
      detail?: string;
      /* + */ index?: number;
      /* + */ total?: number;
      /* + */ buildId?: string | null;
    };
    'test.localRunStarted': { runId: string; testName: string; robotName: string | null };
    'test.localRunFinished': {
      runId: string;
      testName: string;
      passed: boolean;
      failureCode: string | null;
      /* + */ robotName?: string | null;
      /* + */ overlappedJenkins?: boolean;
    };

    /* ── Cards, Laz/Ubi, vision, AI, chat, printers (Sim §5.8) ── */
    'callus.cardLoaded': { collisId: string; profileId: number; ok: boolean; error?: string };
    'collis.action': { collisId: string; entry: CardEntry; ok: boolean; error?: string };
    /** NEW */
    'collis.stateChanged': { collisId: string; led: 'green' | 'amber' | 'off'; state: 'READY' | 'OFFLINE' | 'NO_LINK' | 'FAULT' };
    /** NEW */
    'callus.armed': { collisId: string; profile: string; deviceId: string };
    /** NEW */
    'callus.armFired': { collisId: string; profile: string; deviceId: string; ok: boolean };
    /** NEW */
    'callus.armExpired': { collisId: string; profile: string; deviceId: string };
    'callus.syncCompleted': { hostId: string; commit: string; /* + */ files?: number; /* + */ manual?: boolean };

    'laz.runStarted': { runId: string; deviceId: string; toMerchantId: number };
    'laz.stepChanged': { runId: string; step: string };
    'laz.runFinished': { runId: string; deviceId: string; ok: boolean; error?: string };
    /** NEW */
    'ubi.routed': { runId: string; merchant: string; route: string | null; ok: boolean; error?: string };

    'ocr.ran': {
      compareId: number | null;
      text: string;
      expected: string | null;
      match: boolean | null;
      /* + */ source?: 'orca' | 'runner' | 'pigeon' | 'gimp';
      /* + */ robotName?: string;
      /* + */ line?: string;
    };
    /** NEW */
    'ollama.requested': { requestId: string; model: string; image: string | null };
    'ollama.responded': { requestId: string; correct: boolean | null; /* + */ verdict?: 'PASS' | 'FAIL' | null };
    /** NEW */
    'printer3d.started': { printer: 'prusa' | 'bambu'; file: string; endsPhysMs: number };
    /** NEW */
    'printer3d.done': { printer: 'prusa' | 'bambu'; part: string };

    'chat.message': { id: string; channel: string; author: string; text: string; ticketId?: string };
  }
}

export {};
