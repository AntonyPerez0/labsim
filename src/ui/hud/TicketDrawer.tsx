/**
 * Ticket board (`tickets` overlay, `T`/`J`; non-pausing — the shift keeps running). Left: queue.
 * Right: the selected ticket — symptoms/summary, SLA, Diagnosis Call picker (GP §2.3.6), Escalate to
 * Jared form (cause + exact endpoint, GP §2.3.7), LabChat reply, File-bug / matching tasks, hints
 * (Nudge → Pointer → Walkthrough), Resolve (GW16 if premature) and the verification line.
 */
import { useEffect, useMemo, useState } from 'react';
import { mutate, useGame } from '@/core/store';
import type { TicketPanel, TicketState } from '@/core/state';
import type { TicketView } from '@/missions';
import { personName } from '@/content';
import { Button, Chip, EmptyState, Icon, Kbd, Select, TextField } from '@/ui/kit';
import { hasMission, ma, mq } from '@/ui/services/missions';
import { closeOverlay, replaceOverlay } from '@/ui/services/nav';
import { mmss } from '@/ui/services/format';
import { pushToast } from '@/ui/services/toasts';
import { uiSound } from '@/ui/services/sound';
import { isTicketOpen, reporterName, slaFraction, STATUS_LABEL, TicketCard } from './TicketQueue';

function fallbackView(t: TicketState): TicketView {
  return {
    ticket: t,
    incidentName: t.incidentId,
    callOptions: null,
    replies: null,
    task: null,
    escalatable: false,
    endpointCandidates: [],
    nextHintTier: 0,
    hints: [],
    verifyingLabel: t.verifying?.label ?? null,
    slaFraction: slaFraction(t),
  };
}

export function TicketDrawer({ ticketId, panel }: { ticketId?: string; panel?: TicketPanel }) {
  const tickets = useGame((s) => s.session.tickets);
  const selectedFromUi = useGame((s) => s.ui.selectedTicketId);
  const shiftRunning = useGame((s) => !!s.session.shift);
  const shiftLeft = useGame((s) => (s.session.shift ? Math.max(0, Math.ceil(s.session.shift.durationS - s.session.shift.elapsedS)) : null));
  const shiftScore = useGame((s) => (s.session.shift?.rules.scoring ? s.session.shift.score : null));
  const nextHc = useGame((s) => (s.session.shift ? Math.ceil(Math.max(0, s.session.shift.nextHealthCheckInS)) : null));
  const open = tickets.filter(isTicketOpen);
  const closed = tickets.filter((t) => !isTicketOpen(t)).slice(-6).reverse();
  const id = ticketId ?? selectedFromUi ?? open[0]?.id ?? null;
  const ticket = tickets.find((t) => t.id === id) ?? null;

  const select = (tid: string) => {
    if (hasMission('openTicket')) ma('openTicket', tid);
    mutate((s) => {
      s.ui.selectedTicketId = tid;
    });
    replaceOverlay({ kind: 'tickets', ticketId: tid, panel: 'detail' });
  };

  return (
    <div className="tix" data-ui-interactive>
      <aside className="tix__list">
        <header className="tix__list-head">
          <Icon name="ticket" size={15} />
          <span>Ticket board</span>
          <span className="spacer" />
          <span className="tix__count tnum">{open.length} open</span>
        </header>
        {shiftLeft !== null ? (
          <div className="tix__shift tnum">
            <span title="Shift time left">
              <Icon name="clock" size={12} /> {mmss(shiftLeft)}
            </span>
            {nextHc !== null ? (
              <span title="Next Orca health check">
                <Icon name="refresh" size={12} /> {mmss(nextHc)}
              </span>
            ) : null}
            {shiftScore !== null ? <span className="tix__score">{shiftScore.toLocaleString('en-US')} pts</span> : null}
          </div>
        ) : null}
        <div className="tix__cards">
          {open.length === 0 ? <div className="tix__none">{shiftRunning ? 'Queue clear — keep an eye on the pipelines.' : 'No tickets.'}</div> : null}
          {open.map((t) => (
            <TicketCard key={t.id} t={t} selected={t.id === id} compact onClick={() => select(t.id)} />
          ))}
          {closed.length ? <div className="tix__sep">Recently closed</div> : null}
          {closed.map((t) => (
            <TicketCard key={t.id} t={t} selected={t.id === id} compact onClick={() => select(t.id)} />
          ))}
        </div>
        <footer className="tix__keys">
          <Kbd k="Enter" size="sm" /> ack · <Kbd k="Esc" size="sm" /> close · the shift keeps running
        </footer>
      </aside>
      <section className="tix__detail">
        {ticket ? <TicketDetail key={ticket.id} ticket={ticket} panel={panel ?? 'detail'} /> : <EmptyState icon="ticket" title="No ticket selected">Pick a ticket on the left. New tickets arrive from Jenkins Bot and your coworkers.</EmptyState>}
      </section>
    </div>
  );
}

