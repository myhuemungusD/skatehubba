import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, './src') + '/',
      '@skatehubba/types': path.resolve(__dirname, '../packages/types/index'),
      '@skatehubba/config': path.resolve(__dirname, '../packages/config/src/index'),
      'shared/': path.resolve(__dirname, '../packages/shared') + '/',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 10000,
  },
});
