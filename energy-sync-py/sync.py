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

# Configure logging with less verbosity to save disk space
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
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
            
            # Log database stats after sync
            sync_service = SyncService()
            stats = sync_service.db.get_database_stats()
            logger.info("Database statistics after sync:")
            for table, count in stats.items():
                logger.info(f"  {table}: {count} records")
                
            # Log watts sensor count specifically
            watts_count = sync_service.db.get_watts_sensors_count()
            logger.info(f"Total watts sensors: {watts_count}")
        else:
            logger.error(f"Sync completed with errors: {result['errors_count']} errors, {result.get('error_message', '')}")
            
    except Exception as e:
        logger.error(f"Sync process failed: {e}", exc_info=True)

def clear_database():
    """Clear the existing database file to start fresh"""
    db_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'energy_efficiency.sqlite')
    
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            logger.info("✅ Database file cleared successfully")
        except OSError as e:
            logger.error(f"❌ Failed to clear database file: {e}")
            return False
    else:
        logger.info("ℹ️  Database file does not exist, nothing to clear")
    
    return True

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
    clear_db = False
    
    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == '--once':
            run_once = True
        elif arg == '--clear-db':
            clear_db = True
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
            print("Usage: python main.py [--once] [--clear-db] [--interval MINUTES] [--help]")
            print("  --once            Run sync once and exit")
            print("  --clear-db        Clear existing database before sync")
            print("  --interval MINUTES Set sync interval in minutes (default: 30)")
            print("  --help            Show this help message")
            print("")
            print("Examples:")
            print("  python main.py --once                    # Run once")
            print("  python main.py --once --clear-db         # Clear DB and run once")
            print("  python main.py --interval 1              # Run every 1 minute")
            print("  python main.py --interval 60             # Run every hour")
            print("  python main.py                           # Run every 30 minutes (default)")
            return
        else:
            print(f"Unknown argument: {arg}")
            print("Use --help for usage information")
            sys.exit(1)
        i += 1
    
    # Clear database if requested
    if clear_db:
        logger.info("🗑️  Clearing database to start fresh...")
        if not clear_database():
            logger.error("Failed to clear database, exiting")
            sys.exit(1)
    
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