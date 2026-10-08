/**
 * Canvas-2D renderers shared by the 3D world (as CanvasTextures on device screens / the status
 * tablet) and by the workstation apps (GIMP screenshots, camera viewer overlays, Orca previews).
 * Pure Canvas2D + sim state — no three.js, no React. Implemented in `src/render2d/*`
 * (`deviceScreens/*.ts`, `tablet.ts`, `receipt.ts`, `shared/theme.ts`, `shared/labLogo.ts`).
 *
 * Layout truth: button rectangles come from the device "firmware" layouts in the sim
 * (`@/sim/devices/layouts`, World §4 tables), which is also what touch hit-testing uses — so what
 * is drawn is exactly what the robot can hit. This file carries the World §4.1–§4.2 rendering
 * rules and the full §5 status-tablet layout (the 3D texture and the React tablet overlay draw the
 * same rects from these constants).
 */
import type { QualityPreset } from '@/core/state';
import type { RigCommandName } from '@/sim/events';
import type { BannerColor, TerminalDevice, DeviceTypeCode, LabState, OrcaRobot, RigState } from '@/sim/types';

/* ───────────────────────────── Fonts & palette (World §0.1, §4.1) ───────────────────────────── */

/** Canvas font stacks (system fonts only — no downloads). */
export const FONTS = {
  UI_SANS: 'Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  /** UI_SANS at weight 300 (clock digits). */
  UI_THIN: 'Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  UI_THIN_WEIGHT: 300,
  /** Label-maker tape, weight 700. */
  LABEL: '"Arial Narrow", Arial, "Helvetica Neue", sans-serif',
  MONO: '"DejaVu Sans Mono", Menlo, Consolas, monospace',
} as const;

/** The *avocado* theme (config.properties `theme=avocado`). */
export const SCREEN_PALETTE = {
  green: '#2e9e4f',
  greenDark: '#1f7a3b',
  greenSoft: '#e6f4ea',
  ink: '#1f2328',
  inkMuted: '#6b7280',
  line: '#c9cdd3',
  bgMerchant: '#f4f5f7',
  bgPanel: '#eef2f7',
  bgCustomer: '#a9c8f2',
  navy: '#1f2b4a',
  cancel: '#e8336b',
  clear: '#f2d21b',
  ok: '#2fbf5a',
  approved: '#2bb24c',
  declined: '#d83a3a',
  lockBg: '#04060a',
  lockBg2: '#0b1220',
  lockClock: '#8fb8ff',
  /** `legacy` theme header (only reachable through faults) + `LEGACY THEME` watermark. */
  legacyHeader: '#5f6368',
} as const;

/** Launcher tile colours (white glyphs). */
export const APP_ICON_COLORS: Readonly<Record<string, string>> = {
  Register: '#2e9e4f',
  Orders: '#3b82f6',
  Transactions: '#8b5cf6',
  Sale: '#f59e0b',
  Authorizations: '#ef4444',
  Customers: '#14b8a6',
  Items: '#84cc16',
  Reports: '#6366f1',
  Employees: '#ec4899',
  Inventory: '#0ea5e9',
  Rewards: '#eab308',
  'Gift Cards': '#f97316',
  Help: '#64748b',
  'App Market': '#10b981',
  Settings: '#475569',
  Setup: '#2563eb',
  Dining: '#b45309',
};

/* ───────────────────────────── Layout classes (World §4.2) ───────────────────────────── */

/** P = 68.0 × 136.0 (Flex 2/3/4/Pocket) · P-s = 62.3 × 110.7 (Flex 1, Compact) · L8 = 172.3 × 107.7 (Minis, Station 2, Duo CFD) · L14 = 309.9 × 174.3 (Station 2018, Duo MFD). */
export type LayoutClass = 'P' | 'P-s' | 'L8' | 'L14';

export const LAYOUT_CLASS_SIZE_MM: Readonly<Record<LayoutClass, { w: number; h: number }>> = {
  P: { w: 68.0, h: 136.0 },
  'P-s': { w: 62.3, h: 110.7 },
  L8: { w: 172.3, h: 107.7 },
  L14: { w: 309.9, h: 174.3 },
};

