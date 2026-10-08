/**
 * The workstation terminal (Apps §5, Sim §3.15, §3.22): shell semantics, adb (5444 vs the 5555
 * coworker trap), UI Automator dumps, ssh + systemctl, curl against Orca, git commit/push/PR, local runs.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bus } from '@/core/bus';
import { getState, transact } from '@/core/store';
import { sim } from '@/sim';
import type { TerminalLine } from '../api';
import type { LabState } from '../types';
import { resetTerminalSessions } from './index';

const lab = (): LabState => getState().lab;
const texts = (lines: TerminalLine[]): string[] => lines.map((l) => l.text);

function run(line: string, sessionId?: string): { out: string[]; code: number; prompt: string } {
  const r = (sim.terminal.exec as (l: string, s?: string) => ReturnType<typeof sim.terminal.exec>)(line, sessionId);
  let out = texts(r.lines);
  let code = r.exitCode;
  if (r.streamingJobId) {
    for (let i = 0; i < 2400; i++) {
      sim.tick(250);
      const p = sim.terminal.poll(r.streamingJobId);
      out = [...out, ...texts(p.lines)];
      if (p.done) {
        code = p.exitCode ?? 0;
        break;
      }
    }
  }
  return { out, code, prompt: sim.terminal.prompt() };
}

beforeEach(() => {
  sim.reset({ preset: 'test' });
  resetTerminalSessions();
});

describe('shell basics (Apps §5.2–§5.4)', () => {
  it('prompt, cwd, history, unknown commands and typos', () => {
    expect(sim.terminal.prompt()).toBe('engineer@ws-17:~$ ');
    expect(run('whoami').out).toEqual(['engineer']);
    expect(run('hostname -I').out).toEqual(['10.42.50.17 ']);
    expect(run('date').out[0]).toMatch(/^Mon Oct  5 \d\d:\d\d:\d\d EDT 2026$/);
    expect(run('cd Downloads').prompt).toBe('engineer@ws-17:~/Downloads$ ');
    expect(lab().workstation.cwd).toBe('~/Downloads');
    expect(run('ls').out).toEqual(['walle_receipt_0912.jpg']);
    expect(run('cd -').out).toEqual(['~']);
    expect(run('frobnicate')).toMatchObject({ out: ['frobnicate: command not found'], code: 127 });
    expect(run('gti status').out[0]).toBe("Command 'gti' not found, did you mean:");
    expect(run('cd nowhere').out).toEqual(['bash: cd: nowhere: No such file or directory']);
    expect(lab().workstation.shellHistory.slice(-2)).toEqual(['gti status', 'cd nowhere']);
  });

  it('pipes, lists, redirection and quoting', () => {
    run('echo "hello lab" > note.txt && echo second >> note.txt');
    expect(run('cat note.txt').out).toEqual(['hello lab', 'second']);
    expect(run('cat note.txt | grep -c lab').out).toEqual(['1']);
    expect(run("cat note.txt | grep -v 'hello' | wc -l").out).toEqual(['1']);
    expect(run('false || echo fallback; echo next').out).toEqual(['fallback', 'next']);
    expect(run('false && echo never').out).toEqual([]);
    expect(run('echo "unterminated').out[0]).toMatch(/^bash: unexpected EOF/);
    expect(lab().workstation.files['~/note.txt']).toBe('hello lab\nsecond\n');
  });

  it('tab completion returns token candidates (commands, git subcommands, paths)', () => {
    expect(sim.terminal.complete('ss')).toEqual(['ssh']);
    expect(sim.terminal.complete('git chec')).toEqual(['checkout']);
    expect(sim.terminal.complete('ls Dow')).toEqual(['Downloads/']);
    expect(sim.terminal.complete('cat Downloads/wal')).toEqual(['Downloads/walle_receipt_0912.jpg']);
  });

  it('keeps one shell per tab (Apps D7)', () => {
    const exec = sim.terminal.exec as (l: string, s?: string) => ReturnType<typeof sim.terminal.exec>;
    exec('cd Pictures', 't1');
    const r = exec('pwd', 't2');
    expect(texts(r.lines)).toEqual(['/home/engineer']);
    expect(texts(exec('pwd', 't1').lines)).toEqual(['/home/engineer/Pictures']);
  });
});

describe('adb (Sim §3.15)', () => {
  it('starts the daemon, connects on 5444, refuses the 5555 default, lists devices', () => {
    expect(run('adb devices').out).toEqual(['* daemon not running; starting now at tcp:5037', '* daemon started successfully', 'List of devices attached', '']);
    expect(run('adb connect 10.42.30.32:5444').out).toEqual(['connected to 10.42.30.32:5444']);
    expect(run('adb connect 10.42.30.32')).toMatchObject({ out: ["failed to connect to '10.42.30.32:5555': Connection refused"], code: 1 });
    expect(run('adb devices').out).toEqual(['List of devices attached', '10.42.30.32:5444\tdevice', '']);
    expect(run('adb shell getprop ro.product.model').out).toEqual(['Flex 4']);
  });

  it('5444 never reaches a coworker device; 5555 does — and driving it is recorded', () => {
    expect(run('adb connect 10.42.60.4:5444').code).toBe(1);
    const seen: string[] = [];
    const off = bus.on('adb.coworkerDriven', (p) => seen.push(`${p.target} ${p.command} ${p.by}`));
    expect(run('adb connect 10.42.60.4:5555').out).toEqual(['connected to 10.42.60.4:5555']);
    expect(lab().workstation.adbConnections[0]).toMatchObject({ target: '10.42.60.4:5555', coworker: true });
    run('adb -s 10.42.60.4:5555 shell input keyevent KEYCODE_HOME');
    off();
    expect(seen).toEqual(['10.42.60.4:5555 shell input keyevent KEYCODE_HOME terminal']);
    expect(lab().workstation.coworkerDevicesDisturbed).toBe(1);
  });

  it('uiautomator dump → pull → grep → input tap (Cur M12)', () => {
    run('adb connect 10.42.30.32:5444');
    expect(run('adb -s 10.42.30.32:5444 shell uiautomator dump').out).toEqual(['UI hierchary dumped to: /sdcard/window_dump.xml']);
    const cat = run('adb -s 10.42.30.32:5444 shell cat /sdcard/window_dump.xml').out.join('\n');
    expect(cat).toContain('<hierarchy rotation="0">');
    expect(cat).toContain('text="Register"');
    expect(run('adb -s 10.42.30.32:5444 pull /sdcard/window_dump.xml').out[0]).toMatch(/^\/sdcard\/window_dump\.xml: 1 file pulled\. 0\.4 MB\/s \(\d+ bytes in 0\.017s\)$/);
    const hit = run(`grep -o 'text="Register"[^>]*' window_dump.xml`).out[0]!;
    expect(hit).toMatch(/^text="Register" .*bounds="\[96,412\]\[288,604\]"/);
    run('adb -s 10.42.30.32:5444 shell input tap 192 508');
    const tars = Object.values(lab().devices).find((d) => d.ip === '10.42.30.32')!;
    expect(tars.display.screen).toBe('register');
    run('adb -s 10.42.30.32:5444 exec-out screencap -p > tars.png');
    expect(lab().workstation.files['~/tars.png']).toMatch(/^img:screencap:/);
    expect(run('tesseract tars.png stdout').out).toContain('Review Order');
  });

  it('kill-server forgets connections', () => {
    run('adb connect 10.42.30.32:5444');
    run('adb kill-server');
    expect(lab().workstation.adbServerRunning).toBe(false);
    expect(lab().workstation.adbConnections).toEqual([]);
  });
});

describe('ssh into the Robot Pi and the Windows boxes (Apps §5.4, Cur M05)', () => {
  it('Pi: banner, uname, df, ps | grep wine, systemctl restart robot-controller', { timeout: 30_000 }, () => {
    const login = run('ssh pi@10.42.10.11');
    expect(login.out[0]).toBe('Linux wall-e 6.6.31-v8+ #1 SMP PREEMPT Debian 1:6.6.31-1+rpt1 (2024-05-29) aarch64');
    expect(login.out).toContain('Last login: Mon Oct  5 07:58:12 2026 from 10.42.50.17');
    expect(login.prompt).toBe('pi@wall-e:~ $ ');
    expect(lab().workstation.sshHostId).toBe('pi-wall-e');
    expect(run('uname -a').out[0]).toContain('Linux wall-e');
    expect(run('systemctl status robot-controller').out.join('\n')).toContain('Active: active (running)');
    expect(run('df -h /').out).toEqual(['Filesystem      Size  Used Avail Use% Mounted on', '/dev/mmcblk0p2   29G  6.1G   22G  22% /']);
    expect(run('ps aux | grep -i wine').out.join('\n')).toContain('wine C:\\CardProg\\CardProgrammer.exe');
    expect(run('systemctl restart robot-controller').out[0]).toBe('Failed to restart robot-controller.service: Interactive authentication required.');
    const changes: boolean[] = [];
    const off = bus.on('host.serviceChanged', (p) => {
      if (p.hostId === 'pi-wall-e' && p.service === 'robot-controller') changes.push(p.running);
    });
    expect(run('sudo systemctl restart robot-controller')).toMatchObject({ out: [], code: 0 });
    for (let i = 0; i < 80; i++) sim.tick(250);
    off();
    expect(changes[0]).toBe(false);
    expect(changes[changes.length - 1]).toBe(true);
    expect(run('curl -i http://10.42.10.11:8000/health').out.slice(0, 1)).toEqual(['HTTP/1.1 200 OK']);
    const bye = run('exit');
    expect(bye.out).toEqual(['logout', 'Connection to 10.42.10.11 closed.']);
    expect(bye.prompt).toBe('engineer@ws-17:~$ ');
    expect(lab().workstation.sshHostId).toBeNull();
  });

  it('wrong user and unknown host', () => {
    expect(run('ssh 10.42.10.11').out).toEqual(['engineer@10.42.10.11: Permission denied (publickey).']);
    expect(run('ssh pi@nosuchhost').out).toEqual(['ssh: Could not resolve hostname nosuchhost: Name or service not known']);
  });

  it('Windows box: cmd prompt, sc query Callus, schtasks', () => {
    const r = run('ssh automation@10.42.20.1');
    expect(r.out[0]).toBe('Microsoft Windows [Version 10.0.19044.5011]');
    expect(r.prompt).toBe('automation@MINIX-01 C:\\Users\\automation>');
    expect(run('sc query Callus').out).toContain('        STATE              : 4  RUNNING');
    expect(run('schtasks /run /tn GortCardSync').out).toEqual(['SUCCESS: Attempted to run the scheduled task "GortCardSync".']);
    expect(run('dir C:\\gort\\cards\\emv').out.join('\n')).toContain('visa_std_dip.json');
    expect(run('frob').out).toEqual(["'frob' is not recognized as an internal or external command,", 'operable program or batch file.']);
    expect(run('exit').out).toEqual(['Connection to 10.42.20.1 closed.']);
  });
});

describe('curl (Sim §3.23)', () => {
  it('xy_touch through Orca and the Ollama / Jenkins APIs', () => {
    const r = run(`curl -s -X POST http://orca.lab.local:8080/api/xy_touch -H 'Content-Type: application/json' -d '{"robot":"wall-e","screen":"HOME","button":"Register"}'`);
    expect(r.out[0]).toMatch(/^\{"result":"OK","mode":"PHYSICAL_TAP","x_mm":[\d.]+,"y_mm":[\d.]+/);
    expect(run('curl -s http://10.42.1.12:11434/api/tags | jq -r .models[].name').out).toEqual(['llava:latest']);
    expect(run('curl -s http://jenkins.lab.local:8080/job/Java/job/uia-remote-regression-flex/lastBuild/api/json').out[0]).toMatch(/^\{"number":4119,"result":"SUCCESS","building":false,"duration":\d+\}$/);
    expect(run('curl http://nosuch.lab.local/').out).toEqual(['curl: (6) Could not resolve host: nosuch.lab.local']);
  });
});

describe('git and GitHub from the terminal (Sim §3.22)', () => {
  it('clone, branch, edit, commit, push; protected main on gort', () => {
    expect(run('git status').out).toEqual(['fatal: not a git repository (or any of the parent directories): .git']);
    run('cd IdeaProjects && git clone git@github.com:labsim-lab/uia-remote.git && cd uia-remote');
    expect(sim.terminal.prompt()).toBe('engineer@ws-17:~/IdeaProjects/uia-remote$ ');
    run('git checkout -b fix/readme');
    run('echo "See config.properties.example." >> README.md');
    expect(run('git status').out).toEqual(['On branch fix/readme', '', 'Changes not staged for commit:', '  (use "git add <file>..." to update what will be committed)', '  (use "git restore <file>..." to discard changes in working directory)', '\tmodified:   README.md', '', 'no changes added to commit (use "git add" and/or "git commit -a")']);
    expect(run('git diff').out.some((l) => l === '+See config.properties.example.')).toBe(true);
    run('git add README.md');
    const c = run('git commit -m "Docs: point to the example config"');
    expect(c.out[0]).toMatch(/^\[fix\/readme [0-9a-f]{7}\] Docs: point to the example config$/);
    expect(c.out[1]).toBe(' 1 file changed, 1 insertion(+)');
    expect(run('git push').out[0]).toBe('fatal: The current branch fix/readme has no upstream branch.');
    const p = run('git push -u origin fix/readme');
    expect(p.code).toBe(0);
    expect(p.out).toContain(' * [new branch]      fix/readme -> fix/readme');
    expect(lab().repos['uia-remote'].branches['fix/readme']).toBe(lab().repos['uia-remote'].local!.headSha);
    expect(run('git log --oneline -n 1').out[0]).toMatch(/^[0-9a-f]{7} \(HEAD -> fix\/readme, origin\/fix\/readme\) Docs: point to the example config$/);

    run('cd ~/IdeaProjects && git clone git@github.com:labsim-lab/gort.git && cd gort');
    run('echo x >> README.md && git commit -am "direct to main"');
    const rej = run('git push');
    expect(rej.code).not.toBe(0);
    expect(rej.out).toContain(' ! [remote rejected] main -> main (protected branch hook declined)');
  });

  it('a gort coordinate PR: Jared requests changes, approves the fix, merges, Orca syncs (Sim §3.22.2–§3.22.3)', { timeout: 30_000 }, () => {
    transact((root) => {
      root.lab.config.npcAutoMerge = true;
    });
    const ev: string[] = [];
    const offs = (['github.prReviewed', 'github.prMerged', 'orca.screenLocationsSynced'] as const).map((e) => bus.on(e, (p) => ev.push(`${e}:${'verdict' in p ? p.verdict : 'screen' in p ? p.screen : p.number}`)));
    run('cd ~/IdeaProjects && git clone git@github.com:labsim-lab/gort.git && cd gort && git checkout -b fix/flex3-receipt5');
    const path = 'config/screen-locations/FLEX_3/RECEIPT_OPTIONS_5.json';
    const truth = lab().repos['gort'].local!.files[path]!;
    const nudge = (mm: number): string => truth.replace(/"y": ([\d.]+)/, (_m, y: string) => `"y": ${(Number(y) + mm).toFixed(1)}`);
    sim.git.writeFile('gort', path, nudge(3));
    run('git commit -am "Shift receipt options" && git push -u origin fix/flex3-receipt5');
    const pr = sim.git.createPullRequest('gort', 'Shift FLEX_3 receipt options', '', 'fix/flex3-receipt5', 'player');
    if (!pr.ok) throw new Error(pr.error);
    for (let i = 0; i < 100; i++) sim.tick(250);
    expect(ev).toEqual(['github.prReviewed:CHANGES_REQUESTED']);
    expect(lab().chat.messages.some((m) => m.author === 'jared' && m.text.includes('Print on FLEX_3 is still 3.0 mm low'))).toBe(true);
    sim.git.writeFile('gort', path, nudge(0.3));
    run('git commit -am "Within tolerance" && git push');
    for (let i = 0; i < 160; i++) sim.tick(250);
    offs.forEach((o) => o());
    expect(ev).toEqual(['github.prReviewed:CHANGES_REQUESTED', 'github.prReviewed:APPROVED', `github.prMerged:${pr.value.number}`, 'orca.screenLocationsSynced:RECEIPT_OPTIONS_5']);
  });
});

describe('local runs from the terminal (Sim §1.12, §3.19)', () => {
  it('mvn test reads the local config.properties and streams the runner', { timeout: 60_000 }, () => {
    run('cd IdeaProjects && git clone git@github.com:labsim-lab/uia-remote.git && cd uia-remote');
    expect(run('mvn test -Dtest=TaxTest').out).toContain('java.lang.IllegalStateException: config.properties not found — copy config.properties.example');
    run('cp config.properties.example config.properties');
    const cfg = lab().repos['uia-remote'].local!.files['config.properties']!.replace(/robotName=.*/, 'robotName=megatron');
    sim.git.writeFile('uia-remote', 'config.properties', cfg);
    expect(lab().workstation.configProperties['portNumber']).toBe('5444');
    const r = run('mvn test -Dtest=TaxTest');
    expect(r.out).toContain('[INFO] Running com.labsim.uia.testactions.TaxTest');
    expect(r.out).toContain('[runner] MFD handle 10.42.30.21:5444 connected');
    expect(r.out).toContain('TaxTest PASSED (4/4 steps)');
    expect(r.out).toContain('[INFO] BUILD SUCCESS');
    expect(r.code).toBe(0);
  });
});

