/**
 * Conditions: the success-condition DSL of GP §3.3 and the curriculum's step success rules, as
 * plain typed data built with three small builder namespaces:
 *
 *   p.*   probes  — typed reads of a GP §3.3 state path (`p.robot('wall-e').status` → Probe<RobotStatus>)
 *   c.*   conditions — comparisons, logic, event history, invariants and deferred verification
 *   on()  event matchers — `on('robot.statusChanged', { name: 'eve', to: 'OFFLINE' })`
 *
 * Conditions are data (lintable, printable, serialisable except `custom`/matcher `test` closures).
 * The mission runtime owns the evaluator (`evaluate(cond, state, ctx)`) and the probe resolver that
 * maps each probe onto the live `LabState` / session; the DSL value vocabulary below (`'RUNNING'`,
 * `'LINKED'`, `'UP'` …) is GP §3.3's, so content never depends on sim internals.
 *
 * Evaluation semantics (runtime contract):
 *  - Immediate nodes (`cmp`, `all`, `any`, `not`, `happened`, `sequence`, `custom`) are evaluated on
 *    demand against the current state + the owner scope's event history.
 *  - Stateful nodes (`always`, `never`, `wasTrue`, `held`) are sampled every mission tick from the
 *    moment the owner scope (step / ticket / task) starts.
 *  - `verify` nodes (GP "at the next health check" / "next build") belong at the top level of an
 *    `all(...)`. The runtime records `fixedAtMs` when the other conjuncts last became true; the verify
 *    node is satisfied by the first matching trigger at/after `fixedAtMs` (a confirmation build that
 *    already went green counts — PB02). On Resolve with only verify nodes pending the ticket goes to
 *    `verifying` ("Verifying… waiting for 08:20 health check") and auto-resolves; if the trigger
 *    arrives and the condition is false the ticket returns to `in-progress` and GW16 is charged.
 *
 * @example INC04 (Ethernet unplugged), bound to BUMBLEBEE:
 * const success = (b: IncidentBinding) => c.all(
 *   c.eq(p.pi(String(b.vars.pi)).eth, 'LINKED'),
 *   c.status(b.rig!, 'AVAILABLE'),
 *   c.nextHealthCheck(),
 * );
 * @example M06 step 12 — "Build observed waiting while WALL-E was Reserved, then checked out WALL-E":
 * c.sequence(
 *   on('orca.checkoutRejected', { jobId: 'Java/uia-remote-regression-flex' }),
 *   on('robot.checkedOut', { name: 'wall-e' }),
 * )
 */
import type { EventMap } from '@/core/events';
import type { BusRecord, EventName } from '@/core/bus';
import type { PipelineId, RootState, TicketState } from '@/core/state';
import type { BuildResult, DeviceTypeCode, RobotStatus } from '@/sim/types';
import type { IncidentBinding } from './common';

/* ═════════════════════════════ DSL value vocabulary (GP §3.3) ═════════════════════════════ */

export type OnOff = 'ON' | 'OFF';
export type PiOs = 'RUNNING' | 'HUNG' | 'BOOTING' | 'OFF';
export type EthLink = 'LINKED' | 'UNPLUGGED' | 'DAMAGED';
export type SvcStatus = 'UP' | 'DOWN';
export type FuseStatus = 'OK' | 'BLOWN';
export type BannerCode = 'GREEN' | 'YELLOW' | 'GREY' | 'RED';
export type MagLockState = 'ENGAGED' | 'RELEASED';
export type ConnectorState = 'SEATED' | 'UNSEATED' | 'LOOSE';
export type CradleState = 'OK' | 'CRACKED' | 'NEW';
export type DeviceHwState = 'OK' | 'BOOTING' | 'DEAD' | 'FRIED';
export type CollisPower = 'OFF' | 'AC' | 'DC';
export type CollisState = 'OK' | 'FRIED';
export type LinkState = 'UP' | 'DOWN';
export type LocalRunResult = 'PASS' | 'FAIL' | 'RUNNING' | 'NONE';
export type PrState = 'OPEN' | 'MERGED' | 'CLOSED' | 'NONE';
export type PrVerdict = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' | 'NONE';
export type RobotUrlKind = 'adb' | 'camera' | 'dip' | 'tap' | 'swipe';

/** Values a probe can yield. Missing entities yield `null` (and `exists` probes `false`). */
export type ProbeValue = string | number | boolean | null | readonly string[];

/* ═════════════════════════════ Probes ═════════════════════════════ */

/** Robot fields (GP §3.3 `orca.robot(R).{…}`); offsets in mm; `lastHealth*` from the latest health check. */
export type RobotField =
  | 'status'
  | 'name'
  | 'hrn'
  | 'reservedBy'
  | 'deviceId'
  | 'mfdDeviceId'
  | 'cfdDeviceId'
  | 'offsetX'
  | 'offsetY'
  | 'capabilities'
  | 'lastHealthAt'
  | 'lastHealthHttp'
  | 'lastHealthError'
  | 'checkedOutBy';

