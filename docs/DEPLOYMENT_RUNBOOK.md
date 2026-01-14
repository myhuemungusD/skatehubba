# SkateHubba Deployment Runbook

## Task 1 — Vercel Output Mismatch (public vs dist)

### Prompt 1: Root Cause Analysis + Minimal Fix + Prevention

#### Root Cause Identification

**Primary Cause: Vercel dashboard output directory drift**

The exact root cause is a **mismatch between Vercel's expected output directory and Vite's actual build output location**:

| Setting | Expected | Actual |
|---------|----------|--------|
| Vercel `outputDirectory` | `public` or `dist` | `dist/public` |
| Vite `build.outDir` | - | `../dist/public` (relative to `/client`) |

**Evidence Chain:**
1. Build log shows: `dist/index.html` and `dist/assets/*` inside `/vercel/path0/client`
2. Vite config: `outDir: "../dist/public"` (relative to client/, resolves to repo root `dist/public/`)
3. Vercel was looking for `public` or `dist` at repo root, not `dist/public`

**Contributing factors:**
- Multiple config sources (dashboard vs vercel.json)
- Framework preset defaults (Vite preset expects `dist/`)
- Monorepo structure confusion (build runs in `/client` but outputs to repo root)

#### Minimal Deterministic Fix

**Exact Vercel Settings:**

| Setting | Value |
|---------|-------|
| **Root Directory** | `.` (repo root) |
| **Build Command** | `pnpm run build` |
| **Output Directory** | `dist/public` |
| **Framework Preset** | `Vite` |
| **Install Command** | `pnpm install` |

**vercel.json (KEEP - single source of truth):**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm run build",
  "outputDirectory": "dist/public",
  "framework": "vite",
  "installCommand": "pnpm install",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

#### Prevention Plan: Single Source of Truth Strategy

**Strategy: Repo-enforced configuration (vercel.json is authoritative)**

1. **vercel.json pins all build settings** - dashboard cannot override
2. **CI guard validates output exists before deploy**
3. **Doctor script validates configuration consistency**

**CI Guard (GitHub Actions):**

```yaml
# .github/workflows/deploy-guard.yml
name: Deploy Guard

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate-build-output:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v4
        with:
          version: 10
          
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          
      - run: pnpm install --frozen-lockfile
      
      - name: Build
        run: pnpm run build
        
      - name: Validate Output Directory
        run: |
          if [ ! -f "dist/public/index.html" ]; then
            echo "❌ DEPLOY BLOCKED: dist/public/index.html not found"
            echo "Expected output directory: dist/public/"
            echo "Actual contents:"
            ls -la dist/ || echo "dist/ does not exist"
            exit 1
          fi
          echo "✅ Output directory validated: dist/public/index.html exists"
          
      - name: Validate vercel.json matches output
        run: |
          OUTPUT_DIR=$(jq -r '.outputDirectory' vercel.json)
          if [ "$OUTPUT_DIR" != "dist/public" ]; then
            echo "❌ DEPLOY BLOCKED: vercel.json outputDirectory ($OUTPUT_DIR) != dist/public"
            exit 1
          fi
          echo "✅ vercel.json outputDirectory matches build output"
```

---

### Prompt 2: Incident Mode - Deterministic Deploy Contract + Rollback

#### Incident Summary

| Field | Value |
|-------|-------|
| **Severity** | P1 - Production Down |
| **Symptom** | Deploy fails post-build, Vercel can't find output dir `public` |
| **Actual Output** | `dist/public/` at repo root |
| **Build Path** | `/vercel/path0/client` |

#### Deploy Contract

**1. Repo Assumptions:**
```
/skatehubba1
├── client/              # Frontend source (Vite root)
│   ├── src/
│   ├── index.html
│   └── vite.config.ts   # outDir: "../dist/public"
├── dist/
│   └── public/          # ← ACTUAL BUILD OUTPUT
│       ├── index.html
│       └── assets/
├── vercel.json          # AUTHORITATIVE config
└── package.json         # build: "pnpm -C client build"
```

**2. Vercel Settings Required:**

| Setting | Value | Rationale |
|---------|-------|-----------|
| Root Directory | `.` | Build from repo root to access monorepo scripts |
| Build Command | `pnpm run build` | Uses monorepo build orchestration |
| Output Directory | `dist/public` | Matches Vite `build.outDir` |
| Framework Preset | `Vite` | Enables SPA routing |
| Install Command | `pnpm install` | pnpm workspace support |

