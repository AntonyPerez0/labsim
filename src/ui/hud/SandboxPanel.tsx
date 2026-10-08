/**
 * Free Play sandbox panel (`F10`, GP §2.5; non-pausing): time scale 1×/2×/5×/10× (hold `]` for ×30),
 * penalties, pipelines, random faults, Inspect truth (disables XP), reset to factory, 3 snapshot slots,
 * and the Fault Injector (FI01…FI65 = INC01…INC65, variants, rig, "Create ticket").
 */
import { useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import type { FaultInjectorEntry, SandboxPatch } from '@/missions';
import { Button, Chip, EmptyState, Icon, Segmented, Select, TextField, Toggle } from '@/ui/kit';
import { hasMission, ma, mq } from '@/ui/services/missions';
import { closeOverlay } from '@/ui/services/nav';
import { pushToast } from '@/ui/services/toasts';
import { dateLabel } from '@/ui/services/format';
import { sim } from '@/sim';

function setSandbox(patch: SandboxPatch): void {
  if (hasMission('setSandbox')) {
    ma('setSandbox', patch);
    return;
  }
  // Runtime not available: the time scale can still be driven straight through the sim.
  if (patch.timeScale) {
    try {
      sim.setTimeScale(patch.timeScale);
    } catch {
      /* sim stub */
    }
  }
}

export function SandboxPanel() {
  const fp = useGame((s) => s.session.freeplay);
  const timeScale = useGame((s) => s.lab.time.timeScale);
  const [tab, setTab] = useState<'lab' | 'faults'>('faults');
  const entries = useMemo(() => mq('faultInjectorEntries', [], []), []);
  const slots = mq('snapshotSlots', [], []);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <aside className="sbx" data-ui-interactive>
      <header className="sbx__head">
        <Icon name="sandbox" size={16} />
        <div className="grow">
          <div className="sbx__title">Sandbox</div>
          <div className="sbx__sub">Free Play · the lab keeps running</div>
        </div>
        <Button size="sm" variant="ghost" icon="x" onClick={() => closeOverlay({ lock: true })} aria-label="Close (Esc / F10)" />
      </header>
      <nav className="sbx__tabs">
        <button type="button" className={tab === 'faults' ? 'is-active' : ''} onClick={() => setTab('faults')}>
          Fault Injector
        </button>
        <button type="button" className={tab === 'lab' ? 'is-active' : ''} onClick={() => setTab('lab')}>
          Lab controls
        </button>
      </nav>
      <div className="sbx__body">
        {tab === 'lab' ? (
          <div className="sbx__section">
            <div className="sbx__row">
              <span>Time scale</span>
              <Segmented
                size="sm"
                value={(fp?.timeScale ?? timeScale) as 1 | 2 | 5 | 10}
                options={[1, 2, 5, 10].map((v) => ({ value: v as 1 | 2 | 5 | 10, label: `${v}×` }))}
                onChange={(v) => setSandbox({ timeScale: v })}
              />
            </div>
            <div className="sbx__note">
              Hold <kbd className="k-kbd k-kbd--sm">]</kbd> to fast-forward ×30. Orca pings every Pi every 5 game minutes.
            </div>
            <Toggle label="Penalties" hint="Off by default — Teach Cards still fire." checked={fp?.penalties ?? false} onChange={(v) => setSandbox({ penalties: v })} />
            <Toggle label="Background pipelines" hint="PL1–PL8 keep checking out rigs." checked={fp?.pipelines ?? true} onChange={(v) => setSandbox({ pipelines: v })} />
            <div className="sbx__row">
              <span>Random faults</span>
              <Segmented
                size="sm"
                value={fp?.randomFaults ?? 'off'}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: '3min', label: 'Every 3 min' },
                  { value: '90s', label: 'Every 90 s' },
                ]}
                onChange={(v) => setSandbox({ randomFaults: v })}
              />
            </div>
            <Toggle label="Inspect truth" hint="Shows the injected root cause. Disables XP for this session." checked={fp?.inspectTruth ?? false} onChange={(v) => setSandbox({ inspectTruth: v })} />
            {fp?.xpDisabled ? <Chip tone="amber" size="sm" icon="alert">XP disabled this session</Chip> : null}
            <div className="sbx__sep" />
            <div className="caps">Snapshots</div>
            <div className="sbx__slots">
              {([1, 2, 3] as const).map((n) => {
                const info = slots[n - 1] ?? null;
                return (
                  <div key={n} className="sbx__slot">
                    <div className="sbx__slot-name">Slot {n}</div>
                    <div className="sbx__slot-meta">{info ? `${info.label} · ${dateLabel(info.savedAt)}` : 'Empty'}</div>
                    <div className="row">
                      <Button size="sm" onClick={() => report(ma('saveSnapshot', n), `Saved to slot ${n}`)}>
                        Save
                      </Button>
                      <Button size="sm" variant="subtle" disabled={!info} onClick={() => report(ma('loadSnapshot', n), `Loaded slot ${n}`)}>
                        Load
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="sbx__sep" />
            {confirmReset ? (
              <div className="row">
                <span className="warn grow">Reset every rig to the factory roster?</span>
                <Button size="sm" variant="danger" onClick={() => (ma('resetLab'), setConfirmReset(false))}>
                  Reset
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="danger" icon="refresh" onClick={() => setConfirmReset(true)}>
                Reset lab to factory
              </Button>
            )}
          </div>
        ) : (
          <FaultInjector entries={entries} />
        )}
      </div>
    </aside>
  );
}

