/**
 * Jenkins job Configure page (Apps §3.6): General (description, parameters = saved defaults, schedule),
 * Advanced Project Options, Pipeline (ACE-like Groovy script editor). Save/Apply → `sim.jenkins.saveJob`.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import { emitAppAction } from '@/computer/apps';
import type { JobParam } from '@/sim/types';
import { useJk, simTry } from '../ctx';
import { Breadcrumbs, Footer, SidePanel } from '../Layout';
import { jobCrumbs, jobTasks, NotFoundShell, useBuildNow } from './Job';
import { jobUrl } from '../model';

/* ─────────────────────────── Groovy highlighting ─────────────────────────── */

const KW = new Set(['def', 'pipeline', 'agent', 'stages', 'stage', 'steps', 'script', 'post', 'always', 'success', 'failure', 'environment', 'parameters', 'options', 'when', 'node', 'label', 'if', 'else', 'return', 'true', 'false', 'null', 'new', 'for', 'in', 'try', 'catch', 'finally', 'sh', 'echo', 'git', 'triggers', 'cron', 'string', 'choice', 'booleanParam']);

export function highlightGroovy(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const push = (cls: string | null, text: string) => {
    out.push(cls ? (
      <span key={k++} className={cls}>
        {text}
      </span>
    ) : (
      <Fragment key={k++}>{text}</Fragment>
    ));
  };
  while (i < line.length) {
    const rest = line.slice(i);
    if (rest.startsWith('//')) {
      push('jk-g-com', rest);
      break;
    }
    const ch = line[i]!;
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === '\\' ? 2 : 1;
      push('jk-g-str', line.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    const pm = /^params\.[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (pm) {
      push('jk-g-param', pm[0]);
      i += pm[0].length;
      continue;
    }
    const wm = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (wm) {
      push(KW.has(wm[0]) ? 'jk-g-kw' : null, wm[0]);
      i += wm[0].length;
      continue;
    }
    const nm = /^\d+(\.\d+)?/.exec(rest);
    if (nm) {
      push('jk-g-num', nm[0]);
      i += nm[0].length;
      continue;
    }
    const pl = /^[^A-Za-z_0-9"'/]+|^\//.exec(rest);
    const t = pl ? pl[0] : ch;
    push(null, t);
    i += t.length;
  }
  return out;
}

/* ─────────────────────────── Script editor ─────────────────────────── */

function ScriptEditor(props: { value: string; onChange(v: string): void; readOnly: boolean; onLineClick(line: number, text: string): void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [active, setActive] = useState(1);
  const [clicked, setClicked] = useState<number | null>(null);
  const lines = useMemo(() => props.value.split('\n'), [props.value]);
  const lineOf = (pos: number) => props.value.slice(0, pos).split('\n').length;
  const updateActive = () => {
    const el = ta.current;
    if (el) setActive(lineOf(el.selectionStart));
  };
  return (
    <div className="jk-editor" data-hint="jenkins.scriptEditor">
      <div className="jk-editor-gutter" aria-hidden="true">
        {lines.map((_, i) => (
          <div key={i} className={i + 1 === active ? 'jk-gl-active' : undefined}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="jk-editor-code">
        <pre className="jk-editor-pre" aria-hidden="true">
          {lines.map((l, i) => (
            <span key={i} className={`jk-editor-line${i + 1 === clicked ? ' jk-editor-line-clicked' : i + 1 === active ? ' jk-editor-line-active' : ''}`}>
              {highlightGroovy(l)}
              {'\n'}
            </span>
          ))}
        </pre>
        <textarea
          ref={ta}
          className="jk-editor-ta"
          value={props.value}
          readOnly={props.readOnly}
          spellCheck={false}
          wrap="off"
          aria-label="Script"
          onChange={(e) => {
            props.onChange(e.target.value);
            setClicked(null);
          }}
          onKeyUp={updateActive}
          onSelect={updateActive}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !props.readOnly) {
              e.preventDefault();
              const el = e.currentTarget;
              const s = el.selectionStart;
              const v = props.value.slice(0, s) + '  ' + props.value.slice(el.selectionEnd);
              props.onChange(v);
              requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
            }
          }}
          onMouseUp={(e) => {
            const el = e.currentTarget;
            if (el.selectionStart !== el.selectionEnd) return; // a drag selection is not a line click
            const line = lineOf(el.selectionStart);
            setActive(line);
            setClicked(line);
            props.onLineClick(line, lines[line - 1] ?? '');
          }}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

type Section = 'General' | 'Advanced Project Options' | 'Pipeline';

export function ConfigurePage(props: { jobId: string }) {
  const { navigate, notice, readOnly } = useJk();
  const job = useGame((s) => s.lab.jenkins.jobs[props.jobId]) ?? null;
  const buildNow = useBuildNow(job);
  const [desc, setDesc] = useState('');
  const [script, setScript] = useState('');
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [params, setParams] = useState<JobParam[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [sandbox, setSandbox] = useState(true);
  const [section, setSection] = useState<Section>('General');
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const jobKey = job ? job.id : null;

  const reset = () => {
    if (!job) return;
    setDesc(job.description ?? '');
    setScript(job.script ?? '');
    setSaved({ ...(job.savedParams ?? {}) });
    setParams(job.params.map((p) => ({ ...p })));
    setDisabled(!!job.disabled);
    setError(null);
  };
  useEffect(() => {
    reset();
    if (job) emitAppAction('jenkins', 'jenkins.script.viewed', { jobId: job.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobKey]);

  if (!job || job.exists === false) return <NotFoundShell />;

  const save = (andLeave: boolean) => {
    if (readOnly) return;
    const changed: string[] = [];
    const patch: Parameters<typeof sim.jenkins.saveJob>[1] = {};
    if (script !== job.script) {
      changed.push('script');
      patch.script = script;
    }
    const savedChanged = job.params.some((p) => (saved[p.name] ?? '') !== (job.savedParams?.[p.name] ?? ''));
    const paramsChanged = params.some((p, i) => p.description !== job.params[i]?.description);
    if (savedChanged || paramsChanged) {
      changed.push('params');
      patch.savedParams = { ...saved };
      if (paramsChanged) patch.params = params;
    }
    if (desc !== job.description) {
      changed.push('description');
      patch.description = desc;
    }
    if (disabled !== !!job.disabled) {
      changed.push('disabled');
      patch.disabled = disabled;
    }
    const r = changed.length ? simTry(() => sim.jenkins.saveJob(job.id, patch, 'player')) : ({ ok: true, value: undefined } as const);
    emitAppAction('jenkins', 'jenkins.job.configured', { jobId: job.id, changed, ok: r.ok, error: r.ok ? null : r.error });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    if (andLeave) navigate(jobUrl(job.id));
    else notice('Saved');
  };

  const go = (s: Section) => {
    setSection(s);
    const el = formRef.current?.querySelector<HTMLElement>(`[data-section="${s}"]`);
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <>
      <Breadcrumbs crumbs={jobCrumbs(job, [{ label: 'Configuration' }])} />
      <div className="jk-body">
        <SidePanel tasks={jobTasks(job, 'configure', buildNow)} widgets={false} />
        <main className="jk-main">
          <h1>Configure</h1>
          {error ? (
            <div className="jk-banner jk-banner-error" role="alert">
              <span>
                <b>Error</b> — {error}
              </span>
            </div>
          ) : null}
          <div className="jk-config">
            <nav className="jk-config-nav" aria-label="Configure sections">
              {(['General', 'Advanced Project Options', 'Pipeline'] as Section[]).map((s) => (
                <button key={s} type="button" aria-current={section === s} onClick={() => go(s)}>
                  {s}
                </button>
              ))}
            </nav>
            <div className="jk-config-form" ref={formRef}>
              <section className="jk-section" data-section="General">
                <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  General
                  <label className="jk-check" style={{ fontSize: 14, fontWeight: 400 }}>
                    <input type="checkbox" checked={!disabled} disabled={readOnly} onChange={(e) => setDisabled(!e.target.checked)} />
                    {disabled ? 'Disabled' : 'Enabled'}
                  </label>
                </h2>
                <div className="jk-field">
                  <label htmlFor="jk-desc">Description</label>
                  <textarea id="jk-desc" className="jk-textarea" value={desc} disabled={readOnly} onChange={(e) => setDesc(e.target.value)} />
                </div>
                <div className="jk-field">
                  <label className="jk-check">
                    <input type="checkbox" checked readOnly disabled />
                    Discard old builds
                  </label>
                  <div className="jk-subcard">
                    <div className="jk-field-label">Strategy</div>
                    <div style={{ marginBottom: 8 }}>Log Rotation</div>
                    <div className="jk-field-label">Max # of builds to keep</div>
                    <input className="jk-input" value="20" readOnly disabled style={{ maxWidth: 200 }} />
                  </div>
                </div>
                <div className="jk-field">
                  <label className="jk-check">
                    <input type="checkbox" checked={job.params.length > 0} readOnly disabled />
                    This project is parameterized
                  </label>
                  {params.map((p, i) => (
                    <div className="jk-subcard" key={p.name}>
                      <div className="jk-subcard-head">
                        <span>{p.type === 'choice' ? 'Choice Parameter' : p.type === 'boolean' ? 'Boolean Parameter' : 'String Parameter'}</span>
                      </div>
                      <div className="jk-field">
                        <label>Name</label>
                        <input className="jk-input" value={p.name} readOnly disabled />
                      </div>
                      {p.type === 'choice' ? (
                        <div className="jk-field">
                          <label>Choices</label>
                          <textarea className="jk-textarea" value={(p.choices ?? []).join('\n')} readOnly disabled />
                        </div>
                      ) : (
                        <div className="jk-field">
                          <label htmlFor={`jk-def-${p.name}`}>Default Value</label>
                          <input
                            id={`jk-def-${p.name}`}
                            className="jk-input"
                            spellCheck={false}
                            value={saved[p.name] ?? p.default ?? ''}
                            disabled={readOnly}
                            onChange={(e) => setSaved((s) => ({ ...s, [p.name]: e.target.value }))}
                          />
                        </div>
                      )}
                      <div className="jk-field">
                        <label>Description</label>
                        <textarea
                          className="jk-textarea"
                          style={{ minHeight: 54 }}
                          value={p.description}
                          disabled={readOnly}
                          onChange={(e) => setParams((ps) => ps.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))}
                        />
                      </div>
                      {p.type === 'string' ? (
                        <label className="jk-check">
                          <input type="checkbox" checked={false} readOnly disabled />
                          Trim the string
                        </label>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="jk-field">
                  <label className="jk-check">
                    <input type="checkbox" checked={!!job.schedule} readOnly disabled />
                    Build periodically
                  </label>
                  {job.schedule ? (
                    <div className="jk-subcard">
                      <div className="jk-field-label">Schedule</div>
                      <textarea className="jk-textarea" style={{ minHeight: 40, fontFamily: 'var(--jk-mono)' }} value={job.schedule} readOnly disabled />
                    </div>
                  ) : null}
                </div>
              </section>
              <section className="jk-section" data-section="Advanced Project Options">
                <h2>Advanced Project Options</h2>
                <div className="jk-field">
                  <label>Display Name</label>
                  <input className="jk-input" value="" placeholder={job.name} readOnly disabled />
                </div>
              </section>
              <section className="jk-section" data-section="Pipeline">
                <h2>Pipeline</h2>
                <div className="jk-field">
                  <label>Definition</label>
                  <select className="jk-select" value="script" disabled={readOnly} onChange={() => undefined} style={{ maxWidth: 320 }}>
                    <option value="script">Pipeline script</option>
                  </select>
                </div>
                <div className="jk-field">
                  <label>Script</label>
                  <ScriptEditor
                    value={script}
                    onChange={setScript}
                    readOnly={readOnly}
                    onLineClick={(line, text) => emitAppAction('jenkins', 'jenkins.script.lineClicked', { jobId: job.id, line, text })}
                  />
                </div>
                <div className="jk-field" style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 1000 }}>
                  <label className="jk-check">
                    <input type="checkbox" checked={sandbox} disabled={readOnly} onChange={(e) => setSandbox(e.target.checked)} />
                    Use Groovy Sandbox
                  </label>
                  <a href={`#${jobUrl(job.id, 'pipeline-syntax/')}`} onClick={(e) => (e.preventDefault(), navigate(jobUrl(job.id, 'pipeline-syntax/')))}>
                    Pipeline Syntax
                  </a>
                </div>
              </section>
              {!readOnly ? (
                <div className="jk-config-bar">
                  <button type="button" className="jk-btn jk-btn-primary" onClick={() => save(true)}>
                    Save
                  </button>
                  <button type="button" className="jk-btn" onClick={() => save(false)}>
                    Apply
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <Footer />
        </main>
      </div>
    </>
  );
}
