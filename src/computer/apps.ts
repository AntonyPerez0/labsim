/**
 * Computer apps contract — the in-game workstation (`docs/design/50-computer-apps.md`, "Apps").
 *
 * This file is shared by the desktop shell, every app, the mission runtime (routes/actions/requests),
 * the world (webcam registry, card-reader event) and the ui (Desktop/TabletDashboard host). It must stay
 * light: types, constants, tiny registries and pure helpers only — no React runtime, no sim runtime.
 *
 *   import { APP_ROUTES, APP_ACTIONS, matchRoute, onAppAction, requestOpenApp } from '@/computer/apps';
 *
 * Rules (Apps §0.3):
 *  - `app.navigated` is emitted by the SHELL only, for every route change of every window.
 *  - `app.action` is emitted by apps through `emitAppAction()` with the names in `APP_ACTIONS` and the
 *    payloads in `AppActionPayloads`, after the sim call returned.
 *  - Additive changes only (never rename an id, route key or action name).
 */
import type { ComponentType } from 'react';
import type { Engine } from '@/engine/types';
import type { CardEntry, RobotStatus } from '@/sim/types';
import type { OrcaEntityName, RigCommandName } from '@/sim/events';
import { emit } from '@/core/store';
import { bus } from '@/core/bus';

/* ═══════════════════════════════ App ids & metadata ═══════════════════════════════ */

export type AppId =
  | 'orca'
  | 'jenkins'
  | 'github'
  | 'ollama'
  | 'browser'
  | 'intellij'
  | 'terminal'
  | 'gimp'
  | 'camera'
  | 'dashboard'
  | 'chat'
  | 'cardreader'
  | 'files';

export const APP_IDS: readonly AppId[] = [
  'orca',
  'jenkins',
  'github',
  'ollama',
  'browser',
  'intellij',
  'terminal',
  'gimp',
  'camera',
  'dashboard',
  'chat',
  'cardreader',
  'files',
];

/** `app` field of `app.action` events: an app, the desktop shell, or the 3D status-tablet overlay. */
export type AppEventSource = AppId | 'desktop' | 'tablet';

export type RepoId = 'gort' | 'uia-remote' | 'pigeon' | 'orchestrator';
export type DashboardTab = 'robot' | 'robot-control' | 'motion-control';

/**
 * Open/navigation parameters. One flat bag so every app component has the same props type;
 * each app documents which keys it reads (Apps §1.9 and its own section).
 */
export interface AppParams {
  /** Route to open (pseudo-path or URL path+query, see APP_ROUTES). All apps. */
  route?: string;
  /** browser: full URL. camera: stream URL. */
  url?: string;
  /** intellij: project to open. */
  repo?: RepoId;
  /** intellij: repo-relative file to open. files: not used. */
  file?: string;
  /** intellij: 1-based line to reveal. */
  line?: number;
  /** intellij: run configuration to select (e.g. "TaxTest"). */
  runConfig?: string;
  /** terminal: working directory for a new/embedded session (e.g. "~/IdeaProjects/uia-remote"). */
  cwd?: string;
  /** terminal: text to put in the input line WITHOUT executing it. */
  command?: string;
  /** terminal: render without the tab row (IntelliJ tool window). */
  embedded?: boolean;
  /** gimp / files: workstation path ("~/Pictures/r2d2_cfd.png"). */
  path?: string;
  /** files: directory to show. */
  dir?: string;
  /** camera / dashboard: robot Name ("r2-d2"). */
  robot?: string;
  /** camera: open the recording of this Jenkins build id ("Java/x#4127"). */
  recordingBuildId?: string;
  /** dashboard: tab to show. */
  tab?: DashboardTab;
  /** chat: channel id ("#lab-automation", "dm:riley"). */
  channel?: string;
  /** ollama: prompt to prefill (not sent). */
  prompt?: string;
  /** ollama: workstation image path to attach. */
  attach?: string;
}

/** Inline SVG markup (24×24 viewBox) — rendered with dangerouslySetInnerHTML or as an <img> data URI. */
export type AppIconSvg = string;

export interface AppMeta {
  id: AppId;
  /** Taskbar / start-menu title. */
  title: string;
  /** Desktop icon label (2 lines max). */
  iconLabel: string;
  icon: AppIconSvg;
  /** 'browser' = hosted in the shell's Chromium-like frame (Apps §1.4). */
  chrome: 'browser' | 'native';
  /** Web origin for browser-hosted apps ("http://orca.lab.local:8080"). */
  origin: string | null;
  /** Route opened when no params.route is given. */
  homeRoute: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** One window at most (open requests focus/navigate it). */
  singleInstance: boolean;
  /** Multi-instance apps: requests with the same key reuse a window (IntelliJ: one window per repo). */
  instanceKey?: (params: AppParams) => string | null;
  desktopIcon: boolean;
  pinned: boolean;
  /** Extra search terms for the start menu. */
  aliases: string[];
  /** Name of the component exported by `src/computer/apps/<id>/index.tsx`. */
  exportName: string;
}

export interface AppDefinition extends AppMeta {
  load: () => Promise<ComponentType<AppProps>>;
}

/* ═══════════════════════════════ Props & window manager ═══════════════════════════════ */

export interface AppProps {
  /** Unique window id ("w3"). */
  windowId: string;
  /** Parameters of the open request that created (or last re-targeted) this window. */
  params?: AppParams;
  /** Set the window title ("Robots — Orchestrator", "HomeScreen.java – uia-remote"). */
  onTitle?(title: string): void;
  /** Current route, controlled by the shell (window history). Apps render from it. */
  route?: string;
  /** Change route (pushes window history; the shell emits `app.navigated`). */
  navigate?(route: string, opts?: { replace?: boolean }): void;
  /** True while this window has keyboard focus. */
  focused?: boolean;
  /** Incremented by browser Reload — remount/refetch the page. */
  reloadKey?: number;
  /** The window manager (same object as `getWindowManager()`). */
  wm?: WindowManagerApi;
  /** Rendered inside another app (e.g. Terminal inside IntelliJ). */
  embedded?: boolean;
}

export interface WindowInfo {
  id: string;
  app: AppId;
  title: string;
  route: string;
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
}

export interface NotifyOptions {
  app?: AppEventSource;
  title: string;
  body?: string;
  /** Clicking the toast opens `app` at this route. */
  route?: string;
  kind?: 'info' | 'success' | 'warning' | 'error';
}

export interface PickFileOptions {
  title?: string;
  mode?: 'open' | 'save';
  filter?: 'images' | 'any';
  /** "~/Pictures" */
  startDir?: string;
  suggestedName?: string;
}

export interface DesktopClipboard {
  read(): string;
  /** Writes the in-game clipboard (+ best-effort system clipboard) and emits `desktop.clipboard.copied`. */
  write(text: string, sourceApp?: AppEventSource): void;
}

export interface WindowManagerApi {
  /** Open (or focus/re-target) an app window; returns the window id. Emits `app.opened`. */
  openApp(id: AppId, params?: AppParams): string;
  close(windowId: string): void;
  focus(windowId: string): void;
  minimize(windowId: string): void;
  toggleMaximize(windowId: string): void;
  setTitle(windowId: string, title: string): void;
  navigate(windowId: string, route: string, opts?: { replace?: boolean }): void;
  notify(n: NotifyOptions): void;
  /** Modal file dialog inside the calling window; resolves to a workstation path or null. */
  pickFile(o: PickFileOptions): Promise<string | null>;
  clipboard: DesktopClipboard;
  windows(): WindowInfo[];
}

let windowManager: WindowManagerApi | null = null;

/** Called by the shell when the desktop mounts/unmounts. */
export function setWindowManager(wm: WindowManagerApi | null): void {
  windowManager = wm;
}

/** The live window manager, or null when the desktop is not mounted. */
export function getWindowManager(): WindowManagerApi | null {
  return windowManager;
}

/* ═══════════════════════════════ Mission bridge (requests & events) ═══════════════════════════════ */

export interface HintRequest {
  app: AppId;
  /** A `data-hint` target, see APP_HINT_TARGETS ("orca.robots.statusFilter", "orca.robots.row:johnny-5"). */
  target: string;
  route?: string;
  /** Animate the ghost cursor ("Show me", Cur §2.0). */
  showMe?: boolean;
}

/**
 * Card the player swipes at the desk's USB magstripe reader (World §9.2). The event itself,
 * `workstation.cardSwiped`, and the shell's `computer.windowsChanged` (monitor mirror) are declared in
 * `src/core/events.ts` so the world can use them without importing `src/computer`.
 */
export type DeskTestCard = 'test-card-visa' | 'test-card-interac';

