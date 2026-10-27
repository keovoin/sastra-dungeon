/* heropix.ts — class-specific hero sprites + live weapons.
   Ported verbatim from Shadowrift's PIX system: dark silhouettes, hard dark
   outline, warm/violet rim light, ordered-dither shading, hand-placed pixels,
   stepped animation. hero() draws a 30x30 class sprite (cached per key+frame)
   plus a weapon that tracks the aim angle with a swing trail.
   y = old body centre; feet land at y+19. PX=2 world px per sprite pixel. */

import {CLASSES} from './game';

const PX = 2, OUT = '#0b0612';
const hx = (c: string) => { const n = parseInt(c.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
const th = (a: number[]) => '#' + a.map(v => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2)).join('');
const okc = (c: any) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '#8a8a9a';
const mx = (a: any, b: any, t: number) => { const A = hx(okc(a)), B = hx(okc(b)); return th(A.map((v: number, i: number) => v + (B[i] - v) * t)); };
const lt = (c: any, t: number) => mx(c, '#ffffff', t), dk = (c: any, t: number) => mx(c, '#0a0612', t);
const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/* turn a raw (aliased) canvas into a finished sprite: hard alpha, palette
   quantise + dither, dark outline, rim light on top/left edges */
function finish(src: HTMLCanvasElement, o: any) {
  o = o || {};
  const w = src.width, h = src.height, W2 = w + 2, H2 = h + 2;
  const sd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = mk(W2, H2), ox = out.getContext('2d')!, img = ox.createImageData(W2, H2), od = img.data;
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : (sd[(y * w + x) * 4 + 3] >= o.thr ? 1 : 0);
  const rm = o.rim ? hx(o.rim) : null, oc = hx(OUT), step = o.step || 0, rk = o.rimK == null ? 0.5 : o.rimK;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    const i = ((y + 1) * W2 + (x + 1)) * 4;
    if (A(x, y)) {
      const s = (y * w + x) * 4; let r = sd[s], g = sd[s + 1], b = sd[s + 2];
      if (step) { const t = (BAY[(y & 3) * 4 + (x & 3)] + .5) / 16 - .5, q = (v: number) => Math.max(0, Math.min(255, Math.round(v / step + t * .6) * step)); r = q(r); g = q(g); b = q(b); }
      if (rm && (!A(x, y - 1) || !A(x - 1, y))) { r += (rm[0] - r) * rk; g += (rm[1] - g) * rk; b += (rm[2] - b) * rk; }
      od[i] = r; od[i + 1] = g; od[i + 2] = b; od[i + 3] = 255;
    } else if (A(x + 1, y) || A(x - 1, y) || A(x, y + 1) || A(x, y - 1)) { od[i] = oc[0]; od[i + 1] = oc[1]; od[i + 2] = oc[2]; od[i + 3] = 255; }
  }
  ox.putImageData(img, 0, 0); return out;
}
function flashOf(c: HTMLCanvasElement) {
  const cc = c as any;
  if (cc._f) return cc._f;
  const f = mk(c.width, c.height), x = f.getContext('2d')!;
  x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, f.width, f.height);
  return cc._f = f;
}
/* stepped (pixel) ground shadow */
function shadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a?: number) {
  g.save(); g.fillStyle = 'rgba(6,2,12,' + (a == null ? .34 : a) + ')';
  for (let k = 0; k < 2; k++) {
    const rxx = rx * (k ? .62 : 1), ryy = ry * (k ? .55 : 1);
    for (let dy = -ryy; dy < ryy; dy += PX) {
      const yy = (dy + PX / 2) / ryy, hw = Math.round(rxx * Math.sqrt(Math.max(0, 1 - yy * yy)) / PX) * PX;
      if (hw > 0) g.fillRect(x - hw, y + dy, hw * 2, PX);
    }
  }
  g.restore();
}
/* stepped glow: stacked discs */
function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: any, a: number, n?: number) {
  const c = hx(okc(col)); n = n || 4;
  g.save();
  for (let i = n; i > 0; i--) { g.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a / n) + ')'; g.beginPath(); g.arc(x, y, r * i / n, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
/* tiny bresenham */
function bres(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { fn(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}

/* ───────────── HEROES ───────────── */
const AR: any = {
  Warrior: { head: 'helm', body: 'armor', cape: 1, ex: 'pauldron', weapon: 'sword' },
  Ranger: { head: 'hood', body: 'leather', cape: 0, ex: 'quiver', weapon: 'bow' },
  Mage: { head: 'hat', body: 'robe', cape: 0, ex: '', weapon: 'staff' },
  Rogue: { head: 'cowl', body: 'leather', cape: 0, ex: 'scarf', weapon: 'dagger2' },
  Necromancer: { head: 'skull', body: 'robe', cape: 0, ex: '', weapon: 'skullstaff', dim: .42 },
  Healer: { head: 'halo', body: 'robe', cape: 0, ex: '', weapon: 'staff', light: 1 },
  Summoner: { head: 'horns', body: 'robe', cape: 1, ex: '', weapon: 'staff' },
  Druid: { head: 'antler', body: 'leather', cape: 0, ex: 'mantle', weapon: 'staff' },
  Demon: { head: 'horns', body: 'armor', cape: 0, ex: 'tail spikes', weapon: 'greatsword', skin: '#b8506a' }
};
const OV: any = {
  ironclad: { head: 'full', shield: 1, weapon: 'mace', metal: '#aab0cc' },
  berserker: { head: 'band', body: 'bare', cape: 0, ex: '', weapon: 'axe', skin: '#d8a080' },
  bladedancer: { head: 'band', body: 'leather', cape: 0, ex: 'scarf', weapon: 'dual' },
  warlord: { head: 'crownhelm', weapon: 'sword' },
  gladiator: { head: 'crest', weapon: 'spear', metal: '#a8743c', cape: 0 },
  samurai: { head: 'kabuto', cape: 0, weapon: 'katana', metal: '#7a3a2a' },
  juggernaut: { head: 'full', weapon: 'hammer', metal: '#8a7070', cape: 0, ex: 'pauldron spikes' },
  pitfighter: { head: 'band', body: 'bare', cape: 0, ex: '', weapon: 'fists', skin: '#d8a080' },
  sharpshooter: { weapon: 'bow' }, beastmaster: { head: 'hood', weapon: 'bow', ex: 'quiver mantle' },
  trapper: { head: 'tricorn', weapon: 'bow' }, windarcher: { weapon: 'bow', ex: 'quiver scarf' },
  crossbowman: { head: 'kettle', weapon: 'crossbow', ex: 'pauldron' }, musketeer: { head: 'tricorn', weapon: 'musket', ex: '', cape: 1 },
  sniper: { head: 'hood', weapon: 'rifle', ex: 'goggles' }, pathfinder: { head: 'hood', weapon: 'bow', ex: 'quiver' },
  pyromancer: { weapon: 'staff' }, cryomancer: { weapon: 'staff' }, stormcaller: { weapon: 'staff' },
  arcanist: { beard: 1 }, chronomancer: { beard: 1, weapon: 'staff' },
  spellblade: { head: 'helm', body: 'armor', weapon: 'sword', ex: 'pauldron', cape: 1 },
  illusionist: { weapon: 'orb' }, geomancer: { body: 'leather', weapon: 'staff', ex: 'mantle' },
  assassin: { weapon: 'dagger2' }, thief: { weapon: 'dagger2' }, trickster: { head: 'jester', weapon: 'dagger2' },
  ninja: { head: 'ninja', weapon: 'katana', ex: 'scarf' }, poisoner: { head: 'cowl', weapon: 'dagger2' },
  swashbuckler: { head: 'tricorn', weapon: 'rapier', cape: 1, ex: '' }, phantom: { weapon: 'dagger2', ghost: 1 },
  blademaster: { head: 'kabuto', weapon: 'katana', ex: '', metal: '#8a7a60' },
  bonelord: { head: 'skullcrown', weapon: 'scythe' }, lich: { head: 'skullcrown', weapon: 'skullstaff', cape: 1 },
  deathknight: { head: 'horned', body: 'armor', cape: 1, ex: 'pauldron spikes', weapon: 'greatsword', metal: '#4a4a62' },
  plaguedoctor: { head: 'beak', weapon: 'lantern' }, bloodmage: { head: 'hood', weapon: 'orb' },
  wraithcaller: { head: 'skull', weapon: 'skullstaff', ghost: 1 }, corpseweaver: { head: 'hood', weapon: 'orb' },
  revenant: { head: 'helmskull', body: 'armor', cape: 1, weapon: 'sword', ex: 'pauldron', metal: '#6a5a5a' },
  cleric: { weapon: 'staff' }, paladin: { head: 'helm', body: 'armor', shield: 1, weapon: 'mace', ex: 'pauldron', metal: '#d8d0b0', light: 0, halo: 1 },
  shaman: { head: 'antler', body: 'leather', weapon: 'staff', ex: 'mantle' },
  monk: { head: 'band', body: 'bare', weapon: 'fists', light: 0, skin: '#d8a880' },
  oracle: { head: 'hood', weapon: 'orb' }, lightbringer: { weapon: 'staff' }, bishop: { head: 'mitre', beard: 1 },
  medic: { head: 'medic', weapon: 'staff' },
  demonologist: { weapon: 'staff', body: 'robe', skin: '#b8506a' }, elemsummoner: { head: 'hood', weapon: 'orb' },
  golemancer: { head: 'hat', skin: '#a89886', weapon: 'staff' }, spiderqueen: { head: 'crown', ex: 'arachno', weapon: 'staff' },
  dragonknight: { head: 'horned', body: 'armor', cape: 1, weapon: 'spear', ex: 'pauldron', metal: '#a84a3a' },
  falconmaster: { head: 'hood', weapon: 'bow', ex: 'falcon' }, spiritcaller: { head: 'hood', weapon: 'orb', ghost: 1 },
  shapeshifter: { head: 'antler', weapon: 'claws' }, werewolf: { head: 'wolf', body: 'bare', skin: '#8a6a4a', weapon: 'claws', ex: '' },
  naturewarden: { weapon: 'staff' }, treant: { head: 'leafy', body: 'bark', skin: '#7a5a38', weapon: 'club', ex: '' },
  stormdruid: { head: 'hood', weapon: 'staff' }, moondruid: { head: 'hood', weapon: 'staff' },
  rootweaver: { head: 'leafy', weapon: 'staff' }, archdruid: { head: 'antler', beard: 1, weapon: 'staff' },
  demonhunter: { head: 'hood', body: 'leather', weapon: 'crossbow', ex: 'quiver', skin: '#d8b896', cape: 1 },
  warlockdemon: { head: 'horns', body: 'robe', weapon: 'staff', skin: '#7a8a4a' },
  blooddemon: { head: 'horns', weapon: 'axe', skin: '#c0403a' },
  infernal: { head: 'horns', weapon: 'hammer', skin: '#d05a2a', ex: 'tail spikes' },
  voidwalker: { head: 'horns', body: 'robe', weapon: 'orb', skin: '#5a4a8a', ghost: 1 },
  shadowfiend: { head: 'horns', body: 'robe', weapon: 'orb', skin: '#4a4a6a', ghost: 1 },
  demonlord: { head: 'horns', weapon: 'greatsword', cape: 1, skin: '#a83030', ex: 'tail spikes pauldron' },
  chaosfiend: { head: 'horns', body: 'robe', weapon: 'staff', skin: '#8a4a9a' }
};
const SPEC_CACHE: any = {};
function specFor(key: string) {
  if (SPEC_CACHE[key]) return SPEC_CACHE[key];
  const C = (CLASSES as any)[key] || { color: '#c0392b', accent: '#c8a040', roleTag: 'Warrior', basic: 'melee' };
  const s = Object.assign({ metal: '#9a9ab8', skin: '#e2b896' }, AR[C.roleTag] || AR.Warrior, OV[key] || {});
  s.c = okc(C.color); s.a = okc(C.accent); s.key = key;
  s.ex = ' ' + (s.ex || '') + ' ';
  return SPEC_CACHE[key] = s;
}

function paintHero(P: (x: number, y: number, w: number, h: number, c: any) => void, s: any, f: number) {
  const idle = f < 2, wf = idle ? 0 : f - 2, bdy = (idle && f === 1) ? 1 : 0;
  let c = s.c, a = s.a;
  if (s.light) c = mx(c, '#f2ecd8', .55);
  if (s.dim) c = dk(c, s.dim);
  const c1 = lt(c, .3), c2 = dk(c, .3), c3 = dk(c, .58), a2 = dk(a, .35), al = lt(a, .45);
  const skin = s.skin, skinD = dk(skin, .24), skinL = lt(skin, .18);
  const metal = s.metal, mL = lt(metal, .42), mD = dk(metal, .4);
  const lea = '#6a4a30', leaD = '#3a2418';
  const has = (k: string) => s.ex.indexOf(' ' + k + ' ') >= 0;
  const blk = (x: number, y: number, w: number, h: number, b: any) => { P(x, y, w, h, b); if (w >= 3) { P(x, y, 2, h, lt(b, .2)); P(x + w - 2, y, 2, h, dk(b, .28)); } else P(x + w - 1, y, 1, h, dk(b, .28)); };
  const robe = s.body === 'robe', bare = s.body === 'bare', bark = s.body === 'bark', arm = s.body === 'armor';
  const pants = robe ? c2 : (arm ? mD : (bare ? dk(c, .45) : c3));
  const boot = arm ? mD : leaD;
  const bl = [0, -2, 0, 2][wf], fl = [0, 2, 0, -2][wf];
  const bUp = (wf === 1) ? 1 : 0, fUp = (wf === 3) ? 1 : 0;      /* the trailing leg lifts */

  /* ── things behind the body ── */
  if (s.cape) {
    const ph = f * 1.1;
    for (let i = 0; i < 12; i++) {
      const cx = 11 - i, w = Math.sin(ph + i * .55) * 1.6 * (i / 12 + .3) + (wf ? Math.sin(i * .4) * .8 : 0), top = Math.round(14 + bdy + i * .22 + w * .3), bot = Math.round(23 + bdy - i * .35 + w);
      P(cx, top, 1, bot - top, i % 5 < 3 ? c : c2); P(cx, top, 1, 1, c1); if (i > 8) P(cx, bot - 1, 1, 1, c3);
    }
  }
  if (has('arachno')) {
    const lg = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => { bres(x0, y0, x1, y1, (x, y) => P(x, y, 1, 1, c3)); bres(x1, y1, x2, y2, (x, y) => P(x, y, 1, 1, c3)); P(x1, y1, 1, 1, a); };
    lg(11, 16, 5, 9, 2, 13); lg(11, 17, 4, 15, 1, 20); lg(11, 18, 5, 21, 3, 26);
  }
  if (has('tail')) { bres(12, 21, 8, 22, (x, y) => P(x, y, 1, 1, skinD)); bres(8, 22, 5, 19, (x, y) => P(x, y, 1, 1, skinD)); P(3, 17, 3, 3, a); P(4, 16, 1, 1, al); }
  if (has('scarf')) { const w = [0, 1, 0, -1][f & 3]; P(10, 13 + bdy, 3, 2, a); for (let i = 0; i < 7; i++) P(9 - i, 13 + bdy + Math.round(Math.sin(f * .9 + i * .7) * 1.3 + i * .1), 1, 2, i % 2 ? a2 : a); }
  if (has('quiver')) { P(10, 12 + bdy, 3, 8, lea); P(10, 12 + bdy, 1, 8, leaD); P(10, 11 + bdy, 1, 1, '#ddd'); P(12, 10 + bdy, 1, 2, a); P(11, 9 + bdy, 1, 3, a2); P(10, 10 + bdy, 1, 1, al); }
  if (has('falcon')) { P(9, 8 + bdy, 4, 3, '#7a5a3a'); P(8, 8 + bdy, 1, 1, '#3a2a1a'); P(12, 7 + bdy, 2, 2, '#7a5a3a'); P(14, 8 + bdy, 1, 1, '#e8c050'); P(10, 10 + bdy, 2, 1, '#e8dcc0'); }

  /* ── legs ── */
  if (!robe) {
    const leg = (x: number, up: number, dx: number) => { const lx = x + dx; P(lx, 21, 3, 4 - up, pants); P(lx, 21, 1, 4 - up, lt(pants, .15)); P(lx, 25 - up, 4, 2, boot); P(lx, 25 - up, 4, 1, lt(boot, .2)); };
    leg(12, bUp, bl); leg(16, fUp, fl);
    P(13 + bl, 21, 2, 1, dk(pants, .3));
  } else {
    const sw = wf ? (wf === 1 ? 1 : wf === 3 ? -1 : 0) : 0;
    P(13 + sw, 25, 3, 2, leaD); P(17 - sw, 25, 4, 2, leaD);
  }
  /* ── back arm ── */
  const bax = 11 + (wf === 1 ? 1 : wf === 3 ? -1 : 0);
  P(bax, 14 + bdy, 2, 5, robe ? c2 : (bare ? skinD : (arm ? c2 : c3))); P(bax, 19 + bdy, 2, 1, bare ? skinD : skinD);

  /* ── torso ── */
  const ty = 13 + bdy;
  if (robe) {
    blk(12, ty, 7, 7, c);
    for (let y = 0; y < 5; y++) { const w = 7 + Math.floor(y * .8 + .6); P(12 - Math.floor((w - 7) / 2), 20 + bdy + y, w, 1, y % 2 ? c : c2); P(12 - Math.floor((w - 7) / 2), 20 + bdy + y, 1, 1, c1); }
    P(11, 24 + bdy - bdy, 9, 1, a); P(11, 24, 9, 1, a);
    P(12, 19 + bdy, 7, 1, a); P(15, 19 + bdy, 1, 3, a2);  /* sash */
    if (s.light) { P(15, 13 + bdy, 1, 7, a); } else { P(14, 13 + bdy, 3, 1, c1); }
  } else if (bare) {
    P(12, ty, 7, 6, skin); P(12, ty, 2, 6, skinL); P(17, ty, 2, 6, skinD); P(15, ty + 1, 1, 3, skinD); P(13, ty + 2, 2, 1, skinD); P(16, ty + 3, 2, 1, skinD);
    P(12, 18 + bdy, 7, 2, c); P(12, 18 + bdy, 7, 1, lt(c, .2)); P(12, 20, 7, 1, c2); P(15, 19 + bdy, 2, 2, a);
    P(11, 13 + bdy, 2, 1, a); P(17, 13 + bdy, 2, 1, a);
    P(12, 14 + bdy, 1, 5, c2);
  } else if (bark) {
    blk(12, ty, 7, 8, s.skin); P(13, ty + 1, 1, 3, dk(s.skin, .4)); P(16, ty + 3, 1, 4, dk(s.skin, .4)); P(14, ty + 5, 2, 1, '#4a8a3a'); P(17, ty, 2, 1, '#4a8a3a'); P(12, ty + 6, 2, 1, '#4a8a3a');
  } else if (arm) {
    blk(12, ty, 7, 8, c);
    P(12, ty, 7, 2, metal); P(12, ty, 7, 1, mL); P(12, ty + 1, 7, 1, mD);
    P(13, ty + 3, 5, 1, lt(c, .25)); P(15, ty + 2, 1, 5, a);
    P(12, 19 + bdy, 7, 1, lea); P(15, 19 + bdy, 2, 1, a);
    P(12, 20 + bdy, 7, 1, c2);
  } else { /* leather */
    blk(12, ty, 7, 7, c);
    bres(12, ty, 18, ty + 6, (x, y) => P(x, y, 1, 1, a));
    P(12, 19 + bdy, 7, 1, lea); P(15, 19 + bdy, 2, 1, a); P(12, 20 + bdy, 7, 1, c2);
    P(12, ty, 7, 1, lt(c, .3));
  }
  if (s.shield) {
    P(9, 14 + bdy, 6, 8, metal); P(9, 14 + bdy, 6, 1, mL); P(9, 14 + bdy, 1, 8, mL); P(14, 14 + bdy, 1, 8, mD); P(9, 21 + bdy, 6, 1, mD);
    P(10, 15 + bdy, 4, 6, c); P(11, 16 + bdy, 2, 4, a); P(11, 17 + bdy, 2, 1, al);
  }
  if (has('mantle')) { P(11, 13 + bdy, 9, 2, '#6a5238'); P(11, 13 + bdy, 9, 1, '#9a8058'); for (let i = 0; i < 5; i++) P(11 + i * 2, 15 + bdy, 1, 1, '#6a5238'); }

  /* ── head ── */
  const hy = 6 + bdy;
  const eyes = (x1: number, x2: number, y: number, col?: any) => { P(x1, y, 1, 1, col || '#1a1020'); P(x2, y, 1, 1, col || '#1a1020'); if (!col) { P(x1, y - 1, 1, 1, skinD); P(x2, y - 1, 1, 1, skinD); } };
  const face = () => { P(13, hy, 6, 7, skin); P(12, hy + 1, 1, 6, skinD); P(13, hy, 5, 1, skinD); P(14, hy + 6, 5, 1, skinD); P(18, hy + 1, 1, 5, skinD); P(13, hy + 1, 1, 5, skinL); };
  const H = s.head;
  /* neck */
  P(14, 12 + bdy, 3, 1, skinD);
  if (H === 'helm' || H === 'full' || H === 'crownhelm' || H === 'crest' || H === 'kettle' || H === 'helmskull' || H === 'horned' || H === 'kabuto') {
    face();
    P(11, hy - 2, 9, 4, metal); P(11, hy - 2, 9, 1, mL); P(11, hy + 1, 9, 1, mD); P(11, hy - 1, 3, 7, metal); P(11, hy - 1, 1, 7, mL); P(13, hy + 2, 1, 5, mD);
    if (H === 'full' || H === 'horned' || H === 'helmskull') {
      P(14, hy + 1, 5, 6, metal); P(14, hy + 1, 5, 1, mL); P(18, hy + 1, 1, 6, mD); P(15, hy + 3, 4, 1, '#0a0612');
      P(16, hy + 3, 1, 1, a); P(18, hy + 3, 1, 1, a); P(15, hy + 5, 3, 1, mD); P(15, hy + 6, 3, 1, mD);
      if (H === 'helmskull') { P(15, hy + 2, 4, 1, '#cfc7ae'); P(15, hy + 4, 3, 2, '#cfc7ae'); P(15, hy + 5, 1, 1, '#0a0612'); P(17, hy + 5, 1, 1, '#0a0612'); }
    } else {
      P(18, hy + 1, 1, 3, mL); P(18, hy + 4, 1, 1, mD); eyes(15, 17, hy + 3); P(15, hy + 3, 1, 1, a); P(17, hy + 3, 1, 1, a);
      P(16, hy + 5, 2, 1, skinD);
    }
    if (H === 'crownhelm') { for (let i = 0; i < 4; i++) P(12 + i * 2, hy - 3, 1, 2, '#e0c050'); P(12, hy - 2, 7, 1, '#c8a030'); P(15, hy - 3, 1, 1, a); }
    if (H === 'crest') { P(12, hy - 4, 7, 2, c); P(12, hy - 4, 7, 1, c1); P(11, hy - 3, 1, 2, c2); P(19, hy - 3, 1, 2, c2); P(13, hy - 5, 5, 1, c1); }
    if (H === 'kettle') { P(10, hy - 1, 11, 1, mD); P(10, hy - 1, 11, 1, metal); P(10, hy, 11, 1, mD); P(12, hy - 3, 7, 1, mL); }
    if (H === 'horned') {
      P(11, hy - 3, 1, 2, '#d8d0b8'); P(10, hy - 4, 1, 2, '#d8d0b8'); P(9, hy - 5, 1, 2, '#d8d0b8'); P(8, hy - 5, 1, 1, '#fff');
      P(19, hy - 3, 1, 2, '#d8d0b8'); P(20, hy - 4, 1, 2, '#d8d0b8'); P(21, hy - 5, 1, 2, '#d8d0b8');
    }
    if (H === 'kabuto') {
      P(10, hy + 1, 3, 6, a); P(10, hy + 1, 3, 1, lt(a, .3)); P(10, hy + 3, 3, 1, dk(a, .3)); P(10, hy + 5, 3, 1, dk(a, .3));
      bres(12, hy - 2, 10, hy - 6, (x, y) => P(x, y, 1, 1, '#e0c050')); bres(18, hy - 2, 20, hy - 6, (x, y) => P(x, y, 1, 1, '#e0c050'));
      P(15, hy - 3, 1, 1, '#e0c050');
    }
    if (H === 'helm' && !s.noPlume) {
      const pw = Math.sin(f * 1.2);
      P(12, hy - 3, 3, 1, c); P(11, hy - 3, 1, 1, c1); P(9, hy - 2, 3, 1, c); P(7, hy - 1 + (pw > 0 ? 0 : 1), 3, 1, c2); P(6, hy + (pw > 0 ? 0 : 1), 2, 1, c2); P(10, hy - 3, 1, 1, c1);
    }
    if (s.halo) { P(13, hy - 5, 5, 1, al); P(12, hy - 4, 1, 1, al); P(18, hy - 4, 1, 1, al); P(13, hy - 3, 5, 1, a); }
  } else if (H === 'hood' || H === 'cowl' || H === 'ninja' || H === 'jester') {
    face();
    const hd = H === 'cowl' || H === 'ninja' ? c3 : c2;
    P(11, hy - 2, 9, 5, hd); P(11, hy - 2, 9, 1, lt(hd, .25)); P(11, hy - 2, 2, 10, hd); P(10, hy, 2, 9, dk(hd, .25)); P(10, hy + 1, 1, 7, dk(hd, .45));
    P(19, hy, 1, 2, hd); P(18, hy + 2, 1, 2, hd);
    if (H === 'hood') { P(14, hy + 1, 5, 2, dk(skin, .55)); eyes(15, 17, hy + 3, a); }
    else {
      P(14, hy + 1, 5, 2, hd);
      P(13, hy + 5, 6, 2, hd); P(14, hy + 2, 5, 3, dk(skin, .5));
      P(15, hy + 3, 1, 1, '#fff'); P(17, hy + 3, 1, 1, '#fff'); P(15, hy + 3, 1, 1, a); P(17, hy + 3, 1, 1, a);
      P(18, hy + 4, 1, 3, hd);
      if (H === 'ninja') { P(12, hy + 1, 7, 1, a); P(10, hy + 1, 2, 1, a); P(8, hy + 2 + (f & 1), 2, 1, a2); P(6, hy + 3 + (f & 1), 2, 1, a2); }
      if (H === 'jester') { P(10, hy - 3, 3, 2, a); P(8, hy - 4, 2, 2, c); P(18, hy - 3, 3, 2, c); P(20, hy - 4, 2, 2, a); P(9, hy - 5, 1, 1, '#fc0'); P(22, hy - 4, 1, 1, '#fc0'); }
    }
    if (H === 'cowl') { P(13, hy + 4, 6, 3, hd); }
    if (has('goggles')) { P(14, hy + 2, 5, 2, '#2a2a30'); P(15, hy + 2, 1, 1, '#7fd4ff'); P(17, hy + 2, 1, 1, '#7fd4ff'); P(13, hy + 2, 1, 1, '#2a2a30'); }
  } else if (H === 'hat' || H === 'mitre' || H === 'medic') {
    face();
    if (H === 'hat') {
      P(10, hy - 1, 10, 2, c2); P(10, hy - 1, 10, 1, c); P(11, hy, 8, 1, dk(c, .5));
      const rows = [[12, 7], [12, 6], [12, 5], [11, 5], [10, 4], [9, 3]];
      rows.forEach((r: number[], i: number) => { const yy = hy - 2 - i; P(r[0], yy, r[1], 1, i % 2 ? c : c2); P(r[0], yy, 1, 1, c1); });
      P(12, hy - 2, 7, 1, a); P(7, hy - 8, 2, 1, c); P(6, hy - 8, 1, 1, a);
      P(14, hy + 2, 2, 1, skinD); eyes(15, 17, hy + 3, a);
    } else if (H === 'mitre') {
      P(12, hy - 1, 7, 2, '#f0e8d0'); P(13, hy - 3, 5, 2, '#f0e8d0'); P(14, hy - 5, 3, 2, '#f0e8d0'); P(15, hy - 6, 1, 1, '#f0e8d0');
      P(12, hy, 7, 1, a); P(15, hy - 5, 1, 4, a); P(14, hy - 3, 3, 1, a);
      eyes(15, 17, hy + 3);
    } else {
      P(12, hy - 1, 8, 3, '#f4f4f4'); P(12, hy - 2, 7, 1, '#ffffff'); P(11, hy, 1, 6, '#e8e8e8');
      P(15, hy - 2, 1, 3, '#d83030'); P(14, hy - 1, 3, 1, '#d83030');
      eyes(15, 17, hy + 3);
    }
    P(12, hy + 1, 2, 6, s.hair || '#7a5a3a'); if (H === 'mitre' || s.beard) P(14, hy + 4, 5, 3, '#e8e4dc');
  } else if (H === 'skull' || H === 'skullcrown') {
    P(11, hy - 2, 9, 5, c3); P(11, hy - 2, 9, 1, lt(c3, .2)); P(11, hy - 2, 2, 10, c3); P(10, hy, 2, 9, dk(c3, .3)); P(10, hy + 1, 1, 7, dk(c3, .5));
    P(13, hy + 1, 6, 6, '#e4dcc4'); P(13, hy + 1, 1, 6, '#f4eed8'); P(18, hy + 1, 1, 6, '#b8b098'); P(14, hy + 6, 5, 1, '#b8b098');
    P(14, hy + 3, 2, 2, '#0a0612'); P(17, hy + 3, 2, 2, '#0a0612'); P(14, hy + 4, 1, 1, a); P(17, hy + 4, 1, 1, a); P(16, hy + 5, 1, 1, '#8a826a');
    P(14, hy + 6, 1, 1, '#0a0612'); P(16, hy + 6, 1, 1, '#0a0612'); P(18, hy + 6, 1, 1, '#0a0612');
    if (H === 'skullcrown') { for (let i = 0; i < 4; i++) P(12 + i * 2, hy - 3, 1, 2, '#d8b840'); P(12, hy - 2, 7, 1, '#c8a030'); P(15, hy - 3, 1, 1, a); }
  } else if (H === 'horns' || H === 'crown' || H === 'antler' || H === 'leafy' || H === 'halo' || H === 'band' || H === 'tricorn' || H === 'wolf' || H === 'beak') {
    if (H === 'wolf') {
      const fur = s.skin, fL = lt(fur, .2), fD = dk(fur, .3);
      P(12, hy, 7, 6, fur); P(12, hy, 2, 6, fL); P(17, hy + 1, 3, 4, fL); P(19, hy + 3, 3, 3, fL); P(21, hy + 3, 1, 1, '#0a0612'); P(19, hy + 5, 3, 1, fD);
      P(12, hy - 2, 2, 3, fur); P(15, hy - 2, 2, 3, fur); P(12, hy - 2, 1, 2, fL); P(13, hy - 1, 1, 1, '#c88a8a');
      P(16, hy + 2, 2, 1, '#ffe060'); P(17, hy + 2, 1, 1, '#fff'); P(12, hy + 6, 6, 1, fD); P(19, hy + 5, 1, 1, '#fff'); P(21, hy + 5, 1, 1, '#fff');
    } else if (H === 'beak') {
      face();
      P(11, hy - 3, 9, 1, '#1a1620'); P(12, hy - 7, 7, 4, '#2a2430'); P(12, hy - 7, 1, 4, '#4a4458'); P(12, hy - 4, 7, 1, a);
      P(10, hy - 2, 11, 1, '#1a1620'); P(11, hy - 1, 9, 1, '#3a3444');
      P(13, hy, 6, 6, '#c8b890'); P(13, hy, 1, 6, '#e0d4b0'); P(14, hy + 1, 3, 3, '#1a1a20'); P(15, hy + 2, 1, 1, a); P(16, hy + 2, 1, 1, al);
      P(18, hy + 2, 4, 2, '#c8b890'); P(20, hy + 3, 3, 1, '#b0a078'); P(22, hy + 4, 1, 1, '#9a8c68'); P(18, hy + 4, 3, 1, '#a89a78');
      P(11, hy, 2, 6, '#3a3444');
    } else {
      face();
      let hair = s.hair || (H === 'band' ? '#2a1a14' : (H === 'antler' || H === 'leafy') ? '#5a3a24' : '#3a2418');
      if (H === 'horns' && s.skin.toLowerCase() !== '#e2b896') hair = '#14081c';
      P(12, hy - 1, 8, 3, hair); P(12, hy - 2, 6, 1, hair); P(11, hy, 2, 6, dk(hair, .1)); P(12, hy + 1, 2, 1, hair);
      P(14, hy + 1, 5, 1, hair); P(18, hy + 1, 1, 1, hair);
      eyes(15, 17, hy + 3, (H === 'horns' || H === 'band') ? (H === 'horns' ? al : null) : null);
      if (H === 'horns') { P(15, hy + 3, 1, 1, al); P(17, hy + 3, 1, 1, al); }
      if (s.beard) P(14, hy + 4, 5, 3, '#e8e4dc');
      if (H === 'halo') { P(13, hy - 5, 5, 1, al); P(12, hy - 4, 1, 1, al); P(18, hy - 4, 1, 1, al); P(13, hy - 3, 5, 1, a); P(12, hy - 2, 1, 1, hair); }
      if (H === 'horns') {
        const hc = s.skin.toLowerCase() === '#e2b896' ? '#d8d0b8' : '#2a1a28';
        P(13, hy - 2, 1, 1, hc); P(12, hy - 3, 1, 1, hc); P(11, hy - 4, 1, 1, hc); P(11, hy - 5, 1, 1, lt(hc, .35));
        P(17, hy - 2, 1, 1, hc); P(18, hy - 3, 1, 1, hc); P(19, hy - 4, 1, 1, hc); P(20, hy - 5, 1, 1, lt(hc, .35)); P(19, hy - 5, 1, 1, hc);
        if (s.key === 'infernal') { P(11, hy - 6, 1, 1, '#ffcc40'); P(20, hy - 6, 1, 1, '#ffcc40'); P(15, hy - 3, 1, 2, '#ff8a20'); P(16, hy - 4, 1, 1, '#ffd040'); }
      }
      if (H === 'crown') { for (let i = 0; i < 4; i++) P(12 + i * 2, hy - 3, 1, 2, '#d8b840'); P(12, hy - 2, 7, 1, '#c8a030'); P(15, hy - 3, 1, 1, a); }
      if (H === 'antler' || H === 'leafy') {
        if (H === 'antler') {
          const ac = '#cdb888';
          bres(13, hy - 1, 11, hy - 5, (x, y) => P(x, y, 1, 1, ac)); P(13, hy - 3, 1, 1, ac); P(12, hy - 4, 1, 1, ac); P(10, hy - 6, 1, 1, lt(ac, .3));
          bres(17, hy - 1, 19, hy - 5, (x, y) => P(x, y, 1, 1, ac)); P(18, hy - 4, 2, 1, ac); P(20, hy - 6, 1, 1, lt(ac, .3)); P(17, hy - 3, 1, 1, ac);
        } else {
          for (let i = 0; i < 5; i++) { P(12 + i * 2, hy - 3 + (i % 2), 2, 2, i % 2 ? '#4a8a3a' : '#6aaa4a'); } P(13, hy - 4, 2, 1, '#8aca5a'); P(17, hy - 4, 2, 1, '#8aca5a'); P(15, hy - 2, 1, 1, '#c84a6a');
        }
      }
      if (H === 'band') { P(12, hy, 8, 1, a); P(10, hy + 1, 2, 1, a); P(8, hy + 2 + (f & 1), 2, 1, a2); P(6, hy + 3 + (f & 1), 2, 1, a2); P(12, hy - 3, 1, 2, hair); P(14, hy - 3, 1, 2, hair); P(17, hy - 3, 1, 2, hair); P(16, hy - 2, 1, 1, hair); P(19, hy - 2, 1, 1, hair); }
      if (H === 'tricorn') {
        P(9, hy - 1, 12, 1, dk(c, .6)); P(10, hy - 2, 10, 1, c3); P(12, hy - 4, 6, 2, c2); P(12, hy - 4, 6, 1, c); P(9, hy - 2, 2, 1, c3); P(19, hy - 2, 2, 1, c3); P(10, hy, 10, 1, dk(c, .7));
        P(12, hy - 3, 6, 1, a);
        bres(17, hy - 4, 21, hy - 8, (x, y) => P(x, y, 1, 1, al)); P(18, hy - 4, 1, 1, a); P(20, hy - 8, 1, 1, '#fff'); P(19, hy - 7, 1, 1, a); P(21, hy - 7, 1, 1, a2);
      }
    }
  } else { face(); P(12, hy - 1, 8, 3, '#3a2418'); eyes(15, 17, hy + 3); }

  /* ── front arm + hand ── */
  const fax = 18 + (wf === 1 ? -1 : wf === 3 ? 1 : 0);
  const sleeve = robe ? c : (bare ? skin : (arm ? c : c2));
  P(fax, 14 + bdy, 2, 5, sleeve); P(fax, 14 + bdy, 1, 5, lt(sleeve, .18));
  if (arm || has('pauldron')) { P(fax - 1, 13 + bdy, 4, 3, metal); P(fax - 1, 13 + bdy, 4, 1, mL); P(fax - 1, 15 + bdy, 4, 1, mD); if (has('spikes')) { P(fax, 11 + bdy, 1, 2, mL); P(fax + 2, 12 + bdy, 1, 1, mL); } }
  if (has('pauldron')) { P(10, 13 + bdy, 3, 3, metal); P(10, 13 + bdy, 3, 1, mL); P(10, 15 + bdy, 3, 1, mD); }
  P(fax, 19 + bdy, 2, 2, (arm && !bare) ? mD : (robe ? skin : skin));
  if (robe) { P(fax, 18 + bdy, 2, 1, a); }
  return { hx: fax + 1, hy: 19 + bdy };
}

const HERO_W = 30, HERO_H = 30, HFY = 27, HCX = 15;   /* raw grid, feet-bottom row, torso centre col */
const HCACHE = new Map();
function heroSprite(key: string, f: number) {
  const k = key + '|' + f; let h: any = (HCACHE as any).get(k); if (h) return h;
  const s = specFor(key);
  const raw = mk(HERO_W, HERO_H), g = raw.getContext('2d')!;
  const P = (x: number, y: number, w: number, hh: number, c: any) => { g.fillStyle = c; g.fillRect(x, y, w, hh); };
  const hand = paintHero(P, s, f);
  const sp = finish(raw, { thr: 128, rim: lt(s.a, .25), rimK: .5 });
  h = { c: sp, ax: HCX + 1, ay: HFY + 1, hx: hand.hx + 1, hy: hand.hy + 1, s };
  if ((HCACHE as any).size > 900) (HCACHE as any).clear();
  (HCACHE as any).set(k, h); return h;
}

/* ───────────── WEAPONS (drawn live so they track the aim angle) ───────────── */
function weapon(g: CanvasRenderingContext2D, ox: number, oy: number, ang: number, kind: string, s: any, t: number, sw: number, flip: boolean) {
  /* ox,oy = world px of the hand; all geometry in sprite pixels (PX) */
  const cells = new Map();
  const put = (x: number, y: number, c: any) => { cells.set(Math.round(x) + ',' + Math.round(y), c); };
  const ca = Math.cos(ang), sa = Math.sin(ang), px = -sa, py = ca;
  const rod = (a: number, b: number, w: number, c0: any, c1?: any) => { for (let i = a; i <= b; i += .5) { for (let j = 0; j < w; j++) { const o = j - (w - 1) / 2; put(ca * i + px * o, sa * i + py * o, (j === 0 && c1) ? c1 : c0); } } };
  const at = (i: number, o: number, c: any) => put(ca * i + px * o, sa * i + py * o, c);
  const blade = (a: number, b: number, w: number, edge: any, body: any) => { for (let i = a; i <= b; i += .5) { const ww = (i > b - 2) ? Math.max(1, w - 1) : w; for (let j = 0; j < ww; j++) { const o = j - (ww - 1) / 2; put(ca * i + px * o, sa * i + py * o, j === 0 ? edge : body); } } };
  const a = s.a, al = lt(a, .5), a2 = dk(a, .3), lea = '#6a4a30', gold = '#e0c050', steel = '#c8ccdc', steelD = '#7a7e94', wood = '#8a5e34', woodL = '#b08050';
  const sg = sw > 0 ? sw : 0;
  let glowAt: any = null;
  switch (kind) {
    case 'sword': blade(3, 13, 2, '#eef0ff', steel); rod(-2, 1, 1, lea); at(2, -2, gold); at(2, -1, gold); at(2, 0, gold); at(2, 1, gold); at(2, 2, gold); at(-3, 0, gold); if (sg > 0) for (let i = 4; i < 13; i += 2) at(i, 2, al); break;
    case 'greatsword': blade(3, 17, 3, '#e0e0f0', dk(steel, .25)); rod(-3, 1, 1, lea); for (let o = -3; o <= 3; o++) at(2, o, gold); at(-4, 0, gold); for (let i = 5; i < 16; i += 3) at(i, 0, a); if (sg > 0) for (let i = 4; i < 17; i += 2) at(i, 3, al); break;
    case 'katana': blade(4, 18, 1, '#ffffff', '#dfe6ff'); rod(-3, 3, 2, '#2a2230', '#4a3a50'); at(3, -1, gold); at(3, 0, gold); at(3, 1, gold); if (sg > 0) for (let i = 5; i < 18; i += 2) at(i, 2, al); break;
    case 'rapier': blade(3, 17, 1, '#ffffff', '#dfe6ff'); rod(-2, 2, 1, lea); for (let o = -3; o <= 3; o++) at(3, o * .8, gold); break;
    case 'dagger2': case 'dual': {
      const L = kind === 'dual' ? 10 : 7, spread = kind === 'dual' ? .34 : .5;
      for (const sgn of [-1, 1]) { const aa = ang + sgn * spread, c2 = Math.cos(aa), s2 = Math.sin(aa);
        for (let i = -1; i <= L; i += .5) { const col = i < 1 ? lea : (i < 2 ? gold : (i > L - 1 ? '#fff' : steel)); put(c2 * i, s2 * i, col); }
        put(c2 * 2 - s2 * 1, s2 * 2 + c2 * 1, gold); put(c2 * 2 + s2 * 1, s2 * 2 - c2 * 1, gold);
        if (s.key === 'poisoner' || s.key === 'assassin') put(c2 * (L - 2) + s2 * 1, s2 * (L - 2) - c2 * 1, '#8aff60');
      } break; }
    case 'axe': rod(-2, 12, 1, wood, woodL); for (let o = -3; o <= 3; o++) { const l = Math.abs(o) === 3 ? 1 : (Math.abs(o) === 2 ? 2 : 3); for (let i = 9; i < 9 + l + 1; i++) at(i, o, Math.abs(o) === 3 ? '#eef0ff' : steel); } at(12, 0, steelD); at(10, 0, steelD); if (sg > 0) for (let o = -4; o <= 4; o++) at(13, o, al); break;
    case 'hammer': rod(-3, 12, 2, wood, woodL); for (let o = -3; o <= 3; o++) for (let i = 11; i <= 15; i++) at(i, o, (o < -1) ? steel : steelD); for (let o = -3; o <= 3; o++) at(11, o, '#eef0ff'); at(13, 0, a); break;
    case 'mace': case 'club': { const hd = kind === 'club'; rod(-2, 9, 1, hd ? '#6a4a28' : wood, woodL); for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.abs(dx) + Math.abs(dy) <= 3) at(10 + dx, dy, hd ? '#7a5a34' : steel); if (!hd) { at(10, 0, a); at(13, 0, steelD); at(10, 3, steelD); at(10, -3, steelD); at(7, 0, steelD); at(10, 0, al); } else { at(10, 1, '#5a8a3a'); at(9, -1, '#5a8a3a'); } break; }
    case 'spear': rod(-4, 17, 1, wood, woodL); blade(17, 23, 2, '#fff', steel); at(16, -1, a); at(16, 1, a); at(15, 0, a2); break;
    case 'fists': for (const sgn of [-1, 1]) { const d = sg > 0 ? 7 : 2; for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) put(ca * d + px * sgn * 3 + dx, sa * d + py * sgn * 3 + dy, a); } if (sg > 0) { for (let i = 3; i < 10; i += 2) at(i, 0, al); } break;
    case 'claws': for (const o of [-2, 0, 2]) { for (let i = 1; i < (sg > 0 ? 9 : 6); i++) at(i, o * (1 + i * .05), i > 4 ? '#fff' : '#e8e8f0'); } break;
    case 'bow': case 'crossbow': {
      const cb = kind === 'crossbow', R = cb ? 5 : 8, cx0 = cb ? 5 : 3;
      for (let q = -1; q <= 1; q += .07) { const ba = q * (cb ? 1.25 : 1.1); const bx = Math.cos(ba) * R * 0.75 + cx0 - (cb ? 2 : 0), by = Math.sin(ba) * R; at(bx, by, cb ? '#6a4a28' : wood); }
      const tipA = cb ? 1.25 : 1.1, tx = Math.cos(tipA) * R * 0.75 + cx0 - (cb ? 2 : 0), ty = Math.sin(tipA) * R;
      const pull = sg > 0 ? 3 : (cb ? 0 : 1);
      bres(cx0 - (cb ? 2 : 0) - pull + (cb ? 0 : 0), 0, tx, ty, () => { });
      for (let q = 0; q <= 1; q += .08) { at(tx + (cx0 - pull - (cb ? 2 : 0) - tx) * q, ty * (1 - q), '#e8e0c0'); at(tx + (cx0 - pull - (cb ? 2 : 0) - tx) * q, -ty * (1 - q), '#e8e0c0'); }
      if (cb) { rod(-3, 9, 2, wood, woodL); at(10, 0, a); }
      for (let i = -1; i < (cb ? 12 : 13); i++) at(i - pull + 2, 0, i > (cb ? 9 : 10) ? '#fff' : (i < 1 ? al : '#b8a078'));
      at(cb ? 13 : 14, 0, '#fff'); if (!cb) { at(1 - pull, 1, a); at(1 - pull, -1, a); }
      break; }
    case 'musket': case 'rifle': { const L = kind === 'rifle' ? 22 : 17; rod(-5, 0, 2, wood, woodL); rod(0, L, 1, '#4a4a56', '#8a8a9c'); if (kind === 'rifle') { at(8, -2, '#7fd4ff'); at(9, -2, '#222'); at(7, -2, '#222'); } at(L + 1, 0, steelD); if (sg > 0) { at(L + 2, 0, '#fff3a0'); at(L + 3, 0, '#ffcf40'); at(L + 3, 1, '#ff8a20'); at(L + 3, -1, '#ff8a20'); at(L + 4, 0, '#ff8a20'); } break; }
    case 'staff': case 'skullstaff': case 'lantern': case 'scythe': {
      /* held upright, tilted slightly forward */
      const fw = flip ? -1 : 1, up = -Math.PI / 2 + (flip ? -.1 : .1), cu = Math.cos(up), su = Math.sin(up);
      const L = kind === 'scythe' ? 22 : 17, BX = 4 * fw;
      for (let k2 = 1; k2 <= 3; k2++) put(k2 * fw, 0, s.skin || '#e2b896');
      for (let i = -5; i <= L; i += .5) { put(BX + cu * i, su * i, wood); put(BX + cu * i - fw, su * i, woodL); }
      const tx = BX + cu * L, ty = su * L, pl = .6 + .4 * Math.sin(t * 5);
      if (kind === 'staff') {
        const ocol = s.a; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) put(tx + dx, ty - 1 + dy, ocol); put(tx - 1, ty - 2, '#fff'); put(tx + 1, ty + 1, dk(ocol, .3)); put(tx, ty - 3, gold); put(tx, ty + 1, gold); put(tx - 2, ty - 1, gold); put(tx + 2, ty - 1, gold);
        glowAt = [tx, ty - 1, ocol, .55 * pl + (sg > 0 ? .4 : 0), sg > 0 ? 10 : 7];
        if (s.key === 'cleric' || s.key === 'lightbringer' || s.key === 'bishop') { put(tx, ty - 4, '#fff'); put(tx, ty - 5, '#fff'); put(tx - 1, ty - 4, '#fff'); put(tx + 1, ty - 4, '#fff'); }
      } else if (kind === 'skullstaff') {
        for (let dx = -1; dx <= 1; dx++) for (let dy = -2; dy <= 0; dy++) put(tx + dx, ty - 1 + dy, '#e4dcc4'); put(tx, ty + 1, '#cfc7ae'); put(tx - 1, ty - 2, '#0a0612'); put(tx + 1, ty - 2, '#0a0612'); put(tx - 1, ty - 2, s.a); put(tx + 1, ty - 2, s.a);
        glowAt = [tx, ty - 2, s.a, .4 * pl + (sg > 0 ? .4 : 0), 9];
      } else if (kind === 'lantern') {
        for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 3; dy++) put(tx + dx + 2 * fw, ty + dy, (dx === 0 && dy > 0 && dy < 3) ? '#ffe9a0' : '#4a3a2a'); put(tx + 2 * fw, ty - 1, '#4a3a2a');
        glowAt = [tx + 2 * fw, ty + 2, '#ffcf60', .5 * pl + .15, 9];
      } else {
        for (let i = 0; i < 9; i++) { const q = i / 8 * 1.6; put(tx + fw * (Math.sin(q) * 8 + 1), ty + (1 - Math.cos(q)) * -2 + i * .4 - 3, i > 6 ? '#fff' : '#c8ccdc'); put(tx + fw * (Math.sin(q) * 8 + 1), ty + (1 - Math.cos(q)) * -2 + i * .4 - 2, steelD); }
        put(tx + fw, ty - 3, steelD); glowAt = [tx + 6 * fw, ty + 1, s.a, .25 * pl + (sg > 0 ? .3 : 0), 8];
      }
      break; }
    case 'orb': {
      const oa = t * 2.2, ox2 = ca * 7 + Math.cos(oa) * 1.2, oy2 = sa * 7 - 5 + Math.sin(oa * 1.3) * 2.2, pl = .6 + .4 * Math.sin(t * 5);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (dx * dx + dy * dy <= 5) put(ox2 + dx, oy2 + dy, (dx < 0 && dy < 0) ? lt(s.a, .55) : ((dx > 0 && dy > 0) ? dk(s.a, .35) : s.a));
      put(ox2 - 1, oy2 - 1, '#fff'); glowAt = [ox2, oy2, s.a, .5 * pl + (sg > 0 ? .4 : 0), 9]; break; }
  }
  /* outline pass then fill */
  g.save();
  g.fillStyle = OUT;
  cells.forEach((c, k) => { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (!cells.has((x + dx) + ',' + (y + dy))) g.fillRect(ox + (x + dx) * PX, oy + (y + dy) * PX, PX, PX); } });
  cells.forEach((c, k) => { const [x, y] = k.split(',').map(Number); g.fillStyle = c; g.fillRect(ox + x * PX, oy + y * PX, PX, PX); });
  g.restore();
  if (glowAt) { g.save(); g.globalCompositeOperation = 'lighter'; glow(g, ox + glowAt[0] * PX, oy + glowAt[1] * PX, glowAt[4] * PX, glowAt[2], glowAt[3], 4); g.restore(); }
}

