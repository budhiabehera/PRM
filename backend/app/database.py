import os
from pathlib import Path
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import pyodbc

# Load .env file from the backend directory
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# DATABASE CONNECTION
# ---------------------------------------------------------------------------
# Supports: SQLite (default for local dev) or MS SQL Server (production).
# To use MS SQL Server, set DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD in .env
# ---------------------------------------------------------------------------

# Fallback to SQLite for local development if DB_SERVER not set
IS_AZURE = bool(os.getenv("WEBSITE_SITE_NAME"))
if IS_AZURE:
    PERSISTENT_DIR = "/home/data"
    os.makedirs(PERSISTENT_DIR, exist_ok=True)
    DB_PATH = os.path.join(PERSISTENT_DIR, "resource_tracker.db")
else:
    DB_PATH = os.path.join(BASE_DIR, "resource_tracker.db")

# Check if MS SQL is configured
# Check if MS SQL is configured
DB_SERVER = os.getenv("DB_SERVER")
if DB_SERVER:
    # MS SQL Server mode - read credentials from test_connection.py (confirmed working)
    import re as _re
    _test_conn_file = os.path.join(BASE_DIR, "test_connection.py")
    if os.path.exists(_test_conn_file):
        with open(_test_conn_file, "r") as _f:
            _tc_src = _f.read()
        _DB_DRIVER = _re.search(r'driver\s*=\s*"([^"]+)"', _tc_src).group(1)
        DB_SERVER = _re.search(r'server\s*=\s*"([^"]+)"', _tc_src).group(1)
        _DB_NAME = _re.search(r'database\s*=\s*"([^"]+)"', _tc_src).group(1)
        _DB_USER = _re.search(r'username\s*=\s*"([^"]+)"', _tc_src).group(1)
        _DB_PASS = _re.search(r'password\s*=\s*"([^"]+)"', _tc_src).group(1)
    else:
        # Fallback to env vars (for Azure deployment)
        _DB_DRIVER = os.getenv("DB_DRIVER", "ODBC Driver 18 for SQL Server")
        _DB_NAME = os.getenv("DB_NAME", "")
        _DB_USER = os.getenv("DB_USER", "")
        _DB_PASS = os.getenv("DB_PASSWORD", "")
    _ODBC_CONN_STR = (
        f"DRIVER={{{_DB_DRIVER}}};"
        f"SERVER={DB_SERVER};"
        f"DATABASE={_DB_NAME};"
        f"UID={_DB_USER};"
        f"PWD={_DB_PASS};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=yes;"
        f"Connection Timeout=30"
    )
    DATABASE_URL = "mssql+pyodbc://"
    IS_MSSQL = True
    IS_SQLITE = False
else:
    # SQLite fallback (local development)
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")
    IS_MSSQL = False
    IS_SQLITE = DATABASE_URL.startswith("sqlite")

# Engine configuration
engine_kwargs = {}
if IS_SQLITE:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
elif IS_MSSQL:
    engine_kwargs["creator"] = lambda: pyodbc.connect(_ODBC_CONN_STR)
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 3600

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# LIGHTWEIGHT MIGRATIONS
# ---------------------------------------------------------------------------
_NEW_COLUMNS = [
    ("PRM_tasks", "created_at", "DATETIME"),
    ("PRM_tasks", "salesforce_case_id", "VARCHAR(30)"),
    ("PRM_developers", "project_id", "INTEGER"),
    ("PRM_developers", "reporting_to_id", "INTEGER"),
    ("PRM_sprints", "project_id", "INTEGER"),
    ("PRM_tasks", "team", "VARCHAR(100)"),
    ("PRM_tasks", "percentage", "FLOAT DEFAULT 0"),
    ("PRM_task_activities", "created_by_id", "INTEGER"),
    ("PRM_integration_settings", "azure_blob_connection_string", "VARCHAR(500)"),
    ("PRM_integration_settings", "task_link_base_url", "VARCHAR(255)"),
    ("PRM_integration_settings", "company_logo_url", "VARCHAR(500)"),
    ("PRM_integration_settings", "smtp_enabled", "BIT DEFAULT 0"),
    ("PRM_integration_settings", "smtp_host", "VARCHAR(255)"),
    ("PRM_integration_settings", "smtp_port", "INTEGER DEFAULT 587"),
    ("PRM_integration_settings", "smtp_username", "VARCHAR(255)"),
    ("PRM_integration_settings", "smtp_password", "VARCHAR(255)"),
    ("PRM_integration_settings", "smtp_from_email", "VARCHAR(255)"),
    ("PRM_integration_settings", "smtp_from_name", "VARCHAR(100)"),
    ("PRM_integration_settings", "smtp_use_tls", "BIT DEFAULT 1"),
    ("PRM_tasks", "subject", "VARCHAR(255)"),
    ("PRM_tasks", "point_of_contact", "VARCHAR(150)"),
    ("PRM_main_modules", "project_id", "INTEGER"),
    ("PRM_availabilities", "start_date", "DATE"),
    ("PRM_availabilities", "end_date", "DATE"),
    ("PRM_kb_articles", "visibility", "VARCHAR(20)"),
]


