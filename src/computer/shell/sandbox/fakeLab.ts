/**
 * SANDBOX ONLY — a plausible lab seeded through `mutate()` from the Sim §2 tables, for the computer
 * sandbox page and unit tests while the real sim seed (src/sim/seed) has not landed. Never imported by
 * production code. Skips seeding when the real sim already populated Orca.
 */
import { getState, mutate } from '@/core/store';
import { createTerminalDevice, createHost, createOrcaRobot, createRigState } from '@/sim/initialState';
import type { DeviceTypeCode, LabState, MerchantConfig, OrcaDevice, RigKind, RobotStatus } from '@/sim/types';
import { UI_DEVICE_TYPES } from '../deviceTypes';

const H = 3_600_000;
const M = 60_000;

// id|name|kind|env|location|status|device(type@ip)|cfd(type@ip)|pi|cam|dts|merchantId|caps
const ROSTER = `
1|wall-e|touch|DEV1|Rack A · U33–U36|AVAILABLE|wall-e-flex3:FLEX_3@11||11|11|DTS|1|1,2,3
2|eve|touch|DEV1|Rack A · U29–U32|AVAILABLE|eve-flex4:FLEX_4@12||12|12|DTS|1|1,2,3
3|bumblebee|touch|DEV1|Rack A · U25–U28|AVAILABLE|bumblebee-mini3:MINI_3@13||13|13|DTS|1|1,2,3
4|r2-d2|touch|DEV1|Rack A · U21–U24|AVAILABLE|r2-d2-duo:STATION_DUO@14|=|14|14|DTS|1|1,2,3,7
5|johnny-5|touch|DEV1|Rack B · U33–U36|AVAILABLE|johnny-5-flex1:FLEX_1@15||15|40|DTS|1|1,2,3
6|baymax|touch|DEV1|Rack B · U29–U32|AVAILABLE|baymax-st2018:STATION_2018@16||16|40|DTS|1|1,2,3
7|seti|touch|DEV1|Rack B · U25–U28|AVAILABLE|seti-compact:COMPACT@17||17|40|DTS|6|1,2,3,5
8|rosie|standalone|DEV1|Rack B · U21–U24|UNAVAILABLE|rosie-pocket:FLEX_POCKET@18||18|40|DTS|4|1,2,3,9
9|megatron|tethered|DEV1|Tethered rack|AVAILABLE|megatron-mfd:STATION_2@21|megatron-cfd:MINI_2@22|20|20|S|1|3
10|optimus|tethered|STG|Tethered rack|AVAILABLE|optimus-mfd:MINI_3@23|optimus-cfd:MINI_3@24|20|20|S|1|3
11|data|adb|DEV1|ADB shelf|AVAILABLE|data-mini3:MINI_3@31||30||-|1|4
12|tars|adb|DEV1|ADB shelf|AVAILABLE|tars-flex4:FLEX_4@32||30||-|1|4
13|vision|adb|DEV1|Rack C (off-screen)|AVAILABLE|vision-pocket:FLEX_POCKET@50||50|50|-|1|4
14|k-9|adb|DEV1|Rack C|AVAILABLE|k-9-duo2:STATION_DUO_2@51||51||-|1|
15|soundwave|touch|QA|Rack C|AVAILABLE|soundwave-flex3:FLEX_3@52||52|60|DTS|2|1,2,3
16|starscream|touch|QA|Rack C|AVAILABLE|starscream-flex4:FLEX_4@53||53|60|DTS|2|1,2,3
17|ratchet|touch|QA|Rack C|AVAILABLE|ratchet-mini3:MINI_3@54||54|60|DTS|2|1,2,3
18|c-3po|touch|QA|Rack C|AVAILABLE|c-3po-duo:STATION_DUO@55|=|55|60|DTS|2|1,2,3,7
19|bb-8|tethered|DEV2|Rack D|AVAILABLE|bb-8-mfd:MINI_3@61|bb-8-cfd:MINI_3@62|61|61|S|2|3
20|bender|standalone|STG|PayCore bench|UNAVAILABLE|bender-st2:STATION_2@63||63|63|DTS|5|1,2,3,8,9
21|marvin|tethered|QA|Rack D|AVAILABLE|marvin-mfd:STATION_2@64|marvin-cfd:MINI_3@65|64|64|S|2|3
22|robby|tethered|DEV2|Rack D|OFFLINE|robby-mfd:MINI_3@66|robby-cfd:MINI_3@67|64|64|S|2|3
23|hal|adb|QA|ADB rack 2|AVAILABLE|hal-st2:STATION_2@70||70||-|2|
24|bishop|adb|QA|ADB rack 2|AVAILABLE|bishop-mini2:MINI_2@71||70||-|2|
25|ash|adb|QA|ADB rack 2|AVAILABLE|ash-flex2:FLEX_2@72||70||-|2|
26|sonny|adb|QA|ADB rack 2|CONNECTION_FAILED|sonny-flex3:FLEX_3@73||74||-|2|
27|chappie|touch|QA|Rack E|AVAILABLE|chappie-flex4:FLEX_4@75||75|79|DTS|2|1,2,3
28|case|touch|QA|Rack E|AVAILABLE|case-mini3:MINI_3@76||76|79|DTS|2|1,2,3
29|atlas|touch|QA|Rack E|AVAILABLE|atlas-st2018:STATION_2018@77||77|79|DTS|2|1,2,3
30|astro|touch|QA|Rack E|AVAILABLE|astro-flex4:FLEX_4@78||78|79|DTS|3|1,2,3,4,6
31|iron-giant|touch|QA|Rack F|AVAILABLE|iron-giant-duo2:STATION_DUO_2@80|=|80|80|DTS|2|1,2,3,7
32|voltron|tethered|INT|Rack D|AVAILABLE|voltron-mfd:STATION_2@81|voltron-cfd:MINI_2@82|81|81|S|2|3
33|kryten|standalone|STG|PayCore bench|UNAVAILABLE|kryten-flex3:FLEX_3@83||83|83|DTS|4|1,2,3,9
34|mazinger|touch|DEV2|Rack F|AVAILABLE|mazinger-mini2:MINI_2@84||84|84|DTS|2|1,2,3
35|jarvis|adb|DEV2|ADB rack 2|AVAILABLE|jarvis-mini3:MINI_3@85||85||-|2|
36|ultron|adb|DEV2|ADB rack 2|AVAILABLE|ultron-pocket:FLEX_POCKET@86||85||-|2|
37|dalek|touch|QA|Rack F|OFFLINE|dalek-flex1:FLEX_1@87||87|87|DTS|2|1,2,3
38|number-5|touch|QA|Rack F|AVAILABLE|number-5-flex2:FLEX_2@88||88|88|DTS|2|1,2,3
39|gerty|touch|QA|Westers bench|AVAILABLE|gerty-compact:COMPACT@89||89|89|DTS|7|1,2,3,5
40|mother|touch|QA|Westers bench|RESERVED|mother-compact:COMPACT@90||90|89|DTS|6|1,2,3,5
41|brainiac|adb|DEV2|ADB rack 2|AVAILABLE|brainiac-duo:STATION_DUO@91||91||-|2|
42|zorg|tethered|QA|Rack D|AVAILABLE|zorg-mfd:MINI_3@92|zorg-cfd:MINI_2@93|92|92|S|2|3
`;

