/**
 * Shared helpers for rig interactions (World §9): sim-call wrapper (never throws, reports
 * failures as a toast + `ui-fail`), tool lookup, focus + overlay helpers, crosshair → screen-mm
 * ray casting for "Tap screen", and the registration helper that maps a catalogue spec onto an
 * engine `Interactable` with a hit proxy.
 */
import { Raycaster, Vector2, Vector3, type Mesh, type Object3D } from 'three';
import type { Engine, InteractVerb } from '@/engine/types';
import type { ToolId } from '@/core/state';
import { mutate, store } from '@/core/store';
import { INTERACTABLE_IDS, type InteractableSpec } from '../layout';
import type { FocusPose } from '../layout';

export type Verb = InteractVerb;

/** Every id registered by the rig builders (coverage checks). */
export const registered = new Set<string>();
/** id → registered interactables (debug / sandbox / tests: list and run verbs without raycasting). */
export const registry = new Map<string, { label: () => string; verbs: () => Verb[] }[]>();

let toastSeq = 0;

export function toast(kind: 'info' | 'warning' | 'error' | 'success', title: string, body?: string): void {
  mutate((s) => {
    s.ui.toasts.push({ id: `rigs-${++toastSeq}`, kind, title, ...(body ? { body } : {}), createdAtMs: s.lab?.time?.nowMs ?? 0 });
    if (s.ui.toasts.length > 20) s.ui.toasts.splice(0, s.ui.toasts.length - 20);
  });
}

interface ResultLike {
  ok: boolean;
  error?: string;
}

/**
 * Call a sim action safely. Returns the result (or a synthetic failure). Failures other than
 * "not implemented" are surfaced to the player like the real tool would.
 */
export function simCall<T extends ResultLike>(engine: Engine, label: string, fn: () => T | undefined): T | ResultLike {
  let r: T | ResultLike | undefined;
  try {
    r = fn();
  } catch (err) {
    r = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!r) r = { ok: false, error: 'not implemented' };
  if (!r.ok) {
    if (r.error && !/not implemented/i.test(r.error)) toast('warning', label, r.error);
    try {
      engine.audio.play('ui-fail', { volume: 0.5 });
    } catch {
      /* ignore */
    }
  }
  return r;
}

export function notImplemented(r: ResultLike): boolean {
  return !r.ok && /not implemented/i.test(r.error ?? '');
}

export function activeTool(): ToolId {
  return store.getState().session.activeTool;
}

/** Focus the camera on a pose and open an overlay (tablet / inspect). The UI releases focus. */
export function focusWithOverlay(engine: Engine, pose: FocusPose, overlay: { kind: 'tablet'; robotId: string } | { kind: 'inspect'; propId: string }): void {
  const p = overlay.kind === 'inspect' ? besidePanel(engine, pose) : pose;
  void engine.focus({ position: p.position, lookAt: p.lookAt, fov: p.fov }, 600);
  mutate((s) => {
    s.ui.overlay = overlay;
  });
}

/** Width (px, incl. margin) of the inspect panel docked on the right of the viewport (ui/styles/overlays.css). */
const INSPECT_PANEL_PX = 548;

/**
 * Slide a focus pose sideways (camera right) so its target sits in the middle of the viewport area
 * left of the inspect panel instead of under it.
 */
function besidePanel(engine: Engine, pose: FocusPose): FocusPose {
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  if (!(w > INSPECT_PANEL_PX * 1.6)) return pose;
  const pos = new Vector3(...pose.position);
  const at = new Vector3(...pose.lookAt);
  const fwd = at.clone().sub(pos);
  const dist = fwd.length();
  const right = fwd.normalize().cross(new Vector3(0, 1, 0));
  if (dist < 1e-4 || right.lengthSq() < 1e-6) return pose;
  right.normalize();
  const fov = ((pose.fov ?? engine.camera.fov) * Math.PI) / 180;
  const ndc = INSPECT_PANEL_PX / w; // target NDC x = −ndc
  const shift = dist * Math.tan(fov / 2) * engine.camera.aspect * ndc;
  const d = right.multiplyScalar(shift);
  const t = (v: Vector3) => [v.x, v.y, v.z] as [number, number, number];
  return { ...pose, position: t(pos.add(d)), lookAt: t(at.add(d)) };
}

/**
 * The sim's re-seat calls toggle the part (seated ⇄ out). A player "re-seat" of a seated part is
 * out + back in; an unseated part is just pushed home. Returns the verb label + action.
 */
