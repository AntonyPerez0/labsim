/**
 * Small procedural textures used only by the lab builder (World §6.2 additions that the engine's
 * TextureLibrary does not provide yet): braid weave normal, cardboard, cork, louvre slots, wire
 * basket grid, egg-crate / vent grilles. Deterministic (seeded), cached per page load.
 */
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

const cache = new Map<string, Texture>();

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make(key: string, w: number, h: number, srgb: boolean, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat: [number, number] = [1, 1]): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  cache.set(key, t);
  return t;
}

/** Diagonal over-under weave as a tangent-space normal map (8 mm tile). */
export function braidNormal(): Texture {
  return make('braid', 128, 128, false, (ctx, w, h) => {
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, w, h);
    const n = 8;
    for (let i = -n; i < n * 2; i++) {
      for (const dir of [1, -1]) {
        const g = ctx.createLinearGradient(0, 0, 10, 10);
        g.addColorStop(0, dir > 0 ? 'rgb(90,150,255)' : 'rgb(166,150,255)');
        g.addColorStop(1, dir > 0 ? 'rgb(166,106,255)' : 'rgb(90,106,255)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 6;
        ctx.beginPath();
        const x = (i * w) / n;
        ctx.moveTo(x, 0);
        ctx.lineTo(x + dir * w, h);
        ctx.stroke();
      }
    }
  });
}