const SERIAL_CODE: Record<DeviceTypeCode, string> = {
  FLEX_1: 'F1', FLEX_2: 'F2', FLEX_3: 'F3', FLEX_4: 'F4', FLEX_POCKET: 'FP', MINI_2: 'M2', MINI_3: 'M3', MINI_4: 'M4',
  STATION_2018: 'S18', STATION_2: 'S2', STATION_DUO: 'SD', STATION_DUO_2: 'SD2', STATION_DUO_3: 'SD3', COMPACT: 'CP',
};

function merchant(id: number, name: string, displayName: string, env: string, region: MerchantConfig['region'], country: 'US' | 'CA', taxBp: number, tips: number[], pinBypass: boolean, cash: boolean, qr: boolean, sig: number | null, owner: string, creds: [string, string, string] | null, apps: string[] = []): MerchantConfig {
  return {
    id, name, merchantId: `SIMMID0000${id}0${id}`.slice(0, 13), environment: env, country, currency: country === 'US' ? 'USD' : 'CAD',
    taxRatePct: taxBp / 100, tipsEnabled: tips.length > 0, pinBypass, cashDiscountEnabled: cash, owner,
    appId: creds?.[0] ?? null, appSecret: creds?.[1] ?? null, apiKey: creds?.[2] ?? null, ubiRoute: region === 'US-EAST' ? 'us-east' : 'ca-central',
    notes: '', displayName, address: '100 Automation Way, Lab 4', region, taxRateBp: taxBp, tipPercents: tips, cardAdjustBp: cash ? 400 : 0,
    qrReceiptsEnabled: qr, signatureThresholdCents: sig, acceptedBrands: country === 'US' ? ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'] : ['VISA', 'MASTERCARD', 'INTERAC'], apps,
  };
}

