/**
 * Field Manual articles — orca. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const ORCA_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "orca-overview",
    title: "Orca (Orchestrator): Architecture & Execution Flow",
    category: "Orchestrator",
    summary: "Orca is the on-premise Spring Boot monolith that sits between Jenkins pipelines and the physical robots. Orca is the Controller; Jenkins is the Executor. Here is the whole flow from a build to a tap.",
    factIds: ["F036", "F037", "F038", "F098", "F002", "F003", "F004", "F001", "F013", "F014", "F023", "F094", "F095", "F096", "F097", "F099", "F114"],
    tags: ["orca.status", "arch.flow", "arch.roles", "arch.stack"],
    related: ["orca-statuses", "orca-health-check", "jenkins-executor", "tech-stack", "infrastructure-overview", "orca-robot-device"],
    keywords: ["Orca", "Orchestrator", "Controller", "Executor", "Spring Boot", "JHipster", "MySQL", "monolith", "VM", "architecture", "flow", "REST", "checkout"],
    practice: ["INC60", "INC62", "DR10"],
    body: `## What Orca is

**Orca** is the team's short name for the **Orchestrator** {F036}: an **on-premise Spring Boot monolith** {F037} written in Java {F001} that acts as the central **Controller** between Jenkins pipelines and the physical lab robots {F038}. **Orchestrator is the Controller; Jenkins is the Executor** {F098}.

| Layer | Technology |
|---|---|
| Backend & REST API | Spring Boot {F002} |
| Scaffolding | JHipster — an interactive setup questionnaire that generated Orca's frontend UI, Spring Boot REST endpoints and MySQL schemas {F003} {F004} |
| Database | MySQL {F013}: hardware states, merchant profiles, screen-coordinate tables (robots, devices, screens, card profiles, merchants) {F014}; 7 core schemas as JHipster entities {F114} |
| Where it runs | A local, on-premise lab virtual machine {F023} (on the GPU server blade) |

## The execution flow

\`\`\`text
Jenkins (Executor) ──triggers pipeline, injects env vars──▶ Test runner (uia-remote / Pigeon)
      │                                                         │
      └──checkout robot──▶ Orca (Controller) ◀──REST (xy_touch, card swipe/dip/tap)──┘
                              │  MySQL (robots, devices, screens, card profiles, merchants)
                              │  5-minute health-check ping
                              ▼
                    Raspberry Pi Robot Controller (Linux, per shelf)
                      ├─ ADB service (port 5444) ──▶ LabSim device (MFD / CFD)
                      ├─ Camera stream (webcam)
                      ├─ Stepper motors / solenoid / dip / tap
                      └─ Wine card-programming emulation
                    Windows / Minix box running Callus ──ribbon cable──▶ Collis probe ──▶ card reader
\`\`\`

1. **Jenkins** triggers the pipeline and injects runtime environment variables into the test runner (uia-remote or Pigeon) {F094}.
2. Jenkins **checks out a robot** from Orca {F095}.
3. The test runner calls Orca over **REST** for \`xy_touch\` and for card swipe / dip / tap {F096}.
4. Orca instructs the robot's **Raspberry Pi** (ADB touch, physical tap, dip, tap).
5. For cards, the **Windows/Minix box running Callus** drives the **Collis probe** over a ribbon cable, and the probe feeds the LabSim device's card reader {F097}.
6. In the background, every 5 minutes Orca pings every Pi's Robot Controller {F099} ([[orca-health-check]]).

## Orca's main screens

| Page | Use it for | Article |
|---|---|---|
| Robots (with {{tate}}'s status filter) | Status, checkout state, Notes | [[orca-statuses]] |
| Robot detail | Name, Human Readable Name, Robot Device, URLs, MFD/CFD, Offsets | [[orca-robot-device]], [[orca-urls-tethering-offsets]] |
| Robot Capabilities | How tests are matched to robots | [[orca-capabilities]] |
| Merchant Config | Merchant parameters (click **Edit** to see every field) | [[orca-merchant-config]] |
| Screens / Screen Locations | Button coordinates in mm | [[orca-screens-xytouch]] |
| Card Profiles | Track Data and Gort paths | [[card-profiles]] |
| Screen Compare Images | Station Duo OCR checks | [[orca-screen-compare]] |

> **Illustrative (sim only):** Orca's address \`orca.lab.local\` → \`10.42.1.10:8080\`† and REST paths such as \`POST /api/xy_touch\`† are the sim's.
`,
  },
  {
    id: "orca-statuses",
    title: "The Five Robot Statuses",
    category: "Orchestrator",
    summary: "Available, Unavailable, Offline, Connection Failed and Reserved — what each means, who or what sets it, what it blocks, and which one to use when.",
    factIds: ["F100", "F101", "F102", "F103", "F104", "F105", "F106", "F107", "F108", "F109", "F110", "F111", "F112", "F113", "F116", "F115"],
    tags: ["orca.status", "orca.status.unavailable", "orca.status.offline", "orca.status.connfailed", "orca.status.reserved", "orca.robot"],
    related: ["orca-health-check", "ts-connection-failed", "jenkins-executor", "card-testing-philosophy"],
    keywords: ["Available", "Unavailable", "Offline", "Connection Failed", "Reserved", "status", "named job", "ROBOT_NAME", "PayCore", "auto-reset", "filter"],
    practice: ["INC05", "INC06", "INC07", "INC31", "INC40", "INC41", "INC48", "DR01"],
    body: `## Exactly five

Orca has exactly **5** robot operational statuses {F100}:

| Status | Meaning | Set by | General pipelines | Health check |
|---|---|---|---|---|
| **Available** | Online, healthy, open to general pipeline checkouts {F101} | Engineer / recovery | ✔ can check out | Pinged |
| **Unavailable** | Strictly reserved: only jobs that pass the robot's **exact unique name** can check it out {F102} | Engineer (and Orca's auto-reset) | ✘ unless named | Pinged |
| **Offline** | Manual placeholder while a rig is being physically built or data profiles assembled {F105} | Engineer | ✘ | **Skipped** {F106} |
| **Connection Failed** | The 5-minute REST ping dropped or returned non-200 {F107} | **Orca automatically** | ✘ blocked {F108} | Pinged (the sim restores it on the next 200†) |
| **Reserved** | An engineer is running tests locally from their workstation {F112} | Engineer | ✘ blocks Jenkins pipelines and health-check overrides {F113} | Not overridden |

The Robot entity tracks the whole pool of 40+ rigs and their status flags {F115}; {{tate}} built the custom filtering UI on the Robots list {F116} — use it to show only \`Available\` robots, or only \`Connection Failed\` ones.

## Unavailable, in depth

- Purpose: isolate specialised rigs — such as **PayCore standalone setups** — so general tests do not overwrite their merchant profiles {F103}.
- To use one, pass its exact unique name in the job parameters (e.g. \`ROBOT_NAME=rosie\`†) {F102}.
- When the explicitly named job finishes, **Orca automatically resets the robot back to Unavailable** {F104}. You never set it back by hand.

> **Warning:** Never set a PayCore rig to Available "to help capacity". The next general job will take it and swap its merchant.

## Connection Failed, in depth

- Triggered automatically when the 5-minute background REST ping to the Pi drops or returns a non-200 HTTP response {F107} — a 502 counts even though the Pi answered.
- Orca blocks the rig from checkouts {F108} and opens a **Notes** section logging the exact endpoint attempted and the error text {F109}.
- Typical causes: a crashed Pi board, or a Minix box running Callus services going offline {F110}.
- Escalated to **{{jared}}** for hardware intervention {F111}. See [[ts-connection-failed]].

## Choosing the right status

| Situation | Status |
|---|---|
| Healthy rig, open to any pipeline | Available |
| PayCore standalone rig; named jobs only | Unavailable |
| Rig still being physically built / profiles being assembled | Offline |
| Health ping returned non-200 or timed out | Connection Failed (Orca sets it) |
| You are testing locally from your desk | Reserved — and set it back to Available when done |

## Common mistakes

- Running locally on an **Available** rig: Jenkins can check it out under you. Reserve first.
- Forgetting to release a Reserved rig: pipelines that need it wait in the queue.
- Overriding Connection Failed to Available: it hides the fault, and the next ping flips it back anyway.
`,
  },
  {
    id: "orca-health-check",
    title: "The 5-Minute Health Check & Notes",
    category: "Orchestrator",
    summary: "How Orca's synchronized background thread pings every Pi every 5 minutes, what counts as a failure, how Notes record it, and why recovery only shows at the next ping.",
    factIds: ["F099", "F106", "F107", "F108", "F109", "F110", "F111", "F113", "F123"],
    tags: ["orca.status", "orca.healthcheck", "orca.notes", "orca.status.connfailed"],
    related: ["orca-statuses", "ts-connection-failed", "robot-pi", "how-the-sim-differs"],
    keywords: ["health check", "ping", "5 minutes", "Notes", "non-200", "timeout", "502", "Connection Failed", "recovery", "health log", "endpoint"],
    practice: ["INC01", "INC02", "INC03", "INC04", "INC05", "DR01"],
    body: `## The rule

Every **5 minutes**, Orca runs a synchronized background thread that pings the **Robot Controller on every Raspberry Pi** {F099}.

| Ping result | What Orca does |
|---|---|
| HTTP 200 | Nothing (or, if the robot was Connection Failed, the sim restores it†) |
| No response (timeout, refused) | **Connection Failed** {F107} |
| Any non-200 response (500, 502, 503…) | **Connection Failed** {F107} |
| Robot is **Offline** | Not pinged at all {F106} |
| Robot is **Reserved** | Not overridden — Reserved blocks health-check overrides {F113} |

A Connection Failed robot is blocked from checkouts {F108}.

## Notes

On failure Orca opens a **Notes** section logging the **exact endpoint attempted and the error text** {F109}. Read them before you do anything else — they tell you whether the Pi is dead (timeout) or alive but unhappy (an HTTP error from the controller).

\`\`\`log
2026-10-05 08:15:00 GET http://10.42.10.12:8000/health → connect timed out after 10000 ms
2026-10-05 08:15:00 GET http://10.42.10.13:8000/health → 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}
2026-10-05 08:20:00 GET http://10.42.10.12:8000/health → 200 OK · status restored to Available
\`\`\`

> **Illustrative (sim only):** The Note line format, the \`:8000/health\` endpoint and the error texts are the sim's†. Orca derives the Pi from the robot's Robot ADB Service URL {F123}.

## Reading the error

| Error in Notes | What it usually means |
|---|---|
| \`connect timed out\` | The Pi is unreachable: no power, hung, Ethernet unplugged |
| \`Connection refused\` | The Pi is up but its controller service is not running (still booting, or crashed) |
| \`502 … callus upstream … unreachable\` | The Pi is fine; the **Minix box running Callus** behind it is down {F110} |
| \`500 … No space left on device\` | The controller's disk is full |

All of these are hardware problems: escalate them to **{{jared}}** {F111} with the endpoint and the error.

## Recovery takes a ping

Fixing the Pi does not instantly fix Orca: recovery is only observed at the **next** health check, up to 5 minutes later — in the sim the robot flips back by itself at that ping†. "I fixed it two minutes ago and Orca still says Connection Failed" is normal — verify with \`curl\` and wait. Power-cycling again only delays it.

> **In the sim:** Academy and Free Play offer a tutorial **Force health check** button and fast-forward†; Arcade shifts run the clock at 5×, so a ping comes every 60 real seconds.
`,
  },
  {
    id: "orca-robot-device",
    title: "Robot Records: Name, Human Readable Name, Robot Device & Device Type",
    category: "Orchestrator",
    summary: "The fields that identify a robot and its hardware in Orca — and the two rules that prevent most mistakes: never edit Name, and upgrade hardware with a new Device row.",
    factIds: ["F114", "F115", "F117", "F118", "F119", "F120", "F121", "F122"],
    tags: ["orca.entities", "orca.names", "orca.device", "orca.devicetype", "jenkins.envvars"],
    related: ["orca-urls-tethering-offsets", "status-tablet", "jenkins-env-vars", "device-families", "orca-overview"],
    keywords: ["Name", "Human Readable Name", "HRN", "Robot Device", "Device entity", "Device Type", "enum", "ALL CAPS", "upgrade", "rollback", "Flex 1", "Flex 2", "typo", "JONNY-5"],
    practice: ["INC42", "INC43", "INC63", "INC39", "DR12"],
    body: `## Orca's seven core schemas

Orca has **7** core database schemas, generated as JHipster entities {F114}: **Robot**, **Robot Creation & Configuration**, **Robot Capabilities**, **Merchant Config**, **Screens & Screen Locations**, **Card Profile** and **Screen Compare Image**. The Robot entity tracks the pool of 40+ rigs and their status flags {F115}.

## Name vs Human Readable Name

| Field | What it is | Who uses it |
|---|---|---|
| **Name** | The system identifier {F117} (lower-case, e.g. \`johnny-5\`†) | Orca, pipelines, \`ROBOT_NAME\` |
| **Human Readable Name** | The display string {F117} pushed to the physical status tablet on the front of the enclosure {F118} (e.g. \`JOHNNY-5\`) | The tablet, people |

> **Warning:** A typo on the tablet is fixed in **Human Readable Name**. Never edit **Name** — pipelines and jobs that pass the exact robot name depend on it.

## Robot Device → a separate Device entity

The **Robot Device** field links the robot to a separate **Device** entity {F119}. Decoupling the target device from the robot means a hardware upgrade — e.g. swapping a Flex 1 for a Flex 2 — leaves the legacy configuration intact for quick rollbacks {F120}.

**Upgrading hardware the right way:**

1. **Devices → Create** a new Device for the new hardware (Device Type, serial, IP).
2. Open the robot and set **Robot Device** to the new device. Save.
3. **Leave the old Device row untouched.** If the new hardware misbehaves, rolling back is one dropdown.

> **Warning:** Editing the old Device row in place (changing its type to the new model) destroys the rollback.

## Device Type: an enum

**Device Type** is an enum that stores device dimensions, layout metrics and internal string definitions {F121}. Because it is an enum, the strings must match exactly — and that is why **Jenkins pipeline environment variables must be in ALL CAPS** {F122}:

\`\`\`log
DEVICE_TYPE=flex_3   → No enum constant …DeviceType.flex_3   (FAILURE)†
DEVICE_TYPE=FLEX_3   → [orca] checkout → wall-e (FLEX_3) OK†
\`\`\`

See [[jenkins-env-vars]] and [[device-families]].
`,
  },
  {
    id: "orca-urls-tethering-offsets",
    title: "URL Mappings, Tethering & Offsets",
    category: "Orchestrator",
    summary: "The per-robot URLs (ADB Service, Camera Stream, Dip, Tap, Swipe), how the MFD/CFD fields make a rig tethered, and why the legacy Offsets field should almost always be zero.",
    factIds: ["F123", "F124", "F125", "F126", "F127", "F128", "F129", "F130", "F082"],
    tags: ["orca.entities", "orca.urls", "orca.tethered", "orca.offsets", "vision.camera"],
    related: ["orca-robot-device", "mfd-cfd-tethered", "maglock-and-park-all", "ts-taps-missing"],
    keywords: ["URL Mappings", "Robot ADB Service URL", "Camera Stream URL", "Dip URL", "Tap URL", "Swipe URL", "MFD", "CFD", "tethered", "nested", "Offsets", "Offset X", "Offset Y", "calibration", "(0", "0)"],
    practice: ["INC08", "INC09", "INC14", "INC45", "INC46", "INC65"],
    body: `## URL Mappings

| Field | Points to |
|---|---|
| **Robot ADB Service URL** | Routes to the Pi controller {F123} |
| **Camera Stream URL** | The webcam stream — **dedicated per Pi, or shared across 4 rigs** {F124} |
| **Dip URL / Tap URL / Swipe URL** | The hardware-specific card-action endpoints {F125} |

Example (sim)†:

\`\`\`text
Robot ADB Service URL  http://10.42.10.15:8000/adb
Camera Stream URL      http://10.42.10.40:8081/stream.mjpg   (shared across Rack B's 4 rigs)
Dip URL                http://10.42.10.15:8000/dip
Tap URL                http://10.42.10.15:8000/tap
Swipe URL              http://10.42.10.15:8000/swipe
\`\`\`

Symptoms of a bad mapping: a blank Tap URL makes every tap test on that rig fail; a copy-pasted Camera Stream URL shows the wrong rig's screen (and breaks OCR checks); four rigs' cameras going dark together usually means their shared camera stream is down.

## USB Tethered Device Configuration (MFD / CFD)

- This configuration populates **MFD** and **CFD** relations for nested setups {F126} — for example a Station 2 tethered to a Mini 2, or nested Mini 3 rigs {F127}.
- **If the MFD field is populated, the pipeline treats the rig as tethered** {F128}.

| MFD field | Pipeline treats the rig as |
|---|---|
| Empty | Standalone (a tethered bench will run single-device tests) |
| Populated | Tethered |

## Offsets: a deprecated fudge

**Offsets** are legacy millimetre coordinate adjustments once used to compensate for imprecise physical limit switches {F129}. **{{jared}} calibrated the lab hardware to a true (0,0) origin**, which made the field mostly deprecated {F130}. The limit switches now define (0,0) exactly {F082}.

> **Tip:** On a calibrated rig, a non-zero Offset is a likely cause of taps landing consistently off-target. Set it back to 0 and fix the real cause (coordinates or hardware) instead of adding a new Offset.
`,
  },
]);
