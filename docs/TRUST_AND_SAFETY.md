# Trust & Safety (MVP)

SkateHubba lives or dies on authenticity. This is the smallest viable system that prevents spoofed check-ins, reposted videos, impersonation, and harassment without slowing growth.

## Goals

1. **Stop spoofed check-ins**
2. **Prevent reposted content from being treated as original**
3. **Protect pro identities**
4. **Keep harassment out of the community**

## Trust System (MVP)

**Trust levels** are a simple score used to gate limits and friction.

**Signals (additive):**

- **Account age** (days since signup)
- **Verified email** (instant boost)
- **Verified phone** (instant boost)
- **Positive report ratio** (reports resolved in user’s favor)
- **Completed check-ins** (non-flagged)

**Limits by tier (MVP defaults):**

- **TL0 (new):**
  - Max **2 check-ins/day**
  - Max **1 post/day**
  - Max **3 reports/day**
- **TL1 (verified):**
  - Max **5 check-ins/day**
  - Max **3 posts/day**
  - Max **5 reports/day**
- **TL2 (trusted):**
  - Max **10 check-ins/day**
  - Max **5 posts/day**
  - Max **10 reports/day**

**Escalation path:**

- Account age + verified phone/email + positive report ratio unlock higher tiers.
- If a user receives **substantiated abuse reports**, limits drop automatically.

## Moderation Pipeline (MVP)

**Flow:** `report → moderation queue → admin action → audit log`

**Report types:**

- Harassment / abuse
- Impersonation
- Reposted / stolen content
- Location spoofing
- Other

**Admin actions:**

- Dismiss
- Remove content
- Temporary restriction
- Permanent ban

**Audit log (non-editable):**

- reporter uid
- subject uid / content id
- action taken
- reason
- timestamp

## Verified Identity (Pros)

**Manual verification (Phase 1):**

- Admin approves based on public references (sponsor page, league profile, social links)
- Badge on profile + content attribution

**Automated verification (Phase 2):**

- ID check provider
- Additional trust boost

## Content Policy Enforcement

**MVP enforcement rules:**

- Disallow hate speech, harassment, and explicit threats
- No impersonation of real people
- Remove reposted clips when reported with proof

**Storage strategy:**

- Keep removed content in cold storage for audit

## Anti-Spoofing (Check-ins)

**MVP checks:**

- GPS + timestamp required
- Basic velocity filter (reject impossible travel)
- Soft device fingerprinting
- Trust-level gates for check-in frequency

## Repost Detection (MVP)

**MVP checks:**

- Hash uploaded videos (perceptual hash)
- Flag near-duplicates for review
- Trust-tier auto-accept vs queue

## Rollout Plan (2 sprints)

**Sprint 1:**

- Trust tiers + posting limits
- Report flow + queue
- Admin actions + audit log

**Sprint 2:**

- Manual pro verification
- Video hash checks
- Check-in anti-spoofing rules

## Owner

**Trust & Safety** is a core product surface. This doc is the MVP baseline and must ship before growth acceleration.
