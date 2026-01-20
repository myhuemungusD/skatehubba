# Data Model

## Check-ins (`check_ins`)

Optional filmer attribution fields on check-ins:

- `filmerUid?: string`
- `filmerStatus?: "pending" | "accepted" | "rejected"`
- `filmerRequestedAt?: timestamp`
- `filmerRespondedAt?: timestamp`
- `filmerRequestId?: string`

Rules:

- When `filmerUid` is set, `filmerStatus` must be `pending` and `filmerRequestedAt` is set by the server.
- If no `filmerUid`, filmer fields are absent.

## Filmer Requests (`filmer_requests`)

PostgreSQL table managed **server-side** and transactional with check-ins.

Columns:

- `id` (uuid)
- `check_in_id` (FK → `check_ins.id`)
- `requester_id` (skater)
- `filmer_id` (target filmer)
- `status` (`pending` | `accepted` | `rejected`, enum)
- `reason?` (string, only on reject)
- `created_at`
- `updated_at`
- `responded_at` (required when accepted/rejected)

Constraints:

- Unique `(check_in_id, filmer_id)` to prevent duplicates.
- Status transitions are server-enforced: `pending → accepted/rejected` only.

## Filmer Daily Counters (`filmer_daily_counters`)

PostgreSQL table storing daily quota counters.

Columns:

- `counter_key` (e.g., `filmer:request:{env}:{uid}`)
- `day` (`YYYY-MM-DD`)
- `count`
- `created_at`
- `updated_at`

Counters are cleaned up by deleting rows older than 7 days in the service.

## User Profile Extensions (`user_profiles`)

Optional filmer fields (MVP structure only):

- `roles.filmer?: boolean`
- `filmerRepScore?: number`
- `filmerVerified?: boolean`
