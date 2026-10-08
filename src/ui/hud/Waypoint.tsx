/**
 * Objective waypoint (GP §6.2 / `ui.marker`): a diamond over the current objective's target with the
 * distance, clamped to the screen edge with an arrow when it is off-screen or behind the player. New
 * players are told "Walk to Touch Rack A" — this shows them where that is.
 *
 * Positions come from the world placement contract (`@/world/layout`, pure data): location anchors,
 * prop placements, rig bay parts and racks. Hidden in Strict realism, with Guidance off, when the target
 * is close (the crosshair highlight takes over) and when nothing resolves.
 * The DOM is updated from a rAF loop (no React re-render per frame).
 */
import { useEffect, useRef } from 'react';
import { useGame } from '@/core/store';
import { engine } from '@/engine';
import { markerWorldPos } from './waypointPos';
import { Icon } from '@/ui/kit';

/** Within this distance (m) the waypoint fades out: the interaction highlight is enough. */
const NEAR_M = 1.6;
const EDGE = 56;

export function Waypoint() {
  const marker = useGame((s) => {
    if (s.session.realism === 'strict' || s.progress.settings.guidance === 'off') return null;
    if (s.session.dialogue) return null;
    return s.session.objectives.find((o) => !o.done && o.marker)?.marker ?? null;
  });
  const markerKey = marker ? `${marker.kind}:${marker.id}` : null;
  const elRef = useRef<HTMLDivElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!marker) return;
    const pos = markerWorldPos(marker);
    const el = elRef.current;
    if (!pos || !el) {
      if (el) el.style.opacity = '0';
      return;
    }
    let raf = 0;
    let lastText = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cam = engine.camera;
      const w = window.innerWidth;
      const h = window.innerHeight;
      // world → camera → clip (column-major matrices)
      const v = cam.matrixWorldInverse.elements;
      const pr = cam.projectionMatrix.elements;
      const x = pos[0], y = pos[1], z = pos[2];
      const cx = v[0]! * x + v[4]! * y + v[8]! * z + v[12]!;
      const cy = v[1]! * x + v[5]! * y + v[9]! * z + v[13]!;
      const cz = v[2]! * x + v[6]! * y + v[10]! * z + v[14]!;
      const clipX = pr[0]! * cx + pr[4]! * cy + pr[8]! * cz + pr[12]!;
      const clipY = pr[1]! * cx + pr[5]! * cy + pr[9]! * cz + pr[13]!;
      const clipW = pr[3]! * cx + pr[7]! * cy + pr[11]! * cz + pr[15]!;
      const dx = x - cam.position.x;
      const dz = z - cam.position.z;
      const dist = Math.hypot(dx, dz);
      let sx = w / 2;
      let sy = h / 2;
      let off: boolean;
      if (clipW > 0.05) {
        sx = ((clipX / clipW) * 0.5 + 0.5) * w;
        sy = (-(clipY / clipW) * 0.5 + 0.5) * h;
        off = sx < EDGE || sx > w - EDGE || sy < EDGE || sy > h - EDGE;
      } else off = true;
      if (off) {
        // Clamp to the screen edge along the direction from the centre (behind the camera: turn left / right).
        let ax = sx - w / 2;
        let ay = sy - h / 2;
        if (clipW <= 0.05) {
          ax = cx >= 0 ? 1 : -1;
          ay = 0;
        }
        const k = Math.min((w / 2 - EDGE) / Math.max(1e-6, Math.abs(ax)), (h / 2 - EDGE) / Math.max(1e-6, Math.abs(ay)));
        sx = w / 2 + ax * k;
        sy = h / 2 + ay * k;
      }
      const fade = dist < NEAR_M ? Math.max(0, (dist - NEAR_M * 0.6) / (NEAR_M * 0.4)) : 1;
      el.style.opacity = String(fade);
      el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      el.classList.toggle('is-off', off);
      const arrow = arrowRef.current;
      if (arrow) arrow.style.transform = `rotate(${Math.atan2(sy - h / 2, sx - w / 2).toFixed(3)}rad)`;
      const text = `${dist < 10 ? dist.toFixed(1) : Math.round(dist)} m`;
      if (distRef.current && text !== lastText) {
        lastText = text;
        distRef.current.textContent = text;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [markerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!marker) return null;
  return (
    <div className="hud-waypoint" ref={elRef} style={{ opacity: 0 }} aria-hidden>
      <div className="hud-waypoint__arrow" ref={arrowRef}>
        <Icon name="chevron-right" size={16} stroke={2.6} />
      </div>
      <div className="hud-waypoint__diamond" />
      <span className="hud-waypoint__dist tnum" ref={distRef} />
    </div>
  );
}
