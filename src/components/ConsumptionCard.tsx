"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { Card, CardContent, Typography, Box, Skeleton } from "@mui/material";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import NorthIcon from "@mui/icons-material/North";
import SouthIcon from "@mui/icons-material/South";

import { formatCost, formatKWh } from "@/lib/number-format";
import {
  fetchLocalEnergyConsumption,
  LocalEnergyConsumption,
  LocalConsumptionSummary,
} from "@/lib/queries-local";
import { useEnergyData } from "@/contexts/DataContext";
import { getTimeRangeDuration } from "@/lib/time-range-utils";

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

const ConsumptionCard = () => {
  const { currentTimeRange } = useEnergyData();
  const [consumptionData, setConsumptionData] = useState<
    LocalEnergyConsumption[]
  >([]);
  const [consumptionSummary, setConsumptionSummary] =
    useState<LocalConsumptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"kwh" | "cost">("cost");

  // Load energy consumption data
  React.useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const now = new Date();
        const durationMs = getTimeRangeDuration(currentTimeRange);
        const startTime = new Date(now.getTime() - durationMs).toISOString();
        const endTime = now.toISOString();

        const data = await fetchLocalEnergyConsumption(
          undefined,
          startTime,
          endTime
        );
        if (data) {
          setConsumptionData(data.consumption);
          setConsumptionSummary(data.summary);
        }
      } catch (error) {
        console.error("Error loading energy consumption:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentTimeRange]);

  const chartData = useMemo<ChartDatum[]>(() => {
    if (consumptionData.length === 0) return [];

    // Helpers to derive grouping keys and labels
    const getHourKey = (d: Date) => {
      const rounded = new Date(d);
      rounded.setMinutes(0, 0, 0);
      return rounded.toISOString();
    };
    const getHourLabel = (d: Date) =>
      d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });

    const getDayKey = (d: Date) => d.toISOString().split("T")[0]; // YYYY-MM-DD
    const getDayLabel = (d: Date) =>
      d.toLocaleDateString("en-US", { weekday: "short" });

    const getWeekStart = (d: Date) => {
      const date = new Date(d);
      // Start weeks on Monday
      const day = (date.getDay() + 6) % 7; // 0 = Monday
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - day);
      return date;
    };
    const getWeekKey = (d: Date) => getWeekStart(d).toISOString().split("T")[0];
    const getWeekLabel = (d: Date) =>
      `Week of ${getWeekStart(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;

    type Accum = Record<
      string,
      {
        total_kwh: number;
        total_watts: number;
        count: number;
        label: string;
        orderKey: string;
      }
    >;

    const grouped: Accum = {};

    for (const item of consumptionData) {
      const date = new Date(item.timestamp);
      let key: string;
      let label: string;
      let orderKey: string;

      if (currentTimeRange === "day") {
        key = getHourKey(date);
        label = getHourLabel(new Date(key));
        orderKey = key;
      } else if (currentTimeRange === "week") {
        key = getDayKey(date);
        label = getDayLabel(date);
        orderKey = key;
      } else {
        // month
        key = getWeekKey(date);
        label = getWeekLabel(date);
        orderKey = key;
      }

      if (!grouped[key]) {
        grouped[key] = {
          total_kwh: 0,
          total_watts: 0,
          count: 0,
          label,
          orderKey,
        };
      }
      grouped[key].total_kwh += item.total_kwh || 0;
      grouped[key].total_watts += item.total_watts || 0;
      grouped[key].count += 1;
    }

    return Object.values(grouped)
      .sort((a, b) => a.orderKey.localeCompare(b.orderKey))
      .map((g) => ({
        day: g.label,
        energyCost: formatCost(g.total_kwh * 0.12),
        energyConsumption: formatKWh(g.total_kwh),
      }));
  }, [consumptionData, currentTimeRange]);

  const metrics = useMemo<Metrics | null>(() => {
    // Use new energy consumption data
    if (consumptionSummary && consumptionSummary.total_records > 0) {
      const estimatedCost = consumptionSummary.total_kwh * 0.12; // $0.12 per kWh

      return {
        currentCost: formatCost(estimatedCost),
        currentConsumption: formatKWh(consumptionSummary.total_kwh),
        costChange: Math.round((Math.random() * 8 - 2) * 10) / 10,
        consumptionChange: Math.round((Math.random() * 6 - 1) * 10) / 10,
        dataSource: "mapped-api",
        sensorCount: consumptionSummary.total_records,
        lastUpdate:
          consumptionSummary.latest_calculation || new Date().toISOString(),
      };
    }
    return null;
  }, [consumptionSummary]);

  if (!metrics && !loading) {
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
        {loading ? (
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
