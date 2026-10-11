/**
 * Accessibility helpers shared by the game UI and the workstation apps (pure, DOM-light):
 *
 *  - Status → { label, glyph, CSS var } so colour is never the only cue (colour-blind safety).
 *    The CSS var resolves to a colour-blind-safe palette when `<html data-colour-blind>` is set
 *    (see `src/ui/styles/a11y.css`).
 *  - `clampUiScale` for the 2D UI scale setting, `cssZoom` to convert pointer deltas inside a
 *    `zoom`ed subtree (the UI scale is implemented with CSS `zoom`).
 *  - Focus helpers for dialogs: `focusableIn`, `trapTabKey`.
 */

/* ───────────────────────────── statuses ───────────────────────────── */

export type RobotStatusKey = 'AVAILABLE' | 'UNAVAILABLE' | 'OFFLINE' | 'CONNECTION_FAILED' | 'RESERVED';

export interface StatusMeta {
  label: string;
  /** Shape cue that does not depend on hue (always rendered next to the colour). */
  glyph: string;
  /** Short class suffix (`k-status--<cls>`). */
  cls: string;
  /** CSS custom property holding the status colour (palette-swapped in colour-blind modes). */
  cssVar: string;
}

export const ROBOT_STATUS_META: Record<RobotStatusKey, StatusMeta> = {
  AVAILABLE: { label: 'Available', glyph: '●', cls: 'available', cssVar: '--st-available' },
  UNAVAILABLE: { label: 'Unavailable', glyph: '◆', cls: 'unavailable', cssVar: '--st-unavailable' },
  OFFLINE: { label: 'Offline', glyph: '○', cls: 'offline', cssVar: '--st-offline' },
  CONNECTION_FAILED: { label: 'Connection Failed', glyph: '▲', cls: 'connfailed', cssVar: '--st-connfailed' },
  RESERVED: { label: 'Reserved', glyph: '■', cls: 'reserved', cssVar: '--st-reserved' },
};

/** Robot status meta from an enum value or a human label ("Connection Failed", "connection_failed"). */
export function robotStatusMeta(status: string): StatusMeta {
  const key = status.trim().toUpperCase().replace(/[\s-]+/g, '_') as RobotStatusKey;
  return ROBOT_STATUS_META[key] ?? { label: status, glyph: '●', cls: 'offline', cssVar: '--st-offline' };
}

/** Outcome kinds used by build results, checks, test runs, quiz/drill feedback, toasts. */
export type OutcomeKind = 'pass' | 'fail' | 'warn' | 'info' | 'running' | 'pending' | 'skipped' | 'aborted';

export const OUTCOME_META: Record<OutcomeKind, StatusMeta> = {
  pass: { label: 'Passed', glyph: '✓', cls: 'pass', cssVar: '--ok' },
  fail: { label: 'Failed', glyph: '✗', cls: 'fail', cssVar: '--bad' },
  warn: { label: 'Warning', glyph: '⚠', cls: 'warn', cssVar: '--warn' },
  info: { label: 'Info', glyph: 'ℹ', cls: 'info', cssVar: '--info' },
  running: { label: 'Running', glyph: '◌', cls: 'running', cssVar: '--info' },
  pending: { label: 'Pending', glyph: '○', cls: 'pending', cssVar: '--tx-2' },
  skipped: { label: 'Skipped', glyph: '–', cls: 'skipped', cssVar: '--tx-2' },
  aborted: { label: 'Aborted', glyph: '⊘', cls: 'aborted', cssVar: '--tx-2' },
};

/**
 * Map the many spellings of an outcome (Jenkins `SUCCESS`/`UNSTABLE`/`FAILURE`, GitHub `success`/
 * `failure`/`neutral`, JUnit `passed`/`failed`, quiz `right`/`wrong`) to an `OutcomeKind`.
 */
