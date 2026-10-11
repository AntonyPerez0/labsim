/** Codicon-style line icons (24×24, currentColor). */
import type { ReactNode } from 'react';

function I({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconFiles = () => (
  <I>
    <path d="M14 3H7.5A1.5 1.5 0 006 4.5v12A1.5 1.5 0 007.5 18h9a1.5 1.5 0 001.5-1.5V7z" />
    <path d="M14 3v4h4M3 7.5v12A1.5 1.5 0 004.5 21H14" />
  </I>
);
export const IconSearch = () => (
  <I>
    <circle cx="13.5" cy="9.5" r="5.5" />
    <path d="M9.5 13.5 4 19" />
  </I>
);
export const IconScm = () => (
  <I>
    <circle cx="7" cy="5.5" r="2" />
    <circle cx="7" cy="18.5" r="2" />
    <circle cx="17" cy="8.5" r="2" />
    <path d="M7 7.5v9M17 10.5c0 4-10 2.5-10 6" />
  </I>
);
export const IconRun = () => (
  <I>
    <path d="M8 5v14l11-7z" />
    <path d="M4 18.5l2-1.5M4 14h2.5" />
  </I>
);
export const IconFlask = () => (
  <I>
    <path d="M9.5 3h5M10.5 3v6L5 19a1.3 1.3 0 001.2 2h11.6A1.3 1.3 0 0019 19l-5.5-10V3" />
    <path d="M7.5 15h9" />
  </I>
);
export const IconGear = () => (
  <I>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </I>
);
export const IconAccount = () => (
  <I>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </I>
);
export const IconBranch = ({ size = 14 }: { size?: number }) => (
  <I size={size}>
    <circle cx="7" cy="5.5" r="2" />
    <circle cx="7" cy="18.5" r="2" />
    <circle cx="17" cy="8.5" r="2" />
    <path d="M7 7.5v9M17 10.5c0 4-10 2.5-10 6" />
  </I>
);
export const IconSync = ({ size = 14 }: { size?: number }) => (
  <I size={size}>
    <path d="M19 12a7 7 0 01-12.2 4.7M5 12a7 7 0 0112.2-4.7" />
    <path d="M17.5 3.5v4h-4M6.5 20.5v-4h4" />
  </I>
);
export const IconCheck = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </I>
);
export const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 80ms' }}>
    <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);
export const IconJson = () => (
  <span className="vsc-fileicon vsc-fileicon--json" aria-hidden="true">
    {'{}'}
  </span>
);
export function FileIcon({ name }: { name: string }) {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (ext === 'json') return <IconJson />;
  const cls = ext === 'md' ? 'md' : ext === 'py' ? 'py' : ext === 'java' ? 'java' : ext === 'cs' ? 'cs' : ext === 'swift' ? 'swift' : ext === 'properties' || ext === 'yml' || ext === 'yaml' ? 'cfg' : 'txt';
  const glyph = ext === 'md' ? 'M↓' : ext === 'py' ? 'py' : ext === 'java' ? 'J' : ext === 'cs' ? 'C#' : ext === 'swift' ? 'S' : cls === 'cfg' ? '⚙' : '≡';
  return (
    <span className={`vsc-fileicon vsc-fileicon--${cls}`} aria-hidden="true">
      {glyph}
    </span>
  );
}
