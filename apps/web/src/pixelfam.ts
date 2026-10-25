// pixelfam.ts — cohesive pixel-art sprite family: hero + enemies + bosses.
//
// Visual system (the contract):
//   - chunky 16-bit top-down dungeon
//   - every sprite is a string grid; 1 cell = 1 buffer pixel at scale 1
//   - flat fills only (no gradients): base / dark / light per material
//   - stable 1px family outline color (OUT)
//   - glowing 1-2px eyes = family signature
//   - bottom-center anchor, feet on the bottom row
//   - sprites pre-bake to tiny offscreen canvases, blitted nearest-neighbor
//     so they stay crisp through the 426x240 downscale buffer.

const TAU = Math.PI * 2;
const OUT = '#14101d';

const shade = (hex, p) => {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = p > 0 ? (x) => Math.min(255, Math.round(x + (255 - x) * p)) : (x) => Math.max(0, Math.round(x * (1 + p)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};
const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;

/* ================= grid sprite engine ================= */
/* def = { w, lift?, frames: string[][], pal(c, d, B) -> {char: color} } */
const _bake = new Map();
function bake(def, c, d, B) {
  const key = def.name + '|' + c + '|' + d + '|' + B;
  let arr = _bake.get(key);
  if (!arr) {
    arr = def.frames.map(rows => {
      const cv = document.createElement('canvas');
      cv.width = def.w; cv.height = rows.length;
      const x = cv.getContext('2d');
      const P = def.pal(c, d, B);
      for (let y = 0; y < rows.length; y++) {
        const row = rows[y];
        for (let i = 0; i < row.length; i++) {
          const col = P[row[i]];
          if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
        }
      }
      return cv;
    });
    _bake.set(key, arr);
  }
  return arr;
}
/* blit frame so the grid's bottom row sits at (x, y), cell = world px per cell */
function blit(g, def, c, d, B, x, y, cell, flip, frame) {
  const fr = bake(def, c, d, B);
  const f = fr[frame % fr.length];
  const W = def.w, H = f.height;
  const wpx = W * cell, hpx = H * cell;
  const lift = (def.lift || 0) * cell;
  g.save();
  g.imageSmoothingEnabled = false;
  if (flip) g.scale(-1, 1);
  g.drawImage(f, Math.round(-wpx / 2 + x), Math.round(y - hpx + lift), Math.round(wpx), Math.round(hpx));
  g.restore();
}
export function hasPx(key) { return !!SPRITES[key]; }
export function pxFrameCount(key) { const s = SPRITES[key]; return s ? s.frames.length : 0; }
export function drawPxSprite(g, key, c, d, B, x, y, cell, flip, frame) {
  const def = SPRITES[key];
  if (!def) return false;
  blit(g, def, c, d, B, x, y, cell, flip, frame);
  return true;
}

/* ================= shared palettes ================= */
const P_hood = (c, d) => ({ o: OUT, h: shade(c, -0.15), H: shade(c, 0.3), B: c, D: shade(c, -0.45), L: shade(c, 0.25) });
const P_bone = (c, d, B) => {
  const bone = B === 'frost' ? '#d6efff' : B === 'shadow' ? '#6a5a96' : B === 'caverns' ? '#bdb590' : '#ece6d0';
  const boneD = B === 'frost' ? '#9fc8e8' : B === 'shadow' ? '#4a3a76' : B === 'caverns' ? '#8a8468' : '#b8b09a';
  const glow = B === 'frost' ? '#7fd4ff' : B === 'shadow' ? '#d09aff' : B === 'caverns' ? '#ffb040' : '#ff5252';
  return { o: OUT, K: bone, k: boneD, E: glow, M: '#5a5f66', m: '#3a3e44' };
};

/* ================= SPRITES ================= */
const SPRITES = {};
const put = (name, def) => { SPRITES[name] = def; };

/* ---------- HERO: hooded wanderer, 12w x 20h, 2-frame stride ---------- */
put('hero', {
  name: 'hero', w: 12,
  frames: [
    [
      '...oooooo...',
      '..oHHHHHHo..',
      '.oHHHHHHHHo.',
      '.oHSSSSSSHo.',
      '..oSESSSESo.',
      '..oSSSSSSo..',
      '...oBBBBo...',
      '..oBBBBBBo..',
      '.oLBBBBBBDo.',
      '...oAAAAo...',
      '...oD..Do...',
      '...oD..Do...',
      '..oDD..DDo..'],
    [
      '...oooooo...',
      '..oHHHHHHo..',
      '.oHHHHHHHHo.',
      '.oHSSSSSSHo.',
      '..oSESSSESo.',
      '..oSSSSSSo..',
      '...oBBBBo...',
      '..oBBBBBBo..',
      '.oLBBBBBBDo.',
      '...oAAAAo...',
      '...oD..Do...',
      '..oDD..DDo..',
      '..oDD...DDo.']
  ],
  pal: (c, d, B) => {
    const acc = d || '#ffd9a0';
    return {
      o: OUT, h: shade(c, -0.1), H: shade(c, 0.35), B: c, D: shade(c, -0.45), L: shade(c, 0.25),
      A: acc, S: '#d9b18c', s: '#b98f6e', E: acc,
    };
  },
});

/* ---------- FALLEN: tattered demon in robe, 11w x 13h ---------- */
put('fallen', {
  name: 'fallen', w: 11,
  frames: [
    [      '..oo...oo..',
      '..ooo.ooo..',
      '..ooooooo..',
      '..oSSSSSo..',
      '.ohSSSSSho.',
      '.ohhEhEhho.',
      '..oBBBBBo..',
      'oLBBBBBBDo.',
      'oLLBBBBBDo.',
      '.oDBBAABo..',
      '..oDBBBo...',
      '..oD..Do...',
      '.oD...oD...']
  ],
  pal: (c, d, B) => ({ ...P_hood(c, d), S: '#a89a8a', E: '#ff4a4a', A: shade(c, -0.3) }),
});

/* ---------- SKELETON: ribcage + sword, 11w x 15h, 2-frame ---------- */
put('skeleton', {
  name: 'skeleton', w: 11,
  frames: [
    [      '...oooooo..',
      '..oKKKKKo..',
      '.oKKEEEKKo.',
      '.oKKKKKKKo.',
      '..oKKKKKo..',
      '...oKKKo...',
      '..oKkkkKo..',
      'oKoKkkkKoKo',
      '.oKkKKkKo..',
      '..oKkkkKo..',
      '..oKkkkKo..',
      '...oK.Ko...',
      '...oK.Ko...',
      '..oKo.oKo..',
      '..oo...oo..'],
    [      '...oooooo..',
      '..oKKKKKo..',
      '.oKKEEEKKo.',
      '.oKKKKKKKo.',
      '..oKKKKKo..',
      '...oKKKo...',
      '..oKkkkKo..',
      'oKoKkkkKoKo',
      '.oKkKKkKo..',
      '..oKkkkKo..',
      '..oKkkkKo..',
      '...oK.Ko...',
      '..oK...Ko..',
      '..oo....oo.',
      '...o....o..']
  ],
  pal: (c, d, B) => ({ ...P_bone(c, d, B), W: '#cfd9e8', G: '#6b543a' }),
});

/* ---------- ARCHER: hooded, bow at right, 12w x 14h ---------- */
put('archer', {
  name: 'archer', w: 12,
  frames: [
    [      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohSSSSSho..',
      '.ohSESSESo..',
      '..ohhhhhho..',
      '.oBBBBBBBo..',
      'oLBBBBBBDBoo',
      'oLBBBBBBBBoo',
      '.oDBBAABDo.o',
      '..oDBBBo..oo',
      '..oD..Do..o.',
      '..oD..Do..o.',
      '.oG....Go.o.']
  ],
  pal: (c, d, B) => ({ ...P_hood(c, d), S: '#caa27a', E: '#ffe082', A: shade(c, -0.3), G: '#5f4a33', W: '#e8e0c0', b: '#8a5a2a' }),
});

/* ---------- BRUTE: hulk with rock shoulders, 14w x 12h, 2-frame ---------- */
put('brute', {
  name: 'brute', w: 14,
  frames: [
    [      '....oooooo....',
      '...oBBBBBBo...',
      '..oLBBBBBBDBo.',
      '.oRBBEBBEBBo..',
      'oRRoBBBBBBoRo.',
      'oRRoLBBBBDoo..',
      '.oRBBBBBBBo...',
      '..oDBBAABo....',
      '..oDBBBDBo....',
      '.oDD..DDDo....',
      '.oDD...DDo....',
      'oGGo.....oGGo.'],
    [      '....oooooo....',
      '...oBBBBBBo...',
      '..oLBBBBBBDBo.',
      '.oRBBEBBEBBo..',
      'oRRoBBBBBBoRo.',
      'oRRoLBBBBDoo..',
      '.oRBBBBBBBo...',
      '..oDBBAABo....',
      '..oDBBBDBo....',
      '..oDDDDDDo....',
      '..oD....Do....',
      '.oGGo...oGGo..']
  ],
  pal: (c, d, B) => {
    const lava = B === 'volcano';
    return {
      o: OUT, B: c, D: shade(c, -0.45), L: shade(c, 0.22),
      R: lava ? '#5a1a0a' : '#7a6a5a', E: lava ? '#ffd54f' : '#ff5252',
      A: lava ? '#ff7a30' : shade(c, -0.3), G: shade(c, -0.55), F: lava ? '#ffb040' : '#ece6d0',
    };
  },
});

/* ---------- SPIDER: flat body, 8 legs, 14w x 10h, 2-frame legs ---------- */
put('spider', {
  name: 'spider', w: 14,
  frames: [
    [
      '....oooooo....',
      '..o.KKKKKK.o..',
      'o.oKEKKKKEKoo.',
      'ooKKKKKKKKKKoo',
      '.oKKKKKKKKKKo.',
      'oKKkkKKKKkkKKo',
      'oKKkkKKKKkkKKo',
      '.oKKKKKKKKKKo.',
      '..oK.KKKK.Ko..',
      '....oooooo....'],
    [
      '....oooooo....',
      '..o.KKKKKK.o..',
      'oo.oKEKKKEK.oo',
      'ooKKKKKKKKKKoo',
      '.oKKKKKKKKKKo.',
      'oKKkkKKKKkkKKo',
      'oKKkkKKKKkkKKo',
      '.oKKKKKKKKKKo.',
      '.oK..KKKK..Ko.',
      '....oooooo....']
  ],
  pal: (c, d, B) => ({
    o: OUT, K: c, k: shade(c, -0.45),
    E: B === 'shadow' ? '#c080ff' : B === 'caverns' ? '#ffb040' : '#ff5252',
    S: B === 'crypt' ? '#e6e0cc' : B === 'caverns' ? '#ece6d0' : null,
  }),
});

/* ---------- GOLEM: stone block, glowing core, 13w x 15h ---------- */
put('golem', {
  name: 'golem', w: 14,
  frames: [
    [      '...oooooooo...',
      '...oRRRRRRo...',
      '..oRRREEERRo..',
      '..oRRRRRRRRo..',
      '...oRRRRRRo...',
      '.ooRRRRRRRoo..',
      'oRORRRRRRRoRo.',
      'oRORRFFFFRoRo.',
      'oRORRFFFFRoRo.',
      'oRORRRRRRRoRo.',
      '..oRRRRRRRoo..',
      '..oRR....RRo..',
      '..oRR....RRo..',
      '.oRro....orrO.',
      '.oRo......oRo.']
  ],
  pal: (c, d, B) => ({ o: OUT, R: c, r: shade(c, -0.45), F: '#ffb040', E: '#ffb040' }),
});

/* ---------- BOMBER: barrel body, lit fuse, 11w x 12h ---------- */
put('bomber', {
  name: 'bomber', w: 10,
  frames: [
    [      '......o...',
      '.....oFf..',
      '.....ooo..',
      '...oooooo.',
      '..oBBBBBo.',
      '.oBBEEBBo.',
      'oBBEBEEBBo',
      'oBBBBBBBBo',
      'oBMMBBBBBo',
      '.oBMMBBBBo',
      '..ooooooo.',
      '.oo....oo.']
  ],
  pal: (c, d, B) => {
    const lava = B === 'volcano';
    return {
      o: OUT, B: lava ? '#ff8a30' : '#4a4a4a', E: lava ? '#2a0a00' : '#ffe082',
      M: lava ? '#8a2a10' : '#6a4a2a', F: '#ffd54f', f: '#ff8a30',
    };
  },
});

/* ---------- SNIPER: dark hood + long rifle, 12w x 15h ---------- */
put('sniper', {
  name: 'sniper', w: 12,
  frames: [
    [      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohhEEEhhho.',
      '.ohhhhhhhho.',
      '..ohhhhhho..',
      '.oBBBBBBBo..',
      'oLBBBBBBDBoo',
      'oLBBBBBBBBoo',
      '.oDBBBBBoo..',
      '.oDBBBBBoMWM',
      '..oDBBBoMWM.',
      '..oD..DoMM..',
      '..oD..Do....',
      '.oG....Go...']
  ],
  pal: (c, d, B) => ({ ...P_hood(c, d), E: '#ff5252', M: '#2a2020', W: '#cfd8dc', G: '#5f4a33' }),
});

/* ---------- ICE ELEMENTAL: floating crystal, 11w x 14h, 2-frame ---------- */
put('iceElemental', {
  name: 'iceElemental', w: 11, lift: 3,
  frames: [
    [      '.....w.....',
      '....oCo....',
      '...oCCCeo..',
      '..oCCCCCeo.',
      '..oCCCECCo.',
      '.oCCCECCEo.',
      '.oCCCCECCo.',
      '.oCCCECCCeo',
      '..oCCCCECeo',
      '..oCCCCCeo.',
      '...oCCCeo..',
      '....oCo....',
      '.....o.....'],
    [      '.....w.....',
      '....oCo....',
      '...oCCCeo..',
      '..oCCCCCeo.',
      '..oCCCECCeo',
      '.oCCCECCCEo',
      '.oCCCCECCeo',
      '.oCCCECCCeo',
      '..oCCCCECeo',
      '..oCCCCCeo.',
      '...oCCCeo..',
      '....oCo....',
      '.....o.....']
  ],
  pal: () => ({ o: '#1a3a5a', C: '#7fd4ff', e: '#bfeaff', E: '#ffffff', w: '#e8f8ff' }),
});

/* ---------- FIRE IMP: small horned imp, 11w x 12h ---------- */
put('fireImp', {
  name: 'fireImp', w: 11,
  frames: [
    [      '..oo...oo..',
      '.oFo...oFo.',
      '..oBBBBBo..',
      '.oBBBBBBo..',
      '.oBEEBEEBo.',
      '.oBBBBBBo..',
      'oFoBBBBBoFo',
      '.oDBBBBBo..',
      '..oDBBBo...',
      '..oD.F.Do..',
      '.oD...oD...',
      '......F....']
  ],
  pal: () => ({ o: OUT, B: '#ff5020', D: '#8a2a10', E: '#ffe082', F: '#ffb040', f: '#ff7a30' }),
});

/* ---------- WRAITH: ghostly tattered, 10w x 14h, 2-frame hem ---------- */
put('wraith', {
  name: 'wraith', w: 10, lift: 2,
  frames: [
    [      '...oooo...',
      '..oAAAAo..',
      '.oAEAAEAo.',
      '.oAEAAEAo.',
      '.oAAAAAAo.',
      '.oAAAAAAo.',
      'oAAAAAAAAo',
      'oAAAAAAAAo',
      '.oAAAAAAo.',
      '.oAAoAAo..',
      '.oA.oA.o..',
      '.o..o.o...',
      '..........'],
    [      '...oooo...',
      '..oAAAAo..',
      '.oAEAAEAo.',
      '.oAEAAEAo.',
      '.oAAAAAAo.',
      '.oAAAAAAo.',
      'oAAAAAAAAo',
      'oAAAAAAAAo',
      '.oAAAAAAo.',
      '.oAAoAAo..',
      '..oAo.oAo.',
      '..o.o..o..',
      '..........']
  ],
  pal: (c, d, B) => {
    const ice = B === 'frost';
    return { o: ice ? '#3a6a8a' : '#1a0a2a', A: ice ? '#bfe4ff' : '#5a2a9a', E: ice ? '#ffffff' : '#d09aff' };
  },
});

/* ---------- HEALER: white robe, halo, staff, 12w x 15h ---------- */
put('healer', {
  name: 'healer', w: 10,
  frames: [
    [      '....oooo..',
      '...oFFFFo.',
      '...oooooo.',
      '..oSSSSSo.',
      '.oSSEESSo.',
      '..oSSSSSo.',
      '.oWWWWWWo.',
      'oWWWWWWWWo',
      'oWWGGGGWWo',
      'oWWGWWGWWo',
      '.oWWWWWWo.',
      '.oWWWWWWo.',
      '.oWW..WWo.',
      '..oG..Go..',
      '..oo..oo..']
  ],
  pal: () => ({ o: OUT, F: '#ffd54f', S: '#d8f0d8', W: '#e8f5e8', G: '#2a8a4a', E: '#2a5a2a', T: '#8a6a3a' }),
});

/* ---------- SHAMAN: dark robe, orb staff, 12w x 15h ---------- */
put('shaman', {
  name: 'shaman', w: 10,
  frames: [
    [      '....ooooo.',
      '...oKKKKo.',
      '..oKEKEKo.',
      '..oKKKKKo.',
      '...oKKKo..',
      '.oBBBBBBoo',
      'oBBBBBBBBo',
      'oBBBBBBBBo',
      'oDBBAAABDo',
      '.oDBBBBBoo',
      '.oDBBBBBoo',
      '..oDDBBo.o',
      '..oD..Do.o',
      '..oD..Do.o',
      '.oG...Go.o']
  ],
  pal: (c, d, B) => {
    const lava = B === 'volcano';
    return {
      o: OUT, K: lava ? '#8a2a10' : '#e0dac8', Kk: lava ? '#5a1a0a' : '#b8b0a0',
      E: lava ? '#ffd54f' : '#ff5252', B: c, D: shade(c, -0.45), A: lava ? '#ffb040' : '#c0a0e0',
      G: '#5a3a1a', O: lava ? '#ff7a30' : '#8e44ad',
    };
  },
});

/* ---------- MAGE: pointy hat, floating orb, 12w x 16h ---------- */
put('mage', {
  name: 'mage', w: 10,
  frames: [
    [      '......o...',
      '.....oHo..',
      '....oHHo..',
      '...oHHHo..',
      '..oHHHHo..',
      '..oooooo..',
      '.oSSSSSSo.',
      '.oSESSESo.',
      '..oSSSSo..',
      '.oBBBBBBoo',
      'oLBBBBBBoo',
      'oLBBBBBBoo',
      '.oDBBAABo.',
      '..oDBBBo..',
      '..oD..Do..',
      '.oG....Go.']
  ],
  pal: (c, d, B) => ({ ...P_hood(c, d), S: '#caa27a', E: '#1a3a6a', A: shade(c, -0.3), G: '#5f4a33', O: '#8ac8ff' }),
});

/* ---------- CHARGER: low boar, 14w x 9h, 2-frame legs ---------- */
put('charger', {
  name: 'charger', w: 16,
  frames: [
    [      '.....oooooo.....',
      '....oBBBBBBoo...',
      '...oLBBBBBBoo...',
      '..oBBEBBBBEBBo..',
      '.oFBBBBBBBBBBo..',
      'oFBBBBBBBBBBoF..',
      '.oDDBBBBBBBDDo..',
      '..oDo.o.o.oDo...',
      '..oo..o..o..oo..'],
    [      '.....oooooo.....',
      '....oBBBBBBoo...',
      '...oLBBBBBBoo...',
      '..oBBEBBBBEBBo..',
      '.oFBBBBBBBBBBo..',
      'oFBBBBBBBBBBoF..',
      '.oDDBBBBBBBDDo..',
      '...oDo..o.oDo...',
      '...oo...o..oo...']
  ],
  pal: (c, d, B) => ({ o: OUT, B: c, D: shade(c, -0.5), L: shade(c, 0.2), F: '#ff7a30', E: '#ffe082', G: shade(c, -0.55) }),
});

/* ================= bosses ================= */

/* ---------- CRYPT LORD: crowned skeleton, 16w x 18h ---------- */
put('cryptLord', {
  name: 'cryptLord', w: 17,
  frames: [
    [      '.....o..o..o.....',
      '.....oFFFFo......',
      '....oFFFFFFo.....',
      '....ooFFFFoo.....',
      '...oKKKKKKKKo....',
      '..oKKEEEEKKKo....',
      '..oKKKKKKKKKo....',
      '...oKKKKKKKo.....',
      '....oKKKKKo......',
      '..oKkkkkkkkKo....',
      '.oKoKkkkkkkKoKo..',
      '.oKoKkKKKKkKoKo..',
      '.oKoKkkkkkkKoKo..',
      '...oKkkkkkkKo....',
      '...oKkkkkkkKo....',
      '....oKk..kKo.....',
      '....oKo..oKo.....',
      '...oKo....oKo....']
  ],
  pal: (c, d, B) => ({ ...P_bone(c, d, B), F: '#d4af37', E: '#ff3a3a' }),
});

/* ---------- CAVERN TITAN: rock golem with crystals, 16w x 14h ---------- */
put('cavernTitan', {
  name: 'cavernTitan', w: 17,
  frames: [
    [      '.oRRRRRRRRRRRRo..',
      'oRRRRRRRRRRRRRRo.',
      'oRRREEERRREEERRo.',
      'oRRRRRRRRRRRRRRo.',
      'oRorRRRRRRRRoRo..',
      'oRoRRRFFFFRRoRo..',
      '.oRRRRRFFFFRRRo..',
      '..oRRRRRRRRRRo...',
      '..oRo....oRoR.o..',
      '.oRoR....oRoRoR..']
  ],
  pal: (c, d, B) => ({ o: OUT, R: c, r: shade(c, -0.5), C: '#6ad8ff', F: '#ffb040', E: '#ffb040' }),
});

/* ---------- FROST WYRM: serpent, 20w x 11h ---------- */
put('frostWyrm', {
  name: 'frostWyrm', w: 24,
  frames: [
    [      '........................',
      '...oo..oo..oo..oo..oo...',
      '..oCCo.oCCo.oCCo.oCCo.o.',
      '..oCCCoCCCoCCCoCCoCCo...',
      '.oCCCCCCCCCCCCCCCCCCCo..',
      '.oCCCECCCCCCCCCCCCCCEo..',
      '..oCCCCCCCCCCCCCCCCCo...',
      '...oCCCCCCCCCCCCCCCco...',
      '....oCCCCCCCCCCCCco.....',
      '.....oCCCCCCCCco........',
      '......oooooo............']
  ],
  pal: () => ({ o: '#1a3a5a', C: '#7fd4ff', E: '#ffffff', c: '#bfeaff' }),
});

/* ---------- VOLCANO BEHEMOTH: massive hulk, 18w x 14h ---------- */
put('volcanoBehemoth', {
  name: 'volcanoBehemoth', w: 21,
  frames: [
    [      '...oo........oo......',
      '..oFo..oo..oFo.......',
      '..oF.oooooo.Fo.......',
      '...oBBBBBBBBBBBBo....',
      '..oBBBBBBBBBBBBBBo...',
      '.oFBBBBBBBBBBBBBBoF..',
      'oFFBBBBBBBBBBBBBFFo..',
      'oFBEEBBBBBBBBEEBBoF..',
      'oFBBBBBBBBBBBBBBBBo..',
      '.oFBBBBBBBBBBBBBBo...',
      '..oDBBBBBBBBBBBBBo...',
      '...oDDBBBBBBBBDDBo...',
      '...oDD....DD..DDo....',
      '..oGGo..oGGo..oGGo...']
  ],
  pal: () => ({ o: OUT, B: '#8a2a10', D: '#4a1005', E: '#ffd54f', F: '#ff7a30', G: '#2a0a00' }),
});

/* ---------- SHADOW PRINCE: robed figure, 14w x 17h ---------- */
put('shadowPrince', {
  name: 'shadowPrince', w: 14, lift: 2,
  frames: [
    [      '.....oooo.....',
      '....oFFFFo....',
      '....oFFFFo....',
      '....oooooo....',
      '...oAAAAAAo...',
      '..oAEAAAAEAo..',
      '..oAAAAAAAo...',
      '.oAAAAAAAAAo..',
      '.oAAAAAAAAAo..',
      '.oAAAAAAAAAo..',
      'oAAAAAAAAAAo..',
      'oAAAAAAAAAAo..',
      '.oAAAAAAAAAo..',
      '.oAAAAAAAAAo..',
      '..oAAAAAAAAo..',
      '..oAAoAAoAAo..',
      '...oA.oA.oA...']
  ],
  pal: (c, d, B) => ({ o: OUT, F: '#d4af37', A: '#2a0a4a', E: '#d09aff' }),
});

export const PIXFAM = { hasPx, pxFrameCount, drawPxSprite, SPRITES };
