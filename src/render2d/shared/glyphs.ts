/**
 * Small vector pictograms used on device screens and the tablet (drawn in canvas px around a
 * centre point with a nominal size `s` = glyph box edge in px). Line art only, no fonts needed.
 */
type Ctx = CanvasRenderingContext2D;

function stroke(c: Ctx, color: string, w: number): void {
  c.strokeStyle = color;
  c.lineWidth = Math.max(1, w);
  c.lineCap = 'round';
  c.lineJoin = 'round';
}

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

export function contactless(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  c.save();
  stroke(c, color, s * 0.08);
  for (let i = 0; i < 4; i++) {
    const r = s * (0.12 + i * 0.12);
    c.beginPath();
    c.arc(cx - s * 0.25, cy, r, -Math.PI / 3.2, Math.PI / 3.2);
    c.stroke();
  }
  c.restore();
}

export function card(c: Ctx, cx: number, cy: number, s: number, color: string, kind: 'chip' | 'swipe' | 'plain' = 'plain'): void {
  const w = s * 0.86;
  const h = w * 0.63;
  c.save();
  stroke(c, color, s * 0.06);
  rr(c, cx - w / 2, cy - h / 2, w, h, s * 0.07);
  c.stroke();
  if (kind === 'chip') {
    c.fillStyle = color;
    rr(c, cx - w * 0.36, cy - h * 0.18, w * 0.2, h * 0.3, s * 0.03);
    c.fill();
  }
  if (kind === 'swipe') {
    c.fillStyle = color;
    c.fillRect(cx - w / 2, cy - h * 0.28, w, h * 0.16);
  }
  c.restore();
}

export function arrow(c: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, w: number): void {
  c.save();
  stroke(c, color, w);
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hl = w * 3;
  c.moveTo(x2, y2);
  c.lineTo(x2 - hl * Math.cos(a - 0.5), y2 - hl * Math.sin(a - 0.5));
  c.moveTo(x2, y2);
  c.lineTo(x2 - hl * Math.cos(a + 0.5), y2 - hl * Math.sin(a + 0.5));
  c.stroke();
  c.restore();
}

export function insertCard(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  card(c, cx, cy + s * 0.12, s * 0.8, color, 'chip');
  arrow(c, cx, cy - s * 0.48, cx, cy - s * 0.2, color, s * 0.06);
}

export function swipeCard(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  card(c, cx - s * 0.06, cy, s * 0.8, color, 'swipe');
  arrow(c, cx + s * 0.2, cy + s * 0.36, cx + s * 0.5, cy + s * 0.36, color, s * 0.06);
}

export function printer(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  c.save();
  stroke(c, color, s * 0.07);
  rr(c, cx - s * 0.42, cy - s * 0.12, s * 0.84, s * 0.36, s * 0.06);
  c.stroke();
  c.strokeRect(cx - s * 0.26, cy - s * 0.42, s * 0.52, s * 0.3);
  c.beginPath();
  c.rect(cx - s * 0.26, cy + s * 0.1, s * 0.52, s * 0.32);
  c.fillStyle = color;
  c.globalAlpha = 0.25;
  c.fill();
  c.globalAlpha = 1;
  c.stroke();
  c.restore();
}

export function envelope(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  c.save();
  stroke(c, color, s * 0.07);
  c.strokeRect(cx - s * 0.42, cy - s * 0.28, s * 0.84, s * 0.56);
  c.beginPath();
  c.moveTo(cx - s * 0.42, cy - s * 0.28);
  c.lineTo(cx, cy + s * 0.05);
  c.lineTo(cx + s * 0.42, cy - s * 0.28);
  c.stroke();
  c.restore();
}

export function chatBubble(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  c.save();
  stroke(c, color, s * 0.07);
  rr(c, cx - s * 0.42, cy - s * 0.32, s * 0.84, s * 0.52, s * 0.14);
  c.stroke();
  c.beginPath();
  c.moveTo(cx - s * 0.18, cy + s * 0.2);
  c.lineTo(cx - s * 0.28, cy + s * 0.42);
  c.lineTo(cx + s * 0.02, cy + s * 0.2);
  c.stroke();
  c.restore();
}

