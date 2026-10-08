/**
 * `labsim-lab/pigeon` — the legacy LSTR (Language Specific Test Runner) repo that evolved from
 * Lester (a pun on "pidgin language"). Raw JSON tests run on REST, Android, Windows and iOS runners;
 * high-level actions ("card swipe") are abstracted per platform (Ref §5). No JSON linter.
 */
import type { RepoSeed } from './types';

export const SWIPE_SALE_PRINT = `{
  "name": "Swipe sale with printed receipt",
  "connectionType": "USB",
  "platforms": ["REST", "ANDROID", "WINDOWS", "IOS"],
  "actions": [
    { "action": "create order",   "params": { "item": "Tax Item 5" }, "store": "orderId" },
    { "action": "review order",   "params": { "orderId": "\${orderId}" } },
    { "action": "pay",            "params": { "orderId": "\${orderId}" } },
    { "action": "card swipe",     "params": { "profile": "VISA_STD_SWIPE", "orderId": "\${orderId}" }, "store": "paymentId" },
    { "action": "select tip",     "params": { "robot": "\${ROBOT_NAME}", "screen": "TIP", "button": "No Tip" } },
    { "action": "assert approved","params": { "paymentId": "\${paymentId}" } },
    { "action": "select print",   "params": { "robot": "\${ROBOT_NAME}", "screen": "\${RECEIPT_SCREEN}" } },
    { "action": "verify receipt", "params": { "totalCents": 1083 } },
    { "action": "assert home",    "params": {} }
  ]
}
`;

export const TIP_SALE_PRINT = `{
  "name": "Swipe sale with 18% tip and printed receipt",
  "connectionType": "USB",
  "platforms": ["REST", "ANDROID", "WINDOWS", "IOS"],
  "actions": [
    { "action": "create order", "params": { "item": "Tax Item 5" }, "store": "orderId" },
    { "action": "card swipe",   "params": { "profile": "VISA_STD_SWIPE", "orderId": "\${orderId}" }, "store": "paymentId" },
    { "action": "add tip",      "params": { "paymentId": "\${paymentId}", "percent": 18 }, "store": "tipId" },
    { "action": "select print", "params": { "robot": "\${ROBOT_NAME}", "screen": "RECEIPT_OPTIONS_4" } }
  ]
}
`;

export const PAYMENT_SUCCESS_COMPARE = `{
  "name": "Payment Successful screen compare",
  "connectionType": "USB",
  "platforms": ["ANDROID"],
  "actions": [
    { "action": "create order",    "params": { "item": "Tax Item 5" }, "store": "orderId" },
    { "action": "review order",    "params": { "orderId": "\${orderId}" } },
    { "action": "pay",             "params": { "orderId": "\${orderId}" } },
    { "action": "card swipe",      "params": { "profile": "VISA_STD_SWIPE", "orderId": "\${orderId}" }, "store": "paymentId" },
    { "action": "select tip",      "params": { "robot": "\${ROBOT_NAME}", "screen": "TIP", "button": "No Tip" } },
    { "action": "assert approved", "params": { "paymentId": "\${paymentId}" } },
    { "action": "screenCompare", "params": { "x": 208, "y": 512, "w": 304, "h": 40, "expected": "Payment Successful" } },
    { "action": "select no receipt", "params": { "robot": "\${ROBOT_NAME}", "screen": "\${RECEIPT_SCREEN}" } },
    { "action": "assert home",     "params": {} }
  ]
}
`;

const WINDOWS_TENDER = `{
  "name": "Windows POS cash tender",
  "connectionType": "NETWORK",
  "platforms": ["WINDOWS"],
  "actions": [
    { "action": "create order", "params": { "item": "Coffee" }, "store": "orderId" },
    { "action": "pay",          "params": { "orderId": "\${orderId}", "tender": "CASH" } },
    { "action": "assert approved", "params": {} }
  ]
}
`;

const IOS_GO_SMOKE = `{
  "name": "iOS Go SDK smoke (mobile runner)",
  "connectionType": "REST",
  "platforms": ["IOS", "GO"],
  "actions": [
    { "action": "create order", "params": { "item": "Tax Item 5" }, "store": "orderId" },
    { "action": "card tap",     "params": { "profile": "VISA_STD_TAP", "orderId": "\${orderId}" }, "store": "paymentId" },
    { "action": "assert approved", "params": { "paymentId": "\${paymentId}" } }
  ]
}
`;

