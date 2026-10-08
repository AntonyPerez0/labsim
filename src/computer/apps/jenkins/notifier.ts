/**
 * Jenkins desktop notifications (Apps §3.10, §1.5): builds the player triggered, and any FAILURE while the
 * Jenkins window is not focused (one per build). Idempotent; started when the Jenkins chunk loads.
 */
import { bus } from '@/core/bus';
import { getState } from '@/core/store';
import { getWindowManager } from '@/computer/apps';
import { buildUrl } from './model';

let stop: (() => void) | null = null;
const notified = new Set<string>();

export function startJenkinsNotifier(): () => void {
  if (stop) return stop;
  const off = bus.on('jenkins.buildFinished', (e) => {
    if (notified.has(e.buildId)) return;
    const wm = getWindowManager();
    if (!wm) return;
    const b = getState().lab.jenkins.builds[e.buildId];
    if (!b) return;
    const mine = b.triggeredBy === 'player';
    const jenkinsFocused = wm.windows().some((w) => w.app === 'jenkins' && w.focused && !w.minimized);
    if (!mine && !(e.result === 'FAILURE' && !jenkinsFocused)) return;
    notified.add(e.buildId);
    wm.notify({
      app: 'jenkins',
      title: `Build #${b.number} ${e.result} — ${b.jobId}`,
      body: e.result === 'FAILURE' ? b.console.filter((l) => l.trim() && !l.startsWith('[Pipeline]') && !l.startsWith('Finished:')).pop() ?? undefined : undefined,
      route: buildUrl(b, 'console'),
      kind: e.result === 'SUCCESS' ? 'success' : e.result === 'FAILURE' ? 'error' : 'warning',
    });
  });
  stop = () => {
    off();
    stop = null;
  };
  return stop;
}
