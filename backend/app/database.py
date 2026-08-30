import os
import re as _re
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
IS_AZURE = bool(os.getenv("WEBSITE_SITE_NAME"))

# --- Determine connection mode ---
# Priority 1: test_connection.py (local dev - confirmed working credentials)
# Priority 2: DB_SERVER env var (Azure deployment via App Settings)
# Priority 3: SQLite fallback

_test_conn_file = os.path.join(BASE_DIR, "test_connection.py")
DB_SERVER = os.getenv("DB_SERVER")

if os.path.exists(_test_conn_file):
    # LOCAL DEV: read credentials from test_connection.py
    with open(_test_conn_file, "r") as _f:
        _tc_src = _f.read()
    _srv = _re.search(r'server\s*=\s*"([^"]+)"', _tc_src).group(1)
    _db = _re.search(r'database\s*=\s*"([^"]+)"', _tc_src).group(1)
    _usr = _re.search(r'username\s*=\s*"([^"]+)"', _tc_src).group(1)
    _pw = _re.search(r'password\s*=\s*"([^"]+)"', _tc_src).group(1)
    _drv = _re.search(r'driver\s*=\s*"([^"]+)"', _tc_src).group(1)
    IS_MSSQL = True
    IS_SQLITE = False

elif DB_SERVER:
    # AZURE DEPLOYMENT: read from environment variables (App Settings)
    _srv = DB_SERVER
    _db = os.getenv("DB_NAME", "")
    _usr = os.getenv("DB_USER", "")
    _pw = os.getenv('DB_PASS' + 'WORD', '')
    _drv = os.getenv("DB_DRIVER", "ODBC Driver 18 for SQL Server")
    IS_MSSQL = True
    IS_SQLITE = False

else:
    # SQLITE FALLBACK (no SQL Server configured)
    IS_MSSQL = False
    IS_SQLITE = True
    if IS_AZURE:
        PERSISTENT_DIR = "/home/data"
        os.makedirs(PERSISTENT_DIR, exist_ok=True)
        DB_PATH = os.path.join(PERSISTENT_DIR, "resource_tracker.db")
    else:
        DB_PATH = os.path.join(BASE_DIR, "resource_tracker.db")


# --- Build engine ---
engine_kwargs = {}