export type RigField =
  | 'main'
  | 'motor'
  | 'steppersEnabled'
  | 'homed'
  | 'magLock'
  | 'banner'
  | 'solenoidConnector'
  | 'dipArmAligned'
  | 'cradle'
  | 'motionHost'
  | 'lockedOut'
  | 'door';

export type HwDeviceField = 'power' | 'state' | 'adbTcpPort' | 'activeMerchant' | 'psuOn' | 'screen' | 'secondaryScreen';

/**
 * Probe data. The resolver (runtime) reads it; authors build it with `p.*`.
 * Keys follow GP §3.3; ids are system names (`wall-e`), Orca device-row names (`johnny-5-flex2`),
 * host ids (`pi-wall-e` or `pi-10.42.10.11`, `minix-01`, `orca-vm`), fuse ids (`F-RACKB-5V`), job paths.
 */
export type ProbeSpec =
  | { p: 'orca.robot'; robot: string; field: RobotField }
  | { p: 'orca.robot.url'; robot: string; kind: RobotUrlKind }
  | { p: 'orca.device'; device: string; field: 'exists' | 'type' | 'serial' | 'ip' }
  | { p: 'orca.screenLocation'; deviceType: DeviceTypeCode; screen: string; button: string; field: 'x' | 'y' | 'exists' }
  | { p: 'orca.screenCompare'; name: string; field: 'x' | 'y' | 'w' | 'h' | 'expected' | 'deprecated' | 'exists' }
  | { p: 'orca.merchant'; merchant: string; field: string }
  | { p: 'orca.cardProfile'; profile: string; field: 'kind' | 'trackData' | 'gortPath' | 'exists' }
  /** Orca app health (`/management/health` status code; 200 healthy, 500/503 broken). */
  | { p: 'orca.http' }
  | { p: 'hw.pi'; host: string; field: 'power' | 'os' | 'eth' }
  | { p: 'hw.fuse'; fuse: string; field: 'state' | 'rating' | 'labelRating' | 'removed' }
  /** Load id plugged into an AC strip outlet (1-based), or null. */
  | { p: 'hw.outlet'; strip: string; outlet: number }
  /** Load id on a DC terminal / regulator output, or null. */
  | { p: 'hw.dcTerminal'; terminal: string }
  | { p: 'hw.box'; box: string; field: 'power' | 'diskFreeGB' }
  | { p: 'hw.rig'; rig: string; field: RigField }
  | { p: 'hw.collis'; collis: string; field: 'power' | 'ribbon' | 'state' }
  | { p: 'hw.device'; device: string; field: HwDeviceField }
  | { p: 'hw.camera'; camera: string; field: 'svc' | 'usb' }
  | { p: 'svc'; host: string; service: string }
  | { p: 'link'; mfd: string; cfd: string }
  | { p: 'jenkins.job'; job: string; field: 'exists' | 'folder' | 'script' | 'lastResult' | 'lastRobot' | 'lastBuildId' }
  | { p: 'jenkins.lastParam'; job: string; param: string }
  /** Consecutive green runs of a job (or pipeline id `PL2`) on a robot (null = any robot). */
  | { p: 'jenkins.greenStreak'; job: string; robot: string | null }
  /** Workstation ADB connections (`host:port` strings). */
  | { p: 'adb.connections' }
  /** `key` of a properties file; `file` = `config` (the player's uia-remote config.properties), `alexConfig`, or `<repo>:<path>`. */
  | { p: 'prop'; file: string; key: string }
  | { p: 'fs'; host: string; path: string; field: 'exists' | 'contents' }
  | { p: 'git.file'; repo: string; path: string; ref: string; field: 'exists' | 'contents' | 'parsesJson' }
  /** JSON value at an RFC 6901 pointer (`/capabilities/printer`) of a repo file; null if missing or unparsable. Non-scalars are JSON-stringified. */
  | { p: 'git.json'; repo: string; path: string; ref: string; pointer: string }
  /** `pr: 'latest'` = the newest PR opened by the player in this activity. `commentTags` = review-comment tags covered (INC34). */
  | { p: 'git.pr'; repo: string; pr: number | 'latest'; field: 'state' | 'verdict' | 'commentTags' | 'mergedBy' | 'number' }
  /** Static code predicate evaluated by the sim (sim doc §3.19.6), e.g. `waitForScreenBeforeClick` on `TaxTest`. */
  | { p: 'code.fact'; fact: string; subject: string }
  | { p: 'ide.localRun'; test: string; field: 'result' | 'robot' | 'overlappedJenkins' }
  | { p: 'ide.localRunStreak'; test: string }
  /** No workstation session drives the coworker's desk device (Riley, `10.42.60.4`). */
  | { p: 'coworker.deviceIdle'; who: string }
  /** The owning ticket (Arcade): reply / call / escalation / status. */
  | { p: 'ticket'; field: 'reply' | 'call' | 'callCorrect' | 'escalationCause' | 'escalationEndpoint' | 'status' | 'hintTier' }
  | { p: 'ticket.bug'; field: string }
  | { p: 'ticket.match'; left: string }
  /** Owner-scope counter declared by the incident/step (`powerCycles`). */
  | { p: 'counter'; name: string }
  /** Seeded ground truth (`binding.vars['truth.' + key]`, GP `truth(…)`, `truthText`, `canonicalTracks`). */
  | { p: 'truth'; key: string }
  | { p: 'flag'; flag: string }
  /** Session mission variable (`session.vars`). */
  | { p: 'var'; name: string }
  | { p: 'player'; field: 'location' | 'lookingAt' | 'activeTool' | 'carrying' | 'crouched' | 'fuseRating' }
  /** Current overlay kind (`computer`, `tablet` …). */
  | { p: 'overlay' }
  /** Escape hatch: dot path into RootState (`lab.orca.app.dbConnected`). Prefer a typed probe. */
  | { p: 'path'; path: string };

