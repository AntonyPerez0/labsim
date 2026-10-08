import { describe, expect, it } from 'vitest';
import { validateConfigProperties } from './configValidator';
import { deleteLines, duplicate, indentLines, moveLines, moveStatement, reformat, smartEnter, toggleLineComment, typeChar } from './editorOps';
import { implementScreenMethods, inspectFile, inspectJava, inspectJsonStrict, screenClassInfo } from './inspections';
import { highlight, javaDeclaredFields, langFor, stripJavaNoise, tokenAt } from './lang';
import { buildTree, diffLines, gutterRun, runConfigsFor } from './projectModel';
import { GORT_FILES, ORCA_FILES, PIGEON_FILES, UIA_FILES } from './sandbox/seedRepos';
import { isIgnored, isValidBranchName } from './vcs';

describe('lang', () => {
  it('detects languages', () => {
    expect(langFor('a/B.java')).toBe('java');
    expect(langFor('config.properties')).toBe('properties');
    expect(langFor('config.properties.example')).toBe('properties');
    expect(langFor('pom.xml')).toBe('xml');
    expect(langFor('.gitignore')).toBe('gitignore');
    expect(langFor('Jenkinsfile')).toBe('groovy');
  });
  it('highlights Java keywords, strings, method declarations and fields', () => {
    const src = UIA_FILES['app/src/androidTest/java/com/labsim/uia/pageobjects/HomeScreen.java'];
    const ctx = javaDeclaredFields(src);
    expect(ctx.fields.has('clock')).toBe(true);
    const lines = highlight('java', src, ctx);
    const flat = lines.flat();
    expect(flat.some((t) => t.c === 'kw' && t.t.includes('public'))).toBe(true);
    expect(flat.some((t) => t.c === 'str' && t.t === '"Register"')).toBe(true);
    expect(flat.some((t) => t.c === 'fn' && t.t === 'open')).toBe(true);
    expect(flat.some((t) => t.c === 'field' && t.t === 'clock')).toBe(true);
    expect(flat.some((t) => t.c === 'doc')).toBe(true);
    // round trip: tokens reproduce the text
    expect(lines.map((l) => l.map((t) => t.t).join('')).join('\n')).toBe(src);
  });
  it('highlights JSON keys vs values and properties', () => {
    const [l] = highlight('json', '  "name": "Swipe", "n": 3,');
    expect(l.find((t) => t.t === '"name"')?.c).toBe('jkey');
    expect(l.find((t) => t.t === '"Swipe"')?.c).toBe('str');
    expect(l.find((t) => t.t === '3')?.c).toBe('num');
    const [p] = highlight('properties', 'portNumber=5444');
    expect(p.map((t) => t.c)).toEqual(['pkey', null, 'pval']);
  });
  it('finds the token under the caret', () => {
    expect(tokenAt('  "connectionType": "USB",', 5)).toBe('connectionType');
    expect(tokenAt('    mfd.run(registerHome::reviewOrder);', 6)).toBe('mfd');
    expect(tokenAt('   ', 1)).toBeNull();
  });
  it('strips Java noise keeping length', () => {
    const s = 'a("x{"); // }\n/* { */ b';
    expect(stripJavaNoise(s).length).toBe(s.length);
    expect(stripJavaNoise(s)).not.toContain('{');
  });
});

