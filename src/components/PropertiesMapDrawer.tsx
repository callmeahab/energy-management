"use client";

import React, { useState } from "react";
import { Drawer, Box, IconButton } from "@mui/material";
import { Close, List as ListIcon } from "@mui/icons-material";
import { useQuery } from "@apollo/client";
import MapContainer from "./MapContainer";
import { GET_BUILDINGS, GET_SITES } from "@/lib/queries";
import { Property, Site } from "@/types/energy";
import {
  fetchLocalBuildings,
  transformBuildingToProperty,
} from "@/lib/queries-local";
import { convertBuildingToProperty } from "@/lib/property-utils";
import PropertyListMenu from "@/components/PropertyListMenu";

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
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuAnchorEl);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(e.currentTarget);
  };
  const handleMenuClose = () => setMenuAnchorEl(null);

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

  // rating color handled by PropertyListMenu via utility

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
      <Box sx={{ height: "100%", position: "relative" }}>
        <Box sx={{ position: "absolute", top: 16, right: 16, zIndex: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <IconButton
              className="MuiIconButton-bordered"
              sx={{
                boxShadow: 2,
                width: 40,
                height: 40,
              }}
              onClick={onClose}
              aria-label="close drawer"
            >
              <Close />
            </IconButton>
            <IconButton
              className="MuiIconButton-bordered"
              sx={{
                boxShadow: 2,
                width: 40,
                height: 40,
              }}
              aria-label="properties list"
              onClick={handleMenuOpen}
            >
              <ListIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <MapContainer
          properties={properties}
          selectedProperty={selectedProperty}
          onPropertySelect={setSelectedProperty}
        />

        <PropertyListMenu
          anchorEl={menuAnchorEl}
          open={menuOpen}
          onClose={handleMenuClose}
          properties={properties}
          selectedProperty={selectedProperty}
          onSelect={setSelectedProperty}
          dataSource={dataSource}
        />
      </Box>
    </Drawer>
  );
};

export default PropertiesMapDrawer;
