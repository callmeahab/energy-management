// Centralized map-related type definitions to reduce component size.
import { Property } from "@/types/energy";

export interface PopulationCluster {
  hexagon: string;
  population: number;
  lat: number;
  lng: number;
  childCount?: number;
  resolution?: number;
}

export interface EiaMixPoint {
  code: string;
  share: number;
  latitude?: number;
  longitude?: number;
  name: string;
  period: string;
}

export interface WeatherPoint {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  temperature: number; // Celsius
  humidity?: number;
  windSpeed?: number;
  conditions?: string;
}

export interface LayerConfigProperties {
  enabled: boolean;
  data: Property[];
  variant: string; // future variants for properties
}

export interface LayerConfigPopulation {
  enabled: boolean;
  data: PopulationCluster[];
  loading: boolean;
  error: string | null;
  source: string; // kontur | census
  variant: string; // h3 | h3-3d
  loaded: boolean;
}

export interface LayerConfigEia {
  enabled: boolean;
  data: EiaMixPoint[];
  loading: boolean;
  error: string | null;
  granularity: "hour" | "day";
  loaded: boolean;
}

export interface LayerConfigWeather {
  enabled: boolean;
  data: WeatherPoint[];
  loading: boolean;
  error: string | null;
  variant: "temperature" | "wind";
  loaded: boolean;
}

export interface LayerState {
  properties: LayerConfigProperties;
  population: LayerConfigPopulation;
  eiaMix: LayerConfigEia;
  weather: LayerConfigWeather;
}

export type { Property };
