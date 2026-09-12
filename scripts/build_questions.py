"""Compile the curated Italian source bank; shuffle answers reproducibly."""
import json
import random
from pathlib import Path

root = Path(__file__).resolve().parent.parent
questions = []
for line in (root / "data/questions_source.tsv").read_text(encoding="utf-8").splitlines():
    if not line.strip() or line.startswith("#"):
        continue
    category, difficulty, question, correct, b, c, d, *explanation = line.split("|")
    answers = [correct, b, c, d]
    random.Random(len(questions) + 413).shuffle(answers)
    questions.append({"id": f"br_{len(questions) + 1:03d}", "category": category,
                      "difficulty": int(difficulty), "question": question,
                      "answers": answers, "correct_index": answers.index(correct),
                      "explanation": explanation[0] if explanation else ""})
(root / "data/questions.json").write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Compiled {len(questions)} questions")
