/**
 * Administration › API — Swagger UI (OpenAPI 3) over the simulated Orca REST surface (Apps §2.12.1,
 * Sim §3.23). Try it out → Execute → `sim.orca.rest` (same engine as `curl` in the Terminal).
 */
import { useState } from 'react';
import { sim } from '@/sim';
import { emitAppAction } from '../../../apps';
import { useOrca } from '../shared';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
interface Param {
  name: string;
  in: 'path' | 'query';
  type: string;
  description: string;
  example?: string;
}
interface Op {
  method: Method;
  path: string;
  summary: string;
  params?: Param[];
  body?: string;
  ok?: string;
  errors?: [number, string][];
}

const ID: Param = { name: 'id', in: 'path', type: 'integer($int64)', description: 'Entity id', example: '1' };
const NAME: Param = { name: 'name', in: 'path', type: 'string', description: 'Robot Name (ROBOT_NAME)', example: 'wall-e' };
const crud = (res: string, entity: string, extra: Param[] = []): Op[] => [
  { method: 'GET', path: `/api/${res}`, summary: `Get all the ${entity}s`, params: extra },
  { method: 'POST', path: `/api/${res}`, summary: `Create a new ${entity}`, body: '{}', errors: [[400, 'Bad Request — validation error']] },
  { method: 'GET', path: `/api/${res}/{id}`, summary: `Get the "id" ${entity}`, params: [ID], errors: [[404, 'Not Found']] },
  { method: 'PUT', path: `/api/${res}/{id}`, summary: `Update an existing ${entity}`, params: [ID], body: '{}', errors: [[400, 'Bad Request'], [404, 'Not Found']] },
  { method: 'DELETE', path: `/api/${res}/{id}`, summary: `Delete the "id" ${entity}`, params: [ID], errors: [[404, 'Not Found']] },
];

