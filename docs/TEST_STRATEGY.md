# SkateHubba Test Strategy

This document outlines the comprehensive testing strategy for the SkateHubba platform, including unit tests, integration tests, end-to-end tests, and quality gates.

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Types & Scope](#test-types--scope)
3. [Testing Framework & Tools](#testing-framework--tools)
4. [Coverage Goals](#coverage-goals)
5. [Critical Path Testing](#critical-path-testing)
6. [Test Organization](#test-organization)
7. [Writing Good Tests](#writing-good-tests)
8. [Mocking Strategies](#mocking-strategies)
9. [Race Condition Testing](#race-condition-testing)
10. [CI/CD Integration](#cicd-integration)
11. [Performance Testing](#performance-testing)
12. [Mobile Testing](#mobile-testing)

---

## Testing Philosophy

### Core Principles

1. **Test Behavior, Not Implementation**: Focus on what the code does, not how it does it
2. **Critical Paths First**: Prioritize tests for authentication, payments, and core game logic
3. **Fast Feedback**: Tests should run quickly to encourage frequent execution
4. **Deterministic**: Tests must produce consistent results (no flaky tests)
5. **Maintainable**: Tests should be easy to understand and update

### Testing Pyramid

```
           /\
          /E2E\         ← Few, slow, expensive (10%)
         /------\
        /Integr-\       ← Moderate coverage (30%)
       /----------\
      /   Unit     \    ← Most tests here (60%)
     /--------------\
```

**Distribution Goals**:

- **60% Unit Tests**: Fast, isolated, test single functions/components
- **30% Integration Tests**: Test interactions between modules
- **10% E2E Tests**: Test complete user workflows

---

## Test Types & Scope

### 1. Unit Tests

Test individual functions, classes, or React components in isolation.

**File Naming**: `*.test.ts` or `*.test.tsx`

**Location**: Co-located with source files or in `__tests__/` directory

**Examples**:

- `userService.test.ts` - Tests `userService.ts` functions
- `GameService.test.ts` - Tests game state machine logic
- `useGeolocation.test.ts` - Tests custom hooks

**What to Test**:

```typescript
describe("calculateGameScore", () => {
  it("should return 0 for new game", () => {
    expect(calculateGameScore([])).toBe(0);
  });

  it("should count correctly landed tricks", () => {
    const turns = [
      { result: "land", points: 10 },
      { result: "land", points: 15 },
    ];
    expect(calculateGameScore(turns)).toBe(25);
  });

  it("should handle bail with no points", () => {
    const turns = [{ result: "bail", points: 0 }];
    expect(calculateGameScore(turns)).toBe(0);
  });
});
```

### 2. Integration Tests

Test interactions between multiple modules, typically involving database or external services.

**File Naming**: `*.integration.test.ts`

**Examples**:

- `auth-routes-integration.test.ts` - Test authentication endpoints with real database
- `spot-checkin-integration.test.ts` - Test check-in workflow with geolocation validation
- `battleStateService.test.ts` - Test battle voting with PostgreSQL locking

**What to Test**:

```typescript
describe("Spot Check-in Integration", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestSpots();
  });

  it("should verify check-in within 100m of spot", async () => {
    const spot = await getSpot(1);
    const checkin = await createCheckin({
      userId: "user_123",
      spotId: spot.id,
      latitude: spot.latitude + 0.0005, // ~50m away
      longitude: spot.longitude,
    });

    expect(checkin.verified).toBe(true);
  });

  it("should reject check-in beyond 100m", async () => {
    const spot = await getSpot(1);
    await expect(
      createCheckin({
        userId: "user_123",
        spotId: spot.id,
        latitude: spot.latitude + 0.01, // ~1km away
        longitude: spot.longitude,
      })
    ).rejects.toThrow("TOO_FAR_FROM_SPOT");
  });
});
```

### 3. End-to-End (E2E) Tests

Test complete user workflows from browser to database.

**Framework**: Cypress (web), Detox (mobile - not yet integrated)

**Location**: `/client/cypress/` (web), `/mobile/e2e/` (mobile)

**Examples**:

- User registration → profile creation → spot check-in
- S.K.A.T.E. game creation → trick upload → opponent response → voting

**What to Test**:

```typescript
// cypress/e2e/game-flow.cy.ts
describe("S.K.A.T.E. Game Flow", () => {
  it("should complete full game workflow", () => {
    cy.login("player1@test.com");
    cy.visit("/games/create");
    cy.get('[data-testid="opponent-select"]').select("player2");
    cy.get('[data-testid="create-game"]').click();

    cy.uploadTrickVideo("kickflip.mp4");
    cy.get('[data-testid="submit-trick"]').click();

    cy.logout();
    cy.login("player2@test.com");
    cy.visit("/games");
    cy.get('[data-testid="pending-game"]').first().click();
    cy.get('[data-testid="vote-land"]').click();
  });
});
```

---

## Testing Framework & Tools

### Primary Framework: Vitest

**Why Vitest?**

- Fast (native ESM support)
- Compatible with Vite ecosystem
- Built-in TypeScript support
- Jest-compatible API

**Configuration**: `vitest.config.mts`

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", "dist", "e2e", "mobile"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "**/*.test.ts", "**/*.config.ts"],
    },
  },
});
```

### Additional Tools

| Tool                       | Purpose                 | Usage                                              |
| -------------------------- | ----------------------- | -------------------------------------------------- |
| **Cypress**                | Web E2E tests           | `pnpm --filter skatehubba-client exec cypress run` |
| **Detox**                  | Mobile E2E tests        | Not yet integrated                                 |
| **@testing-library/react** | React component testing | Included in Vitest setup                           |
| **Supertest**              | HTTP endpoint testing   | API integration tests                              |

---

## Coverage Goals

### Current Status (as of Q1 2026)

| Metric     | Current | Target (Q2 2026) |
| ---------- | ------- | ---------------- |
| Statements | 50%     | 60%              |
| Branches   | 43%     | 60%              |
| Functions  | 55%     | 60%              |
| Lines      | 50%     | 60%              |

### Critical Paths: 100% Coverage Required

The following modules must maintain 100% test coverage:

1. **Authentication** (`/server/auth/`)
   - `auth-service.ts`
   - `auth-routes-integration.test.ts`
   - `auth-critical-paths.test.ts`

2. **Game Logic** (`/server/services/game*`)
   - `gameStateService.ts`
   - `battleStateService.ts`
   - `game-critical-paths.test.ts`

3. **Payment Processing** (`/server/services/payment*`)
   - All payment-related code (when implemented)

4. **Security Middleware**
   - `firebaseUid.ts`
   - `trustSafety.ts`
   - `replay-protection.test.ts`

### Running Coverage Reports

```bash
# Generate coverage report
pnpm vitest run --coverage

# View HTML report
open coverage/index.html

# Check coverage thresholds
pnpm test:coverage
```

---

## Critical Path Testing

### What Are Critical Paths?

Critical paths are user workflows that are:

1. Essential to core functionality
2. Involve financial transactions or sensitive data
3. Have high usage frequency
4. Could cause major issues if broken

### Examples

**1. Authentication Critical Path**

```typescript
// auth-critical-paths.test.ts
describe("Authentication Critical Paths", () => {
  it("should complete full registration flow", async () => {
    // Email signup
    const { uid } = await createFirebaseUser("test@example.com", "password123");

    // Profile creation
    const profile = await createProfile({
      uid,
      username: "skater42",
      stance: "regular",
    });

    // Login
    const token = await signInWithEmailAndPassword("test@example.com", "password123");
    expect(token).toBeDefined();

    // Verify token
    const decoded = await admin.auth().verifyIdToken(token);
    expect(decoded.uid).toBe(uid);
  });

  it("should handle password reset flow", async () => {
    await createFirebaseUser("test@example.com", "oldpassword");
    await sendPasswordResetEmail("test@example.com");
    // Verify email sent (mock check)
  });
});
```

**2. Game Critical Path**

```typescript
// game-critical-paths.test.ts
describe("S.K.A.T.E. Game Critical Paths", () => {
  it("should complete full game from creation to completion", async () => {
    // Create game
    const game = await createGame({ player1: "user_1", player2: "user_2" });
    expect(game.status).toBe("active");

    // Player 1 sets trick
    await submitTrick(game.id, "user_1", { videoUrl: "...", trickName: "kickflip" });

    // Player 2 responds
    await submitResponse(game.id, "user_2", { videoUrl: "...", result: "land" });

    // Player 2 votes on Player 1's trick
    await castVote(game.id, "user_2", { targetPlayerId: "user_1", vote: "land" });

    // Check game state
    const updated = await getGame(game.id);
    expect(updated.currentTurn).toBe("user_2"); // Roles swapped
  });
});
```

---

## Test Organization

### Directory Structure

```
/server
  /services
    userService.ts
    userService.test.ts           ← Unit test
  /routes
    /__tests__
      auth.test.ts                ← Integration test
      games.integration.test.ts   ← Integration test
  /auth
    auth-critical-paths.test.ts   ← Critical path test

/client
  /src
    /components
      /SpotMap
        SpotMap.tsx
        SpotMap.test.tsx          ← Component test
    /hooks
      useGeolocation.ts
      useGeolocation.test.ts      ← Hook test
    /__tests__
      /map
        fixtures.ts               ← Test fixtures
        ApiMocker.ts              ← Test utilities
```

### Naming Conventions

| Test Type     | Suffix                    | Example                           |
| ------------- | ------------------------- | --------------------------------- |
| Unit          | `.test.ts`                | `userService.test.ts`             |
| Integration   | `.integration.test.ts`    | `auth-routes-integration.test.ts` |
| E2E (Cypress) | `.cy.ts`                  | `game-flow.cy.ts`                 |
| Critical Path | `-critical-paths.test.ts` | `auth-critical-paths.test.ts`     |

---

## Writing Good Tests

### Test Structure: AAA Pattern

```typescript
describe("createUser", () => {
  it("should create user with valid data", async () => {
    // Arrange: Set up test data and dependencies
    const userData = {
      username: "skater42",
      email: "test@example.com",
    };

    // Act: Execute the function being tested
    const user = await createUser(userData);

    // Assert: Verify the outcome
    expect(user.username).toBe("skater42");
    expect(user.email).toBe("test@example.com");
    expect(user.id).toBeDefined();
  });
});
```

### Test Descriptions

```typescript
// ✅ GOOD: Descriptive, behavior-focused
it("should reject duplicate username during registration", () => {});
it("should return 404 when spot does not exist", () => {});
it("should calculate correct distance between coordinates", () => {});

// ❌ BAD: Implementation-focused, vague
it("should work", () => {});
it("tests the function", () => {});
it("checks database", () => {});
```

### Test Data Factories

```typescript
// test-factories.ts
export const UserFactory = {
  build: (overrides = {}) => ({
    id: faker.string.uuid(),
    username: faker.internet.userName(),
    email: faker.internet.email(),
    createdAt: new Date(),
    ...overrides,
  }),
};

// Usage in tests
const user = UserFactory.build({ username: "skater42" });
```

### Avoid Test Interdependence

```typescript
// ❌ BAD: Tests depend on each other
let createdUserId: string;

it("should create user", () => {
  const user = await createUser(data);
  createdUserId = user.id; // Global state!
});

it("should update user", () => {
  await updateUser(createdUserId, { bio: "New bio" }); // Depends on previous test!
});

// ✅ GOOD: Independent tests
describe("User CRUD", () => {
  let testUser: User;

  beforeEach(async () => {
    testUser = await createUser(testData); // Fresh user for each test
  });

  it("should create user", () => {
    expect(testUser.id).toBeDefined();
  });

  it("should update user", () => {
    await updateUser(testUser.id, { bio: "New bio" });
    const updated = await getUser(testUser.id);
    expect(updated.bio).toBe("New bio");
  });
});
```

---

## Mocking Strategies

### When to Mock

- External APIs (Firebase, Stripe, email services)
- Slow operations (file system, network calls)
- Non-deterministic behavior (date/time, random values)

### When NOT to Mock

- Database operations in integration tests (use test database)
- Pure functions (no side effects)
- Simple utility functions

### Firebase Mocking

```typescript
// Mock Firebase Admin SDK
vi.mock("firebase-admin", () => ({
  auth: () => ({
    verifyIdToken: vi.fn().mockResolvedValue({ uid: "test_uid" }),
    createUser: vi.fn(),
  }),
  storage: () => ({
    bucket: vi.fn(),
  }),
}));
```

### API Mocking

```typescript
// components/__tests__/map/ApiMocker.ts
export class ApiMocker {
  mockGetSpots(spots: Spot[]) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ spots }),
    });
  }

  mockGetSpotsError(error: string) {
    global.fetch = vi.fn().mockRejectedValue(new Error(error));
  }
}
```

---

## Race Condition Testing

### Concurrent Request Testing

```typescript
// replay-protection.test.ts
describe('Idempotency and Race Conditions', () => {
  it('should handle concurrent identical requests', async () => {
    const requestId = 'req_12345';
    const duplicateRequest = { requestId, userId: 'user_123', data: {...} };

    // Simulate 5 concurrent identical requests
    const results = await Promise.all([
      processRequest(duplicateRequest),
      processRequest(duplicateRequest),
      processRequest(duplicateRequest),
      processRequest(duplicateRequest),
      processRequest(duplicateRequest),
    ]);

    // Only one should succeed, rest should be idempotent
    const successes = results.filter(r => r.created);
    expect(successes).toHaveLength(1);
  });
});
```

### Database Locking Tests

```typescript
// battleStateService.test.ts
describe("Vote Counting with Row Locking", () => {
  it("should prevent race conditions in concurrent voting", async () => {
    const battleId = "battle_123";

    // Simulate 10 concurrent votes
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => castVote(battleId, `user_${i}`, { vote: "land" }))
    );

    const battle = await getBattle(battleId);
    expect(battle.voteCount).toBe(10); // Exact count, no lost updates
  });
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Run tests with coverage
        run: pnpm test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
```

### Quality Gates

Tests must pass before:

- ✅ Merging pull requests
- ✅ Deploying to staging
- ✅ Deploying to production

---

## Performance Testing

### Load Testing

```typescript
// Use Artillery or k6 for load testing
// artillery-config.yml
config:
  target: 'https://api.skatehubba.com'
  phases:
    - duration: 60
      arrivalRate: 10 # 10 requests per second
scenarios:
  - flow:
      - post:
          url: '/api/spots'
          json:
            name: 'Test Spot'
            latitude: 37.7749
            longitude: -122.4194
```

### Database Query Performance

```typescript
describe("Spot Query Performance", () => {
  it("should return spots within 100ms", async () => {
    const start = Date.now();
    const spots = await getSpots({ limit: 100 });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
    expect(spots).toHaveLength(100);
  });
});
```

---

## Mobile Testing

### Current Status

- **Detox**: Configured and integrated into CI (`.github/workflows/mobile-e2e.yml`)
- **Smoke Test**: Basic test exists in `/mobile/e2e/`
- **Android E2E**: Runs automatically on PRs and pushes to main (ubuntu runner)
- **iOS E2E**: Gated behind `e2e` label or manual dispatch (macOS runner cost optimization)

### Future Mobile Testing Strategy

1. **Unit Tests**: Jest for React Native components
2. **Integration Tests**: Test API interactions
3. **E2E Tests**: Detox for full user workflows
4. **Platform Testing**: Test on both iOS and Android simulators/devices

---

## Running Tests

### Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm test userService.test.ts

# Run integration tests only
pnpm test --grep "integration"

# Generate coverage report
pnpm test:coverage

# Run E2E tests (Cypress)
pnpm --filter skatehubba-client exec cypress run

# Run mobile E2E tests (when integrated)
pnpm --filter @skatehubba/mobile test:e2e
```

### Pre-commit Checklist

Before committing:

- [ ] All tests pass: `pnpm test`
- [ ] Coverage meets threshold
- [ ] No TypeScript errors: `pnpm typecheck`
- [ ] Linting passes: `pnpm lint`

---

## Best Practices Summary

1. ✅ **Write tests first** for critical paths (TDD)
2. ✅ **Keep tests fast** - aim for <1ms per unit test
3. ✅ **Use descriptive test names** that explain expected behavior
4. ✅ **Test edge cases** - null, undefined, empty arrays, boundary values
5. ✅ **Avoid implementation details** - test behavior, not internals
6. ✅ **Use factories** for consistent test data
7. ✅ **Clean up after tests** - reset database, clear mocks
8. ✅ **Run tests frequently** - on every save in watch mode
9. ✅ **Fix flaky tests immediately** - don't tolerate non-deterministic tests
10. ✅ **Review test coverage** - use coverage reports to find gaps

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Best Practices](https://testing-library.com/docs/guiding-principles)
- [Kent C. Dodds - Write Tests](https://kentcdodds.com/blog/write-tests)
- Internal: `/docs/RACE_CONDITIONS.md` - Race condition prevention guide

---

**Remember**: Tests are not just for catching bugs - they're documentation, design feedback, and confidence for refactoring. Invest in good tests, and they'll pay dividends.
