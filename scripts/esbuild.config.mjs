import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// ESBuild configuration for server bundling
const config = {
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/server.js',
  format: 'cjs',
  packages: 'external', // This automatically excludes all Node.js built-ins
  alias: {
    '@shared': path.resolve(rootDir, 'packages/shared'),
  },
  external: [
    // Keep external packages that we still want to exclude specifically
    '@neondatabase/serverless',
    'pg',
    'ws'
  ],
  target: 'node22',
  minify: false,
  sourcemap: true,
};

build(config).catch(() => process.exit(1));