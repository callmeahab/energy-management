'use client';

import React from 'react';
import { Box, Typography, Card, Switch, FormControlLabel, Chip } from '@mui/material';
import { useQuery } from '@apollo/client';
import { GET_BUILDINGS, GET_FLOORS } from '@/lib/queries';
import { Building, Floor as ApiFloor, Space } from '@/types/energy';

interface BuildingFloorPlanProps {
  floorId: number;
}

const mockFloorData = [
  {
    id: 0,
    name: 'Lobby',
    rooms: [
      { id: '1', name: 'LOBBY AREA', temperature: 72, area: 45, x: 10, y: 10, width: 200, height: 100 }
    ],
    utilization: [
      { name: 'Floor 1', percentage: 92 },
      { name: 'Floor 3', percentage: 88 },
      { name: 'Lobby', percentage: 72 },
      { name: 'Floor 2', percentage: 65 }
    ],
    spaceUtilization: [
      { name: 'Conference room - Big', percentage: 92 },
      { name: 'Conference room - Small', percentage: 72 },
      { name: 'Office 1', percentage: 88 },
      { name: 'Office 2', percentage: 65 }
    ]
  },
  {
    id: 1,
    name: 'Floor 1',
    rooms: [
      { id: '1', name: 'CONFERENCE ROOM - SMALL', temperature: 77, area: 16, x: 10, y: 10, width: 180, height: 120 },
      { id: '2', name: 'OFFICE 1', temperature: 73.4, area: 12, x: 200, y: 10, width: 150, height: 80 },
      { id: '3', name: 'CONFERENCE ROOM - BIG', temperature: 82.4, area: 22, x: 10, y: 140, width: 180, height: 120 },
      { id: '4', name: 'HALLWAY', temperature: 70, area: 3, x: 200, y: 100, width: 80, height: 160 },
      { id: '5', name: 'OFFICE 2', temperature: 68, area: 10.8, x: 290, y: 140, width: 150, height: 120 }
    ],
    utilization: [
      { name: 'Floor 1', percentage: 92 },
      { name: 'Floor 3', percentage: 88 },
      { name: 'Lobby', percentage: 72 },
      { name: 'Floor 2', percentage: 65 }
    ],
    spaceUtilization: [
      { name: 'Conference room - Big', percentage: 92 },
      { name: 'Conference room - Small', percentage: 72 },
      { name: 'Office 1', percentage: 88 },
      { name: 'Office 2', percentage: 65 }
    ]
  }
];

