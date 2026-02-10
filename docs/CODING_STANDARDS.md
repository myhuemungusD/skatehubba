# SkateHubba Coding Standards

This document defines the technical coding standards for the SkateHubba codebase. These standards ensure consistency, maintainability, security, and performance across the monorepo.

---

## Table of Contents

1. [TypeScript Standards](#typescript-standards)
2. [Code Style & Formatting](#code-style--formatting)
3. [Error Handling](#error-handling)
4. [Security Best Practices](#security-best-practices)
5. [Performance Guidelines](#performance-guidelines)
6. [Testing Requirements](#testing-requirements)
7. [Documentation Requirements](#documentation-requirements)
8. [API Design Patterns](#api-design-patterns)
9. [Database Operations](#database-operations)
10. [React Best Practices](#react-best-practices)

---

## TypeScript Standards

### Strict Typing

```typescript
// ❌ BAD: Using 'any' defeats type safety
function processData(data: any) {
  return data.map((item: any) => item.value);
}

// ✅ GOOD: Use proper types or generics
function processData<T extends { value: string }>(data: T[]) {
  return data.map((item) => item.value);
}

// ✅ GOOD: Use 'unknown' when type is truly unknown
function handleUnknownData(data: unknown) {
  if (typeof data === 'object' && data !== null) {
    // Type narrowing before use
  }
}
```

### Type Definitions

```typescript
// ✅ Place shared types in @skatehubba/shared package
// File: packages/shared/types.ts
export interface SpotCheckin {
  id: number;
  userId: string;
  spotId: number;
  timestamp: Date;
  verified: boolean;
}

// ✅ Use Zod schemas as source of truth
import { z } from 'zod';

export const SpotCheckinSchema = z.object({
  userId: z.string().min(1),
  spotId: z.number().int().positive(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type SpotCheckinInput = z.infer<typeof SpotCheckinSchema>;
```

### Avoid Type Assertions

```typescript
// ❌ BAD: Type assertions can hide bugs
const data = req.body as User;

// ✅ GOOD: Validate with Zod
const parsed = UserSchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ error: parsed.error });
}
const data = parsed.data; // Type-safe!
```

---

## Code Style & Formatting

### General Rules

- **Indentation**: 2 spaces (enforced by ESLint)
- **Line Length**: Max 100 characters (soft limit, exceptions allowed for readability)
- **Semicolons**: Required (enforced by ESLint)
- **Quotes**: Double quotes for strings (enforced by Prettier)
- **Trailing Commas**: Always use (enforced by Prettier)

### Naming Conventions

```typescript
// Variables and functions: camelCase
const userName = "skater42";
function getUserProfile() {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRIES = 3;
const API_BASE_URL = "https://api.skatehubba.com";

// Types and Interfaces: PascalCase
interface UserProfile {}
type GameStatus = "active" | "completed";

// Enums: PascalCase (both enum and values)
enum GameState {
  Pending = "pending",
  Active = "active",
  Completed = "completed",
}

// Private class members: prefix with underscore
class GameService {
  private _connectionPool: Pool;
}

// File names: kebab-case
// ✅ user-service.ts, spot-checkin.ts, battle-state-service.ts
// ❌ UserService.ts, spotCheckin.ts, battleStateService.ts
```

### Import Organization

```typescript
// 1. Node.js built-ins
import crypto from "node:crypto";
import path from "node:path";

// 2. External dependencies
import { Router } from "express";
import { z } from "zod";

// 3. Internal packages
import { spotSchema } from "@shared/schema";
import { validateBody } from "@shared/validation";

// 4. Local imports (relative)
import { getDb } from "../db";
import { logger } from "../logger";
import type { AuthRequest } from "../types";
```

---

## Error Handling

### Custom Error Classes

```typescript
// ✅ Create domain-specific error classes
export class FilmerRequestError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "FilmerRequestError";
  }
}

// Usage
throw new FilmerRequestError("QUOTA_EXCEEDED", "Daily request limit reached", 429);
```

### Error Responses

```typescript
// ✅ Use consistent error response structure
import { Errors } from "../utils/apiError";

// Standardized error responses
router.post("/api/endpoint", async (req, res) => {
  if (!validated) {
    return Errors.badRequest(res, "INVALID_INPUT", "Validation failed", { field: "email" });
  }

  if (!authorized) {
    return Errors.forbidden(res, "ACCESS_DENIED", "Insufficient permissions");
  }

  if (!found) {
    return Errors.notFound(res, "RESOURCE_NOT_FOUND", "Spot not found");
  }

  // Database errors
  if (!isDatabaseAvailable()) {
    return Errors.dbUnavailable(res);
  }
});
```

### Try-Catch Best Practices

```typescript
// ✅ Catch specific error types
try {
  await createFilmerRequest(data);
} catch (error) {
  if (error instanceof FilmerRequestError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  logger.error("Unexpected error", { error });
  return Errors.internal(res, "UNKNOWN_ERROR", "An unexpected error occurred");
}

// ❌ BAD: Silent failures
try {
  await dangerousOperation();
} catch (error) {
  // Empty catch - error is lost!
}

// ❌ BAD: Overly broad catch
try {
  await operation();
} catch (error) {
  return res.status(500).json({ error: "Something went wrong" });
  // No logging, no details, hard to debug!
}
```

---

## Security Best Practices

### Authentication & Authorization

```typescript
// ✅ Always verify Firebase tokens server-side
import { requireFirebaseUid } from "../middleware/firebaseUid";

router.post("/api/sensitive", requireFirebaseUid, async (req, res) => {
  const { firebaseUid } = req as FirebaseAuthedRequest;
  // firebaseUid is guaranteed to be from verified token
});

// ❌ NEVER trust client-provided user IDs
router.post("/api/bad-endpoint", async (req, res) => {
  const userId = req.body.userId; // Client can spoof this!
});
```

### Input Validation

```typescript
// ✅ Validate ALL user input with Zod
const createSpotSchema = z.object({
  name: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().max(1000).optional(),
});

router.post("/api/spots", validateBody(createSpotSchema), async (req, res) => {
  // req.body is now validated and type-safe
});
```

### SQL Injection Prevention

```typescript
// ✅ Use Drizzle ORM parameterized queries
const spots = await db
  .select()
  .from(spots)
  .where(eq(spots.userId, userId)); // Parameterized automatically

// ❌ NEVER concatenate SQL strings
const query = `SELECT * FROM spots WHERE user_id = '${userId}'`; // SQL injection!
```

### XSS Prevention

```typescript
// ✅ React automatically escapes JSX content
<div>{userInput}</div> // Safe!

// ❌ Dangerous: Using dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: userInput }} /> // XSS risk!

// ✅ If HTML is needed, sanitize first
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

### Sensitive Data

```typescript
// ✅ Never log sensitive data
logger.info("User login", { userId: user.id }); // OK
logger.info("User login", { password: user.password }); // ❌ NEVER!

// ✅ Store secrets in environment variables
const apiKey = env.STRIPE_SECRET_KEY; // From .env

// ❌ NEVER commit secrets to git
const apiKey = "sk_live_abc123..."; // ❌ Exposed in git history!
```

---

## Performance Guidelines

### Database Queries

```typescript
// ✅ Use SELECT only needed columns
const users = await db
  .select({ id: users.id, username: users.username })
  .from(users)
  .where(eq(users.isActive, true));

// ❌ Avoid SELECT *
const users = await db.select().from(users); // Fetches unnecessary columns

// ✅ Use LIMIT for pagination
const spots = await db
  .select()
  .from(spots)
  .limit(20)
  .offset(page * 20);

// ✅ Use indexes for frequently queried columns
// Defined in schema with .index()
```

### N+1 Query Prevention

```typescript
// ❌ BAD: N+1 queries
const games = await db.select().from(games).limit(10);
for (const game of games) {
  const user = await db.select().from(users).where(eq(users.id, game.userId));
  // This makes N+1 database queries!
}

// ✅ GOOD: Use JOIN or fetch in bulk
const gamesWithUsers = await db
  .select()
  .from(games)
  .leftJoin(users, eq(games.userId, users.id))
  .limit(10);
```

### Caching

```typescript
// ✅ Cache expensive computations
const getCachedUserStats = memoize(async (userId: string) => {
  return await db.query.getUserStatistics(userId);
});

// ✅ Use Redis for distributed caching (when needed)
const cachedValue = await redis.get(`user:${userId}:stats`);
if (cachedValue) {
  return JSON.parse(cachedValue);
}
```

---

## Testing Requirements

### Unit Test Coverage

- **Target**: 60% coverage by Q2 2026 (current: 43-55%)
- **Critical paths**: Must have 100% test coverage
- **Test files**: Use `.test.ts` or `.test.tsx` suffix

```typescript
// user-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createUser } from './user-service';

describe('createUser', () => {
  it('should create user with valid data', async () => {
    const user = await createUser({ username: 'skater42', email: 'test@example.com' });
    expect(user.username).toBe('skater42');
  });

  it('should throw error for duplicate username', async () => {
    await createUser({ username: 'skater42', email: 'test1@example.com' });
    await expect(
      createUser({ username: 'skater42', email: 'test2@example.com' })
    ).rejects.toThrow('Username already taken');
  });
});
```

### Integration Tests

```typescript
// Suffix: .integration.test.ts
describe('Spot Check-in Flow (Integration)', () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it('should complete full check-in workflow', async () => {
    const spot = await createSpot(testSpotData);
    const checkin = await createCheckin({ userId: 'user_123', spotId: spot.id });
    expect(checkin.verified).toBe(false);

    const verified = await verifyCheckin(checkin.id, { latitude: spot.lat, longitude: spot.lng });
    expect(verified.verified).toBe(true);
  });
});
```

### Test Data Factories

```typescript
// ✅ Use factories for consistent test data
export const SpotFactory = {
  build: (overrides = {}) => ({
    id: faker.number.int(),
    name: faker.location.street(),
    latitude: faker.location.latitude(),
    longitude: faker.location.longitude(),
    ...overrides,
  }),
};

// Usage
const spot = SpotFactory.build({ name: "Downtown Plaza" });
```

---

## Documentation Requirements

### JSDoc for Public APIs

```typescript
/**
 * Create a filmer request for a check-in
 *
 * Validates requester eligibility, enforces daily quota limits, and creates a pending
 * filmer request. If a pending request already exists for the same check-in and filmer,
 * returns the existing request (idempotent).
 *
 * @param input - Request parameters
 * @param input.requesterId - User ID requesting the filmer
 * @param input.checkInId - Check-in ID to film
 * @param input.filmerUid - Filmer user ID
 * @returns Request ID, status, and whether request already existed
 * @throws {FilmerRequestError} If validation fails or quota exceeded
 *
 * @example
 * ```typescript
 * const result = await createFilmerRequest({
 *   requesterId: 'user_123',
 *   checkInId: 456,
 *   filmerUid: 'filmer_789',
 *   ipAddress: '192.168.1.1'
 * });
 * ```
 */
export const createFilmerRequest = async (input: CreateFilmerRequestInput) => {
  // Implementation
};
```

### README Files

- Every package must have a README.md
- API changes must update `/docs/API.md`
- Architecture changes must update `/docs/architecture/`

---

## API Design Patterns

### RESTful Endpoints

```typescript
// ✅ Follow REST conventions
GET    /api/spots          // List spots
GET    /api/spots/:id      // Get single spot
POST   /api/spots          // Create spot
PUT    /api/spots/:id      // Update spot (full replacement)
PATCH  /api/spots/:id      // Update spot (partial)
DELETE /api/spots/:id      // Delete spot

// ✅ Use sub-resources for relationships
GET    /api/spots/:id/checkins      // List check-ins for a spot
POST   /api/spots/:id/checkins      // Create check-in at spot
```

### Response Structure

```typescript
// ✅ Success response
{
  "spot": {
    "id": 123,
    "name": "Downtown Plaza",
    "latitude": 37.7749,
    "longitude": -122.4194
  }
}

// ✅ Error response
{
  "code": "SPOT_NOT_FOUND",
  "message": "Spot with ID 123 not found",
  "details": {
    "spotId": 123
  }
}

// ✅ Pagination
{
  "spots": [...],
  "total": 250,
  "page": 1,
  "limit": 20,
  "hasMore": true
}
```

---

## Database Operations

### Transactions

```typescript
// ✅ Use transactions for multi-step operations
await db.transaction(async (tx) => {
  const user = await tx.insert(users).values(userData).returning();
  await tx.insert(profiles).values({ userId: user.id, ...profileData });
  // Both succeed or both fail
});
```

### Race Condition Prevention

```typescript
// ✅ Use SELECT FOR UPDATE for quota checks
const [counter] = await tx
  .select()
  .from(quotaCounters)
  .where(eq(quotaCounters.userId, userId))
  .for("update"); // Row-level lock

if (counter.count >= limit) {
  throw new QuotaExceededError();
}

await tx
  .update(quotaCounters)
  .set({ count: counter.count + 1 })
  .where(eq(quotaCounters.userId, userId));
```

---

## React Best Practices

### Functional Components

```typescript
// ✅ Use functional components with hooks
export const SpotMap: React.FC<{ spots: Spot[] }> = ({ spots }) => {
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);

  useEffect(() => {
    // Side effects here
  }, [spots]);

  return <div>{/* JSX */}</div>;
};
```

### Custom Hooks

```typescript
// ✅ Extract reusable logic into custom hooks
export const useGeolocation = () => {
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation(position.coords),
      (err) => setError(err.message)
    );
  }, []);

  return { location, error };
};
```

### Avoid Prop Drilling

```typescript
// ✅ Use Context for deeply nested state
const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
```

---

## Enforcement

These standards are enforced through:

1. **ESLint**: Configured in `.eslintrc.js`
2. **Prettier**: Configured in `.prettierrc`
3. **TypeScript**: Strict mode enabled in `tsconfig.json`
4. **Vitest**: Coverage thresholds in `vitest.config.mts`
5. **Code Review**: All PRs must be reviewed before merge

Run checks before committing:

```bash
pnpm lint        # ESLint checks
pnpm typecheck   # TypeScript checks
pnpm test        # Run tests
pnpm build       # Verify build succeeds
```

---

## Questions?

If you have questions about these standards or need clarification, please:

1. Check existing code for examples
2. Ask in team discussions
3. Propose changes via PR to this document

**Remember**: These standards exist to make our codebase maintainable, secure, and performant. When in doubt, follow the patterns you see in existing, well-reviewed code.
