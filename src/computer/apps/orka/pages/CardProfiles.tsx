/**
 * Card Profile (Apps §2.10): Track Data for SWIPE rows, Gorth Path for DIP/TAP rows (the other hidden);
 * clicking the value selects it and emits `orka.cardProfile.fieldClicked`.
 */
import { useState, type FormEvent, type MouseEvent } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import type { CardBrand, CardEntry, CardProfile } from '@/sim/types';
import { emitAppAction } from '../../../apps';
import { Fa } from '../icons';
import { AlertArea, BackEditButtons, Field, FormButtons, NotFound, PageHeading, RowButtons, addAlert, simCall, useCtrlS, useOnce, useOrka, validateText } from '../shared';
import { useDeleteFlow } from './common';

const BRANDS: CardBrand[] = ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'INTERAC'];
const ENTRIES: CardEntry[] = ['SWIPE', 'DIP', 'TAP'];
const ENTRY_LABEL: Record<CardEntry, string> = { SWIPE: 'Swipe', DIP: 'Dip', TAP: 'Tap' };
const ENTRY_BADGE: Record<CardEntry, string> = { SWIPE: 'orka-bg-secondary', DIP: 'orka-bg-primary', TAP: 'orka-bg-success' };

const masked = (pan: string) => `•••• ${pan.slice(-4)}`;
const expiry = (yymm: string) => (yymm.length === 4 ? `${yymm.slice(2)}/${yymm.slice(0, 2)}` : yymm);

