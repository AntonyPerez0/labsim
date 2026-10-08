/**
 * `labsim-lab/uia-remote` — Morgan's Java / Android UI Automator 2.3 framework for standalone and
 * tethered devices (Ref §4). Standard Android/Maven layout under `app/src/{main,test,androidTest}`;
 * androidTest split into `databases`, `pageobjects`, `testactions`. Every screen class extends BaseTest
 * and has Zone 1 (locators) + Zone 2 (helpers) with the mandatory `waitForScreen()` / `isScreenPresent()`.
 */
import type { RepoSeed } from './types';
import { TESTACTIONS, TAX_TEST_DUO_PRE398, TAX_TEST_DUO } from './uiaRemoteTests';

const P = 'app/src/androidTest/java/com/labsim/uia';
export const UIA_PATHS = {
  base: `${P}/BaseTest.java`,
  orca: `${P}/OrcaClient.java`,
  db: `${P}/databases/DbHelper.java`,
  po: (cls: string): string => `${P}/pageobjects/${cls}.java`,
  test: (cls: string): string => `${P}/testactions/${cls}.java`,
  runner: 'app/src/test/java/com/labsim/uia/runner/MultiDeviceRunner.java',
  handle: 'app/src/test/java/com/labsim/uia/runner/DeviceHandle.java',
  runnerConfig: 'app/src/test/java/com/labsim/uia/runner/RunnerConfig.java',
  appReg: 'app/src/main/java/com/labsim/uia/AppRegistration.java',
};

const POM = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.labsim.automation</groupId>
    <artifactId>uia-remote</artifactId>
    <version>4.2.0</version>
    <packaging>pom</packaging>
    <name>uia-remote</name>
    <description>UI Automator 2.3 automation for standalone and tethered LabSim devices</description>

    <properties>
        <java.version>17</java.version>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <uiautomator.version>2.3.0</uiautomator.version>
        <junit.version>4.13.2</junit.version>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <modules>
        <module>app</module>
    </modules>

    <dependencies>
        <dependency>
            <groupId>androidx.test.uiautomator</groupId>
            <artifactId>uiautomator</artifactId>
            <version>\${uiautomator.version}</version>
        </dependency>
        <dependency>
            <groupId>junit</groupId>
            <artifactId>junit</artifactId>
            <version>\${junit.version}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>com.squareup.okhttp3</groupId>
            <artifactId>okhttp</artifactId>
            <version>4.12.0</version>
        </dependency>
        <dependency>
            <groupId>org.xerial</groupId>
            <artifactId>sqlite-jdbc</artifactId>
            <version>3.46.0.0</version>
        </dependency>
    </dependencies>
</project>
`;

const BUILD_GRADLE = `// Top-level build file. The project mirrors the Maven layout (pom.xml); Gradle drives the device runs.
plugins {
    id 'com.android.application' version '8.5.2' apply false
}

tasks.register('clean', Delete) {
    delete rootProject.layout.buildDirectory
}
`;

const SETTINGS_GRADLE = `rootProject.name = 'uia-remote'
include ':app'
`;

const APP_GRADLE = `plugins {
    id 'com.android.application'
}

