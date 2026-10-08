# LabSim architecture

```
                   ┌──────────────────────── React UI (src/ui) ────────────────────────┐
                   │ main menu · HUD · dialogue · objectives · tickets · quiz · manual │
                   │ overlays: computer (src/computer) · tablet · inspect · drills     │
                   └──────────┬──────────────────────────────┬─────────────────────────┘
                     useGame(selector)                 missions.* / sim.*
                              │                              │
┌────────────── core (src/core) ──────────────┐   ┌── missions (src/missions) ──┐
│ store (zustand+immer): {lab,session,ui,      │◀──│ lesson runner, objectives,  │
│   progress}; transact() + queued events      │   │ arcade director, drills,    │
│ bus (typed EventMap) · loop (20 Hz sim /     │──▶│ scoring, Leitner, achievem. │
│   rAF render) · rng · persistence · game.ts  │   └─────────────┬───────────────┘
└───────┬───────────────────────────┬──────────┘                 │ sim.faults / sim.*
        │ sim.tick(dt)              │ engine.frame(dt)           │
┌───────▼──────── sim (src/sim) ────┴───┐   ┌──── engine (src/engine) ────┐
│ LabState types · seed · systems:      │   │ renderer + post-fx + quality │
│ orca/health/checkout/xy_touch, rigs   │   │ FPS player + collision       │
│ motion, devices OS + payments, power, │   │ interaction raycast/prompts  │
│ hosts/network/adb, callus/collis,     │   │ camera focus · captureView   │
│ git/GitHub, jenkins + runners         │   │ WebAudio synth · textures ·  │
│ (uia-remote, pigeon), laz/ubi, ocr,   │   │ materials                    │
│ ollama, chat, faults, terminal shell  │   └──────────────▲───────────────┘
└───────────────────────────────────────┘                  │
                     ▲  store.getState().lab (read each frame)
                     │                                     │
              ┌──────┴──── world (src/world) ──────────────┴──┐
              │ lab room & props (lab/) · rigs & devices (rigs/)│
              │ binds 3D to sim state; interactions → sim.*     │
              │ render2d (src/render2d): device screens, tablet │
              └─────────────────────────────────────────────────┘
```

## Data flow rules
1. **State lives in one store** (`src/core/store.ts`): `RootState = { lab, session, ui, progress }`.
   * `lab: LabState` (`src/sim/types.ts`) — the simulated lab; owned by `src/sim`.
   * `session`, `ui`, `progress` (`src/core/state.ts`) — owned by missions/UI/engine as documented there.
2. **All lab mutations go through `sim.*`** (`src/sim/api.ts`). Methods validate like the real tool,
   mutate inside `transact()`, emit domain events, and return `Result` objects (never throw for user error).
3. **Events** (`src/core/events.ts` + `src/sim/events.ts`) are queued during a transaction and delivered on
   `bus` after commit. Missions/objectives, audio and toasts listen to events; the world re-reads state.
4. **Time**: the loop calls `sim.tick(dtGameMs)` at 20 Hz (scaled by `lab.time.timeScale`; frozen by pausing
   overlays) and `engine.frame(dtSeconds)` every animation frame. Sim systems are deterministic (seeded RNG
   stored in `lab.rng`).
5. **The 3D world is a view**: each frame world binders read `store.getState().lab` and update transforms,
   LEDs, screen textures (only when `display.rev` changed), banner colours. Player interactions call `sim.*`.
6. **Layout truth**: the device firmware button layout (`src/sim/devices/layouts.ts`) is what screens draw and
   what touches hit. Orca's `screenLocations` table is what automation *believes* — they can drift (the
   receipt-QR regression), which is how mis-taps happen.

