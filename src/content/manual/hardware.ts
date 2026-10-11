/**
 * Field Manual articles — hardware. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const HARDWARE_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "device-families",
    title: "LabSim Device Families",
    category: "Hardware",
    summary: "Every LabSim target device the lab tests — Stand, Micro, Flux and Compass — plus the shortcuts that matter day to day: the shared Flux 3/4/Pocket profile, the printerless Pocket and Duet 2, and the Micro 3 hot-swap.",
    factIds: ["F055", "F056", "F057", "F058", "F059", "F060", "F061", "F062", "F054", "F258", "F254"],
    tags: ["devices", "hw.devices"],
    related: ["mfd-cfd-tethered", "orca-robot-device", "adb-vs-physical-bots", "stand-duet-dual-screen"],
    keywords: ["Stand 2018", "Stand 2", "Stand Duet", "Duet 2", "Duet 3", "Micro 2", "Micro 3", "Micro 4", "Flux 1", "Flux 2", "Flux 3", "Flux 4", "Flux Pocket", "Compass", "printer", "profile", "hot-swap"],
    practice: ["INC44", "INC23", "DR18"],
    body: `## The four families

| Family | Models in the lab | Notes |
|---|---|---|
| **Stand** | Stand 2018, Stand 2, Stand Duet (Duet 1, Duet 2, upcoming Duet 3) {F055} | Countertop terminals. The Stand Duet is one terminal driving two displays (MFD + CFD) — see [[stand-duet-dual-screen]]. The Duet 2 is printerless |
| **Micro** | Micro 2, Micro 3, upcoming Micro 4 {F056} | Compass countertop terminals. The Micro 3 is the hot-swap equivalent for the printerless Stand Duet 2 {F057} |
| **Flux** | Flux 1, Flux 2, Flux 3, Flux 4, Flux Pocket {F058} | Handhelds. Flux 3, Flux 4 and Flux Pocket share exactly the same testing profile {F059}; the Pocket omits the physical printer block {F060} |
| **Compass** | LabSim Compass | The target terminal for the Canadian market, used on the Westers test beds {F061} |

The **Stand Duet 3** and **Micro 4** are upcoming devices on the roadmap, and their release timing is uncertain {F062}. You will see them as sealed boxes in the device library.

## Shortcuts that save hours

- **One profile for three Fluxes.** A test that passes on the Flux 3 profile covers the Flux 4 and Flux Pocket too, because they share the same testing profile {F059}. In the sim that shared profile is called \`FLUX_GEN3\`†.
- **…but the Pocket has no printer.** Anything that prints (receipt tests, "select print") must not land on a Flux Pocket {F060}. That is what the \`printer\` capability is for ([[orca-capabilities]]).
- **Micro 3 for a dead Duet 2.** The Duet 2 has no receipt printer, and printer mechanics are outside these testing profiles, so a functionally equivalent Micro 3 sits ready as its hot-swap {F057}.
- **Modular shelves make swaps quick.** A failed Duet 2 can be swapped for a Flux 3 in minutes rather than days {F258}.
- **Canada means Compass.** Canadian payment flows need physical PIN entry, so they run on Compass touch robots on the Westers beds {F061} ([[adb-vs-physical-bots]]). A new engineer's first assignment is the Compass test workflow in UI Automator {F254}.

## MFD and CFD

**MFD** = Merchant Facing Device, **CFD** = Customer Facing Device {F054}. Some setups use two physical devices (a Stand 2 tethered to a Micro 2); the Stand Duet has both screens on one terminal. See [[mfd-cfd-tethered]].

## How devices appear in software

| Where | Looks like |
|---|---|
| Orca Device Type (enum, ALL CAPS) | \`STAND_2018\`, \`STAND_2\`, \`STAND_DUET\`, \`STAND_DUET_2\`, \`STAND_DUET_3\`, \`MICRO_2\`, \`MICRO_3\`, \`MICRO_4\`, \`FLUX_1\` … \`FLUX_4\`, \`FLUX_POCKET\`, \`COMPASS\`† |
| Jenkins \`DEVICE_TYPE\` parameter | The same enum string, exactly — \`FLUX_3\`, never \`flux_3\` |
| uia-remote \`config.properties\` \`deviceType\` | The family only: \`Micro\`, \`Flux\` or \`Stand\` |

> **Illustrative (sim only):** The exact enum spellings are the sim's†; the rule that Device Type is an enum and Jenkins values must be ALL CAPS is from the reference.
`,
  },
  {
    id: "mfd-cfd-tethered",
    title: "MFD, CFD & the Tethered Test Beds",
    category: "Hardware",
    summary: "Merchant Facing vs Customer Facing devices, how tethered pairs are wired and labelled (MEGATRON DEV1, OPTIMUS STG), and the Semi Team apps that link the two screens.",
    factIds: ["F054", "F237", "F238", "F239", "F052", "F053", "F126", "F127", "F128", "F265", "F266"],
    tags: ["devices", "hw.devices", "orca.tethered", "semi.paydisplay"],
    related: ["device-families", "orca-urls-tethering-offsets", "tax-test", "config-properties"],
    keywords: ["MEGATRON", "OPTIMUS", "DEV1", "STG", "staging mirror", "code name", "webcam", "SmartStripe Probe", "connectivity hub", "USB Pay Display", "Secure Network Pay Display", "tethered", "nested"],
    practice: ["INC45", "INC46", "INC47"],
    image: "tethered-megatron-optimus-rack.jpg",
    body: `## Two faces of a sale

- **MFD — Merchant Facing Device**: the merchant's screen. Register runs here; items are added, Pay and Charge are pressed.
- **CFD — Customer Facing Device**: the customer's screen. Totals, tip and payment prompts appear here {F054}.

A **tethered** setup pairs two devices, for example a Stand 2 tethered to a Micro 2, or nested Micro 3 rigs {F127}. The **Stand Duet** is the odd one out: a single terminal with both displays.

## The tethered bench (reference photo)

- Screens are labelled with **rig · role · environment**: \`MEGATRON MFD DEV1\`, \`MEGATRON CFD DEV1\`, \`OPTIMUS MFD STG\`, \`OPTIMUS CFD STG\` {F237}.
- Black USB **"SmartStripe Probe"** dongles with green LEDs sit between the screens {F238}.
- Below the screens, black 3D-printed docks hold white **LabSim connectivity hubs** (Ethernet, USB, power), labelled per device, e.g. \`MEGATRON MFD\` {F239}.
- A Raspberry Pi in a black case sits between the docks — one controller per shelf.

## DEV1, staging mirrors and remote operation

- Rigs carry **famous-robot code names**. A **staging (STG) mirror** sits **directly beneath its DEV1 sibling**, and the team runs tests **heavily in DEV1** to catch bugs **before application cuts** {F266}.
- **Webcams** stream both the merchant-facing and customer-facing devices, and the **stacked MFD units need no physical touch**: engineers operate them remotely over ADB {F265}.

## How the two screens talk

The **USB Pay Display** and **Secure Network Pay Display** apps, maintained by the Semi Team, link MFDs and CFDs over USB or the local network {F052} {F053}.

## How Orca and the tests know a rig is tethered

- Orca's **USB Tethered Device Configuration** populates MFD and CFD relations for nested setups {F126}.
- **If the MFD field is populated, the pipeline treats the rig as tethered** {F128}. An empty MFD field makes a tethered rig run as standalone — see [[orca-urls-tethering-offsets]].
- Running locally, uia-remote's \`config.properties\` needs \`runType=tethered\`, \`merchantFacingDeviceIp\` and \`customerFacingDeviceIp\` — see [[config-properties]].

> **Illustrative (sim only):** MEGATRON's devices (Stand 2 MFD + Micro 2 CFD) and OPTIMUS's nested Micro 3s are the sim's roster†; the labels and hardware are as in the reference photo.
`,
  },
  {
    id: "robot-pi",
    title: "The Robot Pi (Raspberry Pi Controller)",
    category: "Hardware",
    summary: "The ~$50 Raspberry Pi on every shelf is the Robot Controller: it routes ADB, serves the camera stream, drives steppers and solenoids, and runs card programming under Wine — and it is what Orca pings every 5 minutes.",
    factIds: ["F063", "F064", "F065", "F019", "F020", "F021", "F099", "F086", "F123"],
    tags: ["pi.controller", "hw.pi", "cards.wine", "tools.terminal"],
    related: ["linux-and-wine", "nuc-minix-history", "orca-health-check", "power-distribution", "terminal-cheatsheet"],
    keywords: ["Raspberry Pi", "Robot Controller", "Robot Pi", "health endpoint", "robot-controller", "ssh", "5V 10A", "controller"],
    practice: ["INC01", "INC04", "INC56", "DR17"],
    body: `## What it is

A Raspberry Pi — a cheap unit of about **$50** {F063} — operates as the **Robot Pi / Robot Controller** on each shelf {F064}. It runs **Linux**, which isolates the hardware control loops from the corporate Windows machines {F019} {F020}.

## What it does

The Robot Pi handles {F065}:

- **ADB routing** — Orca's Robot ADB Service URL routes to the Pi controller {F123}.
- **Camera streams** from the rig webcams.
- **Stepper motors** (moving the gantry) and **solenoids** (tapping).
- **Wine card-programming emulation** — Windows-only card-programming software layers, running under Wine {F021}.

It is powered from the **5V DC, 10A** step-down line {F086}.

## Why it matters to you

Every 5 minutes Orca's synchronized background thread pings the Robot Controller on every Pi {F099}. If the ping drops or returns anything but HTTP 200, the robot goes **Connection Failed** ([[orca-health-check]]).

## Checking a Pi yourself

\`\`\`bash
ssh pi@10.42.10.11                 # WALL-E's Pi†
uname -a                           # → Linux wall-e …
systemctl status robot-controller  # → active (running)†
df -h /                            # disk use
ps aux | grep -i wine              # the card-programming software under Wine
curl -i http://10.42.10.11:8000/health   # → HTTP/1.1 200 OK†
\`\`\`

> **Illustrative (sim only):** The IP addresses, the service name \`robot-controller\`, port 8000 and the \`/health\` path are the sim's†. The idea — a controller service on the Pi that Orca pings for a 200 — is the reference's.

## LED reading guide†

| PWR (red) | ACT (green) | Meaning |
|---|---|---|
| off | off | No power: check MAIN, the fuse, the lead, the 5V regulator ([[ts-power]]) |
| on | flickering | Booting or running normally |
| on | solid, no flicker | Hung — power-cycle it, then wait for the next health check |
`,
  },
  {
    id: "linux-and-wine",
    title: "Linux & Wine on the Pi",
    category: "Hardware",
    summary: "Why the Robot Pis run Linux instead of Windows, and how Wine lets them run the Windows-only card-programming software anyway.",
    factIds: ["F019", "F020", "F021", "F065", "F068"],
    tags: ["pi.controller", "hw.pi", "cards.wine"],
    related: ["robot-pi", "nuc-minix-history", "callus"],
    keywords: ["Linux", "Wine", "compatibility layer", "card programming", "Windows-only", "isolation"],
    practice: ["INC56"],
    body: `## Linux: isolation by design

Linux is the lightweight operating system on the lab's Raspberry Pi controllers {F019}. Running Linux **isolates the hardware control loops from the corporate Windows machines** {F020} — the same corporate machines whose security tooling once filled the NUCs' disks ([[nuc-minix-history]]). Hardware control moved onto these Pis for exactly that reason {F068}.

## Wine: Windows software without Windows

Some card-programming software only exists for Windows. **Wine** is a compatibility layer that runs on the Pi's Linux and emulates the Windows-only card-programming software layers {F021}, so the Pi can still do its card-programming job {F065}.

| Question | Answer |
|---|---|
| Does the Pi run Windows? | No — Linux, with Wine for Windows-only software |
| Does Callus run under Wine on the Pi? | No — Callus runs on the Windows/Minix boxes ([[callus]]) |
| What breaks if Wine breaks? | Card programming on that Pi; taps and ADB keep working |

## Spotting it

\`\`\`bash
ps aux | grep -i wine
# pi  812  ... wine C:\\CardProg\\CardProgrammer.exe†
\`\`\`

> **Illustrative (sim only):** The process path \`C:\\CardProg\\CardProgrammer.exe\` is invented†.
`,
  },
  {
    id: "nuc-minix-history",
    title: "Windows NUC & Minix Boxes (and the Disk Problem)",
    category: "Hardware",
    summary: "The lab's local Windows execution machines, why aggressive security monitoring pushed hardware control off the NUCs onto Raspberry Pis, and what still runs on the Windows boxes today.",
    factIds: ["F066", "F067", "F068", "F049", "F085"],
    tags: ["pi.controller", "hw.nuc"],
    related: ["robot-pi", "linux-and-wine", "callus", "power-distribution"],
    keywords: ["Intel NUC", "ASUS NUC", "Minix", "corporate", "security monitoring", "disk full", "Windows", "history", "migration"],
    practice: ["INC19", "INC02"],
    body: `## What they are

**Intel NUC** (listed in the reference as ASUS NUC) and **Minix** boxes are the lab's local **Windows** execution machines {F066}. They are powered from the 12V DC step-down line {F085}.

## The history

1. Hardware control originally ran on the Windows Intel NUCs.
2. Aggressive **corporate security-monitoring packages exhausted the NUCs' disk space** {F067}.
3. So physical hardware control was **migrated off the NUCs onto Raspberry Pis** running Linux {F068} ([[robot-pi]]).

> **Warning:** The fix was to move control, not to remove the security tooling. Never uninstall or disable corporate security monitoring to free disk space.

## What still runs on Windows boxes

**Callus** — the card-emulation microservice that drives the Collis probes — runs on the local Windows/Minix boxes {F049} ([[callus]]). A Minix box running Callus going offline is a typical cause of Connection Failed ([[ts-connection-failed]]).

## Quick comparison

| | Raspberry Pi | Intel NUC / Minix |
|---|---|---|
| OS | Linux | Windows |
| Power | 5V DC, 10A | 12V DC (NUC) |
| Job today | Robot Controller: ADB, camera, steppers, solenoids, Wine | Callus service; no hardware control on the NUCs |
`,
  },
  {
    id: "fabrication-and-bom",
    title: "Fabrication, 3D Printing & the Rig Bill of Materials",
    category: "Hardware",
    summary: "How a touch robot is built — printed fixtures, cut rails, wiring, solder points, bolts and the custom motor boards — with the numbers you will be asked about.",
    factIds: ["F072", "F073", "F083", "F084", "F090", "F091", "F092", "F093", "F079", "F080", "F081", "F082", "F088", "F089", "F240", "F242", "F257", "F258"],
    tags: ["robots.mechanics", "hw.print3d", "hw.rigbom", "hw.devices"],
    related: ["touch-robot-anatomy", "lab-tour", "status-tablet"],
    keywords: ["Prusa", "Bambu Lab", "CAD", "PLA", "fixtures", "cradle", "bolts", "2.5mm", "5mm", "solder", "wiring", "rails", "10 ft", "130 ft", "300", "200", "PCB", "Hong Kong", "BOM", "modular shelves", "particle board", "CNC", "redesign", "two dozen"],
    practice: ["INC59"],
    image: "touch-robot-side-gantry.jpg",
    body: `## Printed fixtures

All the black plastic modular shelf fixtures — cradles, panels, docks — are 3D-printed in-house: on **Prusa** printers in this lab, while the team's other lab uses **Bambu Lab** printers {F072}. They are drafted in CAD using simple geometric shapes (rectangles and circles) {F073}. A Flux sits in an angled black 3D-printed cradle {F242}; a cracked cradle tilts the device and makes taps drift.

## Modular shelves

About three years ago the lab was redesigned around **standardised modular shelves**; before that, fixtures were raw CNC-cut particle board on open racks and every rig was different {F257}. Now a failed **Duet 2 can be swapped for a Flux 3 in minutes rather than days** {F258}.

## The numbers per touch robot

| Item | Amount |
|---|---|
| Aluminium rails | 10 ft, cut to size {F090} |
| Wiring | about 130 ft {F091} |
| Manual solder points | about 300 {F092} |
| Nuts and bolts | 200+, in 2.5 mm and 5 mm diameters {F093} |
| Motor-controller boards | custom **25-pin** PCBs {F083}, printed in **Hong Kong**; the first run of two dozen boards is used up and a new batch is planned {F084} |

## The component list

- **Sub-millimetre stepper motors** {F079} — NEMA-17 steppers with GT2 pulleys on 2020 aluminium extrusion, V-slot wheels {F240}.
- **Remote-firing solenoids** — the plunger drops to tap the screen {F080}.
- **Magnetic locks** holding the arms {F081}.
- **Physical limit switches** calibrated to (0,0) {F082}.
- **DC step-down regulators** (12V for NUCs, 5V 10A for Pis) and **inline fuses** ([[power-distribution]]).
- **Webcams** for camera streams and OCR screenshots {F088}.
- **Front-mounted status tablets** {F089}.

## Where you'll see it

- {{jared}}'s bench: bolt bins (2.5 mm and 5 mm) and the soldering station.
- The 3D print corner: the Prusa printer, a CAD screen and (sim only) a Bambu Lab printer†.
- Inside any touch-robot bay: the gantry, the motor board and the wiring loom ([[touch-robot-anatomy]]).
`,
  },
]);
