#!/usr/bin/env node

/**
 * Firebase Rules Verification Script
 * 
 * Validates Firestore and Storage rules against Firebase servers.
 * Requires FIREBASE_PROJECT_ID and FIREBASE_TOKEN environment variables.
 * 
 * Security: Token is masked in logs and only runs on protected branches.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Mask sensitive values in output
function maskToken(output, token) {
  if (!token) return output;
  return output.replace(new RegExp(token, 'g'), '***MASKED***');
}

async function verifyFirebaseRules() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const token = process.env.FIREBASE_TOKEN;

  // Validation
  if (!projectId) {
    console.error('❌ FIREBASE_PROJECT_ID environment variable is required');
    process.exit(1);
  }

  if (!token) {
    console.error('❌ FIREBASE_TOKEN environment variable is required');
    process.exit(1);
  }

  console.log(`🔍 Verifying Firebase rules for project: ${projectId}`);
  console.log('🔒 Token: ***MASKED***');

  // Check if rules files exist
  const firestoreRulesPath = join(projectRoot, 'firestore.rules');
  const storageRulesPath = join(projectRoot, 'storage.rules');

  if (!existsSync(firestoreRulesPath)) {
    console.warn('⚠️  firestore.rules not found, skipping Firestore validation');
  }

  if (!existsSync(storageRulesPath)) {
    console.warn('⚠️  storage.rules not found, skipping Storage validation');
  }

  let hasErrors = false;

  // Verify Firestore rules
  if (existsSync(firestoreRulesPath)) {
    try {
      console.log('\n📋 Validating Firestore rules...');
      const { stdout, stderr } = await execAsync(
        `firebase firestore:rules release --only firestore --project ${projectId} --token ${token} --dry-run`,
        { cwd: projectRoot, maxBuffer: 1024 * 1024 * 10 }
      );
      
      const maskedStdout = maskToken(stdout, token);
      const maskedStderr = maskToken(stderr, token);
      
      if (maskedStdout) console.log(maskedStdout);
      if (maskedStderr) console.error(maskedStderr);
      
      console.log('✅ Firestore rules are valid');
    } catch (error) {
      hasErrors = true;
      const maskedError = maskToken(error.message, token);
      console.error('❌ Firestore rules validation failed:');
      console.error(maskedError);
    }
  }

  // Verify Storage rules
  if (existsSync(storageRulesPath)) {
    try {
      console.log('\n📦 Validating Storage rules...');
      const { stdout, stderr } = await execAsync(
        `firebase storage:rules release --only storage --project ${projectId} --token ${token} --dry-run`,
        { cwd: projectRoot, maxBuffer: 1024 * 1024 * 10 }
      );
      
      const maskedStdout = maskToken(stdout, token);
      const maskedStderr = maskToken(stderr, token);
      
      if (maskedStdout) console.log(maskedStdout);
      if (maskedStderr) console.error(maskedStderr);
      
      console.log('✅ Storage rules are valid');
    } catch (error) {
      hasErrors = true;
      const maskedError = maskToken(error.message, token);
      console.error('❌ Storage rules validation failed:');
      console.error(maskedError);
    }
  }

  if (hasErrors) {
    console.error('\n❌ Firebase rules verification failed');
    process.exit(1);
  }

  console.log('\n✅ All Firebase rules are valid');
}

verifyFirebaseRules().catch((error) => {
  const token = process.env.FIREBASE_TOKEN;
  const maskedError = maskToken(error.message || error.toString(), token);
  console.error('❌ Unexpected error:', maskedError);
  process.exit(1);
});