function report(r: { ok: boolean; error?: string } | undefined, ok: string): void {
  if (!r) return;
  if (r.ok) pushToast({ kind: 'success', title: ok });
  else pushToast({ kind: 'error', title: 'Snapshot failed', body: r.error });
}

function FaultInjector({ entries }: { entries: FaultInjectorEntry[] }) {
  const injected = useGame((s) => s.session.freeplay?.injected ?? []);
  const inspectTruth = useGame((s) => s.session.freeplay?.inspectTruth ?? false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [variant, setVariant] = useState('');
  const [rig, setRig] = useState('');
  const [ticket, setTicket] = useState(true);

  if (!entries.length) {
    return (
      <EmptyState icon="bug" title="Fault Injector warming up">
        The injector lists FI01–FI65 (one per Arcade incident) once the incident catalogue is installed.
      </EmptyState>
    );
  }
  const q = query.trim().toLowerCase();
  const list = entries.filter((e) => !q || e.fiId.toLowerCase().includes(q) || e.incidentId.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  const active = injected.filter((f) => f.fixedAtMs === null);

  return (
    <div className="sbx__section">
      {active.length ? (
        <div className="sbx__active">
          <div className="caps">Active faults</div>
          {active.map((f) => (
            <div key={f.id} className="sbx__active-row">
              <span className="mono">{f.id}</span>
              <span className="grow">{inspectTruth ? entries.find((e) => e.incidentId === f.incidentId)?.name ?? f.incidentId : 'Hidden — find it!'}</span>
              {f.binding.hrn ? <span className="mono dim">{f.binding.hrn}</span> : null}
              <Button size="sm" variant="ghost" onClick={() => ma('clearFault', f.id)}>
                Clear
              </Button>
            </div>
          ))}
          <Button size="sm" variant="subtle" onClick={() => ma('clearAllFaults')}>
            Clear all
          </Button>
        </div>
      ) : null}
      <TextField value={query} onChange={setQuery} placeholder="Search FI01…FI65, e.g. fuse, 5555" icon={<Icon name="search" size={14} />} ariaLabel="Search faults" />
      <div className="sbx__faults">
        {list.map((e) => {
          const isOpen = open === e.fiId;
          return (
            <div key={e.fiId} className={`sbx__fault${e.taught ? '' : ' is-untaught'}${isOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="sbx__fault-head"
                onClick={() => {
                  setOpen(isOpen ? null : e.fiId);
                  setVariant(e.variants[0]?.id ?? '');
                  setRig(e.defaultRig ?? e.rigs[0] ?? '');
                }}
              >
                <span className="mono sbx__fi">{e.fiId}</span>
                <span className="grow">{e.name}</span>
                {e.taught ? null : <Chip size="sm" tone="violet">Not yet taught</Chip>}
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} />
              </button>
              {isOpen ? (
                <div className="sbx__fault-body">
                  {e.variants.length > 1 ? (
                    <div className="sbx__row">
                      <span>Variant</span>
                      <Select value={variant} onChange={setVariant} options={e.variants.map((v) => ({ value: v.id, label: v.label }))} ariaLabel="Variant" />
                    </div>
                  ) : null}
                  {e.rigs.length ? (
                    <div className="sbx__row">
                      <span>Rig</span>
                      <Select value={rig} onChange={setRig} options={e.rigs.map((r) => ({ value: r, label: r.toUpperCase() }))} ariaLabel="Rig" />
                    </div>
                  ) : null}
                  <Toggle label="Create ticket" checked={ticket} onChange={setTicket} />
                  <Button
                    variant="primary"
                    icon="bolt"
                    onClick={() => {
                      const r = ma('injectFault', e.incidentId, { variantId: variant || undefined, rig: rig || undefined, createTicket: ticket });
                      // Success is announced by the runtime ("FI13#1 injected … on BUMBLEBEE"); only failures here.
                      if (r && !r.ok) pushToast({ kind: 'error', title: 'Could not inject', body: r.error });
                    }}
                  >
                    Inject {e.fiId}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
