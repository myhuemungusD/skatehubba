#!/usr/bin/env node
/**
 * Automated Release Script
 * 
 * This script:
 * - Detects merged PRs since last release
 * - Parses commit messages for semantic versioning (feat:, fix:, BREAKING CHANGE:)
 * - Determines version bump (major/minor/patch)
 * - Updates CHANGELOG.md with semantic release notes
 * - Bumps version in package.json
 * - Creates git tag and GitHub release
 * 
 * Commit Message Convention:
 * - feat: New feature (minor version bump)
 * - fix: Bug fix (patch version bump)
 * - BREAKING CHANGE: Breaking change (major version bump)
 * - docs: Documentation changes
 * - style: Code style changes
 * - refactor: Code refactoring
 * - perf: Performance improvements
 * - test: Test changes
 * - chore: Build/tooling changes
 */

import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';

const CHANGELOG_PATH = './CHANGELOG.md';
const PACKAGE_JSON_PATH = './package.json';

// Version validation regex - strict semver X.Y.Z
const VERSION_REGEX = /^\d+\.\d+\.\d+$/;

// Commit type regex for conventional commits
const COMMIT_TYPE_REGEX = /^(feat|feature|fix|docs|style|refactor|perf|test|chore):\s*/i;

/**
 * Execute git command using execFileSync to avoid shell injection.
 * Accepts either a string (split on spaces) or an array of arguments.
 * @param {boolean} options.allowEmpty - If true, return empty string on error instead of throwing
 * @param {number} options.retries - Number of times to retry on failure (default: 0)
 */
function git(...args) {
  // Extract options if last argument is an object with known option keys
  let options = { allowEmpty: true, retries: 0 };
  const lastArg = args[args.length - 1];
  if (lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg) &&
      ('allowEmpty' in lastArg || 'retries' in lastArg)) {
    options = { ...options, ...args.pop() };
  }

  let lastError;
  const maxAttempts = options.retries + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return execFileSync('git', args, { encoding: 'utf8' }).trim();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts - 1) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.warn(`⚠️  Git command failed (attempt ${attempt + 1}/${maxAttempts}): git ${args.join(' ')}`);
        console.warn(`   Retrying in ${delay}ms...`);

        // Simple sleep using busy wait (not ideal but works for scripts)
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Wait
        }
      }
    }
  }

  // All attempts failed
  const errorMessage = `Git command failed after ${maxAttempts} attempt(s): git ${args.join(' ')}`;
  if (options.allowEmpty) {
    console.error(`❌ ${errorMessage}`);
    console.error(`   ${lastError.message}`);
    return '';
  } else {
    throw new Error(`${errorMessage}\n${lastError.message}`);
  }
}

/**
 * Get the last release tag
 */
function getLastReleaseTag() {
  const tags = git('tag', '-l', 'v*', '--sort=-v:refname');
  if (!tags) return null;
  return tags.split('\n')[0];
}

/**
 * Get commits since last release
 * Prioritizes merge commits to detect PRs, falls back to all commits
 */
function getCommitsSinceLastRelease() {
  const lastTag = getLastReleaseTag();
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  
  // First try to get merge commits (these represent merged PRs)
  const log = git('log', range, '--pretty=format:%H|%s|%b', '--merges');
  if (!log) {
    // If no merge commits found, get all commits
    const allLog = git('log', range, '--pretty=format:%H|%s|%b');
    return parseCommits(allLog);
  }
  
  return parseCommits(log);
}

/**
 * Parse commit log into structured data
 */
function parseCommits(log) {
  if (!log) return [];
  
  const commits = log.split('\n').filter(line => line.trim());
  return commits.map(line => {
    const parts = line.split('|');
    const hash = parts[0] || '';
    const subject = parts[1] || '';
    const body = parts.slice(2).join('|') || '';
    return { hash, subject, body };
  }).filter(commit => commit.hash && commit.subject);
}

/**
 * Categorize commits by type
 */
function categorizeCommits(commits) {
  const categories = {
    breaking: [],
    features: [],
    fixes: [],
    docs: [],
    style: [],
    refactor: [],
    perf: [],
    test: [],
    chore: [],
    other: []
  };

  for (const commit of commits) {
    if (!commit || !commit.subject) continue;
    
    const fullMessage = `${commit.subject} ${commit.body || ''}`.toLowerCase();
    const subjectLower = commit.subject.toLowerCase();
    
    if (fullMessage.includes('breaking change') || fullMessage.includes('breaking:')) {
      categories.breaking.push(commit);
    } else if (subjectLower.startsWith('feat:') || subjectLower.startsWith('feature:')) {
      categories.features.push(commit);
    } else if (subjectLower.startsWith('fix:')) {
      categories.fixes.push(commit);
    } else if (subjectLower.startsWith('docs:')) {
      categories.docs.push(commit);
    } else if (subjectLower.startsWith('style:')) {
      categories.style.push(commit);
    } else if (subjectLower.startsWith('refactor:')) {
      categories.refactor.push(commit);
    } else if (subjectLower.startsWith('perf:')) {
      categories.perf.push(commit);
    } else if (subjectLower.startsWith('test:')) {
      categories.test.push(commit);
    } else if (subjectLower.startsWith('chore:')) {
      categories.chore.push(commit);
    } else {
      categories.other.push(commit);
    }
  }

  return categories;
}