export function outcomeKind(result: string | boolean | null | undefined): OutcomeKind {
  if (result === true) return 'pass';
  if (result === false) return 'fail';
  const r = String(result ?? '').trim().toLowerCase();
  if (/^(success|succeeded|pass|passed|ok|right|correct|green|blue|merged|approved|done)$/.test(r)) return 'pass';
  if (/^(failure|failed|fail|error|errored|wrong|incorrect|red|broken|timed_out|timeout|changes_requested|conflict)$/.test(r)) return 'fail';
  if (/^(unstable|warning|warn|yellow|action_required|stale)$/.test(r)) return 'warn';
  if (/^(running|in_progress|building|queued_running|anime)$/.test(r)) return 'running';
  if (/^(pending|queued|waiting|not_built|notbuilt|expected)$/.test(r)) return 'pending';
  if (/^(skipped|neutral|cancelled_skip)$/.test(r)) return 'skipped';
  if (/^(aborted|cancelled|canceled)$/.test(r)) return 'aborted';
  return 'info';
}

/** Ticket severity (P1 most urgent) → shape cue, so severity never relies on red vs amber vs blue. */
export const SEVERITY_GLYPH: Record<string, string> = { P1: '▲', P2: '◆', P3: '●', P4: '○' };

/* ───────────────────────────── UI scale ───────────────────────────── */

export const UI_SCALE_MIN = 0.85;
export const UI_SCALE_MAX = 1.5;

/** Clamp the UI scale setting to its supported range (non-numbers → 1), rounded to 0.01. */
export function clampUiScale(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.round(Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, n)) * 100) / 100;
}

/**
 * Effective CSS `zoom` of an element (1 when unsupported). Pointer coordinates (`clientX`) and
 * `getBoundingClientRect()` are in visual pixels; lengths written to `style` inside a zoomed subtree
 * are multiplied by the zoom, so divide visual deltas by this before writing them back.
 */
export function cssZoom(el: Element | null | undefined): number {
  const z = (el as (Element & { currentCSSZoom?: number }) | null | undefined)?.currentCSSZoom;
  return typeof z === 'number' && Number.isFinite(z) && z > 0 ? z : 1;
}

/** `clientX/Y` → the element's own (zoom-corrected) CSS px, relative to its border box. */
export function localPoint(el: Element | null | undefined, clientX: number, clientY: number): { x: number; y: number } {
  if (!el) return { x: clientX, y: clientY };
  const r = el.getBoundingClientRect();
  const z = cssZoom(el);
  return { x: (clientX - r.left) / z, y: (clientY - r.top) / z };
}

/* ───────────────────────────── focus ───────────────────────────── */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** Keyboard-focusable descendants in DOM order (skips hidden / inert ones). */
export function focusableIn(root: ParentNode | null | undefined): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.closest('[inert], [aria-hidden="true"]')) return false;
    if (el.getAttribute('tabindex') === '-1') return false;
    // Rendered? (jsdom has no layout: treat everything as visible there.)
    const noLayout = !!el.ownerDocument?.defaultView?.navigator?.userAgent?.includes('jsdom');
    return noLayout || el.getClientRects().length > 0;
  });
}

/**
 * Keep Tab / Shift+Tab inside `root` (a modal dialog). Returns true when it moved focus itself.
 * Call from a keydown handler on the dialog.
 */
export function trapTabKey(e: { key: string; shiftKey: boolean; preventDefault: () => void }, root: HTMLElement | null): boolean {
  if (e.key !== 'Tab' || !root) return false;
  const items = focusableIn(root);
  const active = root.ownerDocument.activeElement as HTMLElement | null;
  if (!items.length) {
    e.preventDefault();
    root.focus();
    return true;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const inside = !!active && root.contains(active);
  if (e.shiftKey && (active === first || active === root || !inside)) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/**
 * Props that make a non-button element (a list row, a header) behave like a button for keyboard
 * users: focusable, Enter / Space activate it. Spread onto the element: `<div {...pressable(fn)}>`.
 */
export function pressable(fn: () => void): {
  role: 'button';
  tabIndex: 0;
  onClick: () => void;
  onKeyDown: (e: { key: string; target: EventTarget | null; currentTarget: EventTarget | null; preventDefault: () => void }) => void;
} {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fn();
      }
    },
  };
}
