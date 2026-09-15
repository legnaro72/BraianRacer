import hashlib
import logging
import math
import re
import secrets
import time
from copy import deepcopy

from sqlalchemy.orm.attributes import flag_modified

from .config import (COUNTDOWN_SECONDS, DISCONNECT_SECONDS, MATCH_LEVELS, MAX_PLAYERS,
                     QUIZ_SECONDS, RESULT_SECONDS, REVEAL_SECONDS, STARTING_LIVES, difficulty)
from .course import course
from .leaderboard import statistics, top_players
from .models import Dedication, GameEvent, GameSession, Player, QuizAnswer, Room, RoomPlayer
from .scoring import lose_life, quiz_delta, star_delta, winner_key

log = logging.getLogger(__name__)
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class RuleError(ValueError):
    """Safe, Italian feedback for expected invalid actions."""


def save_state(obj):
    flag_modified(obj, "state")


def initial_state(seed, now):
    return {"phase": "DRIVING", "level": 1, "seed": seed, "score": 0,
            "lives": STARTING_LIVES, "stars": 0, "correct": 0, "wrong": 0,
            "used": [], "questions": [], "qindex": 0, "start_at": now + COUNTDOWN_SECONDS,
            "deadline": None, "progress": 0, "collected": [], "hit": [],
            "shield": False, "last_collision": -100, "round_score": 0,
            "balloon_hit": [], "hearts": 0, "round_hearts": 0, "last_bouquet": -100,
            "round_stars": 0, "round_correct": 0, "round_wrong": 0,
            "finished_levels": 0, "driving_ms": 0, "acks": []}


