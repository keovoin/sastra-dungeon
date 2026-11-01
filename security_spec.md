# Sastra Dungeon — Firestore Security Specification

## 1. Data Invariants

1. **Identity & Ownership (`/users/{userId}` & `/leaderboard/{entryId}`)**:
   - Every document ID (`{userId}` or `{entryId}`) must be a valid alphanumeric/hyphen/underscore string (`^[a-zA-Z0-9_\-]+$`, max 128 chars) and must strictly equal `request.auth.uid`.
   - The payload's `uid` field must strictly match `request.auth.uid` on both `create` and `update`, and remain immutable on `update`.
   - All writes require a verified Google account (`request.auth.token.email_verified == true`).
2. **PII & Private Save Isolation (`/users/{userId}`)**:
   - Only the document owner (`request.auth.uid == userId`) can `get`, `create`, `update`, or `delete` their save document. `list` is completely forbidden on `/users`.
   - No raw email addresses or phone numbers are stored in either `/users` or `/leaderboard`.
3. **Strict Schema & Volumetric Bounds**:
   - Every string field enforces `.size()` limits matching `firebase-blueprint.json` (`displayName <= 80`, `photoURL <= 500`, `cls <= 40`, `className <= 60`, `archetype <= 40`, `titleName <= 60`, `realmName <= 60`).
   - Numeric fields enforce non-negative and realistic upper bounds (`wave >= 1 && wave <= 10000`, `level >= 1 && level <= 5000`, `kills >= 0 && kills <= 10000000`, `score >= 0 && score <= 1000000000`).
4. **Temporal Integrity**:
   - `createdAt` must equal `request.time` on `create` and is immutable on `update` (`incoming().createdAt == existing().createdAt`).
   - `updatedAt` must equal `request.time` on both `create` and `update`.
5. **Query Enforcer (`/leaderboard/{entryId}`)**:
   - `allow list` requires `resource.data.isPublic == true && resource.data.score >= 0`, preventing unfiltered collection scraping.

## 2. The "Dirty Dozen" Payloads

1. **Unauthenticated Write**: Creating `/users/user_1` with `auth = null`.
2. **Unverified Email Spoof**: Creating `/users/user_1` with `email_verified = false`.
3. **Cross-User Save Read (PII/Privacy Leak)**: User `attacker_1` attempting `get` on `/users/victim_1`.
4. **Identity Spoofing on Leaderboard**: User `attacker_1` creating `/leaderboard/attacker_1` with `uid: "victim_1"`.
5. **Shadow / Ghost Field Injection**: Updating `/users/user_1` with an undeclared field `isAdmin: true`.
6. **Value Poisoning (Oversized String)**: Creating `/leaderboard/user_1` with a 2,000-character `displayName`.
7. **Negative / Overflow Score Injection**: Creating `/leaderboard/user_1` with `score: -500` or `score: "NaN"`.
8. **Invalid Enum Value**: Creating `/leaderboard/user_1` with `difficulty: "impossible_hack"`.
9. **Timestamp Forgery on Create**: Creating `/users/user_1` with a past or future client-forged `createdAt` timestamp instead of `request.time`.
10. **Immortal Field Mutation on Update**: Updating `/leaderboard/user_1` while mutating `createdAt` or `uid`.
11. **Unbounded Map Poisoning**: Creating `/users/user_1` with `savePayload` having more than 50 keys.
12. **Unauthorized List Scraping on Private Saves**: Authenticated user attempting `list` on `/users`.
