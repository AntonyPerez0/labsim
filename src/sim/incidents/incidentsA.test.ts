/**
 * GP §3.5 incidents INC01–INC12 run end to end through Sim Appendix A's scenarios: inject, reveal
 * (health check / pipeline), check the documented evidence strings, apply the documented fix through the
 * SimApi, check the success condition.
 */
import { describe, expect, it, vi } from 'vitest';
import { build, consoleOf, healthNow, lab, nextHealthCheck, notes, resolved, robot, run, runUntil, scenario, sh, sim, start } from './kit';

vi.setConfig({ testTimeout: 240_000 });

const status = (n: string) => robot(n).status;

describe('INC01–INC04 Connection Failed causes', () => {
  it('INC01 crashed Pi: timeout note, grey tablet, frozen ACT, ping/ssh time out; power cycle + next check recovers', () => {
    start();
    const ids = scenario({ faultId: 'pi.hung', params: { host: 'pi-wall-e' } });
    run(1_000);
    const log = nextHealthCheck();
    expect(log).toContain('wall-e  FAIL connect timed out after 10000 ms → CONNECTION_FAILED');
    expect(status('wall-e')).toBe('CONNECTION_FAILED');
    expect(robot('wall-e').preFailureStatus).toBe('AVAILABLE');
    expect(notes('wall-e')[0]).toMatch(/^2026-10-05 09:05:00 GET http:\/\/10\.42\.10\.11:8000\/health → connect timed out after 10000 ms$/);
    expect(lab().rigs['wall-e']!.banner).toBe('grey');
    expect(lab().rigs['wall-e']!.tablet.statusText).toBe('Status: CONTROLLER UNREACHABLE');
    expect(lab().hosts['pi-wall-e']!.os).toBe('HUNG');
    expect(sh('ping -c 3 10.42.10.11').join('\n')).toMatch(/3 packets transmitted, 0 received, \+3 errors, 100% packet loss/);
    expect(sh('ssh pi@10.42.10.11')).toContain('ssh: connect to host 10.42.10.11 port 22: Connection timed out');
    expect(sim.camera.probe('http://10.42.10.11:8081/stream.mjpg').ok).toBe(false);
    // Orca UI check out is blocked (Sim §3.2.2).
    const co = sim.orca.checkout({ buildId: 'manual-1', jobId: 'manual', robotName: 'wall-e', environment: 'DEV1', kind: 'manual' });
    expect(co.ok).toBe(false);
    // PL1 FLEX_3 waits in queue.
    const r = sim.jenkins.build('Java/uia-remote-regression-flex', { DEVICE_TYPE: 'FLEX_3' }, 'player');
    run(15_000);
    const b = lab().jenkins.builds[r.ok ? r.value.buildId : '']!;
    expect(b.console).toContain('[orca] candidate wall-e: Connection Failed — skipped');
    expect(b.console).toContain('[orca] no Available FLEX_3 robot — build waiting in queue');
    sim.jenkins.abort(b.id, 'player');
    run(3_000);
    // Hands-on fix: MAIN off/on (power cycle), 40 s boot, next check.
    sim.rig.setSwitch('wall-e', 'main', false, 'player');
    run(5_000);
    sim.rig.setSwitch('wall-e', 'main', true, 'player');
    expect(runUntil(() => lab().hosts['pi-wall-e']!.os === 'RUNNING', 60_000)).toBeGreaterThan(30_000);
    expect(lab().rigs['wall-e']!.banner).not.toBe('grey');
    nextHealthCheck();
    expect(robot('wall-e').lastHealth?.http).toBe(200);
    expect(status('wall-e')).toBe('AVAILABLE');
    expect(notes('wall-e')[0]).toMatch(/GET http:\/\/10\.42\.10\.11:8000\/health → 200 OK · status restored to Available$/);
    expect(resolved(ids)).toBe(true);
  });

  it('INC01-B robot-controller crashed: Connection refused, systemctl failed, restart fixes', () => {
    start();
    scenario({ faultId: 'pi.serviceDown', params: { host: 'pi-wall-e', service: 'robot-controller' } });
    run(100);
    expect(healthNow()).toContain('wall-e  FAIL Connection refused → CONNECTION_FAILED');
    expect(notes('wall-e')[0]).toMatch(/→ Connection refused$/);
    expect(lab().rigs['wall-e']!.tablet.statusText).toBe('Status: CONTROLLER UNREACHABLE');
    const st = sh('ssh pi@10.42.10.11 systemctl status robot-controller');
    expect(st.some((l) => l.includes('Active: failed (Result: exit-code)'))).toBe(true);
    sh('ssh pi@10.42.10.11 sudo systemctl restart robot-controller');
    run(10_000);
    expect(lab().hosts['pi-wall-e']!.services['robot-controller']!.running).toBe(true);
    healthNow();
    expect(status('wall-e')).toBe('AVAILABLE');
  });

  it('INC01-C shared ADB-shelf Pi hung: DATA and TARS fail with the same timestamp', () => {
    start();
    scenario({ faultId: 'pi.hung', params: { host: 'pi-adb-shelf' } });
    nextHealthCheck();
    const d = robot('data').notes.at(-1)!;
    const t = robot('tars').notes.at(-1)!;
    expect(d.atMs).toBe(t.atMs);
    expect(d.text).toContain('GET http://10.42.10.30:8000/health → connect timed out after 10000 ms');
    expect(status('data')).toBe('CONNECTION_FAILED');
    expect(status('tars')).toBe('CONNECTION_FAILED');
  });

  it('INC02 MINIX-01 off: four Rack A rigs 502 at the same time, Pis/tablets fine; power button + boot + check recovers', () => {
    start();
    const ids = scenario({ faultId: 'callus.down', params: { host: 'minix-01', mode: 'box-off' } });
    const log = nextHealthCheck();
    for (const r of ['wall-e', 'eve', 'bumblebee', 'r2-d2']) {
      expect(status(r), r).toBe('CONNECTION_FAILED');
      expect(log).toContain(`${r}  FAIL 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"} → CONNECTION_FAILED`);
      expect(lab().rigs[r]!.banner, r).toBe('green');
    }
    expect(notes('bumblebee')[0]).toMatch(/GET http:\/\/10\.42\.10\.13:8000\/health → 502 Bad Gateway \{"error":"callus upstream 10\.42\.20\.1:9000 unreachable"\}$/);
    const ts = ['wall-e', 'eve', 'bumblebee', 'r2-d2'].map((r) => robot(r).notes.at(-1)!.atMs);
    expect(new Set(ts).size).toBe(1);
    const curl = sh('curl -i http://10.42.10.13:8000/health');
    expect(curl[0]).toBe('HTTP/1.1 502 Bad Gateway');
    expect(curl.join('\n')).toContain('{"error":"callus upstream 10.42.20.1:9000 unreachable"}');
    expect(sh('ping -c 3 10.42.20.1').join('\n')).toMatch(/3 packets transmitted, 0 received, \+3 errors, 100% packet loss/);
    // Hands-on: press the power button, Windows boots 50 s.
    sim.host.pressPowerButton('minix-01', false, 'player');
    expect(runUntil(() => lab().hosts['minix-01']!.services['callus']?.running === true, 90_000)).toBeGreaterThan(45_000);
    nextHealthCheck();
    for (const r of ['wall-e', 'eve', 'bumblebee', 'r2-d2']) expect(status(r), r).toBe('AVAILABLE');
    expect(resolved(ids)).toBe(true);
  });

  it('INC02-B MINIX-02 off: ROSIE returns to Unavailable after the recovery', () => {
    start();
    scenario({ faultId: 'callus.down', params: { host: 'minix-02', mode: 'box-off' } });
    nextHealthCheck();
    for (const r of ['johnny-5', 'baymax', 'seti', 'rosie', 'megatron', 'optimus']) expect(status(r), r).toBe('CONNECTION_FAILED');
    expect(robot('rosie').preFailureStatus).toBe('UNAVAILABLE');
    sim.host.pressPowerButton('minix-02', false, 'player');
    runUntil(() => lab().hosts['minix-02']!.services['callus']?.running === true, 90_000);
    nextHealthCheck();
    expect(status('rosie')).toBe('UNAVAILABLE');
    expect(notes('rosie')[0]).toMatch(/→ 200 OK · status restored to Unavailable$/);
    expect(status('johnny-5')).toBe('AVAILABLE');
  });

  it('INC02-C Callus stopped: ping OK, :9000 refused, sc query STOPPED, sc start recovers', () => {
    start();
    scenario({ faultId: 'callus.down', params: { host: 'minix-01', mode: 'service-stopped' } });
    expect(healthNow()).toContain('wall-e  FAIL 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 error: Connection refused"} → CONNECTION_FAILED');
    expect(sh('ping -c 1 10.42.20.1').join('\n')).toContain('1 received');
    expect(sh('curl http://10.42.20.1:9000/status')).toContain('curl: (7) Failed to connect to 10.42.20.1 port 9000: Connection refused');
    expect(sh('ssh automation@10.42.20.1 sc query Callus').join('\n')).toMatch(/STATE\s+: 1 {2}STOPPED/);
    sh('ssh automation@10.42.20.1 sc start Callus');
    run(6_000);
    expect(sh('ssh automation@10.42.20.1 sc query Callus').join('\n')).toMatch(/STATE\s+: 4 {2}RUNNING/);
    healthNow();
    expect(status('wall-e')).toBe('AVAILABLE');
  });

  it('INC03 Rack B fuse: dark Pis, meter readings, 10 A replacement restores; ROSIE back to Unavailable', () => {
    start();
    const ids = scenario({ faultId: 'fuse.blown', params: { fuse: 'F-RACKB-5V' } });
    run(1_000);
    expect(lab().hosts['pi-johnny-5']!.os).toBe('OFF');
    expect(lab().hosts['pi-cam-rackb']!.os).toBe('OFF');
    nextHealthCheck();
    for (const r of ['johnny-5', 'baymax', 'seti', 'rosie']) {
      expect(status(r), r).toBe('CONNECTION_FAILED');
      expect(notes(r)[0], r).toMatch(/→ connect timed out after 10000 ms$/);
      expect(lab().rigs[r]!.banner, r).toBe('grey');
    }
    expect(sim.power.measure('MW-1.out').display).toBe('24.1 V DC');
    expect(sim.power.measure('REG-5V-B.out').display).toBe('5.08 V DC');
    expect(sim.power.measure('F-RACKB-5V.load').display).toBe('0.00 V DC');
    // PB07: regulator input off, pull the fuse, Ω reads OL, fit a red 10 A, input on.
    sim.power.toggleRegulator('REG-5V-B', false, 'player');
    sim.power.removeFuse('F-RACKB-5V', 'player');
    expect(sim.power.measure('F-RACKB-5V', 'OHM').display).toBe('OL');
    sim.power.insertFuse('F-RACKB-5V', 10, 'player');
    sim.power.toggleRegulator('REG-5V-B', true, 'player');
    expect(runUntil(() => lab().hosts['pi-johnny-5']!.os === 'RUNNING', 60_000)).toBeGreaterThan(0);
    run(21_000);
    expect(resolved(ids)).toBe(true);
    nextHealthCheck();
    for (const r of ['johnny-5', 'baymax', 'seti']) expect(status(r), r).toBe('AVAILABLE');
    expect(status('rosie')).toBe('UNAVAILABLE');
    expect(lab().power.fuses['F-RACKB-5V']).toMatchObject({ blown: false, ratingA: 10 });
  });

  it('INC03 wrong move: a 5 A tan fuse blows again within 20 s and the fault does not clear', () => {
    start();
    const ids = scenario({ faultId: 'fuse.blown', params: { fuse: 'F-RACKB-5V' } });
    sim.power.toggleRegulator('REG-5V-B', false, 'player');
    sim.power.removeFuse('F-RACKB-5V', 'player');
    sim.power.insertFuse('F-RACKB-5V', 5, 'player');
    sim.power.toggleRegulator('REG-5V-B', true, 'player');
    expect(runUntil(() => lab().power.fuses['F-RACKB-5V']!.blown, 20_000)).toBeGreaterThan(0);
    run(25_000);
    expect(resolved(ids)).toBe(false);
  });

  it('INC03-C compound: after the fuse fix JOHNNY-5 still fails while its tablet is green', () => {
    start();
    scenario({ faultId: 'fuse.blown', params: { fuse: 'F-RACKB-5V' } }, { faultId: 'eth.unplugged', params: { host: 'pi-johnny-5' } });
    nextHealthCheck();
    sim.power.toggleRegulator('REG-5V-B', false, 'player');
    sim.power.removeFuse('F-RACKB-5V', 'player');
    sim.power.insertFuse('F-RACKB-5V', 10, 'player');
    sim.power.toggleRegulator('REG-5V-B', true, 'player');
    runUntil(() => lab().hosts['pi-johnny-5']!.os === 'RUNNING', 60_000);
    run(2_000);
    nextHealthCheck();
    expect(status('baymax')).toBe('AVAILABLE');
    expect(status('johnny-5')).toBe('CONNECTION_FAILED');
    expect(lab().rigs['johnny-5']!.banner).toBe('green');
  });

  it('INC04 Ethernet unplugged: tablet green, timeout; re-seat + next check', () => {
    start();
    const ids = scenario({ faultId: 'eth.unplugged', params: { host: 'pi-bumblebee' } });
    nextHealthCheck();
    expect(status('bumblebee')).toBe('CONNECTION_FAILED');
    expect(notes('bumblebee')[0]).toMatch(/GET http:\/\/10\.42\.10\.13:8000\/health → connect timed out after 10000 ms$/);
    expect(lab().rigs['bumblebee']!.tablet.statusText).toBe('Status: OK');
    expect(lab().hosts['pi-bumblebee']!.os).toBe('RUNNING');
    expect(sh('ping -c 3 10.42.10.13').join('\n')).toMatch(/3 packets transmitted, 0 received, \+3 errors, 100% packet loss/);
    sim.host.setEthernet('pi-bumblebee', true, 'player');
    run(1_000);
    expect(lab().hosts['pi-bumblebee']!.eth).toBe('LINKED');
    nextHealthCheck();
    expect(status('bumblebee')).toBe('AVAILABLE');
    expect(resolved(ids)).toBe(true);
  });

  it('INC04-B damaged cable: Notes alternate failure / recovery across checks; the spare cable fixes it', () => {
    start();
    const ids = scenario({ faultId: 'eth.damaged', params: { host: 'pi-bumblebee' } });
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      nextHealthCheck();
      seen.push(status('bumblebee'));
    }
    expect(seen).toContain('CONNECTION_FAILED');
    expect(seen).toContain('AVAILABLE');
    sim.host.replaceEthernet('pi-bumblebee', 'player');
    run(1_000);
    nextHealthCheck();
    nextHealthCheck();
    expect(status('bumblebee')).toBe('AVAILABLE');
    expect(resolved(ids)).toBe(true);
  });
});