/** Legacy LSTR iOS smoke (rarely touched, Ref §5) [illus.]. */
const IOS_LEGACY_SMOKE = `{
  "name": "Legacy LSTR iOS smoke",
  "connectionType": "REST",
  "platforms": ["IOS"],
  "actions": [
    { "action": "create order", "params": { "item": "Coffee" }, "store": "orderId" },
    { "action": "pay",          "params": { "orderId": "\${orderId}", "tender": "CASH" } },
    { "action": "assert approved", "params": {} }
  ]
}
`;

export const KNOWN_GOOD = `{
  "name": "Known-good LSTR actions — copy a whole line, do not type JSON by hand",
  "connectionType": "USB",
  "platforms": ["REST", "ANDROID", "WINDOWS", "IOS", "GO"],
  "actions": [
    { "action": "create order", "params": { "item": "Tax Item 5" }, "store": "orderId" },
    { "action": "review order", "params": { "orderId": "\${orderId}" } },
    { "action": "pay", "params": { "orderId": "\${orderId}" } },
    { "action": "card swipe", "params": { "profile": "VISA_STD_SWIPE", "orderId": "\${orderId}" }, "store": "paymentId" },
    { "action": "card dip", "params": { "profile": "VISA_STD_DIP", "orderId": "\${orderId}" }, "store": "paymentId" },
    { "action": "card tap", "params": { "profile": "VISA_STD_TAP", "orderId": "\${orderId}" }, "store": "paymentId" },
    { "action": "select tip", "params": { "robot": "\${ROBOT_NAME}", "screen": "TIP", "button": "No Tip" } },
    { "action": "add tip", "params": { "paymentId": "\${paymentId}", "percent": 18 }, "store": "tipId" },
    { "action": "assert approved", "params": { "paymentId": "\${paymentId}" } },
    { "action": "select print", "params": { "robot": "\${ROBOT_NAME}", "screen": "\${RECEIPT_SCREEN}" } },
    { "action": "select email", "params": { "robot": "\${ROBOT_NAME}", "screen": "\${RECEIPT_SCREEN}" } },
    { "action": "select text", "params": { "robot": "\${ROBOT_NAME}", "screen": "\${RECEIPT_SCREEN}" } },
    { "action": "select no receipt", "params": { "robot": "\${ROBOT_NAME}", "screen": "\${RECEIPT_SCREEN}" } },
    { "action": "select scan", "params": { "robot": "\${ROBOT_NAME}", "screen": "RECEIPT_OPTIONS_5" } },
    { "action": "verify receipt", "params": { "totalCents": 1083 } },
    { "action": "screenCompare", "params": { "x": 208, "y": 512, "w": 304, "h": 40, "expected": "Payment Successful" } },
    { "action": "assert screen", "params": { "screen": "approved" } },
    { "action": "tap", "params": { "robot": "\${ROBOT_NAME}", "screen": "HOME", "button": "Register" } },
    { "action": "wait", "params": { "ms": 1000 } },
    { "action": "assert home", "params": {} }
  ]
}
`;

const LSTR_JSON = `{
  "lstr": "2.8.1",
  "runners": {
    "REST":    { "path": "runners/rest",    "entry": "rest_runner.py" },
    "ANDROID": { "path": "runners/android", "entry": "AndroidLstrRunner.java" },
    "WINDOWS": { "path": "runners/windows", "entry": "WindowsLstrRunner.cs" },
    "IOS":     { "path": "runners/ios",     "entry": "IosLstrRunner.swift" }
  },
  "timeouts": { "screenMs": 10000, "cardMs": 30000, "printerPayloadMs": 60000, "pollMs": 500 },
  "orca": "http://orca.lab.local:8080",
  "variables": { "RECEIPT_SCREEN": "counted on device: RECEIPT_OPTIONS_4 or RECEIPT_OPTIONS_5" }
}
`;