android {
    namespace 'com.labsim.uia'
    compileSdk 34

    defaultConfig {
        applicationId 'com.labsim.uia'
        minSdk 25
        targetSdk 34
        versionCode 420
        versionName '4.2.0'
        testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner'
        // CI: Jenkins passes RUN_TYPE, MFD_IP, CFD_IP, SERIAL, DEVICE_FAMILY, THEME, KERNEL_TYPE, PORT_NUMBER …
        // Local: values come from ../config.properties (git-ignored).
        testInstrumentationRunnerArguments(loadRunArguments())
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

def loadRunArguments() {
    def env = System.getenv()
    if (env.containsKey('RUN_TYPE')) {
        return [runType: env.RUN_TYPE, merchantFacingDeviceIp: env.MFD_IP, customerFacingDeviceIp: env.CFD_IP ?: '',
                serial: env.SERIAL, deviceType: env.DEVICE_FAMILY, theme: env.THEME, kernelType: env.KERNEL_TYPE,
                portNumber: env.PORT_NUMBER, unlockPasscode: env.UNLOCK_PASSCODE, backendEnv: env.BACKEND_ENV,
                robotName: env.ROBOT_NAME, orcaUrl: env.ORCA_URL]
    }
    def props = new Properties()
    def file = rootProject.file('config.properties')
    if (file.exists()) file.withInputStream { props.load(it) }
    return props
}

dependencies {
    androidTestImplementation 'androidx.test:runner:1.6.2'
    androidTestImplementation 'androidx.test.ext:junit:1.2.1'
    androidTestImplementation 'androidx.test.uiautomator:uiautomator:2.3.0'
    androidTestImplementation 'com.squareup.okhttp3:okhttp:4.12.0'
    testImplementation 'junit:junit:4.13.2'
}
`;

const GRADLEW = `#!/bin/sh
#
# Gradle start up script for POSIX generated by Gradle.
#
APP_HOME=$( cd "\${0%"\${0##*/}"}." > /dev/null && pwd -P ) || exit
CLASSPATH=$APP_HOME/gradle/wrapper/gradle-wrapper.jar
exec java $DEFAULT_JVM_OPTS $JAVA_OPTS $GRADLE_OPTS "-Dorg.gradle.appname=gradlew" -classpath "$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "$@"
`;

const GITIGNORE = `# Local run configuration (Jenkins injects these values in CI)
config.properties

# Build output
build/
.gradle/
local.properties
*.apk

# IDE
.idea/workspace.xml
.idea/caches/
*.iml
out/
`;

export const CONFIG_EXAMPLE = `runType=tethered
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
`;

const README = `# uia-remote

Java + Android **UI Automator 2.3** framework that automates standalone *and tethered* LabSim devices
(Station-to-Mini, Mini-to-Mini, Station Duo) across native apps (Register, Orders, Authorizations, Sale,
Transactions, Setup). Used by IPX and PayCore (LabSim Dining). Author: @morgan.

## Layout (standard Android/Maven)
\`\`\`
app/src/main          production/application registration — QA never modifies this folder
app/src/test          local unit tests + the multi-device runner (runner/)
app/src/androidTest   instrumented tests that run on the device
    databases/        database connection & queries
    pageobjects/      one class per screen, pop-up or window (extends BaseTest)
    testactions/      tests: assertions stringing page-object methods together
\`\`\`

## Page objects
Every screen class extends \`BaseTest\` and has two zones:
* **Zone 1 — Element Locators**: \`BySelector\` fields unique to that view.
* **Zone 2 — Helper / Action Methods**: device quirks live here (\`HomeScreen.open(appName)\` scrolls vertically on a
  Flex, horizontally on a Mini or Station).

Mandatory on every screen class: \`waitForScreen()\` (block until the screen has rendered —
\`device.wait(Until.hasObject(<Zone 1 locator>), TIMEOUT_MS)\`) and \`isScreenPresent()\`.

## Multi-device trick
UI Automator talks to ONE device at a time. Screen definitions live in androidTest, the runner lives in
test, and the runner hops between device handles: MFD runs method X, focus shifts to the CFD for method Y,
then back (see \`TaxTest\`: MFD_O1 → CFD_O1 → MFD_O2 → CFD finalise).

## Running locally
1. \`cp config.properties.example config.properties\` and fill it in for your rig (Station Duo: both IPs equal).
   \`theme=avocado\`, \`kernelType=CPA\`, \`portNumber=5444\` are locked. **Never 5555** — that is the ADB default
   and it will find a coworker's desk device.
2. Set the rig to **Reserved** in Orca before you press ▶ (Jenkins will otherwise take it mid-run).
3. Run the test class from IntelliJ. Set the rig back to Available when done.

In CI nobody edits config.properties: Jenkins injects everything (ALL CAPS env vars).
`;

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="uia-remote" />
</manifest>
`;

const APP_REGISTRATION = `package com.labsim.uia;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Application registration (production code). Owned by the app team: QA never modifies app/src/main.
 */
public final class AppRegistration {

    private final List<String> registry = new ArrayList<>();

    public AppRegistration() {
        registry.add("Register");
        registry.add("Orders");
        registry.add("Transactions");
        registry.add("Authorizations");
        registry.add("Sale");
        registry.add("Setup");
    }

    public List<String> apps() {
        return Collections.unmodifiableList(registry);
    }
}
`;

const MULTI_DEVICE_RUNNER = `package com.labsim.uia.runner;

import com.labsim.uia.pageobjects.CfdPaymentScreen;
import com.labsim.uia.pageobjects.CfdTotalsScreen;
import com.labsim.uia.pageobjects.RegisterHomeScreen;

/**
 * MultiDeviceRunner — drives a tethered setup (MFD + CFD, or a Station Duo) from one JVM.
 */
public final class MultiDeviceRunner {

    public static void main(String[] args) {
        RunnerConfig config = RunnerConfig.load(args.length > 0 ? args[0] : "config.properties");
        RegisterHomeScreen registerHome = new RegisterHomeScreen();
        CfdTotalsScreen cfdTotals = new CfdTotalsScreen();
        CfdPaymentScreen cfdPayment = new CfdPaymentScreen();

        // UI Automator talks to ONE device at a time, so we hop between handles.
        DeviceHandle mfd = DeviceHandle.connect(config.merchantFacingDeviceIp(), config.portNumber());
        DeviceHandle cfd = DeviceHandle.connect(config.customerFacingDeviceIp(), config.portNumber());

        mfd.run(registerHome::addTaxItem5);     // MFD_O1
        mfd.run(registerHome::reviewOrder);
        cfd.run(cfdTotals::assertTotals);       // CFD_O1
        mfd.run(registerHome::payAndCharge);    // MFD_O2
        cfd.run(cfdPayment::finalisePayment);   // Step 4
    }

    private MultiDeviceRunner() {
    }
}
`;

const DEVICE_HANDLE = `package com.labsim.uia.runner;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * One ADB connection (ip:port). The runner switches focus between handles; every page-object call runs
 * against the handle's device only.
 */
public final class DeviceHandle {

    private final String target;

    private DeviceHandle(String target) {
        this.target = target;
    }

    /**
     * adb connect ip:port. If the device refuses and the local ADB server already knows a device, fall back
     * to the first one (convenient on a desk with one phone, dangerous in an office: portNumber=5555 reaches
     * coworkers' desk devices — that is why the lab locks portNumber to 5444).
     */
    public static DeviceHandle connect(String ip, int port) {
        String wanted = ip + ":" + port;
        if (adb("connect", wanted).startsWith("connected to") || adb("connect", wanted).startsWith("already connected")) {
            return new DeviceHandle(wanted);
        }
        System.out.println("connect " + wanted + " … refused");
        List<String> known = devices();
        if (!known.isEmpty()) {
            System.out.println("falling back to first known device: " + known.get(0));
            return new DeviceHandle(known.get(0));
        }
        throw new DeviceConnectionException("cannot connect to " + wanted + " (Connection refused)");
    }

    /** Run one page-object method on this handle's device. */
    public void run(Runnable step) {
        System.setProperty("uia.target", target);
        step.run();
    }

    public String target() {
        return target;
    }

    private static List<String> devices() {
        List<String> out = new ArrayList<>();
        for (String line : adb("devices").split("\\n")) {
            if (line.endsWith("\\tdevice")) {
                out.add(line.substring(0, line.indexOf('\\t')));
            }
        }
        return out;
    }

    private static String adb(String... args) {
        List<String> cmd = new ArrayList<>();
        cmd.add("adb");
        for (String a : args) {
            cmd.add(a);
        }
        try {
            Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                String line;
                while ((line = r.readLine()) != null) {
                    sb.append(line).append('\\n');
                }
            }
            p.waitFor();
            return sb.toString().trim();
        } catch (IOException | InterruptedException e) {
            throw new DeviceConnectionException("adb failed: " + e.getMessage());
        }
    }

    /** Thrown when no device can be reached. */
    public static final class DeviceConnectionException extends RuntimeException {
        public DeviceConnectionException(String message) {
            super(message);
        }
    }
}
`;

const RUNNER_CONFIG = `package com.labsim.uia.runner;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Local configuration (config.properties). In CI Jenkins injects the same values as ALL CAPS env vars.
 * theme, kernelType and portNumber are locked by the lab: avocado / CPA / 5444.
 */
public final class RunnerConfig {

    private final Properties props;

    private RunnerConfig(Properties props) {
        this.props = props;
    }

    public static RunnerConfig load(String path) {
        Properties p = new Properties();
        try (InputStream in = new FileInputStream(path)) {
            p.load(in);
        } catch (IOException e) {
            throw new IllegalStateException("config.properties not found — copy config.properties.example");
        }
        RunnerConfig c = new RunnerConfig(p);
        c.validate();
        return c;
    }

    private void validate() {
        if (isTethered() && !props.containsKey("customerFacingDeviceIp")) {
            throw new IllegalStateException("config.properties missing key 'customerFacingDeviceIp'");
        }
        String theme = props.getProperty("theme", "");
        if (!"avocado".equals(theme)) {
            throw new IllegalStateException("Unsupported theme \\"" + theme + "\\" — only \\"avocado\\" is supported");
        }
        String kernel = props.getProperty("kernelType", "");
        if (!"CPA".equals(kernel)) {
            throw new IllegalStateException("Unsupported kernelType \\"" + kernel + "\\" — use \\"CPA\\"");
        }
        String family = props.getProperty("deviceType", "");
        if (!family.matches("Mini|Flex|Station|Compact")) {
            throw new IllegalArgumentException("unknown deviceType \\"" + family + "\\" (expected Mini, Flex or Station)");
        }
        String runType = props.getProperty("runType", "");
        if (!"tethered".equals(runType) && !"standalone".equals(runType)) {
            throw new IllegalStateException("Unsupported runType \\"" + runType + "\\"");
        }
        try {
            Integer.parseInt(props.getProperty("portNumber", ""));
        } catch (NumberFormatException e) {
            throw new IllegalStateException("Invalid portNumber \\"" + props.getProperty("portNumber", "") + "\\"");
        }
    }

    public boolean isTethered() {
        return "tethered".equals(props.getProperty("runType"));
    }

    public String merchantFacingDeviceIp() {
        return props.getProperty("merchantFacingDeviceIp");
    }

    public String customerFacingDeviceIp() {
        return props.getProperty("customerFacingDeviceIp");
    }

    public int portNumber() {
        return Integer.parseInt(props.getProperty("portNumber"));
    }

    public String robotName() {
        return props.getProperty("robotName");
    }
}
`;

const BASE_TEST = `package com.labsim.uia;

import android.os.Bundle;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.Direction;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import org.junit.Before;

/**
 * BaseTest — global setup, teardown helpers and instance variables shared by every screen class
 * (page object) and every test class. Values come from Jenkins env vars in CI and from
 * config.properties for local runs.
 */
public abstract class BaseTest {

    protected static final long TIMEOUT_MS = 10000;
    protected static final int MAX_SCROLLS = 5;

    /** config.properties deviceType = the family, not the Orca enum. */
    public enum DeviceType { MINI, FLEX, STATION, COMPACT }

    /** A device handle the runner can switch focus to (see test/…/runner/DeviceHandle). */
    public interface Handle {
        void run(Runnable step);
    }

    protected final UiDevice device;
    protected final DeviceType deviceType;
    protected final OrcaClient orca;
    protected final Bundle config;
    /** Secondary display id of a Station Duo (1); 0 when the CFD is its own device. */
    protected final int cfdDisplayId;
    protected Handle mfd;
    protected Handle cfd;

    protected BaseTest() {
        config = InstrumentationRegistry.getArguments();
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        deviceType = DeviceType.valueOf(config.getString("deviceType", "Flex").toUpperCase());
        orca = new OrcaClient(config.getString("orcaUrl", "http://orca.lab.local:8080"));
        String mfdIp = config.getString("merchantFacingDeviceIp", "");
        cfdDisplayId = mfdIp.equals(config.getString("customerFacingDeviceIp", "")) ? 1 : 0;
        mfd = Handles.mfd();
        cfd = Handles.cfd();
    }

    @Before
    public void wakeAndUnlock() throws Exception {
        device.wakeUp();
        if (device.hasObject(By.res("com.labsim.launcher:id/lock_clock"))) {
            device.executeShellCommand("input text " + config.getString("unlockPasscode", "0000"));
            device.pressEnter();
        }
    }

    /** Package of a LabSim app ("Register" → com.labsim.register). */
    protected static String appPackage(String appName) {
        return "com.labsim." + appName.toLowerCase().replace(" ", "");
    }

    protected boolean isTethered() {
        return "tethered".equals(config.getString("runType", "standalone"));
    }

    protected void scrollVerticallyTo(String appName) {
        BySelector app = By.text(appName);
        for (int i = 0; i < MAX_SCROLLS && !device.hasObject(app); i++) {
            UiObject2 launcher = device.findObject(By.res("com.labsim.launcher:id/app_grid"));
            launcher.scroll(Direction.DOWN, 0.8f);
        }
        if (!device.hasObject(app)) {
            throw new AssertionError("App '" + appName + "' not found on HomeScreen");
        }
    }

    protected void scrollHorizontallyTo(String appName) {
        BySelector app = By.text(appName);
        for (int i = 0; i < MAX_SCROLLS && !device.hasObject(app); i++) {
            UiObject2 launcher = device.findObject(By.res("com.labsim.launcher:id/app_pager"));
            launcher.scroll(Direction.RIGHT, 0.8f);
        }
        if (!device.hasObject(app)) {
            throw new AssertionError("App '" + appName + "' not found on HomeScreen");
        }
    }

    protected String textOf(BySelector selector) {
        device.wait(Until.hasObject(selector), TIMEOUT_MS);
        return device.findObject(selector).getText();
    }

    /** Handles registered by the multi-device runner before the test starts. */
    public static final class Handles {
        private static Handle mfdHandle = Runnable::run;
        private static Handle cfdHandle = Runnable::run;

        public static void register(Handle mfdHandle, Handle cfdHandle) {
            Handles.mfdHandle = mfdHandle;
            Handles.cfdHandle = cfdHandle;
        }

        static Handle mfd() {
            return mfdHandle;
        }

        static Handle cfd() {
            return cfdHandle;
        }

        private Handles() {
        }
    }
}
`;

const ORCA_CLIENT = `package com.labsim.uia;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Thin client for Orca's REST API: card loads (Orca → Callus → Collis/SmartStripe probe), xy_touch and the
 * legacy Screen Compare (webcam → crop → Tesseract → boolean). Screen Compare is being phased out:
 * UI Automator 2.3 can see the Station Duo's customer display natively.
 */
public final class OrcaClient {

    private static final MediaType JSON = MediaType.get("application/json");
    private final OkHttpClient http = new OkHttpClient();
    private final String baseUrl;

    public OrcaClient(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public void loadSwipeCard(String robot, String profile) {
        post("/api/card/swipe", "{\\"robot\\":\\"" + robot + "\\",\\"profile\\":\\"" + profile + "\\"}");
    }

    public void dip(String robot, String profile) {
        post("/api/card/dip", "{\\"robot\\":\\"" + robot + "\\",\\"profile\\":\\"" + profile + "\\"}");
    }

    public void xyTouch(String robot, String screen, String button) {
        post("/api/xy_touch", "{\\"robot\\":\\"" + robot + "\\",\\"screen\\":\\"" + screen + "\\",\\"button\\":\\"" + button + "\\"}");
    }

    /** @deprecated legacy OCR check — use a UIA 2.3 displayId locator instead. */
    @Deprecated
    public boolean screenCompare(String name) {
        return post("/api/screen-compare/" + name + "/test", "{}").contains("\\"match\\":true");
    }

    private String post(String path, String body) {
        Request req = new Request.Builder().url(baseUrl + path).post(RequestBody.create(body, JSON)).build();
        try (Response res = http.newCall(req).execute()) {
            String text = res.body() != null ? res.body().string() : "";
            if (!res.isSuccessful()) {
                throw new IllegalStateException("[orca] " + res.code() + " " + text);
            }
            return text;
        } catch (java.io.IOException e) {
            throw new IllegalStateException("[orca] " + e.getMessage(), e);
        }
    }
}
`;

const DB_HELPER = `package com.labsim.uia.databases;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * DbHelper — database connection and query logic used by tests (e.g. reading the last order a test created
 * from the device's local order store pulled over ADB).
 */
public final class DbHelper implements AutoCloseable {

    private final Connection connection;

    public DbHelper(String sqlitePath) throws SQLException {
        connection = DriverManager.getConnection("jdbc:sqlite:" + sqlitePath);
    }

    public long lastOrderTotalCents() throws SQLException {
        try (PreparedStatement st = connection.prepareStatement("SELECT total FROM orders ORDER BY created DESC LIMIT 1");
             ResultSet rs = st.executeQuery()) {
            return rs.next() ? rs.getLong(1) : -1;
        }
    }

    @Override
    public void close() throws SQLException {
        connection.close();
    }
}
`;

function po(cls: string, doc: string, imports: string[], body: string): string {
  return `package com.labsim.uia.pageobjects;

${imports.map((i) => `import ${i};`).join('\n')}

/** ${doc} */
public class ${cls} extends BaseTest {
${body}}
`;
}
const IMP = ['androidx.test.uiautomator.By', 'androidx.test.uiautomator.BySelector', 'androidx.test.uiautomator.Until', 'com.labsim.uia.BaseTest'];

export const HOME_SCREEN = po(
  'HomeScreen',
  'HomeScreen: LabSim launcher. Every test starts and ends here.',
  IMP,
  `
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
            scrollVerticallyTo(appName);      // Flex: vertical
        } else {                              // Mini, Station
            scrollHorizontallyTo(appName);    // horizontal
        }
        device.findObject(By.text(appName)).click();
        device.wait(Until.hasObject(By.pkg(appPackage(appName)).depth(0)), TIMEOUT_MS);   // launched and drawn
    }

    public void goHome() {
        device.pressHome();
        waitForScreen();
    }
`,
);

/** HomeScreen before 61cc0de: one scroll direction for every family. */
export const HOME_SCREEN_V1 = HOME_SCREEN.replace(
  `        if (deviceType == DeviceType.FLEX) {
            scrollVerticallyTo(appName);      // Flex: vertical
        } else {                              // Mini, Station
            scrollHorizontallyTo(appName);    // horizontal
        }
`,
  `        scrollHorizontallyTo(appName);
`,
);

const LOCK_SCREEN = po(
  'LockScreen',
  'LockScreen: passcode lock shown after wake.',
  [...IMP],
  `
    // ===== Zone 1: Element Locators =====
    private final BySelector clock = By.res("com.labsim.launcher:id/lock_clock");
    private final BySelector passcodeField = By.res("com.labsim.launcher:id/passcode");

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(clock), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(clock);
    }

    public void unlock() {
        if (!isScreenPresent()) {
            return;
        }
        device.findObject(passcodeField).setText(config.getString("unlockPasscode", "0000"));
        device.pressEnter();
    }
`,
);

const NAVIGATION_BAR = po(
  'NavigationBar',
  'NavigationBar: the system Back / Home bar.',
  IMP,
  `
    // ===== Zone 1: Element Locators =====
    private final BySelector homeBtn = By.res("com.android.systemui:id/home");
    private final BySelector backBtn = By.res("com.android.systemui:id/back");

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(homeBtn), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(homeBtn);
    }

    public void home() {
        waitForScreen();
        device.findObject(homeBtn).click();
    }

    public void back() {
        waitForScreen();
        device.findObject(backBtn).click();
    }
`,
);

/** RegisterHomeScreen — factory (GP INC32's file with waitForScreen implemented). */
export const REGISTER_HOME_SCREEN = `package com.labsim.uia.pageobjects;

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
    public void reviewOrder() {
        waitForScreen();
        device.findObject(reviewOrderBtn).click();
    }
    public void addTaxItem5() {
        waitForScreen();
        device.findObject(taxItem5).click();
    }
    public void payAndCharge() {
        new ReviewOrderScreen().pay();
        new PaymentScreen().charge();
    }
}
`;

/** GP INC32's file (fault `uia.waitForScreenStub`): empty stub, reviewOrder() clicks at line 21. */
export const REGISTER_HOME_SCREEN_STUB = `package com.labsim.uia.pageobjects;

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
        // TODO
    }
    public boolean isScreenPresent() {
        return device.hasObject(reviewOrderBtn);
    }
    public void reviewOrder() {
        device.findObject(reviewOrderBtn).click();
    }
    public void addTaxItem5() {
        device.findObject(taxItem5).click();
    }
    public void payAndCharge() {
        new ReviewOrderScreen().pay();
        new PaymentScreen().charge();
    }
}
`;

const simplePo = (cls: string, doc: string, locators: [string, string][], waitOn: string, actions: string): string =>
  po(
    cls,
    doc,
    IMP,
    `
    // ===== Zone 1: Element Locators =====