describe('INC05–INC07 health-check rules', () => {
  it('INC05 patience: a healthy Pi on a Connection Failed rig recovers at the next check without another reboot', () => {
    start();
    const [id] = scenario({ faultId: 'pi.hung', params: { host: 'pi-wall-e' } });
    nextHealthCheck();
    expect(sim.faults.clear(id!, 'director').ok).toBe(true);
    expect(lab().hosts['pi-wall-e']!.os).toBe('BOOTING');
    runUntil(() => lab().hosts['pi-wall-e']!.os === 'RUNNING', 60_000);
    run(3_000);
    const curl = sh('curl -i http://10.42.10.11:8000/health');
    expect(curl[0]).toBe('HTTP/1.1 200 OK');
    expect(curl).toContain('{"status":"ok","robot":"wall-e"}');
    expect(status('wall-e')).toBe('CONNECTION_FAILED');
    nextHealthCheck();
    expect(status('wall-e')).toBe('AVAILABLE');
  });

  it('INC05-B Offline bypass: BAYMAX unplugged but SKIPPED (Offline), no note', () => {
    start();
    scenario({ op: 'orca.setStatus', params: { robot: 'baymax', status: 'OFFLINE', by: 'jared' } }, { faultId: 'pi.off', params: { host: 'pi-baymax' } });
    const n = robot('baymax').notes.length;
    const log = nextHealthCheck();
    expect(log).toContain('baymax  SKIPPED (Offline)');
    expect(status('baymax')).toBe('OFFLINE');
    expect(robot('baymax').notes.length).toBe(n);
    expect(log[0]).toMatch(/health-check run #\d+ — \d+ pinged, \d+ skipped, \d+ failed, 0 recovered$/);
    expect(log.some((l) => l.startsWith('baymax  FAIL'))).toBe(false);
  });

  it('INC06 Reserved hides a dead Pi: not overridden, no new notes; fixing the Pi leaves the reservation', () => {
    start();
    const ids = scenario({ op: 'orca.setStatus', params: { robot: 'eve', status: 'RESERVED', by: 'riley' } }, { faultId: 'pi.hung', params: { host: 'pi-eve' } });
    const n = robot('eve').notes.length;
    const log = nextHealthCheck();
    expect(log).toContain('eve  RESERVED — not overridden');
    expect(status('eve')).toBe('RESERVED');
    expect(robot('eve').notes.length).toBe(n);
    expect(sh('curl -sS --max-time 10 http://10.42.10.12:8000/health').join('\n')).toMatch(/timed out/);
    sim.host.powerCycle('pi-eve', 'player');
    runUntil(() => lab().hosts['pi-eve']!.os === 'RUNNING', 60_000);
    nextHealthCheck();
    expect(status('eve')).toBe('RESERVED');
    expect(robot('eve').reservedBy).toBe('riley');
    expect(resolved(ids)).toBe(true);
  });

  it('INC07 rebuild rig set Available: grabbed by PL3 (refused ADB), Connection Failed; Offline is the fix', () => {
    start();
    scenario(
      { op: 'orca.setStatus', params: { robot: 'baymax', status: 'OFFLINE', by: 'jared', atMs: -1_800_000 } },
      { faultId: 'rig.rebuild', params: { rig: 'baymax' } },
      { faultId: 'orca.statusOverride', params: { robot: 'baymax', status: 'AVAILABLE', by: 'alex' } },
    );
    expect(notes('baymax')[0]).toMatch(/STATUS Offline → Available \(alex\)$/);
    const b = build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'baymax' });
    expect(b.result).toBe('FAILURE');
    expect(consoleOf(b)).toContain("adb: failed to connect to '10.42.30.16:5444': Connection refused");
    nextHealthCheck();
    expect(status('baymax')).toBe('CONNECTION_FAILED');
    expect(notes('baymax')[0]).toMatch(/→ connect timed out after 10000 ms$/);
    expect(sim.orca.setRobotStatus(robot('baymax').id, 'OFFLINE', 'player').ok).toBe(true);
    expect(nextHealthCheck()).toContain('baymax  SKIPPED (Offline)');
    expect(status('baymax')).toBe('OFFLINE');
  });
});

