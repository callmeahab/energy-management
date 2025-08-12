'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box, LinearProgress, Chip, Skeleton, useTheme, useMediaQuery } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useBuildingData, LocalBuildingData } from '@/contexts/DataContext';

const SpaceEfficiencyCard = () => {
  const { buildings, buildingsLoading } = useBuildingData();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const isSmall = useMediaQuery(theme.breakpoints.down('lg'));

  const spaceData = useMemo(() => {
    if (!buildings || buildings.length === 0) {
      return null;
    }

    // Adjust number of rooms based on screen size
    const roomCount = isMobile ? 3 : isTablet ? 4 : 6;
    
    const rooms = buildings
      .filter((b: LocalBuildingData) => b.spaces_count > 0)
      .slice(0, roomCount)
      .map((building: LocalBuildingData, index: number) => {
        const baseEfficiency = 80 - (index * 5) - Math.random() * 15;
        // Truncate building names on smaller screens
        const displayName = building.name || `Building ${building.id.substring(0, 4)}`;
        const truncatedName = isMobile && displayName.length > 15 
          ? `${displayName.substring(0, 15)}...` 
          : isTablet && displayName.length > 20
          ? `${displayName.substring(0, 20)}...`
          : displayName;
          
        return {
          name: truncatedName,
          percentage: Math.max(45, Math.min(95, Math.floor(baseEfficiency))),
        };
      });

    if (rooms.length === 0) return null;

    return {
      peakHours: [
        { name: '9 AM - 12 PM', value: 45, color: '#4caf50' },
        { name: '12 PM - 4 PM', value: 35, color: '#2196f3' },
        { name: '4 PM - 8 PM', value: 20, color: '#ff9800' },
      ],
      rooms,
    };
  }, [buildings, isMobile, isTablet]);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: isMobile ? 2 : 3 }}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'flex-start' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          mb: 2,
          gap: isMobile ? 1 : 0
        }}>
          <Typography variant={isMobile ? "subtitle1" : "h6"} gutterBottom={!isMobile}>
            🏢 Space efficiency
          </Typography>
          {buildings.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Chip 
                label={isMobile ? "Portfolio" : "Building Portfolio Data"}
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

        {buildingsLoading ? (
          <>
            <Skeleton variant="circular" width={isMobile ? 60 : 80} height={isMobile ? 60 : 80} sx={{ mx: 'auto', my: 2 }} />
            <Skeleton variant="text" width="80%" sx={{ mb: 1 }} />
            <Skeleton variant="rectangular" width="100%" height={isMobile ? 14 : 18} sx={{ mb: 0.5 }} />
            <Skeleton variant="rectangular" width="100%" height={isMobile ? 14 : 18} sx={{ mb: 0.5 }} />
            <Skeleton variant="rectangular" width="100%" height={isMobile ? 14 : 18} sx={{ mb: 0.5 }} />
          </>
        ) : spaceData ? (
          <>
            <Box sx={{ mb: isMobile ? 2 : 3 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Peak usage hours
              </Typography>
              <Box sx={{ 
                height: isMobile ? 100 : isTablet ? 110 : 120, 
                mb: isMobile ? 1 : 2,
                display: 'flex',
                flexDirection: isMobile ? 'row' : 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Box sx={{ 
                  width: isMobile ? '60%' : '100%', 
                  height: '100%',
                  minWidth: isMobile ? 80 : 'auto'
                }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={spaceData.peakHours} 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={isMobile ? 15 : 25} 
                        outerRadius={isMobile ? 35 : isTablet ? 45 : 50} 
                        dataKey="value"
                      >
                        {spaceData.peakHours.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
                {isMobile && (
                  <Box sx={{ 
                    width: '40%', 
                    pl: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 0.5
                  }}>
                    {spaceData.peakHours.map((entry, index) => (
                      <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: '50%', 
                          bgcolor: entry.color 
                        }} />
                        <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
                          {entry.value}%
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Occupancy by room
              </Typography>
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: isMobile ? 1 : 1.5 
              }}>
                {spaceData.rooms.map((room, index) => (
                  <Box key={index}>
                    <Box sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      mb: 0.5,
                      alignItems: 'flex-end'
                    }}>
                      <Typography 
                        variant="body2" 
                        fontSize={isMobile ? "0.8rem" : "0.875rem"}
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: isMobile ? '70%' : '80%'
                        }}
                      >
                        {room.name}
                      </Typography>
                      <Typography 
                        variant="body2" 
                        fontWeight="medium"
                        fontSize={isMobile ? "0.8rem" : "0.875rem"}
                      >
                        {room.percentage}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={room.percentage}
                      sx={{
                        height: isMobile ? 3 : 4,
                        borderRadius: 2,
                        backgroundColor: 'grey.200',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 2,
                          backgroundColor: room.percentage > 80 ? '#4caf50' : room.percentage > 60 ? '#ff9800' : '#f44336',
                        },
                      }}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          </>
        ) : (
          <Typography sx={{ textAlign: 'center', mt: 4 }}>
            Not enough data to calculate space efficiency.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default SpaceEfficiencyCard;