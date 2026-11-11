// @ts-nocheck
/* Sastra Dungeon — Angkor Khmer Era Pixel-Art Layer (8/16-bit Temple Dungeon).
   Carved Khmer sandstone & laterite floors, central Sacred Lotus Mandala,
   Ta Prohm banyan roots, ancient Khmer stele tablets, Bayon four-faced corner
   towers, and Naga-flanked Gopura temple gates. */

const TAU = Math.PI * 2;

/* deterministic per-cell noise */
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 974634599) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const hrand = (x, y, s, a, b) => a + hash(x, y, s) * (b - a);
const shade = (hex, p) => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = p > 0 ? (x) => Math.round(x + (255 - x) * p) : (x) => Math.round(x * (1 + p));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};
const rgb = (a, d = 0) => `rgb(${a[0] + d},${a[1] + d},${a[2] + d})`;

/* Angkor Khmer Temple Biome Palettes */
const PIX = {
  crypt:   { brick: [122,108,90],  brickVar: 10, worn: [164,136,94],  wall: [132,114,94],  wallVar: 12, mortar: [52,44,36],  accent: '#f0c868', trim: '#c9983e' },
  caverns: { brick: [86,114,94],   brickVar: 9,  worn: [124,142,96],  wall: [98,126,104],  wallVar: 11, mortar: [32,48,38],  accent: '#88f0b8', trim: '#56b882' },
  frost:   { brick: [118,136,160], brickVar: 10, worn: [154,174,196], wall: [136,154,178], wallVar: 11, mortar: [54,68,90],  accent: '#d8f4ff', trim: '#7cc8f8' },
  volcano: { brick: [132,78,62],   brickVar: 11, worn: [168,102,72],  wall: [150,92,70],   wallVar: 12, mortar: [48,26,20],  accent: '#ffb85c', trim: '#e86830' },
  shadow:  { brick: [98,86,122],   brickVar: 9,  worn: [130,112,154], wall: [114,100,140], wallVar: 11, mortar: [36,28,52],  accent: '#d4a8ff', trim: '#9c64e8' },
};

/* Helper: Draw pixel-stepped circle outline */
function drawPixelRing(x, cx, cy, r, thickness, color) {
  x.fillStyle = color;
  const step = 4;
  for (let dy = -r - thickness; dy <= r + thickness; dy += step) {
    for (let dx = -r - thickness; dx <= r + thickness; dx += step) {
      const d = Math.hypot(dx, dy);
      if (d >= r - thickness / 2 && d <= r + thickness / 2) {
        x.fillRect(Math.round((cx + dx) / step) * step, Math.round((cy + dy) / step) * step, step, step);
      }
    }
  }
}

/* Helper: Draw Angkor Sacred Lotus Mandala at (cx, cy) */
function drawAngkorMandala(x, cx, cy, radius, P) {
  x.save();
  // Outer octagonal Khmer sandstone border
  drawPixelRing(x, cx, cy, radius, 6, 'rgba(0,0,0,0.45)');
  drawPixelRing(x, cx, cy, radius - 4, 4, P.trim);
  drawPixelRing(x, cx, cy, radius * 0.72, 4, P.trim);
  drawPixelRing(x, cx, cy, radius * 0.38, 4, P.accent);

  // 8 Sacred Lotus Petals radiating from center
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    x.save();
    x.translate(cx, cy);
    x.rotate(a);
    x.fillStyle = 'rgba(240, 195, 90, 0.16)';
    x.beginPath();
    x.moveTo(radius * 0.36, -16);
    x.lineTo(radius * 0.68, 0);
    x.lineTo(radius * 0.36, 16);
    x.closePath();
    x.fill();
    x.strokeStyle = P.trim;
    x.lineWidth = 2.5;
    x.stroke();
    // Outer directional spire tip
    x.fillStyle = P.accent;
    x.fillRect(radius * 0.76, -4, 14, 8);
    x.restore();
  }

  // Inner Angkor Yantra square with corner finials
  const sq = radius * 0.24;
  x.strokeStyle = P.accent;
  x.lineWidth = 3;
  x.strokeRect(cx - sq, cy - sq, sq * 2, sq * 2);
  x.fillStyle = P.trim;
  x.fillRect(cx - 8, cy - 8, 16, 16);
  x.restore();
}