export function padlock(c: Ctx, cx: number, cy: number, s: number, color: string, filled = false): void {
  c.save();
  stroke(c, color, s * 0.08);
  c.beginPath();
  c.arc(cx, cy - s * 0.12, s * 0.22, Math.PI, 0);
  c.lineTo(cx + s * 0.22, cy + s * 0.02);
  c.moveTo(cx - s * 0.22, cy + s * 0.02);
  c.lineTo(cx - s * 0.22, cy - s * 0.12);
  c.stroke();
  rr(c, cx - s * 0.36, cy, s * 0.72, s * 0.48, s * 0.07);
  if (filled) {
    c.fillStyle = color;
    c.fill();
  } else c.stroke();
  c.restore();
}

export function check(c: Ctx, cx: number, cy: number, s: number, color: string, w = 0.12): void {
  c.save();
  stroke(c, color, s * w);
  c.beginPath();
  c.moveTo(cx - s * 0.3, cy + s * 0.02);
  c.lineTo(cx - s * 0.08, cy + s * 0.24);
  c.lineTo(cx + s * 0.34, cy - s * 0.22);
  c.stroke();
  c.restore();
}

export function cross(c: Ctx, cx: number, cy: number, s: number, color: string, w = 0.12): void {
  c.save();
  stroke(c, color, s * w);
  c.beginPath();
  c.moveTo(cx - s * 0.26, cy - s * 0.26);
  c.lineTo(cx + s * 0.26, cy + s * 0.26);
  c.moveTo(cx + s * 0.26, cy - s * 0.26);
  c.lineTo(cx - s * 0.26, cy + s * 0.26);
  c.stroke();
  c.restore();
}

export function backspace(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  c.save();
  stroke(c, color, s * 0.08);
  c.beginPath();
  c.moveTo(cx - s * 0.45, cy);
  c.lineTo(cx - s * 0.2, cy - s * 0.26);
  c.lineTo(cx + s * 0.42, cy - s * 0.26);
  c.lineTo(cx + s * 0.42, cy + s * 0.26);
  c.lineTo(cx - s * 0.2, cy + s * 0.26);
  c.closePath();
  c.stroke();
  cross(c, cx + s * 0.1, cy, s * 0.5, color, 0.16);
  c.restore();
}

/** Spinner ring with a bright arc at `angle` radians. */
export function spinner(c: Ctx, cx: number, cy: number, r: number, angle: number, color: string, track: string): void {
  c.save();
  stroke(c, track, r * 0.18);
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.stroke();
  stroke(c, color, r * 0.18);
  c.beginPath();
  c.arc(cx, cy, r, angle, angle + Math.PI * 0.6);
  c.stroke();
  c.restore();
}

export function shield(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  c.save();
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(cx, cy - s * 0.45);
  c.lineTo(cx + s * 0.36, cy - s * 0.3);
  c.quadraticCurveTo(cx + s * 0.34, cy + s * 0.25, cx, cy + s * 0.48);
  c.quadraticCurveTo(cx - s * 0.34, cy + s * 0.25, cx - s * 0.36, cy - s * 0.3);
  c.closePath();
  c.fill();
  c.restore();
}

export function search(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  c.save();
  stroke(c, color, s * 0.1);
  c.beginPath();
  c.arc(cx - s * 0.08, cy - s * 0.08, s * 0.24, 0, Math.PI * 2);
  c.moveTo(cx + s * 0.1, cy + s * 0.1);
  c.lineTo(cx + s * 0.34, cy + s * 0.34);
  c.stroke();
  c.restore();
}

export function pencil(c: Ctx, cx: number, cy: number, s: number, color: string): void {
  c.save();
  stroke(c, color, s * 0.09);
  c.beginPath();
  c.moveTo(cx - s * 0.3, cy + s * 0.3);
  c.lineTo(cx - s * 0.22, cy + s * 0.08);
  c.lineTo(cx + s * 0.2, cy - s * 0.34);
  c.lineTo(cx + s * 0.34, cy - s * 0.2);
  c.lineTo(cx - s * 0.08, cy + s * 0.22);
  c.closePath();
  c.stroke();
  c.restore();
}

