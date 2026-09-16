import json
import shutil
import subprocess
from copy import deepcopy

import pytest

from brain_racer.config import ROOT, difficulty
from brain_racer.course import course
from brain_racer.questions import QuestionBank


def test_entire_bank_is_valid_and_diverse():
    bank = QuestionBank()
    assert len(bank.by_id) == 448
    assert all(sum(q["category"] == category for q in bank.by_id.values()) == 28
               for category in {q["category"] for q in bank.by_id.values()})
    assert len({q["category"] for q in bank.by_id.values()}) == 16
    assert {q["difficulty"] for q in bank.by_id.values()} == {1, 2, 3}


@pytest.mark.parametrize("mutation", ["id", "answers", "index", "empty", "duplicate"])
def test_invalid_data_rejected(mutation):
    questions = deepcopy(list(QuestionBank().by_id.values()))
    if mutation == "id": questions[1]["id"] = questions[0]["id"]
    if mutation == "answers": questions[0]["answers"].pop()
    if mutation == "index": questions[0]["correct_index"] = 4
    if mutation == "empty": questions[0]["question"] = " "
    if mutation == "duplicate": questions[0]["answers"][1] = questions[0]["answers"][0]
    with pytest.raises(ValueError): QuestionBank.validate(questions)


def test_no_repetition_until_pool_exhaustion():
    bank, used, selected = QuestionBank(), [], []
    for level in range(1, 151):
        selected.extend(bank.select(level, used, 831 + level))
    assert len(set(selected[:448])) == 448
    assert len(used) == 2  # The cycle resets only after the last unused question.


def test_deterministic_questions_and_courses():
    bank = QuestionBank()
    assert bank.select(5, [], 87) == bank.select(5, [], 87)
    assert course(87, 5) == course(87, 5)
    assert course(87, 5) != course(88, 5)


@pytest.mark.skipif(not shutil.which("node"), reason="Node is optional, only used for JS parity validation")
def test_python_javascript_course_parity():
    js = (ROOT / "assets/course.js").read_text()
    for level in (1, 3, 5, 15, 1000):
        script = js + f"\nconsole.log(JSON.stringify(createCourse(1987465413,{level},{json.dumps(difficulty(level))})));"
        result = subprocess.run(["node", "-e", script], check=True, capture_output=True, text=True)
        assert json.loads(result.stdout) == course(1987465413, level)


def test_difficulty_curve_bounded():
    assert difficulty(1)["groups"] == 20
    assert difficulty(1)["speed"] < difficulty(5)["speed"]
    assert not difficulty(2)["moving"] and difficulty(3)["moving"]
    assert difficulty(10000)["interval"] >= 1.2
    assert difficulty(10000)["roadWidth"] >= .66
