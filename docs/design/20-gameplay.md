# LabSim — Gameplay Design (fun + repetition)

> **Doc:** `docs/design/20-gameplay.md` · **Depends on:** `00-canon.md` (wins every conflict),
> `docs/reference/REMOVED-internal-reference.md` (domain truth, cited as **Ref §n**),
> `docs/design/10-curriculum.md` (cited as **Cur §n**).
> **Ownership split:** the curriculum owns Academy lesson scripts, facts (`F###`), quiz items (`Q###`),
> flashcards (`FC###`, Leitner), certification exams (`CERT-R#`) and the lesson rig roster (Cur §0.4).
> **This doc owns** modes, Arcade (Shift, Drills, Daily, Weak Spot), Free Play, the incident catalog
> (`INCnn`), scoring, XP, career ranks, achievements, leaderboards, streaks, adaptive selection, feel
> (audio/juice/personality), onboarding, controls, inventory and save data.
> Everything here is a requirement unless explicitly labelled *optional*.

## 0. Conventions used in this document

| Convention | Meaning |
|---|---|
| **[illus.]** | Detail invented for the sim because the reference is silent (an IP, a service name, a fuse rating, a log format). Never contradicts the reference. Same rule as the curriculum's **†**: the Field Manual shows the "Illustrative (sim only)" badge next to it. Values shared with Cur §0.3–§0.6 are reused verbatim. |
| **real s** / **game min** | Real seconds vs simulation-clock minutes. Arcade Shift runs the sim clock at **5×** (§2.3), so Orca's health check (every **5 game min**, canon) fires every **60 real s** in a shift. Par times, SLAs and timers in this doc are **real seconds** unless stated. |
| `INCnn` | Incident ID (§3), `INC01`…`INC65`. Stable; never renumber. The curriculum's proposed `INC-*` type names map to these IDs in §3.7. |
| `DRnn` | Drill ID (§2.4), `DR01`…`DR19`. |
| `M01`–`M18` | Academy modules as defined in Cur §2 (this doc never renumbers or redefines them). |
| `R1`–`R5` / `CERT-R#` | Curriculum certification ranks/exams (Cur §5); mapped to career ranks in §4.3. |
| `ACHnn` | Achievement ID (§4.5). |
| `GWnn` / `PBnn` | Global wrong action / process bonus (§3.3). |
| `FInn` | Free Play fault-injector entry; `FInn` = `INCnn`. |
| `PLn` | Shift pipeline (§2.3.5). |
| tag (e.g. `orca.status.reserved`) | Fine topic tag (§4.8.1). Each fine tag rolls up to one curriculum module tag (Cur §8 "Default topic tag per module"). Incidents, drill items and Arcade quiz items carry fine tags; mastery is tracked per fine tag. |
| `R` | The rig an incident is bound to (a parameter; §3.1). |
| Rig names | System name lowercase-kebab (`wall-e`), Human Readable Name caps (`WALL-E`) — canon. |

People are referenced through `src/content/team.ts`: mentors `npc.jared`, `npc.tate`, `npc.david`,
`npc.morgan` (canon), and the Arcade coworkers `npc.coworker` (display name **Riley**, IPX QA, owner
of the desk Flex at `10.42.60.4` — the curriculum's unnamed coworker), `npc.sam` (**Sam**, PayCore
engineer) and `npc.alex` (**Alex**, new hire). Text interpolates names; never gendered pronouns.

---

## 1. Pillars, player fantasy, realism vs fun

### 1.1 Player fantasy
"It is your first week on the LabSim automation team. There are 42 rigs in Orca, twelve of them are
humming on the racks in front of you, Jenkins never sleeps, and by the end of the week the pool is
yours." The player progresses from **Intern** (shadowing Morgan and Jared) to **Lab Lead** (running a
20-minute Full Shift alone, in Strict realism, with every pipeline green). The emotional beats are
*competence* (I read the evidence and I knew), *ownership* (these are my robots), *flow* (a combo of
clean diagnoses under a ticking queue) and *transfer* (I could walk into the real lab tomorrow).

### 1.2 Pillars

| # | Pillar | Rule it imposes on every feature |
|---|---|---|
| P1 | **Real hands, real screens** | Every verb is a real lab verb: toggle MAIN/MOTOR, re-seat an Ethernet cable, swap a blade fuse, press **Park All**, open a Merchant Config row with **Edit**, type `adb connect 10.42.30.13:5444`, open a PR, draw a GIMP selection, escalate to Jared with the endpoint from Notes. No abstract "repair" button exists anywhere. |
| P2 | **Evidence, not guesswork** | Every incident's root cause is observable in **at least two independent places** (e.g. Orca Notes + Pi LEDs). The same cause always produces the same evidence. Randomness only chooses *which* fault and *where*. Misleading **ticket titles** are allowed (people guess wrong); misleading **system evidence** only where the reference says the system misleads (the "select print" log, Ref §5). |
| P3 | **Taught → Practised → Tested** | Every tag (§4.8.1) has a curriculum module that teaches it, ≥ 1 hands-on incident, and ≥ 1 drill besides the Speed Quiz. Appendix B is a release gate. |
| P4 | **Pressure with fairness** | Timers, SLAs, combos and penalties create urgency, but every penalty is explained by a Teach Card (§5.5) citing the fact and offering a drill. Academy never hard-fails (Cur §2.0). |
| P5 | **A lab with a pulse** | Robots are characters with quips and distinct sounds; mentors and coworkers react; the room hums (GPU blade fans, stepper whine, solenoid clacks). |

### 1.3 Realism contract

**Never simplified (exact everywhere, in every mode):**

| Item | Exact value / behaviour |
|---|---|
| Orca statuses | `Available`, `Unavailable`, `Offline`, `Connection Failed`, `Reserved` (enum `AVAILABLE`, `UNAVAILABLE`, `OFFLINE`, `CONNECTION_FAILED`, `RESERVED`) |
| Health check | Every **5 game minutes** a synchronized background thread pings every Pi's Robot Controller; no response or non-200 ⇒ `Connection Failed`, checkouts blocked, Notes entry with endpoint + error. `Offline` rigs are skipped. `Reserved` rigs are not overridden. Hardware causes are escalated to Jared. |
| Unavailable semantics | General pipelines cannot check it out; a job passing the exact unique robot **Name** can; when that job finishes Orca resets it to `Unavailable`. |
| ADB port | **5444** for lab devices; 5555 is the ADB default and the cause of the coworker-device collision. |
| Power chain | 120 V AC wall → Mean Well → 24 V DC rail → step-downs: 12 V DC (NUCs) and 5 V DC 10 A (Pis), inline fuses. LabSim devices (irregular 18 V) and Collis probes **only** on commercial AC power strips. |
| DeviceType enum | `STATION_2018, STATION_2, STATION_DUO, STATION_DUO_2, STATION_DUO_3, MINI_2, MINI_3, MINI_4, FLEX_1, FLEX_2, FLEX_3, FLEX_4, FLEX_POCKET, COMPACT` — ALL CAPS, case-sensitive in Jenkins env vars. FLEX_3/FLEX_4/FLEX_POCKET share the `FLEX_GEN3` testing profile; Pocket has `hasPrinter=false`. |
| config.properties | `theme=avocado`, `kernelType=CPA`, `portNumber=5444`, `runType=tethered` for tethered; Station Duo ⇒ MFD IP == CFD IP; `deviceType` is the family (`Mini`, `Flex`, `Station`). |
| Tablet | Header with Human Readable Name, `Status: OK`, `Brainbox v6`; tabs `Robot`, `Robot Control`, `Motion Control`; groups Steppers (Enable/Disable), Park (Park All/XY/X/Y), Dip (In/Out), Tap (In/Out), Phone (Forward/Back/Push Power Button), Solenoid (Down/Up/Lower/Raise). Manual arm move ⇒ magnetic lock breaks, banner **yellow**; only **Park All** homes to the limit switches at (0,0) and turns it green (Park XY/X/Y leave it yellow, Cur S13). |
| uia-remote | `app/src/main` (QA never modifies), `test` (unit tests + multi-device runner), `androidTest` packages `databases`, `pageobjects`, `testactions`; screen classes extend `BaseTest`, Zone 1 locators / Zone 2 helpers, mandatory `waitForScreen()` and `isScreenPresent()`; `open(appName)` vertical on Flex, horizontal on Mini/Station; Tax test MFD_O1 → CFD_O1 → MFD_O2 → Step 4 on CFD, start and teardown at HomeScreen. |
| Command syntax | `adb`, `ssh`, `git`, `curl`, `systemctl`, `schtasks` behave like the real tools for the subset simulated (apps doc). |

**Compressed for play (disclosed on the Field Manual page "How the sim differs"):**

| Real world | In LabSim | Why |
|---|---|---|
| Health check every 5 real minutes | 5 *game* minutes; Shift clock 5× (60 real s); Academy/Free Play have Orca's tutorial **Force health check** button and fast-forward ×30 (Cur §2.0) | Waiting 5 real minutes is not fun; the *rule* (recovery appears at the next ping, Offline is skipped) is still taught and scored (INC05). |
| Jenkins runs take many minutes | 60 real s per run in Shift | Pipelines stay visible inside a 5-minute shift. |
| A big lab | Lab compacted; `Shift` fast-walk | Diagnosis is about thinking, not walking. |
| ~300 solder joints per robot | Re-seating connectors; the bolt-sorting and build steps in M04 | Taught as fact and craft, not a grind. |
| Typing long commands | Tab-completion and history in Standard realism; history only in Strict | Accessibility; Strict keeps it honest. |
| Electrical mistakes can hurt people | Never: they destroy equipment (spark, smoke, cost) and points | Safety lesson without gore. |

**Game layer that does not exist in the real lab** (always HUD-styled, never in-world): ticket queue
HUD, score, combo, **Diagnosis Call** (§2.3.6), Arcade hint tiers, Fault Injector, the robot quip
overlay (toggleable), achievements.

### 1.4 Realism settings (per profile)

| Setting | Standard (default) | Strict ("Real Lab") |
|---|---|---|
| Objective markers, outlines, ghost cursor | On (Academy rules per Cur §2.0) | Off (Academy still offers its timed hints; Arcade offers none) |
| Terminal tab-completion, history | On | History only |
| Robot quip overlay on tablets | On | Off — tablets show exactly the real UI |
| Arcade hint tiers (`H`) | 1–3 | Tier 1 only |
| Force health check / fast-forward | Academy & Free Play | Not offered — you wait |
| XP multiplier | ×1.0 | ×1.25 |
| Leaderboards | Standard boards | Separate Strict boards |

---

## 2. Modes

### 2.1 Mode map

| Mode | Purpose | Session | Unlock |
|---|---|---|---|
| **Academy** | Guided modules M01–M18 (Cur §2) | 12–25 min/module | From start (M01 starts automatically on a new save) |
| **Arcade → Shift** | Timed lab shift; incident queue; pipelines; score | 5 / 10 min real | 5-min after M04; 10-min after M10 |
| **Arcade → Full Shift** | The 20-min shift (curriculum name); required for CERT-R5 eligibility | 20 min real | After M18 (Cur M18 unlock) |
| **Arcade → Drills** | 19 minigames (45–120 s) for muscle memory | 1–2 min | Per drill (§2.4.2) |
| **Arcade → Daily Challenge** | Seeded 10-min shift, one ranked attempt/day | 10 min | After M14 |
| **Arcade → Weak Spot** | Auto playlist from weakest tags (§4.8.5) | ~6 min | After M06 |
| **Certification** | `CERT-R1`…`CERT-R5` written + practical (Cur §5); practical shifts use §2.3.12 | 15–60 min | Per Cur §5.1 eligibility |
| **Free Play** | Sandbox lab; all systems live; Fault Injector | Unlimited | After M04 |
| **Field Manual** | Codex + Leitner flashcards (Cur §4) + incident/drill links | Any | From start; entries unlock as met |

Main menu (top to bottom): Continue · Academy · Arcade (Shift, Full Shift, Drills, Daily, Weak Spot)
· Certification · Free Play · Field Manual · Profile (rank, achievements, stats, leaderboards) ·
Settings. Badges: "Cards due" on Field Manual; "Weakest tag" chip on Arcade (one click → Weak Spot);
"Exam ready" on Certification when eligible.

### 2.2 Academy (gameplay wrapper around Cur §2)

The curriculum defines every module's steps, exact texts, success conditions, per-step hint timings
(`walk-to` 45/90 s, `inspect` 60/120 s, `computer-task` 60/120/180 s with "Show me" at −50 % step XP,
`interact` highlight after 3 wrong), checkpoint quizzes (≥ 80 %), stars (★ complete · ★★ ≤ 2 hints ·
★★★ no hints and checkpoint 100 % first try) and step XP (10; `interact` 15; `computer-task` 25;
module +100). This doc adds:

#### 2.2.1 Wrapper rules
* **Checkpoint saves:** an autosave at the start of every step (sim snapshot + step index). Pause menu → **Restart step** (always) and **Restart module**.
* **Wrong but safe:** the curriculum's "spark VFX, no permanent damage" rule applies to DC-plug mistakes in Academy; the Teach Card (§5.5) still shows and the mistake still writes mastery evidence (§4.8.3).
* **Stars → progression:** first ★★ on a module +50 XP, first ★★★ +100 XP (on top of Cur §2.0 XP). Total stars (max 54) feed ACH03 and the Lab Lead gate (§4.3).
* **Replays:** replaying a completed module re-arms its seeded faults (Cur §2.0) and pays 25 % XP.
* **Real-lab checklist:** every module debrief ends with 3–6 bullets "In the real lab you will…" taken from the module's learning objectives (Cur §2) — the transfer moment.
* **Arcade preview:** each debrief shows the Arcade content the module unlocked (table below) with a **Play now** button that launches the first unlocked drill or a 1-incident micro-shift.

#### 2.2.2 What each module unlocks outside the Academy

| Module | Arcade incidents eligible (§3) | Drills (§2.4) | Modes / tools |
|---|---|---|---|
| M01 Orientation & Safety | — | DR10 Speed Quiz, DR14, DR17 (filtered to unlocked tags) | Field Manual "Lab Basics" |
| M02 Device Families | — | — | — |
| M03 Power Distribution | INC03, INC17, INC18 | DR04, DR13 | Hotbar slots 2–3 (multimeter, spare fuse) |
| M04 Touch Robot Mechanics | INC11, INC12, INC13, INC15, INC16, INC59 | DR16 "Park It!" | **Shift 5-min**, **Free Play**, hotbar slot 1 (screwdriver) |
| M05 Robot Pi, Linux & Wine | INC19, INC56 | — | Terminal |
| M06 Orca & the Five Statuses | INC01, INC02, INC04, INC05, INC06, INC07, INC31, INC40, INC41, INC48, INC60, INC62 | DR01, DR09 (architecture set) | Weak Spot, hotbar slot 4 (Ethernet cable) |
| M07 Orca Entities | INC08, INC09, INC14, INC42, INC43, INC45, INC46, INC63, INC65 | DR11, DR12 | — |
| M08 Capabilities, Merchants, Laz & Ubi | INC23, INC28, INC49, INC50, INC51 | — | — |
| M09 Screens, xy_touch, ADB vs Physical | INC20, INC21, INC52 | DR07 | — |
| M10 Card Profiles | INC53, INC54, INC55, INC58 | — | Hotbar slot 5 (test card), **Shift 10-min** |
| M11 Jenkins | INC26, INC39, INC44 | — | — |
| M12 ADB on 5444 | — | DR03, DR19 "ADB Speedrun" | — |
| M13 uia-remote & POM | INC32, INC33, INC34 | DR08 POM Builder (incl. "POM Doctor"), DR15 "Where Does It Go?" | — |
| M14 config.properties & Tax test | INC27, INC29, INC30, INC35, INC47 | DR02, DR09 (all sets) | **Daily Challenge** |
| M15 Pigeon & Legacy JSON | INC22, INC25 | DR06 JSON Medic ("Comma Hunt"), DR18 "Log Detective" | — |
| M16 Station Duo, OCR, GIMP & UIA 2.3 | INC24, INC36, INC37, INC38, INC64 | DR05 | — |
| M17 AI, Infrastructure & Roadmap | INC10, INC57, INC61 | — | — |
| M18 Teams, History & Capstone | — (every incident is unlocked by now) | — | **Full Shift (20-min)**, Certification exams (Cur M18 unlock) |

Rules: an incident is eligible in Shift/Weak Spot only when its **Unlocked by** module (header table of
each incident) is complete, unless **Wildcard** is on (§2.3.1). Daily Challenge, certification
practicals and Free Play ignore this rule (Free Play greys out not-yet-taught faults but allows them).

### 2.3 Arcade "Shift" mode

#### 2.3.1 Setup screen
Fields: **Length** (5 / 10 / 20 "Full Shift") · **Seed** (Random | Daily (read-only) | Custom text) ·
**Wildcard** (off/on — all incidents eligible, score ×1.2, "Not yet taught" ribbon on such tickets) ·
**Realism** (profile default, may override) · **Start position** (desk | rack). Shows the rank
difficulty cap and the top 3 local scores for the selection.

#### 2.3.2 Shift clock & cadence

| Parameter | 5 min | 10 min | 20 min (Full Shift) |
|---|---|---|---|
| Real duration | 300 s | 600 s | 1200 s |
| Game clock (5×) | 08:00 → 08:25 | 08:00 → 08:50 | 08:00 → 09:40 |
| Orca health checks (game hh:00, :05, … = every 60 real s) | 5 | 10 | 20 |
| Heat cap | H3 | H4 | H5 |
| First ticket | t = 8 s | t = 8 s | t = 8 s |

HUD top-centre always shows **"Next health check 0:42"** (real-time countdown): fixes appear in Orca
only after the next ping.

#### 2.3.3 Heat (difficulty ramp inside a shift)

Heat by elapsed fraction *f*: H1 *f* < 0.20 · H2 0.20–0.45 · H3 0.45–0.70 · H4 0.70–0.90 · H5 ≥ 0.90, clamped to the length's cap.

| Heat | Mean inter-arrival (real s, ×U(0.75,1.25)) | Max open tickets | Max incident difficulty | Misleading title chance | Compound chance | Active pipelines |
|---|---|---|---|---|---|---|
| H1 | 45 | 2 | 2 | 0 % | 0 % | 3 |
| H2 | 40 | 3 | 3 | 15 % | 0 % | 4 |
| H3 | 35 | 3 | 4 | 25 % | 10 % | 5 |
| H4 | 30 | 4 | 5 | 35 % | 20 % | 6 |
| H5 | 25 | 5 | 5 | 40 % | 25 % | 7 |

* Effective max difficulty = min(heat max, **rank cap**): Intern 2 · Lab Technician 3 · Automation Engineer I 4 · Automation Engineer II and above 5. Daily Challenge and certification practicals ignore rank caps.
* When open tickets = max, the next spawn waits until 10 s after a ticket closes.
* An incident spawns only if remaining time ≥ its par and no open ticket already binds the same rig `R` (except **compound** incidents, which deliberately stack two faults on one rig, e.g. INC03 + INC04).
* Misleading title: the ticket shows the incident's misleading-title variant; system evidence stays truthful (P2).
* Which incident: §4.8.4 weighting toward weak tags.

#### 2.3.4 Tickets
Card fields: `LAB-####` (random 4 digits), reporter (Jenkins Bot / Riley / Sam / Alex / Jared / Tate /
Morgan / David), title (as reported), rig `R`, severity, SLA bar, state.

| Severity | Meaning | SLA |
|---|---|---|
| P1 | Blocks a pipeline or risks equipment | par × 1.5 |
| P2 | Degrades a pipeline / one engineer blocked | par × 2.0 |
| P3 | PoC, housekeeping, judgement | par × 3.0 |

SLA bar: green > 50 % remaining → amber → red < 20 % → **breach**.
States: `NEW → ACKED → IN_PROGRESS → (ESCALATED →) RESOLVED | BREACHED (still open) | HANDOVER (open at shift end)`.
* **Ack** (`T`, select, `Enter`): +10 if within 10 s of arrival; pins the rig on the HUD compass.
* **Resolve**: evaluates the incident's success condition; false ⇒ **GW16** premature resolve.
* **Escalate**: §2.3.7.

#### 2.3.5 Pipelines (why healthy robots matter)
HUD bottom-left strip; full detail in the Jenkins app. Jobs live in the curriculum's legacy views
`Java` / `iOS` (Cur §0.6); names not in Cur §0.6 are [illus.] additions in the same style.

