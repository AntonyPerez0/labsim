/**
 * GIMP image canvas (Apps §6.3–§6.4): rulers, zoom/pan, rectangle selection with marching ants and handles,
 * Move (pan), Zoom, Measure and Color Picker tools. Purely a view: the parent owns selection/zoom state.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent } from 'react';
import { clampSel, hitHandle, moveSel, resizeSel, zoomIn, zoomOut, type Handle, type Sel, type Tool } from './model';

export interface View {
  zoom: number;
  /** Image point at the viewport centre. */
  cx: number;
  cy: number;
}

export interface CanvasProps {
  src: string;
  width: number;
  height: number;
  tool: Tool;
  view: View;
  setView(v: View): void;
  sel: Sel | null;
  onSelCommit(s: Sel | null): void;
  onPointer(p: { x: number; y: number } | null): void;
  onMessage(m: string | null): void;
  onMeasure(m: { dx: number; dy: number } | null): void;
  onPick(rgb: [number, number, number]): void;
  onContextMenu(x: number, y: number): void;
  spaceDown: boolean;
  /** Bumped by the parent to force a fit-to-window. */
  fitKey: number;
  /** Zoom tool option "Zoom out" (Ctrl inverts). */
  zoomOutDefault?: boolean;
}

const RULER = 18;

type Drag =
  | { mode: 'new'; ax: number; ay: number; moved: boolean }
  | { mode: 'move'; sx: number; sy: number; start: Sel; moved: boolean }
  | { mode: 'resize'; h: Handle; sx: number; sy: number; start: Sel }
  | { mode: 'pan'; mx: number; my: number; start: View }
  | { mode: 'measure'; ax: number; ay: number }
  | { mode: 'zoom'; mx: number; my: number; ax: number; ay: number; moved: boolean; out: boolean };

function niceStep(zoom: number): number {
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];
  return steps.find((s) => s * zoom >= 50) ?? 5000;
}

