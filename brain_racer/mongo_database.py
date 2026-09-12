"""Atlas unit of work with native multi-document transactions.

The game service shares model field definitions with SQLAlchemy, but MongoDB
stores independent documents. No SQL, local SQLite mirror, or whole-db blob is
used on Atlas. The coordination write serializes short game mutations across
workers. Transient acquisition conflicts retry before yielding any user work.
"""
import json
import logging
import re
import time
from contextlib import contextmanager
from copy import deepcopy

import certifi
from pymongo import ASCENDING, MongoClient
from pymongo.errors import OperationFailure, PyMongoError
from pymongo.read_concern import ReadConcern
from pymongo.server_api import ServerApi
from pymongo.write_concern import WriteConcern

from .models import Base

log = logging.getLogger(__name__)


def fields(model):
    return list(model.__table__.columns)


def serialize(obj):
    return {column.name: deepcopy(getattr(obj, column.name)) for column in fields(type(obj))}


def key_for(model, identity):
    values = tuple(identity) if isinstance(identity, (tuple, list)) else (identity,)
    if len(values) != len(model.__table__.primary_key.columns):
        raise ValueError("Invalid document key")
    return str(values[0]) if len(values) == 1 else json.dumps(values, separators=(",", ":"))


class MongoUnitOfWork:
    def __init__(self, database, session=None, writable=False):
        self.database, self.session, self.writable = database, session, writable
        self.tracked, self.deleted, self.query_cache = {}, set(), {}

    def _options(self):
        return {"session": self.session} if self.session is not None else {}

    def _collection(self, model):
        return self.database[model.__tablename__]

    def _load(self, model, doc):
        if doc is None:
            return None
        key = (model, doc["_id"])
        if key in self.deleted:
            return None
        if key in self.tracked:
            return self.tracked[key][0]
        values = {c.name: doc.get(c.name) for c in fields(model)}
        obj = model(**values)
        self.tracked[key] = (obj, deepcopy(values))
        return obj

    def get(self, model, identity):
        key = (model, key_for(model, identity))
        if key in self.deleted:
            return None
        if key in self.tracked:
            return self.tracked[key][0]
        return self._load(model, self._collection(model).find_one({"_id": key[1]}, **self._options()))

    def find(self, model, *, order_by=(), **filters):
        self.flush()
        cache_key = (model, tuple(sorted(filters.items())), tuple(order_by))
        if cache_key not in self.query_cache:
            cursor = self._collection(model).find(filters, **self._options())
            if order_by:
                cursor = cursor.sort([(f[1:], -1) if f.startswith("-") else (f, 1) for f in order_by])
            self.query_cache[cache_key] = [self._load(model, doc) for doc in cursor]
        return [obj for obj in self.query_cache[cache_key] if obj is not None]

    def first(self, model, *, order_by=(), **filters):
        rows = self.find(model, order_by=order_by, **filters)
        return rows[0] if rows else None

    def add(self, obj):
        if not self.writable:
            raise RuntimeError("Read-only unit of work")
        for column in fields(type(obj)):
            if getattr(obj, column.name) is None and column.default is not None:
                default = column.default
                value = default.arg(None) if default.is_callable else deepcopy(default.arg)
                setattr(obj, column.name, value)
        identity = [getattr(obj, c.name) for c in type(obj).__table__.primary_key.columns]
        key = (type(obj), key_for(type(obj), identity))
        self.tracked[key] = (obj, None)
        self.query_cache.clear()

    def delete(self, obj):
        if not self.writable:
            raise RuntimeError("Read-only unit of work")
        identity = [getattr(obj, c.name) for c in type(obj).__table__.primary_key.columns]
        self.deleted.add((type(obj), key_for(type(obj), identity)))
        self.query_cache.clear()

    def flush(self):
        if not self.writable:
            return
        changed = False
        for key in list(self.deleted):
            self._collection(key[0]).delete_one({"_id": key[1]}, **self._options())
            self.tracked.pop(key, None)
            self.deleted.remove(key)
            changed = True
        for key, (obj, before) in list(self.tracked.items()):
            after = serialize(obj)
            if before != after:
                doc = {"_id": key[1], **after}
                if before is None:
                    self._collection(key[0]).insert_one(doc, **self._options())
                else:
                    self._collection(key[0]).replace_one({"_id": key[1]}, doc, **self._options())
                self.tracked[key] = (obj, deepcopy(after))
                changed = True
        if changed:
            self.query_cache.clear()


class MongoDatabase:
    def __init__(self, uri, database_name="brain_racer"):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,63}", database_name):
            raise ValueError("Nome database MongoDB non valido.")
        self.client = MongoClient(uri, server_api=ServerApi("1"), tlsCAFile=certifi.where(),
                                  serverSelectionTimeoutMS=10000, connectTimeoutMS=10000,
                                  socketTimeoutMS=20000, maxPoolSize=20)
        self.client.admin.command("ping")
        self.database = self.client[database_name]
        # Explicit creation keeps transactions compatible with older replica sets.
        existing = set(self.database.list_collection_names())
        for name in Base.metadata.tables:
            if name not in existing:
                try:
                    self.database.create_collection(name)
                except OperationFailure as exc:
                    if exc.code != 48:  # NamespaceExists during another worker's startup.
                        raise
        self.database.coordination.update_one({"_id": "1"}, {"$setOnInsert": {"version": 0}}, upsert=True)
        indexes = {
            "players": [("token_hash", True)], "rooms": [("room_code", True), ("status", False)],
            "game_sessions": [("player_id", False), ("room_id", False), ("status", False)],
            "room_players": [("player_id", False), ("room_id", False)],
        }
        for collection, keys in indexes.items():
            for field, unique in keys:
                self.database[collection].create_index([(field, ASCENDING)], unique=unique)
        log.info("Database connected (MongoDB Atlas, dedicated Brain Racer database)")

    @contextmanager
    def transaction(self):
        with self.client.start_session() as session:
            deadline = time.monotonic() + 20
            while True:
                session.start_transaction(read_concern=ReadConcern("snapshot"),
                                          write_concern=WriteConcern("majority"))
                try:
                    self.database.coordination.update_one({"_id": "1"}, {"$inc": {"version": 1}},
                                                          session=session)
                    break
                except PyMongoError as exc:
                    session.abort_transaction()
                    if not exc.has_error_label("TransientTransactionError") or time.monotonic() >= deadline:
                        raise
                    time.sleep(.025)
            unit = MongoUnitOfWork(self.database, session, writable=True)
            try:
                yield unit
                unit.flush()
                while True:
                    try:
                        session.commit_transaction()
                        break
                    except PyMongoError as exc:
                        if not exc.has_error_label("UnknownTransactionCommitResult") or time.monotonic() >= deadline:
                            raise
            except Exception:
                if session.in_transaction:
                    session.abort_transaction()
                raise

    @contextmanager
    def read(self):
        yield MongoUnitOfWork(self.database)

    def close(self):
        self.client.close()
