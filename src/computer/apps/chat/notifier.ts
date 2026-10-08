/**
 * LabChat desktop notifications (Apps §11.3, §1.5): a new message not from the player in a channel that is
 * not on screen → toast (+ taskbar badge from `lab.chat.unread`). `#orca-alerts` posts are mirrored with the
 * Orca icon while the Orca window is open. Started by `initComputer()`.
 */
import { bus } from '@/core/bus';
import { getWindowManager } from '../../apps';
import { channelFromRoute, channelTitle, isPlayerAuthor, plainText } from './model';

export function startChatNotifier(): () => void {
  return bus.on('chat.message', (m) => {
    if (isPlayerAuthor(m.author)) return;
    const wm = getWindowManager();
    if (!wm) return;
    const wins = wm.windows();
    const chatWin = wins.find((w) => w.app === 'chat');
    const onScreen = chatWin && chatWin.focused && !chatWin.minimized && channelFromRoute(chatWin.route) === m.channel;
    if (onScreen) return;
    const firstLine = plainText(m.text).split('\n')[0] ?? '';
    const route = m.channel.startsWith('dm:') ? `/dm/${m.channel.slice(3)}` : `/channel/${m.channel.replace(/^#/, '')}`;
    wm.notify({ app: 'chat', title: channelTitle(m.channel, m.author), body: firstLine, route });
    if (m.channel === '#orca-alerts' && wins.some((w) => w.app === 'orca') && /:red_circle:|FAIL/.test(m.text)) {
      wm.notify({ app: 'orca', title: 'Health check failure', body: firstLine, route: '/admin/health-check-log', kind: 'warning' });
    }
  });
}