/**
 * Derived classes: P-s = P scaled (x·0.91618, y·0.81397, fonts·0.814), L14 = L8 scaled
 * (x·1.79861, y·1.61838, fonts·1.618), rounded to 0.1 mm — EXCEPT receipt pills (keep 5.0 mm
 * height) and the receipt QR shift (stays 3.0 mm).
 */
export const LAYOUT_DERIVATION: Readonly<Record<'P-s' | 'L14', { from: 'P' | 'L8'; sx: number; sy: number; font: number }>> = {
  'P-s': { from: 'P', sx: 0.91618, sy: 0.81397, font: 0.814 },
  L14: { from: 'L8', sx: 1.79861, sy: 1.61838, font: 1.618 },
};

const PRIMARY_CLASS: Readonly<Record<DeviceTypeCode, LayoutClass | null>> = {
  FLEX_2: 'P',
  FLEX_3: 'P',
  FLEX_4: 'P',
  FLEX_POCKET: 'P',
  FLEX_1: 'P-s',
  COMPACT: 'P-s',
  MINI_2: 'L8',
  MINI_3: 'L8',
  MINI_4: 'L8',
  STATION_2: 'L8',
  STATION_2018: 'L14',
  STATION_DUO: 'L14',
  STATION_DUO_2: 'L14',
  STATION_DUO_3: null,
};

/** Layout class of a display (Duo family: MFD = L14, CFD = L8). Null = no screen (sealed boxes). */
export function layoutClassFor(type: DeviceTypeCode, display: 'primary' | 'secondary' = 'primary'): LayoutClass | null {
  if (display === 'secondary') return type.startsWith('STATION_DUO') && type !== 'STATION_DUO_3' ? 'L8' : null;
  return PRIMARY_CLASS[type];
}

/** P/P-s launchers scroll vertically in 22 mm rows; L8/L14 page horizontally (10 apps per page). */
export const LAUNCHER = {
  P: { scroll: 'vertical', rowMm: 22 },
  'P-s': { scroll: 'vertical', rowMm: 22 * 0.81397 },
  L8: { scroll: 'horizontal', appsPerPage: 10 },
  L14: { scroll: 'horizontal', appsPerPage: 10 },
} as const;

/** Button corner radius by class. Primary = green fill, white text; secondary = white, `line` border. */
export const BUTTON_RADIUS_MM: Readonly<Record<LayoutClass, number>> = { P: 1.5, 'P-s': 1.5, L8: 2.0, L14: 3.2 };

/** Text sizes are font-size in mm (cap height ≈ 0.72 × size). */
export const CAP_HEIGHT_RATIO = 0.72;

/** Touch feedback (§4.1): every touch draws a ripple and a grey dot that stays 1 s. */
export const TOUCH_FEEDBACK = {
  ripple: { fromMm: 0, toMm: 6, durationMs: 300, dark: { color: '#ffffff', alpha: 0.35 }, light: { color: '#1f2328', alpha: 0.25 } },
  dot: { diameterMm: 1.2, color: '#8a8a8a', durationMs: 1000 },
  /** `flags.showTouchTargets`: outline every ● rect 1 px magenta with its id in 1.6 mm text. */
  targets: { color: '#ff00ff', lineWidthPx: 1, labelMm: 1.6 },
} as const;

/** Currency prefix: `CA$` when the merchant country is CA, else `$`. */
export function currencyPrefix(country: 'US' | 'CA' | null | undefined): string {
  return country === 'CA' ? 'CA$' : '$';
}

/* ───────────────────────────── Screen texture sizing (World §3.5, §7.4) ───────────────────────────── */

/** Device screen canvas resolution per preset: px/mm, capped on the long side. */
export const SCREEN_PX_PER_MM: Readonly<Record<QualityPreset, { pxPerMm: number; capPx: number }>> = {
  low: { pxPerMm: 3, capPx: 512 },
  medium: { pxPerMm: 4, capPx: 768 },
  high: { pxPerMm: 6, capPx: 1024 },
  ultra: { pxPerMm: 8, capPx: 1536 },
};

