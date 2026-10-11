/**
 * Orka shared building blocks: page context, JHipster alerts, sim-call wrapper, status chips, sorting,
 * pagination, modals and form fields (Apps §2.1–§2.2).
 */
import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useGameShallow } from '@/core/store';
import type { Result } from '@/sim';
import type { OrkaEntityName } from '@/sim/events';
import type { RobotStatus } from '@/sim/types';
import { buildRoute, fmtTime24, parseQuery, type WindowManagerApi } from '../../apps';
import { Fa } from './icons';

/* ─────────────────────────────── Page context ─────────────────────────────── */

export interface OrkaCtxValue {
  route: string;
  path: string;
  query: Record<string, string>;
  navigate(route: string, opts?: { replace?: boolean }): void;
  wm: WindowManagerApi | undefined;
  readOnly: boolean;
  login: string | null;
  isAdmin: boolean;
  /** The Orka window has keyboard focus (window-level shortcuts must not fire for other windows). */
  focused?: boolean;
}

export const OrkaCtx = createContext<OrkaCtxValue | null>(null);

export function useOrka(): OrkaCtxValue {
  const v = useContext(OrkaCtx);
  if (!v) throw new Error('OrkaCtx missing');
  return v;
}

export function splitRoute(route: string): { path: string; query: Record<string, string> } {
  const i = route.indexOf('?');
  return i < 0 ? { path: route || '/', query: {} } : { path: route.slice(0, i) || '/', query: parseQuery(route.slice(i + 1)) };
}

/** Route with an updated query (keys kept in their existing order, new keys appended). */
export function withQuery(path: string, query: Record<string, string | number | null | undefined>): string {
  return buildRoute(path, {}, query);
}

/* ─────────────────────────────── Gating ─────────────────────────────── */

export function useOrkaGate(): { pages: string[] | null; readOnly: boolean; layoutV2Toggle: boolean } {
  return useGameShallow((s) => {
    const r = (s.session.computer?.restrictions?.orka ?? {}) as Record<string, unknown>;
    return {
      pages: Array.isArray(r.pages) ? (r.pages as string[]) : null,
      readOnly: r.readOnly === true,
      layoutV2Toggle: r.layoutV2Toggle === true,
    };
  });
}

/* ─────────────────────────────── Sim calls ─────────────────────────────── */

export const SERVER_NOT_REACHABLE = 'Server not reachable';

/** Call the sim; exceptions / "not implemented" become JHipster's status-0 message (Apps §2.13). */
export function simCall<T>(fn: () => Result<T>): Result<T> {
  try {
    const r = fn();
    if (!r.ok && r.error === 'not implemented') {
      console.warn('[orka] sim call not implemented yet');
      return { ok: false, error: SERVER_NOT_REACHABLE };
    }
    return r;
  } catch (err) {
    console.warn('[orka] sim call threw', err);
    return { ok: false, error: SERVER_NOT_REACHABLE };
  }
}

/* ─────────────────────────────── Alerts (JHipster alert area) ─────────────────────────────── */

export interface OrkaAlert {
  id: number;
  kind: 'success' | 'danger' | 'warning' | 'info';
  text: string;
  detail?: string;
  /** Path the alert is shown on. */
  path: string;
}

let alerts: OrkaAlert[] = [];
let alertSeq = 0;
const alertListeners = new Set<() => void>();
const notifyAlerts = () => alertListeners.forEach((fn) => fn());

export function addAlert(kind: OrkaAlert['kind'], text: string, path: string, detail?: string): void {
  const id = ++alertSeq;
  alerts = [...alerts.filter((a) => !(a.text === text && a.path === path)), { id, kind, text, path, detail }].slice(-6);
  notifyAlerts();
  if (kind === 'success' || kind === 'info') setTimeout(() => dismissAlert(id), 5000);
}

export function dismissAlert(id: number): void {
  alerts = alerts.filter((a) => a.id !== id);
  notifyAlerts();
}

export function clearAlerts(): void {
  alerts = [];
  notifyAlerts();
}

