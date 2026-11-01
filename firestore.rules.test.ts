/**
 * Firestore Security Rules Test Suite — Dirty Dozen Verification
 * Verifies all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write to UserSave',
    operation: 'create',
    path: '/users/user_1',
    auth: null,
    payload: { uid: 'user_1', displayName: 'Hero' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof on UserSave',
    operation: 'create',
    path: '/users/user_1',
    auth: { uid: 'user_1', email_verified: false },
    payload: { uid: 'user_1', displayName: 'Hero' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-User Save Read',
    operation: 'get',
    path: '/users/victim_1',
    auth: { uid: 'attacker_1', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Identity Spoofing on Leaderboard',
    operation: 'create',
    path: '/leaderboard/attacker_1',
    auth: { uid: 'attacker_1', email_verified: true },
    payload: { uid: 'victim_1', displayName: 'Spoofer', score: 99999 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow Field Injection on Update',
    operation: 'update',
    path: '/users/user_1',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Value Poisoning (Oversized displayName)',
    operation: 'create',
    path: '/leaderboard/user_1',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', displayName: 'A'.repeat(2000), score: 100 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Negative Score Injection',
    operation: 'create',
    path: '/leaderboard/user_1',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', displayName: 'Hero', score: -500 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Invalid Difficulty Enum',
    operation: 'create',
    path: '/leaderboard/user_1',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', displayName: 'Hero', difficulty: 'godmode' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Timestamp Forgery on Create',
    operation: 'create',
    path: '/users/user_1',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immortal Field Mutation (createdAt changed on update)',
    operation: 'update',
    path: '/leaderboard/user_1',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', createdAt: '2099-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unbounded Map Poisoning on UserSave',
    operation: 'create',
    path: '/users/user_1',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', savePayload: 'not-a-map' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthorized List Scraping on /users',
    operation: 'list',
    path: '/users',
    auth: { uid: 'user_1', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];
