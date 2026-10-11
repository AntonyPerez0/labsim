/**
 * Small FPS counter (Settings → Show FPS), top-right corner. Shows frames actually drawn in the last
 * second plus the worst frame time in that second — a 100 fps average with a 90 ms worst frame
 * still feels like stutter, and this makes that visible. A render scale below 100% means dynamic
 * resolution is holding the frame rate.
 */
import { useEffect, useState } from 'react';
import { engine } from '@/engine';

interface Readout {
  fps: number;
  worst: number;
  scale: number;
}

export function FpsCounter() {
  const [r, setR] = useState<Readout | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      try {
        const st = engine.stats();
        setR({ fps: Math.round(st.fps), worst: Math.round(st.frameMsMax), scale: st.renderScale });
      } catch {
        setR(null);
      }
    }, 500);
    return () => clearInterval(t);
  }, []);
  const low = !!r && (r.fps < 30 || r.worst > 50);
  return (
    <div className={`fps tnum${low ? ' is-low' : ''}`}>
      {r ? `${r.fps} fps · worst ${r.worst} ms${r.scale < 0.99 ? ` · ${Math.round(r.scale * 100)}% res` : ''}` : '— fps'}
    </div>
  );
}
