/**
 * Card Profiles (Sim §2.9), Robot Capabilities (§2.7.2) and Screen Compare Images (§2.11.2).
 * Card definition FILE contents live in gort (sim-devops repo seed); sim-core only needs the paths
 * Callus mirrors and a canonical fallback text for validation when a repo has not been seeded.
 */
import type { CardProfile, RobotCapability, ScreenCompareImage } from '../types';

const T1 = (pan: string, name: string) => `%B${pan}^SIM/${name}^30121010000000000000?`;
const T2 = (pan: string) => `;${pan}=3012101000000000?`;

export function seedCardProfiles(): Record<number, CardProfile> {
  const rows: CardProfile[] = [
    { id: 1, name: 'VISA_STD_SWIPE', brand: 'VISA', entry: 'SWIPE', trackData: T1('4111111111111111', 'VISA') + T2('4111111111111111'), gortPath: null, pan: '4111111111111111', expiry: '3012', pin: null, requiresPin: false, country: 'US', owner: 'Automation' },
    { id: 2, name: 'VISA_STD_DIP', brand: 'VISA', entry: 'DIP', trackData: null, gortPath: 'cards/emv/visa_std_dip.json', pan: '4111111111111111', expiry: '3012', pin: null, requiresPin: false, country: 'US', owner: 'Automation' },
    { id: 3, name: 'VISA_STD_TAP', brand: 'VISA', entry: 'TAP', trackData: null, gortPath: 'cards/nfc/visa_std_tap.json', pan: '4111111111111111', expiry: '3012', pin: null, requiresPin: false, country: 'US', owner: 'Automation' },
    { id: 4, name: 'INTERAC_CA_DIP', brand: 'INTERAC', entry: 'DIP', trackData: null, gortPath: 'cards/emv/interac_ca_dip.json', pan: '4506440000000017', expiry: '3012', pin: '1234', requiresPin: true, country: 'CA', owner: 'Automation' },
    { id: 5, name: 'INTERAC_CA_TAP', brand: 'INTERAC', entry: 'TAP', trackData: null, gortPath: 'cards/nfc/interac_ca_tap.json', pan: '4506440000000017', expiry: '3012', pin: '1234', requiresPin: true, country: 'CA', owner: 'Automation' },
    { id: 6, name: 'AMEX_MATRIX_DIP', brand: 'AMEX', entry: 'DIP', trackData: null, gortPath: 'cards/emv/amex_matrix_dip.json', pan: '378282246310005', expiry: '3012', pin: null, requiresPin: false, country: 'US', owner: 'PayCore' },
    { id: 7, name: 'DISCOVER_MATRIX_DIP', brand: 'DISCOVER', entry: 'DIP', trackData: null, gortPath: 'cards/emv/discover_matrix_dip.json', pan: '6011111111111117', expiry: '3012', pin: null, requiresPin: false, country: 'US', owner: 'PayCore' },
    { id: 8, name: 'AMEX_MATRIX_SWIPE', brand: 'AMEX', entry: 'SWIPE', trackData: `%B378282246310005^SIM/AMEX^30121010000000000000?;378282246310005=301210100000000?`, gortPath: null, pan: '378282246310005', expiry: '3012', pin: null, requiresPin: false, country: 'US', owner: 'PayCore' },
    { id: 9, name: 'DISCOVER_MATRIX_SWIPE', brand: 'DISCOVER', entry: 'SWIPE', trackData: T1('6011111111111117', 'DISCOVER') + T2('6011111111111117'), gortPath: null, pan: '6011111111111117', expiry: '3012', pin: null, requiresPin: false, country: 'US', owner: 'PayCore' },
  ];
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export const FACTORY_CARD_PROFILES: Readonly<Record<number, CardProfile>> = seedCardProfiles();

/** Every file under `cards/` on gort `main` at factory commit c41d9e2 ("pulled c41d9e2 (7 files)"). */
export const FACTORY_CARD_FILES: readonly string[] = [
  'cards/README.md',
  'cards/emv/amex_matrix_dip.json',
  'cards/emv/discover_matrix_dip.json',
  'cards/emv/interac_ca_dip.json',
  'cards/emv/visa_std_dip.json',
  'cards/nfc/interac_ca_tap.json',
  'cards/nfc/visa_std_tap.json',
];
/** The same set at the previous sync commit 9f02a1b (before INTERAC_CA_TAP was added). */
export const CARD_FILES_AT_9F02A1B: readonly string[] = FACTORY_CARD_FILES.filter((p) => p !== 'cards/nfc/interac_ca_tap.json');

const AIDS: Record<string, string> = { VISA: 'A0000000031010', INTERAC: 'A0000002771010', AMEX: 'A00000002501', DISCOVER: 'A0000001523010', MASTERCARD: 'A0000000041010' };

/** Canonical card definition JSON for a profile (Sim §2.9) — fallback when gort's file is not seeded. */
export function canonicalCardFile(p: CardProfile): string {
  const lines = [
    '{',
    `  "profile": "${p.name}",`,
    `  "brand": "${p.brand}",`,
    `  "interface": "${p.entry === 'TAP' ? 'CONTACTLESS' : 'CONTACT'}",`,
    `  "pan": "${p.pan}",`,
    `  "expiry": "${p.expiry}",`,
    `  "aid": "${AIDS[p.brand] ?? 'A0000000031010'}",`,
    `  "appLabel": "${p.brand === 'INTERAC' ? 'Interac' : p.brand === 'VISA' ? 'VISA CREDIT' : p.brand}",`,
    `  "cvm": [${p.requiresPin ? '"ONLINE_PIN", "OFFLINE_PIN"' : '"SIGNATURE", "NO_CVM"'}],`,
    ...(p.pin ? [`  "pin": "${p.pin}",`] : []),
    `  "issuerCountry": "${p.country}"`,
    '}',
  ];
  return lines.join('\n');
}

export function seedCapabilities(): Record<number, RobotCapability> {
  const rows: RobotCapability[] = [
    { id: 1, name: 'DIP', key: 'dip', value: true, lookup: 'BOTH', description: 'Dip arm + Collis probe present', json: '{"dip": true}' },
    { id: 2, name: 'TAP', key: 'tap', value: true, lookup: 'BOTH', description: 'Tap paddle + Collis NFC', json: '{"tap": true}' },
    { id: 3, name: 'SWIPE', key: 'swipe', value: true, lookup: 'BOTH', description: 'Collis or SmartStripe swipe', json: '{"swipe": true}' },
    { id: 4, name: 'GO_SDK', key: 'goSdk', value: true, lookup: 'DYNAMIC_JSON', description: 'Terminal SDK runner target (David)', json: '{"goSdk": true}' },
    { id: 5, name: 'INTERAC', key: 'interac', value: true, lookup: 'BOTH', description: 'Canadian Interac flows (Westers beds)', json: '{"interac": true}' },
    { id: 6, name: 'PHONE', key: 'phone', value: true, lookup: 'DYNAMIC_JSON', description: 'Phone carriage with a mounted phone (mobile runners)', json: '{"phone": true}' },
    { id: 7, name: 'OCR_CAMERA', key: 'ocrCamera', value: true, lookup: 'NON_DYNAMIC', description: 'Webcam aimed for Screen Compare (legacy Duo)', json: '{"ocrCamera": true}' },
    { id: 8, name: 'lab_dining', key: 'lab_dining', value: true, lookup: 'BOTH', description: 'LabSim Dining app provisioned (PayCore)', json: '{"lab_dining": true}' },
    { id: 9, name: 'CARD_MATRIX', key: 'cardMatrix', value: true, lookup: 'NON_DYNAMIC', description: 'PayCore back-to-back card matrix rig', json: '{"cardMatrix": true}' },
  ];
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export function seedScreenCompareImages(): Record<number, ScreenCompareImage> {
  const rows: ScreenCompareImage[] = [
    { id: 1, name: 'CFD_TOTAL', robotId: 4, screenName: 'CFD_CART', bbox: { x: 412, y: 288, w: 236, h: 44 }, expectedText: 'TOTAL $10.83', deprecated: false, usedBy: ['uia-remote:DuoCfdSuite'] },
    { id: 2, name: 'CFD_THANK_YOU', robotId: 4, screenName: 'CFD_THANK_YOU', bbox: { x: 514, y: 336, w: 252, h: 48 }, expectedText: 'Thank you', deprecated: false, usedBy: ['uia-remote:DuoCheckoutTest'] },
    { id: 3, name: 'CFD_TOTAL_C3PO', robotId: 18, screenName: 'CFD_CART', bbox: { x: 985, y: 472, w: 96, h: 18 }, expectedText: 'TOTAL $10.83', deprecated: true, usedBy: [] },
  ];
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export const FACTORY_SCREEN_COMPARE: Readonly<Record<number, ScreenCompareImage>> = seedScreenCompareImages();