${locators.map(([n, sel]) => `    private final BySelector ${n} = ${sel};`).join('\n')}

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(${waitOn}), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(${waitOn});
    }
${actions}`,
  );

const REVIEW_ORDER_SCREEN = simplePo('ReviewOrderScreen', 'ReviewOrderScreen: order lines, Back, Pay.', [['payBtn', 'By.text("Pay")'], ['backBtn', 'By.text("Back")']], 'payBtn', `
    public void pay() {
        waitForScreen();
        device.findObject(payBtn).click();
    }

    public void back() {
        waitForScreen();
        device.findObject(backBtn).click();
    }
`);

const PAYMENT_SCREEN = simplePo('PaymentScreen', 'PaymentScreen: tender selection (Charge / Cash / Other).', [['chargeBtn', 'By.text("Charge")'], ['cashBtn', 'By.text("Cash")']], 'chargeBtn', `
    public void charge() {
        waitForScreen();
        device.findObject(chargeBtn).click();
    }

    public void cash() {
        waitForScreen();
        device.findObject(cashBtn).click();
    }
`);

const TIP_SCREEN = simplePo('TipScreen', 'TipScreen: customer tip selection.', [['noTipBtn', 'By.text("No Tip")'], ['customBtn', 'By.text("Custom")']], 'noTipBtn', `
    public void noTip() {
        waitForScreen();
        device.findObject(noTipBtn).click();
    }

    public void selectTip(int percent) {
        waitForScreen();
        device.findObject(By.text(percent + "%")).click();
    }