function TicketDetail({ ticket, panel }: { ticket: TicketState; panel: TicketPanel }) {
  const view = useMemo(() => mq('ticketView', [ticket.id], null) ?? fallbackView(ticket), [ticket]);
  const [tab, setTab] = useState<TicketPanel>(panel === 'list' ? 'detail' : panel);
  const [hintText, setHintText] = useState<string[]>(view.hints);
  const [confirmT3, setConfirmT3] = useState(false);
  const t = view.ticket;
  const isOpen = isTicketOpen(t);
  const frac = slaFraction(t);

  useEffect(() => setHintText(view.hints), [view.hints]);

  // Enter acks a NEW ticket (GP §2.3.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.tagName === 'BUTTON')) return;
      if (t.status === 'new') {
        e.preventDefault();
        ma('ackTicket', t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [t.id, t.status]);

  const hint = () => {
    const r = ma('ticketHint', t.id, confirmT3);
    if (!r) return;
    if (r.needsConfirm && !confirmT3) {
      setConfirmT3(true);
      pushToast({ kind: 'warning', title: 'Walkthrough hint', body: 'Tier 3 halves this ticket’s score and stops the combo. Press Hint again to confirm.', icon: 'hint' });
      return;
    }
    setConfirmT3(false);
    setHintText((h) => [...h, r.text]);
  };

  const resolve = () => {
    const r = ma('resolveTicket', t.id);
    if (!r) return;
    if (r.outcome === 'resolved') uiSound('ui-success');
    else if (r.outcome === 'rejected') {
      uiSound('ui-fail');
      pushToast({ kind: 'penalty', title: 'Resolve rejected', body: r.message });
    } else pushToast({ kind: 'info', title: 'Verifying…', body: r.message, icon: 'refresh' });
  };

  const tabs: { id: TicketPanel; label: string; show: boolean }[] = [
    { id: 'detail', label: 'Details', show: true },
    { id: 'call', label: 'Call root cause', show: !!view.callOptions && t.canCall },
    { id: 'escalate', label: `Escalate to ${personName('jared')}`, show: true },
    { id: 'reply', label: 'Reply', show: !!view.replies?.length },
    { id: 'task', label: view.task?.kind === 'bug' ? 'File bug' : 'Task', show: !!view.task },
  ];

  return (
    <div className="tixd">
      <header className="tixd__head">
        <div className="tixd__row">
          <span className={`hud-sev hud-sev--${t.severity.toLowerCase()}`}>{t.severity}</span>
          <span className="mono tixd__id">{t.id}</span>
          <span className={`hud-ticket__state hud-ticket__state--${t.status}`}>{STATUS_LABEL[t.status]}</span>
          {t.breached ? <Chip tone="red" size="sm">SLA breached</Chip> : null}
          {t.notYetTaught ? <Chip tone="violet" size="sm">Not yet taught</Chip> : null}
          {t.plannedWork ? <Chip tone="cyan" size="sm">Planned work</Chip> : null}
          <span className="spacer" />
          <span className="tixd__reporter">
            from <strong>{reporterName(t.reporter)}</strong>
          </span>
        </div>
        <h2 className="tixd__title">{t.title}</h2>
        <div className="tixd__meta">
          {t.binding.hrn || t.robotId ? (
            <span className="tixd__rig mono">
              <Icon name="robot" size={13} /> {t.binding.hrn ?? t.robotId?.toUpperCase()}
              {t.binding.rigs.length > 1 ? <span className="dim"> +{t.binding.rigs.length - 1}</span> : null}
            </span>
          ) : null}
          {isOpen ? (
            <span className="tixd__sla">
              <span className={`tixd__slabar tixd__slabar--${t.breached ? 'breached' : t.sla}`}>
                <span style={{ width: `${frac * 100}%` }} />
              </span>
              <span className="tnum mono">{t.breached ? `breached +${mmss(-t.slaSecondsLeft)}` : `SLA ${mmss(t.slaSecondsLeft)}`}</span>
            </span>
          ) : t.score ? (
            <span className="tixd__score tnum">+{t.points} pts</span>
          ) : null}
        </div>
      </header>

      <nav className="tixd__tabs">
        {tabs
          .filter((x) => x.show)
          .map((x) => (
            <button key={x.id} type="button" className={`tixd__tab${tab === x.id ? ' is-active' : ''}`} onClick={() => setTab(x.id)}>
              {x.label}
              {x.id === 'call' && t.call ? <Icon name={t.call.correct ? 'check' : 'x'} size={12} /> : null}
            </button>
          ))}
      </nav>

      <div className="tixd__body">
        {tab === 'detail' ? (
          <>
            <p className="tixd__summary">{t.summary || 'No further details were given. Start from the evidence: Orca Notes, the Jenkins console, the tablet and the LEDs.'}</p>
            {t.verifying ? (
              <div className="tixd__verifying">
                <Icon name="refresh" size={14} /> {t.verifying.label}
              </div>
            ) : null}
            {t.escalation ? (
              <div className={`tixd__esc tixd__esc--${t.escalation.outcome}`}>
                <Icon name="escalate" size={14} />
                <div>
                  <strong>Escalated to {personName('jared')}</strong> — {t.escalation.outcome}
                  <div className="mono dim">{t.escalation.endpoint}</div>
                  {t.escalation.message ? <div>{t.escalation.message}</div> : null}
                </div>
              </div>
            ) : null}
            {t.call ? (
              <div className={`tixd__call ${t.call.correct ? 'is-right' : 'is-wrong'}`}>
                <Icon name={t.call.correct ? 'check' : 'x'} size={14} /> Diagnosis call: {view.callOptions?.find((o) => o.id === t.call!.optionId)?.text ?? t.call.optionId}
                {t.call.fast ? <Chip tone="green" size="sm" icon="bolt">Fast Diagnosis</Chip> : null}
              </div>
            ) : null}
            {hintText.length ? (
              <div className="tixd__hints">
                {hintText.map((h, i) => (
                  <div key={i} className="tixd__hint">
                    <span className="tixd__hint-tier">{['Nudge', 'Pointer', 'Walkthrough'][i] ?? `Hint ${i + 1}`}</span>
                    {h}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="tixd__process">
              <div className="caps">By the book</div>
              <ol>
                <li>Read the evidence first — Orca Notes, the Jenkins console, the tablet banner, LEDs.</li>
                <li>Make your Diagnosis Call before you fix (fast correct calls build the combo).</li>
                <li>Hardware Connection Failed? Escalate to {personName('jared')} with the exact endpoint — or fix it hands-on.</li>
                <li>Resolve only once the fix is verified — a recovered robot shows in Orca only after the next 5-minute health check.</li>
              </ol>
            </div>
          </>
        ) : null}
        {tab === 'call' ? <CallPanel view={view} /> : null}
        {tab === 'escalate' ? <EscalatePanel view={view} /> : null}
        {tab === 'reply' ? <ReplyPanel view={view} /> : null}
        {tab === 'task' ? <TaskPanel view={view} /> : null}
      </div>

      <footer className="tixd__actions">
        {t.status === 'new' ? (
          <Button variant="secondary" icon="check" kbd="Enter" onClick={() => ma('ackTicket', t.id)}>
            Ack
          </Button>
        ) : null}
        <Button variant="game" icon="hint" kbd="H" onClick={hint} disabled={!isOpen || view.nextHintTier === 0}>
          {confirmT3 ? 'Confirm walkthrough' : 'Hint'}
        </Button>
        <span className="spacer" />
        <Button variant="ghost" onClick={() => closeOverlay({ lock: true })}>
          Back to the lab
        </Button>
        <Button variant="primary" icon="check" onClick={resolve} disabled={!isOpen || t.status === 'verifying'}>
          Resolve
        </Button>
      </footer>
    </div>
  );
}

function CallPanel({ view }: { view: TicketView }) {
  const t = view.ticket;
  const [result, setResult] = useState<string | null>(null);
  if (!view.callOptions) return null;
  const made = t.call;
  return (
    <div className="tixd__panel">
      <p className="muted">One call per ticket. A correct call within the diagnosis par (0.4 × par from Ack) is a <strong>Fast Diagnosis</strong>; a wrong call costs 10 % of the base and resets the combo.</p>
      <div className="tixd__options">
        {view.callOptions.map((o, i) => {
          const chosen = made?.optionId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              className={`tixd__option${chosen ? (made!.correct ? ' is-right' : ' is-wrong') : ''}`}
              disabled={!!made}
              onClick={() => {
                const r = ma('callRootCause', t.id, o.id);
                if (!r) return;
                uiSound(r.correct ? 'ui-success' : 'ui-fail');
                setResult(r.correct ? `Correct${r.fast ? ' — Fast Diagnosis' : ''} (+${r.points})` : r.wrongCallHint ?? 'Not quite — look at the evidence again.');
              }}
            >
              <Kbd k={String.fromCharCode(65 + i)} size="sm" />
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>
      {result ? <div className="tixd__result">{result}</div> : null}
    </div>
  );
}

function EscalatePanel({ view }: { view: TicketView }) {
  const t = view.ticket;
  const options = view.callOptions ?? [];
  const [cause, setCause] = useState(options[0]?.id ?? '');
  const [endpoint, setEndpoint] = useState(view.endpointCandidates[0] ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const sent = !!t.escalation && t.escalation.outcome !== 'bounced';
  return (
    <div className="tixd__panel">
      <p className="muted">
        Connection Failed caused by hardware goes to {personName('jared')} — with the exact endpoint from the rig’s latest Orca Notes line (or your own terminal history) and the cause. Config problems are yours to fix.
      </p>
      <div className="tixd__form">
        <label className="tixd__label">Rig</label>
        <div className="mono tixd__static">{t.binding.hrn ?? t.robotId?.toUpperCase() ?? '—'}</div>
        <label className="tixd__label">Endpoint</label>
        {view.endpointCandidates.length ? (
          <Select value={endpoint} onChange={setEndpoint} options={view.endpointCandidates.map((u) => ({ value: u, label: u }))} ariaLabel="Endpoint" />
        ) : (
          <TextField value={endpoint} onChange={setEndpoint} placeholder="http://10.42.10.x:8000/…" mono ariaLabel="Endpoint" />
        )}
        <label className="tixd__label">Cause</label>
        {options.length ? <Select value={cause} onChange={setCause} options={options.map((o) => ({ value: o.id, label: o.text }))} ariaLabel="Cause" /> : <TextField value={cause} onChange={setCause} placeholder="What failed?" ariaLabel="Cause" />}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <Button
          variant="primary"
          icon="send"
          disabled={sent || !endpoint || !cause}
          onClick={() => {
            const r = ma('escalate', t.id, { cause, endpoint });
            if (r) setMsg(r.message);
          }}
        >
          Send to {personName('jared')}
        </Button>
        {sent ? <span className="muted">Escalation {t.escalation!.outcome}.</span> : null}
      </div>
      {msg ? <div className="tixd__result">{msg}</div> : null}
    </div>
  );
}

function ReplyPanel({ view }: { view: TicketView }) {
  const t = view.ticket;
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="tixd__panel">
      <p className="muted">Reply to {reporterName(t.reporter)} in LabChat. Pick the answer that is true to the lab’s process.</p>
      <div className="tixd__options">
        {(view.replies ?? []).map((r, i) => (
          <button
            key={r.id}
            type="button"
            className={`tixd__option${t.reply === r.id ? ' is-chosen' : ''}`}
            onClick={() => {
              const res = ma('replyTicket', t.id, r.id);
              if (!res) return;
              uiSound(res.correct ? 'ui-success' : 'ui-fail');
              setMsg(res.correct ? 'Reply sent.' : 'That reply was not right — see the Teach Card.');
            }}
          >
            <Kbd k={String(i + 1)} size="sm" />
            <span>{r.text}</span>
          </button>
        ))}
      </div>
      {msg ? <div className="tixd__result">{msg}</div> : null}
    </div>
  );
}

function TaskPanel({ view }: { view: TicketView }) {
  const t = view.ticket;
  const task = view.task;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [statusLine, setStatusLine] = useState<string>('');
  if (!task) return null;
  const report = (r: ReturnType<typeof ma<'fileBug'>>) => {
    if (!r) return;
    uiSound(r.outcome === 'rejected' ? 'ui-fail' : 'ui-success');
    pushToast({ kind: r.outcome === 'rejected' ? 'penalty' : 'success', title: r.outcome === 'rejected' ? 'Not yet' : 'Submitted', body: r.message });
  };
  if (task.kind === 'bug') {
    return (
      <div className="tixd__panel">
        <p className="muted">{task.prompt}</p>
        <div className="tixd__form">
          {task.fields.map((f) => (
            <FieldPair key={f.id} label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`}>
              <TextField value={fields[f.id] ?? ''} onChange={(v) => setFields((x) => ({ ...x, [f.id]: v }))} mono ariaLabel={f.label} />
            </FieldPair>
          ))}
        </div>
        <Button variant="primary" icon="bug" style={{ marginTop: 12 }} onClick={() => report(ma('fileBug', t.id, fields))}>
          File bug
        </Button>
      </div>
    );
  }
  return (
    <div className="tixd__panel">
      <p className="muted">{task.prompt}</p>
      <div className="tixd__form">
        {task.left.map((l) => (
          <FieldPair key={l} label={l}>
            <Select value={matches[l] ?? ''} onChange={(v) => setMatches((m) => ({ ...m, [l]: v }))} options={[{ value: '', label: 'Choose…' }, ...task.right.map((r) => ({ value: r, label: r }))]} ariaLabel={l} />
          </FieldPair>
        ))}
        {task.statusLine ? (
          <FieldPair label={task.statusLine.prompt}>
            <Select value={statusLine} onChange={setStatusLine} options={[{ value: '', label: 'Choose…' }, ...task.statusLine.options.map((o) => ({ value: o.id, label: o.text }))]} ariaLabel="Status line" />
          </FieldPair>
        ) : null}
      </div>
      <Button variant="primary" icon="send" style={{ marginTop: 12 }} onClick={() => report(ma('submitTask', t.id, { matches, statusLineId: statusLine || undefined }))}>
        Submit
      </Button>
    </div>
  );
}

function FieldPair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <label className="tixd__label">{label}</label>
      <div>{children}</div>
    </>
  );
}
