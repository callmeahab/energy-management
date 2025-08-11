#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.dirname(__dirname);
const DATA_DIR = path.join(PROJECT_ROOT, 'population-density-data');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

const requiredFiles = [
    'kontur_us.json',
    'kontur_r4.json', 
    'kontur_r6.json'
];

console.log('🔍 Checking for processed population data files...');

// Check if all processed files exist
const missingFiles = requiredFiles.filter(file => {
    const filePath = path.join(PROCESSED_DIR, file);
    return !fs.existsSync(filePath);
});

if (missingFiles.length === 0) {
    console.log('✅ All processed data files exist');
    process.exit(0);
}

console.log(`📦 Missing files: ${missingFiles.join(', ')}`);
console.log('🚀 Processing Kontur data at startup...');

try {
    // Run the processing script
    const processingScript = path.join(PROJECT_ROOT, 'scripts', 'process-kontur-final.js');
    
    console.log('⏳ Running data processing...');
    execSync(`node "${processingScript}"`, { 
        stdio: 'inherit',
        cwd: PROJECT_ROOT 
    });
    
    console.log('✅ Startup data processing completed successfully');
    
} catch (error) {
    console.error('❌ Failed to process data at startup:', error.message);
    console.log('⚠️  Application will continue but population data may not be available');
    process.exit(1);
}