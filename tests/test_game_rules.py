from concurrent.futures import ThreadPoolExecutor

from brain_racer.config import QUIZ_SECONDS, REVEAL_SECONDS
from brain_racer.models import GameSession
from conftest import event, finish_drive


def test_restart_finishes_previous_game_and_returns_a_clean_run(svc, player):
    old_id = svc.new_game(player)
    with svc.db.read() as session:
        old_started = session.get(GameSession, old_id).started_at
    svc.clock.advance(1)
    new_id = svc.restart_game(old_id, player)
    assert new_id != old_id
    with svc.db.read() as session:
        old = session.get(GameSession, old_id)
        new = session.get(GameSession, new_id)
        assert old.status == "finished" and old.ended_at >= old_started
        assert new.status == "active" and new.state["score"] == 0


def test_collisions_duplicate_shield_and_invulnerability(svc, player):
    gid = svc.new_game(player)
    svc.clock.advance(50)
    hit = event("COLLISION", "hit-one", group=1, at=5)
    svc.events(gid, player, 1, [hit, hit])
    svc.events(gid, player, 1, [hit, event("COLLISION", "other-id-same-object", group=1, at=7)])
    svc.events(gid, player, 1, [event("COLLISION", "invulnerable", group=2, at=5.5)])
    assert svc.snapshot(player, game_id=gid)["game"]["lives"] == 2
    svc.events(gid, player, 1, [event("BONUS_COLLECTED", "shield", group=5),
                                event("COLLISION", "shield-impact", group=6, at=16)])
    game = svc.snapshot(player, game_id=gid)["game"]
    assert game["lives"] == 2 and not game["shield"]


def test_star_and_spoofed_totals_rejected(svc, player):
    gid = svc.new_game(player)
    svc.events(gid, player, 1, [event("BONUS_COLLECTED", "too-soon", group=1),
                                event("PROGRESS_UPDATE", "warp", progress=20)])
    assert svc.snapshot(player, game_id=gid)["game"]["progress"] == 0
    svc.clock.advance(20)
    star = event("BONUS_COLLECTED", "star", group=1, score=999999)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: svc.events(gid, player, 1, [star]), range(8)))
    svc.events(gid, player, 1, [event("BONUS_COLLECTED", "new-id-same-star", group=1)])
    game = svc.snapshot(player, game_id=gid)["game"]
    assert game["score"] == 1 and game["stars"] == 1


def test_full_single_player_loop_and_timeout(svc, player):
    gid = svc.new_game(player)
    svc.clock.advance(55)
    finish_drive(svc, player, gid)
    quiz = svc.snapshot(player, game_id=gid)["game"]
    assert quiz["screen_phase"] == "QUIZ"
    assert "correct_index" not in quiz["question"]
    correct = svc.bank.by_id[quiz["question"]["id"]]["correct_index"]
    svc.answer(gid, player, 1, 0, correct)
    svc.answer(gid, player, 1, 0, (correct + 1) % 4)
    assert svc.snapshot(player, game_id=gid)["game"]["score"] == 1
    svc.clock.advance(REVEAL_SECONDS)
    second = svc.snapshot(player, game_id=gid)["game"]
    wrong = (svc.bank.by_id[second["question"]["id"]]["correct_index"] + 1) % 4
    svc.answer(gid, player, 1, 1, wrong)
    svc.clock.advance(REVEAL_SECONDS)
    svc.snapshot(player, game_id=gid)
    svc.clock.advance(QUIZ_SECONDS)
    timeout = svc.snapshot(player, game_id=gid)["game"]
    assert timeout["answer"]["choice"] is None and timeout["score"] == -3
    assert timeout["lives"] == 3
    svc.clock.advance(REVEAL_SECONDS)
    summary = svc.snapshot(player, game_id=gid)["game"]
    assert summary["screen_phase"] == "LEVEL_SUMMARY"
    assert (summary["round_correct"], summary["round_wrong"]) == (1, 2)
    svc.next_level(gid, player)
    next_game = svc.snapshot(player, game_id=gid)["game"]
    assert next_game["level"] == 2 and next_game["score"] == -3
    assert next_game["difficulty"]["speed"] > quiz["difficulty"]["speed"]


def test_elimination_saves_and_stale_events_do_nothing(svc, player):
    gid = svc.new_game(player)
    svc.clock.advance(40)
    for i in range(3):
        svc.events(gid, player, 1, [event("COLLISION", f"hit{i}", group=i, at=5+i*2)])
    snap = svc.snapshot(player, game_id=gid)
    assert snap["game"]["screen_phase"] == "GAME_OVER"
    assert snap["stats"]["games"] == 1
    svc.events(gid, player, 1, [event("BONUS_COLLECTED", "late", group=1)])
    assert svc.snapshot(player, game_id=gid)["game"]["score"] == 0