| ID | Jenkins job | Checkout requirement | Default eligible rigs | Activation order |
|---|---|---|---|---|
| PL1 | `Java/uia-remote-regression-flex` | `DEVICE_TYPE` alternates `FLEX_3` / `FLEX_4` each run; pipeline script `def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch: true]` | WALL-E, EVE | 1 |
| PL2 | `Java/uia-remote-tethered-tax` | tethered (MFD populated) | MEGATRON, OPTIMUS | 2 |
| PL3 | `Java/pigeon-android-sale-swipe` | physical touch + printer | WALL-E, EVE, BUMBLEBEE, JOHNNY-5, BAYMAX | 3 |
| PL4 | `Java/uia-remote-regression-mini` | `DEVICE_TYPE=MINI_3`, physical touch | BUMBLEBEE | 4 |
| PL5 | `Java/contact-canada-pin-sale` | `COMPACT`, physical touch, `CARD_PROFILE=INTERAC_CA_DIP` | SETI | 5 |
| PL6 | `Java/go-sdk-sale-smoke` | merchant `GO-SDK-US-01` (App ID / App Secret / API Key); dynamic JSON from `gort/go-sdk/tests/sale_receipt.json` incl. `"printer": true` | DATA, TARS | 6 |
| PL7 | `Java/uia-remote-duo-cfd` [illus.] | `STATION_DUO` | R2-D2 | 7 |
| PL8 | `Java/paycore-standalone-matrix` [illus.] (Sam's NPC job, every 180 s) | named `ROBOT_NAME=rosie` | ROSIE (Unavailable) | always on; counts in uptime only while ROSIE is broken |

Rules:
* Every active pipeline attempts a checkout every **30 real s**; a run lasts **60 real s**.
* Checkout only on rigs that are `Available`, match the requirement and are not running; `Unavailable` only when named; `Reserved`/`Offline`/`Connection Failed` never. Console lines follow Cur §0.6/M06: `[orca] candidate wall-e: Reserved — skipped`, `[orca] no Available FLEX_3 robot — build waiting in queue`, `[orca] checkout → wall-e (FLEX_3) OK`; Orca's robot row shows `Available · in use by Jenkins #4127`.
* Run outcome: **green** if no active fault affects that pipeline on that rig (+20 pts); **red** otherwise (−20 pts) — the console shows that incident's Jenkins symptoms and, if no ticket exists for the rig, a Jenkins Bot ticket spawns at once (most incidents "arrive" this way).
* Blocked attempt (no eligible rig): −10 pts.
* **Pipeline uptime %** = attempts that got a rig ÷ total attempts. End bonus: ≥ 95 % → +500; ≥ 85 % → +250.

#### 2.3.6 Diagnosis Call ("fast correct diagnosis")
Ticket panel → **Call root cause** → 1 of 4 options (one correct + 3 plausible distractors, per
incident in §3). One call per ticket.

| Result | Effect |
|---|---|
| Correct, within **diagnosis par = 0.4 × par** from Ack | +0.25 × base, flagged **Fast Diagnosis** (combo-eligible) |
| Correct, slower | +0.25 × base |
| Wrong | −0.10 × base, combo resets, Teach Card gives a *direction* (the incident's `wrongCallHint`), not the answer |
| No call | No bonus; combo neither increments nor resets |

Incidents declaring `diagnosisCall: none` (change, project, review and judgement tickets: INC34,
INC38, INC42, INC43, INC58, INC61, INC62) have no Call button and count as **Fast Diagnosis** when
resolved within **0.5 × par**. An **escalation** (§2.3.7) includes a cause choice that *is* the
Diagnosis Call.

#### 2.3.7 Escalate to Jared (by the book) and hands-on fixes
Ref §3: Connection Failed is "escalated to Jared for hardware intervention"; the curriculum teaches
escalating with the endpoint and cause (Cur M06 step 10, M18 Capstone 1, CERT-R2 P2-1). Ticket panel →
**Escalate to Jared** opens a form: Rig (prefilled) · **Endpoint** (pick the exact URL from that rig's
latest Notes line, or from your own terminal history when Orca has none — e.g. a Reserved rig) · **Cause** (the incident's four Diagnosis Call options) · Send.

| Case | Result |
|---|---|
| Incident `escalatable: yes`, endpoint and cause correct | Ticket → `ESCALATED`. Scoring uses *r* = time of sending (full formula, combo-eligible). Jared walks over and performs the incident's fix in 60–90 real s (watchable — he narrates what he checks); the ticket auto-resolves when the success condition becomes true. Jared bark per BARK_JARED_04. |
| Escalatable, wrong cause or endpoint | Jared bounces it after 20 s with a hint ("Notes say 502 from the Pi — the Pi answered, so it isn't crashed."), −100, combo reset; ticket returns to you. |
| `escalatable: no` | **GW12** (−100, 20 s bounce, teaching bark); ticket returns. |
| "Jared at lunch" event | Escalations queue until he returns (HUD banner) — hands-on becomes attractive. |

**Hands-on fix:** the player may always fix hardware causes personally. From rank **Lab Technician**
(CERT-R1 passed) a correct hands-on fix of an escalatable incident earns **PB08** (+50, "Jared
deputised you"). Before that rank, hands-on fixes score normally but without PB08, and Jared's bark
reminds the player that escalation is the lab process. Manual status overrides remain wrong either
way (Cur: "Never paper over a failed ping").

#### 2.3.8 Scoring formula (per ticket)
```
ticketScore = round(base × T × H × M) + diagnosisBonus + ackBonus + processBonuses − penalties
```
* **T (time)**, *r* = resolve (or correct-escalation) time since arrival: r ≤ 0.5·par → 1.5 · 0.5·par < r ≤ par → linear 1.5 → 1.0 · par < r ≤ SLA → linear 1.0 → 0.5 · r > SLA → 0.25 (plus −150 breach penalty once, combo reset).
* **H (hints)**: 1.0 none · 0.9 Nudge · 0.75 Pointer · 0.5 Walkthrough (and no combo increment).
* **M (combo)** = min(3.0, 1.0 + 0.25 × combo), using the value **after** this ticket's increment.
* **Combo** +1 when a ticket resolves with all of: Fast Diagnosis, zero penalty events on the ticket, r ≤ par, hint tier ≤ 2. Resets to 0 on: any penalty event, wrong Diagnosis Call, wrong escalation, premature resolve, SLA breach, strike. Max ×3.0 at combo 8.
* **Penalties** incurred while the ticket was open are charged to it; others hit the shift score directly.

Pop-ups: `+412  ×1.75 COMBO 3` (green); penalties red with the GW name.

**Arcade hints (`H`)** — Nudge (where to look) → Pointer (which app/object/field) → Walkthrough
(ghost highlight of the next action). Texts are per incident (`hints[3]` in content).

#### 2.3.9 Strikes and early end
Strikes (consistent with Cur §5.3's strike list): fried hardware (GW01, GW02), security tampering (GW11),
manual status override that masks a failure (GW24), driving a coworker's device (INC27 condition or
GW08 reaching `10.42.60.x`), and a PayCore merchant overwrite caused by the player (GW05 → INC40).
**3 strikes** end the shift (Jared: "Let's call it for today — read the Field Manual page on what
went wrong before tomorrow."); grade capped at **D**.

#### 2.3.10 End of shift
* Open tickets: −50 each ("handover debt").
* **Target** = Σ base of all spawned tickets; **Ratio** = final score ÷ target.
* Grade: **S** ≥ 1.50 (and 0 strikes, 0 breaches) · **A** ≥ 1.15 · **B** ≥ 0.85 · **C** ≥ 0.55 · **D** otherwise. "Full Shift score" (Cur §5.1 R5 eligibility) = Ratio of a 20-min shift; "≥ 80 %" means Ratio ≥ 0.80.
* Summary: score, grade, tickets resolved/spawned, SLA breaches, penalty events (each opens its Teach Card), max combo, uptime %, Fast Diagnosis count, escalations (correct/wrong), XP, rank progress, **Review these** (≤ 5 tags whose mastery dropped, each with *Practice* → drill and *Read* → Field Manual), leaderboard placement.

#### 2.3.11 Planned work and shift events
**Planned work (Full Shift only):** at t = 30 s one P2 "planned work" ticket is added, drawn by §4.8.4
weighting from {INC19, INC38, INC42, INC44, INC59} filtered by rank cap. It does not count toward
max open tickets and ignores heat difficulty limits (the only way INC19/INC38 appear in shifts, since
their par exceeds the time left once heat allows D5).

**Shift events** (10- and 20-min shifts; at most one; 30 % chance; fires at a uniform time between
*f* = 0.30 and 0.50; a forced incident still needs remaining time ≥ its par, otherwise another event
is drawn):

| Event | Effect |
|---|---|
| **Firmware rollout** | Forces INC20 (receipt QR regression) as the next ticket. |
| **Onboarding day** | The next 2 tickets come from Alex with misleading titles. |
| **corporate security scan** | Forces INC19 (needs remaining time ≥ 8:00). |
| **Jared at lunch** | Escalations queue for 120 s (HUD banner "Jared: out to lunch"). |

#### 2.3.12 Certification practical shifts (CERT-R4 / CERT-R5)
Cur §5.3 defines "Mixed incident shift: 5 incidents in 20 game-min" (R4) and "Hard shift: 8
incidents in 30 game-min, two simultaneous at minute 10, no HUD objective text" (R5). They run on
this doc's engine with: time scale **1×** (game min = real min), incidents drawn from the §3.7
mapping (R4: ≥ 1 hardware, ≥ 1 Orca, ≥ 1 code/config), no score/combo/Diagnosis Call bonus (the
Call button is hidden), no hints, no Force health check, escalation allowed (it is the lab process),
strikes = any GW event with a strike flag plus any wrong fix action, and pass/fail exactly per Cur §5.3.

### 2.4 Arcade "Drills"

#### 2.4.1 Common drill rules
* Round = 60 s unless stated, or a fixed item count. Items drawn by §4.8.4 weighting from the drill bank, filtered to unlocked tags.
* Correct +100; speed bonus +50 at ≤ 2 s, linear to +0 at 8 s; in-drill streak ×(1 + 0.1·streak), max ×2.0.
* Wrong −50, streak resets, **inline Teach Card** (2 lines: what's right + why, Ref §) for 2.5 s or until click.
* Bronze / Silver / Gold thresholds per drill; personal best and medal persist.
* Every item writes mastery evidence (weight 0.5) to its tags. Drill items that are curriculum quiz items (`Q###`) also apply the curriculum's Leitner cross-mode rule (a wrong answer sends that fact's cards to box 1, Cur §4.0).
* Keyboard shortcuts shown on every button (`1`–`5`, `A`–`D`, `Enter`, `Backspace`).

#### 2.4.2 Drill catalogue

| ID | Name (curriculum alias) | Format | Tags | Unlock | Bronze / Silver / Gold |
|---|---|---|---|---|---|
| DR01 | **Status Triage** | Scenario card → press 1–5 (Available, Unavailable, Offline, Connection Failed, Reserved) | `orca.status*`, `orca.healthcheck` | M06 | 800 / 1500 / 2200 |
| DR02 | **config.properties Speed-Build** | Build a full file for a rig card; 3 files, 120 s | `uia.config`, `adb.port`, `orca.tethered` | M14 | 900 / 1600 / 2300 |
| DR03 | **Port Patrol** | Terminal/config lines scroll: flag **Lab-safe** or **Collision risk**; 60 s | `adb.port`, `adb.usage` | M12 | 900 / 1600 / 2400 |
| DR04 | **Power Path** | Wiring board: sources → loads; 3 boards, 120 s | `power.rails`, `power.fuses`, `power.18v` | M03 | 900 / 1500 / 2100 |
| DR05 | **Coordinate Hunter** | GIMP-style screenshot: draw the box; score by edge error | `pigeon.gimp`, `orca.screens`, `orca.screencompare` | M16 | 700 / 1300 / 1900 |
| DR06 | **JSON Medic** ("Comma Hunt") | Pigeon payload: click the error, pick the fix; 5 payloads, 90 s | `pigeon.json`, `pigeon.nolint` | M15 | 700 / 1300 / 2000 |
| DR07 | **Receipt Map** | Receipt render: choose `RECEIPT_OPTIONS_4`/`_5`, then tap the asked button; 60 s | `receipt.maps`, `receipt.qr`, `orca.screens` | M09 | 900 / 1600 / 2300 |
| DR08 | **POM Builder** ("POM Doctor") | Build mode: drag lines into a page-object skeleton. Doctor mode: fix a broken class; 3 classes, 120 s | `uia.pom`, `uia.sync`, `uia.packages`, `uia.scroll` | M13 | 800 / 1400 / 2000 |
| DR09 | **Pipeline Order** | Order cards (Tax test, architecture, power chain, OCR check, dip-card flow, Laz OOBE); 4 sequences, 90 s | `uia.taxtest`, `arch.flow`, `power.rails`, `orca.screencompare`, `cards.diptap`, `laz.oobe` | M06 (architecture) / M14 (all) | 700 / 1300 / 1900 |
| DR10 | **Speed Quiz** | Rapid MCQ from the curriculum quiz bank (non-† items), 90 s | all unlocked | M01 | 1000 / 2000 / 3000 |
| DR11 | **Caps Lock** | Accept/reject a Jenkins `DEVICE_TYPE` / enum value; 45 s | `orca.devicetype`, `jenkins.envvars` | M07 | 900 / 1600 / 2300 |
| DR12 | **Entity Atlas** | "Where does X live?" → Orca entity + field; 60 s | `orca.*`, `cards.swipe`, `cards.diptap` | M07 | 800 / 1500 / 2200 |
| DR13 | **Meter Reader** | Multimeter reading at a probe point → fault; 60 s | `power.rails`, `power.fuses`, `hw.pi` | M03 | 700 / 1300 / 1900 |
| DR14 | **Who You Gonna Call** | Problem → Jared / Tate / David / Morgan / "Handle it yourself"; 45 s | `people.roles`, `orca.status.connfailed` | M01 | 600 / 1100 / 1600 |
| DR15 | **Where Does It Go?** | Files rain down → drop into `main` / `test` / `androidTest/databases` / `androidTest/pageobjects` / `androidTest/testactions`; anything into `main` = wrong; 60 s | `uia.layout`, `uia.packages`, `uia.multidevice` | M13 | 800 / 1400 / 2000 |
| DR16 | **Park It!** | 3D mini-scene: 10 rigs go yellow in sequence, some locked by a test; right tablet action on each; 90 s | `hw.motion`, `hw.lockout`, `hw.tablet` | M04 | 600 / 1100 / 1700 |
| DR17 | **Lab Lore** | Rapid recall of numbers, teams, history, stack, hardware; 60 s | `arch.*`, `uia.history`, `uia.v23`, `pigeon.lstr`, `pigeon.abstraction`, `hw.devices`, `hw.nuc`, `hw.collis`, `hw.rigbom`, `hw.print3d`, `bots.*`, `cards.*`, `ubi.routing`, `go.sdk`, `semi.paydisplay`, `vision.*`, `tools.claude`, `people.roles` | M01 | 800 / 1500 / 2200 |
| DR18 | **Log Detective** | Evidence snippet (Notes line, Jenkins tail, terminal output, IDE trace, git diff) → true root cause of 4; 90 s | `jenkins.*`, `orca.notes`, `orca.status.connfailed`, `tools.terminal`, `tools.intellij`, `tools.github`, `adb.usage`, `pigeon.json` | M15 | 700 / 1300 / 1900 |
| DR19 | **ADB Speedrun** | Live terminal on a random ADB-visible device: `adb connect <ip>:5444` → `uiautomator dump` → `pull` → find bounds → `input tap` the named element; 3 targets, 120 s | `adb.usage`, `adb.port` | M12 | 600 / 1100 / 1600 |

#### 2.4.3 Drill specifications

**DR01 Status Triage.** 1–3 sentence scenario, sometimes with a mini render (Orca row, Notes line,
tablet). Keys 1–5. Bank ≥ 40; required items (exact answers):

| Scenario | Answer |
|---|---|
| "Jared is rebuilding BAYMAX's gantry this afternoon." | Offline |
| "The 08:15 ping to `http://10.42.10.13:8000/health` returned `502 Bad Gateway`." | Connection Failed |
| "You're about to run TaxTest from IntelliJ on MEGATRON." | Reserved |
| "ROSIE holds PayCore's standalone merchant; general jobs must not touch it." | Unavailable |
| "Healthy rig, open to any pipeline." | Available |
| "A job that named `rosie` just finished. ROSIE's status now?" | Unavailable |
| "A Reserved rig's Pi loses power. What does Orca show at the next check?" | Reserved |
| "An Offline rig's Pi is unplugged during the build. Status after the next check?" | Offline |
| "Health ping: `connect timed out after 10000 ms`." | Connection Failed |
| "The Minix box running Callus for Rack A is powered off; the Pi reports it upstream." | Connection Failed |
| "A coworker finished their local run and wants pipelines to use the rig again." | Available |
| "A rig is waiting for its data profiles to be assembled." | Offline |

Teach Card example: *"Not Connection Failed — Orca skips health checks for Offline rigs, so an
unplugged Pi on a rig being built stays Offline. (Ref §3)"*

**DR02 config.properties Speed-Build.** Rig card: rig, device(s), IPs, serial, env, passcode. Player
types `key=value` lines (Standard: key autocompletes after 3 chars). Graded keys = the curriculum
validator's 11 keys: `runType`, `merchantFacingDeviceIp`, `customerFacingDeviceIp`, `serial`,
`deviceType`, `theme`, `kernelType`, `portNumber`, `unlockPasscode`, `backendEnv`, `robotName`
(Cur M14). +40 per correct key; all 11 correct +100. Required traps: Duo card (both IPs identical,
R2-D2 `10.42.30.14`, `deviceType=Station`); tethered card (`runType=tethered`); a Flex card
(`deviceType=Flex`); an "old wiki" card with `theme=classic`, `kernelType=SPA`, `portNumber=5555`.
Target for MEGATRON (identical to Cur M14's validator target):
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
(For standalone rigs the expected value is `runType=standalone`, as in Jenkins' env block, Cur M11 [illus.].)

**DR03 Port Patrol.** `Space` = Lab-safe, `X` = Collision risk. Collision risk: any `:5555`, any
`10.42.60.*` target, `adb connect` without a port (defaults to 5555), `portNumber=5555`,
`adb tcpip 5555`, a runner log line `falling back to first known device: 10.42.60.4:5555`. Lab-safe:
`10.42.30.*:5444`, `portNumber=5444`. Last 15 s bonus: type the fix, e.g. `adb disconnect 10.42.60.4:5555`.

**DR04 Power Path.** Sources {wall 120 V AC, AC power strip, Mean Well (24 V DC out), 12 V step-down,
5 V 10 A step-down, inline fuse holders}; loads {Raspberry Pi, Intel NUC, Flex 4 PSU brick,
Mini 3 PSU, Collis probe PSU, Mean Well input, step-down inputs, motor controller PCB (24 V)
[illus.]}. Correct graph: wall → Mean Well; wall → AC strip; Mean Well 24 V → step-down inputs (and
motor PCB [illus.]); 12 V → fuse → NUC; 5 V 10 A → fuse → Pis; LabSim PSUs → AC strip; Collis PSU →
AC strip. A LabSim or Collis lead on any DC terminal = instant spark/fry animation, −300, Teach Card.
Missing fuse on a DC branch = −100 at submit.

**DR05 Coordinate Hunter.** 1280×800 screenshot rendered from the sim's screen UIs inside a GIMP-style
frame (rulers, Tool Options with live `Position` and `Size`). Prompt e.g. "Box `TOTAL $10.83`". Edge
error *e* = mean |px error| of the 4 edges: e ≤ 1 → 150; ≤ 3 → 100; ≤ 6 → 50; else 0 (overlay shows
the target). Mode B (after first Gold): convert to mm with the Device Type's px/mm (±0.5 mm). Mode C:
type the Pigeon block `{"x":…, "y":…, "w":…, "h":…, "expected":"…"}` (Cur M15/M16 key names).

**DR06 JSON Medic.** 5 payloads (25–60 lines) in the Pigeon shape (`name`, `connectionType`,
`platforms`, `actions[{action, params, store}]`, Cur M15). Errors: missing comma between objects
40 %, between fields 20 %, missing `]`/`}` 15 %, trailing comma 10 %, unquoted key 10 %, single
quotes 5 %. Some items show the LSTR console line (`LSTR ParseError: Unexpected string in JSON at line
23 column 7`), which points at the line *after* a missing comma — the lesson is to look at the end of
the previous line. Click the line (exact 100, ±1 50), then pick the fix. No error highlighting (no
linter). Hint (−50): "Paste a known-good block" from `tests/_templates/known_good_actions.json`.

**DR07 Receipt Map.** Receipt-options render for a random Device Type. Step 1: map `RECEIPT_OPTIONS_4`
or `RECEIPT_OPTIONS_5` (5th option "Scan for receipt" appears when the QR feature is on; buttons sit
3.0 mm lower, Cur S10). Step 2: tap the asked button. Tapping where it sits on the *other* map = wrong
+ Teach Card with both overlays. FLEX_4 values from Cur §0.6 are the reference set.

**DR08 POM Builder / POM Doctor.** Build skeleton:
```java
package com.labsim.uia.pageobjects;

public class RegisterHomeScreen extends BaseTest {
    // ===== Zone 1: Element Locators =====
    // [drop locators here]

    // ===== Zone 2: Helper / Action Methods =====
    // [drop methods here]
}
```
Card pool: locators (`private final BySelector reviewOrderBtn = By.text("Review Order");`),
`waitForScreen()`, `isScreenPresent()`, `open(String appName)` (Flex vertical / Mini–Station
horizontal), distractors (`portNumber = 5555`, a `@Test` method → `testactions`, a DB query →
`databases`, a method in `app/src/main`). Pass = both mandatory methods, locators in Zone 1, helpers in
Zone 2, package `pageobjects`, extends `BaseTest`, no distractors. Doctor mode shows a broken class
(swapped scroll branches, missing mandatory method, locator in Zone 2) to repair (Cur §6 "POM Doctor").

**DR09 Pipeline Order.** Exact sequences:
* *Tax test*: start on HomeScreen → MFD_O1: open Register, add "Tax Item 5", "Review Order" (Orca → Callus loads the swipe card) → CFD_O1: assert subtotal $10.00, tax $0.83, total $10.83 → MFD_O2: "Pay", "Charge" → Step 4: payment prompt finalised on CFD → teardown to HomeScreen.
* *Architecture*: Jenkins triggers the pipeline and injects env vars → runner (uia-remote / Pigeon) starts → robot checked out from Orca → runner calls Orca REST (`xy_touch`, card swipe/dip/tap) → Orca looks up mm coordinates in MySQL → Pi Robot Controller fires an ADB touch or a mechanical tap → LabSim device reacts.
* *Power*: 120 V AC wall → Mean Well → 24 V DC rail → step-down regulator → inline fuse → Pi (5 V 10 A) / NUC (12 V).
* *OCR check*: Screen Compare row (box + expected text) → Pi captures a webcam screenshot → crop to the box → Tesseract OCR → boolean match.
* *Dip card*: Card Profile stores a Gort path → scheduled task `GortCardSync` clones Gort cards to the Windows box → test requests a dip → Callus maps the path and loads the virtual card → Collis probe presents it to the reader.
* *Laz OOBE*: `ubi: routing merchant switch` → `laz: de-provision` → `laz: wipe caches` → `laz: setup wizard` → `laz: merchant active` (Cur M08).

**DR10 Speed Quiz.** 90 s of curriculum quiz items (`Q###`, † items allowed here, Cur §0.2), filtered
to unlocked modules, weighted to weakest tags. Every 5th question is a hotspot on a render (MAIN
toggle, Park All button, Pi ACT LED…). Wrong → the item's curriculum explanation as the Teach Card.

**DR11 Caps Lock.** Accept (`→`) / reject (`←`). Valid: exact enum strings. Invalid: `flex_3`,
`Flex_3`, `mini_3`, `FLEX3`, `FLEX-3`, `Mini 3`, `STATION_DUO2`, `FLEX_GEN3` (a testing profile, not
a DeviceType), `POCKET`. Bonus: valid `deviceType` in config.properties? (`Mini`, `Flex`, `Station`.)

**DR12 Entity Atlas.** Raw Track Data → Card Profile (swipe) · Gort path of a dip card → Card Profile
(dip/tap) · button mm X/Y → Screen Locations · CFD box + expected text → Screen Compare Image · API
Key → Merchant Config (click **Edit**) · Camera Stream URL → robot URL Mappings · MFD/CFD → USB
Tethered Device Configuration · legacy mm adjustment → Offsets · dimensions/layout → Device Type ·
dynamic JSON capabilities → inside the test definition (parsed at runtime); non-dynamic → pipeline
script · system identifier vs tablet text → Name vs Human Readable Name.

**DR13 Meter Reader.** Mean Well out 24.1 V DC → healthy · 5 V regulator out 5.08 V, Pi side of the
Rack B fuse 0.00 V → blown fuse · fuse (power off) Ω `OL` → open; 0.1 Ω → good · 12 V branch 0.0 V at
NUC with regulator input 0.0 V → upstream problem · Ω mode on a live circuit → "never measure
resistance on a powered circuit" (−50).

**DR14 Who You Gonna Call.** "Pi answered 502: Callus upstream unreachable" → Jared (escalate with
endpoint) · "Need the App Secret field explained" → Tate · "Dynamic JSON capability for an SDK test"
→ David · "Tethered runner hopping between device handles" → Morgan · "Coordinate PR needs merging" →
Jared · "Lower-case DEVICE_TYPE" → handle it yourself.

**DR15 Where Does It Go?** Items (Cur M13): `DbHelper.java` → `androidTest/…/databases`;
`HomeScreen.java`, `LockScreen.java` → `pageobjects`; `TaxTest.java` → `testactions`;
`MultiDeviceRunner.java` → `test`; `AppRegistration.java` → `main` (shown with a "QA never edits"
stamp; dropping a *test* file into `main` is wrong).

**DR16 Park It!** Yellow banner → Motion Control → Park All (+150). Park XY/X/Y leave it yellow
(Cur S13). Rig showing `TEST IN PROGRESS — CONTROLS LOCKED` → leave it, or wait for the job end
(touching = −100). Steppers Disabled → Enable, then Park All. Distractors: dragging the carriage,
toggling MOTOR on a running rig.

**DR17 Lab Lore.** Required items: GPUs in the blade → 4 (2 exposed, 2 underneath; replaced a legacy
tower) · Pi cost → ~$50 · solder points per touch robot → ~300 · wiring → 130 ft · rails → 10 ft cut
aluminium · fasteners → 2.5 mm and 5 mm (200+ per robot) · motor controller → custom 25-pin PCB,
printed in Hong Kong · printers → Prusa and Bambu Lab · Orca scaffold → JHipster (UI, REST endpoints,
MySQL schemas) · Orca's planned future → Docker + GCP · Sedi QA's legacy framework → Lester · Semi
Team built → POS SDKs, USB Pay Display, Secure Network Pay Display · uia-remote creator → the
presenter (Morgan) · IPX → Integrated Payment Experience · PayCore adopted uia-remote for → LabSim
Dining · Pigeon's name → "pidgin" pun, evolved from Lester · why UIA 2.3 → native dual-screen element
tracking · Mini 3 → hot-swap equivalent for the printerless Duo 2 · Compact → Canadian market (Westers)
· Gen 2 PIN bypass partner → Core OS Team · Ubi → routing platform for merchant switching · Claude →
evaluated for repo optimisation and test generation · Ollama → local LLM runner on the GPU blade
(vision PoC) · Gort → monorepo incl. Dip/Tap card definitions (named after the robot from *The Day the
Earth Stood Still*; not a rig).

**DR18 Log Detective.** Item = one evidence snippet copied verbatim from an incident's Symptoms (§3.5)
plus that incident's four Diagnosis Call options; correct = the incident's option A. Wrong → Teach
Card shows the incident's full symptom list and its `wrongCallHint`. Must include Cur M15's misleading
`FAILED at "select print"` case.

**DR19 ADB Speedrun.** Device ∈ {TARS `10.42.30.32`, DATA `10.42.30.31`, BUMBLEBEE `10.42.30.13`,
WALL-E `10.42.30.11`}; target element named on screen (e.g. "Orders"). Accepted sequence (Cur M12):
`adb connect <ip>:5444` → `adb -s <ip>:5444 shell uiautomator dump` → `adb -s <ip>:5444 pull
/sdcard/window_dump.xml` → `grep -o 'text="Orders"[^>]*' window_dump.xml` → compute the bounds centre
→ `adb -s <ip>:5444 shell input tap <x> <y>`. Score per target = 300 − 10 × seconds (min 50); any
`:5555` = −100 and Teach Card.

### 2.5 Free Play (sandbox)

* Full lab, all 12 modelled rigs, all apps, all 42 rigs in Orca, pipelines PL1–PL8 running. Factory state = §3.1 roster.
* **Sandbox panel** (`F10`): time scale 1× / 2× / 5× / 10× (plus fast-forward ×30 hold `]`); penalties on/off (off by default; Teach Cards still fire); pipelines on/off; "Reset lab to factory"; save/load 3 snapshots.
* Orca's tutorial **Force health check** header button is visible (Academy and Free Play only, Cur §7).
* **Fault Injector**: toggles `FI01…FI65` = `INC01…INC65` (same initial state; "Create ticket" checkbox); **Random faults** off / every 3 min / every 90 s (eligible = unlocked incidents); **Inspect truth** overlay showing the injected root cause (demo/teaching; disables XP).
* XP: 30 per injected fault fixed (verified by its success condition), cap 300/day.
* **Build mode** (after M04): Jared's bench offers a rig rebuild sandbox (bolts, solenoid, ribbon, cradle print) ending with Offline → Available.

### 2.6 Field Manual (codex + flashcards)

* **Chapters** by tag group (Architecture, Orca, Jenkins, uia-remote, Pigeon & Receipts, ADB, Power, Hardware, Bots & Cards, Merchants & SDK, Vision & AI, Tools & People) plus "How the sim differs" and the curriculum's "Lab Basics".
* **Entry anatomy:** title · summary · key facts (curriculum `F###` text, with "Illustrative (sim only)" badges where † / [illus.]) · "Where you'll see it" (apps/world objects) · related incidents (with personal best) · related drills · flashcards due · mastery bar for its tags.
* **Search:** fuzzy over titles, facts and exact strings (typing `5444` finds the ADB entry, config.properties, INC27, INC28, DR03, DR19).
* **Flashcards:** exactly the curriculum's Leitner system (Cur §4.0: boxes 1–5, 1/3/7/14-day intervals, "Got it"/"Missed it", 20 new/day, 60 reviews/session, cross-mode demotion). This doc adds only the Arcade demotion hook (§4.8.2).
* **Notebook** (`Tab`): personal notes, auto-captured evidence ("Notes: connect timed out after 10000 ms @ 08:15 — EVE"), current ticket checklist, links into the Field Manual.

---

## 3. Incident catalog

Incidents are the core Arcade content unit. One definition drives Shift tickets, Daily Challenge,
Weak Spot micro-shifts, certification practical shifts (§2.3.12) and the Free Play Fault Injector
(`FInn` = `INCnn`). Academy lessons have their own scripted faults (Cur §0.3 S20); incidents reuse the
same sim mechanics and strings so skills transfer 1:1.

### 3.1 Rig roster and lab bindings (Arcade / Free Play factory state)

This is the curriculum's lesson roster (Cur §0.4) with the Academy-seeded faults cleared: JOHNNY-5's
Human Readable Name is `JOHNNY-5` and its Tap URL is filled; OPTIMUS has its MFD/CFD set; BUMBLEBEE's
Offset Y is 0.0; BAYMAX is Available; JOHNNY-5 still carries its **Flex 1** (the Flex 2 upgrade is
INC42); every modelled Device Type has both `RECEIPT_OPTIONS_4` and `RECEIPT_OPTIONS_5`. If the
world/sim docs change devices or IPs, they win (Cur §0.4) and incidents follow by **role tag**. All
IPs, serials, device-row names and merchants are illustrative (†/[illus.]).

| Rig (HRN) | Name | Role tags | Location | Device(s) → Orca Device row | Device IP `:5444` | Pi (`:8000`) | Camera Stream URL | Callus box | Merchant | Factory status |
|---|---|---|---|---|---|---|---|---|---|---|
| WALL-E | `wall-e` | touch, collis, flexgen3, printer | `loc.rack-a` | Flex 3 → `wall-e-flex3` `FLEX_3` | 10.42.30.11 | 10.42.10.11 | `http://10.42.10.11:8081/stream.mjpg` | MINIX-01 | AUTO-US-NOPIN-01 | Available |
| EVE | `eve` | touch, collis, flexgen3, printer | `loc.rack-a` | Flex 4 → `eve-flex4` `FLEX_4` | 10.42.30.12 | 10.42.10.12 | `http://10.42.10.12:8081/stream.mjpg` | MINIX-01 | AUTO-US-NOPIN-01 | Available |
| BUMBLEBEE | `bumblebee` | touch, collis, mini, printer | `loc.rack-a` | Mini 3 → `bumblebee-mini3` `MINI_3` | 10.42.30.13 | 10.42.10.13 | `http://10.42.10.13:8081/stream.mjpg` | MINIX-01 | AUTO-US-NOPIN-01 | Available |
| R2-D2 | `r2-d2` | touch, collis, duo, ocr | `loc.rack-a` | Station Duo → `r2-d2-duo` `STATION_DUO` | 10.42.30.14 (MFD = CFD) | 10.42.10.14 | `http://10.42.10.14:8081/stream.mjpg` (aimed at the CFD) | MINIX-01 | AUTO-US-NOPIN-01 | Available |
| JOHNNY-5 | `johnny-5` | touch, collis, flex-legacy, printer | `loc.rack-b` | Flex 1 → `johnny-5-flex1` `FLEX_1` (spare Flex 2 `SIM-F2-000015` in the Husky chest, drawer 2) | 10.42.30.15 | 10.42.10.15 | shared Rack B `http://10.42.10.40:8081/stream.mjpg` | MINIX-02 | AUTO-US-NOPIN-01 | Available |
| BAYMAX | `baymax` | touch, collis, printer, rebuild | `loc.rack-b` | Station 2018 → `baymax-st2018` `STATION_2018` | 10.42.30.16 | 10.42.10.16 | shared Rack B | MINIX-02 | AUTO-US-NOPIN-01 | Available |
| SETI | `seti` | touch, collis, canada, physical-pin | `loc.rack-b` | Compact → `seti-compact` `COMPACT` | 10.42.30.17 | 10.42.10.17 | shared Rack B | MINIX-02 | WESTERS-CA-01 (PIN required) | Available |
| ROSIE | `rosie` | touch, collis, paycore, printerless | `loc.rack-b` | Flex Pocket → `rosie-pocket` `FLEX_POCKET` | 10.42.30.18 | 10.42.10.18 | shared Rack B | MINIX-02 | PAYCORE-STANDALONE-01 | **Unavailable** |
| MEGATRON | `megatron` | tethered, dev1 | `loc.rack-tethered` | MFD Station 2 `megatron-mfd` `STATION_2` + CFD Mini 2 `megatron-cfd` `MINI_2` | 10.42.30.21 / .22 | 10.42.10.20 (shelf Pi, shared) | `http://10.42.10.20:8081/stream.mjpg` | MINIX-02 | AUTO-US-NOPIN-01 | Available |
| OPTIMUS | `optimus` | tethered, stg | `loc.rack-tethered` | MFD Mini 3 `optimus-mfd` + CFD Mini 3 `optimus-cfd` `MINI_3` | 10.42.30.23 / .24 | 10.42.10.20 | same as MEGATRON | MINIX-02 | AUTO-US-NOPIN-01 | Available |
| DATA | `data` | adb-only, mini, printer | `loc.adb-shelf` | Mini 3 → `data-mini3` `MINI_3` | 10.42.30.31 | 10.42.10.30 (shared) | — | — | AUTO-US-NOPIN-01 | Available |
| TARS | `tars` | adb-only, flexgen3, printer | `loc.adb-shelf` | Flex 4 → `tars-flex4` `FLEX_4` | 10.42.30.32 | 10.42.10.30 | — | — | AUTO-US-NOPIN-01 | Available |
| VISION *(Orca only)* | `vision` | adb-only, flexgen3, printerless | off-screen Rack C | Flex Pocket → `vision-pocket` `FLEX_POCKET` | 10.42.30.50 | 10.42.10.50 | `http://10.42.10.50:8081/stream.mjpg` | — | AUTO-US-NOPIN-01 | Available |
| K-9 *(Orca only)* | `k-9` | adb-only, printerless | off-screen Rack C | Station Duo 2 → `k-9-duo2` `STATION_DUO_2` | 10.42.30.51 | 10.42.10.51 | — | — | AUTO-US-NOPIN-01 | Available |

**Windows boxes** (Cur §0.4; SSH user `automation`): `MINIX-01` 10.42.20.1 (Callus `:9000`, Collis
probes for Rack A: WALL-E, EVE, BUMBLEBEE, R2-D2) · `MINIX-02` 10.42.20.2 (Callus for Rack B and the
tethered rack) · `NUC-03` 10.42.20.3 (Intel NUC, 12 V; retired from hardware control; sticky note
"DISK 100% — corporate AGENT. NO HARDWARE CONTROL ON THIS BOX. –J"). Rack B camera host Pi
`10.42.10.40` (camera only, service `camera-stream` [illus.]). Collis probes are named
`collis-<rig>` [illus.]. Coworker desk Flex (Riley) `10.42.60.4`, ADB 5555. Other hosts per canon:
Orca `orca.lab.local` → 10.42.1.10:8080 (MySQL `orca`, 3306), Jenkins 10.42.1.11:8080, Ollama
10.42.1.12:11434 (`llava`), all VMs on the GPU blade 10.42.1.5; workstation 10.42.50.17.

**Merchants** (Cur §0.6): `AUTO-US-NOPIN-01`, `AUTO-US-NOPIN-02` (PIN bypass; the only kind ADB bots
may use), `GO-SDK-US-01` (App ID `app_sim_7f3a`, App Secret `app_secret_sim_5d21` [illus.], API Key
`key_sim_19c0e2`), `PAYCORE-STANDALONE-01`, `WESTERS-CA-01`, plus `WESTERS-CA-02` [illus., this doc].
**Card profiles** (Cur §0.6): `VISA_STD_SWIPE` (Track Data), `VISA_STD_DIP` → `cards/emv/visa_std_dip.json`,
`VISA_STD_TAP` → `cards/nfc/visa_std_tap.json`, `INTERAC_CA_DIP` → `cards/emv/interac_ca_dip.json`,
PayCore-owned `AMEX_MATRIX_DIP`, `DISCOVER_MATRIX_DIP`; plus `INTERAC_CA_TAP` →
`cards/nfc/interac_ca_tap.json` [illus., this doc]. Scheduled clone task `GortCardSync` on each
Windows box; local path `C:\gort\cards\…`.

**Power layout** [illus. layout; real chain]: each rack has a 24 V → 5 V 10 A step-down with an input
switch and one inline blade fuse feeding that rack's Pis — `F-RACKA-5V`, `F-RACKB-5V` (the
curriculum's `prop.fuse-5v-b`; also feeds the Rack B camera host), `F-BENCH-5V` (tethered-rack and
ADB-shelf Pis). `NUC-03` hangs off a 24 V → 12 V step-down through `F-NUC-12V`. Holder labels read
"10A". Mean Well `MW-1` (label "MEAN WELL · INPUT 120VAC · OUTPUT 24VDC") feeds the 24 V rail. AC power
strips: `STRIP-A` (Rack A), `STRIP-B` (Rack B), `STRIP-T` (tethered rack + ADB shelf), `STRIP-W` (power
wall bench); 6 outlets each. Each touch robot's front POWER panel has **MAIN** (controller side: the
rig's Pi lead, tablet charging, webcam) and **MOTOR** (stepper/solenoid driver) with a green LED each.

### 3.2 Evidence formats (exact strings the sim must produce)

**Orca Notes** (robot detail → Notes, newest first; format from Cur M06/M18):
```
2026-10-05 08:15:00 GET http://10.42.10.12:8000/health → connect timed out after 10000 ms
2026-10-05 08:15:00 GET http://10.42.10.11:8000/health → Connection refused
2026-10-05 08:15:00 GET http://10.42.10.13:8000/health → 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}
2026-10-05 08:20:00 GET http://10.42.10.12:8000/health → 200 OK · status restored to Available
2026-10-05 08:21:13 STATUS Available → Reserved (riley)
```
Lines 2, 4 and 5 are [illus.] extensions in the same format. Healthy body (Cur M05):
`HTTP/1.1 200 OK` + `{"status":"ok","robot":"wall-e"}`.
**Orca health log** (separate view, Cur §7): `baymax  SKIPPED (Offline)`; for Reserved rigs
`eve  RESERVED — not overridden` [illus.].

**Pi LEDs:** red **PWR** (solid when powered), green **ACT** (irregular 2–12 Hz flicker = healthy; solid
on/off > 10 s with PWR on = hung). Ethernet jack: green link/activity, amber speed. **Windows box:**
front blue power LED + small screen showing "Callus service · listening on :9000 · probes: …"
(Cur M10). **Collis probe:** status LED green (ready), amber (no ribbon link), off (no power).
**POWER panel:** green LED above MAIN and MOTOR.

**Tablet header:**

| Banner | Text | Condition |
|---|---|---|
| Green | `Status: OK` | homed, magnetic lock engaged, controller reachable |
| Yellow | `Status: LOCK RELEASED — PARK REQUIRED` (Cur S13) | lock released by a manual move, or steppers re-enabled / MOTOR restored without homing |
| Grey | `Status: CONTROLLER UNREACHABLE` [illus.] | tablet cannot reach its Pi (Pi off/hung). The tablet ↔ Pi link is USB [illus.], so a network-only fault leaves the tablet **green** |
| Overlay | `TEST IN PROGRESS — CONTROLS LOCKED` (Cur S13) | a job has the rig checked out (dashboard lockout) |

**Camera app:** `Stream unavailable — <url>` when the MJPEG endpoint refuses or times out.

**Jenkins console** (prefixes follow Cur §0.6/M06/M08/M11): `[orca]`, `[runner]`, `LSTR`, `[callus]`,
`[ocr]`, `[vision]`, `ubi:`, `laz:`, `[device]`, env block `RUN_TYPE=… DEVICE_TYPE=… ROBOT_NAME=…
PORT_NUMBER=5444 THEME=avocado KERNEL_TYPE=CPA APP_ID=… APP_SECRET=**** API_KEY=****`; checkout
`[orca] checkout → wall-e (FLEX_3) OK`; named checkout `Checked out robot rosie (named)`; release
`[orca] released wall-e → Available` / `[orca] released rosie → Unavailable` [illus.]; last line
`Finished: SUCCESS` / `Finished: FAILURE`.

**Orca REST** (Cur S06): `POST /api/xy_touch {"robot","screen","button"}` →
`{"result":"OK","mode":"PHYSICAL_TAP"|"ADB_TOUCH","x_mm":…,"y_mm":…}`;
`POST /api/card/{swipe|dip|tap} {"robot","profile"}`; Pi URL mappings `/adb`, `/dip`, `/tap`, `/swipe`
(e.g. `http://10.42.10.15:8000/tap`).

### 3.3 Success-condition DSL, global wrong actions, process bonuses

**State paths** used in success conditions (the sim doc exposes these; names may map):

| Path | Values |
|---|---|
| `orca.robot(R).status` | `AVAILABLE` `UNAVAILABLE` `OFFLINE` `CONNECTION_FAILED` `RESERVED` |
| `orca.robot(R).{name, hrn, reservedBy, deviceId, mfdDeviceId, cfdDeviceId, offsets.x, offsets.y, urls.adb, urls.camera, urls.dip, urls.tap, urls.swipe, capabilities}` | offsets in mm |
| `orca.robot(R).lastHealth.{at,http,error}`; `orca.robot(R).statusHistory[]` | |
| `orca.device(D).{exists,type,serial,ip}` | |
| `orca.screenLocation(deviceType, screen, button).{x,y}` | mm from the screen's top-left (0,0) |
| `orca.screenCompare(id).{x,y,w,h,expected,deprecated}` | px |
| `orca.merchant(M).{appId,appSecret,apiKey,ubiRoute,…}` | |
| `orca.cardProfile(P).{kind,trackData,gortPath}` | |
| `hw.pi(host).{power,os,eth}`; `hw.pi(host).svc(name)` | power `ON/OFF`; os `RUNNING/HUNG/BOOTING/OFF`; eth `LINKED/UNPLUGGED/DAMAGED`; svc `UP/DOWN` |
| `hw.fuse(F).{state,rating}` | `OK/BLOWN`, amps |
| `hw.outlet(strip, n).load`, `hw.dcTerminal(id).load` | device/probe id or null |
| `hw.box(B).{power,svc(name),diskFreeGB}` | |
| `hw.rig(R).{main,motor,steppersEnabled,homed,magLock,banner,solenoidConnector,dipArmAligned,cradle,motionHost}` | |
| `hw.collis(C).{power,ribbon,state}` | power `OFF/AC`; ribbon `SEATED/UNSEATED`; state `OK/FRIED` |
| `hw.device(D).{power,state,adbTcpPort,activeMerchant,psuOn}` | state `OK/BOOTING/DEAD/FRIED` |
| `hw.camera(K).{svc,usb}` | |
| `jenkins.job(path).{lastBuild.result,lastBuild.params,lastBuild.robot,folder,script}`; `greenStreak(path, R)` | |
| `adb.connections` (workstation) | set of `host:port` |
| `prop(file, key)`; `fs(host, path)` | file contents |
| `git(repo).main.file(path)`; `git(repo).pr(n).{state,comments,verdict}` | |
| `ide.localRun(test).{result,robot,overlappedJenkins}`; `ide.localRunStreak(test)` | |
| `svc(host, name)` | `UP/DOWN`; hosts `pi-<rig>`, `pi-10.42.10.x`, `orca-vm`, `ollama-vm`, `MINIX-0n`, `NUC-03` |
| `link(mfdDevice, cfdDevice)` | Pay Display link `UP/DOWN` |
| `coworker(riley).deviceIdle` | no workstation session drives `10.42.60.4` |
| `ticket.reply`, `ticket.call`, `ticket.escalation.{cause,endpoint}`, `bug.fields` | chosen ids / filed values |
| `counter(name)` | per-ticket action counters (e.g. `powerCycles(R)`) |
| `truth(…)`, `truthText`, `canonicalTracks` | seeded ground truth for measured/typed values |
| `next build on R`, `next PLn` | first pipeline run that starts after the fix |

Conditions are evaluated on **Resolve**; ones mentioning "next health check"/"next build" are
evaluated at that event (ticket shows "Verifying… waiting for 08:20 health check" and auto-completes;
the player can work other tickets meanwhile).

**Global wrong actions (GW)** — penalised in every incident and during free roam in a shift:

| ID | Action | Penalty | Strike | World consequence | Tag |
|---|---|---|---|---|---|
| GW01 | Connect a LabSim device (or its PSU lead) to any DC rail/regulator terminal | −500 | yes ("Fried hardware", Cur M03) | Device `FRIED` (spark, smoke); follow-up "Replace fried device" ticket | `power.18v` |
| GW02 | Connect a Collis probe to any DC terminal | −750 | yes | Probe `FRIED`; rig loses card actions; spare from the locked cabinet costs 120 s | `power.18v`, `hw.collis` |
| GW03 | Remove/insert a fuse with its branch live (regulator input on / MAIN on) | −200 | no | Spark + snap | `power.fuses` |
| GW04 | Fuse rating ≠ holder label | −250 | no | Over-rated: flagged unsafe; under-rated (5 A): blows again within 20 s | `power.fuses` |
| GW05 | Set a `paycore` rig to `Available` | −400 | if an overwrite follows | 40 % per checkout cycle that a general pipeline takes it and Laz swaps its merchant → INC40 | `orca.status.unavailable` |
| GW06 | Push/drag a gantry carriage by hand | −100 | no | Lock released, banner yellow | `hw.motion` |
| GW07 | Toggle MAIN/MOTOR or press any motion button on a rig with an active test | −250 | no | Running build fails; coworker bark | `hw.lockout` |
| GW08 | Use port 5555 (config, `adb connect`, `adb tcpip 5555`, Orca URL) | −300 | if it reaches 10.42.60.x | Riley's desk Flex gets driven (INC27) | `adb.port` |
| GW09 | Delete a Device row that is a robot's legacy/rollback device | −300 | no | Rollback impossible (INC43 much longer) | `orca.device` |
| GW10 | Change an existing Device row's `type`/serial in place for a hardware swap | −300 | no | Legacy config lost | `orca.device` |
| GW11 | Uninstall/disable the corporate security agent or delete its logs | −800 | yes | "Security policy violation" email in LabChat | `hw.nuc` |
| GW12 | Escalate a non-escalatable issue to Jared | −100 | no | 20 s bounce + teaching bark | `people.roles` |
| GW13 | Restart the Orca/Jenkins/Ollama VM or power-cycle the GPU blade | −500 | no | All running builds fail; VMs down 45 s (they share the blade) | `arch.infra` |
| GW14 | Edit any file under `uia-remote/app/src/main` | −200 | no | PR auto-flagged by Morgan | `uia.layout` |
| GW15 | `theme` ≠ `avocado` or `kernelType` ≠ `CPA` | −100 | no | Local run fails at setup | `uia.config` |
| GW16 | Resolve a ticket whose success condition is false | −100 | no | Combo reset; ticket stays open | — |
| GW17 | Redundant power-cycle (target already booting or healthy) | −50 each | no | Recovery slips to the next health check | `orca.healthcheck` |
| GW18 | Enter non-zero Offsets to compensate for coordinate problems | −150 | no | Masks the root cause | `orca.offsets` |
| GW19 | Abort another engineer's running job without cause | −200 | no | Coworker complaint | `hw.lockout` |
| GW20 | Change a rig away from `Reserved` set by someone else without asking | −150 | no | Their local run collides with Jenkins | `orca.status.reserved` |
| GW21 | Ω mode on a powered circuit | −50 | no | Meter shows "ERR" | `power.fuses` |
| GW22 | Edit a robot's **Name** (system identifier) when the Human Readable Name was meant | −100 | no | Pipelines and named jobs lose the robot until reverted (Tate: "Name is the system identifier. Pipelines use it. Leave it.") | `orca.names` |
| GW23 | Unplug or power off a coworker's desk device to stop a collision | −100 | no | Riley annoyed; the config is still wrong | `adb.port` |
| GW24 | Manually set a `Connection Failed` rig to `Available` while the cause persists | −200 | yes | A pipeline checks out a dead rig (red build); next ping flips it back | `orca.status.connfailed` |

**Process bonuses (PB):**

| ID | Behaviour | Bonus |
|---|---|---|
| PB01 | Rig set `Offline` before physical rebuild/upgrade work and back after verification | +50 |
| PB02 | Confirmation build triggered after the fix goes green before Resolve | +50 |
| PB03 | Coordinate change landed through a Gort PR merged by Jared (not only a direct Orca edit) | +75 |
| PB04 | Pigeon JSON fixed by pasting from `tests/_templates/known_good_actions.json`, or located with `git diff` | +25 |
| PB05 | Legacy Device row kept and new one linked (upgrades) | +50 |
| PB06 | Reserving engineer asked in LabChat before touching a Reserved rig | +25 |
| PB07 | Power off (regulator input / MAIN / MOTOR) before touching wiring, fuses or ribbons | +25 |
| PB08 | Hands-on fix of an escalatable hardware incident at rank Lab Technician or above (§2.3.7) | +50 |

### 3.4 Incident entry template
Header table: difficulty 1–5 · base points · par time (m:ss real) · severity · rigs (role + default) ·
escalatable · **Unlocked by** (curriculum module) · tags. Then: **Ticket** (normal title + misleading
variant) · **Initial state** · **Symptoms** (prefixed by where: `[Orca]` `[Notes]` `[Jenkins]`
`[Tablet]` `[LED]` `[Camera]` `[Terminal]` `[World]` `[LabChat]` `[IDE]` `[GitHub]` `[GIMP]`
`[Ollama]`) · **Diagnosis path** (ordered) · **Fix** (by-the-book escalation and/or hands-on) ·
**Success** (DSL) · **Diagnosis Call** (A is correct; UI shuffles; each distractor has a
`wrongCallHint` in content) · **Wrong-but-tempting** · **Teaches** · **Variants**.

### 3.5 Incidents

#### INC01 — Connection Failed: crashed Pi
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 250 | 3:00 | P1 | any rig (default WALL-E) | yes | M06 | `orca.status.connfailed` `orca.healthcheck` `orca.notes` `hw.pi` `orca.robot` `people.roles` |

* **Ticket:** "WALL-E failed checkout — Connection Failed" (Jenkins Bot). Misleading: "WALL-E's tablet froze, can someone restart the tablet?" (Riley).
* **Initial state:** `hw.pi(10.42.10.11).os = HUNG`; the last health check failed → `CONNECTION_FAILED` (pre-failure `AVAILABLE`).
* **Symptoms:** `[Orca]` red `Connection Failed` chip; checkout attempt toast "Robot is blocked from checkouts (Connection Failed)" (Cur M06); `[Notes]` `2026-10-05 08:15:00 GET http://10.42.10.11:8000/health → connect timed out after 10000 ms`; `[Jenkins]` PL1 `[orca] no Available FLEX_3 robot — build waiting in queue`; `[Tablet]` grey `Status: CONTROLLER UNREACHABLE`; `[LED]` Pi PWR red solid, **ACT solid on (no flicker)**, Ethernet LEDs lit; `[Camera]` `Stream unavailable — http://10.42.10.11:8081/stream.mjpg`; `[Terminal]` `ping -c 3 10.42.10.11` → `3 packets transmitted, 0 received, 100% packet loss`; `ssh pi@10.42.10.11` → `ssh: connect to host 10.42.10.11 port 22: Connection timed out`.
* **Diagnosis path:** 1) Orca robot list → filter Status = Connection Failed (Tate's filter UI) → WALL-E → Notes (endpoint + error). 2) Terminal ping/ssh — no answer. 3) WALL-E's shelf: hold `RMB` on the Pi — PWR on, ACT frozen ⇒ powered but hung. 4) Call or escalate.
* **Fix (by the book):** Escalate: endpoint `http://10.42.10.11:8000/health`, cause A. Jared power-cycles the Pi.
* **Fix (hands-on):** unplug WALL-E's Pi lead (`E`), wait ≥ 5 s, re-plug — or MAIN off/on (also restarts tablet and webcam; only with no active test). Boot 40 real s (ACT flickers, tablet turns green). Wait for the next health check.
* **Success:** `hw.pi(10.42.10.11).os == RUNNING && orca.robot(wall-e).lastHealth.http == 200 && orca.robot(wall-e).status == AVAILABLE` (at the next health check).
* **Diagnosis Call:** **A. Pi board hung — needs a power cycle** · B. Ethernet cable unplugged · C. Rack A 5 V fuse blown · D. Callus box offline.
* **Wrong-but-tempting:** set WALL-E Available by hand (GW24); reboot the tablet (no effect); power-cycle again while it boots (GW17); restart Orca (GW13).
* **Teaches:** Ref §3 Connection Failed (5-minute ping; no response ⇒ blocked; Notes log endpoint + error; crashed Pi; escalated to Jared). Ref §1 Pi = Robot Controller.
* **Variants:** **B (service crash):** OS fine, `robot-controller` down → `[Notes]` `… → Connection refused`; ACT flickers normally; tablet grey; `ssh pi@10.42.10.11` works; `systemctl status robot-controller` → `Active: failed (Result: exit-code)`; hands-on fix `sudo systemctl restart robot-controller`. **C (shared Pi):** the ADB-shelf Pi `10.42.10.30` hangs → DATA **and** TARS fail at the same timestamp (one Pi, two rigs).

#### INC02 — Connection Failed: Callus box offline
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:30 | P1 | rigs served by one Callus box (default MINIX-01 → WALL-E, EVE, BUMBLEBEE, R2-D2) | yes | M06 | `orca.status.connfailed` `cards.callus` `hw.nuc` `orca.notes` |

* **Ticket:** "Four Rack A rigs Connection Failed at 08:15" (Jenkins Bot). Misleading: "Rack A lost power?" (Alex).
* **Initial state:** `hw.box(MINIX-01).power = OFF` (Windows update shut it down).
* **Symptoms:** `[Orca]` WALL-E, EVE, BUMBLEBEE, R2-D2 Connection Failed with the **same** timestamp; `[Notes]` `GET http://10.42.10.13:8000/health → 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}` (Cur M18); `[LED]` all four Pis healthy; MINIX-01 blue LED off, its screen dark; `[Tablet]` green (Pis fine); `[Camera]` streams fine; `[Terminal]` `curl -i http://10.42.10.13:8000/health` → `HTTP/1.1 502 Bad Gateway` + same JSON; `ping 10.42.20.1` → 100 % loss.
* **Diagnosis path:** 1) Simultaneous failures → shared dependency. 2) Notes: the Pi *answered* (502) and names the Callus upstream. 3) Ping the box. 4) Walk to `loc.callus-shelf` → MINIX-01 dark. 5) Escalate or fix.
* **Fix (by the book):** Escalate: endpoint any of the four health URLs, cause A (Cur M18 Capstone 1 wording: "the Pi answers 502 because the Minix box running Callus at 10.42.20.1 is unreachable").
* **Fix (hands-on):** press MINIX-01's power button; Windows boot 50 real s; screen shows "Callus service · listening on :9000 · probes: WALL-E, EVE, BUMBLEBEE, R2-D2"; next health check.
* **Success:** `svc(MINIX-01,"Callus") == UP && ∀R∈{wall-e,eve,bumblebee,r2-d2}: orca.robot(R).status == AVAILABLE`.
* **Diagnosis Call:** **A. The Minix box running Callus is down** · B. Rack A 5 V fuse blown · C. All four Pis crashed · D. Collis probes unpowered.
* **Wrong-but-tempting:** power-cycle the Pis (GW17 ×4); edit card paths (−100, Cur §6 wrong move); multimeter the 5 V rail (5.1 V — time lost).
* **Teaches:** Ref §3 — Connection Failed causes include "a Minix box running Callus services going offline"; Ref §1 Callus on Windows/Minix boxes drives the Collis probes.
* **Variants:** **B:** MINIX-02 down → JOHNNY-5, BAYMAX, SETI, ROSIE, MEGATRON, OPTIMUS fail together (ROSIE returns to Unavailable after recovery). **C:** box on but Callus stopped → `ping` OK, `curl http://10.42.20.1:9000/status` → `curl: (7) Failed to connect to 10.42.20.1 port 9000: Connection refused`; hands-on `ssh automation@10.42.20.1` → `sc query Callus` (`STATE : 1 STOPPED`) → `sc start Callus`.