/** A typed probe: the data plus a phantom value type used by `c.*` for checking. */
export type Probe<T extends ProbeValue = ProbeValue> = ProbeSpec & { readonly __value?: T };
/** Compare against another probe's value (`c.same`, `c.approx(p, c.ref(truth))`). */
export interface ProbeRef<T extends ProbeValue = ProbeValue> {
  probe: Probe<T>;
}

function probe<T extends ProbeValue>(spec: ProbeSpec): Probe<T> {
  return spec as Probe<T>;
}

/** Probe builders (GP §3.3 state paths). */
export const p = {
  /** `orca.robot(R).*` */
  robot: (robot: string) => ({
    status: probe<RobotStatus>({ p: 'orca.robot', robot, field: 'status' }),
    name: probe<string | null>({ p: 'orca.robot', robot, field: 'name' }),
    hrn: probe<string | null>({ p: 'orca.robot', robot, field: 'hrn' }),
    reservedBy: probe<string | null>({ p: 'orca.robot', robot, field: 'reservedBy' }),
    deviceId: probe<string | null>({ p: 'orca.robot', robot, field: 'deviceId' }),
    mfdDeviceId: probe<string | null>({ p: 'orca.robot', robot, field: 'mfdDeviceId' }),
    cfdDeviceId: probe<string | null>({ p: 'orca.robot', robot, field: 'cfdDeviceId' }),
    offsetX: probe<number>({ p: 'orca.robot', robot, field: 'offsetX' }),
    offsetY: probe<number>({ p: 'orca.robot', robot, field: 'offsetY' }),
    capabilities: probe<readonly string[]>({ p: 'orca.robot', robot, field: 'capabilities' }),
    lastHealthAt: probe<number | null>({ p: 'orca.robot', robot, field: 'lastHealthAt' }),
    lastHealthHttp: probe<number | null>({ p: 'orca.robot', robot, field: 'lastHealthHttp' }),
    lastHealthError: probe<string | null>({ p: 'orca.robot', robot, field: 'lastHealthError' }),
    /** Build id / `local:<engineer>` holding the robot, or null. */
    checkedOutBy: probe<string | null>({ p: 'orca.robot', robot, field: 'checkedOutBy' }),
    url: (kind: RobotUrlKind) => probe<string | null>({ p: 'orca.robot.url', robot, kind }),
  }),
  /** `orca.device(D).*` — D = Orca device-row name (`johnny-5-flex2`). */
  device: (device: string) => ({
    exists: probe<boolean>({ p: 'orca.device', device, field: 'exists' }),
    type: probe<DeviceTypeCode | null>({ p: 'orca.device', device, field: 'type' }),
    serial: probe<string | null>({ p: 'orca.device', device, field: 'serial' }),
    ip: probe<string | null>({ p: 'orca.device', device, field: 'ip' }),
  }),
  /** `orca.screenLocation(deviceType, screen, button).{x,y}` in mm. */
  screenLocation: (deviceType: DeviceTypeCode, screen: string, button: string) => ({
    x: probe<number | null>({ p: 'orca.screenLocation', deviceType, screen, button, field: 'x' }),
    y: probe<number | null>({ p: 'orca.screenLocation', deviceType, screen, button, field: 'y' }),
    exists: probe<boolean>({ p: 'orca.screenLocation', deviceType, screen, button, field: 'exists' }),
  }),
  /** `orca.screenCompare(name).*` in px. */
  screenCompare: (name: string) => ({
    x: probe<number | null>({ p: 'orca.screenCompare', name, field: 'x' }),
    y: probe<number | null>({ p: 'orca.screenCompare', name, field: 'y' }),
    w: probe<number | null>({ p: 'orca.screenCompare', name, field: 'w' }),
    h: probe<number | null>({ p: 'orca.screenCompare', name, field: 'h' }),
    expected: probe<string | null>({ p: 'orca.screenCompare', name, field: 'expected' }),
    deprecated: probe<boolean>({ p: 'orca.screenCompare', name, field: 'deprecated' }),
    exists: probe<boolean>({ p: 'orca.screenCompare', name, field: 'exists' }),
  }),
  /** `orca.merchant(M).*` — `field` is any MerchantConfig field (`appId`, `appSecret`, `apiKey`, `ubiRoute`, `region` …). */
  merchant: (merchant: string) => ({
    field: (field: string) => probe<string | number | boolean | null>({ p: 'orca.merchant', merchant, field }),
    appId: probe<string | null>({ p: 'orca.merchant', merchant, field: 'appId' }),
    appSecret: probe<string | null>({ p: 'orca.merchant', merchant, field: 'appSecret' }),
    apiKey: probe<string | null>({ p: 'orca.merchant', merchant, field: 'apiKey' }),
    ubiRoute: probe<string | null>({ p: 'orca.merchant', merchant, field: 'ubiRoute' }),
  }),
  /** `orca.cardProfile(P).*` */
  cardProfile: (profile: string) => ({
    kind: probe<'SWIPE' | 'DIP' | 'TAP' | null>({ p: 'orca.cardProfile', profile, field: 'kind' }),
    trackData: probe<string | null>({ p: 'orca.cardProfile', profile, field: 'trackData' }),
    gortPath: probe<string | null>({ p: 'orca.cardProfile', profile, field: 'gortPath' }),
    exists: probe<boolean>({ p: 'orca.cardProfile', profile, field: 'exists' }),
  }),
  orcaHttp: probe<number>({ p: 'orca.http' }),
  /** `hw.pi(host).*`; `svc` = `svc(host, name)`. */
  pi: (host: string) => ({
    power: probe<OnOff>({ p: 'hw.pi', host, field: 'power' }),
    os: probe<PiOs>({ p: 'hw.pi', host, field: 'os' }),
    eth: probe<EthLink>({ p: 'hw.pi', host, field: 'eth' }),
    svc: (service: string) => probe<SvcStatus>({ p: 'svc', host, service }),
  }),
  /** `hw.fuse(F).*` — rating in amps; `labelRating` = the holder label. */
  fuse: (fuse: string) => ({
    state: probe<FuseStatus>({ p: 'hw.fuse', fuse, field: 'state' }),
    rating: probe<number | null>({ p: 'hw.fuse', fuse, field: 'rating' }),
    labelRating: probe<number>({ p: 'hw.fuse', fuse, field: 'labelRating' }),
    removed: probe<boolean>({ p: 'hw.fuse', fuse, field: 'removed' }),
  }),
  /** `hw.outlet(strip, n).load` — 1-based outlet number. */
  outlet: (strip: string, outlet: number) => probe<string | null>({ p: 'hw.outlet', strip, outlet }),
  /** `hw.dcTerminal(id).load` */
  dcTerminal: (terminal: string) => probe<string | null>({ p: 'hw.dcTerminal', terminal }),
  /** `hw.box(B).*` (Windows/Minix/NUC boxes). */
  box: (box: string) => ({
    power: probe<OnOff>({ p: 'hw.box', box, field: 'power' }),
    diskFreeGB: probe<number>({ p: 'hw.box', box, field: 'diskFreeGB' }),
    svc: (service: string) => probe<SvcStatus>({ p: 'svc', host: box, service }),
  }),
  /** `hw.rig(R).*` */
  rig: (rig: string) => ({
    main: probe<OnOff>({ p: 'hw.rig', rig, field: 'main' }),
    motor: probe<OnOff>({ p: 'hw.rig', rig, field: 'motor' }),
    steppersEnabled: probe<boolean>({ p: 'hw.rig', rig, field: 'steppersEnabled' }),
    homed: probe<boolean>({ p: 'hw.rig', rig, field: 'homed' }),
    magLock: probe<MagLockState>({ p: 'hw.rig', rig, field: 'magLock' }),
    banner: probe<BannerCode>({ p: 'hw.rig', rig, field: 'banner' }),
    solenoidConnector: probe<ConnectorState>({ p: 'hw.rig', rig, field: 'solenoidConnector' }),
    dipArmAligned: probe<boolean>({ p: 'hw.rig', rig, field: 'dipArmAligned' }),
    cradle: probe<CradleState>({ p: 'hw.rig', rig, field: 'cradle' }),
    /** `PI` or the host id driving the motion PCB (INC19). */
    motionHost: probe<string>({ p: 'hw.rig', rig, field: 'motionHost' }),
    /** Dashboard lockout active (`TEST IN PROGRESS — CONTROLS LOCKED`). */
    lockedOut: probe<boolean>({ p: 'hw.rig', rig, field: 'lockedOut' }),
    door: probe<'OPEN' | 'CLOSED'>({ p: 'hw.rig', rig, field: 'door' }),
  }),
  /** `hw.collis(C).*` (`collis-wall-e`). */
  collis: (collis: string) => ({
    power: probe<CollisPower>({ p: 'hw.collis', collis, field: 'power' }),
    ribbon: probe<ConnectorState>({ p: 'hw.collis', collis, field: 'ribbon' }),
    state: probe<CollisState>({ p: 'hw.collis', collis, field: 'state' }),
  }),
  /** `hw.device(D).*` — D = Orca device-row name or runtime device id. `screen` = current display screen name. */
  hwDevice: (device: string) => ({
    power: probe<OnOff>({ p: 'hw.device', device, field: 'power' }),
    state: probe<DeviceHwState>({ p: 'hw.device', device, field: 'state' }),
    adbTcpPort: probe<number | null>({ p: 'hw.device', device, field: 'adbTcpPort' }),
    activeMerchant: probe<string | null>({ p: 'hw.device', device, field: 'activeMerchant' }),
    psuOn: probe<boolean>({ p: 'hw.device', device, field: 'psuOn' }),
    screen: probe<string>({ p: 'hw.device', device, field: 'screen' }),
    secondaryScreen: probe<string | null>({ p: 'hw.device', device, field: 'secondaryScreen' }),
  }),
  /** `hw.camera(K).*` */
  camera: (camera: string) => ({
    svc: probe<SvcStatus>({ p: 'hw.camera', camera, field: 'svc' }),
    usb: probe<ConnectorState>({ p: 'hw.camera', camera, field: 'usb' }),
  }),
  /** `svc(host, name)` — hosts `pi-<rig>`, `pi-10.42.10.x`, `orca-vm`, `ollama-vm`, `minix-01`, `nuc-03` … */
  svc: (host: string, service: string) => probe<SvcStatus>({ p: 'svc', host, service }),
  /** `link(mfdDevice, cfdDevice)` — Pay Display link. */
  link: (mfd: string, cfd: string) => probe<LinkState>({ p: 'link', mfd, cfd }),
  /** `jenkins.job(path).*` */
  job: (job: string) => ({
    exists: probe<boolean>({ p: 'jenkins.job', job, field: 'exists' }),
    folder: probe<string | null>({ p: 'jenkins.job', job, field: 'folder' }),
    script: probe<string | null>({ p: 'jenkins.job', job, field: 'script' }),
    lastResult: probe<BuildResult | null>({ p: 'jenkins.job', job, field: 'lastResult' }),
    lastRobot: probe<string | null>({ p: 'jenkins.job', job, field: 'lastRobot' }),
    lastBuildId: probe<string | null>({ p: 'jenkins.job', job, field: 'lastBuildId' }),
    lastParam: (param: string) => probe<string | null>({ p: 'jenkins.lastParam', job, param }),
    /** `greenStreak(path, R)` */
    greenStreak: (robot: string | null = null) => probe<number>({ p: 'jenkins.greenStreak', job, robot }),
  }),
  /** Pipeline shortcut: `PL2` resolves to its job path. */
  pipelineGreenStreak: (pipeline: PipelineId, robot: string | null = null) => probe<number>({ p: 'jenkins.greenStreak', job: pipeline, robot }),
  adbConnections: probe<readonly string[]>({ p: 'adb.connections' }),
  /** `prop(file, key)` — properties value or null. */
  prop: (file: string, key: string) => probe<string | null>({ p: 'prop', file, key }),
  /** `fs(host, path)` */
  fs: (host: string, path: string) => ({
    exists: probe<boolean>({ p: 'fs', host, path, field: 'exists' }),
    contents: probe<string | null>({ p: 'fs', host, path, field: 'contents' }),
  }),
  /** `git(repo).main.file(path)` (any ref). */
  gitFile: (repo: string, path: string, ref = 'main') => ({
    exists: probe<boolean>({ p: 'git.file', repo, path, ref, field: 'exists' }),
    contents: probe<string | null>({ p: 'git.file', repo, path, ref, field: 'contents' }),
    parsesJson: probe<boolean>({ p: 'git.file', repo, path, ref, field: 'parsesJson' }),
    json: (pointer: string) => probe<string | number | boolean | null>({ p: 'git.json', repo, path, ref, pointer }),
  }),
  /** `git(repo).pr(n).*` */
  pr: (repo: string, pr: number | 'latest' = 'latest') => ({
    state: probe<PrState>({ p: 'git.pr', repo, pr, field: 'state' }),
    verdict: probe<PrVerdict>({ p: 'git.pr', repo, pr, field: 'verdict' }),
    commentTags: probe<readonly string[]>({ p: 'git.pr', repo, pr, field: 'commentTags' }),
    mergedBy: probe<string | null>({ p: 'git.pr', repo, pr, field: 'mergedBy' }),
    number: probe<number | null>({ p: 'git.pr', repo, pr, field: 'number' }),
  }),
  /** Static code predicate (sim doc §3.19.6). */
  codeFact: (fact: string, subject: string) => probe<boolean>({ p: 'code.fact', fact, subject }),
  /** `ide.localRun(test).*` (latest local run of that test); `streak` = `ide.localRunStreak(test)`. */
  localRun: (test: string) => ({
    result: probe<LocalRunResult>({ p: 'ide.localRun', test, field: 'result' }),
    robot: probe<string | null>({ p: 'ide.localRun', test, field: 'robot' }),
    overlappedJenkins: probe<boolean>({ p: 'ide.localRun', test, field: 'overlappedJenkins' }),
    streak: probe<number>({ p: 'ide.localRunStreak', test }),
  }),
  /** `coworker(riley).deviceIdle` */
  coworkerIdle: (who = 'riley') => probe<boolean>({ p: 'coworker.deviceIdle', who }),
  /** The owning ticket (`ticket.reply`, `ticket.call`, `ticket.escalation.{cause,endpoint}`, `bug.fields`). */
  ticket: {
    reply: probe<string | null>({ p: 'ticket', field: 'reply' }),
    call: probe<string | null>({ p: 'ticket', field: 'call' }),
    callCorrect: probe<boolean | null>({ p: 'ticket', field: 'callCorrect' }),
    escalationCause: probe<string | null>({ p: 'ticket', field: 'escalationCause' }),
    escalationEndpoint: probe<string | null>({ p: 'ticket', field: 'escalationEndpoint' }),
    status: probe<string>({ p: 'ticket', field: 'status' }),
    hintTier: probe<number>({ p: 'ticket', field: 'hintTier' }),
    bug: (field: string) => probe<string | number | null>({ p: 'ticket.bug', field }),
    match: (left: string) => probe<string | null>({ p: 'ticket.match', left }),
  },
  /** `counter(name)` — declared by the incident (`counters`) or step. */
  counter: (name: string) => probe<number>({ p: 'counter', name }),
  /** `truth(key)` — seeded ground truth stored on the binding. */
  truth: (key: string) => probe<string | number | boolean | null>({ p: 'truth', key }),
  flag: (flag: string) => probe<string | number | boolean | null>({ p: 'flag', flag }),
  v: (name: string) => probe<string | number | boolean | null>({ p: 'var', name }),
  player: {
    location: probe<string | null>({ p: 'player', field: 'location' }),
    lookingAt: probe<string | null>({ p: 'player', field: 'lookingAt' }),
    activeTool: probe<string>({ p: 'player', field: 'activeTool' }),
    carrying: probe<string | null>({ p: 'player', field: 'carrying' }),
    crouched: probe<boolean>({ p: 'player', field: 'crouched' }),
    fuseRating: probe<number>({ p: 'player', field: 'fuseRating' }),
  },
  overlay: probe<string>({ p: 'overlay' }),
  /** Escape hatch (dot path into RootState). */
  path: <T extends ProbeValue = ProbeValue>(path: string) => probe<T>({ p: 'path', path }),
} as const;