export function GimpCanvas(props: CanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const hrRef = useRef<HTMLCanvasElement>(null);
  const vrRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const sampleRef = useRef<CanvasRenderingContext2D | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [loaded, setLoaded] = useState(0);
  const [live, setLiveState] = useState<Sel | null>(null);
  // Mirror in a ref: a mouseup may arrive before React re-renders after the last mousemove.
  const liveRef = useRef<Sel | null>(null);
  const setLive = (s: Sel | null) => {
    liveRef.current = s;
    setLiveState(s);
  };
  const [measure, setMeasure] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);
  const [hover, setHover] = useState<Handle | 'inside' | null>(null);
  const [pointer, setPointer] = useState<{ sx: number; sy: number } | null>(null);
  const [zoomRect, setZoomRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ants, setAnts] = useState(0);
  const drag = useRef<Drag | null>(null);
  const { view, setView } = props;

  // image element + sampler
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx?.drawImage(img, 0, 0);
        sampleRef.current = cx;
      } catch {
        sampleRef.current = null;
      }
      setLoaded((n) => n + 1);
    };
    img.src = props.src;
  }, [props.src]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(50, el.clientWidth - RULER), h: Math.max(50, el.clientHeight - RULER) }));
    ro.observe(el);
    setSize({ w: Math.max(50, el.clientWidth - RULER), h: Math.max(50, el.clientHeight - RULER) });
    return () => ro.disconnect();
  }, []);

  // initial / requested fit
  const fitDone = useRef(-1);
  useEffect(() => {
    if (fitDone.current === props.fitKey || size.w < 60) return;
    fitDone.current = props.fitKey;
    const fit = Math.min(size.w / props.width, size.h / props.height) * 0.96;
    if (props.fitKey === 0 && fit >= 1) setView({ zoom: 1, cx: props.width / 2, cy: props.height / 2 });
    else setView({ zoom: Math.max(0.0625, Math.min(32, fit)), cx: props.width / 2, cy: props.height / 2 });
  }, [props.fitKey, size, props.width, props.height, setView]);

  // marching ants
  const sel = live ?? props.sel;
  useEffect(() => {
    if (!sel) return;
    const t = window.setInterval(() => setAnts((a) => (a + 1) % 8), 150);
    return () => window.clearInterval(t);
  }, [!!sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const ox = size.w / 2 - view.cx * view.zoom;
  const oy = size.h / 2 - view.cy * view.zoom;
  const toImg = (sx: number, sy: number) => ({ x: (sx - ox) / view.zoom, y: (sy - oy) / view.zoom });
  const toScr = (ix: number, iy: number) => ({ x: ox + ix * view.zoom, y: oy + iy * view.zoom });

  // draw
  useEffect(() => {
    const c = cvRef.current;
    if (!c) return;
    const dpr = 1;
    if (c.width !== size.w * dpr) c.width = size.w * dpr;
    if (c.height !== size.h * dpr) c.height = size.h * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2f2f2f';
    ctx.fillRect(0, 0, size.w, size.h);
    const img = imgRef.current;
    if (img) {
      ctx.imageSmoothingEnabled = view.zoom < 2;
      ctx.drawImage(img, ox, oy, props.width * view.zoom, props.height * view.zoom);
    }
    // image boundary (layer boundary: yellow/black dashes)
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(Math.round(ox) - 0.5, Math.round(oy) - 0.5, Math.round(props.width * view.zoom) + 1, Math.round(props.height * view.zoom) + 1);
    ctx.lineDashOffset = 4;
    ctx.strokeStyle = '#e8d34a';
    ctx.strokeRect(Math.round(ox) - 0.5, Math.round(oy) - 0.5, Math.round(props.width * view.zoom) + 1, Math.round(props.height * view.zoom) + 1);
    ctx.restore();
    if (sel && sel.w > 0 && sel.h > 0) {
      const a = toScr(sel.x, sel.y);
      const w = sel.w * view.zoom;
      const h = sel.h * view.zoom;
      const x = Math.round(a.x) + 0.5;
      const y = Math.round(a.y) + 0.5;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#fff';
      ctx.lineDashOffset = -ants;
      ctx.strokeRect(x, y, Math.round(w), Math.round(h));
      ctx.strokeStyle = '#000';
      ctx.lineDashOffset = -ants + 4;
      ctx.strokeRect(x, y, Math.round(w), Math.round(h));
      ctx.restore();
      if (props.tool === 'rect' && (hover || live)) {
        const hs = Math.min(Math.max(10, 16), w / 3, h / 3);
        ctx.fillStyle = '#ffffff30';
        const zones: Record<string, [number, number, number, number]> = {
          nw: [x, y, hs, hs],
          ne: [x + w - hs, y, hs, hs],
          sw: [x, y + h - hs, hs, hs],
          se: [x + w - hs, y + h - hs, hs, hs],
          n: [x + hs, y, w - 2 * hs, hs],
          s: [x + hs, y + h - hs, w - 2 * hs, hs],
          w: [x, y + hs, hs, h - 2 * hs],
          e: [x + w - hs, y + hs, hs, h - 2 * hs],
        };
        if (hover && hover !== 'inside') {
          const z = zones[hover];
          if (z) ctx.fillRect(...z);
        }
        ctx.strokeStyle = '#ffffff80';
        ctx.setLineDash([]);
        for (const k of ['nw', 'ne', 'sw', 'se'] as const) ctx.strokeRect(...zones[k]!);
      }
    }
    if (measure) {
      const a = toScr(measure.ax, measure.ay);
      const b = toScr(measure.bx, measure.by);
      ctx.save();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      for (const p of [a, b]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (zoomRect) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(zoomRect.x + 0.5, zoomRect.y + 0.5, zoomRect.w, zoomRect.h);
      ctx.restore();
    }
    drawRulers(hrRef.current, vrRef.current, size, ox, oy, view.zoom, pointer);
  });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = cvRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const onDown = (e: RMouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    const { sx, sy } = local(e);
    const p = toImg(sx, sy);
    (e.currentTarget as HTMLCanvasElement).focus();
    if (e.button === 1 || props.spaceDown || props.tool === 'move') {
      e.preventDefault();
      drag.current = { mode: 'pan', mx: e.clientX, my: e.clientY, start: view };
      return;
    }
    if (props.tool === 'zoom') {
      drag.current = { mode: 'zoom', mx: sx, my: sy, ax: p.x, ay: p.y, moved: false, out: (e.ctrlKey || e.metaKey) !== !!props.zoomOutDefault };
      return;
    }
    if (props.tool === 'measure') {
      drag.current = { mode: 'measure', ax: p.x, ay: p.y };
      setMeasure({ ax: p.x, ay: p.y, bx: p.x, by: p.y });
      return;
    }
    if (props.tool === 'picker') {
      const ix = Math.floor(p.x);
      const iy = Math.floor(p.y);
      if (ix >= 0 && iy >= 0 && ix < props.width && iy < props.height && sampleRef.current) {
        const d = sampleRef.current.getImageData(ix, iy, 1, 1).data;
        props.onPick([d[0]!, d[1]!, d[2]!]);
      }
      return;
    }
    if (props.tool !== 'rect') {
      props.onMessage('This tool is not available in GIMP-lite');
      return;
    }
    const s = props.sel;
    const hh = s ? hitHandle(s, p.x, p.y, 16 / view.zoom) : null;
    if (s && hh && hh !== 'inside') drag.current = { mode: 'resize', h: hh, sx: p.x, sy: p.y, start: s };
    else if (s && (hh === 'inside' || e.altKey)) drag.current = { mode: 'move', sx: p.x, sy: p.y, start: s, moved: false };
    else drag.current = { mode: 'new', ax: Math.max(0, Math.min(props.width, Math.round(p.x))), ay: Math.max(0, Math.min(props.height, Math.round(p.y))), moved: false };
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      const c = cvRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const p = { x: (sx - ox) / view.zoom, y: (sy - oy) / view.zoom };
      const inside = sx >= 0 && sy >= 0 && sx < size.w && sy < size.h;
      if (inside || d) {
        setPointer({ sx, sy });
        const onImg = p.x >= 0 && p.y >= 0 && p.x < props.width && p.y < props.height;
        props.onPointer(onImg ? { x: Math.floor(p.x), y: Math.floor(p.y) } : null);
      } else {
        setPointer(null);
        props.onPointer(null);
      }
      if (!d) {
        if (props.tool === 'rect' && props.sel && inside) setHover(hitHandle(props.sel, p.x, p.y, 16 / view.zoom));
        return;
      }
      switch (d.mode) {
        case 'pan':
          setView({ zoom: d.start.zoom, cx: d.start.cx - (e.clientX - d.mx) / view.zoom, cy: d.start.cy - (e.clientY - d.my) / view.zoom });
          break;
        case 'new': {
          const bx = Math.round(p.x);
          const by = Math.round(p.y);
          if (Math.abs(bx - d.ax) + Math.abs(by - d.ay) > 0) d.moved = true;
          setLive(clampSel({ x: d.ax, y: d.ay, w: bx - d.ax, h: by - d.ay }, props.width, props.height));
          break;
        }
        case 'move':
          d.moved = true;
          setLive(moveSel(d.start, p.x - d.sx, p.y - d.sy, props.width, props.height));
          break;
        case 'resize':
          setLive(resizeSel(d.start, d.h, Math.round(p.x - d.sx), Math.round(p.y - d.sy), props.width, props.height));
          break;
        case 'measure': {
          setMeasure({ ax: d.ax, ay: d.ay, bx: p.x, by: p.y });
          props.onMeasure({ dx: p.x - d.ax, dy: p.y - d.ay });
          break;
        }
        case 'zoom':
          if (Math.abs(sx - d.mx) + Math.abs(sy - d.my) > 4) d.moved = true;
          setZoomRect({ x: Math.min(sx, d.mx), y: Math.min(sy, d.my), w: Math.abs(sx - d.mx), h: Math.abs(sy - d.my) });
          break;
      }
    };
    const up = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      const c = cvRef.current;
      const r = c?.getBoundingClientRect();
      const sx = r ? e.clientX - r.left : 0;
      const sy = r ? e.clientY - r.top : 0;
      if (d.mode === 'new') {
        const s = liveRef.current;
        setLive(null);
        props.onSelCommit(d.moved && s && s.w > 0 && s.h > 0 ? s : null);
      } else if (d.mode === 'move') {
        const s = liveRef.current;
        setLive(null);
        props.onSelCommit(d.moved && s ? s : null);
      } else if (d.mode === 'resize') {
        const s = liveRef.current;
        setLive(null);
        if (s) props.onSelCommit(s.w > 0 && s.h > 0 ? s : null);
      } else if (d.mode === 'zoom') {
        setZoomRect(null);
        if (d.moved) {
          const a = { x: (Math.min(sx, d.mx) - ox) / view.zoom, y: (Math.min(sy, d.my) - oy) / view.zoom };
          const w = Math.abs(sx - d.mx) / view.zoom;
          const h = Math.abs(sy - d.my) / view.zoom;
          const z = Math.min(32, Math.min(size.w / Math.max(1, w), size.h / Math.max(1, h)));
          setView({ zoom: z, cx: a.x + w / 2, cy: a.y + h / 2 });
        } else {
          const z = d.out ? zoomOut(view.zoom) : zoomIn(view.zoom);
          setView({ zoom: z, cx: d.ax - (sx - size.w / 2) / z, cy: d.ay - (sy - size.h / 2) / z });
        }
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  });

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const { sx, sy } = local(e);
    if (e.ctrlKey || e.metaKey) {
      const p = toImg(sx, sy);
      const z = e.deltaY < 0 ? zoomIn(view.zoom) : zoomOut(view.zoom);
      setView({ zoom: z, cx: p.x - (sx - size.w / 2) / z, cy: p.y - (sy - size.h / 2) / z });
      return;
    }
    const dx = e.shiftKey ? e.deltaY : e.deltaX;
    const dy = e.shiftKey ? 0 : e.deltaY;
    setView({ zoom: view.zoom, cx: view.cx + dx / view.zoom, cy: view.cy + dy / view.zoom });
  };

  const cursor = props.spaceDown || props.tool === 'move' ? (drag.current?.mode === 'pan' ? 'grabbing' : 'grab') : props.tool === 'zoom' ? 'zoom-in' : props.tool === 'rect' ? (hover === 'inside' ? 'move' : hover === 'n' || hover === 's' ? 'ns-resize' : hover === 'e' || hover === 'w' ? 'ew-resize' : hover === 'nw' || hover === 'se' ? 'nwse-resize' : hover === 'ne' || hover === 'sw' ? 'nesw-resize' : 'crosshair') : 'crosshair';
  void loaded;
  return (
    <div className="gimp-canvas-wrap" ref={wrapRef}>
      <div className="gimp-ruler-corner" />
      <canvas className="gimp-ruler-h" ref={hrRef} width={size.w} height={RULER} />
      <canvas className="gimp-ruler-v" ref={vrRef} width={RULER} height={size.h} />
      <canvas
        className="gimp-canvas"
        ref={cvRef}
        tabIndex={0}
        style={{ cursor, width: size.w, height: size.h }}
        onMouseDown={onDown}
        onWheel={onWheel}
        onMouseLeave={() => {
          if (!drag.current) {
            setPointer(null);
            props.onPointer(null);
            setHover(null);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          props.onContextMenu(e.clientX, e.clientY);
        }}
        aria-label="Image canvas"
      />
    </div>
  );
}

function drawRulers(h: HTMLCanvasElement | null, v: HTMLCanvasElement | null, size: { w: number; h: number }, ox: number, oy: number, zoom: number, pointer: { sx: number; sy: number } | null) {
  const step = niceStep(zoom);
  const draw = (c: HTMLCanvasElement | null, len: number, origin: number, horizontal: boolean, mark: number | null) => {
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (horizontal) {
      if (c.width !== len) c.width = len;
    } else if (c.height !== len) c.height = len;
    ctx.fillStyle = '#454545';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#9a9a9a';
    ctx.fillStyle = '#c8c8c8';
    ctx.font = '9px "Segoe UI", system-ui, sans-serif';
    ctx.lineWidth = 1;
    const first = Math.floor(-origin / zoom / step) * step;
    for (let i = first; ; i += step / 5) {
      const p = origin + i * zoom;
      if (p > len) break;
      if (p < 0) continue;
      const major = Math.abs(i % step) < 1e-6;
      const t = major ? 18 : Math.abs(i % (step / 2)) < 1e-6 ? 8 : 4;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(Math.round(p) + 0.5, 18);
        ctx.lineTo(Math.round(p) + 0.5, 18 - t);
      } else {
        ctx.moveTo(18, Math.round(p) + 0.5);
        ctx.lineTo(18 - t, Math.round(p) + 0.5);
      }
      ctx.stroke();
      if (major) {
        const label = String(Math.round(i));
        if (horizontal) ctx.fillText(label, Math.round(p) + 2, 9);
        else {
          ctx.save();
          ctx.translate(9, Math.round(p) + 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(label, -ctx.measureText(label).width, 0);
          ctx.restore();
        }
      }
    }
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(0, 17.5);
      ctx.lineTo(len, 17.5);
    } else {
      ctx.moveTo(17.5, 0);
      ctx.lineTo(17.5, len);
    }
    ctx.stroke();
    if (mark != null) {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(mark - 4, 12);
        ctx.lineTo(mark + 4, 12);
        ctx.lineTo(mark, 18);
      } else {
        ctx.moveTo(12, mark - 4);
        ctx.lineTo(12, mark + 4);
        ctx.lineTo(18, mark);
      }
      ctx.fill();
    }
  };
  draw(h, size.w, ox, true, pointer?.sx ?? null);
  draw(v, size.h, oy, false, pointer?.sy ?? null);
}
