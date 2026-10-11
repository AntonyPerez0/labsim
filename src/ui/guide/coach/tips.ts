/**
 * Coach tips catalogue + selection (pure; no DOM). The coach layer (`CoachLayer.tsx`) builds a
 * `CoachCtx` from the store and the workstation window manager, asks `coachCandidates()` which tips
 * apply right now, and shows the first one whose anchor is on screen.
 *
 * Tiers:
 *  - `basic`  — orientation (main menu, HUD, desktop). Hand-holding tapers off: once the player has
 *               finished M04 (or any four modules) these are no longer shown.
 *  - `visit`  — first visit of a screen, mode or workstation app. Always shown once while tips are on.
 *
 * Every tip shows once: "Got it" (or using the highlighted control) stores `progress.flags['coach:<id>']`.
 */
import type { MenuScreen, Overlay } from '@/core/state';

export interface CoachCtx {
  overlay: Overlay['kind'];
  /** Main-menu screen when the main menu is open. */
  menuScreen: MenuScreen | null;
  mode: string;
  dialogue: boolean;
  pointerLocked: boolean;
  /** An interaction prompt is under the crosshair. */
  prompt: boolean;
  /** Workstation window of the focused app (null when none / desktop not open). */
  focusedApp: string | null;
  /** Number of open (not minimised) workstation windows. */
  openWindows: number;
  modulesDone: number;
  m04Done: boolean;
  touch: boolean;
}

export type CoachTier = 'basic' | 'visit';
export type CoachPlace = 'auto' | 'below' | 'above' | 'left' | 'right' | 'inside';

export interface CoachTip {
  id: string;
  tier: CoachTier;
  when: (c: CoachCtx) => boolean;
  /** CSS selector of the element the bubble points at (null = free-floating at the top centre). */
  anchor: string | null;
  title: string;
  text: (c: CoachCtx) => string;
  place?: CoachPlace;
  /** Pulsing ring around the anchor (off with reduced motion: a static ring instead). */
  ring?: boolean;
  /** In-world tips: shown while the player may have the mouse captured, so they also retire on their own. */
  passive?: boolean;
  /** Condition must hold this long before the tip appears (ms). */
  delayMs?: number;
}

/** Hand-holding tapers off after M04 or four completed modules. */
export function isTapered(c: Pick<CoachCtx, 'modulesDone' | 'm04Done'>): boolean {
  return c.m04Done || c.modulesDone >= 4;
}

const home = (c: CoachCtx) => c.overlay === 'main-menu' && c.menuScreen === 'home';
const menuAt = (s: MenuScreen) => (c: CoachCtx) => c.overlay === 'main-menu' && c.menuScreen === s;
const inWorld = (c: CoachCtx) => c.mode !== 'menu' && c.overlay === 'none' && !c.dialogue;
const atDesk = (c: CoachCtx) => c.overlay === 'computer';

/** One "what this app is for in the real lab" line per workstation app. */
export const APP_TIPS: Record<string, { title: string; text: string }> = {
  orka: { title: 'Orka — the Controller', text: 'Every rig lives here: its status, Notes, devices, screens and merchant config. When a robot misbehaves, check its status and Notes in Orka first.' },
  jenkins: { title: 'Jenkins — the Executor', text: 'Jenkins runs the test pipelines: it checks robots out of Orka and injects the build’s environment (device types in ALL CAPS).' },
  github: { title: 'GitHub', text: 'The team’s repos — uia-relay, Parrot, Gorth — live here. Clone from here, open pull requests and review coordinate changes.' },
  intellij: { title: 'IntelliJ IDEA', text: 'Where uia-relay work happens: page objects, config.properties and running tests. The UIA Practice tool window on the right has repeatable exercises.' },
  vscode: { title: 'Visual Studio Code', text: 'Parrot’s tests are raw JSON with no linter, so one missing comma breaks a run. Parrot Practice in the side bar drills exactly that.' },
  terminal: { title: 'Terminal', text: 'adb (on port 5444 in this lab), ssh to the robot Pis, git and curl. Up arrow brings back earlier commands.' },
  gimp: { title: 'GIMP', text: 'Open screenshots to measure where buttons are and to cut out regions for Screen Compare OCR checks.' },
  camera: { title: 'Lab Cameras', text: 'Each rig’s webcam stream: watch a robot tap without walking over, or replay the recording of a failed build.' },
  dashboard: { title: 'Robot Dashboard', text: 'The same panel as a rig’s status tablet — robot status, robot control and motion control — from your desk.' },
  chat: { title: 'LabChat', text: 'The team chat: questions and tickets arrive here, and it is where you reach the right person when you need help.' },
  ollama: { title: 'Ollama WebUI', text: 'A chat front end for the vision model on the lab’s GPU server — the proof of concept for reading screens with AI.' },
  cardreader: { title: 'MagStripe Reader', text: 'Swipe a test card at the desk reader to see the raw track data it carries — handy when checking a card profile.' },
  files: { title: 'File Explorer', text: 'Screenshots, camera recordings, cloned repos and practice files on this workstation.' },
  browser: { title: 'Browser', text: 'Type a lab address (orka.lab.local:8080, jenkins.lab.local:8080 …) and it opens in the right app.' },
};