## Module contracts
| Contract | File | Implemented by |
|---|---|---|
| Lab state types | `src/sim/types.ts` | sim |
| Sim events | `src/sim/events.ts` | sim |
| Sim actions | `src/sim/api.ts` (`SimApi`) | `src/sim/impl/` → `sim` |
| Engine services | `src/engine/types.ts` (`Engine`) | `src/engine/engine.ts` → `engine` |
| World build | `src/world/index.ts` (`buildLab`, `buildRigs`) + `src/world/layout.ts` | world-lab, world-rigs |
| 2D renderers | `src/render2d/api.ts` | world-rigs |
| Content data | `src/content/schema.ts` | content |
| Missions | `src/missions/api.ts` (`MissionsApi`) | missions |
| UI kit | `src/ui/kit/` | ui |
| Computer apps | `src/computer/apps.ts` registry | computer teams |

## Overlays and input
`ui.overlay` decides what owns input:
* `none` — 3D first-person (pointer lock, WASD, E/F/R interact, 1-9 tools, Tab Field Manual, Esc pause).
* `computer` — camera focused on the workstation monitor; the desktop (`src/computer/Desktop.tsx`) covers the
  screen. Esc or "Stand up" returns.
* `tablet` — camera focused on a rig's status tablet; the dashboard UI is rendered by React over it.
* `quiz`, `pause`, `settings`, `manual`, `briefing`, `debrief`, `drill`, `main-menu` — full UI overlays;
  pausing overlays freeze the sim clock.

## Testing
* `npm test` — vitest: sim behaviours (status machine, health check, checkout, xy_touch, power faults,
  tethered runner, pigeon parser, terminal commands), content integrity (ids unique, every quiz references
  existing facts, every core fact is covered by ≥2 questions), mission scripts reference valid ids.
* `npx playwright test` — `tests/e2e/smoke.spec.ts` builds and previews the game, then in Chromium (SwiftShader
  WebGL) checks: boot to the title with no console errors; Enter → new profile → main menu; Academy M01 starts
  and Space advances the first line; sitting at the workstation (look at the chair, E) and opening Orca shows
  the robot list; the Field Manual finds "5444"; a 5-minute Shift starts and a ticket arrives.

## Gameplay contract changes (stage 2: missions/UI contracts)

The gameplay layer (GP = `docs/design/20-gameplay.md`, Cur = `docs/design/10-curriculum.md`) is fixed by
these files. Builders code against them; changes are additive and announced.

| Contract | File(s) | Implemented / used by |
|---|---|---|
| Root state slices | `src/core/state.ts` (root, settings, controls, tools, overlays, UI, defaults) re-exporting `src/core/sessionState.ts` (session: academy run, quiz, drills, Free Play, cert, Weak Spot, computer gating, results), `src/core/arcadeState.ts` (tickets, shift, pipelines, penalty/bonus logs) and `src/core/progressState.ts` (persisted profile) — always import from `@/core/state` | missions write, UI reads, persistence saves `progress` |
| Gameplay events | `src/core/events.ts` (`mission.*`, `ticket.*`, `shift.*`, `pipeline.*`, `gw.triggered`, `pb.awarded`, `drill.*`, `freeplay.*`, `cert.*`, `xp.gained`, `rank.*`, `achievement.unlocked`, `streak.updated`, `mastery.changed`, `tool.*`, `item.*`, `dialogue.*`, `quiz.finished`, `flashcard.reviewed`, `computer.windowsChanged`, `workstation.cardSwiped`) | missions emit via `ctx.emit`; UI/audio/achievements listen |
| Mission authoring | `src/missions/types.ts` → `src/missions/contract/{common,conditions,lesson,incident,arcade,progression}.ts` | academy (`src/missions/academy/M##.ts`), incidents (`src/missions/incidents/`), drills, runtime |
| Mission runtime API | `src/missions/api.ts` (`MissionsApi`), exposed as `missions` from `@/missions` (stub until the runtime lands) | UI, world (inventory calls), computer (LabChat replies via the chat-reply provider) |

### Rules this stage adds
1. **Conditions are data.** Success conditions/objectives are built with `p.*` (typed probes over the GP §3.3
   state paths), `c.*` (logic, comparisons, event history, invariants, deferred `verify`) and `on()` (event
   matchers). The runtime owns the evaluator and the probe resolver (the only code that maps DSL paths onto
   `LabState`). `custom` conditions are the escape hatch. Deferred `verify` nodes implement "at the next health
   check" / "next build": tickets go to `verifying` and auto-resolve.
