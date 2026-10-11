/**
 * Parrot Practice side bar (an "extension" view): exercise list with best times, the current exercise's brief,
 * Check / Hint / New variant, goal checklist and the known-good action lines to copy.
 */
import { useState } from 'react';
import { pressable } from '@/ui/kit/a11y';
import { getWindowManager } from '@/computer/apps';
import { useGame } from '@/core/store';
import { checkPractice, startExercise } from './actions';
import { IconCheck } from './icons';
import type { VsModel } from './model';
import { EXERCISES, EXERCISES_BY_ID } from './practice/exercises';

const KNOWN_GOOD: string[] = [
  '{ "action": "create order", "params": { "item": "Tax Item 5" }, "store": "orderId" },',
  '{ "action": "review order", "params": { "orderId": "${orderId}" } },',
  '{ "action": "pay", "params": { "orderId": "${orderId}" } },',
  '{ "action": "card swipe", "params": { "profile": "VISA_STD_SWIPE", "orderId": "${orderId}" }, "store": "paymentId" },',
  '{ "action": "card dip", "params": { "profile": "VISA_STD_DIP", "orderId": "${orderId}" }, "store": "paymentId" },',
  '{ "action": "card tap", "params": { "profile": "VISA_STD_TAP", "orderId": "${orderId}" }, "store": "paymentId" },',
  '{ "action": "select tip", "params": { "robot": "${ROBOT_NAME}", "screen": "TIP", "button": "No Tip" } },',
  '{ "action": "add tip", "params": { "paymentId": "${paymentId}", "percent": 18 }, "store": "tipId" },',
  '{ "action": "assert approved", "params": { "paymentId": "${paymentId}" } },',
  '{ "action": "select print", "params": { "robot": "${ROBOT_NAME}", "screen": "${RECEIPT_SCREEN}" } },',
  '{ "action": "screenCompare", "params": { "x": 208, "y": 512, "w": 304, "h": 40, "expected": "Payment Successful" } },',
  '{ "action": "assert home", "params": {} }',
];

/** **bold** and `code` in brief lines. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <b key={i}>{p.slice(2, -2)}</b>
        ) : p.startsWith('`') ? (
          <code key={i} className="vsc-code">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function PracticeView({ model }: { model: VsModel }) {
  const stats = useGame((s) => s.progress.parrotPractice);
  const [showRef, setShowRef] = useState(false);
  const p = model.practice;
  const ex = p ? EXERCISES_BY_ID[p.exerciseId] : null;
  const solvedCount = EXERCISES.filter((e) => (stats?.[e.id]?.solved ?? 0) > 0).length;

  return (
    <div className="vsc-view vsc-practice">
      <div className="vsc-view__title">PARROT PRACTICE</div>
      {p && ex ? (
        <div className="vsc-practice__cur">
          <div className="vsc-practice__title">
            {ex.title} <span className={`vsc-chip vsc-chip--l${ex.level}`}>{ex.topic}</span>
          </div>
          <div className="vsc-practice__file vsc-dim vsc-small">parrot-practice/{p.file}</div>
          {((p.ctx['brief'] as string[] | undefined) ?? []).map((l, i) => (
            <p key={i} className="vsc-practice__brief">
              <Rich text={l} />
            </p>
          ))}
          <div className="vsc-practice__btns">
            <button type="button" className="vsc-btn" data-hint="vscode.practice.check" onClick={() => checkPractice(model)}>
              <IconCheck /> Check
            </button>
            <button
              type="button"
              className="vsc-btn vsc-btn--secondary"
              disabled={p.hintsShown >= ex.hints.length}
              onClick={() => {
                p.hintsShown++;
                model.changed();
              }}
            >
              Hint{ex.hints.length ? ` (${ex.hints.length - p.hintsShown})` : ''}
            </button>
            <button type="button" className="vsc-btn vsc-btn--secondary" title="Same exercise, new random variant" onClick={() => startExercise(model, ex.id)}>
              New variant
            </button>
          </div>
          {ex.hints.slice(0, p.hintsShown).map((h, i) => (
            <div key={i} className="vsc-practice__hint">
              💡 <Rich text={h} />
            </div>
          ))}
          {p.last ? (
            <div className={`vsc-practice__result${p.last.passed ? ' is-pass' : ''}`}>
              {p.last.items.map((g) => (
                <div key={g.label} className={`vsc-goal${g.ok ? ' is-ok' : ''}`}>
                  <span className="vsc-goal__icon">{g.ok ? '✓' : '✗'}</span>
                  <span>
                    {g.label}
                    {!g.ok && g.detail ? <div className="vsc-goal__detail">{g.detail}</div> : null}
                  </span>
                </div>
              ))}
              {p.last.warnings.map((w) => (
                <div key={w} className="vsc-goal vsc-goal--warn">
                  <span className="vsc-goal__icon">⚠</span>
                  <span>{w}</span>
                </div>
              ))}
              {p.last.passed ? (
                <div className="vsc-practice__lesson">
                  <b>Solved{p.checks > 1 ? ` in ${p.checks} checks` : ' first try'}.</b> {ex.lesson}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="vsc-dim vsc-small">Edit the file, then press Check. Check saves the file and runs an LSTR dry run (no robot needed). The full console is in the Output panel.</p>
          )}
        </div>
      ) : (
        <p className="vsc-view__pad vsc-dim vsc-small">
          Repeatable drills for editing Parrot JSON tests the way the team does: fix syntax, plumb variables, swap card profiles, map receipt screens, build tests from known-good lines. Each start generates a new variant.
        </p>
      )}

      <div className="vsc-scm__head">
        Exercises <span className="vsc-badge">{`${solvedCount}/${EXERCISES.length}`}</span>
      </div>
      {EXERCISES.map((e) => {
        const st = stats?.[e.id];
        return (
          <div key={e.id} className={`vsc-practice__row${p?.exerciseId === e.id ? ' is-sel' : ''}`} data-hint={`vscode.practice.exercise:${e.id}`} {...pressable(() => startExercise(model, e.id))}>
            <span className={`vsc-practice__done${st?.solved ? ' is-done' : ''}`}>{st?.solved ? '✓' : '○'}</span>
            <span className="vsc-practice__name">{e.title}</span>
            <span className={`vsc-chip vsc-chip--l${e.level}`}>{e.topic}</span>
            <span className="vsc-dim vsc-small vsc-practice__best">{st?.bestS ? `${st.bestS}s` : ''}</span>
          </div>
        );
      })}

      <div className="vsc-scm__head vsc-clickable" aria-expanded={showRef} {...pressable(() => setShowRef((v) => !v))}>
        {showRef ? '▾' : '▸'} Known-good action lines
      </div>
      {showRef ? (
        <div className="vsc-practice__ref">
          <p className="vsc-dim vsc-small">Copy whole lines instead of typing JSON (also in parrot/tests/_templates/known_good_actions.json).</p>
          {KNOWN_GOOD.map((l) => (
            <div key={l} className="vsc-practice__refline" title="Click to copy" {...pressable(() => getWindowManager()?.clipboard.write(l, 'vscode'))}>
              <code>{l}</code>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
