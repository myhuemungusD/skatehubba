#!/usr/bin/env node
/**
 * Environment Variable Validator
 * 
 * Validates that all required environment variables are set before starting the app.
 * Run: node scripts/validate-env.mjs [--production]
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const isProduction = process.argv.includes('--production');

// Required environment variables
const REQUIRED_VARS = {
  // Always required
  common: [
    'DATABASE_URL',
  ],
  // Required in production only
  production: [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'SESSION_SECRET',
  ],
  // Optional but recommended
  recommended: [
    'SENTRY_DSN',
    'RESEND_API_KEY',
  ],
};

// Sensitive patterns that should NEVER be in code
const FORBIDDEN_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/, // Google API Key
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, // Private keys
  /ghp_[0-9a-zA-Z]{36}/, // GitHub Personal Access Token
  /sk_live_[0-9a-zA-Z]{24,}/, // Stripe Live Key
  /sk-[a-zA-Z0-9]{48}/, // OpenAI API Key
  /AKIA[0-9A-Z]{16}/, // AWS Access Key ID
  /mongodb\+srv:\/\/[^\s"']+/, // MongoDB connection string
  /https:\/\/hooks\.slack\.com\/services\/[^\s"']+/, // Slack Webhook URL
  /xoxb-[0-9A-Za-z-]+/, // Slack Bot Token
  /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/, // SendGrid API Key
];

const errors = [];
const warnings = [];

console.log('🔍 Validating environment...\n');

// Check required variables
const varsToCheck = [...REQUIRED_VARS.common];
if (isProduction) {
  varsToCheck.push(...REQUIRED_VARS.production);
}

for (const varName of varsToCheck) {
  if (!process.env[varName]) {
    errors.push(`Missing required variable: ${varName}`);
  }
}

// Check recommended variables
for (const varName of REQUIRED_VARS.recommended) {
  if (!process.env[varName]) {
    warnings.push(`Missing recommended variable: ${varName}`);
  }
}

// Scan source files for hardcoded secrets
console.log('  Scanning for hardcoded secrets...');

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'coverage']);

function walkSourceFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSourceFiles(full));
    } else if (SOURCE_EXTS.has(extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

const scanDirs = ['server', 'client/src', 'shared', 'packages'].map(d => join(rootDir, d));
const filesToScan = scanDirs.flatMap(d => walkSourceFiles(d));

for (const fullPath of filesToScan) {
  const content = readFileSync(fullPath, 'utf-8');
  const relativePath = fullPath.slice(rootDir.length + 1);

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`SECURITY: Potential hardcoded secret found in ${relativePath}`);
    }
  }
}

// Check .env.example exists and matches
const envExamplePath = join(rootDir, '.env.example');
if (existsSync(envExamplePath)) {
  console.log('  Checking .env.example...');
  const exampleContent = readFileSync(envExamplePath, 'utf-8');
  const exampleVars = exampleContent
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=')[0].trim())
    .filter(Boolean);
  
  // Check all required vars are documented
  for (const varName of [...REQUIRED_VARS.common, ...REQUIRED_VARS.production]) {
    if (!exampleVars.includes(varName)) {
      warnings.push(`Variable ${varName} is required but not documented in .env.example`);
    }
  }
}

// Report results
console.log('\n');

if (errors.length > 0) {
  console.log('🚫 ERRORS:\n');
  for (const error of errors) {
    console.log(`  ❌ ${error}`);
  }
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  WARNINGS:\n');
  for (const warning of warnings) {
    console.log(`  ⚠️  ${warning}`);
  }
  console.log('');
}

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ Environment validation passed!\n');
  process.exit(0);
} else if (errors.length > 0) {
  console.log(`\n🚫 ${errors.length} error(s) found. Fix before deploying.\n`);
  process.exit(1);
} else {
  console.log(`\n⚠️  ${warnings.length} warning(s). Consider reviewing.\n`);
  process.exit(0);
}
