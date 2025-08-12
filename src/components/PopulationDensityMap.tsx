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
  const [layers, setLayers] = useState({
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
    // Future layer types can be added here:
    // traffic: { enabled: false, data: [], loading: false, error: null, source: "mapbox", variant: "flow" },
    // weather: { enabled: false, data: [], loading: false, error: null, source: "openweather", variant: "temperature" }
  });

  const updateLayer = (layerType: string, updates: any) => {
    setLayers((prev) => ({
      ...prev,
      [layerType]: { ...prev[layerType as keyof typeof prev], ...updates },
    }));
  };

  const fetchPopulationData = async (source: string) => {
    updateLayer("population", { loading: true, error: null });

    try {
      const resolution = source === "kontur" ? "US" : "r6";
      const response = await fetch(`/api/population?resolution=${resolution}`);
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
  };

  // Update properties layer when properties prop changes
  useEffect(() => {
    updateLayer("properties", { data: properties });
  }, [properties]);

  // Handle layer enable/disable and data fetching
  useEffect(() => {
    const popLayer = layers.population;
    if (popLayer.enabled && !popLayer.loaded && !popLayer.loading) {
      fetchPopulationData(popLayer.source);
    }
  }, [layers.population.enabled, layers.population.source]);

  const getLayers = useCallback(() => {
    const activeLayers: any[] = [];

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
        })
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
                <Box sx={{ ml: 4, mt: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
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
                    <Alert severity="error" sx={{ fontSize: "0.75rem", py: 0.5 }}>
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
          interleaved={true}
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
                    <span style="background: ${object.energyRating === 'A+' || object.energyRating === 'A' ? '#4CAF50' : 
                      object.energyRating === 'B+' || object.energyRating === 'B' ? '#FF9800' : '#F44336'}; 
                      color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">
                      ${object.energyRating}
                    </span><br/><br/>
                    <strong>Energy Metrics:</strong><br/>
                    Consumption: ${object.energyMetrics.consumption} kWh<br/>
                    Cost: $${object.energyMetrics.cost.toLocaleString()}<br/>
                    Efficiency: ${object.energyMetrics.efficiency}%<br/><br/>
                    Floors: ${object.buildingInfo.floors} | Rooms: ${object.buildingInfo.rooms}
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
                    ${object.childCount ? `Sub-areas: ${object.childCount}<br/>` : ""}
                    ${object.resolution ? `Resolution: ${object.resolution}` : ""}
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
