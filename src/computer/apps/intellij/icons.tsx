/**
 * IntelliJ-style 16 px icons (simplified, drawn here — no bitmaps). Colours follow the Darcula icon palette.
 */
import type { ReactElement } from 'react';
import type { NodeRole } from './projectModel';

type P = { size?: number; className?: string };
const S = ({ size = 16, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const IcFolder = ({ role, open, ...p }: P & { role?: NodeRole; open?: boolean }) => {
  const fill = role === 'source' ? '#4A90D9' : role === 'test' ? '#62B543' : role === 'package' ? '#87939A' : '#87939A';
  return (
    <S {...p}>
      <path d="M1.5 3.5h4.2l1.4 1.5h7.4v8.5h-13z" fill={fill} opacity={open ? 0.95 : 0.85} />
      {role === 'resources' ? (
        <g stroke="#E0B74A" strokeWidth="1">
          <path d="M3.5 8h9M3.5 10h9M3.5 12h9" />
        </g>
      ) : null}
      {role === 'package' ? <circle cx="8" cy="9.5" r="1.4" fill="#3C3F41" /> : null}
    </S>
  );
};

export const IcModule = (p: P) => (
  <S {...p}>
    <path d="M1.5 3.5h4.2l1.4 1.5h7.4v8.5h-13z" fill="#87939A" />
    <rect x="9" y="9" width="6" height="6" fill="#3592C4" />
  </S>
);

function badge(letter: string, bg: string, extra?: ReactElement) {
  return (p: P) => (
    <S {...p}>
      <circle cx="8" cy="8" r="6.5" fill={bg} />
      <text x="8" y="11.3" textAnchor="middle" fontSize="9.5" fontWeight="700" fontFamily="Segoe UI, Arial, sans-serif" fill="#2B2B2B">
        {letter}
      </text>
      {extra}
    </S>
  );
}

export const IcClass = badge('C', '#3592C4');
export const IcTestClass = badge('C', '#3592C4', <path d="M10.5 10.2v5.3l4.3-2.65z" fill="#59A869" stroke="#2B2B2B" strokeWidth=".6" />);
export const IcInterface = badge('I', '#59A869');
export const IcEnum = badge('E', '#B99BF8');

export const IcJson = (p: P) => (
  <S {...p}>
    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" fill="#3C3F41" stroke="#8D8D8D" />
    <text x="8" y="11" textAnchor="middle" fontSize="8" fontWeight="700" fontFamily="Consolas, monospace" fill="#E0B74A">
      {'{}'}
    </text>
  </S>
);
export const IcProperties = (p: P) => (
  <S {...p}>
    <rect x="2" y="1.5" width="11" height="13" rx="1" fill="#9AA7B0" opacity=".85" />
    <circle cx="11" cy="11" r="3.6" fill="#E0B74A" />
    <circle cx="11" cy="11" r="1.3" fill="#3C3F41" />
  </S>
);
export const IcXml = (p: P) => (
  <S {...p}>
    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" fill="#3C3F41" stroke="#8D8D8D" />
    <path d="M6 5L3.5 8 6 11M10 5l2.5 3L10 11" stroke="#E8BF6A" strokeWidth="1.4" fill="none" />
  </S>
);
export const IcYaml = (p: P) => (
  <S {...p}>
    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" fill="#3C3F41" stroke="#8D8D8D" />
    <text x="8" y="11" textAnchor="middle" fontSize="7" fontWeight="700" fontFamily="Segoe UI, Arial" fill="#CC7832">
      YML
    </text>
  </S>
);
export const IcMarkdown = (p: P) => (
  <S {...p}>
    <rect x="1" y="3" width="14" height="10" rx="1.5" fill="none" stroke="#9AA7B0" />
    <path d="M3 10.5v-5l2 2.4 2-2.4v5M10.5 5.5v5M8.8 8.8l1.7 1.8 1.7-1.8" stroke="#9AA7B0" strokeWidth="1.1" fill="none" />
  </S>
);
export const IcGroovy = badge('G', '#5CB0D9');
export const IcText = (p: P) => (
  <S {...p}>
    <path d="M3 1.5h7l3 3v10H3z" fill="#9AA7B0" opacity=".8" />
    <path d="M5 7h6M5 9h6M5 11h4" stroke="#3C3F41" />
  </S>
);
export const IcGitignore = (p: P) => (
  <S {...p}>
    <path d="M3 1.5h7l3 3v10H3z" fill="#9AA7B0" opacity=".8" />
    <circle cx="8" cy="9.5" r="3" fill="#F05033" />
  </S>
);
export const IcLibrary = (p: P) => (
  <S {...p}>
    <path d="M2 3h3v10H2zM6 3h3v10H6z" fill="#9AA7B0" />
    <path d="M10 3.5l2.6-.8 2.4 9.6-2.6.7z" fill="#9AA7B0" />
  </S>
);
export const IcScratch = (p: P) => (
  <S {...p}>
    <path d="M2 3h12v10H2z" fill="none" stroke="#9AA7B0" />
    <path d="M4 6l2 2-2 2M7.5 10.5H11" stroke="#9AA7B0" fill="none" />
  </S>
);

export function FileIcon({ path, test }: { path: string; test?: boolean }) {
  const name = path.split('/').pop() ?? path;
  if (name.endsWith('.java')) return test ? <IcTestClass /> : <IcClass />;
  if (name.endsWith('.json')) return <IcJson />;
  if (name.startsWith('config.properties') || name.endsWith('.properties')) return <IcProperties />;
  if (name.endsWith('.xml')) return <IcXml />;
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return <IcYaml />;
  if (name.endsWith('.md')) return <IcMarkdown />;
  if (name.endsWith('.groovy') || name === 'Jenkinsfile') return <IcGroovy />;
  if (name === '.gitignore') return <IcGitignore />;
  return <IcText />;
}

export const IcRun = (p: P) => (
  <S {...p}>
    <path d="M4 2.5v11l9-5.5z" fill="#59A869" />
  </S>
);
export const IcDebug = (p: P) => (
  <S {...p}>
    <ellipse cx="8" cy="9.5" rx="3.6" ry="4.5" fill="#59A869" />
    <path d="M8 5V14M2.5 7.5l2 1M13.5 7.5l-2 1M2.5 12l2-1M13.5 12l-2-1M6 3.5l1 1.5M10 3.5l-1 1.5" stroke="#59A869" strokeWidth="1.2" />
    <path d="M8 5.5v8.5" stroke="#3C3F41" />
  </S>
);
export const IcStop = (p: P & { active?: boolean }) => (
  <S {...p}>
    <rect x="3" y="3" width="10" height="10" rx="1" fill={p.active ? '#C75450' : '#6E6E6E'} />
  </S>
);
export const IcRerun = (p: P) => (
  <S {...p}>
    <path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2" stroke="#59A869" strokeWidth="1.6" fill="none" />
    <path d="M12.8 1.8v3.6H9.2z" fill="#59A869" />
  </S>
);
export const IcHammer = (p: P) => (
  <S {...p}>
    <path d="M2.5 13.5l6-6" stroke="#59A869" strokeWidth="2" />
    <path d="M7 3l4-1.5 3.5 3.5-1.5 1.5-1.2-1.2-2.3 2.3L7 5z" fill="#59A869" />
  </S>
);
export const IcUpdate = (p: P) => (
  <S {...p}>
    <path d="M12.5 3.5l-8 8M4.5 5.5v6h6" stroke="#3592C4" strokeWidth="1.6" fill="none" />
  </S>
);
export const IcCommit = (p: P) => (
  <S {...p}>
    <path d="M2.5 8.5l3.5 3.5 7.5-8" stroke="#59A869" strokeWidth="1.8" fill="none" />
  </S>
);
export const IcPush = (p: P) => (
  <S {...p}>
    <path d="M3.5 12.5l8-8M5.5 4.5h6v6" stroke="#59A869" strokeWidth="1.6" fill="none" />
  </S>
);
export const IcHistory = (p: P) => (
  <S {...p}>
    <circle cx="8" cy="8" r="5.6" stroke="#AFB1B3" strokeWidth="1.3" fill="none" />
    <path d="M8 4.5V8l2.5 1.5" stroke="#AFB1B3" strokeWidth="1.3" fill="none" />
  </S>
);
export const IcRollback = (p: P) => (
  <S {...p}>
    <path d="M4 6.5h6a3.5 3.5 0 0 1 0 7H6" stroke="#AFB1B3" strokeWidth="1.4" fill="none" />
    <path d="M6.5 3.5L3.5 6.5l3 3" stroke="#AFB1B3" strokeWidth="1.4" fill="none" />
  </S>
);
export const IcBranch = (p: P) => (
  <S {...p}>
    <circle cx="4.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" />
    <circle cx="4.5" cy="12.5" r="1.6" fill="none" stroke="currentColor" />
    <circle cx="11.5" cy="5.5" r="1.6" fill="none" stroke="currentColor" />
    <path d="M4.5 5.1v5.8M11.5 7.1c0 2.4-3.5 2.2-6.4 4" stroke="currentColor" fill="none" />
  </S>
);
export const IcChevronDown = (p: P) => (
  <S {...p}>
    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </S>
);
export const IcChevronRight = (p: P) => (
  <S {...p}>
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </S>
);
export const IcClose = (p: P) => (
  <S {...p}>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.2" />
  </S>
);
export const IcSearch = (p: P) => (
  <S {...p}>
    <circle cx="6.8" cy="6.8" r="4.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
    <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.5" />
  </S>
);
export const IcGear = (p: P) => (
  <S {...p}>
    <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M8 1.8v2.1M8 12.1v2.1M1.8 8h2.1M12.1 8h2.1M3.6 3.6l1.5 1.5M10.9 10.9l1.5 1.5M3.6 12.4l1.5-1.5M10.9 5.1l1.5-1.5" stroke="currentColor" strokeWidth="1.4" />
  </S>
);
export const IcError = (p: P) => (
  <S {...p}>
    <circle cx="8" cy="8" r="6" fill="#C75450" />
    <path d="M8 4.5v4.5M8 10.6v1.2" stroke="#fff" strokeWidth="1.6" />
  </S>
);
export const IcWarning = (p: P) => (
  <S {...p}>
    <path d="M8 1.8l6.6 12H1.4z" fill="#F0A732" />
    <path d="M8 6v4M8 11.4v1.2" stroke="#2B2B2B" strokeWidth="1.5" />
  </S>
);
export const IcCheck = (p: P) => (
  <S {...p}>
    <path d="M3 8.5l3 3 7-7.5" stroke="#5FB15F" strokeWidth="1.8" fill="none" />
  </S>
);
export const IcEye = (p: P) => (
  <S {...p}>
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="#8C8C8C" strokeWidth="1.2" />
    <circle cx="8" cy="8" r="2" fill="#8C8C8C" />
  </S>
);
export const IcBulb = (p: P) => (
  <S {...p}>
    <path d="M8 1.8a4.2 4.2 0 0 0-2.4 7.6V11h4.8V9.4A4.2 4.2 0 0 0 8 1.8z" fill="#F4C82D" />
    <path d="M6 12.3h4M6.5 14h3" stroke="#AFB1B3" strokeWidth="1.1" />
  </S>
);
export const IcBulbRed = (p: P) => (
  <S {...p}>
    <path d="M8 1.8a4.2 4.2 0 0 0-2.4 7.6V11h4.8V9.4A4.2 4.2 0 0 0 8 1.8z" fill="#E05555" />
    <path d="M6 12.3h4M6.5 14h3" stroke="#AFB1B3" strokeWidth="1.1" />
  </S>
);
export const IcTerminal = (p: P) => (
  <S {...p}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke="currentColor" />
    <path d="M4 6l2.5 2L4 10M7.5 10.5h4" stroke="currentColor" fill="none" />
  </S>
);
export const IcProblems = (p: P) => (
  <S {...p}>
    <circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 4.8v4M8 10.5v1" stroke="currentColor" strokeWidth="1.4" />
  </S>
);
export const IcProjectTw = (p: P) => (
  <S {...p}>
    <path d="M1.5 3.5h4.2l1.4 1.5h7.4v8.5h-13z" fill="none" stroke="currentColor" />
  </S>
);
export const IcTodo = (p: P) => (
  <S {...p}>
    <path d="M2 4h2M2 8h2M2 12h2M6 4h8M6 8h8M6 12h8" stroke="currentColor" />
  </S>
);
export const IcCodeWithMe = (p: P) => (
  <S {...p}>
    <circle cx="6.5" cy="5" r="2.6" fill="none" stroke="#AFB1B3" strokeWidth="1.2" />
    <path d="M1.8 14c.3-3 2.3-4.6 4.7-4.6 1.3 0 2.4.4 3.2 1.2" stroke="#AFB1B3" strokeWidth="1.2" fill="none" />
    <path d="M12 9v6M9 12h6" stroke="#59A869" strokeWidth="1.5" />
  </S>
);
export const IcIdeaLogo = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="ij-lg1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FC801D" />
        <stop offset=".5" stopColor="#FE2857" />
        <stop offset="1" stopColor="#087CFA" />
      </linearGradient>
    </defs>
    <path d="M8 4h40l12 12v44H4V8z" fill="url(#ij-lg1)" />
    <rect x="14" y="14" width="36" height="36" fill="#000" />
    <path d="M19 42h14v3H19z" fill="#fff" />
    <text x="19" y="35" fontSize="15" fontWeight="800" fontFamily="Segoe UI, Arial, sans-serif" fill="#fff">
      IJ
    </text>
  </svg>
);
export const IcLock = ({ locked, ...p }: P & { locked?: boolean }) => (
  <S {...p} size={13}>
    <rect x="3.5" y="7" width="9" height="7" rx="1" fill="none" stroke="#9a9a9a" />
    <path d={locked ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 4.9-.7'} fill="none" stroke="#9a9a9a" />
  </S>
);
