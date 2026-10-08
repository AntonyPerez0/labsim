/**
 * Fixture texts used by setup ops and faults (Sim §4.4.4). Line numbers matter for the Pigeon ones.
 */
import type { LabState } from '../types';
import { SWIPE_SALE_PRINT } from '../seed/repos/pigeon';
import { screenLocationFile, screenLocationPath, truthFor } from '../seed/repos/screenTruth';
import { UIA_212_FILE, UIA_PATHS } from '../seed/repos/uiaRemote';
import { brokenConfig, renderConfig, targetConfig } from './config';

/** Cur M14's "as found" file verbatim. */
export const M14_BROKEN = `runType=standalone
merchantFacingDeviceIp=10.42.30.21
customerFacingDeviceIp=
serial=SIM-S2-000021
deviceType=Mini
theme=classic
kernelType=SPA
portNumber=5555
unlockPasscode=0000
backendEnv=DEV1
robotName=megatron
`;

/** 28 lines; `pigeon.missingComma { line: 22 }` → `Unexpected string in JSON at line 23 column 7`. */
export const M15_EXPANDED = `{
  "name": "Swipe sale with printed receipt",
  "connectionType": "USB",
  "platforms": ["REST", "ANDROID", "WINDOWS", "IOS"],
  "actions": [
    { "action": "create order", "params": {
      "item": "Tax Item 5"
    }, "store": "orderId" },
    { "action": "review order", "params": {
      "orderId": "\${orderId}"
    } },
    { "action": "pay", "params": {
      "orderId": "\${orderId}"
    } },
    { "action": "card swipe", "params": {
      "profile": "VISA_STD_SWIPE",
      "orderId": "\${orderId}"
    }, "store": "paymentId" },
    { "action": "select tip", "params": { "robot": "\${ROBOT_NAME}", "screen": "TIP", "button": "No Tip" } },
    { "action": "assert approved", "params": { "paymentId": "\${paymentId}" } },
    { "action": "select print", "params": {
      "robot": "\${ROBOT_NAME}",
      "screen": "RECEIPT_OPTIONS_5"
    } },
    { "action": "verify receipt", "params": { "totalCents": 1083 } },
    { "action": "assert home", "params": {} }
  ]
}
`;

/** Factory swipe_sale_print.json + a 10th action (screenCompare with an empty webcam box). */
export const M16_WITH_COMPARE = SWIPE_SALE_PRINT.replace(
  '    { "action": "assert home",    "params": {} }\n',
  '    { "action": "assert home",    "params": {} },\n    { "action": "screenCompare", "params": { "x": 0, "y": 0, "w": 0, "h": 0, "expected": "TOTAL $10.83", "source": "webcam" } }\n',
);

/** `receipt5-fix:<TYPE>` / `gort-418`: the 5-option map for a type with its firmware values. */
export function receipt5Fix(type: string): { path: string; text: string } | null {
  const t = truthFor(type, 'RECEIPT_OPTIONS_5');
  if (!t) return null;
  return { path: screenLocationPath(type, 'RECEIPT_OPTIONS_5'), text: screenLocationFile(type, 'RECEIPT_OPTIONS_5', t) };
}

const LOCKSCREEN_431 = `package com.labsim.uia.pageobjects;

import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.Until;
import com.labsim.uia.BaseTest;

/** LockScreen: passcode lock shown after wake. */
public class LockScreen extends BaseTest {
    // ===== Zone 1: Element Locators =====
    private final BySelector clock = By.res("com.labsim.launcher:id/lock_clock");

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(clock), TIMEOUT_MS);
    }
}
`;

export type FixtureFiles = Record<string, string | null>;

/**
 * Resolve a fixture id to file changes in `repo` (null = deletion). Generators that need the lab
 * (`target`, `broken`) take a robot name. Returns null for an unknown fixture.
 */
export function resolveFixture(lab: LabState, id: string, opts: { robot?: string; repo?: string; path?: string; base?: Record<string, string> } = {}): FixtureFiles | null {
  const robot = opts.robot ?? 'megatron';
  switch (true) {
    case id === 'm14-broken':
      return { 'config.properties': M14_BROKEN };
    case id === 'target': {
      const t = targetConfig(lab, robot);
      return t ? { 'config.properties': renderConfig(t) } : null;
    }
    case id === 'broken': {
      const b = brokenConfig(lab, robot);
      return b ? { 'config.properties': renderConfig(b) } : null;
    }
    case id === 'm15-expanded':
      return { [opts.path ?? 'tests/sale/swipe_sale_print.json']: M15_EXPANDED };
    case id === 'm16-with-compare':
      return { [opts.path ?? 'tests/sale/swipe_sale_print.json']: M16_WITH_COMPARE };
    case id === 'gort-418': {
      const f = receipt5Fix('MINI_3');
      return f ? { [f.path]: f.text } : null;
    }
    case id.startsWith('receipt5-fix:'): {
      const f = receipt5Fix(id.slice('receipt5-fix:'.length));
      return f ? { [f.path]: f.text } : null;
    }
    case id === 'uia-212-ai-receipt':
      return { [UIA_PATHS.po('ReceiptOptionsScreen')]: UIA_212_FILE };
    case id === 'uia-431-lockscreen': {
      const base = opts.base ?? {};
      const appReg = base[UIA_PATHS.appReg] ?? '';
      const patched = appReg.replace('        registry.add("Setup");\n', '        registry.add("Setup");\n    // LockScreen registration\n    registry.add("LockScreen");\n');
      const t = targetConfig(lab, 'megatron');
      const cfg = t ? renderConfig({ ...t, portNumber: '5555' }) : null;
      return {
        [UIA_PATHS.appReg]: patched,
        [UIA_PATHS.po('LockScreen')]: LOCKSCREEN_431,
        ...(cfg ? { 'config.properties': cfg } : {}),
      };
    }
    default:
      return null;
  }
}

export const FIXTURE_IDS = ['m14-broken', 'target', 'broken', 'm15-expanded', 'm16-with-compare', 'gort-418', 'receipt5-fix:<TYPE>', 'uia-212-ai-receipt', 'uia-431-lockscreen'];
