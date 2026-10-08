# LabSim — The Engineer Workstation & Computer Apps

> **Doc:** `docs/design/50-computer-apps.md` (cited **Apps §n**) · **Depends on:** `00-canon.md` (wins every
> conflict), `docs/reference/REMOVED-internal-reference.md` (**Ref §n**), `10-curriculum.md` (**Cur §n / Mnn sN**),
> `20-gameplay.md` (**GP §n / INCnn / GWnn / DRnn**), `30-world.md` (**World §n**), `40-simulation.md` (**Sim §n**).
> **Contract file:** `src/computer/apps.ts` (app ids, `AppProps`, window-manager API, registries, `APP_ROUTES`,
> `APP_ACTIONS` and their payload types). Where this doc and `apps.ts` disagree on a *name*, `apps.ts` wins and
> this doc is fixed; where they disagree on *behaviour*, this doc wins.
> **This doc owns:** the in-game desktop (shell, window manager, notifications, clipboard, file dialog, hints),
> every computer app's UI, layout, look and feel, keyboard map, the routes and UI actions it reports, and which
> `sim.*` calls it makes. The terminal **command catalogue** (§5.4) is specified here and implemented by the sim
> (`src/sim/terminal/`, Sim §0.5).
> **It does not own:** simulation behaviour or exact sim strings (Sim — reused verbatim here), lesson scripts
> (Cur), scoring/tickets/HUD (GP, `src/ui`), the 3D monitors' mirror texture (World §3.6).

The workstation is where a trainee spends half of every shift. The rule for every screen in this document:
**a new hire who has used LabSim must recognise the real tool on day one** — same layout, same labels, same
place for the button, same error text. Every app is a thin, faithful UI over the simulation: it *reads* lab
state from the store and *changes* it only through `sim.*` (Sim, `src/sim/api.ts`). No app keeps its own copy
of lab truth, and no app decides whether something succeeded — the sim does, and the app shows the sim's
words.

---

## 0. Conventions

### 0.1 Markers and citations

| Marker | Meaning |
|---|---|
| **[illus.]** | Invented UI detail (a page, a label, a convenience) where the reference is silent. Never contradicts the reference. Same rule as Cur **†**, GP/Sim **[illus.]**. |
| **[game]** | A game affordance that does not exist in the real tool (hint ring, "Stand up", the pinned objective). Always visually distinct (amber `#f5b301` accents, rounded "game" font weight), never imitating the tool. |
| `exact` | A string in `code` inside a quoted UI label/table cell must be rendered byte-for-byte (case, punctuation, Unicode dashes `—`, arrows `→`, the multiplication sign `×`). Strings that come from sim state (Notes, consoles, terminal output) are rendered as-is, never re-worded. |
| MUST / SHOULD | Normative for the app builders. |

### 0.2 Source layout, ownership and import rules

```
src/computer/
  apps.ts                 contract: AppId, APP_META (+ icons), AppProps, WindowManagerApi (+ get/setWindowManager),
                          registries (webcams, images, chat replies), mission bridge (requestOpenApp, requestHint),
                          host table (resolveUrl), APP_ROUTES + matchRoute/buildRoute, APP_ACTIONS + payload types
                          + emitAppAction/onAppAction, APP_HINT_TARGETS, game-clock formatters.
                          No React runtime, no sim runtime import (missions and the world import it).
  apps.test.ts            contract tests (routes, host table, actions, bridge, formatters, registry loading)
  index.ts                public entry: Desktop, TabletDashboard, APP_REGISTRY (meta + lazy load), initComputer;
                          re-exports apps.ts
  shell/                  Desktop, taskbar, start menu, window manager store, WindowFrame, BrowserChrome,
                          notifications, file dialog, hint overlay, objective pin, image materializer host
  tablet/                 TabletDashboard overlay (wraps apps/dashboard's DashboardSurface)
  apps/<appId>/index.tsx  each app's root component (+ any number of sibling files in that folder)
  sandbox/                sandbox-only fakes (fake lab seeding through mutate()); never imported by src code
```

| Import | Allowed from `src/computer/**` | Why |
|---|---|---|
| `@/core/*` | yes | store (`useGame`, `useGameShallow`, `mutate`, `getState`), `emit`, `bus` |
| `@/sim` | yes — `sim` (actions) and types | all lab changes go through `sim.*` |
| `@/engine` | yes — `engine.releaseFocus()`, `engine.captureView()`, `engine.audio.play()` only | stand up, camera streams, UI sounds |
| `@/render2d` | yes — `drawDeviceDisplay`, `drawReceipt`, `drawTablet` and `tabletLayout` constants | screencaps, synthetic webcam frames, receipts, tablet layout (World §5) |
| `@/content/team` | yes — display names and avatar colours only | real names live only in `team.ts` (canon) |
| `@/ui/kit` | yes, but apps SHOULD NOT look like the game UI — the kit is for [game] elements only | |
| `three` | **no runtime import**; opaque camera objects come from the webcam registry (§8.3) | |
| `@/world`, `@/missions` | **no** — they talk to the computer through `apps.ts` registries and bus events | |

Inside `src/computer`, an app folder never imports another app folder **except** these stable entry points
(all exported by the stub files created with this doc, so parallel builders compile from day one):
`TerminalApp` (IntelliJ's Terminal tool window embeds it, §4.10), `DashboardApp`/`DashboardSurface`
(the tablet overlay embeds it, §10), `startCameraRecorder` and `startImageMaterializer` (exported by
`apps/camera/index.tsx`; `initComputer()` dynamic-imports and starts both, §1.6, §8.6).

**Builder split (suggested, three parallel builders):**

| Builder | Owns |
|---|---|
| A — shell & small apps | `shell/`, `tablet/`, `index.ts`, `apps/terminal`, `apps/chat`, `apps/dashboard`, `apps/cardreader`, `apps/files`, `apps/browser` |
| B — web apps | `apps/orca`, `apps/jenkins`, `apps/github`, `apps/ollama` |
| C — desktop pro apps | `apps/intellij`, `apps/gimp`, `apps/camera` (incl. the recorder and the image materializer, §6.5/§8.6) |

`apps.ts` is shared: changes are additive only and announced (add, never rename — same rule as the sim
contract files).

### 0.3 The event contract (what missions see)

Three core events (`src/core/events.ts`) are the computer's public voice. Missions, the Field Manual and
achievements listen to them; nothing else in the computer is observable.

| Event | Who emits | When |
|---|---|---|
| `app.opened` `{ app }` | shell | a window for `app` is created, or an existing window is restored/focused **by an open request** (taskbar click on a running app does not re-emit) |
| `app.navigated` `{ app, route }` | **shell only** | every route change of every window: initial route on open, in-app navigation (`props.navigate`), browser back/forward/reload/address bar. Apps never emit it themselves. |
| `app.action` `{ app, action, data }` | the app (via `emitAppAction`) | every meaningful action listed in `APP_ACTIONS` (Appendix B), once per user action, **after** the sim call returned |

Rules:
1. **Route strings.** For browser-hosted apps (`chrome: 'browser'`) the route is the URL *path + query* exactly as
   the address bar shows after the host (`/robot/5/edit`, `/robot?status.in=AVAILABLE&page=1&sort=id,asc`,
   `/job/Java/job/uia-remote-regression-flex/4127/console`). For desktop apps it is a pseudo-path defined in
   `APP_ROUTES` (`/project/uia-remote/file/app/src/.../HomeScreen.java`, `/stream/r2-d2`). Query keys are emitted
   in the order the app writes them; missions use `matchRoute()` (apps.ts), which ignores query order.
2. **Route templates** use `:name` for one path segment and `*name` for "the rest of the path" (may contain `/`).
   `buildRoute(APP_ROUTES.orca.robotEdit, { id: 5 })` → `/robot/5/edit`. Templates and builders live in apps.ts.
3. **Action names** are `<app>.<object>.<verb>` in lowerCamel segments (`orca.merchant.editOpened`). The event's
   `app` field is the emitting `AppId`, or `'desktop'` (shell actions) or `'tablet'` (the 3D tablet overlay).
4. **Payloads** are plain JSON, typed in `AppActionPayloads` (apps.ts). Every payload carries enough to evaluate
   a lesson step without re-reading UI state (ids **and** names, the sim result `ok`/`error` where a sim call is
   involved).
5. **Emit after the fact.** `emitAppAction` is called after the `sim.*` call returns (so the payload carries the
   result) and outside React render (event handlers/effects only). Failed validation that never reached the sim
   emits nothing unless the table says so (`*.saveFailed`).
6. **No double counting.** Sim events already cover lab facts (`robot.statusChanged`, `jenkins.buildQueued`,
   `git.committed`, `terminal.command`, `rig.command` …, `src/sim/events.ts`). App actions add *UI* facts
   (which page, which field, which line was clicked, which reply was chosen). Missions MUST evaluate
   `computer-task` success on **sim state** whenever Cur says so (Cur §2.0) and use app events only for steps
   whose condition is a UI observation ("Notes opened", "line clicked", "clip watched to end").

### 0.4 Reading state, calling the sim

* **Reads:** `useGame(s => s.lab…)` with selectors that return primitives or stable references; small derived
  objects/arrays via `useGameShallow`. Never select `s.lab` wholesale (the sim ticks at 20 Hz — a component that
  selects the whole lab re-renders 20×/s). Derive heavy views (sorted/filtered tables, git trees) with
  `useMemo` keyed on the stable sub-objects (`s.lab.orca.robots`, `s.lab.repos['gort']`).
* **Writes:** only `sim.*` with actor `'player'`. Every method returns `Result` (`{ok:true,value}` /
  `{ok:false,error}`); apps render `error` verbatim in the tool's own error style (JHipster alert, Jenkins red
  text, IntelliJ balloon, terminal stderr…). Methods never throw for user error; an exception means the sim is
  not implemented yet → catch at the call site, show the tool's generic failure (`Internal server error`,
  `Something went wrong`, …) and `console.warn` it.
* **While the sim is landing** (`sim.*` throws "not implemented", lab collections empty): builders develop against
  the contract with a sandbox fake (`src/computer/sandbox/`) that seeds plausible state via `mutate()` using the
  seed tables of Sim §2. Fields that Sim §0.4 adds but `types.ts` does not have yet are read defensively
  (`(robot as Partial<…>).checkout ?? null`) and typed through a local `SimExt` interface that mirrors Sim §1 —
  delete it once the contract file catches up.
* **Never** `Math.random()`/`Date.now()` for anything a lesson could observe; UI-only randomness (cursor blink,
  typing animation jitter) is fine.

### 0.5 Network reachability (what a web page / stream / dashboard shows)

The workstation (`ws-17`, `10.42.50.17`) reaches hosts over the lab network with the rules of Sim §1.9.
Until the sim exports a pure helper (contract delta D10), the shell implements `reach(lab, hostOrIp, port)`:

| Check (in order) | Result | Browser page | Camera / dashboard |
|---|---|---|---|
| host/alias/IP unknown | `unknown` | `This site can't be reached` · `<host>’s server IP address could not be found.` · `DNS_PROBE_FINISHED_NXDOMAIN` | `Stream unavailable — <url>` · `Could not resolve host` |
| `network.switchUp == false`, host `os != 'RUNNING'` (or `power != 'on'` on old types), `eth == 'UNPLUGGED'` (or `ethernet == false`), `DAMAGED` on an odd attempt | `timeout` | `This site can't be reached` · `<host> took too long to respond.` · `ERR_CONNECTION_TIMED_OUT` | `… · connect timed out after 10000 ms` |
| no running service listening on `port` | `refused` | `This site can't be reached` · `<host> refused to connect.` · `ERR_CONNECTION_REFUSED` | `… · Connection refused` |
| otherwise | `ok` | page renders | stream/dashboard renders |

Per app: Orca = `orca-vm` service `orca` :8080 (then app-level `orca.app.dbConnected` decides the JHipster 500
page, §2.13); Jenkins = `jenkins-vm` service `jenkins` :8080 (or `lab.jenkins.up`); Ollama WebUI = `ollama-vm`
:3000 [illus.] (VM up ⇒ page loads; `ollama` service :11434 down ⇒ "Model server unreachable", §9); GitHub =
always reachable [sim]; dashboards = the rig's Pi `robot-controller` :8000; camera streams = camera host
`camera-stream` :8081. The browser error page is Chromium's: grey dino-free illustration (a document icon with a
frown), title, sub-line, a **Try:** list (`Checking the connection`, `Checking the proxy and the firewall`),
the error code in small caps grey, blue **Reload** button.

### 0.6 Time and number formatting

All times come from the **game clock** `lab.time.nowMs` (ms since game-midnight of `time.epochDate`
`2026-10-05`, a Monday; Sim §0.3). `apps.ts` exports the formatters every app uses:

| Helper | Example | Used by |
|---|---|---|
| `fmtClock(ms)` | `9:41 AM` | taskbar, LabChat, Ollama |
| `fmtDate(ms)` | `10/5/2026` | taskbar |
| `fmtStamp(ms)` | `2026-10-05 09:41:07` | Orca (non-sim strings), camera overlay, GIMP image info |
| `fmtJenkins(ms)` | `Oct 5, 2026, 9:41:07 AM` | Jenkins build pages |
| `fmtRelative(ms, nowMs)` | `just now`, `3 minutes ago`, `2 hours ago`, `yesterday`, `2 days ago` | GitHub, Jenkins "Last Success" (`1 hr 4 min`) has its own `fmtDuration` |
| `fmtDuration(ms)` | `4.1 sec`, `1 min 2 sec`, `1 hr 4 min` | Jenkins, IntelliJ (`24 s 512 ms` via `fmtIdeaDuration`) |

Money is formatted from integer cents (`$10.83`); millimetres with one decimal (`22.0`); webcam/screencap pixels as
integers.

### 0.7 Shared look-and-feel rules

* **No external assets.** Fonts are system stacks only — UI: `"Segoe UI", system-ui, -apple-system, Roboto,
  "Helvetica Neue", Arial, sans-serif`; mono: `"Cascadia Mono", "JetBrains Mono", Consolas, "DejaVu Sans Mono",
  Menlo, monospace`. Icons are inline SVG (single-colour, `currentColor`, 16/20/24 px grids). Logos are simplified
  marks drawn in SVG (no bitmaps, no trademarks traced).
* **Scoped CSS.** CSS modules or colocated `.css` files; every selector is prefixed with the app's class prefix and
  every app root is `<div className="<prefix>-root" data-app="<id>">`. Never style bare elements globally
  (`button {}`, `*`, `body`). Colour tokens are CSS variables declared on the root (`.orca-root { --orca-primary:
  #0d6efd }`).

  | Area | Prefix | | Area | Prefix |
  |---|---|---|---|---|
  | shell / desktop | `ws-` | | GitHub | `gh-` |
  | browser chrome | `br-` | | Lab Cameras | `cam-` |
  | Orca | `orca-` | | Ollama WebUI | `oll-` |
  | Jenkins | `jk-` | | Robot dashboard / tablet | `rdash-` |
  | IntelliJ IDEA | `ij-` | | LabChat | `lc-` |
  | Terminal | `term-` | | Card Reader | `cr-` |
  | GIMP | `gimp-` | | Files | `fx-` |

* **Density.** Real tools are dense. Body text 13–14 px in desktop apps, 14–15 px in web apps (the window is a
  part of a 1080p screen, not a full browser). Never upscale "for the game".
* **Performance.** Lazy-load each app (`load()`), subscribe narrowly, virtualise lists > 300 rows, animate with CSS
  transforms, render camera frames only for visible, non-minimised windows (§8.4). Target: opening any app
  < 150 ms after its chunk is cached; typing latency in editors/terminal < 16 ms.
* **Keyboard.** Every action reachable by mouse is reachable by keyboard where the real tool allows it. Browser-
  reserved shortcuts (`Ctrl+N/T/W`, `Ctrl+Shift+N/T/W`, `Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+PgUp/PgDn`, `Alt+F4`,
  `F11`) cannot be intercepted by a page unless the game is fullscreen **and** the Keyboard Lock API is active
  (§1.8); every such tool shortcut therefore has a documented substitute.
* **Accessibility.** Focus rings visible (`:focus-visible`), ARIA roles on menus/tabs/dialogs/trees, `aria-live`
  for consoles and toasts, colour is never the only signal (status chips carry text).

### 0.8 Contract deltas this doc needs from other modules

Builders code against these now (feature-detect, fall back as stated) and list them in their final reports.

| # | Owner | Delta | Fallback until it lands |
|---|---|---|---|
| D1 | sim | `orca.addNote(robotId, text, actor)` → MANUAL note | hide **Add note** |
| D2 | sim | `orca.matchPreview(capsJson, env)` (Sim §0.4, §3.4.3) | `orca.rest('POST','/api/match-preview', body)` |
| D3 | sim | `orca.checkout({… kind:'manual', environment})`, manual `orca.release` (Sim §3.4) | **Check out** shows the block toast from status alone (§2.4) |
| D4 | sim | `jenkins.saveJob(jobId, patch)`, `jenkins.moveJob(jobId, folder)` (Sim §0.4, §3.18.1) | Configure/Move pages render read-only with a Jenkins `Error` banner |
| D5 | sim | `git.moveFile`, `git.deleteFile`; GitHub-side `github.createBranch(repo, name, fromSha)`, `github.commitFile(repo, branch, path, contents, message, actor)`; `git.reviewPullRequest(repo, n, {verdict, body, comments[{path,line,body,reason}]}, actor)` (Sim §3.22.2) | web edits go through the local clone (clone if needed → checkout/branch → `writeFile` → `stage` → `commit` → `push`); Approve → `approvePullRequest`; Request changes emits the action only |
| D6 | sim | `host.writeFile(hostId, path, contents)` (Sim §0.4), incl. `ws-17` paths under `~` → `workstation.files` | nano/snapshots keep a session-local file map in the computer store |
| D7 | sim | `terminal.exec/poll/complete/prompt(…, sessionId?)` — one shell session per terminal tab | all tabs share the single sim session |
| D8 | sim | `runner.validateConfig(text, robotName)` → the Cur M14 11-key result | IntelliJ's local validator (§4.8) |
| D9 | sim | `net.request(method, url, body?) : RestResponse` — the curl engine for any lab URL (Sim §3.23) | the browser shows Orca via `orca.rest`, every other raw URL as "This site can't be reached" |
| D10 | sim | pure `reach(lab, host, port)` helper (Sim §1.9) | shell-local implementation of §0.5 |
| D11 | core | ✅ landed: `core/events.ts` declares `computer.windowsChanged` and `workstation.cardSwiped`; the mission-only request events (`computer.openAppRequested`, `computer.hintRequested`, `computer.hintCleared`) stay declared in `apps.ts` (missions import it) | — |
| D12 | core | ✅ landed: `session.realism` and the lesson gating `session.computer` (`unlockedApps`, `restrictions`, `forceHealthCheckButton`, `tabCompletion`) — §1.11 | — |
| D13 | ui | render `<Desktop onExit/>` for overlay `computer`, `<TabletDashboard robotId onExit/>` for `tablet`; call `initComputer()` once at boot; hide the HUD objective panel while overlay is `computer` (the desktop pins it, §1.7) | `Desktop` calls `initComputer()` on first mount |
| D14 | world | `registerWebcamProvider()` (§8.3) at the end of `buildRigs`; emit `workstation.cardSwiped` from `desk.player.card-reader`; consume `computer.windowsChanged` for the monitor mirror (World §3.6); fix World App. B timestamp to `2026-10-05` and the Rack B mosaic order to Sim §2.11.1 (TL JOHNNY-5, TR BAYMAX, BL SETI, BR ROSIE) | synthetic frames (§8.5) |
| D15 | missions | open apps with `requestOpenApp`, show hints with `requestHint`, offer chat replies with `setChatReplyProvider` (apps.ts) | — |
| D16 | sim | `camera.snapshot({ url \| cameraId, path })` → `{ imageRef }` (Sim §5.6 event `camera.snapshot`, Sim A.2 M16): creates the `workstation.files` entry | D6 / session file map |
| D17 | sim | `ocr.frame(imageRef)` → the frame model's label rects for a webcam/screencap ref (Sim A.2 M16, "GIMP") — the materializer's synthetic frames and GIMP's self-check use it | the Sim §2.11.1 table hard-coded in `apps/camera/frameModel.ts` |
| D18 | sim | `runner.runLocal(repo, test, actor, { configPath })` for Code With Me runs (Sim §1.15, INC29) | run with the default clone config |
| D19 | sim | `git.requestChanges(repo, n, reason, actor)` (Sim A.2 M17) — the D5 review call's Request-changes half | emit only |
| D20 | sim | `orca.forceHealthCheck()` (= `runHealthCheckNow` behind the tutorial gate, Sim §0.4) — Orca's tutorial button calls it | `orca.runHealthCheckNow()` |

---

## 1. Desktop shell

### 1.1 Entry points

| Export (`@/computer`) | Signature | Notes |
|---|---|---|
| `Desktop` | `(props: { onExit?: () => void }) => JSX` | Full-screen overlay (fills its parent, `position:absolute; inset:0`). `onExit` is called on **Stand up**; without it the desktop does `mutate(s => { s.ui.overlay = { kind: 'none' } })` and `engine.releaseFocus()`. |
| `TabletDashboard` | `(props: { robotId: string; onExit?: () => void }) => JSX` | The zoomed status-tablet overlay (§10.7). `robotId` = rig id = Orca robot **Name** (`wall-e`). Same exit fallback. |
| `APP_REGISTRY` | `AppDefinition[]` | `APP_META` (apps.ts) + `load()` per app. |
| `initComputer` | `() => () => void` | Idempotent. Starts the camera recorder (§8.6), the image materializer (§1.6) and the request queue drain. ui calls it at boot (D13); `Desktop` also calls it on mount. Returns a disposer (tests). |

The desktop is **one logical screen** that fills the player's view. The two physical monitors on the desk (World
§1.4) are mirrored at low resolution by the world from `computer.windowsChanged` (§1.10); the player never manages
two screens. The sim keeps running while seated (the computer overlay does not pause, GP §6.3).

### 1.2 Visual specification

Corporate Windows-11-like desktop; nothing is branded Microsoft. Base font `Segoe UI` stack 13 px.

| Element | Spec |
|---|---|
| Wallpaper | radial gradient `#0b3d2a` (centre-left) → `#06261b` → `#041a13` edges, plus a large translucent four-leaf mark (4 circles, `rgba(110, 231, 160, .10)`) bottom-right — the "dark green gradient + leaf" of World §3.6 |
| Desktop icons | left column grid 84 × 92 px cells starting (12, 12); 40 px icon + 2-line label 12 px white with `text-shadow 0 1px 2px #000a`; single click selects (`rgba(255,255,255,.18)` tile, 1 px `rgba(255,255,255,.3)` border), double-click / Enter opens, arrow keys move selection, drag to rearrange (positions persisted per viewer in `localStorage['labsim.desktop.icons.v1']`, try/catch). Icons: Files (`This PC` folder), Browser, Orca, Jenkins, GitHub, IntelliJ IDEA, Terminal, GIMP, Lab Cameras, Ollama WebUI, LabChat, Robot Dashboard, Card Reader, Recycle Bin (opens Files at an empty `Recycle Bin` folder). |
| Taskbar | bottom, height 48 px, `rgba(32, 32, 32, .85)` + `backdrop-filter: blur(20px)` (fallback `#202020`), top border 1 px `#ffffff14`. Centre group: Start button (a neutral 2 × 2 white-squares glyph), Search pill (`Search` placeholder, opens Start with focus), then pinned apps: Files, Browser, Orca, Jenkins, GitHub, IntelliJ IDEA, Terminal, LabChat; running apps not pinned append after a 1 px divider. Running indicator: 3 × 16 px pill under the icon (`#9a9a9a`, focused window `#4cc2ff` 6 × 16 px). Hover: tooltip with window titles (one row per window, click focuses). Badges: red pill top-right of the icon — LabChat total unread (`lab.chat.unread` sum), Jenkins count of builds that finished `FAILURE` since the Jenkins window was last focused. |
| System tray (right) | `^` overflow (Card Reader status dot when a reader swipe is pending), network glyph (tooltip `lab-corp · Connected` / `No internet access` when `network.switchUp` is false), speaker glyph (tooltip `Speakers: <masterVolume×100>%`), notification bell with count, clock block: two lines 12 px right-aligned `9:41 AM` / `10/5/2026` from `fmtClock`/`fmtDate` (updates once per game second — select `Math.floor(nowMs / 1000)`). Clicking the clock opens a flyout calendar for October 2026 with today highlighted and the line `Lab time ×<timeScale>` [game] (`×1`, `×5` in a shift). |
| Stand up [game] | right of the clock: button `Stand up` with a chair glyph, 32 px high, amber 1 px border `#f5b301`, label `Stand up · Esc`. |
| Start menu | 640 × 720 px panel centred above the taskbar, `#2b2b2bf2` + blur, radius 8 px. Search box `Type here to search` (filters apps by title/alias), **Pinned** 6 × 3 grid of app tiles, **All apps ›** alphabetical list, **Recommended** = last 6 opened routes (e.g. `Orca — Robots`, `HomeScreen.java`). Footer: user tile (circle with initials of `progress.playerName`, name) and a power button whose menu has `Stand up` [game] and `Sign out` (= Stand up). `Esc` or click outside closes. |
| Windows | radius 8 px, 1 px border `#ffffff1f` (dark apps) / `#0000001f` (light apps), shadow `0 8px 32px #0008`. Title bar 32 px (browser windows use the browser tab strip as their title bar, §1.4): app icon 16 px, title 12 px, right buttons `─ ☐ ✕` 46 × 32 px (close hover `#c42b1c`). Unfocused windows: title text 60 % opacity, no shadow change. Light apps (Orca, Jenkins, GitHub, Files, Card Reader) get light title bars `#f3f3f3`; dark apps (IntelliJ, Terminal, GIMP, Cameras, Ollama, LabChat sidebar) get `#202020`. |
| Context menus | `#2c2c2c` (dark) / `#f9f9f9` (light), radius 8 px, item height 28 px, shortcut text right-aligned 60 % opacity. |

### 1.3 Window manager

State lives in a computer-local zustand store (`shell/wmStore.ts`), **not** in `RootState` and not in the sim.

```ts
interface WindowState { id: string; app: AppId; title: string; route: string; params: AppParams;
  x: number; y: number; w: number; h: number; minimized: boolean; maximized: boolean;
  snapped: 'left' | 'right' | null; z: number; history: string[]; historyIndex: number; reloadKey: number;
  instanceKey: string | null; createdAtMs: number }
```

| Behaviour | Spec |
|---|---|
| Open | `openApp(id, params)`: if the app is `singleInstance` (or an existing window has the same `instanceKey(params)`), focus/restore that window and, if `params.route` (or app-specific params) is given, navigate it (push history). Otherwise create a window at the cascade position `(64 + 28n, 40 + 28n)` mod the work area, size `defaultSize` clamped to the work area (work area = viewport minus taskbar); if the viewport is narrower than 1280 px open maximised. Emit `app.opened`, then `app.navigated` with the initial route. |
| Focus | mousedown anywhere in a window focuses it (z = max + 1) and gives the app `focused: true`. Exactly one focused window or none (desktop focused). |
| Move | drag the title bar (or browser tab strip blank area); window stays ≥ 40 px visible on every side. Drag a maximised window: restore to its previous size under the cursor. |
| Resize | 8 hit zones (4 edges 6 px, 4 corners 12 px); respects `minSize`. |
| Snap | drag to the left/right screen edge → half width (preview ghost `#ffffff22` with 1 px `#ffffff55` border); to the top edge → maximise. Keyboard: `Win+←/→` snap, `Win+↑` maximise, `Win+↓` restore/minimise — and the always-available substitutes `Ctrl+Alt+←/→/↑/↓` (the OS usually eats the Win key). |
| Maximise | button ☐ or double-click the title bar toggles; maximised windows have no radius/border. |
| Minimise | `─` button or taskbar click on the focused window; taskbar click on a minimised window restores and focuses it. |
| Close | `✕` button, title-bar context menu `Close`, or `Alt+F4` when keyboard-locked (§1.8). Apps can veto with `props.onBeforeClose` returning a message (IntelliJ unsaved files are auto-saved first, so it never vetoes; nano asks `Save modified buffer?`). |
| Cycle | `Alt+\`` (always) and `Ctrl+Tab` (keyboard-locked only, GP §6.3) cycle windows in MRU order with a centred switcher strip of app icons + titles; release `Alt`/`Ctrl` to pick. |
| Persistence | per-app last bounds in `localStorage['labsim.desktop.layout.v1']` (try/catch). Open windows survive standing up and sitting down again (the store is module-level). On `session.started` (new lesson/shift/free-play), all windows close except LabChat, and the desktop shows the session's objective (§1.7). |
| Title | `props.onTitle(t)` sets the title shown in the title bar/taskbar tooltip (`Robots — Orchestrator`, `HomeScreen.java – uia-remote`, `pi@wall-e: ~`). |

`WindowManagerApi` (apps.ts) is what apps use: `openApp`, `close`, `focus`, `minimize`, `toggleMaximize`,
`setTitle`, `navigate`, `notify`, `pickFile`, `clipboard`, `windows()`. The shell passes it as `props.wm` and
registers it with `setWindowManager()` on mount (`null` on unmount); code outside a window (the recorder,
notifications from background services) uses `getWindowManager()`.

### 1.4 Browser chrome (Orca, Jenkins, GitHub, Ollama WebUI, Browser)

Apps with `chrome: 'browser'` are hosted in a Chromium-like frame drawn by the shell. The app renders only the
page; it is a pure function of `props.route` and calls `props.navigate(route)` to move.

