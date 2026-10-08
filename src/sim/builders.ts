/**
 * Entity builders with Sim §2 factory defaults (seeds and other modules' test fixtures use them so
 * contract additions never break hand-written literals). Re-exported by `initialState.ts` and `@/sim`.
 */
import type { TerminalDevice, DeviceTypeCode, DisplayState, Host, HostKind, OrcaRobot, OrderState, RigKind, RigState, ScreenName } from './types';

/* ────────────────────────────── Entity builders (seeds and test fixtures) ──────────────────────────────
 * Complete v2 objects with the factory defaults of Sim §2.3–§2.5; pass overrides for what differs.
 * sim-core seeds use them; other modules' test fixtures should use them instead of hand-written literals
 * so contract additions never break fixtures.
 */

/** A display on `screen` with no transient state (rendered, no toast). */
export function createDisplayState(screen: ScreenName = 'home', overrides: Partial<DisplayState> = {}): DisplayState {
  return {
    screen,
    params: {},
    rev: 0,
    brightness: screen === 'off' ? 0 : 1,
    autoAdvanceAtMs: null,
    renderDoneMs: 0,
    toast: null,
    strokes: 0,
    pinDigits: 0,
    ...overrides,
  };
}

/** An empty open order (Sim §1.5). */
export function createOrderState(id: string, overrides: Partial<OrderState> = {}): OrderState {
  return {
    id,
    lines: [],
    subtotalCents: 0,
    taxCents: 0,
    tipCents: 0,
    totalCents: 0,
    status: 'open',
    cardProfileId: null,
    receiptChoice: null,
    cardAdjustCents: 0,
    tender: null,
    entry: null,
    pinTries: 0,
    authCode: null,
    tipPct: null,
    ...overrides,
  };
}

/** A rig in its factory state (Sim §2.3 "Physical placement"): parked & homed at (0,0), lock engaged, green. */
export function createRigState(id: string, orcaRobotId: number, kind: RigKind, overrides: Partial<RigState> = {}): RigState {
  const hasGantry = kind === 'touch' || kind === 'standalone';
  return {
    id,
    orcaRobotId,
    kind,
    hasGantry,
    gantry: {
      xMm: 0,
      yMm: 0,
      targetXMm: 0,
      targetYMm: 0,
      maxXMm: 0,
      maxYMm: 0,
      speedMmS: 120,
      moving: false,
      homed: hasGantry,
      limitXHit: hasGantry,
      limitYHit: hasGantry,
      minXMm: -10,
      minYMm: -10,
      homingSpeedMmS: 60,
    },
    steppersEnabled: true,
    solenoid: { down: false, heightAdjustMm: 0, lastTapMs: null, taps: 0, mode: 'fast' },
    dipArm: 'retracted',
    tapArm: 'retracted',
    phonePusher: 'retracted',
    magneticLock: { engaged: hasGantry, brokenAtMs: null },
    banner: 'green',
    dashboardLocked: false,
    mainSwitch: true,
    motorSwitch: true,
    queue: [],
    piHostId: null,
    callusHostId: null,
    collisId: null,
    deviceIds: [],
    webcam: { connected: false, aimedOk: true, cameraId: null, aimOffsetDeg: { yaw: 0, pitch: 0 } },
    tablet: { tab: 'robot', statusText: 'Status: OK', brainbox: 'Brainbox v6', hrnShown: id.toUpperCase(), reachable: true },
    shelfPropId: null,
    offscreen: false,
    probeDisplay: hasGantry ? 'primary' : null,
    limitSwitchOk: { x: true, y: true },
    solenoidConnector: 'SEATED',
    dipArmAligned: true,
    dipArmToothOffset: 0,
    phonePowerPress: null,
    phone: { mounted: null },
    pushAccumMm: 0,
    door: 'closed',
    bannerText: 'Status: OK',
    motionFault: null,
    lockedBy: null,
    current: null,
    currentEndsPhysMs: null,
    motionHost: 'PI',
    cradle: 'OK',
    cradleTiltDeg: 0,
    assembly: 'complete',
    ...overrides,
  };
}

