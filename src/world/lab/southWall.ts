/**
 * South wall team-history wall (World §1.4 "South wall", §6.4, §9.2): `TEAM HISTORY` title vinyl,
 * four black frames (Semi, Sedi, IPX, PayCore) and the plaque board for the M18 match game.
 */
import { MeshStandardMaterial } from 'three';
import { HISTORY_FRAMES, getProp } from '../layout';
import { StaticBatch, xf } from './kit/batch';
import { addPrint, type LabCtx } from './kit/context';
import { FONT, fitText } from './kit/draw';
import { pickVerbs } from './kit/runtime';
import { focusBoardAt, screwAt } from './kit/shared';
import { drawHistoryFrame } from './props/posters';

const FACE_Z = 4.999;
const ROT = Math.PI; // local +Z → world −Z

export function buildSouthWall(ctx: LabCtx): void {
  const { mats } = ctx;
  const b = new StaticBatch('south-wall');
  const wh = getProp('wall.history');
  // title vinyl
  addPrint(ctx.prints, b, 1.2, 0.12, 1200, 120, (g, w, h) => {
    g.fillStyle = '#ecebe7';
    g.fillRect(0, 0, w, h);
    fitText(g, 'TEAM HISTORY', w, h, { color: '#1f2328', font: FONT.UI_SANS, weight: 900, marginY: 0.1 });
  }, xf(wh.pos[0], 1.95, FACE_Z - 0.0008, 0, ROT, 0));
  b.box(1.0, 0.006, 0.002, ctx.engine.materials.get('lab.vinylGreen', () => new MeshStandardMaterial({ color: '#43b02a', roughness: 0.5 })), wh.pos[0], 1.88, FACE_Z - 0.001, 0, 'none');

  for (const key of HISTORY_FRAMES) {
    const p = getProp(`wall.history.${key}`);
    const [fw, , fh] = p.size!;
    b.at(p.pos[0], p.pos[1], FACE_Z, ROT, () => {
      b.box(fw, fh, 0.02, mats.satinBlack, 0, 0, 0.01);
      b.box(fw - 0.05, fh - 0.05, 0.002, mats.paperWhite, 0, 0, 0.0205, 0, 'none'); // mat board
      addPrint(ctx.prints, b, fw - 0.09, fh - 0.09, 360, 450, (g, w, h) => drawHistoryFrame(g, w, h, key), xf(0, 0, 0.0218));
      b.box(fw - 0.03, fh - 0.03, 0.002, mats.glassClear, 0, 0, 0.0232, 0, 'none');
    });
    ctx.ia.register(`wall.history.${key}`, ctx.ia.proxy(ctx.root, fw, fh, 0.04, xf(p.pos[0], p.pos[1], FACE_Z - 0.02), key), () => []);
  }

  // plaque board with 5 plaques
  const pm = getProp('wall.history.match');
  const [pw, , ph] = pm.size!;
  const walnut = ctx.engine.materials.get('lab.walnut', () => new MeshStandardMaterial({ color: '#5a3a22', roughness: 0.5 }));
  const brassPlate = ctx.mats.brass;
  b.at(pm.pos[0], pm.pos[1], FACE_Z, ROT, () => {
    b.box(pw, ph, 0.02, walnut, 0, 0, 0.01);
    const names = ['Semi', 'Sedi', 'IPX', 'PayCore', 'Core OS'];
    names.forEach((n, i) => {
      const x = -pw / 2 + 0.2 + i * ((pw - 0.4) / 4);
      b.box(0.3, 0.14, 0.004, brassPlate, x, 0, 0.022);
      addPrint(ctx.labels, b, 0.27, 0.11, 270, 110, (g, w, h) => {
        g.fillStyle = '#c9a24a';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#8a6a22';
        g.lineWidth = 3;
        g.strokeRect(4, 4, w - 8, h - 8);
        fitText(g, n, w, h, { color: '#2a1c08', font: FONT.UI_SANS, weight: 800, marginY: 0.22 });
      }, xf(x, 0, 0.0245));
      screwAt(ctx, b, x - 0.13, 0.05, 0.024, [0, 0, 1], 'nut');
      screwAt(ctx, b, x + 0.13, -0.05, 0.024, [0, 0, 1], 'nut');
    });
  });
  const matchProxy = ctx.ia.proxy(ctx.root, pw, ph, 0.05, xf(pm.pos[0], pm.pos[1], FACE_Z - 0.025), 'match');
  ctx.statics.add(b);
  ctx.ia.register('wall.history.match', matchProxy, () =>
    pickVerbs([{ key: 'E', label: 'Match teams', run: () => focusBoardAt(ctx, 'wall.history.match', [pm.pos[0], 1.4, FACE_Z], [0, 0, -1], 'historyMatch.open') }]),
  );
}