const TAGS: { tag: string; desc: string; ops: Op[] }[] = [
  {
    tag: 'robot-resource',
    desc: 'Robot Resource',
    ops: crud('robots', 'robot', [
      { name: 'status.in', in: 'query', type: 'array[string]', description: 'Filter by status (Tate)', example: 'AVAILABLE' },
      { name: 'name.contains', in: 'query', type: 'string', description: 'Filter by name' },
      { name: 'environment.equals', in: 'query', type: 'string', description: 'BACKEND_ENV', example: 'DEV1' },
    ]),
  },
  { tag: 'robot-status-resource', desc: 'Robot Status Resource', ops: [{ method: 'PUT', path: '/api/robots/{id}/status', summary: 'Set a robot status (Connection Failed is set by the health check only)', params: [ID], body: '{"status":"RESERVED"}', errors: [[400, 'Bad Request: Connection Failed is set by the health check only']] }] },
  {
    tag: 'robot-capability-resource',
    desc: 'Robot Capability Resource',
    ops: [{ method: 'GET', path: '/api/robots/{name}/capabilities', summary: "The robot's capability document (canonical key order)", params: [NAME], ok: '{"deviceType":"FLEX_3","printer":true,"physicalTouch":true,…}' }, ...crud('robot-capabilities', 'robot capability')],
  },
  {
    tag: 'checkout-resource',
    desc: 'Checkout Resource',
    ops: [
      { method: 'POST', path: '/api/robots/checkout', summary: 'Check out a robot for a build (LRU among matching Available robots)', body: '{"buildId":"Java/uia-remote-regression-flex#4127","jobId":"Java/uia-remote-regression-flex","deviceType":"FLEX_3","environment":"DEV1"}', ok: '{"robot":"wall-e","deviceType":"FLEX_3","runType":"standalone","env":{…}}', errors: [[409, 'Conflict — no matching robot'], [423, 'Locked — robot blocked from checkouts']] },
      { method: 'POST', path: '/api/robots/{name}/release', summary: 'Release a checked-out robot', params: [NAME] },
    ],
  },
  { tag: 'match-preview-resource', desc: 'Match Preview Resource', ops: [{ method: 'POST', path: '/api/match-preview', summary: 'Which robots would match these capabilities (Tate)', body: '{"capabilities":{"goSdk":true,"printer":true},"environment":"DEV1"}', ok: '[{"robot":"vision","matches":true,"status":"AVAILABLE"}]' }] },
  {
    tag: 'xy-touch-resource',
    desc: 'Xy Touch Resource',
    ops: [
      {
        method: 'POST',
        path: '/api/xy_touch',
        summary: 'Look up a Screen Location (mm) and tap it (ADB touch or physical probe)',
        body: '{"robot":"wall-e","screen":"TENDER_CASH_DISCOUNT","button":"Cash"}',
        ok: '{"result":"OK","mode":"PHYSICAL_TAP","x_mm":22.0,"y_mm":58.5}',
        errors: [
          [400, 'Bad Request'],
          [404, 'Not Found — no Screen Location for that button'],
          [409, 'Conflict: LOCK_RELEASED (park required)'],
          [423, 'Locked — test in progress'],
          [502, 'Bad Gateway — robot controller error'],
          [503, 'Service Unavailable — controller unreachable'],
        ],
      },
    ],
  },
  {
    tag: 'card-resource',
    desc: 'Card Resource',
    ops: (['swipe', 'dip', 'tap'] as const).map((e) => ({
      method: 'POST' as const,
      path: `/api/card/${e}`,
      summary: `${e[0]!.toUpperCase()}${e.slice(1)} a card profile through Callus → probe`,
      body: `{"robot":"wall-e","profile":"VISA_STD_${e.toUpperCase()}"}`,
      ok: `{"result":"OK","entry":"${e.toUpperCase()}","probe":"collis-wall-e","callus":"10.42.20.1:9000"}`,
    })),
  },
  { tag: 'screen-compare-resource', desc: 'Screen Compare Resource', ops: [{ method: 'POST', path: '/api/screen-compare/{name}/test', summary: 'Capture the webcam, crop, OCR and compare (deprecated)', params: [{ name: 'name', in: 'path', type: 'string', description: 'Screen Compare Image name', example: 'CFD_TOTAL' }], ok: '{"text":"TOTAL $10.83","expected":"TOTAL $10.83","match":true}' }, ...crud('screen-compare-images', 'screen compare image')] },
  { tag: 'health-check-resource', desc: 'Health Check Resource', ops: [{ method: 'POST', path: '/api/health-check/run', summary: 'Run the health check now (tutorial)', errors: [[403, 'Force health check is disabled in this environment']] }] },
  { tag: 'device-resource', desc: 'Device Resource', ops: crud('devices', 'device') },
  { tag: 'merchant-config-resource', desc: 'Merchant Config Resource', ops: crud('merchant-configs', 'merchant config') },
  { tag: 'screen-resource', desc: 'Screen Resource', ops: crud('screens', 'screen', [{ name: 'deviceType.equals', in: 'query', type: 'string', description: 'Device Type', example: 'FLEX_3' }]) },
  { tag: 'screen-location-resource', desc: 'Screen Location Resource', ops: crud('screen-locations', 'screen location', [{ name: 'screenId.equals', in: 'query', type: 'integer', description: 'Screen id' }]) },
  { tag: 'card-profile-resource', desc: 'Card Profile Resource', ops: crud('card-profiles', 'card profile') },
  { tag: 'management', desc: 'Spring Boot Actuator', ops: [{ method: 'GET', path: '/management/health', summary: 'Actuator web endpoint "health"', ok: '{"status":"UP"}' }] },
];

const COLORS: Record<Method, { c: string; bg: string }> = {
  GET: { c: '#61affe', bg: 'rgba(97,175,254,.1)' },
  POST: { c: '#49cc90', bg: 'rgba(73,204,144,.1)' },
  PUT: { c: '#fca130', bg: 'rgba(252,161,48,.1)' },
  DELETE: { c: '#f93e3e', bg: 'rgba(249,62,62,.1)' },
};
const ORIGIN = 'http://orca.lab.local:8080';

