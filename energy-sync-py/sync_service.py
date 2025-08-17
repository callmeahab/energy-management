"""
Sync Service for Energy Data
Handles synchronization of building and energy data from Mapped.com API
"""

import os
import time
import sqlite3
import logging
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any
from database import Database

logger = logging.getLogger(__name__)


class SyncService:
    def __init__(self):
        self.db = Database()
        self.api_url = os.getenv("MAPPED_API_URL", "https://api.mapped.com/graphql")
        self.api_key = os.getenv("MAPPED_API_KEY")

        if not self.api_key:
            logger.warning("MAPPED_API_KEY not set - API calls may fail")

    def _make_graphql_request(
        self, query: str, variables: Optional[Dict] = None
    ) -> Dict:
        """Make a GraphQL request to the Mapped API"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"token {self.api_key}",
            "User-Agent": "EnergySync-Python/1.0",
        }

        payload = {"query": query, "variables": variables or {}}

        try:
            response = requests.post(
                self.api_url, json=payload, headers=headers, timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"GraphQL request failed: {e}")
            raise

    def run_full_sync(self) -> Dict[str, Any]:
        """Run a full synchronization"""
        return self._run_sync("full")

    def run_incremental_sync(self) -> Dict[str, Any]:
        """Run an incremental synchronization"""
        return self._run_sync("incremental")

    def _run_sync(self, sync_type: str) -> Dict[str, Any]:
        """Run synchronization process"""
        start_time = time.time()
        total_records = 0
        total_errors = 0
        error_messages = []

        logger.info(f"Starting {sync_type} sync")

        try:
            # Initialize database
            self.db.initialize()

            # Get last sync timestamp for incremental sync
            last_sync = None
            if sync_type == "incremental":
                last_sync = self.db.get_last_sync_timestamp("data_sync")
                if last_sync:
                    logger.info(f"Incremental sync from: {last_sync}")

            # Step 1: Sync all building data and sensors in one comprehensive query
            try:
                sensor_result = self._sync_sensor_data()
                total_records += sensor_result["records_synced"]
                total_errors += sensor_result["errors_count"]
                if sensor_result.get("error_message"):
                    error_messages.append(
                        f"Building and sensor sync error: {sensor_result['error_message']}"
                    )
            except Exception as e:
                error_messages.append(f"Building and sensor sync error: {e}")
                total_errors += 1
                logger.error(f"Building and sensor sync failed: {e}", exc_info=True)

            # Step 2: Calculate energy consumption from watts sensors
            try:
                consumption_result = self._calculate_energy_consumption()
                total_records += consumption_result["records_synced"]
                total_errors += consumption_result["errors_count"]
                if consumption_result.get("error_message"):
                    error_messages.append(
                        f"Consumption calculation error: {consumption_result['error_message']}"
                    )
            except Exception as e:
                error_messages.append(f"Consumption calculation error: {e}")
                total_errors += 1
                logger.error(f"Energy consumption calculation failed: {e}", exc_info=True)

            duration = time.time() - start_time
            success = total_errors == 0
            error_message = "; ".join(error_messages) if error_messages else None

            # Record sync status
            status = "completed" if success else "completed_with_errors"
            try:
                self.db.record_sync_status(
                    sync_type,
                    status,
                    total_records,
                    total_errors,
                    error_message,
                    duration,
                )
            except Exception as e:
                logger.error(f"Failed to record sync status: {e}")

            result = {
                "success": success,
                "records_synced": total_records,
                "errors_count": total_errors,
                "error_message": error_message,
                "duration": duration,
                "sync_type": sync_type,
            }

            return result

        except Exception as e:
            duration = time.time() - start_time
            error_message = str(e)
            logger.error(f"Sync process failed: {e}", exc_info=True)

            return {
                "success": False,
                "records_synced": total_records,
                "errors_count": total_errors + 1,
                "error_message": error_message,
                "duration": duration,
                "sync_type": sync_type,
            }

    def _sync_buildings(self, last_sync: Optional[datetime]) -> Dict[str, Any]:
        """Sync buildings, floors, and spaces from Mapped API"""
        logger.info("Starting building sync")

        records_synced = 0
        errors_count = 0

        # GraphQL query for buildings with full GraphQL structure
        query = """
        query GetBuildings {
            buildings {
                id
                name
                description
                exactType
                mappingKey
                connectedDataSourceId
                timeZone
                type
                address {
                    id
                    streetAddress
                    locality
                    region
                    countryName
                    postalCode
                }
                geolocation {
                    latitude
                    longitude
                }
                grossArea {
                    quantity
                    unit {
                        name
                    }
                }
                rentableArea {
                    quantity
                    unit {
                        name
                    }
                }
                usableArea {
                    quantity
                    unit {
                        name
                    }
                }
                dateCreated
                dateUpdated
                floors {
                    id
                    name
                    description
                    exactType
                    level
                    mappingKey
                    connectedDataSourceId
                    type
                    grossArea {
                        quantity
                        unit {
                            name
                        }
                    }
                    rentableArea {
                        quantity
                        unit {
                            name
                        }
                    }
                    usableArea {
                        quantity
                        unit {
                            name
                        }
                    }
                    dateCreated
                    dateUpdated
                    spaces {
                        id
                        name
                        description
                        exactType
                        mappingKey
                        connectedDataSourceId
                        type
                        dateCreated
                        dateUpdated
                    }
                }
            }
        }
        """

        try:
            response = self._make_graphql_request(query)

            if "errors" in response:
                logger.warning(f"GraphQL errors: {response['errors']}")
                # Try sites fallback
                return self._sync_from_sites()

            buildings = response.get("data", {}).get("buildings", [])
            logger.info(f"GraphQL response received with {len(buildings)} buildings")

            if not buildings:
                logger.info("No buildings found in GraphQL response")
                return self._sync_from_sites()

            for building in buildings:
                try:
                    logger.info(
                        f"Syncing building: {building.get('id', 'UNKNOWN_ID')} - {building.get('name', 'UNKNOWN_NAME')}"
                    )
                    logger.debug(f"Building data structure: {list(building.keys())}")

                    # Upsert building
                    self._upsert_building(building)
                    records_synced += 1

                    # Sync floors and spaces
                    for floor in building.get("floors", []):
                        try:
                            self._upsert_floor(floor, building["id"])
                            records_synced += 1

                            for space in floor.get("spaces", []):
                                try:
                                    self._upsert_space(
                                        space, floor["id"], building["id"]
                                    )
                                    records_synced += 1
                                except Exception as e:
                                    logger.error(
                                        f"Failed to sync space {space['id']}: {e}"
                                    )
                                    errors_count += 1
                        except Exception as e:
                            logger.error(f"Failed to sync floor {floor['id']}: {e}")
                            errors_count += 1


                except Exception as e:
                    building_id = building.get('id', 'UNKNOWN_ID') if building else 'NO_BUILDING_DATA'
                    logger.error(f"Failed to sync building {building_id}: {e}")
                    logger.error(f"Building data: {building}")
                    import traceback
                    logger.error(f"Full traceback: {traceback.format_exc()}")
                    errors_count += 1

            logger.info(
                f"Building sync completed: {records_synced} records synced, {errors_count} errors"
            )

        except Exception as e:
            logger.error(f"Building sync failed: {e}")
            errors_count += 1

        return {"records_synced": records_synced, "errors_count": errors_count}

    def _sync_from_sites(self) -> Dict[str, Any]:
        """Sync buildings from sites endpoint as fallback"""
        logger.info("Trying sites fallback")

        records_synced = 0
        errors_count = 0

        query = """
        query GetSites {
            sites {
                id
                name
                description
                buildings {
                    id
                    name
                    description
                    exactType
                    mappingKey
                    connectedDataSourceId
                    timeZone
                    type
                    address {
                        id
                        streetAddress
                        locality
                        region
                        countryName
                        postalCode
                    }
                    geolocation {
                        latitude
                        longitude
                    }
                    grossArea {
                        quantity
                        unit {
                            name
                        }
                    }
                    rentableArea {
                        quantity
                        unit {
                            name
                        }
                    }
                    usableArea {
                        quantity
                        unit {
                            name
                        }
                    }
                    dateCreated
                    dateUpdated
                    floors {
                        id
                        name
                        description
                        exactType
                        level
                        mappingKey
                        connectedDataSourceId
                        type
                        grossArea {
                            value
                            unit
                        }
                        rentableArea {
                            value
                            unit
                        }
                        usableArea {
                            value
                            unit
                        }
                        dateCreated
                        dateUpdated
                        spaces {
                            id
                            name
                            description
                            exactType
                            mappingKey
                            connectedDataSourceId
                            type
                            dateCreated
                            dateUpdated
                        }
                    }
                }
            }
        }
        """

        try:
            response = self._make_graphql_request(query)

            if "errors" in response:
                logger.error(f"Sites query also failed: {response['errors']}")
                errors_count += 1
                return {"records_synced": records_synced, "errors_count": errors_count}

            sites = response.get("data", {}).get("sites", [])
            logger.info(f"Sites GraphQL response received with {len(sites)} sites")

            for site in sites:
                for building in site.get("buildings", []):
                    try:
                        logger.info(
                            f"Syncing building from site: {building['id']} - {building['name']}"
                        )

                        self._upsert_building(building)
                        records_synced += 1

                        for floor in building.get("floors", []):
                            try:
                                self._upsert_floor(floor, building["id"])
                                records_synced += 1

                                for space in floor.get("spaces", []):
                                    try:
                                        self._upsert_space(
                                            space, floor["id"], building["id"]
                                        )
                                        records_synced += 1
                                    except Exception as e:
                                        logger.error(
                                            f"Failed to sync space from site {space['id']}: {e}"
                                        )
                                        errors_count += 1
                            except Exception as e:
                                logger.error(
                                    f"Failed to sync floor from site {floor['id']}: {e}"
                                )
                                errors_count += 1


                    except Exception as e:
                        logger.error(
                            f"Failed to sync building from site {building['id']}: {e}"
                        )
                        errors_count += 1

        except Exception as e:
            logger.error(f"Sites sync failed: {e}")
            errors_count += 1

        return {"records_synced": records_synced, "errors_count": errors_count}

    def _sync_sensor_data(self) -> Dict[str, Any]:
        """Sync all building data and sensor data from Mapped API using comprehensive query"""
        logger.info("Starting comprehensive building and sensor data sync")

        records_synced = 0
        errors_count = 0

        try:
            # Get all buildings from API (no filtering needed)
            logger.info("Fetching all buildings from API for sensor data sync")

            # Use your comprehensive GraphQL query for all sensor data (no building ID filter)
            query = """
            query GetEnergyPoints {
                buildings {
                    id
                    name
                    points {
                        id
                        name
                        description
                        exactType
                        unit {
                            name
                        }
                        series(latest: true) {
                            timestamp
                            value {
                                float64Value
                                float32Value
                                stringValue
                                boolValue
                            }
                        }
                    }
                    floors {
                        id
                        name
                        points {
                            id
                            name
                            description
                            exactType
                            unit {
                                name
                            }
                            series(latest: true) {
                                timestamp
                                value {
                                    float64Value
                                    float32Value
                                    stringValue
                                    boolValue
                                }
                            }
                        }
                        spaces {
                            id
                            name
                            points {
                                id
                                name
                                description
                                exactType
                                unit {
                                    name
                                }
                                series(latest: true) {
                                    timestamp
                                    value {
                                        float64Value
                                        float32Value
                                        stringValue
                                        boolValue
                                    }
                                }
                            }
                            geoshape
                        }
                    }
                }
            }
            """

            response = self._make_graphql_request(query)

            if "errors" in response:
                logger.error(f"Sensor data query failed: {response['errors']}")
                return {"records_synced": 0, "errors_count": 1, "error_message": str(response['errors'])}

            buildings_data = response.get("data", {}).get("buildings", [])
            logger.info(f"Sensor data GraphQL response received for {len(buildings_data)} buildings")

            for building in buildings_data:
                # First, sync/update the building itself
                try:
                    self.db.upsert_building(building)
                    records_synced += 1
                    logger.info(f"Synced building: {building['id']} - {building.get('name', 'Unnamed')}")
                except Exception as e:
                    logger.error(f"Failed to sync building {building.get('id', 'unknown')}: {e}")
                    errors_count += 1

                # Sync building-level points
                for point in building.get("points", []):
                    try:
                        count = self._process_sensor_point(point, building["id"], None, None)
                        records_synced += count
                    except Exception as e:
                        logger.error(f"Failed to sync building point {point.get('id', 'unknown')}: {e}")
                        errors_count += 1

                # Sync floor-level data
                for floor in building.get("floors", []):
                    # Sync the floor itself
                    try:
                        self.db.upsert_floor(floor, building["id"])
                        records_synced += 1
                        logger.debug(f"Synced floor: {floor['id']} - {floor.get('name', 'Unnamed')}")
                    except Exception as e:
                        logger.error(f"Failed to sync floor {floor.get('id', 'unknown')}: {e}")
                        errors_count += 1

                    # Sync floor-level points
                    for point in floor.get("points", []):
                        try:
                            count = self._process_sensor_point(point, building["id"], floor["id"], None)
                            records_synced += count
                        except Exception as e:
                            logger.error(f"Failed to sync floor point {point.get('id', 'unknown')}: {e}")
                            errors_count += 1

                    # Sync space-level data
                    for space in floor.get("spaces", []):
                        # Sync the space itself
                        try:
                            self.db.upsert_space(space, floor["id"], building["id"])
                            records_synced += 1
                            logger.debug(f"Synced space: {space['id']} - {space.get('name', 'Unnamed')}")
                        except Exception as e:
                            logger.error(f"Failed to sync space {space.get('id', 'unknown')}: {e}")
                            errors_count += 1

                        # Sync space-level points
                        for point in space.get("points", []):
                            try:
                                count = self._process_sensor_point(point, building["id"], floor["id"], space["id"])
                                records_synced += count
                            except Exception as e:
                                logger.error(f"Failed to sync space point {point.get('id', 'unknown')}: {e}")
                                errors_count += 1

            logger.info(f"Sensor data sync completed: {records_synced} records synced, {errors_count} errors")

        except Exception as e:
            logger.error(f"Sensor data sync failed: {e}")
            errors_count += 1
            return {"records_synced": records_synced, "errors_count": errors_count, "error_message": str(e)}

        return {"records_synced": records_synced, "errors_count": errors_count}

    def _calculate_energy_consumption(self) -> Dict[str, Any]:
        """Calculate and store energy consumption from watts sensors"""
        logger.info("Starting energy consumption calculation")
        
        try:
            records_synced = self.db.calculate_and_store_energy_consumption()
            watts_sensors_count = self.db.get_watts_sensors_count()
            
            logger.info(f"Energy consumption calculation completed: {records_synced} records calculated from {watts_sensors_count} watts sensors")
            
            return {"records_synced": records_synced, "errors_count": 0}
            
        except Exception as e:
            logger.error(f"Energy consumption calculation failed: {e}")
            return {"records_synced": 0, "errors_count": 1, "error_message": str(e)}

    def _process_sensor_point(
        self,
        point: Dict,
        building_id: str,
        floor_id: Optional[str],
        space_id: Optional[str],
    ) -> int:
        """Process a single sensor point and store its metadata and series data"""
        if not point.get("id"):
            logger.warning("Point missing ID, skipping")
            return 0

        records_inserted = 0
        
        try:
            # Store/update point metadata
            self.db.upsert_point(point, building_id, floor_id, space_id)
            records_inserted += 1
            
            unit_name = point.get("unit", {}).get("name", "unknown") if point.get("unit") else "unknown"
            logger.debug(f"Stored point {point['id']} ({point.get('name', 'unnamed')}) with unit: {unit_name}")
            
            # Store series data - handle case where series might be None or empty
            series_data_list = point.get("series") or []
            if series_data_list:
                for series_data in series_data_list:
                    try:
                        if series_data:  # Check if series_data is not None
                            self.db.upsert_point_series(point["id"], series_data)
                            records_inserted += 1
                            logger.debug(f"Stored series data for point {point['id']} at {series_data.get('timestamp', 'unknown time')}")
                    except Exception as e:
                        logger.error(f"Failed to store series data for point {point['id']}: {e}")
                        # Don't raise, continue with other series data
            else:
                logger.debug(f"No series data available for point {point['id']}")
            
        except Exception as e:
            logger.error(f"Failed to process sensor point {point.get('id', 'unknown')}: {e}")
            raise

        return records_inserted

    def _upsert_building(self, building: Dict):
        """Insert or update building record"""
        self.db.upsert_building(building)

    def _upsert_floor(self, floor: Dict, building_id: str):
        """Insert or update floor record"""
        self.db.upsert_floor(floor, building_id)

    def _upsert_space(self, space: Dict, floor_id: str, building_id: str):
        """Insert or update space record"""
        self.db.upsert_space(space, floor_id, building_id)

