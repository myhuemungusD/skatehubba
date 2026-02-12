#!/usr/bin/env node

/**
 * Comprehensive secret scanning script
 * Runs multiple secret detection tools on staged files
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function runCommand(command, options = {}) {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      ...options
    });
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || error.stderr || error.message,
      code: error.status
    };
  }
}

function getStagedFiles() {
  const result = runCommand('git diff --cached --name-only --diff-filter=ACM');
  if (!result.success) return [];
  return result.output.trim().split('\n').filter(Boolean);
}

async function main() {
  log(`\n${BOLD}${BLUE}🔐 Secret Scanning - Multi-Layer Protection${RESET}\n`);

  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    log(`${YELLOW}⚠️  No staged files to scan${RESET}`);
    return;
  }

  log(`${BLUE}📝 Scanning ${stagedFiles.length} staged file(s)...${RESET}\n`);

  let hasErrors = false;

  // Quote file paths to handle special characters like () and []
  const quotedFiles = stagedFiles.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ');

  // 1. Run secretlint (npm-based, always available)
  log(`${BOLD}1️⃣  Running Secretlint...${RESET}`);
  const quotedFiles = stagedFiles.map(f => `'${f}'`).join(' ');
  const secretlintResult = runCommand(
    `npx secretlint --format table ${quotedFiles}`,
    { cwd: process.cwd() }
  );

  if (!secretlintResult.success) {
    log(`${RED}❌ Secretlint found potential secrets!${RESET}`);
    console.log(secretlintResult.output);
    hasErrors = true;
  } else {
    log(`${GREEN}✅ Secretlint: No secrets detected${RESET}`);
  }

  // 2. Run custom hardcoded secret scanner
  log(`\n${BOLD}2️⃣  Running hardcoded secret scanner...${RESET}`);
  const hardcodedSecretsResult = runCommand(
    `node scripts/scan-hardcoded-secrets.mjs ${quotedFiles}`
  );

  if (!hardcodedSecretsResult.success) {
    log(`${RED}❌ Hardcoded secrets found in source code!${RESET}`);
    console.log(hardcodedSecretsResult.output);
    hasErrors = true;
  } else {
    log(`${GREEN}✅ Hardcoded secret scan: Passed${RESET}`);
  }

  // 3. Check for gitleaks (optional, may not be installed)
  log(`\n${BOLD}3️⃣  Checking for Gitleaks...${RESET}`);
  const gitleaksCheck = runCommand('which gitleaks');

  if (gitleaksCheck.success) {
    log(`${BLUE}   Running Gitleaks on staged files...${RESET}`);
    const gitleaksResult = runCommand(
      'gitleaks protect --staged --config=.gitleaks.toml'
    );

    if (!gitleaksResult.success && gitleaksResult.code !== 0) {
      log(`${RED}❌ Gitleaks found potential secrets!${RESET}`);
      console.log(gitleaksResult.output);
      hasErrors = true;
    } else {
      log(`${GREEN}✅ Gitleaks: No secrets detected${RESET}`);
    }
  } else {
    log(`${YELLOW}⚠️  Gitleaks not installed (optional)${RESET}`);
    log(`${YELLOW}   Install: ${RESET}brew install gitleaks ${YELLOW}or${RESET} https://github.com/gitleaks/gitleaks`);
  }

  // 4. Check for detect-secrets (optional Python tool)
  log(`\n${BOLD}4️⃣  Checking for detect-secrets...${RESET}`);
  const detectSecretsCheck = runCommand('which detect-secrets');

  if (detectSecretsCheck.success) {
    const baselineExists = existsSync('.secrets.baseline');

    if (baselineExists) {
      log(`${BLUE}   Running detect-secrets audit...${RESET}`);
      const detectSecretsResult = runCommand(
        'detect-secrets scan --baseline .secrets.baseline --exclude-files pnpm-lock.yaml'
      );

      if (!detectSecretsResult.success) {
        log(`${RED}❌ detect-secrets found new secrets!${RESET}`);
        console.log(detectSecretsResult.output);
        hasErrors = true;
      } else {
        log(`${GREEN}✅ detect-secrets: No new secrets detected${RESET}`);
      }
    } else {
      log(`${YELLOW}⚠️  No baseline file found. Creating one...${RESET}`);
      runCommand('detect-secrets scan --exclude-files pnpm-lock.yaml > .secrets.baseline');
      log(`${GREEN}✅ Baseline created at .secrets.baseline${RESET}`);
    }
  } else {
    log(`${YELLOW}⚠️  detect-secrets not installed (optional)${RESET}`);
    log(`${YELLOW}   Install: ${RESET}pip install detect-secrets`);
  }

  // 5. Check for GitGuardian ggshield (optional Python tool)
  log(`\n${BOLD}5️⃣  Checking for GitGuardian ggshield...${RESET}`);
  const ggshieldCheck = runCommand('which ggshield');

  if (ggshieldCheck.success) {
    log(`${BLUE}   Running ggshield scan...${RESET}`);
    const ggshieldResult = runCommand('ggshield secret scan pre-commit');

    if (!ggshieldResult.success && ggshieldResult.code !== 0) {
      log(`${RED}❌ ggshield found potential secrets!${RESET}`);
      console.log(ggshieldResult.output);
      hasErrors = true;
    } else {
      log(`${GREEN}✅ ggshield: No secrets detected${RESET}`);
    }
  } else {
    log(`${YELLOW}⚠️  ggshield not installed (optional)${RESET}`);
    log(`${YELLOW}   Install: ${RESET}pip install ggshield`);
  }

  // Summary
  log(`\n${BOLD}${BLUE}═══════════════════════════════════════${RESET}`);
  if (hasErrors) {
    log(`${RED}${BOLD}❌ Secret scan failed! Secrets detected.${RESET}`);
    log(`${RED}Please remove secrets before committing.${RESET}\n`);
    process.exit(1);
  } else {
    log(`${GREEN}${BOLD}✅ All secret scans passed!${RESET}\n`);
    process.exit(0);
  }
}

main().catch((error) => {
  log(`${RED}Error running secret scan: ${error.message}${RESET}`, RED);
  process.exit(1);
});
