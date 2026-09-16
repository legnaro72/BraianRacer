"""Launch with: streamlit run app.py"""
import logging
import os
import secrets
import time
from pathlib import Path

import streamlit as st
import streamlit.components.v2 as components
from sqlalchemy.exc import SQLAlchemyError
from pymongo.errors import PyMongoError

from brain_racer.config import ROOT, difficulty
from brain_racer.database import open_database
from brain_racer.game_service import GameService, RuleError
from brain_racer.photo_service import GoogleDriveStorage, PhotoError, PhotoService
from brain_racer.questions import QuestionBank

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("brain_racer")
st.set_page_config(page_title="Irene & Daniele · La corsa degli sposi", page_icon="🏁", layout="wide",
                   initial_sidebar_state="collapsed")
st.html("""<style>
header[data-testid="stHeader"],footer,#MainMenu{display:none}
.stMainBlockContainer{max-width:1440px;padding:0 24px 20px!important}
[data-testid="stVerticalBlock"]{gap:0}
body{background:#fff8ef} @media(max-width:640px){.stMainBlockContainer{padding:0 10px!important}}
[data-stale="true"]{opacity:1!important}
</style>""")


def setting(key, default=None):
    value = os.environ.get(key)
    if value:
        return value
    try:
        return st.secrets.get(key, default)
    except (FileNotFoundError, st.errors.StreamlitSecretNotFoundError):
        return default


@st.cache_resource
def service():
    bank = QuestionBank()
    db = open_database(setting("DATABASE_URL"), setting("MONGO_URI"), setting("MONGO_DATABASE", "brain_racer"))
    log.info("Brain Racer started; %s questions validated", len(bank.by_id))
    return GameService(db, bank)


@st.cache_resource
def photo_album():
    folder_id = setting("GOOGLE_DRIVE_FOLDER_ID")
    service_account_json = setting("GOOGLE_SERVICE_ACCOUNT_JSON")
    storage = GoogleDriveStorage(folder_id, service_account_json) if folder_id and service_account_json else None
    return PhotoService(service().db, storage)


@st.cache_resource
def renderer(asset_revision):
    assets = ROOT / "assets"
    image_vars = []
    for name in ("cartoon", "dance", "hug", "jump"):
        key = "couple-image" if name == "cartoon" else f"couple-{name}"
        revision = (ROOT / "static" / f"couple-{name}.png").stat().st_mtime_ns
        image_vars.append(f'--{key}:url("app/static/couple-{name}.png?v={revision}")')
    portrait_css = '#brain-app{' + ';'.join(image_vars) + '}'
    return components.component(
        "brain_racer_arcade", html='<div id="brain-app"></div>',
        css=(assets / "game.css").read_text(encoding="utf-8") + portrait_css,
        js="\n".join((assets / f).read_text(encoding="utf-8") for f in ("course.js", "game.js", "ui.js")),
        isolate_styles=True,
    )


def dispatch(svc, command):
    action = command.get("action")
    pid = st.session_state.get("player_id")
    if action == "IDENTIFY":
        st.session_state.booted = True
        pid = svc.identify(command.get("token"))
        if pid:
            st.session_state.player_id = pid
            st.session_state.update(svc.resume(pid))
        return
    if action == "REGISTER" and not pid:
        pid, token = svc.register(command.get("nickname"))
        st.session_state.update(player_id=pid, identity_token=token, booted=True, page="DEDICATIONS")
        if command.get("play"):
            st.session_state.game_id = svc.new_game(pid)
        return
    if not pid:
        return
    gid, rid = st.session_state.get("game_id"), st.session_state.get("room_id")
    if action == "TOKEN_SAVED":
        st.session_state.pop("identity_token", None)
    elif action == "NAV":
        page = command.get("page")
        if page in ("HOME", "LEADERBOARD", "STATS", "HELP", "MULTIPLAYER", "DEDICATIONS", "PHOTOS") and not (gid or rid):
            st.session_state.page = page
    elif action == "DEDICATE":
        svc.dedicate(pid, command.get("message"))
    elif action == "START_SINGLE" and not rid:
        offered_seed = st.session_state.get("next_game_seed")
        requested_seed = command.get("seed")
        seed = requested_seed if type(requested_seed) is int and requested_seed == offered_seed else None
        st.session_state.game_id = svc.new_game(pid, seed=seed)
        st.session_state.pop("next_game_seed", None)
    elif action == "CREATE_ROOM" and not gid:
        st.session_state.room_id = svc.create_room(pid)
    elif action == "JOIN_ROOM" and not gid:
        st.session_state.room_id = svc.join_room(command.get("code"), pid)
    elif action == "READY" and rid:
        svc.ready(rid, pid)
    elif action == "START_ROOM" and rid:
        svc.start_room(rid, pid)
    elif action == "EVENTS":
        target = command.get("game_id")
        if target and (rid or target == gid):
            svc.events(target, pid, command.get("level"), command.get("events", []))
    elif action == "ANSWER":
        target = command.get("game_id")
        if target and (rid or target == gid):
            svc.answer(target, pid, command.get("level"), command.get("index"), command.get("choice"))
    elif action == "NEXT_LEVEL" and gid:
        svc.next_level(gid, pid)
    elif action == "ABORT" and gid:
        svc.abort(gid, pid)
    elif action == "LEAVE_ROOM" and rid:
        svc.leave_room(rid, pid)
        st.session_state.pop("room_id", None)
        st.session_state.page = "HOME"
    elif action == "HOME":
        if gid:
            svc.abort(gid, pid)
            st.session_state.pop("game_id", None)
        if rid:
            svc.leave_room(rid, pid)
            st.session_state.pop("room_id", None)
        st.session_state.page = "HOME"
    elif action == "REPLAY" and gid:
        offered_seed = st.session_state.get("next_replay_seed")
        requested_seed = command.get("seed")
        seed = requested_seed if type(requested_seed) is int and requested_seed == offered_seed else None
        st.session_state.game_id = svc.restart_game(gid, pid, seed=seed)
        st.session_state.pop("next_replay_seed", None)


