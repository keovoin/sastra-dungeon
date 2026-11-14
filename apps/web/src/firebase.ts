import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export interface LeaderboardRecord {
  uid: string;
  displayName: string;
  photoURL: string;
  cls: string;
  className: string;
  archetype: string;
  wave: number;
  kills: number;
  level: number;
  gold: number;
  score: number;
  difficulty: 'easy' | 'normal' | 'hard';
  titleName: string;
  realmName: string;
  isPublic: boolean;
  updatedAtMs?: number;
}

const cleanStr = (val: unknown, fallback: string, maxLen: number): string => {
  const s = typeof val === 'string' && val.trim().length > 0 ? val.trim() : fallback;
  return s.slice(0, maxLen);
};

const cleanId = (val: unknown, fallback: string, maxLen = 40): string => {
  const raw = typeof val === 'string' ? val.replace(/[^a-zA-Z0-9_\-]/g, '') : '';
  return (raw || fallback).slice(0, maxLen);
};

const clampNum = (val: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : fallback;
  return Math.max(min, Math.min(max, n));
};

export function computeHeroScore(wave: number, kills: number, level: number, gold: number, difficulty: string): number {
  const mult = difficulty === 'hard' ? 1.5 : difficulty === 'easy' ? 0.8 : 1.0;
  const raw = (Math.max(1, wave) * 1000) + (Math.max(0, kills) * 25) + (Math.max(1, level) * 180) + Math.floor(Math.max(0, gold) * 0.5);
  return clampNum(raw * mult, 0, 1000000000, 100);
}

export async function loginWithGoogle(): Promise<User | null> {
  try {
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  } catch (err) {
    console.warn('Google sign-in cancelled or failed:', err);
    return null;
  }
}

export async function logoutGoogle(): Promise<void> {
  await signOut(auth);
}

export function onUserChange(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}