#### INC03 — Connection Failed: Rack B 5 V fuse blown
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 4:30 | P1 | one rack (default Rack B: JOHNNY-5, BAYMAX, SETI, ROSIE) | yes | M03 | `power.fuses` `power.rails` `hw.pi` `orca.status.connfailed` |

* **Ticket:** "Rack B: four rigs Connection Failed" (Jenkins Bot). Misleading: "JOHNNY-5's Pi is dead, swap in a new $50 Pi?" (Alex).
* **Initial state:** `hw.fuse(F-RACKB-5V).state = BLOWN` → Pis 10.42.10.15–.18 and camera host 10.42.10.40 unpowered. ROSIE's pre-failure status is Unavailable.
* **Symptoms:** `[Notes]` the four rigs: `→ connect timed out after 10000 ms`, same timestamp; `[LED]` all four Rack B Pis **completely dark** (no PWR); `[Tablet]` JOHNNY-5, BAYMAX, SETI, ROSIE grey; `[Camera]` Rack B shared stream unavailable; `[World]` fuse window shows a broken element (flashlight `F` + inspect); multimeter: `MW-1` out 24.1 V DC · Rack B 5 V regulator out 5.08 V · load side of `F-RACKB-5V` 0.00 V · fuse (removed, power off) Ω `OL` (Cur M03).
* **Diagnosis path:** 1) Several rigs on one rack, all Pis dark ⇒ shared power path. 2) Multimeter down the chain: 24 V present → 5 V present → 0 V after the fuse ⇒ fuse. 3) Regulator input off, pull fuse, Ω `OL` confirms. 4) Call or escalate.
* **Fix (by the book):** Escalate: endpoint any of the four, cause A.
* **Fix (hands-on):** switch the Rack B regulator input off (PB07) → remove the blown fuse → take a **10 A (red)** blade fuse (matches the "10A" label) → insert → input on → Pis boot (40 s; "boot chime", Cur M03) → next health check.
* **Success:** `hw.fuse(F-RACKB-5V).state == OK && rating == 10 && ∀R∈{johnny-5,baymax,seti}: status == AVAILABLE && orca.robot(rosie).status == UNAVAILABLE`.
* **Diagnosis Call:** **A. Rack B 5 V inline fuse blown** · B. Four Pis crashed · C. Mean Well failed · D. MINIX-02 offline.
* **Wrong-but-tempting:** replace the 12 V NUC fuse (−100, Cur §6 wrong move; no effect); swap a Pi (90 s, still dark); 15 A blue fuse (GW04); 5 A tan (GW04, blows again); pull the fuse live (GW03); Ω on a live circuit (GW21); set ROSIE Available after recovery (GW05).
* **Teaches:** Ref §6 power chain: 24 V rail → step-downs → 5 V DC 10 A for Pis, protected by inline fuses; Ref §3 multi-rig Connection Failed; Unavailable survives recovery [illus. restore rule, SR01].
* **Variants:** **B:** Rack A (`F-RACKA-5V`). **C (compound, H3+):** fuse + JOHNNY-5's Ethernet unplugged — after the fuse fix JOHNNY-5 still fails while its tablet is green (INC04).

#### INC04 — Connection Failed: Ethernet unplugged
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 200 | 2:30 | P1 | any rig with its own Pi (default BUMBLEBEE) | yes | M06 | `orca.status.connfailed` `hw.pi` `orca.notes` |

* **Ticket:** "BUMBLEBEE Connection Failed" (Jenkins Bot). Misleading: "BUMBLEBEE's Pi crashed again".
* **Initial state:** `hw.pi(10.42.10.13).eth = UNPLUGGED` (cable tugged when a parts bin was moved).
* **Symptoms:** `[Notes]` `GET http://10.42.10.13:8000/health → connect timed out after 10000 ms`; `[LED]` PWR on, **ACT flickering normally**, Ethernet jack LEDs **off**; cable end dangling behind the cradle; `[Tablet]` **green** `Status: OK`; `[Camera]` unavailable from the workstation; `[Terminal]` `ping` 100 % loss.
* **Diagnosis path:** tablet green but Orca red ⇒ Pi alive, network not → inspect the jack → Call or escalate.
* **Fix (by the book):** Escalate: endpoint `http://10.42.10.13:8000/health`, cause A.
* **Fix (hands-on):** re-seat the cable (`E` on the loose end, then on the jack); link LEDs light; next health check.
* **Success:** `hw.pi(10.42.10.13).eth == LINKED && orca.robot(bumblebee).status == AVAILABLE`.
* **Diagnosis Call:** **A. Network cable disconnected** · B. Pi hung · C. Rack A fuse blown · D. Orca health thread stuck.
* **Wrong-but-tempting:** power-cycle the Pi (GW17); toggle MAIN (GW17); edit the Robot ADB Service URL (−100).
* **Teaches:** Ref §3 — the health check is a REST ping over the network; a healthy tablet vs a failed ping localises the fault.
* **Variants:** **B (damaged cable):** link LED flickers; Notes alternate OK/failed across checks; fix with the spare Ethernet cable (hotbar 4); success needs two consecutive OK checks.

#### INC05 — Patience is a fix (health-check timing)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 150 | 1:30 | P2 | any (default WALL-E) | no | M06 | `orca.healthcheck` `orca.status.offline` `orca.status.connfailed` |

* **Ticket:** "I fixed WALL-E's Pi two minutes ago but Orca still says Connection Failed. Reboot it again?" (Riley).
* **Initial state:** Pi healthy; status `CONNECTION_FAILED`; next health check 20–50 real s away.
* **Symptoms:** `[Terminal]` `curl -i http://10.42.10.11:8000/health` → `HTTP/1.1 200 OK` `{"status":"ok","robot":"wall-e"}`; `[Notes]` newest line is the old failure; `[HUD]` "Next health check 0:34"; `[Tablet]` green.
* **Diagnosis path:** verify 200 yourself → compare the Notes timestamp with the game clock → reply → don't touch it.
* **Fix:** LabChat reply **`R_WAIT_PING`** and wait.
* **Success:** `ticket.reply == R_WAIT_PING && orca.robot(wall-e).status == AVAILABLE && counter(powerCycles(wall-e)) == 0`.
* **Diagnosis Call:** **A. Pi is healthy; Orca hasn't re-pinged yet** · B. Pi still broken · C. Orca's health thread crashed · D. Needs Jared.
* **Wrong-but-tempting:** reboot again (GW17 — misses the upcoming ping); escalate (GW12); set Available by hand (GW24 is not charged here because the cause is gone, but −50 "let Orca confirm it").
* **Teaches:** Ref §3 — 5-minute synchronized background ping; recovery is observed at the next ping.
* **Variants:** **B (Offline bypass):** "BAYMAX's Pi is unplugged but Orca shows no error — is health checking broken?" BAYMAX is `Offline` (being rebuilt); health log `baymax  SKIPPED (Offline)`. Success `ticket.reply == R_OFFLINE`.

#### INC06 — Reserved hides a dead Pi
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 350 | 3:30 | P2 | any touch rig (default EVE) | yes | M06 | `orca.status.reserved` `orca.healthcheck` `hw.pi` |

* **Ticket:** "My local run on EVE keeps failing, but Orca says EVE is fine" (Riley).
* **Initial state:** EVE `RESERVED`, `reservedBy = riley`; `hw.pi(10.42.10.12).os = HUNG` (or its Pi lead unplugged — `prop.eve.pi-power`, random).
* **Symptoms:** `[LabChat]` Riley pastes `java.net.ConnectException: Failed to connect to /10.42.10.12:8000`; `[Orca]` status `Reserved`, no new Notes lines; health log `eve  RESERVED — not overridden`; `[LED]`/`[Tablet]` per cause; `[Terminal]` `curl` times out.
* **Diagnosis path:** Reserved blocks health-check overrides, so Orca's status says nothing about health → test the Pi yourself → inspect the shelf → Call or escalate.
* **Fix (by the book):** Escalate with endpoint `http://10.42.10.12:8000/health` (from your curl) and cause A; reply `R_FIXED` to Riley once Jared is done.
* **Fix (hands-on):** power-cycle / re-plug; verify `curl` 200; reply `R_FIXED`. Leave the reservation alone.
* **Success:** `hw.pi(10.42.10.12).os == RUNNING && orca.robot(eve).status == RESERVED && reservedBy == "riley" && ticket.reply == R_FIXED`.
* **Diagnosis Call:** **A. EVE's Pi is down; Reserved hides it from health checks** · B. Riley's config.properties is wrong · C. Orca is down · D. Port 5555 collision.
* **Wrong-but-tempting:** change the status to Available "so the health check runs" (GW20); reply "Orca says it's fine" (−100, ticket stays open).
* **Teaches:** Ref §3 Reserved — blocks Jenkins pipelines **and** health-check overrides.

#### INC07 — Offline rig being rebuilt
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 250 | 2:00 | P2 | `rebuild` (BAYMAX) | no | M06 | `orca.status.offline` `orca.healthcheck` `jenkins.checkout` `orca.status` |

* **Ticket:** "BAYMAX flapping to Connection Failed; pigeon-android-sale-swipe grabbed it" (Jenkins Bot). Misleading: "BAYMAX is broken, please fix its Pi".
* **Initial state:** Jared is rebuilding BAYMAX's gantry (Pi unplugged, door open, parts on the shelf); Alex set it `AVAILABLE` "to test the tablet".
* **Symptoms:** `[Orca]` BAYMAX Connection Failed; `[Notes]` `STATUS Offline → Available (alex)` then `→ connect timed out after 10000 ms`; `[Jenkins]` PL3 red on baymax: `adb: failed to connect to '10.42.30.16:5444': Connection refused`; `[World]` sticky note on BAYMAX "REBUILD IN PROGRESS — J".
* **Diagnosis path:** Notes history shows a manual change from Offline → walk over → unfinished rebuild → Call.
* **Fix:** Orca → BAYMAX → `Offline`.
* **Success:** `orca.robot(baymax).status == OFFLINE` and the next health log line is `baymax  SKIPPED (Offline)`.
* **Diagnosis Call:** **A. A rig under construction was set Available; it must be Offline** · B. BAYMAX's Pi crashed · C. Rack B fuse blown · D. Pipeline misconfigured.
* **Wrong-but-tempting:** finish wiring the Pi (it boots, the gantry is incomplete → red build −20); `Unavailable` (−100: "for specialised rigs that named jobs use; health checks still run"); `Reserved` (−100: "for your local runs").
* **Teaches:** Ref §3 Offline — manual placeholder while building a rig or assembling data profiles; health checks bypassed.

#### INC08 — Four camera streams go dark (shared camera)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 4:00 | P1 | shared Rack B camera (JOHNNY-5, BAYMAX, SETI, ROSIE) | no | M07 | `orca.urls` `vision.camera` `hw.pi` |

* **Ticket:** "contact-canada-pin-sale red: evidence capture failed" (Jenkins Bot). Misleading: "SETI's webcam is broken".
* **Initial state:** `svc(pi-10.42.10.40,"camera-stream") = DOWN`.
* **Symptoms:** `[Jenkins]` PL5 on SETI: `[vision] GET http://10.42.10.40:8081/stream.mjpg → Connection refused` → `Finished: FAILURE`; `[Camera]` JOHNNY-5, BAYMAX, SETI, ROSIE all `Stream unavailable — http://10.42.10.40:8081/stream.mjpg`; `[Orca]` the four rigs stay Available (the health endpoint does not cover the camera [illus.]); their URL Mappings show the **same** Camera Stream URL; `[Terminal]` `ssh pi@10.42.10.40` → `systemctl status camera-stream` → `Active: failed`.
* **Diagnosis path:** four rigs, one symptom → shared resource → Orca URL Mappings → ssh the camera host → Call.
* **Fix:** `sudo systemctl restart camera-stream`; confirm in the Camera app; rebuild PL5.
* **Success:** `svc(pi-10.42.10.40,"camera-stream") == UP && next PL5 == SUCCESS`.
* **Diagnosis Call:** **A. The shared Rack B camera service is down (one camera serves four rigs)** · B. SETI's webcam died · C. Camera URLs corrupted · D. Ollama down.
* **Wrong-but-tempting:** point each rig's Camera URL at its own Pi (−100 each; those Pis have no camera); power-cycle the four rig Pis (GW17 ×4); unplug the webcam (makes it worse).
* **Teaches:** Ref §3 URL Mappings — Camera Stream URL dedicated per Pi **or shared across 4 rigs** (Cur M07 step 8).
* **Variants:** **B:** the camera's USB lead pulled → `journalctl -u camera-stream -n 3` shows `Cannot open '/dev/video0': No such file or directory`; re-plug, then restart the service.

#### INC09 — Wrong rig on camera (copy-pasted URL)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P1 | dedicated-camera rigs (default R2-D2) | no | M07 | `orca.urls` `orca.screencompare` `vision.camera` |

* **Ticket:** "Duo CFD suite red: OCR reads nonsense" (Jenkins Bot).
* **Initial state:** `orca.robot(r2-d2).urls.camera = "http://10.42.10.11:8081/stream.mjpg"` (WALL-E's) after a bulk edit.
* **Symptoms:** `[Jenkins]` PL7: `[ocr] capture webcam → crop 236x44@412,288 → tesseract → "Tap, insert or swipe" → match=false`; `[Camera]` R2-D2's stream shows a Flex 3 under a solenoid (WALL-E's shelf); `[Notes]` `CONFIG urls.camera changed (alex)` [illus.].
* **Diagnosis path:** OCR text belongs to another device → open R2-D2's stream → wrong rig → URL Mappings → Call.
* **Fix:** Camera Stream URL → `http://10.42.10.14:8081/stream.mjpg`.
* **Success:** `orca.robot(r2-d2).urls.camera == "http://10.42.10.14:8081/stream.mjpg" && next PL7 == SUCCESS`.
* **Diagnosis Call:** **A. Camera Stream URL points at another rig's camera** · B. CFD copy changed · C. Tesseract broken · D. Box shifted.
* **Wrong-but-tempting:** set expected text to the nonsense (−150); move the box (no effect).
* **Teaches:** Ref §3 URL Mappings; the OCR workaround crops the **webcam** screenshot.

#### INC10 — Ollama down on the GPU blade
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 250 | 3:00 | **P3** | — (infra) | no | M17 | `vision.ollama` `arch.infra` `tools.terminal` |

* **Ticket:** "Vision PoC job red: can't reach the model" (Jenkins Bot; job `Java/vision-poc-receipt-check` [illus.]).
* **Initial state:** `svc(ollama-vm,"ollama") = DOWN`.
* **Symptoms:** `[Jenkins]` `curl: (7) Failed to connect to 10.42.1.12 port 11434: Connection refused`; `[Terminal]` same for `curl http://10.42.1.12:11434/api/tags`; `[Ollama]` app: "Model server unreachable"; `[World]` GPU blade fans spinning; Orca and Jenkins work (same blade ⇒ blade fine).
* **Diagnosis path:** Orca/Jenkins up ⇒ blade up → port refused ⇒ service → `ssh automation@10.42.1.12` → `systemctl status ollama` → `inactive (dead)`.
* **Fix:** `sudo systemctl restart ollama` → `curl http://10.42.1.12:11434/api/tags` → `{"models":[{"name":"llava:latest", …}]}` → rebuild.
* **Success:** `svc(ollama-vm,"ollama") == UP && jenkins.job("Java/vision-poc-receipt-check").lastBuild.result == SUCCESS`.
* **Diagnosis Call:** **A. Ollama service stopped** · B. GPU blade off · C. Camera stream down · D. llava model deleted.
* **Wrong-but-tempting:** power-cycle the GPU blade (GW13 — Orca, Jenkins and Ollama all live on it); working this P3 while a P1 is open (no penalty, but the summary flags it).
* **Teaches:** Ref §1 Ollama on the 4-GPU blade as a **proof of concept**; the blade also hosts the Orca and Jenkins VMs.

#### INC11 — Banner yellow after a manual arm move
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 200 | 2:00 | P1 | any touch rig (default WALL-E) | no | M04 | `hw.motion` `hw.tablet` |

* **Ticket:** "WALL-E taps aren't landing" (Jenkins Bot). Misleading: "Screen coordinates broke on WALL-E?" (Riley — who pushed the carriage aside to wipe the screen).
* **Initial state:** `hw.rig(wall-e).magLock = BROKEN, homed = false, banner = YELLOW`.
* **Symptoms:** `[Tablet]` yellow `Status: LOCK RELEASED — PARK REQUIRED`; `[Jenkins]` `[orca] xy_touch wall-e REGISTER_HOME/Register → 409 Conflict: LOCK_RELEASED (park required)` [illus.]; `[Camera]` carriage parked off to one side; `[LabChat]` Riley: "I just nudged the arm aside to wipe the screen."
* **Diagnosis path:** 409 / yellow banner → tablet → Call.
* **Fix:** tablet → **Motion Control** → Park → **Park All**. Steppers drive to the limit switches (click-click), coordinates (0,0), banner green.
* **Success:** `hw.rig(wall-e).homed && magLock == ENGAGED && banner == GREEN`.
* **Diagnosis Call:** **A. Manual move released the magnetic lock — Park All** · B. Screen Locations outdated · C. Steppers disabled · D. Offsets wrong.
* **Wrong-but-tempting:** push the carriage back by hand (GW06); Steppers Disable (Cur §6 wrong move; still yellow); Park XY/X/Y (homes those axes, banner stays yellow); MOTOR off/on (−50; still needs Park All); Offsets (GW18).
* **Teaches:** Ref §6 — manual move breaks the magnetic lock → yellow; Park All → limit switches (0,0) → green.

#### INC12 — "The tablet is frozen" (dashboard lockout)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 250 | 3:00 | P2 | any touch rig running a job (default WALL-E) | no | M04 | `hw.lockout` `hw.tablet` `hw.motion` |

* **Ticket:** "WALL-E's tablet won't respond, buttons greyed out — broken?" (Riley).
* **Initial state:** `Java/uia-remote-regression-flex #4127` running on WALL-E (≥ 30 s left). Variant B: banner also yellow and Riley wants it parked.
* **Symptoms:** `[Tablet]` overlay `TEST IN PROGRESS — CONTROLS LOCKED`; `[Orca]` `Available · in use by Jenkins #4127`; `[Camera]` solenoid tapping normally.
* **Diagnosis path:** read the overlay / Orca row → recognise the lockout → Call.
* **Fix:** reply **`R_LOCKOUT`**. Variant B: wait for #4127 to finish, then Park All.
* **Success:** `ticket.reply == R_LOCKOUT && counter(motionCommandsDuringRun(wall-e)) == 0` (+ B: banner GREEN after the build ended).
* **Diagnosis Call:** **A. Working as designed — dashboard lockout during an active test** · B. Tablet crashed · C. Pi hung · D. Lock released.
* **Wrong-but-tempting:** MAIN/MOTOR to "unfreeze" (GW07); abort #4127 (GW19); reboot the tablet (no effect).
* **Teaches:** Ref §6 — the global control dashboard locks out external users when tests are active.

#### INC13 — Arm won't move (steppers disabled / MOTOR off)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 200 | 2:00 | P1 | any touch rig (default BUMBLEBEE) | no | M04 | `hw.motion` `hw.tablet` `hw.rigbom` |

* **Ticket:** "BUMBLEBEE taps nothing, arm never moves" (Jenkins Bot).
* **Initial state:** A: `steppersEnabled = false` (Steppers → Disable during maintenance). B: `motor = OFF`.
* **Symptoms:** `[Jenkins]` `xy_touch … → 503 Service Unavailable: STEPPERS_DISABLED` (A) / `MOTOR_POWER_LOST` (B) [illus.]; `[Camera]` no motion; `[Tablet]` A: Steppers shows Disable active; B: green banner but motion buttons do nothing; `[LED]` B: MOTOR LED off, MAIN on.
* **Fix:** A: Steppers **Enable** → banner yellow (position unknown) → **Park All**. B: MOTOR on → banner yellow → **Park All**.
* **Success:** `steppersEnabled && motor == ON && homed && banner == GREEN`.
* **Diagnosis Call:** **A. Motor drive disabled (steppers off / MOTOR off)** · B. Pi crashed · C. Solenoid unplugged · D. Dashboard lockout.
* **Wrong-but-tempting:** MAIN off/on (reboots the Pi, −50); Enable without Park All (GW16 on resolve).
* **Teaches:** Ref §1/§6 rig components; tablet Steppers/Park groups; POWER panel MAIN vs MOTOR.

#### INC14 — Taps 1.5 mm low (legacy Offsets)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 350 | 3:30 | P1 | any touch rig (default BUMBLEBEE) | no | M07 | `orca.offsets` `orca.screens` `hw.motion` |

