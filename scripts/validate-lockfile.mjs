#!/usr/bin/env node
/**
 * Lockfile Integrity Guardrail
 * 
 * Prevents commits when package.json files change without pnpm-lock.yaml.
 * This ensures the lockfile always stays in sync with dependencies.
 * 
 * Usage:
 * - Runs automatically via Husky pre-commit hook
 * - Or manually: node scripts/validate-lockfile.mjs
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf-8',
      cwd: rootDir,
    });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Not in a git repo or no staged files
    return [];
  }
}

function validateLockfileSync() {
  const stagedFiles = getStagedFiles();
  
  if (stagedFiles.length === 0) {
    // No staged files, skip check
    return { valid: true };
  }

  const packageJsonFiles = stagedFiles.filter(file => 
    file.endsWith('package.json') && !file.includes('node_modules')
  );

  const lockfileStaged = stagedFiles.includes('pnpm-lock.yaml');

  if (packageJsonFiles.length > 0 && !lockfileStaged) {
    return {
      valid: false,
      message: `
❌ Lockfile Integrity Check Failed

You're committing changes to package.json without updating pnpm-lock.yaml.

Modified package.json files:
${packageJsonFiles.map(f => `  - ${f}`).join('\n')}

🔧 Fix:
1. Run: pnpm install
2. Stage the lockfile: git add pnpm-lock.yaml
3. Try committing again

Why this matters:
- Keeps dependencies deterministic across CI/deployments
- Prevents "works on my machine" issues
- Required for Vercel's --frozen-lockfile builds
`,
      files: packageJsonFiles,
    };
  }

  return { valid: true };
}

// Main execution
const result = validateLockfileSync();

if (!result.valid) {
  console.error(result.message);
  process.exit(1);
}

// Success - silent on success for cleaner commit flow
process.exit(0);
