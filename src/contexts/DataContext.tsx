'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { TimeRange } from '@/types/energy';

// Types for our data context
export interface LocalBuildingData {
  id: string;
  name: string;
  description?: string;
  exact_type?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_country?: string;
  latitude?: number;
  longitude?: number;
  floors_count: number;
  spaces_count: number;
  sync_timestamp: string;
  energyStats?: {
    avg_consumption: number;
    total_consumption: number;
    avg_cost: number;
    total_cost: number;
    avg_efficiency: number;
    record_count: number;
    latest_record: string;
  };
}

export interface LocalEnergyData {
  period: string;
  avg_consumption: number;
  total_consumption: number;
  avg_cost: number;
  total_cost: number;
  avg_efficiency: number;
  avg_temperature: number;
  avg_occupancy: number;
  record_count: number;
}

interface EnergyDataSummary {
  total_records: number;
  avg_consumption: number;
  total_consumption: number;
  avg_cost: number;
  total_cost: number;
  avg_efficiency: number;
  earliest_record: string;
  latest_record: string;
}

interface DataContextType {
  // Building data
  buildings: LocalBuildingData[];
  buildingsLoading: boolean;
  buildingsError: string | null;
  refreshBuildings: () => Promise<void>;
  
  // Energy data
  energyData: LocalEnergyData[];
  energySummary: EnergyDataSummary | null;
  energyLoading: boolean;
  energyError: string | null;
  currentTimeRange: TimeRange;
  refreshEnergyData: (timeRange?: TimeRange) => Promise<void>;
  
  // Sync status
  lastSyncTime: string | null;
  triggerSync: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

interface DataProviderProps {
  children: ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  // Hydration state
  const [isHydrated, setIsHydrated] = useState(false);
  
  // Building data state
  const [buildings, setBuildings] = useState<LocalBuildingData[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(true);
  const [buildingsError, setBuildingsError] = useState<string | null>(null);
  
  // Energy data state
  const [energyData, setEnergyData] = useState<LocalEnergyData[]>([]);
  const [energySummary, setEnergySummary] = useState<EnergyDataSummary | null>(null);
  const [energyLoading, setEnergyLoading] = useState(true);
  const [energyError, setEnergyError] = useState<string | null>(null);
  const [currentTimeRange, setCurrentTimeRange] = useState<TimeRange>('day');
  
  // Sync state
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastSyncCheck, setLastSyncCheck] = useState<string | null>(null);

  // Handle hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Fetch buildings data
  const refreshBuildings = useCallback(async () => {
    setBuildingsLoading(true);
    setBuildingsError(null);
    
    try {
      const response = await fetch('/api/buildings?includeStats=true');
      const result = await response.json();
      
      if (result.success && result.data.buildings) {
        setBuildings(result.data.buildings);
        console.log(`DataProvider: Loaded ${result.data.buildings.length} buildings`);
      } else {
        setBuildingsError(result.error || 'Failed to fetch buildings');
      }
    } catch (error) {
      setBuildingsError(error instanceof Error ? error.message : 'Unknown error');
      console.error('DataProvider: Error fetching buildings:', error);
    } finally {
      setBuildingsLoading(false);
    }
  }, []);

  // Fetch energy data
  const refreshEnergyData = useCallback(async (timeRange: TimeRange = 'month') => {
    setEnergyLoading(true);
    setEnergyError(null);
    setCurrentTimeRange(timeRange);
    
    try {
      const timeRangeMap = {
        'hour': '1h' as const,
        'day': '24h' as const, 
        'week': '7d' as const,
        'month': '30d' as const
      };
      
      const apiTimeRange = timeRangeMap[timeRange] || '24h';
      const response = await fetch(`/api/energy?timeRange=${apiTimeRange}&aggregation=hourly`);
      const result = await response.json();
      
      if (result.success) {
        setEnergyData(result.data.energyData || []);
        setEnergySummary(result.data.summary || null);
        console.log(`DataProvider: Loaded ${result.data.energyData?.length || 0} energy records for ${timeRange}`);
      } else {
        setEnergyError(result.error || 'Failed to fetch energy data');
      }
    } catch (error) {
      setEnergyError(error instanceof Error ? error.message : 'Unknown error');
      console.error('DataProvider: Error fetching energy data:', error);
    } finally {
      setEnergyLoading(false);
    }
  }, []);