export function receiptGlyph(c: Ctx, cx: number, cy: number, w: number, h: number, color: string): void {
  c.save();
  stroke(c, color, w * 0.06);
  c.beginPath();
  c.moveTo(cx - w / 2, cy - h / 2);
  c.lineTo(cx + w / 2, cy - h / 2);
  c.lineTo(cx + w / 2, cy + h / 2);
  for (let i = 0; i < 4; i++) {
    const x0 = cx + w / 2 - (i * w) / 4;
    c.lineTo(x0 - w / 8, cy + h / 2 - w * 0.08);
    c.lineTo(x0 - w / 4, cy + h / 2);
  }
  c.closePath();
  c.stroke();
  for (let i = 0; i < 4; i++) {
    const y = cy - h * 0.3 + i * h * 0.17;
    c.beginPath();
    c.moveTo(cx - w * 0.3, y);
    c.lineTo(cx + (i === 3 ? w * 0.05 : w * 0.3), y);
    c.stroke();
  }
  c.restore();
}

/** Status-bar icons: ethernet, wifi, battery (white), right-aligned ending at x. */
export function statusIcons(c: Ctx, xRight: number, cy: number, s: number, color: string): void {
  c.save();
  c.fillStyle = color;
  stroke(c, color, s * 0.1);
  // battery
  const bw = s * 0.9;
  c.strokeRect(xRight - bw, cy - s * 0.25, bw * 0.88, s * 0.5);
  c.fillRect(xRight - bw * 0.12, cy - s * 0.12, bw * 0.1, s * 0.24);
  c.fillRect(xRight - bw + s * 0.08, cy - s * 0.17, bw * 0.6, s * 0.34);
  // wifi
  const wx = xRight - bw - s * 0.7;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(wx, cy + s * 0.3, s * (0.15 + i * 0.17), -Math.PI * 0.75, -Math.PI * 0.25);
    c.stroke();
  }
  // ethernet (three-port block)
  const ex = wx - s * 1.0;
  c.strokeRect(ex - s * 0.3, cy - s * 0.25, s * 0.6, s * 0.5);
  c.fillRect(ex - s * 0.12, cy + s * 0.1, s * 0.24, s * 0.15);
  c.restore();
}

/** Android nav bar glyphs. */
export function navGlyph(c: Ctx, kind: 'back' | 'home' | 'recents', cx: number, cy: number, s: number, color: string): void {
  c.save();
  stroke(c, color, s * 0.1);
  c.beginPath();
  if (kind === 'back') {
    c.moveTo(cx + s * 0.25, cy - s * 0.3);
    c.lineTo(cx - s * 0.25, cy);
    c.lineTo(cx + s * 0.25, cy + s * 0.3);
    c.closePath();
  } else if (kind === 'home') {
    c.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
  } else {
    c.rect(cx - s * 0.26, cy - s * 0.26, s * 0.52, s * 0.52);
  }
  c.stroke();
  c.restore();
}

