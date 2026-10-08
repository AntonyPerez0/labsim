/** DR11 Caps Lock — a parameter card slides in; ← rejects, → accepts. The card flies off the way you swiped. */
import type { DrillComponentProps } from '../../types';
import { useDrill, useKeys, useQuickAnswer } from '../common/useDrill';
import { Kbd, Legend, Waiting } from '../common/ui';
import type { CapsData } from './logic';
import './style.css';

export function View(props: DrillComponentProps) {
  const d = useDrill<CapsData>(props);
  const q = useQuickAnswer<'accept' | 'reject'>(d, { right: 280, wrong: 750 });
  const it = d.item;

  const choose = (c: 'accept' | 'reject') => {
    if (!it || q.locked) return;
    const ok = (c === 'accept') === it.data.valid;
    q.answer(c, ok, document.querySelector('.dr11-card'), ok ? {} : { detail: c === 'accept' ? 'you accepted it' : 'you rejected a valid value' });
  };

  useKeys(
    (e) => {
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        choose('accept');
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        choose('reject');
      }
    },
    [it?.id, q.locked],
  );

  if (!it) return <Waiting />;
  const cfg = it.data.context === 'config';
  const fly = q.picked ? (q.picked.key === 'accept' ? 'is-fly-right' : 'is-fly-left') : '';
  const verdict = q.picked ? (q.picked.correct ? 'is-right' : 'is-wrong') : '';
  return (
    <div className="dr11" key={d.itemKey}>
      <div className="dr11-lane">
        <button type="button" className="dr11-side is-reject" disabled={q.locked} onClick={() => choose('reject')}>
          <Kbd k="←" />
          <span>Reject</span>
        </button>
        <div className={`dr11-card ${fly} ${verdict}`}>
          <div className="dr11-card__head">{cfg ? 'IntelliJ · uia-remote/config.properties' : 'Jenkins · Build with Parameters'}</div>
          {cfg ? (
            <pre className="dr11-code">
              <span className="dr11-dim">runType=standalone{'\n'}merchantFacingDeviceIp=10.42.30.12{'\n'}</span>
              <span className="dr11-key">deviceType</span>=<span className="dr11-val">{it.data.value}</span>
              <span className="dr11-dim">{'\n'}theme=avocado{'\n'}kernelType=CPA{'\n'}portNumber=5444</span>
            </pre>
          ) : (
            <div className="dr11-form">
              <label className="dr11-label">ROBOT_NAME</label>
              <div className="dr11-input is-dim">(blank — any matching Available robot)</div>
              <label className="dr11-label">DEVICE_TYPE</label>
              <div className="dr11-input">
                <span className="dr11-val">{it.data.value}</span>
                <span className="dr11-caret" />
              </div>
              <label className="dr11-label">MERCHANT</label>
              <div className="dr11-input is-dim">AUTO-US-NOPIN-01</div>
            </div>
          )}
          {q.picked && !q.picked.correct ? (
            <div className="dr11-why">{it.data.valid ? `Valid — ${it.data.reason}.` : `${it.data.reason}${it.data.fix ? ` → ${it.data.fix}` : ''}`}</div>
          ) : null}
        </div>
        <button type="button" className="dr11-side is-accept" disabled={q.locked} onClick={() => choose('accept')}>
          <span>Accept</span>
          <Kbd k="→" />
        </button>
      </div>
      <div className="dr11-rule">
        {cfg ? (
          <>
            config.properties <code>deviceType</code> = the family: <b>Mini</b> · <b>Flex</b> · <b>Station</b>
          </>
        ) : (
          <>
            Jenkins <code>DEVICE_TYPE</code> = the exact Orca Device Type enum — ALL CAPS, e.g. <b>FLEX_3</b>
          </>
        )}
      </div>
      <Legend
        items={[
          ['←', 'reject'],
          ['→', 'accept'],
        ]}
      />
    </div>
  );
}