  // Trigger data synchronization
  const triggerSync = useCallback(async () => {
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncType: 'full' })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setLastSyncTime(new Date().toISOString());
        // Refresh data after successful sync
        await Promise.all([
          refreshBuildings(),
          refreshEnergyData(currentTimeRange)
        ]);
        console.log('DataProvider: Sync completed, data refreshed');
      } else {
        console.error('DataProvider: Sync failed:', result.message);
      }
    } catch (error) {
      console.error('DataProvider: Error triggering sync:', error);
    }
  }, [refreshBuildings, refreshEnergyData, currentTimeRange]);

  // Initial data loading - only after hydration
  useEffect(() => {
    if (!isHydrated) return;
    
    const loadInitialData = async () => {
      await Promise.all([
        refreshBuildings(),
        refreshEnergyData('day') // Default to day view
      ]);
    };
    
    loadInitialData();
  }, [isHydrated, refreshBuildings, refreshEnergyData]);

  // Monitor sync status and auto-refresh data
  useEffect(() => {
    if (!isHydrated) return;
    
    const checkForNewSyncs = async () => {
      try {
        const response = await fetch('/api/sync');
        const result = await response.json();
        if (result.success && result.data.lastSync) {
          const newSyncTime = result.data.lastSync.last_sync_timestamp;
          
          // If this is a new sync (different from last known sync)
          if (newSyncTime !== lastSyncCheck) {
            console.log('DataProvider: New sync detected, refreshing data...');
            setLastSyncTime(newSyncTime);
            setLastSyncCheck(newSyncTime);
            
            // Auto-refresh both buildings and energy data
            await Promise.all([
              refreshBuildings(),
              refreshEnergyData(currentTimeRange)
            ]);
            
            console.log('DataProvider: Data refreshed after sync completion');
          }
        }
      } catch (error) {
        console.error('DataProvider: Error checking sync status:', error);
      }
    };
    
    // Initial sync status check
    checkForNewSyncs();
    
    // Poll for sync changes every 2 minutes
    const syncCheckInterval = setInterval(checkForNewSyncs, 120000); // 2 minutes
    
    return () => clearInterval(syncCheckInterval);
  }, [isHydrated, lastSyncCheck, refreshBuildings, refreshEnergyData, currentTimeRange]);

  const contextValue: DataContextType = {
    buildings,
    buildingsLoading,
    buildingsError,
    refreshBuildings,
    
    energyData,
    energySummary,
    energyLoading,
    energyError,
    currentTimeRange,
    refreshEnergyData,
    
    lastSyncTime,
    triggerSync
  };

  // Don't render children until hydration is complete to prevent hydration mismatch
  if (!isHydrated) {
    return null;
  }

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};

export const useDataContext = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
};

// Custom hooks for specific data needs
export const useBuildingData = () => {
  const { buildings, buildingsLoading, buildingsError, refreshBuildings } = useDataContext();
  return { buildings, buildingsLoading, buildingsError, refreshBuildings };
};

export const useEnergyData = () => {
  const { 
    energyData, 
    energySummary, 
    energyLoading, 
    energyError, 
    currentTimeRange, 
    refreshEnergyData 
  } = useDataContext();
  
  return { 
    energyData, 
    energySummary, 
    energyLoading, 
    energyError, 
    currentTimeRange, 
    refreshEnergyData 
  };
};

export const useSyncControl = () => {
  const { lastSyncTime, triggerSync } = useDataContext();
  return { lastSyncTime, triggerSync };
};