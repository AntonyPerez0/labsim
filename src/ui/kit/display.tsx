/**
 * Display primitives: progress bars, segmented meters, stars, chips, avatars, stats, spinners.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'grey' | 'gold' | 'cyan';

export function ProgressBar({ value, tone = 'green', height = 6, label, glow, className, style }: { value: number; tone?: Tone; height?: number; label?: ReactNode; glow?: boolean; className?: string; style?: CSSProperties }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={`k-progress k-tone-${tone}${glow ? ' k-progress--glow' : ''}${className ? ` ${className}` : ''}`} style={style}>
      {label ? <div className="k-progress__label">{label}</div> : null}
      <div className="k-progress__track" style={{ height }}>
        <div className="k-progress__fill" style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

/** Discrete segment meter (combo 8 segments, heat 5 pips, strikes 3). */
export function Meter({ total, filled, tone = 'green', size = 'md', broken, title }: { total: number; filled: number; tone?: Tone; size?: 'sm' | 'md'; broken?: boolean; title?: string }) {
  return (
    <div className={`k-meter k-meter--${size} k-tone-${tone}${broken ? ' is-broken' : ''}`} title={title} role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={filled}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`k-meter__seg${i < filled ? ' is-on' : ''}`} style={{ animationDelay: `${i * 25}ms` }} />
      ))}
    </div>
  );
}

export function Stars({ value, max = 3, size = 14, className }: { value: number; max?: number; size?: number; className?: string }) {
  return (
    <span className={`k-stars${className ? ` ${className}` : ''}`} aria-label={`${value} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" className={i < value ? 'is-on' : ''}>
          <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.6l6.1-.8z" />
        </svg>
      ))}
    </span>
  );
}

export function Chip({ children, tone = 'grey', icon, title, size = 'md', solid, className, style, onClick }: {
  children?: ReactNode;
  tone?: Tone;
  icon?: IconName | string;
  title?: string;
  size?: 'sm' | 'md';
  solid?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag className={`k-chip k-chip--${size} k-tone-${tone}${solid ? ' k-chip--solid' : ''}${onClick ? ' k-chip--btn' : ''}${className ? ` ${className}` : ''}`} title={title} style={style} onClick={onClick} type={onClick ? 'button' : undefined}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 11 : 13} stroke={2} /> : null}
      {children}
    </Tag>
  );
}

/** Portrait disc with initials in the person's colour (team.ts `color`). */
export function Avatar({ name, color, size = 40, ring, icon }: { name: string; color: string; size?: number; ring?: boolean; icon?: IconName | string }) {
  const initials = name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span className={`k-avatar${ring ? ' k-avatar--ring' : ''}`} style={{ width: size, height: size, '--av': color, fontSize: Math.round(size * 0.38) } as CSSProperties}>
      {icon ? <Icon name={icon} size={Math.round(size * 0.5)} /> : initials}
    </span>
  );
}

export function Stat({ label, value, sub, tone, icon, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: IconName | string; className?: string }) {
  return (
    <div className={`k-stat${tone ? ` k-tone-${tone}` : ''}${className ? ` ${className}` : ''}`}>
      <div className="k-stat__label">
        {icon ? <Icon name={icon} size={13} /> : null}
        {label}
      </div>
      <div className="k-stat__value tnum">{value}</div>
      {sub ? <div className="k-stat__sub">{sub}</div> : null}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="k-spinner" style={{ width: size, height: size }} aria-label="Loading" />;
}

export function MedalBadge({ medal, size = 22 }: { medal: 'bronze' | 'silver' | 'gold' | null; size?: number }) {
  if (!medal) return <span className="k-medal k-medal--none" style={{ width: size, height: size }} title="No medal yet" />;
  return (
    <span className={`k-medal k-medal--${medal}`} style={{ width: size, height: size }} title={`${medal[0]!.toUpperCase()}${medal.slice(1)} medal`}>
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62}>
        <path d="M12 4.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" fill="currentColor" />
      </svg>
    </span>
  );
}

/** The "Illustrative (sim only)" badge (curriculum † / GP [illus.]). */
export function IllustrativeBadge({ compact }: { compact?: boolean }) {
  return (
    <span className="k-illus" title="Illustrative (sim only): invented for the simulation where the reference is silent. Don't take it as a real-lab fact.">
      {compact ? '†' : 'Illustrative (sim only)'}
    </span>
  );
}

/** Orca robot status pill with colour-blind glyphs (GP §6.1). */
export function StatusPill({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const key = status.toUpperCase().replace(/\s+/g, '_');
  const meta: Record<string, { label: string; glyph: string; cls: string }> = {
    AVAILABLE: { label: 'Available', glyph: '●', cls: 'available' },
    UNAVAILABLE: { label: 'Unavailable', glyph: '◆', cls: 'unavailable' },
    OFFLINE: { label: 'Offline', glyph: '○', cls: 'offline' },
    CONNECTION_FAILED: { label: 'Connection Failed', glyph: '✕', cls: 'connfailed' },
    RESERVED: { label: 'Reserved', glyph: '■', cls: 'reserved' },
  };
  const m = meta[key] ?? { label: status, glyph: '●', cls: 'offline' };
  return (
    <span className={`k-status k-status--${m.cls} k-status--${size}`}>
      <span className="k-status__glyph" aria-hidden>
        {m.glyph}
      </span>
      {m.label}
    </span>
  );
}
