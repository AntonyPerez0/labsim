/**
 * Keyboard / mouse / pointer-lock input for the first-person view.
 *
 * - Movement keys are tracked by `KeyboardEvent.code` (layout independent: WASD = physical keys).
 * - Interaction keys (E/F/R/G/Q) and left-click (= E while locked) are queued as edge events and
 *   consumed by the engine in `frame()`.
 * - Mouse deltas accumulate only while the pointer is locked to our canvas.
 * - Events targeting editable elements (inputs, textareas, contenteditable) are ignored so typing
 *   in the in-game computer never moves the player.
 */
import type { InteractVerb } from './types';
import { interactKeyFromCode } from './prompt';

export interface InputCallbacks {
  /**
   * User gesture (for the audio unlock). Called on every gesture until it returns true (audio
   * running) — a first gesture that doesn't grant user activation (e.g. Esc) must not use it up.
   */
  onGesture(): boolean;
  /** Mouse down on the 3D view while not locked — engine decides whether to lock. */
  onViewClick(): void;
  onPointerLockChange(locked: boolean): void;
}

const MAX_QUEUED_PRESSES = 3;

const MOVE_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space', 'KeyC',
]);

function isEditable(t: EventTarget | null): boolean {
  if (!t || !(t instanceof Element)) return false;
  if ((t as HTMLElement).isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isUiControl(t: EventTarget | null): boolean {
  if (!t || !(t instanceof Element)) return false;
  return !!t.closest('button, a, input, textarea, select, label, [role="button"], [role="dialog"], [data-ui-interactive]');
}

export class InputManager {
  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private pressed: InteractVerb['key'][] = [];
  private jumpQueued = false;
  private crouchQueued = false;
  private gestured = false;
  locked = false;
  /** When false, movement/look/interact input is ignored (keys still tracked for release). */
  active = false;
  private readonly off: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cb: InputCallbacks,
  ) {
    const on = (target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, opts);
      this.off.push(() => target.removeEventListener(type, fn, opts));
    };
    on(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    on(window, 'keyup', (e) => this.keys.delete((e as KeyboardEvent).code));
    on(window, 'blur', () => this.clear());
    on(document, 'visibilitychange', () => {
      if (document.hidden) this.clear();
    });
    on(window, 'mousedown', (e) => this.onMouseDown(e as MouseEvent), { capture: true });
    on(window, 'mousemove', (ev) => {
      if (!this.locked) return;
      const e = ev as MouseEvent;
      // Clamp spikes (some browsers emit huge deltas right after locking).
      this.mouseDX += Math.max(-300, Math.min(300, e.movementX || 0));
      this.mouseDY += Math.max(-300, Math.min(300, e.movementY || 0));
    });
    on(window, 'touchstart', () => this.gesture(), { passive: true });
    on(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (locked !== this.locked) {
        this.locked = locked;
        this.mouseDX = this.mouseDY = 0;
        this.cb.onPointerLockChange(locked);
      }
    });
    on(document, 'pointerlockerror', () => {
      /* swallow: headless browsers and iframes may refuse */
    });
    const ctxMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', ctxMenu);
    this.off.push(() => canvas.removeEventListener('contextmenu', ctxMenu));
  }

  private gesture(): void {
    if (this.gestured) return;
    if (this.cb.onGesture()) this.gestured = true;
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.gesture();
    if (isEditable(e.target)) return;
    if (MOVE_CODES.has(e.code)) {
      this.keys.add(e.code);
      if (this.active) {
        if (e.code === 'Space' && !e.repeat) this.jumpQueued = true;
        if (e.code === 'KeyC' && !e.repeat) this.crouchQueued = true;
        // stop page scrolling with Space / arrows while walking
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      }
      return;
    }
    if (!this.active || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = interactKeyFromCode(e.code);
    if (k) this.queuePress(k);
  }

  /** Queue an interaction press (bounded: mashing keys during a hitch must not replay later). */
  private queuePress(k: InteractVerb['key']): void {
    if (this.pressed.length < MAX_QUEUED_PRESSES) this.pressed.push(k);
  }

  private onMouseDown(e: MouseEvent): void {
    this.gesture();
    if (!this.locked) {
      // Not locked: a left click on the 3D view (not on a UI control) may grab the mouse. The
      // engine decides (overlay closed, controls enabled, not focused) — so this runs even while
      // input is inactive, e.g. during a release-focus tween.
      if (e.button === 0 && (e.target === this.canvas || !isUiControl(e.target))) this.cb.onViewClick();
      return;
    }
    if (!this.active) return;
    if (e.button === 0) this.queuePress('E');
    e.preventDefault();
  }

  /** Release everything (focus lost, overlay opened, …). */
  clear(): void {
    this.keys.clear();
    this.pressed.length = 0;
    this.jumpQueued = this.crouchQueued = false;
    this.mouseDX = this.mouseDY = 0;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  axis(neg: string, pos: string, neg2: string, pos2: string): number {
    return (this.keys.has(pos) || this.keys.has(pos2) ? 1 : 0) - (this.keys.has(neg) || this.keys.has(neg2) ? 1 : 0);
  }

  consumeMouse(out: { dx: number; dy: number }): void {
    out.dx = this.mouseDX;
    out.dy = this.mouseDY;
    this.mouseDX = this.mouseDY = 0;
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  consumeCrouch(): boolean {
    const c = this.crouchQueued;
    this.crouchQueued = false;
    return c;
  }

  /** Pop the next queued interaction key, or null. */
  nextPress(): InteractVerb['key'] | null {
    return this.pressed.shift() ?? null;
  }

  requestLock(): void {
    try {
      const anyCanvas = this.canvas as HTMLCanvasElement & { requestPointerLock(o?: { unadjustedMovement?: boolean }): Promise<void> | void };
      const r = anyCanvas.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch(() => {
          // unadjustedMovement unsupported (or lock refused) → plain request
          try {
            const r2 = anyCanvas.requestPointerLock();
            if (r2 && typeof (r2 as Promise<void>).catch === 'function') (r2 as Promise<void>).catch(() => {});
          } catch {
            /* ignore */
          }
        });
      }
    } catch {
      /* ignore */
    }
  }

  exitLock(): void {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* ignore */
    }
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}
