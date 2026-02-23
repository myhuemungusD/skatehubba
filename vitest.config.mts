import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared/schema': path.resolve(__dirname, './packages/shared/schema'),
      '@shared': path.resolve(__dirname, './packages/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', 'mobile/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      include: ['server/**/*.ts', 'packages/shared/**/*.ts', 'client/src/lib/**/*.ts', 'functions/src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/dist/**',
        '**/*.d.ts',
        'mobile/**',
        // Pure interface/type-alias files compile to empty JS — no executable code for v8
        '**/types.ts',
        '**/socket-types.ts',
        // Infrastructure / entry-point / dev-tooling files — tested via integration / E2E
        'server/index.ts',
        'server/app.ts',
        'server/vite-dev.ts',
        'server/api-docs.ts',
        'server/config/server.ts',
        'server/config/env.ts',
        'functions/src/firebaseAdmin.ts',
        // Pure schema-definition files — pgTable/pgEnum/references callbacks produce zero branching logic
        'packages/shared/schema-analytics.ts',
        'packages/shared/schema/auth.ts',
        'packages/shared/schema/battles.ts',
        'packages/shared/schema/spots.ts',
        // React hook + dynamic Firebase imports — requires React runtime, store actions tested separately
        'client/src/lib/stores/user.ts',
        // Barrel re-export files — no logic, implicitly tested by underlying modules
        'client/src/lib/validation/betaSignup.ts',
        'server/services/gameStateService.ts',
        'packages/shared/index.ts',
        'client/src/lib/api/game/index.ts',
        'client/src/lib/api/trickmint/index.ts',
        'client/src/lib/firebase/index.ts',
        'client/src/lib/firestore/index.ts',
        'client/src/lib/game/index.ts',
        'client/src/lib/remoteSkate/index.ts',
        // Test setup/mock helpers — not production code
        'server/__tests__/services/game-critical-paths/mockSetup.ts',
        'server/__tests__/helpers/**',
      ],
      thresholds: {
        statements: 98,
        branches: 93,
        functions: 99,
        lines: 99,
      },
    },
    testTimeout: 10000,
  },
});
