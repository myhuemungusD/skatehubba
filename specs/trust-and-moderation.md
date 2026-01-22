# Trust & Moderation Specification (MVP)

## Threat Model

| Threat            | Abuse Vector                       | Control                                                           | Enforcement Layer                        |
| ----------------- | ---------------------------------- | ----------------------------------------------------------------- | ---------------------------------------- |
| Spoofed check-ins | Fake GPS / replayed coordinates    | GPS + timestamp validation + velocity sanity + trust-level quotas | API + Firestore rules (field protection) |
| Reposted clips    | Re-upload same video as “original” | Perceptual hash + duplicate review queue                          | API + moderation queue                   |
| Bot spam          | Mass posting/reporting             | Rate limits + trust-based quotas                                  | API (rate limit + quota)                 |
| Harassment        | Targeted abuse in comments/posts   | Report flow + admin actions + audit log                           | API + moderation queue                   |
| Impersonation     | Fake pro accounts                  | Manual pro verification                                           | Admin-only API + audit log               |

## Enforcement Boundaries

- **API layer** enforces: auth, bans, rate limits, quotas, audit logging.
- **Firestore rules** block client writes to trust/pro fields.
- **Admin-only routes** write trust/pro fields using Admin SDK.

## Default Quotas by Trust Level

| Trust Level | Check-ins / day | Posts / day | Reports / day |
| ----------- | --------------- | ----------- | ------------- |
| TL0         | 2               | 1           | 3             |
| TL1         | 5               | 3           | 5             |
| TL2         | 10              | 5           | 10            |

## Trust Signals (MVP)

- Account age (days since signup)
- Verified email
- Verified phone
- Positive report ratio
- Completed check-ins

## Pro Verification Workflow

**States:** `none → pending → verified/rejected`

**Rules:**

- Only admins can set `proVerificationStatus`.
- Evidence is required for `pending` and `verified` states.
- Every action writes a moderation audit log entry.

**Evidence fields:**

- Sponsor page / league profile
- Public social links
- Admin notes

## Moderation Pipeline

`report → queue → admin action → audit log`

**Admin actions:**

- warn
- remove_content
- temp_ban
- perm_ban
- verify_pro
- revoke_pro

## Audit Log Requirements

Each moderation action records:

- who took action (admin uid)
- who was targeted (user id)
- action type
- timestamp
- reason code + free-text notes
- reversible flag / expiry
