/**
 * SANDBOX ONLY — plausible factory repo trees (Sim §2.12, Cur M13–M15, GP INC32) for developing the IDE and the
 * terminal before sim-devops lands. Never imported by app code; only `sandbox/fakeDevops.ts` uses it.
 */

const pkg = 'app/src/androidTest/java/com/labsim/uia';

const screen = (name: string, zone1: string[], zone2: string, mandatory = true) => `package com.labsim.uia.pageobjects;

import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.Until;
import com.labsim.uia.BaseTest;

/** ${name}: page object (POM). Zone 1 = locators, Zone 2 = helpers. */
public class ${name} extends BaseTest {

    // ===== Zone 1: Element Locators =====
${zone1.map((l) => `    ${l}`).join('\n')}

    // ===== Zone 2: Helper / Action Methods =====
${
  mandatory
    ? `    public void waitForScreen() {
        device.wait(Until.hasObject(${/BySelector (\w+)/.exec(zone1[0])?.[1] ?? 'root'}), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(${/BySelector (\w+)/.exec(zone1[0])?.[1] ?? 'root'});
    }
${zone2 ? '\n' : ''}`
    : ''
}${zone2}}
`;

const test = (name: string, header: string, body: string) => `package com.labsim.uia.testactions;

import com.labsim.uia.BaseTest;
import com.labsim.uia.pageobjects.*;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.assertTrue;

${header}
public class ${name} extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();
    private final CfdTotalsScreen cfdTotals = new CfdTotalsScreen();
    private final CfdPaymentScreen cfdPayment = new CfdPaymentScreen();

    @Before
    public void setUp() {
        mfd.run(homeScreen::waitForScreen);
    }

    @Test
    public void test${name.replace(/Test$/, '')}() {
${body}
    }

    @After
    public void tearDown() {
        mfd.run(homeScreen::goHome);
        cfd.run(homeScreen::goHome);
    }
}
`;

export const UIA_FILES: Record<string, string> = {
  '.gitignore': 'config.properties\ntarget/\n.idea/\n*.iml\n',
  'config.properties.example': `# uia-remote local run configuration (copy to config.properties — git-ignored)
runType=tethered
merchantFacingDeviceIp=10.42.30.21
customerFacingDeviceIp=10.42.30.22
serial=SIM-S2-000021
deviceType=Station
theme=avocado
kernelType=CPA
portNumber=5444
unlockPasscode=0000
backendEnv=DEV1
robotName=CHANGE_ME
`,
  'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.lab</groupId>
    <artifactId>uia-remote</artifactId>
    <version>2.3.0</version>
    <!-- UI Automator 2.3 remote runner -->
    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
    </properties>
    <dependencies>
        <dependency>
            <groupId>androidx.test.uiautomator</groupId>
            <artifactId>uiautomator</artifactId>
            <version>2.3.0</version>
        </dependency>
        <dependency>
            <groupId>junit</groupId>
            <artifactId>junit</artifactId>
            <version>4.13.2</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
</project>
`,
  'app/src/main/java/com/labsim/uia/AppRegistration.java': `package com.labsim.uia;

/** Registers the uia-remote helper app on the device under test. */
public final class AppRegistration {

    public static final String PACKAGE = "com.labsim.uia.remote";

    private AppRegistration() {
    }

    public static String activity() {
        return PACKAGE + "/.MainActivity";
    }
}
`,
  'app/src/test/java/com/labsim/uia/runner/MultiDeviceRunner.java': `package com.labsim.uia.runner;

import com.labsim.uia.pageobjects.*;

/** Tethered runner: UI Automator talks to ONE device at a time, so we hop between handles. */
public class MultiDeviceRunner {

    public void runTetheredSale(Config config) {
        RegisterHomeScreen registerHome = new RegisterHomeScreen();
        CfdTotalsScreen cfdTotals = new CfdTotalsScreen();
        CfdPaymentScreen cfdPayment = new CfdPaymentScreen();

        DeviceHandle mfd = DeviceHandle.connect(config.merchantFacingDeviceIp(), config.portNumber());
        DeviceHandle cfd = DeviceHandle.connect(config.customerFacingDeviceIp(), config.portNumber());

        mfd.run(registerHome::addTaxItem5);     // MFD_O1
        mfd.run(registerHome::reviewOrder);
        cfd.run(cfdTotals::assertTotals);       // CFD_O1
        mfd.run(registerHome::payAndCharge);    // MFD_O2
        cfd.run(cfdPayment::finalisePayment);   // Step 4
    }
}
`,
  [`${pkg}/BaseTest.java`]: `package com.labsim.uia;

import androidx.test.uiautomator.UiDevice;
import com.labsim.uia.runner.DeviceHandle;

/** Global setup, teardown and instance variables shared by every screen and test class. */
public abstract class BaseTest {

    protected static final long TIMEOUT_MS = 10_000;

    protected UiDevice device;
    protected DeviceHandle mfd;
    protected DeviceHandle cfd;
    protected DeviceType deviceType;

    protected void scrollVerticallyTo(String text) {
        device.swipe(540, 1500, 540, 500, 20);
    }

    protected void scrollHorizontallyTo(String text) {
        device.swipe(1500, 540, 300, 540, 20);
    }
}
`,
  [`${pkg}/databases/DbHelper.java`]: `package com.labsim.uia.databases;

import java.util.HashMap;
import java.util.Map;

/** Reads expected totals for assertions (tax rate 8.3 % on "Tax Item 5"). */
public class DbHelper {

    private final Map<String, Long> prices = new HashMap<>();

    public DbHelper() {
        prices.put("Tax Item 5", 1000L);
    }

    public long priceCents(String item) {
        return prices.getOrDefault(item, 0L);
    }
}
`,
  [`${pkg}/pageobjects/HomeScreen.java`]: `package com.labsim.uia.pageobjects;

import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.Until;
import com.labsim.uia.BaseTest;

/** HomeScreen: LabSim launcher. Every test starts and ends here. */
public class HomeScreen extends BaseTest {

    // ===== Zone 1: Element Locators =====
    private final BySelector registerIcon = By.text("Register");
    private final BySelector ordersIcon   = By.text("Orders");
    private final BySelector clock        = By.res("com.labsim.launcher:id/clock");

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(clock), TIMEOUT_MS);   // never click unrendered buttons
    }

    public boolean isScreenPresent() {
        return device.hasObject(clock);
    }

    public void open(String appName) {
        waitForScreen();
        if (deviceType == DeviceType.FLEX) {
            scrollHorizontallyTo(appName);    // Flex
        } else {                              // Mini, Station
            scrollVerticallyTo(appName);
        }
        device.findObject(By.text(appName)).click();
    }

    public void goHome() {
        device.pressHome();
        waitForScreen();
    }
}
`,
  [`${pkg}/pageobjects/LockScreen.java`]: screen('LockScreen', ['private final BySelector pinPad = By.res("com.labsim.launcher:id/pin_pad");'], `    public void unlock(String passcode) {
        waitForScreen();
        for (char c : passcode.toCharArray()) {
            device.findObject(By.text(String.valueOf(c))).click();
        }
    }
