/**
 * Buttons. Every button plays the UI click (via the kit sound hook) and can show its keyboard
 * shortcut as a key glyph (`kbd="E"`), as GP §2.4.1 asks for drill/menu buttons.
 */
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Kbd } from './Kbd';
import { kitSound } from './sound';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'game' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName | string;
  iconRight?: IconName | string;
  /** Keyboard shortcut glyph shown at the right edge. */
  kbd?: string;
  block?: boolean;
  /** Mute the click sound (e.g. buttons that play their own result sound). */
  silent?: boolean;
  active?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Button({ variant = 'secondary', size = 'md', icon, iconRight, kbd, block, silent, active, className, children, onClick, type, ...rest }: ButtonProps) {
  const cls = ['k-btn', `k-btn--${variant}`, `k-btn--${size}`, block ? 'k-btn--block' : '', active ? 'is-active' : '', !children ? 'k-btn--icon-only' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type ?? 'button'}
      className={cls}
      onClick={(e) => {
        if (!silent) kitSound('ui-click');
        onClick?.(e);
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'lg' ? 20 : size === 'sm' ? 14 : 16} /> : null}
      {children ? <span className="k-btn__label">{children}</span> : null}
      {iconRight ? <Icon name={iconRight} size={size === 'lg' ? 20 : 16} /> : null}
      {kbd ? <Kbd k={kbd} size="sm" /> : null}
    </button>
  );
}

export function IconButton({ icon, label, size = 'md', variant = 'ghost', ...rest }: Omit<ButtonProps, 'children' | 'icon'> & { icon: IconName | string; label: string }) {
  return <Button icon={icon} size={size} variant={variant} aria-label={label} title={rest.title ?? label} {...rest} />;
}