function selectText(e: MouseEvent<HTMLElement>) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(e.currentTarget);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function CardProfilesPage() {
  const { navigate, readOnly } = useOrka();
  const cards = useGame((s) => s.lab.orka.cardProfiles);
  const del = useDeleteFlow('cardProfile', '/card-profile');
  return (
    <div>
      <PageHeading title="Card Profiles">
        {readOnly ? null : (
          <button type="button" className="orka-btn orka-btn-primary jh-create-entity" onClick={() => navigate('/card-profile/new')}>
            <Fa.plus /> Create a new Card Profile
          </button>
        )}
      </PageHeading>
      <AlertArea />
      <div className="orka-table-wrap">
        <table className="orka-table orka-table-striped">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Brand</th>
              <th>Entry</th>
              <th>Track Data / Path</th>
              <th>PAN</th>
              <th>Country</th>
              <th>Owner</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {Object.values(cards).map((c) => {
              const data = c.entry === 'SWIPE' ? (c.trackData ?? '') : (c.gorthPath ?? '');
              const short = data.length > 48 ? `${data.slice(0, 48)}…` : data;
              return (
                <tr key={c.id} data-hint={`orka.cardProfiles.row:${c.name}`}>
                  <td>
                    <button type="button" className="orka-link" onClick={() => navigate(`/card-profile/${c.id}/view`)}>
                      {c.id}
                    </button>
                  </td>
                  <td className="orka-mono">{c.name}</td>
                  <td>{c.brand}</td>
                  <td>
                    <span className={`orka-badge ${ENTRY_BADGE[c.entry]}`}>{ENTRY_LABEL[c.entry]}</span>
                  </td>
                  <td className="orka-mono" title={data}>
                    {short}
                  </td>
                  <td className="orka-mono">{masked(c.pan)}</td>
                  <td>{c.country}</td>
                  <td>{c.owner}</td>
                  <td>
                    <RowButtons onView={() => navigate(`/card-profile/${c.id}/view`)} onEdit={readOnly ? undefined : () => navigate(`/card-profile/${c.id}/edit`)} onDelete={readOnly ? undefined : () => del.ask(c.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {del.modal}
    </div>
  );
}

export function CardProfileDetailPage(props: { id: number }) {
  const { navigate, readOnly } = useOrka();
  const c = useGame((s) => s.lab.orka.cardProfiles[props.id]);
  const [showPin, setShowPin] = useState(false);
  useOnce(c ? String(c.id) : null, () => emitAppAction('orka', 'orka.cardProfile.viewed', { profileId: c!.id, name: c!.name, entry: c!.entry }));
  if (!c) return <NotFound what={`Card Profile ${props.id}`} />;
  const swipe = c.entry === 'SWIPE';
  const click = (field: 'trackData' | 'gorthPath') => (e: MouseEvent<HTMLElement>) => {
    selectText(e);
    emitAppAction('orka', 'orka.cardProfile.fieldClicked', { profileId: c.id, name: c.name, field });
  };
  return (
    <div>
      <h2>Card Profile</h2>
      <hr />
      <dl className="orka-dl">
        <dt>ID</dt>
        <dd>{c.id}</dd>
        <dt>Name</dt>
        <dd className="orka-mono">{c.name}</dd>
        <dt>Brand</dt>
        <dd>{c.brand}</dd>
        <dt>Type</dt>
        <dd>
          <span className={`orka-badge ${ENTRY_BADGE[c.entry]}`}>{c.entry}</span>
        </dd>
        {swipe ? (
          <>
            <dt>Track Data</dt>
            <dd className="orka-mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', cursor: 'text' }} onClick={click('trackData')} data-hint="orka.cardProfile.field:trackData">
              {c.trackData}
            </dd>
          </>
        ) : (
          <>
            <dt>Path</dt>
            <dd className="orka-mono" style={{ cursor: 'text' }} onClick={click('gorthPath')} data-hint="orka.cardProfile.field:gorthPath">
              {c.gorthPath}
            </dd>
          </>
        )}
        <dt>PAN</dt>
        <dd className="orka-mono">{c.pan}</dd>
        <dt>Expiry</dt>
        <dd>{expiry(c.expiry)}</dd>
        <dt>PIN</dt>
        <dd>
          {c.pin ? (
            <>
              <span className="orka-mono">{showPin ? c.pin : '••••'}</span>{' '}
              <button type="button" className="orka-link" onClick={() => setShowPin((x) => !x)}>
                {showPin ? 'Hide' : 'Show'}
              </button>
            </>
          ) : (
            '—'
          )}
        </dd>
        <dt>Requires PIN</dt>
        <dd>{c.requiresPin ? 'true' : 'false'}</dd>
        <dt>Country</dt>
        <dd>{c.country}</dd>
        <dt>Owner</dt>
        <dd>{c.owner}</dd>
      </dl>
      <BackEditButtons onBack={() => navigate('/card-profile')} onEdit={readOnly ? undefined : () => navigate(`/card-profile/${c.id}/edit`)} />
    </div>
  );
}

export function CardProfileFormPage(props: { id: number | null }) {
  const { navigate, readOnly } = useOrka();
  const c = useGame((s) => (props.id != null ? s.lab.orka.cardProfiles[props.id] : null)) ?? null;
  const [f, setF] = useState({
    name: c?.name ?? '',
    brand: (c?.brand ?? 'VISA') as CardBrand,
    entry: (c?.entry ?? 'SWIPE') as CardEntry,
    trackData: c?.trackData ?? '',
    gorthPath: c?.gorthPath ?? '',
    pan: c?.pan ?? '',
    expiry: c?.expiry ?? '',
    pin: c?.pin ?? '',
    requiresPin: c?.requiresPin ?? false,
    country: (c?.country ?? 'US') as 'US' | 'CA',
    owner: c?.owner ?? 'Automation',
  });
  const path = props.id != null ? `/card-profile/${props.id}/edit` : '/card-profile/new';
  const swipe = f.entry === 'SWIPE';
  const errors = {
    name: validateText(f.name, 'Name', { required: true, pattern: /^[A-Z0-9_]+$/ }),
    trackData: swipe ? validateText(f.trackData, 'Track Data', { required: true }) : null,
    gorthPath: !swipe ? validateText(f.gorthPath, 'Path', { required: true, pattern: /^cards\/[\w./-]+\.json$/ }) : null,
    pan: validateText(f.pan, 'PAN', { required: true, pattern: /^\d{12,19}$/ }),
    expiry: validateText(f.expiry, 'Expiry', { required: true, pattern: /^\d{4}$/ }),
  };
  const invalid = Object.values(errors).some(Boolean);
  if (props.id != null && !c) return <NotFound what={`Card Profile ${props.id}`} />;
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (invalid || readOnly) return;
    const row: Partial<CardProfile> = {
      name: f.name,
      brand: f.brand,
      entry: f.entry,
      trackData: swipe ? f.trackData : null,
      gorthPath: swipe ? null : f.gorthPath,
      pan: f.pan,
      expiry: f.expiry,
      pin: f.pin || null,
      requiresPin: f.requiresPin,
      country: f.country,
      owner: f.owner,
    };
    const before = (c ?? {}) as Record<string, unknown>;
    const changed = Object.keys(row).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify((row as Record<string, unknown>)[k] ?? null));
    const r = simCall(() => sim.orka.saveCardProfile(c ? { id: c.id, ...row } : row, 'player'));
    if (!r.ok) {
      addAlert('danger', r.error, path);
      return;
    }
    emitAppAction('orka', 'orka.cardProfile.saved', { profileId: r.value, name: f.name, changed });
    addAlert('success', c ? `A Card Profile is updated with identifier ${r.value}` : `A new Card Profile is created with identifier ${r.value}`, '/card-profile');
    navigate('/card-profile');
  };
  useCtrlS(() => save(), !readOnly);
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  return (
    <form onSubmit={save} noValidate>
      <h2>Create or edit a Card Profile</h2>
      <AlertArea />
      <div className="orka-card">
        <div className="orka-grid2">
          <Field label="Name" error={f.name ? errors.name : null}>
            <input className="orka-control orka-mono" value={f.name} disabled={readOnly} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Brand">
            <select className="orka-control" value={f.brand} disabled={readOnly} onChange={(e) => set({ brand: e.target.value as CardBrand })}>
              {BRANDS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="Entry">
            <select className="orka-control" value={f.entry} disabled={readOnly} onChange={(e) => set({ entry: e.target.value as CardEntry })}>
              {ENTRIES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        {swipe ? (
          <Field label="Track Data" error={errors.trackData}>
            <textarea className={`orka-control orka-mono${errors.trackData ? ' orka-invalid' : ''}`} rows={3} value={f.trackData} disabled={readOnly} onChange={(e) => set({ trackData: e.target.value })} />
          </Field>
        ) : (
          <Field label="Path" error={f.gorthPath ? errors.gorthPath : null} text="Gorth card definition, e.g. cards/emv/visa_std_dip.json">
            <input className="orka-control orka-mono" value={f.gorthPath} disabled={readOnly} onChange={(e) => set({ gorthPath: e.target.value })} />
          </Field>
        )}
        <div className="orka-grid2">
          <Field label="PAN" error={f.pan ? errors.pan : null}>
            <input className="orka-control orka-mono" value={f.pan} disabled={readOnly} onChange={(e) => set({ pan: e.target.value })} />
          </Field>
          <Field label="Expiry (YYMM)" error={f.expiry ? errors.expiry : null}>
            <input className="orka-control orka-mono" value={f.expiry} disabled={readOnly} onChange={(e) => set({ expiry: e.target.value })} />
          </Field>
          <Field label="PIN">
            <input className="orka-control orka-mono" value={f.pin} disabled={readOnly} onChange={(e) => set({ pin: e.target.value })} />
          </Field>
          <Field label="Country">
            <select className="orka-control" value={f.country} disabled={readOnly} onChange={(e) => set({ country: e.target.value as 'US' | 'CA' })}>
              <option>US</option>
              <option>CA</option>
            </select>
          </Field>
          <Field label="Owner">
            <select className="orka-control" value={f.owner} disabled={readOnly} onChange={(e) => set({ owner: e.target.value })}>
              {['Automation', 'PayCrest', 'SDK', 'Westerly'].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
        </div>
        <label className="orka-check">
          <input type="checkbox" checked={f.requiresPin} disabled={readOnly} onChange={(e) => set({ requiresPin: e.target.checked })} />
          Requires PIN
        </label>
      </div>
      <FormButtons onCancel={() => navigate('/card-profile')} invalid={invalid} readOnly={readOnly} />
    </form>
  );
}