**3. vercel.json Contract:**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm run build",
  "outputDirectory": "dist/public",
  "framework": "vite",
  "installCommand": "pnpm install",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**4. CI Step - Fail if Output Missing:**

```yaml
- name: Verify Build Artifacts
  run: |
    REQUIRED_FILES=(
      "dist/public/index.html"
      "dist/public/assets"
    )
    for file in "${REQUIRED_FILES[@]}"; do
      if [ ! -e "$file" ]; then
        echo "::error::Missing required artifact: $file"
        exit 1
      fi
    done
    echo "✅ All required artifacts present"
```

**5. Rollback Steps:**

```bash
# Via Vercel CLI
vercel ls skatehubba1 --prod              # List deployments
vercel promote <previous-deployment-url>   # Promote last working

# Via Vercel Dashboard
# 1. Go to Project → Deployments
# 2. Find last successful production deployment
# 3. Click "..." → "Promote to Production"
```

**6. Commit SHA Verification:**

```bash
# Add to build script (scripts/doctor.mjs)
const meta = {
  build: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local',
  branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || 'unknown',
  ts: new Date().toISOString()
};
fs.writeFileSync('client/public/version.txt', JSON.stringify(meta));

# Verify deployed artifact
curl -s https://skatehubba1.vercel.app/version.txt | jq .
# Should match the commit SHA that was deployed
```

#### Incident Response Format

| Phase | Action |
|-------|--------|
| **Root Cause** | vercel.json `outputDirectory` set to `dist` but Vite outputs to `dist/public` |
| **Immediate Mitigation** | `vercel promote <last-working-url>` |
| **Corrective Action** | Update vercel.json: `"outputDirectory": "dist/public"` |
| **Preventative Action** | CI guard + doctor script validation |

---

### Prompt 3: Two Configs - Dashboard-only vs Repo-enforced

#### Option A: Dashboard-Only Config

**Vercel Dashboard Settings:**
| Setting | Value |
|---------|-------|
| Root Directory | `.` |
| Build Command | `pnpm run build` |
| Output Directory | `dist/public` |
| Install Command | `pnpm install` |
| Framework | Vite |

**Repo Files:** None (delete vercel.json)

**Pros:**
- Simpler repo structure
- Easy to change settings without commits
- No config file conflicts

**Cons:**
- ⚠️ HIGH DRIFT RISK - anyone with dashboard access can change settings
- No version control of deployment config
- Cannot reproduce settings from repo alone
- Team members may accidentally change settings

#### Option B: Repo-Enforced Config (RECOMMENDED)

**Vercel Dashboard Settings:**
| Setting | Value |
|---------|-------|
| Root Directory | `.` |
| (all others) | *Overridden by vercel.json* |

**vercel.json:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm run build",
  "outputDirectory": "dist/public",
  "framework": "vite",
  "installCommand": "pnpm install",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Pros:**
- ✅ Version controlled - changes require PR review
- ✅ Reproducible - clone repo = know exact deploy config
- ✅ Auditable - git history shows who changed what
- ✅ Multi-env consistency - same config for all environments
- ✅ Dashboard cannot override (vercel.json wins)

**Cons:**
- Requires commit to change settings
- Must keep vercel.json in sync with Vite config

#### Recommendation: Option B (Repo-Enforced)

**Rationale:**
1. **Reproducibility** - Any engineer can understand deployment from repo alone
2. **Auditability** - Config changes go through PR review
3. **Drift Prevention** - vercel.json overrides dashboard settings
4. **Team Scale** - As team grows, dashboard access becomes a liability

---

## Task 2 — Vite/Rollup Alias Mismatch (@/… works in TS, fails in Vite)

### Prompt 4: Resolve @/* Robustly + CI Validation

#### Root Cause Analysis

**Error:** `Rollup failed to resolve import "@/components/ui/card"`

**Why TS works but Vite fails:**

| Tool | Resolution Method | Config Source |
|------|-------------------|---------------|
| TypeScript (`tsc`) | `tsconfig.json` paths | `"@/*": ["src/*"]` |
| Vite/Rollup | `vite.config.ts` resolve.alias OR plugin | Must be configured separately |

