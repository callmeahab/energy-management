#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { cellToLatLng } = require('h3-js');

const PROJECT_ROOT = path.dirname(__dirname);
const DATA_DIR = path.join(PROJECT_ROOT, 'population-density-data');
const OUTPUT_DIR = path.join(DATA_DIR, 'processed');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🚀 Starting Kontur population data processing...');
console.log(`📁 Data directory: ${DATA_DIR}`);
console.log(`📁 Output directory: ${OUTPUT_DIR}`);

const datasets = [
    {
        input: 'kontur_population_US_20231101.gpkg.gz',
        output: 'kontur_us.json',
        description: 'US-wide population data',
        limit: 50000
    },
    {
        input: 'kontur_population_20231101_r4.gpkg.gz',
        output: 'kontur_r4.json',
        description: 'R4 resolution population data',
        limit: 100000
    },
    {
        input: 'kontur_population_20231101_r6.gpkg.gz',
        output: 'kontur_r6.json',
        description: 'R6 resolution population data',
        limit: 200000
    }
];

async function executeCommand(command, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { stdio: 'pipe' });
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        proc.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Command failed with code ${code}: ${stderr}`));
            }
        });
    });
}

async function processDataset(config) {
    const { input, output, description, limit } = config;
    const inputPath = path.join(DATA_DIR, input);
    const outputPath = path.join(OUTPUT_DIR, output);
    
    console.log(`\n📦 Processing ${description}...`);
    
    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
        console.log(`⚠️  Input file not found: ${input}`);
        return false;
    }
    
    // Check if output is newer than input
    if (fs.existsSync(outputPath)) {
        const inputStat = fs.statSync(inputPath);
        const outputStat = fs.statSync(outputPath);
        if (outputStat.mtime > inputStat.mtime) {
            console.log(`✅ ${output} is up to date, skipping...`);
            return true;
        }
    }
    
    const tempGpkg = `/tmp/kontur_${Date.now()}.gpkg`;
    const tempCsv = `/tmp/kontur_${Date.now()}.csv`;
    
    try {
        // Decompress GPKG
        console.log('🔓 Decompressing GPKG file...');
        await executeCommand('gunzip', ['-c', inputPath]).then(data => {
            fs.writeFileSync(tempGpkg, data, 'binary');
        });
        
        // Convert to CSV with population filter and limit
        console.log('📊 Converting to CSV...');
        await executeCommand('ogr2ogr', [
            '-f', 'CSV',
            '-select', 'h3,population',
            '-where', 'population > 0',
            '-limit', limit.toString(),
            '-lco', 'GEOMETRY=AS_WKT',
            tempCsv,
            tempGpkg,
            'population'
        ]);
        
        // Read and process CSV data
        console.log('🔧 Processing population data...');
        const csvData = fs.readFileSync(tempCsv, 'utf8');
        const lines = csvData.trim().split('\n');
        const header = lines[0].split(',');
        
        console.log(`📊 Found ${lines.length - 1} records`);
        
        const processed = [];
        let validCount = 0;
        let invalidCount = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const h3Index = values[0];
            const population = parseInt(values[1]) || 0;
            
            if (!h3Index || population <= 0) {
                invalidCount++;
                continue;
            }
            
            try {
                const [lat, lng] = cellToLatLng(h3Index);
                processed.push({
                    hexagon: h3Index,
                    population: population,
                    lat: lat,
                    lng: lng
                });
                validCount++;
            } catch (error) {
                invalidCount++;
                if (invalidCount < 10) {
                    console.warn(`⚠️  Invalid H3 index: ${h3Index}`);
                }
            }
        }
        
        // Sort by population (highest first)
        processed.sort((a, b) => b.population - a.population);
        
        console.log(`✅ Processed ${validCount} valid records`);
        console.log(`❌ Skipped ${invalidCount} invalid records`);
        console.log(`📈 Highest population: ${processed[0]?.population?.toLocaleString() || 'N/A'}`);
        console.log(`📉 Lowest population: ${processed[processed.length - 1]?.population?.toLocaleString() || 'N/A'}`);
        
        // Create output structure
        const result = {
            metadata: {
                source: input,
                description: description,
                processed: new Date().toISOString(),
                totalFeatures: validCount,
                invalidFeatures: invalidCount,
                maxPopulation: processed[0]?.population || 0,
                minPopulation: processed[processed.length - 1]?.population || 0,
                boundingBox: {
                    minLat: Math.min(...processed.map(p => p.lat)),
                    maxLat: Math.max(...processed.map(p => p.lat)),
                    minLng: Math.min(...processed.map(p => p.lng)),
                    maxLng: Math.max(...processed.map(p => p.lng))
                }
            },
            data: processed
        };
        
        // Write output file
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`💾 Saved ${validCount} features to ${output}`);
        
        return true;
        
    } catch (error) {
        console.error(`❌ Error processing ${input}:`, error.message);
        return false;
    } finally {
        // Clean up temporary files
        [tempGpkg, tempCsv].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    }
}

async function main() {
    let successCount = 0;
    
    for (const dataset of datasets) {
        try {
            const success = await processDataset(dataset);
            if (success) successCount++;
        } catch (error) {
            console.error(`❌ Failed to process ${dataset.input}:`, error.message);
        }
    }
    
    console.log(`\n🎉 Processing completed!`);
    console.log(`✅ Successfully processed ${successCount}/${datasets.length} datasets`);
    
    // List output files
    console.log('\n📁 Generated files:');
    try {
        const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
        files.forEach(file => {
            const filePath = path.join(OUTPUT_DIR, file);
            const stat = fs.statSync(filePath);
            const sizeKB = Math.round(stat.size / 1024);
            console.log(`  📄 ${file} (${sizeKB} KB)`);
        });
    } catch (error) {
        console.log('  No files found or error reading directory');
    }
}

// Run the main function
main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});