/**
 * Check if categories have any significant changes
 */
function hasAnyChanges(categories) {
  return Object.values(categories).some(arr => arr.length > 0);
}

/**
 * Determine version bump type based on commits
 */
function determineVersionBump(categories) {
  if (categories.breaking.length > 0) {
    return 'major';
  }
  if (categories.features.length > 0) {
    return 'minor';
  }
  if (hasAnyChanges(categories)) {
    return 'patch';
  }
  return null;
}

/**
 * Bump version in package.json
 */
function bumpVersion(bumpType) {
  let pkg;
  let originalContent;

  try {
    originalContent = readFileSync(PACKAGE_JSON_PATH, 'utf8');
    pkg = JSON.parse(originalContent);
  } catch (error) {
    throw new Error(`Failed to read or parse package.json: ${error.message}\n` +
                    `   Please ensure ${PACKAGE_JSON_PATH} exists and contains valid JSON.`);
  }

  if (!pkg.version) {
    throw new Error(`package.json does not contain a version field`);
  }

  const versionParts = pkg.version.split('.');

  // Validate version format
  if (versionParts.length < 3 || versionParts.some(p => isNaN(parseInt(p, 10)))) {
    throw new Error(`Invalid version format in package.json: ${pkg.version}\n` +
                    `   Expected format: X.Y.Z (e.g., 1.0.0)`);
  }

  const [major, minor, patch] = versionParts.map(p => parseInt(p, 10));

  let newVersion;
  switch (bumpType) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
    default:
      throw new Error(`Invalid bump type: ${bumpType}. Must be 'major', 'minor', or 'patch'.`);
  }

  const oldVersion = pkg.version;
  pkg.version = newVersion;

  try {
    writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n');
  } catch (error) {
    throw new Error(`Failed to write package.json: ${error.message}\n` +
                    `   Version bump: ${oldVersion} → ${newVersion}`);
  }

  return newVersion;
}

/**
 * Format commit for changelog
 */
function formatCommit(commit) {
  const shortHash = commit.hash.substring(0, 7);
  const subject = commit.subject.replace(COMMIT_TYPE_REGEX, '');
  return `- ${subject} ([${shortHash}](../../commit/${commit.hash}))`;
}

/**
 * Generate changelog entry
 */
function generateChangelogEntry(version, categories) {
  const date = new Date().toISOString().split('T')[0];
  let entry = `## [${version}] - ${date}\n\n`;
  
  if (categories.breaking.length > 0) {
    entry += `### ⚠ BREAKING CHANGES\n\n`;
    categories.breaking.forEach(commit => {
      entry += formatCommit(commit) + '\n';
    });
    entry += '\n';
  }
  
  if (categories.features.length > 0) {
    entry += `### ✨ Features\n\n`;
    categories.features.forEach(commit => {
      entry += formatCommit(commit) + '\n';
    });
    entry += '\n';
  }
  
  if (categories.fixes.length > 0) {
    entry += `### 🐛 Bug Fixes\n\n`;
    categories.fixes.forEach(commit => {
      entry += formatCommit(commit) + '\n';
    });
    entry += '\n';
  }
  
  if (categories.perf.length > 0) {
    entry += `### ⚡ Performance Improvements\n\n`;
    categories.perf.forEach(commit => {
      entry += formatCommit(commit) + '\n';
    });
    entry += '\n';
  }
  
  if (categories.refactor.length > 0) {
    entry += `### ♻️ Code Refactoring\n\n`;
    categories.refactor.forEach(commit => {
      entry += formatCommit(commit) + '\n';
    });
    entry += '\n';
  }
  
  if (categories.docs.length > 0) {
    entry += `### 📝 Documentation\n\n`;
    categories.docs.forEach(commit => {
      entry += formatCommit(commit) + '\n';
    });
    entry += '\n';
  }
  
  if (categories.style.length > 0 || categories.test.length > 0 || categories.chore.length > 0) {
    entry += `### 🔧 Other Changes\n\n`;
    [...categories.style, ...categories.test, ...categories.chore].forEach(commit => {
      entry += formatCommit(commit) + '\n';
    });
    entry += '\n';
  }
  
  if (categories.other.length > 0) {
    entry += `### Other\n\n`;
    categories.other.forEach(commit => {
      entry += formatCommit(commit) + '\n';
    });
    entry += '\n';
  }
  
  return entry;
}

