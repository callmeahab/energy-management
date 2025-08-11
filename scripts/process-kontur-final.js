#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { cellToLatLng, cellToParent, getResolution } = require('h3-js');

const PROJECT_ROOT = path.dirname(__dirname);
const DATA_DIR = path.join(PROJECT_ROOT, 'population-density-data');
const OUTPUT_DIR = path.join(DATA_DIR, 'processed');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function createH3Clusters(hexagons, outputName) {
    // Determine target cluster resolution based on dataset
    let targetResolution;
    if (outputName.includes('us')) {
        targetResolution = 4; // Lower resolution for US-wide view
    } else if (outputName.includes('r4')) {
        targetResolution = 3; // Even lower for global R4
    } else if (outputName.includes('r6')) {
        targetResolution = 5; // Higher resolution for R6
    } else {
        targetResolution = 4; // Default
    }
    
    console.log(`🎯 Clustering to H3 resolution ${targetResolution}`);
    
    // Group hexagons by their parent cluster
    const clusterMap = new Map();
    
    hexagons.forEach(hex => {
        try {
            const currentRes = getResolution(hex.hexagon);
            let clusterHex;
            
            if (currentRes <= targetResolution) {
                // If already at or below target resolution, use as-is
                clusterHex = hex.hexagon;
            } else {
                // Aggregate to parent resolution
                clusterHex = cellToParent(hex.hexagon, targetResolution);
            }
            
            if (!clusterMap.has(clusterHex)) {
                clusterMap.set(clusterHex, {
                    hexagon: clusterHex,
                    population: 0,
                    childCount: 0,
                    totalLat: 0,
                    totalLng: 0
                });
            }
            
            const cluster = clusterMap.get(clusterHex);
            cluster.population += hex.population;
            cluster.childCount += 1;
            cluster.totalLat += hex.lat;
            cluster.totalLng += hex.lng;
            
        } catch (error) {
            // Skip invalid hexagons
        }
    });
    
    // Convert clusters to final format
    const clusters = Array.from(clusterMap.values()).map(cluster => {
        try {
            // Use cluster center coordinates
            const [clusterLat, clusterLng] = cellToLatLng(cluster.hexagon);
            
            return {
                hexagon: cluster.hexagon,
                population: cluster.population,
                lat: clusterLat,
                lng: clusterLng,
                childCount: cluster.childCount,
                resolution: targetResolution
            };
        } catch (error) {
            return null;
        }
    }).filter(c => c !== null);
    
    // Sort by population density
    clusters.sort((a, b) => b.population - a.population);
    
    console.log(`📊 Created ${clusters.length} clusters from ${hexagons.length} hexagons`);
    console.log(`🎯 Target resolution: ${targetResolution}`);
    if (clusters.length > 0) {
        console.log(`📈 Largest cluster: ${clusters[0].population.toLocaleString()} people`);
        console.log(`📉 Smallest cluster: ${clusters[clusters.length - 1].population.toLocaleString()} people`);
    }
    
    return clusters;
}

console.log('🚀 Processing Kontur population data with H3 clustering...');
console.log(`📁 Data: ${DATA_DIR}`);
console.log(`📁 Output: ${OUTPUT_DIR}`);

