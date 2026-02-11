#!/usr/bin/env node
/**
 * Hardcoded Secret Scanner
 *
 * Scans source code for hardcoded secrets without checking env var completeness.
 * Used in pre-commit hooks to prevent committing secrets.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Sensitive patterns that should NEVER be in code
const FORBIDDEN_PATTERNS = [
  { pattern: /AIza[0-9A-Za-z-_]{35}/, name: 'Google API Key' },
  { pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, name: 'Private Key' },
  { pattern: /ghp_[0-9a-zA-Z]{36}/, name: 'GitHub Personal Access Token' },
  { pattern: /sk_live_[0-9a-zA-Z]{24,}/, name: 'Stripe Live Key' },
  { pattern: /sk-[a-zA-Z0-9]{48}/, name: 'OpenAI API Key' },
  { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key ID' },
  { pattern: /mongodb\+srv:\/\/[^\s"']+/, name: 'MongoDB Connection String' },
  { pattern: /https:\/\/hooks\.slack\.com\/services\/[^\s"']+/, name: 'Slack Webhook URL' },
  { pattern: /xoxb-[0-9A-Za-z-]+/, name: 'Slack Bot Token' },
  { pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/, name: 'SendGrid API Key' },
];

const errors = [];

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'coverage', 'build', 'docs']);
const SKIP_PATTERNS = [
  /test-secret/i,    // Test files for secret detection
  /\.example/i,      // Example files
  /\.md$/i,          // Documentation files
  /EXAMPLE/,         // Files containing "EXAMPLE" (like example keys)
];

function walkSourceFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);

      try {
        if (entry.isDirectory()) {
          results.push(...walkSourceFiles(full));
        } else if (SOURCE_EXTS.has(extname(entry.name))) {
          results.push(full);
        }
      } catch (err) {
        // Skip files we can't access
        continue;
      }
    }
  } catch (err) {
    // Skip directories we can't access
  }

  return results;
}

// If files are passed as arguments, scan only those
// Otherwise scan all source directories
let filesToScan;

if (process.argv.length > 2) {
  // Files passed as arguments - scan only these
  filesToScan = process.argv.slice(2).map(f => join(rootDir, f));
} else {
  // No arguments - scan all source directories
  const scanDirs = ['server', 'client/src', 'shared', 'packages', 'scripts', 'functions']
    .map(d => join(rootDir, d));
  filesToScan = scanDirs.flatMap(d => walkSourceFiles(d));
}

for (const fullPath of filesToScan) {
  try {
    const relativePath = fullPath.slice(rootDir.length + 1);

    // Skip files matching skip patterns
    if (SKIP_PATTERNS.some(pattern => pattern.test(relativePath))) {
      continue;
    }

    const content = readFileSync(fullPath, 'utf-8');

    for (const { pattern, name } of FORBIDDEN_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        // Double-check it's not an example/test pattern
        if (match[0].includes('EXAMPLE') || match[0].includes('example')) {
          continue;
        }

        errors.push({
          file: relativePath,
          type: name,
          match: match[0].substring(0, 50) + '...'
        });
      }
    }
  } catch (err) {
    // Skip files we can't read
    continue;
  }
}

// Report results
if (errors.length > 0) {
  console.log('🚫 HARDCODED SECRETS DETECTED:\n');
  for (const error of errors) {
    console.log(`  ❌ ${error.type} found in ${error.file}`);
    console.log(`     Pattern: ${error.match}`);
  }
  console.log('');
  process.exit(1);
} else {
  // Success - no output needed (silent when passing)
  process.exit(0);
}
