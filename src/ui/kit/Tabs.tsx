/**
 * Underline tab bar (`Tabs`) and a vertical nav list (`NavList`).
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { kitSound } from './sound';

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  icon?: IconName | string;
  badge?: ReactNode;
  disabled?: boolean;
}

export function Tabs<T extends string>({ tabs, value, onChange, size = 'md', className }: { tabs: readonly TabDef<T>[]; value: T; onChange: (id: T) => void; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div className={`k-tabs k-tabs--${size}${className ? ` ${className}` : ''}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
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
