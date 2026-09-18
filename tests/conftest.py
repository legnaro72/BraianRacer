import pytest

from brain_racer.database import Database
from brain_racer.game_service import GameService
from brain_racer.questions import QuestionBank


class Clock:
    def __init__(self):
        self.now = 2_000_000_000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


@pytest.fixture
def svc(tmp_path):
    db = Database(f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    service = GameService(db, QuestionBank(), Clock())
    yield service
    db.engine.dispose()


@pytest.fixture
def player(svc):
    return svc.register("Pilota_1")[0]


def event(kind, eid, **payload):
    return {"event_id": eid, "event_type": kind, "payload": payload}


def setup_room(svc, count=2):
    players = [svc.register(f"Pilota_{i}")[0] for i in range(count)]
    room = svc.create_room(players[0], independent=False)
    code = svc.snapshot(players[0], room_id=room)["room"]["code"]
    for p in players[1:]:
        svc.join_room(code, p)
    for p in players:
        svc.ready(room, p)
    svc.start_room(room, players[0])
    return room, players


def heartbeat_all(svc, room, players):
    # Keep every participant fresh before advancing the shared phase.
    from brain_racer.models import RoomPlayer
    with svc.db.transaction() as s:
        for p in players:
            s.get(RoomPlayer, (room, p)).last_seen_at = svc.clock()


def finish_drive(svc, pid, gid, level=1):
    from brain_racer.config import difficulty
    n = difficulty(level)["groups"]
    svc.events(gid, pid, level, [event("PROGRESS_UPDATE", f"progress-{level}", progress=n),
                                event("LEVEL_COMPLETED", f"finish-{level}")])