/** Focused / inspected devices re-render at native resolution, max 2048 px on the long side. */
export const FOCUSED_SCREEN_MAX_PX = 2048;

/** Unlit screen material colour multiplier (peak white 1.12 × ACES ≈ 0.86 < bloom threshold). */
export const SCREEN_BRIGHTNESS_SCALE = 1.12;

/** Canvas size for a display of w × h mm at a preset (capped, aspect preserved). */
export function screenCanvasSize(wMm: number, hMm: number, preset: QualityPreset): { w: number; h: number; pxPerMm: number } {
  const { pxPerMm, capPx } = SCREEN_PX_PER_MM[preset];
  const scale = Math.min(pxPerMm, capPx / Math.max(wMm, hMm));
  return { w: Math.ceil(wMm * scale), h: Math.ceil(hMm * scale), pxPerMm: scale };
}

export interface DisplayRenderOptions {
  /** Output pixels per millimetre of screen. */
  pxPerMm: number;
  /** Draw translucent touch-target rectangles with button ids (tutorial helper). */
  showTouchTargets?: boolean;
  /** Draw the last probe tap ripple, if recent (needs `ripple`). */
  showTapRipple?: boolean;
  /** Most recent touch on this display (from `device.touched`), with its age. */
  ripple?: { xMm: number; yMm: number; ageMs: number } | null;
  /** Physical clock ms for animations (spinner 1 rev/s, boot dots 3 Hz, screensaver drift, icon pulse). */
  timeMs?: number;
}

/* ───────────────────────────── Status tablet (World §5) ───────────────────────────── */

export type TabletTab = 'robot' | 'robot-control' | 'motion-control';

export interface PxRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Logical canvas = the 172.3 × 107.7 mm active area (7.43 px/mm). Lower presets scale the canvas. */
export const TABLET_CANVAS = { w: 1280, h: 800, activeMm: { w: 172.3, h: 107.7 }, pxPerMm: 7.43 } as const;

export const TABLET_CANVAS_BY_PRESET: Readonly<Record<QualityPreset, { w: number; h: number }>> = {
  low: { w: 512, h: 320 },
  medium: { w: 768, h: 480 },
  high: { w: 1024, h: 640 },
  ultra: { w: 1280, h: 800 },
};

export const TABLET_LAYOUT = {
  frameBg: '#6aa0e0',
  header: { x: 0, y: 0, w: 1280, h: 112 } as PxRect,
  robotName: { x: 150, baseline: 82, font: 'UI_SANS', weight: 800, sizePx: 64, color: '#121212', maxWidthPx: 380 },
  logo: { x0: 560, x1: 860, baseline: 78, leafRadiusPx: 15, leafGapPx: 4, wordmarkPx: 56, wordmarkWeight: 600, color: 'rgba(255,255,255,0.55)' },
  statusLine: { x: 1000, baseline: 46, sizePx: 22, minSizePx: 15, weight: 500, color: '#1a1a1a', maxWidthPx: 270, prefix: 'Status: ' },
  boardLine: { x: 1000, baseline: 76, sizePx: 22, color: '#1a1a1a' },
  tabs: {
    robot: { x: 0, y: 112, w: 427, h: 48 } as PxRect,
    'robot-control': { x: 427, y: 112, w: 426, h: 48 } as PxRect,
    'motion-control': { x: 853, y: 112, w: 427, h: 48 } as PxRect,
  } as Readonly<Record<TabletTab, PxRect>>,
  tabLabels: { robot: 'Robot', 'robot-control': 'Robot Control', 'motion-control': 'Motion Control' } as Readonly<Record<TabletTab, string>>,
  tabColors: { unselected: '#6aa0e0', selected: '#18803c', label: '#ffffff', labelPx: 22 },
  contentPanel: { x: 40, y: 160, w: 1200, h: 616, color: '#1d2741' } as PxRect & { color: string },
  heartbeat: { x: 782, y: 178, r: 7, up: '#39e46b', down: '#6b7280', hz: 1 },
  quipStrip: { rect: { x: 40, y: 196, w: 1200, h: 40 } as PxRect, bg: 'rgba(0,0,0,0.35)', textX: 60, baseline: 224, sizePx: 22, showMs: 6000 },
} as const;