const FLEX3_LOCATIONS: [string, [string, number, number][]][] = [
  ['HOME', [['Orders', 20.3, 30], ['Transactions', 55.7, 30], ['Register', 20.3, 53.6], ['Setup', 55.7, 53.6], ['Sale', 20.3, 77.2], ['Authorizations', 55.7, 77.2]]],
  ['REGISTER_HOME', [['Register', 13, 10], ['Tax Item 5', 20.3, 30], ['Non-Tax Item 1', 55.7, 30], ['Coffee', 20.3, 50], ['Clear', 20, 124], ['Review Order', 56, 124]]],
  ['REVIEW_ORDER', [['Back', 20, 124], ['Pay', 56, 124]]],
  ['PAYMENT', [['Charge', 38, 60], ['Cash', 38, 78], ['Other', 38, 96], ['Cancel', 38, 124]]],
  ['TENDER_CASH_DISCOUNT', [['Cash', 22, 58.5], ['Card', 62, 58.5]]],
  ['PAYMENT_PROMPT', [['Cancel', 38, 124]]],
  ['TIP', [['15%', 20.3, 62], ['18%', 55.7, 62], ['20%', 20.3, 80], ['22%', 55.7, 80], ['No Tip', 20.3, 98], ['Custom', 55.7, 98]]],
  ['SIGNATURE', [['Clear', 20, 124], ['Done', 56, 124]]],
  ['APPROVED', []],
  ['RECEIPT_OPTIONS_4', [['Print', 34, 71], ['Email', 34, 83], ['Text', 34, 95], ['No Receipt', 34, 107]]],
  ['RECEIPT_OPTIONS_5', [['Print', 34, 74], ['Email', 34, 86], ['Text', 34, 98], ['No Receipt', 34, 110], ['Scan for receipt', 34, 122]]],
];

