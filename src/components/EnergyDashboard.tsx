"use client";

import React, { useState, useEffect } from "react";
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
import { Storage } from "@mui/icons-material";
import { TimeRange } from "@/types/energy";
import Image from "next/image";
import { useEnergyData, useBuildingData } from "@/contexts/DataContext";
import ConsumptionCard from "./ConsumptionCard";
import CostSavingChart from "./CostSavingChart";
import AlertsDropdown from "./AlertsDropdown";
import SpaceEfficiencyCard from "./SpaceEfficiencyCard";
import EnergyInefficiencyCard from "./EnergyInefficiencyCard";
import BuildingFloorPlan from "./BuildingFloorPlan";
import PropertiesMapDrawer from "./PropertiesMapDrawer";
import SyncStatusModal from "./SyncStatusModal";

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
  const { currentTimeRange, refreshEnergyData, energySummary } =
    useEnergyData();
  const { buildings } = useBuildingData();
  const [activeTab, setActiveTab] = useState(0);
  const [propertiesDrawerOpen, setPropertiesDrawerOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<{
    isRunning: boolean;
    nextSyncTime?: string;
  } | null>(null);

  const handleTimeRangeChange = (range: TimeRange) => {
    refreshEnergyData(range);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Check scheduler status on component mount
  useEffect(() => {
    const checkSchedulerStatus = async () => {
      try {
        const response = await fetch("/api/sync/scheduler");
        const result = await response.json();
        if (result.success) {
          setSchedulerStatus(result.data);
        }
      } catch (error) {
        console.error("Failed to get scheduler status:", error);
      }
    };

    checkSchedulerStatus();
    // Check scheduler status periodically
    const interval = setInterval(checkSchedulerStatus, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

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
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Image
                src="/logo.svg"
                alt="Energy App Logo"
                width={44}
                height={44}
              />

              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <ButtonGroup variant="text" sx={{ gap: 0, border: "none" }}>
                  {(["month", "week", "day", "hour"] as TimeRange[]).map(
                    (range) => (
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
                    )
                  )}
                </ButtonGroup>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {energySummary && energySummary.total_records > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    mr: 2,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      fontSize: "0.8rem",
                      color: "success.main",
                      fontWeight: 600,
                    }}
                  >
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: "success.main",
                        animation: "pulse 2s infinite",
                        "@keyframes pulse": {
                          "0%": { opacity: 1 },
                          "50%": { opacity: 0.5 },
                          "100%": { opacity: 1 },
                        },
                      }}
                    />
                    {energySummary.total_records} sensors live
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.7rem",
                      color: "text.secondary",
                    }}
                  >
                    Last sync:{" "}
                    {new Date(energySummary.latest_record).toLocaleString()}
                  </Typography>
                </Box>
              )}

              {buildings.length > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    mr: 2,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.75rem",
                      color: "text.secondary",
                    }}
                  >
                    {buildings.length} buildings connected
                  </Typography>
                  {schedulerStatus?.isRunning && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Box
                        component="span"
                        sx={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          bgcolor: "success.main",
                          animation: "pulse 2s infinite",
                          "@keyframes pulse": {
                            "0%": { opacity: 1 },
                            "50%": { opacity: 0.5 },
                            "100%": { opacity: 1 },
                          },
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: "0.7rem",
                          color: "success.main",
                        }}
                      >
                        Auto-sync every hour
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}

              <AlertsDropdown />

              <IconButton
                onClick={() => setSyncModalOpen(true)}
                sx={{
                  border: 1,
                  borderColor: "#DBDBDB",
                  backgroundColor: "#ffffff",
                }}
                title="Data Sync Status"
              >
                <Storage />
              </IconButton>

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
            <Grid size={{ xs: 12, md: 6 }}>
              <ConsumptionCard />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CostSavingChart />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <SpaceEfficiencyCard />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <EnergyInefficiencyCard />
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

      <SyncStatusModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
      />
    </Box>
  );
};

export default EnergyDashboard;