/** Header gradients by banner (stops 0..1). Banner changes wipe left → right over 300 ms. */
export const TABLET_HEADER_GRADIENTS: Readonly<Record<BannerColor, readonly (readonly [number, string])[]>> = {
  green: [[0, '#1fcf4f'], [0.45, '#2bd862'], [0.7, '#3fdc9a'], [0.86, '#52c9d6'], [1, '#5ab7ee']],
  yellow: [[0, '#f2c12e'], [0.5, '#f7d86a'], [1, '#f2e08c']],
  grey: [[0, '#8b9099'], [1, '#a3a8b0']],
  red: [[0, '#e04b3c'], [1, '#ef7a5a']],
};

export const BANNER_WIPE_MS = 300;

/** Colour-blind mode prefixes the status with a glyph. */
export const BANNER_GLYPH: Readonly<Record<BannerColor, string>> = { green: '●', yellow: '▲', grey: '■', red: '✖' };

/** Recommended `RigState.tablet.statusText` values (World D5); the tablet prints `Status: <text>`. */
export const TABLET_STATUS_TEXT = {
  ok: 'OK',
  lockReleased: 'LOCK RELEASED — PARK REQUIRED',
  notHomed: 'NOT HOMED — PARK REQUIRED',
  unreachable: 'Controller unreachable',
  faultPrefix: 'FAULT — ',
} as const;

export const TABLET_BUTTON_STYLE = {
  radiusPx: 10,
  gapPx: 6,
  labelPx: 26,
  labelWeight: 500,
  labelShadow: 'rgba(0,0,0,0.25)',
  blue: { base: '#1e88e5', top: '#2b95f2', bottom: '#1a7fd6' },
  yellow: { base: '#d4b94c', top: '#dcc35a', bottom: '#cbb044' },
  green: { base: '#2e9e4f', top: '#36b25a', bottom: '#268a44' },
  groupLabel: { sizePx: 22, weight: 700, color: '#ffffff', baseline: 330 },
  /** Current-state highlight: 4 px white inner outline, +10 % brightness. */
  activeOutlinePx: 4,
  activeBrighten: 0.1,
  /** Pressed: darken 18 % and shift 2 px down for 120 ms (+ `tablet-tap`). */
  pressedDarken: 0.18,
  pressedShiftPx: 2,
  pressedMs: 120,
  /** Rejected (sim error): flash #e04b3c for 200 ms (+ `ui-fail`). */
  rejectColor: '#e04b3c',
  rejectMs: 200,
  /** Park group pulses (outline α 0.4 ↔ 1, 1 Hz) while the banner is yellow. */
  parkPulseHz: 1,
} as const;

export interface TabletButton {
  readonly id: string;
  readonly tab: TabletTab;
  readonly group: string;
  /** Label lines (Push / Power / Button is three lines, 24 px, line-height 30). */
  readonly lines: readonly string[];
  readonly color: 'blue' | 'yellow' | 'green';
  readonly rect: PxRect;
  readonly command: RigCommandName;
  /** Fixed args for move/tap commands (jog buttons compute theirs from the step). */
  readonly args?: { readonly xMm?: number; readonly yMm?: number };
  /** State in which this button gets the "current state" highlight. */
  readonly activeWhen?: string;
  readonly illustrative?: boolean;
}

/** Group headers of the Motion Control tab: centre x and width. */
export const MOTION_GROUPS: readonly { readonly name: string; readonly cx: number; readonly w: number }[] = [
  { name: 'Steppers', cx: 183, w: 150 },
  { name: 'Park', cx: 387, w: 150 },
  { name: 'Dip', cx: 582, w: 104 },
  { name: 'Tap', cx: 772, w: 100 },
  { name: 'Phone', cx: 955, w: 150 },
  { name: 'Solenoid', cx: 1132, w: 118 },
];

