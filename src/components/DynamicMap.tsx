'use client';

import React, { useState } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { Property } from '@/types/energy';

// Import react-map-gl components for Mapbox
import 'mapbox-gl/dist/mapbox-gl.css';
import Map, { Marker, Popup } from 'react-map-gl/mapbox';

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

interface DynamicMapProps {
  properties: Property[];
  selectedProperty: Property | null;
  onPropertySelect: (property: Property | null) => void;
}

const DynamicMap = ({ 
  properties, 
  selectedProperty, 
  onPropertySelect
}: DynamicMapProps) => {
  const [viewState, setViewState] = useState<ViewState>({
    longitude: -74.0060,
    latitude: 40.7128,
    zoom: 12
  });

  // Zoom to selected property
  React.useEffect(() => {
    if (selectedProperty) {
      setViewState({
        longitude: selectedProperty.coordinates.lng,
        latitude: selectedProperty.coordinates.lat,
        zoom: 15
      });
    }
  }, [selectedProperty]);

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'A+':
      case 'A':
        return 'success';
      case 'B+':
      case 'B':
        return 'warning';
      case 'C+':
      case 'C':
        return 'error';
      default:
        return 'default';
    }
  };

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= 90) return '#4caf50';
    if (efficiency >= 80) return '#ff9800';
    return '#f44336';
  };

  return (
    <Map
      {...viewState}
      onMove={evt => setViewState(evt.viewState)}
      mapStyle="mapbox://styles/mapbox/light-v11"
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      style={{ width: '100%', height: '100%' }}
    >
      {properties.map((property) => (
        <Marker
          key={property.id}
          longitude={property.coordinates.lng}
          latitude={property.coordinates.lat}
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onPropertySelect(property);
          }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: getEfficiencyColor(property.energyMetrics.efficiency),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: 2,
              border: '2px solid white'
            }}
          >
            {property.energyMetrics.efficiency}
          </Box>
        </Marker>
      ))}

      {selectedProperty && (
        <Popup
          longitude={selectedProperty.coordinates.lng}
          latitude={selectedProperty.coordinates.lat}
          onClose={() => onPropertySelect(null)}
          closeButton={true}
          closeOnClick={false}
          offset={10}
        >
          <Box sx={{ p: 1, minWidth: 200 }}>
            <Typography variant="subtitle2" fontWeight="bold">
              {selectedProperty.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {selectedProperty.address}
            </Typography>
            <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
              <Chip
                label={selectedProperty.energyRating}
                size="small"
                color={getRatingColor(selectedProperty.energyRating) as 'success' | 'warning' | 'error' | 'default'}
              />
              <Chip
                label={`${selectedProperty.energyMetrics.efficiency}% efficient`}
                size="small"
                variant="outlined"
              />
            </Box>
          </Box>
        </Popup>
      )}
    </Map>
  );
};

export default DynamicMap;