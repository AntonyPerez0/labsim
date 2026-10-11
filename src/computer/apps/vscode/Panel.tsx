/** Bottom panel: PROBLEMS (open JSON files), OUTPUT (LSTR channel) and an embedded TERMINAL. */
import { useEffect, useRef } from 'react';
import { emitAppAction, getWindowManager } from '@/computer/apps';
import { useGame } from '@/core/store';
import { TerminalApp } from '../terminal';
import { reportRun, runState } from './actions';
import { diagnoseJson, offsetToLineCol } from './jsonLang';
import type { VsModel } from './model';

export function problemsOf(model: VsModel): { id: string; path: string; diags: { message: string; code: number; severity: string; line: number; col: number; from: number }[] }[] {
  const out: ReturnType<typeof problemsOf> = [];
  for (const id of model.tabs) {
    const b = model.buffers.get(id);
    if (!b || !b.path.endsWith('.json')) continue;
    const ds = diagnoseJson(b.text);
    if (!ds.length) continue;
    out.push({ id, path: b.path, diags: ds.map((d) => ({ message: d.message, code: d.code, severity: d.severity, from: d.from, ...offsetToLineCol(b.text, d.from) })) });
  }
  return out;
}

function Problems({ model }: { model: VsModel }) {
  const groups = problemsOf(model);
  if (!groups.length) return <div className="vsc-panel__empty">No problems have been detected in the workspace.</div>;
  return (
    <div className="vsc-problems">
      {groups.map((g) => (
        <div key={g.id}>
          <div className="vsc-problems__file">
            {g.path.split('/').pop()} <span className="vsc-dim">{g.path.includes('/') ? g.path.slice(0, g.path.lastIndexOf('/')) : ''}</span> <span className="vsc-badge">{g.diags.length}</span>
          </div>
          {g.diags.map((d, i) => (
            <div
              key={i}
              className="vsc-problems__row"
              onClick={() => {
                const b = model.buffers.get(g.id);
                if (!b) return;
                model.active = g.id;
                b.selStart = b.selEnd = d.from;
                model.revealSeq++;
                model.changed();
              }}
            >
              <span className={`vsc-sev vsc-sev--${d.severity}`}>{d.severity === 'error' ? '⊗' : '⚠'}</span>
              {d.message} <span className="vsc-dim">json({d.code})</span>{' '}
              <span className="vsc-dim">
                [Ln {d.line}, Col {d.col}]
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Output({ model, focused }: { model: VsModel; focused: boolean }) {
  useGame((s) => (model.runId ? `${s.lab.local?.runs?.[model.runId]?.state}|${s.lab.local?.runs?.[model.runId]?.output.length}` : null));
  const run = model.runId ? runState(model.runId) : null;
  const lines = [...model.output, ...(run?.lines ?? [])];
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);
  useEffect(() => {
    if (run?.done && !model.runReported) {
      reportRun(model, run.passed);
      if (!focused && run.passed !== null) getWindowManager()?.notify({ app: 'vscode', title: run.passed ? 'LSTR run passed' : 'LSTR run failed', body: model.runPath ?? '', kind: run.passed ? 'success' : 'error' });
    }
  }, [run?.done, run?.passed, model, focused]);
  return (
    <div className="vsc-output">
      {lines.length ? (
        lines.map((l, i) => (
          <div key={i} className={/FAILED|Error|ParseError|UnknownAction/.test(l) ? 'vsc-out--err' : /PASSED|OK\b/.test(l) ? 'vsc-out--ok' : /^warning:/.test(l) ? 'vsc-out--warn' : undefined}>
            {l}
          </div>
        ))
      ) : (
        <div className="vsc-dim">LSTR output appears here (Run and Debug ▶, or Check in Parrot Practice).</div>
      )}
      {run && !run.done ? <div className="vsc-dim">…running</div> : null}
      <div ref={endRef} />
    </div>
  );
}

export function Panel({ model, windowId, focused }: { model: VsModel; windowId: string; focused: boolean }) {
  const count = problemsOf(model).reduce((n, g) => n + g.diags.length, 0);
  const root = model.repo ? `~/IdeaProjects/${model.repo}` : '~';
  const tabs: { id: VsModel['panelTab']; label: string }[] = [
    { id: 'problems', label: 'PROBLEMS' },
    { id: 'output', label: 'OUTPUT' },
    { id: 'terminal', label: 'TERMINAL' },
  ];
  return (
    <div className="vsc-panel">
      <div className="vsc-panel__tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`vsc-panel__tab${model.panelTab === t.id ? ' is-active' : ''}`}
            data-hint={t.id === 'problems' ? 'vscode.problemsWidget' : undefined}
            onClick={() => {
              model.panelTab = t.id;
              if (t.id === 'problems') emitAppAction('vscode', 'vscode.problems.opened', { count });
              model.changed();
            }}
          >
            {t.label}
            {t.id === 'problems' && count ? <span className="vsc-badge">{count}</span> : null}
          </button>
        ))}
        <span className="vsc-spacer" />
        <button
          type="button"
          className="vsc-panel__close"
          title="Close Panel"
          onClick={() => {
            model.panelOpen = false;
            model.changed();
          }}
        >
          ✕
        </button>
      </div>
      <div className="vsc-panel__body">
        {model.panelTab === 'problems' ? <Problems model={model} /> : null}
        {model.panelTab === 'output' ? <Output model={model} focused={focused} /> : null}
        {model.panelTab === 'terminal' ? (
          <div className="vsc-panel__term">
            <TerminalApp windowId={`${windowId}:terminal`} params={{ embedded: true, cwd: root }} embedded focused={focused} wm={getWindowManager() ?? undefined} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
