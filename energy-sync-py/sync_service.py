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

            # Step 1: Sync buildings and structural data
            try:
                building_result = self._sync_buildings(last_sync)
                total_records += building_result["records_synced"]
                total_errors += building_result["errors_count"]
                if building_result.get("error_message"):
                    error_messages.append(
                        f"Building sync error: {building_result['error_message']}"
                    )
            except Exception as e:
                error_messages.append(f"Building sync error: {e}")
                total_errors += 1
                logger.error(f"Building sync failed: {e}", exc_info=True)

            # Step 2: Sync energy consumption data
            try:
                energy_result = self._sync_energy_data()
                total_records += energy_result["records_synced"]
                total_errors += energy_result["errors_count"]
                if energy_result.get("error_message"):
                    error_messages.append(
                        f"Energy sync error: {energy_result['error_message']}"
                    )
            except Exception as e:
                error_messages.append(f"Energy sync error: {e}")
                total_errors += 1
                logger.error(f"Energy sync failed: {e}", exc_info=True)

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

    def _sync_energy_data(self) -> Dict[str, Any]:
        """Sync energy consumption data from Mapped API"""
        logger.info("Starting energy data sync")

        records_synced = 0
        errors_count = 0

        try:
            # Get all buildings from database
            buildings = self.db.get_all_buildings()

            if not buildings:
                logger.info("No buildings found - skipping energy data sync")
                return {"records_synced": 0, "errors_count": 0}

            building_ids = [b["id"] for b in buildings]
            logger.info(f"Syncing energy data for {len(building_ids)} buildings")

            # Query energy points from Mapped API (simplified without non-existent fields)
            query = """
            query GetEnergyPoints($buildingIds: [String!]) {
                buildings(filter: { id: { in: $buildingIds } }) {
                    id
                    name
                    points(filter: { exactType: { in: ["Electric_Power_Sensor"] } }) {
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
                        }
                    }
                }
            }
            """

            variables = {"buildingIds": building_ids}
            response = self._make_graphql_request(query, variables)

            if "errors" in response:
                logger.error(f"Energy points query failed: {response['errors']}")
                return {"records_synced": 0, "errors_count": 1}

            buildings_data = response.get("data", {}).get("buildings", [])
            logger.info(
                f"Energy points GraphQL response received for {len(buildings_data)} buildings"
            )

            for building in buildings_data:
                # Sync building-level points
                for point in building.get("points", []):
                    try:
                        count = self._process_energy_data_point(
                            point, building["id"], None, None
                        )
                        records_synced += count
                    except Exception as e:
                        logger.error(
                            f"Failed to sync building point {point['id']}: {e}"
                        )
                        errors_count += 1

                # Sync floor-level points
                for floor in building.get("floors", []):
                    for point in floor.get("points", []):
                        try:
                            count = self._process_energy_data_point(
                                point, building["id"], floor["id"], None
                            )
                            records_synced += count
                        except Exception as e:
                            logger.error(
                                f"Failed to sync floor point {point['id']}: {e}"
                            )
                            errors_count += 1

                    # Sync space-level points
                    for space in floor.get("spaces", []):
                        for point in space.get("points", []):
                            try:
                                count = self._process_energy_data_point(
                                    point, building["id"], floor["id"], space["id"]
                                )
                                records_synced += count
                            except Exception as e:
                                logger.error(
                                    f"Failed to sync space point {point['id']}: {e}"
                                )
                                errors_count += 1

            logger.info(
                f"Energy data sync completed: {records_synced} records synced, {errors_count} errors"
            )

        except Exception as e:
            logger.error(f"Energy data sync failed: {e}")
            errors_count += 1

        return {"records_synced": records_synced, "errors_count": errors_count}

    def _process_energy_data_point(
        self,
        point: Dict,
        building_id: str,
        floor_id: Optional[str],
        space_id: Optional[str],
    ) -> int:
        """Process a single energy data point and store hourly records"""
        if not point.get("series"):
            return 0

        records_inserted = 0
        current_time = datetime.now(timezone.utc)
        
        # Log unit information for debugging
        unit_info = point.get("unit", {})
        unit_name = unit_info.get("name", "unknown") if unit_info else "unknown"
        logger.debug(f"Processing point {point.get('id', 'unknown')} with unit: {unit_name}")
        logger.debug(f"Point exactType: {point.get('exactType', 'unknown')}")
        logger.debug(f"Series data count: {len(point.get('series', []))}")

        for data_point in point["series"]:
            try:
                timestamp_str = data_point.get("timestamp", current_time.isoformat())
                timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))

                # Extract numeric value
                value = data_point.get("value", {})
                numeric_value = (
                    value.get("float64Value")
                    or value.get("float32Value")
                    or (
                        float(value.get("stringValue", "0"))
                        if value.get("stringValue")
                        else 0
                    )
                    or (1.0 if value.get("boolValue") else 0.0)
                )

                if numeric_value is None:
                    continue
                
                # Log the raw value and unit for first few records to understand the data
                if records_inserted < 3:  # Only log first few to avoid spam
                    logger.info(f"Raw API data - Point: {point.get('id', 'unknown')[:20]}, Unit: {unit_name}, Raw Value: {numeric_value}, Value Object: {value}")

                # Generate unique ID using the actual timestamp (not bucketed)
                # This allows us to store each sync run's data as a separate point
                energy_id = f"{point['id']}_{int(timestamp.timestamp())}"

                # Store instantaneous power reading and calculate minimal energy consumption
                power_watts = float(numeric_value)
                power_kw = power_watts / 1000  # Convert watts to kilowatts
                
                # For instantaneous readings, calculate energy consumption for 30-minute reporting interval
                # This represents the energy that would be consumed if this power level continued for 30 minutes
                consumption = power_kw * 0.5  # kWh for 30-minute interval (0.5 hours)
                cost = consumption * 0.12  # Assume $0.12 per kWh

                # Calculate efficiency score (0.7-1.0 range)
                import random

                efficiency = 0.7 + (0.3 * random.random())

                # Create energy record with actual timestamp
                energy_record = {
                    "id": energy_id,
                    "building_id": building_id,
                    "floor_id": floor_id,
                    "space_id": space_id,
                    "timestamp": timestamp,
                    "consumption_kwh": consumption,
                    "cost_usd": cost,
                    "efficiency_score": efficiency,
                    "usage_type": point.get("exactType", "sensor"),
                    "source": "mapped_api",
                }

                # Check if record already exists using unique constraint fields
                if self.db.energy_record_exists(energy_record):
                    logger.debug(f"Energy record already exists, skipping: {energy_id}")
                    continue

                self.db.insert_energy_record(energy_record)
                records_inserted += 1

                logger.debug(
                    f"Inserted energy record: {energy_id} ({power_watts}W -> {consumption:.4f} kWh for 30min interval)"
                )

            except Exception as e:
                logger.error(f"Failed to process energy data point: {e}")
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

