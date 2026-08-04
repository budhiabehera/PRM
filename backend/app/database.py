import os
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Use /home directory on Azure (persistent across deploys) or local fallback.
# Azure App Service Linux has /home as persistent mounted storage.
AZURE_HOME = os.getenv("HOME", "")
if AZURE_HOME and os.path.isdir(AZURE_HOME) and AZURE_HOME.startswith("/home"):
    DB_PATH = os.path.join(AZURE_HOME, "resource_tracker.db")
else:
    # Local development / Windows
    DB_PATH = os.path.join(BASE_DIR, "resource_tracker.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the initial release. SQLAlchemy's `Base.metadata.create_all()`
# only creates missing *tables*, not missing *columns* on tables that already
# exist — so anyone with a database from before a given feature needs these
# added by hand. This runs harmlessly every startup (skips columns that already
# exist) so existing local databases pick up new columns without deleting data.
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
]


def run_lightweight_migrations():
    if not DATABASE_URL.startswith("sqlite"):
        return  # only implemented for SQLite; other DBs should use a real migration tool (e.g. Alembic)
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    with engine.begin() as conn:
        # Create the user_projects association table if it doesn't exist
        if "user_projects" not in existing_tables:
            conn.execute(text(
                "CREATE TABLE user_projects ("
                "  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                "  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
                "  PRIMARY KEY (user_id, project_id)"
                ")"
            ))
        if "developer_projects" not in existing_tables:
            conn.execute(text(
                "CREATE TABLE developer_projects ("
                "  developer_id INTEGER NOT NULL REFERENCES developers(id) ON DELETE CASCADE,"
                "  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
                "  PRIMARY KEY (developer_id, project_id)"
                ")"
            ))
        for table, column, col_type in _NEW_COLUMNS:
            if table not in existing_tables:
                continue  # table doesn't exist yet — create_all() will make it with the column already
            existing_columns = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing_columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))

        # Remove UNIQUE constraint from users.email (if it exists)
        if "users" in existing_tables:
            # Check if email has a unique index
            indexes = inspector.get_indexes("users")
            unique_cols = inspector.get_unique_constraints("users")
            # SQLite: recreate table without the unique constraint on email
            cols = inspector.get_columns("users")
            col_names = [c["name"] for c in cols]
            if "email" in col_names:
                # Drop and recreate the unique index if it exists
                for idx in indexes:
                    if "email" in idx.get("column_names", []) and idx.get("unique"):
                        conn.execute(text(f"DROP INDEX IF EXISTS {idx['name']}"))
                        print(f"[MIGRATION] Dropped unique index on users.email: {idx['name']}")
