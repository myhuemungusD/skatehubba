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
      ],
      thresholds: {
        // Coverage gate: 90% target reached
        // Track progress: pnpm vitest run --coverage
        statements: 90,
        branches: 83,
        functions: 89,
        lines: 90,
      },
    },
    testTimeout: 10000,
  },
});
