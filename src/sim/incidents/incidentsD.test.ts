/**
 * GP §3.5 incidents INC47–INC65 (pay-display link, reservations, capabilities, Laz/Ubi, Go SDK, PIN,
 * card paths and Callus clones, Track Data, Wine, Ollama, cradle, MySQL, HRN, ADB-blind Duo CFD, Tap
 * URL) run end to end through Sim Appendix A's scenarios, the public SimApi and committed state.
 * INC58, INC61 and INC62 are judgement tickets with no sim state (Appendix A).
 */
import { describe, expect, it, vi } from 'vitest';
import { build, consoleOf, lab, lastBuild, nextHealthCheck, notes, resolved, robot, run, runUntil, scenario, sh, sim, start } from './kit';

vi.setConfig({ testTimeout: 300_000 });

const dev = (id: string) => lab().devices[id]!;
const merchant = (name: string) => Object.values(lab().orca.merchants).find((m) => m.name === name)!;
const card = (name: string) => Object.values(lab().orca.cardProfiles).find((c) => c.name === name)!;

describe('INC47–INC52 tethering, reservations, capabilities, Laz/Ubi, Go SDK, PIN', () => {
  it('INC47-A USB Pay Display unseated on MEGATRON: CFD waits for the merchant, CFD_O1 times out; re-seat → PL2 green', () => {
    start();
    const ids = scenario({ faultId: 'tether.linkDown', params: { robot: 'megatron', cable: 'usb' } });
    run(1_000);
    expect(dev('dev-megatron-mfd').payDisplayLink).toBe('DOWN');
    expect(dev('dev-megatron-cfd').display.screen).toBe('waiting-for-merchant');
    const b = build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' });
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('WAIT_TIMEOUT');
    expect(b.console).toContain('[CFD_O1] waitForScreen timed out (CustomerOrderScreen)');
    // The setup safe-state check passed (the CFD's idle screen is the pay-display app's): MFD_O1 ran.
    expect(b.console).toContain('[MFD_O1] Review Order');
    expect(sim.device.reseatHub('dev-megatron-mfd', 'usb', 'player').ok).toBe(true);
    run(2_000);
    expect(resolved(ids)).toBe(true);
    expect(dev('dev-megatron-cfd').display.screen).toBe('customer-idle');
    expect(build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' }).result).toBe('SUCCESS');
  });

  it('INC47-B Secure Network Pay Display: OPTIMUS CFD hub Ethernet unplugged → same symptom; re-seat Ethernet fixes it', () => {
    start();
    const ids = scenario({ faultId: 'tether.linkDown', params: { robot: 'optimus', cable: 'ethernet' } });
    run(1_000);
    expect(dev('dev-optimus-cfd').display.screen).toBe('waiting-for-merchant');
    const b = build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'optimus', BACKEND_ENV: 'STG' });
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('[CFD_O1] waitForScreen timed out (CustomerOrderScreen)');
    expect(sim.device.reseatHub('dev-optimus-cfd', 'ethernet', 'player').ok).toBe(true);
    run(2_000);
    expect(resolved(ids)).toBe(true);
    expect(build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'optimus', BACKEND_ENV: 'STG' }).result).toBe('SUCCESS');
  });

  it('INC48 stale reservation: candidate skipped, build waits in the queue; health log not overridden; releasing lets it run', () => {
    start();
    const ids = scenario({ faultId: 'orca.staleReservation', params: { robot: 'eve', by: 'riley' } });
    expect(robot('eve').status).toBe('RESERVED');
    expect(robot('eve').reservedBy).toBe('riley');
    expect(notes('eve')[0]).toBe('2026-10-04 17:42:00 STATUS Available → Reserved (riley)');
    const r = sim.jenkins.build('Java/uia-remote-regression-flex', { DEVICE_TYPE: 'FLEX_4' }, 'player');
    if (!r.ok) throw new Error(r.error);
    run(8_000);
    const b = lab().jenkins.builds[r.value.buildId]!;
    expect(b.state).not.toBe('finished');
    expect(b.console).toContain('[orca] candidate eve: Reserved — skipped');
    expect(b.console).toContain('[orca] no Available FLEX_4 robot — build waiting in queue');
    expect(nextHealthCheck()).toContain('eve  RESERVED — not overridden');
    // Riley: "Oh no, forgot — release it."
    expect(sim.orca.setRobotStatus(robot('eve').id, 'AVAILABLE', 'player').ok).toBe(true);
    expect(resolved(ids)).toBe(true);
    runUntil(() => lab().jenkins.builds[r.value.buildId]!.state === 'finished', 300_000);
    const done = lab().jenkins.builds[r.value.buildId]!;
    expect(done.console).toContain('[orca] checkout → eve (FLEX_4) OK');
    expect(done.result).toBe('SUCCESS');
  });

  it('INC49 Westers capability conflict: 409 names both values; pipeline deviceType COMPACT → SETI, PL5 green', () => {
    start();
    const ids = scenario({ faultId: 'jenkins.capsConflict', params: { job: 'Java/contact-canada-pin-sale', value: 'MINI_3' } });
    const b = build('Java/contact-canada-pin-sale');
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('CAPABILITY_CONFLICT');
    expect(b.console).toContain('[orca] 409 Conflict: capability conflict (pipeline deviceType=MINI_3, test deviceType=COMPACT)');
    const job = sim.jenkins.job('Java/contact-canada-pin-sale')!;
    expect(job.script).toContain("deviceType: 'MINI_3'");
    expect(sim.jenkins.configureScript(job.id, job.script.replace("deviceType: 'MINI_3'", "deviceType: 'COMPACT'"), 'player').ok).toBe(true);
    expect(resolved(ids)).toBe(true);
    const b2 = build('Java/contact-canada-pin-sale');
    expect(b2.result).toBe('SUCCESS');
    expect(lab().orca.robots[b2.robotId!]!.name).toBe('seti');
  });

  it('INC50 wrong Ubi route on WESTERS-CA-02: Laz fails before de-provisioning; Edit → ca-central → swap completes', () => {
    start();
    const ids = scenario({ faultId: 'merchant.ubiRouteWrong', params: { merchant: 'WESTERS-CA-02', route: 'us-east' } });
    const before = dev('dev-seti-compact').merchantConfigId;
    const b = build('Java/laz-oobe-merchant-swap', { ROBOT_NAME: 'seti', MERCHANT: 'WESTERS-CA-02' });
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('ubi: routing merchant switch → WESTERS-CA-02');
    expect(b.console).toContain('ubi: ERROR route us-east cannot resolve merchant WESTERS-CA-02');
    expect(b.console).not.toContain('laz: de-provision');
    expect(dev('dev-seti-compact').merchantConfigId).toBe(before);
    expect(sim.orca.saveMerchant({ id: merchant('WESTERS-CA-02').id, ubiRoute: 'ca-central' }, 'player').ok).toBe(true);
    expect(resolved(ids)).toBe(true);
    const b2 = build('Java/laz-oobe-merchant-swap', { ROBOT_NAME: 'seti', MERCHANT: 'WESTERS-CA-02' });
    expect(b2.result).toBe('SUCCESS');
    for (const l of ['laz: de-provision', 'laz: wipe caches', 'laz: setup wizard 1/6', 'laz: setup wizard 6/6', 'laz: merchant active']) expect(b2.console).toContain(l);
    expect(dev('dev-seti-compact').merchantConfigId).toBe(merchant('WESTERS-CA-02').id);
  });

  it('INC51 blank API Key: env line shows API_KEY= and the SDK panics; Edit → paste the key → PL6 green', () => {
    start();
    const ids = scenario({ faultId: 'merchant.credentialBlank', params: { merchant: 'GO-SDK-US-01', field: 'apiKey' } });
    const b = build('Java/go-sdk-sale-smoke');
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('MISSING_CREDENTIAL');
    expect(b.console).toContain('[env] APP_ID=app_sim_7f3a APP_SECRET=**** API_KEY=');
    expect(b.console).toContain('panic: Terminal SDK: missing credential API_KEY (env var empty)');
    expect(sim.orca.saveMerchant({ id: merchant('GO-SDK-US-01').id, apiKey: 'key_sim_19c0e2' }, 'player').ok).toBe(true);
    expect(resolved(ids)).toBe(true);
    const b2 = build('Java/go-sdk-sale-smoke');
    expect(b2.result).toBe('SUCCESS');
    expect(b2.console).toContain('[env] APP_ID=app_sim_7f3a APP_SECRET=**** API_KEY=****');
  });

  it('INC52 PL5 pinned to an ADB bot: PIN entry requires physical touch; ROBOT_NAME=seti → four solenoid PIN taps, green', () => {
    start();
    const ids = scenario({ faultId: 'jenkins.namedRobot', params: { job: 'Java/contact-canada-pin-sale', robot: 'tars' } });
    const b = build('Java/contact-canada-pin-sale');
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('PIN_NEEDS_PHYSICAL');
    expect(b.console).toContain('Checked out robot tars (named)');
    expect(b.console).toContain('PIN entry requires physical touch');
    // A touch rig of another type: capability mismatch.
    const w = build('Java/contact-canada-pin-sale', { ROBOT_NAME: 'wall-e' });
    expect(w.failureCode).toBe('CAPABILITY_MISMATCH');
    expect(w.console).toContain('capability mismatch: deviceType COMPACT required');
    const job = sim.jenkins.job('Java/contact-canada-pin-sale')!;
    sim.jenkins.saveJob(job.id, { savedParams: { ...job.savedParams, ROBOT_NAME: 'seti' } }, 'player');
    expect(resolved(ids)).toBe(true);
    const b2 = build('Java/contact-canada-pin-sale', { ROBOT_NAME: 'seti', CARD_PROFILE: 'INTERAC_CA_DIP' });
    expect(b2.result).toBe('SUCCESS');
    const pinTaps = b2.console.filter((l) => /^\[orca\] xy_touch seti PIN_ENTRY\/(\d|Enter) → PHYSICAL_TAP/.test(l));
    expect(pinTaps.map((l) => /PIN_ENTRY\/(\w+)/.exec(l)![1])).toEqual(['1', '2', '3', '4', 'Enter']);
  });
});

