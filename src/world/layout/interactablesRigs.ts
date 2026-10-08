/**
 * Rig-side interactables (World §9.2 "Touch rigs" and "Callus shelf, tethered bench, ADB shelf"):
 * rack rails, rack distribution, the 8 touch rigs (every part id), Collis probes, the tethered
 * faces/docks/probes and the ADB bots. Built by the world-rigs team.
 */
import { DEVICE_MODELS } from './devices';
import { SHELF_IDS, collisId, rigPartId, touchRigPartList } from './ids';
import { E, G, R, REACH, ia, deviceVerbs, fuseVerbs, piVerbs, webcamVerbs, SCREWDRIVER, MULTIMETER, type InteractableSpec } from './interactionSpec';
import { RACK_DISTRIBUTION } from './power';
import { RACKS, railUnitId, RACK_FRAME } from './racks';
import { ADB_RIGS, TETHERED_RIGS, TOUCH_RIGS, deviceConfigFor, type TouchRigDef } from './rigs';

/* ───────────────────────────── Racks ───────────────────────────── */

export function rackCatalogue(): InteractableSpec[] {
  const out: InteractableSpec[] = [];
  for (const rack of RACKS) {
    out.push(ia(`${rack.id}.rails`, `Rack ${rack.letter} rails`, [], ['Rack units 1–42 (EIA-310)'], 'rack-row', 'rigs'));
    for (let n = 1; n <= RACK_FRAME.units; n++) {
      for (const side of ['left', 'right'] as const) {
        out.push(ia(railUnitId(rack.id, n, side), `Rack unit ${n}`, [], [`U${n}`], 'rack-row', 'rigs', { propId: `${rack.id}.rails` }));
      }
    }
  }
  for (const d of RACK_DISTRIBUTION) {
    const L = d.id.slice(-1).toUpperCase();
    out.push(
      ia(d.id, 'Rack distribution', [E('Measure 5 V / 24 V', { requiresTool: MULTIMETER, sim: `sim.power.measure('rail-5v-${L.toLowerCase()}') / sim.power.measure('rail-24v')` })], [
        `5V 10A from F-5V-${L} · 24V motor feed`,
      ], 'rack-row', 'rigs'),
    );
  }
  out.push(ia(SHELF_IDS.rackBCameraPi, 'Rack B camera Pi', piVerbs('pi-cam-rackb'), ['Shared camera — four webcams, one stream'], 'rack-row', 'rigs'));
  return out;
}

/* ───────────────────────────── Touch rigs ───────────────────────────── */

