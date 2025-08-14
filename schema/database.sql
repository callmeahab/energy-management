-- =============================================================================
-- Energy Efficiency Database Schema
-- Aligned with GraphQL schema for seamless sync operations
-- Used by both Next.js app and Python sync service
-- =============================================================================

-- Buildings table - matches GraphQL Building type
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    exact_type TEXT,
    mapping_key TEXT,
    connected_data_source_id TEXT,
    time_zone TEXT,
    type_array TEXT,                    -- JSON string of type array
    
    -- Address fields (flattened from GraphQL Address object)
    address_id TEXT,
    address_street TEXT,
    address_city TEXT,
    address_state TEXT,
    address_country TEXT,
    address_postal_code TEXT,
    
    -- Geolocation fields (flattened from GraphQL GeoPointQuantity)
    latitude REAL,
    longitude REAL,
    
    -- Area measurements (flattened from GraphQL AreaQuantity objects)
    gross_area_value REAL,
    gross_area_unit TEXT,
    rentable_area_value REAL,
    rentable_area_unit TEXT,
    usable_area_value REAL,
    usable_area_unit TEXT,
    
    -- Standard timestamps
    date_created TEXT,
    date_updated TEXT,
    sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Floors table - matches GraphQL Floor type
CREATE TABLE IF NOT EXISTS floors (
    id TEXT PRIMARY KEY,
    building_id TEXT NOT NULL,
    name TEXT,
    description TEXT,
    exact_type TEXT,
    level INTEGER,                      -- Floor level number
    mapping_key TEXT,
    connected_data_source_id TEXT,
    type_array TEXT,                    -- JSON string of type array
    
    -- Area measurements
    gross_area_value REAL,
    gross_area_unit TEXT,
    rentable_area_value REAL,
    rentable_area_unit TEXT,
    usable_area_value REAL,
    usable_area_unit TEXT,
    
    -- Standard timestamps
    date_created TEXT,
    date_updated TEXT,
    sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (building_id) REFERENCES buildings (id)
);

-- Spaces table - matches GraphQL Space type
CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    floor_id TEXT,
    building_id TEXT NOT NULL,
    name TEXT,
    description TEXT,
    exact_type TEXT,
    mapping_key TEXT,
    connected_data_source_id TEXT,
    type_array TEXT,                    -- JSON string of type array
    
    -- Standard timestamps
    date_created TEXT,
    date_updated TEXT,
    sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (floor_id) REFERENCES floors (id),
    FOREIGN KEY (building_id) REFERENCES buildings (id)
);

-- Energy usage table - stores calculated/synced energy data
CREATE TABLE IF NOT EXISTS energy_usage (
    id TEXT PRIMARY KEY,
    building_id TEXT NOT NULL,
    floor_id TEXT,
    space_id TEXT,
    timestamp TEXT NOT NULL,
    consumption_kwh REAL,
    cost_usd REAL,
    efficiency_score REAL,
    usage_type TEXT,
    source TEXT DEFAULT 'calculated',
    sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (building_id) REFERENCES buildings (id),
    FOREIGN KEY (floor_id) REFERENCES floors (id),
    FOREIGN KEY (space_id) REFERENCES spaces (id)
);

-- Sync status table - tracks synchronization operations
CREATE TABLE IF NOT EXISTS sync_status (
    id TEXT PRIMARY KEY,
    last_sync_timestamp TEXT,
    sync_type TEXT,
    status TEXT,
    records_synced INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Buildings indexes
CREATE INDEX IF NOT EXISTS idx_buildings_sync ON buildings(sync_timestamp);
CREATE INDEX IF NOT EXISTS idx_buildings_mapping_key ON buildings(mapping_key);
CREATE INDEX IF NOT EXISTS idx_buildings_connected_data_source ON buildings(connected_data_source_id);

-- Floors indexes
CREATE INDEX IF NOT EXISTS idx_floors_building ON floors(building_id);
CREATE INDEX IF NOT EXISTS idx_floors_mapping_key ON floors(mapping_key);
CREATE INDEX IF NOT EXISTS idx_floors_level ON floors(building_id, level);

-- Spaces indexes
CREATE INDEX IF NOT EXISTS idx_spaces_floor ON spaces(floor_id);
CREATE INDEX IF NOT EXISTS idx_spaces_building ON spaces(building_id);
CREATE INDEX IF NOT EXISTS idx_spaces_mapping_key ON spaces(mapping_key);

-- Energy usage indexes
CREATE INDEX IF NOT EXISTS idx_energy_building ON energy_usage(building_id);
CREATE INDEX IF NOT EXISTS idx_energy_timestamp ON energy_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_energy_building_time ON energy_usage(building_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_energy_source ON energy_usage(source);

-- Sync status indexes
CREATE INDEX IF NOT EXISTS idx_sync_status_type ON sync_status(sync_type, last_sync_timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_status_created ON sync_status(created_at);

-- =============================================================================
-- UNIQUE CONSTRAINTS
-- =============================================================================

-- Ensure unique energy records per hour per location/source combination
-- This will be created after potential deduplication in the application code
-- CREATE UNIQUE INDEX ux_energy_usage_unique_hour ON energy_usage (
--     building_id,
--     COALESCE(floor_id, '*'),
--     COALESCE(space_id, '*'),
--     timestamp,
--     usage_type,
--     source
-- );