import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['server/**/*.ts', 'shared/**/*.ts', 'client/src/lib/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/dist/**',
        '**/*.d.ts',
      ],
      thresholds: {
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },
    testTimeout: 10000,
  },
});
