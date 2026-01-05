🛹 Contributing to SkateHubba™
First off, thank you for stepping up to contribute to the future of skateboarding technology. We hold our codebase to the same standards as a professional contest run: technical, clean, and high-impact.

🏗 Monorepo Architecture
SkateHubba™ operates as a TypeScript pnpm workspace. This ensures that our "Shared DNA" (types and logic) remains synchronized across all platforms.

Project Map
/client: Next.js / Vite frontend—The core user experience.

/server: Express / Firebase API—The business logic engine.

/shared: The Source of Truth. Zod schemas and TypeScript interfaces used by both Client and Server.

/infra: Firebase Cloud Functions and deployment infrastructure.

/mobile: Future React Native / Expo integration.

🚀 Getting Started: The Professional Workflow
1. Prerequisites
Node.js: Version 20.x or higher (LTS).

pnpm: Version 10.x (Required for workspace integrity).

Git: Configured with SSH preferred for secure pushes.

2. The Fork & Upstream Setup
To contribute, you must follow the Upstream Synchronization model. This prevents "ghost" commits and ensures your local environment stays fresh.

Bash

# 1. Fork the repo at https://github.com/myhuemungusD/skatehubba1
# 2. Clone your personal fork
git clone https://github.com/YOUR_USERNAME/skatehubba1.git
cd skatehubba1

# 3. Add the Brand Source as 'upstream'
git remote add upstream https://github.com/myhuemungusD/skatehubba1.git

# 4. Verify remotes (should show origin and upstream)
git remote -v
3. Dependency Management
Never use npm install. We use pnpm to manage the symlinks between our internal packages.

Bash

pnpm install
🔄 Development Workflow
Syncing with the Brand
Before starting any new feature, sync your local environment with the latest "Gold Standard" code.

Bash

git fetch upstream
git checkout dev
git merge upstream/dev
Branch Naming Conventions
feat/description - New functionality.

fix/description - Bug resolutions.

refactor/description - Structural improvements with no logic change.

chore/description - Dependency updates or maintenance.

📏 Engineering Standards
🧬 Shared DNA (The @skatehubba/shared Rule)
If you are adding data structures, they must start in /shared.

Define the Zod schema in shared/schema.ts.

Export the types derived from that schema.

Run pnpm install at the root to refresh the workspace links.

💻 Code Quality
Strict Typing: No any. Use unknown or generics if the type is dynamic.

Functional Components: React components must use functional patterns and hooks.

Tailwind CSS: Follow the design tokens in tailwind.config.ts. Do not use hardcoded hex codes.

📝 Commit Guidelines
We follow the Conventional Commits specification. This allows for automated changelog generation and clean history.

Format: type(scope): subject Example: feat(client): add real-time spot check-in validation

🔀 Pull Request Process
Rebase: Before submitting, rebase your feature branch against upstream/dev to ensure a clean merge.

Verify: Run pnpm build at the root. If the build fails, the PR will be rejected automatically by CI.

Documentation: Update any relevant .md files in /specs if you've changed API endpoints or data flows.

📚 Recognition & Governance
Every meaningful contribution is tracked. Significant features earn a spot in the CONTRIBUTORS.md and the CHANGELOG.md.

This monorepo workflow was verified and hardened by the internal dev agent for Design Mainline LLC. All workflows are workspace-aligned, Vercel-ready, and Firebase-scalable.
