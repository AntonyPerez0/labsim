/** uia-remote `app/src/androidTest/java/com/labsim/uia/testactions/*.java` (Sim §2.12, §3.19.4). */

const HEAD = (imports: string[]): string => `package com.labsim.uia.testactions;

${imports.map((i) => `import ${i};`).join('\n')}
`;
const COMMON = ['com.labsim.uia.BaseTest', 'org.junit.After', 'org.junit.Before', 'org.junit.Test'];
const po = (...cls: string[]): string[] => cls.map((c) => `com.labsim.uia.pageobjects.${c}`);

export const TAX_TEST_HEADER = `/*
 * TaxTest — tethered (MFD + CFD)
 * Intent: verify that a taxable item rings up with the correct subtotal,
 * calculated tax and grand total on the Customer display, then completes
 * payment with a simulated swipe card loaded by Orca via Callus.
 * Safe state: starts on HomeScreen; teardown forces both devices back to HomeScreen.
 * Steps: MFD_O1 → CFD_O1 → MFD_O2 → CFD finalise.
 */`;

export const TAX_TEST = `${TAX_TEST_HEADER}
${HEAD([...COMMON, ...po('CfdPaymentScreen', 'CfdTotalsScreen', 'HomeScreen', 'LockScreen', 'RegisterHomeScreen'), 'static org.junit.Assert.assertTrue'])}
public class TaxTest extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final LockScreen lockScreen = new LockScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();
    private final CfdTotalsScreen cfdTotals = new CfdTotalsScreen();
    private final CfdPaymentScreen cfdPayment = new CfdPaymentScreen();

    @Before
    public void setUp() {
        assertTrue("TaxTest requires a tethered rig (MFD/CFD)", isTethered());
        mfd.run(lockScreen::unlock);
        cfd.run(lockScreen::unlock);
        mfd.run(() -> assertTrue(homeScreen.isScreenPresent()));
        cfd.run(() -> assertTrue(homeScreen.isScreenPresent()));
    }

    @Test
    public void testTax() {
        // MFD_O1 — Merchant display: Register, Tax Item 5, Review Order, Orca → Callus swipe card
        mfd.run(() -> homeScreen.open("Register"));
        mfd.run(registerHome::addTaxItem5);
        mfd.run(registerHome::reviewOrder);
        orca.loadSwipeCard(config.getString("robotName"), "VISA_STD_SWIPE");

        // CFD_O1 — Customer display: subtotal, tax, total
        cfd.run(cfdTotals::assertTotals);

        // MFD_O2 — Merchant display: Pay, Charge
        mfd.run(registerHome::payAndCharge);

        // Step 4 — Customer display finalises the payment prompt
        cfd.run(cfdPayment::finalisePayment);
    }

    @After
    public void tearDown() {
        mfd.run(homeScreen::goHome);
        cfd.run(homeScreen::goHome);
    }
}
`;

/** TaxTest without its teardown (fault `uia.teardownMissing`, INC35): the header still promises one. */
export const TAX_TEST_NO_TEARDOWN = TAX_TEST.replace(
  `
    @After
    public void tearDown() {
        mfd.run(homeScreen::goHome);
        cfd.run(homeScreen::goHome);
    }
`,
  '',
);

const duoBody = (cfdCheck: string): string => `/*
 * TaxTestDuo — Station Duo (one terminal, two displays: MFD = display 0, CFD = display 1)
 * config.properties: merchantFacingDeviceIp == customerFacingDeviceIp, runType=tethered, deviceType=Station.
 * Safe state: starts on HomeScreen; teardown returns both displays to their idle screens.
 */
${HEAD([...COMMON, ...po('CfdPaymentScreen', 'CfdTotalsScreen', 'HomeScreen', 'RegisterHomeScreen'), 'static org.junit.Assert.assertTrue'])}
public class TaxTestDuo extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();
    private final CfdTotalsScreen cfdTotals = new CfdTotalsScreen();
    private final CfdPaymentScreen cfdPayment = new CfdPaymentScreen();

    @Before
    public void setUp() {
        assertTrue("TaxTestDuo requires a tethered rig (MFD/CFD)", isTethered());
        mfd.run(() -> assertTrue(homeScreen.isScreenPresent()));
    }

    @Test
    public void testTaxDuo() {
        mfd.run(() -> homeScreen.open("Register"));
        mfd.run(registerHome::addTaxItem5);
        mfd.run(registerHome::reviewOrder);
        orca.loadSwipeCard(config.getString("robotName"), "VISA_STD_SWIPE");
${cfdCheck}
        mfd.run(registerHome::payAndCharge);
        cfd.run(cfdPayment::finalisePayment);
    }

    @After
    public void tearDown() {
        mfd.run(homeScreen::goHome);
        cfd.run(homeScreen::goHome);
    }
}
`;
export const TAX_TEST_DUO_PRE398 = duoBody('        assertTrue(orca.screenCompare("CFD_TOTAL"));');
export const TAX_TEST_DUO = duoBody('        cfd.run(() -> cfdTotals.assertTotal("$10.83"));');