async function processDataset(config) {
    const { input, output, description } = config;
    const inputPath = path.join(DATA_DIR, input);
    const outputPath = path.join(OUTPUT_DIR, output);
    
    console.log(`\n📦 Processing ${description}...`);
    
    if (!fs.existsSync(inputPath)) {
        console.log(`⚠️  Input not found: ${input}`);
        return false;
    }
    
    // Check if output is up to date
    if (fs.existsSync(outputPath)) {
        const inputStat = fs.statSync(inputPath);
        const outputStat = fs.statSync(outputPath);
        if (outputStat.mtime > inputStat.mtime) {
            console.log(`✅ ${output} is up to date`);
            return true;
        }
    }
    
    const tempGpkg = `/tmp/kontur_${Date.now()}.gpkg`;
    const tempCsv = `/tmp/kontur_${Date.now()}.csv`;
    
    try {
        // Decompress
        console.log('🔓 Decompressing...');
        execSync(`gunzip -c "${inputPath}" > "${tempGpkg}"`);
        
        // Extract to CSV - process ALL data for complete coverage
        console.log('🌎 Extracting ALL data for complete coverage...');
        execSync(`ogr2ogr -f CSV -select "h3,population" -where "population > 0" "${tempCsv}" "${tempGpkg}" population`);
        
        // Process CSV and create clusters
        console.log('🔧 Processing records and creating clusters...');
        const csvData = fs.readFileSync(tempCsv, 'utf8');
        const lines = csvData.trim().split('\n');
        
        // First pass: collect all valid hexagons
        const hexagons = [];
        let validCount = 0;
        let invalidCount = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const [h3Index, populationStr] = lines[i].split(',');
            const population = parseInt(populationStr) || 0;
            
            if (!h3Index || population <= 0) {
                invalidCount++;
                continue;
            }
            
            try {
                const [lat, lng] = cellToLatLng(h3Index);
                hexagons.push({
                    hexagon: h3Index,
                    population: population,
                    lat: lat,
                    lng: lng
                });
                validCount++;
            } catch (error) {
                invalidCount++;
                if (invalidCount < 10) {
                    console.warn(`Invalid H3: ${h3Index}`);
                }
            }
        }
        
        console.log(`📊 Valid hexagons: ${validCount}, Invalid: ${invalidCount}`);
        
        // Create clusters at different resolutions
        console.log('🎯 Creating H3 clusters...');
        const clusters = createH3Clusters(hexagons, output);
        
        const processed = clusters;
        
        console.log(`✅ Processed: ${validCount} valid, ${invalidCount} invalid`);
        if (processed.length > 0) {
            console.log(`📈 Range: ${processed[0].population.toLocaleString()} - ${processed[processed.length-1].population.toLocaleString()}`);
        }
        
        // Save result
        const result = {
            metadata: {
                source: input,
                description: description,
                processed: new Date().toISOString(),
                totalFeatures: validCount,
                maxPopulation: processed[0]?.population || 0,
                minPopulation: processed[processed.length - 1]?.population || 0
            },
            data: processed
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`💾 Saved ${validCount} features to ${output}`);
        
        return true;
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return false;
    } finally {
        // Cleanup
        [tempGpkg, tempCsv].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    }
}

async function main() {
    const datasets = [
        {
            input: 'kontur_population_US_20231101.gpkg.gz',
            output: 'kontur_us.json',
            description: 'Complete US Dataset (Full Coverage)'
        },
        {
            input: 'kontur_population_20231101_r4.gpkg.gz',
            output: 'kontur_r4.json',
            description: 'Complete R4 Global Dataset'
        },
        {
            input: 'kontur_population_20231101_r6.gpkg.gz',
            output: 'kontur_r6.json', 
            description: 'Complete R6 Global Dataset'
        }
    ];
    
    let successCount = 0;
    
    for (const dataset of datasets) {
        try {
            if (await processDataset(dataset)) {
                successCount++;
            }
        } catch (error) {
            console.error(`❌ Failed ${dataset.input}: ${error.message}`);
        }
    }
    
    console.log(`\n🎉 Completed: ${successCount}/${datasets.length} successful`);
    
    // Summary
    console.log('\n📊 Results:');
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
    files.forEach(file => {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf8'));
            const size = Math.round(fs.statSync(path.join(OUTPUT_DIR, file)).size / 1024);
            console.log(`  📄 ${file}: ${data.data.length} features (${size} KB)`);
        } catch (e) {
            console.log(`  📄 ${file}: Error reading file`);
        }
    });
}

main().catch(console.error);