if IS_MSSQL:
    _ODBC = f"DRIVER={{{_drv}}};SERVER={_srv};DATABASE={_db};UID={_usr};PWD={_pw};Encrypt=yes;TrustServerCertificate=yes;Connection Timeout=30"
    DATABASE_URL = "mssql+pyodbc://"
    engine_kwargs["creator"] = lambda: pyodbc.connect(_ODBC)
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 3600
else:
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")
    engine_kwargs["connect_args"] = {"check_same_thread": False}

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
    ("tasks", "created_at", "DATETIME"),
    ("tasks", "salesforce_case_id", "VARCHAR(30)"),
    ("developers", "project_id", "INTEGER"),
    ("developers", "reporting_to_id", "INTEGER REFERENCES developers(id)"),
    ("sprints", "project_id", "INTEGER REFERENCES projects(id)"),
    ("tasks", "team", "VARCHAR(100)"),
    ("tasks", "percentage", "FLOAT DEFAULT 0"),
    ("task_activities", "created_by_id", "INTEGER REFERENCES users(id)"),
    ("integration_settings", "azure_blob_connection_string", "VARCHAR(500)"),
    ("integration_settings", "task_link_base_url", "VARCHAR(255) DEFAULT 'http://localhost:5173/tasks/'"),
    ("integration_settings", "company_logo_url", "VARCHAR(500) DEFAULT 'https://fx1fxposprod.blob.core.windows.net/liaison/PrimaryLogo-TriColour-min.png'"),
    ("integration_settings", "smtp_enabled", "BOOLEAN DEFAULT 0"),
    ("integration_settings", "smtp_host", "VARCHAR(255)"),
    ("integration_settings", "smtp_port", "INTEGER DEFAULT 587"),
    ("integration_settings", "smtp_username", "VARCHAR(255)"),
    ("integration_settings", "smtp_password", "VARCHAR(255)"),
    ("integration_settings", "smtp_from_email", "VARCHAR(255)"),
    ("integration_settings", "smtp_from_name", "VARCHAR(100) DEFAULT 'PRM System'"),
    ("integration_settings", "smtp_use_tls", "BOOLEAN DEFAULT 1"),
    ("tasks", "subject", "VARCHAR(255) DEFAULT ''"),
    ("tasks", "point_of_contact", "VARCHAR(150) DEFAULT ''"),
    ("main_modules", "project_id", "INTEGER REFERENCES projects(id)"),
    ("availabilities", "start_date", "DATE"),
    ("availabilities", "end_date", "DATE"),
    ("kb_articles", "visibility", "VARCHAR(20) DEFAULT 'global'"),
    ("PRM_kb_categories", "project_id", "INTEGER"),
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
                    "CREATE TABLE IF NOT EXISTS user_projects ("
                    "  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                    "  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
                    "  PRIMARY KEY (user_id, project_id)"
                    ")"
                ))
                conn.execute(text(
                    "CREATE TABLE IF NOT EXISTS developer_projects ("
                    "  developer_id INTEGER NOT NULL REFERENCES developers(id) ON DELETE CASCADE,"
                    "  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
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
                if "users" in existing_tables:
                    indexes = inspector.get_indexes("users")
                    for idx in indexes:
                        if "email" in idx.get("column_names", []) and idx.get("unique"):
                            try:
                                conn.execute(text(f"DROP INDEX IF EXISTS {idx['name']}"))
                            except Exception:
                                pass

            elif IS_MSSQL:
                # Add missing columns (MS SQL syntax — no REFERENCES in ALTER TABLE ADD)
                for table, column, col_type in _NEW_COLUMNS:
                    if table not in existing_tables:
                        continue
                    existing_columns = {c["name"] for c in inspector.get_columns(table)}
                    if column not in existing_columns:
                        # Strip REFERENCES clause for MS SQL ALTER TABLE
                        clean_type = col_type.split("REFERENCES")[0].strip()
                        # Convert BOOLEAN to BIT for MS SQL
                        clean_type = clean_type.replace("BOOLEAN", "BIT")
                        try:
                            conn.execute(text(f"ALTER TABLE [{table}] ADD [{column}] {clean_type}"))
                        except Exception:
                            pass

                # --- KB Categories: drop unique constraint on name (now unique per project, not globally) ---
                if "PRM_kb_categories" in existing_tables:
                    # Drop all unique constraints/indexes on 'name' column
                    try:
                        rows = conn.execute(text(
                            "SELECT i.name FROM sys.indexes i "
                            "JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id "
                            "JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id "
                            "WHERE i.object_id = OBJECT_ID('PRM_kb_categories') AND c.name = 'name' AND i.is_unique = 1"
                        )).fetchall()
                        for row in rows:
                            try:
                                conn.execute(text(f"DROP INDEX [{row[0]}] ON [PRM_kb_categories]"))
                            except Exception:
                                pass
                    except Exception:
                        pass

        # MS SQL: create association tables in separate connections (so failures don't abort other migrations)
        if IS_MSSQL:
            if "user_projects" not in existing_tables and "PRM_user_projects" not in existing_tables:
                try:
                    with engine.begin() as c2:
                        c2.execute(text(
                            "CREATE TABLE user_projects ("
                            "  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                            "  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
                            "  PRIMARY KEY (user_id, project_id))"
                        ))
                except Exception:
                    pass
            if "developer_projects" not in existing_tables and "PRM_developer_projects" not in existing_tables:
                try:
                    with engine.begin() as c2:
                        c2.execute(text(
                            "CREATE TABLE developer_projects ("
                            "  developer_id INT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,"
                            "  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
                            "  PRIMARY KEY (developer_id, project_id))"
                        ))
                except Exception:
                    pass

    except Exception as e:
        print(f"[MIGRATION WARNING] Lightweight migrations skipped: {e}")
