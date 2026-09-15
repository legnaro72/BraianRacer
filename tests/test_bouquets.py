from conftest import event, finish_drive
from brain_racer.course import course


def shot(svc, player, gid, eid="heart", group=0, **changes):
    g = svc.snapshot(player, game_id=gid)["game"]
    target = course(g["seed"], 1)[group]
    payload = dict(group=group, shot_at=3.0, at=3.5, course_t=3.5,
                   aim=.5 + (target["balloonLane"] - 1) * g["difficulty"]["roadWidth"] / 3)
    payload.update(changes)
    return event("BALLOON_POPPED", eid, **payload)


def test_heart_scores_once_even_with_different_event_id_and_spoofed_total(svc, player):
    gid = svc.new_game(player)
    svc.clock.advance(12)
    hit = shot(svc, player, gid, score=99999)
    svc.events(gid, player, 1, [hit, hit, shot(svc, player, gid, eid="duplicate")])
    game = svc.snapshot(player, game_id=gid)["game"]
    assert (game["score"], game["hearts"], game["round_hearts"]) == (2, 1, 1)
    assert game["stars"] == 0


def test_invalid_heart_hits_cannot_award_points(svc, player):
    gid = svc.new_game(player)
    svc.clock.advance(12)
    for i, changes in enumerate([dict(group=1), dict(shot_at=4.5), dict(at=9999),
                                 dict(course_t=100), dict(aim=2), dict(aim=float("nan")),
                                 dict(group=True)]):
        svc.events(gid, player, 1, [shot(svc, player, gid, eid=f"bad-{i}", **changes)])
    assert svc.snapshot(player, game_id=gid)["game"]["score"] == 0


def test_heart_points_survive_finish_and_stale_round_cannot_add_points(svc, player):
    gid = svc.new_game(player)
    svc.clock.advance(12)
    svc.events(gid, player, 1, [shot(svc, player, gid)])
    svc.clock.advance(55)
    finish_drive(svc, player, gid)
    svc.events(gid, player, 1, [shot(svc, player, gid, eid="late", group=2)])
    assert svc.snapshot(player, game_id=gid)["game"]["score"] == 2
