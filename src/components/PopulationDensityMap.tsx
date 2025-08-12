"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Map, useControl } from "react-map-gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { DeckProps } from "@deck.gl/core";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import {
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Paper,
  Switch,
  FormControlLabel,
  Button,
  Popover,
  Divider,
} from "@mui/material";
import { Layers } from "@mui/icons-material";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_ACCESS_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "YOUR_MAPBOX_TOKEN_HERE";

interface PopulationCluster {
  hexagon: string;
  population: number;
  lat: number;
  lng: number;
  childCount?: number;
  resolution?: number;
}

interface Property {
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

interface PopulationDensityMapProps {
  properties?: Property[];
  selectedProperty?: Property | null;
  onPropertySelect?: (property: Property | null) => void;
}

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const PopulationDensityMap = ({
  properties = [],
  selectedProperty = null,
  onPropertySelect,
}: PopulationDensityMapProps) => {
  const [viewState, setViewState] = useState({
    longitude: -98.5795,
    latitude: 39.8283,
    zoom: 4,
    pitch: 0,
    bearing: 0,
  });

  // Layer management state
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchorEl);
  interface EiaMixPoint {
    code: string;
    share: number;
    latitude?: number;
    longitude?: number;
    name: string;
    period: string;
  }
  interface LayerConfigProperties {
    enabled: boolean;
    data: Property[];
    variant: string;
  }
  interface LayerConfigPopulation {
    enabled: boolean;
    data: PopulationCluster[];
    loading: boolean;
    error: string | null;
    source: string;
    variant: string;
    loaded: boolean;
  }
  interface LayerConfigEia {
    enabled: boolean;
    data: EiaMixPoint[];
    loading: boolean;
    error: string | null;
    granularity: "hour" | "day";
    loaded: boolean;
  }
  interface WeatherPoint {
    code: string;
    name: string;
    latitude: number;
    longitude: number;
    temperature: number; // C
    humidity?: number;
    windSpeed?: number;
    conditions?: string;
  }
  interface LayerConfigWeather {
    enabled: boolean;
    data: WeatherPoint[];
    loading: boolean;
    error: string | null;
    variant: "temperature" | "wind";
    loaded: boolean;
  }
  interface LayerState {
    properties: LayerConfigProperties;
    population: LayerConfigPopulation;
    eiaMix: LayerConfigEia;
    weather: LayerConfigWeather;
  }
  const [layers, setLayers] = useState<LayerState>({
    properties: {
      enabled: true,
      data: properties,
      variant: "markers",
    },
    population: {
      enabled: false,
      data: [] as PopulationCluster[],
      loading: false,
      error: null as string | null,
      source: "kontur",
      variant: "h3",
      loaded: false,
    },
    eiaMix: {
      enabled: false,
      data: [] as {
        code: string;
        share: number;
        latitude?: number;
        longitude?: number;
        name: string;
        period: string;
      }[],
      loading: false,
      error: null as string | null,
      granularity: "hour" as "hour" | "day",
      loaded: false,
    },
    weather: {
      enabled: false,
      data: [] as WeatherPoint[],
      loading: false,
      error: null as string | null,
      variant: "temperature",
      loaded: false,
    },
    // Future layer types can be added here:
    // traffic: { enabled: false, data: [], loading: false, error: null, source: "mapbox", variant: "flow" },
    // weather: { enabled: false, data: [], loading: false, error: null, source: "openweather", variant: "temperature" }
  });

  const updateLayer = useCallback(
    <K extends keyof LayerState>(
      layerType: K,
      updates: Partial<LayerState[K]>
    ) => {
      setLayers((prev) => ({
        ...prev,
        [layerType]: { ...prev[layerType], ...updates },
      }));
    },
    []
  );

  const fetchPopulationData = useCallback(
    async (source: string) => {
      updateLayer("population", { loading: true, error: null });

      try {
        const resolution = source === "kontur" ? "US" : "r6";
        const response = await fetch(
          `/api/population?resolution=${resolution}`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.error) {
          throw new Error(result.error);
        }

        updateLayer("population", {
          data: result.data,
          loaded: true,
          loading: false,
          source: source,
        });
      } catch (err) {
        const errorMsg =
          source === "kontur"
            ? "Failed to load Kontur data. Please check the console for details."
            : "Failed to load Census data. Please ensure you have a valid API key.";

        updateLayer("population", {
          error: errorMsg,
          loading: false,
        });
        console.error("Population data loading error:", err);
      }
    },
    [updateLayer]
  );