`),
  [`${pkg}/pageobjects/NavigationBar.java`]: screen('NavigationBar', ['private final BySelector homeBtn = By.desc("Home");', 'private final BySelector backBtn = By.desc("Back");'], `    public void back() {
        device.findObject(backBtn).click();
    }
`),
  [`${pkg}/pageobjects/RegisterHomeScreen.java`]: `package com.labsim.uia.pageobjects;

import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.Until;
import com.labsim.uia.BaseTest;

public class RegisterHomeScreen extends BaseTest {
    // ===== Zone 1: Element Locators =====
    private final BySelector taxItem5 = By.text("Tax Item 5");
    private final BySelector reviewOrderBtn = By.text("Review Order");

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(reviewOrderBtn), TIMEOUT_MS);
    }
    public boolean isScreenPresent() {
        return device.hasObject(reviewOrderBtn);
    }
    public void addTaxItem5() {
        waitForScreen();
        device.findObject(taxItem5).click();
    }
    public void reviewOrder() {
        waitForScreen();
        device.findObject(reviewOrderBtn).click();
    }
    public void payAndCharge() {
        device.findObject(By.text("Pay")).click();
        device.findObject(By.text("Charge")).click();
    }
}
`,
  [`${pkg}/pageobjects/ReviewOrderScreen.java`]: screen('ReviewOrderScreen', ['private final BySelector payBtn = By.text("Pay");'], ''),
  [`${pkg}/pageobjects/PaymentScreen.java`]: screen('PaymentScreen', ['private final BySelector chargeBtn = By.text("Charge");'], ''),
  [`${pkg}/pageobjects/CfdTotalsScreen.java`]: screen('CfdTotalsScreen', ['private final BySelector totalLabel = By.displayId(cfdDisplayId).text("Total");'], `    public void assertTotals() {
        waitForScreen();
        assertTotal("$10.83");
    }

    public void assertTotal(String expected) {
        device.findObject(totalLabel).getText().equals(expected);
    }