/**
 * Update CHANGELOG.md
 */
function updateChangelog(entry) {
  let changelog;
  let changelogExists = true;

  try {
    changelog = readFileSync(CHANGELOG_PATH, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      // If CHANGELOG doesn't exist, create a new one with a header
      console.log(`   ℹ️  ${CHANGELOG_PATH} not found, creating new changelog`);
      changelog = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n---\n\n';
      changelogExists = false;
    } else {
      throw new Error(`Failed to read ${CHANGELOG_PATH}: ${error.message}`);
    }
  }

  // Find the position after the header to insert new entry
  const lines = changelog.split('\n');
  const insertIndex = lines.findIndex((line, idx) => {
    // Insert after the first heading and separator
    return idx > 0 && line.startsWith('## [');
  });

  if (insertIndex === -1) {
    // No previous entries, add after header
    const headerEndIndex = lines.findIndex(line => line.trim() === '---');
    if (headerEndIndex !== -1) {
      lines.splice(headerEndIndex + 1, 0, '', entry.trim(), '');
    } else {
      // Just append to end
      lines.push('', entry.trim());
    }
  } else {
    lines.splice(insertIndex, 0, entry.trim(), '');
  }

  const updatedChangelog = lines.join('\n');

  try {
    writeFileSync(CHANGELOG_PATH, updatedChangelog);
  } catch (error) {
    throw new Error(`Failed to write ${CHANGELOG_PATH}: ${error.message}\n` +
                    `   Please ensure you have write permissions for this file.`);
  }
}

/**
 * Create git tag and push
 */
function createGitTag(version) {
  // Validate version to prevent command injection
  if (!VERSION_REGEX.test(version)) {
    throw new Error(`Invalid version format: ${version}`);
  }
  
  const tagName = `v${version}`;
  git('tag', '-a', tagName, '-m', `Release ${tagName}`);
  console.log(`✅ Created git tag: ${tagName}`);
  return tagName;
}

/**
 * Generate release notes for GitHub
 */
function generateReleaseNotes(version, categories) {
  let notes = '';
  
  if (categories.breaking.length > 0) {
    notes += `## ⚠️ BREAKING CHANGES\n\n`;
    categories.breaking.forEach(commit => {
      notes += formatCommit(commit) + '\n';
    });
    notes += '\n';
  }
  
  if (categories.features.length > 0) {
    notes += `## ✨ Features\n\n`;
    categories.features.forEach(commit => {
      notes += formatCommit(commit) + '\n';
    });
    notes += '\n';
  }
  
  if (categories.fixes.length > 0) {
    notes += `## 🐛 Bug Fixes\n\n`;
    categories.fixes.forEach(commit => {
      notes += formatCommit(commit) + '\n';
    });
    notes += '\n';
  }
  
  if (categories.perf.length > 0 || categories.refactor.length > 0) {
    notes += `## 🔧 Improvements\n\n`;
    [...categories.perf, ...categories.refactor].forEach(commit => {
      notes += formatCommit(commit) + '\n';
    });
    notes += '\n';
  }
  
  return notes.trim();
}

/**
 * Calculate total count of other changes (non-breaking, non-feature, non-fix)
 */
function countOtherChanges(categories) {
  return categories.docs.length +
         categories.style.length +
         categories.refactor.length +
         categories.perf.length +
         categories.test.length +
         categories.chore.length +
         categories.other.length;
}

/**
 * Rollback changes made during release process
 */
function rollbackChanges(version) {
  console.log('\n🔄 Rolling back changes...');

  try {
    // Reset any uncommitted changes to package.json and CHANGELOG.md
    const status = git('status', '--porcelain', { allowEmpty: true });
    if (status) {
      console.log('   Resetting uncommitted changes...');
      git('checkout', 'HEAD', '--', 'package.json', 'CHANGELOG.md', { allowEmpty: true });
    }

    // Remove tag if it was created
    if (version) {
      const tagName = `v${version}`;
      const tags = git('tag', '-l', tagName, { allowEmpty: true });
      if (tags) {
        console.log(`   Removing tag ${tagName}...`);
        git('tag', '-d', tagName, { allowEmpty: true });
      }
    }

    // Reset any commits (if HEAD moved)
    const lastCommitMsg = git('log', '-1', '--pretty=%s', { allowEmpty: true });
    if (lastCommitMsg && lastCommitMsg.includes('chore(release):')) {
      console.log('   Resetting release commit...');
      git('reset', '--hard', 'HEAD~1', { allowEmpty: false, retries: 2 });
    }

    console.log('✅ Rollback complete');
  } catch (error) {
    console.error('⚠️  Rollback failed:', error.message);
    console.error('   You may need to manually reset your repository:');
    console.error('   - git checkout HEAD -- package.json CHANGELOG.md');
    console.error('   - git tag -d v' + version);
    console.error('   - git reset --hard HEAD~1');
  }
}