describe('editorOps', () => {
  it('smart enter indents after a brace and splits {}', () => {
    const r = smartEnter({ text: '    void a() {}', start: 14, end: 14 }, '    ');
    expect(r.text).toBe('    void a() {\n        \n    }');
    expect(r.start).toBe(14 + 1 + 8);
  });
  it('auto-closes and types through', () => {
    const a = typeChar({ text: 'x', start: 1, end: 1 }, '(')!;
    expect(a.text).toBe('x()');
    const b = typeChar(a, ')')!;
    expect(b.text).toBe('x()');
    expect(b.start).toBe(3);
  });
  it('duplicates and deletes lines', () => {
    const d = duplicate({ text: 'a\nb\nc', start: 2, end: 2 });
    expect(d.text).toBe('a\nb\nb\nc');
    const y = deleteLines({ text: 'a\nb\nc', start: 2, end: 2 });
    expect(y.text).toBe('a\nc');
  });
  it('toggles comments and indents', () => {
    expect(toggleLineComment({ text: 'a\nb', start: 0, end: 3 }, '//').text).toBe('//a\n//b');
    expect(toggleLineComment({ text: '//a\n//b', start: 0, end: 7 }, '//').text).toBe('a\nb');
    expect(indentLines({ text: 'a\nb', start: 0, end: 3 }, '    ').text).toBe('    a\n    b');
  });
  it('moves lines and statements', () => {
    const t = 'x {\n    mfd.run(a);\n    mfd.run(b);\n}';
    const pos = t.indexOf('mfd.run(b)');
    const up = moveStatement({ text: t, start: pos, end: pos }, -1, true)!;
    expect(up.text).toBe('x {\n    mfd.run(b);\n    mfd.run(a);\n}');
    expect(up.text.slice(up.start, up.start + 10)).toBe('mfd.run(b)');
    expect(moveStatement({ text: up.text, start: up.start, end: up.start }, -1, true)).toBeNull();
    expect(moveLines({ text: 'a\nb', start: 0, end: 0 }, 1)!.text).toBe('b\na');
  });
  it('reformats by braces', () => {
    expect(reformat('class A {\nvoid b() {\nc();\n}\n}', '    ', stripJavaNoise)).toBe('class A {\n    void b() {\n        c();\n    }\n}');
  });
});

describe('inspections', () => {
  it('reports zero problems on every factory Java file', () => {
    for (const [p, t] of Object.entries({ ...UIA_FILES, ...ORCA_FILES })) {
      if (!p.endsWith('.java')) continue;
      const probs = inspectJava(t);
      expect(probs, p).toEqual([]);
    }
  });
  it('flags a missing semicolon and an unbalanced brace', () => {
    const src = 'class A {\n    void b() {\n        foo()\n        bar();\n    }\n}\n';
    const p = inspectJava(src);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ line: 3, message: "';' expected" });
    expect(inspectJava('class A {\n    void b() {\n    }\n')[0].message).toBe("'}' expected");
  });
  it('strict JSON reports a missing comma with IntelliJ wording; pigeon is never inspected', () => {
    const broken = PIGEON_FILES['tests/sale/swipe_sale_print.json'];
    const p = inspectJsonStrict(broken);
    expect(p[0].message).toBe("',' or ']' expected");
    expect(inspectFile('pigeon', 'tests/sale/swipe_sale_print.json', broken)).toEqual([]);
    expect(inspectFile('gort', 'x.json', broken)).toHaveLength(1);
    for (const [path, t] of Object.entries(GORT_FILES)) if (path.endsWith('.json')) expect(inspectJsonStrict(t), path).toEqual([]);
    expect(inspectJsonStrict('{"a": 1 "b": 2}')[0].message).toBe("',' or '}' expected");
    expect(inspectJsonStrict('{"a": }')[0].message).toBe('Value expected');
    expect(inspectJsonStrict('{a: 1}')[0].message).toBe('Property name expected');
  });
  it('implements mandatory screen methods', () => {
    const path = 'app/src/androidTest/java/com/labsim/uia/pageobjects/ReceiptScreen.java';
    const src = UIA_FILES[path];
    expect(screenClassInfo(path, src).missing).toEqual(['waitForScreen', 'isScreenPresent']);
    expect(inspectFile('uia-remote', path, src).map((p) => p.message)).toContain('Screen class is missing mandatory method isScreenPresent()');
    const fixed = implementScreenMethods(path, src)!;
    expect(fixed).toContain('device.wait(Until.hasObject(printBtn), TIMEOUT_MS);');
    expect(fixed).toContain('return device.hasObject(printBtn);');
    expect(screenClassInfo(path, fixed).missing).toEqual([]);
    expect(inspectJava(fixed)).toEqual([]);
  });
});