const mb = (id: string, group: string, lines: string[], color: 'blue' | 'yellow', x: number, y: number, w: number, h: number, command: RigCommandName, activeWhen?: string): TabletButton => ({
  id, tab: 'motion-control', group, lines, color, rect: { x, y, w, h }, command, ...(activeWhen ? { activeWhen } : {}),
});

/** Motion Control tab — exact (IMG-T). */
export const TABLET_MOTION_BUTTONS: readonly TabletButton[] = [
  mb('steppers.enable', 'Steppers', ['Enable'], 'blue', 108, 342, 150, 64, 'steppers.enable', 'steppersEnabled'),
  mb('steppers.disable', 'Steppers', ['Disable'], 'yellow', 108, 412, 150, 64, 'steppers.disable', '!steppersEnabled'),
  mb('park.all', 'Park', ['Park All'], 'blue', 312, 342, 150, 64, 'park.all'),
  mb('park.xy', 'Park', ['XY'], 'yellow', 312, 412, 150, 64, 'park.xy'),
  mb('park.x', 'Park', ['X'], 'yellow', 312, 482, 150, 64, 'park.x'),
  mb('park.y', 'Park', ['Y'], 'yellow', 312, 552, 150, 64, 'park.y'),
  mb('dip.in', 'Dip', ['In'], 'blue', 530, 342, 104, 64, 'dip.in', "dipArm in ('extended','extending')"),
  mb('dip.out', 'Dip', ['Out'], 'yellow', 530, 412, 104, 64, 'dip.out', "dipArm in ('retracted','retracting')"),
  mb('tap.in', 'Tap', ['In'], 'blue', 722, 342, 100, 64, 'tap.in', "tapArm in ('extended','extending')"),
  mb('tap.out', 'Tap', ['Out'], 'yellow', 722, 412, 100, 64, 'tap.out', "tapArm in ('retracted','retracting')"),
  mb('phone.forward', 'Phone', ['Forward'], 'blue', 880, 342, 150, 64, 'phone.forward', "phonePusher in ('extended','extending')"),
  mb('phone.back', 'Phone', ['Back'], 'yellow', 880, 412, 150, 64, 'phone.back', "phonePusher in ('retracted','retracting')"),
  mb('phone.pushPower', 'Phone', ['Push', 'Power', 'Button'], 'blue', 880, 482, 150, 134, 'phone.pushPower'),
  mb('solenoid.down', 'Solenoid', ['Down'], 'blue', 1073, 342, 118, 64, 'solenoid.down', 'solenoid.down'),
  mb('solenoid.up', 'Solenoid', ['Up'], 'yellow', 1073, 412, 118, 64, 'solenoid.up', '!solenoid.down'),
  mb('solenoid.lower', 'Solenoid', ['Lower'], 'blue', 1073, 482, 118, 64, 'solenoid.lower'),
  mb('solenoid.raise', 'Solenoid', ['Raise'], 'yellow', 1073, 552, 118, 64, 'solenoid.raise'),
];

const rc = (id: string, lines: string[], color: 'blue' | 'yellow' | 'green', x: number, y: number, w: number, h: number, command: RigCommandName, args?: { xMm?: number; yMm?: number }): TabletButton => ({
  id, tab: 'robot-control', group: 'Robot Control', lines, color, rect: { x, y, w, h }, command, illustrative: true, ...(args ? { args } : {}),
});

