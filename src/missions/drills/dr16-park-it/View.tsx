/**
 * DR16 Park It! — a rack of ten touch robots; the active rig's tablet is shown big. Read the banner, then do
 * the right thing: Park All, Enable → Park All, or hands off while a test runs.
 */
import { useEffect, useRef, useState } from 'react';
import { getState } from '@/core/store';
import type { DrillComponentProps } from '../../types';
import { useDrill, useKeys } from '../common/useDrill';
import { Kbd, Legend, Waiting } from '../common/ui';
import { ACTION_LABEL, applyAction, parkPoints, type ParkAction, type ParkData } from './logic';
import './style.css';

type SlotState = 'idle' | 'done' | 'failed';

const KEY: Record<ParkAction, string> = { 'park-all': 'P', 'park-xy': 'Q', 'park-x': 'X', 'park-y': 'Y', enable: 'E', disable: 'D', 'sol-down': 'S', leave: 'W', drag: 'C', motor: 'M' };
const BY_CODE: Record<string, ParkAction> = Object.fromEntries(Object.entries(KEY).map(([a, k]) => [`Key${k}`, a as ParkAction]));

export function View(props: DrillComponentProps) {
  const d = useDrill<ParkData>(props);
  const it = d.item;
  const [slots, setSlots] = useState<SlotState[]>(() => Array(10).fill('idle'));
  const [enabled, setEnabled] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; why: string | null; action: ParkAction } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    setEnabled(false);
    setResult(null);
    busy.current = false;
  }, [d.itemKey]);

  const act = (a: ParkAction, el?: Element | null) => {
    if (!it || busy.current) return;
    const out = applyAction(it.data, a, enabled);
    if (out.kind === 'progress') {
      setEnabled(true);
      return;
    }
    busy.current = true;
    const ms = d.elapsedMs();
    const streak = getState().session.drill?.streak ?? 0;
    const ok = out.kind === 'done';
    const verdict = { correct: ok, pointsOverride: parkPoints(out, ms, streak), elapsedMs: ms, detail: ok ? undefined : `you chose ${ACTION_LABEL[a]}` };
    setResult({ ok, why: out.kind === 'wrong' ? out.why : null, action: a });
    setSlots((s) => s.map((v, i) => (i === it.data.slot ? (ok ? 'done' : 'failed') : v)));
    d.juiceNow(verdict, el ?? document.querySelector(`[data-dr16="${a}"]`));
    window.setTimeout(() => d.submit(verdict, null, true), ok ? 520 : 1500);
  };

  useKeys(
    (e) => {
      const a = BY_CODE[e.code];
      if (a) {
        e.preventDefault();
        act(a);
      }
    },
    [d.itemKey, enabled],
  );

  if (!it) return <Waiting />;
  const data = it.data;
  const locked = data.case === 'locked' && !(result?.ok ?? false);
  const green = result?.ok === true;
  const needsPark = data.case === 'yellow' || ((data.case === 'steppers' || data.case === 'motor-off') && enabled);
  const banner = green ? 'ok' : data.case === 'locked' ? 'busy' : needsPark ? 'yellow' : 'ok';
  const statusText = green ? (data.case === 'locked' ? 'Status: OK · job finished' : 'Status: OK') : data.case === 'locked' ? 'Status: RUNNING' : data.case === 'yellow' ? 'Status: LOCK RELEASED — PARK REQUIRED' : needsPark ? 'Status: POSITION UNKNOWN — PARK REQUIRED' : 'Status: OK';
  const btn = (a: ParkAction, label: string) => (
    <button type="button" data-dr16={a} className={`dr16-btn${result?.action === a ? (result.ok ? ' is-right' : ' is-wrong') : ''}`} onClick={(e) => act(a, e.currentTarget)}>
      <span>{label}</span>
      <Kbd k={KEY[a]} size="sm" />
    </button>
  );

  return (
    <div className="dr16">
      <div className="dr16-rack">
        <div className="dr16-rack__floor">
          {slots.map((s, i) => {
            const active = i === data.slot && !result;
            const cls = active ? `is-active is-${data.case}` : `is-${s}`;
            return (
              <div key={i} className={`dr16-rig ${cls}`}>
                <div className="dr16-rig__tablet" />
                <div className="dr16-rig__gantry">
                  <span className="dr16-rig__rail" />
                  <span className="dr16-rig__head" style={active && data.case === 'yellow' ? { left: '58%', top: '46%' } : undefined} />
                </div>
                <div className="dr16-rig__name">{i === data.slot ? data.hrn : `#${i + 1}`}</div>
              </div>
            );
          })}
        </div>
        <div className="dr16-rack__caption">
          Rig {data.slot + 1} of 10 · {data.hrn}
        </div>
      </div>

      <div className="dr16-tablet">
        <div className={`dr16-tablet__head is-${banner}`}>
          <span className="dr16-tablet__name">{data.hrn}</span>
          <span className="dr16-tablet__status">{statusText}</span>
        </div>
        <div className="dr16-tabs">
          <span>Robot</span>
          <span>Robot Control</span>
          <span className="is-on">Motion Control</span>
        </div>
        <div className="dr16-body">
          {data.case === 'steppers' && !green ? <div className={`dr16-chip ${enabled ? 'is-on' : ''}`}>Steppers: {enabled ? 'ENABLED' : 'DISABLED'}</div> : null}
          {data.case === 'motor-off' && !green ? <div className={`dr16-chip ${enabled ? 'is-on' : ''}`}>POWER panel: MAIN ● on · MOTOR {enabled ? '● on' : '○ off'} — motion buttons {enabled ? 'live' : 'do nothing'}</div> : null}
          <div className="dr16-groups">
            <div className="dr16-group">
              <div className="dr16-group__name">Steppers</div>
              {btn('enable', 'Enable')}
              {btn('disable', 'Disable')}
            </div>
            <div className="dr16-group">
              <div className="dr16-group__name">Park</div>
              {btn('park-all', 'Park All')}
              {btn('park-xy', 'Park XY')}
              {btn('park-x', 'Park X')}
              {btn('park-y', 'Park Y')}
            </div>
            <div className="dr16-group">
              <div className="dr16-group__name">Solenoid</div>
              {btn('sol-down', 'Down')}
            </div>
          </div>
          {locked ? (
            <div className="dr16-lock">
              <div className="dr16-lock__title">TEST IN PROGRESS — CONTROLS LOCKED</div>
              <div className="dr16-lock__job">{data.job}</div>
              <div className="dr16-lock__bar" />
            </div>
          ) : null}
        </div>
        {result && !result.ok ? <div className="dr16-why">{result.why}</div> : null}
      </div>

      <div className="dr16-hands">
        <span className="dr16-hands__label">Hands-on</span>
        {btn('leave', 'Leave it — wait for the job')}
        {btn('drag', 'Drag the carriage')}
        {btn('motor', 'Toggle MOTOR')}
      </div>
      <Legend items={[['P', 'Park All'], ['E', 'Enable'], ['W', 'leave it'], ['', 'Park All +150 · touching a locked rig −100']]} />
    </div>
  );
}
