/**
 * Meta progression — souls, permanent upgrades, achievements, codex.
 *
 * Third piece to leave `@ts-nocheck`. The valuable part is not the constants:
 * it is `mergeMeta`, which decides what happens when a local save meets a cloud
 * save. That logic was inline in the engine and had never been tested, and it is
 * the one place where a bug silently eats a player's progress.
 *
 * Pure by design: every function takes state and returns state. No DOM, no
 * globals, no storage side effects — the caller owns persistence.
 */

export interface MetaRun {
  cls: string;
  wave: number;
  kills: number;
  score: number;
  date: number;
  diff: string;
  won: boolean;
}

export interface MetaStats {
  runs: number;
  kills: number;
  bestWave: number;
  bestScore: number;
  bestKills: number;
}

export interface MetaState {
  souls: number;
  earned: number;
  shop: Record<SoulTrackId, number>;
  runs: MetaRun[];
  ach: Record<string, boolean>;
  codex: Record<string, boolean>;
  stats: MetaStats;
}

export type SoulTrackId = 'hp' | 'dmg' | 'atk' | 'fort';

export interface SoulTrack {
  id: SoulTrackId;
  name: string;
  desc: string;
  max: number;
  cost: number[];
}

export const META_KEY = 'sd_meta_v1';
export const MAX_RUNS = 10;

export const SOUL_TRACKS: readonly SoulTrack[] = [
  { id: 'hp', name: 'Laterite Vitality', desc: '+8% max HP per rank', max: 5, cost: [60, 110, 180, 280, 420] },
  { id: 'dmg', name: 'Kshatriya Fury', desc: '+6% damage per rank', max: 5, cost: [70, 130, 210, 320, 480] },
  { id: 'atk', name: 'Apsara Tempo', desc: '+4% attack speed per rank', max: 5, cost: [80, 150, 240, 360, 540] },
  { id: 'fort', name: 'Naga Fortune', desc: '+10% gold per rank', max: 5, cost: [50, 90, 150, 230, 350] },
] as const;

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** pure predicate: no closures over mutable module state */
  test: (m: MetaState) => boolean;
}

const guardianKills = (m: MetaState): number =>
  Object.keys(m.codex).filter((k) => k.indexOf('killed_') === 0).length;

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first_blood', name: 'First Blood', desc: 'Slay your first monster', test: (m) => m.stats.kills >= 1 },
  { id: 'wave10', name: 'Causeway Walker', desc: 'Reach wave 10', test: (m) => m.stats.bestWave >= 10 },
  { id: 'wave25', name: 'Temple Raider', desc: 'Reach wave 25', test: (m) => m.stats.bestWave >= 25 },
  { id: 'wave50', name: 'Sovereign of Sastra', desc: 'Reach wave 50', test: (m) => m.stats.bestWave >= 50 },
  { id: 'serpent', name: 'Serpent Slayer', desc: 'Defeat Naga Raja', test: (m) => !!m.codex.killed_cryptLord },
  { id: 'three', name: 'Three Thrones', desc: 'Defeat three guardians', test: (m) => guardianKills(m) >= 3 },
  { id: 'five', name: 'Six Thrones', desc: 'Defeat all six guardians', test: (m) => guardianKills(m) >= 6 },
  { id: 'kill500', name: 'Deathbringer', desc: '500 kills in a single run', test: (m) => (m.stats.bestKills || 0) >= 500 },
  { id: 'runs10', name: 'Pilgrim', desc: 'Complete 10 runs', test: (m) => m.stats.runs >= 10 },
  { id: 'soul500', name: 'Soulkeeper', desc: 'Bank 500 souls', test: (m) => m.earned >= 500 },
  { id: 'naturalist', name: 'Naturalist', desc: 'Discover 10 creatures', test: (m) => Object.keys(m.codex).filter((k) => k.indexOf('e_') === 0).length >= 10 },
] as const;

export function emptyMeta(): MetaState {
  return {
    souls: 0,
    earned: 0,
    shop: { hp: 0, dmg: 0, atk: 0, fort: 0 },
    runs: [],
    ach: {},
    codex: {},
    stats: { runs: 0, kills: 0, bestWave: 0, bestScore: 0, bestKills: 0 },
  };
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const rank = (v: unknown, max: number): number => {
  const n = Math.floor(num(v, 0));
  return Math.max(0, Math.min(max, n));
};

const boolMap = (v: unknown): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val) out[k] = true;
    }
  }
  return out;
};

