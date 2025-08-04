import { NextRequest, NextResponse } from 'next/server';
import { syncService } from '@/lib/sync-service';

export async function POST(request: NextRequest) {
  try {
    const { syncType = 'incremental' } = await request.json();
    
    console.log(`Starting ${syncType} synchronization...`);
    
    const result = await syncService.synchronizeData(syncType);
    
    return NextResponse.json({
      success: result.success,
      message: result.success 
        ? `Synchronization completed successfully. ${result.recordsSynced} records synced.`
        : `Synchronization completed with errors. ${result.recordsSynced} records synced, ${result.errorsCount} errors.`,
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
    
    return NextResponse.json({
      success: true,
      data: {
        syncHistory: syncStatus,
        databaseStats: dbStats,
        lastSync: syncStatus[0] || null
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