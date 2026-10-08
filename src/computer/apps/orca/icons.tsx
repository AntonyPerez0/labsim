/**
 * Inline SVGs shaped like the Font Awesome glyphs JHipster uses (Apps §2.1) + the Orca whale.
 */
import type { ReactElement } from 'react';

type P = { size?: number };
const box = (d: ReactElement, size = 14, vb = '0 0 16 16') => (
  <svg width={size} height={size} viewBox={vb} fill="currentColor" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
    {d}
  </svg>
);

export const Fa = {
  home: ({ size }: P) => box(<path d="M8 1.5L1 7.6h2V14h3.6V10h2.8v4H13V7.6h2z" />, size),
  thList: ({ size }: P) => box(<path d="M1 2h3v3H1zm4 0h10v3H5zM1 6.5h3v3H1zm4 0h10v3H5zM1 11h3v3H1zm4 0h10v3H5z" />, size),
  usersCog: ({ size }: P) =>
    box(
      <>
        <circle cx="5" cy="5" r="2.6" />
        <path d="M0.6 14c0-3 2-4.6 4.4-4.6 1.2 0 2.2.3 3 1v3.6z" />
        <path d="M12 7.6l.5 1.2 1.3.1.2 1.3 1.1.7-.5 1.2.5 1.2-1.1.7-.2 1.3-1.3.1-.5 1.2-1.2-.5-1.2.5-.5-1.2-1.3-.1-.2-1.3-1.1-.7.5-1.2-.5-1.2 1.1-.7.2-1.3 1.3-.1.5-1.2 1.2.5z" transform="translate(-1 -1) scale(.95)" />
      </>,
      size,
    ),
  user: ({ size }: P) => box(<path d="M8 8a3.3 3.3 0 100-6.6A3.3 3.3 0 008 8zm-5.5 7c0-3.2 2.4-5.6 5.5-5.6s5.5 2.4 5.5 5.6z" />, size),
  eye: ({ size }: P) => box(<path d="M8 3C4 3 1.2 6 .5 8c.7 2 3.5 5 7.5 5s6.8-3 7.5-5C14.8 6 12 3 8 3zm0 8.2A3.2 3.2 0 118 4.8a3.2 3.2 0 010 6.4zM8 6.3a1.7 1.7 0 100 3.4 1.7 1.7 0 000-3.4z" />, size),
  pencil: ({ size }: P) => box(<path d="M11.7 1.3l3 3L5.4 13.6l-3.8.8.8-3.8zM10.6 3.4l2 2" stroke="currentColor" strokeWidth=".6" />, size),
  times: ({ size }: P) => box(<path d="M3.2 2L8 6.8 12.8 2 14 3.2 9.2 8l4.8 4.8-1.2 1.2L8 9.2 3.2 14 2 12.8 6.8 8 2 3.2z" />, size),
  save: ({ size }: P) => box(<path d="M1.5 1.5h10l3 3v10h-13zm2.5 1.5v3.5h7V3zm4 6.2a2.3 2.3 0 100 4.6 2.3 2.3 0 000-4.6z" />, size),
  ban: ({ size }: P) => box(<path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2c1 0 2 .3 2.8.9L3.9 10.8A5 5 0 018 3zm0 10c-1 0-2-.3-2.8-.9l6.9-6.9A5 5 0 018 13z" />, size),
  arrowLeft: ({ size }: P) => box(<path d="M7 2.5L1.5 8 7 13.5l1.3-1.3L5 9h9.5V7H5l3.3-3.2z" />, size),
  sync: ({ size }: P) => box(<path d="M13.6 2.4V6.5H9.5l1.6-1.6A4.5 4.5 0 003.6 7H1.5a6.5 6.5 0 0111-3.6zM2.4 13.6V9.5h4.1l-1.6 1.6A4.5 4.5 0 0012.4 9h2.1a6.5 6.5 0 01-11 3.6z" />, size),
  plus: ({ size }: P) => box(<path d="M7 1.5h2v5.5h5.5v2H9v5.5H7V9H1.5V7H7z" />, size),
  asterisk: ({ size }: P) => box(<path d="M7 1h2v5.3l4.6-2.7 1 1.8L10 8l4.6 2.6-1 1.8L9 9.7V15H7V9.7l-4.6 2.7-1-1.8L6 8 1.4 5.4l1-1.8L7 6.3z" />, size),
  heart: ({ size }: P) => box(<path d="M8 14.5l-1-.9C3.3 10.3 1 8.2 1 5.6 1 3.5 2.6 2 4.6 2c1.2 0 2.4.6 3.4 1.5C9 2.6 10.2 2 11.4 2 13.4 2 15 3.5 15 5.6c0 2.6-2.3 4.7-6 8z" />, size),
  tachometer: ({ size }: P) => box(<path d="M8 2a7 7 0 00-7 7c0 1.6.5 3 1.4 4.2h11.2A7 7 0 008 2zm3.4 3.6l-2.6 4.1a1.3 1.3 0 11-1.1-.7z" />, size),
  list: ({ size }: P) => box(<path d="M1 2.5h2v2H1zm4 0h10v2H5zm-4 4.5h2v2H1zm4 0h10v2H5zm-4 4.5h2v2H1zm4 0h10v2H5z" />, size),
  cogs: ({ size }: P) => box(<path d="M7 1h2l.4 1.8 1.2.5 1.6-1 1.4 1.4-1 1.6.5 1.2L15 7v2l-1.8.4-.5 1.2 1 1.6-1.4 1.4-1.6-1-1.2.5L9 15H7l-.4-1.8-1.2-.5-1.6 1-1.4-1.4 1-1.6-.5-1.2L1 9V7l1.8-.4.5-1.2-1-1.6 1.4-1.4 1.6 1 1.2-.5zm1 4.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />, size),
  bell: ({ size }: P) => box(<path d="M8 15a1.8 1.8 0 001.8-1.7H6.2A1.8 1.8 0 008 15zm5-4.2V7.2c0-2.5-1.5-4.5-4-5V1.5H7v.7c-2.5.5-4 2.5-4 5v3.6L1.5 12.3v.7h13v-.7z" />, size),
  book: ({ size }: P) => box(<path d="M2 2.5C2 1.7 2.7 1 3.5 1H14v11H3.5a.5.5 0 000 1H14v2H3.5A1.5 1.5 0 012 13.5z" />, size),
  signOut: ({ size }: P) => box(<path d="M6 2H2v12h4v-1.6H3.6V3.6H6zm4 2.2L8.9 5.3 10.8 7.2H5v1.6h5.8l-1.9 1.9L10 11.8 13.8 8z" />, size),
  signIn: ({ size }: P) => box(<path d="M10 2h4v12h-4v-1.6h2.4V3.6H10zM6 4.2L4.9 5.3l1.9 1.9H1v1.6h5.8L4.9 10.7 6 11.8 9.8 8z" />, size),
  lock: ({ size }: P) => box(<path d="M4 7V5a4 4 0 018 0v2h1v8H3V7zm2 0h4V5a2 2 0 00-4 0z" />, size),
  wrench: ({ size }: P) => box(<path d="M14.6 3.8l-2.2 2.2-2-.4-.4-2 2.2-2.2A4 4 0 006.8 6.6L1.4 12a1.4 1.4 0 002 2L8.8 8.6a4 4 0 005.8-4.8z" />, size),
  exchange: ({ size }: P) => box(<path d="M11 1.5L14.5 5 11 8.5V6H2V4h9zM5 7.5V10h9v2H5v2.5L1.5 11z" />, size),
  check: ({ size }: P) => box(<path d="M6 11.2L2.6 7.8 1.2 9.2 6 14l8.8-8.8-1.4-1.4z" />, size),
  play: ({ size }: P) => box(<path d="M3.5 2v12L13.5 8z" />, size),
  bullseye: ({ size }: P) => box(<path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm0 2a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2z" />, size),
  copy: ({ size }: P) => box(<path d="M5 1h8.5v10.5H11V13H2.5V3.5H5zm1.2 1.2v8.1h6.1V2.2zM3.7 4.7v7.1h6.1v-.3H5V4.7z" />, size),
};

/** The Orca whale (navbar brand / home illustration). */
export function Whale(props: { size?: number; belly?: string; body?: string }) {
  const s = props.size ?? 32;
  return (
    <svg width={s} height={s * 0.62} viewBox="0 0 100 62" aria-hidden="true">
      <path
        d="M4 40C12 18 38 6 64 12c12 3 22 11 27 21-6-2-11-1-15 3l7 10c-14 6-33 8-49 3L22 58l-3-13C13 45 8 43 4 40z"
        fill={props.body ?? '#ffffff'}
      />
      <path d="M24 45c13 4 30 4 44-1" stroke={props.belly ?? '#5ab7ee'} strokeWidth="6" fill="none" strokeLinecap="round" />
      <ellipse cx="64" cy="27" rx="7" ry="3.2" fill={props.body && props.body !== '#ffffff' ? '#ffffff' : '#353d47'} transform="rotate(-12 64 27)" />
      <circle cx="74" cy="26" r="1.8" fill="#353d47" />
      <path d="M48 12c2-8 6-11 10-11-1 4-1 8 1 12" fill={props.body ?? '#ffffff'} />
    </svg>
  );
}