2. **Content is not duplicated.** Display data for ranks (`src/content/ranks.ts`, `RankDef.id` = `CareerRankId`),
   achievements (`ACHIEVEMENTS_BY_ID`), exams (`EXAMS_BY_ID`), modules (`MODULES_BY_ID`), tags (`src/content/tags.ts`)
   and people (`src/content/team.ts`, `TeamMember.key` = `NpcKey`/speaker) stays in content; missions add only the
   executable parts keyed by the same ids (`AchievementRule`, `RankGateRule`, `CertPracticalDef`, `LessonDef`).
3. **Scenarios.** Incident/lesson/cert setups are `SetupSpec` (`preset` per Sim §6.5 + `scenario` items =
   `FaultSpec | SetupOp`, Sim §4.5, with `$R/$PI/$DEV/$BOX/$PROBE/$T` placeholders filled from the binding) and are
   applied with `sim.faults.injectAll`. `IncidentDef.reveal` says when Arcade opens the ticket (Sim §4.1.9).
4. **Two clocks for missions.** Game ms (`lab.time.nowMs`) for timestamps; session real seconds
   (`session.clockS`, advanced from the loop: realMs = dtGameMs / timeScale) for shift time, SLAs, par, hint
   ladders, drill timers. Real dates (Leitner, streaks, daily seed) only via `dayNumber()` in `@/core/persistence`
   at the runtime's boundary — never `Date.now()` in mission logic.
5. **Sanctioned cross-layer imports for missions (data/contract only):** `@/world/layout` (pure data:
   `LOCATIONS`, `PROP_ALIASES`, `RIGS` role tags) and `@/computer/apps` (no React runtime: `requestOpenApp`,
   `requestHint`/`clearHint`, `setChatReplyProvider`, `matchRoute`). Nothing else from world/computer/ui.
6. **Workstation bridge.** Missions gate apps through `session.computer` (`unlockedApps`, `restrictions`,
   `forceHealthCheckButton`, `tabCompletion`) and drive the desktop through the apps.ts bridge; the desktop pins
   `session.objectives`. LabChat ticket replies arrive as `app.action` `chat.reply.chosen` → `missions.replyTicket`.
7. **Tools.** Hotbar per `HOTBAR_SLOTS` (1 screwdriver · 2 multimeter · 3 spare blade fuse `spare-fuse-5v` ·
   4 Ethernet cable · 5 test card). Tool modes (`R`) live in `session.toolModes` (fuse rating, meter mode, card,
   bit); pockets in `session.items`. World verbs read the rating from `toolModes.fuseRating` and call
   `missions.useItem/takeItem`; `spare-fuse-12v` is a deprecated alias (never selected).
8. **Pausing.** `PAUSING_OVERLAY_KINDS` (state.ts) is the authoritative set; `tickets`, `notebook`, `sandbox`,
   `drill`, `computer`, `tablet`, `inspect` do not pause (the shift keeps running).

### Integration items (status)
* `core/game.ts` uses `PAUSING_OVERLAY_KINDS` (done). The mission runtime drives itself from `missions.init()`
  (`src/missions/runtime/driver.ts`); `missions.tick(dtGameMs)` / `missions.frame(dt)` exist for a host that
  wants to drive it explicitly (calling them switches the internal driver off).
* `core/persistence.ts`: `migrateProgress()` deep-merges every nested default (`streak`, `stats`, `flashcards`,
  `shifts`, `daily`, `freeplay`, `fieldManual`, `notebook`, `cosmetics`, `settings.bindings`, …) into older saves
  (done; `src/core/persistence.test.ts`). Still open: the separate per-profile keys of GP §7.1
  (`labsim.leitner.v1:<id>`, `labsim.cert.v1:<id>`, `labsim.checkpoint.v1:<id>`, `labsim.leaderboards.v1`) —
  everything is kept inside the one `labsim.progress.v1` record today.
