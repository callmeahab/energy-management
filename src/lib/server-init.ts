import { syncScheduler } from './sync-scheduler';

// Initialize server-side processes
export function initializeServer() {
  console.log('🚀 Initializing server processes...');
  
  // Start the sync scheduler
  syncScheduler.start();
  
  console.log('✅ Server initialization complete');
}

// Graceful shutdown
export function shutdownServer() {
  console.log('🛑 Shutting down server processes...');
  
  // Stop the sync scheduler
  syncScheduler.stop();
  
  console.log('✅ Server shutdown complete');
}

// Auto-initialize when this module is imported
if (typeof window === 'undefined') {
  // Only run on server-side
  initializeServer();
  
  // Handle graceful shutdown
  process.on('SIGINT', shutdownServer);
  process.on('SIGTERM', shutdownServer);
}