from types import SimpleNamespace

from brain_racer.leaderboard import statistics, top_players
from brain_racer.models import GameSession, Player


class FakeSession:
    def __init__(self, games, players):
        self.games = games
        self.players = players

    def find(self, model, **filters):
        assert model is GameSession
        rows = self.games
        for key, value in filters.items():
            rows = [row for row in rows if getattr(row, key) == value]
        return rows

    def get(self, model, key):
        assert model is Player
        return self.players.get(key)


def game(player_id="p1", **values):
    defaults = dict(player_id=player_id, status="finished", mode="single", final_score=None,
                    max_level=None, lives_remaining=None, duration_ms=None, ended_at=None,
                    correct_answers=None, wrong_answers=None, stars_collected=None,
                    victory=None, id=None)
    defaults.update(values)
    return SimpleNamespace(**defaults)


def test_top_players_tolerates_partial_games_and_missing_players():
    session = FakeSession(
        [game("missing", final_score=50), game("p1"), game("p2", final_score=10, max_level=2)],
        {"p1": SimpleNamespace(id="p1", nickname="Irene", player_tag="AAAA"),
         "p2": SimpleNamespace(id="p2", nickname="Daniele", player_tag="BBBB")},
    )

    assert top_players(session) == [
        {"rank": 1, "player_id": "p2", "nickname": "Daniele", "tag": "BBBB",
         "score": 10, "level": 2, "lives": 0},
        {"rank": 2, "player_id": "p1", "nickname": "Irene", "tag": "AAAA",
         "score": 0, "level": 0, "lives": 0},
    ]


def test_statistics_tolerates_partial_finished_games():
    session = FakeSession([game(final_score=None, max_level=None, correct_answers=None,
                                wrong_answers=None, stars_collected=None, ended_at=None),
                           game(final_score=12, max_level=3, correct_answers=2,
                                wrong_answers=1, stars_collected=4, ended_at=10,
                                victory=True)], {})

    assert statistics(session, "p1") == {
        "games": 2, "best": 12, "level": 3, "stars": 4, "correct": 2, "wrong": 1,
        "accuracy": 67, "multiplayer": 0, "wins": 1, "recent": [0, 12],
    }
