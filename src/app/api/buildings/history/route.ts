import { NextRequest, NextResponse } from 'next/server';
import { runQuery, initializeDatabase } from '@/lib/database';

// Get building change history from sync_status table
export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    const buildingId = searchParams.get('buildingId');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (buildingId) {
      // Get sync history related to specific building (limited functionality)
      const history = await runQuery(`
        SELECT 
          id,
          last_sync_timestamp,
          sync_type,
          status,
          records_synced,
          errors_count,
          error_message,
          duration_ms,
          created_at
        FROM sync_status 
        WHERE sync_type LIKE '%building%' OR sync_type = 'full' OR sync_type = 'incremental'
        ORDER BY created_at DESC 
        LIMIT ?
      `, [limit]);
      
      return NextResponse.json({
        success: true,
        data: {
          buildingId,
          changes: history,
          totalChanges: history.length
        }
      });
    } else {
      // Get recent sync changes across all buildings
      const recentChanges = await runQuery(`
        SELECT 
          id,
          last_sync_timestamp,
          sync_type,
          status,
          records_synced,
          errors_count,
          error_message,
          duration_ms,
          created_at
        FROM sync_status 
        ORDER BY created_at DESC 
        LIMIT ?
      `, [limit]);
      
      return NextResponse.json({
        success: true,
        data: {
          recentChanges,
          totalChanges: recentChanges.length
        }
      });
    }
  } catch (error) {
    console.error('Building history API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get building history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}