function sanitizeMeta(meta?: Record<string, any> | null): Record<string, any> | null {
  if (!meta || typeof meta !== 'object') return null;
  const out: Record<string, any> = {};
  out.souls = clampNum(meta.souls, 0, 100000000, 0);
  out.earned = clampNum(meta.earned, 0, 100000000, 0);
  const shop: Record<string, number> = {};
  for (const k of ['hp', 'dmg', 'atk', 'fort']) shop[k] = clampNum(meta.shop?.[k], 0, 5, 0);
  out.shop = shop;
  const ach: Record<string, boolean> = {};
  for (const k of Object.keys(meta.ach || {}).slice(0, 60)) if (meta.ach[k]) ach[cleanId(k, '', 40)] = true;
  out.ach = ach;
  const codex: Record<string, boolean> = {};
  for (const k of Object.keys(meta.codex || {}).slice(0, 60)) if (meta.codex[k]) codex[cleanId(k, '', 40)] = true;
  out.codex = codex;
  const st = meta.stats || {};
  out.stats = {
    runs: clampNum(st.runs, 0, 1000000, 0),
    kills: clampNum(st.kills, 0, 100000000, 0),
    bestWave: clampNum(st.bestWave, 0, 10000, 0),
    bestScore: clampNum(st.bestScore, 0, 100000000, 0),
    bestKills: clampNum(st.bestKills, 0, 10000000, 0),
  };
  const runs: any[] = [];
  for (const r of (Array.isArray(meta.runs) ? meta.runs.slice(0, 10) : [])) {
    runs.push({
      cls: cleanId(r?.cls, 'warrior', 40),
      wave: clampNum(r?.wave, 0, 10000, 0),
      kills: clampNum(r?.kills, 0, 10000000, 0),
      score: clampNum(r?.score, 0, 100000000, 0),
      date: clampNum(r?.date, 0, 9999999999999, 0),
      diff: cleanId(r?.diff, 'normal', 16),
      won: !!r?.won,
    });
  }
  out.runs = runs;
  return out;
}
/* Cloud + local meta merge: lifetimes take the max, unlocks take the union. */
function mergeMeta(prev: any, incoming: any): any {
  if (!prev) return incoming || null;
  if (!incoming) return prev;
  const out: any = { ...prev, ...incoming };
  out.souls = Math.max(clampNum(prev.souls, 0, 1e8, 0), clampNum(incoming.souls, 0, 1e8, 0));
  out.earned = Math.max(clampNum(prev.earned, 0, 1e8, 0), clampNum(incoming.earned, 0, 1e8, 0));
  out.shop = {};
  for (const k of ['hp', 'dmg', 'atk', 'fort'])
    out.shop[k] = Math.max(clampNum(prev.shop?.[k], 0, 5, 0), clampNum(incoming.shop?.[k], 0, 5, 0));
  out.ach = { ...(prev.ach || {}), ...(incoming.ach || {}) };
  out.codex = { ...(prev.codex || {}), ...(incoming.codex || {}) };
  const ps = prev.stats || {}, is = incoming.stats || {};
  out.stats = {
    runs: Math.max(ps.runs || 0, is.runs || 0),
    kills: Math.max(ps.kills || 0, is.kills || 0),
    bestWave: Math.max(ps.bestWave || 0, is.bestWave || 0),
    bestScore: Math.max(ps.bestScore || 0, is.bestScore || 0),
    bestKills: Math.max(ps.bestKills || 0, is.bestKills || 0),
  };
  const seen = new Set<string>();
  out.runs = [...(incoming.runs || []), ...(prev.runs || [])]
    .filter((r: any) => { const k = `${r.date}-${r.cls}-${r.wave}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a: any, b: any) => (b.date || 0) - (a.date || 0))
    .slice(0, 10);
  return out;
}

export async function syncSaveToCloud(
  saveObj: Record<string, any> | null,
  titlesUnlocked: Record<string, boolean>,
  bestRun: { wave?: number; kills?: number; level?: number; cls?: string } | null,
  meta?: Record<string, any> | null
): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return false;
  const uid = cleanId(user.uid, 'hero', 128);
  const path = `users/${uid}`;
  const docRef = doc(db, 'users', uid);

  const safeSavePayload: Record<string, any> = {};
  if (saveObj && typeof saveObj === 'object') {
    const allowedSaveKeys = [
      'version', 'cls', 'level', 'xp', 'xpNext', 'tstats', 'titleName', 'titleIcon',
      'baseStats', 'treeMods', 'equipment', 'inventory', 'wave', 'kills', 'hp',
      'energy', 'gold', 'potions', 'treePoints', 'treeUnlocked', 'hasUltimate',
      'upg', 'attrs', 'skillLvls', 'relics', 'itemIdCounter', 'savedAt'
    ];
    for (const k of allowedSaveKeys) {
      if (saveObj[k] !== undefined) {
        safeSavePayload[k] = JSON.parse(JSON.stringify(saveObj[k]));
      }
    }
  }

  /* Meta progression (souls, shrine ranks, achievements, bestiary, history).
     Sanitised the same way as the save: fixed key sets, clamped numbers. */
  const safeMeta = sanitizeMeta(meta);

  const safeTitles: Record<string, boolean> = {};
  if (titlesUnlocked && typeof titlesUnlocked === 'object') {
    const keys = Object.keys(titlesUnlocked).slice(0, 75);
    for (const k of keys) {
      if (titlesUnlocked[k]) safeTitles[cleanId(k, 'ironclad', 40)] = true;
    }
  }

  const cls = cleanId(saveObj?.cls || bestRun?.cls || 'ironclad', 'ironclad', 40);
  const level = clampNum(saveObj?.level ?? bestRun?.level ?? 1, 1, 5000, 1);
  const wave = clampNum(saveObj?.wave ?? bestRun?.wave ?? 1, 1, 10000, 1);
  const kills = clampNum(saveObj?.kills ?? bestRun?.kills ?? 0, 0, 10000000, 0);
  const gold = clampNum(saveObj?.gold ?? 50, 0, 1000000000, 50);

  const bestWave = clampNum(Math.max(wave, bestRun?.wave ?? 1), 1, 10000, 1);
  const bestKills = clampNum(Math.max(kills, bestRun?.kills ?? 0), 0, 10000000, 0);
  const bestLevel = clampNum(Math.max(level, bestRun?.level ?? 1), 1, 5000, 1);
  const bestClass = cleanId(bestRun?.cls || cls, 'ironclad', 40);

  const baseData = {
    uid,
    displayName: cleanStr(user.displayName || user.email?.split('@')[0], 'Angkor Hero', 80),
    photoURL: cleanStr(user.photoURL || '', '', 500),
    cls,
    level,
    wave,
    kills,
    gold,
    bestWave,
    bestKills,
    bestLevel,
    bestClass,
    savePayload: safeSavePayload,
    titlesUnlocked: safeTitles,
    meta: safeMeta,
  };

  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      await setDoc(docRef, {
        ...baseData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prev = existingSnap.data();
      const payload: Record<string, any> = {
        displayName: baseData.displayName,
        photoURL: baseData.photoURL,
        cls: baseData.cls,
        level: baseData.level,
        wave: baseData.wave,
        kills: baseData.kills,
        gold: baseData.gold,
        bestWave: Math.max(baseData.bestWave, clampNum(prev?.bestWave, 1, 10000, 1)),
        bestKills: Math.max(baseData.bestKills, clampNum(prev?.bestKills, 0, 10000000, 0)),
        bestLevel: Math.max(baseData.bestLevel, clampNum(prev?.bestLevel, 1, 5000, 1)),
        bestClass: baseData.bestClass,
        savePayload: Object.keys(safeSavePayload).length > 0 ? safeSavePayload : (prev?.savePayload || {}),
        titlesUnlocked: { ...(prev?.titlesUnlocked || {}), ...safeTitles },
        meta: mergeMeta(prev?.meta, safeMeta),
        updatedAt: serverTimestamp(),
      };
      try {
        await updateDoc(docRef, payload);
      } catch (e) {
        /* An older ruleset may not know the meta field. Never lose the save
           over a meta write — retry without it. */
        delete payload.meta;
        await updateDoc(docRef, payload);
      }
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadSaveFromCloud(): Promise<{
  savePayload: Record<string, any> | null;
  titlesUnlocked: Record<string, boolean>;
  bestRun: { wave: number; kills: number; level: number; cls: string } | null;
  meta: Record<string, any> | null;
} | null> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;
  const uid = cleanId(user.uid, 'hero', 128);
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      savePayload: d.savePayload && Object.keys(d.savePayload).length > 0 ? d.savePayload : null,
      titlesUnlocked: (d.titlesUnlocked as Record<string, boolean>) || {},
      bestRun: {
        wave: d.bestWave || 1,
        kills: d.bestKills || 0,
        level: d.bestLevel || 1,
        cls: d.bestClass || 'ironclad',
      },
      meta: (d.meta as Record<string, any>) || null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function submitScoreToLeaderboard(params: {
  cls: string;
  className: string;
  archetype: string;
  wave: number;
  kills: number;
  level: number;
  gold: number;
  difficulty: string;
  titleName: string;
  realmName: string;
}): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return false;
  const uid = cleanId(user.uid, 'hero', 128);
  const path = `leaderboard/${uid}`;
  const docRef = doc(db, 'leaderboard', uid);

  const diff: 'easy' | 'normal' | 'hard' =
    params.difficulty === 'easy' || params.difficulty === 'hard' ? params.difficulty : 'normal';
  const wave = clampNum(params.wave, 1, 10000, 1);
  const kills = clampNum(params.kills, 0, 10000000, 0);
  const level = clampNum(params.level, 1, 5000, 1);
  const gold = clampNum(params.gold, 0, 1000000000, 0);
  const score = computeHeroScore(wave, kills, level, gold, diff);

  const payload = {
    uid,
    displayName: cleanStr(user.displayName || user.email?.split('@')[0], 'Angkor Hero', 80),
    photoURL: cleanStr(user.photoURL || '', '', 500),
    cls: cleanId(params.cls, 'ironclad', 40),
    className: cleanStr(params.className, 'Ironclad', 60),
    archetype: cleanStr(params.archetype, 'Warrior', 40),
    wave,
    kills,
    level,
    gold,
    score,
    difficulty: diff,
    titleName: cleanStr(params.titleName || '', '', 60),
    realmName: cleanStr(params.realmName || 'Angkor Crypt', 'Angkor Crypt', 60),
    isPublic: true,
  };

  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return true;
    } else {
      const prev = existingSnap.data();
      const prevScore = typeof prev?.score === 'number' ? prev.score : 0;
      if (score >= prevScore) {
        await updateDoc(docRef, {
          displayName: payload.displayName,
          photoURL: payload.photoURL,
          cls: payload.cls,
          className: payload.className,
          archetype: payload.archetype,
          wave: Math.max(wave, clampNum(prev?.wave, 1, 10000, 1)),
          kills: Math.max(kills, clampNum(prev?.kills, 0, 10000000, 0)),
          level: Math.max(level, clampNum(prev?.level, 1, 5000, 1)),
          gold: Math.max(gold, clampNum(prev?.gold, 0, 1000000000, 0)),
          score,
          difficulty: payload.difficulty,
          titleName: payload.titleName || prev?.titleName || '',
          realmName: payload.realmName,
          isPublic: true,
          updatedAt: serverTimestamp(),
        });
      }
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeLeaderboard(
  onData: (entries: LeaderboardRecord[]) => void,
  onError?: (err: unknown) => void
): () => void {
  if (!auth.currentUser) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, 'leaderboard'), where('isPublic', '==', true));
  return onSnapshot(
    q,
    snapshot => {
      const list: LeaderboardRecord[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        list.push({
          uid: d.uid,
          displayName: d.displayName || 'Angkor Hero',
          photoURL: d.photoURL || '',
          cls: d.cls || 'ironclad',
          className: d.className || 'Hero',
          archetype: d.archetype || 'Warrior',
          wave: d.wave || 1,
          kills: d.kills || 0,
          level: d.level || 1,
          gold: d.gold || 0,
          score: d.score || 0,
          difficulty: d.difficulty || 'normal',
          titleName: d.titleName || '',
          realmName: d.realmName || 'Angkor Crypt',
          isPublic: true,
          updatedAtMs: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : Date.now(),
        });
      });
      list.sort((a, b) => b.score - a.score || b.wave - a.wave || b.kills - a.kills);
      onData(list);
    },
    error => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, 'leaderboard');
      } catch (e) {
        console.warn(e);
      }
    }
  );
}