`),
  [`${pkg}/pageobjects/CfdPaymentScreen.java`]: screen('CfdPaymentScreen', ['private final BySelector doneBtn = By.text("Done");'], `    public void finalisePayment() {
        waitForScreen();
        device.findObject(doneBtn).click();
    }
`),
  [`${pkg}/pageobjects/ReceiptScreen.java`]: screen(
    'ReceiptScreen',
    ['private final BySelector printBtn = By.text("Print");', 'private final BySelector noReceiptBtn = By.text("No Receipt");'],
    `    public void print() {
        device.findObject(printBtn).click();
    }
`,
    false,
  ),
};

const TESTS: Record<string, [string, string]> = {
  HomeScreenTest: ['/** HomeScreenTest — open Register from the launcher on any device family. */', '        homeScreen.open("Register");\n        assertTrue(registerHome.isScreenPresent());'],
  ReceiptScreenTest: ['/** ReceiptScreenTest — print a receipt after a cash sale. */', '        mfd.run(registerHome::addTaxItem5);\n        mfd.run(registerHome::payAndCharge);'],
  SaleTest: ['/** SaleTest — standalone swipe sale. */', '        mfd.run(registerHome::addTaxItem5);\n        mfd.run(registerHome::reviewOrder);\n        mfd.run(registerHome::payAndCharge);'],
  TaxTest: [
    `/*
 * TaxTest — tethered (MFD + CFD)
 * Intent: verify that a taxable item rings up with the correct subtotal,
 * calculated tax and grand total on the Customer display, then completes
 * payment with a simulated swipe card loaded by Orca via Callus.
 * Safe state: starts on HomeScreen; teardown forces both devices back to HomeScreen.
 * Steps: MFD_O1 → CFD_O1 → MFD_O2 → CFD finalise.
 */`,
    '        mfd.run(registerHome::addTaxItem5);     // MFD_O1\n        mfd.run(registerHome::reviewOrder);\n        cfd.run(cfdTotals::assertTotals);       // CFD_O1\n        mfd.run(registerHome::payAndCharge);    // MFD_O2\n        cfd.run(cfdPayment::finalisePayment);   // Step 4',
  ],
  TaxTestDuo: ['/** TaxTestDuo — Station Duo: both displays on one IP. */', '        mfd.run(registerHome::addTaxItem5);\n        mfd.run(registerHome::reviewOrder);\n        assertTrue(orca.screenCompare("CFD_TOTAL"));'],
  RefundTest: ['/** RefundTest — refund the last payment. */', '        mfd.run(registerHome::addTaxItem5);'],
  DuoCfdSuite: ['/** DuoCfdSuite — CFD assertions on a Station Duo. */', '        assertTrue(orca.screenCompare("CFD_TOTAL"));'],
  DuoCheckoutTest: ['/** DuoCheckoutTest — full checkout on a Station Duo. */', '        mfd.run(registerHome::payAndCharge);\n        assertTrue(orca.screenCompare("CFD_THANK_YOU"));'],
  PrinterlessSmokeTest: ['/** PrinterlessSmokeTest — smoke test for printerless devices. */', '        homeScreen.open("Register");'],
  PaycoreMatrixTest: ['/** PaycoreMatrixTest — card matrix sweep. */', '        mfd.run(registerHome::addTaxItem5);'],
  ContactCanadaPinSaleTest: ['/** ContactCanadaPinSaleTest — Interac PIN sale (Contact Canada). */', '        mfd.run(registerHome::addTaxItem5);\n        mfd.run(registerHome::payAndCharge);'],
};
for (const [name, [header, body]] of Object.entries(TESTS)) UIA_FILES[`${pkg}/testactions/${name}.java`] = test(name, header, body);

export const BROKEN_CONFIG = `runType=standalone
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

const SWIPE = `{
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

export const PIGEON_FILES: Record<string, string> = {
  'lstr.json': `{
  "runner": "LSTR",
  "version": "3.1.4",
  "platforms": ["REST", "ANDROID", "WINDOWS", "IOS"],
  "adb": { "port": 5444, "retryConnect": 1 }
}
`,
  'runners/android/AndroidRunner.groovy': `// LSTR Android runner — robot actions over Orca, device actions over ADB
