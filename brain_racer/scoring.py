def quiz_delta(correct: bool | None) -> int:
    return 1 if correct else -2


def star_delta() -> int:
    return 1


def lose_life(lives: int) -> int:
    return max(0, lives - 1)


def _number(value, default=0):
    return default if value is None else value


def leaderboard_key(game):
    return (-_number(game.final_score), -_number(game.max_level), -_number(game.lives_remaining),
            _number(game.duration_ms), _number(game.ended_at), game.id or "")


def winner_key(player):
    return (-_number(player.get("score")), -_number(player.get("lives")),
            -_number(player.get("finished_levels")), _number(player.get("driving_ms")),
            player.get("player_id") or "")
