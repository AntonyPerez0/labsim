/**
 * Shell glyphs (inline SVG, `currentColor`, Apps §0.7) and the app icon renderer.
 */
import type { CSSProperties, ReactElement } from 'react';
import { APP_ICONS, type AppId } from '../apps';

export function AppIcon(props: { app: AppId; size?: number; className?: string; style?: CSSProperties }): ReactElement {
  const size = props.size ?? 24;
  const svg = APP_ICONS[props.app] ?? APP_ICONS.browser;
  return (
    <span
      className={props.className}
      aria-hidden="true"
      style={{ display: 'inline-block', width: size, height: size, lineHeight: 0, flex: 'none', ...props.style }}
      dangerouslySetInnerHTML={{ __html: svg.replace('width="24" height="24"', `width="${size}" height="${size}"`) }}
    />
  );
}

type G = { size?: number; className?: string; title?: string };

function svgBox(size: number, body: ReactElement, viewBox = '0 0 16 16', className?: string): ReactElement {
  return (
    <svg className={className} width={size} height={size} viewBox={viewBox} fill="none" aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}

export const Glyph = {
  back: ({ size = 16, className }: G) =>
    svgBox(size, <path d="M13 8H3.5M7.5 3.5L3 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />, undefined, className),
  forward: ({ size = 16, className }: G) =>
    svgBox(size, <path d="M3 8h9.5M8.5 3.5L13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />, undefined, className),
  reload: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 8a5 5 0 11-1.5-3.55" />
        <path d="M13 2.5v3.2H9.8" />
      </g>,
      undefined,
      className,
    ),
  close: ({ size = 16, className }: G) =>
    svgBox(size, <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />, undefined, className),
  minimize: ({ size = 16, className }: G) => svgBox(size, <path d="M3.5 8.5h9" stroke="currentColor" strokeWidth="1" />, undefined, className),
  maximize: ({ size = 16, className }: G) =>
    svgBox(size, <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1" />, undefined, className),
  restore: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g stroke="currentColor" strokeWidth="1">
        <rect x="3.5" y="5.5" width="7" height="7" rx="1" />
        <path d="M5.5 5.5V4.5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-1" />
      </g>,
      undefined,
      className,
    ),
  plus: ({ size = 16, className }: G) =>
    svgBox(size, <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />, undefined, className),
  star: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />,
      undefined,
      className,
    ),
  lock: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g fill="currentColor">
        <path d="M5 7V5.2a3 3 0 016 0V7h-1.4V5.2a1.6 1.6 0 00-3.2 0V7z" />
        <rect x="3.5" y="7" width="9" height="7" rx="1.2" />
      </g>,
      undefined,
      className,
    ),
  info: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g>
        <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="5" r=".9" fill="currentColor" />
      </g>,
      undefined,
      className,
    ),
  search: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </g>,
      undefined,
      className,
    ),
  bell: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M4 11.5V7.2a4 4 0 018 0v4.3l1.2 1.3H2.8z" />
        <path d="M6.5 13.5a1.6 1.6 0 003 0" />
      </g>,
      undefined,
      className,
    ),
  network: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g stroke="currentColor" strokeWidth="1.2">
        <rect x="2" y="3" width="12" height="8" rx="1" />
        <path d="M6 13.5h4M8 11v2.5" />
      </g>,
      undefined,
      className,
    ),
  speaker: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M2.5 6.2h2.3L8 3.5v9L4.8 9.8H2.5z" />
        <path d="M10.3 5.8a3 3 0 010 4.4M12.2 4a5.6 5.6 0 010 8" />
      </g>,
      undefined,
      className,
    ),
  chair: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 2.5h6v5H5z" />
        <path d="M4 9h8M8 9v3M5 14.5l3-2.5 3 2.5M5 7.5V9M11 7.5V9" />
      </g>,
      undefined,
      className,
    ),
  power: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M8 2v6" />
        <path d="M4.6 4.4a5 5 0 106.8 0" />
      </g>,
      undefined,
      className,
    ),
  padlock: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g>
        <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3.5" y="7" width="9" height="7" rx="1.3" fill="currentColor" />
      </g>,
      undefined,
      className,
    ),
  chevronUp: ({ size = 16, className }: G) =>
    svgBox(size, <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />, undefined, className),
  chevronRight: ({ size = 16, className }: G) =>
    svgBox(size, <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />, undefined, className),
  folder: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g>
        <path d="M1.5 4A1 1 0 012.5 3H6l1.3 1.4h6.2a1 1 0 011 1V12a1 1 0 01-1 1h-11a1 1 0 01-1-1z" fill="#e8b23a" />
        <path d="M1.5 6h13v6a1 1 0 01-1 1h-11a1 1 0 01-1-1z" fill="#fbd96b" />
      </g>,
      undefined,
      className,
    ),
  file: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g>
        <path d="M3.5 1.5h6l3 3v10h-9z" fill="#fff" stroke="#8a8a8a" />
        <path d="M9.5 1.5v3h3" stroke="#8a8a8a" />
      </g>,
      undefined,
      className,
    ),
  image: ({ size = 16, className }: G) =>
    svgBox(
      size,
      <g>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="#e6f0ff" stroke="#3b7ddd" />
        <path d="M2.5 12l3.5-4 2.5 2.8 2-2 3 3.2z" fill="#3b7ddd" />
        <circle cx="11" cy="5.6" r="1.2" fill="#f4b400" />
      </g>,
      undefined,
      className,
    ),
  docFrown: ({ size = 72, className }: G) =>
    svgBox(
      size,
      <g stroke="#5f6368" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 6h28l12 12v40H14z" fill="#fff" />
        <path d="M42 6v12h12" />
        <circle cx="26" cy="30" r="1.6" fill="#5f6368" />
        <circle cx="40" cy="30" r="1.6" fill="#5f6368" />
        <path d="M25 44c4-5 12-5 16 0" />
      </g>,
      '0 0 68 64',
      className,
    ),
};