class AndroidRunner extends BaseRunner {
    def receiptScreen(device) {
        def options = adb.countReceiptOptions(device)
        return options == 5 ? 'RECEIPT_OPTIONS_5' : 'RECEIPT_OPTIONS_4'
    }
}
`,
  'runners/ios/IosRunner.groovy': `// LSTR iOS runner (Go SDK bridge)\nclass IosRunner extends BaseRunner {\n}\n`,
  'runners/rest/RestRunner.groovy': `// LSTR REST runner\nclass RestRunner extends BaseRunner {\n}\n`,
  'runners/windows/WindowsRunner.groovy': `// LSTR Windows runner\nclass WindowsRunner extends BaseRunner {\n}\n`,
  'tests/_templates/known_good_actions.json': `{
  "actions": [
    { "action": "create order",   "params": { "item": "Tax Item 5" }, "store": "orderId" },
    { "action": "review order",   "params": { "orderId": "\${orderId}" } },
    { "action": "pay",            "params": { "orderId": "\${orderId}" } },
    { "action": "card swipe",     "params": { "profile": "VISA_STD_SWIPE", "orderId": "\${orderId}" }, "store": "paymentId" },
    { "action": "select tip",     "params": { "robot": "\${ROBOT_NAME}", "screen": "TIP", "button": "No Tip" } },
    { "action": "select print",   "params": { "robot": "\${ROBOT_NAME}", "screen": "\${RECEIPT_SCREEN}" } },
    { "action": "assert home",    "params": {} }
  ]
}
`,
  'tests/go/ios_go_smoke.json': `{\n  "name": "iOS Go SDK smoke",\n  "connectionType": "WIFI",\n  "platforms": ["IOS"],\n  "actions": [\n    { "action": "assert home", "params": {} }\n  ]\n}\n`,
  'tests/sale/swipe_sale_print.json': SWIPE.replace('"store": "orderId" },\n    { "action": "review order"', '"store": "orderId" }\n    { "action": "review order"'),
  'tests/sale/tip_sale_print.json': SWIPE.replace('Swipe sale with printed receipt', 'Tip sale with printed receipt').replace('"${RECEIPT_SCREEN}"', '"RECEIPT_OPTIONS_4"'),
  'tests/sale/payment_success_compare.json': `{
  "name": "Payment success screen compare",
  "connectionType": "USB",
  "platforms": ["ANDROID"],
  "actions": [
    { "action": "screen compare", "params": { "screen": "PAYMENT_SUCCESS", "x": 208, "y": 512, "w": 304, "h": 40, "expect": "Payment Successful" } }
  ]
}
`,
  'tests/tender/windows_tender.json': `{\n  "name": "Windows custom tender",\n  "connectionType": "USB",\n  "platforms": ["WINDOWS"],\n  "actions": [\n    { "action": "create order", "params": { "item": "Tax Item 5" }, "store": "orderId" }\n  ]\n}\n`,
};

export const GORT_FILES: Record<string, string> = {
  'README.md': `# gort\n\nCard definitions, screen locations and suites for the LabSim automation lab.\n\n- \`cards/\` — EMV dip and NFC tap card definitions\n- \`config/screen-locations/\` — one JSON per Orca screen row (mm from the screen's top-left)\n`,
  'cards/emv/visa_std_dip.json': `{\n  "profile": "VISA_STD_DIP",\n  "entry": "DIP",\n  "brand": "VISA",\n  "pan": "4761 7390 0101 0010"\n}\n`,
  'cards/emv/interac_ca_dip.json': `{\n  "profile": "INTERAC_CA_DIP",\n  "entry": "DIP",\n  "brand": "INTERAC",\n  "pinRequired": true\n}\n`,
  'cards/emv/amex_matrix_dip.json': `{\n  "profile": "AMEX_MATRIX_DIP",\n  "entry": "DIP",\n  "brand": "AMEX"\n}\n`,
  'cards/emv/discover_matrix_dip.json': `{\n  "profile": "DISCOVER_MATRIX_DIP",\n  "entry": "DIP",\n  "brand": "DISCOVER"\n}\n`,
  'cards/nfc/visa_std_tap.json': `{\n  "profile": "VISA_STD_TAP",\n  "entry": "TAP",\n  "brand": "VISA"\n}\n`,
  'cards/nfc/interac_ca_tap.json': `{\n  "profile": "INTERAC_CA_TAP",\n  "entry": "TAP",\n  "brand": "INTERAC"\n}\n`,
  'config/screen-locations/MINI_3/RECEIPT_OPTIONS_4.json': `{\n  "deviceType": "MINI_3",\n  "screen": "RECEIPT_OPTIONS_4",\n  "unit": "mm",\n  "buttons": {\n    "Print": { "x": 38.5, "y": 61.0 },\n    "Email": { "x": 38.5, "y": 75.0 },\n    "Text": { "x": 38.5, "y": 89.0 },\n    "No Receipt": { "x": 38.5, "y": 103.0 }\n  }\n}\n`,
  'go-sdk/tests/sale_receipt.json': `{
  "name": "Go SDK sale with printed receipt",
  "sdk": "go",
  "capabilities": { "goSdk": true, "printer": false },
  "merchant": "\${MERCHANT}",
  "steps": [
    { "op": "connect",       "args": { "appId": "\${APP_ID}", "appSecret": "\${APP_SECRET}", "apiKey": "\${API_KEY}" } },
    { "op": "sale",          "args": { "amountCents": 1000, "cardProfile": "\${CARD_PROFILE}" } },
    { "op": "printReceipt",  "args": {} }
  ]
}
`,
  'suites/contact-canada/pin_sale.json': `{ "name": "Contact Canada Interac PIN sale",\n  "capabilities": { "deviceType": "COMPACT", "physicalTouch": true },\n  "card": "INTERAC_CA_DIP", "expectPin": true, "receipt": "RECEIPT_OPTIONS_4" }\n`,
};