`);

/** CfdTotalsScreen before #398 (separate CFD device only). */
export const CFD_TOTALS_PRE398 = po(
  'CfdTotalsScreen',
  'CfdTotalsScreen: customer display totals (Subtotal, Tax, TOTAL) on a tethered CFD.',
  IMP,
  `
    // ===== Zone 1: Element Locators =====
    private final BySelector subtotal = By.textStartsWith("Subtotal");
    private final BySelector tax = By.textStartsWith("Tax");
    private final BySelector total = By.textStartsWith("TOTAL");

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(total), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(total);
    }

    /** CFD_O1: Tax Item 5 = $10.00 at 8.25 % → $0.83 tax, $10.83 total. */
    public void assertTotals() {
        waitForScreen();
        check("subtotal", "$10.00", textOf(subtotal));
        check("tax", "$0.83", textOf(tax));
        check("total", "$10.83", textOf(total));
    }

    private void check(String what, String expected, String label) {
        String actual = label.substring(label.lastIndexOf(' ') + 1);
        if (!expected.equals(actual)) {
            throw new AssertionError("[CFD_O1] " + what + " expected " + expected + " but was " + actual);
        }
    }
`,
);

/** CfdTotalsScreen after #398: displayId locators (UI Automator 2.3) — works on a Duo's secondary display too. */
export const CFD_TOTALS = po(
  'CfdTotalsScreen',
  'CfdTotalsScreen: customer display totals. UIA 2.3 displayId locators: a separate CFD device (display 0) or a Station Duo\'s secondary display (cfdDisplayId = 1).',
  IMP,
  `
    // ===== Zone 1: Element Locators (CFD = secondary display on a Duo) =====
    private final BySelector subtotal = By.textStartsWith("Subtotal").displayId(cfdDisplayId);
    private final BySelector tax = By.textStartsWith("Tax").displayId(cfdDisplayId);
    private final BySelector total = By.textStartsWith("TOTAL").displayId(cfdDisplayId);

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(total), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(total);
    }

    /** CFD_O1: Tax Item 5 = $10.00 at 8.25 % → $0.83 tax, $10.83 total. */
    public void assertTotals() {
        waitForScreen();
        check("subtotal", "$10.00", textOf(subtotal));
        check("tax", "$0.83", textOf(tax));
        check("total", "$10.83", textOf(total));
    }

    public void assertTotal(String expected) {
        waitForScreen();
        check("total", expected, textOf(total));
    }

    private void check(String what, String expected, String label) {
        String actual = label.substring(label.lastIndexOf(' ') + 1);
        if (!expected.equals(actual)) {
            throw new AssertionError("[CFD_O1] " + what + " expected " + expected + " but was " + actual);
        }
    }
