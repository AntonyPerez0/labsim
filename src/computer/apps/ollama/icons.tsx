/** Ollama WebUI icons (outline, currentColor) and the simplified llama head. */
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  edit: <path d="M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17zM14 7l3 3" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="M7 11v8H4v-8zM7 11l4-7a2 2 0 012 2v4h5a2 2 0 012 2.3l-1.2 6A2 2 0 0116.8 20H7" />,
  down: <path d="M17 13V5h3v8zM17 13l-4 7a2 2 0 01-2-2v-4H6a2 2 0 01-2-2.3l1.2-6A2 2 0 017.2 4H17" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />,
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  caret: <path d="M6 9l6 6 6-6" />,
  dots: (
    <>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  alert: <path d="M12 8v5M12 16.5v.5M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </>
  ),
  check: <path d="M5 12l5 5 9-10" />,
  sidebar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
};

export function OI(props: { name: keyof typeof P; size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {P[props.name]}
    </svg>
  );
}

export function Llama(props: { size?: number; color?: string }) {
  const s = props.size ?? 24;
  const c = props.color ?? '#111';
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round">
      <path d="M8.2 21v-6.3c0-2.6 1.6-4.1 3.8-4.1s3.8 1.5 3.8 4.1V21" />
      <path d="M9.4 10.9V5.3c0-1.2.5-2.1 1.2-2.1s1.1.9 1.1 2.1v5M12.4 10.4V5.3c0-1.2.5-2.1 1.1-2.1s1.2.9 1.2 2.1v5.6" />
      <circle cx="10.6" cy="14.4" r=".6" fill={c} />
      <circle cx="13.4" cy="14.4" r=".6" fill={c} />
      <path d="M11.2 16.6c.5.4 1.1.4 1.6 0" />
    </svg>
  );
}
