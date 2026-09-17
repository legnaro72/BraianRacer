"""Wedding-photo metadata in Atlas and private file transport through Apps Script."""
from __future__ import annotations

import base64
import re
import time
from dataclasses import dataclass
from pathlib import PurePosixPath

import requests

from .models import EventPhoto, Player


class PhotoError(ValueError):
    """A safe error message suitable for an event guest."""


ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILES_PER_UPLOAD = 20
MAX_FILE_BYTES = 10 * 1024 * 1024
UPLOAD_TIMEOUT = (5, 35)
MIME_BY_EXTENSION = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


@dataclass(frozen=True)
class StoredPhoto:
    storage_id: str
    filename: str
    mime_type: str


def safe_filename(value):
    """Keep only a filename: no client path can influence Drive storage."""
    name = PurePosixPath(str(value or "").replace("\\", "/")).name
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(". ")
    if not name:
        raise PhotoError("Una delle foto non ha un nome valido.")
    stem, dot, extension = name.rpartition(".")
    return (stem[:180] + dot + extension[:12]) if dot else name[:200]


def normalized_mime_type(filename, value):
    mime_type = str(value or "").lower().strip()
    if mime_type not in ALLOWED_TYPES:
        mime_type = MIME_BY_EXTENSION.get(PurePosixPath(filename).suffix.lower(), "")
    if mime_type not in ALLOWED_TYPES:
        raise PhotoError("Sono accettate solo foto JPG, PNG o WebP.")
    return mime_type


class AppsScriptDriveStorage:
    """The only Drive transport used by Streamlit: authenticated JSON POST calls."""

    def __init__(self, webapp_url, api_token, requester=None):
        if not isinstance(webapp_url, str) or not webapp_url.startswith("https://") or not api_token:
            raise PhotoError("L'album fotografico non è configurato correttamente.")
        self.webapp_url, self.api_token = webapp_url, api_token
        self._post = requester or requests.post

    def drive_request(self, payload):
        body = {"token": self.api_token, **payload}
        try:
            response = self._post(self.webapp_url, json=body, timeout=UPLOAD_TIMEOUT)
            response.raise_for_status()
            data = response.json()
        except requests.Timeout as exc:
            raise PhotoError("Il caricamento sta impiegando troppo tempo. Controlla la connessione e riprova.") from exc
        except requests.RequestException as exc:
            raise PhotoError("Non riusciamo a contattare l'album fotografico. Riprova tra poco.") from exc
        except ValueError as exc:
            raise PhotoError("L'album fotografico ha restituito una risposta non valida. Riprova.") from exc
        if not isinstance(data, dict) or data.get("ok") is not True:
            raise PhotoError("Non siamo riusciti a completare l'operazione sull'album fotografico. Riprova.")
        return data

    def drive_upload_photo(self, filename, mime_type, content):
        filename = safe_filename(filename)
        data = self.drive_request({
            "action": "upload", "filename": filename, "mimeType": mime_type,
            "data": base64.b64encode(content).decode("ascii"),
        })
        file_id = data.get("fileId")
        if not isinstance(file_id, str) or not file_id:
            raise PhotoError("L'album fotografico non ha confermato il salvataggio della foto.")
        return StoredPhoto(file_id, safe_filename(data.get("filename") or filename), mime_type)

    def drive_get_photo(self, file_id):
        data = self.drive_request({"action": "get", "fileId": file_id})
        encoded = data.get("data")
        if not isinstance(encoded, str):
            raise PhotoError("Questa foto non è più disponibile nell'album.")
        try:
            image = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError) as exc:
            raise PhotoError("Questa foto non può essere letta correttamente.") from exc
        if not image:
            raise PhotoError("Questa foto non è più disponibile nell'album.")
        return image, normalized_mime_type(data.get("filename", ""), data.get("mimeType"))

    def drive_list_photos(self):
        data = self.drive_request({"action": "list"})
        files = data.get("files")
        return files if isinstance(files, list) else []


class PhotoService:
    def __init__(self, database, storage=None, clock=time.time):
        self.db, self.storage, self.clock = database, storage, clock

    @property
    def ready(self):
        return self.storage is not None

    @staticmethod
    def _validate(files):
        if not files:
            raise PhotoError("Scegli almeno una foto.")
        if len(files) > MAX_FILES_PER_UPLOAD:
            raise PhotoError(f"Puoi caricare fino a {MAX_FILES_PER_UPLOAD} foto alla volta.")
        normalized = []
        for name, mime_type, content in files:
            filename = safe_filename(name)
            mime_type = normalized_mime_type(filename, mime_type)
            if not isinstance(content, bytes) or not content or len(content) > MAX_FILE_BYTES:
                raise PhotoError("Ogni foto deve pesare al massimo 10 MB.")
            normalized.append((filename, mime_type, content))
        return normalized

    def upload_many(self, player_id, files):
        if not self.storage:
            raise PhotoError("L'album fotografico non è ancora disponibile.")
        uploaded = []
        for name, mime_type, content in self._validate(files):
            stored = self.storage.drive_upload_photo(name, mime_type, content)
            try:
                with self.db.transaction() as s:
                    if not s.get(Player, player_id):
                        raise PhotoError("Profilo non trovato.")
                    photo = EventPhoto(player_id=player_id, storage_id=stored.storage_id,
                                       filename=stored.filename[:255], mime_type=stored.mime_type,
                                       byte_size=len(content), uploaded_at=self.clock())
                    s.add(photo)
            except PhotoError:
                raise
            except Exception as exc:
                raise PhotoError("La foto è stata ricevuta, ma non abbiamo potuto registrarla nell'album. Avvisa gli sposi.") from exc
            uploaded.append(stored.storage_id)
        return uploaded

    def get_photo(self, storage_id):
        if not self.storage:
            raise PhotoError("L'album fotografico non è ancora disponibile.")
        return self.storage.drive_get_photo(storage_id)

    def list_photos(self, approved_only=False, limit=None):
        with self.db.read() as s:
            rows = s.find(EventPhoto, order_by=("-uploaded_at",))
            result = []
            for photo in rows:
                if approved_only and not photo.approved:
                    continue
                player = s.get(Player, photo.player_id)
                if not player:
                    continue
                result.append({
                    "id": photo.id, "storage_id": photo.storage_id, "filename": photo.filename,
                    "mime_type": photo.mime_type, "uploaded_at": photo.uploaded_at,
                    "approved": photo.approved, "nickname": player.nickname, "tag": player.player_tag,
                })
                if limit is not None and len(result) >= limit:
                    break
            return result

    def set_approved(self, photo_id, approved):
        with self.db.transaction() as s:
            photo = s.get(EventPhoto, photo_id)
            if not photo:
                raise PhotoError("Foto non trovata.")
            photo.approved = bool(approved)
            photo.approved_at = self.clock() if photo.approved else None
        return bool(approved)