describe('the 5555 collision (Sim §3.15.3, Cur S19)', () => {
  it('a local run with portNumber=5555 falls back to the first known device — a coworker\'s Flex', { timeout: 60_000 }, () => {
    run('adb connect 10.42.60.4:5555');
    run('cd IdeaProjects && git clone git@github.com:labsim-lab/uia-remote.git && cd uia-remote && cp config.properties.example config.properties');
    const cfg = lab().repos['uia-remote'].local!.files['config.properties']!.replace(/robotName=.*/, 'robotName=megatron').replace('portNumber=5444', 'portNumber=5555');
    sim.git.writeFile('uia-remote', 'config.properties', cfg);
    const driven: string[] = [];
    const off = bus.on('adb.coworkerDriven', (p) => driven.push(p.by));
    const r = run('mvn test -Dtest=TaxTest');
    off();
    const i = r.out.indexOf('connect 10.42.30.21:5555 … refused');
    expect(i).toBeGreaterThan(-1);
    expect(r.out[i + 1]).toBe('falling back to first known device: 10.42.60.4:5555');
    expect(driven.length).toBeGreaterThan(0);
    expect(driven.every((b) => b === 'runner')).toBe(true);
    expect(lab().workstation.coworkerDevicesDisturbed).toBeGreaterThan(0);
  });
});

