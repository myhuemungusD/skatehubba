#!/usr/bin/env node

/**
 * Legacy artifact assembler - now a no-op.
 * Build outputs are emitted directly by packages to their own locations.
 */

console.log("ℹ️ Skipping dist validation — build outputs are emitted directly by packages.");
process.exit(0);
