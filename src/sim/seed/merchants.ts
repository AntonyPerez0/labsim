/** Merchant Config rows (Sim §2.8) and the shared inventory (Sim §3.9.1). */
import type { CardBrand, MerchantConfig } from '../types';

const US: CardBrand[] = ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'];
const CA: CardBrand[] = ['VISA', 'MASTERCARD', 'INTERAC'];
export const RECEIPT_ADDRESS = '100 Automation Way, Lab 4';

function m(id: number, name: string, displayName: string, merchantId: string, environment: string, over: Partial<MerchantConfig>): MerchantConfig {
  return {
    id,
    name,
    displayName,
    address: RECEIPT_ADDRESS,
    merchantId,
    environment,
    region: 'US-EAST',
    country: 'US',
    currency: 'USD',
    taxRatePct: 8.25,
    taxRateBp: 825,
    tipsEnabled: true,
    tipPercents: [15, 18, 20, 22],
    pinBypass: true,
    cashDiscountEnabled: false,
    cardAdjustBp: 0,
    qrReceiptsEnabled: true,
    signatureThresholdCents: 2500,
    acceptedBrands: US,
    apps: [],
    owner: 'Automation',
    appId: null,
    appSecret: null,
    apiKey: null,
    ubiRoute: 'us-east',
    notes: '',
    ...over,
  };
}

export function seedMerchants(): Record<number, MerchantConfig> {
  const rows = [
    m(1, 'AUTO-US-NOPIN-01', 'LabSim Automation Lab — US 01', 'SIMMID0000101', 'dev1', { notes: 'Default automation merchant (PIN bypass — required for ADB bots).' }),
    m(2, 'AUTO-US-NOPIN-02', 'LabSim Automation Lab — US 02', 'SIMMID0000102', 'dev2', {
      cashDiscountEnabled: true,
      cardAdjustBp: 400,
      qrReceiptsEnabled: false,
      notes: 'Cash-discount program (card +4.00 %).',
    }),
    m(3, 'GO-SDK-US-01', 'Go SDK Smoke Merchant', 'SIMMID0000301', 'dev1', {
      owner: 'SDK',
      appId: 'app_sim_7f3a',
      appSecret: 'app_secret_sim_5d21',
      apiKey: 'key_sim_19c0e2',
      notes: 'Go SDK credentials exported as APP_ID / APP_SECRET / API_KEY (Tate).',
    }),
    m(4, 'PAYCORE-STANDALONE-01', 'PayCore Standalone 01', 'SIMMID0000401', 'stg', {
      tipsEnabled: false,
      tipPercents: [],
      pinBypass: false,
      qrReceiptsEnabled: false,
      signatureThresholdCents: 0,
      owner: 'PayCore',
      notes: 'PayCore card matrix — always sign swipes. Keep ROSIE/KRYTEN Unavailable.',
    }),
    m(5, 'PAYCORE-DINING-01', 'PayCore Dining Room', 'SIMMID0000501', 'stg', {
      tipPercents: [15, 18, 20],
      pinBypass: false,
      apps: ['LabSim Dining'],
      owner: 'PayCore',
      notes: 'LabSim Dining provisioned (BENDER).',
    }),
    m(6, 'WESTERS-CA-01', 'Westers Test Bed — CA 01', 'SIMMID0000601', 'dev1', {
      region: 'CA-CENTRAL',
      country: 'CA',
      currency: 'CAD',
      taxRatePct: 13,
      taxRateBp: 1300,
      tipPercents: [15, 18, 20],
      pinBypass: false,
      qrReceiptsEnabled: false,
      signatureThresholdCents: null,
      acceptedBrands: CA,
      owner: 'Westers',
      ubiRoute: 'ca-central',
      notes: 'Contact Canada — physical PIN entry required (Interac).',
    }),
    m(7, 'WESTERS-CA-02', 'Westers Test Bed — CA 02', 'SIMMID0000602', 'qa', {
      region: 'CA-CENTRAL',
      country: 'CA',
      currency: 'CAD',
      taxRatePct: 13,
      taxRateBp: 1300,
      tipPercents: [15, 18, 20],
      pinBypass: false,
      qrReceiptsEnabled: false,
      signatureThresholdCents: null,
      acceptedBrands: CA,
      owner: 'Westers',
      ubiRoute: 'ca-central',
    }),
  ];
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

/** Factory values (for "equals factory" clear predicates). */
export const FACTORY_MERCHANTS: Readonly<Record<number, MerchantConfig>> = seedMerchants();

/** Register inventory, identical for every merchant (Sim §3.9.1) [illus.]. */
export const INVENTORY: readonly { name: string; priceCents: number; taxable: boolean }[] = [
  { name: 'Tax Item 5', priceCents: 1000, taxable: true },
  { name: 'Non-Tax Item 1', priceCents: 500, taxable: false },
  { name: 'Coffee', priceCents: 350, taxable: true },
  { name: 'Catering Deposit', priceCents: 4200, taxable: false },
];

/** Launcher apps every provisioned device has (page 0 + page 1, Sim §3.8.2). */
export const BASE_APPS = ['Register', 'Orders', 'Transactions', 'Setup', 'Sale', 'Authorizations', 'Customers', 'Inventory', 'Settings', 'App Market', 'Reporting', 'Employees', 'Cash Log', 'Help'];