declare module '@/core/events' {
  interface EventMap {
    /** Missions/ui ask the desktop to open (or focus) an app. Drained by the shell. */
    'computer.openAppRequested': { app: AppId; params?: AppParams };
    /** Missions ask for a hint ring / ghost cursor on a `data-hint` element. */
    'computer.hintRequested': HintRequest;
    'computer.hintCleared': Record<string, never>;
  }
}

const pendingOpenRequests: { app: AppId; params?: AppParams }[] = [];

/**
 * Ask the desktop to open an app (Cur §2.0 "The named app opens focused"). Safe to call while the desktop is
 * not mounted: the request is queued and handled when it mounts. Set `ui.overlay = {kind:'computer'}` yourself.
 */
export function requestOpenApp(app: AppId, params?: AppParams): void {
  pendingOpenRequests.push({ app, params });
  emit('computer.openAppRequested', { app, params });
}

/** Shell: take all queued open requests (call on mount, then listen to `computer.openAppRequested`). */
export function drainOpenRequests(): { app: AppId; params?: AppParams }[] {
  return pendingOpenRequests.splice(0, pendingOpenRequests.length);
}

let currentHint: HintRequest | null = null;

export function requestHint(h: HintRequest): void {
  currentHint = h;
  emit('computer.hintRequested', h);
}

export function clearHint(): void {
  currentHint = null;
  emit('computer.hintCleared', {});
}

/** The hint currently requested (for a shell that mounts after the request). */
export function getCurrentHint(): HintRequest | null {
  return currentHint;
}

/* ═══════════════════════════════ Webcam registry (Apps §8.3) ═══════════════════════════════ */

/** Opaque camera object produced by the world; only ever passed to `engine.captureView`. */
export type CaptureCamera = Parameters<Engine['captureView']>[0];

export interface WebcamTile {
  /** Rig shown in this tile (null for overview cameras). */
  rigId: string | null;
  /** Tag drawn top-left of the tile, e.g. "JOHNNY-5". */
  label: string;
  camera: CaptureCamera;
  /** Tile rectangle inside the 1280×720 frame (a dedicated camera is one tile 0,0,1280,720). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WebcamFeed {
  /** "cam-wall-e", "cam-rackb" (Sim §2.11.1 ids). */
  cameraId: string;
  /** "http://10.42.10.40:8081/stream.mjpg" — the key the Camera app looks up. */
  url: string;
  /** Camera host id ("pi-cam-rackb"), if known. */
  hostId: string | null;
  label: string;
  tiles: WebcamTile[];
}

export interface WebcamProvider {
  feeds(): WebcamFeed[];
}

let webcamProvider: WebcamProvider | null = null;

/** World (World App. B): register the virtual webcams once the rigs are built. Pass null to unregister. */
export function registerWebcamProvider(p: WebcamProvider | null): void {
  webcamProvider = p;
}

export function getWebcamFeeds(): WebcamFeed[] {
  return webcamProvider?.feeds() ?? [];
}

export function findWebcamFeed(url: string): WebcamFeed | null {
  const want = normaliseStreamUrl(url);
  return getWebcamFeeds().find((f) => normaliseStreamUrl(f.url) === want) ?? null;
}

function normaliseStreamUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

/* ═══════════════════════════════ Image store (Apps §1.6) ═══════════════════════════════ */

export interface ImageEntry {
  /** "img:webcam:cam-r2-d2:123456", "img:screencap:dev-eve:98765", "img:receipt:wall-e:0912". */
  ref: string;
  /** PNG/JPEG data URL. */
  dataUrl: string;
  width: number;
  height: number;
  kind: 'webcam' | 'screencap' | 'receipt' | 'other';
}

export type ImageMaterializer = (ref: string) => Promise<ImageEntry | null>;

const images = new Map<string, ImageEntry>();
const imageListeners = new Set<() => void>();
let imageMaterializer: ImageMaterializer | null = null;

export function putImage(entry: ImageEntry): void {
  images.set(entry.ref, entry);
  for (const fn of [...imageListeners]) fn();
}

/** Synchronous lookup (no materialisation). */
export function peekImage(ref: string): ImageEntry | null {
  return images.get(ref) ?? null;
}

/** Store lookup, falling back to the registered materializer (which should `putImage` its result). */
export async function getImage(ref: string): Promise<ImageEntry | null> {
  const hit = images.get(ref);
  if (hit) return hit;
  if (!imageMaterializer) return null;
  const made = await imageMaterializer(ref);
  if (made && !images.has(made.ref)) putImage(made);
  return made;
}

export function registerImageMaterializer(fn: ImageMaterializer | null): void {
  imageMaterializer = fn;
}

export function onImagesChanged(fn: () => void): () => void {
  imageListeners.add(fn);
  return () => imageListeners.delete(fn);
}

/* ═══════════════════════════════ LabChat quick replies (Apps §11.4) ═══════════════════════════════ */

export interface ChatReplyOption {
  /** Reply id the mission checks, e.g. "R_WAIT_PING". */
  id: string;
  /** Chip label. */
  label: string;
  /** Message text posted to the channel. */
  text: string;
  ticketId?: string;
}

export interface ChatReplyContext {
  channel: string;
  lastMessage: { id: string; author: string; text: string; ticketId?: string } | null;
}

export type ChatReplyProvider = (ctx: ChatReplyContext) => ChatReplyOption[];

let chatReplyProvider: ChatReplyProvider | null = null;

/** Missions: supply quick replies for the open channel (ticket replies, "Still using EVE?"). */
export function setChatReplyProvider(p: ChatReplyProvider | null): void {
  chatReplyProvider = p;
}

export function getChatReplies(ctx: ChatReplyContext): ChatReplyOption[] {
  try {
    return chatReplyProvider?.(ctx) ?? [];
  } catch (err) {
    console.warn('[computer] chat reply provider threw', err);
    return [];
  }
}

/* ═══════════════════════════════ Web hosts (Apps §1.4) ═══════════════════════════════ */

export interface ResolvedUrl {
  app: AppId;
  /** Path + query (browser-hosted apps), the camera stream route, or the full URL for the generic browser. */
  route: string;
  origin: string | null;
}

const WEB_HOSTS: { re: RegExp; app: AppId; origin: string }[] = [
  { re: /^https?:\/\/(orca\.lab\.local|10\.42\.1\.10):8080/i, app: 'orca', origin: 'http://orca.lab.local:8080' },
  { re: /^https?:\/\/(jenkins\.lab\.local|10\.42\.1\.11):8080/i, app: 'jenkins', origin: 'http://jenkins.lab.local:8080' },
  { re: /^https?:\/\/(www\.)?github\.com(?=\/labsim-lab)/i, app: 'github', origin: 'https://github.com' },
  { re: /^https?:\/\/10\.42\.1\.12:3000/i, app: 'ollama', origin: 'http://10.42.1.12:3000' },
];

