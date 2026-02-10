#!/usr/bin/env node
/**
 * Dependency Audit Script
 *
 * Audits all workspace packages for known security vulnerabilities using pnpm audit.
 * Designed to run both locally and in CI pipelines.
 *
 * Usage:
 *   node scripts/audit-dependencies.mjs              # Warn on all, exit 0
 *   node scripts/audit-dependencies.mjs --ci         # Fail on critical/high
 *   node scripts/audit-dependencies.mjs --fail-on=moderate  # Fail on moderate+
 *
 * Severity levels (ascending): low, moderate, high, critical
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const SEVERITY_ORDER = ['low', 'moderate', 'high', 'critical'];

function parseArgs() {
  const args = process.argv.slice(2);
  let failOn = null;

  if (args.includes('--ci')) {
    failOn = 'high';
  }

  const failOnArg = args.find((a) => a.startsWith('--fail-on='));
  if (failOnArg) {
    failOn = failOnArg.split('=')[1];
    if (!SEVERITY_ORDER.includes(failOn)) {
      console.error(
        `Invalid severity: "${failOn}". Must be one of: ${SEVERITY_ORDER.join(', ')}`
      );
      process.exit(2);
    }
  }

  return { failOn };
}

function runAudit() {
  console.log('Auditing dependencies for known vulnerabilities...\n');

  let auditOutput;
  let auditFailed = false;

  try {
    auditOutput = execSync('pnpm audit --json 2>/dev/null', {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    // pnpm audit exits non-zero when vulnerabilities are found
    auditOutput = err.stdout || '';
    auditFailed = true;
  }

  return { auditOutput, auditFailed };
}

function parseAuditResults(auditOutput) {
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  const advisories = [];

  if (!auditOutput.trim()) {
    return { counts, advisories };
  }

  // pnpm audit --json can output multiple JSON objects (one per line)
  const lines = auditOutput.trim().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;

    let data;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }

    // Handle the pnpm audit JSON format
    if (data.advisories) {
      for (const advisory of Object.values(data.advisories)) {
        const severity = advisory.severity || 'low';
        counts[severity] = (counts[severity] || 0) + 1;
        advisories.push({
          id: advisory.id,
          module: advisory.module_name,
          severity,
          title: advisory.title,
          url: advisory.url,
          paths: advisory.findings
            ? advisory.findings.map((f) => f.paths).flat()
            : [],
        });
      }
    }

    // Handle metadata summary format
    if (data.metadata?.vulnerabilities) {
      const vulns = data.metadata.vulnerabilities;
      for (const severity of SEVERITY_ORDER) {
        counts[severity] = vulns[severity] || 0;
      }
    }
  }

  return { counts, advisories };
}

function printReport(counts, advisories) {
  const total =
    counts.critical + counts.high + counts.moderate + counts.low;

  if (total === 0) {
    console.log('No known vulnerabilities found.\n');
    return;
  }

  console.log(`Found ${total} vulnerabilities:\n`);
  console.log(
    `  Critical: ${counts.critical}  |  High: ${counts.high}  |  Moderate: ${counts.moderate}  |  Low: ${counts.low}\n`
  );

  if (advisories.length > 0) {
    // Sort by severity (critical first)
    advisories.sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(b.severity) -
        SEVERITY_ORDER.indexOf(a.severity)
    );

    console.log('Details:\n');
    for (const adv of advisories) {
      const icon =
        adv.severity === 'critical'
          ? '[CRITICAL]'
          : adv.severity === 'high'
            ? '[HIGH]'
            : adv.severity === 'moderate'
              ? '[MODERATE]'
              : '[LOW]';
      console.log(`  ${icon} ${adv.module} - ${adv.title}`);
      if (adv.url) {
        console.log(`         ${adv.url}`);
      }
    }
    console.log('');
  }
}

function shouldFail(counts, failOn) {
  if (!failOn) return false;

  const threshold = SEVERITY_ORDER.indexOf(failOn);
  for (let i = threshold; i < SEVERITY_ORDER.length; i++) {
    if (counts[SEVERITY_ORDER[i]] > 0) {
      return true;
    }
  }
  return false;
}

// Also run a plain-text audit for human-readable output when JSON parsing
// yields no structured advisories (common with newer pnpm versions)
function runPlainAudit() {
  try {
    const output = execSync('pnpm audit 2>&1', {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return output;
  } catch (err) {
    return err.stdout || err.stderr || '';
  }
}

// --- Main ---

const { failOn } = parseArgs();
const { auditOutput, auditFailed } = runAudit();
const { counts, advisories } = parseAuditResults(auditOutput);
const total = counts.critical + counts.high + counts.moderate + counts.low;

// If we got structured results, print our report
if (total > 0 || advisories.length > 0) {
  printReport(counts, advisories);
} else if (auditFailed) {
  // JSON parsing yielded nothing but audit returned non-zero — show plain output
  console.log(runPlainAudit());
} else {
  console.log('No known vulnerabilities found.\n');
}

// Determine exit code
if (failOn && shouldFail(counts, failOn)) {
  const threshold = SEVERITY_ORDER.indexOf(failOn);
  const failingSeverities = SEVERITY_ORDER.slice(threshold)
    .filter((s) => counts[s] > 0)
    .join(', ');
  console.log(
    `Audit failed: found ${failingSeverities} severity vulnerabilities (threshold: ${failOn}+)\n`
  );
  console.log('Run "pnpm audit" locally for full details.');
  console.log(
    'To fix, run "pnpm audit --fix" or update affected packages.\n'
  );
  process.exit(1);
} else if (total > 0) {
  console.log(
    'Vulnerabilities found but below failure threshold. Review recommended.\n'
  );
  process.exit(0);
} else {
  process.exit(0);
}
