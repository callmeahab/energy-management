"""
Database Schema Loader for Python
Loads and executes the common SQL schema
"""

import os
import sqlite3
import logging
from typing import List

logger = logging.getLogger(__name__)


def load_schema_sql() -> str:
    """Load the SQL schema from file"""
    # Try multiple possible locations for the schema file
    possible_paths = [
        os.path.join(os.path.dirname(__file__), 'database.sql'),
        os.path.join(os.getcwd(), 'schema', 'database.sql'),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'schema', 'database.sql'),
        os.path.abspath(os.path.join(os.path.dirname(__file__), 'database.sql')),
        os.path.abspath(os.path.join(os.getcwd(), 'schema', 'database.sql'))
    ]
    
    for schema_path in possible_paths:
        if os.path.exists(schema_path):
            logger.info(f"Using schema file: {schema_path}")
            with open(schema_path, 'r', encoding='utf-8') as f:
                return f.read()
    
    raise FileNotFoundError(f"Schema file not found. Tried paths: {', '.join(possible_paths)}")


def get_sql_statements() -> List[str]:
    """Get individual SQL statements from schema"""
    schema = load_schema_sql()
    
    # Split by semicolon and filter out comments and empty lines
    statements = []
    for stmt in schema.split(';'):
        stmt = stmt.strip()
        if stmt and not stmt.startswith('--') and not stmt.startswith('/*'):
            statements.append(stmt + ';')
    
    return statements


def execute_schema(connection: sqlite3.Connection) -> None:
    """Execute schema on SQLite database connection"""
    try:
        statements = get_sql_statements()
        cursor = connection.cursor()
        
        for statement in statements:
            if statement.strip():
                try:
                    cursor.execute(statement)
                except sqlite3.Error as e:
                    logger.warning(f"Statement execution warning: {e}")
                    logger.debug(f"Statement was: {statement[:100]}...")
        
        connection.commit()
        logger.info("Database schema executed successfully")
        
    except Exception as e:
        logger.error(f"Schema execution failed: {e}")
        raise


def execute_schema_script(connection: sqlite3.Connection) -> None:
    """Execute entire schema as script (alternative method)"""
    try:
        schema = load_schema_sql()
        connection.executescript(schema)
        logger.info("Database schema script executed successfully")
        
    except Exception as e:
        logger.error(f"Schema script execution failed: {e}")
        raise