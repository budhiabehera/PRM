import os
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'resource_tracker.db')}")

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
]


def run_lightweight_migrations():
    if not DATABASE_URL.startswith("sqlite"):
        return  # only implemented for SQLite; other DBs should use a real migration tool (e.g. Alembic)
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    with engine.begin() as conn:
        for table, column, col_type in _NEW_COLUMNS:
            if table not in existing_tables:
                continue  # table doesn't exist yet — create_all() will make it with the column already
            existing_columns = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing_columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