**Likely causes:**
1. ✅ **Alias drift** - tsconfig has paths, Vite doesn't
2. ✅ **baseUrl mismatch** - tsconfig baseUrl vs Vite root
3. ✅ **tsconfig selection** - vite-tsconfig-paths picking wrong config
4. **Monorepo root confusion** - building from wrong directory
5. **Linux case-sensitivity** - `Card.tsx` vs `card.tsx`
6. ✅ **Duplicate configs** - root vite.config.ts vs client/vite.config.ts conflict

#### Robust Solution

**client/vite.config.ts:**
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // Explicit project selection - no "nearest tsconfig" surprises
    tsconfigPaths({ 
      projects: [path.resolve(__dirname, "./tsconfig.json")] 
    }),
  ],
  envDir: path.resolve(__dirname, ".."),
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    sourcemap: false,
  },
  publicDir: "public",
});
```

**client/tsconfig.json:**
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "./.tsbuild",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "baseUrl": ".",
    "skipLibCheck": true,
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["../shared/*"],
      "@shared": ["../shared/index"]
    },
    "tsBuildInfoFile": "./.tsbuild/tsconfig.tsbuildinfo"
  },
  "include": [
    "src",
    "../shared",
    "vite.config.ts",
    "postcss.config.js",
    "index.html"
  ]
}
```

**Required Dependencies:**
```bash
pnpm -C client add -D vite-tsconfig-paths
```

#### CI Check - Vite Resolution Validation

```yaml
# .github/workflows/vite-alias-check.yml
name: Vite Alias Resolution Check

on:
  push:
    paths:
      - 'client/**'
      - 'shared/**'
      - 'tsconfig.json'
  pull_request:
    paths:
      - 'client/**'
      - 'shared/**'
      - 'tsconfig.json'

jobs:
  check-alias-resolution:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v4
        with:
          version: 10
          
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          
      - run: pnpm install --frozen-lockfile
      
      - name: TypeScript Check
        run: pnpm -C client typecheck
        
      - name: Vite Build (validates Rollup resolution)
        run: pnpm -C client build
        
      - name: Verify @/* imports resolved
        run: |
          # Check that no unresolved @/ imports in output
          if grep -r "from ['\"]@/" dist/public/assets/*.js 2>/dev/null; then
            echo "❌ Found unresolved @/ imports in build output"
            exit 1
          fi
          echo "✅ All @/* imports resolved correctly"
```

---

### Prompt 5: Monorepo-Safe Alias Strategy

#### Alias Strategy

| Alias | Maps To | Used For |
|-------|---------|----------|
| `@/*` | `/client/src/*` | Client-side components, pages, hooks |
| `@shared/*` | `/shared/*` | Shared types, schemas, utilities |
| `@shared` | `/shared/index` | Barrel export |

#### Configuration

**Why `moduleResolution: "Bundler"`:**
- Designed for bundlers (Vite, webpack, esbuild)
- Supports `exports` field in package.json
- Handles `.ts` extensions without explicit extension
- Works with path aliases out of the box
- **Alternative `NodeNext`** requires explicit `.js` extensions which is cumbersome

**client/tsconfig.json:**
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["../shared/*"],
      "@shared": ["../shared/index"]
    }
  },
  "include": ["src", "../shared"]
}
```

**client/vite.config.ts:**
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // Single source of truth: tsconfig.json paths
    // NO duplicate alias in resolve.alias
    tsconfigPaths({ 
      projects: [path.resolve(__dirname, "./tsconfig.json")] 
    }),
  ],
  // ... rest of config
});
```

#### Gotchas Checklist

| Issue | Solution |
|-------|----------|
| **Case sensitivity (Linux CI)** | Always use exact case: `Button.tsx` not `button.tsx` |
| **index.ts resolution** | `@shared` maps to `../shared/index`, ensure barrel export exists |
| **Build root vs repo root** | Use `path.resolve(__dirname, ...)` for explicit paths |
| **Duplicate alias sources** | Use ONLY tsconfig paths via vite-tsconfig-paths, NOT resolve.alias |
| **Monorepo sibling access** | Include `"../shared"` in tsconfig `include` array |
| **ESM/CJS conflicts** | Ensure all configs use `"type": "module"` in package.json |

---

## Task 3 — Runtime Crash (Error Boundary)

### Prompt 6: On-Call Triage Plan

#### Top 5 Root Causes