/** Map a typed/clicked URL to the app that renders it (Apps §1.4 host table). */
export function resolveUrl(input: string): ResolvedUrl {
  let url = input.trim();
  if (!/^[a-z]+:\/\//i.test(url)) url = `http://${url}`;
  for (const h of WEB_HOSTS) {
    const m = h.re.exec(url);
    if (m) {
      const rest = url.slice(m[0].length) || '/';
      return { app: h.app, route: rest.startsWith('/') ? rest : `/${rest}`, origin: h.origin };
    }
  }
  const cam = /^https?:\/\/([\d.]+):8081\/stream\.mjpg\/?$/i.exec(url);
  if (cam) return { app: 'camera', route: buildRoute(APP_ROUTES.camera.stream, { host: cam[1] }), origin: null };
  return { app: 'browser', route: url, origin: null };
}

/* ═══════════════════════════════ Routes (Apps §0.3, Appendix A) ═══════════════════════════════ */

export interface RouteDef {
  /** Template: `:name` = one segment, `*name` = rest of the path (may contain "/"). */
  readonly path: string;
  readonly description: string;
}

const r = (path: string, description: string): RouteDef => ({ path, description });

/**
 * Route catalogue. Browser-hosted apps: the path+query after the origin, exactly as the address bar shows.
 * Desktop apps: pseudo-paths. Query parameters are not part of templates (use `matchRoute(...).query`).
 */
export const APP_ROUTES = {
  orca: {
    home: r('/', 'Orchestrator home dashboard (status counts, health-check timer, active checkouts, alerts)'),
    login: r('/login', 'Sign in page'),
    robots: r('/robot', "Robot list with Tate's filters; query status.in, deviceType.equals, rigKind.equals, environment.equals, name.contains, page, sort"),
    robotNew: r('/robot/new', 'Create a new Robot'),
    robotView: r('/robot/:id/view', 'Robot detail incl. Notes and Check out'),
    robotEdit: r('/robot/:id/edit', 'Robot edit form (all configuration fields)'),
    devices: r('/device', 'Device list'),
    deviceNew: r('/device/new', 'Create a new Device (hardware upgrade)'),
    deviceView: r('/device/:id/view', 'Device detail'),
    deviceEdit: r('/device/:id/edit', 'Device edit form'),
    capabilities: r('/robot-capability', 'Robot Capability rows; query tab=documents&robot=<name> shows a robot capability document'),
    capabilityNew: r('/robot-capability/new', 'Create a capability row'),
    capabilityView: r('/robot-capability/:id/view', 'Capability row detail'),
    capabilityEdit: r('/robot-capability/:id/edit', 'Capability row edit'),
    matchPreview: r('/robot-capability/match-preview', 'Match preview (capabilities JSON + environment → robots)'),
    merchants: r('/merchant-config', 'Merchant Config list (truncated columns)'),
    merchantNew: r('/merchant-config/new', 'Create a Merchant Config'),
    merchantView: r('/merchant-config/:id/view', 'Merchant Config detail (credentials hidden)'),
    merchantEdit: r('/merchant-config/:id/edit', 'Merchant Config Edit — the only view with App ID / App Secret / API Key / Ubi Route'),
    screens: r('/screen', 'Screen list; query deviceType.equals, name.contains, display.equals'),
    screenNew: r('/screen/new', 'Create a Screen (e.g. RECEIPT_OPTIONS_5 for FLEX_4)'),
    screenView: r('/screen/:id/view', 'Screen detail with its Screen Locations and Test tap'),
    screenEdit: r('/screen/:id/edit', 'Screen edit'),
    screenLocations: r('/screen-location', 'Screen Location list; query deviceType.equals, screenId.equals, button.contains'),
    screenLocationNew: r('/screen-location/new', 'Create a Screen Location'),
    screenLocationView: r('/screen-location/:id/view', 'Screen Location detail'),
    screenLocationEdit: r('/screen-location/:id/edit', 'Screen Location edit (X/Y mm)'),
    cardProfiles: r('/card-profile', 'Card Profile list'),
    cardProfileNew: r('/card-profile/new', 'Create a Card Profile'),
    cardProfileView: r('/card-profile/:id/view', 'Card Profile detail (Track Data for swipe, Path for dip/tap)'),
    cardProfileEdit: r('/card-profile/:id/edit', 'Card Profile edit'),
    screenCompares: r('/screen-compare-image', 'Screen Compare Image list (deprecated banner)'),
    screenCompareNew: r('/screen-compare-image/new', 'Create a Screen Compare Image'),
    screenCompareView: r('/screen-compare-image/:id/view', 'Screen Compare Image detail with the Test panel'),
    screenCompareEdit: r('/screen-compare-image/:id/edit', 'Screen Compare Image edit'),
    adminUsers: r('/admin/user-management', 'Administration › User management'),
    adminMetrics: r('/admin/metrics', 'Administration › Metrics'),
    adminHealth: r('/admin/health', 'Administration › Health (/management/health)'),
    adminConfiguration: r('/admin/configuration', 'Administration › Configuration'),
    adminHealthCheckLog: r('/admin/health-check-log', 'Administration › Health-check log (runs, SKIPPED (Offline), RESERVED — not overridden)'),
    adminAudits: r('/admin/audits', 'Administration › Audits'),
    adminLogs: r('/admin/logs', 'Administration › Logs'),
    adminDocs: r('/admin/docs', 'Administration › API (Swagger UI, Try it out)'),
    accountSettings: r('/account/settings', 'Account › Settings'),
    accountPassword: r('/account/password', 'Account › Password'),
  },
  jenkins: {
    dashboard: r('/', 'Dashboard, All view (folders Java and iOS)'),
    view: r('/view/:view/', 'A view tab: Java, iOS, uia-remote, SDK-Go, Pigeon-LSTR, Laz, Vision-PoC'),
    folder: r('/job/:folder/', 'Folder page (Java or iOS)'),
    job: r('/job/:folder/job/:job/', 'Job page with Stage View, Build History, permalinks'),
    buildWithParameters: r('/job/:folder/job/:job/build', 'Build with Parameters form'),
    configure: r('/job/:folder/job/:job/configure', 'Configure (parameters defaults = saved params, Pipeline script)'),
    move: r('/job/:folder/job/:job/move', 'Move job to another folder'),
    changes: r('/job/:folder/job/:job/changes', 'Changes'),
    fullStageView: r('/job/:folder/job/:job/workflow-stage', 'Full Stage View'),
    pipelineSyntax: r('/job/:folder/job/:job/pipeline-syntax/', 'Pipeline Syntax snippet generator'),
    build: r('/job/:folder/job/:job/:number/', 'Build page (number may be lastBuild)'),
    console: r('/job/:folder/job/:job/:number/console', 'Console Output'),
    buildParameters: r('/job/:folder/job/:job/:number/parameters/', 'Build parameters'),
    buildHistory: r('/view/all/builds', 'Global Build History'),
    people: r('/asynchPeople/', 'People'),
    manage: r('/manage/', 'Manage Jenkins'),
    nodes: r('/computer/', 'Nodes'),
    about: r('/manage/about/', 'About Jenkins'),
    search: r('/search/', 'Search results; query q'),
  },
  github: {
    org: r('/labsim-lab', 'Organisation overview / repositories'),
    repo: r('/labsim-lab/:repo', 'Repository Code tab (default branch)'),
    tree: r('/labsim-lab/:repo/tree/*ref', 'Directory at <branch>/<path> (branch may contain "/")'),
    blob: r('/labsim-lab/:repo/blob/*ref', 'File at <branch>/<path>'),
    edit: r('/labsim-lab/:repo/edit/*ref', 'Web editor for <branch>/<path>'),
    newFile: r('/labsim-lab/:repo/new/*ref', 'Create new file in <branch>/<dir>'),
    commits: r('/labsim-lab/:repo/commits/*ref', 'Commit history of a branch'),
    commit: r('/labsim-lab/:repo/commit/:sha', 'One commit with its diff'),
    branches: r('/labsim-lab/:repo/branches', 'Branches (protected badge on gort/orchestrator main)'),
    pulls: r('/labsim-lab/:repo/pulls', 'Pull request list; query q'),
    compare: r('/labsim-lab/:repo/compare/*range', 'Compare <base>...<head> and open a pull request'),
    pull: r('/labsim-lab/:repo/pull/:number', 'Pull request Conversation tab (merge box)'),
    pullCommits: r('/labsim-lab/:repo/pull/:number/commits', 'Pull request Commits tab'),
    pullChecks: r('/labsim-lab/:repo/pull/:number/checks', 'Pull request Checks tab'),
    pullFiles: r('/labsim-lab/:repo/pull/:number/files', 'Pull request Files changed tab (line comments, Review changes)'),
    issues: r('/labsim-lab/:repo/issues', 'Issues (empty state)'),
    actions: r('/labsim-lab/:repo/actions', 'Actions (empty state)'),
  },
  ollama: {
    home: r('/', 'Ollama WebUI new chat'),
    chat: r('/c/:chatId', 'An existing chat'),
  },
  browser: {
    newTab: r('/newtab', 'New tab page'),
    raw: r('*url', 'Any other URL (route = the full URL), raw JSON/text view'),
  },
  intellij: {
    welcome: r('/welcome', 'Welcome to IntelliJ IDEA (no project)'),
    project: r('/project/:repo', 'Project open, no editor tab'),
    file: r('/project/:repo/file/*path', 'Project with this repo-relative file in the active editor tab'),
  },
  terminal: {
    tab: r('/tab/:n', 'Terminal tab n (1-based) is active'),
  },
  gimp: {
    empty: r('/', 'No image open'),
    image: r('/image/*path', 'Image tab active (workstation path, e.g. ~/Pictures/r2d2_cfd.png)'),
  },
  camera: {
    home: r('/', 'No stream selected'),
    wall: r('/wall', 'Wall view of all streams'),
    stream: r('/stream/:host', 'Live stream of http://<host>:8081/stream.mjpg; query robot=<name> when opened from a robot'),
    recordings: r('/recordings', 'Recordings list'),
    recording: r('/recording/:id', 'Recording player'),
  },
  dashboard: {
    home: r('/', 'Robot list, nothing selected'),
    robot: r('/robot/:name/:tab', 'Dashboard of a robot; tab = robot | robot-control | motion-control'),
  },
  chat: {
    channel: r('/channel/:name', 'A channel (name without "#", e.g. lab-automation)'),
    dm: r('/dm/:user', 'Direct messages with a team member key (riley, jared, …)'),
    mentions: r('/mentions', 'Mentions & reactions'),
  },
  cardreader: {
    home: r('/', 'MagStripe Reader main window'),
  },
  files: {
    dir: r('/dir/*path', 'A directory (e.g. ~/Pictures)'),
  },
} as const satisfies Record<AppId, Record<string, RouteDef>>;

export interface RouteMatch {
  params: Record<string, string>;
  query: Record<string, string>;
}

function splitRoute(route: string): { path: string; query: string } {
  const i = route.indexOf('?');
  return i < 0 ? { path: route, query: '' } : { path: route.slice(0, i), query: route.slice(i + 1) };
}

/** Parse a query string ("a=1&b=x%20y") into a record (last value wins). */
export function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = decodeURIComponent((eq < 0 ? part : part.slice(0, eq)).replace(/\+/g, ' '));
    const v = eq < 0 ? '' : decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
    out[k] = v;
  }
  return out;
}

