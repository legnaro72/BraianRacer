"""Launch with: streamlit run app.py"""
import logging
import os
import secrets
import time
import hashlib
from pathlib import Path

import streamlit as st
import streamlit.components.v2 as components
from sqlalchemy.exc import SQLAlchemyError
from pymongo.errors import PyMongoError

from brain_racer.config import ROOT, difficulty
from brain_racer.database import open_database
from brain_racer.game_service import GameService, RuleError
from brain_racer.photo_service import AppsScriptDriveStorage, PhotoError, PhotoService
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


def photo_album():
    # This wrapper is intentionally not cached: it is cheap, while caching it
    # can retain an instance of an older PhotoService class across a Cloud hot deploy.
    try:
        storage = AppsScriptDriveStorage(
            st.secrets["GOOGLE_DRIVE_WEBAPP_URL"],
            st.secrets["GOOGLE_DRIVE_API_TOKEN"],
        )
    except (KeyError, FileNotFoundError, st.errors.StreamlitSecretNotFoundError):
        storage = None
    return PhotoService(service().db, storage)


@st.cache_data(ttl=15, max_entries=4, show_spinner=False)
def cached_photo_records():
    return photo_album().list_photos()


@st.cache_data(ttl=600, max_entries=300, show_spinner=False)
def cached_photo_bytes(storage_id):
    return photo_album().get_photo(storage_id)


def clear_photo_cache():
    cached_photo_records.clear()
    cached_photo_bytes.clear()


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
                previous_page = ss.page
                try:
                    dispatch(svc, command)
                    ss.pop("message", None)
                except RuleError as exc:
                    ss.message = str(exc)
                ss.seen_commands = (ss.seen_commands + [command["id"]])[-240:]
                if command.get("action") == "NAV" and (
                        previous_page == "PHOTOS" or command.get("page") == "PHOTOS"):
                    ss.photo_page_rerun = True
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
        asset_revision = tuple((ROOT / "assets" / f).stat().st_mtime_ns
                               for f in ("game.css", "course.js", "game.js", "ui.js")) + tuple(
                                   p.stat().st_mtime_ns for p in sorted((ROOT / "static").glob("couple-*.png")))
        renderer(asset_revision)(data=payload, key="arcade_component", on_packet_change=lambda: None,
                   default={"packet": []}, width="stretch")
        if ss.pop("photo_page_rerun", False):
            st.rerun()
    except (SQLAlchemyError, PyMongoError, OSError, ValueError, TypeError, KeyError, IndexError):
        log.exception("Unable to update arcade")
        st.error("Il box è momentaneamente occupato. La connessione sarà ritentata automaticamente: attendi qualche secondo.")
        if st.button("Riprova adesso"):
            service.clear()
            st.rerun()


