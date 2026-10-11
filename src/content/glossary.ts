/**
 * Glossary — every system, repo, tool, device, status, entity, config key and acronym a trainee meets.
 * Definitions agree with docs/reference/REMOVED-internal-reference.md; `illustrative` marks sim-only names.
 * People appear as `{{key}}` tokens (resolved from team.ts).
 */
import type { GlossaryTerm } from './schema';
import { resolvePeople } from './people';

function g(term: string, aliases: string[], definition: string, tags: string[], articleId?: string, illustrative?: boolean): GlossaryTerm {
  return { term, aliases, definition, tags, ...(articleId ? { articleId } : {}), ...(illustrative ? { illustrative: true } : {}) };
}

export const GLOSSARY: GlossaryTerm[] = resolvePeople<GlossaryTerm[]>([
  // ── Systems & repositories ────────────────────────────────────────────────
  g('Orchestrator', ['Orka'], 'The on-premise Spring Boot monolith that acts as the central Controller between Jenkins pipelines and the physical lab robots. Backed by MySQL; runs on a lab VM.', ['orka.status', 'arch.roles', 'arch.stack'], 'orka-overview'),
  g('Jenkins', ['Executor', 'CI/CD'], 'The CI/CD execution engine ("Executor"): triggers test pipelines, injects runtime environment variables and checks robots out of Orka. Legacy jobs are split into Java and iOS.', ['jenkins', 'arch.roles'], 'jenkins-executor'),
  g('Gorth', ['Gorth monorepo'], 'The core monorepo housing the automated testing ecosystem, its configuration modules and the virtual card definition files used by Dip and Tap profiles. Despite the robot-style name, it is a repo, not a rig.', ['cards', 'arch.repos', 'cards.diptap'], 'card-profiles'),
  g('uia-relay', ['UIA Remote', 'uia remote'], 'The team\'s modern Java / Android UI Automator (2.3) test repository; automates standalone devices and tethered multi-device setups across native LabSim apps. Created by {{morgan}}.', ['uia.pom', 'arch.repos'], 'uia-relay-structure'),
  g('Parrot', ['LSTR', 'parrot repo'], 'The legacy test repository (aka LSTR), evolved from Lister; parses raw JSON test payloads across REST, Android, Windows and iOS. The name puns on "parroting".', ['parrot', 'parrot.lstr'], 'parrot-lstr'),
  g('LSTR', ['Language Specific Test Runner'], 'Language Specific Test Runner — Parrot\'s engine, with dedicated runners for REST, Android, Windows and iOS.', ['parrot', 'parrot.lstr'], 'parrot-lstr'),
  g('Lister', ['Lister framework'], 'The legacy framework the Sedi (QA) Team used to test the Semi Team\'s apps; Parrot evolved from it.', ['parrot.lstr', 'uia.history'], 'teams-and-history'),
  g('Lazo Automation', ['Lazo'], 'Automated provisioning framework running a zero-touch OOBE routine: de-provisions hardware, wipes local caches, steps through the setup wizard and swaps merchants mid-suite.', ['orka.capabilities', 'lazo.oobe'], 'lazo-and-ubo'),
  g('Kallus', ['Kallers', 'Kollos'], 'Microservice on the local Windows/Minix boxes that reads card-profile paths from Gorth, loads the virtual card and drives the physical Kollis probes. Not to be confused with Kollis (the probe).', ['cards', 'cards.kallus'], 'kallus'),
  g('Ubo Platform', ['Ubo'], 'Internal routing platform used when test jobs dynamically switch merchant configurations.', ['orka.capabilities', 'ubo.routing'], 'lazo-and-ubo'),
  g('USB Pay Display', [], 'Semi Team application that links a Merchant Facing Device and a Customer Facing Device over USB.', ['teams.history', 'semi.paydisplay'], 'mfd-cfd-tethered'),
  g('Secure Network Pay Display', [], 'Semi Team application that links MFDs and CFDs over the local network.', ['teams.history', 'semi.paydisplay'], 'mfd-cfd-tethered'),
  g('Robot Controller', ['Robot Pi', 'controller'], 'The Raspberry Pi on each shelf: ADB routing, camera streams, stepper motors, solenoids and Wine card-programming emulation. Orka pings it every 5 minutes.', ['pi.controller', 'hw.pi'], 'robot-pi'),
  // ── Languages, frameworks, tools ──────────────────────────────────────────
  g('Java', ['Oracle Java'], 'Primary programming language of both the Orchestrator backend and the uia-relay test suites.', ['arch.stack'], 'tech-stack'),
  g('Spring Boot', [], 'Backend web framework used to build the Orchestrator monolith and its REST API endpoints.', ['arch.stack'], 'tech-stack'),
  g('JHipster', [], 'Rapid application development platform that scaffolded Orchestrator through an interactive setup questionnaire, generating the frontend UI, Spring Boot REST endpoints and MySQL schemas.', ['arch.stack'], 'tech-stack'),
  g('MySQL', [], 'The relational database backing Orchestrator: hardware states, merchant profiles, screen-coordinate tables, card profiles.', ['arch.stack'], 'orka-overview'),
  g('Android UI Automator', ['UI Automator', 'UIA'], 'Google\'s native Android instrumentation framework, used inside uia-relay. Designed to talk to one Android device at a time.', ['uia.pom', 'uia.multidevice'], 'tech-stack'),
  g('UI Automator 2.3', ['UIA 2.3'], 'The UI Automator version uia-relay uses, because it adds native dual-screen element location tracking — the reason Stand Duet OCR checks are being phased out.', ['duet.ocr', 'uia.v23'], 'stand-duet-dual-screen'),
  g('Go', ['Golang', 'Terminal SDK', 'Go SDK'], 'Language of the Terminal SDK, supported via custom extensions in Orchestrator and tested through Parrot and mobile runners. Go pipelines receive App ID / App Secret / API Key as env vars.', ['go.sdk'], 'orka-merchant-config'),
  g('Apache Maven', ['Maven'], 'Build-structure standard mirrored by the uia-relay Android project layout (app/src/main, test, androidTest).', ['uia.layout'], 'uia-relay-structure'),
  g('JSON', [], 'Data format for Orka\'s runtime capability lookups and for Parrot\'s declarative, platform-agnostic test payloads.', ['arch.stack', 'parrot.json'], 'parrot-lstr'),
  g('ADB', ['Android Debug Bridge', 'adb'], 'Command-line tool used to inspect XML UI hierarchies, locate elements and dispatch programmatic touch events. In the lab it runs over port 5444.', ['adb.port', 'adb.usage'], 'adb-commands'),
  g('IntelliJ IDEA', ['IntelliJ', 'IDE'], 'The team\'s primary IDE: import repositories, configure local properties and execute test suites.', ['tools.intellij'], 'intellij-and-github'),
  g('VS Code', ['Visual Studio Code', 'VSCode'], 'The editor used for Parrot\'s JSON tests. Its built-in JSON support flags raw syntax errors (red squiggle + Problems panel, reported at the token after the gap) but knows nothing about Parrot/LSTR semantics.', ['parrot', 'tools.vscode'], 'parrot-bottlenecks'),
  g('GitHub', [], 'Hosts the team\'s repositories (Gorth, uia-relay, parrot) for branch management and pull requests.', ['tools.github', 'arch.repos'], 'intellij-and-github'),
  g('Tesseract OCR', ['Tesseract'], 'Open-source OCR engine run on cropped webcam screenshots to validate text on displays that are blind to ADB.', ['duet.ocr', 'vision.tesseract'], 'orka-screen-compare'),
  g('GIMP', [], 'Image editor used to open device screenshots, draw bounding boxes around text and extract exact coordinates for screen comparisons.', ['duet.ocr', 'parrot.gimp'], 'gimp-coordinates'),
  g('Ollama', [], 'Local LLM runner on the lab\'s 4-GPU blade; runs proof-of-concept vision-LLM checks of webcam streams to validate receipt layouts and tip math.', ['infra.ai', 'vision.ollama'], 'ollama-and-claude'),
  g('Claude', [], 'AI model evaluated during corporate AI initiatives for repository optimisation and automated test generation.', ['infra.ai', 'tools.claude'], 'ollama-and-claude'),
  g('Linux', [], 'Operating system on the Raspberry Pi controllers; isolates hardware control loops from corporate Windows machines.', ['pi.controller', 'hw.pi'], 'linux-and-wine'),
  g('Wine', [], 'Compatibility layer on the Pi\'s Linux that emulates the Windows-only card-programming software.', ['pi.controller', 'cards.wine'], 'linux-and-wine'),
  g('Docker', [], 'Container platform; with GCP, the planned migration target for Orchestrator (today on an on-prem lab VM).', ['infra.ai', 'arch.infra'], 'infrastructure-overview'),
  g('Google Cloud Platform', ['GCP', 'Google Cloud'], 'Planned cloud home for a containerised Orchestrator.', ['infra.ai', 'arch.infra'], 'infrastructure-overview'),
  g('Virtual Machine', ['VM', 'lab VM'], 'Orka runs on a local, on-premise lab VM; the shelf-mounted GPU server blade hosts the VMs, Orka, Jenkins and Ollama.', ['infra.ai', 'arch.infra'], 'infrastructure-overview'),
  // ── Hardware ──────────────────────────────────────────────────────────────
  g('GPU server blade', ['blade', 'server blade', 'NVIDIA GPUs'], 'Shelf-mounted server with four NVIDIA GPUs (two exposed, two underneath) that replaced a legacy tower; hosts the VMs, Orka, Jenkins and Ollama.', ['infra.ai', 'arch.infra'], 'infrastructure-overview'),
  g('Raspberry Pi', ['Pi', 'RPi'], 'About $50 single-board computer running Linux; one per shelf as the Robot Controller. Powered from the 5V DC, 10A line.', ['pi.controller', 'hw.pi'], 'robot-pi'),
  g('Intel NUC', ['NUC', 'ASUS NUC'], 'Small Windows execution machine powered from the 12V DC line. corporate security monitoring filled their disks, so hardware control moved to the Pis.', ['pi.controller', 'hw.nuc'], 'nuc-minix-history'),
  g('Minix box', ['Minix'], 'Small Windows execution machine; runs the Kallus service that drives the Kollis probes. A Minix box going offline is a typical Connection Failed cause.', ['pi.controller', 'hw.nuc', 'cards.kallus'], 'nuc-minix-history'),
  g('corporate security monitoring', ['security agent', 'corporate'], 'Aggressive corporate security-monitoring packages that exhausted the NUCs\' disk space — the reason hardware control was migrated onto Raspberry Pis.', ['pi.controller', 'hw.nuc'], 'nuc-minix-history'),
  g('Kollis probe', ['Kollis', 'UL Transaction Security'], 'High-cost proprietary card emulator (UL Transaction Security; the most expensive part on a shelf, because of licensing) on a rear ribbon cable; simulates mag-stripe swipes, EMV chip dips and contactless NFC taps. AC strip power only.', ['cards', 'hw.kollis'], 'kollis-probes'),
  g('Mean Well transformer', ['Mean Well', 'PSU'], 'Industrial power supply converting 120V AC wall power to the lab\'s central 24V DC rail.', ['power.rails'], 'power-distribution'),
  g('24V DC rail', ['24V rail', 'central rail'], 'The central DC rail fed by the Mean Well; step-down regulators split it into 12V and 5V 10A lines. Never for LabSim devices or Kollis probes.', ['power.rails'], 'power-distribution'),
  g('Step-down regulator', ['DC-DC converter', 'regulator'], 'Converts the 24V rail to the 12V DC line (NUCs) and the 5V DC, 10A line (Pis).', ['power.rails'], 'power-distribution'),
  g('Inline fuse', ['fuse'], 'Fuse protecting a DC line from the step-down regulators. A blown 5V fuse darkens a rack\'s Pis.', ['power.rails', 'power.fuses'], 'fuses-and-multimeter'),
  g('Commercial AC power strip', ['AC strip', 'power strip'], 'Where LabSim terminals and Kollis probes plug in (with their own power supplies) — never the custom DC rails.', ['power.rails', 'power.18v'], 'power-18v-exception'),
  g('18V exception', ['18V', 'irregular 18V'], 'LabSim devices draw an irregular 18V, so they and the Kollis probes bypass the custom DC rails and use commercial AC power strips to prevent frying components.', ['power.rails', 'power.18v'], 'power-18v-exception'),
  g('Stepper motor', ['NEMA-17', 'steppers'], 'Sub-millimetre motors (NEMA-17 with GT2 pulleys in the photos) that move the gantry; enabled/disabled from the tablet\'s Steppers group.', ['robots.mechanics', 'hw.rigbom'], 'touch-robot-anatomy'),
  g('Solenoid', ['push-pull solenoid', 'plunger'], 'Remote-firing solenoid on the gantry carriage; its plunger drops onto the screen to tap.', ['robots.mechanics', 'hw.rigbom'], 'touch-robot-anatomy'),
  g('Magnetic lock', ['maglock', 'mag lock'], 'Holds each robot arm. Moving an arm by hand breaks it and turns the status banner yellow.', ['robots.mechanics', 'hw.motion'], 'maglock-and-park-all'),
  g('Limit switch', ['limit switches', 'endstop'], 'Physical switches calibrated to the (0,0) origin; Park All drives the steppers back to them.', ['robots.mechanics', 'hw.motion'], 'maglock-and-park-all'),
  g('Motor controller PCB', ['25-pin PCB', 'motor board'], 'Custom 25-pin motor-controller boards, printed in Hong Kong.', ['robots.mechanics', 'hw.rigbom'], 'fabrication-and-bom'),
  g('Dip arm', ['sector gear'], 'Black rotating arm (sector gear marked 63) that carries the Kollis probe\'s flat white ribbon card into the device\'s chip slot.', ['robots.mechanics', 'hw.rigbom'], 'touch-robot-anatomy'),
  g('Gantry', ['XY gantry', '2020 extrusion', 'V-slot'], 'The XY frame of a touch robot: 2020 aluminium extrusion with V-slot wheels, NEMA-17 steppers on GT2 belts and a carriage carrying the solenoid.', ['robots.mechanics', 'hw.rigbom'], 'touch-robot-anatomy'),
  g('Webcam', ['rig camera', 'camera'], 'Rig camera served by the Pi as a camera stream; the source of monitoring video and OCR screenshots.', ['duet.ocr', 'vision.camera'], 'touch-robot-anatomy'),
  g('Status tablet', ['tablet', 'dashboard'], 'Front-mounted tablet on each touch robot: Human Readable Name, LabSim logo, "Status: OK", "Brainbox v6"; tabs Robot, Robot Control, Motion Control.', ['robots.mechanics', 'hw.tablet'], 'status-tablet'),
  g('Brainbox v6', ['Brainbox'], 'The board/firmware string shown in the status tablet header beneath "Status: OK".', ['robots.mechanics', 'hw.tablet'], 'status-tablet'),
  g('Motion Control', ['Motion Control tab'], 'Tablet tab with button groups Steppers, Park, Dip, Tap, Phone and Solenoid.', ['robots.mechanics', 'hw.tablet'], 'status-tablet'),
  g('Park All', ['park', 'home'], 'Tablet command (Park group) that drives the steppers back to the limit switches at (0,0), clears errors and turns the banner green.', ['robots.mechanics', 'hw.motion'], 'maglock-and-park-all'),
  g('Dashboard lockout', ['lockout', 'controls locked'], 'While a test is active the global LabSim control dashboard locks out external users.', ['robots.mechanics', 'hw.lockout'], 'status-tablet'),
  g('POWER panel', ['MAIN', 'MOTOR'], 'Black 3D-printed panel beside the tablet with two green LEDs and toggles MAIN (controller power) and MOTOR (motor power).', ['lab.orientation', 'hw.tablet'], 'lab-tour'),
  g('SmartStripe Probe', ['SmartStripe'], 'Black USB dongle with a green LED between the tethered test-bed screens (reference photo).', ['devices', 'hw.devices'], 'mfd-cfd-tethered'),
  g('LabSim connectivity hub', ['hub', 'connectivity hub'], 'White LabSim hub (Ethernet, USB, power) held in a black 3D-printed dock below each tethered screen, labelled per device.', ['devices', 'hw.devices'], 'mfd-cfd-tethered'),
  g('3D printers', ['Prusa', 'Bambu Lab'], 'In-house 3D printers for the lab\'s black plastic modular fixtures, drafted in CAD from simple shapes: Prusa printers in this lab, Bambu Lab printers at the team\'s other lab.', ['lab.orientation', 'hw.print3d'], 'fabrication-and-bom'),
  g('Rack unit', ['RU', 'rack units'], 'Numbered positions on the rack rails (29–40 in the reference photo).', ['lab.orientation', 'hw.rigbom'], 'lab-tour'),
  // ── Devices ───────────────────────────────────────────────────────────────
  g('Stand', ['Stand 2018', 'Stand 2'], 'LabSim countertop family: Stand 2018, Stand 2 and Stand Duet (Duet 1, Duet 2, upcoming Duet 3).', ['devices', 'hw.devices'], 'device-families'),
  g('Stand Duet', ['Duet', 'Stand Duet 2', 'Duet 2', 'Duet 3'], 'One terminal driving two displays; only the primary MFD is exposed to ADB. The Duet 2 is printerless; the Duet 3 is upcoming.', ['devices', 'hw.devices', 'duet.ocr'], 'stand-duet-dual-screen'),
  g('Micro', ['Micro 2', 'Micro 3', 'Micro 4'], 'Micro family: Micro 2, Micro 3 (the hot-swap equivalent for a printerless Stand Duet 2) and the upcoming Micro 4.', ['devices', 'hw.devices'], 'device-families'),
  g('Flux', ['Flux 1', 'Flux 2', 'Flux 3', 'Flux 4'], 'Flux family: Flux 1, 2, 3, 4 and Pocket. Flux 3, Flux 4 and Flux Pocket share the exact same testing profile.', ['devices', 'hw.devices'], 'device-families'),
  g('Flux Pocket', ['Pocket'], 'Flux model sharing the Flux 3/4 testing profile but omitting the physical printer block.', ['devices', 'hw.devices'], 'device-families'),
  g('LabSim Compass', ['Compass'], 'Target terminal for the Canadian market, used on the Westerly test beds.', ['devices', 'hw.devices'], 'device-families'),
  g('MFD', ['Merchant Facing Device'], 'The merchant\'s screen/device. If Orka\'s MFD field is populated the pipeline treats the rig as tethered.', ['devices', 'hw.devices', 'orka.tethered'], 'mfd-cfd-tethered'),
  g('CFD', ['Customer Facing Device'], 'The customer\'s screen/device (totals, payment prompt). On a Stand Duet it is blind to ADB.', ['devices', 'hw.devices'], 'mfd-cfd-tethered'),
  g('Tethered setup', ['tethered', 'nested setup'], 'Two devices working as MFD + CFD, e.g. a Stand 2 tethered to a Micro 2, or nested Micro 3 rigs.', ['orka.entities', 'orka.tethered'], 'mfd-cfd-tethered'),
  g('Westerly test bed', ['Westerly'], 'Test beds for the Canadian market (LabSim Compass); Contact Canada scripts run there using both capability lookup styles.', ['devices', 'hw.devices', 'orka.capabilities'], 'card-testing-philosophy'),
  g('Hot-swap', ['hot swap'], 'Replacing a down device with an equivalent: a Micro 3 for a printerless Stand Duet 2.', ['devices', 'hw.devices'], 'device-families'),
  // ── Robot statuses & Orka behaviour ───────────────────────────────────────
  g('Available', [], 'Robot status: online, healthy and open to general pipeline checkouts.', ['orka.status'], 'orka-statuses'),
  g('Unavailable', [], 'Robot status: strictly reserved; only jobs passing the robot\'s exact unique name can check it out. Isolates rigs like PayCrest standalone setups; Orka resets it to Unavailable after a named job.', ['orka.status', 'orka.status.unavailable'], 'orka-statuses'),
  g('Offline', [], 'Robot status: manual placeholder while a rig is being built or its data profiles assembled. Orka skips its 5-minute health checks.', ['orka.status', 'orka.status.offline'], 'orka-statuses'),
  g('Connection Failed', ['CONNECTION_FAILED'], 'Robot status set automatically when the 5-minute REST ping to the Pi drops or returns non-200. Blocks checkouts, opens Notes, escalated to {{jaden}}.', ['orka.status', 'orka.status.connfailed'], 'ts-connection-failed'),
  g('Reserved', [], 'Robot status set manually by an engineer running tests locally; blocks Jenkins pipelines and health-check overrides.', ['orka.status', 'orka.status.reserved'], 'orka-statuses'),
  g('Health check', ['health ping', 'ping'], 'Orka\'s synchronized background thread that pings every Pi\'s Robot Controller every 5 minutes.', ['orka.status', 'orka.healthcheck'], 'orka-health-check'),
  g('Notes', ['Orka Notes'], 'Section Orka opens on Connection Failed, logging the exact endpoint attempted and the error text.', ['orka.status', 'orka.notes'], 'orka-health-check'),
  g('Checkout', ['check out', 'robot checkout'], 'Jenkins reserving a matching robot from Orka for a pipeline run; blocked for Offline, Connection Failed and Reserved rigs, and for Unavailable unless named.', ['jenkins', 'jenkins.checkout'], 'jenkins-executor'),
  g('Controller', ['Controller vs Executor'], 'Orka\'s role in the architecture; Jenkins is the Executor.', ['orka.status', 'arch.roles'], 'orka-overview'),
  // ── Orka entities & fields ────────────────────────────────────────────────
  g('JHipster entities', ['core schemas', '7 schemas'], 'Orka\'s 7 core database schemas: Robot, Robot Creation & Configuration, Robot Capabilities, Merchant Config, Screens & Screen Locations, Card Profile, Screen Compare Image.', ['orka.entities', 'arch.stack'], 'orka-robot-device'),
  g('Robot entity', ['Robots'], 'Tracks the pool of 40+ rigs and their status flags, with {{nate}}\'s custom filter UI.', ['orka.status', 'orka.robot'], 'orka-statuses'),
  g('Name', ['robot name', 'system name'], 'A robot\'s system identifier, used by Orka and pipelines (e.g. in ROBOT_NAME). Never edit it to fix a display typo.', ['orka.entities', 'orka.names'], 'orka-robot-device'),
  g('Human Readable Name', ['HRN', 'display name'], 'A robot\'s display string, pushed to the physical status tablet on the front of the enclosure.', ['orka.entities', 'orka.names'], 'orka-robot-device'),
  g('Robot Device', ['Device entity', 'Device'], 'Field linking a robot to a separate Device entity, so hardware upgrades (e.g. Flux 1 → Flux 2) keep the legacy configuration for quick rollback.', ['orka.entities', 'orka.device'], 'orka-robot-device'),
  g('Device Type', ['DeviceType', 'device type enum'], 'Enum storing device dimensions, layout metrics and internal string definitions — the reason Jenkins env vars must be ALL CAPS.', ['orka.entities', 'orka.devicetype'], 'orka-robot-device'),
  g('URL Mappings', ['URL mapping'], 'Per-robot URLs: Robot ADB Service URL, Camera Stream URL and the hardware-specific Dip, Tap and Swipe URLs.', ['orka.entities', 'orka.urls'], 'orka-urls-tethering-offsets'),
  g('Robot ADB Service URL', ['ADB Service URL'], 'URL mapping that routes ADB to the robot\'s Pi controller.', ['orka.entities', 'orka.urls'], 'orka-urls-tethering-offsets'),
  g('Camera Stream URL', ['camera stream'], 'URL mapping for the webcam feed — dedicated per Pi or shared across 4 rigs.', ['orka.entities', 'orka.urls', 'vision.camera'], 'orka-urls-tethering-offsets'),
  g('Dip / Tap / Swipe URLs', ['Dip URL', 'Tap URL', 'Swipe URL'], 'Hardware-specific card-action URL mappings stored per robot.', ['orka.entities', 'orka.urls'], 'orka-urls-tethering-offsets'),
  g('USB Tethered Device Configuration', ['MFD/CFD fields'], 'Orka configuration populating MFD and CFD relations for nested setups. A populated MFD field makes the pipeline treat the rig as tethered.', ['orka.entities', 'orka.tethered'], 'orka-urls-tethering-offsets'),
  g('Offsets', ['Offset X', 'Offset Y'], 'Legacy millimetre coordinate adjustments for imprecise limit switches; mostly deprecated since {{jaden}} calibrated the lab to a true (0,0).', ['orka.entities', 'orka.offsets'], 'orka-urls-tethering-offsets'),
  g('Robot Capabilities', ['capabilities'], 'Entity controlling how Orka matches pipeline requests to physical hardware, via dynamic JSON or non-dynamic lookups.', ['orka.capabilities'], 'orka-capabilities'),
  g('Dynamic JSON lookup', ['dynamic lookup'], 'Capability lookup used by SDK frameworks: capabilities are JSON metadata inside each test definition, parsed at runtime. Overseen by {{devin}}.', ['orka.capabilities'], 'orka-capabilities'),
  g('Non-dynamic lookup', ['hardcoded capabilities'], 'Capability lookup used by traditional UI Automator suites: capabilities are hardcoded inside the pipeline script.', ['orka.capabilities'], 'orka-capabilities'),
  g('Merchant Config', ['merchant configuration'], 'Entity storing merchant account parameters. Table display limits mean you must click Edit on a row to see every field.', ['orka.capabilities', 'orka.merchant'], 'orka-merchant-config'),
  g('App ID / App Secret / API Key', ['App ID', 'App Secret', 'API Key'], 'Merchant Config fields {{nate}} added so pipelines can export them as runtime environment variables for the Go SDK.', ['orka.capabilities', 'orka.merchant', 'go.sdk'], 'orka-merchant-config'),
  g('Screens', ['Screens entity'], 'Entity mapping discrete UI layouts within a transaction flow relative to the device architecture (e.g. a cash-discount tender prompt).', ['orka.screens'], 'orka-screens-xytouch'),
  g('Screen Locations', ['Screen Locations entity', 'coordinates'], 'Entity mapping exact button placements as relative X/Y coordinates in millimetres.', ['orka.screens'], 'orka-screens-xytouch'),
  g('xy_touch', ['xy touch'], 'Orka REST endpoint: a script sends a screen name and button string; Orka looks up the mm coordinates and has the Pi fire an ADB touch or a physical probe tap.', ['orka.screens', 'orka.xytouch'], 'orka-screens-xytouch'),
  g('Card Profile', ['card profiles'], 'Entity for test cards: swipe profiles store raw Track Data in MySQL; dip and tap profiles store file paths into Gorth.', ['cards'], 'card-profiles'),
  g('Track Data', ['swipe profile'], 'Raw magnetic-stripe text stored directly in MySQL for swipe profiles, extracted with a hardware card-reader utility.', ['cards', 'cards.swipe'], 'card-profiles'),
  g('Dip & Tap profiles', ['dip profile', 'tap profile'], 'Card profiles storing file paths to card definitions in Gorth; a scheduled job clones them to the Windows boxes where Kallus loads them.', ['cards', 'cards.diptap'], 'card-profiles'),
  g('Scheduled clone', ['scheduled job', 'GorthCardSync'], 'Scheduled job that clones Gorth\'s card-definition files onto the local Windows boxes for Kallus. (The task name GorthCardSync is the sim\'s.)', ['cards', 'cards.kallus'], 'card-profiles'),
  g('Screen Compare Image', ['Screen Compare', 'screen comparison'], 'Entity for the Stand Duet workaround: CFD bounding coordinates plus expected text, checked by webcam screenshot → crop → Tesseract → boolean. Brittle; being phased out.', ['duet.ocr', 'orka.screencompare'], 'orka-screen-compare'),
  // ── config.properties ─────────────────────────────────────────────────────
  g('config.properties', ['config properties'], 'uia-relay\'s local run configuration, edited manually for local runs; Jenkins injects the values during CI.', ['uia.config'], 'config-properties'),
  g('runType', [], 'config.properties key; set to tethered for multi-device testing setups.', ['uia.config'], 'config-properties'),
  g('merchantFacingDeviceIp', [], 'config.properties key: the MFD terminal\'s local network IP. Same as the CFD IP on a Stand Duet.', ['uia.config'], 'config-properties'),
  g('customerFacingDeviceIp', [], 'config.properties key: the CFD terminal\'s local network IP. Same as the MFD IP on a Stand Duet.', ['uia.config'], 'config-properties'),
  g('serial', [], 'config.properties key: hardware serial number of the primary terminal.', ['uia.config'], 'config-properties'),
  g('deviceType', [], 'config.properties key: the target form factor (Micro, Flux, Stand), governing layout and scroll logic.', ['uia.config', 'uia.scroll'], 'config-properties'),
  g('theme', ['avocado'], 'config.properties key locked strictly to avocado; legacy theme toggles are deprecated.', ['uia.config'], 'config-properties'),
  g('kernelType', ['CPA', 'SPA'], 'config.properties key locked strictly to CPA (Core Payments Application), which replaces the legacy SPA (Secure Processor Application).', ['uia.config'], 'config-properties'),
  g('CPA', ['Core Payments Application'], 'Core Payments Application — the only allowed kernelType.', ['uia.config'], 'config-properties'),
  g('SPA', ['Secure Processor Application'], 'Secure Processor Application — the legacy kernelType replaced by CPA.', ['uia.config'], 'config-properties'),
  g('portNumber', ['5444'], 'config.properties key locked to 5444; the ADB default 5555 caused office collisions with coworkers\' desk devices.', ['uia.config', 'adb.port'], 'config-properties'),
  g('Port 5444', ['ADB port'], 'The TCP port lab LabSim devices use for ADB.', ['adb.port'], 'adb-port-5444'),
  g('Port 5555', ['ADB default port'], 'The standard ADB default port — never used for lab devices because it let scripts connect to and control coworkers\' desk devices.', ['adb.port'], 'adb-port-5444'),
  // ── uia-relay ────────────────────────────────────────────────────────────
  g('app/src/main', ['main'], 'uia-relay folder reserved for production / application registration code. QA engineers never modify it.', ['uia.pom', 'uia.layout'], 'uia-relay-structure'),
  g('app/src/test', ['test folder'], 'uia-relay folder with local unit tests and the multi-device execution runner scripts.', ['uia.pom', 'uia.layout', 'uia.multidevice'], 'uia-relay-structure'),
  g('app/src/androidTest', ['androidTest'], 'uia-relay folder of instrumented tests that run on Android hardware, split into databases, pageobjects and testactions.', ['uia.pom', 'uia.layout'], 'uia-relay-structure'),
  g('databases', ['databases package'], 'androidTest package for database connection and query logic.', ['uia.pom', 'uia.packages'], 'uia-relay-structure'),
  g('pageobjects', ['pageobjects package'], 'androidTest package holding the Page Object Model classes for device screens.', ['uia.pom', 'uia.packages'], 'uia-relay-structure'),
  g('testactions', ['testactions package'], 'androidTest package holding test classes and assertions that chain page-object methods.', ['uia.pom', 'uia.packages'], 'uia-relay-structure'),
  g('Page Object Model', ['POM', 'page object'], 'Pattern where every screen, pop-up or window has its own Java class extending BaseTest, with Zone 1 locators and Zone 2 helpers.', ['uia.pom'], 'uia-relay-pom'),
  g('BaseTest', [], 'Base class every screen class extends; provides global setup, teardown and instance variables.', ['uia.pom'], 'uia-relay-pom'),
  g('Zone 1 / Zone 2', ['Zone 1', 'Zone 2', 'Element Locators', 'Helper Methods'], 'The two parts of a screen class: Zone 1 element locators unique to the view; Zone 2 helper/action methods where device-specific behaviour is abstracted.', ['uia.pom'], 'uia-relay-pom'),
  g('waitForScreen()', ['waitForScreen'], 'Mandatory screen method that pauses execution until all UI elements finish rendering, so UI Automator never clicks unrendered buttons.', ['uia.pom', 'uia.sync'], 'uia-relay-pom'),
  g('isScreenPresent()', ['isScreenPresent'], 'Mandatory screen method returning a boolean: is that screen currently in focus?', ['uia.pom', 'uia.sync'], 'uia-relay-pom'),
  g('open(String appName)', ['open()'], 'HomeScreen helper that scrolls vertically on Flux devices and horizontally on Micro or Stand devices to open an app.', ['uia.pom', 'uia.scroll'], 'uia-relay-pom'),
  g('HomeScreen', [], 'The launcher page object. Every test starts explicitly from HomeScreen and a teardown forces the hardware back to it.', ['uia.pom', 'uia.taxtest'], 'tax-test'),
  g('Multi-device runner', ['MultiDeviceRunner', 'device handle'], 'The runner in app/src/test that targets methods sequentially across device handles (MFD runs X, CFD runs Y, loop) because UI Automator talks to one device at a time.', ['uia.pom', 'uia.multidevice'], 'uia-relay-structure'),
  g('Tax test', ['TaxTest'], 'The reference\'s tethered example: MFD_O1 adds Tax Item 5 and Review Order (Orka → Kallus loads a swipe card); CFD_O1 asserts subtotal, tax and total; MFD_O2 Pay and Charge; Step 4 finalises on the CFD.', ['uia.config', 'uia.taxtest'], 'tax-test'),
  g('MFD_O1 / CFD_O1 / MFD_O2', ['MFD_O1', 'CFD_O1', 'MFD_O2'], 'Tax test step labels: Merchant display step 1, Customer display step 1, Merchant display step 2.', ['uia.config', 'uia.taxtest'], 'tax-test'),
  // ── Parrot, receipts, logs ────────────────────────────────────────────────
  g('select print', ['"select print"'], 'Parrot step that often appears as the failure point in Jenkins logs — it was merely the last step before the runner timed out waiting for a printer payload, usually because stale coordinates made the arm miss Print.', ['parrot', 'jenkins.logs'], 'parrot-bottlenecks'),
  g('JSON linter', ['linter', 'no linter'], 'What Parrot lacks: there is no Parrot-aware linter. VS Code only checks raw JSON syntax, so missing commas or brackets still cost time and Parrot-specific mistakes only fail at run time; engineers copy-paste known-good JSON blocks.', ['parrot', 'parrot.nolint'], 'parrot-bottlenecks'),
  g('15-minute rule', ['ask after 15 minutes'], 'Team habit: spend at most 15 minutes stuck troubleshooting alone, then ask for help. Even veterans don\'t remember where every config lives.', ['lab.orientation', 'people.roles'], 'lab-tour'),
  g('Modular shelves', ['modular shelf'], 'The standardised shelf design from the lab\'s redesign about three years ago (replacing CNC-cut particle-board fixtures): a failed Duet 2 can be swapped for a Flux 3 in minutes.', ['lab.orientation', 'hw.print3d'], 'fabrication-and-bom'),
  g('Scan for receipt', ['receipt QR', 'QR code'], 'Receipt-screen QR feature that shifted buttons down a few millimetres (48 hours of broken coordinates until {{jaden}}\'s PR) and added a conditional 5th option.', ['orka.screens', 'receipt.qr'], 'receipt-qr-regression'),
  g('4-option / 5-option maps', ['receipt maps', 'RECEIPT_OPTIONS_4', 'RECEIPT_OPTIONS_5'], 'Separate receipt-screen coordinate maps Orka keeps for every device profile because the QR option is conditional. (The screen names are the sim\'s.)', ['orka.screens', 'receipt.maps'], 'receipt-qr-regression'),
  // ── Bots, cards, teams ────────────────────────────────────────────────────
  g('ADB bot', ['ADB-only bot'], 'Purely programmatic robot: cannot physically touch the screen or enter PINs; restricted to merchant configs that bypass PIN security.', ['orka.screens', 'bots.types'], 'adb-vs-physical-bots'),
  g('Physical bot', ['interactive bot', 'touch robot'], 'Robot with mechanical touch probes; required for Canadian payment workflows (physical PIN entry) and ADB-blind displays.', ['orka.screens', 'bots.types'], 'adb-vs-physical-bots'),
  g('Secure Touch', ['Secure Touch PIN entry'], 'The PIN-entry mode the Gen 2 Software PIN Bypass will handle in software instead of with robots.', ['orka.screens', 'bots.pin'], 'adb-vs-physical-bots'),
  g('Gen 2 Software PIN Bypass', ['Gen 2', 'software PIN bypass'], 'Framework being built with the Core OS Team to bypass physical robotics for Secure Touch PIN entry, reserving robots for non-negotiables like card dipping.', ['infra.ai', 'bots.pin'], 'adb-vs-physical-bots'),
  g('Interac', [], 'Canadian card network; your team adds an Interac profile for regional (Canadian) flows alongside its single Visa profile.', ['cards', 'cards.philosophy'], 'card-testing-philosophy'),
  g('Card matrix', ['back-to-back card matrix'], 'PayCrest\'s exhaustive back-to-back validations across Visa, Discover and AmEx.', ['cards', 'cards.philosophy'], 'card-testing-philosophy'),
  g('EMV', ['chip', 'chip dip'], 'Chip-card standard; Kollis probes simulate EMV chip dips (carried in by the dip arm on touch robots).', ['cards', 'hw.kollis'], 'kollis-probes'),
  g('NFC', ['contactless', 'Near Field Communication'], 'Contactless technology; Kollis probes simulate NFC taps.', ['cards', 'hw.kollis'], 'kollis-probes'),
  g('Magnetic stripe', ['mag stripe', 'swipe'], 'Card stripe read by swiping; Kollis probes simulate swipes, and swipe profiles store its raw Track Data.', ['cards', 'hw.kollis', 'cards.swipe'], 'kollis-probes'),
  g('Semi Team', ['Semi'], 'Historically developed third-party POS SDKs and the remote pay display apps (USB Pay Display, Secure Network Pay Display).', ['teams.history', 'uia.history'], 'teams-and-history'),
  g('Sedi Team', ['Sedi', 'Sedi (QA) Team'], 'The QA team that tested the Semi Team\'s apps using the Lister framework.', ['teams.history', 'uia.history'], 'teams-and-history'),
  g('IPX', ['Integrated Payment Experience'], 'Integrated Payment Experience Team; uia-relay is integrated with IPX to test Register, Orders, Authorizations, Sale, Transactions and Setup.', ['teams.history', 'uia.history'], 'teams-and-history'),
  g('PayCrest Team', ['PayCrest'], 'Adopted uia-relay for apps like LabSim Dining; runs exhaustive Visa/Discover/AmEx card matrices; its standalone rigs stay Unavailable.', ['teams.history', 'uia.history', 'cards.philosophy'], 'teams-and-history'),
  g('Core OS Team', ['Core OS'], 'Partner team for the Gen 2 Software PIN Bypass.', ['teams.history', 'bots.pin'], 'teams-and-history'),
  g('Contact Canada', [], 'Canadian automation scripts running on the Westerly test beds; they use dynamic and non-dynamic capability lookups interchangeably.', ['orka.capabilities'], 'orka-capabilities'),
  g('LabSim Dining', ['Dining'], 'Native LabSim app PayCrest tests with uia-relay.', ['teams.history', 'uia.history'], 'teams-and-history'),
  g('Register', ['Register app'], 'Native LabSim app; the Tax test opens it on the MFD to add Tax Item 5.', ['uia.config', 'uia.taxtest', 'uia.history'], 'tax-test'),
  // ── Acronyms & general ────────────────────────────────────────────────────
  g('OOBE', ['Out-of-Box Experience'], 'Out-of-Box Experience — the device setup flow Lazo Automation drives zero-touch.', ['orka.capabilities', 'lazo.oobe'], 'lazo-and-ubo'),
  g('OCR', ['Optical Character Recognition'], 'Optical Character Recognition; Tesseract runs it on cropped webcam screenshots of ADB-blind displays.', ['duet.ocr', 'vision.tesseract'], 'orka-screen-compare'),
  g('LLM', ['Large Language Model', 'Vision LLM'], 'Large Language Model; Ollama runs vision LLMs locally for the receipt proof of concept.', ['infra.ai', 'vision.ollama'], 'ollama-and-claude'),
  g('PoC', ['proof of concept'], 'Proof of concept — the status of the Ollama vision checks: useful, not a production gate.', ['infra.ai', 'vision.ollama'], 'ollama-and-claude'),
  g('REST', ['REST API'], 'HTTP API style used between the test runners and Orka (xy_touch, card actions) and by Orka\'s health pings to the Pis.', ['orka.status', 'arch.flow'], 'orka-overview'),
  g('Non-200 response', ['HTTP 200', 'non-200'], 'Any health-ping response other than HTTP 200 (e.g. 500, 502) — it triggers Connection Failed just like a dropped ping.', ['orka.status', 'orka.healthcheck'], 'orka-health-check'),
  g('Pull request', ['PR', 'coordinate PR'], 'GitHub change request; coordinate fixes land through PRs (e.g. {{jaden}}\'s PR that ended the receipt-QR breakage).', ['uia.pom', 'tools.github'], 'intellij-and-github'),
  g('Environment variables', ['env vars', 'DEVICE_TYPE'], 'Runtime variables Jenkins injects into pipelines; Device Type values must be ALL CAPS to match Orka\'s enum.', ['jenkins', 'jenkins.envvars'], 'jenkins-env-vars'),
  g('Famous-robot names', ['rig names', 'WALL-E', 'MEGATRON', 'OPTIMUS'], 'Every rig is named after a famous robot; Name is lower-case-kebab (wall-e), the tablet shows the caps Human Readable Name (WALL-E). The full 42-rig roster is the sim\'s.', ['lab.orientation', 'orka.names'], 'lab-tour'),
  g('DEV1 / STG', ['DEV1', 'STG'], 'Environment labels on the tethered test-bed screens (MEGATRON … DEV1, OPTIMUS … STG).', ['devices', 'hw.devices'], 'mfd-cfd-tethered'),
  g('Illustrative (sim only)', ['†', 'illustrative', 'sim only'], 'Badge on any detail LabSim invents because the reference is silent (IPs, job names, merchants, mm values). Never quote these as real-world facts.', ['lab.orientation'], 'illustrative-details'),
]);

/** Case-insensitive lookup by term or alias (exact match after trimming). */
const LOOKUP = new Map<string, GlossaryTerm>();
for (const t of GLOSSARY) {
  for (const k of [t.term, ...t.aliases]) {
    const key = k.trim().toLowerCase();
    if (!LOOKUP.has(key)) LOOKUP.set(key, t);
  }
}

export function glossaryLookup(termOrAlias: string): GlossaryTerm | undefined {
  return LOOKUP.get(termOrAlias.trim().toLowerCase());
}

/** Terms whose term/alias/definition contains `query` (case-insensitive), term matches first. */
export function glossarySearch(query: string): GlossaryTerm[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (t: GlossaryTerm) => [t.term, ...t.aliases].some((k) => k.toLowerCase().includes(q));
  return [...GLOSSARY.filter(hit), ...GLOSSARY.filter((t) => !hit(t) && t.definition.toLowerCase().includes(q))];
}
