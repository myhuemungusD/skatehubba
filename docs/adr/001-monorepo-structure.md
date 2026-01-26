# 1. Monorepo Structure

## Status

Accepted

## Context

We needed to share code between client, server, and mobile apps while maintaining clear boundaries. Options considered:

- Separate repositories with npm packages
- Monorepo with npm/yarn workspaces
- Monorepo with pnpm workspaces + Turbo

## Decision

Use pnpm workspaces with Turbo for build orchestration.

## Consequences

- **Positive:** Single repo, atomic commits across packages, shared tooling, fast builds with Turbo caching
- **Negative:** Requires pnpm (team must not use npm/yarn), slightly more complex CI setup
- **Enables:** Easy code sharing via /shared, consistent versioning, simplified local development
