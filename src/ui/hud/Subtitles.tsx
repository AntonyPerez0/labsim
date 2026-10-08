/**
 * Mentor & coworker barks (GP §5.4): subtitled one-liners top-centre, 4 s each, queue max 2, priority
 * safety > ticket > flavour, in the speaker's team colour. Fed by the runtime's `mission.bark` event.
 * The runtime also mirrors each bark into a toast for players with subtitles off; while this strip is
 * showing a bark, the matching toast is hidden (`isBarkToast`).
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { bus } from '@/core/bus';
import { useGame } from '@/core/store';
import type { Toast } from '@/core/state';
import { teamMember } from '@/content';

interface Bark {
  id: number;
  speaker: string;
  text: string;
  priority: number;
}

const PRIORITY: Record<string, number> = { safety: 3, ticket: 2, flavour: 1 };
const recent = new Map<string, number>();
let seq = 0;

/** True when a toast is the runtime's mirror of a bark that the subtitle strip is already showing. */
export function isBarkToast(t: Toast): boolean {
  if (t.kind !== 'info' || !t.body) return false;
  const at = recent.get(t.body);
  return at !== undefined && performance.now() - at < 6000;
}

export function Subtitles() {
  const enabled = useGame((s) => s.progress.settings.subtitles);
  const [queue, setQueue] = useState<Bark[]>([]);

  useEffect(() => {
    if (!enabled) return;
    return bus.onAny((type, payload) => {
      if (type !== ('mission.bark' as typeof type)) return;
      const p = payload as unknown as { speaker: string; text: string; priority?: string };
      if (!p?.text) return;
      recent.set(p.text, performance.now());
      const bark: Bark = { id: ++seq, speaker: p.speaker, text: p.text, priority: PRIORITY[p.priority ?? 'flavour'] ?? 1 };
      setQueue((q) => [...q, bark].sort((a, b) => b.priority - a.priority || a.id - b.id).slice(0, 2));
      setTimeout(() => setQueue((q) => q.filter((b) => b.id !== bark.id)), 4000);
    });
  }, [enabled]);

  if (!enabled || !queue.length) return null;
  return (
    <div className="hud-subs" aria-live="polite">
      {queue.map((b) => {
        const m = teamMember(b.speaker);
        return (
          <div key={b.id} className="hud-sub" style={{ '--speaker': m?.color ?? '#43b02a' } as CSSProperties}>
            <span className="hud-sub__who">{m?.name ?? b.speaker}</span>
            {b.text}
          </div>
        );
      })}
    </div>
  );
}
