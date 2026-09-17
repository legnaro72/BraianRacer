import base64
import io
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
import requests
from PIL import Image

from brain_racer.photo_service import (AppsScriptDriveStorage, MAX_FILE_BYTES,
                                       MAX_FILES_PER_UPLOAD, PhotoError,
                                       PhotoService, dated_drive_filename,
                                       prepare_photo, safe_filename)


class FakeResponse:
    def __init__(self, payload, error=None, status_code=200):
        self.payload, self.error, self.status_code = payload, error, status_code

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.payload


@pytest.mark.parametrize(("status_code", "expected"), [
    (413, "troppo grande"),
    (429, "momentaneamente occupato"),
    (503, "Google non ha completato"),
])
def test_apps_script_reports_safe_http_failure(status_code, expected):
    storage = AppsScriptDriveStorage(
        "https://script.google.com/macros/s/test/exec", "secret",
        lambda *args, **kwargs: FakeResponse({}, status_code=status_code),
    )

    with pytest.raises(PhotoError, match=expected):
        storage.drive_list_photos()


def test_apps_script_uses_private_post_json_for_upload_and_get():
    calls = []

    def post(url, *, json, timeout):
        calls.append((url, json, timeout))
        if json["action"] == "upload":
            return FakeResponse({"ok": True, "fileId": "drive-1", "filename": "foto.jpg"})
        if json["action"] == "delete":
            return FakeResponse({"ok": True, "fileId": "drive-1"})
        return FakeResponse({"ok": True, "fileId": "drive-1", "filename": "foto.jpg",
                             "mimeType": "image/jpeg", "data": base64.b64encode(b"jpeg").decode()})

    storage = AppsScriptDriveStorage("https://script.google.com/macros/s/test/exec", "secret", post)
    stored = storage.drive_upload_photo("C:\\fake\\foto.jpg", "image/jpeg", b"jpeg")
    image, mime_type = storage.drive_get_photo(stored.storage_id)
    storage.drive_delete_photo(stored.storage_id)
    assert stored.storage_id == "drive-1"
    assert image == b"jpeg" and mime_type == "image/jpeg"
    assert calls[0][1] == {"token": "secret", "action": "upload", "filename": "foto.jpg",
                           "mimeType": "image/jpeg", "data": base64.b64encode(b"jpeg").decode()}
    assert calls[1][1] == {"token": "secret", "action": "get", "fileId": "drive-1"}
    assert calls[2][1] == {"token": "secret", "action": "delete", "fileId": "drive-1"}


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
    uploaded_names = []

    class Storage:
        def drive_upload_photo(self, filename, mime_type, content):
            uploaded_names.append(filename)
            return type("Stored", (), {"storage_id": "drive-1", "filename": filename, "mime_type": mime_type})()

    album = PhotoService(svc.db, Storage(), svc.clock)
    result = album.upload_many(player, [("arrivo.jpg", "image/jpeg", b"jpeg")])
    assert [item.storage_id for item in result.uploaded] == ["drive-1"] and not result.failures
    photo = album.list_photos()[0]
    assert photo["nickname"] == "Pilota_1" and "url" not in photo
    assert photo["filename"] == "arrivo.jpg"
    assert uploaded_names[0].endswith("_Pilota_1_arrivo.jpg")
    assert album.set_approved(photo["id"], True) is True
    assert [row["id"] for row in album.list_photos(approved_only=True)] == [photo["id"]]


def test_drive_filename_has_italian_upload_date_nickname_and_original_name():
    uploaded_at = datetime(2026, 9, 17, 10, 30, tzinfo=ZoneInfo("Europe/Rome")).timestamp()
    assert dated_drive_filename("foto1.jpg", "max", uploaded_at) == "091726_max_foto1.jpg"


