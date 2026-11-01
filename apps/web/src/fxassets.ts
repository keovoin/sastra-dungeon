/* Sastra Dungeon — Angkor Khmer Era & Dungeon FX Assets.
   Preloads pixel spell sheets (smoke, holycross, holybeam, aura, summon, pets, icons)
   and composes a procedural pixel-art Angkor Wat / Bayon Temple Complex backdrop
   for the main menu. */

export const FXI: Record<string, HTMLImageElement[]> = {};
export const FX1: Record<string, HTMLImageElement | HTMLCanvasElement> = {};

const LISTS: Array<[string, string, number]> = [
  ['smoke', 'assets/fx_smoke_%d.png', 4],
  ['holycross', 'assets/fx_holycross_%d.png', 7],
  ['holybeam', 'assets/fx_holybeam_%d.png', 11],
  ['aura', 'assets/fx_aura_%d.png', 13],
  ['summon', 'assets/fx_summon_%d.png', 20],
  ['panda', 'assets/pet_panda_%d.png', 8],
];
const ONES: Record<string, string> = {
  cat: 'assets/pet_cat.png',
  bear: 'assets/pet_bear.png',
  coin: 'assets/icons/coin.png',
  sword: 'assets/icons/sword.png',
  crown: 'assets/icons/crown.png',
  shield: 'assets/icons/shield.png',
  ring: 'assets/icons/ring.png',
  skull: 'assets/icons/skull.png',
  heart: 'assets/icons/heart.png',
  potion: 'assets/icons/potion.png',
  flame: 'assets/icons/flame.png',
  gem: 'assets/icons/gem.png',
  bolt: 'assets/icons/bolt.png',
};

function mk(src: string): HTMLImageElement {
  const i = new Image();
  i.src = src;
  return i;
}