/** Brown kraft cardboard with flute streaks and a strip of packing tape. */
export function cardboardTex(): Texture {
  return make('cardboard', 256, 256, true, (ctx, w, h) => {
    const r = seeded(42);
    ctx.fillStyle = '#b48a5a';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = `rgba(90,60,30,${0.04 + r() * 0.05})`;
      ctx.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(60,40,20,${r() * 0.15})`;
      ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1);
    }
    ctx.fillStyle = 'rgba(205,175,120,0.55)';
    ctx.fillRect(0, h * 0.44, w, h * 0.12);
  });
}

/** Cork pinboard. */
export function corkTex(): Texture {
  return make('cork', 512, 512, true, (ctx, w, h) => {
    const r = seeded(77);
    ctx.fillStyle = '#b88a5a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = r();
      ctx.fillStyle = v > 0.5 ? `rgba(120,80,40,${0.25 + r() * 0.35})` : `rgba(225,185,130,${0.2 + r() * 0.3})`;
      const s = 1 + r() * 3;
      ctx.fillRect(r() * w, r() * h, s, s * (0.5 + r()));
    }
  });
}

/** Louvred bin panel: horizontal louvre slots (alpha: white = solid). 150 mm tile. */
export function louvreAlpha(): Texture {
  return make(
    'louvre',
    256,
    256,
    false,
    (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#000000';
      // two louvre rows per 150 mm tile, each slot 110 mm wide × 14 mm tall
      for (const y of [0.18, 0.68]) {
        for (const x of [0.04]) ctx.fillRect(x * w, y * h, 0.74 * w, 0.09 * h);
      }
    },
    [1.3 / 0.15, 0.9 / 0.15],
  );
}

/** Wire-basket tray grid (alpha): 4 mm wires on a 100 × 50 mm cell. UV 1 = one cell. */
export function wireGridAlpha(): Texture {
  return make('wiregrid', 128, 64, false, (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    const t = Math.max(3, Math.round((4 / 100) * w));
    ctx.fillRect(0, 0, t, h);
    ctx.fillRect(0, 0, w, t);
  });
}

/** Square-hole perforated sheet (alpha) used for small vent panels. */
export function perforatedFlatAlpha(): Texture {
  return wireGridAlpha();
}

/** 600 mm four-way supply diffuser face (concentric squares + louvre shading). */
export function ventGrilleTex(): Texture {
  return make('vent', 256, 256, true, (ctx, w, h) => {
    ctx.fillStyle = '#e9e9e6';
    ctx.fillRect(0, 0, w, h);
    for (let i = 1; i < 6; i++) {
      const m = (i * w) / 13;
      ctx.strokeStyle = i % 2 ? 'rgba(80,80,80,0.55)' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 5;
      ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
    }
    ctx.fillStyle = '#3c3d3d';
    ctx.fillRect(w * 0.42, h * 0.42, w * 0.16, h * 0.16);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, h);
    ctx.moveTo(w, 0);
    ctx.lineTo(0, h);
    ctx.stroke();
  });
}

/** Egg-crate return grille (13 mm cells). */
export function eggCrateTex(): Texture {
  return make('eggcrate', 256, 256, true, (ctx, w, h) => {
    ctx.fillStyle = '#2e2f30';
    ctx.fillRect(0, 0, w, h);
    const n = 24;
    const c = w / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = '#d9d9d6';
        ctx.fillRect(i * c, j * c, c, 1.6);
        ctx.fillRect(i * c, j * c, 1.6, c);
      }
    ctx.strokeStyle = '#efefec';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, w, h);
  });
}

/** Faint radial gradient (blob shadows / glow decals). */
export function radialTex(inner: string, outer: string): Texture {
  return make(`radial:${inner}:${outer}`, 128, 128, true, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * 305 × 305 mm light-grey speckled VCT (§1.1): 4 × 4 tiles per 1.22 m texture tile, per-tile tone
 * variation, dark/white flecks, faint grout lines. Returns colour + roughness maps.
 */
export function vctFloor(): { map: Texture; roughnessMap: Texture } {
  const key = 'vct';
  const hit = cache.get(key);
  const hitR = cache.get(`${key}:r`);
  if (hit && hitR) return { map: hit, roughnessMap: hitR };
  const W = 1024;
  const n = 4;
  const tp = W / n;
  const c = document.createElement('canvas');
  c.width = c.height = W;
  const g = c.getContext('2d')!;
  const rc = document.createElement('canvas');
  rc.width = rc.height = 256;
  const rg = rc.getContext('2d')!;
  const r = seeded(305);
  const img = g.createImageData(W, W);
  const d = img.data;
  const tone: number[] = [];
  for (let i = 0; i < n * n; i++) tone.push((r() - 0.5) * 12);
  // low-frequency mottling (tileable sines)
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const t = tone[Math.floor(y / tp) * n + Math.floor(x / tp)]!;
      const u = (x / W) * Math.PI * 2;
      const v = (y / W) * Math.PI * 2;
      const mott = Math.sin(u * 3 + Math.sin(v * 2) * 1.3) * 1.6 + Math.sin(v * 5 + Math.cos(u * 4)) * 1.2;
      let base = 198 + t + mott;
      const k = r();
      if (k > 0.985) base -= 45 + r() * 50; // dark chips
      else if (k > 0.965) base -= 16 + r() * 18;
      else if (k < 0.012) base += 22; // white chips
      const i = (y * W + x) * 4;
      d[i] = Math.max(0, Math.min(255, base + 1));
      d[i + 1] = Math.max(0, Math.min(255, base + 1));
      d[i + 2] = Math.max(0, Math.min(255, base - 1));
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // grout / tile edges
  for (let k = 0; k <= n; k++) {
    const p = k * tp;
    g.fillStyle = 'rgba(120,120,116,0.35)';
    g.fillRect(p - 1, 0, 2, W);
    g.fillRect(0, p - 1, W, 2);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(p + 1, 0, 1, W);
    g.fillRect(0, p + 1, W, 1);
  }
  // roughness: waxed semi-gloss with scuffy patches
  rg.fillStyle = 'rgb(110,110,110)';
  rg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    rg.fillStyle = `rgba(${150 + r() * 60},${150 + r() * 60},${150 + r() * 60},0.18)`;
    rg.beginPath();
    rg.ellipse(r() * 256, r() * 256, 4 + r() * 22, 2 + r() * 8, r() * Math.PI, 0, Math.PI * 2);
    rg.fill();
  }
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  const rough = new CanvasTexture(rc);
  rough.colorSpace = NoColorSpace;
  for (const t of [map, rough]) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
  }
  map.userData.tileSize = [1.22, 1.22];
  rough.userData.tileSize = [1.22, 1.22];
  cache.set(key, map);
  cache.set(`${key}:r`, rough);
  return { map, roughnessMap: rough };
}
