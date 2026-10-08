/** Windows 11 Fluent-style file & folder icons for File Explorer (inline SVG). */
import type { FsEntry } from '../../shell/files';

export function Chevron() {
  return (
    <svg className="fx-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Folder({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 6.2C2 5 3 4 4.2 4h5l2.2 2.2h8.4C21 6.2 22 7.2 22 8.4v9.4c0 1.2-1 2.2-2.2 2.2H4.2C3 20 2 19 2 17.8z" fill="#e8a91c" />
      <path d="M2 9c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v8.8c0 1.2-1 2.2-2.2 2.2H4.2C3 20 2 19 2 17.8z" fill="#ffc83d" />
    </svg>
  );
}

function Doc({ size, color, label }: { size: number; color: string; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 2h9l5 5v13.5c0 .8-.7 1.5-1.5 1.5H5.5C4.7 22 4 21.3 4 20.5v-17C4 2.7 4.7 2 5.5 2z" fill="#fff" stroke="#8a8a8a" strokeWidth=".8" />
      <path d="M14.5 2v4c0 .6.4 1 1 1h4" fill="#e6e6e6" stroke="#8a8a8a" strokeWidth=".8" />
      {label ? (
        <>
          <rect x="2.5" y="12" width="13" height="7" rx="1" fill={color} />
          <text x="9" y="17.6" textAnchor="middle" fontSize="5.2" fontWeight="700" fill="#fff" fontFamily="Segoe UI, sans-serif">
            {label}
          </text>
        </>
      ) : (
        <path d="M7 10.5h9M7 13h9M7 15.5h9M7 18h6" stroke={color} strokeWidth="1" />
      )}
    </svg>
  );
}

function ImageIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="16" rx="2" fill="#fff" stroke="#8a8a8a" strokeWidth=".8" />
      <rect x="4" y="5.5" width="16" height="13" rx="1" fill="#cfe8fb" />
      <circle cx="16" cy="9" r="1.8" fill="#ffc83d" />
      <path d="M4 18.5l5.2-6.2 3.6 4 2.4-2.6 4.8 4.8z" fill="#3a96dd" />
      <path d="M4 18.5l5.2-6.2 3.6 4" fill="none" stroke="#1f6fb2" strokeWidth=".6" />
    </svg>
  );
}

export function FileIcon({ entry, size = 16 }: { entry: FsEntry; size?: number }) {
  if (entry.dir) return <Folder size={size} />;
  const n = entry.name.toLowerCase();
  if (/\.(png|jpe?g|gif|bmp|webp)$/.test(n) || entry.content.startsWith('img:')) return <ImageIcon size={size} />;
  if (n.endsWith('.json')) return <Doc size={size} color="#c19c00" label="{ }" />;
  if (n.endsWith('.java')) return <Doc size={size} color="#c74634" label="J" />;
  if (n.endsWith('.xml')) return <Doc size={size} color="#e66c22" label="XML" />;
  if (n.endsWith('.properties') || n.endsWith('.gradle') || n.endsWith('.kts')) return <Doc size={size} color="#5c6bc0" label="CFG" />;
  if (/\.(swift|cs|py|go|js|ts|sh)$/.test(n)) return <Doc size={size} color="#2b7a4b" label="</>" />;
  return <Doc size={size} color="#9a9a9a" />;
}

export function NavIcon({ kind }: { kind: 'home' | 'desktop' | 'downloads' | 'pictures' | 'folder' | 'recycle' | 'docs' | 'pc' }) {
  switch (kind) {
    case 'home':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 7.2L8 2l6 5.2V14H2z" fill="#ffc83d" stroke="#c48b00" strokeWidth=".8" strokeLinejoin="round" />
          <rect x="6.3" y="9.5" width="3.4" height="4.5" fill="#c48b00" />
        </svg>
      );
    case 'desktop':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="9" rx="1" fill="#3a96dd" stroke="#1f6fb2" strokeWidth=".8" />
          <path d="M5.5 14h5M8 11.5V14" stroke="#555" strokeWidth="1.1" />
        </svg>
      );
    case 'downloads':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.5v9M4.5 7L8 10.5 11.5 7" fill="none" stroke="#0f9d58" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2.5 13.5h11" stroke="#0f9d58" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'pictures':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="#cfe8fb" stroke="#1f6fb2" strokeWidth=".8" />
          <circle cx="10.5" cy="6" r="1.3" fill="#ffc83d" />
          <path d="M2 13l4-4.5 3 3 1.8-1.8L14 13z" fill="#3a96dd" />
        </svg>
      );
    case 'docs':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 1.5h6l3 3v10h-9z" fill="#fff" stroke="#5c6bc0" strokeWidth=".9" strokeLinejoin="round" />
          <path d="M5.5 7.5h5M5.5 9.5h5M5.5 11.5h3.5" stroke="#5c6bc0" strokeWidth=".9" />
        </svg>
      );
    case 'recycle':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 4.5h9l-.8 9.2c0 .5-.5.8-1 .8H5.3c-.5 0-1-.3-1-.8z" fill="#dbe9f5" stroke="#6d8aa5" strokeWidth=".8" />
          <path d="M2.5 4.5h11M6 4.5V3h4v1.5" stroke="#6d8aa5" strokeWidth=".9" fill="none" />
        </svg>
      );
    case 'pc':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="8.5" rx="1" fill="#5aa9e6" stroke="#1f6fb2" strokeWidth=".8" />
          <path d="M4.5 14h7M8 11v3" stroke="#555" strokeWidth="1.1" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 6.2C2 5 3 4 4.2 4h5l2.2 2.2h8.4C21 6.2 22 7.2 22 8.4v9.4c0 1.2-1 2.2-2.2 2.2H4.2C3 20 2 19 2 17.8z" fill="#e8a91c" />
          <path d="M2 9c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v8.8c0 1.2-1 2.2-2.2 2.2H4.2C3 20 2 19 2 17.8z" fill="#ffc83d" />
        </svg>
      );
  }
}
