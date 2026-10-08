/**
 * Integrated world sandbox (sandbox-world.html): boots the engine and `buildWorld()` (lab + rigs)
 * against the real sim state, runs the real `GameLoop` (fixed-step `sim.tick` + `engine.frame`),
 * spawns the player per layout and exposes `window.__world` with location teleports, named
 * views, interactable verbs and the end-to-end checks in `./sandboxChecks`.
 *
 * URL params: `?q=low|medium|high|ultra`, `?view=<name>` or `?loc=<loc.id>` after load,
 * `?timer=1` (timer-driven frames for headless tests).
 */
import { engine } from '@/engine';
import type { LabEngine } from '@/engine/engine';
import { mutate, store } from '@/core/store';
import { GameLoop } from '@/core/loop';
import type { QualityPreset, ToolId } from '@/core/state';
import { sim } from '@/sim';
import { INTERACTABLES, LOCATIONS, SPAWNS, buildWorld, teleportToSpawn } from './index';
import { labContext } from './lab';
import { rigsWorld } from './rigs';
import { VIEWS, locationView, type ViewDef } from './sandboxViews';
import * as checks from './sandboxChecks';

declare global {
  interface Window {
    __world?: Record<string, unknown>;
  }
}

// `?timer=1`: drive frames from timers. Headless Chromium (SwiftShader) stops delivering rAF
// callbacks after a few seconds unless something forces a frame, which freezes the loop in tests.
if (new URLSearchParams(location.search).get('timer') === '1') {
  let id = 0;
  const pending = new Map<number, ReturnType<typeof setTimeout>>();
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const n = ++id;
    pending.set(n, setTimeout(() => {
      pending.delete(n);
      cb(performance.now());
    }, 16));
    return n;
  };
  window.cancelAnimationFrame = (n: number) => {
    clearTimeout(pending.get(n));
    pending.delete(n);
  };
}

const TOOLS: ToolId[] = ['hand', 'screwdriver', 'multimeter', 'spare-fuse-5v', 'flashlight', 'test-card-visa'];

/** Stand at `pos` (eye height from the engine) looking at `look`. */
function walkLook(v: ViewDef): void {
  const dx = v.look[0] - v.pos[0];
  const dz = v.look[2] - v.pos[2];
  const eye = 1.65;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(v.look[1] - eye, Math.hypot(dx, dz));
  if (engine.isFocused()) void engine.releaseFocus(1);
  engine.teleportPlayer([v.pos[0], 0, v.pos[2]], yaw, pitch);
}

/** Exact camera pose (any height / fov) via a focus — walking is disabled until `release()`. */
function focusLook(v: ViewDef): Promise<void> {
  return engine.focus({ position: v.pos, lookAt: v.look, fov: v.fov ?? 60 }, 1);
}

