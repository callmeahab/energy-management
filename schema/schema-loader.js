/**
 * Database Schema Loader
 * Loads and executes the common SQL schema for both Next.js and Python apps
 */

const fs = require('fs');
const path = require('path');

/**
 * Load the SQL schema from file
 * @returns {string} The SQL schema content
 */
function loadSchemaSQL() {
  // Try multiple possible locations for the schema file
  const possiblePaths = [
    path.join(__dirname, 'database.sql'),
    path.join(process.cwd(), 'schema', 'database.sql'),
    path.join(process.cwd(), '..', 'schema', 'database.sql'),
    path.resolve(__dirname, 'database.sql'),
    path.resolve(process.cwd(), 'schema', 'database.sql')
  ];
  
  for (const schemaPath of possiblePaths) {
    if (fs.existsSync(schemaPath)) {
      console.log(`Using schema file: ${schemaPath}`);
      return fs.readFileSync(schemaPath, 'utf8');
    }
  }
  
  throw new Error(`Schema file not found. Tried paths: ${possiblePaths.join(', ')}`);
}

/**
 * Execute schema on SQLite database (Node.js version)
 * @param {sqlite3.Database} database - SQLite database instance
 * @returns {Promise<void>}
 */
function executeSchemaNode(database) {
  return new Promise((resolve, reject) => {
    const schema = loadSchemaSQL();
    
    database.exec(schema, (err) => {
      if (err) {
        console.error('Schema execution failed:', err);
        reject(err);
      } else {
        console.log('Database schema executed successfully');
        resolve();
      }
    });
  });
}

/**
 * Get individual SQL statements from schema (for Python sqlite3)
 * @returns {string[]} Array of SQL statements
 */
function getSQLStatements() {
  const schema = loadSchemaSQL();
  
  // Split by semicolon and filter out comments and empty lines
  return schema
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    .map(stmt => stmt + ';'); // Re-add semicolon
}

module.exports = {
  loadSchemaSQL,
  executeSchemaNode,
  getSQLStatements
};