def test_supervisor_can_update_multiple_flipbook_photos(svc, player):
    class Storage:
        next_id = 0

        def drive_upload_photo(self, filename, mime_type, content):
            self.next_id += 1
            return type("Stored", (), {"storage_id": f"drive-{self.next_id}",
                                        "filename": filename, "mime_type": mime_type})()

    album = PhotoService(svc.db, Storage(), svc.clock)
    album.upload_many(player, [("uno.jpg", "image/jpeg", b"one"),
                               ("due.jpg", "image/jpeg", b"two")])
    photo_ids = [photo["id"] for photo in album.list_photos()]

    assert album.set_approved_many(photo_ids, True) == 2
    assert len(album.list_photos(approved_only=True)) == 2
    assert album.set_approved_many(photo_ids, False) == 2
    assert album.list_photos(approved_only=True) == []


def test_supervisor_can_choose_flipbook_order(svc, player):
    class Storage:
        next_id = 0

        def drive_upload_photo(self, filename, mime_type, content):
            self.next_id += 1
            return type("Stored", (), {"storage_id": f"drive-order-{self.next_id}",
                                        "filename": filename, "mime_type": mime_type})()

    album = PhotoService(svc.db, Storage(), svc.clock)
    album.upload_many(player, [("uno.jpg", "image/jpeg", b"one"),
                               ("due.jpg", "image/jpeg", b"two")])
    photo_ids = [photo["id"] for photo in album.list_photos()]
    album.set_approved_many(photo_ids, True)
    before = [photo["id"] for photo in album.list_photos(approved_only=True)]

    album.move_flipbook_photo(before[1], -1)

    assert [photo["id"] for photo in album.list_photos(approved_only=True)] == list(reversed(before))


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


def test_heic_photo_is_converted_to_jpeg():
    source = io.BytesIO()
    Image.new("RGB", (8, 6), (240, 120, 80)).save(source, format="HEIF")

    filename, mime_type, content = prepare_photo("iphone.heic", "image/heic", source.getvalue())

    assert filename == "iphone.jpg"
    assert mime_type == "image/jpeg"
    with Image.open(io.BytesIO(content)) as converted:
        assert converted.format == "JPEG" and converted.size == (8, 6)


def test_batch_continues_after_one_photo_fails(svc, player):
    class Storage:
        def drive_upload_photo(self, filename, mime_type, content):
            if filename.endswith("_due.jpg"):
                raise PhotoError("errore controllato")
            return type("Stored", (), {"storage_id": filename, "filename": filename,
                                       "mime_type": mime_type})()

    result = PhotoService(svc.db, Storage(), svc.clock).upload_many(player, [
        ("uno.jpg", "image/jpeg", b"1"), ("due.jpg", "image/jpeg", b"2"),
        ("tre.jpg", "image/jpeg", b"3"), ("quattro.jpg", "image/jpeg", b"4"),
    ])
    assert [item.filename.rsplit("_", 1)[-1] for item in result.uploaded] == [
        "uno.jpg", "tre.jpg", "quattro.jpg"
    ]
    assert [(item.filename, item.message) for item in result.failures] == [("due.jpg", "errore controllato")]


def test_delete_removes_atlas_metadata_only_after_drive_confirms(svc, player):
    class Storage:
        def __init__(self):
            self.fail_delete = False

        def drive_upload_photo(self, filename, mime_type, content):
            return type("Stored", (), {"storage_id": "drive-delete", "filename": filename,
                                       "mime_type": mime_type})()

        def drive_delete_photo(self, file_id):
            if self.fail_delete:
                raise PhotoError("delete non disponibile")

    storage = Storage()
    album = PhotoService(svc.db, storage, svc.clock)
    album.upload_many(player, [("foto.jpg", "image/jpeg", b"jpeg")])
    photo_id = album.list_photos()[0]["id"]
    storage.fail_delete = True
    with pytest.raises(PhotoError):
        album.delete_photo(photo_id)
    assert album.list_photos()[0]["id"] == photo_id
    storage.fail_delete = False
    album.delete_photo(photo_id)
    assert album.list_photos() == []
