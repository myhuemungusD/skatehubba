# Mobile Security Audit Report

**Date:** 2026-02-12 (reviewed 2026-02-26)
**Scope:** `/mobile` (React Native/Expo), Firestore rules, Storage rules, server auth middleware
**Framework:** Expo 54 + React Native 0.83 + Firebase Auth + Firestore
**Last Reviewed:** 2026-02-26 — All critical/high fixes verified; recommendations re-evaluated.

---

## Executive Summary

The mobile app has a solid security foundation: Firestore rules enforce default-deny with field whitelisting, Firebase Auth is properly integrated with AsyncStorage persistence, and critical game mutations use Cloud Functions with idempotency keys. However, the audit identified **2 critical**, **3 high**, and **4 medium** severity issues. The critical issues have been fixed in this PR.

---

## Critical Findings (Fixed)

### C1. Mobile API client sends unauthenticated requests

**File:** `mobile/src/lib/queryClient.ts:25-46`
**Severity:** CRITICAL
**Status:** FIXED

The `apiRequest` helper used `credentials: "include"` for cookie-based auth, but React Native's `fetch` does not support cookies the same way browsers do. All API calls from the mobile app (e.g., `AddSpotModal` posting to `/api/spots`) were sent **without authentication**, meaning they would fail against any authenticated server endpoint.

**Fix:** Inject Firebase ID token via `Authorization: Bearer <token>` header. Removed `credentials: "include"` which has no effect in React Native.

### C2. Game join/abandon mutations use direct Firestore writes that are blocked by rules

**File:** `mobile/src/hooks/useGameSession.ts:381-453`
**Severity:** CRITICAL
**Status:** FIXED

`useJoinGame` and `useAbandonGame` used `updateDoc()` to directly write to `game_sessions/{gameId}`, but the Firestore rules explicitly block all client writes on that collection (`allow create, update, delete: if false`). This means:

- Joining a game **silently fails** in production
- Abandoning/forfeiting a game **silently fails** in production

Additionally, `useAbandonGame` computed `winnerId` client-side, which is a **game integrity risk** -- a malicious client could set themselves as the winner.

**Fix:** Replaced both with `httpsCallable` Cloud Function calls (`joinGame`, `abandonGame`), matching the pattern already used by `submitTrick` and `judgeTrick`. Removed unused `updateDoc`/`serverTimestamp` imports.

---

## High Findings (Fixed)

### H1. Analytics session persists across sign-out

**File:** `mobile/src/store/authStore.ts`
**Severity:** HIGH
**Status:** FIXED

The analytics session ID (stored in AsyncStorage) was never cleared on sign-out. If a user signs out and another user signs in on the same device, the new user's events would be tracked under the old session, leaking cross-account behavioral data.

**Fix:** Call `clearAnalyticsSession()` during `signOut`.

### H2. Sensitive data logged to console in production builds

**Files:** `firebase.config.ts`, `authStore.ts`, `sign-in.tsx`
**Severity:** HIGH
**Status:** FIXED

Multiple files log potentially sensitive information (Firebase project ID, auth errors with token fragments, sign-in errors) via `console.error`/`console.log` without `__DEV__` guards. On Android, these logs are accessible via `adb logcat` to anyone with physical access.

**Fix:** Wrapped all sensitive console statements in `__DEV__` guards. Sanitized error messages shown to users (removed `error.message` from Google sign-in failure alerts).

### H3. Sign-in form missing input constraints

**File:** `mobile/app/auth/sign-in.tsx`
**Severity:** MEDIUM (upgraded to HIGH due to combination)
**Status:** FIXED

- Email input lacked `maxLength`, `textContentType`, `autoComplete`
- Password input lacked `maxLength`, `textContentType`, `autoComplete`

Without `maxLength`, a user (or automated tool) could paste extremely long strings causing UI issues. Without `textContentType`/`autoComplete`, iOS/Android password managers can't auto-fill credentials, pushing users toward weaker password practices.

**Fix:** Added `maxLength={254}` for email (RFC 5321), `maxLength={128}` for password, plus `textContentType` and `autoComplete` for both fields.

---

## High Findings (Recommendations - Open)

### H4. No certificate pinning

**Severity:** HIGH
**Status:** OPEN — Tracked in backlog. Firebase App Check attestation is in gradual rollout (monitor → warn → enforce) which partially mitigates this.

No SSL/TLS certificate pinning is configured for any network requests. This makes the app vulnerable to MITM attacks, especially on untrusted networks (public Wi-Fi at skate parks). An attacker with a rogue CA certificate could intercept Firebase tokens and API requests.

