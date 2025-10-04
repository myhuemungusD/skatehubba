#!/usr/bin/env node

/**
 * SkateHubba Beta Setup Script
 * 
 * This script sets up the development environment for testing 
 * the beta features with all necessary dependencies.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🛹 SkateHubba Beta Setup Starting...\n');

// Check if we're in the right directory
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json not found. Please run this script from the skatehubba directory.');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageJson.name !== 'skatehubba') {
  console.error('❌ This doesn\'t appear to be the skatehubba project directory.');
  process.exit(1);
}

console.log('✅ Found skatehubba project directory');

// Function to run command and return promise
function runCommand(command, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 ${description}...`);
    const process = exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr && !stderr.includes('warning')) {
        console.error(`❌ Error: ${stderr}`);
        reject(new Error(stderr));
        return;
      }
      console.log(`✅ ${description} completed`);
      if (stdout.trim()) {
        console.log(stdout.trim());
      }
      resolve(stdout);
    });
  });
}

async function setupBetaFeatures() {
  try {
    // Install dependencies
    await runCommand('npm install', 'Installing dependencies');
    
    // Download custom fonts
    await runCommand('npm run setup', 'Setting up custom fonts');
    
    // Check Firebase configuration
    console.log('\n🔄 Checking Firebase configuration...');
    const firebaseConfigExists = fs.existsSync(path.join(process.cwd(), 'services', 'firebase.js'));
    if (firebaseConfigExists) {
      console.log('✅ Firebase configuration found');
    } else {
      console.log('⚠️  Firebase configuration not found - you\'ll need to set this up manually');
    }
    
    // Check for required environment files
    console.log('\n🔄 Checking environment setup...');
    const envFiles = ['.env', '.env.local', 'app.json'];
    envFiles.forEach(file => {
      if (fs.existsSync(path.join(process.cwd(), file))) {
        console.log(`✅ ${file} found`);
      } else {
        console.log(`⚠️  ${file} not found - may be needed for full functionality`);
      }
    });
    
    // Create beta test data directory if it doesn't exist
    const testDataDir = path.join(process.cwd(), 'beta-test-data');
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir);
      console.log('✅ Created beta test data directory');
    }
    
    // Run tests to validate setup
    console.log('\n🔄 Running tests to validate setup...');
    try {
      await runCommand('npm test -- --passWithNoTests', 'Running validation tests');
    } catch (error) {
      console.log('⚠️  Some tests failed, but setup can continue');
    }
    
    console.log('\n🎉 Beta Setup Complete!\n');
    console.log('📱 Beta Features Available:');
    console.log('   • Shop System with rare/standard gear');
    console.log('   • Currency & Progression (Hubba Bucks + XP)');
    console.log('   • Avatar System with equipment slots');
    console.log('   • Trading System with backend validation');
    console.log('   • Beta Dashboard with real-time data\n');
    
    console.log('🚀 To start testing:');
    console.log('   1. npm start');
    console.log('   2. Navigate to Beta Dashboard');
    console.log('   3. Use test buttons to award currency');
    console.log('   4. Test shop, avatar, and trading features\n');
    
    console.log('📖 See BETA_TESTING_GUIDE.md for detailed instructions');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.log('\n🔧 Manual setup may be required. Check:');
    console.log('   • Node.js and npm are installed');
    console.log('   • Firebase configuration is correct');
    console.log('   • All dependencies are compatible');
    process.exit(1);
  }
}

// Run the setup
setupBetaFeatures();
