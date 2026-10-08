/**
 * Receipt paper strips (World §3.3 step 6): a 58 mm paper strip feeds out of a device's printer slot
 * when the sim prints (`device.printer.lastPayloadMs` changes), textured with `render2d.drawReceipt`
 * of `device.lastReceipt`. It grows to at most 120 mm over 1.2 s (the receipt top leaves the slot
 * first), curls up 25° off the printer face, and is torn off (hidden) 45 s after printing or when the
 * device prints again / loses its paper.
 */
import { CanvasTexture, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import type { TerminalDevice, LabState } from '@/sim/types';
import { render2d } from '@/render2d';
import type { DeviceAnchors } from '../devices';

const PX_PER_MM = 4;
const WIDTH_MM = 58;
const MAX_LEN_MM = 120;
const FEED_MS = 1200;
const TEAR_MS = 45_000;
const CURL = (25 * Math.PI) / 180;

interface Strip {
  key: string;
  root: Group;
  mesh: Mesh;
  tex: CanvasTexture;
  canvas: HTMLCanvasElement;
  resolve: (lab: LabState) => TerminalDevice | undefined;
  active: () => boolean;
  text: string | null;
  fullLenMm: number;
}

export class ReceiptStrips {
  readonly root = new Group();
  private readonly strips: Strip[] = [];

  constructor() {
    this.root.name = 'receipt-strips';
  }

  /**
   * A strip at a device's paper exit. `deviceFrame` = device-local mm → world (metres matrix on mm
   * placements, as passed to `buildDevice`).
   */
  add(key: string, deviceFrame: Matrix4, paper: NonNullable<DeviceAnchors['paper']>, resolve: Strip['resolve'], active: () => boolean = () => true): void {
    const MM = 0.001;
    const pos = new Vector3(...paper.pos).multiplyScalar(MM);
    const dir = new Vector3(...paper.dir).normalize();
    const nrm = new Vector3(...paper.normal).normalize();
    // curl the strip up off the printer face
    const out = dir.clone().multiplyScalar(Math.cos(CURL)).addScaledVector(nrm, Math.sin(CURL)).normalize();
    const face = nrm.clone().multiplyScalar(Math.cos(CURL)).addScaledVector(dir, -Math.sin(CURL)).normalize();
    const side = new Vector3().crossVectors(out, face).normalize();
    // strip basis: local +X = across the paper, +Y = out of the slot, +Z = printed face
    const basis = new Matrix4().makeBasis(side, out, face).setPosition(pos);
    const root = new Group();
    root.matrixAutoUpdate = false;
    root.matrix.copy(deviceFrame.clone().multiply(basis));
    const geo = new PlaneGeometry(WIDTH_MM * MM, 1 * MM);
    geo.translate(0, 0.5 * MM, 0);
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH_MM * PX_PER_MM;
    canvas.height = 8;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new MeshStandardMaterial({ map: tex, roughness: 0.9, side: DoubleSide, color: '#ffffff' });
    mat.name = 'receiptPaper';
    const mesh = new Mesh(geo, mat);
    mesh.name = `receipt:${key}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.visible = false;
    root.add(mesh);
    this.root.add(root);
    this.strips.push({ key, root, mesh, tex, canvas, resolve, active, text: null, fullLenMm: 1 });
  }

  update(lab: LabState): void {
    const now = lab.time?.physMs ?? 0;
    for (const s of this.strips) {
      const dev = s.active() ? s.resolve(lab) : undefined;
      const at = dev?.printer?.lastPayloadMs ?? null;
      const age = at === null ? -1 : now - at;
      const show = !!dev && at !== null && age >= 0 && age < TEAR_MS && dev.printer.paper !== false && !!dev.lastReceipt;
      s.mesh.visible = show;
      if (!show || !dev) continue;
      if (dev.lastReceipt !== s.text) this.redraw(s, dev.lastReceipt!);
      const len = Math.max(1, Math.min(MAX_LEN_MM, s.fullLenMm) * Math.min(1, age / FEED_MS));
      s.mesh.scale.y = len;
      // the strip's tip shows the receipt top; the part at the slot is `len` mm further down
      const k = Math.min(1, len / s.fullLenMm);
      s.tex.repeat.set(1, k);
      s.tex.offset.set(0, 1 - k);
    }
  }

  private redraw(s: Strip, text: string): void {
    s.text = text;
    const w = WIDTH_MM * PX_PER_MM;
    let h = 64;
    try {
      h = Math.max(16, Math.ceil(render2d.receiptHeightPx(text, w)));
    } catch {
      h = 16 + text.split('\n').length * 14;
    }
    s.canvas.width = w;
    s.canvas.height = Math.min(4096, h);
    const ctx = s.canvas.getContext('2d');
    if (!ctx) return;
    try {
      render2d.drawReceipt(ctx, text, { widthPx: w });
    } catch {
      ctx.fillStyle = '#fbfbf8';
      ctx.fillRect(0, 0, w, s.canvas.height);
    }
    s.fullLenMm = s.canvas.height / PX_PER_MM;
    s.tex.dispose();
    s.tex.needsUpdate = true;
  }

  dispose(): void {
    for (const s of this.strips) {
      s.tex.dispose();
      s.mesh.geometry.dispose();
      (s.mesh.material as MeshStandardMaterial).dispose();
    }
    this.root.removeFromParent();
  }
}
