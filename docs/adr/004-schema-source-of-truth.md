# 4. Schema Source of Truth

## Status

Accepted

## Context

Data shapes are used across client, server, and validation logic. Keeping them in sync was error-prone.

## Decision

Define all data structures as Zod schemas in `/shared/schema.ts`. Derive TypeScript types from these schemas. All validation uses these schemas.

## Consequences

- **Positive:** Single source of truth, runtime validation matches TypeScript types, easy to add new fields
- **Negative:** All packages depend on shared, Zod is a runtime dependency
- **Enables:** Type-safe API contracts, automatic form validation, consistent error messages
