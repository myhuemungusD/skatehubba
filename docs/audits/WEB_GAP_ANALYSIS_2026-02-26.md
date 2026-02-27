# Web Gap Analysis — SkateHubba

**Date:** 2026-02-26
**Scope:** Web client (`client/`), server (`server/`), shared packages, deployment infrastructure
**Status:** v0.9.0 (MVP + post-MVP features shipped)

---

## Executive Summary

SkateHubba's web platform is **production-grade** with strong foundations in security, testing, and architecture. The app ships 47 pages, 108 components, 30+ API routes, and 289 test files across a well-structured monorepo. However, several gaps remain that affect discoverability, resilience, accessibility, and operational maturity.

**Severity legend:**

- **P0 — Critical:** Blocks launch or creates significant risk
- **P1 — High:** Should be addressed before scaling
- **P2 — Medium:** Important for maturity, not blocking
- **P3 — Low:** Nice-to-have improvements

---

## 1. SEO & Discoverability

### What Exists

- Root meta tags (title, description, keywords, author, robots)
- Open Graph + Twitter Card tags on root layout
- JSON-LD structured data (Organization + WebApplication schemas)
- `robots.txt` with proper directives (disallow `/api`, `/admin`, `/auth`)
- Sitemap config in `packages/shared/sitemap-config.ts`

### Gaps

| #   | Gap                                         | Severity | Detail                                                                                                                                                                                                                                  |
| --- | ------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | No generated `/sitemap.xml`                 | **P1**   | `robots.txt` references a sitemap, but no build step generates it. Search engines can't discover all public pages (spots, profiles).                                                                                                    |
| 1.2 | No dynamic meta tags on content pages       | **P1**   | Profile pages (`/p/:username`, `/skater/:handle`) and spot pages (`/spots/:id`) lack per-page OG/Twitter meta tags. Shared links show generic metadata.                                                                                 |
| 1.3 | No per-page OG images                       | **P2**   | No dynamic Open Graph images for spots or profiles. Limits social sharing engagement.                                                                                                                                                   |
| 1.4 | No `hreflang` tags                          | **P3**   | Not needed until i18n is added, but worth noting.                                                                                                                                                                                       |
| 1.5 | No resource hints                           | **P2**   | Missing `<link rel="preconnect">` / `<link rel="dns-prefetch">` for Firebase, Leaflet tile servers, Sentry, and Stripe. Adds latency on first load.                                                                                     |
| 1.6 | SPA client-side routing limits crawlability | **P1**   | Vite SPA with wouter means content is rendered client-side. Google can crawl JS-rendered content but other search engines (Bing, DuckDuckGo) may not index dynamic pages. Consider SSR/SSG for public pages or a prerendering strategy. |

---

## 2. Performance

### What Exists

- React.lazy() code splitting on all page routes
- Manual chunk splitting (firebase, leaflet, framer-motion, lucide, radix-ui, vendor)
- LazyImage component with IntersectionObserver
- Service worker with precache + network-first runtime cache
- 89 instances of React.memo/useMemo/useCallback
- Bundle size monitoring in CI
- Web Vitals tracking (`vitals.ts`)
- usePerformanceMonitor hook
- 900KB chunk size warning limit

### Gaps

| #   | Gap                                   | Severity | Detail                                                                                                                                     |
| --- | ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1 | No font optimization                  | **P2**   | No `font-display: swap` or font preloading. Can cause FOIT (Flash of Invisible Text) on slower connections.                                |
| 2.2 | No critical CSS inlining              | **P2**   | Above-the-fold CSS not inlined; relies on full stylesheet download before paint.                                                           |
| 2.3 | No Lighthouse CI                      | **P1**   | No automated Lighthouse scoring in the CI pipeline. Performance regressions can ship undetected.                                           |
| 2.4 | No performance budgets (metric-level) | **P2**   | Chunk size limit exists but no budgets for LCP, FID, CLS, or TTFB.                                                                         |
| 2.5 | Leaflet map rendering weight          | **P2**   | Leaflet + tile layers are heavy. No visible virtualization for map markers at scale. Consider marker clustering or viewport-based loading. |
| 2.6 | No image format negotiation           | **P3**   | WebP variants exist in `/public` but no AVIF support or `<picture>` element with format fallbacks.                                         |

---

## 3. Accessibility (a11y)

### What Exists

- ARIA labels on interactive elements
- `aria-hidden` on decorative elements
- `aria-live` regions for announcements
- `role="alert"` on error messages
- Skip link (`useSkipLink` hook)
- axe-core accessibility testing (vitest-axe) on core components
- Radix UI primitives (built-in keyboard navigation + focus management)
- Semantic HTML usage