describe('config validator', () => {
  const orca = {
    robots: {
      7: { id: 7, name: 'megatron', environment: 'DEV1', deviceId: 1, mfdDeviceId: 1, cfdDeviceId: 2 },
      8: { id: 8, name: 'r2-d2', environment: 'DEV2', deviceId: 3, mfdDeviceId: 3, cfdDeviceId: 3 },
    },
    devices: {
      1: { id: 1, name: 'megatron-mfd', deviceType: 'STATION_2', serial: 'SIM-S2-000021', ip: '10.42.30.21' },
      2: { id: 2, name: 'megatron-cfd', deviceType: 'MINI_2', serial: 'SIM-M2-000022', ip: '10.42.30.22' },
      3: { id: 3, name: 'r2-d2-duo', deviceType: 'STATION_DUO_2', serial: 'SIM-D2-000014', ip: '10.42.30.14' },
    },
  } as never;
  const good = 'runType=tethered\nmerchantFacingDeviceIp=10.42.30.21\ncustomerFacingDeviceIp=10.42.30.22\nserial=SIM-S2-000021\ndeviceType=Station\ntheme=avocado\nkernelType=CPA\nportNumber=5444\nunlockPasscode=0000\nbackendEnv=DEV1\nrobotName=megatron\n';
  it('passes 11/11 on the M14 target', () => {
    const v = validateConfigProperties(good, orca);
    expect(v.passed).toBe(11);
    expect(v.failures).toEqual([]);
  });
  it('reports the M14 broken file', () => {
    const broken = UIA_FILES['config.properties.example'].replace('robotName=CHANGE_ME', 'robotName=megatron').replace('5444', '5555').replace('avocado', 'classic');
    const v = validateConfigProperties(broken, orca);
    expect(v.passed).toBe(9);
    expect(v.failures).toContain('portNumber = 5555 — must be 5444: lab devices listen on 5444; 5555 is the ADB default');
  });
  it('checks Station Duo same-IP rule', () => {
    const duo = good.replace('robotName=megatron', 'robotName=r2-d2').replace('backendEnv=DEV1', 'backendEnv=DEV2').replace('10.42.30.21', '10.42.30.14').replace('10.42.30.22', '10.42.30.22').replace('SIM-S2-000021', 'SIM-D2-000014');
    const v = validateConfigProperties(duo, orca);
    expect(v.rules.find((r) => r.key === 'customerFacingDeviceIp')?.message).toBe('On a Station Duo both IPs are the same address (10.42.30.14)');
  });
});

describe('project model', () => {
  const paths = Object.keys(UIA_FILES);
  it('compacts packages inside source roots', () => {
    const tree = buildTree(paths);
    expect(tree.map((n) => n.name)).toEqual(['app', '.gitignore', 'config.properties.example', 'pom.xml']);
    const src = tree[0].children[0];
    const androidTest = src.children.find((n) => n.name === 'androidTest')!;
    const java = androidTest.children[0];
    expect(java.role).toBe('test');
    expect(java.children[0].name).toBe('com.labsim.uia');
    expect(java.children[0].path).toBe('app/src/androidTest/java/com/labsim/uia');
    const main = src.children.find((n) => n.name === 'main')!;
    expect(main.path).toBe('app/src/main');
  });
  it('derives run configs and gutter icons', () => {
    const cfgs = runConfigsFor('uia-remote', paths);
    expect(cfgs.map((c) => c.name)).toContain('TaxTest');
    expect(cfgs).toHaveLength(11);
    const tax = cfgs.find((c) => c.name === 'TaxTest')!;
    expect(gutterRun('uia-remote', tax.testPath, UIA_FILES[tax.testPath], cfgs)?.line).toBeGreaterThan(1);
    const pig = runConfigsFor('pigeon', Object.keys(PIGEON_FILES));
    expect(pig.map((c) => c.name)).toContain('LSTR: swipe_sale_print.json');
    expect(pig.some((c) => c.testPath.includes('_templates'))).toBe(false);
  });
  it('diffs lines', () => {
    const d = diffLines('a\nb\nc', 'a\nx\nc');
    expect(d.map((r) => r.kind)).toEqual(['same', 'add', 'del', 'same']);
  });
  it('vcs helpers', () => {
    expect(isIgnored('config.properties', 'config.properties\ntarget/\n')).toBe(true);
    expect(isIgnored('target/x.class', 'config.properties\ntarget/\n')).toBe(true);
    expect(isIgnored('pom.xml', 'config.properties\n')).toBe(false);
    expect(isValidBranchName('fix/flex4-receipt-qr')).toBe(true);
    expect(isValidBranchName('bad name')).toBe(false);
    expect(isValidBranchName('a..b')).toBe(false);
  });
});