const README = `# pigeon

Legacy test repo. Lester → Pigeon (yes, "pidgin language"). The engine is **LSTR**, the Language Specific
Test Runner: one runner per platform in \`runners/{rest,android,windows,ios}\` (iOS is rarely touched; iOS Go
SDK testing is very much alive).

## A test is raw JSON
\`\`\`
name            what the test does
connectionType  USB | NETWORK | REST
platforms       1-5 of REST, ANDROID, WINDOWS, IOS, GO (versatile tests target 4-5 at once)
actions         ordered list: { "action", "params", "store" } — create requests, pass parameters,
                store output variables (\${orderId}) for later actions
\`\`\`
High-level actions are abstracted by the runner: "card swipe" becomes an SDK payment request on REST and a
physical robot action (Orca → Callus → probe) on a rig.

## Survival guide
* **There is no JSON linter** (IntelliJ inspections are off for this project). A missing comma or bracket
  shows up at run time as \`LSTR ParseError: Unexpected token … at line N column M\` — the error points at the
  token AFTER the gap, so look at the end of the previous line. Better: copy whole lines from
  \`tests/_templates/known_good_actions.json\` instead of typing JSON.
* A failure "at select print" usually means the runner timed out waiting for a **printer payload** — the arm
  missed Print (stale coordinates), not a printer problem.
* \`\${RECEIPT_SCREEN}\` is set by the Android runner after counting the receipt options on screen
  (\`RECEIPT_OPTIONS_4\` or \`RECEIPT_OPTIONS_5\`). Orca keeps both maps for every Device Type.
* screenCompare boxes come from GIMP: open a screencap, rectangle-select the text, copy Position/Size.
`;

const ANDROID_RUNNER_V1 = `package com.labsim.pigeon.android;

import com.labsim.pigeon.core.Action;
import com.labsim.pigeon.core.LstrTest;
import com.labsim.pigeon.core.OrcaClient;
import java.util.Map;

/**
 * LSTR Android runner. Every UI action goes through Orca xy_touch (ADB_TOUCH on ADB bots, PHYSICAL_TAP on
 * touch rigs); waits poll the device over ADB every 500 ms.
 */
public final class AndroidLstrRunner {

    private static final long SCREEN_TIMEOUT_MS = 10_000;
    private static final long CARD_TIMEOUT_MS = 30_000;
    private static final long PRINTER_PAYLOAD_TIMEOUT_MS = 60_000;

    private final OrcaClient orca;
    private final Adb adb;
    private final Map<String, String> vars;

    public AndroidLstrRunner(OrcaClient orca, Adb adb, Map<String, String> vars) {
        this.orca = orca;
        this.adb = adb;
        this.vars = vars;
    }

    public void run(LstrTest test) {
        adb.connect(vars.get("MFD_IP") + ":" + vars.get("PORT_NUMBER"));
        int n = test.actions().size();
        for (int i = 0; i < n; i++) {
            Action a = test.actions().get(i).resolve(vars);
            System.out.print("LSTR step " + (i + 1) + "/" + n + " \\"" + a.name() + "\\" …");
            long t0 = System.currentTimeMillis();
            try {
                execute(a);
            } catch (RuntimeException e) {
                System.out.println(" " + e.getMessage());
                System.out.println("FAILED at \\"" + a.name() + "\\"");
                throw e;
            }
            System.out.printf(" OK (%.1f s)%n", (System.currentTimeMillis() - t0) / 1000.0);
        }
    }

    private void execute(Action a) {
        switch (a.name()) {
            case "create order" -> {
                adb.unlock(vars.get("UNLOCK_PASSCODE"));
                orca.xyTouch(robot(), "HOME", "Register");
                adb.waitForScreen("register", SCREEN_TIMEOUT_MS);
                orca.xyTouch(robot(), "REGISTER_HOME", a.param("item"));
                a.store(adb.currentOrderId());
            }
            case "review order" -> {
                orca.xyTouch(robot(), "REGISTER_HOME", "Review Order");
                adb.waitForScreen("review-order", SCREEN_TIMEOUT_MS);
            }
            case "pay" -> {
                orca.xyTouch(robot(), "REVIEW_ORDER", "Pay");
                adb.waitForScreen("tender-select", SCREEN_TIMEOUT_MS);
                orca.xyTouch(robot(), "PAYMENT", "Charge");
            }
            case "card swipe", "card dip", "card tap" -> {
                // Abstracted: on a rig the "card swipe" becomes a physical robot action (Orca → Callus → probe).
                orca.card(a.name().substring(5), robot(), a.param("profile"));
                adb.waitForScreenAfter("payment-prompt", CARD_TIMEOUT_MS);
            }
            case "select tip" -> orca.xyTouch(robot(), a.param("screen"), a.param("button"));
            case "add tip" -> orca.xyTouch(robot(), "TIP", a.param("percent") + "%");
            case "assert approved" -> adb.waitForScreen("approved", CARD_TIMEOUT_MS);
            case "select print" -> {
                vars.put("RECEIPT_SCREEN", adb.countReceiptOptions() == 5 ? "RECEIPT_OPTIONS_5" : "RECEIPT_OPTIONS_4");
                orca.xyTouch(a.param("robot"), a.param("screen"), "Print");
                System.out.print(" waiting for printer payload …");
                adb.waitForPrinterPayload(PRINTER_PAYLOAD_TIMEOUT_MS);
            }
            case "assert home" -> adb.waitForScreen("home", SCREEN_TIMEOUT_MS);
            default -> throw new IllegalArgumentException("LSTR UnknownAction: \\"" + a.name() + "\\"");
        }
    }

    private String robot() {
        return vars.get("ROBOT_NAME");
    }
}
`;

