def quiz_delta(correct: bool | None) -> int:
    return 1 if correct else -2


def star_delta() -> int:
    return 1


def lose_life(lives: int) -> int:
    return max(0, lives - 1)


def leaderboard_key(game):
    return (-( game.final_score or 0), -(game.max_level or 0), -(game.lives_remaining or 0),
            game.duration_ms or 0, game.ended_at or 0, game.id or "")


def winner_key(player):
    return (-player["score"], -player["lives"], -player["finished_levels"],
            player["driving_ms"], player["player_id"])