def photo_upload_and_supervisor():
    """Native file transport and private gallery; all Drive access stays server-side."""
    ss = st.session_state
    if ss.get("page") != "PHOTOS" or not ss.get("player_id") or ss.get("game_id") or ss.get("room_id"):
        return
    st.subheader("Aggiungi le tue foto")
    album = photo_album()
    if not album.ready:
        st.info("L'album fotografico sarà attivato dagli sposi a breve.")
        return
    try:
        photos = cached_photo_records()
        approved = [photo for photo in photos if photo["approved"]]
    except PhotoError:
        photos, approved = [], []
    if not approved:
        ss.photo_show_flipbook = False

    flipbook_label = f"♥ Apri il Flipbook ({len(approved)} foto)" if approved else "♥ Flipbook in preparazione"
    if st.button(flipbook_label, type="primary", disabled=not approved,
                 width="stretch", key="open-wedding-flipbook"):
        ss.photo_show_flipbook = True
        ss.flipbook_page = 0
        st.rerun()
    if ss.get("photo_show_flipbook"):
        st.subheader("♥ Flipbook di Irene e Daniele")
        st.caption("Gli scatti scelti dagli sposi")
        render_flipbook(approved)
        if st.button("← Torna a tutte le foto", width="stretch"):
            ss.photo_show_flipbook = False
            st.rerun()
        return

    feedback = ss.get("photo_feedback")
    if isinstance(feedback, dict) and time.monotonic() - feedback.get("at", 0) < 8:
        getattr(st, feedback.get("kind", "info"))(feedback.get("message", ""))
    else:
        ss.pop("photo_feedback", None)
    with st.form("event-photo-upload", clear_on_submit=True):
        files = st.file_uploader("Scegli fino a 20 foto", type=["jpg", "jpeg", "png", "webp", "heic", "heif"],
                                 accept_multiple_files=True,
                                 help="JPG, PNG, WebP o HEIC. Massimo 10 MB per foto. Puoi selezionarne molte dalla galleria del telefono.")
        submitted = st.form_submit_button("Carica le foto")
    if submitted:
        try:
            items = [(uploaded.name, uploaded.type, uploaded.getvalue()) for uploaded in files]
            seen = set(ss.get("photo_upload_fingerprints", []))
            fresh_items = [item for item in items if hashlib.sha256(item[2]).hexdigest() not in seen]
            if not fresh_items:
                st.info("Queste foto sono già state caricate in questa sessione.")
                return
            with st.spinner("Carichiamo le foto una alla volta…"):
                result = album.upload_many(ss.player_id, fresh_items)
            if result.uploaded:
                ss.photo_upload_fingerprints = list(seen | {
                    item.fingerprint for item in result.uploaded
                })[-200:]
                clear_photo_cache()
            loaded, failed = len(result.uploaded), len(result.failures)
            if failed:
                details = "; ".join(f"{item.filename}: {item.message}" for item in result.failures[:4])
                message = f"Caricate {loaded} foto su {loaded + failed}. {details}"
                ss.photo_feedback = {"kind": "warning", "message": message, "at": time.monotonic()}
                st.warning(message)
            else:
                message = f"{loaded} foto caricate: grazie per aver condiviso questo ricordo!"
                ss.photo_feedback = {"kind": "success", "message": message, "at": time.monotonic()}
                st.success(message)
        except PhotoError as exc:
            st.error(str(exc))

    try:
        configured_password = st.secrets["SUPERVISOR_PASSWORD"]
    except (KeyError, FileNotFoundError, st.errors.StreamlitSecretNotFoundError):
        configured_password = None
    st.divider()
    with st.expander("Area riservata Irene e Daniele"):
        if not configured_password:
            st.caption("Area supervisore non ancora configurata.")
        else:
            entered = st.text_input("Password sposi", type="password", key="supervisor_password")
            is_supervisor = entered and secrets.compare_digest(entered, str(configured_password))
        if configured_password and is_supervisor:
            st.success("Area supervisore attiva")
            pending = [photo for photo in photos if not photo["approved"]]
            st.caption(f"{len(photos)} foto ricevute · {len(pending)} da selezionare per il Flipbook")
            select_all, clear_selection = st.columns(2)
            if select_all.button("Seleziona tutte", disabled=not photos, width="stretch"):
                for photo in photos:
                    ss[f"supervisor-photo-{photo['id']}"] = True
            if clear_selection.button("Annulla selezione", disabled=not photos, width="stretch"):
                for photo in photos:
                    ss.pop(f"supervisor-photo-{photo['id']}", None)
            selected = []
            for photo in photos:
                left, right = st.columns([1, 2])
                with left:
                    render_photo(photo, "Anteprima non disponibile")
                with right:
                    st.write(f"**{photo['filename']}**")
                    st.caption(f"Caricata da {photo['nickname']} #{photo['tag']}")
                    if photo["approved"]:
                        st.caption("♥ Già nel Flipbook")
                    if st.checkbox("Seleziona", key=f"supervisor-photo-{photo['id']}"):
                        selected.append(photo["id"])

            if photos:
                st.caption(f"{len(selected)} foto selezionate")
                publish, remove, delete = st.columns(3)
                if publish.button("Pubblica nel Flipbook", disabled=not selected,
                                  type="primary", width="stretch"):
                    album.set_approved_many(selected, True)
                    clear_photo_cache()
                    for photo_id in selected:
                        ss.pop(f"supervisor-photo-{photo_id}", None)
                    st.rerun()
                if remove.button("Rimuovi dal Flipbook", disabled=not selected, width="stretch"):
                    album.set_approved_many(selected, False)
                    clear_photo_cache()
                    for photo_id in selected:
                        ss.pop(f"supervisor-photo-{photo_id}", None)
                    st.rerun()
                if delete.button("Elimina selezionate", disabled=not selected, width="stretch"):
                    ss.photo_delete_confirm = tuple(selected)
                    st.rerun()

            pending_delete = ss.get("photo_delete_confirm", ())
            delete_selection = (tuple(pending_delete) if isinstance(pending_delete, (list, tuple, set))
                                else ((pending_delete,) if pending_delete else ()))
            if delete_selection:
                st.warning(f"{len(delete_selection)} foto saranno rimosse da Drive e dall'album.")
                confirm, cancel = st.columns(2)
                if confirm.button("Conferma eliminazione", type="primary", width="stretch"):
                    deleted, failures = 0, []
                    with st.spinner("Eliminazione in corso…"):
                        for photo_id in delete_selection:
                            try:
                                album.delete_photo(photo_id)
                                deleted += 1
                            except PhotoError as exc:
                                failures.append(str(exc))
                    clear_photo_cache()
                    cached_photo_bytes.clear()
                    ss.pop("photo_delete_confirm", None)
                    for photo_id in delete_selection:
                        ss.pop(f"supervisor-photo-{photo_id}", None)
                    if failures:
                        message = f"Eliminate {deleted} foto su {len(delete_selection)}. {failures[0]}"
                        ss.photo_feedback = {"kind": "warning", "message": message, "at": time.monotonic()}
                    else:
                        ss.photo_feedback = {"kind": "success", "message": f"{deleted} foto eliminate.",
                                             "at": time.monotonic()}
                    st.rerun()
                if cancel.button("Annulla", width="stretch"):
                    ss.pop("photo_delete_confirm", None)
                    st.rerun()

    st.subheader("Tutte le foto della festa")
    if photos:
        photo_columns(photos, "Foto non disponibile")
    else:
        st.caption("La galleria aspetta il primo scatto.")


