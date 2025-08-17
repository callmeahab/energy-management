"use client";

import React, { useState } from "react";
import {
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Box,
  Button,
  ButtonGroup,
  IconButton,
  Badge,
  styled,
} from "@mui/material";
import { TimeRange } from "@/types/energy";
import Image from "next/image";
import { useEnergyData, useBuildingData } from "@/contexts/DataContext";
import ConsumptionCard from "./ConsumptionCard";
import CostSavingChart from "./CostSavingChart";
import AlertsCard from "./AlertsCard";
import EfficiencyCard from "./EfficiencyCard";
import BuildingFloorPlan from "./BuildingFloorPlan";
import PropertiesMapDrawer from "./PropertiesMapDrawer";

const DRAWER_WIDTH = 650;

const Main = styled("main", { shouldForwardProp: (prop) => prop !== "open" })<{
  open?: boolean;
}>(({ theme }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  transition: theme.transitions.create("margin", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  marginRight: -DRAWER_WIDTH,
  position: "relative",
  variants: [
    {
      props: ({ open }) => open,
      style: {
        transition: theme.transitions.create("margin", {
          easing: theme.transitions.easing.easeOut,
          duration: theme.transitions.duration.enteringScreen,
        }),
        marginRight: 0,
      },
    },
  ],
}));

const EnergyDashboard = () => {
  const { currentTimeRange, refreshEnergyData } = useEnergyData();
  const { buildings } = useBuildingData();
  const [propertiesDrawerOpen, setPropertiesDrawerOpen] = useState(false);

  const handleTimeRangeChange = (range: TimeRange) => {
    refreshEnergyData(range);
  };

  return (
    <Box sx={{ display: "flex" }}>
      <Main open={propertiesDrawerOpen}>
        <Container maxWidth={false} sx={{ py: 4, maxWidth: "100vw" }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 3,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Image
                src="/logo.svg"
                alt="Energy App Logo"
                width={44}
                height={44}
              />

              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <ButtonGroup variant="text" sx={{ gap: 0, border: "none" }}>
                  {(["month", "week", "day"] as TimeRange[]).map((range) => (
                    <Button
                      key={range}
                      onClick={() => handleTimeRangeChange(range)}
                      sx={{
                        textTransform: "capitalize",
                        color:
                          currentTimeRange === range
                            ? "primary.main"
                            : "text.secondary",
                        borderBottom:
                          currentTimeRange === range ? "3px solid" : "none",
                        borderColor: "primary.main",
                        borderLeft: "none!important",
                        borderRight: "none!important",
                        borderRadius: 0,
                        minWidth: "auto",
                        "&:hover": {
                          backgroundColor: "action.hover",
                        },
                        fontWeight: 600,
                      }}
                    >
                      {range}
                    </Button>
                  ))}
                </ButtonGroup>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <IconButton
                onClick={() => {}}
                sx={{
                  border: 1,
                  borderColor: "#DBDBDB",
                  backgroundColor: "#ffffff",
                }}
              >
                <Image src="/ai.svg" alt="Location" width={24} height={24} />
              </IconButton>

              <IconButton
                onClick={() => setPropertiesDrawerOpen(true)}
                sx={{
                  border: 1,
                  borderColor: "#DBDBDB",
                  backgroundColor: "#ffffff",
                }}
              >
                <Badge badgeContent={buildings.length} color="primary">
                  <Image
                    src="/location.svg"
                    alt="Location"
                    width={24}
                    height={24}
                  />
                </Badge>
              </IconButton>
            </Box>
          </Box>

          <Grid container spacing={3}>
            <Grid
              size={{
                xs: 12,
                sm: 12,
                md: propertiesDrawerOpen ? 12 : 12,
                lg: propertiesDrawerOpen ? 12 : 6,
                xl: propertiesDrawerOpen ? 6 : 4,
              }}
            >
              <ConsumptionCard />
            </Grid>
            <Grid
              size={{
                xs: 12,
                sm: 12,
                md: propertiesDrawerOpen ? 12 : 12,
                lg: propertiesDrawerOpen ? 12 : 6,
                xl: propertiesDrawerOpen ? 6 : 4,
              }}
            >
              <CostSavingChart />
            </Grid>
            <Grid
              size={{
                xs: 12,
                sm: 12,
                md: propertiesDrawerOpen ? 12 : 12,
                lg: propertiesDrawerOpen ? 12 : 6,
                xl: propertiesDrawerOpen ? 6 : 4,
              }}
            >
              <AlertsCard />
            </Grid>
            <Grid
              size={{
                xs: 12,
                sm: 12,
                md: 12,
                lg: propertiesDrawerOpen ? 12 : 12,
                xl: propertiesDrawerOpen ? 12 : 12,
              }}
            >
              <EfficiencyCard drawerOpen={propertiesDrawerOpen} />
            </Grid>
          </Grid>

          <Box sx={{ mt: 4 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Dashboard Sections
                </Typography>

                <Box>
                  <Tabs value={0} sx={{ mb: 2 }}>
                    <Tab label="Lobby" />
                    <Tab label="Floor 1" />
                    <Tab label="Floor 2" />
                    <Tab label="Floor 3" />
                  </Tabs>
                  <BuildingFloorPlan floorId={0} />
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Container>
      </Main>

      <PropertiesMapDrawer
        open={propertiesDrawerOpen}
        onClose={() => setPropertiesDrawerOpen(false)}
        drawerWidth={DRAWER_WIDTH}
      />
    </Box>
  );
};

export default EnergyDashboard;
