/**
 * Run tool window (Apps §4.9): one tab per configuration, rerun/stop toolbar, result bar, test tree and the console
 * streaming `sim.runner.output(runId).lines` verbatim, with stack-frame links and the IntelliJ exit line.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fmtIdeaDuration } from '@/computer/apps';
import { useGame } from '@/core/store';
import { reportRunFinished, runStateOf, startRun, stopRun } from './actions';
import { IcCheck, IcChevronDown, IcClose, IcError, IcRerun, IcStop } from './icons';
import type { IdeModel, RunTab } from './ideModel';
import { javaPackageOf, testMethodName } from './projectModel';

export interface RunPanelProps {
  model: IdeModel;
  windowFocused: boolean;
  onOpenLocation(simpleClass: string, line: number): void;
}

function headerLine(tab: RunTab): string {
  if (tab.config.kind === 'lstr') return `/usr/lib/jvm/java-17-openjdk/bin/java -Dfile.encoding=UTF-8 -classpath … com.labsim.pigeon.LstrRunner --platform ANDROID ${tab.config.testPath}`;
  const pkg = javaPackageOf(tab.config.testPath) ?? 'com.labsim.uia.testactions';
  return `/usr/lib/jvm/java-17-openjdk/bin/java -ea -Didea.test.cyclic.buffer.size=1048576 -javaagent:/opt/idea/lib/idea_rt.jar=40217:/opt/idea/bin -Dfile.encoding=UTF-8 -classpath … com.intellij.rt.junit.JUnitStarter -ideVersion5 -junit4 ${pkg}.${tab.config.name}`;
}

function lineClass(l: string): string {
  if (/Exception|Error:|AssertionError|FAILED|ParseError/.test(l)) return 'ij-con-err';
  if (/PASSED|✓/.test(l)) return 'ij-con-ok';
  return '';
}

function ConsoleLine({ text, onLink }: { text: string; onLink: (cls: string, line: number) => void }) {
  const m = /^(.*\()([A-Za-z_$][\w$]*)\.(java|groovy):(\d+)(\).*)$/.exec(text);
  const cls = lineClass(text) || (/^\s+at /.test(text) ? 'ij-con-err' : '');
  if (!m) return <div className={cls}>{text || '​'}</div>;
  return (
    <div className={cls}>
      {m[1]}
      <span className="ij-con-link" role="link" tabIndex={0} onClick={() => onLink(m[2], Number(m[4]))} onKeyDown={(e) => e.key === 'Enter' && onLink(m[2], Number(m[4]))}>
        {m[2]}.{m[3]}:{m[4]}
      </span>
      {m[5]}
    </div>
  );
}

export function RunPanel({ model, windowFocused, onOpenLocation }: RunPanelProps) {
  const tab = model.runs[model.activeRun] ?? model.runs[0];
  const runId = tab?.runId ?? null;
  const labRun = useGame((s) => (runId ? s.lab.local?.runs?.[runId] : undefined));
  const [showPassed, setShowPassed] = useState(true);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);
  const state = runStateOf(runId);
  void labRun;

  const running = !!tab && !!runId && !state.done && !tab.stopped;
  const stoppedNow = !!tab?.stopped;
  const passed = stoppedNow ? null : state.done ? state.passed : null;

  useEffect(() => {
    if (tab && runId && (state.done || tab.stopped) && !tab.reported) reportRunFinished(model, tab, state.passed, windowFocused);
  }, [tab, runId, state.done, state.passed, windowFocused, model, tab?.stopped]);

  useLayoutEffect(() => {
    const el = consoleRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });

  if (!tab) return <div className="ij-empty-editor">Nothing to show</div>;

  const startedMs = labRun?.startedMs;
  const finishedMs = labRun?.finishedMs;
  const dur = startedMs != null && finishedMs != null ? fmtIdeaDuration(finishedMs - startedMs) : '';
  const ended = state.done || stoppedNow;
  const exitLine = !ended ? null : stoppedNow ? 'Process finished with exit code 130 (interrupted by signal 2: SIGINT)' : passed ? 'Process finished with exit code 0' : 'Process finished with exit code 255';
  const simHasExit = state.lines.some((l) => l.startsWith('Process finished with exit code'));
  const method = testMethodName(tab.config);

  let result: React.ReactNode;
  let resultCls = '';
  if (tab.error) {
    result = (
      <>
        <IcError size={14} /> {tab.error}
      </>
    );
    resultCls = 'ij-fail';
  } else if (running) {
    result = (
      <>
        <span className="ij-spin" /> Running {tab.config.name}…
      </>
    );
  } else if (stoppedNow) {
    result = <>Tests stopped</>;
  } else if (passed) {
    result = (
      <>
        <IcCheck size={14} /> Tests passed: 1 of 1 test{dur ? ` – ${dur}` : ''}
      </>
    );
    resultCls = 'ij-pass';
  } else {
    result = (
      <>
        <IcError size={14} /> Tests failed: 1 of 1 test{dur ? ` – ${dur}` : ''}
      </>
    );
    resultCls = 'ij-fail';
  }
  const nodeIcon = running ? <span className="ij-spin" /> : stoppedNow || tab.error ? <span className="ij-dim">⊘</span> : passed ? <IcCheck size={14} /> : <IcError size={14} />;

  return (
    <div className="ij-run">
      <div className="ij-run-tools">
        <button type="button" className="ij-tbtn" title={`Rerun '${tab.config.name}' (Ctrl+F5)`} aria-label="Rerun" onClick={() => startRun(model, tab.config, { force: true, debug: tab.debug })}>
          <IcRerun />
        </button>
        <button type="button" className="ij-tbtn" title="Stop (Ctrl+F2)" aria-label="Stop" data-hint="intellij.stopButton" disabled={!running} onClick={() => stopRun(model, tab)}>
          <IcStop active={running} />
        </button>
        <button type="button" className={`ij-tbtn${showPassed ? ' ij-on' : ''}`} title="Show Passed" aria-pressed={showPassed} onClick={() => setShowPassed(!showPassed)}>
          <IcCheck />
        </button>
        <button type="button" className="ij-tbtn" title="Expand All" aria-label="Expand All">
          <IcChevronDown />
        </button>
      </div>
      <div className="ij-run-tree">
        <div className={`ij-run-result ${resultCls}`} aria-live="polite">
          {result}
        </div>
        <div className="ij-plist">
          <div className="ij-run-node" style={{ paddingLeft: 6 }}>
            {nodeIcon} Test Results<span className="ij-time">{dur}</span>
          </div>
          {showPassed || !passed ? (
            <>
              <div className="ij-run-node" style={{ paddingLeft: 22 }}>
                {nodeIcon} {tab.config.name.replace(/^LSTR: /, '')}
                <span className="ij-time">{dur}</span>
              </div>
              <div className="ij-run-node" style={{ paddingLeft: 38 }}>
                {nodeIcon} {method}
                <span className="ij-time">{dur}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div
        className="ij-console"
        ref={consoleRef}
        role="log"
        aria-live="polite"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 6;
        }}
      >
        <div className="ij-con-grey">{headerLine(tab)}</div>
        {tab.debug ? <div>Connected to the target VM, address: &apos;127.0.0.1:40217&apos;, transport: &apos;socket&apos;</div> : null}
        {tab.error ? <div className="ij-con-err">{tab.error}</div> : null}
        {state.lines.map((l, i) => (
          <ConsoleLine key={i} text={l} onLink={onOpenLocation} />
        ))}
        {tab.debug && ended ? <div>Disconnected from the target VM, address: &apos;127.0.0.1:40217&apos;, transport: &apos;socket&apos;</div> : null}
        {exitLine && !simHasExit ? (
          <>
            <div>{'​'}</div>
            <div>{exitLine}</div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function RunTabsHeader({ model }: { model: IdeModel }) {
  return (
    <div className="ij-tw-tabs" role="tablist">
      {model.runs.map((t, i) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={i === model.activeRun}
          className={`ij-tw-tab${i === model.activeRun ? ' ij-on' : ''}`}
          onClick={() => {
            model.activeRun = i;
            model.changed();
          }}
        >
          {t.config.name}
          <span
            className="ij-tab-x"
            style={{ visibility: 'visible' }}
            role="button"
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              if (t.runId && !t.stopped && !runStateOf(t.runId).done) stopRun(model, t);
              model.runs = model.runs.filter((x) => x !== t);
              model.activeRun = Math.max(0, Math.min(model.activeRun, model.runs.length - 1));
              model.changed();
            }}
          >
            <IcClose size={12} />
          </span>
        </button>
      ))}
    </div>
  );
}
