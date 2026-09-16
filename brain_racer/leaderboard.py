from .models import GameSession, Player
from .scoring import leaderboard_key


def _number(value, default=0):
    return default if value is None else value


def top_players(session, limit=10):
    games = session.find(GameSession, status="finished")
    winners = {}
    for game in sorted(games, key=leaderboard_key):
        winners.setdefault(game.player_id, game)
    rows = []
    for game in winners.values():
        if len(rows) >= limit:
            break
        player = session.get(Player, game.player_id)
        if not player:
            continue
        rows.append({"rank": len(rows) + 1, "player_id": player.id, "nickname": player.nickname,
                     "tag": player.player_tag, "score": _number(game.final_score),
                     "level": _number(game.max_level), "lives": _number(game.lives_remaining)})
    return rows


def statistics(session, player_id):
    games = session.find(GameSession, player_id=player_id, status="finished")
    correct = sum(_number(g.correct_answers) for g in games)
    wrong = sum(_number(g.wrong_answers) for g in games)
    return {"games": len(games), "best": max((_number(g.final_score) for g in games), default=0),
            "level": max((_number(g.max_level) for g in games), default=0),
            "stars": sum(_number(g.stars_collected) for g in games), "correct": correct, "wrong": wrong,
            "accuracy": round(100 * correct / (correct + wrong)) if correct + wrong else 0,
            "multiplayer": sum(g.mode == "multi" for g in games),
            "wins": sum(bool(g.victory) for g in games),
            "recent": [_number(g.final_score) for g in sorted(games, key=lambda g: _number(g.ended_at))[-12:]]}
