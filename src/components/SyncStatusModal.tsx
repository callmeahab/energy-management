'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Alert,
  Divider,
  IconButton,
  Collapse
} from '@mui/material';
import {
  Sync,
  CheckCircle,
  Error,
  Warning,
  Storage,
  ExpandMore,
  ExpandLess,
  Refresh,
  Close
} from '@mui/icons-material';
import { fetchSyncStatus, triggerSync } from '@/lib/queries-local';
import { useDataContext } from '@/contexts/DataContext';

interface SyncStatusData {
  syncHistory: Array<{
    id: number;
    status: string;
    records_synced: number;
    errors_count: number;
    error_message?: string;
    duration_ms: number;
    created_at: string;
  }>;
  databaseStats: {
    buildings: number;
    floors: number;
    spaces: number;
    energyRecords: number;
  };
  lastSync: {
    status: string;
    last_sync_timestamp: string;
    records_synced: number;
    errors_count: number;
    duration_ms: number;
  } | null;
}

interface SyncStatusModalProps {
  open: boolean;
  onClose: () => void;
}

const SyncStatusModal: React.FC<SyncStatusModalProps> = ({ open, onClose }) => {
  const { refreshBuildings, refreshEnergyData, currentTimeRange } = useDataContext();
  const [syncData, setSyncData] = useState<SyncStatusData | null>(null);
  const [isLoading, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  const loadSyncStatus = async () => {
    try {
      const data = await fetchSyncStatus();
      if (data) {
        setSyncData(data);
        setError(null);
      } else {
        setError('Failed to load sync status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  useEffect(() => {
    if (open) {
      loadSyncStatus();
    }
  }, [open]);

  const handleSync = async (syncType: 'full' | 'incremental') => {
    setSyncing(true);
    setError(null);
    setLastSyncResult(null);

    try {
      const result = await triggerSync(syncType);
      
      if (result.success) {
        setLastSyncResult(`✅ ${result.message}`);
        // Refresh status after a short delay
        setTimeout(loadSyncStatus, 2000);
        
        // Trigger immediate UI refresh
        console.log('SyncStatusModal: Refreshing UI data after manual sync...');
        setTimeout(async () => {
          await Promise.all([
            refreshBuildings(),
            refreshEnergyData(currentTimeRange)
          ]);
          console.log('SyncStatusModal: UI data refreshed');
        }, 1000);
      } else {
        setLastSyncResult(`❌ ${result.message}`);
        setError(result.message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      setError(message);
      setLastSyncResult(`❌ ${message}`);
    } finally {
      setSyncing(false);
    }
  };

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle color="success" fontSize="small" />;
      case 'partial_success':
        return <Warning color="warning" fontSize="small" />;
      case 'error':
        return <Error color="error" fontSize="small" />;
      default:
        return <Sync fontSize="small" />;
    }
  };

  const getSyncStatusColor = (status: string): 'success' | 'warning' | 'error' | 'default' => {
    switch (status) {
      case 'success':
        return 'success';
      case 'partial_success':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '500px' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Storage />
            Data Sync Status
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton size="small" onClick={loadSyncStatus} disabled={isLoading}>
              <Refresh />
            </IconButton>
            <IconButton size="small" onClick={onClose}>
              <Close />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {lastSyncResult && (
          <Alert severity={lastSyncResult.includes('✅') ? 'success' : 'error'} sx={{ mb: 2 }}>
            {lastSyncResult}
          </Alert>
        )}

        {isLoading && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress />
            <Typography variant="caption" sx={{ mt: 1 }}>
              Synchronizing data...
            </Typography>
          </Box>
        )}

        {syncData && (
          <>
            {/* Data Source Info */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Data Source
                </Typography>
                <Chip 
                  label="Mapped.com API" 
                  size="small" 
                  color="primary"
                  variant="outlined"
                />
                {syncData.databaseStats.energyRecords > 0 && (
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
                )}
              </Box>
            </Box>

            {/* Database Statistics */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Local Database
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Chip 
                  label={`${syncData.databaseStats.buildings} Buildings`} 
                  size="small" 
                  variant="outlined" 
                />
                <Chip 
                  label={`${syncData.databaseStats.floors} Floors`} 
                  size="small" 
                  variant="outlined" 
                />
                <Chip 
                  label={`${syncData.databaseStats.spaces} Spaces`} 
                  size="small" 
                  variant="outlined" 
                />
                <Chip 
                  label={`${syncData.databaseStats.energyRecords} Energy Records`} 
                  size="small" 
                  variant="outlined" 
                  color={syncData.databaseStats.energyRecords > 0 ? "success" : "default"}
                />
              </Box>
            </Box>

            {/* Last Sync Status */}
            {syncData.lastSync && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Last Synchronization
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {getSyncStatusIcon(syncData.lastSync.status)}
                  <Chip
                    label={syncData.lastSync.status.replace('_', ' ').toUpperCase()}
                    size="small"
                    color={getSyncStatusColor(syncData.lastSync.status)}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {formatTimestamp(syncData.lastSync.last_sync_timestamp)}
                  </Typography>
                </Box>
                <Typography variant="caption" display="block">
                  {syncData.lastSync.records_synced} records synced in {formatDuration(syncData.lastSync.duration_ms)}
                  {syncData.lastSync.errors_count > 0 && ` • ${syncData.lastSync.errors_count} errors`}
                </Typography>
              </Box>
            )}

            {/* Sync Controls */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Sync />}
                onClick={() => handleSync('incremental')}
                disabled={isLoading}
              >
                Incremental Sync
              </Button>
              <Button
                variant="outlined"
                color="warning"
                size="small"
                startIcon={<Refresh />}
                onClick={() => handleSync('full')}
                disabled={isLoading}
              >
                Full Sync
              </Button>
            </Box>

            {/* Sync History Toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Recent Sync History
              </Typography>
              <IconButton size="small" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ExpandLess /> : <ExpandMore />}
              </IconButton>
            </Box>

            {/* Sync History */}
            <Collapse in={expanded}>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                {syncData.syncHistory.slice(0, 5).map((sync, index) => (
                  <Box key={sync.id} sx={{ py: 1, borderBottom: index < 4 ? '1px solid' : 'none', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      {getSyncStatusIcon(sync.status)}
                      <Typography variant="caption" fontWeight="medium">
                        {sync.status.replace('_', ' ').toUpperCase()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(sync.created_at)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {sync.records_synced} records • {formatDuration(sync.duration_ms)}
                      {sync.errors_count > 0 && ` • ${sync.errors_count} errors`}
                    </Typography>
                    {sync.error_message && (
                      <Typography variant="caption" display="block" color="error.main">
                        {sync.error_message}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Collapse>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SyncStatusModal;