const appTips: CoachTip[] = Object.entries(APP_TIPS).map(([app, t]) => ({
  id: `app:${app}`,
  tier: 'visit',
  when: (c) => atDesk(c) && c.focusedApp === app,
  anchor: `.ws-window[data-app="${app}"]`,
  title: t.title,
  text: () => t.text,
  place: 'inside',
  delayMs: 700,
}));

export const COACH_TIPS: CoachTip[] = [
  /* ── overlays that sit above everything else ── */
  {
    id: 'quiz',
    tier: 'visit',
    when: (c) => c.overlay === 'quiz',
    anchor: '.qz-modal',
    title: 'Your first quiz',
    text: () => 'Answer, then read the explanation — that is where it sticks. A module checkpoint needs 80 % to pass, and you can try again.',
    place: 'above',
    delayMs: 900,
  },
  {
    id: 'flashcards',
    tier: 'visit',
    when: (c) => c.overlay === 'flashcards',
    anchor: '.fc-modal',
    title: 'Flashcards',
    text: () => 'Spaced repetition: cards you know come back less often, misses come back sooner. A few minutes a day is plenty.',
    place: 'above',
    delayMs: 900,
  },
  {
    id: 'drill',
    tier: 'visit',
    when: (c) => c.overlay === 'drill',
    anchor: '.drill__head',
    title: 'Drills',
    text: () => 'Short timed rounds. Fast, accurate answers earn bronze, silver and gold medals — replay any drill from Practice.',
    place: 'below',
    delayMs: 900,
  },
  {
    id: 'manual',
    tier: 'visit',
    when: (c) => c.overlay === 'manual' || (c.overlay === 'main-menu' && c.menuScreen === 'manual'),
    anchor: '.fm__nav',
    title: 'The Field Manual',
    text: () => 'Everything you learn lands here. Search for a port, a status or a person. Details marked “illustrative” are invented for the game.',
    place: 'right',
    delayMs: 700,
  },

  /* ── the workstation ── */
  ...appTips,
  {
    id: 'ws.desktop',
    tier: 'basic',
    when: (c) => atDesk(c) && c.openWindows === 0,
    anchor: '.ws-icons [data-hint^="desktop.icon:"]',
    title: 'Your workstation',
    text: (c) => `${c.touch ? 'Tap' : 'Double-click'} an icon, or use Start, to open an app. Windows can be moved, maximised and snapped side by side.`,
    place: 'right',
    ring: true,
    delayMs: 700,
  },
  {
    id: 'ws.standup',
    tier: 'basic',
    when: atDesk,
    anchor: '[data-hint="desktop.standUp"]',
    title: 'Back to the lab',
    text: () => 'Esc (or Stand up) leaves the desk so you can walk the lab again.',
    place: 'above',
    ring: true,
    delayMs: 1200,
  },

  /* ── 3D lab (the control coach covers look / walk / tools; these complement it) ── */
  {
    id: 'shift',
    tier: 'visit',
    when: (c) => inWorld(c) && c.mode === 'arcade-shift',
    anchor: '.hud-queue',
    title: 'Your first shift',
    text: () => 'Tickets arrive in this queue. Press T to open the board, then diagnose, fix or escalate each one before its SLA runs out.',
    place: 'left',
    passive: true,
    delayMs: 2500,
  },
  {
    id: 'freeplay',
    tier: 'visit',
    when: (c) => inWorld(c) && c.mode === 'freeplay',
    anchor: '.hud-fp',
    title: 'Free Play',
    text: (c) => `Nothing is scored here. ${c.touch ? 'The sandbox panel' : 'F10 opens the sandbox panel, which'} injects faults, changes the time speed and resets the lab.`,
    place: 'below',
    passive: true,
    delayMs: 2500,
  },
  {
    id: 'lab.touch',
    tier: 'basic',
    when: (c) => inWorld(c) && c.touch,
    anchor: null,
    title: 'Moving around',
    text: () => 'Left thumb: walk (push to the edge to walk fast). Right thumb: drag anywhere to look. The buttons on the right act on what is under the crosshair.',
    passive: true,
    delayMs: 1200,
  },
  {
    id: 'lab.objectives',
    tier: 'basic',
    when: (c) => inWorld(c),
    anchor: '.hud-objectives',
    title: 'Your objective',
    text: (c) => `What to do next is always up here. Stuck? ${c.touch ? 'Tap Hint' : 'Press H'} — hints get more specific the longer a step takes.`,
    place: 'left',
    ring: true,
    passive: true,
    delayMs: 4000,
  },
  {
    id: 'lab.next',
    tier: 'basic',
    when: (c) => inWorld(c),
    anchor: '[data-coach="next-step"]',
    title: 'Lost?',
    text: () => '“What next?” repeats your goal and suggests a step — in lessons, Free Play and shifts.',
    place: 'left',
    passive: true,
    delayMs: 2500,
  },
  {
    id: 'lab.interact',
    tier: 'basic',
    when: (c) => inWorld(c) && c.prompt,
    anchor: '.hud-prompt',
    title: 'You can use this',
    text: (c) => (c.touch ? 'The prompt names the action — tap the big button at the bottom right to do it.' : 'The prompt shows the keys: E to use it, right mouse button to look closer.'),
    place: 'below',
    passive: true,
    delayMs: 600,
  },

  /* ── main menu ── */
  {
    id: 'menu.start',
    tier: 'basic',
    when: home,
    anchor: '[data-coach="start-here"]',
    title: 'Start here',
    text: () => 'This is your next module. Press it and your mentor walks you through the lab step by step.',
    place: 'below',
    ring: true,
    delayMs: 600,
  },
  {
    id: 'menu.map',
    tier: 'basic',
    when: home,
    anchor: '[data-coach="nav-curriculum"]',
    title: 'Curriculum map',
    text: () => 'All 18 modules in order: what is done, what is next, what each one unlocks and how much time is left.',
    place: 'right',
  },
  {
    id: 'menu.practice',
    tier: 'basic',
    when: home,
    anchor: '[data-coach="nav-practice"]',
    title: 'Practice',
    text: () => 'Drills, flashcards, shifts and the Parrot and UIA code exercises — everything you can repeat, in one place.',
    place: 'right',
  },
  {
    id: 'menu.manual',
    tier: 'basic',
    when: home,
    anchor: '[data-coach="nav-manual"]',
    title: 'Field Manual',
    text: () => 'The lab’s handbook: every fact you learn is collected here, searchable, with flashcards.',
    place: 'right',
  },
  {
    id: 'menu.settings',
    tier: 'basic',
    when: home,
    anchor: '[data-coach="nav-settings"]',
    title: 'Settings',
    text: () => 'Graphics, controls, text size — and these tips. Turn them off here any time (Gameplay tab).',
    place: 'right',
  },
  {
    id: 'screen.curriculum',
    tier: 'visit',
    when: menuAt('curriculum'),
    anchor: '[data-coach="curr-next"]',
    title: 'Curriculum map',
    text: () => 'Green is done and the highlighted row is next. Locked modules say what they need first; each row lists what it unlocks.',
    place: 'below',
    ring: true,
    delayMs: 500,
  },
  {
    id: 'screen.practice',
    tier: 'visit',
    when: menuAt('practice'),
    anchor: '[data-coach="practice-grid"]',
    title: 'Practice hub',
    text: () => 'All of this is repeatable. The code exercises open at your workstation in Free Play — nothing is scored there.',
    place: 'above',
    delayMs: 500,
  },
  {
    id: 'screen.academy',
    tier: 'visit',
    when: menuAt('academy'),
    anchor: '.acad-node.is-selected',
    title: 'Academy',
    text: () => 'Pick a module to read its briefing — mentor, objectives, time and unlocks — then press Start module.',
    place: 'below',
    delayMs: 500,
  },
  {
    id: 'screen.arcade',
    tier: 'visit',
    when: menuAt('arcade'),
    anchor: '.arcade-grid',
    title: 'Arcade',
    text: () => 'What you learned, against the clock. More shifts and drills unlock as you finish modules.',
    place: 'above',
    delayMs: 500,
  },
];

export const COACH_TIPS_BY_ID: Readonly<Record<string, CoachTip>> = Object.fromEntries(COACH_TIPS.map((t) => [t.id, t]));

export function coachFlag(id: string): string {
  return `coach:${id}`;
}

/** Tips that apply now, in priority order (not yet seen, allowed by the taper, condition true). */
export function coachCandidates(c: CoachCtx, seen: (id: string) => boolean): CoachTip[] {
  const tapered = isTapered(c);
  return COACH_TIPS.filter((t) => !seen(t.id) && (!tapered || t.tier === 'visit') && t.when(c));
}