function touchRigEntries(rig: TouchRigDef): InteractableSpec[] {
  const id = rig.id;
  const hrn = rig.hrn;
  const sim = rig.sim;
  const out: InteractableSpec[] = [];
  const cfg = deviceConfigFor(rig);
  const model = DEVICE_MODELS[cfg.type];
  const inBay = { reach: REACH.inBay };
  const z = 'rack-row' as const;
  const b = 'rigs' as const;

  for (const part of touchRigPartList(rig)) {
    const pid = rigPartId(id, part);
    switch (part) {
      case 'tablet':
        out.push(ia(pid, `Status tablet — ${hrn}`, [
          E('Use tablet', { effect: `engine.focus(tabletFocusPose); mutate(s => { s.ui.overlay = { kind: 'tablet', robotId: '${id}' } })` }),
        ], [hrn, 'Status: OK', 'Brainbox v6', 'Tabs: Robot / Robot Control / Motion Control'], z, b, { focus: 'tablet' }));
        break;
      case 'power-panel':
        out.push(ia(pid, 'POWER panel', [], ['POWER', 'MAIN — controller (Pi, tablet, webcam)', 'MOTOR — steppers & solenoid', 'Green LEDs: power present'], z, b));
        break;
      case 'switch-main':
      case 'switch-motor': {
        const which = part === 'switch-main' ? 'main' : 'motor';
        out.push(ia(pid, `${which.toUpperCase()} switch`, [
          E('Turn on / off', { sim: `sim.rig.setSwitch('${id}', '${which}', on, 'player')`, effect: 'switch-toggle; allowed during a test (scored GW07)' }),
        ], [], z, b));
        break;
      }
      case 'side-panel':
        out.push(ia(pid, 'Side panel', [], rig.sidePanelText ? ['SETI — USB ports for the Minix box / Raspberry Pi'] : ['USB ports for the Minix box / Raspberry Pi'], z, b));
        break;
      case 'door':
        out.push(ia(pid, 'Side door', [E('Open / Close')], ['Hex-mesh side door'], z, b));
        break;
      case 'carriage':
        out.push(ia(pid, 'Gantry head', [
          E('Push head', { input: 'drag', when: 'Open the side door first', sim: `sim.rig.pushHead('${id}', dxMm, dyMm, 'player')`, effect: '> 3 mm breaks the magnetic lock (maglock-break)' }),
          E('Nudge 20 mm', { when: 'Open the side door first', sim: `sim.rig.pushHead('${id}', 20, 0, 'player')`, effect: 'accessibility alternative to dragging' }),
        ], ['Carriage — magnetically coupled to the belt'], z, b, inBay));
        break;
      case 'solenoid':
        out.push(ia(pid, 'Solenoid probe', [
          R('Re-seat connector', { when: 'Only when the connector hangs loose (INC15)', sim: `sim.rig.reseat('${id}', 'solenoid')`, proposed: true }),
        ], ['Blue push-pull solenoid', '~10 mm plunger travel', 'Rubber tip'], z, b, inBay));
        break;
      case 'solenoid-connector':
        // Visual sub-part of the solenoid (INC15 loose state); interaction lives on `solenoid`.
        break;
      case 'stepper-x':
      case 'stepper-y':
        out.push(ia(pid, `${part === 'stepper-x' ? 'X' : 'Y'} stepper`, [], ['NEMA-17', 'GT2 pulley', 'V-slot wheels', '2020 extrusion'], z, b, inBay));
        break;
      case 'limit-x':
      case 'limit-y': {
        const axis = part === 'limit-x' ? 'X' : 'Y';
        out.push(ia(pid, `Limit switch ${axis}`, [E('Press lever', { effect: `limit-click; tablet toast LIMIT ${axis} while held` })], ['Limit switch — physical (0,0)'], z, b, inBay));
        break;
      }
      case 'dip-arm':
        out.push(ia(pid, 'Dip arm', [
          E('Loosen hub bolts', { requiresTool: SCREWDRIVER, effect: '2.5 mm bit; then the mouse wheel rotates the arm one gear tooth per notch' }),
          E('Rotate one tooth', { input: 'wheel', when: 'Loosen the hub bolts first' }),
          E('Tighten', { requiresTool: SCREWDRIVER, sim: `sim.rig.setDipAlignment('${id}', teethOffset)  (sim doc: rig.alignDipArm)`, proposed: true }),
        ], ['Dip arm', 'Sector gear "63"', 'White card insert → chip slot'], z, b, inBay));
        break;
      case 'tap-paddle':
        out.push(ia(pid, 'Tap paddle', [], ['Tap paddle — Collis NFC antenna'], z, b, inBay));
        break;
      case 'phone-sled':
        out.push(ia(pid, 'Phone carriage', [], ['Phone carriage & power-button pusher'], z, b, inBay));
        break;
      case 'motor-pcb':
        out.push(ia(pid, 'Motor controller PCB', id === 'eve'
          ? [E('Move EVE MOTION cable to the Pi', { when: 'INC19 only', sim: "sim.rig.moveMotionCable('eve', 'pi')", proposed: true })]
          : [], ['25-PIN MOTOR CTRL · MADE IN HONG KONG'], z, b, inBay));
        break;
      case 'cradle':
        out.push(ia(pid, 'Cradle', [
          E('Remove / fit clamp bolts', { requiresTool: SCREWDRIVER, effect: '2 × M2.5 per side clamp' }),
          E('Lift device', { when: 'Remove the clamp bolts and unplug the device first', effect: 'carry the device' }),
          E('Install', { when: 'Carrying a device', sim: `sim.device.swapHardware('${id}', newType, 'player')` }),
        ], ['Angled 3D-printed cradle (black PLA)'], z, b, inBay));
        break;
      case 'device':
      case 'mfd':
      case 'cfd': {
        const secondary = part === 'cfd';
        const screen = secondary ? model.secondary! : model.screen!;
        const name = part === 'device' ? model.displayName : `${model.displayName} ${part.toUpperCase()}`;
        out.push(ia(pid, `${name} — ${hrn}`, deviceVerbs('touch-screen'), [name, `Screen ${screen.mm[0]} × ${screen.mm[1]} mm`, '(0,0) = top-left'], z, b, { ...inBay, focus: 'touch-screen' }));
        break;
      }
      case 'device-psu':
        out.push(ia(pid, 'Device power brick', [
          E('Unplug / Plug', { sim: `sim.power.unplug('${sim.deviceLoadIds[0]}') / sim.power.plug('${sim.deviceLoadIds[0]}', hookup)`, effect: 'socket picker (strip sockets, DC taps)' }),
        ], ['18V AC brick — AC strip only'], z, b, inBay));
        break;
      case 'pi':
        out.push(ia(pid, `Raspberry Pi — ${hrn}`, piVerbs(sim.piHostId), ['Robot Pi / Robot Controller · ~$50', 'PWR red · ACT green'], z, b, inBay));
        break;
      case 'pi-power':
        out.push(ia(pid, 'Pi power lead', [E('Unplug / Plug', { sim: `sim.power.unplug('${sim.piLoadId}') / sim.power.plug('${sim.piLoadId}', hookup)` })], [`5V USB-C from F-${hrn}-5V`], z, b, inBay));
        break;
      case 'pi-ethernet':
        out.push(ia(pid, 'Ethernet cable', [
          E('Unplug / Re-seat', { sim: `sim.host.setEthernet('${sim.piHostId}', connected, 'player')` }),
          R('Replace cable', { requiresTool: 'ethernet-cable', sim: `sim.host.setEthernet('${sim.piHostId}', true, 'player')` }),
        ], ['Cat6 → rack switch'], z, b, inBay));
        break;
      case 'fuse':
        out.push(ia(pid, `Inline fuse F-${hrn}-5V`, fuseVerbs(sim.bayFuseId!), ['ATO blade fuse · 10 A'], z, b, inBay));
        break;
      case 'webcam':
        out.push(ia(pid, 'Webcam', webcamVerbs(id), ['Webcam → camera stream'], z, b));
        break;
      default:
        break;
    }
  }

  out.push(
    ia(collisId(id), `Collis probe — ${hrn}`, [
      E('Re-seat rear ribbon', { sim: `sim.collis.reseatRibbon('${sim.collisId}', 'player')` }),
      R('Unplug / Plug PSU', { sim: `sim.power.unplug('${sim.collisLoadId}') / sim.power.plug('${sim.collisLoadId}', hookup)`, effect: 'socket picker' }),
    ], ['UL Transaction Security', `Rear ribbon cable → ${hrn}'s card reader`, 'Power: AC strip'], z, b),
  );
  return out;
}

