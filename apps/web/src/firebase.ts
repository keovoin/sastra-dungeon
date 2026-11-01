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

export async function syncSaveToCloud(
  saveObj: Record<string, any> | null,
  titlesUnlocked: Record<string, boolean>,
  bestRun: { wave?: number; kills?: number; level?: number; cls?: string } | null
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
      'upg', 'attrs', 'skillLvls', 'itemIdCounter', 'savedAt'
    ];
    for (const k of allowedSaveKeys) {
      if (saveObj[k] !== undefined) {
        safeSavePayload[k] = JSON.parse(JSON.stringify(saveObj[k]));
      }
    }
  }

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
      await updateDoc(docRef, {
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
        updatedAt: serverTimestamp(),
      });
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
