/**
 * sim-core — the physical lab + Orka half of the simulation (Sim = docs/design/40-simulation.md).
 *
 * This barrel is the documented helper surface for code outside `src/sim/core` (the impl wiring, and
 * sim-devops' terminal / runners when `CoreServices` does not cover a read). Rules for callers:
 *  - every function takes the `lab` of the current transaction (immer draft or a plain lab while a
 *    preset is built) and never opens its own `transact()`;
 *  - functions with a `ctx` parameter may mutate state and emit events; the rest are pure reads
 *    (except `reach`, which advances the damaged-cable attempt counter and draws LAN latency from the
 *    `devices` stream unless `{ noLatency: true }`);
 *  - all text they return (console lines, tool output, HTTP bodies) is exact per Sim §3.
 *
 * Systems (tick slots of Sim §3.1.1) are exported for `src/sim/impl` only.
 */

/* ── tick systems (slots 2–8 and 13–15) ── */
export { powerStep } from './power';
export { hostsStep } from './hosts';
export { networkStep } from './network';
export { rigsStep } from './rigs';
export { devicesStep } from './devices';
export { kollisStep } from './kollis';
export { orkaStep } from './orka/sync';
export { lazoStep, printer3dStep } from './lazo';
export { faultsStep } from './faults/engine';

/* ── network & workstation ADB (Sim §1.9, §3.15) ── */
/** Resolve `ip | ip:port | hostname | alias` to a host or LabSim device. Pure. */
export { resolve, reach, hostNetUp, deviceNetUp, listening } from './network';
/** Workstation ADB server state: connect (5555 default), disconnect, kill-server, devices, shell/exec-out/pull/logcat/tcpip, UIA dumps. */
export { adbConnect, adbDisconnect, adbKillServer, adbDevicesLines, adbShell, uiDump, adbTargetDevice } from './adb';

/* ── hosts (Sim §3.14) ── */
export {
  hostService,
  hostReboot,
  hostPowerCycle,
  hostPowerButton,
  hostSetEthernet,
  hostPlugUsb,
  hostWriteFile,
  hostDeletePath,
  hostCleanDisk,
  hostRunSchedTask,
  diskFreeGb,
  kallusScreenText,
  parseControllerYaml,
  gorthMainCardFiles,
  gorthCardFilesAt,
  corp_LOGS,
  DEBUG_LOG,
} from './hosts';

/* ── power (Sim §3.13) ── */
export { measure, moveToOutlet, plug, unplug, removeFuse, insertFuse, replaceFuse, toggleStrip, togglePsu, toggleRegulator, resetBreaker, fuseBranchLive } from './power';

/* ── Orka (Sim §3.2–§3.6, §3.23) ── */
export { orkaDown, robotByName, setRobotStatus, noteDisplayText, manualCheckoutToast, STATUSES } from './orka/status';
export { piHealth, piIpOf, runHealthCheck } from './orka/health';
export { capabilityDocument, checkout, release, matchPreview, parseCapsJson, isDeviceTypeConstant, summary, firstMismatch, CANONICAL_KEYS } from './orka/checkout';
export { xyTouch, xyTouchLine, xyTarget } from './orka/xyTouch';
export { rigOf, saveRobot, saveDevice, saveCapability, saveMerchant, saveScreen, saveScreenLocation, saveCardProfile, saveScreenCompareImage, deleteEntity, resolveNote, addManualNote } from './orka/entities';
export { syncScreenLocationFile, syncAllFromGorth } from './orka/sync';
export { http, orkaRest } from './rest';

/* ── probes, Kallus, Lazo, printers (Sim §3.6, §3.16, §3.17, §3.24) ── */
export { cardAction, kallusStatusBody, probeState, reseatRibbon } from './kollis';
export { startLazo, printerStart } from './lazo';

/* ── devices (Sim §3.8–§3.11) ── */
export {
  layoutButtons,
  liveElements,
  pageObjectName,
  receiptOptionsFor,
  customerSide,
  ownerOf,
  merchantOf,
  deviceTouch,
  deviceStroke,
  pressKey,
  enterText,
  presentCardByHand,
  swapHardware,
  provisionDevice,
  devicePressPower,
  roundHalfUp,
} from './devices';

/* ── rigs (Sim §3.7) ── */
export { rigCommand, dragCarriage, setDoor, setSwitch, reseat, replaceCradle, alignDipArm, moveMotorUsb, aimWebcam, controllerReachable, motionProblem, motorPowered, BANNER_TEXT, LOCKOUT_OVERLAY } from './rigs';

/* ── cameras & OCR (Sim §2.11, §3.12) ── */
export { screenCompare, tesseract, frameOf, cameraProbe, cameraSnapshot, captureScreencap, captureWebcam, canonicalCompareMatch } from './ocr';

/* ── flags, faults, presets (Sim §1.2, §4, §6.5) ── */
export { applyFlag, setDeviceQrFirmware } from './flags';
export { injectFault, clearFault, faultResolved, applySetupOp, applyScenario, faultCatalogue, setupCatalogue, capFaults, CORE_FAULTS, CORE_FAULT_IDS, CORE_SETUP_OPS } from './faults/engine';
export { firmwareTruth } from './faults/defsData';
export { stageDevice } from './faults/setupOps';
export { buildPresetLab, parsePreset, snapScale, PRESET_NAMES, PRESET_TABLE, ACADEMY_SCENARIOS } from './presets';

/* ── utilities ── */
export { addTimer, cancelTimers, postChat, log, rand, detachedCtx, takeDue } from './util';
export { ro, roAt } from './ro';
export type { Ctx, SubStep } from './util';