const SALE_TEST = `/*
 * SaleTest — standalone card sale with Tax Item 5 and no receipt.
 * Safe state: starts on HomeScreen; teardown presses Home.
 */
${HEAD([...COMMON, ...po('HomeScreen', 'PaymentScreen', 'ReceiptScreen', 'RegisterHomeScreen', 'ReviewOrderScreen', 'TipScreen'), 'static org.junit.Assert.assertTrue'])}
public class SaleTest extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();
    private final ReviewOrderScreen reviewOrder = new ReviewOrderScreen();
    private final PaymentScreen payment = new PaymentScreen();
    private final TipScreen tip = new TipScreen();
    private final ReceiptScreen receipt = new ReceiptScreen();

    @Before
    public void setUp() {
        assertTrue(homeScreen.isScreenPresent());
    }

    @Test
    public void testSale() {
        homeScreen.open("Register");
        registerHome.addTaxItem5();
        registerHome.reviewOrder();
        reviewOrder.pay();
        payment.charge();
        orca.dip(config.getString("robotName"), config.getString("cardProfile", "VISA_STD_SWIPE"));
        tip.noTip();
        receipt.noReceipt();
    }

    @After
    public void tearDown() {
        homeScreen.goHome();
    }
}
`;

const HOME_SCREEN_TEST = `/*
 * HomeScreenTest — opens Register, Orders and Setup from the launcher and returns home after each.
 * Exercises HomeScreen.open(): vertical scrolling on a Flex, horizontal on a Mini or Station.
 */
${HEAD([...COMMON, ...po('HomeScreen'), 'static org.junit.Assert.assertTrue'])}
public class HomeScreenTest extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();

    @Before
    public void setUp() {
        assertTrue(homeScreen.isScreenPresent());
    }

    @Test
    public void testHomeScreen() {
        for (String app : new String[] {"Register", "Orders", "Setup"}) {
            homeScreen.open(app);
            homeScreen.goHome();
            assertTrue(homeScreen.isScreenPresent());
        }
    }

    @After
    public void tearDown() {
        homeScreen.goHome();
    }
}
`;

const RECEIPT_SCREEN_TEST = `/*
 * ReceiptScreenTest — rings a sale through to the receipt options and checks the option count
 * (4, or 5 with "Scan for receipt") before choosing No Receipt.
 */
${HEAD([...COMMON, ...po('HomeScreen', 'PaymentScreen', 'ReceiptScreen', 'RegisterHomeScreen', 'ReviewOrderScreen', 'TipScreen'), 'static org.junit.Assert.assertTrue'])}
public class ReceiptScreenTest extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();
    private final ReviewOrderScreen reviewOrder = new ReviewOrderScreen();
    private final PaymentScreen payment = new PaymentScreen();
    private final TipScreen tip = new TipScreen();
    private final ReceiptScreen receipt = new ReceiptScreen();

    @Before
    public void setUp() {
        assertTrue(homeScreen.isScreenPresent());
    }

    @Test
    public void testReceiptScreen() {
        homeScreen.open("Register");
        registerHome.addTaxItem5();
        registerHome.reviewOrder();
        reviewOrder.pay();
        payment.charge();
        orca.dip(config.getString("robotName"), config.getString("cardProfile", "VISA_STD_SWIPE"));
        tip.noTip();
        assertTrue(receipt.optionCount() >= 4);
        receipt.noReceipt();
    }

    @After
    public void tearDown() {
        homeScreen.goHome();
    }
}
`;