export function reseatAction(engine: Engine, what: string, seated: boolean, toggle: () => ResultLike): { label: string; run: () => void } {
  return {
    label: seated ? `Re-seat ${what}` : `Plug in ${what}`,
    run: () => {
      if (seated && !simCall(engine, what, toggle).ok) return;
      simCall(engine, what, toggle);
    },
  };
}

const ray = new Raycaster();
const centre = new Vector2(0, 0);

/** Screen-mm (x right, y down from the top-left) of the crosshair on a screen plane, or null. */
export function crosshairScreenMm(engine: Engine, screen: Mesh, wMm: number, hMm: number): { x: number; y: number } | null {
  ray.setFromCamera(centre, engine.camera);
  const vis = screen.visible;
  screen.visible = true;
  const hit = ray.intersectObject(screen, false)[0];
  screen.visible = vis;
  if (!hit?.uv) return null;
  return { x: Math.round(hit.uv.x * wMm * 10) / 10, y: Math.round((1 - hit.uv.y) * hMm * 10) / 10 };
}

export interface RegOptions {
  label?: () => string;
  verbs: () => Verb[];
  reach?: number;
}

/** Register a catalogue interactable (label/reach/callouts from the spec) on a proxy object. */
export function reg(engine: Engine, offs: (() => void)[], id: string, object: Object3D, o: RegOptions): void {
  const spec: InteractableSpec | undefined = INTERACTABLE_IDS[id];
  const label = o.label ?? (() => spec?.label ?? id);
  const reach = o.reach ?? spec?.reach ?? 2.2;
  const interactable = { id, object, label, verbs: o.verbs, reach, callouts: () => [...(spec?.callouts ?? [])] };
  const off = engine.registerInteractable(interactable);
  registered.add(id);
  const list = registry.get(id) ?? [];
  list.push(interactable);
  registry.set(id, list);
  offs.push(() => {
    off();
    const l = registry.get(id);
    if (l) {
      const i = l.indexOf(interactable);
      if (i >= 0) l.splice(i, 1);
      if (l.length === 0) registry.delete(id);
    }
  });
}

/** "Open / Close" → the half that applies. */
export function pick(label: string, second: boolean): string {
  const parts = label.split(' / ');
  if (parts.length !== 2) return label;
  const [a, b] = parts as [string, string];
  // "Unplug / Plug" style: words share the object noun only in the first half
  return second ? b : a;
}

export function verb(key: 'E' | 'R' | 'G', label: string, run: () => void, extra: Partial<Verb> = {}): Verb {
  return { key, label, run, ...extra };
}

/** Card profiles presented by hand for each test card in the inventory (Sim seed `cards.ts`). */
const CARD_PROFILES: Record<string, Partial<Record<'TAP' | 'DIP' | 'SWIPE', string>>> = {
  'test-card-visa': { TAP: 'VISA_STD_TAP', DIP: 'VISA_STD_DIP', SWIPE: 'VISA_STD_SWIPE' },
  'test-card-interac': { TAP: 'INTERAC_CA_TAP', DIP: 'INTERAC_CA_DIP' },
};

/**
 * Verbs for presenting the held test card to a device (World §9.2 "present test card"): E tap on
 * the NFC landmark, R insert into the chip slot, G swipe. Null when no test card is held.
 */
export function cardVerbs(engine: Engine, deviceId: () => string | null, present: (id: string, entry: 'TAP' | 'DIP' | 'SWIPE', profile: string) => ResultLike): Verb[] | null {
  const tool = activeTool();
  const profiles = CARD_PROFILES[tool];
  if (!profiles) return null;
  const mk = (key: 'E' | 'R' | 'G', label: string, entry: 'TAP' | 'DIP' | 'SWIPE') => {
    const profile = profiles[entry];
    return verb(key, profile ? label : `${label} — no magstripe`, () => {
      const id = deviceId();
      if (!id || !profile) return;
      simCall(engine, 'Test card', () => present(id, entry, profile));
      try {
        engine.audio.play(entry === 'TAP' ? 'nfc-tap' : 'card-insert', { volume: 0.7 });
      } catch {
        /* ignore */
      }
    }, { disabled: !profile || !deviceId() });
  };
  return [mk('E', 'Tap card', 'TAP'), mk('R', 'Insert card (chip)', 'DIP'), mk('G', 'Swipe card', 'SWIPE')];
}