/* ===== floor: Angkor sandstone blocks + lotus mandala + banyan roots + Khmer relics ===== */
export function buildPixelFloor(x, w, h, biomeKey) {
  const P = PIX[biomeKey] || PIX.crypt;
  const BW = 24, BH = 12; // Angkor sandstone block dimensions

  // mortar base
  x.fillStyle = rgb(P.mortar);
  x.fillRect(0, 0, w, h);

  // Carved sandstone block courses (running bond)
  for (let by = 0; by < h; by += BH) {
    const row = by / BH;
    const off = (row % 2) * (BW / 2);
    for (let bx = -BW; bx < w; bx += BW) {
      const v = hrand(bx + off, by, 7, -P.brickVar, P.brickVar);
      x.fillStyle = rgb([P.brick[0] + v, P.brick[1] + v, P.brick[2] + v]);
      x.fillRect(bx + off + 1, by + 1, BW - 2, BH - 2);
      // Warm sandstone top bevel & bottom shadow
      x.fillStyle = 'rgba(255,235,190,0.08)';
      x.fillRect(bx + off + 1, by + 1, BW - 2, 2);
      x.fillStyle = 'rgba(0,0,0,0.18)';
      x.fillRect(bx + off + 1, by + BH - 3, BW - 2, 2);

      // Occasional carved lotus tile motif inside stone blocks
      if (hash(bx + off, by, 99) > 0.94) {
        x.fillStyle = 'rgba(240, 195, 100, 0.14)';
        x.fillRect(bx + off + BW / 2 - 3, by + BH / 2 - 2, 6, 4);
      }
    }
  }

  // Worn golden-sandstone temple courtyard patches
  const cx0 = w / 2, cy0 = h / 2;
  for (let i = 0; i < 26; i++) {
    const px = (i < 4) ? cx0 + hrand(i, 1, 11, -380, 380) : hrand(i, 2, 13, 450, w - 450);
    const py = (i < 4) ? cy0 + hrand(i, 3, 11, -380, 380) : hrand(i, 4, 13, 450, h - 450);
    const rw = hrand(i, 5, 13, 130, 340), rh = rw * 0.72;
    const a = hrand(i, 6, 13, 0.11, 0.24);
    x.fillStyle = `rgba(${P.worn[0]},${P.worn[1]},${P.worn[2]},${a})`;
    x.beginPath(); x.ellipse(px, py, rw, rh, hrand(i, 7, 13, 0, TAU), 0, TAU); x.fill();
  }

  drawAngkorTempleLayer(x, w, h, P);

  // Grand Central Angkor Sacred Lotus Mandala & 4 Cardinal Sub-Mandalas
  x.save();
  x.globalAlpha = 0.55;
  drawAngkorMandala(x, cx0, cy0, 210, P);
  for (const [mx, my] of [[cx0 - 560, cy0], [cx0 + 560, cy0], [cx0, cy0 - 440], [cx0, cy0 + 440]]) {
    drawAngkorMandala(x, mx, my, 95, P);
  }
  x.restore();

  // Creeping Ta Prohm Banyan / Fig Tree Roots across the sandstone floor
  for (let i = 0; i < 48; i++) {
    const rx = hrand(i, 40, 31, 90, w - 90);
    const ry = hrand(i, 41, 31, 90, h - 90);
    x.strokeStyle = biomeKey === 'frost' ? 'rgba(150,195,225,0.38)' : 'rgba(68, 48, 30, 0.55)';
    x.lineWidth = hrand(i, 42, 31, 3, 6);
    x.lineCap = 'round';
    x.beginPath();
    let qx = rx, qy = ry;
    x.moveTo(qx, qy);
    const segs = 4;
    const baseAng = hrand(i, 43, 31, 0, TAU);
    for (let s = 1; s <= segs; s++) {
      const a = baseAng + hrand(i * 7 + s, 44, 31, -0.65, 0.65);
      qx += Math.cos(a) * 26;
      qy += Math.sin(a) * 26;
      x.lineTo(qx, qy);
    }
    x.stroke();
  }

  // Cracks in ancient stone
  for (let i = 0; i < 360; i++) {
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

  // Scattered Khmer Sandstone Relics: Carved Lotus Medallions & Sastra Stele Fragments
  for (let i = 0; i < 160; i++) {
    const px = hrand(i, 21, 19, 150, w - 150), py = hrand(i, 22, 19, 150, h - 150);
    const kind = i % 3;
    x.save();
    x.translate(px, py);
    x.globalAlpha = hrand(i, 24, 19, 0.35, 0.68);
    if (kind === 0) {
      // Carved Gold/Sandstone Lotus Rosette
      x.fillStyle = P.trim;
      x.fillRect(-7, -3, 14, 6);
      x.fillRect(-3, -7, 6, 14);
      x.fillStyle = P.accent;
      x.fillRect(-3, -3, 6, 6);
    } else if (kind === 1) {
      // Ancient Khmer Sastra Inscription Tablet fragment
      x.fillStyle = '#5c4e40';
      x.fillRect(-6, -8, 12, 16);
      x.fillStyle = P.accent;
      x.fillRect(-4, -5, 8, 2);
      x.fillRect(-4, -1, 6, 2);
      x.fillRect(-4, 3, 8, 2);
    } else {
      // Fallen Naga Crest / Bone Relic
      x.rotate(hrand(i, 23, 19, 0, TAU));
      x.fillStyle = P.accent;
      x.fillRect(-6, -1, 12, 2);
      x.fillRect(-7, -4, 4, 3);
      x.fillRect(3, -4, 4, 3);
      x.beginPath(); x.arc(0, -5, 3.5, 0, TAU); x.fill();
    }
    x.restore();
  }
  x.globalAlpha = 1;

  // Biome elemental flavor details
  if (biomeKey === 'volcano') {
    for (let i = 0; i < 65; i++) {
      const px = hrand(i, 25, 21, 100, w - 100), py = hrand(i, 26, 21, 100, h - 100);
      x.strokeStyle = 'rgba(255,130,40,0.55)'; x.lineWidth = 2.2;
      x.beginPath();
      let qx = px, qy = py; x.moveTo(qx, qy);
      for (let s = 0; s < 3; s++) { qx += hrand(qx, s, i, -20, 20); qy += hrand(qy, s, i, -20, 20); x.lineTo(qx, qy); }
      x.stroke();
    }
  } else if (biomeKey === 'frost') {
    for (let i = 0; i < 120; i++) {
      const px = hrand(i, 27, 23, 100, w - 100), py = hrand(i, 28, 23, 100, h - 100);
      x.fillStyle = 'rgba(220,244,255,0.55)';
      x.fillRect(px, py, 3, 3);
    }
  } else if (biomeKey === 'caverns') {
    for (let i = 0; i < 110; i++) {
      const px = hrand(i, 29, 25, 100, w - 100), py = hrand(i, 30, 25, 100, h - 100);
      x.fillStyle = 'rgba(70,185,115,0.42)';
      x.fillRect(px, py, hrand(i, 31, 25, 4, 10), 4);
    }
  } else if (biomeKey === 'shadow') {
    for (let i = 0; i < 95; i++) {
      const px = hrand(i, 32, 27, 100, w - 100), py = hrand(i, 33, 27, 100, h - 100);
      x.fillStyle = 'rgba(175,120,255,0.38)';
      x.fillRect(px, py, hrand(i, 34, 27, 3, 7), 3);
    }
  }
}

/* ===== Perimeter Angkor Temple Walls, Bayon Face Towers & Naga Gopura Gates ===== */

/* ── Angkor temple layer: causeway, naga balustrades, gallery pillars, lotus
      ponds. Drawn over the sandstone floor so a realm reads as temple grounds
      rather than an open tile plaza. ── */
function drawAngkorTempleLayer(x, w, h, P) {
  const cx = w / 2, cy = h / 2;

  /* 1. processional causeway — brighter than the floor, hard-edged, with a
        lotus medallion row down the centre so it reads as raised stonework */
  const cH = 250;
  x.save();
  x.fillStyle = 'rgba(0,0,0,0.55)';
  x.fillRect(0, cy - cH / 2 - 14, w, cH + 28);
  const base = [P.worn[0] + 26, P.worn[1] + 22, P.worn[2] + 12];
  for (let px = 0; px < w; px += 60) {
    const v = hrand(px, 9, 61, -6, 6);
    x.fillStyle = rgb([base[0] + v, base[1] + v, base[2] + v]);
    x.fillRect(px + 2, cy - cH / 2, 56, cH);
    x.fillStyle = 'rgba(255,248,215,0.16)';
    x.fillRect(px + 2, cy - cH / 2, 56, 4);
    x.fillStyle = 'rgba(0,0,0,0.30)';
    x.fillRect(px + 2, cy + cH / 2 - 5, 56, 5);
  }
  /* raised kerbs */
  for (const ey of [cy - cH / 2, cy + cH / 2]) {
    /* three stepped shadow bands = readable elevation */
    x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, ey - 26, w, 26);
    x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, ey - 12, w, 12);
    x.fillStyle = 'rgba(0,0,0,0.68)'; x.fillRect(0, ey - 5, w, 12);
    x.fillStyle = rgb([P.worn[0] + 40, P.worn[1] + 34, P.worn[2] + 20]);
    x.fillRect(0, ey - 2, w, 5);
    x.fillStyle = P.trim; x.fillRect(0, ey - 2, w, 2);
    x.fillStyle = 'rgba(255,250,225,0.45)'; x.fillRect(0, ey - 2, w, 1);
  }
  /* lotus medallions along the axis */
  for (let px = 120; px < w; px += 190) {
    x.strokeStyle = P.trim; x.lineWidth = 3;
    x.beginPath(); x.arc(px, cy, 22, 0, TAU); x.stroke();
    x.fillStyle = 'rgba(240,195,90,0.20)';
    x.beginPath(); x.arc(px, cy, 22, 0, TAU); x.fill();
    x.fillStyle = P.accent;
    x.beginPath(); x.arc(px, cy, 6, 0, TAU); x.fill();
  }
  x.restore();

  /* 2. naga balustrades — squat serpent bodies with five raised hoods */
  for (let px = 170; px < w - 100; px += 320) {
    for (const py of [cy - cH / 2 - 58, cy + cH / 2 + 12]) {
      const bw = 62, bh = 44;
      x.fillStyle = 'rgba(0,0,0,0.62)';
      x.fillRect(px - bw / 2 + 6, py + 8, bw, bh);
      x.fillStyle = rgb([P.wall[0] + 26, P.wall[1] + 19, P.wall[2] + 9]);
      x.fillRect(px - bw / 2, py, bw, bh);
      x.fillStyle = 'rgba(255,245,210,0.14)';
      x.fillRect(px - bw / 2, py, 6, bh);
      x.fillStyle = 'rgba(0,0,0,0.32)';
      x.fillRect(px + bw / 2 - 6, py, 6, bh);
      /* five hoods, clearly fanned and outlined */
      for (let k = -2; k <= 2; k++) {
        const hx = px + k * 12, lift = Math.abs(k) * 3;
        x.fillStyle = 'rgba(0,0,0,0.55)';
        x.beginPath(); x.arc(hx, py - 4 - lift, 12, Math.PI, TAU); x.fill();
        x.fillStyle = P.trim;
        x.beginPath(); x.arc(hx, py - 6 - lift, 11, Math.PI, TAU); x.fill();
        x.fillStyle = 'rgba(255,240,200,0.25)';
        x.beginPath(); x.arc(hx - 3, py - 9 - lift, 4, Math.PI, TAU); x.fill();
        /* eyes */
        x.fillStyle = '#1a1208';
        x.fillRect(hx - 4, py - 12 - lift, 2, 2);
        x.fillRect(hx + 2, py - 12 - lift, 2, 2);
      }
      /* curled body under the hoods */
      x.strokeStyle = P.trim; x.lineWidth = 5;
      x.beginPath(); x.moveTo(px - 26, py + 6); x.quadraticCurveTo(px, py - 6, px + 26, py + 6); x.stroke();
      x.fillStyle = P.accent;
      x.fillRect(px - 3, py - 22 - 3, 6, 8);
    }
  }

  /* 3. colonnade flanking the causeway (in view from the spawn point) */
  for (let px = 60; px < w - 60; px += 240) {
    for (const py of [cy - 330, cy + 250]) {
      x.fillStyle = 'rgba(0,0,0,0.5)';
      x.fillRect(px + 8, py + 12, 34, 70);
      x.fillStyle = rgb([P.wall[0] + 30, P.wall[1] + 22, P.wall[2] + 10]);
      x.fillRect(px, py, 30, 66);
      x.fillStyle = 'rgba(255,245,210,0.16)';
      x.fillRect(px, py, 6, 66);
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.fillRect(px + 24, py, 6, 66);
      x.fillStyle = P.trim;
      x.fillRect(px - 4, py - 10, 38, 11);
      x.fillRect(px - 4, py + 64, 38, 10);
      x.fillStyle = P.accent;
      x.fillRect(px + 11, py - 7, 8, 5);
    }
  }

  /* 4. lotus ponds close enough to read at spawn */
  const ponds = [[cx - 560, cy - 300], [cx + 560, cy - 300], [cx - 560, cy + 300], [cx + 560, cy + 300]];
  for (const [px, py] of ponds) {
    if (px < 170 || px > w - 170 || py < 170 || py > h - 170) continue;
    x.fillStyle = 'rgba(0,0,0,0.5)';
    x.beginPath(); x.ellipse(px, py, 134, 88, 0, 0, TAU); x.fill();
    x.fillStyle = 'rgba(34,86,92,0.92)';
    x.beginPath(); x.ellipse(px, py, 126, 80, 0, 0, TAU); x.fill();
    const g = x.createLinearGradient(px, py - 80, px, py + 80);
    g.addColorStop(0, 'rgba(170,235,235,0.22)');
    g.addColorStop(0.5, 'rgba(40,110,120,0.10)');
    g.addColorStop(1, 'rgba(4,24,34,0.45)');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(px, py, 126, 80, 0, 0, TAU); x.fill();
    /* stone kerb */
    x.strokeStyle = rgb([P.worn[0] + 10, P.worn[1] + 8, P.worn[2] + 4]); x.lineWidth = 9;
    x.beginPath(); x.ellipse(px, py, 131, 85, 0, 0, TAU); x.stroke();
    x.strokeStyle = P.trim; x.lineWidth = 2;
    x.beginPath(); x.ellipse(px, py, 127, 81, 0, 0, TAU); x.stroke();
    /* pads + blooms */
    for (let i = 0; i < 11; i++) {
      const a = hrand(i, px, 71, 0, TAU), rr = hrand(i, py, 73, 18, 100);
      const lx = px + Math.cos(a) * rr, ly = py + Math.sin(a) * rr * 0.6;
      x.fillStyle = 'rgba(92,150,96,0.95)';
      x.beginPath(); x.ellipse(lx, ly, 12, 9, 0, 0, TAU); x.fill();
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.beginPath(); x.ellipse(lx, ly + 3, 10, 5, 0, 0, TAU); x.fill();
      if (i % 3 === 0) {
        x.fillStyle = '#ffd9e8';
        x.beginPath(); x.arc(lx, ly - 3, 4, 0, TAU); x.fill();
        x.fillStyle = P.accent;
        x.beginPath(); x.arc(lx, ly - 3, 1.6, 0, TAU); x.fill();
      }
    }
  }
}

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

  // Top, Bottom, Left, Right Laterite Temple Walls
  x.fillStyle = rgb(P.mortar); x.fillRect(0, 0, w, rim);
  bricks(0, 0, w, rim, 'h');
  x.fillStyle = rgb(P.mortar); x.fillRect(0, h - rim, w, rim);
  bricks(0, h - rim, w, rim, 'h');
  x.fillStyle = rgb(P.mortar); x.fillRect(0, 0, rim, h);
  bricks(0, 0, rim, h, 'v');
  x.fillStyle = rgb(P.mortar); x.fillRect(w - rim, 0, rim, h);
  bricks(w - rim, 0, rim, h, 'v');

  // Golden Angkor Apsara & Lotus Frieze Trim along inner wall molding
  x.strokeStyle = 'rgba(0,0,0,0.65)'; x.lineWidth = 6;
  x.strokeRect(rim / 2, rim / 2, w - rim, h - rim);
  x.strokeStyle = P.trim; x.lineWidth = 3;
  x.strokeRect(rim - 2, rim - 2, w - (rim - 2) * 2, h - (rim - 2) * 2);

  // Outer shadow border
  x.strokeStyle = 'rgba(0,0,0,0.75)'; x.lineWidth = 6;
  x.strokeRect(3, 3, w - 6, h - 6);

  // 4 Corner Bayon Smiling Stone Face Towers (Prasat Mukh)
  for (const [cx, cy] of [[0, 0], [w - 88, 0], [0, h - 88], [w - 88, h - 88]]) {
    x.fillStyle = rgb([P.wall[0] + 14, P.wall[1] + 10, P.wall[2] + 6]);
    x.fillRect(cx, cy, 88, 88);
    // Stepped Khmer Crown / Diadem on the Bayon Pillar
    x.fillStyle = P.trim;
    x.fillRect(cx + 12, cy + 10, 64, 10);
    x.fillStyle = P.accent;
    for (let k = 0; k < 5; k++) {
      x.fillRect(cx + 16 + k * 12, cy + 4, 6, 8);
    }
    // Carved Bayon Stone Face (serene eyes, nose bridge, enigmatic Khmer smile)
    x.fillStyle = rgb([P.wall[0] + 24, P.wall[1] + 20, P.wall[2] + 14]);
    x.fillRect(cx + 18, cy + 20, 52, 50);
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillRect(cx + 24, cy + 32, 12, 4); // left eye
    x.fillRect(cx + 52, cy + 32, 12, 4); // right eye
    x.fillRect(cx + 41, cy + 32, 6, 18); // nose bridge
    x.fillRect(cx + 30, cy + 54, 28, 4); // serene smile
    x.fillStyle = P.accent;
    x.fillRect(cx + 42, cy + 24, 4, 4);  // third-eye urna gem
    x.strokeStyle = P.trim; x.lineWidth = 2;
    x.strokeRect(cx + 2, cy + 2, 84, 84);
  }

  // North Gopura Sanctum Gate (Top Wall Center) with 7-Headed Naga Arch
  const gx = w / 2 - 48, gy = 4;
  x.fillStyle = '#2a1f18'; x.fillRect(gx, gy, 96, 54);
  x.fillStyle = P.trim; x.fillRect(gx - 6, gy, 108, 8);
  x.fillStyle = P.accent;
  for (let i = 0; i < 7; i++) {
    x.fillRect(gx + 4 + i * 13, gy - 4, 6, 8); // 7-headed Naga crest
  }
  x.fillStyle = '#0a060c'; x.fillRect(gx + 12, gy + 12, 72, 42);
  // Golden Khmer bars & lotus lintel
  x.fillStyle = P.trim;
  for (let i = 0; i < 5; i++) x.fillRect(gx + 18 + i * 14, gy + 12, 4, 42);
  x.fillRect(gx + 12, gy + 28, 72, 4);

  // South Gopura Sealed Temple Door (Bottom Wall Center) flanked by Naga Statues
  const dx = w / 2 - 46, dy = h - 58;
  x.fillStyle = '#5a3a22'; x.fillRect(dx, dy, 92, 54);
  x.fillStyle = P.trim; x.fillRect(dx, dy, 92, 6);
  x.fillStyle = '#3d2514';
  for (let i = 1; i < 4; i++) x.fillRect(dx + i * 23, dy, 3, 54);
  x.strokeStyle = '#221208'; x.lineWidth = 3; x.strokeRect(dx, dy, 92, 54);
  // Sacred Golden Garuda Emblem Lock on South Gate
  x.fillStyle = P.accent;
  x.fillRect(w / 2 - 10, dy + 18, 20, 18);
  x.fillStyle = '#b84020';
  x.fillRect(w / 2 - 4, dy + 22, 8, 10);

  // Flanking Golden Singha / Naga Pedestals by the South Gate
  for (const [kx, ky] of [[w / 2 + 64, h - 56], [w / 2 - 92, h - 56]]) {
    x.fillStyle = '#6e5236'; x.fillRect(kx, ky, 28, 28);
    x.fillStyle = P.trim; x.fillRect(kx + 2, ky + 2, 24, 6);
    x.fillStyle = P.accent; x.fillRect(kx + 8, ky + 10, 12, 12);
    x.strokeStyle = '#24160a'; x.lineWidth = 2; x.strokeRect(kx, ky, 28, 28);
  }
}

