// @ts-nocheck
/* Sastra Dungeon — pixel-art layer (8/16-bit dungeon look).
   Stone-brick floors + perimeter brick walls, animated torch flames,
   pixel hero sprite, pixel slimes. All drawing is rect-based so it
   stays crisp when the main render passes through the downscale buffer. */

const TAU = Math.PI * 2;

/* deterministic per-cell noise */
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 974634599) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const hrand = (x, y, s, a, b) => a + hash(x, y, s) * (b - a);
const ri = (n) => (Math.random() * n) | 0;
const shade = (hex, p) => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = p > 0 ? (x) => Math.round(x + (255 - x) * p) : (x) => Math.round(x * (1 + p));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};
const rgb = (a, d = 0) => `rgb(${a[0] + d},${a[1] + d},${a[2] + d})`;

/* per-biome palettes (floor bricks / worn patches / wall bricks) */
const PIX = {
  crypt:   { brick: [124,116,108], brickVar: 8, worn: [160,138,100], wall: [120,114,108], wallVar: 10, mortar: [56,52,50],  accent: '#e8e2d0' },
  caverns: { brick: [96,118,104],  brickVar: 8, worn: [128,140,104], wall: [108,128,116], wallVar: 10, mortar: [36,52,44],  accent: '#a8e8c8' },
  frost:   { brick: [128,140,158], brickVar: 9, worn: [158,172,188], wall: [144,156,176], wallVar: 11, mortar: [64,76,96],  accent: '#eaf6ff' },
  volcano: { brick: [118,84,66],   brickVar: 9, worn: [150,104,74],  wall: [142,98,76],  wallVar: 11, mortar: [48,30,22],  accent: '#ffb060' },
  shadow:  { brick: [104,96,124],  brickVar: 8, worn: [132,118,152], wall: [120,110,144], wallVar: 10, mortar: [38,32,54],  accent: '#c8b0ff' },
};