function trimSlash(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

/**
 * Match an emitted route against a template. Trailing slashes and query order are ignored.
 * `:x` matches one non-empty segment; `*x` matches the rest (non-empty, may contain "/").
 */
export function matchRoute(def: RouteDef | string, route: string): RouteMatch | null {
  const template = typeof def === 'string' ? def : def.path;
  const { path, query } = splitRoute(route);
  if (template.startsWith('*')) {
    if (!route) return null;
    return { params: { [template.slice(1)]: route }, query: parseQuery(query) };
  }
  const t = trimSlash(template).split('/');
  const p = trimSlash(path).split('/');
  const params: Record<string, string> = {};
  for (let i = 0; i < t.length; i++) {
    const seg = t[i];
    if (seg.startsWith('*')) {
      const rest = p.slice(i).join('/');
      if (!rest) return null;
      params[seg.slice(1)] = safeDecode(rest);
      return { params, query: parseQuery(query) };
    }
    if (i >= p.length) return null;
    if (seg.startsWith(':')) {
      if (!p[i]) return null;
      params[seg.slice(1)] = safeDecode(p[i]);
    } else if (seg !== p[i]) {
      return null;
    }
  }
  if (p.length !== t.length) return null;
  return { params, query: parseQuery(query) };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Build a route from a template. `*rest` params are inserted verbatim (slashes kept); `:x` params are
 * URI-encoded. Query keys are appended in the given order; undefined/null/'' values are skipped.
 */
export function buildRoute(
  def: RouteDef | string,
  params: Record<string, string | number> = {},
  query?: Record<string, string | number | null | undefined>,
): string {
  const template = typeof def === 'string' ? def : def.path;
  let out: string;
  if (template.startsWith('*')) {
    out = String(params[template.slice(1)] ?? '');
  } else {
    out = template
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) return encodeURIComponent(String(params[seg.slice(1)] ?? ''));
        if (seg.startsWith('*')) return String(params[seg.slice(1)] ?? '');
        return seg;
      })
      .join('/');
  }
  if (query) {
    const parts = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v)).replace(/%2C/gi, ',')}`);
    if (parts.length) out += `?${parts.join('&')}`;
  }
  return out;
}

/** Subscribe to `app.navigated` for one app and template. Returns an unsubscribe function. */
export function onAppNavigated(
  app: AppId,
  def: RouteDef | string,
  fn: (match: RouteMatch, route: string) => void,
): () => void {
  return bus.on('app.navigated', (e) => {
    if (e.app !== app) return;
    const m = matchRoute(def, e.route);
    if (m) fn(m, e.route);
  });
}

/* ═══════════════════════════════ Actions (Apps §0.3, Appendix B) ═══════════════════════════════ */

/** Every `app.action` name, grouped by emitting source. Values are the exact `action` strings. */
export const APP_ACTIONS = {
  desktop: {
    standUp: 'desktop.standUp',
    clipboardCopied: 'desktop.clipboard.copied',
    notificationClicked: 'desktop.notification.clicked',
  },
  orca: {
    signedIn: 'orca.session.signedIn',
    signedOut: 'orca.session.signedOut',
    robotsFiltered: 'orca.robots.filtered',
    robotViewed: 'orca.robot.viewed',
    robotEditOpened: 'orca.robot.editOpened',
    robotSaved: 'orca.robot.saved',
    robotSaveFailed: 'orca.robot.saveFailed',
    robotStatusChangeRequested: 'orca.robot.statusChangeRequested',
    robotNotesViewed: 'orca.robot.notesViewed',
    robotNoteAdded: 'orca.robot.noteAdded',
    robotNoteResolved: 'orca.robot.noteResolved',
    robotCheckoutAttempted: 'orca.robot.checkoutAttempted',
    robotReleased: 'orca.robot.released',
    entityDeleted: 'orca.entity.deleted',
    healthCheckForced: 'orca.healthCheck.forced',
    healthLogViewed: 'orca.healthLog.viewed',
    deviceCreated: 'orca.device.created',
    deviceSaved: 'orca.device.saved',
    capabilitiesViewed: 'orca.capabilities.viewed',
    capabilitySaved: 'orca.capability.saved',
    matchPreviewRan: 'orca.matchPreview.ran',
    merchantEditOpened: 'orca.merchant.editOpened',
    merchantSaved: 'orca.merchant.saved',
    merchantSecretRevealed: 'orca.merchant.secretRevealed',
    screensFiltered: 'orca.screens.filtered',
    screenViewed: 'orca.screen.viewed',
    screenLocationsViewed: 'orca.screenLocations.viewed',
    screenSaved: 'orca.screen.saved',
    screenLocationSaved: 'orca.screenLocation.saved',
    screenLocationTestTap: 'orca.screenLocation.testTap',
    cardProfileViewed: 'orca.cardProfile.viewed',
    cardProfileFieldClicked: 'orca.cardProfile.fieldClicked',
    cardProfileSaved: 'orca.cardProfile.saved',
    screenCompareSaved: 'orca.screenCompare.saved',
    screenCompareTested: 'orca.screenCompare.tested',
    screenCompareLayoutV2Toggled: 'orca.screenCompare.layoutV2Toggled',
    apiExecuted: 'orca.api.executed',
  },
  jenkins: {
    viewOpened: 'jenkins.view.opened',
    jobOpened: 'jenkins.job.opened',
    buildWithParametersOpened: 'jenkins.buildWithParameters.opened',
    buildTriggered: 'jenkins.build.triggered',
    buildAborted: 'jenkins.build.aborted',
    consoleOpened: 'jenkins.console.opened',
    consoleLineClicked: 'jenkins.console.lineClicked',
    scriptViewed: 'jenkins.script.viewed',
    scriptLineClicked: 'jenkins.script.lineClicked',
    jobConfigured: 'jenkins.job.configured',
    jobMoved: 'jenkins.job.moved',
    search: 'jenkins.search',
  },
  github: {
    cloneUrlCopied: 'github.cloneUrl.copied',
    treeViewed: 'github.tree.viewed',
    fileViewed: 'github.file.viewed',
    commitViewed: 'github.commit.viewed',
    branchCreated: 'github.branch.created',
    fileCommitted: 'github.file.committed',
    prCreated: 'github.pr.created',
    prViewed: 'github.pr.viewed',
    prLineCommentAdded: 'github.pr.lineCommentAdded',
    prReviewSubmitted: 'github.pr.reviewSubmitted',
    prCommented: 'github.pr.commented',
    prMerged: 'github.pr.merged',
  },
  ollama: {
    modelSelected: 'ollama.model.selected',
    imageAttached: 'ollama.image.attached',
    promptSent: 'ollama.prompt.sent',
    responseReceived: 'ollama.response.received',
    responseFlagged: 'ollama.response.flagged',
  },
  browser: {
    pageUnreachable: 'browser.page.unreachable',
  },
  intellij: {
    projectCloned: 'intellij.project.cloned',
    projectOpened: 'intellij.project.opened',
    treeNodeClicked: 'intellij.tree.nodeClicked',
    fileOpened: 'intellij.file.opened',
    editorClicked: 'intellij.editor.clicked',
    fileSaved: 'intellij.file.saved',
    fileCreated: 'intellij.file.created',
    fileMoved: 'intellij.file.moved',
    intentionApplied: 'intellij.intention.applied',
    configValidatorRan: 'intellij.configValidator.ran',
    buildRan: 'intellij.build.ran',
    runStarted: 'intellij.run.started',
    runStopped: 'intellij.run.stopped',
    runFinished: 'intellij.run.finished',
    gitBranchCheckedOut: 'intellij.git.branchCheckedOut',
    gitCommitted: 'intellij.git.committed',
    gitPushed: 'intellij.git.pushed',
    gitPulled: 'intellij.git.pulled',
  },
  terminal: {
    commandSubmitted: 'terminal.command.submitted',
    interrupted: 'terminal.interrupted',
    tabOpened: 'terminal.tab.opened',
    nanoSaved: 'terminal.nano.saved',
  },
  gimp: {
    imageOpened: 'gimp.image.opened',
    selectionChanged: 'gimp.selection.changed',
    selectionCopied: 'gimp.selection.copied',
  },
  camera: {
    streamOpened: 'camera.stream.opened',
    wallOpened: 'camera.wall.opened',
    snapshotSaved: 'camera.snapshot.saved',
    recordingOpened: 'camera.recording.opened',
    recordingFinished: 'camera.recording.finished',
    tapAnalysisOpened: 'camera.tapAnalysis.opened',
  },
  dashboard: {
    robotSelected: 'dashboard.robot.selected',
    tabOpened: 'dashboard.tab.opened',
    commandSent: 'dashboard.command.sent',
    lockoutShown: 'dashboard.lockout.shown',
  },
  tablet: {
    tabOpened: 'tablet.tab.opened',
    commandSent: 'tablet.command.sent',
    lockoutShown: 'tablet.lockout.shown',
  },
  chat: {
    channelOpened: 'chat.channel.opened',
    messageSent: 'chat.message.sent',
    replyChosen: 'chat.reply.chosen',
  },
  cardreader: {
    swiped: 'cardreader.swiped',
    copied: 'cardreader.copied',
  },
  files: {
    opened: 'files.opened',
  },
} as const satisfies Record<AppEventSource, Record<string, string>>;

type ValueOf<T> = T[keyof T];
/** Union of every action string in APP_ACTIONS. */
export type AppActionName = ValueOf<{ [S in keyof typeof APP_ACTIONS]: ValueOf<(typeof APP_ACTIONS)[S]> }>;

type Ok = { ok: boolean; error: string | null };
type RigTabPayload = { robot: string; tab: DashboardTab };
type RigCommandPayload = { robot: string; command: RigCommandName; ok: boolean; error: string | null };
type LockoutPayload = { robot: string; holder: string; blockedClick: boolean };

/** Payload of each action (plain JSON). Keep in sync with APP_ACTIONS — a type check below enforces it. */
export type AppActionPayloads = {
  /* desktop */
  'desktop.standUp': Record<string, never>;
  'desktop.clipboard.copied': { text: string; sourceApp: string };
  'desktop.notification.clicked': { app: string; title: string; route: string | null };

  /* orca */
  'orca.session.signedIn': { login: string };
  'orca.session.signedOut': { login: string };
  'orca.robots.filtered': {
    status: RobotStatus[];
    deviceType: string | null;
    rigKind: string | null;
    environment: string | null;
    name: string;
    resultCount: number;
  };
  'orca.robot.viewed': { robotId: number; name: string };
  'orca.robot.editOpened': { robotId: number | null; name: string | null };
  'orca.robot.saved': { robotId: number; name: string; created: boolean; changed: string[] };
  'orca.robot.saveFailed': { robotId: number | null; error: string };
  'orca.robot.statusChangeRequested': { robotId: number; name: string; from: RobotStatus; to: RobotStatus; confirmed: boolean } & Ok;
  'orca.robot.notesViewed': { robotId: number; name: string; noteCount: number };
  'orca.robot.noteAdded': { robotId: number; name: string; text: string } & Ok;
  'orca.robot.noteResolved': { robotId: number; noteId: number } & Ok;
  'orca.robot.checkoutAttempted': { robotId: number; name: string; status: RobotStatus; ok: boolean; message: string };
  'orca.robot.released': { robotId: number; name: string } & Ok;
  'orca.entity.deleted': { entity: OrcaEntityName; id: number } & Ok;
  'orca.healthCheck.forced': Ok;
  'orca.healthLog.viewed': { newestRun: number | null };
  'orca.device.created': { deviceId: number; name: string; deviceType: string; serial: string; ip: string };
  'orca.device.saved': { deviceId: number; name: string; changed: string[] };
  'orca.capabilities.viewed': { robotId: number; robotName: string; document: string };
  'orca.capability.saved': { capabilityId: number; name: string; created: boolean };
  'orca.matchPreview.ran': { capabilities: string; environment: string; matches: string[] } & Ok;
  'orca.merchant.editOpened': { merchantId: number; name: string };
  'orca.merchant.saved': { merchantId: number; name: string; changed: string[] };
  'orca.merchant.secretRevealed': { merchantId: number; name: string };
  'orca.screens.filtered': { deviceType: string | null; name: string; display: string | null; resultCount: number };
  'orca.screen.viewed': { screenId: number; name: string; deviceType: string };
  'orca.screenLocations.viewed': { screenId: number; screen: string; deviceType: string; count: number };
  'orca.screen.saved': { screenId: number; name: string; deviceType: string; created: boolean };
  'orca.screenLocation.saved': {
    locationId: number;
    screenId: number;
    screen: string;
    deviceType: string;
    button: string;
    xMm: number;
    yMm: number;
    created: boolean;
  };
  'orca.screenLocation.testTap': { robotName: string; screen: string; button: string; ok: boolean; response: string };
  'orca.cardProfile.viewed': { profileId: number; name: string; entry: CardEntry };
  'orca.cardProfile.fieldClicked': { profileId: number; name: string; field: 'trackData' | 'gortPath' };
  'orca.cardProfile.saved': { profileId: number; name: string; changed: string[] };
  'orca.screenCompare.saved': { compareId: number; name: string; created: boolean; x: number; y: number; w: number; h: number; expected: string };
  'orca.screenCompare.tested': { compareId: number; name: string; text: string; expected: string; match: boolean | null } & Ok;
  'orca.screenCompare.layoutV2Toggled': { on: boolean };
  'orca.api.executed': { method: string; path: string; status: number };

  /* jenkins */
  'jenkins.view.opened': { view: string };
  'jenkins.job.opened': { jobId: string };
  'jenkins.buildWithParameters.opened': { jobId: string; params: Record<string, string> };
  'jenkins.build.triggered': { jobId: string; params: Record<string, string>; buildId: string | null } & Ok;
  'jenkins.build.aborted': { buildId: string } & Ok;
  'jenkins.console.opened': { buildId: string; jobId: string; number: number; state: string; result: string | null };
  'jenkins.console.lineClicked': { buildId: string; line: number; text: string };
  'jenkins.script.viewed': { jobId: string };
  'jenkins.script.lineClicked': { jobId: string; line: number; text: string };
  'jenkins.job.configured': { jobId: string; changed: string[] } & Ok;
  'jenkins.job.moved': { from: string; to: string } & Ok;
  'jenkins.search': { query: string; results: string[] };

  /* github */
  'github.cloneUrl.copied': { repo: string; protocol: 'https' | 'ssh' | 'cli'; url: string };
  'github.tree.viewed': { repo: string; ref: string; path: string };
  'github.file.viewed': { repo: string; ref: string; path: string };
  'github.commit.viewed': { repo: string; sha: string };
  'github.branch.created': { repo: string; branch: string; from: string } & Ok;
  'github.file.committed': { repo: string; branch: string; path: string; message: string; newBranch: boolean } & Ok;
  'github.pr.created': { repo: string; number: number | null; title: string; head: string; base: string } & Ok;
  'github.pr.viewed': { repo: string; number: number; tab: 'conversation' | 'commits' | 'checks' | 'files' };
  'github.pr.lineCommentAdded': { repo: string; number: number; path: string; line: number; body: string; reason: string | null };
  'github.pr.reviewSubmitted': {
    repo: string;
    number: number;
    verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    body: string;
    comments: { path: string; line: number; body: string; reason: string | null }[];
  } & Ok;
  'github.pr.commented': { repo: string; number: number; body: string } & Ok;
  'github.pr.merged': { repo: string; number: number } & Ok;

  /* ollama */
  'ollama.model.selected': { model: string };
  'ollama.image.attached': { path: string; ref: string };
  'ollama.prompt.sent': { requestId: string | null; model: string; prompt: string; image: string | null } & Ok;
  'ollama.response.received': { requestId: string; response: string };
  'ollama.response.flagged': { requestId: string; flag: 'layout-incomplete' | 'tip-math-error' | 'total-error' | 'looks-correct' };

  /* browser (any browser-hosted window) */
  'browser.page.unreachable': { url: string; error: 'unknown' | 'timeout' | 'refused' };

  /* intellij */
  'intellij.project.cloned': { repo: string; url: string } & Ok;
  'intellij.project.opened': { repo: string };
  'intellij.tree.nodeClicked': { repo: string; path: string; kind: 'dir' | 'file' };
  'intellij.file.opened': { repo: string; path: string };
  'intellij.editor.clicked': { repo: string; path: string; line: number; column: number; lineText: string; token: string | null };
  'intellij.file.saved': { repo: string; path: string; trigger: 'explicit' | 'auto' | 'run' | 'commit'; problems: number } & Ok;
  'intellij.file.created': { repo: string; path: string } & Ok;
  'intellij.file.moved': { repo: string; from: string; to: string } & Ok;
  'intellij.intention.applied': { repo: string; path: string; intention: string };
  'intellij.configValidator.ran': { repo: string; path: string; passed: number; total: number; failures: string[] };
  'intellij.build.ran': { repo: string; errors: number };
  'intellij.run.started': { repo: string; config: string; testPath: string; runId: string | null } & Ok;
  'intellij.run.stopped': { runId: string };
  'intellij.run.finished': { runId: string; config: string; passed: boolean | null };
  'intellij.git.branchCheckedOut': { repo: string; branch: string; created: boolean } & Ok;
  'intellij.git.committed': { repo: string; message: string; files: string[]; sha: string | null } & Ok;
  'intellij.git.pushed': { repo: string; branch: string } & Ok;
  'intellij.git.pulled': { repo: string } & Ok;

  /* terminal */
  'terminal.command.submitted': { tab: number; line: string; host: string | null; cwd: string };
  'terminal.interrupted': { tab: number; line: string };
  'terminal.tab.opened': { tab: number };
  'terminal.nano.saved': { host: string; path: string } & Ok;

  /* gimp */
  'gimp.image.opened': { path: string; ref: string; width: number; height: number };
  'gimp.selection.changed': { path: string; ref: string; x: number; y: number; w: number; h: number };
  'gimp.selection.copied': { x: number; y: number; w: number; h: number; format: 'pigeon-json' | 'field'; text: string };

  /* camera */
  'camera.stream.opened': { url: string; host: string | null; robotName: string | null; cameraId: string | null } & Ok;
  'camera.wall.opened': Record<string, never>;
  'camera.snapshot.saved': { path: string; ref: string; url: string; robotName: string | null };
  'camera.recording.opened': { recordingId: string; buildId: string | null; runId: string | null; robotName: string };
  'camera.recording.finished': { recordingId: string; buildId: string | null; runId: string | null; robotName: string };
  'camera.tapAnalysis.opened': { recordingId: string; eventIndex: number; screen: string; button: string; hit: boolean };

  /* dashboard (desktop app) and tablet (3D overlay) */
  'dashboard.robot.selected': { robot: string };
  'dashboard.tab.opened': RigTabPayload;
  'dashboard.command.sent': RigCommandPayload;
  'dashboard.lockout.shown': LockoutPayload;
  'tablet.tab.opened': RigTabPayload;
  'tablet.command.sent': RigCommandPayload;
  'tablet.lockout.shown': LockoutPayload;

  /* chat */
  'chat.channel.opened': { channel: string };
  'chat.message.sent': { channel: string; text: string };
  'chat.reply.chosen': { channel: string; ticketId: string | null; replyId: string; messageId: string | null; text: string };

  /* cardreader */
  'cardreader.swiped': { card: DeskTestCard; track1: string; track2: string };
  'cardreader.copied': { field: 'track1' | 'track2' | 'track3' | 'tracks'; text: string };

  /* files */
  'files.opened': { path: string; with: AppId };
};

/** Compile-time guard: APP_ACTIONS and AppActionPayloads list exactly the same names. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const APP_ACTIONS_IN_SYNC: Exact<AppActionName, keyof AppActionPayloads> = true;

/** Emit an `app.action` event (call after the sim call returned, outside render). */
export function emitAppAction<K extends AppActionName>(app: AppEventSource, action: K, data: AppActionPayloads[K]): void {
  emit('app.action', { app, action, data: data as unknown as Record<string, unknown> });
}

/** Missions: subscribe to one action with a typed payload. Returns an unsubscribe function. */
export function onAppAction<K extends AppActionName>(
  action: K,
  fn: (data: AppActionPayloads[K], app: string) => void,
): () => void {
  return bus.on('app.action', (e) => {
    if (e.action === action) fn((e.data ?? {}) as unknown as AppActionPayloads[K], e.app);
  });
}

/* ═══════════════════════════════ Hint targets (Apps §1.7) ═══════════════════════════════ */

/**
 * `data-hint` targets lessons can point at. Parametrised targets end with ":" and take a suffix
 * (`orca.robots.row:johnny-5`). Apps put the attribute on the element; the shell draws the ring.
 */
export const APP_HINT_TARGETS = [
  // desktop
  'desktop.icon:', // + AppId
  'desktop.taskbar:', // + AppId
  'desktop.standUp',
  // orca
  'orca.nav.entities',
  'orca.nav.entity:', // + route key, e.g. merchants
  'orca.nav.admin',
  'orca.nav.healthCheckLog',
  'orca.header.forceHealthCheck',
  'orca.robots.filter.status', // the whole status toggle group
  'orca.robots.filter.status:', // + status chip, e.g. AVAILABLE
  'orca.robots.filter.deviceType',
  'orca.robots.filter.rigKind',
  'orca.robots.filter.environment',
  'orca.robots.filter.name',
  'orca.robots.row:', // + robot name
  'orca.robots.rowEdit:', // + robot name
  'orca.robots.rowStatus:', // + robot name
  'orca.robot.field:', // + form field key, e.g. humanReadableName, tapUrl, mfdDeviceId, offsetYMm, status
  'orca.robot.save',
  'orca.robot.notes',
  'orca.robot.checkout',
  'orca.devices.create',
  'orca.capabilities.robotSelect',
  'orca.capabilities.matchPreview',
  'orca.merchants.rowEdit:', // + merchant name
  'orca.merchant.field:', // + appId | appSecret | apiKey | ubiRoute
  'orca.screens.filter.deviceType',
  'orca.screens.row:', // + screen name
  'orca.screen.locations',
  'orca.screen.addLocation',
  'orca.screenLocation.testTap:', // + button
  'orca.cardProfiles.row:', // + profile name
  'orca.cardProfile.field:', // + trackData | gortPath
  'orca.screenCompares.create',
  'orca.screenCompare.test',
  'orca.screenCompare.layoutV2',
  // jenkins
  'jenkins.viewTab:', // + view name
  'jenkins.jobRow:', // + job id
  'jenkins.buildWithParameters',
  'jenkins.param:', // + parameter name
  'jenkins.buildButton',
  'jenkins.consoleOutput',
  'jenkins.configure',
  'jenkins.scriptEditor',
  'jenkins.move',
  // github
  'github.codeButton',
  'github.cloneUrl:', // + https | ssh | cli
  'github.fileRow:', // + path
  'github.branchSelector',
  'github.newPullRequest',
  'github.createPullRequest',
  'github.reviewChanges',
  'github.mergeButton',
  // intellij
  'intellij.getFromVcs',
  'intellij.treeNode:', // + repo-relative path
  'intellij.runButton',
  'intellij.stopButton',
  'intellij.runConfig',
  'intellij.branchWidget',
  'intellij.commitButton',
  'intellij.pushButton',
  'intellij.configValidator',
  // terminal
  'terminal.input',
  // gimp
  'gimp.tool:rectSelect',
  'gimp.toolOptions.position',
  'gimp.toolOptions.size',
  'gimp.fileOpen',
  // camera
  'camera.stream:', // + host IP
  'camera.snapshot',
  'camera.recording:', // + build id
  // ollama
  'ollama.attach',
  'ollama.send',
  'ollama.flag:', // + flag id
  // dashboard / tablet
  'dashboard.robot:', // + robot name
  'rdash.tab:', // + DashboardTab (both hosts)
  'rdash.button:', // + RigCommandName (both hosts)
  // chat
  'chat.channel:', // + channel id
  'chat.reply:', // + reply id
  'chat.composer',
  // cardreader
  'cardreader.copyTracks',
] as const;

/* ═══════════════════════════════ Time & number formatting (Apps §0.6) ═══════════════════════════════ */

const DAY_MS = 86_400_000;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DEFAULT_EPOCH = '2026-10-05';

interface GameDateParts {
  y: number;
  mo: number; // 1-12
  d: number;
  h: number;
  mi: number;
  s: number;
  weekday: number; // 0 = Sunday
}

/** Split a game-clock time (ms since game-midnight of `epochDate`) into calendar parts. Pure. */
export function gameDateParts(ms: number, epochDate: string = DEFAULT_EPOCH): GameDateParts {
  const [ey, em, ed] = epochDate.split('-').map((n) => Number(n));
  const dayOffset = Math.floor(ms / DAY_MS);
  const inDay = ms - dayOffset * DAY_MS;
  const date = new Date(Date.UTC(ey, (em || 1) - 1, ed || 1) + dayOffset * DAY_MS);
  return {
    y: date.getUTCFullYear(),
    mo: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    h: Math.floor(inDay / 3_600_000),
    mi: Math.floor((inDay % 3_600_000) / 60_000),
    s: Math.floor((inDay % 60_000) / 1000),
    weekday: date.getUTCDay(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const h12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);
const ampm = (h: number) => (h < 12 ? 'AM' : 'PM');

/** `9:41 AM` */
export function fmtClock(ms: number, epochDate?: string): string {
  const p = gameDateParts(ms, epochDate);
  return `${h12(p.h)}:${pad2(p.mi)} ${ampm(p.h)}`;
}

/** `10/5/2026` */
export function fmtDate(ms: number, epochDate?: string): string {
  const p = gameDateParts(ms, epochDate);
  return `${p.mo}/${p.d}/${p.y}`;
}

/** `2026-10-05 09:41:07` */
export function fmtStamp(ms: number, epochDate?: string): string {
  const p = gameDateParts(ms, epochDate);
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)} ${pad2(p.h)}:${pad2(p.mi)}:${pad2(p.s)}`;
}

