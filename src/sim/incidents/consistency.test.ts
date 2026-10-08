/**
 * Cross-module consistency of the "layout truth" (ARCHITECTURE data-flow rule 6): the firmware layouts
 * (sim-core, what devices draw and hit-test), the devops truth table (what Gort files hold and what Jared's
 * scripted review compares against), Orca's factory Screen Locations and the factory Gort files must agree
 * (±0.05 mm) — otherwise a correct coordinate PR could be rejected, or a "fixed" row could still miss.
 */
import { describe, expect, it } from 'vitest';
import { lab, start } from './kit';
import { firmwareTruth } from '../core';
import { screensForType, SCREEN_TYPES, screenLocationPath } from '../seed/repos/screenTruth';
import { treeAt } from '../devops/gitCore';
import type { DeviceTypeCode } from '../types';

describe('layout truth consistency (Sim §2.10, §3.22.2)', () => {
  it('devops truth table == firmware layouts for every type × screen × button', () => {
    const problems: string[] = [];
    for (const type of SCREEN_TYPES) {
      for (const [screen, buttons] of Object.entries(screensForType(type))) {
        const fw = firmwareTruth(type, screen);
        if (!fw) {
          if (Object.keys(buttons).length) problems.push(`${type}/${screen}: no firmware table`);
          continue;
        }
        const byName = new Map(fw.map((b) => [b.button, b]));
        for (const [name, p] of Object.entries(buttons)) {
          const f = byName.get(name);
          if (!f) problems.push(`${type}/${screen}/${name}: not a firmware button`);
          else if (Math.abs(f.x - p.x) > 0.05 || Math.abs(f.y - p.y) > 0.05) problems.push(`${type}/${screen}/${name}: truth (${p.x}, ${p.y}) firmware (${f.x}, ${f.y})`);
        }
        for (const f of fw) if (!(f.button in buttons) && f.button !== 'LabSim Dining') problems.push(`${type}/${screen}/${f.button}: missing from truth table`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('Orca factory Screen Locations sit on firmware truth (no drift at factory)', () => {
    start();
    const problems: string[] = [];
    const L = lab();
    for (const s of Object.values(L.orca.screens)) {
      const fw = firmwareTruth(s.deviceType as DeviceTypeCode, s.name);
      if (!fw) {
        problems.push(`${s.deviceType}/${s.name}: Orca row without firmware table`);
        continue;
      }
      for (const loc of Object.values(L.orca.screenLocations).filter((l) => l.screenId === s.id)) {
        const f = fw.find((b) => b.button === loc.button);
        if (!f) problems.push(`${s.deviceType}/${s.name}/${loc.button}: not on screen`);
        else if (Math.abs(f.x - loc.xMm) > 0.05 || Math.abs(f.y - loc.yMm) > 0.05) problems.push(`${s.deviceType}/${s.name}/${loc.button}: Orca (${loc.xMm}, ${loc.yMm}) firmware (${f.x}, ${f.y})`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('factory gort config/screen-locations files match Orca (the sync source agrees with the DB)', () => {
    start();
    const L = lab();
    const repo = L.repos['gort']!;
    const tree = treeAt(repo, repo.branches['main']!);
    const problems: string[] = [];
    let files = 0;
    for (const s of Object.values(L.orca.screens)) {
      const text = tree[screenLocationPath(s.deviceType, s.name)];
      if (text === undefined) continue;
      files++;
      const json = JSON.parse(text) as { buttons: Record<string, { x: number; y: number }> };
      for (const loc of Object.values(L.orca.screenLocations).filter((l) => l.screenId === s.id)) {
        const b = json.buttons[loc.button];
        if (!b) {
          if (loc.button !== 'LabSim Dining') problems.push(`${s.deviceType}/${s.name}/${loc.button}: missing in gort`);
        } else if (Math.abs(b.x - loc.xMm) > 0.05 || Math.abs(b.y - loc.yMm) > 0.05) problems.push(`${s.deviceType}/${s.name}/${loc.button}: gort (${b.x}, ${b.y}) Orca (${loc.xMm}, ${loc.yMm})`);
      }
    }
    expect(files).toBeGreaterThan(20);
    expect(problems).toEqual([]);
  });
});
