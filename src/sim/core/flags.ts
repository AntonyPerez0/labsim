/**
 * Lab flags with rollout effects (Sim §1.2, §3.10, §2.10.2): the "Scan for receipt" firmware rollout
 * and Cur M16's tutorial "CFD layout v2" toggle. Used by `sim.setFlag`, the `flag.set` setup op and the
 * `receipt.qrRollout` fault.
 */
import type { TerminalDevice, LabFlags, LabState } from '../types';
import type { Ctx } from './util';
import { receiptOptionsFor } from './devices';

/** Firmware strings (Sim §2.4): QR firmware 2.26.10.1, pre-QR 2.26.08.3; FLEX_1 stays on 2.19.4. */
export const FW_QR = '2.26.10.1';
export const FW_PRE_QR = '2.26.08.3';
export const FW_FLEX1 = '2.19.4';
/** Device the M16 toggle changes (R2-D2's Duo). */
export const CFD_V2_DEVICE = 'dev-r2-d2-duo';

/** Re-render a device's receipt screens after a firmware change (Sim §3.10: `display.rev++`). */
function rerenderReceipt(lab: LabState, d: TerminalDevice): void {
  for (const ds of [d.display, d.secondaryDisplay]) {
    if (!ds || ds.screen !== 'receipt-options') continue;
    const n = receiptOptionsFor(lab, d);
    if (ds.receiptOptions !== n) ds.receiptOptions = n;
    ds.rev += 1;
  }
}

/**
 * Set a device's QR firmware (no-op for FLEX_1, which never gets the feature). Returns true when the
 * device changed. `write` lets the fault engine record the leaves it writes.
 */
export function setDeviceQrFirmware(lab: LabState, d: TerminalDevice, on: boolean, write?: (path: (string | number)[], value: unknown) => void): boolean {
  if (d.type === 'FLEX_1') return false;
  const version = on ? FW_QR : FW_PRE_QR;
  if (d.firmwareInfo.receiptQr === on && d.firmwareInfo.version === version && d.firmware === version) return false;
  if (write) {
    write(['devices', d.id, 'firmwareInfo'], { version, receiptQr: on });
    write(['devices', d.id, 'firmware'], version);
  } else {
    d.firmwareInfo = { version, receiptQr: on };
    d.firmware = version;
  }
  rerenderReceipt(lab, d);
  return true;
}

/** Apply a flag value and its rollout effects (Sim §3.10, §2.10.2). Emits `flags.changed` when it changed. */
export function applyFlag<K extends keyof LabFlags>(lab: LabState, ctx: Ctx, flag: K, value: LabFlags[K]): boolean {
  if (lab.flags[flag] === value) return false;
  lab.flags[flag] = value;
  if (flag === 'receiptQrFeature') {
    // Lab-wide firmware rollout: every non-FLEX_1 device (Orca rows never change).
    for (const id of Object.keys(lab.devices).sort()) setDeviceQrFirmware(lab, lab.devices[id]!, value === true);
  } else if (flag === 'cfdLayoutV2Toggle') {
    // Cur M16 tutorial toggle: v2 copy + 10 px label shift on R2-D2's CFD (both, §2.10.2).
    const d = lab.devices[CFD_V2_DEVICE];
    if (d) {
      d.cfdLayout = value ? 'v2' : 'v1';
      d.labelShiftPx = value ? 10 : 0;
      if (d.secondaryDisplay) d.secondaryDisplay.rev += 1;
    }
  }
  ctx.emit('flags.changed', { flag, value: value as string | boolean });
  return true;
}