/** `09:41:07` */
export function fmtTime24(ms: number, epochDate?: string): string {
  const p = gameDateParts(ms, epochDate);
  return `${pad2(p.h)}:${pad2(p.mi)}:${pad2(p.s)}`;
}

/** Jenkins: `Oct 5, 2026, 9:41:07 AM` */
export function fmtJenkins(ms: number, epochDate?: string): string {
  const p = gameDateParts(ms, epochDate);
  return `${MONTHS_SHORT[p.mo - 1]} ${p.d}, ${p.y}, ${h12(p.h)}:${pad2(p.mi)}:${pad2(p.s)} ${ampm(p.h)}`;
}

/** GitHub-style relative time: `just now`, `3 minutes ago`, `2 hours ago`, `yesterday`, `2 days ago`. */
export function fmtRelative(ms: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return min === 1 ? '1 minute ago' : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? 'last month' : `${months} months ago`;
}

/** Jenkins durations: `0.4 sec`, `4.1 sec`, `1 min 2 sec`, `1 hr 4 min`, `2 days 3 hr`. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `${(Math.round(s * 10) / 10).toFixed(1)} sec`;
  if (s < 60) return `${Math.floor(s)} sec`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${Math.floor(s % 60)} sec`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ${m % 60} min`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ${h % 24} hr`;
}

/** IntelliJ durations: `512 ms`, `24 s 512 ms`, `1 m 3 s`. */
export function fmtIdeaDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  if (total < 1000) return `${total} ms`;
  const s = Math.floor(total / 1000);
  if (s < 60) return `${s} s ${total % 1000} ms`;
  return `${Math.floor(s / 60)} m ${s % 60} s`;
}

