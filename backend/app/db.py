import os

from sqlalchemy import inspect, text
from sqlmodel import SQLModel, Session, create_engine

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://promtdb:promtdb@localhost:5432/promtdb")

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)

    # Lightweight schema drift fix for MVP iterations.
    with engine.begin() as conn:
        inspector = inspect(conn)
        if "phrase" in inspector.get_table_names():
            cols = {c["name"] for c in inspector.get_columns("phrase")}
            if "required_lora" not in cols:
                conn.execute(text("ALTER TABLE phrase ADD COLUMN required_lora VARCHAR"))

        if "characterpreset" in inspector.get_table_names():
            cols = {c["name"] for c in inspector.get_columns("characterpreset")}
            if "version_family" not in cols:
                conn.execute(text("ALTER TABLE characterpreset ADD COLUMN version_family VARCHAR DEFAULT ''"))
            if "version" not in cols:
                conn.execute(text("ALTER TABLE characterpreset ADD COLUMN version INTEGER DEFAULT 1"))
            if "required_sdxl_base_model" not in cols:
                conn.execute(text("ALTER TABLE characterpreset ADD COLUMN required_sdxl_base_model VARCHAR"))
            if "recommended_sdxl_base_model" not in cols:
                conn.execute(text("ALTER TABLE characterpreset ADD COLUMN recommended_sdxl_base_model VARCHAR"))


def get_session():
    with Session(engine) as session:
        yield session