def run_lightweight_migrations():
    """Run lightweight migrations for SQLite or MS SQL."""
    try:
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()

        with engine.begin() as conn:
            if IS_SQLITE:
                # SQLite-specific: create association tables
                conn.execute(text(
                    "CREATE TABLE IF NOT EXISTS PRM_user_projects ("
                    "  user_id INTEGER NOT NULL REFERENCES PRM_users(id) ON DELETE CASCADE,"
                    "  project_id INTEGER NOT NULL REFERENCES PRM_projects(id) ON DELETE CASCADE,"
                    "  PRIMARY KEY (user_id, project_id)"
                    ")"
                ))
                conn.execute(text(
                    "CREATE TABLE IF NOT EXISTS PRM_developer_projects ("
                    "  developer_id INTEGER NOT NULL REFERENCES PRM_developers(id) ON DELETE CASCADE,"
                    "  project_id INTEGER NOT NULL REFERENCES PRM_projects(id) ON DELETE CASCADE,"
                    "  PRIMARY KEY (developer_id, project_id)"
                    ")"
                ))

                # Add missing columns (SQLite syntax)
                for table, column, col_type in _NEW_COLUMNS:
                    if table not in existing_tables:
                        continue
                    existing_columns = {c["name"] for c in inspector.get_columns(table)}
                    if column not in existing_columns:
                        try:
                            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                        except Exception:
                            pass

                # Remove UNIQUE constraint from users.email (if it exists)
                if "PRM_users" in existing_tables:
                    indexes = inspector.get_indexes("PRM_users")
                    for idx in indexes:
                        if "email" in idx.get("column_names", []) and idx.get("unique"):
                            try:
                                conn.execute(text(f"DROP INDEX IF EXISTS {idx['name']}"))
                            except Exception:
                                pass

            elif IS_MSSQL:
                # MS SQL: create association tables if not exist
                if "PRM_user_projects" not in existing_tables:
                    conn.execute(text(
                        "CREATE TABLE PRM_user_projects ("
                        "  user_id INT NOT NULL REFERENCES PRM_users(id) ON DELETE CASCADE,"
                        "  project_id INT NOT NULL REFERENCES PRM_projects(id) ON DELETE CASCADE,"
                        "  PRIMARY KEY (user_id, project_id)"
                        ")"
                    ))
                if "PRM_developer_projects" not in existing_tables:
                    conn.execute(text(
                        "CREATE TABLE PRM_developer_projects ("
                        "  developer_id INT NOT NULL REFERENCES PRM_developers(id) ON DELETE CASCADE,"
                        "  project_id INT NOT NULL REFERENCES PRM_projects(id) ON DELETE CASCADE,"
                        "  PRIMARY KEY (developer_id, project_id)"
                        ")"
                    ))

                # Add missing columns (MS SQL syntax)
                for table, column, col_type in _NEW_COLUMNS:
                    if table not in existing_tables:
                        continue
                    existing_columns = {c["name"] for c in inspector.get_columns(table)}
                    if column not in existing_columns:
                        try:
                            conn.execute(text(f"ALTER TABLE [{table}] ADD [{column}] {col_type}"))
                        except Exception:
                            pass

    except Exception as e:
        print(f"[MIGRATION WARNING] Lightweight migrations skipped: {e}")