def test_refresh_resumes_persistent_state(svc, player):
    gid = svc.new_game(player)
    assert svc.resume(player) == {"game_id": gid}
    from brain_racer.game_service import GameService
    restored = GameService(svc.db, svc.bank, svc.clock)
    assert restored.snapshot(player, game_id=gid)["game"]["id"] == gid


def test_accelerated_finish_is_accepted_but_impossible_finish_is_not(svc, player):
    from brain_racer.config import difficulty
    from brain_racer.course import course
    gid = svc.new_game(player)
    game = svc.snapshot(player, game_id=gid)["game"]
    cfg = difficulty(1)
    minimum = (course(game["seed"], 1)[-1]["spawn"] + 1.25 / cfg["speed"]) / cfg["maxAcceleration"]
    svc.clock.advance(4 + minimum - 5)
    finish_drive(svc, player, gid)
    assert svc.snapshot(player, game_id=gid)["game"]["phase"] == "DRIVING"
    svc.clock.advance(6)
    finish_drive(svc, player, gid)
    assert svc.snapshot(player, game_id=gid)["game"]["phase"] == "QUIZ"


def test_immediate_start_and_replay_reset(svc, player):
    gid = svc.new_game(player)
    first = svc.snapshot(player, game_id=gid)["game"]
    assert first["start_at"] == svc.clock()
    svc.clock.advance(40)
    for i in range(3):
        svc.events(gid, player, 1, [event("COLLISION", f"death{i}", group=i, at=5+i*2)])
    assert svc.snapshot(player, game_id=gid)["game"]["screen_phase"] == "GAME_OVER"
    svc.abort(gid, player)
    replay = svc.new_game(player)
    assert replay != gid
    g = svc.snapshot(player, game_id=replay)["game"]
    assert g["start_at"] == svc.clock()
    assert g["lives"] == 3 and g["level"] == 1 and g["phase"] == "DRIVING"
    for field in ("score", "progress", "stars", "hearts", "correct", "wrong", "qindex", "driving_ms"):
        assert g[field] == 0
    for field in ("hit", "collected", "balloon_hit", "acks"):
        assert g[field] == []
    assert g["deadline"] is None and not g["shield"]
    svc.events(gid, player, 1, [event("COLLISION", "stale", group=4, at=15)])
    assert svc.snapshot(player, game_id=replay)["game"]["lives"] == 3


def test_early_answers_stop_deadline_and_advance_exactly_once(svc, player):
    gid = svc.new_game(player)
    svc.clock.advance(55)
    finish_drive(svc, player, gid)
    for index in range(3):
        q = svc.snapshot(player, game_id=gid)["game"]
        assert q["qindex"] == index and q["screen_phase"] == "QUIZ"
        old_deadline = q["deadline"]
        correct = svc.bank.by_id[q["question"]["id"]]["correct_index"]
        svc.clock.advance(.1)
        svc.answer(gid, player, 1, index, correct)
        reveal = svc.snapshot(player, game_id=gid)["game"]
        assert reveal["screen_phase"] == "REVEAL"
        assert reveal["deadline"] < old_deadline - 10
        assert reveal["deadline"] - svc.clock() < 1
        svc.answer(gid, player, 1, index, (correct+1)%4)
        svc.clock.advance(REVEAL_SECONDS)
        after = svc.snapshot(player, game_id=gid)["game"]
        svc.answer(gid, player, 1, index, correct)  # Delayed duplicate of previous question.
        again = svc.snapshot(player, game_id=gid)["game"]
        assert again["qindex"] == after["qindex"]
        assert again["score"] == index+1
    assert again["screen_phase"] == "LEVEL_SUMMARY"


def test_active_compact_snapshot_avoids_aggregate_queries(svc, player, monkeypatch):
    gid = svc.new_game(player)
    def unexpected(*args):
        raise AssertionError("Aggregate query during active game")
    with monkeypatch.context() as m:
        m.setattr("brain_racer.game_service.statistics", unexpected)
        m.setattr("brain_racer.game_service.top_players", unexpected)
        snapshot = svc.snapshot(player, game_id=gid, compact=True)
        assert "stats" not in snapshot and "leaderboard" not in snapshot
    svc.abort(gid, player)
    snapshot = svc.snapshot(player, game_id=gid, compact=True)
    assert snapshot["stats"]["games"] == 1 and "leaderboard" in snapshot