describe('INC53–INC57 cards, Callus clones, Track Data, Wine, Ollama', () => {
  it('INC53 VISA_STD_DIP points at cards/visa/: FileNotFoundException; Path cards/emv/ + curl dip → load virtual card OK', () => {
    start();
    const ids = scenario({ faultId: 'card.gortPathWrong', params: { profile: 'VISA_STD_DIP' } }, { op: 'jenkins.startBuild', params: { job: 'Java/uia-remote-regression-flex', params: { ROBOT_NAME: 'wall-e', CARD_PROFILE: 'VISA_STD_DIP' } } });
    const b = build('Java/uia-remote-regression-flex', { ROBOT_NAME: 'wall-e', CARD_PROFILE: 'VISA_STD_DIP' });
    expect(b.result).toBe('FAILURE');
    expect(consoleOf(b)).toContain('[callus] map cards/visa/visa_std_dip.json → C:\\gort\\cards\\visa\\visa_std_dip.json · FileNotFoundException (The system cannot find the path specified)');
    // Interactive session (a one-shot `ssh … dir C:\gort\…` would lose the backslashes to bash).
    sh('ssh automation@10.42.20.1');
    const dir = sh('dir C:\\gort\\cards\\emv').join('\n');
    sh('exit');
    expect(dir).toContain('visa_std_dip.json');
    expect(dir).toContain('interac_ca_dip.json');
    expect(sim.orca.saveCardProfile({ id: card('VISA_STD_DIP').id, gortPath: 'cards/emv/visa_std_dip.json' }, 'player').ok).toBe(true);
    expect(resolved(ids)).toBe(true);
    run(60_000); // let the scenario's own build finish and release WALL-E
    const out = sh(`curl -X POST http://orca.lab.local:8080/api/card/dip -H "Content-Type: application/json" -d '{"robot":"wall-e","profile":"VISA_STD_DIP"}'`).join('\n');
    expect(out).toContain('"result":"OK"');
    run(3_000);
    const log = (lab().callus.log['minix-01'] ?? []).join('\n');
    expect(log).toContain('map cards/emv/visa_std_dip.json → C:\\gort\\cards\\emv\\visa_std_dip.json · load virtual card OK · probe wall-e: DIP');
    sim.device.pressKey('dev-wall-e-flex3', 'HOME', 'player');
    run(2_000);
    expect(build('Java/uia-remote-regression-flex', { ROBOT_NAME: 'wall-e', CARD_PROFILE: 'VISA_STD_DIP' }).result).toBe('SUCCESS');
  });

  it('INC54 MINIX-02 missed GortCardSync: new Interac tap file missing locally; schtasks /run → 20 s → dir lists it → green', () => {
    start();
    const ids = scenario({ faultId: 'callus.syncStale', params: { host: 'minix-02' } });
    const b = build('Java/contact-canada-pin-sale', { CARD_PROFILE: 'INTERAC_CA_TAP' });
    expect(b.result).toBe('FAILURE');
    expect(consoleOf(b)).toContain('[callus] map cards/nfc/interac_ca_tap.json → C:\\gort\\cards\\nfc\\interac_ca_tap.json · FileNotFoundException (The system cannot find the path specified)');
    sh('ssh automation@10.42.20.2');
    expect(sh('schtasks /query /tn GortCardSync').join('\n')).toMatch(/GortCardSync\s+10\/05\/2026 10:00:00\s+Ready/);
    expect(sh('dir C:\\gort\\cards\\nfc').join('\n')).not.toContain('interac_ca_tap.json');
    expect(sh('schtasks /run /tn GortCardSync')).toContain('SUCCESS: Attempted to run the scheduled task "GortCardSync".');
    run(21_000);
    expect(sh('dir C:\\gort\\cards\\nfc').join('\n')).toContain('interac_ca_tap.json');
    sh('exit');
    expect(resolved(ids)).toBe(true);
    const b2 = build('Java/contact-canada-pin-sale', { CARD_PROFILE: 'INTERAC_CA_TAP' });
    expect(b2.result).toBe('SUCCESS');
    expect(lab().orca.robots[b2.robotId!]!.name).toBe('seti');
  });

  it('INC55 truncated Track Data: Callus swipe OK, device SWIPE_ERROR; the canonical tracks fix PL3', () => {
    start();
    const ids = scenario({ faultId: 'card.trackDataCorrupt', params: { profile: 'VISA_STD_SWIPE' } });
    expect(card('VISA_STD_SWIPE').trackData).toBe('%B4111111111111111^SIM/VISA^301210');
    const b = build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'wall-e' });
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('[callus] swipe VISA_STD_SWIPE → probe collis-wall-e OK');
    expect(b.console).toContain('LSTR step 4/9 "card swipe" … [device] SWIPE_ERROR: invalid track data');
    expect(b.console).toContain('FAILED at "card swipe"');
    expect(lab().collis['collis-wall-e']!.state).toBe('OK');
    sim.orca.saveCardProfile({ id: card('VISA_STD_SWIPE').id, trackData: '%B4111111111111111^SIM/VISA^30121010000000000000?;4111111111111111=3012101000000000?' }, 'player');
    expect(resolved(ids)).toBe(true);
    sim.device.pressKey('dev-wall-e-flex3', 'HOME', 'player');
    run(2_000);
    expect(build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'wall-e' }).result).toBe('SUCCESS');
  });

  it('INC56 broken Wine prefix on JOHNNY-5: 503 CARDPROG_UNAVAILABLE; golden prefix copied back + start → green', () => {
    start();
    const ids = scenario({ faultId: 'pi.wineBroken', params: { host: 'pi-johnny-5' } });
    const params = { ROBOT_NAME: 'johnny-5', DEVICE_TYPE: 'FLEX_1', CARD_PROFILE: 'VISA_STD_DIP' };
    const b = build('Java/uia-remote-regression-flex', params);
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('[pi] cardprog: program VISA_STD_DIP → 503 CARDPROG_UNAVAILABLE');
    sh('ssh pi@10.42.10.15');
    expect(sh('ps aux | grep -i wine').join('\n')).not.toContain('CardProgrammer.exe');
    expect(sh('systemctl status cardprog').join('\n')).toContain('Active: failed');
    expect(sh('journalctl -u cardprog -n 3').join('\n')).toContain('wine: could not load kernel32.dll, status c0000135');
    expect(sh('ls /opt/cardprog/').join('\n')).toContain('wineprefix-golden');
    sh('sudo systemctl stop cardprog');
    sh('rm -rf /home/pi/.wine-cardprog && cp -a /opt/cardprog/wineprefix-golden /home/pi/.wine-cardprog');
    sh('sudo systemctl start cardprog');
    run(5_000);
    expect(sh('ps aux | grep -i wine').join('\n')).toContain('wine C:\\CardProg\\CardProgrammer.exe');
    sh('exit');
    expect(resolved(ids)).toBe(true);
    sim.device.pressKey('dev-johnny-5-flex1', 'HOME', 'player');
    run(2_000);
    expect(build('Java/uia-remote-regression-flex', params).result).toBe('SUCCESS');
  });

  it('INC57 Ollama tip maths: factory receipt is a real bug; a seeded misread is a false positive', () => {
    start();
    const ask = (image: string) => {
      const r = sim.ollama.ask('llava', 'Check this receipt: is the layout complete and is the tip maths correct?', image, 'player');
      if (!r.ok) throw new Error(r.error);
      runUntil(() => lab().ollama.requests.find((q) => q.id === r.value.requestId)?.state === 'done', 20_000);
      return lab().ollama.requests.find((q) => q.id === r.value.requestId)!;
    };
    // Factory photo (Cur M17): printed tip 765 — a real bug, the model is right.
    const real = ask('img:receipt:wall-e:0912');
    expect(real.response).toBe('FAIL — tip of 18% on $42.00 should be $7.56; the receipt shows $7.65.');
    expect(real.correct).toBe(true);
    // Variant A: correct receipt, the model misreads the tip.
    scenario({ op: 'ollama.seedReceipt', params: { imageRef: 'img:receipt:wall-e:1015', deviceId: 'dev-wall-e-flex3', subtotalCents: 4200, tipPct: 18, printedTipCents: 756, misreadField: 'tip', misreadAs: '$7.65' } });
    const fp = ask('img:receipt:wall-e:1015');
    expect(fp.response).toBe('FAIL — tip of 18% on $42.00 should be $7.56; the receipt shows $7.65.');
    expect(fp.correct).toBe(false);
    // The PoC job that raised the ticket (Appendix A INC57: a seeded UNSTABLE build).
    scenario({ op: 'jenkins.seedBuild', params: { job: 'Java/vision-poc-receipt-check', params: { ROBOT_NAME: 'wall-e' }, result: 'UNSTABLE', robot: 'wall-e', atMs: lab().time.nowMs - 600_000, by: 'timer' } });
    const pb = lastBuild('Java/vision-poc-receipt-check')!;
    expect(pb.result).toBe('UNSTABLE');
    expect(pb.failureCode).toBe('VISION_FAIL');
    expect(pb.console).toContain('[vision] llava verdict: FAIL');
    expect(pb.console).toContain('[vision] FAIL — tip of 18% on $42.00 should be $7.56; the receipt shows $7.65.');
    expect(pb.console.at(-1)).toBe('Finished: UNSTABLE');
    // The same maths by hand: 4200 × 18 % = 756 → total 4956.
    scenario({ op: 'ollama.seedReceipt', params: { imageRef: 'img:receipt:wall-e:1016', deviceId: 'dev-wall-e-flex3', subtotalCents: 4200, tipPct: 18, printedTipCents: 756 } });
    expect(ask('img:receipt:wall-e:1016').response).toBe('PASS — layout complete (merchant header, items, subtotal, tax, tip, total); tip of 18% on $42.00 is $7.56 and the total $49.56 is correct.');
  });
});

