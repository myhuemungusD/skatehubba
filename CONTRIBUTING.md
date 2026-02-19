## Contributing to SkateHubba

Thank you for contributing. We hold our codebase to the same standards as a professional contest run: technical, clean, and high-impact.

### Monorepo Architecture

SkateHubba is a TypeScript pnpm workspace orchestrated by Turborepo.

**Project Map**

```text
client/      React + Vite + TypeScript frontend
server/      Express API + PostgreSQL backend
mobile/      React Native / Expo app
functions/   Firebase Cloud Functions
packages/    Shared code (config, db, firebase, shared, types, utils)
```

### Getting Started

**Prerequisites**

- Node.js 20+
- pnpm 10+ (enforced — `npm install` will fail)

**Setup**

```bash
# 1. Fork the repo at https://github.com/myhuemungusD/skatehubba
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/skatehubba.git
cd skatehubba

# 3. Add upstream remote
git remote add upstream https://github.com/myhuemungusD/skatehubba.git

# 4. Install dependencies
pnpm install
```

### Development Workflow

**Syncing with upstream**

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

**Running the dev server**

```bash
pnpm dev
```

**Branch naming**

- `feat/description` — New functionality
- `fix/description` — Bug fixes
- `refactor/description` — Structural improvements, no logic change
- `chore/description` — Dependency updates, maintenance

### Engineering Standards

**Shared packages**

Types and schemas live in `packages/`. If you add data structures that are used across client and server, define them there.

**Code quality**

- Strict TypeScript — no `any`. Use `unknown` or generics for dynamic types.
- Functional React components with hooks.
- Tailwind CSS — follow the design tokens in `tailwind.config.ts`, no hardcoded hex codes.

### Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/).

Format: `type(scope): subject`

Example: `feat(client): add real-time spot check-in validation`

### Pull Request Process

1. **Rebase** your feature branch against `upstream/main` before submitting.
2. **Verify locally** — run the full quality suite:

```bash
pnpm run typecheck    # TypeScript checking
pnpm run lint         # ESLint (zero warnings)
pnpm test             # Unit tests
pnpm run format:check # Prettier formatting
pnpm run build        # Full build
```

Or run everything at once:

```bash
pnpm run verify
```

3. **Update docs** — if you changed API endpoints or data flows, update the relevant files in `docs/`.

All PRs are gated by CI (GitHub Actions) which runs typecheck, lint, tests, format checking, secret scanning, and build verification.

### Recognition

Every meaningful contribution is tracked. Significant features earn a spot in CONTRIBUTORS.md and the [Changelog](CHANGELOG.md).
