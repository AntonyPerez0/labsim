/**
 * Field Manual articles — robots. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const ROBOTS_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "touch-robot-anatomy",
    title: "Touch Robot Anatomy",
    category: "Robots",
    summary: "A touch robot is a 3D-printer-style gantry that taps instead of prints. Learn every part — rails, steppers, solenoid, dip arm, limit switches, magnetic lock, webcam — and the tap cycle.",
    factIds: ["F079", "F080", "F081", "F082", "F083", "F088", "F240", "F241", "F242", "F243", "F089"],
    tags: ["robots.mechanics", "hw.rigbom", "hw.motion"],
    related: ["status-tablet", "maglock-and-park-all", "fabrication-and-bom", "orca-screens-xytouch", "collis-probes"],
    keywords: ["gantry", "NEMA-17", "GT2", "2020 extrusion", "V-slot", "carriage", "solenoid", "plunger", "dip arm", "sector gear", "63", "ribbon card", "limit switch", "webcam", "cradle"],
    practice: ["INC13", "INC15", "INC16", "INC59"],
    image: "touch-robot-side-gantry.jpg",
    body: `## The gantry

The reference photos show an XY gantry built like a 3D printer's {F240}:

- **2020 aluminium extrusion** rails with **V-slot wheels**.
- A **NEMA-17 stepper motor** with a **GT2 pulley** on each axis. The rigs use sub-millimetre stepper motors {F079}.
- A **carriage** carrying a **blue push-pull solenoid** pointed down at the screen.
- **Physical limit switches** at the origin, calibrated to (0,0) {F082}. In the sim, Screen Locations are measured from that same zero point (the screen's top-left)†.
- A **magnetic lock** holding each arm {F081}.
- Custom **25-pin motor-controller PCBs** {F083}.

## Tapping

The solenoid is remote-firing: its **plunger drops** onto the screen to tap {F080}. The tap cycle seen in the Flex 3 video {F243}:

1. The gantry moves the head over the target button.
2. The plunger drops and taps.
3. The plunger lifts.
4. The gantry moves to the next button.
5. The plunger drops and taps again.

## Card mechanics

- A black **rotating dip arm** (sector gear marked \`63\`) carries a flat white ribbon card — the Collis probe's card insert — into the device's chip slot {F241} ([[collis-probes]]).
- A tap paddle† presents the card to the NFC area for contactless taps (the **Tap** In / Out buttons).

## Around the device

- The device (a Flex in the photo) sits in an **angled black 3D-printed cradle**, with the grey **UL Transaction Security (Collis)** probe box on the shelf beside it {F242}.
- A **webcam** watches the screen — the source of camera streams and OCR screenshots {F088}.
- A **front-mounted status tablet** shows the robot's dashboard {F089} ([[status-tablet]]).

## What goes wrong mechanically

| Symptom | Likely part |
|---|---|
| Banner yellow, arm off to one side | Arm pushed by hand → magnetic lock released ([[maglock-and-park-all]]) |
| Arm won't move at all | MOTOR toggle off or Steppers disabled |
| Arm moves but nothing is tapped | Solenoid connector or solenoid |
| Chip read errors | Dip arm misaligned |
| Taps drift further off the further right they go | Cracked or tilted cradle |
| Taps consistently a few mm off | Coordinates or a legacy Offset, not mechanics ([[ts-taps-missing]]) |
`,
  },
  {
    id: "status-tablet",
    title: "The Status Tablet",
    category: "Robots",
    summary: "The front-mounted tablet is the robot's face: header from Orca, three tabs, and the Motion Control button groups you will use to drive and recover the rig.",
    factIds: ["F089", "F118", "F233", "F234", "F235", "F230", "F236", "F245"],
    tags: ["robots.mechanics", "hw.tablet", "hw.lockout", "orca.names"],
    related: ["maglock-and-park-all", "touch-robot-anatomy", "orca-robot-device", "lab-tour"],
    keywords: ["tablet", "Brainbox v6", "Status OK", "Robot", "Robot Control", "Motion Control", "Steppers", "Park", "Dip", "Tap", "Phone", "Solenoid", "lockout", "Human Readable Name"],
    practice: ["INC11", "INC12", "INC63", "DR16"],
    image: "walle-status-tablet-front.jpg",
    body: `## The header

Every touch robot has a front-mounted status tablet {F089}. The header shows {F233}:

- The robot's **Human Readable Name** (e.g. \`WALL-E\`) — pushed from Orca, not typed into the tablet {F118}.
- The LabSim logo.
- \`Status: OK\`.
- \`Brainbox v6\`.

If the name on the tablet is misspelt, fix the robot's **Human Readable Name** in Orca — never its Name ([[orca-robot-device]]).

## The tabs

Three tabs: **Robot**, **Robot Control** and **Motion Control** {F234}.

## Motion Control button groups

| Group | Buttons | What they do |
|---|---|---|
| **Steppers** | Enable / Disable | Energise or release the stepper motors |
| **Park** | Park All / XY / X / Y | Home axes to the limit switches. **Park All** is the recovery command |
| **Dip** | In / Out | Swing the dip arm's card into / out of the chip slot |
| **Tap** | In / Out | Move the tap paddle to / from the NFC area |
| **Phone** | Forward / Back / Push Power Button | Phone carriage and power-button pusher† |
| **Solenoid** | Down / Up / Lower / Raise | Fire or lift the plunger; Lower/Raise are the slow variants† |

Groups and buttons are exactly as in the reference photo {F235}.

> **Illustrative (sim only):** What the Phone group drives, and Lower/Raise being a slow stroke, are the sim's interpretation†; the photo shows the buttons but not their purpose.

## Lockout

While a test is active, the global LabSim control dashboard **locks out external users** {F230}. The sim shows an overlay "TEST IN PROGRESS — CONTROLS LOCKED"†. That is not a frozen tablet: wait for the job to finish.

## Around the tablet

- Left: the **POWER** panel with two green LEDs and toggles \`MAIN\` and \`MOTOR\` {F236}.
- Right (on WALL-E): a panel lettered **SETI** with USB ports for the Minix box / Raspberry Pi {F245}.
`,
  },
  {
    id: "maglock-and-park-all",
    title: "Magnetic Lock, Yellow Banner & Park All",
    category: "Robots",
    summary: "Push an arm by hand and its magnetic lock breaks and the banner turns yellow; Park All drives the steppers back to the limit switches at (0,0), clears the error and turns the banner green.",
    factIds: ["F231", "F232", "F081", "F082", "F235", "F130"],
    tags: ["robots.mechanics", "hw.motion"],
    related: ["status-tablet", "touch-robot-anatomy", "orca-urls-tethering-offsets"],
    keywords: ["Park All", "yellow", "green", "banner", "magnetic lock", "limit switch", "(0", "0)", "home", "recover", "LOCK RELEASED", "PARK REQUIRED"],
    practice: ["INC11", "DR16"],
    body: `## What happens

| Event | Result |
|---|---|
| Someone moves a robot arm by hand | Its **magnetic lock breaks** and the top status banner turns **yellow** {F231} |
| Engineer presses **Park → Park All** | Steppers drive back to the physical limit switches at **(0,0)**, errors clear, banner turns **green** {F232} |

Each arm is held by a magnetic lock {F081}; the limit switches define the (0,0) origin {F082}.

## Recovery, step by step

1. Walk to the rig (the tablet banner is yellow; the sim shows "Status: LOCK RELEASED — PARK REQUIRED"†).
2. Open **Motion Control** on the tablet.
3. Press **Park → Park All** {F235}.
4. Listen for the limit switches clicking; the head is at (0,0) and the banner is green.

> **Tip:** Only **Park All** clears the error in the sim; Park XY, X or Y home just those axes and leave the banner yellow†.

## Don't

- Don't press Steppers → Disable to "fix" it — that releases the motors; it does not re-home them.
- Don't add an Offset in Orca to compensate for a pushed arm. Offsets are a deprecated legacy fudge; the lab is calibrated to a true (0,0) {F130}.
- Don't push the carriage while a test is running — the dashboard is locked for a reason.
`,
  },
  {
    id: "adb-vs-physical-bots",
    title: "ADB Bots vs Physical (Interactive) Bots",
    category: "Robots",
    summary: "ADB bots are purely programmatic and can't touch a screen or enter a PIN; physical bots have mechanical touch probes and are required for Canadian PIN flows and ADB-blind displays.",
    factIds: ["F217", "F218", "F219", "F220", "F221", "F222", "F223", "F144", "F151"],
    tags: ["orca.screens", "bots.types", "bots.pin"],
    related: ["orca-screens-xytouch", "card-testing-philosophy", "station-duo-dual-screen", "device-families"],
    keywords: ["ADB bot", "physical bot", "interactive bot", "PIN", "Canada", "Interac", "Secure Touch", "Gen 2", "Core OS", "ADB-blind", "DATA", "TARS", "SETI"],
    practice: ["INC52", "INC64", "DR09"],
    body: `## Two kinds of robot

| | ADB bot | Physical / interactive bot |
|---|---|---|
| How it acts | Purely programmatic, over ADB {F217} | Mechanical touch probes {F219} |
| Can it physically touch the screen? | No {F217} | Yes |
| Can it enter a PIN? | No {F217} | Yes |
| Merchants allowed | Only merchant configs that **bypass PIN security** {F218} | Any |
| Required for | — | **Canadian payment workflows** (physical PIN entry is mandatory) {F220}; **ADB-blind displays** {F221} |

In Orca, an xy_touch on an ADB bot becomes an electronic ADB touch; on a touch robot it becomes a physical probe tap {F144} ([[orca-screens-xytouch]]).

## Choosing a robot

- **US, PIN-bypass merchant, ADB-visible screen** → an ADB bot is fine.
- **Canadian Interac with PIN** → a physical bot on a Compact (Westers bed). An ADB bot simply cannot do it.
- **Station Duo CFD** → it is blind to ADB {F151}, so legacy suites needed a physical bot or OCR ([[station-duo-dual-screen]]).

> **Warning:** Never "fix" a Canadian PIN test by switching the merchant to one that bypasses PIN. Canada mandates physical PIN entry; re-target the job to a physical bot.

## Gen 2: Software PIN Bypass

The team is partnering with the **Core OS Team** on a software framework that bypasses physical robotics for **Secure Touch PIN entry** {F222}. Under Gen 2, physical robotics are reserved exclusively for non-negotiable hardware interactions such as **card dipping** {F223}. It is roadmap work — today, PINs still need a physical bot.

> **Illustrative (sim only):** In the sim, DATA and TARS are the ADB bots and SETI is the Compact touch robot†.
`,
  },
]);
