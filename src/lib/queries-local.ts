// Local database queries for energy efficiency dashboard
// These queries fetch data from the local DuckDB instead of the remote GraphQL API

export interface LocalEnergyData {
  period: string;
  avg_consumption: number;
  total_consumption: number;
  avg_cost: number;
  total_cost: number;
  avg_efficiency: number;
  avg_temperature: number;
  avg_occupancy: number;
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

export interface SyncStatus {
  id: number;
  last_sync_timestamp: string;
  sync_type: string;
  status: string;
  records_synced: number;
  errors_count: number;
  error_message?: string;
  duration_ms: number;
  created_at: string;
}

// Fetch energy consumption data from local database
export async function fetchLocalEnergyData(
  timeRange: '1h' | '24h' | '7d' | '30d' = '24h',
  buildingId?: string,
  aggregation: 'hourly' | 'daily' | 'raw' = 'hourly'
): Promise<{ data: LocalEnergyData[]; summary: any } | null> {
  try {
    const params = new URLSearchParams({
      timeRange,
      aggregation,
    });
    
    if (buildingId) {
      params.append('buildingId', buildingId);
    }
    
    const response = await fetch(`/api/energy?${params.toString()}`);
    
    if (!response.ok) {
      console.error('Failed to fetch local energy data:', response.statusText);
      return null;
    }
    
    const result = await response.json();
    
    if (!result.success) {
      console.error('Local energy data fetch error:', result.error);
      return null;
    }
    
    return {
      data: result.data.energyData,
      summary: result.data.summary
    };
  } catch (error) {
    console.error('Error fetching local energy data:', error);
    return null;
  }
}

// Fetch buildings data from local database
export async function fetchLocalBuildings(includeStats = true): Promise<LocalBuildingData[] | null> {
  try {
    const params = new URLSearchParams();
    if (includeStats) {
      params.append('includeStats', 'true');
    }
    
    const response = await fetch(`/api/buildings?${params.toString()}`);
    
    if (!response.ok) {
      console.error('Failed to fetch local buildings data:', response.statusText);
      return null;
    }
    
    const result = await response.json();
    
    if (!result.success) {
      console.error('Local buildings data fetch error:', result.error);
      return null;
    }
    
    return result.data.buildings;
  } catch (error) {
    console.error('Error fetching local buildings data:', error);
    return null;
  }
}

// Fetch specific building with details
export async function fetchLocalBuilding(buildingId: string): Promise<LocalBuildingData | null> {
  try {
    const response = await fetch(`/api/buildings?id=${buildingId}&includeStats=true`);
    
    if (!response.ok) {
      console.error('Failed to fetch local building data:', response.statusText);
      return null;
    }
    
    const result = await response.json();
    
    if (!result.success) {
      console.error('Local building data fetch error:', result.error);
      return null;  
    }
    
    return result.data.building;
  } catch (error) {
    console.error('Error fetching local building data:', error);
    return null;
  }
}

// Trigger data synchronization
export async function triggerSync(syncType: 'full' | 'incremental' = 'incremental'): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    console.log(`Triggering ${syncType} synchronization...`);
    
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ syncType }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        message: result.error || 'Synchronization failed',
        data: result
      };
    }
    
    return result;
  } catch (error) {
    console.error('Error triggering sync:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown sync error'
    };
  }
}

// Get synchronization status and history
export async function fetchSyncStatus(): Promise<{ syncHistory: SyncStatus[]; databaseStats: any; lastSync: SyncStatus | null } | null> {
  try {
    const response = await fetch('/api/sync');
    
    if (!response.ok) {
      console.error('Failed to fetch sync status:', response.statusText);
      return null;
    }
    
    const result = await response.json();
    
    if (!result.success) {
      console.error('Sync status fetch error:', result.error);
      return null;
    }
    
    return result.data;
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return null;
  }
}

// Transform local building data to Property format for existing components
export function transformBuildingToProperty(building: LocalBuildingData): any {
  const addressString = [
    building.address_street,
    building.address_city,
    building.address_state,
    building.address_country
  ].filter(Boolean).join(', ') || 'Unknown Address';

  // Calculate energy rating based on efficiency
  const efficiency = building.energyStats?.avg_efficiency || 75;
  const energyRating = efficiency > 90 ? 'A+' : efficiency > 80 ? 'A' : efficiency > 70 ? 'B+' : 'B';

  return {
    id: building.id,
    name: building.name || `Building ${building.id.substring(0, 8)}`,
    address: addressString,
    type: building.exact_type || 'Building',
    energyRating,
    coordinates: {
      lat: building.latitude || 40.7128,
      lng: building.longitude || -74.0060
    },
    energyMetrics: {
      consumption: Math.round(building.energyStats?.total_consumption || 0),
      cost: Math.round(building.energyStats?.total_cost || 0),
      efficiency: Math.round(efficiency),
      lastUpdated: building.energyStats?.latest_record || building.sync_timestamp
    },
    buildingInfo: {
      floors: building.floors_count,
      rooms: building.spaces_count,
      area: Math.floor((building.spaces_count * 200 + building.floors_count * 1000)),
      yearBuilt: 2015 + Math.floor(Math.random() * 8) // Mock year built
    }
  };
}

// Generate chart data from local energy data
export function transformEnergyDataForCharts(energyData: LocalEnergyData[]): any[] {
  return energyData.map((item, index) => {
    const date = new Date(item.period);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    
    return {
      day: dayName,
      energyCost: Math.round(item.total_cost || item.avg_cost || 0),
      renewableEnergyCost: Math.round((item.total_cost || item.avg_cost || 0) * 0.7),
      savings: Math.round((item.total_cost || item.avg_cost || 0) * 0.15),
      consumption: Math.round(item.total_consumption || item.avg_consumption || 0)
    };
  }).reverse(); // Reverse to show chronological order
}