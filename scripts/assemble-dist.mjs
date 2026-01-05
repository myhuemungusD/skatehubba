#!/usr/bin/env node

/**
 * Cross-platform artifact assembler script
 * Copies server/dist -> dist/server and client/dist -> dist/public
 * Cleans dist directory first and warns when sources are missing
 */

import { existsSync, rmSync, mkdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const distDir = join(rootDir, 'dist');
const serverDistSrc = join(rootDir, 'server', 'dist');
const clientDistSrc = join(rootDir, 'client', 'dist');
const serverDistDest = join(distDir, 'server');
const publicDistDest = join(distDir, 'public');

function cleanDist() {
  console.log('🧹 Cleaning dist directory...');
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
    console.log('✅ Cleaned dist directory');
  }
}

function ensureDistExists() {
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
}

function copyServerDist() {
  if (!existsSync(serverDistSrc)) {
    console.warn('⚠️  Warning: server/dist directory not found. Skipping server copy.');
    return false;
  }
  
  console.log('📦 Copying server/dist -> dist/server...');
  mkdirSync(serverDistDest, { recursive: true });
  cpSync(serverDistSrc, serverDistDest, { recursive: true });
  console.log('✅ Copied server artifacts');
  return true;
}

function copyClientDist() {
  if (!existsSync(clientDistSrc)) {
    console.warn('⚠️  Warning: client/dist directory not found. Skipping client copy.');
    return false;
  }
  
  console.log('📦 Copying client/dist -> dist/public...');
  mkdirSync(publicDistDest, { recursive: true });
  cpSync(clientDistSrc, publicDistDest, { recursive: true });
  console.log('✅ Copied client artifacts');
  return true;
}

function main() {
  console.log('🚀 Starting artifact assembly...');
  
  cleanDist();
  ensureDistExists();
  
  const serverCopied = copyServerDist();
  const clientCopied = copyClientDist();
  
  if (!serverCopied && !clientCopied) {
    console.error('❌ Error: Both server/dist and client/dist are missing. Build artifacts first.');
    process.exit(1);
  }
  
  console.log('✨ Artifact assembly complete!');
}

main();
