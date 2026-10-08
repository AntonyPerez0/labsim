/**
 * Key glyph ("keycap"). Accepts display labels (`E`, `Esc`, `RMB`) or `KeyboardEvent.code`s
 * (`KeyE`, `Digit1`, `BracketRight`, `Mouse2`) and renders a compact cap.
 */
const CODE_LABELS: Record<string, string> = {
  Escape: 'Esc',
  Backquote: '`',
  BracketRight: ']',
  BracketLeft: '[',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: '⌫',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  Wheel: 'Wheel',
  Minus: '-',
  Equal: '=',
  Slash: '/',
  Comma: ',',
  Period: '.',
};

/** `KeyboardEvent.code` (or a label) → short display label. */
export function keyLabel(codeOrLabel: string): string {
  if (CODE_LABELS[codeOrLabel]) return CODE_LABELS[codeOrLabel];
  if (/^Key[A-Z]$/.test(codeOrLabel)) return codeOrLabel.slice(3);
  if (/^Digit\d$/.test(codeOrLabel)) return codeOrLabel.slice(5);
  if (/^Numpad\d$/.test(codeOrLabel)) return codeOrLabel.slice(6);
  return codeOrLabel;
}

export function Kbd({ k, size = 'md', tone, className }: { k: string; size?: 'sm' | 'md' | 'lg'; tone?: 'green' | 'amber' | 'muted'; className?: string }) {
  const label = keyLabel(k);
  const wide = label.length > 1;
  const mouse = label === 'LMB' || label === 'RMB' || label === 'MMB';
  return (
    <kbd className={`k-kbd k-kbd--${size}${wide ? ' k-kbd--wide' : ''}${tone ? ` k-kbd--${tone}` : ''}${mouse ? ' k-kbd--mouse' : ''}${className ? ` ${className}` : ''}`}>
      {mouse ? <MouseGlyph which={label} /> : label}
    </kbd>
  );
}

function MouseGlyph({ which }: { which: string }) {
  return (
    <svg width="12" height="15" viewBox="0 0 12 16" aria-label={which}>
      <rect x="1" y="1" width="10" height="14" rx="5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 1v6" stroke="currentColor" strokeWidth="1.3" />
      {which === 'LMB' ? <path d="M1.6 6.5V6a4.4 4.4 0 0 1 4.4-4.4V6.5z" fill="currentColor" /> : null}
      {which === 'RMB' ? <path d="M10.4 6.5V6A4.4 4.4 0 0 0 6 1.6V6.5z" fill="currentColor" /> : null}
    </svg>
  );
}
