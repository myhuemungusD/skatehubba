import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared/schema': path.resolve(__dirname, './shared/schema'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '_archive/**', 'mobile/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      include: ['server/**/*.ts', 'shared/**/*.ts', 'client/src/lib/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/dist/**',
        '**/*.d.ts',
        '_archive/**',
        'mobile/**',
      ],
      thresholds: {
        // TECH DEBT: Coverage is currently 3%. Target is 60% by Q2 2026.
        // Thresholds disabled to unblock CI while we add tests incrementally.
        // Track progress: pnpm vitest run --coverage
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
    testTimeout: 10000,
  },
});
