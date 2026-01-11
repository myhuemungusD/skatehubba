import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🔧 Building server with esbuild...');

// Ensure the output directory exists
const outputDir = path.join(rootDir, 'dist/server');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Copy the client build to server's public directory
const clientDir = path.join(rootDir, 'dist/public');
const serverPublicDir = path.join(outputDir, 'public');

if (fs.existsSync(clientDir)) {
  console.log('📂 Copying client assets to server public directory...');
  
  // Remove existing public directory
  if (fs.existsSync(serverPublicDir)) {
    fs.rmSync(serverPublicDir, { recursive: true });
  }
  
  // Copy client build to server public
  fs.cpSync(clientDir, serverPublicDir, { recursive: true });
  console.log('✅ Client assets copied successfully');
}

// ESBuild configuration for server bundling
const config = {
  entryPoints: [path.join(rootDir, 'server/index.ts')],
  bundle: true,
  platform: 'node',
  outfile: path.join(rootDir, 'dist/server/index.js'),
  format: 'esm',
  packages: 'external',
  external: [
    '@neondatabase/serverless',
    'pg',
    'ws'
  ],
  target: 'node18',
  minify: false,
  sourcemap: true,
};

try {
  await build(config);
  console.log('✅ Server built successfully to dist/server/index.js');
} catch (error) {
  console.error('❌ Server build failed:', error);
  process.exit(1);
}