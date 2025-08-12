"use client";

import React, { useState } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
} from "@mui/material";
import { Close, LocationOn } from "@mui/icons-material";
import { useQuery } from "@apollo/client";
import PopulationDensityMap from "./PopulationDensityMap";
import { GET_BUILDINGS, GET_SITES } from "@/lib/queries";
import { Property, Building, Site } from "@/types/energy";
import {
  fetchLocalBuildings,
  transformBuildingToProperty,
} from "@/lib/queries-local";

interface PropertiesMapDrawerProps {
  open: boolean;
  onClose: () => void;
  drawerWidth?: number;
}

const PropertiesMapDrawer = ({
  open,
  onClose,
  drawerWidth,
}: PropertiesMapDrawerProps) => {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(
    null
  );
  const [properties, setProperties] = useState<Property[]>([]);
  const [dataSource, setDataSource] = useState("demo");
  const [loading, setLoading] = useState(false);

  // Fallback API queries
  const { data: buildingsData } = useQuery(GET_BUILDINGS, {
    errorPolicy: "ignore",
    skip: !open,
  });

  const { data: sitesData } = useQuery(GET_SITES, {
    errorPolicy: "ignore",
    skip: !open,
  });

  // Load local buildings data when drawer opens
  React.useEffect(() => {
    if (!open) return;

    const loadLocalBuildings = async () => {
      setLoading(true);
      try {
        const localBuildings = await fetchLocalBuildings(true);

        if (localBuildings && localBuildings.length > 0) {
          const transformedProperties = localBuildings.map(
            transformBuildingToProperty
          );
          setProperties(transformedProperties);
          setDataSource("local");
          console.log(
            `Using local buildings data: ${localBuildings.length} buildings`
          );
          return;
        }
      } catch (error) {
        console.error("Error loading local buildings:", error);
      }

      // Fallback to API data
      console.log("Local buildings data not available, using API fallback");
      setLoading(false);
    };

    loadLocalBuildings().finally(() => setLoading(false));
  }, [open]);

  // Convert Mapped.com API data to our Property format for display
  const convertBuildingToProperty = (building: Building): Property => {
    const address = building.address;
    const addressString =
      [address?.street, address?.city, address?.state, address?.country]
        .filter(Boolean)
        .join(", ") || "Unknown Address";

    // Calculate actual metrics from building data
    const floorCount = building.floors?.length || 0;
    const roomCount =
      building.floors?.reduce(
        (sum, floor) => sum + (floor.spaces?.length || 0),
        0
      ) || 0;

    // Generate more realistic mock data based on building size
    const basePower = Math.max(100, roomCount * 25 + floorCount * 50);
    const efficiency = Math.max(
      60,
      Math.min(95, 85 + (floorCount > 5 ? 5 : 0) - (roomCount > 50 ? 10 : 0))
    );

    return {
      id: building.id,
      name:
        building.name ||
        building.description ||
        `Building ${building.id.substring(0, 8)}`,
      address: addressString,
      type: building.exactType || "Building",
      energyRating:
        efficiency > 90
          ? "A+"
          : efficiency > 80
          ? "A"
          : efficiency > 70
          ? "B+"
          : "B",
      coordinates: {
        lat: building.geolocation?.latitude || 40.7128,
        lng: building.geolocation?.longitude || -74.006,
      },
      energyMetrics: {
        consumption: Math.floor(basePower * (1 + Math.random() * 0.3)),
        cost: Math.floor(basePower * 4 * (1 + Math.random() * 0.2)),
        efficiency: Math.floor(efficiency),
        lastUpdated: building.dateUpdated || new Date().toISOString(),
      },
      buildingInfo: {
        floors: floorCount,
        rooms: roomCount,
        area: Math.floor(
          (roomCount * 200 + floorCount * 1000) * (1 + Math.random() * 0.4)
        ),
        yearBuilt: 2015 + Math.floor(Math.random() * 8), // 2015-2023
      },
    };
  };

  // Fallback to API data if local data failed
  React.useEffect(() => {
    if (dataSource === "demo" && !loading) {
      if (
        buildingsData?.buildings &&
        Array.isArray(buildingsData.buildings) &&
        buildingsData.buildings.length > 0
      ) {
        const apiProperties = buildingsData.buildings.map(
          convertBuildingToProperty
        );
        setProperties(apiProperties);
        setDataSource("api-buildings");
        console.log(
          `Using ${apiProperties.length} buildings from direct API query`
        );
      } else if (sitesData?.sites && Array.isArray(sitesData.sites)) {
        const buildings = sitesData.sites.flatMap(
          (site: Site) => site.buildings || []
        );
        if (buildings.length > 0) {
          const apiProperties = buildings.map(convertBuildingToProperty);
          setProperties(apiProperties);
          setDataSource("api-sites");
          console.log(
            `Using ${apiProperties.length} buildings from ${sitesData.sites.length} sites`
          );
        }
      }
    }
  }, [buildingsData, sitesData, dataSource, loading]);

  // Note: loading state is derived locally; GraphQL loading/error are ignored in this component

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case "A+":
      case "A":
        return "success";
      case "B+":
      case "B":
        return "warning";
      case "C+":
      case "C":
        return "error";
      default:
        return "default";
    }
  };

  return (
    <Drawer
      anchor="right"
      variant="persistent"
      open={open}
      onClose={onClose}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
        },
      }}
    >
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="h5" fontWeight="bold">
            Properties
          </Typography>
          <IconButton onClick={onClose}>
            <Close />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Box sx={{ height: "50%", position: "relative" }}>
            <PopulationDensityMap
              properties={properties}
              selectedProperty={selectedProperty}
              onPropertySelect={setSelectedProperty}
            />
          </Box>

          <Box sx={{ flex: 1, overflow: "auto" }}>
            <Box
              sx={{
                p: 2,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="h6">Property List</Typography>
              <Chip
                label={
                  dataSource === "local"
                    ? `Local Database (${properties.length})`
                    : dataSource === "api-buildings"
                    ? `Live API (${properties.length} buildings)`
                    : dataSource === "api-sites"
                    ? `Live API (${properties.length} from sites)`
                    : "Demo Data"
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
            <List>
              {properties.map((property, index) => (
                <React.Fragment key={property.id}>
                  <ListItem
                    sx={{
                      cursor: "pointer",
                      "&:hover": { backgroundColor: "action.hover" },
                    }}
                    onClick={() => {
                      setSelectedProperty(property);
                    }}
                  >
                    <Box sx={{ mr: 2 }}>
                      <LocationOn color="primary" />
                    </Box>
                    <ListItemText
                      primary={
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <Typography variant="subtitle2" fontWeight="medium">
                            {property.name}
                          </Typography>
                          <Chip
                            label={property.energyRating}
                            size="small"
                            color={
                              getRatingColor(property.energyRating) as
                                | "success"
                                | "warning"
                                | "error"
                                | "default"
                            }
                          />
                        </Box>
                      }
                      secondary={
                        <React.Fragment>
                          <Typography variant="caption" display="block">
                            {property.address}
                          </Typography>
                          <Typography
                            variant="caption"
                            component="span"
                            sx={{ display: "block", mt: 0.5 }}
                          >
                            {property.energyMetrics.consumption} kWh • $
                            {property.energyMetrics.cost.toLocaleString()} •{" "}
                            {property.energyMetrics.efficiency}% efficient
                          </Typography>
                        </React.Fragment>
                      }
                    />
                  </ListItem>
                  {index < properties.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
};

export default PropertiesMapDrawer;
