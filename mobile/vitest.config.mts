import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, './src') + '/',
      '@skatehubba/types': path.resolve(__dirname, '../packages/types/index'),
      '@skatehubba/config': path.resolve(__dirname, '../packages/config/src/index'),
      'shared/': path.resolve(__dirname, '../packages/shared') + '/',
      // Stub native packages so Rollup never tries to parse Flow/native code
      'react-native': path.resolve(__dirname, './src/__mocks__/react-native.ts'),
      '@expo/vector-icons': path.resolve(__dirname, './src/__mocks__/expo-vector-icons.ts'),
      'react-native-safe-area-context': path.resolve(__dirname, './src/__mocks__/react-native-safe-area-context.ts'),
      'react-native-flash-message': path.resolve(__dirname, './src/__mocks__/react-native-flash-message.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts'],
      thresholds: {
        statements: 60,
        branches: 50,
      },
    },
  },
});
