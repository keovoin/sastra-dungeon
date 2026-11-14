// Unit tests for the modules that have left `@ts-nocheck`.
// These are pure: no browser, no DOM, no network. Bundled by esbuild first
// because Node cannot import .ts directly in every version we support.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const load = async (file) => import(pathToFileURL(path.resolve(process.env.UNITS_DIR || '.tmp', file)).href);
const mod = await load('relics.mjs');
const world = await load('world.mjs');
const meta = await load('meta.mjs');

let pass = 0;
let fail = 0;
const check = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log('PASS', name);
  } catch (e) {
    fail += 1;
    console.log('FAIL', name, '—', e.message);
    process.exitCode = 1;
  }
};

check('eight relics, unique ids', () => {
  assert.equal(mod.RELIC_DEFS.length, 8);
  assert.equal(new Set(mod.RELIC_DEFS.map((r) => r.id)).size, 8);
});

check('every relic has a non-empty effect', () => {
  for (const r of mod.RELIC_DEFS) {
    assert.ok(Object.keys(r.mod).length > 0, `${r.id} has no mod`);
    assert.ok(r.name && r.icon && r.desc, `${r.id} missing text`);
  }
});

check('one relic yields its own modifier', () => {
  const m = mod.relicMods({ relics: ['fang'] });
  assert.equal(m.dmg, 0.12);
  assert.equal(m.hp, 0);
});

check('modifiers add up across slots', () => {
  const m = mod.relicMods({ relics: ['fang', 'shield'] });
  assert.equal(m.dmg, 0.12);
  assert.equal(m.armor, 25);
});

check('a repeated id stacks (sanitize is what prevents it in game)', () => {
  assert.equal(mod.relicMods({ relics: ['fang', 'fang'] }).dmg, 0.24);
});

check('no relics is all zeroes, not undefined', () => {
  for (const input of [null, undefined, {}, { relics: [] }]) {
    const m = mod.relicMods(input);
    assert.deepEqual(Object.values(m), [0, 0, 0, 0, 0, 0, 0, 0]);
  }
});

check('unknown ids are ignored, never thrown on', () => {
  const m = mod.relicMods({ relics: ['not-a-relic', 'fang'] });
  assert.equal(m.dmg, 0.12);
});

check('sanitize drops junk, dedupes and caps at three', () => {
  assert.deepEqual(mod.sanitizeRelics(['fang', 'fang', 'nope', 'shield', 'drum', 'lotus']), ['fang', 'shield', 'drum']);
  assert.deepEqual(mod.sanitizeRelics('nope'), []);
  assert.deepEqual(mod.sanitizeRelics([1, 2, null]), []);
});

check('options never include one already carried', () => {
  const remaining = mod.relicOptions(['fang', 'shield']);
  assert.equal(remaining.length, 6);
  assert.ok(!remaining.some((r) => r.id === 'fang' || r.id === 'shield'));
});

// ── world data ────────────────────────────────────────────────────────────
check('six realms', () => {
  assert.equal(world.BIOMES.length, 6);
  assert.equal(new Set(world.BIOMES.map((b) => b.key)).size, 6);
});

check('every realm has a roster of five or more', () => {
  for (const b of world.BIOMES) {
    assert.ok(b.enemies.length >= 5, `${b.key} has ${b.enemies.length}`);
    assert.ok(b.boss, `${b.key} has no boss`);
  }
});

check('no realm spawns a creature that does not exist', () => {
  for (const b of world.BIOMES) {
    for (const id of b.enemies) {
      assert.ok(world.ENEMY_TYPES[id], `${b.key} spawns unknown '${id}'`);
    }
  }
});

check('every creature is documented', () => {
  const missing = Object.keys(world.ENEMY_TYPES).filter((id) => !world.ENEMY_LORE[id]);
  assert.deepEqual(missing, []);
});

check('every creature has the stats the engine reads', () => {
  for (const [id, t] of Object.entries(world.ENEMY_TYPES)) {
    for (const f of ['hp', 'speed', 'dmg', 'r', 'xp', 'range', 'atkCd']) {
      assert.equal(typeof t[f], 'number', `${id}.${f} is ${typeof t[f]}`);
      assert.ok(t[f] > 0, `${id}.${f} is ${t[f]}`);
    }
    assert.ok(t.color.startsWith('#'), `${id}.color = ${t.color}`);
    assert.ok(t.behavior, `${id} has no behavior`);
  }
});

check('palette variants point at a real sprite family', () => {
  for (const [id, t] of Object.entries(world.ENEMY_TYPES)) {
    if (t.sprite) assert.ok(world.ENEMY_TYPES[t.sprite], `${id} reuses unknown sprite '${t.sprite}'`);
  }
});

// ── meta progression, especially the cloud merge ──────────────────────────
check('empty meta is a complete shape', () => {
  const m = meta.emptyMeta();
  assert.equal(m.souls, 0);
  assert.deepEqual(Object.keys(m.shop).sort(), ['atk', 'dmg', 'fort', 'hp']);
  assert.deepEqual(m.runs, []);
});

