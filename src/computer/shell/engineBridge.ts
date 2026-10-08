/**
 * Lazy access to the engine services the computer may use (Apps §0.2): `releaseFocus()` (Stand up),
 * `audio.play()` (UI sounds) and `captureView()` (camera app). The engine module is imported on first
 * use so the desktop (and its unit tests) never pull three.js into their initial chunk.
 */
import type { Engine, SoundId } from '@/engine/types';

let enginePromise: Promise<Engine | null> | null = null;
let engineRef: Engine | null = null;

export function getEngine(): Promise<Engine | null> {
  if (engineRef) return Promise.resolve(engineRef);
  if (!enginePromise) {
    enginePromise = import('@/engine')
      .then((m) => {
        engineRef = m.engine;
        return engineRef;
      })
      .catch((err) => {
        console.warn('[computer] engine unavailable', err);
        return null;
      });
  }
  return enginePromise;
}

/** Fire-and-forget UI sound. Never throws. */
export function playSound(id: SoundId, opts?: { volume?: number; bus?: 'sfx' | 'ambience' | 'ui' }): void {
  const run = (e: Engine | null) => {
    try {
      e?.audio?.play(id, { bus: 'ui', ...opts });
    } catch {
      /* audio not ready (autoplay policy, tests) */
    }
  };
  if (engineRef) run(engineRef);
  else void getEngine().then(run);
}

/** Return the camera from the workstation monitors to the player (Stand up fallback). */
export function releaseEngineFocus(): void {
  void getEngine().then((e) => {
    try {
      void e?.releaseFocus();
    } catch {
      /* not attached */
    }
  });
}