| # | Cause | How to Confirm | How to Fix |
|---|-------|----------------|------------|
| 1 | **Chunk Load Error (stale cache)** | Console: `ChunkLoadError: Loading chunk X failed` | Clear SW cache, force refresh, redeploy |
| 2 | **Missing VITE_* env vars** | Console: `undefined` for `import.meta.env.VITE_*` | Add env vars in Vercel dashboard, redeploy |
| 3 | **API 401/500 errors** | Network tab: red requests to `/api/*` | Check backend health, auth tokens |
| 4 | **CORS blocking** | Console: `Access-Control-Allow-Origin` error | Update CORS config on backend |
| 5 | **Wrong deployment/domain** | version.txt doesn't match expected commit | Promote correct deployment |

#### Triage Steps

**Step 1: Capture First Error**
```javascript
// In browser console
window.onerror = (msg, url, line, col, err) => {
  console.log('FIRST ERROR:', { msg, url, line, col, stack: err?.stack });
};
// Or check: Console → Filter → Errors only → First red entry
```

**Step 2: Check Network Failures**
```
DevTools → Network → Filter: "status-code:4" or "status-code:5"
Look for:
- 404 on .js chunks → stale deployment
- 401 on /api/* → auth issue
- 500 on /api/* → backend crash
- CORS errors → preflight failures
```

**Step 3: Service Worker Cache Poisoning**
```javascript
// Full cache clear
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}
caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
location.reload(true);
```

**Step 4: Verify Env Vars**
```javascript
// In console
console.log(import.meta.env);
// Check for VITE_FIREBASE_*, VITE_API_URL, etc.
// If undefined → env var not set at build time
```

**Step 5: Verify Deployment**
```bash
curl -s https://skatehubba1.vercel.app/version.txt
# Compare commit SHA to expected
```

#### Emergency Rollback

```bash
# Via Vercel CLI
vercel ls skatehubba1 --prod
vercel promote dpl_xxxxx  # Previous working deployment

# Safe Redeploy
git revert HEAD  # If recent commit caused issue
git push origin main
# OR
vercel --prod --force  # Force fresh build
```

---

### Prompt 7: Crash-Proof Boot Sequence

#### 1. Environment Validation Module

**client/src/lib/env.ts:**
```typescript
interface EnvConfig {
  FIREBASE_API_KEY: string;
  FIREBASE_AUTH_DOMAIN: string;
  FIREBASE_PROJECT_ID: string;
  API_URL: string;
}

const requiredVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN', 
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_API_URL',
] as const;

export function validateEnv(): EnvConfig {
  const missing: string[] = [];
  
  for (const key of requiredVars) {
    if (!import.meta.env[key]) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    const correlationId = `ENV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    throw new EnvValidationError(
      `Missing required environment variables: ${missing.join(', ')}`,
      correlationId,
      missing
    );
  }
  
  return {
    FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    API_URL: import.meta.env.VITE_API_URL,
  };
}

