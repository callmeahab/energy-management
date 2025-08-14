"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
// Local minimal MapRef type fallback (avoid dependency on react-map-gl types if not installed)
type MapRef = {
  fitBounds?: (
    bounds: [[number, number], [number, number]],
    options?: { padding?: number; duration?: number }
  ) => void;
};
import { Map, useControl } from "react-map-gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { DeckProps } from "@deck.gl/core";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer, IconLayer } from "@deck.gl/layers";
import { Box } from "@mui/material";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  generatePropertyIcon,
  computePropertyBounds,
  heuristicZoom,
} from "@/lib/map-utils";
import {
  LayerState,
  PopulationCluster,
  WeatherPoint,
  Property,
} from "@/types/map";
import LayerControls, { BasicViewState } from "@/components/map/LayerControls";

const MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface MapContainerProps {
  properties?: Property[];
  selectedProperty?: Property | null;
  onPropertySelect?: (property: Property | null) => void;
}

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const MapContainer = ({
  properties = [],
  selectedProperty = null,
  onPropertySelect,
}: MapContainerProps) => {
  const [viewState, setViewState] = useState<BasicViewState>({
    longitude: -98.5795,
    latitude: 39.8283,
    zoom: 4,
    pitch: 0,
    bearing: 0,
  });

  // Layer management state
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
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

  // Map ref for fitting bounds
  const mapRef = useRef<MapRef | null>(null);
  const [didFitProperties, setDidFitProperties] = useState(false);

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

  // Fit map to properties when they first load
  useEffect(() => {
    if (didFitProperties) return;
    const props = layers.properties.data;
    if (!props.length) return;
    const bounds = computePropertyBounds(props);
    if (!bounds) return;
    if (bounds.minLat === bounds.maxLat && bounds.minLng === bounds.maxLng) {
      const single = heuristicZoom(bounds);
      setViewState((vs) => ({ ...vs, ...single }));
      setDidFitProperties(true);
      return;
    }
    try {
      if (mapRef.current?.fitBounds) {
        mapRef.current.fitBounds(
          [
            [bounds.minLng, bounds.minLat],
            [bounds.maxLng, bounds.maxLat],
          ],
          { padding: 60, duration: 800 }
        );
        setDidFitProperties(true);
        return;
      }
    } catch {
      /* ignore */
    }
    const h = heuristicZoom(bounds);
    setViewState((vs) => ({ ...vs, ...h }));
    setDidFitProperties(true);
  }, [layers.properties.data, didFitProperties]);

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
    if (propLayer.enabled && propLayer.data.length) {
      activeLayers.push(
        new IconLayer({
          id: "properties-icons",
          data: propLayer.data,
          pickable: true,
          sizeUnits: "pixels",
          getSize: (d: Property) =>
            selectedProperty && selectedProperty.id === d.id ? 52 : 44,
          getPosition: (d: Property) => [d.coordinates.lng, d.coordinates.lat],
          getIcon: (d: Property) => {
            const isSel = selectedProperty && selectedProperty.id === d.id;
            return {
              url: generatePropertyIcon(d, !!isSel),
              width: 64,
              height: 64,
              anchorX: 32,
              anchorY: 32,
            };
          },
          billboard: true,
          updateTriggers: {
            getIcon: [selectedProperty, propLayer.data],
            getSize: [selectedProperty],
          },
        }) as unknown as LayerUnion
      );
    }

    // Population layer
    const popLayer = layers.population;
    if (popLayer.enabled && popLayer.data.length) {
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

    // EIA Mix layer
    const eiaLayer = layers.eiaMix;
    if (eiaLayer.enabled && eiaLayer.data.length) {
      activeLayers.push(
        new ScatterplotLayer({
          id: "eia-mix-layer",
          data: eiaLayer.data,
          pickable: true,
          filled: true,
          radiusScale: 50000,
          radiusMinPixels: 6,
          radiusMaxPixels: 40,
          getPosition: (d: { longitude?: number; latitude?: number }) => [
            d.longitude || 0,
            d.latitude || 0,
          ],
          getRadius: (d: { share: number }) => 10 + d.share * 30,
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

    // Weather layer
    const weatherLayer = layers.weather;
    if (weatherLayer.enabled && weatherLayer.data.length) {
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
          getRadius: (d: WeatherPoint) =>
            weatherLayer.variant === "wind"
              ? 8 + (d.windSpeed ? Math.min(d.windSpeed, 20) : 0)
              : 6 + (d.temperature + 30) * 0.4,
          getFillColor: (d: WeatherPoint) => {
            if (weatherLayer.variant === "wind") {
              const speed = d.windSpeed ?? 0;
              const norm = Math.min(speed / 15, 1);
              return [50, Math.round(150 + 100 * norm), 255, 180];
            }
            const t = d.temperature;
            const clamped = Math.max(-20, Math.min(40, t));
            const norm = (clamped + 20) / 60;
            let r: number, g: number, b: number;
            if (norm < 0.5) {
              const k = norm / 0.5;
              r = Math.round(0 + 255 * k);
              g = Math.round(128 * k + 128 * (1 - k));
              b = 255;
            } else {
              const k = (norm - 0.5) / 0.5;
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

    return activeLayers;
  }, [layers, selectedProperty]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) =>
    setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  return (
    <Box sx={{ height: "100%", position: "relative" }}>
      <LayerControls
        layers={layers}
        anchorEl={anchorEl}
        handleClick={handleClick}
        handleClose={handleClose}
        updateLayer={updateLayer}
        fetchEiaMix={fetchEiaMix}
        fetchWeather={fetchWeather}
        setViewState={setViewState}
      />

      <Map
        initialViewState={viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/navigation-day-v1"
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

            // Common style override to remove default deck.gl tooltip border/background
            const baseTooltipStyle: Partial<CSSStyleDeclaration> = {
              background: "transparent",
              border: "none",
              padding: "0",
              boxShadow: "none",
            };

            // Property tooltip
            if (object.id && object.name) {
              return {
                html: `
                  <div style="background: #ffffff; padding: 10px 12px; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.12); max-width: 260px; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                    <strong style="font-size:13px;">${object.name}</strong><br/>
                    <span style="color: #666; font-size:12px;">${
                      object.address
                    }</span><br/>
                    <span style="display:inline-block; margin-top:6px; background: ${
                      object.energyRating === "A+" ||
                      object.energyRating === "A"
                        ? "#4CAF50"
                        : object.energyRating === "B+" ||
                          object.energyRating === "B"
                        ? "#FF9800"
                        : "#F44336"
                    }; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; letter-spacing: .5px; font-weight:500;">
                      ${object.energyRating}
                    </span>
                    <div style="margin-top:10px; font-size:12px; line-height:1.4;">
                      <strong style="display:block; margin-bottom:4px; color:#333;">Energy Metrics</strong>
                      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px 12px;">
                        <span style="color:#555;">Consumption:</span><span>${
                          object.energyMetrics.consumption
                        } kWh</span>
                        <span style="color:#555;">Cost:</span><span>$${object.energyMetrics.cost.toLocaleString()}</span>
                        <span style="color:#555;">Efficiency:</span><span>${
                          object.energyMetrics.efficiency
                        }%</span>
                        <span style="color:#555;">Floors:</span><span>${
                          object.buildingInfo.floors
                        }</span>
                        <span style="color:#555;">Rooms:</span><span>${
                          object.buildingInfo.rooms
                        }</span>
                      </div>
                    </div>
                  </div>
                `,
                style: baseTooltipStyle,
              };
            }

            // Population cluster tooltip
            if (object.population) {
              return {
                html: `
                  <div style="background: #ffffff; padding: 8px 10px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); font-size:12px; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                    <strong style="font-size:13px; color:#333;">H3 Population Cluster</strong><br/>
                    <span style="color:#555;">Population:</span> ${object.population.toLocaleString()}<br/>
                    ${
                      object.childCount
                        ? `<span style=\"color:#555;\">Sub-areas:</span> ${object.childCount}<br/>`
                        : ""
                    }
                    ${
                      object.resolution
                        ? `<span style=\"color:#555;\">Resolution:</span> ${object.resolution}`
                        : ""
                    }
                  </div>
                `,
                style: baseTooltipStyle,
              };
            }

            // Weather Station Tooltip - displays detailed weather information on hover
            // Triggered when user hovers over weather layer circles
            // Identifies weather objects by presence of temperature property
            if (object.temperature !== undefined) {
              return {
                html: `
                  <div style="background: #ffffff; padding: 12px 14px; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.14); max-width: 300px; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                    <div style="border-bottom: 1px solid #f0f0f0; padding-bottom: 6px; margin-bottom: 8px;">
                      <strong style="color: #1976d2; font-size: 14px;">${
                        object.name
                      }</strong><br/>
                      <span style="color: #666; font-size: 11px;">Balancing Authority: ${
                        object.code
                      }</span>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fit,minmax(110px,1fr)); gap:8px; font-size:12px;">
                      <div><span style="color:#666;">Temperature</span><br/><strong style="color:#d32f2f; font-size:13px;">${object.temperature.toFixed(
                        1
                      )}°C</strong></div>
                      ${
                        object.humidity
                          ? `<div><span style=\"color:#666;\">Humidity</span><br/><strong style=\"color:#1976d2; font-size:13px;\">${object.humidity}%</strong></div>`
                          : ""
                      }
                      ${
                        object.windSpeed
                          ? `<div><span style=\"color:#666;\">Wind Speed</span><br/><strong style=\"color:#388e3c; font-size:13px;\">${object.windSpeed.toFixed(
                              1
                            )} m/s</strong></div>`
                          : ""
                      }
                      ${
                        object.conditions
                          ? `<div><span style=\"color:#666;\">Conditions</span><br/><strong style=\"color:#f57c00; font-size:13px;\">${object.conditions}</strong></div>`
                          : ""
                      }
                    </div>
                    <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #f0f0f0; font-size: 10px; color: #999; text-align: center; letter-spacing:.5px;">
                      OpenWeatherMap API
                    </div>
                  </div>
                `,
                style: baseTooltipStyle,
              };
            }

            return null;
          }}
        />
      </Map>
    </Box>
  );
};

export default MapContainer;
