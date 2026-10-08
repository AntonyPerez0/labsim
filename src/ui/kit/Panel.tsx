/**
 * Glass panels, cards and section headers.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Panel({ title, subtitle, icon, actions, children, className, style, tone = 'glass', padded = true, ...rest }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName | string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  tone?: 'glass' | 'solid' | 'flat';
  padded?: boolean;
} & Omit<HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={`k-panel k-panel--${tone}${padded ? '' : ' k-panel--flush'}${className ? ` ${className}` : ''}`} style={style} {...rest}>
      {title || actions ? (
        <header className="k-panel__head">
          {icon ? <Icon name={icon} size={16} className="k-panel__icon" /> : null}
          <div className="k-panel__titles">
            {title ? <h3 className="k-panel__title">{title}</h3> : null}
            {subtitle ? <div className="k-panel__subtitle">{subtitle}</div> : null}
          </div>
          {actions ? <div className="k-panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="k-panel__body">{children}</div>
    </section>
  );
}

export function Card({ children, className, interactive, selected, onClick, style, ...rest }: {
  children?: ReactNode;
  className?: string;
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLDivElement>, 'onClick'>) {
  return (
    <div
      className={`k-card${interactive || onClick ? ' k-card--interactive' : ''}${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`k-section${className ? ` ${className}` : ''}`}>
      <span className="k-section__label">{children}</span>
      <span className="k-section__rule" />
      {right ? <span className="k-section__right">{right}</span> : null}
    </div>
  );
}

export function EmptyState({ icon = 'info', title, children, action }: { icon?: IconName | string; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="k-empty">
      <div className="k-empty__icon">
        <Icon name={icon} size={22} />
      </div>
      <div className="k-empty__title">{title}</div>
      {children ? <div className="k-empty__body">{children}</div> : null}
      {action ? <div className="k-empty__action">{action}</div> : null}
    </div>
  );
}
