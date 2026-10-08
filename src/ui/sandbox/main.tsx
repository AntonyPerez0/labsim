/**
 * UI sandbox (`sandbox-ui.html`): mounts the real <App /> over a painted stand-in for the 3D lab
 * (no WebGL needed) and applies a scene from `?scene=` — title, menu, academy, arcade, drills, hud,
 * shift, tickets, quiz, manual, flashcards, settings, debrief, pause, profile, notebook, loading.
 * Keys: Alt+[ / Alt+] cycle scenes.
 */
import { createRoot } from 'react-dom/client';
import { App } from '@/ui/App';
import { store } from '@/core/store';
import { bus } from '@/core/bus';
import { sim } from '@/sim';
import { missions } from '@/missions';
import { PAUSING_OVERLAY_KINDS } from '@/core/state';
import { applyScene, type SceneId } from './fixtures';
import '@/ui/styles/global.css';

const SCENES: SceneId[] = ['quiz-order', 'quiz-match', 'quiz-fill', 'title', 'menu', 'academy', 'arcade', 'drills', 'profile', 'hud', 'pause', 'notebook', 'shift', 'tickets', 'quiz', 'manual', 'flashcards', 'settings', 'debrief', 'loading', 'computer', 'tablet', 'inspect', 'drill', 'freeplay', 'controls', 'debug', 'cert', 'freeplay-menu', 'daily', 'board-arch', 'board-roadmap', 'board-history', 'board-bolts', 'ruler'];

/** Paint a dim, lab-like backdrop (racks, tablets, LEDs, ceiling lights) in place of the 3D view. */
function paintLab(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = (canvas.width = Math.floor(window.innerWidth * dpr));
  const h = (canvas.height = Math.floor(window.innerHeight * dpr));
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const W = w / dpr;
  const H = h / dpr;
  // wall + floor
  const wall = g.createLinearGradient(0, 0, 0, H * 0.62);
  wall.addColorStop(0, '#c9cdc9');
  wall.addColorStop(1, '#9ea29e');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H * 0.62);
  const floor = g.createLinearGradient(0, H * 0.62, 0, H);
  floor.addColorStop(0, '#5d625f');
  floor.addColorStop(1, '#3b3f3d');
  g.fillStyle = floor;
  g.fillRect(0, H * 0.62, W, H * 0.38);
  // ceiling light glow
  for (let i = 0; i < 4; i++) {
    const x = W * (0.15 + i * 0.24);
    const rg = g.createRadialGradient(x, 0, 0, x, 0, W * 0.25);
    rg.addColorStop(0, 'rgba(255,255,250,0.55)');
    rg.addColorStop(1, 'rgba(255,255,250,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H * 0.6);
  }
  // racks
  const rackW = W * 0.13;
  for (let r = 0; r < 6; r++) {
    const x = W * 0.04 + r * (rackW + W * 0.03);
    const y = H * 0.16;
    const rh = H * 0.52;
    g.fillStyle = '#1b1d1e';
    g.fillRect(x, y, rackW, rh);
    for (let s = 0; s < 4; s++) {
      const sy = y + 12 + s * (rh / 4);
      g.fillStyle = '#2a2d2f';
      g.fillRect(x + 6, sy, rackW - 12, rh / 4 - 18);
      // device (white LabSim) + dark screen
      g.fillStyle = '#e9ebe8';
      g.fillRect(x + rackW * 0.2, sy + 10, rackW * 0.42, rh / 4 - 40);
      g.fillStyle = '#0d2a4a';
      g.fillRect(x + rackW * 0.24, sy + 16, rackW * 0.34, rh / 4 - 58);
      // tablet
      g.fillStyle = s === 1 && r === 2 ? '#d8a40a' : '#1f6b2c';
      g.fillRect(x + rackW * 0.68, sy + 14, rackW * 0.24, rh / 4 - 52);
      // LEDs
      for (let l = 0; l < 3; l++) {
        g.fillStyle = l === 0 ? '#ff4b3f' : '#58e23a';
        g.shadowColor = g.fillStyle;
        g.shadowBlur = 8;
        g.beginPath();
        g.arc(x + 12 + l * 7, sy + rh / 4 - 26, 1.8, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }
    }
    // gantry rail
    g.fillStyle = '#b9bec2';
    g.fillRect(x - 2, y - 6, rackW + 4, 5);
  }
  // green LED strip
  g.fillStyle = 'rgba(80, 230, 60, 0.9)';
  g.shadowColor = '#4fe032';
  g.shadowBlur = 14;
  g.fillRect(0, H * 0.155, W, 2);
  g.shadowBlur = 0;
}

/**
 * `?live=1`: drive the real sim + mission runtime like `core/game.ts` will (sim.tick → missions.tick
 * while unpaused, missions.frame every frame) so lessons/shifts can be played through in the sandbox.
 */
function startLiveLoop(): void {
  try {
    missions.init();
  } catch (err) {
    console.warn('[sandbox] missions.init failed', err);
  }
  let last = performance.now();
  const step = (now: number) => {
    const dtS = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = store.getState();
    const paused = PAUSING_OVERLAY_KINDS.has(s.ui.overlay.kind) || s.ui.loading !== null;
    try {
      if (!paused && s.session.mode !== 'menu') {
        const dtGameMs = dtS * 1000 * s.lab.time.timeScale;
        sim.tick(dtGameMs);
        missions.tick(dtGameMs);
      }
      missions.frame(dtS);
    } catch (err) {
      console.warn('[sandbox] tick failed', err);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function boot(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  paintLab(canvas);
  window.addEventListener('resize', () => paintLab(canvas));
  const params = new URLSearchParams(location.search);
  const scene = (params.get('scene') as SceneId) || 'menu';
  applyScene(SCENES.includes(scene) ? scene : 'menu');
  (window as unknown as { __labsim: unknown }).__labsim = { store, bus, applyScene };
  createRoot(document.getElementById('ui-root')!).render(<App />);
  if (params.get('live') === '1') startLiveLoop();
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== '[' && e.key !== ']')) return;
    const cur = (new URLSearchParams(location.search).get('scene') as SceneId) || 'menu';
    const i = SCENES.indexOf(cur);
    const next = SCENES[(i + (e.key === ']' ? 1 : SCENES.length - 1)) % SCENES.length]!;
    history.replaceState(null, '', `?scene=${next}`);
    applyScene(next);
  });
}

boot();
