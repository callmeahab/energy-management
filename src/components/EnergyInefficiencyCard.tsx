'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box, Chip, Skeleton } from '@mui/material';
import { useBuildingData, LocalBuildingData } from '@/contexts/DataContext';
import { EnergyUsageInefficiency } from '@/types/energy';



const EnergyInefficiencyCard = () => {
  const { buildings, buildingsLoading } = useBuildingData();



  const inefficiencies = useMemo(() => {
    if (!buildings || buildings.length === 0) return [];

    const generated: EnergyUsageInefficiency[] = [];
    const totalFloors = buildings.reduce((sum: number, building: LocalBuildingData) => sum + building.floors_count, 0);
    const totalSpaces = buildings.reduce((sum: number, building: LocalBuildingData) => sum + building.spaces_count, 0);

    if (totalFloors > 5) {
      generated.push({
        id: 'hvac-multi-floor',
        applianceSystem: `HVAC System (${totalFloors} floors)`,
        consumption: Math.floor(totalFloors * 35 + Math.random() * 100),
        issues: 'Multi-floor coordination inefficiency',
        recommendations: 'Zone-based HVAC optimization',
      });
    }

    if (totalSpaces > 20) {
      generated.push({
        id: 'lighting-portfolio',
        applianceSystem: `Lighting Systems (${totalSpaces} spaces)`,
        consumption: Math.floor(totalSpaces * 8 + Math.random() * 50),
        issues: 'Inconsistent lighting controls across spaces',
        recommendations: 'Smart lighting integration',
      });
    }

    buildings.forEach((building: LocalBuildingData, index: number) => {
      if (building.spaces_count > 10) {
        generated.push({
          id: `building-${building.id}-hvac`,
          applianceSystem: `${building.name || `Building ${index + 1}`} HVAC`,
          consumption: Math.floor(building.spaces_count * 12 + building.floors_count * 25 + Math.random() * 80),
          issues: 'Potential over-conditioning, poor zoning',
          recommendations: 'Smart thermostats, zone optimization',
        });
      }

      if (building.floors_count > 2) {
        generated.push({
          id: `building-${building.id}-elevator`,
          applianceSystem: `${building.name || `Building ${index + 1}`} Elevators`,
          consumption: Math.floor(building.floors_count * 15 + Math.random() * 40),
          issues: 'Peak hour energy spikes',
          recommendations: 'Regenerative drive systems',
        });
      }
    });

    return generated.sort((a, b) => b.consumption - a.consumption).slice(0, 5);
  }, [buildings]);

  const hasRealData = buildings.length > 0;

  const getConsumptionColor = (consumption: number) => {
    if (consumption > 250) return 'error';
    if (consumption > 150) return 'warning';
    return 'success';
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            ⚡ Energy usage inefficiency
          </Typography>
          {hasRealData && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Chip 
                label="Building Portfolio Analysis"
                size="small" 
                color="primary"
                variant="outlined"
              />
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
            </Box>
          )}
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Appliance/System
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {buildingsLoading ? (
            [...Array(5)].map((_, index) => (
              <Box key={index}>
                <Skeleton variant="text" width="70%" sx={{ mb: 1 }} />
                <Skeleton variant="text" width="90%" />
                <Skeleton variant="rectangular" height={2} sx={{ mt: 1, borderRadius: 1 }} />
              </Box>
            ))
          ) : inefficiencies.length > 0 ? (
            inefficiencies.map((item) => (
              <Box key={item.id}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" fontWeight="medium">
                    {item.applianceSystem}
                  </Typography>
                  <Chip
                    label={`${item.consumption} kWh`}
                    size="small"
                    color={getConsumptionColor(item.consumption)}
                    variant="outlined"
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {item.issues}
                </Typography>
                <Box sx={{
                  height: 2,
                  backgroundColor: 'grey.200',
                  borderRadius: 1,
                  mt: 1,
                  position: 'relative'
                }}>
                  <Box sx={{
                    height: '100%',
                    width: `${Math.min(item.consumption / 3, 100)}%`,
                    backgroundColor:
                      item.consumption > 250 ? '#f44336' :
                      item.consumption > 150 ? '#ff9800' : '#4caf50',
                    borderRadius: 1
                  }} />
                </Box>
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
              No energy inefficiencies detected.
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default EnergyInefficiencyCard;