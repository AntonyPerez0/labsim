/**
 * World-lab sandbox (sandbox-world-lab.html): boots the engine and `buildLab` (optionally the rigs
 * with `?rigs=1`) without menus/missions, runs its own rAF loop, ticks the sim if it is
 * implemented, and exposes `window.__engine`, `window.__store`, `window.__lab` with named views
 * for screenshots: `__lab.view('power-wall')`.
 */
import { engine } from '@/engine';
import type { LabEngine } from '@/engine/engine';
import { mutate, store } from '@/core/store';
import type { QualityPreset, ToolId } from '@/core/state';
import { sim } from '@/sim';
import { LOCATIONS, SPAWN_BY_ID, degToRad, interactablesFor } from '../layout';
import { buildLab, labContext } from './index';

type V3 = [number, number, number];

/** Named camera views (eye position → look-at) for visual checks. */
const VIEWS: Record<string, { pos: V3; look: V3 }> = {
  entrance: { pos: [5.9, 1.65, 4.2], look: [1.0, 1.2, -1.5] },
  'entrance-wide': { pos: [6.3, 1.7, 4.5], look: [-2.0, 1.1, -3.0] },
  workstation: { pos: [1.1, 1.45, 3.55], look: [1.1, 0.95, 4.8] },
  seated: { pos: [1.1, 1.2, 4.12], look: [1.1, 1.08, 4.8] },
  'power-wall': { pos: [-0.7, 1.65, -3.4], look: [-0.7, 1.6, -4.98] },
  'power-wall-close': { pos: [-0.5, 1.75, -4.1], look: [-0.4, 1.85, -4.98] },
  server: { pos: [-3.3, 1.55, -3.3], look: [-3.75, 1.05, -4.8] },
  fab: { pos: [-5.4, 1.6, -3.3], look: [-5.9, 1.05, -4.8] },
  'parts-wall': { pos: [3.9, 1.6, -2.9], look: [4.2, 1.2, -4.9] },
  jared: { pos: [2.5, 1.65, -3.2], look: [2.6, 1.0, -4.8] },
  husky: { pos: [4.9, 1.4, -3.4], look: [4.9, 0.8, -4.9] },
  whiteboard: { pos: [-5.0, 1.6, -2.2], look: [-7.0, 1.4, -2.3] },
  'west-wall': { pos: [-4.5, 1.6, 1.0], look: [-7.0, 1.3, 0.5] },
  library: { pos: [5.0, 1.55, 0.3], look: [7.0, 1.25, 0.3] },
  desks: { pos: [-2.0, 1.65, 2.2], look: [-3.5, 0.9, 4.8] },
  history: { pos: [3.6, 1.6, 2.7], look: [3.75, 1.4, 5.0] },
  corridor: { pos: [5.9, 1.65, 6.6], look: [5.9, 1.2, 4.0] },
  'rack-row': { pos: [-0.5, 1.7, 1.6], look: [-2.0, 1.2, -2.5] },
  ceiling: { pos: [0, 1.6, 2.5], look: [0, 2.9, -2.0] },
  overview: { pos: [6.6, 2.8, 4.7], look: [-2.0, 0.4, -2.5] },
};

declare global {
  interface Window {
    __lab?: Record<string, unknown>;
  }
}

