/**
 * Field Manual articles — infra. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const INFRA_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "tech-stack",
    title: "The Technology Stack",
    category: "Infrastructure",
    summary: "Every language, framework and build tool the team uses — Java, Spring Boot, JHipster, Android UI Automator 2.3, Go, Apache Maven and JSON — and where each one shows up.",
    factIds: ["F001", "F002", "F003", "F004", "F005", "F006", "F007", "F008", "F009", "F010", "F011", "F012", "F013"],
    tags: ["orca.status", "arch.stack", "uia.v23", "go.sdk"],
    related: ["orca-overview", "uia-remote-structure", "pigeon-lstr", "infrastructure-overview"],
    keywords: ["Java", "Oracle Java", "Spring Boot", "JHipster", "UI Automator", "Go", "Golang", "Maven", "JSON", "MySQL", "stack", "languages", "frameworks"],
    practice: ["INC61", "INC62"],
    body: `## Languages, frameworks & build tools

| Technology | Role in the lab |
|---|---|
| **Java** (Oracle Java) | Primary language for both the Orchestrator backend and the uia-remote test suites {F001} |
| **Spring Boot** | Backend web framework for the Orchestrator monolith and its REST API endpoints {F002} |
| **JHipster** | Rapid application development platform that scaffolded Orchestrator through an interactive setup questionnaire {F003}, auto-generating the frontend UI, the Spring Boot REST endpoints and the MySQL schemas {F004} |
| **Android UI Automator** | Google's native Android instrumentation framework, the engine inside uia-remote {F005}. Version **2.3** specifically {F006}, because it adds native **dual-screen element location tracking** {F007} |
| **Go (Golang)** | The Terminal SDK {F008}; supported via custom extensions in Orchestrator and tested through Pigeon and mobile runners {F009} |
| **Apache Maven** | The build-structure standard mirrored by the uia-remote Android project layout {F010} |
| **JSON** | Runtime capability lookups in Orchestrator {F011} and declarative, platform-agnostic test payloads in Pigeon {F012} |
| **MySQL** | The relational database backing Orchestrator {F013} |

## Quick answers

- *Is Orca written in Go?* No — Java on Spring Boot. Go is for the Go SDK.
- *Why UI Automator 2.3 and not an older version?* Dual-screen element tracking for the Station Duo.
- *Where do I see Maven?* In uia-remote's \`app/src/{main,test,androidTest}\` layout.
`,
  },
  {
    id: "infrastructure-overview",
    title: "Infrastructure: GPU Blade, VMs, MySQL & the Roadmap",
    category: "Infrastructure",
    summary: "The shelf-mounted 4-GPU server blade that replaced a legacy tower and hosts the VMs, Orca, Jenkins and Ollama; Orca's on-prem VM and MySQL; the Docker/GCP plan; GitHub and IntelliJ — and the sim's illustrative host map.",
    factIds: ["F075", "F076", "F077", "F078", "F013", "F022", "F023", "F018", "F027", "F031", "F032", "F066", "F068", "F222", "F156"],
    tags: ["infra.ai", "arch.infra", "arch.stack"],
    related: ["tech-stack", "orca-overview", "ollama-and-claude", "illustrative-details", "teams-and-history"],
    keywords: ["GPU", "NVIDIA", "server blade", "tower", "VM", "virtual machine", "MySQL", "Docker", "GCP", "Google Cloud", "on-prem", "roadmap", "host map", "IP"],
    practice: ["INC10", "INC60", "INC62"],
    body: `## The GPU server blade

- **Four NVIDIA GPUs** in a **shelf-mounted server blade** {F075} — **two exposed, two underneath** {F076} (crouch to see them).
- It **replaced a legacy tower unit** {F077}.
- It **hosts the VMs, Orca, Jenkins and Ollama** {F078}.

> **Warning:** Orca, Jenkins and Ollama share the blade. Restarting the whole blade (or a VM you don't own) kills every running job — restart only the failed service.

## Orca's home today and tomorrow

- Today Orca runs on a **local, on-premise lab virtual machine** {F023}, backed by **MySQL** {F013}.
- The plan: containerise it with **Docker** and move it to **Google Cloud Platform (GCP)** {F022}.

## The roadmap at a glance

| Item | State |
|---|---|
| Orca on an on-prem lab VM | Today {F023} |
| Orca containerised in Docker on GCP | Planned {F022} |
| Hardware control on Linux Raspberry Pis | Today {F068} |
| Hardware control on Windows Intel NUCs | Retired {F068} |
| Ollama vision checks on webcam streams | Proof of concept {F032} |
| Gen 2 Software PIN Bypass with the Core OS Team | In progress (partnership) {F222} |
| Station Duo Screen Compare / OCR | Phasing out {F156} |
| Repos on GitHub (Gort, uia-remote, pigeon) | Today {F018} |

## Developer tooling

GitHub hosts the repos {F018}; IntelliJ IDEA is the primary IDE {F027}; Intel NUC and Minix boxes are the local Windows machines {F066}. See [[intellij-and-github]].

## The sim's host map†

| Host | Address |
|---|---|
| GPU blade | \`10.42.1.5\`† |
| Orca VM | \`orca.lab.local\` → \`10.42.1.10:8080\`† (MySQL schema \`orca\`, port 3306†) |
| Jenkins VM | \`jenkins.lab.local\` → \`10.42.1.11:8080\`† |
| Ollama | \`10.42.1.12:11434\`† |
| Robot Pis | \`10.42.10.<n>\`† (REST \`:8000\`, camera \`:8081/stream.mjpg\`) |
| Windows NUC / Minix (Callus) | \`10.42.20.<n>\`† (Callus \`:9000\`) |
| LabSim devices | \`10.42.30.<n>\`† — ADB on **5444** |
| Your workstation | \`10.42.50.17\`† |
| Coworker desk devices | \`10.42.60.<n>\`† — ADB 5555 (the reason the lab uses 5444) |
`,
  },
  {
    id: "teams-and-history",
    title: "Teams & History",
    category: "Teams & History",
    summary: "From the Semi Team's SDKs and pay-display apps and the Sedi QA Team's Lester framework, to {{morgan}}'s uia-remote, its adoption by IPX and PayCore, and the Core OS partnership.",
    factIds: ["F157", "F158", "F159", "F160", "F161", "F162", "F052", "F053", "F043", "F042", "F222", "F226", "F135"],
    tags: ["teams.history", "uia.history", "semi.paydisplay"],
    related: ["uia-remote-structure", "pigeon-lstr", "card-testing-philosophy", "who-is-who"],
    keywords: ["Semi", "Sedi", "QA", "Lester", "IPX", "Integrated Payment Experience", "PayCore", "LabSim Dining", "Core OS", "history", "USB Pay Display", "Secure Network Pay Display", "Contact Canada"],
    practice: ["INC47", "INC58", "INC61"],
    body: `## The timeline

1. **Semi Team** — historically developed third-party POS SDKs and the remote pay display apps {F157}: **USB Pay Display** and **Secure Network Pay Display**, which link MFDs and CFDs over USB or the local network {F052} {F053}.
2. **Sedi (QA) Team** — tested the Semi Team's apps using the legacy **Lester** framework {F158}. Lester evolved into **Pigeon** {F043} (the name is a pun on "pidgin language" {F042}).
3. **uia-remote** — {{morgan}} created it because no prior framework could automate native tethered setups: Station-to-Mini, Mini-to-Mini and Station Duo {F159}.
4. **IPX (Integrated Payment Experience) Team** — uia-remote is now integrated with IPX {F160}, testing standalone and tethered devices across the native apps **Register, Orders, Authorizations, Sale, Transactions and Setup** {F161}.
5. **PayCore Team** — adopted uia-remote for apps like **LabSim Dining** {F162}, and runs exhaustive Visa/Discover/AmEx card matrices {F226}.
6. **Core OS Team** — partnering on the Gen 2 Software PIN Bypass {F222}.

## Who does what

| Team | What it does |
|---|---|
| Semi | POS SDKs and remote pay display apps |
| Sedi (QA) | QA with the Lester framework |
| IPX | Native apps Register, Orders, Authorizations, Sale, Transactions, Setup |
| PayCore | LabSim Dining and the full card matrix; standalone rigs kept Unavailable |
| Core OS | Gen 2 Software PIN Bypass partner |

Contact Canada automation scripts run on the Westers test beds and use both capability lookup styles {F135}.

> **Illustrative (sim only):** The reference calls the uia-remote author "the presenter"; the game's name for that person is {{morgan}}†.
`,
  },
]);