class GameService:
    def __init__(self, database, bank, clock=time.time):
        self.db, self.bank, self.clock = database, bank, clock

    def identify(self, token):
        if not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{64}", token):
            return None
        with self.db.read() as s:
            p = s.first(Player, token_hash=hashlib.sha256(token.encode()).hexdigest())
            return p.id if p else None

    def register(self, nickname):
        nickname = nickname.strip() if isinstance(nickname, str) else ""
        if not re.fullmatch(r"[\w-]{3,16}", nickname, re.UNICODE):
            raise RuleError("Scegli da 3 a 16 caratteri: lettere, numeri, _ oppure -.")
        token = secrets.token_hex(32)
        with self.db.transaction() as s:
            p = Player(nickname=nickname, token_hash=hashlib.sha256(token.encode()).hexdigest(),
                       player_tag=secrets.token_hex(2).upper())
            s.add(p)
            s.flush()
            return p.id, token

    def _owned(self, s, game_id, player_id):
        g = s.get(GameSession, game_id)
        if not g or g.player_id != player_id:
            raise RuleError("Partita non trovata. Torna al garage.")
        return g

    def dedicate(self, player_id, message):
        if not isinstance(message, str):
            raise RuleError("Scrivi un messaggio per Irene e Daniele.")
        message = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", message).strip()
        if not 1 <= len(message) <= 800:
            raise RuleError("La dedica deve contenere da 1 a 800 caratteri.")
        with self.db.transaction() as s:
            if not s.get(Player, player_id):
                raise RuleError("Crea il tuo profilo prima di lasciare una dedica.")
            dedication = s.get(Dedication, player_id)
            if dedication:
                dedication.message = message
                dedication.updated_at = self.clock()
            else:
                s.add(Dedication(player_id=player_id, message=message,
                                 created_at=self.clock(), updated_at=self.clock()))

    def _member(self, s, room_id, player_id):
        room = s.get(Room, room_id)
        member = s.get(RoomPlayer, (room_id, player_id))
        if not room or not member:
            raise RuleError("Non sei in questa stanza.")
        return room, member

    def _members(self, s, room_id):
        return s.find(RoomPlayer, room_id=room_id, order_by=("joined_at", "player_id"))

    def _games(self, s, room_id):
        return s.find(GameSession, room_id=room_id)

    def _active_room(self, s, player_id):
        rooms = [s.get(Room, m.room_id) for m in s.find(RoomPlayer, player_id=player_id)]
        rooms = [r for r in rooms if r and r.status not in ("CLOSED", "MATCH_RESULTS")]
        return max(rooms, key=lambda r: r.created_at) if rooms else None

    def resume(self, player_id):
        with self.db.read() as s:
            room = self._active_room(s, player_id)
            if room:
                return {"room_id": room.id}
            g = s.first(GameSession, player_id=player_id, status="active", mode="single",
                        order_by=("-started_at",))
            return {"game_id": g.id} if g else {}

    def new_game(self, player_id):
        with self.db.transaction() as s:
            existing = s.first(GameSession, player_id=player_id, status="active", mode="single")
            if existing:
                return existing.id
            now = self.clock()
            g = GameSession(player_id=player_id, started_at=now,
                            state=initial_state(secrets.randbelow(2**31), now))
            s.add(g)
            s.flush()
            log.info("Single game started: %s", g.id)
            return g.id

    def _finish(self, g, now, victory=False):
        if g.status != "active":
            return
        st = g.state
        g.status, g.ended_at, g.victory = "finished", now, victory
        g.final_score, g.max_level = st["score"], st["level"]
        g.lives_remaining = st["lives"]
        g.correct_answers, g.wrong_answers = st["correct"], st["wrong"]
        g.stars_collected = st["stars"]
        g.duration_ms = max(0, round((now - g.started_at) * 1000))
        if g.mode == "single":
            st["phase"] = "GAME_OVER"
        save_state(g)

    def abort(self, game_id, player_id):
        with self.db.transaction() as s:
            g = self._owned(s, game_id, player_id)
            if g.mode == "single":
                self._finish(g, self.clock())

    def next_level(self, game_id, player_id):
        with self.db.transaction() as s:
            g = self._owned(s, game_id, player_id)
            if g.mode == "single" and g.state["phase"] == "LEVEL_SUMMARY":
                self._reset_round(g, g.state["level"] + 1, self.clock() + COUNTDOWN_SECONDS)

    def _reset_round(self, g, level, start_at):
        st = g.state
        if st["lives"] <= 0:
            return  # Spectating does not inflate the highest level reached.
        st.update(phase="DRIVING" if st["lives"] > 0 else "ELIMINATED", level=level,
                  start_at=start_at, progress=0, collected=[], hit=[], shield=False,
                  balloon_hit=[], round_hearts=0, last_bouquet=-100,
                  last_collision=-100, round_score=st["score"], round_stars=0,
                  round_correct=0, round_wrong=0, questions=[], qindex=0, acks=[], finish_time=None)
        save_state(g)

    def _score_answer(self, s, g, index, choice, question_ids):
        key = (g.id, g.state["level"], index)
        if s.get(QuizAnswer, key):
            return
        correct = choice == self.bank.by_id[question_ids[index]]["correct_index"]
        delta = quiz_delta(correct)
        s.add(QuizAnswer(game_id=g.id, level=g.state["level"], question_index=index,
                         choice=choice, correct=correct, delta=delta))
        g.state["score"] += delta
        g.state["correct" if correct else "wrong"] += 1
        g.state["round_correct" if correct else "round_wrong"] += 1
        save_state(g)
        s.flush()

    def answer(self, game_id, player_id, level, index, choice):
        if choice is not None and (type(choice) is not int or choice not in range(4)):
            raise RuleError("Risposta non valida.")
        with self.db.transaction() as s:
            g = self._owned(s, game_id, player_id)
            now = self.clock()
            st = g.state
            if g.status != "active" or st["level"] != level:
                return
            if g.mode == "single":
                if st["phase"] != "QUIZ" or st["qindex"] != index:
                    return
                self._score_answer(s, g, index, choice if now < st["deadline"] else None, st["questions"])
                st.update(phase="REVEAL", deadline=now + REVEAL_SECONDS)
                save_state(g)
            else:
                room = s.get(Room, g.room_id)
                rs = room.state
                if (room.status != "QUIZ" or rs["qindex"] != index or st["phase"] != "WAITING"
                        or now >= rs["deadline"]):
                    return
                # Store locked choices privately. Scoring happens only at shared reveal.
                answers = rs.setdefault("answers", {})
                answers.setdefault(g.id, choice)
                save_state(room)
                self._tick_room(s, room, now)

    def events(self, game_id, player_id, level, events):
        if not isinstance(events, list) or len(events) > 120:
            raise RuleError("Aggiornamento della gara non valido.")
        with self.db.transaction() as s:
            g = self._owned(s, game_id, player_id)
            now = self.clock()
            if g.mode == "multi":
                room = s.get(Room, g.room_id)
                if room.status not in ("COUNTDOWN", "DRIVING") or now > room.state["deadline"]:
                    return
            if g.status != "active" or g.state["phase"] != "DRIVING" or g.state["level"] != level:
                return
            st, cfg = g.state, difficulty(level)
            elapsed = now - st["start_at"]
            fastest_course_time = max(0, elapsed) * cfg["maxAcceleration"]
            layout = course(st["seed"], level)
            for event in events:
                if not isinstance(event, dict):
                    continue
                eid, kind = event.get("event_id"), event.get("event_type")
                if not isinstance(eid, str) or not re.fullmatch(r"[a-zA-Z0-9:_-]{1,100}", eid):
                    continue
                if s.get(GameEvent, (g.id, eid)):
                    continue
                payload = event.get("payload", {})
                if not isinstance(payload, dict):
                    continue
                group = payload.get("group")
                valid_group = type(group) is int and 0 <= group < cfg["groups"]
                reachable = valid_group and fastest_course_time >= layout[group]["spawn"] + 0.6 / cfg["speed"] - 0.3
                accepted = False
                if kind == "GAME_STARTED" and elapsed >= -0.2:
                    accepted = True
                elif kind == "PROGRESS_UPDATE":
                    progress = payload.get("progress")
                    bound = max(0, int((fastest_course_time - 1 - 1.2 / cfg["speed"]) / cfg["interval"]) + 1)
                    if type(progress) is int and st["progress"] <= progress <= min(cfg["groups"], bound + 1):
                        st["progress"] = progress
                        accepted = True
                elif kind == "BONUS_COLLECTED" and reachable and group not in st["collected"]:
                    bonus = layout[group]["bonus"]
                    if bonus:
                        st["collected"].append(group)
                        if bonus == "star":
                            st["score"] += star_delta()
                            st["stars"] += 1
                            st["round_stars"] += 1
                        elif bonus == "shield":
                            st["shield"] = True
                        accepted = True
                elif kind == "BALLOON_POPPED" and valid_group and layout[group]["balloon"]:
                    target = layout[group]
                    shot, hit_at, course_t, aim = (payload.get(k) for k in ("shot_at", "at", "course_t", "aim"))
                    numbers = all(type(v) in (int, float) and math.isfinite(v) for v in (shot, hit_at, course_t, aim))
                    if numbers:
                        target_x = .5 + (target["balloonLane"] - 1) * cfg["roadWidth"] / 3
                        if level >= 4:
                            target_x += math.sin(course_t * .12) * .025
                        if (group not in st.setdefault("balloon_hit", [])
                                and 0 <= shot <= hit_at <= elapsed + .5
                                and .03 <= hit_at - shot <= 1.5
                                and shot - st.get("last_bouquet", -100) >= .5
                                and target["spawn"] <= course_t <= target["spawn"] + 1.15 / cfg["speed"]
                                and course_t <= fastest_course_time + .3
                                and 0 <= aim <= 1 and abs(aim - target_x) <= .16):
                            st["balloon_hit"].append(group)
                            st["last_bouquet"] = shot
                            st["score"] += 2
                            st["hearts"] = st.get("hearts", 0) + 1
                            st["round_hearts"] = st.get("round_hearts", 0) + 1
                            accepted = True
                elif kind == "COLLISION" and reachable and group not in st["hit"]:
                    # Use simulation timestamps to validate invulnerability even in a retried batch.
                    hit_at = payload.get("at")
                    if (type(hit_at) in (int, float) and 0 <= hit_at <= elapsed + 0.5
                            and hit_at - st["last_collision"] >= 1.15):
                        st["hit"].append(group)
                        st["last_collision"] = hit_at
                        if st["shield"]:
                            st["shield"] = False
                        else:
                            st["lives"] = lose_life(st["lives"])
                        accepted = True
                elif kind == "LEVEL_COMPLETED" and st["progress"] == cfg["groups"]:
                    minimum = layout[-1]["spawn"] + 1.2 / cfg["speed"]
                    if fastest_course_time >= minimum - 0.5 and st["lives"] > 0:
                        st["finished_levels"] += 1
                        st["driving_ms"] += round(max(0, elapsed) * 1000)
                        st["finish_time"] = round(elapsed, 1)
                        if g.mode == "single":
                            st["questions"] = self.bank.select(level, st["used"], st["seed"] + level)
                            st.update(phase="QUIZ", qindex=0, deadline=now + QUIZ_SECONDS)
                        else:
                            st["phase"] = "WAITING"
                        accepted = True
                if accepted:
                    s.add(GameEvent(game_id=g.id, event_id=eid, event_type=kind))
                    st["acks"] = (st["acks"] + [eid])[-150:]
                    s.flush()
                if st["lives"] <= 0:
                    st["phase"] = "ELIMINATED"
                    if g.mode == "single":
                        self._finish(g, now)
                    break
                if st["phase"] != "DRIVING":
                    break
            save_state(g)

    def _tick_single(self, s, g, now):
        st = g.state
        if g.status != "active":
            return
        if st["phase"] == "QUIZ" and now >= st["deadline"]:
            self._score_answer(s, g, st["qindex"], None, st["questions"])
            st.update(phase="REVEAL", deadline=now + REVEAL_SECONDS)
        elif st["phase"] == "REVEAL" and now >= st["deadline"]:
            if st["qindex"] == 2:
                st["phase"] = "LEVEL_SUMMARY"
            else:
                st.update(phase="QUIZ", qindex=st["qindex"] + 1, deadline=now + QUIZ_SECONDS)
        save_state(g)

    def create_room(self, player_id):
        with self.db.transaction() as s:
            old = self._active_room(s, player_id)
            if old:
                return old.id
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
            while s.first(Room, room_code=code):
                code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
            room = Room(room_code=code, host_player_id=player_id,
                        state={"phase": "LOBBY", "level": 1, "seed": secrets.randbelow(2**31),
                               "used": [], "questions": [], "qindex": 0, "deadline": None,
                               "start_at": None, "answers": {}})
            s.add(room)
            s.flush()
            s.add(RoomPlayer(room_id=room.id, player_id=player_id, last_seen_at=self.clock()))
            log.info("Room created: %s", code)
            return room.id

    def join_room(self, code, player_id):
        code = code.strip().upper() if isinstance(code, str) else ""
        if not re.fullmatch(r"[A-HJ-NP-Z2-9]{6}", code):
            raise RuleError("Il codice stanza contiene 6 lettere o numeri, senza 0, 1, I e O.")
        with self.db.transaction() as s:
            room = s.first(Room, room_code=code)
            if not room:
                raise RuleError("Stanza non trovata. Controlla il codice.")
            if s.get(RoomPlayer, (room.id, player_id)):
                return room.id
            if room.status != "LOBBY":
                raise RuleError("La gara è già iniziata. Crea una nuova stanza.")
            old = self._active_room(s, player_id)
            if old:
                raise RuleError("Lascia la stanza attuale prima di entrare in un'altra.")
            if len(self._members(s, room.id)) >= MAX_PLAYERS:
                raise RuleError("Stanza piena: il limite è di 6 giocatori.")
            s.add(RoomPlayer(room_id=room.id, player_id=player_id, last_seen_at=self.clock()))
            log.info("Player joined room %s", code)
            return room.id

    def ready(self, room_id, player_id):
        with self.db.transaction() as s:
            room, member = self._member(s, room_id, player_id)
            if room.status == "LOBBY":
                member.ready, member.last_seen_at = True, self.clock()

    def start_room(self, room_id, player_id):
        with self.db.transaction() as s:
            room, _ = self._member(s, room_id, player_id)
            if room.status != "LOBBY":
                return
            if room.host_player_id != player_id:
                raise RuleError("Solo l'host può avviare la gara.")
            members = self._members(s, room_id)
            now = self.clock()
            if len(members) < 2 or not all(m.ready and now - m.last_seen_at < DISCONNECT_SECONDS for m in members):
                raise RuleError("Servono almeno 2 giocatori connessi e tutti pronti.")
            start = now + COUNTDOWN_SECONDS
            room.status = "COUNTDOWN"
            room.state.update(phase="COUNTDOWN", start_at=start,
                              deadline=start + difficulty(1)["deadline"])
            for member in members:
                g = GameSession(player_id=member.player_id, room_id=room.id, mode="multi",
                                started_at=now, state=initial_state(room.state["seed"], now))
                s.add(g)
            save_state(room)
            log.info("Match started: %s", room.room_code)

    def leave_room(self, room_id, player_id):
        with self.db.transaction() as s:
            room, member = self._member(s, room_id, player_id)
            if room.status == "LOBBY":
                s.delete(member)
                s.flush()
                remaining = self._members(s, room_id)
                if not remaining:
                    room.status = "CLOSED"
                elif room.host_player_id == player_id:
                    room.host_player_id = remaining[0].player_id
            else:
                for g in self._games(s, room_id):
                    if g.player_id == player_id and g.status == "active":
                        g.state.update(phase="ELIMINATED", lives=0, disconnected=True)
                        save_state(g)
                member.last_seen_at = 0
                self._tick_room(s, room, self.clock())
            log.info("Player left room %s", room.room_code)

    def _set_phase(self, room, phase, deadline):
        room.status = phase
        room.state.update(phase=phase, deadline=deadline)
        save_state(room)

    def _end_match(self, s, room, games, now):
        ranking = sorted(games, key=lambda g: winner_key({**g.state, "player_id": g.player_id}))
        winner = ranking[0].id if ranking else None
        for g in games:
            self._finish(g, now, victory=g.id == winner)
        self._set_phase(room, "MATCH_RESULTS", None)
        log.info("Match finished: %s", room.room_code)

    def _tick_room(self, s, room, now):
        members = self._members(s, room.id)
        if room.status == "LOBBY":
            online = [m for m in members if now - m.last_seen_at < DISCONNECT_SECONDS]
            if online and not any(m.player_id == room.host_player_id for m in online):
                room.host_player_id = online[0].player_id
            for m in members:
                if now - m.last_seen_at >= DISCONNECT_SECONDS:
                    s.delete(m)
            if not online:
                room.status = "CLOSED"
            return
        if room.status in ("MATCH_RESULTS", "CLOSED"):
            return
        games = self._games(s, room.id)
        last_seen = {m.player_id: m.last_seen_at for m in members}
        for g in games:
            if now - last_seen.get(g.player_id, 0) > DISCONNECT_SECONDS and g.state["lives"] > 0:
                g.state.update(lives=0, phase="ELIMINATED", disconnected=True)
                save_state(g)
        rs = room.state
        active = [g for g in games if g.state["lives"] > 0]
        if len(active) <= 1:
            self._end_match(s, room, games, now)
            return
        if room.status == "COUNTDOWN":
            if now >= rs["start_at"]:
                self._set_phase(room, "DRIVING", rs["deadline"])
        if room.status == "DRIVING":
            if all(g.state["phase"] != "DRIVING" for g in active) or now >= rs["deadline"]:
                for g in active:
                    if g.state["phase"] == "DRIVING":
                        g.state["lives"] = lose_life(g.state["lives"])
                        g.state["phase"] = "DNF" if g.state["lives"] else "ELIMINATED"
                        save_state(g)
                eligible = [g for g in games if g.state["phase"] == "WAITING"]
                rs["questions"] = self.bank.select(rs["level"], rs["used"], rs["seed"] + rs["level"])
                rs.update(qindex=0, answers={})
                self._set_phase(room, "QUIZ" if eligible else "ROUND_RESULTS",
                                now + (QUIZ_SECONDS if eligible else RESULT_SECONDS))
        elif room.status == "QUIZ":
            eligible = [g for g in games if g.state["phase"] == "WAITING"]
            answers = rs["answers"]
            if all(g.id in answers for g in eligible) or now >= rs["deadline"]:
                for g in eligible:
                    self._score_answer(s, g, rs["qindex"], answers.get(g.id), rs["questions"])
                self._set_phase(room, "REVEAL", now + REVEAL_SECONDS)
        elif room.status == "REVEAL" and now >= rs["deadline"]:
            if rs["qindex"] == 2:
                self._set_phase(room, "ROUND_RESULTS", now + RESULT_SECONDS)
            else:
                rs.update(qindex=rs["qindex"] + 1, answers={})
                self._set_phase(room, "QUIZ", now + QUIZ_SECONDS)
        elif room.status == "ROUND_RESULTS" and now >= rs["deadline"]:
            if rs["level"] >= MATCH_LEVELS:
                self._end_match(s, room, games, now)
            else:
                rs["level"] += 1
                rs["start_at"] = now + COUNTDOWN_SECONDS
                for g in games:
                    self._reset_round(g, rs["level"], rs["start_at"])
                self._set_phase(room, "COUNTDOWN", rs["start_at"] + difficulty(rs["level"])["deadline"])
        save_state(room)

    def _public_game(self, s, g, room=None):
        state = deepcopy(g.state)
        question_ids = state.pop("questions", [])
        state.pop("used", None)
        state.update(id=g.id, mode=g.mode, status=g.status)
        rs = room.state if room else state
        phase = room.status if room else state["phase"]
        state["screen_phase"] = phase
        if room:
            question_ids = rs.get("questions", [])
            state.update(deadline=rs["deadline"], qindex=rs["qindex"])
        if phase in ("QUIZ", "REVEAL") and question_ids:
            index = rs["qindex"]
            state["question"] = self.bank.public(question_ids[index], reveal=phase == "REVEAL")
            answer = s.get(QuizAnswer, (g.id, state["level"], index))
            state["answered"] = g.id in rs.get("answers", {}) if room else answer is not None
            state["eligible"] = state["phase"] == "WAITING" if room else True
            if phase == "REVEAL" and answer:
                state["answer"] = {"choice": answer.choice, "correct": answer.correct, "delta": answer.delta}
            if room:
                eligible = [x for x in self._games(s, room.id) if x.state["phase"] == "WAITING"]
                state["answer_count"] = len(rs["answers"])
                state["eligible_count"] = len(eligible)
                if phase == "REVEAL":
                    state["correct_count"] = sum(bool(a and a.correct) for a in (
                        s.get(QuizAnswer, (x.id, state["level"], index)) for x in eligible))
        state["difficulty"] = difficulty(state["level"])
        return state

    def snapshot(self, player_id, game_id=None, room_id=None, include_dedications=False):
        now = self.clock()
        with self.db.transaction() as s:
            p = s.get(Player, player_id)
            if not p:
                raise RuleError("Profilo non trovato.")
            if now - p.last_seen_at > 5:
                p.last_seen_at = now
            result = {"now": now, "player": {"id": p.id, "nickname": p.nickname, "tag": p.player_tag}}
            if room_id:
                room, member = self._member(s, room_id, player_id)
                if now - member.last_seen_at >= 3:
                    member.last_seen_at = now
                self._tick_room(s, room, now)
                s.flush()
                result["room"] = {k: deepcopy(v) for k, v in room.state.items()
                                  if k not in ("questions", "answers", "used")}
                result["room"].update(id=room.id, code=room.room_code,
                                      host=room.host_player_id, phase=room.status)
                games = self._games(s, room_id)
                by_player = {g.player_id: g for g in games}
                rows = []
                for m in self._members(s, room_id):
                    mp = s.get(Player, m.player_id)
                    g = by_player.get(m.player_id)
                    gs = g.state if g else initial_state(0, now)
                    rows.append({"player_id": mp.id, "nickname": mp.nickname, "tag": mp.player_tag,
                                 "ready": m.ready, "online": now - m.last_seen_at < 10,
                                 **{k: gs.get(k) for k in ("score", "lives", "level", "progress", "phase",
                                     "finished_levels", "driving_ms", "finish_time", "round_correct", "round_wrong")}})
                result["room"]["players"] = sorted(rows, key=winner_key)
                if player_id in by_player:
                    result["game"] = self._public_game(s, by_player[player_id], room)
            elif game_id:
                g = self._owned(s, game_id, player_id)
                self._tick_single(s, g, now)
                result["game"] = self._public_game(s, g)
            s.flush()
            # Compact data, also used by end screens. No client-submitted totals are trusted.
            result["stats"] = statistics(s, player_id)
            result["leaderboard"] = top_players(s)
            if include_dedications:
                result["dedications"] = []
                for dedication in s.find(Dedication, order_by=("-created_at", "player_id")):
                    author = s.get(Player, dedication.player_id)
                    result["dedications"].append({"player_id": author.id, "nickname": author.nickname,
                        "tag": author.player_tag, "message": dedication.message})
            return result
