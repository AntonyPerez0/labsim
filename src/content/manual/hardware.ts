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
    summary: "Every LabSim target device the lab tests — Station, Mini, Flex and Compact — plus the shortcuts that matter day to day: the shared Flex 3/4/Pocket profile, the printerless Pocket and Duo 2, and the Mini 3 hot-swap.",
    factIds: ["F055", "F056", "F057", "F058", "F059", "F060", "F061", "F062", "F054"],
    tags: ["devices", "hw.devices"],
    related: ["mfd-cfd-tethered", "orca-robot-device", "adb-vs-physical-bots", "station-duo-dual-screen"],
    keywords: ["Station 2018", "Station 2", "Station Duo", "Duo 2", "Duo 3", "Mini 2", "Mini 3", "Mini 4", "Flex 1", "Flex 2", "Flex 3", "Flex 4", "Flex Pocket", "Compact", "printer", "profile", "hot-swap"],
    practice: ["INC44", "INC23", "DR18"],
    body: `## The four families

| Family | Models in the lab | Notes |
|---|---|---|
| **Station** | Station 2018, Station 2, Station Duo (Duo 1, Duo 2, upcoming Duo 3) {F055} | Countertop terminals. The Station Duo is one terminal driving two displays (MFD + CFD) — see [[station-duo-dual-screen]]. The Duo 2 is printerless |
| **Mini** | Mini 2, Mini 3, upcoming Mini 4 {F056} | Compact countertop terminals. The Mini 3 is the hot-swap equivalent for the printerless Station Duo 2 {F057} |
| **Flex** | Flex 1, Flex 2, Flex 3, Flex 4, Flex Pocket {F058} | Handhelds. Flex 3, Flex 4 and Flex Pocket share exactly the same testing profile {F059}; the Pocket omits the physical printer block {F060} |
| **Compact** | LabSim Compact | The target terminal for the Canadian market, used on the Westers test beds {F061} |

The **Station Duo 3** and **Mini 4** are upcoming devices {F062} — you will see them as sealed boxes in the device library.

## Shortcuts that save hours

- **One profile for three Flexes.** A test that passes on the Flex 3 profile covers the Flex 4 and Flex Pocket too, because they share the same testing profile {F059}. In the sim that shared profile is called \`FLEX_GEN3\`†.
- **…but the Pocket has no printer.** Anything that prints (receipt tests, "select print") must not land on a Flex Pocket {F060}. That is what the \`printer\` capability is for ([[orca-capabilities]]).
- **Mini 3 for a dead Duo 2.** When a printerless Station Duo 2 is down, a Mini 3 is hot-swapped in its place {F057}.
- **Canada means Compact.** Canadian payment flows need physical PIN entry, so they run on Compact touch robots on the Westers beds {F061} ([[adb-vs-physical-bots]]).

## MFD and CFD

**MFD** = Merchant Facing Device, **CFD** = Customer Facing Device {F054}. Some setups use two physical devices (a Station 2 tethered to a Mini 2); the Station Duo has both screens on one terminal. See [[mfd-cfd-tethered]].

## How devices appear in software

| Where | Looks like |
|---|---|
| Orca Device Type (enum, ALL CAPS) | \`STATION_2018\`, \`STATION_2\`, \`STATION_DUO\`, \`STATION_DUO_2\`, \`STATION_DUO_3\`, \`MINI_2\`, \`MINI_3\`, \`MINI_4\`, \`FLEX_1\` … \`FLEX_4\`, \`FLEX_POCKET\`, \`COMPACT\`† |
| Jenkins \`DEVICE_TYPE\` parameter | The same enum string, exactly — \`FLEX_3\`, never \`flex_3\` |
| uia-remote \`config.properties\` \`deviceType\` | The family only: \`Mini\`, \`Flex\` or \`Station\` |

> **Illustrative (sim only):** The exact enum spellings are the sim's†; the rule that Device Type is an enum and Jenkins values must be ALL CAPS is from the reference.
`,
  },
  {
    id: "mfd-cfd-tethered",
    title: "MFD, CFD & the Tethered Test Beds",
    category: "Hardware",
    summary: "Merchant Facing vs Customer Facing devices, how tethered pairs are wired and labelled (MEGATRON DEV1, OPTIMUS STG), and the Semi Team apps that link the two screens.",
    factIds: ["F054", "F237", "F238", "F239", "F052", "F053", "F126", "F127", "F128"],
    tags: ["devices", "hw.devices", "orca.tethered", "semi.paydisplay"],
    related: ["device-families", "orca-urls-tethering-offsets", "tax-test", "config-properties"],
    keywords: ["MEGATRON", "OPTIMUS", "DEV1", "STG", "SmartStripe Probe", "connectivity hub", "USB Pay Display", "Secure Network Pay Display", "tethered", "nested"],
    practice: ["INC45", "INC46", "INC47"],
    image: "tethered-megatron-optimus-rack.jpg",
    body: `## Two faces of a sale

- **MFD — Merchant Facing Device**: the merchant's screen. Register runs here; items are added, Pay and Charge are pressed.
- **CFD — Customer Facing Device**: the customer's screen. Totals, tip and payment prompts appear here {F054}.

A **tethered** setup pairs two devices, for example a Station 2 tethered to a Mini 2, or nested Mini 3 rigs {F127}. The **Station Duo** is the odd one out: a single terminal with both displays.

## The tethered bench (reference photo)

- Screens are labelled with **rig · role · environment**: \`MEGATRON MFD DEV1\`, \`MEGATRON CFD DEV1\`, \`OPTIMUS MFD STG\`, \`OPTIMUS CFD STG\` {F237}.
- Black USB **"SmartStripe Probe"** dongles with green LEDs sit between the screens {F238}.
- Below the screens, black 3D-printed docks hold white **LabSim connectivity hubs** (Ethernet, USB, power), labelled per device, e.g. \`MEGATRON MFD\` {F239}.
- A Raspberry Pi in a black case sits between the docks — one controller per shelf.

## How the two screens talk

The **USB Pay Display** and **Secure Network Pay Display** apps, maintained by the Semi Team, link MFDs and CFDs over USB or the local network {F052} {F053}.

## How Orca and the tests know a rig is tethered

- Orca's **USB Tethered Device Configuration** populates MFD and CFD relations for nested setups {F126}.
- **If the MFD field is populated, the pipeline treats the rig as tethered** {F128}. An empty MFD field makes a tethered rig run as standalone — see [[orca-urls-tethering-offsets]].
- Running locally, uia-remote's \`config.properties\` needs \`runType=tethered\`, \`merchantFacingDeviceIp\` and \`customerFacingDeviceIp\` — see [[config-properties]].

> **Illustrative (sim only):** MEGATRON's devices (Station 2 MFD + Mini 2 CFD) and OPTIMUS's nested Mini 3s are the sim's roster†; the labels and hardware are as in the reference photo.
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
    factIds: ["F072", "F073", "F083", "F084", "F090", "F091", "F092", "F093", "F079", "F080", "F081", "F082", "F088", "F089", "F240", "F242"],
    tags: ["robots.mechanics", "hw.print3d", "hw.rigbom"],
    related: ["touch-robot-anatomy", "lab-tour", "status-tablet"],
    keywords: ["Prusa", "Bambu Lab", "CAD", "PLA", "fixtures", "cradle", "bolts", "2.5mm", "5mm", "solder", "wiring", "rails", "10 ft", "130 ft", "300", "200", "PCB", "Hong Kong", "BOM"],
    practice: ["INC59"],
    image: "touch-robot-side-gantry.jpg",
    body: `## Printed fixtures

All the black plastic modular shelf fixtures — cradles, panels, docks — are printed on the lab's **Prusa and Bambu Lab** 3D printers {F072}, drafted in CAD using simple geometric shapes {F073}. A Flex sits in an angled black 3D-printed cradle {F242}; a cracked cradle tilts the device and makes taps drift.

## The numbers per touch robot

| Item | Amount |
|---|---|
| Aluminium rails | 10 ft, cut to size {F090} |
| Wiring | about 130 ft {F091} |
| Manual solder points | about 300 {F092} |
| Nuts and bolts | 200+, in 2.5 mm and 5 mm diameters {F093} |
| Motor-controller boards | custom **25-pin** PCBs {F083}, printed in **Hong Kong** {F084} |

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
- The 3D print corner: Prusa and Bambu Lab printers and a CAD screen.
- Inside any touch-robot bay: the gantry, the motor board and the wiring loom ([[touch-robot-anatomy]]).
`,
  },
]);