| Part | Spec |
|---|---|
| Tab strip (title bar) | `#dee1e6` 38 px; one tab 240 px max: favicon 16 px (per app: Orca whale, Jenkins butler head [simplified], GitHub cat-mark [simplified], Ollama llama head [simplified], globe), page title from `onTitle`, `✕`. `+` new-tab button opens a Browser window (new-tab page). Window buttons on the right. |
| Toolbar | `#ffffff` 40 px: back `←`, forward `→` (enabled from window history), reload `⟳` (`F5`/`Ctrl+R`, increments `reloadKey` → app remounts its page), address bar (pill `#f1f3f4`, radius 20 px): left chip `ⓘ Not secure` for `http://` URLs (all lab URLs are plain HTTP), lock icon for `https://github.com`; the URL text grey host + dark path when not focused; full URL selected on focus. `Ctrl+L` / `Alt+D` focus it. Right: star (decor) and a profile circle with the player's initials. |
| Bookmarks bar | 28 px, `#ffffff`, bookmarks: `Orchestrator` (`http://orca.lab.local:8080/`), `Jenkins` (`http://jenkins.lab.local:8080/`), `labsim-lab` (`https://github.com/labsim-lab`), `Vision PoC` (`http://10.42.1.12:3000/`), `Rack B cam` (`http://10.42.10.40:8081/stream.mjpg`), `Ollama API` (`http://10.42.1.12:11434/api/tags`). |
| Address resolution | typed text without scheme gets `http://`; the host table maps hosts to apps: `orca.lab.local:8080`, `10.42.1.10:8080` → **orca**; `jenkins.lab.local:8080`, `10.42.1.11:8080` → **jenkins**; `github.com/labsim-lab…` → **github**; `10.42.1.12:3000` → **ollama**; `http://<cam host>:8081/stream.mjpg` → **camera** (opens/focuses the Lab Cameras window on that URL); anything else → **browser** (raw view, §12.3). A URL for another app opens/focuses that app's window with the route; the current window stays where it was. |
| History | per window (`history`, `historyIndex`), `Alt+←/→`, mouse buttons 4/5. `navigate(route, {replace:true})` replaces (used for query-param edits while typing a filter). |
| Loading bar | a 2 px blue `#1a73e8` progress line under the toolbar for 150–400 ms on each navigation (purely visual; pages render synchronously). |
| Error pages | §0.5. The page area shows the error instead of the app when `reach` ≠ `ok` (re-evaluated on reload and every 2 s while shown). |

### 1.5 Notifications

`wm.notify({ app, title, body?, route?, kind? })` shows a toast bottom-right (16 px above the taskbar): 364 px
wide, `#2b2b2bf5`, radius 8, app icon + app title 12 px grey, title 14 px semibold, body 13 px (2 lines max),
game-time stamp. Max 3 visible, 6 s each (paused while hovered), click → `openApp(app, { route })`, dismiss and emit
`desktop.notification.clicked { app, title, route }`.
The bell flyout lists the last 30 (`Clear all`). Sources (each app documents its own): Jenkins build finished
(only builds the player triggered, or any `FAILURE` while the Jenkins window is not focused), LabChat message
(not from the player, channel not currently open), GitHub review/merge on a PR the player authored or reviews,
IntelliJ run finished while IntelliJ is not focused, Orca health-check failures (`:red_circle:` posts mirrored from
`#orca-alerts` only if the Orca window is open), Card Reader swipe received. A notification sound
`engine.audio.play('ui-ticket', { bus: 'ui', volume: .5 })`.

### 1.6 Clipboard, file dialog, images

* **Clipboard.** `wm.clipboard.write(text, sourceApp)` stores text in the shell store **and** tries
  `navigator.clipboard.writeText` (ignore failures); it emits `desktop.clipboard.copied { text, sourceApp }`.
  `wm.clipboard.read()` returns the in-game clipboard (the system clipboard is only used when the in-game one is
  empty and `navigator.clipboard.readText` resolves within 100 ms). Every app's Copy/Paste goes through it so
  "copy the clone URL from GitHub → paste in IntelliJ" works without system permissions.
* **Files.** The workstation file system shown by every dialog is the union of: `lab.workstation.files`
  (Sim §1.10: `~/Downloads/walle_receipt_0912.jpg` → `img:receipt:wall-e:0912`, screencaps, snapshots), the
  computer's session file map (D6 fallback), read-only views of each cloned repo under
  `~/IdeaProjects/<repo>/` (`lab.repos[r].local.files`), and Code With Me mirrors under `~/CodeWithMe/<person>/`
  (Sim §1.15). Paths are shown with `~` = `/home/engineer`.
* **File dialog.** `wm.pickFile({ title, mode: 'open' | 'save', filter: 'images' | 'any', startDir, suggestedName })`
  → `Promise<string | null>` renders a modal inside the requesting window: GTK-like for GIMP (left "Places":
  `Home`, `Desktop`, `Downloads`, `Pictures`, `IdeaProjects`; centre table Name / Size / Modified; filter combo
  `All images` / `All files`; `Cancel` / `Open`), Windows-like elsewhere (same data). Double-click opens; typing
  filters; `Esc` cancels (consumed).
