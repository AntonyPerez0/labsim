/**
 * Merchant Config (Apps §2.8): the list deliberately truncates (no credential columns; a final `…` column);
 * View hides the credentials; only **Edit** shows App ID / App Secret / API Key / Ubi Route.
 */
import { useState, type FormEvent } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import type { CardBrand, MerchantConfig } from '@/sim/types';
import { emitAppAction, fmtMoney } from '../../../apps';
import { Fa } from '../icons';
import { AlertArea, BackEditButtons, Field, FormButtons, NotFound, PageHeading, RowButtons, addAlert, simCall, useCtrlS, useOnce, useOrca, validateNumber, validateText } from '../shared';
import { useDeleteFlow } from './common';

const BRANDS: CardBrand[] = ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'INTERAC'];
const ENVS = ['dev1', 'dev2', 'stg', 'qa', 'int'];
const OWNERS = ['Automation', 'PayCore', 'SDK', 'Westers'];

export function MerchantsPage() {
  const { navigate, readOnly } = useOrca();
  const merchants = useGame((s) => s.lab.orca.merchants);
  const del = useDeleteFlow('merchant', '/merchant-config');
  return (
    <div>
      <PageHeading title="Merchant Configs">
        {readOnly ? null : (
          <button type="button" className="orca-btn orca-btn-primary jh-create-entity" onClick={() => navigate('/merchant-config/new')}>
            <Fa.plus /> Create a new Merchant Config
          </button>
        )}
      </PageHeading>
      <AlertArea />
      <div className="orca-table-wrap">
        <table className="orca-table orca-table-striped orca-table-fixed">
          <colgroup>
            <col style={{ width: 50 }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 40 }} />
            <col style={{ width: 230 }} />
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Region</th>
              <th>PIN Bypass</th>
              <th>Country</th>
              <th>Owner</th>
              <th title="More columns — open Edit">…</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {Object.values(merchants).map((m) => (
              <tr key={m.id}>
                <td>
                  <button type="button" className="orca-link" onClick={() => navigate(`/merchant-config/${m.id}/view`)}>
                    {m.id}
                  </button>
                </td>
                <td title={m.name}>{m.name}</td>
                <td>{m.region}</td>
                <td>{m.pinBypass ? '✓' : '—'}</td>
                <td>{m.country}</td>
                <td>{m.owner}</td>
                <td className="orca-muted">…</td>
                <td>
                  <RowButtons
                    onView={() => navigate(`/merchant-config/${m.id}/view`)}
                    onEdit={() => navigate(`/merchant-config/${m.id}/edit`)}
                    onDelete={readOnly ? undefined : () => del.ask(m.id)}
                    hintEdit={`orca.merchants.rowEdit:${m.name}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="orca-muted orca-small">Columns are truncated in the list. Click Edit on a row to view all fields.</p>
      {del.modal}
    </div>
  );
}

export function MerchantDetailPage(props: { id: number }) {
  const { navigate } = useOrca();
  const m = useGame((s) => s.lab.orca.merchants[props.id]);
  if (!m) return <NotFound what={`Merchant Config ${props.id}`} />;
  return (
    <div>
      <h2>Merchant Config</h2>
      <hr />
      <dl className="orca-dl">
        <dt>ID</dt>
        <dd>{m.id}</dd>
        <dt>Name</dt>
        <dd>{m.name}</dd>
        <dt>Display Name</dt>
        <dd>{m.displayName}</dd>
        <dt>Merchant ID (MID)</dt>
        <dd className="orca-mono">{m.merchantId}</dd>
        <dt>Environment</dt>
        <dd>{m.environment}</dd>
        <dt>Region</dt>
        <dd>{m.region}</dd>
        <dt>Country</dt>
        <dd>
          {m.country} / {m.currency}
        </dd>
        <dt>Tax Rate (%)</dt>
        <dd>{(m.taxRateBp / 100).toFixed(2)}</dd>
        <dt>PIN Bypass</dt>
        <dd>{m.pinBypass ? 'true' : 'false'}</dd>
        <dt>Owner</dt>
        <dd>{m.owner}</dd>
        <dt>App credentials</dt>
        <dd className="orca-muted">App credentials: 3 fields — open Edit to see them</dd>
      </dl>
      <BackEditButtons onBack={() => navigate('/merchant-config')} onEdit={() => navigate(`/merchant-config/${m.id}/edit`)} />
    </div>
  );
}

interface MForm {
  name: string;
  displayName: string;
  address: string;
  merchantId: string;
  environment: string;
  region: MerchantConfig['region'];
  country: 'US' | 'CA';
  currency: 'USD' | 'CAD';
  owner: string;
  taxRate: string;
  tipsEnabled: boolean;
  tipPercents: string;
  pinBypass: boolean;
  cashDiscountEnabled: boolean;
  cardAdjust: string;
  qrReceiptsEnabled: boolean;
  signatureThreshold: string;
  acceptedBrands: CardBrand[];
  apps: string;
  appId: string;
  appSecret: string;
  apiKey: string;
  ubiRoute: string;
  notes: string;
}

function toForm(m: MerchantConfig | null): MForm {
  return {
    name: m?.name ?? '',
    displayName: m?.displayName ?? '',
    address: m?.address ?? '100 Automation Way, Lab 4',
    merchantId: m?.merchantId ?? '',
    environment: m?.environment ?? 'dev1',
    region: m?.region ?? 'US-EAST',
    country: m?.country ?? 'US',
    currency: m?.currency ?? 'USD',
    owner: m?.owner ?? 'Automation',
    taxRate: ((m?.taxRateBp ?? 825) / 100).toFixed(2),
    tipsEnabled: m?.tipsEnabled ?? true,
    tipPercents: (m?.tipPercents ?? [15, 18, 20, 22]).join(', '),
    pinBypass: m?.pinBypass ?? false,
    cashDiscountEnabled: m?.cashDiscountEnabled ?? false,
    cardAdjust: ((m?.cardAdjustBp ?? 0) / 100).toFixed(2),
    qrReceiptsEnabled: m?.qrReceiptsEnabled ?? false,
    signatureThreshold: m?.signatureThresholdCents == null ? '' : (m.signatureThresholdCents / 100).toFixed(2),
    acceptedBrands: [...(m?.acceptedBrands ?? ['VISA', 'MASTERCARD'])],
    apps: (m?.apps ?? []).join(', '),
    appId: m?.appId ?? '',
    appSecret: m?.appSecret ?? '',
    apiKey: m?.apiKey ?? '',
    ubiRoute: m?.ubiRoute ?? '',
    notes: m?.notes ?? '',
  };
}

function fromForm(f: MForm): Partial<MerchantConfig> {
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const taxRateBp = Math.round(Number(f.taxRate) * 100);
  return {
    name: f.name,
    displayName: f.displayName,
    address: f.address,
    merchantId: f.merchantId,
    environment: f.environment,
    region: f.region,
    country: f.country,
    currency: f.currency,
    owner: f.owner,
    taxRateBp,
    taxRatePct: taxRateBp / 100,
    tipsEnabled: f.tipsEnabled,
    tipPercents: list(f.tipPercents).map(Number),
    pinBypass: f.pinBypass,
    cashDiscountEnabled: f.cashDiscountEnabled,
    cardAdjustBp: Math.round(Number(f.cardAdjust) * 100),
    qrReceiptsEnabled: f.qrReceiptsEnabled,
    signatureThresholdCents: f.signatureThreshold.trim() === '' ? null : Math.round(Number(f.signatureThreshold) * 100),
    acceptedBrands: BRANDS.filter((b) => f.acceptedBrands.includes(b)),
    apps: list(f.apps),
    appId: f.appId.trim() || null,
    appSecret: f.appSecret.trim() || null,
    apiKey: f.apiKey.trim() || null,
    ubiRoute: f.ubiRoute || null,
    notes: f.notes,
  };
}

export function MerchantFormPage(props: { id: number | null }) {
  const { navigate, readOnly } = useOrca();
  const m = useGame((s) => (props.id != null ? s.lab.orca.merchants[props.id] : null)) ?? null;
  const [f, setF] = useState<MForm>(() => toForm(m));
  const [show, setShow] = useState(false);
  const path = props.id != null ? `/merchant-config/${props.id}/edit` : '/merchant-config/new';
  useOnce(m ? String(m.id) : null, () => emitAppAction('orca', 'orca.merchant.editOpened', { merchantId: m!.id, name: m!.name }));

  const errors = {
    name: validateText(f.name, 'Name', { required: true, pattern: /^[A-Z0-9]+(-[A-Z0-9]+)*$/, max: 50 }),
    merchantId: validateText(f.merchantId, 'Merchant ID (MID)', { required: true, pattern: /^[A-Z0-9]+$/ }),
    taxRate: validateNumber(f.taxRate, { required: true, min: 0, max: 100 }),
    cardAdjust: validateNumber(f.cardAdjust, { required: true, min: 0, max: 10 }),
    signatureThreshold: validateNumber(f.signatureThreshold, { min: 0 }),
    tipPercents: f.tipPercents.trim() && !/^\s*\d+(\s*,\s*\d+)*\s*$/.test(f.tipPercents) ? 'This field should follow pattern for "Tip Percents".' : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  if (props.id != null && !m) return <NotFound what={`Merchant Config ${props.id}`} />;
  const set = (patch: Partial<MForm>) => setF((p) => ({ ...p, ...patch }));

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (invalid || readOnly) return;
    const row = fromForm(f);
    const before = (m ?? {}) as Record<string, unknown>;
    const changed = Object.keys(row).filter((k) => k !== 'taxRatePct' && JSON.stringify(before[k] ?? null) !== JSON.stringify((row as Record<string, unknown>)[k] ?? null));
    const r = simCall(() => sim.orca.saveMerchant(m ? { id: m.id, ...row } : row, 'player'));
    if (!r.ok) {
      addAlert('danger', r.error, path);
      return;
    }
    emitAppAction('orca', 'orca.merchant.saved', { merchantId: r.value, name: f.name, changed });
    addAlert('success', m ? `A Merchant Config is updated with identifier ${r.value}` : `A new Merchant Config is created with identifier ${r.value}`, '/merchant-config');
    navigate('/merchant-config');
  };
  useCtrlS(() => save(), !readOnly);

  const dis = readOnly;
  const text = (k: keyof MForm, label: string, opts: { mono?: boolean; hint?: string; help?: string; text?: string } = {}) => (
    <Field label={label} error={(errors as Record<string, string | null>)[k] ?? null} hint={opts.hint} help={opts.help} text={opts.text}>
      <input className={`orca-control${opts.mono ? ' orca-mono' : ''}`} value={f[k] as string} disabled={dis} onChange={(e) => set({ [k]: e.target.value } as Partial<MForm>)} />
    </Field>
  );
  const select = (k: keyof MForm, label: string, options: string[], hint?: string) => (
    <Field label={label} hint={hint}>
      <select className="orca-control" value={f[k] as string} disabled={dis} onChange={(e) => set({ [k]: e.target.value } as Partial<MForm>)}>
        {options.map((o) => (
          <option key={o} value={o === '(none)' ? '' : o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
  const check = (k: keyof MForm, label: string) => (
    <label className="orca-check" style={{ marginBottom: 10 }}>
      <input type="checkbox" checked={f[k] as boolean} disabled={dis} onChange={(e) => set({ [k]: e.target.checked } as Partial<MForm>)} />
      {label}
    </label>
  );

  return (
    <form onSubmit={save} noValidate>
      <h2 id="jhi-merchant-config-heading">Create or edit a Merchant Config</h2>
      <AlertArea />
      <div className="orca-card">
        <h5 className="orca-card-title">Merchant</h5>
        <div className="orca-grid2">
          {m ? (
            <Field label="ID">
              <input className="orca-control" readOnly value={m.id} />
            </Field>
          ) : null}
          {text('name', 'Name')}
          {text('displayName', 'Display Name')}
          {text('address', 'Address')}
          {text('merchantId', 'Merchant ID (MID)', { mono: true })}
          {select('environment', 'Environment', ENVS)}
          {select('region', 'Region', ['US-EAST', 'CA-CENTRAL'])}
          {select('country', 'Country', ['US', 'CA'])}
          {select('currency', 'Currency', ['USD', 'CAD'])}
          {select('owner', 'Owner', OWNERS)}
        </div>
      </div>
      <div className="orca-card">
        <h5 className="orca-card-title">Payments</h5>
        <div className="orca-grid2">
          {text('taxRate', 'Tax Rate (%)')}
          {text('tipPercents', 'Tip Percents')}
          {text('cardAdjust', 'Card Adjust (%)')}
          {text('signatureThreshold', 'Signature Threshold ($)', { text: f.signatureThreshold === '' ? 'Empty = never ask for a signature' : `Ask for a signature above ${fmtMoney(Math.round(Number(f.signatureThreshold) * 100) || 0)}` })}
          {text('apps', 'Extra Apps')}
        </div>
        <div>
          {check('tipsEnabled', 'Tips Enabled')}
          {check('pinBypass', 'PIN Bypass')}
          {check('cashDiscountEnabled', 'Cash Discount Enabled')}
          {check('qrReceiptsEnabled', 'QR Receipts Enabled')}
        </div>
        <Field label="Accepted Brands">
          <div>
            {BRANDS.map((b) => (
              <label key={b} className="orca-check">
                <input type="checkbox" disabled={dis} checked={f.acceptedBrands.includes(b)} onChange={(e) => set({ acceptedBrands: e.target.checked ? [...f.acceptedBrands, b] : f.acceptedBrands.filter((x) => x !== b) })} />
                {b}
              </label>
            ))}
          </div>
        </Field>
      </div>
      <div className="orca-card">
        <h5 className="orca-card-title">Go SDK credentials</h5>
        <p className="orca-form-text" style={{ marginTop: -6 }}>
          Exported to pipelines as APP_ID, APP_SECRET, API_KEY for the Go SDK.
        </p>
        <div className="orca-grid2">
          {text('appId', 'App ID', { mono: true, hint: 'orca.merchant.field:appId' })}
          <Field label="App Secret" hint="orca.merchant.field:appSecret">
            <div className="orca-inputgroup">
              <input className="orca-control orca-mono" type={show ? 'text' : 'password'} value={f.appSecret} disabled={dis} onChange={(e) => set({ appSecret: e.target.value })} autoComplete="off" />
              <button
                type="button"
                className="orca-btn orca-btn-outline-secondary"
                aria-pressed={show}
                onClick={() => {
                  if (!show && m) emitAppAction('orca', 'orca.merchant.secretRevealed', { merchantId: m.id, name: m.name });
                  setShow((x) => !x);
                }}
              >
                <Fa.eye size={13} /> {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
          {text('apiKey', 'API Key', { mono: true, hint: 'orca.merchant.field:apiKey' })}
        </div>
      </div>
      <div className="orca-card">
        <h5 className="orca-card-title">Routing</h5>
        {select('ubiRoute', 'Ubi Route', ['(none)', 'us-east', 'ca-central'], 'orca.merchant.field:ubiRoute')}
        <Field label="Notes">
          <textarea className="orca-control" rows={2} value={f.notes} disabled={dis} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <FormButtons onCancel={() => navigate('/merchant-config')} invalid={invalid} readOnly={readOnly} />
    </form>
  );
}