/* ═════════════════════════════ Event matchers ═════════════════════════════ */

/**
 * Matches a bus event. `where` = shallow equality on payload fields (arrays/objects compared as
 * JSON); `test` = extra predicate (payload, current state).
 */
export interface EventMatcher<K extends EventName = EventName> {
  event: K;
  where?: Partial<EventMap[K]>;
  test?: (payload: EventMap[K], state: RootState) => boolean;
}

/** Any event matcher (discriminated by `event`). */
export type AnyEventMatcher = { [K in EventName]: EventMatcher<K> }[EventName];

/** Build an event matcher. @example on('robot.statusChanged', { name: 'baymax', to: 'OFFLINE' }) */
export function on<K extends EventName>(
  event: K,
  where?: Partial<EventMap[K]>,
  test?: (payload: EventMap[K], state: RootState) => boolean,
): EventMatcher<K> {
  const m: EventMatcher<K> = { event };
  if (where) m.where = where;
  if (test) m.test = test;
  return m;
}

/* ═════════════════════════════ Conditions ═════════════════════════════ */

export type Comparator =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  /** |a − b| ≤ tolerance (numbers; null never matches). */
  | 'approx'
  /** value ∈ list. */
  | 'in'
  | 'notIn'
  /** string includes / array includes. */
  | 'contains'
  | 'notContains'
  /** RegExp source (+ `flags`). */
  | 'matches'
  | 'truthy'
  | 'falsy';

