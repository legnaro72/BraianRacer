import base64

import pytest
import requests

from brain_racer.photo_service import (AppsScriptDriveStorage, MAX_FILE_BYTES,
                                       MAX_FILES_PER_UPLOAD, PhotoError,
                                       PhotoService, safe_filename)


class FakeResponse:
    def __init__(self, payload, error=None):
        self.payload, self.error = payload, error

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.payload


def test_apps_script_uses_private_post_json_for_upload_and_get():
    calls = []

    def post(url, *, json, timeout):
        calls.append((url, json, timeout))
        if json["action"] == "upload":
            return FakeResponse({"ok": True, "fileId": "drive-1", "filename": "foto.jpg"})
        return FakeResponse({"ok": True, "fileId": "drive-1", "filename": "foto.jpg",
                             "mimeType": "image/jpeg", "data": base64.b64encode(b"jpeg").decode()})

    storage = AppsScriptDriveStorage("https://script.google.com/macros/s/test/exec", "secret", post)
    stored = storage.drive_upload_photo("C:\\fake\\foto.jpg", "image/jpeg", b"jpeg")
    image, mime_type = storage.drive_get_photo(stored.storage_id)
    assert stored.storage_id == "drive-1"
    assert image == b"jpeg" and mime_type == "image/jpeg"
    assert calls[0][1] == {"token": "secret", "action": "upload", "filename": "foto.jpg",
                           "mimeType": "image/jpeg", "data": base64.b64encode(b"jpeg").decode()}
    assert calls[1][1] == {"token": "secret", "action": "get", "fileId": "drive-1"}


@pytest.mark.parametrize("response", [
    FakeResponse({"ok": False}), FakeResponse("not-json"), FakeResponse({}, requests.HTTPError()),
])
def test_apps_script_errors_are_safe_for_guests(response):
    storage = AppsScriptDriveStorage("https://script.google.com/macros/s/test/exec", "secret",
                                     lambda *args, **kwargs: response)
    with pytest.raises(PhotoError) as exc:
        storage.drive_list_photos()
    assert "secret" not in str(exc.value)


def test_shared_album_keeps_metadata_and_supports_flipbook_approval(svc, player):
    class Storage:
        def drive_upload_photo(self, filename, mime_type, content):
            return type("Stored", (), {"storage_id": "drive-1", "filename": filename, "mime_type": mime_type})()

    album = PhotoService(svc.db, Storage(), svc.clock)
    assert album.upload_many(player, [("arrivo.jpg", "image/jpeg", b"jpeg")]) == ["drive-1"]
    photo = album.list_photos()[0]
    assert photo["nickname"] == "Pilota_1" and "url" not in photo
    assert album.set_approved(photo["id"], True) is True
    assert [row["id"] for row in album.list_photos(approved_only=True)] == [photo["id"]]


def test_photo_upload_validation_and_filename_sanitizing(svc, player):
    album = PhotoService(svc.db)
    assert safe_filename("C:\\fake\\foto bella!.jpg") == "foto bella_.jpg"
    with pytest.raises(PhotoError):
        album.upload_many(player, [])
    with pytest.raises(PhotoError):
        album.upload_many(player, [("file.pdf", "application/pdf", b"no")])
    with pytest.raises(PhotoError):
        album.upload_many(player, [("x.jpg", "image/jpeg", b"x" * (MAX_FILE_BYTES + 1))])
    with pytest.raises(PhotoError):
        album.upload_many(player, [(f"{i}.jpg", "image/jpeg", b"x")
                                    for i in range(MAX_FILES_PER_UPLOAD + 1)])