/* Compose a crisp Pixel-Art Angkor Wat & Bayon Temple Dungeon Backdrop */
function composeAngkorBg(): HTMLCanvasElement {
  const Wb = 1920, Hb = 1080, PX = 4;
  const c = document.createElement('canvas');
  c.width = Wb;
  c.height = Hb;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;

  const rect = (rx: number, ry: number, rw: number, rh: number, col: string) => {
    x.fillStyle = col;
    x.fillRect(
      Math.floor(rx / PX) * PX,
      Math.floor(ry / PX) * PX,
      Math.max(PX, Math.ceil(rw / PX) * PX),
      Math.max(PX, Math.ceil(rh / PX) * PX)
    );
  };

  // 1. Stepped Angkor Twilight Sky (Deep Indigo -> Royal Violet -> Crimson -> Temple Gold)
  const skyBands = [
    '#090514', '#0e071d', '#160b29', '#211038', '#2e1546',
    '#3f1b52', '#542158', '#6b2958', '#843353', '#9d414b',
    '#b55342', '#ca693b', '#dc8338', '#e89f42', '#f0ba58'
  ];
  const horizonY = 620;
  const bandH = Math.ceil(horizonY / skyBands.length);
  skyBands.forEach((col, i) => {
    rect(0, i * bandH, Wb, bandH + PX, col);
  });

  // Pixel stars & sacred constellations in upper sky
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 160; i++) {
    const sx = rnd() * Wb;
    const sy = rnd() * (horizonY * 0.65);
    const bright = rnd() > 0.75;
    rect(sx, sy, bright ? PX * 1.5 : PX, bright ? PX * 1.5 : PX, bright ? '#fff4cc' : '#b89cd8');
  }

  // Sacred Golden Sun / Mandala Halo behind the central Prasat spire
  const sunX = Wb / 2, sunY = horizonY - 190;
  const sunRings = [
    [220, 'rgba(255, 168, 60, 0.10)'],
    [170, 'rgba(255, 190, 75, 0.16)'],
    [125, 'rgba(255, 215, 100, 0.24)'],
    [85, 'rgba(255, 238, 155, 0.42)'],
    [54, 'rgba(255, 250, 210, 0.75)'],
  ];
  for (const [r, col] of sunRings) {
    const rad = r as number;
    for (let dy = -rad; dy <= rad; dy += PX) {
      const hw = Math.sqrt(Math.max(0, rad * rad - dy * dy));
      rect(sunX - hw, sunY + dy, hw * 2, PX, col as string);
    }
  }

  // Distant Jungle Canopy Silhouettes
  for (let tx = 0; tx < Wb; tx += PX * 3) {
    const jh = 28 + Math.sin(tx * 0.012) * 18 + Math.cos(tx * 0.037) * 12;
    rect(tx, horizonY - jh, PX * 3, jh + 8, '#140c1c');
  }

  // Helper to draw a stepped Angkor Lotus-Bud Prasat Tower
  const drawPrasatTower = (cx: number, baseY: number, baseW: number, height: number, isMain: boolean) => {
    const tiers = 7;
    for (let t = 0; t < tiers; t++) {
      const frac = t / tiers;
      const nextFrac = (t + 1) / tiers;
      // Lotus-bud curve profile
      const wFactor = Math.pow(1 - frac * 0.78, 1.25);
      const tw = Math.max(PX * 3, baseW * wFactor);
      const y0 = baseY - height * nextFrac;
      const y1 = baseY - height * frac;
      const th = y1 - y0 + PX;
      // Main sandstone shadow & warm gold rim light
      rect(cx - tw / 2, y0, tw, th, '#1b1218');
      rect(cx - tw / 2, y0, PX * 2, th, '#523828'); // left warm rim
      rect(cx + tw / 2 - PX * 2, y0, PX * 2, th, '#36221c'); // right rim
      // Stepped Khmer antefix ridges on each tier
      rect(cx - tw / 2 - PX, y1 - PX * 2, tw + PX * 2, PX * 2, '#2d1e22');
      rect(cx - tw / 2 - PX, y0, tw + PX * 2, PX, '#7a5230');
      // Central carved niche / false door on lower tiers
      if (t < 3) {
        const nw = Math.max(PX * 2, tw * 0.28);
        rect(cx - nw / 2, y0 + PX * 2, nw, th - PX * 2, '#0d070c');
        if (t === 0 && isMain) {
          // Glowing inner sanctum portal
          rect(cx - nw / 2 + PX, y0 + PX * 4, nw - PX * 2, th - PX * 4, '#ff9233');
          rect(cx - nw / 4, y0 + PX * 6, nw / 2, th - PX * 6, '#ffe484');
        }
      }
    }
    // Spire pinnacle (Kalasa lotus finial)
    rect(cx - PX, baseY - height - PX * 7, PX * 2, PX * 7, '#d49b3b');
    rect(cx - PX * 2, baseY - height - PX * 3, PX * 4, PX * 2, '#f4c862');
  };

  // Gallery wall connecting the 5 Angkor towers
  rect(260, horizonY - 88, Wb - 520, 88, '#170f16');
  rect(260, horizonY - 92, Wb - 520, PX * 2, '#5c3e26');
  // Colonnade pillars along gallery
  for (let px = 290; px < Wb - 290; px += 28) {
    rect(px, horizonY - 76, PX * 2, 72, '#0c070c');
    rect(px - PX, horizonY - 76, PX, 72, '#3d281e');
  }

  // Five Prasat Towers of Angkor Wat
  drawPrasatTower(Wb / 2 - 520, horizonY - 60, 128, 190, false);
  drawPrasatTower(Wb / 2 - 270, horizonY - 72, 156, 250, false);
  drawPrasatTower(Wb / 2 + 270, horizonY - 72, 156, 250, false);
  drawPrasatTower(Wb / 2 + 520, horizonY - 60, 128, 190, false);
  drawPrasatTower(Wb / 2, horizonY - 80, 210, 350, true);

  // 2. Sacred Baray Water Moat (horizonY to Hb)
  for (let wy = horizonY; wy < Hb; wy += PX) {
    const t = (wy - horizonY) / (Hb - horizonY);
    const r = Math.round(28 - t * 16);
    const g = Math.round(20 - t * 12);
    const b = Math.round(38 - t * 20);
    rect(0, wy, Wb, PX, `rgb(${r},${g},${b})`);
    // Water shimmer ripples reflecting sunset gold
    const rippleCount = Math.floor(6 * (1 - t * 0.5));
    for (let k = 0; k < rippleCount; k++) {
      const rx = ((wy * 73 + k * 389) % (Wb - 200)) + 100;
      const distCenter = Math.abs(rx - Wb / 2);
      const isGold = distCenter < 380;
      rect(rx, wy, PX * (isGold ? 6 : 3), PX, isGold ? 'rgba(240,175,75,0.22)' : 'rgba(140,90,150,0.16)');
    }
  }

  // Lotus pads & blossoms floating on the Baray moat
  for (let i = 0; i < 42; i++) {
    const lx = rnd() * Wb;
    const ly = horizonY + 40 + rnd() * (Hb - horizonY - 80);
    if (Math.abs(lx - Wb / 2) < 190) continue; // keep causeway clear
    rect(lx - PX * 2, ly, PX * 5, PX * 2, '#1f4a32');
    if (rnd() > 0.35) {
      rect(lx - PX, ly - PX, PX * 3, PX * 2, '#e878a0');
      rect(lx, ly - PX * 2, PX, PX, '#ffd9ec');
    }
  }

  // 3. Central Sandstone Naga Causeway leading from bottom to the Temple Gate
  for (let cy = horizonY; cy < Hb; cy += PX * 2) {
    const t = (cy - horizonY) / (Hb - horizonY);
    const halfW = 90 + t * 210;
    // Causeway stone slabs
    rect(Wb / 2 - halfW, cy, halfW * 2, PX * 2, ((cy / (PX * 2)) % 2 === 0) ? '#3a2d27' : '#312520');
    // Gold/sandstone curb
    rect(Wb / 2 - halfW - PX * 3, cy, PX * 3, PX * 2, '#6e5239');
    rect(Wb / 2 + halfW, cy, PX * 3, PX * 2, '#6e5239');
  }

  // 7-Headed Naga Fan Balustrades & Bronze Torch Braziers along the Causeway
  for (const side of [-1, 1]) {
    const nagaX = Wb / 2 + side * 245;
    const nagaY = Hb - 140;
    // Naga hood fan
    rect(nagaX - PX * 7, nagaY - PX * 12, PX * 14, PX * 12, '#5c4328');
    rect(nagaX - PX * 5, nagaY - PX * 14, PX * 10, PX * 12, '#8c683a');
    for (let h = -3; h <= 3; h++) {
      rect(nagaX + h * PX * 2 - PX / 2, nagaY - PX * 17 + Math.abs(h) * PX, PX, PX * 4, '#e0b252');
    }
    // Glowing temple brazier
    const bx = Wb / 2 + side * 165, by = horizonY + 140;
    rect(bx - PX * 2, by, PX * 4, PX * 8, '#4a3525');
    rect(bx - PX * 3, by - PX * 2, PX * 6, PX * 2, '#d49b3b');
    rect(bx - PX * 2, by - PX * 6, PX * 4, PX * 4, '#ff7820');
    rect(bx - PX, by - PX * 8, PX * 2, PX * 4, '#ffe070');
  }

  // Dark atmospheric vignette so the menu UI pops with crisp contrast
  x.fillStyle = 'rgba(8, 5, 14, 0.38)';
  x.fillRect(0, 0, Wb, Hb);
  const vg = x.createRadialGradient(Wb / 2, Hb / 2, Hb * 0.25, Wb / 2, Hb / 2, Wb * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0.05)');
  vg.addColorStop(1, 'rgba(0,0,0,0.68)');
  x.fillStyle = vg;
  x.fillRect(0, 0, Wb, Hb);
  return c;
}

export function preloadFx(): Promise<void> {
  return new Promise(resolve => {
    FX1.townbg = composeAngkorBg();
    let left = 0;
    const done = () => { if (--left <= 0) resolve(); };
    for (const [key, pat, n] of LISTS) {
      const arr: HTMLImageElement[] = new Array(n);
      for (let i = 1; i <= n; i++) {
        const im = mk(pat.replace('%d', String(i)));
        left++;
        im.onload = () => { arr[i - 1] = im; done(); };
        im.onerror = () => { done(); };
      }
      FXI[key] = arr;
    }
    for (const [name, src] of Object.entries(ONES)) {
      const im = mk(src);
      left++;
      im.onload = () => {
        FX1[name] = im;
        done();
      };
      im.onerror = () => { done(); };
    }
    if (left === 0) resolve();
  });
}
