import { NextRequest, NextResponse } from 'next/server';
import { syncScheduler } from '@/lib/sync-scheduler';

// Start or check scheduler status
export async function POST(request: NextRequest) {
  try {
    const { action = 'start' } = await request.json();
    
    switch (action) {
      case 'start':
        syncScheduler.start();
        return NextResponse.json({
          success: true,
          message: 'Sync scheduler started successfully',
          isRunning: syncScheduler.isSchedulerRunning(),
          nextSyncTime: syncScheduler.getNextSyncTime()
        });
        
      case 'stop':
        syncScheduler.stop();
        return NextResponse.json({
          success: true,
          message: 'Sync scheduler stopped',
          isRunning: syncScheduler.isSchedulerRunning()
        });
        
      case 'run-now':
        await syncScheduler.runSyncNow();
        return NextResponse.json({
          success: true,
          message: 'Immediate sync completed',
          isRunning: syncScheduler.isSchedulerRunning(),
          nextSyncTime: syncScheduler.getNextSyncTime()
        });
        
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use start, stop, or run-now' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Scheduler API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to manage sync scheduler', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// Get scheduler status
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      data: {
        isRunning: syncScheduler.isSchedulerRunning(),
        nextSyncTime: syncScheduler.getNextSyncTime(),
        currentTime: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Scheduler status API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get scheduler status', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}