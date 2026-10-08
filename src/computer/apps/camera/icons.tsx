/** Lab Cameras inline icons (16 px, stroke = currentColor). */
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  prev: <path d="M10 3.5L5.5 8l4.5 4.5" />,
  next: <path d="M6 3.5L10.5 8 6 12.5" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
      <path d="M10.5 3.5V3a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h.5" />
    </>
  ),
  camera: (
    <>
      <path d="M2 5.5a1 1 0 011-1h2l1-1.5h4l1 1.5h2a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
      <circle cx="8" cy="8.5" r="2.4" />
    </>
  ),
  gimp: <path d="M10 2.5l3.5 3.5-6 6-3 .8.8-3z" />,
  send: <path d="M2.5 8L13.5 3l-4 10.5-2-4.5z" />,
  grid: (
    <>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx=".6" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx=".6" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx=".6" />
      <rect x="9" y="9" width="4.5" height="4.5" rx=".6" />
    </>
  ),
  fill: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3.5 3.5" />
    </>
  ),
  play: <path d="M5 3l8 5-8 5z" fill="currentColor" />,
  pause: <path d="M5 3v10M11 3v10" strokeWidth="2.2" />,
  stepBack: <path d="M4 3v10M12 3L6 8l6 5z" />,
  stepFwd: <path d="M12 3v10M4 3l6 5-6 5z" />,
  film: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M5 3v10M11 3v10M2 6h3M2 10h3M11 6h3M11 10h3" />
    </>
  ),
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  dot: <circle cx="8" cy="8" r="3" fill="currentColor" />,
  link: <path d="M7 9a3 3 0 004.2 0l2-2A3 3 0 009 2.8l-1 1M9 7a3 3 0 00-4.2 0l-2 2A3 3 0 007 13.2l1-1" />,
};

export function Icon(props: { name: keyof typeof P; size?: number }) {
  const s = props.size ?? 16;
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {P[props.name]}
    </svg>
  );
}
