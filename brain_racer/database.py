"""All mutations use one short serializable unit of work, across processes too."""
import logging
from contextlib import contextmanager

from sqlalchemy import create_engine, event, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import Base, Coordination
from .repository import SQLUnitOfWork

log = logging.getLogger(__name__)


class Database:
    def __init__(self, url: str):
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        self.sqlite = url.startswith("sqlite")
        self.engine = create_engine(
            url, pool_pre_ping=True,
            connect_args={"check_same_thread": False, "timeout": 20} if self.sqlite else {},
        )
        if self.sqlite:
            @event.listens_for(self.engine, "connect")
            def configure(connection, _):
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute("PRAGMA busy_timeout=20000")
        Base.metadata.create_all(self.engine)
        if self.sqlite:
            columns = {column["name"] for column in inspect(self.engine).get_columns("event_photos")}
            if "flipbook_order" not in columns:
                with self.engine.begin() as connection:
                    connection.execute(text("ALTER TABLE event_photos ADD COLUMN flipbook_order INTEGER"))
            if "flipbook_locked" not in columns:
                with self.engine.begin() as connection:
                    connection.execute(text("ALTER TABLE event_photos ADD COLUMN flipbook_locked BOOLEAN DEFAULT 0"))
        try:
            with Session(self.engine) as session, session.begin():
                if session.get(Coordination, 1) is None:
                    session.add(Coordination(id=1))
        except IntegrityError:
            pass  # Another worker initialized the same singleton.
        log.info("Database connected (%s)", self.engine.dialect.name)

    @contextmanager
    def transaction(self):
        with Session(self.engine, expire_on_commit=False) as session:
            try:
                if self.sqlite:
                    session.execute(text("BEGIN IMMEDIATE"))
                else:
                    session.execute(select(Coordination).where(Coordination.id == 1).with_for_update())
                yield SQLUnitOfWork(session)
                session.commit()
            except Exception:
                session.rollback()
                raise

    @contextmanager
    def read(self):
        with Session(self.engine, expire_on_commit=False) as session:
            yield SQLUnitOfWork(session)


def open_database(url=None, mongo_uri=None, mongo_database="brain_racer"):
    if mongo_uri:
        from .mongo_database import MongoDatabase
        return MongoDatabase(mongo_uri, mongo_database)
    if url and url.startswith(("mongodb://", "mongodb+srv://")):
        from .mongo_database import MongoDatabase
        return MongoDatabase(url, mongo_database)
    from .config import ROOT
    return Database(url or f"sqlite:///{(ROOT / 'brain_racer.db').as_posix()}")
