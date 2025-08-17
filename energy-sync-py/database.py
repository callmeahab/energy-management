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
            os.path.dirname(__file__), "..", "data", "energy_efficiency.sqlite"
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
                # Apply pragmas to improve write performance. Note: Some pragmas are
                # connection-scoped; applying here ensures faster bulk loads during init.
                # WAL improves concurrency and reduces writer contention.
                conn.execute("PRAGMA journal_mode=WAL;")
                # NORMAL balances durability and performance; OFF is faster but risky.
                conn.execute("PRAGMA synchronous=NORMAL;")
                # Keep temporary data in memory for speed.
                conn.execute("PRAGMA temp_store=MEMORY;")
                # Negative value sets size in KB; here ~20 MB page cache.
                conn.execute("PRAGMA cache_size=-20000;")
                # Avoid immediate SQLITE_BUSY errors under contention.
                conn.execute("PRAGMA busy_timeout=5000;")
                # Ensure FK constraints are enforced (good data integrity; negligible cost).
                conn.execute("PRAGMA foreign_keys=ON;")

                # Use common schema loader
                execute_schema_script(conn)
                logger.info("Database initialized successfully with common schema")

                # Ensure backward-compatible columns exist for existing databases
                self._ensure_schema_compatibility(conn)

            except Exception as e:
                logger.error(f"Failed to initialize database with common schema: {e}")
                raise

    def _ensure_schema_compatibility(self, conn: sqlite3.Connection) -> None:
        """Add any missing columns expected by the current application schema.

        SQLite does not support ALTER COLUMN IF NOT EXISTS, so we inspect the
        current table definitions and add any missing columns individually.
        """

        def get_existing_columns(table: str) -> List[str]:
            cur = conn.cursor()
            cur.execute(f"PRAGMA table_info({table})")
            return [row[1] for row in cur.fetchall()]

        def ensure_columns(table: str, columns: List[Dict[str, str]]) -> None:
            existing = set(get_existing_columns(table))
            cur = conn.cursor()
            for col in columns:
                name = col["name"]
                col_type = col["type"]
                if name not in existing:
                    try:
                        logger.info(
                            f"Adding missing column {table}.{name} ({col_type})"
                        )
                        cur.execute(f"ALTER TABLE {table} ADD COLUMN {name} {col_type}")
                    except sqlite3.Error as e:
                        # Ignore duplicate column errors due to race or prior runs
                        if "duplicate column name" not in str(e).lower():
                            logger.warning(f"Column add failed for {table}.{name}: {e}")
            conn.commit()

        # Buildings expected columns
        ensure_columns(
            "buildings",
            [
                {"name": "mapping_key", "type": "TEXT"},
                {"name": "connected_data_source_id", "type": "TEXT"},
                {"name": "time_zone", "type": "TEXT"},
                {"name": "type_array", "type": "TEXT"},
                # Address
                {"name": "address_id", "type": "TEXT"},
                {"name": "address_street", "type": "TEXT"},
                {"name": "address_city", "type": "TEXT"},
                {"name": "address_state", "type": "TEXT"},
                {"name": "address_country", "type": "TEXT"},
                {"name": "address_postal_code", "type": "TEXT"},
                # Geolocation
                {"name": "latitude", "type": "REAL"},
                {"name": "longitude", "type": "REAL"},
                # Areas
                {"name": "gross_area_value", "type": "REAL"},
                {"name": "gross_area_unit", "type": "TEXT"},
                {"name": "rentable_area_value", "type": "REAL"},
                {"name": "rentable_area_unit", "type": "TEXT"},
                {"name": "usable_area_value", "type": "REAL"},
                {"name": "usable_area_unit", "type": "TEXT"},
                # Timestamps
                {"name": "date_created", "type": "TEXT"},
                {"name": "date_updated", "type": "TEXT"},
                {"name": "sync_timestamp", "type": "TEXT"},
            ],
        )

        # Floors expected columns
        ensure_columns(
            "floors",
            [
                {"name": "exact_type", "type": "TEXT"},
                {"name": "level", "type": "INTEGER"},
                {"name": "mapping_key", "type": "TEXT"},
                {"name": "connected_data_source_id", "type": "TEXT"},
                {"name": "gross_area_value", "type": "REAL"},
                {"name": "gross_area_unit", "type": "TEXT"},
                {"name": "rentable_area_value", "type": "REAL"},
                {"name": "rentable_area_unit", "type": "TEXT"},
                {"name": "usable_area_value", "type": "REAL"},
                {"name": "usable_area_unit", "type": "TEXT"},
                {"name": "type_array", "type": "TEXT"},
                {"name": "date_created", "type": "TEXT"},
                {"name": "date_updated", "type": "TEXT"},
                {"name": "sync_timestamp", "type": "TEXT"},
            ],
        )

        # Spaces expected columns
        ensure_columns(
            "spaces",
            [
                {"name": "mapping_key", "type": "TEXT"},
                {"name": "connected_data_source_id", "type": "TEXT"},
                {"name": "type_array", "type": "TEXT"},
                {"name": "date_created", "type": "TEXT"},
                {"name": "date_updated", "type": "TEXT"},
                {"name": "sync_timestamp", "type": "TEXT"},
            ],
        )

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
            logger.debug(
                f"Upserting building: {building.get('id')} - {building.get('name')}"
            )
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
                    (
                        gross_area.get("unit", {}).get("name")
                        if gross_area.get("unit")
                        else None
                    ),
                    rentable_area.get("quantity"),
                    (
                        rentable_area.get("unit", {}).get("name")
                        if rentable_area.get("unit")
                        else None
                    ),
                    usable_area.get("quantity"),
                    (
                        usable_area.get("unit", {}).get("name")
                        if usable_area.get("unit")
                        else None
                    ),
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
                    (
                        gross_area.get("unit", {}).get("name")
                        if gross_area.get("unit")
                        else None
                    ),
                    rentable_area.get("quantity"),
                    (
                        rentable_area.get("unit", {}).get("name")
                        if rentable_area.get("unit")
                        else None
                    ),
                    usable_area.get("quantity"),
                    (
                        usable_area.get("unit", {}).get("name")
                        if usable_area.get("unit")
                        else None
                    ),
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

    def upsert_point(
        self,
        point: Dict,
        building_id: str,
        floor_id: Optional[str] = None,
        space_id: Optional[str] = None,
    ):
        """Insert or update sensor point record"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            current_time = datetime.now(timezone.utc).isoformat()

            cursor.execute(
                """
                INSERT INTO points (
                    id, building_id, floor_id, space_id, name, description, 
                    exact_type, unit_name, sync_timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    building_id = excluded.building_id,
                    floor_id = excluded.floor_id,
                    space_id = excluded.space_id,
                    name = excluded.name,
                    description = excluded.description,
                    exact_type = excluded.exact_type,
                    unit_name = excluded.unit_name,
                    sync_timestamp = excluded.sync_timestamp
            """,
                (
                    point["id"],
                    building_id,
                    floor_id,
                    space_id,
                    point.get("name"),
                    point.get("description"),
                    point.get("exactType"),
                    point.get("unit", {}).get("name") if point.get("unit") else None,
                    current_time,
                ),
            )

    def upsert_point_series(self, point_id: str, series_data: Dict):
        """Insert or update point series data"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            current_time = datetime.now(timezone.utc).isoformat()

            # Generate unique ID for this series entry
            series_id = f"{point_id}_{series_data.get('timestamp', current_time)}"

            value = series_data.get("value", {})

            cursor.execute(
                """
                INSERT INTO point_series (
                    id, point_id, timestamp, float64_value, float32_value, 
                    string_value, bool_value, sync_timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    point_id = excluded.point_id,
                    timestamp = excluded.timestamp,
                    float64_value = excluded.float64_value,
                    float32_value = excluded.float32_value,
                    string_value = excluded.string_value,
                    bool_value = excluded.bool_value,
                    sync_timestamp = excluded.sync_timestamp
            """,
                (
                    series_id,
                    point_id,
                    series_data.get("timestamp", current_time),
                    value.get("float64Value"),
                    value.get("float32Value"),
                    value.get("stringValue"),
                    value.get("boolValue"),
                    current_time,
                ),
            )

    def calculate_and_store_energy_consumption(self):
        """Calculate energy consumption from watts sensors and store aggregated data"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            logger.info("Calculating energy consumption from watts sensors...")

            # Get all watts sensors with their latest readings
            cursor.execute(
                """
                SELECT 
                    p.building_id,
                    p.floor_id,
                    p.space_id,
                    ps.timestamp,
                    COALESCE(ps.float64_value, ps.float32_value, 0) as watt_value
                FROM points p
                JOIN point_series ps ON p.id = ps.point_id
                WHERE p.unit_name = 'Watt'
                  AND (ps.float64_value IS NOT NULL OR ps.float32_value IS NOT NULL)
                ORDER BY p.building_id, p.floor_id, p.space_id, ps.timestamp
            """
            )

            watts_data = cursor.fetchall()

            if not watts_data:
                logger.info("No watts sensor data found")
                return 0

            # Group by location and timestamp, sum watts
            consumption_map = {}

            for row in watts_data:
                building_id, floor_id, space_id, timestamp, watt_value = row
                key = f"{building_id}_{floor_id or 'null'}_{space_id or 'null'}_{timestamp}"

                if key in consumption_map:
                    consumption_map[key]["total_watts"] += watt_value
                else:
                    consumption_map[key] = {
                        "building_id": building_id,
                        "floor_id": floor_id,
                        "space_id": space_id,
                        "timestamp": timestamp,
                        "total_watts": watt_value,
                    }

            # Store calculated consumption data
            records_inserted = 0
            current_time = datetime.now(timezone.utc).isoformat()

            for key, consumption in consumption_map.items():
                # Convert watts to kWh (simplified - using instant reading)
                total_kwh = (
                    consumption["total_watts"] / 1000
                )  # Basic conversion for demonstration

                cursor.execute(
                    """
                    INSERT OR REPLACE INTO energy_consumption (
                        id, building_id, floor_id, space_id, timestamp, 
                        total_watts, total_kwh, calculation_timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        key,
                        consumption["building_id"],
                        consumption["floor_id"],
                        consumption["space_id"],
                        consumption["timestamp"],
                        consumption["total_watts"],
                        total_kwh,
                        current_time,
                    ),
                )
                records_inserted += 1

            conn.commit()
            logger.info(f"Stored {records_inserted} energy consumption records")
            return records_inserted

    def get_watts_sensors_count(self) -> int:
        """Get count of watts sensors"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM points WHERE unit_name = 'Watt'")
            return cursor.fetchone()[0]

    def get_database_stats(self) -> Dict[str, int]:
        """Get database statistics"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            stats = {}
            for table in [
                "buildings",
                "floors",
                "spaces",
                "points",
                "point_series",
                "energy_consumption",
            ]:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                stats[table] = cursor.fetchone()[0]

            return stats

    def backfill_energy_consumption(
        self,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        rebuild: bool = False,
    ) -> int:
        """
        Aggregate all historical watts readings into 30-minute buckets per building/floor/space
        and store into energy_consumption with average watts and derived kWh for the half-hour.

        kWh calculation uses avg_watts over the bucket: total_kwh = (avg_watts / 1000) * 0.5

        If rebuild is True, existing energy_consumption rows within the provided time range
        will be deleted before backfill to avoid duplication.
        """
        import math
        from datetime import datetime, timezone

        def parse_ts(ts_str: str) -> datetime:
            # Normalize common ISO forms to be parseable by fromisoformat
            if ts_str.endswith("Z"):
                ts_str = ts_str[:-1] + "+00:00"
            try:
                return datetime.fromisoformat(ts_str)
            except Exception:
                # Fallback: try without timezone and assume UTC
                try:
                    return datetime.strptime(
                        ts_str.split(".")[0].replace("T", " "), "%Y-%m-%d %H:%M:%S"
                    ).replace(tzinfo=timezone.utc)
                except Exception:
                    return datetime.now(timezone.utc)

        with self.get_connection() as conn:
            cursor = conn.cursor()

            conditions = [
                "p.unit_name = 'Watt'",
                "(ps.float64_value IS NOT NULL OR ps.float32_value IS NOT NULL)",
            ]
            params: List[Any] = []
            if start_time:
                conditions.append("ps.timestamp >= ?")
                params.append(start_time)
            if end_time:
                conditions.append("ps.timestamp <= ?")
                params.append(end_time)
            where_sql = " WHERE " + " AND ".join(conditions)

            logger.info("Loading watts readings for 30-minute backfill...")
            cursor.execute(
                f"""
                SELECT 
                  p.building_id,
                  p.floor_id,
                  p.space_id,
                  ps.timestamp,
                  COALESCE(ps.float64_value, ps.float32_value) as watt_value
                FROM points p
                JOIN point_series ps ON p.id = ps.point_id
                {where_sql}
                ORDER BY p.building_id, p.floor_id, p.space_id, ps.timestamp
                """,
                params,
            )

            rows = cursor.fetchall()
            if not rows:
                logger.info("No watts data found for backfill")
                return 0

            if rebuild:
                # Determine deletion window aligned to half-hour boundaries
                if start_time or end_time:
                    del_conditions = []
                    del_params: List[Any] = []
                    if start_time:
                        del_conditions.append("timestamp >= ?")
                        del_params.append(start_time)
                    if end_time:
                        del_conditions.append("timestamp <= ?")
                        del_params.append(end_time)
                    del_where = (
                        (" WHERE " + " AND ".join(del_conditions))
                        if del_conditions
                        else ""
                    )
                else:
                    del_where = ""
                    del_params = []
                cursor.execute(f"DELETE FROM energy_consumption{del_where}", del_params)
                conn.commit()

            # Aggregate into 30-minute buckets
            buckets: Dict[str, Dict[str, Any]] = {}

            for r in rows:
                building_id, floor_id, space_id, ts_str, watt_value = r
                if watt_value is None:
                    continue
                dt = parse_ts(str(ts_str))
                # Align to 30-minute bucket
                minute = 0 if dt.minute < 30 else 30
                bucket_dt = dt.replace(minute=minute, second=0, microsecond=0)
                # Store as UTC ISO without timezone for SQLite-friendly string
                # Format: YYYY-MM-DD HH:MM:SS
                bucket_str = bucket_dt.astimezone(timezone.utc).strftime(
                    "%Y-%m-%d %H:%M:%S"
                )

                key = f"{building_id}_{floor_id or 'null'}_{space_id or 'null'}_{bucket_str}"

                grouped = buckets.get(key)
                if not grouped:
                    grouped = {
                        "building_id": building_id,
                        "floor_id": floor_id,
                        "space_id": space_id,
                        "timestamp": bucket_str,
                        "sum_watts": 0.0,
                        "count": 0,
                    }
                    buckets[key] = grouped
                grouped["sum_watts"] += float(watt_value)
                grouped["count"] += 1

            # Write aggregated records
            now_iso = datetime.now(timezone.utc).isoformat()
            records_inserted = 0
            for key, g in buckets.items():
                avg_watts = (g["sum_watts"] / g["count"]) if g["count"] > 0 else 0.0
                total_kwh = (avg_watts / 1000.0) * 0.5
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO energy_consumption (
                        id, building_id, floor_id, space_id, timestamp, total_watts, total_kwh, calculation_timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        key,
                        g["building_id"],
                        g["floor_id"],
                        g["space_id"],
                        g["timestamp"],
                        avg_watts,
                        total_kwh,
                        now_iso,
                    ),
                )
                records_inserted += 1

            conn.commit()
            logger.info(
                f"Backfill complete: {records_inserted} half-hour energy records stored"
            )
            return records_inserted
