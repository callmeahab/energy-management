import { NextResponse } from "next/server";
import { BALANCING_AUTHORITIES } from "@/lib/eia-balancing-authorities";

/**
 * Weather API Route Handler
 * 
 * This API endpoint fetches current weather data from OpenWeatherMap for all
 * US balancing authority centroids. The weather data is used to visualize
 * regional weather patterns on the energy efficiency map.
 * 
 * Data Sources:
 * - OpenWeatherMap API: Real-time weather data (temperature, humidity, wind, conditions)
 * - EIA Balancing Authorities: Geographic centroids for weather station positioning
 * 
 * Caching Strategy:
 * - In-memory cache with 5-minute TTL to reduce API calls and improve performance
 * - Cache key: "current" (single cache entry for all weather data)
 */

// Simple in-memory cache (per build/runtime instance)
// Stores weather data with timestamp to implement TTL-based cache invalidation
const cache: Record<string, { ts: number; data: WeatherPoint[] }> = {};
const TTL_MS = 5 * 60 * 1000; // 5 minutes - balance between data freshness and API rate limits

/**
 * WeatherPoint Interface
 * 
 * Defines the structure of weather data points used throughout the application.
 * Each point represents current weather conditions at a balancing authority centroid.
 * 
 * Properties correspond to OpenWeatherMap API response fields:
 * - main.temp -> temperature
 * - main.humidity -> humidity  
 * - wind.speed -> windSpeed
 * - weather[0].main -> conditions
 */
interface WeatherPoint {
  code: string;        // Balancing Authority identifier (e.g., "CAISO", "ERCOT", "PJM")
  name: string;        // Human-readable region name (e.g., "California ISO")
  latitude: number;    // Geographic latitude for map positioning
  longitude: number;   // Geographic longitude for map positioning
  temperature: number; // Current temperature in Celsius (converted from OpenWeatherMap)
  humidity?: number;   // Relative humidity percentage (0-100), optional field
  windSpeed?: number;  // Wind speed in meters per second, optional field
  conditions?: string; // Weather description ("Clear", "Clouds", "Rain", etc.), optional field
}

/**
 * GET /api/weather/current
 * 
 * Retrieves current weather data for all US balancing authority regions.
 * 
 * Response Format:
 * {
 *   success: boolean,
 *   data: WeatherPoint[],
 *   cached?: boolean  // Present if data served from cache
 * }
 * 
 * Error Handling:
 * - 400: Missing OpenWeather API key
 * - 500: API fetch failures or processing errors
 * 
 * Performance:
 * - Implements 5-minute caching to minimize OpenWeather API calls
 * - Fetches weather for ~40 balancing authority centroids in parallel
 * - Gracefully handles individual API failures (skips failed requests)
 */
export async function GET() {
  try {
    // Validate OpenWeather API key configuration
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Missing OPENWEATHER_API_KEY environment variable" },
        { status: 400 }
      );
    }
    // Check cache validity - return cached data if within TTL window
    const now = Date.now();
    if (cache["current"] && now - cache["current"].ts < TTL_MS) {
      return NextResponse.json({
        success: true,
        data: cache["current"].data,
        cached: true,  // Indicates data served from cache for debugging
      });
    }

    // Fetch current weather data for each balancing authority centroid
    // Uses OpenWeatherMap's current weather endpoint with metric units
    const results: WeatherPoint[] = [];
    
    for (const ba of BALANCING_AUTHORITIES) {
      try {
        // Construct API URL with geographic coordinates and metric units (Celsius, m/s)
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${ba.latitude}&lon=${ba.longitude}&units=metric&appid=${apiKey}`;
        
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`Weather API failed for ${ba.code}: HTTP ${res.status}`);
          continue; // Skip failed requests but continue processing others
        }
        
        const json = await res.json();
        
        // Transform OpenWeatherMap response to our WeatherPoint structure
        results.push({
          code: ba.code,                           // Balancing Authority identifier
          name: ba.name,                           // Region display name
          latitude: ba.latitude,                   // Original coordinates from BA data
          longitude: ba.longitude,                 // Original coordinates from BA data
          temperature: json.main?.temp ?? 0,       // Current temperature (°C)
          humidity: json.main?.humidity,           // Relative humidity (%), optional
          windSpeed: json.wind?.speed,             // Wind speed (m/s), optional
          conditions: json.weather?.[0]?.main,     // Weather condition string, optional
        });
      } catch (error) {
        // Individual fetch failures shouldn't break the entire request
        console.warn(`Failed to fetch weather for ${ba.code}:`, error);
        continue;
      }
    }
    // Cache the results with current timestamp for future requests
    cache["current"] = { ts: now, data: results };
    
    return NextResponse.json({ 
      success: true, 
      data: results,
      // Include metadata for debugging/monitoring
      meta: {
        fetchedAt: new Date(now).toISOString(),
        stationCount: results.length,
        totalStations: BALANCING_AUTHORITIES.length
      }
    });
  } catch (error) {
    // Top-level error handling for unexpected failures
    console.error("Weather API route error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Internal server error while fetching weather data",
        // Include error type for debugging (don't expose sensitive details)
        type: error instanceof Error ? error.constructor.name : 'Unknown'
      },
      { status: 500 }
    );
  }
}
