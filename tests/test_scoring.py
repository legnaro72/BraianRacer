from types import SimpleNamespace

import pytest

from brain_racer.scoring import leaderboard_key, lose_life, quiz_delta, star_delta, winner_key


@pytest.mark.parametrize("correct,expected", [(True, 1), (False, -2), (None, -2)])
def test_quiz_delta(correct, expected):
    assert quiz_delta(correct) == expected


def test_star_and_life_floor():
    assert star_delta() == 1
    assert lose_life(3) == 2
    assert lose_life(0) == 0


def test_winner_tie_breaks():
    base = dict(score=10, lives=2, finished_levels=3, driving_ms=15000, player_id="z")
    better = [{**base, "score": 11}, {**base, "lives": 3},
              {**base, "finished_levels": 4}, {**base, "driving_ms": 14000}, {**base, "player_id": "a"}]
    for candidate in better:
        assert winner_key(candidate) < winner_key(base)


def test_ranking_keys_tolerate_partial_records():
    game = SimpleNamespace(final_score=None, max_level=None, lives_remaining=None,
                           duration_ms=None, ended_at=None, id=None)
    assert leaderboard_key(game) == (0, 0, 0, 0, 0, "")
    assert winner_key({"player_id": None}) == (0, 0, 0, 0, "")
