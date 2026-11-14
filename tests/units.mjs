// Unit tests for the modules that have left `@ts-nocheck`.
// These are pure: no browser, no DOM, no network. Bundled by esbuild first
// because Node cannot import .ts directly in every version we support.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const target = process.env.UNITS_ENTRY || '.tmp/relics.mjs';
const mod = await import(pathToFileURL(path.resolve(target)).href);

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

console.log(`\n${pass} passed, ${fail} failed`);
