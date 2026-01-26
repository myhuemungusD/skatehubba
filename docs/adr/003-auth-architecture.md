# 3. Auth Architecture

## Status

Accepted

## Context

Need authentication supporting email/password, OAuth (Google, Apple), and anonymous users with potential upgrade path.

## Decision

Use Firebase Authentication for identity, with server-side session management in PostgreSQL for additional security controls (lockout, MFA state, audit logging).

## Consequences

- **Positive:** Firebase handles OAuth complexity, anonymous-to-permanent upgrade path, battle-tested security
- **Negative:** Dependency on Firebase, token validation on every request
- **Enables:** Multi-provider auth without building OAuth flows, rate limiting and lockout at server level
