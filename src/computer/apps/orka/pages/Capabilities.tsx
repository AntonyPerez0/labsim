/**
 * Robot Capability (Apps §2.7): capability rows CRUD, Robot documents (canonical capability JSON via
 * `GET /api/robots/{name}/capabilities`), and Nate's Match preview.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getState, useGame } from '@/core/store';
import { sim } from '@/sim';
import type { MatchPreviewRow } from '@/sim';
import type { CapabilityLookup, RobotCapability } from '@/sim/types';
import { emitAppAction } from '../../../apps';
import { Fa } from '../icons';
import { AlertArea, BackEditButtons, Field, FormButtons, NotFound, PageHeading, RowButtons, StatusChip, addAlert, simCall, useCtrlS, useOnce, useOrka, validateText, withQuery } from '../shared';
import { ENVIRONMENTS, useDeleteFlow } from './common';

const LOOKUPS: CapabilityLookup[] = ['DYNAMIC_JSON', 'NON_DYNAMIC', 'BOTH'];
const LOOKUP_BADGE: Record<CapabilityLookup, string> = { DYNAMIC_JSON: 'orka-bg-primary', NON_DYNAMIC: 'orka-bg-secondary', BOTH: 'orka-bg-success' };
const DERIVED = ['deviceType', 'printer', 'physicalTouch', 'pinEntry', 'tethered', 'duet', 'adbOnly', 'testingProfile'];

function Tabs(props: { active: 'rows' | 'documents' | 'match' }) {
  const { navigate } = useOrka();
  const tab = (id: 'rows' | 'documents' | 'match', label: string, route: string, hint?: string) => (
    <button type="button" role="tab" aria-selected={props.active === id} className={`orka-tab${props.active === id ? ' orka-tab-active' : ''}`} onClick={() => navigate(route)} data-hint={hint}>
      {label}
    </button>
  );
  return (
    <div className="orka-tabs" role="tablist">
      {tab('rows', 'Capabilities', '/robot-capability')}
      {tab('documents', 'Robot documents', '/robot-capability?tab=documents', 'orka.capabilities.robotSelect')}
      {tab('match', 'Match preview', '/robot-capability/match-preview', 'orka.capabilities.matchPreview')}
    </div>
  );
}

/* ─────────────────────────────── Capability rows ─────────────────────────────── */