* World fuse verbs use `requiresTool: 'spare-fuse-5v'` (done).

## Simulation contract changes (Sim = `docs/design/40-simulation.md`, state v2)

The sim contracts (`src/sim/types.ts`, `events.ts`, `api.ts`) were extended **additively** for Sim
§0.4, §1.15 and §4–§6. Nothing was renamed; where Sim names a member differently, both exist and the
doc comment says which is authoritative. Code written against the old contract keeps compiling, with the
exceptions listed under "Type changes".

### Split of the sim (next stage)
* **sim-core** (`src/sim/impl/**`, `src/sim/seed/*` except repos/jenkins/fixtures, `src/sim/systems/*`
  physical + Orca + faults engine): lifecycle, `orca`, `rig`, `device`, `power`, `host`, `collis`,
  `camera`, `laz`, `ocr`, `printer3d`, `chat`, `faults`; tick slots 1–8 and 13–16 (Sim §3.1.1).
* **sim-devops** (`src/sim/devops/**`, repos/jenkins/fixture seeds, runners, terminal, git/NPC, ollama):
  `git`, `jenkins`, `runner`, `ollama`, `terminal`; tick slots 9–12 via `tickDevops()`; reaches the
  physical lab only through `CoreServices` (bound by `impl/index.ts`). Table at the top of
  `src/sim/impl/index.ts`.
* Skeleton status: `sim.tick` (sub-steps ≤ 50 phys ms, §3.1.1 order), `reset` (presets), `snapshot`,
  `restore`, `load` (+ v1→v2 migration), `setTimeScale`, `fastForward`, `skipToNextHealthCheck`,
  `setFlag`, `setConfig`, `presets`, `chat.*`, timers and housekeeping caps work; every other method
  answers `{ ok: false, error: 'not implemented' }` (or an empty pure read) until its half lands.

### Additions (selection; full list = Sim §0.4 + §1.15)
* `LabState`: `rngStreams`, `config: SimConfig`, `network`, `local`, `ubi`, `printer3d`, `timers`, `seq`;
  `time.physMs` / `epochDate` / `healthAnchorMs` (two clocks, Sim §0.3). Constants `LAB_STATE_VERSION = 2`,
  `EPOCH_DATE`, `DEFAULT_SEED = 20261005`, `HEALTH_CHECK_INTERVAL_MS`, `SIM_SUBSTEP_MS`, `TIME_SCALES`,
  `RNG_STREAMS`, `DEVICE_TYPE_CODES`, `FAILURE_CODES`.
* Orca: robot `preFailureStatus`, `statusChangedMs`, `statusHistory`, `reservedAtMs`, `lastReleasedMs`,
  `lastHealth`, checkout `statusAtCheckout`/`kind`; notes `kind`/`repeat`/`lastAtMs`; device `name`;
  capability `key`/`value` (+ lookup `'BOTH'`); merchant region/display/tax bp/tips/QR/signature/brands/apps;
  screen `deviceType`/`display`; card `pin`/`pan`/`expiry`; compare `usedBy`; health log, DB connection,
  pending gort syncs.
* Rigs: offscreen, probe display, limit switches, solenoid connector, dip-arm tooth offset, door, banner
  text, motion fault, lock owner, current command, motion host, cradle, assembly, webcam camera id/aim.
* Devices: `firmwareInfo` (authoritative; `firmware: string` mirrors the version), `lastReceiptDoc`
  (authoritative; `lastReceipt: string` mirrors the 32-column text), `adbTcpPort`, `state`, battery,
  pay-display link + hub cables, launcher, CFD layout/label shift, printer, secure touch, logcat;
  `DisplayState` auto-advance/render-done/toast/strokes/PIN digits; more `ScreenName`s.
* Hosts: `osName`, `aliases`, `eth`, `underVoltage`, boot fields, `diskUsedGb`, `files`, `journal`,
  `schedTasks`, `usb`, `offscreen`; services `startedPhysMs`/`startDelayMs`.
