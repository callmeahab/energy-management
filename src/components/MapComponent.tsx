'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Property } from '@/types/energy';

interface MapComponentProps {
  properties: Property[];
  selectedProperty: Property | null;
  onPropertySelect: (property: Property | null) => void;
  loading?: boolean;
  error?: Error | null;
}

const DynamicMap = dynamic(() => import('./DynamicMap'), {
  ssr: false,
  loading: () => (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <CircularProgress />
      <Typography variant="body2" sx={{ ml: 2 }}>Loading map...</Typography>
    </Box>
  )
});

const MapComponent = ({ 
  properties, 
  selectedProperty, 
  onPropertySelect,
  loading = false,
  error = null
}: MapComponentProps) => {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ ml: 2 }}>Loading properties...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column' }}>
        <Typography variant="body2" color="error">Failed to load map</Typography>
        <Typography variant="caption" color="text.secondary">{error.message}</Typography>
      </Box>
    );
  }

  return (
    <DynamicMap
      properties={properties}
      selectedProperty={selectedProperty}
      onPropertySelect={onPropertySelect}
    />
  );
};

export default MapComponent;