### Gaps

| #   | Gap                                            | Severity | Detail                                                                                                                                          |
| --- | ---------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Map inaccessible to screen readers             | **P1**   | Leaflet maps are notoriously inaccessible. No text alternative, no ARIA region describing map content, no keyboard-only spot browsing fallback. |
| 3.2 | No video captions/transcripts                  | **P1**   | TrickMint videos and game replay videos have no captions, subtitles, or text transcripts. WCAG 2.1 Level A violation (1.2.1).                   |
| 3.3 | No focus management on route transitions       | **P2**   | After client-side navigation, focus doesn't move to main content. Screen reader users hear nothing after clicking a link.                       |
| 3.4 | No reduced-motion support                      | **P2**   | Framer Motion animations run regardless of `prefers-reduced-motion`. Some users with vestibular disorders will be affected.                     |
| 3.5 | No high-contrast mode detection                | **P3**   | No `prefers-contrast` media query support.                                                                                                      |
| 3.6 | No ARIA live region for real-time game updates | **P2**   | Socket.io game state changes (turn notifications, judgements) aren't announced to assistive technology.                                         |
| 3.7 | Color contrast not formally audited            | **P2**   | Dark theme + orange accent (#ff6a00) on dark backgrounds may fail WCAG AA contrast ratios.                                                      |

---

## 4. Security

### What Exists (Excellent)

- Helmet.js with full CSP headers
- CSRF double-submit cookie pattern with timing-safe comparison
- Rate limiting: global (100 req/min), per-endpoint (signup, reset, spots, check-ins)
- Redis-backed rate limiting
- MFA/TOTP with encrypted secrets
- Firebase Auth + custom JWT (24h TTL)
- Account lockout (progressive delays)
- Gitleaks + secretlint in CI
- CodeQL static analysis
- Firestore + Storage security rules (validated in CI)
- Audit logging
- App Check (reCAPTCHA v3) — currently in "monitor" mode
- Permissions-Policy header
- Secure cookie flags
- Trivy container vulnerability scanning in staging deploy

### Gaps

| #   | Gap                                     | Severity | Detail                                                                                                            |
| --- | --------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| 4.1 | CSP allows `'unsafe-inline'` for styles | **P2**   | Required for Tailwind/styled-components, but relaxes CSP. Consider nonce-based styles.                            |
| 4.2 | No DDoS mitigation beyond rate limiting | **P2**   | No Cloudflare, AWS Shield, or equivalent. Rate limiting alone won't stop volumetric attacks.                      |
| 4.3 | No rate limiting on `/api/profile`      | **P2**   | High-traffic endpoint without explicit rate limits. Could be scraped.                                             |
| 4.4 | No API versioning                       | **P2**   | No `/api/v1/` prefix. Breaking changes require careful coordination.                                              |
| 4.5 | No rate-limit response headers          | **P3**   | Clients can't see remaining quota (`X-RateLimit-Remaining`, `X-RateLimit-Reset`).                                 |
| 4.6 | App Check in monitor mode               | **P2**   | App Check is set to "monitor" not "enforce". Requests without valid App Check tokens still succeed in production. |
| 4.7 | Stripe test keys in staging             | **P3**   | Acceptable but needs documentation to ensure production uses live keys.                                           |

---

## 5. Error Handling & Resilience

### What Exists

- Global ErrorBoundary with Sentry integration
- 404 page (`not-found.tsx`)
- EnvErrorScreen for config errors
- LoadingScreen, PageLoadingSkeleton, LoadingEmptyState
- Centralized API error handler (Express)
- `DatabaseUnavailableError` → 503
- Health probes (`/api/health/live`, `/api/health/ready`)

### Gaps

| #   | Gap                                              | Severity | Detail                                                                               |
| --- | ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------ |
| 5.1 | No offline error state                           | **P1**   | When network drops, no user-facing indicator. App silently fails.                    |
| 5.2 | No retry logic with backoff on API calls         | **P2**   | Failed API requests aren't retried. React Query can be configured for this.          |
| 5.3 | No timeout handling                              | **P2**   | Long-running requests (video uploads, map tiles) don't show timeout-specific errors. |
| 5.4 | No per-route error boundaries                    | **P2**   | Only global error boundary. A failure in one feature crashes the entire page.        |
| 5.5 | No graceful degradation for third-party failures | **P2**   | If Leaflet CDN, Cloudinary, or Firebase goes down, the app has no fallback UI.       |

---

## 6. PWA & Offline

### What Exists

- `manifest.json` with icons, theme, standalone display
- Service worker with precache + runtime cache (network-first)
- Custom PWA install prompt (`PWAInstallPrompt.tsx`)
- Apple mobile web app meta tags

### Gaps

| #   | Gap                          | Severity | Detail                                                                           |
| --- | ---------------------------- | -------- | -------------------------------------------------------------------------------- |
| 6.1 | No offline fallback page     | **P1**   | When offline, users see a blank/broken page. Should show a branded offline page. |
| 6.2 | No background sync           | **P2**   | Offline game actions (judgements, check-ins) can't queue and sync when online.   |
| 6.3 | No push notifications on web | **P2**   | Only in-app notifications. Web Push API not implemented for turn alerts.         |
| 6.4 | No offline data caching      | **P2**   | No IndexedDB or cache-first strategy for previously viewed spots/profiles.       |

---

## 7. Testing

### What Exists (Strong)

- 289 test files
- Vitest (unit), Cypress + Playwright (E2E web), Detox (E2E mobile)
- Coverage thresholds: 98% statements, 93% branches, 99% functions, 99% lines
- axe-core accessibility testing
- CI enforces all checks

### Gaps

| #   | Gap                          | Severity | Detail                                                                                                         |
| --- | ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| 7.1 | No visual regression testing | **P2**   | No Chromatic, Percy, or screenshot comparison. UI regressions can ship undetected.                             |
| 7.2 | Load testing not in CI       | **P2**   | k6 script exists (`benchmarks/k6-load-test.js`) but isn't integrated into CI. No automated load testing gates. |
| 7.3 | No contract testing          | **P3**   | No Pact or similar. Client/server API contracts aren't formally verified.                                      |
| 7.4 | No Lighthouse CI             | **P1**   | (Duplicate of 2.3) Performance not gated in CI.                                                                |

---

## 8. Monitoring & Observability

### What Exists

- Sentry (client + server, errors + performance)
- Request metrics middleware (latency histograms, p95/p99)
- Audit logging
- Request ID propagation
- Structured JSON logging with sensitive data redaction (levels: error, warn, info, debug)
- Health check endpoints with deep system checks (DB, Redis, FFmpeg)
- Web Vitals tracking
- Sentry DSN configurable per environment

### Gaps

| #   | Gap                            | Severity | Detail                                                                                                              |
| --- | ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------- |
| 8.1 | No distributed tracing         | **P2**   | No OpenTelemetry. Can't trace requests across client → API → DB → Firebase.                                         |
| 8.2 | No database query monitoring   | **P2**   | Slow queries aren't logged or alerted on.                                                                           |
| 8.3 | No custom dashboards           | **P2**   | Metabase mentioned in docs but not implemented. No Grafana or equivalent.                                           |
| 8.4 | No user analytics (product)    | **P2**   | No Google Analytics, PostHog, or Mixpanel. Can't measure feature adoption, funnels, or retention.                   |
| 8.5 | No centralized log aggregation | **P2**   | Structured logging exists but logs aren't shipped to ELK, Datadog, or similar. No log search or retention policies. |
| 8.6 | No uptime monitoring           | **P2**   | No Pingdom, UptimeRobot, or equivalent. Downtime goes undetected unless manually observed.                          |
| 8.7 | No alerting rules              | **P1**   | No PagerDuty, Opsgenie, or Slack alerts for error spikes, latency, or downtime.                                     |

---

## 9. DevOps & Deployment

### What Exists

- GitHub Actions CI — 10 workflows (lint, typecheck, test, build, bundle size, secret scan, CodeQL, Firebase rules, mobile E2E, mobile preview)
- Auto-deploy to Vercel (production, on push to `main`)
- Docker Compose staging (PostgreSQL, Redis, Nginx, Certbot) with Trivy scanning
- Firebase deploy scripts
- Environment validation on build (`scripts/verify-public-env.mjs`)
- `.env.example` + `.env.staging.example` templates
- OpenAPI 3.0 spec at `/api/docs` (dev/staging only)
- Drizzle ORM migrations with drift detection in CI
- Server setup automation (`deploy/setup-server.sh`)

### Gaps

| #   | Gap                                 | Severity | Detail                                                                                                                  |
| --- | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 9.1 | No feature flags                    | **P1**   | No LaunchDarkly, Unleash, or equivalent. Can't do gradual rollouts or kill switches for new features.                   |
| 9.2 | No automated rollback               | **P2**   | No documented rollback strategy if a deploy breaks production. Vercel supports instant rollback but it's not automated. |
| 9.3 | No blue-green/canary deployments    | **P2**   | All traffic hits new code immediately. No staged rollout.                                                               |
| 9.4 | No database backup automation       | **P1**   | No automated PostgreSQL backups. A catastrophic failure loses all data.                                                 |
| 9.5 | No disaster recovery plan           | **P1**   | No documented RTO/RPO. No recovery runbook.                                                                             |
| 9.6 | No preview deployments for PRs      | **P2**   | Can't preview web changes in isolation before merging. Vercel supports this natively.                                   |
| 9.7 | No staging smoke tests after deploy | **P2**   | `smoke-test.yml` exists but isn't wired to run post-deploy.                                                             |

---

## 10. Internationalization (i18n)

### What Exists

- Nothing. All strings hardcoded in English.

### Gaps

| #    | Gap                        | Severity | Detail                                                                                                                   |
| ---- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| 10.1 | No i18n framework          | **P3**   | No react-i18next, no translation files, no locale detection. Only relevant if expanding beyond English-speaking markets. |
| 10.2 | No RTL support             | **P3**   | No right-to-left layout support.                                                                                         |
| 10.3 | No locale-aware formatting | **P3**   | Dates, numbers, and units aren't locale-aware.                                                                           |

---

## 11. UX & Feature Gaps

| #    | Gap                                       | Severity | Detail                                                                                      |
| ---- | ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| 11.1 | No light mode                             | **P2**   | Only dark theme. Some users prefer or need light mode for readability/accessibility.        |
| 11.2 | No keyboard shortcut documentation        | **P3**   | Power users can't discover shortcuts.                                                       |
| 11.3 | No onboarding tour for new users          | **P2**   | Tutorial page exists but no interactive walkthrough (tooltips, highlights).                 |
| 11.4 | No notification preferences (granular)    | **P2**   | Users can't choose which notifications they receive (game turns vs. social vs. promotions). |
| 11.5 | No content export (GDPR data portability) | **P1**   | Users can't export their data. Required under GDPR Article 20.                              |

---

## 12. API & Backend Gaps

| #    | Gap                                         | Severity | Detail                                                                                                                   |
| ---- | ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| 12.1 | API docs disabled in production             | **P3**   | Swagger UI at `/api/docs` only available in dev/staging. Fine for security but limits third-party integration potential. |
| 12.2 | No API versioning                           | **P2**   | (Duplicate of 4.4) No `/api/v1/` prefix.                                                                                 |
| 12.3 | No batch/bulk endpoints                     | **P3**   | No way to fetch multiple spots or profiles in one request.                                                               |
| 12.4 | No deprecation headers                      | **P3**   | Legacy endpoints don't signal deprecation to clients.                                                                    |
| 12.5 | No webhook system for external integrations | **P3**   | No way for third parties to subscribe to events.                                                                         |

---

## Priority Summary

### P0 — Critical (0 items)

No blocking issues. The app is functional and shippable.

### P1 — High (12 items)

| #    | Gap                                            |
| ---- | ---------------------------------------------- |
| 1.1  | No generated sitemap.xml                       |
| 1.2  | No dynamic meta tags on content pages          |
| 1.6  | SPA limits crawlability for non-Google engines |
| 2.3  | No Lighthouse CI                               |
| 3.1  | Map inaccessible to screen readers             |
| 3.2  | No video captions/transcripts                  |
| 5.1  | No offline error state                         |
| 6.1  | No offline fallback page                       |
| 8.7  | No alerting rules                              |
| 9.1  | No feature flags                               |
| 9.4  | No database backup automation                  |
| 9.5  | No disaster recovery plan                      |
| 11.5 | No content export (GDPR)                       |

### P2 — Medium (30 items)

Covers performance optimizations, a11y improvements, monitoring, testing, deployment maturity, and UX refinements.

### P3 — Low (10 items)

Covers i18n, API ergonomics, and minor enhancements.

---

## Recommended Next Steps

1. **Immediate (this sprint):** Generate sitemap, add offline fallback page, set up database backups, add alerting (Sentry alerts or PagerDuty)
2. **Short-term (next 2 sprints):** Dynamic meta tags for spots/profiles, Lighthouse CI, feature flags, offline error state, reduced-motion support
3. **Medium-term (next quarter):** Map accessibility, video captions, distributed tracing, visual regression testing, GDPR data export, user analytics
4. **Long-term (future quarters):** i18n, SSR/prerendering for public pages, light mode, load testing, blue-green deployments
