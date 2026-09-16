import pytest

from brain_racer.photo_service import (MAX_FILES_PER_UPLOAD, PhotoError,
                                       PhotoService, StoredPhoto)


class FakeStorage:
    def __init__(self):
        self.files = []

    def upload(self, filename, mime_type, content):
        stored = StoredPhoto(f"drive-{len(self.files)}", filename, mime_type)
        self.files.append((stored, content))
        return stored


def test_shared_album_keeps_metadata_and_supports_flipbook_approval(svc, player):
    storage = FakeStorage()
    album = PhotoService(svc.db, storage, svc.clock)
    uploaded = album.upload_many(player, [
        ("arrivo.jpg", "image/jpeg", b"jpeg"),
        ("brindisi.png", "image/png", b"png"),
    ])
    assert uploaded == ["drive-0", "drive-1"]
    photos = album.list_photos()
    assert [photo["filename"] for photo in photos] == ["brindisi.png", "arrivo.jpg"]
    assert photos[0]["nickname"] == "Pilota_1"
    assert photos[0]["url"].endswith("drive-1&sz=w1200")
    assert album.list_photos(approved_only=True) == []
    assert album.set_approved(photos[0]["id"], True) is True
    assert [photo["id"] for photo in album.list_photos(approved_only=True)] == [photos[0]["id"]]
    assert album.set_approved(photos[0]["id"], False) is False


def test_photo_upload_validation_happens_before_storage(svc, player):
    storage = FakeStorage()
    album = PhotoService(svc.db, storage, svc.clock)
    with pytest.raises(PhotoError):
        album.upload_many(player, [])
    with pytest.raises(PhotoError):
        album.upload_many(player, [("file.pdf", "application/pdf", b"no")])
    with pytest.raises(PhotoError):
        album.upload_many(player, [("x.jpg", "image/jpeg", b"x" * (12 * 1024 * 1024 + 1))])
    with pytest.raises(PhotoError):
        album.upload_many(player, [(f"{i}.jpg", "image/jpeg", b"x")
                                    for i in range(MAX_FILES_PER_UPLOAD + 1)])
    assert storage.files == []


def test_photo_service_requires_a_configured_storage(svc, player):
    album = PhotoService(svc.db)
    assert album.ready is False
    with pytest.raises(PhotoError):
        album.upload_many(player, [("x.jpg", "image/jpeg", b"x")])
