"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Divider,
  Skeleton,
} from "@mui/material";
import { Warning, Error, Info, CheckCircle } from "@mui/icons-material";
import { Alert } from "@/types/energy";
import { useBuildingData } from "@/contexts/DataContext";

const AlertsCard = () => {
  const { buildings, buildingsLoading } = useBuildingData();

  // Generate alerts based on real building data
  const alerts = useMemo(() => {
    if (!buildings || buildings.length === 0) return [];

    const generatedAlerts: Alert[] = [];
    const totalFloors = buildings.reduce(
      (sum, building) => sum + building.floors_count,
      0
    );
    const totalSpaces = buildings.reduce(
      (sum, building) => sum + building.spaces_count,
      0
    );

    // Generate contextual alerts based on building portfolio
    if (totalSpaces > 50) {
      generatedAlerts.push({
        id: "space-efficiency",
        type: "efficiency",
        message: `${totalSpaces} spaces monitored - Optimize usage`,
        description: `Space efficiency can be improved across ${totalSpaces} monitored spaces`,
        severity: "medium" as const,
        isRead: false,
        timestamp: new Date().toISOString(),
      });
    }

    if (totalFloors > 10) {
      generatedAlerts.push({
        id: "hvac-multi-floor",
        type: "hvac",
        message: `Multi-floor HVAC optimization available`,
        description: `${totalFloors} floors can benefit from centralized HVAC control`,
        severity: "high" as const,
        isRead: false,
        timestamp: new Date().toISOString(),
      });
    }

    if (buildings.length > 3) {
      generatedAlerts.push({
        id: "portfolio-management",
        type: "demand",
        message: `${buildings.length} buildings - Centralized energy management recommended`,
        description: `Portfolio-wide energy management can reduce costs across ${buildings.length} buildings`,
        severity: "low" as const,
        isRead: false,
        timestamp: new Date().toISOString(),
      });
    }

    // Add building-specific alerts
    buildings.forEach((building, index) => {
      if (building.spaces_count > 20) {
        generatedAlerts.push({
          id: `building-${building.id}-filter`,
          type: "filter",
          message: `${
            building.name || `Building ${index + 1}`
          } - Filter maintenance due`,
          description: `${building.spaces_count} spaces may have reduced air quality efficiency`,
          severity: "medium" as const,
          isRead: false,
          timestamp: new Date().toISOString(),
        });
      }
    });

    return generatedAlerts.slice(0, 4); // Limit to 4 alerts for UI purposes
  }, [buildings]);

  const getAlertIcon = (severity: string) => {
    switch (severity) {
      case "high":
        return <Error color="error" fontSize="small" />;
      case "medium":
        return <Warning color="warning" fontSize="small" />;
      case "low":
        return <Info color="info" fontSize="small" />;
      default:
        return <CheckCircle color="success" fontSize="small" />;
    }
  };

  return (
    <Card sx={{ height: "100%", py: 2, px: 3 }}>
      <CardContent>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
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
                <Image src="/alerts.svg" alt="Alerts" width={32} height={32} />
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
                  Alerts ({alerts.length})
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {buildingsLoading ? (
            [...Array(4)].map((_, index) => (
              <Box
                key={index}
                sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}
              >
                <Skeleton variant="circular" width={24} height={24} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="80%" />
                  <Skeleton variant="text" width="60%" />
                </Box>
              </Box>
            ))
          ) : alerts.length > 0 ? (
            alerts.map((alert: Alert, index: number) => (
              <Box key={alert.id}>
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                  {getAlertIcon(alert.severity)}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight="medium">
                      {alert.message}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.5 }}
                    >
                      {alert.description || alert.type}
                    </Typography>
                    <Button size="small" sx={{ mt: 1, textTransform: "none" }}>
                      More
                    </Button>
                  </Box>
                </Box>
                {index < alerts.length - 1 && <Divider sx={{ mt: 2 }} />}
              </Box>
            ))
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: "center", mt: 4 }}
            >
              No alerts at this time.
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default AlertsCard;
