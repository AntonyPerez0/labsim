/**
 * Underline tab bar (`Tabs`) and a vertical nav list (`NavList`).
 * Tabs follow the WAI-ARIA tabs pattern: one tab stop (the selected tab), ←/→ (and Home/End) move
 * between tabs and select them.
 */
import type { KeyboardEvent, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { kitSound } from './sound';

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  icon?: IconName | string;
  badge?: ReactNode;
  disabled?: boolean;
}

/** Next enabled tab index for an arrow/Home/End key (null for other keys). Exported for tests. */
export function nextTabIndex(key: string, current: number, disabled: readonly boolean[]): number | null {
  const n = disabled.length;
  if (!n) return null;
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  if (key === 'Home' || key === 'End') {
    const order = key === 'Home' ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
    return order.find((i) => !disabled[i]) ?? null;
  }
  if (!step) return null;
  for (let k = 1; k <= n; k++) {
    const i = (((current + step * k) % n) + n) % n;
    if (!disabled[i]) return i;
  }
  return null;
}

export function Tabs<T extends string>({ tabs, value, onChange, size = 'md', className, ariaLabel }: { tabs: readonly TabDef<T>[]; value: T; onChange: (id: T) => void; size?: 'sm' | 'md'; className?: string; ariaLabel?: string }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = tabs.findIndex((t) => t.id === value);
    const next = nextTabIndex(e.key, cur, tabs.map((t) => !!t.disabled));
    if (next === null || next === cur) return;
    e.preventDefault();
    kitSound('ui-click');
    onChange(tabs[next]!.id);
    const btn = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    btn?.focus();
  };
  // Exactly one tab stop, even when `value` names no tab.
  const stop = tabs.some((t) => t.id === value) ? value : tabs.find((t) => !t.disabled)?.id;
  return (
    <div className={`k-tabs k-tabs--${size}${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          tabIndex={t.id === stop ? 0 : -1}
          disabled={t.disabled}
          className={`k-tab${t.id === value ? ' is-active' : ''}`}
          onClick={() => {
            if (t.id !== value) kitSound('ui-click');
            onChange(t.id);
          }}
        >
          {t.icon ? <Icon name={t.icon} size={15} /> : null}
          <span>{t.label}</span>
          {t.badge != null ? <span className="k-tab__badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export interface NavItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: IconName | string;
  meta?: ReactNode;
  disabled?: boolean;
}

export function NavList<T extends string>({ items, value, onChange, className }: { items: readonly NavItem<T>[]; value: T | null; onChange: (id: T) => void; className?: string }) {
  return (
    <nav className={`k-nav${className ? ` ${className}` : ''}`}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          disabled={it.disabled}
          aria-current={it.id === value ? 'page' : undefined}
          className={`k-nav__item${it.id === value ? ' is-active' : ''}`}
          onClick={() => {
            kitSound('ui-click');
            onChange(it.id);
          }}
        >
          {it.icon ? <Icon name={it.icon} size={16} /> : null}
          <span className="k-nav__label">{it.label}</span>
          {it.meta != null ? <span className="k-nav__meta">{it.meta}</span> : null}
        </button>
      ))}
    </nav>
  );
}
