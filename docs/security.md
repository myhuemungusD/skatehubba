# SkateHubba Security Overview

## Threat model (short)

**Assets at risk**

- User identities (Firebase Auth, session cookies)
- Location signals (spot check-ins)
- Media uploads (trick clips/photos)
- Community content (spots, tricks, battles)

**Primary threat vectors**

- Unauthorized reads/writes to Firestore/Storage
- Abuse/spam of write-heavy endpoints
- Location spoofing or replayed check-ins
- Sensitive actions without auditability

**Core controls**

- **Firestore rules**: enforced server-side rules in `firestore.rules` with explicit allowlists and ownership checks.
- **Storage rules**: enforced server-side rules in `storage.rules` with owner paths, content-type, and size constraints.
- **API validation**: centralized Zod validation middleware at API boundaries.
- **Rate limiting**: IP and per-user quotas for write endpoints (spots + check-ins).
- **Check-in integrity**: server-verified distance checks plus replay protection.
- **Audit logging**: security-relevant actions emit structured audit logs.

## Trust boundaries (explicit)

- Clients **cannot** write to protected Firestore paths such as `/env/prod/billing`, `/env/prod/admin`, `/env/prod/moderation`, or `/env/prod/analytics_events`.
- Clients **cannot** write user profiles directly; profile storage is server-owned.
- All spot check-ins are **server-validated** (distance + replay + quotas).
- Uploads are constrained to **owner paths**, **content type**, and **size** by Storage rules.
- Replay nonces are stored durably in Firestore with an `expiresAt` TTL for automatic cleanup.

## Security proof (commands + expected output)

Run locally or in CI:

```bash
pnpm test
node scripts/verify-firebase-rules.mjs
```

Expected output:

- `pnpm test` → green Vitest run (no failed tests).
- `verify-firebase-rules.mjs` → prints `Rules verified` and exits 0.

## Implementation references

- Firestore rules: `firestore.rules`
- Storage rules: `storage.rules`
- API validation middleware: `server/middleware/validation.ts`
- Abuse controls: `server/middleware/security.ts`
- Check-in verification: `server/services/spotService.ts`
- Replay protection: `server/services/replayProtection.ts`
- Audit logging: `server/services/auditLog.ts`
