import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🔧 Building server with esbuild...');

/**
 * Safely ensure directory exists
 */
function ensureDirectoryExists(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`   ✅ Created directory: ${path.relative(rootDir, dir)}`);
    }
    return true;
  } catch (error) {
    console.error(`❌ Failed to create directory: ${dir}`);
    console.error(`   ${error.message}`);
    throw new Error(`Directory creation failed: ${error.message}`);
  }
}

/**
 * Safely remove directory
 */
function removeDirectory(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`   ✅ Removed directory: ${path.relative(rootDir, dir)}`);
    }
    return true;
  } catch (error) {
    console.error(`⚠️  Warning: Failed to remove directory: ${dir}`);
    console.error(`   ${error.message}`);
    // Don't throw, just warn - this is not critical
    return false;
  }
}

/**
 * Safely copy directory
 */
function copyDirectory(src, dest) {
  try {
    if (!fs.existsSync(src)) {
      return false;
    }

    fs.cpSync(src, dest, { recursive: true });
    console.log(`   ✅ Copied ${path.relative(rootDir, src)} → ${path.relative(rootDir, dest)}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to copy directory: ${src} → ${dest}`);
    console.error(`   ${error.message}`);
    throw new Error(`Directory copy failed: ${error.message}`);
  }
}

// Ensure the output directory exists
const outputDir = path.join(rootDir, 'dist/server');
ensureDirectoryExists(outputDir);

// Copy the client build to server's public directory
const clientDir = path.join(rootDir, 'dist/public');
const serverPublicDir = path.join(outputDir, 'public');

console.log('📂 Copying client assets to server public directory...');

try {
  if (!fs.existsSync(clientDir)) {
    console.warn('⚠️  Client build not found at', path.relative(rootDir, clientDir));
    console.warn('   Run the client build first, or server will have no static assets.');
    console.warn('   Example: pnpm run build:client');
  } else {
    // Validate client directory is readable
    try {
      fs.accessSync(clientDir, fs.constants.R_OK);
    } catch (error) {
      throw new Error(`Cannot read client directory: ${clientDir}\n   ${error.message}`);
    }

    // Remove existing public directory
    removeDirectory(serverPublicDir);

    // Copy client build to server public
    copyDirectory(clientDir, serverPublicDir);
  }
} catch (error) {
  console.error('❌ Failed to copy client assets');
  console.error('   This may cause the server to fail serving static files.');
  throw error;
}

// ESBuild configuration for server bundling
const entryPoint = path.join(rootDir, 'server/index.ts');
const outfile = path.join(rootDir, 'dist/server/index.js');

// Validate entry point exists
console.log('\n🔍 Validating build configuration...');
try {
  if (!fs.existsSync(entryPoint)) {
    throw new Error(`Entry point not found: ${entryPoint}\n` +
                    `   Ensure the server source files exist at: ${path.relative(rootDir, path.dirname(entryPoint))}`);
  }

  // Validate entry point is readable
  fs.accessSync(entryPoint, fs.constants.R_OK);
  console.log(`   ✅ Entry point validated: ${path.relative(rootDir, entryPoint)}`);

  // Validate output directory is writable
  const outDir = path.dirname(outfile);
  ensureDirectoryExists(outDir);
  fs.accessSync(outDir, fs.constants.W_OK);
  console.log(`   ✅ Output directory writable: ${path.relative(rootDir, outDir)}`);
} catch (error) {
  console.error('❌ Build configuration validation failed');
  console.error(`   ${error.message}`);
  process.exit(1);
}

const config = {
  entryPoints: [entryPoint],
  bundle: true,
  platform: 'node',
  outfile,
  format: 'esm',
  packages: 'external',
  alias: {
    '@shared': path.resolve(rootDir, 'packages/shared'),
  },
  external: [
    '@neondatabase/serverless',
    'pg',
    'ws'
  ],
  target: 'node18',
  minify: false,
  sourcemap: true,
};

console.log('\n⚙️  Running esbuild...');
try {
  const result = await build(config);

  // Check for warnings
  if (result.warnings.length > 0) {
    console.warn(`\n⚠️  Build completed with ${result.warnings.length} warning(s):`);
    result.warnings.forEach(warning => {
      console.warn(`   ${warning.text}`);
      if (warning.location) {
        console.warn(`   at ${warning.location.file}:${warning.location.line}:${warning.location.column}`);
      }
    });
  }

  console.log('\n✅ Server built successfully');
  console.log(`   Output: ${path.relative(rootDir, outfile)}`);
  console.log(`   Sourcemap: ${path.relative(rootDir, outfile + '.map')}`);
} catch (error) {
  console.error('\n❌ Server build failed');
  console.error('═══════════════════════════════════════════════════════');
  console.error(`Entry point: ${path.relative(rootDir, entryPoint)}`);
  console.error(`Output file: ${path.relative(rootDir, outfile)}`);
  console.error('');

  if (error.errors && error.errors.length > 0) {
    console.error('Build errors:');
    error.errors.forEach(err => {
      console.error(`  • ${err.text}`);
      if (err.location) {
        console.error(`    at ${err.location.file}:${err.location.line}:${err.location.column}`);
      }
    });
  } else {
    console.error('Error:', error.message || error);
  }

  console.error('═══════════════════════════════════════════════════════');
  console.error('');
  console.error('💡 Recovery suggestions:');
  console.error('   1. Check for TypeScript compilation errors');
  console.error('   2. Ensure all dependencies are installed (pnpm install)');
  console.error('   3. Verify all imported modules exist');
  console.error('   4. Check for syntax errors in server code');
  console.error('');

  process.exit(1);
}

// ── Vercel API handler bundle ──────────────────────────────────────────────
// Bundle server/vercel-handler.ts → api/index.mjs with all @shared/* imports
// pre-resolved. Vercel picks up the .mjs file instead of raw TypeScript.
const vercelEntry = path.join(rootDir, 'server/vercel-handler.ts');
const vercelOut = path.join(rootDir, 'api/index.mjs');

if (fs.existsSync(vercelEntry)) {
  console.log('\n⚙️  Bundling Vercel API handler...');
  try {
    await build({
      entryPoints: [vercelEntry],
      bundle: true,
      platform: 'node',
      outfile: vercelOut,
      format: 'esm',
      packages: 'external',
      alias: {
        '@shared': path.resolve(rootDir, 'packages/shared'),
      },
      external: [
        '@neondatabase/serverless',
        'pg',
        'ws',
      ],
      target: 'node18',
      minify: false,
      sourcemap: true,
    });
    console.log(`   ✅ Vercel handler: ${path.relative(rootDir, vercelOut)}`);
  } catch (error) {
    console.error('❌ Vercel API handler build failed');
    if (error.errors) {
      error.errors.forEach(err => console.error(`  • ${err.text}`));
    } else {
      console.error('   ', error.message || error);
    }
    process.exit(1);
  }
} else {
  console.warn(`\n⚠️  Vercel handler source not found: ${path.relative(rootDir, vercelEntry)}`);
  console.warn('   Skipping Vercel API bundle.');
}