* **Ticket:** "BUMBLEBEE misses 'Charge' by a hair — low on every screen" (Morgan).
* **Initial state:** `orca.robot(bumblebee).offsets = {x: 0.0, y: 1.5}` (copied from a pre-calibration config; same seed as Cur M07).
* **Symptoms:** `[Camera]` every tap ~1.5 mm below its button on **all** screens; `[Jenkins]` `[orca] xy_touch bumblebee PAYMENT/Charge → x_mm 31.0 y_mm 90.5 (offsets +0.0/+1.5)` [illus.]; `[Orca]` Offset X 0.0 / Y 1.5 (tooltip "Legacy").
* **Diagnosis path:** uniform error across screens ⇒ robot-level → log shows offsets → robot record → Call.
* **Fix:** Offset Y = 0.0 → **Test tap** hits centre (Cur §7); optional Park All.
* **Success:** `orca.robot(bumblebee).offsets.x == 0 && offsets.y == 0 && next build on bumblebee == SUCCESS`.
* **Diagnosis Call:** **A. Leftover legacy Offsets** · B. Screen Locations wrong for MINI_3 · C. Limit switch broken · D. Receipt QR shift.
* **Wrong-but-tempting:** edit each Screen Location (−100 per row; breaks every MINI_3 rig — DATA, OPTIMUS — red builds there); Y = −1.5 to cancel (GW18).
* **Teaches:** Ref §3 Offsets — legacy mm adjustments for imprecise limit switches; Jared calibrated to true (0,0); mostly deprecated.

#### INC15 — Arm moves, nothing gets tapped (solenoid)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P1 | touch rigs (default EVE) | no | M04 | `hw.rigbom` `hw.tablet` `orca.xytouch` `arch.flow` |

* **Ticket:** "EVE: arm reaches the button, button never pressed" (Jenkins Bot). Misleading: "EVE coordinates are off".
* **Initial state:** `hw.rig(eve).solenoidConnector = LOOSE`.
* **Symptoms:** `[Camera]` gantry moves correctly, plunger never drops; `[Jenkins]` `{"result":"OK","mode":"PHYSICAL_TAP",…}` then `[runner] waitForScreen timed out: PaymentScreen`; `[Tablet]` Solenoid → Down makes no clack; `[World]` connector on the carriage hanging by its wires.
* **Fix:** MOTOR off (PB07) → re-seat → MOTOR on → Park All → Solenoid Down/Up clacks.
* **Success:** `solenoidConnector == SEATED && banner == GREEN && next build on eve == SUCCESS`.
* **Diagnosis Call:** **A. Solenoid not firing (connector)** · B. Coordinates off · C. Steppers disabled · D. Screen not rendered.
* **Wrong-but-tempting:** edit coordinates (−100); add waits in code (no effect).
* **Teaches:** Ref §1 remote-firing solenoids; Ref §3 `xy_touch` fires an ADB touch **or** a physical probe tap.

#### INC16 — Chip read errors (dip arm misaligned)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 350 | 4:00 | P1 | touch + collis rigs (default SETI) | no | M04 | `hw.collis` `hw.rigbom` `hw.tablet` `cards.diptap` |

* **Ticket:** "SETI Interac dips fail: 'Card read error'" (Jenkins Bot). Misleading: "INTERAC_CA_DIP profile corrupted?"
* **Initial state:** `hw.rig(seti).dipArmAligned = false` (sector gear slipped a tooth after a jam).
* **Symptoms:** `[Jenkins]` `[callus] map cards/emv/interac_ca_dip.json → C:\gort\cards\emv\interac_ca_dip.json · load virtual card OK · probe seti: DIP` then `[device] CHIP_READ_ERROR`; `[Camera]` the white card ribbon strikes the bezel above the slot; `[Tablet]` Dip → In shows the same miss; `[World]` the arm's index mark is one tooth off the "63" gear mark.
* **Fix:** Dip → Out → MOTOR off (PB07) → screwdriver: loosen the two 2.5 mm hub bolts → align marks → tighten → MOTOR on → Park All → Dip → In enters the slot.
* **Success:** `dipArmAligned && banner == GREEN && next PL5 == SUCCESS`.
* **Diagnosis Call:** **A. Dip arm misaligned** · B. Gort path wrong · C. Callus offline · D. Collis unpowered.
* **Wrong-but-tempting:** edit the card profile (−100); swap the Collis probe (120 s, no fix); 5 mm bolts (don't fit, −25).
* **Teaches:** Ref §1 Collis probes and dips; Ref §6 physical robotics kept for card dipping; hardware BOM (2.5 mm / 5 mm).

#### INC17 — "Can I run it off the 24 V tap?" (18 V device trap)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P1 | any rig whose device sits on a full strip (default EVE on STRIP-A) | no | M03 | `power.18v` `power.rails` |

* **Ticket:** "EVE's Flex 4 is back from repair with a new power brick. STRIP-A is full — OK to use the spare 24 V rail tap?" (Alex).
* **Initial state:** `hw.device(eve-flex4).psuOn = false`; the new Flex 4 brick (`prop.flex4-psu-brick`) lies on EVE's shelf; STRIP-A outlets 1–5 hold WALL-E/BUMBLEBEE/R2-D2 PSUs, MINIX-01, `collis-eve`; outlet 6 holds a **desk fan**; a free 24 V rail tap and the 12 V NUC line are within reach.
* **Symptoms:** `[Orca]` EVE Available (Pi fine) but `[Jenkins]` PL1 on eve red: `adb: failed to connect to '10.42.30.12:5444': No route to host`; `[World]` EVE's Flex 4 dark; strip full.
* **Diagnosis path:** device dark ⇒ needs power → recall the 18 V exception → find a non-lab load on the strip → Call.
* **Fix:** unplug the desk fan from STRIP-A outlet 6, plug the Flex 4 brick in; device boots (30 s).
* **Success:** `hw.outlet("STRIP-A",6).load == "psu-eve-flex4" && hw.device(eve-flex4).state == OK && next build on eve == SUCCESS`.
* **Diagnosis Call:** **A. Device unpowered; LabSim devices go on the AC strip, never the DC rail** · B. Pi crashed · C. Port 5555 · D. ADB TCP reset.
* **Wrong-but-tempting:** 24 V tap, 12 V NUC line or 5 V Pi line (GW01 — spark, Jared: "That's how we fry a terminal. Commercial AC strip. Always." (Cur M03), strike, follow-up ticket); unplug MINIX-01 or `collis-eve` to make room (−200, spawns INC02/INC18); daisy-chain a second strip (−50 "not lab practice" [illus.]).
* **Teaches:** Ref §6 18 V exception: LabSim devices draw an irregular 18 V; they and Collis probes bypass the DC rails and use commercial AC strips.

#### INC18 — Collis probe dark
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 3:30 | P1 | touch + collis rigs (default WALL-E / `collis-wall-e`) | no | M03 | `hw.collis` `power.18v` `cards.callus` |

* **Ticket:** "WALL-E swipes fail: 'Card not detected'" (Jenkins Bot).
* **Initial state:** A: `hw.collis(collis-wall-e).power = OFF` (PSU unplugged during a desk move). B: powered, `ribbon = UNSEATED`.
* **Symptoms:** `[Jenkins]` `POST /api/card/swipe {"robot":"wall-e","profile":"VISA_STD_SWIPE"}` → `[callus] probe collis-wall-e: PROBE_OFFLINE` [illus.]; `[Terminal]` `curl http://10.42.20.1:9000/status` → `{"callus":"UP","probes":[{"id":"collis-wall-e","state":"OFFLINE"},{"id":"collis-eve","state":"READY"},{"id":"collis-bumblebee","state":"READY"},{"id":"collis-r2-d2","state":"READY"}]}`; `[LED]` probe LED off (A) / amber (B); `[World]` grey "UL Transaction Security" box; a free 24 V barrel lead lies next to it.
* **Diagnosis path:** Callus up, one probe offline ⇒ probe-level → LED → Call.
* **Fix:** A: plug the probe PSU into STRIP-A. B: probe off, re-seat the rear ribbon cable, probe on. LED green.
* **Success:** `hw.collis(collis-wall-e).power == AC && ribbon == SEATED && state == OK && next PL3 on wall-e == SUCCESS`.
* **Diagnosis Call:** **A. Collis probe unpowered / ribbon unseated** · B. Callus box offline · C. Track data corrupted · D. Dip arm misaligned.
* **Wrong-but-tempting:** the 24 V barrel lead (GW02, strike — "treat them like gold", Cur M10); restart Callus (no effect); edit the card profile (−100).
* **Teaches:** Ref §1 Collis probes (UL Transaction Security), rear ribbon cables, high cost; Ref §6 AC-only power.

#### INC19 — NUC disk full from security monitoring
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 5 | 700 | 8:00 | P1 | default BUMBLEBEE | no | M05 | `hw.nuc` `hw.pi` `orca.status.connfailed` `orca.status.offline` |

* **Ticket:** "BUMBLEBEE Connection Failed — upstream errors from NUC-03?" (Jenkins Bot). Misleading: "BUMBLEBEE's Pi is dying".
* **Initial state:** last week, while BUMBLEBEE's Pi SD card was reflashed, someone moved its motor-controller USB (25-pin PCB) to `NUC-03` "temporarily", despite Jared's sticky note. NUC-03's disk is now full (corporate agent logs ≈ 118 GB); its motion service `:9100` returns 500.
* **Symptoms:** `[Notes]` `GET http://10.42.10.13:8000/health → 502 Bad Gateway {"error":"motion upstream 10.42.20.3:9100 error: No space left on device"}` [illus.]; `[Terminal]` `ssh automation@10.42.20.3` → `Get-PSDrive C` → `Used (GB) 237.9  Free (GB) 0.0`; `dir C:\ProgramData\SecAgent\logs` ≈ 118 GB [illus. path]; `[World]` NUC-03's sticky note "DISK 100% — corporate AGENT. NO HARDWARE CONTROL ON THIS BOX. –J"; a USB cable labelled `BUMBLEBEE MOTION` runs from the NUC to BUMBLEBEE's motor PCB; `[LabChat]` (after 60 s) Jared: "This is exactly why we moved hardware control onto the Pis."
* **Diagnosis path:** Notes JSON → motion upstream on the NUC, disk full → confirm on the NUC → recognise the fix is migration back to the Pi, not deleting security data → Call.
* **Fix (ordered):** BUMBLEBEE → `Offline` (PB01) → MOTOR off (PB07) → move `BUMBLEBEE MOTION` USB from NUC-03 to BUMBLEBEE's Pi → `ssh pi@10.42.10.13` → in `/etc/robot-controller/controller.yaml` change `motion: nuc://10.42.20.3:9100` to `motion: local` [illus.] → `sudo systemctl restart robot-controller` → `curl -i http://10.42.10.13:8000/health` → `200 OK` → MOTOR on → Park All → `Available`.
* **Success:** `hw.rig(bumblebee).motionHost == "PI" && homed && orca.robot(bumblebee).status == AVAILABLE && lastHealth.http == 200`.
* **Diagnosis Call:** **A. Motion control is on a security-monitored NUC whose disk is full; move it back to the Pi** · B. Pi SD card full · C. Callus crashed · D. 12 V fuse blown.
* **Wrong-but-tempting:** delete or disable the corporate agent/logs (GW11, strike); clear temp files (frees 2 GB; ticket re-opens 180 s later with −100); reboot the NUC (GW17; full again in 60 s).
* **Teaches:** Ref §1 — aggressive corporate security monitoring exhausted NUC disks, so physical hardware control migrated onto Raspberry Pis; Linux Pis isolate control loops from corporate Windows machines; 12 V branch powers NUCs.

#### INC20 — Receipt QR regression (lab-wide coordinate PR)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 4 | 600 | 7:00 | P1 | receipt rigs on 3 Device Types (FLEX_3, MINI_3, STATION_2018) | no | M09 | `receipt.qr` `receipt.maps` `orca.screens` `jenkins.logs` `tools.github` `people.roles` |

* **Ticket:** "pigeon-android-sale-swipe red on WALL-E, BUMBLEBEE and BAYMAX at 'select print' after this morning's firmware" (Jenkins Bot). Misleading: "Printers all jammed?"
* **Initial state:** the firmware's final build places the "scan for receipt" QR block so every receipt button sits **3.0 mm lower** (Cur S10) and shows the 5th option. `RECEIPT_OPTIONS_5` rows for FLEX_3, MINI_3 and STATION_2018 were measured on a pre-release build and are 3.0 mm too high; `RECEIPT_OPTIONS_4` is still correct for merchants without QR.
* **Symptoms:** `[Jenkins]` on each rig: `LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s` → `FAILED at "select print"` (Cur M15); `[Camera]` plunger lands ~3 mm above "Print" on the QR block's edge; `[World]` printers have paper; `[LabChat]` Jared: "Firmware drop today. Last time the QR button broke every ruler-measured coordinate for 48 hours. Let's beat that."
* **Diagnosis path:** same step fails on several rigs after an update ⇒ layout, not hardware → camera ⇒ tap above the button → measure each type's new positions (steel ruler snaps to the screen's top-left, Cur M09, or `adb exec-out screencap -p > r5.png` + GIMP + the Device Type's px/mm) → Call.
* **Fix:** GitHub → `gort` → branch `fix/receipt-qr-5opt` → edit `config/screen-locations/<DEVICE_TYPE>/RECEIPT_OPTIONS_5.json` [illus. path] for the three types → open PR → Jared reviews (20 s, Cur M09) and merges if every value is within ±0.5 mm (otherwise he comments, e.g. "Print on MINI_3 is still 3 mm high") → Orca syncs (SR16). Editing the Orca rows directly also satisfies the condition (without PB03). Example (FLEX_3; values from Cur §0.6):
  ```json
  {
    "deviceType": "FLEX_3",
    "screen": "RECEIPT_OPTIONS_5",
    "unit": "mm",
    "buttons": {
      "Print":            { "x": 34.0, "y": 74.0 },
      "Email":            { "x": 34.0, "y": 86.0 },
      "Text":             { "x": 34.0, "y": 98.0 },
      "No Receipt":       { "x": 34.0, "y": 110.0 },
      "Scan for receipt": { "x": 34.0, "y": 122.0 }
    }
  }
  ```
* **Success:** `∀t∈{FLEX_3,MINI_3,STATION_2018}, ∀b: |orca.screenLocation(t,"RECEIPT_OPTIONS_5",b) − truth(t,b)| ≤ 0.5 && RECEIPT_OPTIONS_4 rows unchanged && PL3 SUCCESS on two different rigs`.
* **Diagnosis Call:** **A. The QR layout shifted the buttons; the 5-option coordinates are stale** · B. Printers out of paper · C. Callus offline · D. Offsets on each rig.
* **Wrong-but-tempting:** reload paper; per-rig Offsets (GW18; Cur §6 wrong move); edit `RECEIPT_OPTIONS_4` (breaks QR-less merchants, −150); fix one type only (others stay red).
* **Teaches:** Ref §5 receipt QR regression (buttons shifted a few mm; 48 hours until Jared merged a coordinate PR; conditional 5th option; separate 4/5 maps); misleading "select print"; Ref §3 Screen Locations in mm.

#### INC21 — Missing 5-option receipt map
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 450 | 4:30 | P1 | a Device Type without `RECEIPT_OPTIONS_5` (default STATION_2018 / BAYMAX) | no | M09 | `receipt.maps` `orca.screens` `orca.devicetype` |

* **Ticket:** "BAYMAX email-receipt step fails since QR receipts were switched on" (Jenkins Bot).
* **Initial state:** STATION_2018 has `RECEIPT_OPTIONS_4` but **no** `RECEIPT_OPTIONS_5`.
* **Symptoms:** `[Jenkins]` `LSTR xy_touch baymax RECEIPT_OPTIONS_5/Email` → `[orca] 404 Not Found: no Screen Location for (STATION_2018, RECEIPT_OPTIONS_5, "Email")` [illus.] → `FAILED at "select email"`; `[Camera]` BAYMAX shows 5 options incl. "Scan for receipt"; arm idle; `[Orca]` Screens → STATION_2018 lists only `RECEIPT_OPTIONS_4`.
* **Fix:** measure the five buttons on BAYMAX (ruler, or screencap + GIMP + px/mm) → Screens → New `RECEIPT_OPTIONS_5` (STATION_2018) with 5 locations; keep `_4`; **Test tap** each (Cur §7); optionally land it as a Gort PR (PB03).
* **Success:** `∀b∈{Print,Email,Text,No Receipt,Scan for receipt}: |orca.screenLocation("STATION_2018","RECEIPT_OPTIONS_5",b) − truth| ≤ 0.5 && RECEIPT_OPTIONS_4 unchanged && next PL3 on baymax == SUCCESS`.
* **Diagnosis Call:** **A. STATION_2018 has no 5-option map** · B. Merchant misconfigured · C. Pigeon JSON names the wrong screen · D. Arm not homed.
* **Wrong-but-tempting:** switch the test to `RECEIPT_OPTIONS_4` (−150; taps "Text" where "Email" now sits); switch QR receipts off on the merchant (−100, "you'd stop testing the feature"); copy FLEX_3's values (different layout → still red).
* **Teaches:** Ref §5 — Orca keeps **separate** 4-option and 5-option maps for **every** device profile; Ref §3 Device Type holds dimensions/layout.

#### INC22 — The misleading "select print" log
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 450 | 4:30 | P1 | printer rigs (default JOHNNY-5, FLEX_1) | no | M15 | `jenkins.logs` `pigeon.lstr` `orca.screens` |

* **Ticket:** "JOHNNY-5: Pigeon fails at 'select print'" (Jenkins Bot). Misleading: "JOHNNY-5's printer is out of paper?" (Alex).
* **Initial state:** `orca.screenLocation("FLEX_1","RECEIPT_OPTIONS_4","Print").y = 62.5` (bulk-import typo; truth 66.5 [illus.]).
* **Symptoms:** `[Jenkins]` `LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s` → `FAILED at "select print"`; `[Camera]` (recorded playback for the build, Cur §7) plunger hits the gap above "Print"; `[World]` printer has paper and a settings test-print works; `[Orca]` the Print row shows "modified by bulk-import, yesterday".
* **Diagnosis path:** "select print" is only the last step attempted before the payload timeout → printer works → camera shows a miss → Orca row → Call.
* **Fix:** measure; set Y to 66.5 (±0.5); Test tap.
* **Success:** `|orca.screenLocation("FLEX_1","RECEIPT_OPTIONS_4","Print").y − 66.5| ≤ 0.5 && next PL3 on johnny-5 == SUCCESS`.
* **Diagnosis Call:** **A. Stale/incorrect coordinates made the arm miss Print, so no payload arrived** · B. Printer out of paper · C. The "select print" JSON is invalid · D. Timeout too short.
* **Wrong-but-tempting:** replace paper; raise the timeout in the JSON (−100, still fails); Offsets (GW18).
* **Teaches:** Ref §5 Misleading Failure Logs (Cur M15 step 9 wording).

#### INC23 — Printer test matched to a Flex Pocket
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 3:30 | P1 | PL6 (gets VISION, Flex Pocket) | no | M08 | `orca.capabilities` `hw.devices` `go.sdk` |

* **Ticket:** "go-sdk-sale-smoke red: printer not available" (Jenkins Bot).
* **Initial state:** `gort/go-sdk/tests/sale_receipt.json` lost `"printer": true` from its `"capabilities"` in yesterday's commit; Orca's dynamic lookup now matches VISION (`FLEX_POCKET`, same `FLEX_GEN3` profile, `hasPrinter=false`).
* **Symptoms:** `[Jenkins]` `[orca] checkout → vision (FLEX_POCKET) OK` … `[go-sdk] PrintReceipt → PRINTER_NOT_AVAILABLE` [illus.] → `Finished: FAILURE`; `[Orca]` Robot Capabilities for vision: `{"deviceType":"FLEX_POCKET","printer":false,…}`; **Match preview** (Cur §7) for the test lists `vision`, `tars`, `data`; `[GitHub]` the commit diff shows the removed line.
* **Fix:** IntelliJ or GitHub: add `"printer": true` back to the test's `"capabilities"` object → Match preview drops `vision` → rebuild.
* **Success:** `git(gort).main.file("go-sdk/tests/sale_receipt.json").capabilities.printer == true && next PL6 robot ∈ {data, tars} && SUCCESS`.
* **Diagnosis Call:** **A. The test's dynamic capabilities no longer require a printer, so it matched the Pocket** · B. TARS's printer broke · C. Receipt coordinates stale · D. DEVICE_TYPE case.
* **Wrong-but-tempting:** set VISION Offline or Unavailable (−100; Cur §6 wrong move — hides a valid printerless rig); hardcode `ROBOT_NAME=tars` (−50, bypasses capability matching).
* **Teaches:** canon/Ref §1 — Flex 3, 4 and Pocket share one testing profile, Pocket has no printer; Ref §3 dynamic JSON lookups live in the test definition and are parsed at runtime (SDK frameworks, David). The JSON key is `printer` (Cur M08); Orca matches it against the profile's `hasPrinter` (canon).

#### INC24 — Extract coordinates with GIMP for a Pigeon screen compare
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 5:00 | P2 | ADB-visible rigs (default EVE) | no | M16 | `pigeon.gimp` `pigeon.json` `adb.usage` |

* **Ticket:** "New Pigeon test `tests/sale/payment_success_compare.json` needs its screenCompare block filled for 'Payment Successful'" (Morgan).
* **Initial state:** block is `{ "action": "screenCompare", "params": { "x": 0, "y": 0, "w": 0, "h": 0, "expected": "Payment Successful" } }`; EVE shows the Payment Successful screen.
* **Symptoms:** `[Jenkins]` `Java/pigeon-android-payment-compare` [illus.]: `LSTR screenCompare: empty region (0x0)` → `FAILURE`.
* **Fix:** `adb -s 10.42.30.12:5444 exec-out screencap -p > payment_success.png` → GIMP **File → Open** → Rectangle Select around the text → Tool Options `Position 388, 512`, `Size 304 × 40` (seeded values vary) → write `{ "action": "screenCompare", "params": { "x": 388, "y": 512, "w": 304, "h": 40, "expected": "Payment Successful" } }` → commit, push, rebuild.
* **Success:** each edge within ±3 px of truth && `jenkins.job("Java/pigeon-android-payment-compare").lastBuild.result == SUCCESS`.
* **Diagnosis Call:** **A. Screen-compare region undefined — extract it in GIMP** · B. Tesseract down · C. Wrong screen · D. JSON syntax.
* **Wrong-but-tempting:** guess numbers (−50 per failed build); use a webcam snapshot of an ADB-visible screen (perspective/scale differ, −50).
* **Teaches:** Ref §5 GIMP Coordinate Extraction; Ref §1 GIMP and ADB.

#### INC25 — Pigeon JSON missing comma
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P2 | — (repo `pigeon`) | no | M15 | `pigeon.json` `pigeon.nolint` `tools.github` `pigeon.abstraction` `arch.repos` |

* **Ticket:** "Tip-sale Pigeon test dies instantly since Alex's 'add tip step' commit" (Jenkins Bot).
* **Symptoms:** `[Jenkins]` `Java/pigeon-android-tip-sale` [illus.]: `LSTR ParseError: Unexpected token { in JSON at line 9 column 5` → `FAILURE`; `[IDE]` no error highlighting (Pigeon project has no JSON inspections, Cur §7); `[Terminal]` `git log -1 --stat` → Alex's commit; `git diff HEAD~1` shows the new block. File `pigeon/tests/sale/tip_sale_print.json`:
  ```json
  {
    "name": "Swipe sale with 18% tip and printed receipt",
    "connectionType": "USB",
    "platforms": ["REST", "ANDROID", "WINDOWS", "IOS"],
    "actions": [
      { "action": "create order", "params": { "item": "Tax Item 5" }, "store": "orderId" },
      { "action": "card swipe",   "params": { "profile": "VISA_STD_SWIPE", "orderId": "${orderId}" }, "store": "paymentId" },
      { "action": "add tip",      "params": { "paymentId": "${paymentId}", "percent": 18 }, "store": "tipId" }
      { "action": "select print", "params": { "robot": "${ROBOT_NAME}", "screen": "RECEIPT_OPTIONS_4" } }
    ]
  }
  ```
* **Diagnosis path:** the error points at line 9 — the break is the missing comma at the end of line 8 → fix → Call.
* **Fix:** add the comma, or paste the action from `tests/_templates/known_good_actions.json` (PB04); commit; rebuild.
* **Success:** file parses && contains an `add tip` action && `jenkins.job("Java/pigeon-android-tip-sale").lastBuild.result == SUCCESS`.
* **Diagnosis Call:** **A. Malformed JSON (missing comma) — nothing lints it** · B. VISA_STD_SWIPE track data bad · C. Wrong platform list · D. Runner crashed.
* **Wrong-but-tempting:** `git revert` (green, but the tip step is gone — resolve fails); retype the file from scratch (allowed, slow).
* **Teaches:** Ref §5 JSON payload anatomy (name, connection type, 4–5 platforms, actions with parameters and stored outputs); no JSON linter; copy-paste survival; "card swipe" is abstracted per platform into an SDK request or a physical robot action.

#### INC26 — The job that "disappeared" (legacy Java vs iOS)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 250 | 2:30 | P2 | — | no | M11 | `jenkins.folders` `pigeon.lstr` `go.sdk` |

* **Ticket:** "Nightly Java run is missing `pigeon-windows-tender` — did someone delete it?" (Riley).
* **Initial state:** the job was created under the `iOS` view/folder instead of `Java`; the nightly trigger runs the `Java` jobs.
* **Symptoms:** `[Jenkins]` `Java` view lacks it; search finds `iOS/pigeon-windows-tender`; the `iOS` view otherwise holds `iOS/pigeon-ios-go-sdk-smoke` (ran today, Cur §0.6) and `iOS/pigeon-ios-lstr-legacy` [illus.] (last run 7 months ago).
* **Fix:** job ▸ **Move** ▸ `Java`.
* **Success:** `jenkins.job("Java/pigeon-windows-tender").exists && !jenkins.job("iOS/pigeon-windows-tender").exists`.
* **Diagnosis Call:** **A. Filed under iOS; legacy jobs are split Java vs iOS** · B. Deleted · C. Trigger broken · D. Permissions.
* **Wrong-but-tempting:** recreate it (−50 duplicate); delete the iOS copy first (−100, history lost).
* **Teaches:** Ref §1 Jenkins separates legacy Java jobs from iOS jobs; Ref §5 the iOS runner is rarely touched while iOS Go testing is active.

#### INC27 — Port 5555: "Something is tapping my desk Flex!"
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 350 | 3:00 | P1 | workstation + Riley's desk Flex (default target BUMBLEBEE) | no | M14 | `adb.port` `uia.config` `adb.usage` |

* **Ticket:** "SOMETHING IS TAPPING MY DESK FLEX BY ITSELF" (Riley).
* **Initial state:** your local `config.properties` has `portNumber=5555` (copied from Alex); a local run is in progress; the workstation's ADB server already knows `10.42.60.4:5555`.
* **Symptoms:** `[IDE]` runner log (Cur S19): `connect 10.42.30.13:5555 … refused` · `falling back to first known device: 10.42.60.4:5555` · `[runner] open Register`; `[World]` Riley's desk Flex shows Register with "Tax Item 5" in the cart; `[Terminal]` `adb devices` → `10.42.60.4:5555	device`.
* **Diagnosis path:** `adb devices` → coworker IP on 5555 → config → `portNumber=5555` → Call.
* **Fix:** **Stop** the run → `adb disconnect 10.42.60.4:5555` → `portNumber=5444` → `adb connect 10.42.30.13:5444` → re-run; apologise in LabChat (optional, Riley: "Ha. Welcome to the club.").
* **Success:** `prop(config,"portNumber") == "5444" && ¬∃c∈adb.connections: c.endsWith(":5555") && coworker(riley).deviceIdle`.
* **Incident penalty:** −20 per 10 s Riley's Flex is driven after the ticket arrives (cap −200); reaching it at all = strike (§2.3.9).
* **Diagnosis Call:** **A. portNumber 5555 — the runner fell back to a coworker's device** · B. Riley's Flex has malware · C. Orca routed to the wrong rig · D. Wrong deviceType.
* **Wrong-but-tempting:** unplug Riley's Flex (GW23, Cur §6 wrong move); `adb kill-server` only (recurs next run; resolve fails); 5556 (−100, "the lab standard is 5444").
* **Teaches:** Ref §4 portNumber locked to 5444; 5555 (ADB default) let scripts control coworkers' desk devices.

#### INC28 — ADB refused after a Laz OOBE
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 3:30 | P1 | any rig after a merchant swap (default DATA) | no | M08 | `adb.port` `adb.usage` `laz.oobe` `hw.pi` |

* **Ticket:** "DATA red after the merchant swap: adb connect refused" (Jenkins Bot).
* **Initial state:** Laz's OOBE wiped DATA; ADB-over-TCP was not re-enabled (`adbTcpPort = null`) [illus. consequence, SR12].
* **Symptoms:** `[Jenkins]` `[runner] adb connect 10.42.30.31:5444` → `failed to connect to '10.42.30.31:5444': Connection refused`; previous build: `laz: merchant active`; `[Orca]` DATA Available (shelf Pi healthy); `[World]` DATA on the new merchant's home screen.
* **Diagnosis path:** refused (not timeout) ⇒ device up, nothing listening → recent OOBE → Call.
* **Fix:** `ssh pi@10.42.10.30` → `adb devices` → `SIM-M3-000031	device` and `SIM-F4-000032	device` (USB) → `adb -s SIM-M3-000031 tcpip 5444` → `restarting in TCP mode port: 5444` → workstation `adb connect 10.42.30.31:5444` → `connected to 10.42.30.31:5444` → rebuild.
* **Success:** `hw.device(data-mini3).adbTcpPort == 5444 && next build on data == SUCCESS`.
* **Diagnosis Call:** **A. The OOBE wipe reset ADB-over-TCP — re-enable it on 5444** · B. Shelf Pi crashed · C. Port collision · D. Ethernet unplugged.
* **Wrong-but-tempting:** `adb tcpip 5555` (GW08); change Orca's ADB Service URL port (−100).
* **Teaches:** Ref §1 ADB on 5444; the Pi handles ADB routing; Laz wipes and re-provisions.

#### INC29 — Stale wiki config (theme / kernelType)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 200 | 2:00 | P3 | Alex's local run | no | M14 | `uia.config` |

* **Ticket:** "My first local run crashes at setup" (Alex).
* **Symptoms:** `[IDE]` (Alex's screen-share) `java.lang.IllegalStateException: Unsupported theme "classic" — only "avocado" is supported`, then after fixing `Unsupported kernelType "SPA" — use "CPA"` [illus. messages]; config shows `theme=classic`, `kernelType=SPA`.
* **Fix:** `theme=avocado`, `kernelType=CPA`; re-run.
* **Success:** `prop(alexConfig,"theme") == "avocado" && prop(alexConfig,"kernelType") == "CPA" && ide.localRun.result == PASS`.
* **Diagnosis Call:** **A. Deprecated theme/kernel values** · B. Wrong IP · C. Port · D. Missing passcode.
* **Wrong-but-tempting:** fix only theme (resolve fails); `kernelType=SPA` "because the device is old" (GW15).
* **Teaches:** Ref §4 theme locked to `avocado`; kernelType locked to `CPA` (Core Payments Application) replacing SPA (Secure Processor Application).

#### INC30 — Station Duo local run: MFD and CFD IPs
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P2 | `duo` (R2-D2, already Reserved by you) | no | M14 | `uia.config` `orca.tethered` `uia.multidevice` |

* **Ticket:** "Run TaxTestDuo locally on R2-D2 — it can't find the customer display" (Morgan).
* **Initial state:** config `merchantFacingDeviceIp=10.42.30.14`, `customerFacingDeviceIp=10.42.30.19` (a guess), `runType=tethered`, `deviceType=Station`.
* **Symptoms:** `[IDE]` `[runner] MFD handle 10.42.30.14:5444 connected` · `[runner] CFD handle 10.42.30.19:5444 → No route to host`; `[World]` R2-D2 is one terminal with two screens.
* **Fix:** `customerFacingDeviceIp=10.42.30.14`; re-run.
* **Success:** `prop(config,"merchantFacingDeviceIp") == prop(config,"customerFacingDeviceIp") == "10.42.30.14" && runType == "tethered" && ide.localRun("TaxTestDuo").result == PASS`.
* **Diagnosis Call:** **A. On a Station Duo both IPs are the same** · B. CFD unplugged · C. Port wrong · D. Runner bug.
* **Wrong-but-tempting:** CFD IP = the Pi `10.42.10.14` (Cur §6 wrong move; refused, −100); `runType=standalone` (CFD steps skipped → assertions fail); JOHNNY-5's `10.42.30.15` (−200, "you just drove another rig").
* **Teaches:** Ref §4 — on a Station Duo, MFD and CFD IPs are identical; runType `tethered`.

#### INC31 — Running locally? Reserve first
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 4:00 | P2 | tethered/any (default MEGATRON) | no | M06 | `orca.status.reserved` `tools.intellij` `uia.taxtest` |

* **Ticket:** "Please run TaxTest locally on MEGATRON to verify my fix" (Morgan).
* **Initial state:** MEGATRON `AVAILABLE`; PL2 active (checks out every 30 s).
* **Correct path:** Orca → MEGATRON → `Reserved` → IntelliJ ▶ `TaxTest` (≈ 25 s; MFD_O1 / CFD_O1 / MFD_O2 / Step 4 visible on `http://10.42.10.20:8081/stream.mjpg`; log `TaxTest PASSED (4/4 steps)`) → Orca → `Available`. Jenkins meanwhile logs `[orca] candidate megatron: Reserved — skipped`.
* **If run without reserving:** PL2 checks MEGATRON out mid-run → both drivers fight → IDE `UiObjectNotFoundException` + red build; −200 incident penalty; Morgan bark; the run must be repeated.
* **Success:** `ide.localRun("TaxTest").result == PASS && overlappedJenkins == false && statusHistory(megatron) shows RESERVED (player) spanning the run && orca.robot(megatron).status == AVAILABLE`.
* **Process bonus:** released within 30 s of PASS: +25.
* **Diagnosis Call (asked before the run, "What first?"):** **A. Set MEGATRON to Reserved** · B. Unavailable · C. Offline · D. Nothing.
* **Wrong-but-tempting:** `Unavailable` (−100; named jobs can still take it and Orca resets it afterwards); `Offline` (−100; for builds); forgetting to release (resolve fails; PL2 blocked −10 per attempt).
* **Teaches:** Ref §3 Reserved — locked manually for local runs; blocks Jenkins.

#### INC32 — Flaky clicks: missing `waitForScreen()`
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 5:00 | P2 | tethered (PL2) | no | M13 | `uia.sync` `uia.pom` `tools.intellij` |

* **Ticket:** "tethered-tax flaky: 1 in 2 runs fail at Review Order" (Jenkins Bot).
* **Initial state:** `RegisterHomeScreen.waitForScreen()` is an empty stub; pass rate 50 %.
* **Symptoms:** `[Jenkins]` `UiObjectNotFoundException: "Review Order" not found (screen still rendering)` [illus.] at `com.labsim.uia.pageobjects.RegisterHomeScreen.reviewOrder(RegisterHomeScreen.java:21)`; `[Camera]` recorded playback shows the tap landing before the screen finishes drawing; `[IDE]`:
  ```java
  public class RegisterHomeScreen extends BaseTest {
      // ===== Zone 1: Element Locators =====
      private final BySelector taxItem5 = By.text("Tax Item 5");
      private final BySelector reviewOrderBtn = By.text("Review Order");

      // ===== Zone 2: Helper / Action Methods =====
      public void waitForScreen() {
          // TODO
      }
      public boolean isScreenPresent() {
          return device.hasObject(reviewOrderBtn);
      }
      public void reviewOrder() {
          device.findObject(reviewOrderBtn).click();
      }
  }
  ```
* **Fix:** implement `waitForScreen()` (`device.wait(Until.hasObject(reviewOrderBtn), TIMEOUT_MS);`) and call it before interacting; push; rebuild.
* **Success:** `waitForScreen` waits on a Zone 1 locator && is called before `click()` && (`greenStreak(PL2) ≥ 3` || `ide.localRunStreak("TaxTest") ≥ 3`).
* **Diagnosis Call:** **A. Clicking before render — waitForScreen() missing** · B. Coordinates · C. Port · D. Teardown missing.
* **Wrong-but-tempting:** `Thread.sleep(5000)` (−100; pass rate 90 %, streak likely breaks); try/catch-retry (−50).
* **Teaches:** Ref §4 mandatory `waitForScreen()` stops UI Automator clicking unrendered buttons; Zone 1/Zone 2; BaseTest.

#### INC33 — `open("Register")` scrolls the wrong way
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P2 | Flex rigs, local run (default TARS, Reserved) | no | M13 | `uia.scroll` `uia.config` `orca.devicetype` |

* **Ticket:** "My local HomeScreenTest on TARS can't find the Register app" (Alex).
* **Symptoms:** `[IDE]` `[HomeScreen] open("Register"): scrolling horizontally (Mini/Station)…` ×5 → `AssertionError: App 'Register' not found on HomeScreen`; `[World]` TARS's launcher scrolls vertically; config `deviceType=Mini`.
* **Fix:** `deviceType=Flex`; re-run.
* **Success:** `prop(config,"deviceType") == "Flex" && ide.localRun("HomeScreenTest").result == PASS`.
* **Diagnosis Call:** **A. deviceType wrong, so open() scrolled horizontally** · B. App missing · C. waitForScreen missing · D. DEVICE_TYPE case.
* **Wrong-but-tempting:** make `open()` always vertical (−150, breaks Mini/Station); `deviceType=FLEX_4` (config takes the family; run fails "unknown deviceType").
* **Teaches:** Ref §4 Zone 2 abstraction — `open(appName)` vertical on Flex, horizontal on Mini/Station; config deviceType drives layout/scroll logic.

#### INC34 — PR review: the new hire's page object
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 4:00 | P3 | — | no | M13 | `uia.layout` `uia.sync` `adb.port` `tools.github` `uia.pom` |

* **Ticket:** "Review `labsim-lab/uia-remote` PR #431 'Add LockScreen page object'" (Alex).
* **PR diff:** (1) `app/src/main/java/com/lab/uia/AppRegistration.java` +2 lines; (2) `app/src/androidTest/java/com/lab/uia/pageobjects/LockScreen.java` — extends `BaseTest`, Zone 1 + `waitForScreen()`, **no `isScreenPresent()`**; (3) a committed `config.properties` with `portNumber=5555`.
* **Fix:** line comments with the review reasons `QA never modifies main`, `Missing mandatory isScreenPresent()`, `portNumber must be 5444` on the three issues → **Request changes**.
* **Success:** `pr(431).comments cover {main-edit, missing-isScreenPresent, port-5555} && pr(431).verdict == REQUEST_CHANGES && no comment flags "extends BaseTest"` (false flag −50).
* **Diagnosis Call:** none (review; §2.3.6).
* **Wrong-but-tempting:** Approve (−200; merges and spawns INC27 later in the shift); flag `extends BaseTest` (−50).
* **Teaches:** Ref §4 main is never modified by QA; mandatory methods; port 5444.

#### INC35 — Not starting from HomeScreen (missing teardown)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 350 | 4:00 | P2 | tethered (PL2) | no | M14 | `uia.taxtest` `uia.sync` `adb.usage` |

* **Ticket:** "RefundTest fails immediately — always right after TaxTest" (Jenkins Bot).
* **Symptoms:** `[Jenkins]` `AssertionError: HomeScreen.isScreenPresent() == false — current screen: RegisterOrderScreen`; `[Camera]` MEGATRON's MFD left on the Register order screen; `[IDE]` `TaxTest.java` header says "teardown forces both devices back to HomeScreen" but no teardown method exists.
* **Fix:** add a teardown that returns both devices to HomeScreen (e.g. `@After public void tearDown() { mfd.run(homeScreen::goHome); cfd.run(homeScreen::goHome); }`), push; recover now with `adb -s 10.42.30.21:5444 shell input keyevent KEYCODE_HOME`; rebuild.
* **Success:** `TaxTest has a teardown to HomeScreen && next PL2 == SUCCESS`.
* **Diagnosis Call:** **A. The previous test left the device off HomeScreen — teardown missing** · B. RefundTest locator broken · C. Port · D. Tethered config.
* **Wrong-but-tempting:** press Home only (fixed until the next run; resolve fails); add `goHome()` at the start of RefundTest only (−50).
* **Teaches:** Ref §4 Tax test — every test starts from HomeScreen and runs a teardown back to HomeScreen.

#### INC36 — Duo CFD OCR broken by a 10-pixel shift
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 4:00 | P1 | `duo` (R2-D2) | no | M16 | `orca.screencompare` `vision.tesseract` `pigeon.gimp` |

* **Ticket:** "Duo CFD suite red after the app update" (Jenkins Bot).
* **Initial state:** the CFD total label moved **10 px down**; Screen Compare `CFD_TOTAL` = `x 412, y 288, w 236, h 44, expected "TOTAL $10.83"` (Cur §0.6).
* **Symptoms:** `[Jenkins]` PL7: `[ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAI $10.B3" → match=false`; `[Orca]` Screen Compare **Test** panel shows the crop clipping the bottom of the glyphs.
* **Fix:** re-measure (camera **Snapshot** → GIMP) and set `y = 298` (±3); **Test** → `match=true`.
* **Success:** `|orca.screenCompare("CFD_TOTAL").y − 298| ≤ 3 && |x − 412| ≤ 3 && next PL7 == SUCCESS`.
* **Diagnosis Call:** **A. Label shifted ~10 px; the box is stale** · B. Copy changed · C. Camera URL wrong · D. Tesseract crashed.
* **Wrong-but-tempting:** widen the box to the whole screen (−100; OCR returns all the text → still false); expected = "TOTAI $10.B3" (−150); disable the check (−150, Cur §6 wrong move).
* **Teaches:** Ref §3 Screen Compare Image — OCR workaround, brittle (a 10-pixel shift breaks it); being phased out for UIA 2.3 (20-min shifts offer INC38 as follow-up planned work).

#### INC37 — Duo CFD OCR broken by capitalisation or a typo
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P1 | `duo` | no | M16 | `orca.screencompare` `vision.tesseract` |

* **Ticket:** "Duo CFD suite red: OCR mismatch" (Jenkins Bot).
* **Variants:** A (capitalisation): the CFD now reads `Total $10.83` (Cur M16 "layout v2" copy) → `[ocr] … tesseract → "Total $10.83" → match=false` (expected `TOTAL $10.83`); `[LabChat]` Morgan confirms the copy change is intended. B (typo): someone saved expected `TOTAL $10.38` → OCR reads `TOTAL $10.83` → false; row history shows the edit.
* **Fix:** set expected to exactly what the CFD shows (A `Total $10.83`; B `TOTAL $10.83`).
* **Success:** `orca.screenCompare("CFD_TOTAL").expected == truthText && next PL7 == SUCCESS`.
* **Diagnosis Call:** **A. Expected string no longer matches (case/typo)** · B. Box shifted · C. Camera dark · D. CFD not tethered.
* **Wrong-but-tempting:** move the box (no effect); lower-case both (the compare is exact [illus.]).
* **Teaches:** Ref §3 — a capitalisation change or a typo breaks the suite.

#### INC38 — Migrate the last Duo OCR check to UI Automator 2.3
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 5 | 900 | 10:00 | P2 | `duo` (R2-D2) | no | M16 | `uia.v23` `orca.screencompare` `uia.pom` `uia.sync` `uia.packages` `uia.config` `orca.status.reserved` `tools.github` |

* **Ticket:** "Kill the CFD_THANK_YOU OCR check — move it to UIA 2.3 like we did for CFD_TOTAL" (Morgan). Appears as Full-Shift planned work (§2.3.11) and in Free Play. (Cur M16 already migrated `CFD_TOTAL` in `TaxTestDuo`; this is the remaining check, `CFD_THANK_YOU` [illus.], in `DuoCheckoutTest`.)
* **Ordered steps (all checked):**
  1. Orca → R2-D2 → `Reserved`.
  2. IntelliJ → uia-remote → branch `feat/duo-cfd-thank-you-uia23`.
  3. Create `app/src/androidTest/java/com/lab/uia/pageobjects/CfdThankYouScreen.java`:
     ```java
     public class CfdThankYouScreen extends BaseTest {
         // ===== Zone 1: Element Locators (CFD = secondary display) =====
         private final BySelector thankYou = By.text("Thank you").displayId(cfdDisplayId);

         // ===== Zone 2: Helper / Action Methods =====
         public void waitForScreen() {
             device.wait(Until.hasObject(thankYou), TIMEOUT_MS);
         }
         public boolean isScreenPresent() {
             return device.hasObject(thankYou);
         }
     }
     ```
     (Selector style follows Cur M16's `By.displayId(cfdDisplayId)`; exact API is illustrative — the fact taught is that UI Automator 2.3, which uia-remote uses, natively locates elements on both screens.)
  4. In `testactions/DuoCheckoutTest.java` replace `assertTrue(orca.screenCompare("CFD_THANK_YOU"));` with `cfdThankYou.waitForScreen(); assertTrue(cfdThankYou.isScreenPresent());`.
  5. `config.properties`: `runType=tethered`, both IPs `10.42.30.14`, `deviceType=Station`, `portNumber=5444`.
  6. Run `DuoCheckoutTest` locally → PASS.
  7. Push, open PR → Morgan merges in 20 s if checks pass.
  8. Orca → Screen Compare Images → `CFD_THANK_YOU` → mark **Deprecated** (do not delete).
  9. Orca → R2-D2 → `Available`.
* **Success:** `CfdThankYouScreen` in `pageobjects` with both mandatory methods on main; `DuoCheckoutTest` no longer calls `screenCompare("CFD_THANK_YOU")`; local PASS while R2-D2 `RESERVED`; `orca.screenCompare("CFD_THANK_YOU").deprecated == true`; R2-D2 `AVAILABLE`; next PL7 SUCCESS.
* **Diagnosis Call:** none (project; §2.3.6).
* **Wrong-but-tempting:** delete the Screen Compare row before the merge (−100; another suite still references it); page object in `testactions` (−50); skip Reserved (collision −200); CFD IP ≠ MFD IP (run fails).
* **Teaches:** Ref §3 OCR deprecation; Ref §1 UI Automator v2.3 dual-screen tracking; Ref §4 structure, mandatory methods, config.

#### INC39 — Jenkins env var case (`flex_3`)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 200 | 2:00 | P1 | any pipeline (default PL1) | no | M11 | `jenkins.envvars` `orca.devicetype` |

* **Ticket:** "uia-remote-regression-flex fails at checkout" (Jenkins Bot). Misleading: "No Flex rigs are available?"
* **Initial state:** saved parameter `DEVICE_TYPE=flex_3` (variants: `Flex_3`, `flex_4`, `FLEX3`; on PL4 `mini_3`, the Cur M18 capstone seed).
* **Symptoms:** `[Jenkins]`
  ```
  [orca] checkout request deviceType=flex_3
  java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.flex_3
  FAILURE
  ```
  `[Orca]` WALL-E and EVE are Available (capacity is fine).
* **Fix:** job ▸ Configure (or Build with Parameters) → `DEVICE_TYPE=FLEX_3` → console `[orca] checkout → wall-e (FLEX_3) OK`.
* **Success:** `jenkins.job("Java/uia-remote-regression-flex").lastBuild.params.DEVICE_TYPE == "FLEX_3" && lastBuild.result == SUCCESS`.
* **Diagnosis Call:** **A. The env var value isn't the exact ALL-CAPS enum** · B. No Flex rigs available · C. Orca down · D. Wrong folder.
* **Wrong-but-tempting:** "fix" the enum in Orca (−150, Cur §6 wrong move); `FLEX_GEN3` (a testing profile, not a DeviceType → same exception); set WALL-E Available again (already is).
* **Teaches:** Ref §3 the Device Type enum is why Jenkins env vars must be ALL CAPS; Ref §1 Jenkins injects runtime env vars; JHipster enums.

#### INC40 — PayCore rig overwritten (must stay Unavailable)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 450 | 5:00 | P1 | `paycore` (ROSIE) | no | M06 | `orca.status.unavailable` `laz.oobe` `orca.merchant` `cards.philosophy` `orca.status` `uia.history` |

* **Ticket:** "PayCore matrix failing on ROSIE — wrong merchant!" (Sam).
* **Initial state:** Alex set ROSIE `AVAILABLE` "to help capacity"; Riley then ran `Java/uia-remote-regression-flex` with `DEVICE_TYPE=FLEX_POCKET`, which took ROSIE and swapped its merchant.
* **Symptoms:** `[Jenkins]` PL8: `[paycore] merchant mismatch: expected PAYCORE-STANDALONE-01, got AUTO-US-NOPIN-01` [illus.]; Riley's build: `[orca] checkout → rosie (FLEX_POCKET) OK` · `ubi: routing merchant switch → AUTO-US-NOPIN-01` · `laz: merchant active`; `[Notes]` `STATUS Unavailable → Available (alex)`; `[Camera]` (Rack B) ROSIE shows the generic Register app.
* **Diagnosis path:** Notes history → a general job used the PayCore rig → Call.
* **Fix:** 1) ROSIE → `Unavailable`. 2) `Java/laz-oobe-merchant-swap` with `ROBOT_NAME=rosie`, `MERCHANT=PAYCORE-STANDALONE-01` (a named job may use an Unavailable rig) → `laz: merchant active`. 3) Wait for PL8 green; ROSIE returns to Unavailable on release.
* **Success:** `orca.robot(rosie).status == UNAVAILABLE && hw.device(rosie-pocket).activeMerchant == "PAYCORE-STANDALONE-01" && next PL8 == SUCCESS`.
* **Diagnosis Call:** **A. The PayCore rig was opened to general pipelines and one overwrote its merchant** · B. PayCore merchant expired · C. Callus card matrix broken · D. Ubi down.
* **Wrong-but-tempting:** leave it Available and re-run Laz (overwritten again within 60 s — GW05); `Offline` (−100: for builds, and named jobs can't check out Offline rigs [illus.]); `Reserved` (−100: blocks PayCore's named job).
* **Teaches:** Ref §3 Unavailable isolates specialised rigs such as PayCore standalone setups so general tests don't overwrite their merchant profiles; Ref §4 PayCore adopted uia-remote (e.g. LabSim Dining).