/** Event-history / invariant scope: the owner (step, ticket, cert task) or the whole activity run. */
export type ConditionScope = 'owner' | 'activity';

/** What a deferred `verify` waits for (GP §3.3 "next health check" / "next build"). */
export type DeferredTrigger =
  | { kind: 'health-check' }
  | {
      kind: 'build';
      /** Job paths accepted (any if omitted). */
      jobs?: readonly string[];
      /** Pipeline id (its job path). */
      pipeline?: PipelineId;
      /** Robots accepted (any if omitted). */
      robots?: readonly string[];
      /** Exact parameter values required (`{ CARD_PROFILE: 'INTERAC_CA_DIP' }`). */
      params?: Readonly<Record<string, string>>;
      /** Result required (default SUCCESS). */
      result?: BuildResult;
      /** Number of matching builds required (default 1; `greenStreak ≥ 3` → 3). */
      count?: number;
      /** Matching builds must cover this many different robots (INC20: PL3 green on two rigs). */
      distinctRobots?: number;
    }
  | { kind: 'local-run'; tests?: readonly string[]; passed?: boolean; count?: number }
  | { kind: 'event'; match: AnyEventMatcher; count?: number };

export type Condition =
  | { op: 'all'; of: readonly Condition[]; label?: string }
  | { op: 'any'; of: readonly Condition[]; label?: string }
  | { op: 'not'; of: Condition; label?: string }
  | {
      op: 'cmp';
      probe: ProbeSpec;
      cmp: Comparator;
      value?: ProbeValue | readonly ProbeValue[] | { probe: ProbeSpec };
      tolerance?: number;
      flags?: string;
      label?: string;
    }
  /** The event happened ≥ `min` times in scope. */
  | { op: 'happened'; match: AnyEventMatcher; min: number; scope: ConditionScope; label?: string }
  /** The events happened in this order (not necessarily adjacent) in scope. */
  | { op: 'sequence'; steps: readonly AnyEventMatcher[]; scope: ConditionScope; label?: string }
  /** Invariants sampled every tick since scope start: true at every sample / never true / true at least once (latched). */
  | { op: 'always' | 'never' | 'wasTrue'; of: Condition; scope: ConditionScope; label?: string }
  /** True continuously for `seconds` real seconds (latched once reached). */
  | { op: 'held'; of: Condition; seconds: number; label?: string }
  /** Deferred verification (see module docs). `then` is evaluated when the trigger fires. */
  | { op: 'verify'; on: DeferredTrigger; then?: Condition; label?: string }
  /** Escape hatch for checks no probe covers (file parses + contains an action, statusHistory spans a run …). */
  | { op: 'custom'; id: string; label: string; test: (state: RootState, ctx: ConditionContext) => boolean };

