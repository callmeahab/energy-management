'use client';

import React from 'react';
import { Card, CardContent, Typography, Box, Chip, Button, Divider } from '@mui/material';
import { Warning, Error, Info, CheckCircle } from '@mui/icons-material';
import { useQuery } from '@apollo/client';
import { GET_ALERTS, GET_BUILDINGS, GET_SITES } from '@/lib/queries';
import { Building, Site, Alert } from '@/types/energy';

const mockAlerts = [
  {
    id: '1',
    type: 'efficiency',
    message: 'Switch off and save 27%',
    description: '8 sensors live your Air Condition is Consuming a low power for 12-time',
    severity: 'medium' as const,
    isRead: false
  },
  {
    id: '2',
    type: 'hvac',
    message: 'HVAC Efficiency Alert',
    description: 'Your Air Condition system may be damaged or need more...',
    severity: 'high' as const,
    isRead: false
  },
  {
    id: '3',
    type: 'filter',
    message: 'Filter Change Recommended',
    description: 'The Air filter unit 4 has reached its recommended service life based on...',
    severity: 'medium' as const,
    isRead: false
  },
  {
    id: '4',
    type: 'demand',
    message: 'Peak Demand Approaching',
    description: 'Energy demand is approaching peak capacity at this time each day...',
    severity: 'low' as const,
    isRead: false
  }
];

const AlertsCard = () => {
  const { data, loading, error } = useQuery(GET_ALERTS, {
    errorPolicy: 'ignore'
  });

  // Try to fetch real building data to generate contextual alerts
  const { data: buildingsData, loading: buildingsLoading, error: buildingsError } = useQuery(GET_BUILDINGS, {
    errorPolicy: 'ignore'
  });

  const { data: sitesData, loading: sitesLoading, error: sitesError } = useQuery(GET_SITES, {
    errorPolicy: 'ignore'
  });

  // Generate alerts based on real building data
  const generateAlertsFromBuildings = (buildings: Building[]) => {
    if (!buildings || buildings.length === 0) return [];
    
    const alerts: typeof mockAlerts = [];
    const totalFloors = buildings.reduce((sum, building) => sum + (building.floors?.length || 0), 0);
    const totalSpaces = buildings.reduce((sum, building) => 
      sum + (building.floors?.reduce((floorSum, floor) => floorSum + (floor.spaces?.length || 0), 0) || 0), 0
    );
    
    // Generate contextual alerts based on building portfolio
    if (totalSpaces > 50) {
      alerts.push({
        id: 'space-efficiency',
        type: 'efficiency',
        message: `${totalSpaces} spaces monitored - Optimize usage`,
        description: `Space efficiency can be improved across ${totalSpaces} monitored spaces`,
        severity: 'medium' as const,
        isRead: false
      });
    }
    
    if (totalFloors > 10) {
      alerts.push({
        id: 'hvac-multi-floor',
        type: 'hvac',
        message: `Multi-floor HVAC optimization available`,
        description: `${totalFloors} floors can benefit from centralized HVAC control`,
        severity: 'high' as const,
        isRead: false
      });
    }
    
    if (buildings.length > 3) {
      alerts.push({
        id: 'portfolio-management',
        type: 'demand',
        message: `${buildings.length} buildings - Centralized energy management recommended`,
        description: `Portfolio-wide energy management can reduce costs across ${buildings.length} buildings`,
        severity: 'low' as const,
        isRead: false
      });
    }
    
    // Add building-specific alerts
    buildings.forEach((building, index) => {
      if (building.floors && building.floors.length > 0) {
        const spacesCount = building.floors.reduce((sum, floor) => sum + (floor.spaces?.length || 0), 0);
        if (spacesCount > 20) {
          alerts.push({
            id: `building-${building.id}-filter`,
            type: 'filter',
            message: `${building.name || `Building ${index + 1}`} - Filter maintenance due`,
            description: `${spacesCount} spaces may have reduced air quality efficiency`,
            severity: 'medium' as const,
            isRead: false
          });
        }
      }
    });
    
    return alerts.slice(0, 4); // Limit to 4 alerts for UI purposes
  };

  // Determine alert data source
  let alerts = mockAlerts;
  let dataSource = 'demo';

  if (buildingsData?.buildings && Array.isArray(buildingsData.buildings) && buildingsData.buildings.length > 0) {
    const generatedAlerts = generateAlertsFromBuildings(buildingsData.buildings);
    if (generatedAlerts.length > 0) {
      alerts = generatedAlerts;
      dataSource = 'buildings';
      console.log(`Generated ${generatedAlerts.length} alerts from ${buildingsData.buildings.length} buildings`);
    }
  } else if (sitesData?.sites && Array.isArray(sitesData.sites)) {
    const allBuildings = sitesData.sites.flatMap((site: Site) => site.buildings || []);
    if (allBuildings.length > 0) {
      const generatedAlerts = generateAlertsFromBuildings(allBuildings);
      if (generatedAlerts.length > 0) {
        alerts = generatedAlerts;
        dataSource = 'sites';
        console.log(`Generated ${generatedAlerts.length} alerts from ${allBuildings.length} buildings across ${sitesData.sites.length} sites`);
      }
    }
  }

  const getAlertIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <Error color="error" fontSize="small" />;
      case 'medium':
        return <Warning color="warning" fontSize="small" />;
      case 'low':
        return <Info color="info" fontSize="small" />;
      default:
        return <CheckCircle color="success" fontSize="small" />;
    }
  };

  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'success';
    }
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            ⚠️ Alerts ({alerts.length})
          </Typography>
          <Chip 
            label={
              dataSource === 'buildings' ? `Live Alerts` :
              dataSource === 'sites' ? `Live Alerts` :
              "Demo Alerts"
            } 
            size="small" 
            color={dataSource !== 'demo' ? "success" : "default"}
            variant="outlined"
          />
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {alerts.map((alert, index) => (
            <Box key={alert.id}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                {getAlertIcon(alert.severity)}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight="medium">
                    {alert.message}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {alert.description || alert.type}
                  </Typography>
                  <Button size="small" sx={{ mt: 1, textTransform: 'none' }}>
                    More
                  </Button>
                </Box>
              </Box>
              {index < alerts.length - 1 && <Divider sx={{ mt: 2 }} />}
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

export default AlertsCard;