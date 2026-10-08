/** Image lightbox (Apps §9.2): wheel zooms at the cursor, drag pans, double-click resets, Esc/click outside closes. */
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { OI } from './icons';

export function Lightbox(props: { src: string; onClose(): void }) {
  const [z, setZ] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => root.current?.focus(), []);

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - r.left - r.width / 2;
    const cy = e.clientY - r.top - r.height / 2;
    const nz = Math.min(12, Math.max(0.25, z * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    const k = nz / z;
    setPan({ x: cx - (cx - pan.x) * k, y: cy - (cy - pan.y) * k });
    setZ(nz);
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setPan({ x: d.px + dx, y: d.py + dy });
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && e.target === e.currentTarget) props.onClose();
  };

  return (
    <div
      className="oll-lightbox"
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          props.onClose();
        } else if (e.key === '+' || e.key === '=') setZ((v) => Math.min(12, v * 1.2));
        else if (e.key === '-') setZ((v) => Math.max(0.25, v / 1.2));
        else if (e.key === '0') {
          setZ(1);
          setPan({ x: 0, y: 0 });
        }
      }}
    >
      <div className="oll-lb-stage" onWheel={onWheel} onPointerDown={down} onPointerMove={move} onPointerUp={up} onDoubleClick={() => (setZ(1), setPan({ x: 0, y: 0 }))}>
        <img
          src={props.src}
          alt="Attachment"
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${z})`, imageRendering: z > 2 ? 'pixelated' : undefined }}
        />
      </div>
      <div className="oll-lb-bar">
        <span>{Math.round(z * 100)}%</span>
        <button type="button" className="oll-icon-btn" aria-label="Close" title="Close (Esc)" onClick={props.onClose}>
          <OI name="x" />
        </button>
      </div>
    </div>
  );
}
