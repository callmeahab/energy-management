"use client";
import React from "react";
import {
  Menu,
  Box,
  Typography,
  Chip,
  Divider,
  MenuItem,
  ListItemIcon,
} from "@mui/material";
import { LocationOn } from "@mui/icons-material";
import { Property } from "@/types/energy";
import { getRatingColor } from "@/lib/property-utils";

interface PropertyListMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  properties: Property[];
  selectedProperty: Property | null;
  onSelect: (p: Property) => void;
  dataSource: string;
}

const PropertyListMenu: React.FC<PropertyListMenuProps> = ({
  anchorEl,
  open,
  onClose,
  properties,
  selectedProperty,
  onSelect,
  dataSource,
}) => {
  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          maxHeight: 480,
          width: 340,
          p: 1,
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Box
        sx={{
          px: 1,
          pb: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="subtitle1">Properties</Typography>
        <Chip
          label={
            dataSource === "local"
              ? `Local (${properties.length})`
              : dataSource === "api-buildings"
              ? `API (${properties.length})`
              : dataSource === "api-sites"
              ? `Sites (${properties.length})`
              : `Demo (${properties.length})`
          }
          size="small"
          color={
            dataSource === "local"
              ? "primary"
              : dataSource.startsWith("api-")
              ? "success"
              : "default"
          }
          variant="outlined"
        />
      </Box>
      <Divider sx={{ mb: 1 }} />
      <Box sx={{ overflowY: "auto" }}>
        {properties.map((p) => (
          <MenuItem
            key={p.id}
            dense
            selected={selectedProperty?.id === p.id}
            onClick={() => {
              onSelect(p);
              onClose();
            }}
            sx={{ alignItems: "flex-start", py: 1, gap: 1 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <LocationOn color="primary" fontSize="small" />
            </ListItemIcon>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" noWrap title={p.name}>
                {p.name}
              </Typography>
              <Typography
                variant="caption"
                sx={{ display: "block" }}
                noWrap
                title={p.address}
              >
                {p.address}
              </Typography>
              <Typography
                variant="caption"
                sx={{ display: "block", mt: 0.5, color: "text.secondary" }}
              >
                {p.energyMetrics.consumption} kWh · $
                {p.energyMetrics.cost.toLocaleString()} ·{" "}
                {p.energyMetrics.efficiency}%
              </Typography>
            </Box>
            <Chip
              label={p.energyRating}
              size="small"
              color={getRatingColor(p.energyRating)}
            />
          </MenuItem>
        ))}
        {properties.length === 0 && (
          <Typography
            variant="body2"
            sx={{ px: 2, py: 1.5, color: "text.secondary" }}
          >
            No properties loaded.
          </Typography>
        )}
      </Box>
    </Menu>
  );
};

export default PropertyListMenu;
