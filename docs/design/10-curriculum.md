# LabSim: Academy Curriculum

> **Doc:** `docs/design/10-curriculum.md` · **Depends on:** `00-canon.md` (wins every conflict) and
> `docs/reference/REMOVED-internal-reference.md` (domain source of truth) · **Feeds:** Academy mode,
> Field Manual (codex + flashcards), Arcade drill/incident content, certification exams.

This document is the complete teaching contract for LabSim. It lists **every teachable fact** in the
reference (Section 1) and gives the **18 Academy modules** that teach and practise them in the 3D lab and on the
in-game computer (Section 2). It also holds the **quiz bank** that tests them (Section 3), the **flashcards** for
Leitner spaced repetition (Section 4) and the **certification blueprints** (Section 5). Implementers
transcribe the tables as-is into `src/content/*` data files (types in `src/content/schema.ts`) and the lesson scripts into
`src/missions/academy/`. Section 8 gives the field mapping.

**Totals:** 245 facts (169 core · 64 supporting · 12 trivia) · 18 modules ·
382 quiz items · 159 flashcards · 5 certification ranks.

---

## 0. Conventions, illustrative data and shared anchors

### 0.1 ID schemes

| Prefix | Meaning | Example | Stability rule |
|---|---|---|---|
| `F###` | Teachable fact from the reference | `F198` | Never renumber; append new facts at the end |
| `M##` | Academy module | `M14` | Fixed order M01→M18 |
| `CP-M##.n` | Quiz checkpoint inside a module lesson | `CP-M14.1` | Lists the quiz items it draws |
| `Q###` | Quiz item | `Q260` | Never renumber; retired items keep their ID with `retired: true` |
| `FC###` | Flashcard | `FC112` | Never renumber |
| `S##` | Sim-only illustrative detail (§0.3) | `S06` | Never tested as a real-world fact |
| `CERT-R#` | Certification exam for rank R# | `CERT-R3` | |
| `loc.*` / `prop.*` / `npc.*` / `app.*` | World locations, props, NPCs, computer apps used by lesson steps (§0.5). Kebab-case segments, matching the `LocationAnchor` id convention in `src/engine/types.ts` (`loc.rack-a`, `loc.power-wall`) | `prop.walle.power-panel` | World/app docs must expose these IDs (or alias them) |
| `deck.M##` | Flashcard deck unlocked by a module | `deck.M09` | |
| `INC-*` | Arcade incident type that drills a module's facts (§6) | `INC-PORT-COLLISION` | Proposed names; the gameplay doc owns scoring |

### 0.2 The illustrative marker †

The reference is silent on many concrete details a simulator needs: IP addresses, REST paths, job names,
serials, prices, log lines. Where this document invents such a detail, it marks it with **†**. Rules:

1. Every † detail is consistent with `00-canon.md` and never contradicts the reference.
2. The Field Manual shows an **"Illustrative (sim only)"** badge next to any † string it displays.
3. Quiz items whose explanation says *illustrative* are marked † in the bank. **They are excluded from
   certification written exams** but may appear in Academy checkpoints and Arcade. Current list: Q128, Q137, Q220.
4. Everything *not* marked † in a quiz answer or flashcard back is a fact from the reference (or a photo in
   `docs/reference/images/`) and is cited by `F###`.

### 0.3 Sim-only illustrative facts (never tested as real-world truth)

| ID | Detail | Origin |
|---|---|---|
| S01 | Orca's pool holds **42** rigs named after famous robots (reference: "40+"). 12 are physically modelled. `Gort` is a repo, not a rig. | canon |
| S02 | Host map: GPU blade `10.42.1.5`; Orca `orca.lab.local` → `10.42.1.10:8080` (MySQL schema `orca`, port 3306); Jenkins `10.42.1.11:8080`; Ollama `10.42.1.12:11434` (vision model `llava`); Robot Pis `10.42.10.<n>` (REST `:8000`, MJPEG `:8081/stream.mjpg`); Callus boxes `10.42.20.<n>:9000`; LabSim devices `10.42.30.<n>` (ADB **5444**); your workstation `10.42.50.17`; coworker desk devices `10.42.60.<n>` (ADB 5555). | canon |
| S03 | Device Type enum strings `STATION_2018, STATION_2, STATION_DUO, STATION_DUO_2, STATION_DUO_3, MINI_2, MINI_3, MINI_4, FLEX_1, FLEX_2, FLEX_3, FLEX_4, FLEX_POCKET, COMPACT`; shared Flex 3/4/Pocket profile name `FLEX_GEN3`; config.properties `deviceType` uses the family (`Mini`, `Flex`, `Station`). | canon |
| S04 | "The presenter" who created uia-remote is called **Morgan** in game. | canon |
| S05 | Rig roster, device assignments, IPs and start statuses in §0.4. | this doc |
| S06 | REST paths: Pi health `GET http://10.42.10.<n>:8000/health` → `200 {"status":"ok"}`; Orca `POST /api/xy_touch` body `{"robot","screen","button"}`; Orca `POST /api/card/{swipe\|dip\|tap}` body `{"robot","profile"}`; Pi URL mappings `/adb`, `/dip`, `/tap`, `/swipe`. | this doc |
| S07 | Jenkins jobs (§0.6) and parameter names `ROBOT_NAME`, `DEVICE_TYPE`, `MERCHANT`, `CARD_PROFILE`; console env-block keys `RUN_TYPE`, `PORT_NUMBER`, `THEME`, `KERNEL_TYPE`, `APP_ID`, `APP_SECRET`, `API_KEY`. | this doc |
| S08 | Card profile names, the Visa test Track Data string, Gort paths `cards/emv/*.json`, `cards/nfc/*.json`, the scheduled task name `GortCardSync`, Windows path `C:\gort\cards\…`. | this doc |
| S09 | Merchant names (`AUTO-US-NOPIN-01/02`, `GO-SDK-US-01`, `PAYCORE-STANDALONE-01`, `WESTERS-CA-01`) and their App ID / API Key values. | this doc |
| S10 | Screen names (`TENDER_CASH_DISCOUNT`, `PIN_ENTRY`, `RECEIPT_OPTIONS_4`, `RECEIPT_OPTIONS_5`) and every millimetre value; the QR shift is modelled as **3.0 mm**. | this doc |
| S11 | Tax Item 5 = $10.00 at 8.25 % → tax $0.83, total $10.83. | this doc |
| S12 | config.properties key names `unlockPasscode`, `backendEnv`, `robotName`; serials `SIM-…`. | this doc |
| S13 | Tablet overlay "TEST IN PROGRESS — CONTROLS LOCKED"; yellow banner text "Status: LOCK RELEASED — PARK REQUIRED"; only Park All clears the error (Park XY / X / Y home just those axes and leave the banner yellow). | this doc |
| S14 | Pi service name `robot-controller`, Wine binary path, `df` figures, Pi prompt `pi@wall-e:~ $`. | this doc |
| S15 | Ollama prompt/response and the receipt numbers ($42.00, 18 %, $7.56 vs $7.65). | this doc |
| S16 | GitHub org `labsim-lab`; Gort top-level folders `cards/`, `config/`, `go-sdk/`, `suites/`; Pigeon folders `runners/{rest,android,windows,ios}`, `tests/`, `tests/_templates/`. | this doc |
| S17 | Function of the tablet's **Phone** group (drives a phone carriage Forward/Back and a power-button pusher, used for mobile-runner tests). The photo shows the buttons but not their purpose. | this doc |
| S18 | Lab Safety Card wording (M01 step 13). | this doc |
| S19 | *How* port 5555 reached a coworker's device in M14 (the runner's connect to the lab device on 5555 is refused, and it falls back to the first device the workstation's ADB server already knows). The reference says only that 5555 caused collisions in which scripts connected to and controlled coworkers' desk devices. | this doc |
| S20 | Seeded faults used by lessons: Rack B fuse, EVE Pi unplug, JONNY-5 typo, BUMBLEBEE Offset Y 1.5, OPTIMUS empty MFD/CFD, missing API Key, Pigeon missing comma, MINI_3 receipt coordinates, `DEVICE_TYPE=flex_3`. | this doc |

### 0.4 Rig roster used by lessons (S05, illustrative)

If the world/sim docs assign devices differently, they win. Lessons only need these **roles**: a Flex 3 touch robot
(WALL-E, matches the photos and video), a Station Duo touch robot, a Compact touch robot (Canada), an Unavailable
PayCore rig, a tethered MFD/CFD pair on DEV1 and on STG (photo), and two ADB bots.

| Name / Human Readable Name | Kind | Location | Device(s) · DeviceType | Device IP | Robot Pi | Camera Stream URL | Merchant† | Status at Academy start |
|---|---|---|---|---|---|---|---|---|
| `wall-e` / WALL-E | Touch robot | `loc.rack-a` | Flex 3 · `FLEX_3` | 10.42.30.11 | 10.42.10.11 | `http://10.42.10.11:8081/stream.mjpg` (dedicated) | AUTO-US-NOPIN-01 | Available (running build #4120 during M01) |
| `eve` / EVE | Touch robot | `loc.rack-a` | Flex 4 · `FLEX_4` | 10.42.30.12 | 10.42.10.12 | dedicated | AUTO-US-NOPIN-01 | Available |
| `bumblebee` / BUMBLEBEE | Touch robot | `loc.rack-a` | Mini 3 · `MINI_3` | 10.42.30.13 | 10.42.10.13 | dedicated | AUTO-US-NOPIN-01 | Available (legacy Offset Y = 1.5 until M07) |
| `r2-d2` / R2-D2 | Touch robot | `loc.rack-a` | Station Duo · `STATION_DUO` (one terminal, MFD + CFD) | 10.42.30.14 (MFD = CFD) | 10.42.10.14 | dedicated, aimed at the CFD | AUTO-US-NOPIN-01 | Available |
| `johnny-5` / JOHNNY-5 (typo `JONNY-5` until M07) | Touch robot | `loc.rack-b` | Flex 1 · `FLEX_1` → Flex 2 · `FLEX_2` in M07 | 10.42.30.15 | 10.42.10.15 | shared Rack B camera `http://10.42.10.40:8081/stream.mjpg` | AUTO-US-NOPIN-01 | Available |
| `baymax` / BAYMAX | Touch robot | `loc.rack-b` | Station 2018 · `STATION_2018` | 10.42.30.16 | 10.42.10.16 | shared Rack B camera | AUTO-US-NOPIN-01 | Available (player sets Offline in M06) |
| `seti` / SETI | Touch robot (Westers / Canada) | `loc.rack-b` | Compact · `COMPACT` | 10.42.30.17 | 10.42.10.17 | shared Rack B camera | WESTERS-CA-01 (PIN required) | Available |
| `rosie` / ROSIE | Touch robot (PayCore standalone) | `loc.rack-b` | Flex Pocket · `FLEX_POCKET` | 10.42.30.18 | 10.42.10.18 | shared Rack B camera | PAYCORE-STANDALONE-01 | **Unavailable** |
| `megatron` / MEGATRON | Tethered test bed, env **DEV1** | `loc.rack-tethered` | MFD Station 2 · `STATION_2` + CFD Mini 2 · `MINI_2` | 10.42.30.21 / .22 | 10.42.10.20 (one per shelf) | `http://10.42.10.20:8081/stream.mjpg` | AUTO-US-NOPIN-01 | Available |
| `optimus` / OPTIMUS | Tethered test bed, env **STG** | `loc.rack-tethered` | MFD Mini 3 + CFD Mini 3 · `MINI_3` (nested) | 10.42.30.23 / .24 | 10.42.10.20 | same as MEGATRON | AUTO-US-NOPIN-01 | Available (MFD/CFD fields empty until M07) |
| `data` / DATA | ADB bot | `loc.adb-shelf` | Mini 3 · `MINI_3` | 10.42.30.31 | 10.42.10.30 | — | AUTO-US-NOPIN-01 → 02 in M08 | Available |
| `tars` / TARS | ADB bot | `loc.adb-shelf` | Flex 4 · `FLEX_4` | 10.42.30.32 | 10.42.10.30 | — | AUTO-US-NOPIN-01 | Available |

Windows boxes†: `MINIX-01` 10.42.20.1 (Callus `:9000`, Collis probes for Rack A); `MINIX-02` 10.42.20.2 (Callus for Rack B + tethered rack);
`NUC-03` 10.42.20.3 (Windows Intel NUC, retired from hardware control, sticky note in M05). Coworker desk Flex†: 10.42.60.4 (ADB 5555).

### 0.5 Anchors used by lesson steps

**Locations**

| ID | Name | What is there |
|---|---|---|
| `loc.entrance` | Lab entrance | Badge door, spawn point |
| `loc.workstation` | Your workstation | Desk + chair, dual monitors, PC `10.42.50.17`; all `computer-task` steps start seated here |
| `loc.morgan-desk` | Morgan's desk | Next to yours |
| `loc.rack-a` | Touch Rack A | WALL-E, EVE, BUMBLEBEE, R2-D2; rack-unit rail numbers; ruler `prop.ruler` |
| `loc.rack-b` | Touch Rack B | JOHNNY-5, BAYMAX, SETI, ROSIE; shared Rack B camera |
| `loc.rack-tethered` | Tethered rack | MEGATRON (DEV1) and OPTIMUS (STG) screens, SmartStripe Probes, hub docks, shelf Pi (matches photo) |
| `loc.adb-shelf` | ADB bot shelf | DATA, TARS |
| `loc.device-library` | Device library | One of every LabSim device + "upcoming" boxes + family trays |
| `loc.power-wall` | Power wall | Mean Well PSU, 24V rail, 12V and 5V 10A regulators, inline fuses, AC power strips, work bench |
| `loc.callus-shelf` | Callus shelf | MINIX-01, MINIX-02, NUC-03, Collis probes, ribbon cables |
| `loc.server-shelf` | Server shelf | 4-GPU blade (2 on top, 2 underneath), retired tower on the floor |
| `loc.print-corner` | 3D print corner | Prusa and Bambu Lab printers, CAD screen |
| `loc.jared-bench` | Jared's bench | Soldering station, bolt bins, red/blue parts bins, Husky tool chest |
| `loc.coworker-desks` | Office desks | Coworker NPC and their desk Flex (5555) |
| `loc.whiteboard` | Architecture whiteboard + roadmap board | Drag-and-drop diagram and roadmap |
| `loc.history-wall` | Team history wall | Framed team timeline + match plaques |

**Props** (IDs must exist in the world build; descriptions are what the inspect callout shows)

| ID | Description |
|---|---|
| `prop.walle.tablet` / `prop.johnny5.tablet` / `prop.seti.tablet` | Front-mounted Android status tablet (header, tabs, Motion Control groups as in the photo) |
| `prop.walle.power-panel` | POWER panel: two green LEDs, toggles MAIN and MOTOR, LabSim logo |
| `prop.rack-a.rail-labels` | Rack-unit numbers 29–40 on the rails |
| `prop.seti-panel` | Vertical "SETI" lettered panel with USB ports (Minix box / Raspberry Pi) |
| `prop.printer.prusa`, `prop.printer.bambu` | 3D printers |
| `prop.safety-card` | Lab Safety Card (S18) |
| `prop.walle.door` | Enclosure door |
| `prop.walle.stepper-x` | NEMA-17 + GT2 pulley on 2020 extrusion, V-slot wheels |
| `prop.walle.motor-pcb` | 25-pin motor controller PCB, "MADE IN HONG KONG"† silkscreen |
| `prop.walle.cradle` | Angled 3D-printed cradle holding the Flex 3 |
| `prop.walle.webcam` | Rig webcam |
| `prop.walle.carriage` | Gantry carriage with blue push-pull solenoid (draggable when the door is open) |
| `prop.walle.limit-switch-x`, `prop.walle.limit-switch-y` | Physical limit switches at (0,0) |
| `prop.walle.dip-arm` | Rotating dip arm, sector gear marked "63", white ribbon card |
| `prop.walle.pi` | Raspberry Pi in black case |
| `prop.bolt-bins` | 2.5 mm and 5 mm bolt bins (sorting mini-game) |
| `prop.device-library.<model>` | One per device model (`station-2018`, `station-2`, `station-duo-1`, `station-duo-2`, `box-duo-3`, `mini-2`, `mini-3`, `box-mini-4`, `flex-1`…`flex-4`, `flex-pocket`, `compact`) |
| `prop.family-trays` | Four labelled trays: STATION, MINI, FLEX, COMPACT |
| `prop.megatron.mfd`, `prop.megatron.cfd`, `prop.optimus.mfd`, `prop.optimus.cfd` | Tethered screens with labels like `MEGATRON MFD DEV1` |
| `prop.smartstripe-probe` | USB "SmartStripe Probe" dongle with green LED |
| `prop.hub-dock` | 3D-printed dock with LabSim connectivity hub (Ethernet, USB, power) |
| `prop.meanwell-psu` | Mean Well transformer, label "INPUT 120VAC · OUTPUT 24VDC"† |
| `prop.power-trace` | Clickable power-path nodes (power-trace mini-game) |
| `prop.regulator-12v`, `prop.regulator-5v10a` | Step-down regulators with rating labels |
| `prop.fuse-5v-b`, `prop.fuse-spares`, `prop.multimeter` | Rack B 5V inline fuse, spare fuses, multimeter |
| `prop.ac-strip` | Commercial AC power strip |
| `prop.flex4-psu-brick`, `prop.collis-probe-spare` | New Flex 4 power supply, spare Collis probe (plug-in puzzle) |
| `prop.nuc-03` | Intel NUC with the corporate sticky note |
| `prop.minix-01` | Minix box running Callus (screen shows service status) |
| `prop.collis-probe-a` | Grey Collis probe, "UL Transaction Security", rear ribbon cable |
| `prop.eve.pi-power` | EVE's Pi power lead (unpluggable) |
| `prop.eve.device`, `prop.seti.device`, `prop.data.device`, `prop.tars.device` | Rig devices that show live screen content |
| `prop.ruler` | Steel ruler (measurement interaction, snaps to screen top-left) |
| `prop.r2d2.mfd`, `prop.r2d2.cfd` | Station Duo's two displays |
| `prop.coworker-device` | Coworker's desk Flex (ADB 5555) |
| `prop.whiteboard` | Architecture diagram builder |
| `prop.roadmap-board` | Roadmap sorter (TODAY / IN PROGRESS / PLANNED / RETIRED / PHASING OUT) |
| `prop.gpu-blade`, `prop.legacy-tower` | 4-GPU blade (crouch to see GPUs 3–4), retired tower |
| `prop.history.semi`, `prop.history.sedi`, `prop.history.ipx`, `prop.history.paycore`, `prop.history.match` | History wall frames and the team-match plaques |

**NPCs**: `npc.morgan` (onboarding, uia-remote author), `npc.jared` (hardware lead), `npc.tate` (Orca developer),
`npc.david` (SDK frameworks / dynamic JSON capabilities), `npc.coworker` (unnamed office coworker). All text uses
names or they/them, never gendered pronouns (canon).

**Computer apps**: `app.orca`, `app.jenkins`, `app.intellij`, `app.terminal`, `app.gimp`, `app.github`,
`app.camera` (camera streams + snapshots + recorded playback), `app.ollama`.

### 0.6 Illustrative strings used by lessons (S06–S12)

| Kind | Values† |
|---|---|
| Jenkins views / jobs | Views `Java`, `iOS`. Jobs `Java/uia-remote-regression-flex`, `Java/uia-remote-regression-mini`, `Java/uia-remote-tethered-tax`, `Java/go-sdk-sale-smoke`, `Java/laz-oobe-merchant-swap`, `Java/contact-canada-pin-sale`, `Java/pigeon-android-sale-swipe`, `iOS/pigeon-ios-go-sdk-smoke` |
| Jenkins parameters | `ROBOT_NAME` (blank = any matching Available robot), `DEVICE_TYPE` (enum, ALL CAPS), `MERCHANT`, `CARD_PROFILE` |
| Card profiles | `VISA_STD_SWIPE` (Track Data), `VISA_STD_DIP` → `cards/emv/visa_std_dip.json`, `VISA_STD_TAP` → `cards/nfc/visa_std_tap.json`, `INTERAC_CA_DIP` → `cards/emv/interac_ca_dip.json`, PayCore-owned `AMEX_MATRIX_DIP`, `DISCOVER_MATRIX_DIP` |
| Merchants | `AUTO-US-NOPIN-01`, `AUTO-US-NOPIN-02`, `GO-SDK-US-01` (App ID `app_sim_7f3a`, API Key `key_sim_19c0e2`), `PAYCORE-STANDALONE-01`, `WESTERS-CA-01` |
| Screens (FLEX_4) | `RECEIPT_OPTIONS_4`: Print (34.0, 71.0), Email (34.0, 83.0), Text (34.0, 95.0), No Receipt (34.0, 107.0). `RECEIPT_OPTIONS_5`: Print (34.0, 74.0), Email (34.0, 86.0), Text (34.0, 98.0), No Receipt (34.0, 110.0), Scan for receipt (34.0, 122.0). Units mm from top-left (0,0). |
| Screens (FLEX_3) | `TENDER_CASH_DISCOUNT`: Cash (22.0, 58.5), Card (62.0, 58.5) |
| Screen compare (R2-D2) | `CFD_TOTAL`: x 412, y 288, w 236, h 44 px, expected `TOTAL $10.83` |

---

## 1. Fact inventory

Tiers: **core**: needed to do the job on day one; must be tested by ≥ 2 quiz items and appears in
certification. **supporting**: context that makes core facts make sense; tested by ≥ 1 item. **trivia**:
colour and lab lore (build numbers, photo details); tested by ≥ 1 item, drawn only in the R5 exam and Arcade
bonus rounds. *Ref* = reference section: §1.1 languages/frameworks · §1.2 infrastructure · §1.3 utilities/AI ·
§1.4 internal repos · §1.5 lab hardware · §2 architecture · §3 Orca · §3.1 statuses · §3.2 entities · §4.1 history ·
§4.2 directory · §4.3 POM · §4.4 Tax test · §4.5 config.properties · §5 Pigeon · §6.1 bots · §6.2 cards · §6.3 power ·
§6.4 motor safety · IMG-T `walle-status-tablet-front.jpg` · IMG-R `tethered-megatron-optimus-rack.jpg` ·
IMG-G `touch-robot-side-gantry.jpg` · IMG-V `solenoid-tapping-flex3.mp4`.

*Taught in* lists every module whose "Facts covered" includes the fact. In that module the fact is taught in
dialogue or inspection and practised in at least one hands-on step (`interact` or `computer-task`). For pure
lore facts the step is an `inspect` or a mini-game. *Quiz items* and *Flashcards* are the cross-references.

* Facts: **245** (core 169, supporting 64, trivia 12).
* Quiz items: **382** — fill-in 31, match 13, multiple-choice 251, ordering 14, true-false 73.
* Flashcards: **159**.
* Coverage: every core fact is tested by ≥ 2 quiz items; every supporting fact by ≥ 1; every trivia fact by ≥ 1; every fact is taught in ≥ 1 module.

| ID | Fact | Ref | Tier | Taught in | Quiz items | Flashcards |
|---|---|---|---|---|---|---|
| F001 | Java (Oracle Java) is the primary programming language powering both the Orchestrator backend and the uia-remote test automation suites. | §1.1 | core | M06, M13 | Q111, Q266 | FC109 |
| F002 | Spring Boot is the backend web framework used to build the Orchestrator monolith and its REST API endpoints. | §1.1 | core | M06 | Q080, Q081 | FC046 |
| F003 | JHipster is a rapid application development platform that scaffolded Orchestrator through an interactive setup questionnaire. | §1.1 | supporting | M06 | Q082, Q083 | FC047 |
| F004 | JHipster auto-generated Orchestrator's frontend UI, its Spring Boot REST endpoints and its MySQL database schemas. | §1.1 | supporting | M06 | Q082 | FC047 |
| F005 | Android UI Automator is Google's native Android instrumentation framework and is the engine used inside uia-remote. | §1.1 | core | M13 | Q233, Q268 | FC108 |
| F006 | uia-remote specifically uses UI Automator version 2.3. | §1.1 | core | M13, M16 | Q234, Q235 | FC108 |
| F007 | UI Automator 2.3 is chosen because it adds native support for dual-screen element location tracking. | §1.1 | core | M16 | Q235, Q343 | FC108 |
| F008 | Go (Golang) is used for the Terminal SDK. | §1.1 | supporting | M08 | Q156, Q157 | FC084 |
| F009 | The Go SDK is supported via custom extensions in Orchestrator and is tested through Pigeon and mobile runners. | §1.1 | supporting | M08, M15 | Q156, Q327 | FC084 |
| F010 | The uia-remote Android project layout mirrors the Apache Maven build-structure standard. | §1.1 | supporting | M13 | Q236 | FC113 |
| F011 | JSON is the data format used for runtime capability lookups in Orchestrator. | §1.1 | supporting | M08 | Q150 | FC159 |
| F012 | JSON is the format used to write declarative, platform-agnostic test payloads in the legacy Pigeon repository. | §1.1 | core | M15 | Q325, Q326 | FC138 |
| F013 | MySQL is the relational database engine backing Orchestrator. | §1.2 | core | M06, M17 | Q084, Q365 | FC048 |
| F014 | Orca's MySQL database stores all hardware states, merchant profiles and screen-coordinate tables (robots, devices, screens, card profiles, merchants). | §1.2 | supporting | M07 | Q139 | FC048 |
| F015 | Jenkins is the CI/CD execution engine, called the "Executor". | §1.2 | core | M11 | Q214, Q224 | FC102 |
| F016 | Jenkins triggers test pipelines and injects runtime environment variables into them. | §1.2 | core | M11 | Q215, Q221 | FC102 |
| F017 | Jenkins organises legacy jobs by platform, separating Java jobs from iOS jobs. | §1.2 | supporting | M11 | Q216 | FC103 |
| F018 | GitHub hosts the team's repositories (Gort, uia-remote, pigeon) for branch management and pull requests. | §1.2 | core | M13, M17 | Q267, Q364 | FC111 |
| F019 | Linux is the lightweight operating system deployed on the lab's Raspberry Pi controllers. | §1.2 | core | M05 | Q067, Q076 | FC040 |
| F020 | Running Linux on the Pis isolates hardware control loops from the corporate Windows machines. | §1.2 | supporting | M05 | Q068 | FC040 |
| F021 | Wine runs on the Raspberry Pi Linux environments to emulate the Windows-only card-programming software layers. | §1.2 | core | M05 | Q069, Q070, Q076 | FC041 |
| F022 | Docker and Google Cloud Platform (GCP) are the planned migration targets for containerising Orchestrator. | §1.2 | supporting | M17 | Q359, Q360, Q367 | FC152 |
| F023 | Orchestrator currently runs on a local, on-premise laboratory Virtual Machine (which the Docker/GCP plan would move it off). | §1.2 | core | M06, M17 | Q085, Q360, Q367 | FC049 |
| F024 | ADB (Android Debug Bridge) is the command-line tool used to inspect XML UI hierarchies and locate elements. | §1.3 | core | M12 | Q228, Q230, Q231 | FC105 |
| F025 | ADB is used to dispatch programmatic touch events to a device. | §1.3 | core | M12 | Q229, Q231 | FC105 |
| F026 | In the LabSim lab, ADB runs over port 5444. | §1.3 | core | M12 | Q225, Q226, Q232 | FC106 |
| F027 | IntelliJ IDEA is the team's primary IDE. | §1.3 | core | M13 | Q237, Q269 | FC110 |
| F028 | IntelliJ IDEA is used to import repositories, configure local properties and execute test suites from developer workstations. | §1.3 | supporting | M13 | Q238 | FC110 |
| F029 | Tesseract OCR is the open-source OCR engine run on cropped webcam screenshots to validate text on displays that are blind to ADB. | §1.3 | core | M16 | Q337, Q338 | FC145 |
| F030 | GIMP is used to open device screenshots, draw selection bounding boxes around text elements and extract exact spatial coordinates for legacy screen-comparison blocks. | §1.3 | core | M16 | Q344, Q346 | FC143 |
| F031 | Ollama is a local LLM runner hosted on the lab's 4-GPU server blade. | §1.3 | core | M17 | Q355, Q367 | FC150 |
| F032 | Ollama currently runs proof-of-concept Vision-LLM inspections of webcam streams to validate receipt layouts and tip math. | §1.3 | supporting | M17 | Q356, Q357 | FC150 |
| F033 | Claude was evaluated during corporate AI initiatives for repository optimisation and automated test generation. | §1.3 | supporting | M17 | Q358 | FC151 |
| F034 | Gort is the core monorepo housing the automated testing ecosystem and its distinct configuration modules. | §1.4 | core | M10 | Q204, Q206 | FC099 |
| F035 | Gort holds the virtual card definition files used by Dip and Tap profiles. | §1.4 | core | M10 | Q205, Q211 | FC099 |
| F036 | "Orca" is the team's short name for the Orchestrator. | §1.4 | core | M06 | Q079, Q113 | FC044 |
| F037 | Orca is an on-premise Spring Boot monolith. | §1.4 | core | M06 | Q080, Q114 | FC046 |
| F038 | Orca acts as the central Controller between Jenkins pipelines and the physical lab robots. | §1.4 | core | M06 | Q109, Q113 | — |
| F039 | uia-remote is the team's modern Java / UI Automator test repository. | §1.4 | core | M13 | Q263, Q264 | — |
| F040 | uia-remote automates both standalone devices and tethered multi-device setups across native LabSim apps. | §1.4 | core | M13 | Q263, Q270 | — |
| F041 | Pigeon, also called LSTR, is the team's legacy test repository. | §1.4 | core | M15 | Q308, Q329 | FC135 |
| F042 | The name "Pigeon" is a play on words on "pidgin language". | §1.4 | trivia | M15, M18 | Q310 | FC135 |
| F043 | Pigeon evolved from the Lester framework. | §1.4 | supporting | M15, M18 | Q311, Q382 | FC135 |
| F044 | LSTR stands for Language Specific Test Runner. | §1.4 | core | M15 | Q309, Q329 | FC136 |
| F045 | Pigeon parses raw JSON test payloads across REST, Android, Windows and iOS. | §1.4 | core | M15 | Q312, Q326 | — |
| F046 | Laz Automation is an automated provisioning framework that runs a zero-touch OOBE (Out-of-Box Experience) routine. | §1.4 | core | M08 | Q158, Q159 | FC082 |
| F047 | Laz's OOBE routine de-provisions hardware, wipes local caches, steps through the setup wizard and swaps merchants mid-suite. | §1.4 | core | M08 | Q160, Q161, Q162 | FC082 |
| F048 | Callus is also referred to as "Callers" or "Collos". | §1.4 | supporting | M10 | Q197 | FC095 |
| F049 | Callus is a microservice subsystem that runs on the local Windows/Minix boxes. | §1.4 | core | M10 | Q196, Q212 | FC095 |
| F050 | Callus reads card-profile paths from Gort and drives the physical Collis probes during virtual card transactions. | §1.4 | core | M10 | Q198, Q199 | FC096 |
| F051 | Ubi Platform is the internal routing platform used when test jobs dynamically switch merchant configurations. | §1.4 | supporting | M08 | Q163 | FC083 |
| F052 | USB Pay Display and Secure Network Pay Display are applications maintained by the Semi Team. | §1.4 | supporting | M18 | Q371 | FC155 |
| F053 | USB Pay Display and Secure Network Pay Display link Merchant Facing Devices and Customer Facing Devices over USB or the local network. | §1.4 | supporting | M18 | Q372 | FC155 |
| F054 | MFD means Merchant Facing Device and CFD means Customer Facing Device. | §1.4 | core | M02, M14 | Q012, Q013, Q305 | FC009 |
| F055 | The Station series targets are Station 2018, Station 2 and Station Duo (Duo 1, Duo 2 and the upcoming Duo 3). | §1.5 | core | M02 | Q014, Q022 | FC010 |
| F056 | The Mini series targets are Mini 2, Mini 3 and the upcoming Mini 4. | §1.5 | core | M02 | Q014, Q024 | FC011 |
| F057 | The Mini 3 is used as a hot-swap equivalent for the printerless Station Duo 2. | §1.5 | supporting | M02 | Q018, Q019 | FC014 |
| F058 | The Flex series targets are Flex 1, Flex 2, Flex 3, Flex 4 and Flex Pocket. | §1.5 | core | M02 | Q014, Q023 | FC012 |
| F059 | Flex 3, Flex 4 and Flex Pocket share exactly the same testing profile. | §1.5 | core | M02 | Q015, Q016 | FC013 |
| F060 | The Flex Pocket omits the physical printer block. | §1.5 | supporting | M02 | Q017 | FC013 |
| F061 | The LabSim Compact is the target terminal for the Canadian market and is used on the Westers test beds. | §1.5 | supporting | M02 | Q014, Q020 | FC015 |
| F062 | The Station Duo 3 and the Mini 4 are upcoming devices. | §1.5 | trivia | M02 | Q021 | FC016 |
| F063 | The lab's Raspberry Pis are cheap units of about $50 each. | §1.5 | supporting | M05 | Q064 | FC038 |
| F064 | A Raspberry Pi operates as the Robot Pi / Robot Controller on each shelf. | §1.5 | core | M05 | Q063, Q077 | FC037 |
| F065 | The Robot Pi handles ADB routing, camera streams, stepper motors, solenoids and Wine card-programming emulation. | §1.5 | core | M05 | Q065, Q066 | FC039 |
| F066 | Intel NUC and Minix boxes are the local Windows execution machines in the lab (the NUCs are listed as ASUS NUC). | §1.5 | core | M05, M17 | Q073, Q074, Q075, Q366 | FC042 |
| F067 | Aggressive corporate security-monitoring packages exhausted the disk space on the NUCs. | §1.5 | core | M05 | Q071, Q074 | FC043 |
| F068 | Because of the corporate disk exhaustion, physical hardware control was migrated off the NUCs onto Raspberry Pis. | §1.5 | core | M05, M17 | Q072, Q074, Q366 | FC043 |
| F069 | Collis probes (UL Transaction Security) are high-cost proprietary card emulators. | §1.5 | core | M10 | Q200, Q213 | FC097 |
| F070 | Collis probes connect to the rig via rear ribbon cables. | §1.5 | supporting | M10 | Q201 | FC097 |
| F071 | Collis probes simulate magnetic-stripe swipes, EMV chip dips and contactless NFC taps. | §1.5 | core | M10 | Q202, Q203 | FC098 |
| F072 | Prusa and Bambu Lab 3D printers print all of the black plastic modular shelf fixtures. | §1.5 | supporting | M01 | Q007 | FC008 |
| F073 | The shelf fixtures are drafted in CAD using simple geometric shapes. | §1.5 | trivia | M01 | Q008 | FC008 |
| F074 | Mean Well transformers are the industrial power supplies that convert 120V AC wall power to a central 24V DC rail. | §1.5 | core | M03 | Q028, Q029, Q033, Q039 | FC019 |
| F075 | Four NVIDIA GPUs are installed in a shelf-mounted server blade. | §1.5 | core | M17 | Q351, Q368 | FC148 |
| F076 | Of the four GPUs in the blade, two are exposed and two are underneath. | §1.5 | trivia | M17 | Q352 | FC148 |
| F077 | The GPU server blade replaced a legacy tower unit. | §1.5 | supporting | M17 | Q353 | FC148 |
| F078 | The GPU server blade hosts the VMs, Orca, Jenkins and Ollama. | §1.5 | core | M17 | Q354, Q365 | FC149 |
| F079 | The rigs use sub-millimetre stepper motors. | §1.5 | supporting | M04 | Q048 | FC027 |
| F080 | The rigs use remote-firing solenoids whose plunger drops onto the screen to tap. | §1.5 | core | M04 | Q047, Q058 | FC028 |
| F081 | Each rig arm is held by a magnetic lock. | §1.5 | supporting | M04 | Q059 | — |
| F082 | Physical limit switches are calibrated to the (0,0) origin. | §1.5 | core | M04, M09 | Q045, Q046, Q186 | FC029 |
| F083 | The rigs use custom 25-pin motor-controller PCBs. | §1.5 | supporting | M04 | Q049, Q050 | FC030 |
| F084 | The custom motor-controller PCBs were printed in Hong Kong. | §1.5 | trivia | M04 | Q049 | FC030 |
| F085 | A DC step-down regulator provides a 12V DC line for the Intel NUCs. | §1.5 | core | M03 | Q030, Q033, Q039 | FC020 |
| F086 | A DC step-down regulator provides a 5V DC, 10-Amp line for the Raspberry Pis. | §1.5 | core | M03 | Q031, Q032, Q033, Q039 | FC021 |
| F087 | Inline fuses protect the DC lines. | §1.5 | supporting | M03 | Q034 | FC022 |
| F088 | The rigs carry webcams (the source of camera streams and OCR screenshots). | §1.5 | supporting | M04, M16 | Q060, Q349 | FC036 |
| F089 | Each touch robot has a front-mounted status tablet. | §1.5 | core | M01 | Q001, Q003, Q011 | FC001 |
| F090 | A touch robot uses 10 ft cut aluminium rails. | §1.5 | trivia | M04 | Q051 | FC034 |
| F091 | A touch robot contains about 130 ft of wiring. | §1.5 | trivia | M04 | Q052 | FC034 |
| F092 | A touch robot has about 300 manual solder points. | §1.5 | trivia | M04 | Q053 | FC035 |
| F093 | A touch robot uses 200+ nuts and bolts in 2.5mm and 5mm diameters. | §1.5 | trivia | M04 | Q054 | FC035 |
| F094 | In the execution flow, Jenkins triggers the pipeline and injects environment variables into the test runner (uia-remote or Pigeon). | §2 | core | M06, M11 | Q110, Q112, Q222 | FC061 |
| F095 | Jenkins checks out a robot from Orca before the test runs. | §2 | core | M06, M11 | Q105, Q112, Q219 | FC061 |
| F096 | The test runner calls Orca over REST for xy_touch and for card swipe / dip / tap. | §2 | core | M06, M09 | Q106, Q112, Q172 | FC062 |
| F097 | The Windows/Minix box running Callus drives the Collis probe over a ribbon cable, and the Collis probe feeds the LabSim device's card reader. | §2 | core | M06, M10 | Q107, Q112, Q210 | FC063 |
| F098 | Orchestrator is the Controller and Jenkins is the Executor. | §3 | core | M06 | Q078, Q112, Q224 | FC045 |
| F099 | Every 5 minutes Orca runs a synchronized background thread that pings the Robot Controller on every Raspberry Pi. | §3 | core | M06 | Q086, Q087 | FC050 |
| F100 | There are exactly 5 robot operational statuses: Available, Unavailable, Offline, Connection Failed and Reserved. | §3.1 | core | M06 | Q088, Q089 | FC051 |
| F101 | Available means the robot is online, healthy and open to general pipeline checkouts. | §3.1 | core | M06 | Q090, Q104 | FC052 |
| F102 | Unavailable is a strictly reserved state: general pipelines cannot check the robot out unless an engineer passes the robot's exact unique name in the job parameters. | §3.1 | core | M06, M11 | Q091, Q104, Q115, Q220 | FC053 |
| F103 | Unavailable isolates specialised rigs (such as PayCore standalone setups) so general tests do not overwrite their merchant profiles. | §3.1 | core | M06, M18 | Q092, Q379 | FC054 |
| F104 | When an explicitly named job finishes, Orca automatically resets the robot back to Unavailable. | §3.1 | core | M06 | Q093, Q115 | FC055 |
| F105 | Offline is a manual placeholder state used while engineers physically build a rig or assemble data profiles. | §3.1 | core | M06 | Q094, Q104, Q116 | FC056 |
| F106 | Orca bypasses the 5-minute health check for Offline units. | §3.1 | core | M06 | Q095, Q116 | FC056 |
| F107 | Connection Failed is set automatically when the 5-minute REST ping to the Pi drops or returns a non-200 HTTP response. | §3.1 | core | M06 | Q096, Q097, Q104, Q117 | FC057 |
| F108 | A Connection Failed robot is blocked from checkouts. | §3.1 | core | M06 | Q098, Q117 | FC057 |
| F109 | Connection Failed opens a Notes section in the Orca UI logging the exact endpoint attempted and the error text. | §3.1 | core | M06 | Q099, Q117 | FC058 |
| F110 | Typical Connection Failed causes are a crashed Pi board or a Minix box running Callus services going offline. | §3.1 | supporting | M06, M18 | Q100, Q381 | FC059 |
| F111 | Connection Failed robots are escalated to Jared for hardware intervention. | §3.1 | core | M06 | Q101, Q117, Q381 | FC059 |
| F112 | Reserved is set manually by an engineer who is running tests locally from their workstation. | §3.1 | core | M06 | Q102, Q104, Q118 | FC060 |
| F113 | Reserved blocks both Jenkins pipelines and health-check overrides. | §3.1 | core | M06 | Q103, Q118 | FC060 |
| F114 | Orca has 7 core database schemas, generated as JHipster entities. | §3.2 | supporting | M07 | Q119, Q120 | FC064 |
| F115 | The Robot entity tracks the pool of 40+ rigs and their operational status flags. | §3.2 | core | M01, M07 | Q002, Q138 | FC006 |
| F116 | Tate built the custom UI filtering for the Robot list. | §3.2 | supporting | M06 | Q108 | FC065 |
| F117 | A robot has a Name (system identifier) and a Human Readable Name (display string). | §3.2 | core | M07 | Q121, Q140 | FC066 |
| F118 | The Human Readable Name is pushed to the physical status tablet mounted on the front of the lab enclosure. | §3.2 | core | M07 | Q011, Q122, Q140 | FC066 |
| F119 | The Robot Device field links the robot to a separate Device entity. | §3.2 | core | M07 | Q123, Q125 | FC067 |
| F120 | Decoupling the Device from the Robot means a hardware upgrade (e.g. Flex 1 to Flex 2) leaves legacy configurations intact for quick rollbacks. | §3.2 | core | M07 | Q123, Q124 | FC067 |
| F121 | Device Type is an enum that stores device dimensions, layout metrics and internal string definitions. | §3.2 | core | M07 | Q126, Q141 | FC068 |
| F122 | The Device Type enum is the reason Jenkins pipeline environment variables must be in ALL CAPS. | §3.2 | core | M07, M11 | Q127, Q128, Q218 | FC069 |
| F123 | URL Mappings store the Robot ADB Service URL, which routes to the Pi controller. | §3.2 | core | M07 | Q129, Q142 | FC070 |
| F124 | The Camera Stream URL is either dedicated per Pi or shared across 4 rigs. | §3.2 | supporting | M07 | Q130, Q142 | FC071 |
| F125 | URL Mappings also store the hardware-specific Dip, Tap and Swipe URLs. | §3.2 | core | M07 | Q131, Q142 | FC072 |
| F126 | USB Tethered Device Configuration populates MFD and CFD relations for nested setups. | §3.2 | core | M07 | Q133, Q134, Q143 | FC073 |
| F127 | Tethered examples include a Station 2 tethered to a Mini 2 and nested Mini 3 rigs. | §3.2 | supporting | M07 | Q133 | FC074 |
| F128 | If the MFD field is populated, the pipeline treats the rig as tethered. | §3.2 | core | M07 | Q132, Q143 | FC073 |
| F129 | Offsets are legacy millimetre coordinate adjustments once used to compensate for imprecise physical limit switches. | §3.2 | core | M07 | Q135, Q137 | FC075 |
| F130 | Jared calibrated the lab hardware to a true (0,0) origin, which made the Offsets field mostly deprecated. | §3.2 | core | M07 | Q136, Q137 | FC075 |
| F131 | The Robot Capabilities entity controls how Orca matches pipeline requests to physical hardware. | §3.2 | core | M08 | Q144, Q165 | FC076 |
| F132 | Dynamic JSON lookups are used by SDK frameworks: capabilities are defined as JSON metadata inside individual test definitions and parsed at runtime. | §3.2 | core | M08 | Q145, Q147 | FC077 |
| F133 | David oversees the SDK frameworks that use dynamic JSON capability lookups. | §3.2 | supporting | M08 | Q148 | FC077 |
| F134 | Non-dynamic lookups are used by traditional UI Automator suites: capabilities are hardcoded inside the pipeline script. | §3.2 | core | M08 | Q146, Q147 | FC078 |
| F135 | Both lookup methods are used interchangeably for Contact Canada automation scripts running on Westers test beds. | §3.2 | supporting | M08 | Q149 | FC079 |
| F136 | The Merchant Config entity stores merchant account parameters. | §3.2 | core | M08 | Q151, Q152 | — |
| F137 | Because of UI table display limits, you must click Edit on a Merchant Config row to view all of its fields. | §3.2 | core | M08 | Q151, Q166 | FC080 |
| F138 | Tate extended Merchant Config with App ID, App Secret and API Key fields. | §3.2 | core | M08 | Q153, Q155 | FC081 |
| F139 | Pipelines export App ID, App Secret and API Key as runtime environment variables for the Go SDK. | §3.2 | core | M08 | Q154, Q155, Q221 | FC081 |
| F140 | Merchant Config works alongside Laz Automation for dynamic OOBE merchant switching. | §3.2 | supporting | M08 | Q164 | FC158 |
| F141 | The Screens entity maps discrete UI layouts within a transaction flow relative to the target device architecture (e.g. a cash-discount tender selection prompt). | §3.2 | core | M09 | Q167, Q169 | FC085 |
| F142 | The Screen Locations entity maps exact button placements using relative X and Y coordinates in millimetres. | §3.2 | core | M09 | Q168, Q186 | FC086 |
| F143 | Scripts call Orca's xy_touch REST endpoint with a screen name and a button string. | §3.2 | core | M09 | Q170, Q172 | FC087 |
| F144 | For xy_touch, Orca looks up the millimetre coordinates and instructs the Pi to fire either an electronic ADB touch or a physical mechanical probe tap. | §3.2 | core | M09 | Q171, Q172 | FC087 |
| F145 | Swipe profiles store raw Track Data text strings directly in the MySQL table. | §3.2 | core | M10 | Q189, Q191, Q195 | FC092 |
| F146 | Swipe Track Data is extracted with a hardware card-reader utility. | §3.2 | supporting | M10 | Q192 | FC092 |
| F147 | Dip and Tap profiles store file paths pointing to card definitions inside the Gort repository. | §3.2 | core | M10 | Q190, Q191, Q195 | FC093 |
| F148 | A scheduled job clones the Gort card-definition files onto the local Windows boxes. | §3.2 | core | M10 | Q193, Q195 | FC094 |
| F149 | During a test run, Callus servers map the file path and load the virtual card. | §3.2 | core | M10 | Q194, Q195 | FC094 |
| F150 | The Screen Compare Image entity is the Station Duo workaround. | §3.2 | core | M16 | Q333, Q350 | FC144 |
| F151 | On the Station Duo one terminal drives two displays, but only the primary MFD is exposed to ADB. | §3.2 | core | M16 | Q331, Q347 | FC144 |
| F152 | Legacy UI Automator was completely blind to the Station Duo's secondary CFD. | §3.2 | core | M16 | Q332, Q348 | FC144 |
| F153 | The OCR workaround stores spatial bounding coordinates on the CFD alongside the expected text string. | §3.2 | core | M16 | Q334, Q350 | FC145 |
| F154 | In the OCR workaround the Robot Controller captures a webcam screenshot, crops it to the bounding box, runs Tesseract OCR and returns a boolean match result. | §3.2 | core | M16 | Q335, Q336, Q349 | FC145 |
| F155 | The OCR workaround is extremely brittle: a 10-pixel button shift, a capitalisation change or a typo breaks the suite. | §3.2 | core | M16 | Q339, Q340, Q341 | FC146 |
| F156 | Screen Compare / OCR is being phased out because UI Automator 2.3 natively supports dual-screen element tracking. | §3.2 | core | M16 | Q342, Q348 | FC147 |
| F157 | Historically the Semi Team developed third-party POS SDKs and the remote pay display apps. | §4.1 | supporting | M18 | Q369, Q377 | FC154 |
| F158 | The Sedi (QA) Team tested the Semi Team's apps using the legacy Lester framework. | §4.1 | supporting | M18 | Q370, Q377, Q382 | FC154 |
| F159 | The presenter (Morgan in-game) created uia-remote because no prior framework could automate native tethered setups: Station-to-Mini, Mini-to-Mini and Station Duo. | §4.1 | core | M13, M18 | Q265, Q378 | FC112 |
| F160 | uia-remote is now integrated with the IPX (Integrated Payment Experience) Team. | §4.1 | supporting | M18 | Q373, Q377 | FC156 |
| F161 | With IPX, uia-remote tests standalone and tethered devices across the native apps Register, Orders, Authorizations, Sale, Transactions and Setup. | §4.1 | supporting | M18 | Q374 | FC156 |
| F162 | The PayCore Team adopted uia-remote for apps like LabSim Dining. | §4.1 | supporting | M18 | Q375, Q377 | FC157 |
| F163 | uia-remote is built inside a standard Android/Maven structure under app/src/. | §4.2 | core | M13 | Q239, Q271 | FC113 |
| F164 | app/src/main is reserved for production/application registration code; QA engineers never modify it. | §4.2 | core | M13 | Q240, Q271 | FC114 |
| F165 | app/src/test houses local unit tests and the multi-device execution runner scripts. | §4.2 | core | M13 | Q241, Q243 | FC115 |
| F166 | app/src/androidTest houses instrumented tests that execute on Android hardware, split into three packages. | §4.2 | core | M13 | Q242, Q244 | FC116 |
| F167 | The androidTest package databases holds database connection and query logic. | §4.2 | core | M13 | Q243, Q272 | FC117 |
| F168 | The androidTest package pageobjects holds the Page Object Model classes representing individual device screens. | §4.2 | core | M13 | Q243, Q246, Q271 | FC117 |
| F169 | The androidTest package testactions holds test classes and logical assertions that string page-object methods together. | §4.2 | core | M13 | Q243, Q245 | FC117 |
| F170 | Google designed UI Automator to communicate with only one Android device at a time. | §4.2 | core | M13 | Q247, Q249 | FC118 |
| F171 | Multi-device trick: screen definitions live in androidTest, the runner lives in test, and the runner targets methods sequentially across device handles (Device A / MFD runs Method X, focus shifts to Device B / CFD for Method Y, then loops back). | §4.2 | core | M13 | Q248, Q249 | FC118 |
| F172 | Every screen, pop-up or window has its own Java class (e.g. HomeScreen, LockScreen, NavigationBar, RegisterHomeScreen). | §4.3 | core | M13 | Q250, Q251 | FC119 |
| F173 | Every screen class extends BaseTest. | §4.3 | core | M13 | Q252, Q273 | FC119 |
| F174 | BaseTest provides global setup, teardown and instance variables. | §4.3 | supporting | M13 | Q253 | FC120 |
| F175 | Zone 1 of a screen class holds the Element Locators: declared UI elements unique to that view. | §4.3 | core | M13 | Q254, Q256 | FC121 |
| F176 | Zone 2 of a screen class holds the Helper/Action Methods, where device-specific behaviours are abstracted. | §4.3 | core | M13 | Q255, Q256 | FC121 |
| F177 | open(String appName) uses vertical scrolling on Flex devices and horizontal scrolling on Mini or Station devices. | §4.3 | core | M13 | Q257, Q258, Q283 | FC122 |
| F178 | waitForScreen() pauses execution threads until all UI elements finish rendering, so UI Automator never clicks unrendered buttons. | §4.3 | core | M13 | Q259, Q274 | FC123 |
| F179 | isScreenPresent() returns a boolean indicating whether that specific screen is currently in focus. | §4.3 | core | M13 | Q260, Q262 | FC123 |
| F180 | waitForScreen() and isScreenPresent() are mandatory on every screen class. | §4.3 | core | M13 | Q261, Q262 | FC123 |
| F181 | The Tax test begins with a plain-text documentation header explaining the test's intent. | §4.4 | supporting | M14 | Q303 | — |
| F182 | Every test starts explicitly from HomeScreen, and a teardown routine forces the hardware back to HomeScreen at completion. | §4.4 | core | M14 | Q294, Q295 | FC124 |
| F183 | Tax test Step 1 (MFD_O1): on the Merchant display, open the Register app, add "Tax Item 5" and click "Review Order". | §4.4 | core | M14 | Q296, Q297, Q298 | FC125 |
| F184 | In Tax test Step 1 a backend call goes to Orchestrator, which routes to the Callers/Collos (Callus) microservice to load a simulated swipe card. | §4.4 | core | M14 | Q296, Q299 | FC125 |
| F185 | Tax test Step 2 (CFD_O1): control shifts to the Customer display, which asserts subtotal, calculated tax and grand total. | §4.4 | core | M14 | Q296, Q300, Q305 | FC126 |
| F186 | Tax test Step 3 (MFD_O2): control returns to the Merchant display to click "Pay" and "Charge". | §4.4 | core | M14 | Q296, Q301 | FC127 |
| F187 | Tax test Step 4: the payment prompt is finalised on the Customer display. | §4.4 | core | M14 | Q296, Q302 | FC127 |
| F188 | When running locally from a laptop, engineers configure config.properties manually. | §4.5 | core | M14 | Q275, Q306 | FC128 |
| F189 | During CI runs Jenkins injects the config.properties values dynamically. | §4.5 | core | M11, M14 | Q217, Q293, Q306 | FC104 |
| F190 | runType is set to tethered for multi-device testing setups. | §4.5 | core | M14 | Q276, Q304 | FC129 |
| F191 | merchantFacingDeviceIp is the local network IP of the MFD terminal. | §4.5 | core | M14 | Q277, Q307 | FC130 |
| F192 | customerFacingDeviceIp is the local network IP of the CFD terminal. | §4.5 | core | M14 | Q278, Q307 | FC130 |
| F193 | On a Station Duo, merchantFacingDeviceIp and customerFacingDeviceIp are set to the exact same IP address. | §4.5 | core | M14, M16 | Q279, Q280 | FC130 |
| F194 | serial is the hardware serial number of the primary terminal. | §4.5 | supporting | M14 | Q281 | FC131 |
| F195 | deviceType is the target form factor (Mini, Flex, Station) and governs layout/scroll logic. | §4.5 | core | M14 | Q282, Q283 | FC131 |
| F196 | theme is locked strictly to avocado; legacy theme toggles are deprecated. | §4.5 | core | M14 | Q284, Q285, Q304 | FC132 |
| F197 | kernelType is locked strictly to CPA (Core Payments Application), which replaces the legacy SPA (Secure Processor Application). | §4.5 | core | M14 | Q286, Q287, Q304 | FC133 |
| F198 | portNumber is locked to 5444. | §4.5 | core | M14 | Q288, Q289, Q304 | FC106 |
| F199 | Standard ADB defaults to port 5555. | §4.5 | core | M12, M14 | Q227, Q232, Q289 | FC107 |
| F200 | Using 5555 caused severe office port collisions in which automated scripts connected to and controlled coworkers' desk devices. | §4.5 | core | M14 | Q290, Q291 | FC107 |
| F201 | Additional config.properties keys include device unlock passcodes, backend testing environment targets and the active robot's registration name. | §4.5 | supporting | M14 | Q292 | FC134 |
| F202 | LSTR has dedicated runners for REST, Android, Windows and iOS. | §5 | core | M15 | Q312, Q313 | FC136 |
| F203 | The iOS test runner is rarely touched, although iOS Go testing is active. | §5 | supporting | M11, M15 | Q223, Q314 | FC137 |
| F204 | High-level commands (such as "card swipe") are abstracted by the runner into platform-specific SDK payment requests or physical robot actions. | §5 | core | M15 | Q315, Q330 | FC139 |
| F205 | A Pigeon JSON test specifies the test name, connection type, supported platforms and an array of test actions. | §5 | core | M15 | Q316, Q317 | FC138 |
| F206 | Versatile Pigeon tests can target 4 to 5 platforms at once. | §5 | supporting | M15 | Q318 | FC140 |
| F207 | Pigeon test actions create requests, pass parameters and store output variables. | §5 | supporting | M15 | Q319 | FC140 |
| F208 | Pigeon has no JSON linter, so missing commas or brackets must be hunted down manually. | §5 | core | M15 | Q320, Q328 | FC141 |
| F209 | Engineers survive the missing linter by copy-pasting working JSON blocks rather than writing syntax from scratch. | §5 | supporting | M15 | Q321 | FC141 |
| F210 | A Jenkins log failure at "select print" means that action was the last step attempted before the runner timed out waiting for a printer payload. | §5 | core | M15 | Q322, Q324, Q328 | FC142 |
| F211 | The usual root cause of a "select print" failure is outdated screen coordinates that made the robot arm miss the print button. | §5 | core | M15 | Q323, Q328 | FC142 |
| F212 | For Pigeon screen comparisons, engineers open a screenshot in GIMP, draw a bounding box around the target text and copy the coordinates into the JSON block. | §5 | core | M16 | Q345, Q346 | FC143 |
| F213 | Adding a "scan for receipt" QR code feature shifted buttons down by a few millimetres. | §5 | core | M09 | Q179, Q187 | FC090 |
| F214 | The QR shift broke ruler-measured coordinates across the lab for 48 hours until Jared merged a coordinate PR. | §5 | core | M09 | Q180, Q181, Q182, Q187 | FC090 |
| F215 | The QR feature introduced a conditional 5th menu option on the receipt screen. | §5 | core | M09 | Q183, Q185 | FC091 |
| F216 | Orca must maintain separate coordinate maps for 4-option and 5-option receipt screens across every device profile. | §5 | core | M09 | Q184, Q185 | FC091 |
| F217 | ADB bots are purely programmatic: they cannot physically touch the screen or enter PINs. | §6.1 | core | M09 | Q173, Q178, Q188 | FC088 |
| F218 | ADB bots are restricted to merchant configurations that bypass PIN security. | §6.1 | core | M09 | Q174, Q188 | FC088 |
| F219 | Physical/interactive bots are equipped with mechanical touch probes. | §6.1 | core | M09 | Q177, Q178 | FC089 |
| F220 | Physical bots are required for Canadian payment workflows, which mandate physical PIN entry. | §6.1 | core | M09 | Q175, Q178 | FC089 |
| F221 | Physical bots are required for ADB-blind displays. | §6.1 | core | M09, M16 | Q176, Q347 | FC089 |
| F222 | Gen 2 Software PIN Bypass: the team is partnering with the Core OS Team on a software framework that bypasses physical robotics for Secure Touch PIN entry. | §6.1 | supporting | M17 | Q361, Q362, Q367, Q377 | FC153 |
| F223 | Under Gen 2, physical robotics are reserved exclusively for non-negotiable hardware interactions such as card dipping. | §6.1 | supporting | M17 | Q363 | FC153 |
| F224 | Your team standardises on a single reliable Visa profile to verify transaction pipelines. | §6.2 | core | M10, M18 | Q207, Q209, Q380 | FC100 |
| F225 | Your team adds Canadian Interac for regional flows. | §6.2 | core | M10, M18 | Q208, Q209 | FC100 |
| F226 | The PayCore Team runs exhaustive back-to-back card-matrix validations (Visa, Discover, AmEx). | §6.2 | supporting | M18 | Q376, Q379, Q380 | FC101 |
| F227 | Power chain: 120V AC wall power enters a Mean Well transformer, drops to a central 24V DC rail, and step-down regulators split it into 12V DC (NUCs) and 5V DC 10A (Pis), protected by inline fuses. | §6.3 | core | M03 | Q029, Q033 | FC023 |
| F228 | LabSim devices draw an irregular 18V. | §6.3 | core | M03 | Q035, Q038 | FC024 |
| F229 | LabSim terminals and the expensive Collis probes bypass the custom DC rails entirely and plug into commercial AC power strips to prevent frying components. | §6.3 | core | M03 | Q036, Q037, Q038, Q039, Q213 | FC025 |
| F230 | The global LabSim control dashboard locks out external users while tests are active. | §6.4 | core | M01 | Q003, Q006 | FC007 |
| F231 | Manually moving a robot arm breaks its magnetic lock and turns the top status banner yellow. | §6.4 | core | M04 | Q042, Q062 | FC032 |
| F232 | Park All drives the stepper motors back to the physical limit switches at (0,0), clearing errors and turning the status banner green. | §6.4 | core | M04 | Q043, Q044, Q045, Q062 | FC033 |
| F233 | The status tablet header shows the robot's human-readable name (e.g. WALL-E), the LabSim logo, "Status: OK" and "Brainbox v6". | IMG-T | supporting | M01 | Q005 | FC002 |
| F234 | The status tablet has three tabs: Robot, Robot Control and Motion Control. | IMG-T | supporting | M04 | Q055 | FC003 |
| F235 | The Motion Control tab has button groups Steppers (Enable / Disable), Park (Park All / XY / X / Y), Dip (In / Out), Tap (In / Out), Phone (Forward / Back / Push Power Button) and Solenoid (Down / Up / Lower / Raise). | IMG-T | core | M04 | Q040, Q041 | FC004 |
| F236 | The touch-robot POWER panel has two green LEDs and two toggle switches labelled MAIN and MOTOR. | IMG-T | supporting | M01 | Q004 | FC005 |
| F237 | Tethered test-bed screens are labelled with rig, role and environment (e.g. MEGATRON MFD DEV1, OPTIMUS CFD STG). | IMG-R | supporting | M02 | Q025 | FC017 |
| F238 | Black USB "SmartStripe Probe" dongles with green LEDs sit between the tethered screens. | IMG-R | supporting | M02 | Q026 | FC018 |
| F239 | Below the tethered screens, black 3D-printed docks hold white LabSim connectivity hubs (Ethernet, USB, power) labelled per device (e.g. MEGATRON MFD). | IMG-R | supporting | M02 | Q027 | FC018 |
| F240 | Gantry anatomy: 2020 aluminium extrusion rails, a NEMA-17 stepper with a GT2 pulley, V-slot wheels and a carriage carrying a blue push-pull solenoid pointed at the screen. | IMG-G | supporting | M04 | Q056 | FC026 |
| F241 | A black rotating dip arm (sector gear marked 63) carries a flat white ribbon card (the Collis probe card insert) into the device's chip slot. | IMG-G | supporting | M04 | Q057 | FC031 |
| F242 | The Flex sits in an angled black 3D-printed cradle, with the grey UL Transaction Security (Collis) probe box on the shelf beside it. | IMG-G | trivia | M04 | Q061 | — |
| F243 | Solenoid tap cycle: the gantry moves the head over the target button, the plunger drops to tap, lifts, moves and taps again. | IMG-V | supporting | M04 | Q058 | — |
| F244 | Touch-robot enclosures sit in racks whose rails are marked with numbered rack units (e.g. 29 to 40). | IMG-T | trivia | M01 | Q009 | — |
| F245 | A side panel lettered SETI beside WALL-E's tablet carries USB ports for the Minix box / Raspberry Pi. | IMG-T | trivia | M01 | Q010 | — |

---

## 2. Academy modules

### 2.0 Step types and runtime rules (apply to every lesson)

| Step type | Player experience | Completion rule | Hints and failure |
|---|---|---|---|
| `dialogue` | Mentor speaks: subtitle box with the **exact text** given, mentor name, portrait. WebAudio "voice blips" only, no TTS. Player can't move during dialogue but can look. | **E** / click / Space advances. Skippable after the line has been on screen 1.5 s. Logged to the Field Manual transcript. | — |
| `walk-to` | HUD objective (exact text) + floor waypoint marker + compass pip on the target location. | Player capsule within **1.5 m** of the location's marker (2 m where stated). | 45 s: marker pulses; 90 s: mentor says "Over here!" and a breadcrumb line appears. |
| `inspect` | HUD objective; target prop outlined when within 4 m. | Crosshair on the prop for **≥ 1.0 s** (or stated time) within **2.5 m**. Callout labels (exact text given) appear and stay 4 s. Callouts become Field Manual entries. | 60 s: outline turns bright; 120 s: camera auto-pans (Academy only). |
| `interact` | HUD objective; **E** to use, mouse drag for draggables, number keys for dialogue choices. | Sim state reaches the success condition. | Wrong action gives the mentor correction line (exact text where given) and lets the player retry. 3 wrong: highlight the correct control. Academy never hard-fails. |
| `computer-task` | Player must be seated at `loc.workstation` (auto-prompt "Sit at your workstation (E)"). The named app opens focused. HUD objective pinned top-right of the desktop. | Evaluated against **sim state**, never against keystrokes, e.g. `orca.robot('eve').status == 'Connection Failed'`, a file validator passing, a build result. Typed commands accept the exact form given, plus equivalent flag orders and trailing whitespace. | 60 s idle: first hint (which menu/app). 120 s: second hint (the exact command or field). 180 s: "Show me" button plays a ghost-cursor demo (−50 % XP for that step). |
| `quiz-checkpoint` | Modal quiz with the listed items in listed order. Options reshuffled per attempt for MC/ORD/MATCH. | Pass = **≥ 80 %** correct on first try (`ceil(0.8 × n)`). | Each wrong answer shows the explanation at once. On a fail, re-run with the missed items plus 2 random items from the same module until passed. Missed facts' flashcards drop to Leitner box 1. |

**XP & stars (Academy):** each step 10 XP (computer-task 25, interact 15); module completion +100; ★ = complete,
★★ = complete with ≤ 2 hints, ★★★ = no hints and checkpoint 100 % first try. Stars feed the progression system
(gameplay doc).

**Time:** lessons run at time scale 1. Steps that wait on Orca's 5-minute health check offer
**Force health check** (Academy/Free Play only) or fast-forward ×30 (canon).

**Replays:** a completed module can be replayed. Its seeded faults are re-armed and its checkpoint redraws the
same items with options reshuffled.

### 2.1 Module map and order

Recommended order is M01→M18. A module unlocks when all its prerequisites are complete, so players may branch.

```
M01 ─┬─ M02 ─┐
     └─ M03 ─┴─ M04 ─ M05 ─┬─ M06 ─ M07 ─┬─ M08 ─ M10
                           │             ├─ M09            (also needs M04)
                           │             └─ M11            (also needs M06)
                           └─ M12 ─ M13 ─┬─ M14 ──────────────────┐
                                         └─ M15 (also needs M09) ─┴─ M16 ─ M17 ─ M18 (needs all earlier modules)
```

| Module | Title | Mentor | Prerequisites | # facts | # quiz items | Checkpoint items |
|---|---|---|---|---|---|---|
| M01 | Welcome to the Lab: Orientation & Safety | Morgan | — (first module; starts automatically on a new save) | 9 | 11 | 5 |
| M02 | Know Your terminals: Device Families | Morgan; cameo Jared | M01 | 12 | 16 | 5 |
| M03 | Power Distribution: Don't Fry the terminals | Jared | M01 | 7 | 12 | 5 |
| M04 | Touch Robot Mechanics & the Status Tablet | Jared | M02, M03 | 19 | 23 | 5 |
| M05 | The Robot Pi: Raspberry Pi, Linux & Wine | Jared | M03, M04 | 9 | 15 | 5 |
| M06 | Orca Architecture & the Five Robot Statuses | Tate; cameo Jared | M05 | 30 | 41 | 7 |
| M07 | Orca Entities: Robot, Device, Device Type, URLs, Tethering & Offsets | Tate; cameo Jared | M06 | 17 | 25 | 6 |
| M08 | Capabilities, Merchant Config, Laz & Ubi | David; cameo Tate | M07 | 16 | 23 | 6 |
| M09 | Screens, Screen Locations & xy_touch (ADB Bots vs Physical Bots) | Jared | M04, M07 | 15 | 22 | 7 |
| M10 | Card Profiles: Gort, Callus & Collis | Jared; cameo David | M08 | 16 | 25 | 7 |
| M11 | Jenkins: The Executor | Tate | M06, M07 | 9 | 11 | 5 |
| M12 | ADB on Port 5444 | Morgan | M05 | 4 | 8 | 5 |
| M13 | uia-remote: Structure & the Page Object Model | Morgan | M12 | 28 | 42 | 8 |
| M14 | config.properties & the Tethered Tax Test | Morgan; cameo Coworker | M13 | 22 | 33 | 8 |
| M15 | Pigeon (LSTR) & Legacy JSON | Morgan; cameo Jared | M09, M13 | 17 | 23 | 7 |
| M16 | Seeing the Second Screen: Station Duo, OCR, GIMP & UIA 2.3 | Morgan | M14, M15 | 15 | 20 | 6 |
| M17 | AI, Infrastructure & the Roadmap | Jared; cameo David | M16 | 15 | 18 | 5 |
| M18 | Teams, History & the Capstone Shift | Morgan; cameos Jared, Tate | M17 (and all earlier modules) | 15 | 14 | 5 |

### M01 — Welcome to the Lab: Orientation & Safety

| Field | Value |
|---|---|
| **Mentor** | Morgan (`npc.morgan`) |
| **Prerequisites** | — (first module; starts automatically on a new save) |
| **Est. duration** | 10–12 min |
| **Setup (world state on start)** | Player spawns at `loc.entrance`. WALL-E is running scripted Jenkins build `Java/uia-remote-regression-flex #4120`† (tablet locked). All other rigs idle. |
| **Facts covered** | F072, F073, F089, F115, F230, F233, F236, F244, F245 |
| **Unlocks** | M02, M03 · Field Manual chapter "Lab Basics" · flashcard deck `deck.M01` |

**Learning objectives** — after M01 the trainee can:
1. Name the front-mounted status tablet and read its header (robot name, `Status: OK`, `Brainbox v6`).
2. State that Orca's Robot entity tracks a pool of 40+ rigs, each named after a famous robot.
3. Explain why the control dashboard is locked while a test is active, and never fight a running robot.
4. Identify the POWER panel's MAIN and MOTOR toggles and the rack-unit numbering on the rails.
5. Say where the black fixtures come from (Prusa / Bambu Lab printers, CAD from simple shapes).

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | dialogue | `npc.morgan` | "Welcome to the LabSim automation lab! I'm Morgan. I built uia-remote, and today I'm your onboarding buddy. Everything in this room exists to press buttons on LabSim devices so humans don't have to." | Player presses **E** / clicks to continue |
| 2 | walk-to | `loc.rack-a` | HUD: "Walk to Touch Rack A" | Player within 1.5 m of the rack's front marker |
| 3 | dialogue | `npc.morgan` | "Meet WALL-E. Every rig here is named after a famous robot. Orca tracks a pool of 40-plus rigs, and a dozen of them live in this room." | continue |
| 4 | inspect | `prop.walle.tablet` | HUD: "Look at WALL-E's status tablet". Callouts appear: `WALL-E` (robot name), `Status: OK`, `Brainbox v6`, tabs `Robot` / `Robot Control` / `Motion Control`. | Crosshair on prop ≥ 1.0 s within 2.5 m |
| 5 | dialogue | `npc.morgan` | "That's the front-mounted status tablet, the robot's face. The name across the top comes straight from Orca." | continue |
| 6 | interact | `prop.walle.tablet` | HUD: "Tap the Motion Control tab and press Park All". Tablet shows overlay "TEST IN PROGRESS — CONTROLS LOCKED"†. | Overlay has been shown once |
| 7 | dialogue | `npc.morgan` | "See that? While a test is active, the global LabSim control dashboard locks out external users. Never fight a running robot. Wait for the job, or learn to reserve the rig properly. That's Module 6." | continue |
| 8 | inspect | `prop.walle.power-panel` | HUD: "Inspect WALL-E's POWER panel". Callouts: two green LEDs, toggle `MAIN`, toggle `MOTOR`. | Crosshair ≥ 1.0 s |
| 9 | inspect | `prop.rack-a.rail-labels` | HUD: "Find rack unit 33 on the rail". | Crosshair on the "33" label ≥ 0.5 s |
| 10 | inspect | `prop.seti-panel` | HUD: "What's the lettered panel to the right of the tablet?" Callout: "SETI — USB ports for the Minix box / Raspberry Pi". | Crosshair ≥ 1.0 s |
| 11 | walk-to | `loc.print-corner` | HUD: "Walk to the 3D print corner" | within 1.5 m |
| 12 | dialogue | `npc.morgan` | "All of those matte-black fixtures were printed right here on the Prusa and Bambu Lab printers, drafted in CAD from simple geometric shapes. If it's black plastic and holds a LabSim, we made it." | continue |
| 13 | interact | `prop.safety-card` | HUD: "Pick up the Lab Safety Card". Card (illustrative†) reads: "1. Never touch a robot while a test is running. 2. If you move an arm by hand, Park All before you walk away. 3. LabSim terminals and Collis probes go on the AC power strips — never the DC rails. 4. Broken rig? Tell Jared." | Card added to Field Manual |
| 14 | quiz-checkpoint | `CP-M01.1`: Q001, Q002, Q003, Q004, Q005 | Checkpoint "Lab Basics" | ≥ 80 % correct (see §2.0 rules) |
| 15 | dialogue | `npc.morgan` | "Nice work. Next stop: the devices themselves. Grab a coffee, then meet me at the device library." | continue → module complete |

---

### M02 — Know Your terminals: Device Families

| Field | Value |
|---|---|
| **Mentor** | Morgan (`npc.morgan`); cameo Jared (`npc.jared`) |
| **Prerequisites** | M01 |
| **Est. duration** | 12 min |
| **Setup** | Device library shelf `loc.device-library` holds one of every device plus two sealed boxes labelled "STATION DUO 3 — UPCOMING" and "MINI 4 — UPCOMING". |
| **Facts covered** | F054, F055, F056, F057, F058, F059, F060, F061, F062, F237, F238, F239 |
| **Unlocks** | M04 (with M03) · deck `deck.M02` |

**Learning objectives**
1. Sort every LabSim target device into the Station, Mini, Flex and Compact families, including upcoming models.
2. Expand MFD and CFD and recognise them on tethered test-bed labels (rig · role · environment).
3. State that Flex 3, Flex 4 and Flex Pocket share one testing profile and the Pocket has no printer block.
4. Explain the Mini 3 hot-swap for the printerless Station Duo 2 and the Compact's Canadian / Westers role.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | walk-to | `loc.device-library` | HUD: "Meet Morgan at the device library" | within 1.5 m |
| 2 | dialogue | `npc.morgan` | "Every LabSim we test belongs to a family: Station, Mini, Flex, or the Compact. Learn them like your teammates' names." | continue |
| 3 | inspect | `prop.device-library.station-duo-2` | HUD: "Inspect the Station Duo 2". Callout: "Station Duo 2 — no printer". | Crosshair ≥ 1.0 s |
| 4 | interact | `prop.family-trays` | HUD: "Sort all 14 devices onto the right family tray". Items: Station 2018, Station 2, Station Duo 1, Station Duo 2, box "Station Duo 3 — upcoming", Mini 2, Mini 3, box "Mini 4 — upcoming", Flex 1, Flex 2, Flex 3, Flex 4, Flex Pocket, Compact. Trays: `STATION`, `MINI`, `FLEX`, `COMPACT`. | All 14 on correct trays (wrong drop: item bounces back, buzz, −0 score in Academy) |
| 5 | dialogue | `npc.morgan` | "Here's a freebie that saves hours: Flex 3, Flex 4 and Flex Pocket share the exact same testing profile. The Pocket just leaves out the printer block." | continue |
| 6 | interact | `prop.device-library.flex-pocket` | HUD: "Hold the Flex Pocket next to the Flex 4 and find what's missing". Player picks up both; highlighting the printer area on Flex 4 shows callout "Printer block — absent on Pocket". | Player clicks the printer block on Flex 4 |
| 7 | dialogue | `npc.jared` | "Jared here. The Station Duo 2 has no printer either. When one is down, we hot-swap a Mini 3 in its place." | continue |
| 8 | walk-to | `loc.rack-tethered` | HUD: "Walk to the tethered rack (MEGATRON / OPTIMUS)" | within 1.5 m |
| 9 | dialogue | `npc.morgan` | "MFD means Merchant Facing Device: the merchant's screen. CFD means Customer Facing Device: the customer's screen. The labels tell you the rig, the role and the environment." | continue |
| 10 | inspect | `prop.megatron.mfd` | HUD: "Read MEGATRON's MFD label". Callout: `MEGATRON  MFD  DEV1`. Then auto-pan to `prop.optimus.cfd`: `OPTIMUS  CFD  STG`. | Both labels viewed |
| 11 | inspect | `prop.smartstripe-probe` | HUD: "What are the glowing dongles between the screens?" Callout: "SmartStripe Probe (USB)". Second callout on `prop.hub-dock`: "LabSim connectivity hub: Ethernet, USB, power". | Both viewed |
| 12 | dialogue | `npc.morgan` | "Last one: the LabSim Compact is our Canadian-market terminal. It runs on the Westers test beds, and SETI carries one in this room. Remember Canada: it matters later for PINs." | continue |
| 13 | quiz-checkpoint | `CP-M02.1`: Q012, Q013, Q014, Q015, Q017 | Checkpoint "Device Families" | ≥ 80 % |

---

### M03 — Power Distribution: Don't Fry the terminals

| Field | Value |
|---|---|
| **Mentor** | Jared (`npc.jared`) |
| **Prerequisites** | M01 |
| **Est. duration** | 12 min |
| **Setup** | Rack B's 5V inline fuse `prop.fuse-5v-b` is blown: the JOHNNY-5/BAYMAX/SETI/ROSIE Pis show no LEDs. A new Flex 4 power brick `prop.flex4-psu-brick` and a spare Collis probe `prop.collis-probe-spare` lie unplugged on `loc.power-wall`'s bench. |
| **Facts covered** | F074, F085, F086, F087, F227, F228, F229 |
| **Unlocks** | M04 (with M02) · Arcade incidents `INC-FUSE-5V`, `INC-WRONG-OUTLET` · deck `deck.M03` |

**Learning objectives**
1. Trace the power chain 120V AC → Mean Well → 24V DC rail → step-down regulators → 12V (NUCs) / 5V 10A (Pis), with inline fuses.
2. Diagnose and replace a blown inline fuse.
3. Explain the 18V exception: LabSim terminals and Collis probes bypass the DC rails and use commercial AC power strips.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | walk-to | `loc.power-wall` | HUD: "Meet Jared at the power wall" | within 1.5 m |
| 2 | dialogue | `npc.jared` | "Power 101. Get this wrong and we're buying new terminals. 120 volts AC comes out of the wall and goes straight into the Mean Well." | continue |
| 3 | inspect | `prop.meanwell-psu` | HUD: "Inspect the Mean Well transformer". Label†: "MEAN WELL · INPUT 120VAC · OUTPUT 24VDC". | Crosshair ≥ 1.0 s |
| 4 | interact | `prop.power-trace` | HUD: "Trace the power path: click each stage in order". Clickable nodes: wall outlet, Mean Well, 24V DC rail, 12V regulator, 5V 10A regulator, inline fuses, NUC shelf, Pi shelf. Cable glows as each correct node is clicked. | Order wall → Mean Well → 24V rail → regulators → fuses → loads; ≤ 2 mistakes for full stars |
| 5 | dialogue | `npc.jared` | "From the 24-volt rail, step-down regulators split it two ways: 12 volts DC for the Windows NUCs, and 5 volts DC at 10 amps for the Raspberry Pis. Inline fuses protect both lines." | continue |
| 6 | inspect | `prop.regulator-5v10a` | HUD: "Read the Pi regulator's rating". Label: "5V DC · 10A". Then `prop.regulator-12v`: "12V DC · NUC". | Both viewed |
| 7 | dialogue | `npc.jared` | "Rack B's Pis just went dark. Grab the multimeter and check the 5-volt fuse." | continue |
| 8 | interact | `prop.multimeter` → `prop.fuse-5v-b` | HUD: "Test Rack B's 5V inline fuse with the multimeter". Meter reads "OL" (open). | Reading taken |
| 9 | interact | `prop.fuse-spares` → `prop.fuse-5v-b` | HUD: "Replace the blown fuse". Fuse holder opens, player inserts new fuse. Rack B Pi LEDs light green; boot chime. | Fuse replaced and Rack B Pis powered |
| 10 | dialogue | `npc.jared` | "Now the exception. LabSim devices draw an irregular 18 volts. They never touch our DC rails, and neither do the Collis probes. Those things cost more than my car." | continue |
| 11 | interact | `prop.flex4-psu-brick`, `prop.collis-probe-spare` | HUD: "Plug in the new Flex 4 and the spare Collis probe". Sockets offered: 24V rail tap, 12V NUC line, 5V Pi line, commercial AC power strip `prop.ac-strip`. Wrong socket → spark VFX, Jared: "That's how we fry a terminal. Commercial AC strip. Always." (no permanent damage in Academy; Arcade: −500 pts and "Fried hardware" strike) | Both plugged into `prop.ac-strip` |
| 12 | quiz-checkpoint | `CP-M03.1`: Q028, Q030, Q031, Q033, Q035 | Checkpoint "Power" | ≥ 80 % |
| 13 | dialogue | `npc.jared` | "Good. Rails for Pis and NUCs, AC strips for terminals and Collis. Tattoo it somewhere. Now let's open up a robot." | continue → complete |

---

### M04 — Touch Robot Mechanics & the Status Tablet

| Field | Value |
|---|---|
| **Mentor** | Jared (`npc.jared`) |
| **Prerequisites** | M02, M03 |
| **Est. duration** | 18 min |
| **Setup** | WALL-E idle and Available (tablet unlocked). Enclosure door `prop.walle.door` closed. Bolt bins at `loc.jared-bench`. |
| **Facts covered** | F079, F080, F081, F082, F083, F084, F088, F090, F091, F092, F093, F231, F232, F234, F235, F240, F241, F242, F243 |
| **Unlocks** | M05 (with M03), M09 (with M07) · Arcade incident `INC-MAGLOCK` · Arcade drill "Park It!" · deck `deck.M04` |

**Learning objectives**
1. Name the gantry parts: 2020 extrusion rails, NEMA-17 stepper with GT2 pulley, V-slot wheels, carriage, blue push-pull solenoid, dip arm, limit switches, magnetic lock, webcam.
2. Operate every Motion Control group on the tablet (Steppers, Park, Dip, Tap, Phone, Solenoid).
3. Recover from a broken magnetic lock (yellow banner) with **Park All** (green banner, (0,0)).
4. Quote the build numbers: 10 ft rails, 130 ft wiring, ~300 solder points, 200+ nuts and bolts (2.5 mm / 5 mm), 25-pin PCBs printed in Hong Kong.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | walk-to | `loc.rack-a` | HUD: "Meet Jared at WALL-E" | within 1.5 m |
| 2 | dialogue | `npc.jared` | "A touch robot is basically a 3D-printer gantry that taps instead of prints. Aluminium 2020 extrusion, V-slot wheels, a NEMA-17 stepper on a GT2 belt, and a blue push-pull solenoid on the carriage. The steppers move in sub-millimetre steps." | continue |
| 3 | inspect | `prop.walle.stepper-x` | HUD: "Inspect the X-axis stepper". Callouts: "NEMA-17", "GT2 pulley", "V-slot wheels", "2020 extrusion". | Crosshair ≥ 1.0 s |
| 4 | inspect | `prop.walle.motor-pcb` | HUD: "Find the motor controller board". Silkscreen: "25-PIN MOTOR CTRL · MADE IN HONG KONG"†. | Crosshair ≥ 1.0 s |
| 5 | inspect | `prop.walle.cradle` | HUD: "Look at how the Flex 3 is held". Callouts: "Angled 3D-printed cradle", "Collis probe box (UL Transaction Security)" on the shelf beside it, "Webcam" `prop.walle.webcam` above. | Crosshair ≥ 1.0 s |
| 6 | interact | `prop.walle.tablet` | HUD: "On the tablet open Robot, then Robot Control, then Motion Control". | All three tabs opened |
| 7 | interact | `prop.walle.tablet` | HUD: "Fire the solenoid: Solenoid → Down, then Up". Plunger drops onto the Flex 3 screen (tap sound), then lifts. | Both buttons pressed in order |
| 8 | interact | `prop.walle.tablet` | HUD: "Move the head with Park → X, then Park → Y, then tap a button with Solenoid → Lower / Raise". Head moves along X then Y; Lower/Raise is the slow variant. | All four pressed |
| 9 | interact | `prop.walle.tablet` | HUD: "Run the card mechanics: Dip → In, Dip → Out, Tap → In, Tap → Out". Dip arm (sector gear marked `63`) swings the white ribbon card into the chip slot and back; the tap paddle approaches the NFC area and retracts. | All four pressed |
| 10 | interact | `prop.walle.tablet` | HUD: "Try the Phone group: Forward, Back, Push Power Button". Phone carriage† moves forward/back; pusher presses the power button. Then Steppers → Disable, Steppers → Enable (motors hum off/on). | All five pressed |
| 11 | interact | `prop.walle.carriage` | HUD: "Open the door and push the carriage by hand". Player drags carriage ≥ 20 mm; magnetic lock releases with a clunk; tablet banner turns **yellow** "Status: LOCK RELEASED — PARK REQUIRED"†. | Banner yellow |
| 12 | interact | `prop.walle.tablet` | HUD: "Recover WALL-E". Player must press **Park → Park All**. Steppers drive the head to limit switches `prop.walle.limit-switch-x` / `prop.walle.limit-switch-y` (click-click), coordinates read (0,0), banner returns **green** "Status: OK". Only Park All clears the error; Park XY / X / Y home just those axes and leave the banner yellow†. | Banner green and head at (0,0) |
| 13 | dialogue | `npc.jared` | "That's the whole trick: push an arm, break the magnetic lock, banner goes yellow. Park All drives the steppers back to the limit switches at zero-zero, clears the error, banner goes green. And for the record, each robot took ten-foot aluminium rails cut to size, a hundred and thirty feet of wiring, about three hundred hand solder points, and two-hundred-plus nuts and bolts, in 2.5 and 5 millimetre." | continue |
| 14 | interact | `prop.bolt-bins` | HUD: "Sort Jared's bolts into the 2.5 mm and 5 mm bins (10 bolts)" at `loc.jared-bench`. | 10/10 sorted |
| 15 | quiz-checkpoint | `CP-M04.1`: Q040, Q041, Q042, Q043, Q047 | Checkpoint "Touch Robot" | ≥ 80 % |

---

### M05 — The Robot Pi: Raspberry Pi, Linux & Wine

| Field | Value |
|---|---|
| **Mentor** | Jared (`npc.jared`) |
| **Prerequisites** | M03, M04 |
| **Est. duration** | 14 min |
| **Setup** | WALL-E's Pi `10.42.10.11` healthy. `prop.nuc-03` on `loc.callus-shelf` shows a sticky note. Terminal app unlocked. |
| **Facts covered** | F019, F020, F021, F063, F064, F065, F066, F067, F068 |
| **Unlocks** | M06, M12 · Terminal commands `ssh`, `uname`, `df`, `ps`, `systemctl`, `curl` · deck `deck.M05` |

**Learning objectives**
1. Explain that a ~$50 Raspberry Pi is the Robot Controller on each shelf and list its duties (ADB routing, camera stream, steppers, solenoids, Wine card programming).
2. Explain why hardware control moved off the Windows Intel NUCs (corporate monitoring packages filled the disks) onto Linux Pis.
3. SSH into a Pi and verify its OS, its controller service, its disk, Wine and its health endpoint.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | inspect | `prop.walle.pi` | HUD: "Find WALL-E's Raspberry Pi". Callout: "Robot Pi / Robot Controller · ~$50". | Crosshair ≥ 1.0 s |
| 2 | dialogue | `npc.jared` | "This fifty-dollar Raspberry Pi is WALL-E's brain, the Robot Controller. One per shelf. It routes ADB, serves the camera stream, drives the steppers and the solenoid, and runs the card-programming software under Wine." | continue |
| 3 | walk-to | `loc.callus-shelf` | HUD: "Walk to the Callus shelf" | within 1.5 m |
| 4 | inspect | `prop.nuc-03` | HUD: "Read the note on the Intel NUC". Sticky note†: "DISK 100% — corporate AGENT. NO HARDWARE CONTROL ON THIS BOX. –J". | Crosshair ≥ 1.0 s |
| 5 | dialogue | `npc.jared` | "We used to drive hardware from Windows boxes: Intel NUCs and Minix boxes. Then corporate's security-monitoring packages ate every byte of disk on the NUCs. So hardware control moved onto Raspberry Pis running Linux, isolated from the corporate Windows machines." | continue |
| 6 | walk-to | `loc.workstation` | HUD: "Sit at your workstation" | Player seated (press **E** on chair) |
| 7 | computer-task | `app.terminal` | HUD: "SSH into WALL-E's Pi". Player types `ssh pi@10.42.10.11`. Output†: `pi@10.42.10.11's password:` → (auto-filled in Academy) → prompt `pi@wall-e:~ $`. | Prompt `pi@wall-e:~ $` shown |
| 8 | computer-task | `app.terminal` | HUD: "Prove it's Linux and the controller is running". Player runs `uname -a` (output contains `Linux wall-e`) and `systemctl status robot-controller`† (output contains `active (running)`). | Both commands run |
| 9 | computer-task | `app.terminal` | HUD: "Check the Pi's disk". `df -h /` → `/dev/mmcblk0p2  29G  6.1G  22G  22% /`†. | Command run |
| 10 | computer-task | `app.terminal` | HUD: "Find the Windows card-programming software". `ps aux \| grep -i wine` → line containing `wine C:\CardProg\CardProgrammer.exe`†. Morgan pops in: "Wine is the compatibility layer that lets a Linux Pi run Windows-only card-programming software." | Command run and line visible |
| 11 | computer-task | `app.terminal` | HUD: "Hit the Robot Controller's health endpoint". `curl -i http://10.42.10.11:8000/health` → `HTTP/1.1 200 OK` + `{"status":"ok","robot":"wall-e"}`†. | 200 shown |
| 12 | dialogue | `npc.jared` | "That 200 is exactly what Orca checks every five minutes. Anything else and the robot goes Connection Failed. Tate will show you." | continue |
| 13 | quiz-checkpoint | `CP-M05.1`: Q063, Q065, Q067, Q069, Q071 | Checkpoint "Robot Pi" | ≥ 80 % |

---

### M06 — Orca Architecture & the Five Robot Statuses

| Field | Value |
|---|---|
| **Mentor** | Tate (`npc.tate`); cameo Jared |
| **Prerequisites** | M05 |
| **Est. duration** | 22 min |
| **Setup** | All rigs as in §0.4 roster. Orca app unlocked with the Robots page. Tutorial-only "Force health check" button visible in Orca's header (Academy and Free Play only). Jenkins app unlocked, showing only job `Java/uia-remote-regression-flex`. |
| **Facts covered** | F001, F002, F003, F004, F013, F023, F036, F037, F038, F094, F095, F096, F097, F098, F099, F100, F101, F102, F103, F104, F105, F106, F107, F108, F109, F110, F111, F112, F113, F116 |
| **Unlocks** | M07, M11 (with M07) · Arcade incident types `INC-CONN-FAILED`, `INC-RESERVED-BLOCK`, `INC-UNAVAILABLE-NAMED` · deck `deck.M06` |

**Learning objectives**
1. Draw the execution flow: Jenkins (Executor) → test runner → Orca (Controller) → Pi → device; Callus → Collis → card reader.
2. Describe Orca's stack: on-prem Spring Boot monolith in Java, scaffolded by JHipster, MySQL-backed, running on a lab VM.
3. Define all 5 statuses and who/what sets each; use Tate's filter UI.
4. Handle a Connection Failed: read Notes (endpoint + error), escalate to Jared, verify recovery.
5. Use Offline, Reserved and Unavailable correctly, including the named-robot job parameter and the auto-reset.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | walk-to | `loc.whiteboard` | HUD: "Meet Tate at the architecture whiteboard" | within 1.5 m |
| 2 | dialogue | `npc.tate` | "Hi, I'm Tate, I work on Orca. Orca is short for Orchestrator. Rule one: Orca is the Controller and Jenkins is the Executor. Jenkins triggers the pipeline, injects environment variables into the test runner and checks out a robot from Orca. The runner then calls Orca over REST for taps and card actions." | continue |
| 3 | interact | `prop.whiteboard` | HUD: "Rebuild the architecture diagram". Drag cards onto slots: `Jenkins (Executor)`, `Test runner (uia-remote / Pigeon)`, `Orca (Controller)`, `MySQL`, `Raspberry Pi Robot Controller`, `LabSim device (MFD / CFD)`, `Windows/Minix box (Callus)`, `Collis probe`; draw arrows: triggers+env vars, checkout robot, REST xy_touch/card, 5-min ping, ADB 5444, ribbon cable. | All 8 cards and 6 arrows correct |
| 4 | dialogue | `npc.tate` | "Orca is an on-premise Spring Boot monolith, written in Java. We scaffolded it with JHipster: you answer its setup questionnaire and it generates the UI, the REST endpoints and the MySQL schemas. Today it lives on a VM here in the lab." | continue |
| 5 | computer-task | `app.orca` | HUD: "Open Orca's Robots page and filter to Available robots". Player opens **Robots**, sets the Status filter (Tate's filter UI) to `Available`. | List shows only Available robots |
| 6 | dialogue | `npc.tate` | "There are exactly five statuses: Available, Unavailable, Offline, Connection Failed and Reserved. Every five minutes a synchronized background thread pings the Robot Controller on every Pi. Let's break one on purpose." | continue |
| 7 | interact | `prop.eve.pi-power` | HUD: "Go to EVE and unplug its Pi power lead" (`loc.rack-a`). EVE's Pi LEDs go dark. | Lead unplugged |
| 8 | computer-task | `app.orca` | HUD: "Force a health check (or wait for the 5-minute ping)". Player clicks **Force health check** (or fast-forwards). EVE's row turns red: `Connection Failed`. | `orca.robot('eve').status == 'Connection Failed'` |
| 9 | computer-task | `app.orca` | HUD: "Open EVE and read the Notes". Notes section shows†: `2026-10-05 09:35:00 GET http://10.42.10.12:8000/health → connect timed out after 10000 ms`. Player then tries **Check out** on EVE → toast "Robot is blocked from checkouts (Connection Failed)". | Notes opened and checkout block seen |
| 10 | interact | `npc.jared` | HUD: "Escalate EVE". Dialogue choices: (a) "EVE is Connection Failed: health ping timed out on 10.42.10.12:8000. Can you take a look?" ✔ (b) "I'll just set EVE back to Available." ✘ Tate: "Never paper over a failed ping. Hardware goes to Jared." (c) "I'll reboot Orca." ✘ | Choice (a); Jared: "On it. Probably the Pi, or a Minix box running Callus. Same symptom." Jared re-plugs; next ping → EVE `Available`. |
| 11 | computer-task | `app.orca` | HUD: "Jared is rebuilding BAYMAX. Mark it Offline, then force a health check." Health log shows†: `baymax  SKIPPED (Offline)`. | BAYMAX `Offline` and skip line visible |
| 12 | computer-task | `app.orca` + `app.jenkins` | HUD: "You're going to test WALL-E locally. Reserve it, then build Java/uia-remote-regression-flex with DEVICE_TYPE=FLEX_3 and ROBOT_NAME blank." Console†: `[orca] candidate wall-e: Reserved — skipped` · `[orca] no Available FLEX_3 robot — build waiting in queue`. HUD: "Done locally? Set WALL-E back to Available." Console: `[orca] checkout → wall-e (FLEX_3) OK`. | Build observed waiting while WALL-E was Reserved, then checked out WALL-E after it returned to Available |
| 13 | computer-task | `app.jenkins` | HUD: "ROSIE is Unavailable (PayCore standalone). Build Java/uia-remote-regression-flex with DEVICE_TYPE=FLEX_POCKET and ROBOT_NAME blank." Console: `No Available robot matches FLEX_POCKET (rosie is Unavailable)`†. Rebuild with `ROBOT_NAME=rosie` → `Checked out robot rosie (named)`. After the build finishes Orca shows ROSIE `Unavailable` again automatically. | Named build succeeded and ROSIE status returned to Unavailable without player action |
| 14 | dialogue | `npc.tate` | "Unavailable keeps general jobs off special rigs like PayCore's standalone setups, so nobody overwrites their merchant profiles. Name the robot exactly and you get it; when your job ends, Orca flips it back to Unavailable for you. Offline skips health checks. Reserved blocks Jenkins and health-check overrides while you work locally." | continue |
| 15 | quiz-checkpoint | `CP-M06.1`: Q078, Q079, Q084, Q086, Q088, Q091, Q101 | Checkpoint "Orca & Statuses" | ≥ 80 % |

---

### M07 — Orca Entities: Robot, Device, Device Type, URLs, Tethering & Offsets

| Field | Value |
|---|---|
| **Mentor** | Tate (`npc.tate`); cameo Jared |
| **Prerequisites** | M06 |
| **Est. duration** | 20 min |
| **Setup** | JOHNNY-5's Human Readable Name is the typo `JONNY-5` (tablet shows it). Jared has physically swapped JOHNNY-5's Flex 1 for a Flex 2 (serial `SIM-F2-000015`†). JOHNNY-5's Tap URL is blank. OPTIMUS's MFD field is empty (so pipelines treat it as standalone). BUMBLEBEE has legacy `Offset Y = 1.5` mm causing low taps. |
| **Facts covered** | F014, F114, F115, F117, F118, F119, F120, F121, F122, F123, F124, F125, F126, F127, F128, F129, F130 |
| **Unlocks** | M08, M09 (with M04), M11 (with M06) · Arcade incidents `INC-HRN-TYPO`, `INC-DEVICE-UPGRADE`, `INC-TETHER-MISSING` · deck `deck.M07` |

**Learning objectives**
1. List Orca's 7 core JHipster schemas and what MySQL stores.
2. Distinguish Name (system identifier) from Human Readable Name (pushed to the tablet).
3. Upgrade a robot's hardware by creating a new Device and relinking Robot Device, keeping the old one for rollback.
4. Explain the Device Type enum and why Jenkins env vars must be ALL CAPS.
5. Fill URL Mappings (ADB Service, Camera Stream, Dip, Tap, Swipe), configure MFD/CFD tethering, and explain Offsets' deprecation.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | dialogue | `npc.tate` | "Orca's brain is MySQL: seven core schemas, all JHipster entities. Robots, robot configuration, capabilities, merchant config, screens and screen locations, card profiles, and screen compare images. Hardware state, merchant profiles, coordinate tables: all of it lives there." | continue |
| 2 | computer-task | `app.orca` | HUD: "Open JOHNNY-5's robot record". Fields visible: Name `johnny-5`, Human Readable Name `JONNY-5`. | Edit form for johnny-5 open |
| 3 | computer-task | `app.orca` | HUD: "Fix the typo in the Human Readable Name". Set to `JOHNNY-5`, Save. Do **not** change Name. | HRN == `JOHNNY-5` and Name unchanged (changing Name → Tate: "Name is the system identifier. Pipelines use it. Leave it.") |
| 4 | inspect | `prop.johnny5.tablet` | HUD: "Check JOHNNY-5's tablet" (`loc.rack-b`). Header now reads `JOHNNY-5`. | Crosshair ≥ 1.0 s |
| 5 | dialogue | `npc.jared` | "I swapped JOHNNY-5's Flex 1 for a Flex 2 this morning. Don't edit the old device record. Make a new one." | continue |
| 6 | computer-task | `app.orca` | HUD: "Create a Device for the new Flex 2 and link it to JOHNNY-5". **Devices → Create**: Device Type `FLEX_2`, Serial `SIM-F2-000015`†, IP `10.42.30.15`. Then Robot johnny-5 → **Robot Device** = new device → Save. | Robot linked to new FLEX_2 device **and** old FLEX_1 device still exists unmodified |
| 7 | dialogue | `npc.tate` | "That's why Robot and Device are separate. If the Flex 2 misbehaves, rolling back is one dropdown. Device Type is an enum: dimensions, layout metrics, internal strings. And because it's an enum, Jenkins env vars like DEVICE_TYPE must be ALL CAPS: FLEX_2, not flex_2." | continue |
| 8 | computer-task | `app.orca` | HUD: "Complete JOHNNY-5's URL mappings". Shown: Robot ADB Service URL `http://10.42.10.15:8000/adb`†, Camera Stream URL `http://10.42.10.40:8081/stream.mjpg` (shared across Rack B's 4 rigs)†, Dip URL `http://10.42.10.15:8000/dip`†, Swipe URL `http://10.42.10.15:8000/swipe`†, Tap URL *(blank)*. Player enters Tap URL `http://10.42.10.15:8000/tap`. | Tap URL == expected string |
| 9 | computer-task | `app.orca` | HUD: "OPTIMUS jobs are running as standalone. Find out why." Player opens optimus: **MFD** empty, **CFD** empty. Sets MFD = device `optimus-mfd` (MINI_3, 10.42.30.23), CFD = `optimus-cfd` (MINI_3, 10.42.30.24). | Both set; banner "Tethered: MFD populated" appears |
| 10 | dialogue | `npc.tate` | "If MFD is populated, the pipeline treats the rig as tethered. That's how we model nested setups, like a Station 2 tethered to a Mini 2 on MEGATRON, or nested Mini 3s on OPTIMUS." | continue |
| 11 | computer-task | `app.camera` + `app.orca` | HUD: "BUMBLEBEE keeps tapping low. Watch the camera, then check Offsets." Camera shows taps ~1.5 mm below targets. Orca bumblebee: `Offset X = 0.0`, `Offset Y = 1.5`. Player sets Offset Y = `0.0`, Save, runs **Test tap** → hits centre. | Offset Y == 0.0 and test tap hits |
| 12 | dialogue | `npc.jared` | "Offsets were a legacy fudge for imprecise limit switches. I calibrated the whole lab to a true zero-zero, so they're mostly deprecated. If you see a non-zero offset, be suspicious." | continue |
| 13 | quiz-checkpoint | `CP-M07.1`: Q119, Q121, Q122, Q123, Q127, Q132 | Checkpoint "Orca Entities" | ≥ 80 % |

---

### M08 — Capabilities, Merchant Config, Laz & Ubi

| Field | Value |
|---|---|
| **Mentor** | David (`npc.david`); cameo Tate |
| **Prerequisites** | M07 |
| **Est. duration** | 18 min |
| **Setup** | Merchant Config row `GO-SDK-US-01` has a blank **API Key**. Gort test definition `go-sdk/tests/sale_receipt.json`† lacks a `printer` capability (so Orca may match ROSIE / Flex Pocket). DATA is on merchant `AUTO-US-NOPIN-01`†. |
| **Facts covered** | F008, F009, F011, F046, F047, F051, F131, F132, F133, F134, F135, F136, F137, F138, F139, F140 |
| **Unlocks** | M10 · Arcade incidents `INC-MERCHANT-KEY`, `INC-CAPABILITY-MISMATCH` · deck `deck.M08` |

**Learning objectives**
1. Explain the Robot Capabilities entity and the two lookup styles: dynamic JSON (SDK frameworks, in the test definition, parsed at runtime) vs non-dynamic (hardcoded in the pipeline script); both are used for Contact Canada on Westers beds.
2. Open hidden Merchant Config fields with **Edit**, and set App ID / App Secret / API Key for Go SDK pipelines.
3. Run Laz Automation's zero-touch OOBE merchant swap and recognise the Ubi Platform routing step.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | walk-to | `loc.workstation` | HUD: "David is waiting at your desk" | Seated |
| 2 | dialogue | `npc.david` | "I'm David, and I look after the SDK frameworks, including the Terminal SDK. Orca supports Go through custom extensions, and we test it through Pigeon and the mobile runners. Today: how Orca decides which robot runs your test." | continue |
| 3 | computer-task | `app.orca` | HUD: "Open Robot Capabilities for WALL-E and ROSIE". WALL-E†: `{"deviceType":"FLEX_3","printer":true,"physicalTouch":true,"dip":true,"tap":true}`; ROSIE†: `{"deviceType":"FLEX_POCKET","printer":false,…}`. | Both viewed |
| 4 | dialogue | `npc.david` | "Two ways to ask for capabilities. SDK frameworks use dynamic JSON lookups: the capabilities live as JSON metadata inside each test definition and Orca parses them at runtime. Traditional UI Automator suites use non-dynamic lookups, hardcoded in the pipeline script. The Contact Canada scripts on the Westers beds use both, interchangeably." | continue |
| 5 | computer-task | `app.intellij` | HUD: "This Go SDK receipt test needs a printer. Add it to the test's capabilities." Open `gort/go-sdk/tests/sale_receipt.json`†; in the `"capabilities"` object add `"printer": true`. Save → Orca **Match preview**† no longer lists `rosie` (Flex Pocket, `"printer": false`). | JSON valid and contains `"printer": true` |
| 6 | computer-task | `app.jenkins` | HUD: "Find the hardcoded capabilities in the UI Automator pipeline". Open `Java/uia-remote-regression-flex` → **Pipeline script**; highlight line†: `def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch: true]`. | Line clicked |
| 7 | computer-task | `app.orca` | HUD: "Open Merchant Config and find GO-SDK-US-01's API Key". The table shows only Name, Region, PIN Bypass… (truncated). Player clicks **Edit** on the row; full form shows App ID `app_sim_7f3a`†, App Secret `••••••`, API Key *(blank)*. | Edit dialog opened |
| 8 | dialogue | `npc.tate` | "Table display limits: you always have to click Edit to see every field. I added App ID, App Secret and API Key so pipelines can export them as runtime environment variables for the Go SDK." | continue |
| 9 | computer-task | `app.orca` → `app.jenkins` | HUD: "Enter the API Key from ticket LAB-2231† and run Java/go-sdk-sale-smoke". API Key `key_sim_19c0e2`†. Console shows `APP_ID=app_sim_7f3a`, `APP_SECRET=****`, `API_KEY=****` exported. | Build env shows all three set; build green |
| 10 | dialogue | `npc.david` | "Merchant swaps are Laz's job. Laz Automation is our provisioning framework: a zero-touch out-of-box-experience routine. It de-provisions the device, wipes local caches, walks the setup wizard, and can swap merchants mid-suite. Merchant Config feeds it." | continue |
| 11 | computer-task | `app.jenkins` | HUD: "Swap DATA to merchant AUTO-US-NOPIN-02 with Laz". Build `Java/laz-oobe-merchant-swap` with `ROBOT_NAME=data`, `MERCHANT=AUTO-US-NOPIN-02`. Console stages†: `ubi: routing merchant switch → AUTO-US-NOPIN-02` · `laz: de-provision` · `laz: wipe caches` · `laz: setup wizard 1/6…6/6` · `laz: merchant active`. | Build green |
| 12 | inspect | `prop.data.device` | HUD: "Watch DATA go through the setup wizard" (`loc.adb-shelf`). Screen cycles through wizard pages, ending on the new merchant's home screen. | Crosshair ≥ 2 s during wizard |
| 13 | quiz-checkpoint | `CP-M08.1`: Q144, Q145, Q146, Q151, Q153, Q158 | Checkpoint "Capabilities & Merchants" | ≥ 80 % |

---

### M09 — Screens, Screen Locations & xy_touch (ADB Bots vs Physical Bots)

| Field | Value |
|---|---|
| **Mentor** | Jared (`npc.jared`) |
| **Prerequisites** | M04, M07 |
| **Est. duration** | 22 min |
| **Setup** | EVE (FLEX_4) has received the "scan for receipt" firmware: its receipt screen now shows 5 options and all buttons sit 3.0 mm† lower. Orca still has only `RECEIPT_OPTIONS_4` for FLEX_4. A ruler `prop.ruler` sits on Rack A. |
| **Facts covered** | F082, F096, F141, F142, F143, F144, F213, F214, F215, F216, F217, F218, F219, F220, F221 |
| **Unlocks** | M15 (with M13) · Arcade incidents `INC-COORD-DRIFT`, `INC-PIN-ON-ADB-BOT` · deck `deck.M09` |

**Learning objectives**
1. Explain the Screens entity (layouts in a transaction flow per device architecture) and Screen Locations (button X/Y in mm).
2. Call xy_touch with a screen name and button string and predict whether the Pi fires an ADB touch or a physical probe tap.
3. Choose ADB bots vs physical bots correctly (PIN entry, Canadian flows, ADB-blind displays).
4. Recover from a layout shift: measure, create a separate 5-option map, and land the coordinate PR.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | dialogue | `npc.jared` | "Robots don't see buttons. They know where buttons are, in millimetres, because Orca tells them. Screens are the layouts in a transaction flow for each device architecture. Screen Locations are the button positions, X and Y in millimetres from the zero-zero my limit switches give us." | continue |
| 2 | computer-task | `app.orca` | HUD: "Open Screens → FLEX_3 → TENDER_CASH_DISCOUNT". The cash-discount tender selection prompt. Then open its **Screen Locations**: `Cash  X 22.0  Y 58.5`, `Card  X 62.0  Y 58.5`†. | Screen Locations list viewed |
| 3 | computer-task | `app.terminal` | HUD: "Tap Cash on WALL-E through Orca". `curl -X POST http://orca.lab.local:8080/api/xy_touch -H "Content-Type: application/json" -d '{"robot":"wall-e","screen":"TENDER_CASH_DISCOUNT","button":"Cash"}'` → `{"result":"OK","mode":"PHYSICAL_TAP","x_mm":22.0,"y_mm":58.5}`†. WALL-E's gantry moves and the solenoid taps Cash (visible on `app.camera` or in-world). | Physical tap executed |
| 4 | computer-task | `app.terminal` | HUD: "Same call, but robot TARS". Response `"mode":"ADB_TOUCH"`†; TARS's screen reacts with no moving parts. | ADB touch executed |
| 5 | dialogue | `npc.jared` | "Same endpoint, two outcomes. TARS is an ADB bot, purely programmatic. It can't physically touch a screen or type a PIN, so ADB bots only get merchant configs that bypass PIN security. Touch robots have mechanical probes." | continue |
| 6 | computer-task | `app.jenkins` | HUD: "A Canadian Interac test needs PIN entry. Pick the robot." Build `Java/contact-canada-pin-sale`† asks for `ROBOT_NAME`; choices: `tars`, `data`, `seti`, `wall-e`. | `seti` chosen (TARS/DATA → console `PIN entry requires physical touch`; WALL-E → `capability mismatch: deviceType COMPACT required`) |
| 7 | inspect | `prop.seti.device` | HUD: "Watch SETI enter the PIN" (`loc.rack-b`). Solenoid taps 4 PIN digits on the Compact. | Crosshair ≥ 2 s during PIN taps |
| 8 | dialogue | `npc.jared` | "Canada mandates physical PIN entry, and some displays are blind to ADB. Those two cases are why physical bots exist. Now, a war story: the day we added a 'scan for receipt' QR code." | continue |
| 9 | computer-task | `app.camera` | HUD: "EVE's receipt test is failing. Watch the stream." EVE taps ~3 mm above `Print` and hits the gap; the screen shows a 5th option `Scan for receipt`. | Clip watched to end |
| 10 | interact | `prop.ruler` → `prop.eve.device` | HUD: "Measure the new Print button position with the ruler". Ruler snaps to the screen top-left; reading `Print: Y 74.0 mm` (was 71.0)†. Player measures Print, Email, Text, No Receipt, Scan for receipt. | 5 measurements within ±0.5 mm |
| 11 | computer-task | `app.orca` | HUD: "Create the 5-option receipt map for FLEX_4 and keep the 4-option one." **Screens → New** `RECEIPT_OPTIONS_5` (FLEX_4) with 5 locations from the measurements. `RECEIPT_OPTIONS_4` must remain unchanged. | Both screens exist; 5-option coordinates within ±0.5 mm |
| 12 | computer-task | `app.github` | HUD: "Open a PR with the coordinate change and request Jared's review". Repo `gort`, branch `fix/flex4-receipt-qr`, PR title `Add 5-option receipt coordinates for FLEX_4`. Jared approves and merges (scripted, 20 s). | PR merged |
| 13 | dialogue | `npc.jared` | "When the QR button first shipped, it pushed everything down a few millimetres and broke every ruler-measured coordinate in the lab for 48 hours, until I merged the coordinate PR. And it's conditional, so Orca keeps separate maps for 4-option and 5-option receipt screens on every device profile. You just did it in five minutes." | continue |
| 14 | quiz-checkpoint | `CP-M09.1`: Q167, Q168, Q170, Q172, Q174, Q180, Q184 | Checkpoint "Coordinates & Bots" | ≥ 80 % |

---

### M10 — Card Profiles: Gort, Callus & Collis

| Field | Value |
|---|---|
| **Mentor** | Jared (`npc.jared`); cameo David |
| **Prerequisites** | M08 |
| **Est. duration** | 18 min |
| **Setup** | MINIX-01 (`10.42.20.1`, Callus on `:9000`) serves Rack A. Scheduled task `GortCardSync`† is configured. Card profiles as in §0.4. |
| **Facts covered** | F034, F035, F048, F049, F050, F069, F070, F071, F097, F145, F146, F147, F148, F149, F224, F225 |
| **Unlocks** | — (required for M18) · Arcade incidents `INC-CALLUS-DOWN`, `INC-CARD-PATH` · deck `deck.M10` |

**Learning objectives**
1. Explain Collis probes (UL Transaction Security): expensive card emulators on rear ribbon cables that do swipe, dip and tap.
2. Explain Callus (aka Callers / Collos) on Windows/Minix boxes: it reads Gort card paths and drives the probes.
3. Distinguish swipe profiles (raw Track Data in MySQL, from a card-reader utility) from dip/tap profiles (file paths into Gort, cloned to Windows boxes by a scheduled job).
4. Pick card profiles the team's way: one reliable Visa, plus Interac for Canada.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | walk-to | `loc.callus-shelf` | HUD: "Meet Jared at the Callus shelf" | within 1.5 m |
| 2 | inspect | `prop.collis-probe-a` | HUD: "Inspect the Collis probe". Callouts: "UL Transaction Security", "Rear ribbon cable → WALL-E's card reader", "Power: AC strip". | Crosshair ≥ 1.0 s |
| 3 | dialogue | `npc.jared` | "Collis probes: high-cost, proprietary card emulators. One probe can fake a mag-stripe swipe, an EMV chip dip and a contactless NFC tap. The ribbon cable out the back runs to the device's card reader. Treat them like gold." | continue |
| 4 | inspect | `prop.minix-01` | HUD: "What's running on the Minix box?" Screen†: "Callus service · listening on :9000 · probes: WALL-E, EVE, BUMBLEBEE, R2-D2". | Crosshair ≥ 1.0 s |
| 5 | dialogue | `npc.david` | "That's Callus, a microservice on the local Windows and Minix boxes. You'll hear Callers or Collos. Same thing. It reads card profile paths from Gort and drives the Collis probes during virtual card transactions." | continue |
| 6 | computer-task | `app.orca` | HUD: "Open Card Profiles → VISA_STD_SWIPE". Type `Swipe`; Track Data shown inline†: `%B4111111111111111^SIM/VISA^30121010000000000000?;4111111111111111=3012101000000000?`. | Profile opened |
| 7 | computer-task | `app.orca` | HUD: "Now open VISA_STD_DIP and find where the card lives". Type `Dip`; Path `cards/emv/visa_std_dip.json`†. | Path field clicked |
| 8 | dialogue | `npc.jared` | "Swipes are easy: raw Track Data text, pulled off a real card with a hardware card-reader utility, sits right in the MySQL table. Dip and tap are files: the profile just stores a path into Gort, our monorepo." | continue |
| 9 | computer-task | `app.github` | HUD: "Find the dip card file in Gort". Navigate `gort` → `cards/emv/visa_std_dip.json`. Top-level folders visible: `cards/`, `config/`, `go-sdk/`, `suites/`†. | File opened |
| 10 | computer-task | `app.terminal` | HUD: "Check the scheduled clone on MINIX-01". `ssh automation@10.42.20.1` then `schtasks /query /tn GortCardSync` → `GortCardSync  10/05/2026 10:00:00  Ready`† and `dir C:\gort\cards\emv` → lists `visa_std_dip.json`, `interac_ca_dip.json`. | Both commands run |
| 11 | computer-task | `app.terminal` | HUD: "Dip the Visa card into WALL-E through Orca". `curl -X POST http://orca.lab.local:8080/api/card/dip -H "Content-Type: application/json" -d '{"robot":"wall-e","profile":"VISA_STD_DIP"}'`. Callus log (MINIX-01)†: `map cards/emv/visa_std_dip.json → C:\gort\cards\emv\visa_std_dip.json · load virtual card OK · probe wall-e: DIP`. WALL-E's dip arm inserts the ribbon card; Flex shows "Card inserted". | Dip completed |
| 12 | dialogue | `npc.jared` | "Our team keeps it simple: one reliable Visa profile to prove the pipeline, plus Canadian Interac for regional flows. PayCore is the opposite. They run back-to-back card matrices: Visa, Discover, AmEx." | continue |
| 13 | computer-task | `app.jenkins` | HUD: "Pick card profiles for tonight's runs". `Java/go-sdk-sale-smoke` → `CARD_PROFILE` = ? ; `Java/contact-canada-pin-sale` → `CARD_PROFILE` = ?. Options: `VISA_STD_DIP`, `INTERAC_CA_DIP`, `AMEX_MATRIX_DIP` (PayCore), `DISCOVER_MATRIX_DIP` (PayCore). | US → `VISA_STD_DIP`; Canada → `INTERAC_CA_DIP` |
| 14 | quiz-checkpoint | `CP-M10.1`: Q189, Q190, Q193, Q196, Q200, Q205, Q207 | Checkpoint "Cards" | ≥ 80 % |

---

### M11 — Jenkins: The Executor

| Field | Value |
|---|---|
| **Mentor** | Tate (`npc.tate`) |
| **Prerequisites** | M06, M07 |
| **Est. duration** | 12 min |
| **Setup** | Jenkins job `Java/uia-remote-regression-flex` has a saved parameter `DEVICE_TYPE=flex_3` (lower case). |
| **Facts covered** | F015, F016, F017, F094, F095, F102, F122, F189, F203 |
| **Unlocks** | — (required for M18) · Arcade incident `INC-ENV-CASE` · deck `deck.M11` |

**Learning objectives**
1. Describe Jenkins as the Executor: it triggers pipelines, injects runtime env vars and checks out robots from Orca.
2. Navigate the legacy platform split (Java jobs vs iOS jobs).
3. Fix the lower-case enum failure and read the injected environment in a console log.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | dialogue | `npc.tate` | "Jenkins is the Executor. It triggers the pipeline, checks a robot out of Orca, and injects the runtime environment variables the test runner needs. In CI, nobody hand-edits config: Jenkins injects it." | continue |
| 2 | computer-task | `app.jenkins` | HUD: "Open the legacy views". Dashboard tabs `Java` and `iOS`. | Both views opened |
| 3 | dialogue | `npc.tate` | "Legacy jobs are organised by platform: Java jobs here, iOS jobs there. The iOS runner is rarely touched, but iOS Go SDK testing is active, so don't delete anything." | continue |
| 4 | computer-task | `app.jenkins` | HUD: "Build Java/uia-remote-regression-flex with its saved parameters". Console†: `[orca] checkout request deviceType=flex_3` → `java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.flex_3` → `FAILURE`. | Failed build viewed |
| 5 | dialogue | `npc.tate` | "Device Type is an enum in Orca, so the string has to match exactly. That's why our Jenkins env vars are ALL CAPS." | continue |
| 6 | computer-task | `app.jenkins` | HUD: "Fix the parameter and rebuild". `DEVICE_TYPE=FLEX_3`. Console†: `[orca] checkout → wall-e (FLEX_3) OK`. | Build passes checkout |
| 7 | computer-task | `app.orca` | HUD: "Check WALL-E in Orca while the build runs". Row shows `Available · in use by Jenkins #4127`†; after the build: no longer in use. | Both states observed |
| 8 | computer-task | `app.jenkins` | HUD: "Find the injected port number in the console's environment block". Lines†: `RUN_TYPE=standalone`, `DEVICE_TYPE=FLEX_3`, `ROBOT_NAME=wall-e`, `PORT_NUMBER=5444`, `THEME=avocado`, `KERNEL_TYPE=CPA`. | `PORT_NUMBER=5444` line clicked |
| 9 | computer-task | `app.jenkins` | HUD: "Run Java/uia-remote-regression-flex on ROSIE (Unavailable)". Must set `ROBOT_NAME=rosie` (exact unique name). | Build checks out rosie |
| 10 | quiz-checkpoint | `CP-M11.1`: Q214, Q215, Q216, Q217, Q220 | Checkpoint "Jenkins" | ≥ 80 % |

---

### M12 — ADB on Port 5444

| Field | Value |
|---|---|
| **Mentor** | Morgan (`npc.morgan`) |
| **Prerequisites** | M05 |
| **Est. duration** | 12 min |
| **Setup** | TARS (FLEX_4, `10.42.30.32`) on HomeScreen. Terminal has `adb`. |
| **Facts covered** | F024, F025, F026, F199 |
| **Unlocks** | M13 · Arcade drill "ADB Speedrun" · deck `deck.M12` |

**Learning objectives**
1. Connect to a lab device over ADB on port 5444 and list devices.
2. Dump and read the XML UI hierarchy to locate an element's bounds.
3. Dispatch a programmatic tap with `input tap`.
4. Recognise 5555 as the standard ADB default and the refused connection it produces in the lab.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | dialogue | `npc.morgan` | "ADB, the Android Debug Bridge, is the command-line tool we use to talk to a LabSim without touching it. Read the screen's XML hierarchy, find elements, send taps." | continue |
| 2 | computer-task | `app.terminal` | HUD: "Connect to TARS". `adb connect 10.42.30.32:5444` → `connected to 10.42.30.32:5444`. | Connected |
| 3 | computer-task | `app.terminal` | HUD: "List devices". `adb devices` → `List of devices attached` / `10.42.30.32:5444	device`. | Output shown |
| 4 | computer-task | `app.terminal` | HUD: "Dump the UI hierarchy". `adb -s 10.42.30.32:5444 shell uiautomator dump` → `UI hierchary dumped to: /sdcard/window_dump.xml` (the real tool's own spelling). | Dump done |
| 5 | computer-task | `app.terminal` | HUD: "Pull it and find the Register icon". `adb -s 10.42.30.32:5444 pull /sdcard/window_dump.xml` then `grep -o 'text="Register"[^>]*' window_dump.xml` → `text="Register" … bounds="[96,412][288,604]"`†. HUD asks: "Centre point?" Player types `192 508`. | Centre entered correctly |
| 6 | computer-task | `app.terminal` | HUD: "Tap it". `adb -s 10.42.30.32:5444 shell input tap 192 508` → Register opens on TARS (camera + in-world). | Register open on TARS |
| 7 | dialogue | `npc.morgan` | "Notice the port. Our lab runs ADB on 5444. Out of the box, ADB uses 5555. Try leaving the port off and see what happens." | continue |
| 8 | computer-task | `app.terminal` | `adb connect 10.42.30.32` → `failed to connect to '10.42.30.32:5555': Connection refused`. | Error shown |
| 9 | dialogue | `npc.morgan` | "Lab devices only listen on 5444. Remember that, because 5555 has a story, and you're about to live it." | continue |
| 10 | quiz-checkpoint | `CP-M12.1`: Q225, Q226, Q227, Q228, Q231 | Checkpoint "ADB" | ≥ 80 % |

---

### M13 — uia-remote: Structure & the Page Object Model

| Field | Value |
|---|---|
| **Mentor** | Morgan (`npc.morgan`) |
| **Prerequisites** | M12 |
| **Est. duration** | 22 min |
| **Setup** | GitHub org `labsim-lab`† with repos `gort`, `uia-remote`, `pigeon`. `HomeScreen.open()` has a seeded bug (Flex branch scrolls horizontally). `ReceiptScreen.java` lacks the mandatory methods. |
| **Facts covered** | F001, F005, F006, F010, F018, F027, F028, F039, F040, F159, F163, F164, F165, F166, F167, F168, F169, F170, F171, F172, F173, F174, F175, F176, F177, F178, F179, F180 |
| **Unlocks** | M14, M15 · Arcade drills "Where Does It Go?", "POM Doctor" · deck `deck.M13` |

**Learning objectives**
1. Clone uia-remote from GitHub into IntelliJ IDEA and navigate `app/src/{main,test,androidTest}` (Maven-style layout).
2. Place files correctly: androidTest packages `databases`, `pageobjects`, `testactions`; runner in `test`; never touch `main`.
3. Read a screen class: extends BaseTest, Zone 1 locators, Zone 2 helpers, mandatory `waitForScreen()` / `isScreenPresent()`.
4. Fix `open(String appName)` scroll direction (Flex vertical; Mini/Station horizontal).
5. Explain the multi-device runner trick (UI Automator talks to one device at a time).

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | dialogue | `npc.morgan` | "uia-remote is mine. I built it because no framework could automate native tethered setups: Station-to-Mini, Mini-to-Mini, Station Duo. It's Java on Google's Android UI Automator, version 2.3, and it drives standalone and tethered devices across native LabSim apps." | continue |
| 2 | computer-task | `app.github` | HUD: "Copy the uia-remote clone URL". Repo `labsim-lab/uia-remote` → **Code** → copy `git@github.com:labsim-lab/uia-remote.git`†. | URL copied |
| 3 | computer-task | `app.intellij` | HUD: "Clone it into IntelliJ IDEA". **File → New → Project from Version Control…** → paste → **Clone**. Project opens and indexes. | Project open |
| 4 | computer-task | `app.intellij` | HUD: "Expand app/src and click the folder QA engineers never modify". Tree shows `main`, `test`, `androidTest` (Maven-style layout). | `main` clicked (wrong → Morgan: "That one's fair game. Try again.") |
| 5 | computer-task | `app.intellij` | HUD: "Put these files where they belong". Drag: `DbHelper.java` → `androidTest/…/databases`; `HomeScreen.java`, `LockScreen.java` → `androidTest/…/pageobjects`; `TaxTest.java` → `androidTest/…/testactions`; `MultiDeviceRunner.java` → `test`; `AppRegistration.java` → `main`. | 6/6 correct |
| 6 | computer-task | `app.intellij` | HUD: "Open HomeScreen.java and click Zone 1, then Zone 2". (File content: see snippet below.) | Both zones clicked in order |
| 7 | dialogue | `npc.morgan` | "Every screen, pop-up or window gets its own class extending BaseTest, which gives you global setup, teardown and instance variables. Zone 1 declares the elements. Zone 2 holds the helpers, and that's where device quirks hide. For example, open(appName) scrolls vertically on a Flex and horizontally on a Mini or a Station." | continue |
| 8 | computer-task | `app.intellij` | HUD: "HomeScreenTest fails on WALL-E (Flex 3). Fix open()". Seeded bug swaps the branches. Player edits so `FLEX → scrollVertically`, `MINI`/`STATION → scrollHorizontally`; runs `HomeScreenTest` on WALL-E. | Run green |
| 9 | computer-task | `app.intellij` | HUD: "ReceiptScreenTest is flaky. Find out why". Run → camera shows the tap landing before the receipt screen finishes rendering → `UiObjectNotFoundException`. Player adds `waitForScreen()` and `isScreenPresent()` to `ReceiptScreen.java` (template insert via **Alt+Enter → Implement mandatory screen methods**†). Run ×3 → green ×3. | Both methods present; 3 green runs |
| 10 | dialogue | `npc.morgan` | "Google built UI Automator to talk to one Android device at a time. My trick: screen definitions live in androidTest, the runner lives in test, and the runner hops between device handles. MFD runs method X, focus shifts to the CFD for method Y, then back." | continue |
| 11 | computer-task | `app.intellij` | HUD: "Order the runner's calls for a tethered sale" in `MultiDeviceRunner.java`: drag lines `mfd.run(registerHome::addTaxItem5)`, `mfd.run(registerHome::reviewOrder)`, `cfd.run(cfdTotals::assertTotals)`, `mfd.run(registerHome::payAndCharge)`, `cfd.run(cfdPayment::finalisePayment)`. | Correct order |
| 12 | quiz-checkpoint | `CP-M13.1`: Q233, Q234, Q240, Q241, Q243, Q248, Q257, Q261 | Checkpoint "uia-remote & POM" | ≥ 80 % |

**In-game file — `app/src/androidTest/java/com/lab/uia/pageobjects/HomeScreen.java` (illustrative†)**

```java
/** HomeScreen: LabSim launcher. Every test starts and ends here. */
public class HomeScreen extends BaseTest {

    // ===== Zone 1: Element Locators =====
    private final BySelector registerIcon = By.text("Register");
    private final BySelector ordersIcon   = By.text("Orders");
    private final BySelector clock        = By.res("com.labsim.launcher:id/clock");

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(clock), TIMEOUT_MS);   // never click unrendered buttons
    }

    public boolean isScreenPresent() {
        return device.hasObject(clock);
    }

    public void open(String appName) {
        waitForScreen();
        if (deviceType == DeviceType.FLEX) {
            scrollVerticallyTo(appName);      // Flex: vertical
        } else {                              // Mini, Station
            scrollHorizontallyTo(appName);    // horizontal
        }
        device.findObject(By.text(appName)).click();
    }
}
```

**In-game file — `app/src/test/java/com/lab/uia/runner/MultiDeviceRunner.java` (excerpt, illustrative†)**

```java
// UI Automator talks to ONE device at a time, so we hop between handles.
DeviceHandle mfd = DeviceHandle.connect(config.merchantFacingDeviceIp(), config.portNumber());
DeviceHandle cfd = DeviceHandle.connect(config.customerFacingDeviceIp(), config.portNumber());

mfd.run(registerHome::addTaxItem5);     // MFD_O1
mfd.run(registerHome::reviewOrder);
cfd.run(cfdTotals::assertTotals);       // CFD_O1
mfd.run(registerHome::payAndCharge);    // MFD_O2
cfd.run(cfdPayment::finalisePayment);   // Step 4
```

---

### M14 — config.properties & the Tethered Tax Test

| Field | Value |
|---|---|
| **Mentor** | Morgan (`npc.morgan`); cameo Coworker (`npc.coworker`) |
| **Prerequisites** | M13 |
| **Est. duration** | 22 min |
| **Setup** | The cloned uia-remote has the broken `config.properties` below. A coworker's desk Flex (`10.42.60.4`, ADB on 5555) is already known to the workstation's ADB server. MEGATRON (STATION_2 MFD `10.42.30.21` + MINI_2 CFD `10.42.30.22`, env DEV1) is Available. |
| **Facts covered** | F054, F181, F182, F183, F184, F185, F186, F187, F188, F189, F190, F191, F192, F193, F194, F195, F196, F197, F198, F199, F200, F201 |
| **Unlocks** | M16 · Arcade incidents `INC-PORT-COLLISION`, `INC-CONFIG-LOCKS`, `INC-DUO-SAME-IP` · deck `deck.M14` |

**Learning objectives**
1. Configure `config.properties` for a local tethered run: runType, MFD/CFD IPs (same IP on a Station Duo), serial, deviceType, theme, kernelType, portNumber, extra keys.
2. Explain the 5444 lock (5555 default caused coworker-device collisions) and the avocado / CPA locks.
3. Reserve the rig, run the Tax test and narrate MFD_O1 → CFD_O1 → MFD_O2 → Step 4, including the Orca→Callus swipe load and the HomeScreen safe state.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | computer-task | `app.intellij` | HUD: "Run TaxTest against MEGATRON". Player clicks ▶ on `TaxTest`. Runner log†: `connect 10.42.30.21:5555 … refused` · `falling back to first known device: 10.42.60.4:5555` · `[MFD_O1] open Register`. | Run started |
| 2 | dialogue | `npc.coworker` | (shouted from `loc.coworker-desks`) "Hey! Something just opened Register on my desk Flex and added a Tax Item 5! Is that one of yours?!" | continue |
| 3 | inspect | `prop.coworker-device` | HUD: "Go and look at the coworker's device". Screen shows Register with "Tax Item 5" in the cart. Player presses **Stop** in IntelliJ (HUD reminder) on return. | Viewed and run stopped |
| 4 | dialogue | `npc.morgan` | "Classic. Check your config.properties. I bet you're on 5555, the out-of-the-box ADB port. Lab devices only listen on 5444, so your connect was refused and the runner grabbed the first device ADB already knew: a coworker's desk device on the default port. That exact collision is why portNumber is locked to 5444." | continue |
| 5 | computer-task | `app.intellij` | HUD: "Fix config.properties for MEGATRON (tethered)". Start file and required end state: see snippets below. Inline validator† checks each key on save. | Validator: `config.properties ✓ 11/11` |
| 6 | dialogue | `npc.morgan` | "theme is locked to avocado; the old theme toggles are deprecated. kernelType is CPA, Core Payments Application, which replaced SPA, the Secure Processor Application. deviceType is the family: Mini, Flex or Station, and it drives layout and scroll logic. Extras: unlock passcode, backend environment, and the robot's registration name. On a Station Duo, both IPs are the same address. And in CI you never touch this file. Jenkins injects all of it." | continue |
| 7 | interact | `npc.coworker` | HUD: "Apologise to your coworker". Choice: "Sorry! My script was on 5555. It's 5444 now and it'll stay that way." | Line chosen; coworker: "Ha. Welcome to the club." |
| 8 | computer-task | `app.orca` | HUD: "You're running locally, so reserve MEGATRON". Status → `Reserved`. | `orca.robot('megatron').status == 'Reserved'` |
| 9 | computer-task | `app.intellij` | HUD: "Open TaxTest.java, read the header, then run it". Header: see snippet. Run ▶. | Run started with valid config |
| 10 | walk-to | `loc.rack-tethered` | HUD: "Watch MEGATRON run the Tax test" (optional: `app.camera` also works; walking gives +50 XP) | within 2 m or camera open |
| 11 | inspect | `prop.megatron.mfd` | **MFD_O1**: Register opens, "Tax Item 5" added, "Review Order" tapped. HUD log: `[MFD_O1] orca → callus: load swipe card VISA_STD_SWIPE … OK`. | Crosshair on MFD during MFD_O1 |
| 12 | inspect | `prop.megatron.cfd` | **CFD_O1**: CFD shows Subtotal `$10.00`, Tax `$0.83`, Total `$10.83`†; three green ✓ assertions float above the screen. | Crosshair on CFD during CFD_O1 |
| 13 | inspect | `prop.megatron.mfd` | **MFD_O2**: "Pay" then "Charge" on MFD. **Step 4**: CFD finalises the payment prompt. Teardown: both screens return to HomeScreen. Log: `TaxTest PASSED (4/4 steps)`. | Test passed |
| 14 | computer-task | `app.orca` | HUD: "Done locally. Release MEGATRON". Status → `Available`. | Available |
| 15 | quiz-checkpoint | `CP-M14.1`: Q275, Q276, Q279, Q284, Q286, Q288, Q290, Q296 | Checkpoint "Config & Tax Test" | ≥ 80 % |

**In-game file — `config.properties` as found (broken; illustrative values†)**

```properties
runType=standalone
merchantFacingDeviceIp=10.42.30.21
customerFacingDeviceIp=
serial=SIM-S2-000021
deviceType=Mini
theme=classic
kernelType=SPA
portNumber=5555
unlockPasscode=0000
backendEnv=DEV1
robotName=megatron
```

**Required end state (validator target)**

```properties
runType=tethered
merchantFacingDeviceIp=10.42.30.21
customerFacingDeviceIp=10.42.30.22
serial=SIM-S2-000021
deviceType=Station
theme=avocado
kernelType=CPA
portNumber=5444
unlockPasscode=0000
backendEnv=DEV1
robotName=megatron
```

Key names `runType`, `merchantFacingDeviceIp`, `customerFacingDeviceIp`, `serial`, `deviceType`, `theme`, `kernelType`, `portNumber` are from the reference. `unlockPasscode`, `backendEnv`, `robotName` are **illustrative† names** for the reference's "device unlock passcodes, backend testing environment targets, and the active robot's registration name". For R2-D2 (Station Duo) the validator expects `merchantFacingDeviceIp=customerFacingDeviceIp=10.42.30.14` and `deviceType=Station`.

**In-game file — `TaxTest.java` header (illustrative†)**

```java
/*
 * TaxTest — tethered (MFD + CFD)
 * Intent: verify that a taxable item rings up with the correct subtotal,
 * calculated tax and grand total on the Customer display, then completes
 * payment with a simulated swipe card loaded by Orca via Callus.
 * Safe state: starts on HomeScreen; teardown forces both devices back to HomeScreen.
 * Steps: MFD_O1 → CFD_O1 → MFD_O2 → CFD finalise.
 */
```

---

### M15 — Pigeon (LSTR) & Legacy JSON

| Field | Value |
|---|---|
| **Mentor** | Morgan (`npc.morgan`); cameo Jared |
| **Prerequisites** | M09, M13 |
| **Est. duration** | 18 min |
| **Setup** | `pigeon/tests/sale/swipe_sale_print.json` is missing a comma after line 22. BUMBLEBEE (MINI_3) has outdated receipt coordinates; Jared's PR `gort#418 Update MINI_3 receipt coordinates`† is open. |
| **Facts covered** | F009, F012, F041, F042, F043, F044, F045, F202, F203, F204, F205, F206, F207, F208, F209, F210, F211 |
| **Unlocks** | M16 · Arcade drills "Comma Hunt", "Log Detective" · deck `deck.M15` |

**Learning objectives**
1. Explain Pigeon's lineage (Lester → Pigeon, the "pidgin" pun) and LSTR = Language Specific Test Runner with REST, Android, Windows and iOS runners.
2. Read a Pigeon JSON test: name, connection type, supported platforms (4–5 at once), actions (create requests, pass parameters, store outputs).
3. Survive the missing JSON linter: find a missing comma or paste a known-good block.
4. Decode a misleading "select print" failure as a printer-payload timeout caused by stale coordinates.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | dialogue | `npc.morgan` | "Before uia-remote there was Lester, and Lester evolved into Pigeon. The name's a pun on pidgin language. Its engine is LSTR, the Language Specific Test Runner. Tests are raw JSON, and the runner speaks REST, Android, Windows and iOS." | continue |
| 2 | computer-task | `app.intellij` | HUD: "Open the pigeon repo and click the runner that's rarely touched". Tree: `runners/rest`, `runners/android`, `runners/windows`, `runners/ios`. | `runners/ios` clicked; Morgan: "Rarely touched, though iOS Go SDK testing is very much alive." |
| 3 | computer-task | `app.intellij` | HUD: "Open swipe_sale_print.json and click the four parts of a Pigeon test". Click `name`, `connectionType`, `platforms`, `actions`. | All four clicked |
| 4 | dialogue | `npc.morgan` | "See the 'card swipe' action? The runner abstracts it. Over REST it becomes a platform-specific SDK payment request; on a rig it becomes a physical robot action through Orca. One test can target four or five platforms at once." | continue |
| 5 | computer-task | `app.jenkins` | HUD: "Run Java/pigeon-android-sale-swipe". Console†: `LSTR ParseError: Unexpected string in JSON at line 23 column 7` → `FAILURE`. | Failure viewed |
| 6 | computer-task | `app.intellij` | HUD: "Pigeon has no JSON linter. Find the problem by hand (or paste a known-good block)". The project shows no JSON inspections for Pigeon. Player adds the missing `,` at end of line 22 **or** replaces the action with the block from `tests/_templates/known_good_actions.json`. | File parses (Jenkins rebuild passes the parse stage) |
| 7 | dialogue | `npc.morgan` | "No linter, so the survival skill is copy-pasting JSON blocks that already work instead of writing syntax from scratch." | continue |
| 8 | computer-task | `app.jenkins` | HUD: "Rebuild and read the failure". Console†: `step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s` → `FAILED at "select print"`. | Failure viewed |
| 9 | interact | `npc.morgan` | HUD: "What broke?" Choices: (a) "The printer is out of paper." ✘ (b) "The 'select print' JSON is invalid." ✘ (c) "The arm missed the Print button, so no printer payload arrived before the timeout." ✔ | (c) chosen; on wrong pick Morgan explains and re-asks |
| 10 | computer-task | `app.camera` | HUD: "Prove it on BUMBLEBEE's recording". Playback shows the solenoid tapping ~3 mm above "Print"†. | Clip viewed |
| 11 | computer-task | `app.github` | HUD: "Approve Jared's coordinate PR, then rerun". Approve `gort#418`; Jared merges (scripted); rebuild → `PASSED`. | Build green |
| 12 | quiz-checkpoint | `CP-M15.1`: Q308, Q309, Q311, Q312, Q316, Q320, Q322 | Checkpoint "Pigeon" | ≥ 80 % |

**In-game file — `pigeon/tests/sale/swipe_sale_print.json` (illustrative†; the bug is the missing comma after `"robot": "${ROBOT_NAME}"`)**

```json
{
  "name": "Swipe sale with printed receipt",
  "connectionType": "USB",
  "platforms": ["REST", "ANDROID", "WINDOWS", "IOS"],
  "actions": [
    { "action": "create order", "params": { "item": "Tax Item 5" }, "store": "orderId" },
    { "action": "card swipe",   "params": { "profile": "VISA_STD_SWIPE", "orderId": "${orderId}" }, "store": "paymentId" },
    { "action": "select print", "params": { "robot": "${ROBOT_NAME}"
                                            "screen": "RECEIPT_OPTIONS_5" } },
    { "action": "screenCompare", "params": { "x": 412, "y": 288, "w": 236, "h": 44, "expected": "TOTAL $10.83" } }
  ]
}
```

---

### M16 — Seeing the Second Screen: Station Duo, OCR, GIMP & UIA 2.3

| Field | Value |
|---|---|
| **Mentor** | Morgan (`npc.morgan`) |
| **Prerequisites** | M14, M15 |
| **Est. duration** | 20 min |
| **Setup** | R2-D2 (STATION_DUO, `10.42.30.14`) mid-sale showing totals on its CFD. R2-D2's webcam (`http://10.42.10.14:8081/stream.mjpg`) is aimed at the CFD. Tutorial toggle "CFD layout v2"† available in Orca's Screen Compare test panel. |
| **Facts covered** | F006, F007, F029, F030, F088, F150, F151, F152, F153, F154, F155, F156, F193, F212, F221 |
| **Unlocks** | M17 · Arcade incidents `INC-OCR-BRITTLE`, `INC-DUO-BLIND` · deck `deck.M16` |

**Learning objectives**
1. Explain the dual-screen problem: on a Station Duo only the primary MFD is exposed to ADB; legacy UI Automator is blind to the CFD (an ADB-blind display).
2. Build a Screen Compare Image (bounding box from GIMP + expected text), and describe capture → crop → Tesseract → boolean.
3. Show why it is brittle (10-pixel shift, capitalisation, typo) and why it is being phased out for UI Automator 2.3's native dual-screen tracking.
4. Configure a Station Duo: MFD IP = CFD IP.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | walk-to | `loc.rack-a` | HUD: "Go to R2-D2 (Station Duo)" | within 1.5 m |
| 2 | inspect | `prop.r2d2.cfd` | HUD: "Look at both of R2-D2's screens". Callouts on `prop.r2d2.mfd` "Primary MFD — ADB sees this" and `prop.r2d2.cfd` "Secondary CFD — ADB can't". | Both viewed |
| 3 | dialogue | `npc.morgan` | "Station Duo: one terminal, two displays, but only the primary MFD is exposed to ADB. Legacy UI Automator was completely blind to the customer screen." | continue |
| 4 | computer-task | `app.terminal` | HUD: "Prove it". `adb connect 10.42.30.14:5444`; `adb devices` → one entry; `adb -s 10.42.30.14:5444 shell uiautomator dump`; `adb -s 10.42.30.14:5444 pull /sdcard/window_dump.xml`; `grep -c "TOTAL" window_dump.xml` → `0` (the MFD's "Review Order" is there; the CFD's total is not). | Output `0` shown |
| 5 | computer-task | `app.camera` | HUD: "Snapshot R2-D2's CFD from the webcam". Open R2-D2 stream → **Snapshot** → saves `r2d2_cfd.png`. | Snapshot saved |
| 6 | computer-task | `app.gimp` | HUD: "Draw a box around the total and read its coordinates". **File → Open** `r2d2_cfd.png` → Rectangle Select around `TOTAL $10.83` → Tool Options: Position `412, 288`, Size `236 × 44`†. | Selection within ±3 px of target |
| 7 | computer-task | `app.orca` | HUD: "Create a Screen Compare Image and test it". **Screen Compare Images → New**: Name `CFD_TOTAL`, Robot `r2-d2`, X `412`, Y `288`, W `236`, H `44`, Expected Text `TOTAL $10.83` → **Test**. Pi log†: `capture webcam → crop 236x44@412,288 → tesseract → "TOTAL $10.83" → match=true`. | Result `true` |
| 8 | computer-task | `app.orca` | HUD: "Now flip 'CFD layout v2' and test again". The label moves 10 px down and reads `Total $10.83`. **Test** → `match=false`. | Result `false` observed |
| 9 | dialogue | `npc.morgan` | "Ten pixels. Or a capital letter. Or a typo. That's all it takes to break the suite. Pigeon's screen comparisons work the same way: GIMP box, copy the coordinates into the JSON block." | continue |
| 10 | computer-task | `app.intellij` | HUD: "Paste your GIMP coordinates into Pigeon's screenCompare block" (`swipe_sale_print.json`): set `x`, `y`, `w`, `h`, `expected`. | Values match the GIMP selection |
| 11 | dialogue | `npc.morgan` | "Here's the good news. UI Automator 2.3 natively tracks elements on both screens. That's why uia-remote uses 2.3, and why Screen Compare and OCR are being phased out." | continue |
| 12 | computer-task | `app.intellij` | HUD: "Replace the OCR check in TaxTestDuo with a UIA 2.3 assertion". In `TaxTestDuo.java` replace `orca.screenCompare("CFD_TOTAL")` with `cfdTotals.assertTotal("$10.83")` (class `CfdTotalsScreen` uses `By.displayId(cfdDisplayId)`†). In `config.properties` set both IPs to `10.42.30.14`. Run on R2-D2 with layout v2 still on. | Run green; both IPs equal |
| 13 | quiz-checkpoint | `CP-M16.1`: Q331, Q333, Q335, Q337, Q339, Q343 | Checkpoint "Second Screen" | ≥ 80 % |

---

### M17 — AI, Infrastructure & the Roadmap

| Field | Value |
|---|---|
| **Mentor** | Jared (`npc.jared`); cameo David |
| **Prerequisites** | M16 |
| **Est. duration** | 16 min |
| **Setup** | GPU blade `prop.gpu-blade` on `loc.server-shelf` (GPUs 1–2 visible on top, 3–4 underneath). Retired tower `prop.legacy-tower` on the floor. Ollama at `10.42.1.12:11434` with model `llava`†. GitHub PR `uia-remote#212 [AI eval] Generated tests for ReceiptScreen`† open. |
| **Facts covered** | F013, F018, F022, F023, F031, F032, F033, F066, F068, F075, F076, F077, F078, F222, F223 |
| **Unlocks** | M18 · deck `deck.M17` |

**Learning objectives**
1. Describe the shelf-mounted 4× NVIDIA GPU blade (2 exposed, 2 underneath) that replaced a tower and hosts the VMs (Orca, Jenkins) and Ollama.
2. Use Ollama's vision PoC to check a receipt layout and its tip math; explain that it is a proof of concept.
3. Explain Claude's evaluation (repo optimisation, automated test generation) and review an AI-generated PR.
4. Place roadmap items: Orca from on-prem VM to Docker/GCP; NUC → Pi (done); Gen 2 Software PIN Bypass with Core OS.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | walk-to | `loc.server-shelf` | HUD: "Meet Jared at the server shelf" | within 1.5 m |
| 2 | interact | `prop.gpu-blade` | HUD: "Find all four GPUs". Two are visible on top; player crouches (**C**) and looks under the shelf to tag GPUs 3 and 4. | 4/4 tagged |
| 3 | inspect | `prop.legacy-tower` | HUD: "What's that old tower?" Tag†: "RETIRED — replaced by GPU blade". | Crosshair ≥ 1.0 s |
| 4 | dialogue | `npc.jared` | "The blade replaced that tower. Four NVIDIA GPUs, two exposed, two underneath. It hosts our VMs, Orca and Jenkins, and Ollama. Orca is still on an on-prem VM with MySQL behind it. The plan is to containerise it with Docker and move it to Google Cloud." | continue |
| 5 | computer-task | `app.ollama` | HUD: "Ask the vision model to check WALL-E's last receipt". Model `llava`†; attach `walle_receipt_0912.jpg`; prompt (pre-filled, exact): "Check this receipt image. Is the layout complete (merchant header, items, subtotal, tax, tip, total) and is the tip math correct? Answer PASS or FAIL with one reason." Response†: "FAIL — tip of 18% on $42.00 should be $7.56; the receipt shows $7.65." | Response received; player ticks "Tip math error" |
| 6 | dialogue | `npc.david` | "Ollama is a local LLM runner on that blade. Right now it's a proof of concept: a vision LLM watching webcam streams to validate receipt layouts and tip math. Useful, but it's a PoC, not a gate." | continue |
| 7 | dialogue | `npc.david` | "Corporate AI initiatives also evaluated Claude, for repository optimisation and automated test generation. Generated tests still get a human review. Here's one." | continue |
| 8 | computer-task | `app.github` | HUD: "Review PR #212 in uia-remote". Diff adds `ReceiptOptionsScreen.java` with `waitForScreen()` but no `isScreenPresent()`. Player selects **Request changes** and reason "Missing mandatory isScreenPresent()". | Correct reason submitted |
| 9 | walk-to | `loc.whiteboard` | HUD: "Go to the roadmap board" | within 1.5 m |
| 10 | interact | `prop.roadmap-board` | HUD: "Sort the roadmap cards". Columns `TODAY` / `IN PROGRESS` / `PLANNED` / `RETIRED / PHASING OUT`. Cards → answers: "Orca on an on-prem lab VM" → TODAY; "Orca containerised in Docker on GCP" → PLANNED; "Hardware control on Linux Raspberry Pis" → TODAY; "Hardware control on Windows Intel NUCs" → RETIRED; "Ollama vision PoC on webcam streams" → IN PROGRESS; "Gen 2 Software PIN Bypass (with Core OS Team)" → IN PROGRESS; "Station Duo Screen Compare / OCR" → RETIRED / PHASING OUT; "Repos on GitHub (Gort, uia-remote, pigeon)" → TODAY. | 8/8 correct |
| 11 | dialogue | `npc.jared` | "Gen 2 is the big one. We're working with the Core OS Team on a software framework that bypasses the robots for Secure Touch PIN entry. Then the robots only do what can't be faked, like dipping a card." | continue |
| 12 | quiz-checkpoint | `CP-M17.1`: Q351, Q354, Q355, Q358, Q359 | Checkpoint "Infra & AI" | ≥ 80 % |

---

### M18 — Teams, History & the Capstone Shift

| Field | Value |
|---|---|
| **Mentor** | Morgan (`npc.morgan`); cameos Jared, Tate |
| **Prerequisites** | M17 (and all earlier modules) |
| **Est. duration** | 25 min (10 min history + 15 min capstone) |
| **Setup** | History wall frames. For the capstone: BUMBLEBEE's Minix box (MINIX-01) Callus service is down; SETI's arm gets bumped by a coworker; job `Java/uia-remote-regression-mini` has `DEVICE_TYPE=mini_3`. |
| **Facts covered** | F042, F043, F052, F053, F103, F110, F157, F158, F159, F160, F161, F162, F224, F225, F226 |
| **Unlocks** | Certification exams (Section 5) · Arcade "Full Shift" mode · deck `deck.M18` |

**Learning objectives**
1. Tell the team history: Semi Team (POS SDKs, USB Pay Display, Secure Network Pay Display), Sedi QA Team (Lester), Morgan's uia-remote, adoption by IPX and PayCore.
2. Contrast the team's card philosophy (single Visa + Interac) with PayCore's full matrix.
3. Run a mixed incident shift end to end with no hints.

**Lesson script**

| # | Step type | Target | Exact text / action | Success condition |
|---|---|---|---|---|
| 1 | walk-to | `loc.history-wall` | HUD: "Meet Morgan at the team history wall" | within 1.5 m |
| 2 | inspect | `prop.history.semi` | Frame text: "SEMI TEAM: third-party POS SDKs · USB Pay Display · Secure Network Pay Display (link MFDs and CFDs over USB or the local network)". Then `prop.history.sedi`: "SEDI (QA) TEAM: tested Semi's apps with the Lester framework". | Both frames viewed |
| 3 | dialogue | `npc.morgan` | "Once upon a time the Semi Team built third-party POS SDKs and the remote pay display apps, and the Sedi QA Team tested them with Lester. Lester became Pigeon. But nothing could automate native tethered setups, so I built uia-remote." | continue |
| 4 | inspect | `prop.history.ipx` | Frame: "IPX: Integrated Payment Experience. uia-remote tests standalone + tethered across Register, Orders, Authorizations, Sale, Transactions, Setup". | Viewed |
| 5 | inspect | `prop.history.paycore` | Frame: "PAYCORE: adopted uia-remote for LabSim Dining · back-to-back card matrices (Visa, Discover, AmEx) · standalone rigs kept Unavailable". | Viewed |
| 6 | interact | `prop.history.match` | HUD: "Match each team to what it does". Plaques: Semi, Sedi, IPX, PayCore, Core OS → cards: "POS SDKs & pay display apps", "QA with Lester", "Native apps Register…Setup", "LabSim Dining & card matrix", "Gen 2 Software PIN Bypass partner". | 5/5 |
| 7 | dialogue | `npc.morgan` | "And remember the card philosophy: we prove pipelines with one reliable Visa profile, plus Interac for Canada. PayCore runs the whole matrix. Different jobs, different needs. Ready for your capstone? Three things will break in the next fifteen minutes. No hints." | continue |
| 8 | computer-task | `app.orca` → `npc.jared` | **Capstone 1**: BUMBLEBEE goes `Connection Failed`. Notes†: `GET http://10.42.10.13:8000/health → 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}`. Player must read Notes and escalate to Jared with the right diagnosis. Dialogue choices: (a) "BUMBLEBEE is Connection Failed: the Pi answers 502 because the Minix box running Callus at 10.42.20.1 is unreachable." ✔ (b) "BUMBLEBEE's Pi crashed." ✘ (the Pi answered) (c) Set BUMBLEBEE to Available ✘ | Choice (a) within 5 game-min; no status override |
| 9 | interact | `prop.seti.tablet` | **Capstone 2**: a coworker bumps SETI's arm → yellow banner. Player walks to SETI and presses **Park All**. | Banner green within 3 game-min |
| 10 | computer-task | `app.jenkins` | **Capstone 3**: `Java/uia-remote-regression-mini` fails `No enum constant …DeviceType.mini_3`. Player fixes to `MINI_3` and rebuilds green. | Build green |
| 11 | quiz-checkpoint | `CP-M18.1`: Q369, Q370, Q373, Q375, Q377 | Final Academy checkpoint "Teams & History" | ≥ 80 % |
| 12 | dialogue | `npc.morgan` | "That's the Academy. You can walk into the real lab tomorrow and not break anything, which is more than I could say on my first day. Certification exams are unlocked on your desk." | continue → Academy complete |


---

## 3. Quiz bank

### 3.0 Item rules

* **Types:** `multiple-choice` (one correct + three distractors), `true-false`, `ordering` (put all items in
  order), `match` (left items 1..n to right options A..n), `fill-in` (exact string).
* **Display:** the Options column shows the canonical display order. The game reshuffles MC/ORD/MATCH
  options per attempt (seeded by attempt number), so store the correct answer by **value**, not by letter.
* **Fill-in normalisation:** trim, collapse internal whitespace, case-insensitive **unless the explanation says
  "Case-sensitive"** (config values `tethered`, `avocado`, `CPA`, enum `FLEX_3`, class `BaseTest`). Any listed
  alternative is accepted.
* **Scoring:** 1 point per item, all-or-nothing (ORD/MATCH included). Arcade drills may award partial credit;
  see the gameplay doc.
* **Distractors** are deliberately plausible: neighbouring ports (5555, 5037, 8080), sibling teams, sibling
  folders, other statuses, other voltages. Don't "fix" them.
* **CP-** marks items used in that module's lesson checkpoint. Every item is also in the shared pool for
  Arcade drills, the Field Manual "Quiz me" button and certification draws (except † items).
* **Data shape.** Content files follow `src/content/schema.ts` (`QuizQuestion`). Mapping from this bank:
  type `multiple-choice`→`mc`, `true-false`→`tf`, `ordering`→`order` (options stored in the **correct** order; the UI
  shuffles), `match`→`match` (`pairs` in correct pairing; the UI shuffles the right side), `fill-in`→`fill`
  (`accepted` = every listed alternative; `caseInsensitive: true` unless the explanation says "Case-sensitive").
  `factIds` = Facts column. `moduleId` = module heading. `tags` = the module's default topic tag (§8).
  `difficulty`: 1 = single-fact MC/TF; 2 = multi-fact MC/TF or any fill-in; 3 = ordering or match. Example:

```json
{
  "id": "Q001",
  "type": "mc",
  "prompt": "What is mounted on the front of every touch-robot enclosure?",
  "options": ["A status tablet showing that robot's dashboard", "A barcode scanner for card profiles",
              "A second LabSim CFD used for OCR", "An emergency-stop mushroom button wired to the Mean Well"],
  "answer": 0,
  "explanation": "Each touch robot has a front-mounted status tablet (F089).",
  "factIds": ["F089"],
  "tags": ["lab.orientation"],
  "difficulty": 1,
  "moduleId": "M01"
}
```


#### Quiz items — M01 Welcome to the Lab: Orientation & Safety

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q001 *(CP-M01.1)* | F089 | multiple-choice | What is mounted on the front of every touch-robot enclosure? | **A)** An emergency-stop mushroom button wired to the Mean Well · **B)** A status tablet showing that robot's dashboard · **C)** A second LabSim CFD used for OCR · **D)** A barcode scanner for card profiles | **B** — A status tablet showing that robot's dashboard | Each touch robot has a front-mounted status tablet (F089). |
| Q002 *(CP-M01.1)* | F115 | multiple-choice | Roughly how many rigs does Orca's Robot entity track? | **A)** 400+ · **B)** 12 · **C)** 4 · **D)** 40+ | **D** — 40+ | The Robot entity tracks a pool of 40+ rigs and their status flags (F115). Only some are physically in the training room. |
| Q003 *(CP-M01.1)* | F230, F089 | true-false | While a test is active on a robot, any engineer can press the motion buttons on its control dashboard. | True · False | **False** | The global LabSim control dashboard locks out external users while tests are active (F230). |
| Q004 *(CP-M01.1)* | F236 | multiple-choice | What are the two toggle switches on a touch robot's POWER panel labelled? | **A)** AC and DC · **B)** PI and NUC · **C)** MAIN and MOTOR · **D)** ON and OFF | **C** — MAIN and MOTOR | The POWER panel has two green LEDs and toggles labelled MAIN and MOTOR (F236). |
| Q005 *(CP-M01.1)* | F233 | fill-in | WALL-E's tablet header shows "Status: OK" and, beneath it, a board/firmware string. Type it exactly. | — (free text) | `Brainbox v6` | The tablet header shows the robot name, the LabSim logo, "Status: OK" and "Brainbox v6" (F233). Case-insensitive, single space. |
| Q006 | F230 | multiple-choice | You try to press Park All on WALL-E and the tablet shows a lock overlay. What is the most likely reason? | **A)** The MOTOR toggle is off · **B)** Park All can only be issued from Orca · **C)** WALL-E is Offline in Orca · **D)** A test is active, so the global control dashboard locks out external users | **D** — A test is active, so the global control dashboard locks out external users | While tests are active the global LabSim control dashboard locks out external users (F230). |
| Q007 | F072 | multiple-choice | Which machines produce the lab's black plastic modular shelf fixtures? | **A)** An injection-moulding shop in Hong Kong · **B)** Prusa and Bambu Lab 3D printers · **C)** A CNC mill at Jared's bench · **D)** Formlabs resin printers | **B** — Prusa and Bambu Lab 3D printers | All black plastic modular shelf fixtures are printed on Prusa and Bambu Lab 3D printers (F072). Hong Kong is where the motor PCBs were printed. |
| Q008 | F073 | true-false | The shelf fixtures are drafted in CAD using simple geometric shapes. | True · False | **True** | Fixtures are drafted in CAD from simple geometric shapes (F073). |
| Q009 | F244 | multiple-choice | In the reference photo, what are the numbers printed along WALL-E's rack rails? | **A)** Millimetre coordinates for the gantry · **B)** Robot IDs from Orca · **C)** Rack-unit numbers (e.g. 29 to 40) · **D)** Fuse ratings in amps | **C** — Rack-unit numbers (e.g. 29 to 40) | The rails are marked with numbered rack units (F244). |
| Q010 | F245 | multiple-choice | Which letters run vertically down the panel to the right of WALL-E's tablet in the reference photo? | **A)** SETI · **B)** EVE · **C)** TARS · **D)** DATA | **A** — SETI | A panel lettered SETI with USB ports for the Minix box / Raspberry Pi sits to the right (F245). |
| Q011 | F089, F118 | true-false | The robot name across the top of a status tablet is typed into the tablet by hand. | True · False | **False** | The Human Readable Name is pushed from Orca to the front-mounted status tablet (F118, F089). |

#### Quiz items — M02 Know Your terminals: Device Families

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q012 *(CP-M02.1)* | F054 | multiple-choice | What does MFD stand for? | **A)** Merchant Front Display · **B)** Multi-Function Device · **C)** Merchant Facing Device · **D)** Main Function Display | **C** — Merchant Facing Device | MFD = Merchant Facing Device (F054). |
| Q013 *(CP-M02.1)* | F054 | fill-in | CFD stands for "Customer ______ Device". Type the missing word. | — (free text) | `Facing` | CFD = Customer Facing Device (F054). Case-insensitive. |
| Q014 *(CP-M02.1)* | F055, F056, F058, F061 | match | Match each device to its family or role. | **1.** Station 2018 · **2.** Mini 3 · **3.** Flex Pocket · **4.** LabSim Compact ⟷ **A)** Station series · **B)** Mini series · **C)** Canadian-market terminal (Westers) · **D)** Flex series | 1→**A**, 2→**B**, 3→**D**, 4→**C** | Station 2018 is a Station (F055); Mini 3 is a Mini (F056); Flex Pocket is a Flex (F058); the Compact targets Canada on Westers beds (F061). |
| Q015 *(CP-M02.1)* | F059 | multiple-choice | Which three devices share exactly the same testing profile? | **A)** Flex 3, Flex 4 and Flex Pocket · **B)** Mini 2, Mini 3 and Mini 4 · **C)** Flex 1, Flex 2 and Flex 3 · **D)** Station 2, Station Duo and Station Duo 2 | **A** — Flex 3, Flex 4 and Flex Pocket | Flex 3, Flex 4 and Flex Pocket share the exact same testing profile (F059). |
| Q016 | F059 | true-false | The Flex 2 shares the Flex 3 testing profile. | True · False | **False** | Only Flex 3, Flex 4 and Flex Pocket share the profile (F059). |
| Q017 *(CP-M02.1)* | F060 | multiple-choice | What does the Flex Pocket omit compared with the Flex 3 and Flex 4? | **A)** The touch screen · **B)** The EMV chip reader · **C)** The NFC antenna · **D)** The physical printer block | **D** — The physical printer block | The Pocket shares the Flex 3/4 profile but omits the physical printer block (F060). |
| Q018 | F057 | multiple-choice | Which device is used as the hot-swap equivalent for the printerless Station Duo 2? | **A)** Station 2 · **B)** Flex Pocket · **C)** Mini 3 · **D)** Mini 2 | **C** — Mini 3 | The Mini 3 is the hot-swap equivalent for the printerless Duo 2 (F057). |
| Q019 | F057 | true-false | The Station Duo 2 has a built-in printer. | True · False | **False** | The Duo 2 is printerless, which is why a Mini 3 can hot-swap for it (F057). |
| Q020 | F061 | multiple-choice | Which terminal is the target for the Canadian market on the Westers test beds? | **A)** Station 2018 · **B)** Flex Pocket · **C)** Mini 4 · **D)** LabSim Compact | **D** — LabSim Compact | The LabSim Compact targets Canada and is used on Westers test beds (F061). |
| Q021 | F062 | multiple-choice | Which pair are listed as upcoming devices? | **A)** Compact and Flex Pocket · **B)** Station 2018 and Flex 1 · **C)** Station Duo 3 and Mini 4 · **D)** Flex 4 and Mini 3 | **C** — Station Duo 3 and Mini 4 | Duo 3 and Mini 4 are upcoming (F062). |
| Q022 | F055 | multiple-choice | Which of these is NOT a LabSim target device in the reference? | **A)** Station 2018 · **B)** Station Mini · **C)** Station 2 · **D)** Station Duo 2 | **B** — Station Mini | The Station series is Station 2018, Station 2 and Station Duo (Duo 1, Duo 2, upcoming Duo 3) (F055). "Station Mini" does not exist. |
| Q023 | F058 | multiple-choice | How many Flex models are listed, counting the Pocket? | **A)** 4 · **B)** 6 · **C)** 5 · **D)** 3 | **C** — 5 | Flex 1, Flex 2, Flex 3, Flex 4 and Flex Pocket (F058). |
| Q024 | F056 | multiple-choice | Which list is the Mini series? | **A)** Mini 3, Mini 4, Mini Pocket · **B)** Mini 1, Mini 2, Mini 3 · **C)** Mini 2, Mini 3, Mini 4 (upcoming) · **D)** Mini 2, Mini Duo, Mini 3 | **C** — Mini 2, Mini 3, Mini 4 (upcoming) | The Mini series is Mini 2, Mini 3 and the upcoming Mini 4 (F056). |
| Q025 | F237 | fill-in | In the reference photo, MEGATRON's screens carry which environment label? Type it exactly. | — (free text) | `DEV1` | The labels read MEGATRON MFD DEV1 / MEGATRON CFD DEV1; OPTIMUS carries STG (F237). |
| Q026 | F238 | multiple-choice | What are the black USB dongles with green LEDs between the tethered screens? | **A)** Collis probes · **B)** Raspberry Pi cameras · **C)** Inline fuses · **D)** SmartStripe Probe dongles | **D** — SmartStripe Probe dongles | The reference photo shows USB "SmartStripe Probe" dongles between the screens (F238). Collis probes are grey boxes on ribbon cables. |
| Q027 | F239 | multiple-choice | What do the black 3D-printed docks below the tethered screens hold? | **A)** White LabSim connectivity hubs (Ethernet, USB, power) · **B)** Collis probe ribbon spools · **C)** Mean Well transformers · **D)** Spare Raspberry Pis | **A** — White LabSim connectivity hubs (Ethernet, USB, power) | The docks hold LabSim connectivity hubs labelled per device, e.g. MEGATRON MFD (F239). |

#### Quiz items — M03 Power Distribution: Don't Fry the terminals

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q028 *(CP-M03.1)* | F074 | multiple-choice | What does the Mean Well transformer output? | **A)** 12V DC for the NUCs · **B)** 18V AC for the terminals · **C)** 5V DC at 10A for the Pis · **D)** A central 24V DC rail | **D** — A central 24V DC rail | Mean Well converts 120V AC wall power into a central 24V DC rail (F074). |
| Q029 | F074, F227 | fill-in | Wall power entering the Mean Well is ___ V AC. Type the number. | — (free text) | `120` | 120V AC enters the Mean Well (F074, F227). |
| Q030 *(CP-M03.1)* | F085 | multiple-choice | Which line powers the Windows Intel NUCs? | **A)** 18V from an AC strip · **B)** 5V DC, 10A · **C)** 12V DC · **D)** 24V DC straight from the rail | **C** — 12V DC | A step-down regulator provides 12V DC for the NUCs (F085). |
| Q031 *(CP-M03.1)* | F086 | multiple-choice | Which line powers the Raspberry Pis? | **A)** 12V DC, 10A · **B)** 5V DC, 10A · **C)** 5V DC, 2A · **D)** 24V DC | **B** — 5V DC, 10A | Pis run from a 5V DC, 10-Amp step-down line (F086). |
| Q032 | F086 | fill-in | The Raspberry Pi line is 5V DC at ___ amps. Type the number. | — (free text) | `10` | 5V DC, 10A powers the Pis (F086). |
| Q033 *(CP-M03.1)* | F227, F074, F085, F086 | ordering | Put the power chain in order from the wall to the Pis. | **A)** Raspberry Pi · **B)** Inline fuse on the 5V 10A line · **C)** Step-down regulator · **D)** Central 24V DC rail · **E)** Mean Well transformer · **F)** 120V AC wall power | **F** → **E** → **D** → **C** → **B** → **A** | 120V AC → Mean Well → 24V DC rail → step-down regulators (12V / 5V 10A) protected by inline fuses → loads (F227). |
| Q034 | F087 | true-false | Inline fuses protect the DC lines that feed the NUCs and Pis. | True · False | **True** | The 12V and 5V lines are protected by inline fuses (F087, F227). |
| Q035 *(CP-M03.1)* | F228 | multiple-choice | What voltage do LabSim devices draw? | **A)** 5V · **B)** An irregular 18V · **C)** 12V · **D)** 24V | **B** — An irregular 18V | LabSim devices draw an irregular 18V (F228). |
| Q036 | F229 | multiple-choice | Where must LabSim terminals and Collis probes be plugged in? | **A)** The 5V 10A Pi line · **B)** The central 24V DC rail · **C)** Commercial AC power strips · **D)** The 12V NUC line | **C** — Commercial AC power strips | Both bypass the custom DC rails and plug into commercial AC power strips (F229). |
| Q037 | F229 | true-false | Collis probes are powered from the 24V rail so they share a ground with the robot. | True · False | **False** | Collis probes, like LabSim terminals, bypass the DC rails and use commercial AC strips (F229). |
| Q038 | F228, F229 | multiple-choice | Why do LabSim devices bypass the lab's custom DC rails? | **A)** They draw an irregular 18V, so the rails risk frying components · **B)** LabSim devices are powered over USB from the Pi · **C)** corporate policy forbids it · **D)** The rails are reserved for the GPU blade | **A** — They draw an irregular 18V, so the rails risk frying components | LabSim devices draw an irregular 18V, so they and the Collis probes use AC strips to prevent frying components (F228, F229). |
| Q039 | F085, F086, F229, F074 | match | Match each item to its power source. | **1.** Raspberry Pi · **2.** Intel NUC · **3.** LabSim terminal · **4.** Mean Well transformer ⟷ **A)** 12V DC line · **B)** 120V AC wall power · **C)** Commercial AC power strip · **D)** 5V DC 10A line | 1→**D**, 2→**A**, 3→**C**, 4→**B** | Pis 5V 10A (F086), NUCs 12V (F085), terminals on AC strips (F229), Mean Well fed by 120V AC (F074). |

#### Quiz items — M04 Touch Robot Mechanics & the Status Tablet

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q040 *(CP-M04.1)* | F235 | multiple-choice | Which Motion Control button group contains "Park All"? | **A)** Solenoid · **B)** Steppers · **C)** Park · **D)** Phone | **C** — Park | Park holds Park All / XY / X / Y (F235). |
| Q041 *(CP-M04.1)* | F235 | match | Match each tablet button group to its buttons. | **1.** Steppers · **2.** Park · **3.** Solenoid · **4.** Phone ⟷ **A)** Forward / Back / Push Power Button · **B)** Park All / XY / X / Y · **C)** Down / Up / Lower / Raise · **D)** Enable / Disable | 1→**D**, 2→**B**, 3→**C**, 4→**A** | From the WALL-E Motion Control tab (F235). Dip and Tap each have In / Out. |
| Q042 *(CP-M04.1)* | F231 | multiple-choice | You push WALL-E's carriage by hand. What happens? | **A)** The banner turns red and Orca sets Connection Failed · **B)** The solenoid fires automatically · **C)** Nothing, because the steppers are passive · **D)** Its magnetic lock breaks and the top status banner turns yellow | **D** — Its magnetic lock breaks and the top status banner turns yellow | Manually moving an arm breaks its magnetic lock and turns the banner yellow (F231). |
| Q043 *(CP-M04.1)* | F232 | multiple-choice | What does Park All do? | **A)** Sets the robot to Offline in Orca · **B)** Disables the steppers so the gantry can be pushed freely · **C)** Drives the steppers back to the physical limit switches at (0,0), clears errors and turns the banner green · **D)** Parks only the dip arm | **C** — Drives the steppers back to the physical limit switches at (0,0), clears errors and turns the banner green | Park All homes the steppers to the limit switches at (0,0), clearing errors (green banner) (F232). |
| Q044 | F232 | true-false | After a successful Park All, the status banner turns green. | True · False | **True** | Park All clears errors and turns the banner green (F232). |
| Q045 | F232, F082 | fill-in | Park All homes the gantry to which coordinate? Type it as x,y. | — (free text) | `0,0` or `(0,0)` | Park All drives the steppers to the limit switches at (0,0) (F232, F082). |
| Q046 | F082 | multiple-choice | What physically defines a touch robot's (0,0) origin? | **A)** The webcam's calibration image · **B)** The Offsets field in Orca · **C)** The physical limit switches · **D)** The tablet's Park XY button | **C** — The physical limit switches | Physical limit switches are calibrated to (0,0) (F082). |
| Q047 *(CP-M04.1)* | F080 | multiple-choice | What physically taps the screen on a touch robot? | **A)** The plunger of a remote-firing solenoid · **B)** A capacitive stylus on a belt · **C)** An ADB input tap from the Pi · **D)** A servo-driven finger | **A** — The plunger of a remote-firing solenoid | Rigs use remote-firing solenoids whose plunger drops (F080). |
| Q048 | F079 | multiple-choice | What precision do the rig stepper motors move with? | **A)** Whole pixels · **B)** About 5 mm · **C)** About 1 cm · **D)** Sub-millimetre | **D** — Sub-millimetre | The rigs use sub-millimetre stepper motors (F079). |
| Q049 | F083, F084 | multiple-choice | Which description fits the custom motor-controller PCBs? | **A)** 25-pin boards printed in Hong Kong · **B)** 40-pin GPIO HATs bought from the Pi Foundation · **C)** USB-C boards made by Mean Well · **D)** 9-pin boards printed in-house on the Prusa | **A** — 25-pin boards printed in Hong Kong | Custom 25-pin motor-controller PCBs, printed in Hong Kong (F083, F084). |
| Q050 | F083 | fill-in | The custom motor-controller PCBs use a ___-pin connector. Type the number. | — (free text) | `25` | Custom 25-pin motor controller PCBs (F083). |
| Q051 | F090 | multiple-choice | How long are the aluminium rails cut for a touch robot? | **A)** 20 ft · **B)** 5 ft · **C)** 1 m · **D)** 10 ft | **D** — 10 ft | Touch robots use 10 ft cut aluminium rails (F090). |
| Q052 | F091 | multiple-choice | About how much wiring goes into one touch robot? | **A)** 13 ft · **B)** 130 ft · **C)** 30 ft · **D)** 300 ft | **B** — 130 ft | About 130 ft of wiring per touch robot (F091). |
| Q053 | F092 | multiple-choice | About how many manual solder points does one touch robot have? | **A)** About 300 · **B)** About 3,000 · **C)** About 130 · **D)** About 30 | **A** — About 300 | ~300 manual solder points per touch robot (F092). |
| Q054 | F093 | multiple-choice | A touch robot uses 200+ nuts and bolts in which diameters? | **A)** 2.5 mm and 5 mm · **B)** 3 mm and 6 mm · **C)** 8 mm only · **D)** 2 mm and 4 mm | **A** — 2.5 mm and 5 mm | 200+ nuts and bolts in 2.5 mm and 5 mm diameters (F093). |
| Q055 | F234 | multiple-choice | Which of these is NOT a tab on the status tablet? | **A)** Motion Control · **B)** Robot Control · **C)** Robot · **D)** Health Check | **D** — Health Check | The tabs are Robot, Robot Control and Motion Control (F234). |
| Q056 | F240 | multiple-choice | Which motor drives the gantry axes in the reference photo? | **A)** A NEMA-34 stepper on a lead screw · **B)** A brushed DC gear motor · **C)** A NEMA-17 stepper with a GT2 pulley · **D)** A hobby servo | **C** — A NEMA-17 stepper with a GT2 pulley | The gantry uses a NEMA-17 stepper with a GT2 pulley on 2020 extrusion with V-slot wheels (F240). |
| Q057 | F241 | multiple-choice | What carries the emulated card into the Flex's chip slot? | **A)** The blue push-pull solenoid · **B)** A rotating dip arm (sector gear) holding a flat white ribbon card · **C)** A technician, by hand · **D)** The Phone carriage | **B** — A rotating dip arm (sector gear) holding a flat white ribbon card | A black rotating dip arm (sector gear marked 63) carries the white ribbon card (Collis insert) into the slot (F241). |
| Q058 | F243, F080 | ordering | Order the solenoid tap cycle seen in the Flex 3 video. | **A)** Plunger drops and taps again · **B)** Plunger lifts · **C)** Plunger drops and taps · **D)** Gantry moves the head over the target button · **E)** Gantry moves to the next button | **D** → **C** → **B** → **E** → **A** | The video shows move → drop → lift → move → tap again (F243). |
| Q059 | F081 | true-false | Each rig arm is held in place by a magnetic lock. | True · False | **True** | Rigs have magnetic locks; moving an arm by hand breaks the lock (F081, F231). |
| Q060 | F088 | multiple-choice | What on a rig provides the camera stream used for monitoring and OCR? | **A)** A webcam mounted on the rig · **B)** The LabSim device's own camera · **C)** A camera built into the Raspberry Pi board · **D)** The status tablet's front camera | **A** — A webcam mounted on the rig | Rigs carry webcams (F088), served by the Pi as camera streams. |
| Q061 | F242 | true-false | In the side-view photo, the Flex lies flat on the shelf with no fixture. | True · False | **False** | The Flex sits in an angled black 3D-printed cradle, next to the grey Collis probe box (F242). |
| Q062 | F231, F232 | ordering | Order the recovery after someone pushes a robot arm by hand. | **A)** Arm moved by hand · **B)** Steppers drive to the limit switches at (0,0) · **C)** Banner turns green · **D)** Engineer presses Park All · **E)** Magnetic lock breaks · **F)** Status banner turns yellow | **A** → **E** → **F** → **D** → **B** → **C** | Moving the arm breaks the lock (yellow); Park All homes to (0,0) and clears it (green) (F231, F232). |

#### Quiz items — M05 The Robot Pi: Raspberry Pi, Linux & Wine

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q063 *(CP-M05.1)* | F064 | multiple-choice | What is the Robot Controller on each shelf? | **A)** The GPU server blade · **B)** A Raspberry Pi · **C)** An Intel NUC · **D)** A Minix box | **B** — A Raspberry Pi | A Raspberry Pi operates as the Robot Pi / Robot Controller on each shelf (F064). |
| Q064 | F063 | multiple-choice | About how much does one lab Raspberry Pi cost? | **A)** $1,500 · **B)** $5 · **C)** $500 · **D)** $50 | **D** — $50 | The Pis are ~$50 units (F063). |
| Q065 *(CP-M05.1)* | F065 | multiple-choice | Which of these is NOT a duty of the Robot Pi? | **A)** Wine card-programming emulation · **B)** Camera streams · **C)** Hosting Orca's MySQL database · **D)** ADB routing | **C** — Hosting Orca's MySQL database | The Pi handles ADB routing, camera streams, steppers, solenoids and Wine card programming (F065). MySQL lives with Orca on the blade's VM. |
| Q066 | F065 | multiple-choice | Which set of jobs does the Robot Pi handle? | **A)** ADB routing, camera streams, stepper motors, solenoids and Wine card programming · **B)** Status banner colours only · **C)** Jenkins builds, MySQL and Ollama · **D)** Callus, Collis probes and Gort cloning | **A** — ADB routing, camera streams, stepper motors, solenoids and Wine card programming | The Pi's duties per the reference (F065). |
| Q067 *(CP-M05.1)* | F019 | multiple-choice | Which operating system runs on the Pi controllers? | **A)** macOS · **B)** Linux · **C)** Windows 10 IoT · **D)** Android | **B** — Linux | Linux is deployed on the lab's Raspberry Pi controllers (F019). |
| Q068 | F020 | multiple-choice | Why run Linux on the Pis? | **A)** LabSim devices only accept ADB from Linux · **B)** It isolates hardware control loops from the corporate Windows machines · **C)** Jenkins agents only run on Linux · **D)** Linux unlocks the GPUs | **B** — It isolates hardware control loops from the corporate Windows machines | Linux on the Pis isolates the hardware control loops from corporate Windows machines (F020). |
| Q069 *(CP-M05.1)* | F021 | multiple-choice | What is Wine used for on the Pi? | **A)** Hosting Callus · **B)** Running Jenkins agents · **C)** Emulating the Windows-only card-programming software · **D)** Running Tesseract OCR | **C** — Emulating the Windows-only card-programming software | Wine emulates the Windows-only card-programming software layers on the Pi's Linux (F021). Callus runs on Windows/Minix boxes. |
| Q070 | F021 | true-false | Wine is a compatibility layer that lets Windows-only software run on the Pi's Linux. | True · False | **True** | Wine runs on the Pi Linux environments to emulate Windows-only card-programming layers (F021). |
| Q071 *(CP-M05.1)* | F067 | multiple-choice | Why was hardware control moved off the Intel NUCs? | **A)** The NUCs were too expensive · **B)** Windows could not run ADB · **C)** The NUCs drew an irregular 18V · **D)** corporate security-monitoring packages exhausted the NUCs' disk space | **D** — corporate security-monitoring packages exhausted the NUCs' disk space | Aggressive corporate security monitoring packages filled the NUC disks (F067). |
| Q072 | F068 | multiple-choice | Where did hardware control move after the NUC disk problem? | **A)** Raspberry Pis · **B)** Minix boxes · **C)** Google Cloud · **D)** VMs on the GPU blade | **A** — Raspberry Pis | Physical hardware control migrated off the NUCs onto Raspberry Pis (F068). |
| Q073 | F066 | multiple-choice | Which machines are the lab's local Windows execution boxes? | **A)** The status tablets · **B)** Raspberry Pis · **C)** The Jenkins VM · **D)** Intel NUC and Minix boxes | **D** — Intel NUC and Minix boxes | Intel NUC (ASUS NUC) and Minix boxes are the local Windows machines (F066). |
| Q074 | F066, F067, F068 | ordering | Order the history of hardware control in the lab. | **A)** corporate security-monitoring packages fill the NUC disks · **B)** Hardware control migrates to Raspberry Pis running Linux · **C)** Hardware control runs on Windows Intel NUCs | **C** → **A** → **B** | NUCs → corporate disk exhaustion → migration to Pis (F066, F067, F068). |
| Q075 | F066 | true-false | Minix boxes in the lab run Linux, like the Pis. | True · False | **False** | Minix boxes, like the NUCs, are local Windows execution machines (F066). |
| Q076 | F019, F021 | true-false | The Pi controllers run Windows so they can execute the card-programming software natively. | True · False | **False** | The Pis run Linux (F019) and use Wine to emulate the Windows-only card-programming layers (F021). |
| Q077 | F064 | fill-in | Each shelf has one of these acting as its Robot Controller. Type the two-word name. | — (free text) | `Raspberry Pi` | A Raspberry Pi operates as the Robot Pi / Robot Controller on each shelf (F064). Case-insensitive. |

#### Quiz items — M06 Orca Architecture & the Five Robot Statuses

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q078 *(CP-M06.1)* | F098 | multiple-choice | In the lab's architecture, which pairing is correct? | **A)** The Pi is the Controller; Orca is the Executor · **B)** Jenkins is the Controller; Orca is the Executor · **C)** uia-remote is the Controller; Jenkins is the Executor · **D)** Orca is the Controller; Jenkins is the Executor | **D** — Orca is the Controller; Jenkins is the Executor | Orchestrator acts as the Controller while Jenkins acts as the Executor (F098). |
| Q079 *(CP-M06.1)* | F036 | fill-in | "Orca" is short for which system? Type its full name. | — (free text) | `Orchestrator` | Orca is the Orchestrator (F036). Case-insensitive. |
| Q080 | F037, F002 | multiple-choice | How is Orca built? | **A)** A Node.js app in Docker · **B)** Go microservices on GCP · **C)** An on-premise Spring Boot monolith · **D)** A Jenkins plugin | **C** — An on-premise Spring Boot monolith | Orca is an on-premise Spring Boot monolith (F037, F002). |
| Q081 | F002 | multiple-choice | Which framework provides Orca's backend and REST API endpoints? | **A)** Express · **B)** Django · **C)** Spring Boot · **D)** Ruby on Rails | **C** — Spring Boot | Spring Boot is the backend framework for the Orchestrator monolith and its REST endpoints (F002). |
| Q082 | F003, F004 | multiple-choice | What did JHipster generate for Orca? | **A)** Only the MySQL database · **B)** The frontend UI, the Spring Boot REST endpoints and the MySQL schemas · **C)** The Jenkins pipelines · **D)** The uia-remote page objects | **B** — The frontend UI, the Spring Boot REST endpoints and the MySQL schemas | JHipster auto-generated the frontend, REST endpoints and MySQL schemas (F004). |
| Q083 | F003 | true-false | JHipster scaffolds an application through an interactive setup questionnaire. | True · False | **True** | JHipster scaffolded Orca via an interactive setup questionnaire (F003). |
| Q084 *(CP-M06.1)* | F013 | multiple-choice | Which database engine backs Orca? | **A)** MySQL · **B)** PostgreSQL · **C)** SQLite · **D)** MongoDB | **A** — MySQL | MySQL backs Orchestrator (F013). |
| Q085 | F023 | multiple-choice | Where does Orca run today? | **A)** On a Raspberry Pi · **B)** On Google Cloud in Docker · **C)** On a local on-premise lab VM · **D)** On an engineer's laptop | **C** — On a local on-premise lab VM | Orca runs on an on-premise lab VM; Docker/GCP is the plan (F023). |
| Q086 *(CP-M06.1)* | F099 | multiple-choice | How often does Orca ping the Robot Controller on every Pi? | **A)** Every 30 seconds · **B)** Only when a job starts · **C)** Every hour · **D)** Every 5 minutes | **D** — Every 5 minutes | A synchronized background thread pings every Pi every 5 minutes (F099). |
| Q087 | F099 | fill-in | Orca's health-check interval, in minutes. Type the number. | — (free text) | `5` | Every 5 minutes (F099). |
| Q088 *(CP-M06.1)* | F100 | multiple-choice | Which of these is NOT one of the 5 robot statuses? | **A)** Busy · **B)** Reserved · **C)** Connection Failed · **D)** Offline | **A** — Busy | The five are Available, Unavailable, Offline, Connection Failed and Reserved (F100). |
| Q089 | F100 | fill-in | How many robot operational statuses does Orca have? Type the number. | — (free text) | `5` | Exactly 5 (F100). |
| Q090 | F101 | multiple-choice | Which status lets general pipelines check out the robot? | **A)** Available · **B)** Reserved · **C)** Offline · **D)** Unavailable | **A** — Available | Available means online, healthy and open to general checkouts (F101). |
| Q091 *(CP-M06.1)* | F102 | multiple-choice | How can a pipeline use a robot that is Unavailable? | **A)** It can't; Unavailable robots are never used · **B)** Set DEVICE_TYPE to match the robot · **C)** Ask Jared to Park All · **D)** Pass the robot's exact unique name in the job parameters | **D** — Pass the robot's exact unique name in the job parameters | General pipelines are blocked unless the exact unique name is passed (F102). |
| Q092 | F103 | multiple-choice | Why do PayCore standalone rigs sit in Unavailable? | **A)** They have no Raspberry Pi · **B)** They are broken · **C)** They only accept Canadian cards · **D)** So general tests do not overwrite their merchant profiles | **D** — So general tests do not overwrite their merchant profiles | Unavailable isolates specialised rigs like PayCore standalone setups (F103). |
| Q093 | F104 | true-false | After an explicitly named job finishes on an Unavailable robot, the engineer must set it back to Unavailable by hand. | True · False | **False** | Orca automatically resets the flag back to Unavailable (F104). |
| Q094 | F105 | multiple-choice | Jared is physically building BAYMAX and assembling its data profiles. Which status should it have? | **A)** Reserved · **B)** Offline · **C)** Unavailable · **D)** Connection Failed | **B** — Offline | Offline is the manual placeholder while a rig is being built or profiled (F105). |
| Q095 | F106 | true-false | Orca still pings Offline robots every 5 minutes. | True · False | **False** | Orca bypasses 5-minute health checks for Offline units (F106). |
| Q096 | F107 | multiple-choice | What sets a robot to Connection Failed? | **A)** The status banner turning yellow · **B)** Any failed Jenkins build · **C)** The 5-minute REST ping to its Pi drops or returns a non-200 response · **D)** An engineer selects it manually | **C** — The 5-minute REST ping to its Pi drops or returns a non-200 response | Connection Failed is triggered automatically by a dropped or non-200 health ping (F107). |
| Q097 | F107 | true-false | A health ping that returns HTTP 502 puts the robot into Connection Failed even though the Pi answered. | True · False | **True** | Any non-200 response triggers Connection Failed, not just a dropped connection (F107). |
| Q098 | F108 | true-false | A Connection Failed robot can still be checked out if its LabSim device is powered on. | True · False | **False** | Orca blocks Connection Failed rigs from checkouts (F108). |
| Q099 | F109 | multiple-choice | Where do you read the exact endpoint and error text for a Connection Failed robot? | **A)** The status tablet · **B)** A GitHub issue · **C)** The Notes section in Orca's UI · **D)** The Jenkins console | **C** — The Notes section in Orca's UI | Orca opens a Notes section logging the endpoint attempted and the error (F109). |
| Q100 | F110 | multiple-choice | Which is a typical cause of Connection Failed? | **A)** A Minix box running Callus services went offline · **B)** theme is not set to avocado · **C)** Someone pushed a robot arm by hand · **D)** A Pigeon JSON file is missing a comma | **A** — A Minix box running Callus services went offline | Typical causes are a crashed Pi board or a Minix box running Callus going offline (F110). |
| Q101 *(CP-M06.1)* | F111 | multiple-choice | Who receives Connection Failed escalations? | **A)** Jared · **B)** Tate · **C)** David · **D)** Morgan | **A** — Jared | Connection Failed is escalated to Jared for hardware intervention (F111). |
| Q102 | F112 | multiple-choice | You are running tests locally from your workstation on EVE. Which status should EVE have? | **A)** Available · **B)** Reserved · **C)** Unavailable · **D)** Offline | **B** — Reserved | Reserved is set manually by an engineer running tests locally (F112). |
| Q103 | F113 | multiple-choice | What does Reserved block? | **A)** Nothing; it is just a label · **B)** Jenkins pipelines and health-check overrides · **C)** Only health checks · **D)** Only the tablet buttons | **B** — Jenkins pipelines and health-check overrides | Reserved blocks both Jenkins pipelines and health-check overrides (F113). |
| Q104 | F101, F102, F105, F107, F112 | match | Match each situation to the status it calls for. | **1.** Healthy rig, open to any pipeline · **2.** PayCore standalone rig, named jobs only · **3.** Rig still being physically built · **4.** Health ping returned non-200 · **5.** You are testing locally from your desk ⟷ **A)** Reserved · **B)** Available · **C)** Offline · **D)** Unavailable · **E)** Connection Failed | 1→**B**, 2→**D**, 3→**C**, 4→**E**, 5→**A** | F101, F102/F103, F105, F107, F112. |
| Q105 | F095 | multiple-choice | Which component checks out a robot from Orca for a CI run? | **A)** The Raspberry Pi · **B)** Jenkins · **C)** The status tablet · **D)** Callus | **B** — Jenkins | Jenkins checks out a robot from Orca (F095). |
| Q106 | F096 | multiple-choice | How does a running test ask for a screen tap or a card action? | **A)** A Jenkins environment variable · **B)** REST calls to Orca (xy_touch, card swipe / dip / tap) · **C)** SSH straight to the Pi · **D)** Pressing buttons on the tablet | **B** — REST calls to Orca (xy_touch, card swipe / dip / tap) | Test runners call Orca over REST for xy_touch and card actions (F096). |
| Q107 | F097 | multiple-choice | Which chain is correct for card emulation? | **A)** Jenkins → Collis probe → Callus → Orca · **B)** Pi → Wine → Collis probe → GPU blade · **C)** Windows/Minix box running Callus → ribbon cable → Collis probe → LabSim card reader · **D)** Orca → SmartStripe Probe → Pi → card reader | **C** — Windows/Minix box running Callus → ribbon cable → Collis probe → LabSim card reader | The Callus box drives the Collis probe over a ribbon cable into the device's reader (F097). |
| Q108 | F116 | multiple-choice | Who built the custom robot-list filtering UI in Orca? | **A)** Tate · **B)** David · **C)** Jared · **D)** Morgan | **A** — Tate | Tate created the Robot list's custom UI filtering (F116). |
| Q109 | F038 | multiple-choice | Orca sits between which two things? | **A)** GitHub and IntelliJ IDEA · **B)** Jenkins pipelines and the physical lab robots · **C)** Ollama and Tesseract · **D)** Wall power and the Pis | **B** — Jenkins pipelines and the physical lab robots | Orca is the central Controller between Jenkins pipelines and physical robots (F038). |
| Q110 | F094 | multiple-choice | What does Jenkins inject into the test runner (uia-remote or Pigeon)? | **A)** Runtime environment variables · **B)** Card definition files · **C)** MySQL schemas · **D)** Wine | **A** — Runtime environment variables | Jenkins triggers the pipeline and injects env vars into the test runner (F094). |
| Q111 | F001 | true-false | Orca's backend is written in Go. | True · False | **False** | Java is the primary language for Orca and uia-remote; Go is used for the Terminal SDK (F001, F008). |
| Q112 | F094, F095, F096, F097, F098 | ordering | Order a CI card-dip test from start to card read. | **A)** Jenkins checks out a robot from Orca · **B)** The test runner calls Orca's REST card-dip endpoint · **C)** Jenkins triggers the pipeline and injects env vars · **D)** Callus on the Windows/Minix box loads the virtual card · **E)** The Collis probe presents the card to the LabSim reader | **C** → **A** → **B** → **D** → **E** | Jenkins (Executor) → Orca (Controller) → Callus → Collis → reader (F094–F098). |
| Q113 | F036, F038 | multiple-choice | Which system is the Controller sitting between Jenkins pipelines and the physical robots? | **A)** Orca (Orchestrator) · **B)** Callus · **C)** Laz Automation · **D)** Ubi Platform | **A** — Orca (Orchestrator) | Orca, the Orchestrator, is the central Controller (F036, F038). |
| Q114 | F037 | true-false | Orca is a set of cloud microservices running on GCP. | True · False | **False** | Orca is an on-premise Spring Boot monolith (F037); GCP is only a planned target (F022). |
| Q115 | F104, F102 | multiple-choice | You ran a job with ROBOT_NAME=rosie on ROSIE (Unavailable). The job just finished. What is ROSIE's status now? | **A)** Available · **B)** Unavailable: Orca reset it automatically · **C)** Reserved · **D)** Offline | **B** — Unavailable: Orca reset it automatically | Once an explicitly named job finishes, Orca resets the flag back to Unavailable (F104). |
| Q116 | F106, F105 | multiple-choice | For which status does Orca skip the 5-minute health check? | **A)** Offline · **B)** Available · **C)** Unavailable · **D)** Reserved | **A** — Offline | Orca bypasses health checks for Offline units (F106). |
| Q117 | F107, F108, F109, F111 | ordering | Order what happens when a Pi stops answering. | **A)** Orca's Notes section logs the endpoint attempted and the error text · **B)** The engineer escalates to Jared for hardware intervention · **C)** Orca sets Connection Failed and blocks checkouts · **D)** The 5-minute health ping drops or returns non-200 | **D** → **C** → **A** → **B** | F107, F108, F109, F111. |
| Q118 | F113, F112 | true-false | Reserved only stops health checks; Jenkins can still check the robot out. | True · False | **False** | Reserved blocks both Jenkins pipelines and health-check overrides (F113). |

#### Quiz items — M07 Orca Entities: Robot, Device, Device Type, URLs, Tethering & Offsets

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q119 *(CP-M07.1)* | F114 | multiple-choice | How many core database schemas (JHipster entities) does Orca have? | **A)** 7 · **B)** 4 · **C)** 12 · **D)** 5 | **A** — 7 | Orca has 7 core database schemas (F114). |
| Q120 | F114 | multiple-choice | Which of these is NOT one of Orca's core schemas? | **A)** Merchant Config entity · **B)** Screen Compare Image entity · **C)** Jenkins Job entity · **D)** Card Profile entity | **C** — Jenkins Job entity | The 7 are Robot, Robot Creation & Configuration, Robot Capabilities, Merchant Config, Screens & Screen Locations, Card Profile and Screen Compare Image (F114). |
| Q121 *(CP-M07.1)* | F117 | multiple-choice | What is a robot's "Name" field in Orca? | **A)** The Pi's IP address · **B)** The system identifier · **C)** The display string shown on the tablet · **D)** The LabSim device's serial number | **B** — The system identifier | Name is the system identifier; Human Readable Name is the display string (F117). |
| Q122 *(CP-M07.1)* | F118 | multiple-choice | Where does a robot's Human Readable Name appear? | **A)** In the GitHub repo name · **B)** On the physical status tablet on the front of the enclosure · **C)** As the Pi's hostname · **D)** Only in the Jenkins console | **B** — On the physical status tablet on the front of the enclosure | The Human Readable Name is pushed to the front-mounted status tablet (F118). |
| Q123 *(CP-M07.1)* | F119, F120 | multiple-choice | Jared swaps JOHNNY-5's Flex 1 for a Flex 2. What is the right Orca change? | **A)** Create a new Device for the Flex 2 and relink Robot Device, keeping the old Device for rollback · **B)** Change JOHNNY-5's Offsets · **C)** Edit the existing Device and change its type to FLEX_2 · **D)** Delete JOHNNY-5 and recreate it | **A** — Create a new Device for the Flex 2 and relink Robot Device, keeping the old Device for rollback | Robot Device links to a separate Device entity so upgrades leave legacy configs intact for rollback (F119, F120). |
| Q124 | F120 | true-false | Because Robot and Device are decoupled, a hardware upgrade leaves legacy configurations intact for quick rollbacks. | True · False | **True** | That is exactly why they are decoupled (F120). |
| Q125 | F119 | multiple-choice | What does the Robot Device field point to? | **A)** A camera stream · **B)** A separate Device entity · **C)** A Jenkins job · **D)** A Gort card file | **B** — A separate Device entity | Robot Device links to a separate Device entity (F119). |
| Q126 | F121 | multiple-choice | What does the Device Type enum store? | **A)** Card Track Data · **B)** The Pi's IP address · **C)** Device dimensions, layout metrics and internal string definitions · **D)** Merchant credentials | **C** — Device dimensions, layout metrics and internal string definitions | Device Type is an enum of dimensions, layout metrics and internal strings (F121). |
| Q127 *(CP-M07.1)* | F122 | multiple-choice | Why must Jenkins pipeline env vars like DEVICE_TYPE be in ALL CAPS? | **A)** They must match Orca's Device Type enum string definitions · **B)** Jenkins rejects lower-case parameters · **C)** It is only a style convention · **D)** Linux environment variables are case-insensitive | **A** — They must match Orca's Device Type enum string definitions | The Device Type enum dictates that env vars must be all-caps (F122). |
| Q128† | F122 | fill-in | Type the DEVICE_TYPE value Jenkins needs for a Flex 3 in this sim (enum spelling). | — (free text) | `FLEX_3` | All caps, matching the Device Type enum (F122). Case-sensitive. (Enum spelling FLEX_3 is the sim's illustrative enum.) |
| Q129 | F123 | multiple-choice | The Robot ADB Service URL routes to which component? | **A)** The Jenkins VM · **B)** Orca's MySQL · **C)** The Pi controller · **D)** The LabSim device directly on port 5555 | **C** — The Pi controller | It is the Robot ADB Service URL routing to the Pi controller (F123). |
| Q130 | F124 | multiple-choice | A robot's Camera Stream URL is… | **A)** Always shared across all 40+ rigs · **B)** Only configured for CFDs · **C)** Stored in Gort · **D)** Either dedicated per Pi or shared across 4 rigs | **D** — Either dedicated per Pi or shared across 4 rigs | Camera streams are dedicated per Pi or shared across 4 rigs (F124). |
| Q131 | F125 | multiple-choice | Besides the ADB Service and Camera Stream URLs, which hardware-specific URLs are mapped per robot? | **A)** Health, Park and Reset · **B)** Dip, Tap and Swipe · **C)** PIN, Sign and Tip · **D)** Print, Scan and Email | **B** — Dip, Tap and Swipe | URL Mappings store hardware-specific Dip, Tap and Swipe URLs (F125). |
| Q132 *(CP-M07.1)* | F128 | multiple-choice | In Orca, what makes a pipeline treat a rig as tethered? | **A)** The camera URL is shared · **B)** The Human Readable Name contains "MFD" · **C)** The device type is STATION_DUO · **D)** The MFD field is populated | **D** — The MFD field is populated | If MFD is populated, the pipeline treats the rig as tethered (F128). |
| Q133 | F126, F127 | multiple-choice | Which is an example of a nested/tethered setup modelled in Orca? | **A)** A Flex 3 with a Collis probe · **B)** Two Flex Pockets sharing a camera · **C)** A Station 2 tethered to a Mini 2 · **D)** A Pi with a webcam | **C** — A Station 2 tethered to a Mini 2 | Tethered configs populate MFD/CFD relations, e.g. Station 2 + Mini 2, or nested Mini 3s (F126, F127). |
| Q134 | F126 | true-false | USB Tethered Device Configuration populates MFD and CFD relations for nested setups. | True · False | **True** | That is the purpose of the USB Tethered Device Configuration (F126). |
| Q135 | F129 | multiple-choice | What were Offsets originally for? | **A)** Time-zone corrections for the health check · **B)** Legacy millimetre adjustments compensating for imprecise physical limit switches · **C)** ADB port offsets from 5555 · **D)** Pixel offsets for OCR boxes | **B** — Legacy millimetre adjustments compensating for imprecise physical limit switches | Offsets compensated for imprecise limit switches (F129). |
| Q136 | F130 | multiple-choice | Why are Offsets now mostly deprecated? | **A)** Tate removed the column · **B)** Orca moved to GCP · **C)** UI Automator 2.3 replaced them · **D)** Jared calibrated the lab hardware to a true (0,0) origin | **D** — Jared calibrated the lab hardware to a true (0,0) origin | Jared's true (0,0) calibration made Offsets mostly deprecated (F130). |
| Q137† | F130, F129 | true-false | On a correctly calibrated rig, a non-zero legacy Offset is a likely cause of taps landing off-target. | True · False | **True** | With hardware calibrated to true (0,0), leftover offsets shift taps; the field is mostly deprecated (F129, F130). (Lesson scenario illustrative.) |
| Q138 | F115 | multiple-choice | What does the Robot entity track? | **A)** Only robots that are Available · **B)** Jenkins build history · **C)** The pool of 40+ rigs and their operational status flags · **D)** Card profiles per robot | **C** — The pool of 40+ rigs and their operational status flags | Robot entity: 40+ rigs and status flags (F115). |
| Q139 | F014 | multiple-choice | Which of these is NOT stored in Orca's MySQL database? | **A)** Screen-coordinate tables · **B)** Merchant profiles · **C)** Jenkins build console logs · **D)** Hardware states | **C** — Jenkins build console logs | MySQL stores hardware states, merchant profiles and screen coordinates (F014). Build logs stay in Jenkins. |
| Q140 | F117, F118 | match | Match each robot naming field to its purpose. | **1.** Name · **2.** Human Readable Name ⟷ **A)** Display string pushed to the status tablet · **B)** System identifier used by Orca and pipelines | 1→**B**, 2→**A** | F117, F118. |
| Q141 | F121 | true-false | Device Type is a free-text field, so any spelling works. | True · False | **False** | Device Type is an enum of dimensions, layout metrics and internal strings (F121), which is why env vars must be ALL CAPS (F122). |
| Q142 | F123, F124, F125 | match | Match each URL mapping to what it does. | **1.** Robot ADB Service URL · **2.** Camera Stream URL · **3.** Dip / Tap / Swipe URLs ⟷ **A)** Routes ADB to the Pi controller · **B)** Hardware-specific card actions · **C)** Webcam feed, dedicated per Pi or shared across 4 rigs | 1→**A**, 2→**C**, 3→**B** | F123, F124, F125. |
| Q143 | F128, F126 | true-false | If OPTIMUS's MFD field is empty, pipelines will not treat OPTIMUS as tethered. | True · False | **True** | The pipeline treats the rig as tethered only if MFD is populated (F128). |

#### Quiz items — M08 Capabilities, Merchant Config, Laz & Ubi

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q144 *(CP-M08.1)* | F131 | multiple-choice | Which entity controls how Orca matches pipeline requests to physical hardware? | **A)** Card Profile · **B)** Screens · **C)** Merchant Config · **D)** Robot Capabilities | **D** — Robot Capabilities | The Robot Capabilities entity does the matching (F131). |
| Q145 *(CP-M08.1)* | F132 | multiple-choice | In dynamic JSON lookups, where are the capabilities defined? | **A)** On the status tablet · **B)** Hardcoded in the pipeline script · **C)** In config.properties · **D)** As JSON metadata inside individual test definitions, parsed at runtime | **D** — As JSON metadata inside individual test definitions, parsed at runtime | Dynamic lookups read JSON metadata from each test definition at runtime (F132). |
| Q146 *(CP-M08.1)* | F134 | multiple-choice | Which lookup style do traditional UI Automator suites use? | **A)** Ubi Platform routing · **B)** Dynamic JSON metadata in each test · **C)** Non-dynamic: capabilities hardcoded inside the pipeline script · **D)** Laz OOBE profiles | **C** — Non-dynamic: capabilities hardcoded inside the pipeline script | Traditional UIA suites hardcode capabilities in the pipeline script (F134). |
| Q147 | F132, F134 | match | Match each lookup style to its user and location. | **1.** Dynamic JSON lookup · **2.** Non-dynamic lookup ⟷ **A)** Traditional UI Automator suites; hardcoded in the pipeline script · **B)** SDK frameworks; JSON metadata in the test definition | 1→**B**, 2→**A** | F132 vs F134. |
| Q148 | F133 | multiple-choice | Who oversees the SDK frameworks that use dynamic JSON capability lookups? | **A)** Jared · **B)** Tate · **C)** Morgan · **D)** David | **D** — David | David oversees them (F133). |
| Q149 | F135 | true-false | Contact Canada automation scripts on the Westers test beds use only dynamic lookups. | True · False | **False** | Both lookup methods are used interchangeably for Contact Canada scripts (F135). |
| Q150 | F011 | multiple-choice | What data format do Orca's runtime capability lookups use? | **A)** JSON · **B)** CSV · **C)** YAML · **D)** XML | **A** — JSON | JSON is used for runtime capability lookups (F011). |
| Q151 *(CP-M08.1)* | F136, F137 | multiple-choice | The Merchant Config table doesn't show App Secret. Why, and what do you do? | **A)** It is not stored in Orca at all · **B)** The table has display limits; click Edit on the row to see every field · **C)** It is hidden for security; ask Tate to query MySQL · **D)** Export the table to CSV | **B** — The table has display limits; click Edit on the row to see every field | Due to UI table display limits you must click Edit on a row (F137). |
| Q152 | F136 | multiple-choice | What does the Merchant Config entity store? | **A)** Gort card files · **B)** Robot health history · **C)** Merchant account parameters · **D)** Button coordinates | **C** — Merchant account parameters | Merchant Config stores merchant account parameters (F136). |
| Q153 *(CP-M08.1)* | F138 | multiple-choice | Which three fields did Tate add to Merchant Config? | **A)** Client ID, Token, Region · **B)** Merchant ID, PIN, Serial · **C)** App ID, App Secret, API Key · **D)** Username, Password, MFA Code | **C** — App ID, App Secret, API Key | Tate extended Merchant Config with App ID, App Secret and API Key (F138). |
| Q154 | F139 | multiple-choice | Why were App ID, App Secret and API Key added? | **A)** So the tablet can display them · **B)** So Tesseract can read them · **C)** So pipelines can export them as runtime environment variables for the Go SDK · **D)** So Laz can type them into the setup wizard | **C** — So pipelines can export them as runtime environment variables for the Go SDK | Pipelines export them as env vars for the Go SDK (F139). |
| Q155 | F138, F139 | true-false | Tate added App ID, App Secret and API Key to Merchant Config so the Go SDK pipelines could receive them as environment variables. | True · False | **True** | F138, F139. |
| Q156 | F008, F009 | multiple-choice | How is the Terminal SDK supported and tested? | **A)** Only through uia-remote page objects · **B)** Only on GCP · **C)** Through Laz OOBE runs · **D)** Custom extensions in Orca; tested through Pigeon and mobile runners | **D** — Custom extensions in Orca; tested through Pigeon and mobile runners | Go SDK support via custom Orca extensions, tested through Pigeon and mobile runners (F008, F009). |
| Q157 | F008 | multiple-choice | Which language is the Terminal SDK written in? | **A)** Java · **B)** Python · **C)** Kotlin · **D)** Go (Golang) | **D** — Go (Golang) | Go is used for the Terminal SDK (F008). |
| Q158 *(CP-M08.1)* | F046 | multiple-choice | What is Laz Automation? | **A)** A card emulator · **B)** A lazy-loading Java library · **C)** A Jenkins plugin for skipping builds · **D)** An automated provisioning framework running a zero-touch OOBE routine | **D** — An automated provisioning framework running a zero-touch OOBE routine | Laz runs a zero-touch Out-of-Box Experience routine (F046). |
| Q159 | F046 | fill-in | OOBE stands for Out-of-___ Experience. Type the missing word. | — (free text) | `Box` | Out-of-Box Experience (F046). Case-insensitive. |
| Q160 | F047 | multiple-choice | Which is NOT part of Laz's OOBE routine? | **A)** Re-flashing the Pi's Linux image · **B)** Wiping local caches · **C)** De-provisioning the hardware · **D)** Stepping through the setup wizard | **A** — Re-flashing the Pi's Linux image | Laz de-provisions, wipes caches, steps the wizard and swaps merchants (F047). |
| Q161 | F047 | multiple-choice | When can Laz swap merchants? | **A)** Only overnight · **B)** Never; merchants are fixed per robot · **C)** Only by hand on the tablet · **D)** Mid-suite | **D** — Mid-suite | Laz swaps merchants mid-suite (F047). |
| Q162 | F047 | ordering | Order Laz's OOBE merchant swap. | **A)** Device comes up on the new merchant · **B)** Step through the setup wizard · **C)** Wipe local caches · **D)** De-provision the hardware | **D** → **C** → **B** → **A** | F047 (order of the reference's list). |
| Q163 | F051 | multiple-choice | Which internal platform routes jobs that dynamically switch merchant configurations? | **A)** Ubi Platform · **B)** Callus · **C)** Gort · **D)** LSTR | **A** — Ubi Platform | Ubi Platform is used when jobs dynamically switch merchant configs (F051). |
| Q164 | F140 | true-false | Merchant Config works alongside Laz Automation for dynamic OOBE merchant switching. | True · False | **True** | F140. |
| Q165 | F131 | true-false | The Robot Capabilities entity decides which physical robot a pipeline request is matched to. | True · False | **True** | F131. |
| Q166 | F137 | fill-in | Merchant Config's table hides some columns. Which button do you click on a row to see every field? Type it. | — (free text) | `Edit` | Click Edit on the row (F137). Case-insensitive. |

#### Quiz items — M09 Screens, Screen Locations & xy_touch (ADB Bots vs Physical Bots)

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q167 *(CP-M09.1)* | F141 | multiple-choice | What does the Screens entity map? | **A)** Exact button coordinates in millimetres · **B)** Discrete UI layouts within a transaction flow, relative to the target device architecture · **C)** Webcam images of each screen · **D)** Card files for each screen | **B** — Discrete UI layouts within a transaction flow, relative to the target device architecture | Screens map layouts in a flow per device architecture, e.g. a cash-discount tender prompt (F141). |
| Q168 *(CP-M09.1)* | F142 | multiple-choice | Screen Locations store button positions in which unit? | **A)** Density-independent pixels (dp) · **B)** Millimetres · **C)** Pixels · **D)** Inches | **B** — Millimetres | Relative X and Y in millimetres (F142). |
| Q169 | F141 | true-false | A cash-discount tender selection prompt is an example of a Screen in Orca. | True · False | **True** | The reference uses exactly that example (F141). |
| Q170 *(CP-M09.1)* | F143 | multiple-choice | What does a script pass to Orca's xy_touch endpoint? | **A)** Raw pixel X and Y · **B)** A card profile name · **C)** A screen name and a button string · **D)** The robot's serial number and a PIN | **C** — A screen name and a button string | Scripts call xy_touch with a screen name and a button string (F143). |
| Q171 | F144 | multiple-choice | After the xy_touch lookup, what does the Pi fire? | **A)** Always an ADB touch · **B)** Either an electronic ADB touch or a physical mechanical probe tap · **C)** Always a physical tap · **D)** A GIMP selection | **B** — Either an electronic ADB touch or a physical mechanical probe tap | Orca instructs the Pi to fire an ADB touch or a physical probe tap (F144). |
| Q172 *(CP-M09.1)* | F143, F144, F096 | ordering | Order an xy_touch from script to screen. | **A)** The Pi fires an ADB touch or a physical probe tap · **B)** Orca instructs the Raspberry Pi · **C)** Orca looks up the button's millimetre coordinates · **D)** Test runner calls Orca's xy_touch with a screen name and button | **D** → **C** → **B** → **A** | F096, F143, F144. |
| Q173 | F217 | multiple-choice | Can an ADB bot enter a PIN? | **A)** Yes, if Offsets are set · **B)** Only on the Compact · **C)** No; ADB bots are purely programmatic and cannot physically touch the screen or enter PINs · **D)** Yes, with adb shell input text | **C** — No; ADB bots are purely programmatic and cannot physically touch the screen or enter PINs | F217. |
| Q174 *(CP-M09.1)* | F218 | multiple-choice | ADB bots are restricted to which merchant configurations? | **A)** PayCore standalone merchants · **B)** Station Duo merchants only · **C)** Configurations that bypass PIN security · **D)** Canadian merchants only | **C** — Configurations that bypass PIN security | ADB bots only run merchant configs that bypass PIN security (F218). |
| Q175 | F220 | multiple-choice | Why does a Canadian payment workflow need a physical bot? | **A)** The Compact has no ADB at all · **B)** Westers beds have no Pis · **C)** Interac cards cannot be emulated · **D)** Canadian flows mandate physical PIN entry | **D** — Canadian flows mandate physical PIN entry | Physical bots are required for Canadian flows, which mandate physical PIN entry (F220). |
| Q176 | F221 | multiple-choice | Besides Canadian PIN flows, what else requires a physical/interactive bot? | **A)** Every MFD · **B)** Any device with a printer · **C)** Every Flex · **D)** ADB-blind displays | **D** — ADB-blind displays | Physical bots are required for ADB-blind displays (F221). |
| Q177 | F219 | multiple-choice | What do physical/interactive bots have that ADB bots lack? | **A)** An Orca record · **B)** A Raspberry Pi · **C)** Mechanical touch probes · **D)** An ADB connection | **C** — Mechanical touch probes | Physical bots are equipped with mechanical touch probes (F219). |
| Q178 | F217, F219, F220 | true-false | TARS (an ADB bot) is a good choice for a Canadian Interac PIN test. | True · False | **False** | ADB bots cannot enter PINs (F217) and Canadian flows require physical PIN entry on a physical bot (F219, F220). |
| Q179 | F213 | multiple-choice | What did adding the "scan for receipt" QR code do to the receipt screen? | **A)** Shifted the buttons down by a few millimetres · **B)** Moved the buttons up by 10 pixels · **C)** Renamed every button · **D)** Removed the Print button | **A** — Shifted the buttons down by a few millimetres | The QR feature shifted buttons down a few mm (F213). |
| Q180 *(CP-M09.1)* | F214 | multiple-choice | How long were the lab's coordinates broken after the QR change? | **A)** 2 weeks · **B)** 4 hours · **C)** 48 hours · **D)** 5 minutes | **C** — 48 hours | Ruler-measured coordinates were broken for 48 hours (F214). |
| Q181 | F214 | multiple-choice | Who merged the coordinate PR that ended the QR breakage? | **A)** David · **B)** Morgan · **C)** Jared · **D)** Tate | **C** — Jared | Jared merged the coordinate PR (F214). |
| Q182 | F214 | true-false | Before the QR incident, the lab's screen coordinates had been measured with a ruler. | True · False | **True** | The shift broke "ruler-measured coordinates" (F214). |
| Q183 | F215 | multiple-choice | What did the QR feature add to the receipt menu? | **A)** A conditional 5th menu option · **B)** A pop-up dialog · **C)** A 6th option · **D)** A permanent 4th option | **A** — A conditional 5th menu option | It introduced a conditional 5th option (F215). |
| Q184 *(CP-M09.1)* | F216 | multiple-choice | How does Orca now handle receipt screens? | **A)** One map per merchant · **B)** Separate coordinate maps for 4-option and 5-option receipt screens across every device profile · **C)** An OCR check before every tap · **D)** One map plus an Offset when the QR shows | **B** — Separate coordinate maps for 4-option and 5-option receipt screens across every device profile | Orca maintains separate 4- and 5-option maps per device profile (F216). |
| Q185 | F216, F215 | fill-in | Orca keeps separate receipt coordinate maps for 4 options and for ___ options. Type the number. | — (free text) | `5` | 4-option and 5-option maps (F215, F216). |
| Q186 | F082, F142 | multiple-choice | Screen Location millimetre coordinates line up with the physical screen because the gantry's origin is set by… | **A)** The webcam's auto-focus · **B)** Limit switches calibrated to (0,0) · **C)** The device's ADB density · **D)** Tablet calibration on boot | **B** — Limit switches calibrated to (0,0) | Limit switches define (0,0) (F082); coordinates are relative mm (F142). |
| Q187 | F213, F214 | multiple-choice | Why did robots across the lab start missing buttons when the receipt QR feature shipped? | **A)** Jenkins lost its environment variables · **B)** The QR code blinded the webcams · **C)** Buttons shifted down a few millimetres, invalidating the ruler-measured coordinates · **D)** The Pis crashed under the new firmware | **C** — Buttons shifted down a few millimetres, invalidating the ruler-measured coordinates | F213, F214. |
| Q188 | F218, F217 | true-false | DATA (an ADB bot) can safely be put on a merchant that requires PIN entry. | True · False | **False** | ADB bots cannot enter PINs (F217), so they are restricted to merchants that bypass PIN security (F218). |

#### Quiz items — M10 Card Profiles: Gort, Callus & Collis

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q189 *(CP-M10.1)* | F145 | multiple-choice | How are swipe card profiles stored? | **A)** As file paths into the Gort repository · **B)** As raw Track Data text strings directly in the MySQL table · **C)** Inside the Wine prefix on the Pi · **D)** As webcam images of the card | **B** — As raw Track Data text strings directly in the MySQL table | Swipe profiles store raw Track Data strings in MySQL (F145). |
| Q190 *(CP-M10.1)* | F147 | multiple-choice | How are Dip and Tap card profiles stored? | **A)** As file paths pointing to card definitions inside Gort · **B)** As raw Track Data in MySQL · **C)** As Jenkins parameters · **D)** As binary blobs on the status tablet | **A** — As file paths pointing to card definitions inside Gort | Dip & Tap profiles store paths into Gort (F147). |
| Q191 | F145, F147 | true-false | Dip profiles store raw Track Data in MySQL, just like swipe profiles. | True · False | **False** | Only swipe profiles hold Track Data; dip/tap hold Gort file paths (F145, F147). |
| Q192 | F146 | multiple-choice | How was the swipe Track Data obtained? | **A)** Measured in GIMP · **B)** Typed in by hand from the card face · **C)** Extracted with a hardware card-reader utility · **D)** Generated by Ollama | **C** — Extracted with a hardware card-reader utility | Track Data is extracted via a hardware card-reader utility (F146). |
| Q193 *(CP-M10.1)* | F148 | multiple-choice | How do Gort card files reach the local Windows boxes? | **A)** An engineer copies them on a USB stick · **B)** The Collis probe downloads them · **C)** Jenkins copies them at the start of every build · **D)** A scheduled job clones them onto the boxes | **D** — A scheduled job clones them onto the boxes | A scheduled job clones the files onto the local Windows boxes (F148). |
| Q194 | F149 | multiple-choice | During a test run, what does Callus do with a dip/tap profile path? | **A)** Maps the file path and loads the virtual card · **B)** Uploads the file to Orca · **C)** Runs OCR on it · **D)** Prints the card on the 3D printer | **A** — Maps the file path and loads the virtual card | Callus servers map the path and load the virtual card (F149). |
| Q195 | F145, F147, F148, F149 | ordering | Order what happens for a Dip profile, from storage to transaction. | **A)** During the run Callus maps the path and loads the virtual card · **B)** Card definition file is committed in Gort · **C)** Orca's Dip profile stores the file path · **D)** A scheduled job clones Gort's card files onto the Windows box · **E)** The Collis probe presents the card to the device | **B** → **C** → **D** → **A** → **E** | F147, F148, F149, F097. |
| Q196 *(CP-M10.1)* | F049 | multiple-choice | Where does Callus run? | **A)** On Google Cloud · **B)** On the Raspberry Pis · **C)** On the GPU blade · **D)** On local Windows/Minix boxes | **D** — On local Windows/Minix boxes | Callus is a microservice on local Windows/Minix boxes (F049). |
| Q197 | F048 | multiple-choice | Which other names refer to Callus? | **A)** Callers / Collos · **B)** Callback · **C)** Collis · **D)** Calypso | **A** — Callers / Collos | Callus is also referred to as Callers or Collos (F048). Collis is the probe hardware. |
| Q198 | F050 | multiple-choice | What does Callus drive during virtual card transactions? | **A)** The status tablets · **B)** The physical Collis probes · **C)** The stepper motors · **D)** Jenkins agents | **B** — The physical Collis probes | Callus reads card paths from Gort and drives the Collis probes (F050). |
| Q199 | F050 | true-false | Callus reads card-profile paths from Gort. | True · False | **True** | F050. |
| Q200 *(CP-M10.1)* | F069 | multiple-choice | What are Collis probes? | **A)** Raspberry Pi HATs · **B)** Magnetic stripe encoders · **C)** Cheap USB card readers · **D)** High-cost proprietary card emulators (UL Transaction Security) | **D** — High-cost proprietary card emulators (UL Transaction Security) | F069. |
| Q201 | F070 | multiple-choice | How does a Collis probe connect to the rig? | **A)** Over Bluetooth · **B)** Via rear ribbon cables · **C)** Over Wi-Fi · **D)** Over ADB on port 5444 | **B** — Via rear ribbon cables | Collis probes connect via rear ribbon cables (F070). |
| Q202 | F071 | multiple-choice | Which card interactions can a Collis probe simulate? | **A)** PIN entry and signature · **B)** Only chip dips · **C)** Magnetic-stripe swipe, EMV chip dip and contactless NFC tap · **D)** Only swipes and taps | **C** — Magnetic-stripe swipe, EMV chip dip and contactless NFC tap | F071. |
| Q203 | F071 | fill-in | Name the contactless technology a Collis probe simulates for taps (three letters). | — (free text) | `NFC` | Collis probes simulate contactless NFC taps (F071). |
| Q204 | F034 | multiple-choice | What is Gort? | **A)** Orca's database · **B)** The Pi's operating-system image · **C)** The core monorepo with the testing ecosystem, configuration modules and virtual card definitions · **D)** A rig in the lab | **C** — The core monorepo with the testing ecosystem, configuration modules and virtual card definitions | Gort is the core monorepo (F034, F035). The name nods to a robot but it is not a rig. |
| Q205 *(CP-M10.1)* | F035 | multiple-choice | Which repository holds the virtual card definition files used by Dip and Tap profiles? | **A)** orca · **B)** Gort · **C)** uia-remote · **D)** pigeon | **B** — Gort | Gort houses virtual card definition files for Dip/Tap profiles (F035). |
| Q206 | F034 | true-false | Gort houses distinct configuration modules as well as the testing ecosystem. | True · False | **True** | F034. |
| Q207 *(CP-M10.1)* | F224 | multiple-choice | How does your team verify transaction pipelines? | **A)** With one reliable Visa profile (plus Interac for Canadian flows) · **B)** With an exhaustive Visa / Discover / AmEx matrix · **C)** With AmEx only · **D)** With a random card each run | **A** — With one reliable Visa profile (plus Interac for Canadian flows) | Your team standardises on a single Visa profile plus Interac (F224, F225). |
| Q208 | F225 | fill-in | Which Canadian card network does your team add for regional flows? | — (free text) | `Interac` | Canadian Interac for regional flows (F225). Case-insensitive. |
| Q209 | F225, F224 | multiple-choice | Tonight you run a US Go SDK smoke and a Contact Canada PIN sale. Which card profiles fit the team's philosophy? | **A)** Discover for the US run; Visa for the Canadian run · **B)** The full PayCore matrix for both · **C)** AmEx for both · **D)** Visa for the US run; Interac for the Canadian run | **D** — Visa for the US run; Interac for the Canadian run | Single Visa, plus Interac for Canada (F224, F225). |
| Q210 | F097 | true-false | The Collis probe is driven by the Raspberry Pi over GPIO, not by Callus. | True · False | **False** | The Windows/Minix box running Callus drives the Collis probe over a ribbon cable (F097, F050). |
| Q211 | F035 | true-false | The virtual card definition files for Dip/Tap profiles live in the uia-remote repository. | True · False | **False** | They live in Gort (F035). |
| Q212 | F049 | true-false | Callus runs on the Raspberry Pis under Wine. | True · False | **False** | Callus runs on local Windows/Minix boxes (F049); Wine on the Pi runs card-programming software (F021). |
| Q213 | F069, F229 | true-false | Collis probes are cheap commodity readers, so it is fine to power them from the 24V rail. | True · False | **False** | Collis probes are high-cost proprietary emulators (F069) and go on commercial AC strips, never the DC rails (F229). |

#### Quiz items — M11 Jenkins: The Executor

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q214 *(CP-M11.1)* | F015 | multiple-choice | What is Jenkins' role name in the lab architecture? | **A)** Executor · **B)** Router · **C)** Runner · **D)** Controller | **A** — Executor | Jenkins is the CI/CD execution engine, the Executor (F015). |
| Q215 *(CP-M11.1)* | F016 | multiple-choice | Which two things does Jenkins do for a test pipeline? | **A)** Triggers it and injects runtime environment variables · **B)** Stores coordinates and card profiles · **C)** Pings the Pis and parks robots · **D)** Compiles device firmware | **A** — Triggers it and injects runtime environment variables | F016. |
| Q216 *(CP-M11.1)* | F017 | multiple-choice | How are legacy Jenkins jobs organised? | **A)** By platform: Java jobs separated from iOS jobs · **B)** By date created · **C)** By team · **D)** By robot name | **A** — By platform: Java jobs separated from iOS jobs | F017. |
| Q217 *(CP-M11.1)* | F189 | multiple-choice | During a CI run, where do the config.properties values come from? | **A)** Orca pushes the file to the device · **B)** The status tablet · **C)** A committed config.properties file per robot · **D)** Jenkins injects them dynamically | **D** — Jenkins injects them dynamically | Jenkins injects these dynamically during CI (F189). |
| Q218 | F122 | true-false | DEVICE_TYPE=flex_3 works fine because Orca lower-cases the enum. | True · False | **False** | Env vars must be ALL CAPS to match the Device Type enum (F122). |
| Q219 | F095 | multiple-choice | Before a CI test touches hardware, what does Jenkins do with Orca? | **A)** Checks out a robot · **B)** Copies Orca's database · **C)** Sets the robot Offline · **D)** Reserves the robot permanently | **A** — Checks out a robot | Jenkins checks out a robot from Orca (F095). |
| Q220† *(CP-M11.1)* | F102 | multiple-choice | A Jenkins job must run on ROSIE, which is Unavailable. What must the job parameters contain? | **A)** ROSIE's exact unique robot name (e.g. ROBOT_NAME=rosie) · **B)** DEVICE_TYPE=FLEX_POCKET only · **C)** Nothing; Jenkins ignores Unavailable · **D)** FORCE=true | **A** — ROSIE's exact unique robot name (e.g. ROBOT_NAME=rosie) | Unavailable robots only accept jobs that pass their exact unique name (F102). (Parameter name ROBOT_NAME is illustrative.) |
| Q221 | F139, F016 | multiple-choice | Which runtime environment variables does a Go SDK pipeline export from Merchant Config? | **A)** Offsets X and Y · **B)** Serial, theme and kernelType · **C)** Track Data and card path · **D)** App ID, App Secret and API Key | **D** — App ID, App Secret and API Key | Pipelines export App ID / App Secret / API Key as env vars for the Go SDK (F139). |
| Q222 | F094 | multiple-choice | Into which components does Jenkins inject environment variables? | **A)** The Raspberry Pis · **B)** MySQL · **C)** The test runners (uia-remote or Pigeon) · **D)** The status tablets | **C** — The test runners (uia-remote or Pigeon) | F094. |
| Q223 | F203 | multiple-choice | Which Pigeon/Jenkins runner is rarely touched, even though its Go SDK testing is active? | **A)** REST · **B)** iOS · **C)** Windows · **D)** Android | **B** — iOS | The iOS test runner is rarely touched, though iOS Go testing is active (F203). |
| Q224 | F015, F098 | fill-in | Fill the gap: "Orca is the Controller; Jenkins is the ________." | — (free text) | `Executor` | Jenkins = Executor (F015, F098). Case-insensitive. |

#### Quiz items — M12 ADB on Port 5444

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q225 *(CP-M12.1)* | F026 | multiple-choice | Which TCP port does the lab's ADB use? | **A)** 5037 · **B)** 5444 · **C)** 5555 · **D)** 8080 | **B** — 5444 | The lab runs ADB over port 5444 (F026). 5555 is the ADB default; 5037 is the local ADB server; 8080 is Orca/Jenkins HTTP. |
| Q226 *(CP-M12.1)* | F026 | fill-in | Complete the command: adb connect 10.42.30.32:____ | — (free text) | `5444` | Lab ADB uses 5444 (F026). |
| Q227 *(CP-M12.1)* | F199 | multiple-choice | What is the standard ADB default TCP port? | **A)** 5555 · **B)** 22 · **C)** 5037 · **D)** 5444 | **A** — 5555 | Standard ADB defaults to 5555 (F199). |
| Q228 *(CP-M12.1)* | F024 | multiple-choice | Which ADB capability lets you find a button's bounds on screen? | **A)** adb reboot · **B)** logcat · **C)** Inspecting the XML UI hierarchy (uiautomator dump) · **D)** adb install | **C** — Inspecting the XML UI hierarchy (uiautomator dump) | ADB inspects XML UI hierarchies to locate elements (F024). |
| Q229 | F025 | multiple-choice | Which command dispatches a programmatic tap at X,Y? | **A)** adb push tap X Y · **B)** adb shell click X Y · **C)** adb shell input tap X Y · **D)** adb tap X Y | **C** — adb shell input tap X Y | ADB dispatches programmatic touch events, e.g. input tap (F025). |
| Q230 | F024 | true-false | ADB is a command-line tool. | True · False | **True** | Android Debug Bridge is a command-line tool (F024). |
| Q231 *(CP-M12.1)* | F025, F024 | ordering | Order the steps to tap the Register icon on TARS with ADB. | **A)** Read the Register node's bounds in the XML · **B)** adb connect 10.42.30.32:5444 · **C)** adb shell uiautomator dump · **D)** adb shell input tap at the bounds' centre | **B** → **C** → **A** → **D** | Connect on 5444 (F026), dump the XML hierarchy (F024), then dispatch a tap (F025). |
| Q232 | F026, F199 | true-false | In the lab, "adb connect 10.42.30.32" with no port will reach the device because ADB defaults to 5444. | True · False | **False** | ADB defaults to 5555 (F199); lab devices listen on 5444 (F026), so the bare connect is refused. |

#### Quiz items — M13 uia-remote: Structure & the Page Object Model

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q233 *(CP-M13.1)* | F005 | multiple-choice | Which framework powers uia-remote? | **A)** Espresso · **B)** Selenium · **C)** Android UI Automator · **D)** Appium | **C** — Android UI Automator | UI Automator is Google's native instrumentation framework used inside uia-remote (F005). |
| Q234 *(CP-M13.1)* | F006 | multiple-choice | Which UI Automator version does uia-remote use? | **A)** 1.0 · **B)** 3.0 · **C)** 2.2 · **D)** 2.3 | **D** — 2.3 | Version 2.3 specifically (F006). |
| Q235 | F006, F007 | fill-in | Type the UI Automator version that added native dual-screen element tracking. | — (free text) | `2.3` | UIA 2.3 adds native dual-screen element location tracking (F006, F007). |
| Q236 | F010 | multiple-choice | uia-remote's project layout mirrors which build-structure standard? | **A)** Make · **B)** Bazel · **C)** Apache Maven · **D)** Ant | **C** — Apache Maven | The Android project layout mirrors Apache Maven (F010). |
| Q237 | F027 | multiple-choice | What is the team's primary IDE? | **A)** Android Studio · **B)** VS Code · **C)** Eclipse · **D)** IntelliJ IDEA | **D** — IntelliJ IDEA | IntelliJ IDEA (F027). |
| Q238 | F028 | multiple-choice | Which of these is NOT something the team uses IntelliJ IDEA for? | **A)** Executing test suites · **B)** Importing repositories · **C)** Drawing bounding boxes on device screenshots · **D)** Configuring local properties | **C** — Drawing bounding boxes on device screenshots | IntelliJ imports repos, configures local properties and runs suites (F028); bounding boxes are drawn in GIMP (F030). |
| Q239 | F163 | multiple-choice | Under which path is uia-remote's source organised? | **A)** tests/ at the repo root · **B)** runners/ · **C)** src/main/java only · **D)** app/src/ | **D** — app/src/ | Standard Android/Maven structure under app/src/ (F163). |
| Q240 *(CP-M13.1)* | F164 | multiple-choice | Which folder do QA engineers never modify? | **A)** androidTest · **B)** pageobjects · **C)** main · **D)** test | **C** — main | main is reserved for production/application registration code (F164). |
| Q241 *(CP-M13.1)* | F165 | multiple-choice | Where does the multi-device execution runner live? | **A)** test · **B)** testactions · **C)** main · **D)** androidTest | **A** — test | test holds local unit tests and the multi-device runner scripts (F165). |
| Q242 | F166 | multiple-choice | What lives in androidTest? | **A)** Local unit tests that run on the laptop only · **B)** Production registration code · **C)** Jenkins pipeline scripts · **D)** Instrumented tests that execute on Android hardware | **D** — Instrumented tests that execute on Android hardware | androidTest houses instrumented tests on Android hardware (F166). |
| Q243 *(CP-M13.1)* | F167, F168, F169, F165 | match | Match each location to its contents. | **1.** androidTest/databases · **2.** androidTest/pageobjects · **3.** androidTest/testactions · **4.** test ⟷ **A)** Page Object Model classes for device screens · **B)** Local unit tests and the multi-device runner · **C)** Database connection and query logic · **D)** Test classes and assertions that chain page-object methods | 1→**C**, 2→**A**, 3→**D**, 4→**B** | F167, F168, F169, F165. |
| Q244 | F166 | fill-in | androidTest is split into how many packages? Type the number. | — (free text) | `3` | databases, pageobjects, testactions (F166). |
| Q245 | F169 | multiple-choice | You write TaxTest, which strings HomeScreen and RegisterHomeScreen methods together with assertions. Which package? | **A)** testactions · **B)** pageobjects · **C)** main · **D)** databases | **A** — testactions | testactions holds test classes and assertions (F169). |
| Q246 | F168 | multiple-choice | You create LockScreen.java, a class representing one device screen. Which package? | **A)** testactions · **B)** pageobjects · **C)** test · **D)** databases | **B** — pageobjects | pageobjects holds POM classes for screens (F168). |
| Q247 | F170 | multiple-choice | By design, how many Android devices can UI Automator talk to at once? | **A)** Unlimited · **B)** One · **C)** Four · **D)** Two | **B** — One | Google designed UI Automator to talk to only one device at a time (F170). |
| Q248 *(CP-M13.1)* | F171 | multiple-choice | How does uia-remote control an MFD and a CFD in one test? | **A)** An ADB broadcast reaches both devices at once · **B)** The runner in test targets methods sequentially across device handles: Device A runs Method X, focus shifts to Device B for Method Y, then loops back · **C)** Two UI Automator instances run in parallel threads · **D)** OCR reads the CFD | **B** — The runner in test targets methods sequentially across device handles: Device A runs Method X, focus shifts to Device B for Method Y, then loops back | F171. |
| Q249 | F171, F170 | true-false | uia-remote's multi-device trick keeps the screen definitions in androidTest and the runner in test. | True · False | **True** | F171. |
| Q250 | F172 | multiple-choice | In uia-remote, what gets its own Java class? | **A)** Each physical device · **B)** Every screen, pop-up or window · **C)** Only full-screen apps · **D)** Each test run | **B** — Every screen, pop-up or window | Every screen, pop-up or window has its own class, e.g. HomeScreen, LockScreen, NavigationBar, RegisterHomeScreen (F172). |
| Q251 | F172 | true-false | NavigationBar is a valid example of a uia-remote screen class. | True · False | **True** | The reference lists HomeScreen, LockScreen, NavigationBar and RegisterHomeScreen (F172). |
| Q252 | F173 | multiple-choice | Every screen class extends which class? | **A)** BaseTest · **B)** Activity · **C)** UiDevice · **D)** TestCase | **A** — BaseTest | F173. |
| Q253 | F174 | multiple-choice | What does BaseTest provide? | **A)** Global setup, teardown and instance variables · **B)** Database queries · **C)** The multi-device runner · **D)** Element locators | **A** — Global setup, teardown and instance variables | F174. |
| Q254 | F175 | multiple-choice | What goes in Zone 1 of a screen class? | **A)** config.properties values · **B)** Element locators: UI elements unique to that view · **C)** Assertions · **D)** Helper and action methods | **B** — Element locators: UI elements unique to that view | F175. |
| Q255 | F176 | multiple-choice | Where are device-specific behaviours abstracted in a screen class? | **A)** The testactions package · **B)** config.properties · **C)** Zone 1 locators · **D)** Zone 2 helper/action methods | **D** — Zone 2 helper/action methods | F176. |
| Q256 | F175, F176 | match | Match each zone to its contents. | **1.** Zone 1 · **2.** Zone 2 ⟷ **A)** Helper/action methods, including device-specific behaviour · **B)** Element locators unique to the view | 1→**B**, 2→**A** | F175, F176. |
| Q257 *(CP-M13.1)* | F177 | multiple-choice | On a Flex, open("Register") scrolls… | **A)** Diagonally · **B)** Horizontally · **C)** Vertically · **D)** Not at all | **C** — Vertically | Vertical on Flex; horizontal on Mini or Station (F177). |
| Q258 | F177 | true-false | On a Mini or a Station, open(String appName) scrolls horizontally. | True · False | **True** | F177. |
| Q259 | F178 | multiple-choice | What problem does waitForScreen() prevent? | **A)** ADB port collisions · **B)** OCR typos · **C)** The wrong theme loading · **D)** UI Automator clicking buttons that have not finished rendering | **D** — UI Automator clicking buttons that have not finished rendering | waitForScreen() pauses until all elements render (F178). |
| Q260 | F179 | multiple-choice | What does isScreenPresent() return? | **A)** A list of elements · **B)** A screenshot · **C)** A boolean: whether that screen is currently in focus · **D)** Nothing (void) | **C** — A boolean: whether that screen is currently in focus | F179. |
| Q261 *(CP-M13.1)* | F180 | multiple-choice | Which two methods are mandatory on every screen class? | **A)** setUp() and tearDown() · **B)** open() and close() · **C)** findElement() and click() · **D)** waitForScreen() and isScreenPresent() | **D** — waitForScreen() and isScreenPresent() | F180. |
| Q262 | F180, F179 | true-false | A new screen class that only implements waitForScreen() meets the uia-remote rules. | True · False | **False** | Both waitForScreen() and isScreenPresent() are mandatory (F180). |
| Q263 | F039, F040 | multiple-choice | What does uia-remote automate? | **A)** Only REST endpoints · **B)** Only iOS apps · **C)** Only standalone Flex devices · **D)** Both standalone devices and tethered multi-device setups across native LabSim apps | **D** — Both standalone devices and tethered multi-device setups across native LabSim apps | F039, F040. |
| Q264 | F039 | true-false | uia-remote is the team's modern Java / UI Automator repository. | True · False | **True** | F039. |
| Q265 | F159 | multiple-choice | Why was uia-remote created? | **A)** Pigeon was too slow · **B)** No prior framework could automate native tethered setups (Station-to-Mini, Mini-to-Mini, Station Duo) · **C)** Jenkins required a new framework · **D)** To replace Orca | **B** — No prior framework could automate native tethered setups (Station-to-Mini, Mini-to-Mini, Station Duo) | F159. |
| Q266 | F001 | multiple-choice | What is the primary programming language for Orca and uia-remote? | **A)** Python · **B)** Go · **C)** Kotlin · **D)** Java | **D** — Java | Java (Oracle Java) powers both (F001). |
| Q267 | F018 | multiple-choice | Where are the team's repositories hosted for branches and pull requests? | **A)** Perforce · **B)** GitHub · **C)** Bitbucket · **D)** GitLab | **B** — GitHub | GitHub hosts Gort, uia-remote and pigeon (F018). |
| Q268 | F005 | true-false | Android UI Automator is Google's native Android instrumentation framework. | True · False | **True** | UI Automator is Google's native instrumentation framework, used inside uia-remote (F005). |
| Q269 | F027 | true-false | Android Studio is the team's primary IDE. | True · False | **False** | IntelliJ IDEA is the primary IDE (F027). |
| Q270 | F040 | true-false | uia-remote can only automate standalone devices; tethered setups still need Pigeon. | True · False | **False** | uia-remote automates both standalone and tethered multi-device setups (F040). |
| Q271 | F163, F164, F168 | true-false | QA engineers routinely add new page objects under app/src/main. | True · False | **False** | main is never modified by QA (F164); page objects go in androidTest/pageobjects (F168) under app/src/ (F163). |
| Q272 | F167 | multiple-choice | Where does database connection and query logic live in uia-remote? | **A)** main · **B)** androidTest/databases · **C)** androidTest/pageobjects · **D)** test | **B** — androidTest/databases | F167. |
| Q273 | F173 | fill-in | Every screen class extends which base class? Type its name exactly. | — (free text) | `BaseTest` | F173. Case-sensitive. |
| Q274 | F178 | true-false | waitForScreen() pauses execution until all UI elements finish rendering. | True · False | **True** | F178. |

#### Quiz items — M14 config.properties & the Tethered Tax Test

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q275 *(CP-M14.1)* | F188 | multiple-choice | Running locally from a laptop, how do you configure the test target? | **A)** Orca pushes the file to your laptop · **B)** Edit config.properties manually · **C)** Jenkins injects it for you · **D)** Set it on the status tablet | **B** — Edit config.properties manually | Locally, engineers configure config.properties manually (F188). |
| Q276 *(CP-M14.1)* | F190 | fill-in | Which value must runType have for multi-device testing? Type it exactly. | — (free text) | `tethered` | runType=tethered (F190). Case-sensitive. |
| Q277 | F191 | multiple-choice | What does merchantFacingDeviceIp hold? | **A)** Orca's IP · **B)** The local network IP of the MFD terminal · **C)** The Pi's IP · **D)** The CFD's IP | **B** — The local network IP of the MFD terminal | F191. |
| Q278 | F192 | multiple-choice | What does customerFacingDeviceIp hold? | **A)** The local network IP of the CFD terminal · **B)** The webcam's IP · **C)** The Callus box's IP · **D)** The MFD's IP | **A** — The local network IP of the CFD terminal | F192. |
| Q279 *(CP-M14.1)* | F193 | multiple-choice | On a Station Duo, how are the MFD and CFD IPs set? | **A)** MFD set to 127.0.0.1 · **B)** CFD set to the Pi's IP · **C)** CFD left blank · **D)** Both to the exact same IP address | **D** — Both to the exact same IP address | On a Station Duo both IPs are the exact same address (F193). |
| Q280 | F193 | true-false | On a Station Duo you leave customerFacingDeviceIp empty because the CFD isn't on ADB. | True · False | **False** | Both IPs are set to the same address (F193). |
| Q281 | F194 | multiple-choice | What is serial in config.properties? | **A)** The robot's Orca name · **B)** The Jenkins build number · **C)** The Pi's serial number · **D)** The hardware serial number of the primary terminal | **D** — The hardware serial number of the primary terminal | F194. |
| Q282 | F195 | multiple-choice | Which values does deviceType take in config.properties? | **A)** avocado or classic · **B)** FLEX_3, MINI_3, STATION_2 · **C)** Mini, Flex or Station (the form factor) · **D)** 5444 or 5555 | **C** — Mini, Flex or Station (the form factor) | deviceType is the form factor (Mini, Flex, Station) governing layout/scroll logic (F195). |
| Q283 | F195, F177 | multiple-choice | What does config.properties' deviceType govern? | **A)** The tablet colour · **B)** Which port ADB uses · **C)** Layout and scroll logic · **D)** The merchant account | **C** — Layout and scroll logic | deviceType governs layout/scroll logic, e.g. vertical vs horizontal scrolling in open() (F195, F177). |
| Q284 *(CP-M14.1)* | F196 | fill-in | theme is locked to which value? Type it exactly. | — (free text) | `avocado` | theme=avocado; legacy toggles are deprecated (F196). Case-sensitive. |
| Q285 | F196 | true-false | Legacy theme toggles are still supported; avocado is merely the default. | True · False | **False** | theme is locked strictly to avocado; legacy toggles are deprecated (F196). |
| Q286 *(CP-M14.1)* | F197 | fill-in | kernelType is locked to which value? Type it exactly. | — (free text) | `CPA` | kernelType=CPA (F197). Case-sensitive. |
| Q287 | F197 | multiple-choice | What do CPA and SPA stand for? | **A)** CPA = Core Payments Application; it replaces SPA = Secure Processor Application · **B)** CPA = Customer Payment Adapter; SPA = Secure PIN Agent · **C)** CPA = Card Processing Agent; SPA = Standard Payment API · **D)** CPA = LabSim Pay App; SPA = Single Page App | **A** — CPA = Core Payments Application; it replaces SPA = Secure Processor Application | F197. |
| Q288 *(CP-M14.1)* | F198 | fill-in | portNumber is locked to which value? Type the number. | — (free text) | `5444` | portNumber=5444 (F198). |
| Q289 | F198, F199 | multiple-choice | Which config.properties line is correct for the lab? | **A)** portNumber=8080 · **B)** portNumber=5037 · **C)** portNumber=5555 · **D)** portNumber=5444 | **D** — portNumber=5444 | Locked to 5444 (F198); 5555 is the ADB default (F199). |
| Q290 *(CP-M14.1)* | F200 | multiple-choice | Why is the lab not on port 5555? | **A)** Jenkins already uses 5555 · **B)** corporate blocks 5555 · **C)** The ADB default caused office collisions where scripts connected to and controlled coworkers' desk devices · **D)** The Pis cannot open 5555 | **C** — The ADB default caused office collisions where scripts connected to and controlled coworkers' desk devices | F200. |
| Q291 | F200 | true-false | Port 5555 caused collisions in which automated scripts controlled coworkers' desk devices. | True · False | **True** | F200. |
| Q292 | F201 | multiple-choice | Which is NOT among the additional config.properties keys described? | **A)** The active robot's registration name · **B)** Device unlock passcodes · **C)** Backend testing environment targets · **D)** GPU count | **D** — GPU count | Extras are unlock passcodes, backend env targets and the robot's registration name (F201). |
| Q293 | F189 | true-false | During CI, engineers must commit config.properties with the right IPs for each robot. | True · False | **False** | Jenkins injects these values dynamically during CI runs (F189). |
| Q294 | F182 | multiple-choice | How does every uia-remote test begin and end? | **A)** It starts on LockScreen and ends on RegisterHomeScreen · **B)** It starts from the last screen and ends anywhere · **C)** It reboots both devices · **D)** It starts explicitly from HomeScreen; a teardown forces the hardware back to HomeScreen | **D** — It starts explicitly from HomeScreen; a teardown forces the hardware back to HomeScreen | F182. |
| Q295 | F182 | true-false | A teardown routine forces the hardware back to HomeScreen at the end of every test. | True · False | **True** | F182. |
| Q296 *(CP-M14.1)* | F183, F184, F185, F186, F187 | ordering | Order the Tax test. | **A)** MFD_O1: open Register, add "Tax Item 5", click "Review Order" · **B)** Orca routes to Callus to load a simulated swipe card · **C)** CFD_O1: assert subtotal, calculated tax and grand total · **D)** Payment prompt finalised on the Customer display · **E)** MFD_O2: click "Pay" and "Charge" | **A** → **B** → **C** → **E** → **D** | F183–F187. |
| Q297 | F183 | fill-in | Which item does the Tax test add in Step 1? Type it exactly. | — (free text) | `Tax Item 5` | MFD_O1 adds "Tax Item 5" (F183). |
| Q298 | F183 | multiple-choice | In MFD_O1, which button is clicked after adding the item? | **A)** Charge · **B)** Review Order · **C)** Print · **D)** Pay | **B** — Review Order | Open Register, add Tax Item 5, click "Review Order" (F183). |
| Q299 | F184 | multiple-choice | In Tax test Step 1, Orca routes the backend call to which service to load a simulated swipe card? | **A)** Ubi · **B)** Ollama · **C)** Laz · **D)** Callers/Collos (Callus) | **D** — Callers/Collos (Callus) | F184. |
| Q300 | F185 | multiple-choice | What does CFD_O1 assert? | **A)** Subtotal, calculated tax and grand total · **B)** Tip amount · **C)** The receipt QR code · **D)** PIN entry | **A** — Subtotal, calculated tax and grand total | F185. |
| Q301 | F186 | multiple-choice | Which buttons are clicked in MFD_O2? | **A)** "Pay" and "Charge" · **B)** "Tender" and "Done" · **C)** "Charge" and "Print" · **D)** "Review Order" and "Pay" | **A** — "Pay" and "Charge" | F186. |
| Q302 | F187 | multiple-choice | Where is the payment prompt finalised in Step 4? | **A)** In Orca · **B)** On the Customer display · **C)** On the Merchant display · **D)** On the status tablet | **B** — On the Customer display | F187. |
| Q303 | F181 | multiple-choice | What does the Tax test file begin with? | **A)** An @Ignore annotation · **B)** A plain-text documentation header explaining the test's intent · **C)** A random seed · **D)** A dump of config.properties | **B** — A plain-text documentation header explaining the test's intent | F181. |
| Q304 | F190, F196, F197, F198 | match | Match each config.properties key to its locked or expected value for MEGATRON. | **1.** runType · **2.** theme · **3.** kernelType · **4.** portNumber ⟷ **A)** tethered · **B)** avocado · **C)** 5444 · **D)** CPA | 1→**A**, 2→**B**, 3→**D**, 4→**C** | F190, F196, F197, F198. (MEGATRON's IPs are covered separately.) |
| Q305 | F054, F185 | multiple-choice | In the Tax test, which device shows the subtotal, tax and total to be asserted? | **A)** The CFD (Customer Facing Device) · **B)** The status tablet · **C)** The MFD (Merchant Facing Device) · **D)** The Collis probe | **A** — The CFD (Customer Facing Device) | CFD_O1 asserts on the Customer display (F185); CFD = Customer Facing Device (F054). |
| Q306 | F188, F189 | true-false | When you run TaxTest from your laptop, Jenkins injects config.properties for you. | True · False | **False** | Locally you edit config.properties manually (F188); Jenkins injects values only during CI (F189). |
| Q307 | F191, F192 | true-false | merchantFacingDeviceIp holds the local network IP of the CFD terminal. | True · False | **False** | merchantFacingDeviceIp is the MFD's IP (F191); the CFD's IP goes in customerFacingDeviceIp (F192). |

#### Quiz items — M15 Pigeon (LSTR) & Legacy JSON

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q308 *(CP-M15.1)* | F041 | multiple-choice | What is Pigeon's other name? | **A)** LSTR · **B)** Gort · **C)** Laz · **D)** Lester | **A** — LSTR | Pigeon (LSTR) (F041). |
| Q309 *(CP-M15.1)* | F044 | fill-in | LSTR stands for Language Specific Test ______. Type the missing word. | — (free text) | `Runner` | Language Specific Test Runner (F044). Case-insensitive. |
| Q310 | F042 | multiple-choice | The name "Pigeon" is a play on words on… | **A)** The carrier-pigeon RFC · **B)** Homing pigeons carrying messages · **C)** Pidgin language · **D)** Pig Latin | **C** — Pidgin language | F042. |
| Q311 *(CP-M15.1)* | F043 | multiple-choice | Pigeon evolved from which framework? | **A)** Laz · **B)** JHipster · **C)** Lester · **D)** Callus | **C** — Lester | F043. |
| Q312 *(CP-M15.1)* | F045, F202 | multiple-choice | Which platforms have dedicated LSTR runners? | **A)** REST and Go only · **B)** Linux and macOS · **C)** REST, Android, Windows and iOS · **D)** Android only | **C** — REST, Android, Windows and iOS | F045, F202. |
| Q313 | F202 | fill-in | How many dedicated LSTR runners are there? Type the number. | — (free text) | `4` | REST, Android, Windows, iOS (F202). |
| Q314 | F203 | true-false | The iOS runner is rarely touched, but iOS Go testing is active. | True · False | **True** | F203. |
| Q315 | F204 | multiple-choice | How does Pigeon handle a high-level command like "card swipe"? | **A)** The runner abstracts it into platform-specific SDK payment requests or physical robot actions · **B)** It skips it on REST · **C)** It always sends an ADB tap · **D)** It asks the engineer to swipe by hand | **A** — The runner abstracts it into platform-specific SDK payment requests or physical robot actions | F204. |
| Q316 *(CP-M15.1)* | F205 | multiple-choice | Which is NOT a top-level part of a Pigeon JSON test? | **A)** Supported platforms · **B)** Test name · **C)** Connection type · **D)** A Java page-object class | **D** — A Java page-object class | A Pigeon test specifies name, connection type, platforms and an actions array (F205). |
| Q317 | F205 | ordering | Order the fields as they appear in the reference's description of a Pigeon JSON test. | **A)** Array of test actions · **B)** Connection type · **C)** Supported platforms · **D)** Test name | **D** → **B** → **C** → **A** | F205. |
| Q318 | F206 | multiple-choice | How many platforms can a versatile Pigeon test target at once? | **A)** 1 · **B)** 4 to 5 · **C)** 2 · **D)** 10 or more | **B** — 4 to 5 | F206. |
| Q319 | F207 | multiple-choice | What do Pigeon test actions do? | **A)** Park robots · **B)** Compile Java classes · **C)** Render page objects · **D)** Create requests, pass parameters and store output variables | **D** — Create requests, pass parameters and store output variables | F207. |
| Q320 *(CP-M15.1)* | F208 | multiple-choice | A Pigeon test fails to parse. What tooling catches the error for you? | **A)** IntelliJ's Pigeon JSON inspection · **B)** Jenkins auto-fixes it · **C)** None: Pigeon has no JSON linter, so you hunt missing commas/brackets by hand · **D)** Orca validates the JSON on upload | **C** — None: Pigeon has no JSON linter, so you hunt missing commas/brackets by hand | F208. |
| Q321 | F209 | multiple-choice | How do engineers cope with the missing linter? | **A)** They avoid JSON entirely · **B)** They let Ollama write them · **C)** They write tests in YAML · **D)** They copy-paste working JSON blocks instead of writing syntax from scratch | **D** — They copy-paste working JSON blocks instead of writing syntax from scratch | F209. |
| Q322 *(CP-M15.1)* | F210 | multiple-choice | A Jenkins log says the Pigeon test failed at "select print". What does that mean? | **A)** The printer hardware is broken · **B)** The JSON for "select print" is invalid · **C)** The robot is Unavailable · **D)** That was the last step attempted before the runner timed out waiting for a printer payload | **D** — That was the last step attempted before the runner timed out waiting for a printer payload | F210. |
| Q323 | F211 | multiple-choice | What is the usual root cause of a "select print" failure? | **A)** Outdated screen coordinates made the robot arm miss the Print button · **B)** The printer ran out of paper · **C)** Wine crashed on the Pi · **D)** portNumber was 5555 | **A** — Outdated screen coordinates made the robot arm miss the Print button | F211. |
| Q324 | F210 | true-false | A "select print" failure in the log always means the printer hardware failed. | True · False | **False** | It's misleading: it was just the last step before the payload timeout (F210), usually stale coordinates (F211). |
| Q325 | F012 | multiple-choice | In which format are Pigeon tests written? | **A)** Gherkin · **B)** Java · **C)** XML · **D)** JSON | **D** — JSON | Declarative, platform-agnostic JSON payloads (F012). |
| Q326 | F012, F045 | true-false | Pigeon tests are declarative, platform-agnostic JSON payloads parsed by the runner. | True · False | **True** | F012, F045. |
| Q327 | F009 | multiple-choice | Which framework is used (alongside mobile runners) to test the Go SDK? | **A)** Tesseract · **B)** Laz · **C)** uia-remote · **D)** Pigeon | **D** — Pigeon | The Go SDK is tested through Pigeon and mobile runners (F009). |
| Q328 | F210, F211, F208 | match | Match each Pigeon symptom to its most likely cause. | **1.** LSTR ParseError at line 23 · **2.** FAILED at "select print" after a timeout ⟷ **A)** Arm missed Print due to outdated coordinates · **B)** Missing comma or bracket (no linter) | 1→**B**, 2→**A** | F208; F210, F211. |
| Q329 | F041, F044 | multiple-choice | Which legacy repository is built around a Language Specific Test Runner? | **A)** Pigeon · **B)** Orca · **C)** Gort · **D)** uia-remote | **A** — Pigeon | Pigeon (LSTR) = Language Specific Test Runner (F041, F044). |
| Q330 | F204 | true-false | In Pigeon, "card swipe" always becomes a physical robot action, even on the REST runner. | True · False | **False** | The runner abstracts it into an SDK payment request or a physical robot action depending on platform (F204). |

#### Quiz items — M16 Seeing the Second Screen: Station Duo, OCR, GIMP & UIA 2.3

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q331 *(CP-M16.1)* | F151 | multiple-choice | On a Station Duo, which display is exposed to ADB? | **A)** Only the CFD · **B)** Neither · **C)** Both displays · **D)** Only the primary MFD | **D** — Only the primary MFD | One terminal drives two displays but only the primary MFD is exposed to ADB (F151). |
| Q332 | F152 | multiple-choice | How well could legacy UI Automator see the Station Duo's CFD? | **A)** Fully, with a second device handle · **B)** Only in landscape mode · **C)** Not at all; it was completely blind to it · **D)** Partially, via accessibility IDs | **C** — Not at all; it was completely blind to it | F152. |
| Q333 *(CP-M16.1)* | F150 | multiple-choice | Which Orca entity holds the Station Duo workaround? | **A)** Card Profile · **B)** Screens · **C)** Robot Capabilities · **D)** Screen Compare Image | **D** — Screen Compare Image | F150. |
| Q334 | F153 | multiple-choice | What does a Screen Compare Image row store? | **A)** Spatial bounding coordinates on the CFD plus the expected text string · **B)** Button coordinates in millimetres · **C)** A Gort card path · **D)** A full-resolution screenshot | **A** — Spatial bounding coordinates on the CFD plus the expected text string | F153. |
| Q335 *(CP-M16.1)* | F154 | ordering | Order the OCR workaround's steps. | **A)** Runs Tesseract OCR · **B)** Crops it to the bounding box · **C)** Robot Controller captures a webcam screenshot · **D)** Returns a boolean match result | **C** → **B** → **A** → **D** | F154. |
| Q336 | F154 | multiple-choice | What does the OCR workaround return to the test? | **A)** A boolean match result · **B)** An HTTP 200 · **C)** A screenshot · **D)** The recognised text | **A** — A boolean match result | F154. |
| Q337 *(CP-M16.1)* | F029 | multiple-choice | Which OCR engine runs on the cropped webcam screenshots? | **A)** Ollama · **B)** Google Cloud Vision · **C)** ABBYY FineReader · **D)** Tesseract | **D** — Tesseract | Tesseract OCR (F029). |
| Q338 | F029 | true-false | Tesseract is an open-source OCR engine. | True · False | **True** | F029. |
| Q339 *(CP-M16.1)* | F155 | multiple-choice | Which change would break a Screen Compare OCR check? | **A)** Running the job from Jenkins instead of locally · **B)** A Pi reboot between tests · **C)** A 10-pixel shift of the label · **D)** Switching the merchant with Laz | **C** — A 10-pixel shift of the label | A 10-pixel shift, a capitalisation change or a typo breaks it (F155). |
| Q340 | F155 | fill-in | How many pixels of shift are enough to break the OCR suite? Type the number. | — (free text) | `10` | F155. |
| Q341 | F155 | true-false | Changing "TOTAL" to "Total" on the CFD can break a Screen Compare check. | True · False | **True** | Capitalisation changes break the brittle OCR workaround (F155). |
| Q342 | F156 | multiple-choice | Why is Screen Compare / OCR being phased out? | **A)** UI Automator 2.3 natively supports dual-screen element tracking · **B)** Tesseract's licence changed · **C)** The GPUs are needed for Ollama · **D)** Station Duos are being retired | **A** — UI Automator 2.3 natively supports dual-screen element tracking | F156. |
| Q343 *(CP-M16.1)* | F007 | multiple-choice | What does UI Automator 2.3 add that matters most to this lab? | **A)** Native dual-screen element location tracking · **B)** Built-in OCR · **C)** iOS support · **D)** Kotlin support | **A** — Native dual-screen element location tracking | F007. |
| Q344 | F030 | multiple-choice | Which tool do engineers use to get exact coordinates from a device screenshot? | **A)** Tesseract · **B)** Jenkins · **C)** GIMP · **D)** IntelliJ IDEA | **C** — GIMP | GIMP: open screenshot, draw a selection box, read coordinates (F030). |
| Q345 | F212 | multiple-choice | In Pigeon screen comparisons, where do the GIMP coordinates go? | **A)** Into the test's JSON block · **B)** Into a Java locator · **C)** Into Orca's Offsets · **D)** Into config.properties | **A** — Into the test's JSON block | F212. |
| Q346 | F212, F030 | ordering | Order a Pigeon screen-comparison set-up. | **A)** Paste them into the Pigeon JSON block · **B)** Draw a bounding box around the target text · **C)** Open the device screenshot in GIMP · **D)** Copy the coordinates | **C** → **B** → **D** → **A** | F212. |
| Q347 | F221, F151 | multiple-choice | R2-D2's CFD (Station Duo) is ADB-blind. What kind of bot is needed to interact with it? | **A)** A physical/interactive bot · **B)** Any bot with portNumber 5555 · **C)** An ADB bot · **D)** No bot; it cannot be tested | **A** — A physical/interactive bot | Physical bots are required for ADB-blind displays (F221). |
| Q348 | F156, F152 | true-false | With UI Automator 2.3, uia-remote can locate elements on the Station Duo's CFD natively. | True · False | **True** | UIA 2.3 natively supports dual-screen tracking (F007, F156). |
| Q349 | F088, F154 | multiple-choice | Where does the OCR screenshot come from? | **A)** ADB screencap of the CFD · **B)** The rig's webcam, captured by the Robot Controller · **C)** GIMP · **D)** The status tablet camera | **B** — The rig's webcam, captured by the Robot Controller | The Robot Controller captures a webcam screenshot (F154, F088). ADB can't see the CFD. |
| Q350 | F150, F153 | multiple-choice | A legacy suite must verify text on R2-D2's CFD. Which Orca record do you create? | **A)** A Card Profile · **B)** A Screen Location · **C)** A Robot Capability · **D)** A Screen Compare Image (bounding box + expected text) | **D** — A Screen Compare Image (bounding box + expected text) | The Screen Compare Image entity stores CFD bounding coordinates and expected text (F150, F153). |

#### Quiz items — M17 AI, Infrastructure & the Roadmap

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q351 *(CP-M17.1)* | F075 | multiple-choice | How many NVIDIA GPUs are in the server blade? | **A)** 8 · **B)** 1 · **C)** 2 · **D)** 4 | **D** — 4 | F075. |
| Q352 | F076 | multiple-choice | How are the blade's GPUs arranged? | **A)** Two exposed, two underneath · **B)** One per VM in different racks · **C)** All four exposed on top · **D)** Inside a separate tower | **A** — Two exposed, two underneath | F076. |
| Q353 | F077 | multiple-choice | What did the GPU blade replace? | **A)** The Intel NUCs · **B)** The Raspberry Pis · **C)** A cloud subscription · **D)** A legacy tower unit | **D** — A legacy tower unit | F077. |
| Q354 *(CP-M17.1)* | F078 | multiple-choice | What does the GPU blade host? | **A)** The VMs, Orca, Jenkins and Ollama · **B)** Only MySQL · **C)** The Raspberry Pi images · **D)** Only Ollama | **A** — The VMs, Orca, Jenkins and Ollama | F078. |
| Q355 *(CP-M17.1)* | F031 | multiple-choice | What is Ollama in this lab? | **A)** A CI server · **B)** A cloud AI API · **C)** A local LLM runner hosted on the 4-GPU server blade · **D)** An OCR engine | **C** — A local LLM runner hosted on the 4-GPU server blade | F031. |
| Q356 | F032 | multiple-choice | What does the Ollama proof of concept validate? | **A)** Power-rail voltages · **B)** Receipt layouts and tip math, from webcam streams · **C)** Pigeon JSON syntax · **D)** Jenkins logs | **B** — Receipt layouts and tip math, from webcam streams | F032. |
| Q357 | F032 | true-false | Ollama's vision checks are already the production gate replacing all assertions. | True · False | **False** | They are a proof of concept (F032). |
| Q358 *(CP-M17.1)* | F033 | multiple-choice | What was Claude evaluated for during corporate AI initiatives? | **A)** Driving the robots · **B)** Repository optimisation and automated test generation · **C)** Emulating cards · **D)** Replacing Tesseract | **B** — Repository optimisation and automated test generation | F033. |
| Q359 *(CP-M17.1)* | F022 | multiple-choice | What are the planned migration targets for Orca? | **A)** The Raspberry Pis · **B)** Kubernetes on AWS · **C)** Heroku · **D)** Docker and Google Cloud Platform | **D** — Docker and Google Cloud Platform | F022. |
| Q360 | F023, F022 | true-false | Orca already runs in Docker on GCP. | True · False | **False** | It runs on an on-prem lab VM today; Docker/GCP is planned (F023, F022). |
| Q361 | F222 | multiple-choice | Which team is the partner for the Gen 2 Software PIN Bypass? | **A)** Core OS Team · **B)** IPX Team · **C)** PayCore Team · **D)** Semi Team | **A** — Core OS Team | F222. |
| Q362 | F222 | multiple-choice | What does Gen 2 Software PIN Bypass bypass? | **A)** Physical robotics for Secure Touch PIN entry · **B)** Orca's health checks · **C)** Laz OOBE · **D)** Jenkins checkouts | **A** — Physical robotics for Secure Touch PIN entry | F222. |
| Q363 | F223 | multiple-choice | Under Gen 2, physical robotics are reserved for… | **A)** PIN entry · **B)** Non-negotiable hardware interactions such as card dipping · **C)** Every tap · **D)** Receipt printing only | **B** — Non-negotiable hardware interactions such as card dipping | F223. |
| Q364 | F018 | multiple-choice | Which repositories does GitHub host, per the reference? | **A)** Wine and Tesseract · **B)** Gort, uia-remote and pigeon · **C)** Orca only · **D)** Jenkins and Ollama | **B** — Gort, uia-remote and pigeon | F018. |
| Q365 | F013, F078 | multiple-choice | Where does Orca's MySQL-backed VM run? | **A)** On WALL-E's Pi · **B)** On a Minix box · **C)** On the shelf-mounted 4-GPU server blade · **D)** On GCP | **C** — On the shelf-mounted 4-GPU server blade | The blade hosts the VMs and Orca (F078); Orca is backed by MySQL (F013). |
| Q366 | F066, F068 | true-false | Hardware control today runs on the Windows Intel NUCs. | True · False | **False** | It was migrated off the NUCs onto Raspberry Pis (F068). |
| Q367 | F022, F023, F031, F222 | match | Match each roadmap item to its state. | **1.** Orca on an on-prem lab VM · **2.** Orca containerised in Docker on GCP · **3.** Ollama vision checks on webcam streams · **4.** Software PIN bypass with Core OS ⟷ **A)** Gen 2, in partnership · **B)** Today · **C)** Planned · **D)** Proof of concept | 1→**B**, 2→**C**, 3→**D**, 4→**A** | F023, F022, F032, F222. |
| Q368 | F075 | fill-in | How many NVIDIA GPUs are in the lab's server blade? Type the number. | — (free text) | `4` | Four NVIDIA GPUs in a shelf-mounted blade (F075). |

#### Quiz items — M18 Teams, History & the Capstone Shift

| ID | Facts | Type | Question | Options | Correct answer | Explanation |
|---|---|---|---|---|---|---|
| Q369 *(CP-M18.1)* | F157 | multiple-choice | Historically, which team developed third-party POS SDKs and remote pay display apps? | **A)** Semi Team · **B)** Sedi Team · **C)** IPX Team · **D)** PayCore Team | **A** — Semi Team | F157. |
| Q370 *(CP-M18.1)* | F158 | multiple-choice | What was the Sedi Team's role? | **A)** Built the POS SDKs · **B)** Built the robots · **C)** Built Core OS · **D)** QA: tested the Semi Team's apps with the legacy Lester framework | **D** — QA: tested the Semi Team's apps with the legacy Lester framework | F158. |
| Q371 | F052 | multiple-choice | Which team maintains USB Pay Display and Secure Network Pay Display? | **A)** Sedi Team · **B)** PayCore Team · **C)** Core OS Team · **D)** Semi Team | **D** — Semi Team | F052. |
| Q372 | F053 | multiple-choice | What do USB Pay Display and Secure Network Pay Display do? | **A)** Mirror the status tablet to a TV · **B)** Stream webcams to Orca · **C)** Emulate cards over USB · **D)** Link Merchant Facing Devices and Customer Facing Devices over USB or the local network | **D** — Link Merchant Facing Devices and Customer Facing Devices over USB or the local network | F053. |
| Q373 *(CP-M18.1)* | F160 | multiple-choice | What does IPX stand for? | **A)** Integrated POS eXecutor · **B)** Integrated Payment Experience · **C)** Interac Payment eXtension · **D)** Internal Payment eXchange | **B** — Integrated Payment Experience | F160. |
| Q374 | F161 | multiple-choice | Which of these is NOT one of the native apps IPX tests with uia-remote? | **A)** Register · **B)** LabSim Dining · **C)** Authorizations · **D)** Orders | **B** — LabSim Dining | IPX: Register, Orders, Authorizations, Sale, Transactions, Setup (F161). LabSim Dining is PayCore's (F162). |
| Q375 *(CP-M18.1)* | F162 | multiple-choice | PayCore adopted uia-remote for apps like… | **A)** USB Pay Display · **B)** Setup · **C)** LabSim Dining · **D)** Register | **C** — LabSim Dining | F162. |
| Q376 | F226 | multiple-choice | How does the PayCore Team test cards? | **A)** They don't test cards · **B)** Exhaustive back-to-back card-matrix validations: Visa, Discover, AmEx · **C)** One Visa profile only · **D)** Interac only | **B** — Exhaustive back-to-back card-matrix validations: Visa, Discover, AmEx | F226. |
| Q377 *(CP-M18.1)* | F157, F158, F160, F162, F222 | match | Match each team to what it does. | **1.** Semi Team · **2.** Sedi Team · **3.** IPX Team · **4.** PayCore Team · **5.** Core OS Team ⟷ **A)** Native apps Register, Orders, Authorizations, Sale, Transactions, Setup · **B)** QA with the Lester framework · **C)** Gen 2 Software PIN Bypass partner · **D)** POS SDKs and remote pay display apps · **E)** LabSim Dining and the full card matrix | 1→**D**, 2→**B**, 3→**A**, 4→**E**, 5→**C** | F157, F158, F161, F162/F226, F222. |
| Q378 | F159 | true-false | uia-remote was created by the Sedi Team as an upgrade to Lester. | True · False | **False** | The presenter (Morgan in-game) created uia-remote because nothing could automate native tethered setups (F159). |
| Q379 | F103, F226 | multiple-choice | Why does the PayCore Team's ROSIE sit in Unavailable? | **A)** It has no printer · **B)** It is Canadian · **C)** It's broken · **D)** So general tests don't overwrite its merchant profile | **D** — So general tests don't overwrite its merchant profile | Unavailable isolates specialised rigs like PayCore standalone setups (F103). |
| Q380 | F224, F226 | true-false | Your team and PayCore use the same card-testing strategy. | True · False | **False** | Your team uses one Visa (+ Interac); PayCore runs the full matrix (F224, F226). |
| Q381 | F110, F111 | multiple-choice | Notes show "GET http://10.42.10.13:8000/health → 502 … callus upstream 10.42.20.1:9000 unreachable". Best action? | **A)** Escalate to Jared: the Minix box running Callus is unreachable · **B)** Re-run the job until it passes · **C)** Edit config.properties · **D)** Set the robot to Available | **A** — Escalate to Jared: the Minix box running Callus is unreachable | A Minix box running Callus going offline is a typical Connection Failed cause, escalated to Jared (F110, F111). |
| Q382 | F043, F158 | multiple-choice | Lester was the legacy framework used by which team, and what did it evolve into? | **A)** The Semi Team; it evolved into uia-remote · **B)** IPX; it evolved into Orca · **C)** PayCore; it evolved into Laz · **D)** The Sedi (QA) Team; it evolved into Pigeon | **D** — The Sedi (QA) Team; it evolved into Pigeon | Sedi tested with Lester (F158); Pigeon evolved from Lester (F043). |

---

## 4. Flashcards (Field Manual spaced repetition)

### 4.0 Leitner system specification

| Box | Review interval | Promotion | Demotion |
|---|---|---|---|
| 1 | Every study session (and re-queued at the end of the same session if missed) | Correct → box 2 | — |
| 2 | 1 day | Correct → box 3 | Missed → box 1 |
| 3 | 3 days | Correct → box 4 | Missed → box 1 |
| 4 | 7 days | Correct → box 5 | Missed → box 1 |
| 5 | 14 days | Correct → stays in 5 and counts as **Mastered** | Missed → box 1 |

* **Unlocking:** when a module completes, all cards in `deck.M##` enter box 1 (due now). Deck = the earliest
  module that teaches any of the card's facts.
* **Session:** opening Field Manual → Flashcards starts a session with all due cards, oldest due first. New
  cards are capped at **20/day** and reviews at **60/session**. Leftovers roll to the next session.
* **Grading:** show front → player flips (Space) → self-grade **"Got it" (→)** / **"Missed it" (←)**. Cards whose
  back is a single token (e.g. `tethered`, `5444`, `Interac`) offer optional typed answer mode, graded with the
  fill-in rules.
* **Cross-mode sync:** any quiz item answered wrong in Academy, Arcade or certification moves every card sharing
  a fact with that item to box 1. Answering right never promotes cards; only reviews do.
* **Storage:** `localStorage["labsim.leitner.v1"] = { "<FC id>": { "box": 1-5, "due": <epoch ms>, "lastReviewed": <epoch ms>, "streak": n } }`.
  Due times use real wall-clock time, not `gameMinutes`.
* **Mastery metric:** % of unlocked cards in box ≥ 4. Shown per deck and overall. Required for CERT-R5 (§5).

| ID | Facts | Deck | Front | Back |
|---|---|---|---|---|
| FC001 | F089 | `deck.M01` | What is mounted on the front of every touch robot? | A front-mounted status tablet (the robot's dashboard). |
| FC002 | F233 | `deck.M01` | What does WALL-E's tablet header show? | Robot name (WALL-E), LabSim logo, "Status: OK", "Brainbox v6". |
| FC003 | F234 | `deck.M04` | Name the status tablet's three tabs. | Robot · Robot Control · Motion Control. |
| FC004 | F235 | `deck.M04` | Motion Control button groups? | Steppers (Enable/Disable) · Park (Park All/XY/X/Y) · Dip (In/Out) · Tap (In/Out) · Phone (Forward/Back/Push Power Button) · Solenoid (Down/Up/Lower/Raise). |
| FC005 | F236 | `deck.M01` | What's on a touch robot's POWER panel? | Two green LEDs and two toggles: MAIN and MOTOR. |
| FC006 | F115 | `deck.M01` | How many rigs does Orca's Robot entity track? | 40+ rigs (and their status flags). |
| FC007 | F230 | `deck.M01` | What happens to the control dashboard while a test is active? | It locks out external users. |
| FC008 | F072, F073 | `deck.M01` | Who makes the black shelf fixtures, and how are they designed? | Prusa and Bambu Lab 3D printers; drafted in CAD from simple geometric shapes. |
| FC009 | F054 | `deck.M02` | MFD / CFD? | Merchant Facing Device / Customer Facing Device. |
| FC010 | F055 | `deck.M02` | Station series targets? | Station 2018, Station 2, Station Duo (Duo 1, Duo 2, upcoming Duo 3). |
| FC011 | F056 | `deck.M02` | Mini series targets? | Mini 2, Mini 3, upcoming Mini 4. |
| FC012 | F058 | `deck.M02` | Flex series targets? | Flex 1, Flex 2, Flex 3, Flex 4, Flex Pocket. |
| FC013 | F059, F060 | `deck.M02` | Which devices share one testing profile, and what's different? | Flex 3, Flex 4, Flex Pocket. The Pocket omits the printer block. |
| FC014 | F057 | `deck.M02` | Hot-swap for a printerless Station Duo 2? | Mini 3. |
| FC015 | F061 | `deck.M02` | Which terminal is for Canada / Westers test beds? | LabSim Compact. |
| FC016 | F062 | `deck.M02` | Which devices are upcoming? | Station Duo 3 and Mini 4. |
| FC017 | F237 | `deck.M02` | What do the tethered test-bed labels encode? | Rig · role · environment, e.g. MEGATRON MFD DEV1, OPTIMUS CFD STG. |
| FC018 | F238, F239 | `deck.M02` | What sits between and below the tethered screens? | Between: USB "SmartStripe Probe" dongles (green LEDs). Below: 3D-printed docks with LabSim connectivity hubs (Ethernet, USB, power). |
| FC019 | F074 | `deck.M03` | What does the Mean Well do? | Converts 120V AC wall power to a central 24V DC rail. |
| FC020 | F085 | `deck.M03` | What powers the Intel NUCs? | 12V DC from a step-down regulator. |
| FC021 | F086 | `deck.M03` | What powers the Raspberry Pis? | 5V DC, 10A from a step-down regulator. |
| FC022 | F087 | `deck.M03` | What protects the 12V and 5V lines? | Inline fuses. |
| FC023 | F227 | `deck.M03` | Full power chain? | 120V AC → Mean Well → 24V DC rail → step-down regulators → 12V (NUCs) and 5V 10A (Pis), with inline fuses. |
| FC024 | F228 | `deck.M03` | What do LabSim devices draw? | An irregular 18V. |
| FC025 | F229 | `deck.M03` | Where do LabSim terminals and Collis probes get power? | Commercial AC power strips. Never the custom DC rails (prevents frying). |
| FC026 | F240 | `deck.M04` | Gantry parts? | 2020 aluminium extrusion, NEMA-17 stepper + GT2 pulley, V-slot wheels, carriage with a blue push-pull solenoid. |
| FC027 | F079 | `deck.M04` | Stepper precision? | Sub-millimetre. |
| FC028 | F080 | `deck.M04` | What taps the screen? | A remote-firing solenoid; its plunger drops. |
| FC029 | F082 | `deck.M04` | What sets the (0,0) origin? | Physical limit switches. |
| FC030 | F083, F084 | `deck.M04` | Motor controller boards? | Custom 25-pin PCBs, printed in Hong Kong. |
| FC031 | F241 | `deck.M04` | How does the card get into the chip slot? | A rotating dip arm (sector gear "63") carries a flat white ribbon card (Collis insert). |
| FC032 | F231 | `deck.M04` | What happens if you push a robot arm by hand? | The magnetic lock breaks and the top status banner turns yellow. |
| FC033 | F232 | `deck.M04` | What does Park All do? | Drives the steppers to the limit switches at (0,0), clears errors, banner turns green. |
| FC034 | F090, F091 | `deck.M04` | Rails and wiring per touch robot? | 10 ft cut aluminium rails; ~130 ft of wiring. |
| FC035 | F092, F093 | `deck.M04` | Solder points and hardware per touch robot? | ~300 manual solder points; 200+ nuts and bolts, 2.5 mm and 5 mm. |
| FC036 | F088 | `deck.M04` | Source of camera streams and OCR screenshots? | The rig webcams. |
| FC037 | F064 | `deck.M05` | What is the Robot Controller? | A Raspberry Pi, one per shelf (the "Robot Pi"). |
| FC038 | F063 | `deck.M05` | Cost of a lab Pi? | About $50. |
| FC039 | F065 | `deck.M05` | Robot Pi duties? | ADB routing, camera streams, stepper motors, solenoids, Wine card-programming emulation. |
| FC040 | F019, F020 | `deck.M05` | Pi OS and why? | Linux, to isolate hardware control loops from corporate Windows machines. |
| FC041 | F021 | `deck.M05` | What does Wine do on the Pi? | Emulates the Windows-only card-programming software layers. |
| FC042 | F066 | `deck.M05` | What are the NUCs and Minix boxes? | Local Windows execution machines in the lab. |
| FC043 | F067, F068 | `deck.M05` | Why did hardware control leave the NUCs? | corporate security-monitoring packages exhausted their disks, so control moved to Raspberry Pis. |
| FC044 | F036 | `deck.M06` | Orca = ? | Orchestrator. |
| FC045 | F098 | `deck.M06` | Controller vs Executor? | Orca = Controller. Jenkins = Executor. |
| FC046 | F037, F002 | `deck.M06` | What is Orca built as? | An on-premise Spring Boot monolith (Java). |
| FC047 | F003, F004 | `deck.M06` | What did JHipster do for Orca? | Scaffolded it via an interactive questionnaire, generating the frontend UI, Spring Boot REST endpoints and MySQL schemas. |
| FC048 | F013, F014 | `deck.M06` | Orca's database, and what's in it? | MySQL: hardware states, merchant profiles, screen-coordinate tables (robots, devices, screens, card profiles, merchants). |
| FC049 | F023 | `deck.M06` | Where does Orca run today? | A local on-premise lab VM (on the GPU blade). |
| FC050 | F099 | `deck.M06` | Orca health-check cadence? | Every 5 minutes, a synchronized background thread pings every Pi's Robot Controller. |
| FC051 | F100 | `deck.M06` | The 5 robot statuses? | Available, Unavailable, Offline, Connection Failed, Reserved. |
| FC052 | F101 | `deck.M06` | Available? | Online, healthy, open to general pipeline checkouts. |
| FC053 | F102 | `deck.M06` | Unavailable: how do you use it? | Only by passing the robot's exact unique name in the job parameters. |
| FC054 | F103 | `deck.M06` | Why Unavailable? | Isolates specialised rigs (e.g. PayCore standalone) so general tests don't overwrite their merchant profiles. |
| FC055 | F104 | `deck.M06` | After a named job on an Unavailable robot finishes? | Orca automatically resets it to Unavailable. |
| FC056 | F105, F106 | `deck.M06` | Offline? | Manual placeholder while building a rig or assembling data profiles; health checks are skipped. |
| FC057 | F107, F108 | `deck.M06` | Connection Failed: trigger and effect? | 5-minute REST ping drops or returns non-200; robot is blocked from checkouts. |
| FC058 | F109 | `deck.M06` | Where are Connection Failed details? | Orca's Notes section: exact endpoint attempted and error text. |
| FC059 | F110, F111 | `deck.M06` | Typical Connection Failed causes and escalation? | Crashed Pi board or Minix box running Callus offline. Escalate to Jared. |
| FC060 | F112, F113 | `deck.M06` | Reserved? | Set manually when testing locally from your workstation; blocks Jenkins pipelines and health-check overrides. |
| FC061 | F094, F095 | `deck.M06` | What does Jenkins do in the flow? | Triggers the pipeline, injects env vars into the test runner, checks out a robot from Orca. |
| FC062 | F096 | `deck.M06` | How does the runner request taps and cards? | REST calls to Orca: xy_touch and card swipe/dip/tap. |
| FC063 | F097 | `deck.M06` | Card emulation chain? | Windows/Minix box running Callus → ribbon cable → Collis probe → LabSim card reader. |
| FC064 | F114 | `deck.M07` | How many core Orca schemas? | 7 (JHipster entities). |
| FC065 | F116 | `deck.M06` | Who built the robot-list filter UI? | Tate. |
| FC066 | F117, F118 | `deck.M07` | Name vs Human Readable Name? | Name = system identifier. Human Readable Name = display string pushed to the status tablet. |
| FC067 | F119, F120 | `deck.M07` | Why is Device separate from Robot? | Hardware upgrades (e.g. Flex 1 → Flex 2) leave legacy configs intact for quick rollback. |
| FC068 | F121 | `deck.M07` | Device Type stores? | Device dimensions, layout metrics, internal string definitions (an enum). |
| FC069 | F122 | `deck.M07` | Why are Jenkins env vars ALL CAPS? | They must match the Device Type enum strings. |
| FC070 | F123 | `deck.M07` | Robot ADB Service URL routes to? | The Pi controller. |
| FC071 | F124 | `deck.M07` | Camera Stream URL scope? | Dedicated per Pi, or shared across 4 rigs. |
| FC072 | F125 | `deck.M07` | Hardware-specific URLs per robot? | Dip, Tap, Swipe. |
| FC073 | F126, F128 | `deck.M07` | When is a rig tethered in Orca? | When the MFD field is populated (USB Tethered Device Configuration: MFD/CFD relations). |
| FC074 | F127 | `deck.M07` | Examples of tethered/nested setups? | Station 2 tethered to a Mini 2; nested Mini 3 rigs. |
| FC075 | F129, F130 | `deck.M07` | Offsets? | Legacy mm adjustments for imprecise limit switches; mostly deprecated since Jared calibrated to true (0,0). |
| FC076 | F131 | `deck.M08` | What does Robot Capabilities do? | Controls how Orca matches pipeline requests to physical hardware. |
| FC077 | F132, F133 | `deck.M08` | Dynamic JSON lookups? | SDK frameworks (overseen by David); capabilities are JSON metadata in each test definition, parsed at runtime. |
| FC078 | F134 | `deck.M08` | Non-dynamic lookups? | Traditional UI Automator suites; capabilities hardcoded in the pipeline script. |
| FC079 | F135 | `deck.M08` | Which scripts use both lookup styles? | Contact Canada scripts on Westers test beds. |
| FC080 | F137 | `deck.M08` | Can't see all Merchant Config fields? | UI table display limits: click Edit on the row. |
| FC081 | F138, F139 | `deck.M08` | Tate's Merchant Config additions and why? | App ID, App Secret, API Key, exported as runtime env vars for the Go SDK. |
| FC082 | F046, F047 | `deck.M08` | Laz Automation? | Zero-touch OOBE provisioning: de-provision, wipe caches, step the setup wizard, swap merchants mid-suite. |
| FC083 | F051 | `deck.M08` | Ubi Platform? | Internal routing platform used when jobs dynamically switch merchant configs. |
| FC084 | F008, F009 | `deck.M08` | Go SDK support and testing? | Custom extensions in Orca; tested through Pigeon and mobile runners. |
| FC085 | F141 | `deck.M09` | Screens entity? | Discrete UI layouts within a transaction flow per device architecture (e.g. cash-discount tender prompt). |
| FC086 | F142 | `deck.M09` | Screen Locations entity? | Exact button placements as relative X/Y in millimetres. |
| FC087 | F143, F144 | `deck.M09` | How does xy_touch work? | Script sends screen name + button string; Orca looks up mm coordinates; Pi fires an ADB touch or a physical probe tap. |
| FC088 | F217, F218 | `deck.M09` | ADB bots: limits? | Purely programmatic: no physical touch, no PINs. Only PIN-bypass merchant configs. |
| FC089 | F219, F220, F221 | `deck.M09` | When do you need a physical bot? | Canadian payment flows (physical PIN entry) and ADB-blind displays. They have mechanical touch probes. |
| FC090 | F213, F214 | `deck.M09` | The receipt QR incident? | "Scan for receipt" shifted buttons down a few mm, breaking ruler-measured coordinates for 48 hours until Jared merged a coordinate PR. |
| FC091 | F215, F216 | `deck.M09` | Lasting effect of the QR feature? | A conditional 5th option, so Orca keeps separate 4-option and 5-option receipt maps per device profile. |
| FC092 | F145, F146 | `deck.M10` | Swipe profiles? | Raw Track Data text in MySQL, extracted with a hardware card-reader utility. |
| FC093 | F147 | `deck.M10` | Dip and Tap profiles? | File paths to card definitions in Gort. |
| FC094 | F148, F149 | `deck.M10` | How do Gort card files get used? | A scheduled job clones them onto Windows boxes; during a run Callus maps the path and loads the virtual card. |
| FC095 | F048, F049 | `deck.M10` | Callus aliases and host? | "Callers" / "Collos". Runs on local Windows/Minix boxes. |
| FC096 | F050 | `deck.M10` | What does Callus do? | Reads card-profile paths from Gort and drives the Collis probes. |
| FC097 | F069, F070 | `deck.M10` | Collis probes? | High-cost proprietary card emulators (UL Transaction Security) on rear ribbon cables. |
| FC098 | F071 | `deck.M10` | What can a Collis probe simulate? | Mag-stripe swipe, EMV chip dip, contactless NFC tap. |
| FC099 | F034, F035 | `deck.M10` | Gort? | Core monorepo: testing ecosystem, configuration modules, Dip/Tap virtual card definitions. |
| FC100 | F224, F225 | `deck.M10` | Your team's card philosophy? | One reliable Visa profile, plus Canadian Interac for regional flows. |
| FC101 | F226 | `deck.M18` | PayCore's card philosophy? | Exhaustive back-to-back matrices: Visa, Discover, AmEx. |
| FC102 | F015, F016 | `deck.M11` | Jenkins? | The Executor: triggers pipelines and injects runtime env vars. |
| FC103 | F017 | `deck.M11` | How are legacy Jenkins jobs organised? | By platform: Java jobs separate from iOS jobs. |
| FC104 | F189 | `deck.M11` | Who sets config values in CI? | Jenkins injects them dynamically. |
| FC105 | F024, F025 | `deck.M12` | What is ADB used for? | Inspecting XML UI hierarchies, locating elements, dispatching programmatic touch events. |
| FC106 | F026, F198 | `deck.M12` | Lab ADB port? | 5444 (portNumber=5444). |
| FC107 | F199, F200 | `deck.M12` | Why not 5555? | It's the ADB default and caused collisions: scripts controlled coworkers' desk devices. |
| FC108 | F005, F006, F007 | `deck.M13` | uia-remote's automation engine? | Android UI Automator 2.3, for native dual-screen element tracking. |
| FC109 | F001 | `deck.M06` | Primary language for Orca and uia-remote? | Java (Oracle Java). |
| FC110 | F027, F028 | `deck.M13` | IntelliJ IDEA's role? | Primary IDE: import repos, configure local properties, run test suites. |
| FC111 | F018 | `deck.M13` | Where are the repos hosted? | GitHub: Gort, uia-remote, pigeon (branches and PRs). |
| FC112 | F159 | `deck.M13` | Why was uia-remote created? | No framework could automate native tethered setups (Station-to-Mini, Mini-to-Mini, Station Duo). |
| FC113 | F163, F010 | `deck.M13` | uia-remote layout? | Standard Android/Maven structure under app/src/. |
| FC114 | F164 | `deck.M13` | app/src/main? | Production/application registration code. QA never modifies it. |
| FC115 | F165 | `deck.M13` | app/src/test? | Local unit tests + the multi-device execution runner. |
| FC116 | F166 | `deck.M13` | app/src/androidTest? | Instrumented tests on Android hardware: databases, pageobjects, testactions. |
| FC117 | F167, F168, F169 | `deck.M13` | The three androidTest packages? | databases (DB logic) · pageobjects (POM screen classes) · testactions (tests + assertions). |
| FC118 | F170, F171 | `deck.M13` | How does uia-remote drive two devices? | UIA talks to one device at a time, so the runner (test) hops between device handles: MFD runs X, CFD runs Y, loop. |
| FC119 | F172, F173 | `deck.M13` | Screen class rule? | Every screen, pop-up or window gets its own Java class extending BaseTest. |
| FC120 | F174 | `deck.M13` | What does BaseTest provide? | Global setup, teardown, instance variables. |
| FC121 | F175, F176 | `deck.M13` | Zone 1 vs Zone 2? | Zone 1: element locators. Zone 2: helper/action methods (device-specific behaviour). |
| FC122 | F177 | `deck.M13` | open(String appName) scrolling? | Flex: vertical. Mini/Station: horizontal. |
| FC123 | F178, F179, F180 | `deck.M13` | Mandatory screen methods? | waitForScreen() (wait for render) and isScreenPresent() (boolean: in focus?). |
| FC124 | F182 | `deck.M14` | Test safe state? | Start from HomeScreen; teardown forces back to HomeScreen. |
| FC125 | F183, F184 | `deck.M14` | Tax test Step 1 (MFD_O1)? | Open Register, add "Tax Item 5", click "Review Order"; Orca routes to Callus to load a simulated swipe card. |
| FC126 | F185 | `deck.M14` | Tax test Step 2 (CFD_O1)? | On the Customer display, assert subtotal, calculated tax, grand total. |
| FC127 | F186, F187 | `deck.M14` | Tax test Steps 3 and 4? | MFD_O2: click "Pay" and "Charge". Step 4: payment prompt finalised on the Customer display. |
| FC128 | F188 | `deck.M14` | Local runs: who sets config.properties? | You, manually. |
| FC129 | F190 | `deck.M14` | runType for multi-device? | tethered |
| FC130 | F191, F192, F193 | `deck.M14` | MFD/CFD IP keys, and the Duo rule? | merchantFacingDeviceIp / customerFacingDeviceIp. On a Station Duo both are the same IP. |
| FC131 | F194, F195 | `deck.M14` | serial and deviceType? | serial = primary terminal's hardware serial. deviceType = Mini / Flex / Station (layout/scroll logic). |
| FC132 | F196 | `deck.M14` | theme? | Locked to avocado (legacy toggles deprecated). |
| FC133 | F197 | `deck.M14` | kernelType? | Locked to CPA (Core Payments Application), replacing SPA (Secure Processor Application). |
| FC134 | F201 | `deck.M14` | Extra config keys? | Device unlock passcodes, backend testing environment targets, active robot's registration name. |
| FC135 | F041, F043, F042 | `deck.M15` | Pigeon? | Legacy repo (aka LSTR) evolved from Lester; name puns on "pidgin language". |
| FC136 | F044, F202 | `deck.M15` | LSTR and its runners? | Language Specific Test Runner: REST, Android, Windows, iOS. |
| FC137 | F203 | `deck.M11` | Which runner is rarely touched? | iOS, though iOS Go testing is active. |
| FC138 | F012, F205 | `deck.M15` | Pigeon test anatomy? | Raw JSON: test name, connection type, supported platforms, array of test actions. |
| FC139 | F204 | `deck.M15` | How does Pigeon handle "card swipe"? | Runner abstracts it into an SDK payment request or a physical robot action per platform. |
| FC140 | F206, F207 | `deck.M15` | Pigeon platforms and actions? | 4 to 5 platforms at once; actions create requests, pass parameters, store outputs. |
| FC141 | F208, F209 | `deck.M15` | Pigeon's JSON pain? | No linter: hunt missing commas/brackets by hand; copy-paste known-good blocks. |
| FC142 | F210, F211 | `deck.M15` | Log says failed at "select print"? | Last step before the printer-payload timeout. Usually stale coordinates made the arm miss Print. |
| FC143 | F212, F030 | `deck.M16` | GIMP's job? | Open screenshot, draw bounding box around text, copy exact coordinates (into Pigeon JSON / screen compare). |
| FC144 | F150, F151, F152 | `deck.M16` | The Station Duo problem? | One terminal, two displays; only the MFD is on ADB. Legacy UIA was blind to the CFD. |
| FC145 | F153, F154, F029 | `deck.M16` | The OCR workaround? | Stores CFD bounding box + expected text; Pi captures webcam shot, crops, runs Tesseract, returns boolean. |
| FC146 | F155 | `deck.M16` | Why is OCR brittle? | A 10-pixel shift, a capitalisation change or a typo breaks it. |
| FC147 | F156 | `deck.M16` | Why is OCR being phased out? | UI Automator 2.3 natively supports dual-screen element tracking. |
| FC148 | F075, F076, F077 | `deck.M17` | The GPU blade? | 4 NVIDIA GPUs (two exposed, two underneath) in a shelf-mounted blade that replaced a legacy tower. |
| FC149 | F078 | `deck.M17` | What does the blade host? | VMs, Orca, Jenkins and Ollama. |
| FC150 | F031, F032 | `deck.M17` | Ollama? | Local LLM runner on the GPU blade; PoC vision checks of webcam streams for receipt layouts and tip math. |
| FC151 | F033 | `deck.M17` | Claude? | Evaluated in corporate AI initiatives for repository optimisation and automated test generation. |
| FC152 | F022 | `deck.M17` | Orca's planned migration? | Containerise with Docker, move to Google Cloud Platform. |
| FC153 | F222, F223 | `deck.M17` | Gen 2 Software PIN Bypass? | With the Core OS Team: software Secure Touch PIN entry; robots reserved for non-negotiables like card dipping. |
| FC154 | F157, F158 | `deck.M18` | Semi and Sedi teams? | Semi built third-party POS SDKs and remote pay display apps; Sedi (QA) tested them with Lester. |
| FC155 | F052, F053 | `deck.M18` | USB Pay Display / Secure Network Pay Display? | Semi Team apps linking MFDs and CFDs over USB or the local network. |
| FC156 | F160, F161 | `deck.M18` | IPX? | Integrated Payment Experience: uia-remote tests Register, Orders, Authorizations, Sale, Transactions, Setup. |
| FC157 | F162 | `deck.M18` | PayCore and uia-remote? | PayCore adopted it for apps like LabSim Dining. |
| FC158 | F140 | `deck.M08` | Merchant Config + Laz? | They work together for dynamic OOBE merchant switching. |
| FC159 | F011 | `deck.M08` | Format for Orca runtime capability lookups? | JSON. |

---

## 5. Certification

### 5.1 Ranks

Curriculum ranks are listed below. If the gameplay doc defines career-rank names, map them 1:1 by order. Each
exam has a **written** part (drawn from the quiz bank, † items excluded) and a **practical** part (live tasks in the sim, no
hints, no Force-health-check button, time scale 1 unless stated). Both parts must pass. **Critical items** are
must-pass: the exam always includes one quiz item for each listed critical fact, and missing any of them fails
the written part whatever the score.

| Rank | Title | Eligibility | Exam | Written | Practical | Pass marks |
|---|---|---|---|---|---|---|
| R1 | Lab Trainee | M01–M05 complete | `CERT-R1` | 30 items · 20 min | 3 tasks · 15 min total | Written ≥ 80 % (24/30) + all critical; practical 3/3 |
| R2 | Rig Technician | R1 + M06–M10 | `CERT-R2` | 40 items · 25 min | 4 tasks · 25 min | Written ≥ 80 % (32/40) + all critical; practical 4/4 |
| R3 | Automation Engineer | R2 + M11–M16 | `CERT-R3` | 45 items · 30 min | 4 tasks · 35 min | Written ≥ 85 % (39/45) + all critical; practical 4/4 |
| R4 | Senior Automation Engineer | R3 + M17–M18 | `CERT-R4` | 60 items · 45 min | Mixed incident shift: 5 incidents in 20 game-min | Written ≥ 85 % (51/60) + all critical; shift: all 5 resolved, ≤ 1 strike |
| R5 | Lab Lead | R4 + Leitner mastery ≥ 90 % of all cards in box ≥ 4 + one Arcade "Full Shift" score ≥ 80 % | `CERT-R5` | 80 items · 60 min | Hard shift: 8 incidents in 30 game-min, no HUD objective text | Written ≥ 92 % (74/80) + all critical; shift: all 8 resolved, 0 strikes |

**With distinction:** written ≥ 95 % and practical completed with no strikes. Awards a gold seal on the rank
badge.

### 5.2 Written-exam blueprints (draw rules)

General draw rules for every exam: sample without replacement; avoid items the player saw in their previous
attempt of the same exam when the pool allows; exclude † items; at least 1 item of every type
(MC, TF, ordering, match, fill-in); MC ≤ 65 % of the paper; options reshuffled; one item per fact unless the
quota can't be met otherwise.

| Exam | Module quotas (items) | Tier mix | Critical facts (always included, must be correct) |
|---|---|---|---|
| `CERT-R1` | M01 4 · M02 6 · M03 6 · M04 8 · M05 6 | core 75 % · supporting 25 % · trivia 0 | F229 (terminals & Collis on AC strips) · F232 (Park All) · F086 (Pis on 5V 10A) · F231 (yellow banner) |
| `CERT-R2` | M06 12 · M07 9 · M08 7 · M09 7 · M10 5 | core 75 % · supporting 25 % | F100 (5 statuses) · F102 (named Unavailable) · F107 + F111 (Connection Failed → Jared) · F113 (Reserved) · F120 (device decoupling) · F218 (ADB bots: PIN-bypass merchants) |
| `CERT-R3` | M11 6 · M12 5 · M13 12 · M14 10 · M15 6 · M16 6 | core 80 % · supporting 20 % | F198 + F200 (5444, collisions) · F164 (never modify main) · F180 (mandatory screen methods) · F193 (Duo same IP) · F197 (CPA) · F210 (misleading "select print") |
| `CERT-R4` | M01–M18: 3 each (54) + 6 extra core from the player's weakest modules (lowest Leitner mastery) | core 80 % · supporting 20 % | F098 · F229 · F232 · F198 · F107 · F217 · F122 · F171 |
| `CERT-R5` | M01–M18: 4 each (72) + 8 trivia from any module | core 65 % · supporting 25 % · trivia 10 % | All R1–R4 critical facts (each appears once) |

Module quotas take precedence over the tier-mix target: draw the quota per module, choosing tiers to get as close to the mix as the pool allows. Critical items count towards their module's quota.

### 5.3 Practical-exam blueprints

| Exam | Task ID | Setup (seeded fault) | Player must | Pass condition | Facts |
|---|---|---|---|---|---|
| CERT-R1 | P1-1 | A random touch robot's arm is pushed (yellow banner) | Walk to the right rig, Park All | Banner green within 3 game-min; no other buttons pressed first | F231, F232, F235 |
| CERT-R1 | P1-2 | A rack's 5V fuse is blown **and** a new LabSim + Collis probe await power | Find the dead Pis, test and replace the fuse, plug the LabSim and probe into the AC strip | Pis powered; both devices on AC strip; zero wrong-socket attempts | F086, F087, F227, F228, F229 |
| CERT-R1 | P1-3 | None | SSH into a named Pi and report its health endpoint result | `curl` returns 200; the answer typed in the exam form = `200` | F064, F019, F099 |
| CERT-R2 | P2-1 | A random rig's Pi is unplugged | Detect Connection Failed, read Notes, escalate to Jared with the endpoint | Correct escalation choice; status never manually overridden | F107–F111 |
| CERT-R2 | P2-2 | JOHNNY-5-style hardware swap on a random rig | Create Device, relink Robot Device, keep old Device; fix Human Readable Name | Old device untouched; robot linked; tablet shows the right HRN | F117–F120 |
| CERT-R2 | P2-3 | A firmware drop adds a conditional receipt option on one device type | Measure, create the 5-option map, keep the 4-option map, PR → merge | Both maps exist, coordinates ±0.5 mm | F213–F216, F142 |
| CERT-R2 | P2-4 | Canadian PIN job queued with an ADB bot selected | Re-target to the Compact touch robot and choose Interac | Job runs on a physical bot with `INTERAC_CA_DIP` | F217–F220, F225 |
| CERT-R3 | P3-1 | Broken `config.properties` (port 5555, wrong theme/kernel, empty CFD IP) for a tethered rig | Fix the file, reserve the rig, run TaxTest, release the rig | Validator 11/11; test passes; rig Reserved during run and Available after; no coworker device touched | F188–F201, F112, F183–F187 |
| CERT-R3 | P3-2 | Pigeon test with a missing bracket, then a "select print" timeout | Fix the JSON; diagnose stale coordinates via camera; approve coordinate PR | Build green; diagnosis choice correct | F208–F211 |
| CERT-R3 | P3-3 | Station Duo test using Screen Compare fails after a 10 px shift | Replace it with a UIA 2.3 dual-screen assertion; both IPs equal in config | Run green with the layout shifted | F151–F156, F193 |
| CERT-R3 | P3-4 | New screen class without mandatory methods + Flex scroll bug | Add `waitForScreen()` / `isScreenPresent()`; fix `open()` | 3 consecutive green runs on a Flex and a Mini | F177–F180 |
| CERT-R4 | P4 shift | 5 incidents drawn from §6 (≥ 1 hardware, ≥ 1 Orca, ≥ 1 code/config) | Resolve all | All resolved in 20 game-min, ≤ 1 strike (wrong fix, fried hardware, status override, coworker device touched) | per incident |
| CERT-R5 | P5 shift | 8 incidents drawn from §6, two simultaneous at minute 10, no HUD objective text | Resolve all | All resolved in 30 game-min, 0 strikes | per incident |

### 5.4 Retakes and records

* **Fail:** results screen lists every missed item with its explanation and fact ID. The missed facts' cards
  drop to box 1. A retake unlocks after **10 real minutes** *and* one Leitner session containing those cards.
  Retakes are unlimited.
* **Record:** best written %, best practical time, attempts and distinction are stored in
  `localStorage["labsim.cert.v1"]`.
* **Certificates:** a passed rank shows a printable in-game certificate† (name, rank, date, written %,
  "with distinction") in the Field Manual.

---

## 6. Arcade hand-off: incidents and drills unlocked by modules

These are the curriculum's proposed contents for Arcade. The gameplay doc owns timers, scoring and combos. Each
incident must only be resolvable by applying the listed facts.

| ID | Unlocked by | Trigger (seeded fault) | Correct resolution | Wrong-move strikes | Facts |
|---|---|---|---|---|---|
| `INC-FUSE-5V` | M03 | A rack's Pis go dark | Multimeter the 5V inline fuse, replace it | Replacing the 12V fuse; swapping Pis | F086, F087, F227 |
| `INC-WRONG-OUTLET` | M03 | New LabSim / Collis probe must be powered | Plug into the commercial AC strip | Any DC rail socket (fried hardware) | F228, F229 |
| `INC-MAGLOCK` | M04 | Arm bumped, yellow banner | Park → Park All | Steppers Disable; ignoring it past timer | F231, F232 |
| "Park It!" drill | M04 | 10 rigs go yellow in sequence | Park All on each, fastest wins | Wrong button | F231, F232, F235 |
| `INC-CONN-FAILED` | M06 | Pi unplugged / crashed, or Minix Callus down | Read Notes, escalate to Jared with the right cause | Setting Available manually | F107–F111 |
| `INC-RESERVED-BLOCK` | M06 | Your local run collides with a CI checkout | Reserve the rig before running locally | Running locally on an Available rig | F112, F113 |
| `INC-UNAVAILABLE-NAMED` | M06 | Job must run on a PayCore rig | Pass the exact robot name; don't change its status | Setting the PayCore rig Available | F102–F104 |
| `INC-HRN-TYPO` | M07 | Tablet shows a misspelt robot | Fix Human Readable Name (not Name) | Editing Name | F117, F118 |
| `INC-DEVICE-UPGRADE` | M07 | Hardware swapped on a rig | New Device + relink; keep old | Editing old Device in place | F119, F120 |
| `INC-TETHER-MISSING` | M07 | Tethered rig running as standalone | Populate MFD/CFD | Changing runType in Orca (no such field) | F126, F128 |
| `INC-MERCHANT-KEY` | M08 | Go SDK build fails: missing API Key | Merchant Config → Edit → fill API Key | Hardcoding the key in the job | F137–F139 |
| `INC-CAPABILITY-MISMATCH` | M08 | Printer test matched to Flex Pocket | Add printer capability (dynamic JSON) | Setting the Pocket Offline | F059, F060, F131, F132 |
| `INC-COORD-DRIFT` | M09 | UI update shifts buttons | Measure, new map, PR → merge | Using Offsets to compensate | F129, F130, F213–F216 |
| `INC-PIN-ON-ADB-BOT` | M09 | PIN test scheduled on ADB bot | Re-target to a physical bot | Changing merchant to bypass PIN for a Canadian test | F217–F221 |
| `INC-CALLUS-DOWN` | M10 | Dip fails, Callus box unreachable | Escalate to Jared (Callus box), not a code fix | Editing card paths | F049, F050, F110 |
| `INC-CARD-PATH` | M10 | Dip profile path points at a missing Gort file | Fix the path to the Gort file; wait for/force the clone | Pasting Track Data into a dip profile | F145, F147, F148 |
| `INC-ENV-CASE` | M11 | `DEVICE_TYPE=mini_3` | Use `MINI_3` | Editing the enum in Orca | F121, F122 |
| "ADB Speedrun" drill | M12 | Tap a named element on a random device | connect :5444 → dump → tap | Port 5555 | F024–F026, F199 |
| "Where Does It Go?" drill | M13 | Files rain down | Sort to main/test/androidTest packages | Anything into main | F164–F169 |
| "POM Doctor" drill | M13 | Broken screen classes | Add mandatory methods, fix scroll direction, put locators in Zone 1 | — | F173–F180 |
| `INC-PORT-COLLISION` | M14 | Coworker device acting up | Fix portNumber=5444 | Unplugging the coworker device | F198–F200 |
| `INC-CONFIG-LOCKS` | M14 | Local run fails on theme/kernel | `theme=avocado`, `kernelType=CPA` | `SPA`, any other theme | F196, F197 |
| `INC-DUO-SAME-IP` | M14 | Duo test can't find CFD | Set both IPs to the same address | Setting CFD IP to the Pi | F193 |
| "Comma Hunt" drill | M15 | Pigeon JSON with 1–3 syntax errors | Fix by hand / paste a known-good block | — | F208, F209 |
| "Log Detective" drill | M15 | Misleading Jenkins logs | Pick the true root cause | — | F210, F211 |
| `INC-OCR-BRITTLE` | M16 | Screen Compare false after a 10 px shift / case change | Migrate to a UIA 2.3 assertion (or re-measure in GIMP for legacy Pigeon) | Disabling the check | F153–F156, F212 |
| `INC-DUO-BLIND` | M16 | Engineer asks for an ADB tap on the Duo CFD | Use a physical bot or a UIA 2.3 dual-screen locator | ADB-only approach | F151, F152, F221 |

---

## 7. Required sim affordances (checklist for the world, sim and app implementers)

Every lesson step above depends on these behaviours. Each line names the module(s) that use it.

**World / 3D**
* Status tablets: tabs Robot / Robot Control / Motion Control; every Motion Control button animates the rig;
  lock overlay during active tests; banner colours green/yellow; Human Readable Name from Orca (M01, M04, M07, M18).
* Enclosure door; draggable carriage that breaks the magnetic lock; limit-switch click on homing (M04).
* Solenoid tap and dip-arm animations driven by the sim (xy_touch, card dip), visible in-world and on `app.camera` (M04, M09, M10).
* Power: clickable trace nodes, multimeter readings, replaceable fuse, plug-in sockets with spark FX on DC (M03).
* Pi power lead unplug/replug (M06). Crouch to see under the GPU blade (M17).
* Ruler measurement snapping to the device top-left, giving mm readings (M09).
* Drag-and-drop boards: whiteboard diagram, device family trays, bolt bins, roadmap board, history match (M02, M04, M06, M17, M18).
* Device screens render the sim's UI state (Register, Tax Item 5, totals, setup wizard, PIN pad, receipt options) (M08, M09, M14, M16).

**Orca (`app.orca`)**: Robots list with status filter (Tate's UI); robot form (Name, Human Readable Name, Status,
Robot Device, Device Type, Robot ADB Service URL, Camera Stream URL, Dip/Tap/Swipe URLs, MFD, CFD, Offset X/Y,
Notes); Check out button with the block toast; Force health check (tutorial) + health log with `SKIPPED (Offline)`;
Devices CRUD; Robot Capabilities view + Match preview; Merchant Config table with truncated columns + **Edit** dialog;
Screens / Screen Locations CRUD + **Test tap**; Card Profiles (Swipe shows Track Data, Dip/Tap show Path);
Screen Compare Images CRUD + **Test** + "CFD layout v2" toggle (tutorial); "in use by Jenkins #n" indicator.

**Jenkins (`app.jenkins`)**: views `Java` / `iOS`; job pages; Build with Parameters; console with checkout lines,
env block and staged Laz/Ubi output; Pipeline script viewer; failure messages exactly as in the lessons.

**Terminal (`app.terminal`)**: `ssh` to Pis and Windows boxes; `uname -a`, `systemctl status robot-controller`,
`df -h /`, `ps aux | grep -i wine`, `curl -i/-X POST …`; `adb connect/devices/-s … shell uiautomator dump/pull/shell input tap`;
`grep -o/-c`; Windows `schtasks /query /tn …`, `dir`.

**IntelliJ (`app.intellij`)**: Get from VCS; project tree with drag-to-move; editor click-zones; run configs
(`HomeScreenTest`, `ReceiptScreenTest`, `TaxTest`, `TaxTestDuo`); green/red run results; `config.properties` validator;
JSON editor **without inspections for the pigeon project**; Alt+Enter "Implement mandatory screen methods".

**GitHub (`app.github`)**: repos `gort`, `uia-remote`, `pigeon`; Code → clone URL; file browser; create PR;
review with Approve / Request changes + reason; scripted merges by Jared.

**GIMP (`app.gimp`)**: File → Open; Rectangle Select; Tool Options showing Position and Size.

**Camera (`app.camera`)**: live MJPEG per robot (dedicated or shared); Snapshot to file; recorded playback per build.

**Ollama (`app.ollama`)**: model picker (`llava`†), image attach from snapshots, prompt box, scripted responses.

---

## 8. Content-file mapping (to `src/content/schema.ts` and `src/missions/academy/`)

| Source in this doc | Target | Field mapping |
|---|---|---|
| §1 fact rows | `Fact` | `id`, `text`, `section` = Ref column, `tier`, `tags` = default tag of the first *Taught in* module, `illustrative` = false |
| §0.3 S rows | `Fact` with `illustrative: true` (ids keep the `S##` prefix) | Field Manual shows the "Illustrative (sim only)" badge; never used by `QuizQuestion.factIds` |
| §2 module header tables + objectives | `ModuleMeta` | `id`, `title` (text after the em dash), `mentor` = lower-case key (`morgan`, `jared`, `tate`, `david`), `summary` = first learning objective, `objectives`, `prerequisites`, `factIds` = Facts covered, `tags` = default tag, `estMinutes` = upper bound of Est. duration, `checkpointQuestionIds` = the `CP-M##.1` list, `unlockXp` = 0 (Academy unlocks by prerequisites; progression doc may override) |
| §2 lesson-script rows | `src/missions/academy/M##.ts` step list | `n`, `type` (six step types), `target` (anchor / app id), `text` (exact HUD / dialogue string), `success` (predicate in the Success column, implemented as a named sim-state check), `hints` (§2.0 defaults unless stated) |
| §3 quiz rows | `QuizQuestion` | see §3.0 |
| §4 flashcard rows | `Flashcard` | `id`, `front`, `back`, `factIds`, `moduleId` = deck module, `tags` = that module's default tag |
| §5 | `cert.ts` (exam definitions) | `id`, `rank`, `title`, `eligibility`, written `{count, minutes, quotas, tierMix, criticalFactIds}`, `practical[]`, `pass`; † exclusion list = §0.2 rule 3 |
| §6 | Arcade incident/drill definitions | `id`, `unlockedBy`, `trigger`, `resolution`, `strikes`, `factIds` |

**Default topic tag per module** (refine in `src/content/tags.ts` if needed): M01 `lab.orientation` · M02 `devices` ·
M03 `power.rails` · M04 `robots.mechanics` · M05 `pi.controller` · M06 `orca.status` · M07 `orca.entities` ·
M08 `orca.capabilities` · M09 `orca.screens` · M10 `cards` · M11 `jenkins` · M12 `adb.port` · M13 `uia.pom` ·
M14 `uia.config` · M15 `pigeon` · M16 `duo.ocr` · M17 `infra.ai` · M18 `teams.history`.

**Content tests** (`npm run lint:content`) must assert the same invariants this document was checked against:
every `F` referenced exists; every core fact has ≥ 2 quiz items and every supporting/trivia fact ≥ 1; every fact is
in ≥ 1 module; each module has 6–15 steps of the six allowed types; every checkpoint's items belong to its module;
MC items have exactly one correct option; no † item is in a certification pool; all `loc.*`/`prop.*`/`npc.*`/`app.*`
IDs exist in the world/app registries.