/** Context the evaluator passes to `custom` tests. */
export interface ConditionContext {
  scope: 'step' | 'ticket' | 'task' | 'objective' | 'achievement';
  /** Step id / ticket id / task id. */
  ownerId: string;
  ticket: TicketState | null;
  binding: IncidentBinding | null;
  /** Game ms / session real seconds when the owner scope started. */
  startedAtMs: number;
  startedAtS: number;
  elapsedS: number;
  /** Bus events since the owner scope started (bounded by the bus history). */
  events: readonly BusRecord[];
  counter(name: string): number;
  truth(key: string): string | number | boolean | null;
}

const cmp = (
  probeArg: ProbeSpec,
  comparator: Comparator,
  value?: ProbeValue | readonly ProbeValue[] | ProbeRef,
  extra?: { tolerance?: number; flags?: string },
): Condition => {
  const out: Extract<Condition, { op: 'cmp' }> = { op: 'cmp', probe: probeArg, cmp: comparator };
  if (value !== undefined) out.value = isRef(value) ? { probe: value.probe } : (value as ProbeValue | readonly ProbeValue[]);
  if (extra?.tolerance !== undefined) out.tolerance = extra.tolerance;
  if (extra?.flags !== undefined) out.flags = extra.flags;
  return out;
};

function isRef(v: unknown): v is ProbeRef {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'probe' in v;
}

