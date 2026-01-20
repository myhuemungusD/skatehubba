# Trust & Safety

## Filmer Credit Workflow

### Overview

The Filmer workflow ensures filmer attribution is consent-based and server-authoritative:

1. **Skater requests credit** → `pending`
2. **Filmer accepts/rejects** → `accepted` / `rejected`
3. **Check-in updated** only by server
4. **Audit trail** is written for every action

### Server Authority

- Clients **cannot** write `filmerStatus=accepted` for someone else.
- Clients **cannot** impersonate a filmer UID; the server verifies the responder UID and eligibility.

### Trust Gate

Requesting a filmer credit requires:

- Authenticated user
- Active account (not banned)
- `trustLevel >= 1`

Filmer eligibility requires **at least one** of:

- `user_profiles.roles.filmer = true`
- `user_profiles.filmerVerified = true`

### Abuse Controls

- **Quota limits** (per day):
  - `filmer:request:{uid}:{YYYY-MM-DD}` → **10**
  - `filmer:respond:{uid}:{YYYY-MM-DD}` → **50**
- **Rate limits** on request/respond endpoints (IP + session key)
- **Duplicate protection**: same `(checkInId, filmerUid)` can only be requested once

### Audit Logging

Every action writes an audit log entry:

- `FILMER_REQUEST_CREATED`
- `FILMER_REQUEST_ACCEPTED`
- `FILMER_REQUEST_REJECTED`

### Idempotency

- Creating a request that is already **pending** returns the existing request ID.
- Creating a request when a prior request is **accepted/rejected** returns `409`.

### Data Authority

- `filmer_requests` is the system of record in PostgreSQL.
- Firestore remains reserved for realtime/presence/feed use cases.