export function touchRigCatalogue(): InteractableSpec[] {
  return TOUCH_RIGS.flatMap(touchRigEntries);
}

/* ───────────────────────────── Tethered bench ───────────────────────────── */

export function tetheredCatalogue(): InteractableSpec[] {
  const out: InteractableSpec[] = [];
  for (const rig of TETHERED_RIGS) {
    for (const f of [rig.mfd, rig.cfd]) {
      out.push(ia(f.id, `${rig.hrn} ${f.role.toUpperCase()} (${rig.env})`, [
        E('Look at screen', { effect: 'uprightFocusPose' }),
        R('Tap screen', { sim: "sim.device.touch(deviceId, 'primary', xMm, yMm, 'player')", when: 'Locked — test in progress' }),
      ], [f.callout, f.role === 'mfd' ? 'Merchant Facing Device' : 'Customer Facing Device'], 'rack-row', 'rigs', { focus: 'upright' }));
      out.push(ia(f.dockId, 'Connectivity hub', [
        E('Re-seat USB', { sim: "sim.device.reseatHub(deviceId, 'usb')", proposed: true }),
        R('Re-seat Ethernet', { sim: "sim.device.reseatHub(deviceId, 'ethernet')", proposed: true }),
        G('Re-seat power', { sim: "sim.device.reseatHub(deviceId, 'power')", proposed: true }),
      ], ['LabSim connectivity hub: Ethernet, USB, power'], 'rack-row', 'rigs'));
    }
    out.push(ia(rig.smartstripe.id, 'SmartStripe Probe', [
      E('Re-seat probe', { sim: `sim.rig.reseat('${rig.id}', 'smartstripe')`, proposed: true }),
    ], ['SmartStripe Probe (USB)'], 'rack-row', 'rigs'));
  }
  out.push(
    ia(SHELF_IDS.tetheredPi, 'Raspberry Pi', piVerbs('pi-tethered'), ['One Robot Pi per shelf'], 'rack-row', 'rigs'),
    ia(SHELF_IDS.tetheredWebcam, 'Webcam', webcamVerbs('megatron'), ['Webcam → camera stream'], 'rack-row', 'rigs'),
  );
  return out;
}

/* ───────────────────────────── ADB shelf ───────────────────────────── */

export function adbCatalogue(): InteractableSpec[] {
  const out: InteractableSpec[] = [];
  for (const rig of ADB_RIGS) {
    out.push(ia(rig.propId, rig.hrn, deviceVerbs('upright'), ['ADB bot — no physical touch, no PIN'], 'rack-row', 'rigs', { focus: 'upright' }));
  }
  out.push(
    ia(SHELF_IDS.adbPi, 'Raspberry Pi', piVerbs('pi-adb-shelf'), ['One Robot Pi per shelf'], 'rack-row', 'rigs'),
    ia(SHELF_IDS.adbWebcam, 'Webcam', webcamVerbs('data'), ['Webcam → camera stream'], 'rack-row', 'rigs'),
  );
  return out;
}