/* ===== floor: stone bricks + worn patches + props ===== */
export function buildPixelFloor(x, w, h, biomeKey) {
  const P = PIX[biomeKey] || PIX.crypt;
  const BW = 16, BH = 8; // brick size (chunky 16-bit grid)

  // mortar base
  x.fillStyle = rgb(P.mortar);
  x.fillRect(0, 0, w, h);

  // brick courses (running bond, 2px mortar gaps)
  for (let by = 0; by < h; by += BH) {
    const row = by / BH;
    const off = (row % 2) * (BW / 2);
    for (let bx = -BW; bx < w; bx += BW) {
      const v = hrand(bx + off, by, 7, -P.brickVar, P.brickVar);
      x.fillStyle = rgb([P.brick[0] + v, P.brick[1] + v, P.brick[2] + v]);
      x.fillRect(bx + off + 1, by + 1, BW - 2, BH - 2);
      // top highlight / bottom shade for chunky relief
      x.fillStyle = 'rgba(255,255,255,0.07)';
      x.fillRect(bx + off + 1, by + 1, BW - 2, 2);
      x.fillStyle = 'rgba(0,0,0,0.16)';
      x.fillRect(bx + off + 1, by + BH - 3, BW - 2, 2);
    }
  }

  // worn tan patches (well-trodden areas like the reference)
  const cx0 = w / 2, cy0 = h / 2;
  for (let i = 0; i < 24; i++) {
    const px = (i < 3) ? cx0 + hrand(i, 1, 11, -350, 350) : hrand(i, 2, 13, 500, w - 500);
    const py = (i < 3) ? cy0 + hrand(i, 3, 11, -350, 350) : hrand(i, 4, 13, 500, h - 500);
    const rw = hrand(i, 5, 13, 120, 340), rh = rw * 0.7;
    const a = hrand(i, 6, 13, 0.10, 0.22);
    x.fillStyle = `rgba(${P.worn[0]},${P.worn[1]},${P.worn[2]},${a})`;
    x.beginPath(); x.ellipse(px, py, rw, rh, hrand(i, 7, 13, 0, TAU), 0, TAU); x.fill();
    // scuff marks inside the patch
    for (let s = 0; s < 14; s++) {
      const sx = px + hrand(i * 31 + s, 8, 13, -rw, rw) * 0.8;
      const sy = py + hrand(i * 31 + s, 9, 13, -rh, rh) * 0.8;
      x.fillStyle = `rgba(${P.worn[0] + 14},${P.worn[1] + 14},${P.worn[2] + 10},${a * 0.9})`;
      x.fillRect(sx, sy, hrand(s, i, 13, 3, 9), 2);
    }
  }

  // cracks
  for (let i = 0; i < 400; i++) {
    const cx = hrand(i, 10, 15, 80, w - 80), cy = hrand(i, 11, 15, 80, h - 80);
    x.strokeStyle = `rgba(0,0,0,${hrand(i, 12, 15, 0.25, 0.5)})`;
    x.lineWidth = 2; x.lineCap = 'round';
    const a0 = hrand(i, 13, 15, 0, TAU), len = hrand(i, 14, 15, 10, 30);
    x.beginPath();
    x.moveTo(cx - Math.cos(a0) * len, cy - Math.sin(a0) * len);
    const a1 = a0 + hrand(i, 15, 15, -0.7, 0.7);
    x.lineTo(cx, cy);
    x.lineTo(cx + Math.cos(a1) * len * 0.6, cy + Math.sin(a1) * len * 0.6);
    x.stroke();
  }

  // pebbles
  for (let i = 0; i < 420; i++) {
    const px = hrand(i, 16, 17, 100, w - 100), py = hrand(i, 17, 17, 100, h - 100);
    x.fillStyle = `rgba(0,0,0,${hrand(i, 18, 17, 0.2, 0.45)})`;
    x.fillRect(px, py, hrand(i, 19, 17, 2, 5), hrand(i, 20, 17, 2, 4));
  }

  // bone props
  for (let i = 0; i < 220; i++) {
    const px = hrand(i, 21, 19, 150, w - 150), py = hrand(i, 22, 19, 150, h - 150);
    const rot = hrand(i, 23, 19, 0, TAU);
    x.save(); x.translate(px, py); x.rotate(rot);
    x.globalAlpha = hrand(i, 24, 19, 0.35, 0.7);
    x.fillStyle = P.accent;
    x.fillRect(-6, -1, 12, 2);            // femur
    x.fillRect(-7, -4, 4, 3);             // knob
    x.fillRect(3, -4, 4, 3);              // knob
    x.beginPath(); x.arc(0, -5, 3.5, 0, TAU); x.fill(); // skull
    x.fillStyle = 'rgba(0,0,0,0.6)';
    x.fillRect(-2, -6, 1.5, 1.5); x.fillRect(0.5, -6, 1.5, 1.5); // eye sockets
    x.restore();
  }
  x.globalAlpha = 1;

  // biome flavor specks
  if (biomeKey === 'volcano') {
    for (let i = 0; i < 60; i++) {
      const px = hrand(i, 25, 21, 100, w - 100), py = hrand(i, 26, 21, 100, h - 100);
      x.strokeStyle = 'rgba(255,120,40,0.5)'; x.lineWidth = 2;
      x.beginPath();
      let qx = px, qy = py; x.moveTo(qx, qy);
      for (let s = 0; s < 3; s++) { qx += hrand(qx, s, i, -20, 20); qy += hrand(qy, s, i, -20, 20); x.lineTo(qx, qy); }
      x.stroke();
    }
  } else if (biomeKey === 'frost') {
    for (let i = 0; i < 120; i++) {
      const px = hrand(i, 27, 23, 100, w - 100), py = hrand(i, 28, 23, 100, h - 100);
      x.fillStyle = 'rgba(220,244,255,0.5)';
      x.fillRect(px, py, 3, 3);
    }
  } else if (biomeKey === 'caverns') {
    for (let i = 0; i < 90; i++) {
      const px = hrand(i, 29, 25, 100, w - 100), py = hrand(i, 30, 25, 100, h - 100);
      x.fillStyle = 'rgba(80,200,140,0.4)';
      x.fillRect(px, py, hrand(i, 31, 25, 3, 8), 3);
    }
  } else if (biomeKey === 'shadow') {
    for (let i = 0; i < 90; i++) {
      const px = hrand(i, 32, 27, 100, w - 100), py = hrand(i, 33, 27, 100, h - 100);
      x.fillStyle = 'rgba(160,110,255,0.35)';
      x.fillRect(px, py, hrand(i, 34, 27, 2, 6), 2);
    }
  }
}

