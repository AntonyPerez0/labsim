/**
 * Field Manual articles — about. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const ABOUT_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "who-is-who",
    title: "Who's Who & Who to Ask",
    category: "Lab Basics",
    summary: "The people you will work with, what each one owns, and the escalation path — especially which problems go to {{jared}} and which are yours to fix.",
    factIds: ["F111", "F116", "F130", "F133", "F138", "F159", "F214"],
    tags: ["people.roles", "lab.orientation"],
    related: ["lab-tour", "ts-connection-failed", "teams-and-history"],
    keywords: ["mentor", "escalation", "{{jared}}", "{{tate}}", "{{david}}", "{{morgan}}", "{{riley}}", "{{sam}}", "{{alex}}", "contact"],
    practice: ["INC01", "INC02", "DR14"],
    body: `## Mentors

| Person | Owns | Ask them about |
|---|---|---|
| **{{jared}}** — hardware & lab lead | Builds the rigs; calibrated the lab hardware to a true (0,0) origin {F130}; merged the coordinate PR that ended the receipt-QR breakage {F214} | Connection Failed hardware escalations {F111}, power, rig mechanics, coordinate PRs |
| **{{tate}}** — Orca developer | Built the custom filtering UI on Orca's Robot list {F116}; extended Merchant Config with App ID, App Secret and API Key {F138} | Robot statuses, Orca entities and fields, Merchant Config |
| **{{david}}** — SDK frameworks | Oversees the SDK frameworks that use dynamic JSON capability lookups {F133}, including the Terminal SDK | Robot Capabilities, Go SDK pipelines |
| **{{morgan}}** — uia-remote author (your onboarding mentor) | Created uia-remote because no prior framework could automate native tethered setups {F159} | uia-remote, config.properties, ADB, Pigeon, test design |

> **Illustrative (sim only):** The reference calls the uia-remote author "the presenter"; the game names that person {{morgan}}†. {{jared}}, {{tate}} and {{david}} are named in the reference.

## Coworkers you will meet in the Arcade†

- **{{riley}}** — IPX QA engineer in the office. {{riley}}'s desk device listens on the default ADB port 5555, which is exactly why the lab uses 5444 ([[adb-port-5444]]).
- **{{sam}}** — PayCore engineer who runs card matrices on ROSIE, a PayCore standalone rig kept **Unavailable** ([[orca-statuses]]).
- **{{alex}}** — a new hire who copies old configs and asks good questions. Explaining things to {{alex}} is a good test of what you know.
- **Jenkins Bot** — files tickets automatically when pipelines fail.

## The escalation path

1. **Read the evidence first.** Orca's Notes (endpoint + error), the Jenkins console, the camera stream, the tablet banner.
2. **Hardware Connection Failed → {{jared}}.** A crashed Pi board or a Minix box running Callus going offline is a hardware problem; escalate it with the endpoint and error text ([[ts-connection-failed]]).
3. **Config problems are yours.** A wrong Merchant Config field, a lower-case \`DEVICE_TYPE\`, a 5555 in \`config.properties\`, a missing capability — fix them yourself. Bouncing config problems to {{jared}} wastes the lab's hardware time.
4. **Never paper over a failed ping.** Manually setting a Connection Failed robot back to Available hides a real fault.
5. **Ask before taking someone's rig.** Reserved rigs and active runs belong to the engineer running them.

> **Tip:** A good escalation names the robot, the status, the exact endpoint and the error, e.g. "EVE is Connection Failed: health ping timed out on 10.42.10.12:8000†".
`,
  },
  {
    id: "how-the-sim-differs",
    title: "How the Sim Differs from the Real Lab",
    category: "About the Sim",
    summary: "Every place LabSim compresses time, simplifies physics or invents a detail — so you know exactly which habits transfer to the real lab unchanged and which numbers are game-only.",
    factIds: ["F099", "F106", "F107", "F155", "F213", "F228", "F229", "F092", "F217"],
    tags: ["lab.orientation"],
    related: ["illustrative-details", "orca-health-check", "lab-tour"],
    keywords: ["differences", "realism", "simplification", "illustrative", "sim only", "strict", "compressed", "time scale", "force health check"],
    body: `## Never simplified

These behave exactly as in the real lab, in every mode — they are the point of the game:

- The **five Orca statuses** and their rules ([[orca-statuses]]).
- The **health check** cadence: every 5 minutes, a dropped or non-200 ping means Connection Failed; Offline is skipped {F099} {F106} {F107}.
- **ADB on port 5444**; 5555 is the default and the cause of the coworker collision ([[adb-port-5444]]).
- The **power chain** and the 18V rule: LabSim devices and Collis probes only on commercial AC strips {F228} {F229}.
- The **Device Type** enum is ALL CAPS and case-sensitive.
- \`config.properties\` locks (\`theme=avocado\`, \`kernelType=CPA\`, \`portNumber=5444\`) and the Station Duo same-IP rule.
- The status tablet's tabs and buttons, the yellow banner after a manual move, and Park All.
- uia-remote's folder layout, packages, page-object rules and the Tax test flow.

## Compressed for play

| Real world | In LabSim | Why |
|---|---|---|
| Health check every 5 real minutes | Every 5 **game** minutes. Arcade shifts run the clock at 5× (a ping every 60 real seconds). Academy and Free Play add Orca's tutorial **Force health check** button† and fast-forward ×30 | Waiting 5 real minutes is not fun; the rule (recovery appears at the next ping, Offline is skipped) is still taught and scored |
| Jenkins runs take many minutes | About 60 real seconds per run in a shift | Pipelines stay visible inside a short shift |
| A big lab | The room is compacted; fast-walk in shifts | Diagnosis is about thinking, not walking |
| ~300 solder joints per robot {F092} | You re-seat connectors and sort bolts instead of soldering | Taught as a fact and a craft, not a grind |
| Typing long commands | Tab-completion and history in Standard realism (history only in Strict) | Accessibility |
| Electrical mistakes can hurt people | They only destroy equipment (spark, smoke, cost, points) | A safety lesson without injuries |

## Simplifications inside the simulation

These are deliberate shortcuts for determinism and play (the simulation design's Appendix B). The *rules* they serve are real; the mechanics underneath are simplified.

| # | Area | What the sim does | What's real |
|---|---|---|---|
| B1 | Clocks | Health checks follow the (possibly accelerated) game clock; physical processes run in real seconds | One clock |
| B2 | Health pings | A ping is evaluated instantly; a timeout is stamped with the request time although it "takes" 10 s; all robots are pinged in one instant | Pings take time and are sequential |
| B3 | Fast-forward | Crossing several 5-minute marks runs one check per mark against the same state | Time passes between checks |
| B4 | Network | A reachability rule (host up, cable, switch, listening port) with fixed latencies; no random packet loss | Real networks are noisier |
| B5 | Probe taps | A tap lands only inside a small core around the button centre, so millimetre drift breaks taps every time {F213} | Real probes are a little more forgiving |
| B6 | xy_touch | The response is computed when the request is accepted and delivered after the motion | |
| B7 | Gantry | Linear motion at fixed speeds, no acceleration, no missed steps | Steppers can stall or skip |
| B8 | Power | An ideal solved circuit with simple regulator droop and a fuse stress model; Pis reboot below a fixed voltage | Analogue reality |
| B9 | Damage | Arcade shorts follow fixed rules; Academy mistakes only spark and never damage anything | Real mistakes cost money |
| B10 | Hung Pi | Cleared only by a power interruption (ssh is dead) | |
| B11 | Boot times | Fixed (Pi 40 s, Windows 50 s, VM 45 s, LabSim 30 s) | Variable |
| B12 | LabSim UI | A state machine of the screens automation uses; other apps are read-only; payments never reach a real backend | Full apps, real processing |
| B13 | Tax | Rounded once per order, half up | Per real tax rules |
| B14 | OCR | A deterministic model of Tesseract: clipping a label swaps look-alike glyphs (\`L\`→\`I\`, \`8\`→\`B\`); a 10-pixel shift, a capital letter or a typo still breaks the check {F155} | Real OCR is noisier |
| B15 | Cameras | Screen millimetres map linearly to webcam pixels (no perspective, glare or lens distortion) | Real optics |
| B16 | Render timing | Screens take a randomised time to render; without \`waitForScreen()\` a page object clicks too early at a fixed moment | Real render times vary more |
| B17 | Code | Page-object code is checked by pattern-level "code facts", not compiled | A real compiler and runtime |
| B18 | Two runners, one device | The first screen change by one makes the other's next wait or assertion fail | Real collisions are messier |
| B19 | Laz / Ubi | OOBE steps take fixed times (≈ 53 s); Ubi resolves merchants from a table | |
| B20 | Scheduled clone | Mirrors the card files from Gort's main branch exactly, in 20 s | |
| B21 | Security agent | The NUC's security agent fills the disk at a fixed rate and restores itself after tampering | |
| B22 | Ollama | Answers are templated from the receipt's numbers; a "misread" is a seeded scenario, not model behaviour | A real model can be wrong in any way |
| B23 | Reviewers | Scripted: {{jared}} checks coordinates to ±0.5 mm, {{morgan}} checks the listed code rules, {{tate}} never merges; each reacts 20 s after a PR opens | Real people |
| B24 | Jenkins | Fixed stage durations, 8 executors, no agents or plugins beyond what is described | Real Jenkins |
| B25 | adb | A subset of commands; one ADB server on your workstation; each device's ADB listens on exactly one TCP port | The full tool |
| B26 | Device staging | Scenario set-up can drive a device to a screen instantly | |
| B27 | Randomness | Seeded, so the same seed and inputs replay identically | |
| B28 | Named runs | A named run does not re-check tethering before the tests; the test's own guard reports it | |

## Game layer that does not exist in the real lab

The ticket queue, score, combo, **Diagnosis Call**, Arcade hint tiers, the Fault Injector, achievements and the robot quip overlay on the tablets are game UI. Strict ("Real Lab") realism turns off markers, quips and Force health check so the tablets and apps look exactly like the real ones.

> **Tip:** Anything with an **Illustrative (sim only)** badge — IP addresses, REST paths, job names, merchant names, millimetre values — is invented. The rules and behaviours around them are real. See [[illustrative-details]].
`,
  },
  {
    id: "illustrative-details",
    title: "Illustrative (Sim-Only) Details",
    category: "About the Sim",
    summary: "The complete list of names, numbers and strings LabSim invents because the reference is silent — useful to know so you never quote a sim IP or job name as fact in the real lab.",
    factIds: ["F026", "F199", "F115", "F233"],
    tags: ["lab.orientation"],
    related: ["how-the-sim-differs", "infrastructure-overview", "terminal-cheatsheet"],
    keywords: ["illustrative", "sim only", "dagger", "invented", "ip address", "host map", "job names", "merchants", "card profiles", "S01", "S20"],
    body: `## The rule

Where the reference is silent, LabSim invents plausible details and marks them **†** (the "Illustrative (sim only)" badge). They never contradict the reference. Quiz items that depend on them (Q128, Q137, Q220) are excluded from certification exams.

## Everything invented

| Id | Detail |
|---|---|
| S01 | Orca's pool has **42** rigs (the reference says "40+" {F115}); 12 are modelled in 3D. \`Gort\` is a repo, not a rig |
| S02 | The host map: GPU blade \`10.42.1.5\`, Orca \`orca.lab.local\` → \`10.42.1.10:8080\` (MySQL schema \`orca\`, port 3306), Jenkins \`10.42.1.11:8080\`, Ollama \`10.42.1.12:11434\` (model \`llava\`), Robot Pis \`10.42.10.<n>\` (REST \`:8000\`, camera \`:8081/stream.mjpg\`), Callus boxes \`10.42.20.<n>:9000\`, LabSim devices \`10.42.30.<n>\`, your workstation \`10.42.50.17\`, coworker desk devices \`10.42.60.<n>\` |
| S03 | The exact Device Type enum strings (\`FLEX_3\`, \`MINI_3\`, \`STATION_DUO\`, …) and the shared profile name \`FLEX_GEN3\` |
| S04 | The uia-remote author's name, {{morgan}} |
| S05 | The rig roster: which device sits in which rig, IPs and starting statuses |
| S06 | REST paths: \`GET /health\` on the Pi, Orca \`POST /api/xy_touch\`, \`POST /api/card/{swipe,dip,tap}\`, Pi paths \`/adb\`, \`/dip\`, \`/tap\`, \`/swipe\` |
| S07 | Jenkins job names, parameters \`ROBOT_NAME\`, \`DEVICE_TYPE\`, \`MERCHANT\`, \`CARD_PROFILE\` and env keys \`RUN_TYPE\`, \`PORT_NUMBER\`, \`THEME\`, \`KERNEL_TYPE\`, \`APP_ID\`, \`APP_SECRET\`, \`API_KEY\` |
| S08 | Card profile names, the test Visa Track Data, Gort paths \`cards/emv/*.json\` and \`cards/nfc/*.json\`, the scheduled task \`GortCardSync\`, \`C:\\gort\\cards\\…\` |
| S09 | Merchant names (\`AUTO-US-NOPIN-01/02\`, \`GO-SDK-US-01\`, \`PAYCORE-STANDALONE-01\`, \`WESTERS-CA-01\`) and their keys |
| S10 | Screen names (\`TENDER_CASH_DISCOUNT\`, \`PIN_ENTRY\`, \`RECEIPT_OPTIONS_4\`, \`RECEIPT_OPTIONS_5\`), every millimetre value, and the 3.0 mm QR shift |
| S11 | Tax Item 5 = $10.00 at 8.25 % → tax $0.83, total $10.83 |
| S12 | The config keys \`unlockPasscode\`, \`backendEnv\`, \`robotName\` and \`SIM-…\` serials |
| S13 | Tablet texts "TEST IN PROGRESS — CONTROLS LOCKED" and "Status: LOCK RELEASED — PARK REQUIRED"; Park XY / X / Y leaving the banner yellow |
| S14 | The Pi service name \`robot-controller\`, the Wine binary path, disk figures, the prompt \`pi@wall-e:~ $\` |
| S15 | The Ollama prompt/response and the receipt numbers |
| S16 | GitHub org \`labsim-lab\` and the folder names inside Gort and Pigeon |
| S17 | What the tablet's **Phone** group does (a phone carriage and power-button pusher for mobile-runner tests) — the photo shows the buttons, not their purpose |
| S18 | The Lab Safety Card wording |
| S19 | *How* port 5555 reached a coworker's device (connect refused → the runner falls back to the first device the ADB server already knows). The reference only says 5555 caused collisions where scripts controlled coworkers' desk devices |
| S20 | The seeded lesson faults (Rack B fuse, EVE Pi unplug, the JONNY-5 typo, BUMBLEBEE's Offset Y 1.5, OPTIMUS empty MFD/CFD, missing API Key, Pigeon missing comma, MINI_3 receipt coordinates, \`DEVICE_TYPE=flex_3\`) |

## Also invented (simulation, gameplay and world designs)

| Group | Invented details |
|---|---|
| Network | Every IP and hostname, ports other than ADB 5444 / 5555, the lab switch, latencies |
| REST | Pi endpoints (\`/health\`, \`/adb\`, \`/dip\`, \`/tap\`, \`/swipe\` …), Callus endpoints, Orca paths such as \`/api/xy_touch\` and \`/api/card/*\`, every status code and JSON body |
| Strings | Orca Notes formats, health-log lines, console lines, error messages, tablet texts beyond the photo, toasts |
| Hardware | Screen sizes and button coordinates, the 3.0 mm QR shift, travel limits and speeds, fuse ratings and labels, regulator topology, the SmartStripe Probe's role, the look of a Station 2 |
| Orca behaviour | Orca restoring a Connection Failed robot by itself at the next 200 ping (the reference describes only how Connection Failed is set); a checkout marking a robot "in use" without changing its status; queued builds waiting for a matching Available robot |
| Orca data | The 42-rig roster beyond the reference's examples, environments, device rows and serials, merchants and their fields, capability keys, Screen Compare rows, test card numbers and Track Data, the Interac test PIN |
| Software | Job names and parameters, pipeline script lines, stage names, page-object class names beyond the reference's examples, test names, commits and PR numbers, Pigeon field spellings, LSTR error texts, Go SDK messages, Laz/Ubi console lines, Ollama prompts and answers, Wine paths |
| People & time | {{riley}}, {{sam}} and {{alex}}; LabChat and \`LAB-####\` tickets; review and reply delays; the in-game calendar |

## What is NOT illustrative

Port **5444** for lab ADB {F026}, 5555 as the ADB default {F199}, \`Brainbox v6\` on the tablet {F233}, the five statuses, the 5-minute health check, the power voltages and every other fact in the Field Manual's Key Facts lists come from the reference or the reference photos.
`,
  },
]);
