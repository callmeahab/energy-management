export interface EnergyConsumption {
  id: string;
  timestamp: string;
  energyCost: number;
  renewableEnergyCost: number;
  totalConsumption: number;
  savings: number;
  period: string;
}

export interface SpaceEfficiency {
  id: string;
  name: string;
  utilizationPercentage: number;
  peakUsageHours: string;
  occupancyByRoom: {
    room: string;
    percentage: number;
  }[];
}

export interface EnergyUsageInefficiency {
  id: string;
  applianceSystem: string;
  consumption: number;
  issues: string;
  recommendations: string;
}

export interface CostTimeSavingEstimate {
  id: string;
  period: string;
  savings: number;
  consumption: number;
  timestamp: string;
}

export interface Alert {
  id: string;
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
  isRead: boolean;
}

export interface Room {
  id: string;
  name: string;
  temperature: number;
  area: number;
  coordinates: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}


export interface BuildingData {
  occupancy: number;
  peopleCount: number;
  floors: Floor[];
}

export type TimeRange = 'hour' | 'day' | 'week' | 'month';

// Types based on actual Mapped.com schema
export interface Address {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface Geolocation {
  latitude: number;
  longitude: number;
}

export interface Space {
  id: string;
  name?: string;
  description?: string;
  exactType?: string;
  dateCreated?: string;
  dateUpdated?: string;
}

export interface Floor {
  id: string;
  name?: string;
  description?: string;
  dateCreated?: string;
  dateUpdated?: string;
  spaces?: Space[];
}

export interface Building {
  id: string;
  name?: string;
  description?: string;
  exactType?: string;
  address?: Address;
  geolocation?: Geolocation;
  dateCreated?: string;
  dateUpdated?: string;
  floors?: Floor[];
}

export interface Site {
  id: string;
  name?: string;
  description?: string;
  address?: Address;
  geolocation?: Geolocation;
  dateCreated?: string;
  dateUpdated?: string;
  buildings?: Building[];
}

// Legacy types for backward compatibility and mock data
export interface Property {
  id: string;
  name: string;
  address: string;
  type: string;
  energyRating: string;
  coordinates: {
    lat: number;
    lng: number;
  };
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