let heroLastHand = { x: 0, y: 0 };
export function getLastHand() { return heroLastHand; }

/* draw one hero at world (x,y) [y = old body centre; feet land at y+19]
   o:{face:angle,moving,phase,t,swing:0..1,alpha,flash,noWeapon} */
export function hero(g: CanvasRenderingContext2D, key: string, x: number, y: number, o?: any) {
  o = o || {};
  const t = o.t || 0, fa = o.face || 0, flip = Math.cos(fa) < -0.05 ? -1 : (Math.cos(fa) > 0.05 ? 1 : (o._fl || 1));
  o._fl = flip;
  const fr = o.moving ? 2 + ((Math.floor(o.phase || 0)) & 3) : (Math.floor(t * 1.7) & 1);
  const h = heroSprite(key, fr), s = h.s;
  const fx = Math.round(x / PX) * PX, fy = Math.round((y + 19) / PX) * PX;
  const dx = fx - h.ax * PX * flip, dy = fy - h.ay * PX;
  const ang = fa, sw = o.swing || 0;
  /* weapon sweep for melee while swinging */
  let wa = ang;
  const melee = /^(sword|greatsword|katana|rapier|axe|hammer|mace|spear|dual|dagger2|club|claws|fists)$/.test(s.weapon);
  if (melee && sw > 0) wa = ang + (0.5 - sw) * (s.weapon === 'spear' || s.weapon === 'fists' || s.weapon === 'rapier' ? 0 : 2.6) * flip;
  const handX = fx + (h.hx - h.ax) * PX * flip, handY = fy + (h.hy - h.ay) * PX;
  heroLastHand = { x: handX, y: handY };
  const behind = Math.sin(ang) < -0.35 && !/staff|orb|lantern|scythe|skullstaff/.test(s.weapon);
  g.save();
  if (o.alpha != null) g.globalAlpha = o.alpha;
  else if (s.ghost) g.globalAlpha = .78;
  g.imageSmoothingEnabled = false;
  if (behind && !o.noWeapon) weapon(g, handX, handY, wa, s.weapon, s, t, sw, flip < 0);
  g.save(); g.translate(fx, fy); g.scale(flip, 1);
  g.drawImage(h.c, -h.ax * PX, -h.ay * PX, h.c.width * PX, h.c.height * PX);
  if (o.flash > 0) { g.globalAlpha = Math.min(.75, o.flash); g.drawImage(flashOf(h.c), -h.ax * PX, -h.ay * PX, h.c.width * PX, h.c.height * PX); }
  g.restore();
  if (!behind && !o.noWeapon) weapon(g, handX, handY, wa, s.weapon, s, t, sw, flip < 0);
  g.restore();
  return h;
}

export { shadow, specFor };
