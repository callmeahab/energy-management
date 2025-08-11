import { NextResponse } from 'next/server';
import { syncService } from '@/lib/sync-service';

export async function POST() {
  try {
    console.log('=== DEBUG SYNC STARTED ===');
    
    // Enable detailed logging
    const originalConsoleError = console.error;
    const capturedErrors: string[] = [];
    
    console.error = (...args: any[]) => {
      const errorMessage = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      capturedErrors.push(errorMessage);
      originalConsoleError(...args);
    };

    const result = await syncService.synchronizeData('incremental');
    
    // Restore original console.error
    console.error = originalConsoleError;
    
    console.log('=== DEBUG SYNC COMPLETED ===');
    console.log('Captured errors:', capturedErrors);
    
    return NextResponse.json({
      success: result.success,
      syncResult: result,
      capturedErrors: capturedErrors,
      message: `Debug sync completed. ${result.recordsSynced} records synced, ${result.errorsCount} errors.`
    });
    
  } catch (error) {
    console.error('Debug sync failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Debug sync failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}