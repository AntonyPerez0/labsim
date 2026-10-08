/**
 * Screen Compare Image (Apps §2.11): deprecation banner on every page, list/detail/form, the `▶ Test` panel
 * (webcam frame + magenta bbox + ×2 crop + the Pi's OCR log line) and the [game] CFD layout v2 toggle.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import type { ScreenCompareImage } from '@/sim/types';
import { emitAppAction, findWebcamFeed } from '../../../apps';
import { getEngine } from '../../../shell/engineBridge';
import { Fa } from '../icons';
import { AlertArea, BackEditButtons, Field, FormButtons, NotFound, PageHeading, RowButtons, addAlert, simCall, useCtrlS, useOrca, useOrcaGate, validateNumber, validateText } from '../shared';
import { useDeleteFlow } from './common';

function Deprecated() {
  return (
    <div className="orca-alert orca-alert-warning">
      <strong>Deprecated</strong>
      <br />
      Screen Compare Images (webcam crop → Tesseract OCR) are being phased out. UI Automator 2.3 locates elements on both Station Duo displays natively — migrate checks with displayId locators instead.
    </div>
  );
}

const dots = (s: string) => s.replace(/^ +| +$/g, (m) => '·'.repeat(m.length));

export function ScreenComparesPage() {
  const { navigate, readOnly } = useOrca();
  const rows = useGame((s) => s.lab.orca.screenCompareImages);
  const robots = useGame((s) => s.lab.orca.robots);
  const del = useDeleteFlow('screenCompareImage', '/screen-compare-image');
  return (
    <div>
      <PageHeading title="Screen Compare Images">
        {readOnly ? null : (
          <button type="button" className="orca-btn orca-btn-primary jh-create-entity" onClick={() => navigate('/screen-compare-image/new')} data-hint="orca.screenCompares.create">
            <Fa.plus /> Create a new Screen Compare Image
          </button>
        )}
      </PageHeading>
      <Deprecated />
      <AlertArea />
      <div className="orca-table-wrap">
        <table className="orca-table orca-table-striped">
          <thead>
            <tr>
              {['ID', 'Name', 'Robot', 'Screen', 'X', 'Y', 'W', 'H', 'Expected Text', 'Deprecated', 'Used By', ''].map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.values(rows).map((c) => (
              <tr key={c.id}>
                <td>
                  <button type="button" className="orca-link" onClick={() => navigate(`/screen-compare-image/${c.id}/view`)}>
                    {c.id}
                  </button>
                </td>
                <td className="orca-mono">{c.name}</td>
                <td>{robots[c.robotId]?.name ?? c.robotId}</td>
                <td className="orca-mono">{c.screenName}</td>
                <td>{c.bbox.x}</td>
                <td>{c.bbox.y}</td>
                <td>{c.bbox.w}</td>
                <td>{c.bbox.h}</td>
                <td className="orca-mono">{dots(c.expectedText)}</td>
                <td>{c.deprecated ? '✓' : ''}</td>
                <td className="orca-mono orca-small">{c.usedBy.join(', ')}</td>
                <td>
                  <RowButtons onView={() => navigate(`/screen-compare-image/${c.id}/view`)} onEdit={readOnly ? undefined : () => navigate(`/screen-compare-image/${c.id}/edit`)} onDelete={readOnly ? undefined : () => del.ask(c.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {del.modal}
    </div>
  );
}

const LIVE_SCREEN_COMPARE = false;

/** Draw the robot's current webcam frame (1280×720) into a canvas: live capture when the world registered it. */
async function drawFrame(ctx: CanvasRenderingContext2D, url: string, fallbackText: string, bbox: ScreenCompareImage['bbox']): Promise<void> {
  ctx.fillStyle = '#16181c';
  ctx.fillRect(0, 0, 1280, 720);
  // The world's webcams are not solved to the Orca bbox (World App. B "solved projection" is not built),
  // so a live 3D frame would put the bbox overlay off the label: use the frame-model drawing unless enabled.
  const feed = url && LIVE_SCREEN_COMPARE ? findWebcamFeed(url) : null;
  const engine = feed ? await getEngine() : null;
  if (feed && engine) {
    for (const t of feed.tiles) {
      const off = document.createElement('canvas');
      off.width = t.w;
      off.height = t.h;
      const octx = off.getContext('2d');
      if (!octx) continue;
      try {
        engine.captureView(t.camera, octx, t.w, t.h);
        ctx.drawImage(off, t.x, t.y);
      } catch {
        /* capture failed: keep the synthetic background */
      }
    }
    return;
  }
  // Synthetic frame: the CFD as seen by the webcam (dark bezel, light screen, the label at the bbox).
  ctx.fillStyle = '#2a2d33';
  ctx.fillRect(250, 120, 780, 500);
  ctx.fillStyle = '#eef1f4';
  ctx.fillRect(300, 160, 680, 425);
  ctx.fillStyle = '#1b1f24';
  ctx.font = `600 ${Math.max(12, Math.round(bbox.h * 0.62))}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(fallbackText, bbox.x + 6, bbox.y + bbox.h / 2, Math.max(10, bbox.w - 8));
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.font = '14px monospace';
  ctx.fillText(url || 'no camera stream URL', 12, 700);
}

function TestPanel(props: { c: ScreenCompareImage }) {
  const { c } = props;
  const robot = useGame((s) => s.lab.orca.robots[c.robotId]);
  const [res, setRes] = useState<{ ok: true; text: string; match: boolean } | { ok: false; error: string } | null>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);
  const cropRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!res) return;
    const fc = frameRef.current?.getContext('2d');
    const cc = cropRef.current?.getContext('2d');
    if (!fc || !cc) return;
    let alive = true;
    void drawFrame(fc, robot?.cameraStreamUrl ?? '', res.ok ? res.text : '', c.bbox).then(() => {
      if (!alive) return;
      cc.imageSmoothingEnabled = false;
      cc.clearRect(0, 0, c.bbox.w * 2, c.bbox.h * 2);
      cc.drawImage(fc.canvas, c.bbox.x, c.bbox.y, c.bbox.w, c.bbox.h, 0, 0, c.bbox.w * 2, c.bbox.h * 2);
      fc.strokeStyle = '#ff00ff';
      fc.lineWidth = 3;
      fc.strokeRect(c.bbox.x, c.bbox.y, c.bbox.w, c.bbox.h);
    });
    return () => {
      alive = false;
    };
  }, [res, robot?.cameraStreamUrl, c.bbox]);

  const run = () => {
    const r = simCall(() => sim.ocr.compare(c.id));
    if (r.ok) setRes({ ok: true, text: r.value.text, match: r.value.match });
    else setRes({ ok: false, error: r.error });
    emitAppAction('orca', 'orca.screenCompare.tested', {
      compareId: c.id,
      name: c.name,
      text: r.ok ? r.value.text : '',
      expected: c.expectedText,
      match: r.ok ? r.value.match : null,
      ok: r.ok,
      error: r.ok ? null : r.error,
    });
  };

  const line = res && res.ok ? `[ocr] capture webcam → crop ${c.bbox.w}x${c.bbox.h}@${c.bbox.x},${c.bbox.y} → tesseract → "${res.text}" → match=${res.match}` : null;
  return (
    <div className="orca-card" style={{ marginTop: 16 }}>
      <div className="orca-card-title">Test</div>
      <button type="button" className="orca-btn orca-btn-success" onClick={run} data-hint="orca.screenCompare.test">
        <Fa.play /> Test
      </button>
      {res ? (
        <div style={{ marginTop: 12 }}>
          {res.ok ? (
            <div className="orca-row" style={{ alignItems: 'flex-start' }}>
              <canvas ref={frameRef} width={1280} height={720} style={{ width: 640, height: 360, border: '1px solid #dee2e6', background: '#000' }} aria-label="Webcam frame" />
              <div>
                <div className="orca-small orca-muted">Crop ×2</div>
                <canvas ref={cropRef} width={c.bbox.w * 2} height={c.bbox.h * 2} style={{ border: '1px solid #ff00ff', maxWidth: 520 }} aria-label="Crop" />
              </div>
            </div>
          ) : null}
          <div className="orca-codebox" style={{ marginTop: 10 }}>
            {res.ok ? line : res.error}
          </div>
          {res.ok ? (
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }} className={res.match ? 'orca-ok' : 'orca-fail'}>
              match={String(res.match)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LayoutV2Toggle() {
  const gate = useOrcaGate();
  const mode = useGame((s) => s.lab.config?.mode);
  const on = useGame((s) => !!s.lab.flags.cfdLayoutV2Toggle);
  if (!(mode === 'academy' || mode === 'freeplay' || gate.layoutV2Toggle)) return null;
  return (
    <label className="orca-check" style={{ marginTop: 12, padding: '6px 10px', border: '1px solid #f5b301', borderRadius: 16 }} data-hint="orca.screenCompare.layoutV2" title="Tutorial helper — not part of the real Orca">
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => {
          try {
            sim.setFlag('cfdLayoutV2Toggle', e.target.checked);
          } catch (err) {
            console.warn('[orca] setFlag failed', err);
          }
          emitAppAction('orca', 'orca.screenCompare.layoutV2Toggled', { on: e.target.checked });
        }}
      />
      CFD layout v2 (tutorial)
    </label>
  );
}

export function ScreenCompareDetailPage(props: { id: number }) {
  const { navigate, readOnly } = useOrca();
  const c = useGame((s) => s.lab.orca.screenCompareImages[props.id]);
  const robot = useGame((s) => (c ? s.lab.orca.robots[c.robotId] : undefined));
  if (!c) return <NotFound what={`Screen Compare Image ${props.id}`} />;
  return (
    <div>
      <h2>Screen Compare Image</h2>
      <Deprecated />
      <hr />
      <AlertArea />
      <dl className="orca-dl">
        <dt>ID</dt>
        <dd>{c.id}</dd>
        <dt>Name</dt>
        <dd className="orca-mono">{c.name}</dd>
        <dt>Robot</dt>
        <dd>{robot?.name ?? c.robotId}</dd>
        <dt>Screen</dt>
        <dd className="orca-mono">{c.screenName}</dd>
        <dt>X / Y / W / H (px)</dt>
        <dd>
          {c.bbox.x} / {c.bbox.y} / {c.bbox.w} / {c.bbox.h}
        </dd>
        <dt>Expected Text</dt>
        <dd className="orca-mono">{dots(c.expectedText)}</dd>
        <dt>Deprecated</dt>
        <dd>{c.deprecated ? 'true' : 'false'}</dd>
        <dt>Used By</dt>
        <dd className="orca-mono">{c.usedBy.join(', ')}</dd>
      </dl>
      <BackEditButtons onBack={() => navigate('/screen-compare-image')} onEdit={readOnly ? undefined : () => navigate(`/screen-compare-image/${c.id}/edit`)} />
      <LayoutV2Toggle />
      <TestPanel c={c} />
    </div>
  );
}

export function ScreenCompareFormPage(props: { id: number | null }) {
  const { navigate, readOnly } = useOrca();
  const c = useGame((s) => (props.id != null ? s.lab.orca.screenCompareImages[props.id] : null)) ?? null;
  const robots = useGame((s) => s.lab.orca.robots);
  const [f, setF] = useState({
    name: c?.name ?? '',
    robotId: c ? String(c.robotId) : '',
    screenName: c?.screenName ?? '',
    x: c ? String(c.bbox.x) : '',
    y: c ? String(c.bbox.y) : '',
    w: c ? String(c.bbox.w) : '',
    h: c ? String(c.bbox.h) : '',
    expectedText: c?.expectedText ?? '',
    deprecated: c?.deprecated ?? false,
  });
  const path = props.id != null ? `/screen-compare-image/${props.id}/edit` : '/screen-compare-image/new';
  const int = (v: string) => validateNumber(v, { required: true, min: 0, integer: true });
  const errors = { name: validateText(f.name, 'Name', { required: true, pattern: /^[A-Z0-9_]+$/ }), robotId: f.robotId ? null : 'This field is required.', x: int(f.x), y: int(f.y), w: int(f.w), h: int(f.h) };
  const invalid = Object.values(errors).some(Boolean);
  if (props.id != null && !c) return <NotFound what={`Screen Compare Image ${props.id}`} />;
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (invalid || readOnly) return;
    const bbox = { x: Number(f.x), y: Number(f.y), w: Number(f.w), h: Number(f.h) };
    const row: Partial<ScreenCompareImage> = { name: f.name, robotId: Number(f.robotId), screenName: f.screenName, bbox, expectedText: f.expectedText, deprecated: f.deprecated, usedBy: c?.usedBy ?? [] };
    const r = simCall(() => sim.orca.saveScreenCompareImage(c ? { id: c.id, ...row } : row, 'player'));
    if (!r.ok) {
      addAlert('danger', r.error, path);
      return;
    }
    emitAppAction('orca', 'orca.screenCompare.saved', { compareId: r.value, name: f.name, created: !c, ...bbox, expected: f.expectedText });
    addAlert('success', c ? `A Screen Compare Image is updated with identifier ${r.value}` : `A new Screen Compare Image is created with identifier ${r.value}`, `/screen-compare-image/${r.value}/view`);
    navigate(`/screen-compare-image/${r.value}/view`);
  };
  useCtrlS(() => save(), !readOnly);
  const num = (k: 'x' | 'y' | 'w' | 'h', label: string) => (
    <Field label={label} error={f[k] ? errors[k] : null}>
      <input className="orca-control" type="number" step="1" min="0" value={f[k]} disabled={readOnly} onChange={(e) => set({ [k]: e.target.value } as Partial<typeof f>)} />
    </Field>
  );
  return (
    <form onSubmit={save} noValidate>
      <h2>Create or edit a Screen Compare Image</h2>
      <Deprecated />
      <AlertArea />
      <div className="orca-card">
        <div className="orca-grid2">
          <Field label="Name" error={f.name ? errors.name : null}>
            <input className="orca-control orca-mono" value={f.name} disabled={readOnly} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Robot">
            <select className="orca-control" value={f.robotId} disabled={readOnly} onChange={(e) => set({ robotId: e.target.value })}>
              <option value="" />
              {Object.values(robots).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Screen" text="e.g. CFD_CART">
            <input className="orca-control orca-mono" value={f.screenName} disabled={readOnly} onChange={(e) => set({ screenName: e.target.value })} />
          </Field>
        </div>
        <div className="orca-grid2">
          {num('x', 'X')}
          {num('y', 'Y')}
          {num('w', 'W')}
          {num('h', 'H')}
        </div>
        <p className="orca-form-text" style={{ marginTop: -6 }}>
          Pixels of the 1280 × 720 webcam frame.
        </p>
        <Field label="Expected Text" text="Exact, case-sensitive match.">
          <input className="orca-control orca-mono" value={f.expectedText} disabled={readOnly} onChange={(e) => set({ expectedText: e.target.value })} />
        </Field>
        <label className="orca-check">
          <input type="checkbox" checked={f.deprecated} disabled={readOnly} onChange={(e) => set({ deprecated: e.target.checked })} />
          Deprecated
        </label>
      </div>
      <FormButtons onCancel={() => navigate(c ? `/screen-compare-image/${c.id}/view` : '/screen-compare-image')} invalid={invalid} readOnly={readOnly} />
    </form>
  );
}