export const ORCA_FILES: Record<string, string> = {
  '.jhipster/Robot.json': `{\n  "name": "Robot",\n  "fields": [\n    { "fieldName": "name", "fieldType": "String" },\n    { "fieldName": "status", "fieldType": "RobotStatus" }\n  ]\n}\n`,
  'src/main/java/com/labsim/orca/domain/enumeration/DeviceType.java': `package com.labsim.orca.domain.enumeration;

/** The DeviceType enumeration. ALL CAPS — Jenkins env vars must match exactly. */
public enum DeviceType {
    STATION_2018, STATION_2, STATION_DUO, STATION_DUO_2, STATION_DUO_3,
    MINI_2, MINI_3, MINI_4,
    FLEX_1, FLEX_2, FLEX_3, FLEX_4, FLEX_POCKET,
    COMPACT
}
`,
  'src/main/resources/config/application-prod.yml': `# Orca production profile\nspring:\n  datasource:\n    url: jdbc:mysql://localhost:3306/orca\n    username: orca\n  jpa:\n    open-in-view: false\nserver:\n  port: 8080\n`,
  'Jenkinsfile': `pipeline {\n    agent any\n    stages {\n        stage('Build') {\n            steps {\n                sh './mvnw -ntp verify'\n            }\n        }\n    }\n}\n`,
};

export const SEED_HISTORY: Record<string, { sha: string; message: string; author: string; day: number; hhmm: string }[]> = {
  'uia-remote': [
    { sha: 'b07c1e5', message: 'Initial tethered runner', author: 'morgan', day: -30, hhmm: '10:12' },
    { sha: '2f9a7b3', message: 'Add RegisterHomeScreen.waitForScreen', author: 'morgan', day: -12, hhmm: '14:40' },
    { sha: '61cc0de', message: 'HomeScreen.open(): vertical on Flex, horizontal on Mini/Station', author: 'morgan', day: -6, hhmm: '11:05' },
    { sha: '7a20f5b', message: 'Migrate CFD_TOTAL to UIA 2.3 in TaxTestDuo (#398)', author: 'morgan', day: -2, hhmm: '16:22' },
  ],
  pigeon: [
    { sha: '8d2e6b9', message: 'known_good_actions template', author: 'morgan', day: -20, hhmm: '09:30' },
    { sha: '4c1f0aa', message: 'Add tip_sale_print.json', author: 'alex', day: -4, hhmm: '13:14' },
    { sha: 'e93b0c4', message: 'LSTR: retry adb connect once', author: 'morgan', day: -1, hhmm: '17:02' },
  ],
  gort: [
    { sha: 'a11f2c3', message: 'go-sdk: sale_receipt capabilities', author: 'david', day: -14, hhmm: '10:00' },
    { sha: '5be7c90', message: 'Reorganise card definitions under cards/emv/ and cards/nfc/', author: 'jared', day: -7, hhmm: '15:45' },
    { sha: '9f02a1b', message: 'Update MINI_3 receipt coordinates (#418)', author: 'jared', day: -3, hhmm: '11:20' },
    { sha: 'c41d9e2', message: 'Add INTERAC_CA_TAP card definition', author: 'riley', day: -1, hhmm: '15:12' },
  ],
  orchestrator: [
    { sha: '77e1b3f', message: 'JHipster entity regen: ScreenCompareImage', author: 'tate', day: -9, hhmm: '09:10' },
    { sha: 'c9a0d12', message: 'Robot list status filter UI (#64)', author: 'tate', day: -5, hhmm: '16:30' },
    { sha: '3b8d17a', message: 'MerchantConfig: add App ID / App Secret / API Key (#77)', author: 'tate', day: -2, hhmm: '10:48' },
  ],
};