export class EnvValidationError extends Error {
  constructor(
    message: string,
    public correlationId: string,
    public missingVars: string[]
  ) {
    super(message);
    this.name = 'EnvValidationError';
  }
}
```

#### 2. Enhanced Error Boundary

**client/src/components/ErrorBoundary.tsx:**
```typescript
import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { EnvValidationError } from '@/lib/env';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  correlationId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      correlationId: ''
    };
  }

  static getDerivedStateFromError(error: Error): State {
    const correlationId = error instanceof EnvValidationError 
      ? error.correlationId 
      : `ERR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    return { hasError: true, error, correlationId };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Console logging
    console.error('[ErrorBoundary] Caught error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      correlationId: this.state.correlationId,
    });

    // Sentry logging
    Sentry.withScope((scope) => {
      scope.setTag('correlationId', this.state.correlationId);
      scope.setTag('release', import.meta.env.VITE_VERSION || 'unknown');
      scope.setExtra('componentStack', errorInfo.componentStack);
      
      if (error instanceof EnvValidationError) {
        scope.setTag('errorType', 'env_validation');
        scope.setExtra('missingVars', error.missingVars);
      }
      
      Sentry.captureException(error);
    });
  }

  render() {
    if (this.state.hasError) {
      const { error, correlationId } = this.state;
      
      // Special handling for env validation errors
      if (error instanceof EnvValidationError) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
              <h1 className="text-xl font-bold text-red-600 mb-4">
                Configuration Error
              </h1>
              <p className="text-gray-600 mb-4">
                The application is missing required configuration.
                Please contact support with the reference ID below.
              </p>
              <code className="block bg-gray-100 p-2 rounded text-sm mb-4">
                {correlationId}
              </code>
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Retry
              </button>
            </div>
          </div>
        );
      }

      // Generic error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold mb-2">Oops! Something went wrong</h1>
            <p className="text-gray-600 mb-4">
              Don't worry, we've been notified and are looking into it.
            </p>
            <code className="block bg-gray-100 p-2 rounded text-xs mb-4">
              Ref: {correlationId}
            </code>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

#### 3. Chunk Load Recovery Handler

**client/src/lib/chunkLoadRecovery.ts:**
```typescript
// Track refresh attempts to prevent infinite loops
const REFRESH_KEY = 'chunk_refresh_attempt';
const MAX_REFRESH_ATTEMPTS = 2;

export function handleChunkLoadError(error: Error): void {
  const isChunkError = 
    error.name === 'ChunkLoadError' ||
    error.message.includes('Loading chunk') ||
    error.message.includes('Failed to fetch dynamically imported module');

  if (!isChunkError) {
    throw error;
  }

  const attempts = parseInt(sessionStorage.getItem(REFRESH_KEY) || '0', 10);
  
  if (attempts < MAX_REFRESH_ATTEMPTS) {
    console.warn(`[ChunkLoadRecovery] Attempt ${attempts + 1}/${MAX_REFRESH_ATTEMPTS}`);
    sessionStorage.setItem(REFRESH_KEY, String(attempts + 1));
    
    // Clear service worker cache
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      });
    }
    
    // Hard refresh
    window.location.reload();
  } else {
    console.error('[ChunkLoadRecovery] Max attempts reached, showing error');
    sessionStorage.removeItem(REFRESH_KEY);
    throw new Error('Failed to load application. Please clear your browser cache and try again.');
  }
}

// Clear refresh counter on successful load
export function markSuccessfulLoad(): void {
  sessionStorage.removeItem(REFRESH_KEY);
}
```

#### 4. Playwright Smoke Test

**e2e/smoke.spec.ts:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Production Smoke Test', () => {
  test('should load without error boundary', async ({ page }) => {
    // Capture console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to app
    await page.goto('/');
    
    // Wait for app to hydrate
    await page.waitForLoadState('networkidle');
    
    // Check error boundary is NOT visible
    const errorBoundary = page.locator('text="Oops! Something went wrong"');
    await expect(errorBoundary).not.toBeVisible();
    
    // Check configuration error is NOT visible
    const configError = page.locator('text="Configuration Error"');
    await expect(configError).not.toBeVisible();
    
    // Verify no console errors
    expect(errors.filter(e => !e.includes('React DevTools'))).toHaveLength(0);
    
    // Verify app rendered something meaningful
    await expect(page.locator('body')).not.toBeEmpty();
  });
  
  test('should have valid version.txt', async ({ page }) => {
    const response = await page.goto('/version.txt');
    expect(response?.status()).toBe(200);
    
    const content = await response?.text();
    const version = JSON.parse(content || '{}');
    
    expect(version).toHaveProperty('build');
    expect(version).toHaveProperty('ts');
  });
});
```

**GitHub Actions Job:**
```yaml
# .github/workflows/smoke-test.yml
name: Smoke Test

on:
  deployment_status:
  workflow_dispatch:
    inputs:
      url:
        description: 'URL to test'
        required: true
        default: 'https://skatehubba1.vercel.app'

jobs:
  smoke-test:
    if: github.event.deployment_status.state == 'success' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v4
        with:
          version: 10
          
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          
      - run: pnpm install --frozen-lockfile
      
      - name: Install Playwright
        run: pnpm exec playwright install --with-deps chromium
        
      - name: Run Smoke Tests
        run: pnpm exec playwright test e2e/smoke.spec.ts
        env:
          BASE_URL: ${{ github.event.deployment_status.target_url || github.event.inputs.url }}
          
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Task 4 — CodeQL High Severity Alert

### Prompt 8: Security Vulnerability Analysis

#### Analysis Template

When a CodeQL alert is received, analyze:

**1. Vulnerability Class Identification:**
```
Common high-severity classes:
- js/command-injection: User input in exec()/spawn()
- js/sql-injection: User input in SQL queries
- js/path-injection: User input in file paths
- js/xss: User input in innerHTML/dangerouslySetInnerHTML
- js/ssrf: User input in fetch/axios URLs
- js/prototype-pollution: User input modifying Object.prototype
- js/missing-csrf-middleware: State-changing routes without CSRF
```

**2. Exploitability Assessment:**
```
Questions to answer:
- Is the source user-controlled? (req.body, req.query, req.params)
- Can an attacker reach the sink? (is the route public?)
- Are there sanitization steps between source and sink?
- What's the impact? (RCE, data exfil, DoS)
```

**3. Patch Pattern:**

For `js/missing-csrf-middleware`:
```typescript
// BEFORE (vulnerable)
app.post('/api/update', (req, res) => { /* ... */ });

