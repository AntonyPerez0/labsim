/**
 * Game bootstrap: wires the store, the simulation, the engine, the world and the mission runtime
 * together and runs the main loop.
 *
 * Weak-hardware handling (Settings → Graphics):
 *  - first boot with "Auto-detect quality" on: the hardware probe (`@/engine/autoQuality`) picks a
 *    ceiling preset BEFORE the lab is built (potato builds half-resolution atlases and skips
 *    clutter), then the first seconds in the lab are timed and the preset steps down while frames
 *    stay slow. `progress.flags.qualityDetected` makes the probe run once per profile.
 *  - during play: if frames stay slow (> 50 ms) for ~10 s with dynamic resolution already at its
 *    floor, drop one preset (auto-detect on) or suggest it once (auto-detect off).
 *  - detection only ever LOWERS the preset; the player's choice is never raised.
 *  - frame-rate cap: `settings.frameRateCap`, or the preset default (potato: 30 fps).
 */
import { store, mutate } from './store';
import { GameLoop } from './loop';
import { loadProgress, saveProgress } from './persistence';
import { sim } from '@/sim';
import { engine } from '@/engine';
import { buildWorld } from '@/world';
import { missions } from '@/missions';
import { PAUSING_OVERLAY_KINDS, type QualityPreset } from './state';
import { effectiveFrameCap, isCheaperPreset, lowerPreset } from '@/engine/quality';
import { FrameTimeWatch, presetForHardware, probeHardware } from '@/engine/autoQuality';

let loop: GameLoop | null = null;

/** Resolve after the browser had a chance to paint (falls back to a timer in background tabs). */
function nextPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 150);
  });
}

export function isSimPaused(): boolean {
  const s = store.getState();
  return PAUSING_OVERLAY_KINDS.has(s.ui.overlay.kind) || s.ui.loading !== null;
}

const PRESET_LABEL: Record<QualityPreset, string> = { potato: 'Potato', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };

let toastSeq = 0;
/** Core may not import the UI layer: write the toast record directly (same shape as `pushToast`). */
function notify(title: string, body: string, kind: 'info' | 'warning' = 'info'): void {
  mutate((s) => {
    s.ui.toasts.push({ id: `quality-${++toastSeq}`, kind, title, body, createdAtMs: s.lab.time.nowMs });
  });
}

function setPreset(q: QualityPreset): void {
  mutate((s) => {
    s.progress.settings.quality = q;
  });
}

export async function bootGame(canvas: HTMLCanvasElement): Promise<void> {
  const progress = loadProgress();
  mutate((s) => {
    s.progress = progress;
    s.ui.loading = { progress: 0.03, label: 'Starting renderer…' };
  });

  // Known preset: start fetching its pipeline (post-fx chunk) now. On a first boot the hardware
  // probe below decides first, so a phone or software-GL machine never loads post-processing.
  const detect = progress.settings.autoQuality !== false && !progress.flags.qualityDetected;
  const saved = progress.settings.quality;
  if (!detect) engine.preload(saved);

  // Let React paint the loading screen before the (synchronous, heavy) renderer start-up.
  await nextPaint();
  await engine.init(canvas);

  // First boot: probe the hardware (incl. the WebGL renderer string) before anything is built.
  let detected: QualityPreset | null = null;
  if (detect) {
    const hw = probeHardware(engine.renderer);
    const pick = presetForHardware(hw);
    console.info('[quality] auto-detect:', pick.preset, pick.reasons.length ? pick.reasons.join('; ') : '(no limits found)');
    mutate((s) => {
      s.progress.flags.qualityDetected = true;
      if (isCheaperPreset(pick.preset, s.progress.settings.quality)) s.progress.settings.quality = pick.preset;
    });
    if (isCheaperPreset(pick.preset, saved)) detected = pick.preset;
  }
  const settings = store.getState().progress.settings;
  engine.setQuality(settings.quality, settings.resolutionScale);
  engine.setFov(settings.fov);

  mutate((s) => {
    s.ui.loading = { progress: 0.08, label: 'Building the lab…' };
  });
  await buildWorld(engine, (p, label) =>
    mutate((s) => {
      s.ui.loading = { progress: 0.08 + p * 0.87, label };
    }),
  );
  mutate((s) => {
    s.ui.loading = { progress: 0.96, label: 'Compiling shaders…' };
  });
  await engine.pipelineReady();
  await nextPaint();
  await engine.warmup();

  missions.init();
  const watch = new QualityWatch(detect);

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
    if (a.quality !== b.quality || a.resolutionScale !== b.resolutionScale) {
      engine.setQuality(a.quality, a.resolutionScale);
      watch.onQualityChanged();
    }
    if (a.fov !== b.fov) engine.setFov(a.fov);
    if (a.masterVolume !== b.masterVolume || a.sfxVolume !== b.sfxVolume || a.ambienceVolume !== b.ambienceVolume) {
      engine.audio.setVolumes({ master: a.masterVolume, sfx: a.sfxVolume, ambience: a.ambienceVolume, ui: a.sfxVolume });
    }
  });

  loop = new GameLoop({
    simulate: (dt) => sim.tick(dt),
    render: (dt) => {
      engine.frame(dt);
      watch.tick();
    },
    timeScale: () => store.getState().lab.time.timeScale,
    paused: isSimPaused,
    minFrameMs: () => {
      const st = store.getState().progress.settings;
      const cap = effectiveFrameCap(st.frameRateCap, st.quality);
      return cap > 0 ? 1000 / cap : 0;
    },
  });
  loop.start();

  mutate((s) => {
    s.ui.loading = null;
  });
  if (detected) {
    notify(`Graphics set to ${PRESET_LABEL[detected]} for this device`, 'Change it any time in Settings → Graphics.');
  }
}

