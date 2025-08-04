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
import { Business } from "@mui/icons-material";
import { TimeRange } from "@/types/energy";
import ConsumptionCard from "./ConsumptionCard";
import CostSavingChart from "./CostSavingChart";
import AlertsCard from "./AlertsCard";
import SpaceEfficiencyCard from "./SpaceEfficiencyCard";
import EnergyInefficiencyCard from "./EnergyInefficiencyCard";
import BuildingFloorPlan from "./BuildingFloorPlan";
import PropertiesMapDrawer from "./PropertiesMapDrawer";
import SyncStatusCard from "./SyncStatusCard";

const DRAWER_WIDTH = 400;

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
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [activeTab, setActiveTab] = useState(0);
  const [propertiesDrawerOpen, setPropertiesDrawerOpen] = useState(false);

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ display: "flex" }}>
      <Main open={propertiesDrawerOpen}>
        <Container maxWidth="xl" sx={{ py: 4 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 3,
            }}
          >
            <Typography variant="h4" component="h1" gutterBottom>
              Energy Efficiency Monitor
            </Typography>
            <IconButton
              onClick={() => setPropertiesDrawerOpen(true)}
              sx={{
                bgcolor: "primary.main",
                color: "white",
                "&:hover": { bgcolor: "primary.dark" },
              }}
            >
              <Badge badgeContent={3} color="error">
                <Business />
              </Badge>
            </IconButton>
          </Box>

          <Box sx={{ mb: 3 }}>
            <ButtonGroup variant="outlined" sx={{ mb: 2 }}>
              {(["month", "week", "day", "hour"] as TimeRange[]).map(
                (range) => (
                  <Button
                    key={range}
                    variant={timeRange === range ? "contained" : "outlined"}
                    onClick={() => handleTimeRangeChange(range)}
                    sx={{ textTransform: "capitalize" }}
                  >
                    {range}
                  </Button>
                )
              )}
            </ButtonGroup>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <ConsumptionCard timeRange={timeRange} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CostSavingChart timeRange={timeRange} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <AlertsCard />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <SpaceEfficiencyCard />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <EnergyInefficiencyCard />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <SyncStatusCard />
            </Grid>
          </Grid>

          <Box sx={{ mt: 4 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Building Floor Plan
                </Typography>
                <Tabs
                  value={activeTab}
                  onChange={handleTabChange}
                  sx={{ mb: 2 }}
                >
                  <Tab label="Lobby" />
                  <Tab label="Floor 1" />
                  <Tab label="Floor 2" />
                  <Tab label="Floor 3" />
                </Tabs>
                <BuildingFloorPlan floorId={activeTab} />
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
