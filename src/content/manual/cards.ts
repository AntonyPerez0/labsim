/**
 * Field Manual articles — cards. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const CARDS_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "collis-probes",
    title: "Collis Probes",
    category: "Cards & Payments",
    summary: "High-cost proprietary card emulators from UL Transaction Security that fake a magnetic-stripe swipe, an EMV chip dip or a contactless NFC tap, connected to the rig by rear ribbon cables.",
    factIds: ["F069", "F070", "F071", "F097", "F229", "F241", "F242"],
    tags: ["cards", "hw.collis"],
    related: ["callus", "card-profiles", "power-18v-exception", "touch-robot-anatomy"],
    keywords: ["Collis", "UL Transaction Security", "card emulator", "ribbon cable", "swipe", "dip", "tap", "EMV", "NFC", "magnetic stripe", "probe"],
    practice: ["INC18", "INC16"],
    image: "touch-robot-side-gantry.jpg",
    body: `## What they are

**Collis probes** (UL Transaction Security) are **high-cost proprietary card emulators** {F069}. One probe can simulate {F071}:

- a **magnetic-stripe swipe**,
- an **EMV chip dip**,
- a **contactless NFC tap**.

## How they connect

- Each probe connects to its rig via a **rear ribbon cable** {F070}. On a touch robot the flat white ribbon "card" is carried into the chip slot by the rotating dip arm {F241}; the grey probe box sits on the shelf beside the device {F242}.
- The **Windows/Minix box running Callus** drives the probe over a ribbon cable, and the probe feeds the LabSim device's card reader {F097} ([[callus]]).
- Power: like LabSim terminals, Collis probes plug into **commercial AC power strips**, never the DC rails {F229}.

> **Warning:** Treat probes like gold. A probe on a DC rail is fried hardware and a very expensive mistake ([[power-18v-exception]]).

## Troubleshooting a dark probe

| Check | Why |
|---|---|
| Power LED / AC strip outlet | Probes use their own power supply on the strip |
| Rear ribbon seated | A loose ribbon means no card reaches the reader |
| Callus service on the Minix box | No Callus, no card load ([[ts-cards]]) |
`,
  },
  {
    id: "callus",
    title: "Callus (Callers / Collos)",
    category: "Cards & Payments",
    summary: "The card-emulation microservice on the local Windows/Minix boxes: it reads card-profile paths from Gort, loads the virtual card and drives the Collis probes.",
    factIds: ["F048", "F049", "F050", "F097", "F148", "F149", "F184", "F110", "F066"],
    tags: ["cards", "cards.callus"],
    related: ["card-profiles", "collis-probes", "nuc-minix-history", "ts-connection-failed", "ts-cards"],
    keywords: ["Callus", "Callers", "Collos", "microservice", "Minix", "Windows", "virtual card", "Gort", "scheduled job", "load card"],
    practice: ["INC02", "INC53", "INC54"],
    body: `## What it is

**Callus** — also referred to as **"Callers"** or **"Collos"** {F048} — is a **microservice subsystem** that runs on the lab's **local Windows/Minix boxes** {F049} (the lab's Windows execution machines {F066}). It is easy to confuse with **Collis**, the probe hardware it drives.

| Name | What |
|---|---|
| Callus / Callers / Collos | The software service on Windows/Minix boxes |
| Collis | The physical card-emulator probe |

## What it does

- Reads **card-profile paths from Gort** and drives the physical **Collis probes** during virtual card transactions {F050}.
- A **scheduled job** clones the Gort card-definition files onto the local Windows boxes {F148}.
- During a test run, Callus servers **map the file path and load the virtual card** {F149}.
- In the Tax test, Orca routes a backend call to the Callers/Collos microservice to load a simulated swipe card {F184}.

\`\`\`log
map cards/emv/visa_std_dip.json → C:\\gort\\cards\\emv\\visa_std_dip.json · load virtual card OK · probe wall-e: DIP†
\`\`\`

## When Callus is down

A Minix box running Callus going offline is a typical cause of **Connection Failed** {F110}: the Pi is alive but its health endpoint reports the Callus upstream as unreachable. It is a hardware escalation to {{jared}}, not a code fix — don't edit card paths ([[ts-connection-failed]]).

> **Illustrative (sim only):** Callus listening on port 9000†, the box names \`MINIX-01\`/\`MINIX-02\`† and the log format are the sim's.
`,
  },
  {
    id: "card-profiles",
    title: "Card Profiles: Swipe vs Dip & Tap",
    category: "Cards & Payments",
    summary: "Swipe profiles store raw Track Data in MySQL; Dip and Tap profiles store file paths into the Gort repo, which a scheduled job clones onto the Windows boxes where Callus loads them.",
    factIds: ["F145", "F146", "F147", "F148", "F149", "F034", "F035", "F097"],
    tags: ["cards", "cards.swipe", "cards.diptap", "cards.callus", "arch.repos"],
    related: ["callus", "collis-probes", "card-testing-philosophy", "ts-cards"],
    keywords: ["card profile", "swipe", "Track Data", "dip", "tap", "Gort", "file path", "MySQL", "card reader utility", "scheduled job", "clone", "GortCardSync", "VISA_STD_DIP"],
    practice: ["INC53", "INC54", "INC55"],
    body: `## Two kinds of profile

| Profile type | What Orca stores | Where it came from |
|---|---|---|
| **Swipe** | **Raw Track Data text strings**, directly in the MySQL table {F145} | Extracted with a **hardware card-reader utility** {F146} |
| **Dip & Tap** | **File paths** pointing to card definitions inside the **Gort** repository {F147} | Card definition files committed in Gort {F035} |

Gort is the core monorepo housing the testing ecosystem and its configuration modules {F034}, and the virtual card definition files used by Dip and Tap profiles {F035}.

## From storage to transaction (a Dip)

1. The card definition file is committed in **Gort**.
2. Orca's Dip profile stores the **file path**.
3. A **scheduled job clones** Gort's card files onto the local Windows boxes {F148}.
4. During the run, **Callus maps the path and loads the virtual card** {F149}.
5. The **Collis probe** presents the card to the device's reader {F097}.

## Typical mistakes

- Pasting Track Data into a Dip profile — dips use Gort file paths, not Track Data.
- A Dip path that points at a file missing from Gort, or a file not yet cloned to the Windows box (the scheduled clone hasn't run since the commit).
- Corrupted Track Data in a swipe profile — re-extract it with the card-reader utility.

> **Illustrative (sim only):** Profile names (\`VISA_STD_SWIPE\`, \`VISA_STD_DIP\`, \`INTERAC_CA_DIP\`), Gort paths (\`cards/emv/…\`, \`cards/nfc/…\`), the task name \`GortCardSync\` and \`C:\\gort\\cards\\…\` are the sim's†.
`,
  },
  {
    id: "card-testing-philosophy",
    title: "Card Testing Philosophy, Canada & PIN Entry",
    category: "Cards & Payments",
    summary: "Your team proves pipelines with one reliable Visa profile plus Interac for Canada; PayCore runs exhaustive Visa/Discover/AmEx matrices. Canadian flows need physical PIN entry — and Gen 2 aims to bypass that in software.",
    factIds: ["F224", "F225", "F226", "F103", "F220", "F222", "F223", "F061", "F218"],
    tags: ["cards", "cards.philosophy", "bots.pin", "bots.types"],
    related: ["adb-vs-physical-bots", "card-profiles", "orca-statuses", "teams-and-history"],
    keywords: ["Visa", "Interac", "Discover", "AmEx", "card matrix", "PayCore", "Canada", "PIN", "Westers", "Compact", "Gen 2", "Secure Touch", "Core OS"],
    practice: ["INC52", "INC58", "INC41"],
    body: `## Two philosophies

| Team | Strategy |
|---|---|
| **Your team** | Standardise on a **single reliable Visa profile** to verify transaction pipelines {F224}, plus **Canadian Interac** for regional flows {F225} |
| **PayCore Team** | **Exhaustive back-to-back card-matrix validations** — Visa, Discover, AmEx {F226} |

Different jobs, different needs: your team tests that the *pipeline and app flows* work; PayCore validates *card coverage*. "Should we add Discover and AmEx to our regression?" — no; that is PayCore's matrix, not your pipeline check.

PayCore's standalone rigs are kept **Unavailable** so general tests don't overwrite their merchant profiles {F103}.

## Canada

- The LabSim **Compact** is the Canadian-market terminal, used on the **Westers** test beds {F061}.
- Canadian payment workflows **mandate physical PIN entry**, so they need a **physical bot** {F220}. ADB bots can only use merchants that bypass PIN security {F218}.
- Card choice: **Interac** for the Canadian flow {F225}.

| Tonight's run | Card profile |
|---|---|
| US Go SDK smoke | Visa |
| Contact Canada PIN sale | Interac |

## Gen 2 Software PIN Bypass

The team is partnering with the **Core OS Team** on a software framework that bypasses physical robotics for **Secure Touch PIN entry** {F222}; physical robotics would then be reserved for non-negotiable hardware interactions such as **card dipping** {F223}.
`,
  },
]);