**Recommendation:** Implement certificate pinning for the API server domain using `expo-certificate-transparency` or a native pinning module. Firebase App Check with attestation (currently in rollout) provides additional protection.

### H5. Android backup not disabled

**File:** `mobile/app.config.js`
**Severity:** HIGH
**Status:** OPEN — Tracked in backlog.

The Expo config does not set `android.allowBackup: false`. Firebase auth tokens persisted in AsyncStorage could be extracted via `adb backup` on rooted devices or when USB debugging is enabled.

**Recommendation:** Add to `app.config.js`:
```js
android: {
  ...
  allowBackup: false,
}
```

---

## Medium Findings (Recommendations - Open)

### M1. No jailbreak/root detection

**Severity:** MEDIUM
**Status:** OPEN — Tracked in backlog.

The app does not detect rooted (Android) or jailbroken (iOS) devices. Game integrity features (video verification, trick judging) and payment flows (Stripe) are at higher risk on tampered devices where SSL pinning can be bypassed and app memory can be inspected.

**Recommendation:** Integrate a detection library (e.g., `jail-monkey` or `expo-device` checks) to warn users or restrict sensitive features on compromised devices.

### M2. Deep link scheme accepts unvalidated parameters

**File:** `mobile/app/game/[id].tsx`
**Severity:** MEDIUM
**Status:** OPEN — Tracked in backlog.

The `skatehubba://` scheme with expo-router's `game/[id]` route accepts arbitrary game IDs from deep links without validation. A malicious link could navigate a user to an arbitrary game session. The Firestore rules do enforce participant checks on read, so data exposure is limited, but the UX could be confusing.

**Recommendation:** Validate the `id` parameter format (UUID) before initiating the Firestore listener. Show a user-friendly error for invalid IDs instead of a loading spinner that never resolves.

### M3. Video upload path is enumerable

**File:** `mobile/src/hooks/useGameSession.ts:251`
**Severity:** MEDIUM
**Status:** OPEN — Partially mitigated by storage rules tightening in Feb 2026 audit (M6 fix: strict MIME matching).

The storage path `game_sessions/${gameId}/move_${userId}_${Date.now()}.mp4` uses predictable components. While Storage rules require authentication for reads, any authenticated user can read any other user's trick videos via the `/videos/{userId}/...` path (which has `allow read: if isAuthenticated()`).

**Recommendation:** Use signed URLs with expiration for video access. Alternatively, tighten storage rules to restrict reads to game participants only.

### M4. Network polling interval

**File:** `mobile/src/hooks/useNetworkStatus.ts:47`
**Severity:** LOW
**Status:** OPEN — Low priority.

The 3-second network polling interval is aggressive and impacts battery life. This runs continuously via `setInterval`.

**Recommendation:** Increase to 10-15 seconds, or use `@react-native-community/netinfo` which provides event-based connectivity changes instead of polling.

---

## Positive Findings

The following security controls are well-implemented:

1. **Firestore rules** - Comprehensive default-deny with field whitelisting, owner checks, type validation, size limits, and timestamp validation
2. **Storage rules** - Size limits per path, content-type enforcement, owner-bound writes
3. **Game state integrity** - Critical game mutations (submitTrick, judgeTrick) use Cloud Functions with Firestore transactions and idempotency keys
4. **Zod runtime validation** - Game session data from Firestore is validated through Zod schemas before use
5. **Auth state gating** - Root layout gates all rendering until Firebase auth initializes; auth redirect logic properly handles auth/unauth states
6. **Server auth middleware** - Generic error messages prevent information leakage; HttpOnly cookies for web; Bearer token verification for mobile
7. **Rate limiting** - Server endpoints have per-IP and per-user rate limits with Redis backing
8. **CSRF protection** - Server has CSRF token validation for state-changing requests
9. **Password security** - bcrypt with 12 salt rounds, 8-char minimum, all-session invalidation on password change
10. **Environment isolation** - Firestore namespaces data by environment; `assertEnvWiring()` prevents cross-environment data access
11. **Secret scanning** - Gitleaks and Secretlint configured in CI/CD pipeline

---

## Files Modified

| File | Changes |
|------|---------|
| `mobile/src/lib/queryClient.ts` | Added Firebase auth token injection to `apiRequest` |
| `mobile/src/hooks/useGameSession.ts` | Replaced direct Firestore writes with Cloud Function calls for join/abandon |
| `mobile/src/store/authStore.ts` | Clear analytics session on sign-out; guard console.error |
| `mobile/src/lib/firebase.config.ts` | Guard console.log/error behind `__DEV__`; remove projectId from logs |
| `mobile/app/auth/sign-in.tsx` | Add input constraints; guard console.error; sanitize error messages |