* Power: regulators, DC terminals, sparks, strip breaker, PSU label/hiccup, fuse label/removed/stress
  (optional in the type for old fixtures).
* Jenkins/runners: job `views`/`script`/`savedParams`/`exists`/`merchantPolicy`, build `envMasked`/`runner`,
  `RunnerState`, `LocalRunState`, views and next build numbers; executors **8**.
* Faults: `ActiveFault.target`/`clearedBy`/`clearedByActor`/`undo`/`holdSincePhysMs`; `FaultInfo` metadata;
  `SetupOp`, `ScenarioItem`, `faults.injectAll`/`applySetup`/`setupCatalogue` (catalogue = Sim §4).
* `SimApi`: `fastForward`, `setConfig`, `load`, `presets`; `orca.forceHealthCheck`/`matchPreview`/
  `capabilityDocument`; `rig.dragCarriage`/`setDoor`/`reseat`/`replaceCradle`/`alignDipArm`/`moveMotorUsb`/
  `aimWebcam`/`setTabletTab`; `device.signStroke`/`pressKey`/`enterText`/`loadPaper`/`reseatHub`/`layout`;
  `power.removeFuse`/`insertFuse`/`toggleRegulator`/`resetBreaker`; `host.pressPowerButton`/`writeFile`/
  `deletePath`/`startService`/`replaceEthernet`/`plugUsb`/`runSchedTask`; new `camera` and `printer3d`
  namespaces; `ocr.frame`; `git.requestChanges`/`comment`/`closePullRequest`/`revert`/`deleteFile`/
  `moveFile`/`discard`; `jenkins.saveJob`/`configureScript`/`moveJob`/`createJob`/`deleteJob`/`job`;
  `chat.schedule`; `runner.runLocal(…, opts)`.
* Events: Sim §5 (≈ 60 NEW events, new optional fields on existing ones). `TouchResult` exported.

### Type changes (compatible for readers; check writers)
* `Host.os` narrowed from `string` to `HostOs` (`'RUNNING' | 'HUNG' | 'BOOTING' | 'OFF'`) — the OS product
  name moved to the new `osName`.
* `WorkstationState.locallyRunningTest.robotId` widened to `number | null`.
* Unions widened: `CapabilityLookup` (+`'BOTH'`), `RigMotionCommand.kind`, `ScreenName`, `OrderState.status`,
  `LazRun.step`, `JenkinsJob.runner` (+`'vision'`), `rig.parkStarted.axes` (+`'all'`).
* Inputs widened: `CheckoutRequest.deviceType` (raw string), `.capabilities` (`string[] | Record`),
  `orca.card` / `device.presentCard` profile (id **or** name), `power.measure(pointId, mode?)` now returns
  `MultimeterReading` (superset; `kind` adds `'OHM'`).
* `orca.card` returns `Result<CardActionResult | undefined>`; `RigMotionCommand.source` is required.
* New required fields inside existing objects break hand-written fixtures; use the builders exported from
  `@/sim` (`createDisplayState`, `createOrderState`, `createRigState`, `createTerminalDevice`, `createHost`,
  `createOrcaRobot`, all with Sim §2 factory defaults + overrides). `Fuse.labelA/removed/stress` are optional
  for the same reason. Currently affected: `src/render2d/render2d.test.ts` (DisplayState, OrderState,
  RigState gantry/solenoid/webcam/tablet literals).

### Requests to other owners
* World (`30-world.md`, `src/world`): bind prop ids to sim ids per Sim Appendix C (power ids, tablet texts,
  API names `alignDipArm`/`moveMotorUsb`/`reseat`/`aimWebcam`/`device.reseatHub`, host `gpu-blade`); hit
  tests and Orca seeds use the sim's firmware layouts (Sim §2.10.2), not the world's layout classes.
* Missions/content: scenarios per Sim §4.5 and Appendix A; Arcade reveal events per §4.1.9.
* `core/game.ts`: unchanged contract (`sim.tick(dtGameMs)` per loop step); Free Play save/load should use
  `sim.snapshot()` / `sim.load()` (Sim §6.4).