/** Robot Control tab (†, sim-only conveniences; every button maps to an existing command). */
export const TABLET_ROBOT_CONTROL_BUTTONS: readonly TabletButton[] = [
  rc('jog.up', ['▲'], 'blue', 345, 314, 110, 80, 'move.to'),
  rc('jog.left', ['◀'], 'blue', 229, 400, 110, 80, 'move.to'),
  rc('jog.tap', ['Tap'], 'green', 345, 400, 110, 80, 'tap.at'),
  rc('jog.right', ['▶'], 'blue', 461, 400, 110, 80, 'move.to'),
  rc('jog.down', ['▼'], 'blue', 345, 486, 110, 80, 'move.to'),
  rc('goto.origin', ['Go to (0,0)'], 'yellow', 670, 300, 300, 70, 'move.to', { xMm: 0, yMm: 0 }),
  rc('goto.centre', ['Go to centre'], 'yellow', 670, 390, 300, 70, 'move.to'),
  rc('wake', ['Wake screen'], 'blue', 670, 480, 300, 70, 'phone.pushPower'),
];

/** Jog directions (▲ = −Y toward the screen top, ▼ +Y, ◀ −X, ▶ +X) and the step selector. */
export const TABLET_JOG = {
  dir: { 'jog.up': [0, -1], 'jog.down': [0, 1], 'jog.left': [-1, 0], 'jog.right': [1, 0] } as Readonly<Record<string, readonly [number, number]>>,
  stepSelector: { rect: { x: 220, y: 600, w: 360, h: 56 } as PxRect, stepsMm: [0.1, 1, 10] as readonly number[], labels: ['0.1 mm', '1 mm', '10 mm'] as readonly string[] },
  readout: { x: 670, y: 600 },
} as const;

/** Robot tab (†): key/value list + gantry mini-map. */
export const TABLET_ROBOT_TAB = {
  labelX: 80,
  valueX: 420,
  firstBaseline: 230,
  pitch: 48,
  labelStyle: { sizePx: 22, color: '#9fb3d6' },
  valueStyle: { sizePx: 24, color: '#ffffff' },
  rows: ['Name', 'Human Readable Name', 'Orca status', 'Device', 'Device IP', 'Robot Pi', 'Camera', 'Last health check', 'Magnetic lock'] as readonly string[],
  statusChips: { AVAILABLE: '#2e9e4f', UNAVAILABLE: '#8b5cf6', OFFLINE: '#6b7280', CONNECTION_FAILED: '#dc2626', RESERVED: '#2563eb' } as Readonly<Record<string, string>>,
  miniMap: { rect: { x: 760, y: 200, w: 440, h: 300 } as PxRect, dotPx: 12, ok: '#39e46b', released: '#f2c12e', readoutBaseline: 540, homeBaseline: 572, homeText: 'Home = limit switches (0,0)' },
} as const;

/** Lockout overlay (`dashboardLocked`); any tap shakes it ±6 px for 200 ms (+ quiet `ui-fail`). */
export const TABLET_LOCKOUT = {
  rect: { x: 0, y: 112, w: 1280, h: 688 } as PxRect,
  bg: 'rgba(8,12,22,0.80)',
  padlock: { x: 640, y: 330, sizePx: 96 },
  line1: { text: 'TEST IN PROGRESS — CONTROLS LOCKED', sizePx: 34, weight: 700, color: '#ffffff', baseline: 450 },
  /** `<job> #<n>`, e.g. `Java/uia-remote-regression-flex #4120`. */
  line2: { sizePx: 24, color: '#b9c6dc', baseline: 492 },
  line3: { text: 'Checked out via Orca · unlocks when the build finishes', sizePx: 20, color: '#8ea0bf', baseline: 528 },
  shakePx: 6,
  shakeMs: 200,
} as const;

/** Grey banner content + boot sequence (MAIN on: black 1 s → white leaf splash 3 s → `Connecting…`). */
export const TABLET_STATES = {
  unreachable: { text: 'Reconnecting to robot controller…', sizePx: 26, color: '#c9d2e3' },
  connecting: 'Connecting to robot controller…',
  boot: { blackMs: 1000, splashMs: 3000 },
} as const;

export type TabletHit =
  | { kind: 'tab'; tab: TabletTab }
  | { kind: 'button'; button: TabletButton }
  | { kind: 'step'; stepMm: number }
  | { kind: 'locked' }
  | null;

