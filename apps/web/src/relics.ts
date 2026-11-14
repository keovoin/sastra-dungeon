/**
 * Relics — the first slice of game.ts to leave `@ts-nocheck` behind.
 *
 * Deliberately pure: no DOM, no global state, no imports. That is what makes it
 * safe to extract from a 7,800-line file — every function here can be called
 * with plain data and returns plain data, so it can be typed properly and
 * tested without a browser.
 */

export type RelicStat = 'dmg' | 'hp' | 'atk' | 'spd' | 'crit' | 'gold' | 'armor' | 'regen';

export type RelicMods = Record<RelicStat, number>;

export type Relic = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** additive fractions (0.12 = +12%) or flat points for armor */
  mod: Partial<RelicMods>;
};

export const RELIC_SLOTS = 3;

export const RELIC_DEFS: readonly Relic[] = [
  { id: 'fang', name: 'Naga Fang', icon: '🐍', desc: '+12% damage', mod: { dmg: 0.12 } },
  { id: 'lotus', name: 'Lotus Heart', icon: '🪷', desc: '+15% max HP', mod: { hp: 0.15 } },
  { id: 'drum', name: 'Battle Drum', icon: '🥁', desc: '+10% attack speed', mod: { atk: 0.1 } },
  { id: 'sandal', name: 'Apsara Sandal', icon: '🩰', desc: '+8% move speed', mod: { spd: 0.08 } },
  { id: 'eye', name: 'Third Eye', icon: '👁', desc: '+7% crit chance', mod: { crit: 0.07 } },
  { id: 'coin', name: 'Merchant Seal', icon: '🪙', desc: '+25% gold found', mod: { gold: 0.25 } },
  { id: 'shield', name: 'Laterite Plate', icon: '🛡', desc: '+25 armor', mod: { armor: 25 } },
  { id: 'prayer', name: 'Prayer Beads', icon: '📿', desc: '+18% energy regeneration', mod: { regen: 0.18 } },
] as const;

const ZERO: RelicMods = { dmg: 0, hp: 0, atk: 0, spd: 0, crit: 0, gold: 0, armor: 0, regen: 0 };

export function relicById(id: string): Relic | undefined {
  return RELIC_DEFS.find((r) => r.id === id);
}

export function isRelicId(id: unknown): id is string {
  return typeof id === 'string' && RELIC_DEFS.some((r) => r.id === id);
}

/** Sum the modifiers of every relic carried. Unknown ids are ignored, never thrown on. */
export function relicMods(player: { relics?: readonly string[] } | null | undefined): RelicMods {
  const out: RelicMods = { ...ZERO };
  const carried = (player && player.relics) || [];
  for (const id of carried) {
    const relic = relicById(id);
    if (!relic) continue;
    for (const key of Object.keys(relic.mod) as RelicStat[]) {
      out[key] += relic.mod[key] ?? 0;
    }
  }
  return out;
}

export function relicOptions(owned: readonly string[]): Relic[] {
  const have = new Set(owned);
  return RELIC_DEFS.filter((r) => !have.has(r.id));
}

/** Used by the save-restore path: drop anything that is not a live relic id. */
export function sanitizeRelics(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const id of list) {
    if (isRelicId(id) && !out.includes(id)) out.push(id);
    if (out.length >= RELIC_SLOTS) break;
  }
  return out;
}
