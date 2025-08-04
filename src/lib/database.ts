import Database from 'duckdb';
import path from 'path';
import fs from 'fs';

// Database connection and initialization
let db: Database.Database | null = null;

export const initializeDatabase = async (): Promise<Database.Database> => {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const dataDir = path.join(process.cwd(), 'data');
    const dbPath = path.join(dataDir, 'energy_efficiency.duckdb');
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database.Database(dbPath, (err) => {
      if (err) {
        console.error('Failed to initialize DuckDB:', err);
        reject(err);
        return;
      }
      
      console.log('DuckDB initialized successfully');
      createTables().then(() => resolve(db!)).catch(reject);
    });
  });
};

const createTables = async (): Promise<void> => {
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    db!.serialize(() => {
      // Buildings table with DuckDB optimizations
      db!.run(`
        CREATE TABLE IF NOT EXISTS buildings (
          id VARCHAR PRIMARY KEY,
          name VARCHAR,
          description VARCHAR,
          exact_type VARCHAR,
          address_street VARCHAR,
          address_city VARCHAR,
          address_state VARCHAR,
          address_country VARCHAR,
          address_postal_code VARCHAR,
          latitude DOUBLE,
          longitude DOUBLE,
          date_created TIMESTAMP,
          date_updated TIMESTAMP,
          floors_count INTEGER DEFAULT 0,
          spaces_count INTEGER DEFAULT 0,
          sync_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Floors table
      db!.run(`
        CREATE TABLE IF NOT EXISTS floors (
          id VARCHAR PRIMARY KEY,
          building_id VARCHAR,
          name VARCHAR,
          description VARCHAR,
          date_created TIMESTAMP,
          date_updated TIMESTAMP,
          spaces_count INTEGER DEFAULT 0,
          sync_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Spaces table
      db!.run(`
        CREATE TABLE IF NOT EXISTS spaces (
          id VARCHAR PRIMARY KEY,
          floor_id VARCHAR,
          building_id VARCHAR,
          name VARCHAR,
          description VARCHAR,
          exact_type VARCHAR,
          date_created TIMESTAMP,
          date_updated TIMESTAMP,
          sync_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Energy usage data table - optimized for analytics
      db!.run(`
        CREATE TABLE IF NOT EXISTS energy_usage (
          id VARCHAR PRIMARY KEY,
          building_id VARCHAR,
          floor_id VARCHAR,
          space_id VARCHAR,
          timestamp TIMESTAMP,
          consumption_kwh DOUBLE,
          cost_usd DOUBLE,
          efficiency_score DOUBLE,
          temperature_celsius DOUBLE,
          occupancy_count INTEGER,
          usage_type VARCHAR,
          source VARCHAR DEFAULT 'calculated',
          sync_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Sync status table
      db!.run(`
        CREATE TABLE IF NOT EXISTS sync_status (
          id BIGINT,
          last_sync_timestamp TIMESTAMP,
          sync_type VARCHAR,
          status VARCHAR,
          records_synced INTEGER DEFAULT 0,
          errors_count INTEGER DEFAULT 0,
          error_message TEXT,
          duration_ms INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes optimized for DuckDB analytics
      db!.run(`CREATE INDEX IF NOT EXISTS idx_buildings_sync ON buildings(sync_timestamp)`);
      db!.run(`CREATE INDEX IF NOT EXISTS idx_floors_building ON floors(building_id)`);
      db!.run(`CREATE INDEX IF NOT EXISTS idx_spaces_floor ON spaces(floor_id)`);
      db!.run(`CREATE INDEX IF NOT EXISTS idx_spaces_building ON spaces(building_id)`);
      db!.run(`CREATE INDEX IF NOT EXISTS idx_energy_building ON energy_usage(building_id)`);
      db!.run(`CREATE INDEX IF NOT EXISTS idx_energy_timestamp ON energy_usage(timestamp)`);
      db!.run(`CREATE INDEX IF NOT EXISTS idx_energy_building_time ON energy_usage(building_id, timestamp)`);
      db!.run(`CREATE INDEX IF NOT EXISTS idx_sync_status_type ON sync_status(sync_type, last_sync_timestamp)`);

      resolve();
    });
  });
};

export const getDatabase = (): Database.Database => {
  if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return db;
};

export const closeDatabase = (): Promise<void> => {
  if (!db) return Promise.resolve();

  return new Promise((resolve) => {
    db!.close(() => {
      db = null;
      resolve();
    });
  });
};

// Helper function to run queries
export const runQuery = <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    if (params.length === 0) {
      database.all(sql, (err, rows) => {
        if (err) {
          console.error('Query error:', err);
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    } else {
      database.all(sql, params, (err, rows) => {
        if (err) {
          console.error('Query error:', err);
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    }
  });
};

// Helper function to run single row queries
export const runQuerySingle = <T = any>(sql: string, params: any[] = []): Promise<T | null> => {
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    if (params.length === 0) {
      database.all(sql + ' LIMIT 1', (err, rows) => {
        if (err) {
          console.error('Query error:', err);
          reject(err);
        } else {
          resolve((rows?.[0] as T) || null);
        }
      });
    } else {
      database.all(sql + ' LIMIT 1', params, (err, rows) => {
        if (err) {
          console.error('Query error:', err);
          reject(err);
        } else {
          resolve((rows?.[0] as T) || null);
        }
      });
    }
  });
};

// Helper function to run insert/update/delete queries
export const runCommand = (sql: string, params: any[] = []): Promise<{ changes: number; lastID: number }> => {
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    if (params.length === 0) {
      database.run(sql, function(err) {
        if (err) {
          console.error('Command error:', err);
          console.error('SQL:', sql);
          reject(err);
        } else {
          resolve({ changes: this.changes, lastID: this.lastID });
        }
      });
    } else {
      database.run(sql, params, function(err) {
        if (err) {
          console.error('Command error:', err);
          console.error('SQL:', sql);
          console.error('Params:', params);
          reject(err);
        } else {
          resolve({ changes: this.changes, lastID: this.lastID });
        }
      });
    }
  });
};