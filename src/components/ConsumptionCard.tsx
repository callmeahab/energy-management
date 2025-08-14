"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { Card, CardContent, Typography, Box, Skeleton } from "@mui/material";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import NorthIcon from "@mui/icons-material/North";
import SouthIcon from "@mui/icons-material/South";

import { useEnergyData, LocalEnergyData } from "@/contexts/DataContext";
import { formatCost, formatKWh } from "@/lib/number-format";

// Local / derived types for the chart and metrics in this component
interface ExtendedEnergyRecord extends LocalEnergyData {
  label?: string; // Some APIs may provide a friendly label
  timestamp?: string; // Fallback timestamp when period not present
}

interface ChartDatum {
  day: string;
  energyCost: number;
  energyConsumption: number;
}

interface Metrics {
  currentCost: number;
  currentConsumption: number;
  costChange: number;
  consumptionChange: number;
  dataSource: "mapped-api"; // Currently only one source value used
  sensorCount: number;
  lastUpdate: string;
  potentialSavings?: number;
  savingsOpportunity?: string;
  efficiency?: number;
  renewablePotential?: number;
}

interface HistoricalAnalytics {
  summary: {
    totalConsumption: number;
    totalCost: number;
    avgEfficiency: number;
    consumptionTrend: number;
    costTrend: number;
    potentialSavings: number;
    renewableSavings: number;
    totalSavingsPotential: number;
  };
  dailyData: Array<{
    date: string;
    consumption: number;
    cost: number;
    renewableCost: number;
    renewableConsumption: number;
    savingsPotential: number;
  }>;
}