function installHud(status: HTMLElement): void {
  const promptEl = document.getElementById('prompt')!;
  const toastEl = document.getElementById('toasts')!;
  store.subscribe((s, prev) => {
    if (s.ui.prompt !== prev.ui.prompt) {
      const p = s.ui.prompt;
      promptEl.style.display = p ? 'block' : 'none';
      promptEl.replaceChildren();
      if (p) {
        const l = document.createElement('div');
        l.className = 'label';
        l.textContent = p.label;
        promptEl.appendChild(l);
        for (const vb of p.verbs) {
          const row = document.createElement('div');
          if (vb.disabled) row.className = 'disabled';
          const k = document.createElement('span');
          k.className = 'key';
          k.textContent = vb.key;
          row.append(k, document.createTextNode(vb.label));
          promptEl.appendChild(row);
        }
      }
    }
    if (s.ui.toasts !== prev.ui.toasts) {
      toastEl.replaceChildren();
      for (const t of s.ui.toasts.slice(-4)) {
        const d = document.createElement('div');
        d.className = `toast ${t.kind}`;
        d.textContent = t.body ? `${t.title} — ${t.body}` : t.title;
        toastEl.appendChild(d);
      }
    }
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape' && engine.isFocused()) {
      mutate((s) => void (s.ui.overlay = { kind: 'none' }));
      rigsWorld()?.screens.setFocused(null);
      void engine.releaseFocus();
    }
    const n = Number(ev.key);
    if (n >= 1 && n <= TOOLS.length) mutate((s) => void (s.session.activeTool = TOOLS[n - 1]!));
  });
  const e = engine as LabEngine;
  setInterval(() => {
    const st = engine.stats();
    const s = store.getState();
    const ov = s.ui.overlay.kind !== 'none' ? ` · overlay ${JSON.stringify(s.ui.overlay)}` : '';
    status.textContent = `${st.fps.toFixed(0)} fps · ${st.drawCalls} draws · ${(st.triangles / 1000).toFixed(1)}k tris · ${st.textures} tex · ${st.geometries} geo\nquality ${e.qualitySettings.preset} · tool ${s.session.activeTool} · loc ${s.session.player.locationId ?? '—'} · looking ${s.session.player.lookingAt ?? '—'}${ov}`;
  }, 500);
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const status = document.getElementById('stats')!;
  const params = new URLSearchParams(location.search);
  const q = (params.get('q') as QualityPreset | null) ?? 'high';
  sim.reset();
  mutate((s) => {
    s.ui.overlay = { kind: 'none' };
    s.ui.loading = null;
    s.session.mode = 'freeplay';
    s.session.inventory = [...TOOLS, 'ethernet-cable'];
    s.session.activeTool = 'hand';
    s.progress.settings.quality = q;
  });

  await engine.init(canvas);
  engine.setQuality(q);
  checks.captureInteractables(engine);
  const t0 = performance.now();
  await buildWorld(engine, (p, l) => (status.textContent = `${Math.round(p * 100)}% ${l}`));
  const buildMs = Math.round(performance.now() - t0);

  // The game's own loop: fixed-step sim at 20 Hz, render every animation frame.
  let simErrors = 0;
  const loop = new GameLoop({
    simulate: (dt) => {
      try {
        sim.tick(dt);
      } catch (err) {
        if (++simErrors <= 3) console.warn('[world sandbox] sim.tick failed', err);
      }
    },
    render: (dt) => engine.frame(dt),
    timeScale: () => store.getState().lab.time.timeScale,
    paused: () => store.getState().ui.loading !== null,
  });
  loop.start();
  installHud(status);

  const v = params.get('view');
  const loc = params.get('loc');
  if (v && VIEWS[v]) void focusLook(VIEWS[v]);
  else if (loc) {
    const lv = locationView(loc);
    if (lv) walkLook(lv);
  }

  window.__engine = engine;
  window.__store = store;
  (window as unknown as { __sim: typeof sim }).__sim = sim;
  window.__world = {
    buildMs,
    sim,
    /** Stop / restart the frame loop (headless screenshots need an idle GPU queue). */
    pause: () => loop.stop(),
    resume: () => loop.start(),
    /** Advance `n` frames synchronously (sim + render) — deterministic stepping while paused. */
    step: (n = 1, dtMs = 50) => {
      for (let i = 0; i < n; i++) {
        sim.tick(dtMs);
        engine.frame(dtMs / 1000);
      }
      return engine.stats();
    },
    checks,
    lab: labContext,
    rigs: rigsWorld,
    locations: () => LOCATIONS.map((l) => l.id),
    spawns: () => SPAWNS.map((s) => s.id),
    views: () => Object.keys(VIEWS),
    /** Stand at a location anchor (walk mode: prompts + location tracking work). */
    goto: (id: string) => {
      const lv = locationView(id);
      if (lv) walkLook(lv);
      return !!lv;
    },
    spawn: (id: string) => teleportToSpawn(engine, id),
    /** Named photo / close-up view (focus mode). */
    view: (name: string) => {
      const vv = VIEWS[name];
      // IMG-G / VID were taken through WALL-E's open side door
      if (name === 'img-g' || name === 'vid') sim.rig.setDoor('wall-e', true, 'player');
      if (vv) void focusLook(vv);
      return !!vv;
    },
    pose: (pos: [number, number, number], look: [number, number, number], fov?: number) => focusLook({ pos, look, fov }),
    stand: (pos: [number, number, number], look: [number, number, number]) => walkLook({ pos, look }),
    release: () => engine.releaseFocus(1),
    setQuality: (qq: QualityPreset) => {
      mutate((s) => void (s.progress.settings.quality = qq));
      engine.setQuality(qq);
    },
    setTool: (t: ToolId) => mutate((s) => void (s.session.activeTool = t)),
    stats: () => engine.stats(),
    /** Registered interactable ids. */
    ids: () => [...checks.captured.keys()].sort(),
    /** Label + verbs of an interactable. */
    verbs: (id: string) => (checks.captured.get(id) ?? []).map((i) => ({ label: i.label(), verbs: i.verbs().map((x) => `${x.key}:${x.label}${x.disabled ? ' (disabled)' : ''}`) })),
    run: (id: string, key: 'E' | 'F' | 'R' | 'G' | 'Q') => {
      const vb = checks.captured.get(id)?.[0]?.verbs().find((x) => x.key === key);
      if (!vb || vb.disabled) return false;
      vb.run();
      return true;
    },
    /** World §9 catalogue vs what the builders registered. */
    coverage: () => {
      const cat = new Set(INTERACTABLES.map((i) => i.id));
      const reg = new Set(checks.captured.keys());
      return {
        catalogue: cat.size,
        registered: reg.size,
        missing: [...cat].filter((id) => !reg.has(id)),
        extra: [...reg].filter((id) => !cat.has(id)).length,
      };
    },
    lookAt: (id: string) => checks.lookAtInteractable(engine, id),
    auditReach: (only?: string[]) => checks.auditReach(engine, only),
    /** Open / close every touch-rig side door (sim), e.g. before a reach audit of bay internals. */
    doors: (open: boolean) => {
      for (const id of Object.keys(store.getState().lab.rigs)) {
        try {
          sim.rig.setDoor(id, open, 'player');
        } catch {
          /* rigs without doors */
        }
      }
    },
    navAudit: () => checks.navAudit(engine),
    gantry: (rig?: string) => checks.scenarioGantry(engine, rig),
    fuse: (id?: string) => checks.scenarioFuse(id),
    probe: () => checks.scenarioProbe(),
    banner: (rig: string) => checks.tabletBanner(rig),
    auditUpdates: (ms?: number) => checks.auditUpdates(ms),
  };
}

void boot();