/** A powered, provisioned lab device on `home` (Sim §2.4 runtime seeds). */
export function createTerminalDevice(id: string, type: DeviceTypeCode, overrides: Partial<TerminalDevice> = {}): TerminalDevice {
  const handheld = type.startsWith('FLEX');
  const printerless = type === 'FLEX_POCKET' || type === 'STATION_DUO_2' || type === 'STATION_DUO_3' || type === 'COMPACT';
  const duo = type.startsWith('STATION_DUO');
  const firmware = type === 'FLEX_1' ? { version: '2.19.4', receiptQr: false } : { version: '2.26.10.1', receiptQr: true };
  return {
    id,
    type,
    serial: '',
    ip: '',
    adbPort: 5444,
    adbEnabled: true,
    power: 'on',
    bootProgress: 1,
    supply: { kind: 'none', targetId: null },
    rigId: null,
    role: duo ? 'duo' : 'standalone',
    tetheredTo: null,
    link: null,
    payDisplayApp: null,
    merchantConfigId: null,
    provisioned: true,
    theme: 'avocado',
    kernel: 'CPA',
    passcode: '0000',
    display: createDisplayState('home'),
    secondaryDisplay: duo ? createDisplayState('customer-idle') : null,
    order: null,
    apps: [],
    firmware: firmware.version,
    cardPresent: null,
    lastReceipt: null,
    orcaDeviceName: id.startsWith('dev-') ? id.slice(4) : id,
    state: 'OK',
    adbTcpPort: 5444,
    bootStartedPhysMs: null,
    dead: false,
    payDisplayLink: null,
    hubEthernet: true,
    hubUsbToPeer: true,
    locked: false,
    firmwareInfo: firmware,
    launcher: { page: 0, apps: [] },
    cfdLayout: 'v1',
    labelShiftPx: 0,
    printer: { present: !printerless, paper: !printerless, lastPayloadMs: null },
    lastReceiptDoc: null,
    secureTouch: false,
    logcat: [],
    battery: handheld ? { pct: 100, charging: true } : null,
    ...overrides,
  };
}

/** A running, linked host with no services (Sim §1.6, §2.5). */
export function createHost(id: string, kind: HostKind, hostname: string, ip: string, overrides: Partial<Host> = {}): Host {
  const bootDurationMs = kind === 'pi' ? 40_000 : kind === 'nuc' || kind === 'minix' ? 50_000 : kind === 'vm' ? 45_000 : kind === 'blade' ? 90_000 : 30_000;
  return {
    id,
    kind,
    hostname,
    ip,
    os: 'RUNNING',
    power: 'on',
    bootProgress: 1,
    ethernet: true,
    supply: { kind: 'none', targetId: null },
    services: {},
    diskUsedPct: 0,
    diskTotalGb: 0,
    cpuTempC: 45,
    uptimeMs: 0,
    owner: null,
    propId: null,
    osName: '',
    aliases: [],
    eth: 'LINKED',
    underVoltage: false,
    bootStartedPhysMs: null,
    bootDurationMs,
    diskUsedGb: 0,
    files: {},
    journal: {},
    schedTasks: {},
    usb: [],
    offscreen: false,
    ...overrides,
  };
}

/** An Orca robot row with factory defaults (Sim §1.3.2); status AVAILABLE, no notes. */
export function createOrcaRobot(id: number, name: string, rigKind: RigKind, overrides: Partial<OrcaRobot> = {}): OrcaRobot {
  return {
    id,
    name,
    humanReadableName: name.toUpperCase(),
    status: 'AVAILABLE',
    rigKind,
    environment: 'DEV1',
    deviceId: null,
    mfdDeviceId: null,
    cfdDeviceId: null,
    adbServiceUrl: '',
    cameraStreamUrl: '',
    dipUrl: null,
    tapUrl: null,
    swipeUrl: null,
    offsetXMm: 0,
    offsetYMm: 0,
    capabilityIds: [],
    merchantConfigId: null,
    reservedBy: null,
    checkout: null,
    lastHealthCheckMs: null,
    lastHealthCheckOk: null,
    notes: [],
    physical: false,
    location: '',
    description: '',
    preFailureStatus: null,
    statusChangedMs: 0,
    statusHistory: [],
    reservedAtMs: null,
    lastReleasedMs: null,
    lastHealth: null,
    ...overrides,
  };
}