/** `$10.83` from integer cents (negative → `-$1.00`). */
export function fmtMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100)}.${pad2(abs % 100)}`;
}

/** Millimetres with one decimal: `22.0`. */
export function fmtMm(mm: number): string {
  return (Math.round(mm * 10) / 10).toFixed(1);
}

/* ═══════════════════════════════ App metadata (Apps §1.9) ═══════════════════════════════ */

const svg = (body: string): AppIconSvg =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>`;

export const APP_ICONS: Record<AppId, AppIconSvg> = {
  orca: svg(
    '<rect width="24" height="24" rx="5" fill="#353d47"/>' +
      '<path d="M3.5 14.2c1.6-4.6 7.3-7.3 12.6-5.4 1.6.6 2.9 1.7 3.6 3.1-1.1-.3-2.1-.2-2.9.4l1.4 2.3c-2.7 1.1-6.6 1.4-9.6.4L6.9 17.6l-.5-2.6c-1-.1-2-.4-2.9-.8z" fill="#fff"/>' +
      '<path d="M7.6 14.6c2.6.8 5.8.8 8.4-.1" stroke="#5ab7ee" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="15.4" cy="11.4" r=".8" fill="#353d47"/>',
  ),
  jenkins: svg(
    '<rect width="24" height="24" rx="5" fill="#335061"/>' +
      '<circle cx="12" cy="10.5" r="5.2" fill="#f0d6b7"/>' +
      '<path d="M6.8 10c.2-3.2 2.4-5.4 5.2-5.4s5 2.2 5.2 5.4c-1.3-1.4-3.1-2-5.2-2s-3.9.6-5.2 2z" fill="#fff"/>' +
      '<circle cx="10.2" cy="11" r=".7" fill="#335061"/><circle cx="13.8" cy="11" r=".7" fill="#335061"/>' +
      '<path d="M8.6 18.6l3.4-1.6 3.4 1.6-3.4 1.6z" fill="#d24939"/>',
  ),
  github: svg(
    '<circle cx="12" cy="12" r="11" fill="#1f2328"/>' +
      '<path d="M9 19.5v-2.6c-2.2-.5-3.4-2-3.4-4.3 0-1.1.4-2.1 1.1-2.8-.2-.8-.1-1.8.3-2.5 1 0 1.9.5 2.6 1.1a8 8 0 013.6 0c.7-.6 1.6-1.1 2.6-1.1.4.7.5 1.7.3 2.5.7.7 1.1 1.7 1.1 2.8 0 2.3-1.2 3.8-3.4 4.3v2.6" stroke="#fff" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
  ),
  ollama: svg(
    '<rect x=".5" y=".5" width="23" height="23" rx="5" fill="#fff" stroke="#d0d0d0"/>' +
      '<path d="M8.5 20v-5.5c0-2.3 1.4-3.6 3.5-3.6s3.5 1.3 3.5 3.6V20" stroke="#111" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M9.6 11.4V6.6c0-1 .5-1.8 1.1-1.8s1 .8 1 1.8v4.3M12.3 10.9V6.6c0-1 .4-1.8 1-1.8s1.1.8 1.1 1.8v4.8" stroke="#111" stroke-width="1.4" fill="none"/>' +
      '<circle cx="10.6" cy="14.2" r=".7" fill="#111"/><circle cx="13.4" cy="14.2" r=".7" fill="#111"/>',
  ),
  browser: svg(
    '<circle cx="12" cy="12" r="10.5" fill="#1a73e8"/>' +
      '<path d="M1.5 12h21M12 1.5c3.4 3.2 3.4 17.8 0 21M12 1.5c-3.4 3.2-3.4 17.8 0 21M3.6 6.5h16.8M3.6 17.5h16.8" stroke="#fff" stroke-width="1.1" fill="none"/>',
  ),
  intellij: svg(
    '<rect width="24" height="24" rx="4" fill="#fe2857"/><rect x="2.5" y="2.5" width="19" height="19" fill="#000"/>' +
      '<rect x="6" y="6" width="2" height="8" fill="#fff"/>' +
      '<path d="M12.6 6h2v6.2c0 1.6-1 2.4-2.4 2.4-1 0-1.8-.4-2.2-1.2l1.4-1c.2.3.5.5.8.5.3 0 .4-.2.4-.7z" fill="#fff"/>' +
      '<rect x="6" y="17" width="7" height="1.6" fill="#fff"/>',
  ),
  terminal: svg(
    '<rect x=".5" y=".5" width="23" height="23" rx="4" fill="#0c0c0c" stroke="#3a3a3a"/>' +
      '<path d="M5.5 8l4.5 4-4.5 4" stroke="#cccccc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M12 16.5h6.5" stroke="#cccccc" stroke-width="2" stroke-linecap="round"/>',
  ),
  gimp: svg(
    '<rect width="24" height="24" rx="5" fill="#5c5543"/>' +
      '<path d="M14.8 3.8l5.4 5.4-8.6 8.6-4.6 1.2 1.2-4.6z" fill="#e8b85d"/>' +
      '<path d="M8.2 14.4l1.4 1.4" stroke="#5c5543" stroke-width="1.2"/>' +
      '<circle cx="16.6" cy="7.4" r="1" fill="#5c5543"/>',
  ),
  camera: svg(
    '<rect width="24" height="24" rx="5" fill="#1b1d21"/>' +
      '<rect x="3.5" y="8" width="11.5" height="8.5" rx="1.8" fill="#3ea6ff"/>' +
      '<path d="M15 11.2l5.5-3v8.1l-5.5-3z" fill="#3ea6ff"/><circle cx="18.6" cy="5.4" r="1.6" fill="#ff3b30"/>',
  ),
  dashboard: svg(
    '<rect width="24" height="24" rx="4" fill="#1d2741"/><rect x="2.5" y="3.5" width="19" height="4.5" fill="#2bd862"/>' +
      '<rect x="4" y="10.5" width="4" height="3" rx=".8" fill="#2b95f2"/><rect x="4" y="15" width="4" height="3" rx=".8" fill="#dcc35a"/>' +
      '<rect x="10" y="10.5" width="4" height="3" rx=".8" fill="#2b95f2"/><rect x="10" y="15" width="4" height="3" rx=".8" fill="#dcc35a"/>' +
      '<rect x="16" y="10.5" width="4" height="3" rx=".8" fill="#2b95f2"/><rect x="16" y="15" width="4" height="3" rx=".8" fill="#dcc35a"/>',
  ),
  chat: svg(
    '<rect width="24" height="24" rx="5" fill="#1a1d29"/>' +
      '<path d="M5.5 6.5h13v9h-7.2l-3.6 3.2v-3.2H5.5z" fill="#fff"/>' +
      '<path d="M10.4 8.6l-1 5.2M13.6 8.6l-1 5.2M8.6 10.3h6.4M8.2 12.2h6.4" stroke="#1a1d29" stroke-width="1"/>',
  ),
  cardreader: svg(
    '<rect x=".5" y=".5" width="23" height="23" rx="4" fill="#f0f0f0" stroke="#9a9a9a"/>' +
      '<rect x="3" y="6.5" width="18" height="11.5" rx="1.6" fill="#2563eb"/><rect x="3" y="9" width="18" height="2.6" fill="#111"/>' +
      '<rect x="5" y="14" width="6" height="1.4" rx=".4" fill="#dbe7ff"/>',
  ),
  files: svg(
    '<path d="M2 6.5A1.5 1.5 0 013.5 5H9l2 2h9.5A1.5 1.5 0 0122 8.5v10a1.5 1.5 0 01-1.5 1.5h-17A1.5 1.5 0 012 18.5z" fill="#e8b23a"/>' +
      '<path d="M2 9.2h20v9.3a1.5 1.5 0 01-1.5 1.5h-17A1.5 1.5 0 012 18.5z" fill="#fbd96b"/>',
  ),
};