#### INC41 — Named job on an Unavailable rig
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P2 | `paycore` (ROSIE) | no | M06 | `orca.status.unavailable` `orca.names` `jenkins.checkout` `cards.philosophy` |

* **Ticket:** "I need a Visa/Discover/AmEx matrix run on ROSIE now — Jenkins says no robot" (Sam).
* **Initial state:** Sam's build of `Java/paycore-standalone-matrix` used `ROBOT_NAME=` (blank). Variant B: `ROBOT_NAME=ROSIE` (the Human Readable Name).
* **Symptoms:** `[Jenkins]` A: `No Available robot matches FLEX_POCKET (rosie is Unavailable)` (Cur M06); B: `[orca] 404 Not Found: no robot named 'ROSIE'` [illus.].
* **Fix:** Build with Parameters `ROBOT_NAME=rosie` (system Name) → `Checked out robot rosie (named)`; do not touch ROSIE's status; after the build `[orca] released rosie → Unavailable`.
* **Success:** `lastBuild.params.ROBOT_NAME == "rosie" && result == SUCCESS && ∀t: orca.robot(rosie).status ≠ AVAILABLE && final status == UNAVAILABLE`.
* **Diagnosis Call:** **A. Unavailable rigs need the robot's exact unique Name in the job** · B. ROSIE broken · C. Must set it Available first · D. Wrong device type.
* **Wrong-but-tempting:** set ROSIE Available (GW05; Cur §6 wrong move); use `ROSIE` (404, −50).
* **Teaches:** Ref §3 Unavailable — blocked unless the exact unique name is passed; Orca resets it to Unavailable after the named job; Name vs Human Readable Name; Ref §6 PayCore runs exhaustive card matrices.

#### INC42 — Hardware upgrade: Flex 1 → Flex 2 (new Device entity)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 4 | 600 | 7:00 | P2 | `flex-legacy` (JOHNNY-5) | no | M07 | `orca.device` `orca.devicetype` `power.18v` `hw.devices` `orca.status.offline` |

* **Ticket:** "Upgrade JOHNNY-5 from Flex 1 to Flex 2 (Husky chest, drawer 2)" (Jared).
* **Ordered steps:**
  1. Orca → JOHNNY-5 → `Offline` (PB01).
  2. MOTOR off; screwdriver: remove the two 2.5 mm cradle-clamp bolts; unplug the Flex 1's PSU (STRIP-B) and hub cable; set the Flex 1 on the storage shelf (keep it for rollback).
  3. Seat the Flex 2, clamp, connect the hub, plug its PSU into **STRIP-B**; boot (30 s).
  4. Read serial `SIM-F2-000015` from the device label / Settings → About; IP stays `10.42.30.15` (Cur M07).
  5. Orca → Devices → **Create**: type `FLEX_2`, serial `SIM-F2-000015`, IP `10.42.30.15` (row `johnny-5-flex2`). Do **not** edit or delete `johnny-5-flex1`.
  6. JOHNNY-5 → **Robot Device** → `johnny-5-flex2` → Save.
  7. `adb connect 10.42.30.15:5444`; `adb -s 10.42.30.15:5444 shell getprop ro.product.model`.
  8. MOTOR on → Park All → `Available` → confirmation build (PB02).
* **Success:** `orca.robot(johnny-5).deviceId == "johnny-5-flex2" && orca.device("johnny-5-flex2").type == FLEX_2 && orca.device("johnny-5-flex1").exists && .type == FLEX_1 && status == AVAILABLE && confirmation build SUCCESS`.
* **Diagnosis Call:** none (change; §2.3.6). PB05 +50 for the kept legacy row.
* **Wrong-but-tempting:** edit `johnny-5-flex1` in place (GW10; Cur §6 wrong move); delete it (GW09); Flex 2 PSU on DC (GW01); skip step 6 (tests drive a Flex 2 with Flex 1 layout → red builds).
* **Teaches:** Ref §3 Robot Device decoupling — a Flex 1 → Flex 2 upgrade keeps the legacy configuration for quick rollback (Cur M07 does the Orca half; here the player does the hardware half too).

#### INC43 — Roll back to Flex 1
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 2:30 | P1 | JOHNNY-5 after INC42 (or seeded) | no | M07 | `orca.device` |

* **Ticket:** "The Flex 2 build has a regression — roll JOHNNY-5 back to the Flex 1 now" (Jared).
* **Fix:** swap the Flex 1 back (INC42 steps 2–3) and set Robot Device = `johnny-5-flex1` ("rolling back is one dropdown", Cur M07).
* **Success:** `orca.robot(johnny-5).deviceId == "johnny-5-flex1" && status == AVAILABLE && next build SUCCESS`.
* **Diagnosis Call:** none (change; §2.3.6).
* **Wrong-but-tempting:** create a new FLEX_1 row (−50, "the legacy row exists for exactly this"); after an earlier GW09 the row must be recreated (par effectively +3:00).
* **Teaches:** Ref §3 — decoupling enables quick rollbacks.

#### INC44 — Hot-swap equivalent: Mini 3 for a dead printerless Duo 2
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P2 | K-9 (off-screen `STATION_DUO_2`) → DATA/BUMBLEBEE | no | M11 | `hw.devices` `orca.devicetype` `jenkins.envvars` `orca.status.offline` |

* **Ticket:** "K-9's Duo 2 died (RMA). Keep printerless-smoke running today." (Jared).
* **Initial state:** `hw.device(k-9-duo2).state = DEAD`; job `Java/uia-remote-printerless-smoke` [illus.] has `DEVICE_TYPE=STATION_DUO_2`; K-9 is still Available.
* **Symptoms:** `[Jenkins]` red on k-9: `adb: failed to connect to '10.42.30.51:5444': No route to host`; `[Orca]` K-9 Available (its Pi is fine); `[LabChat]` Jared: "Mini 3 is our hot-swap for the printerless Duo 2."
* **Fix:** K-9 → `Offline` (PB01, pending RMA) → rebuild with `DEVICE_TYPE=MINI_3` → `[orca] checkout → data (MINI_3) OK` (or BUMBLEBEE).
* **Success:** `orca.robot(k-9).status == OFFLINE && jenkins.job("Java/uia-remote-printerless-smoke").lastBuild.robot ∈ {data, bumblebee} && result == SUCCESS`.
* **Diagnosis Call:** **A. Duo 2 dead; run on its hot-swap equivalent, a Mini 3** · B. K-9's Pi crashed · C. Port · D. Merchant.
* **Wrong-but-tempting:** `FLEX_POCKET` (printerless but not the equivalent → layout failures, −50); `MINI_2` (−50); change K-9's Device row to MINI_3 (GW10); `mini_3` (INC39 exception).
* **Teaches:** Ref §1 — Mini 3 is the hot-swap equivalent for the printerless Duo 2; enum values ALL CAPS; Offline for rigs out of service.

#### INC45 — Tethered rig treated as standalone (MFD empty)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P1 | `tethered` (default OPTIMUS) | no | M07 | `orca.tethered` `uia.multidevice` |

* **Ticket:** "tethered-tax on OPTIMUS: 'TaxTest requires a tethered rig'" (Jenkins Bot).
* **Initial state:** `orca.robot(optimus).mfdDeviceId = null`, `cfdDeviceId = null` (cleared during an edit; same seed as Cur M07).
* **Symptoms:** `[Jenkins]` env `RUN_TYPE=standalone` · `[runner] MFD relation empty → standalone` · `AssertionError: TaxTest requires a tethered rig (MFD/CFD)`; `[Orca]` USB Tethered Device Configuration shows MFD and CFD blank.
* **Fix:** MFD = `optimus-mfd` (MINI_3, 10.42.30.23), CFD = `optimus-cfd` (MINI_3, 10.42.30.24) → banner "Tethered: MFD populated" (Cur M07).
* **Success:** `orca.robot(optimus).mfdDeviceId == "optimus-mfd" && cfdDeviceId == "optimus-cfd" && next PL2 on optimus == SUCCESS`.
* **Diagnosis Call:** **A. MFD relation missing, so the pipeline treated the rig as standalone** · B. CFD unplugged · C. Port · D. Runner bug.
* **Wrong-but-tempting:** look for a runType field in Orca (none exists; Cur §6 wrong move) or force `RUN_TYPE=tethered` as a job param (−100, still fails); swap MFD and CFD (red).
* **Teaches:** Ref §3 — if MFD is populated, the pipeline treats the rig as tethered (Station 2 + Mini 2 on MEGATRON, nested Mini 3s on OPTIMUS).

#### INC46 — Standalone rig treated as tethered (MFD populated)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P1 | standalone rigs (default TARS) | no | M07 | `orca.tethered` |

* **Ticket:** "TARS hangs at start: 'waiting for CFD'" (Jenkins Bot).
* **Initial state:** TARS's record was cloned from OPTIMUS's: `mfdDeviceId = optimus-mfd`, `cfdDeviceId = optimus-cfd`.
* **Symptoms:** `[Jenkins]` `[runner] Tethered rig detected (MFD populated) → MFD 10.42.30.23:5444, CFD 10.42.30.24:5444` — OPTIMUS's devices; `[Camera]` OPTIMUS's screens move during TARS's job (cross-talk).
* **Fix:** clear MFD and CFD on TARS; Robot Device stays `tars-flex4`.
* **Success:** `orca.robot(tars).mfdDeviceId == null && cfdDeviceId == null && deviceId == "tars-flex4" && next build on tars == SUCCESS`.
* **Diagnosis Call:** **A. MFD populated on a standalone rig** · B. Shelf Pi crashed · C. Port 5555 · D. Shared camera.
* **Wrong-but-tempting:** set OPTIMUS Unavailable to stop the cross-talk (−100; treats the symptom).
* **Teaches:** Ref §3 — MFD populated ⇒ tethered.

#### INC47 — Tethered pair lost its link (Pay Display)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P1 | `tethered` (default OPTIMUS) | no | M14 | `semi.paydisplay` `orca.tethered` `uia.taxtest` |

