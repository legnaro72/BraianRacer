"""Shared wedding-photo album, with Google Drive as the durable media store."""
from __future__ import annotations

import io
import json
import time
from dataclasses import dataclass

from .models import EventPhoto, Player


class PhotoError(ValueError):
    """A safe error that can be displayed to an event guest."""


ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
MAX_FILES_PER_UPLOAD = 20
MAX_FILE_BYTES = 12 * 1024 * 1024


@dataclass(frozen=True)
class StoredPhoto:
    storage_id: str
    filename: str
    mime_type: str


class GoogleDriveStorage:
    """Minimal Drive adapter. It only exposes the operations the album needs."""

    def __init__(self, folder_id: str, service_account_json: str):
        if not folder_id or not service_account_json:
            raise PhotoError("L'album fotografico deve ancora essere configurato dagli sposi.")
        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            credentials_info = json.loads(service_account_json)
            credentials = service_account.Credentials.from_service_account_info(
                credentials_info, scopes=["https://www.googleapis.com/auth/drive"])
            self.drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
        except (ImportError, ValueError, TypeError, json.JSONDecodeError) as exc:
            raise PhotoError("Configurazione Google Drive non valida.") from exc
        self.folder_id = folder_id

    def upload(self, filename: str, mime_type: str, content: bytes) -> StoredPhoto:
        from googleapiclient.http import MediaIoBaseUpload
        media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mime_type, resumable=False)
        try:
            result = self.drive.files().create(
                body={"name": filename, "parents": [self.folder_id]}, media_body=media,
                fields="id,name,mimeType", supportsAllDrives=True).execute()
            # The gallery is intentionally shared with all wedding guests. The
            # Drive folder itself may remain private: public access is per file.
            self.drive.permissions().create(
                fileId=result["id"], body={"type": "anyone", "role": "reader"},
                fields="id", supportsAllDrives=True).execute()
        except Exception as exc:  # Google client exposes several transport error types.
            raise PhotoError("Non siamo riusciti a salvare una foto su Google Drive. Riprova.") from exc
        return StoredPhoto(result["id"], result.get("name", filename), result.get("mimeType", mime_type))


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
        for item in files:
            name, mime_type, content = item
            if not isinstance(name, str) or not name.strip():
                raise PhotoError("Una delle foto non ha un nome valido.")
            if mime_type not in ALLOWED_TYPES:
                raise PhotoError("Sono accettate solo foto JPG, PNG, WebP o HEIC.")
            if not content or len(content) > MAX_FILE_BYTES:
                raise PhotoError("Ogni foto deve pesare al massimo 12 MB.")

    def upload_many(self, player_id, files):
        if not self.storage:
            raise PhotoError("L'album fotografico sarà disponibile appena gli sposi completano la configurazione.")
        self._validate(files)
        uploaded = []
        for name, mime_type, content in files:
            stored = self.storage.upload(name, mime_type, content)
            with self.db.transaction() as s:
                if not s.get(Player, player_id):
                    raise PhotoError("Profilo non trovato.")
                photo = EventPhoto(player_id=player_id, storage_id=stored.storage_id,
                                   filename=stored.filename[:255], mime_type=stored.mime_type,
                                   byte_size=len(content), uploaded_at=self.clock())
                s.add(photo)
            uploaded.append(stored.storage_id)
        return uploaded

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
                    "url": f"https://drive.google.com/thumbnail?id={photo.storage_id}&sz=w1200",
                    "view_url": f"https://drive.google.com/file/d/{photo.storage_id}/view",
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