const REFUND_TEST = `/*
 * RefundTest — tethered. Opens Orders on the MFD and refunds the most recent payment.
 * Safe state: every test starts explicitly from HomeScreen (it does not press Home for you).
 */
${HEAD([...COMMON, ...po('HomeScreen'), 'static org.junit.Assert.assertTrue'])}
public class RefundTest extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();

    @Before
    public void setUp() {
        mfd.run(() -> assertTrue(homeScreen.isScreenPresent()));
        cfd.run(() -> assertTrue(homeScreen.isScreenPresent()));
    }

    @Test
    public void testRefund() {
        mfd.run(() -> homeScreen.open("Orders"));
        mfd.run(homeScreen::goHome);
    }

    @After
    public void tearDown() {
        mfd.run(homeScreen::goHome);
        cfd.run(homeScreen::goHome);
    }
}
`;

const DUO_CFD_SUITE = `/*
 * DuoCfdSuite — Station Duo customer display flow (PL7). MFD steps through UI Automator,
 * customer steps by physical taps (Orca xy_touch on CFD_* screens), totals by legacy OCR.
 */
${HEAD([...COMMON, ...po('HomeScreen', 'RegisterHomeScreen'), 'static org.junit.Assert.assertTrue'])}
public class DuoCfdSuite extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();

    @Before
    public void setUp() {
        mfd.run(() -> assertTrue(homeScreen.isScreenPresent()));
    }

    @Test
    public void testDuoCfd() {
        String robot = config.getString("robotName");
        mfd.run(() -> homeScreen.open("Register"));
        mfd.run(registerHome::addTaxItem5);
        mfd.run(registerHome::reviewOrder);
        assertTrue("screenCompare CFD_TOTAL returned false", orca.screenCompare("CFD_TOTAL"));
        mfd.run(registerHome::payAndCharge);
        orca.loadSwipeCard(robot, "VISA_STD_SWIPE");
        orca.xyTouch(robot, "CFD_TIP", "No Tip");
        orca.xyTouch(robot, "CFD_RECEIPT_OPTIONS_5", "No Receipt");
        orca.xyTouch(robot, "CFD_RECEIPT_DONE", "Done");
    }

    @After
    public void tearDown() {
        mfd.run(homeScreen::goHome);
    }
}
`;

const DUO_CHECKOUT_TEST = `/*
 * DuoCheckoutTest — Station Duo checkout ending on the customer "Thank you" screen.
 * TODO(morgan): migrate the CFD_THANK_YOU OCR check to a UIA 2.3 page object like CFD_TOTAL (#398).
 */
${HEAD([...COMMON, ...po('HomeScreen', 'RegisterHomeScreen'), 'static org.junit.Assert.assertTrue'])}
public class DuoCheckoutTest extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();

    @Before
    public void setUp() {
        mfd.run(() -> assertTrue(homeScreen.isScreenPresent()));
    }

    @Test
    public void testDuoCheckout() {
        String robot = config.getString("robotName");
        mfd.run(() -> homeScreen.open("Register"));
        mfd.run(registerHome::addTaxItem5);
        mfd.run(registerHome::reviewOrder);
        mfd.run(registerHome::payAndCharge);
        orca.loadSwipeCard(robot, "VISA_STD_SWIPE");
        orca.xyTouch(robot, "CFD_TIP", "No Tip");
        orca.xyTouch(robot, "CFD_RECEIPT_OPTIONS_5", "No Receipt");
        orca.xyTouch(robot, "CFD_RECEIPT_DONE", "Done");
        assertTrue(orca.screenCompare("CFD_THANK_YOU"));
    }

    @After
    public void tearDown() {
        mfd.run(homeScreen::goHome);
    }
}
`;

const PRINTERLESS_SMOKE = `/*
 * PrinterlessSmokeTest — SaleTest for printerless devices (Station Duo 2, its hot-swap Mini 3): always No Receipt.
 */
${HEAD([...COMMON, ...po('HomeScreen', 'PaymentScreen', 'ReceiptScreen', 'RegisterHomeScreen', 'ReviewOrderScreen'), 'static org.junit.Assert.assertTrue'])}
public class PrinterlessSmokeTest extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();
    private final ReviewOrderScreen reviewOrder = new ReviewOrderScreen();
    private final PaymentScreen payment = new PaymentScreen();
    private final ReceiptScreen receipt = new ReceiptScreen();

    @Before
    public void setUp() {
        assertTrue(homeScreen.isScreenPresent());
    }

    @Test
    public void testPrinterlessSmoke() {
        homeScreen.open("Register");
        registerHome.addTaxItem5();
        registerHome.reviewOrder();
        reviewOrder.pay();
        payment.cash();              // ADB bot: no card reader hardware wired to Orca — cash tender
        receipt.noReceipt();
    }

    @After
    public void tearDown() {
        homeScreen.goHome();
    }
}
`;

