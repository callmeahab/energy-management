import { NextRequest, NextResponse } from 'next/server';
import { syncService } from '@/lib/sync-service';
import '@/lib/server-init'; // Ensure server processes are initialized

export async function POST(request: NextRequest) {
  try {
    const { syncType = 'incremental', testMode = false } = await request.json();
    
    if (testMode) {
      console.log('Starting test sync...');
      const result = await syncService.testSync();
      return NextResponse.json(result);
    }
    
    console.log(`Starting ${syncType} synchronization...`);
    
    const result = await syncService.synchronizeData(syncType);
    
    return NextResponse.json({
      success: result.success,
      message: result.success 
        ? `Synchronization completed successfully. ${result.recordsSynced} records synced.`
        : `Synchronization completed with errors. ${result.recordsSynced} records synced, ${result.errorsCount} errors.${result.errorMessage ? ' Details: ' + result.errorMessage : ''}`,
      data: result
    });
    
  } catch (error) {
    console.error('Sync API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to synchronize data', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await syncService.initializeDatabase();
    const [syncStatus, dbStats] = await Promise.all([
      syncService.getSyncStatus(),
      syncService.getDatabaseStats()
    ]);
    
    // Convert BigInt values to numbers for JSON serialization
    const serializedSyncStatus = syncStatus.map((status: any) => ({
      ...status,
      id: Number(status.id),
      records_synced: Number(status.records_synced),
      errors_count: Number(status.errors_count),
      duration_ms: Number(status.duration_ms)
    }));

    const serializedDbStats = {
      buildings: Number(dbStats.buildings),
      floors: Number(dbStats.floors),
      spaces: Number(dbStats.spaces),
      energyRecords: Number(dbStats.energyRecords)
    };

    return NextResponse.json({
      success: true,
      data: {
        syncHistory: serializedSyncStatus,
        databaseStats: serializedDbStats,
        lastSync: serializedSyncStatus[0] || null
      }
    });
    
  } catch (error) {
    console.error('Sync status API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get sync status', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}