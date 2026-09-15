"""Same xorshift32 course generator as assets/course.js (cross-runtime tested)."""
from .config import difficulty


def course(seed, level):
    state = ((seed + level * 2654435761) & 0xFFFFFFFF) or 1

    def rand():
        nonlocal state
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        state &= 0xFFFFFFFF
        return state / 4294967296

    cfg = difficulty(level)
    groups = []
    for i in range(cfg["groups"]):
        lane = int(rand() * 3)
        kind = ["cone", "barrier", "oil"][int(rand() * 3)]
        if cfg["moving"] and rand() < 0.4:
            kind = "car" if rand() < 0.7 else "truck"
        second = (lane + 1) % 3 if cfg["double"] and rand() < 0.25 else None
        bonus = "star" if i % 3 == 1 else ("shield" if i % 8 == 5 else ("slow" if i % 8 == 7 else None))
        groups.append({"id": i, "lane": lane, "kind": kind, "second": second,
                       "bonus": bonus, "bonusLane": (lane + 2) % 3,
                       "balloon": i % 2 == 0, "balloonLane": (lane + 1) % 3,
                       "spawn": 1 + i * cfg["interval"]})
    return groups
