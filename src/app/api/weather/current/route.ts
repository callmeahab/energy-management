import { NextResponse } from "next/server";
import { BALANCING_AUTHORITIES } from "@/lib/eia-balancing-authorities";

// Simple in-memory cache (per build/runtime instance)
const cache: Record<string, { ts: number; data: WeatherPoint[] }> = {};
const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface WeatherPoint {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  temperature: number; // C
  humidity?: number; // %
  windSpeed?: number; // m/s
  conditions?: string;
}

export async function GET() {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Missing OPENWEATHER_API_KEY" },
        { status: 400 }
      );
    }
    const now = Date.now();
    if (cache["current"] && now - cache["current"].ts < TTL_MS) {
      return NextResponse.json({
        success: true,
        data: cache["current"].data,
        cached: true,
      });
    }

    // Fetch weather for each BA centroid (One Call or current weather endpoint)
    const results: WeatherPoint[] = [];
    for (const ba of BALANCING_AUTHORITIES) {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${ba.latitude}&lon=${ba.longitude}&units=metric&appid=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      results.push({
        code: ba.code,
        name: ba.name,
        latitude: ba.latitude,
        longitude: ba.longitude,
        temperature: json.main?.temp ?? 0,
        humidity: json.main?.humidity,
        windSpeed: json.wind?.speed,
        conditions: json.weather?.[0]?.main,
      });
    }
    cache["current"] = { ts: now, data: results };
    return NextResponse.json({ success: true, data: results });
  } catch (e) {
    console.error("Weather API error", e);
    return NextResponse.json(
      { success: false, error: "Failed to fetch weather" },
      { status: 500 }
    );
  }
}
