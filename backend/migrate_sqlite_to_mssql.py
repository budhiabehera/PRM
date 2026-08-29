r"""
Migration Script: SQLite to MS SQL Server
==========================================
Reads all data from the local SQLite database (resource_tracker.db)
and inserts it into the MS SQL Server database with PRM_ table prefix.

Usage:
    cd D:\Work\GitHub\Projects\fx-resource-dashboard\backend
    python migrate_sqlite_to_mssql.py
"""

import os
import sys
import sqlite3
import re
from pathlib import Path
from sqlalchemy import create_engine, text, inspect
import pyodbc

# --- Configuration ---
SQLITE_PATH = os.path.join(os.path.dirname(__file__), "resource_tracker.db")

# Read credentials from test_connection.py (which is confirmed working)
_test_file = os.path.join(os.path.dirname(__file__), "test_connection.py")
with open(_test_file, "r") as f:
    _test_src = f.read()

# Extract variables from test_connection.py
server = re.search(r'server\s*=\s*"([^"]+)"', _test_src).group(1)
database = re.search(r'database\s*=\s*"([^"]+)"', _test_src).group(1)
username = re.search(r'username\s*=\s*"([^"]+)"', _test_src).group(1)
pw = re.search(r'password\s*=\s*"([^"]+)"', _test_src).group(1)
driver = re.search(r'driver\s*=\s*"([^"]+)"', _test_src).group(1)

# Build ODBC connection string (exact same format as test_connection.py)
ODBC_CONN_STR = (
    f"DRIVER={{{driver}}};"
    f"SERVER={server};"
    f"DATABASE={database};"
    f"UID={username};"
    f"PWD={pw};"
    f"Encrypt=yes;"
    f"TrustServerCertificate=yes;"
    f"Connection Timeout=30"
)


def _mssql_connect():
    return pyodbc.connect(ODBC_CONN_STR)


if not os.path.exists(SQLITE_PATH):
    print("ERROR: SQLite database not found at " + SQLITE_PATH)
    sys.exit(1)

# Test connection first
print("Testing MS SQL connection...")
print(f"Server: {server}")
print(f"Database: {database}")
print(f"User: {username}")
print(f"Password length: {len(pw)}")
try:
    test_conn = pyodbc.connect(ODBC_CONN_STR)
    test_conn.cursor().execute("SELECT 1")
    test_conn.close()
    print("Connection OK!\n")
except Exception as e:
    print("Connection FAILED: " + str(e))
    sys.exit(1)

print("Source:  SQLite (" + SQLITE_PATH + ")")
print("Target:  MS SQL (" + server + "/" + database + ")")
print()

# --- Table mapping: SQLite name -> MS SQL name (with PRM_ prefix) ---
TABLE_MAP = {
    "users": "PRM_users",
    "user_preferences": "PRM_user_preferences",
    "filter_presets": "PRM_filter_presets",
    "projects": "PRM_projects",
    "main_modules": "PRM_main_modules",
    "sub_modules": "PRM_sub_modules",
    "developers": "PRM_developers",
    "skills": "PRM_skills",
    "work_types": "PRM_work_types",
    "sprints": "PRM_sprints",
    "tasks": "PRM_tasks",
    "task_activities": "PRM_task_activities",
    "task_attachments": "PRM_task_attachments",
    "task_dependencies": "PRM_task_dependencies",
    "task_statuses": "PRM_task_statuses",
    "availabilities": "PRM_availabilities",
    "holidays": "PRM_holidays",
    "time_logs": "PRM_time_logs",
    "role_capacities": "PRM_role_capacities",
    "notifications": "PRM_notifications",
    "kb_articles": "PRM_kb_articles",
    "kb_attachments": "PRM_kb_attachments",
    "audit_logs": "PRM_audit_logs",
    "integration_settings": "PRM_integration_settings",
    "page_access": "PRM_page_access",
    "user_projects": "PRM_user_projects",
    "developer_projects": "PRM_developer_projects",
}

# Order matters for foreign key constraints - parents first
# developers before users (users.developer_id -> developers)
MIGRATION_ORDER = [
    "integration_settings",
    "projects",
    "main_modules",
    "sub_modules",
    "developers",
    "users",
    "user_preferences",
    "filter_presets",
    "skills",
    "work_types",
    "sprints",
    "role_capacities",
    "task_statuses",
    "page_access",
    "holidays",
    "tasks",
    "task_activities",
    "task_attachments",
    "task_dependencies",
    "availabilities",
    "time_logs",
    "notifications",
    "kb_articles",
    "kb_attachments",
    "audit_logs",
    "user_projects",
    "developer_projects",
]


