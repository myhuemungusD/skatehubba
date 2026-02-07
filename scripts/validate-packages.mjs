#!/usr/bin/env node
/**
 * Validate package.json files for duplicate dependencies
 * 
 * This script checks all package.json files in the monorepo for:
 * 1. Duplicate keys (same dependency listed twice) - BLOCKS COMMIT
 * 2. Version mismatches across packages - WARNING
 * 3. Invalid JSON syntax - BLOCKS COMMIT
 * 
 * Run: node scripts/validate-packages.mjs
 * Run with --strict to fail on warnings too
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const strictMode = process.argv.includes('--strict');

/**
 * Discover workspace package.json paths from pnpm-workspace.yaml.
 * Falls back to a hardcoded list if the workspace file is missing.
 */
function discoverPackagePaths() {
  const paths = ['package.json']; // always include root
  const wsPath = join(rootDir, 'pnpm-workspace.yaml');

  if (!existsSync(wsPath)) {
    // Fallback to well-known locations
    return ['package.json', 'client/package.json', 'server/package.json',
            'shared/package.json', 'mobile/package.json', 'functions/package.json'];
  }

  const wsContent = readFileSync(wsPath, 'utf-8');
  const entries = wsContent.match(/- ["']?([^"'\n]+)["']?/g) || [];

  for (const entry of entries) {
    const pattern = entry.replace(/^- ["']?/, '').replace(/["']?$/, '').trim();

    if (pattern.endsWith('/*')) {
      // Glob-style: expand directory
      const baseDir = join(rootDir, pattern.slice(0, -2));
      if (existsSync(baseDir)) {
        for (const child of readdirSync(baseDir, { withFileTypes: true })) {
          if (child.isDirectory()) {
            paths.push(join(pattern.slice(0, -2), child.name, 'package.json'));
          }
        }
      }
    } else {
      paths.push(join(pattern, 'package.json'));
    }
  }

  return paths;
}

const PACKAGE_PATHS = discoverPackagePaths();

// Critical dependencies that MUST have matching versions
const CRITICAL_DEPS = [
  'drizzle-orm',
  'drizzle-zod', 
  'zod',
  'socket.io',
];

const errors = [];
const warnings = [];
const versionMap = new Map(); // Track versions across packages

/**
 * Check for duplicate keys in JSON by parsing raw content
 * This catches cases like having "drizzle-orm" twice in dependencies
 */
function checkDuplicateKeys(filePath, content) {
  const lines = content.split('\n');
  const keyTracker = new Map(); // Track seen keys with their line numbers
  let currentSection = '';
  let braceDepth = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Track brace depth to know which section we're in
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    
    // Extract key from line like '  "keyName": value'
    const keyMatch = line.match(/^\s*"([^"]+)"\s*:/);
    
    if (keyMatch) {
      const key = keyMatch[1];
      
      // Track top-level section names
      if (braceDepth === 1) {
        currentSection = key;
        keyTracker.clear(); // Reset for new section
      }
      
      // Check for duplicates within the same section (braceDepth 2 = inside dependencies/devDependencies)
      if (braceDepth === 2 && (currentSection === 'dependencies' || currentSection === 'devDependencies' || currentSection === 'peerDependencies')) {
        const sectionKey = `${currentSection}:${key}`;
        
        if (keyTracker.has(sectionKey)) {
          const firstLine = keyTracker.get(sectionKey);
          errors.push({
            file: filePath,
            line: lineNum,
            message: `DUPLICATE DEPENDENCY: "${key}" appears twice in ${currentSection} (first at line ${firstLine})`,
            critical: true,
          });
        } else {
          keyTracker.set(sectionKey, lineNum);
        }
      }
    }
    
    braceDepth += openBraces - closeBraces;
  }
}

/**
 * Track dependency versions across packages
 */
function trackVersions(filePath, deps, depType) {
  if (!deps) return;
  
  for (const [name, version] of Object.entries(deps)) {
    if (!versionMap.has(name)) {
      versionMap.set(name, []);
    }
    
    versionMap.get(name).push({
      file: filePath,
      version,
      type: depType,
    });
  }
}

/**
 * Check for version mismatches
 */
function checkVersionMismatches() {
  for (const [name, entries] of versionMap) {
    // Normalize versions for comparison (remove ^ and ~)
    const normalizedVersions = new Set(entries.map(e => e.version.replace(/[\^~]/g, '')));
    
    if (normalizedVersions.size > 1) {
      const details = entries
        .map(e => `  - ${e.file} (${e.type}): ${e.version}`)
        .join('\n');
      
      const isCritical = CRITICAL_DEPS.includes(name);
      
      if (isCritical) {
        errors.push({
          file: 'multiple',
          message: `CRITICAL VERSION MISMATCH for "${name}":\n${details}`,
          critical: true,
        });
      } else {
        warnings.push({
          message: `Version mismatch for "${name}":\n${details}`,
        });
      }
    }
  }
}

// Main execution
console.log('🔍 Validating package.json files...\n');

for (const relativePath of PACKAGE_PATHS) {
  const fullPath = join(rootDir, relativePath);
  
  if (!existsSync(fullPath)) {
    continue;
  }
  
  console.log(`  Checking ${relativePath}...`);
  
  try {
    const content = readFileSync(fullPath, 'utf-8');
    
    // Check for duplicate keys (CRITICAL)
    checkDuplicateKeys(relativePath, content);
    
    // Parse JSON and track versions
    const pkg = JSON.parse(content);
    trackVersions(relativePath, pkg.dependencies, 'dependencies');
    trackVersions(relativePath, pkg.devDependencies, 'devDependencies');
    trackVersions(relativePath, pkg.peerDependencies, 'peerDependencies');
    
  } catch (err) {
    if (err instanceof SyntaxError) {
      errors.push({
        file: relativePath,
        message: `Invalid JSON: ${err.message}`,
        critical: true,
      });
    } else {
      errors.push({
        file: relativePath,
        message: err.message,
        critical: true,
      });
    }
  }
}

// Check for version mismatches
checkVersionMismatches();

// Report results
console.log('\n');

const criticalErrors = errors.filter(e => e.critical);
const nonCriticalErrors = errors.filter(e => !e.critical);

if (criticalErrors.length > 0) {
  console.log('🚫 CRITICAL ERRORS (will block commit):\n');
  for (const error of criticalErrors) {
    const location = error.line ? `${error.file}:${error.line}` : error.file;
    console.log(`  ${location}: ${error.message}\n`);
  }
}

if (nonCriticalErrors.length > 0) {
  console.log('❌ ERRORS:\n');
  for (const error of nonCriticalErrors) {
    const location = error.line ? `${error.file}:${error.line}` : error.file;
    console.log(`  ${location}: ${error.message}`);
  }
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  WARNINGS:\n');
  for (const warning of warnings) {
    console.log(`  ${warning.message}\n`);
  }
}

if (criticalErrors.length === 0 && nonCriticalErrors.length === 0 && warnings.length === 0) {
  console.log('✅ All package.json files are valid!\n');
  process.exit(0);
} else if (criticalErrors.length > 0) {
  console.log(`\n🚫 Found ${criticalErrors.length} critical error(s). COMMIT BLOCKED.\n`);
  console.log('Fix duplicate dependencies before committing.\n');
  process.exit(1);
} else if (strictMode && warnings.length > 0) {
  console.log(`\n⚠️  Strict mode: ${warnings.length} warning(s) found. COMMIT BLOCKED.\n`);
  process.exit(1);
} else {
  console.log(`\n⚠️  Found ${warnings.length} warning(s). Consider reviewing.\n`);
  process.exit(0);
}
