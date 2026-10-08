/**
 * Modal dialog and side drawer. Escape handling is owned by the app's global hotkeys (one place
 * decides what Esc closes), so these components only render; pass `onClose` for the close button
 * and backdrop click.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { IconButton } from './Button';

export function Modal({ children, onClose, width = 720, className, labelledBy, backdrop = 'dim', closeOnBackdrop = false, style }: {
  children: ReactNode;
  onClose?: () => void;
  width?: number | string;
  className?: string;
  labelledBy?: string;
  backdrop?: 'dim' | 'blur' | 'none';
  closeOnBackdrop?: boolean;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Move focus into the dialog so keyboard users land inside (without scrolling the page).
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, []);
  return (
    <div className={`k-modal-backdrop k-modal-backdrop--${backdrop}`} onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={`k-modal${className ? ` ${className}` : ''}`} style={{ width, ...style }}>
        {onClose ? <IconButton className="k-modal__close" icon="x" label="Close (Esc)" size="sm" onClick={onClose} /> : null}
        {children}
      </div>
    </div>
  );
}

export function Drawer({ children, side = 'right', width = 480, className, style }: { children: ReactNode; side?: 'left' | 'right'; width?: number | string; className?: string; style?: CSSProperties }) {
  return (
    <aside className={`k-drawer k-drawer--${side}${className ? ` ${className}` : ''}`} style={{ width, ...style }}>
      {children}
    </aside>
  );
}
