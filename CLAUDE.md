# LabSim — contributor guide (humans and agents)

LabSim is a browser-based first-person 3D training simulator for the LabSim automation lab.
Read `docs/design/00-canon.md` (hard constraints) and `docs/ARCHITECTURE.md` (module contracts)
before writing code. The domain source of truth is a private internal reference, kept out of this repository;
the game must never contradict it.

## Stack
Vite + TypeScript (strict) + Three.js r186 (procedural geometry only, no model files) + React 19 for
all 2D UI + zustand/immer for state + postprocessing/n8ao. No backend; progress in localStorage.

## Commands
- `npm run dev` — dev server (http://localhost:5173)
- `npm run typecheck` — `tsc -b` over the whole project
- `npm test` — vitest unit tests (sim logic, content integrity)
- `npm run build` — typecheck + production build into `dist/`
- `npx playwright test` — smoke/e2e tests in `tests/e2e` (Chromium at /opt/pw-browsers)

## Layout and ownership
| Path | What lives there | May import |
|---|---|---|
| `src/core` | store, event bus, loop, rng, persistence, game bootstrap | sim types |
| `src/sim` | pure simulation: state types, seed data, systems, SimApi, terminal interpreter | core (never three/react) |
| `src/engine` | Three.js infrastructure: renderer, post-fx, player controller, collision, interaction, audio, procedural textures/materials | core |
| `src/world` | the lab scene, props, rigs, devices; binds 3D objects to sim state | core, sim, engine |
| `src/computer` | the in-game workstation desktop and its apps (React) | core, sim, ui/kit |
| `src/ui` | React root, HUD, menus, overlays, Field Manual, quiz UI, shared UI kit (`src/ui/kit`) | core, sim, content, missions |
| `src/content` | curriculum data: facts, modules metadata, quizzes, flashcards, glossary, team names | core types only |
| `src/missions` | lesson runner, objectives, arcade shift director, incidents, drills, scoring, spaced repetition, achievements | core, sim, content |

## Conventions
- Named exports only (no default exports). Path alias `@/` → `src/`.
- Simulation code is deterministic: use the seeded RNG in `@/core/rng` with the store's rng state;
  never `Math.random()` or `Date.now()` inside `src/sim` or `src/missions` logic. Game time comes from
  `state.lab.time.nowMs`.
- Mutate state only through `transact()` / `mutate()` from `@/core/store`; never mutate the object
  returned by `store.getState()`. Do not return immer draft objects out of `transact()`.
- Emit domain events through the `ctx.emit` passed into `transact()` (they flush after the
  mutation commits). Add new events by augmenting `EventMap` via declaration merging in your module.
- In-game text about people uses names or they/them — never gendered pronouns. Real names come from
  `src/content/team.ts` only (so they can be anonymised before the repo goes public).
- React components subscribe with `useGame(selector)`; selectors must return primitives or stable
  references (use `useGameShallow` for small objects/arrays).
- Units: world = metres (Y up); device/robot coordinates = millimetres from the screen's top-left.
- Keep files focused (< ~600 lines); split by feature.
- When several agents work in parallel, only edit files inside the paths you own; when typechecking,
  fix errors in your own files and ignore errors in files you don't own.