const ANDROID_RUNNER = ANDROID_RUNNER_V1.replace(
  `        adb.connect(vars.get("MFD_IP") + ":" + vars.get("PORT_NUMBER"));`,
  `        String target = vars.get("MFD_IP") + ":" + vars.get("PORT_NUMBER");
        if (!adb.connect(target)) {
            // LSTR: retry adb connect once (devices sometimes refuse the first connect after boot)
            adb.connect(target);
        }`,
);

const REST_RUNNER = `"""LSTR REST runner: every action becomes an HTTP request against the sandbox backend."""
import json
import os
import sys

import requests

SANDBOX = os.environ.get("SANDBOX_URL", "https://apisandbox.dev1.labsim.example/v1")


def run(test_path):
    with open(test_path) as f:
        test = json.load(f)  # strict JSON: no comments, no trailing commas
    if "REST" not in test["platforms"]:
        raise SystemExit(f"LSTR platform REST not in test platforms {test['platforms']}")
    variables = dict(os.environ)
    for i, action in enumerate(test["actions"], start=1):
        name = action["action"]
        params = {k: expand(v, variables) for k, v in action.get("params", {}).items()}
        if name in ("card swipe", "card dip", "card tap"):
            # Abstracted: over REST a card action is an SDK payment request, not a robot action.
            res = requests.post(f"{SANDBOX}/payments", json={"orderId": params.get("orderId"), "testCard": params["profile"]},
                                headers={"Authorization": f"Bearer {os.environ.get('API_KEY', '')}"})
        else:
            res = requests.post(f"{SANDBOX}/lstr/{name.replace(' ', '-')}", json=params)
        res.raise_for_status()
        if "store" in action:
            variables[action["store"]] = res.json().get("id", "")
        print(f'LSTR step {i}/{len(test["actions"])} "{name}" … OK')


def expand(value, variables):
    if isinstance(value, str):
        for k, v in variables.items():
            value = value.replace("${" + k + "}", str(v))
    return value


if __name__ == "__main__":
    run(sys.argv[1])
`;

const WINDOWS_RUNNER = `using System;
using System.IO;
using System.Text.Json;

namespace Pigeon.Lstr.Windows
{
    /// <summary>LSTR Windows runner (LabSim Windows POS). Rarely changed; drives the POS through UI Automation.</summary>
    public static class WindowsLstrRunner
    {
        public static int Main(string[] args)
        {
            var doc = JsonDocument.Parse(File.ReadAllText(args[0]));
            var actions = doc.RootElement.GetProperty("actions");
            var n = actions.GetArrayLength();
            var i = 0;
            foreach (var action in actions.EnumerateArray())
            {
                i++;
                var name = action.GetProperty("action").GetString();
                Console.WriteLine($"LSTR step {i}/{n} \\"{name}\\" … OK");
            }
            return 0;
        }
    }
}
`;

