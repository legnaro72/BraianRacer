from concurrent.futures import ThreadPoolExecutor

import pytest

from brain_racer.config import COUNTDOWN_SECONDS, MATCH_LEVELS, QUIZ_SECONDS, REVEAL_SECONDS, RESULT_SECONDS
from brain_racer.game_service import RuleError
from brain_racer.models import GameSession, Room, RoomPlayer
from conftest import setup_room, heartbeat_all, finish_drive


def test_lobby_capacity_race_ready_and_host(svc):
    players = [svc.register(f"Pilota_{i}")[0] for i in range(9)]
    rid = svc.create_room(players[0])
    code = svc.snapshot(players[0], room_id=rid)["room"]["code"]
    assert svc.create_room(players[0]) == rid
    def join(pid):
        try: return svc.join_room(code, pid)
        except RuleError: return None
    with ThreadPoolExecutor(max_workers=8) as pool:
        joined = list(pool.map(join, players[1:]))
    assert sum(x == rid for x in joined) == 5
    room = svc.snapshot(players[0], room_id=rid)["room"]
    assert len(room["players"]) == 6
    with pytest.raises(RuleError): svc.start_room(rid, players[0])
    present = [p["player_id"] for p in room["players"]]
    other = next(p for p in present if p != players[0])
    with pytest.raises(RuleError): svc.start_room(rid, other)
    for pid in present: svc.ready(rid, pid)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda _: svc.start_room(rid, players[0]), range(3)))
    with svc.db.read() as s:
        assert len(svc._games(s, rid)) == 6
    assert svc.snapshot(players[0], room_id=rid)["room"]["phase"] == "COUNTDOWN"


@pytest.mark.parametrize("code", ["", "bad", "<script>", "000000", "ABCDEF"])
def test_bad_room_codes(svc, player, code):
    with pytest.raises(RuleError): svc.join_room(code, player)


def test_shared_course_questions_private_answers_and_automatic_next_round(svc):
    rid, players = setup_room(svc)
    snapshots = [svc.snapshot(p, room_id=rid) for p in players]
    assert snapshots[0]["game"]["seed"] == snapshots[1]["game"]["seed"]
    assert snapshots[0]["game"]["start_at"] == snapshots[1]["game"]["start_at"]
    svc.clock.advance(55)
    heartbeat_all(svc, rid, players)
    games = [snap["game"]["id"] for snap in snapshots]
    finish_drive(svc, players[0], games[0])
    first_finisher = svc.snapshot(players[0], room_id=rid)
    assert first_finisher["room"]["phase"] == "DRIVING"
    assert first_finisher["game"]["screen_phase"] == "QUIZ"
    finish_drive(svc, players[1], games[1])
    a, b = [svc.snapshot(p, room_id=rid) for p in players]
    assert a["room"]["phase"] == "QUIZ"
    assert a["game"]["question"] == b["game"]["question"]
    for index in range(3):
        quiz = svc.snapshot(players[0], room_id=rid)["game"]
        correct = svc.bank.by_id[quiz["question"]["id"]]["correct_index"]
        svc.answer(games[0], players[0], 1, index, correct)
        svc.answer(games[0], players[0], 1, index, (correct+1)%4)
        reveal = svc.snapshot(players[0], room_id=rid)["game"]
        assert reveal["screen_phase"] == "REVEAL" and reveal["answer"]["correct"]
        # The other player stays on the same private question and cannot see the answer.
        hidden = svc.snapshot(players[1], room_id=rid)["game"]
        assert hidden["qindex"] == index and hidden["screen_phase"] == "QUIZ"
        assert "correct_index" not in hidden["question"] and "answer" not in hidden
        svc.answer(games[1], players[1], 1, index, (correct+1)%4)
        # Both feedback panels are presented before their reveal timers begin.
        svc.snapshot(players[0], room_id=rid)
        svc.clock.advance(REVEAL_SECONDS)
        svc.snapshot(players[0], room_id=rid)
    results = svc.snapshot(players[0], room_id=rid)
    assert results["room"]["phase"] == "ROUND_RESULTS"
    assert results["game"]["score"] == 3
    assert svc.snapshot(players[1], room_id=rid)["game"]["score"] == -6
    svc.clock.advance(RESULT_SECONDS)
    next_round = svc.snapshot(players[0], room_id=rid)
    assert next_round["room"]["phase"] == "COUNTDOWN"
    assert next_round["game"]["level"] == 2