const coerceRun = (r: unknown): MetaRun | null => {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  if (typeof o.cls !== 'string' || !o.cls) return null;
  return {
    cls: o.cls,
    wave: num(o.wave),
    kills: num(o.kills),
    score: num(o.score),
    date: num(o.date),
    diff: typeof o.diff === 'string' ? o.diff : 'normal',
    won: !!o.won,
  };
};

/** Turn anything at all — corrupt JSON, an old shape, a hostile cloud blob — into valid state. */
export function sanitizeMeta(raw: unknown): MetaState {
  const base = emptyMeta();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  base.souls = Math.max(0, Math.floor(num(o.souls)));
  base.earned = Math.max(0, Math.floor(num(o.earned)));
  const shop = (o.shop && typeof o.shop === 'object' ? o.shop : {}) as Record<string, unknown>;
  for (const t of SOUL_TRACKS) base.shop[t.id] = rank(shop[t.id], t.max);
  base.ach = boolMap(o.ach);
  base.codex = boolMap(o.codex);
  const stats = (o.stats && typeof o.stats === 'object' ? o.stats : {}) as Record<string, unknown>;
  base.stats = {
    runs: Math.max(0, Math.floor(num(stats.runs))),
    kills: Math.max(0, Math.floor(num(stats.kills))),
    bestWave: Math.max(0, Math.floor(num(stats.bestWave))),
    bestScore: Math.max(0, Math.floor(num(stats.bestScore))),
    bestKills: Math.max(0, Math.floor(num(stats.bestKills))),
  };
  if (Array.isArray(o.runs)) {
    base.runs = o.runs
      .map(coerceRun)
      .filter((r): r is MetaRun => !!r)
      .sort((a, b) => (b.date || 0) - (a.date || 0))
      .slice(0, MAX_RUNS);
  }
  return base;
}

/**
 * Merge a cloud blob into local state.
 * Lifetimes take the max (progress is never lost), unlocks take the union,
 * history is unioned by identity and trimmed to the ten newest.
 */
export function mergeMeta(local: MetaState, cloud: unknown): { next: MetaState; changed: boolean } {
  const merged = sanitizeMeta(local);
  if (!cloud || typeof cloud !== 'object') return { next: merged, changed: false };
  const c = sanitizeMeta(cloud);

  merged.souls = Math.max(merged.souls, c.souls);
  merged.earned = Math.max(merged.earned, c.earned);
  for (const t of SOUL_TRACKS) merged.shop[t.id] = Math.max(merged.shop[t.id] || 0, c.shop[t.id] || 0);
  Object.assign(merged.ach, c.ach);
  Object.assign(merged.codex, c.codex);
  merged.stats = {
    runs: Math.max(merged.stats.runs, c.stats.runs),
    kills: Math.max(merged.stats.kills, c.stats.kills),
    bestWave: Math.max(merged.stats.bestWave, c.stats.bestWave),
    bestScore: Math.max(merged.stats.bestScore, c.stats.bestScore),
    bestKills: Math.max(merged.stats.bestKills, c.stats.bestKills),
  };

  const key = (r: MetaRun): string => `${r.date}-${r.cls}-${r.wave}`;
  const seen = new Set(merged.runs.map(key));
  const extra = c.runs.filter((r) => {
    const k = key(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  merged.runs = [...merged.runs, ...extra]
    .sort((a, b) => (b.date || 0) - (a.date || 0))
    .slice(0, MAX_RUNS);

  const changed = JSON.stringify(sanitizeMeta(local)) !== JSON.stringify(merged);
  return { next: merged, changed };
}

/** Souls banked for a finished run. Same formula the death screen reports. */
export function soulsFromRun(wave: number, kills: number, score: number): number {
  return Math.max(5, Math.round((wave || 1) * 2.2 + (kills || 0) * 0.35 + (score || 0) / 900));
}

export function trackById(id: string): SoulTrack | undefined {
  return SOUL_TRACKS.find((t) => t.id === id);
}

export function trackCost(track: SoulTrack, currentRank: number): number | null {
  if (currentRank >= track.max) return null;
  return track.cost[currentRank] ?? null;
}

export function canBuyRank(meta: MetaState, id: SoulTrackId): boolean {
  const track = trackById(id);
  if (!track) return false;
  const cost = trackCost(track, meta.shop[id] || 0);
  return cost !== null && meta.souls >= cost;
}

/** Newly satisfied achievements, in table order. */
export function newlyEarned(meta: MetaState): Achievement[] {
  const out: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (meta.ach[a.id]) continue;
    try {
      if (a.test(meta)) out.push(a);
    } catch {
      /* a broken predicate must never block the others */
    }
  }
  return out;
}