function useAlerts(): OrkaAlert[] {
  return useSyncExternalStore(
    (fn) => {
      alertListeners.add(fn);
      return () => alertListeners.delete(fn);
    },
    () => alerts,
  );
}

export function AlertArea() {
  const { path } = useOrka();
  const list = useAlerts().filter((a) => a.path === path);
  if (!list.length) return null;
  return (
    <div className="orka-alerts" aria-live="polite">
      {list.map((a) => (
        <div key={a.id} className={`orka-alert orka-alert-${a.kind}`} role="alert">
          {a.text}
          {a.detail ? <pre>{a.detail}</pre> : null}
          <button type="button" className="orka-alert-close" aria-label="Close" onClick={() => dismissAlert(a.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Inline (page-local) alert. */
export function Alert(props: { kind: OrkaAlert['kind']; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`orka-alert orka-alert-${props.kind}`} role="alert">
      {props.children}
      {props.onClose ? (
        <button type="button" className="orka-alert-close" aria-label="Close" onClick={props.onClose}>
          ×
        </button>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── Status ─────────────────────────────── */

export const STATUSES: RobotStatus[] = ['AVAILABLE', 'UNAVAILABLE', 'OFFLINE', 'CONNECTION_FAILED', 'RESERVED'];
export const SETTABLE: RobotStatus[] = ['AVAILABLE', 'UNAVAILABLE', 'OFFLINE', 'RESERVED'];
export const STATUS_LABEL: Record<RobotStatus, string> = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  OFFLINE: 'Offline',
  CONNECTION_FAILED: 'Connection Failed',
  RESERVED: 'Reserved',
};
export const STATUS_COLOR: Record<RobotStatus, string> = {
  AVAILABLE: '#2e9e4f',
  UNAVAILABLE: '#8b5cf6',
  OFFLINE: '#6b7280',
  CONNECTION_FAILED: '#dc2626',
  RESERVED: '#2563eb',
};

export function StatusChip(props: { status: RobotStatus }) {
  return (
    <span className="orka-badge orka-pill" style={{ background: STATUS_COLOR[props.status] }}>
      {STATUS_LABEL[props.status]}
    </span>
  );
}

export const ENTITY_TITLE: Record<OrkaEntityName, string> = {
  robot: 'Robot',
  device: 'Device',
  capability: 'Robot Capability',
  merchant: 'Merchant Config',
  screen: 'Screen',
  screenLocation: 'Screen Location',
  cardProfile: 'Card Profile',
  screenCompareImage: 'Screen Compare Image',
} as Record<OrkaEntityName, string>;

export const hhmmss = (ms: number | null | undefined) => (ms == null ? '—' : fmtTime24(ms));

/* ─────────────────────────────── Sorting & pagination ─────────────────────────────── */

export const ITEMS_PER_PAGE = 20;

export function parseSort(s: string | undefined, def = 'id,asc'): { field: string; dir: 'asc' | 'desc' } {
  const [field, dir] = (s || def).split(',');
  return { field: field || 'id', dir: dir === 'desc' ? 'desc' : 'asc' };
}

export function sortRows<T>(rows: T[], field: string, dir: 'asc' | 'desc', get: (row: T, field: string) => unknown): T[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a, field);
    const vb = get(b, field);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * m;
    return String(va).localeCompare(String(vb), undefined, { numeric: true }) * m;
  });
}

export function SortTh(props: { field: string; label: string; sort: { field: string; dir: 'asc' | 'desc' }; onSort(field: string): void; style?: React.CSSProperties }) {
  const active = props.sort.field === props.field;
  return (
    <th className={`orka-sort${active ? ' orka-sort-active' : ''}`} style={props.style} onClick={() => props.onSort(props.field)} aria-sort={active ? (props.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {props.label}
      <span className="orka-sort-icon">{active ? (props.sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </th>
  );
}

export function nextSort(cur: { field: string; dir: 'asc' | 'desc' }, field: string): string {
  return `${field},${cur.field === field && cur.dir === 'asc' ? 'desc' : 'asc'}`;
}

export function ItemCount(props: { page: number; total: number }) {
  const { page, total } = props;
  const first = total === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1;
  const last = Math.min(total, page * ITEMS_PER_PAGE);
  return (
    <div className="orka-count">
      Showing {first} - {last} of {total} items.
    </div>
  );
}

export function Pagination(props: { page: number; total: number; onPage(p: number): void }) {
  const pages = Math.max(1, Math.ceil(props.total / ITEMS_PER_PAGE));
  const p = Math.min(Math.max(1, props.page), pages);
  const nums: number[] = [];
  for (let i = Math.max(1, p - 2); i <= Math.min(pages, p + 2); i++) nums.push(i);
  return (
    <nav className="orka-pagination" aria-label="Pagination">
      <button type="button" disabled={p === 1} onClick={() => props.onPage(1)} aria-label="First">
        «
      </button>
      <button type="button" disabled={p === 1} onClick={() => props.onPage(p - 1)} aria-label="Previous">
        ‹
      </button>
      {nums.map((n) => (
        <button key={n} type="button" className={n === p ? 'orka-page-active' : undefined} onClick={() => props.onPage(n)} aria-current={n === p ? 'page' : undefined}>
          {n}
        </button>
      ))}
      <button type="button" disabled={p === pages} onClick={() => props.onPage(p + 1)} aria-label="Next">
        ›
      </button>
      <button type="button" disabled={p === pages} onClick={() => props.onPage(pages)} aria-label="Last">
        »
      </button>
    </nav>
  );
}

export function paginate<T>(rows: T[], page: number): T[] {
  const p = Math.max(1, page);
  return rows.slice((p - 1) * ITEMS_PER_PAGE, p * ITEMS_PER_PAGE);
}

/* ─────────────────────────────── Modals ─────────────────────────────── */

export function Modal(props: { title: string; children: ReactNode; footer: ReactNode; onClose(): void }) {
  const { onClose } = props;
  const focused = useContext(OrkaCtx)?.focused !== false;
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, focused]);
  return (
    <div className="orka-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="orka-modal" role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="orka-modal-header">
          <h4>{props.title}</h4>
          <button type="button" className="orka-alert-close" style={{ position: 'static' }} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="orka-modal-body">{props.children}</div>
        <div className="orka-modal-footer">{props.footer}</div>
      </div>
    </div>
  );
}

export function DeleteModal(props: { entity: OrkaEntityName; id: number; onCancel(): void; onConfirm(): void }) {
  return (
    <Modal
      title="Confirm delete operation"
      onClose={props.onCancel}
      footer={
        <>
          <button type="button" className="orka-btn orka-btn-secondary" onClick={props.onCancel}>
            <Fa.ban /> Cancel
          </button>
          <button type="button" className="orka-btn orka-btn-danger" onClick={props.onConfirm} autoFocus>
            <Fa.times /> Delete
          </button>
        </>
      }
    >
      Are you sure you want to delete {ENTITY_TITLE[props.entity]} {props.id}?
    </Modal>
  );
}

/* ─────────────────────────────── Row buttons ─────────────────────────────── */

export function RowButtons(props: { onView(): void; onEdit?: () => void; onDelete?: () => void; hintEdit?: string; extra?: ReactNode }) {
  return (
    <div className="orka-actions">
      <div className="orka-btn-group">
        <button type="button" className="orka-btn orka-btn-info orka-btn-sm" onClick={props.onView} title="View">
          <Fa.eye size={12} /> <span className="orka-btn-label">View</span>
        </button>
        {props.onEdit ? (
          <button type="button" className="orka-btn orka-btn-primary orka-btn-sm" onClick={props.onEdit} data-hint={props.hintEdit} title="Edit">
            <Fa.pencil size={12} /> <span className="orka-btn-label">Edit</span>
          </button>
        ) : null}
        {props.onDelete ? (
          <button type="button" className="orka-btn orka-btn-danger orka-btn-sm" onClick={props.onDelete} title="Delete">
            <Fa.times size={12} /> <span className="orka-btn-label">Delete</span>
          </button>
        ) : null}
      </div>
      {props.extra}
    </div>
  );
}

/* ─────────────────────────────── Form fields ─────────────────────────────── */

export const MSG = {
  required: 'This field is required.',
  pattern: (label: string) => `This field should follow pattern for "${label}".`,
  maxLen: (n: number) => `This field cannot be longer than ${n} characters.`,
  number: 'This field should be a number.',
  max: (n: number) => `This field cannot be more than ${n}.`,
  min: (n: number) => `This field should be at least ${n}.`,
};

export function validateText(value: string, label: string, rules: { required?: boolean; pattern?: RegExp; max?: number }): string | null {
  const v = value ?? '';
  if (rules.required && !v.trim()) return MSG.required;
  if (v && rules.pattern && !rules.pattern.test(v)) return MSG.pattern(label);
  if (rules.max != null && v.length > rules.max) return MSG.maxLen(rules.max);
  return null;
}

export function validateNumber(value: string, rules: { required?: boolean; min?: number; max?: number; integer?: boolean }): string | null {
  const v = (value ?? '').trim();
  if (!v) return rules.required ? MSG.required : null;
  const n = Number(v);
  if (!Number.isFinite(n) || (rules.integer && !Number.isInteger(n))) return MSG.number;
  if (rules.max != null && n > rules.max) return MSG.max(rules.max);
  if (rules.min != null && n < rules.min) return MSG.min(rules.min);
  return null;
}

export function Field(props: { label: ReactNode; help?: string; error?: string | null; text?: ReactNode; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="orka-form-group" data-hint={props.hint}>
      <label className="orka-label" htmlFor={props.htmlFor}>
        {props.label}
        {props.help ? (
          <span className="orka-help" title={props.help} aria-label={props.help}>
            ?
          </span>
        ) : null}
      </label>
      {props.children}
      {props.error ? <small className="orka-invalid-msg">{props.error}</small> : null}
      {props.text ? <small className="orka-form-text">{props.text}</small> : null}
    </div>
  );
}

/** Ctrl+S on a form = Save (Apps §2.14). */
export function useCtrlS(onSave: () => void, enabled = true): void {
  const ref = useRef(onSave);
  ref.current = onSave;
  const focused = useContext(OrkaCtx)?.focused !== false;
  useEffect(() => {
    if (!enabled || !focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, focused]);
}

/** Run `fn` once per `key` for this component instance (StrictMode-safe view events). */
export function useOnce(key: string | null, fn: () => void): void {
  const done = useRef<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (key == null || done.current === key) return;
    done.current = key;
    fnRef.current();
  }, [key]);
}

export function NotFound(props: { what: string }) {
  return (
    <div>
      <h2>Error Page!</h2>
      <div className="orka-alert orka-alert-danger">404 Not Found — {props.what}</div>
    </div>
  );
}

export function PageHeading(props: { title: string; children?: ReactNode; id?: string }) {
  return (
    <div className="orka-heading">
      <h2 id={props.id ?? 'page-heading'}>{props.title}</h2>
      {props.children}
    </div>
  );
}

export function BackEditButtons(props: { onBack(): void; onEdit?: () => void; children?: ReactNode }) {
  return (
    <div className="orka-buttons">
      <button type="button" className="orka-btn orka-btn-info" onClick={props.onBack}>
        <Fa.arrowLeft /> Back
      </button>
      {props.onEdit ? (
        <button type="button" className="orka-btn orka-btn-primary" onClick={props.onEdit}>
          <Fa.pencil /> Edit
        </button>
      ) : null}
      {props.children}
    </div>
  );
}

export function FormButtons(props: { onCancel(): void; saving?: boolean; invalid: boolean; hint?: string; readOnly?: boolean }) {
  return (
    <div className="orka-buttons">
      <button type="button" className="orka-btn orka-btn-secondary" onClick={props.onCancel}>
        <Fa.ban /> Cancel
      </button>
      {props.readOnly ? null : (
        <button type="submit" className="orka-btn orka-btn-primary" disabled={props.invalid || props.saving} data-hint={props.hint}>
          <Fa.save /> Save
        </button>
      )}
    </div>
  );
}

/** Changed keys between two flat records (JSON comparison). */
export function changedKeys<T extends object>(before: T, after: Partial<T>): (keyof T)[] {
  return (Object.keys(after) as (keyof T)[]).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
}
