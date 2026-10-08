/**
 * Loading screen while the engine and the procedural lab are built (`ui.loading`). Shows progress,
 * the current build step and rotating "From the Field Manual" facts (core reference facts).
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import { FACTS } from '@/content';
import { LabWordmark } from '@/ui/kit';

export function LoadingScreen() {
  const loading = useGame((s) => s.ui.loading);
  const facts = useMemo(() => FACTS.filter((f) => f.tier === 'core' && f.text.length < 170), []);
  const [i, setI] = useState(() => Math.floor(Math.random() * Math.max(1, facts.length)));
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % Math.max(1, facts.length)), 6500);
    return () => clearInterval(t);
  }, [facts.length]);
  if (!loading) return null;
  const fact = facts[i];
  const pct = Math.round(Math.max(0, Math.min(1, loading.progress)) * 100);
  return (
    <div className="loading" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Loading the lab">
      <div className="loading__grid" />
      <div className="loading__center">
        <div className="loading__brand">
          <LabWordmark size={44} className="loading__mark" />
          <div>
            <div className="loading__title">LabSim</div>
            <div className="loading__subtitle">LabSim Automation Lab</div>
          </div>
        </div>
        <div className="loading__bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="loading__status">
          <span>{loading.label}</span>
          <span className="tnum mono">{pct}%</span>
        </div>
      </div>
      {fact ? (
        <div className="loading__fact" key={fact.id}>
          <div className="caps">From the Field Manual · {fact.id}</div>
          <p>{fact.text}</p>
        </div>
      ) : null}
    </div>
  );
}
