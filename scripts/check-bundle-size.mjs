#!/usr/bin/env node

/**
 * Bundle Size Budget Check
 *
 * Enforces maximum bundle sizes for the client build to prevent
 * accidental bloat from reaching production. Run after `pnpm -C client build`.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs [--ci]
 *
 * --ci: Fails with exit code 1 if any budget is exceeded (for CI pipelines)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../client/dist/assets");

// Budget thresholds (in KB)
// These are per-chunk limits — adjust as the app grows
const BUDGETS = {
  // Individual chunk budgets (filename pattern → max KB)
  chunks: {
    vendor: 500,
    firebase: 600,
    leaflet: 300,
    motion: 150,
    icons: 200,
    radix: 200,
  },
  // Total JS budget for the entire build
  totalJs: 1800,
  // Total CSS budget
  totalCss: 300,
};

const isCI = process.argv.includes("--ci");

function formatKB(bytes) {
  return (bytes / 1024).toFixed(1);
}

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.log("⏭️  No client/dist/assets found — skipping bundle size check");
    console.log("   (Run `pnpm -C client build` first)");
    process.exit(0);
  }

  const files = fs.readdirSync(DIST_DIR);
  const jsFiles = files.filter((f) => f.endsWith(".js"));
  const cssFiles = files.filter((f) => f.endsWith(".css"));

  let totalJsBytes = 0;
  let totalCssBytes = 0;
  const violations = [];
  const report = [];

  // Check JS chunks
  for (const file of jsFiles) {
    const filePath = path.join(DIST_DIR, file);
    const stat = fs.statSync(filePath);
    const sizeKB = stat.size / 1024;
    totalJsBytes += stat.size;

    // Check per-chunk budgets
    for (const [chunkName, maxKB] of Object.entries(BUDGETS.chunks)) {
      if (file.includes(chunkName)) {
        const status = sizeKB > maxKB ? "OVER" : "ok";
        report.push({ file, sizeKB: sizeKB.toFixed(1), budget: maxKB, status });
        if (sizeKB > maxKB) {
          violations.push(
            `  ${file}: ${sizeKB.toFixed(1)} KB (budget: ${maxKB} KB, over by ${(sizeKB - maxKB).toFixed(1)} KB)`
          );
        }
      }
    }
  }

  // Check CSS
  for (const file of cssFiles) {
    const filePath = path.join(DIST_DIR, file);
    totalCssBytes += fs.statSync(filePath).size;
  }

  // Total budget checks
  const totalJsKB = totalJsBytes / 1024;
  const totalCssKB = totalCssBytes / 1024;

  if (totalJsKB > BUDGETS.totalJs) {
    violations.push(
      `  Total JS: ${totalJsKB.toFixed(1)} KB (budget: ${BUDGETS.totalJs} KB, over by ${(totalJsKB - BUDGETS.totalJs).toFixed(1)} KB)`
    );
  }
  if (totalCssKB > BUDGETS.totalCss) {
    violations.push(
      `  Total CSS: ${totalCssKB.toFixed(1)} KB (budget: ${BUDGETS.totalCss} KB, over by ${(totalCssKB - BUDGETS.totalCss).toFixed(1)} KB)`
    );
  }

  // Print report
  console.log("\n📦 Bundle Size Report");
  console.log("─".repeat(60));
  console.log(`  Total JS:  ${formatKB(totalJsBytes)} KB / ${BUDGETS.totalJs} KB`);
  console.log(`  Total CSS: ${formatKB(totalCssBytes)} KB / ${BUDGETS.totalCss} KB`);
  console.log(`  JS files:  ${jsFiles.length}`);
  console.log(`  CSS files: ${cssFiles.length}`);

  if (report.length > 0) {
    console.log("\n  Per-chunk breakdown:");
    for (const r of report) {
      const icon = r.status === "ok" ? "✅" : "❌";
      console.log(`    ${icon} ${r.file}: ${r.sizeKB} KB / ${r.budget} KB`);
    }
  }

  if (violations.length > 0) {
    console.log("\n❌ Bundle budget exceeded:");
    for (const v of violations) {
      console.log(v);
    }
    if (isCI) {
      console.log("\nFailing CI — reduce bundle size or update budgets in scripts/check-bundle-size.mjs");
      process.exit(1);
    } else {
      console.log("\n⚠️  Warning: bundle budget exceeded (use --ci to enforce)");
    }
  } else {
    console.log("\n✅ All bundle budgets within limits");
  }
}

main();