/** White launcher pictogram per app name (simple, recognisable shapes). */
export function appGlyph(c: Ctx, app: string, cx: number, cy: number, s: number, color = '#ffffff'): void {
  c.save();
  c.fillStyle = color;
  stroke(c, color, s * 0.08);
  const box = (x: number, y: number, w: number, h: number) => c.strokeRect(cx + x * s, cy + y * s, w * s, h * s);
  const fbox = (x: number, y: number, w: number, h: number) => c.fillRect(cx + x * s, cy + y * s, w * s, h * s);
  const ln = (x1: number, y1: number, x2: number, y2: number) => {
    c.beginPath();
    c.moveTo(cx + x1 * s, cy + y1 * s);
    c.lineTo(cx + x2 * s, cy + y2 * s);
    c.stroke();
  };
  const circ = (x: number, y: number, r: number, fill = false) => {
    c.beginPath();
    c.arc(cx + x * s, cy + y * s, r * s, 0, Math.PI * 2);
    if (fill) c.fill();
    else c.stroke();
  };
  switch (app) {
    case 'Register':
      box(-0.32, -0.05, 0.64, 0.32);
      box(-0.2, -0.32, 0.4, 0.2);
      fbox(-0.22, 0.04, 0.12, 0.08);
      fbox(-0.04, 0.04, 0.12, 0.08);
      break;
    case 'Orders':
      box(-0.26, -0.34, 0.52, 0.68);
      for (let i = 0; i < 3; i++) ln(-0.14, -0.16 + i * 0.16, 0.14, -0.16 + i * 0.16);
      break;
    case 'Transactions':
      ln(-0.3, -0.12, 0.3, -0.12);
      ln(0.18, -0.24, 0.3, -0.12);
      ln(0.3, 0.12, -0.3, 0.12);
      ln(-0.18, 0.24, -0.3, 0.12);
      break;
    case 'Sale':
      c.beginPath();
      c.moveTo(cx - 0.3 * s, cy - 0.3 * s);
      c.lineTo(cx + 0.02 * s, cy - 0.3 * s);
      c.lineTo(cx + 0.32 * s, cy);
      c.lineTo(cx, cy + 0.32 * s);
      c.lineTo(cx - 0.3 * s, cy + 0.02 * s);
      c.closePath();
      c.stroke();
      circ(-0.14, -0.14, 0.05, true);
      break;
    case 'Authorizations':
      check(c, cx, cy, s * 0.9, color, 0.1);
      circ(0, 0, 0.36);
      break;
    case 'Customers':
      circ(0, -0.14, 0.14);
      c.beginPath();
      c.arc(cx, cy + 0.32 * s, 0.26 * s, Math.PI, 0);
      c.stroke();
      break;
    case 'Items':
      box(-0.28, -0.2, 0.56, 0.48);
      ln(-0.28, -0.2, -0.12, -0.34);
      ln(0.28, -0.2, 0.12, -0.34);
      ln(-0.12, -0.34, 0.12, -0.34);
      break;
    case 'Reports':
      fbox(-0.3, 0.05, 0.14, 0.25);
      fbox(-0.07, -0.15, 0.14, 0.45);
      fbox(0.16, -0.3, 0.14, 0.6);
      break;
    case 'Employees':
      circ(-0.12, -0.12, 0.11);
      circ(0.14, -0.12, 0.11);
      c.beginPath();
      c.arc(cx - 0.12 * s, cy + 0.3 * s, 0.18 * s, Math.PI, 0);
      c.arc(cx + 0.14 * s, cy + 0.3 * s, 0.18 * s, Math.PI, 0);
      c.stroke();
      break;
    case 'Inventory':
      box(-0.3, -0.04, 0.28, 0.3);
      box(0.02, -0.04, 0.28, 0.3);
      box(-0.14, -0.34, 0.28, 0.28);
      break;
    case 'Rewards': {
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = (i % 2 ? 0.15 : 0.36) * s;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
      c.fill();
      break;
    }
    case 'Gift Cards':
      box(-0.3, -0.12, 0.6, 0.4);
      fbox(-0.34, -0.22, 0.68, 0.12);
      ln(0, -0.22, 0, 0.28);
      break;
    case 'Help':
      circ(0, 0, 0.34);
      c.font = `700 ${s * 0.46}px Roboto, Arial, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('?', cx, cy + s * 0.02);
      break;
    case 'App Market':
      box(-0.28, -0.14, 0.56, 0.44);
      c.beginPath();
      c.arc(cx, cy - 0.14 * s, 0.14 * s, Math.PI, 0);
      c.stroke();
      break;
    case 'Settings': {
      circ(0, 0, 0.13);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ln(0.2 * Math.cos(a), 0.2 * Math.sin(a), 0.34 * Math.cos(a), 0.34 * Math.sin(a));
      }
      circ(0, 0, 0.24);
      break;
    }
    case 'Setup':
      ln(-0.28, 0.28, 0.12, -0.12);
      circ(0.18, -0.18, 0.12);
      break;
    case 'Dining':
      ln(-0.14, -0.34, -0.14, 0.34);
      ln(-0.24, -0.34, -0.24, -0.1);
      ln(-0.04, -0.34, -0.04, -0.1);
      ln(0.16, -0.34, 0.16, 0.34);
      c.beginPath();
      c.ellipse(cx + 0.2 * s, cy - 0.18 * s, 0.08 * s, 0.16 * s, 0, 0, Math.PI * 2);
      c.stroke();
      break;
    default:
      circ(0, 0, 0.3);
  }
  c.restore();
}