/** Condition builders. */
export const c = {
  all: (...of: Condition[]): Condition => ({ op: 'all', of }),
  any: (...of: Condition[]): Condition => ({ op: 'any', of }),
  not: (of: Condition): Condition => ({ op: 'not', of }),
  /** Attach a HUD / verification label to any condition. */
  label: (cond: Condition, label: string): Condition => ({ ...cond, label }) as Condition,

  eq: <T extends ProbeValue>(probe: Probe<T>, value: NoInfer<T> | ProbeRef<T>) => cmp(probe, 'eq', value),
  neq: <T extends ProbeValue>(probe: Probe<T>, value: NoInfer<T> | ProbeRef<T>) => cmp(probe, 'neq', value),
  lt: (probe: Probe<number | null> | Probe<number>, value: number | ProbeRef) => cmp(probe, 'lt', value),
  lte: (probe: Probe<number | null> | Probe<number>, value: number | ProbeRef) => cmp(probe, 'lte', value),
  gt: (probe: Probe<number | null> | Probe<number>, value: number | ProbeRef) => cmp(probe, 'gt', value),
  gte: (probe: Probe<number | null> | Probe<number>, value: number | ProbeRef) => cmp(probe, 'gte', value),
  /** |probe − value| ≤ tolerance (e.g. screen locations ±0.5 mm, GIMP boxes ±3 px). */
  approx: (probe: Probe<number | null> | Probe<number>, value: number | ProbeRef, tolerance: number) => cmp(probe, 'approx', value, { tolerance }),
  oneOf: <T extends ProbeValue>(probe: Probe<T>, values: readonly NoInfer<T>[]) => cmp(probe, 'in', values),
  notOneOf: <T extends ProbeValue>(probe: Probe<T>, values: readonly NoInfer<T>[]) => cmp(probe, 'notIn', values),
  contains: (probe: Probe<string | null> | Probe<readonly string[]> | Probe<string>, item: string) => cmp(probe, 'contains', item),
  notContains: (probe: Probe<string | null> | Probe<readonly string[]> | Probe<string>, item: string) => cmp(probe, 'notContains', item),
  matches: (probe: Probe<string | null> | Probe<string>, regex: string, flags?: string) =>
    cmp(probe, 'matches', regex, flags === undefined ? undefined : { flags }),
  truthy: (probe: Probe) => cmp(probe, 'truthy'),
  falsy: (probe: Probe) => cmp(probe, 'falsy'),
  /** a == b (e.g. MFD IP == CFD IP for a Station Duo). */
  same: <T extends ProbeValue>(a: Probe<T>, b: Probe<T>) => cmp(a, 'eq', { probe: b }),
  /** Reference another probe as the right-hand side. */
  ref: <T extends ProbeValue>(probe: Probe<T>): ProbeRef<T> => ({ probe }),

  /** ∀x∈items: fn(x) (expanded at authoring time). */
  forAll: <T>(items: readonly T[], fn: (item: T) => Condition): Condition => ({ op: 'all', of: items.map(fn) }),
  /** ∃x∈items: fn(x). */
  forAny: <T>(items: readonly T[], fn: (item: T) => Condition): Condition => ({ op: 'any', of: items.map(fn) }),

  /** Sugar: `orca.robot(R).status == S`. */
  status: (robot: string, status: RobotStatus): Condition => cmp(p.robot(robot).status, 'eq', status),

  /** The event happened (≥ `min` times) in scope. */
  happened: (match: AnyEventMatcher, opts: { min?: number; scope?: ConditionScope } = {}): Condition => ({
    op: 'happened',
    match,
    min: opts.min ?? 1,
    scope: opts.scope ?? 'owner',
  }),
  /** The events happened in this order. */
  sequence: (...steps: AnyEventMatcher[]): Condition => ({ op: 'sequence', steps, scope: 'owner' }),
  always: (of: Condition, scope: ConditionScope = 'owner'): Condition => ({ op: 'always', of, scope }),
  never: (of: Condition, scope: ConditionScope = 'owner'): Condition => ({ op: 'never', of, scope }),
  wasTrue: (of: Condition, scope: ConditionScope = 'owner'): Condition => ({ op: 'wasTrue', of, scope }),
  held: (of: Condition, seconds: number): Condition => ({ op: 'held', of, seconds }),

  /** Deferred verification on a trigger (GP "next health check" / "next build"). */
  verify: (on: DeferredTrigger, opts: { then?: Condition; label?: string } = {}): Condition => {
    const out: Extract<Condition, { op: 'verify' }> = { op: 'verify', on };
    if (opts.then) out.then = opts.then;
    if (opts.label) out.label = opts.label;
    return out;
  },
  /** "(at the next health check)". */
  nextHealthCheck: (then?: Condition): Condition => c.verify({ kind: 'health-check' }, then ? { then } : {}),
  /** "next build on R == SUCCESS", "next PL5 == SUCCESS", "next PL6 robot ∈ {data, tars}". */
  nextBuild: (trigger: Omit<Extract<DeferredTrigger, { kind: 'build' }>, 'kind'> = {}, then?: Condition): Condition =>
    c.verify({ kind: 'build', ...trigger }, then ? { then } : {}),

  /**
   * A workstation UI fact happened (`app.action`, apps doc Appendix B), e.g. "Notes opened":
   * `c.appAction('orca', 'orca.robot.notesOpened', (d) => d.name === 'eve')`. Use sim-state probes
   * whenever the curriculum's success column is a sim fact (Cur §2.0).
   */
  appAction: (app: string, action: string, test?: (data: Record<string, unknown>) => boolean): Condition =>
    c.happened(on('app.action', { app, action }, test ? (pl) => test(pl.data ?? {}) : undefined)),
  /** The player visited an app route (`app.navigated`); `route` is a prefix or a predicate. */
  visited: (app: string, route: string | ((route: string) => boolean)): Condition =>
    c.happened(on('app.navigated', { app }, (pl) => (typeof route === 'string' ? pl.route.startsWith(route) : route(pl.route)))),

  custom: (id: string, label: string, test: (state: RootState, ctx: ConditionContext) => boolean): Condition => ({ op: 'custom', id, label, test }),
} as const;

/** Objective = HUD line + condition (Academy steps with several parts, cert practical tasks). */
export interface ObjectiveDef {
  id: string;
  text: string;
  done: Condition;
  /** Shown when the objective has been open for a while (Strict realism hides it). */
  hint?: string;
  optional?: boolean;
}
