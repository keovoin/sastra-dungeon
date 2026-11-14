/**
 * Level-up choices — the attribute blessings offered at each level.
 *
 * Sixth piece to leave `@ts-nocheck`. Small, but it is the table every player
 * reads dozens of times per run, and the one place a missing id silently makes a
 * blessing unpickable: `p.attrs[d.id]` on an undefined key yields NaN resets
 * rather than a crash.
 */

export type AttrId =
  | 'str' | 'vit' | 'agi' | 'wis' | 'lck'
  | 'haste' | 'swift' | 'leech' | 'mend' | 'stone' | 'magnet';

export interface AttrDef {
  id: AttrId;
  kind: 'attr';
  icon: string;
  name: string;
  desc: string;
  /** maximum ranks purchasable in one run */
  cap: number;
}

export const ATTR_DEFS: readonly AttrDef[] = [
  { id: 'str', kind: 'attr', icon: '⚔️', name: 'Kshatriya Might (STR)', desc: '+14% Attack Damage · +6% Attack Range', cap: 12 },
  { id: 'vit', kind: 'attr', icon: '🪨', name: 'Bayon Stoneheart (VIT)', desc: '+16% Max HP · +12 Armor · Heal 18% HP', cap: 12 },
  { id: 'agi', kind: 'attr', icon: '🌪️', name: 'Garuda Windstep (AGI)', desc: '+12% Attack Speed · +8% Move Speed', cap: 10 },
  { id: 'wis', kind: 'attr', icon: '🔮', name: 'Sastra Prana (WIS)', desc: '-9% Skill Cooldowns · +2.5 Energy Regen', cap: 10 },
  { id: 'lck', kind: 'attr', icon: '🐍', name: 'Naga Fortune (LCK)', desc: '+5% Critical Chance · +18% Crit Damage', cap: 10 },
  { id: 'haste', kind: 'attr', icon: '⚡', name: 'Apsara Haste (HASTE)', desc: '+12% Attack Speed — basics only', cap: 10 },
  { id: 'swift', kind: 'attr', icon: '👣', name: 'Naga Stride (SWIFT)', desc: '+10% Move Speed — dodge faster', cap: 8 },
  { id: 'leech', kind: 'attr', icon: '🩸', name: 'Rakshasa Thirst (LEECH)', desc: '+2% Life Steal on basic attacks', cap: 10 },
  { id: 'mend', kind: 'attr', icon: '🌿', name: 'Bodhi Mend (MEND)', desc: '+0.8 HP/s Health Regen', cap: 10 },
  { id: 'stone', kind: 'attr', icon: '🛡️', name: 'Laterite Skin (STONE)', desc: '+12 Armor — flat damage reduction', cap: 10 },
  { id: 'magnet', kind: 'attr', icon: '🧲', name: 'Lotus Attraction (MAGNET)', desc: '+37 pickup radius — orbs fly to you', cap: 8 },
] as const;

export type AttrMap = Record<AttrId, number>;

export function emptyAttrs(): AttrMap {
  return { str: 0, vit: 0, agi: 0, wis: 0, lck: 0, haste: 0, swift: 0, leech: 0, mend: 0, stone: 0, magnet: 0 };
}

/** Generic upgrade counters — kept in step with what recalcStats reads. */
export interface UpgCounters {
  dmg: number;
  atk: number;
  shots: number;
  spd: number;
  hp: number;
  crit: number;
  cd: number;
  range: number;
}

export const UPG_KEYS: readonly (keyof UpgCounters)[] = ['dmg', 'atk', 'shots', 'spd', 'hp', 'crit', 'cd', 'range'];

export function emptyUpg(): UpgCounters {
  return { dmg: 0, atk: 0, shots: 0, spd: 0, hp: 0, crit: 0, cd: 0, range: 0 };
}

export function attrById(id: string): AttrDef | undefined {
  return ATTR_DEFS.find((a) => a.id === id);
}

/** Clamp a rank into range — saves are untrusted input. */
export function clampRank(def: AttrDef, value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, Math.min(def.cap, n));
}

/** Blessings with room left, in table order. */
export function availableAttrs(attrs: Partial<AttrMap>): AttrDef[] {
  return ATTR_DEFS.filter((d) => (attrs[d.id] || 0) < d.cap);
}

/** Sanitize a whole attribute map from a save. */
export function sanitizeAttrs(raw: unknown): AttrMap {
  const out = emptyAttrs();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  for (const def of ATTR_DEFS) out[def.id] = clampRank(def, o[def.id]);
  return out;
}
