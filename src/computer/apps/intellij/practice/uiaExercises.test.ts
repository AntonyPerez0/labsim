import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, lab, robot } from '@/sim/core/testkit';
import { balanced, checkUia, methodBody, UIA_EXERCISES, type UiaCheckEnv } from './uiaExercises';

let env: UiaCheckEnv;
beforeAll(() => {
  fresh();
  env = { orka: lab().orka };
});

const PIN_SOLUTION = `package com.labsim.uia.pageobjects;

import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.Until;
import com.labsim.uia.BaseTest;

public class CompassPinScreen extends BaseTest {
    private final BySelector title = By.text("Enter PIN");
    private final BySelector okBtn = By.text("OK");

    public void waitForScreen() {
        device.wait(Until.hasObject(title), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(title);
    }

    public void enterPin(String pin) {
        waitForScreen();
        String robot = config.getString("robotName");
        for (int i = 0; i < pin.length(); i++) {
            orka.xyTouch(robot, "PIN_PAD", String.valueOf(pin.charAt(i)));
        }
        orka.xyTouch(robot, "PIN_PAD", "OK");
    }
}
`;

function solve(id: string, text: string): string {
  switch (id) {
    case 'screen-methods': {
      const field = /BySelector\s+(\w+)\s*=/.exec(text)![1];
      return text.replace(
        '    // TODO: waitForScreen() and isScreenPresent()\n',
        `    public void waitForScreen() {\n        device.wait(Until.hasObject(${field}), TIMEOUT_MS);\n    }\n\n    public boolean isScreenPresent() {\n        return device.hasObject(${field});\n    }\n`,
      );
    }
    case 'scroll-direction': {
      const body = methodBody(text, 'open')!.body;
      const fixed = `\n        waitForScreen();\n        if (deviceType == DeviceType.FLUX || deviceType == DeviceType.COMPASS) {\n            scrollVerticallyTo(appName);\n        } else {\n            scrollHorizontallyTo(appName);\n        }\n        device.findObject(By.text(appName)).click();\n    `;
      return text.replace(body, fixed);
    }
    case 'config-compass': {
      const r = robot('seti');
      const d = lab().orka.devices[r.deviceId!]!;
      return [
        'runType=standalone',
        `merchantFacingDeviceIp=${d.ip}`,
        'customerFacingDeviceIp=',
        `serial=${d.serial}`,
        'deviceType=Compass',
        'theme=avocado',
        'kernelType=CPA',
        'portNumber=5444',
        'unlockPasscode=0000',
        `backendEnv=${r.environment}`,
        'robotName=seti',
      ].join('\n');
    }
    case 'tethered-order': {
      const steps = [
        '        mfd.run(() -> homeScreen.open("Register"));',
        '        mfd.run(registerHome::addTaxItem5);',
        '        mfd.run(registerHome::reviewOrder);',
        '        orka.loadSwipeCard(config.getString("robotName"), "VISA_STD_SWIPE");',
        '        cfd.run(cfdTotals::assertTotals);',
        '        mfd.run(registerHome::payAndCharge);',
        '        cfd.run(cfdPayment::finalisePayment);',
      ].join('\n');
      return text.replace(methodBody(text, 'testTax')!.body, `\n${steps}\n    `);
    }
    case 'teardown':
      return text.replace('    // TODO: teardown\n', '    @After\n    public void tearDown() {\n        mfd.run(homeScreen::goHome);\n        cfd.run(homeScreen::goHome);\n    }\n');
    case 'wait-first':
      return text
        .replace('public void reviewOrder() {\n        device', 'public void reviewOrder() {\n        waitForScreen();\n        device')
        .replace('public void payAndCharge() {\n        device', 'public void payAndCharge() {\n        waitForScreen();\n        device');
    case 'cfd-display-id':
      return text
        .replace(/(By\.textStartsWith\("(Subtotal|Tax|Total)"\));/g, (_m, sel: string) => `${sel.slice(0, -1)}).displayId(cfdDisplayId);`)
        .replace(/assertTrue\("CFD totals \(OCR\)", orka\.screenCompare\("CFD_TOTAL"\)\);[^\n]*/, 'assertTrue("CFD total shown", device.hasObject(total));');
    case 'pin-pad':
      return PIN_SOLUTION;
    default:
      throw new Error(id);
  }
}

describe('UIA Practice exercises', () => {
  for (const ex of UIA_EXERCISES) {
    it(`${ex.id}: every variant starts failing and the reference fix passes`, () => {
      for (let i = 0; i < 30; i++) {
        const v = ex.make();
        expect(v.path.startsWith('practice/')).toBe(true);
        expect(checkUia(ex, v.text, v.ctx, env).passed, `${ex.id} should start unsolved:\n${v.text}`).toBe(false);
        const fixed = solve(ex.id, v.text);
        const r = checkUia(ex, fixed, v.ctx, env);
        expect(r.passed, `${ex.id} fix should pass:\n${fixed}\n${JSON.stringify(r.items, null, 1)}`).toBe(true);
      }
    });
  }

  it('rejects common wrong answers', () => {
    const scroll = UIA_EXERCISES.find((e) => e.id === 'scroll-direction')!;
    const v = scroll.make();
    const flexOnly = v.text.replace(methodBody(v.text, 'open')!.body, '\n        if (deviceType == DeviceType.FLUX) {\n            scrollVerticallyTo(appName);\n        } else {\n            scrollHorizontallyTo(appName);\n        }\n        device.findObject(By.text(appName)).click();\n    ');
    const r = checkUia(scroll, flexOnly, v.ctx, env);
    expect(r.items.find((g) => g.label.startsWith('Compass'))!.ok).toBe(false);

    const pin = UIA_EXERCISES.find((e) => e.id === 'pin-pad')!;
    const adbPin = PIN_SOLUTION.replace('orka.xyTouch(robot, "PIN_PAD", String.valueOf(pin.charAt(i)));', 'device.findObject(By.text(String.valueOf(pin.charAt(i)))).click();');
    expect(checkUia(pin, adbPin, {}, env).passed).toBe(false);
  });

  it('balanced() ignores braces in strings and comments', () => {
    expect(balanced('class A { String s = "}"; /* { */ }')).toBe(true);
    expect(balanced('class A { void f() { }')).toBe(false);
  });
});
