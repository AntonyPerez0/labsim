/**
 * DR05 Coordinate Hunter — a GIMP-style window: rulers, the screenshot, Rectangle Select, and Tool Options
 * with live Position / Size. Drag a box, refine it (arrows move, Shift+arrows resize, or type the numbers),
 * hold the loupe over an edge for a 6× view, Enter to commit. Mode B converts to mm; Mode C types the block.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getState, useGame } from '@/core/store';
import type { DrillComponentProps } from '../../types';
import { useDrill, useKeys } from '../common/useDrill';
import { Kbd, Reveal, Waiting } from '../common/ui';
import { checkBlock, huntPoints, mmOk, PX_PER_MM, SHOT_H, SHOT_W, SHOTS, type HuntData, type HuntMode, type PxRect } from './logic';
import { ShotContent, ShotDefs } from './shot';
import './style.css';

interface Payload {
  drawn: PxRect;
  e: number;
  edgePts: number;
  bonus: { ok: boolean; why: string } | null;
}

const clampRect = (r: PxRect): PxRect => {
  const x = Math.max(0, Math.min(SHOT_W - 1, Math.round(r.x)));
  const y = Math.max(0, Math.min(SHOT_H - 1, Math.round(r.y)));
  return { x, y, w: Math.max(1, Math.min(SHOT_W - x, Math.round(r.w))), h: Math.max(1, Math.min(SHOT_H - y, Math.round(r.h))) };
};

export function View(props: DrillComponentProps) {
  const d = useDrill<HuntData, Payload>(props);
  const it = d.item;
  const mode = ((useGame((s) => s.session.drill?.mode) ?? 'A') as HuntMode) || 'A';
  const [sel, setSel] = useState<PxRect | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [step, setStep] = useState<'box' | 'bonus'>('box');
  const [mmX, setMmX] = useState('');
  const [mmY, setMmY] = useState('');
  const [block, setBlock] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const bonusRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setSel(null);
    setDrag(null);
    setStep('box');
    setMmX('');
    setMmY('');
    setBlock('');
  }, [d.itemKey]);

  useEffect(() => {
    if (step === 'bonus') window.setTimeout(() => bonusRef.current?.focus(), 30);
  }, [step]);

  const shot = it ? SHOTS[it.data.shot] : null;
  const st = d.staged;

  const toPx = (e: React.MouseEvent): { x: number; y: number } | null => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: Math.round(((e.clientX - r.left) / r.width) * SHOT_W), y: Math.round(((e.clientY - r.top) / r.height) * SHOT_H) };
  };

  const finish = (bonus: { ok: boolean; why: string } | null) => {
    if (!it || !sel || st) return;
    const streak = getState().session.drill?.streak ?? 0;
    const sc = huntPoints(sel, it.data.rect, streak, mode, !!bonus?.ok);
    const detail = `edge error ${sc.e.toFixed(1)} px${bonus && !bonus.ok ? ` · ${mode === 'B' ? 'mm conversion off' : 'Pigeon block wrong'}` : ''}`;
    d.stage({ correct: sc.correct, pointsOverride: sc.points, detail: sc.correct ? undefined : detail }, { drawn: sel, e: sc.e, edgePts: sc.edgePts, bonus });
  };

  const commitBox = () => {
    if (!sel || st || step !== 'box') return;
    if (mode === 'A') finish(null);
    else setStep('bonus');
  };

  const submitBonus = () => {
    if (!it || !sel || st) return;
    if (mode === 'B') {
      const x = Number(mmX.replace(',', '.'));
      const y = Number(mmY.replace(',', '.'));
      const ok = Number.isFinite(x) && Number.isFinite(y) && mmOk(it.data, x, y);
      finish({ ok, why: ok ? '' : `Centre = ((x + w/2) / ${PX_PER_MM.x}, (y + h/2) / ${PX_PER_MM.y}) = (${it.data.mm?.x.toFixed(1)}, ${it.data.mm?.y.toFixed(1)}) mm — you typed (${mmX || '?'}, ${mmY || '?'}).` });
    } else finish(checkBlock(block, sel, it.data.expected));
  };

  useKeys(
    (e) => {
      if (st || !it) return;
      if (step === 'box') {
        if (e.code === 'Enter') {
          e.preventDefault();
          commitBox();
          return;
        }
        const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const v = dir[e.code];
        if (v && sel) {
          e.preventDefault();
          const k = e.altKey ? 10 : 1;
          setSel(clampRect(e.shiftKey ? { ...sel, w: sel.w + v[0] * k, h: sel.h + v[1] * k } : { ...sel, x: sel.x + v[0] * k, y: sel.y + v[1] * k }));
        }
      }
    },
    [d.itemKey, sel, step, st, mode],
  );

  const shown = drag && hover ? clampRect({ x: Math.min(drag.x, hover.x), y: Math.min(drag.y, hover.y), w: Math.abs(hover.x - drag.x), h: Math.abs(hover.y - drag.y) }) : sel;
  const loupe = hover ?? (shown ? { x: shown.x, y: shown.y } : null);
  const ticks = useMemo(() => Array.from({ length: 27 }, (_, i) => i * 50), []);

  if (!it || !shot) return <Waiting />;
  const field = (k: keyof PxRect, label: string) => (
    <label className="dr05-num">
      <span>{label}</span>
      <input
        type="number"
        value={sel ? sel[k] : ''}
        disabled={!sel || !!st || step !== 'box'}
        onChange={(e) => sel && setSel(clampRect({ ...sel, [k]: Number(e.target.value) }))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitBox();
          }
        }}
      />
    </label>
  );

  return (
    <div className="dr05">
      <div className="dr05-gimp">
        <div className="dr05-titlebar">
          [{shot.file.replace('.png', '')}] (imported)-1.0 (RGB color 8-bit gamma integer, GIMP built-in sRGB, 1 layer) {SHOT_W}x{SHOT_H} – GIMP
        </div>
        <div className="dr05-menubar">
          {['File', 'Edit', 'Select', 'View', 'Image', 'Layer', 'Colors', 'Tools', 'Filters', 'Windows', 'Help'].map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        <div className="dr05-main">
          <div className="dr05-toolbox">
            {['▭', '◯', '✎', '⤢', '✋', '🔍', 'T', '⧉'].map((t, i) => (
              <span key={t} className={i === 0 ? 'is-on' : ''} title={i === 0 ? 'Rectangle Select (R)' : undefined}>
                {t}
              </span>
            ))}
          </div>
          <div className="dr05-canvaswrap">
            <div className="dr05-ruler is-top">
              {ticks.map((t) => (
                <span key={t} style={{ left: `${(t / SHOT_W) * 100}%` }}>
                  {t % 100 === 0 ? t : ''}
                </span>
              ))}
            </div>
            <div className="dr05-ruler is-left">
              {ticks
                .filter((t) => t <= SHOT_H)
                .map((t) => (
                  <span key={t} style={{ top: `${(t / SHOT_H) * 100}%` }}>
                    {t % 100 === 0 ? t : ''}
                  </span>
                ))}
            </div>
            <svg
              ref={svgRef}
              className="dr05-canvas"
              viewBox={`0 0 ${SHOT_W} ${SHOT_H}`}
              onMouseDown={(e) => {
                if (st || step !== 'box') return;
                const p = toPx(e);
                if (p) setDrag(p);
              }}
              onMouseMove={(e) => setHover(toPx(e))}
              onMouseLeave={() => setHover(null)}
              onMouseUp={(e) => {
                const p = toPx(e);
                if (drag && p) {
                  const r = clampRect({ x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) });
                  if (r.w >= 3 && r.h >= 3) setSel(r);
                }
                setDrag(null);
              }}
            >
              <ShotDefs />
              <ShotContent shot={shot} id="dr05-shot" />
              {st ? <rect x={it.data.rect.x} y={it.data.rect.y} width={it.data.rect.w} height={it.data.rect.h} className="dr05-target" /> : null}
              {shown ? (
                <g className={st ? 'is-done' : ''}>
                  <rect x={shown.x} y={shown.y} width={shown.w} height={shown.h} className="dr05-sel" />
                  <rect x={shown.x} y={shown.y} width={shown.w} height={shown.h} className="dr05-sel is-ants" />
                </g>
              ) : null}
              {hover && !st ? (
                <g pointerEvents="none">
                  <line x1={hover.x + 0.5} y1={0} x2={hover.x + 0.5} y2={SHOT_H} className="dr05-guide" />
                  <line x1={0} y1={hover.y + 0.5} x2={SHOT_W} y2={hover.y + 0.5} className="dr05-guide" />
                </g>
              ) : null}
            </svg>
            {loupe && !st ? (
              <svg className="dr05-loupe" viewBox={`${loupe.x - 14} ${loupe.y - 14} 28 28`} shapeRendering="crispEdges">
                <use href="#dr05-shot" />
                {shown ? <rect x={shown.x} y={shown.y} width={shown.w} height={shown.h} className="dr05-sel is-loupe" /> : null}
                <line x1={loupe.x + 0.5} y1={loupe.y - 14} x2={loupe.x + 0.5} y2={loupe.y + 14} className="dr05-loupe__x" />
                <line x1={loupe.x - 14} y1={loupe.y + 0.5} x2={loupe.x + 14} y2={loupe.y + 0.5} className="dr05-loupe__x" />
              </svg>
            ) : null}
          </div>
          <div className="dr05-dock">
            <div className="dr05-task">
              <div className="dk-eyebrow">Coordinate Hunter · Mode {mode}</div>
              <div className="dr05-task__text">
                Box <code>{it.data.expected}</code>
              </div>
              <div className="dr05-task__src">
                {shot.title} · {shot.source === 'webcam' ? 'webcam snapshot' : 'device screencap'}
              </div>
            </div>
            <div className="dr05-opts">
              <div className="dr05-opts__title">Tool Options — Rectangle Select</div>
              <div className="dr05-opts__row">
                <span className="dr05-opts__lbl">Position:</span>
                {field('x', 'x')}
                {field('y', 'y')}
                <span className="dr05-unit">px</span>
              </div>
              <div className="dr05-opts__row">
                <span className="dr05-opts__lbl">Size:</span>
                {field('w', 'w')}
                {field('h', 'h')}
                <span className="dr05-unit">px</span>
              </div>
            </div>
            {step === 'bonus' && !st && mode === 'B' ? (
              <div className="dr05-bonus">
                <div className="dr05-bonus__title">Screen Location (mm)</div>
                <div className="dr05-bonus__hint">
                  MINI_3: {PX_PER_MM.x} px/mm (x) · {PX_PER_MM.y} px/mm (y). Centre = (x + w/2, y + h/2) ÷ px/mm.
                </div>
                <div className="dr05-opts__row">
                  <label className="dr05-num">
                    <span>X</span>
                    <input ref={(el) => {
                      bonusRef.current = el;
                    }} value={mmX} onChange={(e) => setMmX(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitBonus()} />
                  </label>
                  <label className="dr05-num">
                    <span>Y</span>
                    <input value={mmY} onChange={(e) => setMmY(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitBonus()} />
                  </label>
                  <span className="dr05-unit">mm</span>
                </div>
              </div>
            ) : null}
            {step === 'bonus' && !st && mode === 'C' ? (
              <div className="dr05-bonus">
                <div className="dr05-bonus__title">Pigeon screenCompare params</div>
                <textarea
                  ref={(el) => {
                      bonusRef.current = el;
                    }}
                  className="dr05-block"
                  spellCheck={false}
                  value={block}
                  placeholder={'{"x": …, "y": …, "w": …, "h": …, "expected": "…"}'}
                  onChange={(e) => setBlock(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      submitBonus();
                    }
                  }}
                />
                <div className="dr05-bonus__hint">
                  <Kbd k="Ctrl ⏎" size="sm" /> submit · no linter in Pigeon
                </div>
              </div>
            ) : null}
            {st ? (
              <Reveal correct={st.verdict.correct} points={st.points} multiplier={st.multiplier} title={`Edge error ${st.payload.e.toFixed(1)} px → ${st.payload.edgePts}`} onNext={() => d.commit()} autoMs={2200}>
                <div className="dr05-cmp">
                  <span>
                    you <b>{st.payload.drawn.x}, {st.payload.drawn.y}</b> · <b>{st.payload.drawn.w} × {st.payload.drawn.h}</b>
                  </span>
                  <span>
                    target <b>{it.data.rect.x}, {it.data.rect.y}</b> · <b>{it.data.rect.w} × {it.data.rect.h}</b>
                  </span>
                  {it.data.mm && mode === 'B' ? (
                    <span>
                      centre <b>{it.data.mm.x.toFixed(1)}, {it.data.mm.y.toFixed(1)} mm</b>
                    </span>
                  ) : null}
                </div>
                {st.payload.bonus && !st.payload.bonus.ok ? <div className="dr05-bad">{st.payload.bonus.why}</div> : null}
              </Reveal>
            ) : (
              <div className="dr05-keys">
                <div>
                  <Kbd k="drag" size="sm" /> select · <Kbd k="←↑→↓" size="sm" /> move · <Kbd k="Shift" size="sm" /> + arrows resize
                </div>
                <div>
                  <Kbd k="⏎" size="sm" /> {mode === 'A' ? 'commit box' : step === 'box' ? 'commit box, then ' + (mode === 'B' ? 'convert' : 'type the block') : 'submit'}
                </div>
                <div className="dr05-scale">e ≤ 1 px → 150 · ≤ 3 → 100 · ≤ 6 → 50</div>
              </div>
            )}
          </div>
        </div>
        <div className="dr05-status">
          <span>{hover ? `${hover.x}, ${hover.y}` : '—, —'}</span>
          <span>px</span>
          <span className="dr05-status__sel">{shown ? `Rectangle: ${shown.w} × ${shown.h}` : 'Click-drag to create a new selection'}</span>
        </div>
      </div>
    </div>
  );
}