`,
);

const CFD_PAYMENT_SCREEN = po(
  'CfdPaymentScreen',
  'CfdPaymentScreen: payment prompt on the customer display; finalises the payment (Step 4).',
  IMP,
  `
    // ===== Zone 1: Element Locators =====
    private final BySelector prompt = By.text("Tap, insert or swipe").displayId(cfdDisplayId);
    private final BySelector noTip = By.text("No Tip").displayId(cfdDisplayId);
    private final BySelector approved = By.text("Payment Successful").displayId(cfdDisplayId);
    private final BySelector noReceipt = By.text("No Receipt").displayId(cfdDisplayId);
    private final BySelector thankYou = By.text("Thank you").displayId(cfdDisplayId);

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(prompt), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(prompt);
    }

    /** The swipe card armed by Orca/Callus fires when the prompt appears. */
    public void finalisePayment() {
        waitForScreen();
        device.wait(Until.hasObject(noTip), 30000);
        device.findObject(noTip).click();
        device.wait(Until.hasObject(approved), 30000);
        device.wait(Until.hasObject(noReceipt), TIMEOUT_MS);
        device.findObject(noReceipt).click();
        device.wait(Until.hasObject(thankYou), TIMEOUT_MS);
    }
`,
);

/** ReceiptScreen — factory (correct). Fault `uia.missingScreenMethods` removes the mandatory methods. */
export const RECEIPT_SCREEN = simplePo(
  'ReceiptScreen',
  'ReceiptScreen: receipt options (4 options, or 5 with "Scan for receipt" when the QR feature is on).',
  [['printBtn', 'By.text("Print")'], ['noReceiptBtn', 'By.text("No Receipt")'], ['scanBtn', 'By.text("Scan for receipt")']],
  'noReceiptBtn',
  `
    public int optionCount() {
        waitForScreen();
        return device.hasObject(scanBtn) ? 5 : 4;
    }

    public void noReceipt() {
        waitForScreen();
        device.findObject(noReceiptBtn).click();
    }

    public void print() {
        waitForScreen();
        device.findObject(printBtn).click();
    }