/**
 * Frame-time judge, sampled once per second while the player is actually in the lab (no overlay,
 * no camera focus): the post-detection probe (first boot) and the sustained-slowness guard.
 */
class QualityWatch {
  private lastAt = 0;
  /** First-boot probe: mean > 45 ms for 3 s after a 3 s warm-up → step down (repeats down to potato). */
  private readonly probe = new FrameTimeWatch(45, 3, 3);
  private probeOkWindows = 0;
  /** Sustained: mean > 50 ms for 10 s with dynamic resolution at its floor. */
  private readonly sustained = new FrameTimeWatch(50, 10, 3);
  private suggested = false;

  constructor(private probing: boolean) {}

  onQualityChanged(): void {
    this.probe.reset();
    this.sustained.reset();
  }

  tick(): void {
    const now = performance.now();
    if (now - this.lastAt < 1000) return;
    this.lastAt = now;
    const s = store.getState();
    if (s.ui.overlay.kind !== 'none' || s.ui.loading !== null || engine.isFocused()) {
      // Menus/overlays throttle the 3D view: their frame times say nothing about the lab.
      this.probe.reset();
      this.sustained.reset();
      return;
    }
    const st = engine.stats();
    const settings = s.progress.settings;
    const q = settings.quality;
    if (this.probing) {
      const r = this.probe.sample(st.frameMsAvg);
      if (r === 'slow' && q !== 'potato') {
        const next = lowerPreset(q);
        console.info(`[quality] frames slow in the lab (${st.frameMsAvg} ms) → ${next}`);
        setPreset(next);
        notify(`Graphics set to ${PRESET_LABEL[next]} for this device`, 'Frames were slow at the previous setting. Change it any time in Settings → Graphics.');
        return;
      }
      if (r === 'ok' && ++this.probeOkWindows >= 5) this.probing = false;
      if (q === 'potato') this.probing = false;
      return;
    }
    const drsFloor = settings.dynamicResolution === false || st.renderScale <= 0.62;
    if (this.sustained.sample(st.frameMsAvg, drsFloor) !== 'slow' || q === 'potato') return;
    if (settings.autoQuality !== false) {
      const next = lowerPreset(q);
      console.info(`[quality] sustained slow frames (${st.frameMsAvg} ms) → ${next}`);
      setPreset(next);
      notify(`Graphics lowered to ${PRESET_LABEL[next]}`, 'Frames stayed slow for a while. Change it any time in Settings → Graphics.');
    } else if (!this.suggested) {
      this.suggested = true;
      notify('Frames are running slow', `Try Graphics → ${PRESET_LABEL[lowerPreset(q)]} in Settings (or turn on Auto-detect quality).`, 'warning');
    }
  }
}

/** Synchronously advance game time (debug / tests / "skip ahead" buttons). */
export function advanceGameTime(ms: number): void {
  if (loop) loop.advance(ms);
  else sim.tick(ms);
}

export function currentFps(): number {
  return loop?.fps ?? 0;
}
