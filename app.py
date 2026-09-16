"""Launch with: streamlit run app.py"""
import logging
import os
import time
from pathlib import Path

import streamlit as st
import streamlit.components.v2 as components
from sqlalchemy.exc import SQLAlchemyError
from pymongo.errors import PyMongoError

from brain_racer.config import ROOT
from brain_racer.database import open_database
from brain_racer.game_service import GameService, RuleError
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


@st.cache_resource
def service():
    def setting(key, default=None):
        value = os.environ.get(key)
        if value:
            return value
        try:
            return st.secrets.get(key, default)
        except (FileNotFoundError, st.errors.StreamlitSecretNotFoundError):
            return default
    bank = QuestionBank()
    db = open_database(setting("DATABASE_URL"), setting("MONGO_URI"), setting("MONGO_DATABASE", "brain_racer"))
    log.info("Brain Racer started; %s questions validated", len(bank.by_id))
    return GameService(db, bank)


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
        if page in ("HOME", "LEADERBOARD", "STATS", "HELP", "MULTIPLAYER", "DEDICATIONS") and not (gid or rid):
            st.session_state.page = page
    elif action == "DEDICATE":
        svc.dedicate(pid, command.get("message"))
    elif action == "START_SINGLE" and not rid:
        st.session_state.game_id = svc.new_game(pid)
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
        st.session_state.game_id = svc.restart_game(gid, pid)


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
                if not active and not changed and cached and cached[0] == cache_key and time.monotonic()-cached[1] < 3:
                    payload.update(cached[2])
                    payload["now"] = time.time()
                else:
                    snapshot = svc.snapshot(ss.player_id, ss.get("game_id"), ss.get("room_id"),
                                            include_dedications=ss.page == "DEDICATIONS" and not (ss.get("game_id") or ss.get("room_id")),
                                            compact=True)
                    payload.update(snapshot)
                    if not active:
                        ss.menu_snapshot = (cache_key, time.monotonic(), snapshot)
            except RuleError as exc:
                ss.pop("room_id", None)
                ss.pop("game_id", None)
                payload.update(svc.snapshot(ss.player_id))
                payload["message"] = str(exc)
        asset_revision = tuple((ROOT / "assets" / f).stat().st_mtime_ns
                               for f in ("game.css", "course.js", "game.js", "ui.js")) + tuple(
                                   p.stat().st_mtime_ns for p in sorted((ROOT / "static").glob("couple-*.png")))
        renderer(asset_revision)(data=payload, key="arcade_component", on_packet_change=lambda: None,
                   default={"packet": []}, width="stretch")
    except (SQLAlchemyError, PyMongoError, OSError, ValueError):
        log.exception("Unable to update arcade")
        st.error("Il box è momentaneamente occupato. La connessione sarà ritentata automaticamente: attendi qualche secondo.")
        if st.button("Riprova adesso"):
            service.clear()
            st.rerun()


arcade()
