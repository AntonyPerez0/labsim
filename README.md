# LabSim

LabSim is a browser-based, first-person 3D training simulator of the LabSim automation lab. New engineers walk
the lab, read rig status tablets, park robots, chase power faults, sit at the workstation (Orca, Jenkins,
GitHub, IntelliJ, terminal, LabChat …) and learn the real workflows through guided lessons, timed shifts,
drills, flashcards and a certification exam. Everything runs in the browser: no backend, no model files (all
geometry is procedural), and progress is saved in `localStorage`.

Built with Vite + TypeScript (strict) + Three.js + React 19 + zustand/immer.

## How to play

### Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Typecheck + production build into `dist/` (`npm run preview` serves it) |
| `npm test` | Vitest unit tests (simulation, content integrity, missions, UI logic) |
| `npm run typecheck` | `tsc -b` over the whole project |
| `npx playwright test` | Smoke / end-to-end tests in `tests/e2e` |

A desktop browser with WebGL 2 is required. If the lab runs slowly, open **Settings → Graphics** and pick the
*Low* preset or lower the resolution scale.

### First launch

Press any key on the title screen, type the name for your lanyard, pick a few comfort settings (mouse
sensitivity, invert Y, subtitles, colour-blind mode, reduce motion, realism) and start **M01 — Welcome to the
Lab**. Your mentor talks you through the rest; the objective tracker (top right) always says what to do next,
and **H** gives a hint when you are stuck.

### Controls

Click the 3D view to capture the mouse. Press **F1** at any time for the full list; every key can be rebound in
**Settings → Controls**.

| Key | Action |
|---|---|
| **W A S D** / mouse | Move / look (hold **Shift** to walk fast, **C** to crouch) |
| **E** / left click | Interact with what the crosshair is on · use the held tool · continue dialogue |
| **Space** / **Enter** / click | Continue dialogue (first press finishes the line) · **1–4** pick a reply |
| Look at it | Inspect: rest the crosshair on a tablet, label, LED or panel for a moment |
| **1–5** | Hotbar: screwdriver · multimeter · spare fuse · Ethernet cable · test card |
| **R** / **Q** | Cycle tool mode / holster or set down |
| **F** | Head torch |
| **Tab** | Notebook (notes, evidence, checklist) |
| **T** (or **J**) | Ticket board (Arcade shifts) |
| **H** | Hint |
| **Esc** | Pause (Resume · Settings · Field Manual · Controls · Quit) — at the workstation it stands you up |
| **F1** | Controls overlay |
| **F10** / hold **]** | Sandbox panel / fast-forward ×30 (Free Play only) |
| **`** | Debug overlay |

**On a phone or tablet** the view gets on-screen controls instead: a floating joystick (push to the
rim to walk fast), drag anywhere to look, and buttons for interact / jump / crouch / tool mode /
holster / torch / pause. The hotbar and dialogue choices are tappable as usual.

### Modes

- **Academy** — 18 guided modules (M01–M18) with a mentor, objectives, hints and checkpoint quizzes. Finishing
  modules earns XP, ranks and unlocks the other modes.
- **Arcade** — timed **shifts** of incident tickets (find the fault, fix it, verify it, reply in LabChat), short
  skill **drills**, a seeded **Daily** challenge and **Weak Spot** practice on your weakest topics.
- **Certification** — written exam plus practical tasks; pass to earn the lab certificate.
- **Free Play** — the whole lab as a sandbox with a fault-injection panel and fast-forward.
- **Field Manual** — searchable reference articles, glossary and spaced-repetition flashcards (Leitner boxes).
  Open it from the main menu or the pause menu.

Progress (profile, XP, ranks, module completion, flashcards, settings) is stored per browser. Clear it from
**Settings → Profile → Reset progress** (or by clearing the site storage).

## Deploying to GitHub Pages

Every push to `main` runs `.github/workflows/deploy-pages.yml`: it installs dependencies, runs the
unit tests, builds with Vite (asset paths are relative, so the site works under
`https://<user>.github.io/<repo>/`) and publishes `dist/` to GitHub Pages.

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Pages on a private repository needs a paid GitHub plan (Pro, Team or Enterprise). You can also run
the workflow by hand from the **Actions** tab ("Deploy to GitHub Pages" → Run workflow).

## People and names

Every person who appears in the game — mentors, NPCs, LabChat authors, commit authors — is defined in one file:
[`src/content/team.ts`](src/content/team.ts). Change a `name` there and it changes everywhere (dialogue,
portraits, chat, the Field Manual). In-game text refers to people by name or they/them only.

## Before making this repository public

This project was built for internal training and contains internal names and branding: LabSim product names
and the LabSim logo mark, internal tool and service names (Orca, uia-remote, Pigeon, Callus, Collis, …), real
first names of team members in `src/content/team.ts`, and internal details in
`docs/reference/REMOVED-internal-reference.md`. **Review and anonymise names, branding and internal details
(team names, host names, repository names, URLs, ports) before publishing the repository.**

## Project layout

See [`CLAUDE.md`](CLAUDE.md) for conventions and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module
contracts. Design documents live in [`docs/design/`](docs/design/) and the domain source of truth is
[`docs/reference/REMOVED-internal-reference.md`](docs/reference/REMOVED-internal-reference.md).