`,
);

export const UIA_PAGEOBJECTS: Record<string, string> = {
  HomeScreen: HOME_SCREEN,
  LockScreen: LOCK_SCREEN,
  NavigationBar: NAVIGATION_BAR,
  RegisterHomeScreen: REGISTER_HOME_SCREEN,
  ReviewOrderScreen: REVIEW_ORDER_SCREEN,
  PaymentScreen: PAYMENT_SCREEN,
  TipScreen: TIP_SCREEN,
  CfdTotalsScreen: CFD_TOTALS,
  CfdPaymentScreen: CFD_PAYMENT_SCREEN,
  ReceiptScreen: RECEIPT_SCREEN,
};

/** The stub RegisterHomeScreen before 2f9a7b3. */
const REGISTER_V1 = REGISTER_HOME_SCREEN_STUB;

function initialFiles(): Record<string, string> {
  const files: Record<string, string> = {
    'pom.xml': POM,
    'build.gradle': BUILD_GRADLE,
    'settings.gradle': SETTINGS_GRADLE,
    gradlew: GRADLEW,
    '.gitignore': GITIGNORE,
    'config.properties.example': CONFIG_EXAMPLE,
    'README.md': README,
    'app/build.gradle': APP_GRADLE,
    'app/src/main/AndroidManifest.xml': MANIFEST,
    [UIA_PATHS.appReg]: APP_REGISTRATION,
    [UIA_PATHS.runner]: MULTI_DEVICE_RUNNER,
    [UIA_PATHS.handle]: DEVICE_HANDLE,
    [UIA_PATHS.runnerConfig]: RUNNER_CONFIG,
    [UIA_PATHS.base]: BASE_TEST,
    [UIA_PATHS.orca]: ORCA_CLIENT,
    [UIA_PATHS.db]: DB_HELPER,
  };
  for (const [cls, text] of Object.entries(UIA_PAGEOBJECTS)) files[UIA_PATHS.po(cls)] = text;
  files[UIA_PATHS.po('HomeScreen')] = HOME_SCREEN_V1;
  files[UIA_PATHS.po('RegisterHomeScreen')] = REGISTER_V1;
  files[UIA_PATHS.po('CfdTotalsScreen')] = CFD_TOTALS_PRE398;
  for (const [cls, text] of Object.entries(TESTACTIONS)) files[UIA_PATHS.test(cls)] = text;
  files[UIA_PATHS.test('TaxTestDuo')] = TAX_TEST_DUO_PRE398;
  return files;
}

const PR398_CHANGES = {
  [UIA_PATHS.test('TaxTestDuo')]: TAX_TEST_DUO,
  [UIA_PATHS.po('CfdTotalsScreen')]: CFD_TOTALS,
};

export const UIA_212_FILE = `package com.labsim.uia.pageobjects;

