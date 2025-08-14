# Energy Sync Python Service

A Python service for synchronizing energy consumption data from Mapped.com API to a local SQLite database.

## Features

- Hourly energy data logging for all buildings
- Building, floor, and space structure synchronization
- GraphQL API integration with Mapped.com
- Automatic scheduling with cron-like functionality
- Error handling and retry logic
- Comprehensive logging

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Copy and configure environment variables:
```bash
cp .env.example .env
# Edit .env with your Mapped API key
```

3. Test the sync process:
```bash
python main.py --once
```

4. Run as a service (hourly sync):
```bash
python main.py
```

## Usage

### Run once
```bash
python main.py --once
```

### Run as service (hourly sync)
```bash
python main.py
```

### Help
```bash
python main.py --help
```

## Architecture

- `main.py` - Entry point and scheduler
- `sync_service.py` - Core synchronization logic
- `database.py` - Database operations and schema
- `requirements.txt` - Python dependencies

## Database

Uses the existing SQLite database from the Next.js application (`../energy_efficiency.sqlite`).

Tables:
- `buildings` - Building structure and metadata
- `floors` - Floor information
- `spaces` - Space/room information
- `energy_usage` - Hourly energy consumption data
- `sync_status` - Synchronization history and status

## Logging

Logs are written to:
- Console (stdout)
- File: `/tmp/energy-sync.log`

Log levels: INFO, ERROR, DEBUG

## Environment Variables

- `MAPPED_API_KEY` - Required: Your Mapped.com API key
- `MAPPED_API_URL` - Optional: API endpoint (defaults to https://api.mapped.com/graphql)
- `DATABASE_PATH` - Optional: Custom database path