function CapabilityRows() {
  const { navigate, readOnly } = useOrka();
  const caps = useGame((s) => s.lab.orka.capabilities);
  const del = useDeleteFlow('capability', '/robot-capability');
  return (
    <>
      <div className="orka-table-wrap">
        <table className="orka-table orka-table-striped">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Key</th>
              <th>Lookup</th>
              <th>Description</th>
              <th>JSON</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {Object.values(caps).map((c) => (
              <tr key={c.id}>
                <td>
                  <button type="button" className="orka-link" onClick={() => navigate(`/robot-capability/${c.id}/view`)}>
                    {c.id}
                  </button>
                </td>
                <td>{c.name}</td>
                <td className="orka-mono">{c.key}</td>
                <td>
                  <span className={`orka-badge ${LOOKUP_BADGE[c.lookup]}`}>{c.lookup}</span>
                </td>
                <td>{c.description}</td>
                <td className="orka-mono">{c.json ?? ''}</td>
                <td>
                  <RowButtons onView={() => navigate(`/robot-capability/${c.id}/view`)} onEdit={readOnly ? undefined : () => navigate(`/robot-capability/${c.id}/edit`)} onDelete={readOnly ? undefined : () => del.ask(c.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {del.modal}
    </>
  );
}

/* ─────────────────────────────── Robot documents ─────────────────────────────── */

function RobotDocuments(props: { robotName: string | null }) {
  const { navigate, wm } = useOrka();
  const robots = useGame((s) => s.lab.orka.robots);
  const caps = useGame((s) => s.lab.orka.capabilities);
  const list = useMemo(() => Object.values(robots).sort((a, b) => a.id - b.id), [robots]);
  const robot = list.find((r) => r.name === props.robotName) ?? null;
  // Fetched (sim REST call) after render whenever the robot or capability tables change.
  const [doc, setDoc] = useState<{ text: string | null; error: string | null; robotId: number } | null>(null);
  useEffect(() => {
    if (!robot) {
      setDoc(null);
      return;
    }
    let next: { text: string | null; error: string | null; robotId: number } = { text: null, error: 'Server not reachable', robotId: robot.id };
    try {
      const res = sim.orka.rest('GET', `/api/robots/${robot.name}/capabilities`, null, 'player');
      if (res.status === 200) next = { text: JSON.stringify(JSON.parse(res.body)), error: null, robotId: robot.id };
      else if (res.status) next = { text: null, error: `${res.status} ${res.body}`, robotId: robot.id };
    } catch {
      /* fall back below */
    }
    if (!next.text) {
      try {
        const d = sim.orka.capabilityDocument(robot.id);
        if (d && Object.keys(d).length) next = { text: JSON.stringify(d), error: null, robotId: robot.id };
      } catch {
        /* not implemented */
      }
    }
    setDoc((prev) => (prev && prev.text === next.text && prev.error === next.error && prev.robotId === next.robotId ? prev : next));
  }, [robot, caps]);

  // Only once the document belongs to the selected robot (the effect above lags one render behind a switch).
  useOnce(robot && doc?.text && doc.robotId === robot.id ? `${robot.id}:${doc.text}` : null, () =>
    emitAppAction('orka', 'orka.capabilities.viewed', { robotId: robot!.id, robotName: robot!.name, document: doc!.text! }),
  );

  const parsed = doc?.text ? (JSON.parse(doc.text) as Record<string, unknown>) : null;
  return (
    <div>
      <Field label="Robot" hint="orka.capabilities.robotSelect">
        <select className="orka-control" style={{ maxWidth: 420 }} value={robot?.name ?? ''} onChange={(e) => navigate(withQuery('/robot-capability', { tab: 'documents', robot: e.target.value || null }))}>
          <option value="">Select a robot…</option>
          {list.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name} · {r.humanReadableName}
            </option>
          ))}
        </select>
      </Field>
      {robot && doc ? (
        doc.text ? (
          <>
            <div className="orka-label">
              Capability document · <span className="orka-mono">GET /api/robots/{robot.name}/capabilities</span>
            </div>
            <div className="orka-codebox">{doc.text}</div>
            <div className="orka-buttons" style={{ marginTop: 6 }}>
              <button type="button" className="orka-btn orka-btn-sm orka-btn-outline-secondary" onClick={() => wm?.clipboard.write(doc.text!, 'orka')}>
                <Fa.copy size={12} /> Copy
              </button>
            </div>
            <div className="orka-row" style={{ marginTop: 16 }}>
              <div className="orka-col orka-card">
                <div className="orka-card-title">Derived from the robot's device and rig</div>
                <dl className="orka-dl">
                  {DERIVED.filter((k) => parsed && k in parsed).map((k) => (
                    <div key={k} style={{ display: 'contents' }}>
                      <dt className="orka-mono">{k}</dt>
                      <dd className="orka-mono">{JSON.stringify(parsed![k])}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="orka-col orka-card">
                <div className="orka-card-title">Linked capability rows</div>
                <dl className="orka-dl">
                  {Object.keys(parsed ?? {})
                    .filter((k) => !DERIVED.includes(k))
                    .map((k) => {
                      const row = Object.values(caps).find((c) => c.key === k);
                      return (
                        <div key={k} style={{ display: 'contents' }}>
                          <dt className="orka-mono">{k}</dt>
                          <dd>
                            <span className="orka-mono">{JSON.stringify(parsed![k])}</span> {row ? <span className="orka-muted orka-small">({row.name} · {row.lookup})</span> : null}
                          </dd>
                        </div>
                      );
                    })}
                </dl>
              </div>
            </div>
          </>
        ) : (
          <div className="orka-alert orka-alert-danger">{doc.error}</div>
        )
      ) : null}
    </div>
  );
}

export function CapabilitiesPage() {
  const { query, navigate, readOnly } = useOrka();
  const docs = query.tab === 'documents';
  return (
    <div>
      <PageHeading title="Robot Capabilities">
        {!docs && !readOnly ? (
          <button type="button" className="orka-btn orka-btn-primary jh-create-entity" onClick={() => navigate('/robot-capability/new')}>
            <Fa.plus /> Create a new Robot Capability
          </button>
        ) : null}
      </PageHeading>
      <AlertArea />
      <Tabs active={docs ? 'documents' : 'rows'} />
      {docs ? <RobotDocuments robotName={query.robot ?? null} /> : <CapabilityRows />}
    </div>
  );
}

/* ─────────────────────────────── Match preview ─────────────────────────────── */

function gorthCapabilityFiles(): { path: string; caps: Record<string, unknown> }[] {
  const files = getState().lab.repos?.gorth?.files ?? {};
  const out: { path: string; caps: Record<string, unknown> }[] = [];
  for (const [p, text] of Object.entries(files)) {
    if (!/^go-sdk\/tests\/[^/]+\.json$/.test(p) && !/^suites\/.+\.json$/.test(p)) continue;
    try {
      const j = JSON.parse(text) as { capabilities?: Record<string, unknown> };
      if (j && typeof j.capabilities === 'object' && j.capabilities) out.push({ path: p, caps: j.capabilities });
    } catch {
      /* unparseable test file: not listed */
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function MatchPreviewPage() {
  const [json, setJson] = useState('');
  const [env, setEnv] = useState('DEV1');
  const [result, setResult] = useState<{ rows: MatchPreviewRow[] } | { error: string } | null>(null);
  const files = useMemo(gorthCapabilityFiles, []);

  const run = () => {
    let r: { ok: true; value: MatchPreviewRow[] } | { ok: false; error: string };
    try {
      JSON.parse(json);
    } catch (e) {
      r = { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
      setResult({ error: r.error });
      emitAppAction('orka', 'orka.matchPreview.ran', { capabilities: json, environment: env, matches: [], ok: false, error: r.error });
      return;
    }
    const fn = (sim.orka as { matchPreview?: typeof sim.orka.matchPreview }).matchPreview;
    r = simCall(() => {
      if (fn) return fn(json, env);
      const res = sim.orka.rest('POST', '/api/match-preview', JSON.stringify({ capabilities: JSON.parse(json), environment: env }), 'player');
      return res.status === 200 ? { ok: true as const, value: JSON.parse(res.body) as MatchPreviewRow[] } : { ok: false as const, error: `${res.status} ${res.body}` };
    });
    if (r.ok) {
      const rows = [...r.value.filter((x) => x.matches), ...r.value.filter((x) => !x.matches)];
      setResult({ rows });
      emitAppAction('orka', 'orka.matchPreview.ran', { capabilities: json, environment: env, matches: rows.filter((x) => x.matches).map((x) => x.robot), ok: true, error: null });
    } else {
      setResult({ error: r.error });
      emitAppAction('orka', 'orka.matchPreview.ran', { capabilities: json, environment: env, matches: [], ok: false, error: r.error });
    }
  };

  return (
    <div>
      <PageHeading title="Robot Capabilities" />
      <AlertArea />
      <Tabs active="match" />
      <div className="orka-card" data-hint="orka.capabilities.matchPreview">
        <div className="orka-row" style={{ alignItems: 'flex-start' }}>
          <div className="orka-col" style={{ flex: '2 1 0' }}>
            <Field label="Capabilities JSON">
              <textarea className="orka-control orka-mono" rows={5} placeholder='{"goSdk": true, "printer": true}' value={json} onChange={(e) => setJson(e.target.value)} />
            </Field>
          </div>
          <div className="orka-col">
            <Field label="Environment">
              <select className="orka-control" value={env} onChange={(e) => setEnv(e.target.value)}>
                {ENVIRONMENTS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Load from Gorth file…">
              <select
                className="orka-control"
                value=""
                onChange={(e) => {
                  const f = files.find((x) => x.path === e.target.value);
                  if (f) setJson(JSON.stringify(f.caps));
                }}
              >
                <option value="">{files.length ? 'Choose a test definition…' : 'No Gorth test files (gorth not loaded)'}</option>
                {files.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <button type="button" className="orka-btn orka-btn-primary" onClick={run} disabled={!json.trim()}>
          <Fa.play /> Preview match
        </button>
      </div>
      {result && 'error' in result ? <div className="orka-alert orka-alert-danger">{result.error}</div> : null}
      {result && 'rows' in result ? (
        <div className="orka-table-wrap">
          <table className="orka-table orka-table-striped">
            <thead>
              <tr>
                <th>Robot</th>
                <th>Status</th>
                <th>Match</th>
                <th>First failing key</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.robotId}>
                  <td>{r.robot}</td>
                  <td>
                    <StatusChip status={r.status} />
                  </td>
                  <td className={r.matches ? 'orka-ok' : 'orka-fail'} style={{ fontWeight: 700 }}>
                    {r.matches ? '✓' : '✗'}
                  </td>
                  <td className="orka-mono">{r.firstMismatch ?? ''}</td>
                </tr>
              ))}
              {result.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="orka-muted">
                    No robots in {env}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── Capability detail & form ─────────────────────────────── */

export function CapabilityDetailPage(props: { id: number }) {
  const { navigate, readOnly } = useOrka();
  const c = useGame((s) => s.lab.orka.capabilities[props.id]);
  if (!c) return <NotFound what={`Robot Capability ${props.id}`} />;
  return (
    <div>
      <h2>Robot Capability</h2>
      <hr />
      <dl className="orka-dl">
        <dt>ID</dt>
        <dd>{c.id}</dd>
        <dt>Name</dt>
        <dd>{c.name}</dd>
        <dt>Key</dt>
        <dd className="orka-mono">{c.key}</dd>
        <dt>Lookup</dt>
        <dd>{c.lookup}</dd>
        <dt>Description</dt>
        <dd>{c.description}</dd>
        <dt>JSON</dt>
        <dd className="orka-mono">{c.json ?? ''}</dd>
      </dl>
      <BackEditButtons onBack={() => navigate('/robot-capability')} onEdit={readOnly ? undefined : () => navigate(`/robot-capability/${c.id}/edit`)} />
    </div>
  );
}

export function CapabilityFormPage(props: { id: number | null }) {
  const { navigate, readOnly } = useOrka();
  const c = useGame((s) => (props.id != null ? s.lab.orka.capabilities[props.id] : null)) ?? null;
  const [f, setF] = useState({ name: c?.name ?? '', key: c?.key ?? '', lookup: (c?.lookup ?? 'BOTH') as CapabilityLookup, description: c?.description ?? '', json: c?.json ?? '' });
  const path = props.id != null ? `/robot-capability/${props.id}/edit` : '/robot-capability/new';
  let jsonErr: string | null = null;
  if (f.json.trim()) {
    try {
      JSON.parse(f.json);
    } catch (e) {
      jsonErr = `Invalid JSON: ${(e as Error).message}`;
    }
  }
  const errors = {
    name: validateText(f.name, 'Name', { required: true, pattern: /^[A-Z0-9_]+$/ }),
    key: validateText(f.key, 'Key', { required: true, pattern: /^[a-zA-Z][a-zA-Z0-9]*$/ }),
    json: jsonErr,
  };
  const invalid = Object.values(errors).some(Boolean);
  if (props.id != null && !c) return <NotFound what={`Robot Capability ${props.id}`} />;
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (invalid || readOnly) return;
    const row: Partial<RobotCapability> = { name: f.name, key: f.key, lookup: f.lookup, description: f.description, json: f.json.trim() || null, value: true };
    const r = simCall(() => sim.orka.saveCapability(c ? { id: c.id, ...row } : row, 'player'));
    if (!r.ok) {
      addAlert('danger', r.error, path);
      return;
    }
    emitAppAction('orka', 'orka.capability.saved', { capabilityId: r.value, name: f.name, created: !c });
    addAlert('success', c ? `A Robot Capability is updated with identifier ${r.value}` : `A new Robot Capability is created with identifier ${r.value}`, '/robot-capability');
    navigate('/robot-capability');
  };
  useCtrlS(() => save(), !readOnly);
  return (
    <form onSubmit={save} noValidate>
      <h2>Create or edit a Robot Capability</h2>
      <AlertArea />
      <div className="orka-card">
        {c ? (
          <Field label="ID">
            <input className="orka-control" readOnly value={c.id} />
          </Field>
        ) : null}
        <Field label="Name" error={f.name ? errors.name : null}>
          <input className="orka-control" value={f.name} disabled={readOnly} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Key" error={f.key ? errors.key : null}>
          <input className="orka-control orka-mono" value={f.key} disabled={readOnly} onChange={(e) => setF({ ...f, key: e.target.value })} />
        </Field>
        <Field label="Lookup">
          <select className="orka-control" value={f.lookup} disabled={readOnly} onChange={(e) => setF({ ...f, lookup: e.target.value as CapabilityLookup })}>
            {LOOKUPS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <input className="orka-control" value={f.description} disabled={readOnly} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="JSON" error={errors.json}>
          <textarea className="orka-control orka-mono" rows={3} value={f.json} disabled={readOnly} onChange={(e) => setF({ ...f, json: e.target.value })} />
        </Field>
      </div>
      <FormButtons onCancel={() => navigate('/robot-capability')} invalid={invalid} readOnly={readOnly} />
    </form>
  );
}
