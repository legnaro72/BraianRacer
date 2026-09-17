"""Wedding-photo metadata in Atlas and private file transport through Apps Script."""
from __future__ import annotations

import base64
import hashlib
import io
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import PurePosixPath
from zoneinfo import ZoneInfo

import requests
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from .models import EventPhoto, Player


class PhotoError(ValueError):
    """A safe error message suitable for an event guest."""


ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
HEIC_TYPES = {"image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"}
MAX_FILES_PER_UPLOAD = 20
MAX_FILE_BYTES = 10 * 1024 * 1024
UPLOAD_TIMEOUT = (5, 35)
MIME_BY_EXTENSION = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
LOGGER = logging.getLogger(__name__)
register_heif_opener()
ROME = ZoneInfo("Europe/Rome")


@dataclass(frozen=True)
class StoredPhoto:
    storage_id: str
    filename: str
    mime_type: str


@dataclass(frozen=True)
class UploadedPhoto:
    storage_id: str
    filename: str
    fingerprint: str


@dataclass(frozen=True)
class UploadFailure:
    filename: str
    message: str


@dataclass(frozen=True)
class UploadBatchResult:
    uploaded: tuple[UploadedPhoto, ...]
    failures: tuple[UploadFailure, ...]


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


def prepare_photo(filename, mime_type, content):
    """Validate an upload and convert iPhone HEIC/HEIF photos to displayable JPEG."""
    filename = safe_filename(filename)
    if not isinstance(content, bytes) or not content or len(content) > MAX_FILE_BYTES:
        raise PhotoError("La foto deve pesare al massimo 10 MB.")
    suffix = PurePosixPath(filename).suffix.lower()
    mime_type = str(mime_type or "").lower().strip()
    if mime_type in HEIC_TYPES or suffix in {".heic", ".heif"}:
        try:
            with Image.open(io.BytesIO(content)) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
                converted = io.BytesIO()
                image.save(converted, format="JPEG", quality=90, optimize=True)
        except (OSError, ValueError) as exc:
            raise PhotoError("La foto HEIC non può essere letta. Prova a esportarla come JPG.") from exc
        content = converted.getvalue()
        filename = str(PurePosixPath(filename).with_suffix(".jpg"))
        mime_type = "image/jpeg"
    else:
        mime_type = normalized_mime_type(filename, mime_type)
    return filename, mime_type, content


def dated_drive_filename(filename, nickname, uploaded_at):
    """Prefix Drive files with local upload date and the player's nickname."""
    filename = safe_filename(filename)
    nickname = re.sub(r"[^A-Za-z0-9_-]", "_", str(nickname or "ospite"))[:32] or "ospite"
    date_prefix = datetime.fromtimestamp(uploaded_at, tz=ROME).strftime("%m%d%y")
    return safe_filename(f"{date_prefix}_{nickname}_{filename}")


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
        except requests.Timeout as exc:
            raise PhotoError("Il caricamento sta impiegando troppo tempo. Controlla la connessione e riprova.") from exc
        except requests.RequestException as exc:
            raise PhotoError("Non riusciamo a contattare l'album fotografico. Riprova tra poco.") from exc

        status_code = response.status_code
        if status_code >= 400:
            # Status only: never log the URL, token, request data or response body.
            LOGGER.warning("Apps Script photo backend returned HTTP %s", status_code)
            if status_code == 413:
                raise PhotoError("La foto è troppo grande per l'album. Prova a ridurne le dimensioni.")
            if status_code == 429:
                raise PhotoError("L'album è momentaneamente occupato. Attendi qualche secondo e riprova.")
            if status_code >= 500:
                raise PhotoError("Google non ha completato il caricamento. Attendi qualche secondo e riprova.")
            raise PhotoError(f"L'album ha rifiutato la richiesta (HTTP {status_code}).")

        try:
            data = response.json()
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

    def drive_delete_photo(self, file_id):
        self.drive_request({"action": "delete", "fileId": file_id})


