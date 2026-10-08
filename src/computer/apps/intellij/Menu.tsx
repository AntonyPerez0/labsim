/** Darcula popup menus (main menu dropdowns, context menus) with submenus and keyboard navigation. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIdeRoot } from './rootContext';
import { IcChevronRight } from './icons';

export interface MenuItem {
  label?: string;
  kbd?: string;
  icon?: ReactNode;
  disabled?: boolean;
  separator?: boolean;
  onClick?: () => void;
  submenu?: MenuItem[];
  hint?: string;
}

export function MenuList({ items, x, y, onClose, autoFocus = true }: { items: MenuItem[]; x: number; y: number; onClose: () => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ index: number; x: number; y: number } | null>(null);
  const [pos, setPos] = useState({ x, y });
  const portalRoot = useIdeRoot();

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // Keep inside the IDE root.
  useEffect(() => {
    const el = ref.current;
    const root = el?.closest('.ij-root') as HTMLElement | null;
    if (!el || !root) return;
    const r = root.getBoundingClientRect();
    const m = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (m.right > r.right) nx = Math.max(0, x - (m.right - r.right) - 4);
    if (m.bottom > r.bottom) ny = Math.max(0, y - (m.bottom - r.bottom) - 4);
    if (nx !== x || ny !== y) setPos({ x: nx, y: ny });
  }, [x, y]);

  const enabled = items.map((it, i) => (!it.separator && !it.disabled ? i : -1)).filter((i) => i >= 0);

  const openSub = (i: number) => {
    const el = ref.current?.querySelectorAll<HTMLElement>('[data-mi]')[i];
    const root = ref.current?.closest('.ij-root') as HTMLElement | null;
    if (!el || !root) return;
    const r = el.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    setSub({ index: i, x: r.right - rr.left - 2, y: r.top - rr.top - 4 });
  };

  const activate = (i: number) => {
    const it = items[i];
    if (!it || it.disabled || it.separator) return;
    if (it.submenu) {
      setActive(i);
      openSub(i);
      return;
    }
    onClose();
    it.onClick?.();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (sub) return;
    const cur = enabled.indexOf(active);
    if (e.key === 'ArrowDown') setActive(enabled[(cur + 1) % enabled.length] ?? -1);
    else if (e.key === 'ArrowUp') setActive(enabled[(cur - 1 + enabled.length) % enabled.length] ?? -1);
    else if (e.key === 'Enter' || e.key === ' ') activate(active);
    else if (e.key === 'ArrowRight' && items[active]?.submenu) activate(active);
    else if (e.key === 'Escape' || e.key === 'ArrowLeft') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const content = (
    <>
      <div className="ij-menu" role="menu" tabIndex={-1} ref={ref} style={{ left: pos.x, top: pos.y }} onKeyDown={onKeyDown} onMouseDown={(e) => e.stopPropagation()}>
        {items.map((it, i) =>
          it.separator ? (
            <div key={i} className="ij-menu-sep" role="separator" />
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              data-mi
              className={`ij-menu-item${i === active ? ' ij-active' : ''}`}
              disabled={it.disabled}
              title={it.hint}
              onMouseEnter={() => {
                setActive(i);
                if (it.submenu) openSub(i);
                else setSub(null);
              }}
              onClick={() => activate(i)}
            >
              {it.icon ? <span className="ij-menu-ico">{it.icon}</span> : null}
              {it.label}
              {it.kbd ? <span className="ij-kbd">{it.kbd}</span> : null}
              {it.submenu ? (
                <span className="ij-kbd">
                  <IcChevronRight size={12} />
                </span>
              ) : null}
            </button>
          ),
        )}
      </div>
      {sub && items[sub.index]?.submenu ? (
        <MenuList
          items={items[sub.index].submenu!}
          x={sub.x}
          y={sub.y}
          onClose={() => {
            setSub(null);
            onClose();
          }}
        />
      ) : null}
    </>
  );
  return portalRoot ? createPortal(content, portalRoot) : content;
}

/** Full-area click catcher that closes a menu. */
export function MenuCatcher({ onClose, top = 0 }: { onClose: () => void; top?: number }) {
  const root = useIdeRoot();
  const el = <div style={{ position: 'absolute', inset: 0, top, zIndex: 59 }} onMouseDown={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />;
  return root ? createPortal(el, root) : el;
}
