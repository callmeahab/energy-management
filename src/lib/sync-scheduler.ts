import { syncService } from './sync-service';

export class SyncScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Start the hourly sync scheduler
  public start(): void {
    if (this.isRunning) {
      console.log('Sync scheduler is already running');
      return;
    }

    console.log('Starting automatic sync scheduler - running every hour');
    
    // Run initial sync after 30 seconds to allow server to fully start
    setTimeout(() => {
      this.runScheduledSync();
    }, 30000);

    // Set up hourly interval (3600000 ms = 1 hour)
    this.intervalId = setInterval(() => {
      this.runScheduledSync();
    }, 3600000); // 1 hour

    this.isRunning = true;
  }

  // Stop the scheduler
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Sync scheduler stopped');
  }

  // Check if scheduler is running
  public isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  // Run a scheduled sync with error handling
  private async runScheduledSync(): Promise<void> {
    try {
      console.log('🔄 Running scheduled incremental sync...');
      const startTime = Date.now();
      
      const result = await syncService.synchronizeData('incremental');
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ Scheduled sync completed successfully: ${result.recordsSynced} records synced in ${duration}ms`);
        
        // Record successful sync status
        await syncService.recordSyncStatus({
          syncType: 'scheduled_incremental',
          status: 'success',
          recordsSynced: result.recordsSynced,
          errorsCount: result.errorsCount,
          errorMessage: '',
          duration: result.duration
        });
      } else {
        console.log(`⚠️ Scheduled sync completed with errors: ${result.recordsSynced} records synced, ${result.errorsCount} errors`);
        console.log('Error details:', result.errorMessage);
        
        // Record partial success status
        await syncService.recordSyncStatus({
          syncType: 'scheduled_incremental',
          status: 'partial_success',
          recordsSynced: result.recordsSynced,
          errorsCount: result.errorsCount,
          errorMessage: result.errorMessage || '',
          duration: result.duration
        });
      }
      
      // Broadcast sync completion for UI updates (we'll implement this next)
      this.notifySyncCompletion(result);
      
    } catch (error) {
      console.error('❌ Scheduled sync failed:', error);
      
      // Record failed sync status
      await syncService.recordSyncStatus({
        syncType: 'scheduled_incremental',
        status: 'error',
        recordsSynced: 0,
        errorsCount: 1,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        duration: 0
      });
    }
  }

  // Notify UI about sync completion (we'll enhance this with WebSockets or Server-Sent Events later)
  private notifySyncCompletion(result: any): void {
    // For now, just log - we'll implement UI notification later
    console.log('🔔 Sync completion notification:', {
      success: result.success,
      recordsSynced: result.recordsSynced,
      errorsCount: result.errorsCount,
      timestamp: new Date().toISOString()
    });
  }

  // Get next sync time
  public getNextSyncTime(): Date {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    return nextHour;
  }

  // Force run sync immediately (for testing)
  public async runSyncNow(): Promise<void> {
    console.log('🚀 Running immediate scheduled sync...');
    await this.runScheduledSync();
  }
}

// Export singleton instance
export const syncScheduler = new SyncScheduler();