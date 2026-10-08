/**
 * Small FPS counter (Settings → Show FPS), top-right corner.
 */
import { useEffect, useState } from 'react';
import { engine } from '@/engine';

export function FpsCounter() {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      try {
        setFps(Math.round(engine.stats().fps));
      } catch {
        setFps(null);
      }
    }, 500);
    return () => clearInterval(t);
  }, []);
  return <div className={`fps tnum${fps !== null && fps < 30 ? ' is-low' : ''}`}>{fps ?? '—'} fps</div>;
}
