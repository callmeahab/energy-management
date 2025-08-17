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
  // Use common schema loader
  const { executeSchemaNode } = await import("../../schema/schema-loader.js");

  try {
    await executeSchemaNode(database);
  } catch (error) {
    console.error("Failed to execute common schema:", error);
    throw error;
  }
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
