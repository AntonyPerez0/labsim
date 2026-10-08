/**
 * Game bootstrap: wires the store, the simulation, the engine, the world and the mission runtime
 * together and runs the main loop.
 */
import { store, mutate } from './store';
import { GameLoop } from './loop';
import { loadProgress, saveProgress } from './persistence';
import { sim } from '@/sim';
import { engine } from '@/engine';
import { buildWorld } from '@/world';
import { missions } from '@/missions';
import { PAUSING_OVERLAY_KINDS } from './state';

let loop: GameLoop | null = null;

export function isSimPaused(): boolean {
  const s = store.getState();
  return PAUSING_OVERLAY_KINDS.has(s.ui.overlay.kind) || s.ui.loading !== null;
}

export async function bootGame(canvas: HTMLCanvasElement): Promise<void> {
  const progress = loadProgress();
  mutate((s) => {
    s.progress = progress;
    s.ui.loading = { progress: 0.05, label: 'Starting renderer…' };
  });

  await engine.init(canvas);
  engine.setQuality(progress.settings.quality, progress.settings.resolutionScale);
  engine.setFov(progress.settings.fov);

  await buildWorld(engine, (p, label) =>
    mutate((s) => {
      s.ui.loading = { progress: 0.1 + p * 0.85, label };
    }),
  );

  missions.init();

  // Persist progress whenever it changes (debounced).
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  store.subscribe((s, prev) => {
    if (s.progress === prev.progress) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveProgress(store.getState().progress), 400);
  });

  // Apply settings changes to the engine.
  store.subscribe((s, prev) => {
    const a = s.progress.settings;
    const b = prev.progress.settings;
    if (a === b) return;
    if (a.quality !== b.quality || a.resolutionScale !== b.resolutionScale) engine.setQuality(a.quality, a.resolutionScale);
    if (a.fov !== b.fov) engine.setFov(a.fov);
    if (a.masterVolume !== b.masterVolume || a.sfxVolume !== b.sfxVolume || a.ambienceVolume !== b.ambienceVolume) {
      engine.audio.setVolumes({ master: a.masterVolume, sfx: a.sfxVolume, ambience: a.ambienceVolume, ui: a.sfxVolume });
    }
  });

  loop = new GameLoop({
    simulate: (dt) => sim.tick(dt),
    render: (dt) => engine.frame(dt),
    timeScale: () => store.getState().lab.time.timeScale,
    paused: isSimPaused,
  });
  loop.start();

  mutate((s) => {
    s.ui.loading = null;
  });
}

/** Synchronously advance game time (debug / tests / "skip ahead" buttons). */
export function advanceGameTime(ms: number): void {
  if (loop) loop.advance(ms);
  else sim.tick(ms);
}

export function currentFps(): number {
  return loop?.fps ?? 0;
}
