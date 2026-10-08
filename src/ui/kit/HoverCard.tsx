/**
 * Hover card / tooltip: shows `content` in a floating card near the trigger after a short delay.
 * Rendered in a portal on `document.body` with fixed positioning, flipped to stay on screen.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function HoverCard({ content, children, delay = 220, width = 320, className, inline = true }: {
  content: ReactNode | (() => ReactNode);
  children: ReactNode;
  delay?: number;
  width?: number;
  className?: string;
  inline?: boolean;
}) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({ left: -9999, top: -9999 });

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  }, [delay]);
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 90);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const t = triggerRef.current;
    const c = cardRef.current;
    if (!t || !c) return;
    const r = t.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = r.left + r.width / 2 - cr.width / 2;
    left = Math.max(8, Math.min(vw - cr.width - 8, left));
    let top = r.bottom + 8;
    if (top + cr.height > vh - 8) top = r.top - cr.height - 8;
    setPos({ left, top: Math.max(8, top) });
  }, [open]);

  const Tag = inline ? 'span' : 'div';
  return (
    <>
      <Tag
        ref={(el: HTMLElement | null) => {
          triggerRef.current = el;
        }}
        className={`k-hover-trigger${className ? ` ${className}` : ''}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </Tag>
      {open
        ? createPortal(
            <div ref={cardRef} className="k-hovercard" style={{ ...pos, width }} onMouseEnter={show} onMouseLeave={hide} role="tooltip">
              {typeof content === 'function' ? (content as () => ReactNode)() : content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
