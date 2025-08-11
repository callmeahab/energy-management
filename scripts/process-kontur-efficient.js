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

console.log('🚀 Starting efficient Kontur data processing...');

async function processDatasetEfficient(inputFile, outputFile, description, limit = 10000) {
    const inputPath = path.join(DATA_DIR, inputFile);
    const outputPath = path.join(OUTPUT_DIR, outputFile);
    
    console.log(`\n📦 Processing ${description}...`);
    
    if (!fs.existsSync(inputPath)) {
        console.log(`⚠️  Input file not found: ${inputFile}`);
        return false;
    }
    
    // Check if output exists and is newer
    if (fs.existsSync(outputPath)) {
        const inputStat = fs.statSync(inputPath);
        const outputStat = fs.statSync(outputPath);
        if (outputStat.mtime > inputStat.mtime) {
            console.log(`✅ ${outputFile} is up to date`);
            return true;
        }
    }
    
    const tempCsv = `/tmp/kontur_${Date.now()}.csv`;
    
    try {
        console.log('📊 Extracting data directly to CSV...');
        
        // Use ogr2ogr to extract data directly from compressed GPKG to CSV
        const ogr2ogr = spawn('ogr2ogr', [
            '-f', 'CSV',
            '-select', 'h3,population',
            '-where', 'population > 10', // Filter out very low population areas
            '-limit', limit.toString(),
            tempCsv,
            `/vsizip/${inputPath}`, // Use GDAL virtual file system for zip/gzip
            'population'
        ]);
        
        await new Promise((resolve, reject) => {
            ogr2ogr.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`ogr2ogr failed with code ${code}`));
                }
            });
            
            ogr2ogr.on('error', reject);
        });
        
        console.log('🔧 Processing CSV data...');
        
        const csvData = fs.readFileSync(tempCsv, 'utf8');
        const lines = csvData.trim().split('\n');
        
        console.log(`📊 Processing ${lines.length - 1} records...`);
        
        const processed = [];
        let validCount = 0;
        let invalidCount = 0;
        
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const [h3Index, populationStr] = line.split(',');
            const population = parseInt(populationStr) || 0;
            
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
                
                if (validCount % 5000 === 0) {
                    console.log(`  ⏳ Processed ${validCount} records...`);
                }
            } catch (error) {
                invalidCount++;
            }
        }
        
        // Sort by population descending
        processed.sort((a, b) => b.population - a.population);
        
        console.log(`✅ Successfully processed ${validCount} records`);
        console.log(`❌ Skipped ${invalidCount} invalid records`);
        
        if (processed.length > 0) {
            console.log(`📈 Highest population: ${processed[0].population.toLocaleString()}`);
            console.log(`📉 Lowest population: ${processed[processed.length - 1].population.toLocaleString()}`);
        }
        
        // Create output
        const result = {
            metadata: {
                source: inputFile,
                description: description,
                processed: new Date().toISOString(),
                totalFeatures: validCount,
                invalidFeatures: invalidCount,
                maxPopulation: processed[0]?.population || 0,
                minPopulation: processed[processed.length - 1]?.population || 0
            },
            data: processed
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`💾 Saved to ${outputFile}`);
        
        return true;
        
    } catch (error) {
        console.error(`❌ Error processing ${inputFile}:`, error.message);
        return false;
    } finally {
        if (fs.existsSync(tempCsv)) {
            fs.unlinkSync(tempCsv);
        }
    }
}

async function main() {
    const datasets = [
        {
            input: 'kontur_population_20231101_r4.gpkg.gz',
            output: 'kontur_r4.json',
            description: 'R4 resolution (lower detail)',
            limit: 20000
        },  
        {
            input: 'kontur_population_20231101_r6.gpkg.gz', 
            output: 'kontur_r6.json',
            description: 'R6 resolution (higher detail)',
            limit: 15000
        },
        {
            input: 'kontur_population_US_20231101.gpkg.gz',
            output: 'kontur_us.json', 
            description: 'US-wide dataset',
            limit: 25000
        }
    ];
    
    let successCount = 0;
    
    for (const dataset of datasets) {
        try {
            const success = await processDatasetEfficient(
                dataset.input, 
                dataset.output, 
                dataset.description, 
                dataset.limit
            );
            if (success) successCount++;
        } catch (error) {
            console.error(`❌ Failed processing ${dataset.input}:`, error.message);
        }
    }
    
    console.log(`\n🎉 Processing completed: ${successCount}/${datasets.length} successful`);
    
    // Show results
    console.log('\n📊 Generated files:');
    try {
        const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
        files.forEach(file => {
            const filePath = path.join(OUTPUT_DIR, file);
            const stat = fs.statSync(filePath);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`  📄 ${file}: ${data.data.length} features (${Math.round(stat.size/1024)} KB)`);
        });
    } catch (error) {
        console.error('Error reading output directory:', error.message);
    }
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});