export const APP_META: Record<AppId, AppMeta> = {
  orca: {
    id: 'orca',
    title: 'Orchestrator',
    iconLabel: 'Orca',
    icon: APP_ICONS.orca,
    chrome: 'browser',
    origin: 'http://orca.lab.local:8080',
    homeRoute: APP_ROUTES.orca.home.path,
    defaultSize: { w: 1280, h: 820 },
    minSize: { w: 760, h: 480 },
    singleInstance: true,
    desktopIcon: true,
    pinned: true,
    aliases: ['orca', 'orchestrator', 'robots', 'jhipster'],
    exportName: 'OrcaApp',
  },
  jenkins: {
    id: 'jenkins',
    title: 'Jenkins',
    iconLabel: 'Jenkins',
    icon: APP_ICONS.jenkins,
    chrome: 'browser',
    origin: 'http://jenkins.lab.local:8080',
    homeRoute: APP_ROUTES.jenkins.dashboard.path,
    defaultSize: { w: 1240, h: 800 },
    minSize: { w: 760, h: 480 },
    singleInstance: true,
    desktopIcon: true,
    pinned: true,
    aliases: ['jenkins', 'ci', 'builds', 'pipelines'],
    exportName: 'JenkinsApp',
  },
  github: {
    id: 'github',
    title: 'GitHub',
    iconLabel: 'GitHub',
    icon: APP_ICONS.github,
    chrome: 'browser',
    origin: 'https://github.com',
    homeRoute: APP_ROUTES.github.org.path,
    defaultSize: { w: 1240, h: 820 },
    minSize: { w: 760, h: 480 },
    singleInstance: true,
    desktopIcon: true,
    pinned: true,
    aliases: ['github', 'git', 'pull requests', 'gort', 'uia-remote', 'pigeon'],
    exportName: 'GitHubApp',
  },
  ollama: {
    id: 'ollama',
    title: 'Ollama WebUI',
    iconLabel: 'Ollama WebUI',
    icon: APP_ICONS.ollama,
    chrome: 'browser',
    origin: 'http://10.42.1.12:3000',
    homeRoute: APP_ROUTES.ollama.home.path,
    defaultSize: { w: 1060, h: 760 },
    minSize: { w: 640, h: 440 },
    singleInstance: true,
    desktopIcon: true,
    pinned: false,
    aliases: ['ollama', 'llava', 'vision', 'ai', 'llm'],
    exportName: 'OllamaApp',
  },
  browser: {
    id: 'browser',
    title: 'Browser',
    iconLabel: 'Browser',
    icon: APP_ICONS.browser,
    chrome: 'browser',
    origin: null,
    homeRoute: APP_ROUTES.browser.newTab.path,
    defaultSize: { w: 1100, h: 740 },
    minSize: { w: 520, h: 360 },
    singleInstance: false,
    desktopIcon: true,
    pinned: true,
    aliases: ['browser', 'chrome', 'web', 'internet'],
    exportName: 'BrowserApp',
  },
  intellij: {
    id: 'intellij',
    title: 'IntelliJ IDEA',
    iconLabel: 'IntelliJ IDEA',
    icon: APP_ICONS.intellij,
    chrome: 'native',
    origin: null,
    homeRoute: APP_ROUTES.intellij.welcome.path,
    defaultSize: { w: 1440, h: 880 },
    minSize: { w: 900, h: 560 },
    singleInstance: false,
    instanceKey: (p) => p.repo ?? 'welcome',
    desktopIcon: true,
    pinned: true,
    aliases: ['intellij', 'idea', 'ide', 'java', 'editor'],
    exportName: 'IntelliJApp',
  },
  terminal: {
    id: 'terminal',
    title: 'Terminal',
    iconLabel: 'Terminal',
    icon: APP_ICONS.terminal,
    chrome: 'native',
    origin: null,
    homeRoute: buildRoute(APP_ROUTES.terminal.tab, { n: 1 }),
    defaultSize: { w: 940, h: 580 },
    minSize: { w: 480, h: 280 },
    singleInstance: true,
    desktopIcon: true,
    pinned: true,
    aliases: ['terminal', 'bash', 'shell', 'ssh', 'adb', 'console', 'cmd'],
    exportName: 'TerminalApp',
  },
  gimp: {
    id: 'gimp',
    title: 'GNU Image Manipulation Program',
    iconLabel: 'GIMP',
    icon: APP_ICONS.gimp,
    chrome: 'native',
    origin: null,
    homeRoute: APP_ROUTES.gimp.empty.path,
    defaultSize: { w: 1320, h: 840 },
    minSize: { w: 900, h: 560 },
    singleInstance: true,
    desktopIcon: true,
    pinned: false,
    aliases: ['gimp', 'image', 'screenshot', 'coordinates'],
    exportName: 'GimpApp',
  },
  camera: {
    id: 'camera',
    title: 'Lab Cameras',
    iconLabel: 'Lab Cameras',
    icon: APP_ICONS.camera,
    chrome: 'native',
    origin: null,
    homeRoute: APP_ROUTES.camera.home.path,
    defaultSize: { w: 1160, h: 760 },
    minSize: { w: 640, h: 420 },
    singleInstance: true,
    desktopIcon: true,
    pinned: false,
    aliases: ['camera', 'webcam', 'stream', 'mjpeg', 'recordings'],
    exportName: 'CameraApp',
  },
  dashboard: {
    id: 'dashboard',
    title: 'LabSim Robot Dashboard',
    iconLabel: 'Robot Dashboard',
    icon: APP_ICONS.dashboard,
    chrome: 'native',
    origin: null,
    homeRoute: APP_ROUTES.dashboard.home.path,
    defaultSize: { w: 1180, h: 760 },
    minSize: { w: 760, h: 520 },
    singleInstance: true,
    desktopIcon: true,
    pinned: false,
    aliases: ['dashboard', 'tablet', 'park', 'motion control', 'robot'],
    exportName: 'DashboardApp',
  },
  chat: {
    id: 'chat',
    title: 'LabChat',
    iconLabel: 'LabChat',
    icon: APP_ICONS.chat,
    chrome: 'native',
    origin: null,
    homeRoute: buildRoute(APP_ROUTES.chat.channel, { name: 'lab-automation' }),
    defaultSize: { w: 1040, h: 700 },
    minSize: { w: 600, h: 420 },
    singleInstance: true,
    desktopIcon: true,
    pinned: true,
    aliases: ['chat', 'slack', 'messages', 'labchat', 'tickets'],
    exportName: 'ChatApp',
  },
  cardreader: {
    id: 'cardreader',
    title: 'MagStripe Reader',
    iconLabel: 'Card Reader',
    icon: APP_ICONS.cardreader,
    chrome: 'native',
    origin: null,
    homeRoute: APP_ROUTES.cardreader.home.path,
    defaultSize: { w: 600, h: 460 },
    minSize: { w: 480, h: 380 },
    singleInstance: true,
    desktopIcon: true,
    pinned: false,
    aliases: ['card reader', 'magstripe', 'swipe', 'track data', 'msr'],
    exportName: 'CardReaderApp',
  },
  files: {
    id: 'files',
    title: 'File Explorer',
    iconLabel: 'This PC',
    icon: APP_ICONS.files,
    chrome: 'native',
    origin: null,
    homeRoute: buildRoute(APP_ROUTES.files.dir, { path: '~' }),
    defaultSize: { w: 940, h: 600 },
    minSize: { w: 520, h: 360 },
    singleInstance: false,
    desktopIcon: true,
    pinned: true,
    aliases: ['files', 'explorer', 'folders', 'pictures', 'downloads'],
    exportName: 'FilesApp',
  },
};