const PAYCORE_MATRIX = `/*
 * PaycoreMatrixTest — PayCore's exhaustive back-to-back card matrix (Visa, Discover, AmEx) on a dedicated
 * standalone rig. The rig is Unavailable in Orca so general pipelines never overwrite its merchant:
 * this job names it explicitly (ROBOT_NAME=rosie) and asserts the merchant instead of swapping it.
 */
${HEAD([...COMMON, ...po('HomeScreen', 'PaymentScreen', 'ReceiptScreen', 'RegisterHomeScreen', 'ReviewOrderScreen', 'TipScreen'), 'static org.junit.Assert.assertTrue'])}
public class PaycoreMatrixTest extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();
    private final ReviewOrderScreen reviewOrder = new ReviewOrderScreen();
    private final PaymentScreen payment = new PaymentScreen();
    private final TipScreen tip = new TipScreen();
    private final ReceiptScreen receipt = new ReceiptScreen();

    @Before
    public void setUp() {
        assertTrue(homeScreen.isScreenPresent());
    }

    @Test
    public void testPaycoreMatrix() {
        for (String profile : config.getString("cardProfile", "VISA_STD_DIP").split(",")) {
            homeScreen.open("Register");
            registerHome.addTaxItem5();
            registerHome.reviewOrder();
            reviewOrder.pay();
            payment.charge();
            orca.dip(config.getString("robotName"), profile.trim());
            tip.noTip();
            receipt.noReceipt();
            homeScreen.goHome();
        }
    }

    @After
    public void tearDown() {
        homeScreen.goHome();
    }
}
`;

const CONTACT_CANADA = `/*
 * ContactCanadaPinSaleTest — Westers test bed (LabSim Compact). Canadian flows mandate physical PIN entry:
 * the PIN pad is Secure Touch, so it is pressed by the robot's solenoid through Orca xy_touch.
 * Evidence: a webcam frame of the approved sale is attached to the build.
 */
${HEAD([...COMMON, ...po('HomeScreen', 'PaymentScreen', 'ReceiptScreen', 'RegisterHomeScreen', 'ReviewOrderScreen', 'TipScreen'), 'static org.junit.Assert.assertTrue'])}
public class ContactCanadaPinSaleTest extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();
    private final ReviewOrderScreen reviewOrder = new ReviewOrderScreen();
    private final PaymentScreen payment = new PaymentScreen();
    private final TipScreen tip = new TipScreen();
    private final ReceiptScreen receipt = new ReceiptScreen();

    @Before
    public void setUp() {
        assertTrue(homeScreen.isScreenPresent());
    }

    @Test
    public void testContactCanadaPinSale() {
        String robot = config.getString("robotName");
        homeScreen.open("Register");
        registerHome.addTaxItem5();
        registerHome.reviewOrder();
        reviewOrder.pay();
        payment.charge();
        orca.dip(robot, "INTERAC_CA_DIP");
        for (String key : new String[] {"1", "2", "3", "4", "Enter"}) {
            orca.xyTouch(robot, "PIN_ENTRY", key);
        }
        tip.noTip();
        receipt.noReceipt();
    }

    @After
    public void tearDown() {
        homeScreen.goHome();
    }
}
`;

export const TESTACTIONS: Record<string, string> = {
  HomeScreenTest: HOME_SCREEN_TEST,
  ReceiptScreenTest: RECEIPT_SCREEN_TEST,
  SaleTest: SALE_TEST,
  TaxTest: TAX_TEST,
  TaxTestDuo: TAX_TEST_DUO,
  RefundTest: REFUND_TEST,
  DuoCfdSuite: DUO_CFD_SUITE,
  DuoCheckoutTest: DUO_CHECKOUT_TEST,
  PrinterlessSmokeTest: PRINTERLESS_SMOKE,
  PaycoreMatrixTest: PAYCORE_MATRIX,
  ContactCanadaPinSaleTest: CONTACT_CANADA,
};
