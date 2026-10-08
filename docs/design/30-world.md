# LabSim — World, Art & Audio Specification

> **Doc:** `docs/design/30-world.md` · **Depends on:** `00-canon.md` (wins every conflict) and
> `docs/reference/REMOVED-internal-reference.md` (domain truth, cited **Ref §n**). Photo evidence is cited as
> **IMG-T** `walle-status-tablet-front.jpg`, **IMG-R** `tethered-megatron-optimus-rack.jpg`,
> **IMG-G** `touch-robot-side-gantry.jpg`, **VID** `solenoid-tapping-flex3.mp4` (+ `-frames.jpg`).
> **Consumers:** `src/world/**` (room, props, rigs, bindings), `src/render2d/**` (device screens, status tablet),
> `src/sim/devices/layouts.ts` (button rectangles — the layout tables in §4 ARE that file's data),
> `src/engine/**` (materials, textures, lighting, audio recipes, quality presets), missions (anchor and prop ids).
>
> **This doc owns:** where everything stands, the physical rig roster (which device sits in which bay), what every
> object looks like (mm-accurate), device-screen and tablet layouts (the "firmware truth" that touches hit), materials,
> lighting, post-processing, audio recipes, interaction verbs, performance budgets.
> **It does not own:** IP addresses, serials, host names, Orca rows (sim doc); lesson scripts (10-curriculum); incident
> rules, scoring, controls philosophy (20-gameplay). The world binds to sim objects by **id** (`RigState.id`,
> `Host.id`, `TerminalDevice.id`, `Fuse.id` …) and to props by `propId`, never by IP.

---

## 0. Conventions, decisions and cross-doc reconciliation

### 0.1 Conventions

| Topic | Rule |
|---|---|
| Units | World: metres (canon). Rig internals, devices, screens, tablet: **millimetres** (stated per table). 1 world unit = 1 m. |
| Axes / origin | Y up. Origin = centre of the lab floor. **+X = east, +Z = south** (so the north wall is at z = −5.00, the entrance wall at z = +5.00). |
| Prop rotation `rotY` | Degrees about +Y. `0` = the prop's front (its local +Z face) faces **south (+Z)**; `90` faces east; `180` faces north; `−90` faces west. Three.js: `object.rotation.y = rotY·π/180`. |
| Player / camera yaw | `0` = looking north (−Z, three.js camera default); positive yaw turns left (CCW seen from above): `90` = looking west. |
| Position columns | `(x, y, z)` = centre of the footprint at its **base** (floor props: y = 0; wall-mounted: y = centre height unless stated). |
| Footprint `W × D × H` | W along the prop's local X, D along local Z (front–back), H up. Metres unless the column says mm. |
| Prop ids | Lowercase, dot-separated, kebab-case segments: `<group>.<instance>[.<part>]` — e.g. `rack.a`, `rig.wall-e.tablet`, `power.fuse.5v-b`, `desk.player.chair`. Rig segments reuse the Orca system name (`wall-e`, `r2-d2`, `johnny-5`). All ids live in `src/world/layout.ts` (`PROP_IDS`); curriculum `prop.*` ids are aliases (§1.10, exported as `PROP_ALIASES`). |
| Location ids | `loc.*` exactly as listed in §1.3 (superset of 10-curriculum §0.5). |
| † | **Illustrative (sim-only) detail** — the reference is silent. Same meaning as `[illus.]` in 20-gameplay. Every † string a trainee could mistake for real-world truth is badged "Illustrative" in the Field Manual. |
| Colours | sRGB hex. Emissive intensities are in three.js units on top of the colour. |
| Fonts | Canvas only, system stacks (no downloads, canon): `UI_SANS = 'Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif'`; `UI_THIN` = same stack at weight 300 (clock digits); `LABEL = '"Arial Narrow", Arial, "Helvetica Neue", sans-serif'` weight 700 (label-maker tape); `MONO = '"DejaVu Sans Mono", Menlo, Consolas, monospace'`. |
| People | Never gendered pronouns; names come from `src/content/team.ts` (canon). Signs/labels never contain real surnames. |

### 0.2 Decisions this doc makes (binding for world; other docs align)

| # | Decision | Why / what other docs must do |
|---|---|---|
| D1 | **Physical roster = 10-curriculum §0.4 device assignments** (see §2.10). Rack A: WALL-E (Flex 3), EVE (Flex 4), R2-D2 (Station Duo), BUMBLEBEE (Mini 3). Rack B: JOHNNY-5 (Flex 1 → Flex 2), SETI (Compact), BAYMAX (Station 2018), ROSIE (Flex Pocket). Tethered: MEGATRON (MFD Station 2 + CFD Mini 2, DEV1), OPTIMUS (MFD Mini 3 + CFD Mini 3, STG). ADB: DATA (Mini 3), TARS (Flex 4). | Lessons are written against these devices; 20-gameplay §3.1 says the world doc owns placement and incidents bind by role tag. Role-tag remap in §0.3. |
| D2 | **Power topology (physical):** wall 120 V AC → one Mean Well `MW-1` (LRS-600-24) → central **24 V DC rail** (bus bar on the power wall) → step-down regulators on the power wall: `REG-12V` (label "12V DC · NUC") and three `REG-5V-A/-B/-C` (label "5V DC · 10A") → inline rack fuses `F-12V`, `F-5V-A`, `F-5V-B`, `F-5V-C` → cable tray → rack-top 5 V distribution block → per-bay **MAIN** switch → per-bay inline fuse `F-<RIG>-5V` → Raspberry Pi. 24 V also runs (unfused branch, per rack) to each bay's **MOTOR** switch → motor PCB. LabSim devices and Collis probes use their own AC bricks on commercial AC strips (Ref §6). | Satisfies both curriculum M03 (rack-level "Rack B 5V fuse" on the power wall) and gameplay INC03 (per-rig fuse after MAIN, multimeter chain 24 V → 5.08 V → 0 V). Gameplay's `MW-A/MW-B` both map to `MW-1` ("central 24V DC rail", Ref §6). |
| D3 | **Fuse hardware:** ATO blade fuses in black inline holders with a smoked translucent cap; every holder carries a white tape label with its id and rating. All 5 V and 12 V fuses are **10 A (red)**†. Spare tray holds 5 A tan, 7.5 A brown, 10 A red, 15 A blue. | Matches 20-gameplay GW04 ("10 A red", holder label "10A"). |
| D4 | **Cameras:** every touch bay has its own gooseneck webcam (IMG-T/IMG-G). Rack B's four bay webcams are wired to one **Rack B camera Pi** that serves a 2×2 mosaic (the reference's "shared across 4 rigs"). The tethered rack has one bench webcam; the ADB shelf has one webcam; the tethered Pi can serve those two as a 1×2 mosaic. Which Orca URL points at which stream is sim data. | Supports curriculum (Rack B shared, MEGATRON/OPTIMUS shared) and gameplay CAM-A (four rigs on one stream) — Appendix B. |
| D5 | **Tablet status strings** are rendered from `RigState.tablet.statusText`. Recommended values: green `OK`; yellow after a manual push `LOCK RELEASED — PARK REQUIRED` (curriculum S13); yellow after Steppers Enable / MOTOR restored `NOT HOMED — PARK REQUIRED`†; grey `Controller unreachable` (gameplay); red `FAULT — <reason>`†. Lockout overlay line 1 `TEST IN PROGRESS — CONTROLS LOCKED` (curriculum S13), line 2 `<job> #<n>` (gameplay). | 20-gameplay's `MANUAL MOVE — PARK REQUIRED` should be replaced by the two strings above. |
| D6 | **Station 2 look†:** the reference never describes a Station 2. Following the reference's example "a Station 2 tethered to a Mini 2" and curriculum's MEGATRON roster, the photo's **MEGATRON MFD** face (8-inch white bezel, `lab` wordmark, IMG-R) *is* the Station 2 display head. In the device library it sits on a white Station base with printer. | Keeps IMG-R exact (four equal 8-inch faces) and the roster intact. Field Manual badges the Station 2 look as illustrative. |
| D7 | **Device orientation in touch rigs:** screen face-up and **level**, top edge toward the back of the bay, chip-slot edge toward the front (dip arm just behind the fascia, IMG-T). Screen +x → bay +X (player's right), screen +y → toward the player (+Z). Gantry home (0,0) = screen top-left = the rear-left corner of the screen; limit switches are slid along the extrusions to that point per rig (Jared's true-(0,0) calibration, Ref §3). | Screens read upright to a player looking down into a lower bay; the tethered/ADB screens face the aisle. |
| D8 | WALL-E's right-hand fascia panel reads **`SETI`** with USB ports labelled `Minix` / `Raspberry Pi`, exactly as IMG-T. Fascia panels get re-used between rigs†; only SETI's own fascia also reads `SETI`. All other rigs' side panels are blank (ports only). | Curriculum M01 step 10 inspects `prop.seti-panel` to the right of WALL-E's tablet. Field Manual note: "identify a rig by its tablet header, never by its side panel"†. |
| D9 | **Interaction keys used by world verbs:** `E` primary (also left-click), `R` secondary, `G` tertiary, hold-`E` for long presses, LMB-drag for draggables. World **never binds `F` or `Q`** (20-gameplay uses them for flashlight / holster). Hold-RMB inspect is engine-global. | `InteractVerb.key` already allows E/R/G; add an optional `holdMs` (§9.1). |
| D10 | Hand-held multimeter spawns on the **power bench** (M03 "grab the multimeter" at the power wall); the steel ruler spawns on **your desk** and M09's setup moves it to `anchor.ruler.rack-a`. Spare fuses: power-bench fuse tray **and** the red parts bin. Spare Flex 2 / Mini 3 in Husky drawers 2 / 3; legacy Flex 1 and the spare Collis probe in the locked storage cabinet. | Merges 10-curriculum and 20-gameplay item locations. |
| D11 | **Callus shelf** stands between Rack A and Rack B and holds the Collis probes (one per touch bay, beside its bay, rear ribbon going straight into the bay — "Collis probe box on the right shelf", IMG-G) plus four Windows box slots: `MINIX-01`, `MINIX-02`, `NUC-03`, and a spare slot (`NUC-01`/`MINIX-03` when the sim seeds them). | Curriculum `loc.callus-shelf`; gameplay MINIX-03/NUC-01 roles. |
| D12 | Touch-rig **Lower/Raise** = slow solenoid stroke (curriculum M04 step 8). If the sim also stores `solenoid.heightAdjustMm`, the world adds it to the head's rest height. | Both interpretations render correctly. |

### 0.3 Role-tag remap for 20-gameplay §3.1

| Gameplay role tags | Gameplay default rig | Physical rig in this doc |
|---|---|---|
| touch, collis, flexgen3, printer | WALL-E | **WALL-E** (Flex 3) |
| touch, collis, mini | EVE | **BUMBLEBEE** (Mini 3) |
| touch, collis, flex-legacy, printer (spare Flex 2 in Husky drawer 2) | BUMBLEBEE | **JOHNNY-5** (Flex 1, upgraded to Flex 2 in curriculum M07 = INC42) |
| touch, duo, ocr | R2-D2 | **R2-D2** (Station Duo) |
| touch, collis, canada, physical-pin | JOHNNY-5 | **SETI** (Compact) |
| touch, collis, paycore (Unavailable) | BAYMAX | **ROSIE** (Flex Pocket) |
| touch, collis, flexgen3, printerless | SETI | **ROSIE** (Flex Pocket); incidents that need it Available set that in their setup |
| touch, build (Offline) | ROSIE | **BAYMAX** (Station 2018; curriculum M06 sets it Offline) |
| legacy-nuc-motion | EVE | **EVE** (Flex 4); its `EVE MOTION` USB lead runs to the Callus-shelf spare slot when NUC-01 is seeded |
| tethered dev1 / stg | MEGATRON / OPTIMUS | same |
| adb-only, printerless / adb-only, flexgen3, printer | DATA / TARS | **DATA** (Mini 3) / **TARS** (Flex 4) |
| shared camera ×4 (CAM-A) | MEGATRON's Pi | `cam.rack-b-mosaic` (JOHNNY-5, SETI, BAYMAX, ROSIE) **or** `cam.bench-mosaic` (MEGATRON, OPTIMUS, DATA, TARS) — sim picks |
| AC strips `STRIP-A/B/C` | racks | `power.strip.a`, `power.strip.b`, `power.strip.c1`+`c2` (Callus shelf), plus `power.strip.t`, `power.strip.d`, `power.strip.w` (§1.4) |

### 0.4 Where the data lives

| File | Exports (data from this doc) |
|---|---|
| `src/world/layout.ts` | `ROOM`, `LOCATIONS` (§1.3), `PROPS` (§1.4 rows: id → pos/rotY/size), `RACKS`, `BAYS` (§2.1), `RIGS` (§2.10), `TETHERED` (§2.12), `CAMERAS` (Appendix B), `LIGHTS` (§7.1), `SPAWNS`/`NPC_ANCHORS` (§1.9), `PROP_ALIASES` (§1.10), `TRAYS` (§1.6). |
| `src/world/lab/*.ts` | `room.ts`, `entrance.ts`, `desks.ts`, `fab.ts`, `server.ts`, `powerWall.ts`, `jaredBench.ts`, `westWall.ts`, `library.ts`, `decor.ts`, `overhead.ts`, `npcs.ts`. |
| `src/world/rigs/*.ts` | `rack.ts`, `bay.ts`, `gantry.ts`, `dipTap.ts`, `fascia.ts`, `electronics.ts`, `devices/*.ts` (one builder per family), `tethered.ts`, `adbShelf.ts`, `callusShelf.ts`, `bind.ts` (state → transforms/LEDs/textures). |
| `src/sim/devices/layouts.ts` | §4 tables (button rectangles in mm per layout class). Both `render2d` and the sim's hit-testing read it. |
| `src/render2d/*.ts` | `deviceScreens/*.ts` (§4 drawing), `tablet.ts` (§5), `receipt.ts`, `shared/theme.ts` (§4.1 palette), `shared/labLogo.ts`. |
| `src/engine/textures/*`, `materials.ts`, `audio/*`, `quality.ts` | §6, §8, §7.4 — existing names kept, additions listed. |

---
## 1. Lab floor plan

### 1.1 Room shell