/**
 * Main release function
 */
async function main() {
  console.log('🚀 Starting automated release process...\n');

  let newVersion = null;

  try {
    // 0. Verify we're in a git repository
    const isGitRepo = git('rev-parse', '--is-inside-work-tree', { allowEmpty: true });
    if (!isGitRepo) {
      throw new Error('Not in a git repository. Please run this script from the project root.');
    }

    // Check for uncommitted changes
    const status = git('status', '--porcelain', { allowEmpty: true });
    if (status) {
      console.log('⚠️  Warning: You have uncommitted changes:');
      console.log(status);
      console.log('\n   Consider committing or stashing them before running the release script.');
      console.log('   Continue anyway? (Changes to package.json and CHANGELOG.md will be overwritten)\n');
      // In automated environments, we'll continue. For interactive use, add a prompt here.
    }

    // 1. Get commits since last release
    console.log('📝 Detecting merged PRs and commits...');
    const commits = getCommitsSinceLastRelease();

    if (commits.length === 0) {
      console.log('ℹ️  No new commits since last release. Nothing to release.');
      return;
    }

    console.log(`   Found ${commits.length} commits`);

    // 2. Categorize commits
    console.log('\n📊 Categorizing commits...');
    const categories = categorizeCommits(commits);

    console.log(`   Breaking: ${categories.breaking.length}`);
    console.log(`   Features: ${categories.features.length}`);
    console.log(`   Fixes: ${categories.fixes.length}`);
    console.log(`   Other: ${countOtherChanges(categories)}`);

    // 3. Determine version bump
    console.log('\n🔢 Determining version bump...');
    const bumpType = determineVersionBump(categories);

    if (!bumpType) {
      console.log('ℹ️  No significant changes detected. Skipping release.');
      return;
    }

    console.log(`   Bump type: ${bumpType}`);

    // 4. Bump version
    console.log('\n📦 Bumping version in package.json...');
    newVersion = bumpVersion(bumpType);
    console.log(`   New version: ${newVersion}`);

    // 5. Update CHANGELOG
    console.log('\n📄 Updating CHANGELOG.md...');
    const changelogEntry = generateChangelogEntry(newVersion, categories);
    updateChangelog(changelogEntry);
    console.log('   ✅ CHANGELOG.md updated');

    // 6. Commit changes
    console.log('\n💾 Committing changes...');
    try {
      git('add', 'package.json', 'CHANGELOG.md', { allowEmpty: false, retries: 2 });
      // Validate version format before using in commit message
      if (!VERSION_REGEX.test(newVersion)) {
        throw new Error(`Invalid version format for commit: ${newVersion}`);
      }
      git('commit', '-m', `chore(release): ${newVersion}`, { allowEmpty: false, retries: 2 });
      console.log('   ✅ Changes committed');
    } catch (error) {
      throw new Error(`Failed to commit changes: ${error.message}\n` +
                      `   Ensure git is configured and you have permission to commit.`);
    }

    // 7. Create tag
    console.log('\n🏷️  Creating git tag...');
    const tagName = createGitTag(newVersion);

    // 8. Generate release notes
    console.log('\n📋 Generating release notes...');
    const releaseNotes = generateReleaseNotes(newVersion, categories);

    // Save release notes to a file for GitHub Actions to use
    try {
      writeFileSync('.release-notes.md', releaseNotes);
      console.log('   ✅ Release notes saved to .release-notes.md');
    } catch (error) {
      console.warn(`   ⚠️  Failed to save release notes: ${error.message}`);
      console.warn('   You can manually create the release notes from the changelog.');
    }

    console.log('\n✨ Release preparation complete!');
    console.log(`\nNext steps:`);
    console.log(`  1. Push changes: git push origin main`);
    console.log(`  2. Push tag: git push origin ${tagName}`);
    console.log(`  3. Create GitHub release with notes from .release-notes.md`);
    console.log(`\nOr let the CI workflow do it automatically! 🤖`);

  } catch (error) {
    console.error('\n❌ Release failed:', error.message || error);

    // Attempt rollback
    if (newVersion) {
      rollbackChanges(newVersion);
    }

    console.error('\n💡 Recovery suggestions:');
    console.error('   1. Check that you have a clean git working directory');
    console.error('   2. Ensure package.json exists and has a valid version field');
    console.error('   3. Verify you have write permissions for package.json and CHANGELOG.md');
    console.error('   4. Check that git is properly configured');

    throw error;
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Release failed:', error.stack || error.message || error);
  process.exit(1);
});
