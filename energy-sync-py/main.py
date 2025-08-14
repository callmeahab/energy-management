#!/usr/bin/env python3
"""
Energy Sync Script
Synchronizes energy data from Mapped.com API to local SQLite database
"""

import os
import sys
import time
import logging
import schedule
from datetime import datetime
from dotenv import load_dotenv
from sync_service import SyncService

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/tmp/energy-sync.log')
    ]
)

logger = logging.getLogger(__name__)

def run_sync():
    """Run the synchronization process"""
    try:
        logger.info("Starting energy sync process...")
        
        sync_service = SyncService()
        result = sync_service.run_full_sync()
        
        if result['success']:
            logger.info(f"Sync completed successfully: {result['records_synced']} records synced in {result['duration']:.2f}s")
        else:
            logger.error(f"Sync completed with errors: {result['errors_count']} errors, {result.get('error_message', '')}")
            
    except Exception as e:
        logger.error(f"Sync process failed: {e}", exc_info=True)

def main():
    """Main function"""
    logger.info("Energy Sync Service starting...")
    
    # Check required environment variables
    api_key = os.getenv('MAPPED_API_KEY')
    if not api_key:
        logger.error("MAPPED_API_KEY environment variable is required")
        sys.exit(1)
    
    # Parse command line arguments
    interval_minutes = 30  # Default to 30 minutes
    run_once = False
    
    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == '--once':
            run_once = True
        elif arg == '--interval':
            if i + 1 < len(sys.argv):
                try:
                    interval_minutes = int(sys.argv[i + 1])
                    i += 1  # Skip the next argument as it's the interval value
                except ValueError:
                    print("Error: --interval requires a valid integer (minutes)")
                    sys.exit(1)
            else:
                print("Error: --interval requires a value")
                sys.exit(1)
        elif arg == '--help':
            print("Usage: python main.py [--once] [--interval MINUTES] [--help]")
            print("  --once            Run sync once and exit")
            print("  --interval MINUTES Set sync interval in minutes (default: 30)")
            print("  --help            Show this help message")
            print("")
            print("Examples:")
            print("  python main.py --once                    # Run once")
            print("  python main.py --interval 1              # Run every 1 minute")
            print("  python main.py --interval 60             # Run every hour")
            print("  python main.py                           # Run every 30 minutes (default)")
            return
        else:
            print(f"Unknown argument: {arg}")
            print("Use --help for usage information")
            sys.exit(1)
        i += 1
    
    if run_once:
        # Run once and exit
        logger.info("Running sync once...")
        run_sync()
        return
    
    # Schedule sync at specified interval
    if interval_minutes >= 60:
        hours = interval_minutes // 60
        if interval_minutes % 60 == 0:
            schedule.every(hours).hours.do(run_sync)
            logger.info(f"Scheduled sync every {hours} hour(s)")
        else:
            schedule.every(interval_minutes).minutes.do(run_sync)
            logger.info(f"Scheduled sync every {interval_minutes} minutes")
    else:
        schedule.every(interval_minutes).minutes.do(run_sync)
        logger.info(f"Scheduled sync every {interval_minutes} minutes")
    
    # Run initial sync
    logger.info("Running initial sync...")
    run_sync()
    
    # Keep running
    logger.info(f"Energy sync service is running (every {interval_minutes} min). Press Ctrl+C to stop.")
    try:
        while True:
            schedule.run_pending()
            time.sleep(10)  # Check every 10 seconds for more responsive scheduling
    except KeyboardInterrupt:
        logger.info("Energy sync service stopped.")

if __name__ == "__main__":
    main()