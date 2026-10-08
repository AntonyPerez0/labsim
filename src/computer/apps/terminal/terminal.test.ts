/**
 * Terminal logic (Apps §5): readline editing, completion, prompt parsing, nano, and a session over a mocked
 * `sim.terminal` (submit, history, streaming poll, Ctrl+C, clear, action events).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bus } from '@/core/bus';
import { sim } from '@/sim';
import type { TerminalResult } from '@/sim';
import { applyCompletion, backspace, formatColumns, insertText, killPrevWord, killToEnd, killToStart, tokenStart, wordLeft, wordRight } from './lineEditor';
import { countLines, joinLines, NanoModel, splitLines } from './nano';
import { parsePrompt, resolveShellPath, titleFromPrompt } from './prompt';
import { TermSession } from './session';

const k = (key: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({ key, ctrl: false, alt: false, shift: false, meta: false, ...mods });
const opts = { tabCompletion: true, keyboardLocked: false };

describe('lineEditor', () => {
  it('edits like readline', () => {
    let s = insertText({ text: '', cursor: 0 }, 'adb devices');
    expect(s).toEqual({ text: 'adb devices', cursor: 11 });
    s = backspace(s);
    expect(s.text).toBe('adb device');
    expect(wordLeft(s).cursor).toBe(4);
    expect(wordRight({ text: 'adb device', cursor: 0 }).cursor).toBe(3);
    expect(killToStart({ text: 'abc def', cursor: 4 })).toMatchObject({ text: 'def', killed: 'abc ' });
    expect(killToEnd({ text: 'abc def', cursor: 4 })).toMatchObject({ text: 'abc ', killed: 'def' });
    expect(killPrevWord({ text: 'ssh pi@10.42.10.11', cursor: 18 })).toMatchObject({ text: 'ssh ', killed: 'pi@10.42.10.11' });
  });
  it('applies completion candidates (token- or line-shaped)', () => {
    expect(tokenStart('cd Idea')).toBe(3);
    expect(applyCompletion({ text: 'cd Idea', cursor: 7 }, ['IdeaProjects/']).next.text).toBe('cd IdeaProjects/');
    expect(applyCompletion({ text: 'cd Idea', cursor: 7 }, ['cd IdeaProjects/']).next.text).toBe('cd IdeaProjects/');
    const amb = applyCompletion({ text: 'git ch', cursor: 6 }, ['checkout', 'cherry-pick']);
    expect(amb.next.text).toBe('git che');
    expect(amb.candidates).toEqual(['checkout', 'cherry-pick']);
    expect(applyCompletion({ text: 'ls', cursor: 2 }, ['ls']).next.text).toBe('ls ');
    expect(formatColumns(['a', 'bb', 'ccc'], 20)).toEqual(['a    bb   ccc']);
  });
});

describe('prompt', () => {
  it('parses bash, Pi, cmd and PowerShell prompts', () => {
    const p = parsePrompt('engineer@ws-17:~/IdeaProjects/uia-remote$ ');
    expect(p).toMatchObject({ shell: 'bash', user: 'engineer', host: 'ws-17', path: '~/IdeaProjects/uia-remote' });
    expect(p.segments.map((s) => s.kind)).toEqual(['userhost', 'plain', 'path', 'plain']);
    expect(parsePrompt('pi@wall-e:~ $ ')).toMatchObject({ shell: 'bash', user: 'pi', host: 'wall-e', path: '~' });
    expect(parsePrompt('automation@MINIX-01 C:\\Users\\automation>')).toMatchObject({ shell: 'cmd', host: 'MINIX-01' });
    expect(parsePrompt('PS C:\\Users\\automation> ')).toMatchObject({ shell: 'powershell' });
    expect(titleFromPrompt('pi@wall-e:~ $ ')).toBe('pi@wall-e: ~');
    expect(titleFromPrompt('automation@MINIX-01 C:\\Users\\automation>')).toBe('automation@MINIX-01: C:\\Users\\automation');
  });
  it('resolves shell paths', () => {
    expect(resolveShellPath('config.properties', 'engineer@ws-17:~/IdeaProjects/uia-remote$ ')).toBe('~/IdeaProjects/uia-remote/config.properties');
    expect(resolveShellPath('/etc/robot-controller/controller.yaml', 'pi@wall-e:~ $ ')).toBe('/etc/robot-controller/controller.yaml');
    expect(resolveShellPath('../x', 'pi@wall-e:~ $ ')).toBe('/home/x');
  });
});

describe('nano', () => {
  it('edits, writes out and exits', () => {
    const saves: [string, string][] = [];
    let exited = false;
    const n = new NanoModel({ path: '/etc/robot-controller/controller.yaml', contents: 'a: 1\nb: 2\n', save: (p, t) => (saves.push([p, t]), { ok: true }), onExit: () => (exited = true) });
    expect(n.status).toBe('[ Read 2 lines ]');
    n.handleKey({ key: 'End', ctrl: false, alt: false, shift: false });
    n.handleKey({ key: '0', ctrl: false, alt: false, shift: false });
    expect(n.modified).toBe(true);
    n.handleKey({ key: 'x', ctrl: true, alt: false, shift: false });
    expect(n.mode.kind).toBe('confirmExit');
    n.handleKey({ key: 'y', ctrl: false, alt: false, shift: false });
    expect(n.mode.kind).toBe('writeOut');
    n.handleKey({ key: 'Enter', ctrl: false, alt: false, shift: false });
    expect(saves[0]).toEqual(['/etc/robot-controller/controller.yaml', 'a: 10\nb: 2\n']);
    expect(exited).toBe(true);
    expect(splitLines('x\n')).toEqual(['x', '']);
    expect(joinLines(['x', ''])).toBe('x\n');
    expect(countLines('a\nb\n')).toBe(2);
  });
  it('opens a missing file as a new buffer', () => {
    const n = new NanoModel({ path: '/tmp/new.txt', contents: null, save: () => ({ ok: true }), onExit: () => undefined });
    expect(n.status).toBe('[ New File ]');
  });
});

describe('TermSession over sim.terminal', () => {
  let actions: { action: string; data: unknown }[] = [];
  let off: () => void = () => undefined;
  beforeEach(() => {
    actions = [];
    off = bus.on('app.action', (e) => actions.push({ action: e.action, data: e.data }));
    vi.useFakeTimers();
  });
  afterEach(() => {
    off();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const res = (lines: TerminalResult['lines'], extra: Partial<TerminalResult> = {}): TerminalResult => ({ lines, exitCode: 0, prompt: 'engineer@ws-17:~$ ', ...extra });

  it('submits, records history, streams, interrupts and clears', () => {
    vi.spyOn(sim.terminal, 'prompt').mockReturnValue('engineer@ws-17:~$ ');
    const exec = vi.spyOn(sim.terminal, 'exec').mockImplementation((line: string) => {
      if (line === '') return res([]);
      if (line.startsWith('ping')) return res([{ text: 'PING 10.42.10.11 (10.42.10.11) 56(84) bytes of data.' }], { streamingJobId: 'job-1' });
      if (line === 'clear') return res([], { clear: true });
      return res([{ text: `${line.split(' ')[0]}: command not found`, kind: 'err' }], { exitCode: 127 });
    });
    let polls = 0;
    vi.spyOn(sim.terminal, 'poll').mockImplementation(() => ({ lines: [{ text: `64 bytes from 10.42.10.11: icmp_seq=${++polls} ttl=64 time=1.84 ms` }], done: false, exitCode: null }));
    const interrupt = vi.spyOn(sim.terminal, 'interrupt').mockImplementation(() => undefined);
    const s = new TermSession({ tabNumber: 1 });
    for (const ch of 'foo') s.handleKey(k(ch), opts);
    s.handleKey(k('Enter'), opts);
    expect(exec).toHaveBeenCalledWith('foo', s.id);
    expect(s.lines.map((l) => l.text)).toContain('foo: command not found');
    expect(s.lines.find((l) => l.text === 'foo: command not found')?.kind).toBe('err');
    expect(actions.find((a) => a.action === 'terminal.command.submitted')?.data).toMatchObject({ tab: 1, line: 'foo', host: null });
    // streaming
    for (const ch of 'ping 10.42.10.11') s.handleKey(k(ch), opts);
    s.handleKey(k('Enter'), opts);
    expect(s.busy).toBe(true);
    vi.advanceTimersByTime(350);
    expect(polls).toBeGreaterThanOrEqual(3);
    s.interrupt();
    expect(interrupt).toHaveBeenCalledWith('job-1', s.id);
    expect(actions.find((a) => a.action === 'terminal.interrupted')?.data).toMatchObject({ line: 'ping 10.42.10.11' });
    vi.advanceTimersByTime(2000);
    expect(s.busy).toBe(false);
    // history
    s.handleKey(k('ArrowUp'), opts);
    expect(s.input.text).toBe('ping 10.42.10.11');
    s.handleKey(k('ArrowUp'), opts);
    expect(s.input.text).toBe('foo');
    s.handleKey(k('ArrowDown'), opts);
    s.handleKey(k('ArrowDown'), opts);
    expect(s.input.text).toBe('');
    // Ctrl+C without a job abandons the line
    for (const ch of 'abc') s.handleKey(k(ch), opts);
    s.interrupt();
    expect(s.lines[s.lines.length - 1]).toMatchObject({ kind: 'prompt', text: 'abc^C' });
    // Ctrl+L clears
    s.handleKey(k('l', { ctrl: true }), opts);
    expect(s.lines).toHaveLength(0);
    s.dispose();
  });

  it('respects session.computer.tabCompletion=false and prefill', () => {
    vi.spyOn(sim.terminal, 'prompt').mockReturnValue('engineer@ws-17:~$ ');
    vi.spyOn(sim.terminal, 'exec').mockReturnValue(res([]));
    const complete = vi.spyOn(sim.terminal, 'complete').mockReturnValue(['IdeaProjects/']);
    const s = new TermSession({ tabNumber: 2, command: 'cd Idea' });
    expect(s.input.text).toBe('cd Idea');
    s.handleKey(k('Tab'), { tabCompletion: false, keyboardLocked: false });
    expect(complete).not.toHaveBeenCalled();
    s.handleKey(k('Tab'), opts);
    expect(s.input.text).toBe('cd IdeaProjects/');
    s.dispose();
  });

  it('reverse-i-search finds history entries', () => {
    vi.spyOn(sim.terminal, 'prompt').mockReturnValue('engineer@ws-17:~$ ');
    vi.spyOn(sim.terminal, 'exec').mockReturnValue(res([]));
    const s = new TermSession({ tabNumber: 3 });
    s.history = ['adb connect 10.42.30.32:5444', 'ls', 'adb devices'];
    s.handleKey(k('r', { ctrl: true }), opts);
    for (const ch of 'adb c') s.handleKey(k(ch), opts);
    expect(s.searchMatch()).toBe('adb connect 10.42.30.32:5444');
    s.handleKey(k('ArrowRight'), opts);
    expect(s.input.text).toBe('adb connect 10.42.30.32:5444');
    s.dispose();
  });
});
