/**
 * Gear — slots, rarity, affixes and the rolls that fill them.
 *
 * Fifth piece to leave `@ts-nocheck`. The rolls take an optional rng so they can
 * be asserted deterministically: a loot table that can produce a Legendary with
 * no affixes, or an affix the UI has no label for, is a bug you only find in
 * play otherwise.
 */

export type Slot = 'weapon' | 'helm' | 'chest' | 'gloves' | 'boots' | 'ring' | 'amulet';
export type AffixKey = 'dmg' | 'hp' | 'armor' | 'speed' | 'crit' | 'regen';

export const INV_SIZE = 35;
export const SLOT_ORDER: readonly Slot[] = ['helm', 'amulet', 'chest', 'gloves', 'boots', 'weapon', 'ring'];

export const SLOT_NAMES: Record<Slot, string> = {
  weapon: 'Weapon', helm: 'Helm', chest: 'Chest', gloves: 'Gloves', boots: 'Boots', ring: 'Ring', amulet: 'Amulet',
};

export const SLOT_ICONS: Record<Slot, string> = {
  weapon: '🗡️', helm: '👑', chest: '🛡️', gloves: '🧤', boots: '👢', ring: '💍', amulet: '📿',
};

export const BASES: Record<Slot, readonly string[]> = {
  weapon: ['Blade', 'Axe', 'Bow', 'Orb', 'Mace', 'Spear', 'Scepter', 'Cleaver', 'Scythe', 'Staff', 'Javelin', 'Lute'],
  helm: ['Helm', 'Crown', 'Hood', 'Casque', 'Visage'],
  chest: ['Chestplate', 'Robe', 'Vest', 'Cuirass', 'Hauberk'],
  gloves: ['Gloves', 'Gauntlets', 'Grips', 'Handguards'],
  boots: ['Boots', 'Greaves', 'Treads', 'Striders'],
  ring: ['Ring', 'Band', 'Signet', 'Loop'],
  amulet: ['Amulet', 'Talisman', 'Pendant', 'Charm'],
};

export interface Rarity {
  name: string;
  color: string;
  /** stat multiplier applied to base damage / armor */
  mult: number;
  /** affixes rolled before the ring/amulet bonus */
  affixes: number;
}

export const RARITIES: readonly Rarity[] = [
  { name: 'Common', color: '#b9b0a4', mult: 1.0, affixes: 1 },
  { name: 'Magic', color: '#5aa9ff', mult: 1.55, affixes: 2 },
  { name: 'Rare', color: '#f0c14b', mult: 2.2, affixes: 3 },
  { name: 'Legendary', color: '#ff8f2e', mult: 3.3, affixes: 4 },
];

export const PREFIX: Record<number, readonly string[]> = {
  0: ['Worn', 'Rusty', 'Plain', 'Cracked'],
  1: ['Fine', 'Runed', 'Blessed', 'Keen'],
  2: ['Ancient', 'Grim', 'Storm', 'Vicious'],
  3: ['Godslayer', 'Eternal', 'Doomfang', 'Sunforged'],
};

export interface AffixDef {
  label: string;
  fmt: (v: number) => string;
}

export const AFFIX_DEFS: Record<AffixKey, AffixDef> = {
  dmg: { label: 'Damage', fmt: (v) => '+' + v },
  hp: { label: 'Max HP', fmt: (v) => '+' + v },
  armor: { label: 'Armor', fmt: (v) => '+' + v },
  speed: { label: 'Move Speed', fmt: (v) => '+' + v },
  crit: { label: 'Crit Chance', fmt: (v) => '+' + (v * 100).toFixed(1) + '%' },
  regen: { label: 'Energy Regen', fmt: (v) => '+' + v.toFixed(1) },
};

const ARMOR_SLOTS: readonly Slot[] = ['helm', 'chest', 'gloves', 'boots'];

export function isArmorSlot(slot: Slot): boolean {
  return ARMOR_SLOTS.includes(slot);
}

/** Which affixes can appear on a slot. */
export function affixPool(slot: Slot): readonly AffixKey[] {
  if (slot === 'weapon') return ['hp', 'speed', 'crit', 'regen', 'armor'];
  if (slot === 'ring' || slot === 'amulet') return ['dmg', 'hp', 'armor', 'speed', 'crit', 'regen'];
  return ['hp', 'speed', 'crit', 'regen', 'dmg'];
}

/** Rings and amulets gamble one extra affix — that is their whole appeal. */
export function affixCount(slot: Slot, rarityIdx: number): number {
  const rarity = RARITIES[rarityIdx] || RARITIES[0];
  return rarity.affixes + (slot === 'ring' || slot === 'amulet' ? 1 : 0);
}

export type Rng = () => number;

const span = (rand: Rng, lo: number, hi: number): number => lo + rand() * (hi - lo);

/** Roll one affix. `rand` is injectable so tests can pin the output. */
export function rollAffix(key: AffixKey, wave: number, mult: number, rand: Rng = Math.random): number {
  const w = wave || 1;
  switch (key) {
    case 'dmg': return Math.round(span(rand, 2, 5) * mult * (1 + w * 0.16));
    case 'hp': return Math.round(span(rand, 10, 26) * mult * (1 + w * 0.2));
    case 'armor': return Math.round(span(rand, 6, 16) * mult * (1 + w * 0.22));
    case 'speed': return Math.round(span(rand, 3, 9) * mult);
    case 'crit': return +(span(rand, 0.01, 0.03) * mult).toFixed(3);
    case 'regen': return +(span(rand, 0.5, 1.8) * mult).toFixed(1);
    default: return 0;
  }
}

/** Item level requirement — the gate that stops a wave-2 hero wearing wave-40 gear. */
export function requiredLevel(wave: number, rarityIdx: number): number {
  return Math.max(1, Math.round((wave || 1) * 0.7) + (rarityIdx === 3 ? 1 : 0));
}

export function rollName(rarityIdx: number, slot: Slot, rand: Rng = Math.random): string {
  const prefixes = PREFIX[rarityIdx] || PREFIX[0];
  const bases = BASES[slot];
  return `${prefixes[Math.floor(rand() * prefixes.length)]} ${bases[Math.floor(rand() * bases.length)]}`;
}