def test_dnf_loses_life_without_quiz_penalty(svc):
    rid, players = setup_room(svc, 3)
    first = svc.snapshot(players[0], room_id=rid)["game"]
    svc.clock.advance(55)
    heartbeat_all(svc, rid, players)
    finish_drive(svc, players[0], first["id"])
    svc.clock.advance(35)
    heartbeat_all(svc, rid, players)
    dnf = svc.snapshot(players[1], room_id=rid)["game"]
    assert dnf["lives"] == 2 and dnf["score"] == 0 and dnf["phase"] == "DNF"
    assert not dnf["eligible"]
    svc.answer(dnf["id"], players[1], 1, 0, 0)
    assert svc.snapshot(players[1], room_id=rid)["game"]["score"] == 0


def test_host_departure_transfer_and_reconnect(svc):
    host, _ = svc.register("Host")
    guest, _ = svc.register("Guest")
    rid = svc.create_room(host)
    code = svc.snapshot(host, room_id=rid)["room"]["code"]
    svc.join_room(code, guest)
    assert svc.resume(guest) == {"room_id": rid}
    svc.clock.advance(41)
    snap = svc.snapshot(guest, room_id=rid)
    assert snap["room"]["host"] == guest
    assert len(snap["room"]["players"]) == 1


def test_disconnect_grace_and_early_finish(svc):
    rid, players = setup_room(svc)
    svc.clock.advance(30)
    assert svc.snapshot(players[0], room_id=rid)["room"]["phase"] == "DRIVING"
    svc.clock.advance(11)
    snap = svc.snapshot(players[0], room_id=rid)
    assert snap["room"]["phase"] == "MATCH_RESULTS"
    assert svc.snapshot(players[0])["stats"]["wins"] == 1
    # Repeated phase ticks must not insert another result or award a second victory.
    for _ in range(3): svc.snapshot(players[0], room_id=rid)
    assert svc.snapshot(players[0])["stats"]["games"] == 1


def test_complete_five_round_match_persists_podium(svc):
    rid, players = setup_room(svc)
    games = [svc.snapshot(p, room_id=rid)["game"]["id"] for p in players]
    for level in range(1, MATCH_LEVELS + 1):
        svc.clock.advance(65)
        heartbeat_all(svc, rid, players)
        for p, gid in zip(players, games): finish_drive(svc, p, gid, level)
        for index in range(3):
            snap = svc.snapshot(players[0], room_id=rid)
            q = snap["game"]["question"]
            correct = svc.bank.by_id[q["id"]]["correct_index"]
            for p, gid in zip(players, games): svc.answer(gid, p, level, index, correct)
            svc.snapshot(players[0], room_id=rid)
            svc.clock.advance(REVEAL_SECONDS)
            svc.snapshot(players[0], room_id=rid)
        svc.clock.advance(RESULT_SECONDS)
        svc.snapshot(players[0], room_id=rid)
    final = [svc.snapshot(p, room_id=rid) for p in players]
    assert all(snap["room"]["phase"] == "MATCH_RESULTS" for snap in final)
    # Presence changes as each client reads; the persisted podium must agree.
    ranking = lambda snap: [(p["player_id"], p["score"], p["lives"], p["finished_levels"])
                            for p in snap["room"]["players"]]
    assert ranking(final[0]) == ranking(final[1])
    assert all(snap["game"]["score"] == 15 for snap in final)
    assert sum(svc.snapshot(p)["stats"]["wins"] for p in players) == 1


def test_room_snapshot_normalizes_partial_legacy_atlas_records(svc):
    rid, players = setup_room(svc)
    with svc.db.transaction() as session:
        room = session.get(Room, rid)
        room.state = {**room.state, "level": None, "qindex": None, "questions": None,
                      "answers": None, "start_at": None, "deadline": None}
        game = svc._games(session, rid)[0]
        game.state = {**game.state, "level": None, "score": None,
                      "collected": None, "phase": None}
    fast = svc.snapshot(players[0], room_id=rid, compact=True, read_only=True)
    assert fast["room"]["level"] == 1 and fast["room"]["qindex"] == 0
    assert isinstance(fast["room"]["players"], list)
    normal = svc.snapshot(players[0], room_id=rid, compact=True)
    assert normal["room"]["phase"] in ("COUNTDOWN", "DRIVING")