/** Hit-test a click in logical tablet px (1280 × 800). Locked dashboards swallow every content tap. */
export function hitTestTablet(xPx: number, yPx: number, tab: TabletTab, locked = false): TabletHit {
  const inside = (r: PxRect) => xPx >= r.x && xPx <= r.x + r.w && yPx >= r.y && yPx <= r.y + r.h;
  if (locked && inside(TABLET_LOCKOUT.rect)) return { kind: 'locked' };
  for (const t of Object.keys(TABLET_LAYOUT.tabs) as TabletTab[]) if (inside(TABLET_LAYOUT.tabs[t])) return { kind: 'tab', tab: t };
  const buttons = tab === 'motion-control' ? TABLET_MOTION_BUTTONS : tab === 'robot-control' ? TABLET_ROBOT_CONTROL_BUTTONS : [];
  for (const b of buttons) if (inside(b.rect)) return { kind: 'button', button: b };
  if (tab === 'robot-control' && inside(TABLET_JOG.stepSelector.rect)) {
    const seg = Math.min(2, Math.floor((xPx - TABLET_JOG.stepSelector.rect.x) / (TABLET_JOG.stepSelector.rect.w / 3)));
    return { kind: 'step', stepMm: TABLET_JOG.stepSelector.stepsMm[seg]! };
  }
  return null;
}

export interface TabletRenderOptions {
  widthPx: number;
  heightPx: number;
  /** Tab to draw (default `rig.tablet.tab`). */
  tab?: TabletTab;
  /** Button pressed in the last 120 ms / rejected in the last 200 ms (visual feedback). */
  pressedButtonId?: string | null;
  rejectedButtonId?: string | null;
  /** Banner wipe in progress: previous colour and progress 0..1. */
  wipe?: { from: BannerColor; progress01: number } | null;
  /** Physical clock ms (heartbeat 1 Hz, Park pulse, spinner, lockout shake). */
  timeMs?: number;
  /** Robot quip line (hidden in Strict realism and under the lockout overlay). */
  quip?: string | null;
  colorBlind?: boolean;
  /** Boot sequence phase after MAIN on. */
  boot?: 'black' | 'splash' | 'connecting' | null;
  /** Robot Control tab step selection (mm). */
  jogStepMm?: number;
}

/* ───────────────────────────── Printed receipt (World §4.7) ───────────────────────────── */

/** 58 mm thermal paper, 384 px wide (6.62 px/mm), MONO 2.6 mm, black on paperWhite. */
export const RECEIPT = {
  paperMm: 58,
  widthPx: 384,
  pxPerMm: 6.62,
  fontMm: 2.6,
  paper: '#fbfbf8',
  ink: '#111111',
  /** Paper strip mesh length = receipt height; max 120 mm visible, then it curls. */
  maxVisibleMm: 120,
  address: '123 LAB WAY · TEST CITY',
} as const;

export interface ReceiptRenderOptions {
  widthPx: number;
  /** Draw a QR block (receipt printed from the 5-option flow). */
  qrSeed?: string | null;
}

/* ───────────────────────────── API ───────────────────────────── */

export interface Render2DApi {
  /** Draw a device display (primary MFD screen or the Duo's secondary CFD) filling the canvas. */
  drawDeviceDisplay(ctx: CanvasRenderingContext2D, lab: LabState, device: TerminalDevice, display: 'primary' | 'secondary', opts: DisplayRenderOptions): void;
  /** Draw the front status tablet dashboard (WALL-E style) for a rig (World §5, `TABLET_*`). */
  drawTablet(ctx: CanvasRenderingContext2D, lab: LabState, rig: RigState, robot: OrcaRobot, opts: TabletRenderOptions): void;
  /** Draw a printed receipt (for Ollama / receipt validation and the printer paper strip). */
  drawReceipt(ctx: CanvasRenderingContext2D, text: string, opts: ReceiptRenderOptions): void;
  /** Height in px the receipt needs at `widthPx` (size the canvas / paper strip before drawing). */
  receiptHeightPx(text: string, widthPx: number): number;
}
