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
      ],
      thresholds: {
        // Coverage gate enabled at 30%. Target is 60% by Q2 2026.
        // Track progress: pnpm vitest run --coverage
        statements: 30,
        branches: 20,
        functions: 30,
        lines: 30,
      },
    },
    testTimeout: 10000,
  },
});
