"""
Database operations for Energy Sync
Handles SQLite database operations for building and energy data
Uses common schema shared with Next.js app
"""

import os
import sys
import sqlite3
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any

# Add parent directory to path to import schema loader
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from schema.schema_loader import execute_schema_script

logger = logging.getLogger(__name__)


class Database:
    def __init__(self):
        # Use the shared database from the data directory
        self.db_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "data", "energy_efficiency.sqlite"
        )
        logger.info(f"Using database: {self.db_path}")

    def get_connection(self) -> sqlite3.Connection:
        """Get database connection"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # Enable dict-like access to rows
        return conn

    def initialize(self):
        """Initialize database tables using common schema"""
        logger.info("Initializing database with common schema")

        with self.get_connection() as conn:
            try:
                # Use common schema loader
                execute_schema_script(conn)
                logger.info("Database initialized successfully with common schema")
                
            except Exception as e:
                logger.error(f"Failed to initialize database with common schema: {e}")
                raise

    def get_all_buildings(self) -> List[Dict]:
        """Get all buildings from the database"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, description, exact_type FROM buildings")
            return [dict(row) for row in cursor.fetchall()]

    def upsert_building(self, building: Dict):
        """Insert or update building record"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            current_time = datetime.now(timezone.utc).isoformat()

            # Log building data for debugging
            logger.debug(f"Upserting building: {building.get('id')} - {building.get('name')}")
            logger.debug(f"Building keys: {list(building.keys())}")
            
            # Extract nested data with GraphQL structure (with null safety)
            address = building.get("address") or {}
            geolocation = building.get("geolocation") or {}
            gross_area = building.get("grossArea") or {}
            rentable_area = building.get("rentableArea") or {}
            usable_area = building.get("usableArea") or {}
            
            # Handle type array - convert list to JSON string
            type_array = building.get("type", [])
            type_array_str = ",".join(type_array) if type_array else None

            cursor.execute(
                """
                INSERT INTO buildings (
                    id, name, description, exact_type, mapping_key, connected_data_source_id, 
                    time_zone, type_array, address_id, address_street, address_city, 
                    address_state, address_country, address_postal_code, latitude, longitude,
                    gross_area_value, gross_area_unit, rentable_area_value, rentable_area_unit,
                    usable_area_value, usable_area_unit, date_created, date_updated, sync_timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    name = excluded.name,
                    description = excluded.description,
                    exact_type = excluded.exact_type,
                    mapping_key = excluded.mapping_key,
                    connected_data_source_id = excluded.connected_data_source_id,
                    time_zone = excluded.time_zone,
                    type_array = excluded.type_array,
                    date_updated = excluded.date_updated,
                    sync_timestamp = excluded.sync_timestamp
            """,
                (
                    building["id"],
                    building.get("name"),
                    building.get("description"),
                    building.get("exactType"),
                    building.get("mappingKey"),
                    building.get("connectedDataSourceId"),
                    building.get("timeZone"),
                    type_array_str,
                    address.get("id"),
                    address.get("streetAddress"),
                    address.get("locality"),
                    address.get("region"),
                    address.get("countryName"),
                    address.get("postalCode"),
                    geolocation.get("latitude"),
                    geolocation.get("longitude"),
                    gross_area.get("quantity"),
                    gross_area.get("unit", {}).get("name") if gross_area.get("unit") else None,
                    rentable_area.get("quantity"),
                    rentable_area.get("unit", {}).get("name") if rentable_area.get("unit") else None,
                    usable_area.get("quantity"),
                    usable_area.get("unit", {}).get("name") if usable_area.get("unit") else None,
                    building.get("dateCreated", current_time),
                    building.get("dateUpdated", current_time),
                    current_time,
                ),
            )

    def upsert_floor(self, floor: Dict, building_id: str):
        """Insert or update floor record"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            current_time = datetime.now(timezone.utc).isoformat()

            # Extract nested data (with null safety)
            gross_area = floor.get("grossArea") or {}
            rentable_area = floor.get("rentableArea") or {}
            usable_area = floor.get("usableArea") or {}
            
            # Handle type array
            type_array = floor.get("type", [])
            type_array_str = ",".join(type_array) if type_array else None

            cursor.execute(
                """
                INSERT INTO floors (
                    id, building_id, name, description, exact_type, level, mapping_key,
                    connected_data_source_id, gross_area_value, gross_area_unit,
                    rentable_area_value, rentable_area_unit, usable_area_value, usable_area_unit,
                    type_array, date_created, date_updated, sync_timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    building_id = excluded.building_id,
                    name = excluded.name,
                    description = excluded.description,
                    exact_type = excluded.exact_type,
                    level = excluded.level,
                    mapping_key = excluded.mapping_key,
                    connected_data_source_id = excluded.connected_data_source_id,
                    type_array = excluded.type_array,
                    date_updated = excluded.date_updated,
                    sync_timestamp = excluded.sync_timestamp
            """,
                (
                    floor["id"],
                    building_id,
                    floor.get("name"),
                    floor.get("description"),
                    floor.get("exactType"),
                    floor.get("level"),
                    floor.get("mappingKey"),
                    floor.get("connectedDataSourceId"),
                    gross_area.get("quantity"),
                    gross_area.get("unit", {}).get("name") if gross_area.get("unit") else None,
                    rentable_area.get("quantity"),
                    rentable_area.get("unit", {}).get("name") if rentable_area.get("unit") else None,
                    usable_area.get("quantity"),
                    usable_area.get("unit", {}).get("name") if usable_area.get("unit") else None,
                    type_array_str,
                    floor.get("dateCreated", current_time),
                    floor.get("dateUpdated", current_time),
                    current_time,
                ),
            )

    def upsert_space(self, space: Dict, floor_id: str, building_id: str):
        """Insert or update space record"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            current_time = datetime.now(timezone.utc).isoformat()

            # Handle type array
            type_array = space.get("type", [])
            type_array_str = ",".join(type_array) if type_array else None

            cursor.execute(
                """
                INSERT INTO spaces (
                    id, floor_id, building_id, name, description, exact_type,
                    mapping_key, connected_data_source_id, type_array,
                    date_created, date_updated, sync_timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    floor_id = excluded.floor_id,
                    building_id = excluded.building_id,
                    name = excluded.name,
                    description = excluded.description,
                    exact_type = excluded.exact_type,
                    mapping_key = excluded.mapping_key,
                    connected_data_source_id = excluded.connected_data_source_id,
                    type_array = excluded.type_array,
                    date_updated = excluded.date_updated,
                    sync_timestamp = excluded.sync_timestamp
            """,
                (
                    space["id"],
                    floor_id,
                    building_id,
                    space.get("name"),
                    space.get("description"),
                    space.get("exactType"),
                    space.get("mappingKey"),
                    space.get("connectedDataSourceId"),
                    type_array_str,
                    space.get("dateCreated", current_time),
                    space.get("dateUpdated", current_time),
                    current_time,
                ),
            )

    def energy_record_exists(self, record: Dict) -> bool:
        """Check if energy record exists using unique constraint fields"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT COUNT(*) FROM energy_usage 
                WHERE building_id = ? 
                AND COALESCE(floor_id, '*') = COALESCE(?, '*') 
                AND COALESCE(space_id, '*') = COALESCE(?, '*')
                AND timestamp = ?
                AND usage_type = ?
                AND source = ?
                """,
                (
                    record["building_id"],
                    record.get("floor_id"),
                    record.get("space_id"),
                    record["timestamp"].isoformat() if isinstance(record["timestamp"], datetime) else record["timestamp"],
                    record["usage_type"],
                    record["source"]
                )
            )
            return cursor.fetchone()[0] > 0

    def insert_energy_record(self, record: Dict):
        """Insert energy usage record"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            current_time = datetime.now(timezone.utc).isoformat()
            timestamp = (
                record["timestamp"].isoformat()
                if isinstance(record["timestamp"], datetime)
                else record["timestamp"]
            )

            cursor.execute(
                """
                INSERT INTO energy_usage (
                    id, building_id, floor_id, space_id, timestamp,
                    consumption_kwh, cost_usd, efficiency_score,
                    usage_type, source, sync_timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    record["id"],
                    record["building_id"],
                    record.get("floor_id"),
                    record.get("space_id"),
                    timestamp,
                    record["consumption_kwh"],
                    record["cost_usd"],
                    record["efficiency_score"],
                    record["usage_type"],
                    record["source"],
                    current_time,
                ),
            )

    def get_last_sync_timestamp(self, sync_type: str) -> Optional[datetime]:
        """Get the last sync timestamp for a given sync type"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT last_sync_timestamp FROM sync_status WHERE sync_type = ? ORDER BY created_at DESC LIMIT 1",
                (sync_type,),
            )
            row = cursor.fetchone()
            if row and row[0]:
                return datetime.fromisoformat(row[0])
            return None

    def record_sync_status(
        self,
        sync_type: str,
        status: str,
        records_synced: int,
        errors_count: int,
        error_message: Optional[str],
        duration: float,
    ):
        """Record sync status"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            import uuid

            sync_id = str(uuid.uuid4())
            current_time = datetime.now(timezone.utc).isoformat()
            duration_ms = duration * 1000  # Convert seconds to milliseconds

            cursor.execute(
                """
                INSERT INTO sync_status (
                    id, last_sync_timestamp, sync_type, status, records_synced,
                    errors_count, error_message, duration_ms, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    sync_id,
                    current_time,
                    sync_type,
                    status,
                    records_synced,
                    errors_count,
                    error_message,
                    duration_ms,
                    current_time,
                ),
            )

    def get_sync_status(self, limit: int = 10) -> List[Dict]:
        """Get recent sync status records"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM sync_status ORDER BY created_at DESC LIMIT ?", (limit,)
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_database_stats(self) -> Dict[str, int]:
        """Get database statistics"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            stats = {}
            for table in ["buildings", "floors", "spaces", "energy_usage"]:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                stats[table] = cursor.fetchone()[0]

            return stats