/**
 * Inline stroke icon set (24 × 24, currentColor). Drawn for LabSim; no icon font, no downloads.
 *
 *   <Icon name="ticket" size={16} />
 */
import type { CSSProperties, ReactElement } from 'react';

const P: Record<string, ReactElement> = {
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="4" height="14" rx="1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M9 7h7M9 11h5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  unlock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 7.7-1.5" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5L19.5 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  'chevron-left': <path d="M15 5l-7 7 7 7" />,
  'chevron-down': <path d="M5 9l7 7 7-7" />,
  'chevron-up': <path d="M5 15l7-7 7 7" />,
  'arrow-right': <path d="M4 12h16M14 6l6 6-6 6" />,
  'arrow-left': <path d="M20 12H4M10 6l-6 6 6 6" />,
  'arrow-up': <path d="M12 20V4M6 10l6-6 6 6" />,
  'arrow-down': <path d="M12 4v16M6 14l6 6 6-6" />,
  star: <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.6l6.1-.8z" />,
  flame: <path d="M12 22c4 0 7-2.7 7-6.6 0-3.6-2.6-5.6-3.6-8.9-.5 2-1.6 3.2-2.8 3.7C12.9 6.6 11 4 8.5 2.5 8.8 6 5 8.6 5 13.9 5 19 8 22 12 22z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5.1 5.1L21 12.6l-.2.2a6 6 0 0 1-7.6 1l-7.1 7.1a2.1 2.1 0 0 1-3-3l7.1-7.1a6 6 0 0 1 1-7.6l.2-.2 1.2 1.2a4 4 0 0 0 2.1 2.1z" />,
  ticket: (
    <>
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2 2.2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4.5M12 17.5v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9.5 9.5h5v5h-5zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14L7 22l5-3 5 3-1.5-8" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
      <path d="M4 3v5h5M4 13a8 8 0 0 0 14.6 4.5L20 16" />
      <path d="M20 21v-5h-5" />
    </>
  ),
  home: (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.1M10 10h.1M14 10h.1M18 10h.1M7 14h10" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" />
      <path d="M7 15h10" />
    </>
  ),
  map: (
    <>
      <path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 4.6-3.3 8.3-8 9-4.7-.7-8-4.4-8-9V6z" />,
  robot: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="2.5" />
      <path d="M12 4v4M9 13h.1M15 13h.1M9.5 16.5h5M2.5 12.5v3M21.5 12.5v3" />
      <circle cx="12" cy="3.5" r="1" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5" />
    </>
  ),
  hint: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" />
    </>
  ),
  drag: (
    <>
      <circle cx="9" cy="6" r="1.2" fill="currentColor" />
      <circle cx="15" cy="6" r="1.2" fill="currentColor" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" />
      <circle cx="9" cy="18" r="1.2" fill="currentColor" />
      <circle cx="15" cy="18" r="1.2" fill="currentColor" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4.5L6 21z" />,
  send: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />,
  'fast-forward': <path d="M3 6l8 6-8 6zM12 6l8 6-8 6z" fill="currentColor" stroke="none" />,
  layers2: <path d="M4 7h16M4 12h16M4 17h10" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.1M3.5 12h.1M3.5 18h.1" />,
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  tablet: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M17.5 12h.1" />
    </>
  ),
  pipeline: (
    <>
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="19" cy="12" r="2.2" />
      <path d="M7.2 12h2.6M14.2 12h2.6" />
    </>
  ),
  heat: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.4 2-4.5.3 1.6 1.2 2.6 2.3 2.8C10.6 8.8 11 5.6 12 3z" />,
  card: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
  screwdriver: (
    <>
      <path d="M14.5 9.5l-9 9a1.5 1.5 0 0 0 2 2l9-9" />
      <path d="M13 8l3-3 3.5 3.5-3 3z" />
      <path d="M16 5l2-2 3 3-2 2" />
    </>
  ),
  multimeter: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <rect x="8.5" y="5" width="7" height="4" rx="1" />
      <circle cx="12" cy="14.5" r="2.6" />
      <path d="M12 14.5l1.3-1.3" />
    </>
  ),
  fuse: (
    <>
      <rect x="6.5" y="3" width="11" height="11" rx="2" />
      <path d="M9 14v7M15 14v7M9.5 8.5h5" />
    </>
  ),
  ethernet: (
    <>
      <rect x="6" y="9" width="12" height="11" rx="1.5" />
      <path d="M9 9V6h6v3M9.5 13v3M12 13v3M14.5 13v3M12 6V2.5" />
    </>
  ),
  hand: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.4 0-3.8-1-5-3l-2.5-4.3a1.5 1.5 0 0 1 2.6-1.5L8 14" />,
  flashlight: (
    <>
      <path d="M8 3h8v4l-2 3v10a2 2 0 0 1-4 0V10L8 7z" />
      <path d="M12 13v2" />
    </>
  ),
  ruler: (
    <>
      <rect x="2.5" y="8" width="19" height="8" rx="1.2" />
      <path d="M6 8v3M9.5 8v4M13 8v3M16.5 8v4M20 8v3" />
    </>
  ),
  box: (
    <>
      <path d="M3 7.5l9-4.5 9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5l9 4.5 9-4.5M12 12v9" />
    </>
  ),
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  escalate: (
    <>
      <path d="M12 20V7M6 12l6-6 6 6" />
      <path d="M5 3h14" />
    </>
  ),
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  sparkle: <path d="M12 3l1.8 5.4L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.6zM19 16l.8 2 2 .8-2 .8L19 22l-.8-2.4-2-.8 2-.8z" />,
  medal: (
    <>
      <circle cx="12" cy="15" r="6" />
      <path d="M8.5 10L6 3h4l2 4.5L14 3h4l-2.5 7" />
    </>
  ),
  rocket: (
    <>
      <path d="M5 15c-1.5 1.5-2 4.5-2 6 1.5 0 4.5-.5 6-2" />
      <path d="M9 15l-3-3c1.5-5 6-9 13-9 0 7-4 11.5-9 13z" />
      <circle cx="15" cy="9" r="1.6" />
    </>
  ),
  graduation: (
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6" />
    </>
  ),
  sandbox: (
    <>
      <path d="M3 17h18l-2 4H5z" />
      <path d="M7 17l3-9 3 5 2-3 3 7" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  bug: (
    <>
      <rect x="7" y="7" width="10" height="13" rx="5" />
      <path d="M12 7v13M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M4 20l3-2M20 20l-3-2M9 4l1.5 2M15 4l-1.5 2" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3.2-3.2a4 4 0 0 0-5.7-5.7L12 6.3" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3.2 3.2a4 4 0 0 0 5.7 5.7l1.2-1.2" />
    </>
  ),
  cards: (
    <>
      <rect x="7" y="3" width="13" height="16" rx="2" />
      <path d="M4 7v12a2 2 0 0 0 2 2h9" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  coffee: (
    <>
      <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3" />
    </>
  ),
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, stroke = 1.8, className, style, title }: { name: IconName | string; size?: number; stroke?: number; className?: string; style?: CSSProperties; title?: string }) {
  const body = P[name] ?? P.info;
  return (
    <svg
      className={`k-icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}

/** The lab-style four-leaf mark used by the logo and loading screen. */
export function LabWordmark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <g fill="currentColor">
        <rect x="5" y="5" width="10" height="10" rx="3.4" />
        <rect x="17" y="5" width="10" height="10" rx="3.4" />
        <rect x="5" y="17" width="10" height="10" rx="3.4" />
        <rect x="17" y="17" width="10" height="10" rx="3.4" />
      </g>
    </svg>
  );
}
