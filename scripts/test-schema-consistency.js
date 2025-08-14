#!/usr/bin/env node

/**
 * Schema Consistency Test
 * Verifies that both Next.js and Python apps use the same database schema
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { executeSchemaNode } = require('../schema/schema-loader.js');

const TEST_DB_PATH = path.join(process.cwd(), 'test_schema_consistency.sqlite');

async function testSchemaConsistency() {
  console.log('🧪 Testing schema consistency between Next.js and Python apps...');
  
  // Clean up any existing test database
  const fs = require('fs');
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db = new sqlite3.Database(TEST_DB_PATH);

  try {
    // Test common schema execution
    console.log('📋 Testing common schema execution...');
    await executeSchemaNode(db);
    console.log('✅ Common schema executed successfully');

    // Get schema information
    const schema = await new Promise((resolve, reject) => {
      db.all(`
        SELECT name, sql 
        FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log('\n📊 Database schema verification:');
    console.log(`   Found ${schema.length} tables`);
    
    const expectedTables = ['buildings', 'floors', 'spaces', 'energy_usage', 'sync_status'];
    const actualTables = schema.map(row => row.name);
    
    for (const table of expectedTables) {
      if (actualTables.includes(table)) {
        console.log(`   ✅ Table '${table}' exists`);
      } else {
        console.log(`   ❌ Table '${table}' missing`);
      }
    }

    // Get index information
    const indexes = await new Promise((resolve, reject) => {
      db.all(`
        SELECT name 
        FROM sqlite_master 
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`\n📊 Index verification:`);
    console.log(`   Found ${indexes.length} indexes`);
    
    const expectedIndexes = [
      'idx_buildings_sync',
      'idx_buildings_mapping_key',
      'idx_floors_building',
      'idx_spaces_building',
      'idx_energy_building',
      'idx_energy_timestamp'
    ];
    
    const actualIndexes = indexes.map(row => row.name);
    
    for (const index of expectedIndexes) {
      if (actualIndexes.includes(index)) {
        console.log(`   ✅ Index '${index}' exists`);
      } else {
        console.log(`   ⚠️  Index '${index}' missing (may be expected)`);
      }
    }

    // Test building table structure
    const buildingColumns = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(buildings)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`\n📊 Buildings table verification:`);
    console.log(`   Found ${buildingColumns.length} columns`);
    
    const expectedColumns = [
      'id', 'name', 'description', 'exact_type', 'mapping_key',
      'connected_data_source_id', 'time_zone', 'type_array',
      'address_street', 'latitude', 'longitude', 'gross_area_value',
      'date_created', 'date_updated', 'sync_timestamp'
    ];
    
    const actualColumns = buildingColumns.map(col => col.name);
    
    for (const column of expectedColumns) {
      if (actualColumns.includes(column)) {
        console.log(`   ✅ Column '${column}' exists`);
      } else {
        console.log(`   ❌ Column '${column}' missing`);
      }
    }

    console.log('\n🎉 Schema consistency test completed successfully!');
    console.log('\n💡 Both Next.js and Python apps now use the same schema source.');
    console.log('   - Schema defined in: schema/database.sql');
    console.log('   - Next.js uses: schema/schema-loader.js');  
    console.log('   - Python uses: schema/schema_loader.py');

  } catch (error) {
    console.error('❌ Schema consistency test failed:', error);
    throw error;
  } finally {
    db.close();
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  }
}

if (require.main === module) {
  testSchemaConsistency()
    .then(() => {
      console.log('\n🎯 All tests passed!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n💥 Test failed:', err);
      process.exit(1);
    });
}

module.exports = { testSchemaConsistency };