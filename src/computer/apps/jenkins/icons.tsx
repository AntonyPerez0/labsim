/**
 * Jenkins inline-SVG icons (Apps §3.1): butler head (simplified), Green Balls status icons, weather, folder,
 * side-panel task glyphs (Jenkins 2.4xx symbol style: 1.5 px outline, currentColor).
 */
import type { ReactNode } from 'react';

export type BallKind = 'success' | 'failure' | 'unstable' | 'aborted' | 'notbuilt' | 'disabled' | 'queued';

const BALL_COLOR: Record<BallKind, string> = {
  success: '#138347',
  failure: '#e6001f',
  unstable: '#fe820a',
  aborted: '#9a9aaa',
  notbuilt: '#9a9aaa',
  disabled: '#9a9aaa',
  queued: '#9a9aaa',
};

const BALL_LABEL: Record<BallKind, string> = {
  success: 'Success',
  failure: 'Failed',
  unstable: 'Unstable',
  aborted: 'Aborted',
  notbuilt: 'Not built',
  disabled: 'Disabled',
  queued: 'In the queue',
};

/** Status ball. `running` adds the rotating 2 px ring (Apps §3.1). */
export function Ball(props: { kind: BallKind; running?: boolean; size?: number; title?: string }) {
  const { kind, running, size = 24 } = props;
  const c = BALL_COLOR[kind];
  const label = props.title ?? (running ? `${BALL_LABEL[kind]} (in progress)` : BALL_LABEL[kind]);
  return (
    <span className={`jk-ball${running ? ' jk-ball-running' : ''}`} style={{ width: size, height: size, color: c }} role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        {kind === 'queued' ? (
          <>
            <circle cx="12" cy="12" r="9" fill="none" stroke={c} strokeWidth="1.8" />
            <path d="M12 7v5.2l3.2 2" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r={running ? 8 : 10} fill={kind === 'notbuilt' || kind === 'disabled' ? 'none' : c} stroke={c} strokeWidth={kind === 'notbuilt' || kind === 'disabled' ? 1.8 : 0} />
            {kind === 'success' ? <path d={running ? 'M8.6 12.2l2.3 2.3 4.6-4.8' : 'M7.6 12.3l3 3 5.8-6.1'} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
            {kind === 'failure' ? <path d={running ? 'M9.4 9.4l5.2 5.2M14.6 9.4l-5.2 5.2' : 'M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8'} stroke="#fff" strokeWidth="2" strokeLinecap="round" /> : null}
            {kind === 'unstable' ? <path d="M12 7.2v6M12 16.2v.4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /> : null}
            {kind === 'aborted' ? <path d="M8.2 12h7.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /> : null}
          </>
        )}
      </svg>
    </span>
  );
}

export type WeatherKind = 'sunny' | 'partly' | 'cloudy' | 'rain' | 'storm';

export function Weather(props: { kind: WeatherKind; title: string; size?: number }) {
  const s = props.size ?? 24;
  const sun = (
    <g>
      <circle cx="12" cy="12" r="4.4" fill="#f5b301" />
      <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" stroke="#f5b301" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
  const cloud = (fill: string, dy = 0) => <path d={`M7.4 ${18.6 + dy}h9.4a3.6 3.6 0 00.4-7.2 5 5 0 00-9.6 1.4 2.9 2.9 0 00-.2 5.8z`} fill={fill} stroke="#6d6b7f" strokeWidth="1.1" />;
  let body: ReactNode;
  switch (props.kind) {
    case 'sunny':
      body = sun;
      break;
    case 'partly':
      body = (
        <>
          <g transform="translate(-3.5 -3.5) scale(.85)">{sun}</g>
          {cloud('#fff', 0.6)}
        </>
      );
      break;
    case 'cloudy':
      body = (
        <>
          <path d="M10 11.2h6.4a2.6 2.6 0 00.2-5.2 3.6 3.6 0 00-7 1" fill="#e4e4ea" stroke="#9a9aaa" strokeWidth="1" />
          {cloud('#f2f2f5')}
        </>
      );
      break;
    case 'rain':
      body = (
        <>
          {cloud('#d9d9e0', -3)}
          <path d="M9 18.4l-1 2.4M12.4 18.4l-1 2.4M15.8 18.4l-1 2.4" stroke="#0b6aa2" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
      break;
    default:
      body = (
        <>
          {cloud('#9a9aaa', -3)}
          <path d="M12.6 16.2l-2.4 3.6h2.4l-1.6 3" fill="none" stroke="#f5b301" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        </>
      );
  }
  return (
    <span className="jk-weather" title={props.title} role="img" aria-label={props.title}>
      <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true">
        {body}
      </svg>
    </span>
  );
}

export function Butler(props: { size?: number }) {
  const s = props.size ?? 28;
  return (
    <svg viewBox="0 0 32 32" width={s} height={s} aria-hidden="true" className="jk-butler">
      <path d="M6.5 30c0-5.4 4.2-8.4 9.5-8.4s9.5 3 9.5 8.4z" fill="#335061" />
      <path d="M13.2 22.2l2.8 4 2.8-4z" fill="#fff" />
      <path d="M14.6 25.4l1.4-1 1.4 1-1.4 1z" fill="#d24939" />
      <ellipse cx="16" cy="13.6" rx="7.6" ry="8.3" fill="#f0d6b7" stroke="#231f20" strokeWidth=".9" />
      <path d="M8.4 12.6c.2-5.2 3.4-8.2 7.6-8.2s7.4 3 7.6 8.2c-1.6-2.2-4.2-3.5-7.6-3.5s-6 1.3-7.6 3.5z" fill="#231f20" />
      <circle cx="13.1" cy="14.2" r=".95" fill="#231f20" />
      <circle cx="18.9" cy="14.2" r=".95" fill="#231f20" />
      <path d="M13.2 17.9c1.7 1.2 3.9 1.2 5.6 0" fill="none" stroke="#231f20" strokeWidth=".9" strokeLinecap="round" />
      <path d="M11.6 12.1l2.6-.5M20.4 12.1l-2.6-.5" stroke="#231f20" strokeWidth=".8" strokeLinecap="round" />
    </svg>
  );
}

/** 24 px symbol icons used in side panels, tables and headings. */
const SYMBOLS: Record<string, ReactNode> = {
  folder: <path d="M3 6.5A1.5 1.5 0 014.5 5H9l2 2h8.5A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.4-3.4 2.6-5.3 5.5-5.3s5.1 1.9 5.5 5.3" />
      <circle cx="16.6" cy="9.4" r="2.5" />
      <path d="M15.6 13.8c2.6-.3 4.6 1.4 4.9 4.6" />
    </>
  ),
  history: (
    <>
      <path d="M4.5 12a7.5 7.5 0 102.2-5.3" />
      <path d="M4 4.5v3.2h3.2M12 8v4.3l2.8 1.8" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" />
    </>
  ),
  views: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9h17M9 9v10.5" />
    </>
  ),
  status: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 15v-3M12 15V9M16 15v-5" />
    </>
  ),
  changes: (
    <>
      <path d="M6 4v16M18 4v16" />
      <circle cx="6" cy="8" r="2" />
      <circle cx="18" cy="16" r="2" />
      <path d="M8 8h3a3 3 0 013 3v2a3 3 0 003 3" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7M10.5 10.5v6M13.5 10.5v6" />,
  stage: (
    <>
      <rect x="3.5" y="5" width="5" height="14" rx="1" />
      <rect x="9.5" y="5" width="5" height="14" rx="1" />
      <rect x="15.5" y="5" width="5" height="14" rx="1" />
    </>
  ),
  move: <path d="M12 3.5v17M3.5 12h17M12 3.5l-2.5 2.5M12 3.5l2.5 2.5M12 20.5l-2.5-2.5M12 20.5l2.5-2.5M3.5 12L6 9.5M3.5 12L6 14.5M20.5 12L18 9.5M20.5 12L18 14.5" />,
  rename: (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17z" />
      <path d="M13.5 8.5l2 2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.6a2.3 2.3 0 114 1.6c-.9.7-1.8 1.2-1.8 2.6M12 16.6v.2" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
      <path d="M7 9.5l3 2.5-3 2.5M12 15h5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17z" />
    </>
  ),
  list: <path d="M8 7h12M8 12h12M8 17h12M4 7h.5M4 12h.5M4 17h.5" />,
  steps: <path d="M5 6h6M5 12h10M5 18h14" />,
  prev: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 1.5h-15z" />
      <path d="M10 20.5a2.2 2.2 0 004 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20c.5-4 3.2-6.2 7-6.2s6.5 2.2 7 6.2" />
    </>
  ),
  logout: <path d="M10 5H5.5v14H10M14 8l4 4-4 4M18 12H9" />,
  computer: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
  plugin: <path d="M9 4v4M15 4v4M7 8h10v4a5 5 0 01-10 0zM12 17v3" />,
  shield: <path d="M12 3.5l7.5 3v5.3c0 4.4-3.1 7.6-7.5 8.7-4.4-1.1-7.5-4.3-7.5-8.7V6.5z" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v6M12 7.6v.2" />
    </>
  ),
  chart: <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />,
  log: (
    <>
      <path d="M6 3.5h9l3 3v14H6z" />
      <path d="M9 10h6M9 13.5h6M9 17h4" />
    </>
  ),
  cloud: <path d="M7 18.5h10a4 4 0 00.5-8 5.5 5.5 0 00-10.6 1.5A3.3 3.3 0 007 18.5z" />,
  tools: <path d="M14.5 5.5a4 4 0 00-5 5l-5.5 5.5 3 3 5.5-5.5a4 4 0 005-5l-2.5 2.5-2.5-.5-.5-2.5z" />,
  download: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />,
  copy: (
    <>
      <rect x="8" y="8" width="11.5" height="11.5" rx="1.5" />
      <path d="M5 15.5V5.5A1.5 1.5 0 016.5 4h9" />
    </>
  ),
  doc: (
    <>
      <path d="M6 3.5h8.5l3.5 3.5v13.5H6z" />
      <path d="M14.5 3.5V7H18" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="7" width="12.5" height="10" rx="1.5" />
      <path d="M15.5 10.5l5.5-3v9l-5.5-3z" />
    </>
  ),
  x: <path d="M7 7l10 10M17 7L7 17" />,
  rss: (
    <>
      <path d="M5 5a14 14 0 0114 14M5 10.5a8.5 8.5 0 018.5 8.5" />
      <circle cx="6" cy="18" r="1.2" />
    </>
  ),
  chevronDown: <path d="M7 10l5 5 5-5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

export type SymbolName = keyof typeof SYMBOLS;

export function Sym(props: { name: SymbolName; size?: number; className?: string }) {
  const s = props.size ?? 20;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} className={`jk-sym${props.className ? ` ${props.className}` : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SYMBOLS[props.name]}
    </svg>
  );
}

export function FolderIcon(props: { size?: number }) {
  const s = props.size ?? 24;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true" className="jk-folder-icon">
      <path d="M2.5 6.5A1.5 1.5 0 014 5h5.2l2 2H20a1.5 1.5 0 011.5 1.5v10A1.5 1.5 0 0120 20H4a1.5 1.5 0 01-1.5-1.5z" fill="#6d6b7f" />
      <path d="M2.5 9h19v9.5A1.5 1.5 0 0120 20H4a1.5 1.5 0 01-1.5-1.5z" fill="#8a889a" />
    </svg>
  );
}
