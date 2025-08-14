# Database Schema

This directory contains the common database schema used by both the Next.js application and the Python sync service.

## Files

- **`database.sql`** - The authoritative database schema definition
- **`schema-loader.js`** - Node.js loader for Next.js application
- **`schema_loader.py`** - Python loader for energy-sync-py service

## Schema Design

The database schema is designed to mirror the GraphQL API structure for seamless data synchronization:

### Tables

1. **`buildings`** - Maps to GraphQL `Building` type
   - Core fields: `id`, `name`, `description`, `exact_type`
   - GraphQL-specific: `mapping_key`, `connected_data_source_id`, `time_zone`, `type_array`
   - Flattened address: `address_*` fields from GraphQL `Address` object
   - Flattened geolocation: `latitude`, `longitude` from GraphQL `GeoPointQuantity`
   - Flattened areas: `*_area_value/unit` from GraphQL `AreaQuantity` objects

2. **`floors`** - Maps to GraphQL `Floor` type
   - Includes `level` field and area measurements
   - Foreign key to `buildings`

3. **`spaces`** - Maps to GraphQL `Space` type
   - Foreign keys to both `floors` and `buildings`

4. **`energy_usage`** - Calculated energy consumption data
   - Links to buildings, floors, or spaces
   - Stores hourly energy data with costs and efficiency scores

5. **`sync_status`** - Tracks synchronization operations
   - Records sync timestamps, status, and error information

### Indexes

Performance indexes are created for:
- Sync timestamps and mapping keys
- Foreign key relationships
- Energy data queries by building and timestamp

## Usage

### Next.js Application

```javascript
const { executeSchemaNode } = require('../schema/schema-loader.js');

// In database.ts
await executeSchemaNode(database);
```

### Python Sync Service

```python
from schema.schema_loader import execute_schema_script

# In database.py
execute_schema_script(connection)
```

## Schema Evolution

To modify the database schema:

1. **Update `database.sql`** - Make changes to the authoritative schema
2. **Test consistency** - Run `npm run test:schema` to verify both apps use identical schema
3. **Create migration** - Add migration logic if needed for existing data
4. **Update both apps** - Ensure any code changes accommodate schema updates

## Testing

Run the schema consistency test:

```bash
node scripts/test-schema-consistency.js
```

This verifies:
- Schema loads correctly in both environments
- All expected tables and indexes are created
- Column structures match expectations
- Both apps produce identical database structures

## Benefits

1. **Single Source of Truth** - All schema changes in one place
2. **Perfect Consistency** - Both apps use identical database structure
3. **GraphQL Alignment** - Schema mirrors API structure for easy sync
4. **Maintainability** - No schema drift between applications
5. **Robust Path Resolution** - Works in development and production environments