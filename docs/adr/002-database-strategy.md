# 2. Database Strategy

## Status

Accepted

## Context

The app needs both structured relational data (users, spots, games history) and real-time collaborative features (active challenges, chat, presence).

## Decision

Use PostgreSQL (via Drizzle ORM) as the system of record for structured data, and Firestore for real-time features.

## Consequences

- **Positive:** Best tool for each job - PostgreSQL for complex queries/transactions, Firestore for real-time sync
- **Negative:** Two databases to maintain, potential data sync complexity
- **Enables:** Real-time game state without polling, offline-first mobile capability, strong data integrity for critical records
