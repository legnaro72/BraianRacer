from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import select

from brain_racer.database import Database
from brain_racer.game_service import RuleError
from brain_racer.models import GameSession, Player
from conftest import event


def test_identity_persistence_duplicates_and_validation(svc):
    first, token = svc.register("  Mario  ")
    second, _ = svc.register("Mario")
    assert first != second
    assert svc.identify(token) == first
    assert svc.identify("bad") is None
    for nickname in ("", "ab", "a" * 17, "<script>", "Mario Rossi"):
        with pytest.raises(RuleError): svc.register(nickname)
    with svc.db.read() as s:
        p = s.get(Player, first)
        assert p.nickname == "Mario" and p.token_hash != token


def test_safe_initialization_does_not_destroy_data(svc, player):
    db = Database(str(svc.db.engine.url))
    with db.read() as s:
        assert s.get(Player, player)
    db.engine.dispose()


def test_unique_saved_result_and_negative_record(svc, player):
    gid = svc.new_game(player)
    with svc.db.transaction() as s:
        g = s.get(GameSession, gid)
        g.state = {**g.state, "score": -6}
    svc.abort(gid, player)
    svc.abort(gid, player)
    snap = svc.snapshot(player, game_id=gid)
    assert snap["stats"]["games"] == 1
    assert snap["stats"]["best"] == -6
    assert snap["leaderboard"][0]["score"] == -6
    new_id = svc.new_game(player)
    assert new_id != gid
    assert svc.snapshot(player, game_id=new_id)["game"]["score"] == 0


def test_ownership_enforced(svc, player):
    gid = svc.new_game(player)
    stranger, _ = svc.register("Estraneo")
    with pytest.raises(RuleError): svc.abort(gid, stranger)


def test_parallel_new_game_is_idempotent(svc, player):
    with ThreadPoolExecutor(max_workers=6) as pool:
        ids = list(pool.map(lambda _: svc.new_game(player), range(12)))
    assert len(set(ids)) == 1


def test_leaderboard_order_distinct_players_limit(svc):
    def finish(pid, score, level, lives, duration):
        gid = svc.new_game(pid)
        with svc.db.transaction() as s:
            g = s.get(GameSession, gid)
            g.state = {**g.state, "score": score, "level": level, "lives": lives}
            g.started_at = svc.clock() - duration
        svc.abort(gid, pid)
    players = [svc.register(f"Player_{i}")[0] for i in range(13)]
    entries = [(10, 1, 1, 50), (10, 2, 1, 50), (10, 2, 2, 50), (10, 2, 2, 40)]
    for i, pid in enumerate(players):
        finish(pid, *(entries[i] if i < 4 else (0, 1, 1, 50)))
    finish(players[3], 9, 1, 1, 20)
    board = svc.snapshot(players[0])["leaderboard"]
    assert len(board) == 10
    assert [p["player_id"] for p in board[:4]] == list(reversed(players[:4]))
    assert len({p["player_id"] for p in board}) == 10


def test_rollback_then_recovery(svc, player):
    with pytest.raises(RuntimeError):
        with svc.db.transaction() as s:
            s.get(Player, player).nickname = "Corrotto"
            raise RuntimeError("simulated database failure")
    assert svc.snapshot(player)["player"]["nickname"] == "Pilota_1"