/* ===== perimeter brick walls (60px rim, matches old border width) ===== */
export function drawPixelWalls(x, w, h, biomeKey) {
  const P = PIX[biomeKey] || PIX.crypt;
  const rim = 60, BW = 24, BH = 12;

  const bricks = (x0, y0, ww, hh, rot) => {
    for (let by = 0; by < hh; by += BH) {
      const row = by / BH;
      const off = (row % 2) * (BW / 2);
      for (let bx = -BW; bx < ww; bx += BW) {
        const v = hrand(x0 + bx + off, y0 + by, 41, -P.wallVar, P.wallVar);
        x.fillStyle = rgb([P.wall[0] + v, P.wall[1] + v, P.wall[2] + v]);
        if (rot === 'h') x.fillRect(x0 + bx + off + 1, y0 + by + 1, BW - 2, BH - 2);
        else if (rot === 'v') x.fillRect(x0 + by + 1, y0 + bx + off + 1, BH - 2, BW - 2);
      }
    }
  };

  // top wall
  x.fillStyle = rgb(P.mortar); x.fillRect(0, 0, w, rim);
  bricks(0, 0, w, rim, 'h');
  // bottom wall
  x.fillStyle = rgb(P.mortar); x.fillRect(0, h - rim, w, rim);
  bricks(0, h - rim, w, rim, 'h');
  // left wall
  x.fillStyle = rgb(P.mortar); x.fillRect(0, 0, rim, h);
  bricks(0, 0, rim, h, 'v');
  // right wall
  x.fillStyle = rgb(P.mortar); x.fillRect(w - rim, 0, rim, h);
  bricks(w - rim, 0, rim, h, 'v');

  // inner edge: dark line + lighter face (suggests wall height)
  x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 5;
  x.strokeRect(rim / 2, rim / 2, w - rim, h - rim);
  x.strokeStyle = 'rgba(255,255,255,0.10)'; x.lineWidth = 2;
  x.strokeRect(rim, rim, w - rim * 2, h - rim * 2);
  // outer edge dark
  x.strokeStyle = 'rgba(0,0,0,0.7)'; x.lineWidth = 6;
  x.strokeRect(3, 3, w - 6, h - 6);

  // corner pillars
  for (const [cx, cy] of [[0, 0], [w - 84, 0], [0, h - 84], [w - 84, h - 84]]) {
    x.fillStyle = rgb([P.wall[0] + 12, P.wall[1] + 12, P.wall[2] + 12]);
    x.fillRect(cx, cy, 84, 84);
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.fillRect(cx, cy, 84, 5); x.fillRect(cx, cy, 5, 84);
    x.fillStyle = 'rgba(0,0,0,0.3)';
    x.fillRect(cx, cy + 78, 84, 6); x.fillRect(cx + 78, cy, 6, 84);
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2;
    x.strokeRect(cx + 1, cy + 1, 82, 82);
  }

  // barred grate (top wall, centered) — like the reference
  const gx = w / 2 - 34, gy = 6;
  x.fillStyle = 'rgba(8,6,10,0.95)'; x.fillRect(gx, gy, 68, 48);
  x.fillStyle = '#8a8296';
  for (let i = 0; i < 5; i++) x.fillRect(gx + 6 + i * 13, gy, 4, 48);
  x.fillRect(gx, gy + 20, 68, 4);
  x.strokeStyle = '#3a3442'; x.lineWidth = 3; x.strokeRect(gx, gy, 68, 48);

  // wooden door with padlock (bottom wall, centered)
  const dx = w / 2 - 40, dy = h - 58;
  x.fillStyle = '#6b4a2a'; x.fillRect(dx, dy, 80, 52);
  x.fillStyle = '#5a3c20';
  for (let i = 1; i < 4; i++) x.fillRect(dx + i * 20, dy, 2, 52);
  x.fillStyle = '#7d5834'; x.fillRect(dx, dy, 80, 5);
  x.strokeStyle = '#2a1a0c'; x.lineWidth = 3; x.strokeRect(dx, dy, 80, 52);
  // padlock
  x.fillStyle = '#f0c14b'; x.fillRect(w / 2 - 7, dy + 20, 14, 16);
  x.fillStyle = '#c9992f'; x.fillRect(w / 2 - 7, dy + 20, 14, 4);
  x.fillStyle = '#1a1006'; x.fillRect(w / 2 - 2, dy + 26, 4, 7);

  // a couple of crates by the door
  for (const [kx, ky] of [[w / 2 + 56, h - 56], [w / 2 - 88, h - 52]]) {
    x.fillStyle = '#7d5c34'; x.fillRect(kx, ky, 26, 26);
    x.fillStyle = '#5f4426';
    x.fillRect(kx, ky, 26, 3); x.fillRect(kx, ky + 23, 26, 3);
    x.fillRect(kx + 11, ky, 4, 26);
    x.strokeStyle = '#2a1a0c'; x.lineWidth = 2; x.strokeRect(kx, ky, 26, 26);
  }
}