public class ReceiptOptionsScreen extends BaseTest {
    // ===== Zone 1: Element Locators =====
    private final BySelector noReceipt = By.text("No Receipt");
    private final BySelector print = By.text("Print");

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(noReceipt), TIMEOUT_MS);
    }
    public void selectNoReceipt() {
        waitForScreen();
        device.findObject(noReceipt).click();
    }
}
`;

export const UIA_REMOTE: RepoSeed = {
  id: 'uia-remote',
  remoteUrl: 'git@github.com:labsim-lab/uia-remote.git',
  description: 'Java UI Automator framework for standalone and tethered devices',
  protectedMain: false,
  commits: [
    { short: 'b07c1e5', message: 'Initial tethered runner', author: 'morgan', at: '2026-06-15 16:40', changes: initialFiles() },
    { short: '2f9a7b3', message: 'Add RegisterHomeScreen.waitForScreen', author: 'morgan', at: '2026-07-21 10:02', changes: { [UIA_PATHS.po('RegisterHomeScreen')]: REGISTER_HOME_SCREEN } },
    { short: '61cc0de', message: 'HomeScreen.open(): vertical on Flex, horizontal on Mini/Station', author: 'morgan', at: '2026-08-19 13:27', changes: { [UIA_PATHS.po('HomeScreen')]: HOME_SCREEN } },
    { short: '7a20f5b', message: 'Migrate CFD_TOTAL to UIA 2.3 in TaxTestDuo (#398)', author: 'morgan', at: '2026-09-30 11:15', changes: PR398_CHANGES },
  ],
  prs: [
    {
      number: 212,
      title: '[AI eval] Generated tests for ReceiptScreen',
      author: 'claude-eval',
      body: 'Automated test generation evaluation (corporate AI initiative). Adds a page object for the receipt options screen generated from the device hierarchy dump. Please review before merging.',
      sourceBranch: 'claude-eval/receipt-options-screen',
      state: 'closed',
      createdAt: '2026-09-10 14:00',
      branchCommits: [
        {
          short: '3c5d812',
          message: 'Generate ReceiptOptionsScreen page object',
          author: 'claude-eval',
          at: '2026-09-10 13:58',
          changes: { [UIA_PATHS.po('ReceiptOptionsScreen')]: UIA_212_FILE },
        },
      ],
      baseShort: '61cc0de',
      reviewers: ['morgan'],
      approvals: [],
      comments: [],
      verdict: 'NONE',
      checks: 'success',
    },
    {
      number: 398,
      title: 'Migrate CFD_TOTAL to UIA 2.3 in TaxTestDuo',
      author: 'morgan',
      body: 'UI Automator 2.3 locates elements on the Duo\'s secondary display natively (`displayId`). Replaces the brittle OCR Screen Compare `CFD_TOTAL` in TaxTestDuo with `cfdTotals.assertTotal("$10.83")`. `DuoCfdSuite` and `DuoCheckoutTest` still use OCR — follow-ups.',
      sourceBranch: 'morgan/duo-cfd-total-uia23',
      state: 'merged',
      createdAt: '2026-09-29 17:20',
      mergedAt: '2026-09-30 11:15',
      branchCommits: [],
      mergeShort: '7a20f5b',
      reviewers: ['alex'],
      approvals: ['alex'],
      comments: [],
      verdict: 'APPROVED',
      checks: 'success',
    },
  ],
};