* **Ticket:** "OPTIMUS CFD stuck on 'Waiting for merchant device…'" (Jenkins Bot).
* **Initial state:** A (USB Pay Display): the USB cable between the OPTIMUS MFD and CFD hubs is unseated. B (Secure Network Pay Display): the CFD hub's Ethernet is unplugged.
* **Symptoms:** `[Jenkins]` `[CFD_O1] waitForScreen timed out (CustomerOrderScreen)`; `[Camera]` CFD shows `Waiting for merchant device…` [illus.]; `[World]` black 3D-printed docks labelled `OPTIMUS MFD` / `OPTIMUS CFD` (photo), white hub with a dangling USB (A) / dark Ethernet LEDs (B).
* **Fix:** re-seat the cable on the labelled hub.
* **Success:** `link(optimus-mfd, optimus-cfd) == UP && next PL2 on optimus == SUCCESS`.
* **Diagnosis Call:** **A. MFD–CFD pay-display link down** · B. MFD relation missing in Orca · C. Teardown missing · D. CFD OCR.
* **Wrong-but-tempting:** edit Orca relations (they're correct; −50); reboot the shelf Pi (GW17; also hits MEGATRON).
* **Teaches:** Ref §1 USB Pay Display & Secure Network Pay Display (Semi Team) link MFDs and CFDs over USB or the local network.

#### INC48 — Stale Reserved blocking a pipeline
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 250 | 2:30 | P1 | any (default EVE) | no | M06 | `orca.status.reserved` `jenkins.checkout` `orca.status` |

* **Ticket:** "uia-remote-regression-flex (FLEX_4) waiting forever" (Jenkins Bot).
* **Initial state:** EVE `RESERVED` by riley since yesterday 17:42.
* **Symptoms:** `[Jenkins]` `[orca] candidate eve: Reserved — skipped` · `[orca] no Available FLEX_4 robot — build waiting in queue`; `[Orca]` EVE Reserved (riley, `2026-10-04 17:42`).
* **Fix:** LabChat Riley "Still using EVE?" → A: "Oh no, forgot — release it." → set `Available`. B: "Still running, 2 more minutes." → leave it; reply `R_WAIT`; resolve when Riley releases.
* **Success:** A: `asked in LabChat before the change && orca.robot(eve).status == AVAILABLE`; B: `ticket.reply == R_WAIT && status unchanged until Riley releases`.
* **Diagnosis Call:** **A. Leftover reservation from a finished local run** · B. EVE broken · C. Job misconfigured · D. Orca down.
* **Wrong-but-tempting:** release without asking (GW20).
* **Teaches:** Ref §3 Reserved blocks Jenkins; ask the owner (PB06).

#### INC49 — Westers capability conflict (dynamic vs non-dynamic)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 4:00 | P1 | `canada` (SETI) | no | M08 | `orca.capabilities` `hw.devices` `jenkins.envvars` |

* **Ticket:** "contact-canada-pin-sale checkout error" (Jenkins Bot).
* **Initial state:** pipeline script hardcodes `def capabilities = [deviceType: 'MINI_3', physicalTouch: true]` (copy-paste) while the test definition `gort/suites/contact-canada/pin_sale.json` [illus.] declares `"capabilities": {"deviceType": "COMPACT", "physicalTouch": true}`.
* **Symptoms:** `[Jenkins]` `[orca] 409 Conflict: capability conflict (pipeline deviceType=MINI_3, test deviceType=COMPACT)` [illus.].
* **Fix:** Pipeline script → `deviceType: 'COMPACT'`; rebuild.
* **Success:** `jenkins.job(PL5).script contains "deviceType: 'COMPACT'" && next PL5 robot == seti && SUCCESS`.
* **Diagnosis Call:** **A. The hardcoded pipeline capability contradicts the test's dynamic JSON** · B. SETI offline · C. Interac card missing · D. Case error.
* **Wrong-but-tempting:** delete the test's dynamic capabilities (−100; Contact Canada scripts use both styles).
* **Teaches:** Ref §3 Robot Capabilities — dynamic JSON (SDK frameworks, David) vs non-dynamic (pipeline script); both used interchangeably for Contact Canada on Westers beds; COMPACT is the Canadian terminal.

#### INC50 — Merchant switch via Laz OOBE / Ubi
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 450 | 5:00 | P2 | `canada` (SETI) | no | M08 | `laz.oobe` `ubi.routing` `orca.merchant` |

* **Ticket:** "Mid-suite swap of SETI to WESTERS-CA-02 fails" (Jenkins Bot).
* **Initial state:** Merchant Config `WESTERS-CA-02` has `Ubi Route = us-east` (should be `ca-central`) [illus. field], visible only in the **Edit** dialog.
* **Symptoms:** `[Jenkins]` `Java/laz-oobe-merchant-swap` (`ROBOT_NAME=seti`, `MERCHANT=WESTERS-CA-02`): `ubi: routing merchant switch → WESTERS-CA-02` · `ubi: ERROR route us-east cannot resolve merchant WESTERS-CA-02` [illus.] · `FAILURE` (Laz never de-provisions); `[Orca]` the Merchant Config table shows Name, Region, PIN Bypass… only.
* **Fix:** Merchant Config → `WESTERS-CA-02` → **Edit** → `Ubi Route = ca-central` → Save → rebuild the swap → `laz: de-provision` · `laz: wipe caches` · `laz: setup wizard 1/6…6/6` · `laz: merchant active` → resume the suite.
* **Success:** `orca.merchant("WESTERS-CA-02").ubiRoute == "ca-central" && hw.device(seti-compact).activeMerchant == "WESTERS-CA-02" && next PL5 == SUCCESS`.
* **Diagnosis Call:** **A. Merchant routing config wrong (hidden field — click Edit)** · B. Device can't be wiped · C. Callus offline · D. SETI Reserved.
* **Wrong-but-tempting:** walk SETI through the setup wizard by hand (−100; breaks zero-touch, fails again next switch); create a duplicate merchant row (−50).
* **Teaches:** Ref §1 Laz zero-touch OOBE (de-provision, wipe caches, setup wizard, swap merchants mid-suite) and Ubi routing; Ref §3 Merchant Config — click Edit to see every field.

#### INC51 — Go SDK needs App ID / App Secret / API Key
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P1 | PL6 | no | M08 | `go.sdk` `orca.merchant` `jenkins.envvars` |

* **Ticket:** "go-sdk-sale-smoke red: missing credential" (Jenkins Bot). Misleading: "The Go SDK is broken".
* **Initial state:** `GO-SDK-US-01` API Key blank (Cur M08 seed); Arcade variants blank the App Secret or App ID instead.
* **Symptoms:** `[Jenkins]` env `APP_ID=app_sim_7f3a APP_SECRET=**** API_KEY=` then `panic: Terminal SDK: missing credential API_KEY (env var empty)` [illus.]; `[Orca]` the Merchant Config table has no App columns; **Edit** shows App ID `app_sim_7f3a`, App Secret `••••••`, API Key *(blank)*; ticket attachment "LAB-2231: API Key `key_sim_19c0e2`".
* **Fix:** Edit → paste `key_sim_19c0e2` → Save → rebuild → env shows all three set.
* **Success:** `orca.merchant("GO-SDK-US-01").{appId, appSecret, apiKey} all correct && next PL6 == SUCCESS`.
* **Diagnosis Call:** **A. A credential is missing in Merchant Config (Edit view)** · B. Go SDK bug · C. Wrong device type · D. Ubi route.
* **Wrong-but-tempting:** hardcode the key in the Jenkins job (−150, Cur §6 wrong move; secrets in plain text); ask Tate to "add the column" (−50, Tate: "The fields exist — click Edit.").
* **Teaches:** Ref §3 Merchant Config — Tate added App ID, App Secret and API Key so pipelines export them as runtime env vars for the Go SDK; click Edit to see all fields.

#### INC52 — Canadian Interac PIN needs a physical bot
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 3:30 | P1 | PL5 (pinned to an ADB bot) | no | M09 | `bots.pin` `bots.types` `orca.capabilities` `cards.philosophy` |

* **Ticket:** "contact-canada-pin-sale times out at PIN entry" (Jenkins Bot).
* **Initial state:** someone saved `ROBOT_NAME=tars` on the job "for a quick test".
* **Symptoms:** `[Jenkins]` `Checked out robot tars (named)` · `PIN entry requires physical touch` (Cur M09) · `FAILURE`; `[Orca]` TARS/DATA are ADB bots; SETI is the Compact touch robot on `WESTERS-CA-01` (PIN required).
* **Fix:** Build with Parameters `ROBOT_NAME=seti` (or blank — SETI is the only match) and `CARD_PROFILE=INTERAC_CA_DIP` → SETI's solenoid taps the four PIN digits.
* **Success:** `next PL5 robot == seti && params.CARD_PROFILE == "INTERAC_CA_DIP" && result == SUCCESS`.
* **Diagnosis Call:** **A. ADB bots can't enter a PIN; the Canadian flow needs a physical bot** · B. INTERAC_CA_DIP broken · C. COMPACT unsupported · D. Port.
* **Wrong-but-tempting:** switch to a PIN-bypass merchant (−200; ADB bots only get PIN-bypass merchants, but Canada mandates physical PIN — you'd stop testing it; Cur §6 wrong move); "use the Gen 2 software PIN bypass" (−100; still being built with the Core OS Team); `ROBOT_NAME=wall-e` (`capability mismatch: deviceType COMPACT required`, −50).
* **Teaches:** Ref §6 ADB vs physical bots, Canadian physical PIN, Gen 2 Software PIN Bypass (future; physical kept for dipping); card philosophy (Visa + Canadian Interac).

#### INC53 — Dip/Tap card profile: wrong Gort path
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 4:00 | P1 | Rack A card rigs (default WALL-E) | no | M10 | `cards.diptap` `cards.callus` `tools.github` `arch.repos` |

* **Ticket:** "EMV dips fail on WALL-E: card not loaded" (Jenkins Bot).
* **Initial state:** `VISA_STD_DIP.gortPath = cards/visa/visa_std_dip.json`; Gort moved card files under `cards/emv/` last week.
* **Symptoms:** `[Jenkins]` `[callus] map cards/visa/visa_std_dip.json → C:\gort\cards\visa\visa_std_dip.json · FileNotFoundException (The system cannot find the path specified)` [illus.]; `[GitHub]` gort history "Reorganise card definitions under cards/emv/ and cards/nfc/"; `[Terminal]` `ssh automation@10.42.20.1` → `dir C:\gort\cards\emv` lists `visa_std_dip.json`, `interac_ca_dip.json`.
* **Fix:** Orca → Card Profiles → `VISA_STD_DIP` → Path `cards/emv/visa_std_dip.json`; then `curl -X POST http://orca.lab.local:8080/api/card/dip -H "Content-Type: application/json" -d '{"robot":"wall-e","profile":"VISA_STD_DIP"}'` → Callus log `map cards/emv/visa_std_dip.json → C:\gort\cards\emv\visa_std_dip.json · load virtual card OK · probe wall-e: DIP` (Cur M10).
* **Success:** `orca.cardProfile("VISA_STD_DIP").gortPath == "cards/emv/visa_std_dip.json" && next dip build on wall-e == SUCCESS`.
* **Diagnosis Call:** **A. The Card Profile points to an old Gort path** · B. Clone stale · C. Collis unpowered · D. Track data corrupted.
* **Wrong-but-tempting:** paste Track Data into the dip profile (−100, Cur §6 wrong move); copy the file back to the old path on the box (−100; the next sync removes it); revert Gort's reorganisation (−150).
* **Teaches:** Ref §3 Dip & Tap profiles store file paths into Gort; Callus maps the path and loads the virtual card.

#### INC54 — Scheduled clone stale on the Windows box
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 4:00 | P1 | rigs on MINIX-02 (default SETI) | no | M10 | `cards.callus` `cards.diptap` `tools.terminal` |

* **Ticket:** "New Interac tap profile fails on SETI, path looks right" (Riley).
* **Initial state:** `INTERAC_CA_TAP.gortPath = cards/nfc/interac_ca_tap.json` (correct; added to Gort yesterday); MINIX-02 was powered off at the last `GortCardSync` run, so the file is missing locally.
* **Symptoms:** `[Jenkins]` `[callus] map cards/nfc/interac_ca_tap.json → C:\gort\cards\nfc\interac_ca_tap.json · FileNotFoundException`; `[GitHub]` the file exists on main; `[Terminal]` `ssh automation@10.42.20.2` → `schtasks /query /tn GortCardSync` → `GortCardSync  10/06/2026 10:00:00  Ready` (next run hours away) and `dir C:\gort\cards\nfc` lacks the file.
* **Fix:** `schtasks /run /tn GortCardSync` → `SUCCESS: Attempted to run the scheduled task "GortCardSync".` → 20 s later `dir` lists the file → rebuild.
* **Success:** `fs(MINIX-02,"C:\\gort\\cards\\nfc\\interac_ca_tap.json").exists && next tap build on seti == SUCCESS`.
* **Diagnosis Call:** **A. Path is right; the box's scheduled clone is stale** · B. Gort path wrong · C. Collis dead · D. Merchant wrong.
* **Wrong-but-tempting:** point the profile at an older Interac file (−100; tests the wrong card); edit the correct path (−50).
* **Teaches:** Ref §3 — a scheduled job clones Gort card files onto local Windows boxes; Callus loads from the local copy.

#### INC55 — Swipe declined: corrupted Track Data
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 4:00 | P1 | swipe tests (default PL3) | no | M10 | `cards.swipe` `cards.philosophy` |

* **Ticket:** "Swipe step: 'Invalid track data'" (Jenkins Bot). Misleading: "Collis probe broken?"
* **Initial state:** `VISA_STD_SWIPE.trackData = %B4111111111111111^SIM/VISA^301210` (truncated; Track 2 missing).
* **Symptoms:** `[Jenkins]` `[callus] swipe VISA_STD_SWIPE → probe collis-wall-e OK` · `[device] SWIPE_ERROR: invalid track data` [illus.]; `[Orca]` Card Profile shows the truncated string; probe LED green (hardware fine).
* **Fix:** at your desk, swipe the Visa test card (hotbar 5) through the USB card-reader utility → it prints Track 1 and Track 2 → paste `%B4111111111111111^SIM/VISA^30121010000000000000?;4111111111111111=3012101000000000?` (Cur M10) into the profile → rebuild.
* **Success:** `orca.cardProfile("VISA_STD_SWIPE").trackData == canonicalTracks && next swipe build == SUCCESS`.
* **Diagnosis Call:** **A. The swipe profile's raw Track Data is corrupted** · B. Collis offline · C. Gort path wrong · D. Callus offline.
* **Wrong-but-tempting:** give the swipe profile a Gort path (−100; swipe profiles store raw Track Data in MySQL); switch to `AMEX_MATRIX_DIP` (−100; PayCore's, and the team standard is one Visa profile).
* **Teaches:** Ref §3 swipe profiles store raw Track Data strings in MySQL, extracted with a hardware card-reader utility; Ref §6 card philosophy.

#### INC56 — Wine card programming broken on a Pi
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 4 | 550 | 6:00 | P1 | touch + collis rigs (default JOHNNY-5) | no | M05 | `cards.wine` `hw.pi` `tools.terminal` |

* **Ticket:** "JOHNNY-5: card-programming step fails after last night's OS update" (Jenkins Bot).
* **Initial state:** the Pi's Wine prefix used by the Windows-only card programmer is broken.
* **Symptoms:** `[Jenkins]` `[pi] cardprog: program VISA_STD_DIP → 503 CARDPROG_UNAVAILABLE` [illus.]; `[Terminal]` `ssh pi@10.42.10.15` → `ps aux | grep -i wine` → no `wine C:\CardProg\CardProgrammer.exe` line (Cur M05 shows it when healthy); `systemctl status cardprog` [illus.] → `Active: failed`; `journalctl -u cardprog -n 3` → `wine: could not load kernel32.dll, status c0000135` [illus.]; `ls /opt/cardprog/` → `wineprefix-golden/`.
* **Fix:** `sudo systemctl stop cardprog` → `rm -rf /home/pi/.wine-cardprog && cp -a /opt/cardprog/wineprefix-golden /home/pi/.wine-cardprog` → `sudo systemctl start cardprog` → `ps aux | grep -i wine` shows `wine C:\CardProg\CardProgrammer.exe` → rebuild.
* **Success:** `svc(pi-johnny-5,"cardprog") == UP && next card build on johnny-5 == SUCCESS`.
* **Diagnosis Call:** **A. The Wine environment for the Windows-only card tool broke** · B. Collis offline · C. Callus offline · D. Gort path.
* **Wrong-but-tempting:** move card programming to NUC-03 (−150; "that's the security-monitored Windows box we moved off"); reflash the Pi (−100, 4 min).
* **Teaches:** Ref §1 Wine on Raspberry Pi Linux emulates the Windows-only card-programming software; the Pi runs Wine card-programming emulation.

#### INC57 — Ollama tip-math receipt check: bug or misread?
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 4:00 | P3 | receipt rigs (default WALL-E) | no | M17 | `vision.ollama` `vision.camera` |

* **Ticket:** "Vision PoC flagged a tip-math failure on WALL-E's receipt" (Jenkins Bot).
* **Initial state:** seeded receipt: subtotal S ∈ [$10, $120], tip % ∈ {15, 18, 20, 22}, tip = round-half-up(S × %). Variant A (misread): receipt correct, model misreads a digit. Variant B (real bug): printed tip off by $0.09 or $0.20. Reference seed: S = $42.00, 18 % → $7.56 (Cur S15).
* **Symptoms:** `[Ollama]` model `llava`, attachment `walle_receipt_0912.jpg`, the Cur M17 prompt; response "FAIL — tip of 18% on $42.00 should be $7.56; the receipt shows $7.65."; `[Camera]` zoomable receipt snapshot; `[World]` the printed receipt can be picked up at WALL-E's printer (`E`).
* **Diagnosis path:** read the real receipt → compute S × % and the total → compare → Call.
* **Fix:** A: reply `R_FALSE_POSITIVE` (values attached). B: **File bug** with subtotal 42.00, tip 18 %, expected tip 7.56, printed tip 7.65, expected total 49.56, printed total 49.65.
* **Success:** A: `ticket.reply == R_FALSE_POSITIVE`; B: `bug.fields == computed values (exact to the cent)`.
* **Diagnosis Call:** **A/B** (per variant; shuffled): "The vision model misread a digit" / "The receipt's tip math is wrong" · C. Ollama offline · D. Camera URL wrong.
* **Wrong-but-tempting:** trust the model blindly (−150 in A); mark the PoC as a release blocker (−50).
* **Teaches:** Ref §1 Ollama on the 4-GPU blade runs **proof-of-concept** Vision LLM inspections of webcam streams for receipt layouts and tip math.

#### INC58 — "Add Discover and AmEx to our regression?" (judgement)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 150 | 1:30 | P3 | — | no | M10 | `cards.philosophy` |

* **Ticket:** "Should we add Discover and AmEx to tethered-tax for coverage?" (Alex).
* **Replies:** **R1** "No — our team standardises on one reliable Visa profile (plus Canadian Interac for regional flows); PayCore runs the back-to-back Visa/Discover/AmEx matrix." · R2 "Yes, add all three." · R3 "Replace Visa with AmEx." · R4 "Use Interac everywhere."
* **Success:** `ticket.reply == R1`. Wrong reply: −50, Teach Card, one more try at half points.
* **Diagnosis Call:** none (judgement; §2.3.6).
* **Teaches:** Ref §6 Card Testing Philosophy.

#### INC59 — Cracked 3D-printed cradle
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 3 | 400 | 6:00 | P2 | touch rigs (default EVE) | no | M04 | `hw.print3d` `hw.rigbom` `orca.status.offline` `hw.motion` |

* **Ticket:** "EVE's taps drift on the right side of the screen" (Morgan).
* **Initial state:** EVE's black PLA cradle cracked; the Flex 4 sits 2° tilted.
* **Symptoms:** `[Camera]` taps on the right half land progressively low (unlike INC14's uniform error); `[World]` crack visible on inspection; the device rocks when touched (`E`).
* **Fix:** EVE `Offline` (PB01) → `loc.print-corner`: choose **Prusa** or **Bambu Lab** → load `cradle_flex_gen3.3mf` [illus.] → Print (90 real s; work other tickets meanwhile) → MOTOR off → lift the device → screwdriver: 4 × 2.5 mm bolts → swap cradle → re-seat → MOTOR on → Park All → `Available` → build.
* **Success:** `hw.rig(eve).cradle == NEW && homed && orca.robot(eve).status == AVAILABLE && next build on eve == SUCCESS`.
* **Diagnosis Call:** **A. Cracked cradle tilts the device** · B. Offsets · C. Screen Locations · D. Solenoid loose.
* **Wrong-but-tempting:** tape the crack (−50; drift persists); Offsets (GW18); 5 mm bolts (don't fit, −25).
* **Teaches:** Ref §1 black modular fixtures 3D-printed on Prusa and Bambu Lab from simple CAD shapes; 2.5/5 mm hardware; Ref §3 Offline while rebuilding.

#### INC60 — Orca's MySQL is down
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 4 | 500 | 4:00 | P1 | all | no | M06 | `arch.stack` `arch.infra` `tools.terminal` `arch.flow` |

* **Ticket:** "Every pipeline fails checkout; Orca shows an error page" (Jenkins Bot).
* **Initial state:** `svc(orca-vm,"mysql") = DOWN`.
* **Symptoms:** `[Orca]` `500 Internal Server Error` — `Could not open JPA EntityManager for transaction; nested exception is org.hibernate.exception.JDBCConnectionException: Unable to acquire JDBC Connection` / `Communications link failure`; `[Jenkins]` every pipeline `[orca] checkout request … → 500`; `[Terminal]` `curl -s -o /dev/null -w "%{http_code}" http://orca.lab.local:8080/management/health` → `503` [illus. JHipster health path]; `ssh automation@orca.lab.local` → `systemctl status mysql` → `inactive (dead)`.
* **Fix:** `sudo systemctl start mysql` → Orca reconnects within 15 s → health 200.
* **Success:** `svc(orca-vm,"mysql") == UP && orca.http == 200 && next checkout on any pipeline OK`.
* **Diagnosis Call:** **A. Orca's MySQL database is down** · B. Jenkins misconfigured · C. All Pis down · D. GPU blade off.
* **Wrong-but-tempting:** restart the Orca VM (GW13 — works after 45 s but kills running builds); reboot the blade (GW13).
* **Teaches:** Ref §1/§3 Orca is an on-premise Spring Boot monolith scaffolded by JHipster and backed by MySQL, on a lab VM; Docker/GCP are only planned.

#### INC61 — "Which AI tool does what?" (judgement)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 150 | 2:00 | P3 | — | no | M17 | `tools.claude` `vision.ollama` `vision.tesseract` |

* **Ticket:** "Leadership wants one line per AI/vision tool for the AI-initiative slide" (Tate).
* **Task:** match tool → role: **Ollama** → local LLM runner on the 4-GPU blade, PoC vision checks of receipt layouts and tip math · **Claude** → evaluated in corporate AI initiatives for repository optimisation and automated test generation · **Tesseract** → OCR on cropped webcam screenshots for ADB-blind displays (Duo CFD). Then choose the status line **"Ollama checks are proof-of-concept, not release gates."**
* **Success:** three correct matches + the status line. Each wrong match −30.
* **Diagnosis Call:** none (judgement; §2.3.6).
* **Teaches:** Ref §1 Developer Utilities, Computer Vision & AI.

#### INC62 — "Where does Orca run?" (judgement)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 150 | 1:30 | P3 | — | no | M06 | `arch.stack` `arch.infra` `arch.roles` |

* **Ticket:** "Explain Orca's platform to the new hire" (Alex).
* **Replies:** **R1** "Orca is the Controller and Jenkins the Executor. Orca is an on-premise Spring Boot monolith in Java, scaffolded with JHipster (UI, REST endpoints, MySQL schemas), running on a lab VM on the 4-GPU blade; Docker and GCP are planned migration targets." · R2 "It runs in Docker on GCP today." · R3 "Jenkins is the Controller, Orca the Executor." · R4 "Orca is a Go service on the Raspberry Pis."
* **Success:** `ticket.reply == R1`.
* **Diagnosis Call:** none (judgement; §2.3.6).
* **Teaches:** Ref §1, §2, §3 (Cur M17 roadmap: on-prem VM = TODAY; Docker/GCP = PLANNED).

#### INC63 — Tablet shows the wrong name (Human Readable Name typo)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 150 | 2:00 | P3 | any touch rig (default JOHNNY-5) | no | M07 | `orca.names` `hw.tablet` |

* **Ticket:** "JOHNNY-5's tablet says JONNY-5 — can someone fix the robot's name?" (Riley).
* **Initial state:** `orca.robot(johnny-5).hrn = "JONNY-5"` (Cur M07 seed).
* **Symptoms:** `[Tablet]` header `JONNY-5`; `[Orca]` Name `johnny-5`, Human Readable Name `JONNY-5`.
* **Fix:** edit **Human Readable Name** → `JOHNNY-5`; leave Name alone; check the tablet.
* **Success:** `orca.robot(johnny-5).hrn == "JOHNNY-5" && name == "johnny-5"`.
* **Diagnosis Call:** **A. Human Readable Name typo (pushed to the tablet)** · B. Name typo · C. Tablet firmware · D. Device row wrong.
* **Wrong-but-tempting:** edit Name (GW22).
* **Teaches:** Ref §3 Name & Human Readable Name — the system identifier vs the display string pushed to the status tablet.

#### INC64 — "Write me an ADB tap for the Duo's customer screen" (ADB-blind display)
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 2 | 300 | 3:00 | P3 | `duo` (R2-D2) | no | M16 | `bots.types` `uia.v23` `orca.xytouch` `adb.usage` |

* **Ticket:** "Need an `adb shell input tap` for 'Done' on R2-D2's CFD receipt screen" (Riley).
* **Initial state:** R2-D2's CFD shows a receipt prompt with "Done"; screen `CFD_RECEIPT_DONE` [illus.] exists in Orca for STATION_DUO.
* **Symptoms:** `[Terminal]` `adb -s 10.42.30.14:5444 shell uiautomator dump` → the dump only contains MFD elements (`grep -c "Done" window_dump.xml` → `0`, Cur M16).
* **Fix:** tap it physically through Orca: `curl -X POST http://orca.lab.local:8080/api/xy_touch -H "Content-Type: application/json" -d '{"robot":"r2-d2","screen":"CFD_RECEIPT_DONE","button":"Done"}'` → `"mode":"PHYSICAL_TAP"`; reply `R_DUO_BLIND` ("ADB can't see the Duo CFD; use the touch robot via xy_touch, or a UIA 2.3 dual-screen locator in tests").
* **Success:** `R2-D2 CFD advanced past the prompt via PHYSICAL_TAP && ticket.reply == R_DUO_BLIND`.
* **Diagnosis Call:** **A. The Duo CFD is blind to ADB; use a physical tap or UIA 2.3** · B. Wrong port · C. Device asleep · D. Wrong IP.
* **Wrong-but-tempting:** `adb … input tap <x> <y>` with CFD coordinates (−100: it taps the MFD instead — Cur §6 wrong move "ADB-only approach").
* **Teaches:** Ref §3 the dual-screen problem (only the MFD is exposed to ADB); Ref §6 physical bots for ADB-blind displays; UIA 2.3.

#### INC65 — Tap tests fail: blank Tap URL
| Diff | Base | Par | Sev | Rigs | Escalatable | Unlocked by | Tags |
|---|---|---|---|---|---|---|---|
| 1 | 200 | 2:00 | P1 | touch + collis rigs (default JOHNNY-5) | no | M07 | `orca.urls` `cards.diptap` |

* **Ticket:** "JOHNNY-5 contactless taps fail instantly" (Jenkins Bot).
* **Initial state:** `orca.robot(johnny-5).urls.tap = ""` (Cur M07 seed).
* **Symptoms:** `[Jenkins]` `POST /api/card/tap {"robot":"johnny-5","profile":"VISA_STD_TAP"}` → `[orca] 400 Bad Request: robot johnny-5 has no Tap URL` [illus.]; `[Orca]` URL Mappings: ADB `http://10.42.10.15:8000/adb`, Dip `…/dip`, Swipe `…/swipe`, Tap *(blank)*.
* **Fix:** Tap URL = `http://10.42.10.15:8000/tap` → tablet Tap → In/Out to verify → rebuild.
* **Success:** `orca.robot(johnny-5).urls.tap == "http://10.42.10.15:8000/tap" && next tap build == SUCCESS`.
* **Diagnosis Call:** **A. The rig's Tap URL mapping is missing** · B. Collis offline · C. VISA_STD_TAP path wrong · D. Pi crashed.
* **Wrong-but-tempting:** point Tap at the Callus box (−50); edit the card profile (−50).
* **Teaches:** Ref §3 URL Mappings — hardware-specific Dip, Tap and Swipe URLs per robot.

### 3.6 Incident index & coverage

| Requested topic | Incident(s) |
|---|---|
| Connection Failed: crashed Pi / Minix-Callus offline / blown 5 V fuse / unplugged Ethernet | INC01, INC02, INC03, INC04 |
| Banner yellow after a manual arm move (Park All) | INC11 (also INC13, INC15, INC16, INC59 end with Park All) |
| Receipt QR regression, 4 vs 5 maps, misleading "select print" | INC20, INC21, INC22 (and INC23) |
| Port 5555 collision with a coworker device | INC27 (also INC28, INC34) |
| Duo CFD OCR break (10 px / capitalisation / typo) & UIA 2.3 migration | INC36, INC37, INC38 (and INC64) |
| Jenkins env var case | INC39 (and INC44) |
| PayCore rig must be Unavailable; named job resets to Unavailable | INC40, INC41 |
| Engineer local run needs Reserved | INC31 (also INC06, INC48) |
| Offline rig being built | INC07 (and INC05-B, INC44, INC59) |
| Flex 1 → Flex 2 via a new Device entity, keep legacy | INC42, INC43 |
| Tethered config (MFD populated ⇒ tethered; Duo same IP) | INC45, INC46, INC30, INC47 |
| Merchant switch via Laz OOBE / Ubi | INC50 (and INC40, INC28) |
| Go SDK App ID / App Secret / API Key (click Edit) | INC51 |
| Pigeon JSON missing comma | INC25 |
| Canadian Interac PIN needs a physical bot | INC52 |
| Dip/tap profile Gort path wrong / scheduled clone stale | INC53, INC54 |
| Swipe track data | INC55 |
| NUC disk full from security monitoring | INC19 |
| Wine card programming | INC56 |
| 18 V device / Collis probe on the DC rail | INC17, INC18 (GW01/GW02 everywhere) |
| Camera stream shared across 4 rigs | INC08 (and INC09) |
| Offsets field legacy | INC14 |
| Jenkins legacy Java vs iOS jobs | INC26 |
| Ollama tip-math receipt check | INC57 (and INC10) |
| GIMP coordinates | INC24 (and INC20, INC21, INC36) |
| Health-check timing (5 min; Offline bypass) | INC05, INC07 |
| Dashboard lockout during active tests | INC12 |
| More | INC13 steppers/MOTOR · INC15 solenoid · INC16 dip arm · INC29 theme/kernel · INC32 waitForScreen · INC33 open() scroll · INC34 PR review · INC35 teardown · INC44 hot-swap equivalent · INC49 capabilities · INC58 card philosophy · INC59 3D printing · INC60 MySQL · INC61 AI tools · INC62 platform · INC63 HRN · INC64 ADB-blind CFD · INC65 Tap URL |

### 3.7 Mapping to the curriculum's proposed Arcade content (Cur §6)

Content authors copy each Cur §6 row's **Facts** into the mapped incidents' `factIds` (used by the
Leitner hook, §4.8.2) and keep its "wrong-move strikes" as wrong-but-tempting actions (already listed
above).

| Cur §6 ID / drill | This doc |
|---|---|
| `INC-FUSE-5V` | INC03 |
| `INC-WRONG-OUTLET` | INC17 (device), INC18 (Collis) |
| `INC-MAGLOCK` | INC11 |
| `INC-CONN-FAILED` | INC01, INC02, INC04 |
| `INC-RESERVED-BLOCK` | INC31 |
| `INC-UNAVAILABLE-NAMED` | INC41 |
| `INC-HRN-TYPO` | INC63 |
| `INC-DEVICE-UPGRADE` | INC42 |
| `INC-TETHER-MISSING` | INC45 |
| `INC-MERCHANT-KEY` | INC51 |
| `INC-CAPABILITY-MISMATCH` | INC23 |
| `INC-COORD-DRIFT` | INC20, INC21 |
| `INC-PIN-ON-ADB-BOT` | INC52 |
| `INC-CALLUS-DOWN` | INC02 |
| `INC-CARD-PATH` | INC53, INC54 |
| `INC-ENV-CASE` | INC39 |
| `INC-PORT-COLLISION` | INC27 |
| `INC-CONFIG-LOCKS` | INC29 |
| `INC-DUO-SAME-IP` | INC30 |
| `INC-OCR-BRITTLE` | INC36, INC37, INC38 |
| `INC-DUO-BLIND` | INC64 |
| "Park It!" · "ADB Speedrun" · "Where Does It Go?" · "POM Doctor" · "Comma Hunt" · "Log Detective" | DR16 · DR19 · DR15 · DR08 (Doctor mode) · DR06 · DR18 |

Difficulty distribution: D1 × 12 · D2 × 23 · D3 × 24 · D4 × 4 · D5 × 2 (65 incidents; 35 at D1–D2 keep Intern-capped shifts varied).

---

## 4. Scoring, XP, ranks, achievements, daily, leaderboards, streaks, spaced repetition

### 4.1 Score (summary)
* **Shift:** per-ticket formula §2.3.8 + pipeline points (§2.3.5) + uptime bonus + handover debt (§2.3.10).
* **Drills:** §2.4.1.
* **Academy:** stars and step XP per Cur §2.0 (no score).
* **Certification:** pass/fail per Cur §5 (no score).
* **Free Play:** XP only for verified fixes.

### 4.2 XP

| Source | XP |
|---|---|
| Academy step (Cur §2.0) | 10 · `interact` 15 · `computer-task` 25 (−50 % if "Show me" used) |
| Academy module complete (Cur §2.0) | +100 |
| First ★★ / first ★★★ on a module | +50 / +100 |
| Module replay | 25 % of the above |
| Certification passed (written + practical) | CERT-R1 300 · R2 500 · R3 700 · R4 1000 · R5 1500; "with distinction" +50 % |
| Shift | `floor(finalScore / 10)` + grade bonus (S 300 · A 200 · B 100 · C 50 · D 0); ×1.25 in Strict; min 0 |
| Daily Challenge ranked attempt | +250 (on top of Shift XP); practice attempts half Shift XP |
| Drill round | `floor(score / 20)`, cap 150/round; first Bronze +50, Silver +100, Gold +200 |
| Flashcard review | 2 per card, +3 for "Got it"; cap 200/day |
| Free Play verified fix | 30 each; cap 300/day |
| Achievement | per table §4.5 |

Rough budget: the whole Academy yields ≈ 5,000 XP; a good 10-min shift ≈ 600–800 XP.

### 4.3 Career ranks and certification

The curriculum's five certification ranks map 1:1 **by order** onto this doc's career ranks after
Intern (Cur §5.1: "map them 1:1 by order"). The UI shows the career rank name everywhere; the
certificate reads e.g. "CERT-R2 passed — Automation Engineer I".

| # | Career rank | Certification (Cur title) | XP | Extra gate (this doc) | Shift difficulty cap | Cosmetic |
|---|---|---|---|---|---|---|
| 0 | **Intern** | — | 0 | — | 2 | Grey visitor lanyard |
| 1 | **Lab Technician** | CERT-R1 (Lab Trainee) | 800 | — | 3 | Blue lanyard; personal yellow multimeter |
| 2 | **Automation Engineer I** | CERT-R2 (Rig Technician) | 2,500 | — | 4 | Green lanyard; desk plant |
| 3 | **Automation Engineer II** | CERT-R3 (Automation Engineer) | 5,000 | — | 5 | lab-green hoodie on your chair |
| 4 | **Senior Automation Engineer** | CERT-R4 (Senior Automation Engineer) | 9,000 | 5 shifts of ≥ 10 min graded ≥ A | 5 | Your name label on a rig shelf |
| 5 | **Lab Lead** | CERT-R5 (Lab Lead) | 18,000 | ≥ 45 of 54 Academy stars (Cur R5 eligibility already requires Leitner mastery ≥ 90 % and a Full Shift Ratio ≥ 0.80) | 5 | Jared hands you the label maker; name plate on the lab door |

* Exam **eligibility** is exactly Cur §5.1. **Promotion** happens when the exam is passed *and* the XP threshold *and* the extra gate are met (UI: "Promotion pending: 640 XP to go").
* Rank-up ceremony (≤ 20 s, skippable): break room; the mentor tied to the player's strongest tag gives a one-line speech; lanyard swap; new HUD badge. A gold seal shows for "with distinction".

### 4.4 Profile stats (persisted)
Shifts by length, best scores, grade counts, total tickets, Fast Diagnosis %, escalations
(correct/wrong), penalty counts by GW id, average resolve time vs par per incident, average uptime,
drill medals, flashcards reviewed and Leitner mastery %, streak current/longest, certification
records, mastery radar by tag group.

### 4.5 Achievements

| ID | Name | Condition (exact) | XP |
|---|---|---|---|
| ACH01 | Badge In | Complete M01 | 100 |
| ACH02 | Graduate | Complete M01–M18 | 500 |
| ACH03 | Straight A's | ★★★ on all 18 modules | 500 |
| ACH04 | Green Means Go | First Park All that turns a yellow banner green | 100 |
| ACH05 | Five by Five | DR01 round with ≥ 15 items at 100 % accuracy | 150 |
| ACH06 | Fuse Whisperer | INC03 hands-on with PB07, a 10 A fuse, no GW03/GW04, first attempt | 200 |
| ACH07 | Not On My Rail | 10 completed shifts in a row without GW01/GW02 | 300 |
| ACH08 | Magic Smoke *(secret)* | Trigger GW01 or GW02 once (Academy spark counts) | 50 |
| ACH09 | Rollback Ready | INC42 with PB05, later INC43 using the kept legacy row | 250 |
| ACH10 | Pixel Perfect | DR05 round with every box edge error ≤ 1 px (≥ 5 boxes) | 200 |
| ACH11 | Comma Chameleon | 10 consecutive DR06 items correct | 150 |
| ACH12 | Four or Five | DR07 Gold | 150 |
| ACH13 | Second Screen Liberation | Complete INC38 | 400 |
| ACH14 | CAPS LOCK IS CRUISE CONTROL | DR11 Gold | 150 |
| ACH15 | By Name Only | INC41 with ROSIE never leaving Unavailable | 200 |
| ACH16 | Patience Is a Fix | INC05 with zero power cycles | 100 |
| ACH17 | Triple Threat | Reach combo 8 (×3.0) in a shift | 300 |
| ACH18 | Clean Hands | Finish a ≥ 10-min shift with zero penalty events | 300 |
| ACH19 | SLA Slayer | Finish a Full Shift with zero SLA breaches | 400 |
| ACH20 | Green Wall | All active pipelines unblocked and green for 120 consecutive real s at H3+ | 200 |
| ACH21 | S-Rank | First S grade | 300 |
| ACH22 | Daily Driver | 7 ranked Daily Challenges completed | 300 |
| ACH23 | Habit Forming | 30-day streak | 500 |
| ACH24 | Interac Insider | INC52 with Fast Diagnosis | 200 |
| ACH25 | Track Star | INC55 first attempt, no penalties | 150 |
| ACH26 | Gort Guide | INC53 and INC54 in the same shift | 250 |
| ACH27 | Wine Connoisseur | Solve INC56 | 200 |
| ACH28 | Eviction Notice | INC19 with PB01 and no GW11 | 300 |
| ACH29 | Lord of the Rigs | Inspect the Pi, tablet/screen and device of all 12 modelled rigs (36 inspections) | 150 |
| ACH30 | Robot Whisperer | Collect all 60 robot quips (§5.3) | 200 |
| ACH31 | Librarian | Unlock every Field Manual entry | 300 |
| ACH32 | Total Recall | 500 flashcard reviews | 300 |
| ACH33 | Weak No More | Raise any tag from < 0.40 to ≥ 0.85 effective mastery | 200 |
| ACH34 | Full Spectrum | All tags ≥ 0.80 effective mastery at once | 500 |
| ACH35 | Lab Lead | Reach career rank Lab Lead | 1000 |
| ACH36 | By the Book | 5 correct escalations to Jared and zero lifetime GW12 | 150 |
| ACH37 | Trust but Verify | 5 correct INC57 verdicts | 200 |
| ACH38 | Hot Swap | Solve INC44 | 200 |
| ACH39 | Drill Sergeant | Gold in all 19 drills | 500 |
| ACH40 | Day One Hero | M18 (capstone) with ★★★ | 400 |
| ACH41 | Real Lab | Full Shift in Strict realism graded ≥ A | 500 |
| ACH42 | Sandbox Scientist | Fix 10 injected faults in Free Play | 150 |
| ACH43 | Port Authority | DR03 Gold and INC27 solved in < 60 s | 200 |
| ACH44 | Ruler of Coordinates | INC20 via the PR route (PB03) within par | 300 |
| ACH45 | Certified | Pass any certification exam | 200 |
| ACH46 | With Distinction | Pass any certification with distinction (Cur §5.1) | 300 |

Toast: bottom-right card, 4 s, `UI_ACHIEVEMENT` chime, never within the first 3 s of a new ticket.
Secret achievements show "???" until unlocked.

### 4.6 Daily Challenge seed
* `dateKey` = local date `YYYY-MM-DD`; `seedString` = `"labsim-daily-v1:" + dateKey` (`v1` = content version; bump when the catalog changes so everyone on a version shares days).
* `seed` = FNV-1a 32-bit of `seedString`; PRNG = mulberry32(seed). Draw order is fixed within a content version:
  1. 12 incidents from {difficulty ≤ 4, par ≤ 6:00, not planned-work-only}; slots 1–3 difficulty ≤ 2, 4–7 ≤ 3, 8–12 ≤ 4; no repeats.
  2. Variant per incident (uniform).
  3. Rig binding (uniform over eligible rigs).
  4. Misleading-title flag (slot heat: 1–3 H1, 4–7 H2, 8–10 H3, 11–12 H4).
  5. Inter-arrival times (heat table).
  6. Compound pairing (heat probability; partner = next compatible incident).
* 10 min; Standard and Strict boards; rank caps ignored; Wildcard on (all 12 eligible; Daily unlocks after M14).
* One **ranked** attempt per `dateKey` (starting counts; quitting submits the current score). Later attempts are practice (no board entry, half XP).
* **Daily Drill:** `DR[(seed mod 19) + 1]`, item order from the same PRNG; its own daily board.

### 4.7 Local leaderboards & streaks
* Local to the browser across local profiles. Boards: `shift:5:standard|strict`, `shift:10:standard|strict`, `shift:20:standard|strict`, `daily:<dateKey>:standard|strict`, `dailyDrill:<dateKey>`, `drill:DR01` … `drill:DR19`.
* Top **20** entries per board; keep the last **30** daily boards. Entry: profile name (≤ 16 chars), score, grade (shifts), date-time, seed, realism, content version, max combo, Fast Diagnosis count.
* UI: tabs per board; the player's best highlighted; "+312 vs your best" in the shift summary.
* **Daily streak:** a local day counts when the profile earns **≥ 300 XP**. Streak freeze: +1 at every 7-day milestone (max 2), auto-used on a missed day. Persist current, longest, last counted `dateKey`, freezes.

### 4.8 Spaced repetition & mastery

#### 4.8.1 Fine topic tags (contract with the curriculum)
Each fine tag rolls up to the curriculum module tag (Cur §8) of the module that teaches it ("Taught
in"). Where a fine tag has the same string as a module tag it *is* that tag ("self").

| Tag | Covers | Ref | Taught in | Parent (Cur §8) |
|---|---|---|---|---|
| `people.roles` | Jared, Tate, David, Morgan responsibilities; escalation path | canon, §3 | M01 | `lab.orientation` |
| `hw.devices` | Device families; Mini 3 ≡ printerless Duo 2; Flex 3/4/Pocket share a profile; Pocket no printer; Compact = Canada; upcoming Duo 3 / Mini 4 | §1 | M02 | `devices` |
| `power.rails` | 120 V AC → Mean Well → 24 V → 12 V NUC / 5 V 10 A Pi | §6 | M03 | self |
| `power.fuses` | Inline fuses on step-down lines; safe replacement | §6 | M03 | `power.rails` |
| `power.18v` | LabSim devices (18 V) and Collis probes on AC strips only | §6 | M03 | `power.rails` |
| `hw.rigbom` | Steppers, solenoids, mag locks, limit switches, 25-pin PCBs (Hong Kong), regulators, fuses, webcams, tablets, 10 ft rails, 130 ft wiring, ~300 solder points, 200+ 2.5/5 mm nuts & bolts | §1 | M04 | `robots.mechanics` |
| `hw.print3d` | Prusa & Bambu Lab printers; black PLA fixtures from simple CAD | §1 | M04 | `robots.mechanics` |
| `hw.motion` | Magnetic lock, yellow banner, Park All → limit switches (0,0) → green | §6 | M04 | `robots.mechanics` |
| `hw.lockout` | Dashboard locks out external users during active tests | §6 | M04 | `robots.mechanics` |
| `hw.tablet` | Front status tablet: HRN, Status, tabs, button groups | §3, photo | M04 | `robots.mechanics` |
| `hw.pi` | ~$50 Pi Robot Controller duties (ADB routing, camera, steppers, solenoids, Wine); Linux isolation | §1 | M05 | `pi.controller` |
| `hw.nuc` | NUC/Minix Windows boxes; corporate agent filled NUC disks → control moved to Pis | §1 | M05 | `pi.controller` |
| `cards.wine` | Wine on the Pi for Windows-only card programming | §1 | M05 | `pi.controller` |
| `tools.terminal` | ssh/curl/systemctl/adb/schtasks basics [illus. specifics] | — | M05 | `pi.controller` |
| `arch.flow` | Jenkins → runner → Orca → Pi → device; Callus → Collis | §2 | M06 | `orca.status` |
| `arch.roles` | Orca = Controller, Jenkins = Executor | §3 | M06 | `orca.status` |
| `arch.stack` | Java, Spring Boot, JHipster, MySQL, JSON; Orca on a lab VM | §1 | M06 | `orca.status` |
| `orca.status` | The five statuses | §3 | M06 | self |
| `orca.status.unavailable` | Named-job only; PayCore isolation; auto-reset after a named job | §3 | M06 | `orca.status` |
| `orca.status.offline` | Build placeholder; health checks skipped | §3 | M06 | `orca.status` |
| `orca.status.connfailed` | Triggers, Notes, blocked checkouts, Jared escalation | §3 | M06 | `orca.status` |
| `orca.status.reserved` | Local runs; blocks Jenkins and health-check overrides | §3 | M06 | `orca.status` |
| `orca.healthcheck` | 5-minute synchronized ping; no response / non-200 | §3 | M06 | `orca.status` |
| `orca.notes` | Notes: exact endpoint + error text | §3 | M06 | `orca.status` |
| `orca.robot` | Robot entity; 40+ rig pool; Tate's filter UI | §3 | M06 | `orca.status` |
| `orca.names` | Name vs Human Readable Name; tablet display | §3 | M07 | `orca.entities` |
| `orca.device` | Robot Device decoupled from Device; upgrades and rollback | §3 | M07 | `orca.entities` |
| `orca.devicetype` | DeviceType enum: dimensions, layout, ALL-CAPS strings | §3 | M07 | `orca.entities` |
| `orca.urls` | ADB Service, Camera Stream (dedicated or shared ×4), Dip/Tap/Swipe URLs | §3 | M07 | `orca.entities` |
| `orca.tethered` | MFD/CFD relations; MFD populated ⇒ tethered | §3 | M07 | `orca.entities` |
| `orca.offsets` | Legacy mm offsets; true (0,0) calibration | §3 | M07 | `orca.entities` |
| `orca.capabilities` | Dynamic JSON (SDK, David) vs non-dynamic (pipeline script); Contact Canada uses both | §3 | M08 | self |
| `orca.merchant` | Merchant Config; click Edit; App ID/App Secret/API Key (Tate) | §3 | M08 | `orca.capabilities` |
| `laz.oobe` | Laz zero-touch OOBE: de-provision, wipe caches, setup wizard, merchant swap | §1 | M08 | `orca.capabilities` |
| `ubi.routing` | Ubi routing for merchant switching | §1 | M08 | `orca.capabilities` |
| `go.sdk` | Terminal SDK; Orca extensions; Pigeon & mobile runners; credentials as env vars | §1, §3 | M08 | `orca.capabilities` |
| `orca.screens` | Screens & Screen Locations (mm, per device architecture) | §3 | M09 | self |
| `orca.xytouch` | `xy_touch`: screen + button → mm → ADB touch or probe tap | §3 | M09 | `orca.screens` |
| `receipt.qr` | QR "scan for receipt" regression; 48 h; Jared's coordinate PR | §5 | M09 | `orca.screens` |
| `receipt.maps` | Separate 4-option and 5-option maps per device profile | §5 | M09 | `orca.screens` |
| `bots.types` | ADB bots vs physical/interactive bots | §6 | M09 | `orca.screens` |
| `bots.pin` | Canadian physical PIN; Gen 2 software PIN bypass (Core OS Team) | §6 | M09 | `orca.screens` |
| `hw.collis` | Collis probes (UL), ribbon cables, swipe/dip/tap, high cost | §1 | M10 | `cards` |
| `cards.philosophy` | One Visa (+ Interac) vs PayCore's Visa/Discover/AmEx matrix | §6 | M10 | `cards` |
| `cards.swipe` | Swipe profiles: raw Track Data in MySQL via a card-reader utility | §3 | M10 | `cards` |
| `cards.diptap` | Dip/Tap profiles: Gort file paths | §3 | M10 | `cards` |
| `cards.callus` | Callus on Windows/Minix; scheduled Gort clone; loads virtual cards; drives Collis | §1, §3 | M10 | `cards` |
| `jenkins.envvars` | Runtime env-var injection; ALL-CAPS enum values | §1, §3 | M11 | `jenkins` |
| `jenkins.folders` | Legacy jobs split Java vs iOS | §1 | M11 | `jenkins` |
| `jenkins.checkout` | Pipelines need Available matching rigs; checkout/release | §2, §3 | M11 | `jenkins` |
| `adb.port` | 5444 vs default 5555; coworker collisions | §1, §4 | M12 | self |
| `adb.usage` | Inspect XML hierarchies, locate elements, dispatch touch | §1 | M12 | `adb.port` |
| `arch.repos` | GitHub repos Gort, uia-remote, pigeon and their roles | §1 | M13 | `uia.pom` |
| `tools.intellij` | Import repos, local properties, run suites | §1 | M13 | `uia.pom` |
| `tools.github` | Branches, PRs, reviews | §1 | M13 | `uia.pom` |
| `uia.layout` | `app/src/main` (QA never edits), `test`, `androidTest`; Maven-style layout | §1, §4 | M13 | `uia.pom` |
| `uia.packages` | `databases`, `pageobjects`, `testactions` | §4 | M13 | `uia.pom` |
| `uia.multidevice` | Runner in `test`; sequential methods across device handles | §4 | M13 | `uia.pom` |
| `uia.pom` | One class per screen extending BaseTest; Zone 1 / Zone 2 | §4 | M13 | self |
| `uia.sync` | `waitForScreen()`, `isScreenPresent()` | §4 | M13 | `uia.pom` |
| `uia.scroll` | `open(appName)`: vertical Flex, horizontal Mini/Station | §4 | M13 | `uia.pom` |
| `uia.taxtest` | Tax test MFD_O1, CFD_O1, MFD_O2, Step 4; HomeScreen start; teardown | §4 | M14 | `uia.config` |
| `uia.config` | config.properties keys and locked values | §4 | M14 | self |
| `pigeon.lstr` | LSTR runners REST/Android/Windows/iOS; Lester heritage; pun; iOS rarely touched | §1, §5 | M15 | `pigeon` |
| `pigeon.json` | Payload anatomy; 4–5 platforms | §5 | M15 | `pigeon` |
| `pigeon.abstraction` | High-level actions ("card swipe") abstracted per platform | §5 | M15 | `pigeon` |
| `pigeon.nolint` | No JSON linter; copy-paste survival | §5 | M15 | `pigeon` |
| `jenkins.logs` | Reading consoles; misleading "select print" | §5 | M15 | `pigeon` |
| `orca.screencompare` | Screen Compare Image; OCR workaround; brittleness; deprecation | §3 | M16 | `duo.ocr` |
| `pigeon.gimp` | GIMP bounding-box coordinate extraction | §1, §5 | M16 | `duo.ocr` |
| `uia.v23` | UI Automator 2.3 dual-screen support | §1, §3 | M16 | `duo.ocr` |
| `vision.camera` | Webcam streams (dedicated / shared) and snapshots | §2, §3 | M16 | `duo.ocr` |
| `vision.tesseract` | Tesseract OCR on cropped webcam screenshots | §1, §3 | M16 | `duo.ocr` |
| `arch.infra` | 4× NVIDIA blade (2 exposed, 2 under) replacing a tower; VMs; Docker & GCP planned | §1 | M17 | `infra.ai` |
| `vision.ollama` | Ollama on the blade; vision LLM PoC for receipts and tip math | §1 | M17 | `infra.ai` |
| `tools.claude` | Claude evaluated for repo optimisation and test generation | §1 | M17 | `infra.ai` |
| `uia.history` | Semi, Sedi (Lester), presenter/Morgan, IPX, PayCore, native apps covered | §4 | M18 | `teams.history` |
| `semi.paydisplay` | USB Pay Display & Secure Network Pay Display (Semi Team) | §1 | M18 | `teams.history` |

Tag groups (radar, Field Manual chapters): Architecture (`arch.*`), Orca (`orca.*`), Jenkins
(`jenkins.*`), uia-remote (`uia.*`), Pigeon & Receipts (`pigeon.*`, `receipt.*`), ADB (`adb.*`), Power
(`power.*`), Hardware (`hw.*`), Bots & Cards (`bots.*`, `cards.*`), Merchants & SDK (`laz.*`, `ubi.*`,
`go.*`, `semi.*`), Vision & AI (`vision.*`, `tools.claude`), Tools & People (`tools.*` minus claude,
`people.*`).

#### 4.8.2 Flashcards: the curriculum's Leitner system + one Arcade hook
Flashcards follow Cur §4.0 exactly (boxes 1–5; intervals session/1/3/7/14 days; "Got it" / "Missed
it"; 20 new per day; 60 reviews per session; any wrong quiz item anywhere demotes cards sharing its
fact to box 1; answering right never promotes; mastery = % of unlocked cards in box ≥ 4). This doc
adds one hook: **a wrong Diagnosis Call, a wrong escalation or a GW penalty in Arcade counts as a
missed item for the facts in that incident's (or GW's) `factIds`** (filled from Cur §6, §3.7), so the
matching cards drop to box 1. Correct Arcade play never promotes cards.

#### 4.8.3 Tag mastery model (Arcade adaptivity)
Per fine tag: `m` ∈ [0,1] (start 0), `level` ∈ 0..6, `lastEvidenceAt`, `minSeen`.
* Each evidence event `(tag, q ∈ [0,1], w)` updates `m ← clamp(m + 0.3·w·(q − m), 0, 1)`.
* Weights `w`: flashcard 0.5 · drill item 0.5 · Academy checkpoint or certification item 1.0 · incident 1.5 (to every incident tag) · penalty event 2.0 with q = 0 (to the GW's / action's tag only).
* Incident `q`: 1.0 clean (no penalties, no hints, correct call or correct escalation); 0.75 tier-1 hint or r > par; 0.5 tier-2 hint or wrong call then fixed; 0.25 walkthrough or bounced escalation; 0 unresolved.
* Flashcard `q`: "Got it" 0.9, "Missed it" 0. Drill/quiz item: correct 1.0 (0.8 if > 8 s), wrong 0.
* `level` +1 (max 6) on q ≥ 0.8 if the last level-up was ≥ 20 h ago; −1 (min 0) on q < 0.5.
* **Effective mastery** (forgetting): `mEff = m × 0.5^(daysSince(lastEvidenceAt) / halfLife[level])`, `halfLife = [1, 2, 4, 7, 14, 30, 60]` days.
* Labels: **Weak** mEff < 0.60 · **Learning** 0.60–0.85 · **Mastered** ≥ 0.85 and level ≥ 4 · **New** (no evidence).
* Parent (curriculum module tag) mastery for the radar = mean of its fine tags' mEff.

#### 4.8.4 Selection weighting (incidents, drill items, Arcade quiz items)
```
weakness(i) = mean over t in tags(i) of (1 − mEff_t)
overdue(i)  = max over t in tags(i) of clamp(daysSince(lastEvidenceAt_t) / halfLife[level_t], 0, 3)
w(i)        = weakness(i)^1.5 × (1 + 0.5 × overdue(i)) × fit(i) × fresh(i)
fit(i)      = 1 if unlocked, difficulty ≤ effective cap and remaining time ≥ par; else 0
fresh(i)    = 0.25 if the item appeared in the last 3 picks; else 1
```
Shift picks: 60 % weighted by `w`, 30 % uniform over eligible, 10 % from never-seen eligible incidents
(fallback uniform). Drills: 70 % weighted / 30 % uniform. Daily Challenge and certification practicals
ignore weighting (fairness).

#### 4.8.5 Weak Spot playlist
One click from the main menu or a shift summary: the 3 lowest-mEff seen tags (ties → most overdue) →
5 drill items touching them (mixed drills, 90 s) → a 3-incident micro-shift (Shift rules, heat H2, no
pipelines, length = Σ par × 1.2) with the highest-`w` incidents for those tags → summary with
before/after bars → button "Review these cards" (due Leitner cards for those tags' facts).

#### 4.8.6 Content links and lint
* Curriculum facts (`F###`) keep their module tag (Cur §8); `src/content/tags.ts` declares every fine tag with `parent` and `taughtIn` as in §4.8.1. Incidents and drill items declare fine tags and, where Cur §6 maps them, `factIds`.
* `npm run lint:content` fails if: a fine tag is used but not declared; a fine tag lacks a teaching module, a hands-on incident, or a drill besides DR10 (Appendix B); an incident lacks `escalatable`, `tags`, `par`, `base`, `difficulty`, `unlockedBy`, `successCondition`, `hints[3]`, or `diagnosisCall` (change/project/review/judgement tickets declare `diagnosisCall: none`); a Diagnosis Call distractor lacks a `wrongCallHint`; a referenced rig, job, merchant or card profile is missing from §3.1/§3.2/Appendix C.

---

## 5. Feel: audio, juice, personalities, barks, teaching failure

### 5.1 Audio cues (all synthesized with WebAudio — no sample files)

Buses: `master` → `sfx` (spatial, PannerNode HRTF), `ui` (non-spatial), `ambience` (spatial loops),
`voice` (robot/mentor blips; the curriculum's dialogue "voice blips" use this bus). Defaults: sfx 0.8,
ui 0.6, ambience 0.4, voice 0.7.

| Cue ID | Trigger | Recipe | Length |
|---|---|---|---|
| `SFX_STEPPER` | Gantry axis moving | sawtooth + square (0.3 mix), f = 180 Hz + 12 Hz × speed (mm/s), low-pass 1.2 kHz, gain follows velocity; per-robot pitch offset (§5.3) | while moving |
| `SFX_LIMIT_CLICK` | Axis reaches a limit switch | 2 ms white-noise burst + 3.2 kHz sine blip 30 ms | 35 ms |
| `SFX_SOLENOID_DOWN` / `_UP` | Plunger fires / retracts | band-passed noise (2 kHz, Q 4) 15 ms + 90 Hz sine thump, 60 ms decay; UP at 40 % gain, no thump; Lower/Raise = same at half speed | 80 ms |
| `SFX_MAGLOCK_RELEASE` | Carriage dragged by hand | low "clunk": 70 Hz sine 120 ms + noise 20 ms | 140 ms |
| `SFX_PARK_ALL_DONE` | Banner turns green after Park All | two limit clicks, then sine G5 → C6 (80 ms each) | 250 ms |
| `SFX_BANNER_YELLOW` | Banner turns yellow | square E5 → C5, 120 ms each, gain 0.3 | 240 ms |
| `SFX_DIP_ARM` | Dip In/Out | servo whine (triangle 600→900 Hz) + band-passed noise sweep "scrape" | 400 ms |
| `SFX_PRINTER` | Receipt printing | noise bursts at 40 Hz rate + final "tear" (high-pass noise sweep) | 1.2 s |
| `SFX_TOGGLE` | MAIN/MOTOR switch | two transients 8 ms apart (noise, high-pass 1.5 kHz) | 30 ms |
| `SFX_CONNECTOR` | Plug/unplug/re-seat a cable | low click + 400 Hz sine tick | 60 ms |
| `SFX_BOOT_CHIME` | Pis on a rack power up (Cur M03) | soft sine arpeggio C5-G5 at −18 dB, once per rack | 300 ms |
| `SFX_FUSE_POP` | Fuse blows | 25 ms noise burst + 1 kHz click | 60 ms |
| `SFX_SPARK` | Wrong socket (Academy) / GW03 | 300 ms of random impulses (crackle) | 300 ms |
| `SFX_FRY` | GW01/GW02 in Arcade | pop + hiss (high-pass noise 3 kHz, 2.5 s fade) + room hum dips; smoke particles | 2.6 s |
| `SFX_BOLT` | Screwdriver turning | ratchet ticks (noise grains at 20 Hz) | while held |
| `SFX_3DPRINT` | Printer printing | soft stepper chirps (sine 300–700 Hz random steps) | while printing |
| `AMB_GPU_BLADE` | At the blade | pink noise LP 600 Hz + 120 Hz hum + slow LFO | loop |
| `AMB_ROOM` | Always | brown noise LP 200 Hz (HVAC), gain 0.15 | loop |
| `AMB_RACK` | Near racks | faint 4–6 kHz fan band + occasional distant solenoid clacks from busy rigs | loop |
| `UI_TICKET_NEW` | Ticket arrives | sine 880 → 1320 Hz, 90 ms each; P1 adds 1760 Hz | 180–270 ms |
| `UI_HEALTH_PING` | Orca health-check tick | sine 1.6 kHz with 400 ms feedback-delay tail; louder if a watched rig changed | 450 ms |
| `UI_SLA_TICK` | Each second while an SLA < 20 % | 1 kHz tick 20 ms | 20 ms |
| `UI_DIAG_CORRECT` | Correct Diagnosis Call / escalation accepted | pluck triad C5-E5-G5 | 300 ms |
| `UI_COMBO_UP` | Combo increments | arpeggio up, base pitch +1 semitone per combo level | 300 ms |
| `UI_COMBO_BREAK` | Combo resets | sawtooth glide 300 → 150 Hz, LP 800 Hz | 250 ms |
| `UI_RESOLVE` | Ticket resolved | soft FM bell (2:1) | 500 ms |
| `UI_WRONG` | Penalty event | 110 Hz square, 150 ms, LP 500 Hz (never harsh) | 150 ms |
| `UI_BUILD_GREEN` / `_RED` | Pipeline run ends | two quiet notes up / down | 200 ms |
| `UI_ACHIEVEMENT` | Achievement toast | FM bell arpeggio | 700 ms |
| `UI_RANK_UP` | Rank ceremony | 4-note fanfare (square + triangle) | 1.2 s |
| `UI_KEY` | Typing at the workstation | noise grains, ±15 % random pitch | per key |
| `VOICE_BLIP_<speaker>` | Each dialogue line, bark or quip | speaker-specific blip pattern at 18 blips/s for the text duration | text length |

### 5.2 Juice (visual feedback)
* Ticket cards slide in from the right with a 120 ms overshoot; P1 borders pulse twice.
* SLA bar lerps green → amber → red; at red the card nudges every 4 s (off with Reduce Motion).
* Score pop-ups float from the card: `+412 ×1.75` green; penalties red with the GW name ("−300 · Port 5555").
* Combo meter (HUD top-right): 8 segments; ≥ 4 adds a soft green screen-edge glow; a break shatters the segments.
* Tablet banner changes are a 300 ms left-to-right wipe; LED changes ramp over 50 ms; healthy Pi ACT flickers randomly at 2–12 Hz.
* Orca rows flash the new status colour for 1 s; Jenkins strip bubbles spin while running and resolve into a vector check or cross.
* Hold-to-inspect: FOV 75° → 35° over 200 ms with depth of field; key evidence (LEDs, labels, fuse window) gets a thin outline in Standard realism.
* Wrong socket: spark particles (Academy) / smoke for 6 s + 0.15 m camera shake for 300 ms (Arcade; none with Reduce Motion).
* CFD_O1 assertions float as three green ticks above MEGATRON's CFD (Cur M14 step 12), reused in Arcade when the player watches a Tax test.
* S grade: procedural confetti from the ceiling vents; every tablet flashes green in a wave across the racks.
* Park All: visible trapezoid acceleration; the carriage LED pulses on limit contact.

### 5.3 Robot personalities & quips
Quips are a game layer (Settings → "Robot personality"; off in Strict): a one-line strip under the
tablet header for touch robots, or a speech bubble at the shelf label for tethered/ADB rigs. Shown
6 s on trigger; idle quips every 90–180 s when the player is within 3 m; max 90 characters. Each robot
has a blip voice and a stepper pitch offset. Content: `src/content/quips.ts`, keys `QUIP_<RIG>_<TRIGGER>`.

Touch robots trigger on **idle · pass · yellow · recovered · park**; tethered/ADB rigs on **idle · pass · fail · recovered · reserved**.

| Rig | Personality · voice · stepper offset | idle | pass | yellow / fail | recovered | park / reserved |
|---|---|---|---|---|---|---|
| WALL-E | Earnest, tidy · low warbly blips · −2 st | "Cables compacted. Shelf tidy. Awaiting a directive." | "Green build! Adding it to my collection." | "Someone moved my arm. I liked where it was." | "...Rebooted. Did I miss anything shiny?" | "Home at zero-zero. Cozy." |
| EVE | Precise, protective · clean sine blips · +3 st | "Scanning. Scanning. All directives nominal." | "Directive complete. Receipt printed. Filed." | "Unauthorized arm movement detected." | "Systems restored. Please keep hands off the Pi lead." | "Homed. Target lock re-established." |
| BUMBLEBEE | Talks in radio clips · static bursts · 0 st | "[radio] ...standing by, standing by... [/radio]" | "[radio] ...and the crowd goes wild! [/radio]" | "[radio] ...hey, hands off the merchandise! [/radio]" | "[radio] ...we're back on the air, folks! [/radio]" | "[radio] ...returning to base... [/radio]" |
| R2-D2 | Beeps + translation · random chirps · +5 st | "*bweep-boo* (Translation: The CFD is quiet. Suspiciously quiet.)" | "*whistle-trill* (Translation: Both screens agree. Rare.)" | "*indignant blat* (Translation: Who touched me?)" | "*rising whistle* (Translation: Back online. Don't ask.)" | "*happy chirp* (Translation: Zero, zero. Perfect.)" |
| JOHNNY-5 | Curious, excitable · fast blips · +2 st | "Need input! Also, a Flex 2 would be nice." | "Test passed! More input! More tests!" | "Hey! Arms are for tapping, not pushing!" | "Malfunction fixed! Still running! Very running!" | "Homing... homing... home!" |
| BAYMAX | Gentle carer · soft two-tone · −4 st | "Hello. I am monitoring the lab's well-being." | "Your transaction is healthy. You have been a good engineer." | "I detect discomfort in my gantry. Park All is recommended." | "I am restored. How would you rate your outage experience?" | "Resting at zero-zero. Please wash your hands before touching my rails." |
| SETI | Listener for signals · slow sweeping tones · −1 st | "Listening for a four-digit signal from the north." | "Signal received: Interac approved." | "Anomalous movement in sector X-Y." | "Contact with Orca re-established. We are not alone." | "Arm aligned to the origin of everything." |
| ROSIE | Sassy PayCore housekeeper · clipped blips · +1 st | "Unavailable, hon. Say my name or move along." | "Visa, Discover, AmEx. All spotless." | "Did you just push me? I keep a tidy rig!" | "Back online, and still Unavailable, thank you." | "Tidied up at zero-zero." |
| MEGATRON | Theatrical tyrant · low growl blips | "The MFD commands. The CFD obeys." | "Another tax total crushed beneath my assertions!" | "Treachery! The CFD has betrayed me!" | "MEGATRON RISES. Again." | "A local run? You dare reserve MEGATRON? ...Very well." |
| OPTIMUS | Noble leader · warm mid blips | "Tethered, we stand." | "MFD and CFD, united. Transaction complete." | "One display cannot succeed alone." | "Staging is secure once more." | "I will hold this rig for you, engineer." |
| DATA | Literal android · even-pitched beeps | "I am an ADB bot. I cannot press a PIN pad. I have accepted this." | "Passed in 61.3 seconds. 1.3 seconds above my personal mean." | "Intriguing. The device did not answer on port 5444." | "Restored. As a Mini 3, I remain a perfectly adequate Duo 2." | "Reserved. I will await your local run with patience." |
| TARS | Dry humour · square-wave blips | "Humour setting: 75 percent. Honesty setting: 90 percent." | "Green build. I'd call that a smooth landing." | "Honesty setting says this failure was probably not my fault." | "Back online. Lowering humour to 60 percent out of respect." | "Reserved. I'll keep the Jenkins jobs away." |

That is 60 quips (ACH30).

### 5.4 Mentor & coworker barks
Barks are subtitled lines (top-centre, 4 s, queue max 2; priority safety > ticket > flavour) with the
speaker's blip voice; keys `BARK_<SPEAKER>_<NN>`. Lines marked (Cur) are verbatim from the curriculum.

| ID | Trigger | Text |
|---|---|---|
| BARK_JARED_01 | Player near an AC strip carrying a device PSU | "LabSim gear goes on the strip. Never the rails." |
| BARK_JARED_02 | GW01 / GW02 | "That's how we fry a terminal. Commercial AC strip. Always." (Cur) |
| BARK_JARED_03 | Fuse replaced with PB07 | "Power off first. That's how you keep your eyebrows." |
| BARK_JARED_04 | Correct escalation | "On it. Probably the Pi, or a Minix box running Callus. Same symptom." (Cur) — or, per cause, "On my way. Watch what I check first." |
| BARK_JARED_05 | GW12 | "That's config, not hardware. Read the Notes and the Edit view." |
| BARK_JARED_06 | INC20 spawn | "Firmware drop today. Last time the QR button cost us 48 hours of coordinates." |
| BARK_JARED_07 | GW18 | "Offsets were a legacy fudge. I calibrated the lab to a true zero-zero for a reason." |
| BARK_JARED_08 | First shift of the day | "Morning. Forty-two rigs, one of you. Let's keep them green." |
| BARK_TATE_01 | Merchant Config table opened | "Table display limits: you always have to click Edit to see every field." (Cur) |
| BARK_TATE_02 | GW24 | "Never paper over a failed ping. Hardware goes to Jared." (Cur) |
| BARK_TATE_03 | GW05 | "ROSIE is PayCore's. Unavailable means only jobs that name it get it." |
| BARK_TATE_04 | GW20 | "That reservation wasn't yours. Ask first." |
| BARK_TATE_05 | GW22 | "Name is the system identifier. Pipelines use it. Leave it." (Cur) |
| BARK_DAVID_01 | INC39 spawn | "Enums are ALL CAPS. FLEX_3, not flex_3." |
| BARK_DAVID_02 | INC49 resolved | "Dynamic JSON in the test, hardcoded in the pipeline. Canada uses both — keep them agreeing." |
| BARK_DAVID_03 | INC51 resolved | "Go SDK needs all three: App ID, App Secret, API Key." |
| BARK_MORGAN_01 | First local run in Arcade | "Reserve the rig before you hit Run. Jenkins doesn't know you're there otherwise." |
| BARK_MORGAN_02 | GW14 | "We never touch app/src/main. Tests live in androidTest." |
| BARK_MORGAN_03 | INC36/INC37 resolved | "Every OCR fix is one more reason to move that check to UI Automator 2.3." |
| BARK_MORGAN_04 | Fast Diagnosis | "Evidence first, then the fix. Nice read." |
| BARK_MORGAN_05 | Combo 4 / combo 8 | "Four clean calls in a row." / "Eight. You're running this lab." |
| BARK_RILEY_01 | GW07 / GW19 | "Hey! That was my run!" |
| BARK_RILEY_02 | INC27 resolved | "Ha. Welcome to the club." (Cur) |
| BARK_SAM_01 | INC41 resolved | "Matrix is green and ROSIE is back to Unavailable. Perfect." |
| BARK_ALEX_01 | INC34 Request changes | "Ah — main is off limits. Got it, fixing." |

### 5.5 Failure feedback that teaches (Teach Cards)
Every penalty, wrong Diagnosis Call, bounced escalation, wrong drill/quiz answer and premature
resolve shows a **Teach Card** — never just "wrong". Layout (right panel in Shift, centre modal in
Academy, inline strip in drills): 1) **What happened** (neutral, one line) · 2) **Why** (the fact, ≤ 2
lines, Ref § and `F###` where known; illustrative badge if applicable) · 3) **Do instead** (the exact
action) · 4) buttons **Practice** (linked drill, pre-filtered to the tag) · **Read** (Field Manual) ·
**Got it** · 5) footer: tag chip with the mastery change (e.g. `power.18v  0.71 → 0.50`). In Shift the
card collapses to a chip after 5 s; the full card is in the summary.

| Trigger | What happened | Why | Do instead | Practice |
|---|---|---|---|---|
| GW01 | "The Flex fried on the 24 V tap." | "LabSim devices draw an irregular 18 V; they bypass the DC rails and use commercial AC strips. (Ref §6)" | "Free an outlet on the AC strip; use the device's own PSU." | DR04 |
| GW02 | "The Collis probe fried on DC power." | "Collis probes are high-cost and, like LabSim devices, go only on AC strips. (Ref §1, §6)" | "Plug the probe PSU into the strip; re-seat its rear ribbon." | DR04 |
| GW03 | "You pulled a fuse on a live branch." | "De-energise before servicing a fused line. [illus. practice]" | "Regulator input off (or MAIN off), then swap the fuse." | DR13 |
| GW04 | "Wrong fuse rating." | "Use the rating on the holder label (10 A on the 5 V 10 A line). [illus. rating]" | "Take a red 10 A blade fuse." | DR13 |
| GW05 | "ROSIE opened to general pipelines." | "Unavailable keeps PayCore's merchant safe; only jobs naming the robot use it, and Orca resets it afterwards. (Ref §3)" | "Leave it Unavailable; pass `ROBOT_NAME=rosie`." | DR01 |
| GW06 | "Pushing the arm released its magnetic lock." | "Manual moves turn the banner yellow; only Park All re-homes to the limit switches. (Ref §6)" | "Motion Control → Park All." | DR16 |
| GW07 | "You cut power during an active test." | "The dashboard locks out during tests for this reason. (Ref §6)" | "Wait for the job to finish." | DR16 |
| GW08 | "Port 5555 used." | "5555 is the ADB default and let scripts drive coworkers' desk devices; the lab uses 5444. (Ref §4)" | "`portNumber=5444`; `adb connect <ip>:5444`." | DR03 |
| GW09 / GW10 | "Legacy device configuration lost." | "Robots link to a separate Device row so upgrades keep the old config for rollback. (Ref §3)" | "Create a new Device row and relink Robot Device." | DR12 |
| GW11 | "Security monitoring was tampered with." | "The NUC disk problem is why hardware control moved to the Pis — not something to delete. (Ref §1)" | "Move control back to the Pi." | DR17 |
| GW12 | "Jared bounced the escalation." | "Escalate hardware Connection Failed causes; config issues are yours. (Ref §3)" | "Read the Notes / Edit view and fix it." | DR14 |
| GW13 | "You restarted shared infrastructure." | "Orca, Jenkins and Ollama VMs share the GPU blade; restarts kill every running job. (Ref §1)" | "Restart only the failed service." | DR17 |
| GW14 | "Edited app/src/main." | "main holds production/app registration code; QA never modifies it. (Ref §4)" | "Put tests in the androidTest packages." | DR15 |
| GW15 | "Deprecated theme/kernel." | "theme is locked to avocado; kernelType to CPA (replaces SPA). (Ref §4)" | "`theme=avocado`, `kernelType=CPA`." | DR02 |
| GW16 | "Resolved too early." | "The fix isn't verified yet (next health check / next build)." | "Check the ticket's verification line." | — |
| GW17 | "Extra power cycle." | "Recovery shows at the next 5-minute health check; cycling again delays it. (Ref §3)" | "Verify with curl and wait for the ping." | DR01 |
| GW18 | "Offsets used to compensate." | "Offsets are legacy; the lab is calibrated to true (0,0). (Ref §3)" | "Offsets to 0; fix the coordinates or hardware." | DR12 |
| GW19 / GW20 | "You took over someone else's rig." | "Active runs and Reserved rigs belong to their engineer. (Ref §3, §6)" | "Ask in LabChat first." | DR01 |
| GW21 | "Ω mode on a live circuit." | "Resistance is measured with power off. [general practice]" | "Power off, then Ω." | DR13 |
| GW22 | "You edited the robot's Name." | "Name is the system identifier pipelines use; the tablet shows the Human Readable Name. (Ref §3)" | "Revert Name; edit Human Readable Name." | DR12 |
| GW23 | "You unplugged a coworker's device." | "The problem is your port, not their desk. (Ref §4)" | "Stop the run, disconnect, set 5444." | DR03 |
| GW24 | "You overrode a failed health check." | "Connection Failed blocks checkouts for a reason; the next ping will flip it back. (Ref §3)" | "Find the cause or escalate to Jared with the endpoint." | DR01 |

Wrong Diagnosis Call and bounced escalations show the incident's `wrongCallHint` — **where to look**,
never the answer (e.g. INC03 called "Four Pis crashed": "A crashed Pi still shows its red PWR LED.
These are completely dark — follow the power.").

---

## 6. Onboarding, controls and inventory

### 6.1 First launch
1. Title screen (rack ambience; WALL-E tapping in the background) → **New profile**: name (≤ 16 chars).
2. One quick-setup screen: mouse sensitivity, invert Y, subtitle size, colour-blind mode (banners and LEDs gain text/shape glyphs), Reduce Motion, Realism (Standard default; Strict explained).
3. Straight into **M01** at `loc.entrance` (Cur: "starts automatically on a new save") — no menus before the first minute of play.

### 6.2 The first 10 minutes (Cur M01 + gameplay wrapper)

| Time | Cur M01 step | Wrapper additions (this doc) |
|---|---|---|
| 0:00–0:40 | 1 Morgan's welcome | Prompts once each: mouse-look, `E`/`Space` to continue. Badge door opens with `E`. |
| 0:40–1:40 | 2 Walk to Rack A; 3 "Meet WALL-E" | `WASD`/`Shift` prompts. **Wow moment:** WALL-E is running `Java/uia-remote-regression-flex #4120` — solenoid tapping a Flex 3 on the blue payment screen, the dip arm sliding the white card ribbon in (the reference video). WALL-E's first quip. |
| 1:40–2:40 | 4–5 Inspect the tablet | Hold `RMB` prompt; callouts become Field Manual entries ("New entry" sparkle). |
| 2:40–3:40 | 6–7 Try Park All → `TEST IN PROGRESS — CONTROLS LOCKED` | First Teach-Card-style callout (lockout), no penalty. |
| 3:40–5:00 | 8–10 POWER panel, rack unit 33, SETI panel | Crouch `C` prompt for the lower panel view; flashlight `F` prompt on the rail labels. |
| 5:00–6:30 | 11–12 Walk to the 3D print corner | Ambient pass by the GPU blade (hum) and the tethered rack (MEGATRON/OPTIMUS labels) on the way — teaser callouts only. |
| 6:30–7:30 | 13 Lab Safety Card | Card goes to the Notebook (`Tab` prompt); its four rules preview GW06/GW07/GW01/escalation. |
| 7:30–9:00 | 14 Checkpoint `CP-M01.1` | Quiz UI; wrong answers show the curriculum explanation as a Teach Card. |
| 9:00–10:00 | 15 Wrap-up | Debrief: stars, XP, ACH01, Real-lab checklist, **Arcade preview** (DR10 Speed Quiz, DR14, DR17 unlocked) with **Play now**; Continue → M02/M03 choice. |

Rules: no fail states, no score, no timers; every control prompt appears once (bottom-centre, 3 s,
key glyph); hints follow Cur §2.0.

### 6.3 Controls (rebindable; defaults)

| Action | Key / mouse | Notes |
|---|---|---|
| Move | `W` `A` `S` `D` | 1.4 m/s |
| Walk fast | hold `Shift` | 2.4 m/s (no running in the lab) |
| Crouch | `C` (toggle; "hold to crouch" option) | Under-shelf Pis, fuses, GPUs 3–4 (Cur M17) |
| Look | Mouse | Pointer lock; FOV 60–90° (default 75°) |
| Interact / continue | `E` (also `Space` / click to advance dialogue) | Tap: use, press, plug, sit. Hold: long-press (power buttons 4 s), continuous (unscrew) |
| Dialogue choices | `1`–`4` | Hotbar is disabled while a dialogue is open |
| Inspect | hold `RMB` | Zoom + DOF; evidence outline (Standard) |
| Use held tool | `LMB` | Probe, screw, insert, swipe |
| Tool mode | `R` | Multimeter V DC / V AC / Ω / continuity; card Visa / Interac; fuse rating when picking |
| Hotbar | `1`–`5`, mouse wheel | 1 screwdriver · 2 multimeter · 3 spare fuse · 4 Ethernet cable · 5 test card |
| Holster / set down | `Q` | Puts the tool away; sets a carried item on the nearest surface |
| Notebook | `Tab` | Notes, evidence log, ticket checklist, Field Manual links |
| Flashlight | `F` | Head torch for fuse windows and labels |
| Tickets | `T` | Shift/Weak Spot; `Enter` acks; `Esc` closes |
| Arcade hint | `H` | Nudge → Pointer → Walkthrough (confirm for tier 3) |
| Pause | `Esc` | In 3D: pause (any pointer-lock loss pauses). At the workstation: first `Esc` stands up, second pauses |
| Fast-forward (Academy/Free Play) | hold `]` | ×30 per Cur §2.0 |
| Controls overlay | `F1` | |
| Sandbox panel | `F10` | Free Play only |
| Workstation | normal mouse + keyboard | Pointer unlocked; apps are React UI; `Ctrl+Tab` cycles apps |

### 6.4 Physical tools and parts

**Hotbar tools** (carried once unlocked):

| Slot | Item | Unlock | Use | Notes |
|---|---|---|---|---|
| 1 | Screwdriver (hex/Phillips bits) | M04 | 2.5 mm and 5 mm fixture bolts, cradle clamps, dip-arm hub | Wrong bit/bolt size: "doesn't fit" |
| 2 | Multimeter (`prop.multimeter`) | M03 | V DC / V AC / Ω / continuity at probe points (rail out, regulator out, both sides of a fuse, barrel jacks) | Ω on a live circuit → GW21 |
| 3 | Spare blade fuse | M03 | Insert into an empty holder | Pocket holds 3; refill from `prop.fuse-spares`: 5 A tan, 7.5 A brown, 10 A red, 15 A blue |
| 4 | Ethernet cable (1 m spare) | M06 | Replace a damaged cable / re-plug | Refill from the blue bin |
| 5 | Test card (Visa / Interac; `R` toggles) | M10 | Swipe through the desk card-reader utility | Never inserted into rigs (Collis does that) |

**World items and parts:**

| Item | Where | Use |
|---|---|---|
| Steel ruler (`prop.ruler`) | Rack A | Snaps to a device screen's top-left (0,0) and reads mm — "ruler-measured coordinates" (unlocked M09) |
| Flashlight | Always (`F`) | Fuse windows, labels |
| Lab Safety Card (`prop.safety-card`) | Notebook after M01 | Four safety rules |
| Bolt bins 2.5 mm / 5 mm (`prop.bolt-bins`) | `loc.jared-bench` | Fixtures; wrong size doesn't fit |
| Spare Raspberry Pi ×2 ("~$50", pre-imaged) | Red parts bin | Swap a dead Pi (rarely the right fix) |
| USB-C Pi leads, micro-USB tablet cable, hub USB cables | Blue parts bin | Re-seat / replace |
| Spare solenoid, ribbon cables, card-insert ribbon | Multi-drawer organiser | Repairs, Build mode |
| Spare Flex 2 (`SIM-F2-000015`) | Husky chest drawer 2 | INC42 |
| Legacy Flex 1 | Storage shelf (after INC42) | INC43 |
| Flex 4 PSU brick (`prop.flex4-psu-brick`) | EVE's shelf / power-wall bench | INC17, Cur M03 |
| Spare Collis probe (`prop.collis-probe-spare`) | Locked cabinet (120 s to sign out in Arcade) | After GW02 |
| AC power strips `STRIP-A/B/T/W` | Racks / power wall | LabSim devices, Collis probes, Windows boxes |
| Desk fan, soldering station | Benches | Non-lab loads that may occupy strip outlets |
| 3D printers (Prusa, Bambu Lab) + black PLA | `loc.print-corner` | INC59, Build mode |
| USB card-reader utility | Your desk | INC55 |
| Printed receipts | Rig printers | INC57 |

Carry rules: carrying a large item (device, Pi, cradle) disables the hotbar; `Q` sets it down on the
nearest valid surface; `E` on a valid slot installs it.

---

## 7. Save data (what persists)

All persistence is `localStorage` (canon: no backend), JSON, UTF-8. Writes are debounced 2 s and forced
on: Academy step checkpoint, shift end, drill round end, every 10 flashcard reviews and session end,
certification result, achievement unlock, settings change, `visibilitychange → hidden`.

### 7.1 Keys (naming follows the curriculum's `labsim.<store>.v1` style)

| Key | Content | Budget |
|---|---|---|
| `labsim.profiles.v1` | `{ profiles: [{id, name, createdAt, lastPlayedAt}], activeProfileId }` | 2 KB |
| `labsim.settings.v1` | Browser-wide settings (§7.3) | 4 KB |
| `labsim.profile.v1:<id>` | Profile blob (§7.2) | ≤ 512 KB |
| `labsim.profile.v1:<id>:backup` | Last successfully parsed profile blob | ≤ 512 KB |
| `labsim.leitner.v1:<id>` | Exactly the Cur §4.0 Leitner store shape `{ "<FC id>": {box, due, lastReviewed, streak} }`, namespaced per profile | ≤ 64 KB |
| `labsim.cert.v1:<id>` | Exactly the Cur §5.4 certification record, namespaced per profile | ≤ 16 KB |
| `labsim.checkpoint.v1:<id>` | Current Academy step checkpoint (module, step, sim snapshot) | ≤ 300 KB |
| `labsim.freeplay.v1:<id>:<slot 1-3>` | Free Play snapshot (sim state, clock, injected faults) | ≤ 300 KB each |
| `labsim.leaderboards.v1` | All boards (§4.7) | ≤ 200 KB |
| `labsim.corrupt.v1:<epochMs>` | Unparseable blob kept for export (max 2) | — |

The curriculum names the stores `labsim.leitner.v1` and `labsim.cert.v1`; this doc only adds the
`:<profileId>` suffix for multiple profiles. On first run, un-suffixed copies are migrated into the
active profile's keys.

Limits: max **3** profiles. Typical profile < 300 KB; worst case ≈ 2.5 MB with all Free Play slots. On
`QuotaExceededError` drop the oldest Free Play slot of the active profile first, then toast; profiles,
Leitner, cert records and leaderboards are never dropped. Load: profile → on failure backup → on
failure fresh profile, corrupt blob kept. Write order: backup ← current, then main ← new. All access
in try/catch; if storage is unavailable the game runs in memory with a banner "Progress won't be saved".

### 7.2 Profile blob shape (illustrative values)
```json
{
  "schemaVersion": 1,
  "contentVersion": "v1",
  "id": "p_3f9c2a",
  "name": "Player1",
  "createdAt": 1791158400000,
  "realism": "standard",
  "xp": 4420,
  "rank": "AUTOMATION_ENGINEER_I",
  "pendingRank": { "rank": "AUTOMATION_ENGINEER_II", "missing": ["xp:580"] },
  "cosmetics": { "lanyard": "green", "unlocked": ["lanyard.grey", "lanyard.blue", "lanyard.green", "desk.plant"] },
  "academy": {
    "modules": {
      "M01": { "status": "complete", "stars": 3, "bestCheckpoint": 1.0, "completedAt": 1791158900000, "replays": 0 },
      "M07": { "status": "in_progress", "stars": 0, "bestCheckpoint": 0.0, "completedAt": null, "replays": 0 }
    },
    "current": { "module": "M07", "step": 6 },
    "starsTotal": 17
  },
  "mastery": {
    "orca.status.reserved": { "m": 0.82, "level": 3, "lastEvidenceAt": 1791240000000, "minSeen": 0.31 },
    "power.18v":            { "m": 0.50, "level": 1, "lastEvidenceAt": 1791243000000, "minSeen": 0.50 }
  },
  "incidents": {
    "INC03": { "attempts": 4, "solves": 4, "bestMs": 151000, "bestScore": 742, "fastDiagnoses": 2, "escalations": 1, "lastSeenAt": 1791243000000, "variantsSeen": ["A", "C"] }
  },
  "drills": { "DR01": { "best": 2310, "medal": "gold", "rounds": 14 } },
  "shifts": {
    "history": [
      { "at": 1791243000000, "length": 10, "seed": "a8f2c1d4", "realism": "standard", "score": 5120, "grade": "A",
        "ratio": 1.21, "ticketsSpawned": 11, "ticketsResolved": 10, "breaches": 0, "penalties": ["GW17"],
        "strikes": 0, "maxCombo": 5, "uptime": 0.91, "fastDiagnoses": 6, "escalations": { "correct": 2, "bounced": 0 },
        "abandoned": false }
    ],
    "gradeCounts": { "S": 0, "A": 3, "B": 5, "C": 2, "D": 1 },
    "bestFullShiftRatio": 0.0
  },
  "daily": { "lastRankedDateKey": "2026-10-05", "rankedCount": 9,
             "history": [ { "dateKey": "2026-10-05", "score": 4980, "grade": "B", "realism": "standard" } ] },
  "streak": { "current": 12, "longest": 30, "lastCountedDateKey": "2026-10-05", "freezes": 1,
              "xpToday": 340, "xpTodayDateKey": "2026-10-05" },
  "achievements": {
    "unlocked": { "ACH01": 1791158900000, "ACH04": 1791160000000 },
    "progress": { "ACH29": { "inspected": ["wall-e:pi", "wall-e:tablet"] }, "ACH30": { "quips": ["QUIP_WALL-E_IDLE"] },
                  "ACH07": { "cleanShiftsInARow": 3 }, "ACH36": { "correctEscalations": 2 } }
  },
  "fieldManual": { "unlocked": ["fm.lab-basics", "fm.orca.status"], "bookmarks": ["fm.uia.config"] },
  "notebook": { "notes": "Rack B fuse again?", "pinnedEvidence": [] },
  "penalties": { "GW17": 3, "GW08": 1 },
  "stats": { "inspections": 211, "ticketsTotal": 64, "playMs": 23400000 },
  "flags": { "seenIntro": true, "dailyUnlocked": false, "fullShiftUnlocked": false }
}
```
(Flashcard boxes and certification records live in their own keys, §7.1 — not duplicated here.)

### 7.3 Settings blob (`labsim.settings.v1`)
`{ schemaVersion, graphics: {quality: "low"|"medium"|"high", fov, shadows, ao, resolutionScale}, audio: {master, sfx, ui, ambience, voice}, controls: {sensitivity, invertY, holdToCrouch, bindings: {action: key}}, accessibility: {subtitleSize, colourBlind: "off"|"deuter"|"prot"|"trit", reduceMotion, quipsEnabled}, freePlay: {timeScale, penalties, pipelines, randomFaults} }`.

### 7.4 What does not persist
* An in-progress **shift** (on reload: recorded `abandoned: true`, no board entry; a ranked Daily submits its score at abandon).
* An in-progress certification attempt (counts as a failed attempt; Cur §5.4 retake rules apply).
* Live sim state outside Academy checkpoints and Free Play slots (each session starts from the §3.1 factory state).
* Jenkins build history, LabChat transcripts, Orca Notes (regenerated per session/scenario).
* Drill rounds in progress.

### 7.5 Versioning, export, reset
* `schemaVersion` integer; migrations run in order on load; unknown keys are preserved.
* `contentVersion` stored with boards and daily history; `INCnn`/`DRnn`/`ACHnn` IDs never change, so stats survive content updates.
* Profile ▸ **Export progress** downloads `labsim-profile-<name>-<YYYY-MM-DD>.json` (profile + Leitner + cert); **Import** validates and migrates; **Reset profile** requires typing the profile name.

---

## Appendix A — Simulation rules this design relies on

The sim/apps docs own implementation; these behaviours must hold for the incidents to work.

| ID | Rule |
|---|---|
| SR01 | Orca health checks run at every game time with minutes divisible by 5, pinging every rig except `Offline` (health log `<name>  SKIPPED (Offline)`). For `Reserved` rigs the result never changes status (health log `<name>  RESERVED — not overridden` [illus.]) and writes no Notes line. A failure (no response within 10 000 ms, or non-200) on an `Available`/`Unavailable` rig sets `Connection Failed` and writes a Notes line; the pre-failure status is restored on the first 200 [illus. restore rule]. |
| SR02 | Manual status changes write a Notes `STATUS` line with the user. |
| SR03 | The Pi `/health` aggregates its upstreams (the rig's Callus box; a motion host if not local) and answers `502 Bad Gateway {"error":"<upstream> unreachable/error"}` when one fails; the camera service is not included [illus.]. A shared Pi answers for every rig it serves. |
| SR04 | Tablet ↔ Pi link is USB: tablet grey when its Pi is unreachable, green when only the network is down [illus.]. |
| SR05 | Named checkout of an `Unavailable` rig needs the exact system Name; release returns it to `Unavailable`; HRN or wrong case → 404 [illus. code]. |
| SR06 | Checkout matches exact DeviceType enum, profile, `printer`/`hasPrinter`, physical touch, tethered (MFD populated) and capabilities (dynamic JSON ∪ pipeline script; contradiction → 409 [illus.]). |
| SR07 | Dragging a carriage ≥ 20 mm releases the magnetic lock (banner yellow); `xy_touch` then returns 409 until **Park All** homes every axis to the limit switches (0,0) (Cur S13). |
| SR08 | While a rig is checked out, its tablet shows `TEST IN PROGRESS — CONTROLS LOCKED` and ignores input. |
| SR09 | Power is a graph; a node is powered only if its upstream path is intact. A LabSim device or Collis probe on any DC node becomes `FRIED` in Arcade/Free Play (spark only, no damage, in Academy). |
| SR10 | Fuses: wrong rating flagged; under-rated (< label) blows within 20 real s under load. |
| SR11 | Workstation ADB: a runner configured with port 5555 is refused by lab devices and falls back to the first device the ADB server already knows — Riley's desk Flex `10.42.60.4:5555` (Cur S19). Port 5444 reaches only lab devices. |
| SR12 | A Laz OOBE resets the device's ADB-over-TCP listener; re-enable with `adb tcpip 5444` over the Pi's USB [illus.]. |
| SR13 | `xy_touch` lands at Screen Location + Offsets (+ cradle tilt for INC59); a tap succeeds if inside the button's bounds on the device's current screen. Screen Locations are keyed by Device Type. |
| SR14 | OCR crops the camera frame at the Screen Compare box and compares Tesseract output with `expected` exactly (case-sensitive). |
| SR15 | Shift pipeline runs last 60 real s; pass/fail follows the active faults affecting that job on that rig. |
| SR16 | Jared/Morgan merge a correct PR 20 real s after it is opened (Cur M09); merging a `gort` PR under `config/screen-locations/` syncs Orca's Screen Locations within 10 real s [illus.]. |
| SR17 | Time scale: Academy 1× (Force health check + fast-forward ×30 per Cur §2.0), Shift 5×, Free Play 1×–10× (+×30 hold), certification 1×. Physical durations are **real seconds** in every mode: Pi boot 40 s, Windows box boot 50 s, LabSim device boot 30 s, MySQL start 5 s + Orca reconnect 15 s, Ollama restart 10 s, `GortCardSync` run 20 s, 3D print 90 s, Jared's hands-on fix 60–90 s. |
| SR18 | NPCs answer LabChat within 10–20 real s with scripted replies per incident; Riley's desk Flex visibly navigates when driven. |

## Appendix B — Coverage matrix (Taught → Practised → Tested)

Release gate (P3): every fine tag has a curriculum module that teaches it, ≥ 1 hands-on incident, and ≥ 1 drill besides DR10 Speed Quiz (which samples every unlocked tag); every module also ends with its curriculum checkpoint. Generated from §2.4.2, §3.5 and §4.8.1 — regenerate when content changes.

| Tag | Taught in | Practised (incidents) | Tested (drills) |
|---|---|---|---|
| `people.roles` | M01 | INC01, INC20 | DR14, DR17, DR10 |
| `hw.devices` | M02 | INC23, INC42, INC44, INC49 | DR17, DR10 |
| `power.rails` | M03 | INC03, INC17 | DR04, DR09, DR13, DR10 |
| `power.fuses` | M03 | INC03 | DR04, DR13, DR10 |
| `power.18v` | M03 | INC17, INC18, INC42 | DR04, DR10 |
| `hw.rigbom` | M04 | INC13, INC15, INC16, INC59 | DR17, DR10 |
| `hw.print3d` | M04 | INC59 | DR17, DR10 |
| `hw.motion` | M04 | INC11, INC12, INC13, INC14, INC59 | DR16, DR10 |
| `hw.lockout` | M04 | INC12 | DR16, DR10 |
| `hw.tablet` | M04 | INC11, INC12, INC13, INC15, INC16, INC63 | DR16, DR10 |
| `hw.pi` | M05 | INC01, INC03, INC04, INC06, INC08, INC19, INC28, INC56 | DR13, DR10 |
| `hw.nuc` | M05 | INC02, INC19 | DR17, DR10 |
| `cards.wine` | M05 | INC56 | DR17, DR10 |
| `tools.terminal` | M05 | INC10, INC54, INC56, INC60 | DR18, DR10 |
| `arch.flow` | M06 | INC15, INC60 | DR09, DR17, DR10 |
| `arch.roles` | M06 | INC62 | DR17, DR10 |
| `arch.stack` | M06 | INC60, INC62 | DR17, DR10 |
| `orca.status` | M06 | INC07, INC40, INC48 | DR01, DR12, DR10 |
| `orca.status.unavailable` | M06 | INC40, INC41 | DR01, DR12, DR10 |
| `orca.status.offline` | M06 | INC05, INC07, INC19, INC42, INC44, INC59 | DR01, DR12, DR10 |
| `orca.status.connfailed` | M06 | INC01, INC02, INC03, INC04, INC05, INC19 | DR01, DR12, DR14, DR18, DR10 |
| `orca.status.reserved` | M06 | INC06, INC31, INC38, INC48 | DR01, DR12, DR10 |
| `orca.healthcheck` | M06 | INC01, INC05, INC06, INC07 | DR01, DR12, DR10 |
| `orca.notes` | M06 | INC01, INC02, INC04 | DR12, DR18, DR10 |
| `orca.robot` | M06 | INC01 | DR12, DR10 |
| `orca.names` | M07 | INC41, INC63 | DR12, DR10 |
| `orca.device` | M07 | INC42, INC43 | DR12, DR10 |
| `orca.devicetype` | M07 | INC21, INC33, INC39, INC42, INC44 | DR11, DR12, DR10 |
| `orca.urls` | M07 | INC08, INC09, INC65 | DR12, DR10 |
| `orca.tethered` | M07 | INC30, INC45, INC46, INC47 | DR02, DR12, DR10 |
| `orca.offsets` | M07 | INC14 | DR12, DR10 |
| `orca.capabilities` | M08 | INC23, INC49, INC52 | DR12, DR10 |
| `orca.merchant` | M08 | INC40, INC50, INC51 | DR12, DR10 |
| `laz.oobe` | M08 | INC28, INC40, INC50 | DR09, DR10 |
| `ubi.routing` | M08 | INC50 | DR17, DR10 |
| `go.sdk` | M08 | INC23, INC26, INC51 | DR17, DR10 |
| `orca.screens` | M09 | INC14, INC20, INC21, INC22 | DR05, DR07, DR12, DR10 |
| `orca.xytouch` | M09 | INC15, INC64 | DR12, DR10 |
| `receipt.qr` | M09 | INC20 | DR07, DR10 |
| `receipt.maps` | M09 | INC20, INC21 | DR07, DR10 |
| `bots.types` | M09 | INC52, INC64 | DR17, DR10 |
| `bots.pin` | M09 | INC52 | DR17, DR10 |
| `hw.collis` | M10 | INC16, INC18 | DR17, DR10 |
| `cards.philosophy` | M10 | INC40, INC41, INC52, INC55, INC58 | DR17, DR10 |
| `cards.swipe` | M10 | INC55 | DR12, DR17, DR10 |
| `cards.diptap` | M10 | INC16, INC53, INC54, INC65 | DR09, DR12, DR17, DR10 |
| `cards.callus` | M10 | INC02, INC18, INC53, INC54 | DR17, DR10 |
| `jenkins.envvars` | M11 | INC39, INC44, INC49, INC51 | DR11, DR18, DR10 |
| `jenkins.folders` | M11 | INC26 | DR18, DR10 |
| `jenkins.checkout` | M11 | INC07, INC41, INC48 | DR18, DR10 |
| `adb.port` | M12 | INC27, INC28, INC34 | DR02, DR03, DR19, DR10 |
| `adb.usage` | M12 | INC24, INC27, INC28, INC35, INC64 | DR03, DR18, DR19, DR10 |
| `arch.repos` | M13 | INC25, INC53 | DR17, DR10 |
| `tools.intellij` | M13 | INC31, INC32 | DR18, DR10 |
| `tools.github` | M13 | INC20, INC25, INC34, INC38, INC53 | DR18, DR10 |
| `uia.layout` | M13 | INC34 | DR15, DR10 |
| `uia.packages` | M13 | INC38 | DR08, DR15, DR10 |
| `uia.multidevice` | M13 | INC30, INC45 | DR15, DR10 |
| `uia.pom` | M13 | INC32, INC34, INC38 | DR08, DR10 |
| `uia.sync` | M13 | INC32, INC34, INC35, INC38 | DR08, DR10 |
| `uia.scroll` | M13 | INC33 | DR08, DR10 |
| `uia.taxtest` | M14 | INC31, INC35, INC47 | DR09, DR10 |
| `uia.config` | M14 | INC27, INC29, INC30, INC33, INC38 | DR02, DR10 |
| `pigeon.lstr` | M15 | INC22, INC26 | DR17, DR10 |
| `pigeon.json` | M15 | INC24, INC25 | DR06, DR18, DR10 |
| `pigeon.abstraction` | M15 | INC25 | DR17, DR10 |
| `pigeon.nolint` | M15 | INC25 | DR06, DR10 |
| `jenkins.logs` | M15 | INC20, INC22 | DR18, DR10 |
| `orca.screencompare` | M16 | INC09, INC36, INC37, INC38 | DR05, DR09, DR12, DR10 |
| `pigeon.gimp` | M16 | INC24, INC36 | DR05, DR10 |
| `uia.v23` | M16 | INC38, INC64 | DR17, DR10 |
| `vision.camera` | M16 | INC08, INC09, INC57 | DR17, DR10 |
| `vision.tesseract` | M16 | INC36, INC37, INC61 | DR17, DR10 |
| `arch.infra` | M17 | INC10, INC60, INC62 | DR17, DR10 |
| `vision.ollama` | M17 | INC10, INC57, INC61 | DR17, DR10 |
| `tools.claude` | M17 | INC61 | DR17, DR10 |
| `uia.history` | M18 | INC40 | DR17, DR10 |
| `semi.paydisplay` | M18 | INC47 | DR17, DR10 |


## Appendix C — Jenkins jobs and ticket reply IDs referenced

Parameters follow Cur S07: `ROBOT_NAME`, `DEVICE_TYPE`, `MERCHANT`, `CARD_PROFILE`; env block keys
`RUN_TYPE`, `PORT_NUMBER`, `THEME`, `KERNEL_TYPE`, `APP_ID`, `APP_SECRET`, `API_KEY`.

| Job | Source | Used by |
|---|---|---|
| `Java/uia-remote-regression-flex` | Cur §0.6 | PL1, INC12, INC39, INC40, INC48 |
| `Java/uia-remote-tethered-tax` | Cur §0.6 | PL2, INC31, INC32, INC35, INC45, INC47 |
| `Java/pigeon-android-sale-swipe` | Cur §0.6 | PL3, INC07, INC18, INC20–INC22, INC55 |
| `Java/uia-remote-regression-mini` | Cur §0.6 | PL4, INC39 (variant) |
| `Java/contact-canada-pin-sale` | Cur §0.6 | PL5, INC08, INC16, INC49, INC52 |
| `Java/go-sdk-sale-smoke` | Cur §0.6 | PL6, INC23, INC51 |
| `Java/laz-oobe-merchant-swap` | Cur §0.6 | INC28, INC40, INC50 |
| `iOS/pigeon-ios-go-sdk-smoke` | Cur §0.6 | INC26 (scenery) |
| `Java/uia-remote-duo-cfd` | [illus.] | PL7, INC09, INC36–INC38 |
| `Java/paycore-standalone-matrix` | [illus.] | PL8, INC40, INC41 |
| `Java/uia-remote-printerless-smoke` | [illus.] | INC44 |
| `Java/vision-poc-receipt-check` | [illus.] | INC10, INC57 |
| `Java/pigeon-android-tip-sale` | [illus.] | INC25 |
| `Java/pigeon-android-payment-compare` | [illus.] | INC24 |
| `Java/pigeon-windows-tender` (misfiled as `iOS/…`) | [illus.] | INC26 |
| `iOS/pigeon-ios-lstr-legacy` | [illus.] | INC26 (scenery) |

| Reply ID | Incident | Text |
|---|---|---|
| `R_WAIT_PING` | INC05 | "It's healthy now — Orca re-checks every 5 minutes; it'll flip at the next ping." |
| `R_OFFLINE` | INC05-B | "BAYMAX is Offline while Jared rebuilds it; Orca skips health checks for Offline rigs. Working as designed." |
| `R_FIXED` | INC06 | "EVE's Pi was down — Reserved hides that from health checks. Fixed; please re-run." |
| `R_LOCKOUT` | INC12 | "A test is running; the dashboard locks out during runs. It frees when the job finishes." |
| `R_WAIT` | INC48-B | "EVE is reserved by an active local run; ETA 2 minutes." |
| `R_FALSE_POSITIVE` | INC57-A | "Vision PoC misread the receipt; printed tip and total are correct (values attached)." |
| `R_DUO_BLIND` | INC64 | "ADB can't see the Duo's CFD. Tap it physically through Orca's xy_touch on R2-D2, or use a UIA 2.3 dual-screen locator in the test." |
| `R1`–`R4` | INC58, INC62 | As listed in the incident |
