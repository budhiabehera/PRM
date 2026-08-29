import os
from pathlib import Path
from sqlalchemy import create_engine, text, inspect, event
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
User:fxoneadmin

Password:hYL2nrnB1Ewvr4w8pHDh

DatabseName: FX_Sabre_Interface_Log
# Load .env file from the backend directory
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# DATABASE CONNECTION
# ---------------------------------------------------------------------------
# Supports: SQLite (default for local dev) or MS SQL Server (production).
#
# To use MS SQL Server, set the DATABASE_URL environment variable:
#   DATABASE_URL=mssql+pyodbc://username:password@server:1433/dbname?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes
#
# Or with Windows Authentication:
#   DATABASE_URL=mssql+pyodbc://server/dbname?driver=ODBC+Driver+18+for+SQL+Server&Trusted_Connection=yes
#
# Examples:
#   SQL Auth:  mssql+pyodbc://sa:MyPassword@localhost:1433/PRM_DB?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes
#   Azure SQL: mssql+pyodbc://admin:Pass@myserver.database.windows.net:1433/PRM_DB?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes
# ---------------------------------------------------------------------------

# Fallback to SQLite for local development if DATABASE_URL not set
IS_AZURE = bool(os.getenv("WEBSITE_SITE_NAME"))
if IS_AZURE:
    PERSISTENT_DIR = "/home/data"
    os.makedirs(PERSISTENT_DIR, exist_ok=True)
    DB_PATH = os.path.join(PERSISTENT_DIR, "resource_tracker.db")
else:
    DB_PATH = os.path.join(BASE_DIR, "resource_tracker.db")

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

# Determine DB type
IS_SQLITE = DATABASE_URL.startswith("sqlite")
IS_MSSQL = DATABASE_URL.startswith("mssql")

# Engine configuration
engine_kwargs = {}
if IS_SQLITE:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
elif IS_MSSQL:
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
# LIGHTWEIGHT MIGRATIONS (SQLite only)
# ---------------------------------------------------------------------------
# For MS SQL, use a proper migration tool (Alembic) or run SQL scripts manually.
# The tables will be auto-created by Base.metadata.create_all() on first startup.

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
                # MS SQL: create association tables if not exist
                if "user_projects" not in existing_tables:
                    conn.execute(text(
                        "CREATE TABLE user_projects ("
                        "  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                        "  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
                        "  PRIMARY KEY (user_id, project_id)"
                        ")"
                    ))
                if "developer_projects" not in existing_tables:
                    conn.execute(text(
                        "CREATE TABLE developer_projects ("
                        "  developer_id INT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,"
                        "  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
                        "  PRIMARY KEY (developer_id, project_id)"
                        ")"
                    ))

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

    except Exception as e:
        print(f"[MIGRATION WARNING] Lightweight migrations skipped: {e}")
