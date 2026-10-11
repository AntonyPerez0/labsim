/**
 * UIA Practice tool window (right stripe): repeatable UI Automator / uia-relay exercises. Start writes a fresh
 * variant into the project's git-ignored `practice/` folder and opens it; Check saves and grades it
 * (practice/uiaExercises.ts). Solves are kept in `progress.uiaPractice`.
 */
import { emitAppAction } from '@/computer/apps';
import { getState, mutate, useGame } from '@/core/store';
import type { RepoId } from '@/sim';
import { openFile, saveAll, writeProjectFile } from './actions';
import type { IdeModel } from './ideModel';
import { checkUia, UIA_EXERCISES, UIA_EXERCISES_BY_ID } from './practice/uiaExercises';

/** **bold** and `code` in brief lines. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((p, i) =>
        p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('`') ? <code key={i} className="ij-uia-code">{p.slice(1, -1)}</code> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function start(model: IdeModel, repo: RepoId, id: string): void {
  const ex = UIA_EXERCISES_BY_ID[id];
  if (!ex) return;
  const v = ex.make();
  const r = writeProjectFile(repo, model.cwm, v.path, v.text);
  if (!r.ok) {
    model.balloon({ kind: 'error', title: 'Could not create the exercise', body: r.error });
    return;
  }
  // A fresh variant replaces an open buffer of the same file.
  const b = model.buffers.get(v.path);
  if (b) {
    b.text = v.text;
    b.base = v.text;
  }
  model.uiaPractice = { exerciseId: id, path: v.path, ctx: v.ctx, brief: v.brief, startedReal: performance.now(), checks: 0, hintsShown: 0, last: null, solved: false };
  openFile(model, v.path, { revealInTree: true, emit: false });
  emitAppAction('intellij', 'intellij.practice.started', { exerciseId: id, path: v.path });
  model.changed();
}

function check(model: IdeModel): void {
  const p = model.uiaPractice;
  const ex = p ? UIA_EXERCISES_BY_ID[p.exerciseId] : null;
  if (!p || !ex) return;
  saveAll(model, 'explicit');
  const text = model.buffers.get(p.path)?.text ?? getState().lab.repos[model.repo ?? 'uia-relay']?.local?.files?.[p.path] ?? '';
  const res = checkUia(ex, text, p.ctx, { orka: getState().lab.orka ?? null });
  p.checks++;
  p.last = res;
  emitAppAction('intellij', 'intellij.practice.checked', { exerciseId: p.exerciseId, passed: res.passed, failures: res.items.filter((i) => !i.ok).map((i) => i.label) });
  if (res.passed && !p.solved) {
    p.solved = true;
    const seconds = Math.max(1, Math.round((performance.now() - p.startedReal) / 1000));
    emitAppAction('intellij', 'intellij.practice.solved', { exerciseId: p.exerciseId, seconds, checks: p.checks, hints: p.hintsShown });
    const day = Math.floor(Date.now() / 86_400_000);
    mutate((s) => {
      const rec = s.progress.uiaPractice[p.exerciseId] ?? { solved: 0, bestS: 0, lastDay: 0 };
      s.progress.uiaPractice[p.exerciseId] = { solved: rec.solved + 1, bestS: rec.bestS ? Math.min(rec.bestS, seconds) : seconds, lastDay: day };
    });
    model.balloon({ kind: 'success', title: `UIA Practice: ${ex.title} solved` }, 6000);
  }
  model.changed();
}

export function UiaPracticePanel({ model, repo }: { model: IdeModel; repo: RepoId }) {
  const stats = useGame((s) => s.progress.uiaPractice);
  if (repo !== 'uia-relay' || model.cwm) {
    return (
      <div className="ij-uia">
        <p className="ij-uia-dim">UIA Practice works in your own uia-relay clone. Open it with File → Open… (or Get from VCS).</p>
      </div>
    );
  }
  const p = model.uiaPractice;
  const ex = p ? UIA_EXERCISES_BY_ID[p.exerciseId] : null;
  const solvedCount = UIA_EXERCISES.filter((e) => (stats?.[e.id]?.solved ?? 0) > 0).length;
  return (
    <div className="ij-uia">
      {p && ex ? (
        <div className="ij-uia-cur">
          <div className="ij-uia-title">
            {ex.title} <span className={`ij-uia-chip ij-uia-l${ex.level}`}>{ex.topic}</span>
          </div>
          <div className="ij-uia-dim ij-uia-small">{p.path}</div>
          {p.brief.map((l, i) => (
            <p key={i} className="ij-uia-brief">
              <Rich text={l} />
            </p>
          ))}
          <div className="ij-uia-btns">
            <button type="button" className="ij-btn ij-default" data-hint="intellij.uiaPractice.check" onClick={() => check(model)}>
              Check
            </button>
            <button
              type="button"
              className="ij-btn"
              disabled={p.hintsShown >= ex.hints.length}
              onClick={() => {
                p.hintsShown++;
                model.changed();
              }}
            >
              Hint ({ex.hints.length - p.hintsShown})
            </button>
            <button type="button" className="ij-btn" title="Same exercise, new random variant" onClick={() => start(model, repo, ex.id)}>
              New variant
            </button>
          </div>
          {ex.hints.slice(0, p.hintsShown).map((h, i) => (
            <div key={i} className="ij-uia-hint">
              <Rich text={h} />
            </div>
          ))}
          {p.last ? (
            <div className="ij-uia-result">
              {p.last.items.map((g) => (
                <div key={g.label} className={`ij-uia-goal${g.ok ? ' is-ok' : ''}`}>
                  <span className="ij-uia-goal-ic">{g.ok ? '✓' : '✗'}</span>
                  <span>
                    {g.label}
                    {!g.ok && g.detail ? <div className="ij-uia-detail">{g.detail}</div> : null}
                  </span>
                </div>
              ))}
              {p.last.passed ? (
                <div className="ij-uia-lesson">
                  <b>Solved{p.checks > 1 ? ` in ${p.checks} checks` : ' first try'}.</b> {ex.lesson}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="ij-uia-dim ij-uia-small">Edit the file, then press Check (it saves first). Practice files live in the git-ignored practice/ folder, so they never end up in a commit or break a real run.</p>
          )}
        </div>
      ) : (
        <p className="ij-uia-dim ij-uia-small ij-uia-pad">
          Repeatable UI Automator drills for uia-relay: page objects, waits, device families, tethered handles, config.properties, UIA 2.3 display locators and the Compass PIN pad. Each start generates a new variant.
        </p>
      )}
      <div className="ij-uia-head">
        Exercises <span className="ij-uia-badge">{`${solvedCount}/${UIA_EXERCISES.length}`}</span>
      </div>
      {UIA_EXERCISES.map((e) => {
        const st = stats?.[e.id];
        return (
          <div key={e.id} className={`ij-uia-row${p?.exerciseId === e.id ? ' is-sel' : ''}`} data-hint={`intellij.uiaPractice.exercise:${e.id}`} onClick={() => start(model, repo, e.id)}>
            <span className={`ij-uia-done${st?.solved ? ' is-done' : ''}`}>{st?.solved ? '✓' : '○'}</span>
            <span className="ij-uia-name">{e.title}</span>
            <span className={`ij-uia-chip ij-uia-l${e.level}`}>{e.topic}</span>
            <span className="ij-uia-dim ij-uia-small ij-uia-best">{st?.bestS ? `${st.bestS}s` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