const BuildingFloorPlan = ({ floorId }: BuildingFloorPlanProps) => {
  const { data: buildingsData, loading: buildingsLoading, error: buildingsError } = useQuery(GET_BUILDINGS, {
    errorPolicy: 'ignore'
  });

  const { data: floorsData, loading: floorsLoading, error: floorsError } = useQuery(GET_FLOORS, {
    errorPolicy: 'ignore'
  });

  // Determine which data to use
  const loading = buildingsLoading || floorsLoading;
  const error = buildingsError || floorsError;
  
  let currentFloor = mockFloorData[floorId] || mockFloorData[0];
  let dataSource = 'demo';
  
  // Try to use real floor data if available
  if (floorsData?.floors && Array.isArray(floorsData.floors) && floorsData.floors.length > floorId) {
    const realFloor = floorsData.floors[floorId];
    if (realFloor) {
      currentFloor = {
        id: floorId,
        name: realFloor.name || `Floor ${floorId + 1}`,
        rooms: realFloor.spaces?.map((space: Space, index: number) => ({
          id: space.id,
          name: space.name || space.description || `Space ${index + 1}`,
          temperature: 70 + Math.random() * 15, // Mock temperature
          area: 10 + Math.random() * 20, // Mock area
          x: (index % 3) * 150 + 10,
          y: Math.floor(index / 3) * 100 + 10,
          width: 140,
          height: 90
        })) || [],
        utilization: mockFloorData[0].utilization,
        spaceUtilization: mockFloorData[0].spaceUtilization
      };
      dataSource = 'floors';
    }
  } else if (buildingsData?.buildings && Array.isArray(buildingsData.buildings) && buildingsData.buildings.length > 0) {
    // Use building floor data if available
    const building = buildingsData.buildings[0]; // Use first building
    if (building.floors && building.floors.length > floorId) {
      const realFloor = building.floors[floorId];
      currentFloor = {
        id: floorId,
        name: realFloor.name || realFloor.description || `Floor ${floorId + 1}`,
        rooms: realFloor.spaces?.map((space: Space, index: number) => ({
          id: space.id,
          name: space.name || space.description || `Space ${index + 1}`,
          temperature: 70 + Math.random() * 15, // Mock temperature
          area: 10 + Math.random() * 20, // Mock area
          x: (index % 3) * 150 + 10,
          y: Math.floor(index / 3) * 100 + 10,
          width: 140,
          height: 90
        })) || [],
        utilization: mockFloorData[0].utilization,
        spaceUtilization: mockFloorData[0].spaceUtilization
      };
      dataSource = 'buildings';
    }
  }
  
  const occupancyPercentage = 68;
  const peopleCount = 144;

  const getRoomColor = (temperature: number) => {
    if (temperature > 80) return '#ffcdd2'; // Light red
    if (temperature > 75) return '#fff3e0'; // Light orange
    if (temperature > 70) return '#f3e5f5'; // Light purple
    return '#e8f5e8'; // Light green
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <FormControlLabel
            control={<Switch defaultChecked />}
            label="Switch Auto Optimization On / Off"
            sx={{ mb: 2 }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h3" color="primary">
              {occupancyPercentage}%
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Building occupancy
            </Typography>
            <Chip label="LIVE" color="error" size="small" sx={{ mt: 1 }} />
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h3" color="primary">
              {peopleCount}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              People count
            </Typography>
            <Chip label="LIVE" color="error" size="small" sx={{ mt: 1 }} />
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Chip 
              label={
                dataSource === 'floors' ? `Floor Data` :
                dataSource === 'buildings' ? `Building Data` :
                "Demo Layout"
              } 
              size="small" 
              color={dataSource !== 'demo' ? "success" : "default"}
              variant="outlined"
            />
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
              {currentFloor.rooms?.length || 0} spaces
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 4 }}>
        <Box sx={{ flex: 1 }}>
          <Card sx={{ p: 2, height: 400, position: 'relative', overflow: 'hidden' }}>
            <svg width="100%" height="100%" viewBox="0 0 450 270">
              {currentFloor.rooms.map((room) => (
                <g key={room.id}>
                  <rect
                    x={room.x}
                    y={room.y}
                    width={room.width}
                    height={room.height}
                    fill={getRoomColor(room.temperature)}
                    stroke="#333"
                    strokeWidth="2"
                  />
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + room.height / 2 - 10}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="bold"
                  >
                    {room.name}
                  </text>
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + room.height / 2 + 5}
                    textAnchor="middle"
                    fontSize="10"
                  >
                    {room.area} sq m
                  </text>
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + room.height / 2 + 20}
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="bold"
                    fill="#1976d2"
                  >
                    {room.temperature}°F / {Math.round((room.temperature - 32) * 5/9)}°C
                  </text>
                </g>
              ))}
            </svg>
          </Card>
        </Box>

        <Box sx={{ minWidth: 300 }}>
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom>
              🏗️ Space utilization
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {currentFloor.spaceUtilization.map((item, index) => (
                <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">{item.name}</Typography>
                  <Typography variant="body2" fontWeight="medium">{item.percentage}%</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom>
              🔢 Floor utilization rankings
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {currentFloor.utilization.map((item, index) => (
                <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ 
                    width: 24, 
                    height: 24, 
                    borderRadius: '50%', 
                    backgroundColor: 'primary.main',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {index + 1}
                  </Box>
                  <Typography variant="body2" sx={{ flex: 1 }}>{item.name}</Typography>
                  <Typography variant="body2" fontWeight="medium">{item.percentage}%</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box>
            <Typography variant="h6" gutterBottom>
              💡 Energy usage inefficiency
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Conference room - Big</Typography>
                <Typography variant="body2" fontWeight="medium">300 kWh</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                High energy draw, often left on
              </Typography>
              <Box sx={{ height: 2, backgroundColor: 'error.main', borderRadius: 1, mb: 2 }} />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Conference room - Small</Typography>
                <Typography variant="body2" fontWeight="medium">244 kWh</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Constant cycling poor sealing, older model
              </Typography>
              <Box sx={{ height: 2, backgroundColor: 'warning.main', borderRadius: 1, mb: 2 }} />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Office 1</Typography>
                <Typography variant="body2" fontWeight="medium">195 kWh</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Poor insulation, long runtime
              </Typography>
              <Box sx={{ height: 2, backgroundColor: 'warning.main', borderRadius: 1 }} />
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          📊 Consumption
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Typography variant="body2">kWh</Typography>
          <Typography variant="body2">Cost</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 4 }}>
          <Box>
            <Typography variant="h4" color="primary">
              $8,028
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Energy Cost
            </Typography>
            <Chip label="↑3.8%" size="small" color="error" sx={{ mt: 0.5 }} />
          </Box>
          <Box>
            <Typography variant="h4" color="success.main">
              408kWh
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Energy Consumption
            </Typography>
            <Chip label="↑1.8%" size="small" color="success" sx={{ mt: 0.5 }} />
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 12, height: 12, backgroundColor: '#ff9800', borderRadius: 1 }} />
            <Typography variant="body2">Energy cost</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 12, height: 12, backgroundColor: '#4caf50', borderRadius: 1 }} />
            <Typography variant="body2">Renewable energy cost</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default BuildingFloorPlan;