  const fetchEiaMix = useCallback(async () => {
    updateLayer("eiaMix", { loading: true, error: null });
    try {
      const granularity = layers.eiaMix.granularity;
      const res = await fetch(`/api/eia/mix?granularity=${granularity}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Unknown error");
      updateLayer("eiaMix", { data: json.data, loaded: true, loading: false });
    } catch (e) {
      console.error("EIA mix fetch error", e);
      updateLayer("eiaMix", {
        error: "Failed to load EIA mix",
        loading: false,
      });
    }
  }, [layers.eiaMix.granularity, updateLayer]);

  const fetchWeather = useCallback(async () => {
    updateLayer("weather", { loading: true, error: null });
    try {
      const res = await fetch(`/api/weather/current`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Unknown error");
      updateLayer("weather", { data: json.data, loaded: true, loading: false });
    } catch (e) {
      console.error("Weather fetch error", e);
      updateLayer("weather", {
        error: "Failed to load weather",
        loading: false,
      });
    }
  }, [updateLayer]);

  // Update properties layer when properties prop changes
  useEffect(() => {
    updateLayer("properties", { data: properties });
  }, [properties, updateLayer]);

  // Handle layer enable/disable and data fetching
  useEffect(() => {
    const popLayer = layers.population;
    if (popLayer.enabled && !popLayer.loaded && !popLayer.loading) {
      fetchPopulationData(popLayer.source);
    }
    const eiaLayer = layers.eiaMix;
    if (eiaLayer.enabled && !eiaLayer.loaded && !eiaLayer.loading) {
      fetchEiaMix();
    }
    const weatherLayer = layers.weather;
    if (weatherLayer.enabled && !weatherLayer.loaded && !weatherLayer.loading) {
      fetchWeather();
    }
  }, [
    layers.population,
    layers.eiaMix,
    layers.weather,
    fetchPopulationData,
    fetchEiaMix,
    fetchWeather,
  ]);

  type LayerUnion =
    | ScatterplotLayer<Property>
    | ScatterplotLayer<{
        code: string;
        share: number;
        latitude?: number;
        longitude?: number;
        name: string;
        period: string;
      }>
    | ScatterplotLayer<WeatherPoint>
    | H3HexagonLayer<PopulationCluster>;
  const getLayers = useCallback(() => {
    const activeLayers: LayerUnion[] = [];

    // Properties layer
    const propLayer = layers.properties;
    if (propLayer.enabled && propLayer.data && propLayer.data.length > 0) {
      activeLayers.push(
        new ScatterplotLayer({
          id: "properties-layer",
          data: propLayer.data,
          pickable: true,
          opacity: 0.8,
          stroked: true,
          filled: true,
          radiusScale: 1,
          radiusMinPixels: 8,
          radiusMaxPixels: 20,
          lineWidthMinPixels: 2,
          getPosition: (d: Property) => [d.coordinates.lng, d.coordinates.lat],
          getRadius: (d: Property) => {
            // Size based on energy efficiency
            return d.energyMetrics.efficiency > 80 ? 12 : 8;
          },
          getFillColor: (d: Property) => {
            // Color based on energy rating
            if (selectedProperty && selectedProperty.id === d.id) {
              return [255, 165, 0, 200]; // Orange for selected
            }
            const rating = d.energyRating;
            if (rating === "A+" || rating === "A") return [76, 175, 80, 180]; // Green
            if (rating === "B+" || rating === "B") return [255, 193, 7, 180]; // Yellow/Orange
            return [244, 67, 54, 180]; // Red
          },
          getLineColor: [255, 255, 255, 255],
          updateTriggers: {
            getFillColor: [selectedProperty],
          },
        }) as unknown as LayerUnion
      );
    }

    // Population layer
    const popLayer = layers.population;
    if (popLayer.enabled && popLayer.data && popLayer.data.length > 0) {
      const is3D = popLayer.variant === "h3-3d";

      activeLayers.push(
        new H3HexagonLayer({
          id: "population-h3-layer",
          data: popLayer.data,
          pickable: true,
          wireframe: false,
          filled: true,
          extruded: is3D,
          elevationScale: is3D ? 20 : 0,
          getHexagon: (d: PopulationCluster) => d.hexagon,
          getFillColor: (d: PopulationCluster) => {
            // Adjust color intensity based on cluster population
            const intensity = Math.min(d.population / 1000000, 1);
            return [255 * intensity, 255 * (1 - intensity), 128, 200];
          },
          getElevation: is3D
            ? (d: PopulationCluster) => Math.max(d.population / 1000, 100)
            : 0,
          stroked: true,
          getLineColor: [255, 255, 255, 120],
          lineWidthMinPixels: 2,
          beforeId: "waterway-label",
          updateTriggers: {
            getFillColor: [popLayer.data],
            getElevation: [popLayer.data],
          },
        })
      );
    }

    // EIA Mix layer (scatter plot of BA centers sized/color by renewable share)
    const eiaLayer = layers.eiaMix;
    if (eiaLayer.enabled && eiaLayer.data && eiaLayer.data.length > 0) {
      activeLayers.push(
        new ScatterplotLayer({
          id: "eia-mix-layer",
          data: eiaLayer.data,
          pickable: true,
          filled: true,
          radiusScale: 50000,
          radiusMinPixels: 6,
          radiusMaxPixels: 40,
          getPosition: (d) => [d.longitude || 0, d.latitude || 0],
          getRadius: (d) => 10 + d.share * 30,
          getFillColor: (d) => {
            const share = d.share;
            const r = Math.round(255 * (1 - share));
            const g = Math.round(200 * share);
            const b = 80;
            return [r, g, b, 180];
          },
          getLineColor: [255, 255, 255, 200],
          lineWidthMinPixels: 1,
        }) as unknown as LayerUnion
      );
    }

    // Weather layer (temperature or wind visualization)
    const weatherLayer = layers.weather;
    if (
      weatherLayer.enabled &&
      weatherLayer.data &&
      weatherLayer.data.length > 0
    ) {
      activeLayers.push(
        new ScatterplotLayer({
          id: "weather-layer",
          data: weatherLayer.data,
          pickable: true,
          filled: true,
          radiusScale: 30000,
          radiusMinPixels: 4,
          radiusMaxPixels: 30,
          getPosition: (d: WeatherPoint) => [d.longitude, d.latitude],
          getRadius: (d: WeatherPoint) => {
            if (weatherLayer.variant === "wind") {
              return 8 + (d.windSpeed ? Math.min(d.windSpeed, 20) : 0);
            }
            return 6 + (d.temperature + 30) * 0.4; // scale with temperature
          },
          getFillColor: (d: WeatherPoint) => {
            if (weatherLayer.variant === "wind") {
              const speed = d.windSpeed ?? 0;
              const norm = Math.min(speed / 15, 1);
              return [50, Math.round(150 + 100 * norm), 255, 180];
            }
            const t = d.temperature; // assume -20C to 40C range
            const clamped = Math.max(-20, Math.min(40, t));
            const norm = (clamped + 20) / 60; // 0..1
            // interpolate blue -> yellow -> red
            let r: number, g: number, b: number;
            if (norm < 0.5) {
              const k = norm / 0.5; // 0..1
              r = Math.round(0 + 255 * k);
              g = Math.round(128 * k + 128 * (1 - k));
              b = 255;
            } else {
              const k = (norm - 0.5) / 0.5; // 0..1
              r = 255;
              g = Math.round(255 * (1 - k));
              b = Math.round(255 * (1 - k));
            }
            return [r, g, b, 190];
          },
          getLineColor: [255, 255, 255, 150],
          lineWidthMinPixels: 1,
        }) as unknown as LayerUnion
      );
    }

    // Future layers can be added here:
    // if (layers.traffic.enabled && layers.traffic.data.length > 0) { ... }
    // if (layers.weather.enabled && layers.weather.data.length > 0) { ... }

    return activeLayers;
  }, [layers, selectedProperty]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <Box sx={{ height: "400px", position: "relative" }}>
      {/* Layer Dropdown Button */}
      <Box
        sx={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 10,
        }}
      >
        <Button
          onClick={handleClick}
          variant="contained"
          startIcon={<Layers />}
          sx={{
            bgcolor: "white",
            color: "text.primary",
            boxShadow: 2,
            "&:hover": {
              bgcolor: "grey.100",
            },
          }}
        >
          Map Layers
        </Button>
        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "right",
          }}
        >
          <Paper sx={{ p: 2, minWidth: 300 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Map Layers
            </Typography>

            {/* Properties Layer Toggle */}
            <Box sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={layers.properties.enabled}
                    onChange={(e) => {
                      updateLayer("properties", {
                        enabled: e.target.checked,
                      });
                    }}
                  />
                }
                label="Properties"
              />
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Population Density Layer */}
            <Box sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={layers.population.enabled}
                    onChange={(e) => {
                      updateLayer("population", {
                        enabled: e.target.checked,
                      });
                      if (
                        e.target.checked &&
                        layers.population.variant === "h3-3d"
                      ) {
                        setViewState((prev) => ({
                          ...prev,
                          pitch: 45,
                        }));
                      } else if (!e.target.checked) {
                        setViewState((prev) => ({ ...prev, pitch: 0 }));
                      }
                    }}
                  />
                }
                label="Population Density"
              />

              {layers.population.enabled && (
                <Box
                  sx={{
                    ml: 4,
                    mt: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                  }}
                >
                  <FormControl fullWidth size="small">
                    <InputLabel>Data Source</InputLabel>
                    <Select
                      value={layers.population.source}
                      label="Data Source"
                      onChange={(e) => {
                        updateLayer("population", {
                          source: e.target.value,
                          loaded: false,
                          data: [],
                        });
                      }}
                    >
                      <MenuItem value="kontur">US - Full Resolution</MenuItem>
                      <MenuItem value="census">Regional - R6</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small">
                    <InputLabel>Visualization</InputLabel>
                    <Select
                      value={layers.population.variant}
                      label="Visualization"
                      onChange={(e) => {
                        updateLayer("population", {
                          variant: e.target.value,
                        });
                        setViewState((prev) => ({
                          ...prev,
                          pitch: e.target.value === "h3-3d" ? 45 : 0,
                        }));
                      }}
                    >
                      <MenuItem value="h3">H3 Clusters (Flat)</MenuItem>
                      <MenuItem value="h3-3d">H3 Clusters (3D)</MenuItem>
                    </Select>
                  </FormControl>

                  {layers.population.loading && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="primary">
                        Loading...
                      </Typography>
                    </Box>
                  )}

                  {layers.population.error && (
                    <Alert
                      severity="error"
                      sx={{ fontSize: "0.75rem", py: 0.5 }}
                    >
                      {layers.population.error}
                    </Alert>
                  )}

                  {layers.population.data.length > 0 && (
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      <Chip
                        label={`${layers.population.data.length} clusters`}
                        variant="outlined"
                        size="small"
                      />
                      <Chip
                        label={
                          layers.population.source === "kontur"
                            ? "Kontur"
                            : "Census"
                        }
                        variant="outlined"
                        size="small"
                        color="primary"
                      />
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* EIA Grid Mix Layer */}
            <Box sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={layers.eiaMix.enabled}
                    onChange={(e) => {
                      updateLayer("eiaMix", { enabled: e.target.checked });
                      if (e.target.checked) {
                        fetchEiaMix();
                      }
                    }}
                  />
                }
                label="Grid Renewable Mix (EIA)"
              />
              {layers.eiaMix.enabled && (
                <Box
                  sx={{
                    ml: 4,
                    mt: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                  }}
                >
                  <FormControl fullWidth size="small">
                    <InputLabel>Granularity</InputLabel>
                    <Select
                      value={layers.eiaMix.granularity}
                      label="Granularity"
                      onChange={(e) => {
                        updateLayer("eiaMix", {
                          granularity: e.target.value,
                          loaded: false,
                        });
                      }}
                    >
                      <MenuItem value="hour">Hourly</MenuItem>
                      <MenuItem value="day">Daily</MenuItem>
                    </Select>
                  </FormControl>
                  {layers.eiaMix.loading && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="primary">
                        Loading...
                      </Typography>
                    </Box>
                  )}
                  {layers.eiaMix.error && (
                    <Alert
                      severity="error"
                      sx={{ fontSize: "0.75rem", py: 0.5 }}
                    >
                      {layers.eiaMix.error}
                    </Alert>
                  )}
                  {layers.eiaMix.data.length > 0 && (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {layers.eiaMix.data.map((p) => (
                        <Chip
                          key={p.code}
                          label={`${p.code} ${(p.share * 100).toFixed(0)}%`}
                          size="small"
                        />
                      ))}
                    </Box>
                  )}
                  <Box sx={{ fontSize: "0.65rem", color: "text.secondary" }}>
                    Circle size & color represent renewable share (green=high,
                    red=low).
                  </Box>
                </Box>
              )}
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Weather Layer */}
            <Box sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={layers.weather.enabled}
                    onChange={(e) => {
                      updateLayer("weather", { enabled: e.target.checked });
                      if (e.target.checked) {
                        fetchWeather();
                      }
                    }}
                  />
                }
                label="Weather (OpenWeather)"
              />
              {layers.weather.enabled && (
                <Box
                  sx={{
                    ml: 4,
                    mt: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                  }}
                >
                  <FormControl fullWidth size="small">
                    <InputLabel>Metric</InputLabel>
                    <Select
                      value={layers.weather.variant}
                      label="Metric"
                      onChange={(e) => {
                        updateLayer("weather", { variant: e.target.value });
                      }}
                    >
                      <MenuItem value="temperature">Temperature</MenuItem>
                      <MenuItem value="wind">Wind Speed</MenuItem>
                    </Select>
                  </FormControl>
                  {layers.weather.loading && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="primary">
                        Loading...
                      </Typography>
                    </Box>
                  )}
                  {layers.weather.error && (
                    <Alert
                      severity="error"
                      sx={{ fontSize: "0.75rem", py: 0.5 }}
                    >
                      {layers.weather.error}
                    </Alert>
                  )}
                  {layers.weather.data.length > 0 && (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {layers.weather.data.map((w) => (
                        <Chip
                          key={w.code}
                          label={`${w.code} ${w.temperature.toFixed(0)}°C`}
                          size="small"
                        />
                      ))}
                    </Box>
                  )}
                  <Box sx={{ fontSize: "0.65rem", color: "text.secondary" }}>
                    {layers.weather.variant === "temperature"
                      ? "Color = temperature (blue=cold, red=hot)."
                      : "Color = wind intensity (teal=calm, bright=strong)."}
                  </Box>
                </Box>
              )}
            </Box>

            {MAPBOX_ACCESS_TOKEN === "YOUR_MAPBOX_TOKEN_HERE" && (
              <Alert severity="warning" sx={{ mt: 2, fontSize: "0.75rem" }}>
                Add your Mapbox token to NEXT_PUBLIC_MAPBOX_TOKEN
              </Alert>
            )}
          </Paper>
        </Popover>
      </Box>

      <Map
        initialViewState={viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/light-v11"
        projection="mercator"
        mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
        maxZoom={20}
        minZoom={1}
      >
        <DeckGLOverlay
          layers={getLayers()}
          onClick={(info) => {
            if (info.object && info.object.id && onPropertySelect) {
              // This is a property click
              onPropertySelect(info.object);
            }
          }}
          getTooltip={({ object }) => {
            if (!object) return null;

            // Property tooltip
            if (object.id && object.name) {
              return {
                html: `
                  <div style="background: white; padding: 8px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); max-width: 250px;">
                    <strong>${object.name}</strong><br/>
                    <span style="color: #666;">${object.address}</span><br/>
                    <span style="background: ${
                      object.energyRating === "A+" ||
                      object.energyRating === "A"
                        ? "#4CAF50"
                        : object.energyRating === "B+" ||
                          object.energyRating === "B"
                        ? "#FF9800"
                        : "#F44336"
                    }; 
                      color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">
                      ${object.energyRating}
                    </span><br/><br/>
                    <strong>Energy Metrics:</strong><br/>
                    Consumption: ${object.energyMetrics.consumption} kWh<br/>
                    Cost: $${object.energyMetrics.cost.toLocaleString()}<br/>
                    Efficiency: ${object.energyMetrics.efficiency}%<br/><br/>
                    Floors: ${object.buildingInfo.floors} | Rooms: ${
                  object.buildingInfo.rooms
                }
                  </div>
                `,
              };
            }

            // Population cluster tooltip
            if (object.population) {
              return {
                html: `
                  <div style="background: white; padding: 8px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
                    <strong>H3 Population Cluster</strong><br/>
                    Population: ${object.population.toLocaleString()}<br/>
                    ${
                      object.childCount
                        ? `Sub-areas: ${object.childCount}<br/>`
                        : ""
                    }
                    ${
                      object.resolution
                        ? `Resolution: ${object.resolution}`
                        : ""
                    }
                  </div>
                `,
              };
            }

            return null;
          }}
        />
      </Map>
    </Box>
  );
};

export default PopulationDensityMap;