def quiz_preview(svc, level, seed):
    used = []
    return [svc.bank.public(question_id, reveal=True)
            for question_id in svc.bank.select(level, used, seed + level)]


@st.fragment(run_every=0.5)
def arcade():
    ss = st.session_state
    ss.setdefault("seen_commands", [])
    ss.setdefault("page", "HOME")
    try:
        svc = service()
        packets = ss.get("arcade_component", {}).get("packet") or []
        changed = False
        if isinstance(packets, list):
            for command in packets[-120:]:
                if not isinstance(command, dict) or not isinstance(command.get("id"), str):
                    continue
                if command["id"] in ss.seen_commands:
                    continue
                changed = True
                try:
                    dispatch(svc, command)
                    ss.pop("message", None)
                except RuleError as exc:
                    ss.message = str(exc)
                ss.seen_commands = (ss.seen_commands + [command["id"]])[-240:]
        payload = {"booted": ss.get("booted", False), "page": ss.page,
                   "command_acks": ss.seen_commands, "message": ss.get("message")}
        if ss.get("identity_token"):
            payload["identity_token"] = ss.identity_token
        if ss.get("player_id"):
            try:
                cache_key = (ss.player_id, ss.get("game_id"), ss.get("room_id"), ss.page)
                cached = ss.get("menu_snapshot")
                active = bool(ss.get("game_id") or ss.get("room_id"))
                cache_fresh = (isinstance(cached, (tuple, list)) and len(cached) == 3
                               and cached[0] == cache_key and isinstance(cached[1], (int, float))
                               and isinstance(cached[2], dict) and time.monotonic() - cached[1] < 3)
                if not active and not changed and cache_fresh:
                    payload.update(cached[2])
                    payload["now"] = time.time()
                else:
                    monotonic_now = time.monotonic()
                    previous_phase = ss.get("arcade_phase")
                    previous_room_phase = ss.get("arcade_room_phase")
                    time_sensitive = previous_phase in ("QUIZ", "REVEAL") or previous_room_phase in (
                        "COUNTDOWN", "QUIZ", "REVEAL", "ROUND_RESULTS")
                    write_interval = .45 if time_sensitive else (1.0 if ss.get("room_id") else 2.0)
                    write_due = monotonic_now - float(ss.get("last_snapshot_write", 0) or 0) >= write_interval
                    fast_read = changed or (active and not write_due)
                    snapshot = svc.snapshot(ss.player_id, ss.get("game_id"), ss.get("room_id"),
                                            include_dedications=ss.page == "DEDICATIONS" and not (ss.get("game_id") or ss.get("room_id")),
                                            compact=True, read_only=fast_read)
                    payload.update(snapshot)
                    ss.arcade_phase = snapshot.get("game", {}).get("screen_phase")
                    ss.arcade_room_phase = snapshot.get("room", {}).get("phase")
                    if not fast_read:
                        ss.last_snapshot_write = monotonic_now
                    if not active:
                        ss.menu_snapshot = (cache_key, time.monotonic(), snapshot)
            except RuleError as exc:
                ss.pop("room_id", None)
                ss.pop("game_id", None)
                payload.update(svc.snapshot(ss.player_id))
                payload["message"] = str(exc)
        if ss.get("player_id") and not (ss.get("game_id") or ss.get("room_id")):
            ss.setdefault("next_game_seed", secrets.randbelow(2**31))
            payload["start_template"] = {"seed": ss.next_game_seed, "difficulty": difficulty(1),
                                         "quiz_preview": quiz_preview(svc, 1, ss.next_game_seed)}
        elif payload.get("game", {}).get("screen_phase") == "GAME_OVER" and not ss.get("room_id"):
            ss.setdefault("next_replay_seed", secrets.randbelow(2**31))
            payload["replay_template"] = {"seed": ss.next_replay_seed, "difficulty": difficulty(1),
                                          "quiz_preview": quiz_preview(svc, 1, ss.next_replay_seed)}
        if ss.get("player_id") and ss.page == "PHOTOS" and not (ss.get("game_id") or ss.get("room_id")):
            cached_photos = ss.get("photo_snapshot")
            photos_fresh = (isinstance(cached_photos, tuple) and len(cached_photos) == 2
                            and time.monotonic() - cached_photos[0] < 10)
            if photos_fresh:
                payload["photos"] = cached_photos[1]
            else:
                try:
                    payload["photos"] = photo_album().list_photos()
                    ss.photo_snapshot = (time.monotonic(), payload["photos"])
                except PhotoError as exc:
                    payload.update(photos=[], photo_error=str(exc))
        asset_revision = tuple((ROOT / "assets" / f).stat().st_mtime_ns
                               for f in ("game.css", "course.js", "game.js", "ui.js")) + tuple(
                                   p.stat().st_mtime_ns for p in sorted((ROOT / "static").glob("couple-*.png")))
        renderer(asset_revision)(data=payload, key="arcade_component", on_packet_change=lambda: None,
                   default={"packet": []}, width="stretch")
    except (SQLAlchemyError, PyMongoError, OSError, ValueError, TypeError, KeyError, IndexError):
        log.exception("Unable to update arcade")
        st.error("Il box è momentaneamente occupato. La connessione sarà ritentata automaticamente: attendi qualche secondo.")
        if st.button("Riprova adesso"):
            service.clear()
            st.rerun()


