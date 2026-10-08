/**
 * Form controls: Toggle, Slider, Segmented, Select, TextField. Dark, compact, keyboard-friendly.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { kitSound } from './sound';

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label className={`k-toggle${disabled ? ' is-disabled' : ''}`} htmlFor={id}>
      <span className="k-toggle__text">
        {label ? <span className="k-toggle__label">{label}</span> : null}
        {hint ? <span className="k-toggle__hint">{hint}</span> : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`k-switch${checked ? ' is-on' : ''}`}
        onClick={() => {
          kitSound('ui-click');
          onChange(!checked);
        }}
      >
        <span className="k-switch__thumb" />
      </button>
    </label>
  );
}

export function Slider({ value, onChange, min, max, step = 0.01, label, format, disabled }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: ReactNode;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`k-slider${disabled ? ' is-disabled' : ''}`}>
      {label ? (
        <label className="k-slider__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="k-slider__row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ '--pct': `${pct}%` } as CSSProperties}
        />
        <output className="k-slider__value tnum" htmlFor={id}>
          {format ? format(value) : value}
        </output>
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, size = 'md', disabled, ariaLabel }: {
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className={`k-seg k-seg--${size}${disabled ? ' is-disabled' : ''}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          disabled={disabled || o.disabled}
          className={`k-seg__opt${o.value === value ? ' is-active' : ''}`}
          onClick={() => {
            kitSound('ui-click');
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange, disabled, ariaLabel, style }: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  return (
    <div className="k-select" style={style}>
      <select value={value} disabled={disabled} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="k-select__chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

export function TextField({ value, onChange, placeholder, maxLength, onEnter, autoFocus, mono, ariaLabel, icon, style, inputRef, onKeyDown }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  onEnter?: () => void;
  autoFocus?: boolean;
  mono?: boolean;
  ariaLabel?: string;
  icon?: ReactNode;
  style?: CSSProperties;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={`k-field${icon ? ' k-field--icon' : ''}`} style={style}>
      {icon ? <span className="k-field__icon">{icon}</span> : null}
      <input
        ref={inputRef}
        className={mono ? 'mono' : undefined}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
    </div>
  );
}

/** A labelled settings row: label + hint on the left, control on the right. */
export function FieldRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="k-fieldrow">
      <div className="k-fieldrow__text">
        <div className="k-fieldrow__label">{label}</div>
        {hint ? <div className="k-fieldrow__hint">{hint}</div> : null}
      </div>
      <div className="k-fieldrow__control">{children}</div>
    </div>
  );
}
