import time
import uuid

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def uid():
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Coordination(Base):
    __tablename__ = "coordination"
    id: Mapped[int] = mapped_column(primary_key=True)


class Player(Base):
    __tablename__ = "players"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    nickname: Mapped[str] = mapped_column(String(16))
    player_tag: Mapped[str] = mapped_column(String(4))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    last_seen_at: Mapped[float] = mapped_column(Float, default=time.time)


class GameSession(Base):
    __tablename__ = "game_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    room_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    mode: Mapped[str] = mapped_column(String(16), default="single")
    started_at: Mapped[float] = mapped_column(Float, default=time.time)
    ended_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    final_score: Mapped[int] = mapped_column(Integer, default=0)
    max_level: Mapped[int] = mapped_column(Integer, default=1)
    lives_remaining: Mapped[int] = mapped_column(Integer, default=3)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    correct_answers: Mapped[int] = mapped_column(Integer, default=0)
    wrong_answers: Mapped[int] = mapped_column(Integer, default=0)
    stars_collected: Mapped[int] = mapped_column(Integer, default=0)
    victory: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    state: Mapped[dict] = mapped_column(JSON, default=dict)


class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    room_code: Mapped[str] = mapped_column(String(6), unique=True, index=True)
    host_player_id: Mapped[str] = mapped_column(ForeignKey("players.id"))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    status: Mapped[str] = mapped_column(String(20), default="LOBBY", index=True)
    state: Mapped[dict] = mapped_column(JSON, default=dict)


class RoomPlayer(Base):
    __tablename__ = "room_players"
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id"), primary_key=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), primary_key=True)
    joined_at: Mapped[float] = mapped_column(Float, default=time.time)
    last_seen_at: Mapped[float] = mapped_column(Float, default=time.time)
    ready: Mapped[bool] = mapped_column(Boolean, default=False)


class GameEvent(Base):
    __tablename__ = "game_events"
    game_id: Mapped[str] = mapped_column(ForeignKey("game_sessions.id"), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"
    game_id: Mapped[str] = mapped_column(ForeignKey("game_sessions.id"), primary_key=True)
    level: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    choice: Mapped[int | None] = mapped_column(Integer, nullable=True)
    correct: Mapped[bool] = mapped_column(Boolean)
    delta: Mapped[int] = mapped_column(Integer)


class Dedication(Base):
    __tablename__ = "dedications"
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), primary_key=True)
    message: Mapped[str] = mapped_column(String(800))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class EventPhoto(Base):
    """Metadata for an event image stored in the configured media provider.

    Image bytes deliberately stay out of Atlas/SQLite: that keeps game snapshots
    small while the configured media backend handles durable storage.
    """
    __tablename__ = "event_photos"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    storage_id: Mapped[str] = mapped_column(String(160), unique=True)
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    byte_size: Mapped[int] = mapped_column(Integer)
    uploaded_at: Mapped[float] = mapped_column(Float, default=time.time, index=True)
    approved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    approved_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    flipbook_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