check('corrupt state is repaired, not trusted', () => {
  const m = meta.sanitizeMeta({ souls: 'lots', shop: { hp: 99, dmg: -4 }, runs: 'nope', stats: { bestWave: NaN } });
  assert.equal(m.souls, 0);
  assert.equal(m.shop.hp, 5, 'rank clamps to the track max');
  assert.equal(m.shop.dmg, 0, 'negative rank clamps to zero');
  assert.deepEqual(m.runs, []);
  assert.equal(m.stats.bestWave, 0);
});

check('garbage in, valid state out', () => {
  for (const bad of [null, undefined, 42, 'x', [], { runs: [null, {}, { cls: 'warrior' }] }]) {
    const m = meta.sanitizeMeta(bad);
    assert.equal(typeof m.souls, 'number');
    assert.ok(Array.isArray(m.runs));
  }
});

check('merge never loses local progress', () => {
  const local = meta.sanitizeMeta({ souls: 300, earned: 400, shop: { hp: 3 }, stats: { bestWave: 20, runs: 4 } });
  const { next, changed } = meta.mergeMeta(local, { souls: 100, shop: { hp: 1, dmg: 2 }, stats: { bestWave: 12, runs: 9 } });
  assert.equal(next.souls, 300, 'higher soul count wins');
  assert.equal(next.shop.hp, 3, 'higher rank wins');
  assert.equal(next.shop.dmg, 2, 'a cloud-only rank is adopted');
  assert.equal(next.stats.bestWave, 20, 'best wave is a max, not an overwrite');
  assert.equal(next.stats.runs, 9, 'run count is a max');
  assert.equal(changed, true);
});

check('merging the same cloud twice is a no-op', () => {
  const local = meta.sanitizeMeta({ souls: 50, codex: { killed_cryptLord: true } });
  const cloud = { souls: 80, codex: { seen_fallen: true } };
  const once = meta.mergeMeta(local, cloud).next;
  const twice = meta.mergeMeta(once, cloud);
  assert.equal(twice.changed, false, 'second merge must report no change');
  assert.equal(twice.next.souls, 80);
});

check('history unions and dedupes', () => {
  const mk = (d) => ({ cls: 'warrior', wave: 3, kills: 5, score: 10, date: d, diff: 'normal', won: false });
  const local = meta.sanitizeMeta({ runs: Array.from({ length: 8 }, (_, i) => mk(1000 + i)) });
  const cloud = { runs: [...Array.from({ length: 8 }, (_, i) => mk(1000 + i)), mk(2000)] };
  const { next } = meta.mergeMeta(local, cloud);
  assert.equal(next.runs.length, 9, '8 shared + 1 new');
  assert.equal(next.runs[0].date, 2000, 'newest first');
  assert.equal(new Set(next.runs.map((r) => r.date)).size, next.runs.length, 'no duplicates');
});

check('history is capped at ten, newest kept', () => {
  const mk = (d) => ({ cls: 'warrior', wave: 3, kills: 5, score: 10, date: d, diff: 'normal', won: false });
  const local = meta.sanitizeMeta({ runs: Array.from({ length: 10 }, (_, i) => mk(1000 + i)) });
  const cloud = { runs: Array.from({ length: 5 }, (_, i) => mk(3000 + i)) };
  const { next } = meta.mergeMeta(local, cloud);
  assert.equal(next.runs.length, 10, 'cap holds');
  assert.deepEqual(next.runs.slice(0, 5).map((r) => r.date), [3004, 3003, 3002, 3001, 3000], 'newest five survive');
});

check('soul formula is bounded and monotonic', () => {
  assert.equal(meta.soulsFromRun(0, 0, 0), 5, 'floor of five souls');
  assert.ok(meta.soulsFromRun(30, 100, 5000) > meta.soulsFromRun(10, 20, 900));
});

check('achievements fire from state, not closures', () => {
  const m = meta.sanitizeMeta({ stats: { bestWave: 26, kills: 3, bestKills: 12, runs: 2 }, earned: 100 });
  const got = meta.newlyEarned(m).map((a) => a.id);
  assert.ok(got.includes('first_blood'));
  assert.ok(got.includes('wave10') && got.includes('wave25'));
  assert.ok(!got.includes('wave50'), 'wave 50 must not fire at wave 26');
  assert.ok(!got.includes('soul500'), 'Soulkeeper needs 500 earned');
});

check('a broken predicate cannot block the others', () => {
  const m = meta.sanitizeMeta({});
  const broken = { id: 'broken', name: 'x', desc: 'x', test: () => { throw new Error('boom'); } };
  const list = [broken, ...meta.ACHIEVEMENTS];
  const got = [];
  for (const a of list) { try { if (a.test(m)) got.push(a.id); } catch { /* expected */ } }
  assert.ok(!got.includes('broken'));
});

console.log(`\n${pass} passed, ${fail} failed`);