/* ===== Animated Khmer Bronze Brazier Flame (with Lotus Sparks) ===== */
export function drawTorchFlame(c, x, y, time, phase) {
  const fr = Math.floor(time * 10 + phase) % 3;
  c.save();
  c.translate(Math.round(x), Math.round(y - 12));
  // Golden Khmer Lotus Brazier Rim
  c.fillStyle = '#d49b3b';
  c.fillRect(-9, -1, 18, 3);
  c.fillRect(-11, -3, 3, 3);
  c.fillRect(8, -3, 3, 3);

  // Outer Sacred Flame
  c.fillStyle = '#ff6a18';
  if (fr === 0) { c.fillRect(-5, -11, 10, 10); c.fillRect(-3, -15, 6, 4); }
  if (fr === 1) { c.fillRect(-4, -10, 8, 9); c.fillRect(-2, -15, 4, 5); }
  if (fr === 2) { c.fillRect(-5, -12, 10, 11); c.fillRect(-3, -16, 4, 4); c.fillRect(1, -14, 3, 3); }
  // Inner Golden Core
  c.fillStyle = '#ffc840';
  if (fr === 0) { c.fillRect(-3, -8, 6, 7); c.fillRect(-1, -12, 2, 4); }
  if (fr === 1) { c.fillRect(-2, -7, 4, 6); c.fillRect(-2, -11, 3, 4); }
  if (fr === 2) { c.fillRect(-2, -9, 5, 8); c.fillRect(0, -13, 2, 4); }
  c.fillStyle = '#fff6c0';
  c.fillRect(-1, -5, 3, 4);
  // Rising Sacred Prana Sparks
  const ey = (time * 36 + phase * 9) % 20;
  c.fillStyle = `rgba(255,215,100,${0.9 - ey / 24})`;
  c.fillRect(fr % 2 ? 3 : -5, -15 - ey * 0.75, 2, 2);
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
  c.fillRect(-3 * u, -5 * u, 6 * u, 1 * u);
  c.fillStyle = accent;
  c.fillRect(-3 * u, -6 * u, 6 * u, 1 * u);
  c.fillRect(-4 * u, -10 * u, 1 * u, 2 * u);
  c.fillRect(3 * u, -10 * u, 1 * u, 2 * u);
  c.fillStyle = shade(color.startsWith('#') ? color : '#4a3d34', 0.25);
  c.fillRect(-3 * u, -10 * u, 6 * u, 1 * u);

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

/* ===== pixel slime / guardian spirit minion ===== */
export function drawPixelSlime(c, x, y, wobble, color:any = null) {
  const s = 1 + Math.sin(wobble) * 0.14;
  c.save();
  c.translate(Math.round(x), Math.round(y));
  // Golden Naga crest tail
  c.fillStyle = '#f0c14b';
  c.fillRect(5, -5, 5, 3);
  c.fillRect(8, -8, 3, 4);
  // body tiers (squash)
  const col = color || '#7affc0';
  c.fillStyle = shade(col.startsWith('#') ? col : '#7affc0', -0.25);
  c.fillRect(Math.round(-6 * s), -3, Math.round(12 * s), 3);
  c.fillStyle = col;
  c.fillRect(Math.round(-5 * s), -8, Math.round(10 * s), 5);
  c.fillStyle = shade(col.startsWith('#') ? col : '#7affc0', 0.15);
  c.fillRect(Math.round(-3 * s), -11, Math.round(6 * s), 3);
  // Crown jewel
  c.fillStyle = '#ffd54f';
  c.fillRect(-1, -13, 2, 2);
  // highlight
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.fillRect(Math.round(-4 * s), -9, 2, 2);
  // eyes
  c.fillStyle = '#1a1420';
  c.fillRect(-3, -7, 2, 2);
  c.fillRect(1, -7, 2, 2);
  c.restore();
}