arcade()


def photo_upload_and_supervisor():
    """Native Streamlit file transport; the component remains responsible for gallery UI."""
    ss = st.session_state
    if ss.get("page") != "PHOTOS" or not ss.get("player_id") or ss.get("game_id") or ss.get("room_id"):
        return
    try:
        album = photo_album()
    except PhotoError as exc:
        st.error(str(exc))
        return
    st.subheader("Aggiungi le tue foto")
    if not album.ready:
        st.info("L'album sarà attivato dagli sposi a breve.")
        return
    with st.form("event-photo-upload", clear_on_submit=True):
        files = st.file_uploader("Scegli fino a 20 foto", type=["jpg", "jpeg", "png", "webp", "heic", "heif"],
                                 accept_multiple_files=True,
                                 help="Massimo 12 MB per foto. Puoi selezionarne molte dalla galleria del telefono.")
        submitted = st.form_submit_button("Carica le foto")
    if submitted:
        try:
            items = [(uploaded.name, uploaded.type, uploaded.getvalue()) for uploaded in files]
            with st.spinner("Carichiamo le foto una alla volta…"):
                count = len(album.upload_many(ss.player_id, items))
            ss.pop("photo_snapshot", None)
            st.success(f"{count} foto caricate: grazie per aver condiviso questo ricordo!")
            st.rerun()
        except PhotoError as exc:
            st.error(str(exc))

    configured_password = setting("SUPERVISOR_PASSWORD")
    st.divider()
    with st.expander("Area riservata Irene e Daniele"):
        if not configured_password:
            st.caption("La password supervisore verrà configurata nei Secrets dell'app.")
            return
        entered = st.text_input("Password sposi", type="password", key="supervisor_password")
        if entered and secrets.compare_digest(entered, str(configured_password)):
            st.success("Area supervisore attiva")
            photos = album.list_photos()
            pending = [photo for photo in photos if not photo["approved"]]
            st.caption(f"{len(photos)} foto ricevute · {len(pending)} da selezionare per il Flipbook")
            for photo in photos:
                left, right = st.columns([1, 2])
                with left:
                    st.image(photo["url"], use_container_width=True)
                with right:
                    st.write(f"**{photo['filename']}**")
                    st.caption(f"Caricata da {photo['nickname']} #{photo['tag']}")
                    label = "Rimuovi dal Flipbook" if photo["approved"] else "Pubblica nel Flipbook"
                    if st.button(label, key=f"photo-approval-{photo['id']}"):
                        album.set_approved(photo["id"], not photo["approved"])
                        ss.pop("photo_snapshot", None)
                        st.rerun()


photo_upload_and_supervisor()
