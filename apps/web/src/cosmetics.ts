/**
 * Cosmetics — auras and weapon effects.
 *
 * Strictly visual. Nothing in this module can change a stat: there is no field
 * for damage, armour or speed, and a unit test asserts that. The point of a
 * cosmetic shop is that it cannot become pay-to-win by accident, so the shape of
 * the data enforces it rather than a convention does.
 *
 * Bought with souls earned in play — no real-money rail, no currency of its own.
 */

export type CosmeticKind = 'aura' | 'weapon';

export type CosmeticStyle =
  | 'orbit' | 'ring' | 'flame' | 'lotus' | 'star' | 'serpent' | 'storm'
  | 'trail' | 'slash' | 'spark';

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  name: string;
  desc: string;
  /** souls — the same currency banked from runs */
  price: number;
  primary: string;
  secondary: string;
  accent: string;
  style: CosmeticStyle;
}

export const COSMETIC_DEFS: readonly CosmeticDef[] = [
  // ── auras ───────────────────────────────────────────────────────────────
  { id: 'surya', kind: 'aura', name: 'Surya Solar Sovereign', desc: 'A sun-disc crown turning behind your shoulders.', price: 260,
    primary: '#ffb02e', secondary: '#ff6a1a', accent: '#ffe9a8', style: 'star' },
  { id: 'nagaKing', kind: 'aura', name: 'Seven-Headed Naga King', desc: 'Seven hoods of jade light, awake and watching.', price: 320,
    primary: '#1fbf8f', secondary: '#0a6b52', accent: '#8fffcf', style: 'serpent' },
  { id: 'bayon', kind: 'aura', name: 'Bayon Starlight Mandala', desc: 'A mandala of cold stars, drawn in the air.', price: 280,
    primary: '#ffd76a', secondary: '#7a5a12', accent: '#fff6cf', style: 'ring' },
  { id: 'apsara', kind: 'aura', name: 'Apsara Petal Veil', desc: 'Petal-light drifting from a dance you cannot hear.', price: 220,
    primary: '#ff7fb0', secondary: '#8a2a52', accent: '#ffd6e6', style: 'lotus' },
  { id: 'tevoda', kind: 'aura', name: 'Tevoda Moonwake', desc: 'The pale ring a moon leaves on still water.', price: 240,
    primary: '#9fd0ff', secondary: '#2a4a7a', accent: '#e8f4ff', style: 'ring' },
  { id: 'kala', kind: 'aura', name: 'Kala Ember Crown', desc: 'The devouring face, remembered as cinders.', price: 300,
    primary: '#ff5c2a', secondary: '#5a1404', accent: '#ffcf6a', style: 'flame' },
  { id: 'neakta', kind: 'aura', name: 'Neak Ta Earthblood', desc: 'Old stone breathing warm earth-light.', price: 200,
    primary: '#8a7a3a', secondary: '#3a3210', accent: '#d8c07a', style: 'orbit' },
  { id: 'indra', kind: 'aura', name: 'Indra Vajra Storm', desc: 'A thunderbolt held still, humming.', price: 360,
    primary: '#b47cff', secondary: '#3a1a6a', accent: '#e8d8ff', style: 'storm' },

  // ── weapon effects ──────────────────────────────────────────────────────
  { id: 'lotusEdge', kind: 'weapon', name: 'Lotus Edge', desc: 'Petals scatter from every strike.', price: 180,
    primary: '#ff9fc4', secondary: '#a02a58', accent: '#ffe0ec', style: 'spark' },
  { id: 'nagaTrail', kind: 'weapon', name: 'Naga Fang Trail', desc: 'A serpent\'s wake follows your blade.', price: 200,
    primary: '#3fe0a8', secondary: '#0a5a3a', accent: '#c9ffe6', style: 'trail' },
  { id: 'solarCuts', kind: 'weapon', name: 'Solar Flare Cuts', desc: 'Each swing throws a shard of noon.', price: 220,
    primary: '#ffc23a', secondary: '#8a4a02', accent: '#fff0b8', style: 'slash' },
  { id: 'frostSigil', kind: 'weapon', name: 'Frost Sigil', desc: 'Frost writes itself where you cut.', price: 190,
    primary: '#8fe4ff', secondary: '#1a4a68', accent: '#e6f9ff', style: 'spark' },
  { id: 'shadeSlash', kind: 'weapon', name: 'Shadow Slash', desc: 'The cut arrives before the light does.', price: 210,
    primary: '#a060ff', secondary: '#2a0a4a', accent: '#dcc4ff', style: 'slash' },
  { id: 'thunderclap', kind: 'weapon', name: 'Thunderclap', desc: 'A crack of white where the blow lands.', price: 240,
    primary: '#ffe9a8', secondary: '#6a5a20', accent: '#ffffff', style: 'trail' },
] as const;

export interface CosmeticState {
  owned: string[];
  aura: string | null;
  weapon: string | null;
}

export function emptyCosmetics(): CosmeticState {
  return { owned: [], aura: null, weapon: null };
}

export function cosmeticById(id: string | null | undefined): CosmeticDef | undefined {
  if (!id) return undefined;
  return COSMETIC_DEFS.find((c) => c.id === id);
}

export function cosmeticsOf(kind: CosmeticKind): CosmeticDef[] {
  return COSMETIC_DEFS.filter((c) => c.kind === kind);
}

export function ownsCosmetic(state: CosmeticState | null | undefined, id: string): boolean {
  return !!(state && state.owned && state.owned.includes(id));
}

export function isEquipped(state: CosmeticState | null | undefined, id: string): boolean {
  return !!(state && (state.aura === id || state.weapon === id));
}

/** Repair whatever is in the save: unknown ids dropped, equipment must be owned. */
export function sanitizeCosmetics(raw: unknown): CosmeticState {
  const out = emptyCosmetics();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.owned)) {
    for (const id of o.owned) {
      if (typeof id === 'string' && cosmeticById(id) && !out.owned.includes(id)) out.owned.push(id);
    }
  }
  for (const kind of ['aura', 'weapon'] as CosmeticKind[]) {
    const id = o[kind];
    if (typeof id === 'string' && cosmeticById(id) && cosmeticById(id)!.kind === kind && out.owned.includes(id)) {
      out[kind] = id;
    }
  }
  return out;
}

export function canAfford(souls: number, def: CosmeticDef): boolean {
  return souls >= def.price;
}

/** Purchase: returns the next state, or null when the buy is not allowed. */
export function buyCosmetic(state: CosmeticState, souls: number, id: string): { state: CosmeticState; souls: number } | null {
  const def = cosmeticById(id);
  if (!def || ownsCosmetic(state, id)) return null;
  if (souls < def.price) return null;
  return {
    state: { ...state, owned: [...state.owned, id] },
    souls: souls - def.price,
  };
}

/** Equip (or clear, with null) one slot. Only owned cosmetics can be worn. */
export function equipCosmetic(state: CosmeticState, kind: CosmeticKind, id: string | null): CosmeticState {
  if (id === null) return { ...state, [kind]: null };
  const def = cosmeticById(id);
  if (!def || def.kind !== kind || !ownsCosmetic(state, id)) return state;
  return { ...state, [kind]: id };
}

/** Owned-only view for the shop grid. */
export function wardrobe(state: CosmeticState): CosmeticDef[] {
  return COSMETIC_DEFS.filter((c) => ownsCosmetic(state, c.id));
}
