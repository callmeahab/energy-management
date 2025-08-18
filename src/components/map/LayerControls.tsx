"use client";
import React from "react";
import {
  Box,
  IconButton,
  Popover,
  Paper,
  Typography,
  FormControlLabel,
  Switch,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Chip,
  Alert,
} from "@mui/material";
import { Layers } from "@mui/icons-material";
import { LayerState } from "@/types/map";

// Minimal view state shape used by the map (subset of react-map-gl ViewState)
export interface BasicViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
}

interface LayerControlsProps {
  layers: LayerState;
  anchorEl: HTMLButtonElement | null;
  handleClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  handleClose: () => void;
  updateLayer: <K extends keyof LayerState>(
    layerType: K,
    updates: Partial<LayerState[K]>
  ) => void;
  fetchEiaMix: () => Promise<void>;
  fetchWeather: () => Promise<void>;
  setViewState: React.Dispatch<React.SetStateAction<BasicViewState>>;
}

const LayerControls: React.FC<LayerControlsProps> = ({
  layers,
  anchorEl,
  handleClick,
  handleClose,
  updateLayer,
  fetchEiaMix,
  fetchWeather,
  setViewState,
}) => {
  const open = Boolean(anchorEl);
  return (
    <Box sx={{ position: "absolute", top: 112, right: 16, zIndex: 10 }}>
      <IconButton
        aria-label="map layers"
        onClick={handleClick}
        className="MuiIconButton-bordered"
        sx={{
          boxShadow: 2,
          width: 40,
          height: 40,
        }}
      >
        <Layers fontSize="small" />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Paper sx={{ p: 2, minWidth: 300 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Map Layers
          </Typography>
          {/* Properties */}
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={layers.properties.enabled}
                  onChange={(e) =>
                    updateLayer("properties", { enabled: e.target.checked })
                  }
                />
              }
              label="Properties"
            />
          </Box>
          <Divider sx={{ my: 2 }} />
          {/* Population */}
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={layers.population.enabled}
                  onChange={(e) => {
                    updateLayer("population", { enabled: e.target.checked });
                    if (
                      e.target.checked &&
                      layers.population.variant === "h3-3d"
                    )
                      setViewState((prev) => ({ ...prev, pitch: 45 }));
                    else if (!e.target.checked)
                      setViewState((prev) => ({ ...prev, pitch: 0 }));
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
                    onChange={(e) =>
                      updateLayer("population", {
                        source: e.target.value,
                        loaded: false,
                        data: [],
                      })
                    }
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
                      updateLayer("population", { variant: e.target.value });
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
          <Divider sx={{ my: 2 }} />
          {/* EIA */}
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={layers.eiaMix.enabled}
                  onChange={(e) => {
                    updateLayer("eiaMix", { enabled: e.target.checked });
                    if (e.target.checked) fetchEiaMix();
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
                    onChange={(e) =>
                      updateLayer("eiaMix", {
                        granularity: e.target.value,
                        loaded: false,
                      })
                    }
                  >
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
                  <Alert severity="error" sx={{ fontSize: "0.75rem", py: 0.5 }}>
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
          {/* Weather */}
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={layers.weather.enabled}
                  onChange={(e) => {
                    updateLayer("weather", { enabled: e.target.checked });
                    if (e.target.checked) fetchWeather();
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
                    onChange={(e) =>
                      updateLayer("weather", { variant: e.target.value })
                    }
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
                  <Alert severity="error" sx={{ fontSize: "0.75rem", py: 0.5 }}>
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
        </Paper>
      </Popover>
    </Box>
  );
};

export default LayerControls;
