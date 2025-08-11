import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { ensurePopulationDataExists } from '@/lib/data-initialization';

interface PopulationDataPoint {
  hexagon: string;
  population: number;
  lat: number;
  lng: number;
  childCount?: number;
  resolution?: number;
}

interface ProcessedDataset {
  metadata: {
    source: string;
    description: string;
    processed: string;
    totalFeatures: number;
    maxPopulation: number;
    minPopulation: number;
  };
  data: PopulationDataPoint[];
}

// Cache for processed datasets
const dataCache = new Map<string, { data: PopulationDataPoint[]; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export async function GET(request: NextRequest) {
  try {
    // Ensure data files exist before processing
    ensurePopulationDataExists();
    
    const { searchParams } = new URL(request.url);
    const resolution = searchParams.get('resolution') || 'US'; // US, r4, r6
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : null; // No default limit
    const bbox = searchParams.get('bbox'); // Format: "minLng,minLat,maxLng,maxLat"
    
    // Check cache first
    const cacheKey = resolution;
    const now = Date.now();
    const cached = dataCache.get(cacheKey);
    
    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
      const filteredData = filterData(cached.data, bbox, limit);
      return NextResponse.json({
        data: filteredData,
        count: filteredData.length,
        cached: true,
        source: resolution
      });
    }

    // Load data from processed JSON files
    const data = await loadProcessedData(resolution);
    
    // Cache the loaded data
    dataCache.set(cacheKey, { data, timestamp: now });

    const filteredData = filterData(data, bbox, limit);

    return NextResponse.json({
      data: filteredData,
      count: filteredData.length,
      cached: false,
      source: resolution
    });

  } catch (error) {
    console.error('Error loading population data:', error);
    return NextResponse.json(
      { error: 'Failed to load population data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function loadProcessedData(resolution: string): Promise<PopulationDataPoint[]> {
  const dataDir = path.join(process.cwd(), 'population-density-data');
  const processedDir = path.join(dataDir, 'processed');
  
  // Map resolution to processed JSON filename
  const fileMap = {
    'US': 'kontur_us.json',
    'r4': 'kontur_r4.json', 
    'r6': 'kontur_r6.json'
  };

  const filename = fileMap[resolution as keyof typeof fileMap] || fileMap.US;
  const filePath = path.join(processedDir, filename);

  // Check if processed file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`Processed data file not found: ${filename}. Please run 'npm run process-population-data' to generate the processed data files.`);
  }

  // Load the processed JSON data
  const jsonData = fs.readFileSync(filePath, 'utf8');
  const dataset: ProcessedDataset = JSON.parse(jsonData);
  
  console.log(`Loaded ${dataset.data.length} features from ${filename}`);
  return dataset.data;
}


function filterData(data: PopulationDataPoint[], bbox: string | null, limit: number | null): PopulationDataPoint[] {
  let filteredData = data;

  // Apply bounding box filter if provided
  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
    filteredData = data.filter(point => 
      point.lng >= minLng && point.lng <= maxLng &&
      point.lat >= minLat && point.lat <= maxLat
    );
  }

  // Sort by population (descending)
  filteredData = filteredData.sort((a, b) => b.population - a.population);
  
  // Apply limit only if specified
  if (limit && limit > 0) {
    filteredData = filteredData.slice(0, limit);
  }
  
  return filteredData;
}