def migrate():
    # Connect to SQLite
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row

    # Connect to MS SQL using creator function (bypasses URL parsing)
    mssql_engine = create_engine("mssql+pyodbc://", creator=_mssql_connect, pool_pre_ping=True)

    # Add backend directory to path so we can import app modules
    sys.path.insert(0, os.path.dirname(__file__))

    # IMPORTANT: Remove DB_SERVER from env before importing database.py
    # so it uses SQLite mode (we only need Base/models for metadata, not its engine)
    os.environ.pop("DB_SERVER", None)
    os.environ.pop("DB_PASSWORD", None)

    # First, create tables if they don't exist
    print("Creating tables in MS SQL (if not exist)...")
    from app.database import Base
    from app import models  # noqa - ensures all models are registered

    Base.metadata.create_all(bind=mssql_engine)
    print("Tables ready!\n")

    # Get MS SQL inspector to check existing tables
    inspector = inspect(mssql_engine)
    mssql_tables = inspector.get_table_names()

    # --- DISABLE ALL FOREIGN KEY CONSTRAINTS ---
    print("Disabling foreign key constraints...")
    with mssql_engine.begin() as conn:
        for tbl in mssql_tables:
            if tbl.startswith("PRM_"):
                conn.execute(text(f"ALTER TABLE [{tbl}] NOCHECK CONSTRAINT ALL"))
    print("FK constraints disabled.\n")

    total_rows = 0
    errors = []

    for sqlite_table in MIGRATION_ORDER:
        mssql_table = TABLE_MAP.get(sqlite_table)
        if not mssql_table:
            print("  SKIP: " + sqlite_table + " (no mapping)")
            continue

        if mssql_table not in mssql_tables:
            print("  SKIP: " + mssql_table + " (table not in MS SQL)")
            continue

        # Read from SQLite
        cursor = sqlite_conn.cursor()
        try:
            cursor.execute("SELECT * FROM [" + sqlite_table + "]")
        except Exception as e:
            print("  SKIP: " + sqlite_table + " (SQLite error: " + str(e) + ")")
            continue

        rows = cursor.fetchall()
        if not rows:
            print("  " + sqlite_table + " -> " + mssql_table + ": 0 rows (empty)")
            continue

        columns = [desc[0] for desc in cursor.description]

        # Get MS SQL columns to filter out any that don't exist in target
        mssql_columns = {c["name"] for c in inspector.get_columns(mssql_table)}
        valid_columns = [c for c in columns if c in mssql_columns]

        if not valid_columns:
            print("  SKIP: " + sqlite_table + " (no matching columns)")
            continue

        # Check if target table already has data
        with mssql_engine.connect() as conn:
            existing_count = conn.execute(text("SELECT COUNT(*) FROM [" + mssql_table + "]")).scalar()
            if existing_count > 0:
                print("  " + sqlite_table + " -> " + mssql_table + ": SKIPPED (" + str(existing_count) + " rows already exist)")
                continue

        # Build INSERT statement
        col_list = ", ".join("[" + c + "]" for c in valid_columns)
        param_list = ", ".join(":" + c for c in valid_columns)
        insert_sql = "INSERT INTO [" + mssql_table + "] (" + col_list + ") VALUES (" + param_list + ")"

        # Check if table has an 'id' column (needs IDENTITY_INSERT)
        has_identity = "id" in valid_columns

        # Insert rows in batches
        batch_size = 100
        inserted = 0
        try:
            with mssql_engine.begin() as conn:
                if has_identity:
                    conn.execute(text("SET IDENTITY_INSERT [" + mssql_table + "] ON"))

                for i in range(0, len(rows), batch_size):
                    batch = rows[i:i + batch_size]
                    row_dicts = []
                    for row in batch:
                        row_dict = {}
                        for c in valid_columns:
                            val = row[columns.index(c)]
                            row_dict[c] = val
                        row_dicts.append(row_dict)

                    conn.execute(text(insert_sql), row_dicts)
                    inserted += len(batch)

                if has_identity:
                    conn.execute(text("SET IDENTITY_INSERT [" + mssql_table + "] OFF"))

            print("  " + sqlite_table + " -> " + mssql_table + ": " + str(inserted) + " rows migrated")
            total_rows += inserted

        except Exception as e:
            # Make sure IDENTITY_INSERT is turned off even on error
            if has_identity:
                try:
                    with mssql_engine.begin() as conn:
                        conn.execute(text("SET IDENTITY_INSERT [" + mssql_table + "] OFF"))
                except Exception:
                    pass
            error_msg = sqlite_table + " -> " + mssql_table + ": ERROR - " + str(e)[:200]
            print("  " + error_msg)
            errors.append(error_msg)

    sqlite_conn.close()

    # --- RE-ENABLE ALL FOREIGN KEY CONSTRAINTS ---
    print("\nRe-enabling foreign key constraints...")
    with mssql_engine.begin() as conn:
        for tbl in mssql_tables:
            if tbl.startswith("PRM_"):
                try:
                    conn.execute(text(f"ALTER TABLE [{tbl}] WITH CHECK CHECK CONSTRAINT ALL"))
                except Exception as e:
                    print(f"  WARNING: Could not re-enable constraints on {tbl}: {str(e)[:100]}")
    print("FK constraints re-enabled.\n")

    print("=" * 60)
    print("Migration complete! Total rows migrated: " + str(total_rows))
    if errors:
        print("\nErrors (" + str(len(errors)) + "):")
        for e in errors:
            print("  " + e)
    else:
        print("No errors!")


if __name__ == "__main__":
    migrate()