describe('INC08–INC10 cameras and Ollama', () => {
  it('INC08 shared Rack B camera down: PL5 evidence capture refused, rigs stay Available; restart fixes', () => {
    start();
    const ids = scenario({ faultId: 'camera.sharedHostDown', params: { host: 'pi-cam-rackb' } });
    const b = build('Java/contact-canada-pin-sale');
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('EVIDENCE_CAPTURE');
    expect(b.console).toContain('[vision] GET http://10.42.10.40:8081/stream.mjpg → Connection refused');
    for (const r of ['johnny-5', 'baymax', 'seti', 'rosie']) expect(robot(r).cameraStreamUrl).toBe('http://10.42.10.40:8081/stream.mjpg');
    nextHealthCheck();
    expect(status('seti')).toBe('AVAILABLE');
    expect(sh('ssh pi@10.42.10.40 systemctl status camera-stream').join('\n')).toContain('Active: failed');
    sh('ssh pi@10.42.10.40 sudo systemctl restart camera-stream');
    run(5_000);
    expect(resolved(ids)).toBe(true);
    expect(sim.camera.probe('http://10.42.10.40:8081/stream.mjpg').ok).toBe(true);
    expect(build('Java/contact-canada-pin-sale').result).toBe('SUCCESS');
  });

  it('INC08-B webcam USB pulled: journal shows /dev/video0 missing; re-plug then restart', () => {
    start();
    const ids = scenario({ faultId: 'camera.usbUnplugged', params: { host: 'pi-cam-rackb' } });
    expect(sh('ssh pi@10.42.10.40 journalctl -u camera-stream -n 3').join('\n')).toContain("camera-stream[640]: Cannot open '/dev/video0': No such file or directory");
    sh('ssh pi@10.42.10.40 sudo systemctl restart camera-stream');
    run(6_000);
    expect(lab().hosts['pi-cam-rackb']!.services['camera-stream']!.running).toBe(false);
    sim.host.plugUsb('pi-cam-rackb', 'webcam', true, 'player');
    sh('ssh pi@10.42.10.40 sudo systemctl restart camera-stream');
    run(6_000);
    expect(lab().hosts['pi-cam-rackb']!.services['camera-stream']!.running).toBe(true);
    expect(resolved(ids)).toBe(true);
  });

  it('INC09 R2-D2 camera URL copied from WALL-E: OCR reads WALL-E\'s screen; fixing the URL turns PL7 green', () => {
    start();
    scenario({ faultId: 'orca.urlWrong', params: { robot: 'r2-d2', field: 'camera', value: 'http://10.42.10.11:8081/stream.mjpg' } });
    expect(notes('r2-d2')[0]).toMatch(/CONFIG urls\.camera changed \(alex\)$/);
    sim.faults.applySetup({ op: 'device.stage', params: { device: 'dev-wall-e-flex3', stage: 'payment-prompt' } });
    const b = build('Java/uia-remote-duo-cfd');
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('[ocr] capture webcam → crop 236x44@412,288 → tesseract → "Tap, insert or swipe" → match=false');
    const r = robot('r2-d2');
    expect(sim.orca.saveRobot({ id: r.id, cameraStreamUrl: 'http://10.42.10.14:8081/stream.mjpg' }, 'player').ok).toBe(true);
    expect(build('Java/uia-remote-duo-cfd').result).toBe('SUCCESS');
  });

  it('INC10 Ollama stopped: refused on 11434; restart, tags list llava, vision job green', () => {
    start();
    const ids = scenario({ faultId: 'ollama.down', params: {} });
    const b = build('Java/vision-poc-receipt-check');
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('OLLAMA_DOWN');
    expect(b.console).toContain('curl: (7) Failed to connect to 10.42.1.12 port 11434: Connection refused');
    expect(sh('curl http://10.42.1.12:11434/api/tags')).toContain('curl: (7) Failed to connect to 10.42.1.12 port 11434: Connection refused');
    expect(sh('ssh automation@10.42.1.12 systemctl status ollama').join('\n')).toContain('inactive (dead)');
    sh('ssh automation@10.42.1.12 sudo systemctl restart ollama');
    run(10_000);
    expect(sh('curl http://10.42.1.12:11434/api/tags').join('\n')).toContain('{"models":[{"name":"llava:latest"');
    expect(resolved(ids)).toBe(true);
    expect(build('Java/vision-poc-receipt-check').result).toBe('SUCCESS');
  });
});

