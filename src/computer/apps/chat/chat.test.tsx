// @vitest-environment jsdom
/**
 * LabChat (Apps §11): post with Enter, quick replies from the missions bridge, channel opened + markRead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { getState } from '@/core/store';
import { sim } from '@/sim';
import { setChatReplyProvider } from '../../apps';
import { captureActions, click, key, makeRoutedHost, mount, type, type Mounted } from '../../shell/sandbox/testkit';
import { ChatApp } from './index';
import { parseInline, plainText } from './model';

let m: Mounted | null = null;
let cap: ReturnType<typeof captureActions>;

afterEach(() => {
  m?.unmount();
  m = null;
  cap?.stop();
  setChatReplyProvider(null);
  vi.restoreAllMocks();
});

describe('LabChat', () => {
  it('opens a channel (markRead + chat.channel.opened) and posts with Enter', async () => {
    act(() => sim.chat.post('#lab-automation', 'riley', 'EVE is yellow again :warning:'));
    cap = captureActions();
    const mark = vi.spyOn(sim.chat, 'markRead');
    const post = vi.spyOn(sim.chat, 'post');
    const host = makeRoutedHost(ChatApp, '/channel/lab-automation');
    m = await mount(<host.Host />);
    expect(mark).toHaveBeenCalledWith('#lab-automation');
    expect(cap.of('chat.channel.opened')[0]).toEqual({ channel: '#lab-automation' });
    expect(m.container.textContent).toContain('EVE is yellow again ⚠️');
    const input = m.container.querySelector('textarea')!;
    expect(input.getAttribute('placeholder')).toBe('Message #lab-automation');
    await type(input, 'On it — parking EVE now');
    await key(input, 'Enter');
    expect(post).toHaveBeenCalledWith('#lab-automation', 'player', 'On it — parking EVE now');
    expect(cap.of('chat.message.sent')[0]).toEqual({ channel: '#lab-automation', text: 'On it — parking EVE now' });
    expect(getState().lab.chat.messages.at(-1)?.text).toBe('On it — parking EVE now');
  });

  it('shows quick replies from the provider and posts the chosen one with its ticket', async () => {
    act(() => sim.chat.post('dm:riley', 'riley', 'Is EVE fixed?', 'LAB-2231'));
    setChatReplyProvider((ctx) => (ctx.channel === 'dm:riley' ? [{ id: 'R_WAIT_PING', label: 'R_WAIT_PING — wait for the next ping', text: "Orca hasn't re-pinged yet; it'll clear at the next health check", ticketId: 'LAB-2231' }] : []));
    cap = captureActions();
    const host = makeRoutedHost(ChatApp, '/dm/riley');
    m = await mount(<host.Host />);
    expect(m.container.querySelector('textarea')!.getAttribute('placeholder')).toBe('Message Riley');
    await click(m.container.querySelector('[data-hint="chat.reply:R_WAIT_PING"]'));
    const ev = cap.of('chat.reply.chosen')[0]!;
    expect(ev).toMatchObject({ channel: 'dm:riley', ticketId: 'LAB-2231', replyId: 'R_WAIT_PING', text: "Orca hasn't re-pinged yet; it'll clear at the next health check" });
    expect(typeof ev.messageId).toBe('string');
  });

  it('renders the mrkdwn subset', () => {
    const parts = parseInline('*bold* and _it_ `code` <http://orca.lab.local:8080/robot|Robots> @engineer :red_circle:');
    expect(parts.map((p) => p.t)).toEqual(['bold', 'text', 'italic', 'text', 'code', 'text', 'link', 'text', 'mention', 'text']);
    expect(plainText(':red_circle: <http://x|label>')).toBe('🔴 label');
  });
});