function lookAt(pos: V3, look: V3): void {
  const dx = look[0] - pos[0];
  const dy = look[1] - pos[1];
  const dz = look[2] - pos[2];
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  engine.teleportPlayer([pos[0], 0, pos[2]], yaw, pitch);
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const q = (params.get('q') as QualityPreset | null) ?? 'high';
  mutate((s) => {
    s.ui.overlay = { kind: 'none' };
    s.ui.loading = null;
    s.session.mode = 'freeplay';
    s.session.inventory = ['hand', 'flashlight', 'multimeter', 'spare-fuse-5v', 'screwdriver', 'test-card-visa'];
    s.session.activeTool = 'hand';
    s.progress.settings.quality = q;
  });
  try {
    sim.reset();
  } catch {
    /* sim not implemented yet */
  }

  await engine.init(canvas);
  engine.setQuality(q);
  const e = engine as LabEngine;
  for (const l of LOCATIONS) engine.registerLocation({ id: l.id, label: l.label, center: l.center, radius: l.radius });

  const status = document.getElementById('stats')!;
  await buildLab(engine, (p, l) => (status.textContent = `${Math.round(p * 100)}% ${l}`));
  if (params.get('rigs') === '1') {
    try {
      const { buildRigs } = await import('../rigs');
      await buildRigs(engine, () => {});
    } catch (err) {
      console.warn('[sandbox] rigs failed', err);
    }
  }
  const spawn = SPAWN_BY_ID['spawn.entrance']!;
  engine.teleportPlayer(spawn.pos, degToRad(spawn.yawDeg));
  const v = params.get('view');
  if (v && VIEWS[v]) lookAt(VIEWS[v].pos, VIEWS[v].look);

  // Loop: tick the sim when it is implemented.
  let simOk = true;
  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (simOk) {
      try {
        sim.tick(dt * 1000);
      } catch {
        simOk = false;
      }
    }
    engine.frame(dt);
  };
  requestAnimationFrame(loop);

  // HUD
  const promptEl = document.getElementById('prompt')!;
  const toastEl = document.getElementById('toasts')!;
  store.subscribe((s, prev) => {
    if (s.ui.prompt !== prev.ui.prompt) {
      const p = s.ui.prompt;
      promptEl.style.display = p ? 'block' : 'none';
      promptEl.innerHTML = '';
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
      toastEl.innerHTML = '';
      for (const t of s.ui.toasts.slice(-4)) {
        const d = document.createElement('div');
        d.className = `toast ${t.kind}`;
        d.textContent = t.body ? `${t.title} — ${t.body}` : t.title;
        toastEl.appendChild(d);
      }
    }
    if (s.ui.overlay !== prev.ui.overlay && s.ui.overlay.kind !== 'none') {
      status.textContent = `overlay: ${JSON.stringify(s.ui.overlay)} (Esc to close)`;
    }
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape' && engine.isFocused()) {
      mutate((s) => {
        s.ui.overlay = { kind: 'none' };
      });
      void engine.releaseFocus();
    }
    const n = Number(ev.key);
    const tools: ToolId[] = ['hand', 'screwdriver', 'multimeter', 'spare-fuse-5v', 'flashlight', 'test-card-visa'];
    if (n >= 1 && n <= 6) mutate((s) => void (s.session.activeTool = tools[n - 1]!));
  });
  setInterval(() => {
    const st = engine.stats();
    const s = store.getState();
    status.textContent = `${st.fps.toFixed(0)} fps · ${st.drawCalls} draws · ${(st.triangles / 1000).toFixed(1)}k tris · ${st.textures} tex · ${st.geometries} geo\nquality ${e.qualitySettings.preset} · tool ${s.session.activeTool} · loc ${s.session.player.locationId ?? '—'} · looking ${s.session.player.lookingAt ?? '—'}`;
  }, 500);

  window.__engine = engine;
  window.__store = store;
  window.__lab = {
    ctx: labContext(),
    views: Object.keys(VIEWS),
    view: (name: string) => {
      const vv = VIEWS[name];
      if (vv) lookAt(vv.pos, vv.look);
      return !!vv;
    },
    lookAt,
    setQuality: (qq: QualityPreset) => {
      mutate((s) => void (s.progress.settings.quality = qq));
      engine.setQuality(qq);
    },
    setTool: (t: ToolId) => mutate((s) => void (s.session.activeTool = t)),
    stats: () => engine.stats(),
    /** Catalogue ids (World §9, builder 'lab') that buildLab did not register. */
    missingIa: () => {
      const reg = labContext()?.ia.registered;
      return interactablesFor('lab').map((i) => i.id).filter((id) => !reg?.has(id));
    },
    /** Interactables registered that are not in the catalogue. */
    extraIa: () => {
      const cat = new Set(interactablesFor('lab').map((i) => i.id));
      return [...(labContext()?.ia.registered.keys() ?? [])].filter((id) => !cat.has(id));
    },
  };
}

void boot();
