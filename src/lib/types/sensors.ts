// Types for sensor data based on GraphQL query structure

export interface SensorValue {
  float64Value?: number;
  float32Value?: number;
  stringValue?: string | null;
  boolValue?: boolean;
}

export interface SensorUnit {
  name: string;
}

export interface SensorSeries {
  timestamp: string;
  value: SensorValue;
}

export interface SensorPoint {
  id: string;
  name: string;
  description?: string | null;
  exactType: string;
  unit: SensorUnit;
  series: SensorSeries[];
}

export interface BuildingSpace {
  id: string;
  name: string;
  points: SensorPoint[];
  geoshape?: any; // GeoJSON shape data
}

export interface BuildingFloor {
  id: string;
  name: string;
  points: SensorPoint[];
  spaces: BuildingSpace[];
}

export interface Building {
  id: string;
  name: string;
  points: SensorPoint[];
  floors: BuildingFloor[];
}

export interface EnergyPointsResponse {
  data: {
    buildings: Building[];
  };
}

// Database entity types
export interface PointEntity {
  id: string;
  building_id?: string;
  floor_id?: string;
  space_id?: string;
  name: string;
  description?: string | null;
  exact_type: string;
  unit_name: string;
  sync_timestamp: string;
}

export interface PointSeriesEntity {
  id: string;
  point_id: string;
  timestamp: string;
  float64_value?: number | null;
  float32_value?: number | null;
  string_value?: string | null;
  bool_value?: boolean | null;
  sync_timestamp: string;
}

export interface EnergyConsumptionEntity {
  id: string;
  building_id: string;
  floor_id?: string | null;
  space_id?: string | null;
  timestamp: string;
  total_watts: number;
  total_kwh?: number | null;
  calculation_timestamp: string;
}

// Utility type for creating new database records
export type CreatePointEntity = Omit<PointEntity, 'sync_timestamp'>;
export type CreatePointSeriesEntity = Omit<PointSeriesEntity, 'sync_timestamp'>;
export type CreateEnergyConsumptionEntity = Omit<EnergyConsumptionEntity, 'calculation_timestamp'>;