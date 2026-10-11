/**
 * Field Manual articles — troubleshooting. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const TROUBLESHOOTING_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "ts-connection-failed",
    title: "Troubleshooting: A Robot Is Connection Failed",
    category: "Troubleshooting",
    summary: "Decision tree for Connection Failed — read the Notes, tell a dead Pi from a dead Kallus box, check power, escalate hardware to {{jaden}} with the endpoint, and wait for the next ping.",
    factIds: ["F107", "F108", "F109", "F110", "F111", "F099", "F106", "F113", "F086"],
    tags: ["orka.status", "orka.status.connfailed", "orka.healthcheck", "orka.notes", "people.roles"],
    related: ["orka-health-check", "orka-statuses", "robot-pi", "kallus", "ts-power", "who-is-who"],
    keywords: ["Connection Failed", "troubleshooting", "Notes", "timeout", "refused", "502", "Kallus", "Pi crashed", "escalate", "{{jaden}}", "decision tree"],
    practice: ["INC01", "INC02", "INC03", "INC04", "INC05", "INC06", "DR14"],
    body: `## Decision tree

1. **Open the robot in Orka and read the Notes** — the exact endpoint and error text {F109}.
2. **Is it one robot or several at the same time?**
   - Several robots on one rack, same timestamp → think **shared cause**: a rack fuse, a shared Pi, a Kallus box ([[ts-power]]).
   - One robot → its own Pi, lead, Ethernet or service.
3. **What does the error say?**
   - \`connect timed out\` → the Pi is unreachable. Go look: is its red PWR LED on?
     - **No LEDs at all** → no power: MAIN, the lead, the fuse, the 5V 10A line {F086}.
     - **PWR on, ACT solid (no flicker)**† → hung Pi: power-cycle it.
     - **LEDs fine** → Ethernet unplugged or network.
   - \`Connection refused\` → the Pi is up, the controller service isn't (booting or crashed).
   - \`502 … kallus upstream … unreachable\` → the **Minix box running Kallus** behind that Pi is down {F110}.
   - \`500 … No space left on device\` → a full disk.
4. **Escalate hardware to {{jaden}}** {F111} with robot, status, endpoint and error, e.g. "BUMBLEBEE is Connection Failed: the Pi answers 502 because the Minix box running Kallus at 10.42.20.1† is unreachable."
5. **Verify** with \`curl -i <endpoint>\` once it's fixed, then **wait for the next 5-minute ping** {F099} — the status only flips back then.

## Rules

- The robot is blocked from checkouts while Connection Failed {F108} — that is protection, not a bug.
- **Never override** Connection Failed to Available to unblock a pipeline.
- A dropped ping *or* any non-200 response triggers it {F107}.
- **Offline** rigs are never pinged {F106}; **Reserved** rigs are not overridden by health checks {F113} — a Reserved rig can hide a dead Pi from you.

> **Illustrative (sim only):** Error texts and IPs are the sim's†; the triggers, Notes and escalation path are the reference's.
`,
  },
  {
    id: "ts-taps-missing",
    title: "Troubleshooting: Taps Miss or Nothing Gets Tapped",
    category: "Troubleshooting",
    summary: "Why a robot taps the wrong place — or nowhere — and how to tell coordinates, Offsets, a released magnetic lock, a dead solenoid and a cracked cradle apart.",
    factIds: ["F213", "F214", "F216", "F129", "F130", "F231", "F232", "F142", "F211", "F242"],
    tags: ["orka.screens", "receipt.qr", "receipt.maps", "orka.offsets", "hw.motion"],
    related: ["receipt-qr-regression", "orka-screens-xytouch", "maglock-and-park-all", "orka-urls-tethering-offsets", "touch-robot-anatomy"],
    keywords: ["taps missing", "coordinates", "offset", "layout shift", "solenoid", "cradle", "yellow banner", "camera", "select print", "xy_touch"],
    practice: ["INC11", "INC13", "INC14", "INC15", "INC20", "INC21", "INC22", "INC59", "INC65"],
    body: `## First, watch the camera

The rig's camera stream tells you *how* it misses. Then use this table:

| What you see | Likely cause | Fix |
|---|---|---|
| Every tap a few mm above/below its button, on every rig with that device | The UI layout moved (firmware/feature) {F213} | Measure, new map (keep the old one if the change is conditional) {F216}, coordinate PR ([[receipt-qr-regression]]) |
| Taps consistently off by the same small amount (e.g. 1.5 mm†) on **one** rig | A leftover legacy **Offset** {F129} | Set Offsets to 0 — the lab is calibrated to true (0,0) {F130} |
| Banner yellow, head parked off to the side | Arm was moved by hand; magnetic lock released {F231} | Park All {F232} |
| Head moves, plunger never drops | Solenoid or its connector | Re-seat the connector; escalate if dead |
| Arm doesn't move at all | MOTOR off or steppers disabled | MOTOR on / Steppers Enable, then Park All |
| Taps drift more the further across the screen they go | Cracked or tilted cradle {F242} | Reprint and replace the cradle |
| Tap tests fail instantly with no movement | Blank or wrong Tap URL | Fill the robot's URL Mappings |

## Related symptoms in logs

- Parrot **"failed at select print"** after a timeout — the arm missed Print; no printer payload arrived {F211}.
- uia-relay \`UiObjectNotFoundException\` right after a tap — maybe the tap landed before the screen rendered ([[ts-uia-flaky]]).

> **Tip:** Screen Locations are millimetres from the screen's top-left {F142}. Measure from the same corner the limit switches home to.
`,
  },
  {
    id: "ts-pipeline-failures",
    title: "Troubleshooting: Jenkins Pipeline Failures",
    category: "Troubleshooting",
    summary: "The usual reasons a build fails or never starts — no Available robot, enum case, Unavailable without a name, Reserved rigs, missing merchant keys, Parrot parse errors and the misleading \"select print\".",
    factIds: ["F122", "F102", "F104", "F113", "F139", "F137", "F208", "F210", "F211", "F017", "F108", "F131"],
    tags: ["jenkins", "jenkins.envvars", "jenkins.checkout", "jenkins.logs", "parrot.nolint"],
    related: ["jenkins-executor", "jenkins-env-vars", "orka-statuses", "parrot-bottlenecks", "orka-merchant-config", "orka-capabilities"],
    keywords: ["Jenkins", "build failed", "queue", "No enum constant", "lower case", "Unavailable", "ROBOT_NAME", "Reserved", "API Key", "ParseError", "select print", "missing job"],
    practice: ["INC26", "INC39", "INC40", "INC41", "INC48", "INC51", "INC23"],
    body: `## Symptom → cause → fix

| Console says | Cause | Fix |
|---|---|---|
| \`No enum constant …DeviceType.flux_3\` | Lower-case enum value {F122} | \`DEVICE_TYPE=FLUX_3\` |
| Build waits: \`no Available … robot\` | Every matching robot is Reserved, Offline, Connection Failed or Unavailable | Find out which and why (Orka's Robots list); release your own Reserved rigs |
| \`… is Unavailable\` / skipped | Unavailable needs the exact unique name {F102} | Pass \`ROBOT_NAME=<exact Name>\`†; don't change its status — Orka resets it to Unavailable afterwards {F104} |
| \`… is Reserved\` | Someone is running locally {F113} | Ask them; never take over another engineer's reservation |
| \`… is Connection Failed\` | Health ping failed; checkouts blocked {F108} | [[ts-connection-failed]] |
| Go SDK auth failure / blank \`API_KEY\` | Missing key in Merchant Config {F139} | Orka → Merchant Config → **Edit** {F137} → fill API Key |
| Test matched to the wrong device (e.g. a printer test on a Flux Pocket) | Capabilities don't express the need {F131} | Add the capability (e.g. \`printer\`) |
| \`LSTR ParseError … line N\` | Missing comma/bracket; Parrot has no linter {F208} | Check line N−1; paste a known-good block |
| \`FAILED at "select print"\` after a timeout | Last step before a printer-payload timeout {F210}; usually stale coordinates {F211} | Watch the recording; fix coordinates |
| "The job disappeared" | Legacy jobs are split into Java and iOS views {F017} | Look in the other view |

> **Illustrative (sim only):** Console wording and parameter names are the sim's†.
`,
  },
  {
    id: "ts-power",
    title: "Troubleshooting: Power Faults",
    category: "Troubleshooting",
    summary: "Dark Pis, dead rigs and wrong outlets — follow the power from the wall to the load, and never put a LabSim or a Kollis probe on a DC rail.",
    factIds: ["F074", "F085", "F086", "F087", "F227", "F228", "F229"],
    tags: ["power.rails", "power.fuses", "power.18v"],
    related: ["power-distribution", "fuses-and-multimeter", "power-18v-exception", "ts-connection-failed"],
    keywords: ["power", "dark Pis", "fuse", "regulator", "Mean Well", "24V", "12V", "5V", "AC strip", "fried", "MAIN", "MOTOR", "troubleshooting"],
    practice: ["INC03", "INC17", "INC18", "DR04", "DR13"],
    body: `## Follow the power

\`120V AC wall → Mean Well → 24V DC rail → step-down regulators → inline fuses → loads\` {F227}

| Symptom | Check in this order |
|---|---|
| A whole rack of Pis dark, several robots Connection Failed at once | The rack's **5V 10A** line {F086}: its inline fuse {F087}, then its regulator |
| One Pi dark | Bay **MAIN** toggle → the Pi's lead → its fuse |
| The NUC is off | The **12V** line {F085} and its fuse |
| Everything on the 24V side dead | The **Mean Well** {F074} and its 120V AC input |
| Arm won't move, Pi fine | Bay **MOTOR** toggle / Steppers |
| A LabSim or Kollis probe dead right after being plugged in | It was plugged into a DC rail — fried {F229} |

## Plugging things in

LabSim devices draw an irregular 18V {F228}; LabSim terminals and Kollis probes go **only** on **commercial AC power strips** {F229}. If the strip is full, free an outlet — never use a spare 24V tap.

> **Warning:** De-energise a branch before pulling its fuse, and replace a fuse with the rating on its holder.
`,
  },
  {
    id: "ts-adb",
    title: "Troubleshooting: ADB Problems",
    category: "Troubleshooting",
    summary: "Refused connections, a coworker's device being driven by your script, an element that isn't in the dump — the ADB failures you'll actually see and their fixes.",
    factIds: ["F026", "F199", "F200", "F198", "F024", "F151", "F152", "F193"],
    tags: ["adb.port", "adb.usage", "uia.config"],
    related: ["adb-port-5444", "adb-commands", "config-properties", "stand-duet-dual-screen"],
    keywords: ["ADB", "Connection refused", "5555", "5444", "coworker", "desk device", "uiautomator dump", "element missing", "Stand Duet", "CFD", "offline device"],
    practice: ["INC27", "INC28", "INC30", "INC64", "DR03"],
    body: `## Symptom → fix

| Symptom | Cause | Fix |
|---|---|---|
| \`failed to connect to '<ip>:5555': Connection refused\` | You left the port off; ADB defaults to 5555 {F199}; lab devices listen on 5444 {F026} | \`adb connect <ip>:5444\` |
| A coworker's desk device starts doing your test | Your runner is on 5555 and reached their device {F200} | Stop the run, disconnect it, set \`portNumber=5444\` {F198}, reconnect, re-run |
| The element isn't in \`window_dump.xml\` on a Stand Duet | Only the primary MFD is exposed to ADB {F151}; legacy UIA was blind to the CFD {F152} | Use a UIA 2.3 dual-screen locator or a physical bot ([[stand-duet-dual-screen]]) |
| Duet test can't find the CFD | CFD IP blank or wrong | Stand Duet: both IPs are the same address {F193} |
| Device refuses ADB right after a Lazo OOBE | The device was reset† | Re-apply the lab ADB settings for port 5444† |

## Remember

- ADB inspects XML UI hierarchies, locates elements and dispatches programmatic touches {F024} — but it cannot type a PIN on a Secure Touch screen.
- Unplugging a coworker's device is never the fix.
`,
  },
  {
    id: "ts-cards",
    title: "Troubleshooting: Card Actions Fail",
    category: "Troubleshooting",
    summary: "Dips, taps and swipes that fail — Kallus down, a wrong Gorth path, a stale scheduled clone, corrupted Track Data or a dark Kollis probe.",
    factIds: ["F145", "F146", "F147", "F148", "F149", "F049", "F050", "F110", "F069", "F070", "F229"],
    tags: ["cards", "cards.swipe", "cards.diptap", "cards.kallus", "hw.kollis"],
    related: ["card-profiles", "kallus", "kollis-probes", "ts-connection-failed"],
    keywords: ["dip failed", "tap failed", "swipe declined", "Track Data", "Gorth path", "scheduled clone", "Kallus down", "Kollis probe", "card load"],
    practice: ["INC02", "INC16", "INC18", "INC53", "INC54", "INC55"],
    body: `## Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Dips fail and the rig's Pi reports the Kallus upstream unreachable | The Windows/Minix box running Kallus is down {F049} {F110} | Escalate to {{jaden}} — not a code fix |
| Dip/Tap profile can't load its card | The profile's Gorth path is wrong or the file isn't in Gorth {F147} | Fix the path to the Gorth file |
| A brand-new card file isn't found on the Windows box | The scheduled clone hasn't run since the commit {F148} | Run / wait for the scheduled clone, then retry (Kallus loads from the cloned copy {F149}) |
| Swipe declined everywhere for one profile | Corrupted Track Data in MySQL {F145} | Re-extract it with the hardware card-reader utility {F146} |
| No card action reaches the device, Kallus fine | Kollis probe dark or its rear ribbon loose {F069} {F070} | Check the probe's AC power {F229} and re-seat the ribbon |
| Chip read errors on one touch robot | Dip arm misaligned | Realign the dip arm (steppers disabled) |

## Remember

Kallus reads card-profile paths from Gorth and drives the Kollis probes {F050}. **Never paste Track Data into a Dip profile** — dips and taps use Gorth file paths.
`,
  },
  {
    id: "ts-uia-flaky",
    title: "Troubleshooting: Flaky or Failing uia-relay Tests",
    category: "Troubleshooting",
    summary: "UiObjectNotFoundException, wrong-direction scrolling, tests starting on the wrong screen, a local run colliding with Jenkins — and the page-object rules that prevent them.",
    factIds: ["F178", "F179", "F180", "F177", "F182", "F112", "F113", "F164", "F195"],
    tags: ["uia.pom", "uia.sync", "uia.scroll", "uia.taxtest", "orka.status.reserved"],
    related: ["uia-relay-pom", "tax-test", "uia-relay-structure", "orka-statuses"],
    keywords: ["flaky", "UiObjectNotFoundException", "waitForScreen", "isScreenPresent", "scroll", "open", "HomeScreen", "teardown", "Reserved", "local run", "collision"],
    practice: ["INC31", "INC32", "INC33", "INC35", "DR15"],
    body: `## Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| \`UiObjectNotFoundException\` on some runs only; the camera shows the tap before the screen finished drawing | The screen class has no \`waitForScreen()\` {F178} | Add \`waitForScreen()\` (and \`isScreenPresent()\`) — both are mandatory {F180} |
| \`open("Register")\` never finds the app on a Flux, works on a Micro | Scroll branches swapped — Flux must scroll **vertically**, Micro/Stand **horizontally** {F177} | Fix the branch in Zone 2; check \`deviceType\` in \`config.properties\` {F195} |
| Tests start on random screens / fail on the first step | The previous test didn't tear down to HomeScreen {F182} | Restore the teardown; start every test from HomeScreen |
| Can't tell which screen you're on | Use \`isScreenPresent()\` — it returns a boolean {F179} | |
| Your local run fails halfway because the screen changed under it | A Jenkins build checked out the same rig | **Reserve** the rig before running locally {F112}; Reserved blocks Jenkins pipelines {F113} |
| A test file was added under \`app/src/main\` | \`main\` is production code; QA never modifies it {F164} | Move it to \`androidTest/testactions\` |

> **Tip:** Run a fixed flaky test three times in a row before calling it fixed.
`,
  },
]);
