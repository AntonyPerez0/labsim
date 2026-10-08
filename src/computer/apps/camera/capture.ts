/**
 * Capture budget (Apps §8.4): one requestAnimationFrame loop for the whole Camera app; at most one frame
 * render per animation frame (round-robin across visible players and wall tiles), each at its own fps.
 * Paused while the page is hidden; jobs report `active()` false when their window is minimised.
 */
import { useEffect, useRef } from 'react';
import { getState } from '@/core/store';

interface Job {
  fps: number;
  last: number;
  draw(): void;
  active(): boolean;
}

const jobs = new Set<Job>();
let raf = 0;
let rr = 0;

function loop(t: number): void {
  raf = requestAnimationFrame(loop);
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const list = [...jobs].filter((j) => j.active());
  if (!list.length) return;
  for (let k = 0; k < list.length; k++) {
    const i = (rr + k) % list.length;
    const j = list[i]!;
    if (t - j.last >= 1000 / j.fps) {
      j.last = t;
      try {
        j.draw();
      } catch (err) {
        console.warn('[camera] frame draw failed', err);
      }
      rr = i + 1;
      break;
    }
  }
}

function ensureLoop(): void {
  if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(loop);
}

function stopLoopIfIdle(): void {
  if (!jobs.size && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

/** Quality preset → player resolution and fps (Apps §8.4). */
export function captureProfile(): { w: number; h: number; fps: number } {
  const q = getState().progress?.settings?.quality ?? 'high';
  if (q === 'low') return { w: 640, h: 360, fps: 2 };
  if (q === 'medium') return { w: 960, h: 540, fps: 5 };
  return { w: 1280, h: 720, fps: 10 };
}

/** Register a draw job while mounted. `draw` and `active` may change between renders. */
export function useCaptureJob(draw: () => void, fps: number, active: boolean): void {
  const drawRef = useRef(draw);
  const activeRef = useRef(active);
  drawRef.current = draw;
  activeRef.current = active;
  useEffect(() => {
    const job: Job = { fps, last: -Infinity, draw: () => drawRef.current(), active: () => activeRef.current };
    jobs.add(job);
    ensureLoop();
    return () => {
      jobs.delete(job);
      stopLoopIfIdle();
    };
  }, [fps]);
}
