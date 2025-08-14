"use client";

import React from "react";
import Image from "next/image";
import { Card, CardContent, Typography, Box, Skeleton } from "@mui/material";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { useEnergyData } from "@/contexts/DataContext";

interface HistoricalAnalytics {
  summary: {
    totalSavingsPotential: number;
    potentialSavings: number;
    avgEfficiency: number;
  };
  dailyData: Array<{
    date: string;
    consumption: number;
    cost: number;
    savingsPotential: number;
  }>;
}

const CostSavingChart = () => {
  const { energyData, energyLoading, energySummary, currentTimeRange } =
    useEnergyData();
  const [historicalAnalytics, setHistoricalAnalytics] =
    React.useState<HistoricalAnalytics | null>(null);

  // Fetch historical analytics data
  React.useEffect(() => {
    const fetchHistoricalAnalytics = async () => {
      try {
        const response = await fetch(
          `/api/analytics/historical?timeRange=${currentTimeRange}`
        );
        const result = await response.json();
        if (result.success) {
          setHistoricalAnalytics(result.data);
        }
      } catch (error) {
        console.error(
          "Failed to fetch historical analytics for cost saving chart:",
          error
        );
      }
    };

    fetchHistoricalAnalytics();
  }, [currentTimeRange]);

  const chartData = React.useMemo(() => {
    // Use historical analytics data if available for accurate savings calculations
    if (
      historicalAnalytics?.dailyData &&
      historicalAnalytics.dailyData.length > 0
    ) {
      return historicalAnalytics.dailyData
        .slice(-7) // Last 7 days
        .map((day) => {
          const date = new Date(day.date);
          const dayName = date.toLocaleDateString("en-US", {
            weekday: "short",
          });

          return {
            day: dayName,
            savings: Math.round(day.savingsPotential),
            consumption: Math.round(day.consumption),
            actualCost: Math.round(day.cost),
            potentialSavings: Math.round(day.savingsPotential),
          };
        });
    }

    if (energyData.length === 0) {
      return [];
    }

    // Fallback to existing logic
    return energyData
      .slice(0, 7)
      .map((item) => {
        const date = new Date(item.period);
        const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
        const cost = item.total_cost || item.avg_cost || 0;

        return {
          day: dayName,
          savings: Math.round(cost * 0.15),
          consumption: Math.round(
            item.total_consumption || item.avg_consumption || 0
          ),
        };
      })
      .reverse();
  }, [energyData, historicalAnalytics]);

  const hasRealData = energySummary && energySummary.total_records > 0;

  if (!hasRealData && !energyLoading) {
    return (
      <Card sx={{ height: "100%", px: 2, py: 3 }}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minHeight: 300,
              textAlign: "center",
            }}
          >
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Cost Saving Data Available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Waiting for real-time data from Mapped.com sensors...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ display: "flex", height: "100%", px: 2, py: 3 }}>
      <CardContent
        sx={{ display: "flex", flexDirection: "column", flexGrow: 1 }}
      >
        {energyLoading ? (
          <>
            <Skeleton variant="text" width="80%" height={40} />
            <Skeleton variant="text" width="60%" height={20} sx={{ mb: 2 }} />
            <Skeleton variant="rectangular" width="100%" height={250} />
          </>
        ) : (
          <>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  verticalAlign: "center",
                  height: "100%",
                  gap: 1,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    mx: "auto",
                  }}
                >
                  <Image
                    src="/cost-saving.svg"
                    alt="Consumption"
                    width={32}
                    height={32}
                  />
                </Box>
                <Box
                  sx={{
                    verticalAlign: "center",
                    height: "100%",
                    mx: "auto",
                    fontWeight: 600,
                    fontSize: "1.15rem",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Cost and consumption savings estimate
                </Box>
              </Box>
            </Box>

            <Box
              sx={{
                display: "flex",
                gap: 3,
                mb: 3,
                fontWeight: 600,
                justifyContent: "center",
                backgroundColor: "#F9F9F9",
                padding: 2,
              }}
            >
              <Box sx={{ textAlign: "center", flex: 1 }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, color: "#5A6C83" }}
                >
                  An improvement over time based on changes
                </Typography>
              </Box>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  mx: "auto",
                  justifyContent: "center",
                  gap: 3,
                  mb: 2,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      bgcolor: "#4caf50",
                    }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    Savings
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      bgcolor: "#ff9800",
                    }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    Consumption
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ height: "250px", flexGrow: 1, my: "auto" }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis
                      dataKey="day"
                      axisLine
                      tickLine
                      tickMargin={8}
                    ></XAxis>
                    <YAxis axisLine tickLine tickMargin={8}></YAxis>
                    <Bar
                      dataKey="savings"
                      fill="#4caf50"
                      name="Savings"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="consumption"
                      fill="#ff9800"
                      name="Consumption"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "text.secondary",
                  }}
                >
                  <Typography variant="body2">
                    No chart data available
                  </Typography>
                </Box>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CostSavingChart;
