from .models import GameSession, Player
from .scoring import leaderboard_key


def top_players(session, limit=10):
    games = session.find(GameSession, status="finished")
    winners = {}
    for game in sorted(games, key=leaderboard_key):
        winners.setdefault(game.player_id, game)
    rows = []
    for rank, game in enumerate(winners.values(), 1):
        if rank > limit:
            break
        player = session.get(Player, game.player_id)
        rows.append({"rank": rank, "player_id": player.id, "nickname": player.nickname,
                     "tag": player.player_tag, "score": game.final_score,
                     "level": game.max_level, "lives": game.lives_remaining})
    return rows


def statistics(session, player_id):
    games = session.find(GameSession, player_id=player_id, status="finished")
    correct = sum(g.correct_answers for g in games)
    wrong = sum(g.wrong_answers for g in games)
    return {"games": len(games), "best": max((g.final_score for g in games), default=0),
            "level": max((g.max_level for g in games), default=0),
            "stars": sum(g.stars_collected for g in games), "correct": correct, "wrong": wrong,
            "accuracy": round(100 * correct / (correct + wrong)) if correct + wrong else 0,
            "multiplayer": sum(g.mode == "multi" for g in games),
            "wins": sum(g.victory for g in games),
            "recent": [g.final_score for g in sorted(games, key=lambda g: g.ended_at)[-12:]]}
