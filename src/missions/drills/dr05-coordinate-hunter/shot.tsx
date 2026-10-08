/** DR05 screenshot renderer: draws a `Shot` (1280×800 px) as SVG content with crisp element edges. */
import type { ReactElement } from 'react';
import { SHOT_H, SHOT_W, type Shot, type ShotEl } from './logic';

const FONT = 'Inter, "Segoe UI", Roboto, system-ui, sans-serif';

function Qr({ el }: { el: ShotEl }) {
  const n = 21;
  const s = Math.floor(Math.min(el.w, el.h) / n);
  const x0 = el.x + Math.floor((el.w - s * n) / 2);
  const y0 = el.y + Math.floor((el.h - s * n) / 2);
  const cells: ReactElement[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const finders: [number, number][] = [[0, 0], [0, n - 7], [n - 7, 0]];
      const f = finders.find(([a, b]) => i >= a && i < a + 7 && j >= b && j < b + 7);
      const on = f ? Math.max(Math.abs(i - f[0] - 3), Math.abs(j - f[1] - 3)) !== 2 : (i * 31 + j * 17 + i * j * 7) % 5 < 2;
      if (on) cells.push(<rect key={`${i}-${j}`} x={x0 + j * s} y={y0 + i * s} width={s} height={s} fill="#111" />);
    }
  return <g>{cells}</g>;
}

function El({ el }: { el: ShotEl }) {
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const fs = el.size ?? 26;
  switch (el.kind) {
    case 'bar':
      return (
        <g>
          <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="#2b7d19" />
          <text x={40} y={el.h / 2 + 12} fontFamily={FONT} fontSize={34} fontWeight={700} fill="#fff">
            {el.text}
          </text>
        </g>
      );
    case 'field':
      return (
        <g>
          <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="#eef1f4" />
          <rect x={el.x + 1} y={el.y + 1} width={el.w - 2} height={el.h - 2} fill="none" stroke="#c4cad2" strokeWidth={2} />
          <text x={cx} y={cy + fs * 0.36} fontFamily={FONT} fontSize={fs} fontWeight={el.id === 'total' ? 800 : 600} fill="#111827" textAnchor="middle">
            {el.text}
          </text>
        </g>
      );
    case 'button': {
      const fill = el.tone === 'primary' ? '#43b02a' : el.tone === 'danger' ? '#fde8e7' : '#ffffff';
      const ink = el.tone === 'primary' ? '#ffffff' : el.tone === 'danger' ? '#b42318' : '#111827';
      return (
        <g>
          <rect x={el.x} y={el.y} width={el.w} height={el.h} fill={fill} />
          <rect x={el.x + 1} y={el.y + 1} width={el.w - 2} height={el.h - 2} fill="none" stroke={el.tone === 'primary' ? '#2f8f1c' : '#b9c0c9'} strokeWidth={2} />
          <text x={cx} y={cy + fs * 0.36} fontFamily={FONT} fontSize={fs} fontWeight={650} fill={ink} textAnchor="middle">
            {el.text}
          </text>
        </g>
      );
    }
    case 'qr':
      return <Qr el={el} />;
    default:
      return (
        <text
          x={el.align === 'right' ? el.x + el.w : el.align === 'center' ? cx : el.x}
          y={cy + fs * 0.36}
          fontFamily={FONT}
          fontSize={fs}
          fontWeight={500}
          fill="#374151"
          textAnchor={el.align === 'right' ? 'end' : el.align === 'center' ? 'middle' : 'start'}
        >
          {el.text}
        </text>
      );
  }
}

/** The screenshot content (no <svg> wrapper) so it can be reused by the loupe via <use>. */
export function ShotContent({ shot, id }: { shot: Shot; id: string }) {
  const webcam = shot.source === 'webcam';
  return (
    <g id={id}>
      <rect x={0} y={0} width={SHOT_W} height={SHOT_H} fill={webcam ? '#e9ecef' : '#f7f8fa'} />
      {shot.els.map((el) => (
        <El key={el.id} el={el} />
      ))}
      {webcam ? <rect x={0} y={0} width={SHOT_W} height={SHOT_H} fill="url(#dr05-vignette)" pointerEvents="none" /> : null}
    </g>
  );
}

export function ShotDefs() {
  return (
    <defs>
      <radialGradient id="dr05-vignette" cx="50%" cy="50%" r="75%">
        <stop offset="70%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
      </radialGradient>
    </defs>
  );
}
