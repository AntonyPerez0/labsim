/** Darcula modal dialog frame: title bar, body, footer; Esc cancels (consumed), Enter = default button. */
import { useEffect, useRef, type ReactNode } from 'react';

export interface DialogProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onCancel(): void;
  /** Enter (outside multi-line fields) triggers this. */
  onOk?(): void;
  width?: number;
  bodyPad?: boolean;
  label?: string;
}

export function Dialog({ title, children, footer, onCancel, onOk, width, bodyPad = true, label }: DialogProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not(:disabled):not([readonly]), textarea, select');
    (first ?? el).focus({ preventScroll: true });
  }, []);
  return (
    <div className="ij-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="ij-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
        tabIndex={-1}
        ref={ref}
        style={width ? { width } : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter' && onOk && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) {
            e.preventDefault();
            e.stopPropagation();
            onOk();
          } else e.stopPropagation();
        }}
      >
        <div className="ij-dialog-title">{title}</div>
        <div className="ij-dialog-body" style={bodyPad ? undefined : { padding: 0 }}>
          {children}
        </div>
        {footer ? <div className="ij-dialog-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Buttons({ ok, okLabel = 'OK', onOk, onCancel, okDisabled, extra }: { ok?: boolean; okLabel?: string; onOk?: () => void; onCancel: () => void; okDisabled?: boolean; extra?: ReactNode }) {
  return (
    <>
      {extra ? <span className="ij-foot-left">{extra}</span> : null}
      {ok !== false && onOk ? (
        <button type="button" className="ij-btn ij-default" disabled={okDisabled} onClick={onOk}>
          {okLabel}
        </button>
      ) : null}
      <button type="button" className="ij-btn" onClick={onCancel}>
        Cancel
      </button>
    </>
  );
}
