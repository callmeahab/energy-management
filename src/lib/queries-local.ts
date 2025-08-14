// Local database queries for energy efficiency dashboard
// These queries fetch data from the local SQLite database instead of the remote GraphQL API
import { formatCost, formatKWh } from "./number-format";

export interface LocalEnergyData {
  period: string;
  avg_consumption: number;
  total_consumption: number;
  avg_cost: number;
  total_cost: number;
  avg_efficiency: number;
  // avg_temperature: number; // Removed
  // avg_occupancy: number; // Removed
  record_count: number;
}

export interface LocalBuildingData {
  id: string;
  name: string;
  description?: string;
  exact_type?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_country?: string;
  latitude?: number;
  longitude?: number;
  floors_count: number;
  spaces_count: number;
  sync_timestamp: string;
  energyStats?: {
    avg_consumption: number;
    total_consumption: number;
    avg_cost: number;
    total_cost: number;
    avg_efficiency: number;
    record_count: number;
    latest_record: string;
  };
}

// Fetch energy consumption data from local database
export interface LocalEnergySummary {
  total_records?: number;
  avg_consumption?: number;
  total_consumption?: number;
  avg_cost?: number;
  total_cost?: number;
  avg_efficiency?: number;
  earliest_record?: string;
  latest_record?: string;
  [k: string]: unknown; // allow enrichment fields (renewable, etc.)
}

export async function fetchLocalEnergyData(
  timeRange: "1h" | "24h" | "7d" | "30d" = "24h",
  buildingId?: string,
  aggregation: "hourly" | "daily" | "raw" = "hourly"
): Promise<{ data: LocalEnergyData[]; summary: LocalEnergySummary } | null> {
  try {
    const params = new URLSearchParams({
      timeRange,
      aggregation,
    });

    if (buildingId) {
      params.append("buildingId", buildingId);
    }

    const response = await fetch(`/api/energy?${params.toString()}`);

    if (!response.ok) {
      console.error("Failed to fetch local energy data:", response.statusText);
      return null;
    }

    const result = await response.json();

    if (!result.success) {
      console.error("Local energy data fetch error:", result.error);
      return null;
    }

    return {
      data: result.data.energyData,
      summary: result.data.summary,
    };
  } catch (error) {
    console.error("Error fetching local energy data:", error);
    return null;
  }
}

// Fetch buildings data from local database
export async function fetchLocalBuildings(
  includeStats = true
): Promise<LocalBuildingData[] | null> {
  try {
    const params = new URLSearchParams();
    if (includeStats) {
      params.append("includeStats", "true");
    }

    const response = await fetch(`/api/buildings?${params.toString()}`);

    if (!response.ok) {
      console.error(
        "Failed to fetch local buildings data:",
        response.statusText
      );
      return null;
    }

    const result = await response.json();

    if (!result.success) {
      console.error("Local buildings data fetch error:", result.error);
      return null;
    }

    return result.data.buildings;
  } catch (error) {
    console.error("Error fetching local buildings data:", error);
    return null;
  }
}

// Fetch specific building with details
export async function fetchLocalBuilding(
  buildingId: string
): Promise<LocalBuildingData | null> {
  try {
    const response = await fetch(
      `/api/buildings?id=${buildingId}&includeStats=true`
    );

    if (!response.ok) {
      console.error(
        "Failed to fetch local building data:",
        response.statusText
      );
      return null;
    }

    const result = await response.json();

    if (!result.success) {
      console.error("Local building data fetch error:", result.error);
      return null;
    }

    return result.data.building;
  } catch (error) {
    console.error("Error fetching local building data:", error);
    return null;
  }
}

// Transform local building data to Property format for existing components
export interface TransformedProperty {
  id: string;
  name: string;
  address: string;
  type: string;
  energyRating: string;
  coordinates: { lat: number; lng: number };
  energyMetrics: {
    consumption: number;
    cost: number;
    efficiency: number;
    lastUpdated: string;
  };
  buildingInfo: {
    floors: number;
    rooms: number;
    area: number;
    yearBuilt: number;
  };
}

export function transformBuildingToProperty(
  building: LocalBuildingData
): TransformedProperty {
  const addressString =
    [
      building.address_street,
      building.address_city,
      building.address_state,
      building.address_country,
    ]
      .filter(Boolean)
      .join(", ") || "Unknown Address";

  // Calculate energy rating based on efficiency
  const efficiency = building.energyStats?.avg_efficiency || 75;
  const energyRating =
    efficiency > 90
      ? "A+"
      : efficiency > 80
      ? "A"
      : efficiency > 70
      ? "B+"
      : "B";

  return {
    id: building.id,
    name: building.name || `Building ${building.id.substring(0, 8)}`,
    address: addressString,
    type: building.exact_type || "Building",
    energyRating,
    coordinates: {
      lat: building.latitude || 40.7128,
      lng: building.longitude || -74.006,
    },
    energyMetrics: {
      consumption: formatKWh(building.energyStats?.total_consumption || 0),
      cost: formatCost(building.energyStats?.total_cost || 0),
      efficiency: Math.round(efficiency),
      lastUpdated:
        building.energyStats?.latest_record || building.sync_timestamp,
    },
    buildingInfo: {
      floors: building.floors_count,
      rooms: building.spaces_count,
      area: Math.floor(
        building.spaces_count * 200 + building.floors_count * 1000
      ),
      yearBuilt: 2015 + Math.floor(Math.random() * 8), // Mock year built
    },
  };
}

// Generate chart data from local energy data
export interface EnergyChartPoint {
  day: string;
  energyCost: number;
  renewableEnergyCost: number;
  savings: number;
  consumption: number;
}

export function transformEnergyDataForCharts(
  energyData: LocalEnergyData[]
): EnergyChartPoint[] {
  return energyData
    .map((item) => {
      const date = new Date(item.period);
      const dayName = date.toLocaleDateString("en-US", { weekday: "short" });

      return {
        day: dayName,
        energyCost: formatCost(item.total_cost || item.avg_cost || 0),
        renewableEnergyCost: formatCost(
          (item.total_cost || item.avg_cost || 0) * 0.7
        ),
        savings: formatCost((item.total_cost || item.avg_cost || 0) * 0.15),
        consumption: formatKWh(
          item.total_consumption || item.avg_consumption || 0
        ),
      };
    })
    .reverse(); // Reverse to show chronological order
}
