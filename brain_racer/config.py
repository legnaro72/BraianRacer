from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STARTING_LIVES = 3
MAX_LIVES = 5
QUESTIONS_PER_LEVEL = 3
QUIZ_SECONDS = 15
REVEAL_SECONDS = 0.45
RESULT_SECONDS = 4
MAX_PLAYERS = 6
MATCH_LEVELS = 5
DISCONNECT_SECONDS = 40
COUNTDOWN_SECONDS = 2
MAX_ACCELERATION = 1.6


def difficulty(level: int) -> dict:
    """Bounded curve: later levels remain physically playable."""
    level = max(1, level)
    return {
        "groups": min(20 + (level - 1) * 2, 36),
        "speed": min(0.34 + (level - 1) * 0.018, 0.55),
        "interval": max(1.2, 1.85 - (level - 1) * 0.045),
        "roadWidth": max(0.66, 0.84 - max(0, level - 3) * 0.018),
        "moving": level >= 3,
        "double": level >= 5,
        "deadline": 85,
        "maxAcceleration": MAX_ACCELERATION,
    }
