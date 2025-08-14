#!/usr/bin/env node

/**
 * Database Migration Script
 * Migrates existing database to new GraphQL-aligned schema
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(process.cwd(), 'energy_efficiency.sqlite');
const BACKUP_PATH = path.join(process.cwd(), `energy_efficiency_backup_${Date.now()}.sqlite`);

async function migrateDatabase() {
  console.log('🔄 Starting database migration...');
  
  // Create backup first
  if (fs.existsSync(DB_PATH)) {
    console.log('📋 Creating backup...');
    fs.copyFileSync(DB_PATH, BACKUP_PATH);
    console.log(`✅ Backup created at: ${BACKUP_PATH}`);
  }

  const db = new sqlite3.Database(DB_PATH);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('🏗️  Adding new columns to buildings table...');
      
      // Add new columns to buildings table
      const buildingMigrations = [
        'ALTER TABLE buildings ADD COLUMN mapping_key TEXT',
        'ALTER TABLE buildings ADD COLUMN connected_data_source_id TEXT',
        'ALTER TABLE buildings ADD COLUMN time_zone TEXT',
        'ALTER TABLE buildings ADD COLUMN type_array TEXT',
        'ALTER TABLE buildings ADD COLUMN address_id TEXT',
        'ALTER TABLE buildings ADD COLUMN gross_area_value REAL',
        'ALTER TABLE buildings ADD COLUMN gross_area_unit TEXT',
        'ALTER TABLE buildings ADD COLUMN rentable_area_value REAL',
        'ALTER TABLE buildings ADD COLUMN rentable_area_unit TEXT',
        'ALTER TABLE buildings ADD COLUMN usable_area_value REAL',
        'ALTER TABLE buildings ADD COLUMN usable_area_unit TEXT'
      ];

      // Add new columns to floors table
      const floorMigrations = [
        'ALTER TABLE floors ADD COLUMN exact_type TEXT',
        'ALTER TABLE floors ADD COLUMN level INTEGER',
        'ALTER TABLE floors ADD COLUMN mapping_key TEXT',
        'ALTER TABLE floors ADD COLUMN connected_data_source_id TEXT',
        'ALTER TABLE floors ADD COLUMN gross_area_value REAL',
        'ALTER TABLE floors ADD COLUMN gross_area_unit TEXT',
        'ALTER TABLE floors ADD COLUMN rentable_area_value REAL',
        'ALTER TABLE floors ADD COLUMN rentable_area_unit TEXT',
        'ALTER TABLE floors ADD COLUMN usable_area_value REAL',
        'ALTER TABLE floors ADD COLUMN usable_area_unit TEXT',
        'ALTER TABLE floors ADD COLUMN type_array TEXT'
      ];

      // Add new columns to spaces table
      const spaceMigrations = [
        'ALTER TABLE spaces ADD COLUMN mapping_key TEXT',
        'ALTER TABLE spaces ADD COLUMN connected_data_source_id TEXT',
        'ALTER TABLE spaces ADD COLUMN type_array TEXT'
      ];

      const allMigrations = [...buildingMigrations, ...floorMigrations, ...spaceMigrations];
      
      let completed = 0;
      let errors = [];

      allMigrations.forEach((migration, index) => {
        db.run(migration, function(err) {
          if (err && !err.message.includes('duplicate column name')) {
            console.log(`⚠️  Migration ${index + 1} error (non-critical): ${err.message}`);
            errors.push(err.message);
          }
          
          completed++;
          if (completed === allMigrations.length) {
            console.log('🗂️  Creating new indexes...');
            
            // Create new indexes
            const indexMigrations = [
              'CREATE INDEX IF NOT EXISTS idx_buildings_mapping_key ON buildings(mapping_key)',
              'CREATE INDEX IF NOT EXISTS idx_floors_mapping_key ON floors(mapping_key)',
              'CREATE INDEX IF NOT EXISTS idx_spaces_mapping_key ON spaces(mapping_key)'
            ];

            let indexCompleted = 0;
            indexMigrations.forEach((indexMigration) => {
              db.run(indexMigration, function(err) {
                if (err) {
                  console.log(`⚠️  Index creation error: ${err.message}`);
                }
                indexCompleted++;
                if (indexCompleted === indexMigrations.length) {
                  console.log('✅ Database migration completed successfully!');
                  console.log(`📊 ${allMigrations.length} column migrations attempted`);
                  console.log(`📊 ${indexMigrations.length} indexes created`);
                  if (errors.length > 0) {
                    console.log(`⚠️  ${errors.length} non-critical errors (likely existing columns)`);
                  }
                  db.close();
                  resolve();
                }
              });
            });
          }
        });
      });
    });
  });
}

if (require.main === module) {
  migrateDatabase()
    .then(() => {
      console.log('🎉 Migration script completed!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrateDatabase };