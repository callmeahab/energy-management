"use client";

import React from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Skeleton,
} from "@mui/material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useEnergyData, useBuildingData } from "@/contexts/DataContext";

const CostSavingChart = () => {
  const { energyData, energyLoading, energySummary } = useEnergyData();
  const { buildings } = useBuildingData();

  const chartData = React.useMemo(() => {
    if (energyData.length === 0) {
      return [];
    }

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
  }, [energyData]);

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
    <Card sx={{ height: "100%", px: 2, py: 3 }}>
      <CardContent>
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
                  Cost and time saving estimate
                </Box>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip
                  label="Mapped.com API"
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                {hasRealData && (
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
                )}
              </Box>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              An improvement over time based on our tracking data
            </Typography>

            <Box sx={{ height: "250px", flexGrow: 1, my: "auto" }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <Legend verticalAlign="top" height={36} />
                    <XAxis dataKey="day" axisLine tickLine tickMargin={8}></XAxis>
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