/**
 * Pretty-print JSON the way Swagger UI shows it, but keeping every token as sent (`22.0` stays `22.0`, so the
 * page matches `curl` in the Terminal byte for byte apart from whitespace). Invalid JSON is returned as is.
 */
export function pretty(body: string): string {
  try {
    JSON.parse(body);
  } catch {
    return body;
  }
  let out = '';
  let depth = 0;
  let inStr = false;
  const nl = () => `\n${'  '.repeat(depth)}`;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (inStr) {
      out += ch;
      if (ch === '\\') out += body[++i] ?? '';
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === '{' || ch === '[') {
      const close = ch === '{' ? '}' : ']';
      let j = i + 1;
      while (j < body.length && /\s/.test(body[j]!)) j++;
      if (body[j] === close) {
        out += ch + close;
        i = j;
      } else {
        depth++;
        out += ch + nl();
      }
    } else if (ch === '}' || ch === ']') {
      depth--;
      out += nl() + ch;
    } else if (ch === ',') {
      out += ',' + nl();
    } else if (ch === ':') {
      out += ': ';
    } else if (!/\s/.test(ch)) {
      out += ch;
    }
  }
  return out;
}

function Operation(props: { op: Op }) {
  const { op } = props;
  const { wm } = useOrca();
  const [open, setOpen] = useState(false);
  const [trying, setTrying] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries((op.params ?? []).map((p) => [p.name, p.example ?? ''])));
  const [body, setBody] = useState(op.body ? pretty(op.body) : '');
  const [resp, setResp] = useState<{ url: string; curl: string; status: number; body: string; headers: Record<string, string> } | null>(null);
  const col = COLORS[op.method];

  const execute = () => {
    let p = op.path;
    const q: string[] = [];
    for (const prm of op.params ?? []) {
      const v = vals[prm.name] ?? '';
      if (prm.in === 'path') p = p.replace(`{${prm.name}}`, encodeURIComponent(v));
      else if (v) q.push(`${prm.name}=${encodeURIComponent(v)}`);
    }
    const path = q.length ? `${p}?${q.join('&')}` : p;
    let compact: string | null = null;
    if (op.body !== undefined) {
      try {
        compact = JSON.stringify(JSON.parse(body));
      } catch {
        compact = body;
      }
    }
    let r: { status: number; body: string; headers?: Record<string, string> };
    try {
      r = sim.orca.rest(op.method, path, compact, 'player');
    } catch {
      r = { status: 0, body: 'TypeError: Failed to fetch' };
    }
    const curl = [`curl -X '${op.method}' \\`, `  '${ORIGIN}${path}' \\`, `  -H 'accept: */*'${compact != null ? ' \\' : ''}`];
    if (compact != null) curl.push(`  -H 'Content-Type: application/json' \\`, `  -d '${compact}'`);
    setResp({ url: `${ORIGIN}${path}`, curl: curl.join('\n'), status: r.status, body: r.body, headers: r.headers ?? { 'content-type': 'application/json', 'cache-control': 'no-cache, no-store, max-age=0, must-revalidate' } });
    emitAppAction('orca', 'orca.api.executed', { method: op.method, path, status: r.status });
  };

  return (
    <div className="orca-sw-op" style={{ ['--sw-c' as string]: col.c, ['--sw-bg' as string]: col.bg }}>
      <button type="button" className="orca-sw-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="orca-sw-method">{op.method}</span>
        <span className="orca-sw-path">{op.path}</span>
        <span className="orca-sw-desc">{op.summary}</span>
      </button>
      {open ? (
        <div className="orca-sw-body">
          <div className="orca-sw-section">
            <span>Parameters</span>
            <button type="button" className={`orca-sw-btn${trying ? ' orca-sw-btn-cancel' : ''}`} onClick={() => setTrying((t) => !t)}>
              {trying ? 'Cancel' : 'Try it out'}
            </button>
          </div>
          {op.params?.length ? (
            <table className="orca-sw-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {op.params.map((p) => (
                  <tr key={p.name}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {p.name}
                        {p.in === 'path' ? <span style={{ color: 'red' }}> *</span> : null}
                      </div>
                      <div style={{ fontSize: 12 }}>{p.type}</div>
                      <div style={{ fontSize: 12, fontStyle: 'italic', color: '#999' }}>({p.in})</div>
                    </td>
                    <td>
                      {p.description}
                      {trying ? (
                        <div>
                          <input value={vals[p.name] ?? ''} placeholder={p.name} onChange={(e) => setVals({ ...vals, [p.name]: e.target.value })} />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 13, padding: '4px 0' }}>No parameters</div>
          )}
          {op.body !== undefined ? (
            <>
              <div className="orca-sw-section">
                <span>Request body</span>
                <span style={{ fontWeight: 400, fontSize: 12 }}>application/json</span>
              </div>
              {trying ? <textarea value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} /> : <pre className="orca-sw-pre">{pretty(op.body)}</pre>}
            </>
          ) : null}
          {trying ? (
            <button type="button" className="orca-sw-execute" onClick={execute}>
              Execute
            </button>
          ) : null}
          {resp ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginTop: 14 }}>Curl</div>
              <pre className="orca-sw-pre">{resp.curl}</pre>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Request URL</div>
              <pre className="orca-sw-pre">{resp.url}</pre>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Server response</div>
              <table className="orca-sw-table">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Code</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{resp.status || 'Undocumented'}</td>
                    <td>
                      <div style={{ fontSize: 12 }}>Response body</div>
                      <pre className="orca-sw-pre">{pretty(resp.body)}</pre>
                      <button type="button" className="orca-sw-btn" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => wm?.clipboard.write(resp.body, 'orca')}>
                        Copy
                      </button>
                      <div style={{ fontSize: 12, marginTop: 8 }}>Response headers</div>
                      <pre className="orca-sw-pre">{Object.entries(resp.headers).map(([k, v]) => ` ${k}: ${v}`).join('\n')}</pre>
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : null}
          <div className="orca-sw-section">
            <span>Responses</span>
          </div>
          <table className="orca-sw-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Code</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{op.method === 'POST' && !op.ok ? (op.path.includes('health-check') ? 202 : 201) : 200}</td>
                <td>
                  OK
                  {op.ok ? <pre className="orca-sw-pre">{op.ok}</pre> : null}
                </td>
              </tr>
              {(op.errors ?? []).map(([c, d]) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function SwaggerPage() {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  return (
    <div className="orca-sw">
      <div className="orca-sw-head">
        <h2>Orchestrator API</h2>
        <span className="orca-sw-ver">3.14.2</span>
        <span className="orca-sw-ver orca-sw-oas">OAS 3.0</span>
      </div>
      <button type="button" className="orca-link" style={{ fontSize: 14 }}>
        /v3/api-docs
      </button>
      <div style={{ fontSize: 14, marginTop: 8 }}>Orchestrator API documentation — robots, checkouts, coordinates, cards and health checks.</div>
      <div className="orca-sw-servers">
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Servers</label>
        <select className="orca-control" style={{ width: 'auto', fontWeight: 700 }} defaultValue={ORIGIN}>
          <option value={ORIGIN}>{ORIGIN} - Generated server url</option>
        </select>
      </div>
      {TAGS.map((t) => {
        const isClosed = closed.has(t.tag);
        return (
          <section key={t.tag}>
            <button
              type="button"
              className="orca-sw-tag"
              aria-expanded={!isClosed}
              onClick={() =>
                setClosed((s) => {
                  const n = new Set(s);
                  if (n.has(t.tag)) n.delete(t.tag);
                  else n.add(t.tag);
                  return n;
                })
              }
            >
              {t.tag}
              <small>{t.desc}</small>
              <span style={{ marginLeft: 'auto', fontSize: 14 }}>{isClosed ? '▸' : '▾'}</span>
            </button>
            {isClosed ? null : t.ops.map((op) => <Operation key={`${op.method} ${op.path}`} op={op} />)}
          </section>
        );
      })}
    </div>
  );
}