def render_photo(photo, unavailable):
    try:
        image, _ = cached_photo_bytes(photo["storage_id"])
        st.image(image, caption=f"{photo['filename']} · {photo['nickname']} #{photo['tag']}", width="stretch")
    except PhotoError:
        st.caption(unavailable)


def render_flipbook(photos):
    """Show approved photos as a simple touch-friendly paged album."""
    if not photos:
        st.caption("Il Flipbook aspetta il primo scatto scelto dagli sposi.")
        return
    ss = st.session_state
    total_pages = len(photos) + 2
    page = max(0, min(int(ss.get("flipbook_page", 0)), total_pages - 1))
    previous, counter, following = st.columns([1, 1.4, 1])
    go_previous = previous.button("← Precedente", disabled=page == 0, width="stretch")
    go_next = following.button("Successiva →", disabled=page == total_pages - 1, width="stretch")
    if go_previous:
        page -= 1
        ss.flipbook_page = page
    if go_next:
        page += 1
        ss.flipbook_page = page
    counter.markdown(f"<p style='text-align:center'><strong>Pagina {page + 1} di {total_pages}</strong></p>",
                     unsafe_allow_html=True)
    if page == 0:
        st.markdown(
            "<div style='text-align:center;padding:1.1rem .5rem .8rem'>"
            "<div style='font-family:Georgia,serif;font-size:clamp(1.05rem,3.7vw,1.65rem);"
            "color:#c06b51;margin:.3rem 0'>12 Settembre 2026</div>"
            "<div style='font-family:Georgia,serif;font-size:clamp(1.45rem,5vw,2.6rem);"
            "color:#9b4165;font-weight:700'>Irene e Daniele</div>"
            "<div style='font-size:clamp(1rem,3.5vw,1.45rem);letter-spacing:.12em;"
            "color:#725764'>OGGI SPOSI</div></div>",
            unsafe_allow_html=True,
        )
        st.image(ROOT / "static" / "couple-cartoon.png", width="stretch")
    elif page == total_pages - 1:
        st.image(ROOT / "static" / "bouquet-finale.png", width="stretch")
        st.markdown(
            "<div style='text-align:center;padding:.8rem .5rem 1.4rem;"
            "font-family:Georgia,serif;font-size:clamp(1.5rem,5vw,2.8rem);"
            "color:#9b4165;font-weight:700'>Non FINE ma INIZIO</div>",
            unsafe_allow_html=True,
        )
    else:
        # Keep navigation safe if a browser session carries an index from an older release.
        photo_index = max(0, min(page - 1, len(photos) - 1))
        render_photo(photos[photo_index], "Foto non disponibile")


def photo_columns(photos, unavailable):
    for index in range(0, len(photos), 3):
        columns = st.columns(3)
        for column, photo in zip(columns, photos[index:index + 3]):
            with column:
                render_photo(photo, unavailable)
                if photo["approved"]:
                    st.caption("♥ Nel Flipbook")


arcade()
photo_upload_and_supervisor()
