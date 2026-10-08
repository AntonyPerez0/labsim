/**
 * Field Manual articles — tools. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const TOOLS_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "adb-port-5444",
    title: "ADB on Port 5444 (and the 5555 Story)",
    category: "Tools",
    summary: "Lab LabSim devices speak ADB on TCP port 5444. Standard ADB defaults to 5555 — and in the office that default let automated scripts connect to and control coworkers' desk devices.",
    factIds: ["F026", "F198", "F199", "F200", "F024", "F025", "F123"],
    tags: ["adb.port", "adb.usage", "uia.config"],
    related: ["adb-commands", "config-properties", "ts-adb", "robot-pi"],
    keywords: ["ADB", "5444", "5555", "port", "collision", "coworker", "desk device", "adb connect", "portNumber", "Connection refused", "5037"],
    practice: ["INC27", "INC28", "DR03", "DR19"],
    body: `## The numbers

| Port | What it is |
|---|---|
| **5444** | The lab's ADB port {F026}; \`portNumber\` in \`config.properties\` is locked to it {F198} |
| 5555 | The **standard ADB default** {F199} — never used for lab devices |
| 5037 | The local ADB *server* on your own workstation (not a device port) |

## The 5555 story

Using the default port caused **severe office port collisions**: automated scripts **connected to and controlled coworkers' desk devices** {F200}. The lab moved its devices to **5444** so lab automation can't reach desk devices by accident.

How it plays out in the sim†: your runner tries \`10.42.30.21:5555\`, the lab device refuses (it only listens on 5444), and the runner falls back to the first device your ADB server already knows — {{riley}}'s desk device on 5555. {{riley}} shouts; you stop the run.

## Doing it right

\`\`\`bash
adb connect 10.42.30.32:5444        # lab device: always name the port†
adb devices                         # → 10.42.30.32:5444   device
adb connect 10.42.30.32             # no port = 5555 → Connection refused
\`\`\`

If a coworker's device starts acting up while you run tests:

1. **Stop** your run.
2. \`adb disconnect\` the desk device.
3. Set \`portNumber=5444\` and reconnect to the lab device on 5444.
4. Re-run, and apologise.

> **Warning:** Unplugging the coworker's device doesn't fix anything — your config is still wrong.

## Where 5444 appears

- \`config.properties\` → \`portNumber=5444\`.
- Jenkins console env block → \`PORT_NUMBER=5444\`†.
- Orca's Robot ADB Service URL routes ADB through the Pi controller {F123}.
`,
  },
  {
    id: "adb-commands",
    title: "Using ADB: Inspect, Locate, Tap",
    category: "Tools",
    summary: "The ADB workflow for talking to a LabSim without touching it — connect on 5444, dump the XML UI hierarchy, find an element's bounds, compute the centre and dispatch a programmatic tap.",
    factIds: ["F024", "F025", "F026", "F151", "F005"],
    tags: ["adb.port", "adb.usage", "tools.terminal"],
    related: ["adb-port-5444", "station-duo-dual-screen", "terminal-cheatsheet"],
    keywords: ["adb", "uiautomator dump", "window_dump.xml", "bounds", "input tap", "XML hierarchy", "element", "pull", "devices", "shell"],
    practice: ["DR03", "DR19", "INC64"],
    body: `## What ADB is for

**ADB (Android Debug Bridge)** is the command-line tool used to **inspect XML UI hierarchies and locate elements** {F024}, and to **dispatch programmatic touch events** {F025}. In the lab it runs over **port 5444** {F026}. UI Automator, the engine inside uia-remote {F005}, works from the same view of the screen.

## Tap an element in five commands

\`\`\`bash
adb connect 10.42.30.32:5444                                # 1. connect†
adb devices                                                 # 2. confirm
adb -s 10.42.30.32:5444 shell uiautomator dump              # 3. dump the hierarchy
#   UI hierchary dumped to: /sdcard/window_dump.xml           (the real tool's own spelling)
adb -s 10.42.30.32:5444 pull /sdcard/window_dump.xml        # 4. pull it
grep -o 'text="Register"[^>]*' window_dump.xml
#   text="Register" … bounds="[96,412][288,604]"†
adb -s 10.42.30.32:5444 shell input tap 192 508             # 5. tap the centre
\`\`\`

## Computing the centre

\`bounds="[x1,y1][x2,y2]"\` → centre = \`((x1 + x2) / 2, (y1 + y2) / 2)\`. For \`[96,412][288,604]\` that is \`(192, 508)\`.

## Limits

- ADB only sees what the device exposes. On a **Station Duo** only the primary MFD is exposed {F151}; the CFD's elements are not in the dump ([[station-duo-dual-screen]]).
- ADB taps are electronic — they cannot enter a PIN on Secure Touch screens, which is why Canadian PIN flows need physical bots ([[adb-vs-physical-bots]]).
`,
  },
  {
    id: "gimp-coordinates",
    title: "GIMP: Extracting Screen Coordinates",
    category: "Tools",
    summary: "How to measure an exact bounding box in a device screenshot with GIMP's Rectangle Select — the input for Pigeon screen comparisons and legacy Screen Compare Images.",
    factIds: ["F030", "F212", "F153", "F155"],
    tags: ["duo.ocr", "pigeon.gimp"],
    related: ["pigeon-bottlenecks", "orca-screen-compare", "station-duo-dual-screen"],
    keywords: ["GIMP", "Rectangle Select", "bounding box", "Tool Options", "Position", "Size", "screenshot", "coordinates", "pixels"],
    practice: ["INC24", "DR05"],
    body: `## What GIMP is for

**GIMP** is the image editor used to open device screenshots, draw **selection bounding boxes** around text elements and extract **exact spatial coordinates** for legacy screen-comparison blocks {F030}.

## Step by step

1. Take a snapshot of the screen (e.g. the camera app's **Snapshot** of the CFD).
2. **File → Open** the PNG in GIMP.
3. Choose **Rectangle Select** and drag a box tightly around the target text.
4. Read **Tool Options → Position** (x, y) and **Size** (w × h) — in pixels.
5. Copy them into the Pigeon JSON block {F212} or a Screen Compare Image row along with the expected text {F153}.

## Worked example (R2-D2's customer screen)†

| Field | Value read in GIMP | Goes into |
|---|---|---|
| Position | \`412, 288\` | \`x\`, \`y\` |
| Size | \`236 × 44\` | \`w\`, \`h\` |
| Text inside the box | \`TOTAL $10.83\` | \`expected\` |

\`\`\`json
{ "action": "screenCompare", "params": { "x": 412, "y": 288, "w": 236, "h": 44, "expected": "TOTAL $10.83" } }
\`\`\`

## Pixels vs millimetres

| Coordinates | Unit | Measured with | Used by |
|---|---|---|---|
| Screen-compare boxes | **pixels** of the screenshot | GIMP | Pigeon screenCompare blocks, Screen Compare Images |
| Screen Locations (button positions) | **millimetres** from the screen's top-left | A ruler from the limit-switch (0,0) | Orca xy_touch |

Never paste GIMP pixel values into Screen Locations, or millimetres into a screen-compare block.

## Tips

- Leave a few pixels of margin; a box that clips the text will misread.
- Re-measure after any UI change — a 10-pixel shift breaks the check {F155}.
- Copy the expected text exactly, including capitalisation and the currency sign.
- Take the snapshot from the same camera the check uses; a different camera means different pixels.
- For new checks on a Station Duo, prefer a UI Automator 2.3 assertion over a new OCR box ([[station-duo-dual-screen]]).
`,
  },
  {
    id: "intellij-and-github",
    title: "IntelliJ IDEA & GitHub Workflow",
    category: "Tools",
    summary: "The team's primary IDE and code host: clone repos from GitHub into IntelliJ IDEA, configure local properties, run suites, and land changes through branches and pull requests.",
    factIds: ["F027", "F028", "F018", "F214"],
    tags: ["uia.pom", "tools.intellij", "tools.github", "arch.repos"],
    related: ["uia-remote-structure", "config-properties", "receipt-qr-regression", "ollama-and-claude"],
    keywords: ["IntelliJ IDEA", "IDE", "GitHub", "clone", "Get from VCS", "run configuration", "pull request", "PR", "review", "branch", "Gort", "uia-remote", "pigeon"],
    practice: ["INC20", "INC34"],
    body: `## IntelliJ IDEA

**IntelliJ IDEA** is the team's **primary IDE** {F027}. You use it to **import repositories, configure local properties and execute test suites** from your workstation {F028}.

- **File → New → Project from Version Control…** → paste the clone URL → **Clone**.
- Edit \`config.properties\` for local runs ([[config-properties]]).
- Run test classes (\`TaxTest\`, \`HomeScreenTest\`…) with the green ▶ and read the run log.

> **Tip:** The Pigeon project has no JSON inspections — IntelliJ won't flag a missing comma there ([[pigeon-bottlenecks]]).

## GitHub

**GitHub** hosts the team's repositories — **Gort, uia-remote and pigeon** — for branch management and pull requests {F018}.

| Repo | What it holds |
|---|---|
| Gort | Core monorepo: testing ecosystem, configuration modules, virtual card definition files |
| uia-remote | Modern Java / UI Automator framework |
| pigeon | Legacy LSTR JSON framework |

**The PR habit:** branch → change → pull request → review → merge. Coordinate fixes go through PRs too: the receipt-QR breakage ended when {{jared}} merged a coordinate PR {F214}.

When reviewing a page-object PR, check the mandatory \`waitForScreen()\` and \`isScreenPresent()\`, Zone 1/Zone 2 placement, and that nothing touches \`app/src/main\`.

> **Illustrative (sim only):** The org name \`labsim-lab\`†, branch and PR names are the sim's.
`,
  },
  {
    id: "terminal-cheatsheet",
    title: "Terminal Cheat Sheet",
    category: "Tools",
    summary: "The commands you will type most — ssh to Pis and Windows boxes, health checks with curl, service and disk checks, ADB, git and Windows scheduled tasks — with the sim's illustrative hosts.",
    factIds: ["F019", "F021", "F026", "F099", "F148"],
    tags: ["pi.controller", "tools.terminal", "adb.usage"],
    related: ["robot-pi", "adb-commands", "callus", "illustrative-details"],
    keywords: ["terminal", "ssh", "curl", "systemctl", "uname", "df", "ps", "grep", "adb", "schtasks", "dir", "git", "commands", "cheat sheet"],
    practice: ["DR17", "DR19"],
    body: `## Raspberry Pi (Linux)

| Command | Use |
|---|---|
| \`ssh pi@10.42.10.11\`† | Log in to WALL-E's Pi |
| \`uname -a\` | Prove it is Linux |
| \`systemctl status robot-controller\`† | Is the controller service running? |
| \`df -h /\` | Disk space |
| \`ps aux \\| grep -i wine\` | Is the Wine card-programming software running? {F021} |
| \`sudo reboot\` | Reboot the Pi (then wait for the next health check) |
| \`curl -i http://10.42.10.11:8000/health\`† | What Orca's 5-minute ping sees {F099} |

## Orca REST†

| Command | Use |
|---|---|
| \`curl -X POST http://orca.lab.local:8080/api/xy_touch -H "Content-Type: application/json" -d '{"robot":"wall-e","screen":"TENDER_CASH_DISCOUNT","button":"Cash"}'\` | Tap a button through Orca |
| \`curl -X POST http://orca.lab.local:8080/api/card/dip -H "Content-Type: application/json" -d '{"robot":"wall-e","profile":"VISA_STD_DIP"}'\` | Dip a card through Orca |

## ADB (port 5444)

| Command | Use |
|---|---|
| \`adb connect <ip>:5444\` | Connect to a lab device |
| \`adb devices\` | List connected devices |
| \`adb -s <ip>:5444 shell uiautomator dump\` | Dump the XML UI hierarchy |
| \`adb -s <ip>:5444 pull /sdcard/window_dump.xml\` | Copy it to your workstation |
| \`adb -s <ip>:5444 shell input tap X Y\` | Programmatic tap |
| \`adb disconnect <ip>:5555\` | Drop a wrong (desk) connection |

## Windows / Minix boxes (Callus)

| Command | Use |
|---|---|
| \`ssh automation@10.42.20.1\`† | Log in to MINIX-01 |
| \`schtasks /query /tn GortCardSync\`† | When did the scheduled Gort clone last run? {F148} |
| \`dir C:\\gort\\cards\\emv\`† | Are the card files there? |

## git

| Command | Use |
|---|---|
| \`git status\` / \`git diff\` | What changed |
| \`git checkout -b fix/…\` | Branch for a fix |
| \`git log -1 --stat\` | What the last commit touched |

> **Illustrative (sim only):** Every host, user name, port other than 5444/5555, path and task name on this page is the sim's†.
`,
  },
  {
    id: "ollama-and-claude",
    title: "AI in the Lab: Ollama & Claude",
    category: "Tools",
    summary: "Ollama is a local LLM runner on the 4-GPU blade running a proof-of-concept vision check of receipts and tip math from webcam streams; Claude was evaluated for repository optimisation and automated test generation. Both are aids, not gates.",
    factIds: ["F031", "F032", "F033", "F078", "F075"],
    tags: ["infra.ai", "vision.ollama", "tools.claude"],
    related: ["infrastructure-overview", "intellij-and-github", "uia-remote-pom"],
    keywords: ["Ollama", "LLM", "vision", "llava", "proof of concept", "PoC", "receipt", "tip math", "Claude", "AI", "test generation", "repository optimisation"],
    practice: ["INC10", "INC57", "INC61"],
    body: `## Ollama

**Ollama** is a **local LLM runner** hosted on the lab's **4-GPU server blade** {F031} {F075} {F078}. It currently runs **proof-of-concept Vision-LLM inspections of webcam streams** to validate **receipt layouts and tip math** {F032}.

Example (sim)†:

\`\`\`text
Prompt: Check this receipt image. Is the layout complete (merchant header, items, subtotal,
        tax, tip, total) and is the tip math correct? Answer PASS or FAIL with one reason.
Answer: FAIL — tip of 18% on $42.00 should be $7.56; the receipt shows $7.65.
\`\`\`

> **Warning:** It is a **proof of concept**, not a production gate. Verify its verdicts against the printed receipt and the test's own assertions — a vision model can misread a 5 as a 6.

## Claude

**Claude** was evaluated during corporate AI initiatives for **repository optimisation and automated test generation** {F033}. Generated tests still get a human review: check that every new screen class has both mandatory methods, sits in \`pageobjects\`, and that nothing touches \`app/src/main\` ([[uia-remote-pom]]).

## Which tool does what

| Need | Tool |
|---|---|
| Read text on an ADB-blind screen (legacy) | Tesseract OCR |
| Check a receipt layout / tip math from a webcam frame (PoC) | Ollama vision model |
| Generate or optimise test code (evaluated) | Claude |
| Measure pixel coordinates | GIMP |

> **Illustrative (sim only):** The model name \`llava\`†, the address \`10.42.1.12:11434\`† and the receipt numbers are the sim's.
`,
  },
]);