/* ===== animated pixel torch flame (2-3 frame flicker) ===== */
export function drawTorchFlame(c, x, y, time, phase) {
  const fr = Math.floor(time * 9 + phase) % 3;
  c.save();
  c.translate(Math.round(x), Math.round(y - 12));
  c.fillStyle = '#ff7820';
  if (fr === 0) { c.fillRect(-4, -10, 8, 10); c.fillRect(-2, -13, 4, 3); }
  if (fr === 1) { c.fillRect(-3, -9, 6, 9); c.fillRect(-1, -13, 2, 4); }
  if (fr === 2) { c.fillRect(-4, -11, 8, 11); c.fillRect(-3, -14, 3, 3); c.fillRect(1, -13, 2, 3); }
  c.fillStyle = '#ffc840';
  if (fr === 0) { c.fillRect(-2, -7, 4, 7); c.fillRect(-1, -10, 2, 3); }
  if (fr === 1) { c.fillRect(-2, -6, 4, 6); c.fillRect(-2, -10, 2, 4); }
  if (fr === 2) { c.fillRect(-1, -8, 3, 8); c.fillRect(0, -12, 2, 4); }
  c.fillStyle = '#fff2b0';
  c.fillRect(-1, -4, 2, 4);
  // rising ember
  const ey = (time * 34 + phase * 9) % 18;
  c.fillStyle = `rgba(255,200,90,${0.85 - ey / 22})`;
  c.fillRect(fr % 2 ? 3 : -5, -14 - ey * 0.7, 2, 2);
  c.restore();
}

