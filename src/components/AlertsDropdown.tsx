'use client';

import React, { useState, useMemo } from 'react';
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Box,
  Typography,
  Chip,
  Divider,
  Button,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  NotificationsOutlined,
  Warning,
  Error,
  Info,
  CheckCircle,
  Close,
  Settings
} from '@mui/icons-material';
import { Alert } from '@/types/energy';
import { useBuildingData } from '@/contexts/DataContext';

const AlertsDropdown = () => {
  const { buildings, buildingsLoading } = useBuildingData();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  // Generate alerts based on real building data
  const alerts = useMemo(() => {
    if (!buildings || buildings.length === 0) return [];
    
    const generatedAlerts: Alert[] = [];
    const totalFloors = buildings.reduce((sum, building) => sum + building.floors_count, 0);
    const totalSpaces = buildings.reduce((sum, building) => sum + building.spaces_count, 0);
    
    // Generate contextual alerts based on building portfolio
    if (totalSpaces > 50) {
      generatedAlerts.push({
        id: 'space-efficiency',
        type: 'efficiency',
        message: `${totalSpaces} spaces monitored - Optimize usage`,
        description: `Space efficiency can be improved across ${totalSpaces} monitored spaces`,
        severity: 'medium' as const,
        isRead: false,
        timestamp: new Date().toISOString()
      });
    }
    
    if (totalFloors > 10) {
      generatedAlerts.push({
        id: 'hvac-multi-floor',
        type: 'hvac',
        message: `Multi-floor HVAC optimization available`,
        description: `${totalFloors} floors can benefit from centralized HVAC control`,
        severity: 'high' as const,
        isRead: false,
        timestamp: new Date().toISOString()
      });
    }
    
    if (buildings.length > 3) {
      generatedAlerts.push({
        id: 'portfolio-management',
        type: 'demand',
        message: `${buildings.length} buildings - Centralized energy management recommended`,
        description: `Portfolio-wide energy management can reduce costs across ${buildings.length} buildings`,
        severity: 'low' as const,
        isRead: false,
        timestamp: new Date().toISOString()
      });
    }
    
    // Add building-specific alerts
    buildings.forEach((building, index) => {
      if (building.spaces_count > 20) {
        generatedAlerts.push({
          id: `building-${building.id}-filter`,
          type: 'filter',
          message: `${building.name || `Building ${index + 1}`} - Filter maintenance due`,
          description: `${building.spaces_count} spaces may have reduced air quality efficiency`,
          severity: 'medium' as const,
          isRead: false,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    return generatedAlerts.slice(0, 6); // Limit to 6 alerts for dropdown
  }, [buildings]);

  const unreadCount = alerts.filter(alert => !alert.isRead).length;

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

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
        return '#ffebee';
      case 'medium':
        return '#fff8e1';
      case 'low':
        return '#e3f2fd';
      default:
        return '#e8f5e8';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const alertTime = new Date(timestamp);
    const diffMs = now.getTime() - alertTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  return (
    <>
      <IconButton
        onClick={handleClick}
        sx={{
          border: 1,
          borderColor: "#DBDBDB",
          backgroundColor: "#ffffff",
        }}
        title="View Alerts"
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsOutlined />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          elevation: 8,
          sx: {
            minWidth: 380,
            maxWidth: 420,
            maxHeight: 500,
            mt: 1,
            '& .MuiMenuItem-root': {
              px: 0,
            },
          },
        }}
      >
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
              Alerts
            </Typography>
            {buildings.length > 0 && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Chip 
                  label="Building Portfolio"
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
          <Typography variant="caption" color="text.secondary">
            {unreadCount} new
          </Typography>
        </Box>
        
        <Divider />

        {/* Alerts List */}
        {buildingsLoading ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Loading alerts...
            </Typography>
          </Box>
        ) : alerts.length > 0 ? (
          <>
            {alerts.map((alert, index) => (
              <MenuItem key={alert.id} sx={{ 
                py: 0,
                '&:hover': { 
                  backgroundColor: getAlertColor(alert.severity) + '40'
                }
              }}>
                <Box sx={{ 
                  width: '100%', 
                  px: 2, 
                  py: 1.5,
                  backgroundColor: alert.isRead ? 'transparent' : getAlertColor(alert.severity) + '20',
                  borderLeft: `3px solid ${
                    alert.severity === 'high' ? '#f44336' :
                    alert.severity === 'medium' ? '#ff9800' :
                    alert.severity === 'low' ? '#2196f3' : '#4caf50'
                  }`,
                  ml: 0.5,
                  mr: 0.5,
                  borderRadius: 1
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ mt: 0.5 }}>
                      {getAlertIcon(alert.severity)}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography 
                        variant="body2" 
                        fontWeight={alert.isRead ? "normal" : "medium"}
                        sx={{ 
                          mb: 0.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {alert.message}
                      </Typography>
                      <Typography 
                        variant="caption" 
                        color="text.secondary" 
                        sx={{ 
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {alert.description || alert.type}
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {formatTimeAgo(alert.timestamp)}
                        </Typography>
                        <Chip 
                          label={alert.severity.toUpperCase()} 
                          size="small"
                          sx={{ 
                            height: 18,
                            fontSize: '0.65rem',
                            backgroundColor: getAlertColor(alert.severity),
                            color: 
                              alert.severity === 'high' ? '#d32f2f' :
                              alert.severity === 'medium' ? '#f57c00' :
                              alert.severity === 'low' ? '#1976d2' : '#388e3c'
                          }}
                        />
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </MenuItem>
            ))}
            
            <Divider sx={{ mt: 1 }} />
            
            {/* Footer Actions */}
            <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button
                size="small"
                startIcon={<Settings />}
                onClick={handleClose}
                sx={{ textTransform: 'none' }}
              >
                Manage Alerts
              </Button>
              <Button
                size="small"
                onClick={handleClose}
                sx={{ textTransform: 'none' }}
              >
                Mark All Read
              </Button>
            </Box>
          </>
        ) : (
          <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
            <CheckCircle color="success" sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No alerts at this time
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Your building portfolio is performing well
            </Typography>
          </Box>
        )}
      </Menu>
    </>
  );
};

export default AlertsDropdown;