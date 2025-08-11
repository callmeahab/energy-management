#!/bin/bash

# Script to process Kontur population GPKG files into H3 JSON format
# This script decompresses GPKG files, extracts data, and converts to optimized JSON

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/population-density-data"
OUTPUT_DIR="$DATA_DIR/processed"

echo "🚀 Starting population data processing..."
echo "Data directory: $DATA_DIR"
echo "Output directory: $OUTPUT_DIR"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Function to process a single GPKG file
process_gpkg() {
    local input_file="$1"
    local output_name="$2"
    local max_records="$3"
    
    echo "📦 Processing $input_file..."
    
    # Check if output already exists and is newer than input
    if [[ -f "$OUTPUT_DIR/${output_name}.json" && "$OUTPUT_DIR/${output_name}.json" -nt "$DATA_DIR/$input_file" ]]; then
        echo "✅ $output_name.json is up to date, skipping..."
        return 0
    fi
    
    # Create temporary file for decompressed GPKG
    local temp_gpkg="/tmp/$(basename "$input_file" .gz)"
    
    echo "🔓 Decompressing $input_file..."
    gunzip -c "$DATA_DIR/$input_file" > "$temp_gpkg"
    
    # Get layer information
    echo "📊 Examining GPKG structure..."
    ogrinfo "$temp_gpkg" | head -20
    
    # Get the layer name (usually the first layer)
    local layer_name=$(ogrinfo "$temp_gpkg" | grep -E "^[0-9]+:" | head -1 | sed 's/^[0-9]*: \(.*\) (.*/\1/')
    echo "🔍 Found layer: $layer_name"
    
    # Check if layer has H3 index and population fields
    echo "🔍 Checking layer schema..."
    ogrinfo "$temp_gpkg" "$layer_name" | head -30
    
    # Export to JSON format with field selection
    echo "📝 Converting to JSON format..."
    
    # Try different possible field names for H3 and population
    local h3_field=""
    local pop_field=""
    
    # Check for common H3 field names
    for field in "h3" "h3_index" "hex_id" "cell" "h3index"; do
        if ogrinfo "$temp_gpkg" "$layer_name" | grep -i "$field" > /dev/null; then
            h3_field="$field"
            break
        fi
    done
    
    # Check for common population field names
    for field in "population" "pop" "pop_count" "value" "pop_2023"; do
        if ogrinfo "$temp_gpkg" "$layer_name" | grep -i "$field" > /dev/null; then
            pop_field="$field"
            break
        fi
    done
    
    echo "🏷️  H3 field: $h3_field"
    echo "🏷️  Population field: $pop_field"
    
    if [[ -z "$h3_field" || -z "$pop_field" ]]; then
        echo "❌ Could not find required fields (H3 and population)"
        echo "Available fields:"
        ogrinfo "$temp_gpkg" "$layer_name" | grep -E "^\s+[A-Za-z_]"
        rm -f "$temp_gpkg"
        return 1
    fi
    
    # Convert to JSON with field selection and row limit
    local temp_json="/tmp/${output_name}_temp.json"
    
    # Use ogr2ogr to convert to GeoJSON first, then process
    echo "🔄 Converting GPKG to GeoJSON..."
    ogr2ogr -f "GeoJSON" \
        -select "$h3_field,$pop_field" \
        -where "$pop_field > 0" \
        -limit "$max_records" \
        "$temp_json" \
        "$temp_gpkg" \
        "$layer_name"
    
    # Process the GeoJSON to extract just the properties we need
    echo "🔧 Processing JSON data..."
    node -e "
        const fs = require('fs');
        const { cellToLatLng } = require('h3-js');
        
        const geojson = JSON.parse(fs.readFileSync('$temp_json', 'utf8'));
        console.log('📊 Original features:', geojson.features.length);
        
        const processed = geojson.features
            .filter(feature => feature.properties && feature.properties.$h3_field && feature.properties.$pop_field)
            .map(feature => {
                const h3Index = feature.properties.$h3_field;
                const population = parseInt(feature.properties.$pop_field) || 0;
                
                try {
                    const [lat, lng] = cellToLatLng(h3Index);
                    return {
                        hexagon: h3Index,
                        population: population,
                        lat: lat,
                        lng: lng
                    };
                } catch (error) {
                    console.warn('Invalid H3 index:', h3Index);
                    return null;
                }
            })
            .filter(item => item !== null)
            .sort((a, b) => b.population - a.population); // Sort by population descending
        
        console.log('✅ Processed features:', processed.length);
        console.log('📈 Top population:', processed[0]?.population || 'N/A');
        console.log('📉 Min population:', processed[processed.length - 1]?.population || 'N/A');
        
        const output = {
            metadata: {
                source: '$input_file',
                processed: new Date().toISOString(),
                totalFeatures: processed.length,
                maxPopulation: processed[0]?.population || 0,
                minPopulation: processed[processed.length - 1]?.population || 0
            },
            data: processed
        };
        
        fs.writeFileSync('$OUTPUT_DIR/${output_name}.json', JSON.stringify(output, null, 2));
        console.log('💾 Saved processed data to ${output_name}.json');
    "
    
    # Clean up temporary files
    rm -f "$temp_gpkg" "$temp_json"
    
    echo "✅ Completed processing $output_name"
}

# Process each GPKG file
echo "🔄 Processing Kontur population files..."

# Process US-wide data (limit to prevent memory issues)
if [[ -f "$DATA_DIR/kontur_population_US_20231101.gpkg.gz" ]]; then
    process_gpkg "kontur_population_US_20231101.gpkg.gz" "kontur_us" 50000
fi

# Process R4 resolution data
if [[ -f "$DATA_DIR/kontur_population_20231101_r4.gpkg.gz" ]]; then
    process_gpkg "kontur_population_20231101_r4.gpkg.gz" "kontur_r4" 100000
fi

# Process R6 resolution data
if [[ -f "$DATA_DIR/kontur_population_20231101_r6.gpkg.gz" ]]; then
    process_gpkg "kontur_population_20231101_r6.gpkg.gz" "kontur_r6" 200000
fi

echo "🎉 Population data processing completed!"
echo "📁 Processed files are in: $OUTPUT_DIR"
echo ""
echo "📊 Summary:"
for json_file in "$OUTPUT_DIR"/*.json; do
    if [[ -f "$json_file" ]]; then
        local count=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$json_file', 'utf8')).data.length)")
        echo "  - $(basename "$json_file"): $count features"
    fi
done