/* ===== pixel hero (hooded, sword on hip), 2-frame walk ===== */
export function drawPixelHero(c, x, y, color, accent, walk, t) {
  const u = 3;
  const f = Math.floor((walk || 0) * 1.1) % 2;
  c.save();
  c.translate(Math.round(x), Math.round(y));
  if (color.startsWith && color.startsWith('#')) {
    c.fillStyle = shade(color, -0.35);
  } else c.fillStyle = color;

  // legs (2-frame stride)
  c.fillStyle = shade(color.startsWith('#') ? color : '#4a3d34', -0.55);
  if (f === 0) { c.fillRect(-3 * u, -4 * u, 2 * u, 4 * u); c.fillRect(1 * u, -4 * u, 2 * u, 4 * u); }
  else { c.fillRect(-4 * u, -4 * u, 2 * u, 4 * u); c.fillRect(2 * u, -4 * u, 2 * u, 4 * u); }

  // torso
  c.fillStyle = color;
  c.fillRect(-3 * u, -10 * u, 6 * u, 6 * u);
  c.fillStyle = shade(color.startsWith('#') ? color : '#4a3d34', -0.4);
  c.fillRect(-3 * u, -5 * u, 6 * u, 1 * u);           // dark hem
  c.fillStyle = accent;
  c.fillRect(-3 * u, -6 * u, 6 * u, 1 * u);           // belt
  c.fillRect(-4 * u, -10 * u, 1 * u, 2 * u);          // pauldrons
  c.fillRect(3 * u, -10 * u, 1 * u, 2 * u);
  c.fillStyle = shade(color.startsWith('#') ? color : '#4a3d34', 0.25);
  c.fillRect(-3 * u, -10 * u, 6 * u, 1 * u);          // shoulder highlight

  // head
  c.fillStyle = '#d8b090';
  c.fillRect(-2 * u, -14 * u, 4 * u, 4 * u);
  // hood/hair
  c.fillStyle = shade(color.startsWith('#') ? color : '#4a3d34', -0.1);
  c.fillRect(-3 * u, -15 * u, 6 * u, 2 * u);
  c.fillRect(-3 * u, -14 * u, 1 * u, 3 * u);
  c.fillRect(2 * u, -14 * u, 1 * u, 3 * u);
  // eyes (glow)
  c.fillStyle = accent;
  c.shadowColor = accent; c.shadowBlur = 5;
  c.fillRect(-1 * u, -13 * u, 1 * u, 1 * u);
  c.fillRect(1 * u - 1, -13 * u, 1 * u, 1 * u);
  c.shadowBlur = 0;

  // sword on hip
  c.save();
  c.translate(4 * u, -4 * u);
  c.rotate(f === 0 ? 0.5 : 0.62);
  c.fillStyle = '#d8e0ee';
  c.fillRect(0, -8 * u, 1 * u, 8 * u);
  c.fillStyle = '#f4f8ff';
  c.fillRect(0, -8 * u, 1, 8 * u);
  c.fillStyle = shade(accent.startsWith('#') ? accent : '#c9a24a', -0.3);
  c.fillRect(-1 * u, 0, 3 * u, 1 * u);
  c.fillStyle = '#6b543a';
  c.fillRect(0, 1 * u, 1 * u, 2 * u);
  c.restore();
  c.restore();
}

/* ===== pixel slime (grey body, pink tail, squash wobble) ===== */
export function drawPixelSlime(c, x, y, wobble, color) {
  const s = 1 + Math.sin(wobble) * 0.14;
  c.save();
  c.translate(Math.round(x), Math.round(y));
  // pink tail
  c.fillStyle = '#e878a8';
  c.fillRect(5, -5, 5, 3);
  c.fillRect(8, -7, 3, 3);
  // body tiers (squash)
  const col = color || '#c8d0d0';
  c.fillStyle = shade(col.startsWith('#') ? col : '#c8d0d0', -0.25);
  c.fillRect(Math.round(-6 * s), -3, Math.round(12 * s), 3);
  c.fillStyle = col;
  c.fillRect(Math.round(-5 * s), -8, Math.round(10 * s), 5);
  c.fillStyle = shade(col.startsWith('#') ? col : '#c8d0d0', 0.12);
  c.fillRect(Math.round(-3 * s), -11, Math.round(6 * s), 3);
  // highlight
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillRect(Math.round(-4 * s), -9, 2, 2);
  // eyes
  c.fillStyle = '#1a1420';
  c.fillRect(-3, -7, 2, 2);
  c.fillRect(1, -7, 2, 2);
  c.restore();
}
