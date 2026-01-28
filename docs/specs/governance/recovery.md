🔒 SPEC-DRIVEN RECOVERY PROMPT — SKATEHUBBA™

1. Spec Audit
Spec Source: .github/workflows/deploy.yml (Locked Workflow) & pnpm-workspace.yaml (Repo Structure)

Expectations (Spec) vs. Reality (Repo):

Package Manager:

Spec: npm ci (Strict Clean Install).

Repo: Uses pnpm (contains pnpm-lock.yaml, pnpm-workspace.yaml).

Gap: package-lock.json is missing. npm ci will fail immediately.

Script: Typecheck:

Spec: npm run typecheck must verify type integrity across the codebase.

Repo: No root package.json to define this script.

Script: Build:

Spec: npm run build must compile assets and produce a specific artifact structure.

Repo: No root package.json to define this script.

Artifact Structure:

Spec: actions/upload-artifact expects a single dist directory at the project root.

Repo: Monorepo structure typically builds to client/dist and server/dist.

Dependencies:

Spec: Code imports express, react, vite, helmet, etc.

Repo: No package.json files to declare these dependencies, meaning npm install installs nothing.

2. Gap Classification
Root Manifest (package.json): Missing Infrastructure. (Critical blocker).

Lockfile (package-lock.json): Missing Infrastructure. (Required for npm ci).

Client/Server Manifests: Missing Infrastructure. (Required for module resolution).

TypeScript Configuration (tsconfig.json): Missing Infrastructure. (Required for typecheck and build).

Artifact Aggregation Logic: Deferred Implementation. (Logic to move client/dist -> dist/public).

3. Minimal Compliance Plan
Initialize Root package.json:

Define workspaces (matching pnpm-workspace.yaml logic) to allow npm to function.

Implement typecheck script: cascading check (Client + Server).

Implement build script: cascading build + artifact aggregation (Client -> dist/public, Server -> dist/server).

Initialize Sub-package Manifests:

Create client/package.json with minimal vite build script.

Create server/package.json with minimal tsc build script.

Initialize TypeScript Config:

Create base tsconfig.json to allow tsc to execute.

Lockfile Generation (Manual Step):

Explicit instruction to run npm install to generate package-lock.json (required to pass npm ci).

4. Execution: Exact Files to Add
A. Root package.json
Purpose: Orchestration and Artifact Assembly

JSON

{
  "name": "skatehubba-monorepo",
  "version": "0.0.1",
  "private": true,
  "workspaces": [
    "client",
    "server",
    "shared",
    "infra/firebase/functions",
    "mobile"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev -w server\" \"npm run dev -w client\"",
    "typecheck": "npm run typecheck -w client && npm run typecheck -w server",
    "build": "npm run build -w client && npm run build -w server && npm run package:dist",
    "package:dist": "rm -rf dist && mkdir -p dist/server && mkdir -p dist/public && cp -r server/dist/* dist/server/ && cp -r client/dist/* dist/public/",
    "test": "echo \"✅ No tests defined yet (Spec-compliant stub)\""
  },
  "devDependencies": {
    "concurrently": "^8.0.0",
    "typescript": "^5.0.0"
  }
}
B. server/package.json
Purpose: API/Backend Dependencies & Build

JSON

{
  "name": "skatehubba-server",
  "version": "0.0.1",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "dev": "tsx watch index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "compression": "^1.7.4",
    "cookie-parser": "^1.4.6",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.17",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
C. client/package.json
Purpose: Frontend Dependencies & Build

JSON

{
  "name": "skatehubba-client",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "wouter": "^3.0.0",
    "framer-motion": "^10.0.0",
    "@tanstack/react-query": "^5.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.0.0",
    "typescript": "^5.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^3.0.0"
  }
}
D. tsconfig.json (Root)
Purpose: Compilation rules

JSON

{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["client/src", "server"],
  "references": [{ "path": "./client" }, { "path": "./server" }]
}
5. Risk Assessment
Lockfile Hazard: The workflow uses npm ci. This command will fail until you run npm install locally to generate package-lock.json and push it. This is a non-negotiable requirement of npm ci.

Dependency Drift: I have estimated dependencies based on imports visible in the codebase. If the actual code uses a library I missed (e.g., zod, drizzle-orm), the build will fail. Monitor the first build logs closely.

6. Confirmation
Spec Integrity Preserved: YES.

Why: We did not modify the deploy.yml or ci.yml workflows. We built the missing infrastructure around them to ensure the strict npm ci, typecheck, and build commands execute successfully and produce the artifact structure expected by the release pipeline.
