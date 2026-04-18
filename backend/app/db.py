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


def get_session():
    with Session(engine) as session:
        yield session