describe('real factory seed (when the sim seeds repos)', () => {
  it('Java / gort JSON inspections are silent on every factory file; config validator matches the M14 target', async () => {
    const { createInitialLabState } = await import('@/sim');
    const lab = createInitialLabState();
    // The repo seed tables (sim-devops) — read directly while they are not yet wired into the initial lab.
    let repos = Object.values(lab.repos);
    if (!repos.some((r) => Object.keys(r.files).length)) {
      try {
        const mod = (await import('@/sim/seed/repos')) as { seedRepos?: (l: unknown) => Record<string, typeof repos[number]> };
        if (mod.seedRepos) repos = Object.values(mod.seedRepos({ time: lab.time }));
      } catch {
        /* seed module not available */
      }
    }
    let checked = 0;
    for (const repo of repos) {
      for (const [path, text] of Object.entries(repo.files)) {
        const probs = inspectFile(repo.id, path, text).filter((p) => p.severity === 'error');
        expect(probs, `${repo.id}/${path}`).toEqual([]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(0);
    const example = lab.repos['uia-remote']?.files['config.properties.example'];
    if (example && Object.keys(lab.orca.robots).length) {
      const target = example.replace(/robotName=.*/, 'robotName=megatron');
      const v = validateConfigProperties(target, lab.orca);
      expect(v.rules.find((r) => r.key === 'robotName')?.ok).toBe(true);
      // The factory example only needs a robot name to pass the whole M14 target (Cur M14).
      expect(v.passed).toBe(v.total);
    }
  }, 60_000);
});

describe('keymap and extra highlighters', () => {
  it('maps the IntelliJ Windows/Linux keymap and game substitutes', async () => {
    const { keyToCommand } = await import('./keymap');
    const k = (key: string, m: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => keyToCommand({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m });
    expect(k('s', { ctrlKey: true })).toBe('save');
    expect(k('K', { ctrlKey: true, shiftKey: true })).toBe('push');
    expect(k('k', { ctrlKey: true })).toBe('commit');
    expect(k('F10', { shiftKey: true })).toBe('run');
    expect(k('F2', { ctrlKey: true })).toBe('stop');
    expect(k('W', { altKey: true, shiftKey: true })).toBe('closeTab');
    expect(k('U', { altKey: true, shiftKey: true })).toBe('update');
    expect(k('4', { altKey: true })).toBe('tw:run');
    expect(k('F12', { altKey: true })).toBe('tw:terminal');
    expect(k('Enter', { altKey: true })).toBe('contextActions');
    expect(k('a')).toBeNull();
  });

  it('highlights Swift/C# runners and Python/shell scripts', async () => {
    const { highlight, langFor } = await import('./lang');
    expect(langFor('runners/ios/IosLstrRunner.swift')).toBe('clike');
    expect(langFor('runners/rest/rest_runner.py')).toBe('script');
    const sw = highlight('clike', 'func run() { let x = "a" } // done')[0];
    expect(sw.find((t) => t.t === 'func')?.c).toBe('kw');
    expect(sw.find((t) => t.t === '"a"')?.c).toBe('str');
    expect(sw[sw.length - 1].c).toBe('com');
    const py = highlight('script', 'def go(x):  # comment\n    return "y"');
    expect(py[0].find((t) => t.t === 'def')?.c).toBe('kw');
    expect(py[0].find((t) => t.t === 'go')?.c).toBe('fn');
    expect(py[0][py[0].length - 1].c).toBe('com');
    expect(py[1].find((t) => t.t === '"y"')?.c).toBe('str');
  });
});