/** Seed the sandbox lab (idempotent; skipped when Orca already has robots). */
export function seedFakeLab(opts: { force?: boolean } = {}): void {
  if (!opts.force && Object.keys(getState().lab.orca.robots).length > 0) return;
  mutate((root) => {
    const lab = root.lab as LabState;
    const now = 9 * H + 41 * M + 7000;
    lab.time.nowMs = now;
    lab.orca.robots = {};
    lab.orca.devices = {};
    lab.rigs = {};
    lab.devices = {};
    lab.hosts = {};
    let devId = 1;
    const addDevice = (spec: string): number => {
      const [name, rest] = spec.split(':') as [string, string];
      const [type, ip] = rest.split('@') as [DeviceTypeCode, string];
      const serial = `SIM-${SERIAL_CODE[type]}-0000${ip.padStart(2, '0')}`;
      const row: OrcaDevice = { id: devId, name, deviceType: type, serial, ip: `10.42.30.${ip}`, label: name.toUpperCase(), simDeviceId: `dev-${name}`, retired: false };
      lab.orca.devices[devId] = row;
      lab.devices[`dev-${name}`] = createTerminalDevice(`dev-${name}`, type, { serial, ip: `10.42.30.${ip}`, orcaDeviceName: name, adbTcpPort: 5444 });
      return devId++;
    };
    for (const line of ROSTER.trim().split('\n')) {
      const [id, name, kind, env, location, status, dev, cfd, pi, cam, dts, merchantId, caps] = line.split('|') as string[];
      const rid = Number(id);
      const deviceId = addDevice(dev!);
      const cfdId = cfd === '=' ? deviceId : cfd ? addDevice(cfd) : null;
      const piUrl = `http://10.42.10.${pi}:8000`;
      const st = status as RobotStatus;
      lab.orca.robots[rid] = createOrcaRobot(rid, name!, kind as RigKind, {
        environment: env!,
        location: location!,
        status: st,
        deviceId,
        mfdDeviceId: cfdId != null ? deviceId : null,
        cfdDeviceId: cfdId,
        adbServiceUrl: `${piUrl}/adb`,
        cameraStreamUrl: cam ? `http://10.42.10.${cam}:8081/stream.mjpg` : '',
        dipUrl: dts!.includes('D') ? `${piUrl}/dip` : null,
        tapUrl: dts!.includes('T') ? `${piUrl}/tap` : null,
        swipeUrl: dts!.includes('S') ? `${piUrl}/swipe` : null,
        merchantConfigId: Number(merchantId),
        capabilityIds: caps ? caps.split(',').map(Number) : [],
        physical: rid <= 12,
        reservedBy: st === 'RESERVED' ? 'morgan' : null,
        reservedAtMs: st === 'RESERVED' ? 7 * H + 40 * M : null,
        lastHealthCheckMs: st === 'OFFLINE' ? null : 9 * H + 35 * M,
        lastHealthCheckOk: st === 'OFFLINE' || st === 'RESERVED' ? null : st !== 'CONNECTION_FAILED',
        lastHealth:
          st === 'CONNECTION_FAILED'
            ? { atMs: 9 * H + 35 * M, endpoint: `GET http://10.42.10.${pi}:8000/health`, http: null, error: 'connect timed out after 10000 ms', latencyMs: 10000 }
            : st === 'OFFLINE' || st === 'RESERVED'
              ? null
              : { atMs: 9 * H + 35 * M, endpoint: `GET http://10.42.10.${pi}:8000/health`, http: 200, error: null, latencyMs: 42 },
        preFailureStatus: st === 'CONNECTION_FAILED' ? 'AVAILABLE' : null,
      });
      if (!lab.hosts[`pi-${pi}`]) {
        lab.hosts[`pi-${pi}`] = createHost(`pi-${pi}`, 'pi', name!, `10.42.10.${pi}`, {
          services: { 'robot-controller': { name: 'robot-controller', running: true, port: 8000 } as never, 'camera-stream': { name: 'camera-stream', running: true, port: 8081 } as never },
        });
      }
      if (kind === 'touch' || kind === 'standalone') {
        const t = UI_DEVICE_TYPES[(dev!.split(':')[1]!.split('@')[0]) as DeviceTypeCode];
        const duo = cfd === '=';
        const w = duo ? t.secondary!.wMm : t.wMm;
        const h = duo ? t.secondary!.hMm : t.hMm;
        const rig = createRigState(name!, rid, kind as RigKind, { hasGantry: true, piHostId: `pi-${pi}`, deviceIds: [`dev-${dev!.split(':')[0]}`], probeDisplay: duo ? 'secondary' : 'primary' });
        rig.gantry.maxXMm = w + 10;
        rig.gantry.maxYMm = h + 10;
        rig.tablet.hrnShown = name!.toUpperCase();
        rig.tablet.statusText = 'Status: OK';
        rig.bannerText = 'Status: OK';
        rig.offscreen = rid > 12;
        lab.rigs[name!] = rig;
      }
    }
    // Retired legacy device row.
    lab.orca.devices[devId] = { id: devId, name: 'retired-flex1-legacy', deviceType: 'FLEX_1', serial: 'SIM-F1-000099', ip: '10.42.30.99', label: 'OLD FLEX 1', simDeviceId: null, retired: true };
    devId++;
    lab.orca.seq.devices = devId;
    lab.orca.seq.robots = 43;
    // Notes.
    const sonny = lab.orca.robots[26]!;
    sonny.notes = [
      { id: 1, atMs: 7 * H + 55 * M, author: 'orca-health-check', endpoint: 'GET http://10.42.10.74:8000/health', text: '2026-10-05 07:55:00 GET http://10.42.10.74:8000/health → connect timed out after 10000 ms (×19, last 09:35:00)', resolved: false, kind: 'HEALTH', repeat: 19, lastAtMs: 9 * H + 35 * M },
      { id: 2, atMs: 8 * H + 2 * M + 11000, author: 'tate', text: '2026-10-05 08:02:11 Escalated to Jared — SD card reflash pending (tate)', resolved: false, kind: 'MANUAL', repeat: 1, lastAtMs: 8 * H + 2 * M + 11000 },
    ];
    lab.orca.robots[22]!.notes = [{ id: 3, atMs: -4 * 24 * H + 14 * H, author: 'jared', text: '2026-10-01 14:00:00 STATUS Available → Offline (jared): Assembling data profiles — Jared', resolved: false, kind: 'STATUS', repeat: 1, lastAtMs: -4 * 24 * H + 14 * H }];
    lab.orca.robots[37]!.notes = [{ id: 4, atMs: -3 * 24 * H + 11 * H, author: 'jared', text: '2026-10-02 11:00:00 STATUS Available → Offline (jared): Flex 1 parked; rebuild queued — J', resolved: false, kind: 'STATUS', repeat: 1, lastAtMs: -3 * 24 * H + 11 * H }];
    lab.orca.robots[1]!.notes = [{ id: 5, atMs: 8 * H + 15 * M, author: 'orca-health-check', text: '2026-10-05 08:15:00 GET http://10.42.10.11:8000/health → 200 OK (recovered after 1 failure)', resolved: true, kind: 'HEALTH', repeat: 1, lastAtMs: 8 * H + 15 * M }];
    lab.orca.seq.notes = 6;
    // Capabilities.
    const caps: [string, string, 'BOTH' | 'DYNAMIC_JSON' | 'NON_DYNAMIC', string][] = [
      ['DIP', 'dip', 'BOTH', 'Dip arm + Collis probe present'],
      ['TAP', 'tap', 'BOTH', 'Tap paddle + Collis NFC'],
      ['SWIPE', 'swipe', 'BOTH', 'Collis or SmartStripe swipe'],
      ['GO_SDK', 'goSdk', 'DYNAMIC_JSON', 'Terminal SDK runner target (David)'],
      ['INTERAC', 'interac', 'BOTH', 'Canadian Interac flows (Westers beds)'],
      ['PHONE', 'phone', 'DYNAMIC_JSON', 'Phone carriage with a mounted phone (mobile runners)'],
      ['OCR_CAMERA', 'ocrCamera', 'NON_DYNAMIC', 'Webcam aimed for Screen Compare (legacy Duo)'],
      ['lab_dining', 'lab_dining', 'BOTH', 'LabSim Dining app provisioned (PayCore)'],
      ['CARD_MATRIX', 'cardMatrix', 'NON_DYNAMIC', 'PayCore back-to-back card matrix rig'],
    ];
    lab.orca.capabilities = {};
    caps.forEach(([name, key, lookup, description], i) => {
      lab.orca.capabilities[i + 1] = { id: i + 1, name, key, lookup, description, json: `{"${key}": true}`, value: true };
    });
    lab.orca.seq.capabilities = 10;
    // Merchants.
    const ms = [
      merchant(1, 'AUTO-US-NOPIN-01', 'LabSim Automation Lab — US 01', 'dev1', 'US-EAST', 'US', 825, [15, 18, 20, 22], true, false, true, 2500, 'Automation', null),
      merchant(2, 'AUTO-US-NOPIN-02', 'LabSim Automation Lab — US 02', 'dev2', 'US-EAST', 'US', 825, [15, 18, 20, 22], true, true, false, 2500, 'Automation', null),
      merchant(3, 'GO-SDK-US-01', 'Go SDK Smoke Merchant', 'dev1', 'US-EAST', 'US', 825, [15, 18, 20, 22], true, false, true, 2500, 'SDK', ['app_sim_7f3a', 'app_secret_sim_5d21', 'key_sim_19c0e2']),
      merchant(4, 'PAYCORE-STANDALONE-01', 'PayCore Standalone 01', 'stg', 'US-EAST', 'US', 825, [], false, false, false, 0, 'PayCore', null),
      merchant(5, 'PAYCORE-DINING-01', 'PayCore Dining Room', 'stg', 'US-EAST', 'US', 825, [15, 18, 20], false, false, true, 2500, 'PayCore', null, ['LabSim Dining']),
      merchant(6, 'WESTERS-CA-01', 'Westers Test Bed — CA 01', 'dev1', 'CA-CENTRAL', 'CA', 1300, [15, 18, 20], false, false, false, null, 'Westers', null),
      merchant(7, 'WESTERS-CA-02', 'Westers Test Bed — CA 02', 'qa', 'CA-CENTRAL', 'CA', 1300, [15, 18, 20], false, false, false, null, 'Westers', null),
    ];
    ms.forEach((m, i) => (m.merchantId = `SIMMID0000${[101, 102, 301, 401, 501, 601, 602][i]}`));
    lab.orca.merchants = Object.fromEntries(ms.map((m) => [m.id, m]));
    lab.orca.seq.merchants = 8;
    // Card profiles.
    const cards: [string, 'VISA' | 'INTERAC' | 'AMEX' | 'DISCOVER', 'SWIPE' | 'DIP' | 'TAP', string, string, string | null, 'US' | 'CA', string][] = [
      ['VISA_STD_SWIPE', 'VISA', 'SWIPE', '%B4111111111111111^SIM/VISA^30121010000000000000?;4111111111111111=3012101000000000?', '4111111111111111', null, 'US', 'Automation'],
      ['VISA_STD_DIP', 'VISA', 'DIP', 'cards/emv/visa_std_dip.json', '4111111111111111', null, 'US', 'Automation'],
      ['VISA_STD_TAP', 'VISA', 'TAP', 'cards/nfc/visa_std_tap.json', '4111111111111111', null, 'US', 'Automation'],
      ['INTERAC_CA_DIP', 'INTERAC', 'DIP', 'cards/emv/interac_ca_dip.json', '4506440000000017', '1234', 'CA', 'Automation'],
      ['INTERAC_CA_TAP', 'INTERAC', 'TAP', 'cards/nfc/interac_ca_tap.json', '4506440000000017', '1234', 'CA', 'Automation'],
      ['AMEX_MATRIX_DIP', 'AMEX', 'DIP', 'cards/emv/amex_matrix_dip.json', '378282246310005', null, 'US', 'PayCore'],
      ['DISCOVER_MATRIX_DIP', 'DISCOVER', 'DIP', 'cards/emv/discover_matrix_dip.json', '6011111111111117', null, 'US', 'PayCore'],
      ['AMEX_MATRIX_SWIPE', 'AMEX', 'SWIPE', '%B378282246310005^SIM/AMEX^30121010000000000000?;378282246310005=301210100000000?', '378282246310005', null, 'US', 'PayCore'],
      ['DISCOVER_MATRIX_SWIPE', 'DISCOVER', 'SWIPE', '%B6011111111111117^SIM/DISCOVER^30121010000000000000?;6011111111111117=3012101000000000?', '6011111111111117', null, 'US', 'PayCore'],
    ];
    lab.orca.cardProfiles = {};
    cards.forEach(([name, brand, entry, data, pan, pin, country, owner], i) => {
      lab.orca.cardProfiles[i + 1] = { id: i + 1, name, brand, entry, trackData: entry === 'SWIPE' ? data : null, gortPath: entry === 'SWIPE' ? null : data, country, requiresPin: !!pin, owner, pin, pan, expiry: '3012' };
    });
    lab.orca.seq.cardProfiles = 10;
    // Screens + locations (FLEX_3 and FLEX_4 full; others HOME only).
    lab.orca.screens = {};
    lab.orca.screenLocations = {};
    let sid = 1;
    let lid = 1;
    for (const type of ['FLEX_3', 'FLEX_4', 'MINI_3', 'FLEX_1', 'FLEX_2', 'STATION_DUO'] as DeviceTypeCode[]) {
      const list = type === 'FLEX_3' || type === 'FLEX_4' ? FLEX3_LOCATIONS : FLEX3_LOCATIONS.slice(0, 2);
      for (const [screen, locs] of list) {
        const optionCount = screen === 'RECEIPT_OPTIONS_4' ? 4 : screen === 'RECEIPT_OPTIONS_5' ? 5 : null;
        lab.orca.screens[sid] = { id: sid, name: screen, testingProfile: UI_DEVICE_TYPES[type].profile, description: screen === 'TENDER_CASH_DISCOUNT' ? 'Cash discount tender selection prompt' : '', optionCount, deviceType: type, display: 'primary' };
        for (const [button, x, y] of locs) {
          lab.orca.screenLocations[lid] = { id: lid, screenId: sid, button, xMm: x, yMm: y };
          lid++;
        }
        sid++;
      }
    }
    lab.orca.screens[sid] = { id: sid, name: 'CFD_CART', testingProfile: 'STATION_DUO', description: 'Duo CFD cart (OCR)', optionCount: null, deviceType: 'STATION_DUO', display: 'secondary' };
    sid++;
    lab.orca.seq.screens = sid;
    lab.orca.seq.screenLocations = lid;
    // Screen compare images.
    lab.orca.screenCompareImages = {
      1: { id: 1, name: 'CFD_TOTAL', robotId: 4, screenName: 'CFD_CART', bbox: { x: 412, y: 288, w: 236, h: 44 }, expectedText: 'TOTAL $10.83', deprecated: false, usedBy: ['uia-remote:DuoCfdSuite'] },
      2: { id: 2, name: 'CFD_THANK_YOU', robotId: 4, screenName: 'CFD_THANK_YOU', bbox: { x: 514, y: 336, w: 252, h: 48 }, expectedText: 'Thank you', deprecated: false, usedBy: ['uia-remote:DuoCheckoutTest'] },
      3: { id: 3, name: 'CFD_TOTAL_C3PO', robotId: 18, screenName: 'CFD_CART', bbox: { x: 985, y: 472, w: 96, h: 18 }, expectedText: 'TOTAL $10.83', deprecated: true, usedBy: [] },
    };
    lab.orca.seq.screenCompareImages = 4;
    // Health check.
    const runLines = (run: number) => [
      `2026-10-05 ${String(9).padStart(2, '0')}:${String(35 - (7 - run) * 5).padStart(2, '0')}:00  health-check run #${run} — 37 pinged, 3 skipped, 1 failed, 0 recovered`,
    ];
    lab.orca.healthCheck.runCount = 7;
    lab.orca.healthCheck.lastRunMs = 9 * H + 35 * M;
    lab.orca.healthCheck.nextRunMs = 9 * H + 40 * M;
    lab.orca.healthCheck.log = [7, 6, 5].map((run) => ({
      run,
      atMs: 9 * H + 35 * M - (7 - run) * 5 * M,
      pinged: 37,
      skipped: 3,
      failed: 1,
      recovered: 0,
      lines: [
        runLines(run)[0]!,
        'wall-e  GET http://10.42.10.11:8000/health  200 OK (38 ms)',
        'eve  GET http://10.42.10.12:8000/health  200 OK (41 ms)',
        'bumblebee  GET http://10.42.10.13:8000/health  200 OK (40 ms)',
        'robby  SKIPPED (Offline)',
        'sonny  GET http://10.42.10.74:8000/health  FAIL connect timed out after 10000 ms',
        'dalek  SKIPPED (Offline)',
        'mother  RESERVED — not overridden',
      ],
    }));
    lab.orca.audit = [
      { atMs: 8 * H + 2 * M + 11000, who: 'tate', action: 'NOTE_ADDED', entity: 'Robot', entityId: 26 },
      { atMs: 7 * H + 40 * M, who: 'morgan', action: 'UPDATED', entity: 'Robot', entityId: 40, diff: { status: ['AVAILABLE', 'RESERVED'] } },
      { atMs: -24 * H + 16 * H + 2 * M, who: 'bulk-import', action: 'UPDATED', entity: 'ScreenLocation', entityId: 30, diff: { xMm: [22.5, 22.0] } },
      { atMs: -3 * 24 * H + 11 * H + 20 * M, who: 'jared', action: 'UPDATED', entity: 'ScreenLocation', entityId: 31, diff: { yMm: [58.0, 58.5] } },
    ];
    // Hosts (VMs).
    lab.hosts['orca-vm'] = createHost('orca-vm', 'vm', 'orca', '10.42.1.10', { aliases: ['orca.lab.local'], services: { orca: { name: 'orca', running: true, port: 8080 } as never, mysql: { name: 'mysql', running: true, port: 3306 } as never } });
    lab.hosts['jenkins-vm'] = createHost('jenkins-vm', 'vm', 'jenkins', '10.42.1.11', { aliases: ['jenkins.lab.local'], services: { jenkins: { name: 'jenkins', running: true, port: 8080 } as never } });
    lab.hosts['ollama-vm'] = createHost('ollama-vm', 'vm', 'ollama', '10.42.1.12', { services: { ollama: { name: 'ollama', running: true, port: 11434 } as never, 'open-webui': { name: 'open-webui', running: true, port: 3000 } as never } });
    lab.hosts['pi-40'] = createHost('pi-40', 'pi', 'cam-rackb', '10.42.10.40', { services: { 'camera-stream': { name: 'camera-stream', running: true, port: 8081 } as never } });
    lab.hosts['ws-17'] = createHost('ws-17', 'workstation', 'ws-17', '10.42.50.17');
    // A Jenkins checkout on WALL-E (lockout demo).
    lab.orca.robots[1]!.checkout = { buildId: 'Java/uia-remote-regression-flex#4127', jobId: 'Java/uia-remote-regression-flex', byName: false, startedMs: 9 * H + 41 * M + 7000, statusAtCheckout: 'AVAILABLE', kind: 'jenkins' };
    const walle = lab.rigs['wall-e']!;
    walle.dashboardLocked = true;
    walle.lockedBy = { kind: 'jenkins', ref: 'Java/uia-remote-regression-flex#4127' };
    // EVE: lock released, yellow.
    const eve = lab.rigs.eve!;
    eve.banner = 'yellow';
    eve.magneticLock.engaged = false;
    eve.tablet.statusText = 'Status: LOCK RELEASED — PARK REQUIRED';
    eve.bannerText = eve.tablet.statusText;
    eve.gantry.xMm = 22;
    eve.gantry.yMm = 58.5;
    // Workstation files.
    lab.workstation.files['~/Downloads/walle_receipt_0912.jpg'] = 'img:receipt:wall-e:0912';
    lab.workstation.files['~/Pictures/'] = '';
    lab.config.forceHealthCheckAllowed = true;
  });
}