describe('INC11–INC12 motion and lockout', () => {
  it('INC11 manual push: yellow banner, 409 LOCK_RELEASED on the next tap; Park XY stays yellow; Park All turns green', () => {
    start();
    const ids = scenario({ faultId: 'rig.lockReleased', params: { rig: 'wall-e' } });
    run(500);
    expect(lab().rigs['wall-e']!.tablet.statusText).toBe('Status: LOCK RELEASED — PARK REQUIRED');
    const b = build('Java/uia-remote-regression-flex', { ROBOT_NAME: 'wall-e', DEVICE_TYPE: 'FLEX_3' });
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('[orca] xy_touch wall-e HOME/Register → 409 Conflict: LOCK_RELEASED (park required)');
    sim.rig.command('wall-e', 'park.xy', 'player');
    run(3_000);
    expect(lab().rigs['wall-e']!.banner).toBe('yellow');
    sim.rig.command('wall-e', 'park.all', 'player');
    run(3_000);
    expect(lab().rigs['wall-e']!).toMatchObject({ banner: 'green', gantry: { homed: true }, magneticLock: { engaged: true } });
    expect(resolved(ids)).toBe(true);
    expect(build('Java/uia-remote-regression-flex', { ROBOT_NAME: 'wall-e', DEVICE_TYPE: 'FLEX_3' }).result).toBe('SUCCESS');
  });

  it('INC12 lockout: overlay while #4127 runs, motion commands ignored, Orca says in use; unlocks after the build', () => {
    start();
    scenario({ faultId: 'rig.testRunning', params: { rig: 'wall-e', number: 4127, durationMs: 60_000 } });
    run(20_000);
    const rg = lab().rigs['wall-e']!;
    expect(rg.dashboardLocked).toBe(true);
    expect(robot('wall-e').checkout?.buildId).toMatch(/4127/);
    const r = sim.rig.command('wall-e', 'park.all', 'player');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('LOCKED');
    const b = lab().jenkins.builds[robot('wall-e').checkout!.buildId]!;
    expect(b.number).toBe(4127);
    expect(runUntil(() => lab().jenkins.builds[b.id]!.state === 'finished', 200_000)).toBeGreaterThan(0);
    expect(lab().jenkins.builds[b.id]!.result).toBe('SUCCESS');
    expect(lab().rigs['wall-e']!.dashboardLocked).toBe(false);
  });
});
