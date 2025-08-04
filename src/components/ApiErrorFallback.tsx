'use client';

import React from 'react';
import { Box, Typography, Card, CardContent, Alert } from '@mui/material';
import { CloudOff } from '@mui/icons-material';

interface ApiErrorFallbackProps {
  title?: string;
  message?: string;
}

const ApiErrorFallback = ({ 
  title = "API Connection Issue", 
  message = "Unable to connect to the energy data API. Using demo data for now." 
}: ApiErrorFallbackProps) => {
  return (
    <Box sx={{ mb: 2 }}>
      <Alert severity="warning" sx={{ display: 'flex', alignItems: 'center' }}>
        <CloudOff sx={{ mr: 1 }} />
        <Box>
          <Typography variant="subtitle2" fontWeight="medium">
            {title}
          </Typography>
          <Typography variant="caption">
            {message}
          </Typography>
        </Box>
      </Alert>
    </Box>
  );
};

export default ApiErrorFallback;