describe('INC59–INC65 cradle, MySQL, HRN, ADB-blind CFD, Tap URL', () => {
  it('INC59 cracked cradle on EVE: right-side taps land low (Review Order misses); print + swap cradle + Park All → green', () => {
    start();
    const ids = scenario({ faultId: 'rig.cradleCracked', params: { rig: 'eve' } });
    const b = build('Java/uia-remote-regression-flex', { ROBOT_NAME: 'eve', DEVICE_TYPE: 'FLEX_4' });
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('[runner] waitForScreen timed out: ReviewOrderScreen');
    const eve = robot('eve');
    sim.orca.setRobotStatus(eve.id, 'OFFLINE', 'player');
    expect(sim.printer3d.start('prusa', 'cradle_flex_gen3.3mf', 'player').ok).toBe(true);
    expect(sim.rig.replaceCradle('eve', 'player').ok).toBe(false); // nothing printed yet
    run(91_000);
    expect(lab().printer3d.output).toContain('cradle_flex_gen3');
    sim.rig.setSwitch('eve', 'motor', false, 'player');
    expect(sim.rig.replaceCradle('eve', 'player').ok).toBe(true);
    expect(resolved(ids)).toBe(true);
    sim.rig.setSwitch('eve', 'motor', true, 'player');
    run(500);
    expect(lab().rigs['eve']!.banner).toBe('yellow');
    sim.rig.command('eve', 'park.all', 'player');
    runUntil(() => lab().rigs['eve']!.banner === 'green', 10_000);
    expect(lab().rigs['eve']!.cradle).toBe('NEW');
    sim.orca.setRobotStatus(eve.id, 'AVAILABLE', 'player');
    sim.device.pressKey('dev-eve-flex4', 'HOME', 'player');
    run(2_000);
    expect(build('Java/uia-remote-regression-flex', { ROBOT_NAME: 'eve', DEVICE_TYPE: 'FLEX_4' }).result).toBe('SUCCESS');
  });

  it('INC60 Orca MySQL down: checkouts 500, health 503, mysql inactive; systemctl start → reconnect 15 s → green', () => {
    start();
    const ids = scenario({ faultId: 'orca.mysqlDown', params: {} });
    run(1_000);
    const b = build('Java/uia-remote-regression-flex');
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('ORCA_DB_DOWN');
    expect(b.console.some((l) => /^\[orca\] checkout request .* → 500/.test(l))).toBe(true);
    expect(sh('curl -s -o /dev/null -w "%{http_code}" http://orca.lab.local:8080/management/health')).toEqual(['503']);
    sh('ssh automation@orca.lab.local');
    expect(sh('systemctl status mysql').join('\n')).toContain('Active: inactive (dead)');
    sh('sudo systemctl start mysql');
    sh('exit');
    run(40_000);
    expect(resolved(ids)).toBe(true);
    expect(sh('curl -s -o /dev/null -w "%{http_code}" http://orca.lab.local:8080/management/health')).toEqual(['200']);
    expect(build('Java/uia-remote-regression-flex').result).toBe('SUCCESS');
  });

  it('INC63 HRN typo: the tablet shows JONNY-5 within 2 s of the save; fixing the HRN (not the Name) restores it', () => {
    start();
    const ids = scenario({ faultId: 'orca.hrnTypo', params: { robot: 'johnny-5' } });
    run(2_000);
    expect(lab().rigs['johnny-5']!.tablet.hrnShown).toBe('JONNY-5');
    expect(robot('johnny-5').name).toBe('johnny-5');
    sim.orca.saveRobot({ id: robot('johnny-5').id, humanReadableName: 'JOHNNY-5' }, 'player');
    expect(resolved(ids)).toBe(true);
    run(2_000);
    expect(lab().rigs['johnny-5']!.tablet.hrnShown).toBe('JOHNNY-5');
  });

  it('INC64 Duo CFD is ADB-blind: the dump has no "Done", adb input tap hits the MFD; xy_touch PHYSICAL_TAP advances the CFD', () => {
    start();
    scenario({ op: 'device.stage', params: { device: 'dev-r2-d2-duo', stage: 'receipt-done' } });
    expect(lab().devices['dev-r2-d2-duo']!.secondaryDisplay!.screen).toBe('receipt-done');
    sh('adb connect 10.42.30.14:5444');
    sh('adb -s 10.42.30.14:5444 shell uiautomator dump');
    sh('adb -s 10.42.30.14:5444 pull /sdcard/window_dump.xml');
    expect(sh('grep -c "Done" window_dump.xml')).toEqual(['0']);
    const out = sh(`curl -X POST http://orca.lab.local:8080/api/xy_touch -H "Content-Type: application/json" -d '{"robot":"r2-d2","screen":"CFD_RECEIPT_DONE","button":"Done"}'`).join('\n');
    expect(out).toContain('"mode":"PHYSICAL_TAP"');
    runUntil(() => lab().devices['dev-r2-d2-duo']!.secondaryDisplay!.screen !== 'receipt-done', 15_000);
    expect(lab().devices['dev-r2-d2-duo']!.secondaryDisplay!.screen).not.toBe('receipt-done');
  });

  it('INC65 blank Tap URL on JOHNNY-5: 400 has no Tap URL; the Pi /tap URL fixes the tap build', () => {
    start();
    const params = { ROBOT_NAME: 'johnny-5', DEVICE_TYPE: 'FLEX_1', CARD_PROFILE: 'VISA_STD_TAP' };
    const ids = scenario({ faultId: 'orca.urlWrong', params: { robot: 'johnny-5', field: 'tap', value: '' } });
    const b = build('Java/uia-remote-regression-flex', params);
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('CARD_ERROR');
    expect(b.console).toContain('[orca] 400 Bad Request: robot johnny-5 has no Tap URL');
    const j5 = robot('johnny-5');
    expect(j5.adbServiceUrl).toBe('http://10.42.10.15:8000/adb');
    expect(j5.dipUrl).toBe('http://10.42.10.15:8000/dip');
    sim.orca.saveRobot({ id: j5.id, tapUrl: 'http://10.42.10.15:8000/tap' }, 'player');
    expect(resolved(ids)).toBe(true);
    sim.device.pressKey('dev-johnny-5-flex1', 'HOME', 'player');
    run(2_000);
    expect(build('Java/uia-remote-regression-flex', params).result).toBe('SUCCESS');
  });
});
