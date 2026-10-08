/** GIMP menu bar with nested submenus (Apps §6.1 `File Edit Select View Image Layer Colors Tools Filters Windows Help`). */
import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?(): void;
  disabled?: boolean;
  submenu?: MenuItem[];
  separator?: boolean;
  checked?: boolean;
  hint?: string;
}

export interface MenuDef {
  label: string;
  items: MenuItem[];
}

function Items(props: { items: MenuItem[]; close(): void }) {
  const [sub, setSub] = useState<number | null>(null);
  return (
    <div className="gimp-menu" role="menu">
      {props.items.map((it, i) =>
        it.separator ? (
          <div key={i} className="gimp-menu-sep" role="separator" />
        ) : (
          <div key={i} className="gimp-menu-entry" onMouseEnter={() => setSub(it.submenu ? i : null)}>
            <button
              type="button"
              role="menuitem"
              className="gimp-menu-item"
              disabled={it.disabled}
              data-hint={it.hint}
              aria-haspopup={it.submenu ? 'menu' : undefined}
              onClick={() => {
                if (it.submenu) {
                  setSub(i);
                  return;
                }
                props.close();
                it.onClick?.();
              }}
            >
              <span className="gimp-menu-check">{it.checked ? '✓' : ''}</span>
              <span className="gimp-menu-label">{it.label}</span>
              <span className="gimp-menu-key">{it.submenu ? '▸' : it.shortcut ?? ''}</span>
            </button>
            {it.submenu && sub === i ? (
              <div className="gimp-submenu">
                <Items items={it.submenu} close={props.close} />
              </div>
            ) : null}
          </div>
        ),
      )}
    </div>
  );
}

export function MenuBar(props: { menus: MenuDef[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open == null) return;
    const off = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(null);
      }
    };
    window.addEventListener('pointerdown', off);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  return (
    <div className="gimp-menubar" ref={ref} role="menubar">
      {props.menus.map((m, i) => (
        <div key={m.label} className="gimp-menubar-entry">
          <button
            type="button"
            className="gimp-menubar-item"
            aria-expanded={open === i}
            data-hint={m.label === 'File' ? 'gimp.fileOpen' : undefined}
            onClick={() => setOpen((o) => (o === i ? null : i))}
            onMouseEnter={() => open != null && setOpen(i)}
          >
            <u>{m.label[0]}</u>
            {m.label.slice(1)}
          </button>
          {open === i ? <Items items={m.items} close={() => setOpen(null)} /> : null}
        </div>
      ))}
    </div>
  );
}

/** Context menu at a screen position. */
export function ContextMenu(props: { x: number; y: number; items: MenuItem[]; close(): void; origin: DOMRect | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) props.close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        props.close();
      }
    };
    window.addEventListener('pointerdown', off);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', key, true);
    };
  }, [props]);
  const ox = props.origin?.left ?? 0;
  const oy = props.origin?.top ?? 0;
  return (
    <div ref={ref} style={{ position: 'absolute', left: props.x - ox, top: props.y - oy, zIndex: 50 }}>
      <Items items={props.items} close={props.close} />
    </div>
  );
}