| Element | Spec |
|---|---|
| Lab interior | x −7.00 … +7.00, z −5.00 … +5.00, floor y 0.00, ceiling y 3.00 (suspended). 14 m × 10 m × 3 m. |
| Walls | 0.15 m thick outside the interior box. Paint `wallPaint` (#ecebe7 eggshell). 0.10 m black rubber cove base (#1b1b1b, rough 0.85). No windows. |
| Floor | 305 × 305 mm VCT, light grey speckle (§6.2 `floorTiles`), grout lines faint. Under the rack row a 1.60 × 1.20 m grey anti-fatigue mat (decor). |
| Ceiling | 600 × 600 mm fissured tiles in a white T-bar grid. Grid lines at x = k·0.6 and z = k·0.6 (k integer) → tile centres at 0.3 + k·0.6; border tiles are cut at the walls. 12 LED troffers (600 × 1200) — §1.7. |
| Column | `room.column`: white drywall column 0.50 × 0.50 × 3.00 at (1.70, 0, −2.05). It is the white wall on the left of IMG-R. |
| Entrance | `door.lab` in the south wall, opening x 5.44–6.36 (0.915 m leaf, 2.10 m high), hinge on the east jamb (x 6.36), swings into the lab (toward −Z) up to 95°, door closer. Vision panel 0.10 × 0.80 m (y 1.10–1.90) on the latch side so Morgan can wave through it (20-gameplay M00). |
| Corridor (outside) | `corridor.shell`: x 3.40–8.40, z 5.15–7.15, ceiling 2.70, beige walls #d8d3c8, vinyl-plank floor #9b8f80, one 600×600 LED panel, both corridor ends closed by non-interactive doors. Spawn point for a new game. |

### 1.2 Top-down map

Scale: 1 character = 0.25 m in X, 1 row = 0.50 m in Z. North (z = −5) is at the top.

```
 -7      -5      -3      -1  0   1       3       5       7      x (m)
+--------------------------------------------------------+   north wall
|FFFFFFFFFF SSSSS t PPPPPPPPPPPPP JJJJJJJJJJJJHHHH  LLLLL| z=-5.0
|ffffffffff sssss   ppppppppppppp jjjjjjjjjjjj           |
|                 (rear aisle, 1.8 m)                    |
|W                                                       |
|W                                                       | z=-3.0
|W               AAACCBBB     DDDDD##TTT                 |
|W               AAACCBBB     DDDDD##TTT                 |
|W               ^^^^^^^^  fronts z=-1.60                |
|R                          c                          VV|
|R                                                     VV|
|R      XXXXXXX                                        VV| z= 0.0
|p      XXXXXXX                                        VV|
|p                                                     VV|
|p                                                       |
|p                                                       | z=+2.0
|p                                                       |
|                                                      KK|
|                                                      KK|
|   c      c             c       c                  E    |
|11111112222222       MMMMMMM YYYYYYYbbhhhhhhhhhh        | z=+4.5
+--------------------------------------------------DOOR--+   south wall
                                                 corridor (x 3.4–8.4, z 5.15–7.15), spawn.new-game
```

| Glyph | Prop / zone | Glyph | Prop / zone |
|---|---|---|---|
| F f | `bench.fab` — Prusa MK4, Bambu Lab, CAD laptop, filament rack (print corner) | A | `rack.a` touch robots WALL-E, EVE, R2-D2, BUMBLEBEE (side doors on the **west** face) |
| S s | `shelf.server` — 4-GPU blade, switch, UPS | C | `shelf.callus` — Collis probes, MINIX-01/02, NUC-03, spare slot |
| t | `server.tower` (retired legacy tower) | B | `rack.b` touch robots JOHNNY-5, SETI, BAYMAX, ROSIE (side doors on the **east** face) |
| P p | `wall.power` board + `bench.power` | D | `shelf.adb` — DATA, TARS |
| J j | `bench.jared` + `wall.bins` + `wall.drawers` | # | `room.column` |
| H | `chest.husky` | T | `rack.t` tethered bench MEGATRON (DEV1) / OPTIMUS (STG) |
| L | `cabinet.storage` (locked lower, open upper) | c | chairs; `cart.tools` at (−0.20, −0.70) |
| W | `wall.whiteboard` | R | `wall.roadmap` |
| p (west) | posters `poster.esd/pool/5444` | X | `table.build` (half-built rig) |
| VV | `shelf.device-library` + family trays | KK | `counter.coffee` |
| 1 / 2 | `desk.coworker-1` (Sam†, desk Flex :5555) / `desk.coworker-2` (Riley†, desk Mini :5555) | M | `desk.morgan` |
| Y | `desk.player` (your workstation) | bb | trash + recycling |
| h | `wall.history` (frames + match plaques) | E | `spawn.entrance` |

Aisle widths (clear floor): rear aisle 1.80 m (z −4.40 … −2.60); rack-front aisle ≥ 2.0 m; Rack A west door swing clear to x −3.80; Rack B east door swing clear to x −0.20 (ADB shelf starts at x 0.35); tethered front aisle 2.0 m; desk row back-of-chair aisle ≥ 1.2 m.

### 1.3 Location anchors (`engine.registerLocation`)

`center` is on the floor; walk-to steps use the marker = `center` (curriculum: success within 1.5 m).

| Id | Name (HUD) | center (x, y, z) | radius (m) | What is there |
|---|---|---|---|---|
| `loc.corridor` | Corridor | (5.90, 0, 6.15) | 1.5 | New-game spawn, badge reader |
| `loc.entrance` | Lab entrance | (5.90, 0, 3.90) | 1.2 | Inside the door, clock, first-aid |
| `loc.workstation` | Your workstation | (1.10, 0, 3.85) | 1.0 | `desk.player` |
| `loc.morgan-desk` | Morgan's desk | (−0.90, 0, 3.85) | 1.0 | `desk.morgan` |
| `loc.coworker-desks` | Office desks | (−5.20, 0, 3.80) | 1.8 | coworker desks + desk devices on ADB 5555 |
| `loc.rack-a` | Touch Rack A | (−2.60, 0, −1.15) | 1.0 | WALL-E (bay 4), EVE (3), R2-D2 (2), BUMBLEBEE (1) |
| `loc.callus-shelf` | Callus shelf | (−2.00, 0, −1.15) | 0.6 | Collis probes, MINIX-01/02, NUC-03 |
| `loc.rack-b` | Touch Rack B | (−1.40, 0, −1.15) | 1.0 | JOHNNY-5 (4), SETI (3), BAYMAX (2), ROSIE (1) |
| `loc.rear-aisle` | Rack row (rear) | (−1.70, 0, −3.50) | 1.2 | Pis, fuses, AC strips at rack rears |
| `loc.adb-shelf` | ADB bot shelf | (0.85, 0, −1.15) | 0.9 | DATA, TARS |
| `loc.rack-tethered` | Tethered rack | (2.40, 0, −1.05) | 1.0 | MEGATRON / OPTIMUS (IMG-R) |
| `loc.power-wall` | Power wall | (−0.70, 0, −3.90) | 1.3 | Mean Well, 24 V rail, regulators, fuses, AC strip, DC taps |
| `loc.server-shelf` | Server shelf | (−3.70, 0, −3.90) | 1.0 | GPU blade, switch, retired tower |
| `loc.print-corner` | 3D print corner | (−5.75, 0, −3.75) | 1.3 | Prusa, Bambu Lab, CAD laptop |
| `loc.jared-bench` | Jared's bench | (2.70, 0, −3.75) | 1.3 | soldering, scope, bolt bins, red/blue bins, drawers |
| `loc.husky` | Husky chest | (4.80, 0, −4.00) | 0.7 | spare devices (drawers 2, 3) |
| `loc.storage` | Storage cabinet | (6.42, 0, −4.00) | 0.7 | locked spares, legacy Flex 1 |
| `loc.whiteboard` | Whiteboard | (−6.10, 0, −1.80) | 1.4 | architecture diagram + roadmap board |
| `loc.build-table` | Build table | (−4.40, 0, 1.55) | 1.2 | half-built rig, 10 ft extrusion |
| `loc.device-library` | Device library | (6.10, 0, 0.30) | 1.3 | one of every device + family trays |
| `loc.coffee` | Coffee | (6.10, 0, 3.35) | 0.8 | coffee machine |
| `loc.history-wall` | Team history wall | (3.75, 0, 4.10) | 1.2 | frames + match plaques |

### 1.4 Zone and prop placement

All floor props carry a collider = footprint AABB + 0.02 m (exceptions in §1.8). Child props of benches/desks list world positions (y = the surface they stand on).

**Entrance & corridor**

| Id | Description | Position (x, y, z) | W × D × H (m) | rotY |
|---|---|---|---|---|
| `door.lab` | Steel frame #8d9196, leaf #c9ccd0, lever handle, closer arm, vision panel (glass `glassClear`) | frame (5.90, 0, 5.00); hinge x 6.36 | leaf 0.915 × 0.045 × 2.10 | 180 |
| `door.badge-reader` | Black reader 50 × 18 × 90 mm, LED ring red → green, corridor side | (5.28, 1.15, 5.17) | — | 0 |
| `door.exit-button` | Green "PUSH TO EXIT" plate 70 × 115 mm, inside | (5.28, 1.15, 4.99) | — | 180 |
| `corridor.sign` | Room plate `AUTOMATION LAB · 3.14†` / `AUTHORIZED PERSONNEL ONLY` | (6.62, 1.55, 5.17) | 0.30 × 0.01 × 0.20 | 0 |
| `corridor.extinguisher` | Red 2.3 kg extinguisher on bracket | (4.10, 0.55, 5.20) | Ø 0.12 × 0.45 | 0 |
| `wall.light-switch` | Double white rocker (Free Play only) | (5.28, 1.20, 4.99) | 0.07 × 0.01 × 0.115 | 180 |
| `wall.first-aid` | White box, green cross | (6.98, 1.40, 4.35) | 0.30 × 0.10 × 0.25 | −90 |
| `wall.extinguisher` | Red extinguisher | (6.92, 0.55, 4.70) | Ø 0.12 × 0.45 | −90 |
| `wall.clock` | Analog Ø 0.30, white face, black hands, red seconds; shows `lab.time` | (1.10, 2.35, 4.985) | — | 180 |

**Workstations (south wall)** — desks 1.60 × 0.75 × 0.74, grey laminate #c9c7c1, black steel frame, modesty panel, rotY 180 (the user sits on the north side facing the wall).

| Id | Description | Position | Size | rotY |
|---|---|---|---|---|
| `desk.player` | Your desk | (1.10, 0, 4.625) | 1.60 × 0.75 × 0.74 | 180 |
| `desk.player.monitor-l` / `-r` | 24" 16:9 monitors: bezel 0.545 × 0.325 × 0.020, active 0.531 × 0.299, stand base 0.22 × 0.18, screen centre y 1.08. Both show the desktop mirror (§3.6) | (0.80, 0.74, 4.80) / (1.40, 0.74, 4.80) | — | 168 / 192 |
| `desk.player.computer` | PC tower, black, blue power LED, sticker `WS · 10.42.50.17` | (1.72, 0, 4.70) | 0.20 × 0.42 × 0.45 | 180 |
| `desk.player.keyboard` | Full-size keyboard (keycap atlas) | (1.10, 0.74, 4.47) | 0.44 × 0.135 × 0.025 | 180 |
| `desk.player.mouse` | Mouse on a 0.25 × 0.21 pad | (1.45, 0.74, 4.47) | 0.065 × 0.115 × 0.038 | 180 |
| `desk.player.phone` | Desk IP phone (wedge), handset, 2.8" screen `x4117†  09:00`, red message LED | (0.48, 0.74, 4.62) | 0.21 × 0.20 × 0.09 | 160 |
| `desk.player.mug` | White ceramic mug, green four-leaf logo, coffee fill 0–1 | (1.76, 0.74, 4.50) | Ø 0.085 × 0.095 | — |
| `desk.player.sticky-notes` | 3 yellow notes 76 × 76 mm (§6.3) — 2 on the left monitor's lower bezel, 1 on the desk | monitor-l bezel; (0.95, 0.741, 4.40) | — | — |
| `desk.player.card-reader` | USB magstripe reader (INC55 utility) | (0.62, 0.74, 4.44) | 0.10 × 0.04 × 0.035 | 180 |
| `desk.player.chair` | Black mesh office chair, seat 0.47, 5-star base | (1.10, 0, 4.02) | 0.62 × 0.62 × 1.05 | 0 |
| `tool.ruler` | 150 mm steel rule (spawn; see D10) | (0.72, 0.745, 4.38) | 0.150 × 0.018 × 0.0008 | 90 |
| `desk.morgan` | Laptop (open) + one 24" monitor + generic boxy toy robot + small plant | (−0.90, 0, 4.625) | as desk | 180 |
| `desk.morgan.chair` | Chair | (−0.90, 0, 4.02) | — | 0 |
| `desk.coworker-1` | Two monitors, headphones | (−6.10, 0, 4.625) | as desk | 180 |
| `desk.coworker-1.device` | Flex on a white charging dock, screen on (Register) — ADB 5555 desk device (curriculum `prop.coworker-device`) | (−6.45, 0.74, 4.55) | dock 0.11 × 0.09 × 0.05 | 160 |
| `desk.coworker-2` | One monitor, mug | (−4.30, 0, 4.625) | as desk | 180 |
| `desk.coworker-2.device` | 8" Mini on the desk (Riley's, gameplay INC27) | (−3.95, 0.74, 4.62) | — | 200 |
| `desk.coworker-1.chair` / `-2.chair` | Chairs | (−6.10, 0, 4.02) / (−4.30, 0, 4.02) | — | 0 |
| `bin.trash` / `bin.recycle` | Grey / blue bins | (2.20, 0, 4.78) / (2.50, 0, 4.78) | Ø 0.30 × 0.40 | — |
| `poster.lab` | Landscape poster `KEEP THE RIGS GREEN` (§6.4) | (−2.60, 1.60, 4.99) | 0.91 × 0.61 | 180 |

**Rack row (centre north)**

| Id | Description | Position | Size | rotY |
|---|---|---|---|---|
| `rack.a` | 42U open 4-post rack, touch robots (§2) | (−2.60, 0, −2.10) | 0.60 × 1.00 × 2.00 | 0 |
| `shelf.callus` | 4-post perforated shelf aligned with the bays (§2.14) | (−2.00, 0, −2.10) | 0.60 × 1.00 × 1.95 | 0 |
| `rack.b` | 42U open 4-post rack, touch robots | (−1.40, 0, −2.10) | 0.60 × 1.00 × 2.00 | 0 |
| `shelf.adb` | 2-tier black perforated shelf (§2.13) | (0.85, 0, −1.90) | 1.00 × 0.60 × 1.05 | 0 |
| `rack.t` | Tethered bench rack (IMG-R, §2.12) | (2.40, 0, −2.05) | 0.60 × 0.90 × 1.80 | 0 |
| `cart.tools` | Black 3-tier utility cart: open laptop (terminal screen decor), label tape, zip-tie bag, cable coil | (−0.20, 0, −0.70) | 0.75 × 0.45 × 0.95 | 20 |
| `anchor.ruler.rack-a` | Ruler spot used by M09 setup (front lip of Callus level 3) | (−2.00, 0.995, −1.63) | — | 0 |

**Power wall (north wall, x −2.20 … 0.80)** — board layout in §1.5.

| Id | Description | Position | Size | rotY |
|---|---|---|---|---|
| `wall.power` | Plywood backboard painted #c9cbc7, 25 mm black edge trim, y 0.95–2.25 | (−0.70, 1.60, −4.985) | 3.00 × 0.019 × 1.30 | 0 |
| `bench.power` | ESD laminate #9aa3a8 top, black frame, under-shelf at 0.20 | (−0.70, 0, −4.70) | 3.00 × 0.60 × 0.90 | 0 |
| `tool.multimeter` | Hand-held DMM in yellow holster, probes coiled (pickup → hotbar 2) | (−1.60, 0.90, −4.55) | 0.09 × 0.18 × 0.05 | 0 |
| `power.fuse-tray` | Clear-lid compartment box: 6 × 5 A tan, 6 × 7.5 A brown, 6 × 10 A red, 6 × 15 A blue | (−1.25, 0.90, −4.55) | 0.20 × 0.12 × 0.03 | 0 |
| `power.bench.flex4-psu` | New Flex 4 power brick (white, 18 V AC brick, 1.8 m cord) | (−0.30, 0.90, −4.60) | 0.110 × 0.060 × 0.032 | 15 |
| `power.bench.collis-spare` | Spare Collis probe (grey, UL label) + its AC brick | (0.20, 0.90, −4.60) | 0.15 × 0.11 × 0.045 | 0 |
| `power.bench.desk-fan` | Desk fan (stored; gameplay INC17 moves it onto STRIP-B) | (0.55, 0.20, −4.70) | 0.25 × 0.15 × 0.32 | 0 |

**Server shelf & print corner (north-west)**

| Id | Description | Position | Size | rotY |
|---|---|---|---|---|
| `shelf.server` | Black wire shelving, tier top surfaces at 0.12, 0.62, 1.10, 1.62 | (−3.70, 0, −4.70) | 1.20 × 0.60 × 1.80 | 0 |
| `server.blade` | Open-top 4-GPU blade chassis (§3.7). GPUs 1–2 on top; GPUs 3–4 hang **below** the 1.10 tier through a cutout (lowest point y 0.93) — visible only when crouched | (−3.70, 1.10, −4.72) | 0.80 × 0.45 × 0.12 | 0 |
| `server.switch` | 24-port 1U switch, port LEDs, patch cables to tray | (−3.70, 1.62, −4.75) | 0.44 × 0.21 × 0.044 | 0 |
| `server.ups` | Small UPS, green LED | (−3.95, 0.12, −4.75) | 0.15 × 0.40 × 0.22 | 0 |
| `server.tower` | Retired beige-grey tower; tag `RETIRED — replaced by GPU blade` (curriculum M17) | (−2.75, 0, −4.72) | 0.20 × 0.45 × 0.45 | 0 |
| `poster.network` | `LAB NETWORK` host map (§6.4) | (−3.70, 2.30, −4.985) | 0.61 × 0.46 | 0 |
| `bench.fab` | Birch-laminate bench, black legs, lower shelf 0.25 | (−5.75, 0, −4.625) | 2.40 × 0.75 × 0.90 | 0 |
| `fab.printer-prusa` | Prusa MK4-style bed-slinger: black frame, orange printed parts, 3.5" LCD + knob, spool on top holder | (−6.40, 0.90, −4.65) | 0.50 × 0.55 × 0.62 | 0 |
| `fab.printer-bambu` | Bambu Lab enclosed CoreXY: dark grey shell, glass door, front screen; AMS unit on top | (−5.60, 0.90, −4.68) | 0.39 × 0.41 × 0.71 | 0 |
| `fab.laptop-cad` | Laptop, lid 110°, CAD view of a cradle built from boxes/cylinders | (−4.95, 0.90, −4.55) | 0.34 × 0.24 | 20 |
| `fab.filament-rack` | Wall rack, 2 rows × 4 spools Ø 200 × 70 mm (5 black, 1 grey, 1 white, 1 green) | (−6.20, 1.60, −4.89) | 1.30 × 0.22 × 0.70 | 0 |
| `fab.parts-bin` | Clear bin of black printed fixtures incl. `fab.spare-cradle` (INC59) | (−5.10, 0.90, −4.75) | 0.30 × 0.20 × 0.12 | 0 |
| `fab.drybox` | Filament dry box under the bench | (−6.20, 0.25, −4.70) | 0.40 × 0.25 × 0.25 | 0 |
| `wall.safety-card` | Acrylic holder with `LAB SAFETY CARD` cards (curriculum S18) | (−6.985, 1.35, −3.75) | 0.12 × 0.03 × 0.17 | 90 |

**Jared's bench, parts wall, Husky, storage (north-east)**

| Id | Description | Position | Size | rotY |
|---|---|---|---|---|
| `bench.jared` | Butcher-block top, grey-blue ESD mat (#5f7686, 1.20 × 0.60) on the left, 2 under-bench drawers | (2.70, 0, −4.625) | 3.00 × 0.75 × 0.90 | 0 |
| `jared.solder` | Soldering station (red/black, 7-seg `350`), iron in coil stand, brass sponge | (1.70, 0.90, −4.55) | 0.16 × 0.13 × 0.10 | 0 |
| `jared.magnifier-lamp` | Articulated lamp, ring LED (warm white emissive) | (1.40, 0.90, −4.85) | reach 0.6 | 0 |
| `jared.half-pcb` | Motor PCB in a third-hand tool, half soldered | (1.55, 0.90, −4.45) | 0.10 × 0.07 | 0 |
| `jared.scope` | Bench oscilloscope, 7" screen with an animated square/sine trace | (2.30, 0.90, −4.75) | 0.32 × 0.13 × 0.16 | 0 |
| `jared.bench-psu` | Bench PSU, readout `24.0V 0.35A` | (2.75, 0.90, −4.78) | 0.13 × 0.24 × 0.16 | 0 |
| `jared.bench-dmm` | Bench DMM (not a pickup) | (3.05, 0.90, −4.78) | 0.22 × 0.26 × 0.09 | 0 |
| `jared.bolt-bins` | Two bins labelled `2.5 mm` / `5 mm` + magnetic tray with 10 mixed bolts (curriculum M04 sorter) | (3.30, 0.90, −4.48) | 0.30 × 0.10 × 0.05 | 0 |
| `jared.label-maker` | Label maker (Build Day) | (3.65, 0.90, −4.50) | 0.07 × 0.20 × 0.05 | 30 |
| `jared.wire-spools` | Dispenser rod, 4 spools red/blue/green/white | (3.95, 0.90, −4.85) | 0.30 × 0.08 × 0.12 | 0 |
| `wall.bins` | Dark-grey louvred panel x 2.90–4.20, y 1.05–1.95, 4 rows × 5 stack bins: rows 1–2 red, rows 3–4 blue (IMG-R) | (3.55, 1.50, −4.93) | 1.30 × 0.015 × 0.90 | 0 |
| `wall.drawers` | Two 64-drawer organisers side by side (x 4.30–5.30, y 1.20–1.60) on wall brackets directly above the Husky chest (IMG-R), grey frame, clear drawers | (4.80, 1.40, −4.92) | 2 × (0.50 × 0.16 × 0.40) | 0 |
| `jared.bench-light` | Warm-white LED bar along the bench back edge | (2.70, 1.02, −4.95) | 2.80 × 0.02 × 0.01 | 0 |
| `chest.husky` | Rolling tool cabinet, black body, full-width chrome pulls, `HUSKY` badge on top front, round emblem on the bottom door, 4 casters; drawers 1 (top) … 5 | (4.80, 0, −4.75) | 0.69 × 0.46 × 1.00 | 0 |
| `cabinet.storage` | Grey steel cabinet: lower doors locked (keypad), open upper shelves at 1.05/1.45 with LabSim boxes; `cabinet.storage.legacy-shelf` holds the legacy Flex 1 after INC42 | (6.42, 0, −4.75) | 1.05 × 0.45 × 1.95 | 0 |

**West wall** (rotY 90; wall face x = −6.985)

| Id | Description | Position | Size | rotY |
|---|---|---|---|---|
| `wall.whiteboard` | 2.20 × 1.20 whiteboard (aluminium frame), z −3.50…−1.30, y 0.90–2.10, marker tray (4 markers + eraser) | (−6.985, 1.50, −2.40) | 2.20 × 0.02 × 1.20 | 90 |
| `wall.roadmap` | Cork board, headers `TODAY` / `IN PROGRESS` / `PLANNED` / `RETIRED / PHASING OUT`, 8 index cards (curriculum M17) | (−6.985, 1.55, −0.50) | 1.20 × 0.015 × 0.90 | 90 |
| `poster.esd` / `poster.pool` / `poster.5444` | Posters 0.61 × 0.91 (§6.4) | (−6.99, 1.55, 0.90) / (−6.99, 1.55, 1.80) / (−6.99, 1.55, 2.70) | — | 90 |
| `wall.extrusion-10ft` | A full 10 ft (3.048 m) 2020 aluminium stick on two wall hooks, z 0.20…3.25, tape label `10 FT` | (−6.96, 0.45, 1.72) | 3.048 (along z) × 0.02 × 0.02 | 90 |
| `table.build` | Grey steel workbench with a half-built rig (§2.15) | (−4.40, 0, 0.60) | 1.80 × 0.90 × 0.90 | 0 |

**East wall** (rotY −90; wall face x = +6.985)

| Id | Description | Position | Size | rotY |
|---|---|---|---|---|
| `shelf.device-library` | White melamine wall shelving on black brackets: base cabinet top 0.90 (family trays), S1 top 1.25 (D 0.30), S2 top 1.62 (D 0.35), header sign `DEVICE LIBRARY — ONE OF EVERY LABSIM WE TEST` at y 2.05; z −0.90…1.50 | (6.775, 0, 0.30) | 2.40 × 0.45 × 2.00 | −90 |
| `library.trays` | 4 trays 0.56 (z) × 0.36 × 0.04 on the base top at z −0.57, 0.01, 0.59, 1.17, lip labels `STATION`, `MINI`, `FLEX`, `COMPACT` | x 6.80, y 0.90 | — | −90 |
| `library.<model>` | 14 items (§3.2) | §3.2 | — | −90 |
| `counter.coffee` | Laminate counter, mini fridge (decor) under | (6.70, 0, 3.35) | 0.90 × 0.60 × 0.90 | −90 |
| `coffee.machine` | Black drip/pod machine, blue power LED, carafe | (6.80, 0.90, 3.20) | 0.25 × 0.35 × 0.38 | −90 |
| `poster.power` / `poster.park` | Posters (§6.4) | (6.99, 1.55, −3.20) / (6.99, 1.55, −2.30) | 0.61 × 0.91 | −90 |

**South wall** (rotY 180; wall face z = +4.985)

| Id | Description | Position | Size | rotY |
|---|---|---|---|---|
| `wall.history` | Team history wall x 2.60–4.90, title vinyl `TEAM HISTORY` at y 1.95 | (3.75, 1.50, 4.985) | 2.30 × 0.02 × 1.05 | 180 |
| `wall.history.semi` / `.sedi` / `.ipx` / `.paycore` | Black frames 0.40 × 0.50, read left→right by a viewer facing south | (4.55, 1.55, 4.98) / (4.05, …) / (3.55, …) / (3.05, …) | — | 180 |
| `wall.history.match` | Plaque board with 5 plaques: Semi, Sedi, IPX, PayCore, Core OS (curriculum M18) | (3.75, 1.07, 4.98) | 2.10 × 0.02 × 0.25 | 180 |

### 1.5 Power wall board layout

World positions; all parts stand off the board face (z −4.966) toward +Z. Wiring: MW-1 → bus 2 × 10 AWG (red/black); bus → regulators 14 AWG; regulator outputs → fuses → up the board into `tray.ct1`; tags on each bundle.

| Id | Part | (x, y) | Size (mm) | Label text (exact) |
|---|---|---|---|---|
| `power.outlet.w1` … `w4` | Duplex NEMA 5-15R, steel box, white faceplate | (−2.05, 1.05), (−1.25, 1.05), (−0.25, 1.05), (0.65, 1.05) | plate 70 × 115 | `W1 · 120V` … `W4 · 120V` |
| `power.psu.mw-1` | Mean Well LRS-600-24: perforated aluminium case, 7-way terminal strip (L N ⏚ −V −V +V +V) under a clear cover on the right end, green "DC OK" LED, V.ADJ pot; AC cord to W1 | (−1.75, 1.85) | 215 × 115 × 50, long axis horizontal | `MEAN WELL · INPUT 120VAC · OUTPUT 24VDC` / `LRS-600-24 · 24V 25A` |
| `power.bus.24v` | Red (+) and black (−) copper bus bars on 4 standoffs, 6 screw lugs each | (−1.25, 1.85) | 300 × 40 × 25 | `24V DC RAIL` |
| `power.reg.12v` | Black finned buck module, 4 flying leads | (−0.80, 2.02) | 90 × 60 × 35 | `12V DC · NUC` / `24V→12V 15A†` |
| `power.reg.5v-a` / `-b` / `-c` | Silver finned buck modules | (−0.40, 2.02) / (0.00, 2.02) / (0.40, 2.02) | 75 × 55 × 32 | `5V DC · 10A` + second tape `RACK A` / `RACK B` / `BENCH C (TETHERED + ADB)` |
| `power.fuse.12v` / `5v-a` / `5v-b` / `5v-c` | Inline ATO holders, smoked cap (§2.8 fuse model) | (−0.80, 1.72) / (−0.40, 1.72) / (0.00, 1.72) / (0.40, 1.72) | 55 × 22 × 18 | `F-12V 10A`, `F-5V-A 10A`, `F-5V-B 10A`, `F-5V-C 10A` |
| `power.tap.24v` / `12v` / `5v` | Dangling DC tap leads with 5.5 × 2.1 barrel plugs on hooks — the wrong-socket trap (M03, INC17) | (−1.35, 1.45) / (−1.15, 1.45) / (−0.95, 1.45) | lead 0.4 m | red tag `24V`, yellow tag `12V`, blue tag `5V` |
| `power.strip.w` | 6-outlet commercial metal strip, illuminated red rocker; cord to W4 (curriculum `prop.ac-strip`) | (0.35, 1.20) | 450 × 50 × 45 | `AC STRIP — LABSIM / COLLIS ONLY` |
| `power.tag.nuc` / `power.tag.pi` | Clickable line-end tags where wires leave the board (power-trace nodes 7, 8) | (−0.80, 2.20) / (0.00, 2.20) | 60 × 25 | `→ NUC SHELF (12V)` / `→ PI SHELVES (5V)` |
| `power.tag.motor` | Tag on the orange/black bundle | (−1.25, 2.20) | 60 × 25 | `→ 24V MOTOR (RACK A / B / T)` |
| `power.sign` | Yellow/black safety sign | (0.65, 2.12) | 300 × 200 | `24V DC · 120V AC — DE-ENERGIZE BEFORE SERVICING` |

Other wall outlets (duplex, white plates): W5 (1.60, 1.05) and W6 (2.60, 1.05) on the north wall above `bench.jared`; W7 (−3.70, 0.40) behind `shelf.server`; W8 (−6.20, 1.05) above `bench.fab`; W9–W12 on the south wall at y 0.40, x −6.10, −4.30, −0.90, 1.10 (under desks); W13 east wall (6.985, 1.05, 3.35) coffee; W14 east wall (6.985, 0.40, 0.30) library. AC strip cords run up into the trays: `power.strip.a` → W2, `power.strip.b` → W3, `power.strip.c1`/`c2` → W2/W3, `power.strip.t` and `power.strip.d` → W5, `power.strip.w` → W4.

### 1.6 Overhead: cable trays, hangers, drops

Wire-basket trays (zinc `zincTray`), bottom at y 2.40, hung from Ø 10 mm threaded rods every 1.20 m (instanced) with trapeze bars.

| Id | Run | Section (mm) |
|---|---|---|
| `tray.ct1` | Along the north wall: x −4.40 → 4.40 at z −4.60 | 300 × 60 |
| `tray.ct2` | Spur x −2.00: z −4.60 → −2.10 | 300 × 60 |
| `tray.ct3` | Over the rack row: x −2.90 → −1.10 at z −2.10 | 300 × 60 |
| `tray.ct4` | Spur x 2.40: z −4.60 → −1.95, then west to x 0.85 along z −1.95 | 300 × 60 |
| `tray.ct5` | Workstation run: x 0.80 from z −4.60 → 4.55, then west x 1.80 → −6.50 along z 4.55 | 200 × 60 |

Cable drops (black braided bundles Ø 40 mm, `braidedSleeve`): tray → top of `rack.a`, `shelf.callus`, `rack.b` (y 2.00 → 2.40); tray → `rack.t` top (1.80 → 2.40); tray → `shelf.adb` rear-right post (1.05 → 2.40). Visible tray contents: yellow Cat6, black AC cords, red/black and yellow/black DC pairs, orange/black motor pairs (all merged into one mesh per tray).

### 1.7 Ceiling fixtures

| Id | Fixture | Centre (x, 3.00, z) | Notes |
|---|---|---|---|
| `light.t01` | 2×4 **fluorescent** troffer (old T8, prismatic lens) | (−5.10, −3.00) | Above the print corner. Slight flicker + buzz (§7.1, §8). |
| `light.t02` … `t04` | 2×4 LED troffers (flat opal diffuser) | (−1.50, −3.00), (1.50, −3.00), (5.10, −3.00) | |
| `light.t05` … `t08` | LED troffers | (−5.10, 0.00), (−1.50, 0.00), (1.50, 0.00), (5.10, 0.00) | |
| `light.t09` … `t12` | LED troffers | (−5.10, 3.00), (−1.50, 3.00), (1.50, 3.00), (5.10, 3.00) | |
| `ceiling.diffuser-1` / `-2` | 600 × 600 four-way supply diffusers | (−3.30, 1.50), (3.30, −1.50) | |
| `ceiling.return-1` / `-2` | 600 × 600 egg-crate return grilles | (−3.30, −3.30), (3.30, 2.70) | |
| `ceiling.smoke-1` / `-2` | Smoke detectors Ø 0.13 | (0.00, 0.00), (−4.80, 3.00) | Blinking red pilot LED every 8 s |
| `ceiling.sprinklers` | Chrome pendant heads, instanced on a 3.0 m grid | x ∈ {−6, −3, 0, 3, 6}, z ∈ {−3.9, −0.9, 2.1} | |

All troffers are 0.6 (x) × 1.2 (z), long axis north–south, recessed 0.02.

### 1.8 Colliders and navigation

* Static colliders: every floor prop in §1.4 = footprint AABB + 0.02 m; walls; `room.column`; desks include their chairs as 0.50 × 0.50 boxes (chairs move with the "Sit" pose only).
* Racks/shelves: full footprint box (the player never enters a rack). Open side doors add a dynamic collider for the door leaf (0.90 × 0.02 × 0.44 per bay door, union per rack side).
* `door.lab` leaf: dynamic collider following the leaf (closed: blocks the doorway; open ≥ 60°: passable).
* Player capsule (engine): radius 0.25, standing eye 1.65, crouched eye 1.05 (gameplay `C`). Nothing walkable is lower than 1.30 except under-bench spaces (not walkable).
* Step height 0.15; floor is flat everywhere (mats are 6 mm decals).

### 1.9 Spawns and NPC anchors

| Id | Position (x, y, z) | Yaw (°) | Use |
|---|---|---|---|
| `spawn.new-game` | (5.90, 0, 6.40) | 0 | M00 Badge In: facing the closed lab door, Morgan visible through the vision panel |
| `spawn.entrance` | (5.90, 0, 4.20) | 50 | Inside the door, framing the rack row's green glow |
| `spawn.free-play` | (2.00, 0, 1.00) | 60 | Free Play default |
| `spawn.workstation` | chair (1.10, 0, 4.02) | 180 | Load straight into the seated pose (§9.3) |
| `npc.morgan.desk` | (−0.90, 0, 4.02) | 180 | seated |
| `npc.morgan.door` | (5.45, 0, 4.30) | 180 | waving through the vision panel |
| `npc.jared.bench` | (2.70, 0, −4.05) | 0 | working at the bench |
| `npc.jared.power-wall` | (−0.20, 0, −4.05) | 0 | M03 |
| `npc.any.rack-a` / `.rack-b` | (−3.30, 0, −1.30) / (−0.60, 0, −1.30) | 270 / 90 | beside the rack fronts |
| `npc.any.callus` | (−2.00, 0, −1.05) | 0 | |
| `npc.any.tethered` | (2.95, 0, −1.00) | 30 | |
| `npc.any.server` | (−3.20, 0, −3.90) | 10 | |
| `npc.any.print` | (−5.20, 0, −3.70) | 10 | |
| `npc.any.whiteboard` | (−6.10, 0, −1.20) | 90 | |
| `npc.any.library` | (6.00, 0, −0.40) | 270 | |
| `npc.coworker.desk-1` / `desk-2` | (−6.10, 0, 4.02) / (−4.30, 0, 4.02) | 180 | Sam† / Riley† seated |
| `npc.alex.build` | (−4.40, 0, 1.45) | 0 | Alex† at the build table |
| `npc.tate.visit` / `npc.david.visit` | (0.10, 0, 3.30) / (−0.20, 0, 2.90) | 180 | visitors near the desks |

NPC look and animation: Appendix A.

### 1.10 Curriculum prop aliases (`PROP_ALIASES`)

| Curriculum id (10-curriculum §0.5) | World id |
|---|---|
| `prop.walle.tablet`, `prop.johnny5.tablet`, `prop.seti.tablet` | `rig.wall-e.tablet`, `rig.johnny-5.tablet`, `rig.seti.tablet` |
| `prop.walle.power-panel` | `rig.wall-e.power-panel` |
| `prop.rack-a.rail-labels` | `rack.a.rails` (the "33" label is `rack.a.rails.u33-left`) |
| `prop.seti-panel` | `rig.wall-e.side-panel` |
| `prop.printer.prusa`, `prop.printer.bambu` | `fab.printer-prusa`, `fab.printer-bambu` |
| `prop.safety-card` | `wall.safety-card` |
| `prop.walle.door` | `rig.wall-e.door` |
| `prop.walle.stepper-x` | `rig.wall-e.stepper-x` |
| `prop.walle.motor-pcb` | `rig.wall-e.motor-pcb` |
| `prop.walle.cradle` | `rig.wall-e.cradle` |
| `prop.walle.webcam` | `rig.wall-e.webcam` |
| `prop.walle.carriage` | `rig.wall-e.carriage` |
| `prop.walle.limit-switch-x`, `prop.walle.limit-switch-y` | `rig.wall-e.limit-x`, `rig.wall-e.limit-y` |
| `prop.walle.dip-arm` | `rig.wall-e.dip-arm` |
| `prop.walle.pi` | `rig.wall-e.pi` |
| `prop.bolt-bins` | `jared.bolt-bins` |
| `prop.device-library.<model>` | `library.<model>` (same model slugs) |
| `prop.family-trays` | `library.trays` |
| `prop.megatron.mfd`, `.cfd`, `prop.optimus.mfd`, `.cfd` | `rig.megatron.mfd`, `rig.megatron.cfd`, `rig.optimus.mfd`, `rig.optimus.cfd` |
| `prop.smartstripe-probe` | `rig.megatron.smartstripe` |
| `prop.hub-dock` | `rig.megatron.dock-mfd` |
| `prop.meanwell-psu` | `power.psu.mw-1` |
| `prop.power-trace` | `power.trace` |
| `prop.regulator-12v`, `prop.regulator-5v10a` | `power.reg.12v`, `power.reg.5v-b` |
| `prop.fuse-5v-b`, `prop.fuse-spares`, `prop.multimeter` | `power.fuse.5v-b`, `power.fuse-tray`, `tool.multimeter` |
| `prop.ac-strip` | `power.strip.w` |
| `prop.flex4-psu-brick`, `prop.collis-probe-spare` | `power.bench.flex4-psu`, `power.bench.collis-spare` |
| `prop.nuc-03`, `prop.minix-01` | `callus.nuc-03`, `callus.minix-01` |
| `prop.collis-probe-a` | `collis.wall-e` |
| `prop.eve.pi-power` | `rig.eve.pi-power` |
| `prop.eve.device`, `prop.seti.device`, `prop.data.device`, `prop.tars.device` | `rig.eve.device`, `rig.seti.device`, `rig.data.device`, `rig.tars.device` |
| `prop.ruler` | `tool.ruler` |
| `prop.r2d2.mfd`, `prop.r2d2.cfd` | `rig.r2-d2.mfd`, `rig.r2-d2.cfd` |
| `prop.coworker-device` | `desk.coworker-1.device` |
| `prop.whiteboard`, `prop.roadmap-board` | `wall.whiteboard`, `wall.roadmap` |
| `prop.gpu-blade`, `prop.legacy-tower` | `server.blade`, `server.tower` |
| `prop.history.semi/sedi/ipx/paycore/match` | `wall.history.semi/sedi/ipx/paycore/match` |

---
## 2. Touch-robot rig construction (mm)

Derived from IMG-T (front), IMG-G (inside a shelf), VID (tapping a Flex 3). One builder (`src/world/rigs/bay.ts`)
makes every touch rig from the shared parts below plus the per-rig table in §2.10.

### 2.1 Rack frame and bay heights

| Part | Spec |
|---|---|
| Frame | 42U open 4-post rack, outer 600 W × 1000 D × 2000 H. Posts: black folded steel 45 × 45 mm at rack-local x ±277.5, z ±477.5. Bottom frame + 4 levelling feet (plinth 0–100 mm). Top: perforated plate 600 × 1000 at y 1970–2000. Material `blackSteel`. |
| Rails | EIA-310 square-hole rails on the inner faces of all 4 posts, front rail plane at rack-local z +450, rear at −450. Rail flange 30 mm (x ±225 … ±255). Square holes 9.5 mm, three per U at 6.35 / 22.225 / 38.1 mm above each U's bottom, hole centres x ±232.5. |
| Rack units | U1 bottom at rack-local y 100.0; **Uₙ spans 100 + (n−1)·44.45 … 100 + n·44.45 mm**. U42 top = 1966.9. |
| Rail numbering (IMG-T) | Front rails only. Numbers 1–42 printed white (#f2f2f2, `LABEL` font, cap 8 mm) centred on each U's mid-height in the outer 15 mm band of each rail (left rail: x −255…−240, numbers right-aligned; right rail: x 240…255, left-aligned), plus a white tick 6 mm long at every U boundary. Texture `rackUnitStrip` (§6.2). Interactable sub-ids `rack.a.rails.u<n>-left` / `-right`. |
| Green LED strips | One continuous strip on the inner face of each **front** post (x ±255, facing the rack centre), y 100–1970, 10 mm wide, 60 LEDs/m, material `ledStripGreen` (§6.1). |
| Bays | Four 10U bays per rack (table below). The shelf plate (2 mm) at the bottom of each bay is the bay floor; the next shelf's plate is its ceiling (clear height 442 mm; the shelf's front/rear flanges hang 40 mm lower at z 0…−3 and −897…−900). |

| Bay | Units | Bay floor (rack-local y, m) | Fascia y range (m) | Rack A | Rack B |
|---|---|---|---|---|---|
| 4 (top) | U31–U40 | 1.4335 | 1.4485 – 1.6385 | **WALL-E** | **JOHNNY-5** |
| 3 | U21–U30 | 0.9890 | 1.0040 – 1.1940 | **EVE** | **SETI** |
| 2 | U11–U20 | 0.5445 | 0.5595 – 0.7495 | **R2-D2** | **BAYMAX** |
| 1 (bottom) | U1–U10 | 0.1000 | 0.1150 – 0.3050 | **BUMBLEBEE** | **ROSIE** |
| top | U41–U42 | 1.8780 plate | — | 5 V/24 V distribution block (front), `power.strip.a` (rear, 1U) | camera Pi + distribution block (front), `power.strip.b` (rear) |

Check vs IMG-T: WALL-E's fascia spans U31.3 – U35.6 and rack unit 33 sits beside the toggle switches ✓; the gantry beam (bay y 255–295) sits at U37 ✓; the perforated shelf above at U41 ✓.

### 2.2 Bay-local frame

`bay-local (x, y, z)` in mm: origin at the rack's centreline (x 0), the bay floor top surface (y 0) and the **front rail plane** (z 0); +X = player's right when facing the rack, +Y up, +Z toward the aisle (inside the bay z is negative, rear rail plane z −900). Clear interior x −225 … +225, y 0 … 442.
World = rack position + (x/1000, bayFloorY + y/1000, 0.450 + z/1000).

```
TOP VIEW (bay-local, front at the bottom)                     SIDE VIEW (from −X, front on the right)
z=-900 ┌────────────── hex-mesh back panel ──────────────┐    y=442 ┌──────────── shelf above ─────────────┐
       │ [Pi]  F=fuse [PSU brick]      [motor PCB on mesh]│          │ cam◄─┐   Y-motor▣                    │
z=-600 │      ◎ Y idler + Y limit switch (slid to home)   │      360 │◎═════╪══ cantilever arm ══════╤▣      │
       │      ║  cantilever arm (moves with X carriage)   │          │      │  arm carriage ┃         │riser  │
       │ home ●═══════════ SCREEN (level, y=100) ════╗    │      295 │      │               ┃    ═══ front beam ═│
       │ (0,0)║ x → (+X)                            ║   ║rail     │      │               ┃         ▐dip    │fascia
       │  y ↓ ║ (toward the player)                 ║   ║(phone   │      │               ┃ drop    ▐tower  │top 205
       │      ╚═════════════════════════════════════╝   ║ sled)   │      │            ▐█▌ solenoid ●pivot │
z=-160 │            chip-slot edge ═══ ◄card            ║         │  106 │             ╹ tip       ╲card   │
       │                     ▣dip tower ◇tap pivot              │  100 │  ▁▁▁▁▁▁ screen ▁▁▁▁▁▁▁▁▁▁▁▁▁╲▌slot │
z=-45  │ ◎X idler ═════════ front beam 2040 ═════════ X motor▣│   15 │ [Pi] cradle                       │fascia
z=0    └── POWER ─────────── tablet ─────────── SETI ─────────┘    y=0 └──────── bay floor (vented) ────────┘
       x=-225                                           x=+225         z=-900                         z=0
```

### 2.3 Shelf, back panel, side door, sleeve

| Part | Geometry (mm) | Material / texture | Notes |
|---|---|---|---|
| Bay floor shelf | Plate 440 × 900 × 2, front & rear flanges 440 × 40 × 2 hanging down, 4 mounting ears with M6 cage-nut screws (button heads) | `perforatedSteel` (slots 6 × 30 mm, staggered, row pitch 13 mm, long axis along Z) — IMG-G | Flange cut-outs 10 × 22 mm every 40 mm (normal/alpha map on the flange). |
| Hex-mesh back panel | 450 × 442 × 1 at z −905 (just behind the rear rails), black | `hexMesh` (7 mm across flats, 1.3 mm bars) — IMG-G | Alpha-tested; shows the Pi/PCB glow through it. |
| Side door (`rig.<id>.door`) | Frame 12 × 12 black aluminium, 900 (along Z) × 440 (Y), hex-mesh infill; printed pull handle 80 × 20 × 25 at the front edge, y 220; two magnetic catches | `anodisedBlack` + `hexMesh` | On the rack's **outer** side (Rack A: −X face, Rack B: +X face). Hinged on the **rear** post (z −900), opens outward 0 → 95° in 0.45 s (ease-out); open leaf points along ±X at the rear. Closed state still shows the rig through the mesh. |
| Open side | The side facing `shelf.callus` has no door (Collis ribbons and USB pass through). | — | |
| Braided sleeve | Expandable PET sleeve Ø 24, black, running along the bay floor's front edge from x −215 to +215 at z −12, y 12, then up the door-side rear post (IMG-G) | `braidedSleeve` (§6.1) | TubeGeometry on a CatmullRom path, 6 radial segments (Low) / 10 (High). |
| Wiring loom | 4 wires Ø 2.0 (red, blue, green, white) twisted, zip-tied every 40 mm (white ties), running from the motor PCB along the floor to the dip tower, up the tower's zip-tie slots, then as an orange PU coil cable (coil Ø 14, wire Ø 4) to the carriages (VID) | `wireRed/Blue/Green/White`, `coilOrange` | One merged TubeGeometry per colour per rig. |

### 2.4 Device cradles (black PLA)

Rule for every cradle: the device lies **face-up with its screen surface level at bay y = 100.0**, its chip-slot edge facing the front with the edge face at **z = −160.0**, centred at x = 0 (D7). Cradles are printed shapes (boxes + wedges) with visible layer lines (`blackPla`), screwed to the shelf with 4 × M5 button heads; device held by two side clamps (2 × M2.5 bolts each — INC42 removes these).

| Cradle id | Holds | Shape (mm) | Notes |
|---|---|---|---|
| `flex-cradle-gen3` | Flex 3, Flex 4 | Trapezoid tray 96 W × 230 D, side walls 28 high with 30° chamfers, a wedge under the printer end to level the screen (IMG-G "angled cradle"), front lip cut-out 60 × 14 for the card path | Front lip label tape `FLEX 3` / `FLEX 4` on the device itself (VID). |
| `flex-cradle-pocket` | Flex Pocket | 96 W × 185 D, no printer wedge | |
| `flex-cradle-gen1` / `-gen2` | Flex 1 / Flex 2 | 98 W × 220 D / 96 W × 232 D | Swap in INC42 (gen1 → gen2). |
| `compact-cradle` | Compact | 104 W × 200 D tray + 40 mm wedge (the Compact is thicker at the rear) | |
| `mini-dock` | Mini 2 / Mini 3 | Wedge dock 222 W × 175 D; its sloped bed cancels the Mini's 30° screen tilt so the face is level; open back for the printer door | |
| `station-tray` | Station 2018 display head (detached from its stand) | Flat tray 362 W × 244 D × 70 H with corner clamps; head connected to its base on the shelf rear by its flat cable | |
| `station-duo-tray` | Station Duo MFD head + CFD | Two trays: CFD tray 227 W × 162 D at the front, MFD tray 362 W × 244 D behind it with a 15 mm gap | |

### 2.5 XY gantry (2020/2040 aluminium, NEMA-17, GT2)

Kinematics (D7): a **fixed front beam** along X carries the **X carriage**; the X carriage carries a **cantilever arm** pointing back into the bay; the **arm carriage** rides the arm (Y axis) and carries a vertical drop with the solenoid. Tip position `(tipX, tipZ)` in bay-local mm; the beam-carriage centre `cx = tipX − 26` (the drop sits 26 mm to the +X side of the arm) and the arm-carriage centre `az = tipZ`. For a sim position `(xMm, yMm)`: `tipX = homeX + xMm`, `tipZ = homeZ + yMm` (homeX/homeZ from §2.10). Mechanical ranges: `cx ∈ [−183, +183]`, `az ∈ [−560, −80]`.

| Part | Geometry (mm) | Position (bay-local) | Material |
|---|---|---|---|
| Front beam | 2040 V-slot (20 deep × 40 tall), 440 long, ExtrudeGeometry of the V-slot profile (§6.2) | x −220…+220, y 255…295, z −35…−55 | `aluminium` |
| Beam hangers | Printed plates 70 × 60 × 8 bolting the beam to the front rails | x ±224 | `blackPla` |
| X idler | Smooth GT2 idler Ø 18 × 9 on a 60 × 60 × 6 black plate (IMG-T left end) | axis ‖ Z at (−205, 275, −62) | `aluminium`, `rubber` |
| X motor | NEMA-17: body 42.3 × 42.3 × 40, black with 6 mm silver end caps, round boss Ø 22, 5 mm shaft, label sticker; GT2 20T pulley Ø 12.2 × 16 with grub screws | body centre (+199, 275, −83), shaft ‖ +Z, pulley at z −62 | `blackSteel`, `aluminium` |
| X belt | GT2 6 mm loop, 2 mm pitch teeth on the inside | strands at y 269 and 281, z −62, from idler to pulley | `belt` (§6.1) |
| X limit switch (`rig.<id>.limit-x`) | KW12 micro switch 20 × 6.4 × 10 (black body), steel roller lever 16 long, on a printed slide bracket | top of the beam at x = homeX − 26 − 40 (trips when the carriage reaches tipX = homeX), y 297 | `blackPla`, `steelChrome` |
| X carriage plate | 70 W × 60 H × 6 black anodised | front face of the beam: x cx ± 35, y 245…305, z −29…−35 | `anodisedBlack` |
| V-wheels ×4 | Ø 24 × 10.2 POM wheel with 625 bearing, axes ‖ Z; eccentric spacers on the lower pair | (cx ± 25, 300) and (cx ± 25, 250), z −40 | `nylonWheel`, `aluminium` |
| X belt bridge + **magnetic lock** | Printed U-bridge over the beam (60 × 15 × 30) from the plate to the rear belt strand; belt clamp block 30 × 12 × 14 holding two Ø 10 × 3 neodymium discs that mate with a steel striker plate on the bridge | y 296…310 | `blackPla`, `steelChrome` (magnets) |
| Riser + gusset | Vertical 2020, 30 long; printed triangle gusset 40 × 40 × 6 | (cx, 310…340, −45) | `aluminium`, `blackPla` |
| Cantilever arm | 2020, 560 long | x cx ± 10, y 340…360, z −40…−600 | `aluminium` |
| Y motor (`rig.<id>.stepper-y`) | NEMA-17 standing on the arm's front end on a printed bracket, shaft pointing down, pulley at y 368 | body centre (cx, 396, −62) | as X motor |
| Y idler | Ø 18, axis ‖ Y | (cx, 368, −590) | |
| Y belt | GT2 loop in the horizontal plane y 368, strands at x cx ± 6, z −62…−590 | | `belt` |
| Y limit switch (`rig.<id>.limit-y`) | KW12 on a printed slide clamp on the arm | z = homeZ − 38 (trips at tipZ = homeZ), x cx + 12, y 335 | |
| Arm carriage | Plate 60 (Z) × 50 (Y) × 6 on the arm's +X face; 4 V-wheels (axes ‖ X) in the arm's top/bottom slots | x cx + 10…+16, y 325…375, z az ± 30 | `anodisedBlack`, `nylonWheel` |
| Y belt clamp + **magnetic lock** | Clamp 30 × 12 × 14 on top of the arm carriage, 2 magnets | y 372…386 | |
| Drop | Vertical 2020, 175 long | x cx + 26 (centre), y 165…340, z az | `aluminium` |
| Coil cable | Orange PU coil Ø 14 from the arm carriage to the riser, 4 visible loops; stretches with az (VID) | | `coilOrange` |

**Magnetic lock visuals:** engaged = clamp flush against the striker (0 mm gap). Broken = the carriage has moved away from its clamp: render the clamp at the belt's commanded position and the carriage at the pushed position; when they are > 3 mm apart, show both magnets (silver discs) and a red `#ff3b30` 3 mm emissive dot on the clamp (`ledRed` at intensity 3) as the in-world cue.

### 2.6 Solenoid probe head

| Part | Geometry (mm) | Material |
|---|---|---|
| Printed L-bracket | 30 × 22 × 25, bolts the solenoid to the drop's bottom | `blackPla` |
| Frame | Push-pull solenoid U-frame (JF-0530B class): 30 tall (along the stroke) × 16 × 13, silver steel | `steelChrome` (rough 0.35) |
| Coil | Cylinder Ø 13 × 22 wrapped in **blue tape** with a small white printed sticker (IMG-T/IMG-G/VID) | `solenoidBlue` (#1f5fd6, rough 0.55, clearcoat 0.3) |
| Plunger | Ø 6 steel rod; tail Ø 4 with a return spring (coil Ø 7 × 10, 6 turns) and an E-clip protruding above the frame | `steelChrome` |
| Tip | Conductive rubber cap Ø 7 × 6 on the plunger end | `rubberTip` (#101010, rough 0.9) |
| Wires + connector | Red/black pair to a 2-pin JST on the arm carriage (`rig.<id>.solenoid-connector`; INC15 "loose" = connector hangs 25 mm below its socket) | `wireRed`, `wireBlack`, `whiteNylon` |

Heights (bay-local y, rest): tip bottom **106.0** (6.0 mm above the screen); frame 120–150; spring/E-clip to 162; drop bottom 165. Stroke **10.0 mm** → extended tip 96.0 (the rubber tip compresses up to 4 mm against the glass; contact is at y ≤ 100.5). If the sim stores `solenoid.heightAdjustMm`, add it to all head heights.

### 2.7 Dip arm, tap paddle, phone sled

**Dip arm** (`rig.<id>.dip-arm`, IMG-G/IMG-T):

| Part | Geometry (mm) | Position |
|---|---|---|
| Dip tower (also the cable tower) | Printed column 40 × 40 × 240 with zip-tie slots every 40 mm on its −X face carrying the wiring loom | x 12…52, z −28…−68, y 0…240 |
| Pivot shaft | Steel Ø 5, axis ‖ X | (0…12, pivotY, −48.4) where `pivotY = slotY + 47.9` |
| Sector gear | Printed 90° sector, pitch radius 32, module 1, 8 thick, embossed **`63`** (white infill in the debossed digits) beside an index notch; arm carries a matching index line (INC16 misalignment = arm line 1 tooth (≈ 1.8°) off the notch) | on the shaft at x 6 |
| Gear-hub clamp | 2 × M2.5 socket bolts (INC16 screwdriver target) | hub face |
| Drive | Micro servo 23 × 12 × 29 (blue case) inside the tower, Ø 14 pinion | x 32, y 150 |
| Arm | Printed plate 8 thick, 100 long, 26 wide, tapering to 18 at the tip, 3 screw heads | in the plane x −4…+4 |
| Card insert ("white ribbon card") | Flexible white card 54 × 85 × 0.6 (`cardWhite`, grey print `COLLIS PROBE CARD†`), screwed to the arm tip, sticking out 60 beyond it; grey flat ribbon (20 wires, 25 wide, red edge stripe) from its rear edge along the arm and down the tower to the Collis probe | arm tip → slot |

Pose angles (arm direction pointing toward −Z, angle measured from horizontal, + = up): **In = −20°** (card tip 20 mm inside the slot at `(0, slotY, −180)`), **Out = +35°** (card tip at about (0, slotY + 127, −163), clear above the device edge and below the beam). Pivot to card tip = 140 mm.

**Tap paddle** (`rig.<id>.tap-paddle`): printed arm on a vertical pivot at the tower's +X side `(60, 170, −48)`; paddle 60 × 40 × 5 (black PLA with a visible copper spiral NFC coil inlay `copper`, white `NFC` print) carried at y 108 (8 mm above the screen/bezel). Arm length = horizontal distance from the pivot to the rig's NFC landmark (§2.10). **In** = paddle centred over the landmark; **Out** = arm pointing +X (paddle beside the device, outside the screen footprint). The sim must park the head ≥ 40 mm from the landmark before Tap In; the world does not resolve collisions.

**Phone sled** (`rig.<id>.phone-sled`, tablet "Phone" group; purpose per curriculum S17†): MGN9 rail (9 × 6.5 silver) on the bay floor along Z at `x = deviceRightEdge + 23`, z −180 … −620; printed sled 30 W × 70 D × 45 H carrying (a) a small printed phone tray labelled `PHONE†` and (b) the **power pusher**: a micro push solenoid 20 × 11 × 10 pointing −X with a printed finger 8 × 6 that reaches the device's power key on its right edge at `y = 100 − deviceThickness/2`. **Back** = sled at z −600; **Forward** = finger aligned with the power key z (§2.10).

### 2.8 Electronics, power and wiring inside a bay

| Part | Geometry (mm) | Position (bay-local) | Visible states |
|---|---|---|---|
| Raspberry Pi (`rig.<id>.pi`) | Black 2-part case 94 × 63 × 30, vent slots, side cut-outs for 2 × USB-A stacks, RJ45, USB-C power, micro-HDMI; light pipes for PWR (red) and ACT (green) on the RJ45 end; RJ45 jack LEDs (green link/act, amber speed) | door-side rear corner on the floor: Rack A (−165, 0, −790) rotY 90 (ports face the door), Rack B (+165, 0, −790) rotY −90 | 20-gameplay §3.2: PWR solid red when powered; ACT irregular flicker 2–12 Hz when healthy, solid on/off when hung; jack LEDs off when Ethernet unplugged |
| Pi Ethernet (`rig.<id>.pi-ethernet`) | Yellow Cat6 Ø 6 with RJ45 boot | from the jack up the door-side rear post to the rack top | Unplugged: the plug end hangs 60 mm below the jack beside the cradle (INC04) |
| Pi power lead (`rig.<id>.pi-power`) | Black USB-C cable Ø 4 from the bay fuse holder | | Unplugged: plug rests on the floor 40 mm from the Pi |
| Bay fuse holder (`rig.<id>.fuse`) | Inline ATO holder 55 × 22 × 18, black body, smoked translucent cap (`smokedPlastic`), red 10 A blade inside; tape label `F-<RIG>-5V 10A` (e.g. `F-WALL-E-5V 10A`) | zip-tied to the door-side rear post at (±205, 70, −850) | Blown: the blade's link is broken with a brown scorch (fuse texture variant), visible with the flashlight + inspect (INC03) |
| Motor controller PCB (`rig.<id>.motor-pcb`) | Green PCB 100 × 70 × 1.6 on 4 brass standoffs (10 mm) on the hex-mesh; DB-25 female connector (53 × 12, silver shell) on the top edge with a grey 25-way ribbon to the loom; 3 purple stepper-driver modules 15 × 20 with silver heatsinks 9 × 9 × 5; green screw terminals labelled `24V IN`, `SOL`, `SERVO`; USB-B port; silkscreen `25-PIN MOTOR CTRL · MADE IN HONG KONG†` and the rig name hand-written in silver marker | vertical board on the back mesh, opposite the door side: Rack A centre (+110, 205, −893), Rack B (−110, 205, −893), facing +Z | Power LED (green 2 mm) on when MAIN; driver LEDs (red 1 mm) on when MOTOR + steppers enabled. EVE (legacy-nuc-motion): a grey USB lead tagged `EVE MOTION` leaves the PCB through the open side to the Callus shelf spare slot |
| Webcam (`rig.<id>.webcam`) | Black webcam 72 × 31 × 30, glossy front, lens Ø 12, white activity LED; on a black gooseneck (Ø 8, 400 long) clamped to the left front post top at (−225, 425, −10) | camera at (−150, 410, −120), aimed at the rig's camera target (§2.10) | LED on while a stream client is connected; USB unplugged state (INC08 variant B): cable hangs from the gooseneck |
| Device AC brick (`rig.<id>.device-psu`) | White (Flex/Mini) or black (Station) 18 V AC brick 110 × 60 × 32, cord up the rear post to the rack's AC strip; DC cable (white, VID) to the device | floor, door side (±150, 0, −640) | Unplugged → device dark |
| Collis ribbon | Grey 20-way ribbon (red edge stripe) entering through the open side from the Collis probe on `shelf.callus` at the same level, along the floor to the dip tower | enters at x ±225 (Callus side), y 30 | Unseated state is at the Collis end (§2.14) |
| Rack-top distribution (`power.rackdist.a` / `.b`) | Printed box 300 × 60 × 70 on the U41 plate front with 4 USB-C leads (5 V) and 4 two-pin leads (24 V) dropping down the rear posts; tape `RACK A · 5V IN (F-5V-A) · 24V MOTOR IN`; green `5V` and orange `24V` LEDs | rack-local (0, 1.880, +0.40) | LEDs follow rail voltage |
| Rack AC strip (`power.strip.a` / `.b`) | 1U rack-mount 6-outlet strip at the rear, illuminated switch; tape `STRIP-A — LABSIM / COLLIS ONLY` | rack-local (0, 1.885…1.929, −0.47), facing the rear aisle | Outlet n occupied ⇔ load plugged; switch LED red when on |
| Rack B camera Pi (`rig.rack-b.camera-pi`) | Pi in a black case + 4-port USB hub in a printed tray; tape `RACK B CAM` | Rack B rack-local (+0.15, 1.880, +0.30) | Same LED rules as rig Pis |
| Minix / NUC (Callus) box | Not inside the bay: one Windows box serves a whole rack's Collis probes, so the boxes live on the adjacent Callus shelf (§2.14, D11). The bay's link to it is the side panel's `Minix` USB port (front extension) and the Collis USB cable | `shelf.callus` level 3 | Blue power LED on the box; INC02 = LED off |

Per-bay wiring path for the Pi (D2): rack-top distribution (5 V) → down the rear post → front **MAIN** switch on the fascia → back along the braided sleeve → bay fuse → Pi. MAIN LED = MAIN on **and** 5 V present upstream of the bay fuse (so a blown bay fuse shows MAIN lit but a dark Pi — the INC03 clue). MOTOR LED = MOTOR on **and** 24 V present.

### 2.9 Front fascia (IMG-T)

All fascia parts are black PLA with visible diagonal top-surface ironing lines (`blackPla`, IMG-T), front face at bay z +3.

| Part | Geometry (mm) | Position (x, y; front face z +3) | Detail |
|---|---|---|---|
| Ears | 2 × 16 × 190 × 3 | x ±(225…241.3), y 15…205 | 2 × M5 button-head screws each into the rails |
| Top bar | 450 × 30 × 20 deep | y 175…205 | 4 × M5 button heads (black oxide) at x ±215, ±80 |
| Bottom bar | 450 × 30 × 20 deep | y 15…45 | 4 × M5 button heads |
| **POWER panel** (`rig.<id>.power-panel`) | Box 85 W × 130 H × 43 deep, inner face recessed 3 | x −225…−140, y 45…175 | `POWER` raised grey (#8d8f93) text, `LABEL` font, cap 11, centred (−182.5, 162); two LED bezels: chrome ring Ø 16, green lens Ø 11 domed 2 mm, at (−203, 133) and (−162, 133); two toggle switches: knurled chrome nut Ø 12 × 3, chrome bat lever Ø 3 × 12 (ON = lever up 18°, OFF = down 18°) at (−203, 92) `rig.<id>.switch-main` and (−162, 92) `rig.<id>.switch-motor`; labels `MAIN` (−203, 72) and `MOTOR` (−162, 72) raised grey cap 6; LabSim logo (green PLA `greenPla`, raised 1.2: four-leaf glyph 14 mm + wordmark `lab` 44 mm) centred (−182.5, 54) |
| Tablet frame | 230 × 146 × 14 black frame with a 212 × 130 window; top clamp 60 × 14 × 18 at y 175…189 (over the top bar) and bottom clamp 60 × 14 × 18 with a 40 × 60 mount stem going down past the bottom bar (IMG-T) | centred (0, 110), x −115…115 | Micro-USB cable (black Ø 3.5) enters the tablet's left side at y 120 and loops left to the POWER box (IMG-T) |
| **Status tablet** (`rig.<id>.tablet`) | 8" Android tablet 210 × 128 × 9, black glass front, bezels 18.85 L/R and 10.15 T/B, front camera dot Ø 3 at top centre; active area **172.3 × 107.7 mm = 1280 × 800 px** (§5) | centred (0, 110), glass at z +3.5 | Screen stack §3.5 |
| **Side label panel** (`rig.<id>.side-panel`) | Box 85 W × 130 H × 43 deep | x +140…+225, y 45…175 | Vertical letters of `sidePanelText` (§2.10) in light-grey PLA #d9d9d9, `LABEL` font cap 26, stacked from y 160 downward with 4 mm gaps, centred x 195; two vertical USB-A ports (blue tongues) at (157, 140) and (157, 95) with vertical grey labels (cap 5) `Minix` and `Raspberry Pi` reading bottom-to-top (IMG-T); faint green edge glow from the rack LED strip |

### 2.10 Per-rig configuration (`RIGS` in `layout.ts`)

Screen sizes from §3.1. `homeX/homeZ` = the screen's top-left in bay-local mm (= gantry (0,0)). `maxX/maxY` feed `RigState.gantry.maxXMm/maxYMm`. Slot = chip-slot centre on the edge face. Power key = z of the device's right-edge power key. NFC landmark in screen mm (`x, y` from the screen top-left; values beyond the screen height are on the bottom bezel). All † except the device types.

| Rig | Rack / bay | Device (type) | Cradle | Screen W × H | homeX, homeZ | maxX, maxY | Secondary display (gantry mm) | Slot (x, y, z) | Power key z, sled rail x | NFC landmark (screen mm) | Camera target (bay-local) | Side panel text | Door side |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `wall-e` | A / 4 | Flex 3 (`FLEX_3`) | flex-cradle-gen3 | 68.0 × 136.0 | −34.0, −343.0 | 80, 148 | — | (0, 89, −160) | −335, 64 | (34.0, 111.0) | screen centre (0, 100, −275) | `SETI` (D8) | −X |
| `eve` | A / 3 | Flex 4 (`FLEX_4`) | flex-cradle-gen3 | 68.0 × 136.0 | −34.0, −346.0 | 80, 148 | — | (0, 89, −160) | −338, 64 | (34.0, 111.0) | (0, 100, −278) | — | −X |
| `r2-d2` | A / 2 | Station Duo (`STATION_DUO`): MFD head + CFD | station-duo-tray | MFD 309.9 × 174.3; CFD 172.3 × 107.7 | −154.95, −535.0 | 309.9, 352 | CFD top-left at (68.8, 239.0) | CFD edge (0, 85, −160) | −517, 198 | CFD (86.2, 119.7) | **CFD** centre (0, 100, −242) | — | −X |
| `bumblebee` | A / 1 | Mini 3 (`MINI_3`) | mini-dock | 172.3 × 107.7 | −86.15, −296.0 | 184, 120 | — | (0, 82.5, −160) | −298, 127 | (86.2, 119.7) | (0, 100, −242) | — | −X |
| `johnny-5` | B / 4 | Flex 1 (`FLEX_1`) → Flex 2 (`FLEX_2`) after M07/INC42 | flex-cradle-gen1 → gen2 | 62.3 × 110.7 → 68.0 × 136.0 | −31.15, −335.0 → −34.0, −348.0 | 74, 123 → 80, 148 | — | (0, 87, −160) → (0, 88, −160) | −335 → −338, 65 → 64 | (31.2, 85.7) → (34.0, 111.0) | (0, 100, −280) → (0, 100, −280) | — | +X |
| `seti` | B / 3 | Compact (`COMPACT`) | compact-cradle | 62.3 × 110.7 | −31.15, −311.0 | 74, 123 | — | (0, 85, −160) | −305, 68 | (31.2, 85.7) | (0, 100, −256) | `SETI` | +X |
| `baymax` | B / 2 | Station 2018 (`STATION_2018`) head | station-tray | 309.9 × 174.3 | −154.95, −370.0 | 309.9, 186 | — | (0, 85, −160) | −352, 198 | (155.0, 192.3) | (0, 100, −283) | — | +X |
| `rosie` | B / 1 | Flex Pocket (`FLEX_POCKET`) | flex-cradle-pocket | 68.0 × 136.0 | −34.0, −320.0 | 80, 148 | — | (0, 90, −160) | −302, 64 | (34.0, 111.0) | (0, 100, −252) | — | +X |

Mechanical check (all rigs): `cx = homeX + x − 26` stays within [−180.95, +128.95] ⊂ [−183, 183]; `az = homeZ + y` stays within [−535, −183] ⊂ [−560, −80]. When JOHNNY-5's device is swapped, the world moves both limit-switch brackets to the new home (visible re-calibration) and swaps the cradle mesh.

Collis assignment (shelf.callus level = bay number): Rack A bay n → `collis.<rig>` on the left half of Callus level n; Rack B bay n → right half. MEGATRON/OPTIMUS use SmartStripe probes (§2.12); DATA/TARS have none.

### 2.11 Animation specification

The sim owns positions and timing state (`RigState.gantry`, `solenoid`, `dipArm`, `tapArm`, `phonePusher`, `magneticLock`); the world interpolates and adds secondary motion. Values below are what the sim should use; the world must look right at these values.

| Motion | Spec |
|---|---|
| Rapid move (`move.to`, `tap.at`, xy_touch) | Coordinated XY, straight line. Per-axis max speed **120 mm/s**, vector speed cap 150 mm/s, acceleration **800 mm/s²** (trapezoid; S-curve with jerk 20 000 mm/s³ on Ultra only for visuals). A 40 mm hop ≈ 0.48 s (VID pacing). |
| Settle | After every move the drop and solenoid sway ±0.3 mm along the move direction, damped sine 18 Hz, decay 120 ms. |
| Solenoid tap (`tap.at`, xy_touch tap) | Energise → plunger travels 10 mm in **15 ms** (ease-in quad) → contact at 12 ms (tip y ≤ 100.5: the sim registers the touch) → dwell **90 ms** → release: spring return in **30 ms** with one 0.6 mm overshoot bounce → total 135 ms. Minimum interval between taps 200 ms. Optional coil glow: none (real solenoids don't glow). |
| Solenoid Down / Up | Down = same 15 ms stroke, held until Up; Up = 30 ms return. |
| Solenoid Lower / Raise | Slow variant: 10 mm in **600 ms** linear (PWM), held / released. |
| Dip In / Out | Arm rotates +35° → −20° in **450 ms** ease-in-out (In) / −20° → +35° in **380 ms** (Out); the card's last 20 mm enters the slot during the final 25 % of In and bends visibly (vertex bend 8°). Servo whine for the duration. |
| Tap In / Out | Paddle swings Out → In in **350 ms** (ease-out) + 100 ms settle; In → Out **300 ms**. |
| Phone Forward / Back | Sled 120 mm/s, accel 600 mm/s² (≈ 2.4 s end to end). |
| Push Power Button | Finger extends 6 mm in 30 ms, holds **600 ms** (long press **4000 ms**), retracts 40 ms. |
| Park All (`park.all`) | 1) solenoid Up, dip Out, tap Out, phone Back (parallel, ≤ 0.5 s); 2) **Y homes first**: arm carriage toward y = 0 at **40 mm/s** until the Y switch trips (lever depresses 2 mm, `limit-click`), back off 2.0 mm at 10 mm/s, re-approach at **5 mm/s**, second click, y := 0; 3) X homes the same way; 4) both at (0,0) → banner wipe to green (300 ms, left → right) + `park-done`. |
| Park after a lock break | Same, but in step 2/3 the belt **clamp** travels from its last commanded position toward home and, on reaching the pushed carriage, the magnets snap (`maglock-snap`, clamp-to-carriage gap closes in 40 ms) and the carriage is carried home. |
| Park XY / X / Y | XY = both axes as above; X / Y = that axis only. Banner stays yellow if the lock had been broken (curriculum S13); the sim decides. |
| Steppers Disable / Enable | Disable: holding hum stops; drivers' red LEDs off; carriages may be pushed freely (pushing still breaks the lock). Enable: hum resumes (`stepper` loop at idle level 0.15), banner per sim (yellow "NOT HOMED"). |
| Player push (`rig.<id>.carriage`, door open) | Hold LMB on the arm carriage and drag: the mouse delta is projected onto the bay's XZ plane at the carriage; the carriage follows at ≤ 200 mm/s clamped to the mechanical range; once the displacement from the clamp exceeds **3 mm** the lock visibly breaks (`maglock-break` clunk, red clamp dot) and on release the world calls `sim.rig.pushHead(rig, dxMm, dyMm)` with the total displacement (curriculum M04: ≥ 20 mm is the lesson goal). |
| MAIN off | Pi LEDs off within 50 ms, tablet screen → off (glass material), webcam LED off, MAIN LED off. MAIN on: Pi ACT flickers after 2 s; tablet boot = black 1 s → white LabMark splash 3 s → dashboard with "Connecting to robot controller…" until the sim marks the Pi up (gameplay: 40 s Pi boot). |
| MOTOR off | MOTOR LED off; holding hum stops; any running move halts instantly (no deceleration — realistic power loss). |
| LED fades | All LED on/off transitions ramp 50 ms (gameplay juice). Pi ACT flicker: random 2–12 Hz pulses, 20–60 ms each. |

---
### 2.12 Tethered bench `rack.t` — MEGATRON (DEV1) & OPTIMUS (STG), exactly as IMG-R

Rack-local frame: origin at `rack.t` footprint centre (2.40, 0, −2.05), +Z toward the aisle (front at z +0.450 → world z −1.60). Metres.

| Part | Spec |
|---|---|
| Frame | 4-post black rack 0.60 × 0.90 × 1.80, posts 45 × 45 at x ±0.2775, z ±0.4275. No rack-unit numbering (IMG-R). |
| Shelves | Black steel with **rounded-slot** perforation (`perforatedSteel` variant: slots 8 × 22 mm, staggered, pitch 18 × 32 mm, IMG-R): S0 top y 0.10, S1 0.50, **S2 0.93 (dock shelf)**, **S3 1.50 (directly above the MFD row, IMG-R top)**, top plate 1.77–1.80. |
| Device panel | Two vertical 2020 uprights (silver) at x ±0.235, z −0.05, from S2 to S3; cross members at y 1.02 and 1.43; short horizontal extrusion stubs with printed brackets protrude left of each face (IMG-R). |
| **Four faces** (front surfaces at z 0.000, vertical) | `rig.megatron.mfd` centre (−0.112, 1.340) · `rig.optimus.mfd` (+0.112, 1.340) · `rig.megatron.cfd` (−0.112, 1.120) · `rig.optimus.cfd` (+0.112, 1.120). Face 0.210 × 0.160 (Mini 3 faces 0.208 × 0.158). Devices: MEGATRON MFD = Station 2 head, MEGATRON CFD = Mini 2, OPTIMUS MFD/CFD = Mini 3 (D1, D6). Bodies extend behind the faces (Mini wedges up to 0.17 deep). The Station 2's base sits on S1 behind the docks with its cable up the left upright. |
| Face labels (IMG-R) | On each face's top bezel three separate white label-tape pieces (`labelTape`, black `LABEL` text, cap 9 mm): left `MEGATRON` / `OPTIMUS`, centre `MFD` / `CFD`, right `DEV1` / `STG`, followed by the bezel's 3 mm black sensor dot. Callout text: `MEGATRON  MFD  DEV1`, `OPTIMUS  CFD  STG`. |
| Face logos (IMG-R) | MEGATRON MFD and MEGATRON CFD: `lab` wordmark bottom-left; OPTIMUS MFD/CFD: four-leaf glyph only. Bottom-centre chip slot with **green arrow light-pipe** (60 × 8 mm: two ▲ arrows + centre bar, `ledGreen` at intensity 2.5) on every face. |
| MFD top-edge stickers | Swipe-direction icons `▶▬` black (MEGATRON MFD) and `▬▶` green (OPTIMUS MFD) at the top-left edge (IMG-R). |
| Default screens | MFDs show the **lock screen** (`3:45 PM`, `WED, NOV 5` style, §4.3); CFDs idle **dark** (screensaver, brightness 0.04) — IMG-R shows black CFD glass reflecting the shelf. |
| SmartStripe probes (y 1.200–1.260, between rows) | MEGATRON: black USB dongle 75 × 22 × 12 with green LED at x −0.235 (hanging over the left edge), its flat cable to a black card-thickness **probe blade** 85 × 54 × 0.8 printed `SmartStripe Probe` in white (upside-down, IMG-R) held in MEGATRON CFD's top-edge swipe slot by a black clamp block 40 × 30 × 25 with an M3 screw at x −0.150 → `rig.megatron.smartstripe`. OPTIMUS: dongle (green LED) at x +0.015, clamp at x +0.070, and a **white card with a black magstripe** (85.6 × 54) in OPTIMUS CFD's clamp at x +0.170 (IMG-R) → `rig.optimus.smartstripe`. |
| **Docks** on S2 front (IMG-R) | Four black printed C-holders 70 W × 150 D × 200 H at x −0.190 (`rig.megatron.dock-mfd`), −0.080 (`rig.megatron.dock-cfd`), +0.080 (`rig.optimus.dock-mfd`), +0.190 (`rig.optimus.dock-cfd`), centred z +0.36; each holds a white **LabSim connectivity hub** standing on its long edge (§3.4) with its port face toward the aisle. Base plates extend to the front lip (z +0.45) carrying black label plates with two-line white tape labels (cap 18 mm): `MEGATRON` / `MFD`, `MEGATRON` / `CFD`, `OPTIMUS` / `MFD`, `OPTIMUS` / `CFD`. |
| Shelf Pi (`rig.tethered.pi`) | Pi in a black case **standing upright** between the two inner docks at x 0.000, z +0.36, RJ45 at the top, green ACT LED and green PCB edge visible (IMG-R). Serves MEGATRON + OPTIMUS (one Pi per shelf, Ref §1). |
| Cables (IMG-R) | Hubs: Ethernet light-blue (MEGATRON) and white (OPTIMUS), USB black/white, DC power black; three red four-lobed printed cable keepers (decor); slack loops coiled on S2 between the docks. |
| Bench webcam (`rig.tethered.webcam`) | Gooseneck from S3's front lip at (0.00, 1.49, 0.40); camera at (0.00, 1.45, 0.38) aimed at (0.00, 1.23, 0.00), vertical FOV 46°. |
| Lower shelves | S1 (0.50): 8-port switch, Station 2 base, spare hub, cable box. S0 (0.10): `power.strip.t` (6-outlet strip, rear), 4 device AC bricks. S3 top: two cardboard boxes. |
| Background match | From the IMG-R viewpoint (2.55, 1.30, −0.75) looking at (2.40, 1.10, −2.10) with a 70° horizontal FOV: `room.column` fills the left edge, `wall.bins` (red over blue) appears just right of the rack, `wall.drawers` further right, `chest.husky` below the drawers — verify with a screenshot test (§10.6). |

### 2.13 ADB shelf `shelf.adb` — DATA & TARS

Shelf-local frame: origin (0.85, 0, −1.90), +Z to the aisle. Black perforated 2-tier shelf 1.00 × 0.60 × 1.05 (tiers: lower top 0.45, upper top 1.00).

| Part | Spec |
|---|---|
| `rig.data.device` | Mini 3 on its standard stand (screen tilted 30° back, facing the aisle) at (−0.25, 1.00, +0.05). |
| `rig.tars.device` | Flex 4 in an upright printed dock (70° from horizontal) at (+0.22, 1.00, +0.05). |
| Labels | White tape `DATA` and `TARS` on the front lip (y 0.99) under each device; yellow tape `ADB ONLY — NO PIN` at (0, 0.97, +0.30). |
| `rig.adb.pi` | Pi (black case) on the lower tier at (−0.30, 0.45, −0.10), Ethernet + USB to both devices. |
| Other | 5-port switch (+0.05, 0.45, −0.10), `power.strip.d` (6 outlets) on the lower tier rear, two AC bricks. |
| `rig.adb.webcam` | Gooseneck clamped to the rear-right post; camera at (0.45, 1.35, −0.25) aimed at (0.00, 1.10, 0.05). |

### 2.14 Callus shelf `shelf.callus`

Shelf-local frame: origin (−2.00, 0, −2.10), +X toward Rack B, +Z toward the aisle. Black 4-post shelf 0.60 × 1.00 × 1.95 with `perforatedSteel` levels L1–L4 at the **same heights as the bays** (0.100, 0.5445, 0.989, 1.4335) and a top plate at 1.878.

| Part | Spec |
|---|---|
| **Collis probe** (`collis.<rig>`, ×8) | Light-grey painted aluminium box 150 × 110 × 45 (`collisGrey`): front panel with a white sticker `UL Transaction Security` (plain text, no logo), a 3 mm status LED (green ready / amber no ribbon link / off unpowered — 20-gameplay), USB-B port, DC barrel input; **rear panel**: 40-pin IDC header with the grey ribbon (`ribbonGrey`) — IMG-G. Top: tape `COLLIS · <HRN>`. |
| Collis placement | Rack A bay n → left half of level n at (−0.15, Lₙ, +0.20) rotY −90 (rear panel faces Rack A; the ribbon goes straight into the bay through its open side). Rack B bay n → (+0.15, Lₙ, +0.20) rotY 90. **Level 3 exception:** probes at z −0.25 (front reserved for the Windows boxes). **Level 4:** probes at z −0.20 (front holds the console monitor). |
| Windows boxes, level 3 front (z +0.30) | `callus.minix-01` x −0.18, `callus.minix-02` x −0.06, `callus.nuc-03` x +0.06, `callus.slot-4` x +0.18 (empty unless the sim seeds NUC-01/MINIX-03). Minix: black 120 × 120 × 19, blue power LED, power button on the front. Intel NUC: 117 × 112 × 51, black body / silver top, blue LED ring power button. NUC-03 carries a yellow sticky note on top (rotated 8°): `DISK 100% — corporate AGENT. NO HARDWARE CONTROL ON THIS BOX. –J` (curriculum M05†). Tapes: `MINIX-01`, `MINIX-02`, `NUC-03`, `SPARE`. |
| 12 V distribution | Printed block with 4 barrel outputs at (0, 0.995, −0.45), fed from `F-12V` via `tray.ct2`; tape `12V · CALLUS / NUC SHELF`. |
| `callus.monitor` | 7" HDMI LCD 175 × 110 × 15 on a kickstand, tilted back 10°, at (0, 1.4335, +0.30); shows the console of the box selected by its KVM button (default MINIX-01, curriculum M10 text). |
| AC strips | `power.strip.c1` (x −0.15) and `power.strip.c2` (x +0.15) on L1 rear (z −0.40); Collis AC bricks plugged in; tapes `STRIP-C1 — COLLIS RACK A`, `STRIP-C2 — COLLIS RACK B`. |
| USB | Black USB cables from each Collis front up the posts to its Callus box (Rack A probes → MINIX-01, Rack B → MINIX-02). |

### 2.15 Build table `table.build` (BOM facts, Ref §1)

A half-built rig on the grey workbench (−4.40, 0, 0.60): a bare bay floor plate with a printed cradle, a 2040 front beam on two blocks, two loose NEMA-17s, a bag of V-wheels, a GT2 belt reel, a box `200+ M2.5 / M5 BOLTS`, a 22 AWG spool tagged `130 FT`, a clipboard `SOLDER JOINTS ≈ 300 ✓✓✓`, an unpopulated green 25-pin PCB, a blue solenoid in an anti-static bag, extrusion off-cuts, a hacksaw and a tape measure. The full **10 ft** extrusion stick hangs on the west wall (`wall.extrusion-10ft`). Inspect callouts: `10 ft aluminium rails, cut to size`, `130 ft of wiring per robot`, `~300 hand solder points`, `200+ nuts & bolts (2.5 mm and 5 mm)`, `25-pin motor controller PCB (printed in Hong Kong)`.

---

## 3. Device models

### 3.1 Device catalogue (`DeviceTypeInfo.bodyMm` / `screen` values)

Real-world-approximate dimensions; † marks LabSim-chosen values where public specs are unknown or the reference is silent. Screen px/mm is used by `render2d` (§4.1). Body `W × H × D` = width × height (upright, or length for handhelds) × depth/thickness.

| Type | Display name | Body W × H × D (mm) | Primary screen (diag, px, active mm) | Secondary | Printer | Distinctive features |
|---|---|---|---|---|---|---|
| `STATION_2018` | Station 2018 | head 350 × 232 × 30 on a swivel stand; base 330 × 105 × 230; overall 350 × 360 × 250 | 14.0", 1920 × 1080, 309.9 × 174.3 | — | yes (base) | Black-glass front with 20 mm bezels, white back shell, silver hinge arm, base with paper door and green leaf on its front; card-reader module on the head's bottom edge†. |
| `STATION_2` | Station 2† | head 210 × 160 × 28 (= IMG-R MEGATRON MFD face); base 240 × 95 × 200 | 8.0", 1280 × 800, 172.3 × 107.7 | — | yes (base) | White bezel, `lab` wordmark bottom-left, bottom chip slot with green arrow light-pipe, top-edge swipe slot (D6). |
| `STATION_DUO` | Station Duo | MFD head 350 × 232 × 30 + CFD 215 × 150 × 30 on the stand's back; base 330 × 105 × 230 | MFD 14.0", 1920 × 1080, 309.9 × 174.3 | CFD 8.0", 1280 × 800, 172.3 × 107.7 (ADB-blind on legacy UIA, Ref §3) | yes | Two screens back-to-back on one stand; CFD has the card reader (chip slot bottom edge, swipe top edge). |
| `STATION_DUO_2` | Station Duo 2 | as Duo; base 330 × 70 × 230 | as Duo | as Duo | **no** | Shorter base without paper door; library card `STATION DUO 2 (NO PRINTER)`. |
| `STATION_DUO_3` | Station Duo 3 (upcoming) | sealed box 420 × 300 × 260 | — | — | — | Library only: white box with green band, label `STATION DUO 3 — UPCOMING`. |
| `MINI_2` | Mini (2nd gen) | face 210 × 160; wedge body 210 W × 125 H (rear) × 170 D, front edge 35 thick | 8.0", 1280 × 800, 172.3 × 107.7 | — | yes (rear) | White bezel, `lab` wordmark, chip slot + green arrows, top-edge swipe slot, separate connectivity hub. |
| `MINI_3` | Mini (3rd gen) | face 208 × 158; wedge 208 × 120 × 165, front edge 35 | 8.0", 1280 × 800, 172.3 × 107.7 | — | yes† | Slimmer bezel, four-leaf glyph only (IMG-R OPTIMUS). |
| `MINI_4` | Mini 4 (upcoming) | sealed box 260 × 220 × 200 | — | — | — | Library only: `MINI 4 — UPCOMING`. |
| `FLEX_1` | Flex (1st gen) | 84 × 205 × 26 (printer end 52 thick over the top 70) | 5.0", 720 × 1280, 62.3 × 110.7 | — | yes | White front, dark-grey back, thick bezel (top 30, bottom 64.3). |
| `FLEX_2` | Flex 2 | 82 × 218 × 24 (printer 50) | 6.0", 720 × 1440, 68.0 × 136.0 | — | yes | White, grey back band, top 30 / bottom 52. |
| `FLEX_3` | Flex 3 | 82 × 215 × 22 (printer 48) | 6.0", 720 × 1440, 68.0 × 136.0 | — | yes | White, flat back, top 32 / bottom 47; label tape `FLEX 3` and a serial sticker on the bottom bezel (VID). |
| `FLEX_4` | Flex 4 | 82 × 218 × 22 (printer 48) | 6.0", 720 × 1440, 68.0 × 136.0 | — | yes | As Flex 3 + front-camera dot and a grey textured grip band on the back; top 32 / bottom 50. |
| `FLEX_POCKET` | Flex Pocket | 82 × 172 × 20 | 6.0", 720 × 1440, 68.0 × 136.0 | — | **no** | Flex 3 body with the printer block removed (flat top end); top 12 / bottom 24. Shares the FLEX_GEN3 profile (canon). |
| `COMPACT` | LabSim Compact (CA) | 90 × 185 × 58 countertop wedge (front edge 30) | 5.0", 720 × 1280, 62.3 × 110.7† | — | yes† | White with dark-grey base, small `CA` country sticker†, top 34 / bottom 40.3; PIN-capable display (Canadian Interac flows). |

Screen margins (mm, used by §2.10): Station heads top 22 / bottom 35.7 / sides 20.05; Duo CFD top 14 / bottom 28.3 / sides 21.35; Mini 2 top 22 / bottom 30.3 / sides 18.85; Mini 3 top 22 / bottom 28.3 / sides 17.85; Station 2 head as Mini 2. Power key: right edge, 40 mm from the top end (Flex 3/4/2, Compact, Station heads), 30 mm (Flex 1, Pocket), 20 mm (Minis). NFC landmark: handhelds/Compact `(W/2, H − 25)` on screen; Minis/Station 2/Duo CFD `(W/2, H + 12)` on the bezel; Station 2018 / Duo MFD `(W/2, H + 18)`.

### 3.2 Device library placement (`library.<model>`)

East wall shelving (rotY −90, items face −X). Base top 0.90 (trays), S1 top 1.25, S2 top 1.62. Position = (x, y, z) of the item's base centre. Each item has a small white card on the shelf lip with the exact text in the last column.

| Id | Item | Position | Lip card |
|---|---|---|---|
| `library.station-2018` | Station 2018 on stand | (6.82, 1.62, −0.65) | `STATION 2018` |
| `library.station-2` | Station 2 head on its base | (6.82, 1.62, −0.27) | `STATION 2` |
| `library.station-duo-1` | Station Duo | (6.82, 1.62, 0.07) | `STATION DUO` |
| `library.station-duo-2` | Station Duo 2 | (6.82, 1.62, 0.47) | `STATION DUO 2 (NO PRINTER)` |
| `library.box-duo-3` | Sealed box | (6.80, 1.62, 0.98) | `STATION DUO 3 — UPCOMING` |
| `library.mini-2` | Mini 2 on stand | (6.85, 1.25, −0.68) | `MINI 2` |
| `library.mini-3` | Mini 3 on stand | (6.85, 1.25, −0.42) | `MINI 3` |
| `library.box-mini-4` | Sealed box | (6.85, 1.25, −0.13) | `MINI 4 — UPCOMING` |
| `library.flex-1` … `library.flex-4` | Flex 1, 2, 3, 4 upright in printed stands | (6.86, 1.25, 0.12 / 0.28 / 0.44 / 0.60) | `FLEX 1` … `FLEX 4` |
| `library.flex-pocket` | Flex Pocket | (6.86, 1.25, 0.76) | `FLEX POCKET (NO PRINTER)` |
| `library.compact` | Compact | (6.85, 1.25, 0.98) | `COMPACT (CANADA)` |

Library devices are powered off (screens use the glass material) except during M02, when the picked-up device shows its boot logo. They are draggable onto `library.trays`.

### 3.3 Shared construction recipe

Every device builder (`src/world/rigs/devices/<family>.ts`) returns a `Group` with named children: `body`, `bezel`, `glass`, `screen` (and `screen2` for the Duo CFD), `logo`, `slot`, `printer` (if any), `powerKey`, `labels`. Construction:

1. **Body**: rounded box (`RoundedBoxGeometry`, radius 4–8 mm by family) or an extruded side profile (Mini/Compact wedges, Flex printer bulge) — `labwhite` (#ecebe5) or `deviceGreyBack` (#5b5f63) for backs.
2. **Front bezel**: a thin rounded panel 0.6 mm proud of the body; white (`labwhite`) or black glass (Station 2018/Duo MFD: `screenGlass`).
3. **Screen stack** (§3.5): `screen` plane exactly the active area, 0.4 mm under the glass top; `glass` plane covering the bezel opening.
4. **Logo**: canvas decal (`labLogo` generator §6.2): wordmark variant or leaf-only; grey #8b8f93 on white bezels, white on dark.
5. **Card features**: chip slot = a dark recessed slot 64 × 2 × 10 deep on the bottom edge face (+ the green arrow light-pipe on Mini/Station 2/Duo CFD faces); swipe channel = 3 mm groove along the top edge (Mini/Station 2/CFD) or right side (Flex).
6. **Printer** (Flex/Station/Mini where `hasPrinter`): paper door outline + 58 mm paper slot; receipt paper strip mesh that extrudes during `printing` (58 mm wide, up to 120 mm, `paperWhite` with the receipt texture from `render2d.drawReceipt`).
7. **Labels**: lab tape (e.g. `FLEX 3`) + serial sticker `S/N SIM-…` (serial from the sim device) on the bottom bezel / back.

Triangle budget per device: ≤ 1.2 k (Low LOD 400). Corner radius segments 3 (Low 1).

### 3.4 Accessories

| Item | Geometry (mm) | Spec |
|---|---|---|
| LabSim connectivity hub (IMG-R) | White rounded box 120 (D) × 165 (H) × 40 (W) standing on its long edge; port face (40 × 165) from top: RJ45 with link LED, grey printed icons, round DC barrel (power in), two stacked USB-A ports | `labwhite`; port recesses dark grey; link LED green 2 mm (blinks with traffic). |
| SmartStripe probe dongle | Black USB dongle 75 × 22 × 12, green LED 3 mm on top-front, flat cable to the probe blade | LED = probe ready; off when unplugged. |
| SmartStripe probe blade | Black card 85 × 54 × 0.8, white text `SmartStripe Probe` | |
| Device AC brick | 110 × 60 × 32 white (Flex/Mini) or black (Station), embossed `18V⎓†` | Plug: NEMA 1-15 two-prong. |
| Flex charging dock (coworker desk) | White 110 × 90 × 50 cradle with pogo pins | |
| Test cards (inventory) | 85.6 × 54 × 0.76; Visa-style blue/white `TEST CARD · VISA†` and red `TEST CARD · INTERAC†`, EMV chip, black magstripe | Viewmodels (§9.5). |

### 3.5 Where the screen texture lives

* Each display is a `Mesh(PlaneGeometry(wMm/1000, hMm/1000))` named `screen` in the device's local frame, centred on the active area, facing the device's local +Z (the face normal), **0.4 mm below the glass top**. UVs map (0,0) to the screen's **bottom-left** as usual; `render2d` draws in screen-mm with (0,0) at the **top-left**, so the canvas is uploaded with `flipY = true` (three default) — do not mirror.
* Material: `MeshBasicMaterial({ map: CanvasTexture, color: brightness × 1.12, toneMapped: true })` — unlit, so screens look self-lit; peak white 1.12 × ACES ≈ 0.86 output, below the bloom threshold (1.25) so text stays crisp. When `display.brightness == 0` or the device is off, the `screen` mesh is hidden and the `glass` mesh switches to the opaque `screenGlass` material (black mirror, IMG-R CFDs).
* Glass overlay (Medium+): `glass` plane over the whole bezel opening, `screenGlassOverlay` (§6.1) — transparent, reflective; adds environment reflections and smudges. Low: no overlay.
* Canvas size = `ceil(wMm × pxPerMm)` × `ceil(hMm × pxPerMm)` with `pxPerMm` per quality (§7.4), capped at the native resolution; focused/inspected devices re-render at native resolution into a separate canvas (max 2048 px on the long side).
* Redraw when `display.rev` changes, when the minute changes on clock screens, and while a short animation runs (tap ripple 300 ms, spinner, printing). Max 3 screen redraws per frame (round-robin).
* The tablet uses the same stack: `rig.<id>.tablet.screen` 172.3 × 107.7 mm.

### 3.6 Other screens in the world

| Screen | Canvas | Content | Update |
|---|---|---|---|
| Workstation monitors | 512 × 288 (Low 256 × 144) each | "Desktop mirror": wallpaper (dark green gradient + leaf), taskbar, title bars of the apps open in `ui` state, a blurred representation of the focused app (flat colour blocks per app: Orca green, Jenkins grey/red, IntelliJ dark, terminal black with green text lines). When seated, the React desktop covers the screen instead. | 2 Hz |
| Coworker / Morgan monitors | 256 × 144 | Static: code editor, Slack-like chat, spreadsheet | once |
| `callus.monitor` | 512 × 320 | Windows console (MONO 14 px, white on #0c0c0c) of the KVM-selected box, from sim service state | on change |
| `fab.laptop-cad` | 512 × 320 | Isometric line render of a cradle (boxes/cylinders) on grey grid | once |
| `jared.scope` | 256 × 160 | Green trace on black grid, scrolling square wave | 10 Hz when within 4 m |
| Desk phone | 128 × 96 | `x4117†  09:00`, missed-call icon | per game minute |
| GPU blade | — | no screen (LEDs only) | — |
| `fab.printer-prusa` LCD / `fab.printer-bambu` screen | 128 × 64 / 192 × 108 | Print progress `47%`, temps `215/60°C` | 1 Hz |

---
## 4. Device screen UI art (render2d → canvas textures; `src/sim/devices/layouts.ts`)

The rectangles below are the **firmware truth**: `render2d` draws them and the sim hit-tests touches against them
(ARCHITECTURE "layout truth"). Orca's Screen Locations are what automation *believes*; their seed values are the
centres of these rectangles unless §4.6 says otherwise. Everything is in **mm from the screen's top-left (0,0)**,
x → right, y → down, exactly the coordinate frame of xy_touch and of the gantry (canon).

### 4.1 Rendering rules, theme and palette

* Canvas pixels = mm × `pxPerMm` (§7.4). All draw calls take mm; a helper multiplies. Text sizes are given as **font-size in mm** (cap height ≈ 0.72 × size).
* Theme: `config.properties` locks `theme=avocado` (Ref §4); LabSim's *avocado* palette below is the only theme drawn (`legacy` theme renders the same but with a grey header #5f6368 and a `LEGACY THEME` watermark — only reachable through faults).
* Touch rule: a touch at (x, y) hits the **top-most** element marked ● whose rectangle contains the point (edges inclusive). Misses hit nothing (no event besides the ripple).
* Feedback: every touch draws a ripple (circle r 0 → 6 mm, `#ffffff` α 0.35 → 0 over 300 ms; on light backgrounds `#1f2328` α 0.25) and a 1.2 mm grey dot that stays 1 s at the contact point (makes off-target taps visible on camera). When `flags.showTouchTargets` is on, every ● rectangle is outlined (1 px `#ff00ff`) with its button id in 1.6 mm text.
* Merchant chrome (merchant-facing screens only): status bar + nav bar as listed per class. Customer-facing screens are full-bleed.
* The order amounts come from the sim order (`OrderState`); currency prefix `CA$` when the merchant country is CA, else `$` (VID shows `CA$`).

| Token | Hex | Use |
|---|---|---|
| `green` | #2e9e4f | Primary buttons, merchant headers |
| `greenDark` | #1f7a3b | Status bar |
| `greenSoft` | #e6f4ea | Selected rows |
| `ink` / `inkMuted` | #1f2328 / #6b7280 | Text |
| `line` | #c9cdd3 | Borders (0.3 mm) |
| `bgMerchant` | #f4f5f7 | Merchant app backgrounds |
| `bgPanel` | #eef2f7 | Order/total panels |
| `bgCustomer` | #a9c8f2 | Customer payment flow background (VID light blue) |
| `navy` | #1f2b4a | PIN keys, customer text |
| `cancel` / `clear` / `ok` | #e8336b / #f2d21b / #2fbf5a | PIN function keys (VID magenta / yellow / green) |
| `approved` / `declined` | #2bb24c / #d83a3a | Result screens |
| `lockBg` → `lockBg2` | #04060a → #0b1220 | Lock-screen vertical gradient |
| `lockClock` | #8fb8ff | Lock-screen clock and date (IMG-R) |
| app icon colours | Register #2e9e4f, Orders #3b82f6, Transactions #8b5cf6, Sale #f59e0b, Authorizations #ef4444, Customers #14b8a6, Items #84cc16, Reports #6366f1, Employees #ec4899, Inventory #0ea5e9, Rewards #eab308, Gift Cards #f97316, Help #64748b, App Market #10b981, Settings #475569, Setup #2563eb, Dining #b45309 | Launcher tiles (white glyphs) |

Buttons: primary = `green` fill, white text; secondary = white fill, `line` border, `ink` text; corner radius 1.5 mm (P) / 2.0 mm (L8) / 3.2 mm (L14).

### 4.2 Layout classes

| Class | Reference size (mm) | Used by (testing profile → device types) | Derivation |
|---|---|---|---|
| **P** | 68.0 × 136.0 | FLEX_GEN3 (Flex 3, Flex 4, Flex Pocket), FLEX_GEN2 (Flex 2) | Tables in §4.3 (exact). |
| **P-s** | 62.3 × 110.7 | FLEX_GEN1 (Flex 1), COMPACT | P scaled: x·0.91618, y·0.81397, fonts ·0.814, rounded to 0.1 mm — **except** receipt pills and the QR shift (§4.3 receipt-options), which keep their mm sizes. |
| **L8** | 172.3 × 107.7 | MINI_GEN2 (Mini 2), MINI_GEN3 (Mini 3, Mini 4), STATION_2, STATION_DUO **CFD** | Tables in §4.4 (exact). |
| **L14** | 309.9 × 174.3 | STATION_2018, STATION_DUO **MFD** | L8 scaled: x·1.79861, y·1.61838, fonts ·1.618 — same receipt exception. Key centres listed in §4.5. |

Launcher scrolling (Ref §4: `open(appName)` scrolls vertically on Flex, horizontally on Mini/Station): P/P-s launchers scroll **vertically** in 22 mm rows; L8/L14 launchers page **horizontally** (10 apps per page).

### 4.3 Class P screens (68.0 × 136.0 mm) — exact

● = touch target (id = the button string xy_touch/Orca use). Rect = (x, y, w, h). Centre given for every ●.

**Merchant chrome (P):** status bar (0, 0, 68, 4.0) `greenDark`, game time `9:41` style 2.2 mm white at x 2, icons (Ethernet, Wi-Fi, battery) at the right; nav bar (0, 130, 68, 6) #111: ● `nav.back` (9, 130, 16, 6) c(17, 133) ◁, ● `nav.home` (26, 130, 16, 6) c(34, 133) ○, ● `nav.recents` (43, 130, 16, 6) c(51, 133) □.

**`lock`** (photo: IMG-R)

| Element | Rect / position | Content |
|---|---|---|
| Background | full | vertical gradient `lockBg` → `lockBg2` |
| Clock | digits centred x 30, baseline y 50 | `h:mm` from game time (12 h, no leading zero, e.g. `3:45`), `UI_THIN` 18 mm, `lockClock` |
| AM/PM | left edge 1.0 mm right of the digits, baseline 50 | `PM` `UI_SANS` 5.5 mm `lockClock` |
| Date | centred x 34, baseline 56 | `lab.time.dateLabel` (e.g. `WED, NOV 5`) 2.4 mm `lockClock` |
| ● `unlock` | (24, 110, 20, 14) c(34, 117) | padlock outline 5 × 6 mm #c8d6ee |
| Hint | centred, baseline 126 | `Swipe up or tap to unlock` 2.0 mm #8a97ad |
| Passcode pad (when `params.pad`) | keys = the PIN grid below with white digits on #1b2333 keys; ids `1`…`0`, `⌫` at (45, 87, 18, 14) | 4 dots at y 30 |

**`home`** (launcher; vertical scroll)

| Element | Rect | Content |
|---|---|---|
| Header | (0, 4, 68, 10) `green` | merchant name 2.6 mm white bold at x 4 baseline 10.6; leaf glyph 4 mm at (63, 9) |
| App tiles ● `<App name>` | icon 14 × 14 at column x₀ ∈ {6, 27, 48}, row y₀ ∈ {18, 40, 62, 84, 106, 128 …} (pitch 22); hit rect (x₀−2, y₀−2, 18, 22); centre (x₀+7, y₀+8) | rounded 3 mm tile in the app colour with a white glyph; label 2.0 mm `ink` centred, baseline y₀+18 |
| Scroll window | y 14 … 130 | rows with y₀ ≥ 114 are clipped until the list is scrolled (scroll step 22 mm) |
| App order | row-major | Register, Orders, Transactions · Sale, Authorizations, Customers · Items, Reports, Employees · Inventory, Rewards, Gift Cards · Help, App Market, Settings · **Setup**, Dining (only if installed) — so `Setup` is below the fold (row 6) and needs a vertical scroll |

Visible-page centres: Register (13, 26), Orders (34, 26), Transactions (55, 26), Sale (13, 48), Authorizations (34, 48), Customers (55, 48), Items (13, 70), Reports (34, 70), Employees (55, 70), Inventory (13, 92), Rewards (34, 92), Gift Cards (55, 92), Help (13, 114), App Market (34, 114), Settings (55, 114). Setup (row 6, y₀ 128) is clipped until scrolled.

**`register`**

| Element | Rect | Content |
|---|---|---|
| Header | (0, 4, 68, 9) `green` | `Register` 3.0 mm white bold, x 4, baseline 10.2; search glyph at (62, 8.5) |
| Category chips | (0, 13, 68, 6) | `All` (selected `greenSoft`), `Taxable`, `Non-tax` 2.0 mm |
| ● `Tax Item 5` | (4, 21, 29, 13) c(18.5, 27.5) | tile: white, `line` border, 1.5 mm green stripe at left; name 2.4 mm bold at (6, 26); price `$10.00` 2.2 mm `inkMuted` at (6, 31.5) |
| ● `Coffee` | (35, 21, 29, 13) c(49.5, 27.5) | `$2.50` |
| ● `Bagel` | (4, 36, 29, 13) c(18.5, 42.5) | `$3.25` |
| ● `No-Tax Item` | (35, 36, 29, 13) c(49.5, 42.5) | `$5.00`, grey stripe (non-taxable) |
| ● `Gift Card` | (4, 51, 29, 13) c(18.5, 57.5) | `$25.00` |
| ● `Custom Amount` | (35, 51, 29, 13) c(49.5, 57.5) | `+ $` |
| Order panel | (0, 66, 68, 45) `bgPanel` | `Current order` 2.4 mm bold at (4, 70.5); lines from baseline 76, pitch 5 (`1 × Tax Item 5` left, `$10.00` right-aligned at x 64); rule at y 96; `Subtotal` baseline 100, `Tax` 104.5, `Total` 2.6 mm bold baseline 109 (values right-aligned x 64) |
| ● `Review Order` | (4, 113, 60, 14) c(34, 120) | primary |

**`review-order`**

| Element | Rect | Content |
|---|---|---|
| Header | (0, 4, 68, 9) | `Review order` |
| Lines | from baseline 20, pitch 6 | name, qty, price |
| ● `Add discount` | (4, 70, 30, 6) c(19, 73) | text button, `green` 2.2 mm |
| Totals | baselines 92 / 97 / 103 | `Subtotal $10.00`, `Tax $0.83`, `Total $10.83` (3.0 mm bold) |
| ● `Pay` | (4, 113, 60, 14) c(34, 120) | primary |

**`tender-select`** (the "Pay" screen; tax test MFD_O2 taps `Pay` then `Charge`, Ref §4)

| Element | Rect | Content |
|---|---|---|
| Header | (0, 4, 68, 9) | `Payment` |
| Amount | centred, baseline 30 | `$10.83` 7 mm bold |
| Label | x 4, baseline 40 | `Select tender` 2.2 mm `inkMuted` |
| ● `Card` | (4, 44, 60, 10) c(34, 49) | selected row (green 0.5 mm outline + radio) |
| ● `Cash` | (4, 56, 60, 10) c(34, 61) | row |
| ● `Other tender` | (4, 68, 60, 10) c(34, 73) | row |
| ● `Charge` | (4, 113, 60, 14) c(34, 120) | primary `Charge $10.83` |

**`cash-discount-tender`** (Orca `TENDER_CASH_DISCOUNT`, curriculum S10)

| Element | Rect | Content |
|---|---|---|
| Header | (0, 4, 68, 9) | `Payment` |
| Amount | centred, baseline 22 | `$10.83` 6 mm bold |
| Prompt | centred, baseline 31 | `Pay with cash and save` 2.8 mm bold |
| Prices | x 6, baselines 37 / 42 | `Cash price  $10.50`, `Card price  $10.83` 2.2 mm |
| ● `Cash` | (4.0, 48.0, 36.0, 21.0) c(22.0, 58.5) | primary green: `Cash` 3.4 mm bold + `Save $0.33` 2.0 mm |
| ● `Card` | (43.0, 48.0, 23.0, 21.0) c(54.5, 58.5) | secondary: `Card` 3.0 mm. Orca's seeded point (62.0, 58.5) lies inside, 4.0 mm from the right edge (§4.6). |

**`payment-prompt`** (customer-facing; VID light-blue screen)

| Element | Rect | Content |
|---|---|---|
| Background | full | `bgCustomer` |
| Amount | centred, baseline 30 | `$10.83` 9 mm bold `navy` |
| Prompt | centred, baseline 38 | `Tap, insert, or swipe card` 3.0 mm `ink` |
| Icons | 15 × 15 centred at (13, 58), (34, 58), (55, 58) | contactless waves, chip card with ↓ arrow, card with → arrow; 1 Hz pulse |
| Icon labels | baselines 70 | `Tap`, `Insert`, `Swipe` 2.2 mm |
| Tap target | circle Ø 14 at (34, 111) | contactless glyph, caption `Tap here` 2.0 mm baseline 121 — the Flex NFC landmark (§2.10) |
| ● `Cancel` | (20, 124, 28, 9) c(34, 128.5) | text button `navy` 2.6 mm |

**`pin-entry`** (Secure Touch PIN pad, exactly as VID: dark keys on light blue, 0 in the right column, red/yellow/green function row)

| Element | Rect | Content |
|---|---|---|
| Background | full | `bgCustomer` |
| Amount | centred, baseline 14 | `CA$11.94` style, 5.5 mm bold `navy` |
| Title | centred, baseline 21 | `ENTER PIN` 2.6 mm `navy` |
| PIN field | (14, 25, 40, 8) white, r 1.5 | up to 6 `•` 4 mm, centred y 29 |
| ● `1` `2` `3` | (5, 36, 18, 14) c(14, 43) · (25, 36, 18, 14) c(34, 43) · (45, 36, 18, 14) c(54, 43) | keys `navy`, r 1.5, white digit 5 mm |
| ● `4` `5` `6` | y 53 → c(14, 60), (34, 60), (54, 60) | |
| ● `7` `8` `9` | y 70 → c(14, 77), (34, 77), (54, 77) | |
| ● `0` | (45, 87, 18, 14) c(54, 94) | left and middle cells of this row are empty (VID) |
| ● `Cancel` | (5, 104, 18, 14) c(14, 111) | `cancel` magenta, white ✕ 4 mm |
| ● `Clear` | (25, 104, 18, 14) c(34, 111) | `clear` yellow, `navy` ‹ backspace |
| ● `OK` | (45, 104, 18, 14) c(54, 111) | `ok` green, white ✓ |
| Footer | centred, baseline 128 | shield glyph + `Secure Touch` 2.0 mm `navy` α 0.7 |

**`tip`**

| Element | Rect | Content |
|---|---|---|
| Header band | (0, 0, 68, 14) `bgCustomer` | `Add a tip?` 3.4 mm `navy`, baseline 9 |
| Subtotal | centred, baseline 20 | `Subtotal $10.00` 2.2 mm |
| ● `15%` | (4, 26, 29, 20) c(18.5, 36) | `15%` 4 mm bold + `$1.50` 2.2 mm |
| ● `18%` | (35, 26, 29, 20) c(49.5, 36) | `$1.80` |
| ● `20%` | (4, 49, 29, 20) c(18.5, 59) | `$2.00` |
| ● `Custom` | (35, 49, 29, 20) c(49.5, 59) | ✎ |
| ● `No Tip` | (4, 75, 60, 12) c(34, 81) | secondary |

**`signature`**

| Element | Rect | Content |
|---|---|---|
| Title | centred, baseline 8 | `Please sign below` 2.8 mm `navy` |
| ● `signature.area` | (4, 12, 60, 86) | white, `line` border; baseline rule y 84 from x 8 to 60; `✕` 3 mm at (8, 82); strokes from `params.strokes` (mm polylines) drawn 0.6 mm black — the gantry signs with **Solenoid Lower** + moves + **Raise** |
| ● `Clear` | (4, 104, 29, 14) c(18.5, 111) | secondary |
| ● `Done` | (35, 104, 29, 14) c(49.5, 111) | primary |

**`processing`**: `bgCustomer`; spinner ring Ø 14 at (34, 58) (1 rev/s); `Processing…` 3 mm baseline 80; `Do not remove card` 2.2 mm baseline 86 while `cardPresent`.

**`approved`**: background `approved`; white circle Ø 30 with green ✓ at (34, 50); `Approved` 6 mm bold white baseline 80; amount 3.6 mm baseline 88; `Auth #A1B2C3†` 2.0 mm α 0.8 baseline 94. (VID ends on this green screen.)

**`declined`**: background `declined`; white circle with ✕ at (34, 50); `Declined` 6 mm baseline 80; reason 2.2 mm baseline 87 (e.g. `Card read error`); ● `Try again` (4, 113, 60, 14) c(34, 120) white outline.

**`receipt-options`** — 4 options (Orca `RECEIPT_OPTIONS_4`) and 5 options (`RECEIPT_OPTIONS_5`, "scan for receipt" QR feature, Ref §5). Centres are curriculum S10 values. Option buttons are **pills 52.0 × 5.0 mm** (x 8 … 60): small enough that the 3.0 mm QR shift makes every old 4-option point land in the gap above its button (the 48-hour regression, Ref §5).

| Element | 4-option rect / centre | 5-option rect / centre | Content |
|---|---|---|---|
| Header band | (0, 0, 68, 14) | same | `Thank you!` 3.4 mm `navy` on `bgCustomer`, baseline 9.5 |
| Paid line | baseline 22 | same | `$10.83 paid` 2.6 mm |
| Receipt glyph | 14 × 18 centred (34, 38) | same | grey line art |
| Prompt | baselines 56, 60 | same | `How would you like your` / `receipt?` 2.8 mm bold `navy` |
| QR info strip | — | (8, 61.5, 52, 3.0) | `▣ Receipts now available by QR` 1.8 mm `green` — this strip is the 3.0 mm shift |
| ● `Print` | (8, 68.5, 52, 5) c(34.0, 71.0) | (8, 71.5, 52, 5) c(34.0, 74.0) | white pill, `line` border, printer glyph + `Print` 2.6 mm |
| ● `Email` | (8, 80.5, 52, 5) c(34.0, 83.0) | (8, 83.5, 52, 5) c(34.0, 86.0) | ✉ `Email` |
| ● `Text` | (8, 92.5, 52, 5) c(34.0, 95.0) | (8, 95.5, 52, 5) c(34.0, 98.0) | 💬-style glyph `Text` |
| ● `No Receipt` | (8, 104.5, 52, 5) c(34.0, 107.0) | (8, 107.5, 52, 5) c(34.0, 110.0) | `No Receipt` |
| ● `Scan for receipt` | — | (8, 119.5, 52, 5) c(34.0, 122.0) | QR glyph + `Scan for receipt` |
| QR sub-state (`params.qr`) | — | QR (12, 30, 44, 44) from `qrPattern(orderId)`; `Scan to get your receipt` 2.8 mm baseline 84; ● `Done` (4, 113, 60, 14) c(34, 120) | |

**`printing`**: white; printer glyph at (34, 50); `Printing receipt…` 3 mm baseline 70; progress bar (14, 76, 40, 2). The device's printer mesh extrudes the paper strip in sync (§3.3).

**OOBE (Laz Automation zero-touch provisioning, Ref §1)** — all white backgrounds, header text 3.2 mm bold at baseline 12 unless stated, primary button (4, 113, 60, 14) c(34, 120):

| Screen | Elements (● centres) |
|---|---|
| `oobe-welcome` | leaf logo 24 mm `green` at (34, 40); `Welcome to LabSim` 4.6 mm bold baseline 70; `Let's set up this device` 2.4 mm baseline 77; ● `Language` (19, 90, 30, 7) c(34, 93.5) `English (US) ▾`; ● `Get started` c(34, 120) |
| `oobe-network` | `Connect to a network`; ● `Ethernet` (4, 18, 60, 10) c(34, 23) `Ethernet — Connected ✓`; ● `LAB-AUTOMATION` (4, 29, 60, 10) c(34, 34) `Wi-Fi: LAB-AUTOMATION†`; ● `GUEST` (4, 40, 60, 10) c(34, 45); ● `Next` c(34, 120) |
| `oobe-merchant` | `Activate this device`; ● `Merchant ID` field (4, 22, 60, 9) c(34, 26.5) showing the MID; ● `Activation code` (4, 36, 60, 9) c(34, 40.5) `•••• ••••`; ● `Activate` c(34, 120) |
| `oobe-employee` | `Create your passcode`; 4 dots at baseline 22; keypad 18 × 14 keys at columns c 14 / 34 / 54 and rows c 37 / 54 / 71 / 88 with digits 1–9 then `` (empty) · `0` (34, 88) · `⌫` (54, 88) (standard merchant layout); ● `Continue` c(34, 120) |
| `oobe-complete` | green ✓ circle Ø 30 at (34, 50); `You're all set` 4.6 mm baseline 80; `Merchant: <name>` 2.2 mm baseline 87; ● `Done` c(34, 120) |
| `deprovisioning` | background #0b1220; white leaf 16 mm at (34, 50); `Resetting device…` 3 mm white baseline 72; progress bar (8, 78, 52, 2.5) `green`; `Laz Automation` 1.8 mm #7b8794 baseline 128 |

**Other P screens**

| Screen | Spec |
|---|---|
| `off` | No screen mesh; glass shows `screenGlass` (black mirror). |
| `boot` | Black; white leaf 18 mm at (34, 58); `lab` wordmark 6 mm baseline 76; three dots at y 92 animating 3 Hz. |
| `customer-idle` | Screensaver: black, leaf glyph 10 mm white α 0.08 drifting 2 mm/s; display brightness 0.04 (IMG-R dark CFDs). |
| `customer-cart` | White; header band (0, 0, 68, 10) `bgCustomer` `Your order` 2.8 mm; lines from baseline 18 pitch 6; totals box (4, 96, 60, 30) `bgPanel`: `Subtotal` baseline 104 / `Tax` 111 / **`TOTAL`** 3.4 mm bold baseline 120 (values right-aligned at x 61). The total label is upper-case by default (OCR expected text `TOTAL $10.83`, curriculum S10); INC37's capitalisation fault renders `Total`. |
| `app-orders` / `app-transactions` | Header (0, 4, 68, 9) with the app name; rows (0, 13 + 10k, 68, 10): `#1001  $10.83  Paid` etc.; ● rows by their order number. |
| `app-setup` | Rows ● `Merchant`, `Network`, `Devices`, `About` (centres y 18, 28, 38, 48). |
| `app-dining` | LabSim Dining†: 3 × 3 table buttons ● `T1`…`T9`, 18 × 18 at columns c 14/34/54, rows c 26/48/70. |
| `error` | Previous screen dimmed 60 %; dialog (6, 48, 56, 34) white r 2; title `Unfortunately, <App> has stopped.` 2.6 mm (two lines); ● `OK` (44, 74, 14, 7) c(51, 77.5). |

### 4.4 Class L8 screens (172.3 × 107.7 mm) — exact

**Merchant chrome (L8):** status bar (0, 0, 172.3, 3.5); nav bar (0, 101.7, 172.3, 6.0) with ● `nav.back` c(70, 104.7), ● `nav.home` c(86.15, 104.7), ● `nav.recents` c(102.3, 104.7) (hit 14 × 6 each).

| Screen | Elements (rect (x, y, w, h); ● centre) |
|---|---|
| `lock` (IMG-R) | Gradient background; clock digits `UI_THIN` 26 mm `lockClock` centred at x 106 (0.615 W), baseline 44; `PM` 7.5 mm right of the digits, baseline 44; date 2.4 mm centred x 106 baseline 49.5; ● `unlock` (76, 84, 20, 16) c(86, 92); hint baseline 99. |
| `home` | Header (0, 3.5, 172.3, 9) `green`; icons 18 × 18 at column centres x 22, 54, 86, 118, 150 and row centres y 32, 68 (hit (cx−12, cy−11, 24, 28)); labels baseline cy+13; page dots at y 96. **Page 1**: Register, Orders, Transactions, Sale, Authorizations / Customers, Items, Reports, Employees, Inventory. **Page 2**: Rewards, Gift Cards, Help, App Market, Settings / **Setup**, Dining. Horizontal swipe changes page. |
| `register` | Header (0, 3.5, 172.3, 8) `Register`; tiles 32 × 24 at x₀ 4 / 39 / 74, y₀ 16 / 44: ● `Tax Item 5` c(20, 28), ● `Coffee` c(55, 28), ● `Bagel` c(90, 28), ● `No-Tax Item` c(20, 56), ● `Gift Card` c(55, 56), ● `Custom Amount` c(90, 56); order panel (110, 11.5, 62.3, 90.2) `bgPanel`: `Current order` at (114, 18), lines from baseline 25 pitch 6, `Subtotal` 72, `Tax` 78, `Total` 3.4 mm bold 85; ● `Review Order` (114, 87, 54, 12) c(141, 93). |
| `review-order` | Lines x 4…106 from baseline 18; ● `Add discount` (4, 84, 34, 8) c(21, 88); totals at x 114: `Subtotal` 60, `Tax` 67, `Total` 4 mm bold 76; ● `Pay` (114, 87, 54, 12) c(141, 93). |
| `tender-select` | Amount `$10.83` 10 mm bold centred x 55 baseline 34; rows (8, 46/58/70, 90, 10): ● `Card` c(53, 51), ● `Cash` c(53, 63), ● `Other tender` c(53, 75); ● `Charge` (114, 87, 54, 12) c(141, 93). |
| `cash-discount-tender` | Prompt `Pay with cash and save` 4 mm bold centred baseline 22; prices baselines 30 / 36; ● `Cash` (20, 46, 62, 34) c(51, 63) primary; ● `Card` (96, 46, 56, 34) c(124, 63) secondary. |
| `payment-prompt` | `bgCustomer`; amount 12 mm bold `navy` centred x 60 baseline 40; prompt 4 mm baseline 52; icons 16 mm at (130, 22) Tap, (130, 50) Insert, (130, 78) Swipe with labels to their right; ● `Cancel` (8, 88, 40, 10) c(28, 93). (NFC landmark is on the bottom bezel, §3.1.) |
| `pin-entry` | `bgCustomer`; left panel: amount 7 mm bold centred x 40 baseline 30, `ENTER PIN` 3 mm baseline 40, PIN field (12, 46, 56, 10), `Secure Touch` footer baseline 100. Keys 23 × 17 at columns x₀ 86 / 111 / 136 (centres 97.5 / 122.5 / 147.5) and rows y₀ 6 / 25 / 44 / 63 (centres 14.5 / 33.5 / 52.5 / 71.5): ● `1` `2` `3` / `4` `5` `6` / `7` `8` `9` / (empty) (empty) ● `0` c(147.5, 71.5); function row y₀ 82, h 18: ● `Cancel` c(97.5, 91), ● `Clear` c(122.5, 91), ● `OK` c(147.5, 91). |
| `tip` | Header band (0, 0, 172.3, 12) `Add a tip?`; ● `15%` (8, 30, 36, 30) c(26, 45), ● `18%` c(66, 45), ● `20%` c(106, 45), ● `Custom` c(146, 45) (x₀ = 8 + 40k); ● `No Tip` (56, 72, 60, 12) c(86, 78). |
| `signature` | Title baseline 8; ● `signature.area` (8, 12, 156, 70); ● `Clear` (8, 88, 76, 12) c(46, 94); ● `Done` (88, 88, 76, 12) c(126, 94). |
| `processing` / `approved` / `declined` | As P, centred: icon circle Ø 32 at (86, 40); title 7 mm baseline 72; amount baseline 82; ● `Try again` (56, 88, 60, 12) c(86, 94). |
| `receipt-options` | Header band `Thank you!` (0, 0, 172.3, 12); prompt `How would you like your receipt?` 3.4 mm bold centred baseline 22; 5-option QR strip (36, 25, 100, 3.0). Pills **100 × 5.0 mm** at x 36.15 … 136.15: **4-option** ● `Print` c(86.15, 39.5), ● `Email` c(86.15, 53.5), ● `Text` c(86.15, 67.5), ● `No Receipt` c(86.15, 81.5); **5-option** (+3.0 mm) ● `Print` c(86.15, 42.5), ● `Email` c(86.15, 56.5), ● `Text` c(86.15, 70.5), ● `No Receipt` c(86.15, 84.5), ● `Scan for receipt` c(86.15, 98.5). QR sub-state: QR (20, 20, 50, 50), text at x 80 baseline 45, ● `Done` (96, 80, 60, 12) c(126, 86). |
| `customer-cart` | Header band (0, 0, 172.3, 10) `Your order` 3.2 mm; item lines x 8 … 100 from baseline 18 pitch 7; totals panel (110, 16, 56, 60) `bgPanel`: `Subtotal` baseline 30, `Tax` 40, rule at 45, **`TOTAL`** 4.4 mm bold baseline 55 (values right-aligned x 162). Expected strings: `Subtotal $10.00`, `Tax $0.83`, `TOTAL $10.83` (curriculum S11). |
| OOBE | Primary buttons (112, 88, 56, 12) c(140, 94). `oobe-welcome`: logo 22 mm at (86, 34), title baseline 62, ● `Get started`. `oobe-network`: rows (20, 16 + 12k, 132, 10) ● `Ethernet` c(86, 21), ● `LAB-AUTOMATION` c(86, 33), ● `GUEST` c(86, 45), ● `Next`. `oobe-merchant`: ● `Merchant ID` (30, 20, 112, 10) c(86, 25), ● `Activation code` (30, 36, 112, 10) c(86, 41), ● `Activate`. `oobe-employee`: dots at (40, 30); keypad as the PIN grid with the standard bottom row (empty, `0`, `⌫`) at centres (97.5/122.5/147.5, 71.5); ● `Continue`. `oobe-complete`: ✓ at (86, 36), title baseline 66, ● `Done`. |
| `boot` / `off` / `customer-idle` / `deprovisioning` / `error` / `app-*` | Centred analogues of P: logo at (86, 46); deprovisioning bar (36, 70, 100, 3); error dialog (46, 30, 80, 40) with ● `OK` (104, 60, 18, 8) c(113, 64); app lists rows (0, 12 + 10k, 172.3, 10). |

### 4.5 Derived key centres (P-s and L14)

Computed with the §4.2 scale factors (receipt pills keep 5.0 mm height, QR shift stays **3.0 mm**: P-s 5-option = 4-option + 3.0; L14 likewise).

| Screen · button | P-s (62.3 × 110.7): FLEX_GEN1, COMPACT | L14 (309.9 × 174.3): STATION_2018, Duo MFD |
|---|---|---|
| register · `Tax Item 5` | (16.9, 22.4) | (36.0, 45.3) |
| register · `Review Order` | (31.2, 97.7) | (253.6, 150.5) |
| review-order · `Pay` | (31.2, 97.7) | (253.6, 150.5) |
| tender-select · `Charge` | (31.2, 97.7) | (253.6, 150.5) |
| cash-discount · `Cash` / `Card` | (20.2, 47.6) / (49.9, 47.6) | (91.7, 102.0) / (223.0, 102.0) |
| PIN `1` `2` `3` | (12.8, 35.0) (31.2, 35.0) (49.5, 35.0) | — (Station heads have no PIN pad; PIN entry happens on the Duo **CFD**, L8) |
| PIN `4`–`9` rows | y 48.8 / 62.7 | — |
| PIN `0` | (49.5, 76.5) | — |
| PIN `Cancel` / `Clear` / `OK` | (12.8, 90.4) / (31.2, 90.4) / (49.5, 90.4) | — |
| receipt 4-opt Print / Email / Text / No Receipt | x 31.2; y 57.8 / 67.6 / 77.3 / 87.1 | x 155.0; y 63.9 / 86.6 / 109.2 / 131.9 |
| receipt 5-opt (+ Scan) | y 60.8 / 70.6 / 80.3 / 90.1 / 99.9† | y 66.9 / 89.6 / 112.2 / 134.9 / 157.6† |
| payment-prompt · `Cancel` | (31.2, 104.6) | (50.4, 150.5) |
| tip · `15%` `18%` `20%` `Custom` / `No Tip` | (16.9, 29.3) (45.4, 29.3) (16.9, 48.0) (45.4, 48.0) / (31.2, 65.9) | (46.8, 72.8) (118.7, 72.8) (190.7, 72.8) (262.6, 72.8) / (154.7, 126.2) |

† 5th option centre = 4-option `No Receipt` + scaled pitch + 3.0 mm.

Hit tolerance reference (for incident designers): receipt pills ±2.5 mm vertical; PIN keys ±7 × ±9 (P); `Charge`/`Pay`/`Review Order` ±7 vertical (P); tender `Card` ±11.5 horizontal. A legacy Offset only *misses* when it exceeds those half-sizes (e.g. 20-gameplay INC14's "misses Charge" needs Offset Y ≥ 7.5 mm on P, or target the receipt pills with ≥ 2.6 mm). Log strings that quote mm values must be generated from these tables (INC14's `PAYMENT/Charge` on FLEX_GEN3 is (34.0, 120.0) + offsets).

### 4.6 Orca screen names ↔ device screens, and seed Screen Locations

| Orca screen (`OrcaScreen.name`) | Device `ScreenName` (+ params) | Buttons (seeded at the ● centre unless overridden) |
|---|---|---|
| `LOCK` | `lock` | `unlock` |
| `HOME` | `home` (page / scroll 0) | app names on the first page |
| `REGISTER_HOME` | `register` | `Tax Item 5`, `Coffee`, `Bagel`, `No-Tax Item`, `Gift Card`, `Custom Amount`, `Review Order` |
| `REVIEW_ORDER` | `review-order` | `Add discount`, `Pay` |
| `PAYMENT` | `tender-select` | `Card`, `Cash`, `Other tender`, `Charge` |
| `TENDER_CASH_DISCOUNT` | `cash-discount-tender` | `Cash`, `Card` — **FLEX_GEN3 override: `Card` = (62.0, 58.5)** (curriculum S10; inside the button) |
| `PAYMENT_PROMPT` | `payment-prompt` | `Cancel` |
| `TIP` | `tip` | `15%`, `18%`, `20%`, `Custom`, `No Tip` |
| `SIGNATURE` | `signature` | `Clear`, `Done` |
| `PIN_ENTRY` | `pin-entry` | `0`–`9`, `Cancel`, `Clear`, `OK` |
| `DECLINED` | `declined` | `Try again` |
| `RECEIPT_OPTIONS_4` | `receipt-options` (`receiptOptions = 4`) | `Print`, `Email`, `Text`, `No Receipt` |
| `RECEIPT_OPTIONS_5` | `receipt-options` (`receiptOptions = 5`) | + `Scan for receipt` |
| `RECEIPT_QR` | `receipt-options` (`params.qr`) | `Done` |
| `OOBE_WELCOME` / `_NETWORK` / `_MERCHANT` / `_EMPLOYEE` / `_COMPLETE` | `oobe-*` | as §4.3/§4.4 |
| `ERROR_DIALOG` | `error` | `OK` |

FLEX_GEN3 seed check (curriculum S10): `RECEIPT_OPTIONS_4` Print (34.0, 71.0), Email (34.0, 83.0), Text (34.0, 95.0), No Receipt (34.0, 107.0); `RECEIPT_OPTIONS_5` Print (34.0, 74.0), Email (34.0, 86.0), Text (34.0, 98.0), No Receipt (34.0, 110.0), Scan for receipt (34.0, 122.0); `TENDER_CASH_DISCOUNT` Cash (22.0, 58.5), Card (62.0, 58.5) — all consistent with §4.3. M09's ruler snaps to the drawn **centre** of the measured button (Print reads `Y 74.0 mm` on the 5-option firmware).

### 4.7 Printed receipt (`render2d.drawReceipt`)

58 mm thermal paper, 384 px wide (6.62 px/mm), `MONO` 2.6 mm, black on `paperWhite`, centred header: merchant name (bold), `123 LAB WAY · TEST CITY†`, date/time from game clock; items (name left, price right); `Subtotal`, `Tax`, `Tip`, `TOTAL` (bold); `VISA **** 1111†` / `INTERAC **** 4242†`; `AUTH A1B2C3†`; `APPROVED`; `Thank you!`; a QR block when printed from the 5-option flow. Paper strip mesh length = receipt height (max 120 mm visible, then it curls).

---
## 5. Status tablet dashboard (IMG-T) — `render2d.drawTablet` + the React tablet overlay

The 3D texture (`drawTablet`) and the zoomed React overlay (`ui.overlay = {kind:'tablet'}`) draw the **same layout**
from one constants module (`src/render2d/tabletLayout.ts`). Logical canvas **1280 × 800 px** = the 172.3 × 107.7 mm
active area (7.43 px/mm); lower-quality textures scale the whole canvas (§7.4). Coordinates below are logical px,
(0,0) top-left.

### 5.1 Structure

| Region | Rect (x, y, w, h) | Spec |
|---|---|---|
| Frame / background | (0, 0, 1280, 800) | light blue `#6aa0e0` (visible as the margins around the content panel, IMG-T) |
| **Header** | (0, 0, 1280, 112) | Horizontal gradient (green state): 0.00 `#1fcf4f`, 0.45 `#2bd862`, 0.70 `#3fdc9a`, 0.86 `#52c9d6`, 1.00 `#5ab7ee` (green → cyan → light blue, IMG-T) |
| Robot name | left x 150, baseline 82 | `OrcaRobot.humanReadableName` (e.g. `WALL-E`; JOHNNY-5 shows the typo `JONNY-5` while Orca has it), `UI_SANS` 800 weight, 64 px, `#121212`; shrink to fit 380 px |
| LabSim logo | x 560 … 860, baseline 78 | four-leaf glyph (4 circles r 15 px in a 2 × 2, 4 px gaps, + stem notch) and wordmark `lab` 56 px weight 600; colour `rgba(255,255,255,0.55)` (the light, translucent logo of IMG-T) |
| Status line | left x 1000, baseline 46 | `Status: ` + `RigState.tablet.statusText` (`OK` normally), 22 px weight 500 `#1a1a1a`; shrink to fit 270 px (min 15 px), wrap to 2 lines if still too long |
| Board line | left x 1000, baseline 76 | `RigState.tablet.brainbox` → `Brainbox v6`, 22 px `#1a1a1a` |
| **Tabs** | y 112 … 160 | `Robot` (0, 112, 427, 48), `Robot Control` (427, 112, 426, 48), `Motion Control` (853, 112, 427, 48); unselected `#6aa0e0` with white 22 px label centred; selected `#18803c` (dark green, IMG-T) |
| Content panel | (40, 160, 1200, 616) | `#1d2741` dark navy; frame colour shows at left/right 40 px and bottom 24 px |
| Heartbeat dot† | circle r 7 at (782, 178) | `#39e46b` pulsing 1 Hz while the tablet ↔ Pi link is up (IMG-T shows a green dot under the tab bar); grey `#6b7280` otherwise |
| Quip strip (20-gameplay §5.3) | (40, 196, 1200, 40) | `rgba(0,0,0,0.35)`, italic 22 px white text at x 60 baseline 224, shown 6 s; hidden in Strict realism and under the lockout overlay |

### 5.2 Motion Control tab (exact, IMG-T)

Group labels: white `UI_SANS` bold 22 px, centred over the group, **baseline 330** for every group (the stair-step in IMG-T is perspective). Buttons: corner radius 10 px, vertical gap 6 px, label white 26 px weight 500 with a 1 px `rgba(0,0,0,0.25)` drop shadow; **blue** `#1e88e5` (vertical gradient `#2b95f2` → `#1a7fd6`), **yellow** `#d4b94c` (gradient `#dcc35a` → `#cbb044`).

| Group (centre x, width) | Button | Colour | Rect (x, y, w, h) | Command (`RigCommandName`) |
|---|---|---|---|---|
| **Steppers** (183, 150) | `Enable` | blue | (108, 342, 150, 64) | `steppers.enable` |
| | `Disable` | yellow | (108, 412, 150, 64) | `steppers.disable` |
| **Park** (387, 150) | `Park All` | blue | (312, 342, 150, 64) | `park.all` |
| | `XY` | yellow | (312, 412, 150, 64) | `park.xy` |
| | `X` | yellow | (312, 482, 150, 64) | `park.x` |
| | `Y` | yellow | (312, 552, 150, 64) | `park.y` |
| **Dip** (582, 104) | `In` | blue | (530, 342, 104, 64) | `dip.in` |
| | `Out` | yellow | (530, 412, 104, 64) | `dip.out` |
| **Tap** (772, 100) | `In` | blue | (722, 342, 100, 64) | `tap.in` |
| | `Out` | yellow | (722, 412, 100, 64) | `tap.out` |
| **Phone** (955, 150) | `Forward` | blue | (880, 342, 150, 64) | `phone.forward` |
| | `Back` | yellow | (880, 412, 150, 64) | `phone.back` |
| | `Push` / `Power` / `Button` (3 lines, 24 px, line-height 30) | blue | (880, 482, 150, 134) | `phone.pushPower` |
| **Solenoid** (1132, 118) | `Down` | blue | (1073, 342, 118, 64) | `solenoid.down` |
| | `Up` | yellow | (1073, 412, 118, 64) | `solenoid.up` |
| | `Lower` | blue | (1073, 482, 118, 64) | `solenoid.lower` |
| | `Raise` | yellow | (1073, 552, 118, 64) | `solenoid.raise` |

State highlights: the button matching the current state (Steppers `Disable` when steppers are disabled — gameplay INC13; Dip/Tap `In`/`Out`; Phone `Forward`/`Back`; Solenoid `Down`/`Up`) gets a 4 px white inner outline and +10 % brightness. Pressed: darken 18 % and shift 2 px down for 120 ms + `tablet-tap` sound. Rejected command (sim returns error): button flashes `#e04b3c` for 200 ms + `ui-fail`.

### 5.3 Robot and Robot Control tabs (†, sim-only content)

**Robot tab** — key/value list at x 80 (labels 22 px `#9fb3d6`) / x 420 (values 24 px white), first baseline 230, pitch 48: `Name` → `wall-e`; `Human Readable Name` → `WALL-E`; `Orca status` → chip (colours = the Orca app's status chips; defaults Available `#2e9e4f`, Unavailable `#8b5cf6`, Offline `#6b7280`, Connection Failed `#dc2626`, Reserved `#2563eb`); `Device` → `FLEX_3 · SIM-…`; `Device IP` → `10.42.30.11:5444`; `Robot Pi` → host IP; `Camera` → stream URL (truncated); `Last health check` → `09:35:00 · 200 OK`; `Magnetic lock` → `ENGAGED` / `RELEASED`. Mini-map box (760, 200, 440, 300): device-screen outline to scale, crosshair + 12 px dot at the gantry position (green; yellow when the lock is released), text `X 12.0 mm   Y 58.5 mm` baseline 540, `Home = limit switches (0,0)` baseline 572.

**Robot Control tab** — jog pad centred (400, 440): blue arrow buttons 110 × 80 (▲ = −Y toward the screen top, ▼ +Y, ◀ −X, ▶ +X) around a green `Tap` button (centre) → `move.to` / `tap.at`; step selector segmented control (220, 600, 360, 56) `0.1 mm | 1 mm | 10 mm`; yellow buttons 300 × 70 at x 670: `Go to (0,0)` (y 300), `Go to centre` (y 390); blue `Wake screen` (y 480) → `phone.pushPower`; readout `X … Y …` at (670, 600). These are illustrative conveniences; every one maps to an existing `RigCommandName`.

### 5.4 Banner states and overlays

| State (`RigState.banner` / flags) | Header | Status text (D5) | Content |
|---|---|---|---|
| `green` | gradient §5.1 | `Status: OK` | normal |
| `yellow` | gradient `#f2c12e` → `#f7d86a` → `#f2e08c`; name stays `#121212` | `Status: LOCK RELEASED — PARK REQUIRED` (lock broken) or `Status: NOT HOMED — PARK REQUIRED` (after Steppers Enable / MOTOR restored) | normal; Park group buttons pulse (outline α 0.4 ↔ 1, 1 Hz) |
| `grey` | gradient `#8b9099` → `#a3a8b0` | `Status: Controller unreachable` | panel shows `Reconnecting to robot controller…` 26 px `#c9d2e3` centred + spinner; buttons hidden |
| `red` | gradient `#e04b3c` → `#ef7a5a` | `Status: FAULT — <reason>`† | normal, buttons enabled |
| **Lockout** (`dashboardLocked`) | unchanged | unchanged | Overlay over (0, 112, 1280, 688) `rgba(8,12,22,0.80)`: padlock glyph 96 px white at (640, 330); line 1 `TEST IN PROGRESS — CONTROLS LOCKED` bold 34 px white centred baseline 450; line 2 `<job> #<n>` (e.g. `Java/uia-remote-regression-flex #4120`) 24 px `#b9c6dc` baseline 492; line 3 `Checked out via Orca · unlocks when the build finishes`† 20 px `#8ea0bf` baseline 528. Any tap: overlay shakes ±6 px for 200 ms + quiet `ui-fail`; no command is sent. |
| Booting (MAIN just on) | black 1 s → white leaf splash 3 s → normal layout with `Connecting…` in the panel until the Pi is up | — | |
| Off (MAIN off) | screen mesh hidden, glass = `screenGlass` | — | |

Banner colour changes play a 300 ms left-to-right wipe of the header (20-gameplay §5.2). Colour-blind mode prefixes the status with a glyph: green `●`, yellow `▲`, grey `■`, red `✖`.

### 5.5 Zoomed overlay

`E` on `rig.<id>.tablet` focuses the camera (§9.3) and opens the React overlay that renders the same layout at the tablet's on-screen size (pointer unlocked, clicks map to the px rects above). The 3D texture keeps updating underneath at 10 Hz max. `Esc` or walking away (> 2.5 m) closes it.

---

## 6. Materials and procedural textures

### 6.1 PBR material palette (`MaterialLibrary`)

Existing palette entries keep their current values (from `src/engine/materials.ts`); additions are created with `materials.get(name, factory)` under the names below. MS = `MeshStandardMaterial`, MP = `MeshPhysicalMaterial`, MB = `MeshBasicMaterial`.

| Name | Type | Colour | Rough | Metal | Extras / maps | Used for |
|---|---|---|---|---|---|---|
| `blackPla` (existing) | MP | map `plaLayers('#222224')` | 0.74 | 0 | normal 0.35, sheen 0.35 (#3a3a3c, 0.8), specularIntensity 0.6, box-projected 16 mm tile | All black printed fixtures, fascia, cradles, docks |
| `blackSteel` (existing) | MS | #1e1f21 | 0.50 | 0.05 | | Rack posts, frames |
| `perforatedSteel` (existing) | MS | map | 0.50 | 0.05 | alphaMap (alphaTest 0.5), normal 0.6, DoubleSide | Shelves (slots 6 × 30) |
| `perforatedSteelRounded` | MS | as above with `perforatedSteel({rounded:true, holeMm:8, slotMm:22, pitch:[18,32]})` | 0.50 | 0.05 | | `rack.t` shelves (IMG-R) |
| `hexMesh` (existing) | MS | map | 0.45 | 0.35 | alphaTest, DoubleSide, 7 mm hex / 1.3 mm bar | Bay back panels, side doors |
| `aluminium` (existing) | MS | (1.08, 1.08, 1.10) | map 0.26–0.42 | 1 | brushed map, env 1.1 | 2020/2040 extrusions |
| `labwhite` (existing) | MP | #ecebe5 | 0.45 | 0 | clearcoat 0.12 / 0.4 | Device bodies, hubs |
| `screenGlass` (existing) | MP | #06080a | 0.06 | 0 | clearcoat 1 / 0.03, ior 1.52, env 1.3 | Screens when off, black bezels |
| `rubber`, `copper`, `pcbGreen`, `wallPaint`, `floor`, `ceiling`, `wood`, `plasticGrey` (existing) | | as implemented | | | | |
| `ledGreen` / `ledRed` / `ledBlue` / `ledAmber` (existing) | MS | #2bff6a / #ff2614 / #2f6bff / #ffa516 | 0.3 | 0 | emissive = colour × 7 (blue × 9.1) | Indicator LEDs |
| `ledStripGreen` | MS | #0a3a1a | 0.4 | 0 | emissive #2bff6a × **2.2** | Rack front-post strips |
| `chipArrowGreen` | MS | #0b2a14 | 0.3 | 0 | emissive #39ff7a × 2.5 | Chip-slot light pipes (IMG-R) |
| `screenGlassOverlay` | MP | #000000 | 0.04 | 0 | transparent, opacity 0.10, clearcoat 1, env 1.6, depthWrite false, roughnessMap `smudge` | Glass over lit screens (Medium+) |
| `screenLit` | MB | white × brightness × 1.12 | — | — | map = screen canvas, toneMapped true | Device / tablet / monitor screens |
| `greenPla` | MS | #2fd468 | 0.60 | 0 | normal `plaLayers` 0.3 | LabSim logo on the POWER panel |
| `greyPlaText` | MS | #8d8f93 | 0.65 | 0 | | `POWER`, `MAIN`, `MOTOR` raised text |
| `lightGreyPla` | MS | #d9d9d9 | 0.60 | 0 | | Side-panel letters (`SETI`) |
| `orangePla` | MS | #f26a1b | 0.60 | 0 | | Prusa printed parts |
| `anodisedBlack` | MS | #141518 | 0.40 | 0.60 | | Carriage plates, door frames |
| `steelChrome` | MS | #d9dadc | 0.18 | 1 | | Toggle bats/nuts, solenoid frame, magnets, Husky pulls |
| `nylonWheel` | MP | #121212 | 0.38 | 0 | sheen 0.2 | V-wheels |
| `belt` | MS | #0e0e0e | 0.75 | 0 | normal `beltTeeth` (2 mm pitch) | GT2 belts |
| `solenoidBlue` | MP | #1f5fd6 | 0.50 | 0 | clearcoat 0.3 | Solenoid tape wrap |
| `rubberTip` | MS | #0f0f0f | 0.92 | 0 | | Plunger tip, feet |
| `coilOrange` | MP | #ff6a13 | 0.45 | 0 | clearcoat 0.4 | Coiled cable (VID) |
| `wireRed/Blue/Green/White/Black/Yellow/Orange` | MP | #d0211c / #1f4fd1 / #1f9e4a / #eeeeee / #121212 / #f2c200 / #f07d1a | 0.45 | 0 | clearcoat 0.2 | Wiring looms, DC pairs |
| `ribbonGrey` | MS | map `ribbonCable` | 0.50 | 0 | | Collis ribbons, DB-25 ribbon |
| `braidedSleeve` | MS | #141414 | 0.80 | 0 | normal `braidWeave` (8 mm tile) | Sleeves, tray drops |
| `cat6Yellow` / `cableBlue` / `cableWhite` / `cableBlack` | MS | #f2c200 / #8fb7e6 / #f0f0ee / #151515 | 0.55 | 0 | | Patch cords, USB, AC cords |
| `labelTape` | MS | #f5f5f0 | 0.55 | 0 | map = label canvas | All tape labels |
| `paperWhite` | MS | #fbfbf8 | 0.85 | 0 | | Receipts, posters, cards |
| `stickyYellow` | MS | #ffe866 | 0.90 | 0 | map = sticky-note canvas | Sticky notes |
| `cardWhite` | MS | #f4f4f2 | 0.40 | 0 | map (print) | Dip card insert |
| `collisGrey` | MS | #a9acaf | 0.55 | 0.35 | | Collis probe boxes |
| `nucBody` / `nucTop` / `minixBlack` | MS | #1a1a1c / #b8bbbf / #0f0f10 | 0.45 / 0.35 / 0.5 | 0.2 / 0.8 / 0.1 | | Windows boxes |
| `deviceGreyBack` | MS | #5b5f63 | 0.50 | 0 | | Device backs |
| `smokedPlastic` | MP | #2a2a2c | 0.25 | 0 | transparent, opacity 0.7 | Fuse caps |
| `drawerClear` | MP | #e8eef2 | 0.20 | 0 | transparent, opacity 0.35 | Organiser drawers |
| `glassClear` | MP | #dfe8ec | 0.05 | 0 | transparent, opacity 0.25 | Door vision panel, printer door |
| `binRed` / `binBlue` | MS | #c8261e / #1f4fb3 | 0.45 | 0 | | Stack bins (IMG-R) |
| `louvreGrey` | MS | #5a5e63 | 0.50 | 0.60 | alpha `louvreSlots` | Louvred bin panel |
| `huskyBlack` | MS | #121314 | 0.35 | 0.40 | | Husky chest |
| `zincTray` | MS | #b9bcbf | 0.45 | 1 | | Cable trays, threaded rods |
| `whiteboard` | MP | #f8f8f6 | 0.12 | 0 | clearcoat 0.6, map = whiteboard canvas | Whiteboard |
| `cork` | MS | #b88a5a | 0.95 | 0 | noise map | Roadmap board |
| `laminateGrey` / `esdLaminate` / `esdMat` / `butcherBlock` | MS | #c9c7c1 / #9aa3a8 / #5f7686 / wood map tinted #c8955c | 0.55 / 0.60 / 0.90 / 0.60 | 0 | | Desks / power bench / mat / Jared's bench |
| `doorGrey` / `frameGrey` | MS | #c9ccd0 / #8d9196 | 0.50 / 0.45 | 0.2 / 0.5 | | Lab door |
| `coveBlack` | MS | #1b1b1b | 0.85 | 0 | | Cove base |
| `monitorBlack` / `keycap` | MS | #0d0d0e / #1d1d1f | 0.40 / 0.60 | 0 | keycap atlas map | Monitors, tablet bezel / keyboards |
| `trofferLed` / `trofferFluor` | MS | #ffffff | 0.9 | 0 | emissive #f4f6ff × 2.0 / #fff3e0 × 1.8 (flickers) | Troffer diffusers |
| `corridorVinyl` / `corridorWall` | MS | #9b8f80 / #d8d3c8 | 0.60 / 0.88 | 0 | | Corridor |
| `cardboard` | MS | map `cardboard` | 0.90 | 0 | | Boxes |

### 6.2 Canvas texture generators

Existing in `TextureLibrary`: `perforatedSteel`, `hexMesh`, `brushedAluminium`, `plaLayers`, `floorTiles` (1.2 m tile = 4 × 4 VCT), `ceilingTiles`, `wallPaint`, `woodGrain`, `label`, `canvas`. **Add** (all deterministic: seeded by key, cached):

| Generator | Output (px) | Physical tile | Content |
|---|---|---|---|
| `perforatedSteel({rounded})` option | 1024² map + alpha + normal | 72 × 64 mm | Rounded-rectangle slots 8 × 22, staggered rows (IMG-R) |
| `rackUnitStrip()` | 64 × 2048 RGBA | one rail: 15 mm × 1866.9 mm (U1–U42) | White numbers 1–42 centred per U + 6 mm ticks at U boundaries, transparent background; left/right variants (text alignment) |
| `ribbonCable(wires = 20, stripe = '#c0392b')` | 256 × 32 | 25.4 mm wide | Grey ridged ribbon, one red edge wire |
| `braidWeave()` | 128² map + normal | 8 mm | Diagonal over-under weave |
| `beltTeeth()` | 64 × 16 normal | 2 mm pitch | GT2 tooth bumps |
| `vslotProfile(kind: '2020' \| '2040')` | `THREE.Shape` (not a texture) | 20 × 20 / 20 × 40 mm | V-slot outline: 6.2 mm slot openings, 45° V-faces, Ø 4.2 centre bores; `ExtrudeGeometry` depth = length, bevel off, curveSegments 2 |
| `pcbBoard(spec)` | 512 × 360 | 100 × 70 mm | Green mask, copper traces (random Manhattan routes seeded by rig id), pads, white silkscreen text (§6.3) |
| `fuseBlade(rating, blown)` | 64 × 96 | 19 × 18 mm blade | Rating colour (5 A tan #d2b48c, 7.5 A brown #8b5a2b, 10 A red #d0211c, 15 A blue #1f6fd1, 20 A yellow), translucent body, S-shaped link; blown = gap + brown scorch, embossed rating number |
| `stickyNote(text)` | 256² | 76 mm | Yellow paper, slight curl shading, handwriting font stack `"Segoe Print", "Marker Felt", "Comic Sans MS", cursive`, black ink 7–9 % jitter |
| `labLogo(variant: 'wordmark' \| 'leaf', colour)` | 512 × 160 / 160² | — | Four-leaf glyph (4 circles in a 2 × 2 with a small stem notch) + lowercase wordmark `lab` in `UI_SANS` 600 |
| `qrPattern(seed, modules = 29)` | 256² | — | QR-like matrix: 3 finder squares, timing rows, seeded data modules, 4-module quiet zone |
| `keycaps()` | 1024 × 256 | keyboard 440 × 135 mm | Dark keycaps with white legends (US layout) |
| `whiteboardDiagram(state)` | 2048 × 1117 | 2.20 × 1.20 m | Marker drawing of Ref §2 (§6.4); puzzle variant draws empty slots |
| `poster(id)` | 512 × 768 (landscape 768 × 512) | 0.61 × 0.91 m | §6.4 |
| `louvreSlots()` | 256² alpha | 150 mm | Louvred panel slots (hooks for bins) |
| `serialSticker(serial)` | 256 × 64 | 40 × 10 mm | White sticker: Code-128-style bars + `S/N SIM-…` |
| `meanWellLabel()` | 512 × 256 | 120 × 60 mm | Blue/silver sticker: `MEAN WELL`, model, ratings, terminal legend |
| `warningSign(text)` | 512 × 340 | 300 × 200 mm | Yellow/black hazard border, ⚡ glyph, black text |
| `cardboard()` | 256² | 300 mm | Brown kraft with flute streaks and tape |
| `copperCoil()` | 128² | 50 mm | Spiral NFC coil on black |
| `smudge()` | 512² roughness | 200 mm | Fingerprint/smudge blotches for screen glass |
| `huskyBadge()` | 256 × 64 | 120 × 30 mm | `HUSKY` silver letters on black |
| `ventGrille()` / `eggCrate()` | 256² | 600 mm | Ceiling diffuser / return grille |

Label tape (`label(text, {font: LABEL})`): white tape with 1.5 px darker edges, black text, auto width = text width + 6 mm, height = cap × 1.9.

### 6.3 Label and printed-text catalogue (exact strings)

| Where | Text | Style |
|---|---|---|
| Rack top fronts | `RACK A — TOUCH ROBOTS`, `RACK B — TOUCH ROBOTS`, `TETHERED — MEGATRON / OPTIMUS`, `ADB BOTS` | label tape, cap 14 mm |
| Bay floor front lips | rig HRN (`WALL-E` …) | label tape, cap 9 mm, left end of each bay's front lip |
| WALL-E side panel | `SETI` (vertical) + `Minix`, `Raspberry Pi` | raised PLA (§2.9) |
| SETI side panel | `SETI` | raised PLA |
| POWER panel | `POWER`, `MAIN`, `MOTOR`, LabSim logo | raised PLA |
| Devices in rigs | `FLEX 3`, `FLEX 4`, `FLEX 1` / `FLEX 2`, `FLEX POCKET`, `COMPACT`, `MINI 3`, `STATION 2018`, `STATION DUO`; serial stickers `S/N <serial>` | label tape cap 5 mm on the bottom bezel / sticker |
| Tethered faces | `MEGATRON` · `MFD` · `DEV1`; `OPTIMUS` · `MFD` · `STG`; `MEGATRON` · `CFD` · `DEV1`; `OPTIMUS` · `CFD` · `STG` | 3 tape pieces per face |
| Tethered docks | `MEGATRON` / `MFD`, `MEGATRON` / `CFD`, `OPTIMUS` / `MFD`, `OPTIMUS` / `CFD` | 2-line tape, cap 18 mm |
| SmartStripe blade | `SmartStripe Probe` | white print |
| ADB shelf | `DATA`, `TARS`, `ADB ONLY — NO PIN` | tape (last on yellow tape) |
| Collis probes | `UL Transaction Security` (front sticker), `COLLIS · <HRN>` (top tape) | |
| Callus shelf | `MINIX-01`, `MINIX-02`, `NUC-03`, `SPARE`, `12V · CALLUS / NUC SHELF`, `STRIP-C1 — COLLIS RACK A`, `STRIP-C2 — COLLIS RACK B` | tape |
| NUC-03 sticky note | `DISK 100% — corporate AGENT.` / `NO HARDWARE CONTROL` / `ON THIS BOX. –J` | sticky note† |
| Bay fuses | `F-WALL-E-5V 10A`, `F-EVE-5V 10A`, `F-R2-D2-5V 10A`, `F-BUMBLEBEE-5V 10A`, `F-JOHNNY-5-5V 10A`, `F-SETI-5V 10A`, `F-BAYMAX-5V 10A`, `F-ROSIE-5V 10A` | tape on the holder |
| Power wall | §1.5 strings; outlets `W1 · 120V` … ; strips `AC STRIP — LABSIM / COLLIS ONLY`, `STRIP-A — LABSIM / COLLIS ONLY`, `STRIP-B — …`, `STRIP-T — …`, `STRIP-D — …` | tape / sticker |
| Motor PCB silkscreen | `25-PIN MOTOR CTRL · MADE IN HONG KONG†`, `24V IN`, `SOL`, `SERVO`, `J1 DB25` | silkscreen |
| Mean Well | `MEAN WELL · INPUT 120VAC · OUTPUT 24VDC` / `LRS-600-24 · 24V 25A` | sticker |
| Regulators | `12V DC · NUC` + `24V→12V 15A†`; `5V DC · 10A` + `RACK A` / `RACK B` / `BENCH C (TETHERED + ADB)` | tape |
| Server | `GPU BLADE · 10.42.1.5 · VMs: ORCA / JENKINS / OLLAMA`, `GPU 1` … `GPU 4`, tower tag `RETIRED — replaced by GPU blade` | tape / hang tag |
| Build table | `130 FT · 22 AWG`, `200+ M2.5 / M5 BOLTS`, `SOLDER JOINTS ≈ 300 ✓✓✓`, `10 FT` | tape / clipboard |
| Jared's bench | bins `2.5 mm`, `5 mm`; red bin `SPARE PI · SD · FUSES`; blue bin `ETHERNET · USB`; drawers `M2.5 BOLTS`, `M5 BOLTS`, `M2.5 NUTS`, `M5 NUTS`, `SOLENOIDS`, `LIMIT SW`, `V-WHEELS`, `GT2 BELT`, `PULLEYS`, `RIBBON`, `CARD INSERT`, `FUSES 10A`, `HEAT SHRINK`, `ZIP TIES` (others blank) | tape |
| Husky | drawer 2 `SPARE FLEX 2`, drawer 3 `SPARE MINI 3` | tape |
| Storage cabinet | `SPARES — SIGN OUT WITH JARED` | sticker |
| Desk sticky notes (hidden in Strict) | `ADB → :5444 (NOT 5555!)`; `orca.lab.local:8080 · jenkins.lab.local:8080`; `theme=avocado · kernelType=CPA` | sticky notes |
| Workstation | `WS · 10.42.50.17` | sticker |
| Corridor | `AUTOMATION LAB · 3.14†`, `AUTHORIZED PERSONNEL ONLY` | sign |
| Safety card (curriculum S18) | `LAB SAFETY CARD` / `1. Never touch a robot while a test is running.` / `2. If you move an arm by hand, Park All before you walk away.` / `3. LabSim terminals and Collis probes go on the AC power strips — never the DC rails.` / `4. Broken rig? Tell Jared.` | printed card |

### 6.4 Posters, whiteboard and boards

| Id | Content (all text exact) |
|---|---|
| `poster.esd` | Yellow #ffd400, black ESD triangle glyph; `ATTENTION` / `OBSERVE PRECAUTIONS FOR HANDLING` / `ELECTROSTATIC SENSITIVE DEVICES` / `Wear a wrist strap at the benches`. |
| `poster.pool` | Navy; `THE POOL · 42 RIGS`; 6 × 7 grid of the 42 canon names in canon order, the 12 physical rigs in green with `●`; footer `Orca tracks them all. Gort is a repo, not a rig.` |
| `poster.5444` (Strict: hidden) | White; huge green `5444`, red struck-through `5555`; `ADB over TCP in this lab: port 5444.` / `5555 is the default — and it found our coworkers' desk devices.` |
| `poster.power` (Strict: hidden) | Flow `120V AC → MEAN WELL → 24V DC RAIL → 12V (NUCs) · 5V 10A (Pis) → INLINE FUSES`; red box `LABSIM DEVICES (18V) & COLLIS PROBES: AC STRIPS ONLY`. |
| `poster.park` (Strict: hidden) | `ARM MOVED?` → tablet header yellow `MAGNETIC LOCK BROKEN` → `PARK ALL` → `(0,0)` → header green. |
| `poster.network` (Strict: hidden) | `LAB NETWORK` table: GPU blade `10.42.1.5` · Orca `orca.lab.local → 10.42.1.10:8080` (MySQL `orca` :3306) · Jenkins `jenkins.lab.local → 10.42.1.11:8080` · Ollama `10.42.1.12:11434` · Robot Pis `10.42.10.x :8000 / :8081` · Callus boxes `10.42.20.x :9000` · LabSim devices `10.42.30.x ADB :5444` · You `10.42.50.17` · Coworker desks `10.42.60.x :5555`. Corner badge `ILLUSTRATIVE`. |
| `poster.lab` | `KEEP THE RIGS GREEN` + five status chips with one-line meanings: `AVAILABLE — open to pipelines`, `UNAVAILABLE — named jobs only`, `OFFLINE — being built, no health checks`, `CONNECTION FAILED — ping failed, see Notes`, `RESERVED — someone's running locally` (Ref §3). |
| `wall.whiteboard` (complete state) | Marker boxes (black outline, blue text): `Jenkins (Executor)` → arrow `triggers pipeline + env vars` → `Test runner (uia-remote / Pigeon)`; `Jenkins` → `checkout robot` → `Orca (Controller)`; runner → `REST: xy_touch, swipe/dip/tap` → `Orca`; `Orca` — `MySQL` cylinder; `Orca` → red `5-min health ping` → `Raspberry Pi Robot Controller (Linux)`; Pi → `ADB :5444` → `LabSim device (MFD/CFD)`; Pi → `camera stream`, `steppers / solenoid / dip / tap`, `Wine card programming`; `Windows/Minix box: Callus` → `ribbon` → `Collis probe` → `card reader`. Green marker note `Jared calibrated to true (0,0)`. Puzzle state: same boxes as loose magnets in a row at the bottom, dashed slots where they belong. |
| `wall.roadmap` | Headers `TODAY` · `IN PROGRESS` · `PLANNED` · `RETIRED / PHASING OUT`; 8 index cards (curriculum M17 text) pinned in a pile at the right until sorted. |
| `wall.history.*` | Frames: `SEMI TEAM: third-party POS SDKs · USB Pay Display · Secure Network Pay Display (link MFDs and CFDs over USB or the local network)`; `SEDI (QA) TEAM: tested Semi's apps with the Lester framework`; `IPX: Integrated Payment Experience. uia-remote tests standalone + tethered across Register, Orders, Authorizations, Sale, Transactions, Setup`; `PAYCORE: adopted uia-remote for LabSim Dining · back-to-back card matrices (Visa, Discover, AmEx) · standalone rigs kept Unavailable` (curriculum M18). Plaques: `Semi`, `Sedi`, `IPX`, `PayCore`, `Core OS`. |

---
## 7. Lighting and post-processing

Consistent with `src/engine/renderer.ts` / `postfx.ts`: physically based lights, a `RoomEnvironment` PMREM for
reflections (environmentIntensity 0.35), ACES Filmic tone mapping (exposure 1.0) applied **once** in the post chain,
bloom with HDR luminance threshold 1.25 so only LEDs and diffusers glow.

### 7.1 Light rig

| Light | Type & params | Placement | Notes |
|---|---|---|---|
| Troffer key lights `light.t01`…`t12` | `SpotLight` pointing straight down; angle 1.10 rad, penumbra 1.0, decay 2, distance 0; colour #f4f6ff (LED, ≈ 5000 K), intensity **10**; `t01` fluorescent: colour #fff3e0, intensity 8.5 | (x, 2.98, z) of each troffer (§1.7); target (x, 0, z) | `castShadow = true` on the six below with `userData.shadowPriority`; the quality preset decides how many really render shadows |
| Troffer diffusers | Emissive meshes 0.58 × 1.18 (`trofferLed`, `trofferFluor`) | ceiling | Bloom halo on Medium+ |
| Hemisphere fill | `HemisphereLight` sky #ffffff, ground #8a8780, intensity 0.5 (Low: 0.9) | — | Bounce light |
| Bench task light | `PointLight` #ffd9a8, intensity 0.6, distance 1.6, decay 2 (Medium+) | (2.70, 1.10, −4.75) | Over `bench.jared` |
| Magnifier lamp | `PointLight` #fff1e0, intensity 0.4, distance 0.8 (High+) | lamp head | |
| Corridor | `SpotLight` intensity 8, angle 1.2, penumbra 1 | (5.90, 2.68, 6.15) | Off-screen once inside |
| Flashlight (player tool, gameplay `F`) | `SpotLight` attached to the camera: angle 0.35, penumbra 0.5, intensity 6, distance 4, decay 2, no shadow | camera | Needed to read fuse windows / under-shelf labels |
| Rack green spill | Ultra: two `RectAreaLight`s per rack front (green #2bff6a, 0.02 × 1.80 m, intensity 2.0) at the front posts; Low–High: an additive floor decal (green radial gradient 0.6 × 0.6 m, opacity 0.15) at each front post | rack fronts | IMG-T green glow |

Shadow priorities (highest first): `t06` (−1.50, 0.00) rack fronts = 10; `t02` (−1.50, −3.00) rear aisle + power wall = 9; `t07` (1.50, 0.00) ADB + tethered = 8; `t11` (1.50, 3.00) desks = 7; `t03` (1.50, −3.00) Jared's bench = 6; `t05` (−5.10, 0.00) build table / whiteboard = 5. Shadow camera near 0.5, far 3.6; bias −0.0005, normalBias 0.02.

Shadow casters (`castShadow`): rack/shelf frames (merged), shelves, benches, desks, chairs, cabinets, Husky, NPCs, the build table; **rig moving parts (beam, arm, drop, solenoid) cast only on Ultra** (the head's shadow on the screen). Receivers: floor, benches, shelves, desks, device screens (Ultra).

`t01` flicker: every 6–14 s (seeded) a 150 ms sequence of intensity multipliers 0.55, 0.92, 0.60, 1.00 at 30 ms steps (light + diffuser emissive + buzz gain in sync). Reduce-Motion setting disables it.

### 7.2 Emissive budget (bloom inputs)

| Emitter | Colour | Emissive intensity | Bloom? |
|---|---|---|---|
| Indicator LEDs (POWER panel, Pi PWR/ACT, Collis, hubs, switch ports) | §6.1 | 7 (blue 9.1) | yes |
| Rack LED strips | #2bff6a | 2.2 | soft |
| Chip-slot light pipes | #39ff7a | 2.5 | soft |
| Troffer diffusers | #f4f6ff | 2.0 | soft halo |
| Device / tablet / monitor screens | canvas | `MeshBasic` ≤ 1.12 | **no** (below 1.25 → crisp text) |
| Soldering station 7-seg / scope trace | red / green | 3.0 | yes |

### 7.3 Post chain per preset

`RenderPass (HalfFloat) → N8AO → EffectPass[Bloom, HueSaturation, BrightnessContrast, ToneMapping(ACES, 1.0), Outline, DepthOfField(inspect only), Vignette] → EffectPass[SMAA]`.
Colour grade: saturation +0.06, contrast +0.05, no LUT. Vignette offset 0.35, darkness 0.45. DOF only while hold-to-inspect is active (focus = target distance, bokehScale 2.0) on High/Ultra. Interaction highlight: OutlineEffect (edge #ffffff, strength 2.5, pulse 0) on High/Ultra; emissive tint (+0.15 white) on Low/Medium.

### 7.4 Quality presets (world settings on top of `QUALITY_PRESETS`)

| Setting | Low | Medium | High (default) | Ultra |
|---|---|---|---|---|
| Target | ≥ 30 fps, integrated GPU (Intel UHD 620 / Iris Xe), 1080p | ≥ 45 fps, entry dGPU / Apple M1 | ≥ 60 fps, GTX 1660 / M1 Pro, 1080p | ≥ 60 fps, RTX 3070, 1440p |
| Pixel ratio (engine) | 0.75–1.0 (×0.85) | 0.75–1.25 | 1.0–1.5 | 1.0–2.0 |
| Troffer spot lights | **6** (one per troffer pair, at the pair midpoint, intensity 20) | 12 | 12 | 12 |
| Shadows (engine) | off → blob decals (dark radial quads, opacity 0.35) under racks, benches, desks, chairs, NPCs | 2 casters @ 1024, PCF radius 3 | 4 @ 2048, radius 4 | 6 @ 2048, radius 5 + rig moving parts |
| AO (N8AO) | off → baked contact strips: 0.15 m dark gradient where props meet the floor and walls (vertex colours) | Low, half-res, r 0.45, int 2.2 | Medium, full, r 0.5, int 2.5 | High, r 0.55, int 2.6 |
| Bloom | off | 0.75 / 5 levels | 0.85 / 6 | 0.90 / 7 |
| Colour grade | off | on | on | on |
| DOF on inspect | off | off | on | on |
| Highlight | emissive tint | emissive tint | outline | outline |
| Anisotropy | 2 | 4 | 8 | 16 |
| Tiling texture resolution | ½ (512 px) | ¾ (768) | full (1024) | full |
| Device screen px/mm (cap px) | 3 (512) | 4 (768) | 6 (1024) | 8 (1536) |
| Tablet canvas | 512 × 320 | 768 × 480 | 1024 × 640 | 1280 × 800 |
| Glass overlay on screens | off | on | on | on |
| Cable tube radial segments | 4 | 6 | 8 | 10 |
| Rig detail LOD distance (§10.4) | 3 m | 5 m | 7 m | 10 m |
| Webcam capture (live stream view) | 320 × 240 @ 4 fps | 320 × 240 @ 6 fps | 640 × 360 @ 8 fps | 640 × 360 @ 12 fps |
| Rack green spill | decal | decal | decal | RectAreaLights |
| Audio panning (engine `hrtf`) | equal-power | equal-power | HRTF | HRTF |
| Room reverb (§8.1) | off | on | on | on |

---

## 8. Audio design (WebAudio, all synthesised)

### 8.1 Buses, spatialisation, reverb

* Buses: `master` → `sfx` (spatial), `ambience` (spatial loops + the 2D room bed), `ui` (2D), **`voice`** (2D speech blips — 20-gameplay §5.1; add to the engine's bus union). Default volumes: sfx 0.8, ambience 0.4, ui 0.6, voice 0.7.
* Spatial: `PannerNode` (HRTF on High+, equal-power below), `distanceModel 'inverse'`, `refDistance` per sound (`SOUND_DEFS`), `rolloffFactor 1.2`, `maxDistance 20`. Listener = camera.
* Room reverb (Medium+): `ConvolverNode` with a procedurally generated stereo impulse response — two independent white-noise channels, 0.9 s long, exponential decay with RT60 0.55 s, a 6 kHz one-pole low-pass applied progressively, 5 ms pre-delay. Sends: sfx 0.18, ambience 0.10, ui 0.
* Voice limits: ≤ 24 concurrent voices; ≤ 12 loops; one-shots beyond the limit steal the quietest/most distant voice. Loops for rigs farther than 8 m are suspended.

### 8.2 Sound catalogue and recipes

Notation: osc `sine/square/saw/tri` with frequency; noise `white/pink/brown`; filters `LP/HP/BP f Q`; envelope `A/D` in ms (exponential unless stated); gain linear (before the catalogue level). "Engine id" = `SoundId` (existing unless marked **new**); "Gameplay cue" = 20-gameplay §5.1 id it implements.

| Engine id | Gameplay cue | Type | Recipe | Driven by |
|---|---|---|---|---|
| `stepper` | `SFX_STEPPER` | loop per moving rig (+ short one-shot variant) | Fundamental **f₀ = 5 · v** Hz (v = axis speed in mm/s; GT2 20T = 40 mm/rev, 200 full steps/rev) × 2^(st/12) per-rig offset (gameplay §5.3), clamped 20–1200 Hz. Osc A square f₀ (gain 1) + osc B saw 2f₀ (0.35) → waveshaper (soft clip k 2) → split: BP 1800 Hz Q 3 (0.6) + LP 1200 Hz (0.4). Micro-step hiss: white → BP 9 kHz Q 1.5, gain 0.04 while moving. Output gain = 0.12 · smoothstep(0, 20, v) + holding hum (sine 1.9 kHz, 0.01) while steppers are enabled. Params via `setTargetAtTime(τ 0.02)`. Homing at 5 mm/s → 25 Hz growl/ticks (realistic). | `RigState.gantry` speed each frame; position = beam carriage |
| `solenoid` | `SFX_SOLENOID_DOWN` / `_UP` | one-shot, variants `down`, `up`, `tap`, `small` | **down**: click HP-noise 3.2 kHz D 4 (0.45) + thunk sine 150 → 55 Hz D 90 (0.55) + body pink LP 900 D 45 (0.30) + glass knock BP 1.8 kHz Q 6 D 30 (0.12, only if the tip touched glass). **up**: 40 % gain, no thunk, spring ring sine 2.4 kHz D 60 (0.05). **tap** = down at t, up at t + 0.105 s. **small** (power pusher) = down × rate 1.6, gain 0.5. | `rig.solenoidTap`, Down/Up/Lower/Raise (Lower/Raise use a 600 ms soft hum instead of the click: saw 120 Hz LP 400, 0.05) |
| `servo` | `SFX_DIP_ARM` | one-shot, duration = motion | Saw 240 → 380 → 300 Hz (exp ramps at 60 % / 100 %), vibrato 32 Hz ± 7 Hz, LP 1500 Q 2.5, A 20, sustain, D 50, gain 0.06; + gear rattle BP noise 3 kHz Q 0.8, 0.015 | `rig.actuator` dip/tap |
| `card-insert` | (part of `SFX_DIP_ARM`) | one-shot | Scrape BP noise 2.5 → 1.2 kHz sweep Q 2 over 120 ms (0.08) + seat click HP noise 2 ms (0.2) | end of Dip In; test card into a reader |
| `nfc-tap` | — | one-shot | Plastic tap LP noise 1.2 kHz D 15 (0.15) + `device-beep` 60 ms later | Tap In reaching the landmark |
| `limit-click` **new** | `SFX_LIMIT_CLICK` | one-shot | White burst 2 ms HP 2 kHz (0.5) + sine 3.2 kHz D 30 (0.15) | lever contact during homing |
| `maglock-break` **new** | (GW06 feedback) | one-shot | Sine 95 → 60 Hz over 70 ms (0.6) + LP-noise 600 Hz D 40 (0.4) + metallic tick sine 4 kHz D 10 (0.08) | `rig.lockBroken` |
| `maglock-snap` **new** | — | one-shot | HP noise 5 kHz 3 ms (0.4) + sine 1.1 kHz D 25 (0.2) + sine 180 Hz D 30 (0.3) | clamp re-coupling during Park |
| `park-done` **new** | `SFX_PARK_ALL_DONE` | one-shot (at the tablet) | tri G5 783.99 Hz 80 ms → C6 1046.5 Hz 80 ms, gain 0.12 (the two limit clicks precede it naturally) | `rig.parkCompleted` |
| `banner-yellow` **new** | `SFX_BANNER_YELLOW` | one-shot (at the tablet) | square E5 659.25 → C5 523.25 Hz, 120 ms each, LP 2.5 kHz, gain 0.09 | `rig.bannerChanged` → yellow |
| `tablet-tap` **new** | — | one-shot | sine 1.2 kHz D 12 (0.08) + HP-noise tick 2 ms (0.05) | tablet button press |
| `relay` | — | one-shot | Two clicks 8 ms apart: HP noise 2.5 kHz D 3 (0.3, then 0.2) + sine 600 Hz D 10 (0.05) | MOTOR/MAIN contactor inside the panel, AC strip switches |
| `switch-toggle` | `SFX_TOGGLE` | one-shot | Two transients 8 ms apart: HP noise 1.5 kHz D 4 (0.4, 0.3) + sine 900 Hz D 15 (0.08) | MAIN/MOTOR toggles, wall switch |
| `plug-in` / `unplug` | `SFX_CONNECTOR` | one-shot | plug-in: sine 220 Hz D 20 (0.25) then 400 Hz tick D 10 (0.15) at +15 ms; unplug: reverse order + BP-noise 1.5 kHz scrape 40 ms (0.06) | all cables, fuses seated |
| `fuse-pop` | `SFX_FUSE_POP` | one-shot | 25 ms white burst (0.6) + sine 1 kHz D 20 (0.3) + crackle 150 ms (Poisson 60/s HP 3 kHz impulses, 0.08) | `power` fuse blown event |
| `spark` | `SFX_SPARK` | one-shot | 300 ms Poisson impulse train (80/s) of HP-noise 1 ms bursts (0.2) | GW03, wrong DC socket |
| `fry` **new** | `SFX_FRY` | one-shot | `fuse-pop` × 1.5 + hiss HP noise 3 kHz with 2.5 s exponential fade (0.15); ducks `room-tone` −6 dB for 1 s | `device.fried` |
| `ratchet` **new** | `SFX_BOLT` | loop while held | noise grains 20 Hz, each 3 ms BP 3.5 kHz Q 2 (0.12), ±10 % jitter | screwdriver use |
| `fan` | `AMB_RACK` | loop per emitter, variants `rack`, `box` | pink → BP 450 Hz Q 0.7 (0.05) + sine 120 Hz (0.01) + LFO 0.2 Hz ± 8 % gain; `rack` adds BP 5 kHz Q 1 (0.006) whine and random distant solenoid clacks every 4–12 s (0.2 × `solenoid`) when any rig in the rack is running a job | §8.3 emitters |
| `gpu-fans` | `AMB_GPU_BLADE` | loop | pink LP 600 Hz (0.12) + brown LP 200 Hz (0.05) + sine 120 Hz (0.02) + four fan tones sine 210 / 233 / 251 / 268 Hz (0.006 each) with LFOs 0.05–0.11 Hz ± 3 % pitch (beating). While an Ollama request runs: pitch × 1.25 and gain × 1.6 over 3 s (spin-up), back over 6 s | `ollama.requests` |
| `fluorescent` | — | loop at `light.t01` | sines 120 / 240 / 360 Hz (0.015 / 0.008 / 0.004) + ballast sizzle BP noise 6 kHz Q 4 (0.004); flicker events dip gain to 0.3 and add an HP-noise tick | §7.1 flicker |
| `ac-hum` **new** | — | loop at `power.psu.mw-1` | Mean Well fan: pink BP 700 Hz Q 0.8 (0.035) + 120 Hz buzz (square 120 Hz LP 400, 0.006); fan gain + 30 % when total DC load > 60 % | power state |
| `room-tone` | `AMB_ROOM` | 2D loop (ambience bus) | brown LP 200 Hz (0.15) HVAC + pink HP 3 kHz (0.004) air hiss | always |
| `device-beep` | — | one-shot, variants `read`, `key` | `read`: square 1760 Hz 60 ms LP 4 kHz (0.12); `key`: sine 1.2 kHz 25 ms (0.05) | card read, PIN key press |
| `device-approved` | — | one-shot | sine E6 1318.5 Hz 90 ms → A6 1760 Hz 160 ms, + tri partial 0.3, tail exp decay 0.8 s (0.14) | screen → `approved` |
| `device-error` | — | one-shot | square 440 Hz 120 ms × 2 (60 ms gap), LP 2 kHz (0.12) | `declined`, `error` |
| `printer` | `SFX_PRINTER` | one-shot, 1.2 s / receipt | noise bursts at 40 Hz (each 8 ms BP 3 kHz Q 1.5, 0.08) + feed whine sine 900 Hz ± 30 Hz FM (0.02); tear: HP-noise sweep 2 → 6 kHz 90 ms (0.12) | `printing` |
| `printer-3d` **new** | `SFX_3DPRINT` | loop per printer | stepper chirps: sine 300–700 Hz random steps every 60–180 ms (0.025) + fan pink BP 1 kHz (0.02); Bambu (enclosed) LP 2 kHz | printers "printing" |
| `keyboard` | `UI_KEY` | one-shot per key | noise grain 6 ms BP 2.2 kHz Q 1 (0.08) + sine 180 Hz D 15 (0.05), ± 15 % rate; space/enter: 140 Hz, 25 ms | typing at the workstation (world copy at the desk position; `ui-type` for the overlay) |
| `mouse-click` | — | one-shot | HP noise 4 kHz 3 ms twice, 70 ms apart (0.06) | clicks at the workstation |
| `footstep` | — | one-shot, variants `tile`, `vinyl` (corridor), `mat` | thud sine 90 → 60 Hz D 60 (0.15) + LP noise 1.8 kHz D 35 (0.08); 5 % chance squeak sine 2.8 kHz + 200 Hz glide 40 ms (0.01); `vinyl` LP 1.4 kHz; `mat` gain × 0.5; interval = 0.7 m / speed; crouch × 0.6 gain | player and NPC movement |
| `door` | — | one-shot, variants `open`, `close` | latch: HP noise 3 ms + sine 1.6 kHz D 20 (0.2); hinge creak sine 220 Hz with 7 Hz FM ± 15 Hz, 300 ms (0.02); close: + thump sine 70 Hz D 120 (0.3) + LP noise 300 Hz 100 ms (0.15) | `door.lab`, side doors (`close` at 40 % gain, no creak), Husky drawers use `drawer` |
| `badge-beep` **new** | — | one-shot, variants `ok`, `deny` | ok: sine 2.0 kHz 80 ms → 2.6 kHz 80 ms (0.15); deny: square 600 Hz 200 ms LP 2 kHz (0.12) | badge reader |
| `drawer` **new** | — | one-shot, variants `open`, `close` | rolling brown LP 500 Hz 400 ms rising (0.08) + ball-bearing rattle BP 4 kHz grains at 60 Hz (0.02); close adds a thump | Husky, organiser drawers, cabinet |
| `chair-roll` **new** | — | one-shot | brown LP 300 Hz 300 ms (0.05) | sit / stand |
| `coffee-machine` **new** | — | one-shot 6 s | pump saw 60 Hz LP 300 (0.05) + gurgles (sine blips 200–600 Hz at 8/s, BP noise) + final steam hiss HP 4 kHz 1 s (0.06) | `coffee.machine` |
| `voice-blip` **new** | `VOICE_BLIP_<speaker>` | one-shot (voice bus), 18 blips/s for the subtitle duration | 40 ms blips, ± 2 semitones random: Morgan sine 520 Hz; Jared square 330 Hz LP 1.5 kHz; Tate triangle 440 Hz; David sine 392 Hz; Riley sine 600 Hz; Sam triangle 480 Hz; Alex square 700 Hz LP 2 kHz; robots use their quip voice (WALL-E sine 300 Hz with 9 Hz ± 40 Hz vibrato; EVE clean sine 880; BUMBLEBEE BP noise 1.5 kHz "radio" bursts; R2-D2 random chirps 1.2–3 kHz glides; others triangle at 200–500 Hz) | dialogue/barks/quips |
| `ui-click`, `ui-hover`, `ui-success`, `ui-fail`, `ui-xp`, `ui-achievement`, `ui-ticket`, `ui-type` | `UI_*` | 2D | Recipes per 20-gameplay §5.1 (`ui-ticket` = `UI_TICKET_NEW`, `ui-success` = `UI_RESOLVE`/`UI_DIAG_CORRECT`, `ui-fail` = `UI_WRONG`, `ui-xp` = `UI_COMBO_UP`, `ui-achievement` = `UI_ACHIEVEMENT`); add **new** `ui-health-ping`, `ui-sla-tick`, `ui-combo-break`, `ui-build`, `ui-rank-up` for the remaining UI cues | HUD |

### 8.3 Emitter placement

| Emitter | Sound | Position (world) | refDistance |
|---|---|---|---|
| Rack A / Rack B / tethered / Callus / ADB fans | `fan` (`rack` / `rack` / `rack` / `box` / `box`) | (−2.60, 1.95, −2.10) / (−1.40, 1.95, −2.10) / (2.40, 1.70, −2.05) / (−2.00, 1.00, −2.10) / (0.85, 0.50, −1.90) | 1.2 |
| Each moving rig | `stepper`, `solenoid`, `servo`, `limit-click`, `maglock-*` | the moving part's world position (beam carriage / arm carriage / solenoid / dip pivot / switch) | 0.8 |
| Each tablet | `tablet-tap`, `park-done`, `banner-yellow` | tablet centre | 0.8 |
| Each device | `device-*`, `printer`, `nfc-tap`, `card-insert` | device screen centre / printer slot | 1.0 |
| GPU blade | `gpu-fans` | (−3.70, 1.10, −4.72) | 2.5 |
| Mean Well | `ac-hum` | (−1.75, 1.85, −4.94) | 1.0 |
| `light.t01` | `fluorescent` | (−5.10, 2.98, −3.00) | 1.5 |
| Printers | `printer-3d` | Prusa (−6.40, 1.10, −4.65), Bambu (−5.60, 1.10, −4.68) | 1.0 |
| Coffee | `coffee-machine` | (6.80, 1.10, 3.20) | 1.0 |
| Room | `room-tone` | 2D | — |

Mix rules: the sfx bus ducks ambience by −3 dB for 300 ms on `fuse-pop`, `fry`, `maglock-break`; dialogue (`voice`) ducks ambience −4 dB while a line plays. In the computer overlay, world sfx are low-passed to 1.2 kHz and −6 dB (you are focused on the screen) except the 5-minute health-ping UI cue.

---
## 9. Interaction points

### 9.1 Conventions

| Input | Meaning |
|---|---|
| `E` (or left-click) | Primary verb |
| `R` | Secondary verb (also "tool mode" when a tool is held — multimeter mode, fuse rating, card type, screwdriver bit; 20-gameplay §6.3) |
| `G` | Tertiary verb |
| hold `E` | Long press (power buttons: 4 s) — proposed `InteractVerb.holdMs` |
| LMB-drag | Draggables (gantry head, library devices, bolts, magnets, cards) — proposed `Interactable.drag` |
| hold RMB | Inspect (engine-global): FOV 70° → 35°, DOF (High+), shows the prop's `callouts` (exact strings below; ≤ 4, 4 s; become Field Manual entries) |
| Tool verbs | `E` with `requiresTool` (multimeter, screwdriver, spare fuse, ethernet cable, test card, ruler) |
| Carried item | When the hands hold a plug/device/part, targets offer `Plug` / `Place` / `Install` verbs; `Q` (gameplay) sets it down |
| Reach | default 2.2 m; parts inside bays 1.3 m; wall boards 2.5 m; GPUs 3–4 targetable only when crouched (eye ≤ 1.1 m) |
| Disabled verbs | shown greyed with the reason, e.g. `Locked — test in progress`, `Open the side door first`, `Needs: multimeter` |

### 9.2 Interactables by zone

`→` = what it calls / opens. Sim calls use `src/sim/api.ts`; "(proposed)" calls are listed in §9.6.

**Entrance & desks**

| Id | Prompt label | Verbs → effect | Inspect callouts |
|---|---|---|---|
| `door.badge-reader` | Badge reader | E **Badge in** → `badge-beep ok`, door unlocks and opens to 90° in 1.2 s | — |
| `door.lab` | Lab door | E **Open / Close** (auto-closes after 8 s when the doorway is clear) | — |
| `door.exit-button` | Exit | E **Push to exit** → opens the door | — |
| `wall.light-switch` | Lights | E **Toggle lights** (Free Play only) | — |
| `wall.safety-card` | Lab Safety Card | E **Take card** → Field Manual entry (curriculum M01) | card text (§6.3) |
| `desk.player.chair` / `.computer` / `.monitor-l` / `.monitor-r` / `.keyboard` | Your workstation | E **Sit at workstation** → `engine.focus(seated)`, `ui.overlay = computer`, pointer unlocked, `chair-roll` | `WS · 10.42.50.17` |
| `desk.player.phone` | Desk phone | E **Play voicemail** (mentor message if queued) | — |
| `desk.player.mug` | Coffee mug | E **Drink** (if filled) | — |
| `desk.player.card-reader` | USB card reader | E [test card] **Swipe test card** → workstation Card Reader utility receives the card's track data (apps doc; INC55) | — |
| `desk.player.sticky-notes` | Sticky notes | — | the three note texts |
| `tool.ruler` | Steel ruler | E **Pick up**; while held, E on any device screen **Measure** → ruler snaps to the screen's top-left (0,0) and a measurement overlay shows `X … mm  Y … mm` under the crosshair; clicking a button records its centre (curriculum M09) | `150 mm steel rule` |
| `desk.coworker-1.device` / `desk.coworker-2.device` | Coworker's Flex / Mini | E **Look at screen** (focus); R **Tap screen** → `sim.device.touch(…, 'player')` | `Desk device — ADB on 5555` |
| `npc.*` | `<Name> — <role>` | E **Talk** | — |

**Touch rigs** (every `<id>` of §2.10; R2-D2's display ids are `.mfd` / `.cfd`)

| Id | Prompt label | Verbs → effect | Inspect callouts |
|---|---|---|---|
| `rack.a.rails.u<n>-left/-right` | Rack unit `<n>` | — | `U<n>` (curriculum M01 step 9 targets U33) |
| `rig.<id>.tablet` | Status tablet — `<HRN>` | E **Use tablet** → focus (§9.3) + tablet overlay | `<HRN>` · `Status: OK` · `Brainbox v6` · `Tabs: Robot / Robot Control / Motion Control` |
| `rig.<id>.power-panel` | POWER panel | — | `POWER` · `MAIN — controller (Pi, tablet, webcam)` · `MOTOR — steppers & solenoid` · `Green LEDs: power present` |
| `rig.<id>.switch-main` / `.switch-motor` | MAIN switch / MOTOR switch | E **Turn on / off** → `sim.rig.setSwitch(id, 'main' \| 'motor', on)`; `switch-toggle` (allowed during a test — the sim scores GW07) | — |
| `rig.<id>.side-panel` | Side panel | — | `SETI — USB ports for the Minix box / Raspberry Pi` (WALL-E, curriculum M01) |
| `rig.<id>.door` | Side door | E **Open / Close** | `Hex-mesh side door` |
| `rig.<id>.carriage` | Gantry head | LMB-drag **Push head** (door open) → §2.11 → `sim.rig.pushHead(id, dx, dy)`; E **Nudge 20 mm** (accessibility: +20 mm in X) | `Carriage — magnetically coupled to the belt` |
| `rig.<id>.solenoid` | Solenoid probe | R **Re-seat connector** (shown when loose) → `sim.rig.reseat(id, 'solenoid')` (proposed) | `Blue push-pull solenoid` · `~10 mm plunger travel` · `Rubber tip` |
| `rig.<id>.stepper-x` / `.stepper-y` | X / Y stepper | — | `NEMA-17` · `GT2 pulley` · `V-slot wheels` · `2020 extrusion` (curriculum M04) |
| `rig.<id>.limit-x` / `.limit-y` | Limit switch X / Y | E **Press lever** → `limit-click` (and a tablet toast `LIMIT X`† while held) | `Limit switch — physical (0,0)` |
| `rig.<id>.dip-arm` | Dip arm | E [screwdriver 2.5 mm] **Loosen hub bolts** → mouse wheel rotates the arm one gear tooth per notch → E **Tighten** → `sim.rig.setDipAlignment(id, teeth)` (proposed) | `Dip arm` · `Sector gear "63"` · `White card insert → chip slot` |
| `rig.<id>.tap-paddle` | Tap paddle | — | `Tap paddle — Collis NFC antenna` |
| `rig.<id>.phone-sled` | Phone carriage | — | `Phone carriage & power-button pusher†` |
| `rig.<id>.motor-pcb` | Motor controller PCB | E **Move `EVE MOTION` cable to the Pi** (EVE, INC19 only) → `sim.rig.moveMotionCable(id, 'pi')` (proposed) | `25-PIN MOTOR CTRL · MADE IN HONG KONG†` |
| `rig.<id>.cradle` | Cradle | E [screwdriver 2.5 mm] **Remove / fit clamp bolts**; with bolts out and device unplugged: E **Lift device** (carry); carrying a device: E **Install** → `sim.device.swapHardware(id, type)` | `Angled 3D-printed cradle (black PLA)` |
| `rig.<id>.device` (`.mfd`, `.cfd`) | `<Device>` — `<HRN>` | E **Look at screen** (focus, upright); R **Tap screen** → `sim.device.touch(…, 'player')` (disabled while checked out); G **Power key** (hold 4 s = long press) → `sim.device.pressPower` | `<Display name>` · `Screen <W> × <H> mm` · `(0,0) = top-left` |
| `rig.<id>.device-psu` | Device power brick | E **Unplug / Plug** → socket picker (strip sockets, DC taps) → `sim.power.unplug` / `sim.power.plug` | `18V AC brick — AC strip only` |
| `rig.<id>.pi` | Raspberry Pi — `<HRN>` | E **Power-cycle** (unplug, 5 s, replug) → `sim.host.powerCycle` | `Robot Pi / Robot Controller · ~$50` · `PWR red · ACT green` |
| `rig.<id>.pi-power` | Pi power lead | E **Unplug / Plug** → `sim.power.unplug/plug('pi-<id>')` | `5V USB-C from F-<RIG>-5V` |
| `rig.<id>.pi-ethernet` | Ethernet cable | E **Unplug / Re-seat** → `sim.host.setEthernet`; R [ethernet cable] **Replace cable** | `Cat6 → rack switch` |
| `rig.<id>.fuse` | Inline fuse F-`<RIG>`-5V | E **Open / Close holder**; R **Pull fuse** (holder open); E [spare fuse] **Insert `<rating>` fuse** → `sim.power.replaceFuse`; E [multimeter] **Measure** (in / out / Ω) | `ATO blade fuse · 10 A` |
| `rig.<id>.webcam` | Webcam | E **Adjust aim** (drag ±15° yaw/pitch) → `sim.rig.aimWebcam` (proposed); R **Re-seat USB** → `sim.rig.reseatWebcam` | `Webcam → camera stream` |
| `power.strip.a` / `.b` (+ sockets `.s1`…`.s6`) | AC strip STRIP-A / -B | E **Switch on / off** → `sim.power.toggleStrip`; on a socket: E **Unplug** / **Plug** (carried plug) | `Commercial AC strip — LabSim devices & Collis probes` |
| `power.rackdist.a` / `.b` | Rack distribution | E [multimeter] **Measure 5 V / 24 V** | `5V 10A from F-5V-<rack> · 24V motor feed` |
| `rig.rack-b.camera-pi` | Rack B camera Pi | as `rig.<id>.pi` | `Shared camera — four webcams, one stream` |

**Callus shelf, tethered bench, ADB shelf**

| Id | Prompt label | Verbs → effect | Inspect callouts |
|---|---|---|---|
| `callus.minix-01` / `-02`, `callus.nuc-03`, `callus.slot-4` | `MINIX-01` … | E **Power button** (hold 4 s = force off) → `sim.host.powerCycle` / power on; R **Re-seat Ethernet** → `sim.host.setEthernet` | `Windows box running Callus` / NUC: sticky-note text |
| `callus.monitor` | Callus console | E **Switch KVM** (box 1 → 4) | — |
| `collis.<id>` | Collis probe — `<HRN>` | E **Re-seat rear ribbon** → `sim.collis.reseatRibbon`; R **Unplug / Plug PSU** (socket picker) | `UL Transaction Security` · `Rear ribbon cable → <HRN>'s card reader` · `Power: AC strip` (curriculum M10) |
| `power.strip.c1` / `.c2` | AC strip STRIP-C1 / -C2 | as rack strips | |
| `rig.megatron.mfd` / `.cfd`, `rig.optimus.mfd` / `.cfd` | `MEGATRON MFD (DEV1)` … | E **Look at screen**; R **Tap screen** | `MEGATRON  MFD  DEV1` · `Merchant Facing Device` (or `Customer Facing Device`) |
| `rig.<x>.dock-mfd` / `.dock-cfd` | Connectivity hub | E **Re-seat USB**; R **Re-seat Ethernet**; G **Re-seat power** → `sim.device.reseatHub` (proposed) | `LabSim connectivity hub: Ethernet, USB, power` |
| `rig.megatron.smartstripe` / `rig.optimus.smartstripe` | SmartStripe Probe | E **Re-seat probe** → `sim.rig.reseat(x, 'smartstripe')` (proposed) | `SmartStripe Probe (USB)` |
| `rig.tethered.pi`, `rig.adb.pi` | Raspberry Pi | as `rig.<id>.pi` | `One Robot Pi per shelf` |
| `rig.tethered.webcam`, `rig.adb.webcam` | Webcam | as `rig.<id>.webcam` | |
| `rig.data.device`, `rig.tars.device` | DATA / TARS | as `rig.<id>.device` | `ADB bot — no physical touch, no PIN` |
| `power.strip.t` / `.d` | AC strip | as rack strips | |

**Power wall**

| Id | Prompt label | Verbs → effect | Inspect callouts |
|---|---|---|---|
| `power.psu.mw-1` | Mean Well LRS-600-24 | E **Unplug / Plug AC cord** → `sim.power.togglePsu('meanwell-1', on)`; E [multimeter] **Measure 24 V out** | `MEAN WELL · INPUT 120VAC · OUTPUT 24VDC` |
| `power.bus.24v` | 24 V DC rail | E [multimeter] **Measure** | `Central 24V DC rail` |
| `power.reg.12v`, `power.reg.5v-a/-b/-c` | Step-down regulator | E [multimeter] **Measure output** | `12V DC · NUC` / `5V DC · 10A` (curriculum M03 step 6) |
| `power.fuse.12v`, `power.fuse.5v-a/-b/-c` | Inline fuse `<id>` | as `rig.<id>.fuse` | `F-5V-B 10A` etc. |
| `power.tap.24v` / `.12v` / `.5v` | DC tap lead 24V / 12V / 5V | as a socket target: E **Plug `<carried plug>` here** → `sim.power.plug(load, {kind:'dc-rail', …})` (the 18 V trap: spark + fry if a LabSim/Collis PSU) | `DC rail tap — Pis/NUCs only` |
| `power.strip.w` (+ `.s1`…`.s6`) | AC strip (bench) | as rack strips (curriculum `prop.ac-strip`) | `AC STRIP — LABSIM / COLLIS ONLY` |
| `power.outlet.w1`…`w14` | Wall outlet W`<n>` · 120 V | E **Unplug / Plug**; E [multimeter] **Measure V~** | `120V AC` |
| `power.trace` | Power trace | E **Start trace** (M03) → hotspot mode: click W1 → MW-1 → 24V rail → REG-12V → REG-5V → fuses → `→ NUC SHELF` → `→ PI SHELVES`; each correct node lights its cable (emissive orange 1.5) | — |
| `tool.multimeter` | Multimeter | E **Pick up** → hotbar 2 | — |
| `power.fuse-tray` | Spare fuses | E **Take fuse** (R cycles 5 / 7.5 / 10 / 15 A) → hotbar 3 | ratings |
| `power.bench.flex4-psu`, `power.bench.collis-spare`, `power.bench.desk-fan` | Flex 4 power brick / Spare Collis probe / Desk fan | E **Pick up** (carry) → plug via any socket target | |

**Server, fabrication, benches, walls, library**

| Id | Prompt label | Verbs → effect | Inspect callouts |
|---|---|---|---|
| `server.blade` | GPU server blade | E (hold 4 s) **Power button** → `sim.host.powerCycle('blade')` (GW13 trap) | `4× NVIDIA GPUs (2 on top, 2 underneath)` · `Hosts the Orca, Jenkins and Ollama VMs` |
| `server.blade.gpu-1`…`gpu-4` | GPU `<n>` | E **Tag** (curriculum M17); GPUs 3–4 need crouch | `GPU <n>` |
| `server.switch` | Network switch | R **Re-seat uplink** | `24-port switch` |
| `server.tower` | Old tower | — | `RETIRED — replaced by GPU blade` |
| `fab.printer-prusa` / `fab.printer-bambu` | Prusa MK4 / Bambu Lab | E **Start print** / **Check print** (replacement cradle: 90 s real) | `Prints the black PLA fixtures` · `CAD from simple geometric shapes` |
| `fab.laptop-cad` | CAD laptop | E **Look** (focus) | — |
| `fab.spare-cradle` | Printed cradle | E **Pick up** (carry; INC59) | — |
| `jared.bolt-bins` | Bolt bins | E **Sort bolts** → minigame overlay (10 bolts → `2.5 mm` / `5 mm`) | `2.5 mm and 5 mm bolts` |
| `jared.solder` | Soldering station | E **Iron on / off** (tip glows) | `~300 solder points per robot` |
| `jared.label-maker` | Label maker | E **Print label** (Build Day) | — |
| `wall.bins.red-spares` / `wall.bins.blue-cables` | Red bin / Blue bin | E **Open** → take: spare Pi, SD card, 10 A fuses / Ethernet cable, USB-C lead, micro-USB lead | bin labels |
| `wall.drawers.<label>` | Drawer `<label>` | E **Open** → take item | label |
| `chest.husky.d1`…`d5` | Husky drawer `<n>` | E **Open / Close** (`drawer`); take `SPARE FLEX 2` (d2) / `SPARE MINI 3` (d3) | — |
| `cabinet.storage` | Storage cabinet | E **Sign out spare** (120 s, gameplay) → spare Collis probe; `cabinet.storage.legacy-shelf` E **Place / Take** legacy Flex 1 | `SPARES — SIGN OUT WITH JARED` |
| `wall.whiteboard` | Whiteboard | E **Use whiteboard** → focus + diagram builder overlay | — |
| `wall.roadmap` | Roadmap board | E **Sort roadmap** → overlay | — |
| `wall.history.semi/sedi/ipx/paycore` | Team history | — | frame texts (§6.4) |
| `wall.history.match` | Match the teams | E **Match teams** → overlay | — |
| `poster.*`, `wall.extrusion-10ft`, `table.build.*` | Poster / 10 ft rail / Build table | — | poster text; `10 ft aluminium rail, cut to size`; BOM callouts §2.15 |
| `library.<model>` | `<Device name>` | E **Pick up / Put back**; carried + E on `library.trays` **Place on tray**; G **Compare** (M02 step 6: highlights the Flex 4 printer block next to the Pocket) | lip-card text |
| `coffee.machine` | Coffee machine | E **Make coffee** (6 s, fills the mug) | — |

### 9.3 Focus poses (`engine.focus`)

| Pose | Camera position | Look-at | FOV | Notes |
|---|---|---|---|---|
| Seated at workstation | (1.10, 1.20, 4.12) | (1.10, 1.08, 4.80) | 50 | Chair slides in 0.25 m over 0.4 s; the React desktop covers the monitors |
| Tablet | tablet centre + 0.32 m along the tablet normal | tablet centre | 38 | Tablet fills ~70 % of the viewport height |
| Touch-rig screen | screen centre + 0.20 m along the screen normal (above) | screen centre | 45 | `camera.up` = bay −Z (toward the screen's top edge) so it reads upright; near plane 0.01 |
| Upright devices (tethered, ADB, coworker, library) | face centre + 0.30 m along the face normal | face centre | 40 | |
| Whiteboard / roadmap / history | 1.10 m in front of the board centre, eye height 1.55 | board centre | 55 | |
| Inspect (hold RMB) | player head | crosshair target | 70 → 35 over 200 ms | DOF on High+ |

### 9.4 Multimeter probe points

The held multimeter shows probe-point markers (small 6 mm rings, visible only while it is the active tool). `E` measures → `sim.power.measure(pointId)` → LCD text (e.g. `24.08 V⎓`, `5.08 V⎓`, `0.00 V⎓`, `120.3 V~`, `OL Ω`, `0.1 Ω`).

| Probe id | Where | `pointId` passed to the sim |
|---|---|---|
| `mp.outlet.w<n>` | each outlet face | `outlet:w<n>` |
| `mp.psu.mw-1.out` | Mean Well +V/−V terminals | `psu:meanwell-1` |
| `mp.bus.24v` | bus bar lugs | `rail-24v` |
| `mp.reg.12v.out`, `mp.reg.5v-<r>.out` | regulator output leads | `rail-12v`, `rail-5v-<r>` |
| `mp.fuse.<id>.in` / `.out` | both sides of each wall fuse holder | `fuse:<fuseId>:in` / `:out` |
| `mp.rig.<id>.fuse.in` / `.out` | both sides of the bay fuse | `fuse:F-<RIG>-5V:in` / `:out` |
| `mp.rig.<id>.pi` | Pi USB-C input | `load:pi-<id>` |
| `mp.rackdist.<rack>.5v` / `.24v` | rack distribution block | `rail-5v-<rack>` / `rail-24v` |
| `mp.callus.12v` | Callus 12 V block | `rail-12v` |
| `mp.strip.<id>` | strip socket | `strip:<id>` |
| Removed fuse (in hand) | Ω mode | `fuse:<fuseId>:ohms` |

### 9.5 Tool viewmodels (first person, bottom-right; rendered in a separate overlay pass with depth cleared)

| ToolId / item | Model (mm) | Behaviour |
|---|---|---|
| `hand` | Low-poly right hand (palm box + 5 jointed finger boxes), skin tone from settings | Reaches toward the target on E (150 ms) |
| `screwdriver` | Handle Ø 28 × 100 (yellow/black), shaft Ø 5 × 80, hex bit 2.5 or 5 mm (`R` swaps) | Rotates while held on a bolt (`ratchet`) |
| `multimeter` | Yellow body 90 × 180 × 50, canvas LCD 128 × 64, rotary dial (mode by `R`: V⎓, V~, Ω, continuity), red/black probes | Probe tips animate to the probe point |
| `spare-fuse-5v` / `spare-fuse-12v` (rating chosen with `R`) | ATO blade 19 × 18 × 5 between finger and thumb, colour by rating | Insert animation into the holder (300 ms) |
| `ethernet-cable` / `usb-cable` | Yellow / black coil Ø 120 with plug | Plug end follows the hand |
| `test-card-visa` / `test-card-interac` | Card 85.6 × 54 (§3.4) | Dip/tap/swipe gestures at readers |
| `flashlight` | none (head torch light only, §7.1) | Toggle |
| Ruler (carried item) | 150 mm rule; when measuring, a flat overlay rule with mm ticks (canvas 1024 × 64) snaps to the screen top-left | — |
| Carried large items | Device, Pi, cradle, PSU brick, Collis probe held in both hands in front, scaled to fit the view; hotbar disabled | `Q` puts down |

### 9.6 Contract additions this doc relies on

* **Engine** (`src/engine/types.ts`): `InteractVerb.holdMs?: number`; `Interactable.drag?: { plane: 'xz' | 'screen'; onDrag(deltaMm: [number, number]): void; onRelease(): void }`; `Interactable.callouts?: () => string[]`; `Interactable.crouchOnly?: boolean`; `PlayOptions.variant?: string`; bus `'voice'`; the new `SoundId`s of §8.2; `TextureLibrary` generators of §6.2.
* **Sim** (`src/sim/api.ts`), only if the sim models these states: `rig.reseat(rigId, part: 'solenoid' | 'smartstripe')`, `rig.setDipAlignment(rigId, teethOffset)`, `rig.aimWebcam(rigId, yawDeg, pitchDeg)`, `rig.moveMotionCable(rigId, to: 'pi' | 'nuc')`, `device.reseatHub(deviceId, port: 'usb' | 'ethernet' | 'power')`.
* **State the world reads if present** (`RigState`): `solenoidConnector: 'seated' | 'loose'`, `dipArmAlignTeeth: number`, `webcam.aimYawDeg`, `webcam.usbSeated`, `motionHost: 'pi' | 'nuc'`; (`TerminalDevice`) `hub: { usb, ethernet, power }`. Missing fields render the healthy state.

---

## 10. Performance budget

### 10.1 Frame targets

| Preset | Target | Reference hardware | Frame budget split (ms) |
|---|---|---|---|
| Low | ≥ 30 fps (33.3 ms) | Intel UHD 620 / Iris Xe, 1080p, DPR × 0.85 | sim+bind 3 · canvas 3 · main pass 20 · post (SMAA, vignette) 3 · slack 4 |
| Medium | ≥ 45 fps (22.2 ms) | Apple M1 / GTX 1050 | sim+bind 2 · canvas 2.5 · shadows 2.5 · main 10 · AO+bloom+grade 3.5 · slack 1.7 |
| High | ≥ 60 fps (16.7 ms) | GTX 1660 / M1 Pro | sim+bind 1.5 · canvas 2 · shadows 2.5 · main 6.5 · AO 2 · bloom/tone/outline/SMAA 1.5 · slack 0.7 |
| Ultra | ≥ 60 fps @ 1440p | RTX 3070 | as High with 6 shadow maps, full-res AO High |

### 10.2 Draw calls, triangles, memory

| Preset | Main-pass draw calls | Shadow-pass draw calls | Rendered triangles (incl. shadows) | Texture memory (assets) | Render targets | Canvas upload / frame |
|---|---|---|---|---|---|---|
| Low | ≤ 350 | 0 | ≤ 0.6 M | ≤ 70 MB | ≤ 25 MB | ≤ 0.5 Mpx |
| Medium | ≤ 450 | ≤ 120 | ≤ 1.0 M | ≤ 120 MB | ≤ 90 MB | ≤ 1.0 Mpx |
| High | ≤ 550 | ≤ 240 | ≤ 1.6 M | ≤ 190 MB | ≤ 160 MB | ≤ 1.5 Mpx |
| Ultra | ≤ 650 | ≤ 420 | ≤ 2.5 M | ≤ 260 MB | ≤ 300 MB | ≤ 2.5 Mpx |

Scene triangle budget (all LOD0): touch rig ≤ 25 k each (8 → 200 k); tethered + ADB + Callus ≤ 70 k; room shell + furniture + benches ≤ 160 k; library ≤ 20 k; overhead (trays, rods, cables) ≤ 30 k; NPCs ≤ 6 k each (≤ 8 → 48 k); viewmodel ≤ 4 k. Total ≈ 0.55 M before culling.

High texture estimate: tiling materials ≈ 72 MB (1024² RGBA + mips: perforated ×2 sets 34 MB, hex 11 MB, floor 11 MB, ceiling 6 MB, others 10 MB); device screens 18 canvases ≈ 49 MB; tablets 8 × 1024 × 640 ≈ 28 MB; label atlas 2048² ≈ 22 MB; posters/whiteboard ≈ 26 MB; monitors and misc ≈ 15 MB → ≈ 212 MB worst case — trim by dropping off-screen tablet textures to 512 × 320 when > 6 m away (§10.4).

### 10.3 Instancing and merging

| Technique | Applied to |
|---|---|
| `InstancedMesh` (static) | Button-head screws (≈ 1 200, 1 draw), wall outlets (14), sprinklers (15), threaded rods (40), stack bins (20 → red/blue 2 draws), organiser drawers (128), filament spools (8), troffer housings (12) + diffusers (12), chairs (per material), rack posts |
| `InstancedMesh` (dynamic, matrices updated only when a rig moves) | V-wheels (64), NEMA-17 bodies (16) + pulleys/idlers (32), limit switches (16), LED lenses by colour (≈ 220 → 4 draws, per-instance colour/intensity via `instanceColor`) |
| Static merge (`mergeGeometries` per material per zone) | Rack frames, shelves, fascias, cradles, dip towers, bench/desk bodies, wall boards, trays and their cable bundles, library devices (powered off) |
| Moving groups (merged per material inside the group) | Per rig: beam carriage group, arm carriage group, dip arm, tap paddle, phone sled, toggles, side door — ≈ 19 draws per rig |
| Label atlas | All static tape labels, stickers, lip cards → one 2048² atlas (Low 1024²), quads merged per zone (≈ 10 draws total) |
| Raycast proxies | Merged meshes break per-prop picking: every interactable registers an invisible proxy box (`visible = false`, raycast layer 1) — the engine raycasts proxies only |
| Cables | One `TubeGeometry` per rig per colour, merged; tube radial segments per preset (§7.4) |

### 10.4 LOD, culling, streaming

* Frustum culling on every mesh/group; moving groups recompute bounding spheres on build (not per frame).
* **Rig detail LOD** (distance from camera to rig centre > preset distance, §7.4): hide looms, belts, PCB components, coil cable, phone sled details; drop the glass overlay; screen canvases render at ½ px/mm; tablet texture updates at 2 Hz and falls back to 512 × 320.
* Bottom bays (floor ≤ 0.6 m) are only fully detailed when the camera is within 2 m or crouched.
* Library devices are a single merged static mesh until one is picked up (then that item is split out).
* Corridor: while the player is in the corridor with the door closed, everything except the rack row, desks and the door frustum region is `visible = false` (M00 still shows Morgan through the vision panel).
* No runtime asset streaming (everything is procedural); `buildWorld` must finish in ≤ 4 s on High hardware and ≤ 10 s on Low, yielding to the loading bar between builders.

### 10.5 Update-rate budgets

| System | Rate | Limit |
|---|---|---|
| World bind (sim → transforms/LEDs/textures) | every frame | touch only rigs/devices whose state object identity changed |
| Device screens | on `display.rev` change, minute ticks, ≤ 300 ms animations | ≤ 3 redraws/frame, ≤ preset Mpx upload/frame (round-robin queue) |
| Tablets | on state change; ≤ 10 Hz while animating (wipe, pulse, heartbeat) | ≤ 2 redraws/frame |
| Monitors desktop mirror | 2 Hz | — |
| Scope / printer LCDs | 10 Hz / 1 Hz, only within 4 m | — |
| `captureView` (camera app) | only while a stream is shown: preset size/fps; mosaics render 4 tiles round-robin (one tile per tick) | 1 stream at a time |
| Snapshot (GIMP / OCR / Ollama image) | on demand: 1280 × 720 with High settings regardless of preset | ≤ 60 ms hitch acceptable |
| Audio parameter updates | 30 Hz | ≤ 24 voices, ≤ 12 loops |

### 10.6 Verification (Playwright, `tests/e2e`)

| Shot / check | Camera (position → look-at) | Expect |
|---|---|---|
| `entrance` | `spawn.entrance` | Rack row green glow visible; draw calls ≤ preset budget |
| `img-t` | (−2.60, 1.60, −1.10) → WALL-E tablet | Tablet header `WALL-E` / `Status: OK` / `Brainbox v6`, POWER panel, `SETI` panel, rail numbers 29–40 |
| `img-r` | (2.55, 1.30, −0.75) → (2.40, 1.10, −2.10), hfov 70° | 2 × 2 faces with labels, `3:45`-style lock screens on MFDs, dark CFDs, docks with labels, Pi, bins/drawers/Husky in the background |
| `img-g` | through Rack A's open bay-4 door: (−3.30, 1.62, −1.95) → (−2.60, 1.55, −2.05) | Flex 3 in cradle, solenoid over the screen, dip arm with `63`, hex-mesh back |
| `vid` | `cam.wall-e` snapshot | Upright Flex 3 screen with the solenoid in frame |
| `power-wall` | (−0.70, 1.65, −3.40) → (−0.70, 1.60, −4.98) | Mean Well label, regulators, fuses, strip |
| `seated` | seated pose | Monitors and desk items |
| Low-preset perf | SwiftShader, `spawn.entrance`, 300 frames | `engine.stats()` draw calls ≤ 350, triangles ≤ 0.6 M |

---

## Appendix A — NPCs

Stylised low-poly people (≤ 6 k triangles each), built procedurally from capsules/spheres/boxes as hierarchical groups (no skinning): torso capsule, head sphere with simple face decals (eyes, brows, mouth), hair mesh variants (short, bun, curly, buzz, ponytail), arms/legs as two-segment cylinders with elbow/knee pivots, hands as small boxes. Heights 1.62–1.85 m, five skin tones; no gender-coded features are required. Lanyard badge on everyone.

| NPC | Outfit colours | Props | Default anchor |
|---|---|---|---|
| Morgan (`npc.morgan`) | teal hoodie #1f8a8a, dark jeans | laptop sticker-covered | `npc.morgan.desk` |
| Jared (`npc.jared`) | charcoal work shirt, black apron, safety glasses pushed up | screwdriver in apron pocket | `npc.jared.bench` |
| Tate (`npc.tate`) | navy polo #23395d | coffee cup | `npc.tate.visit` |
| David (`npc.david`) | burgundy sweater #7a2430 | notebook | `npc.david.visit` |
| Riley† | mustard cardigan #c79a2b | headphones | `npc.coworker.desk-2` |
| Sam† | olive jacket #5b6b3a | — | `npc.coworker.desk-1` |
| Alex† | light-blue shirt #8fb7e6 | clipboard | `npc.alex.build` |

Procedural animation: idle breathing (chest scale ±1.5 % at 0.25 Hz), head look-at the player within 4 m (yaw ±60°, pitch ±20°), talking (head bob + hand gesture sine 1.2 Hz while their voice blips play), walking (leg swing ±25°, arm swing ±15°, 1.4 m/s, `footstep`), seated typing (hands ±3 mm at 8 Hz), pointing at a prop when a lesson step targets it, waving (M00). Movement follows a fixed waypoint graph through the aisles (≈ 20 nodes: corridor, entrance, desks, front aisle, rack row ends, rear aisle, power wall, Jared's bench, tethered, library, whiteboard) — no navmesh. Name tag (from `team.ts`) floats above the head when looked at within 3 m.

## Appendix B — Virtual cameras (camera app, OCR, GIMP, Ollama)

All webcams are 16:9, snapshot **1280 × 720**, vertical FOV 32° unless stated, near 0.02, far 6; live streams use the preset size/fps (§7.4). Every stream frame gets an overlay: rig tag top-left (white 14 px on 50 % black), game timestamp bottom-right `2026-11-05 09:41:07`†, `● REC` when a build is recording.

| Id | Mount | Position | Look-at | Notes |
|---|---|---|---|---|
| `cam.<rig>` (8 touch rigs) | gooseneck, bay-local | (−150, 410, −120) mm | camera target in §2.10 | Screen reads upright; solenoid in frame (VID) |
| `cam.r2-d2` | gooseneck, bay-local | (−150, 410, −120) mm (same mount as the others) | CFD `TOTAL` text centre | **Solved projection**: choose vertical FOV so the padded `TOTAL $10.83` text rect (L8 customer-cart, padded to a 236:44 aspect) spans 236 px of the 1280 px width, then `camera.setViewOffset(1280, 720, …)` so its centre lands at (530, 310) — i.e. the bbox (412, 288, 236, 44) of curriculum S10 `CFD_TOTAL` matches the real snapshot (±4 px), so GIMP/OCR lessons see the text where Orca says it is. |
| `cam.tethered` | gooseneck on `rack.t` S3 | rack.t-local (0.00, 1.45, 0.38) m | (0.00, 1.23, 0.00) | vertical FOV 40° |
| `cam.adb` | gooseneck on `shelf.adb` | shelf-local (0.45, 1.35, −0.25) m | (0.00, 1.10, 0.05) | vertical FOV 40° |
| `cam.rack-b-mosaic` | Rack B camera Pi | — | — | 2 × 2 composite 1280 × 720: TL JOHNNY-5, TR SETI, BL BAYMAX, BR ROSIE; 640 × 360 tiles, 1 px black gutters, per-tile tags |
| `cam.bench-mosaic` | tethered Pi | — | — | 1 × 2 composite: left `cam.tethered`, right `cam.adb`, 640 × 360 tiles centred on a black 1280 × 720 frame |

De-aimed webcam fault (`webcam.aimedOk = false`): the camera's look-at is offset 25° yaw toward the bay wall until re-aimed (§9.2). USB unseated: stream shows the `Stream unavailable — <url>` card (apps doc).

## Appendix C — Build acceptance checklist

1. Every id in §1.4, §1.5, §2.10 parts, §2.12–§2.14 and §9.2 exists in `PROP_IDS`; every curriculum `prop.*`/`loc.*` in 10-curriculum §0.5 resolves through `PROP_ALIASES` / `LOCATIONS` (content test).
2. Rail numbers: crosshair on WALL-E's left rail at y 1.5446 m reads `U33`; WALL-E's fascia spans U31.3–U35.6.
3. For every rig, `xy_touch` of every §4.6 seed location moves the solenoid tip to within 0.1 mm (world space) of the drawn button centre (or the overridden point), and `sim.device.touch` reports the expected `hitButton`.
4. With `flags.receiptQrFeature` on and Orca still on `RECEIPT_OPTIONS_4`, all four old FLEX_GEN3 taps miss (land 0.5 mm above each pill); with `RECEIPT_OPTIONS_5` they hit.
5. Park All after a manual push shows the clamp re-coupling, two limit clicks, banner wipe yellow → green; Park X/Y/XY leave the banner yellow when the lock was broken.
6. Tethered bench screenshot (`img-r`) matches IMG-R's composition; MFD lock screens show the game time; CFDs are dark.
7. Low preset holds ≥ 30 fps at `spawn.entrance` on the reference integrated GPU and meets §10.2 budgets in SwiftShader.
8. No external downloads at runtime; all textures procedural; all sounds synthesised (canon).