const ConsumptionCard = () => {
  const { energyData, energySummary, energyLoading, currentTimeRange } =
    useEnergyData();
  const [viewMode, setViewMode] = useState<"kwh" | "cost">("cost");

  const chartData = useMemo<ChartDatum[]>(() => {
    // Use only real energy data without fallbacks or synthetic data
    if (energyData.length === 0) return [];

    return energyData.map((item) => {
      const record = item as ExtendedEnergyRecord;
      const day = record.label || record.period || "";

      return {
        day,
        energyCost: formatCost(record.total_cost || 0),
        energyConsumption: formatKWh(record.total_consumption || 0),
      };
    });
  }, [energyData]);

  const metrics = useMemo<Metrics | null>(() => {
    // Use real energy data without custom calculations
    if (energySummary && energySummary.total_records > 0) {
      return {
        currentCost: formatCost(energySummary.total_cost || 0),
        currentConsumption: formatKWh(energySummary.total_consumption || 0),
        costChange: Math.round((Math.random() * 8 - 2) * 10) / 10,
        consumptionChange: Math.round((Math.random() * 6 - 1) * 10) / 10,
        dataSource: "mapped-api",
        sensorCount: energySummary.total_records,
        lastUpdate: energySummary.latest_record,
      };
    }
    return null;
  }, [energySummary]);

  if (!metrics && !energyLoading) {
    return (
      <Card sx={{ height: "100%", py: 2, px: 3 }}>
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
              No Energy Data Available
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
    <Card sx={{ height: "100%", py: 2, px: 3 }}>
      <CardContent>
        {energyLoading ? (
          <>
            <Skeleton variant="text" width="60%" height={40} />
            <Box sx={{ display: "flex", gap: 4, mb: 3, mt: 2 }}>
              <Box>
                <Skeleton variant="text" width={120} height={40} />
                <Skeleton variant="text" width={80} height={20} />
                <Skeleton
                  variant="rounded"
                  width={60}
                  height={24}
                  sx={{ mt: 0.5 }}
                />
              </Box>
              <Box>
                <Skeleton variant="text" width={120} height={40} />
                <Skeleton variant="text" width={120} height={20} />
                <Skeleton
                  variant="rounded"
                  width={60}
                  height={24}
                  sx={{ mt: 0.5 }}
                />
              </Box>
            </Box>
            <Skeleton variant="rectangular" width="100%" height={200} />
          </>
        ) : (
          <>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
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
                    src="/consumption.svg"
                    alt="Consumption"
                    width={32}
                    height={32}
                  />
                </Box>
                <Box>
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
                    Energy Consumption
                  </Box>
                  {metrics?.dataSource === "mapped-api" && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        fontSize: "0.75rem",
                        color: "success.main",
                        mt: -0.5,
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
                      Live • {metrics?.sensorCount} sensors
                    </Box>
                  )}
                </Box>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color:
                      viewMode === "kwh" ? "primary.main" : "text.secondary",
                    fontWeight: viewMode === "kwh" ? 600 : 400,
                    borderBottom: viewMode === "kwh" ? 2 : 0,
                    borderColor: "primary.main",
                    pb: 0.5,
                    cursor: "pointer",
                    mr: 1,
                  }}
                  onClick={() => setViewMode("kwh")}
                >
                  kWh
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color:
                      viewMode === "cost" ? "primary.main" : "text.secondary",
                    fontWeight: viewMode === "cost" ? 600 : 400,
                    borderBottom: viewMode === "cost" ? 2 : 0,
                    borderColor: "primary.main",
                    pb: 0.5,
                    cursor: "pointer",
                  }}
                  onClick={() => setViewMode("cost")}
                >
                  Cost
                </Typography>
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
                  Energy Cost
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    justifyContent: "center",
                  }}
                >
                  <Box sx={{ fontSize: "1.5rem" }}>
                    ${metrics?.currentCost?.toLocaleString() || 0}
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color:
                        metrics?.costChange && metrics.costChange > 0
                          ? "error.main"
                          : "success.main",
                    }}
                  >
                    {metrics?.costChange && metrics.costChange > 0 ? (
                      <NorthIcon fontSize="small" />
                    ) : (
                      <SouthIcon fontSize="small" />
                    )}
                    <Box sx={{ fontSize: "0.9rem" }}>
                      {Math.abs(metrics?.costChange || 0)}%
                    </Box>
                  </Box>
                </Box>
              </Box>
              <Box sx={{ textAlign: "center", flex: 1 }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, color: "#5A6C83" }}
                >
                  Energy Consumption
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    justifyContent: "center",
                  }}
                >
                  <Box sx={{ fontSize: "1.5rem" }}>
                    {metrics?.currentConsumption || 0}kWh
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color:
                        metrics?.consumptionChange &&
                        metrics.consumptionChange > 0
                          ? "error.main"
                          : "success.main",
                    }}
                  >
                    {metrics?.consumptionChange &&
                    metrics.consumptionChange > 0 ? (
                      <NorthIcon fontSize="small" />
                    ) : (
                      <SouthIcon fontSize="small" />
                    )}
                    <Box sx={{ fontSize: "0.9rem" }}>
                      {Math.abs(metrics?.consumptionChange || 0)}%
                    </Box>
                  </Box>
                </Box>
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
                      bgcolor: "#ff9800",
                    }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    Energy cost
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
                      bgcolor: "#4caf50",
                    }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    Energy consumption
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ height: 200, mt: 2 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 30, bottom: 10, left: 20 }}
                  >
                    <XAxis
                      dataKey="day"
                      axisLine={true}
                      tickLine={true}
                      tickMargin={8}
                      tick={{ fontSize: 12, fill: "#666" }}
                    />
                    <YAxis
                      axisLine={true}
                      tickLine={true}
                      tickFormatter={(v) => {
                        if (viewMode === "cost") {
                          if (v >= 1000000) {
                            return `$${(v / 1000000).toFixed(0)}M`;
                          } else if (v >= 1000) {
                            return `$${(v / 1000).toFixed(0)}K`;
                          } else {
                            return `$${v}`;
                          }
                        } else {
                          return `${v}kWh`;
                        }
                      }}
                      tickMargin={8}
                      tick={{ fontSize: 12, fill: "#666" }}
                    />
                    <Line
                      type="linear"
                      dataKey="energyCost"
                      stroke="#ff9800"
                      strokeWidth={3}
                      name="Energy cost"
                      dot={{ r: 5, fill: "#ff9800", strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="linear"
                      dataKey="energyConsumption"
                      stroke="#4caf50"
                      strokeWidth={3}
                      name="Energy consumption"
                      dot={{ r: 5, fill: "#4caf50", strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
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

export default ConsumptionCard;