class PhotoService:
    def __init__(self, database, storage=None, clock=time.time):
        self.db, self.storage, self.clock = database, storage, clock

    @property
    def ready(self):
        return self.storage is not None

    @staticmethod
    def _validate_count(files):
        if not files:
            raise PhotoError("Scegli almeno una foto.")
        if len(files) > MAX_FILES_PER_UPLOAD:
            raise PhotoError(f"Puoi caricare fino a {MAX_FILES_PER_UPLOAD} foto alla volta.")

    @staticmethod
    def _validate_one(name, mime_type, content):
        return prepare_photo(name, mime_type, content)

    def upload_many(self, player_id, files):
        if not self.storage:
            raise PhotoError("L'album fotografico non è ancora disponibile.")
        self._validate_count(files)
        with self.db.read() as s:
            player = s.get(Player, player_id)
            if not player:
                raise PhotoError("Profilo non trovato.")
            nickname = player.nickname
        uploaded, failures = [], []
        for name, mime_type, content in files:
            try:
                fingerprint = hashlib.sha256(content).hexdigest() if isinstance(content, bytes) else ""
                filename, mime_type, content = self._validate_one(name, mime_type, content)
                uploaded_at = self.clock()
                drive_filename = dated_drive_filename(filename, nickname, uploaded_at)
                stored = self.storage.drive_upload_photo(drive_filename, mime_type, content)
            except PhotoError as exc:
                try:
                    failed_name = safe_filename(name)
                except PhotoError:
                    failed_name = "Foto"
                failures.append(UploadFailure(failed_name, str(exc)))
                continue
            try:
                with self.db.transaction() as s:
                    photo = EventPhoto(player_id=player_id, storage_id=stored.storage_id,
                                       filename=filename[:255], mime_type=stored.mime_type,
                                       byte_size=len(content), uploaded_at=uploaded_at)
                    s.add(photo)
            except Exception as exc:
                failures.append(UploadFailure(filename,
                    "Ricevuta da Drive, ma non registrata nell'album: avvisa gli sposi."))
                continue
            uploaded.append(UploadedPhoto(stored.storage_id, filename, fingerprint))
        return UploadBatchResult(tuple(uploaded), tuple(failures))

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
                    "approved": photo.approved, "approved_at": photo.approved_at,
                    "flipbook_order": photo.flipbook_order,
                    "flipbook_locked": bool(photo.flipbook_locked),
                    "nickname": player.nickname, "tag": player.player_tag,
                })
                if limit is not None and len(result) >= limit:
                    break
            if approved_only:
                result.sort(key=lambda photo: (
                    photo["flipbook_order"] is None,
                    photo["flipbook_order"] if photo["flipbook_order"] is not None else 0,
                    photo["approved_at"] or photo["uploaded_at"],
                ))
            return result

    def set_approved(self, photo_id, approved):
        self.set_approved_many([photo_id], approved)
        return bool(approved)

    def set_approved_many(self, photo_ids, approved):
        photo_ids = list(dict.fromkeys(photo_ids))
        if not photo_ids:
            raise PhotoError("Seleziona almeno una foto.")
        with self.db.transaction() as s:
            photos = [s.get(EventPhoto, photo_id) for photo_id in photo_ids]
            if any(photo is None for photo in photos):
                raise PhotoError("Una delle foto selezionate non è più disponibile.")
            approved_at = self.clock() if approved else None
            existing = s.find(EventPhoto)
            next_order = max((photo.flipbook_order for photo in existing
                              if photo.approved and photo.flipbook_order is not None), default=-1) + 1
            for photo in photos:
                photo.approved = bool(approved)
                photo.approved_at = approved_at
                if approved and photo.flipbook_order is None:
                    photo.flipbook_order = next_order
                    next_order += 1
                elif not approved:
                    photo.flipbook_order = None
                    photo.flipbook_locked = False
        return len(photos)

    @staticmethod
    def _ordered_flipbook(photos):
        photos = [photo for photo in photos if photo.approved]
        photos.sort(key=lambda photo: (
            photo.flipbook_order is None,
            photo.flipbook_order if photo.flipbook_order is not None else 0,
            photo.approved_at or photo.uploaded_at,
        ))
        return photos

    def set_flipbook_position(self, photo_id, position):
        with self.db.transaction() as s:
            photos = self._ordered_flipbook(s.find(EventPhoto))
            if not photos:
                raise PhotoError("Il Flipbook non contiene ancora foto.")
            position = int(position)
            if position < 0 or position >= len(photos):
                raise PhotoError("Posizione non valida.")
            moving = next((photo for photo in photos if photo.id == photo_id), None)
            if not moving:
                raise PhotoError("Foto non trovata nel Flipbook.")
            if moving.flipbook_locked:
                raise PhotoError("Sblocca la foto prima di cambiarne la posizione.")
            current = next(index for index, photo in enumerate(photos) if photo.id == photo_id)
            target = photos[position]
            if target.flipbook_locked and target.id != photo_id:
                raise PhotoError("Questa posizione è bloccata da un'altra foto.")
            photos[current], photos[position] = photos[position], photos[current]
            for order, photo in enumerate(photos):
                photo.flipbook_order = order
            return position

    def set_flipbook_locked(self, photo_id, locked):
        with self.db.transaction() as s:
            photos = self._ordered_flipbook(s.find(EventPhoto))
            photo = next((item for item in photos if item.id == photo_id), None)
            if not photo:
                raise PhotoError("Foto non trovata nel Flipbook.")
            for order, item in enumerate(photos):
                item.flipbook_order = order
            photo.flipbook_locked = bool(locked)
            return photo.flipbook_locked

    def move_flipbook_photo(self, photo_id, direction):
        if direction not in (-1, 1):
            raise PhotoError("Spostamento non valido.")
        with self.db.transaction() as s:
            photos = self._ordered_flipbook(s.find(EventPhoto))
            index = next((i for i, photo in enumerate(photos) if photo.id == photo_id), None)
            if index is None:
                raise PhotoError("Foto non trovata nel Flipbook.")
            target = index + direction
            if target < 0 or target >= len(photos):
                return index
            if photos[index].flipbook_locked or photos[target].flipbook_locked:
                raise PhotoError("Sblocca la posizione prima di spostare la foto.")
            photos[index], photos[target] = photos[target], photos[index]
            for order, photo in enumerate(photos):
                photo.flipbook_order = order
            return target

    def delete_photo(self, photo_id):
        if not self.storage:
            raise PhotoError("L'album fotografico non è ancora disponibile.")
        with self.db.read() as s:
            photo = s.get(EventPhoto, photo_id)
            if not photo:
                raise PhotoError("Foto non trovata.")
            storage_id = photo.storage_id
        self.storage.drive_delete_photo(storage_id)
        try:
            with self.db.transaction() as s:
                photo = s.get(EventPhoto, photo_id)
                if photo:
                    s.delete(photo)
        except Exception as exc:
            raise PhotoError("La foto è stata eliminata da Drive, ma il catalogo non si è aggiornato. Avvisa gli sposi.") from exc
