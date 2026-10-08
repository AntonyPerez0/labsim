// @vitest-environment jsdom
/**
 * Ollama WebUI (Apps §9): prefill from params (prompt + attach), send through sim.ollama.ask, reveal the sim's
 * verdict verbatim, review tags, and the `Model server unreachable` state (GP INC10).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { getState, mutate } from '@/core/store';
import { sim } from '@/sim';
import { wmApi } from '../../shell/wmStore';
import type { AppParams } from '../../apps';
import { byText, captureActions, click, key, mount, type, type Mounted } from '../../shell/sandbox/testkit';
import { OllamaApp } from './index';
import { _resetChats } from './chats';
import { groupChats, ollamaServiceUp, RECEIPT_PROMPT } from './model';

let m: Mounted | null = null;
let cap: ReturnType<typeof captureActions>;
const routes: string[] = [];

function Host(props: { params?: AppParams }) {
  const [route, setRoute] = useState('/');
  return (
    <OllamaApp
      windowId="wtest"
      route={route}
      params={props.params}
      navigate={(r) => {
        routes.push(r);
        setRoute(r);
      }}
      wm={wmApi}
      onTitle={() => undefined}
      focused
    />
  );
}

async function runUntilDone(): Promise<void> {
  for (let i = 0; i < 400 && getState().lab.ollama.requests.some((r) => r.state === 'running'); i++) act(() => sim.tick(100));
}

beforeEach(() => {
  sim.reset({ preset: 'factory' });
  _resetChats();
  routes.length = 0;
});

afterEach(() => {
  m?.unmount();
  m = null;
  cap?.stop();
});

describe('Ollama WebUI', () => {
  it('prefills the Cur M17 prompt and receipt, sends, and shows the sim verdict verbatim', async () => {
    cap = captureActions();
    m = await mount(<Host params={{ prompt: RECEIPT_PROMPT, attach: 'walle_receipt_0912.jpg' }} />);
    expect(cap.of('ollama.image.attached')[0]).toEqual({ path: '~/Downloads/walle_receipt_0912.jpg', ref: 'img:receipt:wall-e:0912' });
    const ta = m.container.querySelector('textarea')!;
    expect(ta.value).toBe(RECEIPT_PROMPT);
    expect(m.container.textContent).toContain('How can I help you today?');
    await key(ta, 'Enter');
    const sent = cap.of('ollama.prompt.sent')[0]!;
    expect(sent).toMatchObject({ model: 'llava:latest', prompt: RECEIPT_PROMPT, image: 'img:receipt:wall-e:0912', ok: true, error: null });
    expect(routes.at(-1)).toMatch(/^\/c\//);
    expect(m.container.querySelector('.oll-dots')).not.toBeNull();
    await runUntilDone();
    // skip the typing animation
    const typing = m.container.querySelector('.oll-asst-text');
    await click(typing);
    await act(async () => new Promise((r) => setTimeout(r, 80)));
    const req = getState().lab.ollama.requests.find((r) => r.id === sent.requestId)!;
    expect(req.response).toBe('FAIL — tip of 18% on $42.00 should be $7.56; the receipt shows $7.65.');
    expect(m.container.querySelector('.oll-asst-text')!.textContent).toBe(req.response);
    expect(cap.of('ollama.response.received')[0]).toEqual({ requestId: sent.requestId, response: req.response });
    await click(byText(m.container, '.oll-chip', 'Tip math error'));
    expect(cap.of('ollama.response.flagged')[0]).toEqual({ requestId: sent.requestId, flag: 'tip-math-error' });
  });

  it('shows Model server unreachable when the ollama service is down', async () => {
    act(() =>
      mutate((s) => {
        const svc = s.lab.hosts['ollama-vm']?.services['ollama'];
        if (svc) svc.running = false;
        s.lab.ollama.up = false;
      }),
    );
    expect(ollamaServiceUp(getState().lab)).toBe(false);
    cap = captureActions();
    m = await mount(<Host />);
    expect(m.container.textContent).toContain('Model server unreachable');
    expect(m.container.textContent).toContain('http://10.42.1.12:11434 — Connection refused');
    expect(m.container.textContent).toContain('No models available');
    await type(m.container.querySelector('textarea'), 'hello');
    await click(m.container.querySelector('.oll-send'));
    expect(cap.of('ollama.prompt.sent')[0]).toMatchObject({ ok: false, error: 'Model server unreachable', requestId: null });
    expect(m.container.querySelector('.oll-error-card')!.textContent).toContain('Model server unreachable');
  });

  it('groups chats by day', () => {
    const mk = (id: string, createdMs: number) => ({ id, title: id, createdMs, model: 'llava:latest', messages: [] });
    const day = 86_400_000;
    const g = groupChats([mk('a', 2 * day + 5), mk('b', day + 5), mk('c', 10)], 2 * day + 100);
    expect(g.map((x) => [x.label, x.chats.map((c) => c.id)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['Previous 7 days', ['c']],
    ]);
  });
});
