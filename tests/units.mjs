// Unit tests for the modules that have left `@ts-nocheck`.
// These are pure: no browser, no DOM, no network. Bundled by esbuild first
// because Node cannot import .ts directly in every version we support.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const load = async (file) => import(pathToFileURL(path.resolve(process.env.UNITS_DIR || '.tmp', file)).href);
const mod = await load('relics.mjs');
const world = await load('world.mjs');

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

console.log(`\n${pass} passed, ${fail} failed`);