const IOS_RUNNER = `import Foundation

/// LSTR iOS runner. Rarely touched; the active iOS work is Go SDK testing on the phone carriage (ASTRO).
struct IosLstrRunner {
    let testURL: URL

    func run() throws {
        let data = try Data(contentsOf: testURL)
        guard let test = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let actions = test["actions"] as? [[String: Any]] else {
            throw NSError(domain: "LSTR", code: 1, userInfo: [NSLocalizedDescriptionKey: "LSTR SchemaError: missing \\"actions\\""])
        }
        for (i, action) in actions.enumerated() {
            print("LSTR step \\(i + 1)/\\(actions.count) \\"\\(action["action"] ?? "")\\" … OK")
        }
    }
}
`;

const ACTION_JAVA = `package com.labsim.pigeon.core;

import java.util.HashMap;
import java.util.Map;

/** One JSON action: { "action": name, "params": {…}, "store": var }. */
public final class Action {
    private final String name;
    private final Map<String, String> params;
    private final String store;
    private Map<String, String> vars = new HashMap<>();

    public Action(String name, Map<String, String> params, String store) {
        this.name = name;
        this.params = params;
        this.store = store;
    }

    /** \${x} resolves from stored outputs, then env (ROBOT_NAME, MERCHANT…), then runner variables (RECEIPT_SCREEN). */
    public Action resolve(Map<String, String> vars) {
        Map<String, String> resolved = new HashMap<>();
        for (Map.Entry<String, String> e : params.entrySet()) {
            String v = e.getValue();
            for (Map.Entry<String, String> var : vars.entrySet()) {
                v = v.replace("\${" + var.getKey() + "}", var.getValue());
            }
            if (v.contains("\${")) {
                throw new IllegalStateException("LSTR unresolved variable " + v.substring(v.indexOf("\${"), v.indexOf('}') + 1));
            }
            resolved.put(e.getKey(), v);
        }
        Action a = new Action(name, resolved, store);
        a.vars = vars;
        return a;
    }

    public String name() {
        return name;
    }

    public String param(String key) {
        return params.get(key);
    }

    public void store(String value) {
        if (store != null) {
            vars.put(store, value);
        }
    }
}
`;

function initial(): Record<string, string> {
  return {
    'README.md': README,
    'lstr.json': LSTR_JSON,
    'runners/android/AndroidLstrRunner.java': ANDROID_RUNNER_V1,
    'runners/android/core/Action.java': ACTION_JAVA,
    'runners/rest/rest_runner.py': REST_RUNNER,
    'runners/windows/WindowsLstrRunner.cs': WINDOWS_RUNNER,
    'runners/ios/IosLstrRunner.swift': IOS_RUNNER,
    'tests/sale/swipe_sale_print.json': SWIPE_SALE_PRINT,
    'tests/sale/payment_success_compare.json': PAYMENT_SUCCESS_COMPARE,
    'tests/tender/windows_tender.json': WINDOWS_TENDER,
    'tests/go/ios_go_smoke.json': IOS_GO_SMOKE,
    'tests/ios/legacy_smoke.json': IOS_LEGACY_SMOKE,
  };
}

export const PIGEON: RepoSeed = {
  id: 'pigeon',
  remoteUrl: 'git@github.com:labsim-lab/pigeon.git',
  description: 'Pigeon (LSTR) legacy JSON test runner',
  protectedMain: false,
  commits: [
    { short: '52b1e07', message: 'Import LSTR runners and tests from Lester', author: 'morgan', at: '2025-11-03 09:30', changes: initial() },
    { short: '8d2e6b9', message: 'known_good_actions template', author: 'morgan', at: '2026-09-15 15:44', changes: { 'tests/_templates/known_good_actions.json': KNOWN_GOOD } },
    { short: '4c1f0aa', message: 'Add tip_sale_print.json', author: 'alex', at: '2026-10-01 11:05', changes: { 'tests/sale/tip_sale_print.json': TIP_SALE_PRINT } },
    { short: 'e93b0c4', message: 'LSTR: retry adb connect once', author: 'morgan', at: '2026-10-02 10:48', changes: { 'runners/android/AndroidLstrRunner.java': ANDROID_RUNNER } },
  ],
  prs: [],
};