// AFTER (fixed)
import { requireCsrfToken } from './middleware/csrf';
app.post('/api/update', requireCsrfToken, (req, res) => { /* ... */ });
```

**4. Regression Test:**
```typescript
describe('CSRF Protection', () => {
  it('should reject POST without CSRF token', async () => {
    const res = await request(app)
      .post('/api/update')
      .send({ data: 'test' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid CSRF token');
  });
  
  it('should accept POST with valid CSRF token', async () => {
    // Get CSRF token from cookie
    const csrfRes = await request(app).get('/api/csrf');
    const csrfToken = csrfRes.headers['set-cookie']
      .find(c => c.startsWith('csrf_token='))
      ?.split('=')[1]?.split(';')[0];
    
    const res = await request(app)
      .post('/api/update')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', `csrf_token=${csrfToken}`)
      .send({ data: 'test' });
    expect(res.status).toBe(200);
  });
});
```

**5. False Positive Suppression:**
```yaml
# .github/codeql/codeql-config.yml
query-filters:
  # Suppress: We use double-submit cookie pattern per OWASP
  - exclude:
      id: js/missing-csrf-middleware
      # Only if you have documented the mitigation
```

---

### Prompt 9: Secure SDLC Plan

#### Threat Model for Web App Surface

| Threat | Attack Vector | Mitigation |
|--------|---------------|------------|
| CSRF | Cross-site form submission | Double-submit cookie pattern |
| XSS | Malicious user input rendered | React auto-escaping, CSP headers |
| Injection | User input in queries/commands | Parameterized queries, input validation |
| Auth bypass | Session/token manipulation | Secure session config, token validation |
| Data exposure | Overly permissive APIs | Authorization middleware, field filtering |

#### Safe Coding Patterns

```typescript
// 1. Input Validation (Zod)
import { z } from 'zod';
const spotSchema = z.object({
  name: z.string().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// 2. Parameterized Queries (Drizzle)
const spot = await db.select().from(spots).where(eq(spots.id, spotId));
// NOT: db.execute(`SELECT * FROM spots WHERE id = ${spotId}`)

// 3. Output Encoding (React handles this)
// Safe: <div>{userInput}</div>
// Dangerous: <div dangerouslySetInnerHTML={{__html: userInput}} />

// 4. Authorization Checks
app.delete('/api/spots/:id', authenticateUser, async (req, res) => {
  const spot = await spotStorage.getSpotById(req.params.id);
  if (spot.createdBy !== req.currentUser.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  // proceed with delete
});
```

#### CI Guardrails

```yaml
# .github/workflows/security-gates.yml
name: Security Gates

on:
  pull_request:
    branches: [main]

jobs:
  codeql:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          config-file: .github/codeql/codeql-config.yml
          
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        
  security-gate:
    needs: codeql
    runs-on: ubuntu-latest
    steps:
      - name: Check for High Severity Alerts
        uses: actions/github-script@v7
        with:
          script: |
            const alerts = await github.rest.codeScanning.listAlertsForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open',
              severity: 'high,critical'
            });
            
            if (alerts.data.length > 0) {
              core.setFailed(`❌ ${alerts.data.length} high/critical security alerts found`);
              alerts.data.forEach(a => {
                core.error(`${a.rule.severity}: ${a.rule.description} in ${a.most_recent_instance.location.path}`);
              });
            }
```

#### Branch Protection Policy

**GitHub Settings → Branches → Branch protection rules → main:**

| Setting | Value |
|---------|-------|
| Require pull request before merging | ✅ |
| Required approvals | 1 |
| Dismiss stale PR approvals | ✅ |
| Require status checks to pass | ✅ |
| Required checks | `codeql`, `security-gate`, `build` |
| Require branches to be up to date | ✅ |
| Require conversation resolution | ✅ |
| Do not allow bypassing | ✅ |

---

## Task 5 — Merge Decisions

### Prompt 10: Release Manager Decision Framework

#### Decision Matrix

| CI Status | CodeQL Status | Decision |
|-----------|---------------|----------|
| ✅ Pass | ✅ No alerts | **MERGE** |
| ✅ Pass | ⚠️ Medium/Low | **MERGE** with follow-up ticket |
| ✅ Pass | ❌ High/Critical | **DO NOT MERGE** |
| ❌ Fail | Any | **DO NOT MERGE** |
| ⚠️ Flaky | ✅ No alerts | **RERUN CI**, then decide |

#### Required Approvals

| Alert Severity | Required Approvers |
|----------------|-------------------|
| None | 1 engineer |
| Low/Medium | 1 engineer + security ticket created |
| High | Security lead + Release manager |
| Critical | CTO/VP Eng + Security lead |

#### Rollback Strategy

**Vercel Rollback (< 5 min):**
```bash
# List recent deployments
vercel ls skatehubba1 --prod

# Promote previous working deployment
vercel promote dpl_xxxPreviousGood

# Verify
curl -s https://skatehubba1.vercel.app/version.txt
```

**Git Revert (if config change):**
```bash
git revert HEAD --no-edit
git push origin main
# Vercel auto-deploys from main
```

#### Feature Flag Strategy

**Ship Dark, Enable Gradually:**

```typescript
// lib/featureFlags.ts
export const flags = {
  newMapFeature: import.meta.env.VITE_FF_NEW_MAP === 'true',
  betaCheckIn: import.meta.env.VITE_FF_BETA_CHECKIN === 'true',
};

// Usage
{flags.newMapFeature && <NewMapComponent />}
```

**Gradual Rollout:**
1. Deploy with flag OFF
2. Enable for internal team (env var in Preview)
3. Enable for 10% of users (feature flag service)
4. Monitor SLOs for 24h
5. Full rollout or rollback

#### "Merge Anyway" Playbook

**Prerequisites:**
- [ ] Release manager approval
- [ ] Security lead sign-off (for high severity)
- [ ] Canary deployment successful
- [ ] Rollback tested in staging

**Steps:**
1. Create tracking ticket for deferred fix
2. Deploy to canary/preview environment
3. Monitor for 1 hour:
   - Error rates < 0.1%
   - P95 latency < baseline + 10%
   - No new Sentry alerts
4. If healthy → merge + full deploy
5. If degraded → rollback canary, DO NOT merge

**Post-Merge:**
- [ ] Hotfix PR created within 24h
- [ ] Security ticket updated
- [ ] Incident retrospective scheduled (if high severity)

#### "Do Not Merge" Playbook

**Fastest Path to Green:**

| Blocker | Owner | ETA | Action |
|---------|-------|-----|--------|
| Build failure | PR author | 1h | Fix + repush |
| Type errors | PR author | 30m | Fix + repush |
| High CodeQL | Security lead | 4h | Patch vulnerability |
| Flaky test | Test owner | 2h | Fix or quarantine |

**Checklist:**
- [ ] Identify blocker category
- [ ] Assign owner
- [ ] Set ETA
- [ ] Communicate in PR comments
- [ ] Update status in standup

---

## Quick Reference

### Emergency Commands

```bash
# Rollback production
vercel promote dpl_xxxPreviousGood

# Check current deployment
curl -s https://skatehubba1.vercel.app/version.txt | jq .

# Force clean rebuild
vercel --prod --force

# Clear Vercel cache
vercel env rm VERCEL_FORCE_NO_BUILD_CACHE
vercel env add VERCEL_FORCE_NO_BUILD_CACHE 1
vercel --prod
vercel env rm VERCEL_FORCE_NO_BUILD_CACHE
```

### Key Files

| File | Purpose |
|------|---------|
| `vercel.json` | Deployment config (authoritative) |
| `client/vite.config.ts` | Build config |
| `client/tsconfig.json` | TypeScript + path aliases |
| `scripts/doctor.mjs` | Pre-deploy validation |
| `.github/workflows/` | CI/CD pipelines |
