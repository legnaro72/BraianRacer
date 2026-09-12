import json
import random

from .config import QUESTIONS_PER_LEVEL, ROOT


class QuestionBank:
    def __init__(self, path=None):
        questions = json.loads((path or ROOT / "data/questions.json").read_text(encoding="utf-8"))
        self.validate(questions)
        self.by_id = {q["id"]: q for q in questions}

    @staticmethod
    def validate(questions):
        if not isinstance(questions, list) or len(questions) < 200:
            raise ValueError("Servono almeno 200 domande valide.")
        ids, texts = set(), set()
        for q in questions:
            if not isinstance(q, dict):
                raise ValueError("Formato domanda non valido.")
            answers = q.get("answers", [])
            if (not isinstance(q.get("id"), str) or q["id"] in ids
                    or not isinstance(q.get("question"), str) or not q["question"].strip()
                    or q["question"].strip().casefold() in texts
                    or not isinstance(answers, list) or len(answers) != 4
                    or any(not isinstance(a, str) or not a.strip() for a in answers)
                    or len({a.strip().casefold() for a in answers}) != 4
                    or type(q.get("correct_index")) is not int or not 0 <= q["correct_index"] < 4
                    or q.get("difficulty") not in (1, 2, 3) or not q.get("category")):
                raise ValueError(f"Domanda non valida: {q.get('id', '?')}")
            ids.add(q["id"])
            texts.add(q["question"].strip().casefold())

    def select(self, level, used, seed):
        rng = random.Random(seed)
        target = 1 if level <= 2 else (2 if level <= 7 else 3)
        remaining = [q for q in self.by_id.values() if q["id"] not in used]
        selected = []
        for _ in range(QUESTIONS_PER_LEVEL):
            if not remaining:
                used.clear()
                remaining = [q for q in self.by_id.values() if q["id"] not in selected]
            weights = [6 if q["difficulty"] == target else 1 for q in remaining]
            q = rng.choices(remaining, weights)[0]
            selected.append(q["id"])
            used.append(q["id"])
            remaining.remove(q)
        return selected

    def public(self, question_id, reveal=False):
        q = self.by_id[question_id]
        return {k: v for k, v in q.items() if reveal or k not in ("correct_index", "explanation")}
