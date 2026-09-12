import pytest

from brain_racer.game_service import GameService, RuleError


def test_dedication_is_persistent_and_editable_without_duplicates(svc, player):
    svc.dedicate(player, "  Auguri Irene e Daniele! ♥  ")
    svc.dedicate(player, "Un viaggio bellissimo insieme! ♥")
    restored = GameService(svc.db, svc.bank, svc.clock)
    entries = restored.snapshot(player, include_dedications=True)["dedications"]
    assert len(entries) == 1
    assert entries[0]["player_id"] == player
    assert entries[0]["message"] == "Un viaggio bellissimo insieme! ♥"


@pytest.mark.parametrize("message", ["", "  ", "x" * 801, None, 12])
def test_invalid_dedications(svc, player, message):
    with pytest.raises(RuleError):
        svc.dedicate(player, message)


def test_each_player_can_only_update_their_own_dedication(svc, player):
    other, _ = svc.register("AltroOspite")
    svc.dedicate(player, "La mia dedica")
    svc.dedicate(other, "Un altro pensiero")
    svc.dedicate(other, "Un pensiero aggiornato")
    entries = svc.snapshot(player, include_dedications=True)["dedications"]
    assert len(entries) == 2
    assert next(d for d in entries if d["player_id"] == player)["message"] == "La mia dedica"


def test_dedications_are_not_downloaded_during_racing(svc, player):
    svc.dedicate(player, "Auguri!")
    assert "dedications" not in svc.snapshot(player)
