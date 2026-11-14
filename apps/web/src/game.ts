// @ts-nocheck — 1:1 port of the prototype main script (JS semantics kept; typed in a later pass).
import { setErrorContext, readErrors, clearErrors } from './telemetry';
import { RELIC_DEFS, relicMods, relicById, relicOptions, sanitizeRelics } from './relics';
import { BIOMES, ENEMY_TYPES, ENEMY_LORE, BOSS_TYPES, BOSS_TAUNTS, HAZ_DEF } from './world';
import { ATTR_DEFS, emptyUpg } from './upgrades';
import {
  COSMETIC_DEFS, cosmeticsOf, cosmeticById, ownsCosmetic, isEquipped,
  buyCosmetic, equipCosmetic, sanitizeCosmetics, emptyCosmetics,
  type CosmeticDef, type CosmeticKind, type CosmeticState,
} from './cosmetics';
import {
  INV_SIZE, SLOT_ORDER, SLOT_NAMES, SLOT_ICONS, BASES, RARITIES, PREFIX, AFFIX_DEFS,
  affixPool, affixCount, rollAffix, requiredLevel, isArmorSlot,
  type Slot, type AffixKey,
} from './items';
import {
  META_KEY as META_KEY_EXT, emptyMeta, sanitizeMeta, mergeMeta, soulsFromRun,
  SOUL_TRACKS as SOUL_TRACKS_EXT, ACHIEVEMENTS as ACHIEVEMENTS_EXT,
  newlyEarned, trackById, type MetaState,
} from './meta';
/* Sastra Dungeon — core game engine.
   Ported from the single-file prototype main script (lines 424-5136). Changed only:
   - export keywords for CLASSES / G / cutscene / startGame (consumed by intro.ts, music.ts)
   - startGame exposed on window for the intro-cinematic wrapper
   - save key renamed sastra_dungeon_save_v6 with one-time migration from the legacy key */
/* Error logging */
window.addEventListener('error', e => {
  console.error('❌ GAME ERROR:', e.message, '|', e.filename + ':' + e.lineno + ':' + e.colno);
});

import * as px from './pixel';
import * as hpix from './heropix';
import {PIXFAM,hasPx,drawPxSprite} from './pixelfam';
import {FXI,FX1,preloadFx} from './fxassets';
import {sfx, sfxSetVolume} from './sfx';
import {tr,applyLang,toggleLang} from './i18n';
import {
  auth,
  loginWithGoogle,
  logoutGoogle,
  onUserChange,
  syncSaveToCloud,
  loadSaveFromCloud,
  submitScoreToLeaderboard,
  subscribeLeaderboard,
  computeHeroScore,
  LeaderboardRecord
} from './firebase';
preloadFx();

export const TAU = Math.PI * 2;

/* ===== Seedable RNG (mulberry32) — a seed makes shop stock, upgrade offers,
   enemy mixes and item rolls identical across players (Daily Trial). When no
   seed is set, rng() is Math.random, so normal runs behave exactly as before. */
let _seed = 0, _seeded = false;
function mulberry32(a:number){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
let _rngImpl: () => number = Math.random;
const rng = () => _rngImpl();
function setSeed(s:number){_seed=s>>>0;_rngImpl=mulberry32(_seed);_seeded=true}
function clearSeed(){_seeded=false;_rngImpl=Math.random}


/* ═══════════ META PROGRESSION: souls, achievements, history, bestiary ═══════════ */
const META_KEY = META_KEY_EXT;
const META: any = emptyMeta();
const SOUL_TRACKS: any = SOUL_TRACKS_EXT;
const ACHIEVEMENTS: any = ACHIEVEMENTS_EXT;
function loadMeta(){
  let parsed: unknown = null;
  try{ parsed = JSON.parse(localStorage.getItem(META_KEY) || 'null'); }catch(e){ parsed = null; }
  Object.assign(META, sanitizeMeta(parsed));
}
function saveMeta(){ try{ localStorage.setItem(META_KEY, JSON.stringify(META)); }catch(e){} }
/* Merge a cloud meta blob into the local one. Lifetimes take the max, unlocks
   take the union, history is unioned and trimmed to ten newest. */
function applyCloudMeta(cloud){
  if(!cloud || typeof cloud!=='object') return false;
  const { next, changed } = mergeMeta(META as MetaState, cloud);
  Object.assign(META, next);
  saveMeta();
  return changed;
}

loadMeta();




/* Bestiary copy for the regular creatures. Names are Khmer-temple flavoured so
   the codex reads as part of the world rather than a debug list. */



function grantBossRelic(g, bossKey){
  const p = g && g.player; if(!p) return null;
  p.relics = p.relics || [];
  const pool = relicOptions(p.relics);
  if(!pool.length || p.relics.length >= 3) return null;
  const r = pick(pool);
  p.relics.push(r.id);
  recalcStats(p);
  addToast('RELIC · '+r.name, '#c8a0ff', r.desc+' · '+p.relics.length+'/3');
  try{ syncRelicHUD(g); }catch(e){}
  return r;
}
function syncRelicHUD(g){
  const el = document.getElementById('relicBar');
  if(!el) return;
  const p = g && g.player;
  const list = (p && p.relics) || [];
  if(!list.length){ el.classList.add('hidden'); el.innerHTML=''; return; }
  el.classList.remove('hidden');
  el.innerHTML = list.map(id=>{
    const r = relicById(id);
    return r ? `<span class="relic-chip" title="${r.name} — ${r.desc}">${r.icon}</span>` : '';
  }).join('');
}

const CODEX_BOSSES = [
  { key:'cryptLord',       img:'naga',      name:'Naga Raja',   realm:'I · ANGKOR SANKRANTI CRYPT',      line:'Five-headed sovereign of the causeway. It has tasted a thousand kingdoms.' },
  { key:'cavernTitan',     img:'kumbha',    name:'Kumbhakarna', realm:'II · TA PROHM ROOT CAVERNS',      line:'The asura colossus of the Reamker, woken by the roots of the banyan.' },
  { key:'frostWyrm',       img:'garuda',    name:'Garuda',      realm:'III · PREAH VIHEAR SKY PEAK',     line:'The bird-king who ate the sun and still hungers for the peak.' },
  { key:'volcanoBehemoth', img:'kala',      name:'Kala',        realm:'IV · BANTEAY SREI SACRED FORGE',  line:'The devouring face carved above every gate. Time made teeth.' },
  { key:'shadowPrince',    img:'krongreap', name:'Krong Reap',  realm:'V · BAYON SHADOW SANCTUM',        line:'Ten heads, ten hungers, one throne in the heart of Bayon.' },
  { key:'airava',          img:'airava',    name:'Airavata',    realm:'VI · PHNOM BAKHENG CELESTIAL COURT', line:'Three heads, one storm. The white elephant that carries Indra\u2019s thunder.' },
];

function checkAchievements(){
  const fresh = newlyEarned(META as MetaState);
  for (const a of fresh){
    META.ach[a.id] = true;
    try { addToast('🏆 ' + a.name, '#ffd54f', a.desc); } catch(e){}
  }
  if (fresh.length) saveMeta();
  return fresh.length;
}
function markCodex(key, kind){
  if (!key) return;
  const tag = kind === 'kill' ? 'killed_' + key : 'seen_' + key;
  if (!META.codex[tag]){ META.codex[tag] = true; saveMeta(); }
}
function recordMetaRun(g, score, won){
  const p = g && g.player; if (!p) return 0;
  const soulsGain = soulsFromRun(g.wave || 1, g.kills || 0, score || 0);
  META.souls += soulsGain;
  META.earned += soulsGain;
  META.stats.runs += 1;
  META.stats.kills += (g.kills || 0);
  META.stats.bestWave = Math.max(META.stats.bestWave || 0, g.wave || 0);
  META.stats.bestKills = Math.max(META.stats.bestKills || 0, g.kills || 0);
  META.stats.bestScore = Math.max(META.stats.bestScore || 0, score || 0);
  META.runs.unshift({ cls: p.cls || 'warrior', wave: g.wave || 0, kills: g.kills || 0,
                      score: score || 0, date: Date.now(), diff: diffKey || 'normal', won: !!won });
  META.runs = META.runs.slice(0, 10);
  saveMeta();
  checkAchievements();
  return soulsGain;
}
function buySoulTrack(id){
  const tr = SOUL_TRACKS.find(t => t.id === id); if (!tr) return false;
  const rank = META.shop[id] || 0;
  if (rank >= tr.max) return false;
  if (META.souls < tr.cost[rank]) return false;
  META.souls -= tr.cost[rank];
  META.shop[id] = rank + 1;
  saveMeta();
  if (typeof G !== 'undefined' && G && G.player) recalcStats(G.player);
  return true;
}

/* ===== Player settings (persisted to localStorage 'sd_settings_v1') =====
   Accessibility + mix controls. `flash` and `shake` gate the full-screen white
   flashes and camera shake that every boss death, crit and cutscene produces. */
const SETTINGS: any = { sfxVol:0.85, musicVol:0.80, flash:true, shake:true, vfx:true, autoPause:true, profile:'default' };
function loadSettings(){
  try{
    const s=JSON.parse(localStorage.getItem('sd_settings_v1')||'{}');
    for(const k of Object.keys(SETTINGS)) if(s&&s[k]!==undefined) (SETTINGS as any)[k]=s[k];
  }catch(e){}
  applySettings();
}
function saveSettings(){try{localStorage.setItem('sd_settings_v1',JSON.stringify(SETTINGS))}catch(e){}}
function applySettings(){
  try{(window as any).SD_MUSIC_VOL=SETTINGS.musicVol}catch(e){}
  try{sfxSetVolume(SETTINGS.sfxVol)}catch(e){}
  try{GFX.shadows=SETTINGS.vfx;GFX.sparks=SETTINGS.vfx}catch(e){}
  applyColorProfile(SETTINGS.profile);
}
/* Colour assistance: these are display filters for the canvas, not a simulation
   of CVD. High contrast also lifts the HUD text so damage numbers stay legible. */
function applyColorProfile(p){
  const b=document.body;
  if(!b)return;
  ['cp-deutan','cp-tritan','cp-contrast'].forEach(c=>b.classList.remove(c));
  if(p==='deutan')b.classList.add('cp-deutan');
  else if(p==='tritan')b.classList.add('cp-tritan');
  else if(p==='contrast')b.classList.add('cp-contrast');
}
const FL = (a:number) => SETTINGS.flash ? a : a*0.2;   /* flash multiplier */
const SHK = (a:number) => SETTINGS.shake ? a : a*0.22; /* shake multiplier */

const rand = (a,b) => a + rng()*(b-a);
const randInt = (a,b) => Math.floor(rand(a,b+1));
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const lerp = (a,b,t) => a+(b-a)*t;
const pick = arr => arr[Math.floor(rng()*arr.length)];
function angDiff(a,b){let d=(a-b)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d}
function shadeColor(hex,pct){
  const c=hex.replace('#','');
  let r=parseInt(c.substring(0,2),16)||0,g=parseInt(c.substring(2,4),16)||0,b=parseInt(c.substring(4,6),16)||0;
  if(pct<0){r=Math.round(r*(1+pct));g=Math.round(g*(1+pct));b=Math.round(b*(1+pct))}
  else{r=Math.round(r+(255-r)*pct);g=Math.round(g+(255-g)*pct);b=Math.round(b+(255-b)*pct)}
  return `rgb(${r},${g},${b})`;
}

const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
let W=0,H=0,DPR=1;
/* Chunky-pixel downscale factor and mobile view zoom. Both adapt to the
   viewport: a 390px phone rendering at 1/3 resolution (the desktop value) gives
   a ~130px-wide framebuffer — mush. Phones render at native scale and zoom in
   so the hero reads at a sensible size. */
let PIX_SCALE=3, ZOOM=1;
function resize(){
  DPR=Math.min(window.devicePixelRatio||1,3);
  const baseW=window.innerWidth, baseH=window.innerHeight;
  /* Render at native device resolution: the old 1/3-resolution buffer quantised
     sprites and made spell gradients look smeared after the upscale. The pixel
     look now comes from the sprites themselves (heropix draws on a 3x grid),
     not from downsampling the whole frame. Put PIX_CHUNK back to 3 to restore
     the chunky pass. */
  const PIX_CHUNK = 1;                                 /* device px per game px */
  const C = Math.max(1, Math.round(PIX_CHUNK*DPR));
  const bw = Math.max(64, Math.round(baseW*DPR/C)*C);
  const bh = Math.max(64, Math.round(baseH*DPR/C)*C);
  canvas.width=bw; canvas.height=bh;
  canvas.style.width=(bw/DPR)+'px'; canvas.style.height=(bh/DPR)+'px';
  W=bw/DPR; H=bh/DPR;
  PIX_SCALE=C/DPR;              /* W/PIX_SCALE === bw/C — whole pixels */
  ZOOM = baseW<600 ? 1.35 : 1;
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize',resize);resize();
const WORLD = { w:2800, h:2100 };

function roundRect(x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

/* Angkor & Character Skill VFX Helper */
function spawnSkillVfx(g, p, kind, x, y, r, color, ang = 0, arc = 1.8) {
  const lvl = (p && p._castSkillLvl) || 1;
  const role = (p && p.cls && CLASSES[p.cls] && CLASSES[p.cls].roleTag) || 'Warrior';
  const accent = (p && p.accent) || color || '#ffd54f';
  const sc = 1 + (lvl - 1) * 0.14;
  // Archetype-specific signature Angkor motif
  if (role === 'Healer' || role === 'Druid') {
    g.fx.push({ type: 'lotus', x, y, r: r * 0.85 * sc, life: 0.55, max: 0.55, color: accent, petals: 8 + lvl * 2 });
  } else if (role === 'Mage' || role === 'Necromancer') {
    g.fx.push({ type: 'runes', x, y, r: r * 0.9 * sc, life: 0.6, max: 0.6, color: accent, count: 6 + lvl });
  } else if (role === 'Warrior' || role === 'Demon') {
    g.fx.push({ type: 'garuda', x, y, r: r * 0.9 * sc, ang, life: 0.42, max: 0.42, color });
  } else if (role === 'Rogue' || role === 'Ranger') {
    g.fx.push({ type: 'chakram', x, y, r: r * 0.75 * sc, ang, life: 0.45, max: 0.45, color: accent, blades: 5 + lvl });
  } else if (role === 'Summoner') {
    g.fx.push({ type: 'naga', x, y, r: r * 0.9 * sc, ang, life: 0.55, max: 0.55, color: accent });
  }
  if (kind === 'pillar' || lvl >= 3) {
    g.fx.push({ type: 'pillar', x, y, r: Math.max(28, r * 0.35), life: 0.48, max: 0.48, color });
  }
  const pCount = Math.min(28, Math.round((8 + lvl * 4) * (kind === 'nova' ? 1.4 : 1)));
  for (let i = 0; i < pCount; i++) {
    const a = kind === 'slash' ? ang + rand(-arc * 0.55, arc * 0.55) : rand(0, TAU);
    const sp = rand(55, 190 + lvl * 30);
    g.particles.push({
      x: x + Math.cos(a) * rand(4, Math.min(35, r * 0.3)),
      y: y + Math.sin(a) * rand(4, Math.min(35, r * 0.3)),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - rand(10, 40),
      life: rand(0.28, 0.62),
      max: 0.62,
      size: rand(2.2, 4.5 + lvl * 0.6),
      color: i % 2 === 0 ? color : accent,
      glow: true
    });
  }
}

/* Skill helpers — scale with skill level (s.lvl 1..5) and emit custom VFX */
const skLvlMult = (p) => 1 + (((p && p._castSkillLvl) || 1) - 1) * 0.22;
const skRadMult = (p) => 1 + (((p && p._castSkillLvl) || 1) - 1) * 0.10;

const M = (name, icon, mult, arc, cost, cd, color, effect:any = null) => ({
  name, icon, key:'1', cost, cd, color, kindTag:'Melee Arts',
  info: { desc: name + ' — fierce Angkor martial strike that cleaves enemies in an arc.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Arc', value: Math.round(arc*57.3)+'°'},{label:'Skill Lv', value: 'Lv '+sl+'/5', kind:'util'}] },
  cast(p, g) {
    const sm = skLvlMult(p), rm = skRadMult(p);
    const reach = (p.range + 14) * rm;
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist(p, e) < reach + e.r) {
        const a = Math.atan2(e.y-p.y, e.x-p.x);
        if (Math.abs(angDiff(a, p.facing)) < (arc * rm)/2) {
          damageEnemy(e, p.dmg*mult*sm, g, p, {skill:true});
          if (effect) effect(e, g, p);
        }
      }
    }
    g.fx.push({type:'slash', x:p.x, y:p.y, r:(p.range+20)*rm, ang:p.facing, arc:arc*rm, life:.24, max:.24, color, lvl:p._castSkillLvl||1});
    spawnSkillVfx(g, p, 'slash', p.x + Math.cos(p.facing)*28, p.y + Math.sin(p.facing)*28, (p.range+20)*rm, color, p.facing, arc);
    g.shake = Math.max(g.shake, 4 + (p._castSkillLvl||1));
  }
});

const P = (name, icon, mult, speed, cost, cd, color, opts:any = null) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Projectile',
  info: { desc: name + ' — imbued ranged projectile thatchannels ancient prana.',
    calc: (p, sl=1) => [
      {label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},
      ...(opts && opts.pierce ? [{label:'Pierce', value: opts.pierce+sl}] : []),
      ...(opts && opts.explode ? [{label:'Explosion', value: Math.round(p.dmg*opts.explode.mult*(1+(sl-1)*0.22)), kind:'dmg'}] : []),
      {label:'Skill Lv', value: 'Lv '+sl+'/5', kind:'util'}
    ] },
  cast(p, g) {
    const sm = skLvlMult(p), lvl = p._castSkillLvl || 1;
    const a = p.facing;
    const o = {
      x:p.x+Math.cos(a)*20, y:p.y+Math.sin(a)*20,
      vx:Math.cos(a)*speed, vy:Math.sin(a)*speed,
      r: ((opts && opts.radius) || 7) + (lvl - 1), dmg: p.dmg*mult*sm,
      life: 1.5, color, from:'player'
    };
    if (opts && opts.pierce) o.pierce = opts.pierce + Math.floor((lvl-1)/2);
    if (opts && opts.explode) o.explode = {r:opts.explode.r * skRadMult(p), dmg:p.dmg*opts.explode.mult*sm, color};
    if (opts && opts.effect) o.enemyEffect = opts.effect;
    spawnProj(g, o);
    spawnSkillVfx(g, p, 'proj', p.x+Math.cos(a)*22, p.y+Math.sin(a)*22, 42, color, a, 0.9);
  }
});

const N = (name, icon, mult, radius, cost, cd, color, effect = null) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Sacred Nova',
  info: { desc: name + ' — radial mandala shockwave around your hero.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22))+' in radius '+Math.round(radius*(1+(sl-1)*0.1)), kind:'dmg'},{label:'Skill Lv', value: 'Lv '+sl+'/5', kind:'util'}] },
  cast(p, g) {
    const sm = skLvlMult(p), rad = radius * skRadMult(p);
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist(p, e) < rad + e.r) {
        damageEnemy(e, p.dmg*mult*sm, g, p, {skill:true});
        if (effect) effect(e, g, p);
      }
    }
    g.fx.push({type:'nova', x:p.x, y:p.y, r:rad, life:.52, max:.52, color});
    spawnSkillVfx(g, p, 'nova', p.x, p.y, rad, color);
    g.shake = Math.max(g.shake, 5 + (p._castSkillLvl||1));
  }
});

const D = (name, icon, mult, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Tempo Dash',
  info: { desc: name + ' — lightning dash forward, slicing through foes.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22))+' per enemy', kind:'dmg'},{label:'Invuln', value:(0.3+(sl-1)*0.05).toFixed(2)+' s', kind:'util'}] },
  cast(p, g) {
    const sm = skLvlMult(p), lvl = p._castSkillLvl || 1;
    p.dashT = 0.22 + (lvl-1)*0.02; p.dashSpeed = 1100 + (lvl-1)*50; p.dashAng = p.facing;
    p.dashDamage = p.dmg*mult*sm; p.dashHits = new Set();
    p.invuln = Math.max(p.invuln, 0.3 + (lvl-1)*0.05);
    g.fx.push({type:'ring', x:p.x, y:p.y, r:65, life:.35, max:.35, color});
    spawnSkillVfx(g, p, 'slash', p.x, p.y, 75, color, p.facing, 1.4);
  }
});

const K = (name, icon, cost, cd, color) => ({
  name, icon, key:'3', cost, cd, color, kindTag:'Apsara Blink',
  info: { desc: name + ' — phase-shift instantly toward the cursor.',
    calc: (p, sl=1) => [{label:'Range', value:420+(sl-1)*35}, {label:'Invuln', value:(0.25+(sl-1)*0.06).toFixed(2)+' s', kind:'util'}] },
  cast(p, g) {
    const lvl = p._castSkillLvl || 1;
    const w = screenToWorld(mouse.x, mouse.y);
    const a = Math.atan2(w.y-p.y, w.x-p.x), d = Math.min(dist(p, w), 420 + (lvl-1)*35);
    g.fx.push({type:'ring', x:p.x, y:p.y, r:55, life:.32, max:.32, color});
    spawnSkillVfx(g, p, 'nova', p.x, p.y, 65, color);
    p.x = clamp(p.x+Math.cos(a)*d, 30, WORLD.w-30);
    p.y = clamp(p.y+Math.sin(a)*d, 30, WORLD.h-30);
    p.moveTarget = null; p.invuln = Math.max(p.invuln, 0.25 + (lvl-1)*0.06);
    g.fx.push({type:'ring', x:p.x, y:p.y, r:70, life:.38, max:.38, color});
    spawnSkillVfx(g, p, 'pillar', p.x, p.y, 75, color);
  }
});

const S = (name, icon, cost, cd, color, count, dmgMult, hpMult) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Summon Guardian',
  info: { desc: name + ' — summon temple guardians to fight beside you.',
    calc: (p, sl=1) => [
      {label:'Allies', value: (count || 1) + Math.floor((sl-1)/2)},
      {label:'Ally HP', value: Math.round((55+p.level*12)*(hpMult||1)*(1+(sl-1)*0.22)), kind:'heal'},
      {label:'Ally Damage', value: Math.round(p.dmg*(dmgMult||0.55)*(1+(sl-1)*0.22)), kind:'dmg'}
    ] },
  cast(p, g) {
    const sm = skLvlMult(p), lvl = p._castSkillLvl || 1;
    const n = (count || 1) + Math.floor((lvl - 1) / 2);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), d = rand(35, 55) + i*10;
      const hpMax = Math.round((55+p.level*12)*(hpMult||1)*sm);
      tcount(p,'summons');
      const mx = p.x+Math.cos(a)*d, my = p.y+Math.sin(a)*d;
      g.minions.push({
        x: mx, y: my, r: 11 + Math.min(3, lvl-1),
        hp: hpMax, maxHp: hpMax, dmg: p.dmg*(dmgMult||0.55)*sm,
        speed: 205 + lvl*6, life: 20 + lvl*2, maxLife: 20 + lvl*2, atkTimer: rand(0.2, 0.8),
        facing: a, hitFlash: 0, wobble: rand(0, TAU)
      });
      g.fx.push({type:'summon', x:mx, y:my, s:0.9, life:0.75, max:0.75});
    }
    { const sk = g.minions.filter(x => !x.ally); if (sk.length > 10) { const rm = sk.slice(0, sk.length - 10); g.minions = g.minions.filter(x => !rm.includes(x)); } }
    g.fx.push({type:'ring', x:p.x, y:p.y, r:95, life:.5, max:.5, color});
    spawnSkillVfx(g, p, 'nova', p.x, p.y, 95, color);
  }
});

const HEAL = (name, icon, pct, cost, cd, color, extra:any = null) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Lotus Blessing',
  info: { desc: name + ' — restore health with sacred lotus nectar.',
    calc: (p, sl=1) => [
      {label:'Heal', value: Math.round(p.maxHp*Math.min(0.95, pct*(1+(sl-1)*0.15)))+' HP', kind:'heal'},
      ...(extra && extra.energy ? [{label:'Energy', value:'+'+extra.energy, kind:'heal'}] : []),
      ...(extra && extra.invuln ? [{label:'Invulnerable', value: extra.invuln+' s', kind:'util'}] : [])
    ] },
  cast(p, g) {
    const lvl = p._castSkillLvl || 1;
    const _healAmt=Math.round(p.maxHp*Math.min(0.95, pct*(1+(lvl-1)*0.15)));
    p.hp = Math.min(p.maxHp, p.hp + _healAmt);
    tcount(p,'heals',_healAmt);
    if (extra && extra.energy) p.energy = Math.min(p.maxEnergy, p.energy + extra.energy);
    if (extra && extra.invuln) p.invuln = Math.max(p.invuln, extra.invuln);
    g.fx.push({type:'ring', x:p.x, y:p.y, r:85, life:.5, max:.5, color});
    g.fx.push({type:'healbeam', x:p.x, y:p.y, life:0.9, max:0.9});
    spawnSkillVfx(g, p, 'pillar', p.x, p.y, 90, color);
  }
});

const B = (name, icon, kind, dur, cost, cd, color, amt:any = null) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Mantra Buff',
  info: { desc: name + ' — empower yourself with an ancient Khmer war mantra.',
    calc: (p, sl=1) => [
      {label:'Duration', value: (dur+(sl-1)*0.6).toFixed(1)+' s', kind:'util'},
      ...(kind === 'frenzy' ? [{label:'Attack Speed', value:'+60%', kind:'util'}] : []),
      ...(kind === 'armor' ? [{label:'Damage Reduction', value:'+40%', kind:'util'}] : []),
      ...(kind === 'damage' ? [{label:'Damage Boost', value:'+'+(amt||40)+'%', kind:'dmg'}] : [])
    ] },
  cast(p, g) {
    const lvl = p._castSkillLvl || 1;
    const d2 = dur + (lvl - 1) * 0.6;
    if (kind === 'frenzy') p._frenzyT = d2;
    if (kind === 'armor') p.invuln = Math.max(p.invuln, d2);
    if (kind === 'damage') { p._frenzyT = d2; p._markT = d2; }
    g.fx.push({type:'ring', x:p.x, y:p.y, r:95, life:.5, max:.5, color});
    spawnSkillVfx(g, p, 'pillar', p.x, p.y, 95, color);
    g.texts.push({x:p.x, y:p.y-30, vy:-50, life:1, max:1, spawn:1, text:name.toUpperCase()+' LV.'+lvl, color, size:16});
  }
});

const C = (name, icon, mult, count, cost, cd, color) => ({
  name, icon, key:'3', cost, cd, color, kindTag:'Indra Lightning',
  info: { desc: name + ' — arc celestial lightning across multiple foes.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22))+' per enemy', kind:'dmg'},{label:'Chains', value: count + Math.floor((sl-1)/2)}] },
  cast(p, g) {
    const sm = skLvlMult(p), lvl = p._castSkillLvl || 1;
    let cur = p;
    const hit = new Set();
    const n = count + Math.floor((lvl - 1) / 2);
    for (let i = 0; i < n; i++) {
      let best = null, bd = 290 + lvl * 15;
      for (const e of g.enemies) {
        if (e.dead || hit.has(e)) continue;
        const d = dist(cur, e); if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      hit.add(best);
      damageEnemy(best, p.dmg*mult*sm, g, p, {skill:true});
      g.fx.push({type:'lightning', x1:cur.x, y1:cur.y, x2:best.x, y2:best.y, life:.28, max:.28, color});
      spawnSkillVfx(g, p, 'pillar', best.x, best.y, 50, color);
      cur = best;
    }
  }
});

const R = (name, icon, mult, radius, cost, cd, color) => ({
  name, icon, key:'3', cost, cd, color, kindTag:'Celestial Rain',
  info: { desc: name + ' — call down celestial devastation at the cursor.',
    calc: (p, sl=1) => [{label:'Damage/sec', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Duration', value:(2+(sl-1)*0.3).toFixed(1)+' s'},{label:'Radius', value: Math.round(radius*(1+(sl-1)*0.1))}] },
  cast(p, g) {
    const sm = skLvlMult(p), rm = skRadMult(p), lvl = p._castSkillLvl || 1;
    const w = screenToWorld(mouse.x, mouse.y);
    const rx = clamp(w.x,40,WORLD.w-40), ry = clamp(w.y,40,WORLD.h-40);
    g.rains.push({x:rx, y:ry, r:radius*rm, life:2+(lvl-1)*0.3, tick:0, dmg:p.dmg*mult*sm, color});
    spawnSkillVfx(g, p, 'nova', rx, ry, radius*rm, color);
  }
});

const BEAM = (name, icon, mult, length, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Prana Beam',
  info: { desc: name + ' — pierce all enemies in a blazing line of energy.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22))+' per enemy', kind:'dmg'},{label:'Range', value: Math.round(length*(1+(sl-1)*0.1))}] },
  cast(p, g) {
    const sm = skLvlMult(p), rm = skRadMult(p);
    const len = length * rm;
    const a = p.facing;
    const ex = p.x + Math.cos(a)*len;
    const ey = p.y + Math.sin(a)*len;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > len + e.r) continue;
      const proj = (dx*Math.cos(a) + dy*Math.sin(a)) / d;
      if (proj < 0) continue;
      const perp = Math.abs(-dx*Math.sin(a) + dy*Math.cos(a));
      if (perp < e.r + 18) damageEnemy(e, p.dmg*mult*sm, g, p, {skill:true});
    }
    g.fx.push({type:'beam', x1:p.x, y1:p.y, x2:ex, y2:ey, life:.44, max:.44, color});
    spawnSkillVfx(g, p, 'slash', p.x + Math.cos(a)*len*0.5, p.y + Math.sin(a)*len*0.5, 90, color, a, 0.8);
    g.shake = Math.max(g.shake, 4);
  }
});

const LEAP = (name, icon, mult, radius, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Garuda Leap',
  info: { desc: name + ' — soar like Garuda to the cursor and shatter the stone on impact.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22))+' in '+Math.round(radius*(1+(sl-1)*0.1)), kind:'dmg'},{label:'Range', value: 400}] },
  cast(p, g) {
    const sm = skLvlMult(p), rad = radius * skRadMult(p);
    const w = screenToWorld(mouse.x, mouse.y);
    const d = Math.min(dist(p, w), 400);
    const a = Math.atan2(w.y-p.y, w.x-p.x);
    p.x = clamp(p.x + Math.cos(a)*d, 30, WORLD.w-30);
    p.y = clamp(p.y + Math.sin(a)*d, 30, WORLD.h-30);
    p.moveTarget = null;
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist(p, e) < rad + e.r) damageEnemy(e, p.dmg*mult*sm, g, p, {skill:true});
    }
    g.fx.push({type:'nova', x:p.x, y:p.y, r:rad, life:.45, max:.45, color});
    g.fx.push({type:'ring', x:p.x, y:p.y, r:rad*1.2, life:.55, max:.55, color});
    spawnSkillVfx(g, p, 'pillar', p.x, p.y, rad, color, a);
    g.shake = Math.max(g.shake, 8);
  }
});

const WHIRL = (name, icon, mult, dur, radius, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Chakram Vortex',
  info: { desc: name + ' — spin in a bladed tempest, damaging nearby enemies.',
    calc: (p, sl=1) => [{label:'Damage/tick', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Duration', value: (dur+(sl-1)*0.4).toFixed(1)+' s'},{label:'Radius', value: Math.round(radius*(1+(sl-1)*0.1))}] },
  cast(p, g) {
    const sm = skLvlMult(p), rm = skRadMult(p), lvl = p._castSkillLvl || 1;
    p._whirlT = dur + (lvl-1)*0.4; p._whirlMult = mult*sm; p._whirlR = radius*rm;
    p._whirlTick = 0; p._whirlColor = color;
    g.fx.push({type:'ring', x:p.x, y:p.y, r:radius*rm, life:.45, max:.45, color});
    spawnSkillVfx(g, p, 'nova', p.x, p.y, radius*rm, color);
  }
});

const SHIELD = (name, icon, pct, dur, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Bayon Aegis',
  info: { desc: name + ' — summon a Bayon stone ward to absorb incoming damage.',
    calc: (p, sl=1) => [{label:'Absorb', value: Math.round(p.maxHp*pct*(1+(sl-1)*0.2))+' HP', kind:'util'},{label:'Duration', value: (dur+(sl-1)*0.5).toFixed(1)+' s'}] },
  cast(p, g) {
    const lvl = p._castSkillLvl || 1;
    p._shieldT = dur + (lvl-1)*0.5;
    p._shieldAmt = Math.round(p.maxHp*pct*(1+(lvl-1)*0.2));
    p._shieldColor = color;
    g.fx.push({type:'ring', x:p.x, y:p.y, r:85, life:.5, max:.5, color});
    spawnSkillVfx(g, p, 'pillar', p.x, p.y, 85, color);
  }
});

const TRAP = (name, icon, mult, radius, dur, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Yantra Trap',
  info: { desc: name + ' — inscribe an explosive yantra rune trap at cursor.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Radius', value: Math.round(radius*(1+(sl-1)*0.1))},{label:'Duration', value: dur+' s'}] },
  cast(p, g) {
    const sm = skLvlMult(p), rm = skRadMult(p);
    const w = screenToWorld(mouse.x, mouse.y);
    const tx = clamp(w.x,40,WORLD.w-40), ty = clamp(w.y,40,WORLD.h-40);
    g.traps.push({x:tx, y:ty, r:radius*rm, dmg:p.dmg*mult*sm, life:dur, max:dur, color, armed:true});
    spawnSkillVfx(g, p, 'nova', tx, ty, radius*0.7, color);
  }
});

const MULTI = (name, icon, mult, count, spread, speed, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Volley Fan',
  info: { desc: name + ' — unleash a fan of enchanted projectiles.',
    calc: (p, sl=1) => [{label:'Damage each', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Projectiles', value: count + Math.floor((sl-1)/2)}] },
  cast(p, g) {
    const sm = skLvlMult(p), lvl = p._castSkillLvl || 1;
    const n = count + Math.floor((lvl - 1) / 2);
    for (let i = 0; i < n; i++) {
      const off = (i - (n-1)/2) * spread;
      const a = p.facing + off;
      spawnProj(g, {
        x:p.x+Math.cos(a)*20, y:p.y+Math.sin(a)*20,
        vx:Math.cos(a)*speed, vy:Math.sin(a)*speed,
        r:6 + Math.min(2, lvl-1), dmg:p.dmg*mult*sm, life:1.25, color, from:'player'
      });
    }
    spawnSkillVfx(g, p, 'slash', p.x+Math.cos(p.facing)*24, p.y+Math.sin(p.facing)*24, 65, color, p.facing, spread*n);
  }
});

const HOMING = (name, icon, mult, speed, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Naga Seeker',
  info: { desc: name + ' — launch a seeking spirit projectile.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Seekers', value: 1 + Math.floor((sl-1)/3), kind:'util'}] },
  cast(p, g) {
    const sm = skLvlMult(p), lvl = p._castSkillLvl || 1;
    let target = null, bd = Infinity;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = dist(p, e);
      if (d < bd) { bd = d; target = e; }
    }
    if (!target) return;
    const count = 1 + Math.floor((lvl - 1) / 3);
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(target.y-p.y, target.x-p.x) + (i - (count-1)/2)*0.25;
      spawnProj(g, {
        x:p.x, y:p.y,
        vx:Math.cos(a)*speed, vy:Math.sin(a)*speed,
        r:8 + Math.min(3, lvl-1), dmg:p.dmg*mult*sm, life:2.5, color, from:'player',
        homing:true, homingTarget:target
      });
    }
    spawnSkillVfx(g, p, 'proj', p.x, p.y, 55, color, p.facing);
  }
});

const MARK = (name, icon, mult, dur, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Bayon Gaze',
  info: { desc: name + ' — mark nearby enemies under the gaze of Bayon (+40% damage taken).',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Mark Duration', value: (dur+(sl-1)*0.8).toFixed(1)+' s', kind:'util'}] },
  cast(p, g) {
    const sm = skLvlMult(p), lvl = p._castSkillLvl || 1;
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist(p, e) < 340 * skRadMult(p)) {
        damageEnemy(e, p.dmg*mult*sm, g, p, {skill:true});
        e.markT = dur + (lvl-1)*0.8;
      }
    }
    g.fx.push({type:'ring', x:p.x, y:p.y, r:340*skRadMult(p), life:.6, max:.6, color});
    spawnSkillVfx(g, p, 'nova', p.x, p.y, 200, color);
  }
});

const STEALTH = (name, icon, dur, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Shadow Veil',
  info: { desc: name + ' — vanish into temple mist and gain +80% move speed.',
    calc: (p, sl=1) => [{label:'Duration', value: (dur+(sl-1)*0.6).toFixed(1)+' s', kind:'util'},{label:'Speed', value:'+80%', kind:'util'}] },
  cast(p, g) {
    const lvl = p._castSkillLvl || 1;
    p._stealthT = dur + (lvl-1)*0.6;
    g.fx.push({type:'ring', x:p.x, y:p.y, r:65, life:.5, max:.5, color});
    spawnSkillVfx(g, p, 'nova', p.x, p.y, 65, color);
  }
});

const TOTEM = (name, icon, mult, radius, dur, cost, cd, color, healing) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Linga Totem',
  info: { desc: name + ' — consecrate a sacred ' + (healing?'healing ':'wrath ') + 'stele at the cursor.',
    calc: (p, sl=1) => [
      {label: healing?'Heal/tick':'Damage/tick', value: Math.round((healing?p.maxHp:p.dmg)*mult*(1+(sl-1)*0.22)), kind:healing?'heal':'dmg'},
      {label:'Radius', value: Math.round(radius*(1+(sl-1)*0.1))},
      {label:'Duration', value: (dur+(sl-1)*0.8).toFixed(1)+' s'}
    ] },
  cast(p, g) {
    const sm = skLvlMult(p), rm = skRadMult(p), lvl = p._castSkillLvl || 1;
    const w = screenToWorld(mouse.x, mouse.y);
    const tx = clamp(w.x,40,WORLD.w-40), ty = clamp(w.y,40,WORLD.h-40);
    g.totems.push({x:tx, y:ty, r:radius*rm, dmg:p.dmg*mult*sm, healAmt: p.maxHp*mult*sm, life:dur+(lvl-1)*0.8, max:dur+(lvl-1)*0.8, color, tick:0, healing:!!healing});
    spawnSkillVfx(g, p, 'pillar', tx, ty, radius*rm*0.6, color);
  }
});

const PULL = (name, icon, mult, radius, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Gravity Vortex',
  info: { desc: name + ' — pull enemies inward with crushing temple gravity.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Radius', value: Math.round(radius*(1+(sl-1)*0.1))},{label:'Slow', value:'1.4 s'}] },
  cast(p, g) {
    const sm = skLvlMult(p), rad = radius * skRadMult(p);
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = dist(p, e);
      if (d < rad) {
        const a = Math.atan2(p.y-e.y, p.x-e.x);
        const pullDist = Math.min(d - p.r - e.r - 8, 220);
        if (pullDist > 0) {
          e.x += Math.cos(a)*pullDist;
          e.y += Math.sin(a)*pullDist;
        }
        damageEnemy(e, p.dmg*mult*sm, g, p, {skill:true});
        e.slowT = Math.max(e.slowT, 1.4);
      }
    }
    g.fx.push({type:'ring', x:p.x, y:p.y, r:rad, life:.5, max:.5, color});
    spawnSkillVfx(g, p, 'nova', p.x, p.y, rad*0.8, color);
  }
});

const FEAR = (name, icon, dur, radius, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Asura Dread',
  info: { desc: name + ' — petrify and stun enemies in a radius.',
    calc: (p, sl=1) => [{label:'Stun', value: (dur+(sl-1)*0.35).toFixed(2)+' s (bosses ×0.25)', kind:'util'},{label:'Radius', value: Math.round(radius*(1+(sl-1)*0.1))}] },
  cast(p, g) {
    const lvl = p._castSkillLvl || 1, rad = radius * skRadMult(p);
    const d0 = dur + (lvl-1)*0.35;
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist(p, e) < rad) {
        const d2 = e.boss ? d0*0.25 : d0;
        e.stunT = Math.max(e.stunT||0, d2);
      }
    }
    g.fx.push({type:'ring', x:p.x, y:p.y, r:rad, life:.6, max:.6, color});
    g.fx.push({type:'nova', x:p.x, y:p.y, r:rad, life:.6, max:.6, color});
    spawnSkillVfx(g, p, 'nova', p.x, p.y, rad*0.85, color);
  }
});

const DOT = (name, icon, mult, dur, radius, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Naga Venom',
  info: { desc: name + ' — afflict nearby enemies with searing Naga venom.',
    calc: (p, sl=1) => [{label:'Damage/tick', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Duration', value: (dur+(sl-1)*0.5).toFixed(1)+' s'},{label:'Radius', value: Math.round(radius*(1+(sl-1)*0.1))}] },
  cast(p, g) {
    const sm = skLvlMult(p), rad = radius * skRadMult(p), lvl = p._castSkillLvl || 1;
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist(p, e) < rad) {
        e.dotT = Math.max(e.dotT||0, dur + (lvl-1)*0.5);
        e.dotDmg = p.dmg*mult*sm;
        e.dotTick = 0;
        e.dotColor = color;
      }
    }
    g.fx.push({type:'ring', x:p.x, y:p.y, r:rad, life:.5, max:.5, color});
    spawnSkillVfx(g, p, 'nova', p.x, p.y, rad*0.8, color);
  }
});

const LIFESTEAL = (name, icon, mult, healPct, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Soul Siphon',
  info: { desc: name + ' — strike enemies and siphon their life essence.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Heal', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)*healPct)+' HP', kind:'heal'}] },
  cast(p, g) {
    const sm = skLvlMult(p), rm = skRadMult(p);
    let total = 0;
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist(p, e) < (p.range + 14)*rm + e.r) {
        const a = Math.atan2(e.y-p.y, e.x-p.x);
        if (Math.abs(angDiff(a, p.facing)) < 1.25) {
          damageEnemy(e, p.dmg*mult*sm, g, p, {skill:true});
          total += p.dmg*mult*sm;
        }
      }
    }
    const healed = Math.round(total*healPct);
    p.hp = Math.min(p.maxHp, p.hp + healed);
    if (healed > 0) tcount(p, 'heals', healed);
    g.fx.push({type:'slash', x:p.x, y:p.y, r:(p.range+20)*rm, ang:p.facing, arc:2.4, life:.22, max:.22, color, lvl:p._castSkillLvl||1});
    g.fx.push({type:'ring', x:p.x, y:p.y, r:85, life:.42, max:.42, color:'#7aff9a'});
    spawnSkillVfx(g, p, 'slash', p.x, p.y, (p.range+20)*rm, color, p.facing, 2.2);
  }
});

const GROUND = (name, icon, mult, radius, dur, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Consecrated Ground',
  info: { desc: name + ' — sanctify or corrupt the ground at the cursor.',
    calc: (p, sl=1) => [{label:'Damage/tick', value: Math.round(p.dmg*mult*(1+(sl-1)*0.22)), kind:'dmg'},{label:'Duration', value: (dur+(sl-1)*0.6).toFixed(1)+' s'},{label:'Radius', value: Math.round(radius*(1+(sl-1)*0.1))}] },
  cast(p, g) {
    const sm = skLvlMult(p), rm = skRadMult(p), lvl = p._castSkillLvl || 1;
    const w = screenToWorld(mouse.x, mouse.y);
    const gx = clamp(w.x,40,WORLD.w-40), gy = clamp(w.y,40,WORLD.h-40);
    g.grounds.push({x:gx, y:gy, r:radius*rm, dmg:p.dmg*mult*sm, life:dur+(lvl-1)*0.6, max:dur+(lvl-1)*0.6, color, tick:0});
    spawnSkillVfx(g, p, 'nova', gx, gy, radius*rm*0.75, color);
  }
});

const CHAINHEAL = (name, icon, pct, dur, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Amrita Regen',
  info: { desc: name + ' — channel celestial Amrita to regenerate health over time.',
    calc: (p, sl=1) => [{label:'Heal total', value: Math.round(p.maxHp*pct*(1+(sl-1)*0.18))+' HP', kind:'heal'},{label:'Duration', value: dur+' s'}] },
  cast(p, g) {
    const lvl = p._castSkillLvl || 1;
    p._healingT = dur;
    p._healingRate = (p.maxHp * pct * (1+(lvl-1)*0.18)) / dur;
    g.fx.push({type:'ring', x:p.x, y:p.y, r:85, life:.5, max:.5, color});
    g.fx.push({type:'healbeam', x:p.x, y:p.y, life:1.15, max:1.15});
    spawnSkillVfx(g, p, 'pillar', p.x, p.y, 85, color);
  }
});

const SACRIFICE = (name, icon, mult, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Ritual Detonation',
  info: { desc: name + ' — detonate a summoned guardian in a cataclysmic blast.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*(1+(sl-1)*0.24))+' in '+Math.round(125*(1+(sl-1)*0.1)), kind:'dmg'}] },
  cast(p, g) {
    const sm = skLvlMult(p), rad = 125 * skRadMult(p);
    const sac = g.minions.filter(x => !x.ally);
    if (sac.length === 0) { addToast('No minions to sacrifice', '#ef4444', ''); return; }
    const m = sac[0];
    const target = g.enemies.find(e => !e.dead && dist(e, m) < 220);
    const tx = target ? target.x : m.x;
    const ty = target ? target.y : m.y;
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist({x:tx,y:ty}, e) < rad + e.r) damageEnemy(e, p.dmg*mult*sm, g, p, {skill:true});
    }
    g.fx.push({type:'boom', x:tx, y:ty, r:rad, life:.5, max:.5, color});
    spawnSkillVfx(g, p, 'pillar', tx, ty, rad, color);
    g.shake = Math.max(g.shake, 7);
    g.minions.splice(g.minions.indexOf(m), 1);
  }
});

const SHADOWSTEP = (name, icon, mult, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Phantom Ambush',
  info: { desc: name + ' — teleport behind nearest target for a guaranteed critical strike.',
    calc: (p, sl=1) => [{label:'Damage', value: Math.round(p.dmg*mult*2*(1+(sl-1)*0.22))+' (crit)', kind:'dmg'},{label:'Range', value: 420+(sl-1)*30}] },
  cast(p, g) {
    const sm = skLvlMult(p), lvl = p._castSkillLvl || 1;
    let target = null, bd = 420 + (lvl-1)*30;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = dist(p, e);
      if (d < bd) { bd = d; target = e; }
    }
    if (!target) return;
    const a = Math.atan2(p.y-target.y, p.x-target.x);
    p.x = target.x + Math.cos(a)*(target.r+14);
    p.y = target.y + Math.sin(a)*(target.r+14);
    p.moveTarget = null; p.invuln = Math.max(p.invuln, 0.2);
    damageEnemy(target, p.dmg*mult*2*sm, g, p, {forceCrit:true, skill:true});
    g.fx.push({type:'slash', x:target.x, y:target.y, r:48, ang:a, arc:2.1, life:.28, max:.28, color, lvl});
    g.fx.push({type:'ring', x:p.x, y:p.y, r:65, life:.38, max:.38, color});
    spawnSkillVfx(g, p, 'slash', target.x, target.y, 65, color, a, 2.1);
  }
});

const REFLECT = (name, icon, dur, cost, cd, color) => ({
  name, icon, key:'2', cost, cd, color, kindTag:'Mirror Counter',
  info: { desc: name + ' — reflect incoming damage back onto nearby enemies.',
    calc: (p, sl=1) => [{label:'Duration', value: (dur+(sl-1)*0.6).toFixed(1)+' s', kind:'util'},{label:'Retaliate', value:'50% nearby', kind:'util'}] },
  cast(p, g) {
    const lvl = p._castSkillLvl || 1;
    p._reflectT = dur + (lvl-1)*0.6;
    g.fx.push({type:'ring', x:p.x, y:p.y, r:75, life:.5, max:.5, color});
    spawnSkillVfx(g, p, 'nova', p.x, p.y, 75, color);
  }
});

const mkCls = (name, icon, color, accent, hp, energy, regen, speed, dmg, range, atkSpeed, crit, basic, roleTag, skills) => ({
  name, icon, color, accent, hp, energy, energyRegen: regen, speed, dmg, range, atkSpeed, crit, basic, roleTag, skills
});

/* ═══ 71 CLASSES ═══ */
export const CLASSES = {};

/* WARRIORS (8) */
CLASSES.ironclad     = mkCls('Ironclad','🛡','#5a5a8a','#a8a8d8',320,90,8,230,26,92,1.6,0.08,'melee','Warrior',
  [M('Shield Bash','🛡',1.8,2.4,12,0.9,'#8a8ad8'),SHIELD('Bulwark','⛨',0.35,4,22,9,'#aaaacc'),LEAP('Shield Slam','⬇',1.9,180,26,7,'#a8a8d8')]);
CLASSES.berserker    = mkCls('Berserker','🪓','#c0392b','#ff9b7a',260,100,9,255,29,86,1.85,0.11,'melee','Warrior',
  [M('Cleave','🪓',1.9,2.4,12,0.9,'#ff7b5a'),WHIRL('Blood Whirl','🌀',1.1,3,120,22,7,'#ff5020'),B('Frenzy','🔥','frenzy',5,24,10,'#ff5020')]);
CLASSES.bladedancer  = mkCls('Blade Dancer','⚔','#8e44ad','#e0b0ff',190,110,12,280,23,80,2.4,0.18,'melee','Warrior',
  [M('Dual Slash','⚔',1.5,2.2,10,0.7,'#e0b0ff'),WHIRL('Blade Spin','✷',0.9,2.5,140,22,5,'#d8a8ff'),D('Flourish','≫',1.6,16,3.5,'#e0b0ff')]);
CLASSES.warlord      = mkCls('Warlord','👑','#d35400','#f4a460',290,105,10,240,28,90,1.7,0.10,'melee','Warrior',
  [M('Rally Strike','👑',1.7,2.4,14,1.1,'#f4a460'),B('War Horn','📯','damage',4,22,10,'#d35400',30),PULL('Command Pull','🪢',1.3,300,28,8,'#f4a460')]);
CLASSES.gladiator    = mkCls('Gladiator','🏛','#c9a24a','#fff6b0',270,95,9,250,27,96,1.75,0.12,'melee','Warrior',
  [P('Spear Thrust','🏛',1.7,700,12,1.2,'#fff6b0'),TRAP('Net Trap','🕸',1.8,120,6,16,6,'#c9a24a'),N('Arena Roar','🗣',1.5,180,24,6,'#c9a24a')]);
CLASSES.samurai      = mkCls('Samurai','🗾','#a0522d','#f0e2c0',245,110,10,262,30,88,2.1,0.15,'melee','Warrior',
  [M('Iaido Strike','🗾',2.6,1.0,14,2.0,'#f0e2c0'),BEAM('Iai Slash','⚡',1.7,340,22,5,'#f0e2c0'),B('Zen Focus','☯','damage',5,24,10,'#f0e2c0',50)]);
CLASSES.juggernaut   = mkCls('Juggernaut','💢','#7f0000','#c96b6b',380,80,7,215,30,94,1.4,0.07,'melee','Warrior',
  [LEAP('Earthshatter','💢',2.2,240,18,4,'#c96b6b'),N('Slam','⬇',1.8,200,24,6,'#7f0000'),SHIELD('Unstoppable','⛓',0.45,6,28,12,'#c96b6b')]);
CLASSES.pitfighter   = mkCls('Pit Fighter','🥊','#8b4513','#d2691e',240,100,10,268,27,80,2.0,0.15,'melee','Warrior',
  [M('Hook','🥊',1.6,1.6,10,0.7,'#d2691e'),LIFESTEAL('Bloody Uppercut','⬆',2.0,0.4,16,2.5,'#ff8f5a'),B('Adrenaline','💉','frenzy',4,20,8,'#8b4513')]);

/* RANGERS (8) */
CLASSES.sharpshooter = mkCls('Sharpshooter','🎯','#c0392b','#ff7b5a',175,110,11,258,24,580,1.9,0.22,'arrow','Ranger',
  [P('Aimed Shot','🎯',2.2,900,16,1.8,'#ff7b5a'),BEAM('Piercing Line','➤',1.8,700,20,3.5,'#c0392b'),MULTI('Killshot','💀',1.6,5,0.14,1000,30,8,'#ff5020')]);
CLASSES.beastmaster  = mkCls('Beast Master','🐺','#7f6b00','#ffd54f',220,115,11,258,22,480,1.9,0.13,'arrow','Ranger',
  [S('Wolf Call','🐺',22,8,'#ffd54f',1,0.7,1.5),HOMING('Beast Strike','🐾',2.2,700,18,3,'#ffd54f'),B('Command','👑','damage',5,24,10,'#7f6b00',40)]);
CLASSES.trapper      = mkCls('Trapper','🪤','#8b7355','#c8b89a',190,120,12,260,20,520,2.0,0.14,'arrow','Ranger',
  [TRAP('Snare Trap','🪤',1.5,120,8,14,3,'#c8b89a'),GROUND('Caltrops','📌',0.9,150,6,20,5,'#8b7355'),P('Bear Shot','🐻',2.4,700,22,4,'#c8b89a')]);
CLASSES.windarcher   = mkCls('Wind Archer','💨','#16a085','#7affc0',170,120,13,268,21,560,2.3,0.15,'arrow','Ranger',
  [MULTI('Swift Volley','💨',1.0,3,0.12,900,12,1.4,'#7affc0'),MULTI('Multishot','⋙',0.9,5,0.18,750,18,2.4,'#16a085'),BEAM('Wind Pierce','🌪',1.9,650,22,4,'#7affc0')]);
CLASSES.crossbowman  = mkCls('Crossbowman','⚙','#4a3a2a','#a89886',205,105,10,240,27,560,1.7,0.12,'arrow','Ranger',
  [P('Heavy Bolt','⚙',2.1,650,16,2.2,'#a89886'),P('Explosive Bolt','💥',1.7,600,22,4,'#4a3a2a',{explode:{r:100,mult:1.2}}),MULTI('Barrage','⋙',0.85,4,0.14,800,26,6,'#a89886')]);
CLASSES.musketeer    = mkCls('Musketeer','💥','#8b0000','#ff8f5a',185,110,10,250,29,520,1.6,0.15,'arrow','Ranger',
  [P('Musket Shot','💥',2.4,1000,18,2.5,'#ff8f5a'),N('Grenade','🧨',1.9,140,24,5,'#8b0000'),M('Bayonet','🗡',1.7,1.8,12,0.9,'#ff8f5a')]);
CLASSES.sniper       = mkCls('Sniper','🔭','#2c3e50','#7f8c8d',150,115,11,240,32,720,1.5,0.28,'arrow','Ranger',
  [BEAM('Headshot','💀',3.5,900,26,5,'#7f8c8d'),B('Focus','⚡','damage',5,20,8,'#2c3e50',70),MARK('Killzone Mark','🎯',1.5,6,22,6,'#2c3e50')]);
CLASSES.pathfinder   = mkCls('Pathfinder','🧭','#4a7f5a','#a8e0b8',195,120,12,270,22,560,2.05,0.14,'arrow','Ranger',
  [P('Scout Shot','🧭',1.5,850,12,1.2,'#a8e0b8'),STEALTH('Camouflage','🌿',4,20,8,'#4a7f5a'),LEAP('Trek','🥾',1.3,100,14,3,'#a8e0b8')]);

/* MAGES (8) */
CLASSES.pyromancer   = mkCls('Pyromancer','🔥','#ff5020','#ffaa60',145,140,14,245,24,500,1.55,0.13,'bolt','Mage',
  [P('Fireball','🔥',1.8,450,16,1.4,'#ffaa60',{explode:{r:100,mult:1.0}}),N('Flame Wave','🌊',1.6,180,24,5,'#ff5020'),R('Meteor','☄',2.5,160,30,8,'#ff6b35')]);
CLASSES.cryomancer   = mkCls('Cryomancer','❄','#7fd4ff','#c8f0ff',155,140,14,245,22,500,1.6,0.13,'bolt','Mage',
  [P('Ice Shard','❄',1.5,600,14,1.2,'#c8f0ff',{effect:(e,g,p)=>e.slowT=Math.max(e.slowT,2)}),N('Frost Nova','❄',1.4,180,22,5,'#7fd4ff'),FEAR('Frozen Fear','🥶',1.5,240,32,8,'#a8e0ff')]);
CLASSES.stormcaller  = mkCls('Stormcaller','⚡','#ffe082','#fff6b0',150,145,15,250,24,500,1.6,0.15,'bolt','Mage',
  [P('Lightning Bolt','⚡',1.7,700,14,1.2,'#fff6b0'),C('Chain Lightning','⚡',1.4,3,22,4,'#ffe082'),BEAM('Thunder Lash','🌩',2.0,400,30,7,'#ffe082')]);
CLASSES.arcanist     = mkCls('Arcanist','🔮','#b47cff','#e0b0ff',145,145,15,245,25,510,1.55,0.14,'bolt','Mage',
  [P('Arcane Bolt','🔮',1.7,550,14,1.2,'#e0b0ff'),MULTI('Magic Missiles','✦',0.9,3,0.12,650,18,2.2,'#b47cff'),HOMING('Arcane Orb','◉',2.4,380,26,4,'#b47cff')]);
CLASSES.chronomancer = mkCls('Chronomancer','⏳','#7f5aaf','#d8a8ff',150,150,15,255,22,510,1.55,0.14,'bolt','Mage',
  [P('Time Bolt','⏳',1.6,650,14,1.4,'#d8a8ff',{effect:(e,g,p)=>e.slowT=Math.max(e.slowT,2)}),FEAR('Time Freeze','⏱',2,240,24,6,'#7f5aaf'),K('Rewind','⏪',20,7,'#d8a8ff')]);
CLASSES.spellblade   = mkCls('Spellblade','⚔','#8e44ad','#e0b0ff',175,120,12,262,24,88,1.9,0.14,'melee','Mage',
  [M('Flame Sword','🔥',1.9,2.0,12,0.9,'#ffaa60'),SHADOWSTEP('Blink Strike','✧',1.7,14,3,'#e0b0ff'),N('Blade Storm','⚔',1.7,160,26,6,'#8e44ad')]);
CLASSES.illusionist  = mkCls('Illusionist','🎭','#9b59b6','#d8a8ff',140,150,15,255,21,500,1.6,0.15,'bolt','Mage',
  [HOMING('Mirror Image','🎭',1.8,650,16,2.5,'#d8a8ff'),FEAR('Confuse','💫',1.5,220,24,6,'#9b59b6'),STEALTH('Phantasm','👻',3,18,5,'#d8a8ff')]);
CLASSES.geomancer    = mkCls('Geomancer','🪨','#8a6a3a','#d8b088',185,135,13,240,26,500,1.55,0.11,'bolt','Mage',
  [P('Stone Spike','🪨',1.9,550,16,1.4,'#d8b088'),SHIELD('Stone Skin','🛡',0.4,6,24,6,'#8a6a3a'),GROUND('Earthquake','🌋',1.2,240,4,32,9,'#d8b088')]);

/* ROGUES (8) */
CLASSES.assassin     = mkCls('Assassin','🗡','#8e44ad','#e0b0ff',165,125,12,290,24,80,2.35,0.24,'melee','Rogue',
  [M('Backstab','🗡',2.6,1.4,14,1.5,'#e0b0ff'),SHADOWSTEP('Shadow Strike','🌑',1.9,16,4,'#8e44ad'),MARK('Mark of Death','💀',1.4,5,22,6,'#a060ff')]);
CLASSES.thief        = mkCls('Thief','💰','#8b6914','#d4a828',170,135,14,295,20,80,2.5,0.22,'melee','Rogue',
  [M('Steal','💰',1.6,1.8,10,0.9,'#d4a828'),STEALTH('Vanish','💨',4,14,3,'#8b6914'),M('Pickpocket','✋',2.4,1.5,16,2,'#d4a828')]);
CLASSES.trickster    = mkCls('Trickster','🎩','#9b59b6','#e0a8ff',160,130,13,285,21,80,2.3,0.20,'melee','Rogue',
  [P('Trick Card','🎴',1.7,700,14,1.5,'#e0a8ff'),K('Disappear','👻',16,4,'#9b59b6'),FEAR('Misdirect','↻',1.5,200,22,6,'#e0a8ff')]);
CLASSES.ninja        = mkCls('Ninja','🥷','#2c3e50','#7f8c8d',180,130,13,292,22,82,2.4,0.21,'melee','Rogue',
  [P('Shuriken','⭐',1.5,850,12,1.2,'#7f8c8d'),K('Smoke','💨',14,3,'#2c3e50'),S('Shadow Clone','👤',26,8,'#7f8c8d',1,1.0,0.6)]);
CLASSES.poisoner     = mkCls('Poisoner','☠','#4a7f4a','#a8e063',165,130,13,285,21,80,2.3,0.20,'melee','Rogue',
  [P('Poison Dart','☠',1.4,750,12,1.2,'#a8e063',{effect:(e,g,p)=>{e.dotT=Math.max(e.dotT||0,4);e.dotDmg=p.dmg*0.4;e.dotTick=0;e.dotColor='#a8e063'}}),GROUND('Venom Pool','🧪',0.9,140,5,22,5,'#4a7f4a'),DOT('Toxin Burst','☣',1.2,4,180,26,6,'#a8e063')]);
CLASSES.swashbuckler = mkCls('Swashbuckler','🎭','#c9a24a','#ffe082',180,120,12,285,24,82,2.2,0.20,'melee','Rogue',
  [M('Flashy Slash','⚔',1.8,2.0,12,0.9,'#ffe082'),REFLECT('Parry','⛨',2,18,5,'#c9a24a'),M('Riposte','🤺',2.4,1.6,20,3,'#ffe082')]);
CLASSES.phantom      = mkCls('Phantom','👻','#5a5a8a','#c8c8e0',155,135,13,295,21,80,2.35,0.21,'melee','Rogue',
  [M('Phase Strike','👻',1.9,1.8,12,0.9,'#c8c8e0'),K('Blink','✧',14,3,'#5a5a8a'),FEAR('Ghost Walk','👣',1.4,180,22,6,'#c8c8e0')]);
CLASSES.blademaster  = mkCls('Blade Master','⚔','#a0522d','#f0e2c0',180,125,12,285,25,82,2.25,0.20,'melee','Rogue',
  [M('Perfect Slash','⚔',2.0,1.6,12,0.9,'#f0e2c0'),LIFESTEAL('Counter','↻',1.8,0.3,16,2.5,'#a0522d'),MULTI('Blade Fan','🗡',0.9,4,0.16,700,26,6,'#f0e2c0')]);

/* NECROMANCERS (8) */
CLASSES.bonelord     = mkCls('Bone Lord','💀','#7aff9a','#c8ffe0',180,135,12,250,23,460,1.7,0.11,'soul','Necromancer',
  [P('Bone Spear','🦴',1.9,900,14,1.2,'#c8ffe0',{pierce:3}),S('Raise Skeletons','💀',30,10,'#7aff9a',2,0.6,0.6),SHIELD('Bone Armor','🛡',0.35,4,20,8,'#7aff9a')]);
CLASSES.lich         = mkCls('Lich','🧙','#5a3a7a','#c8a8ff',160,150,14,245,25,460,1.55,0.13,'soul','Necromancer',
  [P('Death Bolt','💀',1.8,650,16,1.4,'#c8a8ff'),LIFESTEAL('Drain Life','🩸',1.5,0.5,20,3,'#5a3a7a'),FEAR('Death Nova','💥',1.5,200,28,7,'#c8a8ff')]);
CLASSES.deathknight  = mkCls('Death Knight','☠','#2c3e50','#8e44ad',265,100,9,244,27,88,1.6,0.10,'melee','Necromancer',
  [M('Death Strike','☠',1.9,2.0,12,0.9,'#8e44ad'),PULL('Death Grip','🖐',1.7,280,22,5,'#8e44ad'),N('Corpse Explosion','💥',1.6,180,30,7,'#8e44ad')]);
CLASSES.plaguedoctor = mkCls('Plague Doctor','🦠','#4a7f4a','#a8e063',175,130,12,248,21,460,1.7,0.11,'soul','Necromancer',
  [DOT('Plague Dart','🦠',1.2,4,180,12,1.2,'#a8e063'),GROUND('Miasma','☁',0.8,160,6,26,6,'#4a7f4a'),N('Pandemic','🌍',1.8,180,30,8,'#a8e063')]);
CLASSES.bloodmage    = mkCls('Blood Mage','🩸','#ff4d6b','#ffb0c0',178,130,12,248,24,460,1.6,0.12,'soul','Necromancer',
  [LIFESTEAL('Blood Bolt','🩸',1.8,0.4,14,1.2,'#ffb0c0'),N('Blood Nova','🩸',1.6,180,26,6,'#ff4d6b'),B('Blood Pact','💉','damage',5,24,10,'#ff4d6b',60)]);
CLASSES.wraithcaller = mkCls('Wraith Caller','👻','#a060ff','#d8a8ff',175,135,12,248,23,460,1.7,0.12,'soul','Necromancer',
  [P('Wraith Bolt','👻',1.7,700,14,1.2,'#d8a8ff'),S('Summon Wraith','👻',26,8,'#a060ff',1,0.8,0.7),FEAR('Haunt','🌑',1.5,200,26,6,'#d8a8ff')]);
CLASSES.corpseweaver = mkCls('Corpse Weaver','🧵','#5a3a3a','#a88888',185,130,12,248,24,460,1.65,0.11,'soul','Necromancer',
  [P('Corpse Bolt','🧵',1.6,650,14,1.2,'#a88888'),GROUND('Explode Corpse','💥',1.0,160,3,24,5,'#5a3a3a'),TRAP('Bone Snare','🦴',1.6,140,7,26,7,'#a88888')]);
CLASSES.revenant     = mkCls('Revenant','⚔','#4a2a2a','#c88888',220,120,11,245,26,88,1.7,0.11,'melee','Necromancer',
  [M('Vengeful Strike','⚔',1.9,2.2,12,0.9,'#c88888'),LIFESTEAL('Rise','⬆',1.5,0.45,26,9,'#4a2a2a'),REFLECT('Unyielding','⛓',3,22,9,'#c88888')]);

/* HEALERS (8) */
CLASSES.cleric       = mkCls('Cleric','✝','#f1c40f','#fff6b0',185,145,14,246,22,460,1.55,0.10,'bolt','Healer',
  [P('Holy Bolt','✝',1.6,650,12,1.2,'#fff6b0'),HEAL('Heal','💚',0.35,22,7,'#f1c40f'),B('Blessing','✨','damage',4,22,9,'#fff6b0',40)]);
CLASSES.paladin      = mkCls('Paladin','🛡','#f1c40f','#fff6b0',240,115,10,244,26,92,1.65,0.10,'melee','Healer',
  [M('Holy Smite','✝',1.7,2.2,14,1.2,'#fff6b0'),SHIELD('Divine Shield','🛡',0.35,4,26,8,'#f1c40f'),N('Consecrate','✞',1.5,160,32,7,'#fff6b0')]);
CLASSES.shaman       = mkCls('Shaman','🪶','#8e44ad','#d8a8ff',180,140,13,246,22,460,1.55,0.11,'bolt','Healer',
  [P('Lightning Bolt','⚡',1.7,700,14,1.4,'#d8a8ff'),TOTEM('Healing Totem','🪶',0.10,180,6,24,8,'#8e44ad',true),N('Ancestral Call','👻',1.6,180,28,8,'#d8a8ff')]);
CLASSES.monk         = mkCls('Monk','☯','#e67e22','#ffcc80',195,125,14,268,21,78,2.2,0.14,'melee','Healer',
  [M('Chi Strike','☯',1.7,1.8,12,0.9,'#ffcc80'),LIFESTEAL('Inner Peace','☯',1.6,0.5,26,10,'#e67e22'),N('Wave of Light','🌟',1.6,180,30,6,'#ffcc80')]);
CLASSES.oracle       = mkCls('Oracle','👁','#7a5a9a','#d8b8ff',160,155,15,248,20,460,1.55,0.12,'bolt','Healer',
  [HOMING('Prophecy','👁',1.8,650,12,1.2,'#d8b8ff'),CHAINHEAL('Foresight','🔮',0.4,4,22,7,'#7a5a9a'),FEAR('Deliverance','✨',1.5,240,28,8,'#d8b8ff')]);
CLASSES.lightbringer = mkCls('Lightbringer','☀','#ffd54f','#fff6b0',180,145,14,250,23,460,1.55,0.11,'bolt','Healer',
  [P('Dawn Bolt','☀',1.7,650,14,1.2,'#fff6b0'),CHAINHEAL('Radiance','✨',0.35,4,24,8,'#ffd54f'),BEAM('Solar Flare','☀',2.0,400,30,8,'#fff6b0')]);
CLASSES.bishop       = mkCls('Bishop','🔔','#a07000','#ffe082',175,155,15,246,20,460,1.55,0.11,'bolt','Healer',
  [N('Bell Toll','🔔',1.5,180,22,6,'#ffe082'),CHAINHEAL('Mass Heal','💚',0.5,5,30,10,'#a07000'),FEAR('Hymn','🎵',1.5,240,30,8,'#ffe082')]);
CLASSES.medic        = mkCls('Medic','💊','#2ecc71','#a8e063',180,145,14,255,21,460,1.6,0.11,'bolt','Healer',
  [P('Triage','💊',1.4,650,12,1.2,'#a8e063'),HEAL('Revive','💉',0.55,30,12,'#2ecc71',{invuln:2,energy:60}),B('Stimulant','⚡','frenzy',5,26,8,'#a8e063')]);

/* SUMMONERS (7) */
CLASSES.demonologist = mkCls('Demonologist','😈','#8e44ad','#e0b0ff',170,140,13,248,23,460,1.6,0.12,'bolt','Summoner',
  [S('Summon Imp','😈',24,8,'#e0b0ff',2,0.65,0.7),SACRIFICE('Dark Offering','🩸',2.2,26,7,'#8e44ad'),N('Hellfire','🔥',1.9,180,30,8,'#e0b0ff')]);
CLASSES.elemsummoner = mkCls('Elemental Summoner','🌪','#4a7fa0','#a8e0ff',165,145,14,250,22,460,1.6,0.12,'bolt','Summoner',
  [S('Summon Elemental','🌪',26,8,'#a8e0ff',1,0.85,0.9),HOMING('Elemental Blast','✦',1.9,600,18,5,'#4a7fa0'),B('Empower','⚡','damage',5,24,10,'#a8e0ff',40)]);
CLASSES.golemancer   = mkCls('Golemancer','🗿','#5a4a3a','#a89886',230,120,11,235,26,88,1.55,0.10,'melee','Summoner',
  [S('Summon Golem','🗿',28,10,'#a89886',1,1.0,1.8),SACRIFICE('Fist of Stone','👊',2.6,26,7,'#5a4a3a'),SHIELD('Fortify','⛨',0.35,5,22,9,'#a89886')]);
CLASSES.spiderqueen  = mkCls('Spider Queen','🕷','#4a2a3a','#a86088',185,135,12,255,22,460,1.7,0.12,'arrow','Summoner',
  [S('Summon Spider','🕷',22,7,'#a86088',3,0.5,0.5),DOT('Venom Spit','☠',1.2,4,180,14,1.5,'#a8e063'),B('Brood','🥚','damage',5,24,10,'#a86088',40)]);
CLASSES.dragonknight = mkCls('Dragon Knight','🐉','#8b0000','#ff8f5a',240,120,11,246,28,88,1.65,0.11,'melee','Summoner',
  [S('Summon Drake','🐉',28,9,'#ff8f5a',1,0.9,1.2),BEAM('Dragon Breath','🔥',2.2,380,24,5,'#ff6b35'),B('Roar','📯','damage',5,24,9,'#8b0000',50)]);
CLASSES.falconmaster = mkCls('Falcon Master','🦅','#a07000','#ffe082',175,135,12,265,21,540,2.05,0.14,'arrow','Summoner',
  [S('Summon Falcon','🦅',22,7,'#ffe082',1,0.85,0.8),HOMING('Talon Strike','🦅',2.2,900,14,2,'#ffe082'),D('Sky Dive','⬇',1.8,16,3,'#a07000')]);
CLASSES.spiritcaller = mkCls('Spirit Caller','👻','#a060ff','#d8a8ff',175,140,13,250,23,460,1.65,0.12,'soul','Summoner',
  [S('Summon Spirit','👻',24,8,'#d8a8ff',2,0.65,0.7),HOMING('Spirit Bolt','👻',1.9,700,14,2,'#d8a8ff'),FEAR('Spiritual Storm','🌪',1.5,220,30,8,'#d8a8ff')]);

/* DRUIDS (8) */
CLASSES.shapeshifter = mkCls('Shapeshifter','🐻','#5a3a1a','#c8a878',260,120,11,250,28,88,1.75,0.11,'melee','Druid',
  [M('Bear Strike','🐻',2.0,2.2,12,0.9,'#c8a878'),SHIELD('Bear Hide','🐻',0.35,5,22,9,'#5a3a1a'),WHIRL('Maul','🐾',1.2,3,160,20,5,'#c8a878')]);
CLASSES.werewolf     = mkCls('Werewolf','🐺','#4a3a2a','#a88868',235,130,12,265,27,84,2.1,0.15,'melee','Druid',
  [M('Claw','🐾',1.7,1.8,10,0.7,'#a88868'),B('Frenzy','🔥','frenzy',5,22,9,'#4a3a2a'),FEAR('Howl','🐺',1.8,220,24,7,'#a88868')]);
CLASSES.naturewarden = mkCls('Nature Warden','🌿','#27ae60','#a8e063',210,135,13,248,22,460,1.6,0.11,'bolt','Druid',
  [P('Thorn Whip','🌿',1.7,600,14,1.2,'#a8e063'),N("Nature's Grasp",'🌱',1.4,180,24,6,'#27ae60'),CHAINHEAL('Regrowth','🌱',0.3,4,22,7,'#a8e063')]);
CLASSES.treant       = mkCls('Treant','🌳','#4a3a1a','#a88858',280,120,11,225,28,88,1.5,0.10,'melee','Druid',
  [M('Root Slam','🌳',2.1,2.2,12,0.9,'#a88858'),SHIELD('Bark Skin','🪵',0.45,6,24,9,'#4a3a1a'),N("Forest's Wrath",'🌲',1.9,200,30,8,'#a88858')]);
CLASSES.stormdruid   = mkCls('Storm Druid','⛈','#4a7fa0','#a8e0ff',195,145,14,250,24,460,1.6,0.12,'bolt','Druid',
  [P('Storm Bolt','⚡',1.8,700,14,1.2,'#a8e0ff'),BEAM('Cyclone','🌪',1.7,420,24,6,'#4a7fa0'),R('Thunderstorm','⛈',0.9,200,32,9,'#a8e0ff')]);
CLASSES.moondruid    = mkCls('Moon Druid','🌙','#5a5a9a','#c8c8ff',200,145,14,250,23,460,1.6,0.12,'bolt','Druid',
  [HOMING('Moonfire','🌙',1.8,650,14,1.4,'#c8c8ff'),CHAINHEAL('Lunar Blessing','🌙',0.35,4,24,8,'#5a5a9a'),N('Eclipse','🌑',1.9,180,28,8,'#c8c8ff')]);
CLASSES.rootweaver   = mkCls('Rootweaver','🌱','#4a7a4a','#a8e0a8',205,135,13,248,21,460,1.6,0.11,'bolt','Druid',
  [N('Entangle','🌱',1.6,180,20,5,'#4a7a4a'),B('Thorns','🌵','damage',5,24,9,'#a8e0a8',50),GROUND('Bramble','🌿',0.8,160,5,28,7,'#4a7a4a')]);
CLASSES.archdruid    = mkCls('Archdruid','🧙','#5a7a3a','#c8e0a8',205,145,14,250,24,460,1.6,0.12,'bolt','Druid',
  [P('Nature Bolt','🌿',1.8,650,14,1.2,'#c8e0a8'),S('Force of Nature','🌳',28,9,'#5a7a3a',1,0.85,0.9),FEAR('Wrath of the Wild','🌪',1.5,240,32,9,'#c8e0a8')]);

/* DEMONS (8) */
CLASSES.demonhunter  = mkCls('Demon Hunter','🎯','#2ecc71','#9dffbf',185,115,11,262,20,520,2.1,0.15,'arrow','Demon',
  [MULTI('Multishot','⋙',0.9,5,0.14,750,18,2.4,'#9dffbf'),D('Vault','⇢',0,12,3,'#2ecc71'),R('Rain of Arrows','☔',0.75,150,34,8,'#9dffbf')]);
CLASSES.warlockdemon = mkCls('Fel Warlock','👁','#5a3a7a','#c8a8ff',175,140,13,248,24,460,1.6,0.12,'soul','Demon',
  [HOMING('Fel Bolt','👁',2.0,700,14,1.4,'#c8a8ff'),B('Fel Pact','🩸','damage',5,24,10,'#5a3a7a',60),N('Hellfire','🔥',2.0,180,30,8,'#c8a8ff')]);
CLASSES.blooddemon  = mkCls('Blood Demon','🩸','#8b0000','#ff8888',235,125,12,255,27,86,1.8,0.12,'melee','Demon',
  [LIFESTEAL('Blood Claw','🩸',1.9,0.4,12,0.9,'#ff8888'),WHIRL('Blood Rain','🌧',1.0,3,180,28,7,'#8b0000'),B('Blood Frenzy','🔥','frenzy',5,24,10,'#ff8888')]);
CLASSES.infernal    = mkCls('Infernal','🔥','#8b0000','#ff8f5a',260,120,11,248,28,88,1.7,0.11,'melee','Demon',
  [M('Flame Strike','🔥',2.0,2.2,12,0.9,'#ff8f5a'),N('Hellfire','🔥',1.9,180,26,6,'#8b0000'),LEAP('Inferno Leap','🌋',2.3,200,32,9,'#ff6b35')]);
CLASSES.voidwalker  = mkCls('Void Walker','🕳','#3a2a5a','#a888d8',190,140,13,252,25,460,1.6,0.13,'soul','Demon',
  [P('Void Bolt','🕳',1.9,700,14,1.2,'#a888d8'),N('Void Rift','🌌',1.7,180,26,6,'#3a2a5a'),PULL('Void Collapse','💫',2.2,220,32,9,'#a888d8')]);
CLASSES.shadowfiend = mkCls('Shadow Fiend','🌑','#3a3a5a','#a8a8d8',185,135,12,255,24,460,1.7,0.13,'soul','Demon',
  [P('Shadow Bolt','🌑',1.8,700,14,1.2,'#a8a8d8'),K('Shadow Walk','✧',14,3,'#3a3a5a'),N('Shadow Nova','💫',1.9,180,28,7,'#a8a8d8')]);
CLASSES.demonlord   = mkCls('Demon Lord','👑','#8b0000','#ff5050',270,125,11,248,29,90,1.7,0.12,'melee','Demon',
  [B('Command','👑','damage',5,24,10,'#ff5050',60),FEAR('Hellfire Nova','🔥',1.5,240,32,9,'#8b0000'),S('Summon Demons','😈',30,12,'#ff5050',3,0.55,0.6)]);
CLASSES.chaosfiend  = mkCls('Chaos Fiend','🌀','#6b3a7a','#c8a0e0',195,145,14,252,25,460,1.6,0.13,'bolt','Demon',
  [HOMING('Chaos Bolt','🌀',1.9,700,14,1.4,'#c8a0e0'),FEAR('Chaos Nova','💫',1.5,220,28,7,'#6b3a7a'),BEAM('Chaos Rift','🌌',2.3,450,34,9,'#c8a0e0')]);

/* ── Curated 10-class roster: each with a distinct playstyle / skill identity ──
   The full 71-class library above stays in source (zero risk to skill
   factories, bosses, cutscenes or any CLASSES.<key> reference), but only these
   10 are playable. Every dynamic consumer reads Object.keys(CLASSES) — class
   grid, allies, friends, cutscenes — so they all automatically see exactly
   these 10. Old saves that reference a cut class are handled gracefully:
   loadSaveData() returns null when CLASSES[cls] is missing, so they simply
   show as "no save" (no crash). */
/* All 71 classes across 9 Archetypes are active and playable! */
const ROSTER = Object.keys(CLASSES);
console.log('📊 ROSTER active:', ROSTER.length, 'playable classes across 9 archetypes');

/* ===== Class titles: one permanent unlock per class — stat effect + unique visual aura ===== */
const TITLES: Record<string, {name:string; icon:string; cond:string; fx:Record<string,number>; aura:string; color:string}> = {
  ironclad:    {name:'Bulwark Eternal', icon:'🛡️', cond:'reach wave 30',            fx:{hp:0.15},        aura:'shield', color:'#9fd8ff'},
  berserker:   {name:'Blood King',      icon:'🪓', cond:'100 kills in one run',     fx:{dmg:0.12},       aura:'blood',  color:'#ff5c5c'},
  assassin:    {name:'Ghost Blade',     icon:'🗡️', cond:'25 critical kills',        fx:{crit:0.06},      aura:'mist',   color:'#c9f5ff'},
  sniper:      {name:'Dead Eye',        icon:'🔭', cond:'20 kills from 400px away', fx:{atk:0.15},       aura:'tracer', color:'#ffb040'},
  beastmaster: {name:'Wolf Father',     icon:'🐺', cond:'30 pet kills',             fx:{spd:0.12},       aura:'spirit', color:'#a5e86c'},
  pyromancer:  {name:'Cinder Lord',     icon:'🔥', cond:'35 skill kills',           fx:{skill:0.25},     aura:'ember',  color:'#ff9a3d'},
  cryomancer:  {name:'Frost King',      icon:'❄️', cond:'slow 30 enemies',          fx:{critDmg:0.4},    aura:'frost',  color:'#8fe8ff'},
  bonelord:    {name:'Grave Reaper',    icon:'💀', cond:'summon 15 allies',         fx:{regen:25},       aura:'bone',   color:'#d8d0b8'},
  cleric:      {name:'Hand of Light',   icon:'✨', cond:'heal 1500 HP',             fx:{dmg:0.15},       aura:'halo',   color:'#ffe9a8'},
  dragonknight:{name:'Dragon Lord',     icon:'🐉', cond:'defeat 2 bosses',          fx:{dmg:0.1,spd:0.10},aura:'dragon', color:'#ff7a45'},
};
// Ensure all 71 classes have a unique Angkor-themed unlockable title
const AURA_POOL = ['shield','blood','mist','tracer','spirit','ember','frost','bone','halo','dragon'];
for (const k of Object.keys(CLASSES)) {
  if (!TITLES[k]) {
    const c = CLASSES[k];
    const roleFx: Record<string, Record<string, number>> = {
      Warrior: { hp: 0.12, dmg: 0.08 },
      Ranger: { atk: 0.14, crit: 0.04 },
      Mage: { skill: 0.22, regen: 15 },
      Rogue: { crit: 0.06, spd: 0.10 },
      Necromancer: { dmg: 0.12, regen: 18 },
      Healer: { hp: 0.15, regen: 18 },
      Summoner: { dmg: 0.12, spd: 0.08 },
      Druid: { hp: 0.12, skill: 0.15 },
      Demon: { dmg: 0.15, critDmg: 0.3 }
    };
    TITLES[k] = {
      name: 'Angkor ' + c.name,
      icon: c.icon || '🏛️',
      cond: 'slay 80 monsters in one run',
      fx: roleFx[c.roleTag] || { dmg: 0.12 },
      aura: AURA_POOL[Math.abs(k.charCodeAt(0) + k.length) % AURA_POOL.length],
      color: c.accent || '#ffd54f'
    };
  }
}
let TITLES_UNLOCKED: Record<string,boolean> = {};
try{ TITLES_UNLOCKED = JSON.parse(localStorage.getItem('sastra_titles_v1')||'{}') }catch{ TITLES_UNLOCKED = {} }
function saveTitles(){ try{ localStorage.setItem('sastra_titles_v1',JSON.stringify(TITLES_UNLOCKED)) }catch{} }
function fxLabel(fx:Record<string,number>){
  const L:string[]=[];
  if(fx.hp)L.push('+'+Math.round(fx.hp*100)+'% HP');
  if(fx.dmg)L.push('+'+Math.round(fx.dmg*100)+'% DMG');
  if(fx.spd)L.push('+'+Math.round(fx.spd*100)+'% SPD');
  if(fx.crit)L.push('+'+Math.round(fx.crit*100)+'% CRIT');
  if(fx.atk)L.push('+'+Math.round(fx.atk*100)+'% ATK SPD');
  if(fx.critDmg)L.push('+'+Math.round(fx.critDmg*100)+'% CRIT DMG');
  if(fx.regen)L.push('+'+fx.regen+' ENERGY');
  if(fx.skill)L.push('+'+Math.round(fx.skill*100)+'% SKILL PWR');
  return L.join(' · ');
}
function tcount(p:any,k:string,n=1){
  if(!p.tstats)p.tstats={};
  p.tstats[k]=(p.tstats[k]||0)+(n||1);
  checkTitleUnlocks(p,G);
}
function checkTitleUnlocks(p:any,g:any){
  const T=TITLES[p.cls];
  if(!T||TITLES_UNLOCKED[p.cls])return;
  const s0=p.tstats||{};
  let met=false;
  if(p.cls==='ironclad')met=(g.wave||1)>=30;
  else if(p.cls==='berserker')met=(s0.kills||0)>=100;
  else if(p.cls==='assassin')met=(s0.critKills||0)>=25;
  else if(p.cls==='sniper')met=(s0.rangeKills||0)>=20;
  else if(p.cls==='beastmaster')met=(s0.petKills||0)>=30;
  else if(p.cls==='pyromancer')met=(s0.skillKills||0)>=35;
  else if(p.cls==='cryomancer')met=(s0.slows||0)>=30;
  else if(p.cls==='bonelord')met=(s0.summons||0)>=15;
  else if(p.cls==='cleric')met=(s0.heals||0)>=1500;
  else if(p.cls==='dragonknight')met=(s0.bossKills||0)>=2;
  else met=(s0.kills||0)>=80;
  if(!met)return;
  TITLES_UNLOCKED[p.cls]=true;saveTitles();
  p.titleBonus=T.fx;p.titleName=T.name;p.titleIcon=T.icon;
  recalcStats(p);
  sfx.levelup();
  addToast(T.icon+' TITLE UNLOCKED: '+T.name,'#ffd54f',T.cond+' · '+fxLabel(T.fx)+' — permanent');
  g.texts.push({x:p.x,y:p.y-42,vy:-40,life:1.8,max:1.8,spawn:1.8,text:T.icon+' '+T.name,color:T.color,size:18});
}
function titleProgress(p:any,g:any){
  const T=TITLES[p.cls];
  if(!T)return null;
  const s0=p.tstats||{};
  let cur=0,target=80;
  switch(p.cls){
    case 'ironclad':cur=g.wave||1;target=30;break;
    case 'berserker':cur=s0.kills||0;target=100;break;
    case 'assassin':cur=s0.critKills||0;target=25;break;
    case 'sniper':cur=s0.rangeKills||0;target=20;break;
    case 'beastmaster':cur=s0.petKills||0;target=30;break;
    case 'pyromancer':cur=s0.skillKills||0;target=35;break;
    case 'cryomancer':cur=s0.slows||0;target=30;break;
    case 'bonelord':cur=s0.summons||0;target=15;break;
    case 'cleric':cur=s0.heals||0;target=1500;break;
    case 'dragonknight':cur=s0.bossKills||0;target=2;break;
    default:cur=s0.kills||0;target=80;break;
  }
  return {T,cur:Math.min(cur,target),target,unlocked:!!(TITLES_UNLOCKED[p.cls]||p.titleBonus)};
}

/* Ultimate */
const ULT_NAMES = {
  Warrior:'Cataclysm', Ranger:'Storm of Arrows', Mage:'Arcane Singularity',
  Rogue:'Shadow Strike', Necromancer:'Death Nova', Healer:'Divine Judgment',
  Summoner:'Legion Call', Druid:"Nature's Fury", Demon:'Hellfire'
};
function makeUltimateSkill(C) {
  return {
    name: ULT_NAMES[C.roleTag] || 'Apocalypse',
    icon: '★', key: '4', cost: 0, cd: 15,
    info: { desc: 'HOLD [4] to charge up to 5s. Release to unleash devastation.',
      calc: p => [
        { label:'Charge Time', value:'0 – 5 seconds', kind:'util' },
        { label:'Damage at full charge', value: Math.round(p.dmg * 6) + ' in radius 550', kind:'dmg' },
        { label:'Slow at full charge', value:'5 s' },
        { label:'Cooldown', value:'15 s' }
      ] }
  };
}

/* ═══ SKILL TREE — 6 BRANCHES ═══ */
const TREE_NODES = [
  // COUNTER (melee only)
  { id:'CM1', name:'Counter Stance', icon:'🛡', cost:1, x:8, y:9,
    desc:'+8% chance to deflect projectiles, sending 20% of the hit back to the attacker',
    meleeOnly:true, requires:[], requiresCount:0,
    apply:(p)=>{ p._deflectProj=(p._deflectProj||0)+0.08; p._deflectMult=Math.max(p._deflectMult||0,0.20); } },
  { id:'CM2', name:'Reflexive Parry', icon:'⚔', cost:1, x:8, y:25,
    desc:'+10% deflect projectiles · +4% deflect melee · 25% back',
    meleeOnly:true, requires:['CM1'], requiresCount:1,
    apply:(p)=>{ p._deflectProj+=0.10; p._deflectMelee=(p._deflectMelee||0)+0.04; p._deflectMult=Math.max(p._deflectMult||0,0.25); } },
  { id:'CM3', name:'Riposte', icon:'⚡', cost:1, x:8, y:41,
    desc:'+12% deflect proj · +8% deflect melee · 30% back',
    meleeOnly:true, requires:['CM2'], requiresCount:1,
    apply:(p)=>{ p._deflectProj+=0.12; p._deflectMelee+=0.08; p._deflectMult=Math.max(p._deflectMult||0,0.30); } },
  { id:'CM4', name:'Mirror Guard', icon:'🪞', cost:2, x:8, y:57,
    desc:'+12% deflect proj · +10% deflect melee · 40% back',
    meleeOnly:true, requires:['CM3'], requiresCount:1,
    apply:(p)=>{ p._deflectProj+=0.12; p._deflectMelee+=0.10; p._deflectMult=Math.max(p._deflectMult||0,0.40); } },
  { id:'CM5', name:'Counter Master', icon:'🌪', cost:2, x:8, y:73,
    desc:'CAPSTONE: +13% deflect proj · +13% deflect melee · 50% back. Perfect counter.',
    meleeOnly:true, requires:['CM4'], requiresCount:1,
    apply:(p)=>{ p._deflectProj+=0.13; p._deflectMelee+=0.13; p._deflectMult=Math.max(p._deflectMult||0,0.50); } },

  // SHADOW
  { id:'DG1', name:'Light Feet', icon:'👣', cost:1, x:24, y:9,
    desc:'+10% Move Speed · 15% dodge projectiles · 5% dodge melee',
    requires:[], requiresCount:0,
    apply:(p)=>{ p.baseStats.speed=Math.round(p.baseStats.speed*1.1);p._dodgeProj=(p._dodgeProj||0)+0.15;p._dodgeMelee=(p._dodgeMelee||0)+0.05; } },
  { id:'DG2', name:'Evasion', icon:'🌀', cost:1, x:24, y:25,
    desc:'+20% dodge projectiles · +10% dodge melee',
    requires:['DG1'], requiresCount:1,
    apply:(p)=>{ p._dodgeProj+=0.20;p._dodgeMelee+=0.10; } },
  { id:'DG3', name:'Shadow Step', icon:'👤', cost:1, x:24, y:41,
    desc:'+20% proj / +10% melee dodge. Dodging makes you dash sideways, leaving a trail of shadows',
    requires:['DG2'], requiresCount:1,
    apply:(p)=>{ p._dodgeProj+=0.20;p._dodgeMelee+=0.10;p._shadowStep=true; } },
  { id:'DG4', name:'Phantom Reflexes', icon:'👻', cost:2, x:24, y:57,
    desc:'+15% proj / +10% melee dodge · +10% Move Speed',
    requires:['DG3'], requiresCount:1,
    apply:(p)=>{ p._dodgeProj+=0.15;p._dodgeMelee+=0.10;p.baseStats.speed=Math.round(p.baseStats.speed*1.1); } },
  { id:'DG5', name:'Dodging Master', icon:'🌑', cost:2, x:24, y:73,
    desc:'CAPSTONE: total 90% dodge projectiles · 50% dodge melee. Longer, faster shadow dashes',
    requires:['DG4'], requiresCount:1,
    apply:(p)=>{ p._dodgeProj+=0.20;p._dodgeMelee+=0.15;p._shadowMaster=true; } },

  // SLAYER
  { id:'SL1', name:'Might', icon:'⚔', cost:1, x:40, y:9,
    desc:'+20% Damage', requires:[], requiresCount:0,
    apply:(p)=>{ p.baseStats.dmg=Math.round(p.baseStats.dmg*1.2); } },
  { id:'SL2', name:'Precision', icon:'🎯', cost:1, x:40, y:25,
    desc:'+12% Crit Chance', requires:['SL1'], requiresCount:1,
    apply:(p)=>{ p.baseStats.crit+=0.12; } },
  { id:'SL3', name:'Lethality', icon:'💥', cost:1, x:40, y:41,
    desc:'+50% Crit Damage', requires:['SL2'], requiresCount:1,
    apply:(p)=>{ p._critDmg=(p._critDmg||2)+0.5; } },
  { id:'SL4', name:'Executioner', icon:'☠', cost:2, x:40, y:57,
    desc:'+40% damage vs enemies below 30% HP', requires:['SL3'], requiresCount:1,
    apply:(p)=>{ p._executioner=true; } },
  { id:'SL5', name:"Death's Edge", icon:'🗡', cost:2, x:40, y:73,
    desc:"CAPSTONE: +10% Crit. Every crit unleashes a shockwave dealing 45% damage to nearby enemies",
    requires:['SL4'], requiresCount:1,
    apply:(p)=>{ p.baseStats.crit+=0.10;p._critNova=true; } },

  // FRIENDSHIP
  { id:'FR1', name:'First Friend', icon:'🤝', cost:1, x:56, y:9,
    desc:'Summon a hero from the roster to fight beside you. Falls? Returns after 15s',
    requires:[], requiresCount:0, apply:(p)=>{ addFriend(p,false); } },
  { id:'FR2', name:'Second Friend', icon:'👫', cost:1, x:56, y:25,
    desc:'Summon another hero to fight beside you', requires:['FR1'], requiresCount:1,
    apply:(p)=>{ addFriend(p,false); } },
  { id:'FR3', name:'Third Friend', icon:'👨‍👩‍👦', cost:1, x:56, y:41,
    desc:'Summon a third hero to fight beside you', requires:['FR2'], requiresCount:1,
    apply:(p)=>{ addFriend(p,false); } },
  { id:'FR4', name:'Fourth Friend', icon:'🫂', cost:2, x:56, y:57, locked:true,
    desc:'LOCKED: too powerful. Friendship stops at three friends', requires:['FR3'], requiresCount:1,
    apply:(p)=>{ addFriend(p,false); } },
  { id:'FR5', name:'Best Friend', icon:'💖', cost:2, x:56, y:73, locked:true,
    desc:'LOCKED: too powerful. This capstone cannot be unlocked',
    requires:['FR4'], requiresCount:1,
    apply:(p)=>{ p._friendBond=true;addFriend(p,true); } },

  // BULWARK
  { id:'JG1', name:'Vitality', icon:'❤', cost:1, x:72, y:9,
    desc:'+25% Max HP', requires:[], requiresCount:0,
    apply:(p)=>{ p.baseStats.maxHp=Math.round(p.baseStats.maxHp*1.25); } },
  { id:'JG2', name:'Warding', icon:'🛡', cost:1, x:72, y:25,
    desc:'+40 Armor · +1 Regen', requires:['JG1'], requiresCount:1,
    apply:(p)=>{ p.baseStats.armor+=40;p.baseStats.energyRegen+=1; } },
  { id:'JG3', name:'Regeneration', icon:'🌿', cost:1, x:72, y:41,
    desc:'Heal 1% Max HP per second', requires:['JG2'], requiresCount:1,
    apply:(p)=>{ p._regenPct=(p._regenPct||0)+0.01; } },
  { id:'JG4', name:'Undying', icon:'⚱', cost:2, x:72, y:57,
    desc:'Below 25% HP: take 50% less damage', requires:['JG3'], requiresCount:1,
    apply:(p)=>{ p._undying=true; } },
  { id:'JG5', name:'Last Stand', icon:'🏰', cost:2, x:72, y:73,
    desc:'CAPSTONE: Once every 90s, a lethal hit instead leaves you at 40% HP with 3s invulnerability',
    requires:['JG4'], requiresCount:1,
    apply:(p)=>{ p._lastStand=true; } },

  // BLOODTHIRST
  { id:'VP1', name:'Blood Tithe', icon:'🩸', cost:1, x:88, y:9,
    desc:'Basic attacks lifesteal 6%', requires:[], requiresCount:0,
    apply:(p)=>{ p._lifesteal=(p._lifesteal||0)+0.06; } },
  { id:'VP2', name:'Frostfire', icon:'❄', cost:1, x:88, y:25,
    desc:'Basic attacks slow enemies', requires:['VP1'], requiresCount:1,
    apply:(p)=>{ p._frostfire=true; } },
  { id:'VP3', name:'Crimson Pact', icon:'📜', cost:1, x:88, y:41,
    desc:'+15% Damage · +6% lifesteal', requires:['VP2'], requiresCount:1,
    apply:(p)=>{ p.baseStats.dmg=Math.round(p.baseStats.dmg*1.15);p._lifesteal+=0.06; } },
  { id:'VP4', name:'Soul Harvest', icon:'👁', cost:2, x:88, y:57,
    desc:'Kills heal 3% Max HP', requires:['VP3'], requiresCount:1,
    apply:(p)=>{ p._killHeal=0.03; } },
  { id:'VP5', name:'Vampire Lord', icon:'🧛', cost:2, x:88, y:73,
    desc:'CAPSTONE: lifesteal +8% (20% total) · kills heal 8% Max HP',
    requires:['VP4'], requiresCount:1,
    apply:(p)=>{ p._lifesteal+=0.08;p._killHeal=0.08; } },

  // ULTIMATE
  { id:'ULT', name:'ULTIMATE', icon:'★', cost:3, x:48, y:91,
    desc:'Unlock the 4th spell (hold [4] to charge). Requires any 2 branch capstones',
    requires:['CM5','DG5','SL5','FR5','JG5','VP5'], requiresCount:2,
    apply:(p)=>{ p.hasUltimate = true; } }
];

/* Branch limit: a build may only invest in MAX_BRANCHES of the six branches (ULTIMATE is exempt) */
const MAX_BRANCHES = 2;
function treeBranchesUsed(p) {
  const out = [];
  for (const id of p.treeUnlocked) { if (id === 'ULT') continue; const b = id.slice(0, 2); if (!out.includes(b)) out.push(b); }
  return out;
}
function treeBranchBlocked(node, p) {
  if (node.id === 'ULT') return false;
  const used = treeBranchesUsed(p);
  return !used.includes(node.id.slice(0, 2)) && used.length >= MAX_BRANCHES;
}
function isTreeNodeAvailable(node, p) {
  if (node.locked) return false;
  if (treeBranchBlocked(node, p)) return false;
  if (node.meleeOnly && CLASSES[p.cls] && CLASSES[p.cls].basic !== 'melee') return false;
  if (p.treeUnlocked.includes(node.id)) return false;
  if (p.treePoints < node.cost) return false;
  if (node.requires && node.requires.length > 0) {
    const met = p.treeUnlocked.filter(id => node.requires.includes(id)).length;
    if (met < node.requiresCount) return false;
  }
  return true;
}
function applyTreeNode(nodeId) {
  if (!G || !G.player) return;
  const p = G.player;
  const node = TREE_NODES.find(n => n.id === nodeId);
  if (!node) return;
  if (node.meleeOnly && CLASSES[p.cls] && CLASSES[p.cls].basic !== 'melee') {
    addToast('Melee classes only', '#ef4444', ''); return;
  }
  if (p.treeUnlocked.includes(nodeId)) return;
  if (node.locked) { addToast('Locked', '#ef4444', 'This skill cannot be unlocked'); return; }
  if (treeBranchBlocked(node, p)) { addToast('Branch locked', '#ef4444', 'You can only invest in ' + MAX_BRANCHES + ' branches'); return; }
  if (p.treePoints < node.cost) { addToast('Not enough points', '#ef4444', ''); return; }
  if (node.requires && node.requires.length > 0) {
    const met = p.treeUnlocked.filter(id => node.requires.includes(id)).length;
    if (met < node.requiresCount) { addToast('Requires '+node.requiresCount+' nodes', '#ef4444', ''); return; }
  }
  p.treePoints -= node.cost;
  sfx.ui();
  p.treeUnlocked.push(nodeId);
  node.apply(p);
  recalcStats(p);
  addToast('UNLOCKED: ' + node.name, '#7aff9a', node.desc);
  refreshTreeUI();
  updateHUD(G);
}

/* Save */
const SAVE_KEY = 'sastra_dungeon_save_v6';
const LEGACY_SAVE_KEY = 'shadowrift_save_v6'; // one-time migration from the original prototype
let itemIdCounter = 0;
function saveGamePayload(g) {
  if (!g || !g.player) return null;
  const p = g.player;
  const save = {
    version: 6, cls: p.cls, level: p.level, xp: p.xp, xpNext: p.xpNext,
    tstats: p.tstats||{}, titleName: p.titleName||'', titleIcon: p.titleIcon||'',
    baseStats: { ...p.baseStats },
    treeMods: {
      _critDmg: p._critDmg||2, _executioner: !!p._executioner,
      _cdr: p._cdr||0, _skillPower: p._skillPower||0,
      _regenPct: p._regenPct||0, _undying: !!p._undying,
      _echo: p._echo||0, _lifesteal: p._lifesteal||0,
      _aegis: !!p._aegis, _frostfire: !!p._frostfire,
      _dodgeProj: p._dodgeProj||0, _dodgeMelee: p._dodgeMelee||0, _shadowStep: !!p._shadowStep, _shadowMaster: !!p._shadowMaster,
      _critNova: !!p._critNova, _refund: p._refund||0, _killHeal: p._killHeal||0, _lastStand: !!p._lastStand,
      _friends: (p._friends||[]).map(f => ({ cls: f.cls, champ: !!f.champ })), _friendBond: !!p._friendBond,
      _deflectProj: p._deflectProj||0, _deflectMelee: p._deflectMelee||0, _deflectMult: p._deflectMult||0
    },
    equipment: { weapon:p.equipment.weapon, helm:p.equipment.helm, chest:p.equipment.chest,
      gloves:p.equipment.gloves, boots:p.equipment.boots, ring:p.equipment.ring, amulet:p.equipment.amulet },
    inventory: p.inventory.slice(),
    wave: g.wave + (g.betweenWaves ? 1 : 0),
    kills: g.kills, hp: p.hp, energy: p.energy, gold: p.gold || 0,
    potions: p.potions || 0,
    treePoints: p.treePoints, treeUnlocked: p.treeUnlocked.slice(), hasUltimate: p.hasUltimate,
    upg: { ...(p.upg||{}) },
    attrs: { ...(p.attrs||{str:0,vit:0,agi:0,wis:0,lck:0}) },
    skillLvls: (p.skills||[]).map(s => s.lvl || 1),
    skillEvo: (p.skills||[]).map(s => s.evo ? 1 : 0),
    ascended: !!p._ascended,
    relics: (p.relics||[]).slice(0,3),
    itemIdCounter, savedAt: Date.now()
  };
  return save;
}
let cloudSyncTimer: ReturnType<typeof setTimeout> | null = null;
function queueCloudSync() {
  if (!auth.currentUser) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    cloudSyncTimer = null;
    if (!auth.currentUser) return;
    const save = loadSaveData();
    if (!save) return;
    let best: any = null;
    try { best = JSON.parse(localStorage.getItem('sd_best') || 'null'); } catch {}
    syncSaveToCloud(save, TITLES_UNLOCKED, best, META).catch(() => {});
  }, 2500);
}
function saveGame() {
  if (!G || !G.player) return false;
  const save = saveGamePayload(G);
  if (!save) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    queueCloudSync();
    return true;
  }
  catch (e) { return false; }
}
function loadSaveData() {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { try { raw = localStorage.getItem(LEGACY_SAVE_KEY); if (raw) localStorage.removeItem(LEGACY_SAVE_KEY); } catch (e) {} }
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data) return null;
    if (!CLASSES[data.cls]) return null;
    return data;
  } catch (e) { return null; }
}
function deleteSave(){try{localStorage.removeItem(SAVE_KEY)}catch(e){}}

function resumeFromSave(data, silent:any = false) {
  if (!data || !CLASSES[data.cls]) return;
  window.__coreStart(data.cls);
  const p = G.player, C = CLASSES[data.cls];
  p.level = data.level || 1;
  p.xp = data.xp || 0;
  p.xpNext = data.xpNext || 100;
  p.tstats = data.tstats || {};
  if(TITLES_UNLOCKED[p.cls]&&TITLES[p.cls]){p.titleBonus=TITLES[p.cls].fx;p.titleName=TITLES[p.cls].name;p.titleIcon=TITLES[p.cls].icon;}
  else{p.titleBonus=null;p.titleName=data.titleName||'';p.titleIcon=data.titleIcon||'';}
  p.baseStats = { dmg:C.dmg, maxHp:C.hp, armor:0, speed:C.speed, crit:C.crit, energyRegen:C.energyRegen, maxEnergy:C.energy, atkSpeed:C.atkSpeed, range:C.range, ...(data.baseStats||{}) };
  p.upg = { ...UPG_EMPTY, ...(data.upg||{}) };
  p.attrs = { str:0, vit:0, agi:0, wis:0, lck:0, ...(data.attrs||{}) };
  if (Array.isArray(data.skillLvls) && p.skills) {
    p.skills.forEach((s, idx) => { s.lvl = clamp(data.skillLvls[idx] || 1, 1, 5); });
  }
  p.relics = sanitizeRelics(data.relics);
  p._ascended = !!data.ascended;
  if(Array.isArray(data.skillEvo) && p.skills){
    p.skills.forEach((sk, idx) => {
      if(!data.skillEvo[idx]) return;
      sk.evo = true; sk.lvl = 6; sk.evoDmg = 0.45; sk.color = '#ffd76a';
      sk.baseCd = (sk.baseCd || 1) * 0.85;
      if(!/^☀ /.test(sk.name)) sk.name = '☀ ' + sk.name;
    });
  }
  if (data.treeMods) {
    const m = data.treeMods;
    p._critDmg = m._critDmg||2; p._executioner = !!m._executioner;
    p._cdr = m._cdr||0; p._skillPower = m._skillPower||0;
    p._regenPct = m._regenPct||0; p._undying = !!m._undying;
    p._echo = m._echo||0; p._lifesteal = m._lifesteal||0;
    p._aegis = !!m._aegis; p._frostfire = !!m._frostfire;
    p._dodgeProj = m._dodgeProj||0; p._dodgeMelee = m._dodgeMelee||0; p._shadowStep = !!m._shadowStep; p._shadowMaster = !!m._shadowMaster;
    p._critNova = !!m._critNova; p._refund = m._refund||0; p._killHeal = m._killHeal||0; p._lastStand = !!m._lastStand;
    p._friends = (m._friends||[]).filter(f => CLASSES[f.cls]).map(f => ({ cls: f.cls, champ: !!f.champ, timer: 0 })); p._friendBond = !!m._friendBond;
    p._deflectProj = m._deflectProj||0; p._deflectMelee = m._deflectMelee||0; p._deflectMult = m._deflectMult||0;
  }
  p.equipment = { weapon:null, helm:null, chest:null, gloves:null, boots:null, ring:null, amulet:null, ...(data.equipment||{}) };
  p.inventory = Array.isArray(data.inventory) ? data.inventory.slice() : [];
  p.treePoints = data.treePoints || 0;
  p.treeUnlocked = Array.isArray(data.treeUnlocked) ? data.treeUnlocked.slice() : [];
  { // old Arcane branch was replaced by Friendship: refund its points and undo its bonuses
    const AR = { AR1:1, AR2:1, AR3:1, AR4:2, AR5:2 }; let back = 0;
    p.treeUnlocked = p.treeUnlocked.filter(id => {
      if (!AR[id]) return true;
      back += AR[id];
      if (id === 'AR1') { p.baseStats.energyRegen -= 2; p.baseStats.maxEnergy = (p.baseStats.maxEnergy||0) - 20; }
      return false;
    });
    if (back) { p.treePoints += back; p._echo = 0; p._refund = 0; p._cdr = 0; p._skillPower = 0; }
  }
  p.hasUltimate = !!data.hasUltimate;
  recalcStats(p);
  p.hp = Math.min(data.hp || p.maxHp, p.maxHp);
  p.energy = Math.min(data.energy || p.maxEnergy, p.maxEnergy);
  p.potions = data.potions || 0;
  p.gold = (typeof data.gold === 'number') ? data.gold : 0;
  if (typeof data.itemIdCounter === 'number') itemIdCounter = data.itemIdCounter;
  G.wave = Math.max(0, (data.wave||1) - 1);
  G.kills = data.kills || 0;
  G.betweenWaves = true;
  G.waveTimer = 1.5;
  document.getElementById('killTxt').textContent = G.kills + ' kills';
  const resumeBiome = getBiomeForWave(Math.max(1, G.wave + 1));
  G.currentBiomeKey = resumeBiome.key;
  G.lastBiomeKey = resumeBiome.key;
  setFloorForBiome(resumeBiome.key);
  respawnDustForBiome(resumeBiome.key);
  updateBiomeLabel();
  buildSkillbar(p);
  refreshShopStock(G);
  if(!silent)addToast('SAVE LOADED', '#7aff9a', `Level ${p.level} ${C.name} · Wave ${Math.max(1,data.wave||1)}`);
}
/* crash log: one button in settings, so a player can hand us something useful */
try{
  const copyBtn = document.getElementById('copyCrashes');
  const countEl = document.getElementById('crashCount');
  const paint = () => { try{ const n = readErrors().length; if(countEl) countEl.textContent = String(n); }catch(e){} };
  paint();
  if(copyBtn) copyBtn.addEventListener('click', async () => {
    const list = readErrors();
    const text = list.length ? JSON.stringify(list, null, 2) : 'No crashes recorded on this device.';
    try { await navigator.clipboard.writeText(text); copyBtn.textContent = 'COPIED'; }
    catch { console.log(text); copyBtn.textContent = 'LOGGED'; }
    setTimeout(()=>{ copyBtn.textContent = 'COPY'; }, 1800);
  });
  setInterval(paint, 4000);
}catch(e){}

function refreshContinuePanel() {
  const panel = document.getElementById('continuePanel');
  if (!panel) return;
  const data = loadSaveData();
  if (!data) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  const C = CLASSES[data.cls];
  if (!C) { panel.classList.add('hidden'); return; }
  const wave = Math.max(1, data.wave||1);
  const biome = getBiomeForWave(wave);
  const treeInfo = data.hasUltimate ? ' · ★' : '';
  document.getElementById('continueDetail').innerHTML =
    `<b style="color:${C.color}">Level ${data.level||1} ${C.name}</b> · ${biome.name} · Wave ${wave}${treeInfo}`;
}

/* ═══ AUTO-PLAY (SMART) ═══ */
const autoPlay = { enabled: false, castTimer: 0, treeTimer: 0 };

// Ranged/caster default — damage → survivability → combos
const AUTO_TREE_PRIORITY_RANGED = ['SL1','SL2','SL3','JG1','JG2','JG3','SL4','JG4','SL5','JG5','ULT','FR1','FR2','FR3','FR4','FR5','VP1','VP2','VP3','VP4','VP5','DG1','DG2','DG3','DG4','DG5'];

// Melee default — interleave SHADOW + COUNTER + SLAYER for max reflect combo
const AUTO_TREE_PRIORITY_MELEE  = ['DG1','DG2','DG3','SL1','DG4','CM1','SL2','CM2','DG5','CM3','SL3','CM4','JG1','CM5','ULT','JG2','JG3','SL4','JG4','SL5','JG5','FR1','FR2','FR3','FR4','FR5','VP1','VP2','VP3','VP4','VP5'];

// Skill classification regexes
const SK_HEAL   = /heal|restore|regen|renew|rejuvenate|revive|mend|grove|radiance|inner peace|soul harvest|soul drain|drain life|^rise\b|undying|blessing|foresight/i;
const SK_DEF    = /aegis|bulwark|fortify|ward|barrier|wall|barkskin|bark skin|stone.?skin|bear hide|unstoppable|unyielding|parry|reflect|invuln|armor|shield of faith|nature's shield|divine shield/i;
const SK_BUFF   = /frenzy|rage|focus|adrenaline|haste|zen|pact|empower|command|war horn|rally|roar/i;
const SK_SUMMON = /summon|^call|raise|force of nature|falcon|golem|^imp\b|wolf|spider|skeleton|drake|clone|spirit/i;
const SK_CC     = /fear|freeze|howl|nova|stun|cyclone|storm|quake|tempest|whirl/i;
const SK_SAC    = /sacrifice|offering|detonation/i;
const SK_AOE    = /nova|wave|explosion|burst|slam|whirl|storm|cyclone|quake|roar|tempest/i;

function toggleAutoPlay() {
  autoPlay.enabled = !autoPlay.enabled;
  updateAutoPlayBadge();
  addToast(autoPlay.enabled ? '🤖 AUTO-PLAY ON' : 'AUTO-PLAY OFF',
    autoPlay.enabled ? '#7aff9a' : '#a89886', 'Press O to toggle');
}

function updateAutoPlayBadge() {
  const el = document.getElementById('autoplayBadge');
  if (!el) return;
  if (G && G.running && autoPlay.enabled) {
    el.style.display = 'block';
    el.classList.remove('off');
    el.textContent = '🤖 AUTO-PLAY';
  } else if (G && G.running) {
    el.style.display = 'block';
    el.classList.add('off');
    el.textContent = '○ AUTO-PLAY OFF';
  } else {
    el.style.display = 'none';
  }
}

function autoSpendTreePoints(p) {
  if (p.treePoints <= 0) return;
  const isMelee = CLASSES[p.cls] && CLASSES[p.cls].basic === 'melee';
  const list = isMelee ? AUTO_TREE_PRIORITY_MELEE : AUTO_TREE_PRIORITY_RANGED;
  for (const id of list) {
    const node = TREE_NODES.find(n => n.id === id);
    if (!node) continue;
    if (isTreeNodeAvailable(node, p)) {
      applyTreeNode(node.id);
      return;
    }
  }
}

function updateAutoPlay(dt, g) {
  const p = g.player;
  const enemies = g.enemies.filter(e => !e.dead);
  p.autoAttack = true;

  // Auto-spend tree points
  autoPlay.treeTimer += dt;
  if (autoPlay.treeTimer > 0.5 && p.treePoints > 0) {
    autoPlay.treeTimer = 0;
    autoSpendTreePoints(p);
  }

  if (enemies.length === 0) {
    p.moveTarget = null;
    return;
  }

  // ── ANALYSIS ──
  let nearest = null, nearestDist = Infinity, closeCount = 0;
  for (const e of enemies) {
    const d = dist(p, e);
    if (d < nearestDist) { nearestDist = d; nearest = e; }
    if (d < 250) closeCount++;
  }

  // Aim at nearest (for cursor-targeted skills and basic attacks)
  p.facing = Math.atan2(nearest.y - p.y, nearest.x - p.x);
  mouse.x = nearest.x - g.cam.x + W/2;
  mouse.y = nearest.y - g.cam.y + H/2;

  const hpPct = p.hp / p.maxHp;
  const isRanged = CLASSES[p.cls].basic !== 'melee';
  const attackRange = isRanged ? p.range : p.range + nearest.r;
  const desiredRange = isRanged ? attackRange * 0.65 : attackRange * 0.5;

  // ── ULTIMATE ──
  if (p.hasUltimate && p.ultCooldown <= 0) {
    if (!p.chargingUlt) {
      const shouldCharge = closeCount >= 2 || nearest.boss || (hpPct < 0.5 && nearestDist < 400);
      if (shouldCharge) { p.chargingUlt = true; p.chargeTime = 0; }
    } else {
      const readyToFire = p.chargeTime >= 1.8 || hpPct < 0.25;
      if (readyToFire) {
        castUltimate(p, g, Math.min(p.chargeTime / 5, 1));
        p.chargingUlt = false;
        p.chargeTime = 0;
        p.ultCooldown = 15;
      }
    }
  }

  // ── MOVEMENT ──
  if (hpPct < 0.4) {
    // Panic flee — pick safest direction
    let bestAng = Math.atan2(p.y - nearest.y, p.x - nearest.x);
    let bestScore = -Infinity;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      const tx = p.x + Math.cos(a) * 240;
      const ty = p.y + Math.sin(a) * 240;
      if (tx < 60 || tx > WORLD.w - 60 || ty < 60 || ty > WORLD.h - 60) continue;
      let minD = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(tx - e.x, ty - e.y);
        if (d < minD) minD = d;
      }
      if (minD > bestScore) { bestScore = minD; bestAng = a; }
    }
    p.moveTarget = {
      x: clamp(p.x + Math.cos(bestAng) * 260, 40, WORLD.w - 40),
      y: clamp(p.y + Math.sin(bestAng) * 260, 40, WORLD.h - 40)
    };
  } else if (isRanged) {
    if (nearestDist < desiredRange * 0.65) {
      const awayA = Math.atan2(p.y - nearest.y, p.x - nearest.x);
      p.moveTarget = {
        x: clamp(p.x + Math.cos(awayA) * 160, 40, WORLD.w - 40),
        y: clamp(p.y + Math.sin(awayA) * 160, 40, WORLD.h - 40)
      };
    } else if (nearestDist > attackRange * 0.9) {
      p.moveTarget = { x: nearest.x, y: nearest.y };
    } else {
      const sideA = Math.atan2(nearest.y - p.y, nearest.x - p.x) + Math.PI / 2;
      const strafe = Math.sin(G.time * 1.2) > 0 ? 1 : -1;
      p.moveTarget = {
        x: clamp(p.x + Math.cos(sideA) * 50 * strafe, 40, WORLD.w - 40),
        y: clamp(p.y + Math.sin(sideA) * 50 * strafe, 40, WORLD.h - 40)
      };
    }
  } else {
    if (nearestDist > attackRange * 0.75) {
      const approachA = Math.atan2(nearest.y - p.y, nearest.x - p.x);
      const stopDist = attackRange * 0.6;
      p.moveTarget = {
        x: clamp(nearest.x - Math.cos(approachA) * stopDist, 40, WORLD.w - 40),
        y: clamp(nearest.y - Math.sin(approachA) * stopDist, 40, WORLD.h - 40)
      };
    } else {
      p.moveTarget = null;
    }
  }

  // ── SKILLS ──
  autoPlay.castTimer += dt;
  if (autoPlay.castTimer < 0.12) return;

  const ready = [];
  for (let i = 0; i < p.skills.length; i++) {
    const s = p.skills[i];
    if (s.cd > 0 || p.energy < s.cost) continue;
    const nm = s.name;
    const cat = {
      idx: i, nm, s,
      heal:   SK_HEAL.test(nm),
      def:    SK_DEF.test(nm),
      buff:   SK_BUFF.test(nm),
      summon: SK_SUMMON.test(nm),
      cc:     SK_CC.test(nm),
      sac:    SK_SAC.test(nm),
      aoe:    SK_AOE.test(nm),
      hasDmg: false
    };
    try {
      if (s.info && typeof s.info.calc === 'function') {
        const rows = s.info.calc(p);
        for (const r of rows) if (r.kind === 'dmg') cat.hasDmg = true;
      }
    } catch (e) {}
    if (!cat.hasDmg && !cat.heal && !cat.buff && !cat.def && !cat.summon && !cat.cc && !cat.sac) continue;
    ready.push(cat);
  }

  const fire = (x) => { tryCast(x.idx); autoPlay.castTimer = 0; };

  // 1. EMERGENCY heal / shield below 35%
  if (hpPct < 0.35) {
    const h = ready.find(x => x.heal);
    if (h) { fire(h); return; }
    const d = ready.find(x => x.def);
    if (d) { fire(d); return; }
    const cc = ready.find(x => x.cc);
    if (cc && closeCount >= 2) { fire(cc); return; }
  }

  // 2. CC/AoE when swarmed
  if (closeCount >= 3) {
    const cc = ready.find(x => x.cc);
    if (cc) { fire(cc); return; }
    const aoe = ready.find(x => x.aoe);
    if (aoe) { fire(aoe); return; }
  }

  // 3. Buff up before engaging
  if (hpPct > 0.6 && nearestDist < 500) {
    const b = ready.find(x => x.buff);
    if (b) { fire(b); return; }
  }

  // 4. Summon when no minions
  if (g.minions.filter(x => !x.ally).length === 0) {
    const s = ready.find(x => x.summon);
    if (s) { fire(s); return; }
  }

  // 5. Sacrifice minions for burst
  if (g.minions.filter(x => !x.ally).length > 0 && nearestDist < 300) {
    const s = ready.find(x => x.sac);
    if (s) { fire(s); return; }
  }

  // 6. Heal at mid HP
  if (hpPct < 0.55) {
    const h = ready.find(x => x.heal);
    if (h) { fire(h); return; }
  }

  // 7. Offensive skills
  if (nearestDist < 700) {
    const offensive = ready.filter(x => !x.heal && !x.buff && !x.summon && !x.sac && (x.hasDmg || x.cc || x.aoe));
    if (offensive.length > 0) {
      const pk = offensive[offensive.length - 1];
      fire(pk);
    }
  }
}

/* Input */
const mouse = { x:W/2, y:H/2, down:false };
const keys = {};

/* ═══ GAMEPAD ═══
   Left stick / d-pad move, face buttons fire skills, Start pauses. Buttons are
   translated into the same key events the keyboard produces, so a pad can never
   drift out of sync with the binding logic. */
const PAD = { x:0, y:0, prev:{}, id:null, active:false };
const PAD_MAP = { 0:'1', 1:'2', 2:'3', 3:'4', 4:'q', 5:'q', 9:'escape' };
function pollGamepad(){
  const list = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
  let gp = null;
  for (const p of list) if (p && p.connected) { gp = p; break; }
  if (!gp){ PAD.x = 0; PAD.y = 0; PAD.active = false; return; }
  if (!PAD.active){ PAD.active = true; PAD.id = gp.id; addToast('🎮 GAMEPAD','#7aff9a',gp.id.slice(0,42)); }
  const dz = 0.24;
  let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
  if (Math.hypot(x, y) < dz) { x = 0; y = 0; }
  if (gp.buttons[14] && gp.buttons[14].pressed) x = -1;
  if (gp.buttons[15] && gp.buttons[15].pressed) x = 1;
  if (gp.buttons[12] && gp.buttons[12].pressed) y = -1;
  if (gp.buttons[13] && gp.buttons[13].pressed) y = 1;
  PAD.x = Math.max(-1, Math.min(1, x));
  PAD.y = Math.max(-1, Math.min(1, y));
  for (const idx in PAD_MAP){
    const b = gp.buttons[idx];
    const down = !!(b && b.pressed);
    if (down && !PAD.prev[idx]) {
      try { window.dispatchEvent(new KeyboardEvent('keydown', { key: PAD_MAP[idx], bubbles: true })); } catch(e){}
    }
    PAD.prev[idx] = down;
  }
}
window.addEventListener('gamepadconnected', () => { PAD.active = false; try{ sfx.ui(); }catch(e){} });
canvas.addEventListener('mousemove',e=>{
  mouse.x=e.clientX;mouse.y=e.clientY;
  if(mouse.down&&G&&G.running&&G.player&&!G.paused&&!cutscene.active){
    const w=screenToWorld(mouse.x,mouse.y);
    G.player.moveTarget={x:w.x,y:w.y};
  }
});
canvas.addEventListener('mousedown',e=>{
  if(!G||!G.running||!G.player||G.paused||cutscene.active)return;
  if(e.button===0){
    mouse.down=true;
    const w=screenToWorld(mouse.x,mouse.y);
    G.player.moveTarget={x:w.x,y:w.y};
  } else if(e.button===2){
    e.preventDefault();
    G.player.autoAttack=!G.player.autoAttack;
    G.fx.push({type:'ring',x:G.player.x,y:G.player.y,r:60,life:.45,max:.45,color:G.player.autoAttack?'#ff8f2e':'#8c7a63'});
    updateAutoBadge();
    addToast(G.player.autoAttack?'AUTO-ATTACK ON':'AUTO-ATTACK OFF', G.player.autoAttack?'#ff8f2e':'#a89886', 'Right-click to toggle');
  }
});
window.addEventListener('mouseup',e=>{if(e.button===0)mouse.down=false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(!G||!G.running){if(upgState.open)closeUpgradePanel();return}
  if(cutscene.active){
    if(k===' '||k==='enter'){e.preventDefault();skipCutscene();}
    return;
  }
  if(upgState.open){
    const ui=['1','2','3','4'].indexOf(k);
    if(ui>=0&&ui<upgState.opts.length){e.preventDefault();chooseUpgrade(ui);return}
    if(k==='escape'){e.preventDefault();chooseUpgrade(0);return}
    if(k==='r'&&(G.player._rerolls||0)>0){e.preventDefault();G.player._rerolls--;openUpgradePanel(G);addToast('🎲 REROLL','#ffd54f',(G.player._rerolls)+' left this run');return}
    return;
  }
  if(keys[k])return;
  keys[k]=true;
  if(k==='escape'){
    if(tree.open){toggleTree();return}
    if(inv.open){toggleInventory();return}
    togglePause();return;
  }
  if(k==='c'||k==='i'){if(!G.pauseMenu&&!tree.open){e.preventDefault();toggleInventory()}return}
  if(k==='b'){if(!G.pauseMenu&&!tree.open){e.preventDefault();toggleInventory('shop')}return}
  if(k==='t'||k==='p'){if(!G.pauseMenu&&!inv.open){e.preventDefault();toggleTree()}return}
  if(G.paused)return;
  if(k==='o'){e.preventDefault();toggleAutoPlay();return}
  if(k==='q'){e.preventDefault();drinkPotion();return}
  if(k==='4'){
    if(G.player.hasUltimate&&!G.player.chargingUlt&&G.player.ultCooldown<=0){
      G.player.chargingUlt=true;G.player.chargeTime=0;
    }
    return;
  }
  const i=['1','2','3'].indexOf(k);
  if(i>=0){e.preventDefault();tryCast(i)}
});
window.addEventListener('keyup',e=>{
  const k=e.key.toLowerCase();
  keys[k]=false;
  if(!G||!G.running||!G.player)return;
  if(k==='4'&&G.player.chargingUlt){
    const chargePct=Math.min(G.player.chargeTime/5,1);
    castUltimate(G.player,G,chargePct);
    G.player.chargingUlt=false;G.player.chargeTime=0;G.player.ultCooldown=15;
  }
});
let bgTickTimer=null, bgLastWall=0, wentHiddenAt=0;
function bgTick(){
  if(!G||!G.running||G.paused){ if(bgTickTimer){clearInterval(bgTickTimer);bgTickTimer=null} return; }
  const now=performance.now();
  let left=Math.min(2.0,(now-bgLastWall)/1000);   /* throttled tabs tick ~1/s */
  bgLastWall=now;
  let guard=0;
  while(left>0.0001 && guard<60){ const d=Math.min(0.05,left); stepWorld(d); left-=d; guard++; }
}
document.addEventListener('visibilitychange',()=>{
  /* autoPause is a player setting: some people want the run to hold when they
     alt-tab or switch apps, others want it to keep ticking. */
  if(document.hidden){
    if(SETTINGS.autoPause&&G&&G.running&&!G.paused&&!G.pauseMenu&&!cutscene.active&&G.player)togglePause();
    else if(!SETTINGS.autoPause&&G&&G.running&&!G.paused){
      bgLastWall=performance.now(); wentHiddenAt=bgLastWall;
      if(!bgTickTimer)bgTickTimer=setInterval(bgTick,250);
    }
  } else {
    if(bgTickTimer){clearInterval(bgTickTimer);bgTickTimer=null}
    /* browsers suspend hidden tabs outright; replay the gap (capped) so the run
       really did keep playing instead of freezing on the last frame */
    if(wentHiddenAt && !SETTINGS.autoPause && G && G.running && !G.paused){
      let left=Math.min(10,(performance.now()-wentHiddenAt)/1000), guard=0;
      while(left>0.0001 && guard<240){ const d=Math.min(0.05,left); stepWorld(d); left-=d; guard++; }
    }
    wentHiddenAt=0;
  }
});
function screenToWorld(sx,sy){return {x:(sx-W/2)/ZOOM+G.cam.x, y:(sy-H/2)/ZOOM+G.cam.y}}
function updateAutoBadge(){
  const el=document.getElementById('autoBadge');
  if(!el)return;
  if(G&&G.player&&G.player.autoAttack){el.style.display='block';el.classList.remove('off');el.textContent='◉ AUTO-ATTACK'}
  else if(G&&G.player){el.style.display='block';el.classList.add('off');el.textContent='○ AUTO-OFF'}
  else el.style.display='none';
}
function updateBiomeLabel(){
  const el=document.getElementById('biomeLabel');
  if(!el||!G)return;
  const b=getBiomeForWave(Math.max(1,G.wave));
  el.textContent='◆ '+b.name.toUpperCase()+' ◆';
}

/* Floor */
/* ═══ DIFFICULTY ═══ */
const DIFFS={
  easy:{key:'easy',hp:0.75,dmg:0.70,xp:1.10,gold:1.25},
  normal:{key:'normal',hp:1.00,dmg:1.00,xp:1.00,gold:1.00},
  hard:{key:'hard',hp:1.30,dmg:1.50,xp:1.25,gold:1.50},
};
let diffKey='normal';
try{diffKey=localStorage.getItem('sd_diff')||'normal';if(!DIFFS[diffKey])diffKey='normal'}catch(e){}
function setDiff(k){diffKey=DIFFS[k]?k:'normal';try{localStorage.setItem('sd_diff',diffKey)}catch(e){}updateDiffUI();}
function updateDiffUI(){
  document.querySelectorAll('#diffSel .diff-opt').forEach(b=>b.classList.toggle('active',b.dataset.diff===diffKey));
  const l=document.getElementById('diffLabel');if(l)l.textContent='DIFFICULTY: '+diffKey.toUpperCase();
}
export let G: any = null;
Object.defineProperty(window,'G',{get:()=>G,configurable:true});
let floorCanvas = null, floorCtx = null, torches = [];
const floorCache = {};
let currentFloorBiome = null;
const TORCH_POSITIONS = [
  {x:500,y:500},{x:2300,y:500},{x:500,y:1600},{x:2300,y:1600},
  {x:1400,y:300},{x:1400,y:1800},{x:900,y:1050},{x:1900,y:1050},
  {x:700,y:800},{x:2100,y:1300}
];
const BIOME_DUST = {
  crypt:{vx:[-14,14],vy:[-28,-6],size:[0.6,2.1],colors:['#ffd88a','#c8b8a0','#ffcc88'],glow:false},
  caverns:{vx:[-10,10],vy:[-20,-4],size:[0.8,2.4],colors:['#7aff9a','#5ac8a0','#a8e063','#60ffb0'],glow:true},
  frost:{vx:[-25,25],vy:[10,30],size:[0.8,2.2],colors:['#eafaff','#c8f0ff','#ffffff','#a8e0ff'],glow:false},
  volcano:{vx:[-12,12],vy:[-50,-20],size:[1,3],colors:['#ff8f2e','#ff5020','#ffe082','#ffb040'],glow:true},
  shadow:{vx:[-12,12],vy:[-25,-6],size:[1,2.5],colors:['#a060ff','#d8a8ff','#8e44ad','#b47cff'],glow:true},
  celestial:{vx:[-10,10],vy:[-30,-10],size:[1,2.4],colors:['#ffe9a8','#fff7d6','#e8b53a'],glow:true}
};
function respawnDustForBiome(biomeKey){
  if(!G)return;
  const theme=BIOME_DUST[biomeKey]||BIOME_DUST.crypt;
  G.dust=[];
  for(let i=0;i<90;i++){
    G.dust.push({x:G.player.x+rand(-W/2-120,W/2+120),y:G.player.y+rand(-H/2-120,H/2+120),
      vx:rand(theme.vx[0],theme.vx[1]),vy:rand(theme.vy[0],theme.vy[1]),
      size:rand(theme.size[0],theme.size[1]),alpha:rand(0.18,0.55),phase:rand(0,TAU),
      color:pick(theme.colors),glow:theme.glow});
  }
}
function setFloorForBiome(biomeKey){
  if(currentFloorBiome===biomeKey&&floorCanvas)return;
  if(!floorCache[biomeKey])floorCache[biomeKey]=buildFloorForBiome(biomeKey);
  floorCanvas=floorCache[biomeKey];
  floorCtx=floorCanvas.getContext('2d');
  torches=TORCH_POSITIONS.map(p=>({x:p.x,y:p.y,phase:rand(0,TAU)}));
  currentFloorBiome=biomeKey;
}
function drawTorchBases(x){
  for(const tp of TORCH_POSITIONS){
    x.fillStyle='rgba(0,0,0,0.5)';
    x.beginPath();x.ellipse(tp.x,tp.y+15,16,7,0,0,TAU);x.fill();
    const pg=x.createLinearGradient(tp.x-6,tp.y,tp.x+6,tp.y);
    pg.addColorStop(0,'#2e241a');pg.addColorStop(0.5,'#4a3a28');pg.addColorStop(1,'#2e241a');
    x.fillStyle=pg;x.fillRect(tp.x-6,tp.y-6,12,22);
    x.fillStyle='#5a4a30';x.beginPath();x.ellipse(tp.x,tp.y-8,13,6,0,0,TAU);x.fill();
    x.fillStyle='#7a6a50';x.beginPath();x.ellipse(tp.x,tp.y-11,11,4,0,0,TAU);x.fill();
    x.fillStyle='#1a0a04';x.beginPath();x.ellipse(tp.x,tp.y-11,8,3,0,0,TAU);x.fill();
  }
}
function cryptDecorate(x){
  for(let i=0;i<200;i++){const cx=rand(0,WORLD.w),cy=rand(0,WORLD.h),r=rand(30,130);
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(22,44,30,0.28)');g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,TAU);x.fill();}
  for(let i=0;i<40;i++){const cx=rand(60,WORLD.w-60),cy=rand(60,WORLD.h-60),r=rand(14,32);
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(70,10,10,0.65)');g.addColorStop(1,'rgba(50,6,6,0)');
    x.fillStyle=g;x.beginPath();x.ellipse(cx,cy,r,r*0.7,rand(0,TAU),0,TAU);x.fill();}
  for(let i=0;i<70;i++){const cx=rand(0,WORLD.w),cy=rand(0,WORLD.h);
    x.strokeStyle='rgba(180,175,155,0.4)';x.lineWidth=2.5;x.lineCap='round';
    const a=rand(0,TAU),len=rand(8,18);
    x.beginPath();x.moveTo(cx-Math.cos(a)*len,cy-Math.sin(a)*len);x.lineTo(cx+Math.cos(a)*len,cy+Math.sin(a)*len);x.stroke();}
}
function cavernsDecorate(x){
  for(let i=0;i<180;i++){const cx=rand(0,WORLD.w),cy=rand(0,WORLD.h),r=rand(30,140);
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,rng()<0.5?'rgba(20,60,35,0.45)':'rgba(40,90,60,0.35)');
    g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,TAU);x.fill();}
  for(let i=0;i<30;i++){const cx=rand(60,WORLD.w-60),cy=rand(60,WORLD.h-60),r=rand(20,60);
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(30,80,90,0.7)');g.addColorStop(1,'rgba(15,50,60,0)');
    x.fillStyle=g;x.beginPath();x.ellipse(cx,cy,r,r*0.6,rand(0,TAU),0,TAU);x.fill();}
  for(let i=0;i<50;i++){const cx=rand(40,WORLD.w-40),cy=rand(40,WORLD.h-40),r=rand(3,6);
    x.fillStyle='rgba(80,220,180,0.7)';x.beginPath();x.ellipse(cx,cy,r,r*0.6,0,0,TAU);x.fill();}
}
function frostDecorate(x){
  for(let i=0;i<300;i++){const cx=rand(0,WORLD.w),cy=rand(0,WORLD.h),r=rand(40,180);
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(220,240,255,0.25)');g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,TAU);x.fill();}
  for(let i=0;i<70;i++){const cx=rand(40,WORLD.w-40),cy=rand(40,WORLD.h-40),size=rand(5,14);
    x.fillStyle='rgba(160,220,255,0.7)';
    x.beginPath();x.moveTo(cx,cy-size);x.lineTo(cx+size*0.5,cy);x.lineTo(cx,cy+size*0.3);x.lineTo(cx-size*0.5,cy);x.closePath();x.fill();}
}
function volcanoDecorate(x){
  for(let i=0;i<200;i++){const cx=rand(0,WORLD.w),cy=rand(0,WORLD.h),r=rand(30,140);
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,rng()<0.5?'rgba(20,8,5,0.5)':'rgba(60,20,10,0.4)');
    g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,TAU);x.fill();}
  for(let i=0;i<30;i++){const cx=rand(60,WORLD.w-60),cy=rand(60,WORLD.h-60);
    x.strokeStyle='rgba(255,120,40,0.85)';x.lineWidth=rand(2,4);x.lineCap='round';
    x.shadowColor='#ff5020';x.shadowBlur=12;
    x.beginPath();let px=cx,py=cy;x.moveTo(px,py);
    for(let s=0;s<randInt(3,6);s++){px+=rand(-30,30);py+=rand(-30,30);x.lineTo(px,py);}
    x.stroke();x.shadowBlur=0;}
  for(let i=0;i<250;i++){const cx=rand(0,WORLD.w),cy=rand(0,WORLD.h),r=rand(0.5,1.5);
    x.fillStyle=`rgba(255,${randInt(100,200)},${randInt(50,100)},${rand(0.3,0.8)})`;
    x.beginPath();x.arc(cx,cy,r,0,TAU);x.fill();}
}
function shadowDecorate(x){
  for(let i=0;i<50;i++){const cx=rand(60,WORLD.w-60),cy=rand(60,WORLD.h-60),r=rand(30,90);
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(15,5,30,0.9)');g.addColorStop(1,'rgba(30,10,50,0)');
    x.fillStyle=g;x.beginPath();x.ellipse(cx,cy,r,r*0.7,rand(0,TAU),0,TAU);x.fill();}
  for(let i=0;i<30;i++){const cx=rand(60,WORLD.w-60),cy=rand(60,WORLD.h-60),size=rand(15,35);
    x.save();x.translate(cx,cy);x.rotate(rand(0,TAU));
    x.strokeStyle='rgba(180,120,255,0.5)';x.lineWidth=2;x.shadowColor='#a060ff';x.shadowBlur=10;
    x.beginPath();x.arc(0,0,size,0,TAU);x.stroke();x.restore();}
  for(let i=0;i<250;i++){const cx=rand(0,WORLD.w),cy=rand(0,WORLD.h),r=rand(0.5,2);
    x.fillStyle=`rgba(${randInt(150,200)},${randInt(90,140)},${randInt(220,255)},${rand(0.2,0.6)})`;
    x.beginPath();x.arc(cx,cy,r,0,TAU);x.fill();}
}
const FLOOR_THEMES = {
  crypt:{baseColor:'#14100c',tileBase:[34,27,21],tileVar:11,borderColor:'rgba(0,0,0,0.88)',decorate:cryptDecorate},
  caverns:{baseColor:'#0a140d',tileBase:[26,40,29],tileVar:9,borderColor:'rgba(0,10,5,0.92)',decorate:cavernsDecorate},
  frost:{baseColor:'#0d1620',tileBase:[30,46,62],tileVar:12,borderColor:'rgba(5,10,20,0.9)',decorate:frostDecorate},
  volcano:{baseColor:'#160806',tileBase:[40,20,13],tileVar:14,borderColor:'rgba(10,2,0,0.95)',decorate:volcanoDecorate},
  shadow:{baseColor:'#0f0618',tileBase:[28,16,42],tileVar:10,borderColor:'rgba(5,0,15,0.95)',decorate:shadowDecorate}
};
function buildFloorForBiome(biomeKey){
  const c=document.createElement('canvas');
  c.width=WORLD.w;c.height=WORLD.h;
  const x=c.getContext('2d');
  const theme=FLOOR_THEMES[biomeKey]||FLOOR_THEMES.crypt;
  x.fillStyle=theme.baseColor;x.fillRect(0,0,WORLD.w,WORLD.h);
  px.buildPixelFloor(x,WORLD.w,WORLD.h,biomeKey);
  theme.decorate(x);
  drawTorchBases(x);
  px.drawPixelWalls(x,WORLD.w,WORLD.h,biomeKey);
  return c;
}
function addBloodDecal(x,y){
  if(!floorCtx)return;
  const r=rand(11,21);
  floorCtx.save();floorCtx.globalCompositeOperation='multiply';floorCtx.globalAlpha=0.72;
  const g=floorCtx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,'rgba(90,12,12,0.95)');g.addColorStop(0.7,'rgba(55,6,6,0.7)');g.addColorStop(1,'rgba(55,6,6,0)');
  floorCtx.fillStyle=g;
  floorCtx.beginPath();floorCtx.ellipse(x,y,r,r*0.7,rand(0,TAU),0,TAU);floorCtx.fill();
  floorCtx.restore();
}
/* ═══ LEVEL-UP: ANGKOR ATTRIBUTE UPDATE OR ACTIVE SKILL UPDATE ═══ */


const UPG_EMPTY: any = emptyUpg();
const upgState={pending:0,open:false,opts:[] as any[],token:0,openAt:0};

function recalcStats(p){
  const tot={dmg:0,hp:0,armor:0,speed:0,crit:0,regen:0};
  for(const slot in p.equipment){
    const it=p.equipment[slot];
    if(!it)continue;
    const s=itemStats(it);
    for(const k in tot)tot[k]+=s[k];
  }
  const up=p.upg||UPG_EMPTY;
  const at=p.attrs||{str:0,vit:0,agi:0,wis:0,lck:0};
  const CL=CLASSES[p.cls]||{};
  const oldMax=p.maxHp||0;
  const tb=p.titleBonus||{};
  const strPts = (at.str||0) + (up.dmg||0);
  const vitPts = (at.vit||0) + (up.hp||0);
  const agiPts = (at.agi||0) + (up.atk||0) + (up.spd||0);
  const wisPts = (at.wis||0) + (up.cd||0);
  const lckPts = (at.lck||0) + (up.crit||0);
  const soulDmg=1+(META.shop.dmg||0)*0.06, soulHp=1+(META.shop.hp||0)*0.08, soulAtk=1+(META.shop.atk||0)*0.04;
  const RM = relicMods(p);
  p.dmg=(p.baseStats.dmg+tot.dmg)*(1+strPts*0.14)*(1+(tb.dmg||0))*soulDmg*(1+RM.dmg);
  p.maxHp=Math.round((p.baseStats.maxHp+tot.hp)*(1+vitPts*0.16)*(1+(tb.hp||0))*soulHp*(1+RM.hp));
  p.armor=p.baseStats.armor+tot.armor+vitPts*12+(at.stone||0)*12+RM.armor;
  p.speed=(p.baseStats.speed+tot.speed)*(1+agiPts*0.08)*(1+(at.swift||0)*0.10)*(1+(tb.spd||0))*(1+RM.spd);
  p.crit=Math.min(0.80,(p.baseStats.crit+tot.crit)+lckPts*0.05+(tb.crit||0)+RM.crit);
  p.energyRegen=(p.baseStats.energyRegen+tot.regen+wisPts*2.5+(tb.regen||0))*(1+RM.regen);
  p.atkSpeed=(p.baseStats.atkSpeed||CL.atkSpeed||1)*(1+agiPts*0.12)*(1+(at.haste||0)*0.12)*(1+(tb.atk||0))*soulAtk*(1+RM.atk);
  p.range=(p.baseStats.range||CL.range||100)*(1+strPts*0.06+(up.range||0)*0.12);
  if(p.baseStats.maxEnergy){
    p.maxEnergy=p.baseStats.maxEnergy + wisPts*8;
    p.energy=Math.min(p.energy||p.maxEnergy,p.maxEnergy);
  }
  const diff=p.maxHp-oldMax;
  if(diff>0)p.hp=Math.min(p.maxHp,(p.hp||0)+diff);
  else p.hp=Math.max(1,Math.min(p.hp||1,p.maxHp));
}

/* Cutscene */
export const cutscene: any = { active:false, script:[], elapsed:0, duration:0, actors:[], dialogue:null,
  camera:{x:0,y:0,targetX:0,targetY:0}, callbacks:{} };
function startCutscene(cfg) {
  cutscene.active = true;
  cutscene.script = cfg.script.map(s => ({ ...s, fired: false }));
  cutscene.elapsed = 0;
  cutscene.duration = cfg.duration;
  cutscene.actors = cutscene.actors.filter(a => a.upd || a.draw); /* keep actors staged by boss intros */
  cutscene.dialogue = null;
  cutscene.callbacks = cfg.callbacks || {};
  cutscene.camera.x = G.cam.x;
  cutscene.camera.y = G.cam.y;
  cutscene.camera.targetX = cfg.cameraTarget ? cfg.cameraTarget.x : G.player.x;
  cutscene.camera.targetY = cfg.cameraTarget ? cfg.cameraTarget.y : G.player.y;
  G.player.attackTarget = null;
  G.player.moveTarget = null;
  G.player.chargingUlt = false;
  G.player.chargeTime = 0;
  document.getElementById('cutsceneBars').classList.remove('hidden');
  document.getElementById('cutsceneDialogue').classList.add('hidden');
}
function updateCutscene(dt) {
  cutscene.elapsed += dt;
  for (const ev of cutscene.script) {
    if (!ev.fired && cutscene.elapsed >= ev.at) {
      ev.fired = true;
      try { ev.fn(); } catch (e) { console.error(e); }
    }
  }
  for (const a of cutscene.actors) {
    if (a.dead) continue;
    if (a.upd) { a.upd(a, dt); continue; }
    if (a.type === 'slime') {
      if (a.eating) {
        a.eating.t -= dt;
        a.scale = Math.max(0, a.eating.t / a.eating.total);
        if (a.eating.t <= 0) { a.dead = true; a.eating = null; }
      } else {
        a.bob = Math.sin(cutscene.elapsed * 3 + a.idx) * 2;
        if (a.grow !== undefined && a.grow < 1) { a.grow = Math.min(1, a.grow + dt * 5); a.scale = a.grow; }
        if (a.vanishDelay !== undefined) {
          a.vanishDelay -= dt;
          if (a.vanishDelay <= 0) {
            if (!a.burst) { a.burst = true;
              for (let k = 0; k < 3; k++) { const an = rand(0, TAU), sp = rand(60, 220);
                G.particles.push({ x: a.x, y: a.y, vx: Math.cos(an)*sp, vy: Math.sin(an)*sp, life: rand(0.3,0.7), max: 0.7, size: rand(2,5), color: rng()<0.5 ? '#4aff8a' : '#b8ffc8' }); } }
            a.vanishT = (a.vanishT === undefined ? 0.35 : a.vanishT) - dt;
            a.scale = Math.max(0, a.vanishT / 0.35);
            if (a.vanishT <= 0) a.dead = true;
          }
        }
      }
    } else if (a.type === 'guest') {
      if (a.fallT < 1) {
        a.fallT = Math.min(1, a.fallT + dt / 1.0);
        if (a.fallT >= 1 && !a.landed) {
          a.landed = true; G.shake = Math.max(G.shake, 18);
          G.fx.push({ type: 'ring', x: a.x, y: a.y, r: 170, life: .55, max: .55, color: a.accent });
          G.fx.push({ type: 'ring', x: a.x, y: a.y, r: 90, life: .35, max: .35, color: '#ffffff' });
          for (let k = 0; k < 26; k++) { const an = rand(0, TAU), sp = rand(80, 320);
            G.particles.push({ x: a.x, y: a.y + 14, vx: Math.cos(an)*sp, vy: Math.sin(an)*sp*0.5 - 40, life: rand(0.3,0.8), max: 0.8, size: rand(2,6), color: rng()<0.5 ? '#b9b0a4' : a.accent }); }
        }
      }
      if (a.fading) a.fade = Math.max(0, (a.fade === undefined ? 1 : a.fade) - dt / 0.8);
      if (a.fade !== undefined && a.fade <= 0) a.dead = true;
    } else if (a.type === 'boss') {
      if (a.walking && a.walkTo) {
        const dx = a.walkTo.x - a.x, dy = a.walkTo.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 10) { a.x = a.walkTo.x; a.y = a.walkTo.y; a.walking = false; a.walkTo = null; }
        else {
          const step = Math.min(a.walkSpeed * dt, d);
          a.x += (dx/d) * step; a.y += (dy/d) * step;
          a.facing = Math.atan2(dy, dx);
          a.walkPhase = (a.walkPhase || 0) + dt * 8;
        }
      } else if (a.eating) {
        a.eating.t -= dt;
        if (a.eating.t <= 0) {
          const slime = a.eating.slime;
          if (slime && !slime.dead) slime.eating = { t: 0.35, total: 0.35 };
          a.scale = (a.scale || 1) + 0.06;
          a.eating = null;
        }
      }
    }
  }
  cutscene.camera.x += (cutscene.camera.targetX - cutscene.camera.x) * Math.min(1, dt * 3);
  cutscene.camera.y += (cutscene.camera.targetY - cutscene.camera.y) * Math.min(1, dt * 3);
  G.cam.x = cutscene.camera.x;
  G.cam.y = cutscene.camera.y;
  if (cutscene.dialogue) {
    cutscene.dialogue.t -= dt;
    if (cutscene.dialogue.t <= 0) hideCutsceneDialogue();
  }
  if (cutscene.elapsed >= cutscene.duration) endCutscene();
}
function endCutscene() {
  if (!cutscene.active) return;
  cutscene.active = false;
  if (cutscene.callbacks.onEnd) {
    try { cutscene.callbacks.onEnd(); } catch (e) { console.error(e); }
  }
  cutscene.actors = []; cutscene.dialogue = null;
  document.getElementById('cutsceneBars').classList.add('hidden');
  document.getElementById('cutsceneDialogue').classList.add('hidden');
}
function skipCutscene() { if (cutscene.active) endCutscene(); }
function showCutsceneDialogue(who, text, icon, dur) {
  cutscene.dialogue = { who, text, icon, t: dur || 2.5 };
  const el = document.getElementById('cutsceneDialogue');
  el.querySelector('.cs-name').textContent = who;
  el.querySelector('.cs-text').textContent = text;
  el.querySelector('.cs-portrait').textContent = icon || '💀';
  el.classList.remove('hidden');
}
function hideCutsceneDialogue() {
  cutscene.dialogue = null;
  document.getElementById('cutsceneDialogue').classList.add('hidden');
}
function drawCutsceneSlime(a) {
  const sc = a.scale || 1;
  if (sc <= 0.01) return;
  ctx.save(); ctx.translate(a.x, a.y + (a.bob || 0)); ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(0, 14, 14, 5, 0, 0, TAU); ctx.fill();
  const grd = ctx.createRadialGradient(-4, -6, 2, 0, 0, 16);
  grd.addColorStop(0, '#b8ffc8'); grd.addColorStop(0.5, '#4aff8a'); grd.addColorStop(1, '#2a8a4a');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(0, 0, 14, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(-5, -5, 4, 3, -0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0a1a0a';
  ctx.beginPath(); ctx.arc(-4, -1, 2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -1, 2, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawCutsceneBoss(a) {
  ctx.save(); ctx.translate(a.x, a.y);
  const s = a.scale || 1; ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.ellipse(0, a.r * 0.85, a.r * 1.4, a.r * 0.55, 0, 0, TAU); ctx.fill();
  const grd = ctx.createRadialGradient(-a.r*0.3, -a.r*0.3, 4, 0, 0, a.r);
  grd.addColorStop(0, '#ff7a54'); grd.addColorStop(0.55, '#b83020'); grd.addColorStop(1, '#5c120c');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, a.r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffb74d'; ctx.shadowColor = '#ff8f2e'; ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(0, -a.r * 0.25); ctx.lineTo(a.r * 0.2, a.r * 0.1);
  ctx.lineTo(0, a.r * 0.4); ctx.lineTo(-a.r * 0.2, a.r * 0.1);
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  const eyeY = -a.r * 0.8;
  ctx.fillStyle = '#ffe082'; ctx.shadowColor = '#ff8f2e'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.ellipse(-a.r*0.2, eyeY, a.r*0.1, a.r*0.13, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(a.r*0.2, eyeY, a.r*0.1, a.r*0.13, 0, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0; ctx.restore();
}
function startCryptLordCutscene(g) {
  const px = g.player.x, py = g.player.y;
  const stageX = px + 220, stageY = py;
  const slimePos = [
    { x: stageX - 130, y: stageY - 90 }, { x: stageX - 40, y: stageY + 90 },
    { x: stageX + 50, y: stageY - 80 }, { x: stageX + 140, y: stageY + 80 }
  ];
  const bossStart = { x: stageX + 500, y: stageY + 20 };
  const bossFinal = { x: stageX, y: stageY + 160 };
  const slimes = []; let bossActor = null;
  function spawnSlimes() {
    for (let i = 0; i < 4; i++) {
      const s = { type:'slime', x:slimePos[i].x, y:slimePos[i].y, r:14, scale:1, idx:i, dead:false, eating:null, bob:0 };
      slimes.push(s); cutscene.actors.push(s);
    }
  }
  function spawnBoss() {
    bossActor = { type:'boss', bossKey:'cryptLord', x: bossStart.x, y: bossStart.y, r: 38, scale: 1,
      walking: false, walkTo: null, walkSpeed: 220, facing: Math.PI, walkPhase: 0, eating: null };
    cutscene.actors.push(bossActor);
  }
  function walkBossTo(target) { if (bossActor) { bossActor.walking = true; bossActor.walkTo = { x: target.x, y: target.y }; bossActor.eating = null; } }
  function eatSlime(idx) {
    if (!bossActor) return;
    const slime = slimes[idx]; if (!slime || slime.dead) return;
    bossActor.walking = false; bossActor.walkTo = null;
    bossActor.eating = { t: 0.6, slime };
    G.shake = Math.max(G.shake, 5);
  }
  startCutscene({
    duration: 18.0,
    cameraTarget: { x: stageX, y: stageY + 40 },
    script: [
      { at: 0.3,  fn: () => showCutsceneDialogue('???', 'The air grows cold...', '👁', 1.8) },
      { at: 2.0,  fn: spawnSlimes },
      { at: 3.4,  fn: spawnBoss },
      { at: 3.6,  fn: () => showCutsceneDialogue('Naga Raja', 'More flesh to feed five heads...', '💀', 1.2) },
      { at: 4.8,  fn: () => walkBossTo(slimePos[0]) },
      { at: 5.8,  fn: () => eatSlime(0) },
      { at: 6.5,  fn: () => walkBossTo(slimePos[1]) },
      { at: 7.5,  fn: () => eatSlime(1) },
      { at: 8.2,  fn: () => walkBossTo(slimePos[2]) },
      { at: 9.2,  fn: () => eatSlime(2) },
      { at: 9.9,  fn: () => walkBossTo(slimePos[3]) },
      { at: 10.9, fn: () => eatSlime(3) },
      { at: 11.6, fn: () => walkBossTo(bossFinal) },
      { at: 12.8, fn: () => showCutsceneDialogue('Naga Raja', 'Coil yourself into my sanctuary. Forever.', '💀', 3.2) },
      { at: 16.0, fn: () => showCutsceneDialogue('Naga Raja', 'Five heads. Five hungers. One of you.', '💀', 1.8) },
      { at: 17.8, fn: () => endCutscene() }
    ],
    callbacks: {
      onEnd: () => {
        const bx = bossActor ? bossActor.x : stageX;
        const by = bossActor ? bossActor.y : stageY + 160;
        spawnEnemy('BOSS:cryptLord', g, bx, by);
        addToast('BOSS: NAGA RAJA', '#ff5c5c', 'The causeway is sealed');
      }
    }
  });
}

/* ===== boss intro cutscenes: realms 2-5 ===== */
function csStage(g){return{x:clamp(g.player.x+220,320,WORLD.w-320),y:clamp(g.player.y,320,WORLD.h-320)}}
function csBurst(x,y,n,cols,sp,up:any=0){for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(sp*.3,sp);G.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-(up||0),life:rand(.4,1),max:1,size:rand(2,6),color:pick(cols)})}}
function csRing(x,y,r,c){G.fx.push({type:'ring',x,y,r,life:.6,max:.6,color:c})}
function csActor(o){cutscene.actors.push(o);return o}
function csBoss(key,x,y,o){const t=BOSS_TYPES[key];
  return csActor(Object.assign({boss:true,bossKey:key,name:t.name,x,y,r:t.r,color:t.color,dark:t.dark,facing:Math.PI,wobble:rand(0,TAU),hp:1,maxHp:1,hitFlash:0,alpha:1,sc:1,dropY:0,walkTo:null,speed:200,
    upd(a,dt){a.wobble+=dt*3;if(a.tick)a.tick(a,dt);if(a.walkTo){const dx=a.walkTo.x-a.x,dy=a.walkTo.y-a.y,d=Math.hypot(dx,dy);if(d<8){a.walkTo=null}else{const s=Math.min(a.speed*dt,d);a.x+=dx/d*s;a.y+=dy/d*s;a.facing=Math.atan2(dy,dx)}}},
    draw(a){if(a.alpha<=.01)return;ctx.save();ctx.translate(a.x,a.y+a.dropY);ctx.globalAlpha=a.alpha;ctx.scale(a.sc,a.sc);drawEnemyBody(a,Math.sin(a.wobble)*2);ctx.restore()}},o||{}))}
function csRise(a,dt,from,len){a.rise=Math.min(1,(a.rise||0)+dt/len);const u=a.rise*a.rise*(3-2*a.rise);a.alpha=Math.min(1,u*2.2);a.sc=lerp(from,1,u);a.dropY=(1-u)*70}
function csFinish(key,toast,sub,getBoss,g){return{callbacks:{onEnd:()=>{const b=getBoss();spawnEnemy('BOSS:'+key,g,b.x,b.y);addToast(toast,'#ff5c5c',sub)}}}}

/* II - Kumbhakarna: the asura assembles out of the stones */
function startTitanCutscene(g){
  const st=csStage(g),sx=st.x,sy=st.y;let boss;
  const rocks=Array.from({length:16},(_,i)=>{const a=i/16*TAU+rand(-.2,.2),d=rand(300,540);return{ox:sx+Math.cos(a)*d,oy:sy+Math.sin(a)*d*.7,r:rand(7,16),ph:rand(0,TAU),t:0,go:2.6+i*.28}});
  csActor({upd(a,dt){const e=cutscene.elapsed;if(e>1&&e<8.4)G.shake=Math.max(G.shake,2+e*.5);
      for(const k of rocks){if(e>k.go&&k.t<1){k.t=Math.min(1,k.t+dt/1.5);if(k.t>=1){G.shake=Math.max(G.shake,7);csBurst(sx,sy+20,6,['#8a7a68','#ffb040'],170,40)}}}},
    draw(){const e=cutscene.elapsed,cr=clamp((e-1.5)/5,0,1);ctx.save();ctx.strokeStyle='#ffb040';ctx.lineWidth=3;ctx.shadowColor='#ffb040';ctx.shadowBlur=12;
      for(let i=0;i<9;i++){const a=i/9*TAU+.3;ctx.globalAlpha=(.5+.3*Math.sin(e*4+i))*Math.min(1,cr*2);ctx.beginPath();ctx.moveTo(sx,sy+30);for(let j=1;j<=8;j++){const d=j*cr*48;ctx.lineTo(sx+Math.cos(a+Math.sin(j*2+i)*.15)*d,sy+30+Math.sin(a+Math.sin(j*2+i)*.15)*d*.55)}ctx.stroke()}ctx.restore();
      for(const k of rocks){if(k.t>=1)continue;const u=k.t*k.t*(3-2*k.t),x=lerp(k.ox,sx,u),y=lerp(k.oy,sy+20,u)-Math.sin(u*Math.PI)*90;
        ctx.save();ctx.translate(x,y);ctx.rotate(k.ph+u*6);ctx.fillStyle='#4a3a2a';ctx.fillRect(-k.r,-k.r*.8,k.r*2,k.r*1.6);ctx.fillStyle='#6a5a48';ctx.fillRect(-k.r,-k.r*.8,k.r*2,k.r*.4);ctx.fillStyle='#ffb040';ctx.fillRect(-k.r*.3,-1,k.r*.6,2);ctx.restore()}}});
  const stomp=()=>{if(boss){G.shake=Math.max(G.shake,11);csRing(boss.x,boss.y+30,230,'#ffb040');csBurst(boss.x,boss.y+40,10,['#8a7a68','#d8b878'],200,60)}};
  startCutscene(Object.assign({duration:17.2,cameraTarget:{x:sx,y:sy+40},script:[
    {at:.4,fn:()=>showCutsceneDialogue('???','The stones... are stirring.','🪨',2.2)},
    {at:8.0,fn:()=>{boss=csBoss('cavernTitan',sx,sy+20,{alpha:0,sc:.55,tick:(a,dt)=>{if(!a.go)return;csRise(a,dt,.55,2.6)}});boss.go=1;G.shake=16;csRing(sx,sy+30,300,'#ffb040');csBurst(sx,sy+30,40,['#8a7a68','#ffb040','#d8b878'],320,80);showCutsceneDialogue('Kumbhakarna','WHO... WAKES... THE COLOSSUS?','🗿',3)}},
    {at:11.6,fn:()=>{boss.speed=90;boss.walkTo={x:sx,y:sy+150}}},{at:12.1,fn:stomp},{at:12.7,fn:stomp},{at:13.3,fn:stomp},
    {at:14.2,fn:()=>showCutsceneDialogue('Kumbhakarna','I slept ten thousand years. You wake me for this?','🗿',2.4)},{at:16.8,fn:endCutscene}]},
    csFinish('cavernTitan','BOSS: KUMBHAKARNA','The asura stirs',()=>boss||{x:sx,y:sy+150},g)))}

/* III - Garuda: frozen in ice, then it shatters free */
function startWyrmCutscene(g){
  const st=csStage(g),sx=st.x,sy=st.y;let boss,orbit=0,shat=false;const FIN={x:sx,y:sy+150};
  boss=csBoss('frostWyrm',sx,sy+20,{alpha:0,sc:1,tick:(a,dt)=>{const e=cutscene.elapsed;
    if(!shat)a.alpha=clamp((e-4.5)/2,0,.5);
    if(orbit){orbit+=dt*2.1;const nx=sx+Math.cos(orbit)*240,ny=sy+Math.sin(orbit)*110;a.facing=Math.atan2(ny-a.y,nx-a.x);a.x=nx;a.y=ny;a.dropY=-40-Math.sin(orbit*2)*10;if(rng()<.6)G.particles.push({x:a.x,y:a.y,vx:rand(-30,30),vy:rand(-10,30),life:.7,max:.7,size:rand(2,5),color:pick(['#bfeaff','#ffffff','#7fd4ff'])})}}});
  csActor({upd(a,dt){const e=cutscene.elapsed;if(e>1&&e<9)for(let i=0;i<3;i++)G.particles.push({x:sx+rand(-650,650),y:sy-420,vx:rand(-30,10),vy:rand(120,220),life:3,max:3,size:rand(1.5,3.5),color:'#f0faff'});if(e>1&&e<8.4)G.shake=Math.max(G.shake,e>6?3:1)},
    draw(){const e=cutscene.elapsed,r=clamp((e-1)/5,0,1)*540;if(r>0){ctx.save();const gr=ctx.createRadialGradient(sx,sy+40,r*.2,sx,sy+40,r);gr.addColorStop(0,'rgba(190,235,255,.35)');gr.addColorStop(1,'rgba(120,200,255,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.ellipse(sx,sy+40,r,r*.6,0,0,TAU);ctx.fill();
      ctx.strokeStyle='rgba(230,248,255,.7)';ctx.lineWidth=2;for(let i=0;i<10;i++){const a=i/10*TAU;ctx.beginPath();ctx.moveTo(sx,sy+40);for(let j=1;j<=6;j++)ctx.lineTo(sx+Math.cos(a+Math.sin(j+i)*.12)*r*j/6,sy+40+Math.sin(a+Math.sin(j+i)*.12)*r*.6*j/6);ctx.stroke()}ctx.restore()}}});
  csActor({upd(a){if(a.dead)return},draw(a){if(shat)return;const e=cutscene.elapsed,k=clamp((e-3)/2.5,0,1);if(k<=0)return;ctx.save();ctx.translate(sx,sy+10);ctx.globalAlpha=.55*k;
    const gr=ctx.createLinearGradient(-70,-120,70,60);gr.addColorStop(0,'#e8f8ff');gr.addColorStop(1,'#5a9acc');ctx.fillStyle=gr;ctx.strokeStyle='#ffffff';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(-30,-130*k);ctx.lineTo(40,-110*k);ctx.lineTo(80,-30);ctx.lineTo(60,60);ctx.lineTo(-20,75);ctx.lineTo(-75,20);ctx.lineTo(-70,-60);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.globalAlpha=.5*k;ctx.beginPath();ctx.moveTo(-40,-60);ctx.lineTo(10,-10);ctx.lineTo(-10,40);ctx.moveTo(10,-10);ctx.lineTo(50,-30);ctx.stroke();ctx.restore()}});
  startCutscene(Object.assign({duration:16.6,cameraTarget:{x:sx,y:sy+40},script:[
    {at:.4,fn:()=>showCutsceneDialogue('???','The wind... has stopped.','❄',2.2)},
    {at:6.4,fn:()=>showCutsceneDialogue('Garuda','Ten thousand winters on the peak... and still I hunger','🐉',2.4)},
    {at:8.4,fn:()=>{shat=true;boss.alpha=1;orbit=.01;G.shake=18;csRing(sx,sy+30,320,'#bfeaff');csRing(sx,sy+30,160,'#ffffff');csBurst(sx,sy,60,['#e8f8ff','#7fd4ff','#bfeaff'],420,120)}},
    {at:12.3,fn:()=>{orbit=0;boss.dropY=0;boss.speed=420;boss.walkTo=FIN;csRing(FIN.x,FIN.y+30,240,'#bfeaff');G.shake=Math.max(G.shake,10)}},
    {at:13.2,fn:()=>showCutsceneDialogue('Garuda','I ate the sun once. You are smaller.','🐉',2.4)},{at:16.2,fn:endCutscene}]},
    csFinish('frostWyrm','BOSS: GARUDA','The sky-king descends',()=>({x:orbit?FIN.x:boss.x,y:orbit?FIN.y:boss.y}),g)))}

/* IV - Kala: the ground cracks, meteors fall, the face rises from the lava */
function startBehemothCutscene(g){
  const st=csStage(g),sx=st.x,sy=st.y;let boss,nm=0;const balls=[];
  csActor({upd(a,dt){const e=cutscene.elapsed;if(e>1&&e<9.6)G.shake=Math.max(G.shake,2+Math.min(e,7)*.4);
      if(e>2.5&&e<9&&e>nm){nm=e+.45;balls.push({x:sx+rand(-380,380),y:sy+rand(-160,200),t:0})}
      for(const b of balls){if(b.t<1){b.t+=dt/.8;if(b.t>=1){csRing(b.x,b.y,110,'#ff7020');csBurst(b.x,b.y,12,['#ff5020','#ffb040','#ffe082'],240,90);G.shake=Math.max(G.shake,6)}}}},
    draw(){const e=cutscene.elapsed,cr=clamp((e-1)/5,0,1),pr=clamp((e-2)/4.5,0,1)*130;ctx.save();ctx.strokeStyle='#ff8a20';ctx.lineWidth=4;ctx.shadowColor='#ff5020';ctx.shadowBlur=14;
      for(let i=0;i<10;i++){const a=i/10*TAU+.2;ctx.globalAlpha=(.55+.35*Math.sin(e*5+i))*Math.min(1,cr*2);ctx.beginPath();ctx.moveTo(sx,sy+30);for(let j=1;j<=7;j++){const d=j*cr*60,w=Math.sin(j*2.3+i)*.18;ctx.lineTo(sx+Math.cos(a+w)*d,sy+30+Math.sin(a+w)*d*.55)}ctx.stroke()}ctx.restore();
      if(pr>0){ctx.save();const gr=ctx.createRadialGradient(sx,sy+30,pr*.1,sx,sy+30,pr);gr.addColorStop(0,'#ffe082');gr.addColorStop(.5,'#ff7a20');gr.addColorStop(1,'rgba(160,40,10,.0)');ctx.fillStyle=gr;ctx.beginPath();ctx.ellipse(sx,sy+30,pr,pr*.55,0,0,TAU);ctx.fill();
        ctx.fillStyle='#ffd060';for(let i=0;i<6;i++){const p=(e*.8+i/6)%1;ctx.globalAlpha=1-p;ctx.beginPath();ctx.arc(sx+Math.sin(i*3+e)*pr*.6,sy+30-p*60,3+p*3,0,TAU);ctx.fill()}ctx.restore()}
      for(const b of balls){if(b.t>=1)continue;const y=b.y-(1-b.t)*520,x=b.x-(1-b.t)*120;ctx.save();ctx.strokeStyle='rgba(255,140,40,.6)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x+60*(1-b.t),y-190*(1-b.t));ctx.lineTo(x,y);ctx.stroke();ctx.shadowColor='#ff5020';ctx.shadowBlur=18;ctx.fillStyle='#ffb040';ctx.beginPath();ctx.arc(x,y,9,0,TAU);ctx.fill();ctx.restore()}}});
  const stomp=()=>{G.shake=Math.max(G.shake,15);csRing(boss.x,boss.y+40,300,'#ff7020');csRing(boss.x,boss.y+40,150,'#ffe082');csBurst(boss.x,boss.y+40,24,['#ff5020','#ffb040','#ffe082'],300,200)};
  boss=csBoss('volcanoBehemoth',sx,sy+20,{alpha:0,sc:.5,tick:(a,dt)=>{if(cutscene.elapsed>7)csRise(a,dt,.5,2.8)}});
  startCutscene(Object.assign({duration:16.4,cameraTarget:{x:sx,y:sy+40},script:[
    {at:.4,fn:()=>showCutsceneDialogue('???','The ground... is burning.','🌋',2.2)},
    {at:7.3,fn:()=>{G.shake=18;csBurst(sx,sy+20,50,['#ff5020','#ffb040','#ffe082'],380,260);csRing(sx,sy+30,320,'#ff7020');showCutsceneDialogue('Kala','THE FORGE FEEDS. THE FACE AWAKENS.','🔥',3)}},
    {at:10.8,fn:()=>{boss.speed=80;boss.walkTo={x:sx,y:sy+150}}},{at:11.2,fn:stomp},{at:12.0,fn:stomp},{at:12.8,fn:stomp},
    {at:13.6,fn:()=>showCutsceneDialogue('Kala','Time devours all. I am its teeth.','🔥',2.2)},{at:16.0,fn:endCutscene}]},
    csFinish('volcanoBehemoth','BOSS: KALA','The time-eater opens its jaws',()=>boss,g)))}

/* V - Krong Reap: born from the hero's own shadow */
function startPrinceCutscene(g){
  const st=csStage(g),sx=st.x,sy=st.y,px=g.player.x,py=g.player.y;let boss;const FIN={x:sx,y:sy+90},clones=[];
  boss=csBoss('shadowPrince',px,py,{alpha:0,sc:.7,tick:(a,dt)=>{const e=cutscene.elapsed;if(e>5.4&&!a.walkTo&&!a.moved)csRise(a,dt,.7,2.4);if(e>8&&a.alpha>.9&&rng()<.02)a.alpha=.4;else if(a.rise>=1&&a.alpha<1)a.alpha=Math.min(1,a.alpha+dt*4)}});
  csActor({upd(){const e=cutscene.elapsed;if(e>1&&e<14)G.shake=Math.max(G.shake,1.5)},
    draw(){const e=cutscene.elapsed,k=clamp((e-1.5)/3.5,0,1);if(k<=0||e>8)return;ctx.save();const gr=ctx.createRadialGradient(px,py+16,4,px,py+16,30+k*70);gr.addColorStop(0,'rgba(10,0,25,.95)');gr.addColorStop(.6,'rgba(70,20,130,.5)');gr.addColorStop(1,'rgba(40,0,80,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.ellipse(px,py+16,30+k*70,(30+k*70)*.4,0,0,TAU);ctx.fill();ctx.restore()}});
  for(let i=0;i<4;i++)clones.push(csBoss('shadowPrince',sx,sy,{alpha:0,sc:.85,base:i/4*TAU,tick:(a)=>{const e=cutscene.elapsed;if(e<8.6||a.dead)return;a.alpha=Math.min(.38,(e-8.6)*.4);
    if(e<11.6){const an=a.base+(e-8.6)*1.7;a.x=sx+Math.cos(an)*200;a.y=sy+Math.sin(an)*100;a.facing=an+Math.PI/2}
    else{a.x=lerp(a.x,boss.x,.09);a.y=lerp(a.y,boss.y,.09);if(Math.hypot(a.x-boss.x,a.y-boss.y)<20){a.dead=true;csBurst(boss.x,boss.y,14,['#a060ff','#d09aff','#2a0a4a'],260,40);G.shake=Math.max(G.shake,8)}}}}));
  csActor({draw(){const e=cutscene.elapsed,a=clamp((e-1)/5,0,.55)*(e>13?clamp(1-(e-13)/1.8,.25,1):1);ctx.save();ctx.setTransform(1,0,0,1,0,0);const gr=ctx.createRadialGradient(canvas.width/2,canvas.height/2,canvas.height*.15,canvas.width/2,canvas.height/2,canvas.width*.65);gr.addColorStop(0,`rgba(20,0,40,${a*.45})`);gr.addColorStop(1,`rgba(5,0,15,${a*1.4})`);ctx.fillStyle=gr;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.restore()}});
  startCutscene(Object.assign({duration:16.2,cameraTarget:{x:(px+sx)/2,y:sy+20},script:[
    {at:.4,fn:()=>showCutsceneDialogue('???','Your shadow... grows longer.','🌑',2.4)},
    {at:5.4,fn:()=>{G.shake=12;csRing(px,py+16,200,'#a060ff');csBurst(px,py+10,30,['#a060ff','#2a0a4a','#d09aff'],260,80);showCutsceneDialogue('Krong Reap','At last. The one who walks in my shadow.','👑',3)}},
    {at:8.4,fn:()=>{boss.moved=1;boss.speed=170;boss.walkTo=FIN;showCutsceneDialogue('Krong Reap','Ten heads. Ten thrones. All mine.','👑',2.6)}},
    {at:11.8,fn:()=>{G.shake=14;csRing(sx,sy+60,300,'#d09aff')}},
    {at:13.0,fn:()=>showCutsceneDialogue('Krong Reap','Ten heads, ten hungers. Which will you feed?','👑',2.4)},{at:15.8,fn:endCutscene}]},
    csFinish('shadowPrince','BOSS: KRONG REAP','The last throne',()=>boss,g)))}

/* ===== FINAL STAND: after Krong Reap falls ===== */
const FIN_ORDER=['cryptLord','frostWyrm','shadowPrince','volcanoBehemoth','cavernTitan','airava'];
const FIN_LINES={airava:['The storm is mine to keep.','🐘'],cryptLord:['I am not finished feeding.','💀'],frostWyrm:['Winter never ends.','🐉'],shadowPrince:['I am the Rift. I cannot fall.','👑'],volcanoBehemoth:['Burn... again.','🔥'],cavernTitan:['The deep remembers you.','🗿']};
const csRgba=(c,a)=>{const n=parseInt(c.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${a})`};
function finalePos(p,i){const a=-.95+i*.475;return{x:clamp(p.x+Math.cos(a)*380,120,WORLD.w-120),y:clamp(p.y+Math.sin(a)*300,120,WORLD.h-120)}}
function finaleAllyClasses(p){const seen={},out=[],ks=Object.keys(CLASSES).filter(k=>k!==p.cls);
  for(let i=ks.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[ks[i],ks[j]]=[ks[j],ks[i]]}
  for(const k of ks){const r=CLASSES[k].roleTag;if(!seen[r]){seen[r]=1;out.push(k);if(out.length>=4)break}}return out}
function spawnFinaleAlly(k,x,y){const C=CLASSES[k],p=G.player,lvl=p.level,melee=C.basic==='melee',hp=Math.round((C.hp*.8+lvl*16+G.wave*6)*3);
  const m={ally:true,finaleAlly:true,allyRef:{cls:k,champ:true},champ:true,cls:k,name:C.name,icon:C.icon,color:C.color,accent:C.accent,x,y,r:16,hp,maxHp:hp,
    dmg:(C.dmg+(lvl-1)*2.2)*1.1,speed:C.speed*1.05,life:1e9,hitFlash:0,wobble:rand(0,TAU),atkTimer:.5,facing:0,ranged:!melee,reach:melee?Math.max(60,C.range||90):0,atkCd:1/Math.max(.8,C.atkSpeed*.8),isMoving:false};
  G.minions.push(m);csRing(x,y,110,C.accent);csRing(x,y,60,'#ffffff');csBurst(x,y,18,[C.accent,'#ffffff','#ffd54f'],260,120);G.shake=Math.max(G.shake,6);return m}
function csScreen(fn){ctx.save();ctx.setTransform(1,0,0,1,0,0);fn(canvas.width,canvas.height,canvas.height/720);ctx.restore()}
function startFinaleCutscene(g){
  const p=g.player,spots=FIN_ORDER.map((k,i)=>finalePos(p,i)),allyKeys=finaleAllyClasses(p);let allied=false;
  for(const en of g.enemies)if(!en.dead&&!en.boss)killEnemy(en,g);
  const spawnAllies=()=>{if(allied)return;allied=true;allyKeys.forEach((k,i)=>{const a=Math.PI+(i-1.5)*.75;spawnFinaleAlly(k,p.x+Math.cos(a)*150,p.y+Math.sin(a)*130)})};
  csActor({draw(){const e=cutscene.elapsed;
    FIN_ORDER.forEach((k,i)=>{const t=e-(2.2+i);if(t<0||t>1.3)return;const w=lerp(70,12,t/1.3),a=1-t/1.3,c=BOSS_TYPES[k].color;
      ctx.fillStyle=csRgba(c,.35*a);ctx.fillRect(spots[i].x-w/2,spots[i].y-760,w,760);ctx.fillStyle=`rgba(255,255,255,${.7*a})`;ctx.fillRect(spots[i].x-w/6,spots[i].y-760,w/3,760)});
    csScreen((W,H)=>{const a=clamp((e-1.5)/4,0,.5)*(e>11?clamp(1-(e-11)/2,.1,1):1),gr=ctx.createRadialGradient(W/2,H/2,H*.2,W/2,H/2,W*.65);gr.addColorStop(0,`rgba(15,0,25,${a*.3})`);gr.addColorStop(1,`rgba(5,0,10,${a*1.5})`);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H)})}});
  const sc=[];FIN_ORDER.forEach((k,i)=>sc.push({at:2.2+i,fn:()=>{const s=spots[i],t=BOSS_TYPES[k];csBoss(k,s.x,s.y,{alpha:0,tick:a=>{a.alpha=Math.min(1,a.alpha+.045);a.facing=Math.PI}});
    G.shake=Math.max(G.shake,12);csRing(s.x,s.y+30,260,t.color);csRing(s.x,s.y+30,120,'#ffffff');csBurst(s.x,s.y,34,[t.color,t.dark,'#ffffff'],380,100);showCutsceneDialogue(t.name,FIN_LINES[k][0],FIN_LINES[k][1],.95)}}));
  const pc=CLASSES[p.cls]||{name:'Hero',icon:'⚔'};
  startCutscene({duration:16.4,cameraTarget:{x:p.x+170,y:p.y},script:[
    {at:.3,fn:()=>showCutsceneDialogue('???','It is... not over.','🌑',1.8)},...sc,
    {at:7.6,fn:()=>{G.shake=16;showCutsceneDialogue('THE FIVE','Together, we will smash you into a thousand pieces!','👹',3.6);for(const a of cutscene.actors)if(a.boss)csRing(a.x,a.y+30,200,a.color)}},
    {at:11.3,fn:()=>{spawnAllies();const C=CLASSES[allyKeys[0]];showCutsceneDialogue(C.name,'You never fought alone!',C.icon,2.2)}},
    {at:14.0,fn:()=>showCutsceneDialogue(pc.name,'Then let us end this. Together!',pc.icon,2.0)},{at:16.0,fn:endCutscene}],
    callbacks:{onEnd:()=>{spawnAllies();const list=[];
      FIN_ORDER.forEach((k,i)=>{spawnEnemy('BOSS:'+k,g,spots[i].x,spots[i].y);const e=g.enemies[g.enemies.length-1];
        e.finale=true;e.maxHp=e.hp=Math.round(BOSS_TYPES[k].hp*2.4);e.dmg*=.35;e.phase=2;e.attackCd=(e.attackCd||2.4)*1.3;e.spawnAnim=.5;
        if(e.attacks)e.attacks=e.attacks.filter(a=>a!=='summonSkeletons'&&a!=='cloneSummon');list.push(e)});
      g.finale={bosses:list,ready:false,done:false};p.hp=p.maxHp;p.energy=p.maxEnergy;
      addToast('◆ FINAL STAND ◆','#ff5c5c','Wear all five down — then press R')}}})}
function finaleTick(g){const h=document.getElementById('finaleHud');if(!h)return;const f=g.finale;
  if(!f||f.done||cutscene.active){h.classList.add('hidden');if(f)f.ready=false;return}
  const bs=f.bosses.filter(e=>!e.dead);let weak=0;
  for(const e of bs){const fl=Math.ceil(e.maxHp*.1);if(e.hp<=fl){e.hp=fl;weak++}}
  f.ready=bs.length>0&&weak===bs.length;h.classList.remove('hidden');h.classList.toggle('ready',f.ready);
  {const pr=document.getElementById('fhPrompt'),fd=FINISHERS[(CLASSES[g.player.cls]||{}).roleTag],nm=fd?fd.name:'';if(pr&&pr.dataset.m!==nm){pr.dataset.m=nm;pr.innerHTML=nm?'▶ PRESS <b>R</b> · '+nm+' ◀':'▶ PRESS <b>R</b> TO FINISH ◀'}}
  document.getElementById('fhCount').textContent='FINAL STAND · WEAKENED '+weak+' / '+bs.length}
function drawFinaleMark(e){ctx.save();const t=G.time;ctx.strokeStyle='#ffd54f';ctx.globalAlpha=.5+.4*Math.sin(t*8);ctx.lineWidth=3;ctx.shadowColor='#ff8f2e';ctx.shadowBlur=14;
  ctx.beginPath();ctx.arc(e.x,e.y,e.r+10+Math.sin(t*6)*3,0,TAU);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle='#ffd54f';ctx.font="bold 12px 'Trebuchet MS'";ctx.textAlign='center';ctx.fillText('✦ WEAKENED ✦',e.x,e.y+e.r+26);ctx.restore()}
function csIce(x,y,r,k){ctx.save();ctx.translate(x,y);ctx.globalAlpha=.6*k;const gr=ctx.createLinearGradient(-r,-r*1.6,r,r);gr.addColorStop(0,'#eafaff');gr.addColorStop(1,'#4a8abf');ctx.fillStyle=gr;ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.shadowColor='#bfeaff';ctx.shadowBlur=18;
  ctx.beginPath();for(let i=0;i<7;i++){const a=i/7*TAU+.3,d=r*(i%2?1.25:1.05)*(.6+.4*k);ctx.lineTo(Math.cos(a)*d,Math.sin(a)*d*1.15-r*.2)}ctx.closePath();ctx.fill();ctx.stroke();
  ctx.globalAlpha=.5*k;ctx.beginPath();ctx.moveTo(-r*.5,-r*.6);ctx.lineTo(r*.1,0);ctx.lineTo(-r*.2,r*.6);ctx.moveTo(r*.1,0);ctx.lineTo(r*.6,-r*.2);ctx.stroke();ctx.restore()}
function csCircle(x,y,r,t,col,a){ctx.save();ctx.translate(x,y+r*.35);ctx.scale(1,.45);ctx.globalAlpha=a;ctx.strokeStyle=col;ctx.lineWidth=4;ctx.shadowColor=col;ctx.shadowBlur=16;
  ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();ctx.setLineDash([14,10]);ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r*.78,0,TAU);ctx.stroke();ctx.setLineDash([]);
  ctx.rotate(t*1.2);ctx.beginPath();for(let i=0;i<6;i++){const a2=i/6*TAU;ctx.lineTo(Math.cos(a2)*r*.7,Math.sin(a2)*r*.7)}ctx.closePath();ctx.stroke();ctx.restore()}
function finaleWin(g){const f=g.finale;f.done=true;g._finaleDone=true;addToast('THE FIVE THRONES HAVE FALLEN','#ffd54f','The Rift is sealed');
  try{ recordMetaRun(g, computeHeroScore(g.wave||1,g.kills||0,(g.player&&g.player.level)||1,Math.floor((g.player&&g.player.gold)||0),diffKey||'normal'), true); }catch(e){}
  try{ checkAchievements(); }catch(e){}
  const v=document.getElementById('victoryCard');if(v){v.classList.add('on');setTimeout(()=>v.classList.remove('on'),7000)}}
/* Mage finisher: ABSOLUTE ZERO -> 4-3-2-1 -> meteors */
function startMageFinisher(g){
  const f=g.finale;f.ready=false;const p=g.player,bs=f.bosses.filter(e=>!e.dead);if(!bs.length)return;
  let cx=p.x,cy=p.y;for(const e of bs){cx+=e.x;cy+=e.y}cx/=bs.length+1;cy/=bs.length+1;
  const C=CLASSES[p.cls]||{name:'Mage',icon:'✨',accent:'#bfeaff'},hit=bs.map(()=>false),fz=bs.map(()=>null),craters=[],T0=7.0,GAP=.28,FALL=.8;let flash=0;
  const mp=(i,k)=>{const b=bs[i],q=k*k;return{x:lerp(b.x+520,b.x,q),y:lerp(b.y-980,b.y,q)}};
  const land=i=>{if(hit[i])return;hit[i]=true;const b=bs[i];
    csBurst(b.x,b.y,90,['#ff5020','#ffb040','#ffe082','#ffffff'],640,170);csBurst(b.x,b.y,40,['#eafaff','#7fd4ff','#bfeaff'],520,200);
    csRing(b.x,b.y,330,'#ff7020');csRing(b.x,b.y,190,'#ffffff');csRing(b.x,b.y,480,'#ffb040');G.shake=Math.max(G.shake,28);flash=.7;craters.push({x:b.x,y:b.y,t:cutscene.elapsed,r:b.r});
    if(!b.dead){g._finaleKill=true;b.hp=0;killEnemy(b,g);g._finaleKill=false}};
  csActor({upd(a,dt){const e=cutscene.elapsed;flash=Math.max(0,flash-dt*2.5);
      bs.forEach((b,i)=>{if(fz[i]==null&&Math.hypot(b.x-p.x,b.y-p.y)<=clamp(e/1.6,0,1)*2200)fz[i]=e;
        const k=(e-(T0+i*GAP))/FALL;if(k>0&&k<1){const m=mp(i,k);G.particles.push({x:m.x,y:m.y,vx:rand(-40,40),vy:rand(-40,40),life:.5,max:.5,size:rand(3,8),color:pick(['#ff5020','#ffb040','#ffe082'])})}
        if(!hit[i]&&e>=T0+i*GAP+FALL)land(i)})},
    draw(){const e=cutscene.elapsed,cd=clamp((e-2.6)/4,0,1),col=`rgb(${Math.round(lerp(143,255,cd))},${Math.round(lerp(220,80,cd))},${Math.round(lerp(255,32,cd))})`;
      if(e<3.4){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(e*1.5);ctx.globalAlpha=Math.min(1,e*2)*(1-clamp((e-2.8)/.6,0,1));ctx.strokeStyle=C.accent||'#bfeaff';ctx.lineWidth=3;ctx.shadowColor=C.accent||'#bfeaff';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(0,0,64,0,TAU);ctx.stroke();ctx.beginPath();for(let i=0;i<5;i++){const a2=i/5*TAU*2;ctx.lineTo(Math.cos(a2)*60,Math.sin(a2)*60)}ctx.stroke();ctx.restore()}
      if(e<1.8){ctx.save();ctx.strokeStyle=`rgba(220,245,255,${1-e/1.8})`;ctx.lineWidth=14;ctx.shadowColor='#bfeaff';ctx.shadowBlur=30;ctx.beginPath();ctx.arc(p.x,p.y,clamp(e/1.6,0,1)*2200,0,TAU);ctx.stroke();ctx.restore()}
      bs.forEach((b,i)=>{if(hit[i])return;if(fz[i]!=null)csIce(b.x,b.y,b.r*1.5,clamp((e-fz[i])/.5,0,1));if(e>2.6)csCircle(b.x,b.y,b.r*2.4+Math.sin(e*8)*3,e,col,clamp((e-2.6)/.6,0,1))});
      for(const c of craters){const k=clamp((e-c.t)/3,0,1);ctx.save();ctx.globalAlpha=1-k*.6;const gr=ctx.createRadialGradient(c.x,c.y+8,4,c.x,c.y+8,c.r*2.4);gr.addColorStop(0,'rgba(10,3,0,.9)');gr.addColorStop(.6,`rgba(255,${Math.round(120*(1-k))},20,.55)`);gr.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.ellipse(c.x,c.y+8,c.r*2.4,c.r*1.2,0,0,TAU);ctx.fill();ctx.restore()}
      bs.forEach((b,i)=>{const k=(e-(T0+i*GAP))/FALL;if(k<=0||k>=1)return;const m=mp(i,k),s=mp(i,Math.max(0,k-.25)),r=lerp(20,52,k*k);
        ctx.save();ctx.lineCap='round';const tg=ctx.createLinearGradient(m.x,m.y,s.x,s.y);tg.addColorStop(0,'rgba(255,200,80,.9)');tg.addColorStop(1,'rgba(255,60,20,0)');ctx.strokeStyle=tg;ctx.lineWidth=r*1.5;ctx.beginPath();ctx.moveTo(m.x,m.y);ctx.lineTo(s.x,s.y);ctx.stroke();
        const gr=ctx.createRadialGradient(m.x,m.y,r*.2,m.x,m.y,r*2.6);gr.addColorStop(0,'rgba(255,240,160,.95)');gr.addColorStop(.4,'rgba(255,120,30,.6)');gr.addColorStop(1,'rgba(255,60,10,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(m.x,m.y,r*2.6,0,TAU);ctx.fill();
        ctx.fillStyle='#3a1a0a';ctx.beginPath();ctx.arc(m.x,m.y,r,0,TAU);ctx.fill();ctx.fillStyle='#ff8a30';ctx.beginPath();ctx.arc(m.x-r*.25,m.y-r*.25,r*.45,0,TAU);ctx.fill();ctx.restore()});
      csScreen((W,H,u)=>{const ice=clamp(e/1.2,0,1)*(1-clamp((e-5)/2,0,.6)),heat=clamp((e-4.5)/2.5,0,1);
        ctx.fillStyle=`rgba(120,200,255,${.2*ice})`;ctx.fillRect(0,0,W,H);
        let gr=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,W*.7);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(200,240,255,${.55*ice})`);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
        if(heat>0){gr=ctx.createRadialGradient(W/2,H/2,H*.2,W/2,H/2,W*.7);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(255,70,10,${.5*heat})`);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H)}
        if(e<7.6){ctx.fillStyle='#f4fbff';for(let i=0;i<70;i++){const x=((i*137.5+Math.sin(e+i)*30)%W+W)%W,y=((i*83+e*(60+i%5*25)*u)%H+H)%H;ctx.globalAlpha=.8*clamp(e/1,0,1);ctx.fillRect(x,y,(1.5+i%3)*u,(1.5+i%3)*u)}ctx.globalAlpha=1}
        if(flash>0){ctx.fillStyle=`rgba(255,230,180,${FL(flash*.6)})`;ctx.fillRect(0,0,W,H)}
        ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=12;
        if(e<2.4){const q=clamp(e/.25,0,1),k=q*(1-clamp((e-1.7)/.7,0,1));ctx.globalAlpha=k;ctx.font=`bold ${Math.round(74*u*(1.3-.3*q))}px 'Trebuchet MS'`;ctx.fillStyle='#d8f4ff';ctx.fillText('A B S O L U T E   Z E R O',W/2,H*.28)}
        const n=Math.floor(e-3);if(n>=0&&n<4){const t=e-3-n,q=clamp(t/.22,0,1),al=1-clamp((t-.7)/.3,0,1);ctx.globalAlpha=al;ctx.font=`bold ${Math.round(300*u*(2-q))}px 'Trebuchet MS'`;ctx.lineWidth=10*u;ctx.strokeStyle='#000';ctx.fillStyle=['#9fe0ff','#ffffff','#ffc060','#ff4a20'][n];ctx.strokeText(4-n,W/2,H*.56);ctx.fillText(4-n,W/2,H*.56)}
        ctx.globalAlpha=1;if(e>=8.85){const w=e<9?(e-8.85)/.15:clamp(1-(e-9)/1.2,0,1);ctx.fillStyle=`rgba(255,255,255,${FL(w)})`;ctx.fillRect(0,0,W,H)}})}});
  startCutscene({duration:10.9,cameraTarget:{x:cx,y:cy},script:[
    {at:.05,fn:()=>{G.shake=10;csRing(p.x,p.y,300,'#bfeaff');showCutsceneDialogue(C.name,'ABSOLUTE ZERO!!',C.icon,1.9)}},
    {at:2.7,fn:()=>showCutsceneDialogue(C.name,'Stand still. This will be quick.',C.icon,1.8)},
    ...[3,4,5,6].map((t,n)=>({at:t,fn:()=>{G.shake=Math.max(G.shake,5+n*3);for(const b of bs)if(!b.dead)csRing(b.x,b.y+20,140+n*40,n<2?'#9fe0ff':'#ff6a30')}})),
    {at:9.2,fn:()=>showCutsceneDialogue(C.name,'Cold... and then fire.',C.icon,1.4)},{at:10.5,fn:endCutscene}],
    callbacks:{onEnd:()=>{bs.forEach((b,i)=>land(i));finaleWin(g)}}})}

/* VI - Airavata: the court darkens, lightning walks down the terrace, and the
   three heads rise out of a rune of gold light. */
function startAiravaCutscene(g){
  const st=csStage(g),sx=st.x,sy=st.y;let boss;
  const bolts=Array.from({length:5},(_,i)=>({t:1.2+i*0.9,done:false,ang:rand(0,TAU),len:rand(120,220)}));
  csActor({
    upd(a,dt){
      const e=cutscene.elapsed;
      for(const b of bolts){
        if(!b.done && e>b.t){ b.done=true; G.shake=Math.max(G.shake,9);
          csBurst(sx+Math.cos(b.ang)*80,sy+Math.sin(b.ang)*50,8,['#bfe8ff','#ffe9a8','#ffffff'],200,120); }
      }
    },
    draw(){
      const e=cutscene.elapsed,t=clamp((e-0.6)/6,0,1);
      ctx.save();
      /* gathering storm ring on the floor */
      ctx.strokeStyle='rgba(255,233,168,'+(0.25+0.45*t)+')';ctx.lineWidth=3;ctx.shadowColor='#ffe9a8';ctx.shadowBlur=16;
      ctx.beginPath();ctx.ellipse(sx,sy+34,240*t,120*t,0,0,TAU);ctx.stroke();
      ctx.beginPath();ctx.ellipse(sx,sy+34,150*t,74*t,0,0,TAU);ctx.stroke();
      /* lightning ladders down the terrace */
      for(const b of bolts){
        const age=e-b.t; if(age<0||age>0.35) continue;
        ctx.globalAlpha=1-age/0.35; ctx.strokeStyle='#e8f6ff'; ctx.lineWidth=2.5;
        ctx.beginPath();
        let x=sx+Math.cos(b.ang)*40, y=sy-260;
        ctx.moveTo(x,y);
        for(let k=1;k<=6;k++){ x+=rand(-18,18); y+=260/6; ctx.lineTo(x,y); }
        ctx.stroke(); ctx.globalAlpha=1;
      }
      ctx.restore();
    }
  });
  startCutscene(Object.assign({duration:16.4,cameraTarget:{x:sx,y:sy+20},script:[
    {at:.4,fn:()=>showCutsceneDialogue('???','The air tastes of iron','⚡',2.0)},
    {at:3.0,fn:()=>{G.shake=8;csRing(sx,sy+30,260,'#ffe9a8');csBurst(sx,sy+20,26,['#ffe9a8','#fff7d6','#e8b53a'],240,120);
      showCutsceneDialogue('???','Something enormous is breathing above the court.','🐘',2.4)}},
    {at:6.6,fn:()=>{boss=csBoss('airava',sx,sy-10,{alpha:0,sc:.5,tick:(a,dt)=>{if(!a.go)return;csRise(a,dt,.5,2.4)}});
      boss.go=1;G.shake=18;csRing(sx,sy+30,320,'#ffe9a8');csBurst(sx,sy,44,['#bfe8ff','#ffe9a8','#ffffff'],320,140);
      showCutsceneDialogue('Airavata','THREE HEADS, ONE STORM.','🐘',3.0)}},
    {at:11.4,fn:()=>{if(boss){boss.speed=74;boss.walkTo={x:sx,y:sy+120}}}},
    {at:12.6,fn:()=>showCutsceneDialogue('Airavata','The summit does not bow.','🐘',2.4)},
    {at:16.0,fn:endCutscene}
  ]},
  csFinish('airava','BOSS: AIRAVATA','The storm descends',()=>boss||{x:sx,y:sy+120},g)))}

/* ===== Boss defeat cutscenes (Kumbhakarna, Garuda, Kala). Naga Raja & Krong Reap have their own. ===== */
function defeatEnd(g,b){b.sink=0;b.lift=0;b.ghost=undefined;b._defeatDone=true;b.hp=0;for(const en of g.enemies)if(!en.dead&&!en.boss)killEnemy(en,g);killEnemy(b,g)}
function defeatCracks(b,k,col,glow,seed){if(k<=0)return;ctx.save();ctx.translate(b.x,b.y);ctx.strokeStyle=col;ctx.lineWidth=3;ctx.shadowColor=glow;ctx.shadowBlur=14;ctx.lineJoin='round';ctx.globalAlpha=clamp(k*1.5,0,1);
  const n=Math.max(1,Math.ceil(9*k));for(let i=0;i<n;i++){const an=i/9*TAU+seed;ctx.beginPath();ctx.moveTo(0,-b.r*.2);for(let j=1;j<=5;j++){const w=Math.sin(j*2.7+i*1.9+seed)*.35,d=b.r*1.15*j/5*Math.min(1,k*1.4);ctx.lineTo(Math.cos(an+w)*d,-b.r*.2+Math.sin(an+w)*d*.9)}ctx.stroke()}ctx.restore()}
function mkChunks(){const L=[];return{
  add(x,y,n,cols,spread,sz,floor,tri){for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(spread*.3,spread);L.push({x:x+rand(-20,20),y:y+rand(-20,20),vx:Math.cos(a)*s,vy:Math.sin(a)*s-rand(150,380),rot:rand(0,TAU),vr:rand(-9,9),sz:rand(sz*.5,sz),floor:floor+rand(-25,30),c:pick(cols),tri,bn:0,rest:false})}},
  upd(dt){for(const c of L){if(c.rest)continue;c.vy+=900*dt;c.x+=c.vx*dt;c.y+=c.vy*dt;c.rot+=c.vr*dt;if(c.y>=c.floor&&c.vy>0){c.y=c.floor;c.vy*=-.3;c.vx*=.5;c.vr*=.4;if(++c.bn>2)c.rest=true}}},
  draw(fade){ctx.save();for(const c of L){ctx.globalAlpha=fade;ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.rot);ctx.fillStyle=c.c;ctx.strokeStyle='rgba(0,0,0,.45)';ctx.lineWidth=1.5;ctx.beginPath();
    if(c.tri){ctx.moveTo(0,-c.sz);ctx.lineTo(c.sz*.5,c.sz*.6);ctx.lineTo(-c.sz*.5,c.sz*.6);ctx.closePath()}else ctx.rect(-c.sz/2,-c.sz*.4,c.sz,c.sz*.8);ctx.fill();ctx.stroke();ctx.restore()}ctx.restore()}}}
function csGeyser(x,y,w,h,k,c1,c2,e){ctx.save();ctx.globalCompositeOperation='lighter';const gr=ctx.createLinearGradient(0,y,0,y-h);gr.addColorStop(0,csRgba(c2,.95*(1-k*k)));gr.addColorStop(.5,csRgba(c1,.7*(1-k*k)));gr.addColorStop(1,csRgba(c1,0));ctx.fillStyle=gr;ctx.beginPath();
  for(let j=0;j<=16;j++){const t=j/16,xx=x-w*(1-t*.85)+Math.sin(e*20+t*8)*w*.12;j?ctx.lineTo(xx,y-h*t):ctx.moveTo(xx,y-h*t)}
  for(let j=16;j>=0;j--){const t=j/16,xx=x+w*(1-t*.85)+Math.sin(e*20+t*8+2)*w*.12;ctx.lineTo(xx,y-h*t)}ctx.closePath();ctx.fill();ctx.restore()}
function defeatWho(g){return CLASSES[g.player.cls]||{name:'Hero',icon:'⚔'}}

/* Cavern Titan: cracks glow, rubble rains, it kneels, then crumbles to rubble */
function startTitanDefeat(g,b){
  const p=g.player,bx=b.x,by=b.y,gy=by+b.r*.55,T_CR=6.0,ch=mkChunks(),pc=defeatWho(g);let flash=0,done=false;
  csActor({upd(a,dt){const e=cutscene.elapsed;flash=Math.max(0,flash-dt*2);ch.upd(dt);
      if(e>.8&&e<T_CR){G.shake=Math.max(G.shake,2+e*.8);if(rng()<.6)G.particles.push({x:bx+rand(-260,260),y:by-rand(380,520),vx:rand(-15,15),vy:rand(260,420),life:.9,max:.9,size:rand(3,7),color:pick(['#8a7a6a','#5a4a3a','#c9b9a0'])})}
      if(e>2.6&&!done)b.sink=csEase(clamp((e-2.6)/3.2,0,1))*.14+.0001},
    draw(){const e=cutscene.elapsed;if(!done)defeatCracks(b,clamp((e-1)/3.5,0,1),'#ffb040','#ff7a20',1.3);ch.draw(1-clamp((e-8.2)/1,0,1));
      csScreen((W,H)=>{const a=clamp(e/1.2,0,1)*(1-clamp((e-7.5)/1.5,0,1)),gr=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,W*.7);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(20,12,4,${.55*a})`);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
        if(flash>0){ctx.fillStyle=`rgba(255,235,200,${FL(flash*.6)})`;ctx.fillRect(0,0,W,H)}})}});
  startCutscene({duration:9.6,cameraTarget:{x:(p.x+bx)/2,y:(p.y+by)/2},script:[
    {at:.2,fn:()=>showCutsceneDialogue('Kumbhakarna','Impossible... I am the COLOSSUS...','🗿',2.4)},
    {at:1.0,fn:()=>{G.shake=Math.max(G.shake,8);csRing(bx,gy,200,'#ffb040')}},
    {at:3.2,fn:()=>showCutsceneDialogue('Kumbhakarna','The age... does not break...','🗿',2.2)},
    {at:5.0,fn:()=>{G.shake=Math.max(G.shake,14);showCutsceneDialogue('Kumbhakarna','The Reamker... will remember you.','🗿',1.6)}},
    {at:T_CR,fn:()=>{done=true;b.sink=1;flash=1;G.shake=32;csBurst(bx,by,80,[b.color,b.dark,'#8a7a6a','#c9b9a0'],560,200);csRing(bx,gy,360,'#c9b9a0');csRing(bx,gy,200,'#ffb040');ch.add(bx,by,20,[b.color,b.dark,'#8a7a6a'],520,22,gy,false)}},
    {at:7.2,fn:()=>showCutsceneDialogue(pc.name,'The deep can rest now.',pc.icon,1.8)},{at:9.4,fn:endCutscene}],
    callbacks:{onEnd:()=>defeatEnd(g,b)}})}

/* Frost Wyrm: its own ice turns on it, encases it, and shatters */
function startWyrmDefeat(g,b){
  const p=g.player,bx=b.x,by=b.y,gy=by+b.r*.55,T_SH=6.2,ch=mkChunks(),pc=defeatWho(g);let flash=0,done=false;
  csActor({upd(a,dt){const e=cutscene.elapsed;flash=Math.max(0,flash-dt*2);ch.upd(dt);
      if(e>.8&&e<T_SH){G.shake=Math.max(G.shake,1.5+e*.5);for(let i=0;i<2;i++)G.particles.push({x:bx+rand(-300,300),y:by-rand(300,460),vx:rand(-30,10),vy:rand(90,190),life:2,max:2,size:rand(1.5,3.5),color:'#f0faff'})}
      if(e>T_SH&&e<T_SH+2.5&&rng()<.7)G.particles.push({x:bx+rand(-260,260),y:by-rand(250,400),vx:rand(-40,20),vy:rand(60,160),life:2,max:2,size:rand(1.5,3.5),color:'#f0faff'})},
    drawGround(){const e=cutscene.elapsed,k=clamp((e-1.5)/2.5,0,1)*(1-clamp((e-T_SH-1.5)/1.5,0,1));if(k>0)csCircle(bx,gy-b.r*1.6*.35,b.r*1.6,e,'#bfeaff',k*.9)},
    draw(){const e=cutscene.elapsed;if(!done){defeatCracks(b,clamp((e-.8)/2.8,0,1),'#eafaff','#7fd4ff',.7);const k=clamp((e-3)/2.4,0,1);if(k>0)csIce(bx,by,b.r*1.5,k)}
      ch.draw(1-clamp((e-8.2)/1,0,1));
      csScreen((W,H)=>{const a=clamp(e/1,0,1)*(1-clamp((e-7.5)/1.5,0,1));ctx.fillStyle=`rgba(120,190,255,${.16*a})`;ctx.fillRect(0,0,W,H);const gr=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,W*.7);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(200,240,255,${.45*a})`);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
        if(flash>0){ctx.fillStyle=`rgba(235,250,255,${FL(flash*.7)})`;ctx.fillRect(0,0,W,H)}})}});
  startCutscene({duration:9.6,cameraTarget:{x:(p.x+bx)/2,y:(p.y+by)/2},script:[
    {at:.2,fn:()=>showCutsceneDialogue('Garuda','Cold... betrays me?!','🐉',2.4)},
    {at:1.0,fn:()=>{G.shake=Math.max(G.shake,6);csRing(bx,gy,220,'#bfeaff')}},
    {at:3.2,fn:()=>{csRing(bx,gy,260,'#ffffff');showCutsceneDialogue('Garuda','A thousand skies... stolen...','🐉',2.2)}},
    {at:5.2,fn:()=>{G.shake=Math.max(G.shake,12);showCutsceneDialogue('Garuda','The sky... empties.','🐉',1.2)}},
    {at:T_SH,fn:()=>{done=true;b.sink=1;flash=1;G.shake=32;csBurst(bx,by,90,['#eafaff','#7fd4ff','#bfeaff','#ffffff'],620,220);csRing(bx,gy,380,'#bfeaff');csRing(bx,gy,200,'#ffffff');ch.add(bx,by,26,['#eafaff','#bfeaff','#7fd4ff'],600,20,gy,true)}},
    {at:7.4,fn:()=>showCutsceneDialogue(pc.name,'The thaw begins.',pc.icon,1.8)},{at:9.4,fn:endCutscene}],
    callbacks:{onEnd:()=>defeatEnd(g,b)}})}

/* Ember Behemoth: overheats, collapses into its own lava, and erupts */
function startBehemothDefeat(g,b){
  const p=g.player,bx=b.x,by=b.y,gy=by+b.r*.55,T_S0=4.0,T_S1=6.6,T_ER=6.8,pc=defeatWho(g);let flash=0,done=false;
  csActor({upd(a,dt){const e=cutscene.elapsed;flash=Math.max(0,flash-dt*2);
      if(e>.8&&e<T_ER){G.shake=Math.max(G.shake,2+e*.9);if(rng()<.7)G.particles.push({x:bx+rand(-b.r*1.6,b.r*1.6),y:gy+rand(-8,8),vx:rand(-20,20),vy:-rand(60,200),life:1,max:1,size:rand(2,5),color:pick(['#ff5020','#ffb040','#ffe082'])})}
      if(e>T_S0&&!done)b.sink=csEase(clamp((e-T_S0)/(T_S1-T_S0),0,1))},
    drawGround(){const e=cutscene.elapsed,k=clamp((e-2.4)/1.8,0,1),cool=clamp((e-T_ER-.5)/1.8,0,1);if(k<=0)return;const rx=b.r*2.6*k;ctx.save();ctx.translate(bx,gy);ctx.scale(1,.45);
      const gr=ctx.createRadialGradient(0,0,0,0,0,rx);gr.addColorStop(0,`rgba(255,${Math.round(230-150*cool)},${Math.round(130-110*cool)},.98)`);gr.addColorStop(.55,`rgba(${Math.round(255-140*cool)},${Math.round(90-60*cool)},20,.95)`);gr.addColorStop(1,'rgba(120,20,0,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,rx,0,TAU);ctx.fill();
      ctx.strokeStyle=`rgba(255,200,80,${.8*(1-cool)})`;ctx.lineWidth=4;ctx.shadowColor='#ff5020';ctx.shadowBlur=16;ctx.beginPath();ctx.arc(0,0,rx*.96,0,TAU);ctx.stroke();ctx.restore()},
    draw(){const e=cutscene.elapsed;
      if(!done){const k=clamp((e-.8)/3.4,0,1);defeatCracks(b,k,'#ffe082','#ff5020',2.1);
        if(k>0){ctx.save();ctx.globalCompositeOperation='lighter';const gr=ctx.createRadialGradient(bx,by,b.r*.2,bx,by,b.r*(1.4+.2*Math.sin(e*14)));gr.addColorStop(0,`rgba(255,235,170,${.55*k})`);gr.addColorStop(1,'rgba(255,80,20,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(bx,by,b.r*1.7,0,TAU);ctx.fill();ctx.restore()}}
      if(e>=T_ER&&e<T_ER+1.2){const k=(e-T_ER)/1.2;csGeyser(bx,gy,b.r*1.5*(1-.5*k),760*(1-(1-k)*(1-k)),k,'#ff5020','#ffe082',e)}
      csScreen((W,H)=>{const a=clamp(e/1.2,0,1)*(1-clamp((e-T_ER-.6)/1.6,0,1));ctx.fillStyle=`rgba(80,15,0,${.22*a})`;ctx.fillRect(0,0,W,H);const gr=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,W*.7);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(255,70,10,${.4*a})`);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
        if(flash>0){ctx.fillStyle=`rgba(255,200,120,${FL(flash*.65)})`;ctx.fillRect(0,0,W,H)}})}});
  startCutscene({duration:9.8,cameraTarget:{x:(p.x+bx)/2,y:(p.y+by)/2},script:[
    {at:.2,fn:()=>showCutsceneDialogue('Kala','The furnace... dies?!','🔥',2.2)},
    {at:1.0,fn:()=>{G.shake=Math.max(G.shake,8);csRing(bx,gy,240,'#ff7020')}},
    {at:2.6,fn:()=>{csRing(bx,gy,300,'#ffb040');showCutsceneDialogue('Kala','I am the FURNACE... I cannot...','🔥',2.0)}},
    {at:T_S0+.4,fn:()=>{G.shake=Math.max(G.shake,16);showCutsceneDialogue('Kala','Let time... swallow me...','🔥',2.0)}},
    {at:T_ER,fn:()=>{done=true;b.sink=1;flash=1;G.shake=34;csBurst(bx,gy,90,['#ff5020','#ffb040','#ffe082'],640,240);csRing(bx,gy,380,'#ff7020');csRing(bx,gy,200,'#ffe082')}},
    {at:7.8,fn:()=>showCutsceneDialogue(pc.name,'The fire is out.',pc.icon,1.8)},{at:9.6,fn:endCutscene}],
    callbacks:{onEnd:()=>defeatEnd(g,b)}})}

/* Airavata's fall: the storm leaves it one bolt at a time, and the hide goes
   from slate to ash as each head lowers. */
function startAiravaDefeat(g,b){
  const p=g.player,bx=b.x,by=b.y,gy=by+b.r*.55,pc=defeatWho(g);
  const T_S0=4.2,T_S1=6.8,T_ER=7.0,T_END=10.0;
  let flash=0,done=false,bolts=0;
  csActor({
    upd(a,dt){
      const e=cutscene.elapsed; flash=Math.max(0,flash-dt*2.2);
      if(e>.6&&e<T_ER){
        G.shake=Math.max(G.shake,2+e*.8);
        /* a bolt lands on the boss roughly twice a second */
        const want=Math.floor((e-.6)*2);
        if(want>bolts){ bolts=want; flash=1; G.shake=Math.max(G.shake,10);
          csBurst(bx+rand(-b.r,b.r),by-rand(0,b.r*1.4),10,['#bfe8ff','#ffffff','#ffe9a8'],260,90);
          if(rng()<.5) csRing(bx,gy,b.r*2.2,'#bfe8ff');
        }
      }
      if(e>T_S0&&!done) b.sink=csEase(clamp((e-T_S0)/(T_S1-T_S0),0,1));
      if(e>T_ER) b.color='#8a9098';
    },
    draw(){
      const e=cutscene.elapsed;
      /* storm draining out of the body */
      const k=clamp((e-.6)/(T_ER-.6),0,1);
      if(k<=0||k>=1) return;
      ctx.save();ctx.globalAlpha=.55*(1-k);
      for(let i=0;i<7;i++){
        const a=i/7*TAU+e*1.6;
        ctx.strokeStyle='#e8f6ff';ctx.lineWidth=2;
        ctx.beginPath();
        ctx.moveTo(bx+Math.cos(a)*b.r*1.1,by+Math.sin(a)*b.r*.8);
        ctx.lineTo(bx+Math.cos(a)*b.r*(1.1+1.4*(1-k)),by+Math.sin(a)*b.r*(.8+1.2*(1-k)));
        ctx.stroke();
      }
      ctx.restore();
      if(flash>0){ctx.save();ctx.fillStyle=`rgba(200,240,255,${FL(flash*.5)})`;ctx.fillRect(0,0,W,H);ctx.restore()}
    }
  });
  startCutscene({duration:T_END,cameraTarget:{x:(p.x+bx)/2,y:(p.y+by)/2},script:[
    {at:.2,fn:()=>showCutsceneDialogue('Airavata','The storm... is leaving me.','🐘',2.2)},
    {at:1.2,fn:()=>{G.shake=Math.max(G.shake,9);csRing(bx,gy,240,'#bfe8ff')}},
    {at:3.0,fn:()=>showCutsceneDialogue('Airavata','Three heads... and none of them afraid.','🐘',2.4)},
    {at:T_S0+.3,fn:()=>{G.shake=Math.max(G.shake,15);showCutsceneDialogue('Airavata','The summit... remembers you.','🐘',2.2)}},
    {at:T_ER,fn:()=>{done=true;b.sink=1;flash=1;G.shake=34;
      csBurst(bx,gy,90,['#bfe8ff','#ffffff','#ffe9a8'],620,220);csRing(bx,gy,380,'#bfe8ff');csRing(bx,gy,200,'#ffffff')}},
    {at:8.2,fn:()=>showCutsceneDialogue(pc.name,'The sky is quiet again.',pc.icon,1.8)},
    {at:9.8,fn:endCutscene}],
    callbacks:{onEnd:()=>defeatEnd(g,b)}})}

const DEFEAT_CS={cavernTitan:startTitanDefeat,frostWyrm:startWyrmDefeat,volcanoBehemoth:startBehemothDefeat,airava:startAiravaDefeat};

/* ===== Class finishers: dispatched by roleTag (see FINISHERS table) ===== */
const csEase=k=>k*k*(3-2*k);
function finisherBegin(g){
  const f=g.finale;f.ready=false;const p=g.player,bs=f.bosses.filter(e=>!e.dead);if(!bs.length)return null;
  const heroes=[p,...g.minions.filter(m=>m.finaleAlly&&m.hp>0)];let cx=p.x,cy=p.y;for(const e of bs){cx+=e.x;cy+=e.y}cx/=bs.length+1;cy/=bs.length+1;
  return{f,p,bs,heroes,cx,cy,C:CLASSES[p.cls]||{name:'Hero',icon:'⚔',accent:'#ffffff'}}}
function finisherKillAll(g,bs){g._finaleKill=true;for(const b of bs){if(b.dead)continue;b.hp=0;killEnemy(b,g)}g._finaleKill=false}
function finisherWin(g,bs){finisherKillAll(g,bs);finaleWin(g)}
function csTitle(W,H,u,e,t0,len,txt,col){const q=clamp((e-t0)/.25,0,1),k=q*(1-clamp((e-t0-len+.7)/.7,0,1));if(k<=0)return;
  ctx.save();ctx.globalAlpha=k;ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=12;ctx.font=`bold ${Math.round(74*u*(1.3-.3*q))}px 'Trebuchet MS'`;ctx.fillStyle=col;ctx.fillText(txt,W/2,H*.28);ctx.restore()}
function csFlash(W,H,rgb,e,t0,fade){if(e<t0)return;const w=e<t0+.15?(e-t0)/.15:clamp(1-(e-t0-.15)/fade,0,1);if(w>0){ctx.fillStyle=`rgba(${rgb},${w})`;ctx.fillRect(0,0,W,H)}}
function csArm(x,y,h,lean,curl,st,al){if(h<3||al<=0)return;ctx.save();ctx.globalAlpha=al;ctx.lineCap='round';ctx.lineJoin='round';ctx.translate(x,y);ctx.shadowColor=st.glow;ctx.shadowBlur=st.claw?14:9;
  const ex=lean*h,ey=-h,sg=lean>=0?1:-1;ctx.strokeStyle=st.arm;ctx.lineWidth=st.w;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(ex*.1,-h*.6,ex,ey);ctx.stroke();
  if(!st.claw){ctx.fillStyle=st.arm;for(const t of[.4,.75]){ctx.beginPath();ctx.arc(2*(1-t)*t*ex*.1+t*t*ex,2*(1-t)*t*(-h*.6)+t*t*ey,st.w*.75,0,TAU);ctx.fill()}}
  const ta=Math.atan2(ey+h*.6,ex*.9);ctx.lineWidth=st.fw;
  for(let i=0;i<4;i++){const f=i-1.5,a1=ta+f*.45*(1-curl*.85),x1=ex+Math.cos(a1)*st.fl,y1=ey+Math.sin(a1)*st.fl,a2=a1+sg*curl*1.2,x2=x1+Math.cos(a2)*st.fl*.8,y2=y1+Math.sin(a2)*st.fl*.8;
    ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    if(st.claw){ctx.strokeStyle='#f0e0c8';ctx.lineWidth=st.fw*.55;ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2+Math.cos(a2+sg*.3)*9,y2+Math.sin(a2+sg*.3)*9);ctx.stroke();ctx.strokeStyle=st.arm;ctx.lineWidth=st.fw}}
  ctx.restore()}

/* RANGER - ARROWFALL: time slows, arrows pile up in the sky, time snaps back, every arrow rushes its boss */
function startRangerFinisher(g){
  const S=finisherBegin(g);if(!S)return;const{p,bs,heroes,cx,cy,C}=S;
  const N=108,T0=1.1,T1=4.5,RISE=.85,TURN=.6,T_RUSH=5.6,FLY=.3,T_KILL=T_RUSH+1.25,cols=['#ffffff','#bfeaff','#ffd54f','#7affc0'],ar=[];let hits=0,flash=0,popT=0;
  for(let i=0;i<N;i++){const u=i/(N-1),b=bs[i%bs.length];
    ar.push({t0:T0+(T1-T0)*(1-Math.pow(1-u,1.8)),h:heroes[i%heroes.length],b,ax:b.x+rand(-190,190),ay:b.y-rand(300,640),tr:T_RUSH+(i%bs.length)*.1+rand(0,.75),c:pick(cols),hit:false,sp:false})}
  const pos=(a,e)=>{const sx=a.h.x,sy=a.h.y-14,tx=a.b.x-a.ax,ty=a.b.y-a.ay,tl=Math.hypot(tx,ty)||1;
    if(e>=a.tr){const kr=clamp((e-a.tr)/FLY,0,1),q=kr*kr;return{x:lerp(a.ax,a.b.x,q),y:lerp(a.ay,a.b.y,q),dx:tx/tl,dy:ty/tl,rush:true,kr}}
    const rk=clamp((e-a.t0)/RISE,0,1),er=1-Math.pow(1-rk,3),ux=a.ax-sx,uy=a.ay-sy,ul=Math.hypot(ux,uy)||1,k=csEase(clamp((e-a.t0-RISE)/TURN,0,1));
    let dx=lerp(ux/ul,tx/tl,k),dy=lerp(uy/ul,ty/tl,k);const dl=Math.hypot(dx,dy)||1;
    return{x:lerp(sx,a.ax,er),y:lerp(sy,a.ay,er)+(rk>=1?Math.sin(e*2.2+a.t0*9)*3:0),dx:dx/dl,dy:dy/dl,rush:false,kr:0}};
  for(const h of heroes)h.facing=-Math.PI/2;
  csActor({upd(a,dt){const e=cutscene.elapsed;flash=Math.max(0,flash-dt*2.5);popT=Math.max(0,popT-dt*5);
      for(const r of ar){
        if(!r.sp&&e>=r.t0){r.sp=true;csBurst(r.h.x,r.h.y-14,2,[r.c,'#ffffff'],150,60);G.shake=Math.max(G.shake,1.2)}
        if(!r.hit&&e>=r.tr+FLY){r.hit=true;hits++;popT=1;const b=r.b;
          csBurst(b.x+rand(-b.r*.7,b.r*.7),b.y+rand(-b.r*.6,b.r*.6),6,[r.c,'#ffffff','#ffd54f'],300,80);b.hitFlash=1;G.shake=Math.max(G.shake,3+Math.min(hits,70)*.1);
          if(hits%4===0)g.texts.push({x:b.x+rand(-24,24),y:b.y-b.r-rand(0,20),vy:-60,life:.7,max:.7,spawn:.7,text:String(randInt(800,9999)),color:pick(['#ffffff','#ffd54f']),size:rand(18,26)});
          if(hits%12===0){csRing(b.x,b.y,150,'#ffffff');flash=.4}}}},
    draw(){const e=cutscene.elapsed,rot=e<T_RUSH?e*.25:T_RUSH*.25+(e-T_RUSH)*10,ca=clamp(e/.4,0,1)*(1-clamp((e-T_RUSH-1.2)/.6,0,1));
      if(ca>0)csCircle(p.x,p.y,100,rot,'#bfeaff',ca*.9);
      if(e>2&&e<T_KILL)for(const b of bs){if(b.dead)continue;const k=clamp((e-2)/1.2,0,1),sh=clamp((e-3.8)/1.8,0,1);csCircle(b.x,b.y,b.r*(2.9-1.1*sh),e*(1+sh*3),e<T_RUSH?'#ffd54f':'#ff5a3a',k*.9)}
      ctx.save();ctx.lineCap='round';
      for(const r of ar){if(e<r.t0||r.hit)continue;const q=pos(r,e),L=q.rush?34+300*q.kr:36,hx=q.x,hy=q.y,tx=hx-q.dx*L,ty=hy-q.dy*L;
        ctx.strokeStyle=csRgba(r.c,q.rush?.6:.45);ctx.lineWidth=q.rush?6:3.5;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(hx,hy);ctx.stroke();
        ctx.strokeStyle='#ffffff';ctx.lineWidth=q.rush?2.2:1.6;ctx.stroke();
        const nx=-q.dy,ny=q.dx;ctx.fillStyle=r.c;ctx.beginPath();ctx.moveTo(hx+q.dx*9,hy+q.dy*9);ctx.lineTo(hx+nx*4,hy+ny*4);ctx.lineTo(hx-nx*4,hy-ny*4);ctx.closePath();ctx.fill()}
      ctx.restore();
      csScreen((W,H,u)=>{const sl=clamp((e-.2)/.6,0,1)*(1-clamp((e-T_RUSH)/.25,0,1)),rs=e>=T_RUSH?1-clamp((e-T_RUSH-.9)/.6,0,1):0;
        if(sl>0){ctx.fillStyle=`rgba(70,95,140,${.28*sl})`;ctx.fillRect(0,0,W,H);const gr=ctx.createRadialGradient(W/2,H/2,H*.3,W/2,H/2,W*.7);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(0,8,30,${.7*sl})`);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
          ctx.fillStyle='#e8f6ff';ctx.globalAlpha=.5*sl;for(let i=0;i<40;i++){const x=((i*151.3+e*6*(1+i%3))%W+W)%W,y=((i*97.7+e*(8+i%4*3)*u)%H+H)%H;ctx.fillRect(x,y,2*u,2*u)}ctx.globalAlpha=1}
        if(rs>0){ctx.strokeStyle=`rgba(255,255,255,${.35*rs})`;ctx.lineWidth=2*u;for(let i=0;i<28;i++){const an=i/28*TAU+Math.sin(i*5.1)*.1,r0=H*(.35+.1*((i*7)%5)/5),r1=r0+H*(.35+.15*Math.sin(e*30+i));ctx.beginPath();ctx.moveTo(W/2+Math.cos(an)*r0,H/2+Math.sin(an)*r0);ctx.lineTo(W/2+Math.cos(an)*r1,H/2+Math.sin(an)*r1);ctx.stroke()}}
        csTitle(W,H,u,e,0,1.9,'T I M E   S L O W S','#d8ecff');csTitle(W,H,u,e,T_RUSH,1.2,'R E L E A S E','#ffd54f');
        if(hits>0&&e<T_KILL){ctx.save();ctx.textAlign='right';ctx.shadowColor='#000';ctx.shadowBlur=10;ctx.font=`bold ${Math.round((40+popT*14)*u)}px 'Trebuchet MS'`;ctx.fillStyle=hits>60?'#ffd54f':'#ffffff';ctx.fillText(hits+' HITS',W-40*u,H*.22);ctx.restore()}
        if(e>=T_RUSH&&e<T_RUSH+.15){ctx.fillStyle=`rgba(255,255,255,${FL(.8*(1-(e-T_RUSH)/.15))})`;ctx.fillRect(0,0,W,H)}
        if(flash>0){ctx.fillStyle=`rgba(255,255,255,${FL(flash*.45)})`;ctx.fillRect(0,0,W,H)}
        csFlash(W,H,'255,255,255',e,T_KILL,1.3)})}});
  startCutscene({duration:T_KILL+2.1,cameraTarget:{x:cx,y:cy},script:[
    {at:.05,fn:()=>{G.shake=8;csRing(p.x,p.y,260,'#bfeaff');showCutsceneDialogue(C.name,'Breathe in. Time bends to my arrow.',C.icon,1.9)}},
    {at:3.0,fn:()=>showCutsceneDialogue(C.name,'One arrow for every sin.',C.icon,1.5)},
    {at:T_RUSH-.3,fn:()=>showCutsceneDialogue(C.name,'RELEASE!!',C.icon,1.2)},
    {at:T_RUSH,fn:()=>{G.shake=18;csRing(p.x,p.y,360,'#ffffff');for(const b of bs)csRing(b.x,b.y,200,'#ff5a3a')}},
    {at:T_KILL,fn:()=>{G.shake=34;for(const b of bs){if(b.dead)continue;csBurst(b.x,b.y,70,[b.color,b.dark,'#ffffff','#ffd54f'],520,100);csRing(b.x,b.y,280,b.color);csRing(b.x,b.y,150,'#ffffff')}finisherKillAll(g,bs)}},
    {at:T_KILL+.7,fn:()=>showCutsceneDialogue(C.name,'Not one... missed.',C.icon,1.5)},{at:T_KILL+2.0,fn:endCutscene}],
    callbacks:{onEnd:()=>finisherWin(g,bs)}})}

/* HEALER - DIVINE JUDGMENT: columns of holy light lock on, slam down, and carry each boss up into the light */
function startHealerFinisher(g){
  const S=finisherBegin(g);if(!S)return;const{p,bs,heroes,cx,cy,C}=S;
  const T_LOCK=2.2,T_CALL=4.6,T_KILL=T_CALL+2.5,gy=b=>b.y+b.r*.55;let flash=0;
  const width=(b,bi,e)=>{if(e<T_CALL)return 10+3*Math.sin(e*22+bi);const s=clamp((e-T_CALL)/.28,0,1),sw=1-(1-s)*(1-s);
    return lerp(12,b.r*3.2,sw)*(1+.06*Math.sin(e*14+bi))*(1+.6*clamp((e-(T_KILL-.8))/.8,0,1))};
  const pillar=(x,y0,y1,w,al)=>{ctx.save();ctx.globalCompositeOperation='lighter';
    let gr=ctx.createLinearGradient(x-w,0,x+w,0);gr.addColorStop(0,'rgba(255,200,90,0)');gr.addColorStop(.35,`rgba(255,226,140,${.55*al})`);gr.addColorStop(.5,`rgba(255,255,235,${.95*al})`);gr.addColorStop(.65,`rgba(255,226,140,${.55*al})`);gr.addColorStop(1,'rgba(255,200,90,0)');
    ctx.fillStyle=gr;ctx.fillRect(x-w,y0,w*2,y1-y0);
    ctx.save();ctx.translate(x,y1);ctx.scale(1,.4);gr=ctx.createRadialGradient(0,0,0,0,0,w*1.8);gr.addColorStop(0,`rgba(255,250,225,${.9*al})`);gr.addColorStop(.5,`rgba(255,215,120,${.45*al})`);gr.addColorStop(1,'rgba(255,200,90,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,w*1.8,0,TAU);ctx.fill();ctx.restore();
    ctx.strokeStyle=`rgba(255,240,190,${.22*al})`;ctx.lineWidth=2;for(let i=0;i<10;i++){const an=-Math.PI/2+(i-4.5)*.12;ctx.beginPath();ctx.moveTo(x,y1);ctx.lineTo(x+Math.cos(an)*(y1-y0)*.6,y1+Math.sin(an)*(y1-y0)*.9);ctx.stroke()}
    ctx.restore()};
  for(const h of heroes)h.facing=Math.atan2(cy-h.y,cx-h.x);
  csActor({upd(a,dt){const e=cutscene.elapsed;flash=Math.max(0,flash-dt*2);
      bs.forEach((b,bi)=>{if(b.dead)return;const tl=T_LOCK+bi*.5;
        if(e>T_CALL+.35){const s=clamp((e-T_CALL-.35)/2,0,1);b.lift=csEase(s)*320+.01;b.ghost=1-clamp((e-T_CALL-.9)/1.4,0,1)*.97}
        if(e>tl&&e<T_KILL){const w=width(b,bi,e),n=e>=T_CALL?4:1;for(let i=0;i<n;i++){G.particles.push({x:b.x+rand(-w,w),y:gy(b)-rand(0,60),vx:rand(-20,20),vy:-rand(80,220),life:1.2,max:1.2,size:rand(2,5),color:pick(['#fff6b0','#ffffff','#ffe082'])})}
          if(rng()<.5)G.particles.push({x:b.x+rand(-120,120),y:b.y-rand(380,620),vx:rand(-25,25),vy:rand(60,130),life:2,max:2,size:rand(3,5),color:'#ffffff'})}});
      if(e>T_CALL&&e<T_KILL)G.shake=Math.max(G.shake,5+clamp((e-T_KILL+1.2)/1.2,0,1)*9)},
    drawGround(){const e=cutscene.elapsed;if(e>T_KILL+.5)return;const fo=1-clamp((e-T_KILL)/.5,0,1);
      csCircle(p.x,p.y-30,110,e*.8,'#ffe082',clamp(e/.6,0,1)*(1-clamp((e-T_LOCK)/1,0,1)*.5)*fo*.9);
      bs.forEach((b,bi)=>{const tl=T_LOCK+bi*.5;if(e<tl)return;const R=b.r*2.4*clamp((e-tl)/.7,0,1)*(1+.5*clamp((e-T_CALL)/.4,0,1));csCircle(b.x,gy(b)-R*.35,R,e*(e<T_CALL?1:4),'#ffe082',fo)})},
    draw(){const e=cutscene.elapsed;
      if(e<T_KILL+.4)bs.forEach((b,bi)=>{const tl=T_LOCK+bi*.5;if(e<tl)return;const grow=clamp((e-tl)/.5,0,1),y1=gy(b),top=b.y-1300,hd=e>=T_CALL?lerp(top,y1,clamp((e-T_CALL)/.18,0,1)):lerp(top,y1,grow);
        pillar(b.x,top,e>=T_CALL?Math.max(hd,top+1):hd,width(b,bi,e),e<T_CALL?.7:1)});
      ctx.save();ctx.textAlign='center';ctx.font="bold 18px 'Trebuchet MS'";ctx.fillStyle='#9bffb5';ctx.shadowColor='#5aff8a';ctx.shadowBlur=10;
      if(e<T_CALL+.5)heroes.forEach((h,hi)=>{for(let j=0;j<3;j++){const t=(e*.7+j/3+hi*.17)%1;ctx.globalAlpha=Math.sin(t*Math.PI)*clamp(e/.6,0,1);ctx.fillText('✚',h.x+Math.sin(e*2+j*2+hi)*18+(j-1)*16,h.y-20-t*90)}});ctx.restore();
      csScreen((W,H,u)=>{const w=clamp(e/1.5,0,1)*(1-clamp((e-T_KILL-.3)/1.2,0,1)),sl=clamp((e-T_CALL)/.4,0,1)*(1-clamp((e-T_KILL)/.5,0,1));
        ctx.fillStyle=`rgba(255,225,150,${.14*w+.12*sl})`;ctx.fillRect(0,0,W,H);
        const gr=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,W*.7);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(255,248,215,${.45*sl+.15*w})`);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
        csTitle(W,H,u,e,0,2.1,'D I V I N E   J U D G M E N T','#fff0b0');csTitle(W,H,u,e,T_CALL,1.4,'J U D G M E N T','#ffffff');
        if(flash>0){ctx.fillStyle=`rgba(255,250,225,${FL(flash*.7)})`;ctx.fillRect(0,0,W,H)}
        csFlash(W,H,'255,252,235',e,T_KILL,1.5)})}});
  startCutscene({duration:T_KILL+2.1,cameraTarget:{x:cx,y:cy},script:[
    {at:.05,fn:()=>{G.shake=6;csRing(p.x,p.y,280,'#ffe082');csRing(p.x,p.y,140,'#ffffff');showCutsceneDialogue(C.name,'Light... hear my prayer.',C.icon,1.9)}},
    ...bs.map((b,bi)=>({at:T_LOCK+bi*.5,fn:()=>{if(!b.dead){csRing(b.x,gy(b),b.r*2.4,'#ffe082');G.shake=Math.max(G.shake,4)}}})),
    {at:3.4,fn:()=>showCutsceneDialogue(C.name,'Be cleansed.',C.icon,1.3)},
    {at:T_CALL,fn:()=>{flash=1;G.shake=30;for(const b of bs){if(b.dead)continue;csRing(b.x,gy(b),340,'#ffffff');csRing(b.x,gy(b),200,'#ffe082');csBurst(b.x,gy(b),40,['#fff6b0','#ffffff','#ffe082'],420,200)}}},
    {at:T_CALL+.4,fn:()=>showCutsceneDialogue(C.name,'Ascend... and be forgiven!',C.icon,1.8)},
    {at:T_KILL,fn:()=>{G.shake=32;for(const b of bs){if(b.dead)continue;csBurst(b.x,b.y-b.lift,80,['#fff6b0','#ffffff','#ffe082',b.color],520,160);csRing(b.x,b.y-b.lift,300,'#ffffff')}finisherKillAll(g,bs)}},
    {at:T_KILL+.6,fn:()=>showCutsceneDialogue(C.name,'Go in peace.',C.icon,1.5)},{at:T_KILL+2.0,fn:endCutscene}],
    callbacks:{onEnd:()=>finisherWin(g,bs)}})}

/* NECROMANCER + DEMON share one engine: the ground opens, arms erupt, grab the boss, and drag it down */
function startDragDownFinisher(g,cfg){
  const S=finisherBegin(g);if(!S)return;const{p,bs,heroes,cx,cy,C}=S;
  const E=cfg.ease,T_KILL=cfg.tSink+cfg.sinkLen+.1,gy=b=>b.y+b.r*.55,hands=[],rise=[];let flash=0;
  bs.forEach((b,bi)=>{for(let i=0;i<cfg.hands;i++){const a=i/cfg.hands*TAU+rand(-.25,.25),d=b.r*rand(1.15,2.3);
      hands.push({b,x:b.x+Math.cos(a)*d,y:gy(b)+Math.sin(a)*d*.45,th:cfg.h0+rand(0,cfg.h1-cfg.h0)+bi*.1,h:rand(cfg.hMin,cfg.hMax),ph:rand(0,TAU)})}
    for(let i=0;i<cfg.rise;i++)rise.push({b,t:cfg.tSink+rand(-.2,cfg.sinkLen),x:rand(-b.r*1.4,b.r*1.4),sp:rand(90,160),sz:rand(22,34)})});
  hands.sort((a,b)=>a.y-b.y);
  for(const h of heroes)h.facing=Math.atan2(cy-h.y,cx-h.x);
  csActor({upd(a,dt){const e=cutscene.elapsed;flash=Math.max(0,flash-dt*2);const sk=E(clamp((e-cfg.tSink)/cfg.sinkLen,0,1));
      for(const b of bs)if(!b.dead)b.sink=sk;
      if(e>cfg.tSink&&e<T_KILL)G.shake=Math.max(G.shake,5+sk*9);else if(e>1.3&&e<cfg.tSink)G.shake=Math.max(G.shake,1.2+(e-1.3)*.3);
      if(e>cfg.crack0&&e<T_KILL)for(const b of bs){if(b.dead)continue;const an=rand(0,TAU),d=b.r*rand(0,2.2);
        G.particles.push({x:b.x+Math.cos(an)*d,y:gy(b)+Math.sin(an)*d*.45,vx:rand(-15,15),vy:-rand(cfg.pv0,cfg.pv1),life:1.2,max:1.2,size:rand(2,5),color:pick(cfg.pc)})}},
    drawGround(){const e=cutscene.elapsed,cl=1-clamp((e-T_KILL)/1.2,0,1);if(cl<=0)return;
      bs.forEach((b,bi)=>{const x=b.x,y=gy(b),ck=clamp((e-cfg.crack0)/2.2,0,1),ok=clamp((e-(cfg.open0+bi*cfg.openStep))/cfg.openLen,0,1)*(1-clamp((e-T_KILL-.2)/.8,0,1)),R=b.r*3*ck;
        if(ck>0){ctx.save();ctx.globalAlpha=.85*cl;ctx.strokeStyle=cfg.c1;ctx.lineWidth=3;ctx.shadowColor=cfg.c1;ctx.shadowBlur=12;ctx.lineJoin='round';
          for(let i=0;i<9;i++){const an=i/9*TAU+.3;ctx.beginPath();ctx.moveTo(x,y);for(let j=1;j<=6;j++){const w=Math.sin(j*2.1+i*3.3)*.2,d=R*j/6;ctx.lineTo(x+Math.cos(an+w)*d,y+Math.sin(an+w)*d*.45)}ctx.stroke()}ctx.restore()}
        if(ok>0){const rx=b.r*2.5*ok;ctx.save();ctx.translate(x,y);ctx.scale(1,.45);
          if(cfg.pit==='portal'){let gr=ctx.createRadialGradient(0,0,0,0,0,rx);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(.55,'rgba(120,0,0,.96)');gr.addColorStop(.85,'rgba(255,90,20,.95)');gr.addColorStop(1,'rgba(255,200,60,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,rx,0,TAU);ctx.fill();
            ctx.save();ctx.rotate(e*1.6);ctx.strokeStyle='rgba(255,140,50,.75)';ctx.lineWidth=3;for(let i=0;i<5;i++){ctx.beginPath();for(let j=0;j<=14;j++){const t=j/14,an=i/5*TAU+t*3.2;ctx.lineTo(Math.cos(an)*t*rx*.95,Math.sin(an)*t*rx*.95)}ctx.stroke()}ctx.restore();
            ctx.strokeStyle='#ffb040';ctx.lineWidth=4;ctx.shadowColor='#ff4a10';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(0,0,rx*.97,0,TAU);ctx.stroke()}
          else{const gr=ctx.createRadialGradient(0,0,0,0,0,rx);gr.addColorStop(0,'rgba(0,6,2,1)');gr.addColorStop(.6,'rgba(4,22,10,.96)');gr.addColorStop(1,'rgba(30,90,50,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,rx,0,TAU);ctx.fill();
            ctx.strokeStyle=cfg.c1;ctx.lineWidth=3;ctx.shadowColor=cfg.c1;ctx.shadowBlur=14;ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(0,0,rx*.95,0,TAU);ctx.stroke()}
          ctx.restore();
          if(cfg.pit==='portal')csCircle(x,y-rx*.35,rx*1.15,e,'#ff3a1a',ok*.8)}})},
    draw(){const e=cutscene.elapsed;
      if(e<3.2)csCircle(p.x,p.y-30,100,e,cfg.c1,clamp(e/.5,0,1)*(1-clamp((e-2.6)/.6,0,1)));
      const gk=csEase(clamp((e-cfg.tGrab)/.5,0,1)),sk=E(clamp((e-cfg.tSink)/cfg.sinkLen,0,1));
      for(const h of hands){const b=h.b,gr=clamp((e-h.th)/.55,0,1);if(gr<=0)continue;const dx=b.x-h.x,dl=Math.hypot(dx,b.y-h.y)||1,
          lean=clamp(dx/dl,-1,1)*gk*.9+Math.sin(e*2+h.ph)*.08*(1-gk),hh=h.h*csEase(gr)*(1+gk*.5)*(1-sk*.85);
        csArm(h.x,h.y+sk*b.r*.4,hh,lean,gk,cfg.arm,(1-clamp((e-T_KILL)/.4,0,1)))}
      ctx.save();ctx.textAlign='center';for(const r of rise){const k=(e-r.t)/1.5;if(k<=0||k>=1)continue;ctx.globalAlpha=Math.sin(k*Math.PI)*.9;ctx.shadowColor=cfg.c1;ctx.shadowBlur=14;ctx.font=`${Math.round(r.sz)}px 'Trebuchet MS'`;ctx.fillText(cfg.riseIcon,r.b.x+r.x+Math.sin(e*3+r.sp)*10,gy(r.b)-k*r.sp*1.6)}ctx.restore();
      if(e>=T_KILL&&e<T_KILL+1.1){const k=(e-T_KILL)/1.1;ctx.save();ctx.globalCompositeOperation='lighter';
        for(const b of bs){const x=b.x,y=gy(b),h=720*(1-(1-k)*(1-k)),w=b.r*(1.5-.8*k),gr=ctx.createLinearGradient(0,y,0,y-h);gr.addColorStop(0,csRgba(cfg.c2,.95*(1-k*k)));gr.addColorStop(.5,csRgba(cfg.c1,.7*(1-k*k)));gr.addColorStop(1,csRgba(cfg.c1,0));ctx.fillStyle=gr;ctx.beginPath();
          for(let j=0;j<=16;j++){const t=j/16,xx=x-w*(1-t*.85)+Math.sin(e*20+t*8)*w*.12;j?ctx.lineTo(xx,y-h*t):ctx.moveTo(xx,y-h*t)}
          for(let j=16;j>=0;j--){const t=j/16,xx=x+w*(1-t*.85)+Math.sin(e*20+t*8+2)*w*.12;ctx.lineTo(xx,y-h*t)}ctx.closePath();ctx.fill()}ctx.restore()}
      csScreen((W,H,u)=>{const a=clamp((e-.2)/1.4,0,1)*(1-clamp((e-T_KILL-.4)/1.4,0,1));
        ctx.fillStyle=`rgba(${cfg.tint},${.32*a})`;ctx.fillRect(0,0,W,H);const gr=ctx.createRadialGradient(W/2,H/2,H*.22,W/2,H/2,W*.68);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(${cfg.vig},${.78*a})`);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
        ctx.fillStyle=cfg.c2;ctx.globalAlpha=.6*a;for(let i=0;i<40;i++){const x=((i*131.7+Math.sin(e*.8+i)*24)%W+W)%W,y=H-(((e*(40+i%5*18)*u+i*53)%H)+H)%H;ctx.fillRect(x,y,(1.5+i%3)*u,(1.5+i%3)*u)}ctx.globalAlpha=1;
        csTitle(W,H,u,e,0,2.4,cfg.title,cfg.titleCol);csTitle(W,H,u,e,cfg.tSink,1.6,cfg.title2,cfg.col2);
        if(flash>0){ctx.fillStyle=`rgba(${cfg.flash},${FL(flash*.6)})`;ctx.fillRect(0,0,W,H)}
        csFlash(W,H,cfg.flash,e,T_KILL,1.0)})}});
  startCutscene({duration:T_KILL+2.0,cameraTarget:{x:cx,y:cy},script:[
    {at:.05,fn:()=>{G.shake=9;csRing(p.x,p.y,300,cfg.c1);showCutsceneDialogue(C.name,cfg.lines[0],C.icon,1.8)}},
    ...bs.map((b,bi)=>({at:cfg.open0+bi*cfg.openStep,fn:()=>{if(!b.dead){csRing(b.x,gy(b),b.r*2.4,cfg.c1);G.shake=Math.max(G.shake,4)}}})),
    {at:2.9,fn:()=>showCutsceneDialogue(C.name,cfg.lines[1],C.icon,1.6)},
    {at:cfg.tGrab,fn:()=>{G.shake=Math.max(G.shake,12);for(const b of bs)if(!b.dead){csRing(b.x,gy(b),b.r*2.2,cfg.c2);csBurst(b.x,gy(b),20,cfg.pc,300,120)}}},
    {at:cfg.tSink,fn:()=>{G.shake=Math.max(G.shake,16);for(const b of bs)if(!b.dead)csRing(b.x,gy(b),b.r*3,cfg.c1)}},
    {at:T_KILL,fn:()=>{flash=.9;G.shake=32;for(const b of bs){if(b.dead)continue;csBurst(b.x,gy(b),70,cfg.pc,560,200);csRing(b.x,gy(b),320,cfg.c1);csRing(b.x,gy(b),180,cfg.c2)}finisherKillAll(g,bs)}},
    {at:T_KILL+.5,fn:()=>showCutsceneDialogue(C.name,cfg.lines[2],C.icon,1.6)},{at:T_KILL+1.9,fn:endCutscene}],
    callbacks:{onEnd:()=>finisherWin(g,bs)}})}
function startNecroFinisher(g){startDragDownFinisher(g,{title:'T H E   D E A D   R I S E',titleCol:'#9bffb5',title2:'D R A G G E D   D O W N',col2:'#d8ffe4',c1:'#5aff8a',c2:'#d8ffe4',pc:['#7aff9a','#c8ffd8','#2aff7a'],tint:'8,40,20',vig:'0,12,5',flash:'210,255,225',
  arm:{arm:'#d9dfc9',glow:'#5aff8a',w:5,fw:2.6,fl:12,claw:false},hands:16,h0:1.3,h1:3.9,hMin:48,hMax:96,crack0:1.0,open0:3.6,openStep:.25,openLen:1.2,pit:'grave',tGrab:4.3,tSink:4.7,sinkLen:2.2,ease:csEase,rise:9,riseIcon:'💀',pv0:40,pv1:130,
  lines:['Rise, my children.','Take them. Drag them down.','Rest. The dead keep what they take.']})}
function startDemonFinisher(g){startDragDownFinisher(g,{title:'G A T E   O F   H E L L',titleCol:'#ff6a3a',title2:'D E S C E N D',col2:'#ffd060',c1:'#ff4a1a',c2:'#ffd060',pc:['#ff5020','#ffb040','#ffe082'],tint:'70,6,0',vig:'25,0,0',flash:'255,170,80',
  arm:{arm:'#3d0a0a',glow:'#ff4a10',w:10,fw:5.5,fl:17,claw:true},hands:5,h0:4.35,h1:4.7,hMin:100,hMax:150,crack0:1.2,open0:2.0,openStep:.45,openLen:1.8,pit:'portal',tGrab:4.4,tSink:4.9,sinkLen:1.8,ease:k=>k*k,rise:8,riseIcon:'🔥',pv0:90,pv1:220,
  lines:['Open. Open wide.','Hell is hungry.','Burn forever.']})}
const FINISHERS={Mage:{name:'ABSOLUTE ZERO',fn:startMageFinisher},Ranger:{name:'ARROWFALL',fn:startRangerFinisher},Necromancer:{name:'THE DEAD RISE',fn:startNecroFinisher},Healer:{name:'DIVINE JUDGMENT',fn:startHealerFinisher},Demon:{name:'GATE OF HELL',fn:startDemonFinisher}};
function startFinisherCutscene(g){
  const fd=FINISHERS[(CLASSES[g.player.cls]||{}).roleTag];if(fd)return fd.fn(g);
  const f=g.finale;f.ready=false;const p=g.player,bs=f.bosses.filter(e=>!e.dead);if(!bs.length)return;
  const heroes=[p,...g.minions.filter(m=>m.finaleAlly&&m.hp>0)];let cx=p.x,cy=p.y;for(const e of bs){cx+=e.x;cy+=e.y}cx/=bs.length+1;cy/=bs.length+1;
  const slashes=[],trails=[],cols=['#ffffff','#bfeaff','#ffd54f','#ff9bd0'];let nextS=1.0,n=0,combo=0,flash=0,popT=0,boomed=false;
  const boom=()=>{if(boomed)return;boomed=true;g._finaleKill=true;for(const b of bs){if(b.dead)continue;b.hp=0;killEnemy(b,g);csBurst(b.x,b.y,70,[b.color,b.dark,'#ffffff','#ffd54f'],520,100);csRing(b.x,b.y,280,b.color);csRing(b.x,b.y,150,'#ffffff')}g._finaleKill=false;G.shake=34};
  csActor({upd(a,dt){const e=cutscene.elapsed;flash=Math.max(0,flash-dt*3);popT=Math.max(0,popT-dt*5);
      while(e>=nextS&&nextS<7.2){const b=bs[n%bs.length],h=heroes[n%heroes.length],an=rand(0,TAU),d=b.r+36,ox=h.x,oy=h.y;
        h.x=b.x+Math.cos(an)*d;h.y=b.y+Math.sin(an)*d*.8;h.facing=Math.atan2(b.y-h.y,b.x-h.x);
        trails.push({x1:ox,y1:oy,x2:h.x,y2:h.y,life:.25,max:.25,c:h.accent||'#bfeaff'});
        const sa=rand(0,TAU);slashes.push({x:b.x,y:b.y,a:sa,len:b.r*2.2+40,life:.22,max:.22,c:pick(cols)});
        b.hitFlash=1;combo++;popT=1;csBurst(b.x,b.y,6,[b.color,'#ffffff','#ffd54f'],260);G.shake=Math.max(G.shake,2.5+Math.min(n,30)*.12);
        if(n%3===0)g.texts.push({x:b.x+rand(-20,20),y:b.y-b.r-rand(0,20),vy:-60,life:.7,max:.7,spawn:.7,text:String(randInt(800,9999)),color:pick(['#ffffff','#ffd54f']),size:rand(18,26)});
        if(n%7===6){csRing(b.x,b.y,120,'#ffffff');flash=.5;slashes.push({x:b.x,y:b.y,a:sa+1.6,len:b.r*2.6+60,life:.28,max:.28,c:'#ffffff'})}
        n++;const pr=Math.min(1,(nextS-1)/6.2);nextS+=lerp(.36,.07,pr)}
      for(const s of slashes)s.life-=dt;for(const t of trails)t.life-=dt;
      for(let i=slashes.length-1;i>=0;i--)if(slashes[i].life<=0)slashes.splice(i,1);for(let i=trails.length-1;i>=0;i--)if(trails[i].life<=0)trails.splice(i,1)},
    draw(){const e=cutscene.elapsed;ctx.save();ctx.lineCap='round';
      for(const t of trails){const k=t.life/t.max;ctx.strokeStyle=csRgba(/^#[0-9a-f]{6}$/i.test(t.c)?t.c:'#bfeaff',.6*k);ctx.lineWidth=12*k;ctx.beginPath();ctx.moveTo(t.x1,t.y1);ctx.lineTo(t.x2,t.y2);ctx.stroke();ctx.strokeStyle=`rgba(255,255,255,${k})`;ctx.lineWidth=3*k;ctx.stroke()}
      for(const s of slashes){const k=s.life/s.max;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a);ctx.globalAlpha=Math.min(1,k*1.4);ctx.shadowColor=s.c;ctx.shadowBlur=22;ctx.fillStyle=s.c;
        const L=s.len*(1.15-k*.3);ctx.beginPath();ctx.moveTo(-L/2,0);ctx.quadraticCurveTo(0,-L*.2,L/2,0);ctx.quadraticCurveTo(0,-L*.03,-L/2,0);ctx.fill();ctx.restore()}
      ctx.restore();
      csScreen((W,H,u)=>{const fz=e<7.4?clamp(e/.35,0,1):0;
        if(fz>0){ctx.fillStyle=`rgba(30,60,130,${.32*fz})`;ctx.fillRect(0,0,W,H);const gr=ctx.createRadialGradient(W/2,H/2,H*.3,W/2,H/2,W*.7);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(0,10,40,${.7*fz})`);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H)}
        if(flash>0){ctx.fillStyle=`rgba(255,255,255,${FL(flash*.5)})`;ctx.fillRect(0,0,W,H)}
        ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=10;
        if(e<1.3){const q=clamp(e/.3,0,1),k=q*q*(3-2*q)*(1-clamp((e-.9)/.4,0,1));ctx.globalAlpha=k;ctx.font=`bold ${Math.round(70*u*(1.25-.25*k))}px 'Trebuchet MS'`;ctx.fillStyle='#bfeaff';ctx.fillText('T I M E   S T O P',W/2,H*.3)}
        if(combo>0&&e<7.4){ctx.globalAlpha=1;ctx.textAlign='right';ctx.font=`bold ${Math.round((40+popT*14)*u)}px 'Trebuchet MS'`;ctx.fillStyle=combo>30?'#ffd54f':'#ffffff';ctx.fillText(combo+' HITS',W-40*u,H*.22)}
        if(e>7.3){const w=clamp(1-(e-7.4)/1.1,0,1)*(e>=7.4?1:(e-7.3)/.1);ctx.globalAlpha=1;ctx.fillStyle=`rgba(255,255,255,${FL(w)})`;ctx.fillRect(0,0,W,H)}})}});
  const pc=CLASSES[p.cls]||{name:'Hero',icon:'⚔'};
  startCutscene({duration:9.8,cameraTarget:{x:cx,y:cy},script:[
    {at:.05,fn:()=>{G.shake=8;csRing(p.x,p.y,320,'#ffffff');csRing(p.x,p.y,160,'#bfeaff');showCutsceneDialogue(pc.name,'Now — all together!',pc.icon,1.3)}},
    {at:7.4,fn:boom},{at:8.1,fn:()=>showCutsceneDialogue(pc.name,'It... is over.',pc.icon,1.6)},{at:9.5,fn:endCutscene}],
    callbacks:{onEnd:()=>{boom();f.done=true;g._finaleDone=true;
      addToast('THE FIVE THRONES HAVE FALLEN','#ffd54f','The Rift is sealed');
      const v=document.getElementById('victoryCard');if(v){v.classList.add('on');setTimeout(()=>v.classList.remove('on'),7000)}}}})}
addEventListener('keydown',ev=>{if(!G||!G.running||!G.finale||!G.finale.ready||cutscene.active||G.paused)return;
  if((ev.key||'').toLowerCase()==='r'&&!ev.repeat){ev.preventDefault();ev.stopPropagation();startFinisherCutscene(G)}},true);
document.addEventListener('click',ev=>{if(ev.target&&ev.target.closest&&ev.target.closest('#fhPrompt')&&G&&G.finale&&G.finale.ready&&!cutscene.active)startFinisherCutscene(G)});

function drawBossRage(e) {
  const t = G.time, pul = 0.5 + 0.5 * Math.sin(t * 8);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const r = e.r * (1.6 + 0.2 * pul);
  const gr = ctx.createRadialGradient(e.x, e.y, e.r * 0.3, e.x, e.y, r);
  gr.addColorStop(0, 'rgba(255,40,30,0.6)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill(); ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.35 + 0.15 * pul; ctx.fillStyle = '#ff1a1a';
  ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.95, 0, TAU); ctx.fill(); ctx.restore();
}
function drawCutsceneGuest(a) {
  const fall = a.fallT < 1, h = fall ? 620 * (1 - a.fallT * a.fallT) : 0;
  const fade = a.fade === undefined ? 1 : a.fade;
  ctx.save(); ctx.globalAlpha = fade;
  const ss = 0.4 + 0.6 * a.fallT;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(a.x, a.y + 17, 18 * ss, 8 * ss, 0, 0, TAU); ctx.fill();
  if (fall) {
    ctx.save(); ctx.globalAlpha = 0.55 * fade; ctx.strokeStyle = a.accent; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y - h - 24); ctx.lineTo(a.x, a.y - h - 150); ctx.stroke(); ctx.restore();
  }
  if (a.charging) {
    const pul = 0.5 + 0.5 * Math.sin(G.time * 18), R = 60 + 40 * pul;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(a.x, a.y, 4, a.x, a.y, R);
    gr.addColorStop(0, a.accent); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.7; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(a.x, a.y, R, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.save(); ctx.translate(a.x, a.y - h);
  const grd = ctx.createLinearGradient(0, -18, 0, 20);
  grd.addColorStop(0, shadeColor(a.color, 0.25)); grd.addColorStop(1, shadeColor(a.color, -0.45));
  ctx.fillStyle = grd; roundRect(-9, -14, 18, 32, 5); ctx.fill();
  ctx.fillStyle = a.accent; ctx.fillRect(-9, -2, 18, 2);
  ctx.fillStyle = shadeColor(a.color, -0.5); roundRect(-9, -14, 18, 5, 3); ctx.fill();
  ctx.fillStyle = '#d8b090'; ctx.beginPath(); ctx.arc(0, -20, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = a.accent; ctx.shadowColor = a.accent; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(-2.5, -20, 1.2, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(2.5, -20, 1.2, 0, TAU); ctx.fill();
  ctx.restore(); ctx.restore();
}
function startCryptDefeatCutscene(g, boss) {
  const p = g.player, px = p.x, py = p.y;
  const keys = Object.keys(CLASSES).filter(k => k !== p.cls);
  const C = CLASSES[pick(keys)];
  const ultName = (typeof ULT_NAMES !== 'undefined' && ULT_NAMES[C.roleTag]) || 'Apocalypse';
  const gx = px + 80, gy = py - 20;
  let guest = null;
  const finishFlee = () => {
    if (boss._fled) return;
    boss._fled = true; boss.dead = true; boss._redAura = false;
    for (const en of g.enemies) if (!en.dead && !en.boss) killEnemy(en, g);
    gainXP(boss.xp, g);
    dropGold(g, boss.x, boss.y, Math.round((boss.gold || 300) * 2));
    addToast('THE NAGA RAJA WITHDRAWS', '#ffd54f', 'The heads will return...');
  };
  const spawnBatch = () => {
    for (let i = 0; i < 10; i++) {
      const an = rand(0, TAU), r = 70 + Math.pow(rng(), 0.7) * 360;
      cutscene.actors.push({ type: 'slime', x: px + Math.cos(an) * r, y: py + Math.sin(an) * r, r: 14, scale: 0, grow: 0,
        idx: rng() * 10, dead: false, eating: null, bob: 0 });
    }
  };
  const script = [
    { at: 0.1, fn: () => { cutscene.camera.targetX = (px + boss.x) / 2; cutscene.camera.targetY = (py + boss.y) / 2; } },
    { at: 0.3, fn: () => showCutsceneDialogue('Naga Raja', 'Impossible... a mortal dares wound MY FIVE HEADS?!', '💀', 2.4) },
    { at: 2.8, fn: () => { boss._redAura = true; g.shake = 12; g.fx.push({ type: 'ring', x: boss.x, y: boss.y, r: 200, life: .7, max: .7, color: '#ff2a1a' }); } },
    { at: 3.2, fn: () => { g.shake = 16; showCutsceneDialogue('Naga Raja', 'THE FIVE HEADS WILL FIND YOU!!!', '💀', 2.2); } },
    { at: 5.6, fn: () => { showCutsceneDialogue('Naga Raja', 'Rise, my brood! A hundred thousand strong!', '💀', 2.6); cutscene.camera.targetX = px; cutscene.camera.targetY = py; } },
    { at: 6.0, fn: () => addToast('THE SWARM', '#4aff8a', '100,000 slimes!') }
  ];
  for (let i = 0; i < 14; i++) script.push({ at: 6.0 + i * 0.22, fn: spawnBatch });
  script.push(
    { at: 10.4, fn: () => {
        guest = { type: 'guest', x: gx, y: gy, fallT: 0, color: C.color, accent: C.accent, dead: false };
        cutscene.actors.push(guest); cutscene.camera.targetX = gx; cutscene.camera.targetY = gy; } },
    { at: 11.8, fn: () => showCutsceneDialogue(C.name, 'Looks like you could use a hand!', C.icon || '⚔', 1.9) },
    { at: 13.8, fn: () => { if (guest) guest.charging = true; g.shake = 8; showCutsceneDialogue(C.name, ultName + ' — UNLEASH!', C.icon || '⚔', 1.3); } },
    { at: 15.0, fn: () => {
        g.shake = 28;
        g.fx.push({ type: 'nova', x: gx, y: gy, r: 700, life: .9, max: .9, color: C.accent });
        g.fx.push({ type: 'ring', x: gx, y: gy, r: 500, life: .7, max: .7, color: '#ffffff' });
        g.fx.push({ type: 'ring', x: gx, y: gy, r: 300, life: .5, max: .5, color: C.color });
        if (guest) guest.charging = false;
        for (const a of cutscene.actors) if (a.type === 'slime' && !a.dead) a.vanishDelay = Math.hypot(a.x - gx, a.y - gy) / 900;
        for (const en of g.enemies) if (!en.dead && !en.boss) killEnemy(en, g);
        cutscene.camera.targetX = (gx + boss.x) / 2; cutscene.camera.targetY = (gy + boss.y) / 2; } },
    { at: 17.2, fn: () => showCutsceneDialogue('Naga Raja', 'Curse you... the heads do NOT die! I WILL FIND YOU!', '💀', 2.4) },
    { at: 19.8, fn: () => {
        g.portals.push({ x: boss.x, y: boss.y, life: 1.1, max: 1.1, color: '#ff3030', r: 70, rot: 0 });
        g.fx.push({ type: 'ring', x: boss.x, y: boss.y, r: 160, life: .6, max: .6, color: '#ff3030' });
        finishFlee(); } },
    { at: 20.4, fn: () => showCutsceneDialogue(C.name, "He'll be back. Stay sharp.", C.icon || '⚔', 1.6) },
    { at: 22.0, fn: () => { if (guest) guest.fading = true; } }
  );
  startCutscene({
    duration: 23.0,
    cameraTarget: { x: (px + boss.x) / 2, y: (py + boss.y) / 2 },
    script,
    callbacks: { onEnd: () => finishFlee() }
  });
}

/* Biomes — Angkor Khmer Era Temple Realms */

/* dev hook declared inside the engine bundle */
export function getBiomeForWave(w){const i=Math.min(BIOMES.length-1,Math.floor((w-1)/10));return BIOMES[i]}
function isBossWave(w){return w%10===0}
function isEliteWave(w){return w%5===0&&!isBossWave(w)}





/* Items */






function rollAffix(k,w,m){switch(k){
  case 'dmg':return Math.round(rand(2,5)*m*(1+w*0.16));
  case 'hp':return Math.round(rand(10,26)*m*(1+w*0.20));
  case 'armor':return Math.round(rand(6,16)*m*(1+w*0.22));
  case 'speed':return Math.round(rand(3,9)*m);
  case 'crit':return +(rand(0.01,0.03)*m).toFixed(3);
  case 'regen':return +(rand(0.5,1.8)*m).toFixed(1);
}return 0}
function weightedSlot(){const r=rng();
  if(r<0.24)return 'weapon';if(r<0.38)return 'helm';if(r<0.52)return 'chest';
  if(r<0.64)return 'gloves';if(r<0.76)return 'boots';if(r<0.88)return 'ring';return 'amulet'}
function makeItem(wave,rarityIdx,forcedSlot:any=null){
  const slot=forcedSlot||weightedSlot();const rar=RARITIES[rarityIdx];
  const it={id:++itemIdCounter,slot,rarity:rarityIdx,color:rar.color,
    name:`${pick(PREFIX[rarityIdx])} ${pick(BASES[slot])}`,baseDmg:0,baseArmor:0,affixes:[],
    reqLevel:requiredLevel(wave,rarityIdx)};
  if(slot==='weapon')it.baseDmg=Math.round((7+wave*2.7)*rar.mult*rand(0.85,1.15));
  else if(isArmorSlot(slot))it.baseArmor=Math.round((5+wave*2.0)*rar.mult*rand(0.85,1.15));
  const pool=affixPool(slot);
  const count=affixCount(slot,rarityIdx);
  const used=new Set();
  for(let i=0;i<count;i++){
    let k=pick(pool),guard=0;
    while(used.has(k)&&guard++<30)k=pick(pool);
    if(used.has(k))continue;
    used.add(k);it.affixes.push({k,v:rollAffix(k,wave,rar.mult)});
  }
  it.value=Math.round([70,160,340,780][rarityIdx]*(1+wave*0.13)*rand(0.85,1.15));
  return it;
}
function itemStats(it){
  const s={dmg:0,hp:0,armor:0,speed:0,crit:0,regen:0};
  if(!it)return s;
  s.dmg+=it.baseDmg||0;s.armor+=it.baseArmor||0;
  for(const a of it.affixes)if(s[a.k]!==undefined)s[a.k]+=a.v;
  return s;
}
function sellValue(it){
  if(!it)return 0;
  const base=it.value||Math.round([70,160,340,780][it.rarity]||70);
  return Math.max(1,Math.round(base*0.4));
}
/* Item power: weighted sum of all stats — one number so you can tell good from bad at a glance */
const POWER_WEIGHTS={dmg:10,armor:6,hp:2.5,speed:4,crit:500,regen:30};
function itemPower(it){
  if(!it)return 0;
  const s=itemStats(it);
  let pw=0;
  for(const k in POWER_WEIGHTS)pw+=(s[k]||0)*POWER_WEIGHTS[k];
  return Math.round(pw);
}

/* Start game */
export function startGame(clsKey, opts?:{daily?:boolean}){
  try{ localStorage.setItem('sd_last_cls', String(clsKey)); }catch(e){}
  try {
    const C=CLASSES[clsKey];
    if(!C){console.error('❌ Class not found:', clsKey);addToast('Class not found: '+clsKey,'#ef4444','');return;}
    const _daily = (opts&&opts.daily) || pendingDaily;
    pendingDaily=false;
    if(!_daily){ dailyRun=null; clearSeed(); }   /* seeded RNG only for Daily Trial */
    closeUpgradePanel();
    G={
      running:true,paused:false,pauseMenu:false,
      diff:DIFFS[diffKey],endless:false,ngPlus:0,_victoryOpen:false,
      time:0,shake:0,kills:0,
      wave:0,waveTimer:2.0,betweenWaves:true,waveStallTimer:0,
      spawnQueue:[],spawnTimer:0,fullMsgTimer:0,
      enemies:[],projectiles:[],particles:[],texts:[],fx:[],loot:[],orbs:[],rains:[],
      minions:[],dust:[],portals:[],delayed:[],hazards:[],
      traps:[],totems:[],grounds:[],
      shopStock:[],shopWave:0,
      damageFlash:0,hitStop:0,realmWipe:null,realmHazards:[],_hazT:3.0,currentBiomeKey:'crypt',lastBiomeKey:'crypt',
      _cutscenesPlayed:{},
      cam:{x:WORLD.w/2,y:WORLD.h/2},
      player:{
        x:WORLD.w/2,y:WORLD.h/2,r:15,
        cls:clsKey,color:C.color,accent:C.accent,
        baseStats:{dmg:C.dmg,maxHp:C.hp,armor:0,speed:C.speed,crit:C.crit,energyRegen:C.energyRegen,maxEnergy:C.energy,atkSpeed:C.atkSpeed,range:C.range},
        equipment:{weapon:null,helm:null,chest:null,gloves:null,boots:null,ring:null,amulet:null},
        inventory:[],
        _rerolls:1,
        relics:[],
        maxHp:C.hp,hp:C.hp,maxEnergy:C.energy,energy:C.energy,
        dmg:C.dmg,armor:0,speed:C.speed,crit:C.crit,energyRegen:C.energyRegen,
        range:C.range,atkSpeed:C.atkSpeed,
        facing:0,atkTimer:0,moveTarget:null,swing:0,
        level:1,xp:0,xpNext:100,invuln:0,gold:50,
        upg:{dmg:0,atk:0,shots:0,spd:0,hp:0,crit:0,cd:0,range:0},
        attrs:{str:0,vit:0,agi:0,wis:0,lck:0},
        dashT:0,dashSpeed:0,dashAng:0,dashDamage:0,dashHits:new Set(),
        spinT:0,spinTick:0,walkPhase:0,isMoving:false,
        autoAttack:true,_autoTarget:null,
        potions:1,_potionCd:0,_tmove:null,
        _healingT:0,_healingRate:0,_frenzyT:0,_markT:0,
        _whirlT:0,_whirlMult:0,_whirlR:0,_whirlTick:0,_whirlColor:'#fff',
        _shieldT:0,_shieldAmt:0,_shieldColor:'#fff',
        _stealthT:0,_reflectT:0,
        _critDmg:2,_executioner:false,_cdr:0,_skillPower:0,tstats:{},
        _regenPct:0,_undying:false,_echo:0,_lifesteal:0,
        _aegis:false,_frostfire:false,
        _friends:[],_friendBond:false,
        _dodgeProj:0,_dodgeMelee:0,_shadowStep:false,_shadowMaster:false,_critNova:false,_refund:0,_killHeal:0,_lastStand:false,
        _deflectProj:0,_deflectMelee:0,_deflectMult:0,_lastDeflectAt:-9,
        slowT:0,
        treePoints:0,treeUnlocked:[],hasUltimate:false,
        ultimate:makeUltimateSkill(C),chargingUlt:false,chargeTime:0,ultCooldown:0,
        skills:C.skills.map(s=>({...s,baseCd:s.cd,cd:0,lvl:1})),
        titleBonus:(TITLES_UNLOCKED[clsKey]&&TITLES[clsKey])?TITLES[clsKey].fx:null,
        titleName:(TITLES_UNLOCKED[clsKey]&&TITLES[clsKey])?TITLES[clsKey].name:'',
        titleIcon:(TITLES_UNLOCKED[clsKey]&&TITLES[clsKey])?TITLES[clsKey].icon:''
      }
    };
    /* Boss Rush is armed before startGame runs, so the very first wave is a
       guardian wave instead of trash. */
    if((window as any).__rushPending){
      (window as any).__rushPending=false;
      G.rush=true; G.rushIdx=0; G.wave=7;
      G._cutscenesPlayed={cryptLord:true,cavernTitan:true,frostWyrm:true,volcanoBehemoth:true,shadowPrince:true};
    }
    cutscene.active=false;cutscene.actors=[];cutscene.dialogue=null;
    document.getElementById('cutsceneBars').classList.add('hidden');
    document.getElementById('cutsceneDialogue').classList.add('hidden');
    const starter=makeItem(1,0,'weapon');
    starter.name='Worn '+pick(BASES.weapon);
    starter.baseDmg=Math.max(starter.baseDmg,6);
    G.player.equipment.weapon=starter;
    recalcStats(G.player);
    G.pets=[
      {kind:'panda',x:G.player.x-46,y:G.player.y,t:0},
      {kind:'cat',x:G.player.x-66,y:G.player.y+10,t:0},
      {kind:'bear',x:G.player.x-72,y:G.player.y-14,t:0},
    ];
    G.player.hp=G.player.maxHp;
    G.player.energy=G.player.maxEnergy;
    G.cam.x=G.player.x;G.cam.y=G.player.y;
    setFloorForBiome('crypt');
    respawnDustForBiome('crypt');
    buildSkillbar(G.player);
    addToast(C.name.toUpperCase()+' READY',C.accent||'#fff',G.player.skills.map(s=>s.name).join('  ·  '));
    inv.open=false;inv.el.classList.add('hidden');hideTooltip();hideSkillTooltip();
    tree.open=false;tree.el.classList.add('hidden');
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('deathScreen').classList.add('hidden');
    document.getElementById('pauseScreen').classList.add('hidden');
    const _vs=document.getElementById('victoryScreen');if(_vs)_vs.classList.add('hidden');
    tutorialInit();
    document.getElementById('toasts').innerHTML='';
    document.getElementById('killTxt').textContent='0 kills';
    G.pauseMenu=false;
    updateAutoBadge();
    updateBiomeLabel();
    updateAutoPlayBadge();
    refreshShopStock(G);
  } catch (err) {
    console.error('❌ startGame threw:', err);
    addToast('Failed to start', '#ef4444', String(err));
  }
}

function buildSkillbar(p){
  const bar=document.getElementById('skillbar');
  bar.innerHTML='';
  p.skills.forEach((s,i)=>{
    const d=document.createElement('div');
    d.className='skill';
    const sl = s.lvl || 1;
    d.innerHTML=`<div class="cd"></div><div class="sname">${s.name}</div><div class="icon">${s.icon}</div><div class="key">${i+1}</div><div class="slvl">Lv.${sl}</div>`;
    bar.appendChild(d);
    s.el=d;s.cdEl=d.querySelector('.cd');s.lvlEl=d.querySelector('.slvl');s._slotKey=i+1;
    d.addEventListener('mouseenter',ev=>showSkillTooltip(s,ev));
    d.addEventListener('mousemove',ev=>positionSkillTooltip(ev));
    d.addEventListener('mouseleave',hideSkillTooltip);
    d.addEventListener('click',()=>{sfx.ui();tryCast(i)});
  });
  const ultEl=document.createElement('div');
  ultEl.className='skill ult'+(p.hasUltimate?'':' locked');
  const ult=p.ultimate;
  ultEl.innerHTML=`<div class="charge-fill"></div><div class="cd"></div><div class="icon">${ult.icon}</div><div class="key">4</div>`;
  bar.appendChild(ultEl);
  p.ultimateEl=ultEl;
  p.ultimateCdEl=ultEl.querySelector('.cd');
  p.ultimateChargeEl=ultEl.querySelector('.charge-fill');
  ultEl.addEventListener('mouseenter',ev=>{
    if(!p.hasUltimate){
      showSkillTooltip({name:ult.name+' (LOCKED)',icon:'★',key:'4',cost:0,baseCd:15,
        info:{desc:'Unlock via Skill Tree [T]. Requires any 2 branch capstones.',
          calc:()=>[{label:'Status',value:'LOCKED',kind:'util'}]}},ev);
    } else {
      showSkillTooltip({name:ult.name,icon:ult.icon,key:'4',cost:0,baseCd:15,info:ult.info},ev);
    }
  });
  ultEl.addEventListener('mousemove',ev=>positionSkillTooltip(ev));
  ultEl.addEventListener('mouseleave',hideSkillTooltip);
}
const skillTipEl=document.getElementById('skillTooltip');
function showSkillTooltip(skill,e){
  if(!G||!G.player)return;
  const p=G.player;
  const sl=skill.lvl||1;
  const info=skill.info||{desc:'',calc:()=>[]};
  const effCd = skill.baseCd * Math.max(0.4, 1 - (sl - 1) * 0.06);
  const cdText=effCd<1?effCd.toFixed(2)+'s':effCd.toFixed(1)+'s';
  const stats=info.calc(p, sl);
  let h=`<div class="st-header"><div class="st-icon">${skill.icon}</div><div class="st-title"><div class="st-name">${skill.name} <span style="color:#ffd54f;font-size:11px">Lv.${sl}</span></div><div class="st-meta"><span>Cost <b>${skill.cost}</b></span><span>CD <b>${cdText}</b></span><span>Key <b>${skill._slotKey||skill.key}</b></span></div></div></div><div class="st-desc">${info.desc}</div>`;
  for(const row of stats){
    const cls=row.kind==='dmg'?'st-stat dmg':row.kind==='heal'?'st-stat heal':row.kind==='util'?'st-stat util':'st-stat';
    h+=`<div class="${cls}"><span class="k">${row.label}</span><span class="v">${row.value}</span></div>`;
  }
  skillTipEl.innerHTML=h;
  skillTipEl.classList.remove('hidden');
  if(e)positionSkillTooltip(e);
}
function positionSkillTooltip(e){
  if(!e||skillTipEl.classList.contains('hidden'))return;
  const pad=12,r=skillTipEl.getBoundingClientRect();
  let x=e.clientX+16,y=e.clientY-r.height-12;
  if(y<pad)y=e.clientY+22;
  if(x+r.width>window.innerWidth-pad)x=e.clientX-r.width-16;
  if(x<pad)x=pad;
  if(y+r.height>window.innerHeight-pad)y=window.innerHeight-r.height-pad;
  skillTipEl.style.left=x+'px';skillTipEl.style.top=y+'px';
}
function hideSkillTooltip(){skillTipEl.classList.add('hidden')}

function tryCast(i){
  if(!G||!G.player||G.paused)return;
  const p=G.player,s=p.skills[i];
  if(!s||s.cd>0||p.energy<s.cost)return;
  const origDmg=p.dmg;
  const sl = s.lvl || 1;
  p._castSkillLvl = sl;
  if(p._skillPower)p.dmg=Math.round(p.dmg*(1+p._skillPower));
  if(p.titleBonus&&p.titleBonus.skill)p.dmg=Math.round(p.dmg*(1+p.titleBonus.skill));
  if(s.evoDmg)p.dmg=Math.round(p.dmg*(1+s.evoDmg));
  s.cast(p,G);
  try{ vfxSignature(p,s); }catch(e){}
  p.dmg=origDmg;
  const wisPts = ((p.attrs&&p.attrs.wis)||0) + ((p.upg&&p.upg.cd)||0);
  const cdMult=Math.max(0.28,(1-((p._cdr||0)+wisPts*0.09)) * (1-(sl-1)*0.06));
  s.cd=s.baseCd*cdMult;
  p.energy-=s.cost;
  if(p._refund&&rng()<p._refund){s.cd=0;p.energy=Math.min(p.maxEnergy,p.energy+s.cost);G.fx.push({type:'ring',x:p.x,y:p.y,r:50,life:.35,max:.35,color:'#7fb4ff'})}
  if(p._echo&&rng()<p._echo){
    setTimeout(()=>{
      if(!G||!G.running||!G.player||G.player!==p)return;
      const od=p.dmg;
      p._castSkillLvl = sl;
      if(p._skillPower)p.dmg=Math.round(p.dmg*(1+p._skillPower));
      try{s.cast(p,G);}catch(e){console.error(e);}
      p.dmg=od;
      G.fx.push({type:'ring',x:p.x,y:p.y,r:60,life:.4,max:.4,color:'#b47cff'});
    },180);
  }
}

function castUltimate(p,g,chargePct){
  if(!p.hasUltimate)return;
  const C=CLASSES[p.cls];
  const R=150+400*chargePct;
  const dmg=p.dmg*(1.5+4.5*chargePct);
  const slowDur=1+4*chargePct;
  let hitCount=0;
  for(const e of g.enemies){
    if(e.dead)continue;
    if(dist(p,e)<R+e.r){
      damageEnemy(e,dmg,g,p);
      if(chargePct>0.4)e.slowT=Math.max(e.slowT,slowDur);
      hitCount++;
    }
  }
  g.fx.push({type:'nova',x:p.x,y:p.y,r:R,life:1.2,max:1.2,color:C.color});
  g.fx.push({type:'ring',x:p.x,y:p.y,r:R*0.7,life:.9,max:.9,color:C.accent});
  g.fx.push({type:'boom',x:p.x,y:p.y,r:R,life:.8,max:.8,color:C.color});
  g.shake=Math.max(g.shake,8+chargePct*12);
  if(chargePct>=0.99){
    for(const e of g.enemies){if(e.dead)continue;e.slowT=Math.max(e.slowT,5);}
    addToast('★ MAX POWER ★','#ffd54f',p.ultimate.name+' unleashed!');
  } else {
    addToast(p.ultimate.name,C.accent,hitCount+' enemies hit · '+Math.round(chargePct*100)+'% charge');
  }
}

/* Tree UI */
const tree={open:false,el:document.getElementById('treeScreen'),
  canvas:document.getElementById('treeCanvas'),svg:document.getElementById('treeSvg'),
  tooltip:document.getElementById('treeTooltip')};
function toggleTree(){
  if(!G||!G.running)return;
  tree.open=!tree.open;
  tree.el.classList.toggle('hidden',!tree.open);
  hideSkillTooltip();
  if(tree.open)refreshTreeUI();else hideTreeTooltip();
  syncPause();
}
function refreshTreeUI(){
  if(!G||!G.player)return;
  const p=G.player;
  document.getElementById('treePointsText').textContent=p.treePoints+' point'+(p.treePoints===1?'':'s')+' available · branches '+Math.min(treeBranchesUsed(p).length,MAX_BRANCHES)+'/'+MAX_BRANCHES;
  tree.canvas.querySelectorAll('.tree-node,.tree-branch').forEach(n=>n.remove());
  tree.svg.innerHTML='';
  [['COUNTER',8,'#7fd4ff'],['SHADOW',24,'#b48cff'],['SLAYER',40,'#ff7a5c'],['FRIENDSHIP',56,'#ffb3d9'],['BULWARK',72,'#7aff9a'],['BLOODTHIRST',88,'#ff5c8a']].forEach(([t,x,c])=>{
    const l=document.createElement('div');l.className='tree-branch';l.textContent=t;l.style.left=x+'%';l.style.color=c;tree.canvas.appendChild(l)});
  const edges=[];for(const n of TREE_NODES)for(const r of (n.requires||[]))edges.push([r,n.id]);
  for(const [a,b] of edges){
    const na=TREE_NODES.find(n=>n.id===a),nb=TREE_NODES.find(n=>n.id===b);
    if(!na||!nb)continue;
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',na.x);line.setAttribute('y1',na.y);
    line.setAttribute('x2',nb.x);line.setAttribute('y2',nb.y);
    const bothOn=p.treeUnlocked.includes(a)&&p.treeUnlocked.includes(b);
    line.setAttribute('stroke',bothOn?'#7aff9a':'#3a302a');
    line.setAttribute('stroke-width',bothOn?'0.8':'0.5');
    line.setAttribute('vector-effect','non-scaling-stroke');
    tree.svg.appendChild(line);
  }
  for(const node of TREE_NODES){
    const el=document.createElement('div');
    el.className='tree-node'+(node.id==='ULT'?' ult':'');
    const unlocked=p.treeUnlocked.includes(node.id);
    const isMelee = CLASSES[p.cls] && CLASSES[p.cls].basic === 'melee';
    const meleeBlocked = node.meleeOnly && !isMelee;
    const available = !meleeBlocked && isTreeNodeAvailable(node,p);
    if(unlocked)el.classList.add('unlocked');
    else if(available)el.classList.add('available');
    if(meleeBlocked)el.style.opacity = '0.35';
    if(!unlocked&&(node.locked||treeBranchBlocked(node,p)))el.style.opacity = '0.3';
    el.style.left=node.x+'%';el.style.top=node.y+'%';
    el.innerHTML=`<div class="node-icon">${node.icon}</div><div class="node-name">${node.name}</div><div class="node-cost">${node.cost}pt</div>`;
    if(available)el.addEventListener('click',()=>{applyTreeNode(node.id);refreshTreeUI();});
    el.addEventListener('mouseenter',ev=>showTreeTooltip(node,p,ev));
    el.addEventListener('mousemove',ev=>positionTreeTooltip(ev));
    el.addEventListener('mouseleave',hideTreeTooltip);
    tree.canvas.appendChild(el);
  }
}
function showTreeTooltip(node,p,e){
  const unlocked=p.treeUnlocked.includes(node.id);
  const isMelee = CLASSES[p.cls] && CLASSES[p.cls].basic === 'melee';
  const meleeBlocked = node.meleeOnly && !isMelee;
  const available=!meleeBlocked && isTreeNodeAvailable(node,p);
  const brBlocked=!unlocked&&treeBranchBlocked(node,p);
  let status=meleeBlocked?'🔒 MELEE ONLY':(node.locked&&!unlocked)?'🔒 LOCKED':brBlocked?'🔒 BRANCH LOCKED ('+MAX_BRANCHES+'/'+MAX_BRANCHES+' branches chosen)':unlocked?'✓ UNLOCKED':available?'▶ CLICK TO UNLOCK':'✕ LOCKED';
  let reqText='';
  if(node.requires&&node.requires.length>0){
    const met=p.treeUnlocked.filter(id=>node.requires.includes(id)).length;
    reqText=`<div class="tt-node-req">Requires ${met}/${node.requiresCount} prior nodes</div>`;
  }
  tree.tooltip.innerHTML=`<div class="tt-node-name">${node.icon} ${node.name}</div><div class="tt-node-desc">${node.desc}</div><div class="tt-node-cost">Cost: ${node.cost} point${node.cost===1?'':'s'} · ${status}</div>${reqText}`;
  tree.tooltip.classList.remove('hidden');
  positionTreeTooltip(e);
}
function positionTreeTooltip(e){
  if(!e||tree.tooltip.classList.contains('hidden'))return;
  const pad=16,r=tree.tooltip.getBoundingClientRect();
  let x=e.clientX+20,y=e.clientY+20;
  if(x+r.width>window.innerWidth-pad)x=e.clientX-r.width-20;
  if(y+r.height>window.innerHeight-pad)y=window.innerHeight-r.height-pad;
  if(x<pad)x=pad;if(y<pad)y=pad;
  tree.tooltip.style.left=x+'px';tree.tooltip.style.top=y+'px';
}
function hideTreeTooltip(){tree.tooltip.classList.add('hidden')}

/* Spawn / damage */
function spawnProj(g,o){
  g.projectiles.push(Object.assign({
    x:0,y:0,vx:0,vy:0,r:6,dmg:10,life:1.5,color:'#fff',from:'player',
    hit:new Set(),explode:null,pierce:0,trail:[],slowOnHit:false,enemyEffect:null,
    homing:false,homingTarget:null,isBasic:false,owner:null
  },o));
}
function damageMinion(m,amount,g){m.hp-=amount;m.hitFlash=1;
  if(m.ally&&m.hp<=0)g.texts.push({x:m.x,y:m.y-24,vy:-40,life:1.1,max:1.1,spawn:1.1,text:m.name+' fell!',color:m.accent,size:14});
  if(m.hp<=0){const i=g.minions.indexOf(m);if(i>=0)g.minions.splice(i,1)}}
function addFriend(p,champ){
  p._friends=p._friends||[];
  const keys=Object.keys(CLASSES).filter(k=>k!==p.cls&&!p._friends.some(f=>f.cls===k));
  if(!keys.length)return;
  const cls=pick(keys);
  p._friends.push({cls,champ:!!champ,timer:0});
}
function spawnAlly(f,g,silent:any=false){
  const C=CLASSES[f.cls];if(!C)return;
  const p=g.player,sc=f.champ?2:1,lvl=p.level;
  const hp=Math.round((C.hp*0.8+lvl*16+g.wave*6)*sc);
  const a=rand(0,TAU);
  const melee=C.basic==='melee';
  g.minions.push({ally:true,allyRef:f,champ:f.champ,cls:f.cls,name:C.name,icon:C.icon,color:C.color,accent:C.accent,
    x:p.x+Math.cos(a)*70,y:p.y+Math.sin(a)*70,r:f.champ?16:13,hp,maxHp:hp,
    dmg:(C.dmg+(lvl-1)*2.2)*0.6*sc,speed:C.speed*0.95,life:1e9,hitFlash:0,wobble:rand(0,TAU),atkTimer:0.5,facing:0,
    ranged:!melee,reach:melee?Math.max(60,C.range||90):0,atkCd:1/Math.max(0.8,C.atkSpeed*0.8),isMoving:false});
  g.fx.push({type:'ring',x:p.x+Math.cos(a)*70,y:p.y+Math.sin(a)*70,r:90,life:.55,max:.55,color:C.accent});
  g.fx.push({type:'ring',x:p.x+Math.cos(a)*70,y:p.y+Math.sin(a)*70,r:50,life:.35,max:.35,color:'#ffffff'});
  addToast((f.champ?'★ CHAMPION ':'FRIEND ')+'JOINED',C.accent,C.name+' fights beside you!');
}
function updateAlly(m,dt,g){
  const p=g.player;
  m.hitFlash=Math.max(0,m.hitFlash-dt*4);m.wobble+=dt*6;m.atkTimer-=dt;
  m.hp=Math.min(m.maxHp,m.hp+m.maxHp*0.01*dt);
  let best=null,bd=520;
  for(const e of g.enemies){if(e.dead)continue;const d=dist(m,e);if(d<bd){bd=d;best=e}}
  const dp=dist(m,p);let mv=0,ang=m.facing;
  const toward=(tx,ty,k)=>{ang=Math.atan2(ty-m.y,tx-m.x);mv=k};
  if(dp>650){toward(p.x,p.y,1.6)}
  else if(best){
    m.facing=Math.atan2(best.y-m.y,best.x-m.x);ang=m.facing;
    if(m.ranged){
      if(bd<170){mv=-0.9}else if(bd>260){mv=1}
      if(m.atkTimer<=0&&bd<=420){
        m.atkTimer=m.atkCd;
        spawnProj(g,{x:m.x+Math.cos(m.facing)*16,y:m.y+Math.sin(m.facing)*16,vx:Math.cos(m.facing)*520,vy:Math.sin(m.facing)*520,
          r:7,dmg:m.dmg*(p._friendBond&&!m.champ?1.3:1),life:1.1,color:m.accent,from:'player'});
      }
    } else {
      if(bd>m.reach*0.7+best.r)mv=1;
      if(m.atkTimer<=0&&bd<=m.reach+best.r){
        m.atkTimer=m.atkCd;
        damageEnemy(best,m.dmg*(p._friendBond&&!m.champ?1.3:1),g,null,{});
        g.fx.push({type:'slash',x:m.x,y:m.y,r:m.reach*0.8,ang:m.facing,arc:1.9,life:.14,max:.14,color:m.accent});
      }
    }
  } else if(dp>95){toward(p.x,p.y,1)}
  m.isMoving=mv!==0;
  if(mv){m.x+=Math.cos(ang)*m.speed*mv*dt;m.y+=Math.sin(ang)*m.speed*mv*dt}
  m.x=clamp(m.x,20,WORLD.w-20);m.y=clamp(m.y,20,WORLD.h-20);
}
function drawAlly(m){
  const s=m.champ?1.25:1,bob=m.isMoving?Math.abs(Math.sin(m.wobble))*2.2:Math.sin(m.wobble*0.4)*0.9;
  ctx.save();ctx.globalAlpha=0.35+0.12*Math.sin(G.time*3);ctx.strokeStyle=m.champ?'#ffd54f':m.accent;ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(m.x,m.y+17*s,21*s,8*s,0,0,TAU);ctx.stroke();ctx.restore();
  const sg=ctx.createRadialGradient(m.x,m.y+17*s,2,m.x,m.y+17*s,18*s);
  sg.addColorStop(0,'rgba(0,0,0,0.55)');sg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sg;ctx.beginPath();ctx.ellipse(m.x,m.y+17*s,18*s,8*s,0,0,TAU);ctx.fill();
  ctx.save();ctx.translate(m.x,m.y-bob);ctx.scale(s,s);
  const wx=Math.cos(m.facing)*17,wy=Math.sin(m.facing)*17-2;
  ctx.strokeStyle='rgba(10,5,14,0.8)';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(wx,wy);ctx.stroke();
  ctx.strokeStyle=m.accent;ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(wx,wy);ctx.stroke();
  const grd=ctx.createLinearGradient(0,-18,0,20);
  grd.addColorStop(0,shadeColor(m.color,0.25));grd.addColorStop(1,shadeColor(m.color,-0.45));
  ctx.fillStyle=grd;roundRect(-9,-14,18,32,5);ctx.fill();ctx.strokeStyle='rgba(10,5,14,0.75)';ctx.lineWidth=1.2;ctx.stroke();
  ctx.fillStyle=m.accent;ctx.fillRect(-9,-2,18,2);
  ctx.fillStyle=shadeColor(m.color,-0.5);roundRect(-9,-14,18,5,3);ctx.fill();
  ctx.fillStyle='#d8b090';ctx.beginPath();ctx.arc(0,-20,7,0,TAU);ctx.fill();ctx.stroke();
  ctx.fillStyle=m.accent;ctx.shadowColor=m.accent;ctx.shadowBlur=6;
  ctx.beginPath();ctx.arc(-2.5,-20,1.2,0,TAU);ctx.fill();ctx.beginPath();ctx.arc(2.5,-20,1.2,0,TAU);ctx.fill();
  ctx.shadowBlur=0;
  if(m.hitFlash>0){ctx.globalAlpha=Math.min(0.6,m.hitFlash*0.7);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,-2,17,0,TAU);ctx.fill()}
  ctx.restore();
  ctx.save();ctx.font="bold 10px 'Trebuchet MS'";ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=4;
  ctx.fillStyle=m.champ?'#ffd54f':m.accent;ctx.fillText((m.champ?'★ ':'')+m.name,m.x,m.y-38*s);ctx.restore();
  const pct=clamp(m.hp/m.maxHp,0,1);
  ctx.fillStyle='rgba(0,0,0,0.8)';ctx.fillRect(m.x-14*s,m.y-34*s,28*s,4);
  ctx.fillStyle=m.champ?'#ffd54f':'#7affb0';ctx.fillRect(m.x-14*s+1,m.y-34*s+1,(28*s-2)*pct,2);
}
function updateMinions(dt,g){
  const p=g.player;
  if(p._friends&&p._friends.length){
    for(const f of p._friends){
      if(g.minions.some(m=>m.allyRef===f)){f.timer=15;continue}
      f.timer-=dt;
      if(f.timer<=0){spawnAlly(f,g);f.timer=15}
    }
  }
  for(let i=g.minions.length-1;i>=0;i--){
    const m=g.minions[i];
    if(m.ally){updateAlly(m,dt,g);continue}
    m.life-=dt;m.hitFlash=Math.max(0,m.hitFlash-dt*4);m.wobble+=dt*6;m.atkTimer-=dt;
    if(m.life<=0){g.minions.splice(i,1);continue}
    let best=null,bd=380;
    for(const e of g.enemies){if(e.dead)continue;const d=dist(m,e);if(d<bd){bd=d;best=e}}
    if(best){
      m.facing=Math.atan2(best.y-m.y,best.x-m.x);
      const stopDist=m.r+best.r+4;
      if(bd>stopDist){m.x+=Math.cos(m.facing)*m.speed*dt;m.y+=Math.sin(m.facing)*m.speed*dt}
      else if(m.atkTimer<=0){m.atkTimer=0.9;damageEnemy(best,m.dmg,g,{crit:0,pet:true})}
    } else {
      const d=dist(m,p);
      if(d>65){const a=Math.atan2(p.y-m.y,p.x-m.x);m.facing=a;m.x+=Math.cos(a)*m.speed*dt;m.y+=Math.sin(a)*m.speed*dt}
    }
    m.x=clamp(m.x,20,WORLD.w-20);m.y=clamp(m.y,20,WORLD.h-20);
  }
}
function damageEnemy(e,amount,g,src,opts:any=null){
  if(e.dead)return;
  opts=opts||{};
  let crit=false;
  const critMult=((src&&src._critDmg)||2)+((src&&src.titleBonus&&src.titleBonus.critDmg)||0);
  if(opts.forceCrit||(src&&src.crit&&rng()<src.crit)){
    crit=true;amount*=critMult;
  }
  if(src&&src._markT>0)amount*=1.4;
  if(e.markT>0)amount*=1.4;
  if(src&&src._executioner&&e.hp<e.maxHp*0.3)amount*=1.4;
  if(src&&src._aegis&&src.maxHp&&src.hp/src.maxHp<0.5)amount*=1.3;
  /* COMBO: consecutive unbroken hits build a damage multiplier */
  const fromPlayer = (src && g && src === g.player);
  if (fromPlayer && g.player){
    const p = g.player;
    p._combo = Math.min(99, (p._combo || 0) + 1);
    p._comboT = 3.2;
    amount *= 1 + Math.min(0.5, p._combo * 0.01);
  }
  amount=Math.max(1,Math.round(amount));
  e._lastCrit=!!crit;e._lastSkill=!!(opts.skill);e._lastPet=!!(opts.pet);
  if(fromPlayer && !e.dead){
    const base = Math.max(2, amount);
    if(crit){ e.bleedT = 3.0; e.bleedDps = Math.max(e.bleedDps||0, base*0.10); }
    if(opts.skill){ e.burnT = 2.5; e.burnDps = Math.max(e.burnDps||0, base*0.16); }
  }
  if(crit&&G)G.hitStop=Math.max(G.hitStop||0,0.035);   /* brief freeze = impact weight */
  e.hp-=amount;e.hitFlash=1;
  vfxSparks(e,crit,src);
  if(crit)sfx.crit();else sfx.hit();
  if(crit&&src&&src._critNova&&!opts.noNova&&g.time-(src._novaLast||-9)>0.2){
    src._novaLast=g.time;const nv=amount*0.45;
    g.fx.push({type:'ring',x:e.x,y:e.y,r:110,life:.3,max:.3,color:'#ff5c5c'});
    for(const o of g.enemies){if(o===e||o.dead)continue;if(dist(o,e)<110)damageEnemy(o,nv,g,null,{noNova:true})}
  }
  if(opts.fromBasic&&src&&src.maxHp){
    const _ls=(src._lifesteal||0)+(((src.attrs&&src.attrs.leech)||0)*0.02);
    if(_ls>0) src.hp=Math.min(src.maxHp,src.hp+amount*_ls);
  }
  let dmgColor='#ffffff';
  if(crit)dmgColor='#ffd54f';
  else if(src&&src.cls&&CLASSES[src.cls])dmgColor=CLASSES[src.cls].accent;
  /* boss numbers arc above the head: at 130px tall a number placed at e.r-6
     sits right on the face and hides the sprite it belongs to */
  const bossLift=e.boss?e.r*1.45:0;
  g.texts.push({x:e.x+rand(-8,8)+ (e.boss?rand(-14,14):0), y:e.y-e.r-6-bossLift,
    vy:e.boss?-96:-70, life:e.boss?0.85:0.7, max:e.boss?0.85:0.7, spawn:e.boss?0.85:0.7,
    text:String(amount),color:dmgColor,size:crit?(e.boss?19:21):12});
  if(e.hp<=0)killEnemy(e,g);
}
function dropXP(g,x,y,amount){
  if(!amount||amount<=0)return;
  if(g.orbs.length>400){gainXP(amount,g);return}
  const n=clamp(Math.max(1,Math.round(amount/7)),1,5);
  const part=Math.ceil(amount/n);
  for(let i=0;i<n;i++)g.orbs.push({x:x+rand(-12,12),y:y+rand(-12,12),vx:rand(-50,50),vy:rand(-110,-30),life:14,amount:part,kind:'xp',r:4.5});
}
function dropGold(g,x,y,amount){
  if(!amount||amount<=0)return;
  amount=Math.round(amount*(1+(META.shop.fort||0)*0.10)*(1+relicMods(g.player).gold));
  if(g.orbs.length>400){g.player.gold=(g.player.gold||0)+amount;return}
  const n=clamp(Math.max(1,Math.round(amount/4)),1,6);
  const part=Math.ceil(amount/n);
  for(let i=0;i<n;i++)g.orbs.push({x:x+rand(-12,12),y:y+rand(-12,12),vx:rand(-60,60),vy:rand(-120,-30),life:14,amount:part,kind:'gold',r:4});
}
function updateOrbs(dt,g){
  const p=g.player;
  for(let i=g.orbs.length-1;i>=0;i--){
    const o=g.orbs[i];
    o.life-=dt;
    if(o.life<=0){g.orbs.splice(i,1);continue}
    o.vy+=260*dt;
    const d=dist(p,o);
    const MAG=140 + (((p.attrs&&p.attrs.magnet)||0)*37);
    if(d<MAG){
      const a=Math.atan2(p.y-o.y,p.x-o.x);
      const pull=520+(MAG-d)*5;
      o.vx=Math.cos(a)*pull;o.vy=Math.sin(a)*pull;
    }
    o.x+=o.vx*dt;o.y+=o.vy*dt;
    if(d<26){
      if(o.kind==='xp'){gainXP(o.amount,g);sfx.xp();}
      else{p.gold=(p.gold||0)+o.amount;sfx.coin();
        g.texts.push({x:p.x+rand(-10,10),y:p.y-p.r-10,vy:-55,life:.7,max:.7,spawn:.7,text:'+'+o.amount+'g',color:'#ffd54f',size:12});}
      g.orbs.splice(i,1);
    }
  }
}
function killEnemy(e,g){
  if(e.dead)return;
  /* A guardian dying while another cutscene is on screen used to start a second
     cinematic on top of the first and wedge the run. Queue it instead: the
     pending sequence fires as soon as the stage is clear. */
  if(cutscene.active && e.boss && !e._defeatDone && !e.finale && (e.bossKey==='cryptLord' || DEFEAT_CS[e.bossKey])){
    g._pendingDefeat={key:e.bossKey, boss:e};
    e.hp=Math.max(1,Math.round(e.maxHp*0.1));
    return;
  }
  if(e.finale&&!g._finaleKill){e.hp=Math.max(1,Math.ceil(e.maxHp*.1));return}
  if(e.boss&&e.bossKey==='cryptLord'&&!e.finale){
    if(!g._cryptDefeatCs){
      g._cryptDefeatCs=true;
      e.hp=Math.max(1,Math.round(e.maxHp*0.1));
      startCryptDefeatCutscene(g,e);
    } else e.hp=Math.max(e.hp,1);
    return;
  }
  if(e.boss&&DEFEAT_CS[e.bossKey]&&!e.finale&&!e._defeatDone){
    g._defeatCs=g._defeatCs||{};
    if(!g._defeatCs[e.bossKey]){g._defeatCs[e.bossKey]=true;e.hp=Math.max(1,Math.round(e.maxHp*.1));DEFEAT_CS[e.bossKey](g,e)}
    else e.hp=Math.max(e.hp,1);
    return;
  }
  e.dead=true;g.kills++;
  if(e.boss){ markCodex(e.bossKey,'kill'); }
  if(e.boss && g.player){ try{ grantBossRelic(g, e.bossKey); }catch(err){} }
  if(e.boss && g.rush && !e._rushCounted){
    e._rushCounted=true;
    g.rushIdx=(g.rushIdx||0)+1;
    if(g.rushIdx>=RUSH_CHAIN.length) endBossRush(g);
    else addToast('⚔ GUARDIAN FALLEN','#ff8f2e',(RUSH_CHAIN.length-g.rushIdx)+' remain');
  }
  if(e.boss&&!e.finale){
    /* BOSS RELIC: every boss kill grants two random attribute levels */
    try{
      const pool=['str','vit','agi','wis','lck','haste','swift','leech','mend','stone'];
      const a1=pick(pool), a2=pick(pool);
      g.player.attrs=g.player.attrs||{};
      g.player.attrs[a1]=(g.player.attrs[a1]||0)+1;
      g.player.attrs[a2]=(g.player.attrs[a2]||0)+1;
      recalcStats(g.player);
      addToast('🏛 BOSS RELIC','#ffd54f','+1 '+a1.toUpperCase()+' · +1 '+a2.toUpperCase()+' — permanent');
    }catch(err){}
  }
  { const tp=g.player;
    if(tp&&tp.cls){
      tcount(tp,'kills');
      if(e.boss)tcount(tp,'bossKills');
      if(e._lastCrit)tcount(tp,'critKills');
      if(e._lastSkill)tcount(tp,'skillKills');
      if(e._lastPet)tcount(tp,'petKills');
      if(dist(e,tp)>400)tcount(tp,'rangeKills');
    } }
  addBloodDecal(e.x,e.y);
  g.fx.push({type:'smoke',x:e.x,y:e.y,s:e.boss?2.0:0.9,life:0.55,max:0.55});
  for(let i=0;i<(e.boss?40:14);i++){
    const a=rand(0,TAU),sp=rand(60,e.boss?400:240);
    g.particles.push({x:e.x,y:e.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
      life:rand(0.3,0.8),max:0.8,size:rand(2,e.boss?7:5),
      color:rng()<0.5?e.color:e.dark});
  }
  if(e.type==='bomber'){
    g.fx.push({type:'boom',x:e.x,y:e.y,r:90,life:.4,max:.4,color:'#ff8f2e'});
    g.shake=Math.max(g.shake,8);
    if(dist({x:e.x,y:e.y},g.player)<110)damagePlayer(e.dmg*1.4,g,'melee',e);
  }
  dropXP(g,e.x,e.y,e.xp);
  { const kp=g.player;if(kp&&kp._killHeal&&kp.hp>0)kp.hp=Math.min(kp.maxHp,kp.hp+kp.maxHp*kp._killHeal); }
  const goldAmt=Math.round((e.gold||Math.round((e.xp||5)*0.7))*(e.boss?1.5:1));
  dropGold(g,e.x,e.y,goldAmt);
  if(e.boss){rollLoot(g,e.x+22,e.y,g.wave,true);rollLoot(g,e.x-22,e.y,g.wave,true);}
  else if(e.elite){if(rng()<0.3)rollLoot(g,e.x,e.y,g.wave,false);}
  else if(rng()<0.06)rollLoot(g,e.x,e.y,g.wave,false);
  if(e.boss){
    g.shake=20;
    if(!e.finale)addToast('BOSS DEFEATED!','#ffd54f','+'+goldAmt+' gold · '+e.name+' has fallen');
    if(e.bossKey===BIOMES[BIOMES.length-1].boss&&!e.finale&&!g._finaleStarted){g._finaleStarted=true;startFinaleCutscene(g)}
  }
}
function triggerDodge(p,g){
  if(g.time-(p._dodgeTextAt||-9)>0.2){p._dodgeTextAt=g.time;
    g.texts.push({x:p.x+rand(-8,8),y:p.y-p.r-8,vy:-55,life:.6,max:.6,spawn:.6,text:'DODGE',color:'#c9a8ff',size:14});}
  if(!p._shadowStep||(p._dash&&p._dash.t>0)||g.time-(p._dashAt||-9)<0.3)return;
  p._dashAt=g.time;
  let near=null,nd=1e9;
  for(const e of g.enemies){if(e.dead)continue;const d=dist(e,p);if(d<nd){nd=d;near=e}}
  const side=rng()<0.5?1:-1;
  const ang=near?Math.atan2(near.y-p.y,near.x-p.x)+side*(Math.PI/2)+rand(-0.35,0.35):rand(0,TAU);
  const len=p._shadowMaster?150:100,dur=0.14;
  p._dash={vx:Math.cos(ang)*len/dur,vy:Math.sin(ang)*len/dur,t:dur,acc:0};
  g.fx.push({type:'shadow',x:p.x,y:p.y,r:p.r,life:.5,max:.5});
}
function damagePlayer(amount,g,kind,attacker:any=null){
  const p=g.player;
  if(!isFinite(amount)){ amount=0; }   /* a NaN amount used to set p.hp to NaN permanently */
  if(p.invuln>0||p.hp<=0)return;
  if(kind!=='hazard'){
    const dc=kind==='proj'?(p._dodgeProj||0):(p._dodgeMelee||0);
    if(dc>0&&rng()<dc){triggerDodge(p,g);return}
    // COUNTER — deflect a percentage back to the attacker
    const dch = kind==='proj' ? (p._deflectProj||0) : kind==='melee' ? (p._deflectMelee||0) : 0;
    if(dch>0 && attacker && !attacker.dead && rng()<dch && g.time-(p._lastDeflectAt||-9)>0.15){
      p._lastDeflectAt = g.time;
      const reflectAmt = Math.max(1, Math.round(amount * (p._deflectMult||0.3)));
      amount = Math.max(1, Math.round(amount * 0.55));
      damageEnemy(attacker, reflectAmt, g, null);
      g.fx.push({type:'ring', x:p.x, y:p.y, r:52, life:.3, max:.3, color:'#7fd4ff'});
      g.fx.push({type:'ring', x:attacker.x, y:attacker.y, r:44, life:.25, max:.25, color:'#7fd4ff'});
      g.texts.push({x:p.x, y:p.y-p.r-8, vy:-55, life:.7, max:.7, spawn:.7,
        text:'DEFLECT', color:'#7fd4ff', size:14});
    }
  }
  const red=Math.min(0.65,p.armor/(p.armor+140));
  amount=Math.max(1,Math.round(amount*(1-red)));
  if(p._shieldT>0&&p._shieldAmt>0){
    const absorbed=Math.min(p._shieldAmt,amount);
    p._shieldAmt-=absorbed;amount-=absorbed;
    if(p._shieldAmt<=0){p._shieldT=0;p._shieldAmt=0}
    g.texts.push({x:p.x+rand(-8,8),y:p.y-p.r-8,vy:-55,life:.7,max:.7,spawn:.7,text:'-'+absorbed,color:'#7fd4ff',size:15});
    if(amount<=0)return;
  }
  if(p._reflectT>0){
    const reflectDmg=amount*0.5;
    for(const e of g.enemies){
      if(e.dead)continue;
      if(dist(p,e)<150){e.hp-=reflectDmg;e.hitFlash=0.5;if(e.hp<=0)killEnemy(e,g)}
    }
    amount=Math.max(1,Math.round(amount*0.5));
  }
  if(p._undying&&p.hp/p.maxHp<0.25)amount*=0.5;
  if(p._aegis&&p.hp/p.maxHp<0.5)amount*=0.8;
  amount=Math.max(1,Math.round(amount));
  if(p._lastStand&&p.hp-amount<=0&&g.time-(p._lastStandAt||-999)>90){
    p._lastStandAt=g.time;p.hp=Math.round(p.maxHp*0.4);p.invuln=3;
    g.fx.push({type:'ring',x:p.x,y:p.y,r:160,life:.6,max:.6,color:'#ffd54f'});
    addToast('LAST STAND','#ffd54f','You refuse to fall');return;
  }
  p.hp-=amount;
  p._combo = 0; p._comboT = 0;   /* getting hit breaks the chain */
  sfx.hurt();
  g.shake=Math.max(g.shake,7);
  g.damageFlash=Math.min(1,g.damageFlash+0.45);
  g.texts.push({x:p.x+rand(-8,8),y:p.y-p.r-8,vy:-55,life:.85,max:.85,spawn:.85,text:'-'+amount,color:'#ff5c5c',size:18});
  if(p.hp<=0){p.hp=0;gameOver()}
}
function gainXP(amount,g){
  const p=g.player;
  p.xp+=amount;
  let ups=0;
  while(p.xp>=p.xpNext){
    sfx.levelup();
    p.xp-=p.xpNext;p.level++;ups++;
    p.xpNext=Math.round(p.xpNext*1.12);   /* was 1.18 — levels stalled by wave 30 */
    p.baseStats.maxHp+=14;p.baseStats.dmg+=2.2;p.baseStats.energyRegen+=0.4;
    p.treePoints=(p.treePoints||0)+1;
    recalcStats(p);p.hp=p.maxHp;
    g.texts.push({x:p.x,y:p.y-55,vy:-40,life:1.5,max:1.5,spawn:1.5,text:'LEVEL UP!',color:'#f0c14b',size:24});
    g.texts.push({x:p.x,y:p.y-30,vy:-50,life:2.0,max:2.0,spawn:2.0,text:'+1 TREE POINT 🌳',color:'#7aff9a',size:16});
    g.fx.push({type:'ring',x:p.x,y:p.y,r:100,life:.7,max:.7,color:'#f0c14b'});
  }
  if(ups>0&&!cutscene.active&&G===g&&G.running){
    upgState.pending+=ups;
    openUpgradePanel(g);
    refreshShopStock(g); // shop gear re-anchored to the new level
  }
}
/* ── Level-up upgrade pick: Attribute Update OR Active Skill Update ── */
function openUpgradePanel(g){
  const p=g.player;
  if(!p)return;
  if(!p.upg)p.upg={...UPG_EMPTY};
  if(!p.attrs)p.attrs={str:0,vit:0,agi:0,wis:0,lck:0};
  const isMelee=(CLASSES[p.cls]||{}).basic==='melee';
  const availAttrs=ATTR_DEFS.filter(d => (p.attrs[d.id]||0) < d.cap).map(d => ({
    ...d,
    curLvl: p.attrs[d.id] || 0,
    badge: 'ATTRIBUTE'
  }));
  if(!isMelee && (p.upg.shots||0) < 3) {
    availAttrs.push({
      id:'shots', kind:'upg', icon:'🏹', name:'Apsara Volley',
      desc:'+1 Projectile per basic attack', cap:3,
      curLvl: p.upg.shots||0, badge: 'ATTRIBUTE'
    });
  }
  const availSkills = (p.skills||[]).map((s, idx) => ({
    id: 'skill_' + idx,
    kind: 'skill',
    skillIdx: idx,
    icon: s.icon || '✦',
    name: `[${idx+1}] ${s.name}`,
    desc: `+22% Skill Power & Area · -6% Cooldown · Enhanced Angkor VFX`,
    curLvl: s.lvl || 1,
    cap: 5,
    badge: `SKILL ${idx+1} UPGRADE`
  })).filter(s => s.curLvl < s.cap);

  if(availAttrs.length===0 && availSkills.length===0){
    upgState.pending=0;
    p.hp=Math.min(p.maxHp,p.hp+Math.round(p.maxHp*0.15));
    addToast('ALL BLESSINGS MAXED — +15% HP','#ffd54f','');
    return;
  }

  /* ASCENSION — every skill at the cap means the kit has earned a fusion */
  let evoOpt = null;
  if(!p._ascended && (p.skills||[]).filter(sk => (sk.lvl||1) >= 5).length >= 2){
    const maxed = (p.skills||[]).map((sk,idx)=>({sk,idx})).filter(o => (o.sk.lvl||1) >= 5);
    const target = maxed[0];
    evoOpt = {
      id:'evo_'+target.idx, kind:'evo', icon:'☀',
      skillIdx: target.idx,
      name: `ASCEND — ${target.sk.name}`,
      desc: '+45% damage for this skill · -15% cooldown · gilded Angkor sigil',
      badge: 'EVOLUTION'
    };
  }

  const pickedAttrs = availAttrs.slice().sort(()=>rng()-0.5).slice(0, 2);
  const pickedSkills = availSkills.slice().sort(()=>rng()-0.5).slice(0, 2);
  let combined = [...pickedAttrs, ...pickedSkills];
  if (combined.length < 4) {
    const rest = [...availAttrs, ...availSkills].filter(x => !combined.includes(x)).sort(()=>rng()-0.5);
    combined = combined.concat(rest.slice(0, 4 - combined.length));
  }
  upgState.opts = evoOpt ? [evoOpt, ...combined].slice(0, 4) : combined.slice(0, 4);
  upgState.open=true;upgState.token++;upgState.openAt=performance.now();
  const token=upgState.token;
  const el=document.getElementById('upgScreen');
  if(el){
    el.classList.remove('hidden');
    document.body.classList.add('upg-open');
    const sub=document.getElementById('upgSub');
    if(sub)sub.textContent='Level '+p.level+' — Choose an Attribute Blessing or Active Skill Upgrade'+(upgState.pending>1?'  ·  '+(upgState.pending-1)+' more to come':'');
    const attrBar=document.getElementById('upgAttrBar');
    if(attrBar){
      const at=p.attrs||{str:0,vit:0,agi:0,wis:0,lck:0};
      attrBar.innerHTML =
        `<span class="upg-attr-pill">⚔️ STR <b>${at.str||0}</b></span>`+
        `<span class="upg-attr-pill">🪨 VIT <b>${at.vit||0}</b></span>`+
        `<span class="upg-attr-pill">🌪️ AGI <b>${at.agi||0}</b></span>`+
        `<span class="upg-attr-pill">🔮 WIS <b>${at.wis||0}</b></span>`+
        `<span class="upg-attr-pill">🐍 LCK <b>${at.lck||0}</b></span>`+
        p.skills.map((s,idx)=>`<span class="upg-attr-pill">${s.icon} [${idx+1}] <b>Lv.${s.lvl||1}</b></span>`).join('');
    }
    const wrap=document.getElementById('upgCards');
    wrap.innerHTML='';
    upgState.opts.forEach((d,i)=>{
      const c=document.createElement('div');
      const isSkill = d.kind === 'skill';
      const isEvo = d.kind === 'evo';
      c.className='upg-card ' + (isEvo ? 'evo-upg' : isSkill ? 'skill-upg' : 'attr-upg');
      c.innerHTML='<div class="upg-type-badge '+(isEvo?'evo':isSkill?'skill':'attr')+'">'+d.badge+'</div>'
        +'<div class="upg-key">'+(i+1)+'</div>'
        +'<div class="upg-ico">'+d.icon+'</div>'
        +'<div class="upg-name">'+tr(d.name)+'</div>'
        +'<div class="upg-desc">'+tr(d.desc)+'</div>'
        +'<div class="upg-lvl">'+(isEvo ? 'Lv 5 → ASCENDED' : 'Lv '+d.curLvl+' → Lv '+(d.curLvl+1))+'</div>';
      c.addEventListener('click',()=>chooseUpgrade(i));
      wrap.appendChild(c);
    });
  }
  syncPause();
  if(autoPlay.enabled){
    setTimeout(()=>{
      if(!upgState.open||upgState.token!==token||!G||!G.running)return;
      const skillIdx = upgState.opts.findIndex(o => o.kind === 'skill');
      chooseUpgrade(skillIdx >= 0 ? skillIdx : 0);
    },5500);
  }
}
function chooseUpgrade(i){
  if(!upgState.open||!G||!G.player)return;
  const d=upgState.opts[i];if(!d)return;
  const g=G,p=g.player;
  upgState.open=false;
  if(!p.upg)p.upg={...UPG_EMPTY};
  if(!p.attrs)p.attrs={str:0,vit:0,agi:0,wis:0,lck:0};
  if (d.kind === 'evo') {
    const sk = p.skills[d.skillIdx];
    if (sk) {
      sk.evoDmg = (sk.evoDmg || 0) + 0.45;      /* only this skill */
      sk.baseCd = (sk.baseCd || 1) * 0.85;
      sk.lvl = 6;
      sk.evo = true;
      sk.name = sk.name.replace(/^☀ /,'');
      sk.name = '☀ ' + sk.name;
      sk.color = '#ffd76a';
      if (sk.lvlEl) sk.lvlEl.textContent = 'ASC';
    }
    p._ascended = true;
    spawnSkillVfx(g, p, 'pillar', p.x, p.y, 160, '#ffd76a');
    spawnSkillVfx(g, p, 'nova', p.x, p.y, 210, '#ffe9a8');
    g.fx.push({type:'ring',x:p.x,y:p.y,r:120,life:.9,max:.9,color:'#ffd76a'});
    addToast('ASCENSION', '#ffd76a', '☀ the kit is one again');
  } else if (d.kind === 'skill') {
    const sk = p.skills[d.skillIdx];
    if (sk) {
      sk.lvl = Math.min(5, (sk.lvl || 1) + 1);
      if (sk.lvlEl) sk.lvlEl.textContent = 'Lv.' + sk.lvl;
      spawnSkillVfx(g, p, 'pillar', p.x, p.y, 115, sk.color || p.accent || '#7fd4ff');
    }
  } else if (d.kind === 'attr') {
    p.attrs[d.id] = (p.attrs[d.id] || 0) + 1;
    if (d.id === 'vit') p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.18));
    if (d.id === 'lck') p._critDmg = (p._critDmg || 2) + 0.18;
    spawnSkillVfx(g, p, 'nova', p.x, p.y, 95, '#ffd54f');
  } else {
    p.upg[d.id]=(p.upg[d.id]||0)+1;
  }
  recalcStats(p);
  buildSkillbar(p);
  addToast(tr(d.name), d.kind==='skill'?'#7fd4ff':'#ffd54f', tr(d.desc));
  g.texts.push({x:p.x,y:p.y-46,vy:-40,life:1.3,max:1.3,spawn:1,text:d.icon+' '+tr(d.name),color:d.kind==='skill'?'#7fd4ff':'#ffd54f',size:16});
  g.fx.push({type:'ring',x:p.x,y:p.y,r:90,life:.55,max:.55,color:d.kind==='skill'?'#7fd4ff':'#ffd54f'});
  const el=document.getElementById('upgScreen');
  if(el)el.classList.add('hidden');
  syncPause();
  upgState.pending--;
  if(upgState.pending>0&&G&&G.running)setTimeout(()=>{if(G&&G.running)openUpgradePanel(G);},380);
}
function closeUpgradePanel(){
  upgState.open=false;upgState.pending=0;upgState.opts=[];
  const el=document.getElementById('upgScreen');
  if(el)el.classList.add('hidden');
  document.body.classList.remove('upg-open');
  syncPause();
}
function rollLoot(g,x,y,wave,guaranteed){
  let r=rng(),idx=0;
  const boost=Math.min(0.12,wave*0.014);
  if(r>0.985-boost)idx=3;
  else if(r>0.90-boost)idx=2;
  else if(r>0.62)idx=1;
  const it=makeItem(wave,idx);
  it.x=x;it.y=y;it.bob=rand(0,TAU);
  g.loot.push(it);
  if(guaranteed)g.fx.push({type:'ring',x,y,r:45,life:.5,max:.5,color:it.color});
  return it;
}
function addToast(title,color,sub){
  const box=document.getElementById('toasts');
  const d=document.createElement('div');
  d.className='toast';d.style.color=color;
  d.innerHTML=`${title}<div style="font-size:11px;color:#a89886;font-weight:normal">${sub||''}</div>`;
  box.appendChild(d);
  setTimeout(()=>d.remove(),2300);
  while(box.children.length>6)box.removeChild(box.firstChild);
}

/* Waves */
const BIOME_LORE={
  caverns:{n:'II',c:'#e8b060',t:'Beneath the ancient banyan roots of Ta Prohm, the earth groans. Far below, the Stone Titan awakens.',r:'GUARDIAN: TA PROHM TITAN'},
  frost:{n:'III',c:'#8fdcff',t:'Atop the sacred cliff sanctuary of Preah Vihear, celestial winds freeze under the Naga Wyrm\u2019s breath.',r:'GUARDIAN: CELESTIAL WYRM'},
  volcano:{n:'IV',c:'#ff7030',t:'The pink sandstone citadel of Banteay Srei blazes with divine fire. The Behemoth rises from the molten forge.',r:'GUARDIAN: AGNI BEHEMOTH'},
  shadow:{n:'V',c:'#c080ff',t:'In the heart of Bayon\u2019s smiling stone towers, Krong Reap sits upon the Five Thrones of Angkor.',r:'RULER: KRONG REAP, TEN-HEADED'},
  celestial:{n:'VI',c:'#ffe9a8',t:'Above every tower of stone stands Phnom Bakheng, where the storm is kept in a three-headed elephant\u2019s throat.',r:'RULER: AIRAVATA, STORM-BEARER'}};
function showLore(b){const L=BIOME_LORE[b.key];if(!L)return;const el=document.getElementById('loreCard');
  el.innerHTML='<div class="lr">REALM '+L.n+'</div><div class="ln" style="color:'+L.c+'">'+b.name.toUpperCase()+'</div><div class="lt">'+L.t+'</div><div class="lk" style="color:'+L.c+'">'+L.r+'</div>';
  el.classList.add('on');clearTimeout(showLore._t);showLore._t=setTimeout(()=>el.classList.remove('on'),7000)}

/* ═══ BOSS RUSH ═══
   Five guardians back to back, no trash waves, realms swap per fight.
   Uses the normal wave machinery so HP scaling, drops and cutscene-skip all
   behave exactly as they do in a campaign run. */
const RUSH_CHAIN = [
  { biome:'crypt',   boss:'cryptLord' },
  { biome:'caverns', boss:'cavernTitan' },
  { biome:'frost',   boss:'frostWyrm' },
  { biome:'volcano', boss:'volcanoBehemoth' },
  { biome:'shadow',  boss:'shadowPrince' },
  { biome:'celestial', boss:'airava' },
];
function startBossRush(){
  let cls='ironclad';
  try{ const saved=localStorage.getItem('sd_last_cls'); if(saved&&CLASSES[saved])cls=saved; }catch(e){}
  (window as any).__rushPending=true;
  try{
    const wg=(window as any).startGame;
    if(typeof wg==='function') wg(cls); else startGame(cls);
  }catch(e){ (window as any).__rushPending=false; console.error('❌ boss rush start:',e); return; }
  setTimeout(()=>addToast('⚔ BOSS RUSH','#ff5c5c','Six guardians · no trash waves · one life'),900);
}
function endBossRush(g){
  g.rush=false;
  const bonus=120;
  META.souls+=bonus; META.earned+=bonus; saveMeta();
  recordMetaRun(g, computeHeroScore(g.wave||1,g.kills||0,(g.player&&g.player.level)||1,Math.floor((g.player&&g.player.gold)||0),diffKey||'normal'), true);
  addToast('⚔ BOSS RUSH CLEARED','#ffd54f','+'+bonus+' souls banked');
  g._finaleDone=true;
  try{ showVictoryScreen(); }catch(e){}
}

function startWave(g){
  g.wave++;
  refreshShopStock(g);
  let biome=getBiomeForWave(g.wave);
  if(g.rush){
    const r=RUSH_CHAIN[Math.min(g.rushIdx||0,RUSH_CHAIN.length-1)];
    biome=BIOMES.find(b=>b.key===r.biome)||biome;
  }
  g.currentBiomeKey=biome.key;
  const CSC={crypt:['cryptLord',startCryptLordCutscene],caverns:['cavernTitan',startTitanCutscene],frost:['frostWyrm',startWyrmCutscene],volcano:['volcanoBehemoth',startBehemothCutscene],shadow:['shadowPrince',startPrinceCutscene],celestial:['airava',startAiravaCutscene]}[biome.key];
  /* Every realm opens on its guardian wave, so the lore card and the boss
     cinematic used to fire together and the card sat on top of the intro. On a
     boss wave the cinematic is the introduction; skip the card. */
  const willCutscene = g.rush ? false : (isBossWave(g.wave) && !!CSC && !(g._cutscenesPlayed && g._cutscenesPlayed[CSC[0]]));
  if(biome.key!==g.lastBiomeKey){
    g.lastBiomeKey=biome.key;
    setFloorForBiome(biome.key);
    respawnDustForBiome(biome.key);
    /* the door wipe and the cinematic both introduce the realm — running both
       puts stone panels over the intro's first two seconds */
    if(!willCutscene) g.realmWipe={t:0,name:biome.name,sub:'REALM '+(BIOMES.indexOf(biome)+1)+' OF '+BIOMES.length};
    updateBiomeLabel();
    if(!willCutscene) showLore(biome);
    saveGame();
  }
  const isBoss=g.rush?true:isBossWave(g.wave), isElite=g.rush?false:isEliteWave(g.wave);
  const n=g.rush?0:Math.min(3+g.wave*2,38); // early waves lighter (wave1: 5 mobs) so melee tanks can wall the open
  g.spawnQueue=[];
  for(let i=0;i<n;i++){
    let type=pick(biome.enemies);
    if(isElite&&i===0)type='elite';
    g.spawnQueue.push(type);
  }
  if(g.rush){
    const r=RUSH_CHAIN[Math.min(g.rushIdx||0,RUSH_CHAIN.length-1)];
    g.spawnQueue.push('BOSS:'+r.boss); markCodex(r.boss,'seen');
  } else if(isBoss){ g.spawnQueue.push('BOSS:'+biome.boss); markCodex(biome.boss,'seen'); }
  if(isBoss&&CSC&&!(g._cutscenesPlayed&&g._cutscenesPlayed[CSC[0]])){
    g._cutscenesPlayed=g._cutscenesPlayed||{};
    g._cutscenesPlayed[CSC[0]]=true;
    g.spawnQueue=g.spawnQueue.filter(t=>!t.startsWith('BOSS:'));
    g.spawnTimer=0;g.betweenWaves=false;g.waveStallTimer=0;
    CSC[1](g);
    return;
  }
  g.spawnTimer=0;g.betweenWaves=false;g.waveStallTimer=0;
  let title=`WAVE ${g.wave}`,subtitle='',color='#e8c07a';
  if(isBoss){title=`◆ BOSS: ${BOSS_TYPES[biome.boss].name.toUpperCase()} ◆`;color='#ff5c5c';subtitle=biome.name}
  else if(isElite){title=`WAVE ${g.wave} — ELITE`;color='#ff8f2e';subtitle='A powerful champion'}
  else subtitle=biome.name;
  addToast(title,color,subtitle);
}
function spawnEnemy(type,g,forcedX:any=null,forcedY:any=null){
  let isEliteSpawn=false,isBossSpawn=false,bossKey=null;
  if(type==='elite'){isEliteSpawn=true;type=pick(getBiomeForWave(g.wave).enemies)}
  else if(type.startsWith('BOSS:')){isBossSpawn=true;bossKey=type.substring(5)}
  /* record the creature for the bestiary (flat key, same one renderArchive reads) */
  if(!isBossSpawn && type && ENEMY_LORE[type] && !META.codex['e_'+type]){
    META.codex['e_'+type]=true; saveMeta();
  }
  let t,name;
  if(isBossSpawn){t=BOSS_TYPES[bossKey];name=t.name}
  else{t=ENEMY_TYPES[type];name=type}
  let x,y,tries=0;
  if(forcedX!==undefined&&forcedY!==undefined){x=forcedX;y=forcedY}
  else do{
    const a=rand(0,TAU),d=rand(560,820);
    x=clamp(g.player.x+Math.cos(a)*d,50,WORLD.w-50);
    y=clamp(g.player.y+Math.sin(a)*d,50,WORLD.h-50);
    tries++;
  }while(Math.hypot(x-g.player.x,y-g.player.y)<420&&tries<30);
  const dM=g.diff||DIFFS.normal,ng=g.ngPlus||0,es=(g.endless&&g.wave>40)?1+(g.wave-40)*0.08:1;
  const hpScale=(1+g.wave*0.16)*dM.hp*(1+ng*0.5)*es,dmgScale=(1+g.wave*0.11)*dM.dmg*(1+ng*0.35)*es,eliteMult=isEliteSpawn?2.5:1;
  g.portals.push({x,y,life:1.1,max:1.1,color:t.color,r:isBossSpawn?70:(isEliteSpawn?55:40),rot:rand(0,TAU)});
  const e={
    type:isBossSpawn?'boss':type,bossKey,name,x,y,r:t.r,
    maxHp:Math.round(t.hp*hpScale*eliteMult),hp:Math.round(t.hp*hpScale*eliteMult),
    speed:t.speed,dmg:t.dmg*dmgScale*(isEliteSpawn?1.5:1),
    color:t.color,dark:t.dark,
    xp:Math.round(t.xp*(1+g.wave*0.16)*eliteMult*dM.xp),
    gold:Math.round(t.xp*(1+g.wave*0.07)*eliteMult*(isBossSpawn?1.2:0.7)*dM.gold),
    range:t.range,atkCd:t.atkCd,atkTimer:rand(0.4,t.atkCd),
    ranged:!!t.ranged,boss:!!t.boss||isBossSpawn,elite:isEliteSpawn,
    dead:false,hitFlash:0,slowT:0,aliveTime:0,
    markT:0,stunT:0,dotT:0,dotDmg:0,dotTick:0,dotColor:null,
    atkAnim:0,facing:0,wobble:rand(0,TAU),spawnAnim:1,
    behavior:t.behavior||'melee',attackType:t.attackType,
    teleports:t.teleports,slowOnHit:t.slowOnHit,
    leapTimer:1,isLeaping:false,leapVx:0,leapVy:0,leapDuration:0,
    slamTimer:1,isSlamming:false,kamikazeFuse:0,kamikazeTriggered:false,
    healCd:t.healCd||4.5,healTimer:2,chargeTimer:2,isCharging:false,chargeVx:0,chargeVy:0,
    attacks:t.attacks?[...t.attacks]:null,attackCdTimer:1.5,phase:1,
    eliteAura:isEliteSpawn?pick(['fire','ice','lightning','holy']):null
  };
  /* AFFIXES: past wave 16 a share of mobs carry a modifier, so late waves are
     not just bigger numbers on the same fight. */
  if(g.wave>=16 && !isBossSpawn && !isEliteSpawn && rand(0,1)<0.35){
    const aff=pick(['shielded','hasted']);
    e.affix=aff;
    if(aff==='shielded'){e.maxHp=Math.round(e.maxHp*1.6);e.hp=e.maxHp;e.affixColor='#7fd4ff'}
    else {e.speed=Math.round(e.speed*1.45);e.affixColor='#ffb040'}
  }
  g.enemies.push(e);
  if(isBossSpawn){e.maxHp*=1.5;e.hp=e.maxHp;g.shake=12;sfx.boss();}
  if(e.boss)g.fx.push({type:'summon',x:e.x,y:e.y,s:1.7,life:1.5,max:1.5});
}
function spawnEnemyAt(type,g,x,y,hpScale){
  const t=ENEMY_TYPES[type];if(!t)return;
  const scale=hpScale||1;
  g.enemies.push({type,x,y,r:t.r,
    maxHp:Math.round(t.hp*(1+g.wave*0.16)*scale),hp:Math.round(t.hp*(1+g.wave*0.16)*scale),
    speed:t.speed,dmg:t.dmg*(1+g.wave*0.11)*scale,color:t.color,dark:t.dark,xp:t.xp,
    gold:Math.round(t.xp*0.7),
    range:t.range,atkCd:t.atkCd,atkTimer:0.5,ranged:!!t.ranged,boss:false,elite:false,
    dead:false,hitFlash:0,slowT:0,aliveTime:0,
    markT:0,stunT:0,dotT:0,dotDmg:0,dotTick:0,dotColor:null,
    atkAnim:0,facing:0,wobble:rand(0,TAU),spawnAnim:0.5,
    behavior:t.behavior||'melee',attackType:t.attackType,
    leapTimer:1,isLeaping:false,leapVx:0,leapVy:0,leapDuration:0,
    slamTimer:1,isSlamming:false,kamikazeFuse:0,kamikazeTriggered:false,
    healCd:4.5,healTimer:2,chargeTimer:2,isCharging:false,chargeVx:0,chargeVy:0});
}

/* Enemy AI */
function updateEnemies(dt,g){
  /* combo decay + elemental statuses tick on the enemy */
  if(g.player && g.player._comboT > 0){
    g.player._comboT -= dt;
    if(g.player._comboT <= 0) g.player._combo = 0;
  }
  for(const e of g.enemies){
    if(e.dead) continue;
    if(e.burnT > 0){
      e.burnT -= dt;
      e.hp -= (e.burnDps||0) * dt;
      if(rng() < dt*14) g.particles.push({x:e.x+rand(-e.r,e.r), y:e.y-rand(0,e.r), vx:rand(-12,12), vy:-rand(30,70),
        life:.4, max:.4, size:rand(1.4,2.6), color:'#ff7a2e', glow:true});
      if(e.hp <= 0){ killEnemy(e,g); continue; }
    }
    if(e.bleedT > 0){
      e.bleedT -= dt;
      e.hp -= (e.bleedDps||0) * dt;
      if(rng() < dt*10) g.particles.push({x:e.x+rand(-e.r,e.r), y:e.y-rand(0,e.r*0.6), vx:rand(-8,8), vy:rand(10,40),
        life:.35, max:.35, size:rand(1.2,2.2), color:'#c0392b'});
      if(e.hp <= 0){ killEnemy(e,g); continue; }
    }
    if(e.burnT <= 0) e.burnDps = 0;
    if(e.bleedT <= 0) e.bleedDps = 0;
  }
  const p=g.player;
  for(const e of g.enemies){
    if(e.dead)continue;
    if(e.spawnAnim>0)e.spawnAnim=Math.max(0,e.spawnAnim-dt*2.5);
    e.hitFlash=Math.max(0,e.hitFlash-dt*4);
    e.slowT=Math.max(0,e.slowT-dt);
    { const sl=e.slowT>0; if(sl&&!e._wasSlowed){e._wasSlowed=true;if(p)tcount(p,'slows')} else if(!sl)e._wasSlowed=false; }
    e.markT=Math.max(0,(e.markT||0)-dt);
    if(e.dotT>0){
      e.dotT-=dt;e.dotTick-=dt;
      if(e.dotTick<=0){
        e.dotTick=0.5;
        const td=Math.max(1,Math.round(e.dotDmg*0.5));
        e.hp-=td;e.hitFlash=Math.max(e.hitFlash,0.4);
        g.texts.push({x:e.x+rand(-6,6),y:e.y-e.r-6,vy:-50,life:0.6,max:0.6,spawn:0.6,text:String(td),color:e.dotColor||'#7aff9a',size:12});
        if(e.hp<=0){killEnemy(e,g);continue}
      }
    }
    if(e.boss&&e.atkTimer!==undefined&&e.atkTimer<0.45&&!e.dead){
    const k=1-(e.atkTimer/0.45);
    ctx.save();ctx.globalAlpha=0.30+0.45*k;
    ctx.strokeStyle='#ff4040';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(0,0,e.r*(1.9+0.5*k),0,TAU);ctx.stroke();
    ctx.restore();
  }
  if(e.stunT>0){
      e.stunT-=dt;
      e.wobble+=dt*10;
      continue;
    }
    e.atkTimer-=dt;e.atkAnim=Math.max(0,(e.atkAnim||0)-dt*3);e.wobble+=dt*6;
    if(e.boss){updateBossAI(e,g,dt);continue}
    let target=p,td=dist(e,p);
    if(p._stealthT>0){target=null;td=9999}
    for(const m of g.minions){const md=dist(e,m);if(md<td*0.85){target=m;td=md}}
    if(!target){
      const a=e.facing;
      e.x+=Math.cos(a)*e.speed*0.3*dt;e.y+=Math.sin(a)*e.speed*0.3*dt;
      continue;
    }
    const a=Math.atan2(target.y-e.y,target.x-e.x);
    e.facing=a;
    switch(e.behavior){
      case 'leaper':updateLeaper(e,g,target,td,a,dt);break;
      case 'slam':updateSlam(e,g,target,td,a,dt);break;
      case 'kamikaze':updateKamikaze(e,g,target,td,a,dt);break;
      case 'healer':updateHealer(e,g,target,td,a,dt);break;
      case 'charger':updateCharger(e,g,target,td,a,dt);break;
      case 'phaser':updatePhaser(e,g,target,td,a,dt);break;
      case 'ranged':updateRanged(e,g,target,td,a,dt);break;
      default:updateMelee(e,g,target,td,a,dt);break;
    }
    e.aliveTime=(e.aliveTime||0)+dt;
    if(g.spawnQueue.length===0&&e.aliveTime>18&&dist(e,g.player)>500){
      const ta=rand(0,TAU),d=220+rand(0,140);
      e.x=clamp(g.player.x+Math.cos(ta)*d,50,WORLD.w-50);
      e.y=clamp(g.player.y+Math.sin(ta)*d,50,WORLD.h-50);
      e.aliveTime=0;e.isLeaping=false;e.isCharging=false;e.isSlamming=false;e.leapDuration=0;
    }
    e.x=clamp(e.x,25,WORLD.w-25);e.y=clamp(e.y,25,WORLD.h-25);
  }
  const arr=g.enemies.filter(e=>!e.dead&&e.behavior!=='phaser'&&!(e.stunT>0));
  for(let i=0;i<arr.length;i++){
    const a1=arr[i];
    for(let j=i+1;j<arr.length;j++){
      const b=arr[j];
      const dx=b.x-a1.x,dy=b.y-a1.y,dd=Math.hypot(dx,dy);
      const minD=a1.r+b.r;
      if(dd>0&&dd<minD){
        const push=(minD-dd)/2,nx=dx/dd,ny=dy/dd;
        a1.x-=nx*push;a1.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
      }
    }
  }
}
function updateMelee(e,g,target,td,a,dt){
  const spd=e.speed*(e.slowT>0?0.42:1);
  const stopDist=e.r+target.r+4;
  if(td>stopDist){e.x+=Math.cos(a)*spd*dt;e.y+=Math.sin(a)*spd*dt}
  else if(e.atkTimer<=0){e.atkTimer=e.atkCd;e.atkAnim=1;
    if(target===g.player)damagePlayer(e.dmg,g,'melee',e);else damageMinion(target,e.dmg*0.8,g)}
}
function updateRanged(e,g,target,td,a,dt){
  const spd=e.speed*(e.slowT>0?0.42:1);
  const desired=270;
  if(e.teleports&&td<140&&e.atkTimer<=0){
    const ta=rand(0,TAU),d2=rand(200,350);
    e.x=clamp(g.player.x+Math.cos(ta)*d2,40,WORLD.w-40);
    e.y=clamp(g.player.y+Math.sin(ta)*d2,40,WORLD.h-40);
    e.atkTimer=1.5;return;
  }
  if(td>desired+60){e.x+=Math.cos(a)*spd*dt;e.y+=Math.sin(a)*spd*dt}
  else if(td<desired-90){e.x-=Math.cos(a)*spd*dt;e.y-=Math.sin(a)*spd*dt}
  else{const sa=a+Math.PI/2;e.x+=Math.cos(sa)*spd*0.6*dt;e.y+=Math.sin(sa)*spd*0.6*dt}
  if(td<e.range&&e.atkTimer<=0){e.atkTimer=e.atkCd;e.atkAnim=1;fireEnemyAttack(e,g,target,a)}
}
function updateHealer(e,g,target,td,a,dt){
  e.healTimer=(e.healTimer||0)-dt;
  if(e.healTimer<=0){
    e.healTimer=e.healCd||4.5;
    for(const other of g.enemies){
      if(other===e||other.dead||other.hp>=other.maxHp)continue;
      if(dist(e,other)<260){
        other.hp=Math.min(other.maxHp,other.hp+Math.round(other.maxHp*0.25));
      }
    }
  }
  const spd=e.speed*(e.slowT>0?0.42:1);
  if(td<200){e.x-=Math.cos(a)*spd*dt;e.y-=Math.sin(a)*spd*dt}
  else if(td>320){e.x+=Math.cos(a)*spd*0.5*dt;e.y+=Math.sin(a)*spd*0.5*dt}
}
function updateLeaper(e,g,target,td,a,dt){
  e.leapTimer=(e.leapTimer||0)-dt;
  if(e.isLeaping){
    e.leapDuration=(e.leapDuration||0)+dt;
    if(e.leapDuration>0.5){e.isLeaping=false;e.leapDuration=0;e.leapTimer=2.5;return}
    e.x+=e.leapVx*dt;e.y+=e.leapVy*dt;
    if(dist(e,target)<e.r+target.r+8){
      e.isLeaping=false;e.leapDuration=0;
      if(target===g.player)damagePlayer(e.dmg*1.2,g,'melee',e);else damageMinion(target,e.dmg*1.2,g);
      if(target===g.player)target.slowT=1.0;
    }
    return;
  }
  if(e.leapTimer<=0&&td<300&&td>60){
    e.leapTimer=2.5;e.isLeaping=true;e.leapDuration=0;
    e.leapVx=Math.cos(a)*720;e.leapVy=Math.sin(a)*720;return;
  }
  const spd=e.speed*(e.slowT>0?0.42:1);
  const stopDist=e.r+target.r+4;
  if(td>stopDist){e.x+=Math.cos(a)*spd*dt;e.y+=Math.sin(a)*spd*dt}
  else if(e.atkTimer<=0){e.atkTimer=e.atkCd;e.atkAnim=1;
    if(target===g.player)damagePlayer(e.dmg,g,'melee',e);else damageMinion(target,e.dmg*0.8,g)}
}
function updateSlam(e,g,target,td,a,dt){
  e.slamTimer=(e.slamTimer||0)-dt;
  if(e.isSlamming){
    e.slamTimer-=dt;
    if(e.slamTimer<=0){
      e.isSlamming=false;e.slamTimer=3.2;
      for(const pl of [g.player,...g.minions]){
        if(!pl||pl.dead)continue;
        if(dist(e,pl)<120){if(pl===g.player)damagePlayer(e.dmg*1.4,g,'melee',e);else damageMinion(pl,e.dmg*1.2,g)}
      }
      g.shake=Math.max(g.shake,8);
    }
    return;
  }
  if(e.slamTimer<=0&&td<130){e.isSlamming=true;e.slamTimer=0.6;return}
  const spd=e.speed*(e.slowT>0?0.42:1);
  const stopDist=e.r+target.r+4;
  if(td>stopDist){e.x+=Math.cos(a)*spd*dt;e.y+=Math.sin(a)*spd*dt}
  else if(e.atkTimer<=0){e.atkTimer=e.atkCd;e.atkAnim=1;
    if(target===g.player)damagePlayer(e.dmg,g,'melee',e);else damageMinion(target,e.dmg*0.8,g)}
}
function updateKamikaze(e,g,target,td,a,dt){
  const spd=e.speed*(e.slowT>0?0.42:1);
  if(e.kamikazeTriggered){
    e.kamikazeFuse-=dt;
    if(e.kamikazeFuse<=0){
      g.shake=Math.max(g.shake,9);
      for(const pl of [g.player,...g.minions]){
        if(!pl||pl.dead)continue;
        if(dist(e,pl)<120){if(pl===g.player)damagePlayer(e.dmg,g,'melee',e);else damageMinion(pl,e.dmg*0.9,g)}
      }
      e.dead=true;g.kills++;addBloodDecal(e.x,e.y);gainXP(e.xp,g);
    } else {e.x+=Math.cos(a)*spd*0.5*dt;e.y+=Math.sin(a)*spd*0.5*dt}
    return;
  }
  if(td<130){e.kamikazeTriggered=true;e.kamikazeFuse=1.1;return}
  e.x+=Math.cos(a)*spd*dt;e.y+=Math.sin(a)*spd*dt;
}
function updateCharger(e,g,target,td,a,dt){
  e.chargeTimer=(e.chargeTimer||0)-dt;
  if(e.isCharging){
    e.x+=e.chargeVx*dt;e.y+=e.chargeVy*dt;
    if(dist(e,target)<e.r+target.r+10){
      e.isCharging=false;
      if(target===g.player)damagePlayer(e.dmg*1.5,g,'melee',e);else damageMinion(target,e.dmg*1.2,g);
      g.shake=Math.max(g.shake,5);
    }
    return;
  }
  if(e.chargeTimer<=0&&td>100&&td<420){
    e.chargeTimer=2.8;
    g.delayed.push({t:0.7,fn:()=>{
      if(!G||e.dead)return;
      e.isCharging=true;
      const a2=Math.atan2(G.player.y-e.y,G.player.x-e.x);
      e.chargeVx=Math.cos(a2)*900;e.chargeVy=Math.sin(a2)*900;
      g.delayed.push({t:0.5,fn:()=>{if(e)e.isCharging=false}});
    }});
    return;
  }
  const spd=e.speed*(e.slowT>0?0.42:1);
  if(td>40){e.x+=Math.cos(a)*spd*dt;e.y+=Math.sin(a)*spd*dt}
}
function updatePhaser(e,g,target,td,a,dt){
  const spd=e.speed*(e.slowT>0?0.42:1);
  const stopDist=e.r+target.r+4;
  if(td>stopDist){e.x+=Math.cos(a)*spd*dt;e.y+=Math.sin(a)*spd*dt}
  else if(e.atkTimer<=0){e.atkTimer=e.atkCd;e.atkAnim=1;
    if(target===g.player)damagePlayer(e.dmg,g,'melee',e);else damageMinion(target,e.dmg*0.8,g)}
}
function fireEnemyAttack(e,g,target,a){
  const type=e.attackType||'arrow';
  const speed=type==='sniperShot'?900:(type==='fireball'?380:400);
  const projR=type==='sniperShot'?4:(type==='fireball'?8:6);
  const color=type==='sniperShot'?'#ff4d4d':type==='fireball'?'#ff5020':type==='iceShard'?'#7fd4ff':type==='arcaneBolt'?'#b47cff':type==='darkOrb'?'#a060ff':'#ff9b6b';
  spawnProj(g,{x:e.x+Math.cos(a)*e.r,y:e.y+Math.sin(a)*e.r,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
    r:projR,dmg:e.dmg,life:2.0,color,from:'enemy',slowOnHit:e.slowOnHit,owner:e});
}
function updateBossAI(boss,g,dt){
  const p=g.player;
  const a=Math.atan2(p.y-boss.y,p.x-boss.x);
  boss.facing=a;
  const td=dist(boss,p);
  const hpPct=boss.hp/boss.maxHp;
  if(boss.phase===1&&hpPct<0.5){
    boss.phase=2;boss.attackCd=Math.max(1.2,boss.attackCd*0.7);boss.speed*=1.2;
    g.shake=14;
    addToast(boss.name.toUpperCase()+' — PHASE 2','#ff5c5c',BOSS_TAUNTS[boss.bossKey]||'The boss enrages');
  }
  if(!boss.isExecuting){
    const spd=boss.speed*(boss.slowT>0?0.42:1);
    const stopDist=boss.r+p.r+4;
    if(td>stopDist){boss.x+=Math.cos(a)*spd*dt;boss.y+=Math.sin(a)*spd*dt}
  }
  if(td<boss.r+p.r+12&&boss.atkTimer<=0){
    boss.atkTimer=1.2;damagePlayer(boss.dmg*0.8,g,'melee',boss);
  }
  boss.attackCdTimer-=dt;
  if(boss.attackCdTimer<=0&&boss.attacks&&boss.attacks.length){
    boss.attackCdTimer=boss.attackCd||2.5;
    executeBossAttack(boss,pick(boss.attacks),g);
  }
}
function executeBossAttack(boss,attack,g){
  const p=g.player;
  const a=Math.atan2(p.y-boss.y,p.x-boss.x);
  boss.isExecuting=true;
  setTimeout(()=>{if(boss)boss.isExecuting=false},900);
  switch(attack){
    case 'groundPound':
      g.delayed.push({t:.8,fn:()=>{if(!G||boss.dead)return;if(dist(boss,G.player)<220)damagePlayer(boss.dmg*1.5,G,'melee',boss);G.shake=Math.max(G.shake,12)}});break;
    case 'summonSkeletons':
      for(let i=0;i<3;i++){const sa=rand(0,TAU),sd=rand(80,150);
        spawnEnemyAt('skeleton',g,clamp(boss.x+Math.cos(sa)*sd,50,WORLD.w-50),clamp(boss.y+Math.sin(sa)*sd,50,WORLD.h-50),0.7);}break;
    case 'darkBolt':
      for(let i=-1;i<=1;i++){const a2=a+i*0.25;
        spawnProj(g,{x:boss.x,y:boss.y,vx:Math.cos(a2)*420,vy:Math.sin(a2)*420,r:12,dmg:boss.dmg,life:2.5,color:'#8e44ad',from:'enemy',owner:boss});}break;
    case 'stomp':
      g.delayed.push({t:.7,fn:()=>{if(!G||boss.dead)return;if(dist(boss,G.player)<260)damagePlayer(boss.dmg*1.3,G,'melee',boss);G.player.slowT=1.5;G.shake=Math.max(G.shake,10)}});break;
    case 'rockThrow':
      for(let i=0;i<3;i++){g.delayed.push({t:i*0.15,fn:()=>{
        if(!G||boss.dead)return;
        const ta=Math.atan2(G.player.y-boss.y,G.player.x-boss.x)+rand(-0.15,0.15);
        spawnProj(G,{x:boss.x,y:boss.y,vx:Math.cos(ta)*380,vy:Math.sin(ta)*380,r:14,dmg:boss.dmg*0.9,life:2.5,color:'#8a5a2a',from:'enemy',owner:boss});
      }});}break;
    case 'enrage':boss.speed*=1.3;boss.attackCd=Math.max(1.0,boss.attackCd-0.3);break;
    case 'iceBreath':
      g.delayed.push({t:.5,fn:()=>{if(!G||boss.dead)return;
        const p2=G.player,pa=Math.atan2(p2.y-boss.y,p2.x-boss.x);
        if(Math.abs(angDiff(pa,a))<0.5&&dist(boss,p2)<280){damagePlayer(boss.dmg*1.4,G,'melee',boss);p2.slowT=2.5}}});break;
    case 'iceShards':
      for(let i=-3;i<=3;i++){const a2=a+i*0.2;
        spawnProj(g,{x:boss.x,y:boss.y,vx:Math.cos(a2)*450,vy:Math.sin(a2)*450,r:8,dmg:boss.dmg*0.7,life:1.8,color:'#7fd4ff',from:'enemy',slowOnHit:true,owner:boss});}break;
    case 'teleport':{
      const ta=a+Math.PI;
      boss.x=clamp(boss.x+Math.cos(ta)*250,100,WORLD.w-100);
      boss.y=clamp(boss.y+Math.sin(ta)*250,100,WORLD.h-100);break;
    }
    case 'lavaPool':{
      const w=G.player;
      g.hazards.push({x:w.x+rand(-40,40),y:w.y+rand(-40,40),r:130,life:4.0,max:4.0,tick:0,dmg:boss.dmg*0.35,color:'#ff5020'});break;
    }
    case 'fireWave':
      for(let i=0;i<3;i++){g.delayed.push({t:i*0.3,fn:()=>{
        if(!G||boss.dead)return;
        const d2=dist(boss,G.player);
        if(d2<180+i*60&&d2>180+i*60-60)damagePlayer(boss.dmg*1.1,G,'melee',boss);
      }});}break;
    case 'charge':
      g.delayed.push({t:.6,fn:()=>{
        if(!G||boss.dead)return;
        const a2=Math.atan2(G.player.y-boss.y,G.player.x-boss.x);
        boss.chargeVx=Math.cos(a2)*900;boss.chargeVy=Math.sin(a2)*900;
        boss.isCharging=true;
        g.delayed.push({t:.6,fn:()=>{if(boss)boss.isCharging=false;if(G&&dist(boss,G.player)<80)damagePlayer(boss.dmg*1.5,G,'melee',boss)}});
      }});break;
    case 'shadowBeam':{
      const tx=p.x,ty=p.y;
      g.delayed.push({t:.6,fn:()=>{
        if(!G||boss.dead)return;
        for(let t=0;t<=1;t+=0.1){
          const bx=boss.x+(tx-boss.x)*t,by=boss.y+(ty-boss.y)*t;
          if(dist({x:bx,y:by},G.player)<30){damagePlayer(boss.dmg*1.2,G,'melee',boss);break}
        }
      }});break;
    }
    case 'cloneSummon':
      for(let i=0;i<2;i++){const sa=rand(0,TAU),sd=rand(100,180);
        spawnEnemyAt('wraith',g,clamp(boss.x+Math.cos(sa)*sd,50,WORLD.w-50),clamp(boss.y+Math.sin(sa)*sd,50,WORLD.h-50),0.8);}break;
    case 'darkNova':
      g.delayed.push({t:.9,fn:()=>{if(!G||boss.dead)return;if(dist(boss,G.player)<260)damagePlayer(boss.dmg*1.6,G,'melee',boss);G.shake=Math.max(G.shake,14)}});break;
    case 'teleportDodge':{
      const ta=a+Math.PI+rand(-0.5,0.5);
      boss.x=clamp(boss.x+Math.cos(ta)*300,100,WORLD.w-100);
      boss.y=clamp(boss.y+Math.sin(ta)*300,100,WORLD.h-100);
      for(let i=0;i<5;i++){const a2=a+rand(-0.4,0.4);
        spawnProj(g,{x:boss.x,y:boss.y,vx:Math.cos(a2)*500,vy:Math.sin(a2)*500,r:7,dmg:boss.dmg*0.6,life:1.5,color:'#a060ff',from:'enemy',owner:boss});}break;
    }
  }
}

/* Update helpers */
function updateProjectiles(dt,g){
  const p=g.player;
  for(let i=g.projectiles.length-1;i>=0;i--){
    const pr=g.projectiles[i];
    if(pr.homing&&pr.homingTarget&&!pr.homingTarget.dead){
      const a=Math.atan2(pr.homingTarget.y-pr.y,pr.homingTarget.x-pr.x);
      const sp=Math.hypot(pr.vx,pr.vy);
      const turn=Math.min(1,dt*8);
      const na=Math.atan2(pr.vy,pr.vx)+angDiff(a,Math.atan2(pr.vy,pr.vx))*turn;
      pr.vx=Math.cos(na)*sp;pr.vy=Math.sin(na)*sp;
    }
    pr.x+=pr.vx*dt;pr.y+=pr.vy*dt;pr.life-=dt;
    let remove=false;
    if(pr.from==='player'){
      for(const e of g.enemies){
        if(e.dead||pr.hit.has(e))continue;
        if(dist(pr,e)<pr.r+e.r){
          pr.hit.add(e);
          const opts = pr.isBasic ? {fromBasic:true} : {skill:true};
          damageEnemy(e,pr.dmg,g,p,opts);
          if(pr.isBasic&&p._frostfire&&!e.dead)e.slowT=Math.max(e.slowT,1.5);
          if(pr.enemyEffect)pr.enemyEffect(e,g,p);
          if(pr.explode){explodeAt(g,pr.x,pr.y,pr.explode);remove=true;break}
          if(pr.pierce>0)pr.pierce--;else{remove=true;break}
        }
      }
    } else {
      let hit=false;
      if(p.invuln<=0&&dist(pr,p)<pr.r+p.r){damagePlayer(pr.dmg,g,'proj',pr.owner);if(pr.slowOnHit)p.slowT=1.5;hit=true}
      if(!hit){for(const m of g.minions){if(dist(pr,m)<pr.r+m.r){damageMinion(m,pr.dmg,g);hit=true;break}}}
      if(hit)remove=true;
    }
    if(pr.life<=0||pr.x<0||pr.y<0||pr.x>WORLD.w||pr.y>WORLD.h){
      if(pr.explode&&pr.from==='player')explodeAt(g,pr.x,pr.y,pr.explode);
      remove=true;
    }
    if(remove)g.projectiles.splice(i,1);
  }
}
function updateHazards(dt,g){
  for(let i=g.hazards.length-1;i>=0;i--){
    const h=g.hazards[i];h.life-=dt;h.tick=(h.tick||0)-dt;
    if(h.tick<=0){h.tick=0.5;if(dist(h,g.player)<h.r&&g.player.invuln<=0)damagePlayer(h.dmg,g,'hazard')}
    if(h.life<=0)g.hazards.splice(i,1);
  }
}
function updateTraps(dt,g){
  for(let i=g.traps.length-1;i>=0;i--){
    const t=g.traps[i];t.life-=dt;
    if(t.life<=0){g.traps.splice(i,1);continue}
    for(const e of g.enemies){
      if(e.dead)continue;
      if(dist(t,e)<t.r+e.r){
        for(const e2 of g.enemies){
          if(e2.dead)continue;
          if(dist(t,e2)<t.r+e2.r)damageEnemy(e2,t.dmg,g,g.player);
        }
        g.fx.push({type:'boom',x:t.x,y:t.y,r:t.r,life:.5,max:.5,color:t.color});
        g.shake=Math.max(g.shake,5);
        g.traps.splice(i,1);break;
      }
    }
  }
}
function updateTotems(dt,g){
  for(let i=g.totems.length-1;i>=0;i--){
    const t=g.totems[i];t.life-=dt;t.tick-=dt;
    if(t.tick<=0){
      t.tick=0.6;
      if(t.healing){
        if(dist(t,g.player)<t.r&&g.player.hp>0){
          g.player.hp=Math.min(g.player.maxHp,g.player.hp+Math.round(t.healAmt*0.15));
          g.fx.push({type:'ring',x:g.player.x,y:g.player.y,r:40,life:.3,max:.3,color:t.color});
        }
      } else {
        for(const e of g.enemies){
          if(e.dead)continue;
          if(dist(t,e)<t.r+e.r)damageEnemy(e,t.dmg,g,g.player);
        }
      }
    }
    if(t.life<=0)g.totems.splice(i,1);
  }
}
function updateGrounds(dt,g){
  for(let i=g.grounds.length-1;i>=0;i--){
    const gr=g.grounds[i];gr.life-=dt;gr.tick-=dt;
    if(gr.tick<=0){
      gr.tick=0.4;
      for(const e of g.enemies){
        if(e.dead)continue;
        if(dist(gr,e)<gr.r+e.r)damageEnemy(e,gr.dmg*0.4,g,g.player);
      }
    }
    if(gr.life<=0)g.grounds.splice(i,1);
  }
}
function explodeAt(g,x,y,ex){
  g.fx.push({type:'boom',x,y,r:ex.r,life:.4,max:.4,color:ex.color||'#b47cff'});
  g.shake=Math.max(g.shake,6);
  for(const e of g.enemies){if(e.dead)continue;if(dist({x,y},e)<ex.r+e.r)damageEnemy(e,ex.dmg,g,g.player)}
}
function updateParticles(dt,g){
  for(let i=g.particles.length-1;i>=0;i--){
    const pt=g.particles[i];
    pt.x+=pt.vx*dt;pt.y+=pt.vy*dt;pt.vx*=0.94;pt.vy*=0.94;pt.life-=dt;
    if(pt.life<=0)g.particles.splice(i,1);
  }
}
function updateTexts(dt,g){
  for(let i=g.texts.length-1;i>=0;i--){
    const t=g.texts[i];t.y+=t.vy*dt;t.vy*=0.94;t.life-=dt;
    if(t.spawn>0)t.spawn-=dt;
    if(t.life<=0)g.texts.splice(i,1);
  }
}
function updateFx(dt,g){
  for(let i=g.fx.length-1;i>=0;i--){g.fx[i].life-=dt;if(g.fx[i].life<=0)g.fx.splice(i,1)}
}
function updateDelayed(dt,g){
  for(let i=g.delayed.length-1;i>=0;i--){
    const a=g.delayed[i];a.t-=dt;
    if(a.t<=0){a.fn();g.delayed.splice(i,1)}
  }
}
function updateLoot(dt,g){
  const p=g.player;
  g.fullMsgTimer=Math.max(0,g.fullMsgTimer-dt);
  for(let i=g.loot.length-1;i>=0;i--){
    const it=g.loot[i];it.bob+=dt*3;
    const d=dist(p,it);
    if(d<110){const a=Math.atan2(p.y-it.y,p.x-it.x);const pull=(110-d)/110*420;
      it.x+=Math.cos(a)*pull*dt;it.y+=Math.sin(a)*pull*dt}
    if(d<30){
      if(p.inventory.length>=INV_SIZE){
        if(g.fullMsgTimer<=0){g.fullMsgTimer=3;addToast('Inventory Full','#ef4444','Press C to open sheet')}
        continue;
      }
      p.inventory.push(it);g.loot.splice(i,1);
      sfx.loot();
      addToast(it.name,it.color,'Press C to equip');
      if(inv.open)refreshInventory();
    }
  }
}
function updateRains(dt,g){
  for(let i=g.rains.length-1;i>=0;i--){
    const r=g.rains[i];r.life-=dt;r.tick-=dt;
    if(r.tick<=0){
      r.tick=0.2;
      for(const e of g.enemies){if(e.dead)continue;if(dist(r,e)<r.r+e.r)damageEnemy(e,r.dmg,g,g.player)}
    }
    if(r.life<=0)g.rains.splice(i,1);
  }
}
function updateWaves(dt,g){
  if(g.spawnQueue.length>0){
    g.spawnTimer-=dt;
    if(g.spawnTimer<=0){g.spawnTimer=0.22;const type=g.spawnQueue.shift();spawnEnemy(type,g)}
  } else {
    const alive=g.enemies.some(e=>!e.dead);
    if(!alive){
      g.waveStallTimer=0;
      if(!g.betweenWaves){g.betweenWaves=true;g.waveTimer=2.6;rollLoot(g,g.player.x+rand(-50,50),g.player.y+rand(-50,50),g.wave,true);saveGame()}
      else {g.waveTimer-=dt;if(g.waveTimer<=0)startWave(g)}
    } else {
      const bossAlive=g.enemies.some(e=>!e.dead&&e.boss);
      if(bossAlive){g.waveStallTimer=0}
      else g.waveStallTimer=(g.waveStallTimer||0)+dt;
      if(g.waveStallTimer>40){
        for(const e of g.enemies)if(!e.dead&&!e.boss)damageEnemy(e,e.maxHp+1,g,g.player);
        g.waveStallTimer=0;
        addToast('WAVE CLEARED','#e8c07a','Stragglers fled');
      }
    }
  }
  if(g.enemies.length>0&&g.enemies.every(e=>e.dead))g.enemies=g.enemies.filter(e=>!e.dead);
}
function updatePortals(dt,g){
  for(let i=g.portals.length-1;i>=0;i--){g.portals[i].life-=dt;if(g.portals[i].life<=0)g.portals.splice(i,1)}
}
function updateDust(dt,g){
  const hw=W/2+120,hh=H/2+120;
  for(const d of g.dust){
    d.x+=d.vx*dt;d.y+=d.vy*dt;
    if(d.x<g.player.x-hw)d.x=g.player.x+hw;
    if(d.x>g.player.x+hw)d.x=g.player.x-hw;
    if(d.y<g.player.y-hh)d.y=g.player.y+hh;
    if(d.y>g.player.y+hh)d.y=g.player.y-hh;
  }
}
function updateCamera(dt,g){
  g.cam.x=lerp(g.cam.x,g.player.x,Math.min(1,dt*7));
  g.cam.y=lerp(g.cam.y,g.player.y,Math.min(1,dt*7));
  const hw=W/2,hh=H/2;
  if(WORLD.w>W)g.cam.x=clamp(g.cam.x,hw,WORLD.w-hw);else g.cam.x=WORLD.w/2;
  if(WORLD.h>H)g.cam.y=clamp(g.cam.y,hh,WORLD.h-hh);else g.cam.y=WORLD.h/2;
}
function updatePlayer(dt,g){
  const p=g.player;
  if(p.chargingUlt){p.chargeTime=Math.min(5,p.chargeTime+dt)}
  if(p.ultCooldown>0)p.ultCooldown-=dt;
  if(p._healingT>0){p._healingT-=dt;p.hp=Math.min(p.maxHp,p.hp+p._healingRate*dt)}
  if(p._regenPct&&p.hp>0)p.hp=Math.min(p.maxHp,p.hp+p.maxHp*p._regenPct*dt);
  { const mend=((p.attrs&&p.attrs.mend)||0)*0.8; if(mend>0&&p.hp>0)p.hp=Math.min(p.maxHp,p.hp+mend*dt); }
  if(p._undying&&p.hp>0&&p.hp/p.maxHp<0.25)p.hp=Math.min(p.maxHp,p.hp+p.maxHp*0.02*dt);
  if(p._frenzyT>0)p._frenzyT-=dt;
  if(p._markT>0)p._markT-=dt;
  if(p._stealthT>0)p._stealthT-=dt;
  if(p._shieldT>0){p._shieldT-=dt;if(p._shieldT<=0)p._shieldAmt=0}
  if(p._reflectT>0)p._reflectT-=dt;
  if(p.slowT>0)p.slowT-=dt;
  if(p._whirlT>0){
    p._whirlT-=dt;
    p._whirlTick-=dt;
    if(p._whirlTick<=0){
      p._whirlTick=0.35;
      for(const e of g.enemies){
        if(e.dead)continue;
        if(dist(p,e)<p._whirlR+e.r)damageEnemy(e,p.dmg*p._whirlMult,g,p);
      }
      g.fx.push({type:'ring',x:p.x,y:p.y,r:p._whirlR,life:.35,max:.35,color:p._whirlColor});
    }
  }
  p.energy=Math.min(p.maxEnergy,p.energy+p.energyRegen*dt);
  if(p._dash&&p._dash.t>0){
    const d=p._dash;d.t-=dt;
    p.x=clamp(p.x+d.vx*dt,25,WORLD.w-25);p.y=clamp(p.y+d.vy*dt,25,WORLD.h-25);
    d.acc+=dt;if(d.acc>=0.025){d.acc=0;g.fx.push({type:'shadow',x:p.x,y:p.y,r:p.r,life:.45,max:.45})}
  }
  p.invuln=Math.max(0,p.invuln-dt);
  p.atkTimer=Math.max(0,p.atkTimer-dt);
  p.swing=Math.max(0,p.swing-dt);
  for(const s of p.skills)s.cd=Math.max(0,s.cd-dt);
  let autoTarget=null;
  if(p.autoAttack){
    let bd=Infinity;
    for(const e of g.enemies){
      if(e.dead)continue;
      const d=dist(p,e);
      const reach=(CLASSES[p.cls].basic==='melee')?p.range+e.r:p.range;
      if(d<reach+5&&d<bd){bd=d;autoTarget=e}
    }
  }
  p._autoTarget=autoTarget;
  if(autoTarget)p.facing=Math.atan2(autoTarget.y-p.y,autoTarget.x-p.x);
  else{const w=screenToWorld(mouse.x,mouse.y);p.facing=Math.atan2(w.y-p.y,w.x-p.x)}
  if(p.dashT>0){
    p.dashT-=dt;
    p.x=clamp(p.x+Math.cos(p.dashAng)*p.dashSpeed*dt,30,WORLD.w-30);
    p.y=clamp(p.y+Math.sin(p.dashAng)*p.dashSpeed*dt,30,WORLD.h-30);
    if(p.dashDamage>0){
      for(const e of g.enemies){
        if(e.dead||p.dashHits.has(e))continue;
        if(dist(p,e)<p.r+e.r+22){
          p.dashHits.add(e);damageEnemy(e,p.dashDamage,g,p);
          const a=Math.atan2(e.y-p.y,e.x-p.x);
          e.x+=Math.cos(a)*45;e.y+=Math.sin(a)*45;
        }
      }
    }
    return;
  }
  const moveMult=(p.chargingUlt?0.35:1)*(p.slowT>0?0.6:1)*(p._stealthT>0?1.8:1);
  if((p._potionCd||0)>0)p._potionCd-=dt;
  let mvx=0,mvy=0;
  if(p._tmove){mvx+=p._tmove.x;mvy+=p._tmove.y}
  if(keys['w']||keys['arrowup'])mvy-=1;
  if(keys['s']||keys['arrowdown'])mvy+=1;
  if(keys['a']||keys['arrowleft'])mvx-=1;
  if(keys['d']||keys['arrowright'])mvx+=1;
  mvx+=PAD.x; mvy+=PAD.y;
  if(mvx||mvy){
    const len=Math.hypot(mvx,mvy);mvx/=len;mvy/=len;
    p.x=clamp(p.x+mvx*p.speed*moveMult*dt,30,WORLD.w-30);
    p.y=clamp(p.y+mvy*p.speed*moveMult*dt,30,WORLD.h-30);
    p.moveTarget=null;
  } else if(p.moveTarget){
    const d=Math.hypot(p.moveTarget.x-p.x,p.moveTarget.y-p.y);
    if(d<8)p.moveTarget=null;
    else{
      const a=Math.atan2(p.moveTarget.y-p.y,p.moveTarget.x-p.x);
      const step=Math.min(p.speed*moveMult*dt,d);
      p.x=clamp(p.x+Math.cos(a)*step,30,WORLD.w-30);
      p.y=clamp(p.y+Math.sin(a)*step,30,WORLD.h-30);
    }
  }
  for(const pt of (G.pets||[])){
    const off=pt.kind==='panda'?48:pt.kind==='cat'?66:84;
    const side=pt.kind==='panda'?0:pt.kind==='cat'?12:-14;
    const tx=p.x-Math.cos(p.facing||0)*off-Math.sin(p.facing||0)*side, ty=p.y-Math.sin(p.facing||0)*off+Math.cos(p.facing||0)*side;
    const ddx=tx-pt.x, ddy=ty-pt.y, dd=Math.hypot(ddx,ddy);
    if(dd>1){
      const st=Math.min(dd,p.speed*1.05*dt);
      pt.x+=ddx/dd*st;pt.y+=ddy/dd*st;pt.t+=st*0.06;
    }
  }
  if(autoTarget&&p.atkTimer<=0){
    doBasicAttack(p,g,autoTarget);
    let spd=p.atkSpeed;
    if(p._frenzyT>0)spd*=1.6;
    p.atkTimer=1/spd;p.swing=0.18;
  }
}
function doBasicAttack(p,g,target){
  const kind=CLASSES[p.cls].basic;
  const a=target?Math.atan2(target.y-p.y,target.x-p.x):p.facing;
  try{ cosmeticWeaponSpark(p, a); }catch(e){}
  if(kind==='melee'){
    for(const e of g.enemies){
      if(e.dead)continue;
      if(dist(p,e)<p.range+e.r){
        const ea=Math.atan2(e.y-p.y,e.x-p.x);
        if(Math.abs(angDiff(ea,a))<1.05){
          damageEnemy(e,p.dmg,g,p,{fromBasic:true});
          if(p._frostfire&&!e.dead)e.slowT=Math.max(e.slowT,1.5);
        }
      }
    }
    g.fx.push({type:'slash',x:p.x,y:p.y,r:p.range+6,ang:a,arc:1.9,life:.14,max:.14,color:p.accent});
  } else {
    const n=1+((p.upg&&p.upg.shots)||0);
    for(let k2=0;k2<n;k2++){
      const aa=a+(k2-(n-1)/2)*0.13;
      spawnProj(g,{x:p.x+Math.cos(aa)*20,y:p.y+Math.sin(aa)*20,
        vx:Math.cos(aa)*560,vy:Math.sin(aa)*560,r:8,dmg:p.dmg,life:1.2,color:p.accent,from:'player',isBasic:true});
    }
  }
}
function updateHUD(g){
  updateComboHUD(g);
  finaleTick(g);
  const p=g.player;
  document.getElementById('hpFill').style.height=clamp(p.hp/p.maxHp,0,1)*100+'%';
  document.getElementById('enFill').style.height=clamp(p.energy/p.maxEnergy,0,1)*100+'%';
  document.getElementById('hpText').textContent=Math.ceil(p.hp);
  document.getElementById('enText').textContent=Math.floor(p.energy);
  document.getElementById('xpFill').style.width=clamp(p.xp/p.xpNext,0,1)*100+'%';
  document.getElementById('lvl').textContent='Lv '+p.level;
  document.getElementById('waveTxt').textContent=tr('Wave')+' '+g.wave+(g.endless?' ∞':'');
  document.getElementById('killTxt').textContent=g.kills+' '+tr('kills');
  const chipEl=document.getElementById('titleChip');
  if(chipEl){
    const tp=titleProgress(p,g);
    if(tp){
      const s=tp.unlocked?tp.T.icon+' '+tp.T.name:tp.T.icon+' '+tp.cur+'/'+tp.target;
      if(chipEl.dataset.s!==s){
        chipEl.dataset.s=s;
        chipEl.textContent=s;
        chipEl.title=tp.unlocked?tp.T.cond+' — UNLOCKED · '+fxLabel(tp.T.fx):tp.T.name+' — '+tp.T.cond+' · '+fxLabel(tp.T.fx);
        chipEl.classList.toggle('on',tp.unlocked);
        chipEl.classList.remove('hidden');
      }
    }
  }
  const goldEl=document.getElementById('goldTxt');
  if(goldEl)goldEl.textContent=Math.floor(p.gold||0);
  const potBtn=document.getElementById('potionBtn');
  if(potBtn){
    potBtn.classList.toggle('hidden',!(p.potions>0));
    const pc=potBtn.querySelector('.pb-count');if(pc)pc.textContent='×'+(p.potions||0);
  }
  const badge=document.getElementById('treePtsBadge');
  if(badge){
    if(p.treePoints>0){badge.style.display='inline';badge.textContent='+'+p.treePoints+' 🌳'}
    else badge.style.display='none';
  }
  for(const s of p.skills){
    if(!s.el)continue;
    const pct=s.baseCd>0?(s.cd/s.baseCd)*100:0;
    s.cdEl.style.height=pct+'%';
    s.el.classList.toggle('ready',s.cd<=0&&p.energy>=s.cost);
    s.el.classList.toggle('poor',p.energy<s.cost);
  }
  if(p.ultimateEl){
    p.ultimateEl.classList.toggle('locked',!p.hasUltimate);
    if(p.hasUltimate){
      const cdPct=p.ultCooldown>0?(p.ultCooldown/15)*100:0;
      p.ultimateCdEl.style.height=cdPct+'%';
      const chargePct=p.chargingUlt?(p.chargeTime/5)*100:0;
      p.ultimateChargeEl.style.height=chargePct+'%';
      p.ultimateEl.classList.toggle('ready',p.ultCooldown<=0);
    }
  }
  const aliveN=g.enemies.filter(e=>!e.dead).length;
  const left=aliveN+g.spawnQueue.length;
  const ec=document.getElementById('enemyCount');
  if(ec)ec.textContent=left+' left'+(g.spawnQueue.length?` (+${g.spawnQueue.length})`:'');
}

/* Inventory */
const inv={open:false,el:document.getElementById('inventoryScreen'),
  grid:document.getElementById('invGrid'),equipCol:document.getElementById('equipCol'),
  stats:document.getElementById('invStats'),tooltip:document.getElementById('itemTooltip')};
function buildEquipUI(){
  inv.equipCol.innerHTML='';
  for(const slot of SLOT_ORDER){
    const d=document.createElement('div');
    d.className='equip-slot';d.dataset.slot=slot;
    d.innerHTML=`<div class="slot-icon"></div><div class="slot-label"></div>`;
    d.addEventListener('click',()=>onEquipSlotClick(slot));
    d.addEventListener('mouseenter',e=>{const it=G&&G.player.equipment[slot];if(it)showTooltip(itemTooltipHTML(it,null),e)});
    d.addEventListener('mousemove',positionTooltip);
    d.addEventListener('mouseleave',hideTooltip);
    inv.equipCol.appendChild(d);
  }
}
function refreshInventory(){
  if(!G||!G.player)return;
  const p=G.player;hideTooltip();
  for(const d of inv.equipCol.children){
    const slot=d.dataset.slot,it=p.equipment[slot];
    const iconEl=d.querySelector('.slot-icon'),labelEl=d.querySelector('.slot-label');
    iconEl.textContent=SLOT_ICONS[slot];
    if(it){d.classList.add('filled');d.style.borderColor=it.color;d.style.boxShadow=`inset 0 0 16px ${it.color}55`;labelEl.textContent=it.name;labelEl.style.color=it.color}
    else{d.classList.remove('filled');d.style.borderColor='#3a302a';d.style.boxShadow='none';labelEl.textContent=SLOT_NAMES[slot];labelEl.style.color='#6b5d4e'}
  }
  inv.grid.innerHTML='';
  for(let i=0;i<INV_SIZE;i++){
    const it=p.inventory[i];
    const d=document.createElement('div');
    d.className='inv-cell'+(it?' filled':'');
    if(it){
      d.style.borderColor=it.color;d.style.boxShadow=`inset 0 0 14px ${it.color}44`;
      d.innerHTML=`<span class="cell-icon" style="color:${it.color}">${SLOT_ICONS[it.slot]}</span><span class="cell-power">⚔${itemPower(it)}</span>`;
      d.addEventListener('click',()=>equipFromInventory(i));
      d.addEventListener('contextmenu',ev=>{ev.preventDefault();sellFromInventory(i)});
      d.addEventListener('mouseenter',ev=>showTooltip(itemTooltipHTML(it,p.equipment[it.slot]),ev));
      d.addEventListener('mousemove',positionTooltip);
      d.addEventListener('mouseleave',hideTooltip);
    }
    inv.grid.appendChild(d);
  }
  const boxes=[['Damage',Math.round(p.dmg)],['Max HP',Math.round(p.maxHp)],['Armor',Math.round(p.armor)],
    ['Crit Chance',(p.crit*100).toFixed(1)+'%'],['Move Speed',Math.round(p.speed)],['Energy Regen',p.energyRegen.toFixed(1)]];
  inv.stats.innerHTML=boxes.map(([k,v])=>`<div class="stat-box"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
}
/* ── SHOP ── */
let invTab='char';
function setInvTab(tab){
  invTab=tab;hideTooltip();
  document.querySelectorAll('.inv-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  const cv=document.getElementById('charView'),sv=document.getElementById('shopView');
  if(cv)cv.classList.toggle('hidden',tab!=='char');
  if(sv)sv.classList.toggle('hidden',tab!=='shop');
  if(tab==='shop')refreshShop();
  else refreshInventory();
}
function shopRerollCost(g){return Math.round(30+Math.max(1,(g&&g.wave)||1)*10);}
function refreshShopStock(g){
  if(!g)return;
  const wave=Math.max(1,g.wave||1);
  const lvl=Math.max(1,Math.floor(g.player.level||1));
  g.shopStock=[];
  const boost=Math.min(0.18,wave*0.018);
  if((g.player.potions||0)<5)g.shopStock.push({kind:'potion',name:'Healing Potion',icon:'🧪',color:'#7aff9a',value:60,rarity:3,slot:'potion'});
  for(let i=0;i<12;i++){
    const r=rng();
    let idx=0;
    if(r>0.96-boost)idx=3;
    else if(r>0.82-boost)idx=2;
    else if(r>0.52-boost*0.6)idx=1;
    const it=makeItem(wave,idx);
    it.reqLevel=lvl; // gear requirement tracks PLAYER level (was wave*0.7 — shop was always out of reach)
    g.shopStock.push(it);
  }
  g.shopWave=wave;
  if(inv&&inv.open&&invTab==='shop')refreshShop();
}
function refreshShop(){
  if(!G||!G.player)return;
  const p=G.player,g=G;
  const goldEl=document.getElementById('shopGold');
  if(goldEl)goldEl.textContent=Math.floor(p.gold||0);
  const cost=shopRerollCost(g);
  const rl=document.getElementById('shopReroll');
  const rc=document.getElementById('shopRerollCost');
  if(rc)rc.textContent=cost;
  if(rl)rl.disabled=(p.gold||0)<cost;
  const grid=document.getElementById('shopGrid');
  if(!grid)return;
  if(!g.shopStock||!g.shopStock.length)refreshShopStock(g);
  grid.innerHTML='';
  g.shopStock.forEach((it,i)=>{
    const stats=[];
    if(it.kind==='potion'){
      const pcard=document.createElement('div');
      pcard.className='shop-card';
      pcard.style.borderColor=it.color+'55';
      pcard.innerHTML=`<div class="sc-head"><span class="sc-icon" style="color:${it.color}">🧪</span>
        <div><div class="sc-name" style="color:${it.color}">${tr('Healing Potion')}</div>
        <div class="sc-sub">+40% HP · 4s cooldown</div></div></div>
      <div class="sc-stats">Carried: ${G.player.potions||0}/5</div>
      <button class="sc-buy"${(G.player.gold||0)>=60?'':' disabled'}>${(G.player.gold||0)>=60?'BUY — 60g':'NEED 60g'}</button>`;
      pcard.querySelector('.sc-buy').addEventListener('click',()=>buyPotion());
      grid.appendChild(pcard);
      return;
    }
    if(it.baseDmg)stats.push(it.baseDmg+' Weapon Damage');
    if(it.baseArmor)stats.push(it.baseArmor+' Armor');
    for(const a of it.affixes)stats.push(AFFIX_DEFS[a.k].fmt(a.v)+' '+AFFIX_DEFS[a.k].label);
    const afford=(p.gold||0)>=it.value;
    const locked=it.reqLevel&&p.level<it.reqLevel;
    const card=document.createElement('div');
    card.className='shop-card';
    card.style.borderColor=it.color+'55';
    card.innerHTML=`<div class="sc-head"><span class="sc-icon" style="color:${it.color}">${SLOT_ICONS[it.slot]}</span>
      <div><div class="sc-name" style="color:${it.color}">${it.name}</div>
      <div class="sc-sub">${SLOT_NAMES[it.slot]} · ${RARITIES[it.rarity].name}${it.reqLevel?' · Lv '+it.reqLevel:''}</div></div></div>
      <div class="sc-stats"><b style="color:#f0c14b">⚔ Power ${itemPower(it)}</b><br>${stats.join('<br>')}</div>
      <button class="sc-buy"${afford&&!locked?'':' disabled'}>${locked?'🔒 REQUIRES LV '+it.reqLevel:afford?'BUY — '+it.value+'g':'NEED '+it.value+'g'}</button>`;
    card.querySelector('.sc-buy').addEventListener('click',()=>buyShopItem(i));
    grid.appendChild(card);
  });
}
function buyShopItem(i){
  if(!G||!G.player)return;
  const p=G.player,it=G.shopStock&&G.shopStock[i];
  if(!it)return;
  sfx.click();
  if((p.gold||0)<it.value){addToast('Not enough gold','#ef4444','');return;}
  if(p.inventory.length>=INV_SIZE){addToast('Inventory Full','#ef4444','Equip or sell something first');return;}
  p.gold-=it.value;
  p.inventory.push(it);
  G.shopStock.splice(i,1);
  sfx.loot();
  addToast(tr('Purchased'),it.color,it.name);
  refreshShop();
  updateHUD(G);
}
document.querySelectorAll('.inv-tab').forEach(t=>t.addEventListener('click',()=>setInvTab(t.dataset.tab)));
document.getElementById('shopReroll').addEventListener('click',()=>{
  if(!G||!G.player)return;
  const cost=shopRerollCost(G);
  if((G.player.gold||0)<cost){addToast('Not enough gold','#ef4444','');return;}
  G.player.gold-=cost;
  sfx.ui();
  refreshShopStock(G);
  refreshShop();
  updateHUD(G);
});

function equipFromInventory(i){const p=G.player,it=p.inventory[i];if(!it)return;
  if(it.reqLevel&&p.level<it.reqLevel){sfx.ui();addToast('Level too low','#ff9f43','Requires Level '+it.reqLevel+' (you: Lv '+p.level+')');return}
  const prev=p.equipment[it.slot]||null;p.equipment[it.slot]=it;p.inventory.splice(i,1);if(prev)p.inventory.push(prev);
  recalcStats(p);refreshInventory();addToast('Equipped',it.color,it.name)}
function onEquipSlotClick(slot){const p=G.player,it=p.equipment[slot];if(!it)return;
  if(p.inventory.length>=INV_SIZE){addToast('Inventory Full','#ef4444','Cannot unequip');return}
  p.equipment[slot]=null;p.inventory.push(it);recalcStats(p);refreshInventory()}
function sellFromInventory(i){const p=G.player,it=p.inventory[i];if(!it)return;
  const price=sellValue(it);
  p.gold=(p.gold||0)+price;
  p.inventory.splice(i,1);
  addToast('Sold',it.color,it.name+' → +'+price+'g');
  refreshInventory();
  if(G)updateHUD(G)}
function itemTooltipHTML(item,compareWith){
  const st=itemStats(item);
  const cst=compareWith?itemStats(compareWith):null;
  const better=(k)=>cst?(st[k]>cst[k]?'#7aff9a':st[k]<cst[k]?'#ff6b6b':null):null;
  const arrow=(k)=>cst?(st[k]>cst[k]?' ▲':st[k]<cst[k]?' ▼':''):'';
  let h=`<div class="tt-name" style="color:${item.color}">${item.name}</div>`;
  h+=`<div class="tt-sub">${SLOT_NAMES[item.slot]} · ${RARITIES[item.rarity].name}</div>`;
  const bc=better('dmg'),ba=better('armor');
  if(item.baseDmg)h+=`<div class="tt-base"${bc?` style="color:${bc}"`:''}>${item.baseDmg} Weapon Damage${bc?arrow('dmg'):''}</div>`;
  if(item.baseArmor)h+=`<div class="tt-base"${ba?` style="color:${ba}"`:''}>${item.baseArmor} Armor${ba?arrow('armor'):''}</div>`;
  for(const a of item.affixes){
    const def=AFFIX_DEFS[a.k];
    const c=better(a.k);
    h+=`<div class="tt-affix"${c?` style="color:${c}"`:''}>${def.fmt(a.v)} ${def.label}${c?arrow(a.k):''}</div>`;
  }
  h+=`<div class="tt-power">⚔ Power: ${itemPower(item)}</div>`;
  if(cst){
    const dp=itemPower(item)-itemPower(compareWith);
    const col=dp>=0?'#7aff9a':'#ff6b6b';
    h+=`<div class="tt-cmp" style="color:${col}">vs Equipped: ${dp>=0?'+':''}${dp}</div>`;
  }
  if(item.reqLevel&&G&&G.player){
    const lvl=G.player.level;
    const met=lvl>=item.reqLevel;
    h+=`<div class="tt-req" style="color:${met?'#8c7a63':'#ff9f43'}">Requires Level ${item.reqLevel}${met?'':' (you: Lv '+lvl+')'}</div>`;
  }
  h+=`<div class="tt-sub" style="margin-top:8px;margin-bottom:0;border-bottom:none;padding-bottom:0">Sell value: ${sellValue(item)}g</div>`;
  return h;
}
function showTooltip(html,e){inv.tooltip.innerHTML=html;inv.tooltip.classList.remove('hidden');if(e)positionTooltip(e)}
function positionTooltip(e){
  if(!e||inv.tooltip.classList.contains('hidden'))return;
  const pad=16,r=inv.tooltip.getBoundingClientRect();
  let x=e.clientX+20,y=e.clientY+20;
  if(x+r.width>window.innerWidth-pad)x=e.clientX-r.width-20;
  if(y+r.height>window.innerHeight-pad)y=window.innerHeight-r.height-pad;
  if(x<pad)x=pad;if(y<pad)y=pad;
  inv.tooltip.style.left=x+'px';inv.tooltip.style.top=y+'px';
}
function hideTooltip(){inv.tooltip.classList.add('hidden')}
document.addEventListener('mousemove',e=>{
  if(!inv.tooltip.classList.contains('hidden'))positionTooltip(e);
  if(!skillTipEl.classList.contains('hidden'))positionSkillTooltip(e);
  if(!tree.tooltip.classList.contains('hidden'))positionTreeTooltip(e);
});
function syncPause(){if(G)G.paused=G.pauseMenu||inv.open||tree.open||upgState.open}
function closeInventory(){
  inv.open=false;inv.el.classList.add('hidden');hideTooltip();syncPause();
}
function toggleInventory(tab:any=null){
  if(!G||!G.running)return;
  if(inv.open&&(!tab||invTab===tab)){closeInventory();return;}
  inv.open=true;inv.el.classList.remove('hidden');
  setInvTab(tab||invTab);
  hideSkillTooltip();syncPause();
}
document.getElementById('invClose').addEventListener('click',closeInventory);
document.getElementById('treeClose').addEventListener('click',toggleTree);
document.getElementById('treePtsBadge').addEventListener('click',toggleTree);
document.getElementById('autoBadge').addEventListener('click',()=>{
  if(!G||!G.player)return;
  G.player.autoAttack=!G.player.autoAttack;
  addToast(G.player.autoAttack?'◉ AUTO-ATTACK ON':'○ AUTO-ATTACK OFF',G.player.autoAttack?'#ffd54f':'#8c7a63','Click the badge or right-click to toggle');
  updateAutoBadge();
});
document.getElementById('autoplayBadge').addEventListener('click',()=>{ if(!G||!G.running)return; toggleAutoPlay(); });

/* Pause */
function togglePause(){
  if(!G||!G.running)return;
  G.pauseMenu=!G.pauseMenu;
  document.getElementById('pauseScreen').classList.toggle('hidden',!G.pauseMenu);
  hideSkillTooltip();hideTreeTooltip();
  if(G.pauseMenu)refreshPauseSaveInfo();
  syncPause();
}
function refreshPauseSaveInfo(){
  const el=document.getElementById('pauseSaveInfo');
  if(!el||!G||!G.player)return;
  const data=loadSaveData();
  if(data&&data.cls===G.player.cls)el.innerHTML=`Existing save: <b>Level ${data.level} ${CLASSES[data.cls].name}</b> · Wave ${data.wave}`;
  else if(data)el.innerHTML=`A save exists for <b>${CLASSES[data.cls].name}</b> · will overwrite`;
  else el.innerHTML=`No save yet`;
}
document.getElementById('resumeBtn').addEventListener('click',()=>{
  if(!G||!G.running)return;
  sfx.click();
  G.pauseMenu=false;document.getElementById('pauseScreen').classList.add('hidden');syncPause();
});
document.getElementById('saveBtn').addEventListener('click',()=>{
  if(!G||!G.running)return;
  sfx.click();
  if(saveGame()){addToast(tr('GAME SAVED'),'#7aff9a',`Level ${G.player.level} · Wave ${G.wave}`);document.getElementById('pauseSaveInfo').innerHTML=`✓ Saved just now`;refreshContinuePanel()}
});
document.getElementById('backBtn').addEventListener('click',()=>{
  if(!G||!G.running)return;
  sfx.click();
  saveGame();G.running=false;G.pauseMenu=false;
  document.getElementById('pauseScreen').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('autoBadge').style.display='none';
  inv.open=false;inv.el.classList.add('hidden');hideTooltip();hideSkillTooltip();
  tree.open=false;tree.el.classList.add('hidden');hideTreeTooltip();
  refreshContinuePanel();G=null;
  updateAutoPlayBadge();
});
document.getElementById('continueBtn').addEventListener('click',()=>{
  const data=loadSaveData();if(data)resumeFromSave(data);
});
let deleteConfirm=false,deleteTimer=null;
document.getElementById('deleteBtn').addEventListener('click',()=>{
  const btn=document.getElementById('deleteBtn');
  if(!deleteConfirm){deleteConfirm=true;btn.textContent='CONFIRM?';btn.classList.add('confirm');
    clearTimeout(deleteTimer);deleteTimer=setTimeout(()=>{deleteConfirm=false;btn.textContent='🗑';btn.classList.remove('confirm')},3000);return}
  clearTimeout(deleteTimer);deleteSave();deleteConfirm=false;btn.textContent='🗑';btn.classList.remove('confirm');refreshContinuePanel();
});
function backToMenu(){
  const cs=(G&&G.player)?G.player.cls:null;
  ['deathScreen','victoryScreen','pauseScreen','tutorial'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.add('hidden')});
  document.getElementById('menu').classList.remove('hidden');
  inv.open=false;inv.el.classList.add('hidden');hideTooltip();hideSkillTooltip();
  tree.open=false;tree.el.classList.add('hidden');hideTreeTooltip();
  document.getElementById('autoBadge').style.display='none';
  refreshContinuePanel();G=null;
  updateAutoPlayBadge();
  return cs;
}
document.getElementById('againBtn').addEventListener('click',()=>{
  sfx.click();
  const cs=backToMenu();
  if(cs&&CLASSES[cs])startGame(cs);
});
document.getElementById('menuBtn2').addEventListener('click',()=>{
  sfx.click();
  backToMenu();
});

/* Titles panel (main menu) */
function renderTitlesPanel(){
  const list=document.getElementById('titlesList');
  if(!list)return;
  const keys=Object.keys(TITLES);
  const unlocked=keys.filter(k=>TITLES_UNLOCKED[k]).length;
  const cnt=document.getElementById('titlesCount');
  if(cnt)cnt.textContent=unlocked+'/'+keys.length;
  list.innerHTML=keys.map(k=>{
    const T=TITLES[k];
    const on=!!TITLES_UNLOCKED[k];
    const C=CLASSES[k];
    const sub=C?(C.icon+' '+C.name):'';
    return '<div class="tRow '+(on?'on':'locked')+'">'
      +'<div class="tIcon">'+(on?T.icon:'🔒')+'</div>'
      +'<div class="tBody">'
      +'<div class="tName">'+T.name+' <span style="opacity:.5;font-size:10px">'+sub+'</span></div>'
      +'<div class="tCond">'+(on?'✓ ':'')+T.cond+'</div>'
      +'<div class="tFx">'+fxLabel(T.fx)+'</div>'
      +'</div>'
      +'<div class="tState">'+(on?'UNLOCKED':'LOCKED')+'</div>'
      +'</div>';
  }).join('');
}
{
  const tb=document.getElementById('titlesBtn');
  if(tb)tb.addEventListener('click',()=>{sfx.ui();renderTitlesPanel();document.getElementById('titlesOverlay').classList.remove('hidden')});
  const tc=document.getElementById('titlesClose');
  if(tc)tc.addEventListener('click',()=>{sfx.ui();document.getElementById('titlesOverlay').classList.add('hidden')});
}
renderTitlesPanel();

/* Menu */
let currentArch='Warrior';

/* Class portraits: the in-game hero sprite for each class, rendered once into a
   cached canvas and used as the card art (the grid was emoji + text only). */
const _thumbCache = new Map<string, HTMLCanvasElement>();
function heroThumb(key:string, w=48, h=58, accent='#8a7a63'):HTMLCanvasElement {
  const ck = key+':'+w+'x'+h+':'+accent;
  const hit = _thumbCache.get(ck); if(hit) return hit;
  const out = document.createElement('canvas');
  out.width = w*2; out.height = h*2;                 // 2x, downscaled by CSS
  const o = out.getContext('2d');
  if(!o){ _thumbCache.set(ck,out); return out }
  const S = 176;
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = S;
  const g = tmp.getContext('2d');
  if(!g){ _thumbCache.set(ck,out); return out }
  g.imageSmoothingEnabled = false;
  try { hpix.hero(g, key, S/2, S/2, { face:0, t:0.4, moving:false, noWeapon:false }); } catch(e) {}
  let x0=S, y0=S, x1=-1, y1=-1;
  try {
    const d = g.getImageData(0,0,S,S).data;
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){
      if(d[(y*S+x)*4+3] > 8){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    }
  } catch(e) {}
  if(x1 < x0 || y1 < y0){ x0=0; y0=0; x1=S-1; y1=S-1; }
  // soft class-coloured pool behind the hero
  const cx = out.width/2, cy = out.height*0.66, pr = out.width*0.52;
  const bg = o.createRadialGradient(cx,cy,0,cx,cy,pr);
  bg.addColorStop(0, accent+'55'); bg.addColorStop(1, accent+'00');
  o.fillStyle = bg; o.beginPath(); o.arc(cx,cy,pr,0,Math.PI*2); o.fill();
  const bw = x1-x0+1, bh = y1-y0+1, pad = 6;
  /* shared baseline + height-normalised scale so every class reads at one size */
  const targetH = out.height - pad*2;
  let k = targetH / bh;
  if(bw*k > out.width - pad*2) k = (out.width - pad*2) / bw;
  const dx = (out.width - bw*k)/2, dy = out.height - pad - bh*k;
  /* pedestal shadow under the feet */
  o.fillStyle = 'rgba(0,0,0,0.42)';
  o.beginPath(); o.ellipse(out.width/2, out.height-pad*0.4, out.width*0.26, out.height*0.05, 0, 0, Math.PI*2); o.fill();
  o.imageSmoothingEnabled = false;
  o.drawImage(tmp, x0,y0,bw,bh, dx, dy, bw*k, bh*k);
  _thumbCache.set(ck,out);
  return out;
}

function renderClassGrid(arch){
  try {
    const grid = document.getElementById('classesGrid');
    if (!grid) { console.error('❌ classesGrid element not found'); return; }
    const entries = Object.keys(CLASSES)
      .map(k => [k, CLASSES[k]])
      .filter((pair) => pair[1] && (!arch || arch === 'All' || pair[1].roleTag === arch));
    grid.innerHTML = '';
    for (const [key,C] of entries) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.borderColor = (C.color || '#5a5a8a') + '66';
      try {
        card.style.background = `linear-gradient(180deg, ${shadeColor(C.color || '#5a5a8a',-0.72)}, #0d0907)`;
      } catch(e) {
        card.style.background = 'linear-gradient(180deg, #1c1612, #0d0907)';
      }
      const skillsHtml = (C.skills || []).map((s, idx) =>
        `<span style="display:inline-block;margin:2px 2px 0 0;padding:2px 5px;border-radius:4px;background:rgba(0,0,0,0.45);border:1px solid ${(s.color||C.accent||'#ffd54f')}44;font-size:9px;color:#e8dcc4">${s.icon||''} ${s.name}</span>`
      ).join('');
      card.innerHTML = `<div class="ico"></div>
        <h3 style="color:${C.accent || '#fff'}">${C.name || key}</h3>
        <div class="role">${C.roleTag || '?'}</div>
        <div class="cls-attrs"><span class="st"><i>HP</i>${Math.round(C.hp)}</span><span class="st"><i>DMG</i>${C.dmg}</span><span class="st"><i>SPD</i>${C.speed}</span><span class="st"><i>CRIT</i>${Math.round(C.crit*100)}%</span></div>
        <div style="margin-top:5px;line-height:1.3">${skillsHtml}</div>
        ${(TITLES[key]&&TITLES_UNLOCKED[key])?`<div class="cls-title on">${TITLES[key].icon} ${TITLES[key].name} · ${fxLabel(TITLES[key].fx)}</div>`:(TITLES[key]?`<div class="cls-title">🔒 ${TITLES[key].icon} ${TITLES[key].name} — ${TITLES[key].cond}</div>`:'')}`;
      const icoEl = card.querySelector('.ico');
      if(icoEl) icoEl.appendChild(heroThumb(key, 48, 58, C.accent || C.color || '#8a7a63'));
      card.addEventListener('click', () => {
        try { sfx.ui(); (window as any).startGame(key); }
        catch (err) { console.error('❌ startGame failed:', err); }
      });
      grid.appendChild(card);
    }
  } catch (err) {
    console.error('❌ renderClassGrid failed:', err);
  }
}
document.querySelectorAll('.arch-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.arch-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    currentArch=tab.dataset.arch;
    renderClassGrid(currentArch);
  });
});

/* Render */
/* ===== GFX polish: soft shadows, light pools, additive glow, mist, bloom (brings gameplay up to the cutscene look) ===== */
const GFX={bloom:false,shadows:true,sparks:true,slow:0,last:0,bc:null,bx:null};
const gfxShadow=(()=>{const c=document.createElement('canvas');c.width=64;c.height=32;const x=c.getContext('2d');x.translate(32,16);x.scale(1,.5);const g=x.createRadialGradient(0,0,1,0,0,31);g.addColorStop(0,'rgba(0,0,0,.62)');g.addColorStop(.6,'rgba(0,0,0,.3)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.beginPath();x.arc(0,0,31,0,Math.PI*2);x.fill();return c})();
const _glowC=new Map(),_brC=new Map();
let _torchC={};
function torchSprite(color){
  if(_torchC[color])return _torchC[color];
  const c=document.createElement('canvas');c.width=c.height=256;
  const cx=c.getContext('2d');
  const g=cx.createRadialGradient(128,128,8,128,128,128);
  g.addColorStop(0,color+'40');g.addColorStop(0.35,color+'1f');g.addColorStop(1,color+'00');
  cx.fillStyle=g;cx.fillRect(0,0,256,256);
  _torchC[color]=c;return c;
}
function gfxGlow(col){let c=_glowC.get(col);if(c)return c;c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
  try{g.addColorStop(0,col);g.addColorStop(.35,col)}catch(e){g.addColorStop(0,'#ffffff');g.addColorStop(.35,'#ffffff')}g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g;x.globalAlpha=1;x.fillRect(0,0,64,64);const k=document.createElement('canvas');k.width=k.height=64;const y=k.getContext('2d'),g2=y.createRadialGradient(32,32,0,32,32,32);
  try{g2.addColorStop(0,col)}catch(e){g2.addColorStop(0,'#ffffff')}g2.addColorStop(.18,'rgba(0,0,0,0)');g2.addColorStop(1,'rgba(0,0,0,0)');
  /* soft falloff: draw gradient squared for a smoother halo */
  const out=document.createElement('canvas');out.width=out.height=64;const o=out.getContext('2d'),g3=o.createRadialGradient(32,32,0,32,32,32);
  for(let i=0;i<=8;i++){const t=i/8,a=Math.pow(1-t,2.2);try{g3.addColorStop(t,col)}catch(e){g3.addColorStop(t,'#ffffff')}}
  o.fillStyle=g3;o.fillRect(0,0,64,64);o.globalCompositeOperation='destination-in';const m=o.createRadialGradient(32,32,0,32,32,32);for(let i=0;i<=8;i++){const t=i/8;m.addColorStop(t,`rgba(0,0,0,${Math.pow(1-t,2.2)})`)}o.fillStyle=m;o.fillRect(0,0,64,64);
  _glowC.set(col,out);return out}
function gfxBright(col){let v=_brC.get(col);if(v!==undefined)return v;let r=0,g=0,b=0,ok=false,m;
  if(m=/^#([0-9a-f]{6})$/i.exec(col)){const n=parseInt(m[1],16);r=n>>16;g=n>>8&255;b=n&255;ok=true}
  else if(m=/^#([0-9a-f]{3})$/i.exec(col)){const h=m[1];r=parseInt(h[0]+h[0],16);g=parseInt(h[1]+h[1],16);b=parseInt(h[2]+h[2],16);ok=true}
  else if(m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(col)){r=+m[1];g=+m[2];b=+m[3];ok=true}
  v=ok&&(.3*r+.59*g+.11*b)>118;_brC.set(col,v);return v}
function gfxGround(biome){
  const p=G.player,t=G.time;ctx.save();ctx.globalAlpha=1;
  for(const e of G.enemies){if(e.dead)continue;const w=e.r*3.1,h=w*.5;ctx.drawImage(gfxShadow,e.x-w/2,e.y+e.r*.62-h/2,w,h)}
  for(const m of G.minions){const w=(m.r||13)*2.8,h=w*.5;ctx.drawImage(gfxShadow,m.x-w/2,m.y+(m.r||13)*.62-h/2+4,w,h)}
  ctx.drawImage(gfxShadow,p.x-26,p.y+10,52,26);ctx.restore();
  ctx.save();ctx.globalCompositeOperation='lighter';
  const pc=(CLASSES[p.cls]||{}).accent||'#ffd9a0',ps=64;ctx.globalAlpha=.16+.04*Math.sin(t*3);ctx.drawImage(gfxGlow(pc),p.x-ps,p.y-ps,ps*2,ps*2);
  for(const e of G.enemies)if(!e.dead&&e.boss){const s=e.r*5.5;ctx.globalAlpha=.34+.1*Math.sin(t*4+e.x);ctx.drawImage(gfxGlow(e.color),e.x-s,e.y-s,s*2,s*2)}
  const tc=biome.torchColor;ctx.globalAlpha=.04;for(let i=0;i<5;i++){const s=240+i*30;ctx.drawImage(gfxGlow(tc),G.cam.x+Math.sin(t*.05+i*1.7)*W*.5-s,G.cam.y+Math.cos(t*.04+i*2.3)*H*.5-s,s*2,s*2)}
  ctx.restore();
  if(!cutscene.active)for(const e of G.enemies)if(!e.dead&&e.boss)csCircle(e.x,e.y+e.r*.55-e.r*2.2*.35,e.r*2.2,t*.7,e.color,.45)}
function gfxProjectiles(){
  for(const pr of G.projectiles){const vx=pr.vx||0,vy=pr.vy||0,sp=Math.hypot(vx,vy),ux=sp?vx/sp:0,uy=sp?vy/sp:0,tl=Math.min(70,pr.r*5+sp*.035),gs=pr.r*4.5;
    ctx.save();ctx.globalCompositeOperation='lighter';
    if(sp>5){const g=ctx.createLinearGradient(pr.x,pr.y,pr.x-ux*tl,pr.y-uy*tl);g.addColorStop(0,pr.color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.strokeStyle=g;ctx.lineWidth=pr.r*1.4;ctx.lineCap='round';ctx.globalAlpha=.9;ctx.beginPath();ctx.moveTo(pr.x,pr.y);ctx.lineTo(pr.x-ux*tl,pr.y-uy*tl);ctx.stroke()}
    ctx.globalAlpha=.8;ctx.drawImage(gfxGlow(pr.color),pr.x-gs,pr.y-gs,gs*2,gs*2);ctx.restore();
    ctx.fillStyle=pr.color;ctx.beginPath();ctx.arc(pr.x,pr.y,pr.r,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.globalAlpha=.85;ctx.beginPath();ctx.arc(pr.x,pr.y,pr.r*.5,0,TAU);ctx.fill();ctx.globalAlpha=1}}
function gfxParticles(){
  for(const pt of G.particles){if(pt._b===undefined)pt._b=!!pt.glow||gfxBright(pt.color);if(pt._b)continue;const a=clamp(pt.life/pt.max,0,1);ctx.globalAlpha=a;ctx.fillStyle=pt.color;ctx.beginPath();ctx.arc(pt.x,pt.y,pt.size*a,0,TAU);ctx.fill()}
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const pt of G.particles){if(!pt._b)continue;const a=clamp(pt.life/pt.max,0,1);ctx.globalAlpha=a*.9;ctx.fillStyle=pt.color;ctx.beginPath();ctx.arc(pt.x,pt.y,pt.glow?pt.size:pt.size*(.45+.55*a),0,TAU);ctx.fill();
    if(pt.size>3.2){const s=pt.size*3;ctx.globalAlpha=a*.35;ctx.drawImage(gfxGlow(pt.color),pt.x-s,pt.y-s,s*2,s*2)}}
  ctx.restore();ctx.globalAlpha=1}
function gfxBloom(){
  if(!GFX.bloom)return;const cw=canvas.width,ch=canvas.height,bw=Math.max(16,cw>>3),bh=Math.max(16,ch>>3);
  if(!GFX.bc||GFX.bc.width!==bw||GFX.bc.height!==bh){GFX.bc=document.createElement('canvas');GFX.bc.width=bw;GFX.bc.height=bh;GFX.bx=GFX.bc.getContext('2d')}
  const b=GFX.bx;b.globalCompositeOperation='source-over';b.globalAlpha=1;b.imageSmoothingEnabled=true;b.imageSmoothingQuality='medium';b.clearRect(0,0,bw,bh);b.drawImage(canvas,0,0,bw,bh);
  b.globalCompositeOperation='multiply';b.drawImage(GFX.bc,0,0);
  ctx.save();ctx.setTransform(1/PIX_SCALE,0,0,1/PIX_SCALE,0,0);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.95;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(GFX.bc,0,0,W,H);ctx.restore()}
function gfxPerf(){const n=performance.now();if(GFX.last){const d=n-GFX.last;if(d>45&&d<400)GFX.slow++;else GFX.slow=Math.max(0,GFX.slow-1);if(GFX.slow>90){if(GFX.bloom)GFX.bloom=false;if(GFX.shadows)GFX.shadows=false}}GFX.last=n}

/* ===== VFX PASS — dynamic dungeon lighting, emissive sigils, impact sparks =====
   The world used to be uniformly lit: torch sprites only added glow on top of a
   fully visible floor, so nothing read as a light source and entities looked
   pasted on. This pass darkens the world into a light buffer, erases darkness
   around every real light (hero, torches, bosses, projectiles, orbs, sigils),
   then composites it back — the additive glows underneath now actually read as
   illumination instead of decals. */
const LIGHT_AMB = { crypt:0.46, caverns:0.46, frost:0.42, volcano:0.45, shadow:0.52, celestial:0.40 };
const LIGHT = { c:null, x:null };
const LIGHT_SCALE = 2;   /* light is a soft gradient — half-res buffer, smooth upscale */
function ensureLightBuf(){
  if(!LIGHT.c){LIGHT.c=document.createElement('canvas');LIGHT.x=LIGHT.c.getContext('2d')}
  const bw=Math.max(8,Math.floor(W/(PIX_SCALE*LIGHT_SCALE))),bh=Math.max(8,Math.floor(H/(PIX_SCALE*LIGHT_SCALE)));
  if(LIGHT.c.width!==bw||LIGHT.c.height!==bh){LIGHT.c.width=bw;LIGHT.c.height=bh}
  return LIGHT;
}
let _holeSprite=null;
function lightHole(){
  if(_holeSprite)return _holeSprite;
  const R=128,c=document.createElement('canvas');c.width=c.height=R*2;
  const x=c.getContext('2d'),g=x.createRadialGradient(R,R,0,R,R,R);
  for(let i=0;i<=10;i++){const t=i/10;g.addColorStop(t,`rgba(255,255,255,${Math.pow(1-t,1.9).toFixed(3)})`)}
  x.fillStyle=g;x.beginPath();x.arc(R,R,R,0,TAU);x.fill();
  _holeSprite=c;return c;
}
function vfxLight(biome,camX,camY,shX,shY){
  const L=ensureLightBuf(),x=L.x;if(!x)return;
  const amb=LIGHT_AMB[biome.key]!==undefined?LIGHT_AMB[biome.key]:0.58;
  const bw=L.c.width,bh=L.c.height;
  x.setTransform(1,0,0,1,0,0);
  x.globalCompositeOperation='source-over';x.globalAlpha=1;
  x.clearRect(0,0,bw,bh);
  x.fillStyle=`rgba(7,4,13,${amb})`;x.fillRect(0,0,bw,bh);
  x.setTransform(ZOOM/(PIX_SCALE*LIGHT_SCALE),0,0,ZOOM/(PIX_SCALE*LIGHT_SCALE),(W/2-camX*ZOOM+shX)/(PIX_SCALE*LIGHT_SCALE),(H/2-camY*ZOOM+shY)/(PIX_SCALE*LIGHT_SCALE));
  x.globalCompositeOperation='destination-out';
  const hole=lightHole();
  const put=(wx,wy,r,a)=>{if(a<=0.01||r<=1)return;x.globalAlpha=Math.min(1,a);x.drawImage(hole,wx-r,wy-r,r*2,r*2)};
  const t=G.time,p=G.player;
  put(p.x,p.y,190+Math.sin(t*2.4)*7,0.97);
  for(const tt of torches){
    const fl=0.84+Math.sin(t*8+tt.phase)*0.10+Math.sin(t*19+tt.phase*2)*0.06;
    put(tt.x,tt.y,320*fl,0.92);
  }
  for(const e of G.enemies){
    if(e.dead)continue;
    if(e.boss)put(e.x,e.y,e.r*6.5,0.85);
    else if(dist(e,p)<820)put(e.x,e.y,e.r*4.2,0.30);
  }
  for(const pr of G.projectiles)put(pr.x,pr.y,50+pr.r*3,0.72);
  for(const o of G.orbs)put(o.x,o.y,o.kind==='xp'?32:42,0.55);
  for(const it of G.loot)put(it.x,it.y,62,0.72);
  put(WORLD.w/2,WORLD.h/2,250,0.52);
  for(const m of [[-560,0],[560,0],[0,-440],[0,440]])put(WORLD.w/2+m[0],WORLD.h/2+m[1],118,0.42);
  let n=0;
  for(const pt of G.particles){
    if(n>24)break;
    if(!pt.glow&&pt.size<4)continue;
    put(pt.x,pt.y,18+pt.size*6,0.35);n++;
  }
  x.globalAlpha=1;x.globalCompositeOperation='source-over';
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';
  ctx.drawImage(L.c,(camX*ZOOM-shX-W/2)/ZOOM,(camY*ZOOM-shY-H/2)/ZOOM,W/ZOOM,H/ZOOM);
  ctx.restore();
}
function vfxSigils(biome){
  const t=G.time,glow=gfxGlow(biome.torchColor),pulse=0.5+0.5*Math.sin(t*1.15);
  ctx.save();ctx.globalCompositeOperation='lighter';
  const big=200;
  ctx.globalAlpha=0.075+0.035*pulse;
  ctx.drawImage(glow,WORLD.w/2-big*1.6,WORLD.h/2-big*1.6,big*3.2,big*3.2);
  for(const m of [[-560,0],[560,0],[0,-440],[0,440]]){
    const s=118;
    ctx.globalAlpha=0.05+0.03*Math.sin(t*1.4+m[0]*0.01+m[1]*0.013);
    ctx.drawImage(glow,WORLD.w/2+m[0]-s*1.6,WORLD.h/2+m[1]-s*1.6,s*3.2,s*3.2);
  }
  ctx.restore();
}
/* Per-archetype cast signature: 213 skills share a dozen fx primitives, so the
   class only differed by tint. Each archetype now leaves its own mark on cast. */
function vfxSignature(p,s){
  const C=CLASSES[p.cls]||{}, role=C.roleTag||'Warrior', col=C.accent||'#ffd54f';
  const g=G; if(!g||!p)return;
  const x=p.x, y=p.y, face=p.facing||0;
  const R=(r,c,life)=>g.fx.push({type:'ring',x,y,r,life,max:life,color:c});
  switch(role){
    case 'Warrior':
      R(78,col,0.26);
      for(let i=0;i<7;i++){const a=face+(i-3)*0.22;g.particles.push({x,y,vx:Math.cos(a)*280,vy:Math.sin(a)*280,life:0.26,max:0.26,size:3,color:col,glow:true})}
      break;
    case 'Ranger':
      R(48,col,0.18);
      for(let i=0;i<7;i++){const a=face+(i-3)*0.15;g.particles.push({x,y,vx:Math.cos(a)*430,vy:Math.sin(a)*430,life:0.3,max:0.3,size:2,color:'#d8f0a0',glow:true})}
      break;
    case 'Mage':
      R(122,col,0.42); R(70,'#ffffff',0.24);
      for(let i=0;i<10;i++){const a=i/10*TAU;g.particles.push({x:x+Math.cos(a)*40,y:y+Math.sin(a)*40-6,vx:Math.cos(a)*40,vy:-96,life:0.62,max:0.62,size:2.5,color:col,glow:true})}
      break;
    case 'Rogue':
      for(let i=0;i<9;i++){g.particles.push({x:x-Math.cos(face)*i*8,y:y-Math.sin(face)*i*8,vx:0,vy:0,life:Math.max(0.1,0.28-i*0.02),max:0.28,size:Math.max(1.2,3-i*0.2),color:'#cfd8ff',glow:true})}
      break;
    case 'Necromancer':
      R(62,'#a060ff',0.36);
      for(let i=0;i<9;i++){const a=rand(0,TAU);g.particles.push({x:x+Math.cos(a)*26,y:y+Math.sin(a)*26,vx:Math.cos(a)*22,vy:-120-rand(0,60),life:0.8,max:0.8,size:3,color:i%2?'#a060ff':'#7affc0',glow:true})}
      break;
    case 'Healer':
      R(142,'#bfffe0',0.46); R(92,'#ffffff',0.3);
      for(let i=0;i<8;i++){const a=i/8*TAU;g.particles.push({x:x+Math.cos(a)*30,y:y+Math.sin(a)*30,vx:Math.cos(a)*64,vy:-72,life:0.6,max:0.6,size:2.6,color:'#9dffc0',glow:true})}
      break;
    case 'Summoner':
      R(84,'#ffe066',0.32);
      for(let i=0;i<12;i++){const a=i/12*TAU;g.particles.push({x:x+Math.cos(a)*34,y:y+Math.sin(a)*20,vx:Math.cos(a)*30,vy:Math.sin(a)*20,life:0.5,max:0.5,size:2.4,color:'#ffd54f',glow:true})}
      break;
    case 'Druid':
      for(let i=0;i<12;i++){const a=i*0.6, r=18+i*5;g.particles.push({x:x+Math.cos(a)*r,y:y+Math.sin(a)*r,vx:Math.cos(a+1.6)*72,vy:Math.sin(a+1.6)*72-40,life:0.66,max:0.66,size:2.8,color:i%2?'#7aff9a':'#bfe8a0',glow:true})}
      break;
    case 'Demon':
      R(104,'#ff5020',0.32);
      for(let i=0;i<12;i++){const a=i/12*TAU;g.particles.push({x,y,vx:Math.cos(a)*310,vy:Math.sin(a)*310,life:0.4,max:0.4,size:3.2,color:i%3?'#ff5020':'#ffd54f',glow:true})}
      break;
    default: R(70,col,0.22);
  }
}

/* Hazard ground layer: telegraph first, then the effect. Drawn under actors so
   the warning ring never hides the player. */
function vfxHazards(){
  if(!G||!G.realmHazards||!G.realmHazards.length)return;
  const t=G.time;
  for(const h of G.realmHazards){
    const D=h.def, k=h.t/D.warn, live=h.t>=D.warn;
    const on=live? Math.min(1,(h.t-D.warn)/0.12) : Math.min(1,k);
    ctx.save(); ctx.translate(h.x,h.y);
    if(!live){
      /* telegraph: dashed ring closing inward + kind marker */
      /* dark bed first so the ring separates from the stone */
      ctx.globalAlpha=0.45;
      ctx.fillStyle='rgba(0,0,0,0.75)';
      ctx.beginPath(); ctx.arc(0,0,h.r*1.12,0,TAU); ctx.fill();
      ctx.globalAlpha=1;
      ctx.globalAlpha=0.55+0.40*(1-Math.abs(0.5-k)*2);
      ctx.shadowColor=D.col; ctx.shadowBlur=12;
      ctx.strokeStyle=D.col; ctx.lineWidth=5; ctx.setLineDash([14,9]);
      ctx.lineDashOffset=-t*30;
      ctx.beginPath(); ctx.arc(0,0,h.r*(1.22-0.22*k),0,TAU); ctx.stroke();
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(0,0,h.r*(1.02-0.10*k),0,TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.shadowBlur=0;
      ctx.globalAlpha=0.22+0.26*k;
      ctx.fillStyle=D.col2;
      ctx.beginPath(); ctx.arc(0,0,h.r*0.92,0,TAU); ctx.fill();
      ctx.globalAlpha=0.85;
      ctx.fillStyle=D.col;
      if(h.kind==='crypt'){ for(let i=0;i<3;i++){ const a=i*2.1+h.spin; ctx.beginPath();
          ctx.moveTo(Math.cos(a)*h.r*0.5,Math.sin(a)*h.r*0.5);
          ctx.lineTo(Math.cos(a)*h.r*0.5+5,Math.sin(a)*h.r*0.5-9);
          ctx.lineTo(Math.cos(a)*h.r*0.5-5,Math.sin(a)*h.r*0.5-9); ctx.closePath(); ctx.fill(); } }
      else if(h.kind==='caverns'){ ctx.beginPath(); ctx.arc(0,-h.r*1.5,10,0,TAU); ctx.fill(); }
      else if(h.kind==='frost'){ for(let i=0;i<4;i++){ const a=i*Math.PI/2+h.spin*0.3;
          ctx.beginPath(); ctx.moveTo(Math.cos(a)*h.r*0.6,Math.sin(a)*h.r*0.6);
          ctx.lineTo(Math.cos(a)*h.r*0.85+4,Math.sin(a)*h.r*0.85);
          ctx.lineTo(Math.cos(a)*h.r*0.6-4,Math.sin(a)*h.r*0.85); ctx.closePath(); ctx.fill(); } }
      else if(h.kind==='volcano'){ ctx.beginPath(); ctx.ellipse(0,0,h.r*0.55,h.r*0.3,0,0,TAU); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(0,0,h.r*0.65,h.r*0.40,0,0,TAU); ctx.fill(); }
    } else {
      /* active effect */
      const fade=Math.max(0,1-(h.t-D.warn)/D.active);
      ctx.globalAlpha=on*fade;
      if(h.kind==='crypt'||h.kind==='frost'){
        const n=h.kind==='crypt'?7:9;
        for(let i=0;i<n;i++){
          const a=(i/n)*TAU+h.spin, rr=h.r*(h.kind==='crypt'?0.55:0.5);
          const hh=(h.kind==='crypt'?34:26)*on;
          ctx.fillStyle=h.kind==='crypt'?'#e8d8a8':D.col;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a)*rr-6,Math.sin(a)*rr);
          ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr-hh);
          ctx.lineTo(Math.cos(a)*rr+6,Math.sin(a)*rr);
          ctx.closePath(); ctx.fill();
        }
      } else if(h.kind==='caverns'){
        const fall=Math.max(0,1-(h.t-D.warn)/0.28);
        const ry=-h.r*1.8*(1-fall);
        ctx.fillStyle='#6a4a20'; ctx.beginPath(); ctx.arc(0,ry,16,0,TAU); ctx.fill();
        ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(0,0,h.r*0.7*fade,h.r*0.4*fade,0,0,TAU); ctx.fill();
        ctx.strokeStyle='#d8b070'; ctx.lineWidth=3;
        for(let i=0;i<6;i++){ const a=i*1.05+h.spin; ctx.beginPath();
          ctx.moveTo(Math.cos(a)*10,Math.sin(a)*10); ctx.lineTo(Math.cos(a)*h.r*0.9*fade,Math.sin(a)*h.r*0.6*fade); ctx.stroke(); }
      } else if(h.kind==='volcano'){
        ctx.globalCompositeOperation='lighter';
        for(let i=0;i<9;i++){
          const a=(i/9)*TAU, fl=h.r*(0.5+0.5*Math.abs(Math.sin(t*7+i)));
          ctx.fillStyle=i%2?'#ff9a3c':'#ffd54f';
          ctx.beginPath();
          ctx.moveTo(Math.cos(a)*h.r*0.25,Math.sin(a)*h.r*0.25);
          ctx.quadraticCurveTo(Math.cos(a)*h.r*0.7,Math.sin(a)*h.r*0.7-fl*0.5,Math.cos(a)*h.r*0.55,Math.sin(a)*h.r*0.55-fl);
          ctx.quadraticCurveTo(Math.cos(a)*h.r*0.45,Math.sin(a)*h.r*0.45,Math.cos(a)*h.r*0.25,Math.sin(a)*h.r*0.25);
          ctx.fill();
        }
      } else {
        ctx.fillStyle='rgba(20,4,40,0.85)';
        ctx.beginPath(); ctx.ellipse(0,0,h.r*0.85,h.r*0.5,0,0,TAU); ctx.fill();
        ctx.strokeStyle=D.col; ctx.lineWidth=3;
        for(let i=0;i<3;i++){ const rr=h.r*(0.3+0.25*i)+((t*22)%18);
          ctx.globalAlpha=on*fade*(0.5-0.12*i);
          ctx.beginPath(); ctx.ellipse(0,0,rr,rr*0.6,0,0,TAU); ctx.stroke(); }
      }
    }
    ctx.restore();
  }
}

function vfxSparks(e,crit,src){
  if(!GFX.sparks)return;
  const C=(src&&src.cls&&CLASSES[src.cls])?CLASSES[src.cls]:null;
  const col=(C&&C.accent)||'#ffd54f';
  const n=e.boss?(crit?5:2):(crit?8:3);       /* boss silhouettes need air */
  for(let i=0;i<n;i++){
    const a=rand(0,TAU),sp=rand(70,crit?300:180);
    G.particles.push({x:e.x,y:e.y-e.r*0.2,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-50,
      life:rand(0.16,0.36),max:0.36,size:rand(1.6,crit?(e.boss?3.4:4.2):3),color:i%3===0?'#ffffff':col,glow:true});
  }
  if(crit)G.fx.push({type:'ring',x:e.x,y:e.y,r:e.r*(e.boss?1.9:2.6),life:0.22,max:0.22,color:col});
}
/* ===== Pixel downscale buffer (chunky 8/16-bit look) ===== */
let pixBuf=null,pixCtx=null,mainCtxSaved=null;
function ensurePixBuf(){
  if(!pixBuf){pixBuf=document.createElement('canvas');pixCtx=pixBuf.getContext('2d')}
  const bw=Math.max(8,Math.floor(W/PIX_SCALE)),bh=Math.max(8,Math.floor(H/PIX_SCALE));
  if(pixBuf.width!==bw||pixBuf.height!==bh){pixBuf.width=bw;pixBuf.height=bh}
  pixCtx.imageSmoothingEnabled=false;
}
function render(){
  ensurePixBuf();
  gfxPerf();
  mainCtxSaved=ctx;
  ctx=pixCtx;
  ctx.setTransform(1/PIX_SCALE,0,0,1/PIX_SCALE,0,0);
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#0a0806';ctx.fillRect(0,0,W,H);
  if(!G||!floorCanvas){
    ctx=mainCtxSaved;
    const bg=FX1.townbg;
    if(bg){
      ctx.save();
      ctx.imageSmoothingEnabled=true;
      const sc=Math.max(W/bg.width,H/bg.height)*1.12;
      const dw=bg.width*sc,dh=bg.height*sc;
      const drift=(performance.now()*0.004)%120-60;
      ctx.drawImage(bg,(W-dw)/2+drift,(H-dh)/2,dw,dh);
      ctx.restore();
    }
    return}
  const shakeX=G.shake>0?rand(-SHK(G.shake),SHK(G.shake)):0;
  const shakeY=G.shake>0?rand(-SHK(G.shake),SHK(G.shake)):0;
  ctx.save();
  ctx.translate(Math.round(W/2-G.cam.x*ZOOM+shakeX),Math.round(H/2-G.cam.y*ZOOM+shakeY));
  ctx.scale(ZOOM,ZOOM);
  /* blit only the visible slab of the 2800x2100 floor — drawing the whole thing
     every frame was the dominant cost once the renderer went native-res */
  {
    const vw=W/ZOOM, vh=H/ZOOM;
    const sx=Math.max(0,Math.floor(G.cam.x-vw/2)), sy=Math.max(0,Math.floor(G.cam.y-vh/2));
    const sw=Math.min(WORLD.w-sx, Math.ceil(vw)+2), sh=Math.min(WORLD.h-sy, Math.ceil(vh)+2);
    if(sw>0&&sh>0) ctx.drawImage(floorCanvas, sx,sy,sw,sh, sx,sy,sw,sh);
  }
  /* WALL DEPTH: darken toward the arena borders so the room reads enclosed
     instead of endless tiled floor */
  {
    const BW=190;
    const bands=[[0,0,WORLD.w,BW,'v'],[0,WORLD.h-BW,WORLD.w,BW,'v2'],[0,0,BW,WORLD.h,'h'],[WORLD.w-BW,0,BW,WORLD.h,'h2']];
    for(const [bx,by,bw2,bh2,dir] of bands){
      const g2=dir==='v'?ctx.createLinearGradient(0,by,0,by+bh2)
              :dir==='v2'?ctx.createLinearGradient(0,by,0,by+bh2)
              :dir==='h'?ctx.createLinearGradient(bx,0,bx+bw2,0)
              :ctx.createLinearGradient(bx,0,bx+bw2,0);
      if(dir==='v'||dir==='h'){g2.addColorStop(0,'rgba(0,0,0,0.55)');g2.addColorStop(1,'rgba(0,0,0,0)')}
      else {g2.addColorStop(0,'rgba(0,0,0,0)');g2.addColorStop(1,'rgba(0,0,0,0.55)')}
      ctx.save();ctx.globalCompositeOperation='multiply';ctx.fillStyle=g2;ctx.fillRect(bx,by,bw2,bh2);ctx.restore();
    }
  }
  const biome=getBiomeForWave(Math.max(1,G.wave));
  ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=0.72;ctx.fillStyle=biome.floorTint;ctx.fillRect(0,0,WORLD.w,WORLD.h);ctx.restore();
  ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=0.12;ctx.fillStyle=biome.tint;ctx.fillRect(0,0,WORLD.w,WORLD.h);ctx.restore();
  ctx.save();ctx.globalCompositeOperation='lighter';
  const _tspr=torchSprite(biome.torchColor);
  for(const t of torches){
    const flicker=0.75+Math.sin(G.time*8+t.phase)*0.14+Math.sin(G.time*17+t.phase*2)*0.09;
    const d=260*flicker;
    ctx.globalAlpha=flicker;
    ctx.drawImage(_tspr,t.x-d/2,t.y-20-d/2,d,d);
    ctx.globalAlpha=1;
  }
  ctx.restore();
  for(const t of torches)px.drawTorchFlame(ctx,t.x,t.y,G.time,t.phase);
  vfxSigils(biome);
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const d of G.dust){
    const a=d.alpha*(0.5+0.5*Math.sin(G.time*2+d.phase));
    ctx.globalAlpha=a;
    ctx.fillStyle=d.color||'#c8b8a0';
    const size=d.glow?d.size*1.4:d.size;
    ctx.beginPath();ctx.arc(d.x,d.y,size,0,TAU);ctx.fill();
  }
  ctx.restore();
  for(const h of G.hazards){
    const pct=clamp(h.life/h.max,0,1);
    ctx.save();ctx.globalAlpha=0.4*pct+0.2;ctx.fillStyle=h.color;
    ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,TAU);ctx.fill();ctx.restore();
  }
  for(const gr of G.grounds){
    const pct=clamp(gr.life/gr.max,0,1);
    ctx.save();ctx.globalAlpha=0.35*pct+0.15;ctx.fillStyle=gr.color;
    ctx.beginPath();ctx.arc(gr.x,gr.y,gr.r,0,TAU);ctx.fill();
    ctx.globalAlpha=0.7*pct;ctx.strokeStyle=gr.color;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(gr.x,gr.y,gr.r,0,TAU);ctx.stroke();
    ctx.restore();
  }
  for(const pt of G.portals){
    const pct=clamp(pt.life/pt.max,0,1);
    const scale=pt.life>pt.max*0.75?(1-pt.life/pt.max)/0.25:pct;
    ctx.save();ctx.translate(pt.x,pt.y);ctx.globalAlpha=pct;
    const grd=ctx.createRadialGradient(0,0,0,0,0,pt.r*scale);
    grd.addColorStop(0,'rgba(0,0,0,0.92)');grd.addColorStop(0.4,pt.color+'cc');grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd;ctx.beginPath();ctx.arc(0,0,pt.r*scale,0,TAU);ctx.fill();ctx.restore();
  }
  for(const t of G.traps){
    ctx.save();ctx.translate(t.x,t.y);
    const pulse=0.5+Math.sin(G.time*5)*0.5;
    ctx.globalAlpha=0.6;
    ctx.strokeStyle=t.color;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,t.r,0,TAU);ctx.stroke();
    ctx.globalAlpha=0.3+pulse*0.3;
    ctx.fillStyle=t.color;
    ctx.beginPath();ctx.arc(0,0,t.r,0,TAU);ctx.fill();
    for(let i=0;i<8;i++){
      const a=i/8*TAU;
      ctx.globalAlpha=0.9;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*t.r*0.4, Math.sin(a)*t.r*0.4);
      ctx.lineTo(Math.cos(a)*t.r*0.85, Math.sin(a)*t.r*0.85);
      ctx.stroke();
    }
    ctx.restore();
  }
  for(const t of G.totems){
    ctx.save();ctx.translate(t.x,t.y);
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.beginPath();ctx.ellipse(0,14,16,6,0,0,TAU);ctx.fill();
    ctx.fillStyle=shadeColor(t.color,-0.3);
    ctx.fillRect(-8,-16,16,28);
    ctx.fillStyle=t.color;
    ctx.shadowColor=t.color;ctx.shadowBlur=14;
    ctx.beginPath();ctx.arc(0,-18,7,0,TAU);ctx.fill();
    ctx.shadowBlur=0;
    ctx.globalAlpha=0.25+Math.sin(G.time*4)*0.15;
    ctx.strokeStyle=t.color;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,t.r,0,TAU);ctx.stroke();
    ctx.restore();
  }
  for(const r of G.rains){
    ctx.globalAlpha=0.20*clamp(r.life/1.6,0,1);ctx.fillStyle=r.color||'#9dffbf';
    ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,TAU);ctx.fill();ctx.globalAlpha=1;
  }
  for(const it of G.loot){
    const bob=Math.sin(it.bob)*4;
    ctx.save();ctx.translate(it.x,it.y+bob);
    ctx.shadowColor=it.color;ctx.shadowBlur=22;ctx.fillStyle=it.color;
    ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(9,0);ctx.lineTo(0,11);ctx.lineTo(-9,0);ctx.closePath();ctx.fill();ctx.restore();
  }
  for(const o of G.orbs){
    ctx.save();ctx.translate(o.x,o.y);
    if(o.kind==='xp'){
      const pulse=0.75+Math.sin(G.time*8+o.x)*0.25;
      ctx.shadowColor='#5aff8f';ctx.shadowBlur=10;ctx.fillStyle='#5aff8f';
      ctx.beginPath();ctx.arc(0,0,o.r*pulse,0,TAU);ctx.fill();
    }else{
      ctx.shadowColor='#ffd54f';ctx.shadowBlur=8;ctx.fillStyle='#ffd54f';
      ctx.beginPath();ctx.arc(0,0,o.r,0,TAU);ctx.fill();
      ctx.shadowBlur=0;ctx.strokeStyle='#8a6a1a';ctx.lineWidth=1.5;ctx.stroke();
    }
    ctx.restore();
  }
  gfxGround(biome);
  if(cutscene.active)for(const a of cutscene.actors)if(a.drawGround&&!a.dead)a.drawGround(a);
  vfxHazards();
  for(const e of G.enemies)if(!e.dead){drawEnemy(e);if(e._redAura)drawBossRage(e);if(e.finale&&!cutscene.active&&e.hp<=Math.ceil(e.maxHp*.1))drawFinaleMark(e)}
  for(const m of G.minions)drawMinion(m);
  for(const pt of (G.pets||[])){
    ctx.save();ctx.globalAlpha=0.95;
    if(pt.kind==='panda'&&FXI.panda&&FXI.panda.length===8){
      const fr=FXI.panda[Math.floor(pt.t*3)%8];
      if(fr)ctx.drawImage(fr,pt.x-20,pt.y-24,40,40);
    }else if(pt.kind==='cat'&&FX1.cat){
      const bob=Math.sin(pt.t*0.15)*2;
      ctx.drawImage(FX1.cat,pt.x-16,pt.y-20+bob,32,32);
    }else if(pt.kind==='bear'&&FX1.bear){
      const bob=Math.sin(pt.t*0.12+1.3)*2;
      ctx.drawImage(FX1.bear,pt.x-16,pt.y-20+bob,32,32);
    }
    ctx.restore();
  }
  drawPlayer(G.player);
  if(cutscene.active){
    for(const a of cutscene.actors){
      if(a.dead)continue;
      if(a.draw){a.draw(a);continue}
      if(a.type==='slime')drawCutsceneSlime(a);
      else if(a.type==='boss')drawCutsceneBoss(a);
      else if(a.type==='guest')drawCutsceneGuest(a);
    }
  }
  if(G.player.chargingUlt){
    const pct=Math.min(G.player.chargeTime/5,1);
    const R=100+450*pct;
    ctx.save();
    ctx.globalAlpha=0.35+Math.sin(G.time*15)*0.2;
    ctx.strokeStyle=G.player.color;
    ctx.lineWidth=3+pct*3;
    ctx.beginPath();ctx.arc(G.player.x,G.player.y,R,0,TAU);ctx.stroke();
    ctx.globalAlpha=0.12*pct;
    ctx.fillStyle=G.player.color;
    ctx.beginPath();ctx.arc(G.player.x,G.player.y,R,0,TAU);ctx.fill();
    ctx.globalAlpha=1;
    ctx.font='bold 16px Trebuchet MS';ctx.textAlign='center';
    ctx.fillStyle=pct>=1?'#ffd54f':'#ffffff';
    ctx.shadowColor='#000';ctx.shadowBlur=6;
    ctx.fillText(pct>=1?'★ MAX ★':(5-G.player.chargeTime).toFixed(1)+'s',G.player.x,G.player.y-70-G.player.r);
    ctx.shadowBlur=0;ctx.restore();
  }
  gfxProjectiles();
  gfxParticles();
  ctx.globalAlpha=1;
  for(const f of G.fx)drawFx(f);
  if(!cutscene.active)vfxLight(biome,G.cam.x,G.cam.y,shakeX,shakeY);
  /* cosmetics go over the darkness pass — behind it they are invisible in crypt */
  try{ if(G.player) drawCosmeticAura(G.player); }catch(e){}
  const p=G.player;
  if(p.autoAttack&&p._autoTarget&&!p._autoTarget.dead&&!cutscene.active){
    const et=p._autoTarget;
    const pr=0.5+Math.sin(G.time*6)*0.5;
    ctx.save();ctx.globalAlpha=0.75;ctx.strokeStyle='#ff8f2e';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(et.x,et.y,et.r+10+pr*4,0,TAU);ctx.stroke();ctx.restore();
  }
  for(const t of G.texts){
    const a=clamp(t.life/t.max,0,1);
    const sp=Math.max(0,t.spawn||0)/0.15;
    const sc=1+clamp(sp,0,1)*0.55;
    ctx.globalAlpha=a;
    ctx.font=`bold ${t.size*sc}px 'Trebuchet MS', sans-serif`;
    ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='rgba(0,0,0,0.9)';
    ctx.strokeText(t.text,t.x,t.y);ctx.fillStyle=t.color;ctx.fillText(t.text,t.x,t.y);
  }
  ctx.globalAlpha=1;
  /* OFF-SCREEN THREATS: edge arrow toward nearby enemies you cannot see */
  {
    const vw2=W/ZOOM/2, vh2=H/ZOOM/2, cx2=G.cam.x, cy2=G.cam.y;
    for(const e of G.enemies){
      if(e.dead) continue;
      const dx=e.x-cx2, dy=e.y-cy2;
      if(Math.abs(dx)<vw2-34 && Math.abs(dy)<vh2-34) continue;
      const dd=Math.hypot(dx,dy); if(dd>1400) continue;
      const a=Math.atan2(dy,dx);
      const k=Math.min((vw2-38)/Math.max(0.001,Math.abs(Math.cos(a))),(vh2-38)/Math.max(0.001,Math.abs(Math.sin(a))));
      ctx.save();ctx.translate(cx2+Math.cos(a)*k, cy2+Math.sin(a)*k);ctx.rotate(a);
      ctx.globalAlpha=0.45+0.3*Math.sin(G.time*8);
      ctx.fillStyle=e.boss?'#ff4040':'rgba(255,95,95,0.9)';
      ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-7,-7);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha=1;
  ctx.restore();
  gfxBloom();
  ctx.save();ctx.globalAlpha=0.55;
  const grd=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.35,W/2,H/2,Math.max(W,H)*0.75);
  grd.addColorStop(0,'rgba(0,0,0,0)');grd.addColorStop(1,biome.edge);
  ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
  ctx.restore();

  /* ── FOREGROUND PARALLAX: temple lintel and hanging vines pass over the
        player, which is what gives the room depth ── */
  {
    const px=G.cam.x*0.35, t=G.time;
    ctx.save();
    /* stone lintel across the top */
    ctx.fillStyle='rgba(24,16,10,0.92)';
    ctx.fillRect(0,0,W,30);
    ctx.fillStyle='rgba(60,42,26,0.95)';
    ctx.fillRect(0,0,W,20);
    for(let i=0;i<Math.ceil(W/56)+2;i++){
      const bx=((i*56-px)%(W+56)+W+56)%(W+56)-56;
      ctx.fillStyle='rgba(96,70,42,0.55)';
      ctx.fillRect(bx+6,4,10,10);
      ctx.fillStyle='rgba(20,12,6,0.5)';
      ctx.fillRect(bx+20,6,26,3);
    }
    ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,20,W,10);
    /* vines hanging from the lintel */
    for(let i=0;i<7;i++){
      const vx=((i*233-px*1.6)%(W+240)+W+240)%(W+240)-120;
      const len=54+((i*37)%70), sway=Math.sin(t*0.7+i)*7;
      ctx.strokeStyle='rgba(30,52,30,0.9)';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(vx,24);
      ctx.quadraticCurveTo(vx+sway,len*0.55,vx+sway*1.6,len);
      ctx.stroke();
      for(let k=1;k<=4;k++){
        const q=k/4, ly=24+len*q, lx=vx+sway*1.6*q*q;
        ctx.fillStyle=k%2?'rgba(46,78,42,0.9)':'rgba(34,60,32,0.9)';
        ctx.beginPath();ctx.ellipse(lx-5,ly,7,4,-0.5,0,TAU);ctx.fill();
        ctx.beginPath();ctx.ellipse(lx+5,ly,7,4,0.5,0,TAU);ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ── REALM TRANSITION: stone panels close, name the realm, open ── */
  if(G.realmWipe){
    const t=G.realmWipe.t, D=2.4;
    const shut=Math.min(1,Math.max(0,(t<0.55?t/0.55:1-(t-1.5)/0.55)));
    if(shut>0.001){
      const wid=W/2*shut;
      ctx.save();
      const gL=ctx.createLinearGradient(0,0,wid,0);
      gL.addColorStop(0,'#1a1006');gL.addColorStop(0.75,'#33200f');gL.addColorStop(1,'#573a1e');
      ctx.fillStyle=gL;ctx.fillRect(0,0,wid,H);
      ctx.save();ctx.translate(W,0);ctx.scale(-1,1);
      ctx.fillStyle=gL;ctx.fillRect(0,0,wid,H);ctx.restore();
      /* carved relief: column pairs + lotus rosettes, so the panels read as
         temple doors instead of a fade */
      ctx.save();
      for(const sgn of [1,-1]){
        ctx.save();
        ctx.translate(sgn>0?0:W,0);ctx.scale(sgn,1);
        for(let cx2=34;cx2<wid;cx2+=74){
          ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(cx2+6,0,16,H);
          ctx.fillStyle='rgba(240,193,75,0.10)';ctx.fillRect(cx2,0,5,H);
          ctx.fillStyle='rgba(240,193,75,0.06)';ctx.fillRect(cx2+22,0,3,H);
        }
        for(let ry=120;ry<H-60;ry+=190){
          for(let rx=56;rx<wid-40;rx+=110){
            ctx.strokeStyle='rgba(240,193,75,0.14)';ctx.lineWidth=2;
            for(let k=0;k<8;k++){
              const a=k/8*TAU;
              ctx.beginPath();ctx.ellipse(rx+Math.cos(a)*13,ry+Math.sin(a)*13,7,4,a,0,TAU);ctx.stroke();
            }
            ctx.beginPath();ctx.arc(rx,ry,4,0,TAU);ctx.stroke();
          }
        }
        /* gold seam band */
        ctx.fillStyle='rgba(232,181,58,0.55)';ctx.fillRect(wid-9,0,9,H);
        ctx.fillStyle='rgba(255,238,190,0.35)';ctx.fillRect(wid-9,0,3,H);
        ctx.restore();
      }
      ctx.restore();
      const a=Math.max(0,Math.min(1,(t-0.45)/0.35))*Math.max(0,Math.min(1,(1.75-t)/0.3));
      if(a>0.01){
        ctx.globalAlpha=a;ctx.textAlign='center';
        ctx.font=`bold ${Math.round(H*0.052)}px 'Trebuchet MS', sans-serif`;
        ctx.fillStyle='#f0c14b';ctx.fillText(G.realmWipe.name.toUpperCase(),W/2,H*0.48);
        ctx.font=`${Math.round(H*0.021)}px 'Trebuchet MS', sans-serif`;
        ctx.fillStyle='#c8b89a';ctx.fillText(G.realmWipe.sub,W/2,H*0.53);
        ctx.strokeStyle='rgba(240,193,75,0.6)';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(W/2-140,H*0.505);ctx.lineTo(W/2+140,H*0.505);ctx.stroke();
      }
      ctx.restore();
    }
  }
  if(G.damageFlash>0){ctx.fillStyle=`rgba(180,20,20,${FL(G.damageFlash*0.28)})`;ctx.fillRect(0,0,W,H)}
  const hpPct=G.player.hp/G.player.maxHp;
  if(hpPct<0.35&&G.player.hp>0){
    const intensity=(1-hpPct/0.35)*0.55;
    const pulse=0.6+Math.sin(G.time*5.5)*0.4;
    const g2=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.28,W/2,H/2,Math.max(W,H)*0.72);
    g2.addColorStop(0,'rgba(150,15,15,0)');g2.addColorStop(1,`rgba(150,15,15,${intensity*pulse})`);
    ctx.fillStyle=g2;ctx.fillRect(0,0,W,H);
  }
  /* blit pixel buffer to main canvas (chunky upscale) */
  ctx=mainCtxSaved;
  mainCtxSaved.setTransform(DPR,0,0,DPR,0,0);
  mainCtxSaved.imageSmoothingEnabled=false;
  mainCtxSaved.drawImage(pixBuf,0,0,W,H);
}
function drawFx(f){
  const t=1-f.life/f.max;
  ctx.save();ctx.globalAlpha=clamp(1-t,0,1);
  if(f.type==='shadow'){
    ctx.globalAlpha*=0.65;ctx.fillStyle='rgba(30,8,60,0.95)';ctx.shadowColor='#8a4dff';ctx.shadowBlur=16;
    ctx.beginPath();ctx.ellipse(f.x,f.y+4,f.r*0.8,f.r*1.05,0,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(f.x,f.y-f.r*0.9,f.r*0.55,0,TAU);ctx.fill();
  } else if(f.type==='slash'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    const lvl=f.lvl||1;
    const rad=f.r*(0.65+0.35*t);
    ctx.strokeStyle=f.color;ctx.lineWidth=(9+lvl*1.8)*(1-t)+2;ctx.lineCap='round';
    ctx.beginPath();ctx.arc(f.x,f.y,rad,f.ang-f.arc/2,f.ang+f.arc/2);ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=3*(1-t)+1;
    ctx.beginPath();ctx.arc(f.x,f.y,rad*0.92,f.ang-f.arc*0.42,f.ang+f.arc*0.42);ctx.stroke();
    if(lvl>=2){
      ctx.strokeStyle='#ffd54f';ctx.lineWidth=2.5*(1-t);
      ctx.beginPath();ctx.arc(f.x,f.y,rad*0.76,f.ang-f.arc*0.38,f.ang+f.arc*0.38);ctx.stroke();
    }
    ctx.restore();
  } else if(f.type==='ring'||f.type==='nova'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=f.color;ctx.lineWidth=8*(1-t)+1.5;
    ctx.beginPath();ctx.arc(f.x,f.y,f.r*t,0,TAU);ctx.stroke();
    if(f.type==='nova'){
      ctx.globalAlpha=clamp((1-t)*0.45,0,1);
      ctx.strokeStyle='#ffd54f';ctx.lineWidth=3*(1-t)+1;
      ctx.beginPath();ctx.arc(f.x,f.y,f.r*t*0.72,0,TAU);ctx.stroke();
    }
    ctx.restore();
  } else if(f.type==='lotus'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.translate(f.x,f.y);ctx.rotate(t*1.6);
    const petals=f.petals||8,rr=f.r*(0.35+0.65*t);
    ctx.strokeStyle=f.color;ctx.fillStyle=f.color+'44';ctx.lineWidth=2;
    for(let i=0;i<petals;i++){
      const a=(i/petals)*TAU;
      ctx.save();ctx.rotate(a);
      ctx.beginPath();ctx.moveTo(0,0);
      ctx.quadraticCurveTo(rr*0.45,-rr*0.28,rr,0);
      ctx.quadraticCurveTo(rr*0.45,rr*0.28,0,0);
      ctx.fill();ctx.stroke();ctx.restore();
    }
    ctx.restore();
  } else if(f.type==='runes'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.translate(f.x,f.y);ctx.rotate(-t*2.2);
    const n=f.count||6,rr=f.r*(0.4+0.6*t);
    ctx.strokeStyle=f.color;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,rr,0,TAU);ctx.stroke();
    ctx.beginPath();
    for(let i=0;i<=n;i++){
      const a=(i/n)*TAU*2;
      const px2=Math.cos(a)*rr*0.82,py2=Math.sin(a)*rr*0.82;
      if(i===0)ctx.moveTo(px2,py2);else ctx.lineTo(px2,py2);
    }
    ctx.stroke();ctx.restore();
  } else if(f.type==='garuda'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.translate(f.x,f.y);ctx.rotate(f.ang||0);
    const rr=f.r*(0.4+0.6*t);
    ctx.strokeStyle=f.color;ctx.lineWidth=4*(1-t)+1;
    for(const s of [-1,1]){
      ctx.beginPath();ctx.moveTo(0,0);
      ctx.quadraticCurveTo(rr*0.4,s*rr*0.65,rr*0.95,s*rr*0.35);
      ctx.stroke();
    }
    ctx.restore();
  } else if(f.type==='chakram'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.translate(f.x,f.y);ctx.rotate(t*9);
    const blades=f.blades||6,rr=f.r*(0.35+0.65*t);
    ctx.strokeStyle=f.color;ctx.lineWidth=2.5;
    ctx.beginPath();ctx.arc(0,0,rr*0.7,0,TAU);ctx.stroke();
    for(let i=0;i<blades;i++){
      const a=(i/blades)*TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*rr*0.5,Math.sin(a)*rr*0.5);
      ctx.lineTo(Math.cos(a+0.25)*rr,Math.sin(a+0.25)*rr);
      ctx.stroke();
    }
    ctx.restore();
  } else if(f.type==='naga'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    const rr=f.r*(0.3+0.7*t);
    ctx.strokeStyle=f.color;ctx.lineWidth=3.5*(1-t)+1;
    for(let k=0;k<3;k++){
      ctx.beginPath();
      for(let i=0;i<=12;i++){
        const u=i/12,ang=(f.ang||0)+(k-1)*0.45+Math.sin(u*TAU*1.5+t*8)*0.22;
        const px2=f.x+Math.cos(ang)*rr*u,py2=f.y+Math.sin(ang)*rr*u;
        if(i===0)ctx.moveTo(px2,py2);else ctx.lineTo(px2,py2);
      }
      ctx.stroke();
    }
    ctx.restore();
  } else if(f.type==='pillar'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    const w=f.r*(1-t*0.55),h=140*(0.5+0.5*(1-t));
    const gr=ctx.createLinearGradient(f.x,f.y,f.x,f.y-h);
    gr.addColorStop(0,f.color);gr.addColorStop(0.5,f.color+'88');gr.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gr;ctx.fillRect(f.x-w/2,f.y-h,w,h);
    ctx.fillStyle='#ffffff';ctx.globalAlpha=(1-t)*0.65;
    ctx.fillRect(f.x-w*0.2,f.y-h,w*0.4,h);
    ctx.restore();
  } else if(f.type==='boom'){
    const rr=f.r*(0.35+0.65*t);
    const grd=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,rr);
    grd.addColorStop(0,f.color);grd.addColorStop(0.4,f.color+'cc');grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.fillStyle=grd;ctx.beginPath();ctx.arc(f.x,f.y,rr,0,TAU);ctx.fill();ctx.restore();
  } else if(f.type==='lightning'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=f.color;ctx.lineWidth=3.5;ctx.lineCap='round';
    ctx.beginPath();
    const dx=f.x2-f.x1,dy=f.y2-f.y1;
    ctx.moveTo(f.x1,f.y1);
    for(let i=1;i<=8;i++){const tt=i/8;
      ctx.lineTo(f.x1+dx*tt+(i<8?rand(-9,9):0),f.y1+dy*tt+(i<8?rand(-9,9):0))}
    ctx.stroke();ctx.restore();
  } else if(f.type==='beam'){
    ctx.save();ctx.globalCompositeOperation='lighter';
    const alpha=clamp(1-t,0,1);
    ctx.globalAlpha=alpha;
    const grad=ctx.createLinearGradient(f.x1,f.y1,f.x2,f.y2);
    grad.addColorStop(0,f.color);
    grad.addColorStop(1,'rgba(255,255,255,0)');
    ctx.strokeStyle=grad;
    ctx.lineWidth=(8+(1-t)*12)*(1-t*0.3);
    ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(f.x1,f.y1);ctx.lineTo(f.x2,f.y2);ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo(f.x1,f.y1);ctx.lineTo(f.x2,f.y2);ctx.stroke();
    ctx.restore();
  } else if(f.type==='smoke'){
    const list=FXI.smoke;
    if(list&&list.length){
      const fr=list[Math.min(list.length-1,(t*list.length)|0)];
      if(fr){
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=(1-t)*0.85;
      const s=f.s*(0.85+0.45*t);
      const w=fr.width*s,hh=fr.height*s;
      ctx.drawImage(fr,f.x-w/2,f.y-hh*(1+0.5*t)-hh/2,w,hh);
      ctx.restore();
      }
    }
  } else if(f.type==='summon'){
    const list=FXI.summon;
    if(list&&list.length){
      const fr=list[Math.min(list.length-1,(t*list.length)|0)];
      if(fr){
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=0.9-t*0.45;
      const w=fr.width*f.s,hh=fr.height*f.s;
      ctx.drawImage(fr,f.x-w/2,f.y-hh/2,w,hh);
      ctx.restore();
      }
    }
  } else if(f.type==='healbeam'){
    const list=FXI.holybeam;
    if(list&&list.length){
      const fr=list[Math.min(list.length-1,(t*list.length)|0)];
      if(fr){
      ctx.save();ctx.globalCompositeOperation='lighter';
      const s=3.5;
      ctx.drawImage(fr,f.x-fr.width*s/2,f.y-fr.height*s-40,fr.width*s,fr.height*s);
      if(t>0.7){
        const cx=FXI.holycross;
        if(cx&&cx.length){
          const fr2=cx[Math.min(cx.length-1,(((t-0.7)/0.3)*cx.length)|0)];
          if(fr2){ctx.globalAlpha=(t-0.7)/0.3;const s2=4;ctx.drawImage(fr2,f.x-fr2.width*s2/2,f.y-fr2.height*s2-30,fr2.width*s2,fr2.height*s2)}
        }
      }
      ctx.restore();
      }
    }
  }
  ctx.restore();
}
function drawTitleAura(p:any,t:number){
  if(!p.titleName||!TITLES[p.cls])return;
  const T=TITLES[p.cls];
  const c=T.color,x=p.x,y=p.y,r=p.r+14;
  ctx.save();
  if(T.aura==='shield'){
    ctx.globalAlpha=0.55+Math.sin(t*3)*0.25;ctx.strokeStyle=c;ctx.lineWidth=2.5;
    ctx.beginPath();ctx.arc(x,y,r+4,t*1.3,t*1.3+4.4);ctx.stroke();
    ctx.globalAlpha=0.35;ctx.beginPath();ctx.arc(x,y,r+4,t*1.3+Math.PI,t*1.3+Math.PI+1.8);ctx.stroke();
  } else if(T.aura==='ember'||T.aura==='dragon'){
    for(let i=0;i<8;i++){const a=t*1.6+i*TAU/8;const rr=r+6+Math.sin(t*3+i*1.7)*5;
      ctx.globalAlpha=0.35+Math.sin(t*4+i)*0.3;ctx.fillStyle=c;
      ctx.beginPath();ctx.arc(x+Math.cos(a)*rr,y+Math.sin(a)*rr,1.8+(i%3),0,TAU);ctx.fill();}
  } else if(T.aura==='mist'||T.aura==='spirit'){
    for(let i=0;i<6;i++){const a=t*0.8+i*TAU/6;const rr=r+4+Math.sin(t*2+i*2)*6;
      ctx.globalAlpha=0.3+Math.sin(t*3+i*1.3)*0.2;ctx.fillStyle=c;
      ctx.beginPath();ctx.arc(x+Math.cos(a)*rr,y+Math.sin(a)*rr,2.6,0,TAU);ctx.fill();}
  } else if(T.aura==='frost'||T.aura==='bone'){
    for(let i=0;i<6;i++){const a=-t*0.9+i*TAU/6;const rr=r+6;
      ctx.globalAlpha=0.55+Math.sin(t*4+i)*0.25;ctx.fillStyle=c;
      ctx.save();ctx.translate(x+Math.cos(a)*rr,y+Math.sin(a)*rr);ctx.rotate(a+Math.PI/4);
      ctx.fillRect(-2,-3.5,4,7);ctx.restore();}
  } else if(T.aura==='tracer'){
    ctx.globalAlpha=0.45+Math.sin(t*6)*0.3;ctx.strokeStyle=c;ctx.lineWidth=1.6;
    for(let i=0;i<4;i++){const a=t*2+i*Math.PI/2;
      ctx.beginPath();ctx.moveTo(x+Math.cos(a)*(r-2),y+Math.sin(a)*(r-2));ctx.lineTo(x+Math.cos(a)*(r+9),y+Math.sin(a)*(r+9));ctx.stroke();}
  } else if(T.aura==='halo'){
    ctx.globalAlpha=0.55+Math.sin(t*2.5)*0.3;ctx.strokeStyle=c;ctx.lineWidth=3;
    ctx.beginPath();ctx.ellipse(x,y-p.r-16,12,4.5,0,0,TAU);ctx.stroke();
    ctx.globalAlpha=0.22;ctx.fillStyle=c;ctx.fill();
  } else if(T.aura==='blood'){
    ctx.globalAlpha=0.35+Math.sin(t*5)*0.2;ctx.strokeStyle=c;ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(x,y,r+2,0,TAU);ctx.stroke();
    ctx.fillStyle=c;
    for(let i=0;i<5;i++){const a=i*TAU/5+t*0.5;
      ctx.globalAlpha=0.8;
      ctx.beginPath();ctx.arc(x+Math.cos(a)*(r+2),y+Math.sin(a)*(r+2)+((t*25+i*7)%10),1.8,0,TAU);ctx.fill();}
  }
  ctx.restore();
}
/* ── cosmetics ─────────────────────────────────────────────────────────────
   Purely visual. If this file ever reads a cosmetic while computing damage,
   the shop has become pay-to-win and this comment is a lie. */
function equippedAura(){
  try{ return cosmeticById(META && META.cos && META.cos.aura); }catch(e){ return undefined; }
}
function equippedWeaponFx(){
  try{ return cosmeticById(META && META.cos && META.cos.weapon); }catch(e){ return undefined; }
}
function drawCosmeticAura(p){
  const c = equippedAura(); if(!c || !p) return;
  const t = G ? G.time : 0;
  ctx.save();
  const R = p.r + 30;
  /* a soft wash so the aura reads on a lit floor — normal blending, or additive
     turns the whole hero into a white blob under the crypt lighting */
  {
    const glow = ctx.createRadialGradient(p.x, p.y + 6, 6, p.x, p.y + 6, R * 1.35);
    glow.addColorStop(0, c.primary);
    glow.addColorStop(0.55, c.secondary);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.13 + 0.03 * Math.sin(t * 3.1);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, R * 1.35, R * 1.0, 0, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  if(c.style === 'ring' || c.style === 'star'){
    for(let i=0;i<3;i++){
      const rr = R - i*7 + Math.sin(t*1.6+i)*2.5;
      ctx.globalAlpha = 0.24 - i*0.05;
      ctx.strokeStyle = i===0 ? c.primary : c.accent;
      ctx.lineWidth = 2.2 - i*0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y+4, rr, t*(0.7+i*0.25), t*(0.7+i*0.25)+TAU*0.72); ctx.stroke();
    }
    if(c.style === 'star'){
      for(let i=0;i<6;i++){
        const a = t*0.9 + i*TAU/6, d = R*0.72;
        ctx.globalAlpha = 0.5; ctx.fillStyle = c.accent;
        const sx = p.x+Math.cos(a)*d, sy = p.y+4+Math.sin(a)*d*0.55;
        ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, TAU); ctx.fill();
      }
    }
  } else if(c.style === 'orbit' || c.style === 'serpent'){
    const n = c.style === 'serpent' ? 7 : 5;
    for(let i=0;i<n;i++){
      const a = t*(c.style==='serpent'?1.1:1.5) + i*TAU/n;
      const d = R*0.8 + Math.sin(t*2+i)*3;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = i%2 ? c.primary : c.accent;
      ctx.beginPath();
      ctx.arc(p.x+Math.cos(a)*d, p.y+4+Math.sin(a)*d*0.6, c.style==='serpent'?3.4:2.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 0.16; ctx.strokeStyle = c.primary; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(p.x, p.y+6, R*0.85, R*0.52, 0, 0, TAU); ctx.stroke();
  } else if(c.style === 'flame'){
    for(let i=0;i<12;i++){
      const a = i*TAU/12 + Math.sin(t*3+i)*0.14;
      const h = 16 + Math.sin(t*7+i*1.7)*7;
      const d = p.r + 10;
      const bx = p.x+Math.cos(a)*d, by = p.y+8+Math.sin(a)*d*0.6;
      ctx.globalAlpha = 0.34 + 0.14*Math.sin(t*9+i);
      const grd = ctx.createLinearGradient(bx, by, bx, by-h);
      grd.addColorStop(0, c.primary); grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(bx-3, by); ctx.quadraticCurveTo(bx-1, by-h*0.6, bx, by-h);
      ctx.quadraticCurveTo(bx+1.5, by-h*0.6, bx+3, by); ctx.closePath(); ctx.fill();
    }
  } else if(c.style === 'lotus'){
    for(let i=0;i<8;i++){
      const a = t*0.8 + i*TAU/8;
      const d = R*0.75;
      const px = p.x+Math.cos(a)*d, py = p.y+4+Math.sin(a)*d*0.6;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = i%2 ? c.primary : c.accent;
      ctx.beginPath();
      ctx.ellipse(px, py, 5.2, 2.8, a, 0, TAU);
      ctx.fill();
    }
  } else if(c.style === 'storm'){
    ctx.globalAlpha = 0.30 + 0.18*Math.sin(t*11);
    ctx.strokeStyle = c.primary; ctx.lineWidth = 1.6;
    for(let i=0;i<3;i++){
      const a = t*2.2 + i*TAU/3;
      ctx.beginPath();
      ctx.moveTo(p.x+Math.cos(a)*(p.r+10), p.y+Math.sin(a)*(p.r+10));
      ctx.lineTo(p.x+Math.cos(a+0.5)*(p.r+34), p.y+Math.sin(a+0.5)*(p.r+34));
      ctx.stroke();
    }
  }
  ctx.restore();
}
/** Called on every basic attack — coloured sparks, no gameplay effect. */
function cosmeticWeaponSpark(p, angle){
  const c = equippedWeaponFx(); if(!c || !G) return;
  const g = G;
  const n = c.style === 'trail' ? 4 : 3;
  for(let i=0;i<n;i++){
    const a = angle + rand(-0.5, 0.5);
    const sp = rand(60, 190);
    g.particles.push({
      x: p.x + Math.cos(angle) * (p.r + 6),
      y: p.y + Math.sin(angle) * (p.r + 6),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: c.style === 'trail' ? 0.34 : 0.22,
      max: c.style === 'trail' ? 0.34 : 0.22,
      size: rand(1.4, 2.8),
      color: i % 2 ? c.primary : c.accent,
      glow: true,
    });
  }
}

function drawPlayer(p){
  const t=G.time;
  const walk=p.walkPhase||0;
  const moving=p.isMoving;
  const bob=moving?Math.abs(Math.sin(walk))*2.2:Math.sin(t*2.5)*0.9;
  const stealthAlpha = p._stealthT>0 ? 0.35 : 1;
  ctx.globalAlpha = stealthAlpha;
  drawTitleAura(p,t);
  hpix.shadow(ctx,p.x,p.y+17,18,7,0.4);
  /* hero locator ring — keeps the player findable in a crowded, lit scene */
  {
    const acc=(CLASSES[p.cls]||{}).accent||'#ffd54f';
    ctx.save();
    ctx.globalAlpha=0.55+0.12*Math.sin(t*3.2);
    ctx.beginPath();ctx.ellipse(p.x,p.y+16,p.r*2.0,p.r*0.92,0,0,TAU);
    ctx.strokeStyle='rgba(0,0,0,0.75)';ctx.lineWidth=3.6;ctx.stroke();
    ctx.strokeStyle='#e6f7ff';ctx.lineWidth=1.8;ctx.stroke();
    ctx.globalAlpha=0.30+0.10*Math.sin(t*3.2);
    ctx.strokeStyle=acc;ctx.lineWidth=3.2;ctx.stroke();
    ctx.restore();
  }
  hpix.hero(ctx,p.cls,p.x,p.y,{face:p.facing,moving,phase:walk/14,t,swing:p.swing>0?Math.min(1,p.swing/0.18):0,alpha:stealthAlpha,flash:p.hitFlash||0});
  ctx.globalAlpha=1;
  if(p._shieldT>0&&p._shieldAmt>0){
    ctx.save();ctx.globalAlpha=0.35+Math.sin(t*8)*0.1;
    ctx.strokeStyle=p._shieldColor||'#7fd4ff';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r+14,0,TAU);ctx.stroke();
    ctx.globalAlpha=0.15;ctx.fillStyle=p._shieldColor||'#7fd4ff';
    ctx.beginPath();ctx.arc(p.x,p.y,p.r+14,0,TAU);ctx.fill();ctx.restore();
  }
  if(p._reflectT>0){
    ctx.save();ctx.globalAlpha=0.5;
    ctx.strokeStyle='#7aff9a';ctx.lineWidth=2;
    for(let i=0;i<6;i++){
      const a=t*2+i*TAU/6;
      const r=p.r+22+Math.sin(t*4+i)*4;
      ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*(p.r+10),p.y+Math.sin(a)*(p.r+10));
      ctx.lineTo(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r);ctx.stroke();
    }
    ctx.restore();
  }
  if(p._whirlT>0){
    ctx.save();ctx.globalAlpha=0.4+Math.sin(t*20)*0.2;
    ctx.strokeStyle=p._whirlColor;ctx.lineWidth=3;
    const a=t*8;
    ctx.beginPath();ctx.arc(p.x,p.y,p._whirlR*0.85,a,a+1.2);ctx.stroke();
    ctx.beginPath();ctx.arc(p.x,p.y,p._whirlR*0.85,a+Math.PI,a+Math.PI+1.2);ctx.stroke();
    ctx.restore();
  }
  if(p.invuln>0){
    ctx.save();ctx.globalAlpha=0.5;ctx.strokeStyle=p.accent;ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r+10+Math.sin(t*30)*3,0,TAU);ctx.stroke();ctx.restore();
  }
  const pct=clamp(p.hp/p.maxHp,0,1);
  ctx.fillStyle='rgba(0,0,0,0.82)';roundRect(p.x-24,p.y-46,48,6,3);ctx.fill();
  if(pct>0){
    const grd=ctx.createLinearGradient(0,p.y-46,0,p.y-40);
    grd.addColorStop(0,pct>0.35?'#7dffa0':'#ff7a6b');
    grd.addColorStop(1,pct>0.35?'#22b04a':'#b01e1e');
    ctx.fillStyle=grd;roundRect(p.x-23,p.y-45,46*pct,4,2);ctx.fill();
  }
}
function drawMinion(m){
  if(m.ally){drawAlly(m);return}
  px.drawPixelSlime(ctx,m.x,m.y,m.wobble);
}
/* ===== Enemy sprites: unique silhouettes per type, with biome variants ===== */
const drawEnemyBody=(function(){
  const OL='rgba(10,5,14,0.75)',_shc={};
  const sh=(hex,p)=>{const k=hex+p;if(_shc[k])return _shc[k];
    const n=parseInt(hex.slice(1),16),r=n>>16,g=(n>>8)&255,b=n&255;
    const f=p>0?(x=>Math.round(x+(255-x)*p)):(x=>Math.round(x*(1+p)));
    return _shc[k]='rgb('+f(r)+','+f(g)+','+f(b)+')'};
  const hex7=c=>typeof c==='string'&&c.length===7&&c[0]==='#';
  const solid=c=>typeof c!=='string'||c[0]==='#';
  const eye=(x,y,s,col)=>{ctx.save();ctx.shadowColor=col;ctx.shadowBlur=10;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,s,0,TAU);ctx.fill();
    ctx.shadowBlur=0;ctx.globalAlpha=0.85;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,s*0.4,0,TAU);ctx.fill();ctx.restore()};
  const poly=(pts,fill)=>{let f=fill;
    if(hex7(fill)){let y0=1e9,y1=-1e9;for(const q of pts){if(q[1]<y0)y0=q[1];if(q[1]>y1)y1=q[1]}
      if(y1-y0>=7){const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,sh(fill,0.3));g.addColorStop(1,sh(fill,-0.38));f=g}}
    ctx.beginPath();pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();
    ctx.fillStyle=f;ctx.fill();if(solid(fill)){ctx.strokeStyle=OL;ctx.lineWidth=1.1;ctx.lineJoin='round';ctx.stroke()}};
  const line=(x1,y1,x2,y2,col,w)=>{ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
    if(w>2.6){ctx.strokeStyle=OL;ctx.lineWidth=w+1.6;ctx.stroke()}
    ctx.strokeStyle=col;ctx.lineWidth=w;ctx.stroke()};
  const circ=(x,y,r,fill)=>{let f=fill;
    if(hex7(fill)&&r>=4){const g=ctx.createRadialGradient(x-r*0.35,y-r*0.4,r*0.1,x,y,r*1.05);g.addColorStop(0,sh(fill,0.4));g.addColorStop(0.55,fill);g.addColorStop(1,sh(fill,-0.42));f=g}
    ctx.fillStyle=f;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
    if(r>=2.5&&solid(fill)){ctx.strokeStyle=OL;ctx.lineWidth=1.1;ctx.stroke()}};
  const ell=(x,y,rx,ry,fill)=>{let f=fill;
    if(hex7(fill)&&ry>=4){const g=ctx.createLinearGradient(0,y-ry,0,y+ry);g.addColorStop(0,sh(fill,0.3));g.addColorStop(1,sh(fill,-0.4));f=g}
    ctx.fillStyle=f;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();
    if(ry>=2&&solid(fill)){ctx.strokeStyle=OL;ctx.lineWidth=1;ctx.stroke()}};
  const rrf=(x,y,w,h,r,fill)=>{roundRect(x,y,w,h,r);let f=fill;
    if(hex7(fill)&&h>=8){const g=ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,sh(fill,0.3));g.addColorStop(1,sh(fill,-0.38));f=g}
    ctx.fillStyle=f;ctx.fill();ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.stroke()};
  const grad=(c,d,y0,y1)=>{const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,c);g.addColorStop(1,d);return g};
  const S={};

  S.fallen=o=>{const{c,d,t}=o;const sw=Math.sin(t*5)*2;
    poly([[-10,-12],[10,-12],[14,16],[9,11],[5,17],[0,11],[-5,17],[-9,11],[-14,16]],grad(c,d,-12,17));
    line(8,-6,19,-3+sw,'#a89a8a',3);line(-8,-6,-18,-1-sw,'#a89a8a',3);
    circ(0,-19,7,'#a89a8a');ctx.fillStyle=d;ctx.beginPath();ctx.arc(0,-20,8.5,Math.PI,TAU);ctx.fill();
    eye(-2.5,-18,1.5,'#ff4a4a');eye(2.5,-18,1.5,'#ff4a4a');};

  S.skeleton=o=>{const B=o.B;
    const bone=B==='frost'?'#d6efff':B==='shadow'?'#6a5a96':B==='caverns'?'#bdb590':'#ece6d0';
    const glow=B==='frost'?'#7fd4ff':B==='shadow'?'#d09aff':B==='caverns'?'#ffb040':'#ff5252';
    ctx.save();if(B==='shadow')ctx.globalAlpha=0.85;
    line(-4,10,-5,18,bone,2.6);line(4,10,5,18,bone,2.6);
    rrf(-8,-12,16,22,4,'#14100c');
    for(let i=0;i<4;i++)line(-7,-9+i*5,7,-9+i*5,bone,1.7);
    line(0,-12,0,10,bone,1.7);line(8,-8,14,-2,bone,2.4);line(-8,-8,-13,0,bone,2.4);
    if(B==='frost'){poly([[13,-2],[16,-22],[19,-2]],'#9fe0ff');poly([[16,-22],[17,-4],[19,-2]],'#e8f8ff')}
    else if(B==='caverns'){line(14,-2,20,-16,'#6a4a2a',3.5);circ(21,-18,4.5,'#7a7a72')}
    else if(B==='shadow'){ctx.strokeStyle='#b080ff';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(16,-14,10,-1.9,0.5);ctx.stroke();line(14,-4,16,16,'#3a2a5a',2.2)}
    else{line(14,-2,22,-14,'#8a8f94',3);line(12,-4,17,-1,'#6a4a2a',3)}
    circ(0,-19,7,bone);ctx.fillStyle=bone;ctx.fillRect(-4,-14,8,4);
    circ(-2.7,-19,2,'#0a0808');circ(2.7,-19,2,'#0a0808');eye(-2.7,-19,1,glow);eye(2.7,-19,1,glow);
    if(B==='frost'){poly([[-9,-12],[-13,-21],[-6,-14]],'#bfeaff');poly([[9,-12],[13,-21],[6,-14]],'#bfeaff')}
    if(B==='caverns'){circ(-6,-9,3,'#5a6a4a');ctx.fillStyle='#6a6a70';ctx.beginPath();ctx.arc(0,-21,7.5,Math.PI,TAU);ctx.fill()}
    if(B==='shadow')ell(0,19,10,3,'rgba(140,80,255,0.35)');
    ctx.restore();};

  S.archer=o=>{const{c,d}=o;
    poly([[-9,-12],[9,-12],[11,17],[-11,17]],grad(c,d,-12,17));line(-9,0,9,0,'#5a3a1a',2);
    circ(0,-19,8,d);circ(0,-18,5.5,'#caa27a');eye(-2,-18,1,'#ffe082');eye(2,-18,1,'#ffe082');
    ctx.strokeStyle='#8a5a2a';ctx.lineWidth=2.6;ctx.beginPath();ctx.arc(10,-1,14,-1.15,1.15);ctx.stroke();
    line(15.7,-13.7,15.7,11.7,'#e8e0c0',1);line(5,-1,22,-1,'#c8b890',1.8);poly([[22,-3],[26,-1],[22,1]],'#cfd8dc');};

  S.brute=o=>{const{B,c,d,t}=o;const lava=B==='volcano';
    ell(0,2,13,15,grad(c,d,-12,18));
    const rk=lava?'#5a1a0a':'#7a6a5a';circ(-13,-7,7,rk);circ(13,-7,7,rk);
    circ(-15,-9,2.5,lava?'#ff7a30':'#a89886');circ(15,-9,2.5,lava?'#ff7a30':'#a89886');
    circ(0,-16,6.5,lava?'#c0401a':'#8a7a62');
    if(lava){poly([[-5,-20],[-11,-31],[-2,-23]],'#1a0500');poly([[5,-20],[11,-31],[2,-23]],'#1a0500');
      ctx.save();ctx.globalAlpha=0.55+0.4*Math.sin(t*4);line(-4,-2,2,4,'#ffb040',2);line(2,4,-1,11,'#ffb040',2);line(6,-4,9,3,'#ffb040',1.6);ctx.restore()}
    else{poly([[-3,-12],[-6,-5],[-1,-11]],'#ece6d0');poly([[3,-12],[6,-5],[1,-11]],'#ece6d0');circ(7,-3,3,'#4a6a3a');circ(-6,6,2,'#9a8a76')}
    circ(-17,8,6,d);circ(17,8,6,d);eye(-2.5,-16,1.5,lava?'#ffd54f':'#ff5252');eye(2.5,-16,1.5,lava?'#ffd54f':'#ff5252');};

  S.spider=o=>{const{B,c,d,t}=o;
    const ec=B==='shadow'?'#c080ff':B==='caverns'?'#ffb040':'#ff5252';
    for(let i=0;i<4;i++)for(const s of[-1,1]){const w=Math.sin(t*12+i*1.3)*2;
      ctx.strokeStyle=d;ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(s*3,-1+i*2);
      ctx.lineTo(s*(10+i),-9+i*5+w);ctx.lineTo(s*(16+i*2),3+i*5);ctx.stroke()}
    ell(0,4,8,9.5,grad(c,d,-5,14));circ(0,-6,5,d);
    if(B==='crypt'){circ(0,4,3.5,'#e6e0cc');circ(-1.3,3.4,0.9,'#222');circ(1.3,3.4,0.9,'#222')}
    if(B==='caverns'){poly([[-2,-2],[-1.5,2],[-0.5,-2]],'#ece6d0');poly([[2,-2],[1.5,2],[0.5,-2]],'#ece6d0')}
    for(const[x,y,s]of[[-2.5,-8,1.3],[2.5,-8,1.3],[-1,-5.5,1],[1,-5.5,1]])eye(x,y,s,ec);
    if(B==='shadow')ell(0,4,12,12,'rgba(150,90,255,0.18)');};

  S.golem=o=>{const{c,d,t}=o;
    rrf(-12,-12,24,28,5,c);
    rrf(-7,-23,14,11,3,d);
    rrf(-20,-2,8,14,3,c);rrf(12,-2,8,14,3,c);
    line(-6,-8,-2,0,'#1a120a',1.5);line(5,4,9,12,'#1a120a',1.5);
    ctx.save();ctx.globalAlpha=0.7+0.3*Math.sin(t*4);circ(0,3,4.5,'#ffb040');ctx.restore();
    eye(-3,-18,1.6,'#ffb040');eye(3,-18,1.6,'#ffb040');};

  S.bomber=o=>{const{B,d,t}=o;const lava=B==='volcano';
    ell(-5,16,4,2,d);ell(5,16,4,2,d);
    circ(0,4,11,lava?grad('#ff8a30','#8a2a10',-8,14):grad('#3a3a3a','#101010',-8,14));
    if(lava){ctx.save();ctx.globalAlpha=0.5+0.4*Math.sin(t*6);line(-5,0,0,6,'#ffd54f',2);line(0,6,6,2,'#ffd54f',2);ctx.restore()}
    else{line(-10,4,10,4,'#6a4a2a',2.2);circ(-6,4,1.2,'#aaa');circ(6,4,1.2,'#aaa')}
    line(0,-7,3,-13,'#8a6a3a',2);eye(3,-14,2+Math.sin(t*30),'#ffd54f');
    if(lava){circ(0,-11,6,'#c0401a');poly([[-4,-15],[-7,-21],[-1,-16]],'#2a0a00');poly([[4,-15],[7,-21],[1,-16]],'#2a0a00')}
    else{circ(0,-11,6,'#6a9a3a');poly([[-5,-12],[-13,-15],[-5,-8]],'#6a9a3a');poly([[5,-12],[13,-15],[5,-8]],'#6a9a3a')}
    eye(-2.3,-11,1.3,'#ffe082');eye(2.3,-11,1.3,'#ffe082');};

  S.sniper=o=>{const{c,d}=o;
    poly([[-9,-12],[9,-12],[12,17],[-12,17]],grad(c,d,-12,17));
    circ(0,-19,8,d);circ(0,-18,5,'#1a1020');eye(0,-18,1.8,'#ff5252');
    line(-6,2,27,-3,'#2a2020',3.5);circ(14,-4.5,2,'#7fd4ff');line(24,-3,28,-3,'#cfd8dc',2);};

  S.iceElemental=o=>{const{t}=o;ctx.save();ctx.translate(0,Math.sin(t*3)*3);
    poly([[0,-22],[10,0],[0,22],[-10,0]],grad('#e8f8ff','#5aa8d8',-22,22));
    poly([[0,-22],[3,0],[0,22]],'rgba(255,255,255,0.35)');
    poly([[-9,-4],[-20,-14],[-12,4]],'#9fe0ff');poly([[9,-4],[20,-14],[12,4]],'#9fe0ff');
    ctx.save();ctx.globalAlpha=0.6+0.3*Math.sin(t*5);circ(0,0,5,'#ffffff');ctx.restore();
    for(let i=0;i<4;i++){const a=t*2+i*TAU/4,x=Math.cos(a)*19,y=Math.sin(a)*9;poly([[x,y-4],[x+2.5,y],[x,y+4],[x-2.5,y]],'#cfeeff')}
    ctx.restore();};

  S.fireImp=o=>{const{c,d,t}=o;const fl=Math.sin(t*14);
    poly([[-3,-2],[-20,-12-fl*2],[-16,0],[-11,-2],[-8,5]],d);poly([[3,-2],[20,-12-fl*2],[16,0],[11,-2],[8,5]],d);
    line(0,8,-8,14,c,3);poly([[-8,14],[-12,18+fl*2],[-5,17]],'#ffb040');
    ell(0,0,7,9,grad('#ff7a30',c,-8,9));circ(0,-11,6,c);
    poly([[-4,-15],[-7,-22],[-1,-16]],'#2a0a00');poly([[4,-15],[7,-22],[1,-16]],'#2a0a00');
    poly([[-2,-16],[0,-23-fl*2],[2,-16]],'rgba(255,200,60,0.8)');
    eye(-2.3,-11,1.4,'#ffe082');eye(2.3,-11,1.4,'#ffe082');};

  S.wraith=o=>{const{B,t}=o;const ice=B==='frost';
    const a=ice?'#d6f2ff':'#7a4acc',b=ice?'#7fb8e0':'#2a0a4a';
    ctx.save();ctx.globalAlpha=0.82;
    ctx.fillStyle=grad(a,b,-14,22);ctx.beginPath();ctx.moveTo(-10,-6);ctx.arc(0,-8,10,Math.PI,TAU);ctx.lineTo(11,14);
    for(let i=0;i<5;i++){const x=11-i*5.5;ctx.lineTo(x-2.7,22+Math.sin(t*6+i)*2.5);ctx.lineTo(x-5.5,15)}
    ctx.closePath();ctx.fill();
    line(-9,0,-17,6+Math.sin(t*5)*2,a,2);line(9,0,17,6-Math.sin(t*5)*2,a,2);
    ctx.restore();
    ell(-3.5,-8,2.5,3.5,'#05020a');ell(3.5,-8,2.5,3.5,'#05020a');
    eye(-3.5,-8,1.1,ice?'#ffffff':'#d09aff');eye(3.5,-8,1.1,ice?'#ffffff':'#d09aff');
    if(ice){poly([[-8,-16],[-6,-25],[-3,-17]],'#e8f8ff');poly([[-2,-17],[0,-27],[2,-17]],'#e8f8ff');poly([[3,-17],[6,-25],[8,-16]],'#e8f8ff')}};

  S.healer=o=>{const{t}=o;
    poly([[-9,-12],[9,-12],[12,17],[-12,17]],grad('#e8f5e8','#7aff9a',-12,17));
    line(0,-5,0,6,'#2a8a4a',2.5);line(-4,0,4,0,'#2a8a4a',2.5);
    circ(0,-19,7.5,'#d8f0d8');circ(0,-18,5,'#caa27a');eye(-2,-18,1,'#2a5a2a');eye(2,-18,1,'#2a5a2a');
    ctx.strokeStyle='#ffd54f';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-29,8,3,0,0,TAU);ctx.stroke();
    line(14,-24,14,18,'#8a6a3a',2.5);ctx.save();ctx.globalAlpha=0.7+0.3*Math.sin(t*4);circ(14,-27,4.5,'#7aff9a');ctx.restore();};

  S.shaman=o=>{const{B,c,d,t}=o;const lava=B==='volcano';
    poly([[-9,-12],[9,-12],[13,17],[-13,17]],grad(c,d,-12,17));line(-10,6,10,6,lava?'#ffb040':'#c0a0e0',2);
    if(lava){circ(0,-19,7,'#8a2a10');poly([[-5,-23],[-10,-33],[-2,-25]],'#1a0500');poly([[5,-23],[10,-33],[2,-25]],'#1a0500');eye(-2.5,-19,1.5,'#ffd54f');eye(2.5,-19,1.5,'#ffd54f')}
    else{circ(0,-19,7,'#e0dac8');circ(-2.8,-19,2,'#1a0a2a');circ(2.8,-19,2,'#1a0a2a');eye(-2.8,-19,1,'#d09aff');eye(2.8,-19,1,'#d09aff')}
    line(15,-20,15,18,'#5a3a1a',2.6);
    if(lava){const f=Math.sin(t*14);poly([[10,-20],[15,-34-f*2],[20,-20]],'#ff7a30');poly([[12,-20],[15,-28],[18,-20]],'#ffd54f')}
    else{ctx.save();ctx.shadowColor='#b060ff';ctx.shadowBlur=10;circ(15,-25,6,'#8e44ad');ctx.restore();circ(13,-25,1.3,'#1a0a2a');circ(17,-25,1.3,'#1a0a2a')}};

  S.mage=o=>{const{c,d,t}=o;
    poly([[-9,-10],[9,-10],[12,17],[-12,17]],grad(c,d,-10,17));
    circ(0,-17,6,'#caa27a');eye(-2,-17,1,'#1a3a6a');eye(2,-17,1,'#1a3a6a');
    poly([[-11,-21],[11,-21],[0,-40]],d);ell(0,-21,12,3,d);circ(0,-26,1.6,'#ffd54f');
    poly([[-4,-12],[4,-12],[0,-3]],'#e8e8e8');
    const y=-6+Math.sin(t*3)*3;ctx.save();ctx.shadowColor='#5aa9ff';ctx.shadowBlur=12;circ(17,y,5,'#8ac8ff');ctx.restore();};

  S.charger=o=>{const{c,d,t}=o;const w=Math.sin(t*14)*2;
    for(const x of[-9,-4,6,11])line(x,6,x+(x>0?w:-w),17,d,3);
    ell(-1,2,15,10,grad(c,d,-8,12));circ(13,0,8,d);
    poly([[17,2],[27,5],[19,7]],'#ece6d0');poly([[17,-3],[27,-7],[19,-6]],'#ece6d0');
    poly([[10,-7],[8,-16],[14,-8]],'#1a0500');
    ctx.save();ctx.globalAlpha=0.55+0.4*Math.sin(t*5);line(-8,-3,-2,2,'#ffb040',2);line(2,-4,6,3,'#ffb040',2);ctx.restore();
    eye(15,-2,1.7,'#ffd54f');};

  /* bosses */
  S.cryptLord=o=>{const{t}=o;
    poly([[-17,-6],[17,-6],[24,26],[14,20],[8,28],[0,20],[-8,28],[-14,20],[-24,26]],grad('#3a1a4a','#120818',-6,28));
    rrf(-9,-10,18,24,5,'#1a0f20');
    for(let i=0;i<5;i++)line(-7,-7+i*4.5,7,-7+i*4.5,'#d8d0b8',1.8);
    circ(-12,-8,6,'#d8d0b8');circ(12,-8,6,'#d8d0b8');
    line(-12,-6,-20,6,'#d8d0b8',3.5);line(12,-6,22,0,'#d8d0b8',3.5);
    line(23,-24,23,24,'#5a3a1a',3);ctx.strokeStyle='#cfd8dc';ctx.lineWidth=3.5;ctx.beginPath();ctx.arc(14,-22,9,-0.35,2.5);ctx.stroke();
    circ(0,-20,10,'#ece6d0');ctx.fillStyle='#ece6d0';ctx.fillRect(-5,-12,10,5);
    circ(-4,-21,3,'#0a0808');circ(4,-21,3,'#0a0808');eye(-4,-21,1.6,'#ff3a3a');eye(4,-21,1.6,'#ff3a3a');
    poly([[-9,-27],[-8,-38],[-4,-29],[0,-40],[4,-29],[8,-38],[9,-27]],'#d4af37');
    for(let i=0;i<3;i++){const a=t*1.5+i*TAU/3,x=Math.cos(a)*30,y=Math.sin(a)*12-6;circ(x,y,4.5,'#ece6d0');circ(x-1.5,y,1,'#222');circ(x+1.5,y,1,'#222')}};

  S.cavernTitan=o=>{const{t}=o;
    rrf(-15,-12,30,32,6,'#7a6a58');
    circ(-19,-8,9,'#6a5a48');circ(19,-8,9,'#6a5a48');
    poly([[-23,-14],[-19,-32],[-14,-14]],'#6ad8ff');poly([[14,-14],[19,-30],[23,-14]],'#ffb040');poly([[-6,-14],[-2,-28],[2,-14]],'#6ad8ff');
    rrf(-7,-27,14,13,3,'#5a4a3a');
    eye(-3,-21,1.8,'#ffb040');eye(3,-21,1.8,'#ffb040');
    ctx.save();ctx.globalAlpha=0.6+0.4*Math.sin(t*3);line(-8,-4,-2,6,'#ffb040',2);line(-2,6,-6,16,'#ffb040',2);line(8,-2,5,8,'#ffb040',2);ctx.restore();
    circ(-24,10,8.5,'#4a3a2a');circ(24,10,8.5,'#4a3a2a');};

  S.frostWyrm=o=>{const{t}=o;
    for(let i=6;i>=1;i--){const x=-i*9,y=Math.sin(t*3+i*0.8)*5,r=14-i*1.4;
      circ(x,y,r,grad('#9fe0ff','#2a4a6a',y-r,y+r));poly([[x-4,y-r+1],[x,y-r-9],[x+4,y-r+1]],'#e8f8ff')}
    const hy=Math.sin(t*3)*3;
    ell(8,hy,16,12,grad('#bfeaff','#3a6a9a',hy-12,hy+12));poly([[18,hy+1],[34,hy+4],[18,hy+9]],'#7fb8e0');
    poly([[2,hy-10],[-4,hy-24],[8,hy-12]],'#e8f8ff');poly([[10,hy-10],[8,hy-26],[17,hy-10]],'#e8f8ff');
    eye(14,hy-4,2.4,'#ffffff');
    ctx.save();ctx.globalAlpha=0.35;for(let i=0;i<3;i++)circ(34+i*7+((t*20)%7),hy+5+Math.sin(t*6+i)*2,3+i,'#dff4ff');ctx.restore();};

  S.volcanoBehemoth=o=>{const{t}=o;
    ell(0,4,22,18,grad('#8a2a10','#2a0a00',-14,22));
    ctx.save();ctx.globalAlpha=0.55+0.4*Math.sin(t*3);line(-10,-2,-4,8,'#ffb040',2.5);line(-4,8,-9,17,'#ffb040',2.5);line(9,-4,6,9,'#ffb040',2.5);line(6,9,12,16,'#ffb040',2.5);ctx.restore();
    circ(0,-14,12,'#5a1a0a');
    poly([[-8,-20],[-24,-40],[-14,-17]],'#1a0500');poly([[8,-20],[24,-40],[14,-17]],'#1a0500');
    poly([[-22,-37],[-24,-40],[-19,-36]],'#ff7a30');poly([[22,-37],[24,-40],[19,-36]],'#ff7a30');
    eye(-4.5,-15,2.4,'#ffd54f');eye(4.5,-15,2.4,'#ffd54f');
    ctx.save();ctx.globalAlpha=0.7;ell(0,-8,5,2,'#ff7a30');ctx.restore();
    circ(-25,8,9,'#5a1a0a');circ(25,8,9,'#5a1a0a');
    ctx.save();for(let i=0;i<6;i++){const k=(t*30+i*17)%44;ctx.globalAlpha=1-k/44;circ(Math.sin(i*3+t)*20,-26-k,1.7,'#ffb040')}ctx.restore();};

  S.shadowPrince=o=>{const{t}=o;ctx.save();ctx.globalAlpha=0.95;
    poly([[-9,-10],[9,-10],[17,24],[9,18],[0,29],[-9,18],[-17,24]],grad('#5a2a9a','#0a0414',-10,29));
    ell(0,-1,6,11,'#14081f');
    poly([[-8,-27],[-9,-39],[-3,-29],[0,-41],[3,-29],[9,-39],[8,-27]],'#2a0a4a');
    circ(0,-20,8,'#1a0a2a');eye(-3,-20,1.9,'#d09aff');eye(3,-20,1.9,'#d09aff');
    line(-8,-6,-18,4,'#2a0a4a',3);line(8,-6,18,4,'#2a0a4a',3);
    ctx.restore();
    for(let i=0;i<3;i++){const a=t*1.8+i*TAU/3,x=Math.cos(a)*28,y=Math.sin(a)*11-6;
      ctx.save();ctx.shadowColor='#a060ff';ctx.shadowBlur=14;circ(x,y,5,'#2a0a4a');ctx.restore()}};


  /* ── Angkor-era mythical bosses. These override the generic silhouettes
        below: Naga Raja, Kumbhakarna, Garuda, Kala, Krong Reap. ── */

  /* Naga Raja — five-hooded serpent sovereign of the causeway */
  S.cryptLord=o=>{const{t}=o;const sway=Math.sin(t*1.6)*2;
    ctx.save();
    /* coiled lower body */
    ell(0,18,15,7,'#2e1a10');ell(7,13,12,6,'#3a2214');ell(-6,9,11,6,'#452a18');
    /* body arching up to the hoods */
    poly([[-8,10],[-6,-8],[-2,-20],[6,-20],[7,2],[8,14]],'#4a2c18');
    poly([[-6,-6],[-3,-18],[4,-18],[5,-4]],'#6b4020');
    /* scale banding */
    for(let i=0;i<6;i++){line(-7+i*2.4,8-i*4,6+i*1.6,10-i*4,'rgba(0,0,0,0.35)',1.4)}
    /* five hoods fanned */
    const heads=[[-19,-30,-16],[-10,-38,-6],[0,-44,0],[10,-38,6],[19,-30,16]];
    for(const [hx,hy,rot] of heads){
      ctx.save();ctx.translate(hx+sway*0.3,hy);ctx.rotate(rot*Math.PI/180);
      ell(0,0,7,9,'#3f2513');            /* hood */
      ell(0,-1,5.2,7,'#b06f2c');         /* hood highlight */
      ell(0,3,4.2,4,'#d08c46');          /* snout */
      eye(-2.1,-2.4,1.5,'#ffd54f');eye(2.1,-2.4,1.5,'#ffd54f');
      line(-0.6,5,0,9,'#e04040',1.4);line(0.6,5,1.4,9,'#e04040',1.4);  /* tongue */
      ctx.restore();
    }
    /* gold crown on the centre head */
    poly([[-6,-51],[6,-51],[5,-46],[-5,-46]],'#e8b53a');
    line(-3,-51,-3,-54,'#e8b53a',1.4);line(0,-51,0,-55,'#e8b53a',1.4);line(3,-51,3,-54,'#e8b53a',1.4);
    /* naga crest fins */
    poly([[-13,-24],[-20,-32],[-11,-29]],'#a8501e');poly([[13,-24],[20,-32],[11,-29]],'#a8501e');
    ctx.restore();};

  /* Kumbhakarna — the asura colossus, temple-crushing club and all */
  S.cavernTitan=o=>{const{t}=o;const br=Math.sin(t*1.2)*1.2;
    ctx.save();
    /* legs + loincloth */
    poly([[-11,24],[-4,24],[-3,10],[-12,10]],'#3a2414');
    poly([[11,24],[4,24],[3,10],[12,10]],'#3a2414');
    poly([[-10,12],[10,12],[13,22],[0,25],[-13,22]],'#8a2f1a');
    /* torso: broad shoulders over a heavy gut */
    poly([[-19,-14],[-13,-24],[13,-24],[19,-14],[16,2],[10,10],[-10,10],[-16,2]],'#6a4020');
    ell(0,2,11+br*0.4,9,'#7d4c26');               /* belly */
    ell(0,2,7,5.5,'#94602f');
    /* pecs + abs shading */
    line(-6,-8,6,-8,'rgba(0,0,0,0.3)',1.6);
    line(0,-4,0,8,'rgba(0,0,0,0.25)',1.4);
    /* arms */
    line(-17,-12,-24,2,'#6a4020',5);line(-24,2,-22,12,'#5a351a',4);
    line(17,-12,24,-4,'#6a4020',5);line(24,-4,21,8,'#5a351a',4);
    /* club */
    line(22,6,30,-30,'#5a3a18',4);
    ell(31,-34,7,8,'#7d5a2a');ell(31,-34,4,5,'#9a7440');
    /* head, tusks, crown */
    circ(0,-30,8.5,'#7d4c26');
    poly([[-8,-30],[-3,-38],[0,-42],[3,-38],[8,-30]],'#3a2414');  /* hair */
    ell(0,-27,6,5,'#a06a38');                                     /* muzzle */
    eye(-3,-31.5,1.6,'#ff7a2e');eye(3,-31.5,1.6,'#ff7a2e');
    poly([[-5,-25],[-3,-25],[-4,-21]],'#f0e6c8');poly([[5,-25],[3,-25],[4,-21]],'#f0e6c8');  /* tusks */
    poly([[-7,-39],[7,-39],[6,-35],[-6,-35]],'#c8952e');          /* crown */
    ctx.restore();};

  /* Garuda — bird-king of the sky peak, wings spread */
  S.frostWyrm=o=>{const{t}=o;const flap=Math.sin(t*2.4)*0.14;
    ctx.save();
    /* tail feathers */
    poly([[-4,20],[-9,30],[0,24],[4,20]],'#2a5a7a');poly([[4,20],[9,30],[0,24]],'#2a5a7a');
    /* wings: layered primaries, animated */
    for(const dir of [-1,1]){
      ctx.save();ctx.rotate(dir*flap*0.5);
      poly([[dir*6,-16],[dir*34,-30],[dir*42,-18],[dir*30,-12],[dir*36,-4],[dir*24,0],[dir*28,8],[dir*10,6]],'#2f6f96');
      poly([[dir*7,-14],[dir*28,-24],[dir*34,-14],[dir*22,-8]],'#4b93bd');
      poly([[dir*8,-8],[dir*24,-2],[dir*20,8],[dir*9,6]],'#6fb6dc');
      ctx.restore();
    }
    /* body */
    ell(0,-4,9,15,'#3d7fa6');
    ell(0,2,6,9,'#e8e0c8');                        /* pale chest */
    /* talons */
    line(-4,12,-6,20,'#d8a53a',2.4);line(4,12,6,20,'#d8a53a',2.4);
    line(-6,20,-9,23,'#d8a53a',1.8);line(-6,20,-3,24,'#d8a53a',1.8);
    line(6,20,9,23,'#d8a53a',1.8);line(6,20,3,24,'#d8a53a',1.8);
    /* head, beak, crest */
    circ(0,-28,7.5,'#4b93bd');
    poly([[-6,-31],[-2,-33],[0,-46],[2,-33],[6,-31]],'#e8b53a');   /* crest */
    poly([[-2,-27],[2,-27],[0,-20]],'#e8b53a');                    /* beak */
    eye(-3.4,-30,1.7,'#ffffff');eye(3.4,-30,1.7,'#ffffff');
    /* third eye jewel */
    circ(0,-34,1.8,'#7ff0ff');
    ctx.restore();};

  /* Kala — the devouring face carved over every temple gate */
  S.volcanoBehemoth=o=>{const{t}=o;const jaw=0.5+0.5*Math.sin(t*2.2);
    ctx.save();
    /* flame mane: curled tongues, hot core -> orange -> dark edge, with a
       slight upward bias so it reads as fire instead of a spiked halo */
    const tongue=(a,len,wid,fill)=>{
      const bx=Math.cos(a)*12.5, by=Math.sin(a)*12.5-12;
      const tx=Math.cos(a)*(12.5+len), ty=Math.sin(a)*(12.5+len)-12-1.5;
      const nx=-Math.sin(a), ny=Math.cos(a);
      ctx.beginPath();
      ctx.moveTo(bx+nx*wid, by+ny*wid);
      ctx.quadraticCurveTo((bx+tx)/2+nx*wid*1.9, (by+ty)/2+ny*wid*1.9, tx, ty);
      ctx.quadraticCurveTo((bx+tx)/2-nx*wid*1.1, (by+ty)/2-ny*wid*1.1, bx-nx*wid, by-ny*wid);
      ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
    };
    ctx.save(); ctx.shadowColor='#ff6a20'; ctx.shadowBlur=13;
    for(let i=0;i<9;i++){
      const a=Math.PI+0.06+(i/8)*(Math.PI-0.12);
      const up=0.55+0.45*Math.max(0,-Math.sin(a));       /* longer at the top */
      const flick=Math.sin(t*3.2+i*1.9)*0.18;
      const len=(15*up+6)*(1+flick);
      tongue(a,len,4.6,i%2?'#8f2408':'#a82c0a');
      tongue(a,len*0.72,3.1,i%2?'#e2521a':'#ef6a20');
      tongue(a,len*0.38,1.8,'#ffc45a');
    }
    ctx.restore();
    /* embers drifting out of the mouth */
    for(let i=0;i<6;i++){
      const ph=(t*0.8+i/6)%1;
      circ(Math.sin(i*2.1+t)*9, -2+ph*16, 1.6*(1-ph), 'rgba(255,150,60,'+(0.85*(1-ph)).toFixed(2)+')');
    }
    /* face plate */
    circ(0,-12,17,'#6a2a14');
    circ(0,-12,14,'#8a3a18');
    /* brows + eyes */
    poly([[-12,-22],[-3,-25],[-2,-20],[-11,-18]],'#3a1408');
    poly([[12,-22],[3,-25],[2,-20],[11,-18]],'#3a1408');
    ell(-6,-16,3.6,2.8,'#ffd54f');ell(6,-16,3.6,2.8,'#ffd54f');
    circ(-6,-16,1.3,'#2a0a04');circ(6,-16,1.3,'#2a0a04');
    /* gaping mouth with fangs */
    ell(0,-3,12,6+jaw*4,'#2a0804');
    ell(0,-3,9,4+jaw*3,'#5a0e06');
    for(let i=-2;i<=2;i++){
      poly([[i*4-1.6,-7],[i*4+1.6,-7],[i*4,-2.5]],'#f5eccf');
      poly([[i*4-1.4,2.5],[i*4+1.4,2.5],[i*4,6]],'#f5eccf');
    }
    line(0,-14,0,-9,'#c8952e',1.6);                 /* nose ridge */
    /* crown of skulls */
    poly([[-8,-27],[8,-27],[6,-23],[-6,-23]],'#e8b53a');
    for(let i=-1;i<=1;i++){circ(i*5,-30,2.2,'#f0e6c8')}
    ctx.restore();};

  /* Krong Reap — ten-headed demon king of the shadow sanctum */
  S.shadowPrince=o=>{const{t}=o;const sw=Math.sin(t*1.4)*0.08;
    ctx.save();
    /* cloak */
    poly([[-14,-18],[14,-18],[22,22],[8,16],[0,26],[-8,16],[-22,22]],'#2a0f4a');
    poly([[-11,-14],[11,-14],[15,20],[0,14],[-15,20]],'#3d1668');
    /* staff with a skull finial */
    line(-17,10,-19,-30,'#6a4a20',3);
    circ(-19,-33,4.5,'#c8952e');circ(-19,-33,2.2,'#1a0a24');
    /* ten heads: two fanned rows of five */
    const rows=[[-30,8],[-40,10]];
    rows.forEach(([ry,rr],ri)=>{
      for(let i=-2;i<=2;i++){
        const hx=i*rr*0.9+sw*10*(ri?1:-1), hy=ry-Math.abs(i)*3.4;
        ell(hx,hy,4.6,5.6,ri?'#2a0f4a':'#3d1668');
        eye(hx-1.5,hy-0.6,1.05,'#d09aff');eye(hx+1.5,hy-0.6,1.05,'#d09aff');
        /* fangs */
        poly([[hx-1.6,hy+4],[hx-0.4,hy+4],[hx-1,hy+6.4]],'#f0e6c8');
        poly([[hx+1.6,hy+4],[hx+0.4,hy+4],[hx+1,hy+6.4]],'#f0e6c8');
      }
    });
    /* central crown spire */
    poly([[0,-46],[-4,-56],[0,-52],[4,-56]],'#e8b53a');
    /* arms */
    line(-12,-10,-24,2,'#2a0f4a',4);line(12,-10,24,2,'#2a0f4a',4);
    /* aura orbs */
    for(let i=0;i<4;i++){
      const a=t*1.5+i*TAU/4;
      circ(Math.cos(a)*27,Math.sin(a)*10-10,3.2,'rgba(160,96,255,0.5)');
    }
    ctx.restore();};


  /* Airavata — the three-headed white elephant that carries the storm.
     Elephant anatomy reads almost entirely from the head and trunk, so the
     heads are spread wide with one clear curved trunk each; the body is kept
     small behind them. */
  S.airava=o=>{const{t}=o;const sway=Math.sin(t*1.1)*1.4;
    ctx.save();
    /* howdah sits behind the heads, not on top of them */
    poly([[-16,-4],[16,-4],[13,-12],[-13,-12]],'#c8952e');
    poly([[-19,-12],[19,-12],[14,-19],[-14,-19]],'#e8b53a');
    circ(0,-21,3.2,'#ffe9a8');
    /* body and legs (kept low so the heads own the silhouette) */
    ell(0,8,20,9,'#b3c6d0');
    ell(0,11,16,6,'#93a8b6');
    for(const lx of [-13,-5,5,13]) line(lx,14,lx,24,'#8fa4b2',5);
    line(-20,8,-25,15,'#8fa4b2',2.2);
    /* one head: ears, face, trunk, tusks */
    const head=(hx,hy,sc)=>{
      ctx.save();ctx.translate(hx+sway*0.5,hy);ctx.scale(sc,sc);
      ell(-9.4,-1,5.2,6.4,'#aabecb');           /* ears */
      ell(9.4,-1,5.2,6.4,'#aabecb');
      ell(-9.4,-1,2.9,3.4,'#8fa4b2');
      ell(9.4,-1,2.9,3.4,'#8fa4b2');
      circ(0,0,9,'#cfdde5');                    /* face */
      ell(0,4.5,6,4.2,'#b9cad4');               /* brow over the trunk root */
      /* trunk: thick at the mouth, curling forward and tapering */
      ctx.beginPath();
      ctx.moveTo(-2.8,5);
      ctx.quadraticCurveTo(-2.2,13,-7.5,18);
      ctx.lineTo(-3.6,19.6);
      ctx.quadraticCurveTo(2.8,13.5,2.8,5);
      ctx.closePath();
      ctx.fillStyle='#cfdde5';ctx.fill();
      ctx.strokeStyle='#3a4a58';ctx.lineWidth=1.2;ctx.stroke();
      /* tusks, clearly in front of the trunk root */
      poly([[-5.2,4.4],[-7.6,4.4],[-6.4,11]],'#fffdf0');
      poly([[5.2,4.4],[7.6,4.4],[6.4,11]],'#fffdf0');
      /* eyes + lotus mark */
      eye(-3.6,-2.4,1.5,'#7a4a10');eye(3.6,-2.4,1.5,'#7a4a10');
      circ(0,-6,2.1,'#ff6a2e');
      ctx.restore();
    };
    head(-25,-5,0.86);
    head(0,-17,1.06);
    head(25,-5,0.86);
    /* storm between the heads */
    for(let i=0;i<3;i++){
      const a=t*2.2+i*2.1;
      line(Math.cos(a)*7,-26+Math.sin(a)*3,Math.cos(a)*7+3.5,-22+Math.sin(a)*3,'#bfe8ff',1.5);
    }
    ctx.restore();};

  const AMB={crypt:['#9a6aff','#7aff9a'],caverns:['#ffb040','#d8b878'],frost:['#7fd4ff','#ffffff'],volcano:['#ff6a20','#ffd54f'],shadow:['#a060ff','#d09aff'],celestial:['#ffe9a8','#fff7d6']};
  return function(e,wob){
    const B=G.currentBiomeKey||'crypt',t=G.time,am=AMB[B]||AMB.crypt,r=e.r,boss=e.boss;
    const fn=S[boss?e.bossKey:e.type];
    ctx.save();ctx.globalCompositeOperation='lighter';
    const gr=r*(boss?2.4:1.8),gl=ctx.createRadialGradient(0,0,r*0.2,0,0,gr);
    gl.addColorStop(0,am[0]);gl.addColorStop(1,'rgba(0,0,0,0)');
    ctx.globalAlpha=boss?0.10:0.10;ctx.fillStyle=gl;ctx.beginPath();ctx.arc(0,0,gr,0,TAU);ctx.fill();ctx.restore();
    if(e.elite&&!boss){ctx.save();ctx.globalAlpha=0.3+0.12*Math.sin(t*6);ctx.fillStyle='#ffd54f';ctx.beginPath();ctx.arc(0,0,r*1.7,0,TAU);ctx.fill();ctx.restore()}
    const sg=ctx.createRadialGradient(0,r*1.05,1,0,r*1.05,r*1.25);
    sg.addColorStop(0,'rgba(0,0,0,0.6)');sg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sg;ctx.beginPath();ctx.ellipse(0,r*1.05,r*1.3,r*0.48,0,0,TAU);ctx.fill();
    if(boss){ctx.save();ctx.globalAlpha=0.35+0.2*Math.sin(t*3);ctx.strokeStyle=am[0];ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(0,r*1.05,r*1.5,r*0.55,0,0,TAU);ctx.stroke();ctx.restore()}
    const cx=Math.cos(e.facing);if(cx>0.25)e._face=1;else if(cx<-0.25)e._face=-1;
    const sc=r/(boss?20:15),feet=boss?24:17;
    const b=0.03*Math.sin(t*3+e.wobble),lean=Math.sin(t*7+e.wobble)*0.03;
    const draw=()=>{
      ctx.save();ctx.translate(0,wob*0.4+feet*sc);ctx.rotate(lean);
      ctx.scale(sc*(e._face||1)*(1-b*0.6),sc*(1+b));ctx.translate(0,-feet);
      const key=boss?e.bossKey:(e.sprite||e.type);
      if(hasPx(key)&&!boss){
        const def=PIXFAM.SPRITES[key],n=def.frames.length;
        drawPxSprite(ctx,key,e.color,e.dark,B,0,feet,(boss?42:44)/def.w,0,Math.floor(t*7+e.wobble)%n);
      }else if(fn)fn({B,t,c:e.color,d:e.dark,e});else circ(0,0,15,e.color);
      ctx.restore();
    };
    draw();
    if(e.hitFlash>0){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.min(0.75,e.hitFlash*0.85);draw();ctx.restore()}
    const n=boss?7:2;ctx.save();
    for(let i=0;i<n;i++){
      const ph=(t*0.45+i/n+e.wobble*0.07)%1,x=Math.sin(i*5.3+e.wobble)*r*1.1;
      const y=B==='frost'?-r*1.6+ph*r*2.6:r*0.9-ph*r*2.6;
      ctx.globalAlpha=Math.sin(ph*Math.PI)*0.75;ctx.fillStyle=i%2?am[1]:am[0];
      ctx.beginPath();ctx.arc(x,y,boss?2:1.4,0,TAU);ctx.fill();
    }
    ctx.restore();
  };
})();

function drawEnemy(e){
  if(e.boss&&!(e.sink>0||e.lift>0)){
    ctx.save();ctx.globalAlpha=0.25;
    const grd=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.r*2);
    grd.addColorStop(0,e.color);grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd;ctx.beginPath();ctx.arc(e.x,e.y,e.r*2,0,TAU);ctx.fill();ctx.restore();
  }
  ctx.save();ctx.translate(e.x,e.y);
  if(e.sink>0){ctx.beginPath();ctx.rect(-900,-900,1800,900+e.r*.55);ctx.clip();ctx.translate(0,e.sink*e.r*3.2)}
  if(e.lift>0)ctx.translate(0,-e.lift);
  if(e.ghost!==undefined)ctx.globalAlpha=e.ghost;
  const wob=Math.sin(e.wobble)*2;
  if(e.spawnAnim>0){ctx.globalAlpha=1-e.spawnAnim*0.7;const sc=1-e.spawnAnim*0.4;ctx.scale(sc,sc)}
  if(e.markT>0){
    ctx.save();ctx.globalAlpha=0.6;ctx.strokeStyle='#ff8f2e';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,e.r+6,0,TAU);ctx.stroke();ctx.restore();
  }
  if(e.burnT > 0 || e.bleedT > 0){
    ctx.save();
    const y0 = -e.r - 16;
    if(e.burnT > 0){
      ctx.fillStyle = '#ff7a2e';
      ctx.beginPath();
      ctx.moveTo(-5, y0+6); ctx.quadraticCurveTo(0, y0-6, 1, y0-1);
      ctx.quadraticCurveTo(5, y0+3, 5, y0+6); ctx.closePath(); ctx.fill();
    }
    if(e.bleedT > 0){
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(9, y0+2, 3.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  if(e.affix){
    ctx.save();ctx.globalAlpha=0.55+0.2*Math.sin(G.time*6+e.x);
    ctx.strokeStyle=e.affixColor||'#7fd4ff';ctx.lineWidth=2;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.arc(0,0,e.r+9,0,TAU);ctx.stroke();ctx.restore();
  }
  if(e.boss&&!(e.sink>0)&&!(e.lift>0)){
    const aura=FXI.aura;
    if(aura&&aura.length===13){
      const fr=aura[Math.floor(G.time*14)%13];
      if(fr){
      const s=e.r*4.2/Math.max(fr.width,fr.height);
      const w=fr.width*s,hh=fr.height*s;
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.45+.18*Math.sin(G.time*3);
      ctx.drawImage(fr,-w/2,-hh/2,w,hh);ctx.restore();
      }
    }
  }
  if(e.stunT>0){
    ctx.save();ctx.globalAlpha=0.8;
    for(let i=0;i<3;i++){
      const a=G.time*4+i*TAU/3;
      ctx.fillStyle='#ffe082';
      ctx.beginPath();ctx.arc(Math.cos(a)*(e.r+8),Math.sin(a)*(e.r+8)-4,3,0,TAU);ctx.fill();
    }
    ctx.restore();
  }
  if(e.dotT>0){
    ctx.save();ctx.globalAlpha=0.5;
    ctx.fillStyle=e.dotColor||'#7aff9a';
    ctx.beginPath();ctx.arc(0,-e.r-4,3,0,TAU);ctx.fill();ctx.restore();
  }
  if(GFX.shadows){ctx.save();ctx.shadowColor='rgba(0,0,0,0.55)';ctx.shadowBlur=6;drawEnemyBody(e,wob);ctx.restore()}
  else drawEnemyBody(e,wob);
  ctx.restore();
  if((e.hp<e.maxHp||e.boss)&&!(e.sink>0||e.lift>0)){
    const w=e.boss?130:(e.elite?e.r*3.2:e.r*2.6);
    const barY=e.y-(e.boss?e.r*2+14:e.r*1.8+10);
    const pct=clamp(e.hp/e.maxHp,0,1);
    ctx.fillStyle='rgba(0,0,0,0.78)';
    ctx.fillRect(e.x-w/2,barY,w,e.boss?10:5);
    const barColor=e.boss?'#ff3030':'#e74c3c';
    ctx.fillStyle=barColor;
    ctx.fillRect(e.x-w/2+1,barY+1,(w-2)*pct,e.boss?8:3);
    if(e.boss){
      ctx.save();ctx.font="bold 12px 'Trebuchet MS'";ctx.textAlign='center';
      ctx.fillStyle='#ffd54f';ctx.shadowColor='#000';ctx.shadowBlur=4;
      ctx.fillText(e.name.toUpperCase(),e.x,barY-6);ctx.restore();
    }
  }
}


/* One simulation step. Split out of loop() so the run can keep advancing
   while the tab is hidden (background timers + catch-up on return). */

/* ═══ REALM HAZARDS ═══
   Each realm now has one ground hazard that telegraphs, then fires. They are
   what make a realm play differently rather than just look different. */


function stepHazards(dt,g){
  if(!g.realmHazards) { g.realmHazards=[]; g._hazT=3.0; }
  if(cutscene.active) return;
  g._hazT=(g._hazT||0)-dt;
  const p=g.player;
  if(g._hazT<=0 && p && p.hp>0 && g.realmHazards.length<((DIFFS[diffKey]&&DIFFS[diffKey].dmg>1.2)?3:2) && !g.betweenWaves){
    const def=HAZ_DEF[g.currentBiomeKey]||HAZ_DEF.crypt;
    g._hazT=def.period*rand(0.75,1.25);
    /* Mostly under the player's feet — a hazard that lands 300px away is just
       decoration. A third of the time it leads them, so standing still hurts. */
    const a=rand(0,TAU);
    const dist=rng()<0.62? rand(0,46) : rand(150,300);
    const hx=clamp(p.x+Math.cos(a)*dist, 120, WORLD.w-120);
    const hy=clamp(p.y+Math.sin(a)*dist, 120, WORLD.h-120);
    g.realmHazards.push({x:hx,y:hy,r:def.r,kind:g.currentBiomeKey,def,t:0,hitT:0,spin:rand(0,TAU)});
  }
  for(const h of g.realmHazards){
    h.t+=dt;
    const D=h.def;
    if(h.t<D.warn) continue;
    if(h.t>D.warn+D.active) continue;
    h.hitT=Math.max(0,h.hitT-dt);
    const d=Math.hypot(p.x-h.x,p.y-h.y);
    if(d<h.r*0.86 && h.hitT<=0 && p.hp>0){
      h.hitT=0.55;
      /* hazards respect the difficulty setting — easy used to hit as hard as hard */
      const dif=DIFFS[diffKey]||DIFFS.normal;
      const amt=Math.max(4,Math.round(p.maxHp*D.dmg*dif.dmg));
      damagePlayer(amt,g,'hazard',null);
      g.fx.push({type:'ring',x:p.x,y:p.y,r:40,life:.25,max:.25,color:D.col});
    }
  }
  g.realmHazards=g.realmHazards.filter(h=>h.t<h.def.warn+h.def.active+0.15);
}

function stepWorld(dt){
  if(G&&G.realmWipe){ G.realmWipe.t+=dt; if(G.realmWipe.t>2.4) G.realmWipe=null; }
  if(!G||!G.running||G.paused)return;
  G.time+=dt;
  G.shake=Math.max(0,G.shake-dt*45);
  G.damageFlash=Math.max(0,G.damageFlash-dt*2.2);
  if(cutscene.active){
    updateCutscene(dt);
    updateParticles(dt,G);updateFx(dt,G);updateTexts(dt,G);updatePortals(dt,G);updateDust(dt,G);
    updateHUD(G);
  } else {
    const px0=G.player.x,py0=G.player.y;
    if (autoPlay.enabled) updateAutoPlay(dt, G);
    tutorialTick(dt);
    if(G._pendingDefeat && !cutscene.active){
      const pd=G._pendingDefeat; G._pendingDefeat=null;
      const b=pd.boss;
      if(b && !b.dead && !b._defeatDone){
        if(pd.key==='cryptLord'){ if(!G._cryptDefeatCs){ G._cryptDefeatCs=true; startCryptDefeatCutscene(G,b); } }
        else if(DEFEAT_CS[pd.key]){ G._defeatCs=G._defeatCs||{}; if(!G._defeatCs[pd.key]){ G._defeatCs[pd.key]=true; DEFEAT_CS[pd.key](G,b); } }
      }
    }
    pollGamepad();
    updatePlayer(dt,G);
    stepHazards(dt,G);
    G.player.isMoving=Math.hypot(G.player.x-px0,G.player.y-py0)>0.4;
    G.player.walkPhase=(G.player.walkPhase||0)+Math.hypot(G.player.x-px0,G.player.y-py0)*0.45;
    updateMinions(dt,G);
    updateEnemies(dt,G);
    updateProjectiles(dt,G);
    updateHazards(dt,G);
    updateTraps(dt,G);
    updateTotems(dt,G);
    updateGrounds(dt,G);
    updatePortals(dt,G);
    updateRains(dt,G);
    updateParticles(dt,G);
    updateDust(dt,G);
    updateTexts(dt,G);
    updateFx(dt,G);
    updateDelayed(dt,G);
    updateLoot(dt,G);
    updateOrbs(dt,G);
    updateWaves(dt,G);
    updateCamera(dt,G);
    updateHUD(G);
  }
}
/* Main loop */
let lastTs=0;
function loop(ts){
  const dt=Math.min(0.05,(ts-lastTs)/1000||0);
  lastTs=ts;
  if(upgState.open){
    if(!G||!G.running)closeUpgradePanel();
    else if(performance.now()-upgState.openAt>30000)chooseUpgrade(0);
  }
  if(cutscene.active){const _cb=document.getElementById('cutsceneBars');if(_cb&&_cb.classList.contains('hidden'))endCutscene()}
  if(G&&G._finaleDone&&!G._victoryOpen&&G.player&&G.player.hp>0&&!G.endless)showVictoryScreen();
  if(G&&G.hitStop>0){ G.hitStop=Math.max(0,G.hitStop-dt); }
  else stepWorld(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ═══ VICTORY / NG+ / ENDLESS / POTION / BEST RUN ═══ */
function showVictoryScreen(){
  if(!G||!G.player||G._victoryOpen||G.endless)return;
  G._victoryOpen=true;
  G.running=false;
  sfx.win();
  saveGame();
  recordBestRun(G);
  const p=G.player,g=G;
  const C=CLASSES[p.cls]||{name:p.cls};
  const st=document.getElementById('victoryStats');
  if(st)st.innerHTML=
    '<div class="vstat"><span>CLASS</span><b style="color:'+(C.color||'#fff')+'">'+C.name+'</b></div>'+
    '<div class="vstat"><span>'+tr('Wave')+'</span><b>'+g.wave+'</b></div>'+
    '<div class="vstat"><span>LEVEL</span><b>'+p.level+'</b></div>'+
    '<div class="vstat"><span>'+tr('kills')+'</span><b>'+g.kills+'</b></div>'+
    '<div class="vstat"><span>GOLD</span><b style="color:#ffd54f">'+Math.floor(p.gold||0)+'</b></div>';
  const el=document.getElementById('victoryScreen');
  if(el){
    if(window.__vicT)clearTimeout(window.__vicT);
    window.__vicT=setTimeout(()=>{if(G&&G._victoryOpen&&!G.endless)el.classList.remove('hidden');},1800);
  }
}
function recordBestRun(g){
  try{
    const b=JSON.parse(localStorage.getItem('sd_best')||'null');
    if(!b||g.wave>b.wave||(g.wave===b.wave&&(g.kills||0)>(b.kills||0))){
      const nextBest={wave:g.wave,kills:g.kills,level:g.player.level,cls:g.player.cls};
      localStorage.setItem('sd_best',JSON.stringify(nextBest));
      const _br=document.getElementById('bestRun');
      if(_br)_br.textContent='🏆 BEST: Wave '+nextBest.wave+' · '+(nextBest.kills||0)+' kills'+(CLASSES[nextBest.cls]?(' · '+CLASSES[nextBest.cls].name):'');
    }
    if(auth.currentUser && g && g.player){
      const C=CLASSES[g.player.cls]||{name:g.player.cls,roleTag:'Warrior'};
      submitScoreToLeaderboard({
        cls: g.player.cls,
        clsName: C.name,
        roleTag: C.roleTag || 'Warrior',
        wave: g.wave || 1,
        kills: g.kills || 0,
        level: g.player.level || 1,
        gold: Math.floor(g.player.gold || 0),
        difficulty: diffKey || 'normal',
        titleName: g.player.titleName || ''
      }).then((updated)=>{
        if(updated)addToast('🏛️ NEW GLOBAL RANKING RECORD!','#ffd54f','Submitted to Angkor Hall of Heroes');
      }).catch(()=>{});
    }
  }catch(e){}
}
function drinkPotion(){
  if(!G||!G.player||G.paused||cutscene.active)return;
  const p=G.player;
  if((p.potions||0)<=0){addToast(tr('No potions — buy one in the shop [B]'),'#ef4444','');return}
  if(p.hp>=p.maxHp){addToast(tr('Already at full health'),'#a89886','');return}
  if((p._potionCd||0)>0)return;
  p.potions--;p._potionCd=4;
  const amt=Math.floor(p.maxHp*0.4);
  p.hp=Math.min(p.maxHp,p.hp+amt);
  G.texts.push({x:p.x,y:p.y-40,vy:-45,life:1,max:1,spawn:1,text:'+'+amt+' HP',color:'#7aff9a',size:16});
  G.fx.push({type:'ring',x:p.x,y:p.y,r:70,life:.5,max:.5,color:'#7aff9a'});
  sfx.potion();
  addToast(tr('Potion used!'),'#7aff9a',tr('Healing Potion'));
  updateHUD(G);
}
function buyPotion(){
  if(!G||!G.player)return;
  const p=G.player;
  if((p.gold||0)<60){addToast(tr('Not enough gold'),'#ef4444','');return}
  if((p.potions||0)>=5){addToast('Max 5 potions carried','#a89886','');return}
  p.gold-=60;p.potions=(p.potions||0)+1;
  sfx.ui();
  addToast(tr('Purchased'),'#7aff9a',tr('Healing Potion'));
  updateHUD(G);
}
document.getElementById('ngplusBtn').addEventListener('click',()=>{
  sfx.click();
  const g=G;if(!g||!g.player)return;
  const snap=saveGamePayload(g);
  if(!snap)return;
  snap.wave=1;snap.kills=0;snap.hp=Math.round(g.player.maxHp);snap.energy=Math.round(g.player.maxEnergy);
  const el=document.getElementById('victoryScreen');if(el)el.classList.add('hidden');
  g._victoryOpen=false;
  resumeFromSave(snap,true);
  if(G)G.ngPlus=1;
  addToast('NEW GAME+','#ff7a45','Wave 1 · enemies +50% HP · +35% damage');
});
document.getElementById('endlessBtn').addEventListener('click',()=>{
  sfx.click();
  const g=G;if(!g||!g.player)return;
  const el=document.getElementById('victoryScreen');if(el)el.classList.add('hidden');
  g._victoryOpen=false;g.endless=true;
  g.running=true;
  addToast('ENDLESS','#a060ff','Beyond wave 40: +8% enemy power per wave');
});
document.getElementById('vicMenuBtn').addEventListener('click',()=>{
  sfx.click();
  backToMenu();
});

/* Run summary card: a shareable image of the run, drawn on death. */
function drawRunCard(g, score){
  const cv=document.getElementById('runCard');
  if(!cv||!cv.getContext) return;
  const x=cv.getContext('2d'), W2=cv.width, H2=cv.height;
  const p=g.player, C=CLASSES[p.cls], biome=getBiomeForWave(Math.max(1,g.wave));

  const bg=x.createLinearGradient(0,0,W2,H2);
  bg.addColorStop(0,'#160f08');bg.addColorStop(0.55,'#241708');bg.addColorStop(1,'#0c0805');
  x.fillStyle=bg;x.fillRect(0,0,W2,H2);

  /* sandstone frame + corner naga marks */
  x.strokeStyle='#8a6a32';x.lineWidth=6;x.strokeRect(14,14,W2-28,H2-28);
  x.strokeStyle='rgba(240,193,75,0.45)';x.lineWidth=2;x.strokeRect(26,26,W2-52,H2-52);

  /* mandala watermark behind the score */
  x.save();x.globalAlpha=0.10;x.translate(W2*0.79,H2*0.5);x.strokeStyle='#e8b53a';x.lineWidth=3;
  for(let r=40;r<=190;r+=38){x.beginPath();x.arc(0,0,r,0,TAU);x.stroke();}
  for(let i=0;i<12;i++){const a=i/12*TAU;x.beginPath();x.moveTo(Math.cos(a)*40,Math.sin(a)*40);x.lineTo(Math.cos(a)*190,Math.sin(a)*190);x.stroke();}
  x.restore();

  x.textAlign='left';
  x.fillStyle='#f0c14b';x.font="bold 34px 'Trebuchet MS', sans-serif";
  x.fillText('ANGKOR SASTRA CHRONICLES', 54, 92);
  x.fillStyle='#c8b89a';x.font="18px 'Trebuchet MS', sans-serif";
  x.fillText('RUN RECORD · ' + new Date().toLocaleDateString(), 54, 120);

  /* class block */
  const col=(C&&C.color)||'#e8c07a';
  x.fillStyle=col;x.font="bold 64px 'Trebuchet MS', sans-serif";
  x.fillText(C?C.name:'Unknown', 54, 210);
  if(C&&C.arch){x.fillStyle='rgba(200,184,154,0.9)';x.font="20px 'Trebuchet MS', sans-serif";
    x.fillText(String(C.arch).toUpperCase()+' · LV '+p.level, 56, 240);}

  /* stat row */
  const stats=[['WAVE',g.wave],['KILLS',g.kills],['GOLD',Math.floor(p.gold||0)]];
  let sx=54;
  for(const [k,lv] of stats){
    x.fillStyle='#c8b89a';x.font="17px 'Trebuchet MS', sans-serif";x.fillText(k, sx, 306);
    x.fillStyle='#f4e7c8';x.font="bold 40px 'Trebuchet MS', sans-serif";x.fillText(String(lv), sx, 350);
    sx+=170;
  }

  /* score plate */
  x.fillStyle='rgba(122,255,154,0.12)';x.fillRect(W2-300,286,240,96);
  x.strokeStyle='rgba(122,255,154,0.5)';x.lineWidth=2;x.strokeRect(W2-300,286,240,96);
  x.fillStyle='#7aff9a';x.font="17px 'Trebuchet MS', sans-serif";x.textAlign='center';
  x.fillText('HERO SCORE',W2-180,318);
  x.font="bold 44px 'Trebuchet MS', sans-serif";
  x.fillText(score.toLocaleString(),W2-180,366);

  x.textAlign='left';
  x.fillStyle='#8a7a5a';x.font="17px 'Trebuchet MS', sans-serif";
  x.fillText('Fell in ' + biome.name + ' · ' + (diffKey||'normal').toUpperCase(), 54, 410);
  x.textAlign='right';
  x.fillStyle='#e8b53a';x.fillText('play.sastra.tech', W2-54, 410);
  x.textAlign='left';

  const dl=document.getElementById('runCardDl');
  if(dl) dl.href=cv.toDataURL('image/png');
}

function gameOver(){
  if(!G)return;
  G.running=false;
  closeUpgradePanel();
  sfx.death();
  recordBestRun(G);
  hideSkillTooltip();hideTreeTooltip();
  const p=G.player;
  const C=CLASSES[p.cls];
  const score = computeHeroScore(G.wave||1, G.kills||0, p.level||1, Math.floor(p.gold||0), diffKey||'normal');
  const soulsGained = recordMetaRun(G, score, false);
  document.getElementById('deathStats').innerHTML=
    `<div>Reached <b style="color:#f0c14b">Level ${p.level}</b> · Score <b style="color:#7aff9a">${score.toLocaleString()}</b></div>
     <div>Class: <b style="color:${C?C.color:'#fff'}">${C?C.name:'?'}</b></div>
     <div>Fell in <b style="color:#e8c07a">${getBiomeForWave(Math.max(1,G.wave)).name}</b> · Wave ${G.wave}</div>
     <div><b style="color:#ff8f2e">${G.kills}</b> monsters slain · <b style="color:#ffd54f">${Math.floor(p.gold||0)}g</b> earned</div>
     <div style="margin-top:6px">📜 <b style="color:#c8a0ff">+${soulsGained} souls</b> banked · total ${META.souls} · <a href="#" id="deathArchive" style="color:#ffd54f">open archive</a></div>`;
  try{ drawRunCard(G, score); }catch(e){ console.warn('run card failed', e); }
  document.getElementById('deathArchive')?.addEventListener('click',(ev)=>{ ev.preventDefault(); document.getElementById('deathScreen')?.classList.add('hidden'); openArchive('souls'); });
  document.getElementById('deathScreen').classList.remove('hidden');
  document.getElementById('autoBadge').style.display='none';
}

/* ═══ GOOGLE AUTH, CLOUD SYNC & GLOBAL LEADERBOARD ═══ */
let lbAllEntries: LeaderboardRecord[] = [];
let lbCurrentFilter = 'all';
let lbUnsub: (() => void) | null = null;

function renderLeaderboardRows() {
  const listEl = document.getElementById('lbList');
  if (!listEl) return;
  const filtered = lbCurrentFilter === 'all'
    ? lbAllEntries
    : lbAllEntries.filter(r => (r.difficulty || 'normal') === lbCurrentFilter);
  if (!filtered.length) {
    listEl.innerHTML = `<div class="lb-empty">No heroes recorded in this filter yet. Enter the Angkor sanctuary and claim the #1 throne!</div>`;
    return;
  }
  const curUid = auth.currentUser?.uid;
  listEl.innerHTML = filtered.map((r, idx) => {
    const rank = idx + 1;
    const rankCls = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    const isMe = curUid && r.uid === curUid;
    const C = CLASSES[r.cls] || { icon: '🏛️', color: '#ffd54f', name: r.clsName || r.cls };
    const avatar = r.photoURL
      ? `<img class="lb-avatar" src="${r.photoURL}" alt="" referrerpolicy="no-referrer">`
      : `<div class="lb-avatar" style="display:flex;align-items:center;justify-content:center;background:#2a1e14;font-size:15px">${C.icon||'⚔️'}</div>`;
    return `<div class="lb-row ${rankCls} ${isMe ? 'me' : ''}">
      <div class="lb-rank">${rank === 1 ? '👑 1' : rank === 2 ? '🥈 2' : rank === 3 ? '🥉 3' : '#' + rank}</div>
      <div class="lb-player">
        ${avatar}
        <div class="lb-player-info">
          <div class="lb-player-name">${r.displayName || 'Angkor Warrior'}${isMe ? ' (YOU)' : ''}</div>
          <div class="lb-player-title">${r.titleName ? '✦ ' + r.titleName : (r.difficulty || 'normal').toUpperCase()}</div>
        </div>
      </div>
      <div class="lb-class" style="color:${C.color || '#ffd54f'}">${C.icon || '⚔'} ${r.clsName || C.name}</div>
      <div class="lb-wave">Wave ${r.wave || 1} <span style="color:#a89886;font-size:10px">(Lv.${r.level || 1})</span></div>
      <div class="lb-kills">${r.kills || 0} ⚔</div>
      <div class="lb-score">${(r.score || 0).toLocaleString()}</div>
    </div>`;
  }).join('');
}

function refreshLbAuthNotice() {
  const notice = document.getElementById('lbAuthNotice');
  if (notice) notice.classList.toggle('hidden', !!auth.currentUser);
}

function openLeaderboard() {
  const modal = document.getElementById('leaderboardOverlay');
  if (!modal) return;
  modal.classList.remove('hidden');
  refreshLbAuthNotice();
  if (!lbUnsub) {
    lbUnsub = subscribeLeaderboard((entries) => {
      lbAllEntries = entries;
      renderLeaderboardRows();
    });
  } else {
    renderLeaderboardRows();
  }
}

function closeLeaderboard() {
  const modal = document.getElementById('leaderboardOverlay');
  if (modal) modal.classList.add('hidden');
}

function initFirebaseUI() {
  const outEl = document.getElementById('authLoggedOut');
  const inEl = document.getElementById('authLoggedIn');
  const nameEl = document.getElementById('userName');
  const avatarEl = document.getElementById('userAvatar') as HTMLImageElement | null;
  const syncStatusEl = document.getElementById('cloudStatus');
  const lbBannerEl = document.getElementById('lbAuthNotice');

  onUserChange(async (user) => {
    if (user) {
      if (outEl) outEl.classList.add('hidden');
      if (inEl) inEl.classList.remove('hidden');
      if (lbBannerEl) lbBannerEl.classList.add('hidden');
      if (nameEl) nameEl.textContent = user.displayName || user.email || 'Angkor Hero';
      if (avatarEl) {
        if (user.photoURL) {
          avatarEl.src = user.photoURL;
          avatarEl.style.display = 'block';
        } else {
          avatarEl.style.display = 'none';
        }
      }
      if (syncStatusEl) syncStatusEl.textContent = '☁ Syncing with Angkor Cloud...';
      try {
        const cloud = await loadSaveFromCloud();
        if (cloud) {
          try{ if (cloud.meta && applyCloudMeta(cloud.meta)) console.log('meta merged from cloud'); }catch(e){}
          if (cloud.titlesUnlocked && Object.keys(cloud.titlesUnlocked).length) {
            TITLES_UNLOCKED = { ...TITLES_UNLOCKED, ...cloud.titlesUnlocked };
            saveTitles();
            renderTitlesPanel();
            renderClassGrid(currentArch);
          }
          if (cloud.bestRun) {
            const cb: any = cloud.bestRun;
            const lb: any = JSON.parse(localStorage.getItem('sd_best') || 'null');
            if (cb && (!lb || (cb.wave || 0) > (lb.wave || 0))) {
              localStorage.setItem('sd_best', JSON.stringify(cb));
              const _br = document.getElementById('bestRun');
              if (_br) _br.textContent = '🏆 BEST: Wave ' + cb.wave + ' · ' + (cb.kills || 0) + ' kills' + (CLASSES[cb.cls] ? (' · ' + CLASSES[cb.cls].name) : '');
            }
          }
          if (cloud.savePayload) {
            const cloudSave: any = cloud.savePayload;
            const localSave: any = loadSaveData();
            if (cloudSave && CLASSES[cloudSave.cls] && (!localSave || (cloudSave.savedAt || 0) > (localSave.savedAt || 0))) {
              localStorage.setItem(SAVE_KEY, JSON.stringify(cloudSave));
              refreshContinuePanel();
              addToast('☁ CLOUD SAVE RESTORED', '#7aff9a', `Level ${cloudSave.level || 1} ${CLASSES[cloudSave.cls].name} · Wave ${cloudSave.wave || 1}`);
            }
          }
        }
        // Also push local save / best run to cloud if present
        const curLocal = loadSaveData();
        let best = null;
        try { best = JSON.parse(localStorage.getItem('sd_best') || 'null'); } catch {}
        if (curLocal) {
          await syncSaveToCloud(curLocal, TITLES_UNLOCKED, best, META);
        }
        if (best && CLASSES[best.cls]) {
          const C = CLASSES[best.cls];
          await submitScoreToLeaderboard({
            cls: best.cls,
            clsName: C.name,
            roleTag: C.roleTag || 'Warrior',
            wave: best.wave || 1,
            kills: best.kills || 0,
            level: best.level || 1,
            gold: 0,
            difficulty: diffKey || 'normal',
            titleName: TITLES_UNLOCKED[best.cls] && TITLES[best.cls] ? TITLES[best.cls].name : ''
          });
        }
        if (syncStatusEl) syncStatusEl.textContent = '✓ Cloud Synced & Ranked';
      } catch (e) {
        if (syncStatusEl) syncStatusEl.textContent = '☁ Cloud Ready';
      }
    } else {
      if (outEl) outEl.classList.remove('hidden');
      if (inEl) inEl.classList.add('hidden');
      if (lbBannerEl) lbBannerEl.classList.remove('hidden');
    }
    renderLeaderboardRows();
  });

  const handleLogin = async () => {
    sfx.ui();
    try {
      const user = await loginWithGoogle();
      if (user) addToast('WELCOME, ' + (user.displayName || 'HERO').toUpperCase(), '#ffd54f', 'Cloud Save & Global Rankings active');
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        addToast('Google Sign-In Failed', '#ef4444', err?.message || 'Check popup permissions');
      }
    }
  };

  document.getElementById('googleLoginBtn')?.addEventListener('click', handleLogin);
  document.getElementById('lbLoginBtn')?.addEventListener('click', handleLogin);
  document.getElementById('googleLogoutBtn')?.addEventListener('click', async () => {
    sfx.ui();
    await logoutGoogle();
    if (lbUnsub) { lbUnsub(); lbUnsub = null; }
    lbAllEntries = [];
    renderLeaderboardRows();
    addToast('Signed out', '#a89886', 'Local saves remain intact');
  });
  document.getElementById('syncNowBtn')?.addEventListener('click', async () => {
    sfx.ui();
    if (!auth.currentUser) return;
    if (G && G.player) saveGame();
    const curLocal = loadSaveData();
    let best = null;
    try { best = JSON.parse(localStorage.getItem('sd_best') || 'null'); } catch {}
    if (curLocal) {
      const ok = await syncSaveToCloud(curLocal, TITLES_UNLOCKED, best, META);
      if (ok) addToast('☁ GAME SYNCED TO CLOUD', '#7aff9a', `Level ${curLocal.level || 1} · Wave ${curLocal.wave || 1}`);
    } else {
      addToast('☁ CLOUD CHECKED', '#ffd54f', 'Start a run to save progress to the cloud');
    }
    if (G && G.player) recordBestRun(G);
  });

  ['rankBtnOut', 'rankBtnIn', 'pauseRankBtn', 'deathRankBtn', 'vicRankBtn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      sfx.ui();
      openLeaderboard();
    });
  });
  document.getElementById('lbClose')?.addEventListener('click', () => {
    sfx.ui();
    closeLeaderboard();
  });
  document.querySelectorAll('.lb-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.ui();
      document.querySelectorAll('.lb-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lbCurrentFilter = (btn as HTMLElement).dataset.lbdiff || 'all';
      renderLeaderboardRows();
    });
  });
}

/* ═══ TUTORIAL (first-run coach) ═══ */
const TUT_KEYS=[
  'MOVE — WASD or click / joystick to move',
  'ATTACK — your basic attack is automatic. Toggle with right-click / ⚔',
  'SKILLS — press 1 · 2 · 3 to cast your unique Angkor spells',
  'LEVEL UP — pick an Attribute Blessing or Skill Upgrade every level + Tree [T]',
  'SHOP — press B to buy gear · Q drinks a potion · O toggles AUTO-PLAY',
];
/* touch devices get their own coach lines — keyboard hints on a phone read as a bad port */
const TUT_KEYS_TOUCH=[
  'MOVE — drag the joystick on the left side',
  'ATTACK — your basic attack is automatic · tap ⚔ to force a target',
  'SKILLS — tap the skill buttons above the ability bar',
  'LEVEL UP — tap a card to take an Attribute Blessing or Skill Upgrade',
  'SHOP — tap 🛒 for gear · 🧪 drinks a potion · 🤖 toggles AUTO-PLAY',
];
const tutKeys = () => document.body.classList.contains('touch') ? TUT_KEYS_TOUCH : TUT_KEYS;
const tut={active:false,step:0,st:0,moved:0,p0:0,px:0,py:0,el:null};
function tutorialInit(){
  let seen=false;
  try{seen=localStorage.getItem('sd_tut_seen')==='1'}catch(e){}
  tut.active=!seen&&!autoPlay.enabled;
  tut.step=0;tut.st=0;tut.moved=0;
  if(G&&G.player){tut.p0=G.player.treePoints||0;tut.px=G.player.x;tut.py=G.player.y}
  tut.el=document.getElementById('tutorial');
  if(tut.el)tut.el.classList.toggle('hidden',!tut.active);
  renderTut();
}
function renderTut(){
  if(!tut.el)return;
  const tEl=document.getElementById('tutText');
  if(tEl)tEl.textContent=tr(tutKeys()[tut.step]||'');
  const dEl=document.getElementById('tutDots');
  if(dEl)dEl.textContent='●'.repeat(tut.step+1)+'○'.repeat(Math.max(0,tutKeys().length-tut.step-1));
}
function tutClose(){
  tut.active=false;
  if(tut.el)tut.el.classList.add('hidden');
  try{localStorage.setItem('sd_tut_seen','1')}catch(e){}
}
document.getElementById('tutClose').addEventListener('click',()=>{sfx.ui();tutClose()});
function tutorialTick(dt){
  if(!tut.active||!G||!G.player||!G.running||G.paused||cutscene.active)return;
  const p=G.player;
  const dm=Math.hypot(p.x-tut.px,p.y-tut.py);tut.px=p.x;tut.py=p.y;
  if(dm>0)tut.moved+=dm;
  tut.st+=dt;
  const next=()=>{tut.step++;tut.st=0;if(tut.step>=tutKeys().length){tutClose();return}renderTut();};
  switch(tut.step){
    case 0:if(tut.moved>60)next();break;
    case 1:if(G.kills>0||tut.st>12)next();break;
    case 2:if(p.skills.some(s=>s.cd>0)||tut.st>14)next();break;
    case 3:if((p.treePoints||0)>tut.p0||tut.st>16)next();break;
    case 4:if(tut.st>18)tutClose();break;
  }
}
/* ═══ TOUCH CONTROLS (mobile) ═══ */
(function initTouch(){
  if(!('ontouchstart' in window)&&!(navigator.maxTouchPoints>0))return;
  document.body.classList.add('touch');
  try{ const bg=document.getElementById('bgmBtn'); if(bg) bg.textContent=bg.textContent.replace(/\s*\[[A-Z]\]/g,''); }catch(e){}
  const touchUI=document.getElementById('touchUI');
  if(touchUI)touchUI.classList.remove('hidden');
  const joyZone=document.getElementById('joyZone');
  const joyKnob=document.getElementById('joyKnob');
  let joyId=null,jx=0,jy=0;
  if(joyZone&&joyKnob){
    joyZone.addEventListener('touchstart',e=>{
      const t=e.changedTouches[0];
      joyId=t.identifier;jx=t.clientX;jy=t.clientY;
      joyKnob.style.opacity='1';
      e.preventDefault();
    },{passive:false});
    joyZone.addEventListener('touchmove',e=>{
      for(const t of e.changedTouches){
        if(t.identifier!==joyId)continue;
        let dx=t.clientX-jx,dy=t.clientY-jy;
        const m=Math.hypot(dx,dy),max=44;
        if(m>max){dx=dx/m*max;dy=dy/m*max}
        joyKnob.style.transform='translate('+dx+'px,'+dy+'px)';
        if(G&&G.player)G.player._tmove={x:dx/max,y:dy/max};
      }
      e.preventDefault();
    },{passive:false});
    const joyEnd=e=>{
      for(const t of e.changedTouches){
        if(t.identifier!==joyId)continue;
        joyId=null;
        joyKnob.style.transform='translate(0px,0px)';
        joyKnob.style.opacity='0';
        if(G&&G.player)G.player._tmove=null;
      }
    };
    joyZone.addEventListener('touchend',joyEnd);
    joyZone.addEventListener('touchcancel',joyEnd);
  }
  const cv=document.getElementById('game');
  if(cv)cv.addEventListener('touchstart',e=>{
    if(!G||!G.player)return;
    const t=e.changedTouches[0];
    if(t.clientX<window.innerWidth*0.4)return;
    e.preventDefault();
    mouse.down=false;
    mouse.x=t.clientX;mouse.y=t.clientY;
    const w=screenToWorld(t.clientX,t.clientY);
    G.player.moveTarget={x:w.x,y:w.y};
  },{passive:false});
  const atkBtn=document.getElementById('touchAtk');
  if(atkBtn)atkBtn.addEventListener('click',()=>{
    sfx.ui();
    if(!G||!G.player)return;
    G.player.autoAttack=!G.player.autoAttack;
    updateAutoBadge();
    addToast(G.player.autoAttack?tr('AUTO-ATTACK ON'):tr('AUTO-ATTACK OFF'),'#f0c14b','');
  });
  const pauseB=document.getElementById('touchPause');
  if(pauseB)pauseB.addEventListener('click',()=>{sfx.ui();togglePause()});
  const skillB=document.getElementById('touchSkill');
  if(skillB)skillB.addEventListener('click',()=>{sfx.ui();if(tree.open){toggleTree();return}closeInventory();toggleTree()});
  const itemsB=document.getElementById('touchItems');
  if(itemsB)itemsB.addEventListener('click',()=>{sfx.ui();if(inv.open&&invTab!=='shop'){closeInventory();return}if(tree.open){tree.open=false;tree.el.classList.add('hidden');hideTreeTooltip()}toggleInventory()});
  const shopB=document.getElementById('touchShop');
  if(shopB)shopB.addEventListener('click',()=>{sfx.ui();if(inv.open&&invTab==='shop'){closeInventory();return}if(tree.open){tree.open=false;tree.el.classList.add('hidden');hideTreeTooltip()}toggleInventory('shop')});
})();
/* ═══ SETTINGS + DAILY TRIAL ═══ */
let dailyRun: {key:string;cls:string;seed:number}|null = null;
let pendingDaily = false;   /* set before the intro-wrapped startGame runs */


/* Weekly challenge: a fixed seed + class + mandatory hard mode for the ISO week,
   so every player faces the same run for seven days. */
function weeklyInfo(){
  const d=new Date();
  const t=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day=t.getUTCDay()||7;
  t.setUTCDate(t.getUTCDate()+4-day);
  const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));
  const wk=Math.ceil((((t.getTime()-y0.getTime())/86400000)+1)/7);
  const key=t.getUTCFullYear()+'-W'+String(wk).padStart(2,'0');
  let h=2166136261>>>0;
  for(let i=0;i<key.length;i++){ h^=key.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  const keys=Object.keys(CLASSES);
  return { key, seed:h, cls:keys[(h>>>3)%keys.length] };
}
function startWeeklyRun(){
  const info=weeklyInfo();
  try{
    if(localStorage.getItem('sd_weekly_last')===info.key){
      addToast('📅 WEEKLY ALREADY CLEARED','#ffd54f','New challenge next Monday · '+info.key);
      return;
    }
  }catch(e){}
  setDiff('hard');
  setSeed(info.seed);
  try{ localStorage.setItem('sd_weekly_last',info.key) }catch(e){}
  try{ const wg=(window as any).startGame; if(typeof wg==='function') wg(info.cls); else startGame(info.cls); }
  catch(e){ console.error('❌ weekly start:',e); }
  setTimeout(()=>addToast('📅 WEEKLY CHALLENGE · '+info.key,'#ff8f2e','Hard mode · '+CLASSES[info.cls].name+' · one attempt'),900);
}

function dailyInfo(){
  const d=new Date();
  const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  let h=2166136261>>>0;
  for(let i=0;i<key.length;i++){ h^=key.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  const keys=Object.keys(CLASSES);
  return { key, seed:h, cls:keys[h%keys.length] };
}
function startDailyRun(){
  const info=dailyInfo();
  if(dailyRun && dailyRun.key===info.key){
    addToast('🗓 ALREADY IN TODAY\'S TRIAL','#ffd54f','Seed '+info.seed+' · '+CLASSES[info.cls].name);
    return;
  }
  setSeed(info.seed);
  dailyRun={key:info.key,cls:info.cls,seed:info.seed};
  pendingDaily=true;
  try{ localStorage.setItem('sd_daily_last',info.key) }catch(e){}
  /* go through the intro-wrapped entry point so the cinematic and its overlay behave */
  try{ const wg=(window as any).startGame; if(typeof wg==='function') wg(info.cls); else startGame(info.cls,{daily:true}); }
  catch(e){ console.error('❌ daily start:',e); pendingDaily=false; }
  setTimeout(()=>addToast('🗓 DAILY TRIAL · '+info.key,'#ffd54f','Seeded run · '+CLASSES[info.cls].name+' · every player gets the same rolls'),900);
}

function updateComboHUD(g){
  try{ syncRelicHUD(g); }catch(e){}
  const el = document.getElementById('comboReadout');
  if(!el) return;
  const c = (g && g.player && g.player._combo) || 0;
  if(c < 5){ el.classList.add('hidden'); el.classList.remove('hot','blazing'); return; }
  el.classList.remove('hidden');
  el.classList.toggle('hot', c >= 20 && c < 45);
  el.classList.toggle('blazing', c >= 45);
  el.textContent = '×' + c + ' COMBO';
}

function syncSettingsUI(){
  const g=(id)=>document.getElementById(id) as HTMLInputElement|null;
  const sfxEl=g('setSfx'), musEl=g('setMusic');
  if(sfxEl){ sfxEl.value=String(Math.round(SETTINGS.sfxVol*100)); }
  if(musEl){ musEl.value=String(Math.round(SETTINGS.musicVol*100)); }
  const a=document.getElementById('setSfxVal'), b=document.getElementById('setMusicVal');
  if(a)a.textContent=String(Math.round(SETTINGS.sfxVol*100));
  if(b)b.textContent=String(Math.round(SETTINGS.musicVol*100));
  const f=g('setFlash'), s=g('setShake'), v=g('setVfx'), ap=g('setAutoPause');
  if(f)f.checked=!SETTINGS.flash;      /* checkbox = "reduce …" */
  if(s)s.checked=!SETTINGS.shake;
  if(v)v.checked=SETTINGS.vfx;
  if(ap)ap.checked=!!SETTINGS.autoPause;
}
function initSettingsUI(){
  const ov=document.getElementById('settingsOverlay'); if(!ov)return;
  const close=()=>{ ov.classList.add('hidden'); saveSettings(); };
  
/* ═══ ARCHIVE UI ═══ */
/* hand the crash reporter a snapshot of where the player was */
try{
  setErrorContext(() => {
    const p = G && G.player;
    return {
      wave: G ? G.wave : null,
      biome: G ? G.biomeKey : null,
      running: !!(G && G.running),
      paused: !!(G && G.paused),
      cls: p ? p.cls : null,
      level: p ? p.level : null,
      hp: p ? Math.round(p.hp) : null,
      enemies: G ? (G.enemies || []).filter((x:any) => !x.dead).length : null,
      cutscene: !!(G && G.cutscene && G.cutscene.active),
      build: (import.meta as any).env?.VITE_BUILD || 'dev',
    };
  });
}catch(e){}

function renderArchive(tab){
  const soulsEl=document.getElementById('arcSouls');
  const achEl=document.getElementById('arcAch');
  const runsEl=document.getElementById('arcRuns');
  const codexEl=document.getElementById('arcCodex');
  const cosEl=document.getElementById('arcCos');
  if(!soulsEl)return;
  document.querySelectorAll('.arc-tab').forEach(b=>b.classList.toggle('active',b.getAttribute('data-tab')===tab));
  [soulsEl,achEl,runsEl,codexEl,cosEl].forEach(el=>el && el.classList.add('hidden'));
  const show=document.getElementById('arc'+tab.charAt(0).toUpperCase()+tab.slice(1));
  if(show) show.classList.remove('hidden');

  if(tab==='cos'){
    const state = (META.cos || emptyCosmetics()) as CosmeticState;
    const souls = META.souls || 0;
    const card = (c) => {
      const owned = ownsCosmetic(state, c.id);
      const worn = isEquipped(state, c.id);
      const afford = souls >= c.price;
      const btn = worn ? 'UNEQUIP' : owned ? 'EQUIP' : (afford ? c.price + ' ◆' : 'LOCKED');
      const cls = worn ? 'arc-cos-card worn' : owned ? 'arc-cos-card owned' : 'arc-cos-card';
      return `<button class="${cls}" data-cos="${c.id}" data-kind="${c.kind}" ${!owned && !afford ? 'disabled' : ''}>
        <span class="swatch" style="background:radial-gradient(circle at 35% 30%, ${c.accent}, ${c.primary} 45%, ${c.secondary})"></span>
        <b>${c.name}</b>
        <small>${c.desc}</small>
        <em>${btn}</em>
      </button>`;
    };
    const auraCards = cosmeticsOf('aura').map(card).join('');
    const weaponCards = cosmeticsOf('weapon').map(card).join('');
    cosEl.innerHTML = `<div class="arc-soul-head"><div><div class="arc-soul-count">${souls.toLocaleString()}<small>SOULS BANKED</small></div></div>
        <div style="text-align:right;font-size:11px;color:#9a8a6a;line-height:1.5">cosmetics only<br>never grants stats</div></div>
      <h4 class="arc-cos-head">CELESTIAL AURAS</h4>
      <div class="arc-cos-grid">${auraCards}</div>
      <h4 class="arc-cos-head">WEAPON EFFECTS</h4>
      <div class="arc-cos-grid">${weaponCards}</div>`;

    cosEl.querySelectorAll('[data-cos]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-cos');
      const def = cosmeticById(id);
      if (!def) return;
      const worn = isEquipped(META.cos, id);
      if (worn) {
        META.cos = equipCosmetic(META.cos, def.kind, null);
        addToast('UNEQUIPPED', '#c8a0ff', def.name);
      } else if (ownsCosmetic(META.cos, id)) {
        META.cos = equipCosmetic(META.cos, def.kind, id);
        addToast('EQUIPPED', '#ffd54f', def.name + ' · cosmetic only');
      } else {
        const res = buyCosmetic(META.cos, META.souls || 0, id);
        if (!res) { addToast('NOT ENOUGH SOULS', '#ff8a4a', `${def.price} ◆ needed`); return; }
        META.cos = res.state;
        META.souls = res.souls;
        addToast('UNLOCKED · ' + def.name, '#7aff9a', 'cosmetic only — no stats');
      }
      saveMeta();
      sfx.ui();
      renderArchive('cos');
    }));
  }

  if(tab==='souls'){
    let h=`<div class="arc-soul-head"><div><div class="arc-soul-count">${META.souls.toLocaleString()}<small>SOULS BANKED</small></div></div>
      <div style="text-align:right;font-size:11px;color:#9a8a6a;line-height:1.5">
        ${META.stats.runs} runs · ${META.stats.kills.toLocaleString()} kills<br>
        best wave ${META.stats.bestWave} · best score ${(META.stats.bestScore||0).toLocaleString()}
      </div></div>`;
    for(const t of SOUL_TRACKS){
      const rank=META.shop[t.id]||0, maxed=rank>=t.max, cost=maxed?0:t.cost[rank], afford=META.souls>=cost;
      h+=`<div class="arc-track"><div><b>${t.name}</b><small>${t.desc}</small>
        <div class="arc-pips"><span style="font-size:9px;color:#8a7a5a;letter-spacing:.12em;margin-right:4px">RANK ${rank}/${t.max}</span>${Array.from({length:t.max},(_,i)=>`<span class="arc-pip${i<rank?' on':''}"></span>`).join('')}</div></div>
        <button class="arc-buy" data-track="${t.id}" ${maxed||!afford?'disabled':''}>${maxed?'MAX':cost+' ◆'}</button></div>`;
    }
    soulsEl.innerHTML=h;
    soulsEl.querySelectorAll('.arc-buy').forEach(btn=>btn.addEventListener('click',()=>{
      buySoulTrack(btn.getAttribute('data-track'));
      sfx.ui(); renderArchive('souls');
    }));
  }

  if(tab==='ach'){
    const got=ACHIEVEMENTS.filter(a=>META.ach[a.id]).length;
    let h=`<div style="font-size:11px;color:#9a8a6a;margin-bottom:8px">${got} / ${ACHIEVEMENTS.length} unlocked</div><div class="arc-grid">`;
    for(const a of ACHIEVEMENTS){
      const on=!!META.ach[a.id];
      h+=`<div class="arc-card${on?' got':''}"><div class="t">${on?'🏆':'🔒'} ${a.name}</div><div class="d">${a.desc}</div></div>`;
    }
    achEl.innerHTML=h+'</div>';
  }

  if(tab==='runs'){
    if(!META.runs.length){ runsEl.innerHTML='<div style="color:#8a7a5a;font-size:12px;padding:10px">No runs recorded yet. Die once and this fills up.</div>'; }
    else{
      runsEl.innerHTML=META.runs.map(r=>{
        const C=CLASSES[r.cls]||{};
        const d=new Date(r.date);
        const when=d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
        return `<div class="arc-row"><span><b style="color:${C.color||'#f0c14b'}">${C.name||r.cls}</b>
          <span style="color:#6a5a44"> · ${r.diff}${r.won?' · <b style="color:#7aff9a">WON</b>':''}</span></span>
          <span>wave <b>${r.wave}</b> · ${r.kills} kills · score <b>${(r.score||0).toLocaleString()}</b> · <span style="color:#6a5a44">${when}</span></span></div>`;
      }).join('');
    }
  }

  if(tab==='codex'){
    let h='<div class="arc-codex">';
    for(const b of CODEX_BOSSES){
      const seen=!!META.codex['seen_'+b.key], killed=!!META.codex['killed_'+b.key];
      if(!seen && !killed){
        h+=`<div class="arc-boss locked"><img src="/art/boss-${b.img}.png" alt=""><div class="n">???</div><div class="r">undiscovered</div></div>`;
      } else {
        h+=`<div class="arc-boss"><img src="/art/boss-${b.img}.png" alt="${b.name}">
          <div class="n">${b.name}${killed?' ⚔':''}</div><div class="r">${b.realm}</div><div class="l">${b.line}</div></div>`;
      }
    }
    /* regular creatures, discovered by meeting them */
    const realmOf = {};
    for (const b of BIOMES) for (const k of b.enemies) if (!realmOf[k]) realmOf[k] = b.name;
    const keys = Object.keys(ENEMY_LORE);
    const found = keys.filter(k => !!META.codex['e_' + k]).length;
    h += `</div><div style="display:flex;justify-content:space-between;align-items:baseline;margin:16px 2px 8px">
            <span style="font:700 12px 'Trebuchet MS',sans-serif;color:#ffd54f;letter-spacing:.14em">CREATURES</span>
            <span style="font-size:11px;color:#8a7a5a">${found} / ${keys.length} discovered</span></div>`;
    h += '<div class="arc-grid">';
    for (const k of keys) {
      const seen = !!META.codex['e_' + k];
      const e = ENEMY_LORE[k];
      const where = realmOf[k] || 'Unknown realm';
      h += seen
        ? `<div class="arc-card got"><div class="t">${e.name}</div><div class="d">${e.note}</div>
             <div class="d" style="color:#6a5a44;margin-top:4px">${where}</div></div>`
        : `<div class="arc-card"><div class="t">???</div><div class="d">Not yet encountered</div></div>`;
    }
    codexEl.innerHTML = h + '</div>';
  }
}
function openArchive(tab){
  tab=tab||'souls';
  const el=document.getElementById('archiveScreen');
  if(!el)return;
  renderArchive(tab);
  el.classList.remove('hidden');
}

document.getElementById('settingsBtn')?.addEventListener('click',()=>{ sfx.ui(); ov.classList.remove('hidden'); syncSettingsUI(); });
document.getElementById('archiveBtn')?.addEventListener('click',()=>{ sfx.ui(); openArchive('souls'); });
document.getElementById('archiveClose')?.addEventListener('click',()=>{ sfx.ui(); document.getElementById('archiveScreen')?.classList.add('hidden'); });
document.querySelectorAll('.arc-tab').forEach(b=>b.addEventListener('click',()=>{ sfx.ui(); renderArchive(b.getAttribute('data-tab')); }));
  document.getElementById('settingsClose')?.addEventListener('click',()=>{ sfx.ui(); close(); });
  ov.addEventListener('click',(e)=>{ if(e.target===ov) close(); });
  const bindRange=(id,key)=>{
    const el=document.getElementById(id) as HTMLInputElement|null;
    if(!el)return;
    el.addEventListener('input',()=>{
      (SETTINGS as any)[key]=Number(el.value)/100;
      applySettings(); syncSettingsUI();
    });
    el.addEventListener('change',()=>{ saveSettings(); });
  };
  bindRange('setSfx','sfxVol');
  bindRange('setMusic','musicVol');
  const bindToggle=(id,apply)=>{
    const el=document.getElementById(id) as HTMLInputElement|null;
    if(!el)return;
    el.addEventListener('change',()=>{ apply(el.checked); applySettings(); saveSettings(); });
  };
  bindToggle('setFlash',(on)=>{ SETTINGS.flash=!on; });
  bindToggle('setShake',(on)=>{ SETTINGS.shake=!on; });
  bindToggle('setVfx',(on)=>{ SETTINGS.vfx=on; });
  bindToggle('setAutoPause',(on)=>{ SETTINGS.autoPause=on; });
  document.getElementById('dailyBtn')?.addEventListener('click',()=>{ sfx.ui(); startDailyRun(); });
  document.getElementById('weeklyBtn')?.addEventListener('click',()=>{ sfx.ui(); startWeeklyRun(); });
  document.getElementById('rushBtn')?.addEventListener('click',()=>{ sfx.ui(); startBossRush(); });
  document.getElementById('setProfile')?.addEventListener('change',(ev)=>{ const v=(ev.target as HTMLSelectElement).value; SETTINGS.profile=v; applyColorProfile(v); saveSettings(); });
  try{
    const last=localStorage.getItem('sd_daily_last');
    const info=dailyInfo();
    if(last===info.key){
      const db=document.getElementById('dailyBtn');
      if(db) db.textContent='🗓 TRIAL DONE';
    }
  }catch(e){}
}

/* Boot */
try { loadSettings(); } catch(e) { console.error('❌ loadSettings:', e); }
try { initSettingsUI(); } catch(e) { console.error('❌ initSettingsUI:', e); }
try { buildEquipUI(); } catch(e) { console.error('❌ buildEquipUI:', e); }
try { refreshContinuePanel(); } catch(e) { console.error('❌ refreshContinuePanel:', e); }
try { renderClassGrid(currentArch); } catch(e) { console.error('❌ renderClassGrid:', e); }
try { applyLang(); } catch(e) { console.error('❌ applyLang:', e); }
try { updateDiffUI(); } catch(e) { console.error('❌ updateDiffUI:', e); }
try { initFirebaseUI(); } catch(e) { console.error('❌ initFirebaseUI:', e); }
try {
  const _pb=document.getElementById('potionBtn');
  if(_pb)_pb.addEventListener('click',()=>{sfx.ui();drinkPotion()});
  const _lb=document.getElementById('langBtn');
  if(_lb)_lb.addEventListener('click',()=>{
    sfx.ui();
    toggleLang();
    applyLang();
    if(tut.active)renderTut();
  });
  document.querySelectorAll('#diffSel .diff-opt').forEach(b=>{
    b.addEventListener('click',()=>{sfx.ui();setDiff(b.dataset.diff)});
  });
  const _br=document.getElementById('bestRun');
  if(_br){
    try{
      const b=JSON.parse(localStorage.getItem('sd_best')||'null');
      if(b)_br.textContent='🏆 BEST: Wave '+b.wave+' · '+(b.kills||0)+' kills'+(CLASSES[b.cls]?(' · '+CLASSES[b.cls].name):'');
    }catch(e){}
  }
} catch(e) { console.error('❌ UI bindings:', e); }
console.log('🎮 SASTRA DUNGEON: ANGKOR ERA booted. Total classes:', Object.keys(CLASSES).length);
console.log('🤖 Smart auto-play ready. Press O in-game to toggle');

/* expose for the story-intro wrapper (main.ts import order: game -> intro) */
(window as any).startGame = startGame;