* **Images.** Pixels are never in lab state. `apps.ts` holds an image store: `putImage({ ref, dataUrl, width,
  height, kind })`, `peekImage(ref)` (sync), `getImage(ref)` (async; resolves from the store or through the
  registered materializer), `onImagesChanged(fn)`. The materializer (builder C: `startImageMaterializer()` in `apps/camera/`, which calls
  `registerImageMaterializer`; started by `initComputer`)
  turns refs into pixels:

  | Ref | Materialized as |
  |---|---|
  | `img:webcam:<cameraId>:<physMs>` | taken by the Camera app at snapshot time (already in the store); if missing (snapshot made by the sim, e.g. Jenkins evidence capture) render the camera's frame **now** (live capture if the feed exists, else the synthetic frame of §8.5) and store it |
  | `img:screencap:<deviceId>:<physMs>` | `render2d.drawDeviceDisplay(primary)` at the device's native px (`DeviceTypeInfo` resolution, e.g. FLEX_3 720 × 1280) — the materializer watches `lab.workstation.files` and renders new screencap refs **immediately** so the image shows the screen at capture time (the sim says "frozen labels") |
  | `img:receipt:<rig>:<id>` | receipt text from `lab.ollama.receiptScenarios[ref]` (or the device's `lastReceipt`) formatted per Sim §3.9.7, drawn with `render2d.drawReceipt` on thermal-paper white `#fbfaf5`, 384 px wide, then placed on a dark desk background 1024 × 1365 with 2° rotation and soft shadow (a phone photo of a receipt) |

### 1.7 Objective pin, hints and "Show me" [game]

* **Objective pin.** Top-right of the desktop (above windows, below toasts): 320 px card, `#111a` blur, amber
  left border, title `Objective` [game] and the current `session.objectives` (`!done` first, done ones struck
  through, max 3). Collapses to a 28 px pill on click. Hidden when there are no objectives.
* **Hints.** Elements that lessons point at carry `data-hint="<target>"` (catalogue `APP_HINT_TARGETS` in apps.ts;
  parametrised targets use `:` — `orca.robots.row:johnny-5`). `requestHint({ app, target, route? })` (apps.ts) opens
  the app (and route), then the shell draws a pulsing amber ring (2 px, 1 Hz) around the first matching element,
  scrolls it into view, and for **Show me** (Cur §2.0, 180 s) animates a ghost cursor (white arrow, 40 % opacity)
  from the screen centre to it over 900 ms and "clicks" (ring burst) — it never performs the click. `clearHint()`
  removes it; any real click on the target clears it.

### 1.8 Keyboard, `Esc` and Stand up

* The desktop root listens to `keydown` on `window` in the **bubble** phase. Apps that consume a key call
  `e.preventDefault()` (and `stopPropagation()` when they must keep the key from the shell).
* **`Esc`:** closes the innermost shell popup (start menu, flyout, switcher, file dialog, context menu); otherwise
  the focused app gets it first (menus, dialogs, find bars, nano, autocomplete popups consume it); if nothing
  consumed it, the desktop **stands up** (GP §6.3: "first `Esc` stands up, second pauses" — the second is ui's).
  Stand up: emit `desktop.standUp {}`, play `ui-click`, then `props.onExit?.()` or the fallback of §1.1.
* **Keyboard Lock.** When `document.fullscreenElement` is set and `navigator.keyboard?.lock` exists, the desktop
  calls `navigator.keyboard.lock(['Escape','Tab','KeyW','KeyT','KeyN','F4','KeyQ'])` on mount and `unlock()` on
  unmount — then `Ctrl+Tab`, `Alt+F4`, `Ctrl+W` etc. reach the apps. (In locked fullscreen the browser exits
  fullscreen only on a held `Esc`.)
* Global shortcuts: `Win` / `Ctrl+Esc` toggles Start; `Alt+\`` / `Ctrl+Tab` cycle; `Ctrl+Alt+arrows` snap;
  `Ctrl+Shift+Esc` [illus.] opens nothing (no task manager).
* Input isolation: while the desktop is mounted the 3D controls are disabled by ui (`engine.setControlsEnabled(false)`,
  pointer unlocked). Keys typed in apps never reach the game's hotkeys (`Tab`, `1`–`5`, `T`, `H`) because the
  desktop root stops propagation of keydown events originating inside windows to `document`-level game listeners
  (the engine's listeners check `ui.overlay` as well).

### 1.9 App catalogue

`APP_META` in apps.ts is authoritative; this table is its readable mirror.

| `AppId` | Title (taskbar) | Component (stub export) | Chrome | Default size | Min size | Instancing | Desktop / pinned |
|---|---|---|---|---|---|---|---|
| `orca` | Orchestrator | `OrcaApp` | browser | 1280 × 820 | 760 × 480 | single | icon · pinned |
| `jenkins` | Jenkins | `JenkinsApp` | browser | 1240 × 800 | 760 × 480 | single | icon · pinned |
| `github` | GitHub | `GitHubApp` | browser | 1240 × 820 | 760 × 480 | single | icon · pinned |
| `ollama` | Ollama WebUI | `OllamaApp` | browser | 1060 × 760 | 640 × 440 | single | icon |
| `browser` | Browser | `BrowserApp` | browser | 1100 × 740 | 520 × 360 | multi | icon · pinned |
| `intellij` | IntelliJ IDEA | `IntelliJApp` | native | 1440 × 880 | 900 × 560 | one per repo (`instanceKey = params.repo ?? 'welcome'`) | icon · pinned |
| `terminal` | Terminal | `TerminalApp` | native (own tab strip) | 940 × 580 | 480 × 280 | single (tabs inside) | icon · pinned |
| `gimp` | GNU Image Manipulation Program | `GimpApp` | native | 1320 × 840 | 900 × 560 | single (image tabs inside) | icon |
| `camera` | Lab Cameras | `CameraApp` | native | 1160 × 760 | 640 × 420 | single | icon |
| `dashboard` | LabSim Robot Dashboard | `DashboardApp` | native | 1180 × 760 | 760 × 520 | single | icon |
| `chat` | LabChat | `ChatApp` | native | 1040 × 700 | 600 × 420 | single | icon · pinned |
| `cardreader` | MagStripe Reader | `CardReaderApp` | native | 600 × 460 | 480 × 380 | single | icon |
| `files` | File Explorer | `FilesApp` | native | 940 × 600 | 520 × 360 | multi | icon (as `This PC`) · pinned |

### 1.10 Mission bridge (apps.ts)

| Function / event | Purpose |
|---|---|
| `requestOpenApp(app, params?)` | Queue an open request and emit `computer.openAppRequested`. The desktop drains the queue on mount and handles live requests. Missions call it for `computer-task` steps ("The named app opens focused", Cur §2.0) after setting `ui.overlay = {kind:'computer'}` (or when the player sits). |
| `requestHint({app, target, route?, showMe?})` / `clearHint()` | §1.7; emits `computer.hintRequested` / `computer.hintCleared`. |
| `setChatReplyProvider(fn)` | §11.4 — missions supply quick replies for tickets/DMs. |
| `computer.windowsChanged` `{ windows: {id, app, title, minimized, focused}[] }` (core event) | emitted by the shell with `emit()` (throttled 2 Hz, on every open/close/focus/minimise/title change) for the world's monitor mirror (World §3.6). |
| `workstation.cardSwiped` `{ card: 'test-card-visa' \| 'test-card-interac' }` (core event) | emitted by the world at `desk.player.card-reader` (World §9.2); consumed by the Card Reader (§12.1). |
| `onAppAction(name, fn)`, `onAppNavigated(app, template, fn)`, `matchRoute`, `buildRoute` | typed subscriptions and route helpers for missions (§0.3). |

### 1.11 Lesson gating (`session.computer`, written by missions)

`session.computer` (`ComputerGating`, `src/core/sessionState.ts`) narrows the desktop during Academy steps
(Cur M06 setup: "Orca app unlocked with the Robots page … Jenkins showing only job `Java/uia-remote-regression-flex`").
Gating focuses the trainee; it is not security, and it never changes lab state.

| Field | Effect |
|---|---|
| `unlockedApps: 'all' \| AppId[]` | Locked apps keep their desktop icon/start entry but greyed with a small padlock [game] and tooltip `Unlocks later in the Academy`; opening one shows a toast with the same text. Running windows of an app that becomes locked stay open. `requestOpenApp` for a locked app is ignored (console warning). Taskbar pins of locked apps are hidden. |
| `restrictions.jenkins.visibleJobs: string[]` | Only these job ids appear in views, folders, search and widgets; any other job route renders Jenkins' `404 Not Found` page. |
| `restrictions.orca.pages: string[]` | `APP_ROUTES.orca` keys that may be opened (`['home','robots','robotView','robotEdit']`); other Entities/Administration menu items render disabled with a padlock [game]; their routes redirect to `/` with `alert-info` `This page unlocks later in the Academy.` [game] |
| `restrictions.orca.layoutV2Toggle: boolean` | shows the Screen Compare tutorial toggle (§2.11) |
| `restrictions.github.repos` / `restrictions.intellij.repos: string[]` | repos listed/openable (others hidden from lists; direct routes show GitHub's 404 page / IntelliJ refuses `Get from VCS` with `Repository not found`) |
| `restrictions.<app>.readOnly: true` | forms and editors of that app are read-only (inputs disabled, save buttons hidden) |
| `forceHealthCheckButton: boolean` | Orca's tutorial button (§2.1) |
| `tabCompletion: boolean` | Terminal completion (§5.2) |

Unknown restriction keys are ignored. Apps read gating with `useGameShallow(s => s.session.computer)`.

---

## 2. Orca — Orchestrator (`http://orca.lab.local:8080`)

Orca is a JHipster-generated Spring Boot + Angular monolith (Ref §1, §3; Cur M06). The UI MUST read as a
**JHipster 7 Angular app with Bootstrap 5** that Tate customised in a few places (robot filters, Notes, health log,
match preview, test buttons). A trainee who later opens the real Orca should see the same navbar, the same
"Create a new Robot" button, the same `View / Edit / Delete` row buttons and the same green alert
`A Robot is updated with identifier 17`.

### 2.1 Look and feel

| Token | Value |
|---|---|
| Fonts | Bootstrap native stack (`system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif`), base 14 px (window-scaled from 16), headings `h2` 1.6 rem 500 |
| Colours | body `#212529` on `#ffffff`; primary `#0d6efd`; success `#198754`; info `#0dcaf0` (black text); warning `#ffc107`; danger `#dc3545`; secondary `#6c757d`; light `#f8f9fa`; borders `#dee2e6` |
| Navbar | height 56 px, background `#353d47`, brand: whale glyph 32 px (white body, `#5ab7ee` belly) + `Orchestrator` 20 px white + version `v3.14.2` 10 px `#bbbbbb` under it (JHipster `.navbar-version`). Right-aligned items with 14 px icons: `Home`, `Entities ▾`, `Administration ▾` (admins only), `Account ▾`. Link colour `rgba(255,255,255,.55)`, hover/active white. Ribbon top-left corner "DEV"? **no** — Orca runs the `prod` profile (no ribbon). |
| Tutorial button [game] | when `session.computer.forceHealthCheckButton` (missions' gating, §1.11) **and** `lab.config.forceHealthCheckAllowed` (Sim §1.1): amber outline button `⟳ Force health check` in the navbar left of `Home`, with the sub-label `next run 09:40:00` 10 px; click → D20 `sim.orca.forceHealthCheck()`, emit `orca.healthCheck.forced`. |
| Page | `.container-fluid` padding 16 px, page heading `h2#page-heading` with right-aligned buttons; entity cards `jh-card` (white, 1 px border `#dee2e6`, padding 16 px). Footer 32 px `#f8f9fa`: `Orchestrator · LabSim automation lab · orca.lab.local (10.42.1.10)`. |
| Tables | `.table .table-striped` (stripe `rgba(0,0,0,.05)`), header row bottom border 2 px; sortable headers show a sort glyph (`⇅` grey, `▲`/`▼` black for the active column); row action buttons `btn-sm`: `👁 View` (`btn-info`), `✎ Edit` (`btn-primary`), `✕ Delete` (`btn-danger`), right-aligned in a `btn-group`. |
| Forms | `form-label` above `form-control` (height 31 px, radius 4 px); invalid fields get red border + messages in `small.form-text.text-danger`; buttons at the bottom: `⊘ Cancel` (`btn-secondary`) and `💾 Save` (`btn-primary`, disabled while the form is invalid or saving). |
| Alerts | JHipster alert area at the top of the page content: `alert alert-success` / `alert-danger` / `alert-warning` with close `×`, auto-dismiss 5 s (success) / sticky (errors). |
| Status chips | `badge rounded-pill`, colours (World §5.3): Available `#2e9e4f`, Unavailable `#8b5cf6`, Offline `#6b7280`, Connection Failed `#dc2626`, Reserved `#2563eb`; text white, title-cased labels exactly `Available`, `Unavailable`, `Offline`, `Connection Failed`, `Reserved` (Sim §3.2). |
| Entity details | `dl.row-md.jh-entity-details`: two-column grid, `dt` bold, each row bottom border `#eeeeee`, padding 8 px 0. |
| Icons | inline SVGs shaped like the Font Awesome glyphs JHipster uses (home, th-list, users-cog, user, eye, pencil-alt, times, save, ban, arrow-left, sync, plus, sort, sort-up, sort-down, asterisk). |

### 2.2 Navigation, login and global behaviour

**Entities ▾** (in this order): `Robot`, `Device`, `Robot Capability`, `Merchant Config`, `Screen`,
`Screen Location`, `Card Profile`, `Screen Compare Image` (the 7 core schemas of Ref §3, Screens and Screen
Locations listed separately as JHipster does). **Administration ▾**: `User management`, `Metrics`, `Health`,
`Configuration`, `Health-check log` [illus., Tate], `Audits`, `Logs`, `API`. **Account ▾**: `Settings`, `Password`,
`Sign out` (when signed out: `Sign in`, `Register` disabled).

* **Login.** The workstation's browser "remembers" the session: Orca opens signed in as `admin`. After **Sign out**
  the home page shows the JHipster text `If you want to sign in, you can try the default accounts:` /
  `- Administrator (login="admin" and password="admin")` / `- User (login="user" and password="user").` and the
  `/login` page (`Sign in` heading, `Username`, `Password`, `Remember me`, `Sign in` button,
  `Did you forget your password?` link). Wrong credentials: `alert-danger`
  `Failed to sign in! Please check your credentials and try again.`. `user` sees no **Administration** menu but can
  edit entities (JHipster default `ROLE_USER`). Accounts: `admin`/`admin`, `user`/`user`, plus `tate`, `jared` (no
  password known — sign-in fails). All sim calls use actor `'player'` regardless of the login. Emit
  `orca.session.signedIn { login }` / `orca.session.signedOut { login }`.
* **Route guard.** Every entity/admin route redirects to `/login` when signed out; after sign-in it returns to the
  requested route.
* **Unreachable / DB down** — see §2.13.
* **Live data.** Pages re-render from the store; lists do **not** jump while the user reads: sort/filter/page are
  stable and rows update in place (a status chip flips colour with a 600 ms highlight `#fff3cd`).
* **Tables show at most 20 rows per page** (JHipster `ITEMS_PER_PAGE = 20`); item count line
  `Showing 1 - 20 of 42 items.`; pagination `«  ‹  1  2  3  ›  »` (`ngb-pagination` style, active page blue).
  Sorting: click a header → `sort=<field>,asc`, again → `desc`. Default sort `id,asc`.

### 2.3 Home (`/`)

| Region | Content |
|---|---|
| Left (col-md-3) | whale illustration (SVG, 220 px) |
| Right heading | `h1` `Welcome to Orchestrator!` · lead `Controller for Jenkins pipelines and the lab robots.` · `You are logged in as user "admin".` (JHipster) |
| Status cards | five cards in a row, one per status: big count + chip, click → `/robot?status.in=<STATUS>`. Counts from `lab.orca.robots`. |
| Health check | `Health check: every 5 minutes · last run 09:35:00 (#7) · next 09:40:00` from `orca.healthCheck` (`lastRunMs`, `runCount`, `nextRunMs`); link `View health-check log`. |
| Active checkouts | table `Robot · Build · Since`: every robot with `checkout != null` → `wall-e · Java/uia-remote-regression-flex #4127 · 09:41:07` (link to Jenkins build route via `wm.openApp('jenkins', …)`); `manual` checkouts show `manual (admin)`. Empty: `No robots are checked out.` |
| Recent alerts | last 8 unresolved HEALTH notes across robots: timestamp, robot name link, note text in monospace 12 px. |

### 2.4 Robots (`/robot`) — Tate's filter UI

Heading `Robots` with buttons `⟳ Refresh list` (`btn-info`) and `+ Create a new Robot` (`btn-primary`,
`.jh-create-entity`).

**Filter bar** [Tate's custom UI, Ref §3 "custom UI filtering created by Tate"] — a `jh-card` above the table:

| Control | Behaviour | URL query |
|---|---|---|
| Status | 5 toggle buttons (multi-select) `Available (33)` `Unavailable (3)` `Offline (2)` `Connection Failed (1)` `Reserved (1)` in chip colours (outline when off) | `status.in=AVAILABLE,RESERVED` |
| Device type | select `All device types` + the 14 enum values | `deviceType.equals=FLEX_3` |
| Rig kind | select `All rig kinds`, `Touch`, `Tethered`, `ADB`, `Standalone` | `rigKind.equals=touch` |
| Environment | select `All environments`, `DEV1`, `DEV2`, `STG`, `QA`, `INT` | `environment.equals=DEV1` |
| Name | search input `Search name or human readable name…` (contains, case-insensitive, 250 ms debounce, `replace` navigation while typing) | `name.contains=wal` |
| Clear | link `Clear filters` (visible when any filter is set) | — |

Device type of a robot = its Robot Device row's `deviceType` (the MFD's for tethered rigs whose Robot Device is
the MFD). On every committed filter change (toggle, select, debounced text) emit `orca.robots.filtered` with the
active filters and the resulting count; the route updates (`page=1`).

**Columns:** `ID` · `Name` · `Human Readable Name` · `Status` · `Device Type` · `Rig Kind` · `Environment` ·
`Location` · `Last Health Check` · actions. Status cell: chip + (when `checkout`) a second line in 12 px grey
`in use by Jenkins #4127` (link) — the combined text reads `Available · in use by Jenkins #4127` for screen
readers and copy (Cur M11 s7). Last Health Check: `09:35:00 · 200 OK` (green) / `09:35:00 · FAIL` (red, tooltip =
`lastHealth.error`) / `—` (never or Offline) / `Reserved — not overridden` (grey). Row actions: `View`, `Edit`,
`Delete`, plus a split-button `Status ▾` [Tate] listing the four settable statuses (current one checked):
choosing one runs the same flow as the form (§2.5 status rules) and shows the success alert
`A Robot is updated with identifier 6`.

### 2.5 Robot detail (`/robot/:id/view`) and form (`/robot/new`, `/robot/:id/edit`)

**Detail view** (`h2` `Robot` + `hr`; emit `orca.robot.viewed` on open): `dl` rows in the order of the form below,
then **Notes**, then buttons
`← Back` (`btn-info`), `✎ Edit` (`btn-primary`), `⇄ Check out` (`btn-outline-secondary`) [illus.] and, when the
robot has a manual checkout, `Release`.

**Form** (`h2#jhi-robot-heading` `Create or edit a Robot`; emit `orca.robot.editOpened` on open, `robotId`/`name`
null for `/robot/new`), grouped in cards with `h5` titles. Field labels are
exact; `(?)` marks a help tooltip.

| Group | Field (label) | Control | Validation (client; messages exact) | Sim field |
|---|---|---|---|---|
| — | `ID` | read-only text (edit only) | — | `id` |
| Identity | `Name` (?) `System identifier used by pipelines (ROBOT_NAME). Lowercase, unique.` | text | required → `This field is required.`; pattern `^[a-z0-9]+(-[a-z0-9]+)*$` → `This field should follow pattern for "Name".`; max 50 → `This field cannot be longer than 50 characters.` | `name` |
| | `Human Readable Name` (?) `Shown on the robot's status tablet.` | text | required; max 32 | `humanReadableName` |
| | `Status` | select of the 5 statuses (labels title-cased); `Connection Failed` is shown **disabled** (`set by the health check only`) unless it is the current value | required | `status` |
| | `Reserved By` | read-only text, filled with the actor when Status = Reserved (`player`), cleared otherwise | — | `reservedBy` |
| | `Rig Kind` | select `touch`, `tethered`, `adb`, `standalone` | required | `rigKind` |
| | `Environment` | select `DEV1` `DEV2` `STG` `QA` `INT` | required | `environment` |
| | `Location` | text | max 64 | `location` |
| | `Description` | textarea 2 rows | max 255 | `description` |
| Robot Device | `Robot Device` (?) `The physical terminal on this rig. Upgrades get a new Device so the old one stays for rollback.` | select of non-retired Device rows: `johnny-5-flex1 · FLEX_1 · SIM-F1-000015 · 10.42.30.15` | required | `deviceId` |
| | `Device Type` | read-only badge from the selected device (`FLEX_1`) + `Testing profile FLEX_GEN1` small grey | — | derived |
| URL Mappings | `Robot ADB Service URL` | text, monospace | required; pattern `^https?://\S+$` → `This field should follow pattern for "Robot ADB Service URL".` | `adbServiceUrl` |
| | `Camera Stream URL` | text + `▶ Open stream` link (opens Lab Cameras on that URL) | optional; same pattern | `cameraStreamUrl` |
| | `Dip URL` / `Tap URL` / `Swipe URL` | text | optional; same pattern | `dipUrl` / `tapUrl` / `swipeUrl` |
| USB Tethered Device Configuration | `MFD (Merchant Facing Device)` | select `(none)` + device rows | CFD set but MFD empty → `MFD is required when CFD is set.` [illus.] | `mfdDeviceId` |
| | `CFD (Customer Facing Device)` | select `(none)` + device rows | — | `cfdDeviceId` |
| | banner | when MFD is populated: `alert-info` `Tethered: MFD populated` (exact, Cur M07) + small `Pipelines inject RUN_TYPE=tethered.`; when empty: grey text `Standalone (MFD empty)` | — | — |
| Offsets (legacy) | `Offset X (mm)` / `Offset Y (mm)` | number step 0.1, shown with one decimal; label suffix badge `Legacy`; help `Deprecated — compensated for imprecise limit switches before the lab was calibrated to a true (0,0). Leave at 0.0.` | number → `This field should be a number.`; −50…50 → `This field cannot be more than 50.` / `This field should be at least -50.` | `offsetXMm` / `offsetYMm` |
| | non-zero warning | when either offset ≠ 0: `alert-warning` `Non-zero legacy offset — taps will be shifted by (+0.0, +1.5) mm.` | — | — |
| Capabilities | `Capabilities` | checkbox list of capability rows (`DIP`, `TAP`, … with their `key`) | — | `capabilityIds` |
| Merchant | `Merchant Config` | select of merchant rows by `name` | required | `merchantConfigId` |

**Save flow.** `💾 Save` → for edits: `sim.orca.saveRobot({id, …changedFields}, 'player')` then, if Status
changed, `sim.orca.setRobotStatus(id, status, 'player')`. Status rules (Sim §3.2.1): moving **away from**
`Connection Failed` first shows the modal `Confirm status change` / `This robot failed its last health check
(<lastHealth.error>). Override anyway?` / buttons `Cancel`, `Override` (`btn-danger`); emit
`orca.robot.statusChangeRequested` with `confirmed`. Success → navigate to `/robot` (JHipster returns to the list)
with `A Robot is updated with identifier <id>` (create: `A new Robot is created with identifier <id>`) and emit
`orca.robot.saved` (`changed` = CONFIG field names of Sim §3.3.4: `name`, `humanReadableName`, `deviceId`,
`mfdDeviceId`, `cfdDeviceId`, `urls.adb`, `urls.camera`, `urls.dip`, `urls.tap`, `urls.swipe`, `offsets.x`,
`offsets.y`, `merchant`, `capabilities`, plus `status`, `environment`, `rigKind`, `location`, `description`).
Failure (`Result.error`, e.g. `400 Bad Request: ADB-only robots require a PIN-bypass merchant`) → `alert-danger`
showing the sim's text verbatim; stay on the form; emit `orca.robot.saveFailed`. Editing **Name** shows an inline `alert-warning` under the field while it differs from the
saved value: `Pipelines and named jobs use the Name. Change it only if the robot is really renamed.` [illus.]
(GW22 is GP's penalty; Tate's bark fires from missions.)

**Notes** (detail view and below the form on edit; Ref §3 "opens a Notes section … logging the exact endpoint
attempted and error text"). `h4 Notes` + count badge; newest first; each row: kind badge (`HEALTH` red, `STATUS`
grey, `CONFIG` blue, `MANUAL` dark) + the note's `text` in monospace 12.5 px exactly as stored (Sim §3.3.4 formats,
including ` (×3, last 08:25:00)` suffixes), resolved notes dimmed with a `Resolved` tag; per-row `✓ Resolve`
(`sim.orca.resolveNote`, emit `orca.robot.noteResolved`). `Add note` textarea + button (D1, emit
`orca.robot.noteAdded`). When the section first scrolls into view (or the
detail page opens with it visible) emit `orca.robot.notesViewed` once per page visit.

**Check out** [illus.] (Cur M06 s9): manual checkout through Orca's UI. Blocked statuses show `alert-danger`
exactly `Robot is blocked from checkouts (Connection Failed)` / `(Reserved)` / `(Offline)`; Unavailable shows
`alert-warning` `Robot is Unavailable — pass its exact Name in the job to use it`; Available → `sim.orca.checkout({
buildId: 'manual-<seq>', jobId: 'manual', robotName: name, environment: robot.environment, kind: 'manual' })`
(D3) → `alert-success` `Checked out robot <name> (manual). Release it when you are done.`. Emit
`orca.robot.checkoutAttempted` with `ok` and the shown message. **Release** → `sim.orca.release(robotId,
buildId)` → `alert-success` `Released robot <name>.`; emit `orca.robot.released`.

### 2.6 Device (`/device`, `/device/new`, `/device/:id/view|edit`)

Columns `ID` · `Name` · `Device Type` · `Serial` · `IP` · `Label` · `Retired` · `Used by` (robot names linking
to them; `—`). Filter checkbox `Show retired` [illus.] (off by default; the retired row `retired-flex1-legacy`
appears when on). Form fields: `Name` (required, pattern as robot name, unique — sim error shown), `Device Type`
(select of the 14 enum values, required), `Serial` (required, pattern `^[A-Z0-9-]+$`), `IP` (required, IPv4 →
`This field should follow pattern for "IP".`), `Label` (text), `Retired` (checkbox). A grey info line under
Device Type shows the enum metrics (`Flex · FLEX_GEN2 · portrait 68.0 × 121.0 mm · 720 × 1280 px · printer`).
Create → `sim.orca.saveDevice` → `A new Device is created with identifier 43`, emit `orca.device.created`.
Editing a device that is linked to a robot shows `alert-info` `This device is linked to johnny-5. For a hardware
swap, create a new Device and relink the robot instead.` [illus.] (GW10's lesson). Saving an edit emits
`orca.device.saved`. Delete of a linked device: the sim's error is shown verbatim.

**Deletes (every entity):** the JHipster modal `Confirm delete operation` / `Are you sure you want to delete Robot
17?` (entity name + id) with `⊘ Cancel` and `✕ Delete` (`btn-danger`) → `sim.orca.deleteEntity(entity, id,
'player')` → `alert-success` `A Robot is deleted with identifier 17` (or the sim error); emit
`orca.entity.deleted { entity, id, ok, error }`.

### 2.7 Robot Capability (`/robot-capability`) and Match preview

Three tabs [illus.] in one page:

1. **Capabilities** (default) — JHipster list of `capabilities` rows: `ID` · `Name` · `Key` · `Lookup`
   (`DYNAMIC_JSON` / `NON_DYNAMIC` / `BOTH` badges) · `Description` · `JSON` (monospace). CRUD as usual
   (`sim.orca.saveCapability`, emit `orca.capability.saved`).
2. **Robot documents** (`?tab=documents&robot=wall-e`) — robot select (name + HRN) → the robot's capability
   document (Sim §1.3.4, §2.7.1) rendered **compact, in canonical key order**, exactly as Cur M08 shows it
   (`{"deviceType":"FLEX_3","printer":true,"physicalTouch":true,…}`) in a monospace box with `Copy`; below, a
   two-column legend `Derived from the robot's device and rig` (deviceType, printer, physicalTouch, pinEntry,
   tethered, duo, adbOnly, testingProfile) vs `Linked capability rows`. Source: `GET /api/robots/{name}/capabilities`
   via `sim.orca.rest`. On each robot selection emit `orca.capabilities.viewed`.
3. **Match preview** (`/robot-capability/match-preview`) — Tate's tool (Cur §7, Sim §3.4.3): textarea
   `Capabilities JSON` (monospace, placeholder `{"goSdk": true, "printer": true}`), select `Environment` (default
   `DEV1`), button `Preview match` → `sim.orca.matchPreview` (D2) → table `Robot` · `Status` · `Match` (`✓` green /
   `✗` red) · `First failing key` (`printer: required true, robot false`); matching rows first, ordered as the
   checkout would try them (LRU). Invalid JSON → `alert-danger` `Invalid JSON: Unexpected token } in JSON at
   position 17` (browser `JSON.parse` message). Emit `orca.matchPreview.ran` with the matching robot names.
   A `Load from Gort file…` [illus.] dropdown lists `go-sdk/tests/*.json` and `suites/**/*.json` from
   `lab.repos.gort.files` and fills the textarea with that file's `capabilities` object (this is how Cur M08 s5's
   "Match preview no longer lists …" is checked after the IntelliJ edit is pushed — the rig that drops out is
   `vision`, the GO_SDK Flex Pocket; Sim A.2 records the deviation from Cur's "rosie").

### 2.8 Merchant Config (`/merchant-config`)

The list table **deliberately truncates** (Ref §3 "Due to UI table display limits, you must click Edit on a row to
view all fields"; Sim §1.3.5): columns `ID` · `Name` · `Region` · `PIN Bypass` (`✓`/`—`) · `Country` · `Owner` and a
final header cell `…` whose cells show `…`; the table has `table-layout: fixed` and the **App ID / App Secret /
API Key / Ubi Route** columns do not exist in the list. Row buttons `View`, `Edit`, `Delete`. The View page also
hides the credentials (Tate's view shows `App credentials: 3 fields — open Edit to see them`) [illus.] so the only
way to see them is **Edit** (`/merchant-config/:id/edit`; emit `orca.merchant.editOpened` on open).

Edit form (all Sim §1.3.5 fields, grouped): **Merchant** `Name`, `Display Name`, `Address`, `Merchant ID (MID)`,
`Environment` (`dev1` `dev2` `stg` `qa` `int`), `Region` (`US-EAST`, `CA-CENTRAL`), `Country` (`US`, `CA`),
`Currency` (`USD`, `CAD`), `Owner` (`Automation`, `PayCore`, `SDK`, `Westers`) · **Payments** `Tax Rate (%)`
(number, two decimals, shown from `taxRateBp/100`), `Tips Enabled`, `Tip Percents` (comma list), `PIN Bypass`,
`Cash Discount Enabled`, `Card Adjust (%)`, `QR Receipts Enabled`, `Signature Threshold ($)`, `Accepted Brands`
(checkboxes VISA, MASTERCARD, AMEX, DISCOVER, INTERAC), `Extra Apps` (comma list) · **Go SDK credentials**
(Tate, Ref §3) `App ID` (text), `App Secret` (password field showing `••••••` with an eye toggle `Show`),
`API Key` (text) — help text `Exported to pipelines as APP_ID, APP_SECRET, API_KEY for the Go SDK.` ·
**Routing** `Ubi Route` (select `(none)`, `us-east`, `ca-central`) · `Notes` textarea. Save →
`sim.orca.saveMerchant` → `A Merchant Config is updated with identifier 3`; emit `orca.merchant.saved` (`changed`
field names). Toggling `Show` on the secret emits `orca.merchant.secretRevealed`.

### 2.9 Screen (`/screen`) and Screen Location (`/screen-location`)

**Screens list:** filter bar `Device type` select (required-ish: defaults to `All`), `Name` contains, `Display`
(`All`, `primary`, `secondary`) → query `deviceType.equals=FLEX_3&name.contains=RECEIPT`. Columns `ID` · `Name` ·
`Device Type` · `Testing Profile` · `Display` · `Options` (`4`, `5 · QR` badge, `—`) · `Description` · `Locations`
(count). Emit `orca.screens.filtered` on committed filter changes.

**Screen detail** (`/screen/:id/view`, Cur M09 s2 "Open Screens → FLEX_3 → TENDER_CASH_DISCOUNT … then its Screen
Locations"): `dl` (Name, Device Type, Testing Profile, Display, Options, Description), then **Screen Locations**
table `Button` · `X (mm)` · `Y (mm)` · `Last modified` (from `orca.audit`: `bulk-import · yesterday 16:02`,
`jared · 2026-10-02 11:20`, `—`) · actions `Edit`, `Delete`, `◎ Test tap` [illus.]; button `+ Add location`
(inline row: Button text, X, Y, Save). Right of the table: a to-scale outline of the Device Type's screen (mm
metrics from `DeviceTypeInfo`, 1 px = 0.5 mm min, axis ticks every 10 mm, `(0,0)` marked top-left) with a dot +
label per location — Orca knows **points only, never button sizes** (Sim §1.3.6), so no rectangles are drawn.
Emit `orca.screen.viewed` on open and `orca.screenLocations.viewed` (count) when the locations table is rendered.

**Test tap** [illus.] (Cur §7, M07 s11, INC21/22): a popover with `Robot` select (robots whose Robot Device type
— or MFD/CFD type — equals the screen's Device Type; default the first Available) and `Tap` →
`sim.orca.xyTouch(robot, screen.name, button, 'player')` → shows Orca's raw response in a monospace alert, exactly
the REST body: `200 {"result":"OK","mode":"PHYSICAL_TAP","x_mm":22.0,"y_mm":58.5}` or the error text
(`409 Conflict: LOCK_RELEASED (park required)`). Orca never says whether the button was hit (Sim §3.5.2 — "the
response never says whether a button was hit"); the hint under the popover reads `Watch the robot or its camera
to confirm the hit.`. Emit `orca.screenLocation.testTap`.

**Screen form:** `Name` (required, pattern `^[A-Z0-9_]+$` → `This field should follow pattern for "Name".`),
`Device Type` (select, required), `Display` (`primary` / `secondary`), `Option Count` (`(none)`, `4`, `5`),
`Description`. Uniqueness `(deviceType, name)` errors come from the sim. Create → `A new Screen is created with
identifier 211` → lands on the new screen's detail so locations can be added. Emit `orca.screen.saved`.

**Screen Location list** (`/screen-location`): filters `Device type`, `Screen` (select filtered by device type),
`Button` contains; columns `ID` · `Screen` · `Device Type` · `Button` · `X (mm)` · `Y (mm)` · `Last modified` ·
actions. Form: `Screen` (select `RECEIPT_OPTIONS_5 · FLEX_4`), `Button` (exact string, case-sensitive help
`Exact text passed to xy_touch, e.g. "No Receipt"`), `X (mm)`, `Y (mm)` (number step 0.1, 0…400). Save →
`sim.orca.saveScreenLocation` → `A Screen Location is updated with identifier 1093`; emit
`orca.screenLocation.saved`. A banner on both pages [illus.]: `Screen Locations are synced from gort
config/screen-locations/<DEVICE_TYPE>/<SCREEN>.json on merge. Direct edits here are not written back to Gort.`
(Sim §3.22.3).

### 2.10 Card Profile (`/card-profile`)

Columns `ID` · `Name` · `Brand` · `Entry` (`Swipe` / `Dip` / `Tap` badges) · `Track Data / Path` — SWIPE rows show
the Track Data (monospace, truncated with `…` at 48 chars, full value in a tooltip), DIP/TAP rows show the Gort
path (`cards/emv/visa_std_dip.json`) · `PAN` (`•••• 1111`) · `Country` · `Owner`. Detail view: `Type` (= entry)
then **either** `Track Data` (full, monospace, wraps) **or** `Path` (Sim §2.9: "the other field hidden"), `PIN`
(`••••` with Show), `Expiry` (`12/30` from `3012`), etc. Clicking the Track Data or Path value selects it and emits
`orca.cardProfile.fieldClicked` (Cur M10 s7 "Path field clicked"); opening a detail emits
`orca.cardProfile.viewed`. Form: `Name`, `Brand`, `Entry`; Entry = SWIPE shows `Track Data` (textarea, monospace,
required → `This field is required.`) and hides `Path`; DIP/TAP show `Path` (`cards/emv/…json`) and hide Track
Data; `PAN`, `Expiry (YYMM)`, `PIN`, `Requires PIN`, `Country`, `Owner`. Server validation text (Sim §2.9) shown
verbatim. Save → `A Card Profile is updated with identifier 2`; emit `orca.cardProfile.saved`.

### 2.11 Screen Compare Image (`/screen-compare-image`)

Every page of this entity starts with a **deprecation banner** (`alert-warning`, bold first line): `Deprecated` ·
`Screen Compare Images (webcam crop → Tesseract OCR) are being phased out. UI Automator 2.3 locates elements on
both Station Duo displays natively — migrate checks with displayId locators instead.` (Ref §3).

List columns `ID` · `Name` · `Robot` · `Screen` · `X` · `Y` · `W` · `H` (px) · `Expected Text` (monospace, shows
leading/trailing spaces as `·`) · `Deprecated` (`✓`) · `Used By` (`uia-remote:DuoCfdSuite`). Form: `Name`
(required, `^[A-Z0-9_]+$`), `Robot` (select), `Screen` (text, e.g. `CFD_CART`), `X`, `Y`, `W`, `H` (integers ≥ 0,
px of the 1280 × 720 webcam frame), `Expected Text` (text; help `Exact, case-sensitive match.`), `Deprecated`
(checkbox). Save → `sim.orca.saveScreenCompareImage`; emit `orca.screenCompare.saved` (with `created`).

**Test panel** (detail view, Cur M16 s7–s8): button `▶ Test` → `sim.ocr.compare(id)` → shows (1) the robot's
current webcam frame (from Orca's `cameraStreamUrl` — §8.4 capture, scaled to 640 px) with the bbox drawn in
magenta, (2) the crop enlarged ×2, (3) result lines in monospace: the Pi log line exactly
`[ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAL $10.83" → match=true` (Sim §3.12.1) and a large
`match=true` (green) / `match=false` (red). Capture failures show the sim's error line
(`[ocr] capture webcam → GET http://10.42.10.40:8081/stream.mjpg → Connection refused`). Emit
`orca.screenCompare.tested`. Tutorial toggle [game] (Academy/Free Play only, i.e. `lab.config.mode` ∈ `academy`, `freeplay`, or when
`session.computer.restrictions.orca.layoutV2Toggle === true`): switch `CFD layout v2 (tutorial)` bound to
`lab.flags.cfdLayoutV2Toggle` →
`sim.setFlag('cfdLayoutV2Toggle', v)`; emit `orca.screenCompare.layoutV2Toggled`.

### 2.12 Administration

| Page | Route | Content |
|---|---|---|
| User management | `/admin/user-management` | JHipster table `ID` · `Login` · `Email` · `Activated` · `Langkey` · `Profiles` (`ROLE_ADMIN`, `ROLE_USER`) · `Created date` · `Modified by`; rows `admin`, `user`, `tate`, `jared`, `morgan`, `david`, `jenkins-ci` [illus.]. Buttons render but edits answer `alert-danger` `You are not allowed to modify users on this instance (LDAP-managed).` [illus.] |
| Metrics | `/admin/metrics` | JHipster metrics page: `JVM Metrics` (Memory heap/non-heap bars, threads), `HTTP requests` table (counts per status from `orca.rest`-style counters kept by the app session [illus.]), `Cache statistics` (empty), `Datasource statistics` (`Connection pool: HikariPool-1 · active 2 · idle 8 · max 10`; when DB down `0 active · pending 10`). Static plausible numbers; refresh button. |
| Health | `/admin/health` | JHipster health table `Service name` · `Status` · `Details`: `db` (`UP` / `DOWN`), `diskSpace` (`UP`, `free 59 GB`), `ping` (`UP`), `healthCheckThread` [illus.] (`UP · last run #7 09:35:00`), from `GET /management/health` (`sim.orca.rest`). |
| Configuration | `/admin/configuration` | Spring beans/properties table (static, filterable): `spring.datasource.url = jdbc:mysql://localhost:3306/orca`, `orca.health-check.interval = 300000`, `orca.health-check.timeout-ms = 10000`, `jhipster.clientApp.name = orchestratorApp`, … |
| Health-check log | `/admin/health-check-log` | [Tate, Sim §3.3.4] newest run first, one card per run: header line exactly as stored (`2026-10-05 08:15:00  health-check run #4 — 41 pinged, 1 skipped, 1 failed, 0 recovered`) then the run's lines in monospace 12.5 px, colouring by suffix: `FAIL …` red, `(recovered)` green, `SKIPPED (Offline)` grey, `RESERVED — not overridden` blue, `200 OK` default. Filter input `Robot name` (filters lines), `Force health check` [game] button when allowed. Emit `orca.healthLog.viewed` on open (with the newest run number). |
| Audits | `/admin/audits` | table `Date` · `User` · `State/Action` · `Entity` · `ID` · `Changes` from `lab.orca.audit` (newest first, date range pickers `From`/`To` defaulting to today, JHipster style); `Changes` renders `diff` as `field: old → new` lines. |
| Logs | `/admin/logs` | JHipster "Logs" page: `There are 412 loggers.` + filter + table `Name` · `Level` (buttons `TRACE DEBUG INFO WARN ERROR OFF`, current one coloured) for `com.labsim.orca`, `com.labsim.orca.health`, `org.hibernate.SQL`, … (level changes are UI-only); below, **Recent log** [illus.]: the last 100 `lab.log` entries with `source` starting `orca` in Logback format `2026-10-05 08:15:00.012  WARN 1 --- [health-check-1] c.c.orca.health.HealthCheckService : wall-e FAIL connect timed out after 10000 ms`. |
| API | `/admin/docs` | Swagger UI (OpenAPI 3) — §2.12.1 |

#### 2.12.1 API docs (Swagger UI)

Header `Orchestrator API` + badges `3.14.2` `OAS 3.0`, link `/v3/api-docs`, `Servers` select
`http://orca.lab.local:8080`. Operations grouped by tag, each a collapsible bar coloured by method (GET `#61affe`,
POST `#49cc90`, PUT `#fca130`, DELETE `#f93e3e`, light tinted backgrounds), monospace path, summary:

| Tag | Operations (Sim §3.23) |
|---|---|
| `robot-resource` | `GET /api/robots`, `POST /api/robots`, `GET /api/robots/{id}`, `PUT /api/robots/{id}`, `DELETE /api/robots/{id}` |
| `robot-status-resource` | `PUT /api/robots/{id}/status` |
| `robot-capability-resource` | `GET /api/robots/{name}/capabilities`, CRUD `/api/robot-capabilities` |
| `checkout-resource` | `POST /api/robots/checkout`, `POST /api/robots/{name}/release` |
| `match-preview-resource` | `POST /api/match-preview` |
| `xy-touch-resource` | `POST /api/xy_touch` — summary `Look up a Screen Location (mm) and tap it (ADB touch or physical probe)` |
| `card-resource` | `POST /api/card/swipe`, `POST /api/card/dip`, `POST /api/card/tap` |
| `screen-compare-resource` | `POST /api/screen-compare/{name}/test`, CRUD `/api/screen-compare-images` |
| `health-check-resource` | `POST /api/health-check/run` |
| entity resources | CRUD for `devices`, `merchant-configs`, `screens`, `screen-locations`, `card-profiles` (query params `deviceType.equals`, `screenId.equals`) |
| `management` | `GET /management/health` |

Expanded op: `Parameters` table (name, in, type, description), `Request body` (`application/json`) with an example
(xy_touch: `{"robot":"wall-e","screen":"TENDER_CASH_DISCOUNT","button":"Cash"}`), `Responses` (200 example, 400,
404, 409, 423, 502, 503 with the Sim texts). **Try it out** → editable params/body → **Execute** →
`sim.orca.rest(method, path, body, 'player')` → `Curl` block (`curl -X 'POST' \ 'http://orca.lab.local:8080/api/xy_touch' \
-H 'accept: */*' \ -H 'Content-Type: application/json' \ -d '{…}'`), `Request URL`, `Server response` `Code` +
`Response body` (pretty JSON, copy button) + `Response headers`. Emit `orca.api.executed`. This page is how a
trainee learns the REST calls the runners make — it MUST match what `curl` in the Terminal returns.

### 2.13 Orca unavailable

| Condition (§0.5) | What the window shows |
|---|---|
| `orca-vm` down / `orca` service down / network | browser error page (`orca.lab.local took too long to respond.` / `refused to connect.`) |
| app up, `orca.app.dbConnected == false` (INC60) | navbar renders; page area shows JHipster's error page: `h1` `Error Page!` and `alert-danger` with exactly `500 Internal Server Error — Could not open JPA EntityManager for transaction; nested exception is org.hibernate.exception.JDBCConnectionException: Unable to acquire JDBC Connection` and a second line `Communications link failure` (Sim §3.14.5). Every entity call returns 500; list pages show the JHipster alert `Internal server error`; `/admin/health` shows `db DOWN`. |
| sim call throws (not implemented) | `alert-danger` `Server not reachable` (JHipster's status-0 message) |

### 2.14 Keyboard

`Enter` submits the focused form; `Esc` closes modals/popovers/dropdowns (consumed); `Ctrl+S` on a form = Save
(consumed, [illus.] convenience); in lists `/` focuses the Name filter [illus.]; `Alt+←` back (browser).

---

## 3. Jenkins (`http://jenkins.lab.local:8080`)

Jenkins is the Executor (Ref §2). The UI is **Jenkins 2.4xx LTS** (`Jenkins 2.462.3` in the footer [illus.]) with
the stock theme, the Folders, Pipeline, Pipeline: Stage View and Green Balls [illus.] plugins. All data comes from
`lab.jenkins` (Sim §1.12, §2.13); every build is created by `sim.jenkins.build`.

### 3.1 Look and feel

| Token | Value |
|---|---|
| Fonts | system UI stack 14 px (`--font-size-base`), monospace console 13 px |
| Header | 56 px, background `#ffffff` with bottom border `#e5e5e5`; left: butler head glyph 28 px (simplified, flat) + `Jenkins` 18 px 600; centre-right: search box (`Search (Ctrl+K)`, rounded 6 px, `#f2f2f3`), bell, user chip `Engineer` (from `progress.playerName`), `log out` (does nothing but reload [illus.]) |
| Breadcrumb bar | 40 px under the header, `#f8f8f8`: `Dashboard › Java › uia-remote-regression-flex › #4127`, each crumb with a hover chevron dropdown (job context menu) |
| Side panel | 260 px left column, task links with 20 px icons: `+ New Item`, `People`, `Build History`, `Manage Jenkins`, `My Views` on the dashboard; job/build-specific tasks elsewhere. Below: **Build Queue** and **Build Executor Status** widgets (collapsible cards). |
| Colours | links `#0b6aa2` (hover underline), text `#14141f`, muted `#6d6b7f`, success `#138347`, failure `#e6001f`, unstable `#fe820a`, aborted/disabled `#9a9aaa`, running pulse `#0b6aa2`; tables `.jenkins-table` with 1 px `#e5e5e5` row borders, row hover `#f5f5f7` |
| Status icons | 24 px circles (Green Balls [illus.]): success green `#138347` ✓, failure red `#e6001f` ✕, unstable orange `#fe820a` !, aborted/not built grey, running = the previous result's colour with a rotating 2 px ring (CSS animation 1 s), queued = grey clock |
| Weather | 24 px icons by success ratio of the last 5 finished builds: 5/5 sunny, 4/5 partly cloudy, 3/5 cloudy, 2/5 rain, ≤1/5 thunderstorm; tooltip `Build stability: 1 out of the last 5 builds failed. 80%` |
| Footer | right-aligned 12 px grey: `REST API` · `Jenkins 2.462.3` |

### 3.2 Dashboard and views (`/`, `/view/:view/`)

View tabs above the table (Sim §2.13): `All` · `Java` · `iOS` · `uia-remote` · `SDK-Go` · `Pigeon-LSTR` · `Laz` ·
`Vision-PoC` · `+` (new view → `Access Denied` [illus.]). The **All** view lists the two **folders** `Java` and
`iOS` (folder icon, aggregated S/W). `Java` and `iOS` views list their jobs (full names relative to the folder,
`uia-remote-regression-flex`); the other views list matching jobs with their folder prefix
(`Java » uia-remote-regression-flex`). Tab clicks navigate (`/view/Java/`) and emit `jenkins.view.opened`
(Cur M11 s2 "Both views opened").

Table columns (Jenkins defaults): `S` (status icon) · `W` (weather) · `Name ↓` · `Last Success` (`2 hr 4 min #4126`)
· `Last Failure` (`N/A` / `5 min 12 sec #4127`) · `Last Duration` (`1 min 2 sec`) · schedule icon (▶ `Schedule a
Build for <job>`; parameterised jobs navigate to Build with Parameters, others call `sim.jenkins.build(job, {})`
directly with the toast `Build scheduled`). Icon legend links at the bottom: `Icon: S M L`, `Legend`, `Atom feed
for all`, `Atom feed for failures`, `Atom feed for just latest builds` (decor links that do nothing).

**Folder page** (`/job/Java/`): `h1` folder icon + `Java`, description `Legacy platform split: Java jobs (Android,
Windows, REST, Go). iOS jobs live in the iOS folder.` [illus.], the same jobs table, side panel `Status`,
`Configure` (denied), `New Item`, `Delete Folder` (denied), `Move`, `Build History`, `Rename`.

**Widgets** (every page with a side panel):
* `Build Queue (n)` — `lab.jenkins.queue` entries: job name link + `pending—Waiting for next available executor`;
  `No builds in the queue.` when empty; red `✕` cancels (`sim.jenkins.abort`).
* `Build Executor Status` — node `Built-In Node` [illus. name `lab-executor`] with `executors` rows: `1  Idle` or
  `Java » uia-remote-regression-flex #4127` + a progress bar (elapsed ÷ last successful duration, striped when over
  100 %) + red `✕` abort. Builds blocked in `Checkout robot` still hold their executor (Sim §3.18.1).

### 3.3 Job page (`/job/:folder/job/:job/`)

Heading: status icon + `Pipeline uia-remote-regression-flex`, description (from `job.description`), the
`Disabled` banner when `job.disabled` (`This project is currently disabled` + `Enable` button → D4).

Side panel: `Status`, `Changes`, `Build with Parameters` (parameterised) / `Build Now` (no params), `Configure`,
`Delete Pipeline` (denied, §3.9), `Full Stage View`, `Move`, `Rename` (denied), `Pipeline Syntax` (opens a static
snippet-generator page [illus.]). Then the **Build History** widget: filter box `Filter builds…`, rows newest first
`(icon) #4127  Oct 5, 2026, 9:41 AM` (+ a progress bar for running builds, `(pending—…)` for queued), `Atom feed`
links. Up to `job.buildIds` (Sim keeps 20).

Main area:
* **Stage View** (Pipeline: Stage View plugin): header row of stage names in execution order (`Checkout SCM`,
  `Resolve capabilities`, `Checkout robot`, `Verify robot`, `Merchant`, `Inject environment`, `Run tests`,
  `Release robot`, `Publish results` — whatever `build.stages` contains), an `Average stage times:` row, then one row
  per recent build (max 10): left cell `#4127` + date + `Changes: No changes`, stage cells showing duration
  (`4s`, `53s`, `1min 2s`) on a tint: success `#e3f3e8` with left border `#138347`, failed `#fbe1e3` / `#e6001f`,
  running `#e1effa` animated stripes / `#0b6aa2`, skipped/aborted `#f0f0f2` / `#9a9aaa`, pending empty. Hovering a
  failed cell shows `Failed` + the last console line of that stage; clicking a cell opens the console scrolled to
  that stage's `[Pipeline] stage (…)` line. Stage view MUST re-render live while a build runs.
* **Permalinks** list: `Last build (#4127), 1 min 12 sec ago`, `Last stable build (#4126), 2 hr 4 min ago`,
  `Last successful build`, `Last failed build`, `Last unsuccessful build`, `Last completed build`.

Emit `jenkins.job.opened` on open.

### 3.4 Build with Parameters (`/job/:folder/job/:job/build`)

Heading `Pipeline uia-remote-regression-flex`, text `This build requires parameters:`. One block per `job.params`
in order: parameter name bold (`DEVICE_TYPE`), the control — `string` → text input prefilled with
`job.savedParams[name] ?? param.default` (so `flex_3` shows up exactly as saved, INC39/Cur M11); `choice` → select;
`boolean` → checkbox — and the description below in grey (`DEVICE_TYPE`: `Orca DeviceType enum value, ALL CAPS
(e.g. FLEX_3). Blank = any.` [illus.]; `ROBOT_NAME`: `Exact Orca robot Name (lowercase). Blank = any matching
Available robot.`; `MERCHANT`: `Merchant Config name`; `CARD_PROFILE`: `Card profile name(s), comma separated`;
`BACKEND_ENV`: `Backend environment (DEV1, DEV2, STG, QA, INT)`; `BRANCH`: `Git branch`). Button `Build` (primary
`#0b6aa2`). Submit → `sim.jenkins.build(jobId, values, 'player')` → on success navigate to the job page and show
the transient notice `Build scheduled` (top-right pill); on error show it in red under the button. Emit
`jenkins.buildWithParameters.opened` on open and `jenkins.build.triggered` (with all values and the returned
`buildId`) on submit. Cur M10 s13 ("Pick card profiles") is satisfied from these submitted values; the job does
not need to finish.

### 3.5 Build page (`/job/…/:number/`) and Console Output (`/job/…/:number/console`)

**Build page:** heading status icon + `#4127 (Oct 5, 2026, 9:41:07 AM)`; side panel `Status`, `Changes`,
`Console Output`, `Edit Build Information`, `Delete build '#4127'` (denied), `Parameters`, `Pipeline Steps`,
`Restart from Stage` (denied), `Replay` (denied), `‹ Previous Build`, `Next Build ›`; a red `✕` `Abort` button in the
heading while running (`sim.jenkins.abort`, confirm `Are you sure you want to abort uia-remote-regression-flex
#4127?`, emit `jenkins.build.aborted`). Main: `Started by user Engineer` / `Started by timer` / `Started by upstream
project …` (from `triggeredBy`), `Revision: 7a20f5b…` + `Repository: git@github.com:labsim-lab/uia-remote.git`
(from the job's `testRef` repo head) [illus. block], `Robot: wall-e (FLEX_3)` [illus.] when `robotId`, `Test Result:
2 tests, 0 failures` parsed from the console's `Tests: …` line when finished, and the build's stage row.
`Parameters` page: table name/value of `build.params` (secrets masked). Build duration `Took 1 min 2 sec` when done.

**Console Output** (the page lessons live on): heading `>_ Console Output` with links `Download`, `Copy`,
`View as plain text`; the console is a `<pre>` (monospace 13 px, `#14141f` on `#ffffff`, line-height 1.45,
`white-space: pre-wrap`) rendering `build.console` **line by line exactly** (Sim §3.18.5 prefixes, §3.4/§3.17/§3.19
strings; the sim caps at 400 lines with `… N lines skipped …`). Styling rules (real Jenkins): lines starting
`[Pipeline]` are grey `#9a9aaa`; everything else plain (no colouring of `ERROR`). Live streaming: subscribe to
`builds[id].console.length` and append; while `state != 'finished'` an animated spinner sits under the last line;
auto-scroll follows the tail unless the user scrolled up (a `Follow` toggle pill bottom-right [illus.] restores it).
Each line is clickable [game-light]: click highlights it (`#fff6c2` background) and emits
`jenkins.console.lineClicked` with the line number and text (Cur M11 s8 "`PORT_NUMBER=5444` line clicked"). Opening
the page emits `jenkins.console.opened` with the build's state and result at that moment (Cur M11 s4 / M15 s5
"Failure viewed": missions check `result == 'FAILURE'` either in that payload or on a later `console.opened`).
`lastBuild/console` and `lastBuild/` routes resolve to the newest build.

### 3.6 Configure (`/job/…/configure`)

Left section nav (`General`, `Advanced Project Options`, `Pipeline`) and the form:
* **General**: `Description` textarea; `Discard old builds` (checked, `Max # of builds to keep: 20`, read-only);
  `This project is parameterized` (checked) → one card per parameter: `String Parameter` / `Choice Parameter` /
  `Boolean Parameter` header, `Name` (read-only), `Default Value` (editable — **this is `savedParams`**, Sim §1.12),
  `Description`, `Trim the string` checkbox. `Build periodically` with `Schedule` (`H 2 * * *` for the nightly
  [illus.]).
* **Pipeline**: `Definition` select `Pipeline script` (only option), `Script` editor — ACE-like: gutter with line
  numbers (`#ebebeb`, 40 px), Groovy highlighting (keywords `def pipeline agent stages stage steps script post
  always` `#0000ff`, strings `#036a07`, comments `#4c886b`, `params.X` `#7a3e9d`), current line `#f6f6f6`; content =
  `job.script`. `Use Groovy Sandbox` checked. `Pipeline Syntax` link.
* Buttons (sticky bottom bar): `Save` (primary) and `Apply`. Save/Apply → D4 `sim.jenkins.saveJob(jobId,
  {description, savedParams, script, disabled})` → `Save` navigates to the job page; `Apply` shows `Saved` pill.
  Emit `jenkins.job.configured` with `changed` (`'script' | 'params' | 'description' | 'disabled'`).

Clicking a line in the Script editor (single click, no drag) emits `jenkins.script.lineClicked` with the 1-based
line and its text (Cur M08 s6 "highlight line `def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch:
true]`"); opening Configure emits `jenkins.script.viewed`.

### 3.7 Move (`/job/…/move`) and search

**Move** (CloudBees Folders, INC26): heading `Move`, text `Move 'pigeon-windows-tender' to:` + select
`Jenkins » Java` / `Jenkins » iOS` (current folder preselected) + button `Move`. → D4 `sim.jenkins.moveJob` →
navigate to the new job URL; emit `jenkins.job.moved` (`from`, `to` job ids).

**Search** (`Ctrl+K` or click): a command-palette dropdown (Jenkins 2.4xx) listing matching jobs/folders/views/builds
as you type (`pigeon-windows` → `iOS » pigeon-windows-tender`); Enter navigates; full results page `/search/?q=…`.
Emit `jenkins.search` with the query and the result ids when the user submits or picks a result.

### 3.8 Other pages

| Page | Content |
|---|---|
| Build History (`/view/all/builds`) | timeline strip (decor) + table `Build` · `Time Since` · `Status` for every build across jobs, newest first |
| People (`/asynchPeople/`) | `User ID` · `Name` · `Last Commit Activity` · `On` from team keys (`jenkins-ci`, `morgan`, `tate`, …) |
| Manage Jenkins (`/manage/`) | sectioned tiles (`System Configuration`: System, Tools, Plugins, Nodes, Clouds; `Security`: Security, Credentials, Users; `Status Information`: System Information, System Log, Load Statistics, About Jenkins). Only **Nodes** and **About Jenkins** open (Nodes: `Built-In Node` · `Linux (amd64)` · `In sync` · free disk `104.80 GB` · 8 executors; About: version and license text); the rest show §3.9. |
| Pipeline Syntax | static `Snippet Generator` page with a `Sample Step` select and `Generate Pipeline Script` producing a fixed snippet [illus.] |
| Parameters (`/…/:number/parameters/`) | §3.5 |
| Changes (`/…/changes`) | `Changes` heading, `#4127 No changes.` rows |

### 3.9 Permissions and Jenkins down

* The player is a non-admin user: actions outside this spec (delete, rename, new item, manage pages) render Jenkins'
  **Access Denied** page: `h1` `Access Denied`, text `Engineer is missing the Overall/Administer permission`
  (or `Job/Delete` etc.).
* `jenkins-vm` / `jenkins` down (Sim §3.14.4): browser error page. During a restart builds in flight finish
  `FAILURE` with `Jenkins is restarting — build interrupted` (sim strings).

### 3.10 Notifications and keyboard

Notifications (§1.5): `Build #4127 FAILURE — Java/uia-remote-regression-flex` (red) / `SUCCESS` (green) for builds
the player triggered; failures of any job while the Jenkins window is unfocused (one per build). Keyboard:
`Ctrl+K` search, `Esc` closes search/menus (consumed), `Enter` submits Build with Parameters, `Alt+←/→` history.

---

## 4. IntelliJ IDEA (Darcula)

`IntelliJ IDEA 2024.3 (Community Edition)` [illus. version] in the **classic UI** with the **Darcula** theme. It is
the only place the player edits repo code (GitHub web edits exist too, §7.6). Projects are local clones
(`lab.repos[r].local`, Sim §1.11); every save is `sim.git.writeFile`; runs are `sim.runner.runLocal` and use the
clone's `config.properties` (Sim §3.19.1); git operations are `sim.git.*`.

### 4.1 Look and feel (Darcula)

| Token | Value |
|---|---|
| UI font | system UI 13 px `#BBBBBB`; tool window headers 12 px bold |
| Editor font | `"JetBrains Mono", "Cascadia Mono", Consolas, monospace` 13 px, line height 1.4 (≈ 18 px) |
| Backgrounds | editor `#2B2B2B`; tool windows/panels `#3C3F41`; gutter `#313335`; menus `#3C3F41` with hover `#4B6EAF`; borders `#323232`/`#515151`; selection (tree/list) `#0D293E` focused / `#45494A` unfocused |
| Editor | default text `#A9B7C6`; caret `#BBBBBB` (1 px, blink 500 ms); caret row `#323232`; selection `#214283`; line numbers `#606366` (current `#A4A3A3`); indent guides `#393939`; matched brace bg `#3B514D`; find matches `#32593D`, current match `#155221`; right margin at col 120 `#323232` |
| Java | keywords `#CC7832`; strings `#6A8759`; numbers `#6897BB`; line/block comments `#808080`; doc comments `#629755` (tags `#629755` bold); annotations `#BBB529`; method declarations `#FFC66D`; fields (identifiers declared as class fields) `#9876AA`; `static final` constants `#9876AA` italic; semicolons/commas `#CC7832` |
| JSON | keys `#9876AA`; strings `#6A8759`; numbers `#6897BB`; `true`/`false`/`null` `#CC7832`; braces/brackets/colons `#A9B7C6`, commas `#CC7832` |
| .properties | keys `#CC7832`; `=` `#A9B7C6`; values `#6A8759`; comments `#808080` |
| XML (pom.xml) | tags `#E8BF6A`; attribute names `#BABABA`; attribute values `#6A8759`; prolog `#808080` |
| YAML / .gitignore / Markdown | YAML keys `#CC7832`, values `#6A8759`, comments `#808080`; Markdown headings `#CC7832` bold, code `#6A8759`; plain text `#A9B7C6` |
| VCS file colours (tree, tabs) | modified `#6897BB`; added `#629755`; unversioned `#D1675A`; ignored `#848504`; unchanged `#BBBBBB` |
| Problems | error wave underline `#BC3F3C`; warning `#BE9117`; Problems count chips in the editor's top-right (`❗ 1  ⚠ 0` or the green `✓` when clean) |
| Diff | inserted `#294436`; deleted `#484A4A`; modified `#385570` |
| Icons | file-type icons 16 px: Java class (blue circle `C`), test class (blue `C` + green run triangle corner), interface, JSON `{}`, properties gear, XML `<>`, YAML, Markdown `M↓`, folders (`#87939A`; source root blue `#4A90D9`; test source root green `#62B543`; resources with yellow lines) |

### 4.2 Window layout

```
┌ Main menu: File Edit View Navigate Code Refactor Build Run Tools Git Window Help ─────────────────────────┐
├ Nav bar: uia-remote › app › src › androidTest › … › HomeScreen.java    [🔨] [TaxTest ▾] ▶ 🐞 ■ │ Git: ↙ ✓ ↗ 🕒 ↶ ┤
│1:Project ┌ Project ▾ ──────────┐┌ HomeScreen.java ×  TaxTest.java ×  config.properties × ─────────────┐ │
│0:Commit  │ tree                ││ gutter │ editor                                       ❗1 ⚠0 ✓ ⌄   │ │
│          │                     ││        │                                                            │ │
│          └─────────────────────┘└───────────────────────────────────────────────────────────────────┘ │
│          ┌ Run: TaxTest × ─── (bottom tool window: Run / Terminal / Problems / Git / TODO) ────────────┐ │
├ Bottom stripe: 4: Run  ⌨ Terminal  6: Problems  9: Git  TODO ─────────────────────────────────────────┤
└ Status bar: Tests passed: 1 (moments ago)            12:34  LF  UTF-8  4 spaces  ⎇ Git: main  🔒  👁 ┘
```

Tool windows (left: `Project` Alt+1, `Commit` Alt+0; bottom: `Run` Alt+4, `Terminal` Alt+F12, `Problems` Alt+6,
`Git` Alt+9, `TODO`) open/close from the stripes; splitters are draggable; sizes persist per viewer.

### 4.3 Welcome screen, Get from VCS, projects

* **Welcome** (no project; route `/welcome`): window `Welcome to IntelliJ IDEA`, left nav `Projects` (active),
  `Customize`, `Plugins`, `Learn`; main: search field `Search projects`, buttons `New Project`, `Open`,
  `Get from VCS`; recent projects (cloned repos): `uia-remote  ~/IdeaProjects/uia-remote`. Clicking a recent
  project opens it (route `/project/<repo>`).
* **Get from Version Control** (Welcome `Get from VCS` or `File › New › Project from Version Control…`; Cur M13 s3):
  modal `Get from Version Control`, left list `Repository URL` (selected), `GitHub`, `GitHub Enterprise`; fields
  `Version control: Git ▾`, `URL:` (text, paste from the in-game clipboard), `Directory:` auto-filled
  `~/IdeaProjects/<repo>` as soon as the URL parses; buttons `Clone` (disabled until valid) / `Cancel`. Accepted URLs:
  `git@github.com:labsim-lab/<repo>.git`, `https://github.com/labsim-lab/<repo>(.git)` with
  `<repo>` ∈ `gort`, `uia-remote`, `pigeon`, `orchestrator`. Unknown repo → red text under the field
  `Repository not found`; already cloned → `Directory '~/IdeaProjects/uia-remote' already exists and is not
  empty` with an `Open` link. Clone shows a progress line `Cloning source repository
  git@github.com:labsim-lab/uia-remote.git…` (1.2 s) then `sim.git.clone(repo, 'player')`; the project opens,
  the status bar shows `Indexing…` with a progress bar for 1.5 s and `Maven: Importing 'uia-remote'…` for
  uia-remote (pom.xml). Emit `intellij.project.cloned` (with the URL as typed) and `intellij.project.opened`.
* **Code With Me** [illus.] (Sim §1.15, GP INC29): a toolbar icon (person with `+`) opens `Code With Me` popup
  `Join Session…` listing colleagues' shared projects found under `~/CodeWithMe/<person>/<repo>/` in
  `lab.workstation.files` (`Alex — uia-remote`). Joining opens a project window titled `uia-remote [Alex] — Code With
  Me` (route `/project/uia-remote` with `?cwm=alex` [illus.]) whose files are that folder; saves write with D6
  `sim.host.writeFile('ws-17', '~/CodeWithMe/alex/uia-remote/<path>', text)`, runs pass
  `{ configPath: '~/CodeWithMe/alex/uia-remote/config.properties' }` (D18). The config validator (§4.8) runs on that
  file too. A blue banner `You are a guest in Alex's project` sits above the editor; git actions are disabled
  (`Version control is managed by the host`).
* `File › Open…` → a folder picker over `~/IdeaProjects`; `File › Recent Projects` lists clones; opening a project
  for which a window exists focuses it (`instanceKey = repo`). `File › Close Project` → welcome screen.

### 4.4 Project tool window (the trees of Sim §2.12)

The tree is built from `local.files` paths. Root node `uia-remote  ~/IdeaProjects/uia-remote` (bold name, grey
path). Folders sort before files, alphabetical, case-insensitive. Java source roots are marked by path:
`app/src/main/java` (blue source root), `app/src/test/java` and `app/src/androidTest/java` (green test source roots);
inside a source root **packages are shown compacted** (`com.labsim.uia`) with sub-packages as children (IntelliJ
"Compact Middle Packages"). Extra decor nodes at the end: `External Libraries` (expands to `< 17 >`,
`androidx.test.uiautomator:uiautomator:2.3.0`, `junit:junit:4.13.2`), `Scratches and Consoles`.

Expected factory trees (content comes from the sim seed; this list is what Cur/GP lessons click):

```
gort                                   uia-remote                                   pigeon
├─ cards                               ├─ app                                       ├─ runners
│  ├─ emv  (visa_std_dip.json,         │  └─ src                                    │  ├─ android
│  │        interac_ca_dip.json,       │     ├─ androidTest/java                    │  ├─ ios
│  │        amex_matrix_dip.json,      │     │  └─ com.labsim.uia                   │  ├─ rest
│  │        discover_matrix_dip.json)  │     │     ├─ databases (DbHelper)          │  └─ windows
│  └─ nfc  (visa_std_tap.json,         │     │     ├─ pageobjects (HomeScreen,      ├─ tests
│           interac_ca_tap.json)       │     │     │   LockScreen, NavigationBar,   │  ├─ _templates (known_good_actions.json)
├─ config                              │     │     │   RegisterHomeScreen,          │  ├─ go (ios_go_smoke.json)
│  └─ screen-locations                 │     │     │   ReviewOrderScreen,           │  ├─ sale (swipe_sale_print.json,
│     └─ <DEVICE_TYPE>/<SCREEN>.json   │     │     │   PaymentScreen,               │  │   tip_sale_print.json,
├─ go-sdk                              │     │     │   CfdTotalsScreen,             │  │   payment_success_compare.json)
│  └─ tests (sale_receipt.json)        │     │     │   CfdPaymentScreen,            │  └─ tender (windows_tender.json)
├─ suites                              │     │     │   ReceiptScreen)               └─ lstr.json
│  └─ contact-canada (pin_sale.json)   │     │     ├─ testactions (HomeScreenTest,
└─ README.md                           │     │     │   ReceiptScreenTest, SaleTest, TaxTest, TaxTestDuo,
                                       │     │     │   RefundTest, DuoCfdSuite, DuoCheckoutTest,
                                       │     │     │   PrinterlessSmokeTest, PaycoreMatrixTest,
                                       │     │     │   ContactCanadaPinSaleTest)
                                       │     │     └─ BaseTest
                                       │     ├─ main/java/com.labsim.uia (AppRegistration)
                                       │     └─ test/java/com.labsim.uia.runner (MultiDeviceRunner)
                                       ├─ .gitignore   ├─ config.properties (only once created; ignored colour)
                                       ├─ config.properties.example   └─ pom.xml
```

| Interaction | Behaviour |
|---|---|
| click a node | select; emit `intellij.tree.nodeClicked { repo, path, kind }` (path = repo-relative folder/file path, e.g. `app/src/main`, `runners/ios`; for compacted package nodes the full folder path `app/src/androidTest/java/com/lab/uia/pageobjects`) — Cur M13 s4, M15 s2 |
| double-click / Enter on a file | open in the editor (preview tab replaced on single-click if `Enable Preview Tab` — off by default) ; emit `intellij.file.opened` |
| arrows / `←`/`→` | collapse/expand; type-to-search highlights matching nodes (IntelliJ speed search) |
| drag & drop a file onto a folder/package | opens the **Move** refactoring dialog (§4.7) |
| context menu | `New ▸` (`Java Class`, `File`, `Directory`, `Package`), `Cut`/`Copy`/`Paste`, `Copy Path/Reference… ▸` (`Absolute Path`, `Path From Content Root`), `Find in Files…`, `Refactor ▸` (`Rename…`, `Move…`), `Delete…` (D5), `Run 'TaxTest'` on test classes / Pigeon JSON, `Git ▸` (`Add`, `Rollback…`, `Show History`), `Open In ▸ Terminal` |

### 4.5 Editor

* **Tabs:** one per open file, icon + name (VCS colour), `×` on hover; middle-click closes; drag to reorder;
  overflow `⌄` list; tab context menu `Close`, `Close Others`, `Close All`, `Copy Path`. Modified-but-unsaved state is
  invisible (IntelliJ autosaves) — the VCS colour (blue) shows "changed vs HEAD".
* **Breadcrumbs** at the editor bottom for Java: `HomeScreen › open()`.
* **Editing model:** a hidden `<textarea>` (or contenteditable) with a highlighted `<pre>` overlay; per-file undo
  stack (`Ctrl+Z` / `Ctrl+Shift+Z`), multi-line selection, `Tab`/`Shift+Tab` indent/outdent (4 spaces Java/properties/
  XML, 2 spaces JSON/YAML), smart Enter (keeps indent, +1 level after `{`/`[`), auto-close `()[]{}""''` pairs,
  matched-brace highlight, `Ctrl+D` duplicate line, `Ctrl+Y` delete line, `Ctrl+/` toggle `//` comment (Java) /
  `#` (properties, YAML), `Alt+Shift+↑/↓` move line, `Ctrl+Shift+↑/↓` move statement (Java: whole statement
  lines; elsewhere = move line) — Cur M13 s11 reorders `mfd.run(…)` lines this way, `Ctrl+Alt+L` reformat
  (re-indent by braces), `Ctrl+A`, `Ctrl+C/X/V` through the in-game clipboard (copy with no selection copies the
  line).
* **Saving:** `Ctrl+S` (`File › Save All`) writes every changed buffer with `sim.git.writeFile(repo, path,
  contents)`; IntelliJ-style autosave also writes when the IntelliJ window loses focus, when switching projects, and
  before a run/commit. Emit `intellij.file.saved { repo, path, trigger, problems }` per written file.
* **Click reporting:** a single click that places the caret (no drag) emits `intellij.editor.clicked { repo, path,
  line, column, lineText, token }` (1-based line/col; `token` = the identifier/string/JSON key under the caret, quotes
  stripped). Cur M13 s6 ("click Zone 1, then Zone 2") and M15 s3 ("click `name`, `connectionType`, `platforms`,
  `actions`") are evaluated by missions from these payloads.
* **Gutter:** line numbers; green ▶ run icons on `public class <X>Test` lines of `testactions` classes and on line 1
  of Pigeon test JSONs (`tests/**` except `_templates`) → click = run that config (§4.9); hover shows `Run 'TaxTest'`.
* **Find bar** (`Ctrl+F`): field + toggles `Cc` (match case), `W` (words), `.*` (regex), result `1/3`, `↑`/`↓`
  (`Shift+F3`/`F3`, also `Enter`/`Shift+Enter`), `✕`/`Esc` (consumed). `Ctrl+R` adds the replace row with
  `Replace`, `Replace All`. **Find in Files** (`Ctrl+Shift+F`): popup with query field and a results list
  `TaxTestDuo.java 23  assertTrue(orca.screenCompare("CFD_TOTAL"));` — Enter opens at the line.
* **Navigation:** `Ctrl+G` `Go to Line:Column` dialog; `Ctrl+Shift+N` Go to File popup; `Shift Shift` Search
  Everywhere (tabs `All`, `Classes`, `Files`, `Actions`); `Ctrl+E` Recent Files; `Ctrl+Alt+←/→` back/forward;
  `Ctrl+B`/`Ctrl+click` on a class name opens that class's file (by simple name within the project).
* **Read-only cases:** files outside the clone (External Libraries) open read-only with a yellow banner
  `This file is read-only`.

### 4.6 Inspections and the Problems tool window

| File type | What is flagged | Messages |
|---|---|---|
| Java (all projects) | the Sim CF12 sanity rules: unbalanced `()[]{}` and a statement line missing its `;` (heuristic: inside a method body, a line ending in `)`, an identifier or a literal, followed by a line that starts a new statement). MUST report **zero** problems on every factory file. | `'}' expected`, `')' expected`, `';' expected` |
| JSON in **gort** / orchestrator | strict JSON parse errors at the offending token | IntelliJ wording: `',' or '}' expected`, `',' or ']' expected`, `Property name expected`, `Value expected`, `Missing closing quote` |
| JSON in **pigeon** | **nothing** — the pigeon project disables JSON inspections and error highlighting (legacy project settings, Cur §7, M15 s6). The editor's inspection widget shows a grey eye with tooltip `Highlighting level: None (pigeon/.idea/inspectionProfiles)` [illus.]; the Problems window shows `Inspections are disabled for this project` [illus.] instead of a problem list — a missing comma is only discovered at run time (`LSTR ParseError: …`, Sim §3.20.1) | — |
| `config.properties` (uia-remote) | the config validator (§4.8) | per key |
| others | none | |

Problems tool window (Alt+6): tabs `File` and `Project Errors`; rows `❗ ';' expected :23` grouped by file; click
navigates. Counts show in the editor's top-right chip (`❗ 1`), green `✓` when clean. `Build › Build Project`
(`Ctrl+F9`) runs the Java checks over the project and shows `Build completed successfully in 1 sec, 412 ms` or
`Build failed: 1 error` in the status bar; emit `intellij.build.ran { repo, errors }`.

### 4.7 Refactorings, intentions, new files

* **Move** (drag & drop in the tree, or `F6`): dialog `Move` — Java: `Move class HomeScreen to package:`
  (package field, prefilled from the drop target) and `To directory:` (path); other files: `Move file
  swipe_sale_print.json to directory:`; checkbox `Search for references` (checked, no effect [sim]); buttons
  `Refactor` / `Cancel`. Refactor rewrites the `package …;` line for Java files and calls D5 `sim.git.moveFile(repo,
  from, to)`. Emit `intellij.file.moved`. (Cur M13 s5 puts `DbHelper`, `HomeScreen`, `LockScreen`, `TaxTest`,
  `MultiDeviceRunner`, `AppRegistration` where they belong.)
* **Rename** (`Shift+F6`): `Rename file` dialog (`New name:`) → moveFile within the same folder.
* **New ▸ Java Class**: popup `New Java Class` with name field and kind list `Class`, `Interface`, `Enum`, `Record`;
  creates `package <pkg>;\n\npublic class <Name> {\n}\n` → then IntelliJ's `Add File to Git` dialog (`Do you want
  to add the following file to Git?` + path, `☐ Don't ask again`, `Add` / `Cancel`) → `sim.git.writeFile` (+ `stage`
  on Add). `New ▸ File` asks for a name and creates an empty file. Emit `intellij.file.created`.
* **Context actions** (`Alt+Enter`, or the yellow bulb in the gutter): popup list. Always offered: `Add Javadoc`
  [illus. simplified], `Copy reference`. Offered in a class under `…/pageobjects/` that extends `BaseTest` and lacks
  `waitForScreen()` and/or `isScreenPresent()` [illus., team plugin]: **`Implement mandatory screen methods`** — inserts
  at the end of the class body (before the closing brace), using the first `BySelector` field `X` of Zone 1:
  ```java
      public void waitForScreen() {
          device.wait(Until.hasObject(X), TIMEOUT_MS);
      }

      public boolean isScreenPresent() {
          return device.hasObject(X);
      }
  ```
  (only the missing ones). The same class shows a warning-level inspection
  `Screen class is missing mandatory method isScreenPresent()` [illus.] that the intention fixes. Emit
  `intellij.intention.applied` (Cur M13 s9).

### 4.8 `config.properties` validator [illus., "uia-remote Config Assistant" plugin]

Shown as an editor notification bar at the top of `uia-remote/config.properties` (and of `config.properties.example`
when no `config.properties` exists: `config.properties not found — copy config.properties.example` with link
`Create config.properties from example` → `writeFile`). The bar reads exactly **`config.properties ✓ 11/11`** (green
check) when valid, otherwise `config.properties ✗ 8/11` (amber) with `Show details ⌄` expanding one row per key:
`✓ runType = tethered`, `✗ portNumber = 5555 — must be 5444: lab devices listen on 5444; 5555 is the ADB default`.
It re-runs on every save and when the file is opened, and emits `intellij.configValidator.ran { passed, total,
failures[] }`. Rules (Cur M14 validator target, Sim §3.19.1; `R` = Orca robot named by `robotName`, its
MFD/CFD/Robot Device rows from `lab.orca`): D8 replaces this when the sim provides it.

| # | Key | Valid when | Failure text (after `— `) |
|---|---|---|---|
| 1 | `robotName` | an Orca robot with that exact Name exists | `no robot named 'X' in Orca` |
| 2 | `runType` | `tethered` if R's MFD is populated or R's device is a Station Duo, else `standalone` | `must be "tethered" for megatron (MFD populated)` / `must be "standalone"` |
| 3 | `merchantFacingDeviceIp` | MFD device IP (standalone: Robot Device IP) | `expected 10.42.30.21 (megatron-mfd)` |
| 4 | `customerFacingDeviceIp` | CFD device IP; Duo: **equal to the MFD IP**; standalone: empty or equal to the MFD | `On a Station Duo both IPs are the same address (10.42.30.14)` / `expected 10.42.30.22 (megatron-cfd)` |
| 5 | `serial` | serial of the MFD / Robot Device row | `expected SIM-S2-000021` |
| 6 | `deviceType` | family of that device type: `Mini`, `Flex`, `Station`, `Compact` | `deviceType is the family (Mini, Flex or Station) — expected "Station"` |
| 7 | `theme` | `avocado` | `only "avocado" is supported (legacy theme toggles are deprecated)` |
| 8 | `kernelType` | `CPA` | `use "CPA" (Core Payments Application); SPA is legacy` |
| 9 | `portNumber` | `5444` | `must be 5444: lab devices listen on 5444; 5555 is the ADB default` |
| 10 | `unlockPasscode` | the device passcode (`0000`) | `expected the device passcode` |
| 11 | `backendEnv` | R's environment (`DEV1`, …) | `expected DEV1 (megatron's environment)` |

### 4.9 Run configurations and the Run tool window

* **Configurations** (combo in the nav bar, `Run › Edit Configurations…` lists them read-only): uia-remote — one
  JUnit configuration per class in `…/testactions/` (`HomeScreenTest`, `ReceiptScreenTest`, `SaleTest`, `TaxTest`,
  `TaxTestDuo`, `RefundTest`, `DuoCfdSuite`, `DuoCheckoutTest`, `PrinterlessSmokeTest`, `PaycoreMatrixTest`,
  `ContactCanadaPinSaleTest`, plus classes the player adds); pigeon — `LSTR: <file>` for every `tests/**/*.json`
  outside `_templates`. The last run configuration is selected.
* **Run** (`▶`, `Shift+F10`, gutter ▶, `Run › Run '<cfg>'`): autosave (§4.5) → `sim.runner.runLocal(repo,
  testPath, 'player')` (`testPath` = repo-relative path of the class or JSON file) → opens/focuses the bottom **Run**
  tool window tab `TaxTest`. Running again while a run of the same config is active asks `Stop and Rerun` /
  `Cancel`. Emit `intellij.run.started` (sim also emits `test.localRunStarted`).
* **Stop** (`■`, `Ctrl+F2`): `sim.runner.stopLocal(runId)`; emit `intellij.run.stopped` (Cur M14 s3).
* **Run tool window:** left toolbar (rerun `⟳`, stop `■`, `✓` show passed toggle, `⌄` expand all), a result bar
  above the test tree: green `✓ Tests passed: 1 of 1 test – 24 s 512 ms` / red `✗ Tests failed: 1 of 1 test – 12 s
  3 ms` / grey `Tests stopped`; test tree `Test Results › TaxTest › testTax` [illus. method names: `test` + class name
  without `Test`] with ✓/✗/⊘ icons and durations. Right: the console — first line grey: `/usr/lib/jvm/java-17-openjdk/
  bin/java -ea -Didea.test.cyclic.buffer.size=1048576 … com.intellij.rt.junit.JUnitStarter -ideVersion5 -junit4
  com.labsim.uia.testactions.TaxTest` (pigeon: `… LstrRunner --platform ANDROID tests/sale/swipe_sale_print.json`
  [illus.]), then `sim.runner.output(runId).lines` **verbatim** (Sim §3.19.2–§3.19.5, §3.20), streamed. Colour: lines
  containing `Exception`, `Error:`, `AssertionError`, `FAILED`, `ParseError` red `#FF6B68`; `PASSED` / `✓` green
  `#5FB15F`; stack frames `at com.labsim.uia.pageobjects.RegisterHomeScreen.reviewOrder(RegisterHomeScreen.java:21)`
  render the `(File.java:21)` part as a link that opens the file at that line. Final line
  `Process finished with exit code 0` (pass) / `255` (fail) / `130 (interrupted by signal 2: SIGINT)` (stopped).
* Finish → emit `intellij.run.finished { runId, config, passed }`; notification when IntelliJ is unfocused
  (`Tests passed: 1` / `Tests failed: 1`). The status bar shows `Tests passed: 1 (moments ago)`.

### 4.10 Git integration

| Feature | UI | Sim |
|---|---|---|
| Branch widget | status bar `⎇ Git: main` (+ `↑1` when `ahead > 0`, `↓2` when `behind > 0`); click or `Ctrl+Shift+\`` opens the **Branches** popup: search field, `+ New Branch…`, `Checkout Tag or Revision…` (disabled), sections `Local` (current marked ★ / tag icon) and `Remote` (`origin/main`, `origin/fix/…`). Branch → submenu `Checkout`, `New Branch from '<b>'…`, `Show Diff with Working Tree` (opens the diff of that branch vs working tree), `Delete` (disabled for current). | `checkout(repo, b, false)` / `checkout(repo, name, true)`; emit `intellij.git.branchCheckedOut` |
| New Branch | dialog `Create New Branch`, `New branch name:`, `☑ Checkout branch`, `☐ Overwrite existing branch`; invalid names → `Branch name ... is not valid` | `checkout(repo, name, true)` |
| Commit (`Ctrl+K`, toolbar ✓, Commit tool window Alt+0) | tree `Changes` (modified/added files from `local.dirty` with checkboxes, VCS colours) and `Unversioned Files`; double-click → diff tab `HEAD (Read-only)` ↔ `Your version`; message box placeholder `Commit Message`; buttons `Commit` and `Commit and Push…`; gear: `☐ Amend` (disabled [sim]). Empty message → inline `Specify commit message`; nothing selected → `Select files to commit`. | `stage(repo, paths)` then `commit(repo, msg, 'player')`; balloon `1 file committed: <message>`; emit `intellij.git.committed` |
| Push (`Ctrl+Shift+K`, toolbar ↗) | dialog `Push Commits to uia-remote`: left `main → origin : main` (new remote branch shown `origin : fix/flex4-receipt-qr` + green `New`), right the commits list (`7a20f5b Fix waitForScreen…  engineer  10/5/2026, 9:41 AM`) and their files; `Push` / `Cancel`. | `push(repo)`; success balloon `Pushed 1 commit to origin/main` or `Pushed fix/flex4-receipt-qr to new branch origin/fix/flex4-receipt-qr` with link **`Create Pull Request`** (opens GitHub on `/labsim-lab/<repo>/compare/main...<branch>`); rejection balloon (red) `Push rejected` + body = the sim error (`! [remote rejected] main -> main (protected branch hook declined)`); emit `intellij.git.pushed { ok, error? }` |
| Pull / Update (`Git › Pull…`, toolbar ↙ `Update Project…`) | dialog `Update Project` (radio `Merge incoming changes into the current branch` / `Rebase`) or `Pull to main` | `pull(repo)`; balloon `1 file updated in 1 commit` / `All files are up-to-date`; emit `intellij.git.pulled` |
| Rollback | Commit window toolbar `↶` on selected files → confirm `Rollback Changes` | D5 (writeFile with HEAD contents) |
| Git tool window (Alt+9) | `Log` tab: commit list (graph dot, message, author, date) of the current branch; selecting a commit shows its changed files; double-click a file → diff vs parent | read-only, from `repos[r].commits` |
| Terminal tool window (Alt+F12) | embeds `<TerminalApp embedded cwd="~/IdeaProjects/<repo>"/>` (§5) — the tab title is `Local` | `sim.terminal.*` |

### 4.11 Menus (functional items)

`File`: New ▸ (Project from Version Control…, Java Class, File, Directory, Package), Open…, Recent Projects ▸,
Close Project, Settings… (`Ctrl+Alt+S`: `Appearance › Theme` Darcula / IntelliJ Light, `Editor › Font › Size`
[persisted per viewer]), Save All (`Ctrl+S`), Exit. `Edit`: Undo, Redo, Cut, Copy, Paste, Select All, Find ▸ (Find…,
Replace…, Find Next, Find Previous, Find in Files…). `View`: Tool Windows ▸. `Navigate`: Back, Forward, File…,
Line/Column…, Recent Files. `Code`: Show Context Actions, Comment with Line Comment, Reformat Code, Move Statement
Up/Down, Move Line Up/Down. `Refactor`: Rename…, Move…. `Build`: Build Project. `Run`: Run '<cfg>', Debug '<cfg>'
(= Run with the extra header line `Connected to the target VM, address: '127.0.0.1:40217', transport: 'socket'`),
Stop, Edit Configurations…. `Git`: Commit…, Push…, Pull…, Update Project…, Branches…, New Branch…, Show History.
`Help`: About (`IntelliJ IDEA 2024.3 (Community Edition)` · `Build #IC-243.21565.193` [illus.]). Items not listed
render disabled.

### 4.12 Keyboard (Windows/Linux keymap) and substitutes

`Ctrl+S` save all · `Ctrl+F`/`Ctrl+R` find/replace · `F3`/`Shift+F3` · `Ctrl+Shift+F` find in files · `Ctrl+G` ·
`Ctrl+Shift+N` · `Shift Shift` · `Ctrl+E` · `Ctrl+/` · `Ctrl+D` · `Ctrl+Y` · `Alt+Shift+↑/↓` · `Ctrl+Shift+↑/↓` ·
`Alt+Enter` · `F6` move · `Shift+F6` rename · `Ctrl+F9` build · `Shift+F10` run · `Ctrl+F2` stop · `Ctrl+K`
commit · `Ctrl+Shift+K` push · `Alt+1/0/4/6/9`, `Alt+F12` tool windows · `Esc` closes popups/find bar (consumed) or
returns focus from a tool window to the editor (consumed); with the editor focused and nothing open it is **not**
consumed (stands up, §1.8). Browser-reserved IntelliJ keys and their substitutes: `Ctrl+N` (Go to Class) →
`Shift Shift`; `Ctrl+T` (Update Project) → toolbar ↙ or `Alt+Shift+U` [game]; `Ctrl+F4` (close tab) → middle-click,
`×`, or `Alt+Shift+W` [game]; `Ctrl+Tab` (Switcher) → `Ctrl+E`.

---

## 5. Terminal (Windows-Terminal-like, bash)

The terminal is a **renderer** for the sim's shell (`sim.terminal.exec/poll/interrupt/complete/prompt`, Sim §0.5
`src/sim/terminal/`, §3.15): the sim owns every command's semantics and output; the app owns tabs, line editing,
history, completion UI, selection/copy/paste, scrollback, streaming, and the `nano` editor (§5.5). The command
catalogue in §5.4 is the contract the sim implements.

### 5.1 Look and feel

| Token | Value |
|---|---|
| Window | dark title/tab row `#202020` 40 px; tabs 32 px high, radius 8 px top, active tab `#2d2d2d` (rest transparent, hover `#ffffff12`); tab = profile glyph `>_` 14 px + title 12 px (`engineer@ws-17: ~`, `pi@wall-e: ~`, `automation@MINIX-01: C:\Users\automation`) + `✕`; then `+` and `⌄` (menu: `Bash (ws-17)` new tab, `Settings` → font size slider [persisted], `About`) |
| Content | padding 8 px 10 px; font `"Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace` 14 px, line height 1.25; Campbell scheme: background `#0C0C0C`, foreground `#CCCCCC`, cursor block `#FFFFFF` (blink 530 ms, solid while typing), selection `#FFFFFF33`; palette black `#0C0C0C` red `#C50F1F` green `#13A10E` yellow `#C19C00` blue `#0037DA` purple `#881798` cyan `#3A96DD` white `#CCCCCC` · bright black `#767676` red `#E74856` green `#16C60C` yellow `#F9F1A5` blue `#3B78FF` purple `#B4009E` cyan `#61D6D6` white `#F2F2F2` |
| Line kinds (`TerminalLine.kind`) | `out` foreground · `err` bright red `#E74856` · `info` cyan `#3A96DD` · `success` bright green `#16C60C` · `muted` bright black `#767676` · `prompt` = a previously submitted prompt+command line |
| Prompt colouring | bash/Pi prompts `user@host:path$ ` render `user@host` bold bright green `#16C60C`, `:` default, `path` bold bright blue `#3B78FF`, `$`/`#` default (Ubuntu/Raspberry Pi OS default PS1). Windows `C:\…>` and `PS C:\…>` prompts default colour. Detection by regex on `sim.terminal.prompt()`. |
| Scrollbar | 10 px overlay, `#ffffff40` thumb, appears on scroll |

### 5.2 Behaviour

| Feature | Spec |
|---|---|
| Session | each tab has a `sessionId` (`t1`, `t2`…) passed to `exec/poll/complete/prompt` once D7 lands; until then all tabs share the sim's single shell session (one cwd, one ssh host). On first mount the tab prints the sim's MOTD lines if `exec('')` returns any, then the prompt. |
| Input line | rendered after the prompt with a block cursor; editing: `←`/`→`, `Home`/`Ctrl+A`, `End`/`Ctrl+E`, `Ctrl+←/→` word jump, `Backspace`, `Delete`, `Ctrl+U` kill to start, `Ctrl+K` kill to end, `Ctrl+W` kill previous word (only when keyboard-locked; else `Alt+Backspace`), `Ctrl+Y` yank. |
| Submit (`Enter`) | echo the prompt+line as a `prompt` line, push to history (not when empty or same as last), call `exec(line)`, append `result.lines`, apply `result.clear`, show `result.prompt`. Emit `terminal.command.submitted { tab, line, host, cwd }` (the sim emits `terminal.command` with the exit code). |
| Streaming | when `result.streamingJobId` is set, the input is hidden and the tab polls `poll(jobId)` every 100 ms (only while the sim isn't paused), appending lines until `done`; then the prompt returns. `Ctrl+C` → `interrupt(jobId)`, prints `^C`, emits `terminal.interrupted`. Without a running job `Ctrl+C` prints `^C`, abandons the current input and shows a new prompt. |
| `Ctrl+C` with a selection | copies (Windows Terminal behaviour) instead of interrupting. `Ctrl+Shift+C` always copies. `Ctrl+V` / `Ctrl+Shift+V` / right-click paste (in-game clipboard; multi-line paste asks `You are about to paste text that contains multiple lines… Paste anyway?` — Windows Terminal's warning). |
| History | `↑`/`↓` per session (seeded from `lab.workstation.shellHistory` for the workstation), `Ctrl+R` reverse-i-search `(reverse-i-search)'adb': adb connect 10.42.30.32:5444`. Available in both realism settings (GP §1.4). |
| Tab completion | `Tab` → `complete(partial)`: one candidate → complete in place (+ space or `/`); several → complete the common prefix, a second `Tab` prints the candidates in columns below and re-prints the prompt. Disabled (`Tab` inserts nothing) when `session.computer.tabCompletion` is false (Strict realism, GP §1.4). |
| Clear | `Ctrl+L` runs `clear` (and keeps the current input). |
| Scrollback | 5 000 lines per tab (older dropped), `Shift+PgUp/PgDn`, wheel; new output scrolls to the bottom unless the user scrolled up (then a `↓ New output` pill appears). |
| Selection | mouse drag selects text (character cells), double-click a word, triple-click a line. |
| Tabs | `+` / `Ctrl+Shift+T` (keyboard-locked) or `Ctrl+Shift+1` [game substitute] new tab; `Ctrl+Shift+W` close (locked) / tab `✕`; `Ctrl+PgUp/PgDn` (locked) or `Alt+[`/`Alt+]` [game] switch; `exit` in a local (non-ssh) session closes the tab; the last tab closing closes the window. Tab title follows `prompt()` (`user@host: cwd`). Emit `terminal.tab.opened`. |
| Embedded mode | `params.embedded` (IntelliJ Terminal tool window): no tab row, Darcula colours (`#2B2B2B` bg, `#A9B7C6` fg), tab title `Local`; `params.cwd` → executes `cd <cwd>` silently before the first prompt. |
| Prefill | `params.command` (missions/hints) puts text in the input line **without executing it**. |

### 5.3 Prompts (from `sim.terminal.prompt()`)

| Where | Prompt |
|---|---|
| workstation | `engineer@ws-17:~$ ` (`~/IdeaProjects/uia-remote` → `engineer@ws-17:~/IdeaProjects/uia-remote$ `) |
| Robot Pi (ssh `pi@10.42.10.11`) | `pi@wall-e:~ $ ` (Raspberry Pi OS default with the space before `$`) |
| Windows/Minix box (ssh `automation@10.42.20.1`, OpenSSH → cmd) | `automation@MINIX-01 C:\Users\automation>` |
| PowerShell inside it (`powershell`) | `PS C:\Users\automation> ` |
| VMs (ssh `automation@orca.lab.local`, `…@10.42.1.11`, `…@10.42.1.12`) | `automation@orca:~$ `, `automation@jenkins:~$ `, `automation@ollama:~$ ` |

### 5.4 Command catalogue (implemented by the sim; outputs exact where quoted)

"Req." lists the lessons/incidents that need the command; the rest are realism. Unknown commands print
`<cmd>: command not found` (bash, exit 127) / `'<cmd>' is not recognized as an internal or external command,`
`operable program or batch file.` (cmd). Pipes `|`, `&&`, `;`, redirection `>` (to a workstation file) and quoting
(`'…'`, `"…"`, `\` escapes) are supported by the sim's parser. `sudo` on Pis/VMs is passwordless [illus.]; a
privileged command without `sudo` prints `Failed to restart <svc>.service: Interactive authentication required.`.

**Workstation (`engineer@ws-17`)**

| Command | Output / behaviour | Req. |
|---|---|---|
| `help` | short bash-style list of supported commands [illus.] | — |
| `clear`, `pwd`, `cd [dir\|~\|..\|-]`, `ls [-l\|-a\|-la\|-h] [path]`, `cat`, `less`/`more` (=cat), `head`/`tail [-n N] [-f]`, `echo`, `whoami` (`engineer`), `hostname` (`ws-17`), `hostname -I` (`10.42.50.17`), `date` (`Mon Oct  5 09:41:07 EDT 2026`), `history`, `which`, `uname -a`, `exit` | standard GNU output over the workstation file system (`~/IdeaProjects/<repo>/…` clones, `~/Pictures`, `~/Downloads`, `~/Desktop`) | M12, M16 |
| `grep [-o\|-c\|-i\|-n\|-v\|-E\|-r] PATTERN [files]` (also on piped input), `wc -l`, `sort`, `uniq` | GNU semantics; `grep -c "TOTAL" window_dump.xml` → `0` on the Duo dump; `grep -o 'text="Register"[^>]*' window_dump.xml` → `text="Register" resource-id="…" class="android.widget.TextView" … bounds="[96,412][288,604]"` | M12 s5, M16 s4, INC64 |
| `ping [-c N] host` | iputils format: `PING 10.42.10.11 (10.42.10.11) 56(84) bytes of data.` / `64 bytes from 10.42.10.11: icmp_seq=1 ttl=64 time=1.84 ms` … / `--- 10.42.10.11 ping statistics ---` / `3 packets transmitted, 3 received, 0% packet loss, time 2003ms` / `rtt min/avg/max/mdev = …`; unreachable → `From 10.42.50.17 icmp_seq=1 Destination Host Unreachable` and `3 packets transmitted, 0 received, +3 errors, 100% packet loss, time 2034ms` (GP INC01 quotes the `0 received, 100% packet loss` part); without `-c` it streams until `Ctrl+C` | INC01–04 |
| `curl [-i] [-s] [-v] [-X M] [-H h] [-d body] [-o /dev/null] [-w "%{http_code}"] URL` | every REST surface of Sim §3.23: Orca (`/api/xy_touch`, `/api/card/*`, `/api/robots…`, `/management/health`), Pi `:8000/health` (`HTTP/1.1 200 OK` + `{"status":"ok","robot":"wall-e"}`), `/status`, Callus `:9000/status`, Ollama `/api/tags` / `/api/generate`, Jenkins JSON. `-i` prints the status line + headers (`Content-Type: application/json`, `Content-Length`, `Date`). Errors: `curl: (7) Failed to connect to 10.42.1.12 port 11434: Connection refused` (GP INC10), `curl: (28) Connection timed out after 10001 milliseconds`, `curl: (6) Could not resolve host: <h>`. | M05 s11, M09 s3–4, M10 s11, INC02, INC05, INC06, INC10, INC18, INC53, INC60, INC64 |
| `ssh [user@]host` | key auth (Sim §2.5.1) → Pi banner `Linux wall-e 6.6.31-v8+ #1 SMP PREEMPT Debian 1:6.6.31-1+rpt1 (2024-05-29) aarch64` + Debian notice + `Last login: Mon Oct  5 07:58:12 2026 from 10.42.50.17`; Academy shows `pi@10.42.10.11's password:` auto-filled first (Cur M05 s7); errors `ssh: connect to host 10.42.10.11 port 22: Connection timed out` (GP INC01), `… Connection refused`, `ssh: Could not resolve hostname x: Name or service not known`, wrong user `engineer@10.42.10.11: Permission denied (publickey).` | M05, M10 s10, INC01, INC02-C, INC08, INC10, INC19, INC28, INC54, INC56, INC60 |
| `adb …` | exactly Sim §3.15.1: `connect` (port defaults to 5555 → `failed to connect to '10.42.30.32:5555': Connection refused`), `devices` (`List of devices attached` + `10.42.30.32:5444\tdevice`), `disconnect`, `kill-server`, `start-server`, `version`, `-s <t> shell uiautomator dump` (`UI hierchary dumped to: /sdcard/window_dump.xml`), `-s <t> pull /sdcard/window_dump.xml` (`/sdcard/window_dump.xml: 1 file pulled. 0.4 MB/s (7351 bytes in 0.017s)`), `-s <t> shell input tap x y`, `… input swipe …`, `… input keyevent KEYCODE_HOME`, `… input text 0000`, `-s <t> exec-out screencap -p > x.png` (creates `~/x.png` → image ref, §1.6), `-s <t> shell getprop ro.product.model` / `ro.serialno`, `-s <t> logcat -d` (and streaming `logcat`), `-s <serial> tcpip 5444` (`restarting in TCP mode port: 5444`). Server start lines `* daemon not running; starting now at tcp:5037` / `* daemon started successfully`. `adb shell …` with several devices → `adb: more than one device/emulator`; none → `adb: no devices/emulators found`. | M12, M16 s4, INC24, INC27, INC28, INC35, INC42, INC64, DR19 |
| `git …` (inside a clone) | Sim §3.22.1: `clone <url>` (`Cloning into 'uia-remote'...` + `Receiving objects: 100% (412/412), done.`), `status` (`On branch main` / `Your branch is up to date with 'origin/main'.` / `Changes not staged for commit:` …), `log [-1] [--stat] [--oneline] [-n N]`, `show <sha>`, `diff [HEAD~1] [--stat] [path]` (unified diff), `checkout [-b] <b>` / `switch [-c] <b>`, `branch [-a]`, `add <paths\|.>`, `restore <path>`, `commit -m "<msg>"`, `push [-u origin <b>]` (protected-branch rejection `! [remote rejected] main -> main (protected branch hook declined)`), `pull`, `revert <sha>` | INC25, INC23, INC38 |
| `nano <file>` / `sudo nano <file>` | opens the nano editor UI (§5.5) on a workstation or remote file | INC19 |
| `tesseract <image> stdout [--psm 7]` [illus.] | OCR of the whole image via the sim's Tesseract model (Sim §3.12.2) — prints the text lines | — |
| `OLLAMA_HOST=10.42.1.12:11434 ollama list` / `ollama run llava "<prompt>" <image>` [illus.] | `NAME            ID              SIZE      MODIFIED` / `llava:latest    8dd30f6b0cb1    4.7 GB    3 weeks ago`; `run` streams the sim's response after ~6 s (Sim §3.21.2) | — |
| `nc -zv host port` [illus.] | `Connection to 10.42.20.1 9000 port [tcp/*] succeeded!` / `nc: connect to 10.42.20.1 port 9000 (tcp) failed: Connection refused` | — |

**Robot Pi (`pi@<rig>`)** — Raspberry Pi OS (Debian 12):

| Command | Output / behaviour | Req. |
|---|---|---|
| `uname -a` | `Linux wall-e 6.6.31-v8+ #1 SMP PREEMPT Debian 1:6.6.31-1+rpt1 (2024-05-29) aarch64 GNU/Linux` | M05 s8 |
| `systemctl status <robot-controller\|camera-stream\|adb-service\|cardprog\|ssh>` | Sim §3.14.1 exact blocks (`● robot-controller.service - LabSim Robot Controller (REST :8000)` … `Active: active (running) since …` / `Active: failed (Result: exit-code) since …`) | M05 s8, INC01-B, INC08, INC56 |
| `sudo systemctl start\|stop\|restart <svc>`, `systemctl is-active <svc>` | silent on success; service becomes ready after the Sim §2.5.2 delay | INC01-B, INC08, INC19, INC56 |
| `journalctl -u <svc> [-n N] [-f]` | `Oct 05 08:11:42 wall-e camera-stream[640]: Cannot open '/dev/video0': No such file or directory` (Sim §3.14.1) | INC08-B, INC56 |
| `df -h [/]` | `Filesystem      Size  Used Avail Use% Mounted on` / `/dev/mmcblk0p2   29G  6.1G   22G  22% /` (Cur M05 s9) | M05 s9 |
| `ps aux [\| grep -i wine]` | healthy line `pi   903  2.1  3.4 … wine C:\CardProg\CardProgrammer.exe` (Sim §3.14.1) | M05 s10, INC56 |
| `cat /etc/robot-controller/controller.yaml`, `sudo nano …` | Sim §2.5.3 file; nano saves through D6 → `controller.yaml` re-read on `robot-controller` restart | INC19 |
| `ls [path]`, `rm [-rf]`, `cp [-a]`, `mkdir` | over `Host.files` (`/opt/cardprog/wineprefix-golden/`, `/home/pi/.wine-cardprog/`) | INC56 |
| `adb devices`, `adb -s <serial> tcpip 5444` | USB-attached devices (`SIM-M3-000031\tdevice`) on the shelf Pi | INC28 |
| `vcgencmd get_throttled`, `dmesg \| tail`, `free -h`, `uptime`, `ip a`, `hostname`, `curl -i localhost:8000/health` | Sim §3.13.1 (`throttled=0x0` / `0x50005`), `hwmon hwmon1: Undervoltage detected!` | — |
| `sudo reboot` | `Connection to 10.42.10.11 closed by remote host.` / `Connection to 10.42.10.11 closed.` → back to the workstation | INC01 |
| `exit` / `logout` | `logout` / `Connection to 10.42.10.11 closed.` | all |

**Windows / Minix boxes (`automation@MINIX-01`, cmd.exe over OpenSSH)**

| Command | Output / behaviour | Req. |
|---|---|---|
| (login) | `Microsoft Windows [Version 10.0.19044.5011]` / `(c) Microsoft Corporation. All rights reserved.` [illus. build] | M10 s10 |
| `hostname`, `ipconfig`, `cd`, `dir [path]`, `type <file>`, `ping -n N host`, `curl …` | `dir C:\gort\cards\emv` lists `10/04/2026  10:00 AM               412 visa_std_dip.json` (Sim §3.14.6) | M10 s10, INC53, INC54 |
| `sc query Callus`, `sc start Callus`, `sc stop Callus` | Sim §3.14.2 exact (`STATE              : 4  RUNNING`, `1  STOPPED`, `2  START_PENDING`) | INC02-C |
| `schtasks /query /tn GortCardSync`, `schtasks /run /tn GortCardSync` | Sim §3.14.6 exact table and `SUCCESS: Attempted to run the scheduled task "GortCardSync".` | M10 s10, INC54 |
| `powershell` → `Get-PSDrive C`, `Get-Service Callus`, `Get-ChildItem <path>`, `exit` | `Name           Used (GB)     Free (GB) Provider      Root` / `C                  237.9          0.00 FileSystem    C:\` (Sim §3.14.3) | INC19 |
| `del C:\Windows\Temp\*` / `rmdir /s /q C:\Windows\Temp` | frees 2.0 GB on NUC-03 (`host.cleanDisk`) | INC19 (wrong-but-tempting) |
| `sc stop SecAgent`, deleting `C:\ProgramData\SecAgent\logs` | `[SC] OpenService FAILED 5:` / `Access is denied.` — recorded as `host.securityTamper` (GW11) | INC19 trap |
| `exit` | `Connection to 10.42.20.1 closed.` | all |

**VMs (`automation@orca`, `@jenkins`, `@ollama`, Ubuntu 22.04)**

| Command | Output / behaviour | Req. |
|---|---|---|
| `systemctl status <orca\|mysql\|jenkins\|ollama>` | `Active: inactive (dead)` when stopped (Sim §3.14.4–5) | INC10, INC60 |
| `sudo systemctl start\|restart <svc>` | silent; readiness per Sim §2.5.2 (mysql 5 s + Orca pool 15 s) | INC10, INC60 |
| `journalctl -u <svc> -n N`, `df -h`, `uptime`, `cat /opt/orca/application-prod.yml`, `curl -s localhost:8080/management/health`, `ollama list` (on ollama-vm) | Sim strings | — |

### 5.5 `nano` (GNU nano 7.2) — handled by the terminal UI

`nano <path>` / `sudo nano <path>` is intercepted **by the app** before `exec`: it resolves the file in the current
session's host (`lab.hosts[sshHostId].files[path]`, or a workstation path: repo clone file → `local.files`,
`workstation.files` text), and switches the tab into a full-screen nano view:
* line 1 inverse video: `  GNU nano 7.2                 /etc/robot-controller/controller.yaml                      ` (title
  centred; `Modified` at the right once edited);
* the buffer (no syntax colouring, nano default), cursor movement with arrows/PgUp/PgDn/Home/End;
* the status line (inverse, centred) for messages (`[ Read 13 lines ]`, `[ Wrote 13 lines ]`);
* two shortcut rows at the bottom: `^G Help  ^O Write Out  ^W Where Is  ^K Cut  ^T Execute  ^C Location` /
  `^X Exit  ^R Read File  ^\ Replace  ^U Paste  ^J Justify  ^/ Go To Line` (shortcut letters inverse).
* `Ctrl+O` → prompt `File Name to Write: /etc/robot-controller/controller.yaml` → `Enter` writes via
  `sim.host.writeFile(hostId, path, text)` (D6; workstation repo files via `sim.git.writeFile`) → `[ Wrote 13 lines ]`,
  emit `terminal.nano.saved`. `Ctrl+X` on a modified buffer → `Save modified buffer?  Y Yes  N No  ^C Cancel`.
  `Ctrl+W` search, `Ctrl+K`/`Ctrl+U` cut/paste line. A path that does not exist opens an empty `[ New File ]`.
  Without `sudo`, saving a root-owned path (`/etc/…`) fails `[ Error writing /etc/robot-controller/controller.yaml:
  Permission denied ]`. While nano is open it consumes every key including `Esc`.

---

## 6. GIMP (GNU Image Manipulation Program 2.10, single-window mode)

The team's coordinate-extraction tool (Ref §1, §5 "GIMP Coordinate Extraction"; Cur M16 s6; GP INC24, INC20/21,
DR05). Scope: open screenshots and webcam snapshots, draw a rectangle selection, read its **Position** and **Size**
in pixels, measure, zoom — not painting.

### 6.1 Look and feel (GIMP 2.10 "Dark" theme, Symbolic icons)

| Token | Value |
|---|---|
| Colours | panels `#454545`, docks/menus `#3c3c3c`, canvas surround `#2f2f2f` (checkerboard only under transparent pixels), text `#dcdcdc`, input fields `#2b2b2b` with `#5a5a5a` border, selected `#5c5c5c`, accent `#77a5d8` |
| Fonts | UI 12 px system stack; numbers in fields tabular |
| Title | `[r2d2_cfd] (imported)-1.0 (RGB color 8-bit gamma integer, GIMP built-in sRGB, 1 layer) 1280x720 – GIMP` (window title; no image: `GNU Image Manipulation Program`) |
| Layout | menu bar (`File Edit Select View Image Layer Colors Tools Filters Windows Help`); left dock: **Toolbox** (2-column icon grid, 26 px symbolic icons) above **Tool Options**; centre: image tabs (thumbnails, single-window mode) above the canvas with **rulers** (top/left, px, 18 px); right dock: **Layers** (one layer row: thumbnail + name `r2d2_cfd.png`) and **Pointer** dialog [optional tab]; bottom **status bar** |
| Selection | marching ants (black/white dashes, 4 px, animated 150 ms), handles appear on hover inside the rectangle (corner/edge areas highlighted `#ffffff30`) |

### 6.2 Opening images

* `File › Open…` (`Ctrl+O`) → `wm.pickFile({ filter: 'images', startDir: '~/Pictures' })` styled as GIMP's
  `Open Image` dialog (Places `Home`, `Desktop`, `Downloads`, `Pictures`; preview pane on the right with
  `1280 × 720 pixels`); `File › Open Recent` lists the last 5. Also `params.path` (Lab Cameras' **Open in GIMP**, Files'
  `Open with`). Supported: `.png`, `.jpg` under `~` whose `workstation.files` value is an image ref (§1.6).
* Pixels: `await getImage(ref)` (store or materializer); while materializing show `Opening '…/r2d2_cfd.png'` with a
  progress bar in the status bar.
* Each open image is a tab; title/emit `gimp.image.opened { path, ref, width, height }`; route
  `/image/~/Pictures/r2d2_cfd.png`. Closing a tab with no changes never asks (selections are not "changes" [sim]).
* Images are read-only: `File › Export As…`/`Overwrite` show GIMP's message `Export is disabled on this
  workstation image` [illus.]; Ctrl+S → same.

### 6.3 Tools and Tool Options

Functional tools (others in the toolbox are drawn but clicking them shows the status-bar message
`This tool is not available in GIMP-lite` [illus.] and keeps the current tool):

| Tool (shortcut) | Behaviour | Tool Options |
|---|---|---|
| **Rectangle Select** (`R`) — default | click-drag creates a selection (snapped to whole pixels, clamped to the image); drag inside to move (the cursor shows the move cross when Alt/inside), drag handles to resize; `Enter`/`Esc` commits/cancels the in-progress rectangle; arrow keys move the committed selection 1 px (`Shift` = 25 px); `Ctrl+Shift+A` Select None, `Ctrl+A` Select All | `Mode` (replace only, others disabled), `☐ Antialiasing`, `☐ Feather edges`, `☐ Rounded corners`, `☐ Expand from center`, `☐ Fixed Aspect ratio 1:1`, **`Position:`** two spin fields `412` `288` + unit `px`, **`Size:`** two spin fields `236` `44` + `px`, `Highlight`, `Guides: No guides`, `☐ Auto Shrink`. Editing Position/Size fields moves/resizes the selection (Enter or blur). Each field supports `Ctrl+C` (copies the number). |
| **Move** (`M`) | pans the view (layer moves are not allowed on these images) | — |
| **Zoom** (`Z`) | click zoom in, `Ctrl`+click zoom out, drag zooms to the rectangle | `Direction: Zoom in / Zoom out` |
| **Measure** (`Shift+M`) | drag a line; status bar shows `Distance: 236.0 pixels, Angle: 0.00°, 236 × 0 pixels` | `Orientation: Auto`, `☐ Use info window` |
| **Color Picker** (`O`) | click shows `R 255 G 255 B 255` / hex in Tool Options | `Sample average` |

**Copy selection as Pigeon JSON** [illus., the team's Script-Fu]: `Filters › Script-Fu › Lab › Copy selection as
Pigeon JSON` and the canvas context menu entry of the same name copy `"x": 412, "y": 288, "w": 236, "h": 44` to the
clipboard (§1.6) with the status message `Copied selection bounds: x 412, y 288, w 236, h 44`. Emit
`gimp.selection.copied { x, y, w, h, format: 'pigeon-json' }` (copying a single Position/Size field emits it with
`format: 'field'`).

Whenever a selection is committed or changed (mouse-up, field edit, arrow nudge), debounce 300 ms and emit
`gimp.selection.changed { path, ref, x, y, w, h }` (Cur M16 s6 "Selection within ±3 px", GP INC24, DR05).

### 6.4 View, status bar, pixels ↔ millimetres

* Zoom: `+`/`-` (`=`/`-` keys), `1` = 100 %, `2` = 200 %, `Shift+Ctrl+J` fit image in window, `Ctrl`+wheel zoom at the
  cursor, middle-drag or `Space`+drag to pan, wheel scrolls; `View › Zoom ▸` menu; images open at "fit" if larger
  than the canvas, else 100 %. Rendering uses `image-rendering: pixelated` above 200 %.
* **Status bar** (left→right): pointer coordinates `412, 288` (image px, integer, updates on move; blank outside the
  image), unit combo `px` (also `mm`, `in`), zoom combo `100%`, then the message area: tool hints
  (`Rectangle Select: Click-Drag to create a new selection`, `Click-Drag to move the selection mask, or Click to
  remove it`) or, with no hint, `r2d2_cfd.png (2.6 MB)`.
* **Pointer dialog** (`Windows › Dockable Dialogs › Pointer`): `Pixels X/Y`, `Units X/Y`, `Selection X/Y/W/H`. For
  images whose ref is an ADB **screencap** of a known device, an extra block [illus.] **`Device mm`**:
  `X 34.0  Y 74.0 mm (FLEX_3 @ 9.474 px/mm)` computed with the Device Type's px/mm (Sim §2.2) — the INC20/21
  "screencap + GIMP + the Device Type's px/mm" measurement path. A note under it: `GIMP's own "mm" unit uses the
  image print resolution (72 ppi), not the device's pixels per millimetre.` Webcam snapshots never show Device mm
  (perspective/scale differ — GP INC24's wrong move).

### 6.5 The image materializer (builder C)

Registered by `initComputer` (§1.6); lives with GIMP/Cameras. It must reproduce the frames the lessons measure:
R2-D2's CFD `TOTAL $10.83` label at `412, 288, 236 × 44` in a 1280 × 720 webcam frame (World App. B solved
projection; Sim §2.11), FLEX_3 `Payment Successful` at `208, 512, 304 × 40` in a 720 × 1280 screencap (Sim §2.10.2,
GP INC24). When live 3D capture is used, a one-time self-check compares the rendered label rect with the sim frame
model and logs a console warning if it is off by more than 4 px.

### 6.6 Keyboard

`Ctrl+O` open · `R`/`M`/`Z`/`O`/`Shift+M` tools · `Ctrl+A`, `Ctrl+Shift+A` · arrows nudge · `+`/`-`/`1`/`2`/
`Shift+Ctrl+J` · `Space`+drag · `Ctrl+Z`/`Ctrl+Y` undo/redo selection changes · `Tab` hides docks · `Esc` cancels an
in-progress selection or closes menus/dialogs (consumed); otherwise not consumed.

---

## 7. GitHub (`https://github.com/labsim-lab`)

The team's repositories (Ref §1: Gort, uia-remote, pigeon; Sim §2.12 adds orchestrator). GitHub's Primer UI in
**light** mode, 2024 layout. All data from `lab.repos` (Sim §1.11); every write goes through `sim.git.*` (D5).

### 7.1 Look and feel (Primer)

| Token | Value |
|---|---|
| Fonts | `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif` 14 px; code `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` 12 px |
| Colours | fg `#1f2328`, muted `#59636e`, canvas `#ffffff`, subtle `#f6f8fa`, borders `#d1d9e0`, accent `#0969da`, success `#1f883d` (buttons `#1f883d`, hover `#1c8139`), open `#1a7f37`, merged `#8250df`, closed `#d1242f`, attention `#9a6700` |
| Header | 64 px `#f6f8fa` with bottom border: simplified cat-mark 32 px (black), breadcrumb `labsim-lab / uia-remote` (bold repo), search pill `Type / to search`, icons (Copilot-less), `+▾`, notifications, avatar (player initials). Repo pages add the tab bar under it: `<> Code`, `⊙ Issues 0`, `⇄ Pull requests 2`, `▶ Actions`, `⊞ Projects`, `🛡 Security`, `📈 Insights` (only Code / Issues / Pull requests are functional; the others show GitHub's empty states: Actions `Get started with GitHub Actions` (decor), Projects `Welcome to Projects` … with no CTA function) |
| Syntax (light) | keywords `#cf222e`, strings `#0a3069`, comments `#59636e`, entity/function names `#8250df`, constants/numbers `#0550ae`, JSON keys `#0550ae`, tags `#116329` |
| Diff | additions `#dafbe1` (line-number cells `#aceebb`, `+` `#1a7f37`), deletions `#ffebe9` (`#ffcecb`), hunk header `#ddf4ff` with `@@ -12,7 +12,7 @@` in `#59636e` |
| Avatars | 20/32 px circles: team members' colours from `team.ts`, initials white; `jenkins-ci` a grey robot glyph |

### 7.2 Organisation and repository pages

* **Org** (`/labsim-lab`): org header (square logo with a four-leaf mark, name `labsim-lab`,
  `LabSim automation lab`), tabs `Overview`, `Repositories 4`; repo cards: name link, `Private` badge, description,
  language dot (`Java` `#b07219`, `JSON` `#292929`, `Go` `#00ADD8`), `Updated 2 days ago`.
* **Repo Code tab** (`/labsim-lab/<repo>`): top row — branch selector `⎇ main ▾` (dropdown with `Branches`/`Tags`
  tabs, filter, `View all branches`), `⎇ 3 Branches`, `⊘ 0 Tags`, `Go to file` (`t`), `Add file ▾` (`Create new
  file`, `Upload files` disabled), green **`<> Code ▾`**. Then the **latest commit bar** (avatar, author, message,
  `· 7a20f5b · 2 days ago`, `🕒 4 Commits`) and the **file table** (folder/file icon, name, last commit message touching
  it, relative time). Below: rendered `README.md` (markdown subset: headings, lists, code, links, tables). Right
  sidebar **About**: description, `📖 Readme`, `Activity`, `☆ 0 stars`, `👁 4 watching`, `⑂ 0 forks`.
* **Code ▾ popover** (Cur M13 s2): tabs `Local` | `Codespaces` (disabled); under `Local`: `Clone` with sub-tabs
  `HTTPS` | `SSH` | `GitHub CLI`, a read-only field with the URL (`https://github.com/labsim-lab/uia-remote.git`
  / **`git@github.com:labsim-lab/uia-remote.git`** (Sim §2.12 remote) / `gh repo clone
  labsim-lab/uia-remote`) and a copy button (`⧉` → `✓ Copied!` 2 s) → `wm.clipboard.write` and emit
  `github.cloneUrl.copied { repo, protocol, url }`; links `Open with GitHub Desktop` (disabled), `Download ZIP`
  (disabled). The SSH tab is preselected [illus. team habit].
* **Tree** (`/tree/<branch>/<path>`) and **blob** (`/blob/<branch>/<path>`): breadcrumb path with copy-path button; file
  header `Code | Blame` toggle (Blame shows per-line last commit [sim: per-file last commit]), `26 lines (22 loc) ·
  812 Bytes`, `Raw`, `⧉` copy, `⤓` download (disabled), `✎` edit (§7.6), `⋯`. Code view: line numbers (click →
  `#L12` highlight `#fff8c5`, shift-click range), syntax highlighting, wrap toggle. Opening a blob emits
  `github.file.viewed` (Cur M10 s9 "Navigate gort → cards/emv/visa_std_dip.json"); trees emit `github.tree.viewed`.
* Branch contents: `files` of the default branch head are `repo.files`; any other ref is reconstructed by replaying
  `commits` from the root to the branch head (`changes` path→contents, `null` = delete), memoised per sha.
  Branch names may contain `/` — the router resolves `/tree/<rest>` by the longest existing branch prefix.

### 7.3 Commits and branches

* **Commits** (`/commits/<branch>`): grouped `Commits on Oct 4, 2026`, rows: message (first line, bold link),
  avatar + `riley committed yesterday`, right: verified-less short sha button `c41d9e2` (copy) and `<>` browse files.
* **Commit** (`/commit/<sha>`): header message, author/time, `1 parent 9f02a1b commit c41d9e2`, `Showing 1 changed
  file with 13 additions and 0 deletions` + `Split | Unified` toggle, then per-file diffs (computed: parent tree vs
  commit tree; unified diff with 3 context lines). Emit `github.commit.viewed` (GP INC23 "the commit diff shows
  the removed line", INC25).
* **Branches** (`/branches`): sections `Default` (`main` with `🛡 Protected` label on `gort` and `orchestrator` — tooltip
  `Branch protection rule: Require a pull request before merging · Require approvals (1)`), `Your branches`, `Active
  branches`; columns branch, updated, check status, behind|ahead bars, PR link. `New branch` button → dialog
  `Create a branch` (`New branch name`, `Source` `main ▾`) → D5 `github.createBranch` (fallback through the local
  clone) → emit `github.branch.created`.

### 7.4 Pull requests

* **List** (`/pulls`): filter bar `is:pr is:open` + `Labels`, `Milestones`, green `New pull request`; header
  `⊙ 1 Open  ✓ 3 Closed`; rows: state icon (open green / merged purple / closed red / draft grey), title (bold link),
  labels, `#418 opened 3 days ago by jared` / `• Approved` / `• Changes requested` / `• Review required`, comment
  count. Sim fields: `state`, `verdict`, `comments`, `reviewers`, `approvals`, `createdMs`.
* **Compare** (`/compare/<base>...<head>`): `Comparing changes` with `base: main ▾` ← `compare: fix/… ▾`, mergeability
  `✓ Able to merge. These branches can be automatically merged.`, green `Create pull request` → the form: title
  (prefilled with the last commit message), description textarea (`Write` | `Preview`), right sidebar **Reviewers**
  (gear menu; the repo owner from Sim §3.22.2 — `jared` for gort, `morgan` for uia-remote/pigeon, `tate` for
  orchestrator — is pre-selected and labelled `(code owner)` [illus.]), `Assignees`, `Labels`; button `Create pull
  request ▾` (`Create draft pull request` disabled). Submit → `sim.git.createPullRequest(repo, title, body, head,
  'player')` → navigate to `/pull/<n>`; emit `github.pr.created` (Cur M09 s12 title `Add 5-option receipt
  coordinates for FLEX_4`, branch `fix/flex4-receipt-qr`).
* **PR view** (`/pull/<n>`, tabs `Conversation`, `Commits`, `Checks`, `Files changed +N −M`): title + `#418`, state badge
  (`Open` green / `Merged` purple / `Closed` red), `jared wants to merge 1 commit into main from fix/…`.
  *Conversation*: description card, timeline events in order (commits pushed, `requested a review from jared`,
  review events `jared approved these changes` with green check / `morgan requested changes` with red `±` and the
  review body + line comments shown with their diff hunk, comments, `merged commit c41d9e2 into main`, `deleted the
  fix/… branch`), then the **merge box**: checks summary (`All checks have passed — 1 successful check` /
  `Some checks haven't completed yet` amber / failure red) from `pr.checks` (`Jenkins / pr-build`), review summary
  (`Changes approved` / `Changes requested` / `Review required — At least 1 approving review is required by
  reviewers with write access.`), and the merge button: protected repos (gort, orchestrator) without approval →
  `Merging is blocked` + disabled button; approved → enabled `Merge pull request ▾` (`Create a merge commit`, `Squash
  and merge`, `Rebase and merge`) → `Confirm merge` → `sim.git.mergePullRequest(repo, n, 'player')` (emit `github.pr.merged`); unprotected repos
  (uia-remote, pigeon) allow merging without approval but show `Merge without waiting for requirements to be met`
  unchecked/disabled-styled text [illus. team practice]. Merged/closed PRs show the purple `Pull request successfully
  merged and closed` box. Bottom: comment box (`Write`/`Preview`, `Comment` button → `pr.comments` via D5; emit `github.pr.commented`).
  Opening the PR or switching tabs emits `github.pr.viewed`.
* **Files changed**: file tree on the left, per-file unified diffs (from `pr.files` before/after); hovering a line shows
  the blue `+` → inline comment form with textarea, **Saved replies** button (`Ctrl+.`): the team's saved replies
  [illus.] = Sim §3.22.2 reasons — `QA never modifies main` (`main-edit`), `Missing mandatory isScreenPresent()`
  (`missing-isScreenPresent`), `Missing waitForScreen() before the first click` (`missing-waitForScreen`),
  `portNumber must be 5444` (`port-5555`), `Screen classes must extend BaseTest` (`extends-BaseTest`); picking one
  inserts the text and tags the comment with that `reason`. Buttons `Add single comment` / `Start a review`. Emit
  `github.pr.lineCommentAdded`.
* **Review changes ▾** (green, top-right of Files changed): popover with summary textarea (saved replies available)
  and radios `Comment` / `Approve` / `Request changes` (`Approve`/`Request changes` disabled on your own PR:
  `Pull request authors can't approve their own pull request`) → `Submit review`. Approve → D5
  `reviewPullRequest` (fallback `sim.git.approvePullRequest`); Request changes / Comment → D5 (fallback: emit only).
  Emit `github.pr.reviewSubmitted { repo, number, verdict, body, comments[] }` (Cur M15 s11 approve `gort#418`,
  Cur M17 s8 request changes on `uia-remote#212` with reason `Missing mandatory isScreenPresent()`, GP INC34 three
  line comments + Request changes). Scripted NPC reviews arrive as timeline events and notifications
  (`jared approved your pull request #419`, `jared merged your pull request #419`).

### 7.5 Issues

`/issues`: GitHub's empty state `Welcome to issues!` text with `New issue` disabled-styled (the team tracks work in
LAB tickets) [illus.]. Counts `0`.

### 7.6 Editing on GitHub

`✎` on a blob (or `Add file › Create new file`) opens the web editor (`/edit/<branch>/<path>`): file name field, `Edit`
| `Preview` tabs, a code editor (monospace, line numbers, tab = 2 spaces for JSON), `Cancel changes` and green
`Commit changes…` → dialog `Commit changes`: `Commit message` (prefilled `Update RECEIPT_OPTIONS_5.json`),
`Extended description`, radios `Commit directly to the main branch` / `Create a new branch for this commit and start
a pull request` (name field prefilled `engineer-patch-1`) — on protected `main` the first radio is disabled with
`You can't commit to main because it is a protected branch.` → `Commit changes` / `Propose changes` → D5
`github.commitFile` (fallback through the local clone) → new branch flow lands on the Compare page. Emit
`github.file.committed`. (GP INC20's GitHub path; INC23's alternative to IntelliJ.)

### 7.7 Keyboard

`t` file finder (fuzzy list of paths, Enter opens), `/` focus search, `.` disabled (no github.dev), `y` canonical
permalink (replaces the branch with the sha in the URL), `l` jump to line (blob), `Ctrl+Enter` submits comment/review
forms, `Ctrl+.` saved replies, `Esc` closes popovers (consumed).

---

## 8. Lab Cameras (MJPEG stream viewer)

[illus. app; the real team opens the Pi MJPEG URLs in a browser or a viewer.] Every webcam is an MJPEG stream on a
camera host, `http://<host>:8081/stream.mjpg` (canon); Orca stores which URL each robot uses (Camera Stream URL, Ref
§3) — dedicated per Pi or **shared across 4 rigs** (Rack B `10.42.10.40`, Rack C `.60`, Rack E `.79`, the tethered
shelf `.20`; Sim §2.3). The viewer shows **what the URL serves**, so a robot whose Orca URL points at another rig's
camera shows that other rig (GP INC09).

### 8.1 Layout and look

Dark media-app style: background `#111214`, panels `#1b1d21`, text `#e6e6e6`, accent `#3ea6ff`, live dot `#ff3b30`.
* **Left sidebar** (280 px): search `Filter cameras…`; section **Streams** = distinct Camera Stream URLs from
  `lab.orca.robots` (non-empty), each row: host `10.42.10.40` (bold) + `:8081/stream.mjpg` (grey) and the robots that
  use it (`JOHNNY-5 · BAYMAX · SETI · ROSIE`), a status dot (green live / red unavailable / grey unknown). Rows sort by
  host IP. Then **Robots** (all robots with a URL, by HRN) — selecting a robot opens its URL with that robot's tile
  highlighted. Then **Recordings** (§8.6). Bottom: `Open URL…` input (any `http://…:8081/stream.mjpg`).
* **Main**: toolbar (`◀ ▶` previous/next stream, URL text field read-only with copy, `Snapshot (S)`, `Open in GIMP`,
  `Send to Ollama`, `Wall view`, fullscreen-in-window `F`), then the **player**: 16:9 frame (1280 × 720 logical,
  letterboxed in the window), overlays drawn by the app on top of the captured image: rig tag top-left (`R2-D2 ·
  10.42.10.14` white 14 px on `#00000080`, per tile on mosaics), game timestamp bottom-right `2026-10-05 09:41:07`
  (`fmtStamp`, white 13 px monospace on `#00000080`), `● REC` red top-right while the recorder is recording this
  camera (§8.6), `LIVE` badge top-left of the toolbar.
* **Wall view** (`/wall`): grid (2 × 2 up to 4 × 3) of all live streams at reduced fps with labels; click a tile to
  open. Emit `camera.wall.opened`.

### 8.2 Stream availability

The camera host is resolved from the URL's IP (`lab.hosts` by `ip`); availability per §0.5 with port 8081 and service
`camera-stream`. Unavailable → black frame with centred text exactly **`Stream unavailable — <url>`** (white 18 px,
GP §3.2) and a second line in `#ff6b6b` with the reason (`Connection refused`, `connect timed out after 10000 ms`,
`Could not resolve host`), plus a `Retry` button (re-evaluated automatically every 2 s). The sidebar dot turns red.
Opening a stream emits `camera.stream.opened { url, robotName, cameraId, ok, error? }` (GP INC01/INC04/INC08
symptoms; Cur M07 s11 "Watch the camera").

### 8.3 Webcam registry (apps.ts) — how pixels are produced

```ts
type CaptureCamera = Parameters<Engine['captureView']>[0];   // opaque to the computer
interface WebcamTile { rigId: string | null; label: string; camera: CaptureCamera; x: number; y: number; w: number; h: number }
interface WebcamFeed { cameraId: string; url: string; hostId: string | null; label: string; tiles: WebcamTile[] }
interface WebcamProvider { feeds(): WebcamFeed[] }
registerWebcamProvider(p: WebcamProvider | null): void;   // called by the world (D14)
getWebcamFeeds(): WebcamFeed[];  findWebcamFeed(url: string): WebcamFeed | null;
```
The world builds one virtual camera per webcam (World App. B: `cam.<rig>` gooseneck mounts with the solved R2-D2
projection; `cam.rack-b-mosaic` = 2 × 2 tiles; `cam.tethered`/`cam.adb` bench) and registers feeds keyed by URL.
A tile's `x, y, w, h` is its rectangle inside the 1280 × 720 frame (a dedicated camera = one tile `0, 0, 1280, 720`).
The app renders each tile with `engine.captureView(tile.camera, ctx, w, h)` into its rectangle of an offscreen
canvas, then draws the overlays. Fault states such as a de-aimed webcam are the world's job (it moves the camera).

### 8.4 Capture budget

Only the visible player (and wall tiles) render, never minimised/occluded windows (`document.visibilityState`,
window `minimized`, window fully covered → paused). Frame rate by quality preset (`progress.settings.quality`): low
2 fps at 640 × 360, medium 5 fps at 960 × 540, high/ultra 10 fps at 1280 × 720; wall tiles at half that fps and
320 × 180. Capture runs in `requestAnimationFrame` slots, at most one `captureView` per frame across the whole
desktop (round-robin), so the 3D view never stalls.

### 8.5 Synthetic frames (fallback and off-screen cameras)

When no registered feed serves the URL (off-screen rigs, sandbox, tests, or the world has not registered yet), the
app draws a **synthetic webcam frame** from the Sim §2.11.1 frame model: background `#1d1f22` with a subtle vignette,
each display in that camera's view drawn with `render2d.drawDeviceDisplay(ctx, lab, device, display, { pxPerMm: s })`
at `(ox, oy)` (fallback without render2d: the device outline `#0b0b0b` with the current screen name and button labels
from its layout in white), plus a 1 px grey frame per device and the tile tags. This is also what the materializer
uses for sim-made webcam refs (§1.6) and what the recorder stores when 3D capture is unavailable. Off-screen rigs
other than C-3PO show a `NO SIGNAL`-free placeholder: their device screen only, centred (Sim: "placeholder frame").

### 8.6 Snapshot and recordings

* **Snapshot** (`S` / toolbar; Cur M16 s5): grabs the current full 1280 × 720 frame (capture at full resolution once,
  regardless of the fps preset), asks for a file name in a small dialog `Save snapshot as` prefilled
  `~/Pictures/<rig>_<what>.png` (`r2d2_cfd.png` for R2-D2 — the Cur M16 name; otherwise `<rig>_<hhmmss>.png`), creates
  the image ref via D16 `sim.camera.snapshot({ url, path })` (fallback: build `img:webcam:<cameraId>:<physMs>` —
  `cameraId` from the feed or `cam-<rig>` per Sim §2.11.1 — and write the file entry with D6), stores the
  pixels under that ref (`putImage`), and toasts
  `Snapshot saved — ~/Pictures/r2d2_cfd.png` with actions `Open in GIMP` / `Show in folder`. Emit
  `camera.snapshot.saved { path, ref, url, robotName }`.
* **Recorder** (`startCameraRecorder()` in `apps/camera`, started by `initComputer`, runs while the desktop is closed):
  on `jenkins.buildStarted` with a `robotId` and on `test.localRunStarted` with a `robotName`, if that robot has a
  Camera Stream URL, start a recording `{ id, buildId | runId, label ('Java/uia-remote-regression-flex #4127'),
  robotName, url, startedMs, endedMs, result, frames[], events[] }`. Frames: 2 fps at 480 × 270 JPEG (quality 0.6)
  via `captureView` (synthetic frames when no feed), max 150 frames (75 s; older frames thinned to 1 fps). Events
  from the bus: `orca.xyTouch` (screen, button, x/y mm, mode, ok, `hitButton`), `rig.solenoidTap`, `device.touched`,
  `device.screenChanged`, `runner.step`, each stamped with its frame index. Stop on the matching
  `jenkins.buildFinished` / `test.localRunFinished` (+2 s tail). Keep the last 8 recordings (memory cap ≈ 20 MB).
  The recorder never renders when the quality preset is `low` and no Lab Cameras window is open — it then records
  events plus one synthetic frame per event.
* **Recordings view** (`/recordings`, `/recording/:id`): list newest first `#4127 · Java/uia-remote-regression-flex ·
  WALL-E · FAILURE · 09:41` (result chip). Player: frame area + transport (`⏮ ⏯ ⏭`, scrubber with **event markers**:
  taps green when `hitButton === button`, red when `hitButton` is `null` or another button, blue for screen changes;
  speed `0.5× 1× 2×`; `Space` play/pause, `←/→` step). Clicking a tap marker opens **Tap analysis** [illus.]: the
  device screen at that moment (synthetic render of the screen recorded in the event) with the commanded point as a
  red crosshair and, if the sim reported it, the hit button outlined — plus the raw line
  `xy_touch eve RECEIPT_OPTIONS_5/Print → PHYSICAL_TAP (34.0, 71.0) · hit: none`. Opening a recording emits
  `camera.recording.opened`; playing through the last frame (or scrubbing to the end and pressing play until it stops)
  emits `camera.recording.finished` (Cur M09 s9 "Clip watched to end", M15 s10 "Clip viewed", GP INC22/INC32
  "recorded playback").
* `params.recordingBuildId` opens the recording for that build directly (missions, Jenkins build page link
  `▶ Camera recording` [illus.] next to `Console Output`).

### 8.7 Keyboard

`S` snapshot · `F` fill window · `W` wall view · `←/→` previous/next stream (live) or step (recording) · `Space`
play/pause · `[`/`]` speed · `Esc` exits fill mode (consumed) else not consumed.

---

## 9. Ollama WebUI (`http://10.42.1.12:3000`) and the Ollama API

Ollama runs on the GPU blade's `ollama-vm` at `10.42.1.12:11434` with the vision model `llava:latest` (canon; Sim
§3.21.2) as a **proof of concept** (Ref §1). The browser app is an Open-WebUI-like chat [illus. — the PoC's web
front-end on the same VM, port 3000]; the raw API is reachable in the browser and with `curl` (§5.4).

### 9.1 Look and feel

Dark: page `#171717`, sidebar `#0d0d0d` (260 px), text `#ececec`, muted `#9b9b9b`, input `#2f2f2f` radius 24 px,
user bubbles `#2f2f2f` radius 18 px (right-aligned, max 70 %), assistant messages without bubble (left, model avatar
= llama glyph in a white circle, name `llava:latest` 13 px bold), accent `#ffffff` buttons, focus ring `#5b8def`.
Font system UI 15 px; code blocks `#0d0d0d` monospace.

### 9.2 Layout and behaviour

* **Sidebar:** `✎ New Chat`, `Search`, chat history list grouped `Today` / `Previous 7 days` (session-local, titles
  from the first prompt's first 40 chars), user row at the bottom `Engineer`.
* **Top bar:** model selector `llava:latest ▾` (dropdown lists `lab.ollama.models`; empty + red text `No models
  available` when the server is unreachable; picking one emits `ollama.model.selected`), `⋯`.
* **Empty state:** logo + `How can I help you today?` + 2 suggestion cards [illus.]: `Check a receipt image` (prefills
  the Cur M17 prompt), `Describe this webcam frame`.
* **Composer:** `+` (attach) opens `wm.pickFile({ filter: 'images', startDir: '~/Downloads' })` — attached images
  appear as 64 px thumbnails with `✕` above the textarea (one image max [sim]); textarea `Send a Message`
  (auto-grows to 8 lines, `Enter` sends, `Shift+Enter` newline); send button `↑` (disabled when empty or no model).
  `params.prompt` / `params.attach` (missions; Cur M17 s5 prefilled prompt **exactly** `Check this receipt image. Is
  the layout complete (merchant header, items, subtotal, tax, tip, total) and is the tip math correct? Answer PASS
  or FAIL with one reason.` and `walle_receipt_0912.jpg`) prefill without sending. Attaching emits
  `ollama.image.attached { path, ref }`.
* **Send:** user message appears (with the thumbnail); `sim.ollama.ask(model, prompt, imageRef, 'player')` → assistant
  placeholder with three pulsing dots while `lab.ollama.requests[id].state == 'running'` (≈ 6 s physical, +2 s on the
  first request after a restart); when `done` the response text is revealed with a typing animation (~60 chars/s,
  click to skip) — the text is the sim's, verbatim (`FAIL — tip of 18% on $42.00 should be $7.56; the receipt shows
  $7.65.`). Emit `ollama.prompt.sent` on send and `ollama.response.received` when shown completely.
* **Under each response:** icons `⧉ Copy`, `↻ Regenerate` (asks again with the same input), `👍`, `👎`, and the PoC
  **review tags** [illus.] `Layout incomplete`, `Tip math error`, `Total error`, `Looks correct` (toggle chips, one
  active). Choosing one emits `ollama.response.flagged { requestId, flag }` (Cur M17 s5 "player ticks 'Tip math
  error'"). The UI never says whether the model was right (`correct` is ground truth for missions only, GP INC57).
* **Image viewer:** clicking a thumbnail opens a lightbox (zoom with wheel) — the way to read the actual receipt
  (GP INC57 "read the real receipt").

### 9.3 Availability

VM down → browser error page (§0.5). VM up but `ollama` service down (GP INC10) → red banner at the top of the chat
**`Model server unreachable`** + `http://10.42.1.12:11434 — Connection refused` and a `Retry` link; sending shows the
assistant error card `Model server unreachable`. Raw API in the browser: `http://10.42.1.12:11434/` → plain text
`Ollama is running`; `/api/tags` → JSON (Sim §3.21.2) in Chromium's JSON viewer (`Pretty-print ☐`) — via D9.

### 9.4 Keyboard

`Enter` send · `Shift+Enter` newline · `Ctrl+Shift+O` new chat · `Ctrl+Shift+;` copy last response [Open WebUI] ·
`Esc` closes lightbox/menus (consumed).

---

## 10. LabSim robot dashboard and the status tablet

The front status tablet of every touch rig (World §5, IMG-T) and the "global LabSim control dashboard" that "locks out
external users when tests are active" (Ref §6) are **the same UI**. One component, `DashboardSurface`
(`apps/dashboard/`), renders the World §5 layout and is hosted twice:

Action names are per host: the tablet overlay emits `tablet.tab.opened`, `tablet.command.sent`,
`tablet.lockout.shown`; the desktop app emits `dashboard.tab.opened`, `dashboard.command.sent`,
`dashboard.lockout.shown`, `dashboard.robot.selected` (same payloads; written `<host>.…` below).

| Host | Where | Reachability | `app` in events |
|---|---|---|---|
| `TabletDashboard` overlay | ui overlay `{kind:'tablet', robotId}` after `E` on `rig.<id>.tablet` (World §5.5) | the tablet talks to its Pi over **USB** (Sim §3.7.5 / GP SR04): grey only when the controller itself is unreachable | `tablet` |
| `DashboardApp` window | desktop app `LabSim Robot Dashboard` [illus. desktop client of the same dashboard] | over the **network** from `ws-17` to `http://<pi>:8000` (§0.5): a network-only fault (Ethernet unplugged, INC04) makes the desktop dashboard unreachable while the physical tablet stays green — a diagnostic contrast | `dashboard` |

### 10.1 Logical canvas and scaling

The surface is a 1280 × 800 logical px box (World §5: the tablet's 172.3 × 107.7 mm active area). It is laid out in
DOM with absolute positions **exactly at World §5 rects**, wrapped in a `transform: scale(k)` container that fits the
host (crisp text, no canvas). Constants come from `@/render2d/tabletLayout` when that module exists (World §5: "one
constants module"); otherwise `apps/dashboard/layout.ts` copies the World §5.1–§5.4 tables verbatim. Font
`UI_SANS` = the system UI stack.

### 10.2 Header, tabs, banner

| Element | Spec (World §5.1, §5.4) |
|---|---|
| Header (0, 0, 1280, 112) | gradient by banner: green `#1fcf4f → #2bd862 → #3fdc9a → #52c9d6 → #5ab7ee`; yellow `#f2c12e → #f7d86a → #f2e08c`; grey `#8b9099 → #a3a8b0`; red `#e04b3c → #ef7a5a`. Banner change animates a 300 ms left-to-right wipe. |
| Robot name | `rig.tablet.hrnShown` (falls back to Orca `humanReadableName`): x 150, baseline 82, 800-weight 64 px `#121212`, shrink to fit 380 px — shows `JONNY-5` while Orca has the typo and the tablet has received it (Cur M07) |
| Logo | four-leaf glyph + `lab` wordmark, `rgba(255,255,255,.55)` at x 560–860 |
| Status line | x 1000, baseline 46: `Status: ` + status text — **the sim's string** (`rig.bannerText` / `rig.tablet.statusText`: `Status: OK`, `Status: LOCK RELEASED — PARK REQUIRED`, `Status: CONTROLLER UNREACHABLE`, `Status: MOTION FAULT — HOMING FAILED (X limit not found)`); 22 px `#1a1a1a`, shrink to 15 px, wrap to 2 lines |
| Board line | x 1000, baseline 76: `Brainbox v6` (`rig.tablet.brainbox`) |
| Tabs (y 112–160) | `Robot` (0, 112, 427, 48), `Robot Control` (427, 112, 426, 48), `Motion Control` (853, 112, 427, 48); unselected `#6aa0e0` white 22 px, selected `#18803c`. Selecting a tab updates the surface's local tab (and, on the physical tablet only, nothing else in the sim [sim]); emit `<host>.tab.opened { robot, tab }` (Cur M04 s6 "All three tabs opened"). Keys `1`/`2`/`3`. |
| Content panel | (40, 160, 1200, 616) `#1d2741`; frame `#6aa0e0` around it |
| Heartbeat dot | (782, 178) r 7: `#39e46b` pulsing 1 Hz while reachable, `#6b7280` otherwise |
| Grey state | panel shows `Reconnecting to robot controller…` 26 px `#c9d2e3` + spinner; buttons hidden |
| Yellow state | Park group buttons pulse (outline α 0.4 ↔ 1, 1 Hz) |
| Colour-blind glyphs | when `progress.settings.colourBlind !== 'off'`: prefix the status with `●` (green) `▲` (yellow) `■` (grey) `✖` (red) (World §5.4) |

### 10.3 Motion Control tab (exact, World §5.2)

Group labels (bold 22 px white, baseline 330) and buttons (radius 10, label 26 px weight 500, blue `#2b95f2 →
#1a7fd6` / yellow `#dcc35a → #cbb044` vertical gradients):

| Group | Buttons (rect) → `sim.rig.command(rigId, <RigCommandName>, actor)` |
|---|---|
| **Steppers** | `Enable` blue (108, 342, 150, 64) → `steppers.enable` · `Disable` yellow (108, 412, 150, 64) → `steppers.disable` |
| **Park** | `Park All` blue (312, 342, 150, 64) → `park.all` · `XY` yellow (312, 412) → `park.xy` · `X` yellow (312, 482) → `park.x` · `Y` yellow (312, 552) → `park.y` (all 150 × 64) |
| **Dip** | `In` blue (530, 342, 104, 64) → `dip.in` · `Out` yellow (530, 412, 104, 64) → `dip.out` |
| **Tap** | `In` blue (722, 342, 100, 64) → `tap.in` · `Out` yellow (722, 412, 100, 64) → `tap.out` |
| **Phone** | `Forward` blue (880, 342, 150, 64) → `phone.forward` · `Back` yellow (880, 412, 150, 64) → `phone.back` · `Push` / `Power` / `Button` (3 lines 24 px) blue (880, 482, 150, 134) → `phone.pushPower` |
| **Solenoid** | `Down` blue (1073, 342, 118, 64) → `solenoid.down` · `Up` yellow (1073, 412) → `solenoid.up` · `Lower` blue (1073, 482) → `solenoid.lower` · `Raise` yellow (1073, 552) → `solenoid.raise` (all 118 × 64) |

State highlights (4 px white inner outline + 10 % brighter) mirror the rig: `Disable` when `!steppersEnabled`, Dip/Tap
`In`/`Out` by `dipArm`/`tapArm` (`extended`/`extending` → In), Phone `Forward`/`Back` by `phonePusher`, Solenoid
`Down`/`Up` by `solenoid.down`. Press: darken 18 % + 2 px down for 120 ms + `engine.audio.play('ui-click')`; the
command is sent with actor `'player'`; result `ok:false` → the button flashes `#e04b3c` 200 ms + `ui-fail`, and the
sim's error is shown as a 2 s toast strip at the bottom of the panel (`Steppers disabled`, …; `LOCKED` is never shown —
the lockout overlay handles it). Emit `<host>.command.sent { robot, command, ok, error? }` (the sim emits
`rig.command` too). MOTOR off ⇒ the sim accepts commands and nothing moves (GP INC13-B) — the UI shows no error.

### 10.4 Robot and Robot Control tabs (World §5.3)

* **Robot:** key/value list at x 80/420 (labels 22 px `#9fb3d6`, values 24 px white, pitch 48): `Name` (`wall-e`),
  `Human Readable Name`, `Orca status` (chip, Orca colours), `Device` (`FLEX_3 · SIM-F3-000011`), `Device IP`
  (`10.42.30.11:5444`), `Robot Pi` (`10.42.10.11`), `Camera` (stream URL, ellipsised), `Last health check`
  (`09:35:00 · 200 OK`), `Magnetic lock` (`ENGAGED` / `RELEASED`). Mini-map box (760, 200, 440, 300): the covered
  display's outline to scale, crosshair + 12 px dot at `(gantry.xMm, gantry.yMm)` (green; yellow when the lock is
  released), text `X 12.0 mm   Y 58.5 mm` (baseline 540) and `Home = limit switches (0,0)` (baseline 572). The dot
  animates with the gantry (read `gantry.xMm/yMm` each frame via a store subscription throttled to 20 Hz).
* **Robot Control** [illus.]: jog pad centred (400, 440) — blue arrows 110 × 80 (`▲` −Y, `▼` +Y, `◀` −X, `▶` +X) →
  `move.to` with `{ xMm, yMm }` = current ± step (clamped to travel), green centre `Tap` → `tap.at` at the current
  position; step segmented control (220, 600, 360, 56) `0.1 mm | 1 mm | 10 mm` (default 1 mm); yellow 300 × 70
  buttons at x 670: `Go to (0,0)` (y 300) → `move.to {0,0}` (a move, **not** homing — it does not re-engage the lock),
  `Go to centre` (y 390) → `move.to {w/2, h/2}`; blue `Wake screen` (y 480) → `phone.pushPower`; readout `X … Y …`
  at (670, 600).

### 10.5 Lockout overlay (Ref §6)

When `rig.dashboardLocked` (Sim §3.7.6): overlay (0, 112, 1280, 688) `rgba(8,12,22,.80)`, padlock glyph 96 px white at
(640, 330), line 1 **`TEST IN PROGRESS — CONTROLS LOCKED`** bold 34 px white (baseline 450), line 2 the holder:
`Java/uia-remote-regression-flex #4120` (from `robot.checkout` → build job/number) or `Local run · TaxTest (ws-17)`
[illus.] for local runs (`rig.lockedBy`), 24 px `#b9c6dc` (baseline 492), line 3 `Checked out via Orca · unlocks when
the build finishes` 20 px `#8ea0bf` (baseline 528). Any click on the panel: overlay shakes ±6 px 200 ms + quiet
`ui-fail`; **no command is sent**; emit `<host>.lockout.shown { robot, holder }` on the first display per lock period
and on every blocked click (`blockedClick: true`) — Cur M01 s6 "Overlay has been shown once", GP INC12 counts
`motionCommandsDuringRun` from sim state.

### 10.6 Desktop dashboard app (`dashboard`)

Window `LabSim Robot Dashboard` [illus.]: left list (240 px, `#151b2c`, white text) of robots with a gantry (touch and
standalone rigs, all 42-pool rigs that have one; grouped by `location` rack), each row: banner-colour dot, HRN,
`Locked` padlock when `dashboardLocked`; search box. The right side shows a thin address strip
`http://10.42.10.11:8000/dashboard` (grey; red with the §0.5 error when unreachable: `Controller unreachable —
http://10.42.10.13:8000 (connect timed out after 10000 ms)`) and the `DashboardSurface` scaled to fit. Selecting a robot
emits `dashboard.robot.selected` and navigates to `/robot/<name>/<tab>`. Unreachable → the surface shows its grey state.

### 10.7 Tablet overlay (`TabletDashboard`)

Full-screen ui overlay: the room view stays visible (dimmed `#000a`); a dark tablet bezel (radius 28 px, 24 px
border `#121417`, inner glass edge) holds the surface scaled to ~80 % of the viewport height. Pointer is unlocked;
clicks map to the logical rects. `Esc` (or the `✕ Close (Esc)` [game] chip above the bezel, or walking away — ui's
job) → `onExit` / fallback. The overlay hosts `DashboardSurface` with `host='tablet'` and the USB reachability rule.
The quip strip of World §5.1 is **not** rendered by this app (gameplay layer; ui may draw it).

---

## 11. LabChat (Slack-like team chat)

Where tickets, mentor messages, alerts and coworker replies arrive (GP §2.3.4, SR18; Sim §2.14). Data:
`lab.chat.messages` (channel, author, text, atMs, ticketId) and `lab.chat.unread`; writes `sim.chat.post`,
`sim.chat.markRead`.

### 11.1 Look and feel

Sidebar `#1a1d29` (white/`#d1d2d3` text, active item `#1164a3`, unread items bold white), workspace header
`LabSim Automation ▾` 18 px bold; message pane `#ffffff`, text `#1d1c1d` 15 px, names bold, timestamps `#616061` 12 px,
hover row `#f8f8f8`; mentions `@engineer` highlighted `#fff3c4`; links `#1264a3`; code spans `#e01e5a` on `#f6f6f6`
(monospace), code blocks `#f8f8f8` with border. Avatars 36 px rounded squares (team colours, initials); bots
(`orca-health-check` → `Orca`, `jenkins-bot` → `Jenkins`) get an `APP` badge.

### 11.2 Layout

* **Sidebar:** `Threads` (decor), `Mentions & reactions` (messages containing `@engineer` or the player's name),
  **Channels** `# lab-automation`, `# orca-alerts`, `# jenkins` (from distinct `channel` values starting with `#`),
  **Direct messages** (`dm:<key>` channels plus all team NPCs: Jared, Tate, David, Morgan, Riley, Sam, Alex — names
  from `team.ts`), each with an unread badge (`lab.chat.unread[channel]`).
* **Channel header:** `# orca-alerts` + topic (`#lab-automation`: `Lab ops, tickets, coworkers`; `#orca-alerts`:
  `Health-check failures and recoveries (Orca)`; `#jenkins`: `Red builds`) [illus.].
* **Messages:** grouped by author within 5 minutes, day dividers (`Today`, `Yesterday`), emoji shortcodes rendered
  (`:red_circle:` 🔴, `:large_green_circle:` 🟢, `:white_check_mark:` ✅, `:warning:` ⚠️, `:wave:` 👋), mrkdwn subset
  (`*bold*`, `_italic_`, `` `code` ``, fenced blocks, `<url|label>`, bare URLs → links that open the right app via the
  browser host table, §1.4). Ticket-linked messages show a small `LAB-2231` chip.
* **Composer:** `Message #lab-automation` / `Message Riley`; `Enter` sends (`sim.chat.post(channel, 'player', text)`),
  `Shift+Enter` newline; formatting toolbar decor; emit `chat.message.sent { channel, text }`.
* **Quick replies** (§11.4): chip row above the composer.
* Opening a channel calls `sim.chat.markRead(channel)` and emits `chat.channel.opened` (route `/channel/lab-automation`,
  `/dm/riley`).

### 11.3 Notifications

New messages not from the player in a channel that is not on screen → desktop toast (§1.5, title `#orca-alerts` /
`Riley`, body = first line) and the taskbar badge; DMs from mentors also play `ui-ticket`.

### 11.4 Quick replies (missions bridge)

`setChatReplyProvider((ctx) => ChatReplyOption[])` (apps.ts). `ctx = { channel, lastMessage, ticketIds }`. LabChat calls
it whenever the open channel or its last message changes and shows the returned options as chips (`R_WAIT_PING —
Orca hasn't re-pinged yet; it'll clear at the next health check`). Clicking a chip posts `option.text` with
`sim.chat.post(channel, 'player', text, option.ticketId)` and emits `chat.reply.chosen { channel, ticketId, replyId,
messageId }` — this is how GP ticket replies (`R_WAIT_PING`, `R_OFFLINE`, `R_FIXED`, `R_LOCKOUT`, `R_WAIT`,
`R_FALSE_POSITIVE`, `R_DUO_BLIND`, INC58/INC62 `R1`–`R4`) and "ask before touching a Reserved rig" (INC48: `Still
using EVE?`) are given. Without a provider, no chips.

### 11.5 Keyboard

`Enter`/`Shift+Enter` · `Alt+↑/↓` previous/next channel · `Alt+Shift+↑/↓` next unread · `Ctrl+K` quick switcher
(`Jump to…` channel/person) · `Esc` marks the channel read (consumed only while the composer has focus and is empty
— otherwise not consumed).

---

## 12. Small apps

### 12.1 MagStripe Reader (`cardreader`) [illus. utility]

The desk's USB magstripe reader (World §9.2 `desk.player.card-reader`; GP INC55: "swipe the Visa test card through the
USB card-reader utility → it prints Track 1 and Track 2"). Windows classic utility look: `#f0f0f0` window, 12 px
Segoe UI, group boxes.
* Group `Reader`: `USB HID MSR (keyboard wedge) — Connected` with a green dot [illus.]; status line `Waiting for card
  swipe…` (pulsing).
* Group `Raw data`: read-only multiline monospace box showing what the reader typed.
* Group `Parsed tracks`: `Track 1` / `Track 2` / `Track 3` read-only fields (monospace), each with a `Copy` button;
  buttons `Copy Track 1 + 2` (the format Orca stores: Track 1 immediately followed by Track 2, e.g.
  `%B4111111111111111^SIM/VISA^30121010000000000000?;4111111111111111=3012101000000000?`), `Clear`.
* On `workstation.cardSwiped { card }` (world, D14; also a `Simulate swipe ▾` [game] menu for sandbox/tests): beep
  (`engine.audio.play('device-beep')`), fill the fields from the **physical card's** tracks — `test-card-visa` = Sim
  §2.9 `VISA_STD_SWIPE` canonical tracks (never the possibly corrupted Orca row, GP INC55 `canonicalTracks`);
  `test-card-interac` = `%B4506440000000017^SIM/INTERAC^30121010000000000000?;4506440000000017=3012101000000000?`
  [illus.] — `Track 3` empty, status `Swipe OK — 2 tracks read`. If the window is closed it opens itself (focus) and
  toasts. Emit `cardreader.swiped { card, track1, track2 }` and `cardreader.copied { field, text }`.

### 12.2 File Explorer (`files`)

Windows-11 Explorer look (light, `#f9f9f9` nav pane, `#ffffff` content, 13 px): address bar breadcrumb (`This PC ›
Home › Pictures`), search box, command bar (`New` disabled, `Sort`, `View`); nav pane `Home`, `Desktop`, `Downloads`,
`Pictures`, `IdeaProjects`, `Recycle Bin`; details view `Name` · `Date modified` · `Type` · `Size`. Data = the §1.6 file
union. Double-click: images → GIMP (`params.path`); files inside a clone → IntelliJ (`params.repo/file`); text files →
a read-only preview pane. Context menu `Open with ▸ GIMP / Ollama WebUI / IntelliJ IDEA`, `Copy as path`. Emit
`files.opened { path, with }`. Route `/dir/<path>`.

### 12.3 Browser (`browser`) — new tab and raw pages

The generic Chromium window for anything the host table does not own (§1.4): **New tab** page (`/newtab`): centred
search box (lab URLs only; typing a non-URL shows `No internet access` [sim: the lab VLAN has no internet except
github.com]) and shortcut tiles for the bookmarks. **Raw pages** (any `http(s)://…` URL): fetched with D9
`sim.net.request('GET', url)`; JSON bodies shown in Chromium's raw viewer (monospace, `Pretty-print ☐` checkbox),
`text/plain` as monospace, `stream.mjpg` hands off to Lab Cameras, binary (`/snapshot.jpg`) shows the image via the
materializer. Without D9 every raw URL shows the §0.5 "can't be reached" page with `ERR_NAME_NOT_RESOLVED`. Route = the
full URL.

---

## 13. Lesson and incident hooks (what missions open and wait for)

Columns: **Open** = the `requestOpenApp(app, params)` a mission issues when the step starts (Cur §2.0 "the named
app opens focused"); **Done when** = the recommended completion signal. *Sim:* = a sim-state predicate (preferred,
Cur §2.0); `action` = an `app.action` (Appendix B) with the payload filter shown; `route` = an `app.navigated`
match (Appendix A). Where Cur's condition is a UI observation, the app action is the only signal.

### 13.1 Academy (Cur §2)

| Step | Open | Done when |
|---|---|---|
| M05 s7–s11 | `terminal` | *Sim:* `terminal.command` events on host `pi-wall-e` with lines matching `ssh pi@10.42.10.11` (then `ssh.connected {hostId:'pi-wall-e'}`), `uname -a`, `systemctl status robot-controller`, `df -h /`, `ps aux \| grep -i wine`, `curl -i http://10.42.10.11:8000/health` (exit 0); flag orders/trailing spaces normalised by missions |
| M06 s5 | `orca` `{route:'/robot'}` | `orca.robots.filtered` with `status == ['AVAILABLE']` and no other filter |
| M06 s8 | `orca` | *Sim:* `orca.robots[eve].status == 'CONNECTION_FAILED'` (button: `orca.healthCheck.forced`) |
| M06 s9 | `orca` `{route:'/robot/2/view'}` | `orca.robot.notesViewed {name:'eve'}` **and** `orca.robot.checkoutAttempted {name:'eve', ok:false}` |
| M06 s11 | `orca` | *Sim:* baymax `OFFLINE` and a health run whose lines contain `baymax  SKIPPED (Offline)`; plus `orca.healthLog.viewed` after that run |
| M06 s12 | `orca`, `jenkins` | *Sim:* WALL-E `RESERVED` → `robot.checkoutWaiting` for the build → WALL-E `AVAILABLE` → `robot.checkedOut {name:'wall-e'}` |
| M06 s13 | `jenkins` `{route:'/job/Java/job/uia-remote-regression-flex/build'}` | *Sim:* named build on rosie finished and `rosie.status == 'UNAVAILABLE'` without a player status change |
| M07 s2 | `orca` `{route:'/robot/5/edit'}` | `orca.robot.editOpened {name:'johnny-5'}` |
| M07 s3, s6, s8, s9 | `orca` | *Sim:* HRN `JOHNNY-5` & Name unchanged; new FLEX_2 device linked & old row intact (`orca.device.created`); `tapUrl`; MFD/CFD set |
| M07 s11 | `camera` `{robot:'bumblebee'}`, `orca` | `camera.stream.opened {robotName:'bumblebee'}` (or Rack A recording) then *Sim:* `offsetYMm == 0` and an `orca.xyTouch` with `hitButton === button` after `orca.screenLocation.testTap` |
| M08 s3 | `orca` `{route:'/robot-capability?tab=documents&robot=wall-e'}` | `orca.capabilities.viewed` for `wall-e` **and** `rosie` |
| M08 s5 | `intellij` `{repo:'gort', file:'go-sdk/tests/sale_receipt.json'}` | *Sim:* the clone's file parses and `capabilities.printer === true` (`intellij.file.saved`); the job sees it only after commit + push (gort `main` is protected → branch + PR, or Jared merges) |
| M08 s6 | `jenkins` `{route:'/job/Java/job/uia-remote-regression-flex/configure'}` | `jenkins.script.lineClicked` whose `text` contains `def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch: true]` |
| M08 s7 | `orca` `{route:'/merchant-config'}` | `orca.merchant.editOpened {name:'GO-SDK-US-01'}` |
| M08 s9, s11 | `orca` → `jenkins` | *Sim:* merchant `apiKey`, build env, Laz build `SUCCESS` |
| M09 s2 | `orca` `{route:'/screen?deviceType.equals=FLEX_3'}` | `orca.screenLocations.viewed {deviceType:'FLEX_3', screen:'TENDER_CASH_DISCOUNT'}` |
| M09 s3–s4 | `terminal` | *Sim:* `orca.xyTouch {robotName:'wall-e', mode:'probe'}` then `{robotName:'tars', mode:'adb'}` |
| M09 s6 | `jenkins` | *Sim:* build of `Java/contact-canada-pin-sale` with `ROBOT_NAME=seti` (`jenkins.build.triggered` shows the chosen value) |
| M09 s9 | `camera` `{recordingBuildId:<eve build>}` | `camera.recording.finished {robotName:'eve'}` |
| M09 s11–s12 | `orca`, `github` | *Sim:* both maps exist, ±0.5 mm; `github.pr.created` → `github.prMerged` |
| M10 s6 / s7 | `orca` `{route:'/card-profile'}` | `orca.cardProfile.viewed {name:'VISA_STD_SWIPE'}` / `orca.cardProfile.fieldClicked {name:'VISA_STD_DIP', field:'gortPath'}` |
| M10 s9 | `github` `{route:'/labsim-lab/gort'}` | `github.file.viewed {repo:'gort', path:'cards/emv/visa_std_dip.json'}` |
| M10 s10–s11 | `terminal` | *Sim:* `terminal.command` on `minix-01` (`schtasks /query /tn GortCardSync`, `dir C:\gort\cards\emv`); `orca.cardAction {entry:'DIP', ok:true}` |
| M10 s13 | `jenkins` | `jenkins.build.triggered` with `CARD_PROFILE=VISA_STD_DIP` (go-sdk) and `INTERAC_CA_DIP` (contact-canada) |
| M11 s2 | `jenkins` | `jenkins.view.opened {view:'Java'}` and `{view:'iOS'}` |
| M11 s4 | `jenkins` | `jenkins.console.opened {result:'FAILURE'}` for a build whose sim `failureCode == 'ENUM_CASE'` |
| M11 s6, s9 | `jenkins` | *Sim:* `robot.checkedOut {name:'wall-e'}`; build checks out `rosie` |
| M11 s7 | `orca` `{route:'/robot'}` | `route` on Orca robot list/detail while `wall-e.checkout != null`, and again after release |
| M11 s8 | `jenkins` | `jenkins.console.lineClicked` with `text` containing `PORT_NUMBER=5444` |
| M12 s2–s8 | `terminal` | *Sim:* `adb.connected {target:'10.42.30.32:5444'}`, `adb.command` dump/pull, `device.touched {deviceId:'dev-tars-flex4', source:'adb', hitButton:'Register'}`, the refused 5555 connect |
| M13 s2 | `github` `{route:'/labsim-lab/uia-remote'}` | `github.cloneUrl.copied {repo:'uia-remote'}` |
| M13 s3 | `intellij` | *Sim:* `git.cloned {repo:'uia-remote'}` (`intellij.project.cloned`) |
| M13 s4 | `intellij` `{repo:'uia-remote'}` | `intellij.tree.nodeClicked {path:'app/src/main', kind:'dir'}` |
| M13 s5 | `intellij` | *Sim:* six files at their package paths (`intellij.file.moved` per drop) |
| M13 s6 | `intellij` `{repo:'uia-remote', file:'…/pageobjects/HomeScreen.java'}` | `intellij.editor.clicked` on a line inside Zone 1, then one inside Zone 2 (missions locate the `// ===== Zone` comment lines in the file) |
| M13 s8–s9, s11 | `intellij` | *Sim:* code facts + `test.localRunFinished` (`HomeScreenTest` pass; `ReceiptScreenTest` pass ×3); `intellij.intention.applied {intention:'implement-mandatory-screen-methods'}` optional |
| M14 s1 / s3 | `intellij` `{repo:'uia-remote', runConfig:'TaxTest'}` | `intellij.run.started {config:'TaxTest'}` / `intellij.run.stopped` |
| M14 s5 | `intellij` `{file:'config.properties'}` | `intellij.configValidator.ran {passed:11, total:11}` (D8: sim validation) |
| M14 s8, s9, s14 | `orca`, `intellij` | *Sim:* megatron `RESERVED`; run started with a valid config; `TaxTest` pass; megatron `AVAILABLE` |
| M15 s2 / s3 | `intellij` `{repo:'pigeon'}` | `intellij.tree.nodeClicked {path:'runners/ios'}` / `intellij.editor.clicked` with `token` ∈ `name`, `connectionType`, `platforms`, `actions` |
| M15 s5, s8 | `jenkins` | `jenkins.console.opened {result:'FAILURE'}` for builds with `failureCode` `JSON_PARSE` / `PRINTER_TIMEOUT` |
| M15 s6 | `intellij` `{repo:'pigeon', file:'tests/sale/swipe_sale_print.json'}` | *Sim:* the file on `main` parses (commit + push; pigeon accepts direct pushes) |
| M15 s10 | `camera` `{recordingBuildId:<bumblebee build>}` | `camera.recording.finished {robotName:'bumblebee'}` |
| M15 s11 | `github` `{route:'/labsim-lab/gort/pull/418'}` | `github.pr.reviewSubmitted {repo:'gort', number:418, verdict:'APPROVE'}` → *Sim:* merged, build green |
| M16 s4 | `terminal` | *Sim:* `terminal.command` `grep -c "TOTAL" window_dump.xml` printed `0` |
| M16 s5 | `camera` `{robot:'r2-d2'}` | `camera.snapshot.saved` with `path` ending `r2d2_cfd.png` (sim `camera.snapshot`) |
| M16 s6 | `gimp` `{path:'~/Pictures/r2d2_cfd.png'}` | `gimp.selection.changed` within ±3 px of `412, 288, 236, 44` |
| M16 s7 / s8 | `orca` `{route:'/screen-compare-image'}` | *Sim:* `CFD_TOTAL` row; `orca.screenCompare.tested {match:true}` / `orca.screenCompare.layoutV2Toggled {on:true}` then `tested {match:false}` |
| M16 s10, s12 | `intellij` | *Sim:* file contents (pigeon block values = the GIMP selection; `TaxTestDuo` uses `displayId`), config IPs equal, `TaxTestDuo` pass |
| M17 s5 | `ollama` `{prompt:<Cur M17 prompt>, attach:'~/Downloads/walle_receipt_0912.jpg'}` | `ollama.response.received` for a request with image `img:receipt:wall-e:0912`, then `ollama.response.flagged {flag:'tip-math-error'}` |
| M17 s8 | `github` `{route:'/labsim-lab/uia-remote/pull/212/files'}` | `github.pr.reviewSubmitted {repo:'uia-remote', number:212, verdict:'REQUEST_CHANGES'}` with a comment `reason:'missing-isScreenPresent'` (*Sim:* `pr.verdict` + `comments`) |
| M18 s8 / s10 | `orca` / `jenkins` | `orca.robot.notesViewed {name:'bumblebee'}` before the escalation (HUD); *Sim:* build green |

### 13.2 Arcade incidents (GP §3.5) — app touchpoints

Success conditions are GP's DSL over sim state; these are the app surfaces each incident exercises and the app
signals missions may use for process bonuses, hints and Teach Cards.

| Incidents | Surfaces (symptom → fix) | App signals |
|---|---|---|
| INC01–04, INC06, INC19 | Orca filter `Connection Failed` → Notes → (escalation in HUD); Terminal `ping`/`ssh`/`curl`; Lab Cameras `Stream unavailable — …`; desktop dashboard unreachable vs green tablet (INC04) | `orca.robots.filtered`, `orca.robot.notesViewed`, `camera.stream.opened {ok:false}` |
| INC05, INC06, INC12, INC48, INC57-A, INC58, INC62, INC64 | LabChat replies `R_WAIT_PING`, `R_OFFLINE`, `R_FIXED`, `R_LOCKOUT`, `R_WAIT`, `R_FALSE_POSITIVE`, `R1`…`R4`, `R_DUO_BLIND`; INC48 "ask before touching" message to Riley | `chat.reply.chosen`, `chat.message.sent {channel:'dm:riley'}` (PB06) |
| INC07, INC31, INC40–42, INC44, INC59, INC63 | Orca status menu / form, Notes history (`STATUS Offline → Available (alex)`), Device create + relink | `orca.robot.statusChangeRequested`, `orca.robot.saved`, `orca.device.created` |
| INC08, INC09, INC36, INC37, INC38 | Lab Cameras (shared Rack B stream, wrong rig), Orca URL Mappings, Screen Compare **Test**, GIMP re-measure, IntelliJ migration + PR | `camera.stream.opened`, `orca.screenCompare.tested`, `gimp.selection.changed`, `github.pr.created` |
| INC10, INC60 | Ollama WebUI `Model server unreachable`; Orca JHipster 500 page; Terminal `systemctl` on VMs | `browser.page.unreachable`, `terminal.command.submitted` |
| INC11, INC13, INC15, INC16 | status tablet / desktop dashboard (Park All, Steppers, Solenoid, Dip) | `tablet.command.sent`, `dashboard.command.sent` |
| INC14, INC20–22 | Lab Cameras recordings (Tap analysis), Orca Screens/Locations + **Test tap**, GIMP screencap mm, GitHub branch → edit → PR (PB03) | `camera.tapAnalysis.opened`, `orca.screenLocation.saved`, `orca.screenLocation.testTap`, `github.file.committed`, `github.pr.created` |
| INC23, INC49 | Orca capability documents + Match preview; IntelliJ/GitHub JSON edit; Jenkins Configure (script line) | `orca.matchPreview.ran`, `jenkins.job.configured` |
| INC24, INC25 | Terminal `adb exec-out screencap`, GIMP selection → Pigeon JSON (Script-Fu copy), IntelliJ (no JSON linter), `git log -1 --stat` / `git diff HEAD~1` (PB04) | `gimp.selection.copied`, `intellij.file.saved`, `terminal.command.submitted` |
| INC26, INC39, INC41, INC52 | Jenkins search, Move, Configure defaults, Build with Parameters | `jenkins.search`, `jenkins.job.moved`, `jenkins.job.configured`, `jenkins.build.triggered` |
| INC27–30, INC32–33, INC35, INC47 | IntelliJ config validator, Run window logs, Code With Me (INC29), Terminal `adb devices` / `adb disconnect` / Pi `adb tcpip 5444` | `intellij.configValidator.ran`, `intellij.run.*` |
| INC34 | GitHub PR #431 Files changed: three line comments with saved replies + Request changes | `github.pr.lineCommentAdded`, `github.pr.reviewSubmitted` |
| INC45, INC46, INC65 | Orca tethered config (banner `Tethered: MFD populated`), URL Mappings | `orca.robot.saved {changed:['mfdDeviceId','cfdDeviceId']}` |
| INC50, INC51 | Orca Merchant Config **Edit** (Ubi Route, API Key), Jenkins console env line | `orca.merchant.editOpened`, `orca.merchant.saved` |
| INC53–56 | Orca Card Profiles (Path / Track Data), MagStripe Reader (canonical tracks), GitHub gort history, Terminal on Minix boxes (`schtasks /run`) and Pis (Wine prefix) | `orca.cardProfile.saved`, `cardreader.swiped`, `cardreader.copied` |
| INC57 | Ollama response vs the real receipt (lightbox), **File bug** in the HUD ticket panel | `ollama.response.received` |

---

## 14. Testing, sandboxes and acceptance

* **Contract tests** — `src/computer/apps.test.ts` (routes, host table, action catalogue, bridge, formatters,
  registry lazy-loading). Keep green; extend when adding names.
* **Unit tests per app** (`src/computer/apps/<id>/*.test.tsx`, `// @vitest-environment jsdom`, `react-dom/client`
  + `act`): render the app against a sandbox lab (`src/computer/sandbox/fakeLab.ts`, seeded through `mutate()` from
  the Sim §2 tables), drive the key flows of its section and assert: the sim call made (spy on `sim.*`), the exact
  strings shown, the emitted `app.action`/`app.navigated` payloads. Minimum per app: Orca robot filter + edit/save +
  Notes + merchant Edit + screen-location test tap + screen-compare test; Jenkins Build with Parameters + live console
  + configure + move; IntelliJ clone + tree click + edit/save + run + commit/push; Terminal exec/stream/Ctrl+C/history/
  completion/nano; GIMP open + rectangle select + tool-option fields; GitHub clone URL copy + PR create + review +
  merge box states; Cameras unavailable card + snapshot + recording playback; Ollama attach + send + flag;
  Dashboard every Motion Control button + lockout; LabChat post + quick replies; Card Reader swipe.
* **Visual sandboxes** — one HTML page per builder at the repo root (`sandbox-desktop.html`, `sandbox-webapps.html`,
  `sandbox-proapps.html`) mounting the real shell (or the app standalone until the shell exists) over the fake lab;
  screenshots with `node scripts/shot.mjs http://localhost:<port>/<page> <out>.png 6000 --width 1600 --height 900
  [--eval '<js>']`. Compare against the look-and-feel tables of each section.
* **Playwright** (`tests/e2e`, owned by ui/integration): sit at the workstation → desktop renders → open every app
  from the Start menu → no console errors → screenshot; Esc stands up.
* **Acceptance (per app):** every exact string in its section renders byte-for-byte; every listed action/route is
  emitted with the documented payload; every keyboard shortcut works or has its substitute; no global CSS leaks
  (grep the built CSS for selectors without the app prefix); idle CPU < 2 % with the window open and no live
  stream; no `Math.random`/`Date.now` in anything a lesson observes; zero React key/act warnings in tests.

---

## Appendix A — Route catalogue (mirror of `APP_ROUTES`, apps.ts)

Browser-hosted apps: path + query after the origin. Templates: `:x` one segment, `*x` rest of the path. Query
parameters are listed in the descriptions. Use `buildRoute` / `matchRoute` (apps.ts).


**`orca`**

| Key | Template | Page |
|---|---|---|
| `home` | `/` | Orchestrator home dashboard (status counts, health-check timer, active checkouts, alerts) |
| `login` | `/login` | Sign in page |
| `robots` | `/robot` | Robot list with Tate's filters; query status.in, deviceType.equals, rigKind.equals, environment.equals, name.contains, page, sort |
| `robotNew` | `/robot/new` | Create a new Robot |
| `robotView` | `/robot/:id/view` | Robot detail incl. Notes and Check out |
| `robotEdit` | `/robot/:id/edit` | Robot edit form (all configuration fields) |
| `devices` | `/device` | Device list |
| `deviceNew` | `/device/new` | Create a new Device (hardware upgrade) |
| `deviceView` | `/device/:id/view` | Device detail |
| `deviceEdit` | `/device/:id/edit` | Device edit form |
| `capabilities` | `/robot-capability` | Robot Capability rows; query tab=documents&robot=<name> shows a robot capability document |
| `capabilityNew` | `/robot-capability/new` | Create a capability row |
| `capabilityView` | `/robot-capability/:id/view` | Capability row detail |
| `capabilityEdit` | `/robot-capability/:id/edit` | Capability row edit |
| `matchPreview` | `/robot-capability/match-preview` | Match preview (capabilities JSON + environment → robots) |
| `merchants` | `/merchant-config` | Merchant Config list (truncated columns) |
| `merchantNew` | `/merchant-config/new` | Create a Merchant Config |
| `merchantView` | `/merchant-config/:id/view` | Merchant Config detail (credentials hidden) |
| `merchantEdit` | `/merchant-config/:id/edit` | Merchant Config Edit — the only view with App ID / App Secret / API Key / Ubi Route |
| `screens` | `/screen` | Screen list; query deviceType.equals, name.contains, display.equals |
| `screenNew` | `/screen/new` | Create a Screen (e.g. RECEIPT_OPTIONS_5 for FLEX_4) |
| `screenView` | `/screen/:id/view` | Screen detail with its Screen Locations and Test tap |
| `screenEdit` | `/screen/:id/edit` | Screen edit |
| `screenLocations` | `/screen-location` | Screen Location list; query deviceType.equals, screenId.equals, button.contains |
| `screenLocationNew` | `/screen-location/new` | Create a Screen Location |
| `screenLocationView` | `/screen-location/:id/view` | Screen Location detail |
| `screenLocationEdit` | `/screen-location/:id/edit` | Screen Location edit (X/Y mm) |
| `cardProfiles` | `/card-profile` | Card Profile list |
| `cardProfileNew` | `/card-profile/new` | Create a Card Profile |
| `cardProfileView` | `/card-profile/:id/view` | Card Profile detail (Track Data for swipe, Path for dip/tap) |
| `cardProfileEdit` | `/card-profile/:id/edit` | Card Profile edit |
| `screenCompares` | `/screen-compare-image` | Screen Compare Image list (deprecated banner) |
| `screenCompareNew` | `/screen-compare-image/new` | Create a Screen Compare Image |
| `screenCompareView` | `/screen-compare-image/:id/view` | Screen Compare Image detail with the Test panel |
| `screenCompareEdit` | `/screen-compare-image/:id/edit` | Screen Compare Image edit |
| `adminUsers` | `/admin/user-management` | Administration › User management |
| `adminMetrics` | `/admin/metrics` | Administration › Metrics |
| `adminHealth` | `/admin/health` | Administration › Health (/management/health) |
| `adminConfiguration` | `/admin/configuration` | Administration › Configuration |
| `adminHealthCheckLog` | `/admin/health-check-log` | Administration › Health-check log (runs, SKIPPED (Offline), RESERVED — not overridden) |
| `adminAudits` | `/admin/audits` | Administration › Audits |
| `adminLogs` | `/admin/logs` | Administration › Logs |
| `adminDocs` | `/admin/docs` | Administration › API (Swagger UI, Try it out) |
| `accountSettings` | `/account/settings` | Account › Settings |
| `accountPassword` | `/account/password` | Account › Password |

**`jenkins`**

| Key | Template | Page |
|---|---|---|
| `dashboard` | `/` | Dashboard, All view (folders Java and iOS) |
| `view` | `/view/:view/` | A view tab: Java, iOS, uia-remote, SDK-Go, Pigeon-LSTR, Laz, Vision-PoC |
| `folder` | `/job/:folder/` | Folder page (Java or iOS) |
| `job` | `/job/:folder/job/:job/` | Job page with Stage View, Build History, permalinks |
| `buildWithParameters` | `/job/:folder/job/:job/build` | Build with Parameters form |
| `configure` | `/job/:folder/job/:job/configure` | Configure (parameters defaults = saved params, Pipeline script) |
| `move` | `/job/:folder/job/:job/move` | Move job to another folder |
| `changes` | `/job/:folder/job/:job/changes` | Changes |
| `fullStageView` | `/job/:folder/job/:job/workflow-stage` | Full Stage View |
| `pipelineSyntax` | `/job/:folder/job/:job/pipeline-syntax/` | Pipeline Syntax snippet generator |
| `build` | `/job/:folder/job/:job/:number/` | Build page (number may be lastBuild) |
| `console` | `/job/:folder/job/:job/:number/console` | Console Output |
| `buildParameters` | `/job/:folder/job/:job/:number/parameters/` | Build parameters |
| `buildHistory` | `/view/all/builds` | Global Build History |
| `people` | `/asynchPeople/` | People |
| `manage` | `/manage/` | Manage Jenkins |
| `nodes` | `/computer/` | Nodes |
| `about` | `/manage/about/` | About Jenkins |
| `search` | `/search/` | Search results; query q |

**`github`**

| Key | Template | Page |
|---|---|---|
| `org` | `/labsim-lab` | Organisation overview / repositories |
| `repo` | `/labsim-lab/:repo` | Repository Code tab (default branch) |
| `tree` | `/labsim-lab/:repo/tree/*ref` | Directory at <branch>/<path> (branch may contain "/") |
| `blob` | `/labsim-lab/:repo/blob/*ref` | File at <branch>/<path> |
| `edit` | `/labsim-lab/:repo/edit/*ref` | Web editor for <branch>/<path> |
| `newFile` | `/labsim-lab/:repo/new/*ref` | Create new file in <branch>/<dir> |
| `commits` | `/labsim-lab/:repo/commits/*ref` | Commit history of a branch |
| `commit` | `/labsim-lab/:repo/commit/:sha` | One commit with its diff |
| `branches` | `/labsim-lab/:repo/branches` | Branches (protected badge on gort/orchestrator main) |
| `pulls` | `/labsim-lab/:repo/pulls` | Pull request list; query q |
| `compare` | `/labsim-lab/:repo/compare/*range` | Compare <base>...<head> and open a pull request |
| `pull` | `/labsim-lab/:repo/pull/:number` | Pull request Conversation tab (merge box) |
| `pullCommits` | `/labsim-lab/:repo/pull/:number/commits` | Pull request Commits tab |
| `pullChecks` | `/labsim-lab/:repo/pull/:number/checks` | Pull request Checks tab |
| `pullFiles` | `/labsim-lab/:repo/pull/:number/files` | Pull request Files changed tab (line comments, Review changes) |
| `issues` | `/labsim-lab/:repo/issues` | Issues (empty state) |
| `actions` | `/labsim-lab/:repo/actions` | Actions (empty state) |

**`ollama`**

| Key | Template | Page |
|---|---|---|
| `home` | `/` | Ollama WebUI new chat |
| `chat` | `/c/:chatId` | An existing chat |

**`browser`**

| Key | Template | Page |
|---|---|---|
| `newTab` | `/newtab` | New tab page |
| `raw` | `*url` | Any other URL (route = the full URL), raw JSON/text view |

**`intellij`**

| Key | Template | Page |
|---|---|---|
| `welcome` | `/welcome` | Welcome to IntelliJ IDEA (no project) |
| `project` | `/project/:repo` | Project open, no editor tab |
| `file` | `/project/:repo/file/*path` | Project with this repo-relative file in the active editor tab |

**`terminal`**

| Key | Template | Page |
|---|---|---|
| `tab` | `/tab/:n` | Terminal tab n (1-based) is active |

**`gimp`**

| Key | Template | Page |
|---|---|---|
| `empty` | `/` | No image open |
| `image` | `/image/*path` | Image tab active (workstation path, e.g. ~/Pictures/r2d2_cfd.png) |

**`camera`**

| Key | Template | Page |
|---|---|---|
| `home` | `/` | No stream selected |
| `wall` | `/wall` | Wall view of all streams |
| `stream` | `/stream/:host` | Live stream of http://<host>:8081/stream.mjpg; query robot=<name> when opened from a robot |
| `recordings` | `/recordings` | Recordings list |
| `recording` | `/recording/:id` | Recording player |

**`dashboard`**

| Key | Template | Page |
|---|---|---|
| `home` | `/` | Robot list, nothing selected |
| `robot` | `/robot/:name/:tab` | Dashboard of a robot; tab = robot \| robot-control \| motion-control |

**`chat`**

| Key | Template | Page |
|---|---|---|
| `channel` | `/channel/:name` | A channel (name without "#", e.g. lab-automation) |
| `dm` | `/dm/:user` | Direct messages with a team member key (riley, jared, …) |
| `mentions` | `/mentions` | Mentions & reactions |

**`cardreader`**

| Key | Template | Page |
|---|---|---|
| `home` | `/` | MagStripe Reader main window |

**`files`**

| Key | Template | Page |
|---|---|---|
| `dir` | `/dir/*path` | A directory (e.g. ~/Pictures) |

## Appendix B — Action catalogue (mirror of `APP_ACTIONS` / `AppActionPayloads`, apps.ts)

`app.action` `{ app, action, data }` — `app` is the emitting source (the prefix), `data` the payload below.
`& Ok` = the payload also carries `ok: boolean; error: string | null` (the sim result). Emitted after the sim call
returns; semantics in the cited section.

| Action | Payload | Spec |
|---|---|---|
| `desktop.standUp` | `Record<string, never>` | §1 |
| `desktop.clipboard.copied` | `{ text: string; sourceApp: string }` | §1 |
| `desktop.notification.clicked` | `{ app: string; title: string; route: string \| null }` | §1 |
| `orca.session.signedIn` | `{ login: string }` | §2 |
| `orca.session.signedOut` | `{ login: string }` | §2 |
| `orca.robots.filtered` | `{ status: RobotStatus[]; deviceType: string \| null; rigKind: string \| null; environment: string \| null; name: string; resultCount: number; }` | §2 |
| `orca.robot.viewed` | `{ robotId: number; name: string }` | §2 |
| `orca.robot.editOpened` | `{ robotId: number \| null; name: string \| null }` | §2 |
| `orca.robot.saved` | `{ robotId: number; name: string; created: boolean; changed: string[] }` | §2 |
| `orca.robot.saveFailed` | `{ robotId: number \| null; error: string }` | §2 |
| `orca.robot.statusChangeRequested` | `{ robotId: number; name: string; from: RobotStatus; to: RobotStatus; confirmed: boolean } & Ok` | §2 |
| `orca.robot.notesViewed` | `{ robotId: number; name: string; noteCount: number }` | §2 |
| `orca.robot.noteAdded` | `{ robotId: number; name: string; text: string } & Ok` | §2 |
| `orca.robot.noteResolved` | `{ robotId: number; noteId: number } & Ok` | §2 |
| `orca.robot.checkoutAttempted` | `{ robotId: number; name: string; status: RobotStatus; ok: boolean; message: string }` | §2 |
| `orca.robot.released` | `{ robotId: number; name: string } & Ok` | §2 |
| `orca.entity.deleted` | `{ entity: OrcaEntityName; id: number } & Ok` | §2 |
| `orca.healthCheck.forced` | `{ ok: boolean; error: string \| null }` | §2 |
| `orca.healthLog.viewed` | `{ newestRun: number \| null }` | §2 |
| `orca.device.created` | `{ deviceId: number; name: string; deviceType: string; serial: string; ip: string }` | §2 |
| `orca.device.saved` | `{ deviceId: number; name: string; changed: string[] }` | §2 |
| `orca.capabilities.viewed` | `{ robotId: number; robotName: string; document: string }` | §2 |
| `orca.capability.saved` | `{ capabilityId: number; name: string; created: boolean }` | §2 |
| `orca.matchPreview.ran` | `{ capabilities: string; environment: string; matches: string[] } & Ok` | §2 |
| `orca.merchant.editOpened` | `{ merchantId: number; name: string }` | §2 |
| `orca.merchant.saved` | `{ merchantId: number; name: string; changed: string[] }` | §2 |
| `orca.merchant.secretRevealed` | `{ merchantId: number; name: string }` | §2 |
| `orca.screens.filtered` | `{ deviceType: string \| null; name: string; display: string \| null; resultCount: number }` | §2 |
| `orca.screen.viewed` | `{ screenId: number; name: string; deviceType: string }` | §2 |
| `orca.screenLocations.viewed` | `{ screenId: number; screen: string; deviceType: string; count: number }` | §2 |
| `orca.screen.saved` | `{ screenId: number; name: string; deviceType: string; created: boolean }` | §2 |
| `orca.screenLocation.saved` | `{ locationId: number; screenId: number; screen: string; deviceType: string; button: string; xMm: number; yMm: number; created: boolean; }` | §2 |
| `orca.screenLocation.testTap` | `{ robotName: string; screen: string; button: string; ok: boolean; response: string }` | §2 |
| `orca.cardProfile.viewed` | `{ profileId: number; name: string; entry: CardEntry }` | §2 |
| `orca.cardProfile.fieldClicked` | `{ profileId: number; name: string; field: 'trackData' \| 'gortPath' }` | §2 |
| `orca.cardProfile.saved` | `{ profileId: number; name: string; changed: string[] }` | §2 |
| `orca.screenCompare.saved` | `{ compareId: number; name: string; created: boolean; x: number; y: number; w: number; h: number; expected: string }` | §2 |
| `orca.screenCompare.tested` | `{ compareId: number; name: string; text: string; expected: string; match: boolean \| null } & Ok` | §2 |
| `orca.screenCompare.layoutV2Toggled` | `{ on: boolean }` | §2 |
| `orca.api.executed` | `{ method: string; path: string; status: number }` | §2 |
| `jenkins.view.opened` | `{ view: string }` | §3 |
| `jenkins.job.opened` | `{ jobId: string }` | §3 |
| `jenkins.buildWithParameters.opened` | `{ jobId: string; params: Record<string, string> }` | §3 |
| `jenkins.build.triggered` | `{ jobId: string; params: Record<string, string>; buildId: string \| null } & Ok` | §3 |
| `jenkins.build.aborted` | `{ buildId: string } & Ok` | §3 |
| `jenkins.console.opened` | `{ buildId: string; jobId: string; number: number; state: string; result: string \| null }` | §3 |
| `jenkins.console.lineClicked` | `{ buildId: string; line: number; text: string }` | §3 |
| `jenkins.script.viewed` | `{ jobId: string }` | §3 |
| `jenkins.script.lineClicked` | `{ jobId: string; line: number; text: string }` | §3 |
| `jenkins.job.configured` | `{ jobId: string; changed: string[] } & Ok` | §3 |
| `jenkins.job.moved` | `{ from: string; to: string } & Ok` | §3 |
| `jenkins.search` | `{ query: string; results: string[] }` | §3 |
| `github.cloneUrl.copied` | `{ repo: string; protocol: 'https' \| 'ssh' \| 'cli'; url: string }` | §7 |
| `github.tree.viewed` | `{ repo: string; ref: string; path: string }` | §7 |
| `github.file.viewed` | `{ repo: string; ref: string; path: string }` | §7 |
| `github.commit.viewed` | `{ repo: string; sha: string }` | §7 |
| `github.branch.created` | `{ repo: string; branch: string; from: string } & Ok` | §7 |
| `github.file.committed` | `{ repo: string; branch: string; path: string; message: string; newBranch: boolean } & Ok` | §7 |
| `github.pr.created` | `{ repo: string; number: number \| null; title: string; head: string; base: string } & Ok` | §7 |
| `github.pr.viewed` | `{ repo: string; number: number; tab: 'conversation' \| 'commits' \| 'checks' \| 'files' }` | §7 |
| `github.pr.lineCommentAdded` | `{ repo: string; number: number; path: string; line: number; body: string; reason: string \| null }` | §7 |
| `github.pr.reviewSubmitted` | `{ repo: string; number: number; verdict: 'APPROVE' \| 'REQUEST_CHANGES' \| 'COMMENT'; body: string; comments: { path: string; line: number; body: string; reason: string \| null }[]; } & Ok` | §7 |
| `github.pr.commented` | `{ repo: string; number: number; body: string } & Ok` | §7 |
| `github.pr.merged` | `{ repo: string; number: number } & Ok` | §7 |
| `ollama.model.selected` | `{ model: string }` | §9 |
| `ollama.image.attached` | `{ path: string; ref: string }` | §9 |
| `ollama.prompt.sent` | `{ requestId: string \| null; model: string; prompt: string; image: string \| null } & Ok` | §9 |
| `ollama.response.received` | `{ requestId: string; response: string }` | §9 |
| `ollama.response.flagged` | `{ requestId: string; flag: 'layout-incomplete' \| 'tip-math-error' \| 'total-error' \| 'looks-correct' }` | §9 |
| `browser.page.unreachable` | `{ url: string; error: 'unknown' \| 'timeout' \| 'refused' }` | §1.4 |
| `intellij.project.cloned` | `{ repo: string; url: string } & Ok` | §4 |
| `intellij.project.opened` | `{ repo: string }` | §4 |
| `intellij.tree.nodeClicked` | `{ repo: string; path: string; kind: 'dir' \| 'file' }` | §4 |
| `intellij.file.opened` | `{ repo: string; path: string }` | §4 |
| `intellij.editor.clicked` | `{ repo: string; path: string; line: number; column: number; lineText: string; token: string \| null }` | §4 |
| `intellij.file.saved` | `{ repo: string; path: string; trigger: 'explicit' \| 'auto' \| 'run' \| 'commit'; problems: number } & Ok` | §4 |
| `intellij.file.created` | `{ repo: string; path: string } & Ok` | §4 |
| `intellij.file.moved` | `{ repo: string; from: string; to: string } & Ok` | §4 |
| `intellij.intention.applied` | `{ repo: string; path: string; intention: string }` | §4 |
| `intellij.configValidator.ran` | `{ repo: string; path: string; passed: number; total: number; failures: string[] }` | §4 |
| `intellij.build.ran` | `{ repo: string; errors: number }` | §4 |
| `intellij.run.started` | `{ repo: string; config: string; testPath: string; runId: string \| null } & Ok` | §4 |
| `intellij.run.stopped` | `{ runId: string }` | §4 |
| `intellij.run.finished` | `{ runId: string; config: string; passed: boolean \| null }` | §4 |
| `intellij.git.branchCheckedOut` | `{ repo: string; branch: string; created: boolean } & Ok` | §4 |
| `intellij.git.committed` | `{ repo: string; message: string; files: string[]; sha: string \| null } & Ok` | §4 |
| `intellij.git.pushed` | `{ repo: string; branch: string } & Ok` | §4 |
| `intellij.git.pulled` | `{ repo: string } & Ok` | §4 |
| `terminal.command.submitted` | `{ tab: number; line: string; host: string \| null; cwd: string }` | §5 |
| `terminal.interrupted` | `{ tab: number; line: string }` | §5 |
| `terminal.tab.opened` | `{ tab: number }` | §5 |
| `terminal.nano.saved` | `{ host: string; path: string } & Ok` | §5 |
| `gimp.image.opened` | `{ path: string; ref: string; width: number; height: number }` | §6 |
| `gimp.selection.changed` | `{ path: string; ref: string; x: number; y: number; w: number; h: number }` | §6 |
| `gimp.selection.copied` | `{ x: number; y: number; w: number; h: number; format: 'pigeon-json' \| 'field'; text: string }` | §6 |
| `camera.stream.opened` | `{ url: string; host: string \| null; robotName: string \| null; cameraId: string \| null } & Ok` | §8 |
| `camera.wall.opened` | `Record<string, never>` | §8 |
| `camera.snapshot.saved` | `{ path: string; ref: string; url: string; robotName: string \| null }` | §8 |
| `camera.recording.opened` | `{ recordingId: string; buildId: string \| null; runId: string \| null; robotName: string }` | §8 |
| `camera.recording.finished` | `{ recordingId: string; buildId: string \| null; runId: string \| null; robotName: string }` | §8 |
| `camera.tapAnalysis.opened` | `{ recordingId: string; eventIndex: number; screen: string; button: string; hit: boolean }` | §8 |
| `dashboard.robot.selected` | `{ robot: string }` | §10 |
| `dashboard.tab.opened` | `{ robot: string; tab: DashboardTab }` | §10 |
| `dashboard.command.sent` | `{ robot: string; command: RigCommandName; ok: boolean; error: string \| null }` | §10 |
| `dashboard.lockout.shown` | `{ robot: string; holder: string; blockedClick: boolean }` | §10 |
| `tablet.tab.opened` | `{ robot: string; tab: DashboardTab }` | §10 |
| `tablet.command.sent` | `{ robot: string; command: RigCommandName; ok: boolean; error: string \| null }` | §10 |
| `tablet.lockout.shown` | `{ robot: string; holder: string; blockedClick: boolean }` | §10 |
| `chat.channel.opened` | `{ channel: string }` | §11 |
| `chat.message.sent` | `{ channel: string; text: string }` | §11 |
| `chat.reply.chosen` | `{ channel: string; ticketId: string \| null; replyId: string; messageId: string \| null; text: string }` | §11 |
| `cardreader.swiped` | `{ card: DeskTestCard; track1: string; track2: string }` | §12.1 |
| `cardreader.copied` | `{ field: 'track1' \| 'track2' \| 'track3' \| 'tracks'; text: string }` | §12.1 |
| `files.opened` | `{ path: string; with: AppId }` | §12.2 |
