# Disaster Recovery Plan — SkateHubba

**Last Updated:** 2026-02-26
**Owner:** Engineering Team
**Review Cadence:** Quarterly

---

## 1. Recovery Objectives

| Metric | Target | Notes |
|--------|--------|-------|
| **RTO** (Recovery Time Objective) | 1 hour | Time to restore service after an incident |
| **RPO** (Recovery Point Objective) | 24 hours | Maximum acceptable data loss window |
| **MTTR** (Mean Time To Recover) | 30 minutes | Average recovery time for common failures |

---

## 2. System Architecture

| Component | Provider | Recovery Method |
|-----------|----------|-----------------|
| Web Frontend | Vercel | Instant rollback via Vercel dashboard |
| API Server | Vercel Serverless | Instant rollback via Vercel dashboard |
| Database (PostgreSQL) | Managed provider | Restore from backup (`scripts/backup-database.sh`) |
| Redis (Cache/Rate Limiting) | Managed provider | Ephemeral — auto-recovers on restart |
| Firebase Auth | Google Cloud | Managed by Google — no action needed |
| Firebase Storage | Google Cloud | Managed by Google with built-in redundancy |
| DNS | Domain registrar | TTL-based propagation (5-30 min) |

---

## 3. Backup Strategy

### 3.1 Database Backups

- **Script:** `scripts/backup-database.sh`
- **Schedule:** Daily at 03:00 UTC via cron
- **Retention:** 30 days local, optionally mirrored to S3
- **Format:** Compressed SQL dump (`pg_dump | gzip`)
- **Verification:** Automatic integrity check (`gzip -t`) after each backup

**Cron entry:**
```
0 3 * * * cd /app && ./scripts/backup-database.sh >> /var/log/skatehubba-backup.log 2>&1
```

### 3.2 Code & Configuration

- **Source Code:** GitHub (distributed Git — every clone is a full backup)
- **Environment Variables:** Stored in Vercel dashboard + `.env.example` template in repo
- **Firebase Rules:** Version-controlled in `firestore.rules` and `storage.rules`
- **Infrastructure Config:** `docker-compose.staging.yml`, `deploy/setup-server.sh`

### 3.3 What Is NOT Backed Up

- Redis cache (ephemeral by design)
- CDN edge caches (rebuilt automatically)
- Service worker caches (rebuilt on next visit)

---

## 4. Recovery Runbooks

### 4.1 Frontend Down (Vercel)

**Symptoms:** Users see 5xx errors or blank pages.

1. Check [Vercel Status](https://vercel-status.com) for platform issues
2. If platform is healthy, check the latest deployment in Vercel dashboard
3. **Rollback:** Vercel Dashboard > Deployments > Click previous working deployment > Promote to Production
4. Verify the site loads at https://skatehubba.com
5. Investigate root cause in the failed deployment logs

**Estimated recovery:** < 5 minutes

### 4.2 API / Server Down

**Symptoms:** API calls return 5xx, health check fails (`/api/health/live`).

1. Check Vercel function logs for errors
2. Check Sentry for error spikes
3. If caused by bad deployment: rollback via Vercel dashboard
4. If caused by dependency (DB, Redis, Firebase): see relevant runbook below
5. Verify health: `curl https://skatehubba.com/api/health/ready`

**Estimated recovery:** 5-15 minutes

### 4.3 Database Failure

**Symptoms:** 503 errors, `DATABASE_UNAVAILABLE` in logs.

1. Check managed database provider status page
2. If provider issue: wait for resolution, app degrades gracefully (503s)
3. If data corruption or accidental deletion:
   a. Identify the most recent clean backup in `./backups/` or S3
   b. Provision a new database instance
   c. Restore: `gunzip -c backups/skatehubba_YYYYMMDD_HHMMSS.sql.gz | psql $NEW_DATABASE_URL`
   d. Run pending migrations: `pnpm db:migrate`
   e. Update `DATABASE_URL` in Vercel environment variables
   f. Trigger a redeploy
4. Verify: `curl https://skatehubba.com/api/health/ready`

**Estimated recovery:** 15-60 minutes depending on data size

### 4.4 Redis Failure

**Symptoms:** Rate limiting stops working, real-time features degrade.

1. Redis is non-critical — the app falls back to in-memory rate limiting
2. Check managed Redis provider status
3. If persistent: provision a new Redis instance, update `REDIS_URL`
4. Trigger redeploy

**Estimated recovery:** < 10 minutes (non-blocking)

### 4.5 Firebase Auth Outage

**Symptoms:** Users cannot sign in/up, auth tokens fail to verify.

1. Check [Firebase Status](https://status.firebase.google.com)
2. Firebase Auth outages are rare and handled by Google SRE
3. Existing authenticated sessions continue working (JWT-based)
4. New logins will fail until Firebase recovers
5. No action required from our side — wait for Google resolution

**Estimated recovery:** Depends on Google (typically < 1 hour)

### 4.6 Domain / DNS Issue

**Symptoms:** Site unreachable, DNS resolution fails.

1. Check domain registrar for expiry or misconfiguration
2. Verify DNS records: `dig skatehubba.com`
3. If Vercel DNS: check Vercel domain settings
4. If records are wrong: fix and wait for TTL propagation (5-30 min)

**Estimated recovery:** 5-30 minutes

### 4.7 Security Incident (Data Breach)

1. **Contain:** Rotate all compromised credentials immediately
2. **Assess:** Determine scope via audit logs (`/admin/audit-log`)
3. **Notify:** Inform affected users per GDPR Article 33 (within 72 hours)
4. **Remediate:** Patch the vulnerability, deploy fix
5. **Review:** Post-incident review within 48 hours

---

## 5. Communication Plan

| Audience | Channel | Who |
|----------|---------|-----|
| Engineering team | Slack / Discord | On-call engineer |
| Users (major outage) | Status page / Twitter | Product lead |
| Affected users (security) | Email | Legal / Product |

---

## 6. Testing Schedule

| Test | Frequency | Last Tested |
|------|-----------|-------------|
| Backup restore drill | Quarterly | Not yet |
| Vercel rollback drill | Quarterly | Not yet |
| Health check monitoring | Continuous | Active |
| Failover simulation | Bi-annually | Not yet |

---

## 7. Post-Incident Review Template

After any P0/P1 incident, create a document with:

1. **Timeline:** When did it start, when detected, when resolved?
2. **Impact:** Users affected, duration, data loss (if any)
3. **Root Cause:** What broke and why?
4. **Resolution:** What fixed it?
5. **Action Items:** What prevents this from happening again?
