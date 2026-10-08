# LabSim — Canon & Hard Constraints (read first)

This file fixes the decisions every other design doc and every implementer must share.
If another doc disagrees with this file, this file wins.

## Product
* **Title:** LabSim — LabSim Automation Lab (working title).
* **What it is:** a browser-based, first-person 3D training simulator. The player is a newly hired
  automation engineer on the LabSim automation team. They walk around a realistic electronics lab,
  operate touch robots, trace power, swap hardware, and sit at a workstation to use realistic
  simulations of Orca (Orchestrator), Jenkins, IntelliJ IDEA, a terminal (adb/ssh/git/curl/…),
  GIMP, GitHub, camera streams and Ollama.
* **Goal:** after finishing the game a player can walk into the real lab and do the job. Every fact in
  `docs/reference/REMOVED-internal-reference.md` must be *taught* (lesson), *practised* (hands-on
  task in the sim) and *tested* (quiz / arcade). Accuracy beats invention: where the reference is
  silent, invent plausible details but never contradict it, and mark invented details as
  "illustrative" in the Field Manual where a trainee might otherwise take them as fact.
* **Modes:** Academy (guided learning), Arcade (timed incident shifts + drills for repetition),
  Free Play (sandbox lab), Field Manual (searchable codex + flashcards with spaced repetition).
* **Fun matters:** satisfying robot animation & sound, timers, combos, ranks, achievements, robots
  with personality (they are named after famous robots).

## Tech constraints (fixed)
* Static website: **Vite + TypeScript (strict) + Three.js (r186)** for 3D, **React 19** for all 2D
  UI (HUD, menus, the in-game computer desktop and its apps), **zustand + immer** for game state.
  Post-processing via `postprocessing` + `n8ao`. No backend; progress saved to `localStorage`.
* **No external asset downloads at runtime and no binary model files.** All 3D geometry is built
  procedurally in code (BoxGeometry, ExtrudeGeometry, RoundedBox, Lathe, Tube, merged geometries,
  InstancedMesh) with PBR materials and procedurally generated canvas textures (labels, perforated
  steel, hex mesh, screen UIs). Audio is synthesised with WebAudio.
* Units: **1 world unit = 1 metre**. Y is up. Robot/screen coordinates in the simulation are
  **millimetres** relative to the device screen's top-left = (0,0) origin as calibrated by limit switches.
* In-game time: the sim has its own clock (`gameMinutes`). Default time scale 1 real second =
  1 game second, adjustable; Orca's health check runs every **5 game minutes** and the player can
  fast-forward or force a ping in some tutorial steps.
* Desktop browser first (keyboard + mouse, pointer lock). Must also run at ≥ 30 fps on an
  integrated GPU at "Low" quality.

## People (centralised — must stay renameable)
Real first names from the reference appear as in-game mentors. They live in ONE content file
(`src/content/team.ts`) so they can be anonymised before the repo goes public. Use they/them or the
name in all in-game text; never gendered pronouns.
* **Jared** — hardware/lab lead: builds rigs, calibrated the lab to true (0,0), merges coordinate PRs,
  receives "Connection Failed" hardware escalations.
* **Tate** — Orca developer: built the robot-list filtering UI and added App ID / App Secret / API Key
  to Merchant Config.
* **David** — oversees SDK frameworks and dynamic JSON capability lookups.
* **"The presenter" / uia-remote author** — in-game name **Morgan** (invented), your onboarding mentor
  who created uia-remote.

## Network & hosts (illustrative, consistent everywhere)
| Host | Address | Notes |
|---|---|---|
| GPU server blade (4× NVIDIA) | `10.42.1.5` | hosts the VMs below |
| Orca VM | `orca.lab.local` → `10.42.1.10:8080` | Spring Boot + MySQL (`orca` schema, port 3306) |
| Jenkins VM | `jenkins.lab.local` → `10.42.1.11:8080` | |
| Ollama | `10.42.1.12:11434` | vision model `llava` (illustrative) |
| Robot Pis | `10.42.10.<n>` | Robot Controller REST on `:8000`, camera MJPEG on `:8081/stream.mjpg` |
| Windows NUC / Minix (Callus) | `10.42.20.<n>` | Callus REST on `:9000` |
| LabSim devices | `10.42.30.<n>` | ADB over TCP on **5444** (never 5555) |
| Engineer workstation (you) | `10.42.50.17` | |
| Coworker desk devices | `10.42.60.<n>` | listen on ADB 5555 — the reason the lab uses 5444 |

## Robots (rig names = famous robots)
The Orca pool has **42 rigs**. Names (system name is lowercase-kebab, human readable is caps on the tablet):
WALL-E, EVE, MEGATRON, OPTIMUS, BUMBLEBEE, SOUNDWAVE, STARSCREAM, RATCHET, R2-D2, C-3PO, BB-8,
JOHNNY-5, BENDER, BAYMAX, ROSIE, MARVIN, ROBBY, HAL, K-9, DATA, BISHOP, ASH, SONNY, CHAPPIE, TARS,
CASE, ATLAS, ASTRO, IRON-GIANT, VOLTRON, KRYTEN, MAZINGER, JARVIS, ULTRON, VISION, DALEK, NUMBER-5,
GERTY, MOTHER, SETI, BRAINIAC, ZORG.
(Note: **Gort** is a repo name, not a rig, as a nod to the robot from *The Day the Earth Stood Still*.)
**12 rigs are physically modelled** in the 3D lab (the rest exist in Orca as rigs in other racks / off-screen):
WALL-E, EVE, BUMBLEBEE, R2-D2, JOHNNY-5, BAYMAX, SETI, ROSIE (touch robots), MEGATRON & OPTIMUS
(tethered MFD/CFD test beds as in the photo — environments DEV1 and STG), DATA & TARS (ADB-only bots).

## Device type enum (Orca `DeviceType`, ALL CAPS — this is why Jenkins env vars are all caps)
`STATION_2018, STATION_2, STATION_DUO, STATION_DUO_2, STATION_DUO_3, MINI_2, MINI_3, MINI_4,
FLEX_1, FLEX_2, FLEX_3, FLEX_4, FLEX_POCKET, COMPACT`.
Testing profiles: FLEX_3 / FLEX_4 / FLEX_POCKET share one profile (`FLEX_GEN3`), POCKET has
`hasPrinter=false`. MINI_3 is the hot-swap equivalent for printerless STATION_DUO_2. COMPACT is the
Canadian-market terminal used on Westers test beds. `deviceType` in config.properties uses the family
(`Mini`, `Flex`, `Station`).

## Visual reference
Photos in `docs/reference/images/` (see README there). Matte black 3D-printed PLA fixtures, black
perforated steel rack shelves, silver 2020 aluminium extrusion gantries, NEMA-17 steppers, blue push-pull
solenoids, white LabSim devices with dark glass screens, green LED strips, ribbon cables, braided sleeves,
red/blue parts bins, Husky tool chest, white walls, grey floor.
