"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import {
  Typography,
  Box,
  Skeleton,
  Card,
  CardContent,
  Collapse,
  IconButton,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  useBuildingData,
  LocalBuildingData,
  useEnergyData,
} from "@/contexts/DataContext";

interface HistoricalAnalytics {
  applianceInsights: Array<{
    name: string;
    type: string;
    consumption: number;
    efficiency: number;
    issues: string;
    recommendations: string;
  }>;
  peakUsageHours: Array<{
    name: string;
    consumption: number;
    cost: number;
    percentage: number;
  }>;
}

const CombinedEfficiencyCard = () => {
  const { buildings, buildingsLoading } = useBuildingData();
  const { currentTimeRange } = useEnergyData();
  const [historicalAnalytics, setHistoricalAnalytics] =
    useState<HistoricalAnalytics | null>(null);

  // Fetch historical analytics data for appliances and peak usage
  React.useEffect(() => {
    const fetchHistoricalAnalytics = async () => {
      try {
        const response = await fetch(
          `/api/analytics/historical?timeRange=${currentTimeRange}`
        );
        const result = await response.json();
        if (result.success) {
          setHistoricalAnalytics({
            applianceInsights: result.data.applianceInsights || [],
            peakUsageHours: result.data.peakUsageHours || [],
          });
        }
      } catch (error) {
        console.error(
          "Failed to fetch historical analytics for efficiency card:",
          error
        );
      }
    };

    fetchHistoricalAnalytics();
  }, [currentTimeRange]);

  const combinedData = useMemo(() => {
    if (!buildings || buildings.length === 0) {
      return null;
    }

    // Use historical peak hours data if available, otherwise fallback to mock data
    const peakHours =
      historicalAnalytics?.peakUsageHours &&
      historicalAnalytics.peakUsageHours.length > 0
        ? historicalAnalytics.peakUsageHours.map((period, index) => ({
            name: period.name,
            value: period.percentage,
            color:
              index === 0 ? "#4caf50" : index === 1 ? "#2196f3" : "#ff9800",
          }))
        : [
            { name: "12 PM - 3 PM", value: 45, color: "#4caf50" },
            { name: "9 PM - 12 PM", value: 30, color: "#2196f3" },
            { name: "6 AM - 9 AM", value: 25, color: "#ff9800" },
          ];

    const occupancyData = buildings
      .filter((b: LocalBuildingData) => b.spaces_count > 0)
      .slice(0, 6)
      .map((building: LocalBuildingData, index: number) => {
        const baseEfficiency = 92 - index * 6 - Math.random() * 10;
        return {
          name:
            building.name ||
            `Office ${index === 0 ? "ground floor" : `${index + 1}st floor`}`,
          percentage: Math.max(50, Math.min(95, Math.floor(baseEfficiency))),
          type: index < 2 ? "office" : index < 4 ? "conference" : "classroom",
        };
      });

    // Use historical appliance data if available, otherwise fallback to mock data
    const applianceData =
      historicalAnalytics?.applianceInsights &&
      historicalAnalytics.applianceInsights.length > 0
        ? historicalAnalytics.applianceInsights
            .slice(0, 5)
            .map((appliance) => ({
              name: appliance.name,
              consumption: appliance.consumption,
              issue: appliance.issues || "Normal operation",
              color:
                appliance.consumption > 250
                  ? "#f44336"
                  : appliance.consumption > 150
                  ? "#ff9800"
                  : "#4caf50",
              efficiency: appliance.efficiency,
              recommendations: appliance.recommendations,
            }))
        : [
            {
              name: "Space heater",
              consumption: 300,
              issue: "High energy draw, often left on",
              color: "#f44336",
            },
            {
              name: "Refrigerator",
              consumption: 244,
              issue: "Constant cycling, poor sealing, older model",
              color: "#f44336",
            },
            {
              name: "HVAC system",
              consumption: 195,
              issue: "Poor insulation, long runtime",
              color: "#ff9800",
            },
            {
              name: "Lighting system",
              consumption: 102,
              issue: "Inefficient compared to LED",
              color: "#ff9800",
            },
            {
              name: "Water Heater (Old Tank)",
              consumption: 88,
              issue: "Constantly heating water, not on-demand",
              color: "#ff9800",
            },
          ];

    return {
      peakHours,
      occupancyData,
      applianceData,
    };
  }, [buildings, historicalAnalytics]);

  const [expanded, setExpanded] = useState(true);

  return (
    <Card
      sx={{
        height: "100%",
        px: 5,
        py: 3,
        pb: expanded ? 2 : 0.5,
        transition: "padding-bottom 0.25s ease",
      }}
    >
      <CardContent sx={{ p: 0 }}>
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: expanded ? 2 : 0,
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={() => setExpanded((p) => !p)}
          aria-expanded={expanded}
          role="button"
        >
          <Box
            component="span"
            sx={{
              display: "flex",
              alignItems: "center",
            }}
          >
            <Image
              src="/space-usage.svg"
              alt="Space usage"
              width={32}
              height={32}
            />
          </Box>
          <Box
            sx={{
              fontWeight: 600,
              fontSize: "1.15rem",
              letterSpacing: "-0.01em",
              flexGrow: 1,
            }}
          >
            Space usage efficiency
          </Box>
          <IconButton
            size="small"
            aria-label={expanded ? "Collapse" : "Expand"}
            sx={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.25s ease",
            }}
          >
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
        </Box>
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          {buildingsLoading ? (
            <>
              <Skeleton
                variant="circular"
                width={120}
                height={120}
                sx={{ mx: "auto", my: 2 }}
              />
              <Skeleton variant="text" width="80%" sx={{ mb: 1 }} />
              {[...Array(5)].map((_, i) => (
                <Skeleton
                  key={i}
                  variant="rectangular"
                  width="100%"
                  height={18}
                  sx={{ mb: 0.5 }}
                />
              ))}
            </>
          ) : combinedData ? (
            <Box>
              {/* Three column layout */}
              <Box sx={{ display: "flex", gap: 3, mb: 2 }}>
                {/* Peak usage hours - Left column */}
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                    sx={{ fontSize: "0.75rem" }}
                  >
                    Peak usage hours
                  </Typography>
                  <Box sx={{ height: 120 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={combinedData.peakHours}
                          cx="50%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={50}
                          dataKey="value"
                        >
                          {combinedData.peakHours.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>

                  {/* Legend */}
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.5,
                      mt: 1,
                    }}
                  >
                    {combinedData.peakHours.map((entry, index) => (
                      <Box
                        key={index}
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            backgroundColor: entry.color,
                            borderRadius: "50%",
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{ fontSize: "0.7rem" }}
                        >
                          {entry.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          fontWeight="medium"
                          sx={{ fontSize: "0.7rem" }}
                        >
                          {entry.value}%
                        </Typography>
                      </Box>
                    ))}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: "0.65rem", mt: 0.5 }}
                    >
                      Other
                    </Typography>
                  </Box>
                </Box>

                {/* Occupancy by room - Middle column */}
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                    sx={{ fontSize: "0.75rem" }}
                  >
                    Occupancy by room
                  </Typography>
                  <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                  >
                    {combinedData.occupancyData
                      .slice(0, 6)
                      .map((room, index) => (
                        <Box
                          key={index}
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontSize: "0.75rem", flex: 1 }}
                          >
                            {room.name}
                          </Typography>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{ fontSize: "0.75rem", ml: 1 }}
                          >
                            {room.percentage} %
                          </Typography>
                        </Box>
                      ))}
                  </Box>
                </Box>

                {/* Appliance/System - Right column */}
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                    sx={{ fontSize: "0.75rem" }}
                  >
                    Appliance/System
                  </Typography>
                  <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                  >
                    {combinedData.applianceData.map((appliance, index) => (
                      <Box key={index}>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            mb: 0.5,
                          }}
                        >
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{ fontSize: "0.75rem" }}
                          >
                            {appliance.name}
                          </Typography>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{ fontSize: "0.75rem" }}
                          >
                            {appliance.consumption} kWh
                          </Typography>
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            fontSize: "0.65rem",
                            display: "block",
                            mb: 1,
                          }}
                        >
                          {appliance.issue}
                        </Typography>
                        <Box
                          sx={{
                            height: 2,
                            backgroundColor: "grey.200",
                            borderRadius: 1,
                            mb:
                              index < combinedData.applianceData.length - 1
                                ? 1
                                : 0,
                          }}
                        >
                          <Box
                            sx={{
                              height: "100%",
                              width: `${Math.min(
                                appliance.consumption / 3,
                                100
                              )}%`,
                              backgroundColor: appliance.color,
                              borderRadius: 1,
                            }}
                          />
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            </Box>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: "center", mt: 4 }}
            >
              No efficiency data available.
            </Typography>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default CombinedEfficiencyCard;