describe('ping streaming and Ctrl+C', () => {
  it('prints iputils statistics on interrupt', { timeout: 30_000 }, () => {
    const r = sim.terminal.exec('ping 10.42.10.11');
    expect(r.streamingJobId).toBeTruthy();
    let out: string[] = [];
    for (let i = 0; i < 12; i++) {
      sim.tick(250);
      out = [...out, ...texts(sim.terminal.poll(r.streamingJobId!).lines)];
    }
    sim.terminal.interrupt(r.streamingJobId!);
    const fin = sim.terminal.poll(r.streamingJobId!);
    expect(fin.done).toBe(true);
    out = [...out, ...texts(fin.lines)];
    expect(out[0]).toBe('PING 10.42.10.11 (10.42.10.11) 56(84) bytes of data.');
    expect(out.some((l) => /^64 bytes from 10\.42\.10\.11: icmp_seq=1 ttl=64 time=/.test(l))).toBe(true);
    expect(out).toContain('--- 10.42.10.11 ping statistics ---');
    expect(out.find((l) => l.includes('packets transmitted'))).toMatch(/^\d+ packets transmitted, \d+ received, 0% packet loss, time \d+ms$/);
  });
});

describe('determinism', () => {
  it('the same command sequence from the same seed gives identical output and state', { timeout: 30_000 }, () => {
    const script = ['adb connect 10.42.30.32:5444', 'adb -s 10.42.30.32:5444 shell uiautomator dump', 'adb -s 10.42.30.32:5444 pull /sdcard/window_dump.xml', 'ping -c 3 10.42.10.11', 'ssh pi@10.42.10.11', 'journalctl -u robot-controller -n 5', 'exit', 'git clone git@github.com:labsim-lab/pigeon.git', 'cd pigeon && git log --oneline'];
    const once = (): string => {
      sim.reset({ preset: 'test', seed: 99 });
      resetTerminalSessions();
      const outs = script.map((l) => run(l).out);
      const l = lab();
      return JSON.stringify({ outs, ws: l.workstation, rng: l.rngStreams, t: l.time });
    };
    expect(once()).toBe(once());
  });
});
