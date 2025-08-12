import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";

// Database connection and initialization
let db: sqlite3.Database | null = null;
let dbInitPromise: Promise<sqlite3.Database> | null = null; // guard against race returning uninitialized handle

export const initializeDatabase = async (): Promise<sqlite3.Database> => {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  const dataDir = path.join(process.cwd(), "data");
  const dbPath = path.join(dataDir, "energy_efficiency.sqlite");

  function attemptOpen(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const database = new sqlite3.Database(dbPath, (err) => {
          if (err) {
            console.error("Failed to initialize SQLite:", err);
            dbInitPromise = null;
            return reject(err);
          }
          console.log("SQLite connection opened successfully");
          createTables(database)
            .then(() => {
              db = database;
              console.log("SQLite initialized successfully (tables ready)");
              resolve(db);
            })
            .catch((e) => {
              console.error("Failed during SQLite table creation:", e);
              dbInitPromise = null;
              try {
                database.close();
              } catch {}
              reject(e);
            });
        });
      } catch (outer) {
        dbInitPromise = null;
        reject(outer);
      }
    });
  }

  dbInitPromise = attemptOpen();

  return dbInitPromise;
};

const createTables = async (database: sqlite3.Database): Promise<void> => {
  // Combine DDL into single exec so we can await completion reliably
  const ddl = `
    CREATE TABLE IF NOT EXISTS buildings (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      exact_type TEXT,
      address_street TEXT,
      address_city TEXT,
      address_state TEXT,
      address_country TEXT,
      address_postal_code TEXT,
      latitude REAL,
      longitude REAL,
      date_created TEXT,
      date_updated TEXT,
      floors_count INTEGER DEFAULT 0,
      spaces_count INTEGER DEFAULT 0,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS floors (
      id TEXT PRIMARY KEY,
      building_id TEXT,
      name TEXT,
      description TEXT,
      date_created TEXT,
      date_updated TEXT,
      spaces_count INTEGER DEFAULT 0,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      floor_id TEXT,
      building_id TEXT,
      name TEXT,
      description TEXT,
      exact_type TEXT,
      date_created TEXT,
      date_updated TEXT,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS energy_usage (
      id TEXT PRIMARY KEY,
      building_id TEXT,
      floor_id TEXT,
      space_id TEXT,
      timestamp TEXT,
      consumption_kwh REAL,
      cost_usd REAL,
      efficiency_score REAL,
      temperature_celsius REAL,
      occupancy_count INTEGER,
      usage_type TEXT,
      source TEXT DEFAULT 'calculated',
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sync_status (
      id INTEGER,
      last_sync_timestamp TEXT,
      sync_type TEXT,
      status TEXT,
      records_synced INTEGER DEFAULT 0,
      errors_count INTEGER DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS occupancy_data (
      id TEXT PRIMARY KEY,
      building_id TEXT,
      floor_id TEXT,
      space_id TEXT,
      timestamp TEXT,
      occupancy_count INTEGER,
      occupancy_percentage REAL,
      peak_hours TEXT,
      sensor_type TEXT,
      source TEXT DEFAULT 'mapped_api',
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS appliance_efficiency (
      id TEXT PRIMARY KEY,
      building_id TEXT,
      floor_id TEXT,
      space_id TEXT,
      appliance_name TEXT,
      appliance_type TEXT,
      timestamp TEXT,
      energy_consumption REAL,
      efficiency_score REAL,
      operational_status TEXT,
      issues_detected TEXT,
      recommendations TEXT,
      source TEXT DEFAULT 'mapped_api',
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_buildings_sync ON buildings(sync_timestamp);
    CREATE INDEX IF NOT EXISTS idx_floors_building ON floors(building_id);
    CREATE INDEX IF NOT EXISTS idx_spaces_floor ON spaces(floor_id);
    CREATE INDEX IF NOT EXISTS idx_spaces_building ON spaces(building_id);
    CREATE INDEX IF NOT EXISTS idx_energy_building ON energy_usage(building_id);
    CREATE INDEX IF NOT EXISTS idx_energy_timestamp ON energy_usage(timestamp);
    CREATE INDEX IF NOT EXISTS idx_energy_building_time ON energy_usage(building_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_occupancy_building ON occupancy_data(building_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_appliance_building ON appliance_efficiency(building_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_sync_status_type ON sync_status(sync_type, last_sync_timestamp);
  `;
  await new Promise<void>((resolve, reject) => {
    database.exec(ddl, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

export const getDatabase = (): sqlite3.Database => {
  if (!db)
    throw new Error(
      "Database not initialized. Call initializeDatabase() first."
    );
  return db;
};

export const closeDatabase = (): Promise<void> => {
  if (!db) return Promise.resolve();

  return new Promise((resolve) => {
    db!.close(() => {
      db = null;
      dbInitPromise = null;
      resolve();
    });
  });
};

// Helper function to run queries
export const runQuery = <T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> => {
  const database = getDatabase();

  return new Promise((resolve, reject) => {
    if (params.length === 0) {
      database.all(sql, (err, rows) => {
        if (err) {
          console.error("Query error:", err);
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    } else {
      database.all(sql, params, (err, rows) => {
        if (err) {
          console.error("Query error:", err);
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    }
  });
};

// Helper function to run single row queries
export const runQuerySingle = <T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> => {
  const database = getDatabase();

  return new Promise((resolve, reject) => {
    if (params.length === 0) {
      database.all(sql + " LIMIT 1", (err, rows) => {
        if (err) {
          console.error("Query error:", err);
          reject(err);
        } else {
          resolve((rows?.[0] as T) || null);
        }
      });
    } else {
      database.all(sql + " LIMIT 1", params, (err, rows) => {
        if (err) {
          console.error("Query error:", err);
          reject(err);
        } else {
          resolve((rows?.[0] as T) || null);
        }
      });
    }
  });
};

// Helper function to run insert/update/delete queries
export const runCommand = (
  sql: string,
  params: unknown[] = []
): Promise<{ changes: number; lastID: number }> => {
  const database = getDatabase();

  return new Promise((resolve, reject) => {
    if (params.length === 0) {
      database.run(
        sql,
        function (this: { changes: number; lastID: number }, err) {
          if (err) {
            console.error("Command error:", err);
            console.error("SQL:", sql);
            reject(err);
          } else {
            resolve({ changes: this.changes, lastID: this.lastID });
          }
        }
      );
    } else {
      database.run(
        sql,
        params,
        function (this: { changes: number; lastID: number }, err) {
          if (err) {
            console.error("Command error:", err);
            console.error("SQL:", sql);
            console.error("Params:", params);
            reject(err);
          } else {
            resolve({ changes: this.changes, lastID: this.lastID });
          }
        }
      );
    }
  });
};
